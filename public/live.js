"use strict";

(() => {
  const get = (id) => document.getElementById(id);
  const { LiveWire: wire, BenchmarkCore: core } = window;
  if (!wire || !core) return;
  const providerNames = { deepgram: "Nova-3", gemini: "Gemini 3.8 Live" };
  const durationLimit = 120;
  const sampleRate = 16000;
  const recordingSelect = get("live-recording");
  const localFileId = "local-file";
  const realRecordings = [1, 2, 3].map((number) => ({
    id: `real-call-${number}`, label: `Real call ${number}`,
    audio: `assets/real-calls/real_call_0${number}.mp3`,
  }));
  const demoRecordings = (window.DEMO_DATA?.clips || []).map(({ id, scenarioLabel, label, audio }) => ({
    id, label: `${scenarioLabel} · ${label}`, audio,
  }));
  const recordings = new Map([...realRecordings, ...demoRecordings].map((recording) => [recording.id, recording]));
  let localFile = null;
  let current = null;
  let lastRun = null;

  const make = (tag, value, classes) => {
    const element = document.createElement(tag);
    if (value) element.textContent = value;
    if (classes) element.className = classes;
    return element;
  };

  function refreshRecordings(selected = recordingSelect.value) {
    recordingSelect.replaceChildren();
    const groups = [
      ["Real calls", realRecordings],
      ["Simulated recordings", demoRecordings],
      ["On this device", localFile ? [{ id: localFileId, label: localFile.name }] : []],
    ];
    for (const [label, items] of groups) {
      if (!items.length) continue;
      const group = make("optgroup");
      group.label = label;
      for (const item of items) {
        const option = make("option", item.label);
        option.value = item.id;
        group.append(option);
      }
      recordingSelect.append(group);
    }
    recordingSelect.value = selected || realRecordings[0].id;
  }

  const states = {};
  for (const [provider, label] of Object.entries(providerNames)) {
    const panel = make("article", null, `transcript ${provider}`);
    const header = make("header");
    const title = make("div");
    title.append(make("p", provider === "deepgram" ? "Deepgram" : "Google", "provider"), make("h3", label));
    const status = make("span", "Ready", "feed-status");
    header.append(title, status);
    const metrics = make("dl", null, "feed-metrics");
    const fields = {};
    for (const [key, name] of [
      ["first", "First text"], ["firstSinhala", "First Sinhala"], ["firstFinal", "First final"], ["interimCount", "Interim events"],
    ]) {
      const cell = make("div");
      fields[key] = make("dd", key === "interimCount" ? "0" : "—");
      cell.append(make("dt", name), fields[key]);
      metrics.append(cell);
    }
    const transcript = make("div", "Waiting for audio.", "transcript-body");
    transcript.lang = "si";
    transcript.tabIndex = 0;
    transcript.setAttribute("aria-label", `${label} live transcript`);
    panel.append(header, metrics, transcript);
    get("live-feeds").append(panel);
    states[provider] = { status, fields, transcript };
  }

  function render(run, provider) {
    const ui = states[provider];
    const observed = core.observe(run.events[provider], Infinity);
    for (const [key, field] of Object.entries(ui.fields)) {
      const value = observed[key];
      field.textContent = key === "interimCount" ? value : value === null ? "—" : `${value.toFixed(2)} s`;
    }
    const clean = (text) => get("live-rules").checked ? core.clean(text) : text;
    const pending = "Waiting for transcript.";
    ui.transcript.replaceChildren();
    if (!observed.raw && !observed.interim) {
      ui.transcript.append(make("span", pending, "waiting"));
    } else {
      if (observed.raw) ui.transcript.append(make("span", clean(observed.raw)));
      if (observed.interim) ui.transcript.append(make("span", `${observed.raw ? " " : ""}${clean(observed.interim)}`, "interim"));
    }
    ui.transcript.scrollTop = ui.transcript.scrollHeight;
  }

  function setBusy(busy) {
    for (const id of ["live-mic", "live-recording", "live-file"]) get(id).disabled = busy;
    get("live-stream").disabled = busy || !recordingSelect.value;
    get("live-stop").disabled = !busy;
  }

  function releaseAudio(run) {
    run.stream?.getTracks().forEach((track) => track.stop());
    if (run.context && run.context.state !== "closed") run.context.close().catch(() => {});
    clearInterval(run.clock);
    clearTimeout(run.frameTimer);
  }

  function finish(run, text) {
    if (current !== run) return;
    current = null;
    run.controller.abort();
    releaseAudio(run);
    for (const [provider, socket] of Object.entries(run.sockets)) {
      if (socket.readyState < WebSocket.CLOSING) socket.close();
      if (run.ready.has(provider) && !run.failed.has(provider)) {
        states[provider].status.textContent = core.observe(run.events[provider], Infinity).first === null
          ? "No text" : "Complete";
      }
    }
    for (const { status } of Object.values(states)) {
      if (status.textContent === "Connecting") status.textContent = "Unavailable";
    }
    get("live-status").textContent = text;
    setBusy(false);
  }

  function sendFrame(run, bytes) {
    if (run !== current || !bytes.byteLength) return;
    if (run.started === null) run.started = performance.now();
    let sent = 0;
    for (const [provider, socket] of Object.entries(run.sockets)) {
      if (!run.ready.has(provider) || socket.readyState !== WebSocket.OPEN) continue;
      if (socket.bufferedAmount > 65536) {
        run.failed.add(provider);
        states[provider].status.textContent = "Network fell behind";
        socket.close();
        continue;
      }
      try { socket.send(wire.audioPacket(provider, bytes)); sent++; }
      catch {
        run.failed.add(provider);
        states[provider].status.textContent = "Could not send audio";
      }
    }
    if (!sent && !run.stopping) stop("Both streams disconnected.");
  }

  function connect(run, provider, token, setup) {
    const spec = wire.connection(provider, token, setup);
    return new Promise((resolve) => {
      const socket = new WebSocket(spec.url, spec.protocols);
      run.sockets[provider] = socket;
      socket.binaryType = "arraybuffer";
      const timeout = setTimeout(() => {
        states[provider].status.textContent = "Connection timed out";
        if (socket.readyState < WebSocket.CLOSING) socket.close();
        resolve();
      }, 8000);
      const ready = () => {
        clearTimeout(timeout);
        if (current === run) {
          run.ready.add(provider);
          states[provider].status.textContent = "Streaming";
        }
        resolve();
      };
      socket.addEventListener("open", () => {
        if (spec.setup) socket.send(spec.setup);
        else ready();
      });
      socket.addEventListener("message", ({ data }) => {
        if (current !== run) return;
        try {
          const message = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
          if (provider === "gemini" && "setupComplete" in message) ready();
          if (run.started === null) return;
          const events = wire.transcripts(provider, message, (performance.now() - run.started) / 1000);
          if (events.length) {
            run.events[provider].push(...events);
            render(run, provider);
          }
        } catch { /* Ignore unsupported provider messages. */ }
      });
      socket.addEventListener("close", ({ code }) => {
        clearTimeout(timeout);
        if (current === run && !run.stopping && !run.failed.has(provider)) {
          run.failed.add(provider);
          states[provider].status.textContent = `Disconnected (${code})`;
          if (run.started !== null && Object.values(run.sockets).every((s) => s.readyState !== WebSocket.OPEN)) {
            stop("Both streams disconnected.");
          }
        }
        resolve();
      });
    });
  }

  function fileFrames(run, buffer) {
    const pcm = new Int16Array(buffer.length);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    for (let i = 0; i < pcm.length; i++) {
      let total = 0;
      for (const channel of channels) total += channel[i];
      const value = Math.max(-1, Math.min(1, total / channels.length));
      pcm[i] = value * (value < 0 ? 32768 : 32767);
    }
    let offset = 0;
    const startAt = performance.now();
    function next() {
      if (current !== run || run.stopping) return;
      if (offset >= pcm.length) return stop();
      sendFrame(run, pcm.slice(offset, offset + 320).buffer);
      offset += 320;
      run.frameTimer = setTimeout(next, Math.max(0, offset / sampleRate * 1000 - (performance.now() - startAt)));
    }
    next();
  }

  async function stop(message = "Test complete.") {
    const run = current;
    if (!run || run.stopping) return;
    run.stopping = true;
    get("live-stop").disabled = true;
    clearTimeout(run.frameTimer);
    clearInterval(run.clock);
    if (run.started === null) return finish(run, message === "Test complete." ? "Test cancelled." : message);
    get("live-status").textContent = "Finishing transcripts…";
    if (run.worklet) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 150);
        run.flushed = () => { clearTimeout(timer); resolve(); };
        run.worklet.port.postMessage("stop");
      });
    }
    releaseAudio(run);
    const open = [];
    for (const [provider, socket] of Object.entries(run.sockets)) {
      if (socket.readyState === WebSocket.OPEN) {
        try { socket.send(wire.endPacket(provider)); open.push(socket); }
        catch { /* Connection already closed. */ }
      }
    }
    if (open.length) await new Promise((resolve) => setTimeout(resolve, 5000));
    finish(run, message);
  }

  async function start(mode) {
    if (current) return;
    const selected = recordingSelect.value;
    const file = selected === localFileId ? localFile : null;
    const clip = recordings.get(selected);
    if (mode === "recording" && !file && !clip) {
      return get("live-status").textContent = "Choose a recording to stream.";
    }
    if (mode === "mic" && !navigator.mediaDevices?.getUserMedia) {
      return get("live-status").textContent = "Microphone access requires HTTPS or localhost.";
    }
    const run = {
      started: null, stopping: false, sockets: {}, ready: new Set(), failed: new Set(),
      events: { deepgram: [], gemini: [] }, controller: new AbortController(),
    };
    current = lastRun = run;
    get("live-clock").textContent = "0:00";
    setBusy(true);
    get("live-status").textContent = mode === "mic" ? "Waiting for microphone permission…" : "Preparing the recording…";
    for (const provider of Object.keys(states)) {
      states[provider].status.textContent = "Connecting";
      render(run, provider);
    }
    try {
      const context = new AudioContext({ sampleRate });
      run.context = context;
      await context.resume();
      if (current !== run) return;
      if (context.sampleRate !== sampleRate) throw new Error("This browser cannot provide 16 kHz capture.");
      let buffer;
      if (mode === "recording") {
        const source = file || await fetch(clip.audio, { signal: run.controller.signal });
        if (!file && !source.ok) throw new Error("Could not load the selected recording.");
        buffer = await context.decodeAudioData(await source.arrayBuffer());
        if (buffer.duration > durationLimit) throw new Error("Choose a recording no longer than two minutes.");
      } else {
        const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false });
        if (current !== run) return media.getTracks().forEach((track) => track.stop());
        run.stream = media;
        await context.audioWorklet.addModule("mic-pcm.js");
      }
      if (current !== run) return;
      get("live-status").textContent = "Opening provider streams…";
      const response = await fetch("/api/live-session", {
        method: "POST", signal: run.controller.signal, cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && !payload.errors) {
        throw new Error(payload.error || "Live testing requires the configured Vercel API endpoint.");
      }
      if (current !== run) return;
      for (const [provider, error] of Object.entries(payload.errors || {})) {
        if (states[provider]) states[provider].status.textContent = error;
      }
      await Promise.all(Object.entries(payload.tokens || {}).map(([provider, token]) =>
        connect(run, provider, token, payload.geminiSetup)
      ));
      if (current !== run) return;
      if (!Object.values(run.sockets).some((socket) => socket.readyState === WebSocket.OPEN) || !run.ready.size) {
        throw new Error("Neither live provider connected. See the provider status below.");
      }
      const activeProviders = [...run.ready].filter((provider) => run.sockets[provider].readyState === WebSocket.OPEN);
      const destination = activeProviders.map((provider) => providerNames[provider]).join(" and ");
      get("live-status").textContent = mode === "mic"
        ? `Streaming your microphone to ${destination}…`
        : `Streaming the recording at 1× to ${destination}…`;
      const waitingSince = performance.now();
      run.clock = setInterval(() => {
        if (run.started === null) {
          if (performance.now() - waitingSince > 5000) stop("No audio reached the live streams.");
          return;
        }
        const seconds = Math.floor((performance.now() - run.started) / 1000);
        get("live-clock").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
        if (seconds >= durationLimit) stop("Two-minute test complete.");
      }, 200);
      if (mode === "recording") fileFrames(run, buffer);
      else {
        const source = context.createMediaStreamSource(run.stream);
        const worklet = run.worklet = new AudioWorkletNode(context, "benchmark-pcm");
        const silent = context.createGain();
        silent.gain.value = 0;
        worklet.port.onmessage = ({ data }) => data === "flushed" ? run.flushed?.() : sendFrame(run, data);
        for (const track of run.stream.getAudioTracks()) track.addEventListener("ended", () => stop("Microphone ended."));
        source.connect(worklet).connect(silent).connect(context.destination);
      }
    } catch (error) {
      const message = error.name === "NotAllowedError" ? "Microphone permission was denied."
        : error.name === "EncodingError" ? "The browser could not decode that audio file."
          : error.name === "NotFoundError" ? "No microphone was found."
            : error.message;
      finish(run, message);
    }
  }

  get("live-mic").addEventListener("click", () => start("mic"));
  get("live-stream").addEventListener("click", () => start("recording"));
  get("live-file").addEventListener("change", ({ target }) => {
    const file = target.files?.[0];
    target.value = "";
    if (!file) return;
    if (file.size > 20000000) {
      get("live-status").textContent = "Choose an audio file no larger than 20 MB.";
      return;
    }
    localFile = file;
    refreshRecordings(localFileId);
    get("live-status").textContent = "Audio file ready. Select Stream recording to run the live test.";
  });
  get("live-stop").addEventListener("click", () => stop());
  get("live-rules").addEventListener("change", () => {
    if (lastRun) for (const provider of Object.keys(states)) render(lastRun, provider);
  });
  window.addEventListener("pagehide", () => { if (current) finish(current, "Test ended."); });
  window.LiveBench = { stop };
  refreshRecordings();
})();

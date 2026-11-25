"use strict";

(() => {
  const get = (id) => document.getElementById(id);
  const { LiveWire: wire, BenchmarkCore: core } = window;
  if (!wire || !core) return;
  const { elapsed } = core;
  const providers = {
    deepgram: { name: "Deepgram", model: "Nova-3" },
    gemini: { name: "Google", model: "Gemini 3.8 Live" },
    azure: { name: "Microsoft", model: "Azure Speech" },
    openai: { name: "OpenAI", model: "GPT Live Transcribe" },
    groq: { name: "Groq · 4 s chunks", model: "Whisper Large v3" },
  };
  const defaultFeeds = ["deepgram", "gemini"];
  const pinnedFeeds = [...defaultFeeds, "openai"];
  const durationLimit = 120;
  const sampleRate = 16000;
  const groqChunkBytes = 4 * sampleRate * 2;
  const cleanupContextLimit = 480;
  const recordingSelect = get("live-recording");
  const referenceInput = get("live-reference");
  const reviewPanel = get("live-review");
  const reviewProvider = get("live-review-provider");
  const localFileId = "local-file";
  const telephoneAssets = { pause_and_talk: "pause", code_switch: "code" };
  const recordings = (window.DEMO_DATA?.clips || []).flatMap(({ id, scenario, condition, scenarioLabel, label, audio }) => {
    const conditionLabel = condition === "g711_alaw" ? "Telephone (G.711 A-law)" : label;
    const clip = { id, label: `${scenarioLabel} · ${conditionLabel}`, audio };
    const prefix = telephoneAssets[scenario];
    if (condition !== "g711_alaw" || !prefix) return [clip];
    return [clip, ...["fan", "office"].map((noise) => ({
      id: `${scenario}/phone_${noise}`,
      label: `${scenarioLabel} · Telephone + ${noise} noise`,
      audio: `assets/${prefix}-phone-${noise}.wav`,
    }))];
  }).concat([
    { id: "urban_fast/original", label: "Fast urban speech · Original", audio: "assets/urban-fast-original.mp4" },
    { id: "urban_fast/phone_clean", label: "Fast urban speech · Telephone (G.711 A-law)", audio: "assets/urban-fast-phone-clean.wav" },
    { id: "urban_fast/phone_fan", label: "Fast urban speech · Telephone + fan noise", audio: "assets/urban-fast-phone-fan.wav" },
    { id: "urban_fast/phone_office", label: "Fast urban speech · Telephone + office noise", audio: "assets/urban-fast-phone-office.wav" },
  ]);
  let localFile = null;
  let current = null;
  let lastRun = null;
  let configuredFeeds;
  let discovering = false;
  const references = new Map(Object.entries(window.DEMO_REFERENCES || {}));
  let selectedReference;

  const make = (tag, value, classes) => {
    const element = document.createElement(tag);
    if (value) element.textContent = value;
    if (classes) element.className = classes;
    return element;
  };

  function refreshRecordings(selected = recordingSelect.value) {
    recordingSelect.replaceChildren();
    const groups = [
      ["Simulated recordings", recordings],
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
    recordingSelect.value = selected || recordings[0]?.id || "";
    get("live-stream").disabled = !recordingSelect.value;
  }

  function recordingReferenceKey() {
    return recordingSelect.value === localFileId ? localFile : recordingSelect.value.split("/")[0];
  }

  function selectReference(key) {
    selectedReference = key;
    referenceInput.value = references.get(key) || "";
    renderReview();
  }

  const states = {};
  for (const [provider, { name, model }] of Object.entries(providers)) {
    const option = make("option", model);
    option.value = provider;
    reviewProvider.append(option);
    const panel = make("article", null, `transcript live-provider ${provider}`);
    panel.hidden = !pinnedFeeds.includes(provider);
    const header = make("header");
    const title = make("div");
    title.append(make("p", name, "provider"), make("h3", model));
    const status = make("span", provider === "openai" ? "Awaiting session" : "Ready", "feed-status");
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
    transcript.setAttribute("aria-label", `${model} live transcript`);
    const timing = make("p", null, "transcript-foot");
    timing.hidden = true;
    const output = make("div", null, "live-output");
    const pipeline = make("table", null, "live-pipeline");
    pipeline.setAttribute("aria-label", `${model} pipeline latency`);
    pipeline.append(make("caption", "Totals from the first audio packet."));
    const pipelineHead = make("thead");
    const headings = make("tr");
    for (const label of ["Stage", "Added", "Total"]) {
      const cell = make("th", label);
      cell.scope = "col";
      headings.append(cell);
    }
    pipelineHead.append(headings);
    const pipelineBody = make("tbody");
    const stages = {};
    for (const [key, label] of [["stt", "STT final"], ["rules", "Deterministic"], ["wait", "Queue wait"], ["llm", "LLM cleanup"]]) {
      const row = make("tr");
      const title = make("th", label);
      title.scope = "row";
      const added = make("td", "—");
      const total = make("td", "—");
      row.append(title, added, total);
      row.hidden = key === "wait";
      pipelineBody.append(row);
      stages[key] = { row, added, total };
    }
    pipeline.append(pipelineHead, pipelineBody);
    const cleanupNote = make("p", null, "transcript-foot");
    cleanupNote.hidden = true;
    const accuracy = make("p", null, "transcript-foot live-accuracy");
    accuracy.hidden = true;
    output.append(transcript, timing, cleanupNote, accuracy);
    const pipelineDetails = make("details", null, "live-pipeline-details");
    const summary = make("summary");
    const pipelineTotal = make("span", null, "pipeline-summary-total");
    pipelineTotal.hidden = true;
    summary.append(make("span", "Pipeline timings"), pipelineTotal);
    pipelineDetails.append(summary, pipeline);
    const measurements = make("div", null, "live-provider-metrics");
    measurements.append(metrics, pipelineDetails);
    output.hidden = measurements.hidden = !defaultFeeds.includes(provider);
    panel.append(header, output, measurements);
    get("live-feeds").append(panel);
    states[provider] = { panel, status, fields, output, measurements, transcript, timing, stages, cleanupNote, pipelineTotal, accuracy };
  }
  reviewProvider.value = defaultFeeds[0];

  function formatDuration(ms) {
    if (!Number.isFinite(ms)) return "—";
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
  }

  function renderPipeline(run, provider, ui, pipeline, fallbackVisible) {
    const llm = pipeline?.batch?.llm;
    const stageTimes = {
      stt: [pipeline?.sttMs, pipeline?.sttMs],
      rules: [pipeline?.rulesMs, pipeline?.rulesTotal],
      wait: [llm?.waitMs, llm?.requestAt],
      llm: [llm?.requestMs, llm?.text ? llm.totalMs : null],
    };
    for (const [key, [added, total]] of Object.entries(stageTimes)) {
      const stage = ui.stages[key];
      stage.added.textContent = formatDuration(added);
      stage.total.textContent = formatDuration(total);
    }
    ui.stages.wait.row.hidden = !llm;
    const total = llm?.text ? llm.totalMs : pipeline?.rulesTotal;
    ui.pipelineTotal.hidden = !Number.isFinite(total);
    ui.pipelineTotal.textContent = Number.isFinite(total) ? `${formatDuration(total)} total` : "";
    const notes = [];
    if (llm?.error) notes.push(llm.error);
    if (llm && llm.requestMs === undefined) notes.push("Cleaning finalized chunk…");
    else if (run.llmEnabled && pipeline && !llm) notes.push("Waiting for cleanup…");
    if (llm?.shared) notes.push("Shared cleanup request");
    if (llm?.model && !llm.shared && Number.isFinite(llm.apiMs)) notes.push(`${llm.model} API ${formatDuration(llm.apiMs)}`);
    if (llm?.text) notes.push(`${formatDuration(Math.max(0, llm.totalMs - pipeline.sttMs))} after STT final`);
    if (llm?.text && run.audioEndedAt !== undefined && run.started + llm.totalMs >= run.audioEndedAt) {
      notes.push(`${formatDuration(run.started + llm.totalMs - run.audioEndedAt)} after audio end`);
    }
    if (fallbackVisible) notes.push("Dimmed text uses deterministic cleanup.");
    if (provider === "groq" && Number.isFinite(run.groq?.apiMs)) notes.push(`Groq STT API ${formatDuration(run.groq.apiMs)}`);
    ui.cleanupNote.textContent = notes.join(" · ");
    ui.cleanupNote.hidden = !notes.length;
  }

  function finalizedParts(run, provider) {
    const { parts } = run.pipeline[provider];
    return provider === "openai"
      ? run.openaiTranscript.finalIds().map((id) => parts.get(id)).filter(Boolean)
      : [...parts.values()];
  }

  function llmFragments(parts) {
    return parts.flatMap((part) => {
      const corrected = part.batch?.llm.text;
      if (corrected && part.batch.parts[0] !== part) return [];
      return [{ text: corrected || part.rules, corrected: Boolean(corrected) }];
    });
  }

  function renderReview() {
    if (!reviewPanel.open) return;
    const run = lastRun?.referenceKey === selectedReference ? lastRun : null;
    const provider = reviewProvider.value;
    const reference = referenceInput.value;
    const finished = run && run !== current;
    const complete = finished && states[provider].status.textContent === "Complete" && (!run.playback || run.playback.ended);
    const parts = finished ? finalizedParts(run, provider) : [];
    const fragments = run?.llmEnabled ? llmFragments(parts) : [];
    const pending = run?.llmEnabled && parts.some((part) => part.batch?.llm.requestMs === undefined);
    const hasCleanup = fragments.some((part) => part.corrected);
    const raw = !finished ? "" : provider === "openai" ? run.openaiTranscript.text().raw
      : core.observe(run.events[provider], Infinity).raw;
    const note = get("live-review-note");
    note.textContent = !run ? "Run a live test to compare results."
      : !finished ? "Results are available when the run finishes."
        : `${run.recordingLabel} · ${complete ? "Complete" : run.playback && !run.playback.ended ? "Playback stopped early" : states[provider].status.textContent}`;
    const missingCleanup = !run || run.llmEnabled
      ? pending ? "Cleaning the remaining chunks…" : "No LLM-cleaned text was returned."
      : "Enable LLM cleanup before starting a test.";
    const results = {
      raw, rules: parts.map((part) => part.rules).join(" "),
      llm: hasCleanup && !pending ? fragments.map((part) => part.text).join(" ") : "",
    };
    for (const [stage, text] of Object.entries(results)) {
      const id = `live-review-${stage}`;
      const placeholder = !finished ? "Waiting for a completed run." : stage === "llm" ? missingCleanup : "No finalized transcript.";
      readOutput(id, text, placeholder, complete ? reference : "");
      const label = text ? scoreLabel(reference, complete ? core.score(reference, text) : null, complete) : "";
      const fallback = stage === "llm" && text && fragments.some((part) => !part.corrected);
      get(`${id}-score`).textContent = fallback ? `${label} · Includes deterministic fallback` : label;
    }
  }

  function render(run, provider) {
    const ui = states[provider];
    const observed = core.observe(run.events[provider], Infinity);
    for (const [key, field] of Object.entries(ui.fields)) {
      const value = observed[key];
      field.textContent = key === "interimCount" ? value : value === null ? "—" : `${value.toFixed(2)} s`;
    }
    const { raw, interim } = provider === "openai" ? run.openaiTranscript.text() : observed;
    const pipeline = run.pipeline[provider];
    const stage = get("live-stage").value;
    const parts = finalizedParts(run, provider);
    ui.transcript.replaceChildren();
    let fallbackVisible = false;
    let scoredText = "";
    if (stage === "llm" && run.llmEnabled && (parts.length || interim)) {
      let hasText = false;
      for (const { text, corrected } of llmFragments(parts)) {
        if (!text) continue;
        fallbackVisible ||= !corrected;
        ui.transcript.append(make("span", `${hasText ? " " : ""}${text}`, corrected ? null : "waiting"));
        scoredText += `${hasText ? " " : ""}${text}`;
        hasText = true;
      }
      if (interim) ui.transcript.append(make("span", `${hasText ? " " : ""}${core.clean(interim)}`, "interim"));
    } else if (stage === "llm") {
      ui.transcript.append(make("span", run.llmEnabled ? "Waiting for finalized text." : "Enable LLM cleanup before starting a test.", "waiting"));
    } else {
      const text = stage === "rules" ? parts.map((part) => part.rules).join(" ") : raw;
      scoredText = text;
      const pending = stage === "rules" ? core.clean(interim) : interim;
      if (text) ui.transcript.append(make("span", text));
      if (pending) ui.transcript.append(make("span", `${text ? " " : ""}${pending}`, "interim"));
      if (!text && !pending) ui.transcript.append(make("span", "Waiting for transcript.", "waiting"));
    }
    ui.transcript.scrollTop = ui.transcript.scrollHeight;
    const latest = run.latest[provider];
    ui.timing.hidden = !latest;
    if (latest) {
      const kind = latest.final ? "Final" : "Interim";
      ui.timing.textContent = latest.position === null
        ? `${kind} received at ${elapsed(latest.arrival)}${latest.afterPlayback ? " · after playback" : ""}`
        : `${kind} received at recording ${elapsed(latest.position)}`;
    }
    const reference = references.get(run.referenceKey);
    const cleanupPending = stage === "llm" && parts.some((part) => part.batch?.llm.requestMs === undefined);
    const score = reference && scoredText && ui.status.textContent === "Complete" && !cleanupPending && (!run.playback || run.playback.ended)
      ? core.score(reference, scoredText) : null;
    ui.accuracy.hidden = !score;
    ui.accuracy.textContent = score
      ? `WER ${(score.wer * 100).toFixed(1)}% · CER ${(score.cer * 100).toFixed(1)}%${fallbackVisible ? " · Includes deterministic fallback" : ""}`
      : "";
    renderPipeline(run, provider, ui, pipeline.latest, fallbackVisible);
  }

  function queueCleanup(run, provider, events, message = {}) {
    const pipeline = run.pipeline[provider];
    for (const event of events) {
      const [arrival, raw, final] = event;
      if (!final || !raw.trim()) continue;
      const start = performance.now();
      const rules = core.clean(raw);
      const end = performance.now();
      const part = { rules, sttMs: arrival * 1000, rulesMs: end - start, rulesTotal: end - run.started };
      pipeline.parts.set(provider === "openai" ? message.item_id : event, part);
      pipeline.latest = part;
      if (run.llmEnabled) pipeline.pending.push(part);
    }
    if (!pipeline.pending.length || pipeline.active) return;
    if (run.stopping || message.speech_final || provider === "openai" || provider === "groq" || provider === "azure") {
      void requestCleanup(run, provider);
    } else if (pipeline.timer === undefined) {
      pipeline.timer = setTimeout(() => void requestCleanup(run, provider), 180);
    }
  }

  async function fetchCleanup(run, text, context) {
    const response = await fetch("/api/live-cleanup", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, context }),
      signal: AbortSignal.any([run.cleanupController.signal, AbortSignal.timeout(3000)]),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.text !== "string" || !result.text.trim()) {
      return { ...result, text: undefined, error: result.error || "Cleanup unavailable. Kept the deterministic text." };
    }
    return result;
  }

  async function requestCleanup(run, provider) {
    const pipeline = run.pipeline[provider];
    clearTimeout(pipeline.timer);
    pipeline.timer = undefined;
    if (!pipeline.pending.length || pipeline.active || lastRun !== run || run.cleanupController.signal.aborted) return;
    // OpenAI turns can complete out of order. Keep their corrections attached to individual turns.
    const parts = pipeline.pending.splice(0, provider === "openai" ? 1 : pipeline.pending.length);
    const latest = parts.at(-1);
    const text = parts.map((part) => part.rules).join(" ");
    const history = finalizedParts(run, provider);
    const first = history.indexOf(parts[0]);
    const context = history.slice(Math.max(0, first - 4), first).map((part) => part.rules)
      .join("\n").slice(-cleanupContextLimit).trimStart();
    const requestKey = JSON.stringify([context, text]);
    const start = performance.now();
    const requestAt = start - run.started;
    const previous = run.cleanupRequests.get(requestKey);
    const llm = { requestAt, waitMs: Math.max(0, requestAt - latest.rulesTotal), shared: Boolean(previous) };
    const batch = { llm, parts };
    for (const part of parts) part.batch = batch;
    pipeline.active = true;
    render(run, provider);
    const requested = previous || fetchCleanup(run, text, context);
    run.cleanupRequests.set(requestKey, requested);
    try {
      Object.assign(llm, await requested);
    } catch (error) {
      llm.error = error.name === "TimeoutError" ? "Cleanup timed out. Kept the deterministic text."
        : "Cleanup unavailable. Kept the deterministic text.";
    }
    const end = performance.now();
    llm.requestMs = end - start;
    llm.totalMs = end - run.started;
    pipeline.active = false;
    if (lastRun === run && !run.cleanupController.signal.aborted) {
      render(run, provider);
      if (current !== run && reviewProvider.value === provider) renderReview();
    }
    if (pipeline.pending.length) void requestCleanup(run, provider);
  }

  function playbackPosition(run) {
    const { duration, startedAt, ended, stoppedAt } = run.playback;
    if (stoppedAt !== null) return stoppedAt;
    if (ended) return duration;
    if (startedAt === null) return 0;
    const outputTime = run.context.getOutputTimestamp?.().contextTime ?? run.context.currentTime;
    return Math.min(duration, Math.max(0, outputTime - startedAt));
  }

  function renderPlayback(run) {
    const position = playbackPosition(run);
    get("live-progress").value = position;
    get("live-clock").textContent = `${elapsed(position)} / ${elapsed(run.playback.duration)}`;
  }

  function setBusy(busy) {
    for (const id of ["live-mic", "live-recording", "live-file", "live-llm"]) get(id).disabled = busy;
    get("live-stream").disabled = busy || !recordingSelect.value;
    get("live-stop").disabled = !busy;
  }

  function showProviderRows(active, requested = []) {
    const visible = new Set(active);
    for (const [provider, ui] of Object.entries(states)) {
      const connected = visible.has(provider);
      ui.panel.hidden = !connected && !pinnedFeeds.includes(provider);
      ui.output.hidden = ui.measurements.hidden = !connected;
    }
    const issues = requested.filter((provider) => !pinnedFeeds.includes(provider) && !visible.has(provider)).map((provider) => {
      const status = states[provider].status.textContent;
      const message = status === "Connecting" ? "Unavailable" : status;
      return `${providers[provider].model}: ${message}`;
    });
    const notice = get("live-provider-notices");
    notice.textContent = issues.join(" · ");
    notice.hidden = issues.length === 0;
  }

  async function discover() {
    if (configuredFeeds || discovering) return;
    discovering = true;
    try {
      const response = await fetch("/api/live-session", { method: "GET", cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const { providers: configured } = await response.json();
      if (!Array.isArray(configured)) return;
      configuredFeeds = configured.filter((provider) => Object.hasOwn(providers, provider));
      if (!lastRun) {
        for (const provider of pinnedFeeds) {
          states[provider].status.textContent = configuredFeeds.includes(provider) ? "Ready" : "API key required";
        }
        showProviderRows(configuredFeeds);
      }
    } catch {
      // Static previews can still show the default rows.
    } finally {
      discovering = false;
    }
  }

  function showUnavailableFeed(run, provider) {
    if (run.events[provider].some((event) => event[1].trim()) || !run.visibleProviders?.delete(provider)) return;
    showProviderRows(run.visibleProviders, run.requestedProviders);
  }

  function releaseAudio(run) {
    if (run.playback && run.playback.stoppedAt === null) {
      run.playback.stoppedAt = playbackPosition(run);
      renderPlayback(run);
    }
    run.stream?.getTracks().forEach((track) => track.stop());
    if (run.context && run.context.state !== "closed") run.context.close().catch(() => {});
    clearInterval(run.clock);
    clearTimeout(run.frameTimer);
  }

  function finish(run, text) {
    if (current !== run) return;
    current = null;
    run.controller.abort();
    for (const resolve of Object.values(run.drains)) resolve();
    releaseAudio(run);
    for (const [provider, socket] of Object.entries(run.sockets)) {
      if (socket.readyState < WebSocket.CLOSING) socket.close();
      if (run.ready.has(provider) && !run.failed.has(provider)) {
        states[provider].status.textContent = core.observe(run.events[provider], Infinity).first === null
          ? "No text" : "Complete";
      }
    }
    if (run.groq && !run.failed.has("groq")) {
      states.groq.status.textContent = run.events.groq.length ? "Complete" : "No text";
    }
    if (run.azure && !run.failed.has("azure")) {
      states.azure.status.textContent = core.observe(run.events.azure, Infinity).first === null ? "No text" : "Complete";
    }
    for (const { status } of Object.values(states)) {
      if (status.textContent === "Connecting") status.textContent = "Unavailable";
    }
    for (const provider of Object.keys(states)) {
      if (states[provider].status.textContent === "Complete") render(run, provider);
    }
    get("live-status").textContent = text;
    setBusy(false);
    renderReview();
  }

  function receiveTranscripts(run, provider, events, message) {
    if (!events.length) {
      if (message?.speech_final) void requestCleanup(run, provider);
      return;
    }
    run.events[provider].push(...events);
    const latest = events.at(-1);
    if (latest[1].trim()) {
      const playback = run.playback;
      const afterPlayback = Boolean(playback && (playback.ended || playback.stoppedAt !== null));
      run.latest[provider] = {
        arrival: latest[0], final: latest[2], afterPlayback,
        position: playback && !afterPlayback ? playbackPosition(run) : null,
      };
    }
    queueCleanup(run, provider, events, message);
    render(run, provider);
  }

  function submitGroqChunk(run) {
    const groq = run.groq;
    if (!groq.length) return;
    const pcm = groq.buffer.slice(0, groq.length);
    groq.length = 0;
    groq.tail = groq.tail.then(async () => {
      if (current !== run) return;
      try {
        const response = await fetch("/api/groq-transcribe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: wire.encode(pcm) }),
          signal: AbortSignal.any([run.controller.signal, AbortSignal.timeout(4000)]),
        });
        const result = await response.json().catch(() => ({}));
        if (current !== run) return;
        if (!response.ok || typeof result.text !== "string") throw new Error(result.error || "Groq transcription unavailable.");
        groq.apiMs = result.apiMs;
        if (result.text.trim()) receiveTranscripts(run, "groq", [[(performance.now() - run.started) / 1000, result.text, true]]);
      } catch (error) {
        if (current === run) {
          run.failed.add("groq");
          states.groq.status.textContent = error.name === "TimeoutError" ? "A Groq chunk timed out" : error.message;
        }
      }
    });
  }

  function bufferGroqFrame(run, bytes) {
    const groq = run.groq;
    const packet = new Uint8Array(bytes);
    let offset = 0;
    while (offset < packet.length) {
      const length = Math.min(packet.length - offset, groqChunkBytes - groq.length);
      groq.buffer.set(packet.subarray(offset, offset + length), groq.length);
      groq.length += length;
      offset += length;
      if (groq.length === groqChunkBytes) submitGroqChunk(run);
    }
  }

  async function connectAzure(run, session) {
    const fail = (message) => {
      if (current !== run) return;
      run.failed.add("azure");
      states.azure.status.textContent = message;
      showUnavailableFeed(run, "azure");
    };
    try {
      const sdk = await window.LiveAzure.prepare();
      run.azure = await window.LiveAzure.connect(sdk, session, {
        signal: run.controller.signal,
        onError: fail,
        onText(text, final) {
          if (current !== run || run.started === null || run.sealed.has("azure")) return;
          receiveTranscripts(run, "azure", [[(performance.now() - run.started) / 1000, text, final]]);
        },
      });
      if (current === run && run.azure.active) states.azure.status.textContent = "Streaming · Sinhala";
    } catch (error) {
      fail(error.message);
    }
  }

  function sendFrame(run, bytes) {
    if (run !== current || !bytes.byteLength) return;
    if (run.started === null) run.started = performance.now();
    let sent = 0;
    if (run.groq) {
      bufferGroqFrame(run, bytes);
      sent++;
    }
    if (run.azure?.active && !run.failed.has("azure")) {
      try { run.azure.write(bytes); sent++; }
      catch {
        run.failed.add("azure");
        states.azure.status.textContent = "Could not send audio to Azure";
        showUnavailableFeed(run, "azure");
      }
    }
    for (const [provider, socket] of Object.entries(run.sockets)) {
      if (!run.ready.has(provider) || socket.readyState !== WebSocket.OPEN) continue;
      if (socket.bufferedAmount > 65536) {
        run.failed.add(provider);
        states[provider].status.textContent = "Network fell behind";
        showUnavailableFeed(run, provider);
        socket.close();
        continue;
      }
      try {
        const packets = provider === "openai" ? run.openaiInput.append(bytes) : [wire.audioPacket(provider, bytes)];
        for (const packet of packets) socket.send(packet);
        sent++;
      }
      catch {
        run.failed.add(provider);
        states[provider].status.textContent = "Could not send audio";
        showUnavailableFeed(run, provider);
        socket.close();
      }
    }
    if (!sent && !run.stopping) stop("All live streams disconnected.");
  }

  function connect(run, provider, token, setup) {
    const spec = wire.connection(provider, token, setup);
    return new Promise((resolve) => {
      const socket = new WebSocket(spec.url, spec.protocols);
      run.sockets[provider] = socket;
      socket.binaryType = "arraybuffer";
      let keepAlive;
      const timeout = setTimeout(() => {
        if (current === run) {
          run.failed.add(provider);
          states[provider].status.textContent = "Connection timed out";
        }
        if (socket.readyState < WebSocket.CLOSING) socket.close();
        resolve();
      }, defaultFeeds.includes(provider) ? 12000 : 8000);
      const ready = () => {
        clearTimeout(timeout);
        if (current === run) {
          run.ready.add(provider);
          states[provider].status.textContent = "Streaming";
          if (provider === "deepgram") {
            // The shared playback clock starts only after the other providers settle.
            keepAlive = setInterval(() => {
              if (current !== run || run.started !== null || socket.readyState !== WebSocket.OPEN) {
                clearInterval(keepAlive);
                return;
              }
              socket.send(JSON.stringify({ type: "KeepAlive" }));
            }, 3000);
          }
        }
        resolve();
      };
      socket.addEventListener("open", () => {
        if (spec.setup) socket.send(spec.setup);
        else ready();
      });
      socket.addEventListener("message", ({ data }) => {
        if (current !== run || run.sealed.has(provider)) return;
        try {
          const message = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
          if (provider === "gemini" && "setupComplete" in message) ready();
          if (provider === "openai") {
            if (message.type === "session.updated") ready();
            if (message.type === "error") {
              const code = message.error?.code;
              states.openai.status.textContent = code === "credit_balance_exhausted" || code === "insufficient_quota"
                ? "API credits exhausted"
                : typeof code === "string" && /^[\w-]{1,48}$/.test(code) ? `OpenAI error (${code})` : "OpenAI session error";
              run.failed.add(provider);
              showUnavailableFeed(run, provider);
              socket.close();
              return;
            }
            if (message.type === "conversation.item.input_audio_transcription.failed") {
              states.openai.status.textContent = "A turn failed";
              run.failed.add(provider);
            }
          }
          if (run.started === null) return;
          const arrival = (performance.now() - run.started) / 1000;
          const events = provider === "openai"
            ? run.openaiTranscript.read(message, arrival)
            : wire.transcripts(provider, message, arrival);
          receiveTranscripts(run, provider, events, message);
        } catch { /* Ignore unsupported provider messages. */ }
      });
      socket.addEventListener("close", ({ code }) => {
        clearTimeout(timeout);
        clearInterval(keepAlive);
        run.drains[provider]?.();
        if (current === run && !run.stopping && !run.failed.has(provider)) {
          run.failed.add(provider);
          states[provider].status.textContent = code === 1006 && !run.ready.has(provider)
            ? "WebSocket connection failed" : `Disconnected (${code})`;
          showUnavailableFeed(run, provider);
          if (run.started !== null && !run.groq && !run.azure?.active && Object.values(run.sockets).every((s) => s.readyState !== WebSocket.OPEN)) {
            stop("All live streams disconnected.");
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
    const playback = run.context.createBufferSource();
    playback.buffer = buffer;
    playback.connect(run.context.destination);
    let offset = 0;
    playback.onended = () => {
      if (current !== run || run.stopping) return;
      run.playback.ended = true;
      renderPlayback(run);
      if (offset >= pcm.length) stop();
    };

    const startAt = performance.now();
    run.playback.startedAt = run.context.currentTime;
    playback.start(run.playback.startedAt);
    function next() {
      if (current !== run || run.stopping) return;
      sendFrame(run, pcm.slice(offset, offset + 320).buffer);
      offset += 320;
      if (offset >= pcm.length) {
        if (run.playback.ended) stop();
        return;
      }
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
    if (!run.playback?.ended) releaseAudio(run);
    run.audioEndedAt = performance.now();
    if (run.groq) submitGroqChunk(run);
    const drains = [];
    const seal = (provider) => {
      if (current !== run) return;
      run.sealed.add(provider);
      void requestCleanup(run, provider);
    };
    for (const [provider, socket] of Object.entries(run.sockets)) {
      if (run.ready.has(provider) && socket.readyState === WebSocket.OPEN) {
        const drained = new Promise((resolve) => { run.drains[provider] = resolve; });
        drains.push(drained.then(() => seal(provider)));
        try {
          const packets = provider === "openai" ? run.openaiInput.finish() : [wire.endPacket(provider)];
          for (const packet of packets) socket.send(packet);
        }
        catch { run.drains[provider](); }
      } else {
        seal(provider);
      }
    }
    if (run.azure) {
      const drained = new Promise((resolve) => { run.drains.azure = resolve; });
      drains.push(drained.then((completed) => {
        if (current === run && completed === undefined && !run.failed.has("azure")) {
          run.failed.add("azure");
          states.azure.status.textContent = "Azure finalization timed out";
        }
        seal("azure");
      }));
      run.azure.end().then(run.drains.azure);
    }
    if (drains.length) {
      const deadline = setTimeout(() => {
        for (const resolve of Object.values(run.drains)) resolve();
      }, 5000);
      await Promise.all(drains);
      clearTimeout(deadline);
    }
    if (run.groq) {
      await run.groq.tail;
      seal("groq");
    }
    finish(run, message);
  }

  async function start(mode) {
    if (current) return;
    const selected = recordingSelect.value;
    const file = selected === localFileId ? localFile : null;
    const clip = recordings.find((recording) => recording.id === selected);
    if (mode === "recording" && !file && !clip) {
      return get("live-status").textContent = "Choose a recording to stream.";
    }
    if (mode === "mic" && !navigator.mediaDevices?.getUserMedia) {
      return get("live-status").textContent = "Microphone access requires HTTPS or localhost.";
    }
    cancelCleanup(lastRun);
    if (mode === "mic") references.delete("microphone");
    const run = {
      started: null, stopping: false, sockets: {}, ready: new Set(), failed: new Set(),
      events: Object.fromEntries(Object.keys(providers).map((provider) => [provider, []])),
      openaiInput: wire.openaiInput(), openaiTranscript: wire.openaiTranscript(), latest: {}, controller: new AbortController(),
      llmEnabled: get("live-llm").checked, drains: {}, sealed: new Set(), cleanupController: new AbortController(),
      pipeline: Object.fromEntries(Object.keys(providers).map((provider) => [provider, { parts: new Map(), pending: [] }])),
      cleanupRequests: new Map(),
      referenceKey: mode === "mic" ? "microphone" : recordingReferenceKey(),
      recordingLabel: mode === "mic" ? "Microphone recording" : file?.name || clip.label,
    };
    current = lastRun = run;
    selectReference(run.referenceKey);
    get("live-clock").textContent = "0:00.0";
    get("live-progress").hidden = true;
    showProviderRows(configuredFeeds ?? defaultFeeds);
    setBusy(true);
    get("live-status").textContent = mode === "mic" ? "Waiting for microphone permission…" : "Preparing the recording…";
    for (const provider of Object.keys(states)) {
      states[provider].status.textContent = "Connecting";
      render(run, provider);
    }
    try {
      const context = mode === "recording" ? new AudioContext() : new AudioContext({ sampleRate });
      run.context = context;
      await context.resume();
      if (current !== run) return;
      let buffer;
      if (mode === "recording") {
        const source = file || await fetch(clip.audio, { signal: run.controller.signal });
        if (!file && !source.ok) throw new Error("Could not load the selected recording.");
        const decoder = new OfflineAudioContext(1, 1, sampleRate);
        buffer = await decoder.decodeAudioData(await source.arrayBuffer());
        if (current !== run) return;
        if (buffer.duration > durationLimit) throw new Error("Choose a recording no longer than two minutes.");
        run.playback = { duration: buffer.duration, startedAt: null, ended: false, stoppedAt: null };
        const progress = get("live-progress");
        progress.max = buffer.duration;
        renderPlayback(run);
        progress.hidden = false;
      } else {
        if (context.sampleRate !== sampleRate) throw new Error("This browser cannot provide 16 kHz capture.");
        const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false });
        if (current !== run) return media.getTracks().forEach((track) => track.stop());
        run.stream = media;
        await context.audioWorklet.addModule("mic-pcm.js");
      }
      if (current !== run) return;
      get("live-status").textContent = "Opening provider streams…";
      const options = { method: "POST", signal: run.controller.signal, cache: "no-store" };
      const response = await fetch("/api/live-session", options);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && !payload.errors) {
        throw new Error(payload.error || "Live testing requires the configured Vercel API endpoint.");
      }
      if (current !== run) return;
      for (const [provider, error] of Object.entries(payload.errors || {})) {
        if (states[provider]) states[provider].status.textContent = error === "Set OPENAI_API_KEY in Vercel to connect." ? "API key required" : error;
      }
      if (payload.groqEnabled) {
        run.groq = { buffer: new Uint8Array(groqChunkBytes), length: 0, tail: Promise.resolve() };
        states.groq.status.textContent = "Streaming";
      }
      const setup = { gemini: payload.geminiSetup, openai: payload.openaiSetup };
      const connections = Object.entries(payload.tokens || {}).map(([provider, token]) => connect(run, provider, token, setup[provider]));
      if (payload.azureSession) connections.push(connectAzure(run, payload.azureSession));
      await Promise.all(connections);
      if (current !== run) return;
      const activeProviders = [...run.ready].filter((provider) => run.sockets[provider].readyState === WebSocket.OPEN);
      if (run.groq) activeProviders.push("groq");
      if (run.azure?.active) activeProviders.push("azure");
      const requested = [...defaultFeeds, ...Object.keys(payload.tokens || {})];
      if (run.groq) requested.push("groq");
      if (payload.azureSession || payload.errors?.azure) requested.push("azure");
      run.requestedProviders = [...new Set(requested)];
      run.visibleProviders = new Set(activeProviders);
      showProviderRows(run.visibleProviders, run.requestedProviders);
      if (!activeProviders.length) throw new Error("No live provider connected. See the provider status below.");
      const destination = new Intl.ListFormat("en").format(Object.keys(providers)
        .filter((provider) => run.visibleProviders.has(provider)).map((provider) => providers[provider].model));
      get("live-status").textContent = mode === "mic"
        ? `Streaming your microphone to ${destination}…`
        : `Playing and streaming the recording at 1× to ${destination}…`;
      const waitingSince = performance.now();
      run.clock = setInterval(() => {
        if (run.started === null) {
          if (performance.now() - waitingSince > 5000) stop("No audio reached the live streams.");
          return;
        }
        const seconds = (performance.now() - run.started) / 1000;
        if (run.playback) renderPlayback(run);
        else get("live-clock").textContent = elapsed(seconds);
        if (seconds >= durationLimit) stop("Two-minute test complete.");
      }, 100);
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
      const message = error.name === "NotAllowedError" ? (mode === "mic" ? "Microphone permission was denied." : "Your browser blocked playback.")
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
    if (localFile) references.delete(localFile);
    localFile = file;
    refreshRecordings(localFileId);
    selectReference(recordingReferenceKey());
    get("live-status").textContent = "Audio file ready. Select Play & stream to run the live test.";
  });
  get("live-stop").addEventListener("click", () => stop());
  reviewPanel.addEventListener("toggle", renderReview);
  reviewProvider.addEventListener("change", renderReview);
  recordingSelect.addEventListener("change", () => selectReference(recordingReferenceKey()));
  referenceInput.addEventListener("input", () => {
    references.set(selectedReference, referenceInput.value.trim());
    if (lastRun?.referenceKey === selectedReference) {
      for (const provider of Object.keys(states)) render(lastRun, provider);
    }
    renderReview();
  });
  get("live-stage").addEventListener("change", () => {
    if (lastRun) for (const provider of Object.keys(states)) render(lastRun, provider);
  });
  function cancelCleanup(run) {
    if (!run) return;
    run.cleanupController.abort();
    for (const pipeline of Object.values(run.pipeline)) clearTimeout(pipeline.timer);
  }
  window.addEventListener("pagehide", () => {
    cancelCleanup(lastRun);
    if (current) finish(current, "Test ended.");
  });
  window.LiveBench = { discover, stop };
  refreshRecordings();
  selectReference(recordingReferenceKey());
  if (!get("live").hidden) void discover();
})();

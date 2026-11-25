"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../public/demo-core.js");
const wire = require("../public/live-wire.js");
const liveSession = require("../api/live-session.js");
const liveCleanup = require("../api/live-cleanup.js");
const groqTranscribe = require("../api/groq-transcribe.js");

const site = path.join(__dirname, "..", "public");
const load = (file) => fs.readFileSync(path.join(site, file), "utf8");
const html = load("index.html");

function initDashboard(initialHash = "", runtime = {}) {
  function node() {
    let text = "";
    return {
      children: [], callbacks: {}, style: {}, value: "", clientWidth: 420, clientHeight: 54,
      get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join("") : text; },
      set textContent(value) { this.children = []; text = value; },
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; text = ""; },
      addEventListener(name, callback) { this.callbacks[name] = callback; },
      setAttribute(name, value) { this[name] = value; },
      focus() { this.focused = true; },
      classList: { toggle() {} },
      getContext() { return { setTransform() {}, clearRect() {}, fillRect() {} }; },
      checkValidity() { return Number(this.value) >= 0; },
    };
  }
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const nodes = Object.fromEntries(ids.map((id) => [id, node()]));
  Object.assign(nodes.audio, {
    paused: true, currentTime: 0, duration: 28.224, ended: false,
    pause() { this.paused = true; },
    async play() { this.paused = false; },
  });
  nodes.scenario.value = "pause_and_talk";
  nodes["cleanup-provider"].value = "deepgram";
  nodes.minutes.value = "10000";
  nodes["call-seconds"].value = "180";
  nodes["reply-minutes"].value = "3000";
  nodes["live-text-in"].value = nodes["live-text-out"].value = "0";
  nodes["cleanup-requests"].value = "2000";
  nodes["cleanup-in"].value = "214";
  nodes["cleanup-out"].value = "143";
  nodes["hosting-count"].value = "1";
  nodes["hosting-setup"].value = "0";
  const browser = {
    document: { getElementById: (id) => nodes[id], createElement: node },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, performance: { now: () => 123 },
    location: { hash: initialHash },
    history: { replaceState(_state, _title, hash) { browser.location.hash = hash; } },
    Blob, atob, AbortSignal,
    URL: { createObjectURL: () => "blob:test-call", revokeObjectURL() {} },
    listeners: {},
    devicePixelRatio: 2, addEventListener(name, callback) { this.listeners[name] = callback; },
    ...runtime,
  };
  browser.window = browser;
  const sandbox = vm.createContext(browser);
  for (const file of ["assets/demo-data.js", "assets/references.js", "demo-core.js", "live-wire.js", "live-azure.js", "app.js", "live.js"]) {
    vm.runInContext(load(file), sandbox, { filename: file });
  }
  return { nodes, data: browser.DEMO_DATA, browser };
}

function transcriptText(node) {
  return node.children.length
    ? node.children.filter((word) => word.className !== "diff-missing").map((word) => word.textContent).join("")
    : node.textContent;
}

test("Unicode rules, literal approved terms, and numeric guard", () => {
  const rules = core.parseGlossary("u+ => U Plus\nplan => Plan A");
  assert.equal(core.clean("  u+   plan ,   planner.  ", rules), "U Plus Plan A, planner.");
  assert.equal(core.clean("  e\u0301  "), "\u00e9");
  assert.throws(() => core.parseGlossary("bad row"), /heard term/);
  assert.equal(core.digitsChanged("call 070 32", "call 070 33"), true);
  assert.equal(core.digitsChanged("070 32", "070   32!"), false);
});

test("comparison tabs are exclusive, keyboard-accessible, and preserve playback", async () => {
  const { nodes, browser } = initDashboard();
  assert.equal(nodes["tab-replay"], undefined);
  assert.equal(nodes.live.hidden, false);
  assert.equal(nodes.cleanup.hidden, true);
  assert.equal(nodes.benchmark.hidden, true);
  nodes["tab-cleanup"].callbacks.click();
  assert.equal(nodes.cleanup.hidden, false);
  assert.equal(nodes["replay-console"].hidden, false);
  await nodes.play.callbacks.click();
  assert.equal(nodes.audio.paused, false);
  assert.equal(browser.location.hash, "#cleanup");
  let prevented = false;
  nodes["tab-cleanup"].callbacks.keydown({ key: "ArrowRight", preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(nodes.benchmark.hidden, false);
  assert.equal(nodes.cleanup.hidden, true);
  assert.equal(nodes["replay-console"].hidden, true);
  assert.equal(nodes.audio.paused, true);
  assert.equal(nodes["tab-benchmark"].focused, true);
  assert.equal(nodes["tab-benchmark"].tabIndex, 0);
  assert.equal(nodes["tab-cleanup"].tabIndex, -1);
  browser.location.hash = "#replay";
  browser.listeners.hashchange();
  assert.equal(nodes.replay.open, true);
  assert.equal(nodes.cleanup.hidden, false);
  assert.equal(nodes.benchmark.hidden, true);
  assert.equal(initDashboard("#cleanup").nodes.cleanup.hidden, false);
  assert.equal(initDashboard("#costs").nodes.costs.hidden, false);
  assert.equal(initDashboard("#deployment").nodes.deployment.hidden, false);
});

test("price calculator uses published units and captured cleanup usage", () => {
  const usage = {
    callerMinutes: 10000, callSeconds: 180, replyMinutes: 3000, liveTextIn: 0, liveTextOut: 0,
    requests: 2000, cleanupIn: 214, cleanupOut: 143,
  };
  const result = core.estimateCosts(usage);
  assert.equal(result.nova.toFixed(2), "48.00");
  assert.equal(result.openai.toFixed(2), "170.00");
  assert.equal(result.geminiInput.toFixed(2), "50.00");
  assert.equal(result.geminiOutput.toFixed(2), "54.00");
  assert.equal(result.flashLite.toFixed(2), "0.84");
  assert.equal(result.groqBilledMinutes, 25000);
  assert.equal(result.groq.toFixed(2), "46.25");
  assert.equal(core.estimateCosts({ ...usage, callerMinutes: 10, callSeconds: 5 }).groqBilledMinutes, 40);
  assert.equal(core.estimateCosts({ ...usage, callerMinutes: 300 }).azureFree, true);
  assert.equal(core.estimateCosts({ ...usage, callSeconds: 0 }), null);
  const { nodes } = initDashboard();
  assert.equal(nodes["cost-nova"].textContent, "$48.00");
  assert.equal(nodes["cost-gemini"].textContent, "$104.00");
  assert.equal(nodes["cost-openai"].textContent, "$170.00");
  assert.equal(nodes["cost-azure"].textContent, "$166.67");
  assert.equal(nodes["cost-azure-free"].textContent, "Over F0 limit");
  assert.equal(nodes["cost-cleanup"].textContent, "$0.84");
  assert.equal(nodes["cost-qwen"].textContent, "$1.49");
  nodes["reply-minutes"].value = "0";
  nodes["live-text-out"].value = "1000000";
  nodes["reply-minutes"].callbacks.input();
  assert.equal(nodes["cost-gemini"].textContent, "$54.50");
  nodes["hosting-count"].value = "2";
  nodes["hosting-monthly"].value = "100";
  nodes["hosting-setup"].value = "70";
  nodes["hosting-monthly"].callbacks.input();
  assert.match(nodes["hosting-result"].textContent, /\$200\.00\/month · \$340\.00/);
});

test("local replay pack imports without adding any provider request", async () => {
  const { nodes, data } = initDashboard();
  const pack = { version: 1, calls: [{
    audioBase64: "YQ==", duration: 1, speechStart: 0, speechEnd: 0.9,
    wave: Array(160).fill(0.3),
    events: { deepgram: [[1.1, "private test", true]], gemini: [[1.2, "private test", true]] },
  }] };
  await nodes["load-real"].callbacks.change({ target: { files: [{ size: 30, text: async () => JSON.stringify(pack) }] } });
  assert.equal(data.clips.length, 7);
  assert.equal(nodes.scenario.value, "private/1");
  assert.equal(nodes.audio.src, "blob:test-call");
  nodes.results.callbacks.click();
  assert.equal(nodes["raw-output"].textContent, "private test");
  assert.equal(nodes["llm-output"].children[0].textContent, "Cleanup was unavailable for this stream.");
  const invalid = { ...pack, calls: [{ ...pack.calls[0], audioBase64: "https://example.com/audio" }] };
  await nodes["load-real"].callbacks.change({ target: { files: [{ size: 30, text: async () => JSON.stringify(invalid) }] } });
  assert.equal(data.clips.length, 7);
  assert.match(nodes["player-status"].textContent, /invalid audio/);
});

test("live view shows the OpenAI placeholder without a key and can select a local file", async () => {
  const { nodes, browser } = initDashboard("", {
    async fetch() { return { ok: true, json: async () => ({ providers: ["deepgram", "gemini"] }) }; },
  });
  nodes["tab-live"].callbacks.click();
  await new Promise(setImmediate);
  assert.equal(nodes.live.hidden, false);
  assert.equal(nodes["replay-console"].hidden, true);
  const visible = nodes["live-feeds"].children.filter((panel) => !panel.hidden);
  assert.deepEqual(visible.map((panel) => panel.className.split(" ").at(-1)), ["deepgram", "gemini", "openai"]);
  assert.equal(visible[2].children[0].children[1].textContent, "API key required");
  assert.equal(visible[2].children[1].hidden, true);
  assert.equal(visible[2].children[2].hidden, true);
  assert.match(visible[0].children[2].children[1].children[0].children[0].textContent, /Pipeline timings/);
  assert.equal(nodes["live-passcode"], undefined);
  assert.equal(nodes["live-load-real"], undefined);
  assert.equal(nodes["live-azure"], undefined);
  assert.equal(nodes["live-groq"], undefined);
  const recordings = nodes["live-recording"];
  assert.equal(recordings.children.length, 1);
  assert.equal(recordings.children[0].label, "Simulated recordings");
  assert.equal(recordings.children[0].children.length, 14);
  assert.equal(recordings.value, "pause_and_talk/clean");
  assert.match(nodes["live-reference"].value, /^සුළු අසනීපයක්/);
  recordings.value = "code_switch/phone_office";
  recordings.callbacks.change();
  assert.match(nodes["live-reference"].value, /^මම වැඩියෙන්ම අන්තර්ජාලය/);
  for (const [scenario, prefix, frames] of [["pause_and_talk", "pause", 225792], ["code_switch", "code", 240480]]) {
    for (const condition of ["fan", "office"]) {
      const option = recordings.children[0].children.find((entry) => entry.value === `${scenario}/phone_${condition}`);
      assert.match(option.textContent, new RegExp(`Telephone \\+ ${condition} noise`));
      const audio = fs.readFileSync(path.join(site, `assets/${prefix}-phone-${condition}.wav`));
      assert.equal(audio.toString("ascii", 8, 16), "WAVEfmt ");
      assert.equal(audio.readUInt16LE(22), 1);
      assert.equal(audio.readUInt32LE(24), 8000);
      assert.equal(audio.readUInt16LE(34), 16);
      assert.equal(audio.readUInt32LE(40), frames * 2);
    }
  }
  assert.equal(fs.readFileSync(path.join(site, "assets/urban-fast-original.mp4")).toString("ascii", 4, 8), "ftyp");
  for (const condition of ["original", "phone_clean", "phone_fan", "phone_office"]) {
    const id = `urban_fast/${condition}`;
    assert.ok(recordings.children[0].children.some((entry) => entry.value === id));
    recordings.value = id;
    recordings.callbacks.change();
    assert.equal(nodes["live-reference"].value, browser.DEMO_REFERENCES.urban_fast);
    if (condition === "original") continue;
    const audio = fs.readFileSync(path.join(site, `assets/urban-fast-phone-${condition.slice(6)}.wav`));
    assert.equal(audio.toString("ascii", 8, 16), "WAVEfmt ");
    assert.equal(audio.readUInt16LE(22), 1);
    assert.equal(audio.readUInt32LE(24), 8000);
    assert.equal(audio.readUInt32LE(40), 423936 * 2);
  }
  const input = nodes["live-file"];
  input.files = [{ name: "sample.mp3", size: 10 }];
  input.callbacks.change({ target: input });
  assert.equal(recordings.value, "local-file");
  assert.equal(recordings.children[1].children[0].textContent, "sample.mp3");
  assert.match(nodes["live-status"].textContent, /ready/);
  nodes["tab-cleanup"].callbacks.click();
  assert.equal(nodes["replay-console"].hidden, false);
});

test("live wire sends identical PCM and ignores empty transcript results", () => {
  const bytes = new Uint8Array([0, 128, 255, 127]);
  assert.equal(wire.audioPacket("deepgram", bytes), bytes);
  const payload = JSON.parse(wire.audioPacket("gemini", bytes));
  assert.deepEqual(Buffer.from(payload.realtimeInput.audio.data, "base64"), Buffer.from(bytes));
  const interim = [0.5, "word", false];
  const blank = wire.transcripts("deepgram", { type: "Results", is_final: true }, 1);
  assert.equal(core.observe(blank, Infinity).first, null);
  assert.equal(core.observe([interim, ...blank], Infinity).interim, "");
  const gemini = wire.connection("gemini", "auth_tokens/test", { model: "models/gemini-3.8-live" });
  assert.match(gemini.url.pathname, /BidiGenerateContentConstrained$/);
  assert.equal(gemini.url.searchParams.get("access_token"), "auth_tokens/test");
});

test("an OpenAI credit error keeps the OpenAI row visible while other providers stream", async () => {
  class Socket extends EventTarget {
    static OPEN = 1;
    static CLOSING = 2;
    readyState = 0;
    bufferedAmount = 0;
    constructor(url) {
      super();
      this.openai = url.hostname === "api.openai.com";
      queueMicrotask(() => { this.readyState = Socket.OPEN; this.dispatchEvent(new Event("open")); });
    }
    send() {
      if (!this.openai) return;
      const event = new MessageEvent("message", { data: JSON.stringify({ type: "error", error: { code: "credit_balance_exhausted" } }) });
      this.dispatchEvent(event);
    }
    close() { this.readyState = Socket.CLOSING; this.dispatchEvent(new Event("close")); }
  }
  const { nodes } = initDashboard("#live", {
    AbortController, URL, WebSocket: Socket,
    AudioContext: class { async resume() {} createBufferSource() { return { start() {}, connect() {} }; } },
    OfflineAudioContext: class { async decodeAudioData() { return { duration: 0.02, length: 320, numberOfChannels: 1, getChannelData: () => new Float32Array(320) }; } },
    fetch: async (url) => url === "/api/live-session"
      ? { ok: true, json: async () => ({ tokens: { deepgram: "test", openai: "ek_test" }, openaiSetup: { type: "transcription" }, errors: { gemini: "Gemini unavailable" } }) }
      : { ok: true, arrayBuffer: async () => new ArrayBuffer(0) },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  });
  await nodes["live-stream"].callbacks.click();
  const visible = nodes["live-feeds"].children.filter((panel) => !panel.hidden);
  assert.deepEqual(visible.map((panel) => panel.className.split(" ").at(-1)), ["deepgram", "gemini", "openai"]);
  assert.equal(visible[1].children[0].children[1].textContent, "Gemini unavailable");
  assert.equal(visible[1].children[1].hidden, true);
  assert.equal(visible[2].children[0].children[1].textContent, "API credits exhausted");
  assert.equal(visible[2].children[1].hidden, true);
  assert.equal(nodes["live-provider-notices"].hidden, true);
});

test("OpenAI input keeps the resampling phase and commits speech at a pause", () => {
  const input = wire.openaiInput();
  const readSamples = (packet) => {
    const bytes = Buffer.from(JSON.parse(packet).audio, "base64");
    return Array.from({ length: bytes.length / 2 }, (_, index) => bytes.readInt16LE(index * 2));
  };
  assert.deepEqual(readSamples(input.append(new Int16Array([0]).buffer)[0]), [0]);
  assert.deepEqual(readSamples(input.append(new Int16Array([3000]).buffer)[0]), [1000, 3000]);

  const turn = wire.openaiInput();
  assert.equal(turn.append(new Int16Array(320).fill(6000).buffer).length, 1);
  for (let i = 0; i < 19; i++) assert.equal(turn.append(new Int16Array(320).buffer).length, 1);
  const packets = turn.append(new Int16Array(320).buffer);
  assert.equal(JSON.parse(packets[1]).type, "input_audio_buffer.commit");
  assert.deepEqual(turn.finish(), []);
});

test("OpenAI joins deltas and keeps committed turn order when finals arrive out of order", () => {
  const transcript = wire.openaiTranscript();
  transcript.read({ type: "input_audio_buffer.committed", item_id: "one" }, 1);
  transcript.read({ type: "input_audio_buffer.committed", item_id: "two", previous_item_id: "one" }, 2);
  transcript.read({ type: "conversation.item.input_audio_transcription.delta", item_id: "one", delta: "Hel" }, 2.2);
  assert.deepEqual(transcript.read({ type: "conversation.item.input_audio_transcription.delta", item_id: "one", delta: "lo" }, 2.4), [[2.4, "Hello", false]]);
  assert.deepEqual(transcript.text(), { raw: "", interim: "Hello" });
  transcript.read({ type: "conversation.item.input_audio_transcription.completed", item_id: "two", transcript: "Second" }, 3);
  transcript.read({ type: "conversation.item.input_audio_transcription.completed", item_id: "one", transcript: "First" }, 4);
  assert.deepEqual(transcript.text(), { raw: "First Second", interim: "" });
});

test("microphone worklet produces 20 ms PCM packets and flushes its tail", () => {
  const packets = [];
  const AudioWorkletProcessor = class {
    port = { postMessage: (value) => packets.push(value) };
  };
  let Processor;
  vm.runInNewContext(load("mic-pcm.js"), {
    AudioWorkletProcessor, registerProcessor(_name, type) { Processor = type; },
  });
  const worklet = new Processor();
  const block = new Float32Array(128).fill(1);
  block[0] = -1;
  for (let i = 0; i < 4; i++) worklet.process([[block]]);
  assert.equal(packets.length, 1);
  assert.equal(packets[0].byteLength, 640);
  assert.deepEqual(Array.from(new Int16Array(packets[0]).slice(0, 2)), [-32768, 32767]);
  worklet.port.onmessage({ data: "stop" });
  assert.equal(packets[1].byteLength, 384);
  assert.equal(packets[2], "flushed");
  worklet.process([[block]]);
  assert.equal(packets.length, 3);
});

test("recording automatically streams to configured providers and shares identical cleanup while it plays", async () => {
  const sent = { deepgram: [], gemini: [], openai: [], azure: [] };
  const final = "\u0dc3\u0dd2 fiber package 2048";
  const short = "\u0dc4\u0dbb\u0dd2";
  const clocks = [];
  const keepAlive = [];
  let tick;
  let startupHeartbeat;
  let completeGeminiSetup;
  let audioTime = 1;
  let wallTime = 123;
  let playing = false;
  let contextClosed = false;
  let azureClosed = false;
  let azureRecognizer;
  let deepgramSocket;
  const destination = {};
  const playback = {
    connect(output) { assert.equal(output, destination); },
    start(when) { assert.equal(when, audioTime); playing = true; },
  };
  class Socket extends EventTarget {
    static OPEN = 1;
    static CLOSING = 2;
    readyState = 0;
    bufferedAmount = 0;
    constructor(url, protocols) {
      super();
      this.provider = { "api.deepgram.com": "deepgram", "api.openai.com": "openai" }[url.hostname] || "gemini";
      if (this.provider === "deepgram") deepgramSocket = this;
      if (this.provider === "openai") {
        assert.equal(url.searchParams.get("intent"), "transcription");
        assert.deepEqual(Array.from(protocols), ["realtime", "openai-insecure-api-key.ek_test"]);
      }
      queueMicrotask(() => {
        this.readyState = Socket.OPEN;
        this.dispatchEvent(new Event("open"));
      });
    }
    emit(data) {
      const event = new Event("message");
      event.data = JSON.stringify(data);
      this.dispatchEvent(event);
    }
    send(payload) {
      const message = typeof payload === "string" ? JSON.parse(payload) : null;
      if (message?.type === "session.update") {
        assert.equal(message.session.type, "transcription");
        this.emit({ type: "session.updated" });
        return;
      }
      if (message?.type === "input_audio_buffer.commit") {
        this.emit({ type: "input_audio_buffer.committed", item_id: "turn-1" });
        this.emit({ type: "conversation.item.input_audio_transcription.completed", item_id: "turn-1", transcript: final });
        return;
      }
      if (message?.type === "input_audio_buffer.append") {
        sent.openai.push(Buffer.from(message.audio, "base64"));
        if (sent.openai.length === 1) this.emit({ type: "conversation.item.input_audio_transcription.delta", item_id: "turn-1", delta: "\u0dc3" });
        return;
      }
      if (message?.setup) {
        completeGeminiSetup = () => this.emit({ setupComplete: {} });
        return;
      }
      if (message?.type === "KeepAlive") {
        assert.equal(this.provider, "deepgram");
        keepAlive.push(message);
        return;
      }
      if (message?.type === "CloseStream" || message?.realtimeInput?.audioStreamEnd) {
        if (message?.type === "CloseStream") {
          this.readyState = Socket.CLOSING;
          this.dispatchEvent(new Event("close"));
        } else this.emit({ serverContent: { inputTranscription: { text: final } } });
        return;
      }
      assert.ok(playing);
      sent[this.provider].push(message
        ? Buffer.from(message.realtimeInput.audio.data, "base64") : Buffer.from(payload));
      if (sent[this.provider].length === 1) {
        const text = "\u0dc3";
        this.emit(this.provider === "deepgram"
          ? { type: "Results", is_final: false, channel: { alternatives: [{ transcript: text }] } }
          : { serverContent: { interimInputTranscription: { text } } });
      }
      if (this.provider === "deepgram" && sent.deepgram.length === 2) {
        this.emit({ type: "Results", is_final: true, speech_final: true, channel: { alternatives: [{ transcript: final }] } });
      }
    }
    close() { this.readyState = Socket.CLOSING; }
  }
  class TestAudioContext {
    state = "running";
    sampleRate = 48000;
    destination = destination;
    get currentTime() { return audioTime; }
    async resume() {}
    async close() { this.state = "closed"; contextClosed = true; }
    createBufferSource() { return playback; }
  }
  class TestOfflineAudioContext {
    constructor(_channels, _length, rate) { assert.equal(rate, 16000); }
    async decodeAudioData() {
      return {
        length: 640, numberOfChannels: 1, duration: 0.04,
        getChannelData: () => new Float32Array(640).fill(0.5),
      };
    }
  }
  const SpeechSDK = {
    PropertyId: { Speech_SegmentationSilenceTimeoutMs: 1 },
    ResultReason: { RecognizedSpeech: 3 },
    SpeechConfig: { fromAuthorizationToken(token, region) {
      assert.equal(token, "azure-session-fixture");
      assert.equal(region, "southeastasia");
      return { setProperty(id, value) { assert.deepEqual([id, value], [1, "400"]); } };
    } },
    AudioStreamFormat: { getWaveFormatPCM(...format) { assert.deepEqual(format, [16000, 16, 1]); return format; } },
    AudioConfig: { fromStreamInput: (input) => input },
    AudioInputStream: { createPushStream() {
      return {
        write(bytes) {
          assert.ok(playing);
          sent.azure.push(Buffer.from(bytes));
          if (sent.azure.length === 1) azureRecognizer.recognizing(null, { result: { text: "\u0dc3" } });
        },
        close() {
          queueMicrotask(() => {
            azureRecognizer.recognized(null, { result: { text: final, reason: 3 } });
            azureRecognizer.sessionStopped();
          });
        },
      };
    } },
    SpeechRecognizer: class {
      constructor(config) { assert.equal(config.speechRecognitionLanguage, "si-LK"); azureRecognizer = this; }
      startContinuousRecognitionAsync() { queueMicrotask(() => this.sessionStarted()); }
      close() { azureClosed = true; }
    },
  };
  const requested = [];
  const cleanupBodies = [];
  let releaseSecondCleanup;
  const audio = "assets/code-phone-fan.wav";
  const { nodes } = initDashboard("#live", {
    URL, btoa, WebSocket: Socket, AudioContext: TestAudioContext, OfflineAudioContext: TestOfflineAudioContext, AbortController, SpeechSDK,
    performance: { now: () => wallTime },
    async fetch(url, options) {
      if (url === "/api/live-session" && options.method === "GET") {
        return { ok: true, json: async () => ({ providers: ["deepgram", "gemini", "openai", "azure", "groq"] }) };
      }
      requested.push(url);
      if (url === audio) return { ok: true, arrayBuffer: () => new Blob([fs.readFileSync(path.join(site, audio))]).arrayBuffer() };
      if (url === "/api/live-cleanup") {
        const body = JSON.parse(options.body);
        cleanupBodies.push(body);
        if (cleanupBodies.length === 2) await new Promise((resolve) => { releaseSecondCleanup = resolve; });
        return { ok: true, json: async () => { wallTime += 680; return { text: `${body.text}.`, model: "qwen/qwen3.8-27b", apiMs: 620 }; } };
      }
      if (url === "/api/groq-transcribe") {
        assert.deepEqual(Buffer.from(JSON.parse(options.body).audio, "base64"), Buffer.concat(sent.deepgram));
        return { ok: true, json: async () => ({ text: final, apiMs: 660 }) };
      }
      assert.equal(url, "/api/live-session");
      assert.equal(options.method, "POST");
      assert.equal(options.body, undefined);
      return { ok: true, json: async () => ({
        tokens: { deepgram: "ephemeral-test", gemini: "auth_tokens/test", openai: "ek_test" },
        geminiSetup: { model: "models/gemini-3.8-live" },
        openaiSetup: { type: "transcription" },
        groqEnabled: true,
        azureSession: { token: "azure-session-fixture", region: "southeastasia" },
      }) };
    },
    setInterval(callback, delay) {
      if (delay === 3000) startupHeartbeat = callback;
      else tick = callback;
      return delay;
    },
    clearInterval() {},
    setTimeout(callback, delay) {
      if (delay >= 8000) return 0;
      clocks.push({ callback, delay });
      return clocks.length;
    },
    clearTimeout() {},
  });
  assert.deepEqual(requested, []);
  await new Promise(setImmediate);
  const readyRows = nodes["live-feeds"].children.filter((panel) => !panel.hidden);
  assert.deepEqual(readyRows.map((panel) => panel.className.split(" ").at(-1)), ["deepgram", "gemini", "azure", "openai", "groq"]);
  assert.match(readyRows.at(-1).children[0].children[0].children[0].textContent, /4 s chunks/);
  nodes["live-llm"].checked = true;
  nodes["live-review"].open = true;
  nodes["live-review"].callbacks.toggle();
  nodes["live-recording"].value = "code_switch/phone_fan";
  nodes["live-recording"].callbacks.change();
  nodes["live-reference"].value = `${final} ${final} ${short}`;
  nodes["live-reference"].callbacks.input();
  const starting = nodes["live-stream"].callbacks.click();
  await new Promise(setImmediate);
  assert.equal(playing, false);
  startupHeartbeat();
  assert.deepEqual(keepAlive, [{ type: "KeepAlive" }]);
  assert.equal(sent.deepgram.length, 0);
  completeGeminiSetup();
  await starting;
  assert.deepEqual(requested, [audio, "/api/live-session"]);
  assert.equal(playback.buffer.length, 640);
  assert.equal(playing, true);
  startupHeartbeat();
  assert.equal(keepAlive.length, 1);
  assert.match(nodes["live-status"].textContent, /Playing and streaming/);
  assert.equal(readyRows[0].children[1].children[3].hidden, true);
  assert.equal(nodes["live-progress"].hidden, false);
  assert.equal(nodes["live-progress"].max, 0.04);
  assert.ok(nodes["live-feeds"].children.every((panel) => !panel.hidden));
  assert.equal(readyRows[3].children[1].hidden, false);
  assert.equal(readyRows[3].children[2].hidden, false);
  for (const panel of nodes["live-feeds"].children.filter((entry) => !entry.className.endsWith("groq"))) {
    const [transcript, timing] = panel.children[1].children;
    assert.equal(transcript.children[0].textContent, "\u0dc3");
    assert.equal(timing.textContent, "Interim received at recording 0:00.0");
  }
  assert.equal(sent.deepgram.length, 1);
  assert.equal(clocks[0].delay, 20);
  audioTime += 0.02;
  tick();
  assert.ok(Math.abs(nodes["live-progress"].value - 0.02) < 0.000001);
  clocks.shift().callback();
  assert.equal(sent.deepgram.length, 2);
  assert.deepEqual(sent.deepgram, sent.gemini);
  assert.deepEqual(sent.deepgram, sent.azure);
  assert.equal(sent.deepgram[0].byteLength, 640);
  assert.equal(sent.openai.length, 2);
  assert.equal(sent.openai[0].byteLength, 960);
  assert.equal(sent.openai[0].readInt16LE(0), sent.deepgram[0].readInt16LE(0));
  assert.equal(clocks.length, 0);
  assert.equal(playing, true);
  assert.deepEqual(cleanupBodies, [{ text: final, context: "" }]);
  assert.equal(requested.includes("/api/groq-transcribe"), false);
  await new Promise(setImmediate);
  const emitDeepgram = (transcript, isFinal) => deepgramSocket.emit({
    type: "Results", is_final: isFinal, speech_final: isFinal, channel: { alternatives: [{ transcript }] },
  });
  const liveText = nodes["live-feeds"].children[0].children[1].children[0];
  nodes["live-stage"].value = "llm";
  nodes["live-stage"].callbacks.change();
  emitDeepgram(final, true);
  emitDeepgram(short, false);
  assert.deepEqual(cleanupBodies, [{ text: final, context: "" }, { text: final, context: final }]);
  assert.equal(liveText.children[0].textContent, `${final}.`);
  assert.equal(liveText.children[1].className, "waiting");
  assert.equal(liveText.children[2].className, "interim");
  assert.equal(liveText.children[2].textContent.trim(), short);
  emitDeepgram(short, true);
  assert.equal(cleanupBodies.length, 2);
  releaseSecondCleanup();
  await new Promise(setImmediate);
  assert.deepEqual(cleanupBodies[2], { text: short, context: `${final}\n${final}` });
  assert.deepEqual(liveText.children.map((child) => child.textContent), [`${final}.`, ` ${final}.`, ` ${short}.`]);
  assert.match(nodes["live-status"].textContent, /Playing and streaming/);
  nodes["live-stage"].value = "raw";
  nodes["live-stage"].callbacks.change();
  playback.onended();
  assert.equal(sent.openai[2].byteLength, 2880);
  assert.equal(nodes["live-progress"].value, 0.04);
  assert.equal(contextClosed, false);
  await new Promise(setImmediate);
  assert.equal(azureClosed, true);
  assert.equal(cleanupBodies.length, 3);
  wallTime += 5000;
  clocks.shift().callback();
  await new Promise(setImmediate);
  assert.equal(contextClosed, true);
  assert.equal(azureClosed, true);
  assert.equal(cleanupBodies.length, 3);
  assert.equal(requested.filter((url) => url === "/api/groq-transcribe").length, 1);
  assert.match(nodes["live-status"].textContent, /complete/i);
  const deepgramAccuracy = readyRows[0].children[1].children[3];
  assert.equal(deepgramAccuracy.hidden, false);
  assert.equal(deepgramAccuracy.textContent, "WER 0.0% · CER 0.0%");
  assert.equal(nodes["live-review-raw-score"].textContent, "CER 0.0% · WER 0.0%");
  assert.equal(nodes["live-review-llm-score"].textContent, "CER 0.0% · WER 0.0%");
  nodes["live-review-provider"].value = "azure";
  nodes["live-review-provider"].callbacks.change();
  assert.equal(transcriptText(nodes["live-review-raw"]), final);
  assert.equal(transcriptText(nodes["live-review-llm"]), `${final}.`);
  assert.ok(nodes["live-review-raw"].children.some((word) => word.className === "diff-missing"));
  assert.ok(nodes["live-review-llm"].children.some((word) => word.className === "diff-missing"));
  for (const panel of nodes["live-feeds"].children) {
    const [transcript, timing, note] = panel.children[1].children;
    const [, details] = panel.children[2].children;
    const [summary, table] = details.children;
    assert.equal(panel.children[0].children[1].textContent, "Complete");
    assert.equal(transcript.children[0].textContent, panel.className.endsWith("deepgram") ? `${final} ${final} ${short}` : final);
    assert.match(timing.textContent, /Final received at /);
    assert.match(summary.children[1].textContent, /total$/);
    const rows = table.children[2].children;
    assert.equal(rows[1].children[1].textContent, "0.0 ms");
    assert.match(rows[2].children[2].textContent, /(?:ms|s)$/);
    assert.match(rows[3].children[2].textContent, /(?:ms|s)$/);
    assert.match(note.textContent, /qwen\/qwen3\.8-27b API 620 ms|Shared cleanup request/);
  }
  nodes["live-stage"].value = "llm";
  nodes["live-stage"].callbacks.change();
  assert.equal(deepgramAccuracy.textContent, "WER 0.0% · CER 0.0%");
  for (const panel of nodes["live-feeds"].children) assert.equal(panel.children[1].children[0].children[0].textContent, `${final}.`);
});

test("cleanup uses Flash-Lite with minimal thinking and rejects a change to digits", async (t) => {
  const key = process.env.GOOGLE_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  process.env.GOOGLE_API_KEY = "example-cleanup-key";
  t.after(() => {
    if (key === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = key;
    if (groqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqKey;
  });
  const text = "\u0dc3\u0dd2 2048";
  const context = "\u0db8\u0dda fiber package 2048";
  let output = `${text}.`;
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.startsWith("https://api.groq.com/")) {
      assert.equal(options.headers.Authorization, "Bearer example-groq-key");
      const { model, reasoning_effort, messages } = JSON.parse(options.body);
      assert.equal(model, "qwen/qwen3.8-27b");
      assert.equal(reasoning_effort, "none");
      assert.match(messages[0].content, /Return only the corrected current chunk/);
      assert.deepEqual(JSON.parse(messages[1].content), { text, context });
      return { ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: output } }] }) };
    }
    assert.match(url, /gemini-3\.5-flash-lite:generateContent$/);
    assert.equal(options.headers["x-goog-api-key"], "example-cleanup-key");
    const request = JSON.parse(options.body);
    assert.equal(request.generationConfig.thinkingConfig.thinkingLevel, "MINIMAL");
    assert.deepEqual(JSON.parse(request.contents[0].parts[0].text), { text, context });
    return { ok: true, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: output }] } }] }) };
  });
  const response = () => ({
    headers: {}, setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; },
  });
  const invalid = response();
  await liveCleanup({ method: "POST", body: { text: " " } }, invalid);
  assert.equal(invalid.code, 400);
  await liveCleanup({ method: "POST", body: { text, context: "x".repeat(481) } }, invalid);
  assert.equal(invalid.code, 400);
  assert.equal(fetch.mock.callCount(), 0);

  const valid = response();
  await liveCleanup({ method: "POST", body: { text, context } }, valid);
  assert.equal(valid.code, 200);
  assert.equal(valid.headers["Cache-Control"], "no-store");
  assert.equal(valid.body.text, `${text}.`);
  assert.ok(Number.isFinite(valid.body.apiMs));

  output = text.replace("2048", "2049");
  const rejected = response();
  await liveCleanup({ method: "POST", body: { text, context } }, rejected);
  assert.equal(rejected.code, 422);
  assert.equal(rejected.body.text, undefined);
  output = `${context}\n${text}`;
  const repeatedContext = response();
  await liveCleanup({ method: "POST", body: { text, context } }, repeatedContext);
  assert.equal(repeatedContext.code, 422);
  assert.equal(repeatedContext.body.text, undefined);

  process.env.GROQ_API_KEY = "example-groq-key";
  output = `${text}.`;
  const fast = response();
  await liveCleanup({ method: "POST", body: { text, context } }, fast);
  assert.equal(fast.code, 200);
  assert.equal(fast.body.model, "qwen/qwen3.8-27b");
});

test("Groq STT validates the chunk and wraps its PCM without changing samples", async (t) => {
  const key = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "example-groq-key";
  t.after(() => {
    if (key === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = key;
  });
  const pcm = Buffer.alloc(640, 7);
  const upstream = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.groq.com/openai/v1/audio/transcriptions");
    assert.equal(options.body.get("language"), "si");
    const wav = Buffer.from(await options.body.get("file").arrayBuffer());
    assert.equal(wav.readUInt32LE(24), 16000);
    assert.deepEqual(wav.subarray(44), pcm);
    return { ok: true, json: async () => ({ text: "\u0dc3\u0dd2" }) };
  });
  const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
  const invalid = response();
  await groqTranscribe({ method: "POST", body: { audio: "!" } }, invalid);
  assert.equal(invalid.code, 400);
  assert.equal(upstream.mock.callCount(), 0);
  const valid = response();
  await groqTranscribe({ method: "POST", body: { audio: pcm.toString("base64") } }, valid);
  assert.equal(valid.code, 200);
  assert.equal(valid.body.text, "\u0dc3\u0dd2");
});

test("session endpoint lists configured providers without minting tokens and starts them automatically", async (t) => {
  const keys = ["DEEPGRAM_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "LIVE_TEST_ENABLED"];
  const original = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    delete process.env[key];
  }
  t.after(() => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.includes("deepgram")) return { ok: false, status: 403 };
    if (url.endsWith("/issueToken")) {
      assert.equal(url, "https://southeastasia.api.cognitive.microsoft.com/sts/v1.0/issueToken");
      assert.equal(options.headers["Ocp-Apim-Subscription-Key"], "example-azure-secret");
      return { ok: true, text: async () => "azure-token-test" };
    }
    const setup = JSON.parse(options.body);
    if (url.startsWith("https://api.openai.com/")) {
      assert.equal(url, "https://api.openai.com/v1/realtime/client_secrets");
      assert.equal(options.headers.Authorization, "Bearer example-openai-secret");
      assert.equal(setup.expires_after.seconds, 20);
      assert.equal(setup.session.type, "transcription");
      assert.equal(setup.session.audio.input.transcription.model, "gpt-live-transcribe");
      assert.equal(setup.session.audio.input.turn_detection, null);
      assert.equal(setup.session.audio.input.format.rate, 24000);
      return { ok: true, json: async () => ({ value: "ek_test" }) };
    }
    assert.equal(setup.uses, 1);
    assert.equal(setup.bidiGenerateContentSetup.inputAudioTranscription.languageCodes[0], "si");
    return { ok: true, json: async () => ({ name: "auth_tokens/test-only" }) };
  });
  const makeResponse = () => ({
    headers: {}, setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; },
  });
  const disabled = makeResponse();
  await liveSession({ method: "POST" }, disabled);
  assert.equal(disabled.code, 503);
  assert.match(disabled.body.error, /API key in Vercel/);
  process.env.GROQ_API_KEY = "example-groq-key";
  const onlyGroq = makeResponse();
  await liveSession({ method: "POST" }, onlyGroq);
  assert.equal(onlyGroq.code, 200);
  assert.equal(onlyGroq.body.groqEnabled, true);
  process.env.GOOGLE_API_KEY = "example-google-secret";
  const crossSite = makeResponse();
  await liveSession({ method: "POST", headers: { "sec-fetch-site": "cross-site" } }, crossSite);
  assert.equal(crossSite.code, 403);
  assert.equal(fetch.mock.callCount(), 0);
  const onlyGemini = makeResponse();
  await liveSession({ method: "POST" }, onlyGemini);
  assert.equal(onlyGemini.code, 200);
  assert.deepEqual(onlyGemini.body.tokens, { gemini: "auth_tokens/test-only" });
  assert.match(onlyGemini.body.errors.openai, /Set OPENAI_API_KEY/);
  assert.match(onlyGemini.body.errors.deepgram, /Set DEEPGRAM_API_KEY/);
  assert.equal(fetch.mock.callCount(), 1);
  process.env.DEEPGRAM_API_KEY = "example-deepgram-secret";
  process.env.OPENAI_API_KEY = "example-openai-secret";
  const granted = makeResponse();
  await liveSession({ method: "POST", headers: { "sec-fetch-site": "same-origin" } }, granted);
  assert.equal(granted.code, 200);
  assert.equal(granted.headers["Cache-Control"], "no-store");
  assert.deepEqual(granted.body.tokens, { gemini: "auth_tokens/test-only", openai: "ek_test" });
  assert.match(granted.body.errors.deepgram, /403/);
  process.env.AZURE_SPEECH_KEY = "example-azure-secret";
  process.env.AZURE_SPEECH_REGION = "bad.host";
  const invalidAzure = makeResponse();
  await liveSession({ method: "POST" }, invalidAzure);
  assert.equal(invalidAzure.code, 200);
  assert.match(invalidAzure.body.errors.azure, /AZURE_SPEECH_REGION/);
  const beforeDiscovery = fetch.mock.callCount();
  const configured = makeResponse();
  await liveSession({ method: "GET" }, configured);
  assert.equal(configured.code, 200);
  assert.deepEqual(configured.body, { providers: ["deepgram", "gemini", "openai", "groq"] });
  assert.equal(fetch.mock.callCount(), beforeDiscovery);
  delete process.env.DEEPGRAM_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.AZURE_SPEECH_REGION = "SoutheastAsia";
  const configuredAzure = makeResponse();
  await liveSession({ method: "GET" }, configuredAzure);
  assert.deepEqual(configuredAzure.body, { providers: ["azure", "groq"] });
  assert.equal(fetch.mock.callCount(), beforeDiscovery);
  const withAzure = makeResponse();
  await liveSession({ method: "POST" }, withAzure);
  assert.equal(withAzure.code, 200);
  assert.deepEqual(withAzure.body.tokens, {});
  assert.deepEqual(withAzure.body.azureSession, { token: "azure-token-test", region: "southeastasia" });
  assert.doesNotMatch(JSON.stringify(withAzure.body), /example-.*secret/);
  assert.doesNotMatch(JSON.stringify(granted.body), /example-.*secret/);
});

test("Show results pauses and reveals both transcripts and captured cleanup", async () => {
  const { nodes, data } = initDashboard();
  await nodes.play.callbacks.click();
  nodes.results.callbacks.click();
  assert.equal(nodes.audio.paused, true);
  assert.equal(nodes.position.value, nodes.position.max);
  assert.match(nodes["deepgram-status"].textContent, /captured/i);
  assert.match(nodes["gemini-status"].textContent, /captured/i);
  assert.equal(transcriptText(nodes["llm-output"]), data.clips[0].cleanup.deepgram.text);
  assert.ok(nodes["llm-output"].children.some((word) => word.className?.startsWith("diff-")));
  assert.equal(nodes["deepgram-text"].scrollTop, 0);
  nodes.audio.callbacks.ended();
  assert.equal(nodes.position.value, nodes.position.max);
  assert.equal(nodes["player-status"].textContent, "Showing all captured results.");
});

test("accuracy uses edits and ignores cosmetic formatting", () => {
  assert.deepEqual(core.score("Hello, world!", " hello WORLD "), { wer: 0, cer: 0 });
  assert.equal(core.score("one two", "one").wer, 0.5);
  assert.equal(core.score("one", "one two three").wer, 2);
  assert.equal(core.score("\u0dc3\u0dd2\u0d82\u0dc4\u0dbd", "\u0dc3\u0dd2\u0d82\u0dc4\u0dbd").cer, 0);
  assert.equal(core.score("...", "hello"), null);
});

test("word highlights align substitutions, insertions and omissions without changing the output", () => {
  const reference = "One, absent stay two anchor last!";
  const output = "ONE stay too anchor added last.";
  const pieces = core.diffWords(reference, output);
  assert.deepEqual(pieces.filter((piece) => piece.kind).map(({ kind, text, target }) => [kind, text, target]), [
    ["missing", "absent", undefined], ["changed", "too", "two"], ["extra", "added", undefined],
  ]);
  assert.equal(pieces.filter((piece) => piece.kind !== "missing").map((piece) => piece.text).join(""), output);
  assert.deepEqual(core.diffWords("Hello, world!", " hello WORLD "), [{ text: " hello WORLD " }]);
  assert.deepEqual(core.diffWords("නිදහස් සෞඛ්‍ය පහසුකම්", "නිදහස පහසුකම්").filter((piece) => piece.kind)
    .map(({ kind, text, target }) => [kind, text, target]), [["changed", "නිදහස", "නිදහස්"], ["missing", "සෞඛ්‍ය", undefined]]);
});

test("first text, Sinhala script, interim and final come from the replay clock", () => {
  const feed = [[1, "hello", false], [2, "\u0dc3\u0dd2", true]];
  assert.equal(core.observe(feed, 0.9).first, null);
  assert.equal(core.observe(feed, 1.1).interim, "hello");
  assert.equal(core.observe(feed, 1.1).firstSinhala, null);
  assert.equal(core.observe(feed, 2).firstSinhala, 2);
  assert.equal(core.observe(feed, 2).firstFinal, 2);
});

test("site contains six simulated cases with matched audio and cleanup", () => {
  const { data } = initDashboard();
  assert.equal(data.clips.length, 6);
  assert.equal(data.metrics.calls.length, 3);
  assert.doesNotMatch(load("assets/demo-data.js"), /real_call_|API_KEY|my_recordings/u);
  for (const clip of data.clips) {
    assert.match(clip.audio, /^assets\/(pause|code)-(clean|g711_alaw|telephone_noise_10db)\.wav$/);
    assert.equal(fs.readFileSync(path.join(site, clip.audio)).subarray(0, 4).toString(), "RIFF");
    assert.ok(clip.speechStart < clip.speechEnd && clip.speechEnd <= clip.duration);
    for (const id of ["deepgram", "gemini"]) {
      assert.ok(clip.events[id].length && clip.raw[id].length);
      assert.ok(clip.events[id].every((event, i, arr) => i === 0 || event[0] >= arr[i - 1][0]));
      assert.ok(clip.cleanup[id].text && clip.cleanup[id].seconds > 0);
    }
  }
});

test("dashboard plays, updates metrics, scores complete stages and keeps references by scenario", async () => {
  const { nodes, data } = initDashboard();
  const clip = data.clips[0];
  assert.equal(nodes.metrics.children.length, 2);
  assert.equal(nodes["call-rows"].children.length, 3);
  assert.equal(nodes["deepgram-interims"].textContent, 0);
  await nodes.play.callbacks.click();
  assert.equal(nodes["play-label"].textContent, "Pause");
  await nodes.play.callbacks.click();
  assert.equal(nodes["play-label"].textContent, "Play");
  nodes.position.value = "20";
  nodes.position.callbacks.input();
  assert.ok(nodes["deepgram-interims"].textContent > 0);
  assert.match(nodes["llm-output"].textContent, /full transcript/);
  nodes.reference.value = clip.raw.deepgram;
  nodes.reference.callbacks.input();
  assert.match(nodes["raw-score"].textContent, /complete/);
  nodes.position.value = nodes.position.max;
  nodes.position.callbacks.input();
  assert.equal(nodes["raw-score"].textContent, "CER 0.0% \u00b7 WER 0.0%");
  assert.equal(transcriptText(nodes["llm-output"]), clip.cleanup.deepgram.text);
  nodes["cleanup-provider"].value = "gemini";
  nodes["cleanup-provider"].callbacks.change();
  assert.equal(transcriptText(nodes["llm-output"]), clip.cleanup.gemini.text);
  nodes.restart.callbacks.click();
  assert.equal(nodes.audio.currentTime, 0);
  assert.equal(nodes["deepgram-arrival"].textContent, "\u2014");
  nodes.clip.value = "pause_and_talk/g711_alaw";
  nodes.clip.callbacks.change();
  assert.equal(nodes.reference.value, clip.raw.deepgram);
  nodes.scenario.value = "code_switch";
  nodes.scenario.callbacks.change();
  assert.match(nodes.audio.src, /code-g711_alaw/);
  assert.match(nodes.reference.value, /^මම වැඩියෙන්ම අන්තර්ජාලය/);
});

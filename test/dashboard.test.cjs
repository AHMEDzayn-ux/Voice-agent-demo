"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../public/demo-core.js");
const wire = require("../public/live-wire.js");
const liveSession = require("../api/live-session.js");

const site = path.join(__dirname, "..", "public");
const load = (file) => fs.readFileSync(path.join(site, file), "utf8");
const html = load("index.html");

function initDashboard(initialHash = "", runtime = {}) {
  function node() {
    return {
      children: [], callbacks: {}, style: {}, textContent: "", value: "", clientWidth: 420, clientHeight: 54,
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
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
  nodes["reply-minutes"].value = "3000";
  nodes["cleanup-requests"].value = "2000";
  const browser = {
    document: { getElementById: (id) => nodes[id], createElement: node },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, performance: { now: () => 123 },
    location: { hash: initialHash },
    history: { replaceState(_state, _title, hash) { browser.location.hash = hash; } },
    Blob, atob,
    URL: { createObjectURL: () => "blob:test-call", revokeObjectURL() {} },
    listeners: {},
    devicePixelRatio: 2, addEventListener(name, callback) { this.listeners[name] = callback; },
    ...runtime,
  };
  browser.window = browser;
  const sandbox = vm.createContext(browser);
  for (const file of ["assets/demo-data.js", "demo-core.js", "live-wire.js", "app.js", "live.js"]) {
    vm.runInContext(load(file), sandbox, { filename: file });
  }
  return { nodes, data: browser.DEMO_DATA, browser };
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
  assert.equal(nodes.replay.hidden, false);
  assert.equal(nodes.cleanup.hidden, true);
  assert.equal(nodes.benchmark.hidden, true);
  await nodes.play.callbacks.click();
  nodes["tab-cleanup"].callbacks.click();
  assert.equal(nodes.replay.hidden, true);
  assert.equal(nodes.cleanup.hidden, false);
  assert.equal(nodes.audio.paused, false);
  assert.equal(browser.location.hash, "#cleanup");
  let prevented = false;
  nodes["tab-cleanup"].callbacks.keydown({ key: "ArrowRight", preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(nodes.benchmark.hidden, false);
  assert.equal(nodes.cleanup.hidden, true);
  assert.equal(nodes["tab-benchmark"].focused, true);
  assert.equal(nodes["tab-benchmark"].tabIndex, 0);
  assert.equal(nodes["tab-cleanup"].tabIndex, -1);
  browser.location.hash = "#replay";
  browser.listeners.hashchange();
  assert.equal(nodes.replay.hidden, false);
  assert.equal(nodes.benchmark.hidden, true);
  assert.equal(initDashboard("#cleanup").nodes.cleanup.hidden, false);
});

test("price calculator uses published units and captured cleanup usage", () => {
  const result = core.estimateCosts(10000, 3000, 2000);
  assert.equal(result.nova.toFixed(2), "48.00");
  assert.equal(result.openai.toFixed(2), "170.00");
  assert.equal(result.geminiInput, 45);
  assert.equal(result.geminiOutput, 54);
  assert.equal(result.cleanup.toFixed(2), "0.84");
  assert.equal(core.estimateCosts(-1, 0, 0), null);
  const { nodes } = initDashboard();
  assert.equal(nodes["cost-nova"].textContent, "$48.00/mo");
  assert.equal(nodes["cost-gemini"].textContent, "$99.00/mo");
  assert.equal(nodes["cost-openai"].textContent, "$170.00/mo");
  assert.equal(nodes["cost-cleanup"].textContent, "$0.84/mo");
  nodes["reply-minutes"].value = "0";
  nodes["reply-minutes"].callbacks.input();
  assert.equal(nodes["cost-gemini"].textContent, "$45.00/mo");
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

test("live view offers bundled recordings and can select a local file without starting a session", () => {
  const { nodes } = initDashboard();
  nodes["tab-live"].callbacks.click();
  assert.equal(nodes.live.hidden, false);
  assert.equal(nodes["replay-console"].hidden, true);
  assert.equal(nodes["live-feeds"].children.length, 3);
  assert.equal(nodes["live-passcode"], undefined);
  assert.equal(nodes["live-load-real"], undefined);
  const recordings = nodes["live-recording"];
  assert.equal(recordings.children.length, 1);
  assert.equal(recordings.children[0].label, "Simulated recordings");
  assert.equal(recordings.children[0].children.length, 8);
  assert.equal(recordings.value, "pause_and_talk/clean");
  for (const condition of ["fan", "office"]) {
    assert.ok(recordings.children[0].children.some((option) => option.value === `pause_and_talk/${condition}_noise_10db`));
    assert.ok(fs.statSync(path.join(site, `assets/pause-${condition}_noise_10db.wav`)).size > 0);
  }
  const input = nodes["live-file"];
  input.files = [{ name: "sample.mp3", size: 10 }];
  input.callbacks.change({ target: input });
  assert.equal(recordings.value, "local-file");
  assert.equal(recordings.children[1].children[0].textContent, "sample.mp3");
  assert.match(nodes["live-status"].textContent, /ready/);
  nodes["tab-replay"].callbacks.click();
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

test("a noisy recording plays and streams to all three providers", async () => {
  const sent = { deepgram: [], gemini: [], openai: [] };
  const clocks = [];
  let tick;
  let audioTime = 1;
  let playing = false;
  let contextClosed = false;
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
        this.emit({ type: "conversation.item.input_audio_transcription.completed", item_id: "turn-1", transcript: "\u0dc3\u0dd2" });
        return;
      }
      if (message?.type === "input_audio_buffer.append") {
        sent.openai.push(Buffer.from(message.audio, "base64"));
        if (sent.openai.length === 1) this.emit({ type: "conversation.item.input_audio_transcription.delta", item_id: "turn-1", delta: "\u0dc3" });
        return;
      }
      if (message?.setup) {
        queueMicrotask(() => this.emit({ setupComplete: {} }));
        return;
      }
      if (message?.type === "CloseStream" || message?.realtimeInput?.audioStreamEnd) {
        const text = "\u0dc3\u0dd2";
        this.emit(this.provider === "deepgram"
          ? { type: "Results", is_final: true, channel: { alternatives: [{ transcript: text }] } }
          : { serverContent: { inputTranscription: { text } } });
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
  const requested = [];
  const audio = "assets/pause-fan_noise_10db.wav";
  const { nodes } = initDashboard("#live", {
    URL, btoa, WebSocket: Socket, AudioContext: TestAudioContext, OfflineAudioContext: TestOfflineAudioContext, AbortController,
    async fetch(url, options) {
      requested.push(url);
      if (url === audio) return { ok: true, arrayBuffer: () => new Blob([fs.readFileSync(path.join(site, audio))]).arrayBuffer() };
      assert.equal(url, "/api/live-session");
      assert.equal(options.method, "POST");
      assert.equal(options.body, undefined);
      return { ok: true, json: async () => ({
        tokens: { deepgram: "ephemeral-test", gemini: "auth_tokens/test", openai: "ek_test" },
        geminiSetup: { model: "models/gemini-3.8-live" },
        openaiSetup: { type: "transcription" },
      }) };
    },
    setInterval(callback) { tick = callback; return 0; },
    clearInterval() {},
    setTimeout(callback, delay) {
      if (delay >= 8000) return 0;
      clocks.push({ callback, delay });
      return clocks.length;
    },
    clearTimeout() {},
  });
  assert.deepEqual(requested, []);
  nodes["live-recording"].value = "pause_and_talk/fan_noise_10db";
  await nodes["live-stream"].callbacks.click();
  assert.deepEqual(requested, [audio, "/api/live-session"]);
  assert.equal(playback.buffer.length, 640);
  assert.equal(playing, true);
  assert.match(nodes["live-status"].textContent, /Playing and streaming/);
  assert.equal(nodes["live-progress"].hidden, false);
  assert.equal(nodes["live-progress"].max, 0.04);
  for (const panel of nodes["live-feeds"].children) {
    assert.equal(panel.children[2].children[0].textContent, "\u0dc3");
    assert.equal(panel.children[3].textContent, "Interim received at recording 0:00.0");
  }
  assert.equal(sent.deepgram.length, 1);
  assert.equal(clocks[0].delay, 20);
  audioTime += 0.02;
  tick();
  assert.ok(Math.abs(nodes["live-progress"].value - 0.02) < 0.000001);
  clocks.shift().callback();
  assert.equal(sent.deepgram.length, 2);
  assert.deepEqual(sent.deepgram, sent.gemini);
  assert.equal(sent.deepgram[0].byteLength, 640);
  assert.equal(sent.openai.length, 2);
  assert.equal(sent.openai[0].byteLength, 960);
  assert.equal(sent.openai[0].readInt16LE(0), sent.deepgram[0].readInt16LE(0));
  assert.equal(clocks.length, 0);
  assert.equal(playing, true);
  playback.onended();
  assert.equal(sent.openai[2].byteLength, 2880);
  assert.equal(nodes["live-progress"].value, 0.04);
  assert.equal(contextClosed, false);
  clocks.shift().callback();
  await Promise.resolve();
  assert.equal(contextClosed, true);
  assert.match(nodes["live-status"].textContent, /complete/i);
  for (const panel of nodes["live-feeds"].children) {
    assert.equal(panel.children[0].children[1].textContent, "Complete");
    assert.equal(panel.children[2].children[0].textContent, "\u0dc3\u0dd2");
    assert.match(panel.children[3].textContent, /Final received .* after playback/);
  }
});

test("token endpoint works with one configured provider and mints an ephemeral OpenAI token", async (t) => {
  const keys = ["DEEPGRAM_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "LIVE_TEST_ENABLED"];
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
  assert.match(disabled.body.error, /OPENAI_API_KEY/);
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
  assert.equal(nodes["llm-output"].textContent, data.clips[0].cleanup.deepgram.text);
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
  assert.equal(nodes["llm-output"].textContent, "");
  nodes.reference.value = clip.raw.deepgram;
  nodes.reference.callbacks.input();
  assert.match(nodes["raw-score"].textContent, /complete/);
  nodes.position.value = nodes.position.max;
  nodes.position.callbacks.input();
  assert.equal(nodes["raw-score"].textContent, "CER 0.0% \u00b7 WER 0.0%");
  assert.equal(nodes["llm-output"].textContent, clip.cleanup.deepgram.text);
  nodes["cleanup-provider"].value = "gemini";
  nodes["cleanup-provider"].callbacks.change();
  assert.equal(nodes["llm-output"].textContent, clip.cleanup.gemini.text);
  nodes.restart.callbacks.click();
  assert.equal(nodes.audio.currentTime, 0);
  assert.equal(nodes["deepgram-arrival"].textContent, "\u2014");
  nodes.clip.value = "pause_and_talk/g711_alaw";
  nodes.clip.callbacks.change();
  assert.equal(nodes.reference.value, clip.raw.deepgram);
  nodes.scenario.value = "code_switch";
  nodes.scenario.callbacks.change();
  assert.match(nodes.audio.src, /code-g711_alaw/);
  assert.equal(nodes.reference.value, "");
});

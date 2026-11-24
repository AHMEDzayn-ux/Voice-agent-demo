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
  assert.equal(result.geminiInput, 45);
  assert.equal(result.geminiOutput, 54);
  assert.equal(result.cleanup.toFixed(2), "0.84");
  assert.equal(core.estimateCosts(-1, 0, 0), null);
  const { nodes } = initDashboard();
  assert.equal(nodes["cost-nova"].textContent, "$48.00/mo");
  assert.equal(nodes["cost-gemini"].textContent, "$99.00/mo");
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

test("live view has separate controls and does not open a session without a passcode", () => {
  const { nodes } = initDashboard();
  nodes["tab-live"].callbacks.click();
  assert.equal(nodes.live.hidden, false);
  assert.equal(nodes["replay-console"].hidden, true);
  assert.equal(nodes["live-feeds"].children.length, 2);
  nodes["live-mic"].callbacks.click();
  assert.match(nodes["live-status"].textContent, /passcode/);
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

test("file test opens both streams, fans out identical audio, and finishes both transcripts", async () => {
  const sent = { deepgram: [], gemini: [] };
  const clocks = [];
  class Socket extends EventTarget {
    static OPEN = 1;
    static CLOSING = 2;
    readyState = 0;
    bufferedAmount = 0;
    constructor(url) {
      super();
      this.provider = url.hostname.startsWith("api.deepgram") ? "deepgram" : "gemini";
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
      sent[this.provider].push(message
        ? Buffer.from(message.realtimeInput.audio.data, "base64") : Buffer.from(payload));
    }
    close() { this.readyState = Socket.CLOSING; }
  }
  class TestAudioContext {
    state = "running";
    sampleRate = 16000;
    async resume() {}
    async close() { this.state = "closed"; }
    async decodeAudioData() {
      return {
        length: 320, numberOfChannels: 1, duration: 0.02,
        getChannelData: () => new Float32Array(320).fill(0.5),
      };
    }
  }
  const { nodes } = initDashboard("#live", {
    URL, btoa, WebSocket: Socket, AudioContext: TestAudioContext, AbortController,
    fetch: async () => ({ ok: true, json: async () => ({
      tokens: { deepgram: "ephemeral-test", gemini: "auth_tokens/test" },
      geminiSetup: { model: "models/gemini-3.8-live" },
    }) }),
    setInterval: () => 0, clearInterval() {},
    setTimeout(callback, delay) {
      if (delay >= 8000) return 0;
      clocks.push(callback);
      return clocks.length;
    },
    clearTimeout() {},
  });
  nodes["live-passcode"].value = "test-fixture-passcode";
  nodes["live-file"].files = [{ size: 10, arrayBuffer: async () => new ArrayBuffer(10) }];
  await nodes["live-upload"].callbacks.click();
  assert.equal(sent.deepgram.length, 1);
  assert.deepEqual(sent.deepgram, sent.gemini);
  assert.equal(sent.deepgram[0].byteLength, 640);
  clocks.shift()();
  clocks.shift()();
  await Promise.resolve();
  assert.match(nodes["live-status"].textContent, /complete/i);
  for (const panel of nodes["live-feeds"].children) {
    assert.equal(panel.children[0].children[1].textContent, "Complete");
    assert.equal(panel.children[2].children[0].textContent, "\u0dc3\u0dd2");
  }
});

test("token endpoint requires the private passcode and can return partial availability", async (t) => {
  const original = {};
  const values = {
    LIVE_TEST_PASSCODE: "example-fixture-passcode",
    DEEPGRAM_API_KEY: "example-deepgram-secret",
    GOOGLE_API_KEY: "example-google-secret",
  };
  for (const [key, value] of Object.entries(values)) {
    original[key] = process.env[key];
    process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.includes("deepgram")) return { ok: false, status: 403 };
    const setup = JSON.parse(options.body);
    assert.equal(setup.uses, 1);
    assert.equal(setup.bidiGenerateContentSetup.inputAudioTranscription.languageCodes[0], "si");
    return { ok: true, json: async () => ({ name: "auth_tokens/test-only" }) };
  });
  const makeResponse = () => ({
    headers: {}, setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; },
  });
  const refused = makeResponse();
  await liveSession({ method: "POST", body: { passcode: "wrong" } }, refused);
  assert.equal(refused.code, 403);
  assert.equal(fetch.mock.callCount(), 0);
  const granted = makeResponse();
  await liveSession({ method: "POST", body: { passcode: values.LIVE_TEST_PASSCODE } }, granted);
  assert.equal(granted.code, 200);
  assert.equal(granted.headers["Cache-Control"], "no-store");
  assert.deepEqual(granted.body.tokens, { gemini: "auth_tokens/test-only" });
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

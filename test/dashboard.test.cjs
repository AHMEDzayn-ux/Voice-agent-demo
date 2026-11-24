"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../public/demo-core.js");

const site = path.join(__dirname, "..", "public");
const load = (file) => fs.readFileSync(path.join(site, file), "utf8");
const html = load("index.html");

function initDashboard() {
  function node() {
    return {
      children: [], callbacks: {}, style: {}, textContent: "", value: "", clientWidth: 420, clientHeight: 54,
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
      addEventListener(name, callback) { this.callbacks[name] = callback; },
      setAttribute(name, value) { this[name] = value; },
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
  const browser = {
    document: { getElementById: (id) => nodes[id], createElement: node },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, performance: { now: () => 123 },
    devicePixelRatio: 2, addEventListener() {},
  };
  browser.window = browser;
  const sandbox = vm.createContext(browser);
  for (const file of ["assets/demo-data.js", "demo-core.js", "app.js"]) {
    vm.runInContext(load(file), sandbox, { filename: file });
  }
  return { nodes, data: browser.DEMO_DATA };
}

test("Unicode rules, literal approved terms, and numeric guard", () => {
  const rules = core.parseGlossary("u+ => U Plus\nplan => Plan A");
  assert.equal(core.clean("  u+   plan ,   planner.  ", rules), "U Plus Plan A, planner.");
  assert.equal(core.clean("  e\u0301  "), "\u00e9");
  assert.throws(() => core.parseGlossary("bad row"), /heard term/);
  assert.equal(core.digitsChanged("call 070 32", "call 070 33"), true);
  assert.equal(core.digitsChanged("070 32", "070   32!"), false);
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

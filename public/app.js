"use strict";

const el = (id) => document.getElementById(id);
const providers = [
  { id: "deepgram", label: "Nova-3", color: "#d9f585" },
  { id: "gemini", label: "Gemini Live", color: "#bda8ff" },
];
const audio = el("audio");
const canvas = el("wave");
const slider = el("position");
const shown = new Map();
const references = new Map(Object.entries(window.DEMO_REFERENCES || {}));
const core = window.BenchmarkCore;
let clip;
let timelineEnd = 0;
let frame = 0;
let tail = null;
let cleanupSignature = "";
let privateAudioUrls = [];

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function latency(ms) {
  return ms == null ? "—" : `${(ms / 1000).toFixed(2)} s`;
}

function drawWave(time) {
  if (!clip) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  if (!width || !height) return;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const progress = width * time / timelineEnd;
  const sampleWidth = width * clip.duration / timelineEnd;
  const step = sampleWidth / clip.wave.length;
  clip.wave.forEach((value, index) => {
    const x = step * index;
    const barHeight = Math.max(2, Math.sqrt(value) * (height - 9));
    context.fillStyle = x <= progress && time > 0 ? "#d9f585" : "#597673";
    context.fillRect(x, (height - barHeight) / 2, Math.max(1, step * 0.67), barHeight);
  });
  for (const provider of providers) {
    const first = clip.events[provider.id][0];
    if (!first) continue;
    const x = first[0] * width / timelineEnd;
    context.fillStyle = provider.color;
    context.fillRect(x, 1, 2, 8);
    context.fillRect(x, height - 9, 2, 8);
  }
  context.fillStyle = "#f1f8f2";
  if (time > 0) context.fillRect(Math.min(width - 2, progress), 0, 2, height);
}

function updateTranscript(provider, time) {
  const observed = core.observe(clip.events[provider.id], time);
  const finished = time >= clip.complete;
  const key = `${observed.count}:${finished}`;
  if (shown.get(provider.id) === key) return;
  shown.set(provider.id, key);
  const box = el(`${provider.id}-text`);
  box.replaceChildren();
  if (!observed.count) {
    showPlaceholder(box, finished ? "No transcript captured." : "Waiting for transcript…");
  } else {
    if (observed.raw) box.append(element("span", observed.raw));
    if (observed.interim) box.append(element("span", `${observed.raw ? " " : ""}${observed.interim}`, "interim"));
  }
  box.scrollTop = box.scrollHeight;
  const timeFromSpeech = (value) => value == null ? null : (value - clip.speechStart) * 1000;
  el(`${provider.id}-arrival`).textContent = latency(timeFromSpeech(observed.first));
  el(`${provider.id}-sinhala`).textContent = latency(timeFromSpeech(observed.firstSinhala));
  el(`${provider.id}-final`).textContent = latency(timeFromSpeech(observed.firstFinal));
  el(`${provider.id}-interims`).textContent = observed.interimCount;
  el(`${provider.id}-status`).textContent = finished ? clip.outcomes[provider.id]
    : observed.count ? (observed.interim ? "Interim update" : "Final segment") : "Waiting";
  const lag = observed.lastFinal == null ? null : (observed.lastFinal - clip.speechEnd) * 1000;
  el(`${provider.id}-note`).textContent = !finished ? "Times measured from estimated speech onset."
    : lag == null ? "No final transcript event."
      : lag < 0 ? "Last nonempty final arrived before estimated speech end."
        : `Estimated speech end to last final: ${latency(lag)}.`;
}

function showPlaceholder(box, text) {
  const placeholder = element("span", text, "waiting");
  placeholder.lang = "en";
  box.replaceChildren(placeholder);
}

function readOutput(id, text, placeholder, reference = "") {
  const box = el(id);
  if (!text) return showPlaceholder(box, placeholder);
  const pieces = reference ? core.diffWords(reference, text) : [{ text }];
  if (pieces.length === 1 && !pieces[0].kind) {
    box.textContent = pieces[0].text;
    return;
  }
  box.replaceChildren(...pieces.map(({ text, kind, target }) => {
    if (!kind) return element("span", text);
    const word = element(kind === "missing" ? "del" : "mark", text, `diff-${kind}`);
    word.title = kind === "missing" ? "Missing from this transcript" : kind === "extra" ? "Extra word" : `Expected ${target}`;
    return word;
  }));
}

function scoreLabel(reference, result, ready) {
  if (!ready) return "Score after complete output";
  if (!reference.trim()) return "Reference needed for CER and WER";
  return result ? `CER ${(result.cer * 100).toFixed(1)}% · WER ${(result.wer * 100).toFixed(1)}%`
    : "Reference needs spoken words";
}

function updateLab(time, force = false) {
  const provider = el("cleanup-provider").value;
  const observed = core.observe(clip.events[provider], time);
  const captured = clip.cleanup[provider];
  const finished = time >= clip.complete;
  const llmReady = Boolean(captured?.text) && time >= clip.complete + captured.seconds;
  const signature = `${provider}:${observed.count}:${finished}:${llmReady}`;
  if (!force && signature === cleanupSignature) return;
  cleanupSignature = signature;
  const raw = finished ? clip.raw[provider] : observed.raw;
  const reference = el("reference").value;
  const llm = llmReady ? captured.text : "";
  readOutput("raw-output", raw, "Waiting for finalized text…", finished ? reference : "");
  let waiting = "Available after the full transcript and captured cleanup delay.";
  if (finished && captured?.error) waiting = `Cleanup was unavailable in this run (${captured.error}).`;
  else if (finished && !captured) waiting = "Cleanup was unavailable for this stream.";
  readOutput("llm-output", llm, waiting, reference);
  el("llm-meta").textContent = captured?.text
    ? `Gemini Flash-Lite · +${latency(captured.seconds * 1000)}`
    : "Captured Gemini Flash-Lite request";
  const rawScore = finished && reference ? core.score(reference, raw) : null;
  const llmScore = llmReady && reference ? core.score(reference, llm) : null;
  el("raw-score").textContent = scoreLabel(reference, rawScore, finished);
  el("llm-score").textContent = scoreLabel(reference, llmScore, llmReady);
  const llmDigits = llmReady && core.digitsChanged(raw, llm);
  el("llm-guard").textContent = llmDigits ? "Review the changed digit sequences." : "";
  let verdict = "Compare the raw and cleaned text against the reference and check the added cleanup delay.";
  if (!finished) verdict = "Only completed transcripts are scored. Final segments appear here as the stream runs.";
  if (llmScore && rawScore) {
    if (llmDigits) verdict = "The LLM changed digit sequences on this sample. Check the audio before relying on the result.";
    else if (llmScore.cer < rawScore.cer && llmScore.wer <= rawScore.wer) {
      const gain = ((rawScore.cer - llmScore.cer) * 100).toFixed(1);
      verdict = `Cleanup reduced CER by ${gain} percentage points on this sample. Review critical terms and weigh the extra delay.`;
    } else verdict = "Check the scores and highlights to see how the LLM changed this sample.";
  }
  el("cleanup-note").textContent = verdict;
}

function render(time) {
  slider.value = String(time);
  slider.setAttribute("aria-valuetext", core.elapsed(time));
  el("clock").textContent = core.elapsed(time);
  drawWave(time);
  for (const provider of providers) updateTranscript(provider, time);
  updateLab(time);
}

function isPlaying() {
  return !audio.paused || tail?.startedAt != null;
}

function syncButton() {
  el("play").classList.toggle("playing", isPlaying());
  el("play-label").textContent = isPlaying() ? "Pause" : "Play";
}

function position() {
  return tail ? Math.min(timelineEnd, tail.seconds + (tail.startedAt == null ? 0 : (performance.now() - tail.startedAt) / 1000))
    : audio.currentTime;
}

function tick() {
  frame = 0;
  if (!clip) return;
  const time = position();
  render(time);
  if (tail && time >= timelineEnd) {
    tail = { seconds: timelineEnd, startedAt: null };
    el("player-status").textContent = "Replay complete. Open Cleanup to compare all three outputs.";
    syncButton();
    return;
  }
  if (isPlaying()) frame = requestAnimationFrame(tick);
}

function refresh() {
  if (frame) cancelAnimationFrame(frame);
  tick();
}

function chooseClip(id) {
  audio.pause();
  tail = null;
  clip = window.DEMO_DATA.clips.find((item) => item.id === id);
  timelineEnd = clip.complete + Math.max(0, ...Object.values(clip.cleanup).map((item) => item?.text ? item.seconds : 0));
  audio.src = clip.audio;
  slider.max = String(timelineEnd);
  el("duration").textContent = core.elapsed(timelineEnd);
  el("player-status").textContent = "Play the captured streams or scrub to any point.";
  el("endpoint-info").textContent = `Estimated speech ${core.elapsed(clip.speechStart)}–${core.elapsed(clip.speechEnd)}`;
  el("reference").value = references.get(clip.scenario) || "";
  shown.clear();
  cleanupSignature = "";
  render(0);
  syncButton();
}

async function togglePlayback() {
  if (isPlaying()) {
    if (tail) tail = { seconds: position(), startedAt: null };
    else audio.pause();
    el("player-status").textContent = "Replay paused.";
  } else if (tail && position() < timelineEnd) {
    tail.startedAt = performance.now();
    el("player-status").textContent = "Replaying final transcript and cleanup events.";
  } else {
    if (tail || audio.ended) {
      tail = null;
      audio.currentTime = 0;
    }
    try {
      await audio.play();
      el("player-status").textContent = "Replaying audio and captured transcript events.";
    } catch {
      el("player-status").textContent = "The audio could not play. Reload the page or try the other condition.";
    }
  }
  syncButton();
  refresh();
}

function seek(time) {
  const playing = isPlaying();
  if (time >= clip.duration) {
    audio.pause();
    audio.currentTime = Math.min(audio.duration || clip.duration, clip.duration);
    tail = { seconds: time, startedAt: playing ? performance.now() : null };
  } else {
    tail = null;
    audio.currentTime = time;
    if (playing && audio.paused) audio.play().catch(syncButton);
  }
  syncButton();
  refresh();
}

function showResults() {
  audio.pause();
  tail = null;
  seek(timelineEnd);
  for (const id of ["deepgram-text", "gemini-text", "raw-output", "llm-output"]) {
    el(id).scrollTop = 0;
  }
  el("player-status").textContent = "Showing all captured results.";
}

function setupViews() {
  const views = ["live", "cleanup", "benchmark", "costs", "deployment"];
  const fromHash = () => {
    const name = window.location.hash.slice(1);
    if (name === "method" || name === "decision") return "benchmark";
    if (name === "replay") {
      el("replay").open = true;
      return "cleanup";
    }
    return views.includes(name) ? name : "live";
  };
  function activate(name, updateHash = false) {
    el("replay-console").hidden = name !== "cleanup";
    if (name !== "live") window.LiveBench?.stop();
    if (name !== "cleanup" && isPlaying()) {
      if (tail) tail = { seconds: position(), startedAt: null };
      else audio.pause();
      syncButton();
      refresh();
    }
    for (const view of views) {
      const selected = view === name;
      el(view).hidden = !selected;
      const tab = el(`tab-${view}`);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    if (name === "live") window.LiveBench?.discover();
    if (updateHash && window.location.hash !== `#${name}`) {
      window.history.replaceState(null, "", `#${name}`);
    }
  }
  for (const [index, view] of views.entries()) {
    const tab = el(`tab-${view}`);
    tab.addEventListener("click", () => activate(view, true));
    tab.addEventListener("keydown", (event) => {
      const next = {
        ArrowLeft: (index + views.length - 1) % views.length,
        ArrowRight: (index + 1) % views.length,
        Home: 0,
        End: views.length - 1,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      activate(views[next], true);
      el(`tab-${views[next]}`).focus();
    });
  }
  window.addEventListener("hashchange", () => activate(fromHash()));
  activate(fromHash());
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function renderMetrics(data) {
  const definitions = [["first", "First text"], ["final", "First final text"]];
  const values = definitions.map(([key]) => providers.map((p) => median(data.calls.map((call) => call[p.id][key]))));
  const scale = Math.max(1000, ...values.flat().filter(Number.isFinite));
  definitions.forEach(([, label], index) => {
    const card = element("article", null, "metric");
    card.append(element("h3", label));
    providers.forEach((p, side) => {
      const row = element("div", null, `metric-line ${p.id}`);
      const value = values[index][side];
      row.append(element("span", p.label), element("strong", latency(value)));
      const track = element("div", null, "bar-track");
      track.setAttribute("aria-hidden", "true");
      const bar = element("span", null, "bar");
      bar.style.width = `${Math.max(0, value) / scale * 100}%`;
      track.append(bar);
      row.append(track);
      card.append(row);
    });
    el("metrics").append(card);
  });
  el("interim-lag").textContent = `${data.interimLag.median} ms`;
  el("interim-context").textContent = `Median audio backlog across ${data.interimLag.events} interim events. The 95th percentile was ${data.interimLag.p95} ms.`;
  for (const call of data.calls) {
    const row = element("tr", null);
    const heading = element("th", call.name);
    heading.scope = "row";
    row.append(heading);
    for (const key of ["first", "final"]) {
      for (const p of providers) row.append(element("td", latency(call[p.id][key])));
    }
    row.append(element("td", latency(call.gemini.sinhala)));
    el("call-rows").append(row);
  }
}

function renderIntentPilot(pilot) {
  if (!pilot?.cases?.length) return;
  const modelNames = {
    deepgram: "Deepgram Nova-3", gemini: "Gemini Live", azure: "Azure Speech",
    openai: "GPT Live Transcribe", groq: "Groq Whisper",
  };
  const recovered = (result) => Object.values(result.details || {}).filter((field) => field.correct).length;
  const firstText = (result) => latency(Number.isFinite(result.firstSeconds) ? result.firstSeconds * 1000 : null);
  const scenario = el("intent-case");

  function showEvidence() {
    const picked = pilot.cases.find((entry) => entry.id === scenario.value);
    const player = el("intent-audio");
    player.src = picked.audio;
    el("intent-expected").textContent = `Caller’s goal · ${picked.goal}`;
    const body = el("intent-rows");
    body.replaceChildren();
    for (const result of picked.results) {
      const row = element("tr", null);
      const heading = element("th", modelNames[result.provider]);
      heading.scope = "row";
      const tested = typeof result.intentCorrect === "boolean";
      const verdict = tested ? result.intentCorrect ? "Yes" : "Missed" : "Unavailable";
      row.append(heading, element("td", verdict),
        element("td", tested ? `${recovered(result)}/${picked.fields.length}` : "—"),
        element("td", firstText(result)));
      const evidence = element("td", null);
      if (tested) {
        const checks = element("details", null);
        checks.append(element("summary", result.summary || "Field checks"));
        if (!result.intentCorrect) {
          const message = result.detectedGoal === "no clear goal" ? "The agent found no clear goal." : `The agent chose ${result.detectedGoal}.`;
          checks.append(element("p", message, "stage-meta"));
        }
        const fields = element("ul", null, "pilot-evidence-list");
        for (const field of picked.fields) {
          const check = result.details[field.id];
          const item = element("li", `${check.correct ? "Recovered" : "Missed"} · ${field.label}`, check.correct ? null : "missed");
          if (typeof check.expected === "string") {
            item.append(element("small", `Expected ${check.expected} · Agent read ${check.actual ?? "nothing clear"}`));
          }
          fields.append(item);
        }
        checks.append(fields);
        const transcript = element("details", null);
        const raw = element("p", result.transcript, "pilot-raw");
        raw.lang = "si";
        transcript.append(element("summary", "Raw transcript"), raw);
        checks.append(transcript);
        evidence.append(checks);
      } else {
        evidence.textContent = result.status;
      }
      row.append(evidence);
      body.append(row);
    }
  }

  for (const entry of pilot.cases) {
    const option = element("option", entry.label);
    option.value = entry.id;
    scenario.append(option);
    const row = element("tr", null);
    const heading = element("th", null);
    heading.scope = "row";
    const link = element("button", entry.label, "pilot-case-link");
    link.type = "button";
    link.addEventListener("click", () => {
      scenario.value = entry.id;
      const panel = el("intent-evidence");
      panel.open = true;
      showEvidence();
      panel.scrollIntoView?.({ block: "nearest" });
    });
    heading.append(link);
    const eligible = entry.results.filter((result) => result.intentCorrect);
    const mostDetails = Math.max(0, ...eligible.map(recovered));
    const leaders = eligible.filter((result) => recovered(result) === mostDetails);
    const best = element("td", null);
    const noLeaders = entry.results.some((result) => result.intentCorrect === false) ? "Goal missed" : "No scored results";
    best.append(element("strong", leaders.length ? leaders.map((result) => modelNames[result.provider]).join(", ") : noLeaders));
    if (leaders.length) best.append(element("small", `Goal understood · ${mostDetails}/${entry.fields.length} details`));
    if (entry.finding) best.append(element("small", entry.finding));
    const fastest = entry.results.filter((result) => typeof result.intentCorrect === "boolean" && Number.isFinite(result.firstSeconds))
      .sort((a, b) => a.firstSeconds - b.firstSeconds)[0];
    row.append(heading, best, element("td", fastest ? `${modelNames[fastest.provider]} · ${firstText(fastest)}` : "—"));
    el("intent-summary").append(row);
  }
  scenario.value = pilot.cases[0].id;
  scenario.addEventListener("change", showEvidence);
  showEvidence();
  el("intent-method").textContent = pilot.method;
}

const costFields = {
  callerMinutes: "minutes", callMinutes: "call-minutes",
  replyMinutesPer100: "reply-minutes-per-100", cleanupsPerMinute: "cleanups-per-minute",
};

function costInput(id) {
  const field = el(id);
  return field.value !== "" && field.checkValidity() ? Number(field.value) : NaN;
}

const usd = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });

function updateCost() {
  const usage = Object.fromEntries(Object.entries(costFields).map(([key, id]) => [key, costInput(id)]));
  const estimates = core.estimateCosts(usage);
  const format = (amount) => Number.isFinite(amount) ? usd.format(amount) : "—";
  const count = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
  el("audio-hours").textContent = estimates ? `${count.format(usage.callerMinutes / 60)} hours of caller audio per month` : "";
  el("cost-nova").textContent = format(estimates?.nova);
  el("cost-nova-previous").textContent = estimates ? `${format(estimates.novaPrevious)} at previous rate` : "";
  el("cost-gemini").textContent = format(estimates ? estimates.geminiInput + estimates.geminiOutput : undefined);
  el("cost-gemini-details").textContent = estimates
    ? `${format(estimates.geminiInput)} caller audio + ${format(estimates.geminiOutput)} for ${count.format(estimates.replyMinutes)} reply min`
    : "";
  el("cost-azure").textContent = format(estimates?.azure);
  el("cost-azure-free").textContent = estimates?.azureFree === false ? "Over F0 limit" : format(estimates ? 0 : undefined);
  el("cost-openai").textContent = format(estimates?.openai);
  el("cost-groq").textContent = format(estimates?.groq);
  el("cost-groq-details").textContent = estimates
    ? `About ${count.format(estimates.groqChunks)} chunks · ${count.format(estimates.groqBilledMinutes)} billed min`
    : "";
  el("cost-cleanup").textContent = format(estimates?.flashLite);
  el("cost-qwen").textContent = format(estimates?.qwen);
  el("cost-cleanup-volume").textContent = estimates ? `About ${count.format(estimates.requests)} cleanup requests per month at this volume.` : "";
  el("cost-error").hidden = Boolean(estimates);
}

function updateHostingCost() {
  const servers = costInput("hosting-count");
  const monthly = costInput("hosting-monthly") * servers;
  const setup = costInput("hosting-setup") * servers;
  el("hosting-result").textContent = Number.isFinite(monthly + setup)
    ? `${usd.format(monthly)}/month · ${usd.format(monthly + setup)} for the first month with setup`
    : "Enter the quoted monthly rental, setup fee, and server count.";
}

function validatePrivatePack(pack) {
  const finiteSeconds = (value) => Number.isFinite(value) && value >= 0 && value <= 300;
  if (pack?.version !== 1 || !Array.isArray(pack.calls) || pack.calls.length < 1 || pack.calls.length > 10) {
    throw new Error("This file is not a real-call replay pack.");
  }
  return pack.calls.map((call, index) => {
    const audioData = call.audioBase64;
    if (typeof audioData !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(audioData) ||
        !finiteSeconds(call.duration) || call.duration === 0 || !finiteSeconds(call.speechStart) ||
        !finiteSeconds(call.speechEnd) || call.speechStart > call.speechEnd || call.speechEnd > call.duration ||
        !Array.isArray(call.wave) || call.wave.length !== 160 ||
        !call.wave.every((point) => Number.isFinite(point) && point >= 0 && point <= 1)) {
      throw new Error("A real-call replay entry has invalid audio or timing.");
    }
    const feeds = {};
    for (const { id } of providers) {
      const feed = call.events?.[id];
      if (!Array.isArray(feed) || feed.length > 2000 || !feed.every((event, i) =>
        Array.isArray(event) && finiteSeconds(event[0]) && (i === 0 || event[0] >= feed[i - 1][0]) &&
        typeof event[1] === "string" && event[1].length <= 4000 && typeof event[2] === "boolean"
      )) throw new Error("A real-call transcript feed is invalid.");
      feeds[id] = feed;
    }
    const label = `Real call ${index + 1}`;
    const id = `private/${index + 1}`;
    return {
      id, scenario: id, scenarioLabel: label, condition: "original", label: "Original audio",
      audioData, duration: call.duration, speechStart: call.speechStart, speechEnd: call.speechEnd,
      wave: call.wave, events: feeds, cleanup: {},
      complete: Math.max(call.duration, ...Object.values(feeds).flat().map((event) => event[0])),
      raw: Object.fromEntries(providers.map(({ id: p }) => [p, core.observe(feeds[p], Infinity).raw])),
      outcomes: Object.fromEntries(providers.map(({ id: p }) => [p, feeds[p].length ? "Captured replay" : "No text"])),
    };
  });
}

setupViews();

if (window.DEMO_DATA && core) {
  const { clips, metrics } = window.DEMO_DATA;
  const choices = el("clip");
  const scenarios = el("scenario");
  const fillScenarios = () => {
    scenarios.replaceChildren();
    for (const [id, label] of new Map(clips.map((item) => [item.scenario, item.scenarioLabel]))) {
      const option = element("option", label);
      option.value = id;
      scenarios.append(option);
    }
  };
  fillScenarios();
  const changeScenario = () => {
    const previous = clip?.condition;
    choices.replaceChildren();
    const available = clips.filter((item) => item.scenario === scenarios.value);
    for (const item of available) {
      const option = element("option", item.label);
      option.value = item.id;
      choices.append(option);
    }
    const active = available.find((item) => item.condition === previous) || available[0];
    choices.value = active.id;
    chooseClip(active.id);
  };
  scenarios.addEventListener("change", changeScenario);
  choices.addEventListener("change", () => chooseClip(choices.value));
  el("load-real").addEventListener("change", async ({ target }) => {
    const file = target.files?.[0];
    if (!file) return;
    const urls = [];
    try {
      if (file.size > 8000000) throw new Error("Choose a replay file under 8 MB.");
      const calls = validatePrivatePack(JSON.parse(await file.text()));
      for (const call of calls) {
        const { audioData } = call;
        call.audio = URL.createObjectURL(new Blob(
          [Uint8Array.from(atob(audioData), (char) => char.charCodeAt(0))], { type: "audio/mpeg" }
        ));
        delete call.audioData;
        urls.push(call.audio);
      }
      const visibleClips = clips.filter((entry) => !entry.id.startsWith("private/"));
      clips.splice(0, clips.length, ...visibleClips, ...calls);
      for (const id of references.keys()) if (id.startsWith("private/")) references.delete(id);
      fillScenarios();
      scenarios.value = calls[0].scenario;
      changeScenario();
      for (const url of privateAudioUrls) URL.revokeObjectURL(url);
      privateAudioUrls = urls;
      el("player-status").textContent = `Loaded ${calls.length} real-call replays in this tab.`;
    } catch (error) {
      for (const url of urls) URL.revokeObjectURL(url);
      el("player-status").textContent = error instanceof SyntaxError ? "Choose a valid real-call replay file." : error.message;
    } finally {
      target.value = "";
    }
  });
  el("cleanup-provider").addEventListener("change", () => updateLab(position(), true));
  el("reference").addEventListener("input", () => {
    references.set(clip.scenario, el("reference").value);
    updateLab(position(), true);
  });
  el("play").addEventListener("click", togglePlayback);
  el("restart").addEventListener("click", () => seek(0));
  el("results").addEventListener("click", showResults);
  slider.addEventListener("input", () => seek(Number(slider.value)));
  audio.addEventListener("ended", () => {
    if (tail) return;
    tail = { seconds: clip.duration, startedAt: performance.now() };
    el("player-status").textContent = "Audio finished. Replaying final transcript and cleanup events.";
    syncButton();
    refresh();
  });
  audio.addEventListener("error", () => {
    el("player-status").textContent = "Audio unavailable. Check that the assets folder is deployed alongside the page.";
    syncButton();
  });
  window.addEventListener("resize", () => drawWave(position()));
  changeScenario();
  renderMetrics(metrics);
} else {
  el("player-status").textContent = "The demo data could not be loaded.";
  for (const id of ["play", "restart", "results", "position", "clip", "scenario"]) el(id).disabled = true;
}
for (const id of Object.values(costFields)) el(id).addEventListener("input", updateCost);
for (const id of ["hosting-count", "hosting-monthly", "hosting-setup"]) el(id).addEventListener("input", updateHostingCost);
renderIntentPilot(window.INTENT_BENCHMARK);
updateCost();

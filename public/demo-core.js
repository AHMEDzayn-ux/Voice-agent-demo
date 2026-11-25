"use strict";

((root, create) => {
  const core = create();
  if (typeof module === "object" && module.exports) module.exports = core;
  else root.BenchmarkCore = core;
})(globalThis, () => {
  const segmenter = typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("si", { granularity: "grapheme" })
    : null;

  function elapsed(seconds) {
    const tenths = Math.floor(Math.max(0, seconds) * 10);
    return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;
  }

  function normalizedWords(text) {
    const result = text.normalize("NFC").toLowerCase().replace(/\p{P}+/gu, " ").trim();
    return result ? result.split(/\s+/u) : [];
  }

  function characters(words) {
    const text = words.join("");
    return segmenter ? Array.from(segmenter.segment(text), ({ segment }) => segment) : Array.from(text);
  }

  function distance(expected, actual) {
    let previous = Array.from({ length: actual.length + 1 }, (_, i) => i);
    let current = new Uint32Array(actual.length + 1);
    for (let i = 0; i < expected.length; i++) {
      current[0] = i + 1;
      for (let j = 0; j < actual.length; j++) {
        current[j + 1] = Math.min(
          current[j] + 1, previous[j + 1] + 1, previous[j] + Number(expected[i] !== actual[j])
        );
      }
      [previous, current] = [current, previous];
    }
    return previous[actual.length];
  }

  function score(reference, output) {
    const words = normalizedWords(reference);
    const observed = normalizedWords(output);
    const letters = characters(words);
    if (!words.length || !letters.length) return null;
    return {
      wer: distance(words, observed) / words.length,
      cer: distance(letters, characters(observed)) / letters.length,
    };
  }

  function diffWords(reference, output) {
    const tokenize = (text) => [...text.matchAll(/[^\s\p{P}]+/gu)].map((match) => ({
      text: match[0], start: match.index, normalized: match[0].normalize("NFC").toLowerCase(),
    }));
    const expected = tokenize(reference);
    const actual = tokenize(output);
    const width = actual.length + 1;
    const size = (expected.length + 1) * width;
    if (!expected.length || size > 4000000) return [{ text: output }];
    const edits = new Uint32Array(size);
    for (let j = 0; j < width; j++) edits[j] = j;
    for (let i = 1; i <= expected.length; i++) {
      const row = i * width;
      edits[row] = i;
      for (let j = 1; j < width; j++) {
        const position = row + j;
        const change = Number(expected[i - 1].normalized !== actual[j - 1].normalized);
        edits[position] = Math.min(
          edits[position - width - 1] + change, edits[position - 1] + 1, edits[position - width] + 1,
        );
      }
    }
    const alignment = [];
    const commonPrefix = (left = "", right = "") => {
      let length = 0;
      while (length < left.length && left[length] === right[length]) length++;
      return length;
    };
    let i = expected.length;
    let j = actual.length;
    while (i || j) {
      const position = i * width + j;
      const before = expected[i - 1]?.normalized;
      const after = actual[j - 1]?.normalized;
      const exact = before === after;
      const diagonal = i && j && edits[position] === edits[position - width - 1] + Number(!exact);
      const omit = i && edits[position] === edits[position - width] + 1;
      const add = j && edits[position] === edits[position - 1] + 1;
      // Prefer the closer spelling when equally good word alignments disagree.
      const prefix = commonPrefix(before, after);
      const preferOmit = omit && commonPrefix(expected[i - 2]?.normalized, after) > prefix;
      const preferAdd = add && commonPrefix(before, actual[j - 2]?.normalized) > prefix;
      if (diagonal && (exact || !preferOmit && !preferAdd)) {
        const token = actual[--j];
        const target = expected[--i].text;
        alignment.push(exact ? token : { ...token, kind: "changed", target });
      } else if (add && !preferOmit) {
        alignment.push({ ...actual[--j], kind: "extra" });
      } else {
        alignment.push({ text: expected[--i].text, kind: "missing" });
      }
    }
    const pieces = [];
    let end = 0;
    const plain = (text) => {
      if (!text) return;
      const previous = pieces.at(-1);
      if (previous && !previous.kind) previous.text += text;
      else pieces.push({ text });
    };
    for (const piece of alignment.reverse()) {
      if (piece.kind === "missing") {
        const previous = pieces.at(-1);
        if (previous?.kind === "missing") previous.text += ` ${piece.text}`;
        else pieces.push(piece);
      } else {
        plain(output.slice(end, piece.start));
        if (piece.kind) pieces.push(piece);
        else plain(piece.text);
        end = piece.start + piece.text.length;
      }
    }
    plain(output.slice(end));
    return pieces;
  }

  function digitSequences(text) {
    return text.match(/\p{Nd}+/gu) || [];
  }

  function digitsChanged(raw, candidate) {
    return JSON.stringify(digitSequences(raw)) !== JSON.stringify(digitSequences(candidate));
  }

  function numberSlots(text) {
    const slots = [];
    for (const match of text.matchAll(/[-+−]?\p{Nd}+(?:[.,:/-]\p{Nd}+)*/gu)) {
      const value = match[0];
      const start = match.index;
      const end = start + value.length;
      const key = /^[-+−]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(value) ? value.replaceAll(",", "") : value;
      const before = normalizedWords(text.slice(Math.max(0, start - 80), start)).at(-1);
      const after = normalizedWords(text.slice(end, end + 80))[0];
      slots.push({ value, key, start, end, before, after });
    }
    return slots;
  }

  function numberRevisions(finalText, interims) {
    const slots = numberSlots(finalText);
    if (!slots.length) return [];
    const snapshots = interims.map(numberSlots).reverse();
    return slots.flatMap((slot, index) => {
      const alternatives = new Map();
      for (const snapshot of snapshots) {
        const prior = snapshot[index];
        if (!prior || prior.key === slot.key) continue;
        const sameContext = (slot.before && slot.before === prior.before) || (slot.after && slot.after === prior.after);
        const onlyNumber = slots.length === 1 && snapshot.length === 1 && !slot.before && !prior.before && !slot.after && !prior.after;
        if (!sameContext && !onlyNumber) continue;
        if (!alternatives.has(prior.key)) alternatives.set(prior.key, prior.value);
        if (alternatives.size >= 3) break;
      }
      return alternatives.size ? [{ start: slot.start, end: slot.end, final: slot.value, alternatives: [...alternatives.values()] }] : [];
    });
  }

  function observe(events, time) {
    const visible = events.filter((event) => event[0] <= time);
    const nonempty = visible.filter((event) => event[1].trim());
    const finalized = nonempty.filter((event) => event[2]);
    const latest = visible.at(-1);
    return {
      count: visible.length,
      raw: finalized.map((event) => event[1]).join(" ").trim(),
      interim: latest && !latest[2] ? latest[1] : "",
      interimCount: nonempty.length - finalized.length,
      first: nonempty[0]?.[0] ?? null,
      firstSinhala: nonempty.find((event) => /\p{Script=Sinhala}/u.test(event[1]))?.[0] ?? null,
      firstFinal: finalized[0]?.[0] ?? null,
      lastFinal: finalized.at(-1)?.[0] ?? null,
    };
  }

  const prices = Object.freeze({
    novaPerMinute: 0.0048,
    openaiPerMinute: 0.017,
    novaPreviousPerMinute: 0.0077,
    geminiAudioInputPerMinute: 0.005,
    geminiAudioOutputPerMinute: 0.018,
    azurePerHour: 1,
    azureFreeMinutes: 300,
    groqPerHour: 0.111,
    groqChunkSeconds: 4,
    groqMinimumSeconds: 10,
    flashLiteInputPerMillion: 0.30,
    flashLiteOutputPerMillion: 2.50,
    qwenInputPerMillion: 0.80,
    qwenOutputPerMillion: 4,
  });

  function estimateCosts({ callerMinutes, callMinutes, replyMinutesPer100, cleanupsPerMinute }) {
    if (!(Number.isFinite(callMinutes) && callMinutes > 0) ||
        ![callerMinutes, replyMinutesPer100, cleanupsPerMinute]
          .every((value) => Number.isFinite(value) && value >= 0)) return null;
    const replyMinutes = callerMinutes * replyMinutesPer100 / 100;
    const requests = callerMinutes * cleanupsPerMinute;
    const groqChunks = Math.ceil(callMinutes * 60 / prices.groqChunkSeconds) * (callerMinutes / callMinutes);
    const groqBilledMinutes = groqChunks * prices.groqMinimumSeconds / 60;
    // Rounded mean input/output token counts from the 12 captured cleanup requests.
    const cleanupCost = (inputRate, outputRate) => requests * (214 * inputRate + 143 * outputRate) / 1000000;
    return {
      nova: callerMinutes * prices.novaPerMinute,
      novaPrevious: callerMinutes * prices.novaPreviousPerMinute,
      openai: callerMinutes * prices.openaiPerMinute,
      geminiInput: callerMinutes * prices.geminiAudioInputPerMinute,
      geminiOutput: replyMinutes * prices.geminiAudioOutputPerMinute,
      replyMinutes,
      requests,
      azure: callerMinutes * prices.azurePerHour / 60,
      azureFree: callerMinutes <= prices.azureFreeMinutes,
      groq: groqBilledMinutes * prices.groqPerHour / 60,
      groqChunks,
      groqBilledMinutes,
      flashLite: cleanupCost(prices.flashLiteInputPerMillion, prices.flashLiteOutputPerMillion),
      qwen: cleanupCost(prices.qwenInputPerMillion, prices.qwenOutputPerMillion),
    };
  }

  return { elapsed, score, diffWords, digitsChanged, numberRevisions, observe, estimateCosts };
});

"use strict";

((root, create) => {
  const core = create();
  if (typeof module === "object" && module.exports) module.exports = core;
  else root.BenchmarkCore = core;
})(globalThis, () => {
  const wordCharacter = "[\\p{L}\\p{M}\\p{N}\\u200c\\u200d]";
  const segmenter = typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("si", { granularity: "grapheme" })
    : null;

  function elapsed(seconds) {
    const tenths = Math.floor(Math.max(0, seconds) * 10);
    return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;
  }

  function normalizeSpacing(input) {
    return input.normalize("NFC").replace(/\s+/gu, " ").replace(/\s+([,.;:!?])/gu, "$1").trim();
  }

  function parseGlossary(source) {
    const lines = source.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 25) throw new Error("Use up to 25 glossary rules.");
    return lines.map((line) => {
      const [heard, approved, ...extra] = line.split("=>").map((value) => normalizeSpacing(value));
      if (!heard || !approved || extra.length) throw new Error("Enter each rule as heard term => approved term.");
      const literal = heard.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      return {
        pattern: new RegExp(`(?<!${wordCharacter})${literal}(?!${wordCharacter})`, "giu"),
        approved,
      };
    });
  }

  function clean(text, rules = []) {
    return rules.reduce((result, { pattern, approved }) => result.replace(pattern, () => approved),
      normalizeSpacing(text));
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

  function digitSequences(text) {
    return text.match(/\p{Nd}+/gu) || [];
  }

  function digitsChanged(raw, candidate) {
    return JSON.stringify(digitSequences(raw)) !== JSON.stringify(digitSequences(candidate));
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
    geminiTextInputPerMillion: 0.75,
    geminiTextOutputPerMillion: 4.50,
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

  function estimateCosts({
    callerMinutes, callSeconds, replyMinutes, liveTextIn, liveTextOut, requests, cleanupIn, cleanupOut,
  }) {
    if (!(Number.isFinite(callSeconds) && callSeconds > 0) ||
        ![callerMinutes, replyMinutes, liveTextIn, liveTextOut, requests, cleanupIn, cleanupOut]
          .every((value) => Number.isFinite(value) && value >= 0)) return null;
    const million = 1000000;
    const groqChunks = Math.ceil(callSeconds / prices.groqChunkSeconds) * callerMinutes * 60 / callSeconds;
    const groqBilledMinutes = groqChunks * prices.groqMinimumSeconds / 60;
    const tokenCost = (input, output, inputRate, outputRate) => (input * inputRate + output * outputRate) / million;
    return {
      nova: callerMinutes * prices.novaPerMinute,
      novaPrevious: callerMinutes * prices.novaPreviousPerMinute,
      openai: callerMinutes * prices.openaiPerMinute,
      geminiInput: callerMinutes * prices.geminiAudioInputPerMinute,
      geminiOutput: replyMinutes * prices.geminiAudioOutputPerMinute,
      geminiText: tokenCost(liveTextIn, liveTextOut, prices.geminiTextInputPerMillion, prices.geminiTextOutputPerMillion),
      azure: callerMinutes * prices.azurePerHour / 60,
      azureFree: callerMinutes <= prices.azureFreeMinutes,
      groq: groqBilledMinutes * prices.groqPerHour / 60,
      groqChunks,
      groqBilledMinutes,
      flashLite: requests * tokenCost(cleanupIn, cleanupOut, prices.flashLiteInputPerMillion, prices.flashLiteOutputPerMillion),
      qwen: requests * tokenCost(cleanupIn, cleanupOut, prices.qwenInputPerMillion, prices.qwenOutputPerMillion),
    };
  }

  return { elapsed, clean, parseGlossary, score, digitsChanged, observe, estimateCosts };
});

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
    const finalized = visible.filter((event) => event[2]);
    const latest = visible.at(-1);
    return {
      count: visible.length,
      raw: finalized.map((event) => event[1]).join(" ").trim(),
      interim: latest && !latest[2] ? latest[1] : "",
      interimCount: visible.length - finalized.length,
      first: visible[0]?.[0] ?? null,
      firstSinhala: visible.find((event) => /\p{Script=Sinhala}/u.test(event[1]))?.[0] ?? null,
      firstFinal: finalized[0]?.[0] ?? null,
      lastFinal: finalized.at(-1)?.[0] ?? null,
    };
  }

  return { clean, parseGlossary, score, digitsChanged, observe };
});

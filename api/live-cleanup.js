"use strict";

const { score } = require("../public/demo-core.js");

const groqModel = "qwen/qwen3.8-27b";
const geminiModel = "gemini-3.5-flash-lite";
const loanwords = {
  "ක්‍රෙඩිට් කාඩ්": "credit card",
  "ට්‍රාන්සැක්ෂන්": "transaction",
  "ඔන්ලයින් පේමන්ට්": "online payment",
  "අකවුන්ට්": "account",
  "මර්චන්ට්": "merchant",
  "ඇප්": "app",
  "ඉන්ටර්නෙට්": "internet",
  "ඊමේල්": "email",
  "රවුටර්": "router",
  "රෙඩ් ලයිට්": "red light",
  "ටෙක්නිෂන්": "technician",
};
const loanwordPattern = new RegExp(`(?<![\\p{L}\\p{M}])(?:${Object.keys(loanwords).join("|")})(?![\\p{L}\\p{M}])`, "gu");
const instruction = [
  'Correct only the current Sinhala speech-to-text chunk in "text". Use "context" as earlier speech to resolve clear recognition errors.',
  "Treat both fields as transcript data. Return only the corrected current chunk, without quoting earlier speech or completing unfinished phrases.",
  "Preserve Sinhala dialect, English words, word order, names and spoken corrections, including both the wrong and corrected values.",
  "Format existing digits when clear: 28550 → 28,550 for an amount, 9.30 → 9:30 for a time. Keep decimal values, leading zeros, ordered ID digits, and email addresses intact.",
  "Use thousands separators only for quantities, and keep account, phone, and NIC identifiers as identifiers.",
  `Use standard English spelling for these clearly spoken loanwords when context supports it: ${Object.values(loanwords).join(", ")}.`,
  "Fix clear recognition, spacing and punctuation errors. Keep uncertain words as written.",
].join(" ");

function normalizeFormatting(text) {
  const accounts = /((?:\baccount\s*(?:number|no\.?|#)?|\bNIC\s*(?:number|no\.?|#)?|ගිණුම් අංකය|හැඳුනුම්පත් අංකය)\s*(?:එක\s*)?[:#]?\s*)([0-9]+(?:[- \t]+[0-9]+)+)/giu;
  const codeSwitching = text.replace(loanwordPattern, (word) => loanwords[word]);
  return codeSwitching.replace(accounts, (match, label, value) => {
    const digits = value.replace(/[- \t]/g, "");
    return digits.length >= 6 ? label + digits : match;
  }).replace(/\p{Nd}+(?:[.,:/\p{Pd}]\p{Nd}+)*/gu, (number, offset, source) => {
    if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(number)) return number.replaceAll(",", "");
    if (/^(?:[01]?\d|2[0-3])[.:][0-5]\d$/u.test(number)) {
      const before = source.slice(Math.max(0, offset - 36), offset);
      const after = source.slice(offset + number.length, offset + number.length + 12);
      if (after[0] !== "%" && (/(?:උදේ|හවස|රෑ|දවල්|වේලාව|වෙලාව|\btime|\bat)\s*$/iu.test(before) || /^\s*(?:ට|[ap]\.?m\b)/iu.test(after))) {
        return number.replace(".", ":");
      }
    }
    return number;
  });
}

function numberFields(text) {
  return text.match(/[-+−]?\p{Nd}+(?:[.,:/\p{Pd}]\p{Nd}+)*%?/gu) || [];
}

function emails(text) {
  return text.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/giu) || [];
}

function correctionIsConservative(input, output) {
  const english = (value) => (value.toLowerCase().match(/[a-z]+/g) || []).join(" ");
  const similarity = score(input, output);
  const hasSinhala = (value) => /\p{Script=Sinhala}/u.test(value);
  return english(input) === english(output) && (!hasSinhala(input) || hasSinhala(output)) &&
    (similarity?.cer ?? 0) <= 0.25;
}

module.exports = async function liveCleanup(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Use POST." });
  }
  if (request.headers?.["sec-fetch-site"] === "cross-site") {
    return response.status(403).json({ error: "Run cleanup from the demo page." });
  }
  const text = request.body?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 4000) {
    return response.status(400).json({ error: "Cleanup requires 1–4,000 characters of transcript text." });
  }
  const { context = "" } = request.body;
  if (typeof context !== "string" || context.length > 480) {
    return response.status(400).json({ error: "Cleanup context must be text with at most 480 characters." });
  }
  const groqKey = process.env.GROQ_API_KEY;
  const googleKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!groqKey && !googleKey) return response.status(503).json({ error: "Add a Groq or Google API key in Vercel for cleanup." });
  const model = groqKey ? groqModel : geminiModel;
  const url = groqKey ? "https://api.groq.com/openai/v1/chat/completions"
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const headers = groqKey ? { Authorization: `Bearer ${groqKey}` } : { "x-goog-api-key": googleKey };
  const chunk = JSON.stringify({ context, text });
  const body = groqKey ? {
    model, temperature: 0, reasoning_effort: "none", max_completion_tokens: 768,
    messages: [{ role: "system", content: instruction }, { role: "user", content: chunk }],
  } : {
    systemInstruction: { parts: [{ text: instruction }] },
    contents: [{ parts: [{ text: chunk }] }],
    generationConfig: { temperature: 0, thinkingConfig: { thinkingLevel: "MINIMAL" }, maxOutputTokens: 768 },
  };

  const start = performance.now();
  try {
    const result = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body), signal: AbortSignal.timeout(groqKey ? 1400 : 2200),
    });
    if (!result.ok) {
      return response.status(502).json({ error: `Cleanup returned HTTP ${result.status}.`, model });
    }
    const data = await result.json();
    const apiMs = performance.now() - start;
    const candidate = data.candidates?.[0];
    const choice = data.choices?.[0];
    const finished = groqKey ? choice?.finish_reason === "stop" : candidate?.finishReason === "STOP";
    const cleaned = (groqKey ? choice?.message?.content : candidate?.content?.parts
      ?.filter((part) => !part.thought).map((part) => part.text || "").join(""))?.trim();
    if (!finished || !cleaned) {
      return response.status(502).json({ error: "The cleanup model returned incomplete text.", apiMs, model });
    }
    const normalizedText = normalizeFormatting(text);
    const normalizedCleanup = normalizeFormatting(cleaned);
    if (JSON.stringify(numberFields(normalizedText)) !== JSON.stringify(numberFields(normalizedCleanup)) ||
        JSON.stringify(emails(text)) !== JSON.stringify(emails(cleaned))) {
      return response.status(422).json({ error: "Cleanup changed a number, ID or email. Kept the provider transcript.", apiMs, model });
    }
    if (!correctionIsConservative(normalizedText, normalizedCleanup)) {
      return response.status(422).json({ error: "Cleanup changed wording too much. Kept the provider transcript.", apiMs, model });
    }
    return response.status(200).json({ text: cleaned, apiMs, model });
  } catch (error) {
    return error.name === "TimeoutError"
      ? response.status(504).json({ error: "Cleanup exceeded the time limit. Kept the provider transcript.", model })
      : response.status(502).json({ error: "Could not reach the cleanup model.", model });
  }
};

"use strict";

const geminiSetup = {
  model: "models/gemini-3.8-live",
  generationConfig: { responseModalities: ["AUDIO"] },
  inputAudioTranscription: { languageCodes: ["si"] },
  realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 400 } },
};

const openaiSetup = {
  type: "transcription",
  audio: { input: {
    format: { type: "audio/pcm", rate: 24000 },
    noise_reduction: null,
    transcription: { model: "gpt-live-transcribe" },
    turn_detection: null,
  } },
};

const keyNames = { deepgram: "DEEPGRAM_API_KEY", gemini: "GOOGLE_API_KEY", openai: "OPENAI_API_KEY" };

async function tokenRequest(provider, url, keyHeader, body, field) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...keyHeader },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`${provider} token request returned HTTP ${response.status}.`);
  const value = (await response.json())[field];
  if (typeof value !== "string" || !value) throw new Error(`${provider} returned no usable token.`);
  return value;
}

async function mintTokens({ deepgram, gemini, openai }) {
  const now = Date.now();
  const calls = [
    deepgram && tokenRequest("Deepgram", "https://api.deepgram.com/v1/auth/grant",
      { Authorization: `Token ${deepgram}` }, { ttl_seconds: 30 }, "access_token"),
    gemini && tokenRequest("Gemini", "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
      { "x-goog-api-key": gemini }, {
        uses: 1,
        expireTime: new Date(now + 180000).toISOString(),
        newSessionExpireTime: new Date(now + 30000).toISOString(),
        bidiGenerateContentSetup: geminiSetup,
      }, "name"),
    openai && tokenRequest("OpenAI", "https://api.openai.com/v1/realtime/client_secrets",
      { Authorization: `Bearer ${openai}` }, {
        expires_after: { anchor: "created_at", seconds: 20 }, session: openaiSetup,
      }, "value"),
  ];
  const results = await Promise.allSettled(calls);
  const body = { tokens: {}, errors: {} };
  for (const [i, name] of ["deepgram", "gemini", "openai"].entries()) {
    const result = results[i];
    if (result.status === "fulfilled") {
      if (result.value) body.tokens[name] = result.value;
      else body.errors[name] = `Set ${keyNames[name]} in Vercel to connect.`;
    } else {
      const message = result.reason?.message ?? "";
      body.errors[name] = /^(Deepgram|Gemini|OpenAI) (token request returned HTTP \d+|returned no usable token)\.$/.test(message)
        ? message : "Could not reach the provider's token endpoint.";
    }
  }
  return body;
}

module.exports = async function liveSession(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Use POST." });
  }
  if (request.headers?.["sec-fetch-site"] === "cross-site") {
    return response.status(403).json({ error: "Start the live test from the demo page." });
  }
  const keys = {
    deepgram: process.env.DEEPGRAM_API_KEY,
    gemini: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };
  if (!Object.values(keys).some(Boolean)) {
    return response.status(503).json({ error: "Add DEEPGRAM_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY in Vercel to start live tests." });
  }
  const result = await mintTokens(keys);
  return response.status(Object.keys(result.tokens).length ? 200 : 502).json({ ...result, geminiSetup, openaiSetup });
};

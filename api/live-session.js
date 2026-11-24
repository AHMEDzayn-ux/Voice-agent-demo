"use strict";

const geminiSetup = {
  model: "models/gemini-3.8-live",
  generationConfig: { responseModalities: ["AUDIO"] },
  inputAudioTranscription: { languageCodes: ["si"] },
  realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 400 } },
};

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

async function mintTokens(deepgramKey, geminiKey) {
  const now = Date.now();
  const calls = [
    deepgramKey && tokenRequest("Deepgram", "https://api.deepgram.com/v1/auth/grant",
      { Authorization: `Token ${deepgramKey}` }, { ttl_seconds: 30 }, "access_token"),
    geminiKey && tokenRequest("Gemini", "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
      { "x-goog-api-key": geminiKey }, {
        uses: 1,
        expireTime: new Date(now + 180000).toISOString(),
        newSessionExpireTime: new Date(now + 30000).toISOString(),
        bidiGenerateContentSetup: geminiSetup,
      }, "name"),
  ];
  const results = await Promise.allSettled(calls);
  const body = { tokens: {}, errors: {} };
  for (const [i, name] of ["deepgram", "gemini"].entries()) {
    const result = results[i];
    if (result.status === "fulfilled") {
      if (result.value) body.tokens[name] = result.value;
      else body.errors[name] = `Set ${name === "deepgram" ? "DEEPGRAM_API_KEY" : "GOOGLE_API_KEY"} in Vercel to connect.`;
    } else {
      const message = result.reason?.message ?? "";
      body.errors[name] = /^(Deepgram|Gemini) (token request returned HTTP \d+|returned no usable token)\.$/.test(message)
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
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!deepgramKey && !geminiKey) {
    return response.status(503).json({ error: "Add DEEPGRAM_API_KEY or GOOGLE_API_KEY to the Vercel deployment to start live tests." });
  }
  const result = await mintTokens(deepgramKey, geminiKey);
  return response.status(Object.keys(result.tokens).length ? 200 : 502).json({ ...result, geminiSetup });
};

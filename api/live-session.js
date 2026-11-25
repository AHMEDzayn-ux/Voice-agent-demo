"use strict";

const geminiSetup = {
  model: "models/gemini-3.8-live",
  generationConfig: { responseModalities: ["AUDIO"] },
  systemInstruction: { parts: [{ text: [
    "Transcribe Sri Lankan Sinhala speech, including English words as spoken. Listen silently and preserve the caller's wording.",
    "For a clearly dictated account number, phone number, or code, write its spoken number groups as digits in order. Join them as one identifier, keeping leading zeros and any spoken letters.",
    'Examples: "බිංදු දෙකයි" gives 00. "බිංදුව, දෙක" gives 02. "එකසිය තිස් පහයි" gives 135. "තුන්සිය විසි දෙකයි" gives 322. "දෙකේම තුනයි" gives 222. "පහේ හතරයි" gives 5555.',
    "Use only the groups audible in the caller's speech. Preserve pauses and words around the identifier, keep spoken self-corrections, and leave unclear groups in words where possible.",
  ].join(" ") }] },
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

async function mintAzureToken(key, region) {
  try {
    const response = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST", headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/x-www-form-urlencoded" },
      body: "", redirect: "error", signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return { error: `Azure token request returned HTTP ${response.status}. Check the Speech key and region.` };
    const token = (await response.text()).trim();
    return token ? { session: { token, region } } : { error: "Azure returned an empty Speech token." };
  } catch {
    return { error: "Could not reach Azure's Speech token endpoint." };
  }
}

module.exports = async function liveSession(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Use GET or POST." });
  }
  if (request.headers?.["sec-fetch-site"] === "cross-site") {
    return response.status(403).json({ error: "Start the live test from the demo page." });
  }
  const keys = {
    deepgram: process.env.DEEPGRAM_API_KEY,
    gemini: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };
  const groqEnabled = Boolean(process.env.GROQ_API_KEY?.trim());
  const azureKey = process.env.AZURE_SPEECH_KEY?.trim();
  const azureRegion = process.env.AZURE_SPEECH_REGION?.trim().toLowerCase();
  const azureConfigured = Boolean(azureKey && /^[a-z0-9]{2,32}$/.test(azureRegion || ""));
  const providers = Object.keys(keys).filter((name) => keys[name]);
  if (azureConfigured) providers.push("azure");
  if (groqEnabled) providers.push("groq");
  if (request.method === "GET") return response.status(200).json({ providers });
  if (!providers.length && !azureKey) {
    return response.status(503).json({ error: "Configure a provider API key in Vercel to start live tests." });
  }
  const [result, azure] = await Promise.all([
    mintTokens(keys),
    azureConfigured ? mintAzureToken(azureKey, azureRegion) : undefined,
  ]);
  if (azureKey && !azure?.session) {
    result.errors.azure = azure?.error || "Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in Vercel.";
  }
  const available = Object.keys(result.tokens).length || groqEnabled || azure?.session;
  return response.status(available ? 200 : providers.length ? 502 : 503).json({ ...result, geminiSetup, openaiSetup, groqEnabled, azureSession: azure?.session });
};

"use strict";

const model = "whisper-large-v3";
const chunkBytes = 4 * 16000 * 2;

function wave(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return new Blob([header, pcm], { type: "audio/wav" });
}

module.exports = async function groqTranscribe(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Use POST." });
  }
  if (request.headers?.["sec-fetch-site"] === "cross-site") {
    return response.status(403).json({ error: "Start transcription from the demo page." });
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) return response.status(503).json({ error: "Set GROQ_API_KEY in Vercel to connect." });
  const audio = request.body?.audio;
  if (typeof audio !== "string" || audio.length > Math.ceil(chunkBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) {
    return response.status(400).json({ error: "Send up to four seconds of 16 kHz mono PCM." });
  }
  let pcm = Buffer.from(audio, "base64");
  if (!pcm.length || pcm.length > chunkBytes || pcm.length % 2) {
    return response.status(400).json({ error: "Invalid PCM length." });
  }
  if (pcm.length < 320) pcm = Buffer.concat([pcm, Buffer.alloc(320 - pcm.length)]);
  const form = new FormData();
  form.set("model", model);
  form.set("language", "si");
  form.set("temperature", "0");
  form.set("file", wave(pcm), "chunk.wav");

  const start = performance.now();
  try {
    const result = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(3500),
    });
    if (!result.ok) return response.status(502).json({ error: `Groq returned HTTP ${result.status}.` });
    const { text } = await result.json();
    if (typeof text !== "string") return response.status(502).json({ error: "Groq returned an invalid transcript." });
    return response.status(200).json({ text: text.trim(), apiMs: performance.now() - start });
  } catch (error) {
    return error.name === "TimeoutError" ? response.status(504).json({ error: "Groq timed out." })
      : response.status(502).json({ error: "Could not reach Groq." });
  }
};

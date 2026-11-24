"use strict";

((root, factory) => {
  const wire = factory();
  if (typeof module === "object" && module.exports) module.exports = wire;
  else root.LiveWire = wire;
})(globalThis, () => {
  function connection(provider, token, setup) {
    if (provider === "deepgram") {
      const url = new URL("wss://api.deepgram.com/v1/listen");
      for (const [key, value] of Object.entries({
        model: "nova-3", language: "si", encoding: "linear16", sample_rate: 16000,
        channels: 1, interim_results: true, endpointing: 400, punctuate: true,
      })) url.searchParams.set(key, value);
      return { url, protocols: ["bearer", token] };
    }
    const url = new URL("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained");
    url.searchParams.set("access_token", token);
    return { url, protocols: [], setup: JSON.stringify({ setup }) };
  }

  function audioPacket(provider, bytes) {
    if (provider === "deepgram") return bytes;
    const data = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    return JSON.stringify({ realtimeInput: { audio: { data, mimeType: "audio/pcm;rate=16000" } } });
  }

  function endPacket(provider) {
    return JSON.stringify(provider === "deepgram"
      ? { type: "CloseStream" } : { realtimeInput: { audioStreamEnd: true } });
  }

  function transcripts(provider, message, elapsed) {
    if (provider === "deepgram" && message.type === "Results") {
      const text = message.channel?.alternatives?.[0]?.transcript;
      return text?.trim() || message.is_final ? [[elapsed, text || "", Boolean(message.is_final)]] : [];
    }
    if (provider === "gemini") {
      const content = message.serverContent || {};
      return ["interimInputTranscription", "inputTranscription"].flatMap((key) => {
        const text = content[key]?.text;
        return text?.trim() ? [[elapsed, text, key === "inputTranscription"]] : [];
      });
    }
    return [];
  }

  return { connection, audioPacket, endPacket, transcripts };
});

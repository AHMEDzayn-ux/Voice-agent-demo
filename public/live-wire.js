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
    if (provider === "openai") {
      return {
        url: new URL("wss://api.openai.com/v1/realtime?intent=transcription"),
        protocols: ["realtime", `openai-insecure-api-key.${token}`],
        setup: JSON.stringify({ type: "session.update", session: setup }),
      };
    }
    const url = new URL("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained");
    url.searchParams.set("access_token", token);
    return { url, protocols: [], setup: JSON.stringify({ setup }) };
  }

  const encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

  function audioPacket(provider, bytes) {
    if (provider === "deepgram") return bytes;
    const data = encode(bytes);
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

  function openaiInput() {
    let phase = 0;
    let previous;
    let noiseFloor;
    let pending = 0;
    let quietSamples = 0;
    let heardSpeech = false;

    function appendPacket(samples) {
      // Preserve the interpolation phase between 16 kHz frames, including short tails.
      const output = new Int16Array(Math.floor((samples.length * 3 + phase) / 2));
      let index = 0;
      for (const sample of samples) {
        previous ??= sample;
        phase += 3;
        while (phase >= 2) {
          phase -= 2;
          output[index++] = Math.round((sample * (3 - phase) + previous * phase) / 3);
        }
        previous = sample;
      }
      return JSON.stringify({ type: "input_audio_buffer.append", audio: encode(output.buffer) });
    }

    function commit() {
      pending = quietSamples = 0;
      heardSpeech = false;
      return JSON.stringify({ type: "input_audio_buffer.commit" });
    }

    return {
      append(bytes) {
        const samples = new Int16Array(bytes);
        let power = 0;
        for (const sample of samples) power += sample * sample;
        const rms = Math.sqrt(power / samples.length) / 32768;
        noiseFloor = Math.max(0.002, Math.min(rms, noiseFloor === undefined ? 0.025 : noiseFloor * 1.005));
        const quiet = rms < Math.max(0.01, 2 * noiseFloor);
        quietSamples = quiet ? quietSamples + samples.length : 0;
        heardSpeech ||= !quiet;
        pending += samples.length;
        const packets = [appendPacket(samples)];
        // Commit on a 400 ms pause or after 10 s of continuous audio.
        if ((heardSpeech && quietSamples >= 6400) || pending >= 160000) packets.push(commit());
        return packets;
      },
      finish() {
        if (!pending) return [];
        // Very short buffered tails need at least 100 ms to commit.
        const packets = pending < 1600 ? [appendPacket(new Int16Array(1600 - pending))] : [];
        packets.push(commit());
        return packets;
      },
    };
  }

  function openaiTranscript() {
    const items = new Map();
    const committed = new Set();
    return {
      read(message, elapsed) {
        const id = message.item_id;
        if (!id) return [];
        if (message.type === "input_audio_buffer.committed") {
          committed.add(id);
          return [];
        }
        const item = items.get(id);
        if (item?.final) return [];
        if (message.type === "conversation.item.input_audio_transcription.delta" && typeof message.delta === "string") {
          const text = (item?.text || "") + message.delta;
          items.set(id, { text, final: false });
          return text.trim() ? [[elapsed, text, false]] : [];
        }
        if (message.type === "conversation.item.input_audio_transcription.completed" && typeof message.transcript === "string") {
          items.set(id, { text: message.transcript, final: true });
          return [[elapsed, message.transcript, true]];
        }
        if (message.type === "conversation.item.input_audio_transcription.failed") {
          items.delete(id);
          return [[elapsed, "", true]];
        }
        return [];
      },
      text() {
        // Completion events may arrive out of order across turns.
        const order = new Set([...committed, ...items.keys()]);
        const raw = [];
        const interim = [];
        for (const id of order) {
          const item = items.get(id);
          if (item?.text.trim()) (item.final ? raw : interim).push(item.text.trim());
        }
        return { raw: raw.join(" "), interim: interim.join(" ") };
      },
    };
  }

  return { connection, audioPacket, endPacket, transcripts, openaiInput, openaiTranscript };
});

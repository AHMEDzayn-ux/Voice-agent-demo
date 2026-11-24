# Sinhala STT for live calls

A static benchmark demo comparing Deepgram Nova‑3 and Gemini 3.8 Live for a Sinhala call-center voice agent.

## Present the demo

1. Choose **Pauses and restarts** or **Sinhala–English code-switching**, then switch between clean audio, G.711 A-law, and 10 dB telephone noise.
2. Play the 1× replay or scrub the waveform. The first-text, first-Sinhala, first-final and interim-event measurements appear as the captured events arrive.
3. Compare **Raw**, **Deterministic**, and **LLM cleanup** for either provider. Rules run locally. Flash-Lite output and the added request time come from the capture. The noisy pause sample includes the successful retry capture.
4. Paste a human-verified reference for the selected scenario to reveal CER and WER once the transcripts finish. Optionally enter approved terms as `heard term => approved term`, one per line. The reference and glossary stay in the browser tab.
5. Use the three-call benchmark, rollout checks, and optional cost calculator to discuss the choice. The small call set is a pilot, and character and word scores need verified references.

## Deploy to Vercel

Import this repository and deploy `main`. Use **Other** if Vercel asks for a framework. The repository config selects `public` as the output directory. Leave the build command blank and the root directory at the repository root. The demo requires no API keys or environment variables.

## Preview and test

Serve `public` locally for a browser preview:

```sh
python -m http.server 8080 --directory public
```

Open [localhost:8080](http://localhost:8080). Run the dependency-free checks with Node:

```sh
node --test
```

The replay contains simulated audio and captured outputs. The real-call section contains only anonymized numerical measurements. In the measured runs, both providers received the same 16 kHz mono stream in 20 ms packets with Sinhala selected or hinted. Speech boundaries are estimated by Silero VAD.

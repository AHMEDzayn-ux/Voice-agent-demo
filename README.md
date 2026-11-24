# Sinhala STT for live calls

A benchmark demo for Sinhala call-center speech recognition. Live test compares Deepgram Nova‑3, Gemini 3.8 Live, and OpenAI GPT Live Transcribe.

## Present the demo

1. Choose **Pauses and restarts** or **Sinhala–English code-switching**, then switch between clean audio, G.711 A-law, and 10 dB telephone noise.
2. Use **Streams** to watch both providers side by side. Play the 1× replay or scrub the waveform. **Show results** jumps to the full outputs.
3. Open **Cleanup** to compare **Raw**, **Deterministic**, and **LLM cleanup** for either provider. Rules run locally. Flash-Lite output and the added request time come from the capture. The noisy pause sample includes the successful retry capture.
4. Paste a human-verified reference for the selected scenario to reveal CER and WER once the transcripts finish. Optionally enter approved terms as `heard term => approved term`, one per line. The reference and glossary stay in the browser tab.
5. Open **Benchmarks** for the three-call pilot, rollout checks, and a price-sourced USD calculator. Accuracy scores need verified references.
6. Choose **Load real calls** and select the separate private replay file from your computer. The tab loads the recording and captured transcripts locally. Keep the file outside the repository and deployment.

## Deploy to Vercel

Import this repository and deploy `main`. Use **Other** if Vercel asks for a framework. The repository config serves `public` and the runtime endpoint lives in `api`. Keep the root directory at the repository root and the build command blank. The replay and calculator work without configured credentials.

### Enable the Live test

Set the server-side environment variables for the providers you want to test in Vercel, then redeploy.

- `DEEPGRAM_API_KEY` — a key with at least Member permissions so it can mint temporary tokens.
- `GOOGLE_API_KEY` or `GEMINI_API_KEY` — a Gemini Developer API key with Live access.
- `OPENAI_API_KEY` — an OpenAI API project key with access to `gpt-live-transcribe`. [Create an API key](https://platform.openai.com/api-keys) and check [API billing](https://platform.openai.com/settings/organization/billing/overview).

Open **Live test** and choose **Start mic** or select a simulated recording and choose **Play & stream**. Use **Choose another audio file** to select a different file from your device. The recording plays as the browser streams the same mono audio to each connected provider in 20 ms packets. Deepgram and Gemini receive 16 kHz audio. OpenAI receives the same signal resampled to 24 kHz and detects the language automatically. The browser commits OpenAI turns after an estimated 400 ms speech pause or every 10 seconds of uninterrupted audio, which can affect first-final latency. Each provider panel shows the playback position when its latest text arrived and flags text that came in after playback.

Sessions last up to two minutes. Vercel issues short-lived client tokens. Microphone capture requires HTTPS or localhost. Gemini audio responses are ignored by the interface and may still incur output charges. Anyone who can access the deployment can run tests using your configured provider quotas.

Compare **Pauses and restarts · Clean recording** with its fan and office variants. Each mix uses the same speech and timing. The added noise level gives a 10 dB signal-to-noise ratio over speech intervals estimated with Silero VAD. The fan and office source recordings are CC0. [Computer Fan Loop by Ezcah](https://freesound.org/people/Ezcah/sounds/242042/) and [Office Ambience by DiArchangeli](https://freesound.org/people/DiArchangeli/sounds/108695/).

## Preview and test

Serve `public` locally for a browser preview:

```sh
python -m http.server 8080 --directory public
```

Open [localhost:8080](http://localhost:8080). Run the dependency-free checks with Node:

```sh
node --test
```

The Streams replay contains simulated audio and captured outputs. Benchmarks includes anonymized numerical measurements for three real calls from the pilot. In the measured runs, both providers received the same 16 kHz mono stream in 20 ms packets with Sinhala selected or hinted. Speech boundaries are estimated by Silero VAD.

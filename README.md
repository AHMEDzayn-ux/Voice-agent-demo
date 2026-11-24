# Sinhala STT for live calls

A static benchmark demo comparing Deepgram Nova‑3 and Gemini 3.8 Live for a Sinhala call-center voice agent.

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

Set one or both of these server-side environment variables in the Vercel project, then redeploy. Both are needed for a side-by-side test.

- `DEEPGRAM_API_KEY` — a key with at least Member permissions so it can mint temporary tokens.
- `GOOGLE_API_KEY` or `GEMINI_API_KEY` — a Gemini Developer API key with Live access.

Open **Live test** and choose **Start mic** or select a recording and choose **Stream recording**. The picker includes three original call recordings and six simulated recordings. Use **Choose another audio file** to select a different file from your device. The recording plays as the browser sends the audio directly to each connected provider at normal speed in identical 20 ms packets of 16 kHz mono audio. Sessions last up to two minutes. Vercel only issues short-lived tokens. Microphone capture requires HTTPS or localhost. Gemini audio responses are ignored by the interface and may still incur output charges. Anyone who can access the deployment can run tests using your configured provider quotas.

## Preview and test

Serve `public` locally for a browser preview:

```sh
python -m http.server 8080 --directory public
```

Open [localhost:8080](http://localhost:8080). Run the dependency-free checks with Node:

```sh
node --test
```

The Streams replay contains simulated audio and captured outputs. Benchmarks includes anonymized numerical measurements for the three calls in the Live test picker. In the measured runs, both providers received the same 16 kHz mono stream in 20 ms packets with Sinhala selected or hinted. Speech boundaries are estimated by Silero VAD.

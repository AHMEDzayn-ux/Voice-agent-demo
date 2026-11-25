# Sinhala STT for live calls

A benchmark demo for Sinhala call-center speech recognition. Live test compares Deepgram Nova‑3, Gemini 3.8 Live, OpenAI GPT Live Transcribe, and optional Azure Speech and Groq Whisper.

## Present the demo

1. Choose **Pauses and restarts** or **Sinhala–English code-switching**, then switch between clean audio, G.711 A-law, and 10 dB telephone noise.
2. Open **Cleanup** to play the 1× replay, scrub the waveform, or expand **Captured streams**. **Show results** jumps to the full outputs.
3. Compare **Raw** and **LLM cleanup** for either captured provider. Flash-Lite output and the added request time come from the capture. The noisy pause sample includes the successful retry capture.
4. The simulated scenarios load the supplied exact wording automatically. **Live test → Transcript comparison and accuracy** lets you select a provider and compare raw and LLM outputs with the reference. **Cleanup** offers the same comparison for the two captured providers. Changed and extra words are highlighted, and missing words are struck through. For a microphone recording, paste the reference after the run. Reference edits stay in the browser tab.
5. Open **Benchmarks** for intent, critical details, and first-text timing across four recorded scenarios. Select a scenario to hear the audio and inspect every tested model. Enter monthly caller audio minutes in **Costs** for a source-linked estimate. **Deployment** includes the Azure region comparison and call-center rollout checks.
6. Choose **Load real calls** and select the separate private replay file from your computer. The tab loads the recording and captured transcripts locally. Keep the file outside the repository and deployment.

## Deploy to Vercel

Import this repository and deploy `main`. Use **Other** if Vercel asks for a framework. The repository config serves `public` and the runtime endpoint lives in `api`. Keep the root directory at the repository root and the build command blank. The replay and calculator work without configured credentials.

### Enable the Live test

Set the server-side environment variables for the providers you want to test in Vercel, then redeploy.

- `DEEPGRAM_API_KEY` — a key with at least Member permissions so it can mint temporary tokens.
- `GOOGLE_API_KEY` or `GEMINI_API_KEY` — a Gemini Developer API key with Live access.
- `OPENAI_API_KEY` — an OpenAI API project key with access to `gpt-live-transcribe`. [Create an API key](https://platform.openai.com/api-keys) and check [API billing](https://platform.openai.com/settings/organization/billing/overview).
- `GROQ_API_KEY` — enables Groq Whisper and makes Qwen 3.8 27B the cleanup model. [Create a Groq API key](https://console.groq.com/keys).
- `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` — the key and region code from **Keys and Endpoint** on your Azure Speech resource. Choose the **Free F0** tier for a small pilot if available. [Create a Speech resource](https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices) and see the [Microsoft setup guide](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/get-started-speech-to-text).

Open **Live test** and choose **Start mic** or select a simulated recording and choose **Play & stream**. Use **Choose file** to select a different file from your device. The recording plays as the browser streams the same mono audio to each connected provider in 20 ms packets. Deepgram and Gemini receive 16 kHz audio. OpenAI receives the same signal resampled to 24 kHz and detects the language automatically. The browser commits OpenAI turns after an estimated 400 ms speech pause or every 10 seconds of uninterrupted audio, which can affect first-final latency. Each connected provider has one row. The row shows the playback position when its latest text arrived and flags text that came in after playback.

Sessions last up to two minutes. Vercel issues short-lived client tokens. Microphone capture requires HTTPS or localhost. Gemini audio responses are ignored by the interface and may still incur output charges. Anyone who can access the deployment can run tests using your configured provider quotas.

Configured providers join each live test automatically. **Groq Whisper** receives the same live audio in four-second chunks through `whisper-large-v3`. Its arrival time includes the wait to collect each chunk. The row reports the Groq STT API time separately. [Groq speech-to-text API](https://console.groq.com/docs/speech-to-text).

Deepgram, Gemini and **OpenAI GPT Live Transcribe** stay visible during a test. If a connection fails before delivering text, the row shows its status and collapses the empty transcript and timings. Deepgram keeps its connection alive while the other providers finish opening so they can receive audio from the same starting point.

**Azure Speech** runs continuous native streaming in Sinhala (`si-LK`). The Speech SDK receives the same 16 kHz mono packets as Deepgram and Gemini, with Azure segmentation set to 400 ms of silence. The same playback clock and cleanup measurements apply. The Azure resource key remains server-side. [Azure Speech language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=stt).

### Measure live cleanup

Use **Transcript** to switch between **Raw transcript** and **LLM cleanup**. Select **LLM cleanup** before starting the test to apply corrections during the stream and switch to the cleaned view. Each request contains a finalized chunk plus up to four earlier finalized fragments from the same stream, limited to the last 480 characters of context. The model returns a correction for the current chunk only. The app briefly groups nearby results and runs one request at a time per provider. Providers share a request when both the chunk and its context match. Pending, rejected, and timed-out chunks display the provider transcript. The comparison at the bottom updates during the run, with accuracy scores and highlights calculated once each output is complete.

**Review numbers** shows changes between interim and final values in the same segment. It also suggests leading zeros for clearly labelled identifiers when the transcript or Azure’s recognized word form includes a repeated-zero phrase such as `බිංදු දෙකයි`. Check the audio before accepting a suggestion in the **Reviewed transcript**. If the words are missing, confirm the account number digit by digit. The original provider and LLM outputs remain available for comparison.

Live LLM cleanup formats an explicitly spoken `බිංදු දෙකයි` as `00` when it appears in the current chunk. A pre-existing `02` stays as dictated by the provider and can be checked in number review when spoken evidence is available.

For a recording that contains only a numeric identifier, turn on **Digit dictation** before starting. The live cleanup joins the spoken number groups and retains leading zeros. If a group cannot be verified from the transcript, repeat the identifier one digit at a time.

Expand **Pipeline timings** in a provider row to see added and cumulative latency for its latest finalized segment, including time in the cleanup queue and the browser request. **Total** starts at the first audio packet. Shared requests are marked so their elapsed time can be distinguished from a fresh model request. With a Groq key, the server uses `qwen/qwen3.8-27b` with reasoning disabled and a 1.4-second upstream deadline. Gemini 3.5 Flash-Lite is used when only a Google key is configured, with a 2.2-second upstream deadline. Cleanup allows thousands separators, time punctuation, and recognizable account or NIC formatting while preserving the digits and spoken corrections. It also allows approved Sinhala-to-English loanword spellings. The server rejects changed numeric values, email addresses, unrelated English words, and large rewrites.

Compare **Clean recording**, **Telephone (G.711 A-law)**, **Telephone + fan noise**, and **Telephone + office noise** for both **Pauses and restarts** and **Sinhala–English code-switching** in Live test. The variants of each scenario use the same speech and timing. For code-switching, the background tracks were recovered by subtracting the original clean Pauses and restarts recording from its unfiltered noise mixes. The backgrounds were extended with a 250 ms crossfade and mixed with the clean code-switching clip. The mixes target a 10 dB signal-to-noise ratio over speech intervals estimated with Silero VAD before telephone filtering. FFmpeg applies a 300–3,400 Hz band limit and a G.711 A-law encode/decode at 8 kHz mono. The resulting PCM WAV files retain the telephone bandwidth for browser playback. These are simulated narrowband calls. The fan and office source recordings are CC0. [Computer Fan Loop by Ezcah](https://freesound.org/people/Ezcah/sounds/242042/) and [Office Ambience by DiArchangeli](https://freesound.org/people/DiArchangeli/sounds/108695/).

To round-trip a noise mix through the telephone codec, use these commands. The example uses the unfiltered Pauses and restarts fan mix already in the repository.

```sh
ffmpeg -i public/assets/pause-fan_noise_10db.wav -af "highpass=f=300,highpass=f=300,lowpass=f=3400,lowpass=f=3400" -ar 8000 -ac 1 -c:a pcm_alaw telephone-alaw.wav
ffmpeg -i telephone-alaw.wav -map_metadata -1 -fflags +bitexact -c:a pcm_s16le public/assets/pause-phone-fan.wav
```

**Fast urban speech** and **Southern Sinhala accent** in Live test each include the original speech, telephone-only, telephone plus fan, and telephone plus office variants. Their noise mixes use an 18 dB pre-filter SNR target for a lighter background. All variants of each scenario share the supplied reference, including the spoken corrections. Verify the amounts, identifiers, times, and email separately when evaluating field accuracy. WER and CER normalize punctuation.

## Preview and test

Serve `public` locally for a browser preview:

```sh
python -m http.server 8080 --directory public
```

Open [localhost:8080](http://localhost:8080). Run the dependency-free checks with Node:

```sh
node --test
```

Captured streams under **Cleanup** contains simulated audio and captured outputs. For the scenario benchmark, providers received the same 16 kHz mono stream in 20 ms packets at recording speed. A shared text model extracted intent and fields from each raw transcript, and the extracted values were checked against the supplied references. The page also includes anonymized latency measurements for three real calls, with speech boundaries estimated by Silero VAD.

"use strict";

(() => {
  const sdkUrl = "https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.53.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js";
  const integrity = "sha384-YG0CfpDhvvBF6YvDNHgeAPtRBdnkEnbLtXyPhAfT+dB7uCoCZgcIruOnhmQhJQqv";
  let sdkRequest;

  function prepare() {
    if (window.SpeechSDK) return Promise.resolve(window.SpeechSDK);
    sdkRequest ||= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = sdkUrl;
      script.integrity = integrity;
      script.crossOrigin = "anonymous";
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error("Could not load the Azure Speech SDK."));
      };
      const timer = setTimeout(fail, 6000);
      script.onerror = fail;
      script.onload = () => {
        clearTimeout(timer);
        if (window.SpeechSDK) resolve(window.SpeechSDK);
        else fail();
      };
      document.head.append(script);
    }).catch((error) => { sdkRequest = undefined; throw error; });
    return sdkRequest;
  }

  function connect(sdk, { token, region }, { signal, onText, onError }) {
    signal.throwIfAborted();
    const config = sdk.SpeechConfig.fromAuthorizationToken(token, region);
    config.speechRecognitionLanguage = "si-LK";
    config.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "400");
    const stream = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1));
    const recognizer = new sdk.SpeechRecognizer(config, sdk.AudioConfig.fromStreamInput(stream));
    let resolveDrain;
    const drained = new Promise((resolve) => { resolveDrain = resolve; });
    let started = false;
    let inputEnded = false;
    let closed = false;

    return new Promise((resolve, reject) => {
      const client = {
        get active() { return started && !closed && !inputEnded; },
        write(bytes) { if (client.active) stream.write(bytes); },
        end() {
          if (!inputEnded && !closed) {
            inputEnded = true;
            try { stream.close(); }
            catch { close(new Error("Azure could not finish the audio stream.")); }
          }
          return drained;
        },
      };
      const close = (error, completed = false) => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        resolveDrain(completed);
        if (!inputEnded) stream.close();
        recognizer.close();
        if (!started) reject(error || new Error("Azure closed before recognition started."));
        else if (error && !signal.aborted) onError(error.message);
      };
      const abort = () => close(signal.reason);
      const timer = setTimeout(() => close(new Error("Azure connection timed out.")), 8000);
      signal.addEventListener("abort", abort, { once: true });

      recognizer.sessionStarted = () => {
        if (closed) return;
        started = true;
        clearTimeout(timer);
        resolve(client);
      };
      recognizer.recognizing = (_, { result }) => {
        if (!closed && result.text?.trim()) onText(result.text, false);
      };
      recognizer.recognized = (_, { result }) => {
        if (closed) return;
        if (result.reason === sdk.ResultReason.RecognizedSpeech) onText(result.text || "", true);
        else if (result.reason === sdk.ResultReason.NoMatch) onText("", true);
      };
      recognizer.sessionStopped = () => close(inputEnded ? null : new Error("Azure stream ended early."), inputEnded);
      recognizer.canceled = (_, event) => {
        if (inputEnded && event.reason === sdk.CancellationReason.EndOfStream) close(null, true);
        else {
          const code = sdk.CancellationErrorCode[event.errorCode];
          close(new Error(code ? `Azure Speech error (${code}).` : "Azure Speech canceled the session."));
        }
      };
      try {
        recognizer.startContinuousRecognitionAsync(undefined, () => close(new Error("Azure could not start continuous recognition.")));
      } catch {
        close(new Error("Azure could not start continuous recognition."));
      }
    });
  }

  window.LiveAzure = { prepare, connect };
})();

"use strict";

class BenchmarkPCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Int16Array(320);
    this.offset = 0;
    this.active = true;
    this.port.onmessage = ({ data }) => {
      if (data === "stop") {
        this.active = false;
        if (this.offset) this.send(this.frame.slice(0, this.offset));
        this.port.postMessage("flushed");
      }
    };
  }

  send(samples) {
    this.port.postMessage(samples.buffer, [samples.buffer]);
  }

  process(inputs) {
    const mono = inputs[0]?.[0];
    if (!mono || !this.active) return true;
    for (const value of mono) {
      const bounded = Math.max(-1, Math.min(1, value));
      this.frame[this.offset++] = bounded < 0 ? bounded * 32768 : bounded * 32767;
      if (this.offset === this.frame.length) {
        this.send(this.frame);
        this.frame = new Int16Array(320);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("benchmark-pcm", BenchmarkPCM);

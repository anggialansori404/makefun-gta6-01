// audio.js — every sound in Velvet Tide is synthesized with WebAudio.
// There are no audio assets: an engine is two detuned oscillators whose pitch
// follows the throttle, a siren is a wailing triangle wave, a gunshot is a
// burst of filtered noise. The context wakes on the first user gesture.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.noiseBuffer = null;
  }

  wake() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.3, freq = 1200, q = 0.8, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // Continuous engine voice; call every frame while driving, stop on exit.
  engine(speedNorm, running) {
    if (!this.ctx) return;
    if (running && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc2.type = 'square';
      this.engineGain.gain.value = 0.0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      this.engineOsc.connect(filter);
      this.engineOsc2.connect(filter);
      filter.connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
      this.engineOsc2.start();
    }
    if (!this.engineOsc) return;
    if (!running) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      const osc = this.engineOsc;
      const osc2 = this.engineOsc2;
      window.setTimeout(() => { try { osc.stop(); osc2.stop(); } catch { /* already stopped */ } }, 250);
      this.engineOsc = null;
      this.engineOsc2 = null;
      this.engineGain = null;
      return;
    }
    const f = 55 + speedNorm * 165;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5 + 2, this.ctx.currentTime, 0.05);
    this.engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.075, this.ctx.currentTime, 0.08);
  }

  // Police siren whose loudness follows the nearest cruiser's distance.
  siren(distance) {
    if (!this.ctx) return;
    const vol = Math.max(0, 0.11 * (1 - distance / 620));
    if (vol <= 0.004) {
      if (this.sirenOsc) {
        try { this.sirenOsc.stop(); } catch { /* already stopped */ }
        this.sirenOsc = null;
      }
      return;
    }
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.55;
      lfoGain.gain.value = 190;
      lfo.connect(lfoGain).connect(this.sirenOsc.frequency);
      this.sirenOsc.frequency.value = 840;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
      lfo.start();
      this.sirenOsc._lfo = lfo;
    }
    this.sirenGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
  }

  horn() {
    this.tone(370, 0.28, 'square', 0.12);
    this.tone(466, 0.28, 'square', 0.1);
  }

  shot() {
    this.noise(0.13, 0.5, 2600, 0.4);
    this.tone(150, 0.09, 'square', 0.22, 45);
  }

  dryClick() {
    this.tone(1900, 0.03, 'square', 0.08);
  }

  crash(intensity) {
    const v = Math.min(0.6, 0.15 + intensity * 0.5);
    this.noise(0.22, v, 300, 0.5);
    this.tone(80, 0.2, 'sine', v, 35);
  }

  door() {
    this.noise(0.07, 0.18, 700, 1.2);
    this.tone(120, 0.08, 'sine', 0.12, 70);
  }

  pickup() {
    this.tone(660, 0.09, 'sine', 0.16);
    this.tone(990, 0.14, 'sine', 0.16, null, 0.07);
  }

  cash() {
    this.tone(880, 0.07, 'triangle', 0.18);
    this.tone(1174, 0.07, 'triangle', 0.18, null, 0.06);
    this.tone(1568, 0.16, 'triangle', 0.18, null, 0.12);
  }

  hurt() {
    this.tone(220, 0.16, 'sawtooth', 0.2, 110);
  }

  bustedSting() {
    this.tone(392, 0.22, 'square', 0.16);
    this.tone(311, 0.22, 'square', 0.16, null, 0.2);
    this.tone(233, 0.5, 'square', 0.16, null, 0.4);
  }

  missionJingle() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.tone(n, 0.16, 'triangle', 0.17, null, i * 0.09));
  }

  click() {
    this.tone(1200, 0.04, 'square', 0.07);
  }
}

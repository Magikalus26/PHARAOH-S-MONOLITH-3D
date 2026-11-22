/**
 * SynthAudio — Zero-external-audio procedural Web Audio API synthesizer.
 * Generates metallic copper pickaxe clinks, tumbling limestone rock clacks,
 * stonemason chisel scrapes, wet-sand water splashes, heavy stone placement thuds,
 * subtle UI tablet taps, and golden Egyptian harp quest chimes.
 */
export class SynthAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.muted = false;
    this.volume = 0.7;
    this.noiseBuffer = null;
    this.lastRockClackTime = 0;
    this.lastWaterSplashTime = 0;
  }

  /**
   * Must be called inside a user gesture (touchstart / pointerdown / click)
   * to unlock AudioContext on iOS Safari.
   */
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
      this._createNoiseBuffer();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.02
      );
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  _ready() {
    if (this.muted) return false;
    if (!this.ctx) this.unlock();
    return !!(this.ctx && this.ctx.state === 'running');
  }

  _createNoiseBuffer() {
    if (!this.ctx) return;
    const length = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.18) * 1.3;
    }
    this.noiseBuffer = buffer;
  }

  /** Metallic copper pickaxe clink + limestone fracture crunch */
  playPickaxeStrike() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const pitchVar = 0.92 + Math.random() * 0.18;

    // 1. Metallic copper ring (two inharmonic partials)
    const freqs = [1480 * pitchVar, 2740 * pitchVar, 4120 * pitchVar];
    const gains = [0.16, 0.10, 0.05];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.94, t + 0.18);
      g.gain.setValueAtTime(gains[idx], t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.19 - idx * 0.03);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.21);
    });

    // 2. Rock impact transient burst
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(620 * pitchVar, t);
      filter.Q.value = 1.6;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.45, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      src.start(t, Math.random() * 0.8, 0.13);
    }
  }

  /** Tumbling limestone rock clack (rate-limited for rock piles) */
  playRockClack(intensity = 0.7) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    if (t - this.lastRockClackTime < 0.045) return;
    this.lastRockClackTime = t;

    const clamped = Math.max(0.15, Math.min(1, intensity));
    const freq = 220 + Math.random() * 260;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.42, t + 0.065);
    g.gain.setValueAtTime(0.22 * clamped, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.08);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(950 + Math.random() * 500, t);
      bp.Q.value = 2.4;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.18 * clamped, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.masterGain);
      src.start(t, Math.random() * 0.9, 0.07);
    }
  }

  /** Stonemason bronze chisel tap & sandstone scrape */
  playChiselScrape() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const p = 0.9 + Math.random() * 0.22;

    // Crisp mallet-on-chisel tap
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1950 * p, t);
    osc.frequency.exponentialRampToValueAtTime(1120 * p, t + 0.05);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.07);

    // Gritty stone chip scrape
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(2400 * p, t);
      hp.frequency.linearRampToValueAtTime(3600 * p, t + 0.08);
      hp.Q.value = 1.9;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.24, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      src.connect(hp);
      hp.connect(ng);
      ng.connect(this.masterGain);
      src.start(t, Math.random() * 0.7, 0.1);
    }
  }

  /** Clay water jar splash onto hot desert sand */
  playWaterSplash() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    if (t - this.lastWaterSplashTime < 0.24) return;
    this.lastWaterSplashTime = t;

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(850, t);
      bp.frequency.exponentialRampToValueAtTime(420, t + 0.2);
      bp.Q.value = 1.4;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.masterGain);
      src.start(t, Math.random() * 0.5, 0.24);
    }

    // Subtle droplet bubble
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    const startF = 520 + Math.random() * 240;
    osc.frequency.setValueAtTime(startF, t + 0.02);
    osc.frequency.exponentialRampToValueAtTime(startF * 1.45, t + 0.09);
    og.gain.setValueAtTime(0.06, t + 0.02);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(og);
    og.connect(this.masterGain);
    osc.start(t + 0.02);
    osc.stop(t + 0.11);
  }

  /** Heavy 1.5m limestone block settling thud */
  playStoneThud(pitchScale = 1.0) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;

    // Deep sub-bass weight impact
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(118 * pitchScale, t);
    osc.frequency.exponentialRampToValueAtTime(38 * pitchScale, t + 0.22);
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.28);

    // Stone-on-stone sandy cushion settle
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(480, t);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.26, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.connect(lp);
      lp.connect(ng);
      ng.connect(this.masterGain);
      src.start(t, Math.random() * 0.6, 0.18);
    }
  }

  /** Soft stone/wood pickup pop */
  playPickup(pitchBoost = 0) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const base = 320 + pitchBoost * 32;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.42, t + 0.08);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  /** Golden Egyptian harp arpeggio chime (Hijaz warm royal chord) */
  playQuestChime() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    // D4, F#4, G4, A4, C#5, D5 — warm Egyptian harp progression
    const notes = [293.66, 369.99, 392.00, 440.00, 554.37, 587.33];
    notes.forEach((freq, i) => {
      const start = t + i * 0.068;
      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      osc.type = 'triangle';
      osc2.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      osc2.frequency.setValueAtTime(freq * 2, start);

      g.gain.setValueAtTime(0.001, start);
      g.gain.linearRampToValueAtTime(0.18, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0008, start + 0.72);

      const g2 = this.ctx.createGain();
      g2.gain.value = 0.25;

      osc.connect(g);
      osc2.connect(g2);
      g2.connect(g);
      g.connect(this.masterGain);

      osc.start(start);
      osc2.start(start);
      osc.stop(start + 0.75);
      osc2.stop(start + 0.75);
    });
  }

  /** Crisp papyrus/wood UI button tap */
  playUiClick() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(540, t);
    osc.frequency.exponentialRampToValueAtTime(280, t + 0.04);
    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }
}

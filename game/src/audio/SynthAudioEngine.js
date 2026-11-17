// CHRONOWEAVE SynthAudioEngine — 100% procedural Web Audio: no assets.
// Reverse-reverb rewind sweeps, synth percussion, harmonic combo chimes, and a
// slow arpeggio music loop. Everything is guarded: no AudioContext, no crash.
export class SynthAudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.muted = false;
    this.musicTimer = null; this.musicStep = 0; this.noiseBuf = null;
  }
  ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.22;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; return false; }
    return true;
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.22;
  }
  tone(freq, dur, type, vol, slideTo) {
    if (!this.ensure()) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* audio must never break the game */ }
  }
  noise(dur, vol, filterFreq) {
    if (!this.ensure()) return;
    try {
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  sfx(name) {
    if (this.muted) return;
    switch (name) {
      case 'shoot': this.tone(880, 0.07, 'square', 0.10, 320); break;
      case 'echoShoot': this.tone(660, 0.06, 'square', 0.05, 240); break;
      case 'hit': this.tone(220, 0.08, 'triangle', 0.16, 140); break;
      case 'block': this.tone(1400, 0.05, 'sine', 0.10, 1200); break;
      case 'shieldBreak': this.tone(520, 0.25, 'sawtooth', 0.2, 90); this.noise(0.2, 0.12, 3000); break;
      case 'kill': this.tone(392, 0.16, 'triangle', 0.2, 180); this.noise(0.12, 0.1, 900); break;
      case 'crossfire': this.tone(523, 0.1, 'sine', 0.18); this.tone(784, 0.14, 'sine', 0.18); break;
      case 'dash': this.noise(0.14, 0.12, 2400); break;
      case 'explode': this.noise(0.4, 0.28, 700); this.tone(90, 0.35, 'sine', 0.25, 40); break;
      case 'rewind': // reverse-reverb sweep: rising shimmer, then a deep drop
        this.tone(180, 0.9, 'sine', 0.14, 1400);
        this.tone(90, 0.9, 'sawtooth', 0.07, 45);
        this.noise(0.8, 0.06, 4000);
        break;
      case 'upgrade': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'sine', 0.16), i * 70)); break;
      case 'click': this.tone(1200, 0.04, 'sine', 0.1); break;
      case 'sniperTele': this.tone(1567, 0.3, 'sine', 0.07, 1567); break;
      case 'sniperShot': this.tone(1800, 0.12, 'square', 0.14, 300); break;
      case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.16), i * 110)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.12), i * 130)); break;
      case 'playerHit': this.tone(160, 0.18, 'sawtooth', 0.2, 70); break;
      case 'stasis': this.tone(1200, 0.5, 'sine', 0.12, 300); break;
      default: break;
    }
  }
  startMusic() {
    if (!this.ensure() || this.musicTimer) return;
    // Slow minor arpeggio: A2 C3 E3 G3, one note per 240ms, quiet pad underneath.
    const notes = [110, 130.81, 164.81, 196.0, 164.81, 130.81];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const f = notes[this.musicStep % notes.length];
      this.musicStep++;
      this.tone(f, 0.5, 'triangle', 0.05);
      if (this.musicStep % 8 === 0) this.tone(f / 2, 1.2, 'sine', 0.06);
    }, 240);
  }
  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}

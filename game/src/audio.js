// audio.js — fully synthesized WebAudio: gunshots, sirens, engine hum,
// pickups, mission jingles and a 3-station radio (step-sequenced bass +
// lead, no audio files). The context is created lazily on first user
// gesture so browsers allow it.
import { createRadioStations } from './radioStations.js';

export function createAudio() {
  const A = {
    ctx: null, master: null, muted: false,
    radioOn: true,
    engineOsc: null, engineGain: null, engineOn: false,
  };

  function ensure() {
    if (A.ctx) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.5;
      A.master.connect(A.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null) {
    if (!ensure() || A.muted) return;
    const t0 = A.ctx.currentTime + when;
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(A.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol = 0.2, filterFreq = 1200, when = 0) {
    if (!ensure() || A.muted) return;
    const t0 = A.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(A.ctx.sampleRate * dur));
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = A.ctx.createBufferSource();
    src.buffer = buf;
    const f = A.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(A.master);
    src.start(t0);
  }

  const sfxMap = {
    shot(w) {
      if (w === 'shotgun') { noise(0.25, 0.5, 900); tone(90, 0.18, 'square', 0.25, 0, 40); }
      else if (w === 'rifle') { noise(0.16, 0.4, 1600); tone(140, 0.1, 'square', 0.2, 0, 60); }
      else if (w === 'smg') { noise(0.09, 0.3, 2000); }
      else { noise(0.14, 0.35, 1400); tone(120, 0.1, 'square', 0.18, 0, 50); }
    },
    dryfire() { tone(1200, 0.05, 'square', 0.1); },
    punch() { noise(0.08, 0.3, 500); },
    hurt() { tone(220, 0.15, 'sawtooth', 0.2, 0, 110); },
    pickup() { tone(660, 0.08, 'sine', 0.2); tone(990, 0.12, 'sine', 0.2, 0.07); },
    cash() { tone(880, 0.09, 'sine', 0.2); tone(1174, 0.09, 'sine', 0.2, 0.08); tone(1568, 0.16, 'sine', 0.2, 0.16); },
    mission() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.22, i * 0.09));
    },
    deny() { tone(160, 0.18, 'square', 0.18, 0, 120); },
    siren() { tone(700, 0.5, 'sine', 0.14, 0, 950); tone(950, 0.5, 'sine', 0.14, 0.5, 700); },
    sirenFar() { tone(660, 0.6, 'sine', 0.05, 0, 880); tone(880, 0.6, 'sine', 0.05, 0.6, 660); },
    wasted() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.22, i * 0.22)); },
    busted() { [330, 262, 196, 165].forEach((f, i) => tone(f, 0.3, 'triangle', 0.22, i * 0.22)); },
    engine() {},
    click() { tone(900, 0.04, 'square', 0.08); },
    door() { noise(0.12, 0.25, 700); tone(180, 0.1, 'sine', 0.15, 0, 90); },
  };

  A.sfx = function sfx(name, arg) {
    if (A.muted) return;
    const fn = sfxMap[name];
    if (fn) {
      try { fn(arg); } catch { /* audio must never break the game */ }
    }
  };

  /** Engine hum: one oscillator whose pitch follows speed. */
  A.setEngine = function setEngine(on, speed01) {
    if (!ensure() || A.muted) {
      if (A.engineOsc) { try { A.engineOsc.stop(); } catch { /* noop */ } A.engineOsc = null; }
      return;
    }
    if (on && !A.engineOsc) {
      A.engineOsc = A.ctx.createOscillator();
      A.engineOsc.type = 'sawtooth';
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0.03;
      const f = A.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500;
      A.engineOsc.connect(f);
      f.connect(A.engineGain);
      A.engineGain.connect(A.master);
      A.engineOsc.start();
    }
    if (A.engineOsc) {
      A.engineOsc.frequency.setTargetAtTime(50 + speed01 * 140, A.ctx.currentTime, 0.05);
      A.engineGain.gain.setTargetAtTime(on ? 0.03 + speed01 * 0.05 : 0, A.ctx.currentTime, 0.1);
      if (!on) {
        const osc = A.engineOsc;
        setTimeout(() => { try { osc.stop(); } catch { /* noop */ } }, 300);
        A.engineOsc = null;
      }
    }
  };

  // Radio: 3 synthesized stations, sequenced by radioStations.js.
  const radio = createRadioStations({
    ensure, tone, noise,
    isMuted: () => A.muted,
    isOn: () => A.radioOn,
  });
  A.radioTick = radio.tick;
  A.radioStationName = radio.stationName;
  A.nextStation = radio.nextStation;
  A.getRadioStation = radio.getStation;
  A.setRadioStation = radio.setStation;

  A.toggleMute = function toggleMute() {
    A.muted = !A.muted;
    if (A.master) A.master.gain.value = A.muted ? 0 : 0.5;
    return A.muted;
  };

  A.unlock = ensure;
  return A;
}

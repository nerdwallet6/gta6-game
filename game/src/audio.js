// audio.js — synthesized WebAudio sound for Vice City Nights.
// No audio files: every sound is an oscillator or filtered noise built
// on first user gesture, so the game plays offline with zero assets.
export function createAudio() {
  const A = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    musicTimer: 0,
    musicStep: 0,
    enabled: true,
    muted: false,
  };

  /** Build the AudioContext and the two looping voices (engine, siren). */
  A.ensure = function ensure() {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume();
      return true;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.5;
      A.master.connect(A.ctx.destination);
      // Engine hum: low sawtooth through a low-pass, pitch follows speed.
      A.engineOsc = A.ctx.createOscillator();
      A.engineOsc.type = 'sawtooth';
      A.engineOsc.frequency.value = 50;
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0;
      const lp = A.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      A.engineOsc.connect(lp);
      lp.connect(A.engineGain);
      A.engineGain.connect(A.master);
      A.engineOsc.start();
      // Police siren: two-tone triangle, silent until there is heat.
      A.sirenOsc = A.ctx.createOscillator();
      A.sirenOsc.type = 'triangle';
      A.sirenOsc.frequency.value = 700;
      A.sirenGain = A.ctx.createGain();
      A.sirenGain.gain.value = 0;
      A.sirenOsc.connect(A.sirenGain);
      A.sirenGain.connect(A.master);
      A.sirenOsc.start();
      return true;
    } catch (e) {
      return false;
    }
  };

  // A short pitched blip, optionally sliding down.
  function tone(freq, dur, type, vol, slideTo) {
    if (!A.ctx || A.muted) return;
    const t0 = A.ctx.currentTime;
    const o = A.ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(A.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  // A burst of filtered noise that decays — gunshots, punches, doors.
  function noise(dur, vol, filterFreq) {
    if (!A.ctx || A.muted) return;
    const t0 = A.ctx.currentTime;
    const len = Math.max(1, Math.floor(A.ctx.sampleRate * dur));
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = A.ctx.createBufferSource();
    src.buffer = buf;
    const f = A.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = A.ctx.createGain();
    g.gain.value = vol || 0.2;
    src.connect(f);
    f.connect(g);
    g.connect(A.master);
    src.start(t0);
  }

  /** Play one named effect. Unknown names are ignored silently. */
  A.sfx = function sfx(name) {
    if (!A.ensure() || A.muted) return;
    switch (name) {
      case 'shot':
        noise(0.12, 0.35, 2600);
        tone(180, 0.08, 'square', 0.12, 60);
        break;
      case 'punch':
        noise(0.08, 0.25, 500);
        break;
      case 'hit':
        tone(220, 0.1, 'sawtooth', 0.14, 90);
        break;
      case 'pickup':
        tone(660, 0.09, 'sine', 0.18);
        setTimeout(() => tone(990, 0.14, 'sine', 0.18), 90);
        break;
      case 'cash':
        tone(880, 0.08, 'sine', 0.16);
        setTimeout(() => tone(1174, 0.08, 'sine', 0.16), 80);
        setTimeout(() => tone(1568, 0.16, 'sine', 0.16), 160);
        break;
      case 'mission':
        [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.18), i * 110));
        break;
      case 'fail':
        [400, 320, 240].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sawtooth', 0.12), i * 140));
        break;
      case 'car':
        tone(140, 0.25, 'sawtooth', 0.14, 320);
        noise(0.18, 0.12, 900);
        break;
      case 'door':
        noise(0.1, 0.2, 700);
        break;
      case 'reload':
        tone(500, 0.05, 'square', 0.1);
        setTimeout(() => tone(700, 0.05, 'square', 0.1), 120);
        break;
      case 'busted':
        [330, 262, 196, 131].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.16), i * 180));
        break;
      default:
        break;
    }
  };

  /**
   * Per-frame audio: engine pitch from the player's speed, the siren
   * wailing while wanted, and a quiet sunset-drive arpeggio loop.
   */
  A.update = function update(G, dt) {
    if (!A.ctx || A.muted) return;
    const speed = G.player.car ? Math.abs(G.player.car.speed) : 0;
    if (A.engineGain) {
      const target = G.player.car ? 0.05 + Math.min(0.12, speed * 0.00035) : 0;
      A.engineGain.gain.setTargetAtTime(target, A.ctx.currentTime, 0.1);
      A.engineOsc.frequency.setTargetAtTime(48 + speed * 0.45, A.ctx.currentTime, 0.08);
    }
    if (A.sirenGain) {
      const wanted = G.wanted > 0;
      A.sirenGain.gain.setTargetAtTime(wanted ? 0.045 : 0, A.ctx.currentTime, 0.2);
      if (wanted) {
        const wail = 700 + Math.sin(G.time * 3.2) * 260;
        A.sirenOsc.frequency.setTargetAtTime(wail, A.ctx.currentTime, 0.05);
      }
    }
    // Sunset-drive music: a looping minor-key arpeggio, kept quiet.
    A.musicTimer -= dt;
    if (A.musicTimer <= 0 && G.screen === 'play') {
      A.musicTimer = 0.24;
      const scale = [220, 261.6, 329.6, 392, 440, 523.2];
      const n = scale[A.musicStep % scale.length];
      A.musicStep++;
      tone(n, 0.22, 'sine', 0.035);
      if (A.musicStep % 4 === 0) tone(n / 2, 0.4, 'triangle', 0.03);
    }
  };

  /** Flip mute; returns the new muted state. */
  A.toggleMute = function toggleMute() {
    A.muted = !A.muted;
    if (A.master) A.master.gain.value = A.muted ? 0 : 0.5;
    return A.muted;
  };

  return A;
}

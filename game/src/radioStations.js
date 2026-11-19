// radioStations.js — the radio: 3 synthesized stations (Solmar FM
// synthwave, Bay 98 sunset chill, Static Talk night talk), each a tiny
// 16-step sequencer loop driven by the main loop's radio tick. No audio
// files; the synth primitives (tone/noise) come from the audio module.
import { RADIO } from './data.js';

export { RADIO };

/**
 * Create the radio. synth: { ensure(), tone(freq, dur, type, vol, when,
 * slideTo), noise(dur, vol, filterFreq, when), isMuted(), isOn() }.
 */
export function createRadioStations(synth) {
  const R = { station: 0, step: 0 };

  /** One sequencer step (called ~every 0.28s by the main loop). */
  R.tick = function radioTick() {
    if (!synth.ensure() || synth.isMuted() || !synth.isOn()) return;
    const st = RADIO[R.station];
    const stepDur = 60 / st.bpm / 4;
    const step = R.step % 16;
    const scale = st.scale;
    const bassNote = st.root * Math.pow(2, scale[[0, 0, 3, 0, 4, 0, 3, 2][step % 8]] / 12);
    if (step % 4 === 0) synth.tone(bassNote, stepDur * 3.5, 'triangle', 0.16);
    if (step % 2 === 0) synth.tone(bassNote * 2, stepDur * 0.8, 'square', 0.04);
    const leadIdx = [0, 2, 4, 3, 6, 4, 2, 1][step % 8];
    if (step % 2 === 1 && st.id !== 'static') {
      synth.tone(st.root * 4 * Math.pow(2, scale[leadIdx % scale.length] / 12), stepDur * 1.2, 'sine', 0.05);
    }
    if (st.id === 'static' && step % 8 === 4) {
      synth.noise(0.3, 0.03, 3000); // talk-station static burst
    }
    R.step++;
  };

  /** Current station name (shown in the HUD). */
  R.stationName = function radioStationName() {
    return RADIO[R.station].name;
  };

  /** Current station description. */
  R.stationDesc = function radioStationDesc() {
    return RADIO[R.station].desc;
  };

  /** Jump to a station index (used when loading a save). */
  R.setStation = function setStation(i) {
    R.station = ((i % RADIO.length) + RADIO.length) % RADIO.length;
    R.step = 0;
  };

  /** Current station index. */
  R.getStation = function getStation() {
    return R.station;
  };

  /** Cycle to the next station; returns its name. */
  R.nextStation = function nextStation() {
    R.station = (R.station + 1) % RADIO.length;
    R.step = 0;
    return RADIO[R.station].name;
  };

  return R;
}

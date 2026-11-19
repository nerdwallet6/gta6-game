// streetRaces.js — the street race engine: checkpoint gates in order, a
// par time, a prize, and a best-time record per race. Races start from
// the start-line markers (E) or from a mission's race step; finishing
// calls G.race.onFinish when the race was started by a mission.
import { RACES, SPOTS } from './data.js';
import { dist2, fmtMoney } from './util.js';
import { createBeacon } from './city.js';
import { addDistrictStanding } from './districtStanding.js';

export function createRaceState() {
  return {
    active: false, id: null, gate: 0, t: 0, par: 0, best: {},
    beacon: null, started: false, onFinish: null,
  };
}

/** Start a race: gates appear in order, timer runs. */
export function startRace(G, raceId) {
  const race = RACES[raceId];
  if (!race) return;
  G.race.active = true;
  G.race.id = raceId;
  G.race.gate = 0;
  G.race.t = 0;
  G.race.par = race.par;
  G.race.started = true;
  G.notice = race.name + ' — hit every gate, beat ' + race.par + 's!';
  G.noticeT = 3;
  G.audio.sfx('mission');
  placeRaceBeacon(G);
}

function placeRaceBeacon(G) {
  if (G.race.beacon) {
    G.scene.remove(G.race.beacon);
    G.race.beacon = null;
  }
  const race = RACES[G.race.id];
  if (!race) return;
  const spotKey = race.gates[G.race.gate];
  if (!spotKey) return;
  const s = SPOTS[spotKey];
  const b = createBeacon(0x40d0ff, 4);
  b.position.set(s.x, 0, s.z);
  G.scene.add(b);
  G.race.beacon = b;
}

/** Per-frame race update: gate hits, timer, finish. */
export function updateRace(G, dt) {
  if (!G.race.active) return;
  const race = RACES[G.race.id];
  G.race.t += dt;
  const spotKey = race.gates[G.race.gate];
  const s = SPOTS[spotKey];
  const p = G.player;
  if (dist2(p.x, p.z, s.x, s.z) < 12) {
    G.race.gate++;
    G.audio.sfx('pickup');
    if (G.race.gate >= race.gates.length) {
      finishRace(G, race);
    } else {
      G.notice = 'Gate ' + G.race.gate + '/' + race.gates.length;
      G.noticeT = 1.5;
      placeRaceBeacon(G);
    }
  }
  // Time out at 3x par.
  if (G.race.t > race.par * 3) {
    G.race.active = false;
    if (G.race.beacon) G.scene.remove(G.race.beacon);
    G.race.beacon = null;
    G.race.onFinish = null;
    G.notice = race.name + ': out of time.';
    G.noticeT = 3;
    // A failed mission race step just restarts the race on re-entry.
  }
}

function finishRace(G, race) {
  const t = G.race.t;
  const best = G.race.best[G.race.id];
  const isBest = !best || t < best;
  if (isBest) G.race.best[G.race.id] = Math.round(t * 10) / 10;
  const beatPar = t <= race.par;
  const prize = beatPar ? race.prize : Math.floor(race.prize / 4);
  G.money += prize;
  G.stats.racesWon += beatPar ? 1 : 0;
  G.stats.racesRun++;
  const spot = SPOTS[race.start];
  addDistrictStanding(G, spot.district, beatPar ? 10 : 3);
  G.audio.sfx('mission');
  G.notice = race.name + ' finished in ' + t.toFixed(1) + 's' +
    (beatPar ? ' — par beaten! +' + fmtMoney(prize) : ' — +' + fmtMoney(prize) + ' (par ' + race.par + 's)');
  G.noticeT = 5;
  G.race.active = false;
  if (G.race.beacon) {
    G.scene.remove(G.race.beacon);
    G.race.beacon = null;
  }
  const onFinish = G.race.onFinish;
  G.race.onFinish = null;
  if (onFinish) onFinish();
  G.save.saveGame(G);
}

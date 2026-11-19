// missions.js — the story engine for Solmar Nights 3D: 9 data-driven
// missions (goto / collect / deliver / eliminate / escape / chase / race /
// heist steps), dialogue and a 3D beacon at the objective. Street races
// live in streetRaces.js; respect ranks in respectRanks.js; per-district
// standing in districtStanding.js.
import { MISSIONS, SPOTS } from './data.js';
import { dist2, fmtMoney } from './util.js';
import { createBeacon } from './city.js';
import { spawnEnemy } from './combat.js';
import { addCrime, clearWanted } from './police.js';
import { startRace } from './streetRaces.js';
import { addDistrictStanding } from './districtStanding.js';
import { totalRespect } from './respectRanks.js';

export function createMissionState() {
  return {
    index: 0, step: 0, started: false, done: false,
    rivalsSpawned: false, killsAtStepStart: 0,
    packageHeld: false, dialogue: null, completeT: 0,
  };
}

export function currentMission(G) {
  return MISSIONS[G.mission.index] || null;
}

export function currentStep(G) {
  const m = currentMission(G);
  if (!m) return null;
  return m.steps[G.mission.step] || null;
}

export function missionTarget(G) {
  const step = currentStep(G);
  if (!step) return null;
  if (step.spot) return SPOTS[step.spot];
  if (step.race) return SPOTS[RACES[step.race].start];
  return null;
}

/** Show a dialogue box (lines advance with E / click). */
export function showDialogue(G, lines) {
  G.mission.dialogue = { lines, i: 0 };
}

export function advanceDialogue(G) {
  const d = G.mission.dialogue;
  if (!d) return false;
  d.i++;
  if (d.i >= d.lines.length) {
    G.mission.dialogue = null;
    return false;
  }
  return true;
}

/** Open a mission: briefing dialogue + beacon + notice. Later missions
 *  need total respect; when gated, returns false and the caller retries
 *  later instead of opening the briefing. */
export function startMission(G, index) {
  const m = MISSIONS[index];
  if (!m) return false;
  const need = m.req || 0;
  const have = totalRespect(G);
  if (have < need) {
    G.notice = 'Need more respect — ' + m.title + ' needs ' + need +
      ' total (you have ' + have + '). Do jobs and races.';
    G.noticeT = 4;
    G.audio.sfx('deny');
    return false;
  }
  G.mission.index = index;
  G.mission.step = 0;
  G.mission.started = true;
  G.mission.rivalsSpawned = false;
  G.mission.packageHeld = false;
  G.mission.killsAtStepStart = G.stats.kills;
  showDialogue(G, [m.title + ' — ' + m.giver, ...m.briefing]);
  G.audio.sfx('mission');
  G.notice = 'New mission: ' + m.title;
  G.noticeT = 3.5;
  refreshBeacon(G);
  return true;
}

/** (Re)place the 3D beacon at the current objective. */
export function refreshBeacon(G) {
  if (G.mission.beacon) {
    G.scene.remove(G.mission.beacon);
    G.mission.beacon = null;
  }
  if (G.race.active && G.race.beacon) {
    G.scene.remove(G.race.beacon);
    G.race.beacon = null;
  }
  if (G.mission.done || !G.mission.started) return;
  const t = missionTarget(G);
  if (!t) return;
  const b = createBeacon(0xffd25f, 3);
  b.position.set(t.x, 0, t.z);
  G.scene.add(b);
  G.mission.beacon = b;
}

/** E key: mission pickup / deliver interactions. */
export function missionInteract(G) {
  const step = currentStep(G);
  if (!step || !G.mission.started) return false;
  const target = missionTarget(G);
  if (!target) return false;
  const p = G.player;
  if (dist2(p.x, p.z, target.x, target.z) > 14) return false;
  if (step.type === 'collect') {
    G.mission.packageHeld = true;
    G.audio.sfx('pickup');
    G.notice = step.id === 'bay-heist' ? 'Vault cash secured.' : 'Package secured.';
    if (step.spot === 'bank') addCrime(G, 'heist');
    G.noticeT = 2;
    advanceStep(G);
    return true;
  }
  if (step.type === 'deliver') {
    if (step.spot === 'marina' || step.spot === 'neonRow' || step.spot === 'plaza') {
      // Midnight Run drops need no package.
    } else if (!G.mission.packageHeld) return false;
    G.mission.packageHeld = false;
    G.audio.sfx('cash');
    advanceStep(G);
    return true;
  }
  return false;
}

function advanceStep(G) {
  const m = currentMission(G);
  if (!m) return;
  G.mission.step++;
  G.mission.rivalsSpawned = false;
  G.mission.killsAtStepStart = G.stats.kills;
  if (G.mission.step >= m.steps.length) {
    completeMission(G, m);
  } else {
    const step = currentStep(G);
    if (step) {
      G.notice = 'Objective: ' + step.text;
      G.noticeT = 3;
    }
    refreshBeacon(G);
  }
}

function completeMission(G, m) {
  G.money += m.reward;
  G.missionsDone++;
  const spot = SPOTS[currentStep(G)?.spot || 'plaza'];
  if (spot) addDistrictStanding(G, spot.district, 12);
  G.audio.sfx('mission');
  G.notice = 'Mission complete: ' + m.title + '  +' + fmtMoney(m.reward);
  G.noticeT = 4;
  G.mission.completeT = G.time;
  showDialogue(G, [
    m.title + ' complete.',
    'Marla: ' + fmtMoney(m.reward) + ' is yours. ' +
      (G.mission.index + 1 < MISSIONS.length
        ? 'One more job when you are ready.'
        : 'The bay is yours, Rae.'),
  ]);
  if (G.mission.beacon) {
    G.scene.remove(G.mission.beacon);
    G.mission.beacon = null;
  }
  if (G.mission.index + 1 < MISSIONS.length) {
    G.mission.index++;
    G.mission.step = 0;
    G.mission.started = false;
    G.mission.rivalsSpawned = false;
  } else {
    G.mission.done = true;
    G.screen = 'complete';
    G.hud.showComplete();
  }
  G.save.saveGame(G);
}

/** Per-frame mission logic. */
export function updateMissions(G, dt) {
  const M = G.mission;
  if (M.done || !M.started) return;
  const step = currentStep(G);
  if (!step) return;
  const p = G.player;

  switch (step.type) {
    case 'steal': {
      if (p.car) advanceStep(G);
      break;
    }
    case 'goto': {
      const t = SPOTS[step.spot];
      if (dist2(p.x, p.z, t.x, t.z) < 14) advanceStep(G);
      break;
    }
    case 'collect':
    case 'deliver': {
      // Waits for missionInteract (E).
      break;
    }
    case 'eliminate': {
      const t = SPOTS[step.spot];
      if (!M.rivalsSpawned && dist2(p.x, p.z, t.x, t.z) < 60) {
        M.rivalsSpawned = true;
        const n = step.count;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const isBoss = step.boss && i === 0;
          const e = spawnEnemy(G.scene, isBoss ? 'boss' : 'viper',
            t.x + Math.cos(a) * 12, t.z + Math.sin(a) * 12,
            { health: isBoss ? 220 : 60 });
          G.combat.enemies.push(e);
          G.combat.registerHitMesh(e);
        }
        G.notice = step.boss ? 'The Viper boss is here — take them down!' : 'Vipers ahead — take them down!';
        G.noticeT = 3;
      }
      if (M.rivalsSpawned) {
        const killed = G.stats.kills - M.killsAtStepStart;
        if (killed >= step.count && G.combat.enemies.filter((e) => !e.dead).length === 0) {
          advanceStep(G);
        }
      }
      break;
    }
    case 'escape': {
      if (G.police.level === 0) advanceStep(G);
      break;
    }
    case 'chase': {
      const t = SPOTS[step.spot];
      if (dist2(p.x, p.z, t.x, t.z) < 16) {
        clearWanted(G);
        advanceStep(G);
      }
      break;
    }
    case 'race': {
      if (!G.race.active) {
        // When the mission race finishes, advance this step.
        G.race.onFinish = () => {
          const s = currentStep(G);
          if (s && s.type === 'race') advanceStep(G);
        };
        startRace(G, step.race);
      }
      break;
    }
    default:
      break;
  }
}



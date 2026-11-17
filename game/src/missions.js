// missions.js — the story: a 5-mission chain for Rae Solano, a driver
// new to Solmar City who falls in with fixer Marla Voss. Each mission
// is a list of objectives (go to, pick up, deliver, survive, eliminate)
// with dialogue, a map marker and a cash reward.
import { dist, fmtMoney } from './util.js';
import { spawnRivals } from './combat.js';
import { addWanted } from './player.js';
import { clearWanted } from './police.js';

// Mission target spots, chosen on the road grid (world pixels).
export const SPOTS = {
  plaza: { x: 560, y: 1180, label: 'Solmar Plaza' },
  marina: { x: 1520, y: 980, label: 'Marina Docks' },
  neonRow: { x: 1520, y: 260, label: 'Neon Row' },
  harbor: { x: 2720, y: 260, label: 'Old Harbor' },
  tower: { x: 720, y: 980, label: 'Solmar Tower' },
  flats: { x: 2720, y: 1700, label: 'Cactus Flats' },
  bayview: { x: 1920, y: 2060, label: 'Bayview Arena' },
  beach: { x: 1100, y: 2280, label: 'South Beach' },
};

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Marla Voss',
    briefing: [
      'Marla: Rae. You want work in this city, you need wheels.',
      'Marla: Borrow a car. Any car. Then meet me at Solmar Plaza.',
    ],
    reward: 150,
    steps: [
      { type: 'steal', text: 'Get a car (walk to one, press E)' },
      { type: 'goto', spot: 'plaza', text: 'Drive to Solmar Plaza' },
    ],
  },
  {
    id: 'the-pickup',
    title: 'The Pickup',
    giver: 'Marla Voss',
    briefing: [
      'Marla: A package is waiting at the Marina Docks.',
      'Marla: Pick it up, bring it to Old Harbor. No cops, no fuss.',
    ],
    reward: 300,
    steps: [
      { type: 'goto', spot: 'marina', text: 'Go to the Marina Docks' },
      { type: 'collect', spot: 'marina', text: 'Pick up the package (press E)' },
      { type: 'goto', spot: 'harbor', text: 'Deliver to Old Harbor' },
      { type: 'deliver', spot: 'harbor', text: 'Hand over the package (press E)' },
    ],
  },
  {
    id: 'heat-on-neon-row',
    title: 'Heat on Neon Row',
    giver: 'Marla Voss',
    briefing: [
      'Marla: The Vipers are muscling in on Neon Row. Three of them.',
      'Marla: Send them a message. Then lose the heat before you come back.',
    ],
    reward: 500,
    steps: [
      { type: 'goto', spot: 'neonRow', text: 'Reach Neon Row' },
      { type: 'eliminate', spot: 'neonRow', count: 3, text: 'Deal with 3 Vipers' },
      { type: 'escape', text: 'Lose the wanted level' },
    ],
  },
  {
    id: 'the-getaway',
    title: 'The Getaway',
    giver: 'Dante Cole',
    briefing: [
      'Dante: The cops are onto the drop. I need a driver, now.',
      'Dante: Take the package to Bayview Arena — and they WILL chase you.',
    ],
    reward: 750,
    steps: [
      { type: 'goto', spot: 'flats', text: 'Meet Dante at Cactus Flats' },
      { type: 'collect', spot: 'flats', text: 'Grab the package (press E)' },
      { type: 'chase', spot: 'bayview', text: 'Outrun the police to Bayview Arena' },
    ],
  },
  {
    id: 'king-of-the-bay',
    title: 'King of the Bay',
    giver: 'Marla Voss',
    briefing: [
      'Marla: One last job, Rae. The Vipers\' boss is at Solmar Tower.',
      'Marla: Finish it, and the bay is yours. Then meet me at South Beach.',
    ],
    reward: 1500,
    steps: [
      { type: 'goto', spot: 'tower', text: 'Reach Solmar Tower' },
      { type: 'eliminate', spot: 'tower', count: 4, text: 'Take down 4 Vipers' },
      { type: 'goto', spot: 'beach', text: 'Meet Marla at South Beach' },
    ],
  },
];

export function createMissionState() {
  return {
    index: 0,
    step: 0,
    started: false,
    done: false,
    rivalsSpawned: false,
    killsAtStepStart: 0,
    packageHeld: false,
    dialogue: null, // {lines, i, t}
    completeT: 0,
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
  if (!step || !step.spot) return null;
  return SPOTS[step.spot];
}

/** Open a mission: show its briefing dialogue and mark it started. */
export function startMission(G, index) {
  const m = MISSIONS[index];
  if (!m) return;
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
}

export function showDialogue(G, lines) {
  G.mission.dialogue = { lines, i: 0, t: 0 };
}

export function advanceDialogue(G) {
  const d = G.mission.dialogue;
  if (!d) return;
  d.i++;
  if (d.i >= d.lines.length) G.mission.dialogue = null;
}

/**
 * Called when the player presses E: handles mission interactions
 * (pickup / deliver). Entering cars is handled by player.js.
 */
export function missionInteract(G) {
  const step = currentStep(G);
  if (!step || !G.mission.started) return false;
  const target = missionTarget(G);
  if (!target) return false;
  if (dist(G.player.x, G.player.y, target.x, target.y) > 90) return false;
  if (step.type === 'collect') {
    G.mission.packageHeld = true;
    G.audio.sfx('pickup');
    G.notice = 'Package secured.';
    G.noticeT = 2;
    advanceStep(G);
    return true;
  }
  if (step.type === 'deliver') {
    if (!G.mission.packageHeld) return false;
    G.mission.packageHeld = false;
    G.audio.sfx('cash');
    advanceStep(G);
    return true;
  }
  return false;
}

/** Move to the next objective, or finish the mission with its reward. */
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
  }
}

function completeMission(G, m) {
  G.money += m.reward;
  G.missionsDone++;
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
  if (G.mission.index + 1 < MISSIONS.length) {
    G.mission.index++;
    G.mission.step = 0;
    G.mission.started = false;
    G.mission.rivalsSpawned = false;
  } else {
    G.mission.done = true;
    G.screen = 'complete';
  }
}

/** Per-frame mission logic: watch the current step's condition. */
export function updateMissions(G, dt) {
  void dt;
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
      if (dist(p.x, p.y, t.x, t.y) < 90) advanceStep(G);
      break;
    }
    case 'collect':
    case 'deliver': {
      // Waits for missionInteract (E). The HUD hints when close.
      break;
    }
    case 'eliminate': {
      const t = SPOTS[step.spot];
      if (!M.rivalsSpawned && dist(p.x, p.y, t.x, t.y) < 420) {
        M.rivalsSpawned = true;
        spawnRivals(G, t.x, t.y, step.count, { health: 50 });
        G.notice = 'Vipers ahead — take them down!';
        G.noticeT = 3;
      }
      if (M.rivalsSpawned) {
        const killed = G.stats.kills - M.killsAtStepStart;
        if (killed >= step.count && G.combat.enemies.length === 0) advanceStep(G);
      }
      break;
    }
    case 'escape': {
      if (G.wanted === 0) advanceStep(G);
      break;
    }
    case 'chase': {
      const t = SPOTS[step.spot];
      if (dist(p.x, p.y, t.x, t.y) < 100) {
        clearWanted(G);
        advanceStep(G);
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Draw the pulsing objective marker in the world. The screen-edge
 * arrow and minimap dot live in hud.js.
 */
export function drawMissionMarker(ctx, G) {
  const step = currentStep(G);
  if (!step || !G.mission.started || G.screen !== 'play') return;
  const t = missionTarget(G);
  if (!t) return;
  const pulse = 1 + Math.sin(G.time * 4) * 0.12;
  ctx.save();
  ctx.strokeStyle = '#ffd25f';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(t.x, t.y, 44 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,210,95,0.25)';
  ctx.beginPath();
  ctx.arc(t.x, t.y, 44 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd25f';
  ctx.beginPath();
  ctx.moveTo(t.x, t.y - 58);
  ctx.lineTo(t.x - 12, t.y - 34);
  ctx.lineTo(t.x + 12, t.y - 34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// shots.js — deterministic staged scenes for screenshots, driven by
// ?shot=<name>&seed=1. Each scene sets up the world, the player,
// traffic, police and a mission state so the render is identical on
// every run. Scenes: start, city, chase, mission.
import { makeRng } from './util.js';
import { createCar } from './vehicles.js';
import { spawnRivals } from './combat.js';
import { startMission } from './missions.js';
import { addWanted } from './player.js';

export const SHOT_NAMES = ['start', 'city', 'chase', 'mission'];

export function applyShot(G, name, seed) {
  const rng = makeRng((seed * 31 + name.length * 977) >>> 0);
  G.shot = name;
  G.screen = 'play';
  G.time = 42; // mid-session light, HUD populated

  if (name === 'start') {
    G.screen = 'start';
    G.shotReady = true;
    return;
  }

  if (name === 'city') {
    // Rae driving a red sportscar down Neon Row, traffic all around.
    const car = createCar(1520, 620, { driver: 'player', color: '#d84040' });
    car.type = 'sport';
    car.angle = Math.PI / 2;
    car.speed = 210;
    G.cars.push(car);
    G.player.car = car;
    G.player.onFoot = false;
    G.player.x = car.x;
    G.player.y = car.y;
    G.player.angle = car.angle;
    G.money = 1240;
    G.mission.started = true;
    G.mission.index = 0;
    G.mission.step = 1;
    G.notice = 'Drive to Solmar Plaza';
    G.noticeT = 99;
    positionTrafficNear(G, rng, 1520, 620, 8);
    G.shotReady = true;
    return;
  }

  if (name === 'chase') {
    // The money shot: wanted 3, three cruisers closing in, mission live.
    const car = createCar(1120, 980, { driver: 'player', color: '#e8b93a' });
    car.type = 'sport';
    car.angle = 0;
    car.speed = 300;
    G.cars.push(car);
    G.player.car = car;
    G.player.onFoot = false;
    G.player.x = car.x;
    G.player.y = car.y;
    G.player.angle = car.angle;
    G.money = 2890;
    G.missionsDone = 2;
    addWanted(G, 3, 'police chase');
    G.police.heatT = 0;
    // Three cruisers in pursuit — close enough to stay inside the
    // camera frame: two trailing the getaway on the same road, one
    // cutting down the avenue from the north.
    const spots = [
      { x: 820, y: 980, a: 0 },
      { x: 760, y: 1044, a: 0 },
      { x: 1120, y: 660, a: Math.PI / 2 },
    ];
    for (const s of spots) {
      const pc = createCar(s.x, s.y, { police: true, driver: 'police', color: '#101418' });
      pc.type = 'sedan';
      pc.angle = s.a;
      pc.speed = 260;
      pc.accel = 520;
      pc.top = 400;
      G.police.cars.push(pc);
    }
    startMission(G, 3);
    G.mission.step = 2;
    G.mission.started = true;
    G.mission.dialogue = null;
    G.notice = 'Outrun the police to Bayview Arena';
    G.noticeT = 99;
    positionTrafficNear(G, rng, 1120, 980, 6);
    G.shotReady = true;
    return;
  }

  if (name === 'mission') {
    // Mission 3 in progress: Rae on foot at Neon Row, Vipers shooting.
    G.player.x = 1520;
    G.player.y = 340;
    G.player.angle = Math.PI / 2;
    G.player.onFoot = true;
    G.player.car = null;
    G.money = 1750;
    G.missionsDone = 1;
    G.ammo = 9;
    startMission(G, 2);
    G.mission.step = 1;
    G.mission.rivalsSpawned = true;
    G.mission.killsAtStepStart = G.stats.kills;
    G.mission.dialogue = null;
    spawnRivals(G, 1520, 260, 3, { health: 50 });
    // A shot already in the air for the action read.
    G.combat.bullets.push({
      x: 1520, y: 380, vx: 0, vy: -780, life: 0.5, from: 'player', dmg: 26,
    });
    G.combat.muzzleT = 0.07;
    addWanted(G, 2, 'shootout on Neon Row');
    G.police.heatT = 0;
    positionTrafficNear(G, rng, 1520, 340, 4);
    G.notice = 'Deal with 3 Vipers';
    G.noticeT = 99;
    G.shotReady = true;
    return;
  }

  // Unknown shot name: fall back to plain play.
  G.shotReady = true;
}

/**
 * Nudge a few traffic cars and pedestrians close to the camera focus
 * so the scene reads as a living street.
 */
function positionTrafficNear(G, rng, cx, cy, count) {
  let placed = 0;
  for (const car of G.trafficCars) {
    if (placed >= count) break;
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(180, 620);
    car.x = cx + Math.cos(a) * r;
    car.y = cy + Math.sin(a) * r;
    placed++;
  }
  let peds = 0;
  for (const ped of G.peds) {
    if (peds >= 8) break;
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(120, 420);
    ped.x = cx + Math.cos(a) * r;
    ped.y = cy + Math.sin(a) * r;
    peds++;
  }
}

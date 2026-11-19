// shots.js — deterministic staged scenes for screenshots, driven by
// ?shot=<name>&seed=1. Each scene sets up the world, the player,
// traffic, police and a mission state so the render is identical on
// every run. Scenes: start, city, drive, chase, mission, night, race,
// garage. After setup the scene renders for a few frames;
// window.__shotReady is set so the screenshot tool knows the frame
// is settled. Shot cars always sit ON road lines (x/z in
// [-252,-180,-108,-36,36,108,180,252]) so they never clip buildings.
import { makeRng } from './util.js';
import { createCar } from './vehicles.js';
import { spawnEnemy } from './combat.js';
import { startMission } from './missions.js';
import { startRace } from './streetRaces.js';
import { addCrime } from './police.js';
import { spawnPoliceHelicopter } from './policeHelicopter.js';

export const SHOT_NAMES = ['start', 'city', 'drive', 'chase', 'mission', 'night', 'race', 'garage'];

export function applyShot(G, name, seed) {
  const rng = makeRng((seed * 31 + name.length * 977) >>> 0);
  G.shot = name;
  G.screen = 'play';
  G.timeOfDay = 18.75; // golden hour by default (purple-pink dusk)
  G.time = 42;

  if (name === 'start') {
    G.screen = 'start';
    G.timeOfDay = 19.2; // dusk behind the title
    markReady(G);
    return;
  }

  if (name === 'city' || name === 'drive') {
    // Rae driving a red Comet GT north up Neon Row, traffic all around.
    const car = createCar('sport', { color: 0xd84040, driver: 'player' });
    car.x = 216;
    car.z = -144;
    car.heading = -Math.PI / 2; // heading north up Neon Row
    car.speed = 22;
    G.scene.add(car.group);
    G.cars.push(car);
    G.player.car = car;
    G.player.x = car.x;
    G.player.z = car.z;
    G.player.heading = car.heading;
    G.camera.yaw = -Math.PI / 2; // behind the car, looking north up Neon Row
    G.camera.pitch = 0.32;
    G.shotDrive = true; // keep the car rolling for the shot
    G.money = 1240;
    G.mission.started = true;
    G.mission.index = 0;
    G.mission.step = 1;
    G.notice = 'Drive to Solmar Plaza';
    G.noticeT = 99;
    positionTrafficNear(G, rng, 216, -144, 8);
    markReady(G);
    return;
  }

  if (name === 'chase') {
    // COVER: wanted 3, helicopter overhead-ahead, 2 cruisers in the lane
    // ahead, golden hour. Player on road z=36 heading east.
    const car = createCar('sport', { color: 0xd84040, driver: 'player' });
    car.x = 36;
    car.z = 36;
    car.heading = 0;
    car.speed = 30;
    G.scene.add(car.group);
    G.cars.push(car);
    G.player.car = car;
    G.player.x = car.x;
    G.player.z = car.z;
    G.player.heading = car.heading;
    G.camera.yaw = 0; // behind the car, looking east down the avenue
    G.camera.pitch = 0.15; // flatter, so the helicopter stays in frame
    G.shotDrive = true;
    G.money = 2890;
    G.missionsDone = 2;
    addCrime(G, 'chase');
    addCrime(G, 'chase');
    G.police.heat = 50; // 3 stars
    G.police.level = 3;
    G.police.knows = { face: true, clothing: true, vehicle: true };
    // Helicopter ahead of the player, high enough to read in the sky.
    const heli = spawnPoliceHelicopter(G);
    heli.angle = 0; // directly ahead (east)
    heli.orbitR = 85;
    heli.orbitY = 22;
    // Two cruisers in the lane ahead, closing slowly.
    for (const cx of [80, 120]) {
      const pc = createCar('sedan', { police: true, driver: 'police' });
      pc.x = cx;
      pc.z = 36;
      pc.heading = 0;
      pc.speed = 28;
      G.scene.add(pc.group);
      G.police.cruisers.push(pc);
    }
    startMission(G, 3);
    G.mission.step = 2;
    G.mission.started = true;
    G.mission.dialogue = null;
    G.notice = 'Outrun the police to Bayview Arena';
    G.noticeT = 99;
    positionTrafficNear(G, rng, 36, 36, 6);
    markReady(G);
    return;
  }

  if (name === 'mission') {
    // Shootout on foot with the weapon wheel open: Rae at Neon Row,
    // 3 Vipers 16-20m ahead on the same road, 2 stars.
    G.player.x = 216;
    G.player.z = -180;
    G.player.heading = -Math.PI / 2;
    G.player.car = null;
    G.camera.yaw = -Math.PI / 2; // behind Rae, looking north at the Vipers
    G.camera.pitch = 0.28;
    G.money = 1750;
    G.missionsDone = 1;
    G.weapons.pistol.mag = 9;
    startMission(G, 2);
    G.mission.step = 1;
    G.mission.rivalsSpawned = true;
    G.mission.killsAtStepStart = G.stats.kills;
    G.mission.dialogue = null;
    for (const [ex, ez] of [[212, -196], [216, -200], [220, -196]]) {
      const e = spawnEnemy(G.scene, 'viper', ex, ez, { health: 60 });
      G.combat.enemies.push(e);
      G.combat.registerHitMesh(e);
    }
    addCrime(G, 'gunfire');
    addCrime(G, 'gunfire');
    G.police.heat = 30;
    G.police.level = 2;
    G.police.knows = { face: true, clothing: true, vehicle: false };
    G.notice = 'Deal with 3 Vipers';
    G.noticeT = 99;
    G.hud.showWheel(); // radial weapon wheel open in the shot
    G.wheelOpen = true;
    positionTrafficNear(G, rng, 216, -180, 4);
    markReady(G);
    return;
  }

  if (name === 'night') {
    // Night on Neon Row: neon signs, lit windows, Rae + Juno on foot.
    G.timeOfDay = 22.5;
    G.player.x = 180;
    G.player.z = -180;
    G.player.heading = -Math.PI / 2;
    G.player.car = null;
    G.camera.yaw = -Math.PI / 2; // behind the pair, looking north up Neon Row
    G.camera.pitch = 0.3;
    G.money = 3210;
    G.missionsDone = 4;
    // Juno standing beside Rae as companion.
    G.companion.visible = true;
    G.companion.x = 176;
    G.companion.z = -176;
    startMission(G, 4);
    G.mission.step = 0;
    G.mission.started = true;
    G.mission.dialogue = null;
    G.notice = 'Bay Heist — reach Solmar Bank';
    G.noticeT = 99;
    positionTrafficNear(G, rng, 180, -180, 5);
    markReady(G);
    return;
  }

  if (name === 'race') {
    // Street race: Neon Sprint start, race running, golden-hour vista
    // down the avenue. Player on road x=252 heading north.
    const car = createCar('sport', { color: 0xd84040, driver: 'player' });
    car.x = 252;
    car.z = -72;
    car.heading = -Math.PI / 2;
    car.speed = 30;
    G.scene.add(car.group);
    G.cars.push(car);
    G.player.car = car;
    G.player.x = car.x;
    G.player.z = car.z;
    G.player.heading = car.heading;
    G.camera.yaw = -Math.PI / 2;
    G.camera.pitch = 0.3;
    G.shotDrive = true;
    G.money = 2400;
    G.missionsDone = 3;
    G.race.onFinish = null;
    // Start the Neon Sprint (gates + timer + beacon, no mission).
    startRace(G, 'neon');
    G.notice = 'Neon Sprint — hit every gate!';
    G.noticeT = 99;
    positionTrafficNear(G, rng, 252, -72, 6);
    markReady(G);
    return;
  }

  if (name === 'garage') {
    // Gun shop walk-in UI over the 3D city: Ironworks Arms locker with
    // stat bars, prices and attachments, golden hour behind the menu.
    G.player.x = 132;
    G.player.z = -132;
    G.player.heading = -Math.PI / 4;
    G.player.car = null;
    G.camera.yaw = -Math.PI / 4;
    G.camera.pitch = 0.3;
    G.money = 3200;
    G.missionsDone = 2;
    G.weapons.smg.owned = true;
    G.weapons.smg.mag = 30;
    G.weapons.smg.reserve = 60;
    G.weapons.shotgun.owned = true;
    G.weapons.shotgun.mag = 6;
    G.weapons.shotgun.reserve = 12;
    G.weapon.current = 'smg';
    G.hud.openMenu('guns', 'Ironworks Arms — weapon locker');
    positionTrafficNear(G, rng, 144, -144, 4);
    markReady(G);
    return;
  }

  // Unknown shot name: plain play.
  markReady(G);
}

function markReady(G) {
  G.shotReady = true;
  window.__shotReady = true;
  document.title = 'shot:' + (G.shot || 'play') + ':ready';
}

/** Nudge traffic cars and pedestrians close to the camera focus, and
 *  move parked cars off the shot's driving line so the car never clips
 *  one mid-shot. */
function positionTrafficNear(G, rng, cx, cz, count) {
  let placed = 0;
  for (const car of G.trafficCars) {
    if (placed >= count) break;
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(20, 70);
    car.x = cx + Math.cos(a) * r;
    car.z = cz + Math.sin(a) * r;
    car.x = Math.max(-290, Math.min(290, car.x));
    car.z = Math.max(-290, Math.min(290, car.z));
    placed++;
  }
  for (const car of G.parkedCars) {
    const dx = car.x - cx;
    const dz = car.z - cz;
    if (dx * dx + dz * dz < 80 * 80) {
      // Relocate far from the focus, on a road line.
      const roads = [-252, -180, -108, -36, 36, 108, 180, 252];
      for (let tries = 0; tries < 5; tries++) {
        const vertical = rng.chance(0.5);
        const road = roads[rng.int(0, roads.length - 1)];
        const along = roads[rng.int(0, roads.length - 1)];
        const nx = vertical ? road + 4.5 : along;
        const nz = vertical ? along : road + 4.5;
        const ddx = nx - cx;
        const ddz = nz - cz;
        if (ddx * ddx + ddz * ddz > 120 * 120) {
          car.x = nx;
          car.z = nz;
          break;
        }
      }
    }
  }
  let peds = 0;
  for (const ped of G.peds) {
    if (peds >= 8) break;
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(12, 45);
    ped.x = cx + Math.cos(a) * r;
    ped.z = cz + Math.sin(a) * r;
    peds++;
  }
}

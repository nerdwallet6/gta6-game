// police.js — the 6-star wanted system for Solmar Nights 3D (v4).
//
// Stars rise with crimes. Cruisers chase and ram, foot cops pursue on
// foot, a helicopter joins at 3 stars, roadblocks with spike strips at
// 4, and SWAT-style pressure at 5-6. The police also KNOW things:
// icons under the stars show whether they know your face, your
// clothing and your vehicle — clear each one (wear a mask, change
// clothes, ditch the car). Out of their line of sight the heat cools
// and the stars fall one by one.
import * as THREE from '../lib/three.module.min.js';
import { createCar, syncCarMesh, damageCar } from './vehicles.js';
import { damagePlayer } from './combat.js';
import { createCop, poseHumanoid } from './character.js';
import { clamp, dist2, makeRng } from './util.js';
import {
  spawnPoliceHelicopter,
  updatePoliceHelicopter,
  removePoliceHelicopter,
} from './policeHelicopter.js';

/** Fresh wanted state: no stars, no heat, nothing known. */
export function createPoliceState() {
  return {
    level: 0, // 0-6 stars
    heat: 0, // 0-100; decays out of sight, stars fall as it drops
    knows: { face: false, clothing: false, vehicle: false },
    cruisers: [], // police cars chasing the player
    footCops: [], // officers on foot
    heli: null, // {group, rotor, x, z, y, angle, fireT} or null
    roadblocks: [], // static police cars parked across the road
    spikeStrips: [], // spike-strip meshes laid at roadblocks
    searchT: 0, // time since any police unit last saw the player
    bustT: 0, // busted progress while a cop stands next to the player
    spawnT: 0, // countdown to the next spawn wave
    sirenT: 0, // countdown to the next distant siren
  };
}

// Heat added by each crime kind. Unknown kinds default to 15.
const CRIME_HEAT = {
  'steal-car': 34,
  gunfire: 22,
  kill: 30,
  'kill-cop': 55,
  assault: 18,
  speeding: 6,
  chase: 40,
  heist: 50,
};

/** Add heat for a crime; the star level follows the heat. */
export function addCrime(G, kind) {
  const P = G.police;
  const heat = CRIME_HEAT[kind] || 15;
  P.heat = clamp(P.heat + heat, 0, 100);
  const level = heatToStars(P.heat);
  if (level > P.level) {
    P.level = level;
    G.notice = 'Wanted level ' + level + '!';
    G.noticeT = 2.5;
    G.audio.sfx('siren');
  }
  // A crime committed in the open teaches the police what you look
  // like. A mask hides the face; the car is only known if you are in one.
  if (kind === 'steal-car' || kind === 'kill' || kind === 'kill-cop') {
    P.knows.face = !G.player.masked;
    P.knows.clothing = true;
    if (G.player.car) P.knows.vehicle = true;
  }
  if (kind === 'steal-car' && G.player.car) P.knows.vehicle = true;
}

/** Star level for a heat value. */
export function heatToStars(heat) {
  if (heat < 12) return 0;
  if (heat < 26) return 1;
  if (heat < 42) return 2;
  if (heat < 58) return 3;
  if (heat < 74) return 4;
  if (heat < 88) return 5;
  return 6;
}

/** Clear the whole wanted level (mission reward, safehouse, escape). */
export function clearWanted(G) {
  const P = G.police;
  P.level = 0;
  P.heat = 0;
  P.knows = { face: false, clothing: false, vehicle: false };
  despawnPolice(G);
}

/** Remove every police unit from the scene and empty the lists. */
export function despawnPolice(G) {
  const P = G.police;
  for (const c of P.cruisers) G.scene.remove(c.group);
  for (const c of P.roadblocks) G.scene.remove(c.group);
  for (const s of P.spikeStrips) G.scene.remove(s);
  for (const c of P.footCops) G.scene.remove(c.humanoid.group);
  removePoliceHelicopter(G);
  P.cruisers = [];
  P.footCops = [];
  P.roadblocks = [];
  P.spikeStrips = [];
}

/** Spawn one cruiser near the player, on a road, already moving. */
function spawnCruiser(G) {
  const P = G.police;
  const p = G.player;
  const a = Math.random() * Math.PI * 2;
  const car = createCar('sedan', { police: true, driver: 'police' });
  car.x = clamp(p.x + Math.cos(a) * 90, -290, 290);
  car.z = clamp(p.z + Math.sin(a) * 90, -290, 290);
  car.speed = 20;
  G.scene.add(car.group);
  P.cruisers.push(car);
  return car;
}

/** Spawn a foot cop near the player. */
function spawnFootCop(G) {
  const P = G.police;
  const p = G.player;
  const a = Math.random() * Math.PI * 2;
  const h = createCop();
  const cop = {
    humanoid: h,
    x: clamp(p.x + Math.cos(a) * 26, -290, 290),
    z: clamp(p.z + Math.sin(a) * 26, -290, 290),
    phase: Math.random() * 6,
    shootT: 2,
  };
  h.group.position.set(cop.x, 0, cop.z);
  G.scene.add(h.group);
  P.footCops.push(cop);
  return cop;
}

/**
 * Set a roadblock: two cruisers parked across the road ahead of the
 * player, with a spike strip laid between them.
 */
function spawnRoadblock(G) {
  const P = G.police;
  const p = G.player;
  const heading = p.car ? p.car.heading : p.heading;
  const bx = p.x + Math.cos(heading) * 60;
  const bz = p.z + Math.sin(heading) * 60;
  for (const off of [-4, 4]) {
    const car = createCar('sedan', { police: true, driver: 'police' });
    car.x = clamp(bx - Math.sin(heading) * off, -290, 290);
    car.z = clamp(bz + Math.cos(heading) * off, -290, 290);
    car.heading = heading + Math.PI / 2;
    car.speed = 0;
    G.scene.add(car.group);
    P.roadblocks.push(car);
  }
  // The spike strip across the road between the cruisers.
  const strip = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.12, 1.1),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  );
  base.position.y = 0.06;
  strip.add(base);
  const spikeMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc2 });
  for (let i = -4; i <= 4; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 4), spikeMat);
    spike.position.set(i, 0.3, 0);
    strip.add(spike);
  }
  strip.position.set(bx, 0, bz);
  strip.rotation.y = -heading - Math.PI / 2;
  G.scene.add(strip);
  P.spikeStrips.push(strip);
  G.notice = 'Roadblock ahead — spike strip!';
  G.noticeT = 2.5;
}

/**
 * Does any police unit currently see the player? Range is a fair
 * proxy for line of sight in this open city. The helicopter, once
 * up, always has eyes on you.
 */
export function policeCanSee(G) {
  const P = G.police;
  const p = G.player;
  const seeRange = 55 + P.level * 8;
  for (const c of P.cruisers) {
    if (dist2(c.x, c.z, p.x, p.z) < seeRange) return true;
  }
  for (const c of P.footCops) {
    if (dist2(c.x, c.z, p.x, p.z) < 40) return true;
  }
  if (P.heli) return true;
  return P.level > 0 && Math.random() < 0.02;
}

/** Per-frame wanted and police update. */
export function updatePolice(G, dt) {
  const P = G.police;
  const p = G.player;
  if (P.level === 0 && P.heat <= 0) {
    // Nothing wanted and no heat left: clear any stray units.
    if (P.cruisers.length || P.footCops.length || P.heli || P.roadblocks.length) {
      despawnPolice(G);
    }
    return;
  }

  // Heat: it cools when unseen and rises slightly while seen at
  // high stars. Cooling is faster once the search has gone cold.
  const seen = policeCanSee(G);
  if (seen) {
    P.searchT = 0;
    P.heat = clamp(P.heat + dt * 1.2, 0, 100);
  } else {
    P.searchT += dt;
    const coolRate = P.searchT > 6 ? 5 : 1.5;
    P.heat = clamp(P.heat - dt * coolRate, 0, 100);
  }
  const newLevel = heatToStars(P.heat);
  if (newLevel !== P.level) {
    P.level = newLevel;
    if (newLevel === 0) {
      G.notice = 'You lost them. The heat is off.';
      G.noticeT = 3;
      despawnPolice(G);
      return;
    }
  }

  // Distant siren ambience while wanted.
  P.sirenT -= dt;
  if (P.sirenT <= 0) {
    P.sirenT = 2.2;
    G.audio.sfx('sirenFar');
  }

  // Spawning: keep the pressure proportional to the stars.
  P.spawnT -= dt;
  const wantCruisers = Math.min(1 + Math.floor(P.level / 2), 4);
  if (P.spawnT <= 0) {
    P.spawnT = 3.5;
    if (P.cruisers.length < wantCruisers) spawnCruiser(G);
    if (P.level <= 2 && P.footCops.length < P.level + 1) spawnFootCop(G);
    if (P.level >= 3 && !P.heli) spawnPoliceHelicopter(G);
    if (P.level >= 3 && P.roadblocks.length === 0 && !G.shot && Math.random() < 0.6) {
      spawnRoadblock(G);
    }
    if (P.level >= 5 && P.cruisers.length < 4) spawnCruiser(G);
  }

  // Cruisers chase and ram.
  for (const c of P.cruisers) {
    const d = dist2(c.x, c.z, p.x, p.z);
    const wantHeading = Math.atan2(p.z - c.z, p.x - c.x);
    const turn = clamp(
      ((wantHeading - c.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
      -dt * 2.2,
      dt * 2.2,
    );
    c.heading += turn;
    const target = d > 12 ? 30 + P.level * 2 : 18;
    c.speed += (target - c.speed) * Math.min(1, dt * 1.2);
    c.x += Math.cos(c.heading) * c.speed * dt;
    c.z += Math.sin(c.heading) * c.speed * dt;
    // Ram: damage the player's car, or the player on foot.
    if (d < 5) {
      if (p.car) {
        const broke = damageCar(p.car, 12 * dt);
        if (broke) G.notice = 'Your car is wrecked!';
      } else {
        damagePlayer(G, 10 * dt);
      }
      c.speed *= 0.6;
    }
    syncCarMesh(c);
  }

  // Roadblock cars sit still (but still render and flash).
  for (const c of P.roadblocks) syncCarMesh(c);

  // Foot cops: chase on foot. A slow cop standing next to the player
  // on foot busts them.
  for (let i = P.footCops.length - 1; i >= 0; i--) {
    const cop = P.footCops[i];
    const d = dist2(cop.x, cop.z, p.x, p.z);
    const h = cop.humanoid;
    if (d > 60) {
      // Too far to matter: remove them.
      G.scene.remove(h.group);
      P.footCops.splice(i, 1);
      continue;
    }
    const wantHeading = Math.atan2(p.z - cop.z, p.x - cop.x);
    cop.phase += dt * 9;
    cop.x += Math.cos(wantHeading) * 4.2 * dt;
    cop.z += Math.sin(wantHeading) * 4.2 * dt;
    h.group.position.set(cop.x, 0, cop.z);
    h.group.rotation.y = -wantHeading;
    poseHumanoid(h, cop.phase, 0.8, false, false);
    if (d < 2.2 && !p.car) {
      const playerSpeed = Math.hypot(p.vx || 0, p.vz || 0);
      if (playerSpeed < 3) {
        P.bustT += dt;
        G.hud.setBustProgress(P.bustT / 2);
        if (P.bustT > 2) {
          busted(G);
          return;
        }
      }
    } else {
      P.bustT = Math.max(0, P.bustT - dt);
      G.hud.setBustProgress(0);
    }
  }

  // Helicopter: circles above the player with a spotlight, and fires
  // from 4 stars up.
  updatePoliceHelicopter(G, dt);
}

/**
 * Busted: lose 10% of your cash, respawn at PD HQ with the wanted
 * level cleared and at least half health.
 */
export function busted(G) {
  const lost = Math.floor(G.money * 0.1);
  G.money -= lost;
  G.police.bustT = 0;
  clearWanted(G);
  const hq = G.data.SPOTS.policeHq;
  G.player.x = hq.x;
  G.player.z = hq.z;
  G.player.health = Math.max(G.player.health, 50);
  if (G.player.car) {
    G.player.car.driver = 'parked';
    G.player.car = null;
  }
  G.screen = 'busted';
  G.audio.sfx('busted');
  G.hud.showEndScreen('busted', lost);
}

/**
 * Wasted: lose 10% of your cash, respawn at the hospital with full
 * health and no armor.
 */
export function wasted(G) {
  const lost = Math.floor(G.money * 0.1);
  G.money -= lost;
  clearWanted(G);
  const h = G.data.SPOTS.hospital;
  G.player.x = h.x;
  G.player.z = h.z;
  G.player.health = 100;
  G.player.armor = 0;
  if (G.player.car) {
    G.player.car.driver = 'parked';
    G.player.car = null;
  }
  G.player.dead = false;
  G.screen = 'wasted';
  G.audio.sfx('wasted');
  G.hud.showEndScreen('wasted', lost);
}

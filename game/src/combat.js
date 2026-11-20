// combat.js — third-person shooting for Solmar Nights 3D (v4).
//
// Hitscan weapons resolved with a raycaster: the player's shot leaves
// the muzzle toward the crosshair aim point and tests enemy hit
// spheres, cars and buildings. Weapon state tracks what is owned, the
// magazine and the reserve. Enemies (Vipers, foot cops and the boss)
// chase and shoot with simple AI. Tracers, the muzzle flash and
// pickups (cash / health / armor) live here too.
import * as THREE from '../lib/three.module.min.js';
import { WEAPONS, WEAPON_ORDER } from './data.js';
import { createViper, createCop, poseHumanoid } from './character.js';
import { angleDelta, clamp, dist2 } from './util.js';

// Running id counter so every enemy gets a unique handle.
let nextEnemyId = 0;

/**
 * Fresh weapon state. The pistol starts owned with a full magazine
 * and a 48-round reserve; every other weapon is locked until bought,
 * with an empty reserve.
 */
export function createWeaponState() {
  const state = {};
  for (const id of WEAPON_ORDER) {
    const spec = WEAPONS[id];
    state[id] = {
      owned: id === 'pistol',
      mag: spec.mag,
      magMax: spec.mag,
      reserve: id === 'pistol' ? 48 : 0,
    };
  }
  return state;
}

/**
 * Spawn an enemy and add its meshes to the scene. kind is 'viper',
 * 'cop' or 'boss'. opts may override health and dropCash.
 * Returns the enemy record: {id, kind, humanoid, x, z, y, heading,
 * health, maxHealth, speed, shootT, phase, dead, dropCash, isBoss}.
 */
export function spawnEnemy(scene, kind, x, z, opts = {}) {
  const humanoid = kind === 'cop' ? createCop() : createViper();
  humanoid.group.position.set(x, 0, z);
  scene.add(humanoid.group);
  const boss = kind === 'boss';
  const hp = opts.health || (boss ? 220 : 60);
  const foe = {
    id: 'enemy-' + (nextEnemyId++),
    kind,
    humanoid,
    x,
    z,
    y: 0,
    heading: 0,
    health: hp,
    maxHealth: hp,
    speed: boss ? 3.4 : 3.0,
    shootT: 1 + Math.random() * 2,
    phase: Math.random() * 6,
    dead: false,
    dropCash: opts.dropCash !== undefined ? opts.dropCash : 25,
    isBoss: boss,
  };
  if (boss) {
    // The boss is bigger and wears a gold jacket.
    humanoid.group.scale.setScalar(1.18);
    humanoid.mats.jacketMat.color.setHex(0xd8a020);
  }
  return foe;
}

/** Remove an enemy's meshes from the scene. */
export function removeEnemy(scene, e) {
  scene.remove(e.humanoid.group);
}

/**
 * Fire the player's current weapon from a muzzle origin along an aim
 * direction. G is the game state; origin and dir are Vector3s. The
 * raycaster tests enemy hit spheres first, then falls through to the
 * far point. Returns 'hit' | 'miss' | 'empty' | 'cooldown'.
 */
export function playerShoot(G, origin, dir) {
  const wId = G.weapon.current;
  const held = G.weapons[wId];
  const spec = WEAPONS[wId];
  if (!held.owned) return 'empty';
  if (G.combat.fireT > 0) return 'cooldown';
  if (held.mag <= 0) {
    G.audio.sfx('dryfire');
    G.combat.fireT = 0.25;
    return 'empty';
  }
  held.mag -= 1;
  G.combat.fireT = spec.rate;
  G.combat.muzzleT = 0.06;
  G.audio.sfx('shot', wId);
  G.stats.shotsFired += 1;

  const pellets = spec.pellets || 1;
  let scored = false;
  for (let p = 0; p < pellets; p++) {
    // Each pellet gets its own jitter inside the weapon spread cone.
    const d = dir.clone();
    d.x += (Math.random() - 0.5) * spec.spread * 2;
    d.y += (Math.random() - 0.5) * spec.spread * 2;
    d.z += (Math.random() - 0.5) * spec.spread * 2;
    d.normalize();
    const ray = new THREE.Raycaster(origin, d, 0.5, spec.range);
    // Enemy hit targets are invisible spheres tracked in hitMeshes.
    const hits = ray.intersectObjects(G.combat.hitMeshes, false);
    if (hits.length > 0) {
      const first = hits[0];
      const target = first.object.userData.target;
      if (target) {
        damageEnemy(G, target, spec.dmg);
        scored = true;
        addTracer(G, origin, first.point);
        continue;
      }
    }
    addTracer(G, origin, origin.clone().add(d.multiplyScalar(spec.range)));
  }
  // A shot in the street is a crime if police are near. A suppressor
  // on the current weapon halves the chance they hear it.
  const mods = (G.weaponMods && G.weaponMods[G.weapon.current]) || {};
  const heardChance = mods.suppressor ? 0.25 : 0.5;
  if (G.police.level < 2 && Math.random() < heardChance) {
    G.police.crime('gunfire');
  }
  return scored ? 'hit' : 'miss';
}

/**
 * Apply damage to an enemy. Handles the red flash, death (cash, a
 * possible pickup, stats and the crime it causes).
 */
export function damageEnemy(G, e, dmg) {
  if (e.dead) return;
  e.health -= dmg;
  G.stats.shotsHit += 1;
  // Flash the enemy white briefly, then restore its jacket colour.
  e.humanoid.mats.jacketMat.color.setHex(0xffffff);
  setTimeout(() => {
    if (e.dead) return;
    const jacket = e.kind === 'cop' ? 0x1c2c4c : e.isBoss ? 0xd8a020 : 0xc02020;
    e.humanoid.mats.jacketMat.color.setHex(jacket);
  }, 80);
  if (e.health > 0) return;
  e.dead = true;
  G.stats.kills += 1;
  G.money += e.dropCash;
  G.audio.sfx('cash');
  // A cash pickup sometimes drops where they fell.
  if (Math.random() < 0.5) {
    spawnPickup(G, e.x, e.z, 'cash', 20 + Math.floor(Math.random() * 40));
  }
  if (e.kind === 'cop') G.police.crime('kill-cop');
  else G.police.crime('kill');
  G.notice = 'Target down  +' + '$' + e.dropCash;
  G.noticeT = 2;
}

/** Enemy AI: chase the player, shoot when in range and close enough. */
export function updateEnemy(G, e, dt) {
  if (e.dead) return;
  const p = G.player;
  const d = dist2(e.x, e.z, p.x, p.z);
  const h = e.humanoid;
  // Face the player. Heading is atan2(dz, dx); the mesh is rotated
  // by -heading, so the model faces the right way.
  const wantHeading = Math.atan2(p.z - e.z, p.x - e.x);
  e.heading += clamp(angleDelta(e.heading, wantHeading), -dt * 4, dt * 4);
  if (d > 26) {
    // Too far away: hold position and idle.
    poseFoe(h, e, dt, 0);
    return;
  }
  if (d > 9) {
    // Close the distance.
    e.x += Math.cos(e.heading) * e.speed * dt;
    e.z += Math.sin(e.heading) * e.speed * dt;
    e.phase += dt * 9;
    poseFoe(h, e, dt, 0.7);
  } else {
    poseFoe(h, e, dt, 0.1, true);
  }
  // Shoot on a timer when in range.
  e.shootT -= dt;
  if (e.shootT <= 0 && d < 30) {
    e.shootT = e.isBoss ? 0.7 : 1.1 + Math.random() * 0.8;
    G.audio.sfx('shot', 'smg');
    addTracer(
      G,
      new THREE.Vector3(e.x, 1.4, e.z),
      new THREE.Vector3(p.x, 1.2, p.z),
    );
    // Inaccurate fire: the hit chance falls with distance.
    const hitChance = clamp(0.45 - d * 0.012, 0.06, 0.4);
    if (Math.random() < hitChance) {
      damagePlayer(G, e.isBoss ? 14 : 8);
    }
  }
  h.group.position.set(e.x, 0, e.z);
  h.group.rotation.y = -e.heading;
}

/** Pose helper: forwards the walk cycle to the humanoid poser. */
function poseFoe(h, e, dt, speed01, aiming = false) {
  poseHumanoid(h, e.phase, speed01, aiming, false);
}

/**
 * Damage the player. Armor absorbs first; what is left hits health.
 * Death itself is handled by the main loop (the wasted flow), which
 * respawns the player at the hospital and shows the end screen.
 */
export function damagePlayer(G, amount) {
  if (G.player.dead) return;
  let left = amount;
  if (G.player.armor > 0) {
    const absorbed = Math.min(G.player.armor, left);
    G.player.armor -= absorbed;
    left -= absorbed;
  }
  G.player.health -= left;
  G.audio.sfx('hurt');
  G.hud.flashDamage();
  if (G.player.health <= 0) {
    G.player.health = 0;
    G.player.dead = true;
    G.audio.sfx('wasted');
  }
}

/** Punch: short-range melee in front of the player. */
export function playerPunch(G) {
  if (G.combat.punchT > 0) return;
  G.combat.punchT = 0.45;
  G.audio.sfx('punch');
  const p = G.player;
  for (const e of G.combat.enemies) {
    if (e.dead) continue;
    const d = dist2(e.x, e.z, p.x, p.z);
    if (d < 2.4) damageEnemy(G, e, 20);
  }
  // Punching a civilian is an assault — they flee and the police hear.
  for (const ped of G.peds) {
    const d = dist2(ped.x, ped.z, p.x, p.z);
    if (d < 2.4) {
      ped.fleeT = 5;
      G.police.crime('assault');
    }
  }
}

/** A tracer line from a to b that fades out over 0.09s. */
export function addTracer(G, a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const mat = new THREE.LineBasicMaterial({
    color: 0xffe08a,
    transparent: true,
    opacity: 0.9,
  });
  const line = new THREE.Line(geo, mat);
  G.scene.add(line);
  G.combat.tracers.push({ line, life: 0.09 });
}

/**
 * Spawn a pickup (cash / health / armor) at (x, z). The coloured
 * cube spins and bobs until the player walks into it.
 */
export function spawnPickup(G, x, z, kind, value) {
  const colors = { cash: 0x2fd06a, health: 0xff5040, armor: 0x4080ff };
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.MeshBasicMaterial({ color: colors[kind] || 0xffffff }),
  );
  mesh.position.set(x, 0.7, z);
  mesh.userData.pickup = { kind, value };
  G.scene.add(mesh);
  G.combat.pickups.push({
    mesh,
    kind,
    value,
    x,
    z,
    spin: Math.random() * 6,
  });
}

/** Pickups: spin, bob, and collect on touch. */
export function updatePickups(G, dt) {
  const p = G.player;
  for (let i = G.combat.pickups.length - 1; i >= 0; i--) {
    const pk = G.combat.pickups[i];
    pk.mesh.rotation.y += dt * 3;
    pk.mesh.position.y = 0.7 + Math.sin(G.time * 3 + pk.spin) * 0.15;
    if (dist2(pk.x, pk.z, p.x, p.z) >= 2) continue;
    if (pk.kind === 'cash') {
      G.money += pk.value;
      G.notice = '+' + '$' + pk.value;
    } else if (pk.kind === 'health') {
      p.health = Math.min(100, p.health + 50);
      G.notice = 'Health +50';
    } else if (pk.kind === 'armor') {
      p.armor = Math.min(100, p.armor + 50);
      G.notice = 'Armor +50';
    }
    G.noticeT = 1.5;
    G.audio.sfx('pickup');
    G.scene.remove(pk.mesh);
    G.combat.pickups.splice(i, 1);
  }
}

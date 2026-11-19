// policeHelicopter.js — the police helicopter ("Air One"): joins the chase
// at 3+ stars, circles above the player with a searchlight cone and a
// ground disc, and opens fire from 4+ stars. It always has eyes on you,
// so heat never cools while it is overhead.
import * as THREE from '../lib/three.module.js';
import { damagePlayer } from './combat.js';

/** Build the helicopter model (body, tail, rotor, spotlight cone + disc). */
export function createPoliceHelicopter() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1c2c4c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 2), bodyMat);
  g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.5), bodyMat);
  tail.position.set(-3, 0.3, 0);
  g.add(tail);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1.8),
    new THREE.MeshLambertMaterial({ color: 0x9fc8e0 }));
  glass.position.set(1.4, 0.1, 0);
  g.add(glass);
  const rotor = new THREE.Group();
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.08, 0.35), bladeMat);
    blade.rotation.y = a;
    rotor.add(blade);
  }
  rotor.position.y = 1;
  g.add(rotor);
  // Spotlight cone pointing down.
  const spot = new THREE.Mesh(
    new THREE.ConeGeometry(4, 22, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.14,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  spot.position.y = -11;
  spot.rotation.x = Math.PI;
  g.add(spot);
  // Searchlight disc on the ground follows the player (positioned by update).
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(4, 20),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.18 }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -21.8;
  g.add(disc);
  return { group: g, rotor, x: 0, z: 0, y: 34, angle: 0, fireT: 2, orbitR: 26, orbitY: 34 };
}

/** Spawn the helicopter near the player (3+ stars). */
export function spawnPoliceHelicopter(G) {
  const P = G.police;
  const p = G.player;
  if (P.heli) return P.heli;
  P.heli = createPoliceHelicopter();
  P.heli.x = p.x + 30;
  P.heli.z = p.z - 30;
  G.scene.add(P.heli.group);
  G.notice = 'Air One is overhead!';
  G.noticeT = 2.5;
  return P.heli;
}

/** Remove the helicopter from the scene. */
export function removePoliceHelicopter(G) {
  const P = G.police;
  if (!P.heli) return;
  G.scene.remove(P.heli.group);
  P.heli = null;
}

/** Per-frame helicopter update: circle the player, spin the rotor, and
 *  fire on the player from 4+ stars. */
export function updatePoliceHelicopter(G, dt) {
  const P = G.police;
  const p = G.player;
  if (!P.heli) return;
  const heli = P.heli;
  heli.angle += dt * 0.5;
  const orbitR = heli.orbitR || 26;
  const orbitY = heli.orbitY || 34;
  heli.x = p.x + Math.cos(heli.angle) * orbitR;
  heli.z = p.z + Math.sin(heli.angle) * orbitR;
  heli.y = orbitY + Math.sin(G.time * 0.7) * 1.5;
  heli.group.position.set(heli.x, heli.y, heli.z);
  heli.group.rotation.y = -heli.angle;
  heli.rotor.rotation.y += dt * 22;
  if (P.level >= 4) {
    heli.fireT -= dt;
    if (heli.fireT <= 0) {
      heli.fireT = 1.6;
      G.audio.sfx('shot', 'smg');
      if (Math.random() < 0.3) damagePlayer(G, 6);
    }
  }
}

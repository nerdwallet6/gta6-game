// character.js — low-poly humanoids built from Three.js primitives, with
// procedural walk/run/idle animation. Two switchable protagonists (Rae
// Solano, Juno Vega) with distinct looks, outfits and special abilities.
// Also builds gang members, police officers and pedestrians from the
// same factory.
import * as THREE from '../lib/three.module.js';
import { PROTAGONISTS, OUTFITS } from './data.js';
import { clamp } from './util.js';

function lam(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function part(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = false;
  return m;
}

/**
 * Build a humanoid. opts: skin, hair, hairStyle, jacket, pants, shoes,
 * mask (bool), scale. Returns {group, limbs:{armL,armR,legL,legR,head,torso},
 * mats, setOutfit}.
 * The figure is ~1.8 units tall, origin at the feet.
 */
export function createHumanoid(opts = {}) {
  const o = {
    skin: 0xc89878, hair: 0x201510, hairStyle: 'short',
    jacket: 0x2e8b8b, pants: 0x2a2d34, shoes: 0xdddddd, mask: false,
    ...opts,
  };
  const g = new THREE.Group();
  g.name = 'humanoid';

  const skinMat = lam(o.skin);
  const hairMat = lam(o.hair);
  const jacketMat = lam(o.jacket);
  const pantsMat = lam(o.pants);
  const shoeMat = lam(o.shoes);

  // Legs pivot at the hip (y = 0.85).
  const legL = new THREE.Group();
  legL.position.set(-0.11, 0.85, 0);
  legL.add(part(0.2, 0.8, 0.22, pantsMat, 0, -0.4, 0));
  legL.add(part(0.22, 0.1, 0.34, shoeMat, 0, -0.8, 0.05));
  g.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.11, 0.85, 0);
  legR.add(part(0.2, 0.8, 0.22, pantsMat, 0, -0.4, 0));
  legR.add(part(0.22, 0.1, 0.34, shoeMat, 0, -0.8, 0.05));
  g.add(legR);

  // Torso.
  const torso = part(0.52, 0.62, 0.3, jacketMat, 0, 1.16, 0);
  g.add(torso);
  // Jacket stripe / shirt patch.
  g.add(part(0.3, 0.5, 0.02, lam(0xeeeeee), 0, 1.16, 0.16));

  // Arms pivot at the shoulder (y = 1.42).
  const armL = new THREE.Group();
  armL.position.set(-0.33, 1.42, 0);
  armL.add(part(0.16, 0.62, 0.18, jacketMat, 0, -0.28, 0));
  armL.add(part(0.15, 0.16, 0.16, skinMat, 0, -0.62, 0));
  g.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.33, 1.42, 0);
  armR.add(part(0.16, 0.62, 0.18, jacketMat, 0, -0.28, 0));
  armR.add(part(0.15, 0.16, 0.16, skinMat, 0, -0.62, 0));
  g.add(armR);

  // Head + hair + (optional) mask.
  const headG = new THREE.Group();
  headG.position.set(0, 1.62, 0);
  headG.add(part(0.34, 0.34, 0.32, skinMat, 0, 0.12, 0));
  if (o.hairStyle === 'long') {
    headG.add(part(0.38, 0.5, 0.36, hairMat, 0, 0.14, -0.04));
    headG.add(part(0.36, 0.14, 0.34, hairMat, 0, 0.32, 0));
  } else if (o.hairStyle === 'cap') {
    headG.add(part(0.36, 0.1, 0.34, hairMat, 0, 0.3, 0));
    headG.add(part(0.36, 0.06, 0.2, hairMat, 0, 0.28, 0.22));
  } else {
    headG.add(part(0.36, 0.14, 0.34, hairMat, 0, 0.32, 0));
  }
  // Eyes.
  const eyeMat = lam(0x111111);
  headG.add(part(0.05, 0.05, 0.02, eyeMat, -0.08, 0.14, 0.17));
  headG.add(part(0.05, 0.05, 0.02, eyeMat, 0.08, 0.14, 0.17));
  g.add(headG);

  let maskMesh = null;
  if (o.mask) {
    maskMesh = part(0.36, 0.2, 0.34, lam(0x18181c), 0, 1.68, 0);
    g.add(maskMesh);
  }

  // Blob shadow under the feet (cheap grounding, no shadow maps).
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);

  const limbs = { armL, armR, legL, legR, head: headG, torso, shadow };

  /** Apply an outfit (jacket/pants colours + mask) in place. */
  function setOutfit(outfitId) {
    const out = OUTFITS[outfitId] || OUTFITS.street;
    if (out.jacket !== null && out.jacket !== undefined) jacketMat.color.setHex(out.jacket);
    if (out.pants !== null && out.pants !== undefined) pantsMat.color.setHex(out.pants);
    if (maskMesh) maskMesh.visible = !!out.mask;
    else if (out.mask) {
      maskMesh = part(0.36, 0.2, 0.34, lam(0x18181c), 0, 1.68, 0);
      g.add(maskMesh);
    }
  }

  return { group: g, limbs, mats: { skinMat, hairMat, jacketMat, pantsMat, shoeMat }, setOutfit };
}

/**
 * Procedural locomotion: swing limbs by phase, bob the torso, lean into
 * the run. speed01: 0 idle, ~0.5 walk, 1 sprint. dt-scaled phase advance
 * happens in the caller; here we just pose for a given phase.
 */
export function poseHumanoid(h, phase, speed01, aiming = false, airborne = false) {
  const s = clamp(speed01, 0, 1);
  const swing = Math.sin(phase) * (0.25 + s * 0.55);
  const swing2 = Math.sin(phase + Math.PI) * (0.25 + s * 0.55);
  if (airborne) {
    h.limbs.legL.rotation.x = -0.5;
    h.limbs.legR.rotation.x = 0.35;
    h.limbs.armL.rotation.x = -0.6;
    h.limbs.armR.rotation.x = -0.6;
  } else if (aiming) {
    // Both arms forward, holding the weapon.
    h.limbs.armR.rotation.x = -1.35;
    h.limbs.armL.rotation.x = -1.15;
    h.limbs.armL.rotation.z = 0.5;
    h.limbs.legL.rotation.x = swing * 0.4;
    h.limbs.legR.rotation.x = swing2 * 0.4;
  } else {
    h.limbs.legL.rotation.x = swing;
    h.limbs.legR.rotation.x = swing2;
    h.limbs.armL.rotation.x = swing2 * 0.9;
    h.limbs.armR.rotation.x = swing * 0.9;
    h.limbs.armL.rotation.z = 0;
    h.limbs.armR.rotation.z = 0;
  }
  // Idle breathing when still.
  const breathe = s < 0.05 ? Math.sin(phase * 0.35) * 0.02 : 0;
  h.limbs.torso.position.y = 1.16 + Math.abs(Math.cos(phase)) * s * 0.06 + breathe;
  h.limbs.torso.rotation.x = s * 0.14;
  h.group.position.y = h.group.userData.baseY || 0;
}

/** Build one protagonist figure from PROTAGONISTS[i]. */
export function createProtagonist(i) {
  const p = PROTAGONISTS[i];
  const h = createHumanoid({
    skin: p.skin, hair: p.hair, hairStyle: p.hairStyle,
    jacket: p.jacket, pants: p.pants, shoes: p.shoes,
  });
  h.group.userData.protagonist = p.id;
  return h;
}

/** A Viper gang member: red jacket, cap. */
export function createViper() {
  return createHumanoid({
    skin: 0xb08060, hair: 0x101010, hairStyle: 'cap',
    jacket: 0xc02020, pants: 0x2a2a2e, shoes: 0x111111,
  });
}

/** A police officer on foot: navy uniform, cap. */
export function createCop() {
  return createHumanoid({
    skin: 0xd8a880, hair: 0x181008, hairStyle: 'cap',
    jacket: 0x1c2c4c, pants: 0x1c2c4c, shoes: 0x111111,
  });
}

/** A civilian pedestrian with a random seeded look. */
export function createPedestrian(rng) {
  const jackets = [0xe8e0d0, 0x4a6a8a, 0x8a4a5a, 0x5a8a4a, 0xd8a040, 0x6a5a8a];
  const pants = [0x2a2d34, 0x3a3f4a, 0x5a4a3a, 0x222226];
  return createHumanoid({
    skin: [0xc89878, 0xe8b890, 0x8a5f40, 0xd8a080][rng.int(0, 3)],
    hair: [0x201510, 0x101010, 0x6a4a28, 0xd8d0c0][rng.int(0, 3)],
    hairStyle: rng.chance(0.5) ? 'short' : 'long',
    jacket: jackets[rng.int(0, jackets.length - 1)],
    pants: pants[rng.int(0, pants.length - 1)],
    shoes: 0x333333,
  });
}

// character.js — rounded low-poly humanoids built from Three.js
// primitives, with procedural walk/run/idle animation. Two switchable
// protagonists (Rae Solano, Juno Vega) with distinct looks, outfits and
// special abilities. Also builds gang members, police officers and
// pedestrians from the same factory.
//
// Rebuild note: the old figures were hard boxes — slab torsos, plank
// limbs, cube heads. People read as people when the silhouette is soft,
// so every body part here is a capsule or a sphere: capsule thighs and
// shins, a rounded capsule torso, sphere shoulders, elbows and hands,
// a sphere head with a hair cap, and flattened-sphere shoes. The pivot
// structure (hips at 0.85, shoulders at 1.42, head group at 1.62) is
// unchanged, so the walk/run/aim posing code keeps working untouched.
import * as THREE from '../lib/three.module.min.js';
import { PROTAGONISTS, OUTFITS } from './data.js';
import { clamp } from './util.js';

function lam(color) {
  return new THREE.MeshLambertMaterial({ color });
}

/** A capsule limb segment, rounded at both ends. */
function capsule(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat);
  m.castShadow = false;
  return m;
}

/** A sphere part, optionally squashed on one axis. */
function ball(r, mat, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
  m.scale.set(sx, sy, sz);
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
  const scale = o.scale || 1;
  g.scale.setScalar(scale);

  // Legs: capsule thighs pivoting at the hip (y = 0.85), with a rounded
  // shoe (flattened sphere) at the foot so the stride reads in profile.
  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(0.11 * side, 0.85, 0);
    const thigh = capsule(0.115, 0.5, pantsMat);
    thigh.position.y = -0.38;
    leg.add(thigh);
    const shoe = ball(0.14, shoeMat, 1, 0.55, 1.7);
    shoe.position.set(0, -0.8, 0.05);
    leg.add(shoe);
    return leg;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  g.add(legL, legR);

  // Torso: a capsule squashed front-to-back, with a waistband ring and
  // a shirt panel on the chest so the jacket has two tones.
  const torso = capsule(0.27, 0.34, jacketMat);
  torso.scale.set(1, 1, 0.72);
  torso.position.y = 1.16;
  g.add(torso);
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.09, 14), lam(0x1c1c20));
  waist.scale.set(1, 1, 0.72);
  waist.position.y = 0.88;
  g.add(waist);
  const chest = ball(0.2, lam(0xeeeeee), 1, 1.15, 0.5);
  chest.position.set(0, 1.2, 0.16);
  g.add(chest);
  // Jacket collar: a squashed torus ring at the neck.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 14), jacketMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.5;
  g.add(collar);

  // Arms: capsule upper+forearm in one rounded piece pivoting at the
  // shoulder (y = 1.42), a sphere shoulder cap and a sphere hand.
  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(0.33 * side, 1.42, 0);
    const cap = ball(0.11, jacketMat);
    cap.position.y = 0.02;
    arm.add(cap);
    const limb = capsule(0.085, 0.42, jacketMat);
    limb.position.y = -0.3;
    arm.add(limb);
    const hand = ball(0.085, skinMat);
    hand.position.y = -0.62;
    arm.add(hand);
    return arm;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);
  g.add(armL, armR);

  // Head: a sphere, hair as a cap that follows the skull curve, eyes as
  // small dark spheres set into the face, plus an optional mask.
  const headG = new THREE.Group();
  headG.position.set(0, 1.62, 0);
  const skull = ball(0.19, skinMat, 0.95, 1.05, 0.98);
  skull.position.y = 0.12;
  headG.add(skull);
  // Nose: a tiny rounded bump so the face reads in profile.
  const nose = ball(0.035, skinMat, 1, 1.2, 1.4);
  nose.position.set(0, 0.1, 0.19);
  headG.add(nose);
  if (o.hairStyle === 'long') {
    // Full hair cap + a rounded curtain down the back of the head.
    const cap = ball(0.2, hairMat, 0.98, 0.9, 1);
    cap.position.set(0, 0.17, -0.02);
    headG.add(cap);
    const curtain = capsule(0.16, 0.22, hairMat);
    curtain.scale.set(1.15, 1, 0.55);
    curtain.position.set(0, -0.05, -0.12);
    headG.add(curtain);
  } else if (o.hairStyle === 'cap') {
    const cap = ball(0.2, hairMat, 1, 0.55, 1);
    cap.position.set(0, 0.24, 0);
    headG.add(cap);
    // Brim: a thin flattened disc jutting forward.
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 14), hairMat);
    brim.scale.set(1, 1, 1.4);
    brim.position.set(0, 0.2, 0.12);
    headG.add(brim);
  } else {
    // Short hair: a cap hugging the top of the skull.
    const cap = ball(0.2, hairMat, 0.98, 0.75, 1);
    cap.position.set(0, 0.2, -0.01);
    headG.add(cap);
  }
  // Eyes: dark beads on the face, not flat decals.
  const eyeMat = lam(0x111111);
  for (const s of [-1, 1]) {
    const eye = ball(0.028, eyeMat);
    eye.position.set(0.075 * s, 0.14, 0.175);
    headG.add(eye);
  }
  g.add(headG);

  let maskMesh = null;
  if (o.mask) {
    maskMesh = ball(0.19, lam(0x18181c), 0.95, 0.62, 0.9);
    maskMesh.position.set(0, 1.68, 0.02);
    g.add(maskMesh);
  }

  // Optional backpack for pedestrians: a rounded box on the back.
  let packMesh = null;
  if (o.backpack) {
    packMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.2, 4, 8), lam(o.backpack));
    packMesh.rotation.x = Math.PI / 2;
    packMesh.scale.set(1, 1, 0.6);
    packMesh.position.set(0, 1.2, -0.24);
    g.add(packMesh);
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
      maskMesh = ball(0.19, lam(0x18181c), 0.95, 0.62, 0.9);
      maskMesh.position.set(0, 1.68, 0.02);
      g.add(maskMesh);
    }
    if (packMesh) packMesh.visible = true;
  }

  return { group: g, limbs, mats: { skinMat, hairMat, jacketMat, pantsMat, shoeMat }, setOutfit };
}

/**
 * Procedural locomotion: swing limbs by phase, bob the torso, lean into
 * the run, counter-rotate the shoulders. speed01: 0 idle, ~0.5 walk,
 * 1 sprint. dt-scaled phase advance happens in the caller; here we just
 * pose for a given phase.
 */
export function poseHumanoid(h, phase, speed01, aiming = false, airborne = false) {
  const s = clamp(speed01, 0, 1);
  const swing = Math.sin(phase) * (0.25 + s * 0.55);
  const swing2 = Math.sin(phase + Math.PI) * (0.25 + s * 0.55);
  if (airborne) {
    // Tucked legs, arms out for balance.
    h.limbs.legL.rotation.x = -0.5;
    h.limbs.legR.rotation.x = 0.35;
    h.limbs.armL.rotation.x = -0.6;
    h.limbs.armR.rotation.x = -0.6;
    h.limbs.armL.rotation.z = 0.7;
    h.limbs.armR.rotation.z = -0.7;
  } else if (aiming) {
    // Both arms forward, holding the weapon; knees soft, head steady.
    h.limbs.armR.rotation.x = -1.35;
    h.limbs.armL.rotation.x = -1.15;
    h.limbs.armL.rotation.z = 0.5;
    h.limbs.armR.rotation.z = -0.15;
    h.limbs.legL.rotation.x = swing * 0.4;
    h.limbs.legR.rotation.x = swing2 * 0.4;
    h.limbs.legL.rotation.z = 0.04;
    h.limbs.legR.rotation.z = -0.04;
    h.limbs.head.rotation.x = -0.05;
  } else {
    h.limbs.legL.rotation.x = swing;
    h.limbs.legR.rotation.x = swing2;
    h.limbs.armL.rotation.x = swing2 * 0.9;
    h.limbs.armR.rotation.x = swing * 0.9;
    // Arms hang slightly out from the body and sway sideways a touch.
    h.limbs.armL.rotation.z = 0.12 + Math.sin(phase) * 0.04 * s;
    h.limbs.armR.rotation.z = -0.12 - Math.sin(phase) * 0.04 * s;
    h.limbs.legL.rotation.z = 0.03;
    h.limbs.legR.rotation.z = -0.03;
    // Head bobs gently and looks along the run.
    h.limbs.head.rotation.x = s * 0.08 + Math.sin(phase * 2) * 0.02 * s;
    h.limbs.head.rotation.y = Math.sin(phase * 0.5) * 0.05 * (1 - s);
  }
  // Idle breathing when still; torso leans into the sprint when moving.
  const breathe = s < 0.05 ? Math.sin(phase * 0.35) * 0.02 : 0;
  h.limbs.torso.position.y = 1.16 + Math.abs(Math.cos(phase)) * s * 0.06 + breathe;
  h.limbs.torso.rotation.x = s * 0.14;
  h.limbs.torso.rotation.z = Math.sin(phase) * 0.03 * s;
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

/** A police officer on foot: navy uniform, cap, badge dot on the chest. */
export function createCop() {
  const h = createHumanoid({
    skin: 0xd8a880, hair: 0x181008, hairStyle: 'cap',
    jacket: 0x1c2c4c, pants: 0x1c2c4c, shoes: 0x111111,
  });
  const badge = ball(0.045, lam(0xffd24a));
  badge.position.set(-0.12, 1.32, 0.2);
  h.group.add(badge);
  return h;
}

/** A civilian pedestrian with a random seeded look. */
export function createPedestrian(rng) {
  const jackets = [0xe8e0d0, 0x4a6a8a, 0x8a4a5a, 0x5a8a4a, 0xd8a040, 0x6a5a8a, 0xff8a5c, 0x3aa8a0];
  const pants = [0x2a2d34, 0x3a3f4a, 0x5a4a3a, 0x222226, 0x4a5a6a];
  const packs = [null, null, 0x8a3a3a, 0x3a5a8a, 0x5a8a3a];
  return createHumanoid({
    skin: [0xc89878, 0xe8b890, 0x8a5f40, 0xd8a080][rng.int(0, 3)],
    hair: [0x201510, 0x101010, 0x6a4a28, 0xd8d0c0][rng.int(0, 3)],
    hairStyle: rng.chance(0.5) ? 'short' : 'long',
    jacket: jackets[rng.int(0, jackets.length - 1)],
    pants: pants[rng.int(0, pants.length - 1)],
    shoes: [0x333333, 0xdddddd, 0x8a2a2a][rng.int(0, 2)],
    backpack: packs[rng.int(0, packs.length - 1)],
    scale: rng.range(0.92, 1.08),
  });
}

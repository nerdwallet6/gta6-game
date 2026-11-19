// city.js — Solmar City, rebuilt as a dense coastal metropolis at dusk.
//
// The rebuild brief: the old city read as flat grey slabs on an empty lot.
// This version encloses every avenue in a street canyon — 2-4 buildings
// per block, pushed right up to the kerb, towers with setbacks, warm
// terracotta / peach / coral / turquoise facades, lit windows, balconies,
// awnings, neon, palms lining both sides of every boulevard, hydrants,
// bus stops, billboards, traffic lights, crosswalks, wet reflective
// asphalt, a hazy golden-hour sky with a low sunset glow on the horizon
// and a dark skyline silhouette ringing the city so no shot ever ends
// in empty sky. All geometry is low-poly Three.js primitives with
// procedural canvas textures — no external assets.
import * as THREE from '../lib/three.module.min.js';
import { DISTRICTS, SHOPS, SPOTS } from './data.js';
import { clamp, makeRng } from './util.js';

export const ROAD_LINES = [-252, -180, -108, -36, 36, 108, 180, 252];
export const BLOCK_CENTERS = [-216, -144, -72, 0, 72, 144, 216];

// Warm facade palettes per district — sun-baked stucco, brick and painted
// concrete, never flat grey. Each entry: [base, trim, accent].
const FACADES = {
  palm: [['#e8c890', '#c8a878', '#ff9a5c'], ['#f0d8a8', '#d8b888', '#5ec8b8'],
    ['#e0b878', '#b89858', '#ff7a6a']],
  neon: [['#6a4a86', '#452a58', '#ff2ea6'], ['#5a3a78', '#3a2450', '#22e6ff'],
    ['#7a5496', '#4a2e60', '#ffd24a'], ['#52407a', '#342850', '#ff5a3c']],
  harbor: [['#a86a4a', '#7a4a30', '#ffd24a'], ['#96704a', '#6a4a30', '#5ec8b8'],
    ['#b87a58', '#885838', '#ff9a5c']],
  plaza: [['#c8a878', '#a88858', '#22e6ff'], ['#d8b890', '#b89868', '#ff2ea6'],
    ['#b89a78', '#987a58', '#ffd24a'], ['#e0c090', '#c0a070', '#7cff6a']],
  marina: [['#7fb8c8', '#5a98a8', '#ff9a5c'], ['#6aa8b8', '#4a8898', '#ffd24a'],
    ['#8fc8d8', '#6aa8b8', '#ff2ea6']],
  flats: [['#c8a878', '#a88858', '#ff7a6a'], ['#d8b888', '#b89868', '#5ec8b8'],
    ['#b89068', '#986848', '#ffd24a']],
};

// Tall-tower accent colours for the plaza skyline.
const TOWER_TOPS = [0xff9a5c, 0x22e6ff, 0xff2ea6, 0xffd24a, 0x7cff6a];

/** Which district contains (x, z)? */
export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    const b = d.bounds;
    if (x >= b[0] && x < b[1] && z >= b[2] && z < b[3]) return d;
  }
  return DISTRICTS[0];
}

/** Nearest road-line coordinate on one axis. */
export function nearestRoad(v) {
  let best = ROAD_LINES[0];
  for (const r of ROAD_LINES) if (Math.abs(r - v) < Math.abs(best - v)) best = r;
  return best;
}

// ---------------------------------------------------------------- textures

/** Facade canvas: rows of windows, some lit warm, with a style twist. */
function windowTexture(rng, base, trim, litRatio, style) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Top cornice shadow + ground-floor storefront band.
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(0, 0, 128, 8);
  g.fillStyle = 'rgba(30,16,8,0.55)';
  g.fillRect(0, 236, 128, 20);
  // Warm shop glow inside the storefront band.
  g.fillStyle = 'rgba(255,190,110,0.85)';
  for (let x = 8; x < 120; x += 30) g.fillRect(x, 240, 20, 12);
  if (style === 'ribbon') {
    // Glass tower: continuous horizontal window ribbons.
    for (let y = 16; y < 232; y += 20) {
      g.fillStyle = 'rgba(20,26,38,0.9)';
      g.fillRect(6, y, 116, 10);
      g.fillStyle = 'rgba(255,214,140,0.9)';
      const lit = rng.next() < litRatio;
      if (lit) g.fillRect(6 + rng.int(0, 5) * 20, y, 18, 10);
    }
  } else {
    for (let y = 16; y < 230; y += 22) {
      // Balcony slab line under every other floor on 'balcony' style.
      if (style === 'balcony' && (y / 22) % 2 === 0) {
        g.fillStyle = trim;
        g.fillRect(0, y + 16, 128, 4);
      }
      for (let x = 10; x < 118; x += 22) {
        const lit = rng.next() < litRatio;
        if (style === 'arched' && (y / 22) % 2 === 1) {
          // Arched windows on alternate floors: round top.
          g.fillStyle = lit ? '#ffd98a' : '#333845';
          g.beginPath();
          g.arc(x + 7, y + 10, 7, Math.PI, 0);
          g.fill();
          g.fillRect(x, y + 10, 14, 6);
        } else {
          g.fillStyle = lit ? '#ffd98a' : '#333845';
          g.fillRect(x, y, 14, 16);
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Canvas texture for a neon sign. */
function signTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0a12';
  g.fillRect(0, 0, 256, 64);
  g.font = 'bold 38px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Big soft radial glow (sunset haze on the horizon). */
function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 96, 4, 128, 96, 120);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.55, outer);
  grad.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Crosswalk stripes painted on one plane per intersection: a single
 * zebra of long bars (stripes run with the road, as on a real crossing).
 * One direction only — bars in both directions tiled into a checkerboard
 * on the old texture and read as a chessboard road. */
function crosswalkTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(240,236,220,0.85)';
  for (let i = 0; i < 6; i++) {
    g.fillRect(10 + i * 20, 6, 10, 116);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Billboard face: bold wordmark on a saturated gradient. */
function billboardTexture(word, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 128);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, '#1a1026');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  g.font = 'bold 44px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = fg;
  g.shadowBlur = 16;
  g.fillStyle = fg;
  g.fillText(word, 128, 58);
  g.font = 'bold 18px sans-serif';
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.fillText('SOLMAR CITY', 128, 102);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ helpers

function lam(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cyl(rt, rb, h, mat, x, y, z, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

// ---------------------------------------------------------------- buildCity

/**
 * Build the whole city into `scene`. Returns handles the game needs:
 * colliders (AABB list), day/night updater, shop marker positions,
 * water mesh, and the light rig.
 */
export function buildCity(scene, seed = 20261119) {
  const rng = makeRng(seed);
  const colliders = []; // {x0,z0,x1,z1}
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // ---- ground: grass base, city slab, sand beach, water ----
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x7a9a5a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 120);
  group.add(ground);

  const slabMat = new THREE.MeshLambertMaterial({ color: 0xa89a80 });
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(624, 624), slabMat);
  slab.rotation.x = -Math.PI / 2;
  slab.position.set(0, 0, 0);
  group.add(slab);

  // Roads: warm wet asphalt that catches the sunset, with kerbs.
  const roadMat = new THREE.MeshPhongMaterial({
    color: 0x3a3d46, shininess: 120, specular: 0xcc8866,
  });
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xe8c25a });
  const kerbMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
  const crossTex = crosswalkTexture();
  const crossMat = new THREE.MeshBasicMaterial({
    map: crossTex, transparent: true, depthWrite: false,
  });
  for (const r of ROAD_LINES) {
    for (const [w, d, x, z] of [[12, 624, r, 0], [624, 12, 0, r]]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.02, z);
      group.add(road);
    }
    // Kerb strips along both edges of both directions.
    for (const off of [-6.4, 6.4]) {
      group.add(box(0.7, 0.18, 624, kerbMat, r + off, 0.09, 0));
      group.add(box(624, 0.18, 0.7, kerbMat, 0, 0.09, r + off));
    }
    // Centre dashes.
    for (let s = -300; s < 300; s += 24) {
      const d1 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 8), lineMat);
      d1.rotation.x = -Math.PI / 2;
      d1.position.set(r, 0.03, s);
      group.add(d1);
      const d2 = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.6), lineMat);
      d2.rotation.x = -Math.PI / 2;
      d2.position.set(s, 0.03, r);
      group.add(d2);
    }
  }
  // Crosswalks at every intersection (one textured plane each).
  for (const rx of ROAD_LINES) {
    for (const rz of ROAD_LINES) {
      const cw = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), crossMat);
      cw.rotation.x = -Math.PI / 2;
      cw.position.set(rx, 0.035, rz);
      group.add(cw);
    }
  }

  // Beach sand + bay water (south edge, z > 300).
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xe8c890 });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1100, 60), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.01, 330);
  group.add(sand);
  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x2a6f9e, shininess: 140, specular: 0xffa060,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1100, 300), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, 510);
  water.name = 'water';
  group.add(water);

  // Pier out into the bay at x = -108, with lamp posts.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const pier = box(10, 1, 90, pierMat, -108, 0.6, 395);
  group.add(pier);
  for (let z = 360; z < 440; z += 18) {
    group.add(box(1, 3, 1, pierMat, -112, 0, z));
    group.add(box(1, 3, 1, pierMat, -104, 0, z));
  }

  // Beach umbrellas: bright cones on poles, dotted along the sand.
  const umbrellaColors = [0xff5a3c, 0xffd24a, 0x22e6ff, 0xff2ea6, 0x7cff6a];
  for (let i = 0; i < 14; i++) {
    const ux = -280 + i * 42 + rng.range(-8, 8);
    const uz = 318 + rng.range(0, 18);
    const um = lam(umbrellaColors[i % umbrellaColors.length]);
    const pole = cyl(0.08, 0.08, 2.4, lam(0xe8e0d0), ux, 1.2, uz, 6);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.1, 8), um);
    top.position.set(ux, 2.8, uz);
    group.add(top);
  }

  // ---- buildings: 2-4 per block, pushed to the kerb, varied footprints --
  const facadeMats = new Map(); // key -> {mat, lit} per district+palette+style
  function matsFor(d, pal, style) {
    const key = d.id + '|' + pal[0] + '|' + style;
    if (!facadeMats.has(key)) {
      const tex = windowTexture(rng, pal[0], pal[1], d.neon ? 0.55 : 0.38, style);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const lit = new THREE.MeshLambertMaterial({
        map: tex, emissive: 0xffc46a, emissiveMap: tex, emissiveIntensity: 0,
      });
      facadeMats.set(key, { mat, lit });
    }
    return facadeMats.get(key);
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x2a2e34 });
  const neonSigns = [];
  const signWords = ['NEON', 'SOLMAR', 'BAR', 'HOTEL', '24H', 'CLUB', 'PIER', 'BAY', 'TACOS', 'PIZZA', 'MOTEL', 'CASINO'];
  const signColors = ['#ff2ea6', '#22e6ff', '#ffd24a', '#7cff6a', '#ff5a3c'];
  const styles = ['grid', 'balcony', 'arched', 'ribbon'];

  // One building: main slab + cornice cap + optional setback tower,
  // parapet, rooftop props, awning, neon. Returns nothing; registers
  // its own collider(s). Footprints vary: plain slab, L-shape (two
  // overlapping slabs) or chamfered corner (rotated corner block).
  function buildTower(x, z, w, dep, h, d, pal) {
    const style = styles[rng.int(0, styles.length - 1)];
    const { mat, lit } = matsFor(d, pal, style);
    const useLit = d.neon || rng.chance(0.45);
    const bodyMat = useLit ? lit : mat;
    const shape = rng.next();
    if (shape < 0.28) {
      // L-shape: two slabs at right angles, reads far less boxy.
      const b1 = box(w, h, dep * 0.62, bodyMat, x, h / 2, z - dep * 0.16);
      b1.userData.isBuilding = true;
      group.add(b1);
      const b2 = box(w * 0.55, h * 0.82, dep, bodyMat, x + w * 0.2, h * 0.41, z + dep * 0.1);
      b2.userData.isBuilding = true;
      group.add(b2);
      group.add(box(w + 0.8, 0.7, dep * 0.62 + 0.8, roofMat, x, h + 0.35, z - dep * 0.16));
      colliders.push({ x0: x - w / 2, z0: z - dep / 2, x1: x + w / 2, z1: z + dep / 2 });
    } else if (shape < 0.42) {
      // Chamfered corner: main slab + a 45-degree corner block.
      const b = box(w, h, dep, bodyMat, x, h / 2, z);
      b.userData.isBuilding = true;
      group.add(b);
      const cham = box(w * 0.32, h * 0.92, dep * 0.32, bodyMat, x + w * 0.34, h * 0.46, z + dep * 0.34);
      cham.rotation.y = Math.PI / 4;
      group.add(cham);
      group.add(box(w + 0.8, 0.7, dep + 0.8, roofMat, x, h + 0.35, z));
      colliders.push({ x0: x - w / 2, z0: z - dep / 2, x1: x + w / 2, z1: z + dep / 2 });
    } else {
      const b = box(w, h, dep, bodyMat, x, h / 2, z);
      b.userData.isBuilding = true;
      group.add(b);
      // Cornice cap: a slightly wider slab lip at the top.
      group.add(box(w + 0.9, 0.7, dep + 0.9, roofMat, x, h + 0.35, z));
      colliders.push({ x0: x - w / 2, z0: z - dep / 2, x1: x + w / 2, z1: z + dep / 2 });
    }
    // Setback tower on tall buildings: a smaller slab stacked on top,
    // so the skyline steps instead of ending in a flat roof.
    if (h > 26 && rng.chance(0.75)) {
      const sw = w * rng.range(0.45, 0.62);
      const sd = dep * rng.range(0.45, 0.62);
      const sh = rng.range(8, 18);
      const sx = x + rng.range(-w * 0.12, w * 0.12);
      const sz = z + rng.range(-dep * 0.12, dep * 0.12);
      const top = box(sw, sh, sd, bodyMat, sx, h + sh / 2 + 0.6, sz);
      top.userData.isBuilding = true;
      group.add(top);
      group.add(box(sw + 0.6, 0.6, sd + 0.6, roofMat, sx, h + sh + 0.9, sz));
      // Glowing crown strip on the tallest towers.
      if (h > 40) {
        const crown = box(sw + 0.3, 0.5, sd + 0.3,
          new THREE.MeshBasicMaterial({ color: TOWER_TOPS[rng.int(0, TOWER_TOPS.length - 1)] }),
          sx, h + sh + 0.4, sz);
        group.add(crown);
      }
    }
    // Rooftop props: AC boxes, water tower, antenna with beacon.
    const roofY = h + 0.7;
    if (rng.chance(0.6)) {
      group.add(box(rng.range(2, 4), 1.2, rng.range(2, 3.5), trimMat,
        x + rng.range(-w * 0.25, w * 0.25), roofY + 0.6, z + rng.range(-dep * 0.25, dep * 0.25)));
    }
    if (rng.chance(0.35)) {
      const wx = x + rng.range(-w * 0.3, w * 0.3);
      const wz = z + rng.range(-dep * 0.3, dep * 0.3);
      group.add(cyl(1.4, 1.4, 2.6, lam(0x8a6a4a), wx, roofY + 1.6, wz, 8));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.2, 8), trimMat);
      cone.position.set(wx, roofY + 3.5, wz);
      group.add(cone);
    }
    if (h > 30 && rng.chance(0.55)) {
      const ax = x + w * 0.2;
      group.add(cyl(0.08, 0.12, 7, trimMat, ax, roofY + 3.5, z, 6));
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff3040 }));
      beacon.position.set(ax, roofY + 7.2, z);
      group.add(beacon);
    }
    // Ground-floor awning: a short sloped canopy tucked against the
    // storefront. Kept short on purpose — a long awning reads as a
    // floating plank when seen edge-on from the side street.
    if (rng.chance(0.45)) {
      const aw = box(w * 0.32, 0.25, 1.6,
        lam([0xff5a3c, 0x22e6ff, 0xffd24a, 0x7cff6a, 0xff2ea6][rng.int(0, 4)]),
        x, 3.0, z + dep / 2 + 0.6);
      aw.rotation.x = 0.18;
      group.add(aw);
    }
    // Neon sign on taller / neon-district buildings.
    if ((d.neon || h > 20) && rng.chance(0.65)) {
      const word = signWords[rng.int(0, signWords.length - 1)];
      const color = signColors[rng.int(0, signColors.length - 1)];
      const sm = new THREE.MeshBasicMaterial({ map: signTexture(word, color) });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.75), sm);
      sign.position.set(x, h * rng.range(0.55, 0.8), z + dep / 2 + 0.15);
      group.add(sign);
      neonSigns.push(sign);
    }
  }

  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const d = districtAt(bx, bz);
      const pals = FACADES[d.id] || FACADES.palm;
      // 2-4 buildings per block, tucked against the kerb so the street
      // reads as a canyon, not a plaza. Block interior is 58 wide
      // (roads at +/-36, kerb at +/-30); keep |offset|+half <= 28.
      // Four corner plots only: they stay separated, so slabs never
      // interpenetrate, and the block middle stays a palm courtyard.
      const n = rng.int(2, 4);
      const spots = [[-13, -13], [13, -13], [-13, 13], [13, 13]];
      // Shuffle spots deterministically.
      for (let i = spots.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [spots[i], spots[j]] = [spots[j], spots[i]];
      }
      for (let i = 0; i < n; i++) {
        const [ox, oz] = spots[i];
        const w = rng.range(17, 26);
        const dep = rng.range(17, 26);
        const h = rng.range(d.height[0], d.height[1]);
        const pal = pals[rng.int(0, pals.length - 1)];
        buildTower(bx + ox, bz + oz, w, dep, h, d, pal);
      }
      // A palm on the block corner, clear of the buildings.
      if (rng.chance(0.6)) {
        const px = bx + (rng.chance(0.5) ? -26 : 26);
        const pz = bz + (rng.chance(0.5) ? -26 : 26);
        addPalm(group, px, pz, rng);
        colliders.push({ x0: px - 0.6, z0: pz - 0.6, x1: px + 0.6, z1: pz + 0.6 });
      }
    }
  }

  // Palms lining BOTH sides of every avenue, every ~48m — the boulevard
  // look from the reference shots.
  for (const r of ROAD_LINES) {
    for (let s = -288; s <= 288; s += 48) {
      if (rng.chance(0.85)) addPalm(group, r - 8.5, s + rng.range(-6, 6), rng);
      if (rng.chance(0.85)) addPalm(group, r + 8.5, s + 24 + rng.range(-6, 6), rng);
    }
  }
  // Palms along the beach.
  for (let x = -280; x <= 280; x += 24) {
    if (rng.chance(0.75)) addPalm(group, x + rng.range(-6, 6), 312 + rng.range(-4, 6), rng);
  }

  // Street props: lamps, hydrants, bus stops, traffic lights, billboards.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343a });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lamps = [];
  for (const r of ROAD_LINES) {
    for (const s of [-252, -108, 36, 180]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
      pole.position.set(r + 7, 3.5, s + 7);
      group.add(pole);
      const arm = box(1.6, 0.12, 0.12, poleMat, r + 6.2, 6.9, s + 7);
      group.add(arm);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampMat);
      lamp.position.set(r + 5.5, 6.9, s + 7);
      lamp.name = 'lamp';
      group.add(lamp);
      lamps.push(lamp);
      colliders.push({ x0: r + 6.4, z0: s + 6.4, x1: r + 7.6, z1: s + 7.6 });
    }
  }
  // Fire hydrants: squat red cylinders with caps, near corners.
  const hydMat = lam(0xc02020);
  for (const r of ROAD_LINES) {
    for (const s of [-180, -36, 108, 252]) {
      if (!rng.chance(0.6)) continue;
      const hx = r + 8;
      const hz = s + rng.range(-4, 4);
      group.add(cyl(0.28, 0.32, 0.9, hydMat, hx, 0.45, hz, 8));
      const hydCap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), hydMat);
      hydCap.position.set(hx, 0.95, hz);
      group.add(hydCap);
      colliders.push({ x0: hx - 0.4, z0: hz - 0.4, x1: hx + 0.4, z1: hz + 0.4 });
    }
  }
  // Bus stops: shelter roof + bench + sign, on the main avenues.
  for (const [sx, sz] of [[-36, 108], [36, -108], [108, 36], [-108, -36], [180, 180], [-180, 180]]) {
    const shelter = new THREE.Group();
    shelter.add(box(5, 0.25, 2.2, lam(0x2e8a6a), 0, 2.6, 0));
    for (const px of [-2.2, 2.2]) shelter.add(box(0.15, 2.6, 0.15, poleMat, px, 1.3, -0.9));
    shelter.add(box(4.4, 0.5, 0.8, lam(0x8a6a3a), 0, 0.7, -0.6));
    const bsign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: signTexture('BUS', '#7cff6a') }));
    bsign.position.set(0, 3.4, 0);
    shelter.add(bsign);
    shelter.position.set(sx + 9, 0, sz);
    group.add(shelter);
  }
  // Traffic lights at the four central intersections.
  for (const [tx, tz] of [[-36, -36], [36, 36], [-36, 108], [108, -36]]) {
    const tPole = cyl(0.12, 0.14, 5.5, poleMat, tx + 7, 2.75, tz + 7, 6);
    group.add(tPole);
    const housing = box(0.7, 1.8, 0.5, trimMat, tx + 7, 5.6, tz + 7);
    group.add(housing);
    for (let i = 0; i < 3; i++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshBasicMaterial({ color: [0xff2020, 0xffd24a, 0x30d060][i] }));
      dot.position.set(tx + 7, 6.15 - i * 0.55, tz + 7.28);
      group.add(dot);
    }
  }
  // Billboards at street level along the main avenues, facing the road.
  const bbWords = [['SOLMAR', '#ff2ea6', '#1a1026'], ['CASINO', '#ffd24a', '#241a08'],
    ['TACOS', '#ff5a3c', '#2a0e08'], ['HOTEL', '#22e6ff', '#081826']];
  const bbSpots = [[-36, -144], [36, 144], [108, -36], [-108, 36], [180, -180], [-180, 180], [252, 72], [-252, -72]];
  for (let i = 0; i < bbSpots.length; i++) {
    const [bx, bz] = bbSpots[i];
    const [word, fg, bg] = bbWords[i % bbWords.length];
    const board = new THREE.Mesh(new THREE.PlaneGeometry(15, 7.5),
      new THREE.MeshBasicMaterial({ map: billboardTexture(word, bg, fg) }));
    board.position.set(bx + 8.6, 7.5, bz);
    board.rotation.y = -Math.PI / 2; // face the avenue
    group.add(board);
    group.add(box(0.6, 4, 0.6, poleMat, bx + 8.6, 2, bz - 6));
    group.add(box(0.6, 4, 0.6, poleMat, bx + 8.6, 2, bz + 6));
  }

  // Marina boats: simple hulls bobbing near the docks.
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const hullMat2 = new THREE.MeshLambertMaterial({ color: 0x2e6f8e });
  for (let i = 0; i < 6; i++) {
    const bx = -240 + i * 18;
    const boat = new THREE.Group();
    const hull = box(4, 1.2, 10, i % 2 ? hullMat : hullMat2, 0, 0.4, 0);
    boat.add(hull);
    boat.add(box(2.4, 1.6, 3, hullMat, 0, 1.8, -1));
    boat.position.set(bx, -0.2, 360 + (i % 2) * 14);
    boat.rotation.y = rng.range(-0.2, 0.2);
    boat.name = 'boat';
    group.add(boat);
  }

  // ---- distant skyline ring: hazy silhouettes so no view ends in void --
  // Pushed far out (420-520m), kept short, and coloured close to the
  // dusk sky itself — at 40-60% fog they melt into soft pink-grey
  // shapes instead of reading as huge dark slabs parked past the edge.
  const skyMat = new THREE.MeshLambertMaterial({ color: 0x9a7a9a });
  const skyMat2 = new THREE.MeshLambertMaterial({ color: 0x8a6a8a });
  const skyline = new THREE.Group();
  skyline.name = 'skyline';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + rng.range(-0.06, 0.06);
    // Skip the southern bay sector: the sea horizon stays open there.
    if (a > Math.PI * 0.28 && a < Math.PI * 0.72) continue;
    const r = rng.range(420, 520);
    const w = rng.range(18, 30);
    const h = rng.range(25, 60);
    const sx = Math.cos(a) * r;
    const sz = Math.sin(a) * r + 40;
    const tower = box(w, h, w, i % 2 ? skyMat : skyMat2, sx, h / 2 - 1, sz);
    skyline.add(tower);
    // Spire or rooftop beacon on the tallest silhouettes.
    if (h > 50) {
      skyline.add(cyl(0.4, 0.8, 16, skyMat2, sx, h + 7, sz, 6));
      const bk = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff3040 }));
      bk.position.set(sx, h + 16, sz);
      skyline.add(bk);
    }
  }
  group.add(skyline);

  // ---- sunset glow planes on the east + north horizons ------------------
  // Big soft radial gradients, additive, so the dusk sky burns warm
  // ahead of the chase camera (east) and the race camera (north).
  const glowMatE = new THREE.MeshBasicMaterial({
    map: glowTexture('rgba(255,190,90,0.95)', 'rgba(255,110,70,0.55)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fog: false,
  });
  const glowE = new THREE.Mesh(new THREE.PlaneGeometry(560, 210), glowMatE);
  glowE.position.set(430, 55, 0);
  glowE.rotation.y = -Math.PI / 2;
  group.add(glowE);
  const glowMatN = new THREE.MeshBasicMaterial({
    map: glowTexture('rgba(255,170,110,0.8)', 'rgba(200,90,160,0.45)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fog: false,
  });
  const glowN = new THREE.Mesh(new THREE.PlaneGeometry(560, 190), glowMatN);
  glowN.position.set(0, 48, -520);
  group.add(glowN);
  // Low sun disc low in the west, behind the player at golden hour.
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false }));
  sunDisc.position.set(-430, 42, 60);
  sunDisc.rotation.y = Math.PI / 2;
  group.add(sunDisc);

  // ---- light rig: low warm sun + warm hemisphere + haze ------------------
  const sun = new THREE.DirectionalLight(0xffb060, 2.6);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xffc890, 0x7a5a48, 1.15);
  scene.add(hemi);
  // Fill light from the south-east: the low western sun leaves the
  // south/east faces of towers in shade, and at golden hour those are
  // exactly the faces the chase and race cameras see. A weak warm fill
  // keeps them readable instead of flat black slabs.
  const fill = new THREE.DirectionalLight(0xffc0a0, 0.55);
  fill.position.set(150, 120, 150);
  scene.add(fill);
  scene.fog = new THREE.Fog(0xf0a870, 200, 620);

  // ---- shop markers: coloured light pillars + floating signs ----
  const shopMarkers = {};
  for (const shop of SHOPS) {
    const s = SPOTS[shop.spot];
    const marker = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: shop.color, transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    pillar.position.y = 13;
    marker.add(pillar);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.2, 24),
      new THREE.MeshBasicMaterial({ color: shop.color, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    marker.add(ring);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 4.5),
      new THREE.MeshBasicMaterial({ map: signTexture(shop.name.toUpperCase(), '#' + shop.color.toString(16).padStart(6, '0')) }),
    );
    label.position.y = 12;
    marker.add(label);
    marker.position.set(s.x, 0, s.z);
    marker.userData.spinLabel = label;
    group.add(marker);
    shopMarkers[shop.id] = marker;
  }

  /** Day/night: hours 0-24. Returns {isNight, darkness 0..1}. */
  function updateDayNight(hours) {
    const t = ((hours % 24) + 24) % 24;
    // Sun elevation: peaks at 12:30, below horizon ~19:30-05:30.
    // The day curve is deliberately generous: 18:45 is still bright
    // golden hour (orange-pink dusk), and only ~22:30 is full night.
    // The old curve had 18:45 half-night already, which is why every
    // dusk shot came out murky mauve-grey instead of warm gold.
    const sunA = ((t - 5.5) / 14) * Math.PI;
    const elev = Math.sin(sunA);
    const day = clamp(elev * 2.2 + 0.45, 0, 1);
    const dusk = clamp(1 - Math.abs(elev) * 2.2, 0, 1) * (elev > -0.15 ? 1 : 0);
    const night = 1 - day;
    // Sky colour: warm day blue -> golden-hour orange-pink -> night deep
    // indigo. The dusk blend is deliberately saturated: the reference
    // shots are orange / pink / purple, never murky grey.
    const skyDay = new THREE.Color(0x7fb2e0);
    const skyDusk = new THREE.Color(0xf07040);
    const skyDusk2 = new THREE.Color(0xc04a8a);
    const skyNight = new THREE.Color(0x0c1226);
    const sky = skyDay.clone().lerp(skyDusk, dusk * 0.9)
      .lerp(skyDusk2, dusk * 0.35).lerp(skyNight, night * 0.85);
    scene.background = sky;
    scene.fog.color.copy(sky).lerp(new THREE.Color(0xff9a5c), dusk * 0.35);
    sun.intensity = 0.3 + day * 2.4;
    sun.color.setHex(dusk > 0.4 ? 0xff9040 : 0xffc080);
    sun.position.set(Math.cos(sunA) * 200, Math.max(20, elev * 220), 80);
    hemi.intensity = 0.35 + day * 0.8;
    hemi.color.setHex(dusk > 0.4 ? 0xffb080 : 0xffc890);
    fill.intensity = 0.15 + day * 0.45;
    // Sunset glow planes burn brightest at golden hour, fade at night.
    glowMatE.opacity = clamp(1.15 - night, 0, 1) * (0.5 + dusk * 0.5);
    glowMatN.opacity = clamp(1.15 - night, 0, 1) * (0.4 + dusk * 0.4);
    sunDisc.material.color.setHex(dusk > 0.3 ? 0xffc080 : 0xffe8c0);
    sunDisc.visible = night < 0.85;
    // Lit windows glow at night.
    for (const m of facadeMats.values()) m.lit.emissiveIntensity = night * 0.9;
    for (const l of lamps) l.material = lampMat;
    return { isNight: night > 0.6, darkness: night, day };
  }

  return {
    group, colliders, shopMarkers, water, sun, hemi,
    updateDayNight, districtAt,
    roadLines: ROAD_LINES, blockCenters: BLOCK_CENTERS,
  };
}

/**
 * A low-poly palm: leaning trunk, a single ring of drooping fronds and
 * a coconut cluster. Fronds are flattened cones tilted outward so the
 * canopy reads as a palm from the street, not a pine. One ring of 7
 * keeps the mesh count down — palms line every avenue now.
 */
function addPalm(group, x, z, rng) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9a4a });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x2f7a3a });
  const palm = new THREE.Group();
  const lean = rng.range(-0.1, 0.1);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 6.5, 6), trunkMat);
  trunk.position.y = 3.25;
  trunk.rotation.z = lean;
  palm.add(trunk);
  // One ring of fronds, alternating tilt and green so the canopy has
  // depth without a second ring of meshes.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const droop = i % 2 === 0 ? 1.15 : 1.7;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.85, 3.6, 4),
      i % 2 === 0 ? leafMat : leafMat2);
    leaf.scale.set(1, 1, 0.35); // flatten into a frond blade
    leaf.position.set(Math.cos(a) * 1.5, droop > 1.4 ? 6.1 : 6.7, Math.sin(a) * 1.5);
    leaf.rotation.set(Math.sin(a) * droop, 0, -Math.cos(a) * droop);
    palm.add(leaf);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.38, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x6a4a28 }));
  nut.position.y = 6.2;
  palm.add(nut);
  palm.position.set(x, 0, z);
  group.add(palm);
}

/** A glowing beacon pillar + ground ring at (x, z), for missions/races. */
export function createBeacon(colorHex, radius = 3) {
  const g = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.3,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  pillar.position.y = 15;
  g.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.8, radius, 24),
    new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  g.add(ring);
  g.userData.pillar = pillar;
  return g;
}

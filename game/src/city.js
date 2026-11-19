// city.js — builds the 3D Solmar City: ground, road grid, buildings with
// lit windows, palms, streetlights, beach + bay, pier, neon signs and the
// shop markers. All geometry is low-poly Three.js primitives with procedural
// canvas textures — no external assets. Also owns the day/night cycle.
import * as THREE from '../lib/three.module.js';
import { DISTRICTS, SHOPS, SPOTS } from './data.js';
import { clamp, makeRng } from './util.js';

export const ROAD_LINES = [-252, -180, -108, -36, 36, 108, 180, 252];
export const BLOCK_CENTERS = [-216, -144, -72, 0, 72, 144, 216];

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

/** Canvas texture with a grid of windows; some lit warm. */
function windowTexture(rng, base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, 128, 10);
  for (let y = 18; y < 248; y += 22) {
    for (let x = 10; x < 118; x += 22) {
      const lit = rng.next() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : '#20242e';
      g.fillRect(x, y, 14, 16);
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
  g.font = 'bold 40px sans-serif';
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

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

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
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x6f8f5a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 120);
  group.add(ground);

  const slabMat = new THREE.MeshLambertMaterial({ color: 0x9a9a94 });
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(624, 624), slabMat);
  slab.rotation.x = -Math.PI / 2;
  slab.position.set(0, 0, 0);
  group.add(slab);

  // Roads: dark strips on both axes — wet asphalt that catches the light.
  const roadMat = new THREE.MeshPhongMaterial({
    color: 0x2e3138, shininess: 90, specular: 0x997788,
  });
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xd8c25a });
  for (const r of ROAD_LINES) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(12, 624), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(r, 0.02, 0);
    group.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(12, 624), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.02, r);
    group.add(h);
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

  // Beach sand + bay water (south edge, z > 300).
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xe0c890 });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(900, 60), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.01, 330);
  group.add(sand);
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x2a6f9e });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 300), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, 510);
  water.name = 'water';
  group.add(water);

  // Pier out into the bay at x = -108.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const pier = box(10, 1, 90, pierMat, -108, 0.6, 395);
  group.add(pier);
  for (let z = 360; z < 440; z += 18) {
    group.add(box(1, 3, 1, pierMat, -112, 0, z));
    group.add(box(1, 3, 1, pierMat, -104, 0, z));
  }

  // ---- buildings, one or two per block, seeded ----
  const buildingMats = new Map();
  const litMats = new Map();
  function matsFor(d) {
    const key = d.id;
    if (!buildingMats.has(key)) {
      const tex = windowTexture(rng, d.palette[0], d.neon ? 0.55 : 0.35);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const lit = new THREE.MeshLambertMaterial({
        map: tex, emissive: 0xffc46a, emissiveMap: tex, emissiveIntensity: 0,
      });
      buildingMats.set(key, mat);
      litMats.set(key, lit);
    }
    return { mat: buildingMats.get(key), lit: litMats.get(key) };
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const neonSigns = [];
  const signWords = ['NEON', 'SOLMAR', 'BAR', 'HOTEL', '24H', 'CLUB', 'PIER', 'BAY'];
  const signColors = ['#ff2ea6', '#22e6ff', '#ffd24a', '#7cff6a', '#ff5a3c'];

  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const d = districtAt(bx, bz);
      const { mat, lit } = matsFor(d);
      const n = rng.chance(0.35) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const w = rng.range(18, 34);
        const dep = rng.range(18, 34);
        const h = rng.range(d.height[0], d.height[1]);
        const ox = n === 1 ? 0 : (i === 0 ? -14 : 14);
        const oz = n === 1 ? 0 : (i === 0 ? -12 : 12);
        const x = bx + ox;
        const z = bz + oz;
        const useLit = d.neon || rng.chance(0.4);
        const b = box(w, h, dep, useLit ? lit : mat, x, h / 2, z);
        b.userData.isBuilding = true;
        group.add(b);
        group.add(box(w + 1, 0.8, dep + 1, roofMat, x, h + 0.4, z));
        // Rooftop box / antenna on tall towers.
        if (h > 30 && rng.chance(0.6)) {
          group.add(box(3, 6, 3, roofMat, x + w * 0.2, h + 3, z));
        }
        colliders.push({ x0: x - w / 2, z0: z - dep / 2, x1: x + w / 2, z1: z + dep / 2 });
        // Neon sign on tall Neon Row buildings.
        if (d.neon && h > 18 && rng.chance(0.7)) {
          const word = signWords[rng.int(0, signWords.length - 1)];
          const color = signColors[rng.int(0, signColors.length - 1)];
          const sm = new THREE.MeshBasicMaterial({ map: signTexture(word, color) });
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), sm);
          sign.position.set(x, h * 0.75, z + dep / 2 + 0.15);
          group.add(sign);
          neonSigns.push(sign);
        }
      }
      // Palm trees on the block corners (not inside buildings).
      if (rng.chance(0.75)) {
        const px = bx + rng.range(-26, 26);
        const pz = bz + rng.range(-26, 26);
        addPalm(group, px, pz, rng);
        colliders.push({ x0: px - 0.6, z0: pz - 0.6, x1: px + 0.6, z1: pz + 0.6 });
      }
    }
  }

  // Palms along the beach.
  for (let x = -280; x <= 280; x += 28) {
    if (rng.chance(0.7)) addPalm(group, x + rng.range(-6, 6), 312 + rng.range(-4, 6), rng);
  }

  // Streetlights at intersections.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343a });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lamps = [];
  for (const r of ROAD_LINES) {
    for (const s of [-252, -108, 36, 180]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
      pole.position.set(r + 7, 3.5, s + 7);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampMat);
      lamp.position.set(r + 7, 7.1, s + 7);
      lamp.name = 'lamp';
      group.add(lamp);
      lamps.push(lamp);
      colliders.push({ x0: r + 6.4, z0: s + 6.4, x1: r + 7.6, z1: s + 7.6 });
    }
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

  // ---- light rig: sun + hemisphere + ambient ----
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.2);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.9);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0xc8d8e8, 220, 700);

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
    // Sun elevation: peaks at 12:30, below horizon ~19:30-05:30, so 18:45
    // is golden hour (purple-pink dusk) and 22:30 is full night.
    const sunA = ((t - 5.5) / 14) * Math.PI;
    const elev = Math.sin(sunA);
    const day = clamp(elev * 1.6 + 0.25, 0, 1);
    const dusk = clamp(1 - Math.abs(elev) * 3, 0, 1) * (elev > -0.15 ? 1 : 0);
    const night = 1 - day;
    // Sky colour: day blue -> golden-hour purple-pink -> night deep blue.
    const skyDay = new THREE.Color(0x87b5e0);
    const skyDusk = new THREE.Color(0xc65a9e);
    const skyNight = new THREE.Color(0x0c1226);
    const sky = skyDay.clone().lerp(skyDusk, dusk * 0.9).lerp(skyNight, night);
    scene.background = sky;
    scene.fog.color.copy(sky);
    sun.intensity = 0.25 + day * 2.0;
    sun.color.setHex(dusk > 0.4 ? 0xff8ab0 : 0xffe0b0);
    sun.position.set(Math.cos(sunA) * 200, Math.max(20, elev * 220), 80);
    hemi.intensity = 0.25 + day * 0.7;
    // Lit windows glow at night.
    for (const m of litMats.values()) m.emissiveIntensity = night * 0.85;
    for (const l of lamps) l.material = lampMat;
    return { isNight: night > 0.6, darkness: night, day };
  }

  return {
    group, colliders, shopMarkers, water, sun, hemi,
    updateDayNight, districtAt,
    roadLines: ROAD_LINES, blockCenters: BLOCK_CENTERS,
  };
}

/** A low-poly palm: leaning trunk + cone leaves. */
function addPalm(group, x, z, rng) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3f });
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 6, 6), trunkMat);
  trunk.position.y = 3;
  trunk.rotation.z = rng.range(-0.08, 0.08);
  palm.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.1, 6.2, Math.sin(a) * 1.1);
    leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
    palm.add(leaf);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x6a4a28 }));
  nut.position.y = 5.9;
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

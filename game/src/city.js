// city.js — Solmar City: map generation, road network, collision and drawing.
// The city is a hand-tuned grid of avenues and streets with named districts,
// parks, a beach and a bay along the south edge. Generation is seeded, so
// the same seed always builds the same city (screenshots stay deterministic).
import { makeRng, clamp } from './util.js';

export const CITY_W = 3600;
export const CITY_H = 2600;

const ROOF_COLORS = [
  '#c98f5f', '#b07a4e', '#8fa3b8', '#a8b6c4', '#d9a05b', '#7fa08a',
  '#c46a5a', '#9a8fc0', '#e0c184', '#6f8f7a', '#b8b0a0', '#d08a7a',
];
const WALL_COLORS = [
  '#e8d9b8', '#d9c2a3', '#c9b8a8', '#b8c4d0', '#e0b890', '#a8b8a0',
  '#d8a890', '#c0b0c8', '#e8d0a0', '#98a898', '#d0c0b0', '#e0c0a8',
];
const DISTRICTS = [
  { name: 'PALM COURT', x: 0, y: 0, w: 1150, h: 950, tint: '#f2c14e' },
  { name: 'NEON ROW', x: 1150, y: 0, w: 1150, h: 950, tint: '#ff5fa2' },
  { name: 'OLD HARBOR', x: 2300, y: 0, w: 1300, h: 950, tint: '#5fb8ff' },
  { name: 'SOLMAR PLAZA', x: 0, y: 950, w: 1150, h: 1050, tint: '#7fe0a8' },
  { name: 'MARINA DISTRICT', x: 1150, y: 950, w: 1150, h: 1050, tint: '#ffd25f' },
  { name: 'CACTUS FLATS', x: 2300, y: 950, w: 1300, h: 1050, tint: '#ff8a5f' },
];
const LANDMARKS = [
  { name: 'Solmar Tower', bx: 1, by: 2, w: 150, h: 130 },
  { name: 'Grand Marina Hotel', bx: 4, by: 3, w: 170, h: 110 },
  { name: 'Neon Casino', bx: 3, by: 1, w: 160, h: 120 },
  { name: 'Harbor Market', bx: 6, by: 1, w: 150, h: 110 },
  { name: 'City Hall', bx: 1, by: 4, w: 140, h: 120 },
  { name: 'Bayview Arena', bx: 5, by: 5, w: 180, h: 130 },
];

export function createCity(seed) {
  const rng = makeRng(seed);
  const roadsV = [320, 720, 1120, 1520, 1920, 2320, 2720, 3120];
  const roadsH = [260, 620, 980, 1340, 1700, 2060, 2320];
  const roadW = 96;
  const buildings = [];
  const parks = [];

  // Blocks sit between neighbouring roads. Each block gets either a row
  // of buildings, a park, or a plaza, decided by the seeded rng.
  for (let bi = 0; bi < roadsV.length - 1; bi++) {
    for (let bj = 0; bj < roadsH.length - 1; bj++) {
      const x0 = roadsV[bi] + roadW / 2 + 14;
      const x1 = roadsV[bi + 1] - roadW / 2 - 14;
      const y0 = roadsH[bj] + roadW / 2 + 14;
      const y1 = roadsH[bj + 1] - roadW / 2 - 14;
      const roll = rng.next();
      if (roll < 0.16) {
        // Park with scattered palm trees.
        const trees = [];
        const n = rng.int(6, 12);
        for (let t = 0; t < n; t++) {
          trees.push({ x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20), r: rng.range(7, 12) });
        }
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, trees });
        continue;
      }
      if (roll < 0.24) {
        // Open plaza: benches and a fountain, no buildings.
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, plaza: true, trees: [] });
        continue;
      }
      // Buildings: split the block into 1-3 lots along its long side.
      const horizontal = (x1 - x0) > (y1 - y0);
      const lots = rng.int(1, 3);
      for (let l = 0; l < lots; l++) {
        const t0 = l / lots;
        const t1 = (l + 1) / lots;
        const pad = 10;
        const bx = horizontal ? x0 + (x1 - x0) * t0 + pad : x0 + pad;
        const by = horizontal ? y0 + pad : y0 + (y1 - y0) * t0 + pad;
        const bw = horizontal ? (x1 - x0) * (t1 - t0) - pad * 2 : (x1 - x0) - pad * 2;
        const bh = horizontal ? (y1 - y0) - pad * 2 : (y1 - y0) * (t1 - t0) - pad * 2;
        if (bw < 50 || bh < 50) continue;
        const ci = rng.int(0, ROOF_COLORS.length - 1);
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          roof: ROOF_COLORS[ci], wall: WALL_COLORS[ci],
          tall: rng.chance(0.22), name: null,
        });
      }
    }
  }

  // Named landmarks overwrite the generic building nearest their block.
  for (const lm of LANDMARKS) {
    const cx = roadsV[lm.bx] + (roadsV[lm.bx + 1] - roadsV[lm.bx]) / 2;
    const cy = roadsH[lm.by] + (roadsH[lm.by + 1] - roadsH[lm.by]) / 2;
    let best = null;
    let bestD = Infinity;
    for (const b of buildings) {
      const d = Math.abs(b.x + b.w / 2 - cx) + Math.abs(b.y + b.h / 2 - cy);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) {
      best.name = lm.name;
      best.tall = true;
      best.w = Math.min(best.w, lm.w);
      best.h = Math.min(best.h, lm.h);
      best.x = clamp(cx - best.w / 2, best.x, best.x + 40);
      best.y = clamp(cy - best.h / 2, best.y, best.y + 40);
    }
  }

  return {
    seed, W: CITY_W, H: CITY_H,
    roadsV, roadsH, roadW,
    buildings, parks, districts: DISTRICTS,
    water: { x: 0, y: 2380, w: CITY_W, h: CITY_H - 2380 },
    beach: { x: 0, y: 2320, w: CITY_W, h: 60 },
    spawn: { x: 720, y: 620 },
    plaza: { x: 560, y: 1060, w: 260, h: 200 },
  };
}

// ---- geometry helpers -------------------------------------------------

export function isOnRoad(city, x, y) {
  for (const rx of city.roadsV) {
    if (Math.abs(x - rx) < city.roadW / 2) return true;
  }
  for (const ry of city.roadsH) {
    if (Math.abs(y - ry) < city.roadW / 2) return true;
  }
  return false;
}

export function roadPoint(city, rng) {
  if (rng.chance(0.5)) {
    const rx = rng.pick(city.roadsV);
    return { x: rx + rng.range(-28, 28), y: rng.range(80, city.H - 120) };
  }
  const ry = rng.pick(city.roadsH);
  return { x: rng.range(80, city.W - 80), y: ry + rng.range(-28, 28) };
}

export function sidewalkPoint(city, rng) {
  const p = roadPoint(city, rng);
  return { x: p.x + rng.range(-70, 70), y: p.y + rng.range(-70, 70) };
}

export function buildingAt(city, x, y, pad = 0) {
  for (const b of city.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
  }
  return null;
}

// Push a circle entity out of any building it overlaps. Returns the
// building hit (or null) so callers can react (bounce, damage, sound).
export function resolveBuildingCollision(city, ent, radius) {
  let hit = null;
  for (const b of city.buildings) {
    const cx = clamp(ent.x, b.x, b.x + b.w);
    const cy = clamp(ent.y, b.y, b.y + b.h);
    const dx = ent.x - cx;
    const dy = ent.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      hit = b;
      if (d2 > 0.001) {
        const d = Math.sqrt(d2);
        ent.x = cx + (dx / d) * radius;
        ent.y = cy + (dy / d) * radius;
      } else {
        ent.y = b.y - radius;
      }
    }
  }
  return hit;
}

export function inWater(city, x, y) {
  const w = city.water;
  return x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h;
}

// ---- drawing -----------------------------------------------------------

export function drawCity(ctx, city, cam) {
  const { x: vx, y: vy, w: vw, h: vh } = cam.view;
  ctx.fillStyle = '#b8a06a';
  ctx.fillRect(vx, vy, vw, vh);

  // Ground: warm sand-toned blocks with subtle checker variation.
  ctx.fillStyle = '#c9b183';
  for (let gx = Math.floor(vx / 240) * 240; gx < vx + vw; gx += 240) {
    for (let gy = Math.floor(vy / 240) * 240; gy < vy + vh; gy += 240) {
      if (((gx + gy) / 240) % 2 === 0) ctx.fillRect(gx, gy, 240, 240);
    }
  }

  // Bay water + beach along the south edge.
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(city.water.x, city.water.y, city.water.w, city.water.h);
  ctx.fillStyle = '#3f96cc';
  for (let wx = 0; wx < city.W; wx += 180) {
    ctx.fillRect(wx + ((wx / 180) % 2) * 60, city.water.y + 26, 90, 5);
    ctx.fillRect(wx + 40, city.water.y + 74, 120, 4);
  }
  ctx.fillStyle = '#e8d9a8';
  ctx.fillRect(city.beach.x, city.beach.y, city.beach.w, city.beach.h);
  ctx.fillStyle = '#d9c48e';
  for (let bx = 30; bx < city.W; bx += 120) ctx.fillRect(bx, city.beach.y + 18, 26, 8);

  // Parks and plazas.
  for (const p of city.parks) {
    if (p.x > vx + vw || p.x + p.w < vx || p.y > vy + vh || p.y + p.h < vy) continue;
    ctx.fillStyle = p.plaza ? '#d8cba8' : '#7fae62';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    if (!p.plaza) {
      ctx.fillStyle = '#8fbf72';
      ctx.fillRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);
    } else {
      ctx.fillStyle = '#5fa8c8';
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8f4f8';
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const t of p.trees) {
      ctx.fillStyle = '#5d8a48';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a5a34';
      ctx.fillRect(t.x - 2, t.y + t.r - 4, 4, 8);
    }
  }

  // Roads: dark asphalt, edge lines, dashed centre lines.
  ctx.fillStyle = '#3a3a40';
  for (const rx of city.roadsV) ctx.fillRect(rx - city.roadW / 2, 0, city.roadW, city.H);
  for (const ry of city.roadsH) ctx.fillRect(0, ry - city.roadW / 2, city.W, city.roadW);
  ctx.fillStyle = '#2c2c32';
  for (const rx of city.roadsV) {
    ctx.fillRect(rx - city.roadW / 2, 0, 4, city.H);
    ctx.fillRect(rx + city.roadW / 2 - 4, 0, 4, city.H);
  }
  for (const ry of city.roadsH) {
    ctx.fillRect(0, ry - city.roadW / 2, city.W, 4);
    ctx.fillRect(0, ry + city.roadW / 2 - 4, city.W, 4);
  }
  ctx.fillStyle = '#e8d44f';
  for (const rx of city.roadsV) {
    for (let y = Math.floor(vy / 48) * 48; y < vy + vh; y += 48) ctx.fillRect(rx - 2, y, 4, 24);
  }
  for (const ry of city.roadsH) {
    for (let x = Math.floor(vx / 48) * 48; x < vx + vw; x += 48) ctx.fillRect(x, ry - 2, 24, 4);
  }

  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(240,240,230,0.85)';
  for (const rx of city.roadsV) {
    for (const ry of city.roadsH) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(rx + i * 12 - 4, ry - city.roadW / 2 + 6, 8, 14);
        ctx.fillRect(rx + i * 12 - 4, ry + city.roadW / 2 - 20, 8, 14);
      }
    }
  }

  // Buildings: wall, roof inset, shadow, landmark labels.
  for (const b of city.buildings) {
    if (b.x > vx + vw || b.x + b.w < vx || b.y > vy + vh || b.y + b.h < vy) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, 10);
    if (b.tall) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let wx = b.x + 18; wx < b.x + b.w - 14; wx += 22) {
        for (let wy = b.y + 20; wy < b.y + b.h - 14; wy += 22) ctx.fillRect(wx, wy, 10, 8);
      }
    }
    if (b.name) {
      ctx.fillStyle = 'rgba(20,20,30,0.75)';
      ctx.font = 'bold 13px sans-serif';
      const tw = ctx.measureText(b.name).width;
      ctx.fillRect(b.x + b.w / 2 - tw / 2 - 6, b.y + b.h / 2 - 11, tw + 12, 20);
      ctx.fillStyle = '#ffe9a8';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2 + 4);
      ctx.textAlign = 'left';
    }
  }

  // District names, faint and large, painted on the ground.
  ctx.font = 'bold 34px sans-serif';
  ctx.fillStyle = 'rgba(60,40,20,0.20)';
  ctx.textAlign = 'center';
  for (const d of DISTRICTS) {
    ctx.fillText(d.name, d.x + d.w / 2, d.y + d.h - 40);
  }
  ctx.textAlign = 'left';
}

export function drawMinimapBase(ctx, city, x, y, size) {
  const sx = size / city.W;
  const sy = size / city.H;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(12,16,24,0.82)';
  ctx.fillRect(0, 0, size, size * (city.H / city.W));
  const mh = size * (city.H / city.W);
  ctx.fillStyle = '#3f6a8a';
  ctx.fillRect(0, mh - 8, size, 8);
  ctx.fillStyle = '#c9b183';
  ctx.fillRect(0, 0, size, mh);
  ctx.fillStyle = '#3a3a40';
  for (const rx of city.roadsV) ctx.fillRect(rx * sx - 2, 0, 4, mh);
  for (const ry of city.roadsH) ctx.fillRect(0, ry * sy, size, 4);
  ctx.fillStyle = '#7fae62';
  for (const p of city.parks) ctx.fillRect(p.x * sx, p.y * sy, p.w * sx, p.h * sy);
  ctx.restore();
  return { sx, sy, h: mh };
}

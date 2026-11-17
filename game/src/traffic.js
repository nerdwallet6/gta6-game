// traffic.js — the living city: traffic cars that follow the road grid
// and pedestrians who stroll the sidewalks and flee from danger.
import { makeRng, clamp, dist, angleTo, angleLerp } from './util.js';
import { roadPoint, sidewalkPoint, resolveBuildingCollision } from './city.js';
import { createCar, collideCars } from './vehicles.js';

const PED_COLORS = ['#e05a5a', '#5a8ae0', '#5ad08a', '#e0a05a', '#a05ad0', '#d0d0d0', '#e08ab0'];
const PED_SHIRTS = ['#d04040', '#3f7fd0', '#4aa864', '#c0a040', '#8a5fc0', '#606060', '#c06090'];

export function createTraffic(G, count) {
  const rng = makeRng(G.seed + 77);
  const cars = [];
  for (let i = 0; i < count; i++) {
    const p = roadPoint(G.city, rng);
    const vertical = rng.chance(0.5);
    const car = createCar(p.x, p.y, { driver: 'npc' });
    car.speed = rng.range(70, 150);
    if (vertical) {
      car.route = { axis: 'v', line: nearestRoad(G.city.roadsV, p.x), dir: rng.chance(0.5) ? 1 : -1 };
      car.angle = car.route.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.x = car.route.line + (car.route.dir > 0 ? 22 : -22);
    } else {
      car.route = { axis: 'h', line: nearestRoad(G.city.roadsH, p.y), dir: rng.chance(0.5) ? 1 : -1 };
      car.angle = car.route.dir > 0 ? 0 : Math.PI;
      car.y = car.route.line + (car.route.dir > 0 ? 22 : -22);
    }
    cars.push(car);
  }
  return cars;
}

function nearestRoad(roads, v) {
  let best = roads[0];
  let bestD = Infinity;
  for (const r of roads) {
    const d = Math.abs(r - v);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

export function createParkedCars(G, count) {
  const rng = makeRng(G.seed + 78);
  const cars = [];
  let tries = 0;
  while (cars.length < count && tries < count * 20) {
    tries++;
    const p = roadPoint(G.city, rng);
    const vertical = rng.chance(0.5);
    const car = createCar(p.x, p.y, { driver: 'parked' });
    if (vertical) {
      car.angle = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
      car.x = nearestRoad(G.city.roadsV, p.x) + (rng.chance(0.5) ? 36 : -36);
    } else {
      car.angle = rng.chance(0.5) ? 0 : Math.PI;
      car.y = nearestRoad(G.city.roadsH, p.y) + (rng.chance(0.5) ? 36 : -36);
    }
    // Keep parked cars clear of the spawn and of each other.
    if (dist(car.x, car.y, G.city.spawn.x, G.city.spawn.y) < 220) continue;
    if (cars.some((c) => dist(c.x, c.y, car.x, car.y) < 70)) continue;
    cars.push(car);
  }
  return cars;
}

export function updateTraffic(G, dt) {
  const city = G.city;
  for (const car of G.trafficCars) {
    if (!car.route) continue;
    // Drive along the route line; at an intersection, maybe turn.
    const targetSpeed = 110;
    const ahead = carAhead(G, car);
    const want = ahead ? Math.max(0, ahead - 40) : targetSpeed;
    car.speed += clamp(want - car.speed, -260 * dt, 200 * dt);
    const step = car.speed * dt;
    if (car.route.axis === 'v') {
      car.y += car.route.dir * step;
      car.x += (car.route.line + (car.route.dir > 0 ? 22 : -22) - car.x) * Math.min(1, dt * 3);
      car.angle = angleLerp(car.angle, car.route.dir > 0 ? Math.PI / 2 : -Math.PI / 2, dt * 4);
      const next = nextIntersection(city.roadsH, car.y, car.route.dir);
      if (next !== null && Math.abs(car.y - next) < Math.abs(step) + 2) {
        maybeTurn(G, car, 'v', next);
      }
      if (car.y < 60 || car.y > city.H - 60) car.route.dir *= -1;
    } else {
      car.x += car.route.dir * step;
      car.y += (car.route.line + (car.route.dir > 0 ? 22 : -22) - car.y) * Math.min(1, dt * 3);
      car.angle = angleLerp(car.angle, car.route.dir > 0 ? 0 : Math.PI, dt * 4);
      const next = nextIntersection(city.roadsV, car.x, car.route.dir);
      if (next !== null && Math.abs(car.x - next) < Math.abs(step) + 2) {
        maybeTurn(G, car, 'h', next);
      }
      if (car.x < 60 || car.x > city.W - 60) car.route.dir *= -1;
    }
    // Keep traffic out of buildings (should not happen on roads, but be safe).
    resolveBuildingCollision(city, car, car.len * 0.4);
  }
  // Car-car bumps.
  const all = [...G.trafficCars, ...G.cars];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (a.driver === 'player' || b.driver === 'player') continue;
      if (Math.abs(a.x - b.x) > 90 || Math.abs(a.y - b.y) > 90) continue;
      collideCars(a, b);
    }
  }
  // The player's car bumps traffic too (ramming slows both).
  if (G.player.car) {
    for (const t of G.trafficCars) {
      if (collideCars(G.player.car, t)) {
        G.player.car.speed *= 0.75;
        if (Math.abs(G.player.car.speed) > 200) G.audio.sfx('hit');
      }
    }
  }
}

function carAhead(G, car) {
  // Distance to the nearest car in front on the same route line.
  let best = Infinity;
  for (const other of [...G.trafficCars, ...G.cars]) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = car.route.axis === 'v'
      ? dy * car.route.dir
      : dx * car.route.dir;
    const lateral = car.route.axis === 'v' ? Math.abs(dx) : Math.abs(dy);
    if (forward > 0 && forward < best && lateral < 26) best = forward;
  }
  return best === Infinity ? 0 : best;
}

function nextIntersection(roads, pos, dir) {
  let best = null;
  for (const r of roads) {
    const d = (r - pos) * dir;
    if (d > 4 && (best === null || d < best)) best = r;
  }
  return best;
}

function maybeTurn(G, car, axis, at) {
  if (Math.random() > 0.3) return; // 30% chance to turn at each crossing
  const city = G.city;
  if (axis === 'v') {
    car.y = at;
    const line = nearestRoad(city.roadsH, at);
    car.route = { axis: 'h', line, dir: Math.random() < 0.5 ? 1 : -1 };
    car.y = line + (car.route.dir > 0 ? 22 : -22);
  } else {
    car.x = at;
    const line = nearestRoad(city.roadsV, at);
    car.route = { axis: 'v', line, dir: Math.random() < 0.5 ? 1 : -1 };
    car.x = line + (car.route.dir > 0 ? 22 : -22);
  }
}

// ---- pedestrians ------------------------------------------------------

export function createPedestrians(G, count) {
  const rng = makeRng(G.seed + 79);
  const peds = [];
  for (let i = 0; i < count; i++) {
    const p = sidewalkPoint(G.city, rng);
    peds.push(makePed(p.x, p.y, rng));
  }
  return peds;
}

function makePed(x, y, rng) {
  const i = rng.int(0, PED_COLORS.length - 1);
  return {
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: rng.range(45, 80),
    color: PED_COLORS[i],
    shirt: PED_SHIRTS[i],
    panic: 0,
    flee: false,
    fleeX: 0, fleeY: 0,
    wanderT: rng.range(0, 4),
    target: null,
    walkPhase: rng.range(0, 6),
  };
}

export function updatePedestrians(G, dt) {
  for (const ped of G.peds) {
    ped.walkPhase += dt * 8;
    if (ped.panic > 0) ped.panic -= dt;
    const danger = G.combat.lastShot;
    if (danger && dist(ped.x, ped.y, danger.x, danger.y) < 320) {
      ped.flee = true;
      ped.fleeX = ped.x + (ped.x - danger.x);
      ped.fleeY = ped.y + (ped.y - danger.y);
      ped.panic = 3;
    }
    if (G.wanted >= 3 && dist(ped.x, ped.y, G.player.x, G.player.y) < 260) {
      ped.flee = true;
      ped.fleeX = ped.x * 2 - G.player.x;
      ped.fleeY = ped.y * 2 - G.player.y;
      ped.panic = 2;
    }
    let tx;
    let ty;
    let spd = ped.speed;
    if (ped.flee || ped.panic > 0) {
      tx = ped.fleeX;
      ty = ped.fleeY;
      spd = ped.speed * 2.4;
      if (dist(ped.x, ped.y, tx, ty) < 60) { ped.flee = false; ped.panic = 0; }
    } else {
      ped.wanderT -= dt;
      if (!ped.target || ped.wanderT <= 0 || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 24) {
        const rng = Math.random;
        ped.target = {
          x: clamp(ped.x + (rng() - 0.5) * 500, 30, G.city.W - 30),
          y: clamp(ped.y + (rng() - 0.5) * 500, 30, G.city.H - 30),
        };
        ped.wanderT = 3 + rng() * 4;
      }
      tx = ped.target.x;
      ty = ped.target.y;
    }
    const a = angleTo(ped.x, ped.y, tx, ty);
    ped.angle = angleLerp(ped.angle, a, Math.min(1, dt * 5));
    ped.x += Math.cos(ped.angle) * spd * dt;
    ped.y += Math.sin(ped.angle) * spd * dt;
    ped.x = clamp(ped.x, 16, G.city.W - 16);
    ped.y = clamp(ped.y, 16, G.city.H - 16);
    resolveBuildingCollision(G.city, ped, 12);
  }
}

export function drawPedestrians(ctx, G) {
  for (const ped of G.peds) {
    const bob = Math.sin(ped.walkPhase) * 2.5;
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 7, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = '#2c2c34';
    ctx.fillRect(-6, -1 + bob, 4, 9);
    ctx.fillRect(2, -1 - bob, 4, 9);
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(0, -1, 6, 0, Math.PI * 2);
    ctx.fill();
    if (ped.panic > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, -16);
    }
    ctx.restore();
  }
}

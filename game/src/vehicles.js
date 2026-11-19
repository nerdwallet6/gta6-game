// vehicles.js — smoother low-poly cars built from primitives, arcade
// driving physics, traffic AI that follows the road grid, and parked cars.
// A car is a THREE.Group with a body, cabin, four spinning wheels,
// headlights and brake lights; state lives in userData-ish plain fields.
//
// Rebuild note: the old cars were plain boxes — a slab body, a glass
// cube cabin, flat light quads. They read as toy bricks from the chase
// camera. The new bodies are stepped and sloped: a low wide body, a
// narrower shoulder slab, a sloped hood and trunk deck, a raked
// windshield, a curved roof, half-torus wheel arches hugging the tyres,
// rounded sphere headlight lenses with a warm glow, a full-width tail
// bar, mirrors, grilles and (for the sport) a rear spoiler. The driving
// state, physics and traffic AI are unchanged.
import * as THREE from '../lib/three.module.min.js';
import { CAR_TYPES } from './data.js';
import { ROAD_LINES, nearestRoad } from './city.js';
import { angleDelta, clamp, dist2, makeRng, TAU } from './util.js';

function lam(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function gloss(color) {
  return new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0xbbbbbb });
}

let carSeq = 0;

/**
 * Build a car mesh + state. opts: type, color, police (bool).
 * State: x, z, heading (rad, 0 = +x), speed (m/s), steer, health,
 * driver ('player' | 'traffic' | 'police' | 'parked' | null),
 * upgrades {engine, armor}, group (THREE.Group).
 */
export function createCar(type = 'sedan', opts = {}) {
  const spec = CAR_TYPES[type] || CAR_TYPES.sedan;
  const color = opts.color !== undefined ? opts.color : spec.color;
  const g = new THREE.Group();
  g.name = 'car-' + (carSeq++);

  const bodyMat = gloss(color);
  const darkMat = lam(0x14181e);
  const glassMat = new THREE.MeshPhongMaterial({
    color: 0x2a3540, shininess: 160, specular: 0xffe0b0,
  });
  const chromeMat = lam(0xc8ccd2);

  // ---- body: stepped slabs + sloped hood/trunk so the silhouette flows --
  const isTruck = type === 'truck';
  const bodyLen = isTruck ? 4.8 : 4.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyLen, 0.6, 2), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  // Shoulder slab: narrower, sits on the body and softens the slab edge.
  const shoulder = new THREE.Mesh(new THREE.BoxGeometry(bodyLen - 0.5, 0.28, 1.9), bodyMat);
  shoulder.position.y = 0.95;
  g.add(shoulder);
  // Sloped hood: a thin panel tipped down toward the nose.
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 1.85), bodyMat);
  hood.position.set(bodyLen / 2 - 0.55, 0.98, 0);
  hood.rotation.z = -0.16;
  g.add(hood);
  // Sloped trunk deck at the rear.
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 1.85), bodyMat);
  trunk.position.set(-bodyLen / 2 + 0.45, 0.98, 0);
  trunk.rotation.z = 0.14;
  g.add(trunk);
  // Rounded nose + tail caps: squashed spheres that kill the sharp corners.
  for (const s of [1, -1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), bodyMat);
    cap.scale.set(0.7, 0.75, 2.3);
    cap.position.set(s * (bodyLen / 2 - 0.05), 0.55, 0);
    g.add(cap);
  }

  // ---- cabin: glass greenhouse, raked windshield, curved roof ------------
  if (isTruck) {
    // Truck cab sits forward; the bed takes the rear half.
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 1.85), glassMat);
    cab.position.set(1.2, 1.35, 0);
    g.add(cab);
    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 1.75), bodyMat);
    cabRoof.position.set(1.2, 1.78, 0);
    g.add(cabRoof);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 1.7), glassMat);
    shield.position.set(1.95, 1.3, 0);
    shield.rotation.z = -0.35;
    g.add(shield);
    // Open bed: low walls + two cargo crates with rounded tops.
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.12), bodyMat);
      wall.position.set(-1.1, 1.05, s * 0.94);
      g.add(wall);
    }
    const tailgate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 2), bodyMat);
    tailgate.position.set(-2.25, 1.05, 0);
    g.add(tailgate);
    const crateMat = lam(0x8a6a3a);
    const crate1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.2), crateMat);
    crate1.position.set(-1.4, 1.2, 0);
    g.add(crate1);
    const crate2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 1.0), lam(0x5a7a4a));
    crate2.position.set(-0.5, 1.12, 0.2);
    g.add(crate2);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.62, 1.75), glassMat);
    cabin.position.set(-0.25, 1.32, 0);
    g.add(cabin);
    // Raked windshield + rear glass: sloped panels from hood to roof.
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 1.65), glassMat);
    shield.position.set(0.95, 1.28, 0);
    shield.rotation.z = -0.5;
    g.add(shield);
    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 1.65), glassMat);
    rearGlass.position.set(-1.42, 1.28, 0);
    rearGlass.rotation.z = 0.45;
    g.add(rearGlass);
    // Roof: a low slab panel over the cabin with a thin darker drip
    // rail beneath it — from the chase camera it reads as a roof
    // panel, where the old dome read as a red ball on the cabin.
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.09, 1.55), bodyMat);
    roof.position.set(-0.25, 1.62, 0);
    g.add(roof);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 1.62), darkMat);
    rail.position.set(-0.25, 1.56, 0);
    g.add(rail);
    // Side mirrors.
    for (const s of [-1, 1]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.22), darkMat);
      mirror.position.set(0.75, 1.25, s * 1.02);
      g.add(mirror);
    }
  }

  // Grille + chrome strip on the nose.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 1.2), darkMat);
  grille.position.set(bodyLen / 2 + 0.02, 0.55, 0);
  g.add(grille);
  const chrome = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.5), chromeMat);
  chrome.position.set(bodyLen / 2 + 0.04, 0.78, 0);
  g.add(chrome);
  // Bumpers: thin bars with rounded end caps.
  for (const s of [1, -1]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 1.95), darkMat);
    bumper.position.set(s * (bodyLen / 2 + 0.08), 0.32, 0);
    g.add(bumper);
    for (const zs of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), darkMat);
      cap.position.set(s * (bodyLen / 2 + 0.08), 0.32, zs * 0.95);
      g.add(cap);
    }
  }
  // Exhaust tip at the rear.
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8), chromeMat);
  exhaust.rotation.z = Math.PI / 2;
  exhaust.position.set(-bodyLen / 2 - 0.1, 0.3, 0.6);
  g.add(exhaust);

  // Sport spoiler: a thin wing on two struts.
  if (type === 'sport') {
    for (const zs of [-0.6, 0.6]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), darkMat);
      strut.position.set(-1.85, 1.15, zs);
      g.add(strut);
    }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 1.9), bodyMat);
    wing.position.set(-1.9, 1.32, 0);
    wing.rotation.z = 0.08;
    g.add(wing);
  }

  // Police livery: white doors + light bar with rounded lenses.
  let lightBar = null;
  if (opts.police) {
    const doorMat = lam(0xf0f0f0);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.02), doorMat);
    door.position.set(0.1, 0.62, 0);
    g.add(door);
    // Push bar on the nose.
    const push = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 1.4), darkMat);
    push.position.set(bodyLen / 2 + 0.2, 0.55, 0);
    g.add(push);
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.scale.set(1.2, 0.7, 1);
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.scale.set(1.2, 0.7, 1);
    blue.position.x = 0.3;
    lightBar.add(red, blue);
    lightBar.position.set(-0.25, 1.78, 0);
    g.add(lightBar);
  }
  // Taxi sign + chequer band along the doors.
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.24, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffe040 }));
    sign.position.set(-0.25, 1.95, 0);
    g.add(sign);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const sq = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.02),
          new THREE.MeshBasicMaterial({ color: i % 2 ? 0x111111 : 0xffffff }));
        sq.position.set(-0.8 + i * 0.35, 0.62, s * 1.02);
        g.add(sq);
      }
    }
  }

  // Headlights: rounded glowing lenses + (sport) a full-width light bar.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const headlights = [];
  for (const z of [-0.68, 0.68]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), headMat);
    h.scale.set(0.6, 0.7, 1);
    h.position.set(bodyLen / 2 + 0.06, 0.62, z);
    g.add(h);
    headlights.push(h);
  }
  if (type === 'sport') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 1.45), headMat);
    bar.position.set(bodyLen / 2 + 0.05, 0.62, 0);
    g.add(bar);
  }
  // Taillights: a full-width red bar plus two brake lenses the game
  // flashes bright when braking (kept in `brakes` for syncCarMesh).
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 1.7),
    new THREE.MeshBasicMaterial({ color: 0xaa1818 }));
  tailBar.position.set(-bodyLen / 2 - 0.05, 0.62, 0);
  g.add(tailBar);
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x881111 });
  const brakes = [];
  for (const z of [-0.68, 0.68]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), brakeMat);
    b.scale.set(0.6, 0.7, 1);
    b.position.set(-bodyLen / 2 - 0.06, 0.62, z);
    g.add(b);
    brakes.push(b);
  }

  // Wheels: each wheel is a group (steer/spin) holding a cylinder tyre
  // with a hubcap disc, plus a dark half-torus wheel arch hugging it so
  // the tyre sits in a rounded wheel well instead of a square hole.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = lam(0x16181c);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 10);
  const hubMat = lam(0xb8bcc2);
  const archGeo = new THREE.TorusGeometry(0.48, 0.1, 6, 12, Math.PI);
  const archMat = lam(0x0e1013);
  const wheels = [];
  const wheelPos = [[1.45, -0.95], [1.45, 0.95], [-1.45, -0.95], [-1.45, 0.95]];
  for (const [wx, wz] of wheelPos) {
    const wg = new THREE.Group();
    wg.position.set(wx, 0.38, wz);
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    wg.add(w);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.x = Math.PI / 2;
    wg.add(hub);
    g.add(wg);
    wheels.push(wg);
    // Wheel arch: half-torus standing in the car's long plane, outer face.
    const arch = new THREE.Mesh(archGeo, archMat);
    arch.position.set(wx, 0.42, wz + (wz > 0 ? 0.06 : -0.06));
    g.add(arch);
  }

  // Blob shadow.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 2.6),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);

  // Smoke puffs when damaged (hidden until health is low).
  const smokeMat = new THREE.MeshBasicMaterial({
    color: 0x666666, transparent: true, opacity: 0.5,
  });
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), smokeMat);
  smoke.position.set(1.8, 1.1, 0);
  smoke.visible = false;
  g.add(smoke);

  const car = {
    id: g.name, type, spec, group: g, wheels, brakes, lightBar, smoke,
    headlightMeshes: headlights,
    x: 0, z: 0, heading: 0, speed: 0, steer: 0,
    health: 100, maxHealth: 100,
    driver: opts.driver || null, police: !!opts.police,
    color, upgrades: { engine: 0, armor: 0, nos: false },
    nos: 0, nosMax: 100, boosting: false,
    // traffic AI
    aiRoad: null, aiDir: 1, aiTurnAt: 0, aiStuck: 0,
    brake: false, headlights: false,
  };
  g.userData.car = car;
  return car;
}

/** Place the car mesh at its state position/heading. */
export function syncCarMesh(car) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = -car.heading;
  // Wheels spin with speed (around the axle = car-local Z); the front
  // wheels yaw with steering.
  const spin = car.speed * 0.016;
  car.wheels.forEach((wg, i) => {
    wg.rotation.z -= spin;
    if (i < 2) wg.rotation.y = -car.steer * 0.4;
  });
  car.brakes.forEach((b) => b.material.color.setHex(car.brake ? 0xff2020 : 0x881111));
  if (car.lightBar) {
    car.lightBar.visible = car.police;
    const t = performance.now() * 0.012;
    car.lightBar.children[0].material.color.setHex(Math.sin(t) > 0 ? 0xff2020 : 0x400000);
    car.lightBar.children[1].material.color.setHex(Math.sin(t) > 0 ? 0x101060 : 0x2040ff);
  }
  car.smoke.visible = car.health < 45;
  if (car.smoke.visible) {
    const s = 0.4 + Math.sin(performance.now() * 0.01) * 0.15;
    car.smoke.scale.set(s, s, s);
    car.smoke.position.y = 1.1 + Math.sin(performance.now() * 0.007) * 0.2;
  }
}

/** Top speed after engine upgrades. */
export function carTopSpeed(car) {
  return car.spec.top * (1 + car.upgrades.engine * 0.15);
}

/**
 * Arcade driving step for the player's car.
 * input: {fwd, back, left, right, brake, dt, slowmo}
 */
export function drivePlayerCar(car, input) {
  const dt = input.dt;
  if (car.health <= 0) {
    car.speed = 0;
    return;
  }
  const top = carTopSpeed(car);
  const accel = car.spec.accel * (input.slowmo ? 0.6 : 1);
  if (input.fwd) car.speed += accel * dt;
  if (input.back) car.speed -= accel * 0.8 * dt;
  // NOS boost: hold Shift while driving (needs the NOS kit + charge).
  // Boost pushes past the normal top speed and drains the tank.
  if (input.boost && car.upgrades.nos && car.nos > 0) {
    car.speed += accel * 1.6 * dt;
    car.nos = Math.max(0, car.nos - 35 * dt);
    car.boosting = true;
  } else {
    car.boosting = false;
    if (car.upgrades.nos) {
      car.nos = Math.min(car.nosMax || 100, (car.nos || 0) + 6 * dt);
    }
  }
  if (!input.fwd && !input.back) {
    // Engine drag + rolling resistance.
    car.speed -= Math.sign(car.speed) * 6 * dt;
    if (Math.abs(car.speed) < 0.4) car.speed = 0;
  }
  if (input.brake) {
    car.speed -= Math.sign(car.speed) * 30 * dt;
    if (Math.abs(car.speed) < 0.5) car.speed = 0;
  }
  car.speed = clamp(car.speed, -top * 0.45, car.boosting ? top * 1.35 : top);
  // Steering: sharper at low speed, gentler at high speed.
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const spd = Math.abs(car.speed);
  const turnRate = car.spec.grip * clamp(spd / 12, 0.15, 1);
  car.heading += car.steer * turnRate * dt * Math.sign(car.speed || 1) * (car.speed < 0 ? -1 : 1);
  car.x += Math.cos(car.heading) * car.speed * dt;
  car.z += Math.sin(car.heading) * car.speed * dt;
  car.brake = input.brake;
}

/** Damage the car; returns true if it just broke down. */
export function damageCar(car, amount) {
  if (car.health <= 0) return false;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.speed = 0;
    return true;
  }
  return false;
}

/**
 * Traffic AI: drive along a road line, turn at intersections, avoid
 * piling into the car ahead by slowing. cars: all cars to avoid.
 */
export function updateTrafficCar(car, dt, cars, rng) {
  if (car.driver !== 'traffic') return;
  if (car.aiRoad === null) {
    car.aiRoad = nearestRoad(car.x);
    car.aiDir = rng.chance(0.5) ? 1 : -1;
    car.heading = car.aiDir > 0 ? 0 : Math.PI;
  }
  const road = car.aiRoad;
  // Normalise heading to [0, 2PI) before deciding which axis we are on.
  const hNorm = ((car.heading % TAU) + TAU) % TAU;
  const along = hNorm < Math.PI / 2 || hNorm > (3 * Math.PI) / 2 ? 'x' : 'z';
  // Target speed with a gap check ahead.
  let target = 13;
  for (const other of cars) {
    if (other === car) continue;
    const d = dist2(car.x, car.z, other.x, other.z);
    if (d < 14) {
      // Roughly ahead?
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const ahead = dx * Math.cos(car.heading) + dz * Math.sin(car.heading);
      if (ahead > 0 && ahead < 16) target = 0;
    }
  }
  car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
  // Steer back onto the road line.
  const off = along === 'x' ? car.z - road : car.x - road;
  const wantHeading = along === 'x'
    ? (car.aiDir > 0 ? 0 : Math.PI) + clamp(-off * 0.06, -0.5, 0.5)
    : (car.aiDir > 0 ? Math.PI / 2 : -Math.PI / 2) + clamp(-off * 0.06, -0.5, 0.5);
  car.heading += angleDelta(car.heading, wantHeading) * Math.min(1, dt * 2.5);
  car.x += Math.cos(car.heading) * car.speed * dt;
  car.z += Math.sin(car.heading) * car.speed * dt;
  // Turn at an intersection sometimes; wrap at the city edge.
  const atCross = Math.abs(((along === 'x' ? car.x : car.z) % 72 + 72) % 72 - 36) < 2;
  if (atCross && rng.chance(dt * 0.25)) {
    // Swap axis: turn onto the crossing road.
    const cross = nearestRoad(along === 'x' ? car.z : car.x);
    if (along === 'x') {
      car.aiRoad = cross;
      car.aiDir = rng.chance(0.5) ? 1 : -1;
      car.heading = car.aiDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.aiRoad = cross;
      car.aiDir = rng.chance(0.5) ? 1 : -1;
      car.heading = car.aiDir > 0 ? 0 : Math.PI;
    }
  }
  if (car.x < -300 || car.x > 300 || car.z < -300 || car.z > 300) {
    // Wrap around the far side so traffic never runs dry.
    car.x = clamp(car.x, -296, 296);
    car.z = clamp(car.z, -296, 296);
    car.heading += Math.PI;
    car.aiRoad = nearestRoad(along === 'x' ? car.z : car.x);
  }
}

// Warm sunset-era paint jobs: coral, teal, cream and gold join the greys.
const PAINT_JOBS = [
  0x8a97a8, 0xd84040, 0x5a6e3a, 0xe8b93a, 0x3a5a8a, 0x8a3a6a,
  0xdddddd, 0x222222, 0xff7a4a, 0x2ab8a0, 0xf0e0c0, 0xc05a7a, 0x4a9a5a,
];

/** Scatter parked cars along road edges. Returns the cars. */
export function spawnParkedCars(rng, count = 24) {
  const cars = [];
  const types = ['sedan', 'sport', 'truck', 'taxi'];
  for (let i = 0; i < count; i++) {
    const type = types[rng.int(0, types.length - 1)];
    const car = createCar(type, {
      color: type === 'taxi' ? 0xe8b93a : PAINT_JOBS[rng.int(0, PAINT_JOBS.length - 1)],
      driver: 'parked',
    });
    const vertical = rng.chance(0.5);
    const road = ROAD_LINES[rng.int(0, ROAD_LINES.length - 1)];
    const along = ROAD_LINES[rng.int(0, ROAD_LINES.length - 1)];
    car.x = vertical ? road + 4.5 : along;
    car.z = vertical ? along : road + 4.5;
    car.heading = vertical ? Math.PI / 2 : 0;
    if (rng.chance(0.5)) car.heading += Math.PI;
    cars.push(car);
  }
  return cars;
}

/** Scatter moving traffic cars on the road grid. */
export function spawnTrafficCars(rng, count = 20) {
  const cars = [];
  const types = ['sedan', 'sedan', 'sport', 'truck', 'taxi'];
  for (let i = 0; i < count; i++) {
    const type = types[rng.int(0, types.length - 1)];
    const car = createCar(type, {
      color: type === 'taxi' ? 0xe8b93a : PAINT_JOBS[rng.int(0, PAINT_JOBS.length - 1)],
      driver: 'traffic',
    });
    const vertical = rng.chance(0.5);
    const road = ROAD_LINES[rng.int(0, ROAD_LINES.length - 1)];
    const along = rng.range(-280, 280);
    car.x = vertical ? road : along;
    car.z = vertical ? along : road;
    car.aiRoad = road;
    car.aiDir = rng.chance(0.5) ? 1 : -1;
    car.heading = vertical ? (car.aiDir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.aiDir > 0 ? 0 : Math.PI);
    car.speed = 10;
    cars.push(car);
  }
  return cars;
}

// vehicles.js — cars: creation, arcade driving physics, car-car
// collisions and top-down drawing. Every car in Solmar City (parked,
// traffic, police, the player's) is one of these.
import { clamp } from './util.js';
import { resolveBuildingCollision } from './city.js';

const CAR_COLORS = [
  '#d84040', '#3f7fd0', '#e8b93a', '#4aa864', '#c0c8d0', '#8a5fc0',
  '#e07830', '#40b8b0', '#a0a8b0', '#70303a', '#2f6a4a', '#d0d8e0',
];

// kind, length, width, acceleration, top speed, steering grip.
const CAR_TYPES = [
  { kind: 'sedan', len: 46, wid: 22, accel: 420, top: 330, grip: 3.2 },
  { kind: 'sport', len: 44, wid: 21, accel: 560, top: 430, grip: 4.2 },
  { kind: 'taxi', len: 46, wid: 22, accel: 430, top: 340, grip: 3.4 },
  { kind: 'truck', len: 58, wid: 24, accel: 300, top: 260, grip: 2.6 },
  { kind: 'van', len: 52, wid: 23, accel: 340, top: 290, grip: 2.8 },
];

let nextCarId = 0;

export function createCar(x, y, opts) {
  const o = opts || {};
  const type = o.type || CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];
  const color = o.color || CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  return {
    id: ++nextCarId,
    x, y,
    angle: o.angle !== undefined ? o.angle : Math.random() * Math.PI * 2,
    speed: 0,
    color,
    type: type.kind,
    len: type.len,
    wid: type.wid,
    accel: type.accel,
    top: type.top,
    grip: type.grip,
    driver: o.driver || 'parked', // 'parked' | 'npc' | 'player' | 'police'
    police: !!o.police,
    health: 100,
    brakeLight: false,
    honkT: 0,
    stuckT: 0,
    route: null, // traffic cars: {axis:'v'|'h', line, dir}
    damage: 0,
  };
}

/**
 * Arcade driving: accelerate / reverse, steering that tightens with
 * speed, Space as a handbrake, building collision with a speed penalty
 * and crash sparks on a hard hit.
 */
export function updateCarPhysics(G, car, input, dt) {
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const brake = !!input.brake;

  if (input.forward) car.speed += car.accel * dt;
  if (input.back) car.speed -= car.accel * 0.7 * dt;
  if (brake) {
    car.speed *= Math.pow(0.02, dt);
    if (Math.abs(car.speed) > 60) car.speed -= Math.sign(car.speed) * 260 * dt;
  }
  // Rolling drag, then the hard top-speed cap.
  car.speed -= car.speed * 0.55 * dt;
  car.speed = clamp(car.speed, -car.top * 0.45, car.top);

  const spd = Math.abs(car.speed);
  const steerPower = steer * car.grip * clamp(spd / 60, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += steerPower * dt * (brake ? 1.5 : 1);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  const hit = resolveBuildingCollision(G.city, car, car.len * 0.42);
  if (hit) {
    if (Math.abs(car.speed) > 140) {
      car.damage += Math.abs(car.speed) * 0.02;
      car.speed *= -0.25;
      G.audio.sfx('hit');
      spawnCrashSparks(G, car.x, car.y, 6);
    } else {
      car.speed *= 0.4;
    }
  }
  car.x = clamp(car.x, 20, G.city.W - 20);
  car.y = clamp(car.y, 20, G.city.H - 20);
  car.brakeLight = brake || !!input.back;
  if (car.honkT > 0) car.honkT -= dt;
}

/** Yellow/orange sparks at a crash point. */
export function spawnCrashSparks(G, x, y, n) {
  for (let i = 0; i < n; i++) {
    G.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 260,
      vy: (Math.random() - 0.5) * 260,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.7,
      color: Math.random() < 0.5 ? '#ffd25f' : '#ff8a3d',
      size: 2 + Math.random() * 3,
    });
  }
}

/**
 * Two cars bumping: push apart along the line between them and share
 * speed, so a ram slows both cars instead of passing through.
 */
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = (a.len + b.len) * 0.42;
  if (d === 0 || d >= min) return false;
  const push = (min - d) / 2;
  const nx = dx / d;
  const ny = dy / d;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const avg = (a.speed + b.speed) / 2;
  a.speed = avg * 0.6;
  b.speed = avg * 0.6;
  return true;
}

/** Rounded-rectangle path helper for car bodies and windows. */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawCar(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  // Soft shadow under the car.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(3, 5, car.len * 0.52, car.wid * 0.55, car.angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(car.angle);
  const L = car.len;
  const W = car.wid;
  // Wheels.
  ctx.fillStyle = '#16161a';
  ctx.fillRect(-L / 2 + 4, -W / 2 - 3, 10, 5);
  ctx.fillRect(L / 2 - 12, -W / 2 - 3, 10, 5);
  ctx.fillRect(-L / 2 + 4, W / 2 - 2, 10, 5);
  ctx.fillRect(L / 2 - 12, W / 2 - 2, 10, 5);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  // Damage scorch on a battered car.
  if (car.damage > 8) {
    ctx.fillStyle = 'rgba(20,20,20,0.45)';
    ctx.beginPath();
    ctx.arc(-L / 2 + 8, 0, 6 + car.damage * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  // Windshield, rear window, roof highlight.
  ctx.fillStyle = '#1c2c3c';
  roundRect(ctx, L * 0.08, -W / 2 + 3, L * 0.22, W - 6, 3);
  ctx.fill();
  ctx.fillStyle = '#24384c';
  roundRect(ctx, -L * 0.32, -W / 2 + 3, L * 0.18, W - 6, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, -L * 0.12, -W / 2 + 4, L * 0.2, W - 8, 3);
  ctx.fill();
  // Headlights and taillights (brake lights glow red).
  ctx.fillStyle = '#fff6c0';
  ctx.fillRect(L / 2 - 2, -W / 2 + 3, 2, 5);
  ctx.fillRect(L / 2 - 2, W / 2 - 8, 2, 5);
  ctx.fillStyle = car.brakeLight ? '#ff2a2a' : '#a02020';
  ctx.fillRect(-L / 2, -W / 2 + 3, 2, 5);
  ctx.fillRect(-L / 2, W / 2 - 8, 2, 5);
  if (car.type === 'taxi') {
    ctx.fillStyle = '#f5d020';
    ctx.fillRect(-6, -W / 2 + 2, 12, 6);
    ctx.fillStyle = '#222';
    ctx.font = 'bold 6px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, -W / 2 + 7);
  }
  if (car.police) {
    // White centre band, blue stripes, POLICE lettering, flashing bar.
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(-L * 0.18, -W / 2, L * 0.36, W);
    ctx.fillStyle = '#1c4fd0';
    ctx.fillRect(-L * 0.18, -W / 2, L * 0.36, 4);
    ctx.fillRect(-L * 0.18, W / 2 - 4, L * 0.36, 4);
    ctx.fillStyle = '#101418';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 3);
    const flash = Math.floor(performance.now() / 180) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2a2a' : '#2a6cff';
    ctx.fillRect(-4, -W / 2 - 4, 8, 5);
    ctx.fillStyle = flash ? '#2a6cff' : '#ff2a2a';
    ctx.fillRect(-4, W / 2 - 1, 8, 5);
  }
  ctx.restore();
}

export { CAR_TYPES, CAR_COLORS };

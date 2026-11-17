// player.js — the player character: on-foot movement, entering and
// leaving cars, health, sprint and the "wasted / busted" states.
import { clamp, dist } from './util.js';
import { resolveBuildingCollision, inWater } from './city.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2, // facing up the screen
    speed: 0,
    radius: 14,
    health: 100,
    maxHealth: 100,
    onFoot: true,
    car: null,
    sprinting: false,
    moving: false,
    walkPhase: 0,
    punchCooldown: 0,
    shootCooldown: 0,
    hurtFlash: 0,
    color: '#e8b04b',
    shirt: '#2f7fc8',
    name: 'Rae Solano',
  };
}

export function damagePlayer(G, amount, source) {
  if (G.screen !== 'play' || G.player.health <= 0) return;
  G.player.health = Math.max(0, G.player.health - amount);
  G.player.hurtFlash = 0.45;
  if (G.player.health <= 0) {
    G.screen = 'wasted';
    G.audio.sfx('fail');
    G.stats.deaths++;
  }
}

// On-foot update: WASD / arrows, Shift sprint, building + water collision.
export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  const k = G.keys;
  let mx = 0;
  let my = 0;
  if (k['KeyA'] || k['ArrowLeft']) mx -= 1;
  if (k['KeyD'] || k['ArrowRight']) mx += 1;
  if (k['KeyW'] || k['ArrowUp']) my -= 1;
  if (k['KeyS'] || k['ArrowDown']) my += 1;
  p.sprinting = !!(k['ShiftLeft'] || k['ShiftRight']);
  const speed = p.sprinting ? 250 : 165;
  p.moving = mx !== 0 || my !== 0;
  if (p.moving) {
    const len = Math.hypot(mx, my);
    const nx = (mx / len) * speed * dt;
    const ny = (my / len) * speed * dt;
    p.x += nx;
    p.y += ny;
    p.angle = Math.atan2(my, mx);
    p.walkPhase += dt * (p.sprinting ? 13 : 9);
  }
  p.x = clamp(p.x, 16, G.city.W - 16);
  p.y = clamp(p.y, 16, G.city.H - 16);
  resolveBuildingCollision(G.city, p, p.radius);
  if (inWater(G.city, p.x, p.y)) {
    // The bay is not swimmable: shove the player back onto the sand.
    p.y = G.city.beach.y + G.city.beach.h - 4;
  }
  if (p.punchCooldown > 0) p.punchCooldown -= dt;
  if (p.shootCooldown > 0) p.shootCooldown -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;
  // Slow health regen when no cop is close and the player is calm.
  if (G.wanted === 0 && p.health > 0 && p.health < p.maxHealth) {
    p.health = Math.min(p.maxHealth, p.health + 1.6 * dt);
  }
}

// Enter the nearest car within reach (E). Stealing a car someone else
// drives raises the wanted level — the city notices.
export function tryEnterCar(G) {
  const p = G.player;
  if (!p.onFoot) return false;
  let best = null;
  let bestD = 70;
  for (const car of G.cars) {
    if (car.police) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return false;
  if (best.driver === 'npc') {
    best.driver = 'player';
    G.stats.carsStolen++;
    G.audio.sfx('door');
    addWanted(G, 1, 'car theft');
    spawnFleeingDriver(G, best);
  } else {
    best.driver = 'player';
    G.audio.sfx('door');
  }
  p.car = best;
  p.onFoot = false;
  p.x = best.x;
  p.y = best.y;
  return true;
}

export function exitCar(G) {
  const p = G.player;
  if (p.onFoot || !p.car) return false;
  const car = p.car;
  car.driver = 'parked';
  car.speed = 0;
  // Step out to the car's left side, clear of buildings.
  const sx = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  const sy = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  p.x = clamp(sx, 16, G.city.W - 16);
  p.y = clamp(sy, 16, G.city.H - 16);
  resolveBuildingCollision(G.city, p, p.radius);
  p.car = null;
  p.onFoot = true;
  G.audio.sfx('door');
  return true;
}

function spawnFleeingDriver(G, car) {
  // The robbed driver runs off on foot, arms waving.
  G.peds.push({
    x: car.x + 30, y: car.y + 10,
    angle: Math.random() * Math.PI * 2,
    speed: 190, flee: true, fleeX: car.x + 300, fleeY: car.y - 200,
    color: '#e05a5a', panic: 6, wanderT: 0, target: null,
  });
}

// Shared by police.js: raise wanted, cap at 5, show the reason.
export function addWanted(G, n, reason) {
  const before = G.wanted;
  G.wanted = clamp(G.wanted + n, 0, 5);
  if (G.wanted > before) {
    G.wantedFlash = 1.2;
    G.lastWantedReason = reason || '';
  }
}

export function drawPlayer(ctx, G) {
  const p = G.player;
  if (!p.onFoot) return;
  const bob = p.moving ? Math.sin(p.walkPhase) * 3 : 0;
  ctx.save();
  ctx.translate(p.x, p.y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle + Math.PI / 2);
  // Legs (two feet stepping with the walk cycle).
  ctx.fillStyle = '#2c2c34';
  ctx.fillRect(-8, -2 + bob, 6, 12);
  ctx.fillRect(2, -2 - bob, 6, 12);
  // Body: shirt, jacket shoulders, head.
  ctx.fillStyle = p.shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e2a3a';
  ctx.fillRect(-11, -4, 5, 10);
  ctx.fillRect(6, -4, 5, 10);
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(0, -1, 7.5, 0, Math.PI * 2);
  ctx.fill();
  // Hair + cap.
  ctx.fillStyle = '#241a12';
  ctx.beginPath();
  ctx.arc(0, -3, 7, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#e84a4a';
  ctx.fillRect(-7, -6, 14, 4);
  // Fists forward when punching, gun when armed.
  if (G.combat.punchAnim > 0) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, -18 - G.combat.punchAnim * 6, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (G.ammo > 0) {
    ctx.fillStyle = '#222';
    ctx.fillRect(-2, -22, 4, 10);
  }
  ctx.restore();
}

// combat.js — shooting, punching, rival gang members (the Vipers) who
// shoot back, bullets and particles. A simple pistol, fists, and rivals
// with health bars — all original, no commercial-game assets.
import { clamp, dist, angleTo } from './util.js';
import { resolveBuildingCollision } from './city.js';
import { addWanted, damagePlayer } from './player.js';

export function createCombat() {
  return {
    bullets: [], // {x,y,vx,vy,life,from:'player'|'enemy',dmg}
    enemies: [], // rival gang members
    particles: [],
    punchAnim: 0,
    lastShot: null, // {x,y,t} — pedestrians flee from this
    muzzleT: 0,
  };
}

/** Spawn rival shooters around a point, with the given health each. */
export function spawnRivals(G, x, y, count, opts) {
  const o = opts || {};
  for (let i = 0; i < count; i++) {
    G.combat.enemies.push({
      x: x + (Math.random() - 0.5) * 160,
      y: y + (Math.random() - 0.5) * 160,
      angle: Math.random() * Math.PI * 2,
      health: o.health || 50,
      speed: 95,
      shootT: 1 + Math.random() * 2,
      color: '#c03a6a',
      shirt: '#3a1030',
      walkPhase: Math.random() * 6,
      dead: false,
    });
  }
}

/** Fire the pistol at a world point (mouse aim, on foot only). */
export function playerShoot(G, tx, ty) {
  const p = G.player;
  if (!p.onFoot) return;
  if (p.shootCooldown > 0) return;
  if (G.ammo <= 0) {
    G.audio.sfx('reload');
    G.notice = 'Out of ammo — press R to reload.';
    G.noticeT = 2;
    p.shootCooldown = 0.3;
    return;
  }
  p.shootCooldown = 0.22;
  G.ammo--;
  const a = angleTo(p.x, p.y, tx, ty);
  p.angle = a;
  G.combat.bullets.push({
    x: p.x + Math.cos(a) * 20,
    y: p.y + Math.sin(a) * 20,
    vx: Math.cos(a) * 780,
    vy: Math.sin(a) * 780,
    life: 0.9,
    from: 'player',
    dmg: 26,
  });
  G.combat.lastShot = { x: p.x, y: p.y, t: G.time };
  G.combat.muzzleT = 0.07;
  G.audio.sfx('shot');
  // Firing a gun in the city is noticed: at least one star of heat.
  if (G.wanted < 1) {
    G.wanted = 1;
    G.wantedFlash = 1.2;
    G.lastWantedReason = 'shots fired';
    G.police.heatT = 0;
  }
  spawnMuzzle(G, p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22);
}

/** Swing a fist at whatever is right in front of the player. */
export function playerPunch(G) {
  const p = G.player;
  if (!p.onFoot || p.punchCooldown > 0) return;
  p.punchCooldown = 0.45;
  G.combat.punchAnim = 0.25;
  G.audio.sfx('punch');
  const reach = 46;
  const hx = p.x + Math.cos(p.angle) * reach;
  const hy = p.y + Math.sin(p.angle) * reach;
  let hitSomething = false;
  for (const e of G.combat.enemies) {
    if (e.dead) continue;
    if (dist(hx, hy, e.x, e.y) < 34) {
      damageEnemy(G, e, 22);
      hitSomething = true;
    }
  }
  for (const ped of G.peds) {
    if (dist(hx, hy, ped.x, ped.y) < 26) {
      ped.panic = 4;
      ped.flee = true;
      ped.fleeX = ped.x * 2 - p.x;
      ped.fleeY = ped.y * 2 - p.y;
      addWanted(G, 1, 'assault');
      G.police.heatT = 0;
      hitSomething = true;
    }
  }
  if (hitSomething) G.audio.sfx('hit');
}

/** Refill the pistol's magazine. */
export function reloadWeapon(G) {
  if (G.ammo >= G.ammoMax) return;
  G.ammo = G.ammoMax;
  G.audio.sfx('reload');
  G.notice = 'Reloaded.';
  G.noticeT = 1.2;
}

/** Damage a rival; a kill pays $45 and draws the law's attention. */
function damageEnemy(G, e, dmg) {
  e.health -= dmg;
  spawnBlood(G, e.x, e.y);
  if (e.health <= 0 && !e.dead) {
    e.dead = true;
    G.stats.kills++;
    G.money += 45;
    G.audio.sfx('cash');
    G.notice = '+$45 — rival down.';
    G.noticeT = 2;
    addWanted(G, 1, 'rival down');
    G.police.heatT = 0;
  }
}

/** Bullets fly and hit walls, cars, rivals or the player; rivals act. */
export function updateCombat(G, dt) {
  const C = G.combat;
  if (C.punchAnim > 0) C.punchAnim -= dt;
  if (C.muzzleT > 0) C.muzzleT -= dt;

  for (const b of C.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (b.x < 0 || b.y < 0 || b.x > G.city.W || b.y > G.city.H) { b.life = 0; continue; }
    const wall = G.city.buildings.find((bd) => b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h);
    if (wall) {
      b.life = 0;
      spawnSparks(G, b.x, b.y, '#ffd25f', 4);
      continue;
    }
    if (b.from === 'player') {
      for (const e of C.enemies) {
        if (e.dead) continue;
        if (dist(b.x, b.y, e.x, e.y) < 18) {
          b.life = 0;
          damageEnemy(G, e, b.dmg);
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const ped of G.peds) {
        if (dist(b.x, b.y, ped.x, ped.y) < 13) {
          b.life = 0;
          ped.panic = 5;
          ped.flee = true;
          ped.fleeX = ped.x * 2 - G.player.x;
          ped.fleeY = ped.y * 2 - G.player.y;
          addWanted(G, 1, 'civilian hit');
          G.police.heatT = 0;
          spawnBlood(G, ped.x, ped.y);
          break;
        }
      }
    } else {
      // Enemy bullets can hit the player, on foot or in the car.
      if (dist(b.x, b.y, G.player.x, G.player.y) < 18) {
        b.life = 0;
        damagePlayer(G, b.dmg, 'shot');
      }
    }
  }
  C.bullets = C.bullets.filter((b) => b.life > 0);
  C.enemies = C.enemies.filter((e) => !e.dead);

  // Rivals: close in to firing range, back off when too near, shoot.
  for (const e of C.enemies) {
    if (e.dead) continue;
    const d = dist(e.x, e.y, G.player.x, G.player.y);
    const a = angleTo(e.x, e.y, G.player.x, G.player.y);
    e.angle = a;
    e.walkPhase += dt * 8;
    if (d > 320) {
      e.x += Math.cos(a) * e.speed * dt;
      e.y += Math.sin(a) * e.speed * dt;
    } else if (d < 170) {
      e.x -= Math.cos(a) * e.speed * 0.6 * dt;
      e.y -= Math.sin(a) * e.speed * 0.6 * dt;
    }
    e.shootT -= dt;
    if (e.shootT <= 0 && d < 420 && G.screen === 'play') {
      e.shootT = 1.4 + Math.random() * 1.2;
      const jitter = (Math.random() - 0.5) * 0.24;
      C.bullets.push({
        x: e.x + Math.cos(a) * 18,
        y: e.y + Math.sin(a) * 18,
        vx: Math.cos(a + jitter) * 620,
        vy: Math.sin(a + jitter) * 620,
        life: 0.9,
        from: 'enemy',
        dmg: 8,
      });
      C.muzzleT = 0.05;
      G.audio.sfx('shot');
    }
    resolveBuildingCollision(G.city, e, 13);
  }

  // Particles fade out (combat sparks and crash sparks alike).
  for (const pt of C.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
    pt.life -= dt;
  }
  C.particles = C.particles.filter((pt) => pt.life > 0);
  for (const pt of G.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
    pt.life -= dt;
  }
  G.particles = G.particles.filter((pt) => pt.life > 0);
}

export function spawnSparks(G, x, y, color, n) {
  for (let i = 0; i < n; i++) {
    G.combat.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 300,
      vy: (Math.random() - 0.5) * 300,
      life: 0.3 + Math.random() * 0.25,
      color: color || '#ffd25f',
      size: 2 + Math.random() * 2,
    });
  }
}

export function spawnBlood(G, x, y) {
  spawnSparks(G, x, y, '#c02a2a', 8);
}

function spawnMuzzle(G, x, y) {
  spawnSparks(G, x, y, '#ffe9a8', 5);
}

/** Draw bullets, particles, rivals (with health bars) and muzzle flash. */
export function drawCombat(ctx, G) {
  const C = G.combat;
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 3;
  for (const b of C.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const pt of C.particles) {
    ctx.globalAlpha = clamp(pt.life / 0.4, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  for (const pt of G.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  for (const e of C.enemies) {
    if (e.dead) continue;
    const bob = Math.sin(e.walkPhase) * 2.5;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 7, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(e.angle + Math.PI / 2);
    ctx.fillStyle = '#2c2c34';
    ctx.fillRect(-6, -1 + bob, 4, 9);
    ctx.fillRect(2, -1 - bob, 4, 9);
    ctx.fillStyle = e.shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(0, -1, 6.5, 0, Math.PI * 2);
    ctx.fill();
    // The rival's gun.
    ctx.fillStyle = '#111';
    ctx.fillRect(-2, -22, 4, 10);
    ctx.restore();
    // Health bar above a hurt rival.
    if (e.health < 50) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - 16, e.y - 26, 32, 5);
      ctx.fillStyle = '#e04040';
      ctx.fillRect(e.x - 15, e.y - 25, 30 * clamp(e.health / 50, 0, 1), 3);
    }
  }
  // Muzzle flash at the player's gun.
  if (C.muzzleT > 0 && G.player.onFoot) {
    const p = G.player;
    ctx.fillStyle = 'rgba(255,233,168,0.9)';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 26, p.y + Math.sin(p.angle) * 26, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

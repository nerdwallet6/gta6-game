// police.js — the wanted system: heat decay, police cruisers that
// spawn, chase and ram, and the "busted" arrest when a slow cruiser
// catches the player on foot.
import { clamp, dist, angleTo, makeRng } from './util.js';
import { roadPoint, resolveBuildingCollision } from './city.js';
import { createCar, collideCars } from './vehicles.js';
import { damagePlayer } from './player.js';

const MAX_POLICE = 5;
const BUST_SECONDS = 2.2;

export function createPoliceState() {
  return {
    cars: [],
    spawnT: 0,
    bustT: 0,
    heatT: 0, // seconds since the last crime
    sirenOn: false,
  };
}

/** How many cruisers the current wanted level calls for. */
export function policeWanted(G) {
  return clamp(G.wanted, 0, MAX_POLICE);
}

export function updatePolice(G, dt) {
  const P = G.police;
  P.heatT += dt;
  const want = policeWanted(G);

  // Heat decay: stay clean and out of sight and the stars fade away.
  if (G.wanted > 0 && P.heatT > 14) {
    P.heatT = 0;
    G.wanted = Math.max(0, G.wanted - 1);
    if (G.wanted === 0) {
      G.notice = 'You lost the cops. Heat is off.';
      G.noticeT = 3;
    }
  }

  // Spawn cruisers on a road near the player, just off screen.
  P.spawnT -= dt;
  if (P.cars.length < want && P.spawnT <= 0) {
    P.spawnT = 1.2;
    const rng = makeRng((G.seed + Math.floor(G.time * 10)) >>> 0);
    const p = roadPoint(G.city, rng);
    const car = createCar(p.x, p.y, { police: true, driver: 'police', color: '#101418' });
    car.type = 'sedan';
    car.accel = 520;
    car.top = 400;
    car.grip = 4.0;
    const a = angleTo(G.player.x, G.player.y, p.x, p.y);
    car.x = clamp(G.player.x + Math.cos(a) * 700, 40, G.city.W - 40);
    car.y = clamp(G.player.y + Math.sin(a) * 700, 40, G.city.H - 40);
    P.cars.push(car);
  }

  // Despawn extra cruisers when the wanted level drops.
  while (P.cars.length > want) P.cars.pop();

  // Chase: steer toward the player, ram at speed, brake when close.
  for (const car of P.cars) {
    const d = dist(car.x, car.y, G.player.x, G.player.y);
    const targetAngle = angleTo(car.x, car.y, G.player.x, G.player.y);
    const steer = clamp(((targetAngle - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1, 1);
    const forward = d > 90;
    const brake = d < 60;
    if (forward) car.speed += car.accel * dt;
    if (brake) car.speed *= Math.pow(0.02, dt);
    car.speed -= car.speed * 0.5 * dt;
    car.speed = clamp(car.speed, -160, car.top);
    const spd = Math.abs(car.speed);
    car.angle += steer * car.grip * clamp(spd / 60, 0, 1) * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // Cruisers stay on the streets like every other car.
    resolveBuildingCollision(G.city, car, car.len * 0.42);
    car.x = clamp(car.x, 20, G.city.W - 20);
    car.y = clamp(car.y, 20, G.city.H - 20);
    car.brakeLight = brake;

    if (G.player.onFoot) {
      // Ram the player on foot, shoving them along.
      if (d < 34) {
        damagePlayer(G, 22 * dt, 'ram');
        G.player.x += Math.cos(targetAngle) * 240 * dt;
        G.player.y += Math.sin(targetAngle) * 240 * dt;
      }
      // Busted: a slow cruiser right next to the player arrests them.
      if (d < 46 && Math.abs(car.speed) < 60) {
        P.bustT += dt;
        G.bustMeter = clamp(P.bustT / BUST_SECONDS, 0, 1);
        if (P.bustT > BUST_SECONDS) {
          G.screen = 'busted';
          G.audio.sfx('busted');
          G.stats.arrests++;
          P.bustT = 0;
        }
      } else {
        P.bustT = Math.max(0, P.bustT - dt * 2);
        G.bustMeter = clamp(P.bustT / BUST_SECONDS, 0, 1);
      }
    } else if (G.player.car) {
      if (collideCars(car, G.player.car)) {
        G.player.car.speed *= 0.8;
        // Ram damage at most once per hurt flash, so a pile-up does not
        // melt the player's health in a single second.
        if (Math.abs(car.speed) > 150 && G.player.hurtFlash <= 0) {
          damagePlayer(G, 4, 'ram');
          G.audio.sfx('hit');
        }
      }
    }
  }

  // Cruisers far away give up and despawn (keeps the chase fair).
  P.cars = P.cars.filter((c) => dist(c.x, c.y, G.player.x, G.player.y) < 1600);
  P.sirenOn = G.wanted > 0;
}

/** Drop all heat at once (mission getaway, free roam restart). */
export function clearWanted(G) {
  G.wanted = 0;
  G.police.cars = [];
  G.police.heatT = 0;
  G.bustMeter = 0;
}

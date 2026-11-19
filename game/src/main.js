// main.js — Solmar Nights 3D: the game bootstrap, third-person camera,
// on-foot movement + jumping, car enter/exit + carjacking, protagonist
// switching, abilities, shooting input, the main loop and the headless
// self-test hook (?selftest=1).
import * as THREE from '../lib/three.module.js';
import * as data from './data.js';
import { clamp, angleDelta, angleLerp, dist2, fmtClock, makeRng, TAU } from './util.js';
import { buildCity, districtAt } from './city.js';
import { createProtagonist, createPedestrian, poseHumanoid } from './character.js';
import {
  createCar, syncCarMesh, drivePlayerCar, damageCar,
  updateTrafficCar, spawnParkedCars, spawnTrafficCars,
} from './vehicles.js';
import {
  createWeaponState, spawnEnemy, removeEnemy, playerShoot,
  damageEnemy, damagePlayer, playerPunch, updateEnemy, updatePickups,
  spawnPickup,
} from './combat.js';
import {
  createPoliceState, addCrime, clearWanted, updatePolice, wasted,
} from './police.js';
import {
  createMissionState, currentMission, currentStep,
  missionTarget, startMission, showDialogue, advanceDialogue,
  missionInteract, updateMissions, refreshBeacon,
} from './missions.js';
import { createRaceState, updateRace } from './streetRaces.js';
import * as economy from './economy.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createSave } from './save.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const SELFTEST = params.get('selftest') === '1';

// ---------------- game state ----------------
const G = {
  data,
  screen: 'start', // start | play | pause | wasted | busted | complete
  time: 0,
  timeOfDay: 18.75, // 18:45 golden hour
  timeScale: 1,
  slowmoT: 0, slowmoCooldown: 0,
  money: 0,
  missionsDone: 0,
  mission: createMissionState(),
  race: createRaceState(),
  respect: {},
  stats: { kills: 0, shotsFired: 0, shotsHit: 0, racesWon: 0, racesRun: 0, carsStolen: 0 },
  weapons: createWeaponState(),
  weapon: { current: 'pistol' },
  weaponMods: {}, // per-weapon attachments {suppressor, extmag}
  outfitsOwned: ['street'],
  protagonistIndex: 0,
  protagonist: data.PROTAGONISTS[0],
  notice: '', noticeT: 0,
  menu: null,
  shot: null, shotReady: false,
  clockText: '18:45',
  keys: {},
  mouseDown: false, aimHeld: false,
  wheelOpen: false,
  lastMouseMove: 0, // game time of the last mouse orbit (camera auto-align)
  enterAnim: null, // {car, t, fromX, fromZ, doorX, doorZ} while entering a car
  ownedCar: null, // car stored at the safehouse {type, color, upgrades, nos}
};
window.__game = G;

// Player state.
G.player = {
  x: -72, z: -72, y: 0, vy: 0, heading: 0, phase: 0,
  vx: 0, vz: 0, speed: 0,
  health: 100, armor: 0, stamina: 100,
  car: null, outfit: 'street', masked: false, dead: false,
  humanoid: null, onGround: true,
};
// Companion (the other protagonist) follows on foot.
G.companion = { humanoid: null, x: -70, z: -70, heading: 0, phase: 0, visible: true };
// Camera rig.
G.camera = { yaw: Math.PI * 0.75, pitch: 0.32, dist: 6.5, heading: 0 };

// Sub-systems (filled in init).
G.police = createPoliceState();
G.police.crime = (kind) => addCrime(G, kind);
G.audio = createAudio();
G.save = createSave();
G.missions = { currentMission, currentStep, missionTarget };
G.economy = economy;
G.combat = {
  enemies: [], tracers: [], pickups: [], hitMeshes: [],
  fireT: 0, muzzleT: 0, punchT: 0,
  registerHitMesh(e) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 8, 6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    mesh.position.set(e.x, 1.1, e.z);
    mesh.userData.target = e;
    G.scene.add(mesh);
    e.hitMesh = mesh;
    G.combat.hitMeshes.push(mesh);
  },
  damagePlayer: (amt) => damagePlayer(G, amt),
};

// ---------------- renderer / scene ----------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
G.scene = scene;
const camera3 = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
G.camera3 = camera3;
window.addEventListener('resize', () => {
  camera3.aspect = window.innerWidth / window.innerHeight;
  camera3.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const city = buildCity(scene);
G.city = city;
const rng = makeRng(20261119);

// Cars: parked + traffic + player-driven (all in G.cars).
G.cars = [];
G.parkedCars = spawnParkedCars(rng, 16);
G.trafficCars = spawnTrafficCars(rng, 14);
for (const c of [...G.parkedCars, ...G.trafficCars]) {
  scene.add(c.group);
  G.cars.push(c);
}

// Pedestrians.
G.peds = [];
for (let i = 0; i < 12; i++) {
  const h = createPedestrian(rng);
  const road = [-252, -180, -108, -36, 36, 108, 180, 252][rng.int(0, 7)];
  const ped = {
    humanoid: h,
    x: rng.range(-280, 280), z: road + (rng.chance(0.5) ? 8 : -8),
    heading: rng.range(0, TAU), phase: rng.range(0, 6),
    speed: rng.range(1, 1.8), fleeT: 0, road,
  };
  h.group.position.set(ped.x, 0, ped.z);
  scene.add(h.group);
  G.peds.push(ped);
}

// Protagonists: active + companion.
const humanoids = [createProtagonist(0), createProtagonist(1)];
G.player.humanoid = humanoids[0];
G.companion.humanoid = humanoids[1];
scene.add(humanoids[0].group);
scene.add(humanoids[1].group);
humanoids[0].group.position.set(G.player.x, 0, G.player.z);
humanoids[1].group.position.set(G.companion.x, 0, G.companion.z);

// Muzzle flash mesh (hidden until firing).
const flash = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 8, 6),
  new THREE.MeshBasicMaterial({ color: 0xffe08a }),
);
flash.visible = false;
scene.add(flash);
G.flash = flash;

// HUD.
G.hud = createHud(G);

// ---------------- collision ----------------
/** Push a circle (x, z, r) out of building colliders. Returns corrected [x, z]. */
function collideCircle(x, z, r) {
  for (const c of city.colliders) {
    const cx = clamp(x, c.x0, c.x1);
    const cz = clamp(z, c.z0, c.z1);
    let dx = x - cx;
    let dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 < 1e-6) {
      // Inside the box: push out along the smallest penetration axis.
      const pl = x - c.x0, pr = c.x1 - x, pt = z - c.z0, pb = c.z1 - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = c.x0 - r;
      else if (m === pr) x = c.x1 + r;
      else if (m === pt) z = c.z0 - r;
      else z = c.z1 + r;
      continue;
    }
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    x += dx * push;
    z += dz * push;
  }
  // World bounds + water: the bay is not walkable.
  x = clamp(x, -300, 300);
  z = clamp(z, -300, 300);
  return [x, z];
}

/** Is the point (x, z) inside any building collider? */
function pointBlocked(x, z, r = 0.5) {
  for (const c of city.colliders) {
    if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
  }
  return false;
}

// ---------------- input ----------------
const KEYMAP = {
  KeyW: 'fwd', ArrowUp: 'fwd',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'jump',
};
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  G.keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  handleKeyPress(e.code);
});
window.addEventListener('keyup', (e) => {
  G.keys[e.code] = false;
});
canvas.addEventListener('click', () => {
  G.audio.unlock();
  if (G.screen === 'play' && !G.menu && !G.mission.dialogue) {
    lockPointer();
  }
  if (G.mission.dialogue) advanceDialogue(G);
});
document.addEventListener('pointerlockchange', () => {
  G.pointerLocked = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', (e) => {
  if (!G.pointerLocked || G.screen !== 'play') return;
  G.lastMouseMove = G.time;
  G.camera.yaw -= (e.movementX || 0) * 0.0028;
  G.camera.pitch = clamp(G.camera.pitch + (e.movementY || 0) * 0.0022, -0.15, 1.1);
});
canvas.addEventListener('mousedown', (e) => {
  if (G.screen !== 'play') return;
  if (e.button === 0) {
    G.mouseDown = true;
    tryShoot();
  } else if (e.button === 2) {
    G.aimHeld = true;
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) G.mouseDown = false;
  if (e.button === 2) G.aimHeld = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function handleKeyPress(code) {
  if (G.screen === 'start') {
    if (code === 'Enter') startGame(false);
    return;
  }
  if (G.screen === 'wasted' || G.screen === 'busted') {
    if (code === 'Enter') {
      G.hud.hideEndScreen();
      G.screen = 'play';
    }
    return;
  }
  if (G.screen === 'complete') {
    if (code === 'Enter') {
      G.hud.hideComplete();
      G.screen = 'play';
    }
    return;
  }
  if (G.screen === 'pause') {
    if (code === 'KeyP' || code === 'Escape') resumeGame();
    return;
  }
  if (G.screen !== 'play') return;

  // Full-screen map open: only M / Esc close it.
  if (G.hud.mapOpen) {
    if (code === 'KeyM' || code === 'Escape') G.hud.toggleMap();
    return;
  }

  // Menu navigation.
  if (G.menu) {
    if (code === 'ArrowUp' || code === 'KeyW') G.hud.menuMove(-1);
    else if (code === 'ArrowDown' || code === 'KeyS') G.hud.menuMove(1);
    else if (code === 'Enter') G.hud.menuChoose();
    else if (code === 'Escape') G.hud.closeMenu();
    return;
  }
  // Dialogue.
  if (G.mission.dialogue) {
    if (code === 'KeyE' || code === 'Enter' || code === 'Space') advanceDialogue(G);
    return;
  }
  switch (code) {
    case 'KeyE':
      interact();
      break;
    case 'KeyF':
      if (!G.player.car) playerPunch(G);
      break;
    case 'KeyR':
      reloadWeapon();
      break;
    case 'KeyQ':
      G.wheelOpen = true;
      G.hud.showWheel();
      break;
    case 'Tab':
      switchProtagonist();
      break;
    case 'KeyX':
      useAbility();
      break;
    case 'KeyN': {
      const name = G.audio.nextStation();
      G.notice = 'Radio: ' + name;
      G.noticeT = 2;
      break;
    }
    case 'KeyM': {
      G.hud.toggleMap();
      break;
    }
    case 'KeyU': {
      const muted = G.audio.toggleMute();
      G.notice = muted ? 'Muted' : 'Sound on';
      G.noticeT = 1.5;
      break;
    }
    case 'KeyP':
    case 'Escape':
      pauseGame();
      break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': {
      const id = data.WEAPON_ORDER[Number(code.slice(-1)) - 1];
      if (G.weapons[id]?.owned) {
        G.weapon.current = id;
        G.audio.sfx('click');
      } else {
        G.notice = data.WEAPONS[id].name + ' not owned — buy it at Ironworks Arms';
        G.noticeT = 2;
      }
      break;
    }
    default:
      break;
  }
}
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyQ' && G.wheelOpen) {
    G.wheelOpen = false;
    G.hud.hideWheel();
  }
});

/** E: dialogue > mission > shop > race > car. */
function interact() {
  const p = G.player;
  if (G.mission.dialogue) {
    advanceDialogue(G);
    return;
  }
  if (missionInteract(G)) return;
  if (!p.car) {
    const shop = economy.nearbyShop(G);
    if (shop) {
      G.hud.openMenu(shop.kind, shop.name);
      G.audio.sfx('click');
      return;
    }
    if (economy.tryStartRace(G)) return;
    // Mission giver marker: start the next mission at the beacon.
    if (!G.mission.started && !G.mission.done) {
      const t = missionTarget(G);
      if (t && dist2(p.x, p.z, t.x, t.z) < 16) {
        startMission(G, G.mission.index);
        return;
      }
    }
  }
  // Car enter / exit.
  if (p.car) {
    exitCar();
  } else {
    enterNearestCar();
  }
}

function enterNearestCar() {
  const p = G.player;
  if (G.enterAnim) return;
  let best = null;
  let bestD = 4.5;
  for (const car of G.cars) {
    if (car.driver === 'player') continue;
    const d = dist2(car.x, car.z, p.x, p.z);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  if (!best) return;
  const jacked = best.driver === 'traffic';
  if (jacked) {
    // Carjacking: pull the driver out — they flee on foot.
    const h = createPedestrian(rng);
    const driver = {
      humanoid: h,
      x: best.x - Math.sin(best.heading) * 3,
      z: best.z + Math.cos(best.heading) * 3,
      heading: best.heading, phase: 0, speed: 1.5, fleeT: 8,
      road: best.x,
    };
    h.group.position.set(driver.x, 0, driver.z);
    scene.add(h.group);
    G.peds.push(driver);
    G.stats.carsStolen++;
    G.police.crime('steal-car');
    G.notice = 'You jacked a ' + best.spec.name + '!';
    G.noticeT = 2;
  }
  // Walk to the door (0.5s), then get in; the camera swings to chase cam.
  const side = 2.6;
  G.enterAnim = {
    car: best, t: 0, jacked,
    fromX: p.x, fromZ: p.z,
    doorX: best.x - Math.sin(best.heading) * side,
    doorZ: best.z + Math.cos(best.heading) * side,
  };
  G.audio.sfx('door');
}

function exitCar() {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  car.driver = 'parked';
  const side = 2.6;
  const sx = car.x - Math.sin(car.heading) * side;
  const sz = car.z + Math.cos(car.heading) * side;
  const [x, z] = collideCircle(sx, sz, 0.6);
  p.x = x;
  p.z = z;
  p.heading = car.heading;
  p.car = null;
  G.audio.sfx('door');
  // Ditching the car clears the "knows vehicle" icon.
  G.police.knows.vehicle = false;
}

function reloadWeapon() {
  const id = G.weapon.current;
  const st = G.weapons[id];
  const spec = data.WEAPONS[id];
  const cap = st.magMax || spec.mag;
  if (!st.owned || st.mag >= cap || st.reserve <= 0) return;
  const need = cap - st.mag;
  const take = Math.min(need, st.reserve);
  st.mag += take;
  st.reserve -= take;
  G.audio.sfx('click');
}

function switchProtagonist() {
  const other = 1 - G.protagonistIndex;
  // Swap the two humanoids: the companion takes the active one's place.
  const activeH = G.player.humanoid;
  const otherH = G.companion.humanoid;
  // The other protagonist is standing where the companion was; swap them.
  const px = G.player.x, pz = G.player.z, ph = G.player.heading;
  G.player.x = G.companion.x;
  G.player.z = G.companion.z;
  G.player.heading = G.companion.heading;
  G.companion.x = px;
  G.companion.z = pz;
  G.companion.heading = ph;
  G.player.humanoid = otherH;
  G.companion.humanoid = activeH;
  G.protagonistIndex = other;
  G.protagonist = data.PROTAGONISTS[other];
  // Outfit follows the protagonist, not the body.
  G.player.humanoid.setOutfit(G.player.outfit);
  G.notice = 'Now playing: ' + G.protagonist.name + ' — ' + G.protagonist.abilityName + ' (X)';
  G.noticeT = 3;
  G.audio.sfx('pickup');
}

function useAbility() {
  if (G.slowmoCooldown > 0 || G.slowmoT > 0) return;
  const p = G.protagonist;
  if (p.ability === 'focus' && G.player.car) {
    G.slowmoT = 4;
    G.slowmoCooldown = 20;
    G.notice = p.abilityName + ' — time slows while you drive!';
  } else if (p.ability === 'deadeye' && !G.player.car) {
    G.slowmoT = 4;
    G.slowmoCooldown = 20;
    G.notice = p.abilityName + ' — time slows while you aim!';
  } else {
    G.notice = p.abilityName + ' needs ' + (p.ability === 'focus' ? 'a car' : 'to be on foot');
  }
  G.noticeT = 2.5;
}

/** Fire the current weapon toward the crosshair.
 *  The camera ray finds the aim point (an enemy, or far downrange);
 *  the shot itself leaves the muzzle toward that point, so the
 *  crosshair always means what it points at. */
function tryShoot() {
  const p = G.player;
  if (G.screen !== 'play' || p.car || G.menu || G.mission.dialogue) return;
  const st = G.weapons[G.weapon.current];
  if (!st.owned) return;
  camera3.getWorldDirection(_tmpDir);
  const camRay = new THREE.Raycaster(camera3.position, _tmpDir, 0.1, 220);
  const hits = camRay.intersectObjects(G.combat.hitMeshes, false);
  const aimPoint = hits.length > 0
    ? hits[0].point.clone()
    : camera3.position.clone().add(_tmpDir.clone().multiplyScalar(90));
  const origin = new THREE.Vector3(p.x, 1.45, p.z);
  const shootDir = aimPoint.sub(origin).normalize();
  // Muzzle flash at the gun.
  G.flash.position.copy(origin).add(shootDir.clone().multiplyScalar(1.2));
  G.flash.visible = true;
  G.combat.muzzleT = 0.06;
  playerShoot(G, origin, shootDir);
}
const _tmpDir = new THREE.Vector3();

/** Request pointer lock without ever throwing (headless has none). */
function lockPointer() {
  try {
    const r = canvas.requestPointerLock?.();
    if (r && r.catch) r.catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Spawn the player's stored safehouse car next to the safehouse. */
function spawnOwnedCar(G) {
  const owned = G.ownedCar;
  if (!owned || !data.CAR_TYPES[owned.type]) return;
  const s = data.SPOTS.safehouse;
  const car = createCar(owned.type, { driver: 'parked', color: owned.color });
  car.x = s.x + 8;
  car.z = s.z + 4;
  car.heading = 0;
  car.upgrades = { engine: 0, armor: 0, nos: false, ...(owned.upgrades || {}) };
  car.nos = owned.nos || 0;
  if (car.upgrades.nos) car.nosMax = 100;
  scene.add(car.group);
  G.cars.push(car);
  G.parkedCars.push(car);
  syncCarMesh(car);
}

// ---------------- game flow ----------------
function startGame(fromSave) {
  G.audio.unlock();
  if (fromSave) {
    const d = G.save.loadGame();
    if (d) {
      G.save.applySave(G, d);
      // Re-apply protagonist + outfit meshes.
      const h = humanoids[G.protagonistIndex];
      const other = humanoids[1 - G.protagonistIndex];
      G.player.humanoid = h;
      G.companion.humanoid = other;
      G.protagonist = data.PROTAGONISTS[G.protagonistIndex];
      h.setOutfit(G.player.outfit);
      h.group.position.set(G.player.x, 0, G.player.z);
      other.group.position.set(G.companion.x, 0, G.companion.z);
      // The safehouse car respawns at the safehouse on load.
      if (G.ownedCar) spawnOwnedCar(G);
      G.notice = 'Save loaded — welcome back to Solmar City.';
    }
  } else {
    G.save.clearSave();
    G.money = 0;
    G.mission = createMissionState();
    G.player.x = -72;
    G.player.z = -72;
    G.player.health = 100;
    G.player.armor = 0;
    G.player.humanoid.setOutfit('street');
    G.player.outfit = 'street';
  }
  G.screen = 'play';
  G.hud.hideStart();
  G.hud.hidePause();
  G.hud.hideEndScreen();
  G.hud.hideComplete();
  // First mission: briefing opens shortly after play starts.
  if (!G.mission.started && !G.mission.done) {
    G.mission.nextT = 1.2;
  }
  lockPointer();
}

function pauseGame() {
  if (G.screen !== 'play') return;
  G.screen = 'pause';
  G.save.saveGame(G);
  document.exitPointerLock?.();
  G.hud.showPause();
}

function resumeGame() {
  G.screen = 'play';
  G.hud.hidePause();
  lockPointer();
}

document.getElementById('btn-new').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-save').addEventListener('click', () => {
  G.save.saveGame(G);
  G.notice = 'Game saved.';
  G.noticeT = 2;
});
document.getElementById('btn-quit').addEventListener('click', () => {
  G.save.saveGame(G);
  G.screen = 'start';
  G.hud.hidePause();
  G.hud.showStart(G.save.hasSave());
});
document.getElementById('btn-end-ok').addEventListener('click', () => {
  G.hud.hideEndScreen();
  G.screen = 'play';
});
document.getElementById('btn-free').addEventListener('click', () => {
  G.hud.hideComplete();
  G.screen = 'play';
});

// ---------------- per-frame updates ----------------
const _v = new THREE.Vector3();

function updatePlayer(dt) {
  const p = G.player;
  if (p.dead) return;
  const k = G.keys;
  // Vehicle entry animation: walk to the door, then get in.
  if (G.enterAnim) {
    const a = G.enterAnim;
    a.t += dt;
    const f = Math.min(1, a.t / 0.5);
    p.x = a.fromX + (a.doorX - a.fromX) * f;
    p.z = a.fromZ + (a.doorZ - a.fromZ) * f;
    if (f < 1) p.heading = Math.atan2(a.doorZ - p.z, a.doorX - p.x);
    p.phase += dt * 9;
    if (a.t >= 0.5) {
      const car = a.car;
      car.driver = 'player';
      p.car = car;
      p.heading = car.heading;
      G.enterAnim = null;
      if (!a.jacked) {
        G.notice = car.spec.name + ' — ' + Math.round(car.speed * 3.6) + ' km/h';
        G.noticeT = 2;
      }
      G.audio.sfx('door');
    }
    return;
  }
  if (p.car) {
    const car = p.car;
    const input = {
      fwd: !!(k.KeyW || k.ArrowUp),
      back: !!(k.KeyS || k.ArrowDown),
      left: !!(k.KeyA || k.ArrowLeft),
      right: !!(k.KeyD || k.ArrowRight),
      brake: !!k.Space,
      boost: !!(k.ShiftLeft || k.ShiftRight),
      dt,
      slowmo: G.slowmoT > 0,
    };
    const px = car.x, pz = car.z;
    drivePlayerCar(car, input);
    // Building collision: revert + damage on impact.
    if (pointBlocked(car.x + Math.cos(car.heading) * 2.2, car.z + Math.sin(car.heading) * 2.2, 1)) {
      car.x = px;
      car.z = pz;
      if (Math.abs(car.speed) > 8) {
        damageCar(car, 8);
        G.audio.sfx('punch');
        G.notice = 'Crash! Car damaged.';
        G.noticeT = 1.5;
      }
      car.speed *= -0.25;
    }
    car.x = clamp(car.x, -298, 298);
    car.z = clamp(car.z, -298, 298);
    // Traffic collision: gentle push-back.
    for (const other of G.cars) {
      if (other === car || other.driver === 'player') continue;
      const d = dist2(car.x, car.z, other.x, other.z);
      if (d < 4.6 && d > 0.01) {
        const push = (4.6 - d) / d;
        car.x += (car.x - other.x) * push * 0.5;
        car.z += (car.z - other.z) * push * 0.5;
        car.speed *= 0.85;
        if (Math.abs(car.speed) > 10) damageCar(car, 3);
      }
    }
    p.x = car.x;
    p.z = car.z;
    p.heading = car.heading;
    p.speed = car.speed;
    syncCarMesh(car);
    G.audio.setEngine(true, Math.abs(car.speed) / 48);
    // Speeding past police at 3+ stars while wanted adds a little heat.
    if (Math.abs(car.speed) > 30 && G.police.level >= 1 && Math.random() < dt * 0.2) {
      G.police.crime('speeding');
    }
    return;
  }
  G.audio.setEngine(false, 0);

  // On foot: camera-relative movement.
  const yaw = G.camera.yaw;
  const fx = Math.cos(yaw), fz = Math.sin(yaw);
  const rx = -fz, rz = fx;
  let mx = 0, mz = 0;
  if (k.KeyW || k.ArrowUp) { mx += fx; mz += fz; }
  if (k.KeyS || k.ArrowDown) { mx -= fx; mz -= fz; }
  if (k.KeyD || k.ArrowRight) { mx += rx; mz += rz; }
  if (k.KeyA || k.ArrowLeft) { mx -= rx; mz -= rz; }
  const moving = mx !== 0 || mz !== 0;
  const wantSprint = !!(k.ShiftLeft || k.ShiftRight);
  const sprint = wantSprint && (p.stamina ?? 100) > 1;
  const speed = sprint ? 8 : 4.5;
  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len;
    mz /= len;
    const wantHeading = Math.atan2(mz, mx);
    p.heading += angleDelta(p.heading, wantHeading) * Math.min(1, dt * 12);
    const stepLen = speed * dt;
    let nx = p.x + mx * stepLen;
    let nz = p.z + mz * stepLen;
    [nx, nz] = collideCircle(nx, nz, 0.55);
    // Don't walk through cars.
    for (const car of G.cars) {
      const d = dist2(nx, nz, car.x, car.z);
      if (d < 2.3 && d > 0.01) {
        const push = (2.3 - d) / d;
        nx += (nx - car.x) * push;
        nz += (nz - car.z) * push;
      }
    }
    p.x = nx;
    p.z = nz;
    p.speed = speed;
    p.phase += dt * (sprint ? 13 : 9);
    // Sprint drains stamina; walking recovers it.
    p.stamina = clamp((p.stamina ?? 100) + (sprint ? -14 : 10) * dt, 0, 100);
  } else {
    p.speed = 0;
    p.phase += dt * 2;
    p.stamina = clamp((p.stamina ?? 100) + 10 * dt, 0, 100);
  }
  // Jump / gravity.
  if ((k.Space || k.jump) && p.onGround) {
    p.vy = 7.5;
    p.onGround = false;
    G.audio.sfx('click');
  }
  if (!p.onGround) {
    p.vy -= 22 * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      p.onGround = true;
    }
  }
  p.vx = moving ? mx * speed : 0;
  p.vz = moving ? mz * speed : 0;
  // Pose + mesh.
  const aiming = G.aimHeld || (G.mouseDown && G.weapons[G.weapon.current].owned);
  poseHumanoid(p.humanoid, p.phase, moving ? (sprint ? 1 : 0.55) : 0, aiming, !p.onGround);
  p.humanoid.group.position.set(p.x, p.y, p.z);
  p.humanoid.group.rotation.y = Math.PI / 2 - p.heading;
  // Hide the player mesh while driving (they are inside the car).
  p.humanoid.group.visible = !p.car;
}

function updateCompanion(dt) {
  const c = G.companion;
  const p = G.player;
  const d = dist2(c.x, c.z, p.x, p.z);
  if (d > 60) {
    // Teleport close if left far behind.
    c.x = p.x + 3;
    c.z = p.z + 3;
  } else if (d > 4) {
    const want = Math.atan2(p.z - c.z, p.x - c.x);
    c.heading += angleDelta(c.heading, want) * Math.min(1, dt * 8);
    const sp = Math.min(9, d * 1.2);
    let nx = c.x + Math.cos(want) * sp * dt;
    let nz = c.z + Math.sin(want) * sp * dt;
    [nx, nz] = collideCircle(nx, nz, 0.55);
    c.x = nx;
    c.z = nz;
    c.phase += dt * 10;
    poseHumanoid(c.humanoid, c.phase, 0.7, false, false);
  } else {
    c.phase += dt * 2;
    poseHumanoid(c.humanoid, c.phase, 0, false, false);
  }
  c.humanoid.group.position.set(c.x, 0, c.z);
  c.humanoid.group.rotation.y = Math.PI / 2 - c.heading;
  c.humanoid.group.visible = c.visible && !p.car;
}

function updatePeds(dt) {
  const p = G.player;
  for (const ped of G.peds) {
    const h = ped.humanoid;
    if (ped.fleeT > 0) {
      ped.fleeT -= dt;
      const away = Math.atan2(ped.z - p.z, ped.x - p.x);
      ped.x += Math.cos(away) * 5 * dt;
      ped.z += Math.sin(away) * 5 * dt;
      ped.heading = away;
      ped.phase += dt * 12;
      poseHumanoid(h, ped.phase, 1, false, false);
    } else {
      // Stroll along the sidewalk; turn at intersections.
      ped.x += Math.cos(ped.heading) * ped.speed * dt;
      ped.z += Math.sin(ped.heading) * ped.speed * dt;
      ped.phase += dt * 6;
      poseHumanoid(h, ped.phase, 0.4, false, false);
      if (Math.abs(ped.x) > 290 || Math.abs(ped.z) > 290 || Math.random() < dt * 0.05) {
        ped.heading = Math.floor(Math.random() * 4) * (Math.PI / 2);
      }
      if (G.police.level >= 3 && dist2(ped.x, ped.z, p.x, p.z) < 25) ped.fleeT = 3;
    }
    [ped.x, ped.z] = collideCircle(ped.x, ped.z, 0.5);
    h.group.position.set(ped.x, 0, ped.z);
    h.group.rotation.y = Math.PI / 2 - ped.heading;
  }
}

function updateEnemies(dt) {
  for (let i = G.combat.enemies.length - 1; i >= 0; i--) {
    const e = G.combat.enemies[i];
    if (e.dead) {
      // Fall over and fade: sink the body, then remove.
      e.humanoid.group.rotation.x = -Math.PI / 2;
      e.humanoid.group.position.y -= dt * 0.4;
      if (e.humanoid.group.position.y < -1.5) {
        removeEnemy(scene, e);
        if (e.hitMesh) {
          scene.remove(e.hitMesh);
          const hi = G.combat.hitMeshes.indexOf(e.hitMesh);
          if (hi >= 0) G.combat.hitMeshes.splice(hi, 1);
        }
        G.combat.enemies.splice(i, 1);
      }
      continue;
    }
    updateEnemy(G, e, dt);
    if (e.hitMesh) e.hitMesh.position.set(e.x, 1.1, e.z);
  }
}

function updateCamera(dt) {
  const p = G.player;
  const aiming = G.aimHeld && !p.car;
  // Distances: on foot the character fills ~30% of the screen height;
  // driving, the car sits centre-bottom at ~15-20% with the road ahead.
  const wantDist = p.car ? 8.0 : aiming ? 3.4 : 5.0;
  G.camera.dist += (wantDist - G.camera.dist) * Math.min(1, dt * 6);
  // Heading lock: while driving the camera eases back behind the car;
  // on foot it settles behind the character while moving. The mouse
  // overrides briefly (1.2s after the last orbit input).
  if (G.screen === 'play' && G.time - (G.lastMouseMove || 0) > 1.2) {
    const targetYaw = p.car ? p.car.heading : (p.speed > 0.5 ? p.heading : null);
    if (targetYaw !== null && targetYaw !== undefined) {
      G.camera.yaw += angleDelta(G.camera.yaw, targetYaw) * Math.min(1, dt * (p.car ? 1.6 : 0.9));
    }
  }
  const yaw = G.camera.yaw;
  const fx = Math.cos(yaw), fz = Math.sin(yaw);
  // Shoulder-height camera on foot; higher chase cam while driving.
  const height = p.car
    ? 3.0 + Math.sin(G.camera.pitch) * G.camera.dist * 0.5
    : aiming ? 1.7 + Math.sin(G.camera.pitch) * G.camera.dist * 0.4
    : 1.8 + Math.sin(G.camera.pitch) * G.camera.dist * 0.5;
  const back = Math.cos(G.camera.pitch) * G.camera.dist;
  // Shoulder offset when aiming: camera sits to the right of the player,
  // so the character shifts left and the crosshair stays centred.
  const shoulder = aiming ? 1.1 : 0;
  const rx = -fz, rz = fx;
  const cx = p.x - fx * back + rx * shoulder;
  const cz = p.z - fz * back + rz * shoulder;
  const cy = (p.y || 0) + height;
  camera3.position.set(cx, cy, cz);
  const lookDist = p.car ? 10 : aiming ? 6 : 4;
  const lookH = p.car ? 1.2 : 1.5;
  _v.set(p.x + fx * lookDist + rx * shoulder, (p.y || 0) + lookH, p.z + fz * lookDist + rz * shoulder);
  camera3.lookAt(_v);
  G.camera.heading = yaw;
  // Muzzle flash lifetime.
  if (G.combat.muzzleT > 0) {
    G.combat.muzzleT -= dt;
    if (G.combat.muzzleT <= 0) G.flash.visible = false;
  }
}

function updateTracers(dt) {
  for (let i = G.combat.tracers.length - 1; i >= 0; i--) {
    const t = G.combat.tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
    if (t.life <= 0) {
      scene.remove(t.line);
      G.combat.tracers.splice(i, 1);
    }
  }
}

// ---------------- main loop ----------------
let lastT = performance.now();
let autosaveT = 0;
let radioT = 0;
let frameCount = 0;

function loop(now) {
  requestAnimationFrame(loop);
  // Headless SwiftShader runs at a few FPS; the 0.05 cap would make the
  // self-test crawl at ~0.1x real time, so the test gets a coarser cap.
  const dtCap = SELFTEST ? 0.25 : 0.05;
  let dt = Math.min(dtCap, (now - lastT) / 1000);
  lastT = now;
  frameCount++;

  // Slow-mo abilities scale the world clock.
  if (G.slowmoT > 0) {
    G.slowmoT -= dt;
    G.timeScale = 0.35;
  } else {
    G.timeScale = 1;
  }
  if (G.slowmoCooldown > 0) G.slowmoCooldown -= dt;
  dt *= G.timeScale;
  G.time += dt;

  // Game clock: 1 game hour per 24 real seconds.
  if (G.screen === 'play') G.timeOfDay = (G.timeOfDay + dt / 24) % 24;
  G.clockText = fmtClock(G.timeOfDay);
  city.updateDayNight(G.timeOfDay);

  // Staged screenshots keep the car rolling (no real keys in shot mode).
  if (G.shotDrive && G.screen === 'play') G.keys.KeyW = true;

  if (G.screen === 'play' && !G.menu && !G.mission.dialogue) {
    updatePlayer(dt);
    updateCompanion(dt);
    updatePeds(dt);
    updateEnemies(dt);
    // Auto-start the next mission a moment after the previous one ends.
    if (!G.mission.started && !G.mission.done) {
      G.mission.nextT = (G.mission.nextT ?? 2) - dt;
      if (G.mission.nextT <= 0) {
        // Gated missions return false; retry in 10s instead of spamming.
        if (!startMission(G, G.mission.index)) G.mission.nextT = 10;
      }
    }
    updateMissions(G, dt);
    updateRace(G, dt);
    updatePolice(G, dt);
    updatePickups(G, dt);
    // Wasted: the player died — hospital respawn + end screen.
    if (G.player.dead && G.screen === 'play') {
      wasted(G);
    }
    // Traffic.
    for (const car of G.trafficCars) {
      updateTrafficCar(car, dt, G.cars, rng);
      syncCarMesh(car);
    }
    for (const car of G.parkedCars) syncCarMesh(car);
    // Weapon cooldowns.
    if (G.combat.fireT > 0) G.combat.fireT -= dt;
    if (G.combat.punchT > 0) G.combat.punchT -= dt;
    // Hold-to-fire for automatic weapons.
    if (G.mouseDown && !G.player.car) {
      const spec = data.WEAPONS[G.weapon.current];
      if (spec.auto && G.combat.fireT <= 0) tryShoot();
    }
    // Beacon pulse.
    const beacon = G.mission.beacon || G.race.beacon;
    if (beacon) {
      beacon.userData.pillar.material.opacity = 0.22 + Math.sin(G.time * 4) * 0.1;
      beacon.rotation.y += dt * 0.8;
    }
    // Shop marker labels always face the camera.
    for (const m of Object.values(city.shopMarkers)) {
      m.userData.spinLabel.lookAt(camera3.position);
    }
    // Notices.
    if (G.noticeT > 0) G.noticeT -= dt;
    // Autosave.
    autosaveT += dt;
    if (autosaveT > 30) {
      autosaveT = 0;
      G.save.saveGame(G);
    }
  }

  // Radio sequencer (real time, not slowed).
  radioT += dt;
  if (radioT > 0.28) {
    radioT = 0;
    G.audio.radioTick();
  }

  updateCamera(dt);
  if (G.screen !== 'start' || SHOT) G.hud.update();
  renderer.render(scene, camera3);

  if (SELFTEST) selfTestTick(dt);
}

// ---------------- boot ----------------
G.hud.showStart(G.save.hasSave());
if (SHOT) {
  // Staged scene: skip the title screen, build the shot.
  applyShot(G, SHOT, SEED);
  if (G.screen === 'start') {
    // 'start' shot keeps the title screen up.
  } else {
    G.hud.hideStart();
  }
}
requestAnimationFrame(loop);

// ---------------- headless self-test (?selftest=1) ----------------
// Scripted end-to-end checks that drive the real game code (keys, E,
// shooting, wanted, shops, races, switching, save) and report into
// #test-results + document.title so headless Chrome can read them.
const testResults = [];
let testStep = 0;
let testTimer = 0;
let testCar = null;
let testEnemy = null;
let testMark = null;
let testStepPrev = -1;
let testEntered = false;

function testLog(name, ok, detail) {
  testResults.push({ name, ok: !!ok, detail: detail || '' });
  const el = document.getElementById('test-results');
  if (el) {
    el.textContent = JSON.stringify(testResults);
  }
  document.title = 'SELFTEST:' + testResults.filter((r) => r.ok).length + '/' + testResults.length;
}

function selfTestTick(dt) {
  testTimer += dt;
  const p = G.player;
  // Snapshot start positions once, when a step is entered (positions
  // captured every tick would measure a single frame, not the step).
  if (testStep !== testStepPrev) {
    testStepPrev = testStep;
    testMark = { px: p.x, pz: p.z, cx: testCar ? testCar.x : 0, cz: testCar ? testCar.z : 0 };
  }
  try {
    selfTestStep(dt);
  } catch (e) {
    // One broken step must not wedge the whole test in an exception loop.
    testLog('step-' + testStep + '-error', false, String(e && e.message ? e.message : e).slice(0, 120));
    testStep += 1;
    testTimer = 0;
  }
}

function selfTestStep(dt) {
  const p = G.player;
  switch (testStep) {
    case 0: // boot: force play screen
      if (testTimer > 0.5) {
        G.screen = 'play';
        G.hud.hideStart();
        // Keep the intro briefing out of the test until step 13 starts
        // mission 1 explicitly; an open dialogue freezes updatePlayer.
        G.mission.dialogue = null;
        G.mission.nextT = 9999;
        testStep = 1;
        testTimer = 0;
      }
      break;
    case 1: { // walk forward
      G.keys.KeyW = true;
      if (testTimer > 1.2) {
        G.keys.KeyW = false;
        testLog('walk', dist2(testMark.px, testMark.pz, p.x, p.z) > 2, 'moved ' + dist2(testMark.px, testMark.pz, p.x, p.z).toFixed(1) + 'm');
        testStep = 2;
        testTimer = 0;
      }
      break;
    }
    case 2: { // jump
      const y0 = p.y;
      G.keys.Space = true;
      if (testTimer > 0.3) {
        G.keys.Space = false;
        testLog('jump', p.y > y0 || !p.onGround, 'y=' + p.y.toFixed(2));
        testStep = 3;
        testTimer = 0;
      }
      break;
    }
    case 3: { // enter nearest parked car (direct entry path: E also routes
      // through dialogue / shop / race first, which the test must not trip on)
      const car = G.parkedCars[0];
      if (!testEntered) {
        p.x = car.x + 3;
        p.z = car.z;
        p.heading = 0;
        G.mission.dialogue = null;
        enterNearestCar(); // 0.5s walk-to-door animation, then p.car is set
        testEntered = true;
      }
      if (p.car) {
        testLog('enter-car', true, p.car.spec.name);
        testCar = p.car;
        testStep = 4;
        testTimer = 0;
        testEntered = false;
      } else if (testTimer > 2) {
        testLog('enter-car', false, 'no car');
        testStep = 4;
        testTimer = 0;
        testEntered = false;
      }
      break;
    }
    case 4: { // drive
      if (!testCar) {
        testLog('drive', false, 'no car from step 3');
        testStep = 5;
        testTimer = 0;
        break;
      }
      G.keys.KeyW = true;
      if (testTimer > 2) {
        G.keys.KeyW = false;
        const moved = dist2(testMark.cx, testMark.cz, testCar.x, testCar.z);
        testLog('drive', moved > 10 && Math.abs(testCar.speed) > 3, 'moved ' + moved.toFixed(1) + 'm speed ' + testCar.speed.toFixed(1));
        testStep = 5;
        testTimer = 0;
      }
      break;
    }
    case 5: { // exit car
      if (testTimer > 0.3) {
        exitCar();
        testLog('exit-car', !p.car, p.car ? 'still in car' : 'on foot');
        testStep = 6;
        testTimer = 0;
      }
      break;
    }
    case 6: { // shoot an enemy
      if (!testEnemy) {
        testEnemy = spawnEnemy(scene, 'viper', p.x + 8, p.z, { health: 60 });
        G.combat.enemies.push(testEnemy);
        G.combat.registerHitMesh(testEnemy);
      }
      // Aim the camera at the enemy and fire.
      G.camera.yaw = Math.atan2(testEnemy.z - p.z, testEnemy.x - p.x);
      if (testTimer > 0.4) {
        for (let i = 0; i < 4; i++) {
          G.combat.fireT = 0;
          tryShoot();
        }
        testLog('shoot', testEnemy.health < 60, 'enemy hp ' + testEnemy.health);
        // Clean up so the test enemy cannot shoot the player mid-test.
        G.combat.enemies = G.combat.enemies.filter((e) => e !== testEnemy);
        removeEnemy(scene, testEnemy);
        testEnemy = null;
        testStep = 7;
        testTimer = 0;
      }
      break;
    }
    case 7: { // wanted 3+ -> helicopter
      addCrime(G, 'kill-cop');
      addCrime(G, 'kill-cop');
      if (testTimer > 4) {
        testLog('wanted-heli', G.police.level >= 3 && !!G.police.heli, 'stars ' + G.police.level + ' heli ' + !!G.police.heli);
        testStep = 8;
        testTimer = 0;
      }
      break;
    }
    case 8: { // shop menu opens
      const shop = data.SHOPS[0];
      const s = data.SPOTS[shop.spot];
      p.x = s.x;
      p.z = s.z;
      if (testTimer > 0.4) {
        G.hud.openMenu(shop.kind, shop.name);
        testLog('shop', !!(G.menu && G.menu.rows.length > 2), 'rows ' + (G.menu ? G.menu.rows.length : 0));
        G.hud.closeMenu();
        testStep = 9;
        testTimer = 0;
      }
      break;
    }
    case 9: { // race: start + run the gates (races need a car)
      clearWanted(G);
      const race = data.RACES.neon;
      const s = data.SPOTS[race.start];
      const car = G.parkedCars[2];
      car.x = s.x;
      car.z = s.z;
      car.driver = 'player';
      car.health = car.maxHealth;
      G.player.car = car;
      G.player.x = s.x;
      G.player.z = s.z;
      if (testTimer > 0.4) {
        economy.tryStartRace(G);
        testLog('race-start', G.race.active, 'active=' + G.race.active);
        testStep = 10;
        testTimer = 0;
      }
      break;
    }
    case 10: { // teleport the race car through the gates
      const race = data.RACES.neon;
      if (G.race.active && G.race.gate < race.gates.length) {
        const s = data.SPOTS[race.gates[G.race.gate]];
        const car = G.player.car;
        if (car) {
          car.x = s.x;
          car.z = s.z;
        }
        p.x = s.x;
        p.z = s.z;
      }
      if (testTimer > 2 || !G.race.active) {
        testLog('race-finish', G.stats.racesRun >= 1, 'racesRun ' + G.stats.racesRun);
        testStep = 11;
        testTimer = 0;
      }
      break;
    }
    case 11: { // switch protagonist
      const before = G.protagonist.name;
      switchProtagonist();
      testLog('switch-protagonist', G.protagonist.name !== before, before + ' -> ' + G.protagonist.name);
      testStep = 12;
      testTimer = 0;
      break;
    }
    case 12: { // save + reload
      G.money = 12345;
      G.save.saveGame(G);
      const loaded = G.save.loadGame();
      testLog('save-reload', !!loaded && loaded.money === 12345, 'loaded money ' + (loaded ? loaded.money : 'null'));
      testStep = 13;
      testTimer = 0;
      break;
    }
    case 13: { // mission flow: start mission 1, steal step completes in car
      if (!testEntered) {
        startMission(G, 0);
        G.mission.dialogue = null; // briefing dismissed for the test
        const car = G.parkedCars[1];
        p.x = car.x + 3;
        p.z = car.z;
        enterNearestCar();
        testEntered = true;
      }
      if (p.car) {
        updateMissions(G, 0); // advance the steal step synchronously
        testLog('mission-steal-step', G.mission.step === 1, 'step ' + G.mission.step);
        exitCar();
        testStep = 14;
        testTimer = 0;
        testEntered = false;
      } else if (testTimer > 2) {
        testLog('mission-steal-step', false, 'no car, step ' + G.mission.step);
        testStep = 14;
        testTimer = 0;
        testEntered = false;
      }
      break;
    }
    default: {
      if (testTimer > 0.5 && !window.__selftestDone) {
        window.__selftestDone = true;
        const passed = testResults.filter((r) => r.ok).length;
        document.title = 'SELFTEST:' + (passed === testResults.length ? 'PASS' : 'FAIL') +
          ' ' + passed + '/' + testResults.length;
        const el = document.getElementById('test-results');
        if (el) el.textContent = JSON.stringify(testResults);
      }
      break;
    }
  }
}

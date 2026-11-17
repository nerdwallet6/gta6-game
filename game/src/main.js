// main.js — Vice City Nights: boot, game loop, camera, input and screens.
// This module owns the shared game state G and calls each system in
// turn: city, player, vehicles, traffic, police, missions, combat, hud,
// audio, save and the staged screenshot scenes (shots.js).
import { clamp, lerp } from './util.js';
import { createCity, drawCity } from './city.js';
import { createPlayer, updatePlayerOnFoot, tryEnterCar, exitCar, drawPlayer } from './player.js';
import { createCar, updateCarPhysics, drawCar } from './vehicles.js';
import { createTraffic, createParkedCars, createPedestrians, updateTraffic, updatePedestrians, drawPedestrians } from './traffic.js';
import { createPoliceState, updatePolice } from './police.js';
import { createMissionState, startMission, updateMissions, missionInteract, advanceDialogue, drawMissionMarker } from './missions.js';
import { createCombat, updateCombat, playerShoot, playerPunch, reloadWeapon, drawCombat } from './combat.js';
import { drawHUD, drawStartScreen, drawPauseScreen, drawEndScreen } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame } from './save.js';
import { applyShot } from './shots.js';

const VIEW_W = 1280;
const VIEW_H = 720;

/** Build a fresh game state for the given seed. */
function createGame(seed) {
  const city = createCity(seed);
  return {
    seed,
    time: 0,
    screen: 'start', // start | play | pause | wasted | busted | complete
    city,
    player: createPlayer(city.spawn.x, city.spawn.y),
    cars: [], // parked + stealable cars (not traffic, not police)
    trafficCars: [],
    peds: [],
    police: createPoliceState(),
    mission: createMissionState(),
    combat: createCombat(),
    particles: [],
    audio: createAudio(),
    keys: {},
    mouse: { x: VIEW_W / 2, y: VIEW_H / 2, down: false },
    cam: { x: city.spawn.x, y: city.spawn.y, view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H } },
    money: 120,
    wanted: 0,
    wantedFlash: 0,
    lastWantedReason: '',
    ammo: 12,
    ammoMax: 12,
    missionsDone: 0,
    bustMeter: 0,
    notice: '',
    noticeT: 0,
    hasSave: false,
    shot: null,
    shotReady: false,
    stats: { carsStolen: 0, kills: 0, deaths: 0, arrests: 0 },
    saveT: 0,
  };
}

/** Fill the world: parked cars, traffic, pedestrians, a couple of cars
 *  parked right by the spawn so the first job is easy. */
function populateWorld(G) {
  G.cars = createParkedCars(G, 14);
  G.trafficCars = createTraffic(G, 16);
  G.peds = createPedestrians(G, 42);
  const near1 = createCar(G.city.spawn.x + 120, G.city.spawn.y + 30, { driver: 'parked', color: '#3f7fd0' });
  near1.angle = Math.PI / 2;
  G.cars.push(near1);
  const near2 = createCar(G.city.spawn.x - 60, G.city.spawn.y + 160, { driver: 'parked', color: '#e8b93a' });
  near2.angle = 0;
  G.cars.push(near2);
}

// ---- input ------------------------------------------------------------

function bindInput(G, canvas) {
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    G.keys[e.code] = true;
    G.audio.ensure();
    handleKeyPress(G, e.code);
  });
  window.addEventListener('keyup', (e) => {
    G.keys[e.code] = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    G.mouse.x = ((e.clientX - r.left) / r.width) * VIEW_W;
    G.mouse.y = ((e.clientY - r.top) / r.height) * VIEW_H;
  });
  canvas.addEventListener('mousedown', (e) => {
    G.audio.ensure();
    if (e.button === 0) {
      G.mouse.down = true;
      handleClick(G);
    }
  });
  window.addEventListener('mouseup', () => {
    G.mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

function handleKeyPress(G, code) {
  if (code === 'KeyM') {
    const muted = G.audio.toggleMute();
    G.notice = muted ? 'Sound muted.' : 'Sound on.';
    G.noticeT = 1.5;
    return;
  }
  if (G.screen === 'start') {
    if (code === 'Enter' || code === 'Space') startPlaying(G);
    else if (code === 'KeyC' && G.hasSave) continueSave(G);
    return;
  }
  if (G.screen === 'pause') {
    if (code === 'KeyP' || code === 'Escape') G.screen = 'play';
    else if (code === 'KeyS') { saveGame(G); G.notice = 'Game saved.'; G.noticeT = 2; }
    return;
  }
  if (G.screen === 'wasted' || G.screen === 'busted' || G.screen === 'complete') {
    if (code === 'Enter') resumeFreeRoam(G);
    return;
  }
  // In play.
  if (code === 'KeyP' || code === 'Escape') {
    G.screen = 'pause';
    saveGame(G);
    return;
  }
  if (G.mission.dialogue) {
    if (code === 'Enter' || code === 'Space') advanceDialogue(G);
    return;
  }
  if (code === 'KeyE') {
    if (!missionInteract(G)) {
      if (G.player.onFoot) tryEnterCar(G);
      else exitCar(G);
    }
    return;
  }
  if (code === 'KeyR') reloadWeapon(G);
  if (code === 'KeyF') playerPunch(G);
}

function handleClick(G) {
  if (G.screen === 'start') {
    startPlaying(G);
    return;
  }
  if (G.screen === 'pause' || G.screen === 'wasted' || G.screen === 'busted' || G.screen === 'complete') return;
  if (G.mission.dialogue) {
    advanceDialogue(G);
    return;
  }
  if (G.player.onFoot) {
    const world = screenToWorld(G, G.mouse.x, G.mouse.y);
    playerShoot(G, world.x, world.y);
  }
}

/** Start a new run from the title screen; open the first mission. */
function startPlaying(G) {
  G.audio.ensure();
  G.screen = 'play';
  if (!G.mission.started && !G.mission.done && G.mission.index === 0) {
    startMission(G, 0);
  }
  G.audio.sfx('mission');
}

/** Continue from a saved game (C on the title screen). */
function continueSave(G) {
  const data = loadGame();
  if (!data) return;
  G.money = data.money;
  G.player.health = data.health;
  G.mission.index = Math.min(data.missionIndex, 4);
  G.missionsDone = data.missionsDone;
  G.stats.carsStolen = data.carsStolen || 0;
  G.stats.arrests = data.arrests || 0;
  G.time = data.playSeconds || 0;
  G.player.x = clamp(data.playerX, 30, G.city.W - 30);
  G.player.y = clamp(data.playerY, 30, G.city.H - 30);
  G.screen = 'play';
  G.mission.started = false;
  G.notice = 'Welcome back, Rae. Mission ' + (G.mission.index + 1) + ' is waiting.';
  G.noticeT = 4;
}

/** After wasted / busted / complete, keep playing in free roam. */
function resumeFreeRoam(G) {
  if (G.screen === 'busted') {
    G.money = Math.max(0, G.money - 200);
  }
  G.player.health = 100;
  G.wanted = 0;
  G.police.cars = [];
  G.bustMeter = 0;
  G.player.x = G.city.spawn.x;
  G.player.y = G.city.spawn.y;
  if (G.player.car) {
    G.player.car.driver = 'parked';
    G.player.car = null;
    G.player.onFoot = true;
  }
  G.screen = 'play';
  if (!G.mission.started && !G.mission.done) {
    startMission(G, G.mission.index);
  }
}

function screenToWorld(G, sx, sy) {
  return {
    x: G.cam.view.x + sx,
    y: G.cam.view.y + sy,
  };
}

// ---- update -----------------------------------------------------------

function update(G, dt) {
  G.time += dt;
  if (G.wantedFlash > 0) G.wantedFlash -= dt;
  if (G.noticeT > 0) G.noticeT -= dt;
  G.audio.update(G, dt);

  const p = G.player;
  if (p.onFoot) {
    updatePlayerOnFoot(G, dt);
  } else if (p.car) {
    const k = G.keys;
    // Staged screenshot scenes keep the getaway rolling.
    const shotDrive = G.shot === 'chase' || G.shot === 'city';
    updateCarPhysics(G, p.car, {
      forward: !!(k['KeyW'] || k['ArrowUp'] || shotDrive),
      back: !!(k['KeyS'] || k['ArrowDown']),
      left: !!(k['KeyA'] || k['ArrowLeft']),
      right: !!(k['KeyD'] || k['ArrowRight']),
      brake: !!k['Space'],
    }, dt);
    p.x = p.car.x;
    p.y = p.car.y;
    p.angle = p.car.angle;
  }

  updateTraffic(G, dt);
  updatePedestrians(G, dt);
  updatePolice(G, dt);
  updateMissions(G, dt);
  updateCombat(G, dt);

  // Held mouse button: keep firing while on foot.
  if (G.mouse.down && p.onFoot && !G.mission.dialogue) {
    const world = screenToWorld(G, G.mouse.x, G.mouse.y);
    playerShoot(G, world.x, world.y);
  }

  // Camera: follow the player, eased, clamped to the city.
  const tx = clamp(p.x - VIEW_W / 2, 0, G.city.W - VIEW_W);
  const ty = clamp(p.y - VIEW_H / 2, 0, G.city.H - VIEW_H);
  G.cam.x = lerp(G.cam.x, tx, Math.min(1, dt * 5));
  G.cam.y = lerp(G.cam.y, ty, Math.min(1, dt * 5));
  G.cam.view.x = Math.round(G.cam.x);
  G.cam.view.y = Math.round(G.cam.y);

  // Autosave every 30 seconds of play.
  G.saveT += dt;
  if (G.saveT > 30) {
    G.saveT = 0;
    saveGame(G);
  }
}

// ---- render -----------------------------------------------------------

function render(G, ctx) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (G.screen === 'start') {
    drawStartScreen(ctx, G);
    return;
  }
  ctx.save();
  ctx.translate(-G.cam.view.x, -G.cam.view.y);
  drawCity(ctx, G.city, G.cam);
  drawMissionMarker(ctx, G);
  // Parked / stealable cars, then traffic, then police.
  for (const car of G.cars) drawCar(ctx, car);
  for (const car of G.trafficCars) drawCar(ctx, car);
  for (const car of G.police.cars) drawCar(ctx, car);
  drawPedestrians(ctx, G);
  drawCombat(ctx, G);
  if (G.player.car) drawCar(ctx, G.player.car);
  drawPlayer(ctx, G);
  ctx.restore();

  drawHUD(ctx, G);
  if (G.screen === 'pause') drawPauseScreen(ctx, G);
  else if (G.screen === 'wasted') drawEndScreen(ctx, G, 'wasted');
  else if (G.screen === 'busted') drawEndScreen(ctx, G, 'busted');
  else if (G.screen === 'complete') drawEndScreen(ctx, G, 'complete');
}

// ---- boot -------------------------------------------------------------

function boot() {
  const params = new URLSearchParams(window.location.search);
  const seed = parseInt(params.get('seed') || '1', 10) || 1;
  const shot = params.get('shot');
  const G = createGame(seed);
  G.hasSave = !!loadGame();
  populateWorld(G);

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  bindInput(G, canvas);
  window.__vcn = G;

  if (shot) {
    // Staged scene: deterministic setup, then a few frames to settle
    // (traffic moves, camera eases onto the player) before the shot.
    applyShot(G, shot, seed);
    for (let i = 0; i < 24; i++) {
      if (G.screen === 'play') update(G, 1 / 60);
    }
    G.cam.view.x = clamp(Math.round(G.player.x - VIEW_W / 2), 0, G.city.W - VIEW_W);
    G.cam.view.y = clamp(Math.round(G.player.y - VIEW_H / 2), 0, G.city.H - VIEW_H);
    G.cam.x = G.cam.view.x;
    G.cam.y = G.cam.view.y;
    render(G, ctx);
    G.shotReady = true;
    window.__shotReady = true;
  }

  let last = performance.now();
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    if (G.screen === 'play' && !G.mission.dialogue) update(G, dt);
    else if (G.screen === 'play') {
      // Dialogue open: the world idles, audio keeps breathing.
      G.audio.update(G, dt);
    }
    render(G, ctx);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();

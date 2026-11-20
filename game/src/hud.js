// hud.js — the DOM overlay for Solmar Nights 3D (v4).
//
// Everything the player sees on top of the 3D view lives here:
// the health / armor / stamina / Focus bars, the six wanted stars
// with the police-knowledge icons, money, the objective line, the
// crosshair, the weapon wheel, dialogue, notices, shop menus, the
// rotating minimap, and the start / pause / end screens.
//
// The overlay is built once by createHud(G) and refreshed every frame
// by H.update(). DOM writes are kept cheap: only values that changed
// are written, and the minimap is redrawn on its own canvas.
import {
  WEAPONS,
  WEAPON_ORDER,
  DISTRICTS,
  SPOTS,
  SHOPS,
  RACES,
} from './data.js';
import { districtAt } from './city.js';
import { fmtMoney, fmtTime, clamp, dist2 } from './util.js';
import { respectRankTitle } from './respectRanks.js';
import { nosLevel } from './garageUpgrades.js';
import { nearbyShop, nearbyRace } from './economy.js';

/** Build the HUD overlay inside #hud and return its handle. */
export function createHud(G) {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div id="hud-top-left">
      <div id="hud-vitals">
        <div class="bar"><div id="bar-health"></div><span>HEALTH</span></div>
        <div class="bar"><div id="bar-stamina"></div><span>STAMINA</span></div>
        <div class="bar"><div id="bar-focus"></div><span>FOCUS</span></div>
        <div class="bar"><div id="bar-armor"></div><span>ARMOR</span></div>
      </div>
      <div id="hud-district">Palm Court</div>
    </div>
    <div id="hud-top-right">
      <div id="hud-weapon"></div>
      <div id="hud-money">$0</div>
      <div id="hud-stars"></div>
      <div id="hud-knows"></div>
      <div id="hud-respect">Nobody</div>
    </div>
    <div id="hud-objective"></div>
    <div id="hud-notice"></div>
    <div id="hud-crosshair">+</div>
    <div id="hud-bottom-left">
      <canvas id="minimap" width="170" height="170"></canvas>
    </div>
    <div id="hud-bottom-right">
      <div id="hud-prompt"></div>
      <div id="hud-radio"></div>
      <div id="hud-speed"></div>
      <div id="hud-nos" class="bar"><div id="bar-nos"></div><span>NOS</span></div>
    </div>
    <div id="hud-dialogue"></div>
    <div id="hud-wheel"></div>
    <div id="hud-menu"></div>
    <div id="hud-bust"><div id="hud-bust-fill"></div><span>BUSTED?</span></div>
    <div id="hud-flash"></div>
    <div id="hud-map" class="hidden">
      <canvas id="mapcanvas" width="560" height="560"></canvas>
      <div class="map-hint">M / Esc — close map</div>
    </div>
    <div id="screen-start" class="screen">
      <h1>SOLMAR NIGHTS</h1>
      <h2>an open-world crime story in Solmar City — now in 3D</h2>
      <p class="tag">Two protagonists. Six districts. Six stars of heat.</p>
      <div class="controls-grid">
        <div><b>WASD</b> move / drive</div><div><b>Mouse</b> orbit camera · click shoot</div>
        <div><b>Shift</b> sprint</div><div><b>Space</b> jump / brake</div>
        <div><b>E</b> enter car · interact</div><div><b>Tab</b> switch Rae / Juno</div>
        <div><b>Q</b> hold: weapon wheel · <b>1-4</b> weapons</div><div><b>R</b> reload · <b>F</b> punch</div>
        <div><b>X</b> special ability</div><div><b>N</b> radio · <b>U</b> mute · <b>M</b> map · <b>P</b> pause</div>
      </div>
      <button id="btn-new">NEW GAME</button>
      <button id="btn-continue">CONTINUE</button>
      <p class="fine">Desktop Chrome · keyboard + mouse · no network · saves locally</p>
    </div>
    <div id="screen-pause" class="screen hidden">
      <h1>PAUSED</h1>
      <div id="pause-stats"></div>
      <button id="btn-resume">RESUME</button>
      <button id="btn-save">SAVE GAME</button>
      <button id="btn-quit">QUIT TO TITLE</button>
    </div>
    <div id="screen-end" class="screen hidden">
      <h1 id="end-title">WASTED</h1>
      <p id="end-text"></p>
      <button id="btn-end-ok">CONTINUE</button>
    </div>
    <div id="screen-complete" class="screen hidden">
      <h1>KING OF THE BAY</h1>
      <p>You finished the story — Solmar City is yours, Rae.</p>
      <div id="complete-stats"></div>
      <button id="btn-free">KEEP PLAYING (FREE ROAM)</button>
    </div>`;

  // Short helper: fetch an element by id.
  const $ = (id) => document.getElementById(id);
  const minimap = $('minimap');
  const mm = minimap.getContext('2d');

  const H = {
    root,
    mm,
    minimap,
    mapOpen: false,

    /** Toggle the full-screen map (M key). */
    toggleMap() {
      if (H.mapOpen) {
        H.mapOpen = false;
        $('hud-map').classList.add('hidden');
      } else {
        H.mapOpen = true;
        drawFullMap(G);
        $('hud-map').classList.remove('hidden');
      }
    },

    /** Show the "BUSTED?" progress bar while a cop closes in. */
    setBustProgress(f) {
      $('hud-bust').style.display = f > 0 ? 'block' : 'none';
      $('hud-bust-fill').style.width = Math.round(clamp(f, 0, 1) * 100) + '%';
    },

    /** Brief red flash across the screen when the player is hurt. */
    flashDamage() {
      const el = $('hud-flash');
      el.style.opacity = '0.35';
      setTimeout(() => {
        el.style.opacity = '0';
      }, 120);
    },

    /** Show the WASTED / BUSTED end screen with the cash lost. */
    showEndScreen(kind, lost) {
      const t = $('end-title');
      t.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
      $('end-text').textContent = kind === 'busted'
        ? 'The Solmar PD took you in. You lost ' + fmtMoney(lost) + ' in fines. You wake up at PD HQ.'
        : 'You blacked out and woke up at Solmar General. Hospital bill: ' + fmtMoney(lost) + '.';
      $('screen-end').classList.remove('hidden');
    },

    hideEndScreen() {
      $('screen-end').classList.add('hidden');
    },

    /** Show the story-complete screen with the final stats. */
    showComplete() {
      $('complete-stats').innerHTML =
        'Missions: ' + G.missionsDone + ' · Kills: ' + G.stats.kills +
        ' · Races won: ' + G.stats.racesWon + ' · Cash: ' + fmtMoney(G.money);
      $('screen-complete').classList.remove('hidden');
    },

    hideComplete() {
      $('screen-complete').classList.add('hidden');
    },

    /** Show the title screen; CONTINUE only appears with a save. */
    showStart(hasSave) {
      $('screen-start').classList.remove('hidden');
      $('btn-continue').style.display = hasSave ? 'inline-block' : 'none';
    },

    hideStart() {
      $('screen-start').classList.add('hidden');
    },

    /** Show the pause screen with the current run stats. */
    showPause() {
      const s = G.stats;
      $('pause-stats').innerHTML =
        'Missions: ' + G.missionsDone + '/9 · Cash: ' + fmtMoney(G.money) +
        ' · Kills: ' + s.kills + ' · Races: ' + s.racesWon + ' won / ' + s.racesRun +
        ' · Respect: ' + respectRankTitle(G) + ' · Radio: ' + G.audio.radioStationName();
      $('screen-pause').classList.remove('hidden');
    },

    hidePause() {
      $('screen-pause').classList.add('hidden');
    },

    /** Open a shop menu of the given kind. */
    openMenu(kind, title) {
      G.menu = {
        kind,
        title: title || shopTitle(kind),
        sel: 0,
        rows: G.economy.shopMenu(G, kind),
      };
      renderMenu(G);
    },

    closeMenu() {
      G.menu = null;
      $('hud-menu').innerHTML = '';
      $('hud-menu').classList.remove('open');
    },

    /** Move the shop menu selection (wraps around). */
    menuMove(d) {
      if (!G.menu) return;
      const rows = G.menu.rows;
      if (!rows.length) return;
      G.menu.sel = (G.menu.sel + d + rows.length) % rows.length;
      renderMenu(G);
    },

    /** Buy the selected shop row, then refresh the menu. */
    menuChoose() {
      if (!G.menu) return;
      const row = G.menu.rows[G.menu.sel];
      if (!row) return;
      const ok = row.action();
      if (ok && G.menu) {
        // Prices and stock may have changed: rebuild the rows.
        G.menu.rows = G.economy.shopMenu(G, G.menu.kind);
        renderMenu(G);
      }
    },

    /**
     * Open the weapon wheel overlay: the owned weapons arranged
     * around a circle, with the current one highlighted and the
     * locked ones greyed out with their price.
     */
    showWheel() {
      const el = $('hud-wheel');
      let html = '<div class="wheel-title">WEAPONS</div><div class="wheel-circle">';
      WEAPON_ORDER.forEach((id, i) => {
        const w = WEAPONS[id];
        const st = G.weapons[id];
        const cur = G.weapon.current === id;
        const ang = -Math.PI / 2 + (i / WEAPON_ORDER.length) * Math.PI * 2;
        const x = 50 + Math.cos(ang) * 36;
        const y = 50 + Math.sin(ang) * 36;
        html += '<div class="wheel-item' + (cur ? ' cur' : '') + (st.owned ? '' : ' locked') + '"' +
          ' style="left:' + x.toFixed(1) + '%;top:' + y.toFixed(1) + '%">' +
          '<b>' + w.name + '</b><span>' + (st.owned ? st.mag + ' / ' + st.reserve : fmtMoney(w.price)) + '</span></div>';
      });
      html += '</div><div class="wheel-hint">1-4 or click to pick · release Q to close</div>';
      el.innerHTML = html;
      el.classList.add('open');
    },

    hideWheel() {
      $('hud-wheel').classList.remove('open');
      $('hud-wheel').innerHTML = '';
    },
  };

  /** Display name for a shop kind (falls back to the kind itself). */
  function shopTitle(kind) {
    const s = SHOPS.find((x) => x.id === kind || x.kind === kind);
    return s ? s.name : kind;
  }

  /** Render the open shop menu into #hud-menu. */
  function renderMenu(G2) {
    const el = $('hud-menu');
    const m = G2.menu;
    if (!m) return;
    el.classList.toggle('wide', m.kind === 'guns');
    let html = '<div class="menu-title">' + m.title + '</div>';
    html += '<div class="menu-cash">' + fmtMoney(G2.money) + '</div>';
    m.rows.forEach((r, i) => {
      html += '<div class="menu-row' + (i === m.sel ? ' sel' : '') + '">' +
        '<span class="menu-label">' + r.label +
        (r.bars ? '<span class="stat-bars">' + statBarsHtml(r.bars) + '</span>' : '') +
        '</span>' +
        '<span class="menu-hint">' + (r.hint || '') + '</span>' +
        '<span class="menu-price">' + (r.price ? fmtMoney(r.price) : 'FREE') + '</span></div>';
    });
    html += '<div class="menu-foot">↑↓ choose · Enter buy · Esc close</div>';
    el.innerHTML = html;
    el.classList.add('open');
  }

  /** Small stat bars shown beside some shop rows (e.g. car stats). */
  function statBarsHtml(bars) {
    let out = '';
    for (const [name, v] of Object.entries(bars)) {
      out += '<span class="stat"><i>' + name + '</i><b style="width:' +
        Math.max(4, Math.min(100, v)) + '%"></b></span>';
    }
    return out;
  }

  /** Per-frame HUD refresh. Only writes DOM values that changed. */
  H.update = function update() {
    const p = G.player;
    // Top-left vitals: health, stamina, Focus ability, armor.
    const focus = G.slowmoT > 0
      ? (G.slowmoT / 4) * 100
      : G.slowmoCooldown > 0
        ? (1 - G.slowmoCooldown / 20) * 100
        : 100;
    $('bar-health').style.width = clamp(p.health, 0, 100) + '%';
    $('bar-stamina').style.width = clamp(p.stamina ?? 100, 0, 100) + '%';
    $('bar-focus').style.width = clamp(focus, 0, 100) + '%';
    $('bar-armor').style.width = clamp(p.armor, 0, 100) + '%';
    // The armor bar only shows once the player has armor.
    $('bar-armor').parentElement.style.display = p.armor > 0 ? 'block' : 'none';
    const d = districtAt(p.x, p.z);
    $('hud-district').textContent = d.name + ' — ' + G.clockText;
    // Top-right: ammo, cash, wanted stars, police-knowledge icons.
    const w = WEAPONS[G.weapon.current];
    const st = G.weapons[G.weapon.current];
    $('hud-weapon').textContent = st.owned
      ? w.name + '  ' + st.mag + ' / ' + st.reserve
      : w.name + ' — not owned';
    $('hud-money').textContent = fmtMoney(G.money) + '  ·  ' + G.protagonist.name;
    // Stars: filled for the current level, hollow above it.
    let stars = '';
    for (let i = 0; i < 6; i++) stars += i < G.police.level ? '★' : '☆';
    $('hud-stars').textContent = stars;
    $('hud-stars').style.color = G.police.level >= 4 ? '#ff5040' : '#ffd25f';
    // Police-knowledge icons: face / clothing / vehicle. Dim when unknown.
    const k = G.police.knows;
    $('hud-knows').innerHTML =
      '<span title="They know your face" style="opacity:' + (k.face ? 1 : 0.25) + '">👤</span>' +
      '<span title="They know your clothes" style="opacity:' + (k.clothing ? 1 : 0.25) + '">👕</span>' +
      '<span title="They know your vehicle" style="opacity:' + (k.vehicle ? 1 : 0.25) + '">🚗</span>';
    $('hud-respect').textContent = 'Respect: ' + respectRankTitle(G);
    // Bottom-right: action prompt, radio station, speed, NOS.
    $('hud-prompt').textContent = actionPrompt(G);
    $('hud-radio').textContent = '♪ ' + G.audio.radioStationName();
    $('hud-speed').textContent = p.car
      ? Math.round(Math.abs(p.car.speed) * 3.6) + ' km/h · ' + p.car.spec.name
      : '';
    const nos = p.car ? nosLevel(p.car) : 0;
    $('hud-nos').style.display = nos > 0 ? 'block' : 'none';
    if (nos > 0) $('bar-nos').style.width = nos + '%';
    $('hud-crosshair').style.display =
      (G.screen === 'play' && !p.car && G.weapons[G.weapon.current].owned) ? 'block' : 'none';
    // Objective line: race gates, the current mission step, or a hint.
    const step = G.missions.currentStep(G);
    let obj = '';
    if (G.race.active) {
      const race = RACES[G.race.id];
      obj = '🏁 ' + race.name + ' gate ' + (G.race.gate + 1) + '/' + race.gates.length +
        ' · ' + G.race.t.toFixed(1) + 's (par ' + G.race.par + 's)';
    } else if (G.mission.started && step) {
      obj = '◆ ' + G.missions.currentMission(G).title + ' — ' + step.text;
      const t = G.missions.missionTarget(G);
      if (t) obj += '  ·  ' + Math.round(Math.hypot(p.x - t.x, p.z - t.z)) + 'm';
    } else if (!G.mission.done) {
      obj = '◆ Next job: find Marla Voss — press E at the marker, or free-roam.';
    } else {
      obj = '◆ Story complete — free roam Solmar City.';
    }
    $('hud-objective').textContent = obj;
    // Notice: fades out once its timer expires.
    const n = $('hud-notice');
    if (G.noticeT > 0) {
      n.textContent = G.notice;
      n.style.opacity = '1';
    } else {
      n.style.opacity = '0';
    }
    // Dialogue box while a mission briefing is open.
    const dlg = $('hud-dialogue');
    if (G.mission.dialogue) {
      const dd = G.mission.dialogue;
      dlg.innerHTML = '<div class="dlg-line">' + dd.lines[dd.i] + '</div>' +
        '<div class="dlg-hint">E / click: continue</div>';
      dlg.style.display = 'block';
    } else {
      dlg.style.display = 'none';
    }
    drawMinimap(G);
  };

  /**
   * Contextual action prompt for the bottom-right corner: what E does
   * right now. Priority: car exit, shop, race, mission target, car.
   */
  function actionPrompt(G2) {
    if (G2.menu || G2.mission.dialogue || G2.screen !== 'play') return '';
    const p = G2.player;
    if (p.car) {
      return p.car.upgrades && p.car.upgrades.nos
        ? 'E — Exit car · Shift — NOS boost'
        : 'E — Exit car';
    }
    const shop = nearbyShop(G2);
    if (shop) return 'E — Enter ' + shop.name;
    const race = nearbyRace(G2);
    if (race) return 'E — Start ' + race.name;
    const t = G2.missions.missionTarget(G2);
    if (G2.mission.started && t && dist2(p.x, p.z, t.x, t.z) < 16) return 'E — Interact';
    let best = null;
    let bestD = 4.5;
    for (const car of G2.cars) {
      if (car.driver === 'player') continue;
      const d = dist2(car.x, car.z, p.x, p.z);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    if (best) {
      return best.driver === 'traffic'
        ? 'E — Carjack ' + best.spec.name
        : 'E — Enter ' + best.spec.name;
    }
    return '';
  }

  /**
   * Rotating minimap: the map turns so the camera heading points up,
   * with the player arrow fixed at the centre. North-up would be
   * wrong here — the camera heading is what the player steers by.
   */
  function drawMinimap(G2) {
    const p = G2.player;
    const S = 170;
    const scale = S / 260; // show roughly 260m across
    mm.save();
    mm.clearRect(0, 0, S, S);
    mm.beginPath();
    mm.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    mm.clip();
    mm.fillStyle = '#20262e';
    mm.fillRect(0, 0, S, S);
    // Rotate so the camera heading points up.
    mm.translate(S / 2, S / 2);
    mm.rotate(-G2.camera.heading - Math.PI / 2);
    mm.translate(-p.x * scale, -p.z * scale);
    // Water and beach to the south.
    mm.fillStyle = '#2a6f9e';
    mm.fillRect(-450 * scale, 340 * scale, 900 * scale, 300 * scale);
    mm.fillStyle = '#e0c890';
    mm.fillRect(-450 * scale, 300 * scale, 900 * scale, 40 * scale);
    // Districts (flat colours by kind).
    for (const d of DISTRICTS) {
      const b = d.bounds;
      mm.fillStyle = d.id === 'neon' ? '#3a2d5c' : d.id === 'plaza' ? '#8a97a0' : '#5a6a52';
      mm.fillRect(b[0] * scale, b[2] * scale, (b[1] - b[0]) * scale, (b[3] - b[2]) * scale);
    }
    // Roads: the grid lines.
    mm.fillStyle = '#2e3138';
    for (const r of [-252, -180, -108, -36, 36, 108, 180, 252]) {
      mm.fillRect(r * scale - 6 * scale, -312 * scale, 12 * scale, 624 * scale);
      mm.fillRect(-312 * scale, r * scale - 6 * scale, 624 * scale, 12 * scale);
    }
    // Buildings, approximated as block-centre dots.
    mm.fillStyle = '#c8c8c8';
    for (const bx of [-216, -144, -72, 0, 72, 144, 216]) {
      for (const bz of [-216, -144, -72, 0, 72, 144, 216]) {
        mm.fillRect((bx - 12) * scale, (bz - 12) * scale, 24 * scale, 24 * scale);
      }
    }
    // Shops as coloured dots.
    for (const shop of SHOPS) {
      const s = SPOTS[shop.spot];
      mm.fillStyle = '#' + shop.color.toString(16).padStart(6, '0');
      mm.beginPath();
      mm.arc(s.x * scale, s.z * scale, 5, 0, Math.PI * 2);
      mm.fill();
    }
    // Race starts as blue squares.
    mm.fillStyle = '#40d0ff';
    for (const race of Object.values(RACES)) {
      const s = SPOTS[race.start];
      mm.fillRect(s.x * scale - 4, s.z * scale - 4, 8, 8);
    }
    // Mission / race target: a gold ring.
    const t = G2.race.active
      ? SPOTS[RACES[G2.race.id].gates[G2.race.gate]]
      : G2.missions.missionTarget(G2);
    if (t && (G2.mission.started || G2.race.active)) {
      mm.fillStyle = '#ffd25f';
      mm.beginPath();
      mm.arc(t.x * scale, t.z * scale, 7, 0, Math.PI * 2);
      mm.fill();
      mm.strokeStyle = '#ffd25f';
      mm.lineWidth = 2;
      mm.beginPath();
      mm.arc(t.x * scale, t.z * scale, 11, 0, Math.PI * 2);
      mm.stroke();
    }
    // Pink GPS route to the objective, following the road grid.
    const route = gpsRoute(G2);
    if (route) {
      mm.lineJoin = 'round';
      mm.lineCap = 'round';
      mm.strokeStyle = '#ffffff';
      mm.lineWidth = 5;
      mm.beginPath();
      route.forEach(([x, z], i) => {
        if (i === 0) mm.moveTo(x * scale, z * scale);
        else mm.lineTo(x * scale, z * scale);
      });
      mm.stroke();
      mm.strokeStyle = '#ff4fd8';
      mm.lineWidth = 3;
      mm.beginPath();
      route.forEach(([x, z], i) => {
        if (i === 0) mm.moveTo(x * scale, z * scale);
        else mm.lineTo(x * scale, z * scale);
      });
      mm.stroke();
    }
    // Police dots, blue; the helicopter gets a bigger one.
    mm.fillStyle = '#4080ff';
    for (const c of G2.police.cruisers) {
      mm.beginPath();
      mm.arc(c.x * scale, c.z * scale, 4, 0, Math.PI * 2);
      mm.fill();
    }
    if (G2.police.heli) {
      mm.beginPath();
      mm.arc(G2.police.heli.x * scale, G2.police.heli.z * scale, 5, 0, Math.PI * 2);
      mm.fill();
    }
    // Traffic as pale squares.
    mm.fillStyle = '#dddddd';
    for (const c of G2.trafficCars) {
      mm.fillRect(c.x * scale - 2, c.z * scale - 2, 4, 4);
    }
    // Player arrow, drawn unrotated at the centre.
    mm.restore();
    mm.save();
    mm.translate(S / 2, S / 2);
    mm.rotate(0);
    mm.fillStyle = p.car ? '#ffd25f' : '#ffffff';
    mm.beginPath();
    mm.moveTo(0, -9);
    mm.lineTo(6, 7);
    mm.lineTo(-6, 7);
    mm.closePath();
    mm.fill();
    mm.restore();
    // North tick at the top edge.
    mm.save();
    mm.translate(S / 2, S / 2);
    mm.rotate(-G2.camera.heading - Math.PI / 2);
    mm.fillStyle = '#ffffff';
    mm.font = 'bold 12px sans-serif';
    mm.textAlign = 'center';
    mm.fillText('N', 0, -S / 2 + 16);
    mm.restore();
  }

  /**
   * Pink GPS route waypoints (world coords) from the player to the
   * objective, routed along the road grid: onto the nearest vertical
   * road, across on the target's horizontal road, then to the target.
   */
  function gpsRoute(G2) {
    const t = G2.race.active
      ? SPOTS[RACES[G2.race.id].gates[G2.race.gate]]
      : G2.missions.missionTarget(G2);
    if (!t || (!G2.mission.started && !G2.race.active)) return null;
    const p = G2.player;
    const roads = [-252, -180, -108, -36, 36, 108, 180, 252];
    const nearestRoad = (v) => roads.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    const rx = nearestRoad(p.x);
    const rz = nearestRoad(t.z);
    const tx = nearestRoad(t.x);
    return [[p.x, p.z], [rx, p.z], [rx, rz], [tx, rz], [t.x, t.z]];
  }

  /**
   * Full-screen map (M key): coastline, roads, districts, shops,
   * race starts, the pink GPS route and the player — north-up, no
   * rotation, with a legend along the bottom.
   */
  function drawFullMap(G2) {
    const c = $('mapcanvas');
    const ctx = c.getContext('2d');
    const S = 560;
    const scale = S / 660; // world -330..330 maps onto the canvas
    const X = (x) => (x + 330) * scale;
    const Z = (z) => (z + 330) * scale;
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, S, S);
    // Bay water and beach along the south edge.
    ctx.fillStyle = '#2a6f9e';
    ctx.fillRect(0, Z(300), S, S - Z(300));
    ctx.fillStyle = '#e0c890';
    ctx.fillRect(0, Z(300), S, 40 * scale);
    // Districts with their names.
    for (const d of DISTRICTS) {
      const b = d.bounds;
      ctx.fillStyle = d.id === 'neon' ? '#3a2d5c' : d.id === 'plaza' ? '#5a646c' : '#3d4a38';
      ctx.fillRect(X(b[0]), Z(b[2]), (b[1] - b[0]) * scale, (b[3] - b[2]) * scale);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.name, X((b[0] + b[1]) / 2), Z((b[2] + b[3]) / 2));
    }
    // Roads.
    ctx.fillStyle = '#2e3138';
    for (const r of [-252, -180, -108, -36, 36, 108, 180, 252]) {
      ctx.fillRect(X(r) - 5 * scale, 0, 10 * scale, S);
      ctx.fillRect(0, Z(r) - 5 * scale, S, 10 * scale);
    }
    // Shops.
    for (const shop of SHOPS) {
      const s = SPOTS[shop.spot];
      ctx.fillStyle = '#' + shop.color.toString(16).padStart(6, '0');
      ctx.beginPath();
      ctx.arc(X(s.x), Z(s.z), 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Race starts.
    ctx.fillStyle = '#40d0ff';
    for (const race of Object.values(RACES)) {
      const s = SPOTS[race.start];
      ctx.fillRect(X(s.x) - 4, Z(s.z) - 4, 8, 8);
    }
    // Pink GPS route and the objective marker.
    const t = G2.race.active
      ? SPOTS[RACES[G2.race.id].gates[G2.race.gate]]
      : G2.missions.missionTarget(G2);
    if (t && (G2.mission.started || G2.race.active)) {
      const route = gpsRoute(G2);
      if (route) {
        ctx.strokeStyle = '#ff4fd8';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        route.forEach(([x, z], i) => {
          if (i === 0) ctx.moveTo(X(x), Z(z));
          else ctx.lineTo(X(x), Z(z));
        });
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd25f';
      ctx.beginPath();
      ctx.arc(X(t.x), Z(t.z), 7, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police cruisers.
    ctx.fillStyle = '#4080ff';
    for (const cc of G2.police.cruisers) {
      ctx.beginPath();
      ctx.arc(X(cc.x), Z(cc.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow, rotated to the heading.
    const p = G2.player;
    ctx.save();
    ctx.translate(X(p.x), Z(p.z));
    ctx.rotate(p.heading + Math.PI / 2);
    ctx.fillStyle = p.car ? '#ffd25f' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Legend.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('● shop    ■ race start    ★ objective    ▲ you    ● police', 12, S - 12);
  }

  return H;
}

// hud.js — every screen the player sees: the in-game HUD (health,
// money, wanted stars, speed, mission objective), the live canvas
// minimap, dialogue boxes, and the start / pause / busted / wasted /
// complete screens.
import { clamp, fmtMoney, fmtTime } from './util.js';
import { drawMinimapBase } from './city.js';
import { currentMission, currentStep, missionTarget } from './missions.js';

const W = 1280;
const H = 720;

/** Filled rounded-rectangle panel path, used by every HUD card. */
function panel(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** One wanted star: filled gold when lit, ghosted otherwise. */
function star(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffd25f' : 'rgba(255,255,255,0.25)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Word-wrap a line of dialogue inside the box. */
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lh;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

/** True when a stealable car is within E range of the player. */
function nearCar(G) {
  if (!G.player.onFoot) return false;
  for (const car of G.cars) {
    const dx = car.x - G.player.x;
    const dy = car.y - G.player.y;
    if (dx * dx + dy * dy < 70 * 70) return true;
  }
  return false;
}

export function drawHUD(ctx, G) {
  const p = G.player;
  ctx.save();

  // ---- top-left: name, health bar, money, missions ----
  ctx.fillStyle = 'rgba(10,12,20,0.55)';
  panel(ctx, 14, 14, 250, 86, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('RAE SOLANO', 26, 36);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(26, 44, 180, 12);
  ctx.fillStyle = p.health > 50 ? '#4ade80' : p.health > 25 ? '#f5b83d' : '#ef4444';
  ctx.fillRect(27, 45, 178 * clamp(p.health / p.maxHealth, 0, 1), 10);
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.fillText(Math.round(p.health) + ' HP', 212, 55);
  ctx.fillStyle = '#7CFC9A';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(fmtMoney(G.money), 26, 82);
  ctx.fillStyle = '#c8d0dc';
  ctx.font = '12px sans-serif';
  ctx.fillText('Missions: ' + G.missionsDone + ' / 5', 150, 82);

  // ---- wanted stars (flashing red while the heat is fresh) ----
  const flash = G.wantedFlash > 0 && Math.floor(G.time * 6) % 2 === 0;
  ctx.fillStyle = flash ? 'rgba(239,68,68,0.55)' : 'rgba(10,12,20,0.55)';
  panel(ctx, 14, 108, 250, 40, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('WANTED', 26, 133);
  for (let i = 0; i < 5; i++) star(ctx, 108 + i * 30, 128, 11, i < G.wanted);
  if (G.lastWantedReason && G.wanted > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const rw = ctx.measureText(G.lastWantedReason).width + 12;
    ctx.fillRect(22, 152, rw, 18);
    ctx.fillStyle = '#ffd9d9';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(G.lastWantedReason, 28, 165);
  }

  // ---- bottom-left: controls hint and context prompt ----
  ctx.fillStyle = 'rgba(10,12,20,0.55)';
  panel(ctx, 14, H - 64, 430, 50, 10);
  ctx.fill();
  ctx.fillStyle = '#e8ecf2';
  ctx.font = '12px sans-serif';
  ctx.fillText(
    p.onFoot
      ? 'WASD move · Shift sprint · E enter car · Click shoot · F punch · R reload'
      : 'WASD drive · Space brake · E exit car · Click shoot (on foot) · P pause',
    26, H - 44,
  );
  ctx.fillStyle = '#ffd25f';
  ctx.fillText(
    p.onFoot && nearCar(G)
      ? 'E — enter car'
      : (p.car ? 'E — exit car · ' + Math.round(Math.abs(p.car.speed) * 0.36) + ' km/h' : ''),
    26, H - 26,
  );

  // ---- bottom-centre: current mission objective ----
  const m = currentMission(G);
  const step = currentStep(G);
  if (m && G.mission.started) {
    ctx.fillStyle = 'rgba(10,12,20,0.65)';
    panel(ctx, W / 2 - 260, H - 64, 520, 50, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd25f';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MISSION ' + (G.mission.index + 1) + ' — ' + m.title.toUpperCase(), W / 2, H - 44);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.fillText(step ? step.text : '', W / 2, H - 26);
    ctx.textAlign = 'left';
  }

  // ---- top-right: minimap ----
  drawMinimap(ctx, G);

  // ---- top-centre: notice toast ----
  if (G.noticeT > 0 && G.notice) {
    ctx.globalAlpha = clamp(G.noticeT, 0, 1);
    ctx.fillStyle = 'rgba(10,12,20,0.7)';
    const tw = ctx.measureText(G.notice).width + 32;
    panel(ctx, W / 2 - tw / 2, 16, tw, 30, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(G.notice, W / 2, 36);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // ---- bust countdown ----
  if (G.bustMeter > 0) {
    ctx.fillStyle = 'rgba(10,12,20,0.7)';
    panel(ctx, W / 2 - 130, 56, 260, 26, 8);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED IN ' + (2.2 * (1 - G.bustMeter)).toFixed(1) + 's — RUN!', W / 2, 74);
    ctx.textAlign = 'left';
  }

  // ---- dialogue box ----
  if (G.mission.dialogue) {
    const d = G.mission.dialogue;
    const line = d.lines[d.i];
    ctx.fillStyle = 'rgba(8,10,18,0.82)';
    panel(ctx, W / 2 - 340, H - 150, 680, 72, 10);
    ctx.fill();
    ctx.strokeStyle = '#ffd25f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffd25f';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('▼  ENTER — continue', W / 2 - 320, H - 122);
    ctx.fillStyle = '#fff';
    ctx.font = '15px sans-serif';
    wrapText(ctx, line, W / 2 - 320, H - 98, 640, 20);
  }

  // ---- damage vignette ----
  if (p.hurtFlash > 0) {
    ctx.fillStyle = 'rgba(220,30,30,' + clamp(p.hurtFlash * 0.5, 0, 0.35) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/** The live minimap: roads, parks, mission marker, cars, player arrow. */
export function drawMinimap(ctx, G) {
  const size = 190;
  const x = W - size - 16;
  const y = 16;
  const { sx, sy, h } = drawMinimapBase(ctx, G.city, x, y, size);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 1, y - 1, size + 2, h + 2);
  // Mission marker (pulsing gold dot).
  const t = missionTarget(G);
  if (t && G.mission.started) {
    const pulse = 1 + Math.sin(G.time * 5) * 0.25;
    ctx.fillStyle = '#ffd25f';
    ctx.beginPath();
    ctx.arc(x + t.x * sx, y + t.y * sy, 5 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5c00';
    ctx.stroke();
  }
  // Traffic (white) and police (red) dots.
  ctx.fillStyle = '#fff';
  for (const car of G.trafficCars) ctx.fillRect(x + car.x * sx - 1, y + car.y * sy - 1, 2.5, 2.5);
  ctx.fillStyle = '#ff4040';
  for (const car of G.police.cars) {
    ctx.beginPath();
    ctx.arc(x + car.x * sx, y + car.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow, rotated to the facing / driving direction.
  const px = x + G.player.x * sx;
  const py = y + G.player.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(G.player.angle + Math.PI / 2);
  ctx.fillStyle = '#ffd25f';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('SOLMAR CITY', x, y + h + 14);
  ctx.restore();
}

// ---- full screens -----------------------------------------------------

/** A sunset skyline behind the menu screens. */
function drawBackdrop(ctx) {
  ctx.save();
  ctx.fillStyle = '#f2a65a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffcf7a';
  ctx.beginPath();
  ctx.arc(W * 0.72, 150, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(60, 120, 220, 14);
  ctx.fillRect(320, 80, 160, 12);
  // Skyline silhouettes with lit windows.
  const heights = [180, 260, 210, 320, 240, 290, 170, 350, 230, 280];
  for (let i = 0; i < heights.length; i++) {
    const bw = W / heights.length;
    ctx.fillStyle = i % 2 ? '#2a2438' : '#3a2f4a';
    ctx.fillRect(i * bw + 8, H - heights[i] - 120, bw - 16, heights[i] + 120);
    ctx.fillStyle = 'rgba(255,210,95,0.75)';
    for (let wy = H - heights[i] - 100; wy < H - 140; wy += 26) {
      for (let wx = i * bw + 18; wx < (i + 1) * bw - 10; wx += 22) {
        if ((wx + wy) % 3 === 0) ctx.fillRect(wx, wy, 8, 10);
      }
    }
  }
  ctx.fillStyle = '#1c2438';
  ctx.fillRect(0, H - 120, W, 120);
  ctx.fillStyle = '#ffd25f';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('S O L M A R   C I T Y', W / 2, H - 60);
  ctx.restore();
}

export function drawStartScreen(ctx, G) {
  drawBackdrop(ctx);
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,18,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  // Sun-soaked title with a neon glow.
  ctx.fillStyle = '#ffd25f';
  ctx.font = 'bold 74px sans-serif';
  ctx.shadowColor = '#ff5fa2';
  ctx.shadowBlur = 26;
  ctx.fillText('VICE CITY NIGHTS', W / 2, 190);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('An open-world crime story in Solmar City', W / 2, 232);
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#dfe6ef';
  ctx.fillText('Steal cars. Outrun the law. Run five jobs for Marla Voss — and take the bay.', W / 2, 262);
  // Menu card.
  ctx.fillStyle = 'rgba(10,12,20,0.78)';
  panel(ctx, W / 2 - 300, 300, 600, 210, 14);
  ctx.fill();
  ctx.strokeStyle = '#ffd25f';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('▶  CLICK or press ENTER to start', W / 2, 348);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#c8d0dc';
  ctx.fillText('WASD move / drive · E enter & exit cars · Mouse aim, Click shoot', W / 2, 384);
  ctx.fillText('F punch · R reload · Space brake · Shift sprint · P pause · M mute', W / 2, 408);
  ctx.fillText('Progress saves automatically. Missions, wanted stars and the', W / 2, 438);
  ctx.fillText('minimap are all live in-game. No network needed — play offline.', W / 2, 462);
  if (G.hasSave) {
    ctx.fillStyle = '#7CFC9A';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('A saved game was found — press C to CONTINUE it', W / 2, 496);
  }
  ctx.fillStyle = '#8a94a6';
  ctx.font = '12px sans-serif';
  ctx.fillText('An original game. Own city, characters, story, art and music.', W / 2, 560);
  ctx.fillText('Nothing from any commercial game. Best played in desktop Chrome.', W / 2, 580);
  ctx.restore();
}

export function drawPauseScreen(ctx, G) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,18,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText('PAUSED', W / 2, 300);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#dfe6ef';
  ctx.fillText('P or Esc — resume   ·   S — save now   ·   M — mute', W / 2, 340);
  ctx.fillText('Money ' + fmtMoney(G.money) + '   ·   Missions ' + G.missionsDone + ' / 5   ·   Time ' + fmtTime(G.time), W / 2, 372);
  ctx.restore();
}

export function drawEndScreen(ctx, G, kind) {
  ctx.save();
  ctx.fillStyle = kind === 'complete' ? 'rgba(8,26,14,0.72)' : 'rgba(20,8,10,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  if (kind === 'wasted') {
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 84px sans-serif';
    ctx.fillText('WASTED', W / 2, 300);
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.fillText('Rae went down in Solmar City. The bay does not forget.', W / 2, 340);
  } else if (kind === 'busted') {
    ctx.fillStyle = '#f5b83d';
    ctx.font = 'bold 84px sans-serif';
    ctx.fillText('BUSTED', W / 2, 300);
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.fillText('The Solmar PD caught up. Bail is $200 — the story continues.', W / 2, 340);
  } else {
    ctx.fillStyle = '#7CFC9A';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText('KING OF THE BAY', W / 2, 280);
    ctx.fillStyle = '#ffd25f';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('All five jobs done. Solmar City is yours, Rae.', W / 2, 330);
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.fillText('Final take: ' + fmtMoney(G.money), W / 2, 366);
  }
  ctx.fillStyle = '#dfe6ef';
  ctx.font = '15px sans-serif';
  ctx.fillText('Money ' + fmtMoney(G.money) + '   ·   Missions ' + G.missionsDone + ' / 5   ·   Cars stolen ' + G.stats.carsStolen + '   ·   Time ' + fmtTime(G.time), W / 2, 410);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('Press ENTER to keep playing in free roam', W / 2, 460);
  ctx.restore();
}

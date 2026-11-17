// save.js — localStorage persistence for Vice City Nights.
// The save holds progression only (money, mission, position, health).
// It never holds code, and a corrupt or missing save just starts fresh.
const SAVE_KEY = 'vice-city-nights-save-v1';

/** Write the current progression to localStorage. Returns true on success. */
export function saveGame(G) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      money: Math.floor(G.money),
      health: Math.round(G.player.health),
      missionIndex: G.mission.index,
      missionsDone: G.missionsDone,
      carsStolen: G.stats.carsStolen,
      arrests: G.stats.arrests,
      playSeconds: Math.floor(G.time),
      playerX: Math.round(G.player.x),
      playerY: Math.round(G.player.y),
      inCar: !!G.player.car,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

/** Read the save, or null when there is none / it is corrupt / old. */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

/** Delete the save, ignoring storage errors. */
export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    /* storage unavailable: nothing to clear */
  }
}

/** True when a loadable save exists. */
export function hasSave() {
  return loadGame() !== null;
}

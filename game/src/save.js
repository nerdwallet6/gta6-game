// save.js — localStorage save / load for Solmar Nights 3D.
// Saves money, missions, weapons, outfits, respect, stats, position,
// time of day, car upgrades and race bests. Never throws: a bad or
// missing save just means a fresh game.
const KEY = 'solmar-nights-save-v1';

export function createSave() {
  return {
    saveGame(G) {
      try {
        const data = {
          v: 1,
          money: G.money,
          missionsDone: G.missionsDone,
          missionIndex: G.mission.index,
          missionDone: G.mission.done,
          weapons: G.weapons,
          weaponCurrent: G.weapon.current,
          weaponMods: G.weaponMods,
          outfitsOwned: G.outfitsOwned,
          outfit: G.player.outfit,
          protagonist: G.protagonistIndex,
          respect: G.respect,
          stats: G.stats,
          raceBest: G.race.best,
          player: {
            x: G.player.x, z: G.player.z, heading: G.player.heading,
            health: G.player.health, armor: G.player.armor,
          },
          timeOfDay: G.timeOfDay,
          radioStation: G.audio.getRadioStation(),
          ownedCar: G.ownedCar,
        };
        localStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    },

    loadGame() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || d.v !== 1) return null;
        return d;
      } catch {
        return null;
      }
    },

    hasSave() {
      try {
        return !!localStorage.getItem(KEY);
      } catch {
        return false;
      }
    },

    /** Apply a loaded save onto a live game state. */
    applySave(G, d) {
      G.money = d.money;
      G.missionsDone = d.missionsDone;
      G.mission.index = d.missionIndex;
      G.mission.done = d.missionDone;
      G.mission.started = false;
      G.mission.step = 0;
      G.weapons = d.weapons;
      G.weapon.current = d.weaponCurrent || 'pistol';
      G.weaponMods = d.weaponMods || {};
      G.outfitsOwned = d.outfitsOwned || ['street'];
      G.player.outfit = d.outfit || 'street';
      G.player.masked = (d.outfit === 'mask');
      G.protagonistIndex = d.protagonist || 0;
      G.respect = d.respect || {};
      G.stats = { ...G.stats, ...d.stats };
      G.race.best = d.raceBest || {};
      G.player.x = d.player.x;
      G.player.z = d.player.z;
      G.player.heading = d.player.heading;
      G.player.health = d.player.health;
      G.player.armor = d.player.armor;
      G.timeOfDay = d.timeOfDay !== undefined ? d.timeOfDay : 18.75;
      if (G.audio.setRadioStation) G.audio.setRadioStation(d.radioStation || 0);
      G.ownedCar = d.ownedCar || null;
    },

    clearSave() {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
    },
  };
}

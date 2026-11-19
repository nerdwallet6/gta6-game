// economy.js — money in, money out: gun shop, clothing shop, garage
// upgrades, safehouse (save / heal / clear a star), and the race start
// markers. Shop menus are rendered by hud.js; this module owns the
// catalogue, the prices and what each purchase does.
import { SHOPS, SPOTS, WEAPONS, WEAPON_ORDER, OUTFITS, RACES } from './data.js';
import { dist2, fmtMoney } from './util.js';
import { startRace } from './streetRaces.js';
import { garageUpgradeRows } from './garageUpgrades.js';

/** The shop (or race marker) the player is standing in, if any. */
export function nearbyShop(G) {
  const p = G.player;
  for (const shop of SHOPS) {
    const s = SPOTS[shop.spot];
    if (dist2(p.x, p.z, s.x, s.z) < 10) return shop;
  }
  return null;
}

/** The race start the player is standing on, if any. */
export function nearbyRace(G) {
  const p = G.player;
  for (const [id, race] of Object.entries(RACES)) {
    const s = SPOTS[race.start];
    if (dist2(p.x, p.z, s.x, s.z) < 10) return { id, ...race };
  }
  return null;
}

/** Menu rows for a shop: {label, price, can, hint, action}. */
export function shopMenu(G, shopId) {
  const rows = [];
  if (shopId === 'guns') {
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      const owned = G.weapons[id].owned;
      rows.push({
        label: owned ? w.name + ' — buy ammo (' + G.weapons[id].reserve + ' held)' : w.name + ' — ' + w.dmg + ' dmg',
        price: owned ? w.ammoPrice : w.price,
        hint: owned ? 'Ammo +30' : 'New weapon',
        // Stat bars for the weapon locker (0-100 each).
        bars: {
          DMG: Math.round((w.dmg / 42) * 100),
          RNG: Math.round((w.range / 130) * 100),
          RATE: Math.round(((1 / w.rate) / 12) * 100),
        },
        action: () => buyWeapon(G, id),
      });
    }
    // Attachments for the currently equipped weapon.
    const cur = G.weapon.current;
    const mods = G.weaponMods[cur] || {};
    rows.push({
      label: 'Suppressor — ' + WEAPONS[cur].name + (mods.suppressor ? ' (fitted)' : ''),
      price: mods.suppressor ? 0 : 350,
      hint: mods.suppressor ? 'Fitted' : 'Halves the chance gunfire draws police',
      action: () => buyAttachment(G, cur, 'suppressor'),
    });
    rows.push({
      label: 'Extended mag — ' + WEAPONS[cur].name + (mods.extmag ? ' (fitted)' : ''),
      price: mods.extmag ? 0 : 250,
      hint: mods.extmag ? 'Fitted' : '+50% magazine size',
      action: () => buyAttachment(G, cur, 'extmag'),
    });
    rows.push({
      label: 'Body armor (+50)',
      price: 200,
      hint: 'Absorbs damage first',
      action: () => {
        if (!spend(G, 200)) return false;
        G.player.armor = Math.min(100, G.player.armor + 50);
        return true;
      },
    });
  } else if (shopId === 'clothes') {
    for (const [id, out] of Object.entries(OUTFITS)) {
      const owned = G.outfitsOwned.includes(id);
      rows.push({
        label: out.name + (out.mask ? ' (hides your face)' : ''),
        price: owned ? 0 : out.price,
        hint: owned ? 'Wear it' : 'Buy + wear',
        action: () => wearOutfit(G, id),
      });
    }
  } else if (shopId === 'garage') {
    rows.push(...garageUpgradeRows(G, spend));
  } else if (shopId === 'safehouse') {
    rows.push({
      label: 'Save game + heal',
      price: 0,
      hint: 'Full health, progress saved',
      action: () => {
        G.player.health = 100;
        G.save.saveGame(G);
        return true;
      },
    });
    rows.push({
      label: 'Lay low — clear 1 wanted star',
      price: 100,
      hint: 'Costs $100, needs 1+ stars',
      action: () => {
        if (G.police.level < 1) return false;
        if (!spend(G, 100)) return false;
        G.police.heat = Math.max(0, G.police.heat - 20);
        if (G.police.level > 0) G.police.level = Math.max(0, G.police.level - 1);
        return true;
      },
    });
    rows.push({
      label: 'Change outfit (wardrobe)',
      price: 0,
      hint: 'Switch between owned outfits',
      action: () => {
        G.hud.openMenu('clothes', 'Wardrobe — owned outfits');
        return true;
      },
    });
    rows.push({
      label: 'Store the car outside as your safehouse car',
      price: 0,
      hint: 'It respawns here every time you load',
      action: () => {
        let best = null;
        let bestD = 15;
        for (const car of G.cars) {
          if (car.driver === 'player') continue;
          const d = dist2(car.x, car.z, G.player.x, G.player.z);
          if (d < bestD) { best = car; bestD = d; }
        }
        if (!best) {
          G.notice = 'No car nearby — park one outside first.';
          G.noticeT = 2;
          return false;
        }
        G.ownedCar = {
          type: best.type, color: best.color,
          upgrades: { ...best.upgrades }, nos: best.nos || 0,
        };
        G.save.saveGame(G);
        G.notice = best.spec.name + ' stored at the safehouse.';
        G.noticeT = 2;
        return true;
      },
    });
  }
  return rows;
}

function spend(G, amount) {
  if (G.money < amount) {
    G.notice = 'Not enough cash — need ' + fmtMoney(amount);
    G.noticeT = 2;
    G.audio.sfx('deny');
    return false;
  }
  G.money -= amount;
  G.audio.sfx('cash');
  return true;
}

function buyWeapon(G, id) {
  const w = WEAPONS[id];
  const st = G.weapons[id];
  if (!st.owned) {
    if (!spend(G, w.price)) return false;
    st.owned = true;
    st.magMax = w.mag;
    st.mag = w.mag;
    st.reserve = 30;
    G.weapon.current = id;
    G.notice = 'Bought ' + w.name + '!';
    G.noticeT = 2;
    return true;
  }
  if (!spend(G, w.ammoPrice)) return false;
  st.reserve += 30;
  return true;
}

/** Buy a suppressor / extended mag for one weapon. */
function buyAttachment(G, id, kind) {
  const mods = G.weaponMods[id] || (G.weaponMods[id] = {});
  if (mods[kind]) {
    G.notice = 'Already fitted';
    G.noticeT = 1.5;
    return false;
  }
  const price = kind === 'suppressor' ? 350 : 250;
  if (!spend(G, price)) return false;
  mods[kind] = true;
  if (kind === 'extmag') {
    const st = G.weapons[id];
    st.magMax = Math.floor(WEAPONS[id].mag * 1.5);
    st.mag = st.magMax;
  }
  G.notice = (kind === 'suppressor' ? 'Suppressor' : 'Extended mag') +
    ' fitted to ' + WEAPONS[id].name + '.';
  G.noticeT = 2;
  G.save.saveGame(G);
  return true;
}

function wearOutfit(G, id) {
  const out = OUTFITS[id];
  const owned = G.outfitsOwned.includes(id);
  if (!owned) {
    if (!spend(G, out.price)) return false;
    G.outfitsOwned.push(id);
  }
  G.player.outfit = id;
  G.player.masked = !!out.mask;
  G.player.humanoid.setOutfit(id);
  // Changing clothes clears the police "knows clothing" icon; a mask
  // also clears "knows face".
  G.police.knows.clothing = false;
  if (out.mask) G.police.knows.face = false;
  G.notice = 'Now wearing: ' + out.name;
  G.noticeT = 2;
  G.audio.sfx('pickup');
  G.save.saveGame(G);
  return true;
}

/** E at a race start: start the race. */
export function tryStartRace(G) {
  const race = nearbyRace(G);
  if (!race || G.race.active) return false;
  if (!G.player.car) {
    G.notice = 'Races need a car — bring one to the start line.';
    G.noticeT = 2.5;
    return true;
  }
  startRace(G, race.id);
  return true;
}

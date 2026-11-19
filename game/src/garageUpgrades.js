// garageUpgrades.js — the garage: engine tunes, armor plating, paint and
// the NOS boost kit for the player's car. Upgrades apply to the car the
// player drove in; NOS is spent by holding Shift while driving and
// refills slowly. spend(G, amount) is passed in from the economy module.
import { GARAGE_UPGRADES } from './data.js';

export { GARAGE_UPGRADES };

/** Menu rows for the garage (empty-car case included). */
export function garageUpgradeRows(G, spend) {
  const rows = [];
  if (!G.player.car) {
    rows.push({ label: 'No car — bring a car to the garage', price: 0, hint: '', action: () => false });
    return rows;
  }
  for (const up of GARAGE_UPGRADES) {
    rows.push({
      label: up.name + (up.apply === 'nos' && G.player.car.upgrades.nos ? ' (owned)' : ''),
      price: up.price,
      hint: 'For your ' + (G.player.car.spec.name || 'car'),
      action: () => buyGarageUpgrade(G, up, spend),
    });
  }
  return rows;
}

/** Buy + apply one garage upgrade to the player's current car. */
export function buyGarageUpgrade(G, up, spend) {
  const car = G.player.car;
  if (!car) return false;
  if (up.apply === 'engine') {
    if (car.upgrades.engine >= 3) {
      G.notice = 'Engine already maxed';
      G.noticeT = 2;
      return false;
    }
    if (!spend(G, up.price)) return false;
    car.upgrades.engine++;
  } else if (up.apply === 'armor') {
    if (!spend(G, up.price)) return false;
    car.upgrades.armor++;
    car.maxHealth += 60;
    car.health = car.maxHealth;
  } else if (up.apply === 'paint') {
    if (!spend(G, up.price)) return false;
    car.color = up.color;
    car.group.children.forEach((c) => {
      if (c.geometry && c.geometry.type === 'BoxGeometry' && c.position.y === 0.55) {
        c.material = new (c.material.constructor)({ color: up.color });
      }
    });
  } else if (up.apply === 'nos') {
    if (car.upgrades.nos) {
      G.notice = 'NOS already installed';
      G.noticeT = 2;
      return false;
    }
    if (!spend(G, up.price)) return false;
    car.upgrades.nos = true;
    car.nos = 100;
    car.nosMax = 100;
    G.notice = 'NOS installed — hold Shift while driving to boost!';
  }
  if (up.apply !== 'nos') G.notice = 'Installed: ' + up.name;
  G.noticeT = 2;
  G.save.saveGame(G);
  return true;
}

/** NOS state for the HUD meter (0-100, 0 when no NOS kit). */
export function nosLevel(car) {
  if (!car || !car.upgrades || !car.upgrades.nos) return 0;
  return Math.max(0, Math.min(100, car.nos || 0));
}

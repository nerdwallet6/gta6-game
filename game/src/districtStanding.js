// districtStanding.js — per-district standing (0-100 each): missions and
// street races raise standing in the district where they happen. Standing
// feeds total respect, which gates later missions and sets the rank title.
export function addDistrictStanding(G, districtId, amount) {
  if (!districtId) return;
  G.respect[districtId] = Math.min(100, (G.respect[districtId] || 0) + amount);
}

/** Standing in one district (0 when never worked there). */
export function districtStanding(G, districtId) {
  return G.respect[districtId] || 0;
}

/** Backwards-compatible alias: addRespect is district standing. */
export function addRespect(G, districtId, amount) {
  return addDistrictStanding(G, districtId, amount);
}

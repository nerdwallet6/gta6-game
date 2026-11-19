// respectRanks.js — respect ranks: total respect across all districts
// maps to a street rank title. Later story missions are gated on total
// respect, so the rank is the visible face of progression.
import { RESPECT_RANKS } from './data.js';

export { RESPECT_RANKS };

/** Total respect: the sum of standing across every district. */
export function totalRespect(G) {
  return Object.values(G.respect).reduce((a, b) => a + b, 0);
}

/** The rank entry for a total: { at, title }. */
export function respectRankFor(total) {
  let rank = RESPECT_RANKS[0];
  for (const r of RESPECT_RANKS) if (total >= r.at) rank = r;
  return rank;
}

/** The player's current rank title. */
export function respectRankTitle(G) {
  return respectRankFor(totalRespect(G)).title;
}

/** Respect still needed for the next rank (0 when maxed). */
export function respectToNextRank(G) {
  const total = totalRespect(G);
  for (const r of RESPECT_RANKS) if (total < r.at) return r.at - total;
  return 0;
}

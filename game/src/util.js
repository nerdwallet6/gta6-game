// util.js — shared math, angles and seeded randomness for Solmar Nights 3D.
// Pure helpers only: no game state, no DOM, no side effects.

export const TAU = Math.PI * 2;

/** Clamp v into [lo, hi]. */
export function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/** Linear interpolation between a and b. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Euclidean distance on the XZ ground plane. */
export function dist2(x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dz * dz);
}

/** 3D distance. */
export function dist3(x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Shortest signed rotation from angle a to angle b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Interpolate angles along the shortest arc. */
export function angleLerp(a, b, t) {
  return a + angleDelta(a, b) * clamp(t, 0, 1);
}

/**
 * mulberry32: a tiny deterministic PRNG. The same seed always yields the
 * same sequence, so the city and every staged screenshot rebuild exactly.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience wrapper: next(), range(), int(), pick(), chance(). */
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(lo, hi) {
      return lo + next() * (hi - lo);
    },
    int(lo, hi) {
      return Math.floor(lo + next() * (hi - lo + 1));
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    chance(p) {
      return next() < p;
    },
  };
}

/** FNV-1a hash of a string, used to seed staged scenes by name. */
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** "$1,240" style money formatting. */
export function fmtMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

/** "3:07" style clock formatting for seconds. */
export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

/** "17:30" style clock for a 0-24 hour value. */
export function fmtClock(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

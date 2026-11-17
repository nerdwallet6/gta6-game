// util.js — small math and seeded-random helpers shared by every system.
// Nothing here knows about the game itself; it is pure arithmetic.
export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleTo(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

// Shortest signed turn from angle a toward angle b, in (-PI, PI].
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angleDelta(a, b) * clamp(t, 0, 1);
}

// Deterministic PRNG (mulberry32) so the city and the staged screenshot
// scenes rebuild identically from a seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

// A tiny deterministic hash of a string, used to seed scenes by name.
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function fmtMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

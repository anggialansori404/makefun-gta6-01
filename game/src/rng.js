// rng.js — deterministic seeded randomness for Velvet Tide.
// The whole city, its traffic and its crowds grow from one seed so a given
// seed always builds the same Port Azura (the screenshot poses rely on it).

export function hashSeed(text) {
  let h = 2166136261 >>> 0;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.state = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 1;
  }

  // mulberry32 step; returns a float in [0, 1).
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length) % list.length];
  }

  chance(p) {
    return this.next() < p;
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

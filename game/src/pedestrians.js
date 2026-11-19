// pedestrians.js — the people of Port Azura. They stroll the sidewalks and
// the promenade, scatter when a car mounts the kerb or a shot rings out, and
// — importantly — they are the city's eyes: crimes they see get reported.

import { resolveCollision } from './city.js';
import { turnToward } from './vehicles.js';

const SHIRTS = ['#e4572e', '#17a398', '#f2c14e', '#e8e8e8', '#7d5ba6', '#2e86e4', '#ef6f9c', '#43aa8b', '#f4f1de'];
const PANTS = ['#2f3e46', '#5a4a3a', '#e8e8e8', '#35424a', '#7a6a53', '#22333b'];

let nextPedId = 1;

export class Ped {
  constructor(x, y, rng) {
    this.id = nextPedId++;
    this.x = x;
    this.y = y;
    this.angle = rng.range(0, Math.PI * 2);
    this.speed = 0;
    this.walkSpeed = rng.range(38, 62);
    this.state = 'walk';
    this.axis = null;
    this.dir = 1;
    this.line = 0;
    this.tx = x;
    this.ty = y;
    this.shirt = rng.pick(SHIRTS);
    this.pants = rng.pick(PANTS);
    this.skin = rng.pick(['#f2c9a0', '#c68863', '#8d5a3b', '#6e442a', '#ffd9b3']);
    this.panicUntil = 0;
    this.downUntil = 0;
    this.standUntil = 0;
    this.radius = 9;
    this.dead = false;
  }
}

// Sidewalk lines run just off each road's kerb; the promenade is one more.
function sidewalkLines(city) {
  const v = [];
  const h = [3196];
  for (const vx of city.vRoads) { v.push(vx - 54, vx + 54); }
  for (const hy of city.hRoads) { h.push(hy - 54, hy + 54); }
  return { v, h };
}

function pickLeg(G, ped) {
  const lines = sidewalkLines(G.city);
  const rng = G.rng;
  if (!ped.axis || rng.chance(0.4)) {
    // Snap to the nearest line of a random orientation.
    if (rng.chance(0.5)) {
      ped.axis = 'v';
      ped.line = lines.v.reduce((a, b) => (Math.abs(ped.x - a) < Math.abs(ped.x - b) ? a : b));
    } else {
      ped.axis = 'h';
      ped.line = lines.h.reduce((a, b) => (Math.abs(ped.y - a) < Math.abs(ped.y - b) ? a : b));
    }
    ped.dir = rng.chance(0.5) ? 1 : -1;
  } else {
    // Turn onto the crossing line at the intersection we reached.
    if (ped.axis === 'v') {
      ped.axis = 'h';
      ped.line = lines.h.reduce((a, b) => (Math.abs(ped.y - a) < Math.abs(ped.y - b) ? a : b));
    } else {
      ped.axis = 'v';
      ped.line = lines.v.reduce((a, b) => (Math.abs(ped.x - a) < Math.abs(ped.x - b) ? a : b));
    }
    ped.dir = rng.chance(0.5) ? 1 : -1;
  }
  advanceTarget(G, ped);
}

function advanceTarget(G, ped) {
  const lines = sidewalkLines(G.city);
  if (ped.axis === 'v') {
    const crossings = lines.h.filter((hy) => (hy - ped.y) * ped.dir > 60);
    ped.tx = ped.line;
    ped.ty = crossings.length
      ? crossings.reduce((a, b) => (Math.abs(a - ped.y) < Math.abs(b - ped.y) ? a : b))
      : (ped.dir > 0 ? 3180 : 90);
  } else {
    const crossings = lines.v.filter((vx) => (vx - ped.x) * ped.dir > 60);
    ped.tx = crossings.length
      ? crossings.reduce((a, b) => (Math.abs(a - ped.x) < Math.abs(b - ped.x) ? a : b))
      : (ped.dir > 0 ? 3510 : 90);
    ped.ty = ped.line;
  }
}

export function spawnPed(G) {
  const rng = G.rng;
  const p = G.player;
  for (let tries = 0; tries < 10; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(380, 880);
    const x = p.x + Math.cos(a) * d;
    const y = p.y + Math.sin(a) * d;
    if (x < 60 || y < 60 || x > G.city.size - 60 || y > 3180) continue;
    const ped = new Ped(x, y, rng);
    const fixed = resolveCollision(G.city, x, y, ped.radius);
    ped.x = fixed.x;
    ped.y = fixed.y;
    pickLeg(G, ped);
    return ped;
  }
  return null;
}

export function scarePeds(G, x, y, radius) {
  for (const ped of G.peds) {
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius && ped.state !== 'down') {
      ped.state = 'flee';
      ped.panicUntil = G.time + G.rng.range(1.6, 3.4);
      ped.angle = Math.atan2(ped.y - y, ped.x - x) + G.rng.range(-0.5, 0.5);
    }
  }
}

export function updatePed(G, ped, dt) {
  const rng = G.rng;
  if (ped.state === 'down') {
    ped.speed = 0;
    if (G.time > ped.downUntil) ped.state = 'walk';
    return;
  }
  if (ped.state === 'flee') {
    if (G.time > ped.panicUntil) {
      ped.state = 'walk';
      ped.axis = null;
      pickLeg(G, ped);
    } else {
      ped.speed = 158;
      stepPed(G, ped, dt, ped.angle);
      return;
    }
  }
  // Walking: pause now and then to check a phone or the view.
  if (ped.state === 'stand') {
    ped.speed = 0;
    if (G.time > ped.standUntil) ped.state = 'walk';
    return;
  }
  if (rng.chance(0.0016)) {
    ped.state = 'stand';
    ped.standUntil = G.time + rng.range(1.5, 4);
    return;
  }
  const dx = ped.tx - ped.x;
  const dy = ped.ty - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 14) {
    pickLeg(G, ped);
    return;
  }
  const want = Math.atan2(dy, dx);
  ped.angle = turnToward(ped.angle, want, 5.5 * dt);
  ped.speed = ped.walkSpeed;
  stepPed(G, ped, dt, ped.angle);
}

function stepPed(G, ped, dt, angle) {
  const nx = ped.x + Math.cos(angle) * ped.speed * dt;
  const ny = ped.y + Math.sin(angle) * ped.speed * dt;
  if (ny > 3210) { ped.angle += Math.PI; return; }
  const fixed = resolveCollision(G.city, nx, ny, ped.radius);
  ped.x = fixed.x;
  ped.y = fixed.y;
}

// A car meeting a pedestrian at speed puts them down — and if the car is the
// player's, that is a crime the whole street just witnessed.
export function checkPedCarHits(G, car) {
  if (Math.abs(car.speed) < 55) return;
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - car.x, ped.y - car.y);
    if (d < car.radius + 8) {
      ped.state = 'down';
      ped.downUntil = G.time + 7;
      ped.x += Math.cos(car.angle) * 16;
      ped.y += Math.sin(car.angle) * 16;
      G.spawnSparks(ped.x, ped.y, 5);
      if (car === G.player.car) {
        G.reportCrime(120, ped.x, ped.y, true);
        G.hurtPlayer(4);
        G.sfx.crash(0.5);
      } else if (Math.hypot(ped.x - G.player.x, ped.y - G.player.y) < 300) {
        G.sfx.crash(0.4);
      }
      scarePeds(G, ped.x, ped.y, 190);
    }
  }
}

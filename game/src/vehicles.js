// vehicles.js — every car in Port Azura: the Car body, the traffic that
// cruises the avenues, the parked cars waiting to be borrowed, and the
// driving model the player uses once behind a wheel.

import { Rng } from './rng.js';
import { pointBlocked, resolveCollision } from './city.js';

export const CAR_TYPES = {
  sedan: { w: 40, h: 20, top: 305, accel: 200, grip: 3.4, colors: ['#c94f43', '#4a7fb5', '#e3e0d8', '#5d8a66', '#8a6fb8', '#d9a441', '#707880'] },
  hatch: { w: 36, h: 19, top: 280, accel: 195, grip: 3.6, colors: ['#e07b39', '#7fb069', '#e3e0d8', '#4a7fb5', '#b8546e'] },
  taxi: { w: 40, h: 20, top: 295, accel: 200, grip: 3.4, colors: ['#f7b731'] },
  sport: { w: 42, h: 19, top: 445, accel: 315, grip: 4.1, colors: ['#20b2aa', '#e33f5e', '#f2f2f2', '#ffb400', '#30343c'] },
  van: { w: 48, h: 22, top: 245, accel: 165, grip: 2.9, colors: ['#e3e0d8', '#7a8a99', '#4a7fb5', '#c9c2b4'] },
  cop: { w: 42, h: 20, top: 415, accel: 300, grip: 3.9, colors: ['#20242c'] },
};

let nextCarId = 1;

export class Car {
  constructor(type, x, y, angle, rng, kind = 'traffic') {
    const spec = CAR_TYPES[type];
    this.id = nextCarId++;
    this.type = type;
    this.spec = spec;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 0;
    this.steer = 0;
    this.color = kind === 'cop' ? '#20242c' : rng.pick(spec.colors);
    this.kind = kind;
    this.hp = 100;
    this.wrecked = false;
    this.radius = spec.w / 2;
    // Traffic brain: which road it follows, which way, and its seek point.
    this.axis = null;
    this.dir = 1;
    this.road = 0;
    this.tx = x;
    this.ty = y;
    this.cruise = rng.range(120, 185);
    this.honkAt = 0;
    this.smokeAt = 0;
    this.occupied = false;
    this.lightPhase = rng.range(0, Math.PI * 2);
  }

  get moving() {
    return Math.abs(this.speed) > 4;
  }
}

export function spawnParkedCars(city, rng, count) {
  const cars = [];
  const spots = [];
  let guard = 0;
  while (spots.length < count && guard++ < count * 40) {
    const vx = rng.pick(city.vRoads);
    const side = rng.sign();
    // On the kerb, clear of the traffic lanes and the building faces.
    const x = vx + side * (city.roadHalf + 9);
    const y = rng.range(170, 2960);
    if (city.hRoads.some((hy) => Math.abs(y - hy) < 78)) continue;
    if (spots.some((s) => Math.abs(s.y - y) < 52 && Math.abs(s.x - x) < 30)) continue;
    spots.push({ x, y });
  }
  for (const s of spots) {
    const type = rng.pick(['sedan', 'sedan', 'hatch', 'hatch', 'van', 'sport']);
    const car = new Car(type, s.x, s.y, Math.PI / 2, rng, 'parked');
    cars.push(car);
  }
  // The marina hero car the story needs: a teal Comet coupe, always there,
  // parked on the sand by the parkade where the promenade can see it.
  const hero = new Car('sport', 2900, 3172, -Math.PI / 2, rng, 'parked');
  hero.color = '#20b2aa';
  hero.heroCar = true;
  cars.push(hero);
  return cars;
}

export function makeCopCar(x, y, rng) {
  const car = new Car('cop', x, y, 0, rng, 'cop');
  car.cruise = 400;
  return car;
}

// --- traffic ----------------------------------------------------------------

function laneOffset(car) {
  // Right-hand traffic: offset to the right of the direction of travel.
  return 20;
}

function pickLeg(city, car, rng) {
  // Choose the road leg the car will follow next from where it stands.
  const nearV = city.vRoads.reduce((a, b) => (Math.abs(car.x - a) < Math.abs(car.x - b) ? a : b));
  const nearH = city.hRoads.reduce((a, b) => (Math.abs(car.y - a) < Math.abs(car.y - b) ? a : b));
  if (Math.abs(car.x - nearV) <= Math.abs(car.y - nearH)) {
    car.axis = 'v';
    car.road = nearV;
    car.dir = rng.chance(0.5) ? 1 : -1;
    if (Math.abs(car.speed) > 10) car.dir = Math.sign(Math.sin(car.angle)) || car.dir;
  } else {
    car.axis = 'h';
    car.road = nearH;
    car.dir = rng.chance(0.5) ? 1 : -1;
    if (Math.abs(car.speed) > 10) car.dir = Math.sign(Math.cos(car.angle)) || car.dir;
  }
  advanceTarget(city, car, rng);
}

function advanceTarget(city, car, rng) {
  const off = laneOffset(car);
  if (car.axis === 'v') {
    // Right-hand traffic: heading down-screen keeps the west lane, and back.
    const lx = car.road + (car.dir > 0 ? -off : off);
    // Next intersection ahead, or the end of the road.
    const crossings = city.hRoads.filter((hy) => (hy - car.y) * car.dir > 30);
    const nextY = crossings.length
      ? crossings.reduce((a, b) => (Math.abs(a - car.y) < Math.abs(b - car.y) ? a : b))
      : (car.dir > 0 ? 3050 : 120);
    car.tx = lx;
    car.ty = nextY;
    car.turnAt = nextY;
  } else {
    const ly = car.road + (car.dir > 0 ? off : -off);
    const crossings = city.vRoads.filter((vx) => (vx - car.x) * car.dir > 30);
    const nextX = crossings.length
      ? crossings.reduce((a, b) => (Math.abs(a - car.x) < Math.abs(b - car.x) ? a : b))
      : (car.dir > 0 ? 3480 : 120);
    car.tx = nextX;
    car.ty = ly;
    car.turnAt = nextX;
  }
}

export function spawnTrafficCar(city, rng, player) {
  for (let tries = 0; tries < 12; tries++) {
    const vertical = rng.chance(0.5);
    const road = vertical ? rng.pick(city.vRoads) : rng.pick(city.hRoads);
    const along = rng.range(140, 3000);
    const x = vertical ? road : along;
    const y = vertical ? along : road;
    const d = Math.hypot(x - player.x, y - player.y);
    if (d < 520 || d > 1500) continue;
    const type = rng.pick(['sedan', 'sedan', 'hatch', 'taxi', 'van', 'sport']);
    const car = new Car(type, x, y, 0, rng, 'traffic');
    pickLeg(city, car, rng);
    car.angle = targetAngle(car);
    return car;
  }
  return null;
}

function targetAngle(car) {
  return Math.atan2(car.ty - car.y, car.tx - car.x);
}

export function updateTrafficCar(G, car, dt) {
  const city = G.city;
  const rng = G.rng;
  if (car.wrecked) {
    car.speed = approach(car.speed, 0, 260 * dt);
    moveCar(G, car, dt);
    return;
  }
  if (!car.axis) pickLeg(city, car, rng);

  // Reached the intersection the leg aimed at: turn or carry on.
  const distToTurn = car.axis === 'v' ? (car.turnAt - car.y) * car.dir : (car.turnAt - car.x) * car.dir;
  if (distToTurn < 26) {
    const crossRoad = car.axis === 'v' ? car.turnAt : car.turnAt;
    if (rng.chance(0.45)) {
      // Turn onto the crossing road.
      if (car.axis === 'v') {
        car.axis = 'h';
        car.road = crossRoad;
        car.dir = rng.chance(0.5) ? 1 : -1;
      } else {
        car.axis = 'v';
        car.road = crossRoad;
        car.dir = rng.chance(0.5) ? 1 : -1;
      }
    }
    advanceTarget(city, car, rng);
  }

  // Obstacle scan: anything solid in the lane ahead means brakes.
  let want = car.cruise;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead < 4 || ahead > 86) continue;
    const side = Math.abs(dx * -fy + dy * fx);
    if (side < 24) { want = Math.min(want, Math.max(0, other.speed - 12)); }
  }
  const p = G.player;
  if (!p.inCar) {
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const ahead = dx * fx + dy * fy;
    const side = Math.abs(dx * -fy + dy * fx);
    if (ahead > 0 && ahead < 64 && side < 22) {
      want = 0;
      if (G.time > car.honkAt && Math.abs(car.speed) > 20) {
        car.honkAt = G.time + rng.range(2, 6);
        if (Math.hypot(dx, dy) < 320) G.sfx.horn();
      }
    }
  }

  car.speed = approach(car.speed, want, (want > car.speed ? car.spec.accel * 0.55 : 340) * dt);
  const ta = targetAngle(car);
  car.angle = turnToward(car.angle, ta, 2.4 * dt);
  moveCar(G, car, dt);
}

// Shared movement + collision for every car, whoever drives it.
export function moveCar(G, car, dt) {
  const step = car.speed * dt;
  const nx = car.x + Math.cos(car.angle) * step;
  const ny = car.y + Math.sin(car.angle) * step;
  // Buildings and the bay stop cars dead; note the impact for damage.
  if (pointBlocked(G.city, nx, ny, car.radius * 0.72)) {
    if (Math.abs(car.speed) > 120) {
      damageCar(G, car, Math.abs(car.speed) * 0.055);
      G.onCarCrash(car, Math.abs(car.speed));
    }
    car.speed = -car.speed * 0.22;
    const fixed = resolveCollision(G.city, car.x, car.y, car.radius * 0.72);
    car.x = fixed.x;
    car.y = fixed.y;
    return;
  }
  car.x = nx;
  car.y = ny;
  // Car-to-car bumps, tested as oriented boxes so a car can slip past a
  // parked one on the kerb without shoving it, but nose-to-tail contact
  // still lands with a crunch.
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = car.x - other.x;
    const dy = car.y - other.y;
    if (Math.abs(dx) > 64 || Math.abs(dy) > 64) continue;
    const cos = Math.cos(-car.angle);
    const sin = Math.sin(-car.angle);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    const ex = (car.spec.w + other.spec.w) / 2 - 5;
    const ey = (car.spec.h + other.spec.h) / 2 - 2;
    if (Math.abs(lx) >= ex || Math.abs(ly) >= ey) continue;
    const penX = ex - Math.abs(lx);
    const penY = ey - Math.abs(ly);
    let pushX = 0;
    let pushY = 0;
    if (penX < penY) {
      const s = Math.sign(lx) || 1;
      pushX = Math.cos(car.angle) * s * penX;
      pushY = Math.sin(car.angle) * s * penX;
    } else {
      const s = Math.sign(ly) || 1;
      pushX = -Math.sin(car.angle) * s * penY;
      pushY = Math.cos(car.angle) * s * penY;
    }
    car.x += pushX / 2;
    car.y += pushY / 2;
    if (other.kind !== 'parked' || other.moving) {
      other.x -= pushX / 2;
      other.y -= pushY / 2;
    }
    const rel = Math.abs(car.speed - other.speed);
    if (rel > 90) {
      damageCar(G, car, rel * 0.05);
      damageCar(G, other, rel * 0.05);
      G.onCarCrash(car, rel);
      G.spawnSparks((car.x + other.x) / 2, (car.y + other.y) / 2, 8);
      car.speed *= 0.55;
      other.speed *= 0.55;
    }
  }
}

export function damageCar(G, car, amount) {
  if (car.wrecked) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.wrecked = true;
    G.spawnSmoke(car.x, car.y, 14);
    if (G.player.car === car) G.onPlayerCarWrecked(car);
  }
}

// The player's driving model: throttle, reverse, steering that bites harder
// at low speed, a handbrake that trades grip for angle.
export function driveCar(G, car, dt, ctl) {
  const spec = car.spec;
  if (car.wrecked) {
    car.speed = approach(car.speed, 0, 200 * dt);
    moveCar(G, car, dt);
    return;
  }
  if (ctl.up) car.speed += spec.accel * dt * (car.speed < 0 ? 2.2 : 1);
  else if (ctl.down) car.speed -= (car.speed > 0 ? 330 : spec.accel * 0.55) * dt;
  else car.speed = approach(car.speed, 0, 60 * dt);
  const maxRev = -spec.top * 0.32;
  car.speed = Math.max(maxRev, Math.min(spec.top, car.speed));
  // Rolling drag.
  car.speed -= car.speed * 0.22 * dt;
  const steerInput = (ctl.left ? -1 : 0) + (ctl.right ? 1 : 0);
  const speedNorm = Math.abs(car.speed) / spec.top;
  const steerRate = (1.15 + 1.5 * (1 - Math.min(1, speedNorm))) * (ctl.handbrake ? 1.7 : 1);
  if (Math.abs(car.speed) > 6) {
    car.angle += steerInput * steerRate * dt * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 90);
  }
  car.steer = steerInput;
  moveCar(G, car, dt);
  if (Math.abs(car.speed) > 130 && G.time > car.smokeAt) {
    car.smokeAt = G.time + 0.09;
    if (Math.abs(steerInput) > 0 && ctl.handbrake) G.spawnSmoke(car.x, car.y, 1, true);
  }
}

export function approach(value, target, step) {
  if (value < target) return Math.min(target, value + step);
  return Math.max(target, value - step);
}

export function turnToward(angle, target, step) {
  let diff = (target - angle) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= step) return target;
  return angle + Math.sign(diff) * step;
}

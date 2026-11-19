// police.js — the PAPD: a heat-and-stars wanted system, cruisers that hunt
// the player's last seen position, foot officers who pile out when the
// player runs on foot, and the busted meter that ends a chase badly.

import { makeCopCar, moveCar, turnToward, approach } from './vehicles.js';
import { losBlocked, randomRoadPoint } from './city.js';

const STAR_THRESHOLDS = [30, 90, 180, 300, 450];

export class Police {
  constructor() {
    this.heat = 0;
    this.stars = 0;
    this.footCops = [];
    this.bustedMeter = 0;
    this.lastSeenX = 0;
    this.lastSeenY = 0;
    this.lastSeenAt = -99;
    this.spawnAt = 0;
    this.everSeen = false;
  }

  addHeat(G, severity) {
    this.heat = Math.min(560, this.heat + severity);
    this.lastSeenX = G.player.x;
    this.lastSeenY = G.player.y;
    this.lastSeenAt = G.time;
    this.everSeen = true;
    this.recount();
  }

  recount() {
    let s = 0;
    for (const t of STAR_THRESHOLDS) if (this.heat >= t) s++;
    this.stars = s;
  }

  clear() {
    this.heat = 0;
    this.stars = 0;
    this.bustedMeter = 0;
    this.footCops.length = 0;
  }

  playerSeen(G) {
    const p = G.player;
    for (const car of G.cars) {
      if (car.kind !== 'cop' || car.wrecked) continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < 470 && !losBlocked(G.city, car.x, car.y, p.x, p.y)) return true;
    }
    for (const cop of this.footCops) {
      const d = Math.hypot(cop.x - p.x, cop.y - p.y);
      if (d < 300 && !losBlocked(G.city, cop.x, cop.y, p.x, p.y)) return true;
    }
    return false;
  }

  update(G, dt) {
    const p = G.player;
    const seen = this.stars > 0 && this.playerSeen(G);
    if (seen) {
      this.lastSeenX = p.x;
      this.lastSeenY = p.y;
      this.lastSeenAt = G.time;
    }
    // Heat cools fast while nobody can see the player, slowly under pursuit.
    if (this.heat > 0) {
      const searching = G.time - this.lastSeenAt > 4;
      this.heat = Math.max(0, this.heat - (searching ? 7.5 : 0.7) * dt);
      this.recount();
      if (this.stars === 0) this.bustedMeter = Math.max(0, this.bustedMeter - 40 * dt);
    }

    this.updateSpawning(G, dt);
    for (const car of G.cars) {
      if (car.kind === 'cop') this.driveCopCar(G, car, dt, seen);
    }
    this.updateFootCops(G, dt, seen);
    this.updateBusted(G, dt);
  }

  updateSpawning(G, dt) {
    const want = this.stars === 0 ? 0 : Math.min(2 + this.stars, 7);
    const cops = G.cars.filter((c) => c.kind === 'cop');
    // Trim cruisers that are hopelessly far away once the heat is off.
    if (this.stars === 0) {
      for (const car of cops) {
        if (Math.hypot(car.x - G.player.x, car.y - G.player.y) > 800) removeCar(G, car);
      }
      return;
    }
    if (cops.length >= want || G.time < this.spawnAt) return;
    this.spawnAt = G.time + 1.1;
    for (let tries = 0; tries < 8; tries++) {
      const spot = randomRoadPoint(G.city, G.rng);
      const d = Math.hypot(spot.x - G.player.x, spot.y - G.player.y);
      if (d < 600 || d > 1050) continue;
      const car = makeCopCar(spot.x, spot.y, G.rng);
      car.angle = Math.atan2(G.player.y - spot.y, G.player.x - spot.x);
      G.cars.push(car);
      return;
    }
  }

  driveCopCar(G, car, dt, seen) {
    if (car.wrecked) {
      car.speed = approach(car.speed, 0, 240 * dt);
      moveCar(G, car, dt);
      return;
    }
    const p = G.player;
    const hunting = seen || G.time - this.lastSeenAt < 6;
    const tx = hunting ? this.lastSeenX : car.tx ?? car.x;
    const ty = hunting ? this.lastSeenY : car.ty ?? car.y;
    const dist = Math.hypot(tx - car.x, ty - car.y);
    // On foot and close: stop and let the foot officers out instead of
    // running the player down.
    if (!p.inCar && dist < 95 && this.stars >= 1) {
      car.speed = approach(car.speed, 0, 420 * dt);
      moveCar(G, car, dt);
      this.maybeDeployFootCop(G, car);
      return;
    }
    if (!hunting && dist < 60) {
      car.speed = approach(car.speed, 0, 200 * dt);
      moveCar(G, car, dt);
      return;
    }
    // Lead the target a touch so chases cut corners like they mean it.
    const lead = p.inCar ? Math.min(0.55, dist / 700) : 0;
    const aimX = tx + (p.inCar ? Math.cos(p.car.angle) * p.car.speed * lead : 0);
    const aimY = ty + (p.inCar ? Math.sin(p.car.angle) * p.car.speed * lead : 0);
    const want = Math.atan2(aimY - car.y, aimX - car.x);
    car.angle = turnToward(car.angle, want, 3.1 * dt);
    let target = car.spec.top;
    if (dist < 130) target = Math.max(120, dist * 2.2);
    if (p.inCar && dist < 60) target = Math.abs(p.car.speed) + 60; // sit on the bumper
    car.speed = approach(car.speed, target, (target > car.speed ? car.spec.accel : 430) * dt);
    moveCar(G, car, dt);
  }

  maybeDeployFootCop(G, car) {
    const maxFoot = Math.min(3, this.stars);
    if (this.footCops.length >= maxFoot) return;
    if (this.footCops.some((c) => c.fromCar === car.id)) return;
    this.footCops.push({
      x: car.x + G.rng.range(-14, 14),
      y: car.y + G.rng.range(-14, 14),
      angle: car.angle,
      speed: 0,
      fromCar: car.id,
      radius: 9,
    });
    G.sfx.door();
  }

  updateFootCops(G, dt, seen) {
    const p = G.player;
    for (let i = this.footCops.length - 1; i >= 0; i--) {
      const cop = this.footCops[i];
      const d = Math.hypot(p.x - cop.x, p.y - cop.y);
      // Back to the car when the player drives off or the heat dies.
      if (this.stars === 0 || (p.inCar && d > 260)) {
        this.footCops.splice(i, 1);
        continue;
      }
      const want = Math.atan2(p.y - cop.y, p.x - cop.x);
      cop.angle = turnToward(cop.angle, want, 7 * dt);
      cop.speed = d > 26 ? 172 : 0;
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      void seen;
    }
  }

  updateBusted(G, dt) {
    if (this.stars === 0 || G.state !== 'playing') return;
    const p = G.player;
    const pSpeed = p.inCar ? Math.abs(p.car.speed) : (p.moving ? 120 : 0);
    let pressure = false;
    for (const cop of this.footCops) {
      if (Math.hypot(cop.x - p.x, cop.y - p.y) < 34) pressure = true;
    }
    if (!pressure && pSpeed < 30) {
      for (const car of G.cars) {
        if (car.kind !== 'cop' || car.wrecked) continue;
        if (Math.hypot(car.x - p.x, car.y - p.y) < 62) { pressure = true; break; }
      }
    }
    if (pressure) this.bustedMeter = Math.min(100, this.bustedMeter + 52 * dt);
    else this.bustedMeter = Math.max(0, this.bustedMeter - 25 * dt);
    if (this.bustedMeter >= 100) G.onBusted();
  }

  nearestCopDistance(G) {
    let best = Infinity;
    for (const car of G.cars) {
      if (car.kind !== 'cop') continue;
      best = Math.min(best, Math.hypot(car.x - G.player.x, car.y - G.player.y));
    }
    return best;
  }
}

function removeCar(G, car) {
  const i = G.cars.indexOf(car);
  if (i >= 0) G.cars.splice(i, 1);
}

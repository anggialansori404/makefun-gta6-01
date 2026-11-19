// player.js — Nico Ferreira on foot and behind the wheel: walking and
// sprinting, slipping into other people's cars, driving them, and the
// pistol work that tends to follow.

import { down, input } from './input.js';
import { resolveCollision } from './city.js';
import { driveCar } from './vehicles.js';

const WALK = 128;
const SPRINT = 198;

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = -Math.PI / 2;
    this.aimAngle = -Math.PI / 2;
    this.speed = 0;
    this.moving = false;
    this.radius = 10;
    this.health = 100;
    this.inCar = false;
    this.car = null;
    this.fireAt = 0;
    this.lastShotReportAt = -9;
    this.lastHurtAt = -9;
    this.walkCycle = 0;
    this.enterAt = 0;
  }
}

export function updatePlayer(G, dt) {
  const p = G.player;
  // Slow recovery once the shooting stops.
  if (G.time - p.lastHurtAt > 7 && p.health > 0 && p.health < 100) {
    p.health = Math.min(100, p.health + 3.2 * dt);
  }
  p.aimAngle = Math.atan2(
    (G.camera.y + input.mouseY) - p.y,
    (G.camera.x + input.mouseX) - p.x,
  );
  if (p.inCar) updateDriving(G, dt);
  else updateOnFoot(G, dt);
  updateBullets(G, dt);
}

function updateOnFoot(G, dt) {
  const p = G.player;
  let mx = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
  let my = (down('KeyS', 'ArrowDown') ? 1 : 0) - (down('KeyW', 'ArrowUp') ? 1 : 0);
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  if (len > 0) {
    mx /= len;
    my /= len;
    const sprint = down('ShiftLeft', 'ShiftRight');
    const sp = sprint ? SPRINT : WALK;
    p.speed = sp;
    p.angle = Math.atan2(my, mx);
    p.walkCycle += dt * (sprint ? 11 : 8);
    const nx = p.x + mx * sp * dt;
    const ny = p.y + my * sp * dt;
    const fixed = resolveCollision(G.city, nx, ny, p.radius);
    p.x = fixed.x;
    p.y = fixed.y;
  } else {
    p.speed = 0;
  }

  // Enter the nearest usable car.
  if (down('KeyE') && G.time > p.enterAt) {
    const car = nearestCar(G, p.x, p.y, 58);
    if (car && !car.wrecked) enterCar(G, car);
  }

  // Pistol: hold the mouse to fire toward the cursor.
  if (input.mouseDown && G.time >= p.fireAt && G.state === 'playing') {
    p.fireAt = G.time + 0.135;
    fireBullet(G);
  }
}

function updateDriving(G, dt) {
  const p = G.player;
  const car = p.car;
  const ctl = {
    up: down('KeyW', 'ArrowUp'),
    down: down('KeyS', 'ArrowDown'),
    left: down('KeyA', 'ArrowLeft'),
    right: down('KeyD', 'ArrowRight'),
    handbrake: down(' '),
  };
  if (down('KeyH') && G.time > (car.honkAt || 0)) {
    car.honkAt = G.time + 0.5;
    G.sfx.horn();
  }
  driveCar(G, car, dt, ctl);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  G.sfx.engine(Math.abs(car.speed) / car.spec.top, true);
  if (down('KeyE') && G.time > p.enterAt && Math.abs(car.speed) < 240) {
    exitCar(G);
  }
}

export function nearestCar(G, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    const d = Math.hypot(car.x - x, car.y - y) - car.radius;
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(G, car) {
  const p = G.player;
  p.enterAt = G.time + 0.45;
  const wasParked = car.kind === 'parked';
  if (car.kind === 'traffic') {
    // Yank the driver out; they land on the pavement and run.
    const ped = G.spawnPedAt(car.x + 18, car.y + 10);
    if (ped) { ped.state = 'flee'; ped.panicUntil = G.time + 3; }
    car.kind = 'parked';
  }
  car.occupied = true;
  p.inCar = true;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  G.sfx.door();
  if (wasParked || car.stolenOnce !== true) {
    car.stolenOnce = true;
    G.reportCrime(55, car.x, car.y);
  }
  G.onEnterCar(car);
}

export function exitCar(G) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  p.enterAt = G.time + 0.45;
  car.occupied = false;
  p.inCar = false;
  p.car = null;
  // Step out on the left side, clear of the bodywork and any wall.
  const side = car.angle - Math.PI / 2;
  const nx = car.x + Math.cos(side) * (car.radius + 13);
  const ny = car.y + Math.sin(side) * (car.radius + 13);
  const fixed = resolveCollision(G.city, nx, ny, p.radius);
  p.x = fixed.x;
  p.y = fixed.y;
  G.sfx.door();
  G.sfx.engine(0, false);
  G.onExitCar(car);
}

function fireBullet(G) {
  const p = G.player;
  const spread = (G.rng.next() - 0.5) * 0.045;
  G.bullets.push({
    x: p.x + Math.cos(p.aimAngle) * 14,
    y: p.y + Math.sin(p.aimAngle) * 14,
    angle: p.aimAngle + spread,
    speed: 980,
    life: 0.55,
  });
  G.spawnSparks(p.x + Math.cos(p.aimAngle) * 18, p.y + Math.sin(p.aimAngle) * 18, 1);
  G.sfx.shot();
  G.scareAt(p.x, p.y, 250);
  if (G.time - p.lastShotReportAt > 1.6) {
    p.lastShotReportAt = G.time;
    G.reportCrime(50, p.x, p.y);
  }
}

export function updateBullets(G, dt) {
  const bullets = G.bullets;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) {
      for (const bd of G.city.buildings) {
        if (b.x >= bd.x && b.x <= bd.x + bd.w && b.y >= bd.y && b.y <= bd.y + bd.h) { dead = true; break; }
      }
    }
    if (!dead) {
      for (const car of G.cars) {
        if (car === G.player.car && G.player.inCar) continue;
        if (Math.hypot(car.x - b.x, car.y - b.y) < car.radius) {
          G.damageCarShot(car, b);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const ped of G.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 12) {
          ped.state = 'down';
          ped.downUntil = G.time + 9;
          G.reportCrime(140, ped.x, ped.y);
          G.scareAt(ped.x, ped.y, 220);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      const cops = G.police.footCops;
      for (let j = cops.length - 1; j >= 0; j--) {
        if (Math.hypot(cops[j].x - b.x, cops[j].y - b.y) < 12) {
          cops.splice(j, 1);
          G.police.addHeat(G, 170);
          G.scareAt(b.x, b.y, 220);
          dead = true;
          break;
        }
      }
    }
    if (dead) bullets.splice(i, 1);
  }
}

// Traffic does not politely stop for the player character.
export function checkPlayerCarHits(G) {
  const p = G.player;
  if (p.inCar || G.state !== 'playing') return;
  for (const car of G.cars) {
    if (Math.abs(car.speed) < 85) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < car.radius + 9) {
      G.hurtPlayer(11);
      const push = Math.atan2(p.y - car.y, p.x - car.x);
      const fixed = resolveCollision(G.city, p.x + Math.cos(push) * 26, p.y + Math.sin(push) * 26, p.radius);
      p.x = fixed.x;
      p.y = fixed.y;
      car.speed *= 0.4;
    }
  }
}

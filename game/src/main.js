// main.js — Velvet Tide's conductor. Builds Port Azura from the seed, owns
// the shared game object every module reads, runs the state machine (title,
// playing, paused, busted, wasted), the crime-witness rule, saves, respawns,
// and the frame loop itself.

import { buildCity, losBlocked } from './city.js';
import { Rng } from './rng.js';
import { initInput, down, endFrameInput } from './input.js';
import { Sfx } from './audio.js';
import { Player, updatePlayer, checkPlayerCarHits, exitCar } from './player.js';
import { Car, spawnParkedCars, spawnTrafficCar, updateTrafficCar, damageCar } from './vehicles.js';
import { Ped, spawnPed, scarePeds, updatePed, checkPedCarHits } from './pedestrians.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { draw, createMinimapBase } from './render.js';
import { applyShotPose } from './shots.js';

const SAVE_KEY = 'velvet-tide-save-v1';
const DAY_LENGTH = 320; // seconds of play per full day

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const seed = params.get('seed') || '7';
const shot = params.get('shot');

const G = {
  view: { w: canvas.width, h: canvas.height },
  time: 0,
  dayTime: 0.44,
  state: 'title',
  money: 120,
  camera: { x: 0, y: 0, shake: 0 },
  bullets: [],
  particles: [],
  cars: [],
  peds: [],
  promptText: '',
  bannerState: null,
  dialogue: null,
  hurtFlash: 0,
  rng: new Rng('velvet-tide-' + seed),
  save: loadSave(),
  shotMode: shot,
};
G.city = buildCity(seed);
G.sfx = new Sfx();
G.player = new Player(G.city.places.pawnShop.x, G.city.places.pawnShop.y + 64);
G.police = new Police();
G.cars = spawnParkedCars(G.city, G.rng, 26);
G.missions = new Missions(G);
G.minimapBase = createMinimapBase(G.city);
G.money = G.save.money ?? 120;

if (G.save.missionIndex > 0 || G.money !== 120) {
  const btn = document.getElementById('btn-continue');
  if (btn) btn.style.display = '';
}

// --- save ---------------------------------------------------------------------

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* private mode etc. */ }
  return { money: 120, missionIndex: 0 };
}

G.persist = function () {
  G.save.money = G.money;
  G.save.missionIndex = G.missions ? G.missions.storyIndex : G.save.missionIndex;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch { /* ignore */ }
};

G.earn = function (amount) {
  G.money += amount;
  G.persist();
};

// --- dialogue & banners ---------------------------------------------------------

const dialogueQueue = [];
G.queueDialogue = function (lines) {
  for (const [who, text] of lines) dialogueQueue.push({ who, text });
  if (!G.dialogue) nextDialogue();
};
function nextDialogue() {
  const line = dialogueQueue.shift();
  G.dialogue = line ? { ...line, until: G.time + 3.6 } : null;
}
G.dialogueDone = function () {
  return !G.dialogue && dialogueQueue.length === 0;
};
G.banner = function (title, sub) {
  G.bannerState = { title, sub, at: G.time };
};

// --- crimes and witnesses ---------------------------------------------------------

G.reportCrime = function (severity, x, y) {
  // A crime only heats up if somebody saw it: a pedestrian with a clear
  // view, or an officer. Otherwise Port Azura never knew.
  let witnessed = false;
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < 290 && !losBlocked(G.city, ped.x, ped.y, x, y)) { witnessed = true; break; }
  }
  if (!witnessed) {
    for (const car of G.cars) {
      if (car.kind !== 'cop') continue;
      if (Math.hypot(car.x - x, car.y - y) < 470 && !losBlocked(G.city, car.x, car.y, x, y)) { witnessed = true; break; }
    }
  }
  if (witnessed) {
    G.police.addHeat(G, severity);
    scarePeds(G, x, y, 210);
  }
  return witnessed;
};

G.scareAt = function (x, y, r) {
  scarePeds(G, x, y, r);
};

// --- spawns the other modules ask for ----------------------------------------------

G.spawnPedAt = function (x, y) {
  const ped = new Ped(x, y, G.rng);
  G.peds.push(ped);
  return ped;
};

G.spawnMissionCar = function (x, y) {
  const car = new Car('sedan', x, y, Math.PI / 2, G.rng, 'parked');
  car.color = '#8a6fb8';
  G.cars.push(car);
  return car;
};

G.spawnMissionVan = function (x, y) {
  const van = new Car('van', x, y, 0, G.rng, 'parked');
  van.color = '#e3e0d8';
  G.cars.push(van);
  return van;
};

G.removeCar = function (car) {
  const i = G.cars.indexOf(car);
  if (i >= 0) G.cars.splice(i, 1);
};

G.removePed = function (ped) {
  const i = G.peds.indexOf(ped);
  if (i >= 0) G.peds.splice(i, 1);
};

G.damageCarShot = function (car) {
  damageCar(G, car, 9);
  G.spawnSparks(car.x, car.y, 3);
  if (car.kind === 'cop') {
    G.police.addHeat(G, 85);
  } else {
    if (car.kind === 'traffic') {
      car.kind = 'parked';
      const ped = G.spawnPedAt(car.x + 16, car.y + 8);
      ped.state = 'flee';
      ped.panicUntil = G.time + 3;
    }
    G.reportCrime(60, car.x, car.y);
  }
};

// --- particles ------------------------------------------------------------------------

G.spawnSparks = function (x, y, n) {
  for (let i = 0; i < n; i++) {
    G.particles.push({
      kind: 'spark', x, y,
      vx: G.rng.range(-70, 70), vy: G.rng.range(-70, 70),
      size: G.rng.range(1.5, 3), life: G.rng.range(0.2, 0.45), maxLife: 0.45,
    });
  }
};

G.spawnSmoke = function (x, y, n, tire = false) {
  for (let i = 0; i < n; i++) {
    G.particles.push({
      kind: tire ? 'tire' : 'smoke',
      x: x + G.rng.range(-6, 6), y: y + G.rng.range(-6, 6),
      vx: G.rng.range(-8, 8), vy: G.rng.range(-26, -12),
      size: G.rng.range(5, 11), life: G.rng.range(0.5, 1.1), maxLife: 1.1,
    });
  }
};

function updateParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const pt = G.particles[i];
    pt.x += (pt.vx || 0) * dt;
    pt.y += (pt.vy || 0) * dt;
    pt.life -= dt;
    if (pt.life <= 0) G.particles.splice(i, 1);
  }
}

// --- consequences ------------------------------------------------------------------------

G.onCarCrash = function (car, speed) {
  const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
  if (d < 340) G.sfx.crash(Math.min(1, speed / 380));
  if (car === G.player.car) {
    if (speed > 150) {
      G.hurtPlayer((speed - 130) * 0.045);
      G.camera.shake = Math.min(9, speed * 0.02);
    }
    if (speed > 230 && G.time - (car.lastCrimeAt || -9) > 4) {
      car.lastCrimeAt = G.time;
      G.reportCrime(22, car.x, car.y);
    }
  }
};

G.onEnterCar = function () {};
G.onExitCar = function () {};

G.onPlayerCarWrecked = function (car) {
  G.banner('Wrecked', 'The car gives up — get out and find another');
  exitCar(G);
  G.hurtPlayer(10);
  void car;
};

G.hurtPlayer = function (amount) {
  const p = G.player;
  if (G.state !== 'playing' || p.health <= 0) return;
  p.health -= amount;
  p.lastHurtAt = G.time;
  G.hurtFlash = 1;
  if (G.time - (G.lastHurtSfxAt || -9) > 0.4) {
    G.lastHurtSfxAt = G.time;
    G.sfx.hurt();
  }
  if (p.health <= 0) {
    p.health = 0;
    G.onWasted();
  }
};

G.onBusted = function () {
  if (G.state !== 'playing') return;
  G.state = 'busted';
  G.sfx.bustedSting();
  G.sfx.engine(0, false);
  G.sfx.siren(Infinity);
  show('busted-screen');
};

G.onWasted = function () {
  if (G.state !== 'playing') return;
  G.state = 'wasted';
  G.sfx.engine(0, false);
  G.sfx.siren(Infinity);
  show('wasted-screen');
};

function respawn(atHospital) {
  const p = G.player;
  if (p.inCar) {
    p.car.occupied = false;
    p.inCar = false;
    p.car = null;
  }
  const place = atHospital ? G.city.places.hospital : G.city.places.policeStation;
  const fine = atHospital ? 150 : Math.min(G.money, 100 + G.police.stars * 60);
  G.money = Math.max(0, G.money - fine);
  G.police.clear();
  for (const car of [...G.cars]) if (car.kind === 'cop') G.removeCar(car);
  p.health = 85;
  p.x = place.x;
  p.y = place.y + 40;
  G.missions.onPlayerDown(G);
  G.persist();
  hide('busted-screen');
  hide('wasted-screen');
  G.state = 'playing';
  G.banner(atHospital ? 'St. Coral Hospital' : 'PAPD Central', 'You are out $' + fine + ' — and the city kept spinning');
}

// --- DOM screens -----------------------------------------------------------------------------

function show(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}
function hide(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function startGame(fresh) {
  if (fresh) {
    G.save = { money: 120, missionIndex: 0 };
    G.money = 120;
    G.missions.storyIndex = 0;
    G.missions.storyDone = false;
    G.persist();
    const p = G.player;
    if (p.inCar) exitCar(G);
    p.x = G.city.places.pawnShop.x;
    p.y = G.city.places.pawnShop.y + 64;
    p.health = 100;
    G.police.clear();
  }
  hide('title-screen');
  G.state = 'playing';
  G.sfx.wake();
  G.sfx.click();
}

document.getElementById('btn-new').addEventListener('click', () => startGame(true));
document.getElementById('btn-continue').addEventListener('click', () => startGame(false));
document.getElementById('btn-resume').addEventListener('click', () => {
  hide('pause-screen');
  G.state = 'playing';
});
document.getElementById('btn-quit').addEventListener('click', () => {
  hide('pause-screen');
  show('title-screen');
  G.state = 'title';
});
document.getElementById('btn-busted').addEventListener('click', () => respawn(false));
document.getElementById('btn-wasted').addEventListener('click', () => respawn(true));
window.addEventListener('pointerdown', () => G.sfx.wake(), { once: true });
window.addEventListener('keydown', (ev) => {
  G.sfx.wake();
  if (ev.code === 'KeyP' || ev.code === 'Escape') {
    if (G.state === 'playing') { G.state = 'paused'; show('pause-screen'); }
    else if (G.state === 'paused') { G.state = 'playing'; hide('pause-screen'); }
  }
  if (ev.code === 'KeyE' && G.dialogue) nextDialogue();
});

// --- world upkeep -----------------------------------------------------------------------------

let trafficTimer = 0;
let pedTimer = 0;

function maintainWorld(dt) {
  trafficTimer -= dt;
  const traffic = G.cars.filter((c) => c.kind === 'traffic');
  if (trafficTimer <= 0 && traffic.length < 15) {
    trafficTimer = 0.7;
    const car = spawnTrafficCar(G.city, G.rng, G.player);
    if (car) G.cars.push(car);
  }
  for (let i = G.cars.length - 1; i >= 0; i--) {
    const car = G.cars[i];
    if (car.kind === 'traffic' && Math.hypot(car.x - G.player.x, car.y - G.player.y) > 1550) {
      G.cars.splice(i, 1);
    }
  }
  pedTimer -= dt;
  if (pedTimer <= 0 && G.peds.length < 20) {
    pedTimer = 0.5;
    const ped = spawnPed(G);
    if (ped) G.peds.push(ped);
  }
  for (let i = G.peds.length - 1; i >= 0; i--) {
    if (Math.hypot(G.peds[i].x - G.player.x, G.peds[i].y - G.player.y) > 1150) G.peds.splice(i, 1);
  }
}

function updatePrompt() {
  const p = G.player;
  if (G.state !== 'playing') { G.promptText = ''; return; }
  if (p.inCar) {
    G.promptText = Math.abs(p.car.speed) < 200 ? 'E — step out · H — horn · Space — handbrake' : '';
    return;
  }
  const car = G.cars.find((c) => !c.wrecked && Math.hypot(c.x - p.x, c.y - p.y) - c.radius < 46);
  G.promptText = car ? 'E — take the ' + car.type : 'WASD — move · Shift — sprint · Mouse — aim, click — fire';
}

// --- the loop --------------------------------------------------------------------------------------

function update(dt) {
  G.time += dt;
  G.dayTime = (G.dayTime + dt / DAY_LENGTH) % 1;
  G.hurtFlash = Math.max(0, G.hurtFlash - dt * 2.4);
  if (G.dialogue && G.time > G.dialogue.until) nextDialogue();

  maintainWorld(dt);
  for (const car of G.cars) {
    if (car.kind === 'traffic') updateTrafficCar(G, car, dt);
    if (car.wrecked && G.rng.chance(0.06)) G.spawnSmoke(car.x, car.y, 1);
    checkPedCarHits(G, car);
  }
  for (const ped of G.peds) updatePed(G, ped, dt);
  updateParticles(dt);

  if (G.state === 'playing') {
    updatePlayer(G, dt);
    G.police.update(G, dt);
    G.missions.update(G, dt);
    checkPlayerCarHits(G);
    G.sfx.siren(G.police.nearestCopDistance(G));
    updatePrompt();
  } else {
    G.sfx.siren(Infinity);
    G.promptText = '';
  }

  // Camera: follow with a lead toward travel, clamped to the world.
  const p = G.player;
  const lead = p.inCar ? 0.32 : 0.12;
  const tx = p.x + Math.cos(p.angle) * (p.inCar ? Math.abs(p.car.speed) * lead : 24) - G.view.w / 2;
  const ty = p.y + Math.sin(p.angle) * (p.inCar ? Math.abs(p.car.speed) * lead : 24) - G.view.h / 2;
  G.camera.x += (tx - G.camera.x) * Math.min(1, dt * 5);
  G.camera.y += (ty - G.camera.y) * Math.min(1, dt * 5);
  G.camera.x = Math.max(0, Math.min(G.city.size - G.view.w, G.camera.x));
  G.camera.y = Math.max(0, Math.min(G.city.size - G.view.h, G.camera.y));
  if (G.camera.shake > 0.2) {
    G.camera.x += G.rng.range(-G.camera.shake, G.camera.shake);
    G.camera.y += G.rng.range(-G.camera.shake, G.camera.shake);
    G.camera.shake *= Math.pow(0.02, dt);
  } else G.camera.shake = 0;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (G.state !== 'paused') update(dt);
  draw(G, ctx);
  endFrameInput();
  requestAnimationFrame(frame);
}

// --- boot --------------------------------------------------------------------------------------------

// A handle for automated smoke tests and curious players in the console.
window.__velvet = G;

initInput(canvas);
if (shot) {
  applyShotPose(G, shot);
  if (shot !== 'start') {
    hide('title-screen');
    G.state = 'playing';
  } else {
    show('title-screen');
  }
} else {
  show('title-screen');
}
// Seed the streets around the player so the first frame is already alive.
for (let i = 0; i < 10; i++) {
  const car = spawnTrafficCar(G.city, G.rng, G.player);
  if (car) G.cars.push(car);
}
for (let i = 0; i < 14; i++) {
  const ped = spawnPed(G);
  if (ped) G.peds.push(ped);
}
requestAnimationFrame(frame);

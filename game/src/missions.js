// missions.js — Sol Vega's story and the work Port Azura offers after it.
// Five story missions (an errand, a theft, a house call, a cold-chain run and
// the Velvet Tide score itself) plus three repeatable jobs: taxi fares,
// QuickPost courier runs and the Coast Run checkpoint race.

const STORY = [
  {
    id: 'errand',
    title: 'First Errand',
    pay: 150,
    intro: [
      ['Sol', 'Nico Ferreira. Heard you can drive and keep your mouth shut. Both rare in this town.'],
      ['Nico', 'I can do a third thing too. I can use the money.'],
      ['Sol', 'Then earn it. Pier 9, at the docks — a crate with my name on it. Take it to the Harbor Lockup. Quietly.'],
    ],
    outro: [
      ['Sol', 'On time and in one piece. You might be worth keeping around, Nico.'],
    ],
    stages: [
      { type: 'goto', at: 'docks', label: 'Pick up the crate at Pier 9' },
      { type: 'goto', at: 'lockup', label: 'Deliver the crate to the Harbor Lockup' },
    ],
  },
  {
    id: 'wheels',
    title: 'Borrowed Wheels',
    pay: 300,
    intro: [
      ['Sol', 'A collector owes me. His teal Comet coupe sits in the Marina Parkade, feeling sorry for itself.'],
      ['Nico', 'You want me to feel sorry for it too, or...'],
      ['Sol', 'Bring it to the lockup. If the PAPD sees you take it, that is your problem, not mine.'],
    ],
    outro: [
      ['Sol', 'Teal suits the lockup. The collector can walk from now on — good for his heart.'],
    ],
    stages: [
      { type: 'goto', at: 'marina', label: 'Go to the Marina Parkade' },
      { type: 'hero', label: 'Steal the teal Comet coupe' },
      { type: 'goto', at: 'lockup', label: 'Deliver the Comet to the Harbor Lockup', needHero: true },
    ],
  },
  {
    id: 'housecall',
    title: 'House Call',
    pay: 450,
    intro: [
      ['Sol', 'A gambler up in the Heights owes me four months of "tomorrow". His car is worth more than his word.'],
      ['Nico', 'Let me guess. I go explain economics to the car.'],
      ['Sol', 'Loudly. Then leave before the PAPD writes you a thank-you note.'],
    ],
    outro: [
      ['Sol', 'He paid in full an hour later. Amazing what a smoking engine does for a memory.'],
    ],
    stages: [
      { type: 'goto', at: 'heightsHouse', label: 'Drive up to the Heights' },
      { type: 'wreck', label: 'Wreck the debtor\u2019s car (shoot it or ram it)' },
      { type: 'escape', label: 'Lose the PAPD' },
    ],
  },
  {
    id: 'coldchain',
    title: 'Cold Chain',
    pay: 650,
    intro: [
      ['Sol', 'QuickPost has a chilled van that needs to reach the Heights, then the docks, before the ice gives up.'],
      ['Nico', 'And if the ice gives up?'],
      ['Sol', 'Then so does your fee. The van is waiting at the depot. Clock starts when you do.'],
    ],
    outro: [
      ['Sol', 'Still cold, still sealed. You drive like the tide is chasing you, Nico.'],
    ],
    stages: [
      { type: 'getvan', at: 'depot', label: 'Collect the chilled van at QuickPost' },
      { type: 'timer', at: 'heightsHouse', seconds: 150, label: 'Deliver to the Heights — keep it cold' },
      { type: 'timer', at: 'docks', seconds: 130, label: 'Final drop at Pier 9 — keep it cold' },
    ],
  },
  {
    id: 'velvettide',
    title: 'The Velvet Tide',
    pay: 1500,
    intro: [
      ['Sol', 'Last one, Nico. A boat came in under the Gull Point light carrying something nobody declared.'],
      ['Sol', 'It is ours now — the Cardoza crew just does not know it yet. Take it to the lockup, whatever it takes.'],
      ['Nico', 'And after this, I am out?'],
      ['Sol', 'After this, you are whatever you want to be. That is the whole point of money.'],
    ],
    outro: [
      ['Sol', 'It is done. The tide brought it in, and you brought it home. Port Azura is yours now, Nico.'],
      ['Nico', 'Then let it keep shining. I am not going anywhere.'],
    ],
    stages: [
      { type: 'goto', at: 'lighthouse', label: 'Take the score at Gull Point Light' },
      { type: 'goto', at: 'lockup', label: 'Get the score to the Harbor Lockup' },
      { type: 'escape', label: 'Lose the PAPD for good' },
    ],
  },
];

const RACE_POINTS = [
  { x: 700, y: 3058 }, { x: 1500, y: 3058 }, { x: 2300, y: 3058 }, { x: 3100, y: 3058 },
  { x: 3100, y: 2300 }, { x: 2300, y: 2300 }, { x: 1500, y: 2300 },
];

export class Missions {
  constructor(G) {
    this.storyIndex = G.save.missionIndex || 0;
    this.active = null;      // { def, stageIdx, timer, targetCar, van }
    this.marker = null;      // { x, y, color, label }
    this.objective = '';
    this.taxi = null;        // { phase, x, y, destX, destY, timeLeft, dist }
    this.taxiSpawnAt = 8;
    this.courier = null;     // { destX, destY, timeLeft, dist }
    this.race = null;        // { idx, time }
    this.storyDone = this.storyIndex >= STORY.length;
  }

  get busy() {
    return !!(this.active || this.taxi || this.courier || this.race);
  }

  // --- story flow -----------------------------------------------------------

  startNext(G) {
    const def = STORY[this.storyIndex];
    if (!def) return;
    this.active = { def, stageIdx: 0, timer: null, targetCar: null, van: null };
    G.queueDialogue(def.intro);
    G.banner(def.title, 'Sol has work for you');
    G.sfx.missionJingle();
    if (def.id === 'housecall') {
      const car = G.spawnMissionCar(3069, 962);
      this.active.targetCar = car;
    }
    if (def.id === 'coldchain') {
      const van = G.spawnMissionVan(1052, 2731);
      this.active.van = van;
    }
    this.refreshStage(G);
  }

  refreshStage(G) {
    const a = this.active;
    if (!a) return;
    const stage = a.def.stages[a.stageIdx];
    a.timer = stage.type === 'timer' ? stage.seconds : null;
    if (stage.type === 'escape') {
      this.marker = null;
      this.objective = stage.label;
    } else if (stage.type === 'hero') {
      const hero = G.cars.find((c) => c.heroCar);
      this.marker = hero ? { x: hero.x, y: hero.y, color: '#20b2aa', label: 'Comet' } : null;
      this.objective = stage.label;
    } else if (stage.type === 'wreck') {
      const car = a.targetCar;
      this.marker = car ? { x: car.x, y: car.y, color: '#e4572e', label: 'Target' } : null;
      this.objective = stage.label;
    } else if (stage.type === 'getvan') {
      const van = a.van;
      this.marker = van ? { x: van.x, y: van.y, color: '#7fb069', label: 'Van' } : null;
      this.objective = stage.label;
    } else {
      const place = G.city.places[stage.at];
      this.marker = { x: place.x, y: place.y, color: '#f2c14e', label: place.label };
      this.objective = stage.label;
    }
  }

  completeStage(G) {
    const a = this.active;
    a.stageIdx++;
    G.sfx.pickup();
    if (a.stageIdx >= a.def.stages.length) {
      this.completeMission(G);
      return;
    }
    const stage = a.def.stages[a.stageIdx];
    if (a.def.id === 'velvettide' && stage.type === 'goto' && a.stageIdx === 1) {
      // The pickup is noticed: the whole bay lights up with sirens.
      G.police.addHeat(G, 210);
      G.banner('The score is hot', 'Every cruiser in Port Azura is awake');
    }
    this.refreshStage(G);
  }

  completeMission(G) {
    const a = this.active;
    G.earn(a.def.pay);
    G.queueDialogue(a.def.outro);
    G.banner(a.def.title + ' — complete', '+$' + a.def.pay);
    G.sfx.cash();
    this.active = null;
    this.marker = null;
    this.objective = '';
    this.storyIndex++;
    this.storyDone = this.storyIndex >= STORY.length;
    G.save.missionIndex = this.storyIndex;
    G.persist();
    if (this.storyDone) {
      G.banner('VELVET TIDE', 'Story complete — Port Azura is yours. Side work still pays.');
    }
  }

  failMission(G, why) {
    if (!this.active) return;
    G.banner('Mission failed', why + ' — head back to Sol\u2019s pawn shop');
    if (this.active.targetCar) G.removeCar(this.active.targetCar);
    if (this.active.van && G.player.car !== this.active.van) G.removeCar(this.active.van);
    this.active = null;
    this.marker = null;
    this.objective = '';
  }

  onPlayerDown(G) {
    if (this.active) this.failMission(G, 'It slipped away');
    this.taxi = null;
    this.courier = null;
    this.race = null;
  }

  // --- per-frame ------------------------------------------------------------

  update(G, dt) {
    if (this.active) this.updateStory(G, dt);
    else if (!this.busy) this.updateOffers(G, dt);
    if (this.taxi) this.updateTaxi(G, dt);
    if (this.courier) this.updateCourier(G, dt);
    if (this.race) this.updateRace(G, dt);
    if (!this.busy && !this.active) {
      if (G.police.stars > 0) {
        // Nothing else matters while the PAPD is on you.
        this.marker = null;
        this.objective = 'Lose the PAPD';
      } else if (!this.storyDone) {
        const s = G.city.places.pawnShop;
        this.marker = { x: s.x, y: s.y, color: '#f2c14e', label: 'Sol' };
        this.objective = 'See Sol at the pawn shop';
      } else if (!this.marker) {
        this.objective = 'Free roam — fares, courier runs and the Coast Run pay cash';
      }
    }
  }

  updateOffers(G, dt) {
    const p = G.player;
    // Story start: stand (or roll slowly) in Sol's doorway marker.
    if (!this.storyDone) {
      const s = G.city.places.pawnShop;
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      const slow = !p.inCar || Math.abs(p.car.speed) < 45;
      if (d < 52 && slow && G.dialogueDone()) {
        this.startNext(G);
        return;
      }
    }
    // Courier offer waits at the depot.
    const depot = G.city.places.depot;
    if (p.inCar && Math.hypot(p.x - depot.x, p.y - depot.y) < 56) {
      this.startCourier(G);
      return;
    }
    // Race offer waits at the start line.
    const rs = G.city.places.raceStart;
    if (p.inCar && Math.hypot(p.x - rs.x, p.y - rs.y) < 60) {
      this.startRace(G);
      return;
    }
    // Taxi fares appear while the player cruises in a car.
    if (p.inCar && G.time > this.taxiSpawnAt && !this.taxi) {
      this.taxiSpawnAt = G.time + G.rng.range(10, 18);
      if (G.rng.chance(0.75)) this.spawnFare(G);
    }
  }

  updateStory(G, dt) {
    const a = this.active;
    const stage = a.def.stages[a.stageIdx];
    const p = G.player;
    if (stage.type === 'timer') {
      a.timer -= dt;
      this.objective = stage.label + ' — ' + Math.max(0, Math.ceil(a.timer)) + 's';
      if (a.timer <= 0) {
        this.failMission(G, 'The ice gave up');
        return;
      }
    }
    if (stage.type === 'escape') {
      this.objective = stage.label + ' (' + G.police.stars + '★)';
      if (G.police.stars === 0 && G.police.heat <= 0) this.completeStage(G);
      return;
    }
    if (stage.type === 'hero') {
      this.refreshStage(G);
      if (p.inCar && p.car.heroCar) this.completeStage(G);
      return;
    }
    if (stage.type === 'wreck') {
      if (a.targetCar && a.targetCar.hp <= 45) this.completeStage(G);
      return;
    }
    if (stage.type === 'getvan') {
      if (p.inCar && p.car === a.van) this.completeStage(G);
      return;
    }
    // goto-style stages, some with strings attached.
    const place = G.city.places[stage.at];
    const d = Math.hypot(p.x - place.x, p.y - place.y);
    if (stage.needHero && !(p.inCar && p.car.heroCar)) {
      this.objective = stage.label + ' (in the Comet)';
      if (a.def.id === 'wheels' && !G.cars.some((c) => c.heroCar && !c.wrecked)) {
        this.failMission(G, 'The Comet is wrecked');
      }
      return;
    }
    if (d < 58) this.completeStage(G);
  }

  // --- taxi -----------------------------------------------------------------

  spawnFare(G) {
    const p = G.player;
    for (let tries = 0; tries < 8; tries++) {
      const a = G.rng.range(0, Math.PI * 2);
      const d = G.rng.range(320, 680);
      const x = p.x + Math.cos(a) * d;
      const y = p.y + Math.sin(a) * d;
      if (x < 80 || y < 80 || x > G.city.size - 80 || y > 3120) continue;
      const ped = G.spawnPedAt(x, y);
      if (!ped) continue;
      ped.state = 'stand';
      ped.standUntil = G.time + 9999;
      this.taxi = { phase: 'pickup', ped, x: ped.x, y: ped.y, destX: 0, destY: 0, timeLeft: 0, dist: 0 };
      this.marker = { x: ped.x, y: ped.y, color: '#f7b731', label: 'Fare' };
      this.objective = 'Pick up the fare';
      G.banner('Taxi fare', 'A passenger is waiting — follow the yellow marker');
      return;
    }
  }

  updateTaxi(G, dt) {
    const t = this.taxi;
    const p = G.player;
    if (t.phase === 'pickup') {
      if (!p.inCar) { this.cancelTaxi(G, 'The fare gave up waiting'); return; }
      if (Math.hypot(p.x - t.x, p.y - t.y) < 52 && Math.abs(p.car.speed) < 60) {
        G.removePed(t.ped);
        const dest = G.rng.pick(Object.values(G.city.places));
        t.phase = 'dropoff';
        t.destX = dest.x + G.rng.range(-60, 60);
        t.destY = dest.y + G.rng.range(-60, 60);
        t.dist = Math.hypot(t.destX - t.x, t.destY - t.y);
        t.timeLeft = 30 + t.dist / 16;
        this.marker = { x: t.destX, y: t.destY, color: '#f7b731', label: 'Drop-off' };
        this.objective = 'Drop off at ' + dest.label;
        G.sfx.pickup();
      }
      return;
    }
    t.timeLeft -= dt;
    this.objective = 'Drop off the fare — ' + Math.max(0, Math.ceil(t.timeLeft)) + 's';
    if (Math.hypot(p.x - t.destX, p.y - t.destY) < 56 && p.inCar && Math.abs(p.car.speed) < 60) {
      const base = 25 + Math.round(t.dist / 22);
      const tip = t.timeLeft > (30 + t.dist / 16) * 0.35 ? Math.round(base * 0.4) : 0;
      G.earn(base + tip);
      G.banner('Fare paid', '+$' + (base + tip) + (tip ? ' (tip $' + tip + ')' : ''));
      G.sfx.cash();
      this.taxi = null;
      this.marker = null;
      this.objective = '';
      this.taxiSpawnAt = G.time + G.rng.range(8, 16);
    } else if (t.timeLeft <= 0) {
      this.cancelTaxi(G, 'The fare bailed out');
    } else if (!p.inCar) {
      this.cancelTaxi(G, 'The fare bailed out');
    }
  }

  cancelTaxi(G, why) {
    if (this.taxi && this.taxi.phase === 'pickup' && this.taxi.ped) {
      this.taxi.ped.state = 'walk';
      this.taxi.ped.standUntil = 0;
    }
    this.taxi = null;
    this.marker = null;
    this.objective = '';
    G.banner('Fare lost', why);
    this.taxiSpawnAt = G.time + G.rng.range(8, 15);
  }

  // --- courier ----------------------------------------------------------------

  startCourier(G) {
    const dest = G.rng.pick(Object.values(G.city.places));
    const from = G.city.places.depot;
    const dist = Math.hypot(dest.x - from.x, dest.y - from.y);
    this.courier = { destX: dest.x, destY: dest.y, label: dest.label, timeLeft: 40 + dist / 11, dist };
    this.marker = { x: dest.x, y: dest.y, color: '#7fb069', label: 'Deliver' };
    this.objective = 'QuickPost: deliver to ' + dest.label;
    G.banner('QuickPost run', 'Package aboard — the clock is running');
    G.sfx.pickup();
  }

  updateCourier(G, dt) {
    const c = this.courier;
    const p = G.player;
    c.timeLeft -= dt;
    this.objective = 'QuickPost to ' + c.label + ' — ' + Math.max(0, Math.ceil(c.timeLeft)) + 's';
    if (!p.inCar) {
      this.courier = null;
      this.marker = null;
      this.objective = '';
      G.banner('Package lost', 'You left the delivery car');
      return;
    }
    if (Math.hypot(p.x - c.destX, p.y - c.destY) < 58 && Math.abs(p.car.speed) < 70) {
      const pay = 40 + Math.round(c.dist / 18) + Math.max(0, Math.round(c.timeLeft));
      G.earn(pay);
      G.banner('Delivered', '+$' + pay);
      G.sfx.cash();
      this.courier = null;
      this.marker = null;
      this.objective = '';
    } else if (c.timeLeft <= 0) {
      this.courier = null;
      this.marker = null;
      this.objective = '';
      G.banner('Too late', 'QuickPost wrote the package off');
    }
  }

  // --- race -------------------------------------------------------------------

  startRace(G) {
    this.race = { idx: 0, time: 0 };
    const first = RACE_POINTS[0];
    this.marker = { x: first.x, y: first.y, color: '#e4572e', label: 'Checkpoint' };
    this.objective = 'Coast Run: checkpoint 1/' + RACE_POINTS.length;
    G.banner('Coast Run', 'Hit every checkpoint — under 95s pays $400');
    G.sfx.missionJingle();
  }

  updateRace(G, dt) {
    const r = this.race;
    const p = G.player;
    if (!p.inCar) {
      this.race = null;
      this.marker = null;
      this.objective = '';
      G.banner('Race abandoned', 'You left the car');
      return;
    }
    r.time += dt;
    const target = RACE_POINTS[r.idx];
    this.objective = 'Coast Run: checkpoint ' + (r.idx + 1) + '/' + RACE_POINTS.length + ' — ' + r.time.toFixed(1) + 's';
    if (Math.hypot(p.x - target.x, p.y - target.y) < 84) {
      r.idx++;
      G.sfx.pickup();
      if (r.idx >= RACE_POINTS.length) {
        const pay = r.time <= 95 ? 400 : r.time <= 150 ? 120 : 40;
        G.earn(pay);
        G.banner('Coast Run finished', r.time.toFixed(1) + 's — +$' + pay);
        G.sfx.cash();
        this.race = null;
        this.marker = null;
        this.objective = '';
      } else {
        const next = RACE_POINTS[r.idx];
        this.marker = { x: next.x, y: next.y, color: '#e4572e', label: 'Checkpoint' };
      }
    }
  }
}

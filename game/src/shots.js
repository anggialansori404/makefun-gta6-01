// shots.js — deterministic scenes for the entry's screenshots.
// Each pose arranges the world at boot (same seed, same layout) so a capture
// taken a moment later always shows the same Port Azura moment: the title
// over downtown, a chase at dusk, a mission run to the docks, the coast at
// sunset. Poses are also handy for debugging — open ?shot=chase and drive.

import { Car } from './vehicles.js';
import { makeCopCar } from './vehicles.js';

export const SHOT_NAMES = ['start', 'play', 'chase', 'mission', 'coast'];

export function applyShotPose(G, name) {
  const p = G.player;
  switch (name) {
    case 'start': {
      G.dayTime = 0.42;
      p.x = 1452;
      p.y = 1760;
      G.camera.x = p.x - G.view.w / 2;
      G.camera.y = p.y - G.view.h / 2;
      break;
    }
    case 'play': {
      G.dayTime = 0.44;
      p.x = 1660;
      p.y = 1446;
      p.angle = 0.6;
      break;
    }
    case 'chase': {
      G.dayTime = 0.755;
      const car = new Car('sport', 1900, 1980, -Math.PI / 2, G.rng, 'parked');
      car.color = '#e33f5e';
      car.speed = 330;
      G.cars.push(car);
      p.inCar = true;
      p.car = car;
      car.occupied = true;
      p.x = car.x;
      p.y = car.y;
      // Three cruisers on the tail, lights rolling.
      const spots = [
        { x: 1878, y: 2150, a: -Math.PI / 2 },
        { x: 1936, y: 2215, a: -Math.PI / 2 + 0.12 },
        { x: 1852, y: 2290, a: -Math.PI / 2 - 0.1 },
      ];
      for (const s of spots) {
        const cop = makeCopCar(s.x, s.y, G.rng);
        cop.angle = s.a;
        cop.speed = 300;
        G.cars.push(cop);
      }
      G.police.heat = 210;
      G.police.recount();
      G.police.lastSeenX = p.x;
      G.police.lastSeenY = p.y;
      G.police.lastSeenAt = 0;
      G.missions.objective = 'Lose the PAPD';
      break;
    }
    case 'mission': {
      G.dayTime = 0.5;
      G.missions.startNext(G);
      const car = new Car('sedan', 688, 2880, Math.PI / 2, G.rng, 'parked');
      car.color = '#4a7fb5';
      car.speed = 150;
      G.cars.push(car);
      p.inCar = true;
      p.car = car;
      car.occupied = true;
      p.x = car.x;
      p.y = car.y;
      break;
    }
    case 'coast': {
      G.dayTime = 0.762;
      const car = new Car('sport', 2050, 3078, 0, G.rng, 'parked');
      car.color = '#ffb400';
      car.speed = 210;
      G.cars.push(car);
      p.inCar = true;
      p.car = car;
      car.occupied = true;
      p.x = car.x;
      p.y = car.y;
      break;
    }
  }
}

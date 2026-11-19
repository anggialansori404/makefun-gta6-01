// city.js — Port Azura, the sun-soaked grid Velvet Tide plays in.
// A seeded generator lays avenues and streets over a 3600x3600 world, fills
// the blocks with pastel buildings, parks and warehouses, drops a bay along
// the south edge with a lighthouse pier, and pre-renders the whole static
// layer once to an offscreen canvas the renderer blits from.

import { Rng } from './rng.js';

export const WORLD_SIZE = 3600;
export const WATER_Y = 3300;
const ROAD_HALF = 42;

const ROOF_COLORS = ['#f2e3c9', '#eec39f', '#dfe8dd', '#f4cfc0', '#cfdde8', '#efe0ea', '#e8d8a8', '#d9e6c3'];
const WALL_COLORS = ['#d9b48f', '#cfa184', '#b9c4b2', '#d3a08e', '#aebfd0', '#c9aec0', '#cbb894', '#bcc9a4'];
const ROOF_TRIM = ['#c96f4a', '#4a90a4', '#e0a458', '#7fae7a', '#b45a6e', '#5a7fae'];

export function buildCity(seed) {
  const rng = new Rng(seed);
  const vRoads = [300, 700, 1100, 1500, 1900, 2300, 2700, 3100];
  const hRoads = [300, 700, 1100, 1500, 1900, 2300, 2700, 3100];
  const buildings = [];
  const parks = [];
  const trees = [];
  const lamps = [];

  const city = {
    size: WORLD_SIZE,
    roadHalf: ROAD_HALF,
    vRoads,
    hRoads,
    buildings,
    parks,
    trees,
    lamps,
    waterY: WATER_Y,
    pier: { x: 3352, y: 3260, w: 96, h: 260 },
    places: {
      pawnShop: { x: 1452, y: 1700, label: "Sol's Pawn & Loan" },
      lockup: { x: 652, y: 2500, label: 'Harbor Lockup' },
      docks: { x: 500, y: 3052, label: 'Azura Docks' },
      marina: { x: 2900, y: 3052, label: 'Marina Parkade' },
      heightsHouse: { x: 3052, y: 900, label: 'The Heights' },
      lighthouse: { x: 3400, y: 3440, label: 'Gull Point Light' },
      depot: { x: 1052, y: 2900, label: 'QuickPost Depot' },
      hospital: { x: 1952, y: 1300, label: 'St. Coral Hospital' },
      policeStation: { x: 2352, y: 2100, label: 'PAPD Central' },
      raceStart: { x: 340, y: 3058, label: 'Coast Run Start' },
    },
    canvas: null,
  };

  // Blocks sit between neighbouring roads; the last row (2700-3100) is the
  // shore row of docks, marina sheds and beach clubs.
  for (let col = 0; col < vRoads.length - 1; col++) {
    for (let row = 0; row < hRoads.length - 1; row++) {
      const x0 = vRoads[col] + ROAD_HALF + 16;
      const y0 = hRoads[row] + ROAD_HALF + 16;
      const w = vRoads[col + 1] - vRoads[col] - ROAD_HALF * 2 - 32;
      const h = hRoads[row + 1] - hRoads[row] - ROAD_HALF * 2 - 32;
      const shore = row === hRoads.length - 2;
      const key = col + ',' + row;
      const landmark = LANDMARKS[key];
      if (landmark) {
        buildings.push(makeBuilding(x0 + 8, y0 + 8, w - 16, h - 16, landmark, rng));
        continue;
      }
      if (!shore && rng.chance(0.16)) {
        parks.push({ x: x0, y: y0, w, h });
        const n = rng.int(5, 9);
        for (let i = 0; i < n; i++) {
          trees.push({ x: x0 + rng.range(24, w - 24), y: y0 + rng.range(24, h - 24), r: rng.range(11, 19) });
        }
        continue;
      }
      if (shore) {
        // Warehouses and sheds: long, low, flat-roofed.
        const n = rng.int(1, 2);
        for (let i = 0; i < n; i++) {
          const bw = n === 1 ? w - 12 : (w - 24) / 2;
          buildings.push(makeBuilding(x0 + 6 + i * (bw + 12), y0 + rng.range(6, 26), bw, h - rng.range(20, 60),
            { kind: 'warehouse', name: rng.pick(['Cold Store', 'Azura Freight', 'Bait & Tackle', 'Slipway Sheds', 'Cargo Co.']) }, rng));
        }
        continue;
      }
      // Ordinary city block: one tower or a 2x2 of smaller buildings.
      if (rng.chance(0.42)) {
        buildings.push(makeBuilding(x0 + rng.range(4, 18), y0 + rng.range(4, 18), w - rng.range(10, 34), h - rng.range(10, 34), { kind: 'tower' }, rng));
      } else {
        const gap = 14;
        const bw = (w - gap) / 2;
        const bh = (h - gap) / 2;
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            if (rng.chance(0.12)) {
              trees.push({ x: x0 + i * (bw + gap) + bw / 2, y: y0 + j * (bh + gap) + bh / 2, r: rng.range(10, 15) });
              continue;
            }
            buildings.push(makeBuilding(x0 + i * (bw + gap) + rng.range(0, 5), y0 + j * (bh + gap) + rng.range(0, 5),
              bw - rng.range(0, 9), bh - rng.range(0, 9), { kind: rng.chance(0.3) ? 'shop' : 'block' }, rng));
          }
        }
      }
    }
  }

  // Palms along the coast road and the promenade.
  for (let x = 130; x < WORLD_SIZE - 120; x += rng.range(120, 190)) {
    trees.push({ x, y: 3196 + rng.range(-8, 8), r: rng.range(12, 17), palm: true });
  }
  // Street lamps at intersections and mid-block.
  for (const vx of vRoads) for (const hy of hRoads) lamps.push({ x: vx + ROAD_HALF + 6, y: hy + ROAD_HALF + 6 });
  for (let x = 200; x < WORLD_SIZE - 100; x += 260) lamps.push({ x, y: 3052 });

  city.canvas = renderStatic(city);
  return city;
}

const LANDMARKS = {
  '3,3': { kind: 'pawn', name: "Sol's Pawn & Loan" },
  '1,5': { kind: 'garage', name: 'Harbor Lockup' },
  '4,2': { kind: 'hospital', name: 'St. Coral Hospital' },
  '5,4': { kind: 'police', name: 'PAPD Central' },
  '6,1': { kind: 'hotel', name: 'Hotel Azura' },
  '2,6': { kind: 'depot', name: 'QuickPost Depot' },
  '6,6': { kind: 'parkade', name: 'Marina Parkade' },
  '0,6': { kind: 'warehouse', name: 'Azura Docks — Pier 9' },
};

function makeBuilding(x, y, w, h, spec, rng) {
  const tall = spec.kind === 'tower' || spec.kind === 'hotel';
  return {
    x, y, w, h,
    kind: spec.kind,
    name: spec.name || '',
    depth: tall ? rng.range(26, 46) : rng.range(9, 22),
    roof: spec.kind === 'warehouse' ? '#9aa3a8' : spec.kind === 'police' ? '#33506e' : spec.kind === 'hospital' ? '#f4f6f6' : rng.pick(ROOF_COLORS),
    trim: rng.pick(ROOF_TRIM),
    seed: rng.int(1, 1e9),
  };
}

// --- geometry helpers -------------------------------------------------------

export function circleHitsRect(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

export function inWater(city, x, y) {
  if (y < city.waterY) return false;
  const p = city.pier;
  if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return false;
  return true;
}

// Is a disc at (x, y) blocked by a building, the bay or the world edge?
export function pointBlocked(city, x, y, r) {
  if (x < r || y < r || x > city.size - r || y > city.size - r) return true;
  if (inWater(city, x, y)) return true;
  for (const b of city.buildings) {
    if (circleHitsRect(x, y, r, b)) return true;
  }
  return false;
}

// Push a disc out of whatever it overlaps; returns the corrected position.
export function resolveCollision(city, x, y, r) {
  x = Math.max(r, Math.min(city.size - r, x));
  y = Math.max(r, Math.min(city.size - r, y));
  for (const b of city.buildings) {
    if (!circleHitsRect(x, y, r, b)) continue;
    const left = x - (b.x - r);
    const right = (b.x + b.w + r) - x;
    const top = y - (b.y - r);
    const bottom = (b.y + b.h + r) - y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) x = b.x - r;
    else if (min === right) x = b.x + b.w + r;
    else if (min === top) y = b.y - r;
    else y = b.y + b.h + r;
  }
  return { x, y };
}

// Line of sight for witnesses: blocked when a building crosses the segment.
export function losBlocked(city, x1, y1, x2, y2) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 22);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    for (const b of city.buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
  }
  return false;
}

export function onRoad(city, x, y) {
  for (const vx of city.vRoads) if (Math.abs(x - vx) <= city.roadHalf) return true;
  for (const hy of city.hRoads) if (Math.abs(y - hy) <= city.roadHalf && y < city.waterY) return true;
  return false;
}

export function distToRoad(city, x, y) {
  let d = Infinity;
  for (const vx of city.vRoads) d = Math.min(d, Math.abs(x - vx));
  for (const hy of city.hRoads) d = Math.min(d, Math.abs(y - hy));
  return d;
}

// A random point on a random road, away from the bay.
export function randomRoadPoint(city, rng) {
  if (rng.chance(0.5)) {
    const vx = rng.pick(city.vRoads);
    return { x: vx + rng.range(-20, 20), y: rng.range(120, 2950), vertical: true, road: vx };
  }
  const hy = rng.pick(city.hRoads);
  return { x: rng.range(120, 3480), y: hy + rng.range(-20, 20), vertical: false, road: hy };
}

// Parking spots hug the kerbs of the avenues downtown.
export function parkingSpots(city, rng, count) {
  const spots = [];
  let guard = 0;
  while (spots.length < count && guard++ < count * 30) {
    const vx = rng.pick(city.vRoads);
    const side = rng.sign();
    const x = vx + side * (city.roadHalf - 11);
    const y = rng.range(160, 2980);
    if (city.hRoads.some((hy) => Math.abs(y - hy) < 74)) continue;
    spots.push({ x, y, angle: Math.PI / 2 });
  }
  return spots;
}

// --- static layer -----------------------------------------------------------

function renderStatic(city) {
  const S = city.size;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const c = cv.getContext('2d');

  // The bay: layered turquoise with a soft shoreline.
  const sea = c.createLinearGradient(0, city.waterY, 0, S);
  sea.addColorStop(0, '#3ec6c6');
  sea.addColorStop(0.25, '#2aa9bd');
  sea.addColorStop(1, '#15708e');
  c.fillStyle = sea;
  c.fillRect(0, city.waterY, S, S - city.waterY);
  c.fillStyle = 'rgba(255,255,255,0.20)';
  const waveRng = new Rng('waves');
  for (let i = 0; i < 260; i++) {
    const y = city.waterY + 24 + waveRng.next() * (S - city.waterY - 60);
    const x = waveRng.next() * S;
    c.fillRect(x, y, 26 + waveRng.next() * 46, 2.4);
  }
  // Beach and promenade.
  c.fillStyle = '#f0dcab';
  c.fillRect(0, 3142, S, city.waterY - 3142);
  c.fillStyle = '#e8cf96';
  c.fillRect(0, 3142, S, 8);

  // Land base: warm sidewalk concrete everywhere, then blocks read on top.
  c.fillStyle = '#ddd3bd';
  c.fillRect(0, 0, S, 3142);

  // Parks: lawns with sandy paths.
  for (const p of city.parks) {
    c.fillStyle = '#8fbf6d';
    c.fillRect(p.x, p.y, p.w, p.h);
    c.strokeStyle = '#e6d29a';
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(p.x, p.y + p.h / 2);
    c.lineTo(p.x + p.w, p.y + p.h / 2);
    c.moveTo(p.x + p.w / 2, p.y);
    c.lineTo(p.x + p.w / 2, p.y + p.h);
    c.stroke();
  }

  // Roads: asphalt slabs over the land, with kerbs.
  c.fillStyle = '#565a60';
  for (const vx of city.vRoads) c.fillRect(vx - city.roadHalf, 0, city.roadHalf * 2, 3142);
  for (const hy of city.hRoads) c.fillRect(0, hy - city.roadHalf, S, city.roadHalf * 2);
  c.fillStyle = '#4c5054';
  for (const vx of city.vRoads) c.fillRect(vx - city.roadHalf + 5, 0, city.roadHalf * 2 - 10, 3142);
  for (const hy of city.hRoads) c.fillRect(0, hy - city.roadHalf + 5, S, city.roadHalf * 2 - 10);
  // Lane dashes.
  c.fillStyle = '#e8e4c8';
  for (const vx of city.vRoads) {
    for (let y = 14; y < 3142; y += 46) {
      if (city.hRoads.some((hy) => Math.abs(y - hy) < 52)) continue;
      c.fillRect(vx - 2, y, 4, 24);
    }
  }
  for (const hy of city.hRoads) {
    for (let x = 14; x < S; x += 46) {
      if (city.vRoads.some((vx) => Math.abs(x - vx) < 52)) continue;
      c.fillRect(x, hy - 2, 24, 4);
    }
  }
  // Crosswalks at intersections.
  c.fillStyle = 'rgba(240,240,235,0.75)';
  for (const vx of city.vRoads) {
    for (const hy of city.hRoads) {
      for (let i = -3; i <= 3; i++) {
        c.fillRect(vx - city.roadHalf + 4, hy + i * 11 - 3, 9, 6);
        c.fillRect(vx + city.roadHalf - 13, hy + i * 11 - 3, 9, 6);
        c.fillRect(vx + i * 11 - 3, hy - city.roadHalf + 4, 6, 9);
        c.fillRect(vx + i * 11 - 3, hy + city.roadHalf - 13, 6, 9);
      }
    }
  }

  // The pier and its lighthouse point.
  const p = city.pier;
  c.fillStyle = '#b09a72';
  c.fillRect(p.x, p.y, p.w, p.h);
  c.fillStyle = '#8f7a56';
  for (let y = p.y + 8; y < p.y + p.h; y += 22) c.fillRect(p.x + 4, y, p.w - 8, 3);
  c.fillStyle = '#e8e2d2';
  c.beginPath();
  c.arc(p.x + p.w / 2, p.y + p.h - 28, 21, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#d84f3d';
  c.beginPath();
  c.arc(p.x + p.w / 2, p.y + p.h - 28, 21, Math.PI * 0.15, Math.PI * 0.5);
  c.arc(p.x + p.w / 2, p.y + p.h - 28, 21, Math.PI * 1.15, Math.PI * 1.5);
  c.fill();

  // Buildings: sun-side walls offset down-left, then the roof.
  for (const b of city.buildings) {
    const d = b.depth;
    c.fillStyle = 'rgba(70,50,30,0.30)';
    c.fillRect(b.x - d * 0.55 + 5, b.y + d * 0.4 + 5, b.w, b.h);
    c.fillStyle = b.trim;
    c.fillRect(b.x - d * 0.55, b.y + d * 0.4, b.w, b.h);
    c.fillStyle = b.roof;
    c.fillRect(b.x, b.y, b.w, b.h);
    c.strokeStyle = 'rgba(90,70,50,0.35)';
    c.lineWidth = 2;
    c.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    drawRoofDetail(c, b);
  }

  // Trees above the roofs' edges read as street greenery.
  for (const t of city.trees) drawTree(c, t);

  // Lamp posts (dots the night pass lights up).
  c.fillStyle = '#3c4046';
  for (const l of city.lamps) {
    c.beginPath();
    c.arc(l.x, l.y, 3, 0, Math.PI * 2);
    c.fill();
  }
  return cv;
}

function drawRoofDetail(c, b) {
  const rng = new Rng(b.seed);
  c.save();
  c.beginPath();
  c.rect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
  c.clip();
  if (b.kind === 'hospital') {
    c.fillStyle = '#d84f3d';
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    c.fillRect(cx - 7, cy - 26, 14, 52);
    c.fillRect(cx - 26, cy - 7, 52, 14);
  } else if (b.kind === 'warehouse' || b.kind === 'depot' || b.kind === 'parkade') {
    c.strokeStyle = 'rgba(60,60,60,0.25)';
    c.lineWidth = 3;
    for (let x = b.x + 18; x < b.x + b.w; x += 30) {
      c.beginPath();
      c.moveTo(x, b.y);
      c.lineTo(x, b.y + b.h);
      c.stroke();
    }
    if (b.name) drawSign(c, b);
  } else if (b.kind === 'shop' || b.kind === 'pawn' || b.kind === 'garage') {
    c.fillStyle = b.trim;
    c.fillRect(b.x + 4, b.y + b.h - 20, b.w - 8, 13);
    if (b.name) drawSign(c, b);
  } else {
    // Window grid, warm glass.
    c.fillStyle = 'rgba(255,214,140,0.5)';
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(2, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (rng.chance(0.24)) continue;
        c.fillRect(b.x + 8 + i * ((b.w - 16) / cols), b.y + 8 + j * ((b.h - 16) / rows), 9, 12);
      }
    }
    if (b.kind === 'hotel' && b.name) drawSign(c, b);
  }
  c.restore();
}

function drawSign(c, b) {
  c.fillStyle = 'rgba(30,30,40,0.72)';
  c.font = 'bold 13px system-ui, sans-serif';
  c.textAlign = 'center';
  c.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + 20);
}

function drawTree(c, t) {
  c.fillStyle = 'rgba(60,80,40,0.35)';
  c.beginPath();
  c.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2);
  c.fill();
  if (t.palm) {
    c.strokeStyle = '#8a6f4d';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(t.x, t.y + 8);
    c.lineTo(t.x, t.y);
    c.stroke();
    c.strokeStyle = '#4d9e57';
    c.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.beginPath();
      c.moveTo(t.x, t.y);
      c.quadraticCurveTo(t.x + Math.cos(a) * t.r * 0.7, t.y + Math.sin(a) * t.r * 0.7 - 3, t.x + Math.cos(a) * t.r, t.y + Math.sin(a) * t.r + 4);
      c.stroke();
    }
  } else {
    c.fillStyle = '#57a047';
    c.beginPath();
    c.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#6cb85c';
    c.beginPath();
    c.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.62, 0, Math.PI * 2);
    c.fill();
  }
}

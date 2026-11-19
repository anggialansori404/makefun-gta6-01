// render.js — everything Velvet Tide draws: the blitted city, cars with
// working light bars, crowds, the chase-cam, a day-night grade, and the full
// HUD — health, cash, clock, wanted stars, objective, dialogue and minimap.

export function createMinimapBase(city) {
  const S = 216;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const c = cv.getContext('2d');
  const k = S / city.size;
  c.fillStyle = '#cbbfa5';
  c.fillRect(0, 0, S, S);
  c.fillStyle = '#2aa9bd';
  c.fillRect(0, city.waterY * k, S, S - city.waterY * k);
  c.fillStyle = '#8fbf6d';
  for (const p of city.parks) c.fillRect(p.x * k, p.y * k, p.w * k, p.h * k);
  c.strokeStyle = '#5a5e63';
  c.lineWidth = 5;
  for (const vx of city.vRoads) {
    c.beginPath(); c.moveTo(vx * k, 0); c.lineTo(vx * k, city.waterY * k); c.stroke();
  }
  for (const hy of city.hRoads) {
    c.beginPath(); c.moveTo(0, hy * k); c.lineTo(S, hy * k); c.stroke();
  }
  return cv;
}

// Sun curve: dayTime 0.28 is dawn, 0.5 noon, 0.78 dusk, night between.
export function darkness(dayTime) {
  const sun = Math.sin((dayTime - 0.25) * Math.PI * 2);
  return Math.max(0, Math.min(1, (0.12 - sun) * 1.9));
}

export function draw(G, ctx) {
  const W = G.view.w;
  const H = G.view.h;
  const cam = G.camera;
  ctx.fillStyle = '#15708e';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  ctx.drawImage(G.city.canvas, 0, 0);

  drawMarkerBeacon(G, ctx);
  // Entities in world space, roughly ground-up.
  for (const ped of G.peds) drawPed(G, ctx, ped);
  for (const cop of G.police.footCops) drawFootCop(G, ctx, cop);
  for (const car of G.cars) drawCar(G, ctx, car);
  if (!G.player.inCar) drawPlayer(G, ctx);
  drawParticles(G, ctx);
  drawBullets(G, ctx);
  ctx.restore();

  applyDayNight(G, ctx);
  drawHUD(G, ctx);
}

function drawMarkerBeacon(G, ctx) {
  const m = G.missions.marker;
  if (!m || G.state !== 'playing') return;
  const pulse = 1 + Math.sin(G.time * 5) * 0.18;
  const grad = ctx.createLinearGradient(0, m.y - 190, 0, m.y);
  grad.addColorStop(0, 'rgba(255,220,120,0)');
  grad.addColorStop(1, hexA(m.color, 0.5));
  ctx.fillStyle = grad;
  ctx.fillRect(m.x - 13, m.y - 190, 26, 190);
  ctx.strokeStyle = hexA(m.color, 0.9);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(m.x, m.y, 30 * pulse, 15 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(m.label, m.x, m.y - 198);
}

function drawCar(G, ctx, car) {
  const spec = car.spec;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const w = spec.w;
  const h = spec.h;
  // Shadow.
  ctx.fillStyle = 'rgba(40,30,20,0.30)';
  roundRect(ctx, -w / 2 + 3, -h / 2 + 4, w, h, 6);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.wrecked ? '#3a3a3a' : car.color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Cabin and glass.
  ctx.fillStyle = car.wrecked ? '#22262a' : '#20262e';
  roundRect(ctx, -w * 0.16, -h * 0.36, w * 0.4, h * 0.72, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(170,220,240,0.55)';
  roundRect(ctx, w * 0.08, -h * 0.32, w * 0.1, h * 0.64, 3);
  ctx.fill();
  // Headlights and tail lights.
  ctx.fillStyle = '#ffeeb0';
  ctx.fillRect(w / 2 - 3, -h / 2 + 2, 3, 4);
  ctx.fillRect(w / 2 - 3, h / 2 - 6, 3, 4);
  ctx.fillStyle = car.kind !== 'parked' && car.speed < -2 ? '#ff5040' : '#a02820';
  ctx.fillRect(-w / 2, -h / 2 + 2, 3, 4);
  ctx.fillRect(-w / 2, h / 2 - 6, 3, 4);
  if (car.type === 'taxi') {
    ctx.fillStyle = '#fff3b0';
    roundRect(ctx, -6, -4, 12, 8, 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.font = 'bold 6px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2);
  }
  if (car.kind === 'cop') {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-w * 0.28, -h / 2, w * 0.56, h);
    ctx.fillStyle = '#20242c';
    ctx.font = 'bold 8px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('PAPD', 0, 3);
    // Light bar: alternating red/blue strobes.
    const phase = Math.floor(G.time * 6 + car.lightPhase) % 2;
    ctx.fillStyle = phase ? '#ff3b30' : '#3b82f6';
    roundRect(ctx, -8, -h * 0.3, 16, h * 0.6, 3);
    ctx.fill();
    ctx.fillStyle = phase ? 'rgba(255,59,48,0.25)' : 'rgba(59,130,246,0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 46 + Math.sin(G.time * 18) * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (car.hp < 45 && !car.wrecked) {
    ctx.fillStyle = 'rgba(30,30,30,0.5)';
    roundRect(ctx, w * 0.22, -h * 0.3, w * 0.24, h * 0.6, 3);
    ctx.fill();
  }
  ctx.restore();
}

function drawPed(G, ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(40,30,20,0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.shirt;
    roundRect(ctx, -11, -5, 22, 10, 5);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(13, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = ped.speed > 4 ? Math.sin(G.time * 10 + ped.id) * 1.6 : 0;
  ctx.fillStyle = ped.pants;
  ctx.beginPath();
  ctx.arc(-2 + bob * 0.4, 3, 4.4, 0, Math.PI * 2);
  ctx.arc(3 - bob * 0.4, -3, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 6.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(1.5, 0, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFootCop(G, ctx, cop) {
  ctx.save();
  ctx.translate(cop.x, cop.y);
  ctx.fillStyle = 'rgba(40,30,20,0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d2f4a';
  ctx.beginPath();
  ctx.arc(0, 0, 6.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.arc(1.5, 0, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#16283f';
  ctx.beginPath();
  ctx.arc(2.5, 0, 4.6, Math.PI * 0.6, Math.PI * 1.9);
  ctx.fill();
  ctx.restore();
}

function drawPlayer(G, ctx) {
  const p = G.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(40,30,20,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 9, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = p.moving ? Math.sin(p.walkCycle) * 1.8 : 0;
  ctx.fillStyle = '#263238';
  ctx.beginPath();
  ctx.arc(-2 + bob * 0.4, 3.4, 4.8, 0, Math.PI * 2);
  ctx.arc(3 - bob * 0.4, -3.4, 4.8, 0, Math.PI * 2);
  ctx.fill();
  // Nico's teal jacket.
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f2c14e';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#c68863';
  ctx.beginPath();
  ctx.arc(1.5, 0, 4.8, 0, Math.PI * 2);
  ctx.fill();
  // The pistol, toward the aim.
  ctx.rotate(p.aimAngle);
  ctx.fillStyle = '#15181c';
  ctx.fillRect(6, -1.6, 11, 3.2);
  ctx.restore();
}

function drawParticles(G, ctx) {
  for (const pt of G.particles) {
    const a = Math.max(0, pt.life / pt.maxLife);
    if (pt.kind === 'smoke') {
      ctx.fillStyle = 'rgba(60,60,60,' + (0.35 * a) + ')';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * (1.6 - a * 0.6), 0, Math.PI * 2);
      ctx.fill();
    } else if (pt.kind === 'tire') {
      ctx.fillStyle = 'rgba(230,230,230,' + (0.28 * a) + ')';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,' + (160 + Math.floor(80 * a)) + ',60,' + a + ')';
      ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
    }
  }
}

function drawBullets(G, ctx) {
  ctx.strokeStyle = 'rgba(255,230,150,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const b of G.bullets) {
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - Math.cos(b.angle) * 13, b.y - Math.sin(b.angle) * 13);
  }
  ctx.stroke();
}

function applyDayNight(G, ctx) {
  const W = G.view.w;
  const H = G.view.h;
  const dark = darkness(G.dayTime);
  const dusk = Math.max(0, 1 - Math.abs(G.dayTime - 0.76) * 9) + Math.max(0, 1 - Math.abs(G.dayTime - 0.26) * 9);
  if (dusk > 0) {
    ctx.fillStyle = 'rgba(255,120,50,' + (0.10 * Math.min(1, dusk)) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  if (dark > 0.02) {
    ctx.fillStyle = 'rgba(10,16,48,' + (0.46 * dark) + ')';
    ctx.fillRect(0, 0, W, H);
    // Lamp pools and headlights punch back through the dark.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cam = G.camera;
    for (const l of G.city.lamps) {
      const sx = l.x - cam.x;
      const sy = l.y - cam.y;
      if (sx < -70 || sy < -70 || sx > W + 70 || sy > H + 70) continue;
      const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 52);
      g.addColorStop(0, 'rgba(255,205,110,' + (0.20 * dark) + ')');
      g.addColorStop(1, 'rgba(255,205,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - 52, sy - 52, 104, 104);
    }
    for (const car of G.cars) {
      const sx = car.x - cam.x;
      const sy = car.y - cam.y;
      if (sx < -160 || sy < -160 || sx > W + 160 || sy > H + 160) continue;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const hx = sx + fx * 90;
      const hy = sy + fy * 90;
      const g = ctx.createRadialGradient(sx, sy, 4, hx, hy, 95);
      g.addColorStop(0, 'rgba(255,240,190,' + (0.16 * dark) + ')');
      g.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(sx, hx) - 95, Math.min(sy, hy) - 95, Math.abs(hx - sx) + 190, Math.abs(hy - sy) + 190);
    }
    ctx.restore();
  }
  // Hurt vignette.
  if (G.hurtFlash > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
    g.addColorStop(0, 'rgba(200,30,20,0)');
    g.addColorStop(1, 'rgba(200,30,20,' + (0.4 * G.hurtFlash) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

// --- HUD ----------------------------------------------------------------------

function drawHUD(G, ctx) {
  const W = G.view.w;
  const H = G.view.h;
  const p = G.player;
  ctx.textAlign = 'left';

  // Health, top-left.
  panel(ctx, 16, 16, 218, 46, 0.55);
  ctx.fillStyle = '#f4f1de';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('NICO FERREIRA', 26, 33);
  ctx.fillStyle = '#3a3f45';
  ctx.fillRect(26, 40, 196, 10);
  ctx.fillStyle = p.health > 30 ? '#43aa8b' : '#e4572e';
  ctx.fillRect(26, 40, 196 * Math.max(0, p.health / 100), 10);

  // Money, clock and stars, top-right.
  panel(ctx, W - 232, 16, 216, 46, 0.55);
  ctx.fillStyle = '#8be08b';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('$' + G.money.toLocaleString('en-US'), W - 26, 38);
  ctx.fillStyle = '#f4f1de';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(clockText(G.dayTime), W - 26, 54);
  ctx.font = '19px system-ui, sans-serif';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < G.police.stars ? '★' : '☆';
  ctx.fillStyle = G.police.stars ? '#ffd23e' : 'rgba(244,241,222,0.4)';
  ctx.fillText(stars, W - 110, 38);

  // Speed, bottom-right while driving.
  if (p.inCar) {
    panel(ctx, W - 132, H - 74, 116, 58, 0.55);
    ctx.fillStyle = '#f4f1de';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(Math.abs(p.car.speed) * 0.36) + '', W - 44, H - 38);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('KM/H', W - 26, H - 38);
  }

  drawMinimap(G, ctx);
  drawObjective(G, ctx);
  drawBanner(G, ctx);
  drawDialogue(G, ctx);

  // Busted meter.
  if (G.police.bustedMeter > 1 && G.state === 'playing') {
    const w = 260;
    panel(ctx, W / 2 - w / 2 - 8, H - 128, w + 16, 30, 0.6);
    ctx.fillStyle = '#e4572e';
    ctx.fillRect(W / 2 - w / 2, H - 120, w * (G.police.bustedMeter / 100), 8);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED', W / 2, H - 106);
  }

  // Context prompt.
  if (G.promptText && G.state === 'playing') {
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(G.promptText).width + 26;
    panel(ctx, W / 2 - tw / 2, H - 168, tw, 30, 0.6);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(G.promptText, W / 2, H - 148);
  }
}

function drawMinimap(G, ctx) {
  const S = 216;
  const x0 = 16;
  const y0 = G.view.h - S - 16;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, S, S);
  ctx.clip();
  ctx.drawImage(G.minimapBase, x0, y0);
  const k = S / G.city.size;
  const pulse = 0.6 + Math.sin(G.time * 5) * 0.4;
  // Police blips.
  for (const car of G.cars) {
    if (car.kind !== 'cop') continue;
    ctx.fillStyle = Math.floor(G.time * 4) % 2 ? '#ff5040' : '#4a90ff';
    ctx.beginPath();
    ctx.arc(x0 + car.x * k, y0 + car.y * k, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Objective blip.
  const m = G.missions.marker;
  if (m) {
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(x0 + m.x * k, y0 + m.y * k, 4.6 * pulse + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  // Player arrow.
  const p = G.player;
  ctx.translate(x0 + p.x * k, y0 + p.y * k);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.6);
  ctx.lineTo(-5, 4.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(20,24,30,0.8)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x0, y0, S, S);
  ctx.fillStyle = 'rgba(244,241,222,0.85)';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PORT AZURA', x0 + 7, y0 + 14);
}

function drawObjective(G, ctx) {
  const text = G.missions.objective;
  if (!text || G.state !== 'playing') return;
  const W = G.view.w;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const tw = Math.min(W - 320, ctx.measureText(text).width + 34);
  panel(ctx, W / 2 - tw / 2, G.view.h - 46, tw, 32, 0.55);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(text, W / 2, G.view.h - 25);
}

function drawBanner(G, ctx) {
  const b = G.bannerState;
  if (!b) return;
  const age = G.time - b.at;
  if (age > 3.4) { G.bannerState = null; return; }
  const a = age < 0.3 ? age / 0.3 : age > 2.8 ? (3.4 - age) / 0.6 : 1;
  const W = G.view.w;
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 10;
  ctx.fillText(b.title, W / 2, 108);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(b.sub, W / 2, 134);
  ctx.restore();
}

function drawDialogue(G, ctx) {
  const d = G.dialogue;
  if (!d) return;
  const W = G.view.w;
  const H = G.view.h;
  const w = Math.min(720, W - 340);
  const x = W / 2 - w / 2;
  const y = H - 118;
  panel(ctx, x, y, w, 58, 0.78);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f2c14e';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText(d.who.toUpperCase(), x + 14, y + 19);
  ctx.fillStyle = '#f4f1de';
  ctx.font = '14px system-ui, sans-serif';
  wrapText(ctx, d.text, x + 14, y + 39, w - 28, 17);
}

function panel(ctx, x, y, w, h, alpha) {
  ctx.fillStyle = 'rgba(16,20,26,' + alpha + ')';
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

function clockText(dayTime) {
  const mins = Math.floor(dayTime * 24 * 60);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return hh + ':' + mm;
}

function hexA(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

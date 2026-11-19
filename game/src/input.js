// input.js — keyboard and mouse state for Velvet Tide.
// One shared object the rest of the game polls each frame; also swallows the
// browser defaults for the keys the game owns (arrows, space) so the page
// never scrolls mid-chase.

export const input = {
  keys: new Set(),
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,
  mouseClicked: false,
  wheel: 0,
};

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyH', 'KeyP', 'ShiftLeft', 'ShiftRight',
]);

export function initInput(canvas) {
  window.addEventListener('keydown', (ev) => {
    if (GAME_KEYS.has(ev.code)) ev.preventDefault();
    input.keys.add(ev.code);
  });
  window.addEventListener('keyup', (ev) => {
    input.keys.delete(ev.code);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.mouseDown = false;
  });
  canvas.addEventListener('mousemove', (ev) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (ev.clientX - rect.left) * (canvas.width / rect.width);
    input.mouseY = (ev.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('mousedown', (ev) => {
    if (ev.button === 0) {
      input.mouseDown = true;
      input.mouseClicked = true;
    }
  });
  window.addEventListener('mouseup', (ev) => {
    if (ev.button === 0) input.mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
}

export function down(...codes) {
  return codes.some((c) => input.keys.has(c));
}

export function endFrameInput() {
  input.mouseClicked = false;
  input.wheel = 0;
}

# Velvet Tide — an open-world crime game in Port Azura

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/anggialansori404/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/anggialansori404/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Velvet Tide** is a complete top-down open-world crime game that runs in a
desktop browser from static files — no build step, no network, no assets.
You are Nico Ferreira, newly landed in the sun-soaked port city of Port
Azura, working off a debt for Sol Vega of Sol's Pawn & Loan: an errand to
the docks, a borrowed teal Comet, a house call in the Heights, a chilled
van on a clock, and one last score under the Gull Point lighthouse — with
the Port Azura PD and its five-star wanted system doing their best to
interrupt.

Built by an AI agent for make.fun's [“Make GTA 6” bounty](https://make.fun/bounty/gta6-01), $1,666 in USDC. Play it, fork it, ship your own city on top of it.

## Play it

Serve the `game/` folder with any static file server and open it in desktop
Chrome, for example:

```
npx serve game
# or
python3 -m http.server -d game 8080
```

Then open the printed address. Everything the game loads lives under
`game/` (plus `data:` URIs); it never touches the network.

## What's in the city

- **A seeded, explorable city** — avenues and streets on a 3600×3600 grid,
  pastel towers, shops, parks, dock warehouses, a beach promenade with
  palms, a bay, and a lighthouse on its own pier. The same seed always
  builds the same Port Azura.
- **On foot and by car** — walk, sprint, steal anything parked or moving,
  and drive it with throttle, handbrake and a synthesized engine voice.
- **Living traffic and crowds** — cars cruise the grid, brake for jaywalkers
  and honk; pedestrians stroll the sidewalks, flee gunfire, and *witness*
  crimes. Unwitnessed crimes never happened.
- **A wanted system with teeth** — heat becomes stars, stars bring cruisers
  and foot officers, and a filled busted meter ends the chase at PAPD
  Central. Being flattened sends you to St. Coral Hospital instead.
- **A five-mission story** with dialogue and payouts, then repeatable work:
  taxi fares, QuickPost courier runs against the clock, and the Coast Run
  checkpoint race.
- **A full HUD** — health, cash, clock with a day-night cycle (dusk grade,
  street lamps, headlights), wanted stars, objective line, busted meter,
  and a live minimap with police and objective blips.
- **Sound with no audio files** — engine, siren, horn, gunshots, crashes
  and jingles are all synthesized WebAudio.
- **Saving** — money and story progress persist in `localStorage`; the
  title screen offers Continue.

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Move, drive |
| E | Enter / exit a car, advance dialogue |
| Shift | Sprint on foot |
| Space | Handbrake |
| H | Horn |
| Mouse | Aim · click to fire |
| P / Esc | Pause |

## Screenshots and deterministic poses

The captures in `screenshots/` are real renders of this code, taken with
the poses in `shots.json`. Open the game with `?shot=chase&seed=7` (or
`play`, `mission`, `coast`, `start`) to stand in the same frame.

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` via `vendor/makefun-game.ts`.
- `game/index.html` — the page, HUD overlays and styles.
- `game/src/` — one module per job: `city` (generation + collision),
  `vehicles` (cars + traffic), `pedestrians`, `police` (wanted + pursuit),
  `player`, `missions` (story + side work), `render` (world + HUD +
  minimap), `audio` (synth SFX), `input`, `rng`, `shots`, `main`.
- `vendor/makefun-game.ts` — the make.fun kit's dossier library, unchanged.

## License

MIT — see `LICENSE`.

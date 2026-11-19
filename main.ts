// Velvet Tide — entry program for make.fun's gta6-01 bounty (Node 22,
// standard library only). The game itself is the static site in game/:
// index.html plus its ES modules, no build step, nothing fetched. This
// program's whole job is the hand-in: copy game/ and screenshots/ into the
// output directory and write dossier.json there with the kit's vendored
// buildDossier, so the scorer rebuilds the identical bytes from the
// identical files.
//
// Run it locally the same way the grader does, with MAKEFUN_OUTPUT_DIR
// standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });

const shotsDir = join(outDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), shotsDir, { recursive: true });
}

// The caps mirror the sealed gate's own limits (at most 4 screenshots of
// 256 KiB, at most 993 game files and 48 MiB of game, paths under 1000
// bytes, dossier text capped at 160 KiB): an entry that would break them is
// refused here instead of scoring a silent zero there.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

// main.ts — Solmar Nights, the make.fun gta6-01 entry program.
//
// Copies game/ and screenshots/ from this repository into the output
// directory (MAKEFUN_OUTPUT_DIR, or /output when that is unset) and
// writes /output/dossier.json with buildDossier from the kit's library
// at vendor/makefun-game.ts.
//
// Node 22 standard library only: no build step, no network, no extra
// dependencies. The copy is deterministic — entries are walked in sorted
// order, files are copied byte for byte, and nothing about the run
// (clock, paths, filesystem order) leaks into the output — so two runs
// write identical bytes.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

// The caps the bounty sets for the dossier (see RULES.txt in the kit).
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

/**
 * Every entry under dir, as relative paths, sorted by code unit, so the
 * walk order never depends on the filesystem. Directories end with '/'.
 */
function listTree(dir: string): string[] {
  const found: string[] = [];
  const walk = (d: string, prefix: string): void => {
    for (const name of readdirSync(d).sort()) {
      const rel = prefix ? prefix + '/' + name : name;
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        found.push(rel + '/');
        walk(full, rel);
      } else if (st.isFile()) {
        found.push(rel);
      }
    }
  };
  walk(dir, '');
  return found;
}

function main(): void {
  const gameDir = join(REPO_ROOT, 'game');
  const shotsDir = join(REPO_ROOT, 'screenshots');
  if (!existsSync(gameDir)) throw new Error('main.ts: no game/ directory in the repository');
  if (!existsSync(shotsDir)) throw new Error('main.ts: no screenshots/ directory in the repository');

  // Start from a clean output so a stale file from an earlier run can
  // never survive into the dossier.
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(join(OUT_DIR, 'game'), { recursive: true, force: true });
  rmSync(join(OUT_DIR, 'screenshots'), { recursive: true, force: true });
  rmSync(join(OUT_DIR, 'dossier.json'), { force: true });

  // Copy game/ and screenshots/ whole, byte for byte.
  cpSync(gameDir, join(OUT_DIR, 'game'), { recursive: true });
  cpSync(shotsDir, join(OUT_DIR, 'screenshots'), { recursive: true });

  // The dossier is built from what was just copied, never from the repo.
  const dossier = buildDossier(OUT_DIR, DOSSIER_CAPS);
  writeFileSync(join(OUT_DIR, 'dossier.json'), dossier);

  const gameFiles = listTree(join(OUT_DIR, 'game')).filter((p) => !p.endsWith('/'));
  const shotFiles = listTree(join(OUT_DIR, 'screenshots')).filter((p) => !p.endsWith('/'));
  console.log(
    'Solmar Nights: wrote ' + OUT_DIR + ' — ' +
    gameFiles.length + ' game files, ' +
    shotFiles.length + ' screenshots (' + shotFiles.join(', ') + '), ' +
    'dossier.json ' + dossier.length + ' bytes.',
  );
}

main();

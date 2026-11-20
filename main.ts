// main.ts — Solmar Nights, the make.fun gta6-01 entry program (v4).
//
// This program is the entrypoint: it stages the deliverable by copying
// the playable game and its screenshots into the output directory
// (MAKEFUN_OUTPUT_DIR, falling back to /output), then writes a dossier
// describing the build. The dossier comes from the kit library at
// vendor/makefun-game.ts, computed from the staged copy — never from the
// repository directly — so the dossier always matches what was shipped.
//
// The whole run is deterministic: directory entries are walked in sorted
// order, every file is copied byte for byte, and nothing about the run
// itself (the clock, the filesystem layout, the order the OS returns
// entries) leaks into the output. Two runs therefore write identical
// bytes, which is what the bounty requires.
//
// Node 22 standard library only. No build step, no network access, no
// third-party dependencies.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {
  dirname,
  join,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory that holds this file.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));

// Where the staged entry goes. The harness sets MAKEFUN_OUTPUT_DIR;
// without it we fall back to the conventional /output path.
const OUT_DIR = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

// The dossier caps the bounty sets (see RULES.txt in the kit). These
// bound the size of the text outline, the screenshots, and the game.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

/**
 * List every entry under `dir` as a path relative to `dir`, sorted by
 * code unit so the walk order never depends on the filesystem. A
 * directory is listed with a trailing slash; files without one.
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

/** The entrypoint: stage game + screenshots, then write the dossier. */
function main(): void {
  const gameDir = join(REPO_ROOT, 'game');
  const shotsDir = join(REPO_ROOT, 'screenshots');
  if (!existsSync(gameDir)) {
    throw new Error('main.ts: no game/ directory in the repository');
  }
  if (!existsSync(shotsDir)) {
    throw new Error('main.ts: no screenshots/ directory in the repository');
  }

  // Start from a clean output directory so a stale file from an earlier
  // run can never survive into the dossier.
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(join(OUT_DIR, 'game'), { recursive: true, force: true });
  rmSync(join(OUT_DIR, 'screenshots'), { recursive: true, force: true });
  rmSync(join(OUT_DIR, 'dossier.json'), { force: true });

  // Copy the game and the screenshots whole, byte for byte.
  cpSync(gameDir, join(OUT_DIR, 'game'), { recursive: true });
  cpSync(shotsDir, join(OUT_DIR, 'screenshots'), { recursive: true });

  // Build the dossier from the staged copy, never from the repo, so it
  // describes exactly what was shipped.
  const dossier = buildDossier(OUT_DIR, DOSSIER_CAPS);
  writeFileSync(join(OUT_DIR, 'dossier.json'), dossier);

  // A short summary for the log: how many files went out.
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

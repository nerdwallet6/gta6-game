[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/nerdwallet6/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/nerdwallet6/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Vice City Nights — an open-world crime game in Solmar City

Entry for the [make.fun `gta6-01` bounty](https://make.fun/bounty/gta6-01):
build the most complete, highest-quality open-world crime game you can, in
the spirit of GTA 6. A complete open world, playable in desktop Chrome from
static files, with keyboard and mouse and no network request.

**Play it:** serve `game/` with any static file server and open
`game/index.html` — for example `node serve.ts`, then
http://localhost:8080. Everything the game loads is a file under `game/`
or a `data:` URI; it makes no network request.

## The game

You are **Rae Solano**, a driver new to **Solmar City** — a sun-soaked
bay city of six districts (Palm Court, Neon Row, Old Harbor, Solmar Plaza,
Marina District, Cactus Flats), with parks, plazas, a beach and a bay along
its south edge. Fixer **Marla Voss** has five jobs for you, and the Vipers
gang wants the bay for themselves.

**Systems, all live and wired together:**

- **City on foot and by car** — WASD / arrows to move and drive, Shift to
  sprint, Space to brake, E to enter and exit cars.
- **Traffic and pedestrians** — cars follow the road grid, turn at
  intersections and queue behind each other; pedestrians stroll the
  sidewalks and flee from gunfire and high wanted levels.
- **Cars to steal** — any parked or driven car can be taken (E). Stealing
  one someone is driving raises your wanted level, and the driver runs.
- **Wanted level and police** — 0 to 5 stars. Crimes raise the heat;
  cruisers spawn, chase and ram you, and a slow cruiser next to you on
  foot will bust you. Stay clean and out of sight and the heat fades.
- **Missions and a story** — a 5-mission chain with dialogue, objectives,
  map markers and cash rewards: *First Wheels*, *The Pickup*, *Heat on
  Neon Row*, *The Getaway*, *King of the Bay*.
- **Combat** — punch (F), shoot with the mouse, reload (R). Rival gang
  members shoot back; every shot is heard across the street.
- **HUD with a minimap** — health, money, wanted stars, speed, mission
  objective, and a live canvas minimap showing roads, the player arrow,
  police dots and the mission marker.
- **Start screen, pause and save** — title screen, pause (P), autosave
  every 30 seconds plus save on pause, and continue from a saved game.
- **Sound** — fully synthesized WebAudio: engine hum, two-tone siren,
  gunshots, pickup chimes, mission jingles and a quiet sunset-drive music
  loop. No audio files. M mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| Shift | Sprint on foot |
| Space | Brake / handbrake in a car |
| E | Enter or exit a car · pick up / deliver mission items |
| Mouse click | Shoot (on foot, aim with the mouse) |
| F | Punch |
| R | Reload |
| P / Esc | Pause |
| Enter | Advance dialogue · start · keep playing after Wasted / Busted |
| M | Mute |
| S (while paused) | Save now |

## Project layout

- `main.ts` — the entry program (Node 22, stdlib only): copies `game/`
  and `screenshots/` to `MAKEFUN_OUTPUT_DIR` (else `/output`) and writes
  `dossier.json` with `buildDossier` from `vendor/makefun-game.ts`.
- `game/index.html` — the page; loads `game/src/main.js` as a module.
- `game/src/` — the game's own source, one file per job:
  - `main.js` — boot, game loop, camera, input, screens
  - `city.js` — Solmar City generation, roads, collision, drawing
  - `player.js` — on-foot movement, entering/exiting cars, health
  - `vehicles.js` — car physics, collisions, top-down car drawing
  - `traffic.js` — traffic cars and pedestrians
  - `police.js` — wanted level, cruiser chase and arrest
  - `missions.js` — the 5-mission story chain and objectives
  - `combat.js` — shooting, punching, rivals, bullets, particles
  - `hud.js` — HUD, minimap, dialogue, start/pause/end screens
  - `audio.js` — synthesized WebAudio sound and music
  - `save.js` — localStorage save / load
  - `shots.js` — deterministic staged scenes for screenshots
  - `util.js` — math and seeded-random helpers
- `screenshots/` — four real renders of the game, taken with headless
  Chromium from the staged `?shot=` scenes (`shots.json` lists them):
  `1-chase.jpg` (police chase, the cover), `2-city.jpg` (driving through
  the city), `3-mission.jpg` (mission combat), `4-start.jpg` (title).
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `serve.ts` — serves `game/` locally for play-testing.

## Verify locally

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node cli/makefun.mjs check --kit /path/to/kit --repo .
```

## Originality

All content is original: the city, districts, characters, vehicles,
names, story, art, sounds and music were made for this entry. Nothing
from Rockstar Games' Grand Theft Auto series or any other commercial game
— no names, logos, characters, map, art, music or assets from them.

## License

MIT — see `LICENSE`.

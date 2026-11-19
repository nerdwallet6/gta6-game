[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/nerdwallet6/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/nerdwallet6/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Nights — a 3D open-world crime game in Solmar City

Entry for the [make.fun `gta6-01` bounty](https://make.fun/bounty/gta6-01):
a full 3D third-person open-world crime game, playable in desktop Chrome
from static files, with keyboard and mouse and no network request. Three.js
is bundled locally under `game/lib/`; all models are low-poly geometry
built in code, all sound is synthesized WebAudio.

**Play it:** serve `game/` with any static file server and open
`game/index.html` — for example `node serve.ts`, then
http://localhost:8080. Everything the game loads is a file under `game/`
or a `data:` URI; it makes no network request.

## The game

You are **Rae Solano**, a driver new to **Solmar City** — a sun-soaked
bay city of six districts (Palm Court, Neon Row, Old Harbor, Solmar Plaza,
Marina District, Cactus Flats), with a beach and a bay along its south
edge, golden-hour skies, wet reflective roads and neon at night. Fixer
**Marla Voss** has jobs for you, the Vipers gang wants the bay for
themselves, and sharpshooter **Juno Vega** watches your back — switch
between the two protagonists at any time (Tab), each with a distinct
outfit and a special ability (Rae: Focus Drive slow-mo; Juno: Deadeye).

**Systems, all live and wired together:**

- **Third-person on foot** — the camera sits right behind your shoulder,
  your character fills the middle of the screen; walk, run, sprint
  (stamina), jump, punch (F), aim over the shoulder (right mouse).
- **Driving** — chase camera behind and above the car, road stretching
  ahead. Enter and exit cars (E) with a walk-to-door animation; carjack
  a driven car and the driver flees on foot. Sedans, sports cars, trucks
  and taxis, with traffic and pedestrians on the road grid.
- **Combat** — four weapons (pistol, SMG, shotgun, rifle) with different
  damage, range and fire rate; a radial weapon wheel (Q) to switch;
  reload (R); enemies chase and shoot back; every shot is heard across
  the street.
- **6-star wanted and police** — crimes raise the heat; cruisers chase
  and ram, foot cops bust you up close, a police helicopter with a
  searchlight circles from 3 stars, roadblocks with spike strips at 3+
  stars. Police-knowledge icons (face / clothing / vehicle) show what
  the cops know about you — change your outfit or ditch the car to
  shake them. Busted or Wasted costs 10% of your cash.
- **9 story missions** — a data-driven chain with dialogue, objectives,
  a pink GPS route and map markers: intro drive, pickup, shootout,
  police-escape chase, street race, heist and finale. Later missions
  are gated on total respect — earn it with jobs, races and district
  standing.
- **Money that buys things** — mission pay, race prizes and pickups go
  into cash (top right). Spend it on guns, ammo, suppressors and
  extended magazines at Ironworks Arms, outfits at Thread & Needle,
  garage upgrades (engine, armor, paint, NOS boost — hold Shift to
  boost) and a safehouse, where you can store your own car.
- **Street races** — three timed circuits (Neon Sprint, Bay Run, Flats
  Dash) with checkpoint gates, par times, best times and cash prizes.
- **Respect and district standing** — respect ranks unlock missions;
  standing per district grows as you work it.
- **Radio** — three stations (SOLMAR FM, Neon Nights, Bay Static) with
  the current station in the HUD; N to switch.
- **HUD and maps** — health / stamina / Focus / armor vitals top left,
  weapon ammo, cash, wanted stars and police-knowledge icons top right,
  mission objective on top, a rotating minimap with a pink GPS route
  bottom left, action prompt, radio, speed and NOS meter bottom right,
  and a full-screen map (M) with districts, roads, shops, race starts
  and the objective marker.
- **Start screen, pause and save** — title screen, pause (P), autosave
  every 30 seconds plus save on pause, and continue from a saved game
  (including your stored safehouse car, weapon mods and radio station).
- **Sound** — fully synthesized WebAudio: engine hum, two-tone siren,
  gunshots, pickup chimes, mission jingles and a step-sequencer radio.
  No audio files. U mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| Mouse | Orbit the camera (pointer lock) |
| Shift | Sprint on foot · NOS boost in a car (with a NOS kit) |
| Space | Jump on foot · brake / handbrake in a car |
| E | Enter or exit a car · interact · pick up / deliver |
| Mouse click | Shoot (aim with the mouse, right button to aim) |
| F | Punch |
| R | Reload |
| Q | Radial weapon wheel |
| Tab | Switch protagonist (Rae / Juno) |
| X | Special ability (Focus Drive / Deadeye) |
| N | Next radio station |
| U | Mute |
| M | Full-screen map |
| P / Esc | Pause |
| Enter | Advance dialogue · start · keep playing after Wasted / Busted |

## Project layout

- `main.ts` — the entry program (Node 22, stdlib only): copies `game/`
  and `screenshots/` to `MAKEFUN_OUTPUT_DIR` (else `/output`) and writes
  `dossier.json` with `buildDossier` from `vendor/makefun-game.ts`.
- `game/index.html` — the page; loads `game/src/main.js` as a module.
- `game/lib/` — Three.js 0.187.0 bundled locally as a single
  self-contained minified module (`three.module.min.js`, 5 lines,
  built from the official `three.module.js` + `three.core.js` with
  esbuild + Terser); no CDN, no network.
- `game/src/` — the game's own source, one file per job:
  - `main.js` — boot, game loop, camera, input, screens
  - `city.js` — Solmar City generation, roads, collision, day/night
  - `character.js` — low-poly humanoids and walk/run/aim poses
  - `vehicles.js` — car models, driving physics, traffic AI, NOS
  - `combat.js` — shooting, punching, enemies, pickups
  - `police.js` — 6-star wanted, cruisers, roadblocks, bust/wasted
  - `policeHelicopter.js` — the police helicopter and searchlight
  - `missions.js` — the 9-mission story engine and respect gating
  - `streetRaces.js` — timed street races with gates and prizes
  - `economy.js` — shops (guns, clothes, garage, safehouse), races
  - `garageUpgrades.js` — engine / armor / paint / NOS upgrades
  - `respectRanks.js` — respect totals and rank titles
  - `districtStanding.js` — standing per district
  - `radioStations.js` — the three radio stations
  - `data.js` — districts, shops, weapons, outfits, missions, races
  - `hud.js` — HUD, rotating minimap, full-screen map, menus, wheel
  - `audio.js` — synthesized WebAudio sound and radio
  - `save.js` — localStorage save / load
  - `shots.js` — deterministic staged scenes for screenshots
  - `util.js` — math and seeded-random helpers
- `screenshots/` — four real renders of the game, taken with headless
  Chromium from the staged `?shot=` scenes (`shots.json` lists them):
  `1-chase.jpg` (police chase with helicopter, the cover),
  `2-mission.jpg` (shootout with the weapon wheel open),
  `3-race.jpg` (street race), `4-garage.jpg` (weapon locker UI).
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `serve.ts` — serves `game/` locally for play-testing.

## Verify locally

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node cli/makefun.mjs check --kit /path/to/kit --repo .
```

A headless self-test also ships in the game itself: open
`game/index.html?selftest=1` and the page runs 13 scripted checks
(walk, jump, enter and drive a car, exit, shoot, wanted level with
helicopter, shop, race start and finish, protagonist switch,
save and reload, mission step) and reports `SELFTEST:PASS 13/13`.

## Originality

All content is original: the city, districts, characters, vehicles,
names, story, art, sounds and music were made for this entry. Nothing
from any commercial game — no names, logos, characters, map, art, music
or assets from them.

## License

MIT — see `LICENSE`.

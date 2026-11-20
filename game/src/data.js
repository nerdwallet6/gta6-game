// data.js — all static game data for Solmar Nights 3D (v4).
//
// This file holds every number and string the game is built from:
// the world dimensions, the six districts, the named map spots, the
// shops, the weapons, the outfits, the two protagonists, the car types,
// the respect ranks, the nine story missions, the three street races,
// the radio stations and the garage upgrades.
//
// Nothing in here touches the DOM or the renderer. main.js wires it
// all up at boot. The values are the game design — changing a number
// here changes the game — so a rewrite keeps every value identical
// and only changes how the data is laid out and commented.

// ------------------------------------------------------------------
// World geometry (metres). The city core spans x,z in [-300, 300];
// the beach and the bay lie south of z = 300.
// ------------------------------------------------------------------
export const WORLD = {
  // Half the city extent in either axis.
  half: 300,
  // The sand starts here; the water a little further south.
  beachZ: 300,
  waterZ: 340,
  // Half-width of a road.
  roadHalf: 6,
  // Block pitch: road centre to road centre.
  block: 72,
};

// ------------------------------------------------------------------
// The six districts. bounds are [x0, z0, x1, z1]; the palette drives
// building colour, height gives the min/max storeys, and neon marks the
// district whose signs glow after dark.
// ------------------------------------------------------------------
export const DISTRICTS = [
  {
    id: 'palm',
    name: 'Palm Court',
    bounds: [-300, -300, 0, 0],
    palette: ['#e8d9b0', '#d9c48f', '#c9b083'],
    height: [8, 22],
    neon: false,
  },
  {
    id: 'neon',
    name: 'Neon Row',
    bounds: [0, -300, 300, 0],
    palette: ['#3a2d5c', '#2c2140', '#4a3568'],
    height: [14, 42],
    neon: true,
  },
  {
    id: 'harbor',
    name: 'Old Harbor',
    bounds: [-300, 0, 0, 150],
    palette: ['#8a6f55', '#7a5f47', '#96795c'],
    height: [6, 18],
    neon: false,
  },
  {
    id: 'plaza',
    name: 'Solmar Plaza',
    bounds: [0, 0, 300, 150],
    palette: ['#b8c4cc', '#a8b8c2', '#c8d4da'],
    height: [20, 64],
    neon: false,
  },
  {
    id: 'marina',
    name: 'Marina District',
    bounds: [-300, 150, 0, 300],
    palette: ['#7fa8b8', '#6f98a8', '#8fb8c8'],
    height: [8, 26],
    neon: false,
  },
  {
    id: 'flats',
    name: 'Cactus Flats',
    bounds: [0, 150, 300, 300],
    palette: ['#c8a878', '#b89868', '#d8b888'],
    height: [5, 14],
    neon: false,
  },
];

// ------------------------------------------------------------------
// Named spots on the map. Each one is a place missions, races and the
// GPS can point at: its coordinates, its display label, and the
// district it belongs to.
// ------------------------------------------------------------------
export const SPOTS = {
  plaza: { x: 36, z: 72, label: 'Solmar Plaza', district: 'plaza' },
  marina: { x: -216, z: 216, label: 'Marina Docks', district: 'marina' },
  neonRow: { x: 216, z: -216, label: 'Neon Row', district: 'neon' },
  harbor: { x: -216, z: 36, label: 'Old Harbor', district: 'harbor' },
  tower: { x: 108, z: 108, label: 'Solmar Tower', district: 'plaza' },
  flats: { x: 216, z: 216, label: 'Cactus Flats', district: 'flats' },
  bayview: { x: -108, z: 252, label: 'Bayview Arena', district: 'marina' },
  beach: { x: 36, z: 312, label: 'South Beach', district: 'marina' },
  bank: { x: 180, z: 108, label: 'Solmar Bank', district: 'plaza' },
  safehouse: { x: -108, z: -108, label: 'Safehouse', district: 'palm' },
  gunshop: { x: 144, z: -144, label: 'Ironworks Arms', district: 'neon' },
  clothshop: { x: -180, z: -180, label: 'Thread & Needle', district: 'palm' },
  garage: { x: -252, z: 108, label: 'Solmar Customs', district: 'harbor' },
  raceNeon: { x: 252, z: -72, label: 'Neon Sprint start', district: 'neon' },
  raceBay: { x: -36, z: 288, label: 'Bay Loop start', district: 'marina' },
  raceFlats: { x: 252, z: 252, label: 'Flats Dash start', district: 'flats' },
  hospital: { x: -36, z: 180, label: 'Solmar General', district: 'marina' },
  policeHq: { x: 72, z: -36, label: 'Solmar PD HQ', district: 'neon' },
};

// ------------------------------------------------------------------
// Shop and service zones. Walk into one and press E to open its menu.
// kind selects the menu; color is the map marker colour.
// ------------------------------------------------------------------
export const SHOPS = [
  {
    id: 'guns',
    spot: 'gunshop',
    name: 'Ironworks Arms',
    kind: 'guns',
    color: 0xff5040,
  },
  {
    id: 'clothes',
    spot: 'clothshop',
    name: 'Thread & Needle',
    kind: 'clothes',
    color: 0xff9fd8,
  },
  {
    id: 'garage',
    spot: 'garage',
    name: 'Solmar Customs',
    kind: 'garage',
    color: 0xffb020,
  },
  {
    id: 'safehouse',
    spot: 'safehouse',
    name: 'Safehouse',
    kind: 'safehouse',
    color: 0x40d080,
  },
];

// ------------------------------------------------------------------
// Weapons. dmg is damage per hit, rate is seconds between shots,
// range is the effective reach in metres, mag is the magazine size,
// price is the shop price and ammoPrice the cost of a refill. The
// pistol is free at the start; spread is the aim cone, auto marks
// hold-to-fire weapons, pellets is the shotgun's pellet count, and
// color is the gunmetal used for the world model.
// ------------------------------------------------------------------
export const WEAPONS = {
  pistol: {
    name: 'Pistol',
    dmg: 26,
    rate: 0.28,
    range: 60,
    mag: 12,
    price: 0,
    ammoPrice: 20,
    spread: 0.012,
    auto: false,
    color: 0x2a2a2e,
  },
  smg: {
    name: 'SMG',
    dmg: 15,
    rate: 0.085,
    range: 48,
    mag: 30,
    price: 450,
    ammoPrice: 40,
    spread: 0.03,
    auto: true,
    color: 0x3a3f45,
  },
  shotgun: {
    name: 'Shotgun',
    dmg: 11,
    rate: 0.85,
    range: 26,
    mag: 6,
    price: 700,
    ammoPrice: 50,
    spread: 0.06,
    auto: false,
    pellets: 7,
    color: 0x5a3a28,
  },
  rifle: {
    name: 'Rifle',
    dmg: 42,
    rate: 0.13,
    range: 130,
    mag: 24,
    price: 1200,
    ammoPrice: 60,
    spread: 0.006,
    auto: true,
    color: 0x2e4038,
  },
};

// The order the weapon wheel and the 1-4 keys cycle through.
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle'];

// ------------------------------------------------------------------
// Outfits. jacket/pants are hex colours (null = bare), price is the
// shop price, and mask hides the face from the police — it clears the
// "knows your face" icon.
// ------------------------------------------------------------------
export const OUTFITS = {
  street: {
    name: 'Street',
    price: 0,
    jacket: null,
    pants: null,
    mask: false,
  },
  formal: {
    name: 'Formal',
    price: 250,
    jacket: 0x1c1c22,
    pants: 0x1c1c22,
    mask: false,
  },
  beach: {
    name: 'Beach',
    price: 180,
    jacket: 0xffd24a,
    pants: 0x2e86c8,
    mask: false,
  },
  night: {
    name: 'Night Runner',
    price: 400,
    jacket: 0x14141a,
    pants: 0x14141a,
    mask: false,
  },
  mask: {
    name: 'Mask + Hoodie',
    price: 320,
    jacket: 0x333338,
    pants: 0x222226,
    mask: true,
  },
};

// ------------------------------------------------------------------
// The two switchable protagonists. skin/hair/jacket/pants/shoes are
// the character colours; ability is the special (X key) and
// abilityName/abilityDesc describe it for the HUD.
// ------------------------------------------------------------------
export const PROTAGONISTS = [
  {
    id: 'rae',
    name: 'Rae Solano',
    role: 'Driver',
    skin: 0xc89878,
    hair: 0x201510,
    hairStyle: 'short',
    jacket: 0x2e8b8b,
    pants: 0x2a2d34,
    shoes: 0xdddddd,
    ability: 'focus',
    abilityName: 'Focus Drive',
    abilityDesc: 'Time slows while driving — thread traffic at speed.',
  },
  {
    id: 'juno',
    name: 'Juno Vega',
    role: 'Sharpshooter',
    skin: 0xe8b890,
    hair: 0xd8a020,
    hairStyle: 'long',
    jacket: 0xb03060,
    pants: 0x30343e,
    shoes: 0x222222,
    ability: 'deadeye',
    abilityName: 'Deadeye',
    abilityDesc: 'Time slows while aiming — line up the perfect shot.',
  },
];

// ------------------------------------------------------------------
// Car types. top is top speed in m/s, accel is acceleration,
// grip is handling, color is the default paint, price is a rarity
// hint (all street cars are free to take).
// ------------------------------------------------------------------
export const CAR_TYPES = {
  sedan: {
    name: 'Solmar',
    top: 34,
    accel: 16,
    grip: 2.6,
    color: 0x8a97a8,
    price: 0,
  },
  sport: {
    name: 'Comet GT',
    top: 48,
    accel: 24,
    grip: 3.4,
    color: 0xd84040,
    price: 0,
  },
  truck: {
    name: 'Hauler',
    top: 28,
    accel: 12,
    grip: 2.0,
    color: 0x5a6e3a,
    price: 0,
  },
  taxi: {
    name: 'Cab',
    top: 32,
    accel: 15,
    grip: 2.5,
    color: 0xe8b93a,
    price: 0,
  },
};

// ------------------------------------------------------------------
// Respect ranks, by total respect (the sum across all districts).
// The HUD shows the title for the highest threshold reached.
// ------------------------------------------------------------------
export const RESPECT_RANKS = [
  { at: 0, title: 'Nobody' },
  { at: 30, title: 'Hustler' },
  { at: 80, title: 'Street Name' },
  { at: 150, title: 'Shot Caller' },
  { at: 250, title: 'King of the Bay' },
];

// ------------------------------------------------------------------
// The story: nine missions, data-driven steps. A mission has an id,
// a title, the giver, a cash reward, an optional respect requirement
// (req), a briefing (dialogue lines), and steps. Step types:
//   steal — get in a car
//   goto — reach a spot
//   collect — pick something up (press E)
//   deliver — hand something over (press E)
//   eliminate — take down N enemies (count; boss marks the boss fight)
//   escape — lose the wanted level
//   chase — outrun the police to a spot
//   race — run a street race against the par time
// ------------------------------------------------------------------
export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Marla Voss',
    reward: 150,
    briefing: [
      'Marla: Rae. You want work in this city, you need wheels.',
      'Marla: Borrow a car. Any car. Then meet me at Solmar Plaza.',
    ],
    steps: [
      { type: 'steal', text: 'Get a car (walk to one, press E)' },
      { type: 'goto', spot: 'plaza', text: 'Drive to Solmar Plaza' },
    ],
  },
  {
    id: 'the-pickup',
    title: 'The Pickup',
    giver: 'Marla Voss',
    reward: 300,
    briefing: [
      'Marla: A package is waiting at the Marina Docks.',
      'Marla: Pick it up, bring it to Old Harbor. No cops, no fuss.',
    ],
    steps: [
      { type: 'goto', spot: 'marina', text: 'Go to the Marina Docks' },
      { type: 'collect', spot: 'marina', text: 'Pick up the package (press E)' },
      { type: 'goto', spot: 'harbor', text: 'Deliver to Old Harbor' },
      { type: 'deliver', spot: 'harbor', text: 'Hand over the package (press E)' },
    ],
  },
  {
    id: 'heat-on-neon-row',
    title: 'Heat on Neon Row',
    giver: 'Marla Voss',
    reward: 500,
    briefing: [
      'Marla: The Vipers are muscling in on Neon Row. Three of them.',
      'Marla: Send them a message. Then lose the heat before you come back.',
    ],
    steps: [
      { type: 'goto', spot: 'neonRow', text: 'Reach Neon Row' },
      { type: 'eliminate', spot: 'neonRow', count: 3, text: 'Deal with 3 Vipers' },
      { type: 'escape', text: 'Lose the wanted level' },
    ],
  },
  {
    id: 'the-getaway',
    title: 'The Getaway',
    giver: 'Dante Cole',
    reward: 750,
    briefing: [
      'Dante: The cops are onto the drop. I need a driver, now.',
      'Dante: Take the package to Bayview Arena — and they WILL chase you.',
    ],
    steps: [
      { type: 'goto', spot: 'flats', text: 'Meet Dante at Cactus Flats' },
      { type: 'collect', spot: 'flats', text: 'Grab the package (press E)' },
      { type: 'chase', spot: 'bayview', text: 'Outrun the police to Bayview Arena' },
    ],
  },
  {
    id: 'bay-heist',
    title: 'Bay Heist',
    giver: 'Marla Voss',
    reward: 1200,
    req: 20,
    briefing: [
      'Marla: The Solmar Bank vault opens at dusk. In and out, quiet.',
      'Marla: Grab the cash, lose the heat, and bring it to South Beach.',
    ],
    steps: [
      { type: 'goto', spot: 'bank', text: 'Reach Solmar Bank' },
      { type: 'collect', spot: 'bank', text: 'Crack the vault (press E)' },
      { type: 'escape', text: 'Lose the wanted level' },
      { type: 'goto', spot: 'beach', text: 'Bring the cash to South Beach' },
      { type: 'deliver', spot: 'beach', text: 'Hand over the cash (press E)' },
    ],
  },
  {
    id: 'junos-run',
    title: "Juno's Run",
    giver: 'Juno Vega',
    reward: 600,
    req: 40,
    briefing: [
      'Juno: The Neon Sprint is tonight. Five gates, one clock.',
      'Juno: Beat the par time and the street will know your name.',
    ],
    steps: [
      { type: 'goto', spot: 'raceNeon', text: 'Reach the Neon Sprint start' },
      { type: 'race', race: 'neon', text: 'Race the Neon Sprint — beat 1:20' },
    ],
  },
  {
    id: 'vipers-den',
    title: "Vipers' Den",
    giver: 'Dante Cole',
    reward: 900,
    req: 60,
    briefing: [
      'Dante: The Vipers nest in Cactus Flats. Five of them, armed.',
      'Dante: Clear the den, then bring their stash to Old Harbor.',
    ],
    steps: [
      { type: 'goto', spot: 'flats', text: 'Reach Cactus Flats' },
      { type: 'eliminate', spot: 'flats', count: 5, text: 'Clear out 5 Vipers' },
      { type: 'collect', spot: 'flats', text: 'Grab the stash (press E)' },
      { type: 'goto', spot: 'harbor', text: 'Deliver the stash to Old Harbor' },
      { type: 'deliver', spot: 'harbor', text: 'Hand over the stash (press E)' },
    ],
  },
  {
    id: 'midnight-run',
    title: 'Midnight Run',
    giver: 'Marla Voss',
    reward: 1000,
    req: 80,
    briefing: [
      'Marla: Three drops, one night. Marina, Neon Row, then the Plaza.',
      'Marla: Keep it quiet — the PD is watching every corner.',
    ],
    steps: [
      { type: 'goto', spot: 'marina', text: 'Drop 1: Marina Docks' },
      { type: 'deliver', spot: 'marina', text: 'Make the drop (press E)' },
      { type: 'goto', spot: 'neonRow', text: 'Drop 2: Neon Row' },
      { type: 'deliver', spot: 'neonRow', text: 'Make the drop (press E)' },
      { type: 'goto', spot: 'plaza', text: 'Drop 3: Solmar Plaza' },
      { type: 'deliver', spot: 'plaza', text: 'Make the drop (press E)' },
    ],
  },
  {
    id: 'king-of-the-bay',
    title: 'King of the Bay',
    giver: 'Marla Voss',
    reward: 2000,
    req: 90,
    briefing: [
      'Marla: One last job, Rae. The Vipers\' boss is at Solmar Tower.',
      'Marla: Finish it, and the bay is yours. Then meet me at South Beach.',
    ],
    steps: [
      { type: 'goto', spot: 'tower', text: 'Reach Solmar Tower' },
      { type: 'eliminate', spot: 'tower', count: 4, boss: true, text: 'Take down the Viper boss and his crew' },
      { type: 'goto', spot: 'beach', text: 'Meet Marla at South Beach' },
    ],
  },
];

// ------------------------------------------------------------------
// Street races. Each race has a name, a start spot, a prize, a par
// time in seconds, and its gates — checkpoint spots in order. The
// first and last gate are the start, so the course is a loop.
// ------------------------------------------------------------------
export const RACES = {
  neon: {
    name: 'Neon Sprint',
    start: 'raceNeon',
    prize: 400,
    par: 80,
    gates: ['neonRow', 'plaza', 'tower', 'bank', 'raceNeon'],
  },
  bay: {
    name: 'Bay Loop',
    start: 'raceBay',
    prize: 500,
    par: 95,
    gates: ['beach', 'marina', 'bayview', 'harbor', 'raceBay'],
  },
  flats: {
    name: 'Flats Dash',
    start: 'raceFlats',
    prize: 600,
    par: 85,
    gates: ['flats', 'tower', 'plaza', 'neonRow', 'raceFlats'],
  },
};

// ------------------------------------------------------------------
// Radio: three synthesized stations. bpm is the tempo, root is the
// base frequency in Hz, and scale is the step-sequencer row —
// semitone offsets from the root that the sequencer walks.
// ------------------------------------------------------------------
export const RADIO = [
  {
    id: 'solmar',
    name: 'SOLMAR FM',
    desc: 'Synthwave',
    bpm: 112,
    root: 55,
    scale: [0, 3, 5, 7, 10, 12, 15],
  },
  {
    id: 'bay',
    name: 'BAY 98',
    desc: 'Sunset chill',
    bpm: 84,
    root: 65.41,
    scale: [0, 2, 4, 7, 9, 12, 14],
  },
  {
    id: 'static',
    name: 'STATIC TALK',
    desc: 'Night talk',
    bpm: 96,
    root: 49,
    scale: [0, 5, 7, 12],
  },
];

// ------------------------------------------------------------------
// Garage upgrades for the player's owned car. apply selects the
// effect (engine / armor / nos / paint); paint upgrades also carry
// the colour. Prices are in dollars.
// ------------------------------------------------------------------
export const GARAGE_UPGRADES = [
  {
    id: 'engine1',
    name: 'Engine tune +15% top speed',
    price: 600,
    apply: 'engine',
  },
  {
    id: 'armor1',
    name: 'Armor plating +60 HP',
    price: 500,
    apply: 'armor',
  },
  {
    id: 'nos1',
    name: 'NOS boost kit (hold Shift to boost)',
    price: 800,
    apply: 'nos',
  },
  {
    id: 'paintRed',
    name: 'Paint: Crimson',
    price: 150,
    apply: 'paint',
    color: 0xd84040,
  },
  {
    id: 'paintTeal',
    name: 'Paint: Lagoon teal',
    price: 150,
    apply: 'paint',
    color: 0x2e8b8b,
  },
  {
    id: 'paintGold',
    name: 'Paint: Gold',
    price: 300,
    apply: 'paint',
    color: 0xe8b93a,
  },
];

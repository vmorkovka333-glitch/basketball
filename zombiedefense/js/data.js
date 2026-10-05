// Zombie Defense - static data: weapons, zombie types, round curve and the map.
window.ZD = window.ZD || {};
(function(ZD){

// ---- weapons -----------------------------------------------------------
// dmg per pellet, rate = seconds between shots, spread in radians
ZD.WEAPONS = {
  pistol:  { name:'Sidearm',     auto:false, dmg:40, rate:0.15,  mag:8,  reserve:80,  reload:1.35, pellets:1,
             spreadHip:0.020, spreadAds:0.004, kick:0.020, kickSide:0.006, headMul:2.6, range:70,
             sound:'pistol', model:'pistol', flash:0.8 },
  rifle:   { name:'Ranger AR',   auto:true,  dmg:55, rate:0.092, mag:30, reserve:270, reload:2.1,  pellets:1,
             spreadHip:0.032, spreadAds:0.005, kick:0.012, kickSide:0.008, headMul:2.2, range:90,
             sound:'rifle', model:'rifle', flash:1.0, cost:1200, ammoCost:600 },
  shotgun: { name:'Breacher 12', auto:false, dmg:34, rate:0.72,  mag:6,  reserve:42,  reload:2.5,  pellets:9,
             spreadHip:0.085, spreadAds:0.060, kick:0.055, kickSide:0.012, headMul:1.6, range:26,
             sound:'shotgun', model:'shotgun', flash:1.5, cost:1000, ammoCost:500 },
};
ZD.MELEE = { dmg:150, range:1.9, cone:0.45, cool:0.55 };

// ---- zombies -----------------------------------------------------------
// hp is a multiplier on the round's base health; speed in metres per second
ZD.ZOMBIES = {
  walker: { hp:1.00, speed:1.35, dmg:25, atk:1.10, scale:1.00, board:1.60, lean:0.22, arms:1.30 },
  runner: { hp:0.75, speed:4.10, dmg:20, atk:0.85, scale:0.96, board:1.10, lean:0.45, arms:1.05 },
  brute:  { hp:3.20, speed:1.10, dmg:45, atk:1.50, scale:1.38, board:0.70, lean:0.16, arms:1.15 },
};
ZD.SHIRTS = [0x5b4b3a, 0x3e4a5c, 0x6b3b36, 0x4d5a3a, 0x7a6a52, 0x3a3a44, 0x5e5368];
ZD.PANTS  = [0x2d2a26, 0x2f3540, 0x3b3226, 0x25282c];

// ---- rounds ------------------------------------------------------------
ZD.roundCount = n => n <= 5 ? [0, 6, 8, 13, 18, 24][n] : Math.round(24 + (n - 5) * 4.5);
ZD.roundHp    = n => n <= 9 ? 100 + 45 * (n - 1) : Math.round((100 + 45 * 8) * Math.pow(1.1, n - 9));
ZD.runnerShare = n => n < 3 ? 0 : Math.min(0.6, 0.14 + (n - 3) * 0.07);
ZD.bruteCount  = n => n < 5 ? 0 : Math.min(6, 1 + Math.floor((n - 5) / 2));
ZD.spawnGap    = n => Math.max(0.5, 2.1 - n * 0.12);
ZD.speedMul    = n => 1 + Math.min(0.25, (n - 1) * 0.02);
ZD.BREAK = 9;                 // seconds between rounds
ZD.MAX_ALIVE = 22;            // on screen at once (phones get fewer)
ZD.POINTS = { hit:10, kill:60, head:100, melee:130, board:10, start:500 };
ZD.PLAYER = { hp:100, walk:4.6, sprint:7.0, ads:2.6, regenDelay:3.0, regen:50, radius:0.38 };
ZD.DROPS = [
  { id:'ammo',   name:'MAX AMMO',      color:0x7fe0ff, chance:0.025 },
  { id:'double', name:'DOUBLE POINTS', color:0xffd23a, chance:0.025, time:30 },
];
ZD.GATE_COST = 750;

// ---- map ---------------------------------------------------------------
// A walled compound split in two yards. Walls are axis-aligned boxes
// {x0,x1,z0,z1,y0,y1}; window gaps get a sill (blocks the player, zombies climb
// over it) and a lintel, and carry six boards.
const X0 = -14, X1 = 14, Z0 = -12, Z1 = 18, ZM = 4, T = 0.6, H = 3.2;
const GAP = 2.4, SILL = 0.9, TOP = 2.4, GATE_W = 3.0;

const walls = [], windows = [];
function hWall(z, x0, x1, gaps, zoneOf){         // wall running along x at depth z
  const cuts = gaps.map(g => [g.c - (g.w || GAP) / 2, g.c + (g.w || GAP) / 2, g]).sort((a,b)=>a[0]-b[0]);
  let x = x0;
  for(const [a, b] of cuts){ if(a > x) walls.push({ x0:x, x1:a, z0:z-T/2, z1:z+T/2, y0:0, y1:H, kind:'wall' }); x = b; }
  if(x < x1) walls.push({ x0:x, x1:x1, z0:z-T/2, z1:z+T/2, y0:0, y1:H, kind:'wall' });
  for(const [a, b, g] of cuts) if(!g.gate) gapParts(a, b, z - T/2, z + T/2, g, 'h', z, zoneOf);
}
function vWall(x, z0, z1, gaps, zoneOf){         // wall running along z at x
  const cuts = gaps.map(g => [g.c - GAP/2, g.c + GAP/2, g]).sort((a,b)=>a[0]-b[0]);
  let z = z0;
  for(const [a, b] of cuts){ if(a > z) walls.push({ x0:x-T/2, x1:x+T/2, z0:z, z1:a, y0:0, y1:H, kind:'wall' }); z = b; }
  if(z < z1) walls.push({ x0:x-T/2, x1:x+T/2, z0:z, z1:z1, y0:0, y1:H, kind:'wall' });
  for(const [a, b, g] of cuts) gapParts(x - T/2, x + T/2, a, b, g, 'v', x, zoneOf);
}
function gapParts(ax0, ax1, az0, az1, g, dir, line){
  // for 'h' walls the gap spans x (ax0..ax1) at depth z; for 'v' walls it spans z
  let box;
  if(dir === 'h') box = { x0:ax0, x1:ax1, z0:az0, z1:az1 };
  else box = { x0:ax0, x1:ax1, z0:az0, z1:az1 };
  walls.push(Object.assign({}, box, { y0:0, y1:SILL, kind:'sill', win:g.id }));
  walls.push(Object.assign({}, box, { y0:TOP, y1:H, kind:'lintel', win:g.id }));
  const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2;
  windows.push({ id:g.id, zone:g.zone, cx, cz, nx:g.n[0], nz:g.n[1], dir });
}

// south wall (zone A)                                   outward normal points away from the yard
hWall(Z0, X0 - T/2, X1 + T/2, [ { c:-6, id:'A1', zone:'A', n:[0,-1] }, { c:7, id:'A2', zone:'A', n:[0,-1] } ]);
// north wall (zone B)
hWall(Z1, X0 - T/2, X1 + T/2, [ { c:0, id:'B3', zone:'B', n:[0,1] } ]);
// west wall
vWall(X0, Z0, Z1, [ { c:-6, id:'A3', zone:'A', n:[-1,0] }, { c:12, id:'B1', zone:'B', n:[-1,0] } ]);
// east wall
vWall(X1, Z0, Z1, [ { c:-2, id:'A4', zone:'A', n:[1,0] }, { c:10, id:'B2', zone:'B', n:[1,0] } ]);
// inner wall between the yards, with the gate
hWall(ZM, X0 + T/2, X1 - T/2, [ { c:0, w:GATE_W, gate:true } ]);

ZD.MAP = {
  X0, X1, Z0, Z1, ZM, T, H, GAP, SILL, TOP,
  walls, windows,
  gate: { x0:-GATE_W/2, x1:GATE_W/2, z0:ZM - T/2, z1:ZM + T/2, y0:0, y1:H, kind:'gate' },
  // props: boxes the player, zombies, bullets and the camera all respect
  props: [
    { x0:-10.0, x1:-4.4, z0:-2.2, z1: 0.4, y1:2.6, kind:'container', color:0x7a3b2a },
    { x0:  3.0, x1: 6.0, z0:-8.3, z1:-7.5, y1:1.0, kind:'sandbags' },
    { x0: -2.4, x1:-1.6, z0:-5.6, z1:-3.0, y1:1.0, kind:'sandbags' },
    { x0:  6.2, x1: 9.0, z0:-0.6, z1: 3.0, y1:1.6, kind:'jeep' },
    { x0: 10.6, x1:12.2, z0: 1.4, z1: 3.0, y1:1.2, kind:'crate' },
    { x0:-12.6, x1:-11.0, z0:-10.6, z1:-9.0, y1:1.0, kind:'crate' },
    { x0:  8.0, x1: 8.8, z0:-10.0, z1:-9.2, y1:1.1, kind:'barrel' },
    { x0:  9.0, x1: 9.8, z0:-9.6, z1:-8.8, y1:1.1, kind:'barrel' },
    { x0:-10.2, x1:-8.0, z0: 9.6, z1:11.4, y1:1.5, kind:'generator' },
    { x0:  3.4, x1: 9.0, z0:12.0, z1:14.4, y1:2.4, kind:'truck' },
    { x0:-12.4, x1:-10.8, z0:13.8, z1:15.4, y1:1.2, kind:'crate' },
    { x0: -3.0, x1:-1.8, z0: 8.6, z1: 9.8, y1:1.1, kind:'barrel' },
  ],
  start: { x:0, z:-4, yaw:0 },
  // wall buys: chalk outline on a wall face, bought from the point in front of it
  buys: [
    { id:'rifle',   weapon:'rifle',   x:-7, z: ZM - T/2 - 0.02, face:[0,-1], ix:-7, iz: ZM - 1.2, zone:'A' },
    { id:'shotgun', weapon:'shotgun', x:-7, z: Z1 - T/2 - 0.02, face:[0,-1], ix:-7, iz: Z1 - 1.2, zone:'B' },
  ],
  gateUse: [ { x:0, z:ZM - 1.3 }, { x:0, z:ZM + 1.3 } ],
  lamps: [ { x:-3, z:-6 }, { x:11, z:-8 }, { x:0, z:12 }, { x:-11, z:7 } ],
  inside(x, z){ return x > X0 && x < X1 && z > Z0 && z < Z1; },
  zoneOf(x, z){ return z < ZM ? 'A' : 'B'; },
};

})(window.ZD);

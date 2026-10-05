// Zombie Squad - static data: weapons, the squad, zombie types, missions and the town.
window.ZD = window.ZD || {};
(function(ZD){

// ---- weapons -----------------------------------------------------------
// dmg per pellet, rate = seconds between shots, spread in radians
ZD.WEAPONS = {
  rifle:   { name:'Ranger AR',   auto:true,  dmg:46, rate:0.1,   mag:30, reserve:240, reload:2.0, pellets:1,
             spreadHip:0.028, spreadAds:0.006, kick:0.011, kickSide:0.007, headMul:2.2, range:85, sound:'rifle', model:'rifle', flash:1.0 },
  pistol:  { name:'Sidearm',     auto:false, dmg:36, rate:0.16,  mag:12, reserve:Infinity, reload:1.2, pellets:1,
             spreadHip:0.02, spreadAds:0.004, kick:0.018, kickSide:0.006, headMul:2.6, range:70, sound:'pistol', model:'pistol', flash:0.8 },
  smg:     { name:'Viper SMG',   auto:true,  dmg:30, rate:0.068, mag:35, reserve:280, reload:1.7, pellets:1,
             spreadHip:0.04, spreadAds:0.012, kick:0.008, kickSide:0.009, headMul:2.0, range:55, sound:'smg', model:'smg', flash:0.8 },
  shotgun: { name:'Breacher 12', auto:false, dmg:30, rate:0.7,   mag:6,  reserve:36,  reload:2.4, pellets:9,
             spreadHip:0.085, spreadAds:0.06, kick:0.05, kickSide:0.012, headMul:1.6, range:26, sound:'shotgun', model:'shotgun', flash:1.5 },
};
ZD.MELEE = { dmg:150, range:1.9, cone:0.45, cool:0.55 };
ZD.GRENADE = { dmg:420, radius:5.5, fuse:1.5, speed:15, start:2, max:4 };

// ---- the squad ---------------------------------------------------------
ZD.PLAYER = { hp:100, walk:4.8, sprint:7.2, ads:2.8, regenDelay:5, regen:12, radius:0.38, bleed:30, revive:3 };
ZD.SQUAD = [
  { id:'ace',  name:'ACE',  color:0x3da5ff, css:'#3da5ff', weapon:'rifle',   hp:125, acc:0.62, slot:[-2.6, 2.4] },
  { id:'doc',  name:'DOC',  color:0x5be36b, css:'#5be36b', weapon:'smg',     hp:110, acc:0.55, slot:[ 2.6, 2.4], medic:true },
  { id:'tank', name:'TANK', color:0xff9a3c, css:'#ff9a3c', weapon:'shotgun', hp:175, acc:0.70, slot:[ 0.0, 4.2] },
];
ZD.CALLOUTS = {
  reload:['Reloading!', 'Changing mag!', 'Cover me, reloading!'],
  down:['I\'m down!', 'Need a hand here!', 'Help me up!'],
  revive:['Got you!', 'Up you get!', 'On your feet!'],
  revived:['Thanks!', 'Owe you one.', 'Back in it!'],
  grab:['Got one!', 'Picked it up!', 'Got it!'],
  horde:['Here they come!', 'Big group incoming!', 'Horde!'],
  nest:['Nest spotted!', 'Hit that nest!', 'Burn the nest!'],
  kill:['Got him.', 'Clear.', 'Down he goes.', 'Next!'],
  use:['Working on it!', 'On it!', 'Hold them off!'],
};

// ---- zombies -----------------------------------------------------------
ZD.ZOMBIES = {
  walker:  { hp:125, speed:1.85, dmg:13, atk:1.10, scale:1.00, lean:0.22, arms:1.30, pts:1 },
  runner:  { hp:80,  speed:4.4,  dmg:9,  atk:0.85, scale:0.96, lean:0.45, arms:1.05, pts:1 },
  brute:   { hp:520, speed:1.5,  dmg:28, atk:1.50, scale:1.38, lean:0.16, arms:1.15, pts:3 },
  bloater: { hp:160, speed:1.6,  dmg:0,  atk:0.80, scale:1.18, lean:0.10, arms:0.9,  pts:2, blast:{ dmg:45, r:4.0 } },
};
ZD.SHIRTS = [0x5b4b3a, 0x3e4a5c, 0x6b3b36, 0x4d5a3a, 0x7a6a52, 0x3a3a44, 0x5e5368];
ZD.PANTS  = [0x2d2a26, 0x2f3540, 0x3b3226, 0x25282c];
ZD.DIRECTOR = { base:12, perIntensity:4, maxAlive:24, maxAliveMobile:16, ring:[20, 36], gap:0.75, despawn:70 };

// ---- missions ----------------------------------------------------------
// step types: reach, collect, activate, destroy, rescue, evac
ZD.MISSIONS = [
  { id:'m1', name:'FIRST CONTACT', brief:'The generator at the gas station still works. Fuel it up, then get to the chopper.',
    start:{ x:0, z:-56, yaw:Math.PI }, intensity:1, par:300, mix:{ runner:0.12, brute:0.03, bloater:0 },
    steps:[
      { type:'reach',    text:'Get to the gas station',   at:[20, -22], r:7 },
      { type:'collect',  text:'Collect fuel cans',        item:'fuel', count:4, spots:[[13,-12],[34,-12],[15,-33],[24,-40],[2,-20]] },
      { type:'activate', text:'Refuel the generator',     at:[24, -26.5], r:2.6, time:14, horde:16, label:'GENERATOR' },
      { type:'evac',     text:'Reach the evac point',      at:[0, 56], r:8, wait:30 },
    ] },
  { id:'m2', name:'SUPPLY RUN', brief:'The clinic still has medicine. Grab it and burn the nests that block the main street.',
    start:{ x:-55, z:0, yaw:-Math.PI/2 }, intensity:2, par:420, mix:{ runner:0.2, brute:0.05, bloater:0.06 },
    steps:[
      { type:'reach',    text:'Get to the clinic',        at:[-26, 15], r:7 },
      { type:'collect',  text:'Collect medkits',          item:'medkit', count:5, spots:[[-33,12],[-18,10],[-29,20.5],[-11,22],[-36,19],[-27,42]] },
      { type:'destroy',  text:'Destroy the zombie nests',  count:3, spots:[[2, 22],[-3, 33],[22, 2]], nestHp:1100 },
      { type:'evac',     text:'Reach the evac point',      at:[0, 56], r:8, wait:35 },
    ] },
  { id:'m3', name:'LIGHTS OUT', brief:'Turn the radio relays back on, find the survivor at the police station and bring her home.',
    start:{ x:-28, z:-44, yaw:Math.PI }, intensity:3, par:520, mix:{ runner:0.26, brute:0.07, bloater:0.08 },
    steps:[
      { type:'activate', text:'Switch on the radio relays', multi:[[-24,-20.5],[42,-26],[40,24]], r:2.6, time:9, horde:10, label:'RELAY' },
      { type:'rescue',   text:'Find the survivor',          at:[24, 15], r:3 },
      { type:'evac',     text:'Get her to the evac point',  at:[0, 56], r:8, wait:32, escort:true },
    ] },
];

// ---- the town ------------------------------------------------------------
// Roads: a main street (x -7..7) and side streets (|x| 38..46), crossed by
// streets at z -7..7 and |z| 38..46. Buildings fill the blocks; props litter
// the roads. Everything is an axis-aligned box {x0,x1,z0,z1,h}.
const B = (x0, x1, z0, z1, h, style) => ({ x0, x1, z0, z1, y0:0, y1:h, h, style, kind:'building' });
ZD.TOWN = {
  half: 64,
  roads: [ [-7, 7, -64, 64], [-64, 64, -7, 7], [-64, 64, 38, 46], [-64, 64, -46, -38], [-46, -38, -64, 64], [38, 46, -64, 64] ],
  plaza: [-38, 38, 47, 64],
  buildings: [
    // north-east: police station and shops
    B(16, 36, 24, 37, 8, 'police'), B(8, 14, 26, 37, 6, 'brick'), B(8, 13, 9, 19, 5, 'teal'),
    // north-west: clinic, pharmacy, diner
    B(-36, -18, 24, 37, 9, 'clinic'), B(-14, -8, 28, 37, 5, 'beige'), B(-14, -9, 9, 19, 4, 'diner'),
    // south-east: the gas station shop and a corner store
    B(28, 37, -37, -29, 4.5, 'gasshop'), B(8, 13, -37, -29, 5, 'brick2'),
    // south-west: warehouse
    B(-37, -21, -37, -25, 8, 'warehouse'), B(-14, -8, -20, -9, 5, 'beige2'),
    // east edge
    B(48, 62, 10, 22, 6, 'brick'), B(48, 62, 26, 36, 7, 'teal'), B(48, 62, -36, -26, 5, 'beige'), B(48, 62, -22, -10, 6, 'brick2'),
    // south edge
    B(10, 24, -62, -50, 5, 'beige2'), B(28, 36, -62, -50, 6, 'brick'), B(-36, -22, -62, -50, 6, 'teal'), B(-18, -9, -62, -50, 4, 'diner'),
    // corners
    B(48, 62, 48, 62, 11, 'tower'), B(48, 62, -62, -48, 7, 'brick2'), B(-62, -48, 48, 62, 6, 'beige'),
  ],
  // props: cars, barriers, containers, the gas canopy pillars and pumps
  props: [
    // cars on the streets (leaving lanes open)
    { x0:-5.5, x1:-3.6, z0:-30, z1:-25.6, h:1.5, kind:'car', color:0x6a2a24 }, { x0:3.4, x1:5.3, z0:-14, z1:-9.6, h:1.5, kind:'car', color:0x2a3a5a },
    { x0:-5.2, x1:-3.3, z0:12, z1:16.4, h:1.5, kind:'car', color:0x2f4a34 }, { x0:2.8, x1:4.7, z0:28, z1:32.4, h:1.5, kind:'car', color:0x5a5a5e },
    { x0:18, x1:22.4, z0:-5.8, z1:-3.9, h:1.5, kind:'car', color:0x7a6a3a }, { x0:-24, x1:-19.6, z0:2.6, z1:4.5, h:1.5, kind:'car', color:0x3a2a4a },
    { x0:-30, x1:-17, z0:-5.6, z1:-2.6, h:3.0, kind:'bus', color:0xc8a02a },
    { x0:39.5, x1:41.4, z0:-52, z1:-47.6, h:1.5, kind:'car', color:0x444a52 }, { x0:-44.5, x1:-42.6, z0:20, z1:24.4, h:1.5, kind:'car', color:0x6a2a24 },
    { x0:20, x1:24.4, z0:40, z1:41.9, h:1.5, kind:'car', color:0x2a3a5a }, { x0:-12, x1:-7.6, z0:-44.5, z1:-42.6, h:1.5, kind:'car', color:0x5a3a2a },
    // barriers at the crossroads
    { x0:-1.5, x1:1.5, z0:8.5, z1:9.2, h:0.95, kind:'barrier' }, { x0:8.5, x1:9.2, z0:-1.5, z1:1.5, h:0.95, kind:'barrier' },
    { x0:-9.2, x1:-8.5, z0:-2.5, z1:0.5, h:0.95, kind:'barrier' }, { x0:-2, x1:1, z0:-9.2, z1:-8.5, h:0.95, kind:'barrier' },
    // gas station canopy pillars and pumps
    { x0:16.7, x1:17.3, z0:-24.3, z1:-23.7, h:4.5, kind:'pillar' }, { x0:26.7, x1:27.3, z0:-24.3, z1:-23.7, h:4.5, kind:'pillar' },
    { x0:16.7, x1:17.3, z0:-16.3, z1:-15.7, h:4.5, kind:'pillar' }, { x0:26.7, x1:27.3, z0:-16.3, z1:-15.7, h:4.5, kind:'pillar' },
    { x0:20.5, x1:21.5, z0:-21, z1:-19.6, h:1.6, kind:'pump' }, { x0:22.6, x1:23.6, z0:-21, z1:-19.6, h:1.6, kind:'pump' },
    // warehouse containers
    { x0:-18, x1:-12, z0:-35, z1:-32.6, h:2.6, kind:'container', color:0x7a3b2a }, { x0:-34, x1:-28, z0:-21, z1:-18.6, h:2.6, kind:'container', color:0x2e5a6e },
    { x0:-19, x1:-16.6, z0:-28, z1:-22, h:2.6, kind:'container', color:0x5a6a2e },
    // clinic and police yards
    { x0:-24, x1:-21, z0:13.5, z1:15.4, h:2.2, kind:'ambulance' }, { x0:20, x1:21, z0:10, z1:20, h:1.0, kind:'barrier' }, { x0:29, x1:30, z0:10, z1:20, h:1.0, kind:'barrier' },
    // dumpsters in the alleys
    { x0:14.4, x1:15.8, z0:30, z1:32.2, h:1.4, kind:'dumpster' }, { x0:-17.2, x1:-15.4, z0:12, z1:14, h:1.4, kind:'dumpster' },
  ],
  trees: [ [-58,-30],[-52,-22],[-60,-12],[-54,-4],[-58,8],[-51,16],[-59,26],[-53,33],[-57,-38],[-50,52],[-58,58],[-56,-56],[-50,-60],[-60,44] ],
  lamps: [ [-8.5,-50],[8.5,-30],[-8.5,-10],[8.5,10],[-8.5,30],[8.5,50],[30,-8.5],[-30,8.5],[-50,8.5],[50,-8.5] ],
  ammo: [ [-6,-36], [32,-11], [-28,10], [10,40], [-40,-8], [43,-30] ],
};

})(window.ZD);

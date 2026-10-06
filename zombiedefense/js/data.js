// Zombie Squad - static data: weapons, rarities, perks, power-ups, zombies, bosses,
// characters, outfits, killstreaks, achievements and challenge templates.
window.ZD = window.ZD || {};
(function(ZD){

// ---- weapons -----------------------------------------------------------
// dmg per pellet, rate = seconds between shots, spread in radians.
// price = wall-buy price in Survival, cost/lvl = Armory unlock with credits at a player level.
// box = weight in the Survival mystery box. element: fire | shock | cryo | toxic.
ZD.WEAPONS = {
  pistol:  { name:'Sidearm', cat:'pistol', auto:false, dmg:36, rate:0.16, mag:12, reserve:Infinity, reload:1.2, pellets:1,
             spreadHip:0.02, spreadAds:0.004, kick:0.018, kickSide:0.006, headMul:2.6, range:70, sound:'pistol', model:'pistol', flash:0.8,
             tier:1, price:0, cost:0, lvl:1, box:0, desc:'Reliable and never runs dry.' },
  magnum:  { name:'Hand Cannon', cat:'pistol', auto:false, dmg:120, rate:0.36, mag:6, reserve:54, reload:2.1, pellets:1,
             spreadHip:0.018, spreadAds:0.003, kick:0.05, kickSide:0.01, headMul:2.8, range:75, sound:'magnum', model:'magnum', flash:1.2, pierce:2,
             tier:2, price:900, cost:1500, lvl:3, box:6, desc:'Six heavy rounds that punch through.' },
  smg:     { name:'Viper SMG', cat:'smg', auto:true, dmg:30, rate:0.068, mag:35, reserve:280, reload:1.7, pellets:1,
             spreadHip:0.04, spreadAds:0.012, kick:0.008, kickSide:0.009, headMul:2.0, range:55, sound:'smg', model:'smg', flash:0.8,
             tier:1, price:1000, cost:0, lvl:1, box:8, desc:'Fast and light. Great while moving.' },
  hornet:  { name:'Hornet', cat:'smg', auto:true, dmg:24, rate:0.05, mag:44, reserve:352, reload:1.6, pellets:1,
             spreadHip:0.045, spreadAds:0.014, kick:0.007, kickSide:0.01, headMul:2.0, range:50, sound:'smg', model:'hornet', flash:0.7,
             tier:2, price:1400, cost:2500, lvl:6, box:7, desc:'A bullet hose with a long magazine.' },
  rifle:   { name:'Ranger AR', cat:'rifle', auto:true, dmg:46, rate:0.1, mag:30, reserve:240, reload:2.0, pellets:1,
             spreadHip:0.028, spreadAds:0.006, kick:0.011, kickSide:0.007, headMul:2.2, range:85, sound:'rifle', model:'rifle', flash:1.0,
             tier:1, price:1500, cost:0, lvl:1, box:8, desc:'The all-rounder.' },
  bulldog: { name:'Bulldog', cat:'rifle', auto:true, dmg:64, rate:0.13, mag:25, reserve:200, reload:2.2, pellets:1,
             spreadHip:0.03, spreadAds:0.006, kick:0.016, kickSide:0.008, headMul:2.2, range:85, sound:'rifle', model:'bulldog', flash:1.1, pierce:2,
             tier:3, price:1800, cost:3500, lvl:8, box:6, desc:'Heavy rounds, slower fire.' },
  shotgun: { name:'Breacher 12', cat:'shotgun', auto:false, dmg:30, rate:0.7, mag:6, reserve:36, reload:2.4, pellets:9,
             spreadHip:0.085, spreadAds:0.06, kick:0.05, kickSide:0.012, headMul:1.6, range:26, sound:'shotgun', model:'shotgun', flash:1.5,
             tier:1, price:1100, cost:0, lvl:1, box:7, desc:'Clears a doorway in one pull.' },
  riot:    { name:'Riot Auto', cat:'shotgun', auto:false, dmg:26, rate:0.28, mag:10, reserve:60, reload:2.8, pellets:8,
             spreadHip:0.09, spreadAds:0.065, kick:0.04, kickSide:0.012, headMul:1.6, range:24, sound:'shotgun', model:'riot', flash:1.4,
             tier:3, price:2000, cost:4000, lvl:10, box:6, desc:'Semi-automatic shotgun.' },
  dmr:     { name:'Marksman', cat:'sniper', auto:false, dmg:95, rate:0.25, mag:12, reserve:96, reload:2.2, pellets:1,
             spreadHip:0.03, spreadAds:0.0015, kick:0.03, kickSide:0.006, headMul:2.6, range:110, sound:'dmr', model:'dmr', flash:1.1, pierce:2, ads:34,
             tier:2, price:1500, cost:2800, lvl:5, box:6, desc:'Semi-auto precision.' },
  sniper:  { name:'Longshot', cat:'sniper', auto:false, dmg:280, rate:1.1, mag:5, reserve:35, reload:2.6, pellets:1,
             spreadHip:0.06, spreadAds:0.0005, kick:0.07, kickSide:0.01, headMul:3.0, range:140, sound:'sniper', model:'sniper', flash:1.5, pierce:5, ads:22,
             tier:3, price:1700, cost:3200, lvl:7, box:5, desc:'One shot goes through a whole line.' },
  lmg:     { name:'Hammer LMG', cat:'lmg', auto:true, dmg:52, rate:0.085, mag:100, reserve:300, reload:4.2, pellets:1,
             spreadHip:0.04, spreadAds:0.014, kick:0.012, kickSide:0.01, headMul:2.0, range:90, sound:'lmg', model:'lmg', flash:1.2, pierce:2,
             tier:3, price:2600, cost:5000, lvl:12, box:5, desc:'A hundred rounds before you stop.' },
  launcher:{ name:'Thumper', cat:'special', auto:false, dmg:420, rate:0.9, mag:4, reserve:24, reload:3.0, pellets:1,
             spreadHip:0.02, spreadAds:0.01, kick:0.06, kickSide:0.01, headMul:1, range:60, sound:'launcher', model:'launcher', flash:1.3, proj:30, aoe:4.5,
             tier:4, price:0, cost:6000, lvl:14, box:4, desc:'Explosive rounds for big crowds.' },
  flamer:  { name:'Inferno', cat:'special', auto:true, dmg:16, rate:0.05, mag:120, reserve:360, reload:3.0, pellets:1,
             spreadHip:0.0, spreadAds:0.0, kick:0.002, kickSide:0.002, headMul:1, range:9, sound:'flamer', model:'flamer', flash:0, flame:true, element:'fire',
             tier:4, price:0, cost:7000, lvl:16, box:3, desc:'Sets everything in front of you on fire.' },
  tesla:   { name:'Tesla Coil', cat:'special', auto:false, dmg:170, rate:0.35, mag:12, reserve:72, reload:2.5, pellets:1,
             spreadHip:0.01, spreadAds:0.005, kick:0.02, kickSide:0.005, headMul:1.5, range:40, sound:'tesla', model:'tesla', flash:0, element:'shock', chain:4,
             tier:4, price:0, cost:8000, lvl:18, box:3, desc:'Lightning jumps from zombie to zombie.' },
  cryo:    { name:'Cryo Blaster', cat:'special', auto:true, dmg:40, rate:0.12, mag:30, reserve:180, reload:2.4, pellets:1,
             spreadHip:0.02, spreadAds:0.008, kick:0.008, kickSide:0.006, headMul:1.8, range:45, sound:'cryo', model:'cryo', flash:0, element:'cryo',
             tier:4, price:0, cost:7500, lvl:20, box:3, desc:'Slows zombies down, then freezes them solid.' },
  // secret weapons: only from the secret rooms (see the mystery system)
  raygun:  { name:'Ray Gun Z', cat:'secret', auto:false, dmg:330, rate:0.3, mag:20, reserve:160, reload:2.0, pellets:1,
             spreadHip:0.01, spreadAds:0.004, kick:0.02, kickSide:0.004, headMul:1.5, range:70, sound:'ray', model:'raygun', flash:0, proj:42, aoe:2.6, element:'toxic',
             tier:4, secret:true, box:0, desc:'Found behind a sealed door. Nobody knows who built it.' },
  storm:   { name:'Stormbreaker', cat:'secret', auto:true, dmg:70, rate:0.11, mag:40, reserve:240, reload:2.2, pellets:1,
             spreadHip:0.02, spreadAds:0.005, kick:0.01, kickSide:0.006, headMul:2.2, range:90, sound:'tesla', model:'storm', flash:0, element:'shock', chain:2, pierce:3,
             tier:4, secret:true, box:0, desc:'An assault rifle that fires lightning.' },
  dragon:  { name:"Dragon's Breath", cat:'secret', auto:false, dmg:44, rate:0.32, mag:12, reserve:96, reload:2.4, pellets:9,
             spreadHip:0.08, spreadAds:0.06, kick:0.04, kickSide:0.012, headMul:1.6, range:30, sound:'shotgun', model:'dragon', flash:1.6, element:'fire',
             tier:4, secret:true, box:0, desc:'Every pellet burns.' },
  void:    { name:'Void Cannon', cat:'secret', auto:false, dmg:600, rate:1.0, mag:6, reserve:36, reload:2.8, pellets:1,
             spreadHip:0.01, spreadAds:0.004, kick:0.06, kickSide:0.01, headMul:1, range:70, sound:'void', model:'void', flash:0, proj:26, aoe:6, implode:true,
             tier:4, secret:true, box:0, desc:'Pulls everything into a black hole.' },
};
ZD.WEAPON_ORDER = ['pistol','magnum','smg','hornet','rifle','bulldog','shotgun','riot','dmr','sniper','lmg','launcher','flamer','tesla','cryo','raygun','storm','dragon','void'];
ZD.SECRET_WEAPONS = ['raygun', 'storm', 'dragon', 'void'];
ZD.ELEMENTS = {
  fire:  { name:'FIRE',  color:'#ff7a2a', hex:0xff7a2a },
  shock: { name:'SHOCK', color:'#7fd8ff', hex:0x7fd8ff },
  cryo:  { name:'CRYO',  color:'#a8e8ff', hex:0xa8e8ff },
  toxic: { name:'TOXIC', color:'#9cff3c', hex:0x9cff3c },
};
ZD.RARITY = [
  { id:'common',    name:'Common',    color:'#d8d4cc', hex:0xd8d4cc, dmg:1.0,  mag:1.0, crit:0.00 },
  { id:'rare',      name:'Rare',      color:'#4aa8ff', hex:0x4aa8ff, dmg:1.18, mag:1.1, crit:0.03 },
  { id:'epic',      name:'Epic',      color:'#b45cff', hex:0xb45cff, dmg:1.38, mag:1.2, crit:0.06 },
  { id:'legendary', name:'Legendary', color:'#ffa63a', hex:0xffa63a, dmg:1.65, mag:1.3, crit:0.10 },
];
// Armory upgrades bought with credits; each level is a step on top of the base
ZD.UPGRADES = {
  dmg:    { name:'Damage',    max:5, step:0.10, label:'+10% damage' },
  mag:    { name:'Magazine',  max:3, step:0.15, label:'+15% magazine' },
  reload: { name:'Reload',    max:3, step:0.12, label:'12% faster reload' },
  rate:   { name:'Fire rate', max:3, step:0.08, label:'+8% fire rate' },
};
ZD.upgradeCost = (w, key, lvl) => Math.round((260 + 220*(ZD.WEAPONS[w].tier || 1)) * (lvl + 1) * (key === 'dmg' ? 1 : 0.8) / 10) * 10;
ZD.MELEE = {
  knife:   { name:'Combat Knife', dmg:150, range:1.9, cone:0.45, cool:0.55, knock:0.6, cost:0,    lvl:1,  model:'knife' },
  bat:     { name:'Spiked Bat',   dmg:190, range:2.1, cone:0.35, cool:0.5,  knock:2.4, cost:1000, lvl:2,  model:'bat' },
  machete: { name:'Machete',      dmg:240, range:2.1, cone:0.4,  cool:0.48, knock:0.8, cost:1600, lvl:4,  model:'machete' },
  katana:  { name:'Katana',       dmg:420, range:2.5, cone:0.3,  cool:0.4,  knock:1.0, cost:5000, lvl:15, model:'katana' },
};
ZD.MELEE_ORDER = ['knife', 'bat', 'machete', 'katana'];
ZD.GRENADE = { dmg:420, radius:5.5, fuse:1.5, speed:15, start:2, max:4 };
ZD.CRIT = { chance:0.05, mul:2 };

// ---- the player and the squad -------------------------------------------
ZD.PLAYER = { hp:100, walk:4.8, sprint:7.2, ads:2.8, regenDelay:5, regen:12, radius:0.38, bleed:30, revive:3 };
// ability: the ultimate, charged by kills and damage. bot: the gun a character uses as a squadmate.
ZD.CHARS = {
  max:   { name:'MAX',   role:'Rifleman', color:0xf3efe6, css:'#f3efe6', weapon:'rifle',   hp:100, acc:0.60, cost:0,    lvl:1,
           ability:'adrenaline', ult:'ADRENALINE', ultDesc:'10 s of faster moving, shooting and reloading.' },
  ace:   { name:'ACE',   role:'Marksman', color:0x3da5ff, css:'#3da5ff', weapon:'dmr',     hp:100, acc:0.68, cost:0,    lvl:1,
           ability:'deadeye', ult:'DEADEYE', ultDesc:'8 s where every hit is a critical headshot.' },
  doc:   { name:'DOC',   role:'Medic',    color:0x5be36b, css:'#5be36b', weapon:'smg',     hp:95,  acc:0.55, cost:0,    lvl:1, medic:true,
           ability:'medic', ult:'FIELD MEDIC', ultDesc:'Heals the squad and pulls up everyone who is down.' },
  tank:  { name:'TANK',  role:'Heavy',    color:0xff9a3c, css:'#ff9a3c', weapon:'shotgun', hp:130, acc:0.70, cost:0,    lvl:1,
           ability:'bulwark', ult:'BULWARK', ultDesc:'8 s of no damage. Zombies come for you instead.' },
  spark: { name:'SPARK', role:'Engineer', color:0xffd23a, css:'#ffd23a', weapon:'hornet',  hp:100, acc:0.58, cost:4000, lvl:5,
           ability:'sentry', ult:'SENTRY', ultDesc:'Drops an auto turret for 25 s.' },
  ghost: { name:'GHOST', role:'Scout',    color:0xb0b8c8, css:'#b0b8c8', weapon:'sniper',  hp:90,  acc:0.72, cost:6000, lvl:9,
           ability:'shadow', ult:'SHADOW', ultDesc:'8 s unseen: zombies ignore you and you hit 50% harder.' },
  blaze: { name:'BLAZE', role:'Pyro',     color:0xff4a2a, css:'#ff4a2a', weapon:'riot',    hp:110, acc:0.62, cost:9000, lvl:13,
           ability:'firestorm', ult:'FIRESTORM', ultDesc:'A ring of fire burns everything close to you.' },
};
ZD.CHAR_ORDER = ['max', 'ace', 'doc', 'tank', 'spark', 'ghost', 'blaze'];
ZD.ABILITY = { charge:2600, killCharge:0.012 };
// outfits recolor the uniform; some come from achievements
ZD.OUTFITS = {
  woodland: { name:'Woodland',  shirt:0x5a6346, sleeve:0x4e573d, pants:0x3b4130, vest:0x464d36, cost:0 },
  urban:    { name:'Urban',     shirt:0x6a6e74, sleeve:0x5a5e64, pants:0x34383e, vest:0x4a4e54, cost:1500 },
  desert:   { name:'Desert',    shirt:0xb89a68, sleeve:0xa88a5a, pants:0x7a6440, vest:0x8a7450, cost:1500 },
  arctic:   { name:'Arctic',    shirt:0xd8dce0, sleeve:0xc8ccd2, pants:0x8a9098, vest:0xa8aeb6, cost:2000 },
  night:    { name:'Night Ops', shirt:0x2a2e34, sleeve:0x22262c, pants:0x1a1c20, vest:0x30343a, cost:3000 },
  crimson:  { name:'Crimson',   shirt:0x7a2a2a, sleeve:0x6a2222, pants:0x3a1a1a, vest:0x4a2020, ach:'kills_1000' },
  gold:     { name:'Gold',      shirt:0xc8a038, sleeve:0xb08a28, pants:0x6a5420, vest:0xd8b048, ach:'secret_all', gold:true },
};
ZD.OUTFIT_ORDER = ['woodland', 'urban', 'desert', 'arctic', 'night', 'crimson', 'gold'];
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
  boss:['That\'s a big one!', 'Focus the boss!', 'Aim for the weak spot!'],
  ult:['Watch this!', 'Here we go!', 'Ability up!'],
  wave:['Next wave!', 'Reload while you can.', 'Stay together.'],
  power:['Power is on!', 'Lights are back!'],
  scary:['Did you hear that?', 'Something\'s watching us.', 'I don\'t like this.'],
};

// ---- zombies -----------------------------------------------------------
// armor soaks 75% of a hit until it breaks; shield blocks hits from the front.
ZD.ZOMBIES = {
  walker:   { name:'Walker',     hp:125, speed:1.85, dmg:13, atk:1.10, scale:1.00, lean:0.22, arms:1.30, pts:60 },
  runner:   { name:'Runner',     hp:80,  speed:4.4,  dmg:9,  atk:0.85, scale:0.96, lean:0.45, arms:1.05, pts:60 },
  brute:    { name:'Tank',       hp:520, speed:1.5,  dmg:28, atk:1.50, scale:1.38, lean:0.16, arms:1.15, pts:120 },
  bloater:  { name:'Bloater',    hp:160, speed:1.6,  dmg:0,  atk:0.80, scale:1.18, lean:0.10, arms:0.9,  pts:90, blast:{ dmg:45, r:4.0 } },
  armored:  { name:'Armored',    hp:160, speed:1.7,  dmg:15, atk:1.10, scale:1.06, lean:0.18, arms:1.25, pts:100, armor:320, helmet:true },
  healer:   { name:'Healer',     hp:180, speed:1.7,  dmg:10, atk:1.10, scale:1.0,  lean:0.15, arms:0.9,  pts:110, heal:{ r:7, hps:22 } },
  shield:   { name:'Shield',     hp:200, speed:1.6,  dmg:14, atk:1.20, scale:1.08, lean:0.10, arms:1.5,  pts:110, shield:true },
  stealth:  { name:'Stalker',    hp:110, speed:2.6,  dmg:14, atk:0.95, scale:0.98, lean:0.35, arms:1.1,  pts:90, stealth:true },
  climber:  { name:'Climber',    hp:120, speed:3.3,  dmg:10, atk:0.90, scale:0.94, lean:0.55, arms:0.95, pts:80, leap:true },
  teleport: { name:'Phaser',     hp:140, speed:1.9,  dmg:13, atk:1.00, scale:1.0,  lean:0.2,  arms:1.2,  pts:100, blink:{ every:4.5, dist:7 } },
  mutant:   { name:'Spitter',    hp:240, speed:1.6,  dmg:12, atk:1.10, scale:1.12, lean:0.25, arms:1.2,  pts:120, spit:{ range:14, cool:3.6, dmg:16 } },
  giant:    { name:'Giant',      hp:2600,speed:1.25, dmg:40, atk:1.80, scale:2.1,  lean:0.12, arms:1.0,  pts:500, stomp:{ r:5, dmg:22, cool:6 } },
  golden:   { name:'Golden',     hp:1400,speed:3.0,  dmg:0,  atk:1.0,  scale:1.0,  lean:0.2,  arms:1.0,  pts:2000, flee:true },
  captain:  { name:'Brute Captain', hp:3000, speed:1.8, dmg:34, atk:1.5, scale:1.65, lean:0.16, arms:1.15, pts:800, mini:true },
};
// zombie evolution in Survival: from wave 12 a growing share gets one of these
ZD.MUTATIONS = {
  armor:    { name:'ARMOR PLATES', desc:'Some zombies now wear armor.' },
  regen:    { name:'REGENERATION', desc:'Some zombies now heal over time.' },
  volatile: { name:'VOLATILE', desc:'Some zombies now explode when they die.' },
  swift:    { name:'SWIFTNESS', desc:'Some zombies are now much faster.' },
  enraged:  { name:'RAGE', desc:'Some zombies now hit much harder.' },
};
ZD.SHIRTS = [0x5b4b3a, 0x3e4a5c, 0x6b3b36, 0x4d5a3a, 0x7a6a52, 0x3a3a44, 0x5e5368];
ZD.PANTS  = [0x2d2a26, 0x2f3540, 0x3b3226, 0x25282c];
ZD.DIRECTOR = { base:12, perIntensity:4, maxAlive:24, maxAliveMobile:16, ring:[20, 36], gap:0.75, despawn:70 };

// ---- bosses ------------------------------------------------------------
// abilities: charge, cleave, slam, summon, buff, spit, gas, heal, teleport, pull, shards, stomp, cloak, meteor
// phases at 66% and 33% health add abilities and speed. weak: where hits do extra damage.
ZD.BOSSES = {
  butcher:  { name:'THE BUTCHER',    hp:7000,  scale:2.0, speed:2.1, dmg:34, look:'butcher',  skin:0x8a9a6a, shirt:0xd8d0c0, weak:'head', weakMul:2.5,
              abilities:[['charge','cleave'], ['summon'], ['charge']] },
  general:  { name:'GENERAL GORE',   hp:9000,  scale:2.2, speed:1.8, dmg:36, look:'general',  skin:0x7a8a5a, shirt:0x4a5a36, weak:'back', weakMul:2.5,
              abilities:[['slam','summon'], ['buff','shards'], ['charge']] },
  doctor:   { name:'DR. ROT',        hp:7500,  scale:1.9, speed:2.0, dmg:30, look:'doctor',   skin:0x9aaa7a, shirt:0xe8e8e0, weak:'head', weakMul:2.5,
              abilities:[['gas','summon'], ['heal','teleport'], ['gas']] },
  specimen: { name:'SPECIMEN X',     hp:8000,  scale:2.0, speed:2.4, dmg:32, look:'specimen', skin:0x6aa8a0, shirt:0x2a4a50, weak:'back', weakMul:3,
              abilities:[['spit','teleport'], ['cloak','summon'], ['charge']] },
  warden:   { name:'THE WARDEN',     hp:8500,  scale:2.1, speed:1.9, dmg:36, look:'warden',   skin:0x7a8a68, shirt:0x2a3040, weak:'head', weakMul:2.5,
              abilities:[['pull','slam'], ['summon'], ['charge','buff']] },
  mannequin:{ name:'THE MANNEQUIN',  hp:7500,  scale:2.0, speed:2.6, dmg:30, look:'mannequin',skin:0xe8e2d8, shirt:0xd8d2c8, weak:'head', weakMul:3,
              abilities:[['teleport','cleave'], ['cloak','summon'], ['charge']] },
  conductor:{ name:'THE CONDUCTOR',  hp:9000,  scale:2.1, speed:2.0, dmg:34, look:'conductor',skin:0x7a8a6a, shirt:0x2a2a4a, weak:'back', weakMul:2.5,
              abilities:[['charge','summon'], ['shards'], ['slam','buff']] },
  stalker:  { name:'THE STALKER',    hp:8000,  scale:2.0, speed:2.8, dmg:32, look:'stalker',  skin:0x4a5048, shirt:0x22261e, weak:'head', weakMul:3,
              abilities:[['cloak','charge'], ['teleport'], ['summon','cleave']] },
  golem:    { name:'IRON GOLEM',     hp:10000, scale:2.5, speed:1.5, dmg:42, look:'golem',    skin:0x6a6a6e, shirt:0x4a4a50, weak:'back', weakMul:3,
              abilities:[['stomp','charge'], ['shards'], ['slam','summon']] },
  captain:  { name:'CAPTAIN BLOAT',  hp:9500,  scale:2.3, speed:1.7, dmg:30, look:'captain',  skin:0x8a9a5a, shirt:0x2a3a5a, weak:'back', weakMul:2.5,
              abilities:[['gas','spit'], ['summon'], ['slam','buff']] },
  titan:    { name:'SAND TITAN',     hp:9800,  scale:2.5, speed:1.6, dmg:40, look:'titan',    skin:0xa89060, shirt:0x8a7048, weak:'head', weakMul:2.5,
              abilities:[['slam','shards'], ['charge'], ['stomp','summon']] },
  frost:    { name:'FROST GIANT',    hp:10000, scale:2.6, speed:1.5, dmg:40, look:'frost',    skin:0x9ab8c8, shirt:0x5a7a9a, weak:'head', weakMul:2.5,
              abilities:[['shards','stomp'], ['charge'], ['slam','summon']] },
  king:     { name:'ZOMBIE KING',    hp:18000, scale:2.6, speed:2.0, dmg:44, look:'king',     skin:0x6a7a50, shirt:0x5a1a2a, weak:'crown', weakMul:3,
              abilities:[['slam','charge','cleave'], ['summon','buff','shards'], ['teleport','gas','meteor']], final:true },
  hollow:   { name:'THE HOLLOW',     hp:16000, scale:2.3, speed:2.4, dmg:38, look:'hollow',   skin:0x1a1a1e, shirt:0x101014, weak:'head', weakMul:3,
              abilities:[['teleport','shards'], ['cloak','summon'], ['meteor','charge']], secret:true },
};

// ---- survival ----------------------------------------------------------
ZD.PERKS = {
  iron:    { name:'Iron Hide',    desc:'Double health',                   price:2500, color:'#e0443a', hex:0xe0443a, icon:'♥' },
  quick:   { name:'Quick Hands',  desc:'Reload 40% faster',               price:3000, color:'#3ad86a', hex:0x3ad86a, icon:'↻' },
  sprinter:{ name:'Sprinter',     desc:'Move 20% faster',                 price:2000, color:'#ffd23a', hex:0xffd23a, icon:'»' },
  pockets: { name:'Deep Pockets', desc:'+50% ammo and 2 more grenades',   price:2000, color:'#c88a4a', hex:0xc88a4a, icon:'▣' },
  brawler: { name:'Brawler',      desc:'Melee hits three times harder',   price:1500, color:'#ff8a3a', hex:0xff8a3a, icon:'✊' },
  steady:  { name:'Steady Aim',   desc:'Tighter spread, +10% crits',      price:2500, color:'#3aa8ff', hex:0x3aa8ff, icon:'◎' },
  cashflow:{ name:'Cash Flow',    desc:'+50% points per kill',            price:3000, color:'#5ad8a0', hex:0x5ad8a0, icon:'$' },
  second:  { name:'Second Wind',  desc:'Faster healing, revive in half the time', price:2000, color:'#ff5ad8', hex:0xff5ad8, icon:'✚' },
};
ZD.PERK_ORDER = ['iron', 'quick', 'sprinter', 'pockets', 'brawler', 'steady', 'cashflow', 'second'];
ZD.POWERUPS = {
  insta:  { name:'INSTA-KILL',    dur:20, color:'#ff4a3a', hex:0xff4a3a, icon:'☠' },
  double: { name:'DOUBLE POINTS', dur:20, color:'#ffd23a', hex:0xffd23a, icon:'×2' },
  ammo:   { name:'MAX AMMO',      dur:0,  color:'#7fe0ff', hex:0x7fe0ff, icon:'▮▮' },
  speed:  { name:'SPEED BOOST',   dur:15, color:'#5be36b', hex:0x5be36b, icon:'»' },
  health: { name:'EXTRA HEALTH',  dur:0,  color:'#ff5ad8', hex:0xff5ad8, icon:'✚' },
  reload: { name:'FAST RELOAD',   dur:20, color:'#3ad8ff', hex:0x3ad8ff, icon:'↻' },
  damage: { name:'DOUBLE DAMAGE', dur:20, color:'#ff8a3a', hex:0xff8a3a, icon:'✦' },
  slow:   { name:'ZOMBIE SLOW',   dur:15, color:'#8ab8ff', hex:0x8ab8ff, icon:'❄' },
  shield: { name:'INVULNERABLE',  dur:10, color:'#ffffff', hex:0xffffff, icon:'◆' },
};
ZD.POWERUP_ORDER = ['insta', 'double', 'ammo', 'speed', 'health', 'reload', 'damage', 'slow', 'shield'];
ZD.SURVIVAL = { startPoints:500, hit:10, kill:60, head:40, melee:70, boxPrice:950, upgradePrice:5000, breakTime:12, dropChance:0.035, dropsPerWave:4,
  doorBase:750, doorStep:250, doorMax:2000, ammoFactor:0.5 };
ZD.KILLSTREAKS = [
  { n:10, id:'supply',   name:'SUPPLY DROP', desc:'Ammo and grenades land next to you' },
  { n:20, id:'airstrike',name:'AIRSTRIKE',   desc:'Bombs hit the biggest crowd' },
  { n:35, id:'gunship',  name:'GUNSHIP',     desc:'15 s of fire from above' },
];

// ---- progression -------------------------------------------------------
ZD.XP = { kill:10, head:5, step:60, mission:300, star:100, wave:40, boss:500, secret:400, note:60 };
ZD.xpNeed = lvl => Math.round(250*Math.pow(lvl, 1.35));
ZD.levelReward = lvl => 200 + 40*lvl;
ZD.ACHIEVEMENTS = [
  { id:'first_blood', name:'First Blood',     desc:'Kill your first zombie',             stat:'kills', n:1,     credits:100 },
  { id:'kills_100',   name:'Exterminator',    desc:'Kill 100 zombies',                   stat:'kills', n:100,   credits:300 },
  { id:'kills_1000',  name:'Body Count',      desc:'Kill 1,000 zombies (Crimson outfit)', stat:'kills', n:1000, credits:1000 },
  { id:'kills_5000',  name:'Legend',          desc:'Kill 5,000 zombies',                 stat:'kills', n:5000,  credits:3000 },
  { id:'heads_100',   name:'Sharpshooter',    desc:'100 headshot kills',                 stat:'heads', n:100,   credits:400 },
  { id:'heads_1000',  name:'Headhunter',      desc:'1,000 headshot kills',               stat:'heads', n:1000,  credits:2000 },
  { id:'melee_100',   name:'Up Close',        desc:'100 melee kills',                    stat:'meleeKills', n:100, credits:500 },
  { id:'boom_200',    name:'Demolition',      desc:'200 explosive kills',                stat:'boomKills', n:200, credits:600 },
  { id:'wave_10',     name:'Survivor',        desc:'Reach wave 10 in Survival',          stat:'bestWave', n:10, credits:500, max:true },
  { id:'wave_20',     name:'Hardened',        desc:'Reach wave 20 in Survival',          stat:'bestWave', n:20, credits:1500, max:true },
  { id:'wave_30',     name:'Unbreakable',     desc:'Reach wave 30 in Survival (Gold path)', stat:'bestWave', n:30, credits:3000, max:true },
  { id:'wave_50',     name:'Endless',         desc:'Reach wave 50 in Survival',          stat:'bestWave', n:50, credits:8000, max:true },
  { id:'boss_1',      name:'Giant Slayer',    desc:'Defeat a boss',                      stat:'bossKills', n:1, credits:500 },
  { id:'boss_10',     name:'Boss Hunter',     desc:'Defeat 10 bosses',                   stat:'bossKills', n:10, credits:2000 },
  { id:'king',        name:'Long Live...',    desc:'Defeat the Zombie King',             stat:'kingKills', n:1, credits:3000 },
  { id:'hollow',      name:'Into the Dark',   desc:'Defeat the secret boss',             stat:'hollowKills', n:1, credits:3000 },
  { id:'secret_1',    name:'Codebreaker',     desc:'Open your first secret room',        stat:'secrets', n:1, credits:800 },
  { id:'secret_all',  name:'Archivist',       desc:'Open the secret room on every map (Gold outfit)', stat:'secrets', n:13, credits:6000 },
  { id:'notes_10',    name:'Reader',          desc:'Find 10 notes from the Watcher',     stat:'notes', n:10, credits:800 },
  { id:'notes_all',   name:'The Whole Story', desc:'Find every note from the Watcher',   stat:'notes', n:26, credits:3000 },
  { id:'missions_5',  name:'On Duty',         desc:'Complete 5 missions',                stat:'missions', n:5, credits:600 },
  { id:'campaign',    name:'Mission Accomplished', desc:'Finish the whole campaign',     stat:'campaignDone', n:1, credits:5000 },
  { id:'stars_30',    name:'Perfectionist',   desc:'Earn 30 mission stars',              stat:'stars', n:30, credits:1500 },
  { id:'revive_25',   name:'No One Left Behind', desc:'Revive teammates 25 times',       stat:'revives', n:25, credits:600 },
  { id:'nades_100',   name:'Pin Puller',      desc:'Throw 100 grenades',                 stat:'grenades', n:100, credits:400 },
  { id:'power_50',    name:'Power Hungry',    desc:'Pick up 50 power-ups',               stat:'powerups', n:50, credits:800 },
  { id:'perks_all',   name:'Fully Loaded',    desc:'Own all 8 perks in one run',         stat:'perksRun', n:8, credits:1500, max:true },
  { id:'legendary',   name:'Jackpot',         desc:'Get a legendary from the mystery box', stat:'boxLegendary', n:1, credits:800 },
  { id:'streak_35',   name:'Gunship Online',  desc:'Reach a 35 kill streak',             stat:'bestStreak', n:35, credits:1000, max:true },
  { id:'golden',      name:'Midas',           desc:'Catch a golden zombie',              stat:'goldenKills', n:1, credits:1000 },
  { id:'maxed',       name:'Gunsmith',        desc:'Fully upgrade a weapon',             stat:'maxedWeapons', n:1, credits:1000 },
  { id:'squad_all',   name:'Full Roster',     desc:'Unlock every character',             stat:'charsOwned', n:7, credits:2000, max:true },
  { id:'level_10',    name:'Veteran',         desc:'Reach level 10',                     stat:'level', n:10, credits:1000, max:true },
  { id:'level_25',    name:'Elite',           desc:'Reach level 25',                     stat:'level', n:25, credits:4000, max:true },
  { id:'daily_10',    name:'Regular',         desc:'Complete 10 daily missions',         stat:'dailies', n:10, credits:1500 },
];
// daily / weekly missions; {n} is filled in, weekly targets are bigger
ZD.CHALLENGES = [
  { id:'kills',  stat:'kills',      text:'Kill {n} zombies',                 d:[150, 250, 400], w:[1500, 2500] },
  { id:'heads',  stat:'heads',      text:'Get {n} headshot kills',           d:[40, 80],        w:[400, 700] },
  { id:'melee',  stat:'meleeKills', text:'Get {n} melee kills',              d:[15, 30],        w:[150, 250] },
  { id:'boom',   stat:'boomKills',  text:'Kill {n} zombies with explosives', d:[20, 40],        w:[200, 350] },
  { id:'mission',stat:'missions',   text:'Complete {n} missions',            d:[1, 2],          w:[8, 12] },
  { id:'stars',  stat:'stars',      text:'Earn {n} mission stars',           d:[3, 5],          w:[18, 25] },
  { id:'wave',   stat:'waveBest',   text:'Reach wave {n} in Survival',       d:[8, 12],         w:[20, 25], max:true },
  { id:'waves',  stat:'waves',      text:'Survive {n} waves in total',       d:[10, 15],        w:[60, 90] },
  { id:'revive', stat:'revives',    text:'Revive teammates {n} times',       d:[3, 6],          w:[25, 40] },
  { id:'power',  stat:'powerups',   text:'Pick up {n} power-ups',            d:[5, 8],          w:[40, 60] },
  { id:'boss',   stat:'bossKills',  text:'Defeat {n} bosses',                d:[1, 2],          w:[6, 10] },
  { id:'nades',  stat:'grenades',   text:'Throw {n} grenades',               d:[10, 20],        w:[80, 120] },
  { id:'ult',    stat:'ults',       text:'Use your ability {n} times',       d:[3, 5],          w:[25, 40] },
  { id:'symbol', stat:'symbols',    text:'Find {n} hidden symbols',          d:[1, 3],          w:[9, 12] },
];
ZD.CHALLENGE_REWARD = { d:[350, 500], w:[2000, 3000], xpD:250, xpW:1500 };

})(window.ZD);

'use strict';
// ===================================================================
// Tower Defense 3D — static data: towers, branches, abilities, enemies,
// bosses, maps, waves, progression, challenges, skins
// ===================================================================
window.TD = window.TD || {};

// ---- towers ----------------------------------------------------------
// Levels 1-2 are straight upgrades; level 3 is a choice between two branches.
// range in cells, dmg per hit (per second for the laser), rate = shots/s.
TD.TOWERS = {
  archer: { name:'Archer', icon:'🏹', cost:50,  upg:[45, 85],
    desc:'Fast arrows. Hits ground and air.', trait:'🎯 Critical shot: a chance to deal ×2.2 damage.',
    range:[3.2,3.6,3.9], dmg:[9,16,24], rate:[1.7,2.0,2.2], air:true, ground:true, proj:'arrow',
    critChance:[0.12,0.14,0.16], critMul:2.2,
    color:0x7fb84a, accent:0xd9c27a,
    branches:[
      { id:'rapid',   name:'Rapid Fire', icon:'⚡', desc:'Twice the arrows.',                          mod:{ rate:2.0, dmg:1.1 } },
      { id:'longbow', name:'Longbow',    icon:'🎯', desc:'Long range, heavy arrows, 35% crit chance.', mod:{ range:1.6, dmg:1.9, rate:0.85, critChance:2.2 } },
    ] },
  cannon: { name:'Cannon', icon:'💣', cost:90,  upg:[70, 125],
    desc:'Slow shells with splash damage. Ground only.', trait:'🔥 Every third shell leaves burning ground.',
    range:[2.7,3.0,3.3], dmg:[34,60,95], rate:[0.55,0.62,0.68], air:false, ground:true, proj:'shell',
    splash:[1.0,1.15,1.3], fireEvery:[3,3,3], fireT:[2.0,2.2,2.4], fireDps:0.16, color:0x5b5f6b, accent:0xff8c42,
    branches:[
      { id:'blast', name:'Big Blast',   icon:'💥', desc:'Huge explosions that stagger enemies.',       mod:{ splash:1.6, dmg:1.45, quake:0.35 } },
      { id:'fire',  name:'Fire Shells', icon:'🔥', desc:'Every shell burns the ground and sets enemies alight.', mod:{ dmg:1.1, burn:true, fireEvery:0.34, fireT:1.5 } },
    ] },
  frost: { name:'Frost', icon:'❄️', cost:80,  upg:[60, 105],
    desc:'Chills enemies, slowing them down. Hits air.', trait:'🧊 Chill builds up with every hit until the enemy freezes solid.',
    range:[2.6,2.9,3.2], dmg:[5,9,13], rate:[1.3,1.5,1.6], air:true, ground:true, proj:'ice',
    slow:[0.38,0.48,0.55], slowT:[1.6,2.0,2.3], stacks:[7,6,6], freezeT:[0.8,1.0,1.1], color:0x7fd4ff, accent:0xdff6ff,
    branches:[
      { id:'chill',  name:'Deep Chill', icon:'❄️', desc:'Slows to a crawl for longer.',        mod:{ slow:1.35, slowT:1.5, dmg:1.2 } },
      { id:'freeze', name:'Freeze',     icon:'🧊', desc:'Freezes solid after only 3 hits.',     mod:{ stacks:0.5, freezeT:1.35, dmg:1.4 } },
    ] },
  tesla: { name:'Tesla', icon:'⚡', cost:140, upg:[110, 190],
    desc:'Lightning that chains between enemies. Hits ghosts.', trait:'↩️ The chain can bounce back to an enemy it already hit.',
    range:[2.7,3.0,3.2], dmg:[22,40,60], rate:[0.9,1.0,1.1], air:true, ground:true, proj:'bolt',
    chain:[2,3,4], chainFall:0.65, returns:[1,1,1], color:0x9b7bff, accent:0x7fffe6,
    branches:[
      { id:'storm',      name:'Storm',      icon:'🌩️', desc:'Chains across the whole crowd, bouncing back 3 times.', mod:{ chain:7, chainFall:1.2, dmg:1.1, returns:3 } },
      { id:'overcharge', name:'Overcharge', icon:'🔋', desc:'One brutal bolt that stuns.',    mod:{ dmg:2.4, chain:1, stun:0.5, returns:0 } },
    ] },
  sniper: { name:'Sniper', icon:'🎯', cost:170, upg:[140, 240],
    desc:'Huge damage at long range. Ignores armor and shields.', trait:'🔭 Long shot: up to +50% damage on far targets.',
    range:[5.2,5.8,6.4], dmg:[82,148,225], rate:[0.33,0.39,0.43], air:true, ground:true, proj:'tracer',
    pierce:true, longShot:0.5, color:0x3f4a5c, accent:0xff4b5c,
    branches:[
      { id:'headshot', name:'Headshot', icon:'💢', desc:'Every third shot is a triple crit.', mod:{ crit:3 } },
      { id:'assassin', name:'Assassin', icon:'💀', desc:'Double damage to bosses and armor.', mod:{ assassin:true, rate:1.2 } },
    ] },
  laser: { name:'Laser', icon:'🔆', cost:210, upg:[170, 280],
    desc:'A beam that burns hotter the longer it stays on one target.', trait:'🔥 Heat up: damage ramps ×2.2 while the beam holds a target.',
    range:[3.4,3.8,4.2], dmg:[21,36,55], rate:[1,1,1], air:true, ground:true, proj:'beam', unlock:8,
    color:0xff7ab8, accent:0xfff0a0,
    branches:[
      { id:'focus', name:'Focus',  icon:'🔥', desc:'Ramps up to ×3.5 damage.',     mod:{ ramp:3.5 } },
      { id:'prism', name:'Prism',  icon:'🌈', desc:'Splits into three beams.',     mod:{ beams:3, dmg:0.72 } },
    ] },
};
// three newer towers: poison, wind and an economy building
Object.assign(TD.TOWERS, {
  venom: { name:'Venom', icon:'☠️', cost:110, upg:[85, 150], unlock:3,
    desc:'Acid globs that poison. Hits ground, air and ghosts.', trait:'☣️ Poison stacks, and jumps to a nearby enemy when its host dies.',
    range:[2.9,3.2,3.5], dmg:[6,10,15], rate:[0.9,1.0,1.1], air:true, ground:true, proj:'venom', stacks:[3,4,5], poisonT:[4,4,4.5],
    color:0x3f7a3a, accent:0x9dff5a,
    branches:[
      { id:'plague',    name:'Plague',    icon:'🦠', desc:'Up to 8 stacks, and poison spreads twice as far.', mod:{ stacks:1.6, spread:2.2 } },
      { id:'corrosion', name:'Corrosion', icon:'🧪', desc:'Poisoned enemies lose 4 armor and take 20% more damage.', mod:{ corrode:true, dmg:1.2 } },
    ] },
  wind: { name:'Wind', icon:'🌀', cost:100, upg:[80, 140], unlock:5,
    desc:'Gusts that shove enemies back down the road. Ground only.', trait:'💨 Every gust pushes enemies back along the road.',
    range:[2.4,2.6,2.8], dmg:[4,7,11], rate:[0.5,0.55,0.6], air:false, ground:true, proj:'gust', push:[0.7,0.85,1.0], gustR:[0.8,0.9,1.0],
    color:0x9fe8e0, accent:0xe8fffb,
    branches:[
      { id:'cyclone', name:'Cyclone',    icon:'🌪️', desc:'Wider gusts that push much further.',          mod:{ push:1.6, gustR:1.5 } },
      { id:'jet',     name:'Jet Stream', icon:'✈️', desc:'Hits flyers too and deals triple damage.', mod:{ air:true, dmg:3.0 } },
    ] },
  bank: { name:'Bank', icon:'🏦', cost:120, upg:[100, 160], unlock:7, max:3,
    desc:'Earns gold after every wave and taxes kills nearby. Max 3.', trait:'💰 Pays out after each wave; enemies killed nearby pay extra.',
    range:[2.5,2.8,3.1], income:[22,38,58], tax:[1,1,2], air:false, ground:false, proj:'none',
    color:0xd8b24a, accent:0xfff0a0,
    branches:[
      { id:'interest', name:'Interest',   icon:'📈', desc:'Also pays 4% of your gold each wave (max 120).', mod:{ interest:0.04, cap:120 } },
      { id:'taxoffice',name:'Tax Office', icon:'🧾', desc:'Kills nearby pay +3 more gold, wider reach.', mod:{ tax:2.5, range:0.8 } },
    ] },
});
// only found in the Alternate Reality
TD.TOWERS.paradox = { name:'Paradox', icon:'⌛', cost:160, upg:[130, 200], mapOnly:'rift',
  desc:'Fires at the enemy furthest back. Every hit echoes again one second later.', trait:'⏳ Each hit repeats itself 1s later and drags the target through time (−30% speed).',
  range:[3.4,3.8,4.2], dmg:[40,70,110], rate:[0.8,0.9,1.0], air:true, ground:true, proj:'paradox', prio:'last',
  color:0x2a4a5a, accent:0x2ef2ff,
  branches:[
    { id:'loop',   name:'Loop',   icon:'🔁', desc:'Every hit echoes twice.',              mod:{ echoes:2 } },
    { id:'stasis', name:'Stasis', icon:'⏸️', desc:'Hits freeze the target in time for 0.6s.', mod:{ stasis:0.6, dmg:1.1 } },
  ] };

// ---- merged towers: two neighbouring level-2+ towers fuse into a hybrid ----
TD.HYBRIDS = {
  cryotesla: { name:'Cryo Tesla', icon:'🥶', parts:['frost','tesla'], desc:'Freezing chain lightning: every arc chills twice.', proj:'bolt',
    range:[3.3,3.3,3.3], dmg:[70,70,70], rate:[1.1,1.1,1.1], chain:[5,5,5], chainFall:0.8, returns:[1,1,1], slow:[0.45,0.45,0.45], slowT:[2,2,2], stacks:[4,4,4], freezeT:[1.2,1.2,1.2], chillHit:2, air:true, ground:true, color:0x7fe8ff, accent:0xbdf3ff },
  hunter:    { name:'Hunter Tower', icon:'🦅', parts:['archer','sniper'], desc:'Long-range piercing shots, 25% crits, marks its prey.', proj:'tracer',
    range:[6,6,6], dmg:[115,115,115], rate:[1.05,1.05,1.05], critChance:[0.25,0.25,0.25], critMul:2.5, longShot:0.4, mark:true, air:true, ground:true, color:0x5a6a3a, accent:0xffb347 },
  inferno:   { name:'Inferno', icon:'🌋', parts:['cannon','laser'], desc:'A scorching beam that leaves fire wherever it burns.', proj:'beam',
    range:[3.8,3.8,3.8], dmg:[62,62,62], rate:[1,1,1], ramp:2.6, fireTrail:true, air:true, ground:true, color:0x5a2a22, accent:0xff6a2a },
  toxcyclone:{ name:'Toxic Cyclone', icon:'🌪️', parts:['venom','wind'], desc:'Poison gales: pushes and poisons everything it hits.', proj:'gust',
    range:[3,3,3], dmg:[18,18,18], rate:[0.8,0.8,0.8], push:[1,1,1], gustR:[1.3,1.3,1.3], stacks:[6,6,6], poisonT:[5,5,5], poisonAll:true, air:false, ground:true, color:0x3f7a3a, accent:0xc8ff7a },
  stormcannon:{ name:'Storm Cannon', icon:'🌩️', parts:['cannon','tesla'], desc:'Shells burst into chain lightning.', proj:'shell',
    range:[3.4,3.4,3.4], dmg:[130,130,130], rate:[0.62,0.62,0.62], splash:[1.4,1.4,1.4], fireEvery:[99,99,99], chainBurst:4, air:false, ground:true, color:0x3a3a6a, accent:0x9ffcff },
  glacier:   { name:'Glacier', icon:'🏔️', parts:['frost','cannon'], desc:'Ice boulders that freeze everything they splash.', proj:'shell',
    range:[3.2,3.2,3.2], dmg:[100,100,100], rate:[0.55,0.55,0.55], splash:[1.5,1.5,1.5], fireEvery:[99,99,99], freezeSplash:1.0, air:false, ground:true, color:0x9fc8e0, accent:0xdff6ff },
  plaguearcher:{ name:'Plague Archer', icon:'🏹', parts:['venom','archer'], desc:'Twin poisoned arrows that crit.', proj:'arrow',
    range:[3.8,3.8,3.8], dmg:[28,28,28], rate:[2.2,2.2,2.2], critChance:[0.15,0.15,0.15], critMul:2.2, volley:2, poisonHit:true, stacks:[5,5,5], poisonT:[4,4,4], air:true, ground:true, color:0x4a6a2a, accent:0x9dff5a },
  cryobeam:  { name:'Cryo Beam', icon:'🔷', parts:['laser','frost'], desc:'A freezing beam: slows, and freezes solid when white-hot.', proj:'beam',
    range:[3.8,3.8,3.8], dmg:[48,48,48], rate:[1,1,1], ramp:2.2, beamSlow:0.5, air:true, ground:true, color:0x4a6a9a, accent:0xbdf3ff },
  mint:      { name:'Royal Mint', icon:'🪙', parts:['bank','sniper'], desc:'A golden rifle: every kill pays +10 gold, plus income each wave.', proj:'tracer',
    range:[5.5,5.5,5.5], dmg:[150,150,150], rate:[0.5,0.5,0.5], income:[30,30,30], goldOnKill:10, pierce:true, air:true, ground:true, color:0xd8b24a, accent:0xfff0a0 },
};
Object.keys(TD.HYBRIDS).forEach(k=>{ const h = TD.HYBRIDS[k]; TD.TOWERS[k] = Object.assign({ cost:0, upg:[0,0], hybrid:true, trait:'🔗 Hybrid: '+h.desc, branches:[] }, h); });
TD.MERGE_FEE = 100;
TD.recipeFor = function(a, b){ for(const k in TD.HYBRIDS){ const p = TD.HYBRIDS[k].parts; if((p[0]===a && p[1]===b) || (p[0]===b && p[1]===a)) return k; } return null; };

// ---- charged ultimates: every attack fills a meter; when full, unleash it ----
TD.ULTS = {
  archer:{ name:'Arrow Rain',   icon:'🌧️', need:30, desc:'Three volleys rain on every enemy in range.' },
  cannon:{ name:'Mega Blast',   icon:'💥', need:12, desc:'A giant explosion on the thickest crowd in range.' },
  frost: { name:'Deep Freeze',  icon:'🧊', need:22, desc:'Freezes every enemy in a wide circle.' },
  tesla: { name:'Thunder Chain',icon:'🌩️', need:14, desc:'A colossal chain lightning across up to 20 enemies.' },
  sniper:{ name:'Headhunter',   icon:'🎯', need:10, desc:'Three shots at the three toughest enemies on the map.' },
  laser: { name:'Death Ray',    icon:'☢️', need:12, desc:'Instantly white-hot, with double damage for 5 seconds.' },
  venom: { name:'Plague Cloud', icon:'☣️', need:15, desc:'Maximum poison on every enemy near the target.' },
  wind:  { name:'Hurricane',    icon:'🌪️', need:10, desc:'Blows every enemy in range 3 tiles back.' },
  bank:  { name:'Jackpot',      icon:'🎰', need:3,  desc:'Pays out 25% of your gold (max 350).' },
  paradox:{ name:'Time Stop',   icon:'⏸️', need:12, desc:'Stops time for every enemy for 3 seconds.' },
};
TD.ultKey = type => TD.TOWERS[type].hybrid ? TD.TOWERS[type].parts[0] : type;

// ---- crystals and the shop: every 5th wave, spend what you earned in battle ----
TD.SHOP_ITEMS = [
  { id:'gold500',  icon:'💰', name:'+500 Gold',      cost:7, desc:'Instant gold.' },
  { id:'life',     icon:'❤️', name:'+1 Life',        cost:1, desc:'Repair the castle.' },
  { id:'fortify',  icon:'🏰', name:'Fortify',        cost:3, desc:'+3 lives.' },
  { id:'dmg20',    icon:'⚡', name:'+20% Damage',    cost:8, desc:'All towers, for the rest of the match.' },
  { id:'range10',  icon:'🎯', name:'+10% Range',     cost:6, desc:'All towers, for the rest of the match.' },
  { id:'frostcore',icon:'❄️', name:'Frost Core',     cost:3, desc:'Frosts slow 15% more and freeze 2 hits sooner.' },
  { id:'coil',     icon:'🔌', name:'Tesla Coil',     cost:3, desc:'+1 chain on every Tesla.' },
  { id:'recharge', icon:'✨', name:'Recharge',       cost:2, desc:'All ability cooldowns reset, ultimates +50% charge.' },
  { id:'elixir',   icon:'🗡️', name:'Hero Elixir',    cost:3, desc:'Hero +40% damage and health.' },
  { id:'bounty',   icon:'🪙', name:'Bounty Contract',cost:4, desc:'Kills pay +15% gold.' },
];
TD.SHOP_EVERY = 5;
TD.CRYSTALS = { start:2, wave:1, perfect:1, boss:3, miniboss:1, perKills:40, secret:2 };

// ---- kill streaks ----
TD.STREAKS = [
  { n:10,  name:'KILLING SPREE', gold:8 },
  { n:25,  name:'RAMPAGE',       gold:20 },
  { n:50,  name:'UNSTOPPABLE',   gold:45, crystals:1 },
  { n:100, name:'MEGA STREAK 🔥', gold:100, crystals:2 },
];
TD.STREAK_WINDOW = 2.2;

// ---- risk & reward: tick it before a wave ----
TD.RISK = { speed:1.5, gold:2, desc:'Next wave: enemies +50% speed, but all gold from it is doubled.' };

// level 4: an Ascension per specialization that changes how the tower behaves.
// Unlocked by tower mastery (use a tower to master it).
TD.ULT_MASTERY = 2;
const U = (name, icon, cost, desc, mod) => ({ name, icon, cost, desc, mod });
TD.TOWERS.archer.ult = [ U('Volley',        '🏹', 150, 'Every shot fires 3 arrows at 3 different enemies.', { volley:3 }),
                         U('Piercer',       '🗡️', 150, 'Arrows ignore armor; +15% crit chance.',          { pierceArmor:true, critBonus:0.15, dmg:1.15 }) ];
TD.TOWERS.cannon.ult = [ U('Cluster Bomb',  '🎆', 220, 'Shells burst into 4 bomblets that explode around the impact.', { cluster:4 }),
                         U('Napalm',        '🔥', 220, 'Fire fields are 60% bigger and burn twice as hot.',         { napalm:true }) ];
TD.TOWERS.frost.ult  = [ U('Blizzard',      '🌨️', 180, 'Every shot also chills every enemy in range.',             { blizzard:true }),
                         U('Shatter',       '💎', 180, 'Frozen enemies take +50% damage from everything.',       { brittle:true }) ];
TD.TOWERS.tesla.ult  = [ U('Thunderstorm',  '⛈️', 300, 'Every 3rd attack calls a sky bolt for triple damage.',   { thunder:3 }),
                         U('Railgun Arc',   '🔋', 300, 'The stunning bolt chains to 3 enemies.',                   { chain:3, returns:1 }) ];
TD.TOWERS.sniper.ult = [ U('Execute',       '☠️', 380, 'Instantly kills normal enemies under 20% health.',       { execute:0.2 }),
                         U('Mark for Death','🎯', 380, 'Marked targets take +30% damage from all towers for 4s.', { mark:true }) ];
TD.TOWERS.laser.ult  = [ U('Meltdown',      '☢️', 420, 'When red-hot, the beam scorches everything near the target.', { meltdown:true }),
                         U('Refractor',     '🔷', 420, 'Five beams instead of three.',                             { beams:5 }) ];
TD.TOWERS.venom.ult  = [ U('Pandemic',      '☣️', 240, 'Poisoned enemies leave a toxic cloud when they die.',     { pandemic:true }),
                         U('Acid Rain',     '🌧️', 240, 'Globs splash poison on every enemy near the target.',     { acidSplash:1.1 }) ];
TD.TOWERS.wind.ult   = [ U('Tornado',       '🌪️', 220, 'Every 4th gust sends a tornado back up the road.',        { tornado:4 }),
                         U('Gale Force',    '💨', 220, 'Blown enemies take +25% damage for 3 seconds.',           { winded:true }) ];
TD.TOWERS.bank.ult   = [ U('Vault',         '🔐', 260, 'Interest rises to 8% (max 300).',                         { interest:2, cap:2.5 }),
                         U('Treasury',      '👑', 260, 'Income ×1.5 and nearby kills pay +5 more.',              { income:1.5, taxAdd:5 }) ];

TD.TOWERS.paradox.ult= [ U('Time Fracture', '💠', 260, 'Echoes hit every enemy near the target.', { fracture:1.0 }),
                         U('Eternity',      '♾️', 260, 'Stasis lasts twice as long and echoes deal double.', { stasis:1.2, echoMul:2 }) ];
TD.TOWER_ORDER = ['archer','cannon','frost','tesla','sniper','laser','venom','wind','bank'];
TD.DEFAULT_LOADOUT = ['archer','cannon','frost','tesla','sniper','laser'];
TD.SELL_RATE = 0.7;

// ---- tower synergies: two different towers within 2 tiles of each other ----
TD.SYNERGIES = [
  { id:'super',   a:'frost',  b:'tesla',  icon:'❄️⚡', name:'Superconductor', color:0x7fe8ff, desc:'Tesla deals +60% to chilled or frozen enemies; Frost fires 15% faster.' },
  { id:'spotter', a:'archer', b:'sniper', icon:'🏹🎯', name:'Spotter',        color:0xffb347, desc:'Archer crits deal ×3; the Sniper gains a 15% chance to crit ×2.' },
  { id:'incend',  a:'cannon', b:'laser',  icon:'💣🔆', name:'Incendiary',     color:0xff5a1a, desc:'Every Cannon shell leaves burning ground; Laser heats up 50% faster.' },
  { id:'thermal', a:'cannon', b:'frost',  icon:'💣❄️', name:'Thermal Shock',  color:0xbdf3ff, desc:'Cannon deals +40% to chilled or frozen enemies; Frost +0.3 range.' },
  { id:'toxic',   a:'venom',  b:'wind',   icon:'☠️🌀', name:'Toxic Gale',     color:0x9dff5a, desc:'Gusts spread one poison stack to every enemy they hit.' },
  { id:'invest',  a:'bank',   b:'sniper', icon:'🏦🎯', name:'Bounty Hunter',  color:0xffd24a, desc:'Sniper kills pay double gold.' },
];
TD.SYN_RANGE = 2;

// ---- tower mastery: kills with a tower type level it up (10 levels) ----
TD.MASTERY = [0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000, 4000];
TD.RARITY = [
  { name:'Common',    color:0xb8c2d0, css:'#b8c2d0', from:0 },
  { name:'Rare',      color:0x4fa8ff, css:'#4fa8ff', from:3 },
  { name:'Epic',      color:0xb07cff, css:'#b07cff', from:6 },
  { name:'Legendary', color:0xffc857, css:'#ffc857', from:9 },
];
TD.masteryOf = function(k){ let l = 0; while(l < 10 && k >= TD.MASTERY[l+1]) l++; return l; };
TD.rarityOf = function(l){ let r = TD.RARITY[0]; for(const x of TD.RARITY) if(l >= x.from) r = x; return r; };

// ---- abilities: three big buttons with cooldowns, unlocked by player level ----
TD.ABILITIES = [
  { id:'meteor',    name:'Meteor',     icon:'☄️', cd:45, unlock:2,  key:'Z', target:true,  desc:'Tap anywhere: a meteor slams down. Hits air and ground.' },
  { id:'freeze',    name:'Freeze',     icon:'🧊', cd:60, unlock:4,  key:'C', target:false, desc:'Every enemy on the island stops for 3 seconds.' },
  { id:'chain',     name:'Mega Chain', icon:'⚡', cd:50, unlock:6,  key:'V', target:false, desc:'Lightning leaps across up to 15 enemies.' },
  { id:'timewarp',  name:'Time Warp',  icon:'⏳', cd:55, unlock:9,  key:'N', target:false, desc:'Time crawls: every enemy moves at 35% speed for 5 seconds.' },
  { id:'overdrive', name:'Overdrive',  icon:'🔥', cd:70, unlock:15, key:'B', target:false, desc:'All towers fire 60% faster for 8 seconds.' },
];

// ---- enemies ---------------------------------------------------------
// hp/speed/gold are wave-1 values; armor is flat damage reduction per hit
TD.ENEMIES = {
  grunt:   { name:'Grunt',     hp:42,  speed:1.35, gold:5,  armor:0, size:0.22, color:0x6cbf4a, from:1,  w:10, pts:1, lives:1 },
  runner:  { name:'Runner',    hp:26,  speed:2.5,  gold:6,  armor:0, size:0.18, color:0xf5d142, from:3,  w:6,  pts:1, lives:1 },
  brute:   { name:'Brute',     hp:190, speed:0.85, gold:15, armor:3, size:0.32, color:0xb5552e, from:5,  w:4,  pts:3, lives:2 },
  flyer:   { name:'Flyer',     hp:60,  speed:1.6,  gold:10, armor:0, size:0.2,  color:0xb07cff, from:7,  w:4,  pts:2, lives:1, air:true },
  shield:  { name:'Shieldman', hp:80,  speed:1.1,  gold:12, armor:1, size:0.24, color:0x4f8fd8, from:8,  w:3,  pts:3, lives:1, shield:110,
             note:'Carries a shield that soaks damage first. Snipers and lightning go straight through.' },
  thief:   { name:'Gold Thief',hp:45,  speed:2.2,  gold:8,  armor:0, size:0.19, color:0xe0a030, from:9,  w:3,  pts:1, lives:0, steal:25,
             note:'Steals 25 gold if it reaches the castle. Drops a bonus when killed.' },
  drummer: { name:'War Drummer', hp:75, speed:1.15, gold:12, armor:1, size:0.24, color:0xff7a3c, from:9,  w:2,  pts:2, lives:1, aura:'haste', auraR:1.7,
             note:'Its drum speeds up every enemy around it by 30%.' },
  knight:  { name:'Knight',    hp:130, speed:1.15, gold:12, armor:7, size:0.24, color:0x9aa7b8, from:10, w:3,  pts:3, lives:1 },
  guardian:{ name:'Guardian',  hp:120, speed:1.0,  gold:15, armor:2, size:0.26, color:0x2ec4b6, from:11, w:2,  pts:3, lives:1, aura:'guard', auraR:1.8,
             note:'Protects nearby enemies: they take 35% less damage. Snipers ignore it.' },
  ghost:   { name:'Ghost',     hp:55,  speed:1.5,  gold:11, armor:0, size:0.21, color:0xcfd8ff, from:12, w:3,  pts:2, lives:1, ghost:true,
             note:'Arrows and shells pass through it. Frost, Tesla, Sniper and Laser can hurt it.' },
  shade:   { name:'Shade',     hp:65,  speed:1.55, gold:12, armor:0, size:0.21, color:0x5a4a8a, from:13, w:3,  pts:2, lives:1, cloak:true,
             note:'Turns invisible every few seconds — towers can\'t aim at it, but splash and abilities still hit.' },
  healer:  { name:'Healer',    hp:85,  speed:1.0,  gold:14, armor:0, size:0.22, color:0x52e07a, from:14, w:2,  pts:3, lives:1, heal:0.1,
             note:'Beams heals into the strongest wounded enemy nearby. Kill it first.' },
  saboteur:{ name:'Saboteur',  hp:100, speed:1.35, gold:16, armor:2, size:0.23, color:0x6a7488, from:16, w:2,  pts:3, lives:1, sabotage:true,
             note:'Leaves the road to reach your most valuable tower and shuts it down for 4 seconds.' },
  blinker: { name:'Blinker',   hp:70,  speed:1.3,  gold:12, armor:0, size:0.21, color:0x39d0ff, from:11, w:2,  pts:2, lives:1, blink:1.6,
             note:'Teleports a short way down the road every few seconds.' },
  splitter:{ name:'Splitter',  hp:120, speed:1.0,  gold:10, armor:1, size:0.27, color:0xd86ac0, from:12, w:2,  pts:3, lives:1, split:3,
             note:'Bursts into three Splitlings when destroyed.' },
  mimic:   { name:'Mimic',     hp:110, speed:1.15, gold:15, armor:1, size:0.23, color:0xa0a0a0, from:15, w:2,  pts:3, lives:1, mimic:true,
             note:'Copies the special ability of a nearby enemy every few seconds.' },
  carrier: { name:'Shield Carrier', hp:140, speed:0.95, gold:16, armor:2, size:0.27, color:0x4a6cff, from:15, w:2, pts:3, lives:1, dome:true, auraR:1.9,
             note:'Throws energy domes over nearby enemies that soak damage. Snipers pierce them.' },
  commander:{ name:'Commander', hp:280, speed:0.9, gold:35, armor:3, size:0.3,  color:0xc8a040, from:18, w:1,  pts:5, lives:2, commander:true, auraR:3.2,
             note:'Every enemy within 3 tiles of it is 25% faster with +3 armor. Take it down first.' },
  stalker: { name:'Night Stalker', hp:75, speed:1.75, gold:13, armor:0, size:0.21, color:0x2a2440, from:6, w:0, pts:2, lives:1, dodge:0.3, night:true,
             note:'Only hunts at night. Dodges 30% of arrows, shells, ice and acid.' },
  mutant:  { name:'Mutant',    hp:95,  speed:1.1,  gold:14, armor:0, size:0.24, color:0x7ad84a, from:13, w:2,  pts:3, lives:1, mutate:true,
             note:'Evolves while it walks: first it gets fast, then it grows heavy armor. Kill it early!' },
  echo:    { name:'Echo',      hp:80,  speed:1.3,  gold:10, armor:0, size:0.22, color:0x9ae6ff, from:1,  w:0,  pts:2, lives:1, echo:true, reality:true,
             note:'Alternate Reality only: returns once as a ghostly echo with half health.' },
  splitling:{ name:'Splitling', hp:22, speed:1.9,  gold:2,  armor:0, size:0.15, color:0xf0a0e0, from:99, w:0,  pts:0, lives:1 },
  swarmling:{ name:'Swarmling', hp:14, speed:1.85, gold:1,  armor:0, size:0.13, color:0xb8e04a, from:99, w:0,  pts:0, lives:1 },
  miniboss:{ name:'Mini Boss', hp:520, speed:0.9,  gold:60, armor:4, size:0.36, color:0xc03060, from:99, w:0,  pts:0, lives:3, mini:true },
  boss:    { name:'Boss',      hp:1200,speed:0.65, gold:150,armor:6, size:0.46, color:0x8f1f2e, from:99, w:0,  pts:0, lives:5 },
};

// bosses get a name per map and three scripted phases
// every boss, once enraged, also hijacks your strongest tower now and then
TD.TAKEOVER = { every:12, time:5, desc:'Takes control of a tower: it stops fighting and zaps your other towers. Tap it to break free!' };
TD.BOSS_PHASES = [
  { at:0.5,  kind:'enrage', text:'ENRAGED — faster!' },
  { at:0.25, kind:'summon', text:'calls for help!' },
  { at:0.1,  kind:'shield', text:'raises a shield!' },
];
// ...plus one signature move per map, used on a cooldown
TD.BOSS_SKILLS = {
  stomp:  { name:'Earthquake Stomp', icon:'🦶', every:8,  desc:'Stuns every tower near it for 2 seconds.' },
  storm:  { name:'Sandstorm',        icon:'🌪️', every:14, desc:'Summons a sandstorm: tower range −25%.' },
  ice:    { name:'Glacial Prison',   icon:'🧊', every:9,  desc:'Freezes your three strongest towers in ice.' },
  lava:   { name:'Lava Rain',        icon:'🌋', every:8,  desc:'Hurls lava at towers, melting them for a while.' },
  portal: { name:'Void Portals',     icon:'🌌', every:7,  desc:'Opens portals, jumps ahead and pulls runners through.' },
  warden: { name:'Warden\'s Wrath',  icon:'⚔️', every:7,  desc:'Cycles stomp, ice prison and portals.' },
  emp:    { name:'Neon Overload',    icon:'📡', every:8,  desc:'EMP blast shuts towers down and cloaks the boss.' },
  rewind: { name:'Rewind',           icon:'⏪', every:9,  desc:'Turns back time: heals itself and every enemy around it.' },
};

// ---- maps ------------------------------------------------------------
// path: cell centres the ground route follows (first = spawn, last = base)
// air: the flight route flyers take instead (straight legs through the island)
TD.MAPS = [
  { id:'valley', name:'Green Valley', theme:'grass', w:14, h:10, waves:30, gold:130, lives:20, diff:1.0,
    path:[[0,1],[4,1],[4,5],[1,5],[1,8],[8,8],[8,3],[11,3],[11,7],[13,7]],
    routes:[ { kind:'secret', path:[[0,1],[4,1],[8,1],[8,3],[11,3],[11,7],[13,7]], text:'🚪 SECRET PATH UNLOCKED! Enemies now take both roads.' },
             { kind:'collapse', from:18, path:[[0,1],[4,1],[4,5],[8,5],[8,3],[11,3],[11,7],[13,7]], text:'🕳️ THE GROUND COLLAPSES — the south loop is gone, enemies take the short way!' } ],
    air:[[0,1],[7,5],[13,7]], boss:'Grove Ogre', bossSkill:'stomp', bossTint:0x3f7a2a, effect:null, effectText:'No hazards — learn the ropes.',
    tip:'Towers near corners cover two lanes at once.' },
  { id:'canyon', name:'Dusty Canyon', theme:'sand', w:14, h:10, waves:30, gold:150, lives:20, diff:1.25,
    path:[[6,0],[6,3],[1,3],[1,7],[5,7],[5,5],[9,5],[9,8],[12,8],[12,1],[13,1]],
    routes:[ { kind:'fork', path:[[6,0],[6,3],[9,3],[9,5],[9,8],[12,8],[12,1],[13,1]], from:6, every:2, text:'🔀 The canyon forks — enemies split between both roads!' },
             { kind:'meteor', path:[[6,0],[6,3],[1,3],[1,7],[5,7],[5,9],[12,9],[12,1],[13,1]], text:'☄️ A meteor smashes a new road through the dunes!' } ],
    air:[[6,0],[7,5],[13,1]], boss:'Sand Colossus', bossSkill:'storm', bossTint:0xc2923e, effect:'sandstorm', effectText:'Sandstorms cut tower range by a quarter.',
    tip:'Sandstorms roll in every so often — Snipers still reach.' },
  { id:'frost', name:'Frostpeak', theme:'snow', w:14, h:10, waves:30, gold:170, lives:20, diff:1.45,
    path:[[0,8],[3,8],[3,2],[6,2],[6,6],[9,6],[9,1],[12,1],[12,5],[10,5],[10,9],[13,9]],
    routes:[ { kind:'choice', group:'frost', from:12, path:[[0,8],[3,8],[3,2],[6,2],[6,8],[10,8],[10,9],[13,9]], name:'Ice Passage', icon:'🧊', perk:'gold', desc:'A long way round through the ice caves. Kills pay +20% gold.', text:'🧊 The Ice Passage cracks open!' },
             { kind:'choice', group:'frost', from:12, path:[[0,8],[3,8],[3,2],[6,2],[6,6],[9,6],[9,9],[10,9],[13,9]], name:'Glacier Chute', icon:'🏔️', perk:'crystal', desc:'A short, fast slide past the glacier. +1 💎 after every wave.', text:'🏔️ The Glacier Chute opens!' } ],
    air:[[0,8],[6,4],[13,9]], boss:'Frost Giant', bossSkill:'ice', bossTint:0x5fb4e8, effect:'ice', effectText:'Icy road: every enemy is 12% faster.',
    tip:'Long road, fast enemies: Frost towers make everything else better.' },
  { id:'volcano', name:'Volcano', theme:'lava', w:14, h:10, waves:30, gold:180, lives:20, diff:1.65,
    path:[[0,4],[3,4],[3,1],[7,1],[7,6],[4,6],[4,8],[10,8],[10,3],[13,3]],
    routes:[ { kind:'reroute', path:[[0,4],[3,4],[3,1],[7,1],[7,6],[10,6],[10,3],[13,3]], from:16, text:'🌋 A lava flow buries the south road — enemies take the short way!' } ],
    air:[[0,4],[7,5],[13,3]], boss:'Magma Lord', bossSkill:'lava', bossTint:0xd8401a, effect:'lava', effectText:'Lava pools on the road erupt and burn whoever stands on them.',
    lava:[[5,1],[7,4],[8,8]],
    tip:'Slow enemies on the lava pools and let the mountain do the work.' },
  { id:'space', name:'Deep Space', theme:'space', w:14, h:10, waves:30, gold:200, lives:20, diff:1.85,
    path:[[7,0],[7,2],[2,2],[2,6],[6,6],[6,4],[11,4],[11,8],[13,8]],
    routes:[ { kind:'secret', path:[[7,0],[7,2],[11,2],[11,4],[11,8],[13,8]], text:'🚪 SECRET PATH UNLOCKED! A wormhole road opens.' },
             { kind:'meteor', path:[[7,0],[7,2],[2,2],[2,6],[2,8],[11,8],[13,8]], text:'☄️ A comet gouges a new road across the crater!' } ],
    air:[[7,0],[6,5],[13,8]], boss:'Void Wraith', bossSkill:'portal', bossTint:0x6a3fd8, airBoss:'Void Leviathan', airWave:20, effect:'lowgrav', effectText:'Low gravity: walkers drift 15% slower, flyers 30% faster and far more common.',
    tip:'The sky is the threat here — Archers, Teslas and Lasers.' },
  // the last campaign region: choose a road, then watch it collapse
  { id:'final', name:'The Final Zone', theme:'core', w:14, h:10, waves:30, gold:230, lives:20, diff:1.78,
    path:[[0,1],[5,1],[5,4],[2,4],[2,8],[7,8],[7,5],[10,5],[10,8],[13,8]],
    routes:[ { kind:'choice', group:'final', from:8, path:[[0,1],[5,1],[11,1],[11,8],[13,8]], name:'North Bridge', icon:'🌉', perk:'gold', desc:'A short bridge over the core. Kills pay +20% gold.', text:'🌉 The North Bridge extends across the core!' },
             { kind:'choice', group:'final', from:8, path:[[0,1],[1,1],[1,9],[12,9],[12,8],[13,8]], name:'Southern Tunnel', icon:'🕳️', perk:'crystal', desc:'A winding tunnel under the rim. +1 💎 after every wave.', text:'🕳️ The Southern Tunnel is breached!' },
             { kind:'collapse', from:16, path:[[0,1],[5,1],[5,4],[2,4],[2,8],[13,8]], text:'🌋 THE CORE CRACKS — the east loop collapses into the abyss!' } ],
    air:[[0,1],[7,5],[13,8]], boss:'The Architect', bossSkill:'nexus', bossTint:0xff3c5a, airBoss:'Storm Leviathan', airWave:20, effect:'core', crystals:[2,1],
    effectText:'Unstable core: an EMP pulse hits a random tower every 30s. Choose a road at wave 8 — and at wave 16 the road collapses.',
    tip:'Everything you have learned, all at once. Build generators early — the core drains power.' },
  // the tiered map: every win raises its tier, and with it health, speed and rewards
  { id:'gauntlet', name:'The Gauntlet', theme:'dusk', w:14, h:10, waves:30, gold:180, lives:20, diff:1.3, tiered:true,
    path:[[0,0],[5,0],[5,3],[1,3],[1,6],[6,6],[6,9],[10,9],[10,2],[13,2]],
    routes:[ { kind:'secret', path:[[0,0],[5,0],[10,0],[10,2],[13,2]], text:'🚪 SECRET PATH UNLOCKED! The Warden\'s back door is open.' } ],
    air:[[0,0],[7,5],[13,2]], boss:'Gauntlet Warden', bossSkill:'warden', bossTint:0x8f1f2e, effect:'gauntlet', effectText:'Every win raises the tier: +30% enemy health, +3% speed and bigger rewards each tier.',
    tip:'Tier up, gear up. The Gauntlet never stays beaten.' },
  // unlocked by player level, not by stars
  { id:'neon', name:'Neon Rift', theme:'neon', w:14, h:10, waves:30, gold:210, lives:20, diff:2.0, needLevel:20,
    path:[[0,5],[3,5],[3,1],[8,1],[8,4],[5,4],[5,8],[11,8],[11,2],[13,2]],
    routes:[ { kind:'fork', path:[[0,5],[5,5],[5,8],[11,8],[11,2],[13,2]], from:5, every:3, text:'🔀 The rift splits the road!' } ],
    air:[[0,5],[7,5],[13,2]], boss:'Prism Titan', bossSkill:'emp', bossTint:0xff3cf0, effect:'surge', crystals:[3,2],
    effectText:'Power surge: crystals everywhere, and every 25s the rift overloads them — double crystal bonus for 6s.',
    tip:'Build Teslas and Frosts next to the crystals — the rift pays them double during surges.' },
  // a world where the rules are different
  { id:'rift', name:'Alternate Reality', theme:'mirror', w:14, h:10, waves:30, gold:230, lives:20, diff:1.75, needLevel:12,
    path:[[0,8],[3,8],[3,1],[7,1],[7,6],[10,6],[10,2],[13,2]],
    air:[[0,8],[7,4],[13,2]], boss:'Paradox Engine', bossSkill:'rewind', bossTint:0x2ef2ff, effect:'reality', crystals:[2,2],
    effectText:'Time loops every 20s (enemies rewind but heal). Towers +25% range, −15% damage. Echoes return from the dead. Only here: the ⌛ Paradox tower.',
    tip:'Nothing works the usual way here. The Paradox tower hits every enemy twice — once now, once in the past.' },
  // secret: only appears on the world map once all three keystones are found
  { id:'caverns', name:'Crystal Caverns', theme:'cavern', w:14, h:10, waves:30, gold:220, lives:20, diff:1.9, secretMap:true,
    path:[[0,5],[3,5],[3,1],[7,1],[7,8],[10,8],[10,2],[13,2]],
    routes:[ { kind:'meteor', path:[[0,5],[3,5],[3,8],[10,8],[10,2],[13,2]], text:'☄️ A falling stalactite opens a shortcut through the cave!' } ],
    air:[[0,5],[7,5],[13,2]], boss:'The Crystal Queen', bossSkill:'ice', bossTint:0x7affc8, airBoss:'Prism Wyrm', airWave:20, effect:'caverns', crystals:[3,3],
    effectText:'Echoing caverns: every cleared wave pays +1 💎 and crystals power towers 50% more. Win here to claim a secret legendary.',
    tip:'The deeper you go, the more it glitters.' },
];
// hidden bosses: clear waves 1-15 without losing a life and one of these wakes up
TD.SECRET_BOSSES = { valley:'The Ancient Oak', canyon:'Sphinx of Sands', frost:'Glacial Titan', volcano:'Ashen Wyrm', space:'The Singularity',
  gauntlet:'The Executioner', neon:'Glitch King', rift:'The Unwritten' };
TD.SECRET_BOSS_WAVE = 15;
TD.tierMul = t => 1 + 0.3*Math.max(0, t-1);          // health multiplier per tier
TD.tierSpeed = t => 1 + 0.03*Math.max(0, t-1);
TD.tierReward = t => 1 + 0.25*Math.max(0, t-1);

TD.THEMES = {
  grass: { ground:'#4f9a3c', ground2:'#5cae46', path:'#b98b52', edge:'#8c6636', rim:'#3c7a2f', side:'#5b3d22',
           tree:0x2f8a3f, trunk:0x6b4427, rock:0x8a8f93, sky:0x9fd0ff, skyTop:0x5fa8ff, skyBot:0xd8f0ff, hemi:0xdfefff, sun:0xfff2d8 },
  sand:  { ground:'#d3b06a', ground2:'#e0c07c', path:'#9c7444', edge:'#7c5a34', rim:'#c39d5b', side:'#7a5a32',
           tree:0x4f9a3c, trunk:0x6b4427, rock:0xb59b78, sky:0xffd9a8, skyTop:0xff9f6a, skyBot:0xfff0d0, hemi:0xfff0d8, sun:0xfff2d8 },
  snow:  { ground:'#e6eef5', ground2:'#f3f7fb', path:'#8d98a6', edge:'#6b7684', rim:'#d3dde6', side:'#4d5a6a',
           tree:0x2f6f4f, trunk:0x4d3a2a, rock:0x9aa5b1, sky:0xcfe3ff, skyTop:0x8fb8f0, skyBot:0xf4f8ff, hemi:0xeaf4ff, sun:0xfff2d8 },
  lava:  { ground:'#3d3234', ground2:'#4a3c3d', path:'#6e4a3c', edge:'#2a1f20', rim:'#33292a', side:'#1e1718',
           tree:0x2b2426, trunk:0x3a2e2c, rock:0x5a4a48, sky:0x3a1a1e, skyTop:0x120608, skyBot:0x8a2a10, rimLight:0xff5a1a, hemi:0xffb090, sun:0xffc9a0, glow:0xff5a1a },
  dusk:  { ground:'#4a3f5c', ground2:'#5a4d70', path:'#8a4a5a', edge:'#5a2a3a', rim:'#3f3550', side:'#2a2238',
           tree:0x6a3f7a, trunk:0x3a2a40, rock:0x7a7088, sky:0x3a2a4a, skyTop:0x1a1030, skyBot:0xa04a50, rimLight:0xff7a5a, hemi:0xd8c8ff, sun:0xffc8a0 },
  space: { ground:'#2b2a4a', ground2:'#35345c', path:'#5a5482', edge:'#1f1d3a', rim:'#26244a', side:'#14122a',
           tree:0x8a6cff, trunk:0x4a3a8a, rock:0x6a6a9a, sky:0x0b0a1e, hemi:0xb0a8ff, sun:0xdcd6ff, stars:true, skyTop:0x1a1440, skyBot:0x000000, rimLight:0x8a6cff },
  mirror:{ ground:'#0d2629', ground2:'#12343a', path:'#dff6f4', edge:'#7fe8ff', rim:'#0a1f22', side:'#081518',
           tree:0xff3cf0, trunk:0x2ef2ff, rock:0x2a4a50, sky:0x1a0a2a, hemi:0xb8fff4, sun:0xffd0f8, stars:true, skyTop:0x3a0a4a, skyBot:0x0a3a3a, rimLight:0xff3cf0, glow:0x2ef2ff },
  neon:  { ground:'#17122e', ground2:'#1f1840', path:'#2a1f55', edge:'#120c28', rim:'#1c1638', side:'#0c0820',
           tree:0x2ef2ff, trunk:0x6a1fb0, rock:0x3a3a6a, sky:0x0a0620, hemi:0xc8b0ff, sun:0xe8d6ff, stars:true, skyTop:0x2a0a4a, skyBot:0x000008, rimLight:0xff3cf0, glow:0x2ef2ff },
};

// ---- waves -----------------------------------------------------------
TD.hpMul   = (n, diff) => (1 + 0.13*(n-1) + 0.016*(n-1)*(n-1)) * (diff||1);
TD.bossMul = (n, diff) => 1 + (TD.hpMul(n, diff)-1)*0.6;   // bosses would be walls on the raw curve
TD.goldMul = n => 1 + 0.01*(n-1);
TD.waveBonus = n => 15 + n*2;
TD.BUILD_TIME = 22;          // seconds between waves before the next one walks in on its own

// deterministic per (map, wave) so a retry sees the same wave
// day and night: waves 6-10, 16-20, 26-30 ... are fought at night
TD.isNight = n => Math.floor((n-1)/5) % 2 === 1;
// every 7th wave (not a boss wave) is a swarm of tiny enemies
TD.isSwarm = n => n >= 7 && n % 7 === 0 && n % 10 !== 0;
// mirror waves march from the castle side towards the portal
TD.isMirror = n => n >= 12 && n % 12 === 0 && n % 10 !== 0;
// smooth day/night: 0 = day, 1 = night; dusk and dawn blend across a wave
TD.nightAt = function(x){ const c = ((x-1) % 10 + 10) % 10; if(c < 4) return 0; if(c < 5) return c-4; if(c < 9) return 1; return 1-(c-9); };
// deterministic per (map, wave) so a retry sees the same wave; roguelike runs pass their own seed
TD.genWave = function(mapIdx, n, seedOff){
  const map = TD.MAPS[mapIdx];
  let seed = (mapIdx+1)*7919 + n*104729 + (seedOff||0)*15485863;
  const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed/0x7fffffff; };
  const night = TD.isNight(n);
  const reality = map.effect==='reality';
  const pool = Object.keys(TD.ENEMIES).map(k=>Object.assign({id:k},TD.ENEMIES[k])).filter(e=>(e.w>0 || (e.night && night) || (e.reality && reality)) && n>=e.from)
    .map(e=>{ if(map.effect==='lowgrav' && e.id==='flyer') e.w *= 2.5; if(map.effect==='surge' && (e.id==='shade'||e.id==='saboteur')) e.w *= 2; if(e.night) e.w = 5; if(e.reality) e.w = 9; if(reality && (e.id==='shade'||e.id==='blinker')) e.w *= 2; return e; });
  let budget = (6 + n*3.0 + Math.floor(n/5)*3) * (map.tiered ? 1 + 0.08*Math.max(0,(map.curTier||1)-1) : 1);
  // survival waves: an endless stream of weak enemies for a fixed time
  if(TD.isSurvival && TD.isSurvival(n)){
    const T = TD.survivalTime(n), out = [], kinds = ['swarmling','grunt','runner','swarmling','grunt','runner'];
    let t = 0.6, i = 0;
    while(t < T){ const gap = Math.max(0.16, 0.5 - (t/T)*0.34); out.push({ type:kinds[i % kinds.length], count:6, gap, pause:0.3, surv:true }); t += 6*gap + 0.3; i++; }
    return out;
  }
  const groups = [];
  if(TD.isSwarm(n)){ groups.push({ type:'swarmling', count: Math.round(22 + n*1.9), gap:0.14, pause:1.2, swarm:true }); budget *= 0.35; }
  let guard = 0;
  while(budget > 0 && guard++ < 20){
    let tw = pool.reduce((a,e)=>a+e.w,0), r = rnd()*tw, pick = pool[0];
    for(const e of pool){ r -= e.w; if(r<=0){ pick=e; break; } }
    const maxCount = Math.max(pick.id==='commander'?1:2, Math.floor(budget/pick.pts));
    const count = pick.id==='commander' ? 1 : Math.min(maxCount, 2 + Math.floor(rnd()*(pick.id==='grunt'||pick.id==='runner'?7:4)));
    groups.push({ type:pick.id, count, gap: pick.id==='runner'?0.45:(pick.pts>=3?1.1:0.7), pause: 1.4 });
    budget -= count*pick.pts;
  }
  // the biggest group goes last so the wave builds up (a swarm always comes first)
  groups.sort((a,b)=>(b.swarm?1:0)-(a.swarm?1:0) || a.count*TD.ENEMIES[a.type].pts - b.count*TD.ENEMIES[b.type].pts);
  // armor types: some groups arrive plated, shielded, fireproof or frost-proof
  for(const gr of groups){ if(gr.swarm) continue; const intr = TD.ENEMIES[gr.type].armorT; if(intr){ gr.armorT = intr; continue; }
    if(n >= 8 && rnd() < Math.min(0.4, 0.1 + n*0.01)) gr.armorT = TD.ARMOR_KEYS[Math.floor(rnd()*TD.ARMOR_KEYS.length)]; }
  // a named mini-boss every 8 waves (5, 13, 21 ...)
  if(TD.isMini(n)) groups.splice(Math.floor(groups.length/2), 0, { type:TD.miniFor(mapIdx, n), count:1, gap:1, pause:1.6 });
  if(n % 10 === 0){ const air = (map.airWave && n === map.airWave) || (n > 30 && n % 30 === 20);
    groups.push({ type: air ? 'airboss' : 'boss', count: air ? 1 : 1 + Math.floor(n/30) + (map.effect==='twin' ? 1 : 0), gap:2.5, pause:2.0 }); }
  return groups;
};
// boss rush: one boss per wave (two from wave 6), with a small escort
TD.genBossWave = function(n){
  const g = [{ type:'grunt', count:5+n*2, gap:0.45, pause:1.2 }];
  if(n >= 2) g.push({ type:'knight', count:2+n, gap:0.7, pause:1.2 });
  if(n >= 4) g.push({ type:'guardian', count:1+Math.floor(n/3), gap:0.9, pause:1.2 });
  g.push({ type:'boss', count: n>=6 ? 2 : 1, gap:6, pause:1 });
  return g;
};
TD.waveLabel = function(groups){
  const c = {};
  groups.forEach(g=>{ c[g.type]=(c[g.type]||0)+g.count; });
  const arm = {}; groups.forEach(g=>{ if(g.armorT) arm[g.type] = TD.ARMOR_TYPES[g.armorT].icon; });
  return Object.keys(c).map(k=>c[k]+' '+TD.ENEMIES[k].name+(c[k]>1&&!TD.ENEMIES[k].mini&&k!=='boss'&&k!=='airboss'&&k!=='commander'?'s':'')+(arm[k]?' '+arm[k]:'')).join(' · ');
};

// ---- progression -----------------------------------------------------
TD.levelCost = n => 120 + n*70;                       // xp to go from level n to n+1
TD.levelOf = function(xp){ let l=1, x=xp; while(x >= TD.levelCost(l) && l<60){ x -= TD.levelCost(l); l++; } return { level:l, into:x, need:TD.levelCost(l) }; };
TD.xpForLevel = function(l){ let s=0; for(let i=1;i<l;i++) s += TD.levelCost(i); return s; };
TD.UNLOCKS = [
  { level:2,  icon:'☄️', text:'Meteor ability' },
  { level:3,  icon:'🛡️', text:'Hero + ☠️ Venom tower' },
  { level:4,  icon:'🧊', text:'Freeze ability + 🃏 Roguelike mode' },
  { level:5,  icon:'🌀', text:'Wind tower' },
  { level:6,  icon:'⚡', text:'Mega Chain ability' },
  { level:7,  icon:'🏦', text:'Bank tower' },
  { level:8,  icon:'🔆', text:'Laser tower + 👑 Boss Rush' },
  { level:9,  icon:'⏳', text:'Time Warp ability' },
  { level:10, icon:'🎨', text:'Neon Archer skin (free)' },
  { level:12, icon:'🌌', text:'+10% starting gold + Alternate Reality map' },
  { level:15, icon:'🔥', text:'Overdrive ability' },
  { level:17, icon:'❤️', text:'+2 starting lives' },
  { level:20, icon:'🌌', text:'New map: Neon Rift' },
  { level:25, icon:'👑', text:'Legendary aura on max-level towers' },
  { level:30, icon:'⭐', text:'Prestige: restart for a permanent bonus' },
];
TD.HERO = { unlock:3, name:'Sir Aegis', hp:220, dmg:22, rate:1.25, range:1.35, speed:2.4, aura:2.2, respawn:12 };
TD.LAST_STAND = { desc:'Once per wave: a shockwave from the castle knocks every enemy back and stuns it.' };
TD.gameXp = function(waves, kills, won, stars){ return Math.round(waves*12 + kills*0.4 + (won?150:0) + stars*40); };
TD.gameCoins = function(waves, won, stars){ return waves + (won ? 30 + stars*10 : 0); };

// ---- weather: rolled for every wave, weighted by map theme ----------------
TD.WEATHER = {
  clear: { name:'Clear', icon:'☀️', desc:'' },
  rain:  { name:'Rain',  icon:'🌧️', desc:'Tesla +25% damage · enemies −5% speed · fires burn out faster' },
  snow:  { name:'Snow',  icon:'🌨️', desc:'Enemies −10% speed · Frost slows last 20% longer' },
  fog:   { name:'Fog',   icon:'🌫️', desc:'Tower range −15% (Sniper −25%)' },
  heat:  { name:'Heatwave', icon:'🔥', desc:'Laser +20% damage · fires burn longer · Frost slows 25% less' },
  storm: { name:'Thunderstorm', icon:'⛈️', desc:'Lightning strikes enemies · Tesla fires 35% faster · flyers −20% speed' },
};
TD.WEATHER_BY_THEME = {
  grass:[['clear',5],['rain',3],['fog',2],['storm',2]], mirror:[['clear',3],['storm',3],['fog',2],['snow',1]], sand:[['clear',5],['heat',4],['fog',1]], snow:[['clear',4],['snow',4],['fog',2]],
  lava:[['clear',5],['heat',4],['fog',1]], space:[['clear',8],['fog',2]], dusk:[['clear',4],['rain',3],['fog',3],['storm',2]], neon:[['clear',5],['rain',3],['fog',2],['storm',2]],
};
TD.rollWeather = function(theme, n, seedOff){
  if(n <= 2) return 'clear';
  let seed = n*92821 + theme.length*131 + (seedOff||0)*7; seed = (seed*1103515245+12345) & 0x7fffffff; seed = (seed*1103515245+12345) & 0x7fffffff;
  const opts = TD.WEATHER_BY_THEME[theme] || [['clear',1]], tot = opts.reduce((a,o)=>a+o[1],0); let r = seed/0x7fffffff*tot;
  for(const [k,w] of opts){ r -= w; if(r <= 0) return k; } return 'clear';
};

// ---- random events between waves ----------------------------------------
TD.EVENTS = [
  { id:'surge',  icon:'⚡', name:'POWER SURGE',  desc:'Teslas fire 50% faster for 30 seconds.', t:30 },
  { id:'rush',   icon:'💰', name:'GOLD RUSH',    desc:'Kills pay +50% gold next wave.', wave:true },
  { id:'supply', icon:'📦', name:'SUPPLY DROP',  desc:'A crate of gold lands on the island.' },
  { id:'moon',   icon:'🩸', name:'BLOOD MOON',   desc:'Next wave: enemies +25% health, but +75% gold.', wave:true },
  { id:'wind',   icon:'🌬️', name:'TAILWIND',     desc:'All towers +15% range next wave.', wave:true },
  { id:'repair', icon:'🛠️', name:'REPAIRS',      desc:'The castle regains 3 lives.' },
  { id:'recharge', icon:'✨', name:'MANA SPRING', desc:'All ability cooldowns are reset.' },
];

// ---- roguelike perks: pick 1 of 3 every 3 waves ----------------------------
TD.PERKS = [
  { id:'tesla_chain', r:0, icon:'⚡', name:'Arc Link',      desc:'Tesla: +1 chain.' },
  { id:'frost_slow',  r:0, icon:'❄️', name:'Permafrost',    desc:'Frost: slow +30%.' },
  { id:'archer_crit', r:0, icon:'🏹', name:'Keen Eye',      desc:'Archer: +10% crit chance.' },
  { id:'cannon_splash', r:0, icon:'💣', name:'Heavy Powder', desc:'Cannon: +25% splash radius.' },
  { id:'sniper_dmg',  r:0, icon:'🎯', name:'Hollow Point',  desc:'Sniper: +25% damage.' },
  { id:'laser_heat',  r:0, icon:'🔆', name:'Overclock',     desc:'Laser: heats up 50% faster.' },
  { id:'venom_stack', r:0, icon:'☠️', name:'Potent Toxin',  desc:'Venom: +2 max poison stacks.' },
  { id:'wind_push',   r:0, icon:'🌀', name:'Strong Gusts',  desc:'Wind: +40% push.' },
  { id:'kill_gold',   r:0, icon:'💰', name:'Bounty',        desc:'Kills give +15% gold.' },
  { id:'gold_now',    r:0, icon:'🪙', name:'War Chest',     desc:'+120 gold right now (more in later waves).' },
  { id:'lives',       r:0, icon:'❤️', name:'Reinforced Gate', desc:'+5 lives.' },
  { id:'cheap',       r:0, icon:'🏷️', name:'Bulk Order',    desc:'Towers and upgrades cost 8% less.' },
  { id:'all_dmg',     r:1, icon:'⚔️', name:'Sharpened',     desc:'All towers +12% damage.' },
  { id:'all_rate',    r:1, icon:'⏩', name:'Drill Sergeant', desc:'All towers +10% fire rate.' },
  { id:'range',       r:1, icon:'🔭', name:'Watchtowers',   desc:'All towers +10% range.' },
  { id:'abil_cd',     r:1, icon:'✨', name:'Arcane Flow',   desc:'Ability cooldowns −30%.' },
  { id:'interest',    r:1, icon:'🏦', name:'Compound Interest', desc:'After each wave gain 5% of your gold (max 150).' },
  { id:'syn_range',   r:1, icon:'🔗', name:'Resonance',     desc:'Synergies reach 1 tile further and are 25% stronger.' },
  { id:'hero_pow',    r:1, icon:'🗡️', name:'Champion',      desc:'Hero +60% damage and +50% health.' },
  { id:'explode',     r:2, icon:'💥', name:'Volatile',      desc:'Enemies explode on death for 15% of their max health.' },
  { id:'double_crit', r:2, icon:'💢', name:'Deadly Precision', desc:'All critical hits deal double damage.' },
  { id:'freeze_all',  r:2, icon:'🧊', name:'Ice Age',       desc:'Every 20s, all enemies freeze for 1.5s.' },
  { id:'lucky',       r:2, icon:'🍀', name:'Lucky Coins',   desc:'Kills have a 12% chance to drop +25 gold.' },
  { id:'second_wind', r:2, icon:'🛡️', name:'Second Wind',   desc:'Last Stand can be used twice per wave.' },
];
TD.PERK_RARITY = [ { name:'Common', css:'#b8c2d0', w:60 }, { name:'Rare', css:'#4fa8ff', w:30 }, { name:'Epic', css:'#b07cff', w:10 } ];

// ---- research: permanent upgrades bought with research points -------------
TD.RESEARCH = [
  { id:'gold',   branch:'Economy', icon:'💰', name:'Deep Pockets', desc:'+5% starting gold',     max:4, cost:1 },
  { id:'bounty', branch:'Economy', icon:'🪙', name:'Bounty',       desc:'+4% gold per kill',     max:3, cost:2 },
  { id:'salvage',branch:'Economy', icon:'♻️', name:'Salvage',      desc:'Sell towers for +4%',   max:3, cost:1 },
  { id:'dmg',    branch:'Offense', icon:'⚔️', name:'Sharpened',    desc:'+3% tower damage',      max:5, cost:2 },
  { id:'crit',   branch:'Offense', icon:'💢', name:'Precision',    desc:'+3% crit chance',       max:3, cost:2 },
  { id:'range',  branch:'Offense', icon:'🔭', name:'Optics',       desc:'+3% tower range',       max:3, cost:3 },
  { id:'lives',  branch:'Defense', icon:'❤️', name:'Fortify',      desc:'+2 starting lives',     max:3, cost:1 },
  { id:'arcana', branch:'Defense', icon:'✨', name:'Arcana',       desc:'−6% ability cooldowns', max:3, cost:2 },
  { id:'hero',   branch:'Defense', icon:'🗡️', name:'Hero Training',desc:'+10% hero damage and health', max:3, cost:2 },
];
TD.researchCost = (node, lvl) => node.cost * (lvl+1);
TD.rpFor = (waves, won, mode) => Math.floor(waves/5) + (won ? 3 : 0) + (won && mode==='hard' ? 2 : 0) + (won && mode==='rogue' ? 2 : 0);

// ---- prestige: from player level 30, restart levels for a permanent bonus ----
TD.PRESTIGE_LEVEL = 30;
TD.PRESTIGE_MAX = 10;

// ---- game modes --------------------------------------------------------
TD.MODES = [
  { id:'normal',    name:'Normal',    icon:'🛡️', desc:'30 waves. Earn up to 3 stars.' },
  { id:'hard',      name:'Hard',      icon:'💀', desc:'Enemies up to +60% health (ramps in over the first 10 waves), +10% speed, 10% less starting gold, no free perk picks. ×1.6 XP & coins. Win for a crown.', hp:1.6, speed:1.1, gold:0.9, reward:1.6 },
  { id:'endless',   name:'Endless',   icon:'♾️', desc:'Waves never stop. How far can you go?' },
  { id:'challenge', name:'Challenge', icon:'🎲', desc:'20 waves with a special rule. First win of each rule pays 100 coins.', waves:20 },
  { id:'rogue',     name:'Roguelike', icon:'🃏', desc:'Every 3 waves pick 1 of 3 random perks. Random waves, a new build every run. ×1.3 rewards.', reward:1.3, unlock:4 },
  { id:'bossrush',  name:'Boss Rush', icon:'👑', desc:'10 boss fights back to back, every boss with its own move. 700 starting gold.', waves:10, unlock:8, gold:700 },
];
TD.CHALLENGE_RULES = [
  { id:'notesla',  icon:'🚫', name:'No Tesla',       desc:'Tesla towers are banned.', ban:['tesla'] },
  { id:'broke',    icon:'🪙', name:'Shoestring',     desc:'Start with only 100 gold.', gold:100 },
  { id:'glass',    icon:'🏚️', name:'Glass Castle',   desc:'Only 5 lives.', lives:5 },
  { id:'nomagic',  icon:'🔕', name:'No Magic',       desc:'Abilities are disabled.', noAbil:true },
  { id:'swarm',    icon:'🐜', name:'Swarm',          desc:'Enemies are 30% faster but 20% weaker.', speed:1.3, hp:0.8 },
  { id:'oldschool',icon:'🏰', name:'Old School',     desc:'Only Archer, Cannon and Frost.', allow:['archer','cannon','frost'] },
  { id:'build4',   icon:'🧩', name:'Build Mode',     desc:'Take only 4 towers from your loadout into the match.', pick:4 },
  { id:'three',    icon:'🎰', name:'Lucky Three',    desc:'Only 3 random tower types from your loadout.', rand:3 },
  { id:'blitz',    icon:'⚡', name:'Blitz',          desc:'Enemies are twice as fast but pay double gold.', speed:2, goldMul:2 },
  { id:'random',   icon:'🎲', name:'Random',         desc:'A surprise rule, rolled when the match starts.', random:true },
];

// ---- challenges: coins + xp, tracked in the save --------------------
TD.CHALLENGES = [
  { id:'archers',  icon:'🏹', name:'Bow Season',    desc:'Clear wave 6 or later with only Archers built', goal:1,   coins:60,  xp:80 },
  { id:'tesla100', icon:'⚡', name:'High Voltage',  desc:'Kill 100 enemies with Tesla towers',            goal:100, coins:80,  xp:100 },
  { id:'flawless', icon:'❤️', name:'Flawless',      desc:'Win a map without losing a single life',        goal:1,   coins:150, xp:200 },
  { id:'rich',     icon:'💰', name:'Banker',        desc:'Finish a wave holding 1000 gold or more',       goal:1,   coins:60,  xp:60 },
  { id:'bosses',   icon:'👑', name:'Giant Slayer',  desc:'Defeat 3 bosses',                              goal:3,   coins:100, xp:120 },
  { id:'alltypes', icon:'🏗️', name:'Architect',     desc:'Build all five basic towers in one game',      goal:1,   coins:60,  xp:60 },
  { id:'wave40',   icon:'♾️', name:'Marathon',      desc:'Reach wave 40 in endless mode',                goal:1,   coins:150, xp:200 },
  { id:'abil10',   icon:'☄️', name:'Spellcaster',   desc:'Use 10 abilities',                             goal:10,  coins:60,  xp:60 },
  { id:'frozen50', icon:'🧊', name:'Cold Snap',     desc:'Freeze 50 enemies solid',                      goal:50,  coins:80,  xp:80 },
  { id:'ghosts',   icon:'👻', name:'Ghostbuster',   desc:'Kill 20 ghosts',                               goal:20,  coins:80,  xp:80 },
  { id:'early10',  icon:'⏩', name:'Impatient',     desc:'Send 10 waves early',                          goal:10,  coins:50,  xp:50 },
  { id:'sell3',    icon:'🏷️', name:'Flip It',       desc:'Sell a level-3 tower',                         goal:1,   coins:40,  xp:40 },
  { id:'hardwin',  icon:'💀', name:'Hardened',      desc:'Win any map on Hard',                          goal:1,   coins:200, xp:250 },
  { id:'crits200', icon:'💢', name:'Sharpshooter',  desc:'Land 200 critical hits',                       goal:200, coins:80,  xp:80 },
  { id:'lumber',   icon:'🪓', name:'Lumberjack',    desc:'Clear 10 trees to make room for towers',       goal:10,  coins:50,  xp:50 },
  { id:'kills1000',icon:'⚔️', name:'Army Breaker',  desc:'Destroy 1000 enemies',                         goal:1000,coins:120, xp:150 },
  { id:'speedboss',icon:'⏱️', name:'Blitzkrieg',    desc:'Defeat a boss within 20 seconds of it appearing', goal:1, coins:120, xp:150 },
  { id:'secrets3', icon:'🔍', name:'Treasure Hunter', desc:'Find 3 secrets on the maps',                 goal:3,   coins:80,  xp:80 },
  { id:'synergy3', icon:'🔗', name:'Synergist',     desc:'Have 3 different synergies active in one game', goal:1,   coins:80,  xp:100 },
  { id:'ultimate', icon:'🌟', name:'Ascended',      desc:'Buy an Ascension (level 4) upgrade',           goal:1,   coins:60,  xp:60 },
  { id:'ultfire',  icon:'⚡', name:'Unleashed',     desc:'Unleash 25 tower ultimates',                   goal:25,  coins:80,  xp:80 },
  { id:'merge',    icon:'🔗', name:'Alchemist',     desc:'Discover 3 hybrid towers by merging',           goal:3,   coins:100, xp:120 },
  { id:'mergeall', icon:'⚗️', name:'Grand Alchemist', desc:'Discover all 9 hybrid towers',               goal:9,   coins:300, xp:300 },
  { id:'streak100',icon:'🔥', name:'Mega Streak',   desc:'Reach a 100 kill streak',                      goal:1,   coins:100, xp:120 },
  { id:'secretpath',icon:'🚪', name:'Pathfinder',   desc:'Unlock a secret path',                         goal:1,   coins:60,  xp:60 },
  { id:'secretboss',icon:'🗿', name:'Secret Slayer', desc:'Defeat a secret boss',                         goal:1,   coins:200, xp:250 },
  { id:'mirror',   icon:'🪞', name:'Looking Glass', desc:'Survive a Mirror Wave without losing a life',   goal:1,   coins:60,  xp:80 },
  { id:'risk10',   icon:'🔴', name:'Daredevil',     desc:'Clear 10 waves with Risk & Reward on',          goal:10,  coins:80,  xp:100 },
  { id:'shop',     icon:'🏪', name:'Big Spender',   desc:'Spend 30 crystals in the shop',                 goal:30,  coins:60,  xp:60 },
  { id:'breakfree',icon:'🔓', name:'Liberator',     desc:'Break a tower free from a boss takeover',       goal:1,   coins:50,  xp:60 },
  { id:'reality',  icon:'🌌', name:'Other Side',    desc:'Win the Alternate Reality',                     goal:1,   coins:200, xp:250 },
  { id:'legend',   icon:'💎', name:'Legendary',     desc:'Reach Legendary mastery with any tower',       goal:1,   coins:200, xp:250 },
  { id:'research5',icon:'🧠', name:'Scholar',       desc:'Buy 5 research upgrades',                      goal:5,   coins:80,  xp:80 },
  { id:'prestige', icon:'⭐', name:'Reborn',        desc:'Prestige once',                                goal:1,   coins:300, xp:0 },
  { id:'roguewin', icon:'🃏', name:'Card Shark',    desc:'Win a Roguelike run',                          goal:1,   coins:150, xp:200 },
  { id:'bossrush', icon:'👑', name:'King Slayer',   desc:'Survive Boss Rush',                            goal:1,   coins:200, xp:250 },
  { id:'night100', icon:'🌙', name:'Night Watch',   desc:'Destroy 100 enemies at night',                 goal:100, coins:60,  xp:60 },
  { id:'swarm',    icon:'🐜', name:'Exterminator',  desc:'Clear a Swarm wave without losing a life',     goal:1,   coins:60,  xp:80 },
  { id:'hero50',   icon:'🗡️', name:'Hero of Legend', desc:'Your hero defeats 50 enemies',               goal:50,  coins:80,  xp:80 },
  { id:'laststand',icon:'🚨', name:'Close Call',    desc:'Use Last Stand with 3 or fewer lives left',    goal:1,   coins:50,  xp:50 },
];

// ---- daily challenges: three a day, same for everyone on that date ------
// ev: the event that feeds it; n: goal options by difficulty
TD.DAILY_POOL = [
  { id:'wave',      icon:'🌊', text:'Reach wave {n}',                          ev:'wave',   n:[10,15,20], max:true },
  { id:'kills',     icon:'⚔️', text:'Defeat {n} enemies',                       ev:'kill',   n:[150,250,400] },
  { id:'k_tesla',   icon:'⚡', text:'Destroy {n} enemies with Tesla towers',    ev:'kill',   n:[40,70,100], tower:'tesla' },
  { id:'k_archer',  icon:'🏹', text:'Destroy {n} enemies with Archers',         ev:'kill',   n:[40,70,100], tower:'archer' },
  { id:'k_cannon',  icon:'💣', text:'Destroy {n} enemies with Cannons',         ev:'kill',   n:[30,60,90],  tower:'cannon' },
  { id:'k_sniper',  icon:'🎯', text:'Destroy {n} enemies with Snipers',         ev:'kill',   n:[20,40,60],  tower:'sniper' },
  { id:'flyers',    icon:'🦇', text:'Shoot down {n} flyers',                    ev:'kill',   n:[15,25,40],  enemy:'flyer' },
  { id:'lives',     icon:'❤️', text:'Clear wave 10 losing no more than 2 lives', ev:'safe10', n:[1,1,1] },
  { id:'boss',      icon:'👑', text:'Defeat {n} boss(es)',                      ev:'boss',   n:[1,1,2] },
  { id:'abil',      icon:'☄️', text:'Use {n} abilities',                        ev:'abil',   n:[4,6,10], level:2 },
  { id:'build',     icon:'🏗️', text:'Build {n} towers',                         ev:'build',  n:[12,20,30] },
  { id:'crits',     icon:'💢', text:'Land {n} critical hits',                   ev:'crit',   n:[25,50,80] },
  { id:'frozen',    icon:'🧊', text:'Freeze {n} enemies solid',                 ev:'frozen', n:[10,20,35] },
  { id:'gold',      icon:'💰', text:'Earn {n} gold in a single game',           ev:'gold',   n:[1200,2000,3000], max:true },
  { id:'spec',      icon:'⭐', text:'Choose {n} tower specializations',         ev:'spec',   n:[2,4,6] },
  { id:'win',       icon:'🏆', text:'Win any map',                              ev:'win',    n:[1,1,1] },
];
TD.DAILY_REWARD = [ { coins:30, xp:40 }, { coins:45, xp:60 }, { coins:70, xp:90 } ];
TD.DAILY_BONUS = { coins:60, xp:80 };

// ---- seasons: a new one every month, each with its own goals, reward track, twist and records ----
TD.SEASON_THEMES = [
  { name:'Frostfall',    icon:'❄️', color:'#7fd4ff', mod:'frost',  modText:'Snow falls twice as often; Frost towers slow 10% more.',  skin:{ tower:'frost',  name:'Frostfall Frost',  color:0xdff6ff, accent:0x39b0ff, trim:0xffffff } },
  { name:'Ember Rising', icon:'🔥', color:'#ff7a3c', mod:'ember',  modText:'Fire fields burn 30% longer; Cannons +10% damage.',     skin:{ tower:'cannon', name:'Ember Cannon',     color:0x2a1410, accent:0xff4a1a, trim:0xffb347 } },
  { name:'Neon Nights',  icon:'🌃', color:'#ff3cf0', mod:'neon',   modText:'Every night wave pays +1 crystal; Lasers +10% range.',   skin:{ tower:'laser',  name:'Neon Nights Laser',color:0x1a0a3a, accent:0xff3cf0, trim:0x2ef2ff } },
  { name:'Harvest Moon', icon:'🌕', color:'#ffc857', mod:'harvest',modText:'+15% gold from kills at night.',                          skin:{ tower:'bank',   name:'Harvest Bank',     color:0xc8903a, accent:0xffe27a, trim:0xff8c42 } },
  { name:'Storm Season', icon:'⛈️', color:'#9ffcff', mod:'storm',  modText:'Thunderstorms are common; Teslas +10% damage.',          skin:{ tower:'tesla',  name:'Stormcaller Tesla',color:0x2a3a5a, accent:0x9ffcff, trim:0xffffff } },
  { name:'Bloom',        icon:'🌸', color:'#ff9ad8', mod:'bloom',  modText:'+2 starting lives; Venom poison lasts 1s longer.',        skin:{ tower:'venom',  name:'Bloom Venom',      color:0x7a3a6a, accent:0xff9ad8, trim:0xffd0f0 } },
];
TD.SEASON_BASE = 2026*12 + 8;     // September 2026 is season 1
TD.seasonNow = function(d){ d = d || new Date(); const idx = d.getFullYear()*12 + d.getMonth() - TD.SEASON_BASE + 1; const th = TD.SEASON_THEMES[((idx-1) % TD.SEASON_THEMES.length + TD.SEASON_THEMES.length) % TD.SEASON_THEMES.length];
  const end = new Date(d.getFullYear(), d.getMonth()+1, 1); return { id:idx, theme:th, name:'Season '+idx+': '+th.name, ends:end }; };
TD.SEASON_TIERS = 10; TD.SEASON_TIER_XP = 400;
TD.SEASON_REWARDS = [ {coins:40}, {coins:40}, {crystalsStart:1, coins:30}, {coins:60}, {skin:true}, {coins:80}, {coins:80}, {coins:100}, {coins:120}, {title:true, coins:200} ];
TD.SEASON_POOL = [
  { id:'waves',  icon:'🌊', text:'Clear {n} waves',                 n:60,  ev:'wave1' },
  { id:'bosses', icon:'👑', text:'Defeat {n} bosses',               n:4,   ev:'boss' },
  { id:'wins',   icon:'🏆', text:'Win {n} maps',                    n:3,   ev:'win' },
  { id:'ults',   icon:'⚡', text:'Unleash {n} tower ultimates',     n:30,  ev:'ult' },
  { id:'merge',  icon:'🔗', text:'Merge {n} hybrid towers',         n:3,   ev:'merge' },
  { id:'streak', icon:'🔥', text:'Reach a {n} kill streak',         n:50,  ev:'streak', max:true },
  { id:'kills',  icon:'⚔️', text:'Defeat {n} enemies',              n:1500,ev:'kill' },
  { id:'risk',   icon:'🔴', text:'Clear {n} Risk waves',            n:8,   ev:'risk' },
  { id:'shop',   icon:'🏪', text:'Buy {n} shop items',              n:6,   ev:'shop' },
  { id:'night',  icon:'🌙', text:'Destroy {n} enemies at night',    n:500, ev:'night' },
  { id:'endless',icon:'♾️', text:'Reach wave {n} in Endless',       n:35,  ev:'endless', max:true },
  { id:'rogue',  icon:'🃏', text:'Win {n} Roguelike run',           n:1,   ev:'roguewin' },
];
TD.SEASON_GOAL_REWARD = { coins:60, sxp:250 };

// ---- titles shown next to your name ----
TD.TITLES = [
  { id:'commander',  name:'Commander',        how:'Default' },
  { id:'veteran',    name:'Veteran',          how:'Reach player level 10', check:s=>TD.levelOf(s.xp).level>=10 || s.prestige>0 },
  { id:'kingslayer', name:'King Slayer',      how:'Survive Boss Rush',     ach:'bossrush' },
  { id:'cardshark',  name:'Card Shark',       how:'Win a Roguelike run',   ach:'roguewin' },
  { id:'alchemist',  name:'Alchemist',        how:'Discover 3 hybrids',    ach:'merge' },
  { id:'secret',     name:'Secret Slayer',    how:'Defeat a secret boss',  ach:'secretboss' },
  { id:'reborn',     name:'Reborn',           how:'Prestige once',         ach:'prestige' },
  { id:'traveler',   name:'Reality Traveler', how:'Win the Alternate Reality', ach:'reality' },
  { id:'streaker',   name:'Unstoppable',      how:'Reach a 100 kill streak',   ach:'streak100' },
];
// mastery rewards: level 5 = a skin, level 7 = a sparkle aura, level 10 = a title
TD.MASTERY_REWARDS = { skin:5, aura:7, title:10 };

// ---- skins: cosmetic only --------------------------------------------
TD.SKINS = [
  { id:'neon_archer',  tower:'archer', name:'Neon Archer',   icon:'💠', cost:0, level:10, color:0x1a1a3a, accent:0x2ef2ff, trim:0xff3cf0 },
  { id:'gold_archer',  tower:'archer', name:'Golden Archer', icon:'👑', cost:120, color:0xffd24a, accent:0xfff2b0, trim:0xffe27a },
  { id:'neon_tesla',   tower:'tesla',  name:'Neon Tesla',    icon:'🌈', cost:150, color:0x2ef2ff, accent:0xff3cf0, trim:0x7fffe6 },
  { id:'lava_cannon',  tower:'cannon', name:'Lava Cannon',   icon:'🌋', cost:150, color:0x3a2422, accent:0xff5a1a, trim:0xff8c42 },
  { id:'ice_frost',    tower:'frost',  name:'Ice Frost',     icon:'🧊', cost:120, color:0xffffff, accent:0x7fd4ff, trim:0xbdf3ff },
  { id:'cyber_sniper', tower:'sniper', name:'Cyber Sniper',  icon:'🤖', cost:180, color:0x1f2a3a, accent:0x39ff88, trim:0x39ff88 },
  { id:'royal_laser',  tower:'laser',  name:'Royal Laser',   icon:'💜', cost:200, color:0x6a1fb0, accent:0xffd24a, trim:0xffd24a },
  { id:'ancient_tesla',tower:'tesla',  name:'Ancient Tesla', icon:'🗿', cost:0, secret:true, color:0x3a3430, accent:0x7affc8, trim:0x7affc8 },
];
// mastery skins, one per tower
[['archer',0x2a4a1a,0xa0ff5a],['cannon',0x2a2a30,0xffd24a],['frost',0x1a3a5a,0xffffff],['tesla',0x1a1a2a,0xffe14b],['sniper',0x3a0a14,0xff3c5a],
 ['laser',0x0a2a2a,0x7affc8],['venom',0x2a0a3a,0xd07aff],['wind',0xe8fffb,0x4fa8ff],['bank',0x1a1a1a,0xffc857]].forEach(([k,c,a])=>{
  TD.SKINS.push({ id:'m_'+k, tower:k, name:'Master '+TD.TOWERS[k].name, icon:'🎖️', cost:0, mastery:TD.MASTERY_REWARDS.skin, color:c, accent:a, trim:a });
  TD.TITLES.push({ id:'gm_'+k, name:TD.TOWERS[k].name+' Grandmaster', how:TD.TOWERS[k].name+' mastery 10', mastery:k });
});

// ===================================================================
// v6 — base building, energy, enemy evolution, armor, tower combos,
// mini-bosses, survival waves, infection, air bosses, legendaries,
// robot helper, tech tree, world-map campaign and a secret system
// ===================================================================

// ---- energy: strong towers draw power; generators and the castle core supply it ----
TD.ENERGY = { base:12, floor:0.5 };
Object.entries({ archer:0, cannon:1, frost:1, tesla:2, sniper:2, laser:3, venom:1, wind:1, bank:0, paradox:3 }).forEach(([k,v])=>{ TD.TOWERS[k].energy = v; });
Object.keys(TD.HYBRIDS).forEach(k=>{ TD.TOWERS[k].energy = k==='mint' ? 2 : 4; });
TD.energyOf = function(type, level){ const d = TD.TOWERS[type], e = d.energy||0; if(!e) return 0; return e + (level>=3 && !d.hybrid && !d.legendary ? 1 : 0) + (level>=4 ? 1 : 0); };

// ---- structures: built between waves only ----
TD.TOWERS.generator = { name:'Generator', icon:'🔋', cost:100, upg:[80, 120], struct:true, max:4, energy:0,
  desc:'Produces energy for your towers.', trait:'⚡ Powers your towers. When they need more energy than you make, they fire slower.',
  power:[8,12,18], range:[1.5,1.5,1.5], proj:'none', air:false, ground:false, color:0x34404e, accent:0x7fffe6,
  branches:[ { id:'plant', name:'Power Plant', icon:'🏭', desc:'+50% energy output.', mod:{ power:1.5 } },
             { id:'relay', name:'Overcharger', icon:'⚡', desc:'Towers on the 8 tiles around it fire 20% faster.', mod:{ overcharge:0.2 } } ] };
TD.TOWERS.barricade = { name:'Barricade', icon:'🧱', cost:60, upg:[70, 110], struct:true, onPath:true, max:3, energy:0, unlock:2,
  desc:'A wall across the road. Enemies must smash through it.', trait:'🧱 Blocks the road until it breaks. Repair it between waves. Level 2+ has spikes.',
  hp:[220, 420, 760], thorns:[0, 12, 30], range:[0.6,0.6,0.6], proj:'none', air:false, ground:false, color:0x8a6a4a, accent:0xffc857, branches:[] };
TD.TOWERS.warp = { name:'Warp Gate', icon:'🌀', cost:120, upg:[90, 140], struct:true, onPath:true, max:2, energy:1, unlock:5,
  desc:'A portal on the road that throws enemies back.', trait:'🌀 Every few seconds the next enemy to cross it is warped back down the road. While you own one, moving towers is free.',
  cd:[7, 5.5, 4], back:[3.5, 4.5, 6], range:[0.6,0.6,0.6], proj:'none', air:false, ground:false, color:0x2a1f55, accent:0xb07cff, branches:[] };
TD.STRUCTS = ['generator','barricade','warp'];
TD.RELOCATE_COST = 40;
// the castle itself can be built up between waves
TD.BASE_UPGRADES = [
  { id:'walls', icon:'🧱', name:'Stone Walls',   desc:'+3 lives (and +3 max) per level.',                         cost:[150, 250, 400] },
  { id:'gate',  icon:'🚪', name:'Iron Gate',     desc:'The gate stops the first enemies that reach the castle each wave (1 / 2 / 3).', cost:[180, 280, 420] },
  { id:'guns',  icon:'💥', name:'Castle Cannon', desc:'A cannon on the keep shells enemies near the castle.',     cost:[200, 320, 480] },
  { id:'core',  icon:'🔆', name:'Power Core',    desc:'+6 energy per level.',                                     cost:[120, 180, 260] },
];

// ---- legendary towers: rare, one per match, paid with crystals, unlocked with Aether Cores ----
Object.assign(TD.TOWERS, {
  solar: { name:'Solar Obelisk', icon:'☀️', legendary:true, cost:0, cry:6, upg:[0,0], cores:12, energy:4,
    desc:'Calls an orbital sun strike on the toughest enemy in range.', trait:'☀️ A sun strike every 6s that scorches the ground. Kills near it speed up the next strike.',
    range:[5,5,5], dmg:[380,380,380], rate:[0.17,0.17,0.17], proj:'sun', air:true, ground:true, color:0xe8c070, accent:0xffe27a, branches:[] },
  voidcore: { name:'Void Singularity', icon:'🕳️', legendary:true, cost:0, cry:7, upg:[0,0], cores:18, energy:4,
    desc:'Opens a black hole on the road that drags enemies in and crushes them.', trait:'🕳️ Every 9s: a black hole for 3s. Enemies are pulled to its core and lose 5% health per second.',
    range:[4,4,4], dmg:[0.05,0.05,0.05], rate:[0.11,0.11,0.11], proj:'void', air:true, ground:true, color:0x1a0a2a, accent:0xb04cff, branches:[] },
  dragon: { name:'Dragon Roost', icon:'🐉', legendary:true, cost:0, cry:8, upg:[0,0], cores:25, energy:4,
    desc:'A dragon circles its roost and breathes fire on everything below.', trait:'🐉 Fire breath hits a whole cluster and sets it ablaze. The dragon flies — it hits air too.',
    range:[3.6,3.6,3.6], dmg:[34,34,34], rate:[4,4,4], proj:'dragon', air:true, ground:true, color:0x7a2a1a, accent:0xff7a2a, branches:[] },
  aether: { name:'Aether Prism', icon:'💠', legendary:true, secret:true, cost:0, cry:6, upg:[0,0], cores:0, energy:4,
    desc:'Five beams of pure element: ice, fire, poison, lightning and void.', trait:'💠 Each beam hits a different enemy with a random element: chill, burn, poison, stun or a death mark.',
    range:[4.2,4.2,4.2], dmg:[60,60,60], rate:[1.2,1.2,1.2], proj:'prism', air:true, ground:true, color:0x2a3a4a, accent:0x7affc8, branches:[] },
});
TD.LEGENDS = ['solar','voidcore','dragon','aether'];
TD.LEGEND_UNLOCK_LEVEL = 10;
TD.AETHER_HOW = 'Discover all 7 tower combos — or conquer a map that is on no map.';

// ---- damage types, armor types and enemy evolution ----
TD.DTYPE = { phys:'phys', bolt:'energy', beam:'energy', ice:'ice', fire:'fire', poison:'poison' };
// some towers deal a different type than their projectile suggests
Object.entries({ cannon:'blast', stormcannon:'blast', glacier:'ice', inferno:'fire', cryobeam:'ice', toxcyclone:'poison', plaguearcher:'poison', dragon:'fire' }).forEach(([k,v])=>{ TD.TOWERS[k].dtype = v; });
TD.DTYPE_INFO = { phys:{ icon:'🗡️', name:'Physical', color:'#ffe6a0' }, blast:{ icon:'💥', name:'Explosive', color:'#ffb347' }, energy:{ icon:'⚡', name:'Energy', color:'#9ffcff' }, ice:{ icon:'❄️', name:'Ice', color:'#bdf3ff' }, fire:{ icon:'🔥', name:'Fire', color:'#ff8c42' }, poison:{ icon:'☠️', name:'Poison', color:'#9dff5a' } };
TD.ARMOR_TYPES = {
  plate:     { name:'Plated',        icon:'🛡️', color:0xb8c2d0, desc:'Physical armor: −40% from arrows, shells, gusts and the hero. Snipers pierce it; lightning, fire and ice ignore it.' },
  eshield:   { name:'Energy Shield', icon:'🔵', color:0x4ad8ff, desc:'A shield worth 60% of its health. Lightning and lasers break it twice as fast, everything else half as fast.' },
  fireproof: { name:'Fireproof',     icon:'🔥', color:0xff7a2a, desc:'Fire and burning deal 75% less, and it never catches fire.' },
  frostproof:{ name:'Frost-proof',   icon:'❄️', color:0x9fe8ff, desc:'Cannot be slowed or frozen.' },
};
TD.ARMOR_KEYS = Object.keys(TD.ARMOR_TYPES);
TD.ENEMIES.knight.armorT = 'plate';
// enemies adapt to whatever kills them most: one damage type doing most of the work gets resisted
TD.ADAPT = { from:6, share:0.55, step:0.1, max:3, window:3 };

// ---- tower combos: status chains between towers ----
TD.COMBOS = [
  { id:'circuit',   icon:'❄️⚡',  name:'Frozen Circuit',  known:true, hint:'❄️ + ⚡', desc:'Tesla hits a frozen or chilled enemy: +50% damage and the enemy becomes CHARGED.' },
  { id:'shatter',   icon:'❄️⚡💣', name:'Shatter Blast',   known:true, hint:'❄️ → ⚡ → 💣', desc:'A Cannon shell hits a CHARGED enemy: ×2.5 damage and an ice-shard explosion. The TRIPLE COMBO!' },
  { id:'icepick',   icon:'❄️🎯',  name:'Ice Pick',        hint:'❄️ + 🎯', desc:'A Sniper shot on a frozen enemy is a guaranteed ×3 critical hit.' },
  { id:'steam',     icon:'🔆❄️',  name:'Steam Burst',     hint:'🔆 + ❄️', desc:'A Laser on a frozen enemy boils the ice: a burst of +150% damage around it.' },
  { id:'firestorm', icon:'🌀🔥',  name:'Firestorm',       hint:'🌀 + 🔥', desc:'A gust hits a burning enemy: the fire spreads to everything the gust touches.' },
  { id:'toxicblast',icon:'☠️💣',  name:'Toxic Detonation',hint:'☠️ + 💣', desc:'A shell hits an enemy with 3+ poison stacks: the poison bursts over everything nearby.' },
  { id:'overload',  icon:'⚡🔵',  name:'Overload',        hint:'⚡ + 🔵', desc:'Lightning on an energy shield overloads it: the shield explodes and stuns everything close by.' },
];

// ---- new enemies: infection, scouts, named mini-bosses and air bosses ----
Object.assign(TD.ENEMIES, {
  infector: { name:'Infector', hp:90, speed:1.05, gold:14, armor:0, size:0.25, color:0x5a8a22, from:14, w:2, pts:3, lives:1, infect:3.5,
              note:'Infects a nearby enemy every few seconds: +50% health, faster, immune to poison. Bursts into spores when it dies.' },
  scout:    { name:'Scout', hp:50, speed:2.1, gold:9, armor:0, size:0.19, color:0x3ad8a0, from:10, w:2, pts:2, lives:1, smart:true, scout:true,
              note:'Smart: takes the least-defended road. While a Scout lives, every new enemy does the same.' },
  juggernaut:{ name:'Juggernaut', hp:620, speed:0.78, gold:60, armor:5, size:0.37, color:0x6a7080, from:99, w:0, pts:0, lives:3, mini:true, armorT:'plate', charge:true,
              note:'Mini-boss. Plated, can\'t be knocked back, and charges forward every few seconds.' },
  broodmother:{ name:'Brood Mother', hp:540, speed:0.72, gold:60, armor:2, size:0.39, color:0xa8d03a, from:99, w:0, pts:0, lives:3, mini:true, brood:true,
              note:'Mini-boss. Hatches three Swarmlings every 4 seconds.' },
  phantom:  { name:'Phantom Lord', hp:480, speed:0.95, gold:60, armor:0, size:0.35, color:0x6a4ab8, from:99, w:0, pts:0, lives:3, mini:true, armorT:'eshield', phase:true,
              note:'Mini-boss. Energy-shielded; blinks ahead and turns invisible.' },
  warlock:  { name:'Plague Warlock', hp:520, speed:0.82, gold:60, armor:2, size:0.35, color:0x3a6a2a, from:99, w:0, pts:0, lives:3, mini:true, infect:2.2, heal:0.08,
              note:'Mini-boss. Infects enemies twice as fast as an Infector and heals the strongest.' },
  skywarden:{ name:'Sky Warden', hp:470, speed:0.95, gold:60, armor:2, size:0.35, color:0x7aa8ff, from:99, w:0, pts:0, lives:3, mini:true, air:true, bomber:true,
              note:'Flying mini-boss. Bombs the towers it passes over.' },
  frostgolem:{ name:'Frost Golem', hp:600, speed:0.74, gold:60, armor:3, size:0.38, color:0x8fc8e8, from:99, w:0, pts:0, lives:3, mini:true, armorT:'frostproof', icer:true,
              note:'Mini-boss. Frost-proof, and freezes the nearest tower in ice every 7 seconds.' },
  airboss:  { name:'Air Boss', hp:1000, speed:0.5, gold:180, armor:4, size:0.5, color:0x3a6aa8, from:99, w:0, pts:0, lives:6, air:true, roadFlyer:true, windShield:0.5,
              note:'A giant flyer behind a Wind Shield (−50% damage). Ground it: chill it with ❄️ Frost and hit it with ⚡ lightning or a 🌀 gust within 3 seconds. Grounded, it takes +50% damage and even Cannons can hit it.' },
});
TD.isMini = n => n >= 5 && n % 8 === 5 && n % 10 !== 0;
TD.isSurvival = n => n >= 9 && n % 9 === 0 && n % 10 !== 0;
TD.survivalTime = n => Math.round(28 + Math.min(22, n*0.6));
TD.MINI_ORDER = ['juggernaut','broodmother','phantom','warlock','skywarden','frostgolem'];
TD.miniFor = (mapIdx, n) => TD.MINI_ORDER[(Math.floor(n/8) + mapIdx) % TD.MINI_ORDER.length];
TD.AIR = { comboWindow:3, groundT:5, autoGround:0.12, cooldown:3 };
Object.assign(TD.BOSS_SKILLS, {
  nexus: { name:'Core Overload', icon:'☢️', every:7, desc:'Cycles lava rain, EMP blasts and void portals.' },
  dive:  { name:'Dive Bomb',     icon:'💣', every:8, desc:'Swoops over your towers and bombs them. Ground it with ❄️ + ⚡ or 🌀!' },
});

// ---- random events (added to the pool) ----
TD.EVENTS.push(
  { id:'meteorpath', icon:'☄️', name:'METEOR STRIKE', desc:'A meteor tears open a new road — or leaves a crater full of crystals.' },
  { id:'estorm',     icon:'🔋', name:'ENERGY STORM',  desc:'Next wave: +10 energy and Teslas +25% damage.', wave:true },
  { id:'eclipse',    icon:'🌑', name:'ECLIPSE',       desc:'Next wave is fought in darkness: Night Stalkers join, but kills pay +50% gold.', wave:true },
  { id:'merchant',   icon:'🏪', name:'RARE MERCHANT', desc:'A merchant shows up with rare goods — spend your crystals now.' },
);

// ---- the robot helper ----
TD.ROBOT = { unlock:6, name:'Bolt-9', icon:'🤖', max:5, cost:[0, 150, 300, 500, 800],
  dmg:[8, 11, 15, 20, 26], rate:[1.6, 1.8, 2.0, 2.2, 2.5], speed:[2.6, 3.0, 3.4, 3.8, 4.3], magnet:[0.8, 1.0, 1.2, 1.4, 1.7], range:2.6, drop:0.12, pickT:10 };

// ---- rare resource: Aether Cores 🔮 (kept between matches) ----
TD.CORES = { mini:1, boss:1, airboss:2, secretBoss:3, combo:1, region:3, keystone:2, mapCh:1, crater:1 };

// ---- tech tree: Attack → Defense → Economy → Abilities (5 tiers each) ----
TD.RESEARCH = [
  { id:'dmg',       branch:'Attack',    tier:0, icon:'⚔️', name:'Sharpened',       desc:'+3% tower damage',                     max:5, cost:2 },
  { id:'crit',      branch:'Attack',    tier:1, icon:'💢', name:'Precision',       desc:'+3% crit chance',                      max:3, cost:2 },
  { id:'range',     branch:'Attack',    tier:2, icon:'🔭', name:'Optics',          desc:'+3% tower range',                      max:3, cost:3 },
  { id:'breaker',   branch:'Attack',    tier:3, icon:'🔨', name:'Armor Breaker',   desc:'+8% damage to armored enemies, enemies adapt 25% less', max:3, cost:3 },
  { id:'overclock', branch:'Attack',    tier:4, icon:'🌟', name:'Overcharge Protocol', desc:'Tower ultimates charge 25% faster', max:1, cost:6, cores:3 },
  { id:'lives',     branch:'Defense',   tier:0, icon:'❤️', name:'Fortify',         desc:'+2 starting lives',                    max:3, cost:1 },
  { id:'masonry',   branch:'Defense',   tier:1, icon:'🧱', name:'Masonry',         desc:'+30% barricade health',                max:3, cost:2 },
  { id:'hero',      branch:'Defense',   tier:2, icon:'🗡️', name:'Hero Training',   desc:'+10% hero damage and health',          max:3, cost:2 },
  { id:'guns',      branch:'Defense',   tier:3, icon:'🏰', name:'Castle Guns',     desc:'Castle cannon +25% damage; level 2 starts every match with a free cannon', max:2, cost:3 },
  { id:'aegis',     branch:'Defense',   tier:4, icon:'🛡️', name:'Aegis',           desc:'Last Stand can be used twice per wave', max:1, cost:6, cores:4 },
  { id:'gold',      branch:'Economy',   tier:0, icon:'💰', name:'Deep Pockets',    desc:'+5% starting gold',                    max:4, cost:1 },
  { id:'bounty',    branch:'Economy',   tier:1, icon:'🪙', name:'Bounty',          desc:'+4% gold per kill',                    max:3, cost:2 },
  { id:'salvage',   branch:'Economy',   tier:2, icon:'♻️', name:'Salvage',         desc:'Sell towers for +4%',                  max:3, cost:1 },
  { id:'power',     branch:'Economy',   tier:3, icon:'🔋', name:'Power Grid',      desc:'+3 base energy',                       max:3, cost:2 },
  { id:'mine',      branch:'Economy',   tier:4, icon:'💎', name:'Crystal Mine',    desc:'Start every match with +2 crystals',   max:1, cost:6, cores:3 },
  { id:'arcana',    branch:'Abilities', tier:0, icon:'✨', name:'Arcana',          desc:'−6% ability cooldowns',                max:3, cost:2 },
  { id:'meteorcore',branch:'Abilities', tier:1, icon:'☄️', name:'Meteor Core',     desc:'+20% ability damage',                  max:3, cost:2 },
  { id:'robotics',  branch:'Abilities', tier:2, icon:'🤖', name:'Robotics',        desc:'Robot +20% damage and speed',          max:3, cost:2 },
  { id:'combo',     branch:'Abilities', tier:3, icon:'🎯', name:'Combo Theory',    desc:'+15% combo damage',                    max:3, cost:3 },
  { id:'timelord',  branch:'Abilities', tier:4, icon:'⏳', name:'Time Lord',        desc:'−15% ability cooldowns, Time Warp +2s', max:1, cost:6, cores:4 },
];
TD.RESEARCH_BRANCHES = [ { id:'Attack', icon:'⚔️', color:'#ff7a5a' }, { id:'Defense', icon:'🛡️', color:'#7fd4ff' }, { id:'Economy', icon:'💰', color:'#ffc857' }, { id:'Abilities', icon:'✨', color:'#b07cff' } ];

// ---- world map campaign ----
TD.CAMPAIGN = [
  { map:'valley',  region:'Green Valley', icon:'🌿', x:11, y:64, color:'#5cae46' },
  { map:'canyon',  region:'Desert',       icon:'🏜️', x:27, y:44, color:'#e0b060' },
  { map:'frost',   region:'Frostpeak',    icon:'🏔️', x:44, y:20, color:'#bfe4ff' },
  { map:'volcano', region:'Volcano',      icon:'🌋', x:58, y:54, color:'#ff6a2a' },
  { map:'space',   region:'Space',        icon:'🌌', x:74, y:22, color:'#9a7aff' },
  { map:'final',   region:'Final Zone',   icon:'☢️', x:89, y:58, color:'#ff3c5a' },
];
TD.CAMPAIGN_SIDE = [ { map:'gauntlet', icon:'⚔️', x:25, y:88 }, { map:'rift', icon:'🌀', x:49, y:86 }, { map:'neon', icon:'🌃', x:73, y:86 } ];
TD.CAMPAIGN_SECRET = { map:'caverns', icon:'💎', x:88, y:13 };
TD.KEYSTONE_MAPS = ['canyon','volcano','final'];

// ---- map challenges: four rules per map, each first win pays an Aether Core ----
TD.CHALLENGE_RULES.push(
  { id:'trio', icon:'3️⃣', name:'Trio',  desc:'Only 3 towers at a time (structures don\'t count).', maxTowers:3 },
  { id:'rush', icon:'💨', name:'Rush',  desc:'Enemies are 50% faster.', speed:1.5 },
);
TD.MAP_CHALLENGES = ['trio','rush','nomagic','broke'];

// ---- unlocks & achievements ----
TD.UNLOCKS.push({ level:2, icon:'🧱', text:'Barricades' }, { level:5, icon:'🌀', text:'Warp Gates' }, { level:6, icon:'🤖', text:'Robot helper Bolt-9' }, { level:10, icon:'🌟', text:'Legendary Vault' });
TD.UNLOCKS.sort((a,b)=>a.level-b.level);
TD.CHALLENGES.push(
  { id:'combo3',   icon:'🎯', name:'Combo Artist',   desc:'Discover 3 tower combos',                     goal:3,  coins:80,  xp:100 },
  { id:'comboall', icon:'🧪', name:'Combo Master',   desc:'Discover all 7 tower combos',                 goal:7,  coins:250, xp:300 },
  { id:'triple',   icon:'💥', name:'Triple Threat',  desc:'Land 10 Shatter Blasts (❄️ → ⚡ → 💣)',      goal:10, coins:80,  xp:100 },
  { id:'survive',  icon:'💀', name:'Survivor',       desc:'Clear a Survival wave without losing a life',  goal:1,  coins:60,  xp:80 },
  { id:'minis',    icon:'👹', name:'Mini Slayer',    desc:'Defeat 10 mini-bosses',                       goal:10, coins:100, xp:120 },
  { id:'airboss',  icon:'🚁', name:'Sky Breaker',    desc:'Defeat an air boss',                          goal:1,  coins:150, xp:200 },
  { id:'grounded', icon:'⬇️', name:'Grounded!',      desc:'Ground air bosses 5 times',                   goal:5,  coins:60,  xp:80 },
  { id:'wall',     icon:'🧱', name:'Hold the Line',  desc:'A barricade survives a whole wave while under attack', goal:1, coins:50, xp:60 },
  { id:'campaign', icon:'🗺️', name:'World Conqueror',desc:'Clear all six campaign regions',              goal:6,  coins:300, xp:300 },
  { id:'keys',     icon:'🗝️', name:'Keeper of Keys', desc:'Find all 3 ancient keystones',                goal:3,  coins:150, xp:200 },
  { id:'legend1',  icon:'🌟', name:'Living Legend',  desc:'Build a legendary tower',                     goal:1,  coins:100, xp:120 },
  { id:'adapt',    icon:'🧬', name:'Moving Target',  desc:'Beat a wave of enemies that evolved to level 3', goal:1, coins:80, xp:100 },
  { id:'robot100', icon:'🤖', name:'Scrap Collector',desc:'Your robot collects 100 pickups',             goal:100,coins:60,  xp:80 },
  { id:'mapch',    icon:'🏅', name:'Map Master',     desc:'Complete 8 map challenges',                   goal:8,  coins:150, xp:200 },
  { id:'power',    icon:'🔋', name:'Power Grid',     desc:'Run 40 energy in one match',                  goal:1,  coins:60,  xp:60 },
);
TD.TITLES.push(
  { id:'conqueror', name:'World Conqueror', how:'Clear every campaign region', ach:'campaign' },
  { id:'combomaster', name:'Combo Master', how:'Discover all 7 combos', ach:'comboall' },
  { id:'keeper', name:'Keeper of Keys', how:'Find all 3 keystones', ach:'keys' },
);

// ---- new themes ----
Object.assign(TD.THEMES, {
  core:  { ground:'#1e1016', ground2:'#28141e', path:'#3a1c2a', edge:'#ff3c5a', rim:'#1a0c12', side:'#0c0608',
           tree:0xff3c5a, trunk:0x5a1a2a, rock:0x4a3440, sky:0x14040a, skyTop:0x200010, skyBot:0x3a0a18, stars:true, rimLight:0xff3c5a, hemi:0xffc0d0, sun:0xffd8e0, glow:0xff3c5a },
  cavern:{ ground:'#1c2233', ground2:'#232a40', path:'#3a3350', edge:'#7affc8', rim:'#1a1f2e', side:'#0e1220',
           tree:0x7affc8, trunk:0xb07cff, rock:0x3a4058, sky:0x05060e, skyTop:0x0a0c1e, skyBot:0x1a1030, stars:true, rimLight:0x7affc8, hemi:0xb8c8ff, sun:0xd8e0ff, glow:0x7affc8 },
});
Object.assign(TD.WEATHER_BY_THEME, { core:[['clear',5],['storm',3],['fog',2]], cavern:[['clear',6],['fog',3],['snow',1]] });
TD.SECRET_BOSSES.final = 'The First Architect'; TD.SECRET_BOSSES.caverns = 'The Hollow King';
TD.INFUSE_COST = 3;

// ===================================================================
// v7 — the enemy army evolves: ranks every 10 waves, enemy levels,
// veteran / elite / mutated variants and four-stage bosses
// ===================================================================
TD.RANKS = [
  { from:1,  roman:'I',   icon:'🪖', name:'Recruits', color:'#b8c2d0', badge:'#2a3242', desc:'Enemies grow a little tougher with every wave.' },
  { from:11, roman:'II',  icon:'⚔️', name:'Veterans', color:'#6ab8ff', badge:'#1f4f8a', desc:'Runners leave speed trails, Brutes wear plate armor, Flyers dash forward.' },
  { from:21, roman:'III', icon:'⭐', name:'Elites',   color:'#ffc857', badge:'#8a6410', desc:'Elite enemies join: double health, faster, each with a special power.' },
  { from:31, roman:'IV',  icon:'☣️', name:'Mutants',  color:'#9dff5a', badge:'#2f6a14', desc:'Mutated enemies: huge health — they split, sprint and heal in packs.' },
  { from:41, roman:'V',   icon:'💀', name:'Apex',     color:'#ff5a7a', badge:'#7a1428', desc:'Elite mutants. From here on the army never stops evolving.' },
];
TD.rankIdx = n => { let i = 0; TD.RANKS.forEach((r,k)=>{ if(n >= r.from) i = k; }); return i; };
// enemy level: the wave number (Boss Rush and Gauntlet tiers push it higher)
TD.enemyLevel = (n, mode, tier) => mode==='bossrush' ? n*3 : n + (tier ? (tier-1)*3 : 0);
// on top of the health curve: speed creeps up, and every 15 levels +1 armor
TD.LEVEL = { speed:0.002, speedCap:1.12, armorEvery:15 };
TD.VETERAN = {
  runner:{ tag:'Enhanced', speed:1.3, trail:true, note:'+30% speed, and leaves a trail that speeds up the enemies behind it.' },
  brute: { tag:'Armored', armor:3, plateLook:true, note:'+3 armor: every hit loses 3 damage — fast, weak attacks barely scratch it.' },
  flyer: { tag:'Elite', hp:1.4, speed:1.15, dash:true, note:'Tougher and faster — it dashes forward every few seconds.' },
  grunt: { tag:'Veteran', hp:1.1, note:'A little tougher than a recruit.' },
};
TD.ELITE = { hp:2, speed:1.15, gold:2.5, armor:2, lives:1, chance: n => Math.min(0.3, 0.1 + (n-21)*0.015),
  powers:{ knight:'Energy shield — when it breaks, the knight flies into a rage (+50% speed).', healer:'Heals twice as hard, two allies at a time.',
    guardian:'Its guard aura reaches 50% further.', drummer:'Its war drum reaches 50% further.', default:'Double health, faster and armored.' } };
TD.MUTATED = { gold:3, lives:1, chance: n => Math.min(0.28, 0.1 + (n-31)*0.012),
  types:{ grunt:{ hp:4, split:2, note:'4× health — splits in two when it dies.' }, runner:{ hp:3, sprint:1.8, note:'3× health — sprints when it nears the castle.' },
    healer:{ hp:2, multiheal:3, note:'Heals three allies at once.' } },
  other:{ hp:2.5, split:2, note:'2.5× health — splits in two when it dies.' } };
TD.NO_RANK = ['swarmling','splitling','echo','boss','airboss'];
// bosses fight in four stages
TD.BOSS_STAGES = [
  { at:0.75, stage:2, kind:'enrage', icon:'🔥', name:'ENRAGED',    text:'is ENRAGED — faster, armored, and calls its guard!' },
  { at:0.5,  stage:3, kind:'emp',    icon:'⚡', name:'OVERLOAD',   text:'OVERLOADS — an EMP knocks out towers and drains their ultimates!' },
  { at:0.25, stage:4, kind:'final',  icon:'💀', name:'FINAL FORM', text:'transforms into its FINAL FORM!' },
];
TD.BOSS_PHASES = TD.BOSS_STAGES;   // older code paths read this name
TD.ROMAN = ['I','II','III','IV','V','VI'];
TD.CHALLENGES.push(
  { id:'elite25',  icon:'⭐', name:'Elite Hunter',   desc:'Defeat 25 elite enemies',                     goal:25, coins:80,  xp:100 },
  { id:'mutated',  icon:'☣️', name:'Purifier',       desc:'Defeat 25 mutated enemies',                   goal:25, coins:100, xp:120 },
  { id:'finalform',icon:'💀', name:'Beyond the Final Form', desc:'Defeat a boss in its final form',     goal:1,  coins:100, xp:150 },
  { id:'rank5',    icon:'🏅', name:'Apex Predator',  desc:'Survive until the enemy reaches Rank V (wave 41)', goal:1, coins:200, xp:250 },
);

// ===================================================================
// v8 — a big bestiary, boss traits, duo & mega bosses, tower battle
// levels and perks, master ultimates, new modes, mutators, Twin Keeps
// ===================================================================
Object.assign(TD.ENEMIES, {
  dasher:      { name:'Dasher',       hp:55,  speed:1.35, gold:9,  armor:0, size:0.2,  color:0xff9a3c, from:6,  w:3, pts:2, lives:1, dashes:true,
                 note:'Bursts forward in a dash every few seconds.' },
  burrower:    { name:'Burrower',     hp:110, speed:1.05, gold:14, armor:2, size:0.25, color:0x8a6a3a, from:9,  w:2, pts:4, lives:1, burrow:true,
                 note:'Digs underground — towers can\'t target it — and bursts out further down the road.' },
  regenerator: { name:'Regenerator',  hp:140, speed:0.95, gold:15, armor:1, size:0.26, color:0x3aaa7a, from:10, w:2, pts:4, lives:1, regen:0.04,
                 note:'Regrows 4% health per second. Burning or poison stops it.' },
  blazer:      { name:'Blazer',       hp:95,  speed:1.2,  gold:13, armor:0, size:0.23, color:0xff5a1a, from:11, w:2, pts:3, lives:1, armorT:'fireproof', fireTrail:true,
                 note:'Fireproof. Its burning trail makes the enemies behind it fireproof and 10% faster.' },
  bulwark:     { name:'Bulwark',      hp:560, speed:0.45, gold:30, armor:5, size:0.36, color:0x7a6a5a, from:12, w:1, pts:9, lives:2, kbImm:true,
                 note:'A walking wall: very slow, enormous health, can\'t be pushed back.' },
  volatile:    { name:'Volatile',     hp:80,  speed:1.3,  gold:11, armor:0, size:0.23, color:0xffd24a, from:12, w:2, pts:3, lives:1, deathBlast:1.4,
                 note:'Explodes when it dies — towers within 1.4 tiles are stunned for 1.2 seconds.' },
  frostbringer:{ name:'Frostbringer', hp:120, speed:1.0,  gold:15, armor:1, size:0.25, color:0x8fd8ff, from:13, w:2, pts:4, lives:1, armorT:'frostproof', chillTowers:2.2,
                 note:'Frost-proof. Towers within 2 tiles of it attack 30% slower.' },
  magnet:      { name:'Magnetron',    hp:150, speed:0.95, gold:18, armor:4, size:0.27, color:0x5a6a9a, from:14, w:1, pts:4, lives:1, magnet:1.6,
                 note:'Pulls in arrows, ice shards and acid globs aimed at enemies near it. Snipers and lightning ignore the pull.' },
  jammer:      { name:'Jammer',       hp:100, speed:1.1,  gold:15, armor:1, size:0.24, color:0x3a3a4a, from:15, w:2, pts:3, lives:1, jam:2.4,
                 note:'EMP field: towers within 2.4 tiles can\'t charge or unleash their ultimates.' },
  possessed:   { name:'Possessed',    hp:85,  speed:1.2,  gold:12, armor:0, size:0.23, color:0x6a3a8a, from:16, w:2, pts:3, lives:1, possess:true,
                 note:'When it dies its spirit rises for 6 seconds — arrows, cannonballs and wind pass right through it.' },
  mirrorimp:   { name:'Mirror Imp',   hp:90,  speed:1.25, gold:12, armor:0, size:0.22, color:0xdff6ff, from:17, w:2, pts:4, lives:1, clone:true,
                 note:'At half health it splits off a perfect copy of itself.' },
  summoner:    { name:'Summoner',     hp:110, speed:0.9,  gold:18, armor:1, size:0.25, color:0x5a2a6a, from:18, w:1, pts:5, lives:1, summon:6,
                 note:'Raises two skeletons every 6 seconds (up to six) until it is stopped.' },
  plaguebearer:{ name:'Plaguebearer', hp:115, speed:1.0,  gold:14, armor:1, size:0.25, color:0x6a8a2a, from:19, w:2, pts:4, lives:1, miasma:true,
                 note:'Leaves toxic clouds on the road: towers next to a cloud deal 25% less damage.' },
  skeleton:    { name:'Skeleton',     hp:26,  speed:1.5,  gold:1,  armor:0, size:0.17, color:0xe8e0c8, from:99, w:0, pts:0, lives:1 },
  megaboss:    { name:'Mega Boss',    hp:3200,speed:0.42, gold:600,armor:10,size:0.46, color:0x3a0a1a, from:99, w:0, pts:0, lives:15 },
});
TD.NO_RANK.push('skeleton', 'megaboss');
// short notes for the basic enemies (bestiary + first-sighting banners)
Object.assign(TD.ENEMIES.grunt,  { note:'The basic foot soldier — cheap, steady, everywhere.' });
Object.assign(TD.ENEMIES.runner, { note:'Fast but fragile. Slows and splash damage keep it in check.' });
Object.assign(TD.ENEMIES.brute,  { note:'Slow and heavy, with 3 armor: every hit loses 3 damage.' });
Object.assign(TD.ENEMIES.flyer,  { note:'Flies straight over the island — only towers that can hit air reach it.' });
Object.assign(TD.ENEMIES.knight, { note:'Heavily armored (7): weak rapid hits barely scratch it — use snipers, cannons, poison or lightning.' });
Object.assign(TD.ENEMIES.splitling, { note:'A fragment of a Splitter. Small, quick, weak.' });
Object.assign(TD.ENEMIES.swarmling, { note:'Tiny and countless — swarm waves are made of them. Splash damage shines.' });
Object.assign(TD.ENEMIES.skeleton,  { note:'Raised by a Summoner. Weak, but it keeps coming until the Summoner falls.' });
TD.ENEMIES.megaboss.note = 'The Mega Boss: a titan with four traits.';
TD.BESTIARY_SKIP = ['miniboss','boss','airboss','megaboss'];
// elites roll one random affix on top of their other powers
TD.ELITE_AFFIXES = [
  { id:'regen',    icon:'🦎', name:'Regenerating', desc:'Regrows 3% health per second.' },
  { id:'volatile', icon:'💥', name:'Volatile',     desc:'Explodes on death and stuns nearby towers.' },
  { id:'swift',    icon:'💨', name:'Swift',        desc:'Dashes forward every few seconds.' },
  { id:'warded',   icon:'🔵', name:'Warded',       desc:'Carries an energy shield.' },
  { id:'vampiric', icon:'🩸', name:'Vampiric',     desc:'Heals 20% whenever an enemy dies close to it.' },
  { id:'blink',    icon:'🌀', name:'Blinking',     desc:'Teleports a short way down the road.' },
];
// adaptation now also sends counter-armor against the damage you rely on
TD.ARMOR_TYPES.insulated = { name:'Insulated', icon:'🧤', color:0xd8b24a, desc:'Rubber-coated against Teslas: −40% from lightning and lasers. Everything else hits it normally.' };
TD.ADAPT_COUNTER = { phys:'plate', blast:'plate', energy:'insulated', ice:'frostproof', fire:'fireproof' };

// ---- bosses: shared mechanics + two traits per boss ----
TD.BOSS_UNIVERSAL = { rage:0.3, weakEvery:12, weakT:3, weakMul:1.6, finalAt:0.06 };
TD.BOSS_TRAITS = {
  armor:  { icon:'🛡️', name:'Armor Plating', desc:'Starts behind armor plates worth 30% of its health — break them first.' },
  heal:   { icon:'💚', name:'Second Wind',   desc:'Once, at 30% health, it heals 15% back.' },
  clone:  { icon:'👥', name:'Clone',         desc:'At 60% health it splits off a copy with a third of its health.' },
  summon: { icon:'📯', name:'Warband',       desc:'Calls in its warband every 12 seconds.' },
  meteor: { icon:'☄️', name:'Meteor Storm',  desc:'Red circles mark two of your towers — a moment later meteors melt them for 2 seconds.' },
  freeze: { icon:'🧊', name:'Frost Breath',  desc:'Blue circles mark two towers — then it freezes them solid for 2.5 seconds.' },
  siege:  { icon:'🎯', name:'Siege',         desc:'Hurls a boulder at a tower near it: stunned for a moment and half its ultimate charge is lost.' },
  roam:   { icon:'🔀', name:'Pathfinder',    desc:'Now and then it switches to a nearby road — or blinks a short way ahead.' },
  bulwark:{ icon:'🔰', name:'Great Shield',  desc:'At 50% it raises a huge shield worth 25% of its health.' },
};
TD.BOSS_TRAIT_BY_MAP = { valley:['summon','heal'], canyon:['armor','meteor'], frost:['freeze','bulwark'], volcano:['meteor','heal'], space:['clone','roam'],
  final:['siege','clone'], gauntlet:['armor','siege'], neon:['clone','roam'], rift:['heal','clone'], caverns:['bulwark','freeze'], twin:['summon','bulwark'] };
TD.AIRBOSS_TRAITS = ['siege'];
TD.MEGA = { from:40, every:20, traits:['summon','siege','bulwark','meteor'], name:'Colossus of Ruin' };
TD.BOSS_STAGES[1].text = 'TRANSFORMS and OVERLOADS — an EMP knocks out towers and drains their ultimates!';

// ---- towers: battle levels during a match, random perks, master ultimates ----
TD.VETERANCY = { xp:[0, 6, 16, 32, 56, 90], dmg:0.05, perkAt:[3,5] };
TD.TOWER_PERKS = [
  { id:'slayer',    icon:'⭐', name:'Elite Slayer', desc:'+25% damage against elites, mini-bosses and bosses.' },
  { id:'frenzy',    icon:'⚡', name:'Boss Frenzy',  desc:'+30% attack speed for 10s after a boss or mini-boss falls.' },
  { id:'deepfreeze',icon:'❄️', name:'Deep Freeze',  desc:'8% chance per hit to freeze the target solid.' },
  { id:'eagle',     icon:'🔭', name:'Eagle Eye',    desc:'+12% range.' },
  { id:'rapid',     icon:'⏩', name:'Rapid Fire',   desc:'+12% attack speed.' },
  { id:'brutal',    icon:'💢', name:'Brutal',       desc:'10% chance to deal triple damage.' },
  { id:'bounty',    icon:'💰', name:'Bounty',       desc:'Kills by this tower pay +3 gold.' },
  { id:'shredder',  icon:'🔨', name:'Shredder',     desc:'Every hit ignores 5 armor.' },
];
TD.MASTER_ULTS = { archer:'Storm of Arrows', cannon:'Armageddon', frost:'Absolute Zero', tesla:'CHAIN STORM', sniper:'Deadeye', laser:'Solar Lance',
  venom:'Plague Tide', wind:'Cyclone Fury', bank:'Golden Rain', paradox:'Frozen Time' };

// ---- new modes and challenge rules ----
TD.MODES.push(
  { id:'timeattack', name:'Time Attack', icon:'⏱️', desc:'Clear 20 waves before the clock runs out (15 minutes). Send waves early! ×1.4 rewards.', waves:20, clock:900, reward:1.4, unlock:6 },
  { id:'nightmare',  name:'Nightmare',   icon:'😈', desc:'+80% health, faster enemies, elites from wave 11, mutants from wave 21, an extra boss at waves 10 and 20, and a Mega Boss at wave 30. ×2.5 rewards.', hp:1.8, speed:1.12, gold:0.9, reward:2.5, unlock:20, rankShift:10 },
);
TD.CHALLENGE_RULES.push(
  { id:'mono',      icon:'1️⃣', name:'One Tower',   desc:'Only the first tower of your loadout.', pick:1 },
  { id:'noupgrade', icon:'⛔', name:'No Upgrades', desc:'Towers can\'t be upgraded (structures can). Crystal infusions still work.', noUpgrade:true },
  { id:'hardcore',  icon:'💀', name:'Hardcore',    desc:'One life. One mistake and it\'s over.', lives:1 },
  { id:'chaos',     icon:'🌪️', name:'Chaos',       desc:'Six random towers and a random enemy army.', chaos:true },
);
// ---- mutators: pick modifiers before a match, the harder the better the reward ----
TD.MUTATORS = [
  { id:'tough',   icon:'🔥', name:'Tough',          desc:'Enemies +50% health',               reward:0.3 },
  { id:'fast',    icon:'💨', name:'Fast',           desc:'Enemies +30% speed',                reward:0.3 },
  { id:'pricey',  icon:'💰', name:'Inflation',      desc:'Towers cost +25%',                  reward:0.2 },
  { id:'bosses',  icon:'👑', name:'Boss Parade',    desc:'An extra boss at waves 5, 15, 25…', reward:0.3 },
  { id:'elites',  icon:'👾', name:'Elite Army',     desc:'Elites from wave 6, twice as often', reward:0.3 },
  { id:'fragile', icon:'🏚️', name:'Fragile Castle', desc:'Half the lives',                    reward:0.2 },
  { id:'fog',     icon:'🌫️', name:'Fog of War',     desc:'Tower range −15%',                  reward:0.2 },
];
TD.MUTATOR_MODES = ['normal','hard','endless','nightmare','timeattack','rogue'];

// ---- maps: two keeps, spreading lava, breaking ice ----
TD.MAPS.splice(TD.MAPS.findIndex(m=>m.id==='caverns'), 0,
  { id:'twin', name:'Twin Keeps', theme:'autumn', w:14, h:10, waves:30, gold:200, lives:20, diff:1.2, needLevel:14,
    path:[[0,2],[5,2],[5,7],[10,7],[10,4],[13,4]],
    routes:[ { kind:'twin', path:[[8,0],[8,5],[2,5],[2,9]], text:'Two portals, two keeps.' } ],
    air:[[0,2],[7,5],[13,4]], boss:'The Twin Kings', bossSkill:'stomp', bossTint:0xb8602a, effect:'twin', crystals:[1,1],
    effectText:'Two portals, two castles: the enemy marches on both keeps at once. Lives are shared — defend the crossroads.',
    tip:'Towers at the crossroads cover both roads.' });
TD.MAPS.find(m=>m.id==='volcano').spread = { kind:'lava', every:6, from:6, n:2, max:10 };
TD.MAPS.find(m=>m.id==='frost').spread = { kind:'ice', every:6, from:7, n:2, max:10 };
TD.CAMPAIGN_SIDE.push({ map:'twin', icon:'🏰', x:92, y:86 });
TD.THEMES.autumn = { ground:'#9a8a3c', ground2:'#a8983f', path:'#8a5a34', edge:'#6a4024', rim:'#86762f', side:'#5a3a1f',
  tree:0xd8661e, trunk:0x5a3a22, rock:0x8a8480, sky:0xffd8a0, skyTop:0x7aa8e8, skyBot:0xffe8c0, hemi:0xfff0d8, sun:0xffe2b8 };
TD.WEATHER_BY_THEME.autumn = [['clear',5],['rain',3],['fog',2],['storm',1]];
TD.SECRET_BOSSES.twin = 'The Forgotten Prince';
TD.EVENTS.push({ id:'rockfall', icon:'🪨', name:'ROCKFALL', desc:'Boulders crash onto free tiles for the next 3 waves. Smash one (30 gold) for a 💎 crystal — or wait, they crumble on their own.' });
TD.UNLOCKS.push({ level:14, icon:'🏰', text:'Twin Keeps map' });
TD.UNLOCKS.sort((a,b)=>a.level-b.level);
TD.CHALLENGES.push(
  { id:'bestiary', icon:'📖', name:'Monster Hunter',  desc:'Meet 30 different enemy types',          goal:30, coins:120, xp:150 },
  { id:'megaboss', icon:'🗻', name:'Titan Slayer',    desc:'Defeat a Mega Boss',                     goal:1,  coins:250, xp:300 },
  { id:'duo',      icon:'👥', name:'Divide & Conquer',desc:'Defeat two bosses in the same wave',     goal:1,  coins:120, xp:150 },
  { id:'veteran5', icon:'★',  name:'Decorated',       desc:'Raise a tower to battle level 6',        goal:1,  coins:80,  xp:100 },
  { id:'master',   icon:'🎖️', name:'True Master',     desc:'Unleash a master ultimate',              goal:1,  coins:150, xp:200 },
  { id:'nightmare',icon:'😈', name:'Sweet Dreams',    desc:'Win a Nightmare match',                  goal:1,  coins:400, xp:500 },
  { id:'timeatk',  icon:'⏱️', name:'Against the Clock',desc:'Win a Time Attack match',              goal:1,  coins:150, xp:200 },
  { id:'mutator3', icon:'🎲', name:'Glutton for Punishment', desc:'Win with 3 or more mutators on', goal:1,  coins:200, xp:250 },
);

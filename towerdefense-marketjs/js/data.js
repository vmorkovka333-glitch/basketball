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
    desc:'Fast arrows. Hits ground and air.',
    range:[3.2,3.6,3.9], dmg:[9,16,24], rate:[1.7,2.0,2.2], air:true, ground:true, proj:'arrow',
    color:0x7fb84a, accent:0xd9c27a,
    branches:[
      { id:'rapid',   name:'Rapid Fire', icon:'⚡', desc:'Twice the arrows.',              mod:{ rate:2.1, dmg:1.15 } },
      { id:'longbow', name:'Longbow',    icon:'🎯', desc:'Long range, heavy arrows.',      mod:{ range:1.6, dmg:2.1, rate:0.85 } },
    ] },
  cannon: { name:'Cannon', icon:'💣', cost:90,  upg:[70, 125],
    desc:'Slow shells with splash damage. Ground only.',
    range:[2.7,3.0,3.3], dmg:[34,60,95], rate:[0.55,0.62,0.68], air:false, ground:true, proj:'shell',
    splash:[1.0,1.15,1.3], color:0x5b5f6b, accent:0xff8c42,
    branches:[
      { id:'blast', name:'Big Blast',   icon:'💥', desc:'Huge explosions.',                 mod:{ splash:1.6, dmg:1.45 } },
      { id:'fire',  name:'Fire Shells', icon:'🔥', desc:'Sets enemies on fire.',            mod:{ dmg:1.15, burn:true } },
    ] },
  frost: { name:'Frost', icon:'❄️', cost:80,  upg:[60, 105],
    desc:'Chills enemies, slowing them down. Hits air.',
    range:[2.6,2.9,3.2], dmg:[5,9,13], rate:[1.3,1.5,1.6], air:true, ground:true, proj:'ice',
    slow:[0.38,0.48,0.55], slowT:[1.6,2.0,2.3], color:0x7fd4ff, accent:0xdff6ff,
    branches:[
      { id:'chill',  name:'Deep Chill', icon:'❄️', desc:'Slows to a crawl for longer.',    mod:{ slow:1.35, slowT:1.5, dmg:1.2 } },
      { id:'freeze', name:'Freeze',     icon:'🧊', desc:'Every third hit freezes solid.',  mod:{ freeze:true, dmg:1.4 } },
    ] },
  tesla: { name:'Tesla', icon:'⚡', cost:140, upg:[110, 190],
    desc:'Lightning that chains between enemies. Hits ghosts.',
    range:[2.7,3.0,3.2], dmg:[20,36,54], rate:[0.9,1.0,1.1], air:true, ground:true, proj:'bolt',
    chain:[2,3,4], chainFall:0.65, color:0x9b7bff, accent:0x7fffe6,
    branches:[
      { id:'storm',      name:'Storm',      icon:'🌩️', desc:'Chains across the whole crowd.', mod:{ chain:7, chainFall:1.2, dmg:1.1 } },
      { id:'overcharge', name:'Overcharge', icon:'🔋', desc:'One brutal bolt that stuns.',    mod:{ dmg:2.4, chain:1, stun:0.5 } },
    ] },
  sniper: { name:'Sniper', icon:'🎯', cost:170, upg:[140, 240],
    desc:'Huge damage at long range. Ignores armor and shields.',
    range:[5.6,6.3,7.0], dmg:[95,170,260], rate:[0.36,0.42,0.46], air:true, ground:true, proj:'tracer',
    pierce:true, color:0x3f4a5c, accent:0xff4b5c,
    branches:[
      { id:'headshot', name:'Headshot', icon:'💢', desc:'Every third shot is a triple crit.', mod:{ crit:3 } },
      { id:'assassin', name:'Assassin', icon:'💀', desc:'Double damage to bosses and armor.', mod:{ assassin:true, rate:1.2 } },
    ] },
  laser: { name:'Laser', icon:'🔆', cost:210, upg:[170, 280],
    desc:'A beam that burns hotter the longer it stays on one target.',
    range:[3.4,3.8,4.2], dmg:[16,28,44], rate:[1,1,1], air:true, ground:true, proj:'beam', unlock:8,
    color:0xff7ab8, accent:0xfff0a0,
    branches:[
      { id:'focus', name:'Focus',  icon:'🔥', desc:'Ramps up to triple damage.',   mod:{ ramp:3.0 } },
      { id:'prism', name:'Prism',  icon:'🌈', desc:'Splits into three beams.',     mod:{ beams:3, dmg:0.7 } },
    ] },
};
TD.TOWER_ORDER = ['archer','cannon','frost','tesla','sniper','laser'];
TD.SELL_RATE = 0.7;

// ---- abilities: three big buttons with cooldowns, unlocked by player level ----
TD.ABILITIES = [
  { id:'meteor', name:'Meteor', icon:'☄️', cd:45, unlock:2, target:true,  desc:'Tap anywhere: a meteor slams down. Hits air and ground.' },
  { id:'freeze', name:'Freeze', icon:'🧊', cd:60, unlock:4, target:false, desc:'Every enemy on the island stops for 3 seconds.' },
  { id:'chain',  name:'Mega Chain', icon:'⚡', cd:50, unlock:6, target:false, desc:'Lightning leaps across up to 15 enemies.' },
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
  knight:  { name:'Knight',    hp:130, speed:1.15, gold:12, armor:7, size:0.24, color:0x9aa7b8, from:10, w:3,  pts:3, lives:1 },
  ghost:   { name:'Ghost',     hp:55,  speed:1.5,  gold:11, armor:0, size:0.21, color:0xcfd8ff, from:12, w:3,  pts:2, lives:1, ghost:true,
             note:'Arrows and shells pass through it. Frost, Tesla, Sniper and Laser can hurt it.' },
  healer:  { name:'Healer',    hp:85,  speed:1.0,  gold:14, armor:0, size:0.22, color:0x52e07a, from:14, w:2,  pts:3, lives:1, heal:0.04,
             note:'Heals nearby enemies every second. Kill it first.' },
  miniboss:{ name:'Mini Boss', hp:520, speed:0.9,  gold:60, armor:4, size:0.36, color:0xc03060, from:99, w:0,  pts:0, lives:3 },
  boss:    { name:'Boss',      hp:1200,speed:0.65, gold:150,armor:6, size:0.46, color:0x8f1f2e, from:99, w:0,  pts:0, lives:5 },
};

// bosses get a name per map and three scripted phases
TD.BOSS_PHASES = [
  { at:0.5,  kind:'enrage', text:'ENRAGED — faster!' },
  { at:0.25, kind:'summon', text:'calls for help!' },
  { at:0.1,  kind:'shield', text:'raises a shield!' },
];

// ---- maps ------------------------------------------------------------
// path: cell centres the ground route follows (first = spawn, last = base)
// air: the flight route flyers take instead (straight legs through the island)
TD.MAPS = [
  { id:'valley', name:'Green Valley', theme:'grass', w:14, h:10, waves:30, gold:130, lives:20, diff:1.0,
    path:[[0,1],[4,1],[4,5],[1,5],[1,8],[8,8],[8,3],[11,3],[11,7],[13,7]],
    air:[[0,1],[7,5],[13,7]], boss:'Grove Ogre', effect:null, effectText:'No hazards — learn the ropes.',
    tip:'Towers near corners cover two lanes at once.' },
  { id:'canyon', name:'Dusty Canyon', theme:'sand', w:14, h:10, waves:30, gold:150, lives:20, diff:1.25,
    path:[[6,0],[6,3],[1,3],[1,7],[5,7],[5,5],[9,5],[9,8],[12,8],[12,1],[13,1]],
    air:[[6,0],[7,5],[13,1]], boss:'Sand Colossus', effect:'sandstorm', effectText:'Sandstorms cut tower range by a quarter.',
    tip:'Sandstorms roll in every so often — Snipers still reach.' },
  { id:'frost', name:'Frostpeak', theme:'snow', w:14, h:10, waves:30, gold:170, lives:20, diff:1.45,
    path:[[0,8],[3,8],[3,2],[6,2],[6,6],[9,6],[9,1],[12,1],[12,5],[10,5],[10,9],[13,9]],
    air:[[0,8],[6,4],[13,9]], boss:'Frost Giant', effect:'ice', effectText:'Icy road: every enemy is 12% faster.',
    tip:'Long road, fast enemies: Frost towers make everything else better.' },
  { id:'volcano', name:'Volcano', theme:'lava', w:14, h:10, waves:30, gold:180, lives:20, diff:1.65,
    path:[[0,4],[3,4],[3,1],[7,1],[7,6],[4,6],[4,8],[10,8],[10,3],[13,3]],
    air:[[0,4],[7,5],[13,3]], boss:'Magma Lord', effect:'lava', effectText:'Lava pools on the road erupt and burn whoever stands on them.',
    lava:[[5,1],[7,4],[8,8]],
    tip:'Slow enemies on the lava pools and let the mountain do the work.' },
  { id:'space', name:'Deep Space', theme:'space', w:14, h:10, waves:30, gold:200, lives:20, diff:1.85,
    path:[[7,0],[7,2],[2,2],[2,6],[6,6],[6,4],[11,4],[11,8],[13,8]],
    air:[[7,0],[6,5],[13,8]], boss:'Void Wraith', effect:'lowgrav', effectText:'Low gravity: walkers drift 15% slower, flyers 30% faster and far more common.',
    tip:'The sky is the threat here — Archers, Teslas and Lasers.' },
  // the tiered map: every win raises its tier, and with it health, speed and rewards
  { id:'gauntlet', name:'The Gauntlet', theme:'dusk', w:14, h:10, waves:30, gold:180, lives:20, diff:1.3, tiered:true,
    path:[[0,0],[5,0],[5,3],[1,3],[1,6],[6,6],[6,9],[10,9],[10,2],[13,2]],
    air:[[0,0],[7,5],[13,2]], boss:'Gauntlet Warden', effect:'gauntlet', effectText:'Every win raises the tier: +30% enemy health, +3% speed and bigger rewards each tier.',
    tip:'Tier up, gear up. The Gauntlet never stays beaten.' },
];
TD.tierMul = t => 1 + 0.3*Math.max(0, t-1);          // health multiplier per tier
TD.tierSpeed = t => 1 + 0.03*Math.max(0, t-1);
TD.tierReward = t => 1 + 0.25*Math.max(0, t-1);

TD.THEMES = {
  grass: { ground:'#4f9a3c', ground2:'#5cae46', path:'#b98b52', edge:'#8c6636', rim:'#3c7a2f', side:'#5b3d22',
           tree:0x2f8a3f, trunk:0x6b4427, rock:0x8a8f93, sky:0x9fd0ff, hemi:0xdfefff, sun:0xfff2d8 },
  sand:  { ground:'#d3b06a', ground2:'#e0c07c', path:'#9c7444', edge:'#7c5a34', rim:'#c39d5b', side:'#7a5a32',
           tree:0x4f9a3c, trunk:0x6b4427, rock:0xb59b78, sky:0xffd9a8, hemi:0xfff0d8, sun:0xfff2d8 },
  snow:  { ground:'#e6eef5', ground2:'#f3f7fb', path:'#8d98a6', edge:'#6b7684', rim:'#d3dde6', side:'#4d5a6a',
           tree:0x2f6f4f, trunk:0x4d3a2a, rock:0x9aa5b1, sky:0xcfe3ff, hemi:0xeaf4ff, sun:0xfff2d8 },
  lava:  { ground:'#3d3234', ground2:'#4a3c3d', path:'#6e4a3c', edge:'#2a1f20', rim:'#33292a', side:'#1e1718',
           tree:0x2b2426, trunk:0x3a2e2c, rock:0x5a4a48, sky:0x3a1a1e, hemi:0xffb090, sun:0xffc9a0, glow:0xff5a1a },
  dusk:  { ground:'#4a3f5c', ground2:'#5a4d70', path:'#8a4a5a', edge:'#5a2a3a', rim:'#3f3550', side:'#2a2238',
           tree:0x6a3f7a, trunk:0x3a2a40, rock:0x7a7088, sky:0x3a2a4a, hemi:0xd8c8ff, sun:0xffc8a0 },
  space: { ground:'#2b2a4a', ground2:'#35345c', path:'#5a5482', edge:'#1f1d3a', rim:'#26244a', side:'#14122a',
           tree:0x8a6cff, trunk:0x4a3a8a, rock:0x6a6a9a, sky:0x0b0a1e, hemi:0xb0a8ff, sun:0xdcd6ff, stars:true },
};

// ---- waves -----------------------------------------------------------
TD.hpMul   = (n, diff) => (1 + 0.13*(n-1) + 0.016*(n-1)*(n-1)) * (diff||1);
TD.bossMul = (n, diff) => 1 + (TD.hpMul(n, diff)-1)*0.6;   // bosses would be walls on the raw curve
TD.goldMul = n => 1 + 0.01*(n-1);
TD.waveBonus = n => 15 + n*2;
TD.BUILD_TIME = 22;          // seconds between waves before the next one walks in on its own

// deterministic per (map, wave) so a retry sees the same wave
TD.genWave = function(mapIdx, n){
  const map = TD.MAPS[mapIdx];
  let seed = (mapIdx+1)*7919 + n*104729;
  const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed/0x7fffffff; };
  const pool = Object.keys(TD.ENEMIES).map(k=>Object.assign({id:k},TD.ENEMIES[k])).filter(e=>e.w>0 && n>=e.from)
    .map(e=>{ if(map.effect==='lowgrav' && e.id==='flyer') e.w *= 2.5; return e; });
  let budget = (6 + n*3.0 + Math.floor(n/5)*3) * (map.tiered ? 1 + 0.08*Math.max(0,(map.curTier||1)-1) : 1);
  const groups = [];
  let guard = 0;
  while(budget > 0 && guard++ < 20){
    let tw = pool.reduce((a,e)=>a+e.w,0), r = rnd()*tw, pick = pool[0];
    for(const e of pool){ r -= e.w; if(r<=0){ pick=e; break; } }
    const maxCount = Math.max(2, Math.floor(budget/pick.pts));
    const count = Math.min(maxCount, 2 + Math.floor(rnd()*(pick.id==='grunt'||pick.id==='runner'?7:4)));
    groups.push({ type:pick.id, count, gap: pick.id==='runner'?0.45:(pick.pts>=3?1.1:0.7), pause: 1.4 });
    budget -= count*pick.pts;
  }
  // the biggest group goes last so the wave builds up
  groups.sort((a,b)=>a.count*TD.ENEMIES[a.type].pts - b.count*TD.ENEMIES[b.type].pts);
  // a mini boss barges into the middle of every 5th wave from 15 on; a boss ends every 10th
  if(n >= 15 && n % 10 === 5) groups.splice(Math.floor(groups.length/2), 0, { type:'miniboss', count:1, gap:1, pause:1.6 });
  if(n % 10 === 0) groups.push({ type:'boss', count: 1 + Math.floor(n/30), gap:2.5, pause:2.0 });
  return groups;
};
TD.waveLabel = function(groups){
  const c = {};
  groups.forEach(g=>{ c[g.type]=(c[g.type]||0)+g.count; });
  return Object.keys(c).map(k=>c[k]+' '+TD.ENEMIES[k].name+(c[k]>1&&k!=='boss'&&k!=='miniboss'?'s':'')).join(' · ');
};

// ---- progression -----------------------------------------------------
TD.levelCost = n => 120 + n*70;                       // xp to go from level n to n+1
TD.levelOf = function(xp){ let l=1, x=xp; while(x >= TD.levelCost(l) && l<60){ x -= TD.levelCost(l); l++; } return { level:l, into:x, need:TD.levelCost(l) }; };
TD.UNLOCKS = [
  { level:2, text:'Meteor ability' }, { level:4, text:'Freeze ability' }, { level:6, text:'Mega Chain ability' },
  { level:8, text:'Laser tower' }, { level:10, text:'+10% starting gold' }, { level:14, text:'+2 starting lives' },
];
TD.gameXp = function(waves, kills, won, stars){ return Math.round(waves*12 + kills*0.4 + (won?150:0) + stars*40); };
TD.gameCoins = function(waves, won, stars){ return waves + (won ? 30 + stars*10 : 0); };

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
];

// ---- skins: cosmetic only --------------------------------------------
TD.SKINS = [
  { id:'gold_archer',  tower:'archer', name:'Golden Archer', icon:'👑', cost:120, color:0xffd24a, accent:0xfff2b0, trim:0xffe27a },
  { id:'neon_tesla',   tower:'tesla',  name:'Neon Tesla',    icon:'🌈', cost:150, color:0x2ef2ff, accent:0xff3cf0, trim:0x7fffe6 },
  { id:'lava_cannon',  tower:'cannon', name:'Lava Cannon',   icon:'🌋', cost:150, color:0x3a2422, accent:0xff5a1a, trim:0xff8c42 },
  { id:'ice_frost',    tower:'frost',  name:'Ice Frost',     icon:'🧊', cost:120, color:0xffffff, accent:0x7fd4ff, trim:0xbdf3ff },
  { id:'cyber_sniper', tower:'sniper', name:'Cyber Sniper',  icon:'🤖', cost:180, color:0x1f2a3a, accent:0x39ff88, trim:0x39ff88 },
  { id:'royal_laser',  tower:'laser',  name:'Royal Laser',   icon:'💜', cost:200, color:0x6a1fb0, accent:0xffd24a, trim:0xffd24a },
];

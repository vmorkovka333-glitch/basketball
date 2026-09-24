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
TD.TOWER_ORDER = ['archer','cannon','frost','tesla','sniper','laser'];
TD.SELL_RATE = 0.7;

// ---- abilities: three big buttons with cooldowns, unlocked by player level ----
TD.ABILITIES = [
  { id:'meteor',    name:'Meteor',     icon:'☄️', cd:45, unlock:2,  key:'Z', target:true,  desc:'Tap anywhere: a meteor slams down. Hits air and ground.' },
  { id:'freeze',    name:'Freeze',     icon:'🧊', cd:60, unlock:4,  key:'C', target:false, desc:'Every enemy on the island stops for 3 seconds.' },
  { id:'chain',     name:'Mega Chain', icon:'⚡', cd:50, unlock:6,  key:'V', target:false, desc:'Lightning leaps across up to 15 enemies.' },
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
  miniboss:{ name:'Mini Boss', hp:520, speed:0.9,  gold:60, armor:4, size:0.36, color:0xc03060, from:99, w:0,  pts:0, lives:3 },
  boss:    { name:'Boss',      hp:1200,speed:0.65, gold:150,armor:6, size:0.46, color:0x8f1f2e, from:99, w:0,  pts:0, lives:5 },
};

// bosses get a name per map and three scripted phases
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
};

// ---- maps ------------------------------------------------------------
// path: cell centres the ground route follows (first = spawn, last = base)
// air: the flight route flyers take instead (straight legs through the island)
TD.MAPS = [
  { id:'valley', name:'Green Valley', theme:'grass', w:14, h:10, waves:30, gold:130, lives:20, diff:1.0,
    path:[[0,1],[4,1],[4,5],[1,5],[1,8],[8,8],[8,3],[11,3],[11,7],[13,7]],
    air:[[0,1],[7,5],[13,7]], boss:'Grove Ogre', bossSkill:'stomp', bossTint:0x3f7a2a, effect:null, effectText:'No hazards — learn the ropes.',
    tip:'Towers near corners cover two lanes at once.' },
  { id:'canyon', name:'Dusty Canyon', theme:'sand', w:14, h:10, waves:30, gold:150, lives:20, diff:1.25,
    path:[[6,0],[6,3],[1,3],[1,7],[5,7],[5,5],[9,5],[9,8],[12,8],[12,1],[13,1]],
    air:[[6,0],[7,5],[13,1]], boss:'Sand Colossus', bossSkill:'storm', bossTint:0xc2923e, effect:'sandstorm', effectText:'Sandstorms cut tower range by a quarter.',
    tip:'Sandstorms roll in every so often — Snipers still reach.' },
  { id:'frost', name:'Frostpeak', theme:'snow', w:14, h:10, waves:30, gold:170, lives:20, diff:1.45,
    path:[[0,8],[3,8],[3,2],[6,2],[6,6],[9,6],[9,1],[12,1],[12,5],[10,5],[10,9],[13,9]],
    air:[[0,8],[6,4],[13,9]], boss:'Frost Giant', bossSkill:'ice', bossTint:0x5fb4e8, effect:'ice', effectText:'Icy road: every enemy is 12% faster.',
    tip:'Long road, fast enemies: Frost towers make everything else better.' },
  { id:'volcano', name:'Volcano', theme:'lava', w:14, h:10, waves:30, gold:180, lives:20, diff:1.65,
    path:[[0,4],[3,4],[3,1],[7,1],[7,6],[4,6],[4,8],[10,8],[10,3],[13,3]],
    air:[[0,4],[7,5],[13,3]], boss:'Magma Lord', bossSkill:'lava', bossTint:0xd8401a, effect:'lava', effectText:'Lava pools on the road erupt and burn whoever stands on them.',
    lava:[[5,1],[7,4],[8,8]],
    tip:'Slow enemies on the lava pools and let the mountain do the work.' },
  { id:'space', name:'Deep Space', theme:'space', w:14, h:10, waves:30, gold:200, lives:20, diff:1.85,
    path:[[7,0],[7,2],[2,2],[2,6],[6,6],[6,4],[11,4],[11,8],[13,8]],
    air:[[7,0],[6,5],[13,8]], boss:'Void Wraith', bossSkill:'portal', bossTint:0x6a3fd8, effect:'lowgrav', effectText:'Low gravity: walkers drift 15% slower, flyers 30% faster and far more common.',
    tip:'The sky is the threat here — Archers, Teslas and Lasers.' },
  // the tiered map: every win raises its tier, and with it health, speed and rewards
  { id:'gauntlet', name:'The Gauntlet', theme:'dusk', w:14, h:10, waves:30, gold:180, lives:20, diff:1.3, tiered:true,
    path:[[0,0],[5,0],[5,3],[1,3],[1,6],[6,6],[6,9],[10,9],[10,2],[13,2]],
    air:[[0,0],[7,5],[13,2]], boss:'Gauntlet Warden', bossSkill:'warden', bossTint:0x8f1f2e, effect:'gauntlet', effectText:'Every win raises the tier: +30% enemy health, +3% speed and bigger rewards each tier.',
    tip:'Tier up, gear up. The Gauntlet never stays beaten.' },
  // unlocked by player level, not by stars
  { id:'neon', name:'Neon Rift', theme:'neon', w:14, h:10, waves:30, gold:210, lives:20, diff:2.0, needLevel:20,
    path:[[0,5],[3,5],[3,1],[8,1],[8,4],[5,4],[5,8],[11,8],[11,2],[13,2]],
    air:[[0,5],[7,5],[13,2]], boss:'Prism Titan', bossSkill:'emp', bossTint:0xff3cf0, effect:'surge', crystals:[3,2],
    effectText:'Power surge: crystals everywhere, and every 25s the rift overloads them — double crystal bonus for 6s.',
    tip:'Build Teslas and Frosts next to the crystals — the rift pays them double during surges.' },
];
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
TD.genWave = function(mapIdx, n){
  const map = TD.MAPS[mapIdx];
  let seed = (mapIdx+1)*7919 + n*104729;
  const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed/0x7fffffff; };
  const pool = Object.keys(TD.ENEMIES).map(k=>Object.assign({id:k},TD.ENEMIES[k])).filter(e=>e.w>0 && n>=e.from)
    .map(e=>{ if(map.effect==='lowgrav' && e.id==='flyer') e.w *= 2.5; if(map.effect==='surge' && (e.id==='shade'||e.id==='saboteur')) e.w *= 2; return e; });
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
TD.xpForLevel = function(l){ let s=0; for(let i=1;i<l;i++) s += TD.levelCost(i); return s; };
TD.UNLOCKS = [
  { level:2,  icon:'☄️', text:'Meteor ability' },
  { level:4,  icon:'🧊', text:'Freeze ability' },
  { level:6,  icon:'⚡', text:'Mega Chain ability' },
  { level:8,  icon:'🔆', text:'Laser tower' },
  { level:10, icon:'🎨', text:'Neon Archer skin (free)' },
  { level:12, icon:'💰', text:'+10% starting gold' },
  { level:15, icon:'🔥', text:'Overdrive ability' },
  { level:17, icon:'❤️', text:'+2 starting lives' },
  { level:20, icon:'🌌', text:'New map: Neon Rift' },
  { level:25, icon:'👑', text:'Legendary aura on max-level towers' },
];
TD.gameXp = function(waves, kills, won, stars){ return Math.round(waves*12 + kills*0.4 + (won?150:0) + stars*40); };
TD.gameCoins = function(waves, won, stars){ return waves + (won ? 30 + stars*10 : 0); };

// ---- game modes --------------------------------------------------------
TD.MODES = [
  { id:'normal',    name:'Normal',    icon:'🛡️', desc:'30 waves. Earn up to 3 stars.' },
  { id:'hard',      name:'Hard',      icon:'💀', desc:'Enemies up to +35% health (ramps in over the first 10 waves), +6% speed, 10% less starting gold. ×1.6 XP & coins. Win for a crown.', hp:1.35, speed:1.06, gold:0.9, reward:1.6 },
  { id:'endless',   name:'Endless',   icon:'♾️', desc:'Waves never stop. How far can you go?' },
  { id:'challenge', name:'Challenge', icon:'🎲', desc:'20 waves with a special rule. First win of each rule pays 100 coins.', waves:20 },
];
TD.CHALLENGE_RULES = [
  { id:'notesla',  icon:'🚫', name:'No Tesla',       desc:'Tesla towers are banned.', ban:['tesla'] },
  { id:'broke',    icon:'🪙', name:'Shoestring',     desc:'Start with only 100 gold.', gold:100 },
  { id:'glass',    icon:'🏚️', name:'Glass Castle',   desc:'Only 5 lives.', lives:5 },
  { id:'nomagic',  icon:'🔕', name:'No Magic',       desc:'Abilities are disabled.', noAbil:true },
  { id:'swarm',    icon:'🐜', name:'Swarm',          desc:'Enemies are 30% faster but 20% weaker.', speed:1.3, hp:0.8 },
  { id:'oldschool',icon:'🏰', name:'Old School',     desc:'Only Archer, Cannon and Frost.', ban:['tesla','sniper','laser'] },
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

// ---- skins: cosmetic only --------------------------------------------
TD.SKINS = [
  { id:'neon_archer',  tower:'archer', name:'Neon Archer',   icon:'💠', cost:0, level:10, color:0x1a1a3a, accent:0x2ef2ff, trim:0xff3cf0 },
  { id:'gold_archer',  tower:'archer', name:'Golden Archer', icon:'👑', cost:120, color:0xffd24a, accent:0xfff2b0, trim:0xffe27a },
  { id:'neon_tesla',   tower:'tesla',  name:'Neon Tesla',    icon:'🌈', cost:150, color:0x2ef2ff, accent:0xff3cf0, trim:0x7fffe6 },
  { id:'lava_cannon',  tower:'cannon', name:'Lava Cannon',   icon:'🌋', cost:150, color:0x3a2422, accent:0xff5a1a, trim:0xff8c42 },
  { id:'ice_frost',    tower:'frost',  name:'Ice Frost',     icon:'🧊', cost:120, color:0xffffff, accent:0x7fd4ff, trim:0xbdf3ff },
  { id:'cyber_sniper', tower:'sniper', name:'Cyber Sniper',  icon:'🤖', cost:180, color:0x1f2a3a, accent:0x39ff88, trim:0x39ff88 },
  { id:'royal_laser',  tower:'laser',  name:'Royal Laser',   icon:'💜', cost:200, color:0x6a1fb0, accent:0xffd24a, trim:0xffd24a },
];

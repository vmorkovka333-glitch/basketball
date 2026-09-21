'use strict';
// ===================================================================
// Tower Defense 3D — static data: towers, enemies, maps, wave rules
// ===================================================================
window.TD = window.TD || {};

// ---- towers ----------------------------------------------------------
// range in cells, dmg per hit, rate in shots per second; arrays are levels 1..3
TD.TOWERS = {
  archer: { name:'Archer', icon:'🏹', cost:50,  upg:[45, 80],
    desc:'Fast arrows. Hits ground and air.',
    range:[3.2,3.6,4.1], dmg:[9,16,28], rate:[1.7,2.0,2.4], air:true, ground:true, proj:'arrow',
    color:0x7fb84a, accent:0xd9c27a },
  cannon: { name:'Cannon', icon:'💣', cost:90,  upg:[70, 120],
    desc:'Slow shells with splash damage. Ground only.',
    range:[2.7,3.0,3.4], dmg:[34,60,105], rate:[0.55,0.62,0.72], air:false, ground:true, proj:'shell',
    splash:[1.0,1.15,1.35], color:0x5b5f6b, accent:0xff8c42 },
  frost: { name:'Frost', icon:'❄️', cost:80,  upg:[60, 100],
    desc:'Chills enemies, slowing them down. Hits air.',
    range:[2.6,2.9,3.3], dmg:[5,9,15], rate:[1.3,1.5,1.8], air:true, ground:true, proj:'ice',
    slow:[0.38,0.48,0.58], slowT:[1.6,2.0,2.5], color:0x7fd4ff, accent:0xdff6ff },
  tesla: { name:'Tesla', icon:'⚡', cost:140, upg:[110, 180],
    desc:'Lightning that chains between enemies.',
    range:[2.7,3.0,3.3], dmg:[20,36,62], rate:[0.9,1.0,1.15], air:true, ground:true, proj:'bolt',
    chain:[2,3,4], chainFall:0.65, color:0x9b7bff, accent:0x7fffe6 },
  sniper: { name:'Sniper', icon:'🎯', cost:170, upg:[140, 230],
    desc:'Huge damage at long range. Ignores armor.',
    range:[5.6,6.3,7.2], dmg:[95,170,300], rate:[0.36,0.42,0.5], air:true, ground:true, proj:'tracer',
    pierce:true, color:0x3f4a5c, accent:0xff4b5c },
};
TD.TOWER_ORDER = ['archer','cannon','frost','tesla','sniper'];
TD.SELL_RATE = 0.7;

// ---- enemies ---------------------------------------------------------
// hp/speed/gold are wave-1 values; armor is flat damage reduction per hit
TD.ENEMIES = {
  grunt:  { name:'Grunt',  hp:42,   speed:1.35, gold:5,   armor:0, size:0.22, color:0x6cbf4a, from:1,  w:10, pts:1,   lives:1 },
  runner: { name:'Runner', hp:26,   speed:2.5,  gold:6,   armor:0, size:0.18, color:0xf5d142, from:3,  w:6,  pts:1,   lives:1 },
  brute:  { name:'Brute',  hp:190,  speed:0.85, gold:15,  armor:3, size:0.32, color:0xb5552e, from:5,  w:4,  pts:3,   lives:2 },
  flyer:  { name:'Flyer',  hp:60,   speed:1.6,  gold:10,  armor:0, size:0.2,  color:0xb07cff, from:7,  w:4,  pts:2,   lives:1, air:true },
  knight: { name:'Knight', hp:130,  speed:1.15, gold:12,  armor:7, size:0.24, color:0x9aa7b8, from:10, w:3,  pts:3,   lives:1 },
  boss:   { name:'Boss',   hp:1200, speed:0.65, gold:150, armor:6, size:0.46, color:0x8f1f2e, from:99, w:0,  pts:0,   lives:5 },
};

// ---- maps ------------------------------------------------------------
// path: cell centres the ground route follows (first = spawn, last = base)
// air: the flight route flyers take instead (straight legs, through the middle of the island)
TD.MAPS = [
  { id:'valley', name:'Green Valley', theme:'grass', w:14, h:10, waves:30, gold:130, lives:20, diff:1.0,
    path:[[0,1],[4,1],[4,5],[1,5],[1,8],[8,8],[8,3],[11,3],[11,7],[13,7]],
    air:[[0,1],[7,5],[13,7]],
    tip:'Towers near corners cover two lanes at once.' },
  { id:'canyon', name:'Dusty Canyon', theme:'sand', w:14, h:10, waves:30, gold:150, lives:20, diff:1.25,
    path:[[6,0],[6,3],[1,3],[1,7],[5,7],[5,5],[9,5],[9,8],[12,8],[12,1],[13,1]],
    air:[[6,0],[7,5],[13,1]],
    tip:'Flyers cut straight across — keep an Archer on the shortcut.' },
  { id:'frost', name:'Frostpeak', theme:'snow', w:14, h:10, waves:30, gold:170, lives:20, diff:1.45,
    path:[[0,8],[3,8],[3,2],[6,2],[6,6],[9,6],[9,1],[12,1],[12,5],[10,5],[10,9],[13,9]],
    air:[[0,8],[6,4],[13,9]],
    tip:'Long road: Frost towers make every other tower better.' },
];

TD.THEMES = {
  grass: { ground:'#4f9a3c', ground2:'#5cae46', path:'#b98b52', edge:'#8c6636', rim:'#3c7a2f', side:'#5b3d22',
           tree:0x2f8a3f, trunk:0x6b4427, rock:0x8a8f93, sky:0x9fd0ff, fog:'#c9e6ff' },
  sand:  { ground:'#d3b06a', ground2:'#e0c07c', path:'#9c7444', edge:'#7c5a34', rim:'#c39d5b', side:'#7a5a32',
           tree:0x4f9a3c, trunk:0x6b4427, rock:0xb59b78, sky:0xffd9a8, fog:'#f5deb8' },
  snow:  { ground:'#e6eef5', ground2:'#f3f7fb', path:'#8d98a6', edge:'#6b7684', rim:'#d3dde6', side:'#4d5a6a',
           tree:0x2f6f4f, trunk:0x4d3a2a, rock:0x9aa5b1, sky:0xcfe3ff, fog:'#e6f0ff' },
};

// ---- waves -----------------------------------------------------------
// hp and gold grow with the wave; a boss walks in every 10th wave
TD.hpMul   = (n, diff) => (1 + 0.13*(n-1) + 0.011*(n-1)*(n-1)) * (diff||1);
// bosses would be walls on the raw curve: they get a gentler one
TD.bossMul = (n, diff) => 1 + (TD.hpMul(n, diff)-1)*0.6;
TD.goldMul = n => 1 + 0.01*(n-1);
TD.waveBonus = n => 15 + n*2;
TD.BUILD_TIME = 22;          // seconds between waves before the next one walks in on its own

// deterministic per (map, wave) so a retry sees the same wave
TD.genWave = function(mapIdx, n){
  let seed = (mapIdx+1)*7919 + n*104729;
  const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed/0x7fffffff; };
  const pool = Object.keys(TD.ENEMIES).map(k=>Object.assign({id:k},TD.ENEMIES[k])).filter(e=>e.w>0 && n>=e.from);
  let budget = 6 + n*3.0 + Math.floor(n/5)*3;
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
  if(n % 10 === 0) groups.push({ type:'boss', count: 1 + Math.floor(n/30), gap:2.5, pause:2.0 });
  // a little variety: the biggest group goes last so the wave builds up
  groups.sort((a,b)=>a.count*TD.ENEMIES[a.type].pts - b.count*TD.ENEMIES[b.type].pts);
  return groups;
};

// tiny preview text for the HUD ("12 grunts · 4 runners · boss")
TD.waveLabel = function(groups){
  const c = {};
  groups.forEach(g=>{ c[g.type]=(c[g.type]||0)+g.count; });
  return Object.keys(c).map(k=>c[k]+' '+TD.ENEMIES[k].name+(c[k]>1&&k!=='boss'?'s':'')).join(' · ');
};

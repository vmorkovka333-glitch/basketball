'use strict';
// ===================================================================
// Tower Defense 3D — game state, waves, combat, abilities, bosses,
// progression, challenges, skins, UI, audio, save, portal hooks
// ===================================================================
(function(){
const W = TD.W, TOWERS = TD.TOWERS, ENEMIES = TD.ENEMIES;
const $ = id => document.getElementById(id);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const V3 = () => new (window.THREE.Vector3)();
const BASIC = ['archer','cannon','frost','tesla','sniper'];

const G = {
  phase:'menu', map:null, mapIdx:0, gold:0, lives:0, wave:0, endless:false,
  towers:[], grid:new Map(), enemies:[], projs:[], queue:[], buildTimer:-1,
  speed:1, paused:false, adPaused:false, sel:null, buildType:null, targetMode:null,
  t:0, kills:0, earned:0, started:false, raf:0, last:0, over:false, won:false,
  cd:{}, storm:{active:false, timer:0}, lavaT:0, livesLost:0, builtTypes:new Set(), bossAlive:0,
};
window.TD.G = G;

// ---- save ------------------------------------------------------------
const SAVE_KEY = 'td.save.v2';
let SAVE = { maps:{}, vol:0.6, muted:false, music:true, nums:true, quality:'high', games:0, xp:0, coins:0,
  skins:{ owned:[], sel:{} }, ch:{}, stats:{ kills:0, killsBy:{}, bosses:0, abilities:0, frozen:0, ghosts:0, early:0 } };
function loadSave(){
  try{ const r = localStorage.getItem(SAVE_KEY); if(r){ const o = JSON.parse(r); SAVE = Object.assign(SAVE, o); SAVE.stats = Object.assign({ kills:0, killsBy:{}, bosses:0, abilities:0, frozen:0, ghosts:0, early:0 }, o.stats||{}); SAVE.skins = Object.assign({ owned:[], sel:{} }, o.skins||{}); } }catch(e){}
  // carry stars over from the first release
  try{ const r1 = localStorage.getItem('td.save.v1'); if(r1 && !SAVE.games){ const o = JSON.parse(r1); if(o.maps) SAVE.maps = o.maps; if(o.vol!=null) SAVE.vol = o.vol; } }catch(e){}
}
function persist(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); }catch(e){} }
function mapSave(id){ return SAVE.maps[id] || (SAVE.maps[id] = { stars:0, best:0 }); }
function unlocked(i){ return i===0 || (mapSave(TD.MAPS[i-1].id).stars > 0); }
function plevel(){ return TD.levelOf(SAVE.xp).level; }
function skinFor(type){ const id = SAVE.skins.sel[type]; return id ? TD.SKINS.find(s=>s.id===id) : null; }
function towerUnlocked(type){ const u = TOWERS[type].unlock; return !u || plevel() >= u; }

// ---- audio -----------------------------------------------------------
let AC=null, master=null, noiseBuf=null, lastSfx={};
function unlockAudio(){
  if(AC){ if(AC.state==='suspended') AC.resume(); return; }
  try{
    AC = new (window.AudioContext||window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = SAVE.muted ? 0.0001 : SAVE.vol; master.connect(AC.destination);
    const len = AC.sampleRate*0.5; noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    startMusic();
  }catch(e){ AC=null; }
}
function setVolume(v){ SAVE.vol = clamp(v,0,1); persist(); if(master && !SAVE.muted) master.gain.value = SAVE.vol; }
function setMuted(m){ SAVE.muted = !!m; persist(); if(master) master.gain.value = SAVE.muted ? 0.0001 : SAVE.vol; syncToggles(); }
function tone(f, type, t0, dur, vol, slide){
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,slide), t0+dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0+0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0+dur+0.02);
}
function noise(t0, dur, vol, hp, lp){
  const s = AC.createBufferSource(); s.buffer = noiseBuf; const g = AC.createGain();
  const h = AC.createBiquadFilter(); h.type='highpass'; h.frequency.value = hp||200;
  const l = AC.createBiquadFilter(); l.type='lowpass'; l.frequency.value = lp||8000;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
  s.connect(h).connect(l).connect(g).connect(master); s.start(t0); s.stop(t0+dur+0.02);
}
function sfx(name){
  if(!AC || G.adPaused) return;
  const now = AC.currentTime;
  if(lastSfx[name] && now-lastSfx[name] < 0.045) return; lastSfx[name] = now;
  const t = now;
  switch(name){
    case 'arrow': noise(t, 0.06, 0.12, 1500, 6000); tone(900, 'triangle', t, 0.07, 0.05, 500); break;
    case 'shell': tone(90, 'sine', t, 0.28, 0.35, 40); noise(t, 0.18, 0.22, 80, 900); break;
    case 'boom': tone(60, 'sine', t, 0.45, 0.5, 30); noise(t, 0.35, 0.35, 60, 1400); break;
    case 'bigboom': tone(45, 'sine', t, 0.9, 0.7, 20); noise(t, 0.7, 0.5, 40, 1200); noise(t+0.1, 0.5, 0.3, 200, 4000); break;
    case 'ice': tone(1400, 'sine', t, 0.18, 0.09, 2200); tone(2100, 'sine', t+0.03, 0.14, 0.05); break;
    case 'freeze': [1200,1600,2000].forEach((f,i)=>tone(f, 'sine', t+i*0.08, 0.5, 0.12)); noise(t, 0.6, 0.1, 3000, 9000); break;
    case 'zap': noise(t, 0.12, 0.2, 2500, 9000); tone(220, 'sawtooth', t, 0.12, 0.09, 80); break;
    case 'bigzap': for(let i=0;i<4;i++){ noise(t+i*0.09, 0.14, 0.25, 2000, 9000); tone(180+i*40, 'sawtooth', t+i*0.09, 0.14, 0.1, 70); } break;
    case 'laser': tone(660, 'sawtooth', t, 0.12, 0.05, 900); break;
    case 'snipe': noise(t, 0.09, 0.4, 900, 7000); tone(180, 'square', t, 0.12, 0.12, 60); break;
    case 'crit': noise(t, 0.12, 0.5, 700, 8000); tone(120, 'square', t, 0.18, 0.16, 40); tone(1800, 'sine', t, 0.15, 0.08, 400); break;
    case 'pop': tone(320, 'triangle', t, 0.12, 0.12, 120); noise(t, 0.08, 0.1, 300, 3000); break;
    case 'bosspop': tone(120, 'sawtooth', t, 0.6, 0.3, 40); noise(t, 0.5, 0.35, 60, 2000); break;
    case 'bossin': [110,98,87].forEach((f,i)=>tone(f, 'sawtooth', t+i*0.35, 0.6, 0.22)); noise(t, 1.0, 0.12, 50, 400); break;
    case 'phase': tone(140, 'square', t, 0.3, 0.14, 70); tone(280, 'square', t+0.1, 0.3, 0.1, 140); break;
    case 'build': noise(t, 0.12, 0.2, 100, 1200); tone(520, 'triangle', t+0.05, 0.16, 0.12); tone(780, 'triangle', t+0.12, 0.2, 0.1); break;
    case 'upgrade': [520,660,880].forEach((f,i)=>tone(f, 'triangle', t+i*0.07, 0.22, 0.12)); break;
    case 'sell': [880,660].forEach((f,i)=>tone(f, 'square', t+i*0.06, 0.12, 0.05)); noise(t, 0.1, 0.08, 3000, 9000); break;
    case 'horn': tone(196, 'sawtooth', t, 0.5, 0.14, 262); tone(262, 'sawtooth', t+0.25, 0.6, 0.14); break;
    case 'life': tone(140, 'sawtooth', t, 0.35, 0.22, 60); noise(t, 0.2, 0.15, 100, 800); break;
    case 'steal': [900,700,500].forEach((f,i)=>tone(f, 'square', t+i*0.07, 0.1, 0.06)); break;
    case 'win': [523,659,784,1047,1319].forEach((f,i)=>tone(f, 'triangle', t+i*0.09, 0.5, 0.14)); break;
    case 'lose': [392,349,311,262].forEach((f,i)=>tone(f, 'sawtooth', t+i*0.16, 0.45, 0.1)); break;
    case 'click': tone(700, 'square', t, 0.04, 0.04); break;
    case 'nope': tone(160, 'square', t, 0.12, 0.08, 120); break;
    case 'coin': tone(1320, 'sine', t, 0.08, 0.08); tone(1760, 'sine', t+0.06, 0.16, 0.08); break;
    case 'meteor': noise(t, 0.7, 0.25, 200, 2000); tone(400, 'sawtooth', t, 0.7, 0.08, 60); break;
    case 'storm': noise(t, 1.2, 0.18, 200, 1500); break;
    case 'level': [523,659,784,1047,1319,1568].forEach((f,i)=>tone(f, 'triangle', t+i*0.08, 0.6, 0.13)); break;
  }
}
// ambient loop: slow chord pads with a soft pulse; a boss on the field makes it darker and faster
let musTimer=0, musGain=null, musStep=0;
const CHORDS = [[131,165,196,247],[110,131,165,196],[147,175,220,262],[123,147,185,220]];
const BOSS_CHORDS = [[110,131,156,196],[104,123,147,185]];
function startMusic(){
  if(!AC) return;
  musGain = AC.createGain(); musGain.gain.value = SAVE.music ? 0.5 : 0.0001; musGain.connect(master);
  const step = ()=>{
    if(!AC) return;
    const boss = G.bossAlive > 0 && G.phase==='wave';
    const t = AC.currentTime, ch = boss ? BOSS_CHORDS[Math.floor(musStep/4)%2] : CHORDS[Math.floor(musStep/4)%CHORDS.length];
    if(musStep%4===0) ch.forEach((f,i)=>{ const o=AC.createOscillator(), g=AC.createGain(); o.type=i%2?'triangle':'sine'; o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.06,t+0.6); g.gain.exponentialRampToValueAtTime(0.0001,t+3.4); o.connect(g).connect(musGain); o.start(t); o.stop(t+3.5); });
    const o=AC.createOscillator(), g=AC.createGain(); o.type= boss?'square':'sine'; o.frequency.value=ch[musStep%2?1:0]*(boss?1:2);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(boss?0.04:0.05,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+0.35); o.connect(g).connect(musGain); o.start(t); o.stop(t+0.4);
    musStep++; musTimer = setTimeout(step, boss ? 520 : 850);
  };
  step();
}
function setMusic(on){ SAVE.music = !!on; persist(); if(musGain) musGain.gain.value = on ? 0.5 : 0.0001; syncToggles(); }

// ---- helpers ---------------------------------------------------------
function toast(msg, cls){
  const host = $('toasts'); const el = document.createElement('div'); el.className = 'toast '+(cls||''); el.textContent = msg; host.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 300); }, 2300);
  while(host.children.length>3) host.removeChild(host.firstChild);
}
function towerCost(type, level){ const d = TOWERS[type]; return level===1 ? d.cost : d.upg[level-2]; }
function towerValue(t){ let v = TOWERS[t.type].cost; for(let l=2;l<=t.level;l++) v += TOWERS[t.type].upg[l-2]; return v; }
function branchOf(t){ return (t.level===3 && t.branch!=null) ? TOWERS[t.type].branches[t.branch] : null; }
// level stat with the branch applied: range adds, chain replaces, everything else multiplies
function stat(t, key){
  const d = TOWERS[t.type]; let v = d[key] ? d[key][t.level-1] : undefined; if(v===undefined) return undefined;
  const b = branchOf(t); if(b && b.mod[key]!=null){ if(key==='range') v += b.mod[key]; else if(key==='chain') v = b.mod[key]; else v *= b.mod[key]; }
  if(key==='range' && G.storm.active) v *= 0.75;
  return v;
}
function flag(t, key){ const b = branchOf(t); return b ? b.mod[key] : undefined; }
function cellFree(cx, cz){
  const m = G.map; if(cx<0||cz<0||cx>=m.w||cz>=m.h) return false;
  if(m.pathSet.has(cx+','+cz)) return false;
  return !G.grid.has(cx+','+cz);
}
function inside(cx,cz){ return cx>=0&&cz>=0&&cx<G.map.w&&cz<G.map.h; }

// ---- damage numbers (DOM, pooled) -----------------------------------
const NUMS = { pool:[], live:[] };
function num(x,y,z,text,cls){
  if(!SAVE.nums) return;
  if(NUMS.live.length > 40){ const o = NUMS.live.shift(); o.el.style.opacity = '0'; NUMS.pool.push(o); }
  let o = NUMS.pool.pop();
  if(!o){ o = { el:document.createElement('div') }; o.el.className = 'dn'; $('nums').appendChild(o.el); }
  o.x=x; o.y=y; o.z=z; o.life=0.85; o.max=0.85; o.el.textContent = text; o.el.className = 'dn '+(cls||''); o.el.style.opacity = '1';
  NUMS.live.push(o);
}
function numsTick(dt){
  for(let i=NUMS.live.length-1;i>=0;i--){
    const o = NUMS.live[i]; o.life -= dt;
    if(o.life<=0){ o.el.style.opacity = '0'; NUMS.live.splice(i,1); NUMS.pool.push(o); continue; }
    const k = 1-o.life/o.max; const [sx,sy] = W.toScreen(o.x, o.y+k*0.9, o.z);
    o.el.style.transform = 'translate(-50%,-50%) translate('+sx.toFixed(0)+'px,'+sy.toFixed(0)+'px) scale('+(1+k*0.15)+')';
    o.el.style.opacity = o.life < 0.3 ? (o.life/0.3).toFixed(2) : '1';
  }
}
function numsClear(){ NUMS.live.forEach(o=>{ o.el.style.opacity='0'; NUMS.pool.push(o); }); NUMS.live.length = 0; }

// ---- challenges + stats ----------------------------------------------
function chValue(c){
  const s = SAVE.stats;
  switch(c.id){
    case 'tesla100': return s.killsBy.tesla||0;
    case 'bosses': return s.bosses;
    case 'abil10': return s.abilities;
    case 'frozen50': return s.frozen;
    case 'ghosts': return s.ghosts;
    case 'early10': return s.early;
    default: return (SAVE.ch[c.id] && SAVE.ch[c.id].p) || 0;
  }
}
function chMark(id){ const e = SAVE.ch[id] || (SAVE.ch[id] = {p:0,done:false}); e.p = Math.max(e.p, 1); chCheck(); }
function chCheck(){
  for(const c of TD.CHALLENGES){
    const e = SAVE.ch[c.id] || (SAVE.ch[c.id] = {p:0,done:false});
    if(e.done) continue;
    if(chValue(c) >= c.goal){ e.done = true; SAVE.coins += c.coins; SAVE.xp += c.xp; toast('🏆 Challenge: '+c.name+'  ·  +'+c.coins+' coins  +'+c.xp+' XP', 'good'); sfx('coin'); }
  }
  persist();
}

// ---- match setup -----------------------------------------------------
function startMap(idx, endless){
  G.mapIdx = idx; G.map = TD.MAPS[idx];
  W.buildMap(G.map);
  G.towers.forEach(t=>{ W.remove(t.mesh); if(t.beams) t.beams.forEach(b=>W.remove(b)); }); G.enemies.forEach(e=>W.remove(e.mesh)); G.projs.forEach(p=>W.freeProj(p.kind,p.mesh));
  G.towers = []; G.grid = new Map(); G.enemies = []; G.projs = []; G.queue = []; W.fxReset(); W.hideRing(); W.hideGhost(); W.hideMarker(); numsClear();
  const lv = plevel();
  G.gold = Math.round(G.map.gold * (lv>=10 ? 1.1 : 1)); G.lives = G.map.lives + (lv>=14 ? 2 : 0); G.startLives = G.lives;
  G.wave = 0; G.endless = !!endless; G.kills = 0; G.earned = 0; G.t = 0; G.livesLost = 0; G.builtTypes = new Set(); G.bossAlive = 0;
  G.phase = 'build'; G.buildTimer = -1; G.sel = null; G.buildType = null; G.targetMode = null; G.over = false; G.won = false; G.speed = 1; G.paused = false;
  G.cd = { meteor:0, freeze:0, chain:0 }; G.storm = { active:false, timer: 38 }; G.lavaT = 0;
  SAVE.games = (SAVE.games||0)+1; persist();
  $('app').classList.remove('menu'); $('menu').classList.add('hide'); $('result').classList.remove('show'); $('pauseWrap').classList.remove('show'); $('stormFx').classList.remove('show');
  G.started = true;
  if(typeof window.onGameplayStart==='function') window.onGameplayStart();
  renderHud(); renderBuildBar(); renderPanel(); renderWaveBtn(); renderAbilities(); syncSpeed();
  toast(G.map.tip, 'tip');
}

// ---- towers ----------------------------------------------------------
function makeMesh(t){ const m = W.makeTower(t.type, t.level, skinFor(t.type), t.branch); m.position.set(t.x, 0, t.z); return m; }
function build(type, cx, cz){
  const cost = TOWERS[type].cost;
  if(!towerUnlocked(type)){ toast('Laser unlocks at level '+TOWERS[type].unlock, 'bad'); sfx('nope'); return false; }
  if(G.gold < cost){ toast('Not enough gold', 'bad'); sfx('nope'); return false; }
  if(!cellFree(cx,cz)){ sfx('nope'); return false; }
  G.gold -= cost;
  const t = { type, level:1, branch:null, cx, cz, x:cx+0.5, z:cz+0.5, cool:0.3, target:null, kills:0, dmg:0, shots:0, ramp:1, acc:0, accT:0 };
  t.mesh = makeMesh(t); t.mesh.scale.setScalar(0.01); t.pop = 0; W.add(t.mesh);
  if(TOWERS[type].proj==='beam'){ t.beams = [W.makeBeam(TOWERS[type].accent)]; }
  G.towers.push(t); G.grid.set(cx+','+cz, t);
  G.builtTypes.add(type); if(BASIC.every(k=>G.builtTypes.has(k))) chMark('alltypes');
  W.burst(t.x, 0.3, t.z, 0xd8c9a0, 18, 2.2, 0.6, 3.5, 6, 2.0);
  sfx('build'); select(t); renderHud(); renderBuildBar();
  return true;
}
function upgrade(t, branch){
  if(!t || t.level>=3) return;
  const cost = towerCost(t.type, t.level+1);
  if(G.gold < cost){ toast('Not enough gold', 'bad'); sfx('nope'); return; }
  if(t.level===2 && branch==null){ return; }   // level 3 needs a branch choice
  G.gold -= cost; t.level++; if(t.level===3) t.branch = branch;
  const yaw = t.mesh.head.rotation.y;
  W.remove(t.mesh); t.mesh = makeMesh(t); t.mesh.head.rotation.y = yaw; W.add(t.mesh);
  if(t.beams){ const want = flag(t,'beams')||1; while(t.beams.length < want) t.beams.push(W.makeBeam(TOWERS[t.type].accent)); }
  t.mesh.scale.setScalar(0.7); t.pop = 0;
  W.burst(t.x, 0.6, t.z, TOWERS[t.type].accent, 26, 2.6, 0.7, 3.5, 4, 2.2);
  sfx('upgrade'); renderHud(); renderPanel(); renderBuildBar();
}
function sell(t){
  if(!t) return;
  const v = Math.round(towerValue(t)*TD.SELL_RATE);
  if(t.level===3) chMark('sell3');
  G.gold += v; W.remove(t.mesh); if(t.beams) t.beams.forEach(b=>W.remove(b)); G.grid.delete(t.cx+','+t.cz); G.towers.splice(G.towers.indexOf(t),1);
  W.burst(t.x, 0.4, t.z, 0xffd54a, 16, 2.0, 0.6, 3, 5, 1.8);
  sfx('sell'); toast('+'+v+' gold', 'good'); deselect(); renderHud(); renderBuildBar();
}
function select(t){ G.sel = t; G.buildType = null; G.targetMode = null; W.hideMarker(); renderPanel(); renderBuildBar(); renderAbilities(); W.showRing(t.x, t.z, stat(t,'range'), true); W.hideGhost(); }
function deselect(){ G.sel = null; renderPanel(); W.hideRing(); }
function setBuildType(type){
  if(G.buildType===type) type = null;
  if(type && !towerUnlocked(type)){ toast('🔒 '+TOWERS[type].name+' unlocks at player level '+TOWERS[type].unlock, 'bad'); sfx('nope'); return; }
  G.buildType = type; G.sel = null; G.targetMode = null; W.hideMarker(); renderPanel(); renderBuildBar(); renderAbilities(); W.hideRing(); W.hideGhost();
  if(type) sfx('click');
}

// ---- waves -----------------------------------------------------------
function callWave(){
  if(G.phase!=='build' || G.over) return;
  let bonus = 0;
  if(G.buildTimer > 0){ bonus = Math.round(G.buildTimer*1.5); G.gold += bonus; G.earned += bonus; SAVE.stats.early++; chCheck(); }
  G.wave++;
  const groups = TD.genWave(G.mapIdx, G.wave);
  let at = 0.6; G.queue = [];
  groups.forEach(gr=>{ for(let i=0;i<gr.count;i++){ G.queue.push({ type:gr.type, at }); at += gr.gap; } at += gr.pause; });
  G.spawnT = 0; G.phase = 'wave';
  sfx('horn');
  toast('Wave '+G.wave+(bonus?'  ·  +'+bonus+' early bonus':''), bonus?'good':'');
  if(groups.some(g=>g.type==='boss')) setTimeout(()=>{ if(G.phase==='wave') bossBanner(); }, 400);
  renderHud(); renderWaveBtn();
}
function spawn(type, at, seg){
  const d = ENEMIES[type], mul = (type==='boss'||type==='miniboss') ? TD.bossMul(G.wave, G.map.diff) : TD.hpMul(G.wave, G.map.diff);
  const route = d.air ? G.map.airRoute : G.map.route;
  let speed = d.speed;
  if(G.map.effect==='ice') speed *= 1.12;
  if(G.map.effect==='lowgrav') speed *= d.air ? 1.3 : 0.85;
  const e = { type, d, hp: Math.round(d.hp*mul), maxHp: Math.round(d.hp*mul), speed, armor:d.armor, gold: Math.round(d.gold*TD.goldMul(G.wave)),
    air:!!d.air, ghost:!!d.ghost, mesh:W.makeEnemy(type), route, seg:seg||0, dist:0, slow:0, slowT:0, frozen:0, stun:0, burn:0, burnDps:0, healT:0,
    dead:false, flash:0, pos: (at ? at.clone() : route[0].clone()), lives:d.lives, shield: d.shield ? Math.round(d.shield*mul) : 0, shieldMax: d.shield ? Math.round(d.shield*mul) : 0,
    phase:0, bshield:0, bshieldT:0, enraged:false, hits:0 };
  e.pos.y = e.mesh.baseY; e.mesh.position.copy(e.pos); W.add(e.mesh);
  if(type==='boss'){ e.mesh.scale.setScalar(1.25); G.bossAlive++; W.shake(0.35); }
  if(type==='miniboss'){ G.bossAlive++; toast('⚠️ Mini boss!', 'bad'); sfx('phase'); }
  G.enemies.push(e);
  return e;
}
function bossBanner(){
  const b = $('bossBanner'); $('bossName').textContent = G.map.boss; b.classList.add('show'); sfx('bossin'); W.shake(0.5);
  setTimeout(()=>b.classList.remove('show'), 2600);
}
function waveCleared(){
  const bonus = TD.waveBonus(G.wave); G.gold += bonus; G.earned += bonus;
  toast('Wave '+G.wave+' cleared  ·  +'+bonus+' gold', 'good');
  if(G.wave >= 6 && G.towers.length && G.towers.every(t=>t.type==='archer')) chMark('archers');
  if(G.gold >= 1000) chMark('rich');
  if(G.wave >= 40) chMark('wave40');
  if(G.wave >= G.map.waves && !G.endless){ finish(true); return; }
  G.phase = 'build'; G.buildTimer = TD.BUILD_TIME;
  renderHud(); renderWaveBtn();
}

// ---- combat ----------------------------------------------------------
const _v = V3(), _v2 = V3();
function inRange(t, e, r){ const dx = e.pos.x-t.x, dz = e.pos.z-t.z; return dx*dx+dz*dz <= (r+e.d.size)*(r+e.d.size); }
function canHit(t, e){ const d = TOWERS[t.type]; if(e.ghost && (d.proj==='arrow'||d.proj==='shell')) return false; return e.air ? d.air : d.ground; }
function pickTarget(t){
  const r = stat(t,'range'); let best = null, bd = -1;
  for(const e of G.enemies){ if(e.dead || !canHit(t,e) || !inRange(t,e,r)) continue; if(e.dist > bd){ bd = e.dist; best = e; } }
  return best;
}
function muzzleWorld(t){ const v = t.mesh.muzzle.clone(); t.mesh.head.localToWorld(v); return v; }
function headPos(e){ return _v2.set(e.pos.x, e.pos.y + e.d.size*1.4, e.pos.z); }
// kind: 'phys' | 'bolt' | 'beam' | 'fire' | 'ice' | 'meteor'
function hit(e, dmg, o){
  if(e.dead || dmg<=0) return 0; o = o||{};
  const p = headPos(e);
  if(e.bshield > 0){ e.bshield -= dmg; num(p.x,p.y,p.z, 'BLOCK', 'blk'); if(e.bshield<=0){ e.bshield = 0; W.bubble(e.mesh, false); W.burst(p.x,p.y,p.z,0x7fd4ff,30,3,0.6,3.5,4,1.6); } return 0; }
  if(e.shield > 0 && !o.pierce && o.kind!=='bolt' && o.kind!=='meteor'){
    e.shield -= dmg; num(p.x,p.y,p.z, Math.round(dmg), 'shd');
    if(e.shield <= 0){ e.shield = 0; if(e.mesh.shieldMesh) e.mesh.shieldMesh.visible = false; W.burst(p.x,p.y,p.z,0x7fb8ff,18,2.4,0.5,3,4,1.6); }
    e.flash = 0.08; return 0;
  }
  let eff = o.pierce ? dmg : Math.max(1, dmg - e.armor);
  if(o.assassin && (e.type==='boss'||e.type==='miniboss'||e.armor>=3)) eff *= 2;
  eff = Math.round(eff);
  e.hp -= eff; e.flash = 0.1; e.hits++;
  if(o.src){ o.src.dmg += eff; }
  if(o.kind!=='beam' && o.kind!=='fire') num(p.x,p.y,p.z, eff, o.crit?'crit':(o.kind==='ice'?'ice':(o.kind==='bolt'?'bolt':'')));
  if(e.type==='boss') bossPhases(e);
  if(e.hp <= 0) kill(e, o.src);
  return eff;
}
function kill(e, src){
  e.dead = true; G.kills++; G.gold += e.gold; G.earned += e.gold; if(src) src.kills++;
  SAVE.stats.kills++; if(src){ SAVE.stats.killsBy[src.type] = (SAVE.stats.killsBy[src.type]||0)+1; }
  if(e.ghost) SAVE.stats.ghosts++;
  if(e.type==='boss'){ SAVE.stats.bosses++; G.bossAlive--; W.shake(0.5); toast('👑 '+G.map.boss+' defeated!', 'good'); }
  if(e.type==='miniboss') G.bossAlive--;
  if(e.type==='thief'){ G.gold += 15; G.earned += 15; num(e.pos.x, e.pos.y+0.9, e.pos.z, '+'+(e.gold+15)+' 💰', 'gold'); }
  else num(e.pos.x, e.pos.y+0.9, e.pos.z, '+'+e.gold, 'gold');
  const c = e.d.color, big = e.type==='boss'||e.type==='miniboss';
  W.burst(e.pos.x, e.pos.y+e.d.size*1.4, e.pos.z, c, big?90:22, big?4.5:2.6, 0.7, big?5:3.2, 6, 1.4);
  W.burst(e.pos.x, e.pos.y+e.d.size*1.4, e.pos.z, 0xffe14b, big?24:6, 2.0, 0.5, 2.5, 4, 1.2);
  sfx(big?'bosspop':'pop');
  chCheck();
}
function bossPhases(e){
  const r = e.hp/e.maxHp;
  while(e.phase < TD.BOSS_PHASES.length && r <= TD.BOSS_PHASES[e.phase].at){
    const ph = TD.BOSS_PHASES[e.phase]; e.phase++;
    if(ph.kind==='enrage'){ e.enraged = true; e.speed *= 1.5; }
    else if(ph.kind==='summon'){ for(let i=0;i<4;i++){ const m = spawn('grunt', e.pos, e.seg); m.dist = e.dist - 0.1*i; W.burst(e.pos.x,0.5,e.pos.z,0x6cbf4a,20,2.5,0.6,3,4,1.5); } }
    else if(ph.kind==='shield'){ e.bshield = Math.round(e.maxHp*0.12); e.bshieldT = 5; W.bubble(e.mesh, true); }
    toast('👑 '+G.map.boss+' '+ph.text, 'bad'); sfx('phase'); W.shake(0.25);
  }
}
function applySlow(e, s, t, src){
  e.slow = Math.max(e.slow, s); e.slowT = Math.max(e.slowT, t);
  if(src && flag(src,'freeze') && e.hits % 3 === 0) freezeOne(e, 1.2);
}
function freezeOne(e, t){
  if(e.type==='boss' && e.enraged) t *= 0.5;
  if(e.frozen <= 0){ SAVE.stats.frozen++; }
  e.frozen = Math.max(e.frozen, t); W.burst(e.pos.x, e.pos.y+0.4, e.pos.z, 0xbdf3ff, 10, 1.5, 0.6, 2.4, 1, 1.4);
}
function fire(t, e){
  const d = TOWERS[t.type], dmg = stat(t,'dmg'), m = muzzleWorld(t); t.shots++;
  if(d.proj==='arrow' || d.proj==='ice'){
    const mesh = W.projMesh(d.proj); mesh.position.copy(m);
    G.projs.push({ kind:d.proj, mesh, pos:m.clone(), target:e, speed:d.proj==='arrow'?15:10, dmg, src:t, slow:stat(t,'slow')||0, slowT:stat(t,'slowT')||0, life:3 });
    W.burst(m.x, m.y, m.z, d.accent, 3, 1.2, 0.2, 1.6, 0, 1); sfx(d.proj==='arrow'?'arrow':'ice');
  }else if(d.proj==='shell'){
    const mesh = W.projMesh('shell'); mesh.position.copy(m);
    const dist = Math.hypot(e.pos.x-m.x, e.pos.z-m.z), dur = clamp(dist/7, 0.35, 0.9);
    const to = predict(e, dur); to.y = 0.08;
    G.projs.push({ kind:'shell', mesh, from:m.clone(), to, t:0, dur, dmg, splash:stat(t,'splash'), src:t, burn:!!flag(t,'burn'), arc:(1.2+dist*0.25)*(G.map.effect==='lowgrav'?1.6:1) });
    W.burst(m.x, m.y, m.z, 0xffb347, 10, 2.2, 0.3, 2.2, 0, 1.2); W.burst(m.x, m.y, m.z, 0x555555, 6, 1.0, 0.5, 3, -1, 1.2); sfx('shell'); W.shake(0.04);
  }else if(d.proj==='bolt'){
    const chain = Math.round(stat(t,'chain')), fall = Math.min(1, stat(t,'chainFall')||d.chainFall); let cur = e, from = m; const done = new Set([e]);
    for(let i=0;i<chain;i++){
      const p = headPos(cur).clone();
      W.bolt(from, p, 0x9ffcff, 0.05, true); W.burst(p.x,p.y,p.z, 0x9ffcff, 8, 1.8, 0.25, 2.2, 0, 1.6);
      hit(cur, Math.round(dmg*Math.pow(fall,i)), { kind:'bolt', src:t });
      if(flag(t,'stun') && !cur.dead){ cur.stun = Math.max(cur.stun, flag(t,'stun')); }
      let next = null, bd = 1.9*1.9;
      for(const o of G.enemies){ if(o.dead||done.has(o)||!canHit(t,o)) continue; const dd = o.pos.distanceToSquared(cur.pos); if(dd<bd){ bd=dd; next=o; } }
      if(!next) break; done.add(next); from = p; cur = next;
    }
    sfx('zap');
  }else if(d.proj==='tracer'){
    const p = headPos(e).clone(); let crit = false, k = 1;
    if(flag(t,'crit') && t.shots % 3 === 0){ crit = true; k = flag(t,'crit'); }
    W.bolt(m, p, crit?0xff7a7a:0xffd0d0, crit?0.06:0.03, false); W.burst(p.x,p.y,p.z, 0xffffff, crit?22:10, 2.4, 0.25, 2.2, 0, 1.6);
    W.burst(m.x, m.y, m.z, 0xffb347, 6, 1.5, 0.2, 1.6, 0, 1);
    hit(e, Math.round(dmg*k), { kind:'phys', pierce:true, src:t, assassin:!!flag(t,'assassin'), crit }); sfx(crit?'crit':'snipe');
    if(crit) W.shake(0.08);
  }
}
function predict(e, dt){
  const p = e.pos.clone(); let seg = e.seg, left = e.speed*(1-e.slow)*dt;
  while(left>0 && seg<e.route.length-1){
    const nxt = e.route[seg+1]; const dx = nxt.x-p.x, dz = nxt.z-p.z, L = Math.hypot(dx,dz);
    if(L<=left){ p.x = nxt.x; p.z = nxt.z; left -= L; seg++; } else { p.x += dx/L*left; p.z += dz/L*left; left = 0; }
  }
  return p;
}
function laserTick(t, dt){
  const d = TOWERS[t.type];
  if(!t.target){ t.ramp = Math.max(1, t.ramp - dt*2); t.beams.forEach(b=>b.visible=false); return; }
  const maxRamp = flag(t,'ramp') || 1.8; t.ramp = Math.min(maxRamp, t.ramp + dt*(maxRamp-1)/2.5);
  const dps = stat(t,'dmg') * t.ramp, m = muzzleWorld(t);
  const targets = [t.target];
  const nb = flag(t,'beams')||1;
  if(nb > 1){ const r = stat(t,'range'); const others = G.enemies.filter(o=>!o.dead&&o!==t.target&&canHit(t,o)&&inRange(t,o,r)).sort((a,b)=>b.dist-a.dist); for(const o of others){ if(targets.length>=nb) break; targets.push(o); } }
  for(let i=0;i<t.beams.length;i++){
    const b = t.beams[i], e = targets[i];
    if(!e){ b.visible = false; continue; }
    W.setBeam(b, m, headPos(e).clone(), 0.8 + t.ramp*0.3);
    const eff = hit(e, dps*dt, { kind:'beam', src:t });
    t.acc += eff;
    if(Math.random() < dt*10) W.burst(e.pos.x, e.pos.y+e.d.size*1.4, e.pos.z, d.accent, 2, 1.2, 0.25, 1.8, 0, 1.4);
  }
  t.accT += dt; if(t.accT >= 0.5){ if(t.acc > 0 && t.target && !t.target.dead) num(t.target.pos.x, t.target.pos.y+t.target.d.size*1.4, t.target.pos.z, Math.round(t.acc), 'beam'); t.acc = 0; t.accT = 0; sfx('laser'); }
}

// ---- abilities -------------------------------------------------------
function abilityUnlocked(a){ return plevel() >= a.unlock; }
function useAbility(id){
  const a = TD.ABILITIES.find(x=>x.id===id); if(!a || G.over || G.phase==='menu') return;
  if(!abilityUnlocked(a)){ toast('🔒 '+a.name+' unlocks at player level '+a.unlock, 'bad'); sfx('nope'); return; }
  if(G.cd[id] > 0){ sfx('nope'); return; }
  if(a.target){ G.targetMode = G.targetMode===id ? null : id; G.buildType = null; deselect(); W.hideGhost(); if(!G.targetMode) W.hideMarker(); renderBuildBar(); renderAbilities(); sfx('click'); return; }
  castAbility(id, null);
}
function castAbility(id, at){
  const a = TD.ABILITIES.find(x=>x.id===id);
  G.cd[id] = a.cd; SAVE.stats.abilities++; chCheck(); G.targetMode = null; W.hideMarker(); renderAbilities();
  const mul = TD.hpMul(Math.max(1,G.wave), G.map.diff);
  if(id==='meteor'){
    const mesh = W.projMesh('meteor'); const from = at.clone(); from.y = 11; from.x -= 2.5; mesh.position.copy(from);
    G.projs.push({ kind:'meteor', mesh, from, to:at.clone(), t:0, dur:0.75, dmg:Math.round(150*mul), splash:1.9 });
    W.showMarker(at.x, at.z, 1.9); sfx('meteor');
  }else if(id==='freeze'){
    for(const e of G.enemies){ if(!e.dead) freezeOne(e, 3.0); }
    W.burst(G.map.w/2, 1.5, G.map.h/2, 0xbdf3ff, 160, 6, 1.2, 4, 1, 2.2); sfx('freeze'); W.shake(0.15);
    $('freezeFx').classList.add('show'); setTimeout(()=>$('freezeFx').classList.remove('show'), 700);
  }else if(id==='chain'){
    let cur = null, bd = -1; for(const e of G.enemies){ if(!e.dead && e.dist > bd){ bd = e.dist; cur = e; } }
    if(!cur){ toast('No enemies on the island', 'bad'); G.cd[id] = 0; renderAbilities(); return; }
    const done = new Set([cur]); let from = new (window.THREE.Vector3)(cur.pos.x, 6, cur.pos.z);
    for(let i=0;i<15 && cur;i++){
      const p = headPos(cur).clone(); W.bolt(from, p, 0xffffff, 0.08, true); W.burst(p.x,p.y,p.z, 0x9ffcff, 14, 2.4, 0.35, 2.6, 0, 1.6);
      hit(cur, Math.round(45*mul), { kind:'bolt' });
      let next = null, nd = 1e9; for(const o of G.enemies){ if(o.dead||done.has(o)) continue; const dd = o.pos.distanceToSquared(cur.pos); if(dd<nd){ nd=dd; next=o; } }
      if(!next || nd > 5*5) break; done.add(next); from = p; cur = next;
    }
    sfx('bigzap'); W.shake(0.2);
  }
}

// ---- simulation step -------------------------------------------------
function step(dt){
  G.t += dt;
  for(const k in G.cd) if(G.cd[k] > 0) G.cd[k] = Math.max(0, G.cd[k]-dt);
  // map hazards
  if(G.map.effect==='sandstorm'){
    G.storm.timer -= dt;
    if(G.storm.timer <= 0){
      G.storm.active = !G.storm.active; G.storm.timer = G.storm.active ? 8 : 40;
      $('stormFx').classList.toggle('show', G.storm.active);
      if(G.storm.active){ toast('🌪️ Sandstorm! Tower range −25%', 'bad'); sfx('storm'); } else toast('Sandstorm passed', 'tip');
      if(G.sel) W.showRing(G.sel.x, G.sel.z, stat(G.sel,'range'), true);
    }
    if(G.storm.active && Math.random() < dt*30) W.burst(Math.random()*G.map.w, 0.3+Math.random()*1.2, Math.random()*G.map.h, 0xd8b26a, 1, 3, 0.8, 2.2, 0, 0.3);
  }
  if(G.map.effect==='lava'){
    G.lavaT += dt;
    if(G.lavaT >= 5){ G.lavaT = 0;
      for(const [lx,lz] of G.map.lava){ const cx = lx+0.5, cz = lz+0.5; W.burst(cx, 0.2, cz, 0xff5a1a, 36, 3.2, 0.7, 4, 5, 2.0);
        for(const e of G.enemies){ if(e.dead||e.air) continue; if(Math.hypot(e.pos.x-cx, e.pos.z-cz) < 0.7) hit(e, Math.round(e.maxHp*(e.type==='boss'?0.04:0.08)), { kind:'fire' }); } }
      sfx('boom'); W.shake(0.12);
    }
  }
  // spawns
  if(G.phase==='wave'){
    G.spawnT += dt;
    while(G.queue.length && G.queue[0].at <= G.spawnT){ spawn(G.queue.shift().type); }
  }else if(G.phase==='build' && G.buildTimer > 0){
    G.buildTimer -= dt;
    if(G.buildTimer <= 0){ G.buildTimer = 0; callWave(); }
  }
  // enemies
  for(const e of G.enemies){
    if(e.dead) continue;
    if(e.slowT>0){ e.slowT -= dt; if(e.slowT<=0){ e.slow = 0; } }
    if(e.frozen>0) e.frozen -= dt;
    if(e.stun>0) e.stun -= dt;
    if(e.bshieldT>0){ e.bshieldT -= dt; if(e.bshieldT<=0 && e.bshield>0){ e.bshield = 0; W.bubble(e.mesh, false); } }
    if(e.burn>0){ e.burn -= dt; hit(e, e.burnDps*dt, { kind:'fire' }); if(Math.random()<dt*8) W.burst(e.pos.x, e.pos.y+0.4, e.pos.z, 0xff8c42, 1, 1.0, 0.5, 2.0, -1, 1.2); if(e.dead) continue; }
    if(e.type==='boss') bossPhases(e);
    if(e.d.heal){ e.healT += dt; if(e.healT >= 1){ e.healT = 0; for(const o of G.enemies){ if(o.dead||o===e||o.hp>=o.maxHp) continue; if(o.pos.distanceTo(e.pos) < 1.7){ o.hp = Math.min(o.maxHp, o.hp + Math.round(o.maxHp*e.d.heal)); W.burst(o.pos.x, o.pos.y+0.6, o.pos.z, 0x52e07a, 5, 1.2, 0.6, 2.2, -1.5, 1.2); } } } }
    const stopped = e.frozen > 0 || e.stun > 0;
    let left = stopped ? 0 : e.speed*(1-e.slow)*dt;
    while(left>0 && e.seg < e.route.length-1){
      const nxt = e.route[e.seg+1]; const dx = nxt.x-e.pos.x, dz = nxt.z-e.pos.z, L = Math.hypot(dx,dz);
      if(L<=left){ e.pos.x = nxt.x; e.pos.z = nxt.z; left -= L; e.dist += L; e.seg++; if(e.seg===e.route.length-1) e.reached = true; }
      else { e.pos.x += dx/L*left; e.pos.z += dz/L*left; e.dist += left; e.yaw = Math.atan2(dx, dz); left = 0; }
    }
    if(e.reached && !e.dead){
      e.dead = true; if(e.type==='boss'||e.type==='miniboss') G.bossAlive--;
      const c = G.map.castle.position;
      if(e.d.steal){ const s = Math.min(G.gold, e.d.steal); G.gold -= s; toast('💰 Gold Thief stole '+s+' gold!', 'bad'); sfx('steal'); W.burst(c.x, 0.9, c.z, 0xffd54a, 20, 2.4, 0.6, 3, 5, 1.6); }
      else { G.lives -= e.lives; G.livesLost += e.lives; sfx('life'); W.burst(c.x, 0.9, c.z, 0xff4b5c, 30, 2.8, 0.6, 3.5, 5, 1.6); W.shake(0.2); toast('-'+e.lives+(e.lives>1?' lives':' life'), 'bad');
        if(G.lives <= 0){ G.lives = 0; finish(false); } }
    }
  }
  // towers
  for(const t of G.towers){
    if(t.pop < 1){ t.pop = Math.min(1, t.pop + dt*4); const s = 0.01 + 0.99*(1 - Math.pow(1-t.pop, 3)); t.mesh.scale.setScalar(t.level>1 ? 0.7+0.3*s : s); }
    t.cool -= dt;
    if(!t.target || t.target.dead || !inRange(t, t.target, stat(t,'range'))){ const nt = pickTarget(t); if(nt!==t.target) t.ramp = 1; t.target = nt; }
    if(t.target){
      const dx = t.target.pos.x-t.x, dz = t.target.pos.z-t.z, want = Math.atan2(dx, dz);
      let diff = want - t.mesh.head.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      t.mesh.head.rotation.y += diff*Math.min(1, dt*14);
      if(t.beams) laserTick(t, dt);
      else if(t.cool <= 0 && Math.abs(diff) < 0.5){ fire(t, t.target); t.cool = 1/stat(t,'rate'); }
    } else if(t.beams) laserTick(t, dt);
    if(t.mesh.spin){ t.mesh.spin.rotation.y += dt*(t.type==='frost'?1.4:3); if(t.type==='frost') t.mesh.spin.rotation.x += dt*0.8; }
  }
  // projectiles
  for(let i=G.projs.length-1;i>=0;i--){
    const p = G.projs[i]; let done = false;
    if(p.kind==='shell' || p.kind==='meteor'){
      p.t += dt/p.dur; const k = Math.min(1,p.t);
      p.mesh.position.lerpVectors(p.from, p.to, k); if(p.kind==='shell') p.mesh.position.y += p.arc*4*k*(1-k); else { p.mesh.rotation.x += dt*9; p.mesh.rotation.z += dt*7; if(Math.random()<dt*40) W.burst(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0xff8c42, 2, 1.5, 0.4, 3, 0, 1.4); }
      if(p.t >= 1){
        const c = p.to;
        if(p.kind==='meteor'){
          W.burst(c.x, 0.3, c.z, 0xff8c42, 90, 5, 0.8, 5, 5, 1.8); W.burst(c.x, 0.3, c.z, 0xffe14b, 40, 3.5, 0.6, 4, 4, 1.6); W.burst(c.x, 0.2, c.z, 0x4a4a4a, 30, 2.2, 1.2, 6, 2, 1.4);
          for(const e of G.enemies){ if(e.dead) continue; const dd = Math.hypot(e.pos.x-c.x, e.pos.z-c.z); if(dd <= p.splash+e.d.size) hit(e, Math.round(p.dmg*(dd<p.splash*0.5?1:0.6)), { kind:'meteor' }); }
          sfx('bigboom'); W.shake(0.55); W.hideMarker();
        }else{
          W.burst(c.x, 0.25, c.z, p.burn?0xff5a1a:0xff8c42, 26, 3.2, 0.5, 4, 5, 1.4); W.burst(c.x, 0.2, c.z, 0x4a4a4a, 14, 1.6, 0.9, 5, 2, 1.2);
          for(const e of G.enemies){ if(e.dead||e.air||e.ghost) continue; const dd = Math.hypot(e.pos.x-c.x, e.pos.z-c.z); if(dd <= p.splash+e.d.size){ hit(e, Math.round(p.dmg*(dd<p.splash*0.5?1:0.6)), { kind:'phys', src:p.src }); if(p.burn && !e.dead){ e.burn = Math.max(e.burn, 3); e.burnDps = Math.max(e.burnDps, p.dmg*0.22); } } }
          sfx('boom'); W.shake(0.1);
        }
        done = true;
      }
    }else{
      const e = p.target; p.life -= dt;
      if(!e || e.dead || p.life<=0){ done = true; }
      else{
        _v.set(e.pos.x, e.pos.y + e.d.size*1.3, e.pos.z).sub(p.pos); const L = _v.length(), mv = p.speed*dt;
        if(L <= mv+0.12){
          hit(e, p.dmg, { kind: p.kind==='ice'?'ice':'phys', src:p.src });
          if(p.slow && !e.dead){ applySlow(e, p.slow, p.slowT, p.src); W.burst(e.pos.x, e.pos.y+0.3, e.pos.z, 0xbdf3ff, 8, 1.2, 0.5, 2.2, 1, 1.2); }
          else W.burst(e.pos.x, e.pos.y+0.35, e.pos.z, 0xffe6a0, 5, 1.4, 0.2, 1.6, 2, 1.2);
          done = true;
        }else{
          p.pos.addScaledVector(_v, mv/L); p.mesh.position.copy(p.pos);
          if(p.kind==='arrow') p.mesh.lookAt(_v2.set(e.pos.x, e.pos.y + e.d.size*1.3, e.pos.z)); else p.mesh.rotation.y += dt*8;
        }
      }
    }
    if(done){ W.freeProj(p.kind, p.mesh); G.projs.splice(i,1); }
  }
  // dead enemies out, meshes updated
  for(let i=G.enemies.length-1;i>=0;i--){
    const e = G.enemies[i];
    if(e.dead){ W.remove(e.mesh); G.enemies.splice(i,1); continue; }
    e.mesh.position.x = e.pos.x; e.mesh.position.z = e.pos.z; if(!e.air && !e.mesh.baseY) e.mesh.position.y = 0;
    if(e.yaw!=null) e.mesh.rotation.y = e.yaw;
    W.animateEnemy(e.mesh, G.t + e.dist, !(e.frozen>0||e.stun>0));
    e.mesh.fill.scale.x = Math.max(0.001, e.hp/e.maxHp);
    e.mesh.fill.material.color.set(e.hp/e.maxHp > 0.5 ? 0x52e07a : (e.hp/e.maxHp > 0.25 ? 0xffc857 : 0xff4b5c));
    if(e.mesh.shieldFill) e.mesh.shieldFill.scale.x = Math.max(0.001, e.shield/(e.shieldMax||1));
    // tint: hit flash, frozen, burning, enraged
    const m = e.mesh.bodyM;
    if(e.flash>0){ e.flash -= dt; e.mesh.torso.scale.setScalar(1.18); m.emissive.setHex(0xffffff); m.emissiveIntensity = 0.45; }
    else { e.mesh.torso.scale.set(1,1.15,0.9);
      if(e.frozen>0){ m.color.setHex(0xbdf3ff); m.emissive.setHex(0x7fd4ff); m.emissiveIntensity = 0.35; }
      else if(e.burn>0){ m.color.copy(e.mesh.baseColor); m.emissive.setHex(0xff5a1a); m.emissiveIntensity = 0.5; }
      else if(e.enraged){ m.color.copy(e.mesh.baseColor); m.emissive.setHex(0xff2020); m.emissiveIntensity = 0.55; }
      else { m.color.copy(e.mesh.baseColor); m.emissive.setHex(e.type==='boss'||e.type==='miniboss' ? e.d.color : 0x000000); m.emissiveIntensity = 0.25; } }
    if(e.slow>0 && Math.random()<dt*6) W.burst(e.pos.x, e.pos.y+0.25, e.pos.z, 0xbdf3ff, 1, 0.5, 0.5, 1.6, 0.5, 1);
    if(e.frozen>0 && Math.random()<dt*4) W.burst(e.pos.x, e.pos.y+0.5, e.pos.z, 0xffffff, 1, 0.4, 0.6, 1.8, 0.2, 1);
  }
  if(G.phase==='wave' && !G.queue.length && !G.enemies.length && !G.over) waveCleared();
}

// ---- end of match ----------------------------------------------------
function finish(won){
  if(G.over) return;
  G.over = true; G.won = won; G.phase = 'over'; G.buildType = null; G.targetMode = null; deselect(); W.hideGhost(); W.hideMarker();
  G.towers.forEach(t=>{ if(t.beams) t.beams.forEach(b=>b.visible=false); });
  const ms = mapSave(G.map.id);
  const stars = won ? (G.livesLost === 0 ? 3 : (G.lives >= 10 ? 2 : 1)) : 0;
  if(won) ms.stars = Math.max(ms.stars, stars);
  const wavesDone = won ? G.wave : Math.max(0, G.wave-1);
  ms.best = Math.max(ms.best, wavesDone);
  if(won && G.livesLost===0) chMark('flawless');
  // xp, coins, level
  const lvBefore = plevel();
  const xp = TD.gameXp(wavesDone, G.kills, won, stars), coins = TD.gameCoins(wavesDone, won, stars);
  SAVE.xp += xp; SAVE.coins += coins; persist(); chCheck();
  const lvAfter = plevel();
  if(typeof window.onGameplayStop==='function') window.onGameplayStop();
  sfx(won?'win':'lose');
  const r = $('result'); r.className = 'ov '+(won?'win':'lose');
  $('resTitle').textContent = won ? (G.endless ? 'ENDLESS RUN OVER' : 'VICTORY!') : (G.endless ? 'ENDLESS RUN OVER' : 'DEFEAT');
  $('resSub').textContent = won ? G.map.name+' defended' : (G.endless ? 'You held '+G.map.name+' for '+wavesDone+' waves' : 'The castle fell on wave '+G.wave);
  $('resStars').innerHTML = won ? [1,2,3].map(i=>'<span class="'+(i<=stars?'on':'')+'">★</span>').join('') : '';
  $('resStats').innerHTML = [['Waves', wavesDone],['Kills', G.kills],['Gold', G.earned],['XP', '+'+xp],['Coins', '+'+coins]].map(([l,v])=>'<div><b>'+v+'</b><span>'+l+'</span></div>').join('');
  const lu = $('resLevel');
  if(lvAfter > lvBefore){ const un = TD.UNLOCKS.filter(u=>u.level>lvBefore && u.level<=lvAfter).map(u=>u.text); lu.innerHTML = '<b>LEVEL UP → '+lvAfter+'</b>'+(un.length?'<span>Unlocked: '+un.join(', ')+'</span>':''); lu.style.display=''; setTimeout(()=>sfx('level'), 600); }
  else { const li = TD.levelOf(SAVE.xp); lu.innerHTML = '<span>Level '+li.level+' · '+li.into+' / '+li.need+' XP</span>'; lu.style.display=''; }
  const next = G.mapIdx+1 < TD.MAPS.length;
  $('resNext').style.display = (won && next && !G.endless) ? '' : 'none';
  $('resEndless').style.display = (won && !G.endless) ? '' : 'none';
  $('resRetry').textContent = won ? 'PLAY AGAIN' : 'TRY AGAIN';
  setTimeout(()=>r.classList.add('show'), 50);
}

// ---- in-game UI ------------------------------------------------------
function renderHud(){
  $('hGold').textContent = G.gold; $('hLives').textContent = G.lives;
  $('hWave').textContent = (G.phase==='build' ? Math.min(G.wave+1, G.endless?999:G.map.waves) : G.wave) + (G.endless ? '' : ' / '+G.map.waves);
  $('hLives').parentElement.classList.toggle('low', G.lives <= 5);
}
function renderBuildBar(){
  const bar = $('buildBar');
  if(!bar.children.length){
    bar.innerHTML = TD.TOWER_ORDER.map((k,i)=>{ const d = TOWERS[k]; return '<button class="tcard" data-type="'+k+'"><span class="ticon">'+d.icon+'</span><span class="tname">'+d.name+'</span><span class="tcost">'+d.cost+'</span><span class="tkey">'+(i+1)+'</span><span class="tlock">🔒 Lv '+(d.unlock||'')+'</span></button>'; }).join('');
    bar.querySelectorAll('.tcard').forEach(b=>b.addEventListener('click', ()=>{ unlockAudio(); setBuildType(b.dataset.type); }));
  }
  bar.querySelectorAll('.tcard').forEach(b=>{ const d = TOWERS[b.dataset.type]; b.classList.toggle('on', G.buildType===b.dataset.type); b.classList.toggle('poor', G.gold < d.cost); b.classList.toggle('locked', !towerUnlocked(b.dataset.type)); });
  $('buildHint').textContent = G.targetMode ? '☄️ Tap where the meteor should land' : (G.buildType ? 'Tap a free tile to place the '+TOWERS[G.buildType].name+' · '+TOWERS[G.buildType].desc : '');
}
function renderAbilities(){
  const bar = $('abilBar');
  if(!bar.children.length){
    bar.innerHTML = TD.ABILITIES.map(a=>'<button class="abtn" data-id="'+a.id+'" title="'+a.desc+'"><span class="aic">'+a.icon+'</span><span class="acd"></span><span class="alk">Lv '+a.unlock+'</span></button>').join('');
    bar.querySelectorAll('.abtn').forEach(b=>b.addEventListener('click', ()=>{ unlockAudio(); useAbility(b.dataset.id); }));
  }
  bar.querySelectorAll('.abtn').forEach(b=>{ const a = TD.ABILITIES.find(x=>x.id===b.dataset.id); const cd = G.cd[a.id]||0;
    b.classList.toggle('locked', !abilityUnlocked(a)); b.classList.toggle('cool', cd>0); b.classList.toggle('on', G.targetMode===a.id);
    b.querySelector('.acd').textContent = cd>0 ? Math.ceil(cd)+'s' : ''; b.style.setProperty('--cd', cd>0 ? (cd/a.cd*100)+'%' : '0%'); });
}
function renderPanel(){
  const p = $('panel'), t = G.sel;
  if(!t){ p.classList.remove('show'); return; }
  const d = TOWERS[t.type], lv = t.level, nxt = lv<3, b = branchOf(t);
  $('pName').textContent = d.icon+' '+d.name+(b?' · '+b.icon+' '+b.name:''); $('pLvl').textContent = 'Level '+lv+(lv===3?' · MAX':'');
  const fmt = (k,v)=> v==null ? '' : (typeof v==='string' ? v : (k==='rate' ? (+v).toFixed(1)+'/s' : (k==='slow' ? Math.round(v*100)+'%' : (Math.round(v*10)/10))));
  const row = (l,k,a,bv)=>'<div class="prow"><span>'+l+'</span><b>'+fmt(k,a)+(bv!=null?' <i>→ '+fmt(k,bv)+'</i>':'')+'</b></div>';
  const nextVal = key => nxt && lv===1 ? d[key][1] : null;
  let s = row(d.proj==='beam'?'Damage/s':'Damage','dmg',stat(t,'dmg'),nextVal('dmg')) + row('Range','range',stat(t,'range'),nextVal('range'));
  if(d.proj!=='beam') s += row('Rate','rate',stat(t,'rate'),nextVal('rate'));
  if(d.splash) s += row('Splash','splash',stat(t,'splash'),nextVal('splash'));
  if(d.slow) s += row('Slow','slow',stat(t,'slow'),nextVal('slow'));
  if(d.chain) s += row('Chain','chain',stat(t,'chain'),nextVal('chain'));
  s += row('Targets','x',(d.ground?'Ground':'')+(d.ground&&d.air?' + ':'')+(d.air?'Air':''));
  s += row('Kills','x',t.kills, null);
  $('pStats').innerHTML = s;
  const up = $('pUp'), br = $('pBranch');
  if(lv===1){ const c = towerCost(t.type, 2); up.style.display=''; br.style.display='none'; up.textContent = 'UPGRADE  '+c; up.disabled = G.gold < c; }
  else if(lv===2){ const c = towerCost(t.type, 3); up.style.display='none'; br.style.display='';
    br.innerHTML = '<div class="brTitle">Choose a specialization · '+c+' 💰</div>'+d.branches.map((x,i)=>'<button class="brbtn" data-i="'+i+'" '+(G.gold<c?'disabled':'')+'><b>'+x.icon+' '+x.name+'</b><span>'+x.desc+'</span></button>').join('');
    br.querySelectorAll('.brbtn').forEach(x=>x.addEventListener('click', ()=>upgrade(t, +x.dataset.i))); }
  else { up.style.display='none'; br.style.display='none'; }
  $('pSell').textContent = 'SELL  +'+Math.round(towerValue(t)*TD.SELL_RATE);
  p.classList.add('show');
}
function renderWaveBtn(){
  const b = $('waveBtn');
  if(G.phase!=='build' || G.over){ b.classList.remove('show'); return; }
  b.classList.add('show');
  const n = G.wave+1, groups = TD.genWave(G.mapIdx, n);
  $('wbTitle').textContent = (n===1?'START':'SEND')+' WAVE '+n;
  $('wbSub').textContent = TD.waveLabel(groups);
  $('wbTimer').textContent = G.buildTimer > 0 ? Math.ceil(G.buildTimer)+'s  ·  +'+Math.round(G.buildTimer*1.5)+' gold now' : 'Ready when you are';
}
function syncSpeed(){ document.querySelectorAll('.spd').forEach(b=>b.classList.toggle('on', +b.dataset.s===G.speed)); }
function syncToggles(){
  const set = (id, off) => { const el = $(id); if(el) el.classList.toggle('off', off); };
  set('sndBtn', SAVE.muted); set('sSound', SAVE.muted); set('sMusic', !SAVE.music); set('sNums', !SAVE.nums); set('sQuality', SAVE.quality==='low');
}

// ---- menu ------------------------------------------------------------
function showPanel(id){
  document.querySelectorAll('.mpanel').forEach(p=>p.classList.toggle('show', p.id==='mp-'+id));
  if(id==='maps') renderMaps(); if(id==='towers') renderTowers(); if(id==='challenges') renderChallenges(); if(id==='skins') renderSkins(); if(id==='settings') syncToggles();
  renderProfile();
}
function renderProfile(){
  const li = TD.levelOf(SAVE.xp);
  $('prLevel').textContent = li.level; $('prXp').textContent = li.into+' / '+li.need+' XP'; $('prFill').style.width = Math.max(2, Math.round(li.into/li.need*100))+'%';
  $('prCoins').textContent = SAVE.coins;
  const nextU = TD.UNLOCKS.find(u=>u.level>li.level); $('prNext').textContent = nextU ? 'Level '+nextU.level+': '+nextU.text : 'Everything unlocked';
  const stars = TD.MAPS.reduce((a,m)=>a+mapSave(m.id).stars,0); $('prStars').textContent = stars+' / '+(TD.MAPS.length*3);
  const nc = TD.CHALLENGES.filter(c=>SAVE.ch[c.id]&&SAVE.ch[c.id].done).length; $('mChBadge').textContent = nc+'/'+TD.CHALLENGES.length;
}
function renderMaps(){
  const host = $('mapCards');
  host.innerHTML = TD.MAPS.map((m,i)=>{
    const s = mapSave(m.id), open = unlocked(i);
    return '<button class="mapCard theme-'+m.theme+(open?'':' locked')+(i===G.mapIdx?' on':'')+'" data-i="'+i+'">'+
      '<span class="mcName">'+m.name+'</span><span class="mcSub">'+m.waves+' waves · boss: '+m.boss+(s.best?' · best '+s.best:'')+'</span>'+
      '<span class="mcEff">'+m.effectText+'</span>'+
      '<span class="mcStars">'+[1,2,3].map(k=>'<i class="'+(k<=s.stars?'on':'')+'">★</i>').join('')+'</span>'+
      (open?'':'<span class="mcLock">🔒 Win the previous map</span>')+'</button>';
  }).join('');
  host.querySelectorAll('.mapCard').forEach(b=>b.addEventListener('click', ()=>{ const i = +b.dataset.i; if(!unlocked(i)){ sfx('nope'); return; } G.mapIdx = i; sfx('click'); renderMaps(); }));
  $('playBtn').textContent = 'PLAY  ·  '+TD.MAPS[G.mapIdx].name;
}
function renderTowers(){
  const lv = plevel();
  $('towerList').innerHTML = TD.TOWER_ORDER.map(k=>{ const d = TOWERS[k]; const locked = d.unlock && lv < d.unlock;
    return '<div class="tinfo'+(locked?' locked':'')+'"><div class="tiHead"><span class="tiIcon">'+d.icon+'</span><div><b>'+d.name+'</b><span>'+d.desc+'</span></div><em>'+(locked?'🔒 Lv '+d.unlock:d.cost+' 💰')+'</em></div>'+
      '<div class="tiStats">Damage '+d.dmg.join(' / ')+' · Range '+d.range.join(' / ')+(d.proj!=='beam'?' · Rate '+d.rate.join(' / '):'')+'</div>'+
      '<div class="tiBr">'+d.branches.map(b=>'<span><b>'+b.icon+' '+b.name+'</b> '+b.desc+'</span>').join('')+'</div></div>'; }).join('')+
    '<div class="tiEnemies"><b>Enemies to watch</b>'+Object.keys(ENEMIES).filter(k=>ENEMIES[k].note).map(k=>'<span>'+ENEMIES[k].name+' — '+ENEMIES[k].note+'</span>').join('')+
    '<span>Boss — enrages at 50% health, calls for help at 25%, raises a shield at 10%.</span></div>';
}
function renderChallenges(){
  $('chList').innerHTML = TD.CHALLENGES.map(c=>{ const e = SAVE.ch[c.id]||{p:0,done:false}; const v = Math.min(c.goal, chValue(c)); const pct = Math.round(v/c.goal*100);
    return '<div class="chItem'+(e.done?' done':'')+'"><span class="chIcon">'+c.icon+'</span><div class="chBody"><b>'+c.name+(e.done?' ✓':'')+'</b><span>'+c.desc+'</span>'+
      '<div class="chBar"><i style="width:'+(e.done?100:pct)+'%"></i></div></div><em>'+(e.done?'DONE':v+'/'+c.goal)+'<small>+'+c.coins+' 💰 +'+c.xp+' XP</small></em></div>'; }).join('');
}
function renderSkins(){
  $('skinCoins').textContent = SAVE.coins;
  $('skinList').innerHTML = TD.SKINS.map(s=>{ const owned = SAVE.skins.owned.includes(s.id), sel = SAVE.skins.sel[s.tower]===s.id; const d = TOWERS[s.tower];
    return '<div class="skin'+(sel?' sel':'')+'"><span class="skSw" style="background:linear-gradient(135deg,#'+s.color.toString(16).padStart(6,'0')+',#'+s.accent.toString(16).padStart(6,'0')+')">'+d.icon+'</span>'+
      '<b>'+s.icon+' '+s.name+'</b><span>'+d.name+' skin</span>'+
      (sel?'<button class="skbtn on" data-id="'+s.id+'" data-act="unsel">EQUIPPED</button>':(owned?'<button class="skbtn" data-id="'+s.id+'" data-act="sel">EQUIP</button>':'<button class="skbtn buy" data-id="'+s.id+'" data-act="buy" '+(SAVE.coins<s.cost?'disabled':'')+'>BUY '+s.cost+' 💰</button>'))+'</div>'; }).join('');
  $('skinList').querySelectorAll('.skbtn').forEach(b=>b.addEventListener('click', ()=>{
    const s = TD.SKINS.find(x=>x.id===b.dataset.id), act = b.dataset.act;
    if(act==='buy'){ if(SAVE.coins < s.cost){ sfx('nope'); return; } SAVE.coins -= s.cost; SAVE.skins.owned.push(s.id); SAVE.skins.sel[s.tower] = s.id; sfx('coin'); }
    else if(act==='sel'){ SAVE.skins.sel[s.tower] = s.id; sfx('click'); }
    else { delete SAVE.skins.sel[s.tower]; sfx('click'); }
    persist(); renderSkins(); renderProfile();
  }));
}
function openMenu(){
  G.phase = 'menu'; G.started = false; G.paused = false;
  if(typeof window.onGameplayStop==='function') window.onGameplayStop();
  $('app').classList.add('menu'); $('menu').classList.remove('hide'); $('result').classList.remove('show'); $('pauseWrap').classList.remove('show'); $('stormFx').classList.remove('show');
  W.hideRing(); W.hideGhost(); W.hideMarker(); numsClear(); showPanel('home');
}
function setPaused(p){
  if(G.phase==='menu' || G.over) return;
  G.paused = p; $('pauseWrap').classList.toggle('show', p);
  if(p && typeof window.onGameplayStop==='function') window.onGameplayStop();
  if(!p && typeof window.onGameplayStart==='function') window.onGameplayStart();
}

// ---- input -----------------------------------------------------------
let pdown = null;
function onPointerDown(e){
  if(e.target.closest('button, .card, input, #panel, #buildWrap, #waveBtn, #hud, #abilBar')) return;
  pdown = { x:e.clientX, y:e.clientY, id:e.pointerId };
}
function onPointerUp(e){
  if(!pdown || pdown.id!==e.pointerId) return;
  const moved = Math.hypot(e.clientX-pdown.x, e.clientY-pdown.y); pdown = null;
  if(moved > 10 || G.phase==='menu' || G.over || G.paused) return;
  unlockAudio();
  const p = W.pick(e.clientX, e.clientY);
  if(!p){ deselect(); return; }
  if(G.targetMode){ if(inside(p.cx,p.cz) || true){ castAbility(G.targetMode, new (window.THREE.Vector3)(p.x, 0.1, p.z)); renderBuildBar(); } return; }
  const t = G.grid.get(p.cx+','+p.cz);
  if(t){ if(G.sel===t) deselect(); else select(t); return; }
  if(G.buildType){ if(cellFree(p.cx,p.cz)) build(G.buildType, p.cx, p.cz); else if(inside(p.cx,p.cz)) { toast('Can\'t build on the road', 'bad'); sfx('nope'); } return; }
  deselect();
}
function onPointerMove(e){
  if(e.pointerType!=='mouse' || G.phase==='menu' || G.over) return;
  if(e.target.closest('button, #panel, #buildWrap, #waveBtn, #hud, #abilBar')){ W.hideGhost(); if(!G.sel) W.hideRing(); return; }
  const p = W.pick(e.clientX, e.clientY);
  if(!p){ W.hideGhost(); return; }
  if(G.targetMode){ W.showMarker(p.x, p.z, 1.9); return; }
  const t = G.grid.get(p.cx+','+p.cz);
  if(G.buildType){
    const ok = cellFree(p.cx,p.cz) && G.gold >= TOWERS[G.buildType].cost;
    if(inside(p.cx,p.cz)){ W.showGhost(p.cx,p.cz, ok); W.showRing(p.cx+0.5, p.cz+0.5, TOWERS[G.buildType].range[0]*(G.storm.active?0.75:1), ok); } else { W.hideGhost(); if(!G.sel) W.hideRing(); }
  }else if(t && t!==G.sel){ W.showRing(t.x, t.z, stat(t,'range'), true); }
  else if(!G.sel){ W.hideRing(); }
}
function onKey(e){
  if(G.phase==='menu'){ if(e.code==='Enter'||e.code==='Space'){ e.preventDefault(); if($('mp-maps').classList.contains('show')) $('playBtn').click(); else $('mPlay').click(); } return; }
  if(e.code==='KeyP' || (e.code==='Escape' && G.paused)){ setPaused(!G.paused); return; }
  if(G.over || G.paused) return;
  const n = parseInt(e.key,10);
  if(n>=1 && n<=6){ setBuildType(TD.TOWER_ORDER[n-1]); return; }
  if(e.code==='Escape'){ if(G.targetMode){ G.targetMode=null; W.hideMarker(); renderAbilities(); renderBuildBar(); } else if(G.buildType) setBuildType(null); else deselect(); W.hideGhost(); return; }
  if(e.code==='Space' || e.code==='Enter'){ e.preventDefault(); callWave(); return; }
  if(e.code==='KeyU' && G.sel && G.sel.level===1) upgrade(G.sel);
  if(e.code==='KeyX' && G.sel) sell(G.sel);
  if(e.code==='KeyQ'){ G.speed = G.speed===1?2:(G.speed===2?3:1); syncSpeed(); }
  if(e.code==='KeyZ') useAbility('meteor'); if(e.code==='KeyC') useAbility('freeze'); if(e.code==='KeyV') useAbility('chain');
}

// ---- loop ------------------------------------------------------------
let uiT = 0;
function loop(now){
  G.raf = requestAnimationFrame(loop);
  if(W.sizeChanged()) W.resize();
  let dt = (now - G.last)/1000; G.last = now; if(!(dt>0)) dt = 0; if(dt > 0.1) dt = 0.1;
  if(!G.firstFrame){ G.firstFrame = true; setLoad(1); }
  if(G.phase!=='menu' && !G.paused && !G.over){
    let sim = dt*G.speed;
    while(sim > 0){ const h = Math.min(sim, 1/60); step(h); sim -= h; }
  }
  W.tick(dt, now/1000);
  if(G.phase!=='menu') numsTick(dt*G.speed);
  uiT += dt;
  if(uiT > 0.15){ uiT = 0; if(G.phase!=='menu'){ renderHud(); if(G.phase==='build') renderWaveBtn(); renderAbilities();
    if(G.sel){ const up=$('pUp'); if(up.style.display!=='none') up.disabled = G.gold < towerCost(G.sel.type, G.sel.level+1); if(G.sel.level===2){ const c = towerCost(G.sel.type,3); $('pBranch').querySelectorAll('.brbtn').forEach(b=>b.disabled = G.gold < c); } }
    renderBuildBarPoor(); } }
  W.render();
}
function renderBuildBarPoor(){ $('buildBar').querySelectorAll('.tcard').forEach(b=>b.classList.toggle('poor', G.gold < TOWERS[b.dataset.type].cost)); }

// ---- loading screen --------------------------------------------------
const LOAD = { cur:0, target:0, done:false };
function setLoad(p){ LOAD.target = Math.max(LOAD.target, Math.min(1,p)); }
function loadTick(){
  if(LOAD.done) return;
  LOAD.cur += (LOAD.target - LOAD.cur)*0.18 + 0.004;
  if(LOAD.cur > LOAD.target) LOAD.cur = LOAD.target;
  $('loadFill').style.width = (LOAD.cur*100)+'%'; $('loadPct').textContent = Math.round(LOAD.cur*100)+'%';
  if(LOAD.cur >= 0.999 && LOAD.target >= 1){ LOAD.done = true; const el = $('loadWrap'); el.classList.add('gone'); setTimeout(()=>{ el.style.display='none'; }, 600); if(typeof window.onGameLoaded==='function') window.onGameLoaded(); return; }
  setTimeout(loadTick, 40);
}

// ---- boot ------------------------------------------------------------
function boot(){
  loadSave();
  W.init($('mount'), SAVE.quality);
  G.mapIdx = 0; for(let i=TD.MAPS.length-1;i>=0;i--){ if(unlocked(i)){ G.mapIdx = i; break; } }
  W.buildMap(TD.MAPS[G.mapIdx]); G.map = TD.MAPS[G.mapIdx];
  renderBuildBar(); renderAbilities(); showPanel('home');
  // menu navigation
  document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click', ()=>{ unlockAudio(); sfx('click'); showPanel(b.dataset.panel); }));
  $('playBtn').addEventListener('click', ()=>{ unlockAudio(); startMap(G.mapIdx, false); });
  $('sVol').addEventListener('input', e=>{ unlockAudio(); setVolume(e.target.value/100); $('sVolVal').textContent = e.target.value+'%'; });
  $('sSound').addEventListener('click', ()=>{ unlockAudio(); setMuted(!SAVE.muted); });
  $('sMusic').addEventListener('click', ()=>{ unlockAudio(); setMusic(!SAVE.music); });
  $('sNums').addEventListener('click', ()=>{ SAVE.nums = !SAVE.nums; persist(); syncToggles(); });
  $('sQuality').addEventListener('click', ()=>{ SAVE.quality = SAVE.quality==='low' ? 'high' : 'low'; persist(); W.setQuality(SAVE.quality); syncToggles(); });
  $('sReset').addEventListener('click', ()=>{ if(confirm('Reset all progress (stars, level, coins, skins)?')){ localStorage.removeItem(SAVE_KEY); localStorage.removeItem('td.save.v1'); location.reload(); } });
  $('sVol').value = Math.round(SAVE.vol*100); $('sVolVal').textContent = Math.round(SAVE.vol*100)+'%';
  $('sndBtn').addEventListener('click', ()=>{ unlockAudio(); setMuted(!SAVE.muted); });
  $('pauseBtn').addEventListener('click', ()=>setPaused(!G.paused));
  $('resumeBtn').addEventListener('click', ()=>setPaused(false));
  $('pMenuBtn').addEventListener('click', ()=>{ window.gameAdBreak && window.gameAdBreak(); openMenu(); });
  $('menuBtn').addEventListener('click', ()=>setPaused(true));
  document.querySelectorAll('.spd').forEach(b=>b.addEventListener('click', ()=>{ G.speed = +b.dataset.s; syncSpeed(); sfx('click'); }));
  $('waveBtn').addEventListener('click', ()=>{ unlockAudio(); callWave(); });
  $('pUp').addEventListener('click', ()=>upgrade(G.sel));
  $('pSell').addEventListener('click', ()=>sell(G.sel));
  $('pClose').addEventListener('click', deselect);
  $('resRetry').addEventListener('click', ()=>{ window.gameAdBreak && window.gameAdBreak(); startMap(G.mapIdx, false); });
  $('resNext').addEventListener('click', ()=>{ window.gameAdBreak && window.gameAdBreak(); startMap(G.mapIdx+1, false); });
  $('resEndless').addEventListener('click', ()=>{ G.over = false; G.won = false; G.endless = true; G.phase = 'build'; G.buildTimer = TD.BUILD_TIME; $('result').classList.remove('show'); renderHud(); renderWaveBtn(); if(typeof window.onGameplayStart==='function') window.onGameplayStart(); });
  $('resMenu').addEventListener('click', ()=>{ window.gameAdBreak && window.gameAdBreak(); openMenu(); });
  const mount = $('mount');
  mount.addEventListener('pointerdown', onPointerDown);
  addEventListener('pointerup', onPointerUp);
  addEventListener('pointermove', onPointerMove);
  addEventListener('keydown', onKey);
  mount.addEventListener('touchmove', e=>e.preventDefault(), {passive:false});
  mount.addEventListener('contextmenu', e=>e.preventDefault());
  addEventListener('resize', ()=>W.resize());
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden && G.phase!=='menu' && !G.over) setPaused(true); });
  syncToggles();
  setLoad(0.9);
  G.last = performance.now(); G.raf = requestAnimationFrame(loop);
}

window.addEventListener('DOMContentLoaded', ()=>{
  setLoad(0.15); loadTick();
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>setLoad(0.4)); else setLoad(0.4);
  const t0 = performance.now();
  const wait = ()=>{
    if(window.THREE) setLoad(0.65);
    const sized = innerWidth>0 || $('mount').clientWidth>0;
    if(window.THREE && (sized || performance.now()-t0>2500)) boot(); else setTimeout(wait, 60);
  };
  wait();
});

// dev hooks (harmless in production): step the simulation from the console
TD.dbg = { step:(dt)=>step(dt), frame:()=>loop(performance.now()), start:startMap, callWave, build, upgrade, sell, finish, openMenu, sfx, castAbility, save:()=>SAVE, spawn, hit };

// ---- portal integration ----------------------------------------------
window.gamePauseForAd = function(on){
  on = !!on; if(on===G.adPaused) return; G.adPaused = on;
  if(on){ if(G.raf){ cancelAnimationFrame(G.raf); G.raf = 0; } try{ if(AC && AC.state==='running') AC.suspend(); }catch(e){} }
  else{ try{ if(AC && AC.state==='suspended') AC.resume(); }catch(e){} G.last = performance.now(); if(!G.raf) G.raf = requestAnimationFrame(loop); }
};
window.gameIsPaused = function(){ return G.adPaused; };
window.gameShowAd = window.gameShowAd || null;
window.gameAdBreak = function(){ if(typeof window.gameShowAd==='function'){ try{ window.gameShowAd(); }catch(e){} } };
})();

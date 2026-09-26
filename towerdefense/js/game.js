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
const STAT0 = { kills:0, killsBy:{}, bosses:0, abilities:0, frozen:0, ghosts:0, early:0, crits:0, trees:0, secrets:0, nightKills:0, heroKills:0 };

const G = {
  phase:'menu', map:null, mapIdx:0, gold:0, lives:0, wave:0, endless:false,
  towers:[], grid:new Map(), enemies:[], projs:[], queue:[], buildTimer:-1,
  speed:1, paused:false, adPaused:false, sel:null, buildType:null, targetMode:null,
  t:0, kills:0, earned:0, started:false, raf:0, last:0, over:false, won:false,
  cd:{}, storm:{active:false, timer:0}, lavaT:0, livesLost:0, builtTypes:new Set(), bossAlive:0,
  mode:'normal', rule:null, fires:[], objs:new Map(), slowmo:0, overdrive:0, surge:0, surgeT:0, waves:30, boss:null,
  night:false, nightK:0, weather:'clear', fogK:0, ev:null, evSurge:0, waveEv:null, nextEv:null, perks:{}, loadout:[], allowed:null,
  hero:null, heroMode:false, lastStand:0, links:[], synSeen:new Set(), curRoutes:[], routeRR:0, seed:0, log:[], bossDef:null,
  runes:new Set(), crates:[], tornados:[], cmd:0, iceAgeT:20, perkPending:0, booms:[],
};
window.TD.G = G;

// ---- save ------------------------------------------------------------
const SAVE_KEY = 'td.save.v2';
let SAVE = { maps:{}, vol:0.6, muted:false, music:true, nums:true, quality:'high', games:0, xp:0, coins:0,
  skins:{ owned:[], sel:{} }, ch:{}, stats:Object.assign({}, STAT0, {killsBy:{}}), daily:null, chal:{}, lastMode:'normal', lastRule:'notesla',
  rp:0, research:{}, prestige:0, mastery:{}, lb:[], loadout:null };
function loadSave(){
  try{ const r = localStorage.getItem(SAVE_KEY); if(r){ const o = JSON.parse(r); SAVE = Object.assign(SAVE, o); SAVE.stats = Object.assign({}, STAT0, {killsBy:{}}, o.stats||{}); SAVE.chal = SAVE.chal||{}; SAVE.research = SAVE.research||{}; SAVE.mastery = SAVE.mastery||{}; SAVE.lb = SAVE.lb||[]; SAVE.skins = Object.assign({ owned:[], sel:{} }, o.skins||{}); } }catch(e){}
  // carry stars over from the first release
  try{ const r1 = localStorage.getItem('td.save.v1'); if(r1 && !SAVE.games){ const o = JSON.parse(r1); if(o.maps) SAVE.maps = o.maps; if(o.vol!=null) SAVE.vol = o.vol; } }catch(e){}
}
function persist(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); }catch(e){} }
function mapSave(id){ return SAVE.maps[id] || (SAVE.maps[id] = { stars:0, best:0 }); }
function unlocked(i){ const m = TD.MAPS[i]; if(m.needLevel) return ulevel() >= m.needLevel; if(m.tiered) return mapSave(TD.MAPS[0].id).stars > 0; return i===0 || (mapSave(TD.MAPS[i-1].id).stars > 0); }
function modeDef(id){ return TD.MODES.find(m=>m.id===(id||G.mode)) || TD.MODES[0]; }
function ruleDef(){ return G.mode==='challenge' ? TD.CHALLENGE_RULES.find(r=>r.id===G.rule) : null; }
function banned(type){ const r = ruleDef();
  if(r && r.ban && r.ban.includes(type)) return true;
  if(r && r.allow && !r.allow.includes(type)) return true;
  if(G.allowed && !G.allowed.includes(type)) return true;
  return false; }
// unlock level: prestiged players keep everything they unlocked before
function ulevel(){ return SAVE.prestige > 0 ? 99 : plevel(); }
function rs(id){ return SAVE.research[id] || 0; }
function perk(id){ return G.mode==='rogue' ? (G.perks[id] || 0) : 0; }
function mastery(type){ return TD.masteryOf(SAVE.mastery[type] || 0); }
function bossInfo(){ return G.bossDef || G.map; }
function synMul(){ return 1 + 0.25*perk('syn_range'); }
function hasSyn(t, id){ return t.syn && t.syn.has(id); }
function tierOf(m){ return m.tiered ? (mapSave(m.id).tier || 1) : 1; }
function mapDiff(m){ return m.diff * (m.tiered ? TD.tierMul(tierOf(m)) : 1); }
function plevel(){ return TD.levelOf(SAVE.xp).level; }
function skinFor(type){ const id = SAVE.skins.sel[type]; return id ? TD.SKINS.find(s=>s.id===id) : null; }
function towerUnlocked(type){ const u = TOWERS[type].unlock; return !u || ulevel() >= u; }

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
    case 'hit': noise(t, 0.05, 0.09, 600, 4000); tone(200, 'triangle', t, 0.06, 0.05, 120); break;
    case 'heavy': noise(t, 0.12, 0.28, 150, 2500); tone(110, 'sine', t, 0.18, 0.25, 50); break;
    case 'acrit': noise(t, 0.08, 0.3, 1800, 9000); tone(1500, 'triangle', t, 0.12, 0.1, 2600); tone(240, 'square', t, 0.1, 0.08, 90); break;
    case 'long': noise(t, 0.14, 0.45, 500, 7000); tone(90, 'square', t, 0.22, 0.16, 40); tone(2200, 'sine', t+0.02, 0.2, 0.06, 900); break;
    case 'shatter': [2400,1800,3000].forEach((f,i)=>tone(f, 'triangle', t+i*0.03, 0.12, 0.07, f*0.6)); noise(t, 0.2, 0.18, 3000, 10000); break;
    case 'return': tone(900, 'sawtooth', t, 0.1, 0.06, 1800); break;
    case 'emp': tone(80, 'square', t, 0.5, 0.18, 40); noise(t, 0.4, 0.2, 800, 5000); tone(1200, 'sawtooth', t, 0.3, 0.05, 200); break;
    case 'stomp': tone(50, 'sine', t, 0.7, 0.6, 25); noise(t, 0.5, 0.4, 40, 600); break;
    case 'portal': tone(300, 'sine', t, 0.6, 0.12, 900); tone(450, 'sine', t+0.1, 0.5, 0.08, 1300); noise(t, 0.5, 0.08, 2000, 8000); break;
    case 'bossdie': tone(55, 'sawtooth', t, 1.4, 0.4, 20); noise(t, 1.2, 0.5, 30, 1500); [784,988,1175,1568].forEach((f,i)=>tone(f, 'triangle', t+0.5+i*0.1, 0.7, 0.12)); break;
    case 'chop': noise(t, 0.08, 0.3, 300, 3000); tone(180, 'square', t, 0.08, 0.1, 90); noise(t+0.12, 0.08, 0.25, 300, 3000); noise(t+0.35, 0.4, 0.2, 80, 800); break;
    case 'overdrive': [220,330,440,660].forEach((f,i)=>tone(f, 'sawtooth', t+i*0.06, 0.35, 0.08, f*1.5)); break;
    case 'surge': tone(110, 'sawtooth', t, 0.8, 0.12, 440); noise(t, 0.6, 0.12, 2000, 9000); break;
    case 'heal': tone(880, 'sine', t, 0.18, 0.04, 1320); break;
    case 'daily': [659,784,988,1319].forEach((f,i)=>tone(f, 'sine', t+i*0.07, 0.3, 0.1)); break;
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
function costMul(){ return 1 - 0.08*perk('cheap'); }
function towerCost(type, level, branch){ const d = TOWERS[type]; const c = level===1 ? d.cost : (level===4 ? d.ult[branch||0].cost : d.upg[level-2]); return Math.round(c*costMul()); }
function towerValue(t){ let v = TOWERS[t.type].cost; for(let l=2;l<=Math.min(3,t.level);l++) v += TOWERS[t.type].upg[l-2]; if(t.level===4) v += TOWERS[t.type].ult[t.branch].cost; return v; }
function sellRate(){ return TD.SELL_RATE + 0.04*rs('salvage'); }
function branchOf(t){ return (t.level>=3 && t.branch!=null) ? TOWERS[t.type].branches[t.branch] : null; }
function ultOf(t){ return (t.level===4 && t.branch!=null && TOWERS[t.type].ult) ? TOWERS[t.type].ult[t.branch] : null; }
const REPLACE = { chain:1, returns:1, beams:1 };
// level stat with branch, ultimate, crystals, synergies, weather, night, perks, research and mastery applied
function stat(t, key){
  const d = TOWERS[t.type]; let v = d[key] ? d[key][Math.min(3,t.level)-1] : undefined; if(v===undefined) return undefined;
  for(const m of [branchOf(t), ultOf(t)]){ if(!m || m.mod[key]==null || typeof m.mod[key]==='boolean') continue;
    if(key==='range') v += m.mod[key]; else if(REPLACE[key]) v = m.mod[key]; else v *= m.mod[key]; }
  const cb = crystalBoost(t);
  if(cb){
    if(key==='dmg') v *= 1 + 0.3*cb;
    if(t.type==='tesla' && key==='chain') v += cb;
    if(t.type==='frost' && key==='slowT') v *= 1 + 0.25*cb;
    if(t.type==='frost' && key==='stacks') v = Math.max(2, v - 2*cb);
  }
  const sm = synMul();
  if(key==='dmg'){
    v *= 1 + 0.01*mastery(t.type) + 0.03*rs('dmg') + 0.12*perk('all_dmg');
    if(G.runes.has(t.cx+','+t.cz)) v *= 1.25;
    if(t.type==='tesla' && G.weather==='rain') v *= 1.25;
    if(t.type==='laser' && G.weather==='heat') v *= 1.2;
    if(t.type==='sniper') v *= 1 + 0.25*perk('sniper_dmg');
    if(G.overdrive > 0 && d.proj==='beam') v *= 1.6;
  }
  if(key==='range'){
    if(G.storm.active) v *= 0.75;
    if(G.weather==='fog') v *= t.type==='sniper' ? 0.75 : 0.85;
    if(G.night){ if(t.type==='laser'||t.type==='tesla') v *= 1.15; if(t.type==='archer'||t.type==='sniper') v *= 0.9; }
    if(G.waveEv==='wind') v *= 1.15;
    v *= 1 + 0.03*rs('range') + 0.1*perk('range');
    if(G.runes.has(t.cx+','+t.cz)) v += 0.3;
    if(t.type==='frost' && hasSyn(t,'thermal')) v += 0.3*sm;
  }
  if(key==='rate'){
    if(G.overdrive > 0) v *= 1.6;
    if(t.type==='tesla' && G.evSurge > 0) v *= 1.5;
    if(t.type==='frost' && hasSyn(t,'super')) v *= 1 + 0.15*sm;
    if(G.hero && G.hero.dead<=0 && Math.hypot(G.hero.x-t.x, G.hero.z-t.z) <= TD.HERO.aura) v *= 1.15;
    v *= 1 + 0.1*perk('all_rate');
  }
  if(key==='chain' && t.type==='tesla') v += perk('tesla_chain');
  if(key==='slow' && t.type==='frost'){ v *= 1 + 0.3*perk('frost_slow'); if(G.weather==='heat') v *= 0.75; v = Math.min(0.85, v); }
  if(key==='slowT' && G.weather==='snow') v *= 1.2;
  if(key==='critChance'){ v += 0.03*rs('crit') + 0.1*perk('archer_crit'); const u = ultOf(t); if(u && u.mod.critBonus) v += u.mod.critBonus; if(hasSyn(t,'spotter')) v += 0.05*sm; }
  if(key==='splash') v *= 1 + 0.25*perk('cannon_splash');
  if(key==='stacks' && t.type==='venom') v += 2*perk('venom_stack');
  if(key==='push') v *= 1 + 0.4*perk('wind_push');
  return v;
}
function flag(t, key){ const u = ultOf(t); if(u && u.mod[key]!==undefined) return u.mod[key]; const b = branchOf(t); return b ? b.mod[key] : undefined; }
// crystals boost the tower type that matches them; the Neon Rift surge doubles it
function crystalBoost(t){ return t.crystal ? (G.surge > 0 ? 2 : 1) : 0; }
function nearCrystal(cx, cz, kind){ for(const o of G.objs.values()){ if(o.type===kind && Math.abs(o.cx-cx)<=1 && Math.abs(o.cz-cz)<=1) return o; } return null; }
function cellFree(cx, cz){
  const m = G.map; if(cx<0||cz<0||cx>=m.w||cz>=m.h) return false;
  if(m.pathSet.has(cx+','+cz)) return false;
  if(G.objs.has(cx+','+cz)) return false;
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
  const big = cls==='crit' || cls==='long' || cls==='big';
  o.x=x+(Math.random()-0.5)*0.25; o.y=y; o.z=z; o.life=big?1.05:0.85; o.max=o.life; o.big=big; o.el.textContent = text; o.el.className = 'dn '+(cls||''); o.el.style.opacity = '1';
  NUMS.live.push(o);
}
function numsTick(dt){
  for(let i=NUMS.live.length-1;i>=0;i--){
    const o = NUMS.live[i]; o.life -= dt;
    if(o.life<=0){ o.el.style.opacity = '0'; NUMS.live.splice(i,1); NUMS.pool.push(o); continue; }
    const k = 1-o.life/o.max; const [sx,sy] = W.toScreen(o.x, o.y+k*0.9, o.z);
    const sc = (o.big ? 1 + 0.9*Math.max(0, 1-k*6) : 1 + 0.35*Math.max(0, 1-k*8)) + k*0.15;
    o.el.style.transform = 'translate(-50%,-50%) translate('+sx.toFixed(0)+'px,'+sy.toFixed(0)+'px) scale('+sc.toFixed(2)+')';
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
    case 'crits200': return s.crits;
    case 'lumber': return s.trees;
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

let persistTimer = 0;
function persistSoon(){ if(persistTimer) return; persistTimer = setTimeout(()=>{ persistTimer = 0; persist(); }, 1200); }

// ---- daily challenges ------------------------------------------------
function todayKey(){ const d = new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
function dailyText(def, n){ return def.text.replace('{n}', n); }
function dailyEnsure(){
  const k = todayKey();
  if(SAVE.daily && SAVE.daily.date===k) return SAVE.daily;
  let seed = 7; for(let i=0;i<k.length;i++) seed = (seed*31 + k.charCodeAt(i)) & 0x7fffffff;
  const rnd = ()=>{ seed = (seed*1103515245+12345) & 0x7fffffff; return seed/0x7fffffff; };
  const pool = TD.DAILY_POOL.filter(x=>!x.level || plevel()>=x.level), used = new Set(), tasks = [];
  for(let i=0;i<3;i++){ let c, g=0; do{ c = pool[Math.floor(rnd()*pool.length)]; } while((used.has(c.id) || (i<2 && c.id==='win') || (used.has('wave') && c.id==='lives')) && g++<60);
    used.add(c.id); tasks.push({ id:c.id, n:c.n[i], p:0, done:false }); }
  SAVE.daily = { date:k, tasks, bonus:false }; persist(); return SAVE.daily;
}
function dEv(ev, amt, info){
  const D = dailyEnsure(); let changed = false;
  for(let i=0;i<D.tasks.length;i++){
    const task = D.tasks[i]; if(task.done) continue;
    const def = TD.DAILY_POOL.find(x=>x.id===task.id); if(!def || def.ev!==ev) continue;
    if(def.tower && (!info || info.tower!==def.tower)) continue;
    if(def.enemy && (!info || info.enemy!==def.enemy)) continue;
    if(def.max) task.p = Math.max(task.p, amt); else task.p += amt;
    changed = true;
    if(task.p >= task.n){ task.p = task.n; task.done = true; const r = TD.DAILY_REWARD[i]; SAVE.coins += r.coins; SAVE.xp += r.xp;
      toast('📅 Daily complete: '+dailyText(def, task.n)+'  ·  +'+r.coins+' 💰', 'good'); sfx('daily'); persist(); }
  }
  if(!D.bonus && D.tasks.every(x=>x.done)){ D.bonus = true; SAVE.coins += TD.DAILY_BONUS.coins; SAVE.xp += TD.DAILY_BONUS.xp; toast('🌟 All 3 dailies done!  +'+TD.DAILY_BONUS.coins+' 💰 +'+TD.DAILY_BONUS.xp+' XP', 'good'); persist(); }
  else if(changed) persistSoon();
}

// ---- match setup -----------------------------------------------------
function loadoutFor(){
  let lo = (SAVE.loadout && SAVE.loadout.length ? SAVE.loadout : TD.DEFAULT_LOADOUT).filter(k=>TOWERS[k]);
  if(!lo.length) lo = TD.DEFAULT_LOADOUT.slice();
  return lo.slice(0, 6);
}
function startMap(idx, mode, rule){
  if(mode===true) mode = 'endless'; if(!mode) mode = 'normal';
  G.mapIdx = idx; G.map = TD.MAPS[idx]; G.map.curTier = tierOf(G.map);
  G.mode = mode; G.rule = mode==='challenge' ? (rule || SAVE.lastRule || 'notesla') : null; G.ruleRandom = false;
  if(G.rule==='random'){ const opts = TD.CHALLENGE_RULES.filter(r=>!r.random); G.rule = opts[Math.floor(Math.random()*opts.length)].id; G.ruleRandom = true; }
  // clear the previous match
  G.towers.forEach(t=>{ W.remove(t.mesh); if(t.beams) t.beams.forEach(b=>W.remove(b)); if(t.link) W.remove(t.link); }); G.enemies.forEach(e=>{ W.remove(e.mesh); }); G.projs.forEach(p=>W.freeProj(p.kind,p.mesh));
  G.fires.forEach(f=>W.freeFire(f.mesh)); G.objs.forEach(o=>{ W.removeObject(o.mesh); if(o.kind==='sparkle') W.removeSpark(o.mesh); }); (G.falling||[]).forEach(f=>W.removeObject(f.mesh)); (G.dying||[]).forEach(d=>W.remove(d.mesh)); G.dying = [];
  G.links.forEach(l=>W.remove(l.mesh)); G.links = []; (G.runeMeshes||[]).forEach(m=>W.removeSpark(m)); G.runeMeshes = [];
  G.crates.forEach(c=>W.remove(c.mesh)); G.crates = []; G.tornados.forEach(o=>W.remove(o.mesh)); G.tornados = [];
  if(G.hero){ W.remove(G.hero.mesh); G.hero = null; }
  W.buildMap(G.map);
  G.towers = []; G.grid = new Map(); G.enemies = []; G.projs = []; G.queue = []; G.fires = []; G.objs = new Map(); G.falling = []; G.runes = new Set();
  W.fxReset(); W.hideRing(); W.hideGhost(); W.hideMarker(); numsClear();
  const lv = ulevel(), md = modeDef(mode), ru = ruleDef();
  G.waves = md.waves || G.map.waves;
  const goldBase = mode==='bossrush' ? md.gold : G.map.gold;
  G.gold = ru && ru.gold ? ru.gold : Math.round(goldBase * (lv>=12 ? 1.1 : 1) * (md.id==='hard' ? md.gold : 1) * (1 + 0.05*rs('gold')) * (1 + 0.05*Math.min(TD.PRESTIGE_MAX, SAVE.prestige||0)));
  G.lives = ru && ru.lives ? ru.lives : G.map.lives + (lv>=17 ? 2 : 0) + 2*rs('lives'); G.startLives = G.lives;
  G.wave = 0; G.endless = mode==='endless'; G.kills = 0; G.earned = 0; G.t = 0; G.livesLost = 0; G.builtTypes = new Set(); G.bossAlive = 0; G.boss = null;
  G.phase = 'build'; G.buildTimer = -1; G.sel = null; G.selObj = null; G.buildType = null; G.targetMode = null; G.over = false; G.won = false; G.speed = 1; G.paused = false;
  G.cd = { meteor:0, freeze:0, chain:0, overdrive:0 }; G.storm = { active:false, timer: 38 }; G.lavaT = 0; G.slowmo = 0; G.overdrive = 0; G.surge = 0; G.surgeT = 18;
  G.night = false; G.nightTarget = 0; G.weather = 'clear'; G.fogTarget = 0; G.ev = null; G.evSurge = 0; G.waveEv = null; G.nextEv = null; G.perks = {}; G.perkPending = 0;
  G.synSeen = new Set(); G.routeRR = 0; G.log = []; G.booms = []; G.bonusCoins = 0; G.bossDef = null; G.cmd = 0; G.iceAgeT = 20; G.lastStand = 0; G.heroMode = false; G.heroKills = 0; G.nightKills = 0;
  G.seed = mode==='rogue' ? 1 + Math.floor(Math.random()*1e6) : 0;
  G.mastery0 = {}; TD.TOWER_ORDER.forEach(k=>{ G.mastery0[k] = mastery(k); });
  // towers the player brought
  G.loadout = loadoutFor().filter(k=>towerUnlocked(k));
  if(!G.loadout.length) G.loadout = ['archer','cannon','frost'];
  G.allowed = null;
  if(ru && ru.pick){ G.allowed = G.loadout.slice(0, ru.pick); }
  if(ru && ru.rand){ const pool = G.loadout.filter(k=>k!=='bank'); const pick = []; while(pick.length < Math.min(ru.rand, pool.length)){ const k = pool[Math.floor(Math.random()*pool.length)]; if(!pick.includes(k)) pick.push(k); } G.allowed = pick; }
  if(ru && ru.allow){ G.loadout = ru.allow.filter(k=>towerUnlocked(k)); }
  if(G.allowed) G.loadout = G.loadout.filter(k=>G.allowed.includes(k));
  G.map.routeDefs.forEach(r=>{ r.open = r.kind==='main' || r.kind==='fork'; }); W.refreshRoads(G.map);
  G.curRoutes = routesFor(1);
  W.setNight(0); G.nightK = 0; W.setFog(0);
  genObjects();
  if(ulevel() >= TD.HERO.unlock) spawnHero();
  SAVE.games = (SAVE.games||0)+1; persist();
  $('app').classList.remove('menu'); $('menu').classList.add('hide'); $('result').classList.remove('show'); $('pauseWrap').classList.remove('show'); $('stormFx').classList.remove('show');
  $('perkWrap').classList.remove('show'); $('replayWrap').classList.remove('show');
  $('bossBar').classList.remove('show'); setWeatherFx('clear'); $('nightFx').style.opacity = '0';
  G.started = true;
  if(typeof window.onGameplayStart==='function') window.onGameplayStart();
  $('buildBar').innerHTML = '';
  renderHud(); renderBuildBar(); renderPanel(); renderWaveBtn(); $('abilBar').innerHTML = ''; renderAbilities(); renderChips(); syncSpeed();
  toast(G.map.tip, 'tip');
  if(mode==='hard') setTimeout(()=>toast('💀 HARD MODE  ·  up to +45% enemy health', 'bad'), 900);
  if(mode==='rogue') setTimeout(()=>toast('🃏 ROGUELIKE  ·  pick a perk every 3 waves', 'good'), 900);
  if(mode==='bossrush') setTimeout(()=>toast('👑 BOSS RUSH  ·  10 bosses, one after another', 'bad'), 900);
  if(ru) setTimeout(()=>toast(ru.icon+' '+(G.ruleRandom?'Random rule: ':'Challenge: ')+ru.name+' — '+ru.desc+(G.allowed?'  ('+G.allowed.map(k=>TOWERS[k].icon).join(' ')+')':''), 'bad'), 1100);
  if(G.map.tiered) setTimeout(()=>toast('🔥 The Gauntlet — Tier '+G.map.curTier+'  ·  +'+Math.round((TD.tierMul(G.map.curTier)-1)*100)+'% health', 'bad'), 1500);
}

// ---- map objects: trees (clear for gold), rocks (blocked), crystals (buff) ----
const TREE_COST = 25;
function genObjects(){
  const m = G.map; let seed = 99991; for(const ch of m.id) seed = (seed*31 + ch.charCodeAt(0)) & 0x7fffffff;
  const rnd = ()=>{ seed = (seed*1103515245+12345) & 0x7fffffff; return seed/0x7fffffff; };
  const onPath = (x,z)=>m.pathSet.has(x+','+z);
  const nearPath = (x,z)=>{ for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) if(onPath(x+dx,z+dz)) return true; return false; };
  const free = []; for(let x=0;x<m.w;x++) for(let z=0;z<m.h;z++) if(!onPath(x,z)) free.push([x,z]);
  const taken = new Set();
  // keep a clear ring around the spawn and castle so the ends stay readable
  const ends = [m.path[0], m.path[m.path.length-1]];
  const ok = (x,z)=> !taken.has(x+','+z) && !onPath(x,z) && ends.every(e=>Math.abs(e[0]-x)+Math.abs(e[1]-z) > 2);
  const place = (type, x, z)=>{ const mesh = W.makeObject(type); mesh.position.set(x+0.5, 0, z+0.5); mesh.rotation.y = rnd()*Math.PI*2; const o = { type, cx:x, cz:z, x:x+0.5, z:z+0.5, mesh }; G.objs.set(x+','+z, o); taken.add(x+','+z); return o; };
  const pick = (filter)=>{ const c = free.filter(([x,z])=>ok(x,z) && filter(x,z)); return c.length ? c[Math.floor(rnd()*c.length)] : null; };
  const [nE, nI] = m.crystals || [1,1];
  const crystals = [];
  const farFromCrystals = (x,z)=>crystals.every(c=>Math.abs(c.cx-x)+Math.abs(c.cz-z) >= 5);
  const roomy = (x,z)=>{ let n=0; for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++){ const X=x+dx, Z=z+dz; if(X>=0&&Z>=0&&X<m.w&&Z<m.h && !onPath(X,Z)) n++; } return n >= 5; };
  for(let i=0;i<nE+nI;i++){ const c = pick((x,z)=>nearPath(x,z) && roomy(x,z) && farFromCrystals(x,z)); if(c) crystals.push(place(i<nE?'energy':'ice', c[0], c[1])); }
  for(let i=0;i<4;i++){ const c = pick((x,z)=>!nearPath(x,z)); if(c) place('rock', c[0], c[1]); }
  for(let i=0;i<6;i++){ const c = pick((x,z)=>(i<3 ? nearPath(x,z) : !nearPath(x,z)) && !G.objs.has(x+','+z)); if(c) place('tree', c[0], c[1]); }
  // ruins you can demolish, and a few hidden secrets
  const ruins = [];
  for(let i=0;i<2;i++){ const c = pick((x,z)=>i===0 ? nearPath(x,z) : !nearPath(x,z)); if(c) ruins.push(place('ruin', c[0], c[1])); }
  const trees = [...G.objs.values()].filter(o=>o.type==='tree');
  if(trees.length) trees[Math.floor(rnd()*trees.length)].secret = 'chest';
  if(ruins.length) ruins[0].secret = 'rune';
  const sp = pick((x,z)=>!nearPath(x,z));
  if(sp){ const mesh = W.makeSparkle(); mesh.position.set(sp[0]+0.5, 0, sp[1]+0.5); const o = { type:'sparkle', kind:'sparkle', cx:sp[0], cz:sp[1], x:sp[0]+0.5, z:sp[1]+0.5, mesh, secret: rnd()<0.5 ? 'rune' : 'chest' }; G.objs.set(sp[0]+','+sp[1], o); }
}
const CLEAR_COST = { tree:25, ruin:60 };
function clearObj(o){
  const cost = Math.round(CLEAR_COST[o.type]*costMul());
  if(G.gold < cost){ toast('Not enough gold', 'bad'); sfx('nope'); return; }
  G.gold -= cost; G.objs.delete(o.cx+','+o.cz); G.selObj = null;
  logAct('clear', o.type, o.cx, o.cz);
  if(o.type==='tree'){
    G.falling.push({ mesh:o.mesh, t:0, dir: Math.random()<0.5?1:-1 });
    W.debris(o.x, 0.6, o.z, TD.THEMES[G.map.theme].tree, 12, 2.2); W.debris(o.x, 0.3, o.z, TD.THEMES[G.map.theme].trunk, 6, 1.6);
    W.burst(o.x, 0.3, o.z, 0xd8c9a0, 20, 2.2, 0.6, 3.5, 6, 2.0);
    SAVE.stats.trees = (SAVE.stats.trees||0)+1; sfx('chop'); toast('🪓 Tree cleared  ·  tile is free to build', 'good');
  }else{
    W.removeObject(o.mesh); W.debris(o.x, 0.4, o.z, 0x9a948a, 20, 3); W.burst(o.x, 0.3, o.z, 0xcfc8b8, 40, 3, 0.8, 4, 5, 1.8); W.shock(o.x, o.z, 0xcfc8b8, 1.4, 0.5);
    sfx('boom'); W.shake(0.12); toast('🧱 Ruins demolished  ·  tile is free to build', 'good');
  }
  if(o.secret) setTimeout(()=>revealSecret(o), o.type==='tree' ? 650 : 200);
  chCheck(); renderPanel(); renderHud(); W.hideRing();
}
function revealSecret(o){
  const key = o.cx+','+o.cz;
  SAVE.stats.secrets = (SAVE.stats.secrets||0)+1; chCheck();
  W.flash(o.x, 0.6, o.z, 0xfff0a0, 3, 0.5); W.shock(o.x, o.z, 0xffe27a, 1.6, 0.6); sfx('level');
  if(o.secret==='chest'){
    const g = 60 + G.wave*6; G.gold += g; G.earned += g; G.bonusCoins = (G.bonusCoins||0) + 10;
    W.burst(o.x, 0.5, o.z, 0xffd54a, 60, 3.5, 1, 3.5, 6, 2.2); num(o.x, 1, o.z, '+'+g+' 💰', 'gold');
    toast('🔍 SECRET! A buried treasure chest: +'+g+' gold, +10 coins', 'good');
  }else{
    G.runes.add(key); const m = W.makeRuneTile(); m.position.set(o.x, 0, o.z); (G.runeMeshes = G.runeMeshes||[]).push(m);
    W.burst(o.x, 0.3, o.z, 0xb07cff, 50, 3, 1, 3.5, 2, 2.2);
    toast('🔍 SECRET! An ancient rune — a tower built here gets +25% damage and +0.3 range', 'good');
    const t = G.grid.get(key); if(t) renderPanel();
  }
  renderHud();
}
function clearTree(o){ clearObj(o); }
function selectObj(o){ G.sel = null; G.selObj = o; G.buildType = null; renderBuildBar(); renderPanel();
  if(o.type==='energy'||o.type==='ice') W.showRing(o.x, o.z, 1.5, true); else W.hideRing(); sfx('click');
  if(o.type==='sparkle'){ G.objs.delete(o.cx+','+o.cz); W.removeSpark(o.mesh); G.selObj = null; renderPanel(); revealSecret(o); } }

// ---- towers ----------------------------------------------------------
function makeMesh(t){
  const ml = mastery(t.type), rar = ml >= 3 ? TD.rarityOf(ml).color : null;
  const m = W.makeTower(t.type, t.level, skinFor(t.type), t.branch, { rarity:rar, legendary: ml >= 9 });
  m.position.set(t.x, 0, t.z); if(t.level>=3 && ulevel()>=25) W.legend(m, true); return m;
}
function logAct(a, k, x, z, t){ G.log.push({ t:+G.t.toFixed(1), w:G.wave, a, k, x, z, l: t ? t.level : 0, b: t ? t.branch : null }); }
// ---- synergies: two different towers within 2 tiles power each other up ----
function recomputeSyn(){
  G.links.forEach(l=>W.remove(l.mesh)); G.links = [];
  G.towers.forEach(t=>{ t.syn = new Set(); });
  const R = TD.SYN_RANGE + perk('syn_range'), V = window.THREE.Vector3;
  for(let i=0;i<G.towers.length;i++) for(let j=i+1;j<G.towers.length;j++){
    const a = G.towers[i], b = G.towers[j];
    if(Math.max(Math.abs(a.cx-b.cx), Math.abs(a.cz-b.cz)) > R) continue;
    for(const S of TD.SYNERGIES){
      if(!((a.type===S.a && b.type===S.b) || (a.type===S.b && b.type===S.a))) continue;
      a.syn.add(S.id); b.syn.add(S.id);
      const mesh = W.makeLink(S.color); W.setBeam(mesh, new V(a.x, 0.45, a.z), new V(b.x, 0.45, b.z), 1.4); mesh.visible = true;
      G.links.push({ mesh, a, b, S });
      if(!G.synSeen.has(S.id)){ G.synSeen.add(S.id); setTimeout(()=>toast('🔗 SYNERGY  '+S.icon+' '+S.name+' — '+S.desc, 'good'), 300); sfx('surge');
        W.shock((a.x+b.x)/2, (a.z+b.z)/2, S.color, 1.6, 0.6); if(G.synSeen.size >= 3) chMark('synergy3'); }
    }
  }
}
function towerCount(type){ return G.towers.filter(t=>t.type===type).length; }
function build(type, cx, cz){
  const cost = towerCost(type, 1);
  if(!towerUnlocked(type)){ toast('🔒 '+TOWERS[type].name+' unlocks at player level '+TOWERS[type].unlock, 'bad'); sfx('nope'); return false; }
  if(banned(type) || !G.loadout.includes(type)){ toast('🚫 '+TOWERS[type].name+' is not in play this match', 'bad'); sfx('nope'); return false; }
  if(TOWERS[type].max && towerCount(type) >= TOWERS[type].max){ toast('Max '+TOWERS[type].max+' '+TOWERS[type].name+'s per match', 'bad'); sfx('nope'); return false; }
  if(G.gold < cost){ toast('Not enough gold', 'bad'); sfx('nope'); return false; }
  if(!cellFree(cx,cz)){ sfx('nope'); return false; }
  G.gold -= cost;
  const t = { type, level:1, branch:null, cx, cz, x:cx+0.5, z:cz+0.5, cool:0.3, target:null, kills:0, dmg:0, shots:0, ramp:1, acc:0, accT:0, dis:0, recoil:0, spent:cost, syn:new Set() };
  const ck = type==='tesla' ? 'energy' : (type==='frost' ? 'ice' : null), cr = ck ? nearCrystal(cx, cz, ck) : null;
  if(cr){ t.crystal = cr; t.link = W.makeLink(ck==='energy'?0xb07cff:0x7fe8ff); W.setBeam(t.link, new (window.THREE.Vector3)(cr.x, 0.72, cr.z), new (window.THREE.Vector3)(t.x, 0.9, t.z), 1); t.link.visible = true;
    setTimeout(()=>toast((ck==='energy'?'⚡ Energized':'❄️ Ice-charged')+' by the crystal: +30% damage'+(ck==='energy'?', +1 chain':', faster freezing'), 'good'), 250); }
  if(G.runes.has(cx+','+cz)) setTimeout(()=>toast('🔮 Built on an ancient rune: +25% damage, +0.3 range', 'good'), 250);
  t.mesh = makeMesh(t); t.mesh.scale.setScalar(0.01); t.pop = 0; W.add(t.mesh);
  dEv('build', 1); logAct('build', type, cx, cz, t);
  if(TOWERS[type].proj==='beam'){ t.beams = [W.makeBeam(TOWERS[type].accent)]; }
  G.towers.push(t); G.grid.set(cx+','+cz, t);
  G.builtTypes.add(type); if(BASIC.every(k=>G.builtTypes.has(k))) chMark('alltypes');
  W.burst(t.x, 0.3, t.z, 0xd8c9a0, 18, 2.2, 0.6, 3.5, 6, 2.0); W.shock(t.x, t.z, TOWERS[type].accent, 0.9, 0.4); W.debris(t.x, 0.2, t.z, 0x9a8a6a, 6, 1.6);
  recomputeSyn();
  sfx('build'); select(t); renderHud(); renderBuildBar();
  return true;
}
function upgrade(t, branch){
  if(!t || t.level>=4) return;
  if(t.level===3){
    const d = TOWERS[t.type]; if(!d.ult) return;
    if(mastery(t.type) < TD.ULT_MASTERY){ toast('🔒 Reach mastery '+TD.ULT_MASTERY+' with the '+d.name+' to unlock its Ultimate', 'bad'); sfx('nope'); return; }
    branch = t.branch;
  }
  const cost = towerCost(t.type, t.level+1, branch);
  if(G.gold < cost){ toast('Not enough gold', 'bad'); sfx('nope'); return; }
  if(t.level===2 && branch==null){ return; }   // level 3 needs a branch choice
  G.gold -= cost; t.spent += cost; t.level++; if(t.level===3){ t.branch = branch; dEv('spec', 1); }
  if(t.level===4){ chMark('ultimate'); toast('🌟 ULTIMATE: '+ultOf(t).icon+' '+ultOf(t).name+' — '+ultOf(t).desc, 'good'); }
  logAct('up', t.type, t.cx, t.cz, t);
  const yaw = t.mesh.head.rotation.y;
  W.remove(t.mesh); t.mesh = makeMesh(t); t.mesh.head.rotation.y = yaw; W.add(t.mesh);
  if(t.beams){ const want = flag(t,'beams')||1; while(t.beams.length < want) t.beams.push(W.makeBeam(TOWERS[t.type].accent)); }
  t.mesh.scale.setScalar(0.7); t.pop = 0;
  W.burst(t.x, 0.6, t.z, TOWERS[t.type].accent, 26, 2.6, 0.7, 3.5, 4, 2.2); W.shock(t.x, t.z, TOWERS[t.type].accent, 1.3, 0.5); W.flash(t.x, 0.9, t.z, TOWERS[t.type].accent, 2.4, 0.35);
  if(t.level>=3){ W.burst(t.x, 1.0, t.z, 0xffe27a, 40, 3.2, 0.9, 3.5, 3, 2.4); W.shock(t.x, t.z, 0xffe27a, 2.0, 0.7); }
  if(t.level===4){ W.burst(t.x, 1.4, t.z, 0xffffff, 60, 4, 1, 4, 2, 2.6); W.shock(t.x, t.z, 0xffffff, 3, 0.8); W.flash(t.x, 1.2, t.z, 0xffe27a, 4, 0.5); W.shake(0.2); W.punch(0.3); sfx('level'); }
  sfx('upgrade'); renderHud(); renderPanel(); renderBuildBar();
}
function sell(t){
  if(!t) return;
  const v = Math.round(t.spent*sellRate());
  if(t.level>=3) chMark('sell3');
  logAct('sell', t.type, t.cx, t.cz, t);
  G.gold += v; W.remove(t.mesh); if(t.beams) t.beams.forEach(b=>W.remove(b)); if(t.link) W.remove(t.link); G.grid.delete(t.cx+','+t.cz); G.towers.splice(G.towers.indexOf(t),1);
  W.burst(t.x, 0.4, t.z, 0xffd54a, 16, 2.0, 0.6, 3, 5, 1.8);
  recomputeSyn();
  sfx('sell'); toast('+'+v+' gold', 'good'); deselect(); renderHud(); renderBuildBar();
}
function select(t){ G.sel = t; G.selObj = null; G.buildType = null; G.targetMode = null; W.hideMarker(); renderPanel(); renderBuildBar(); renderAbilities(); W.showRing(t.x, t.z, stat(t,'range'), true); W.hideGhost(); }
function deselect(){ G.sel = null; G.selObj = null; renderPanel(); W.hideRing(); }
function setBuildType(type){
  if(G.buildType===type) type = null;
  if(type && !towerUnlocked(type)){ toast('🔒 '+TOWERS[type].name+' unlocks at player level '+TOWERS[type].unlock, 'bad'); sfx('nope'); return; }
  if(type && banned(type)){ toast('🚫 '+TOWERS[type].name+' is banned in this challenge', 'bad'); sfx('nope'); return; }
  G.buildType = type; G.sel = null; G.selObj = null; G.targetMode = null; W.hideMarker(); renderPanel(); renderBuildBar(); renderAbilities(); W.hideRing(); W.hideGhost();
  if(type) sfx('click');
}

// ---- waves -----------------------------------------------------------
function routesFor(n){
  const out = [];
  for(const r of G.map.routeDefs){ if(!r.open) continue;
    if(r.kind==='fork'){ if(n >= r.from && (n - r.from) % r.every === 0) out.push(r); continue; }
    out.push(r); }
  if(!out.length) out.push(G.map.routeDefs[0]);
  return out;
}
function wavePlan(n){ return G.mode==='bossrush' ? TD.genBossWave(n) : TD.genWave(G.mapIdx, n, G.seed); }
function gatePos(key){ const [x,z] = key.split(',').map(Number); return [x+0.5, z+0.5]; }
function callWave(){
  if(G.phase!=='build' || G.over) return;
  let bonus = 0;
  if(G.buildTimer > 0){ bonus = Math.round(G.buildTimer*1.5); G.gold += bonus; G.earned += bonus; SAVE.stats.early++; chCheck(); }
  G.wave++; G.lastStand = 0;
  // roads that open or get buried from this wave on
  for(const r of G.map.routeDefs){
    if((r.kind==='open' || r.kind==='reroute') && !r.open && G.wave >= r.from){
      r.open = true; if(r.kind==='reroute') G.map.routeDefs[0].open = false;
      if(r.gate){ const [gx,gz] = gatePos(r.gate); W.debris(gx, 0.4, gz, 0x9a6a3a, 18, 3.2); W.burst(gx, 0.4, gz, 0xd8c9a0, 50, 3.5, 0.8, 4, 5, 2); W.shock(gx, gz, 0xffc857, 2, 0.6); }
      W.refreshRoads(G.map); sfx('bigboom'); W.shake(0.4); W.punch(0.4); toast(r.text, 'bad');
    }
  }
  G.curRoutes = routesFor(G.wave); G.routeRR = 0;
  const fork = G.curRoutes.find(r=>r.kind==='fork');
  if(fork){ toast(fork.text, 'bad'); if(fork.gate){ const [gx,gz] = gatePos(fork.gate); W.shock(gx, gz, 0xffc857, 1.8, 0.7); W.flash(gx, 0.5, gz, 0xffc857, 2, 0.4); } }
  // day / night and weather
  const night = G.mode!=='bossrush' && TD.isNight(G.wave);
  if(night !== G.night){ G.night = night; G.nightTarget = night ? 1 : 0; toast(night ? '🌙 Night falls — Night Stalkers hunt. Lasers & Teslas +15% range, Archers & Snipers −10%' : '☀️ Day breaks', night ? 'bad' : 'tip'); sfx(night ? 'bossin' : 'daily'); }
  const w = TD.rollWeather(G.map.theme, G.wave, G.seed);
  if(w !== G.weather){ G.weather = w; setWeatherFx(w); if(w !== 'clear') setTimeout(()=>toast(TD.WEATHER[w].icon+' '+TD.WEATHER[w].name+': '+TD.WEATHER[w].desc, 'tip'), 700); }
  G.waveEv = G.nextEv; G.nextEv = null;
  // boss rush: each wave brings a different map's boss
  if(G.mode==='bossrush'){ const m = TD.MAPS[(G.wave-1) % TD.MAPS.length]; G.bossDef = { boss:m.boss, bossSkill:m.bossSkill, bossTint:m.bossTint }; }
  const groups = wavePlan(G.wave);
  let at = 0.6; G.queue = [];
  groups.forEach(gr=>{ for(let i=0;i<gr.count;i++){ G.queue.push({ type:gr.type, at }); at += gr.gap; } at += gr.pause; });
  G.spawnT = 0; G.phase = 'wave';
  G.swarmWave = groups.some(g=>g.swarm); G.livesAtWave = G.livesLost;
  sfx('horn');
  toast('Wave '+G.wave+(bonus?'  ·  +'+bonus+' early bonus':''), bonus?'good':'');
  if(G.swarmWave) setTimeout(()=>{ showEvBanner({ icon:'🐜', name:'SWARM WAVE', desc:'Hundreds of tiny enemies — splash damage shines!' }); }, 300);
  if(groups.some(g=>g.type==='boss')) setTimeout(()=>{ if(G.phase==='wave') bossBanner(); }, 400);
  if(G.map.gate){ const gp = G.map.gate.position; W.portalFx(gp.x, gp.z, 0xb07cff); }
  renderHud(); renderWaveBtn(); renderChips(); renderAbilities();
}
function spawn(type, at, seg, route){
  const diff = G.mode==='bossrush' ? 1.15 : mapDiff(G.map), md = modeDef(), ru = ruleDef();
  // hard mode eases in: its extra health ramps up over the first ten waves
  const hardHp = md.hp ? 1 + (md.hp-1)*Math.min(1, G.wave/10) : 1;
  const d = ENEMIES[type];
  let mul = ((type==='boss'||type==='miniboss') ? TD.bossMul(G.mode==='bossrush' ? G.wave*3 : G.wave, diff) * (G.mode==='bossrush' ? 2.2 : 1) : TD.hpMul(G.mode==='bossrush' ? G.wave*2 : G.wave, diff)) * hardHp * ((ru&&ru.hp)||1);
  if(G.waveEv==='moon') mul *= 1.25;
  let r = route;
  if(!r){ if(d.air) r = G.map.airRoute; else { const rs2 = G.curRoutes.length ? G.curRoutes : [G.map.routeDefs[0]]; r = (type==='boss' ? rs2[0] : rs2[(G.routeRR++) % rs2.length]).route; } }
  let speed = d.speed * (md.speed||1) * ((ru&&ru.speed)||1);
  if(G.map.effect==='ice') speed *= 1.12;
  if(G.map.effect==='lowgrav') speed *= d.air ? 1.3 : 0.85;
  if(G.map.effect==='surge') speed *= 1.06;
  if(G.map.tiered) speed *= TD.tierSpeed(G.map.curTier);
  const e = { type, d, hp: Math.round(d.hp*mul), maxHp: Math.round(d.hp*mul), speed, armor:d.armor, gold: Math.round(d.gold*TD.goldMul(G.wave)*(G.mode==='bossrush' ? 0.95 : 1)),
    air:!!d.air, ghost:!!d.ghost, mesh:W.makeEnemy(type, type==='boss' ? bossInfo().bossTint : null), route:r, seg:seg||0, dist:0, slow:0, slowT:0, frozen:0, stun:0, burn:0, burnDps:0, healT:0,
    dead:false, flash:0, pos: (at ? at.clone() : r[0].clone()), lives:d.lives, shield: d.shield ? Math.round(d.shield*mul) : 0, shieldMax: d.shield ? Math.round(d.shield*mul) : 0,
    phase:0, bshield:0, bshieldT:0, enraged:false, hits:0, chill:0, freezeImm:0, cloakT: 1.5+Math.random()*2, invis:false, invisT:0, guarded:false, hasted:false,
    sab: d.sabotage ? { state:'road', wait:1.2 } : null, skillT:5, skillN:0, grow:0, born:G.t,
    ab: { cloak:!!d.cloak, heal:d.heal||0, aura:d.aura||null, auraR:d.auraR||0, dome:!!d.dome, blink:d.blink||0, dodge:d.dodge||0 },
    abT: 2+Math.random()*2, domeHp:0, poison:null, marked:0, winded:0, kbImm:0, brittle:false };
  e.pos.y = e.mesh.baseY; e.mesh.position.copy(e.pos); e.mesh.scale.setScalar(0.01); W.add(e.mesh);
  e.scale = type==='boss' ? 1.25 : 1;
  if(type==='boss'){ G.bossAlive++; G.boss = e; W.shake(0.35); W.portalFx(e.pos.x, e.pos.z, bossInfo().bossTint||0xff3c3c); showBossBar(e); }
  if(type==='miniboss'){ G.bossAlive++; toast('⚠️ Mini boss!', 'bad'); sfx('phase'); W.portalFx(e.pos.x, e.pos.z, 0xc03060); }
  if(type==='commander'){ toast('👑 A Commander leads the attack — every enemy is faster and tougher while it lives!', 'bad'); sfx('phase'); }
  G.enemies.push(e);
  return e;
}
function bossBanner(){
  const b = $('bossBanner'); $('bossName').textContent = bossInfo().boss; b.classList.add('show'); sfx('bossin'); W.shake(0.5);
  setTimeout(()=>b.classList.remove('show'), 2600);
}
function showEvBanner(ev){
  const b = $('evBanner'); $('evIcon').textContent = ev.icon; $('evName').textContent = ev.name; $('evDesc').textContent = ev.desc;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); sfx('surge');
  clearTimeout(showEvBanner.tm); showEvBanner.tm = setTimeout(()=>b.classList.remove('show'), 3200);
}
function triggerEvent(ev){
  showEvBanner(ev); G.ev = ev.id;
  if(ev.id==='surge'){ G.evSurge = ev.t; G.towers.forEach(t=>{ if(t.type==='tesla'){ W.shock(t.x, t.z, 0x9ffcff, 1.4, 0.5); W.flash(t.x, 1, t.z, 0x9ffcff, 2, 0.4); } }); }
  else if(ev.wave) G.nextEv = ev.id;
  else if(ev.id==='supply') dropCrate();
  else if(ev.id==='repair'){ G.lives += 3; const c = G.map.castle.position; W.burst(c.x, 1, c.z, 0x52e07a, 40, 2.5, 0.8, 3, -1, 2); num(c.x, 1.6, c.z, '+3 ❤️', 'heal'); }
  else if(ev.id==='recharge'){ for(const k in G.cd) G.cd[k] = 0; }
  renderChips(); renderHud();
}
function dropCrate(){
  const free = []; for(let x=0;x<G.map.w;x++) for(let z=0;z<G.map.h;z++) if(cellFree(x,z)) free.push([x,z]);
  if(!free.length){ const g = 60+G.wave*8; G.gold += g; G.earned += g; return; }
  const [x,z] = free[Math.floor(Math.random()*free.length)];
  const mesh = W.makeCrate(); mesh.position.set(x+0.5, 9, z+0.5);
  G.crates.push({ mesh, x:x+0.5, z:z+0.5, y:9 });
}
function waveCleared(){
  const bonus = TD.waveBonus(G.wave); G.gold += bonus; G.earned += bonus;
  toast('Wave '+G.wave+' cleared  ·  +'+bonus+' gold', 'good');
  // banks pay out
  for(const t of G.towers){ if(t.type!=='bank') continue;
    let inc = Math.round(stat(t,'income')); const b = branchOf(t), u = ultOf(t);
    if(b && b.mod.interest){ const rate = b.mod.interest*(u && u.mod.interest ? u.mod.interest : 1), cap = b.mod.cap*(u && u.mod.cap ? u.mod.cap : 1); inc += Math.min(Math.round(cap), Math.round(G.gold*rate)); }
    G.gold += inc; G.earned += inc; t.dmg += inc; num(t.x, 1.4, t.z, '+'+inc+' 💰', 'gold'); W.burst(t.x, 1.1, t.z, 0xffd54a, 14, 1.8, 0.6, 2.4, 4, 1.8);
    SAVE.mastery.bank = (SAVE.mastery.bank||0) + Math.round(inc/5); sfx('coin'); }
  if(perk('interest')){ const i = Math.min(150, Math.round(G.gold*0.05*perk('interest'))); G.gold += i; G.earned += i; if(i) toast('🏦 Interest +'+i+' gold', 'good'); }
  if(G.swarmWave && G.livesLost===G.livesAtWave) chMark('swarm');
  G.waveEv = null; G.ev = G.evSurge > 0 ? 'surge' : null;
  if(G.wave >= 6 && G.towers.length && G.towers.every(t=>t.type==='archer')) chMark('archers');
  if(G.gold >= 1000) chMark('rich');
  if(G.wave >= 40) chMark('wave40');
  dEv('wave', G.wave); dEv('gold', G.earned);
  if(G.wave===10 && G.livesLost<=2) dEv('safe10', 1);
  if(G.wave >= G.waves && !G.endless){ finish(true); return; }
  G.phase = 'build'; G.buildTimer = G.mode==='bossrush' ? 15 : TD.BUILD_TIME;
  // warn about roads that change next wave
  for(const r of G.map.routeDefs) if((r.kind==='open'||r.kind==='reroute') && !r.open && r.from===G.wave+1) setTimeout(()=>toast('⚠️ Next wave the road changes — watch the '+(r.kind==='open'?'barricade':'south road')+'!', 'bad'), 900);
  // a random event now and then
  if(G.mode!=='bossrush' && G.wave >= 3 && Math.random() < 0.35){ const pool = TD.EVENTS.filter(e=>!(e.id==='repair' && G.lives >= G.startLives)); setTimeout(()=>{ if(!G.over && G.phase!=='menu') triggerEvent(pool[Math.floor(Math.random()*pool.length)]); }, 1200); }
  // roguelike: a perk pick every 3 waves
  if(G.mode==='rogue' && G.wave % 3 === 0) offerPerks();
  renderHud(); renderWaveBtn(); renderChips();
}

// ---- combat ----------------------------------------------------------
const _v = V3(), _v2 = V3();
function inRange(t, e, r){ const dx = e.pos.x-t.x, dz = e.pos.z-t.z; return dx*dx+dz*dz <= (r+e.d.size)*(r+e.d.size); }
function canHit(t, e){ const d = TOWERS[t.type]; if(d.proj==='none') return false; if(e.ghost && (d.proj==='arrow'||d.proj==='shell'||d.proj==='gust')) return false; return e.air ? (d.air || !!flag(t,'air')) : d.ground; }
function pickTarget(t){
  const r = stat(t,'range'); let best = null, bd = -1;
  for(const e of G.enemies){ if(e.dead || e.invis || !canHit(t,e) || !inRange(t,e,r)) continue; if(e.dist > bd){ bd = e.dist; best = e; } }
  return best;
}
function muzzleWorld(t){ const v = t.mesh.muzzle.clone(); t.mesh.head.localToWorld(v); return v; }
function headPos(e){ return _v2.set(e.pos.x, e.pos.y + e.d.size*1.4, e.pos.z); }
// kind: 'phys' | 'bolt' | 'beam' | 'fire' | 'ice' | 'meteor'
const KIND_COL = { phys:0xffe6a0, bolt:0x9ffcff, ice:0xbdf3ff, meteor:0xff8c42, fire:0xff5a1a, beam:0xffb0d8 };
function isCold(e){ return e.frozen>0 || e.chill>0 || e.slow>0; }
function hit(e, dmg, o){
  if(e.dead || dmg<=0) return 0; o = o||{};
  const p = headPos(e), quiet = o.kind==='beam' || o.kind==='fire' || o.kind==='poison';
  if(e.guarded && !o.pierce) dmg *= 0.65;
  if(e.marked > 0) dmg *= 1.3;
  if(e.winded > 0) dmg *= 1.25;
  if(e.brittle && e.frozen > 0) dmg *= 1.5;
  if(e.poison && e.poison.corrode) dmg *= 1.2;
  if(o.cold && isCold(e)) dmg *= o.cold;
  if(o.crit && perk('double_crit')) dmg *= 2;
  if(e.bshield > 0){ e.bshield -= dmg; if(!quiet) num(p.x,p.y,p.z, 'BLOCK', 'blk'); if(e.bshield<=0){ e.bshield = 0; W.bubble(e.mesh, false); W.burst(p.x,p.y,p.z,0x7fd4ff,30,3,0.6,3.5,4,1.6); W.shock(e.pos.x, e.pos.z, 0x7fd4ff, 2, 0.5); sfx('shatter'); } return 0; }
  if(e.domeHp > 0 && !o.pierce && o.kind!=='poison'){
    e.domeHp -= dmg; if(!quiet) num(p.x,p.y,p.z, Math.round(dmg), 'shd'); e.flash = 0.05;
    if(e.domeHp <= 0){ e.domeHp = 0; W.dome(e.mesh, false); W.burst(p.x,p.y,p.z,0x7fb8ff,16,2.4,0.5,3,4,1.6); sfx('shatter'); }
    return 0;
  }
  if(e.shield > 0 && !o.pierce && o.kind!=='bolt' && o.kind!=='meteor' && o.kind!=='poison'){
    e.shield -= dmg; if(!quiet) num(p.x,p.y,p.z, Math.round(dmg), 'shd');
    if(e.shield <= 0){ e.shield = 0; if(e.mesh.shieldMesh) e.mesh.shieldMesh.visible = false; W.burst(p.x,p.y,p.z,0x7fb8ff,18,2.4,0.5,3,4,1.6); W.debris(p.x,p.y,p.z,0x7fb8ff,8,2.2); sfx('shatter'); }
    e.flash = 0.08; return 0;
  }
  let armor = e.armor + (G.cmd > 0 && e.type!=='commander' ? 2 : 0) - (e.poison && e.poison.corrode ? 4 : 0);
  let eff = (o.pierce || o.noArmor || o.kind==='poison') ? dmg : Math.max(1, dmg - Math.max(0, armor));
  if(o.assassin && (e.type==='boss'||e.type==='miniboss'||e.armor>=3)) eff *= 2;
  eff = quiet ? eff : Math.round(eff);
  const before = e.hp; e.hp -= eff; e.flash = quiet ? Math.max(e.flash, 0.03) : 0.1; e.hits++;
  if(eff > before) eff = Math.max(1, before);
  if(o.src){ o.src.dmg += eff; }
  if(o.crit){ SAVE.stats.crits = (SAVE.stats.crits||0)+1; dEv('crit', 1); }
  if(!quiet){
    const cls = o.crit ? 'crit' : (o.long ? 'long' : (o.kind==='ice'?'ice':(o.kind==='bolt'?'bolt':(e.guarded?'shd':''))));
    num(p.x,p.y,p.z, o.crit ? Math.round(eff)+'!' : (o.long ? '🔭 '+Math.round(eff) : Math.round(eff)), cls);
    W.flash(p.x, p.y, p.z, o.crit ? 0xffb347 : (KIND_COL[o.kind]||0xffffff), o.crit ? 1.6 : 0.7, o.crit ? 0.22 : 0.12);
    if(o.crit){ W.burst(p.x,p.y,p.z, 0xffb347, 16, 3.2, 0.35, 2.6, 2, 1.8); W.shock(e.pos.x, e.pos.z, 0xffb347, 0.8, 0.3, e.pos.y+0.1); }
    if(eff >= e.maxHp*0.3 || o.crit) sfx(o.crit ? 'acrit' : 'heavy'); else if(o.kind==='phys') sfx('hit');
  }
  if(e.type==='boss') bossPhases(e);
  if(e.hp <= 0) kill(e, o.src, o);
  return eff;
}
function goldMul(src){
  const ru = ruleDef();
  return (1 + 0.04*rs('bounty')) * (1 + 0.15*perk('kill_gold')) * (G.waveEv==='rush' ? 1.5 : 1) * (G.waveEv==='moon' ? 1.75 : 1) * ((ru && ru.goldMul) || 1)
    * (src && src.type==='sniper' && hasSyn(src,'invest') ? 2 : 1);
}
function kill(e, src, o){
  o = o || {};
  e.dead = true; G.kills++; if(src) src.kills++;
  let gold = Math.round(e.gold * goldMul(src));
  // banks tax kills nearby
  for(const b of G.towers){ if(b.type!=='bank') continue; if(Math.hypot(b.x-e.pos.x, b.z-e.pos.z) > stat(b,'range')) continue;
    const u = ultOf(b); let tax = Math.round(stat(b,'tax')); if(u && u.mod.taxAdd) tax += u.mod.taxAdd; gold += tax; b.dmg += tax; }
  if(perk('lucky') && Math.random() < 0.12){ gold += 25; num(e.pos.x, e.pos.y+1.3, e.pos.z, '🍀 +25', 'gold'); }
  G.gold += gold; G.earned += gold;
  SAVE.stats.kills++; if(src){ SAVE.stats.killsBy[src.type] = (SAVE.stats.killsBy[src.type]||0)+1; SAVE.mastery[src.type] = (SAVE.mastery[src.type]||0)+1; }
  if(o.hero){ G.heroKills++; SAVE.stats.heroKills = (SAVE.stats.heroKills||0)+1; heroXp(1); }
  if(G.night){ SAVE.stats.nightKills = (SAVE.stats.nightKills||0)+1; }
  dEv('kill', 1, { tower: src && src.type, enemy: e.type });
  if(e.ghost) SAVE.stats.ghosts++;
  const c = e.mesh.baseColor ? e.mesh.baseColor.getHex() : e.d.color, big = e.type==='boss'||e.type==='miniboss', hy = e.pos.y+e.d.size*1.4;
  if(e.type==='boss'){ SAVE.stats.bosses++; G.bossAlive--; dEv('boss', 1); if(G.t - e.born <= 20) chMark('speedboss'); bossDeath(e); }
  if(e.type==='miniboss'){ G.bossAlive--; W.shake(0.3); W.punch(0.4); }
  if(e.type==='commander'){ toast('👑 Commander down — the enemy loses its bonus!', 'good'); W.shock(e.pos.x, e.pos.z, 0xffc857, 3, 0.7); }
  if(e.type==='thief'){ G.gold += 15; G.earned += 15; num(e.pos.x, e.pos.y+0.9, e.pos.z, '+'+(gold+15)+' 💰', 'gold'); }
  else num(e.pos.x, e.pos.y+0.9, e.pos.z, '+'+gold, 'gold');
  W.burst(e.pos.x, hy, e.pos.z, c, big?90:22, big?4.5:2.6, 0.7, big?5:3.2, 6, 1.4);
  W.burst(e.pos.x, hy, e.pos.z, 0xffe14b, big?24:6, 2.0, 0.5, 2.5, 4, 1.2);
  W.debris(e.pos.x, hy, e.pos.z, c, big?26:(e.type==='swarmling'?2:7), big?4:2.4);
  W.flash(e.pos.x, hy, e.pos.z, 0xffffff, big?3.5:1.3, big?0.35:0.16);
  if(e.type!=='swarmling') W.shock(e.pos.x, e.pos.z, c, big?2.4:0.9, big?0.6:0.35);
  // splitters burst into splitlings
  if(e.d.split){ for(let i=0;i<e.d.split;i++){ const m = spawn('splitling', e.pos, e.seg, e.route); m.dist = e.dist - 0.12*i; m.pos.x += (Math.random()-0.5)*0.3; m.pos.z += (Math.random()-0.5)*0.3; if(e.sab) m.sab = null; }
    W.burst(e.pos.x, hy, e.pos.z, 0xf0a0e0, 30, 3, 0.6, 3, 4, 1.8); }
  // poison jumps to a neighbour; a Pandemic cloud lingers
  if(e.poison){ const P = e.poison, R = P.spread || 1.3; let best = null, bd = R*R;
    for(const n of G.enemies){ if(n.dead||n===e) continue; const dd = n.pos.distanceToSquared(e.pos); if(dd < bd){ bd = dd; best = n; } }
    if(best){ applyPoison(best, P.src, P.stacks); W.bolt(headPos(e).clone(), headPos(best).clone(), 0x9dff5a, 0.04, true); }
    if(P.pandemic) G.fires.push({ x:e.pos.x, z:e.pos.z, r:0.8, t:3, dps:P.dps*P.stacks*1.5, src:P.src, tick:0, toxic:true, mesh:W.firePatch(e.pos.x, e.pos.z, 0.8, 0x6ad83a) }); }
  if(perk('explode') && !o.boom) G.booms.push({ x:e.pos.x, z:e.pos.z, dmg:e.maxHp*0.15*perk('explode') });
  // the body pops and shrinks instead of vanishing
  G.dying = G.dying || []; G.dying.push({ mesh:e.mesh, t:0, s:e.mesh.scale.x }); e.mesh.bar.visible = false; e.mesh.userData.keep = true;
  sfx(big?'bosspop':'pop');
  chCheck();
}
function bossDeath(e){
  G.slowmo = 1.3; W.shake(0.7); W.punch(1);
  const p = e.pos;
  for(let i=0;i<3;i++) setTimeout(()=>W.shock(p.x, p.z, i===1?0xffffff:(bossInfo().bossTint||0xff5a5a), 3+i*1.2, 0.8), i*140);
  W.burst(p.x, 1, p.z, 0xffd54a, 120, 5.5, 1.2, 4, 7, 2.4); W.burst(p.x, 1, p.z, bossInfo().bossTint||0xff5a5a, 80, 4, 1, 5, 3, 2);
  W.flash(p.x, 1.2, p.z, 0xffffff, 7, 0.6);
  $('flashFx').classList.remove('go'); void $('flashFx').offsetWidth; $('flashFx').classList.add('go');
  sfx('bossdie'); hideBossBar();
  toast('👑 '+bossInfo().boss+' defeated!', 'good');
}
function bossPhases(e){
  const r = e.hp/e.maxHp;
  while(e.phase < TD.BOSS_PHASES.length && r <= TD.BOSS_PHASES[e.phase].at){
    const ph = TD.BOSS_PHASES[e.phase]; e.phase++;
    if(ph.kind==='enrage'){ e.enraged = true; e.speed *= 1.5; W.shock(e.pos.x, e.pos.z, 0xff2020, 2.6, 0.6); W.burst(e.pos.x, 1, e.pos.z, 0xff3030, 50, 4, 0.8, 4, 2, 2); }
    else if(ph.kind==='summon'){ for(let i=0;i<4;i++){ const m = spawn('grunt', e.pos, e.seg, e.route); m.dist = e.dist - 0.1*i; W.burst(e.pos.x,0.5,e.pos.z,0x6cbf4a,20,2.5,0.6,3,4,1.5); } W.portalFx(e.pos.x, e.pos.z, 0x6cbf4a); }
    else if(ph.kind==='shield'){ e.bshield = Math.round(e.maxHp*0.12); e.bshieldT = 5; W.bubble(e.mesh, true); W.shock(e.pos.x, e.pos.z, 0x7fd4ff, 2.2, 0.5); }
    toast('👑 '+bossInfo().boss+' '+ph.text, 'bad'); sfx('phase'); W.shake(0.25); W.punch(0.3);
    const mk = $('bbPh'+e.phase); if(mk) mk.classList.add('hit');
  }
}
// ---- boss signature moves ------------------------------------------
function towersNear(x, z, r){ return G.towers.filter(t=>Math.hypot(t.x-x, t.z-z) <= r); }
const DIS_TEXT = { ice:'FROZEN', melt:'MELTED', emp:'EMP!', stun:'STUNNED' };
function disableTower(t, sec, kind){
  t.dis = Math.max(t.dis, sec); t.disKind = kind; W.towerStatus(t.mesh, kind);
  if(t.beams) t.beams.forEach(b=>b.visible=false);
  num(t.x, 1.4, t.z, DIS_TEXT[kind]||'OFF', 'blk');
}
function bossSkill(e){
  const sk = bossInfo().bossSkill || 'stomp', def = TD.BOSS_SKILLS[sk];
  let k = sk; if(k==='warden') k = ['stomp','ice','portal'][e.skillN % 3]; e.skillN++;
  const p = e.pos, hp = headPos(e).clone();
  if(k==='stomp'){
    W.shock(p.x, p.z, 0xffc857, 2.9, 0.65); W.shock(p.x, p.z, 0xffffff, 1.9, 0.4); W.debris(p.x, 0.2, p.z, 0x8a6a4a, 18, 3.2); W.burst(p.x, 0.2, p.z, 0xd8c9a0, 50, 3.5, 0.7, 4, 5, 0.5);
    towersNear(p.x, p.z, 2.9).forEach(t=>disableTower(t, 2, 'stun')); sfx('stomp'); W.shake(0.45); W.punch(0.5);
  }else if(k==='storm'){
    G.storm.active = true; G.storm.timer = 7; $('stormFx').classList.add('show'); if(G.sel) W.showRing(G.sel.x, G.sel.z, stat(G.sel,'range'), true);
    W.shock(p.x, p.z, 0xd8b26a, 3.5, 0.9); sfx('storm');
  }else if(k==='ice'){
    const ts = G.towers.filter(t=>t.dis<=0).sort((a,b)=>towerValue(b)-towerValue(a)).slice(0,3);
    ts.forEach(t=>{ W.bolt(hp, new (window.THREE.Vector3)(t.x, 1, t.z), 0xbdf3ff, 0.07, true); disableTower(t, 3, 'ice'); W.burst(t.x, 0.8, t.z, 0xbdf3ff, 26, 2.6, 0.7, 3, 1, 1.8); W.debris(t.x, 1, t.z, 0xdff6ff, 8, 2); });
    W.shock(p.x, p.z, 0xbdf3ff, 2.5, 0.6); sfx('shatter'); sfx('freeze'); W.shake(0.2);
  }else if(k==='lava'){
    const ts = towersNear(p.x, p.z, 6).filter(t=>t.dis<=0).sort(()=>Math.random()-0.5).slice(0,3);
    ts.forEach((t,i)=>{ const mesh = W.projMesh('meteor'); mesh.scale.setScalar(0.55); mesh.position.copy(hp);
      G.projs.push({ kind:'meteor', mesh, from:hp.clone(), to:new (window.THREE.Vector3)(t.x, 0.3, t.z), t:-i*0.15, dur:0.85, lava:true, tower:t, dmg:0, splash:0 }); });
    W.burst(hp.x, hp.y, hp.z, 0xff5a1a, 40, 3, 0.6, 4, 2, 2); sfx('meteor');
  }else if(k==='portal'){
    W.portalFx(p.x, p.z, 0xb07cff); advance(e, 2.8); W.portalFx(e.pos.x, e.pos.z, 0xb07cff);
    for(let i=0;i<2;i++){ const m = spawn('runner', e.pos, e.seg, e.route); m.dist = e.dist - 0.2*(i+1); }
    sfx('portal'); W.shake(0.2);
  }else if(k==='emp'){
    W.shock(p.x, p.z, 0xff3cf0, 3.4, 0.7); W.shock(p.x, p.z, 0x2ef2ff, 2.4, 0.5); W.flash(p.x, 1, p.z, 0xff3cf0, 5, 0.4);
    towersNear(p.x, p.z, 3.4).forEach(t=>disableTower(t, 1.8, 'emp')); e.invisT = 2.2; sfx('emp'); W.shake(0.3); W.punch(0.4);
  }
  toast('👑 '+bossInfo().boss+': '+def.icon+' '+def.name+'!', 'bad');
  $('bbSkill').textContent = def.icon+' '+def.name; $('bossBar').classList.remove('cast'); void $('bossBar').offsetWidth; $('bossBar').classList.add('cast');
}
function showBossBar(e){
  const def = TD.BOSS_SKILLS[bossInfo().bossSkill||'stomp'];
  $('bbName').textContent = '👑 '+bossInfo().boss; $('bbSkill').textContent = def.icon+' '+def.name+' — '+def.desc;
  [1,2,3].forEach(i=>$('bbPh'+i).classList.remove('hit'));
  $('bossBar').classList.add('show'); $('app').classList.add('bossOn'); updateBossBar();
}
function hideBossBar(){ $('bossBar').classList.remove('show'); $('app').classList.remove('bossOn'); }
function updateBossBar(){
  const e = G.boss; if(!e) return;
  if(e.dead){ G.boss = G.enemies.find(o=>!o.dead && o.type==='boss') || null; if(!G.boss){ hideBossBar(); return; } }
  const b = G.boss; $('bbFill').style.width = Math.max(0, b.hp/b.maxHp*100).toFixed(1)+'%';
  $('bbShield').style.width = b.bshield>0 ? Math.min(100, b.bshield/b.maxHp*100/0.12).toFixed(1)+'%' : '0%';
  $('bbHp').textContent = Math.max(0, Math.ceil(b.hp)).toLocaleString('en-US')+' / '+b.maxHp.toLocaleString('en-US');
}

// ---- frost: chill stacks up until the enemy freezes solid ----
function applySlow(e, s, t, src){
  e.slow = Math.max(e.slow, s); e.slowT = Math.max(e.slowT, t);
  if(!src) return;
  if(e.freezeImm > 0 || e.frozen > 0) return;
  e.chill++;
  const need = Math.max(2, Math.round(stat(src,'stacks')||6));
  if(e.chill >= need){ e.chill = 0; freezeOne(e, stat(src,'freezeT')||1); e.freezeImm = e.type==='boss' ? 5 : 2.2; if(flag(src,'brittle')) e.brittle = true; sfx('shatter'); }
}
function freezeOne(e, t){
  if(e.type==='boss') t *= e.enraged ? 0.35 : 0.5;
  if(e.frozen <= 0){ SAVE.stats.frozen++; dEv('frozen', 1); }
  e.frozen = Math.max(e.frozen, t); e.chill = 0;
  W.burst(e.pos.x, e.pos.y+0.4, e.pos.z, 0xbdf3ff, 14, 1.8, 0.6, 2.4, 1, 1.4); W.debris(e.pos.x, e.pos.y+0.4, e.pos.z, 0xdff6ff, 5, 1.6);
  W.shock(e.pos.x, e.pos.z, 0xbdf3ff, 0.8, 0.35);
}
// ---- venom: poison stacks tick through armor ----
function applyPoison(e, src, n){
  if(!src || e.dead) return;
  const max = Math.round(stat(src,'stacks')||3), dps = stat(src,'dmg')||6;
  if(!e.poison) e.poison = { stacks:0, t:0, dps, src };
  const P = e.poison; P.stacks = Math.min(max, P.stacks + (n||1)); P.t = stat(src,'poisonT')||4; P.dps = Math.max(P.dps, dps); P.src = src;
  P.spread = flag(src,'spread') || 1.3; P.corrode = !!flag(src,'corrode') || P.corrode; P.pandemic = !!flag(src,'pandemic') || P.pandemic;
}
// ---- wind: push an enemy back along its road ----
function retreat(e, amt){
  if(e.sab && e.sab.state!=='road' && e.sab.state!=='done') return;
  while(amt > 0){
    const back = e.route[e.seg]; const dx = back.x-e.pos.x, dz = back.z-e.pos.z, L = Math.hypot(dx,dz);
    if(L <= amt){ e.pos.x = back.x; e.pos.z = back.z; e.dist -= L; amt -= L; if(e.seg === 0) break; e.seg--; }
    else { e.pos.x += dx/L*amt; e.pos.z += dz/L*amt; e.dist -= amt; amt = 0; }
  }
  e.reached = false;
}
function knock(e, amt){
  if(e.dead || e.air || e.kbImm > 0) return false;
  const k = e.type==='boss' ? 0.25 : (e.type==='miniboss'||e.type==='commander' ? 0.5 : 1);
  retreat(e, amt*k); e.kbImm = 1.1; return true;
}
function recoil(t, a){ t.recoil = Math.max(t.recoil, a); }
function nearestVenom(t){ let best = null, bd = 99; for(const o of G.towers){ if(o.type!=='venom') continue; const d = Math.max(Math.abs(o.cx-t.cx), Math.abs(o.cz-t.cz)); if(d < bd){ bd = d; best = o; } } return best; }
function fire(t, e){
  const d = TOWERS[t.type], dmg = stat(t,'dmg'), m = muzzleWorld(t); t.shots++;
  const sm = synMul();
  if(d.proj==='arrow' || d.proj==='ice' || d.proj==='venom'){
    // Volley ultimate: three arrows at three different enemies
    let targets = [e];
    const vol = d.proj==='arrow' ? flag(t,'volley') : 0;
    if(vol){ const r = stat(t,'range'); const others = G.enemies.filter(o=>!o.dead && !o.invis && o!==e && canHit(t,o) && inRange(t,o,r)).sort((a,b)=>b.dist-a.dist); targets = [e].concat(others.slice(0, vol-1)); while(targets.length < vol) targets.push(e); }
    const critMul = hasSyn(t,'spotter') ? 3.0 : d.critMul;
    for(const tg of targets){
      const mesh = W.projMesh(d.proj); mesh.position.copy(m);
      let crit = false; if(d.proj==='arrow' && Math.random() < stat(t,'critChance')) crit = true;
      if(mesh.glow){ mesh.glow.material.color.set(crit ? 0xff7a2a : (d.proj==='arrow' ? 0xffe6a0 : (d.proj==='ice' ? 0xbdf3ff : 0x9dff5a))); mesh.glow.scale.setScalar(crit ? 1.1 : (d.proj==='arrow'?0.55:0.9)); }
      G.projs.push({ kind:d.proj, mesh, pos:m.clone(), target:tg, speed:d.proj==='arrow'?(crit?19:15):(d.proj==='venom'?9:10), dmg: crit ? dmg*critMul : dmg, crit, src:t, slow:stat(t,'slow')||0, slowT:stat(t,'slowT')||0, life:3, noArmor:!!flag(t,'pierceArmor') });
    }
    W.burst(m.x, m.y, m.z, d.accent, 3, 1.2, 0.2, 1.6, 0, 1); W.flash(m.x, m.y, m.z, d.accent, 0.6, 0.1); sfx(d.proj==='arrow'?'arrow':(d.proj==='ice'?'ice':'heal')); recoil(t, 0.06);
    // Blizzard ultimate: every shot also chills everything in range
    if(flag(t,'blizzard')){ const r = stat(t,'range'); W.shock(t.x, t.z, 0xbdf3ff, r, 0.5);
      for(const o of G.enemies){ if(o.dead || o===e || !canHit(t,o) || !inRange(t,o,r)) continue; hit(o, dmg*0.4, { kind:'ice', src:t }); if(!o.dead) applySlow(o, stat(t,'slow'), stat(t,'slowT'), t); } }
  }else if(d.proj==='shell'){
    const mesh = W.projMesh('shell'); mesh.position.copy(m);
    const dist = Math.hypot(e.pos.x-m.x, e.pos.z-m.z), dur = clamp(dist/7, 0.35, 0.9);
    const to = predict(e, dur); to.y = 0.08;
    const every = hasSyn(t,'incend') || flag(t,'napalm') ? 1 : Math.max(1, Math.round(stat(t,'fireEvery')||3));
    G.projs.push({ kind:'shell', mesh, from:m.clone(), to, t:0, dur, dmg, splash:stat(t,'splash'), src:t, burn:!!flag(t,'burn'), quake:flag(t,'quake')||0,
      fireGround: t.shots % every === 0, fireT: stat(t,'fireT')||2, napalm:!!flag(t,'napalm'), cluster:flag(t,'cluster')||0, cold: hasSyn(t,'thermal') ? 1 + 0.4*sm : 0,
      arc:(1.2+dist*0.25)*(G.map.effect==='lowgrav'?1.6:1) });
    W.burst(m.x, m.y, m.z, 0xffb347, 12, 2.4, 0.3, 2.4, 0, 1.2); W.burst(m.x, m.y, m.z, 0x777777, 8, 1.0, 0.7, 3.5, -1, 1.2); W.flash(m.x, m.y, m.z, 0xffb347, 1.4, 0.14);
    sfx('shell'); W.shake(0.04); recoil(t, 0.16);
  }else if(d.proj==='bolt'){
    const chain = Math.round(stat(t,'chain')), fall = Math.min(1, stat(t,'chainFall')||d.chainFall); let cur = e, from = m, prev = null, returns = Math.round(stat(t,'returns')||0), ret = false;
    const cold = hasSyn(t,'super') ? 1 + 0.6*sm : 0;
    const done = new Set([e]);
    W.flash(m.x, m.y, m.z, 0x9ffcff, 1.3, 0.14);
    for(let i=0;i<chain;i++){
      const p = headPos(cur).clone();
      W.bolt(from, p, ret ? 0xffffff : (cold && isCold(cur) ? 0x7fe8ff : 0x9ffcff), ret ? 0.07 : 0.05, true); ret = false; W.burst(p.x,p.y,p.z, 0x9ffcff, 8, 1.8, 0.25, 2.2, 0, 1.6); W.flash(p.x,p.y,p.z, 0x9ffcff, 0.9, 0.12);
      if(cold && cur.frozen > 0){ W.debris(p.x, p.y, p.z, 0xdff6ff, 5, 2); }
      hit(cur, Math.round(dmg*Math.pow(fall,i)), { kind:'bolt', src:t, cold });
      if(flag(t,'stun') && !cur.dead){ cur.stun = Math.max(cur.stun, flag(t,'stun')); }
      let next = null, bd = 1.9*1.9;
      for(const o of G.enemies){ if(o.dead||o.invis||done.has(o)||!canHit(t,o)) continue; const dd = o.pos.distanceToSquared(cur.pos); if(dd<bd){ bd=dd; next=o; } }
      // nothing new in reach: the arc snaps back to the enemy it just came from
      if(!next && returns > 0 && prev && !prev.dead && prev.pos.distanceToSquared(cur.pos) < 2.4*2.4){ next = prev; returns--; ret = true; sfx('return'); num(cur.pos.x, cur.pos.y+0.9, cur.pos.z, '↩', 'bolt'); }
      if(!next) break; done.add(next); from = p; prev = cur; cur = next;
    }
    // Thunderstorm ultimate: a bolt from the sky every few attacks
    const th = flag(t,'thunder');
    if(th && t.shots % th === 0){ const r = stat(t,'range'); const pool = G.enemies.filter(o=>!o.dead && !o.invis && canHit(t,o) && inRange(t,o,r));
      if(pool.length){ const tg = pool[Math.floor(Math.random()*pool.length)], p = headPos(tg).clone();
        W.bolt(new (window.THREE.Vector3)(p.x+(Math.random()-0.5), 9, p.z+(Math.random()-0.5)), p, 0xffffff, 0.12, true); W.shock(tg.pos.x, tg.pos.z, 0x9ffcff, 1.4, 0.4); W.flash(p.x, p.y, p.z, 0xffffff, 3, 0.3);
        hit(tg, dmg*3, { kind:'bolt', src:t, cold });
        for(const o of G.enemies){ if(o.dead||o===tg) continue; if(o.pos.distanceTo(tg.pos) < 0.9) hit(o, dmg, { kind:'bolt', src:t }); }
        sfx('bigzap'); W.shake(0.1); } }
    sfx('zap');
  }else if(d.proj==='tracer'){
    const p = headPos(e).clone(); let crit = false, k = 1;
    if(flag(t,'crit') && t.shots % 3 === 0){ crit = true; k = flag(t,'crit'); }
    if(!crit && hasSyn(t,'spotter') && Math.random() < 0.15*sm + 0.03*rs('crit')){ crit = true; k = 2; }
    // long shot: the further the target, the harder it hits
    const r = stat(t,'range'), far = Math.hypot(e.pos.x-t.x, e.pos.z-t.z)/r, lb = 1 + (d.longShot||0)*clamp((far-0.4)/0.55, 0, 1), long = lb > 1.35;
    W.bolt(m, p, crit?0xff7a7a:(long?0xffe27a:0xffd0d0), crit?0.07:(long?0.05:0.03), false); W.burst(p.x,p.y,p.z, 0xffffff, crit?22:10, 2.4, 0.25, 2.2, 0, 1.6);
    W.burst(m.x, m.y, m.z, 0xffb347, 6, 1.5, 0.2, 1.6, 0, 1); W.flash(m.x, m.y, m.z, 0xffd0a0, 1.2, 0.12);
    if(flag(t,'mark')){ e.marked = 4; }
    hit(e, Math.round(dmg*k*lb), { kind:'phys', pierce:true, src:t, assassin:!!flag(t,'assassin'), crit, long: long && !crit }); sfx(crit?'crit':(long?'long':'snipe'));
    // Execute ultimate
    const ex = flag(t,'execute');
    if(ex && !e.dead && e.type!=='boss' && e.type!=='miniboss' && e.hp/e.maxHp < ex){ num(p.x, p.y+0.4, p.z, '☠️ EXECUTE', 'crit'); W.flash(p.x, p.y, p.z, 0xff3c3c, 1.6, 0.25); hit(e, e.hp+1, { kind:'phys', pierce:true, src:t }); }
    recoil(t, 0.2); if(crit||long) W.shake(crit?0.1:0.05);
  }else if(d.proj==='gust'){
    const R = stat(t,'gustR')||0.9, push = stat(t,'push')||0.7, venom = hasSyn(t,'toxic') ? nearestVenom(t) : null;
    const tp = e.pos.clone();
    W.bolt(m, new (window.THREE.Vector3)(tp.x, 0.5, tp.z), 0xe8fffb, 0.08, false); W.shock(tp.x, tp.z, 0xe8fffb, R*1.2, 0.4); W.burst(tp.x, 0.4, tp.z, 0xe8fffb, 16, 3, 0.4, 2.6, 0, 0.6);
    let n = 0;
    for(const o of G.enemies){ if(o.dead || o.invis || !canHit(t,o)) continue; if(Math.hypot(o.pos.x-tp.x, o.pos.z-tp.z) > R + o.d.size) continue;
      hit(o, dmg, { kind:'phys', src:t }); if(o.dead) continue;
      const p2 = o.air ? 0 : push; if(p2 && knock(o, p2)) n++;
      if(o.air && flag(t,'air')) o.slowT = Math.max(o.slowT, 1), o.slow = Math.max(o.slow, 0.4);
      if(flag(t,'winded')) o.winded = 3;
      if(venom) applyPoison(o, venom, 1); }
    if(n) num(tp.x, 1.1, tp.z, '💨', 'ice');
    const tn = flag(t,'tornado'); if(tn && t.shots % tn === 0) spawnTornado(e);
    sfx('storm'); recoil(t, 0.08);
  }
}
function spawnTornado(e){
  if(e.air || !e.route) return;
  const o = { route:e.route, seg:e.seg, pos:e.pos.clone(), dist:e.dist, left:3.2, mesh:W.makeTornado(), sab:null };
  o.mesh.position.copy(o.pos); G.tornados.push(o); W.shock(o.pos.x, o.pos.z, 0xe8fffb, 1.2, 0.5);
}
function predict(e, dt){
  const p = e.pos.clone(); let seg = e.seg, left = e.speed*(1-e.slow)*(e.hasted?1.3:1)*dt;
  if(e.sab && e.sab.state!=='road') return p;
  while(left>0 && seg<e.route.length-1){
    const nxt = e.route[seg+1]; const dx = nxt.x-p.x, dz = nxt.z-p.z, L = Math.hypot(dx,dz);
    if(L<=left){ p.x = nxt.x; p.z = nxt.z; left -= L; seg++; } else { p.x += dx/L*left; p.z += dz/L*left; left = 0; }
  }
  return p;
}
const _beamCol = new (window.THREE.Color)(), _white = new (window.THREE.Color)(0xffffff);
function laserTick(t, dt){
  const d = TOWERS[t.type];
  if(!t.target || t.dis > 0){ t.ramp = Math.max(1, t.ramp - dt*2); t.beams.forEach(b=>b.visible=false); return; }
  const heatRate = (1 + 0.5*perk('laser_heat')) * (hasSyn(t,'incend') ? 1 + 0.5*synMul() : 1);
  const maxRamp = flag(t,'ramp') || 2.2; t.ramp = Math.min(maxRamp, t.ramp + dt*heatRate*(maxRamp-1)/2.2);
  const heat = (t.ramp-1)/(maxRamp-1||1);
  const dps = stat(t,'dmg') * t.ramp, m = muzzleWorld(t);
  const targets = [t.target];
  const nb = flag(t,'beams')||1;
  if(nb > 1){ const r = stat(t,'range'); const others = G.enemies.filter(o=>!o.dead&&!o.invis&&o!==t.target&&canHit(t,o)&&inRange(t,o,r)).sort((a,b)=>b.dist-a.dist); for(const o of others){ if(targets.length>=nb) break; targets.push(o); } }
  while(t.beams.length < nb) t.beams.push(W.makeBeam(d.accent));
  _beamCol.set(d.accent).lerp(_white, heat*0.85);
  const melt = flag(t,'meltdown') && heat > 0.8;
  for(let i=0;i<t.beams.length;i++){
    const b = t.beams[i], e = targets[i];
    if(!e){ b.visible = false; continue; }
    const hp = headPos(e).clone();
    W.setBeam(b, m, hp, 0.8 + t.ramp*0.55); b.material.color.copy(_beamCol); b.material.opacity = 0.75 + Math.random()*0.25;
    const eff = hit(e, dps*dt, { kind:'beam', src:t });
    t.acc += eff;
    if(melt){ for(const o of G.enemies){ if(o.dead||o===e) continue; if(o.pos.distanceTo(e.pos) < 1.0) hit(o, dps*dt*0.3, { kind:'fire', src:t }); } if(Math.random()<dt*12) W.shock(e.pos.x, e.pos.z, 0xff7a2a, 1.0, 0.3); }
    if(Math.random() < dt*(10+heat*20)) W.burst(hp.x, hp.y, hp.z, heat>0.8?0xffffff:d.accent, 2, 1.2+heat, 0.25, 1.8, 0, 1.4);
    if(Math.random() < dt*8) W.flash(hp.x, hp.y, hp.z, _beamCol.getHex(), 0.5+heat*0.9, 0.1);
  }
  if(t.mesh.glow){ t.mesh.glow.material.opacity = 0.5 + heat*0.5; t.mesh.glow.scale.setScalar(1.2 + heat*1.2); }
  t.accT += dt; if(t.accT >= 0.5){ if(t.acc > 0 && t.target && !t.target.dead) num(t.target.pos.x, t.target.pos.y+t.target.d.size*1.4, t.target.pos.z, Math.round(t.acc)+(heat>0.95?' 🔥':''), 'beam'); t.acc = 0; t.accT = 0; sfx('laser'); }
}

// ---- abilities -------------------------------------------------------
function abilityUnlocked(a){ return ulevel() >= a.unlock; }
function cdMul(){ return (1 - 0.06*rs('arcana')) * Math.pow(0.7, perk('abil_cd')); }
function useAbility(id){
  const a = TD.ABILITIES.find(x=>x.id===id); if(!a || G.over || G.phase==='menu') return;
  if(!abilityUnlocked(a)){ toast('🔒 '+a.name+' unlocks at player level '+a.unlock, 'bad'); sfx('nope'); return; }
  const ru = ruleDef(); if(ru && ru.noAbil){ toast('🔕 No abilities in this challenge', 'bad'); sfx('nope'); return; }
  if(G.cd[id] > 0){ sfx('nope'); return; }
  if(a.target){ G.targetMode = G.targetMode===id ? null : id; G.buildType = null; deselect(); W.hideGhost(); if(!G.targetMode) W.hideMarker(); renderBuildBar(); renderAbilities(); sfx('click'); return; }
  castAbility(id, null);
}
function castAbility(id, at){
  const a = TD.ABILITIES.find(x=>x.id===id);
  G.cd[id] = a.cd*cdMul(); SAVE.stats.abilities++; dEv('abil', 1); chCheck(); G.targetMode = null; W.hideMarker(); renderAbilities();
  const mul = TD.hpMul(Math.max(1,G.wave), mapDiff(G.map));
  if(id==='meteor'){
    const mesh = W.projMesh('meteor'); mesh.scale.setScalar(1); const from = at.clone(); from.y = 11; from.x -= 2.5; mesh.position.copy(from);
    G.projs.push({ kind:'meteor', mesh, from, to:at.clone(), t:0, dur:0.75, dmg:Math.round(150*mul), splash:1.9 });
    W.showMarker(at.x, at.z, 1.9); sfx('meteor');
  }else if(id==='freeze'){
    for(const e of G.enemies){ if(!e.dead) freezeOne(e, 3.0); }
    W.burst(G.map.w/2, 1.5, G.map.h/2, 0xbdf3ff, 160, 6, 1.2, 4, 1, 2.2); sfx('freeze'); W.shake(0.15); W.shock(G.map.w/2, G.map.h/2, 0xbdf3ff, 9, 0.9); W.punch(0.4);
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
    sfx('bigzap'); W.shake(0.2); W.punch(0.3);
  }else if(id==='overdrive'){
    G.overdrive = 8; sfx('overdrive'); W.shake(0.12); W.punch(0.3);
    for(const t of G.towers){ W.shock(t.x, t.z, 0xff8c42, 1.2, 0.5); W.flash(t.x, 1, t.z, 0xff8c42, 2, 0.4); W.burst(t.x, 0.8, t.z, 0xffb347, 12, 2.4, 0.5, 2.6, 1, 2); }
    $('odFx').classList.add('show'); toast('🔥 OVERDRIVE — towers fire 60% faster!', 'good');
  }
}

// ---- last stand: once per wave, shove the whole army back ------------
function lastStandMax(){ return 1 + perk('second_wind'); }
function useLastStand(){
  if(G.phase!=='wave' || G.over){ toast('🚨 Last Stand works during a wave', 'bad'); sfx('nope'); return; }
  if(G.lastStand >= lastStandMax()){ toast('🚨 Last Stand already used this wave', 'bad'); sfx('nope'); return; }
  G.lastStand++; if(G.lives <= 3) chMark('laststand');
  const c = G.map.castle.position;
  for(let i=0;i<4;i++) setTimeout(()=>W.shock(c.x, c.z, i%2?0xffffff:0xff5a5a, 4+i*3.5, 0.9), i*110);
  W.flash(c.x, 1.2, c.z, 0xffffff, 8, 0.6); W.burst(c.x, 1, c.z, 0xffe27a, 120, 7, 1, 4, 2, 2.4);
  $('flashFx').classList.remove('go'); void $('flashFx').offsetWidth; $('flashFx').classList.add('go');
  for(const e of G.enemies){ if(e.dead) continue; const boss = e.type==='boss';
    if(!e.air){ e.kbImm = 0; retreat(e, boss ? 0.8 : 2.2); }
    e.stun = Math.max(e.stun, boss ? 0.4 : 1.2);
    if(!boss) hit(e, e.hp*0.1, { kind:'meteor' });
    W.burst(e.pos.x, e.pos.y+0.4, e.pos.z, 0xffe27a, 6, 2, 0.4, 2.4, 2, 1.2); }
  sfx('bigboom'); sfx('stomp'); W.shake(0.7); W.punch(1);
  toast('🚨 LAST STAND! The castle strikes back', 'good'); renderAbilities();
}
// ---- the hero: a knight you move around the island --------------------
function heroStats(){ const H = TD.HERO, h = G.hero, lv = h ? h.lvl : 1, rsm = 1 + 0.1*rs('hero'), pm = 1 + 0.6*perk('hero_pow');
  return { dmg: H.dmg * (1 + 0.14*(lv-1)) * (1 + 0.09*Math.max(0,G.wave-1)) * rsm * pm, maxHp: Math.round(H.hp * (1 + 0.12*(lv-1)) * (1 + 0.07*Math.max(0,G.wave-1)) * rsm * (1 + 0.5*perk('hero_pow'))) }; }
function spawnHero(){
  const c = G.map.castle.position, dir = G.map.route[G.map.route.length-2];
  const x = clamp(c.x + (dir.x - c.x)*0.5, 0.3, G.map.w-0.3), z = clamp(c.z + (dir.z - c.z)*0.5, 0.3, G.map.h-0.3);
  G.hero = { x, z, tx:x, tz:z, lvl:1, xp:0, cool:0, swing:0, dead:0, yaw:0, mesh:W.makeHero(), hp:0, maxHp:0 };
  const st = heroStats(); G.hero.hp = G.hero.maxHp = st.maxHp; G.hero.mesh.position.set(x, 0, z);
}
function heroXp(n){ const h = G.hero; if(!h) return; h.xp += n; const need = 4 + h.lvl*3;
  if(h.xp >= need && h.lvl < 10){ h.xp -= need; h.lvl++; const st = heroStats(); h.maxHp = st.maxHp; h.hp = h.maxHp; W.burst(h.x, 0.8, h.z, 0xffe27a, 40, 3, 0.8, 3, 2, 2.4); W.shock(h.x, h.z, 0xffe27a, 1.4, 0.5); num(h.x, 1.3, h.z, 'LEVEL '+h.lvl, 'long'); sfx('upgrade'); } }
function heroTick(dt){
  const h = G.hero; if(!h) return;
  const m = h.mesh;
  if(h.dead > 0){ h.dead -= dt; m.visible = false;
    if(h.dead <= 0){ const c = G.map.castle.position; h.x = h.tx = clamp(c.x, 0.3, G.map.w-0.3); h.z = h.tz = clamp(c.z, 0.3, G.map.h-0.3); const st = heroStats(); h.maxHp = st.maxHp; h.hp = h.maxHp; m.visible = true; W.portalFx(h.x, h.z, 0xffc857); toast('🛡️ '+TD.HERO.name+' is back!', 'good'); }
    return; }
  const st = heroStats(); if(h.maxHp !== st.maxHp){ h.hp *= st.maxHp/h.maxHp; h.maxHp = st.maxHp; }
  const dx = h.tx-h.x, dz = h.tz-h.z, L = Math.hypot(dx,dz), moving = L > 0.05;
  if(moving){ const mv = Math.min(L, TD.HERO.speed*dt); h.x += dx/L*mv; h.z += dz/L*mv; h.yaw = Math.atan2(dx, dz); }
  // enemies next to the hero chip away at him
  let near = 0, target = null, bd = TD.HERO.range*TD.HERO.range;
  for(const e of G.enemies){ if(e.dead || e.air || e.invis) continue; const ex = e.pos.x-h.x, ez = e.pos.z-h.z, d2 = ex*ex+ez*ez;
    if(d2 < 0.36) near += (e.type==='boss' ? 6 : (e.type==='miniboss'||e.type==='commander' ? 3 : 1));
    if(d2 < bd){ bd = d2; target = e; } }
  if(near){ h.hp -= near*(3 + G.wave*0.9)*dt; if(Math.random()<dt*6) W.burst(h.x, 0.6, h.z, 0xff5a5a, 1, 1, 0.3, 1.8, 2, 1); }
  else h.hp = Math.min(h.maxHp, h.hp + h.maxHp*0.03*dt);
  if(h.hp <= 0){ h.dead = TD.HERO.respawn; W.burst(h.x, 0.6, h.z, 0x2a5bd8, 40, 3, 0.8, 3, 5, 2); W.debris(h.x, 0.6, h.z, 0xc8d0dc, 12, 3); toast('🛡️ '+TD.HERO.name+' has fallen — back in '+TD.HERO.respawn+'s', 'bad'); sfx('life'); if(G.heroMode){ G.heroMode = false; renderAbilities(); } return; }
  h.cool -= dt; h.swing = Math.max(0, h.swing - dt*4);
  if(target && !moving){ h.yaw = Math.atan2(target.pos.x-h.x, target.pos.z-h.z);
    if(h.cool <= 0){ h.cool = 1/TD.HERO.rate; h.swing = 1; const p = headPos(target).clone();
      W.burst(p.x, p.y, p.z, 0xbdf3ff, 8, 2, 0.25, 2.2, 0, 1.4); W.flash(p.x, p.y, p.z, 0x9ff0ff, 0.9, 0.12);
      hit(target, st.dmg, { kind:'phys', hero:true }); sfx('hit'); } }
  m.position.set(h.x, 0, h.z); m.rotation.y = h.yaw;
  W.animateHero(m, G.t, moving, h.swing);
  m.fill.scale.x = Math.max(0.001, h.hp/h.maxHp);
}
function heroSelectToggle(){
  if(!G.hero){ toast('🔒 The hero joins at player level '+TD.HERO.unlock, 'bad'); sfx('nope'); return; }
  if(G.hero.dead > 0){ toast('🛡️ Respawning in '+Math.ceil(G.hero.dead)+'s', 'bad'); sfx('nope'); return; }
  G.heroMode = !G.heroMode; G.buildType = null; G.targetMode = null; if(G.heroMode) deselect(); renderBuildBar(); renderAbilities(); sfx('click');
}
// ---- roguelike perks --------------------------------------------------
function offerPerks(){
  const has = k => G.loadout.includes(k);
  const towerPerk = { tesla_chain:'tesla', frost_slow:'frost', archer_crit:'archer', cannon_splash:'cannon', sniper_dmg:'sniper', laser_heat:'laser', venom_stack:'venom', wind_push:'wind' };
  const pool = TD.PERKS.filter(p=>!(towerPerk[p.id] && !has(towerPerk[p.id])) && !(p.id==='hero_pow' && !G.hero) && !(p.id==='second_wind' && perk('second_wind')));
  const pick = [];
  while(pick.length < 3 && pick.length < pool.length){
    let r = Math.random()*100, rar = r < 10 ? 2 : (r < 40 ? 1 : 0);
    let opts = pool.filter(p=>p.r===rar && !pick.includes(p)); if(!opts.length) opts = pool.filter(p=>!pick.includes(p));
    pick.push(opts[Math.floor(Math.random()*opts.length)]);
  }
  G.perkPending = 1; G.perkOffer = pick; G.phase = 'perk';
  const host = $('perkCards');
  host.innerHTML = pick.map((p,i)=>'<button class="perkCard r'+p.r+'" data-i="'+i+'" style="animation-delay:'+(i*0.09)+'s"><span class="pkRar">'+TD.PERK_RARITY[p.r].name+'</span><span class="pkIcon">'+p.icon+'</span><b>'+p.name+'</b><span class="pkDesc">'+p.desc+'</span>'+(perk(p.id)?'<i>owned ×'+perk(p.id)+'</i>':'')+'<em>'+(i+1)+'</em></button>').join('');
  host.querySelectorAll('.perkCard').forEach(b=>b.addEventListener('click', ()=>choosePerk(+b.dataset.i)));
  $('perkWave').textContent = 'Wave '+G.wave+' cleared — choose a perk';
  $('perkWrap').classList.add('show'); sfx('daily');
}
function choosePerk(i){
  const p = G.perkOffer && G.perkOffer[i]; if(!p || G.phase!=='perk') return;
  G.perks[p.id] = (G.perks[p.id]||0) + 1; G.perkPending = 0;
  if(p.id==='gold_now'){ const g = 120 + G.wave*10; G.gold += g; G.earned += g; }
  if(p.id==='lives'){ G.lives += 5; }
  if(p.id==='syn_range') recomputeSyn();
  if(p.id==='hero_pow' && G.hero){ const st = heroStats(); G.hero.maxHp = st.maxHp; G.hero.hp = st.maxHp; }
  $('perkWrap').classList.remove('show'); G.phase = 'build'; G.buildTimer = TD.BUILD_TIME;
  toast(p.icon+' '+p.name+' — '+p.desc, 'good'); sfx('level');
  G.towers.forEach(t=>W.flash(t.x, 1, t.z, 0xffe27a, 1.5, 0.3));
  renderHud(); renderWaveBtn(); renderChips(); renderAbilities(); if(G.sel) renderPanel();
}

// ---- simulation step -------------------------------------------------
// walk an enemy forward along its route
function advance(e, left){
  if(e.seg >= e.route.length-1){ if(left > 0) e.reached = true; return; }
  while(left>0 && e.seg < e.route.length-1){
    const nxt = e.route[e.seg+1]; const dx = nxt.x-e.pos.x, dz = nxt.z-e.pos.z, L = Math.hypot(dx,dz);
    if(L<=left){ e.pos.x = nxt.x; e.pos.z = nxt.z; left -= L; e.dist += L; e.seg++; if(e.seg===e.route.length-1) e.reached = true; }
    else { e.pos.x += dx/L*left; e.pos.z += dz/L*left; e.dist += left; e.yaw = Math.atan2(dx, dz); left = 0; }
  }
}
// the saboteur leaves the road, shuts down a tower, then walks back
function saboteurTick(e, dt, move){
  const s = e.sab;
  if(s.state==='road'){
    s.wait -= dt; if(s.wait > 0) return false;
    let best = null, bv = 0;
    for(const t of G.towers){ if(t.dis > 0) continue; const dd = Math.hypot(t.x-e.pos.x, t.z-e.pos.z); if(dd > 2.6) continue; const v = towerValue(t); if(v > bv){ bv = v; best = t; } }
    if(best){ s.state = 'go'; s.tower = best; s.ax = e.pos.x; s.az = e.pos.z; num(e.pos.x, e.pos.y+1, e.pos.z, '⚠️ SABOTAGE', 'blk'); sfx('phase'); }
    else s.wait = 0.4;
    return false;
  }
  const tx = s.state==='go' ? s.tower.x : s.ax, tz = s.state==='go' ? s.tower.z : s.az;
  const dx = tx-e.pos.x, dz = tz-e.pos.z, L = Math.hypot(dx,dz);
  const stop = s.state==='go' ? 0.5 : 0.02;
  if(s.state==='go' && !G.towers.includes(s.tower)){ s.state = 'back'; return true; }
  if(L > stop + 0.03){ const mv = Math.min(move, L-stop); e.pos.x += dx/L*mv; e.pos.z += dz/L*mv; e.yaw = Math.atan2(dx, dz); }
  else if(s.state==='go'){
    disableTower(s.tower, 4, 'emp'); W.shock(s.tower.x, s.tower.z, 0xff3c6a, 1.4, 0.5); W.flash(s.tower.x, 1, s.tower.z, 0xff3c6a, 2.2, 0.3); W.bolt(headPos(e).clone(), new (window.THREE.Vector3)(s.tower.x, 1, s.tower.z), 0xff3c6a, 0.05, true);
    sfx('emp'); s.state = 'back';
  } else { e.pos.x = s.ax; e.pos.z = s.az; s.state = 'done'; }
  return true;
}
function step(dt){
  // boss death slows time for a dramatic beat
  if(G.slowmo > 0){ G.slowmo -= dt; dt *= 0.35; }
  G.t += dt;
  for(const k in G.cd) if(G.cd[k] > 0) G.cd[k] = Math.max(0, G.cd[k]-dt);
  if(G.overdrive > 0){ G.overdrive -= dt; if(G.overdrive <= 0){ G.overdrive = 0; $('odFx').classList.remove('show'); }
    if(Math.random() < dt*20 && G.towers.length){ const t = G.towers[Math.floor(Math.random()*G.towers.length)]; W.burst(t.x, 0.9, t.z, 0xff8c42, 1, 1.5, 0.5, 2.2, -1, 1); } }
  if(G.evSurge > 0){ G.evSurge -= dt; if(G.evSurge <= 0){ G.evSurge = 0; if(G.ev==='surge') G.ev = null; renderChips(); }
    if(Math.random() < dt*10){ const ts = G.towers.filter(t=>t.type==='tesla'); if(ts.length){ const t = ts[Math.floor(Math.random()*ts.length)]; W.burst(t.x, 1.1, t.z, 0x9ffcff, 2, 1.5, 0.3, 2, 0, 1.6); } } }
  // day/night and fog blend smoothly
  if(G.nightK !== G.nightTarget){ G.nightK += Math.sign(G.nightTarget-G.nightK)*Math.min(Math.abs(G.nightTarget-G.nightK), dt*0.4); W.setNight(G.nightK); $('nightFx').style.opacity = (G.nightK*0.55).toFixed(3); }
  const fogT = G.weather==='fog' ? 1 : 0; if(G.fogK !== fogT){ G.fogK = (G.fogK||0) + Math.sign(fogT-(G.fogK||0))*Math.min(Math.abs(fogT-(G.fogK||0)), dt*0.5); W.setFog(G.fogK, G.nightK > 0.5 ? 0x2a3050 : 0xdfe4ec); }
  // map hazards
  if(G.storm.active && G.map.effect!=='sandstorm'){ G.storm.timer -= dt; if(G.storm.timer <= 0){ G.storm.active = false; $('stormFx').classList.remove('show'); toast('The storm passes', 'tip'); } }
  if(G.map.effect==='sandstorm'){
    G.storm.timer -= dt;
    if(G.storm.timer <= 0){
      G.storm.active = !G.storm.active; G.storm.timer = G.storm.active ? 8 : 40;
      $('stormFx').classList.toggle('show', G.storm.active);
      if(G.storm.active){ toast('🌪️ Sandstorm! Tower range −25%', 'bad'); sfx('storm'); } else toast('Sandstorm passed', 'tip');
      if(G.sel) W.showRing(G.sel.x, G.sel.z, stat(G.sel,'range'), true);
    }
  }
  if(G.storm.active && Math.random() < dt*30) W.burst(Math.random()*G.map.w, 0.3+Math.random()*1.2, Math.random()*G.map.h, 0xd8b26a, 1, 3, 0.8, 2.2, 0, 0.3);
  if(G.map.effect==='lava'){
    G.lavaT += dt;
    if(G.lavaT >= 5){ G.lavaT = 0;
      for(const [lx,lz] of G.map.lava){ const cx = lx+0.5, cz = lz+0.5; W.burst(cx, 0.2, cz, 0xff5a1a, 36, 3.2, 0.7, 4, 5, 2.0); W.shock(cx, cz, 0xff5a1a, 0.9, 0.4); W.flash(cx, 0.4, cz, 0xff7a2a, 1.8, 0.3);
        for(const e of G.enemies){ if(e.dead||e.air) continue; if(Math.hypot(e.pos.x-cx, e.pos.z-cz) < 0.7) hit(e, Math.round(e.maxHp*(e.type==='boss'?0.04:0.08)), { kind:'fire' }); } }
      sfx('boom'); W.shake(0.12);
    }
  }
  if(G.map.effect==='surge' && G.phase==='wave'){
    if(G.surge > 0){ G.surge -= dt; if(G.surge <= 0){ G.surge = 0; toast('The rift calms down', 'tip'); } }
    G.surgeT -= dt;
    if(G.surgeT <= 0){ G.surgeT = 25; G.surge = 6; sfx('surge'); toast('⚡ POWER SURGE — crystals ×2 for 6s!', 'good');
      G.objs.forEach(o=>{ if(o.type==='energy'||o.type==='ice'){ W.shock(o.x, o.z, o.type==='energy'?0xb07cff:0x7fe8ff, 1.8, 0.7); W.flash(o.x, 0.8, o.z, 0xffffff, 2.5, 0.4); } }); }
  }
  // roguelike Ice Age
  if(perk('freeze_all') && G.phase==='wave'){ G.iceAgeT -= dt; if(G.iceAgeT <= 0){ G.iceAgeT = 20; for(const e of G.enemies) if(!e.dead) freezeOne(e, 1.5); W.shock(G.map.w/2, G.map.h/2, 0xbdf3ff, 9, 0.8); sfx('freeze'); } }
  // falling trees, supply crates, tornadoes, chain explosions
  if(G.falling) for(let i=G.falling.length-1;i>=0;i--){ const f = G.falling[i]; f.t += dt; f.mesh.rotation.z = f.dir*Math.min(1.5, f.t*f.t*5); f.mesh.position.y = -Math.max(0, f.t-0.5)*0.8; if(f.t > 1.1){ W.removeObject(f.mesh); G.falling.splice(i,1); } }
  for(let i=G.crates.length-1;i>=0;i--){ const c = G.crates[i]; c.y -= dt*3.2; c.mesh.position.y = Math.max(0, c.y); c.mesh.rotation.y += dt*0.8; c.mesh.chute.visible = c.y > 0.2;
    if(c.y <= 0){ const g = 50 + G.wave*8; G.gold += g; G.earned += g; W.remove(c.mesh); G.crates.splice(i,1);
      W.burst(c.x, 0.4, c.z, 0xffd54a, 50, 3.2, 0.9, 3.2, 6, 2); W.debris(c.x, 0.3, c.z, 0xa0703a, 12, 2.6); W.shock(c.x, c.z, 0xffd54a, 1.4, 0.5); num(c.x, 1, c.z, '+'+g+' 💰', 'gold'); sfx('coin'); sfx('boom'); renderHud(); } }
  for(let i=G.tornados.length-1;i>=0;i--){ const o = G.tornados[i]; const mv = 2.2*dt; retreat(o, mv); o.left -= mv; o.mesh.position.set(o.pos.x, 0, o.pos.z); o.mesh.rotation.y += dt*12;
    if(Math.random()<dt*20) W.burst(o.pos.x, 0.5, o.pos.z, 0xe8fffb, 1, 1.5, 0.5, 2.4, -1, 1);
    for(const e of G.enemies){ if(e.dead || e.air) continue; if(Math.hypot(e.pos.x-o.pos.x, e.pos.z-o.pos.z) < 0.6 && e.type!=='boss'){ e.kbImm = 0; retreat(e, mv*0.9); e.stun = Math.max(e.stun, 0.1); } }
    if(o.left <= 0 || o.seg===0 && o.pos.distanceTo(o.route[0]) < 0.05){ W.remove(o.mesh); G.tornados.splice(i,1); } }
  if(G.booms.length){ const list = G.booms; G.booms = []; for(const b of list){ W.burst(b.x, 0.4, b.z, 0xff8c42, 24, 3, 0.5, 3, 4, 1.6); W.shock(b.x, b.z, 0xff8c42, 1.1, 0.35);
    for(const e of G.enemies){ if(e.dead) continue; if(Math.hypot(e.pos.x-b.x, e.pos.z-b.z) < 1.0) hit(e, b.dmg, { kind:'meteor', boom:true }); } } }
  // spawns
  if(G.phase==='wave'){
    G.spawnT += dt;
    while(G.queue.length && G.queue[0].at <= G.spawnT){ spawn(G.queue.shift().type); }
  }else if(G.phase==='build' && G.buildTimer > 0){
    G.buildTimer -= dt;
    if(G.buildTimer <= 0){ G.buildTimer = 0; callWave(); }
  }
  // auras: guardians protect, drummers hasten, commanders lead, carriers throw domes
  let cmd = 0;
  for(const e of G.enemies){ e.guarded = false; e.hasted = false; if(!e.dead && e.type==='commander') cmd++; }
  if(cmd !== G.cmd){ G.cmd = cmd; renderChips(); }
  for(const a of G.enemies){
    if(a.dead || !a.ab.aura || a.frozen>0 || a.stun>0) continue;
    const R2 = a.ab.auraR*a.ab.auraR;
    for(const o of G.enemies){ if(o===a || o.dead) continue; const dx = o.pos.x-a.pos.x, dz = o.pos.z-a.pos.z; if(dx*dx+dz*dz <= R2){ if(a.ab.aura==='guard') o.guarded = true; else o.hasted = true; } }
  }
  const wSpeed = G.weather==='rain' ? 0.95 : (G.weather==='snow' ? 0.9 : 1);
  // enemies
  for(const e of G.enemies){
    if(e.dead) continue;
    if(e.grow < 1){ e.grow = Math.min(1, e.grow + dt*5); e.mesh.scale.setScalar(e.scale*(0.2 + 0.8*(1-Math.pow(1-e.grow,3)) + Math.sin(e.grow*Math.PI)*0.15)); }
    if(e.slowT>0){ e.slowT -= dt; if(e.slowT<=0){ e.slow = 0; e.chill = 0; } }
    if(e.frozen>0){ e.frozen -= dt; if(e.frozen <= 0) e.brittle = false; }
    if(e.freezeImm>0) e.freezeImm -= dt;
    if(e.stun>0) e.stun -= dt;
    if(e.kbImm>0) e.kbImm -= dt;
    if(e.winded>0) e.winded -= dt;
    if(e.marked>0){ e.marked -= dt; W.mark(e.mesh, e.marked > 0); }
    if(e.bshieldT>0){ e.bshieldT -= dt; if(e.bshieldT<=0 && e.bshield>0){ e.bshield = 0; W.bubble(e.mesh, false); } }
    if(e.burn>0){ e.burn -= dt; hit(e, e.burnDps*dt, { kind:'fire' }); if(Math.random()<dt*8) W.burst(e.pos.x, e.pos.y+0.4, e.pos.z, 0xff8c42, 1, 1.0, 0.5, 2.0, -1, 1.2); if(e.dead) continue; }
    if(e.poison){ const P = e.poison; P.t -= dt; hit(e, P.dps*P.stacks*dt, { kind:'poison', src:P.src }); if(Math.random()<dt*(3+P.stacks*2)) W.burst(e.pos.x, e.pos.y+0.5, e.pos.z, 0x9dff5a, 1, 0.6, 0.6, 2, -1.5, 1); if(e.dead) continue; if(P.t <= 0) e.poison = null; }
    if(e.type==='boss'){ bossPhases(e); e.skillT -= dt; if(e.skillT <= 0 && e.frozen<=0){ const def = TD.BOSS_SKILLS[bossInfo().bossSkill||'stomp']; e.skillT = def.every*(e.enraged?0.75:1); bossSkill(e); if(e.dead) continue; } }
    // special abilities (a Mimic can copy these from its neighbours)
    const busy = e.frozen>0 || e.stun>0;
    if(e.d.mimic){ e.abT -= dt; if(e.abT <= 0){ e.abT = 5; let best = null, bd = 9;
        for(const o of G.enemies){ if(o.dead||o===e||o.d.mimic) continue; const has = o.d.cloak||o.d.heal||o.d.aura||o.d.dome||o.d.blink; if(!has) continue; const dd = o.pos.distanceToSquared(e.pos); if(dd < bd){ bd = dd; best = o; } }
        if(best){ e.ab = { cloak:!!best.d.cloak, heal:best.d.heal||0, aura:best.d.aura||null, auraR:best.d.auraR||0, dome:!!best.d.dome, blink:best.d.blink||0, dodge:0 }; e.mesh.baseColor.setHex(best.d.color);
          num(e.pos.x, e.pos.y+1.1, e.pos.z, '🎭 '+best.d.name, 'bolt'); W.burst(e.pos.x, e.pos.y+0.6, e.pos.z, best.d.color, 16, 2, 0.5, 2.6, 0, 1.6); } } }
    if(e.ab.cloak){ e.cloakT -= dt; if(e.cloakT <= 0){ e.invis = !e.invis; e.cloakT = e.invis ? 1.8 : 3.2; W.burst(e.pos.x, e.pos.y+0.4, e.pos.z, 0x9a7aff, 8, 1.4, 0.4, 2.2, 0, 1.4); } }
    else if(e.invisT <= 0 && e.invis) e.invis = false;
    if(e.invisT > 0){ e.invisT -= dt; e.invis = e.invisT > 0; }
    if(e.ab.blink && !busy && !e.air){ e.abT2 = (e.abT2==null ? 2 : e.abT2) - dt; if(e.abT2 <= 0){ e.abT2 = 3.5; W.portalFx(e.pos.x, e.pos.z, 0x39d0ff); advance(e, e.ab.blink); W.portalFx(e.pos.x, e.pos.z, 0x39d0ff); sfx('portal'); } }
    if(e.ab.dome && !busy){ e.domeT = (e.domeT==null ? 1.5 : e.domeT) - dt; if(e.domeT <= 0){ e.domeT = 6; const R = e.ab.auraR || 1.8; let n = 0;
        for(const o of G.enemies){ if(o.dead || o===e || o.domeHp > 0) continue; if(o.pos.distanceTo(e.pos) > R) continue; o.domeHp = Math.round(Math.min(o.maxHp*0.25, e.maxHp*0.8)); W.dome(o.mesh, true, o.d.size); n++; }
        if(n){ W.shock(e.pos.x, e.pos.z, 0x7fb8ff, R, 0.5); sfx('shatter'); } } }
    // healers pick the strongest wounded ally in reach and beam it back up
    if(e.ab.heal){ e.healT += dt; if(e.healT >= 1.4 && !busy){ e.healT = 0; let best = null;
        for(const o of G.enemies){ if(o.dead||o===e||o.hp>=o.maxHp) continue; if(o.pos.distanceTo(e.pos) > 2.2) continue; if(!best || o.maxHp > best.maxHp || (o.maxHp===best.maxHp && o.hp < best.hp)) best = o; }
        if(best){ const amt = Math.round(Math.min(best.maxHp*e.ab.heal, e.maxHp*0.6, best.maxHp-best.hp)); best.hp += amt;
          W.bolt(headPos(e).clone(), headPos(best).clone(), 0x52e07a, 0.05, false); W.burst(best.pos.x, best.pos.y+0.6, best.pos.z, 0x52e07a, 10, 1.4, 0.6, 2.4, -1.5, 1.2); W.flash(best.pos.x, best.pos.y+0.5, best.pos.z, 0x52e07a, 1.2, 0.25);
          num(best.pos.x, best.pos.y+1.1, best.pos.z, '+'+amt, 'heal'); sfx('heal'); } } }
    const cmdBoost = G.cmd > 0 && e.type!=='commander' ? 1.15 : 1;
    const move = busy ? 0 : e.speed*(1-e.slow)*(e.hasted?1.3:1)*cmdBoost*wSpeed*dt;
    if(e.sab && e.sab.state!=='done' && saboteurTick(e, dt, move)){ /* off-road */ }
    else advance(e, move);
    if(e.reached && !e.dead){
      e.dead = true; if(e.type==='boss'||e.type==='miniboss') G.bossAlive--;
      const c = G.map.castle.position;
      if(e.d.steal){ const s = Math.min(G.gold, e.d.steal); G.gold -= s; toast('💰 Gold Thief stole '+s+' gold!', 'bad'); sfx('steal'); W.burst(c.x, 0.9, c.z, 0xffd54a, 20, 2.4, 0.6, 3, 5, 1.6); }
      else { G.lives -= e.lives; G.livesLost += e.lives; sfx('life'); W.burst(c.x, 0.9, c.z, 0xff4b5c, 30, 2.8, 0.6, 3.5, 5, 1.6); W.shock(c.x, c.z, 0xff4b5c, 1.8, 0.5); W.shake(0.2); toast('-'+e.lives+(e.lives>1?' lives':' life'), 'bad');
        $('hurtFx').classList.remove('go'); void $('hurtFx').offsetWidth; $('hurtFx').classList.add('go');
        if(G.lives <= 0){ G.lives = 0; finish(false); } }
    }
  }
  heroTick(dt);
  // burning ground and toxic clouds
  const fireK = G.weather==='rain' ? 1.6 : (G.weather==='heat' ? 0.67 : 1);
  for(let i=G.fires.length-1;i>=0;i--){
    const f = G.fires[i]; f.t -= dt*(f.toxic ? 1 : fireK);
    if(f.t <= 0){ W.freeFire(f.mesh); G.fires.splice(i,1); continue; }
    f.mesh.scale.set(f.r*Math.min(1, f.t*2), 1, f.r*Math.min(1, f.t*2));
    f.tick -= dt; if(f.tick <= 0){ f.tick = 0.25;
      for(const e of G.enemies){ if(e.dead||e.air||(e.ghost && !f.toxic)) continue; if(Math.hypot(e.pos.x-f.x, e.pos.z-f.z) <= f.r + e.d.size) hit(e, f.dps*0.25, { kind: f.toxic ? 'poison' : 'fire', src:f.src }); } }
    if(Math.random() < dt*14) W.burst(f.x+(Math.random()-0.5)*f.r, 0.1, f.z+(Math.random()-0.5)*f.r, f.toxic ? 0x9dff5a : (Math.random()<0.5?0xff5a1a:0xffb347), 1, 0.8, 0.6, 2.4, -2.5, 0.4);
  }
  // synergy links shimmer
  for(const l of G.links){ l.mesh.material.opacity = 0.35 + Math.sin(G.t*4 + l.a.x)*0.2; }
  // towers
  for(const t of G.towers){
    if(t.pop < 1){ t.pop = Math.min(1, t.pop + dt*4); const s = 0.01 + 0.99*(1 - Math.pow(1-t.pop, 3)); t.mesh.scale.setScalar(t.level>1 ? 0.7+0.3*s + Math.sin(t.pop*Math.PI)*0.12 : s + Math.sin(t.pop*Math.PI)*0.1); }
    if(t.recoil > 0){ t.recoil = Math.max(0, t.recoil - dt*1.2); }
    const hd = t.mesh.head; hd.position.x = 0; hd.position.z = 0; if(t.recoil > 0) hd.translateZ(-t.recoil);
    if(t.mesh.rune) t.mesh.rune.material.opacity = (t.dis>0 ? 0.15 : 0.4) + Math.sin(G.t*3 + t.x)*0.12 + (G.overdrive>0 ? 0.35 : 0);
    if(t.mesh.halo) t.mesh.halo.rotation.y += dt*1.5;
    if(t.mesh.crown){ t.mesh.crown.rotation.y += dt*2; t.mesh.crown.position.y = 1.55 + Math.sin(G.t*2+t.x)*0.06; }
    if(t.mesh.orbit) t.mesh.orbit.rotation.y += dt*2.5;
    if(t.mesh.fan) t.mesh.fan.rotation.z += dt*(t.target ? 14 : 3);
    if(t.mesh.bubbles) t.mesh.bubbles.forEach((b,i)=>{ b.position.y = 0.62 + ((G.t*0.6 + i*0.33) % 1)*0.2; });
    if(t.link){ t.link.material.opacity = (G.surge>0 ? 0.95 : 0.45) + Math.sin(G.t*6)*0.2; }
    if(t.dis > 0){
      t.dis -= dt; t.target = null;
      if(t.beams) t.beams.forEach(b=>b.visible=false);
      if(t.mesh.status && t.mesh.status.userData.ring){ t.mesh.status.userData.ring.rotation.z += dt*8; t.mesh.status.userData.spark.material.opacity = 0.4+Math.random()*0.5; }
      if(t.dis <= 0){ t.dis = 0; W.towerStatus(t.mesh, null); if(t.disKind==='ice') { W.debris(t.x, 0.8, t.z, 0xdff6ff, 10, 2.2); sfx('shatter'); } }
      continue;
    }
    if(t.type==='bank'){ if(t.mesh.spin) t.mesh.spin.rotation.z += dt*2; continue; }
    t.cool -= dt;
    if(!t.target || t.target.dead || t.target.invis || !inRange(t, t.target, stat(t,'range'))){ const nt = pickTarget(t); if(nt!==t.target) t.ramp = 1; t.target = nt; }
    if(t.target){
      const dx = t.target.pos.x-t.x, dz = t.target.pos.z-t.z, want = Math.atan2(dx, dz);
      let diff = want - t.mesh.head.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      t.mesh.head.rotation.y += diff*Math.min(1, dt*14);
      if(t.beams) laserTick(t, dt);
      else if(t.cool <= 0 && Math.abs(diff) < 0.5){ fire(t, t.target); t.cool = 1/stat(t,'rate'); }
    } else if(t.beams) laserTick(t, dt);
    if(t.mesh.spin){ t.mesh.spin.rotation.y += dt*(t.type==='frost'?1.4:3)*(G.overdrive>0?2.5:1); if(t.type==='frost') t.mesh.spin.rotation.x += dt*0.8; }
    if(t.mesh.glow && t.type!=='laser') t.mesh.glow.material.opacity = (W.light?0.16:0.45) + Math.sin(G.t*4+t.x)*(W.light?0.06:0.12) + Math.max(0, 0.5 - t.cool*2)*(t.type==='tesla'?(W.light?0.25:0.5):0);
  }
  // projectiles
  for(let i=G.projs.length-1;i>=0;i--){
    const p = G.projs[i]; let done = false;
    if(p.kind==='shell' || p.kind==='meteor' || p.kind==='bomblet'){
      p.t += dt/p.dur; const k = clamp(p.t, 0, 1);
      p.mesh.position.lerpVectors(p.from, p.to, k);
      if(p.kind==='shell' || p.kind==='bomblet'){ p.mesh.position.y += p.arc*4*k*(1-k); if(Math.random()<dt*30) W.burst(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, p.burn?0xff7a2a:0x999999, 1, 0.3, 0.4, 2.2, -0.5, 1); }
      else { if(p.lava) p.mesh.position.y += 2.5*4*k*(1-k); p.mesh.rotation.x += dt*9; p.mesh.rotation.z += dt*7; if(Math.random()<dt*40) W.burst(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0xff8c42, 2, 1.5, 0.4, 3, 0, 1.4); }
      if(p.t >= 1){
        const c = p.to;
        if(p.lava){
          W.burst(c.x, 0.4, c.z, 0xff5a1a, 40, 3.2, 0.7, 4, 5, 1.8); W.shock(c.x, c.z, 0xff5a1a, 1.4, 0.5); W.flash(c.x, 0.6, c.z, 0xff7a2a, 2.4, 0.3);
          if(p.tower && G.towers.includes(p.tower)) disableTower(p.tower, 2.5, 'melt');
          sfx('boom'); W.shake(0.15);
        }else if(p.kind==='meteor'){
          W.burst(c.x, 0.3, c.z, 0xff8c42, 90, 5, 0.8, 5, 5, 1.8); W.burst(c.x, 0.3, c.z, 0xffe14b, 40, 3.5, 0.6, 4, 4, 1.6); W.burst(c.x, 0.2, c.z, 0x4a4a4a, 30, 2.2, 1.2, 6, 2, 1.4);
          W.shock(c.x, c.z, 0xff8c42, 2.6, 0.6); W.shock(c.x, c.z, 0xffffff, 1.6, 0.35); W.flash(c.x, 0.6, c.z, 0xffb347, 5, 0.45); W.debris(c.x, 0.3, c.z, 0x5a4a48, 22, 4);
          for(const e of G.enemies){ if(e.dead) continue; const dd = Math.hypot(e.pos.x-c.x, e.pos.z-c.z); if(dd <= p.splash+e.d.size) hit(e, Math.round(p.dmg*(dd<p.splash*0.5?1:0.6)), { kind:'meteor' }); }
          sfx('bigboom'); W.shake(0.55); W.punch(0.6); W.hideMarker();
        }else{
          const small = p.kind==='bomblet';
          W.burst(c.x, 0.25, c.z, p.burn?0xff5a1a:0xff8c42, small?12:26, 3.2, 0.5, small?3:4, 5, 1.4); if(!small) W.burst(c.x, 0.2, c.z, 0x4a4a4a, 14, 1.6, 0.9, 5, 2, 1.2);
          W.shock(c.x, c.z, p.burn?0xff5a1a:0xffb347, p.splash*1.1, small?0.3:0.4); W.flash(c.x, 0.4, c.z, 0xffb347, (small?0.6:1.4)+p.splash, 0.2); if(!small) W.debris(c.x, 0.15, c.z, 0x6b5a48, p.quake?10:5, 2.6);
          for(const e of G.enemies){ if(e.dead||e.air||e.ghost) continue; const dd = Math.hypot(e.pos.x-c.x, e.pos.z-c.z); if(dd > p.splash+e.d.size) continue;
            if(e.ab.dodge && Math.random() < e.ab.dodge){ num(e.pos.x, e.pos.y+0.9, e.pos.z, 'MISS', 'blk'); continue; }
            hit(e, Math.round(p.dmg*(dd<p.splash*0.5?1:0.6)), { kind:'phys', src:p.src, cold:p.cold });
            if(p.burn && !e.dead){ e.burn = Math.max(e.burn, 3); e.burnDps = Math.max(e.burnDps, p.dmg*0.22); }
            if(p.quake && !e.dead) e.stun = Math.max(e.stun, e.type==='boss' ? p.quake*0.3 : p.quake); }
          if(p.fireGround){ const r = p.splash*(p.burn?0.85:0.65)*(p.napalm?1.6:1); G.fires.push({ x:c.x, z:c.z, r, t:p.fireT, dps:p.dmg*TD.TOWERS.cannon.fireDps*(p.burn?1.4:1)*(p.napalm?2:1), src:p.src, tick:0, mesh:W.firePatch(c.x, c.z, r) }); }
          if(p.cluster){ for(let k2=0;k2<p.cluster;k2++){ const a = k2/p.cluster*Math.PI*2 + Math.random()*0.5, rr = 0.7+Math.random()*0.4; const to = new (window.THREE.Vector3)(c.x+Math.cos(a)*rr, 0.08, c.z+Math.sin(a)*rr);
              const mesh = W.projMesh('bomblet'); mesh.position.copy(c); G.projs.push({ kind:'bomblet', mesh, from:c.clone().setY(0.3), to, t:-k2*0.05, dur:0.35, dmg:p.dmg*0.4, splash:0.6, src:p.src, arc:0.8, cold:p.cold }); } }
          sfx('boom'); if(!small){ W.shake(p.quake ? 0.18 : 0.1); if(p.quake) W.punch(0.15); }
        }
        done = true;
      }
    }else{
      const e = p.target; p.life -= dt;
      if(!e || e.dead || p.life<=0){ done = true; }
      else{
        _v.set(e.pos.x, e.pos.y + e.d.size*1.3, e.pos.z).sub(p.pos); const L = _v.length(), mv = p.speed*dt;
        if(L <= mv+0.12){
          if(e.ab.dodge && Math.random() < e.ab.dodge){ num(e.pos.x, e.pos.y+0.9, e.pos.z, 'MISS', 'blk'); W.burst(e.pos.x, e.pos.y+0.4, e.pos.z, 0x5a4a8a, 6, 1.5, 0.3, 2, 0, 1.4); }
          else if(p.kind==='venom'){
            hit(e, p.dmg*0.5, { kind:'poison', src:p.src }); if(!e.dead) applyPoison(e, p.src, 1);
            W.burst(e.pos.x, e.pos.y+0.4, e.pos.z, 0x9dff5a, 10, 1.6, 0.5, 2.4, 2, 1.4);
            const sp = p.src && flag(p.src,'acidSplash'); if(sp){ W.shock(e.pos.x, e.pos.z, 0x9dff5a, sp, 0.4); for(const o of G.enemies){ if(o.dead||o===e) continue; if(o.pos.distanceTo(e.pos) <= sp) applyPoison(o, p.src, 1); } }
          }else{
            hit(e, p.dmg, { kind: p.kind==='ice'?'ice':'phys', src:p.src, crit:p.crit, noArmor:p.noArmor });
            if(p.slow && !e.dead){ applySlow(e, p.slow, p.slowT, p.src); W.burst(e.pos.x, e.pos.y+0.3, e.pos.z, 0xbdf3ff, 8, 1.2, 0.5, 2.2, 1, 1.2); }
            else W.burst(e.pos.x, e.pos.y+0.35, e.pos.z, p.crit?0xff9a3c:0xffe6a0, p.crit?12:5, p.crit?2.4:1.4, 0.2, 1.6, 2, 1.2);
          }
          done = true;
        }else{
          p.pos.addScaledVector(_v, mv/L); p.mesh.position.copy(p.pos);
          if(p.kind==='arrow') p.mesh.lookAt(_v2.set(e.pos.x, e.pos.y + e.d.size*1.3, e.pos.z)); else p.mesh.rotation.y += dt*8;
          if(p.crit && Math.random()<dt*50) W.burst(p.pos.x, p.pos.y, p.pos.z, 0xff9a3c, 1, 0.3, 0.25, 1.8, 0, 1);
          else if((p.kind==='ice'||p.kind==='venom') && Math.random()<dt*25) W.burst(p.pos.x, p.pos.y, p.pos.z, p.kind==='ice'?0xbdf3ff:0x9dff5a, 1, 0.3, 0.3, 1.6, 0, 1);
        }
      }
    }
    if(done){ W.freeProj(p.kind, p.mesh); G.projs.splice(i,1); }
  }
  // dying bodies pop and shrink
  if(G.dying) for(let i=G.dying.length-1;i>=0;i--){ const d = G.dying[i]; d.t += dt; const k = d.t/0.22;
    if(k >= 1){ W.remove(d.mesh); G.dying.splice(i,1); continue; }
    d.mesh.scale.set(d.s*(1+k*0.5)*(1-k), d.s*(1-k)*(1-k*0.5), d.s*(1+k*0.5)*(1-k)); }
  // dead enemies out, meshes updated
  for(let i=G.enemies.length-1;i>=0;i--){
    const e = G.enemies[i];
    if(e.dead){ if(!e.mesh.userData.keep) W.remove(e.mesh); G.enemies.splice(i,1); continue; }
    e.mesh.position.x = e.pos.x; e.mesh.position.z = e.pos.z; if(!e.air && !e.mesh.baseY) e.mesh.position.y = 0;
    if(e.yaw!=null) e.mesh.rotation.y = e.yaw;
    W.animateEnemy(e.mesh, G.t + e.dist, !(e.frozen>0||e.stun>0));
    e.mesh.fill.scale.x = Math.max(0.001, e.hp/e.maxHp);
    e.mesh.fill.material.color.set(e.hp/e.maxHp > 0.5 ? 0x52e07a : (e.hp/e.maxHp > 0.25 ? 0xffc857 : 0xff4b5c));
    if(e.mesh.shieldFill) e.mesh.shieldFill.scale.x = Math.max(0.001, e.shield/(e.shieldMax||1));
    // tint: hit flash, frozen, chill build-up, burning, poisoned, enraged, guarded, hasted
    const m = e.mesh.bodyM;
    if(e.ab.cloak || e.invisT>0 || e.invis || m.opacity < 1){ const want = e.invis ? 0.12 : (e.d.ghost ? 0.55 : 1); m.opacity += (want - m.opacity)*Math.min(1, dt*8); if(Math.abs(m.opacity-want) < 0.01) m.opacity = want; m.transparent = true; e.mesh.bar.visible = !e.invis; }
    if(e.flash>0){ e.flash -= dt; e.mesh.torso.scale.setScalar(1.18); m.emissive.setHex(0xffffff); m.emissiveIntensity = 0.55; }
    else { e.mesh.torso.scale.set(1,1.15,0.9);
      if(e.frozen>0){ m.color.setHex(0xbdf3ff); m.emissive.setHex(e.brittle ? 0xb07cff : 0x7fd4ff); m.emissiveIntensity = 0.45; }
      else if(e.chill>0){ m.color.copy(e.mesh.baseColor).lerp(_ice, Math.min(0.85, e.chill*0.16)); m.emissive.setHex(0x3f9fd8); m.emissiveIntensity = Math.min(0.4, e.chill*0.07); }
      else if(e.burn>0){ m.color.copy(e.mesh.baseColor); m.emissive.setHex(0xff5a1a); m.emissiveIntensity = 0.5; }
      else if(e.poison){ m.color.copy(e.mesh.baseColor).lerp(_tox, 0.35); m.emissive.setHex(0x3a8a1a); m.emissiveIntensity = 0.3 + e.poison.stacks*0.04; }
      else if(e.enraged){ m.color.copy(e.mesh.baseColor); m.emissive.setHex(0xff2020); m.emissiveIntensity = 0.55 + Math.sin(G.t*14)*0.2; }
      else if(e.guarded){ m.color.copy(e.mesh.baseColor); m.emissive.setHex(0x2ec4b6); m.emissiveIntensity = 0.35; }
      else if(e.hasted){ m.color.copy(e.mesh.baseColor); m.emissive.setHex(0xff7a3c); m.emissiveIntensity = 0.3; }
      else { m.color.copy(e.mesh.baseColor); m.emissive.setHex(e.type==='boss'||e.type==='miniboss' ? e.mesh.baseColor.getHex() : (G.nightK > 0.5 && e.d.night ? 0x201030 : 0x000000)); m.emissiveIntensity = 0.25; } }
    if(e.hasted && Math.random()<dt*6) W.burst(e.pos.x, e.pos.y+0.15, e.pos.z, 0xffa03c, 1, 0.6, 0.35, 1.6, 0, 0.5);
    if(G.cmd > 0 && e.type!=='commander' && Math.random()<dt*2) W.burst(e.pos.x, e.pos.y+0.2, e.pos.z, 0xffc857, 1, 0.5, 0.4, 1.4, 0, 0.5);
    if(e.slow>0 && Math.random()<dt*6) W.burst(e.pos.x, e.pos.y+0.25, e.pos.z, 0xbdf3ff, 1, 0.5, 0.5, 1.6, 0.5, 1);
    if(e.frozen>0 && Math.random()<dt*4) W.burst(e.pos.x, e.pos.y+0.5, e.pos.z, 0xffffff, 1, 0.4, 0.6, 1.8, 0.2, 1);
    if(e.mesh.bossGlow) e.mesh.bossGlow.material.opacity = 0.3 + Math.sin(G.t*4)*0.1 + (e.enraged?0.2:0);
  }
  if(G.phase==='wave' && !G.queue.length && !G.enemies.length && !G.over) waveCleared();
}
const _tox = new (window.THREE.Color)(0x9dff5a);
const _ice = new (window.THREE.Color)(0xbdf3ff);

// ---- end of match ----------------------------------------------------
function nextUnlockInfo(){
  const li = TD.levelOf(SAVE.xp), u = TD.UNLOCKS.find(x=>x.level>li.level && !(SAVE.prestige && x.level < TD.PRESTIGE_LEVEL));
  if(!u) return null;
  const need = TD.xpForLevel(u.level) - SAVE.xp, from = TD.xpForLevel(u.level-1), span = TD.xpForLevel(u.level)-from;
  return { u, need, pct: clamp((SAVE.xp-from)/span, 0, 1) };
}
function recordRun(entry){
  SAVE.lb = (SAVE.lb||[]).concat([entry]).sort((a,b)=>(b.wave-a.wave) || (b.kills-a.kills)).slice(0, 30);
}
function finish(won){
  if(G.over) return;
  G.over = true; G.won = won; G.phase = 'over'; G.buildType = null; G.targetMode = null; G.heroMode = false; deselect(); W.hideGhost(); W.hideMarker(); hideBossBar();
  G.overdrive = 0; $('odFx').classList.remove('show'); $('perkWrap').classList.remove('show');
  G.towers.forEach(t=>{ if(t.beams) t.beams.forEach(b=>b.visible=false); });
  const ms = mapSave(G.map.id), md = modeDef(), ru = ruleDef();
  const stars = won ? (G.livesLost === 0 ? 3 : (G.lives >= G.startLives/2 ? 2 : 1)) : 0;
  const lines = [];
  if(won && (G.mode==='normal' || G.mode==='hard')) ms.stars = Math.max(ms.stars, stars);
  if(won && G.mode==='hard' && !G.endless){ if(!ms.hard) lines.push('👑 Hard crown earned!'); ms.hard = true; chMark('hardwin'); }
  let chBonus = 0;
  if(won && G.mode==='challenge' && ru){ const ids = [ru.id].concat(G.ruleRandom ? ['random'] : []);
    for(const id of ids) if(!SAVE.chal[id]){ chBonus += 100; SAVE.chal[id] = true; lines.push((id==='random'?'🎲 Random':ru.icon+' '+ru.name)+' beaten for the first time  ·  +100 💰'); } }
  if(won && G.mode==='rogue') chMark('roguewin');
  if(won && G.mode==='bossrush'){ chMark('bossrush'); chBonus += 150; lines.push('👑 Boss Rush survived  ·  +150 💰'); }
  const wavesDone = won ? G.wave : Math.max(0, G.wave-1);
  ms.best = Math.max(ms.best, wavesDone);
  if(G.endless) ms.endless = Math.max(ms.endless||0, wavesDone);
  if(won && G.livesLost===0) chMark('flawless');
  if(won) dEv('win', 1);
  dEv('gold', G.earned);
  // mastery gained this match
  const mUps = [];
  for(const k of TD.TOWER_ORDER){ const before = G.mastery0 ? G.mastery0[k] : 0, now = mastery(k); if(now > before) mUps.push(TOWERS[k].icon+' '+TOWERS[k].name+' → mastery '+now+' ('+TD.rarityOf(now).name+')'); if(now >= 9) chMark('legend'); }
  if(mUps.length) lines.push('🎖️ '+mUps.join(' · '));
  // xp, coins, research, level
  const lvBefore = plevel();
  const pr = Math.min(TD.PRESTIGE_MAX, SAVE.prestige||0);
  const tr = (G.map.tiered ? TD.tierReward(G.map.curTier) : 1) * (md.reward||1);
  const xp = Math.round(TD.gameXp(wavesDone, G.kills, won, stars)*tr*(1+0.1*pr)), coins = Math.round(TD.gameCoins(wavesDone, won, stars)*tr) + chBonus + (G.bonusCoins||0);
  const rp = TD.rpFor(wavesDone, won, G.mode);
  let tierLine = '';
  if(G.map.tiered){ if(won && !G.endless){ ms.tier = (ms.tier||1)+1; tierLine = 'Tier '+G.map.curTier+' cleared → Tier '+ms.tier+' unlocked'; } else tierLine = 'Tier '+G.map.curTier; }
  SAVE.xp += xp; SAVE.coins += coins; SAVE.rp = (SAVE.rp||0) + rp;
  recordRun({ mode:G.mode, map:G.map.id, wave:wavesDone, won, kills:G.kills, rule:G.rule, date:todayKey() });
  G.replay = { map:G.mapIdx, log:G.log.slice(), waves:wavesDone, won, t:G.t, routes:G.map.routeDefs.map(r=>r.open) };
  persist(); chCheck();
  const lvAfter = plevel();
  if(typeof window.onGameplayStop==='function') window.onGameplayStop();
  sfx(won?'win':'lose');
  const r = $('result'); r.className = 'ov '+(won?'win':'lose');
  $('resTitle').textContent = won ? (G.endless ? 'ENDLESS RUN OVER' : ({ hard:'HARD VICTORY!', challenge:'CHALLENGE WON!', rogue:'RUN COMPLETE!', bossrush:'KING SLAYER!' }[G.mode] || 'VICTORY!')) : (G.endless ? 'ENDLESS RUN OVER' : 'DEFEAT');
  $('resSub').textContent = (won ? G.map.name+' defended' : (G.endless ? 'You held '+G.map.name+' for '+wavesDone+' waves' : 'The castle fell on wave '+G.wave)) + (tierLine ? ' · '+tierLine : '') + (G.mode!=='normal' && !G.endless ? ' · '+md.icon+' '+md.name+(ru?' — '+ru.name:'') : '');
  $('resStars').innerHTML = won ? [1,2,3].map(i=>'<span class="'+(i<=stars?'on':'')+'" style="animation-delay:'+(0.25+i*0.22)+'s">★</span>').join('') : '';
  $('resStats').innerHTML = [['Waves', wavesDone],['Kills', G.kills],['Gold', G.earned],['XP', '+'+xp],['Coins', '+'+coins],['Research', '+'+rp]].map(([l,v])=>'<div><b>'+v+'</b><span>'+l+'</span></div>').join('');
  const lu = $('resLevel'); let html = lines.map(l=>'<b class="rl">'+l+'</b>').join('');
  if(lvAfter > lvBefore){ const un = TD.UNLOCKS.filter(u=>u.level>lvBefore && u.level<=lvAfter).map(u=>u.icon+' '+u.text); html += '<b>LEVEL UP → '+lvAfter+'</b>'+(un.length?'<span>Unlocked: '+un.join(', ')+'</span>':''); setTimeout(()=>sfx('level'), 600); }
  else { const li = TD.levelOf(SAVE.xp); html += '<span>Level '+li.level+' · '+li.into+' / '+li.need+' XP</span>'; }
  const nu = nextUnlockInfo(); if(nu) html += '<div class="nuMini"><em>NEXT UNLOCK</em> '+nu.u.icon+' Level '+nu.u.level+' — '+nu.u.text+' <small>('+nu.need+' XP to go)</small><i style="width:'+Math.round(nu.pct*100)+'%"></i></div>';
  lu.innerHTML = html; lu.style.display = '';
  const next = G.mapIdx+1 < TD.MAPS.length && !G.map.tiered && unlocked(G.mapIdx+1) && !TD.MAPS[G.mapIdx+1].tiered;
  $('resNext').style.display = (won && next && !G.endless && (G.mode==='normal'||G.mode==='hard')) ? '' : 'none';
  $('resEndless').style.display = (won && !G.endless && G.mode!=='bossrush') ? '' : 'none';
  $('resRetry').textContent = won ? 'PLAY AGAIN' : 'TRY AGAIN';
  setTimeout(()=>r.classList.add('show'), won ? 700 : 400);
}

// ---- in-game UI ------------------------------------------------------
function renderHud(){
  $('hGold').textContent = G.gold; $('hLives').textContent = G.lives;
  const ru = ruleDef();
  $('hWave').textContent = (G.phase==='build'||G.phase==='perk' ? Math.min(G.wave+1, G.endless?999:G.waves) : G.wave) + (G.endless ? '' : ' / '+G.waves) + (G.map.tiered ? '  ·  T'+G.map.curTier : '') + (G.mode==='hard' ? '  💀' : '') + (ru ? '  '+ru.icon : '');
  $('hLives').parentElement.classList.toggle('low', G.lives <= 5);
}
// small status chips: time of day, weather, events, commander, perks
function renderChips(){
  if(G.phase==='menu'){ $('chips').innerHTML = ''; return; }
  const c = [];
  c.push('<span class="chip">'+(G.night?'🌙 Night':'☀️ Day')+'</span>');
  if(G.weather!=='clear') c.push('<span class="chip w">'+TD.WEATHER[G.weather].icon+' '+TD.WEATHER[G.weather].name+'</span>');
  if(G.evSurge > 0) c.push('<span class="chip ev">⚡ Surge '+Math.ceil(G.evSurge)+'s</span>');
  const ev = G.waveEv || G.nextEv; if(ev){ const d = TD.EVENTS.find(x=>x.id===ev); if(d) c.push('<span class="chip ev">'+d.icon+' '+d.name.split(' ').map(w=>w[0]+w.slice(1).toLowerCase()).join(' ')+(G.nextEv?' (next)':'')+'</span>'); }
  if(G.cmd > 0) c.push('<span class="chip bad">👑 Commander</span>');
  if(G.curRoutes && G.curRoutes.length > 1 && G.phase==='wave') c.push('<span class="chip bad">🔀 Split</span>');
  if(G.mode==='rogue'){ const n = Object.values(G.perks).reduce((a,b)=>a+b,0); c.push('<button class="chip pk" id="chipPerks">🃏 '+n+' perks</button>'); }
  $('chips').innerHTML = c.join('');
  const pb = $('chipPerks'); if(pb) pb.onclick = ()=>{ const list = Object.keys(G.perks).map(k=>{ const p = TD.PERKS.find(x=>x.id===k); return p.icon+' '+p.name+(G.perks[k]>1?' ×'+G.perks[k]:''); }); toast(list.length ? list.join(' · ') : 'No perks yet — clear 3 waves', 'tip'); };
}
function setWeatherFx(w){ const a = $('app'); ['rain','snow','heat','fog'].forEach(k=>a.classList.toggle('w-'+k, w===k)); }
function renderBuildBar(){
  const bar = $('buildBar');
  const lo = G.loadout && G.loadout.length ? G.loadout : TD.DEFAULT_LOADOUT;
  if(!bar.children.length || bar.dataset.lo !== lo.join(',')){
    bar.dataset.lo = lo.join(',');
    bar.innerHTML = lo.map((k,i)=>{ const d = TOWERS[k], ml = mastery(k), rar = TD.rarityOf(ml); return '<button class="tcard" data-type="'+k+'" style="--rar:'+rar.css+'"><span class="ticon">'+d.icon+'</span><span class="tname">'+d.name+'</span><span class="tcost">'+towerCost(k,1)+'</span><span class="tkey">'+(i+1)+'</span>'+(ml>=3?'<span class="trar">'+'★'.repeat(Math.min(3,Math.floor(ml/3)))+'</span>':'')+'<span class="tlock">🔒 Lv '+(d.unlock||'')+'</span></button>'; }).join('');
    bar.querySelectorAll('.tcard').forEach(b=>b.addEventListener('click', ()=>{ unlockAudio(); setBuildType(b.dataset.type); }));
  }
  bar.querySelectorAll('.tcard').forEach(b=>{ const k = b.dataset.type, d = TOWERS[k], ban = banned(k); b.classList.toggle('on', G.buildType===k); b.classList.toggle('poor', G.gold < towerCost(k,1));
    b.classList.toggle('locked', !towerUnlocked(k) || ban); b.querySelector('.tlock').textContent = ban ? '🚫 Banned' : '🔒 Lv '+(d.unlock||''); b.querySelector('.tcost').textContent = towerCost(k,1); });
  $('buildHint').textContent = G.heroMode ? '🛡️ Tap where '+TD.HERO.name+' should go' : (G.targetMode ? '☄️ Tap where the meteor should land' : (G.buildType ? 'Tap a free tile to place the '+TOWERS[G.buildType].name+' · '+TOWERS[G.buildType].trait : ''));
}
function renderAbilities(){
  const bar = $('abilBar');
  if(!bar.children.length){
    let h = '';
    if(ulevel() >= TD.HERO.unlock) h += '<button class="abtn hero" data-id="hero" title="Hero (H) — tap, then tap the island to move '+TD.HERO.name+'. Towers near him fire 15% faster."><span class="aic">🛡️</span><span class="acd"></span><span class="hhp"><i></i></span><span class="alk"></span></button>';
    h += '<button class="abtn stand" data-id="stand" title="Last Stand (E) — '+TD.LAST_STAND.desc+'"><span class="aic">🚨</span><span class="acd"></span><span class="alk"></span></button>';
    h += TD.ABILITIES.map(a=>'<button class="abtn" data-id="'+a.id+'" title="'+a.name+' ('+a.key+') — '+a.desc+'"><span class="aic">'+a.icon+'</span><span class="acd"></span><span class="alk">Lv '+a.unlock+'</span></button>').join('');
    bar.innerHTML = h;
    bar.querySelectorAll('.abtn').forEach(b=>b.addEventListener('click', ()=>{ unlockAudio(); const id = b.dataset.id; if(id==='hero') heroSelectToggle(); else if(id==='stand') useLastStand(); else useAbility(id); }));
  }
  const ru = ruleDef(), noA = !!(ru && ru.noAbil);
  bar.querySelectorAll('.abtn').forEach(b=>{ const id = b.dataset.id;
    if(id==='hero'){ const h = G.hero; b.classList.toggle('on', G.heroMode); b.classList.toggle('cool', !!(h && h.dead>0)); b.querySelector('.acd').textContent = h && h.dead>0 ? Math.ceil(h.dead)+'s' : ''; b.style.setProperty('--cd', h && h.dead>0 ? (h.dead/TD.HERO.respawn*100)+'%' : '0%');
      const f = b.querySelector('.hhp i'); if(f && h) f.style.width = Math.max(0, h.hp/h.maxHp*100)+'%'; b.classList.toggle('ready', !!(h && h.dead<=0)); return; }
    if(id==='stand'){ const left = lastStandMax() - G.lastStand, ok = G.phase==='wave' && left > 0; b.classList.toggle('cool', !ok); b.classList.toggle('ready', ok); b.querySelector('.acd').textContent = ok ? '' : (G.phase==='wave' ? 'used' : ''); b.style.setProperty('--cd', ok ? '0%' : '100%'); b.classList.toggle('flash', ok && G.lives <= 5); return; }
    const a = TD.ABILITIES.find(x=>x.id===id); const cd = G.cd[a.id]||0, lockd = !abilityUnlocked(a);
    b.classList.toggle('locked', lockd || noA); b.querySelector('.alk').textContent = noA && !lockd ? '🔕' : 'Lv '+a.unlock;
    b.style.display = lockd && a.unlock > ulevel()+4 ? 'none' : '';
    b.classList.toggle('cool', cd>0); b.classList.toggle('on', G.targetMode===a.id); b.classList.toggle('ready', !lockd && !noA && cd<=0 && G.phase!=='menu');
    b.querySelector('.acd').textContent = cd>0 ? Math.ceil(cd)+'s' : ''; b.style.setProperty('--cd', cd>0 ? (cd/(a.cd*cdMul())*100)+'%' : '0%'); });
}
const OBJ_INFO = {
  tree:   { name:'🌳 Tree',          tag:'Obstacle', text:'Blocks building. Clear it to free the tile — sometimes something is buried underneath.' },
  ruin:   { name:'🧱 Old Ruins',     tag:'Obstacle', text:'Crumbling ruins. Demolish them to open the tile for a tower. Legends say something ancient hides in one.' },
  rock:   { name:'🪨 Rock',          tag:'Obstacle', text:'Solid rock — nothing can be built here.' },
  energy: { name:'⚡ Energy Crystal', tag:'Power',   text:'Tesla towers on the 8 tiles around it deal +30% damage and chain +1. Surges double it.' },
  ice:    { name:'❄️ Ice Crystal',   tag:'Power',   text:'Frost towers on the 8 tiles around it deal +30% damage, slow longer and freeze 2 hits sooner.' },
};
function renderPanel(){
  const p = $('panel'), t = G.sel, o = G.selObj;
  const up = $('pUp'), br = $('pBranch'), sl = $('pSell');
  if(o){
    const inf = OBJ_INFO[o.type]; if(!inf){ p.classList.remove('show'); return; }
    $('pName').textContent = inf.name; $('pLvl').textContent = inf.tag;
    $('pStats').innerHTML = '<div class="ptrait">'+inf.text+'</div>';
    br.style.display = 'none'; sl.style.display = 'none';
    if(CLEAR_COST[o.type]){ const c = Math.round(CLEAR_COST[o.type]*costMul()); up.style.display = ''; up.textContent = (o.type==='tree'?'🪓 CLEAR  ':'🔨 DEMOLISH  ')+c; up.disabled = G.gold < c; } else up.style.display = 'none';
    p.classList.add('show'); return;
  }
  sl.style.display = '';
  if(!t){ p.classList.remove('show'); return; }
  const d = TOWERS[t.type], lv = t.level, nxt = lv<3, b = branchOf(t), u = ultOf(t), ml = mastery(t.type), rar = TD.rarityOf(ml);
  $('pName').textContent = d.icon+' '+d.name; $('pLvl').innerHTML = (u ? u.icon+' '+u.name : (lv>=3 && b ? b.icon+' '+b.name : 'Level '+lv))+' <span class="prar" style="color:'+rar.css+'">'+rar.name+' '+ml+'</span>';
  const fmt = (k,v)=> v==null ? '' : (typeof v==='string' ? v : (k==='rate' ? (+v).toFixed(1)+'/s' : (k==='slow'||k==='critChance' ? Math.round(v*100)+'%' : (Math.round(v*10)/10))));
  const row = (l,k,a,bv)=>'<div class="prow"><span>'+l+'</span><b>'+fmt(k,a)+(bv!=null?' <i>→ '+fmt(k,bv)+'</i>':'')+'</b></div>';
  const nextVal = key => nxt && lv===1 && d[key] ? d[key][1] : null;
  let s = '';
  if(t.type==='bank'){
    s += row('Income / wave','x',Math.round(stat(t,'income')),nextVal('income')) + row('Kill tax','x','+'+Math.round(stat(t,'tax'))+(u&&u.mod.taxAdd?'+'+u.mod.taxAdd:'')) + row('Tax range','range',stat(t,'range'),nextVal('range'));
    if(b && b.mod.interest) s += row('Interest','x',Math.round(b.mod.interest*(u&&u.mod.interest?u.mod.interest:1)*100)+'% (max '+Math.round(b.mod.cap*(u&&u.mod.cap?u.mod.cap:1))+')');
    s += row('Earned','x',Math.round(t.dmg)+' 💰');
  }else{
    s += row(d.proj==='beam'?'Damage/s':(d.proj==='venom'?'Poison/s':'Damage'),'dmg',stat(t,'dmg'),nextVal('dmg')) + row('Range','range',stat(t,'range'),nextVal('range'));
    if(d.proj!=='beam') s += row('Rate','rate',stat(t,'rate'),nextVal('rate'));
    if(d.critChance) s += row('Crit chance','critChance',stat(t,'critChance'),nextVal('critChance'));
    if(d.splash) s += row('Splash','splash',stat(t,'splash'),nextVal('splash'));
    if(d.slow) s += row('Slow','slow',stat(t,'slow'),nextVal('slow'));
    if(d.stacks && t.type==='frost') s += row('Freeze after','x',Math.max(2,Math.round(stat(t,'stacks')))+' hits');
    if(d.stacks && t.type==='venom') s += row('Max stacks','x',Math.round(stat(t,'stacks')));
    if(d.push) s += row('Push','x',(Math.round(stat(t,'push')*10)/10)+' tiles');
    if(d.chain) s += row('Chain','chain',Math.round(stat(t,'chain')),nextVal('chain'));
    if(d.proj==='beam') s += row('Heat','x','×'+t.ramp.toFixed(1)+' / ×'+(flag(t,'ramp')||2.2));
    s += row('Targets','x',(d.ground?'Ground':'')+(d.ground&&(d.air||flag(t,'air'))?' + ':'')+(d.air||flag(t,'air')?'Air':''));
    s += row('Kills','x',t.kills, null);
  }
  s += '<div class="ptrait">'+d.trait+'</div>';
  if(u) s += '<div class="ptrait ult">🌟 '+u.name+': '+u.desc+'</div>';
  if(t.syn && t.syn.size) t.syn.forEach(id=>{ const S = TD.SYNERGIES.find(x=>x.id===id); s += '<div class="ptrait syn">🔗 '+S.icon+' '+S.name+': '+S.desc+'</div>'; });
  if(t.crystal) s += '<div class="ptrait good">'+(t.type==='tesla'?'⚡ Energized by a crystal':'❄️ Ice-charged by a crystal')+(G.surge>0?' · SURGE ×2':'')+'</div>';
  if(G.runes.has(t.cx+','+t.cz)) s += '<div class="ptrait good">🔮 Ancient rune: +25% damage, +0.3 range</div>';
  if(t.dis > 0) s += '<div class="ptrait bad">⛔ '+(DIS_TEXT[t.disKind]||'Disabled')+' for '+t.dis.toFixed(1)+'s</div>';
  $('pStats').innerHTML = s;
  if(lv===1){ const c = towerCost(t.type, 2); up.style.display=''; br.style.display='none'; up.textContent = 'UPGRADE  '+c; up.disabled = G.gold < c; }
  else if(lv===2){ const c = towerCost(t.type, 3); up.style.display='none'; br.style.display='block';
    br.innerHTML = '<div class="brTitle">Choose a specialization · '+c+' 💰</div>'+d.branches.map((x,i)=>'<button class="brbtn" data-i="'+i+'" '+(G.gold<c?'disabled':'')+'><b>'+x.icon+' '+x.name+'</b><span>'+x.desc+'</span><small>Ultimate: '+d.ult[i].icon+' '+d.ult[i].name+'</small></button>').join('');
    br.querySelectorAll('.brbtn').forEach(x=>x.addEventListener('click', ()=>upgrade(t, +x.dataset.i))); }
  else if(lv===3 && d.ult){ const U2 = d.ult[t.branch], c = towerCost(t.type, 4, t.branch), okM = ml >= TD.ULT_MASTERY;
    up.style.display='none'; br.style.display='block';
    br.innerHTML = '<div class="brTitle">Ultimate upgrade · '+c+' 💰</div><button class="brbtn ult" id="ultBtn" '+(okM?'':'data-lock="1" ')+(G.gold<c||!okM?'disabled':'')+'><b>'+U2.icon+' '+U2.name+'</b><span>'+U2.desc+'</span>'+(okM?'':'<small>🔒 Needs '+d.name+' mastery '+TD.ULT_MASTERY+' — you are at '+ml+'</small>')+'</button>';
    $('ultBtn').addEventListener('click', ()=>upgrade(t)); }
  else { up.style.display='none'; br.style.display='none'; }
  sl.textContent = 'SELL  +'+Math.round(t.spent*sellRate());
  p.classList.add('show');
}
function renderWaveBtn(){
  const b = $('waveBtn');
  if(G.phase!=='build' || G.over){ b.classList.remove('show'); return; }
  b.classList.add('show');
  const n = G.wave+1, groups = wavePlan(n), boss = groups.some(g=>g.type==='boss'), swarm = groups.some(g=>g.swarm);
  $('wbTitle').textContent = (n===1?'START':'SEND')+' WAVE '+n + (boss ? '  👑' : '') + (swarm ? '  🐜' : '');
  const tags = [];
  if(G.mode!=='bossrush' && TD.isNight(n)) tags.push('🌙 Night');
  const w = TD.rollWeather(G.map.theme, n, G.seed); if(w!=='clear') tags.push(TD.WEATHER[w].icon+' '+TD.WEATHER[w].name);
  if(routesFor(n).length > 1) tags.push('🔀 Split roads');
  if(swarm) tags.push('🐜 Swarm');
  if(G.nextEv){ const d = TD.EVENTS.find(x=>x.id===G.nextEv); if(d) tags.push(d.icon+' '+d.name.toLowerCase()); }
  $('wbSub').textContent = (tags.length ? tags.join(' · ')+'  —  ' : '') + TD.waveLabel(groups);
  $('wbTimer').textContent = G.buildTimer > 0 ? Math.ceil(G.buildTimer)+'s  ·  +'+Math.round(G.buildTimer*1.5)+' gold now' : 'Ready when you are';
  b.classList.toggle('boss', boss);
}
function syncSpeed(){ document.querySelectorAll('.spd').forEach(b=>b.classList.toggle('on', +b.dataset.s===G.speed)); }
function syncToggles(){
  const set = (id, off) => { const el = $(id); if(el) el.classList.toggle('off', off); };
  set('sndBtn', SAVE.muted); set('sSound', SAVE.muted); set('sMusic', !SAVE.music); set('sNums', !SAVE.nums); set('sQuality', SAVE.quality==='low');
}

// ---- menu ------------------------------------------------------------
function showPanel(id){
  document.querySelectorAll('.mpanel').forEach(p=>p.classList.toggle('show', p.id==='mp-'+id));
  if(id==='maps') renderMaps(); if(id==='towers') renderTowers(); if(id==='challenges') renderChallenges(); if(id==='skins') renderSkins(); if(id==='settings') syncToggles(); if(id==='daily') renderDaily();
  if(id==='research') renderResearch(); if(id==='records') renderRecords();
  renderProfile();
}
function renderProfile(){
  const li = TD.levelOf(SAVE.xp), pr = SAVE.prestige||0;
  $('prLevel').textContent = li.level; $('prXp').textContent = li.into+' / '+li.need+' XP'; $('prFill').style.width = Math.max(2, Math.round(li.into/li.need*100))+'%';
  $('prCoins').textContent = SAVE.coins; $('prRp').textContent = SAVE.rp||0;
  $('prBadge').classList.toggle('pres', pr>0); $('prStarsP').textContent = pr ? '★'+pr : '';
  const nu = nextUnlockInfo();
  $('prNext').innerHTML = nu ? '<em>NEXT UNLOCK</em> <b>'+nu.u.icon+' Level '+nu.u.level+'</b> — '+nu.u.text+' <small>· '+nu.need+' XP to go</small>' : (pr ? '<em>PRESTIGE '+pr+'</em> +'+(pr*10)+'% XP · +'+(pr*5)+'% starting gold' : '<em>MAX</em> Everything unlocked');
  const canP = li.level >= TD.PRESTIGE_LEVEL && pr < TD.PRESTIGE_MAX; $('prPrestige').style.display = canP ? '' : 'none';
  const stars = TD.MAPS.reduce((a,m)=>a+mapSave(m.id).stars,0); $('prStars').textContent = stars+' / '+(TD.MAPS.length*3);
  const nc = TD.CHALLENGES.filter(c=>SAVE.ch[c.id]&&SAVE.ch[c.id].done).length; $('mChBadge').textContent = nc+'/'+TD.CHALLENGES.length;
  const D = dailyEnsure(), nd = D.tasks.filter(x=>x.done).length; $('mDayBadge').textContent = nd+'/3'; $('mDaily').classList.toggle('fresh', nd < 3);
  $('mRsBadge').textContent = (SAVE.rp||0)+' RP'; $('mResearch').classList.toggle('fresh', affordableResearch());
}
function affordableResearch(){ return TD.RESEARCH.some(n=>rs(n.id) < n.max && (SAVE.rp||0) >= TD.researchCost(n, rs(n.id))); }
function doPrestige(){
  askConfirm('Prestige: your player level goes back to 1, but you keep every unlock, map, skin, coin, mastery and research — and gain a permanent +10% XP and +5% starting gold.', ()=>{
    SAVE.prestige = (SAVE.prestige||0)+1; SAVE.xp = 0; chMark('prestige'); persist(); sfx('level'); showPanel('home'); toast('⭐ Prestige '+SAVE.prestige+'! Permanent bonus unlocked', 'good'); }, 'PRESTIGE');
}
function renderMaps(){
  const host = $('mapCards');
  const mode = G.menuMode || 'normal';
  host.innerHTML = TD.MAPS.map((m,i)=>{
    const s = mapSave(m.id), open = unlocked(i);
    return '<button class="mapCard theme-'+m.theme+(open?'':' locked')+(i===G.mapIdx?' on':'')+'" data-i="'+i+'">'+
      '<span class="mcName">'+m.name+(m.tiered?' <em class="tier">Tier '+tierOf(m)+'</em>':'')+(s.hard?' <span class="crown" title="Won on Hard">👑</span>':'')+(m.routes?' <span class="crown" title="Changing roads">🔀</span>':'')+'</span><span class="mcSub">'+(modeDef(mode).waves||m.waves)+' waves · boss: '+m.boss+(s.best?' · best '+s.best:'')+(s.endless?' · endless '+s.endless:'')+'</span>'+
      '<span class="mcEff">'+m.effectText+'</span>'+
      '<span class="mcStars">'+[1,2,3].map(k=>'<i class="'+(k<=s.stars?'on':'')+'">★</i>').join('')+'</span>'+
      (open?'':'<span class="mcLock">🔒 '+(m.needLevel ? 'Reach player level '+m.needLevel : 'Win the previous map')+'</span>')+'</button>';
  }).join('');
  host.querySelectorAll('.mapCard').forEach(b=>b.addEventListener('click', ()=>{ const i = +b.dataset.i; if(!unlocked(i)){ sfx('nope'); return; } G.mapIdx = i; sfx('click'); renderMaps(); }));
  // modes
  $('modeRow').innerHTML = TD.MODES.map(m=>{ const lock = m.unlock && ulevel() < m.unlock; return '<button class="modeBtn'+(m.id===mode?' on':'')+(lock?' locked':'')+'" data-m="'+m.id+'"><span>'+m.icon+'</span>'+m.name+(lock?'<small>Lv '+m.unlock+'</small>':'')+'</button>'; }).join('');
  $('modeRow').querySelectorAll('.modeBtn').forEach(b=>b.addEventListener('click', ()=>{ const m = TD.MODES.find(x=>x.id===b.dataset.m); if(m.unlock && ulevel() < m.unlock){ toast('🔒 '+m.name+' unlocks at player level '+m.unlock, 'bad'); sfx('nope'); return; } G.menuMode = m.id; SAVE.lastMode = G.menuMode; persistSoon(); sfx('click'); renderMaps(); }));
  const md = modeDef(mode);
  $('modeDesc').textContent = md.desc;
  const rr = $('ruleRow'); rr.style.display = mode==='challenge' ? '' : 'none';
  if(mode==='challenge'){ const cur = G.menuRule || 'notesla';
    rr.innerHTML = TD.CHALLENGE_RULES.map(r=>'<button class="ruleBtn'+(r.id===cur?' on':'')+(SAVE.chal[r.id]?' done':'')+'" data-r="'+r.id+'"><b>'+r.icon+' '+r.name+(SAVE.chal[r.id]?' ✓':'')+'</b><span>'+r.desc+'</span></button>').join('');
    rr.querySelectorAll('.ruleBtn').forEach(b=>b.addEventListener('click', ()=>{ G.menuRule = b.dataset.r; SAVE.lastRule = G.menuRule; persistSoon(); sfx('click'); renderMaps(); })); }
  renderLoadout();
  $('playBtn').textContent = 'PLAY  ·  '+TD.MAPS[G.mapIdx].name+(mode!=='normal' ? '  ·  '+md.name : '');
}
// pick up to 6 towers to bring into a match (Build Mode takes the first 4)
function renderLoadout(){
  if(!SAVE.loadout || !SAVE.loadout.length) SAVE.loadout = TD.DEFAULT_LOADOUT.slice();
  const lo = SAVE.loadout, rule = G.menuMode==='challenge' ? TD.CHALLENGE_RULES.find(r=>r.id===(G.menuRule||'notesla')) : null;
  const lim = rule && rule.pick ? rule.pick : 6;
  $('loTitle').textContent = 'Your towers · '+Math.min(lo.length, lim)+'/'+lim+(lim<6?' (Build Mode takes the first '+lim+')':'');
  $('loadoutRow').innerHTML = TD.TOWER_ORDER.map(k=>{ const d = TOWERS[k], lock = !towerUnlocked(k), i = lo.indexOf(k), ml = mastery(k), rar = TD.rarityOf(ml);
    return '<button class="loBtn'+(i>=0?' on':'')+(i>=lim?' over':'')+(lock?' locked':'')+'" data-k="'+k+'" style="--rar:'+rar.css+'"><span>'+d.icon+'</span>'+d.name+(i>=0?'<em>'+(i+1)+'</em>':'')+(lock?'<small>Lv '+d.unlock+'</small>':'')+'</button>'; }).join('');
  $('loadoutRow').querySelectorAll('.loBtn').forEach(b=>b.addEventListener('click', ()=>{ const k = b.dataset.k; if(!towerUnlocked(k)){ toast('🔒 '+TOWERS[k].name+' unlocks at player level '+TOWERS[k].unlock, 'bad'); sfx('nope'); return; }
    const i = lo.indexOf(k); if(i>=0){ if(lo.length<=1){ sfx('nope'); return; } lo.splice(i,1); } else { if(lo.length>=6){ toast('Loadout is full — tap a tower to remove it first', 'bad'); sfx('nope'); return; } lo.push(k); }
    persistSoon(); sfx('click'); renderLoadout(); }));
}
function renderDaily(){
  const D = dailyEnsure();
  const now = new Date(), tom = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1), ms = tom-now, hh = Math.floor(ms/3600000), mm = Math.floor(ms%3600000/60000);
  $('dailyList').innerHTML = D.tasks.map((task,i)=>{ const def = TD.DAILY_POOL.find(x=>x.id===task.id), r = TD.DAILY_REWARD[i], pct = Math.round(task.p/task.n*100);
    return '<div class="chItem'+(task.done?' done':'')+'"><span class="chIcon">'+def.icon+'</span><div class="chBody"><b>'+dailyText(def, task.n)+(task.done?' ✓':'')+'</b><span>'+['Easy','Medium','Hard'][i]+'</span>'+
      '<div class="chBar"><i style="width:'+pct+'%"></i></div></div><em>'+(task.done?'DONE':Math.floor(task.p)+'/'+task.n)+'<small>+'+r.coins+' 💰 +'+r.xp+' XP</small></em></div>'; }).join('') +
    '<div class="chItem bonus'+(D.bonus?' done':'')+'"><span class="chIcon">🌟</span><div class="chBody"><b>Complete all three</b><span>Daily bonus</span></div><em>'+(D.bonus?'DONE':D.tasks.filter(x=>x.done).length+'/3')+'<small>+'+TD.DAILY_BONUS.coins+' 💰 +'+TD.DAILY_BONUS.xp+' XP</small></em></div>';
  $('dailyReset').textContent = 'New challenges in '+hh+'h '+mm+'m';
}
function renderTowers(){
  const lv = ulevel();
  $('towerList').innerHTML = TD.TOWER_ORDER.map(k=>{ const d = TOWERS[k]; const locked = d.unlock && lv < d.unlock; const kills = SAVE.mastery[k]||0, ml = TD.masteryOf(kills), rar = TD.rarityOf(ml), nextK = TD.MASTERY[Math.min(10, ml+1)];
    return '<div class="tinfo'+(locked?' locked':'')+'" style="--rar:'+rar.css+'"><div class="tiHead"><span class="tiIcon">'+d.icon+'</span><div><b>'+d.name+' <i class="rarTag">'+rar.name+' · mastery '+ml+'</i></b><span>'+d.desc+'</span></div><em>'+(locked?'🔒 Lv '+d.unlock:d.cost+' 💰')+'</em></div>'+
      '<div class="mBar"><i style="width:'+(ml>=10?100:Math.round((kills-TD.MASTERY[ml])/(nextK-TD.MASTERY[ml])*100))+'%"></i><span>'+(ml>=10?'MAX':(k==='bank'?'':'')+kills+' / '+nextK+(k==='bank'?' (earned gold ÷5)':' kills'))+'</span></div>'+
      '<div class="tiTrait">'+d.trait+'</div>'+
      (d.dmg?'<div class="tiStats">Damage '+d.dmg.join(' / ')+' · Range '+d.range.join(' / ')+(d.proj!=='beam'&&d.rate?' · Rate '+d.rate.join(' / '):'')+'</div>':'<div class="tiStats">Income '+d.income.join(' / ')+' per wave · Range '+d.range.join(' / ')+'</div>')+
      '<div class="tiBr">'+d.branches.map((b,i)=>'<span><b>'+b.icon+' '+b.name+'</b> '+b.desc+'<small>🌟 '+d.ult[i].name+': '+d.ult[i].desc+'</small></span>').join('')+'</div>'+
      (ml < TD.ULT_MASTERY ? '<div class="tiLock">🔒 Ultimates unlock at mastery '+TD.ULT_MASTERY+'</div>' : '')+'</div>'; }).join('')+
    '<div class="tiEnemies syn"><b>🔗 Synergies — two towers within 2 tiles</b>'+TD.SYNERGIES.map(S=>'<span><u>'+S.icon+' '+S.name+'</u> — '+S.desc+'</span>').join('')+'</div>'+
    '<div class="tiEnemies"><b>Enemies to watch</b>'+Object.keys(ENEMIES).filter(k=>ENEMIES[k].note).map(k=>'<span><u>'+ENEMIES[k].name+' <small>('+(ENEMIES[k].night?'night waves':'wave '+ENEMIES[k].from+'+')+')</small></u> — '+ENEMIES[k].note+'</span>').join('')+'<span><u>Swarm waves</u> — every 7th wave brings a horde of tiny Swarmlings.</span></div>'+
    '<div class="tiEnemies boss"><b>Bosses</b><span>Every boss enrages at 50% health, calls for help at 25% and raises a shield at 10% — plus a signature move:</span>'+
      TD.MAPS.map(m=>{ const k = TD.BOSS_SKILLS[m.bossSkill]; return '<span><u>'+m.boss+'</u> ('+m.name+') — '+k.icon+' '+k.name+': '+k.desc+'</span>'; }).join('')+'</div>'+
    '<div class="tiEnemies obj"><b>The world</b><span>🌙 Waves 6–10, 16–20, 26–30 are fought at night. 🌧️ Weather changes every wave. 🎲 Random events strike between waves.</span><span>🔀 Some roads fork or change mid-match. 🌳 Trees and 🧱 ruins can be cleared — one of them hides a secret, and a ✨ sparkle marks another.</span><span>⚡ Energy crystals power Teslas, ❄️ ice crystals power Frosts. 🛡️ Your hero speeds up towers near him. 🚨 Last Stand shoves every enemy back once per wave.</span></div>';
}
function renderChallenges(){
  $('chList').innerHTML = TD.CHALLENGES.map(c=>{ const e = SAVE.ch[c.id]||{p:0,done:false}; const v = Math.min(c.goal, chValue(c)); const pct = Math.round(v/c.goal*100);
    return '<div class="chItem'+(e.done?' done':'')+'"><span class="chIcon">'+c.icon+'</span><div class="chBody"><b>'+c.name+(e.done?' ✓':'')+'</b><span>'+c.desc+'</span>'+
      '<div class="chBar"><i style="width:'+(e.done?100:pct)+'%"></i></div></div><em>'+(e.done?'DONE':v+'/'+c.goal)+'<small>+'+c.coins+' 💰'+(c.xp?' +'+c.xp+' XP':'')+'</small></em></div>'; }).join('');
}
function renderResearch(){
  $('rsPoints').textContent = (SAVE.rp||0)+' research points · earn them by playing (1 per 5 waves, +3 for a win)';
  const branches = [...new Set(TD.RESEARCH.map(n=>n.branch))];
  $('rsTree').innerHTML = branches.map(bn=>'<div class="rsCol"><h3>'+bn+'</h3>'+TD.RESEARCH.filter(n=>n.branch===bn).map(n=>{ const l = rs(n.id), max = l>=n.max, c = TD.researchCost(n, l);
    return '<button class="rsNode'+(max?' max':'')+'" data-id="'+n.id+'" '+(max||(SAVE.rp||0)<c?'disabled':'')+'><span class="rsIc">'+n.icon+'</span><b>'+n.name+'</b><span>'+n.desc+'</span><i class="rsPips">'+Array.from({length:n.max},(_,i)=>'<u class="'+(i<l?'on':'')+'"></u>').join('')+'</i><em>'+(max?'MAX':c+' RP')+'</em></button>'; }).join('')+'</div>').join('');
  $('rsTree').querySelectorAll('.rsNode').forEach(b=>b.addEventListener('click', ()=>{ const n = TD.RESEARCH.find(x=>x.id===b.dataset.id), l = rs(n.id), c = TD.researchCost(n, l);
    if(l >= n.max || (SAVE.rp||0) < c){ sfx('nope'); return; } SAVE.rp -= c; SAVE.research[n.id] = l+1; const tot = Object.values(SAVE.research).reduce((a,b)=>a+b,0); if(tot >= 5) chMark('research5'); persist(); sfx('upgrade'); renderResearch(); renderProfile(); }));
}
const MODE_NAME = id => (TD.MODES.find(m=>m.id===id)||{}).name || id;
function renderRecords(){
  const lb = SAVE.lb||[], mapName = id => (TD.MAPS.find(m=>m.id===id)||{}).name || id;
  const rowsOf = list => list.length ? list.map((r,i)=>'<div class="lbRow'+(i<3?' top':'')+'"><span class="lbPos">'+(i<3?['🥇','🥈','🥉'][i]:(i+1))+'</span><b>'+r.wave+' waves</b><span>'+mapName(r.map)+' · '+MODE_NAME(r.mode)+(r.won?' ✓':'')+'</span><small>'+r.kills+' kills · '+r.date+'</small></div>').join('') : '<div class="lbEmpty">No runs yet — go set a record!</div>';
  $('lbEndless').innerHTML = rowsOf(lb.filter(r=>r.mode==='endless').slice(0,10));
  $('lbOther').innerHTML = rowsOf(lb.filter(r=>r.mode!=='endless').slice(0,10));
}
function renderSkins(){
  $('skinCoins').textContent = SAVE.coins;
  const lv = ulevel();
  $('skinList').innerHTML = TD.SKINS.map(s=>{ const owned = SAVE.skins.owned.includes(s.id), sel = SAVE.skins.sel[s.tower]===s.id; const d = TOWERS[s.tower], lockd = s.level && lv < s.level;
    let btn;
    if(sel) btn = '<button class="skbtn on" data-id="'+s.id+'" data-act="unsel">EQUIPPED</button>';
    else if(owned) btn = '<button class="skbtn" data-id="'+s.id+'" data-act="sel">EQUIP</button>';
    else if(lockd) btn = '<button class="skbtn" disabled>🔒 LEVEL '+s.level+'</button>';
    else if(!s.cost) btn = '<button class="skbtn buy" data-id="'+s.id+'" data-act="buy">CLAIM FREE</button>';
    else btn = '<button class="skbtn buy" data-id="'+s.id+'" data-act="buy" '+(SAVE.coins<s.cost?'disabled':'')+'>BUY '+s.cost+' 💰</button>';
    return '<div class="skin'+(sel?' sel':'')+'"><span class="skSw" style="background:linear-gradient(135deg,#'+s.color.toString(16).padStart(6,'0')+',#'+s.accent.toString(16).padStart(6,'0')+')">'+d.icon+'</span>'+
      '<b>'+s.icon+' '+s.name+'</b><span>'+d.name+' skin'+(s.level?' · Lv '+s.level+' reward':'')+'</span>'+btn+'</div>'; }).join('');
  $('skinList').querySelectorAll('.skbtn[data-id]').forEach(b=>b.addEventListener('click', ()=>{
    const s = TD.SKINS.find(x=>x.id===b.dataset.id), act = b.dataset.act;
    if(act==='buy'){ if(SAVE.coins < s.cost || (s.level && ulevel() < s.level)){ sfx('nope'); return; } SAVE.coins -= s.cost; SAVE.skins.owned.push(s.id); SAVE.skins.sel[s.tower] = s.id; sfx('coin'); }
    else if(act==='sel'){ SAVE.skins.sel[s.tower] = s.id; sfx('click'); }
    else { delete SAVE.skins.sel[s.tower]; sfx('click'); }
    persist(); renderSkins(); renderProfile();
  }));
}
function openMenu(){
  G.phase = 'menu'; G.started = false; G.paused = false; G.overdrive = 0; G.heroMode = false;
  if(typeof window.onGameplayStop==='function') window.onGameplayStop();
  $('app').classList.add('menu'); $('menu').classList.remove('hide'); $('result').classList.remove('show'); $('pauseWrap').classList.remove('show'); $('stormFx').classList.remove('show'); $('odFx').classList.remove('show'); hideBossBar();
  $('perkWrap').classList.remove('show'); $('replayWrap').classList.remove('show'); setWeatherFx('clear'); $('nightFx').style.opacity = '0'; W.setNight(0); W.setFog(0); $('chips').innerHTML = '';
  W.hideRing(); W.hideGhost(); W.hideMarker(); numsClear(); showPanel('home');
}
function setPaused(p){
  if(G.phase==='menu' || G.over) return;
  G.paused = p; $('pauseWrap').classList.toggle('show', p);
  if(p && typeof window.onGameplayStop==='function') window.onGameplayStop();
  if(!p && typeof window.onGameplayStart==='function') window.onGameplayStart();
}
// in-game confirm dialog (portals may block window.confirm inside their iframe)
function askConfirm(text, yes, yesLabel){
  $('cfText').textContent = text; $('cfYes').textContent = yesLabel || 'YES, RESET'; $('confirmWrap').classList.add('show');
  $('cfYes').onclick = ()=>{ $('confirmWrap').classList.remove('show'); yes(); };
  $('cfNo').onclick = ()=>{ $('confirmWrap').classList.remove('show'); sfx('click'); };
}
// ---- replay: watch the build order of the last match on a minimap ----
const RP = { raf:0, t:0, playing:false, speed:1 };
function openReplay(){
  const R = G.replay; if(!R) return;
  $('replayWrap').classList.add('show'); RP.t = 0; RP.playing = true; RP.last = performance.now();
  const dur = Math.max(8, Math.min(24, R.waves*0.7)); RP.dur = dur;
  const loop = (now)=>{ if(!$('replayWrap').classList.contains('show')){ RP.raf = 0; return; }
    const dt = Math.min(0.1, (now-RP.last)/1000); RP.last = now; if(RP.playing){ RP.t = Math.min(1, RP.t + dt*RP.speed/dur); if(RP.t>=1) RP.playing = false; }
    drawReplay(); RP.raf = requestAnimationFrame(loop); };
  if(!RP.raf) RP.raf = requestAnimationFrame(loop);
}
function drawReplay(){
  const R = G.replay, m = TD.MAPS[R.map], cv = $('rpCanvas'), g = cv.getContext('2d');
  const W2 = cv.clientWidth || 320, H2 = Math.round(W2*m.h/m.w); if(cv.width !== W2*2){ cv.width = W2*2; cv.height = H2*2; cv.style.height = H2+'px'; }
  const cs = cv.width/m.w, th = TD.THEMES[m.theme];
  g.fillStyle = th.ground; g.fillRect(0,0,cv.width,cv.height);
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; for(let x=0;x<=m.w;x++){ g.beginPath(); g.moveTo(x*cs,0); g.lineTo(x*cs,cv.height); g.stroke(); } for(let z=0;z<=m.h;z++){ g.beginPath(); g.moveTo(0,z*cs); g.lineTo(cv.width,z*cs); g.stroke(); }
  (m.routeDefs||[]).forEach((r,i)=>{ g.globalAlpha = R.routes[i] ? 1 : 0.35; g.fillStyle = th.path; r.list.forEach(k=>{ const [x,z] = k.split(',').map(Number); g.fillRect(x*cs+1, z*cs+1, cs-2, cs-2); }); });
  g.globalAlpha = 1;
  const endT = R.t || 1, now = RP.t*endT, towers = new Map();
  let wave = 0;
  for(const a of R.log){ if(a.t > now) break; wave = a.w; const key = a.x+','+a.z;
    if(a.a==='build') towers.set(key, { k:a.k, l:1, b:null, x:a.x, z:a.z, born:a.t });
    else if(a.a==='up'){ const t = towers.get(key); if(t){ t.l = a.l; t.b = a.b; t.born = a.t; } }
    else if(a.a==='sell') towers.delete(key); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  towers.forEach(t=>{ const age = (now - t.born), pop = Math.min(1, age*3/Math.max(1,endT/60));
    g.fillStyle = 'rgba(10,14,22,.55)'; g.beginPath(); g.arc((t.x+0.5)*cs, (t.z+0.5)*cs, cs*0.42*(0.6+0.4*pop), 0, Math.PI*2); g.fill();
    g.strokeStyle = ['#b8c2d0','#b8c2d0','#7fd4ff','#ffc857','#ff7ab8'][t.l]; g.lineWidth = 3; g.stroke();
    g.font = Math.round(cs*0.5)+'px sans-serif'; g.fillText(TOWERS[t.k].icon, (t.x+0.5)*cs, (t.z+0.52)*cs); });
  $('rpInfo').textContent = 'Wave '+Math.max(1,wave)+' · '+towers.size+' towers · '+(R.won?'Victory':'Defeat')+' after '+R.waves+' waves';
  $('rpBar').style.width = (RP.t*100)+'%'; $('rpPlay').textContent = RP.playing ? '❚❚' : (RP.t>=1 ? '↺' : '▶');
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
  if(moved > 10 || G.phase==='menu' || G.phase==='perk' || G.over || G.paused) return;
  unlockAudio();
  const p = W.pick(e.clientX, e.clientY);
  if(!p){ deselect(); return; }
  if(G.heroMode && G.hero){ G.hero.tx = clamp(p.x, 0.2, G.map.w-0.2); G.hero.tz = clamp(p.z, 0.2, G.map.h-0.2); G.heroMode = false; W.showMarker(G.hero.tx, G.hero.tz, 0.5); setTimeout(()=>{ if(!G.targetMode) W.hideMarker(); }, 500); sfx('click'); renderAbilities(); renderBuildBar(); return; }
  if(G.hero && G.hero.dead<=0 && !G.buildType && !G.targetMode && Math.hypot(p.x-G.hero.x, p.z-G.hero.z) < 0.45){ heroSelectToggle(); return; }
  if(G.targetMode){ if(inside(p.cx,p.cz) || true){ castAbility(G.targetMode, new (window.THREE.Vector3)(p.x, 0.1, p.z)); renderBuildBar(); } return; }
  const t = G.grid.get(p.cx+','+p.cz);
  if(t){ if(G.sel===t) deselect(); else select(t); return; }
  const ob = G.objs.get(p.cx+','+p.cz);
  if(ob){ if(G.selObj===ob) deselect(); else selectObj(ob); if(G.buildType && ob.type==='tree') toast('🌳 A tree is in the way — clear it for '+TREE_COST+' gold', 'tip'); return; }
  if(G.buildType){ if(cellFree(p.cx,p.cz)) build(G.buildType, p.cx, p.cz); else if(inside(p.cx,p.cz)) { toast('Can\'t build on the road', 'bad'); sfx('nope'); } return; }
  deselect();
}
function onPointerMove(e){
  if(e.pointerType!=='mouse' || G.phase==='menu' || G.over) return;
  if(e.target.closest('button, #panel, #buildWrap, #waveBtn, #hud, #abilBar')){ W.hideGhost(); if(!G.sel) W.hideRing(); return; }
  const p = W.pick(e.clientX, e.clientY);
  if(!p){ W.hideGhost(); return; }
  if(G.targetMode){ W.showMarker(p.x, p.z, 1.9); return; }
  if(G.heroMode){ W.showMarker(clamp(p.x,0.2,G.map.w-0.2), clamp(p.z,0.2,G.map.h-0.2), 0.5); return; }
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
  if(G.phase==='perk'){ if(n>=1 && n<=3) choosePerk(n-1); return; }
  if(n>=1 && n<=6){ const k = (G.loadout||[])[n-1]; if(k) setBuildType(k); return; }
  if(e.code==='KeyE'){ useLastStand(); return; }
  if(e.code==='KeyH'){ heroSelectToggle(); return; }
  if(e.code==='Escape' && G.heroMode){ G.heroMode = false; W.hideMarker(); renderAbilities(); renderBuildBar(); return; }
  if(e.code==='Escape'){ if(G.targetMode){ G.targetMode=null; W.hideMarker(); renderAbilities(); renderBuildBar(); } else if(G.buildType) setBuildType(null); else deselect(); W.hideGhost(); return; }
  if(e.code==='Space' || e.code==='Enter'){ e.preventDefault(); callWave(); return; }
  if(e.code==='KeyU' && G.sel && G.sel.level===1) upgrade(G.sel);
  if(e.code==='KeyU' && G.sel && G.sel.level===3) upgrade(G.sel);
  if(e.code==='KeyU' && G.selObj && CLEAR_COST[G.selObj.type]) clearObj(G.selObj);
  if(e.code==='KeyX' && G.sel) sell(G.sel);
  if(e.code==='KeyQ'){ G.speed = G.speed===1?2:(G.speed===2?3:1); syncSpeed(); }
  for(const a of TD.ABILITIES) if(e.code==='Key'+a.key) useAbility(a.id);
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
  if(G.boss && G.phase!=='menu') updateBossBar();
  if(uiT > 0.15){ uiT = 0; if(G.phase!=='menu'){ renderHud(); if(G.phase==='build') renderWaveBtn(); renderAbilities();
    if(G.sel && G.sel.level!==2 && (G.sel.type==='laser' || G.sel.dis>0 || G.sel.wasDis)){ G.sel.wasDis = G.sel.dis>0; renderPanel(); }
    if(G.selObj && CLEAR_COST[G.selObj.type]){ $('pUp').disabled = G.gold < Math.round(CLEAR_COST[G.selObj.type]*costMul()); }
    if(G.evSurge > 0 || G.cmd) renderChips();
    // the branch and ultimate buttons need the same gold refresh as the upgrade button
    if(G.sel && G.sel.level<4){ const up=$('pUp'); if(up.style.display!=='none') up.disabled = G.gold < towerCost(G.sel.type, G.sel.level+1, G.sel.branch);
      if(G.sel.level>=2){ const c = towerCost(G.sel.type, G.sel.level+1, G.sel.branch); $('pBranch').querySelectorAll('.brbtn:not([data-lock])').forEach(b=>b.disabled = G.gold < c); } }
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
  G.menuMode = SAVE.lastMode || 'normal'; G.menuRule = SAVE.lastRule || 'notesla';
  $('playBtn').addEventListener('click', ()=>{ unlockAudio(); const go = ()=>startMap(G.mapIdx, G.menuMode, G.menuRule); if(window.gameAdBreak) window.gameAdBreak('preroll', go); else go(); });
  $('sVol').addEventListener('input', e=>{ unlockAudio(); setVolume(e.target.value/100); $('sVolVal').textContent = e.target.value+'%'; });
  $('sSound').addEventListener('click', ()=>{ unlockAudio(); setMuted(!SAVE.muted); });
  $('sMusic').addEventListener('click', ()=>{ unlockAudio(); setMusic(!SAVE.music); });
  $('sNums').addEventListener('click', ()=>{ SAVE.nums = !SAVE.nums; persist(); syncToggles(); });
  $('sQuality').addEventListener('click', ()=>{ SAVE.quality = SAVE.quality==='low' ? 'high' : 'low'; persist(); W.setQuality(SAVE.quality); syncToggles(); });
  $('sReset').addEventListener('click', ()=>askConfirm('Reset all progress — stars, level, coins, skins and challenges?', ()=>{ try{ localStorage.removeItem(SAVE_KEY); localStorage.removeItem('td.save.v1'); }catch(e){} location.reload(); }));
  $('sVol').value = Math.round(SAVE.vol*100); $('sVolVal').textContent = Math.round(SAVE.vol*100)+'%';
  $('sndBtn').addEventListener('click', ()=>{ unlockAudio(); setMuted(!SAVE.muted); });
  $('pauseBtn').addEventListener('click', ()=>setPaused(!G.paused));
  $('resumeBtn').addEventListener('click', ()=>setPaused(false));
  $('pMenuBtn').addEventListener('click', ()=>{ window.gameAdBreak ? window.gameAdBreak('midgame', openMenu) : openMenu(); });
  $('menuBtn').addEventListener('click', ()=>setPaused(true));
  const narrow = window.matchMedia ? window.matchMedia('(max-aspect-ratio:1/1) and (max-width:600px)') : null;
  document.querySelectorAll('.spd').forEach(b=>b.addEventListener('click', ()=>{
    // on narrow phones only the active speed button is shown, so tapping it cycles
    if(narrow && narrow.matches && +b.dataset.s===G.speed) G.speed = G.speed===1?2:(G.speed===2?3:1); else G.speed = +b.dataset.s;
    syncSpeed(); sfx('click'); }));
  $('waveBtn').addEventListener('click', ()=>{ unlockAudio(); callWave(); });
  $('pUp').addEventListener('click', ()=>{ if(G.selObj && CLEAR_COST[G.selObj.type]) clearObj(G.selObj); else upgrade(G.sel); });
  $('prPrestige').addEventListener('click', ()=>{ unlockAudio(); doPrestige(); });
  $('resReplay').addEventListener('click', ()=>{ sfx('click'); openReplay(); });
  $('rpClose').addEventListener('click', ()=>{ $('replayWrap').classList.remove('show'); sfx('click'); });
  $('rpPlay').addEventListener('click', ()=>{ if(RP.t>=1) RP.t = 0; RP.playing = !RP.playing; RP.last = performance.now(); sfx('click'); });
  $('rpSpeed').addEventListener('click', ()=>{ RP.speed = RP.speed===1 ? 2 : (RP.speed===2 ? 4 : 1); $('rpSpeed').textContent = RP.speed+'×'; sfx('click'); });
  $('pSell').addEventListener('click', ()=>sell(G.sel));
  $('pClose').addEventListener('click', deselect);
  $('resRetry').addEventListener('click', ()=>{ const mode = G.mode, rule = G.rule; const go = ()=>startMap(G.mapIdx, mode, rule); window.gameAdBreak ? window.gameAdBreak('midgame', go) : go(); });
  $('resNext').addEventListener('click', ()=>{ const mode = G.mode; const go = ()=>startMap(G.mapIdx+1, mode); window.gameAdBreak ? window.gameAdBreak('midgame', go) : go(); });
  $('resEndless').addEventListener('click', ()=>{ G.over = false; G.won = false; G.endless = true; G.phase = 'build'; G.buildTimer = TD.BUILD_TIME; $('result').classList.remove('show'); renderHud(); renderWaveBtn(); if(typeof window.onGameplayStart==='function') window.onGameplayStart(); });
  $('resMenu').addEventListener('click', ()=>{ window.gameAdBreak ? window.gameAdBreak('midgame', openMenu) : openMenu(); });
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
TD.dbg = { step:(dt)=>step(dt), frame:()=>loop(performance.now()), start:startMap, callWave, build, upgrade, sell, finish, openMenu, sfx, castAbility, save:()=>SAVE, spawn, hit, bossSkill, clearTree, clearObj, showPanel, persist,
  choosePerk, offerPerks, triggerEvent, useLastStand, heroSelectToggle, openReplay, recomputeSyn, stat, retreat, selectObj, doPrestige };

// ---- portal integration ----------------------------------------------
window.gamePauseForAd = function(on){
  on = !!on; if(on===G.adPaused) return; G.adPaused = on;
  if(on){ if(G.raf){ cancelAnimationFrame(G.raf); G.raf = 0; } try{ if(AC && AC.state==='running') AC.suspend(); }catch(e){} }
  else{ try{ if(AC && AC.state==='suspended') AC.resume(); }catch(e){} G.last = performance.now(); if(!G.raf) G.raf = requestAnimationFrame(loop); }
};
window.gameIsPaused = function(){ return G.adPaused; };
window.gameShowAd = window.gameShowAd || null;
// kind: 'preroll' right after PLAY, 'midgame' on RETRY / NEXT MAP / MENU.
// A publisher hook taking (kind, done) plays the ad first and calls done when it ends.
window.gameAdBreak = function(kind, done){
  var fn = window.gameShowAd;
  if(typeof fn === 'function'){
    try{
      if(fn.length >= 2){ fn(kind || 'midgame', done || function(){}); return; }
      fn(kind || 'midgame');
    }catch(e){}
  }
  if(typeof done === 'function') done();
};
})();

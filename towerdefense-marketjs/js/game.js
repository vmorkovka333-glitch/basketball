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
const V8_NEW = ['dasher','burrower','regenerator','blazer','bulwark','volatile','frostbringer','magnet','jammer','possessed','mirrorimp','summoner','plaguebearer','skeleton','megaboss'];
const NO_INTRO = ['grunt','swarmling','splitling','echo','skeleton','boss','airboss','megaboss'];
const STAT0 = { kills:0, killsBy:{}, bosses:0, abilities:0, frozen:0, ghosts:0, early:0, crits:0, trees:0, secrets:0, nightKills:0, heroKills:0, ults:0, riskWaves:0, crystalsSpent:0, minis:0, grounded:0, triples:0, pickups:0, elites:0, mutants:0 };

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
  crystals:0, streak:0, streakLast:-9, bonus:{}, tst:{}, interludes:[], riskNext:false, waveRisk:false, timewarp:0, timeStop:0,
  mirror:false, secretOpen:false, secretNext:false, echoes:[], loopT:20, stormT:4,
  powerK:1, eUsed:0, eCap:12, base:{ walls:0, gate:0, guns:0, core:0 }, gateLeft:0, walls:[], warps:[], adapt:{ type:null, lvl:0 }, dmgWave:{}, dmgHist:[],
  survT:0, survWave:false, robot:null, pickups:[], holes:[], combosRun:new Set(), choice:null, scouts:0, moveT:null, threat:new Map(), coreT:30, castleCool:0,
};
window.TD.G = G;

// ---- save ------------------------------------------------------------
const SAVE_KEY = 'td.save.v2';
let SAVE = { maps:{}, vol:0.6, muted:false, music:true, nums:true, quality:'high', games:0, xp:0, coins:0,
  skins:{ owned:[], sel:{} }, ch:{}, stats:Object.assign({}, STAT0, {killsBy:{}}), daily:null, chal:{}, lastMode:'normal', lastRule:'notesla',
  rp:0, research:{}, prestige:0, mastery:{}, lb:[], loadout:null, recipes:[], secretBoss:{}, season:null, title:'commander', titles:[], autoUlt:false,
  cores:0, combos:[], legends:[], keys:[], mapCh:{}, regionDone:{}, robotLv:1, secretMapSeen:false, seen:null, mutators:[] };
function loadSave(){
  try{ const r = localStorage.getItem(SAVE_KEY); if(r){ const o = JSON.parse(r); SAVE = Object.assign(SAVE, o); SAVE.stats = Object.assign({}, STAT0, {killsBy:{}}, o.stats||{}); SAVE.chal = SAVE.chal||{}; SAVE.research = SAVE.research||{}; SAVE.mastery = SAVE.mastery||{}; SAVE.lb = SAVE.lb||[]; SAVE.recipes = SAVE.recipes||[]; SAVE.secretBoss = SAVE.secretBoss||{}; SAVE.titles = SAVE.titles||[]; SAVE.skins = Object.assign({ owned:[], sel:{} }, o.skins||{});
    SAVE.combos = SAVE.combos||[]; SAVE.legends = SAVE.legends||[]; SAVE.keys = SAVE.keys||[]; SAVE.mapCh = SAVE.mapCh||{}; SAVE.regionDone = SAVE.regionDone||{}; SAVE.cores = SAVE.cores||0; SAVE.robotLv = SAVE.robotLv||1; SAVE.mutators = SAVE.mutators||[]; } }catch(e){}
  // v8 bestiary: veterans start with the enemies they've already met
  if(!Array.isArray(SAVE.seen)){ const best = Object.values(SAVE.maps||{}).reduce((a,m)=>Math.max(a, m.best||0, m.endless||0), 0);
    SAVE.seen = SAVE.games ? Object.keys(TD.ENEMIES).filter(k=>!V8_NEW.includes(k) && TD.ENEMIES[k].from <= best) : []; }
  // carry stars over from the first release
  try{ const r1 = localStorage.getItem('td.save.v1'); if(r1 && !SAVE.games){ const o = JSON.parse(r1); if(o.maps) SAVE.maps = o.maps; if(o.vol!=null) SAVE.vol = o.vol; } }catch(e){}
}
function persist(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); }catch(e){} }
function mapSave(id){ return SAVE.maps[id] || (SAVE.maps[id] = { stars:0, best:0 }); }
function unlocked(i){ const m = TD.MAPS[i]; if(m.secretMap) return SAVE.keys.length >= TD.KEYSTONE_MAPS.length; if(m.needLevel) return ulevel() >= m.needLevel; if(m.tiered) return mapSave(TD.MAPS[0].id).stars > 0; return i===0 || (mapSave(TD.MAPS[i-1].id).stars > 0); }
function mapIndex(id){ return TD.MAPS.findIndex(m=>m.id===id); }
function addCores(n, why){ if(!n) return; SAVE.cores = (SAVE.cores||0) + n; persistSoon(); if(why) toast('🔮 +'+n+' Aether Core'+(n>1?'s':'')+' — '+why, 'good'); }
function legendUnlocked(k){ if(k==='aether') return SAVE.legends.includes('aether') || SAVE.combos.length >= TD.COMBOS.length || mapSave('caverns').stars > 0; return SAVE.legends.includes(k); }
function robotLv(){ return clamp(SAVE.robotLv||1, 1, TD.ROBOT.max); }
function isStruct(t){ return !!TOWERS[t.type].struct; }
function combatTowers(){ return G.towers.filter(t=>!TOWERS[t.type].struct); }
function modeDef(id){ return TD.MODES.find(m=>m.id===(id||G.mode)) || TD.MODES[0]; }
function ruleDef(){ return G.mode==='challenge' ? TD.CHALLENGE_RULES.find(r=>r.id===G.rule) : null; }
function banned(type){ const r = ruleDef();
  if(TOWERS[type] && (TOWERS[type].struct || TOWERS[type].legendary)) return false;
  if(type==='paradox') return !(G.map && G.map.effect==='reality');
  if(r && r.ban && r.ban.includes(type)) return true;
  if(r && r.allow && !r.allow.includes(type)) return true;
  if(G.allowed && !G.allowed.includes(type)) return true;
  return false; }
// unlock level: prestiged players keep everything they unlocked before
function ulevel(){ return SAVE.prestige > 0 ? 99 : plevel(); }
function rs(id){ return SAVE.research[id] || 0; }
function perk(id){ return G.perks[id] || 0; }
function bonus(k){ return G.bonus[k] || 0; }
function seasonMod(){ const S = TD.seasonNow(); return S.theme.mod; }
function mastery(type){ return TD.masteryOf(SAVE.mastery[type] || 0); }
function bossInfo(){ return G.bossDef || G.map; }
function synMul(){ return 1 + 0.25*perk('syn_range'); }
function hasSyn(t, id){ return t.syn && t.syn.has(id); }
function tierOf(m){ return m.tiered ? (mapSave(m.id).tier || 1) : 1; }
function mapDiff(m){ return m.diff * (m.tiered ? TD.tierMul(tierOf(m)) : 1); }
function plevel(){ return TD.levelOf(SAVE.xp).level; }
function skinFor(type){ const id = SAVE.skins.sel[type]; return id ? TD.SKINS.find(s=>s.id===id) : null; }
function towerUnlocked(type){ const u = TOWERS[type].unlock; return !u || ulevel() >= u; }
// v8 helpers
function mut(id){ return !!(G.mut && G.mut.has(id)); }
function rankWave(){ return G.wave + (modeDef().rankShift||0); }
function tp(t, id){ return !!(t && t.perks && t.perks.includes(id)); }
function later(sec, fn){ (G.later = G.later||[]).push({ t:sec, fn }); }
function isBigType(type){ return type==='boss' || type==='airboss' || type==='megaboss'; }
function bossSkillKey(e){ return e.type==='airboss' ? 'dive' : (e.type==='megaboss' ? 'stomp' : (bossInfo().bossSkill || 'stomp')); }
function mutReward(){ let r = 0; if(G.mut) G.mut.forEach(id=>{ const M = TD.MUTATORS.find(x=>x.id===id); if(M) r += M.reward; }); return r; }

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
    const boss = G.bossAlive > 0 && G.phase==='wave', fin = boss && G.boss && G.boss.final && !G.boss.dead;
    const t = AC.currentTime, ch = boss ? BOSS_CHORDS[Math.floor(musStep/4)%2] : CHORDS[Math.floor(musStep/4)%CHORDS.length];
    if(musStep%4===0) ch.forEach((f,i)=>{ const o=AC.createOscillator(), g=AC.createGain(); o.type=i%2?'triangle':'sine'; o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.06,t+0.6); g.gain.exponentialRampToValueAtTime(0.0001,t+3.4); o.connect(g).connect(musGain); o.start(t); o.stop(t+3.5); });
    const o=AC.createOscillator(), g=AC.createGain(); o.type= boss?'square':'sine'; o.frequency.value=ch[musStep%2?1:0]*(boss?1:2);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(boss?0.04:0.05,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+0.35); o.connect(g).connect(musGain); o.start(t); o.stop(t+0.4);
    if(fin){ tone(55, 'sine', t, 0.2, 0.22, 32); noise(t, 0.06, 0.06, 2000, 7000); if(musStep%2) tone(ch[(musStep>>1)%ch.length]*4, 'square', t, 0.12, 0.025); }
    musStep++; musTimer = setTimeout(step, fin ? 360 : (boss ? 520 : 850));
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
function costMul(){ return (1 - 0.08*perk('cheap')) * (mut('pricey') ? 1.25 : 1); }
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
    if(key==='dmg') v *= 1 + 0.3*cb*(G.map && G.map.effect==='caverns' ? 1.5 : 1);
    if(t.type==='tesla' && key==='chain') v += cb;
    if(t.type==='frost' && key==='slowT') v *= 1 + 0.25*cb;
    if(t.type==='frost' && key==='stacks') v = Math.max(2, v - 2*cb);
  }
  const sm = synMul();
  const sMod = G.phase!=='menu' ? G.seasonMod : null, real = G.map && G.map.effect==='reality';
  if(key==='dmg'){
    v *= 1 + 0.01*mastery(TD.ultKey(t.type)) + 0.03*rs('dmg') + 0.12*perk('all_dmg') + 0.2*bonus('dmg');
    if(real) v *= 0.85;
    if(sMod==='ember' && t.type==='cannon') v *= 1.1;
    if(sMod==='storm' && t.type==='tesla') v *= 1.1;
    if(t.deathRay > 0) v *= 2;
    if(G.runes.has(t.cx+','+t.cz)) v *= 1.25;
    if(t.type==='tesla' && G.weather==='rain') v *= 1.25;
    if(t.type==='laser' && G.weather==='heat') v *= 1.2;
    if(t.type==='sniper') v *= 1 + 0.25*perk('sniper_dmg');
    if(G.overdrive > 0 && d.proj==='beam') v *= 1.6;
    if(d.legendary) v *= 1 + 0.07*Math.max(0, G.wave-1);
    if(t.infused) v *= 1.25;
    if(t.type==='tesla' && G.waveEv==='estorm') v *= 1.25;
    if(d.proj==='beam' && d.energy && G.powerK < 1) v *= G.powerK;
    if(t.vl > 1) v *= 1 + TD.VETERANCY.dmg*(t.vl-1);
    if(t.sick) v *= 0.75;
  }
  if(key==='range'){
    if(G.storm.active) v *= 0.75;
    if(G.weather==='fog') v *= t.type==='sniper' ? 0.75 : 0.85;
    if(G.night){ if(t.type==='laser'||t.type==='tesla') v *= 1.15; if(t.type==='archer'||t.type==='sniper') v *= 0.9; }
    if(G.waveEv==='wind') v *= 1.15;
    v *= 1 + 0.03*rs('range') + 0.1*perk('range') + 0.1*bonus('range');
    if(real) v *= 1.25;
    if(sMod==='neon' && t.type==='laser') v *= 1.1;
    if(G.runes.has(t.cx+','+t.cz)) v += 0.3;
    if(t.type==='frost' && hasSyn(t,'thermal')) v += 0.3*sm;
    if(t.infused) v *= 1.1;
    if(mut('fog')) v *= 0.85;
    if(tp(t,'eagle')) v *= 1.12;
  }
  if(key==='rate'){
    if(G.overdrive > 0) v *= 1.6;
    if(t.type==='tesla' && G.evSurge > 0) v *= 1.5;
    if(t.type==='tesla' && G.weather==='storm') v *= 1.35;
    if(t.type==='frost' && hasSyn(t,'super')) v *= 1 + 0.15*sm;
    if(G.hero && G.hero.dead<=0 && Math.hypot(G.hero.x-t.x, G.hero.z-t.z) <= TD.HERO.aura) v *= 1.15;
    v *= 1 + 0.1*perk('all_rate');
    if(t.oc) v *= 1 + t.oc;
    if(d.energy && G.powerK < 1) v *= G.powerK;
    if(t.chilled) v *= 0.7;
    if(tp(t,'rapid')) v *= 1.12;
    if(t.frenzyT > 0) v *= 1.3;
  }
  if(key==='chain' && t.type==='tesla') v += perk('tesla_chain') + bonus('coil');
  if(key==='slow' && t.type==='frost'){ v *= 1 + 0.3*perk('frost_slow') + 0.15*bonus('frostcore') + (sMod==='frost' ? 0.1 : 0); if(G.weather==='heat') v *= 0.75; v = Math.min(0.85, v); }
  if(key==='stacks' && t.type==='frost') v = Math.max(2, v - 2*bonus('frostcore'));
  if(key==='poisonT' && sMod==='bloom') v += 1;
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
    case 'merge': case 'mergeall': return (SAVE.recipes||[]).length;
    case 'ultfire': return s.ults||0;
    case 'risk10': return s.riskWaves||0;
    case 'shop': return s.crystalsSpent||0;
    case 'combo3': case 'comboall': return (SAVE.combos||[]).length;
    case 'triple': return s.triples||0;
    case 'minis': return s.minis||0;
    case 'grounded': return s.grounded||0;
    case 'robot100': return s.pickups||0;
    case 'campaign': return TD.CAMPAIGN.filter(c=>SAVE.regionDone[c.map]).length;
    case 'keys': return (SAVE.keys||[]).length;
    case 'mapch': return Object.values(SAVE.mapCh||{}).reduce((a,m)=>a+Object.keys(m).length, 0);
    case 'elite25': return s.elites||0;
    case 'mutated': return s.mutants||0;
    case 'bestiary': return (SAVE.seen||[]).length;
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
  G.towers.forEach(t=>{ W.remove(t.mesh); if(t.beams) t.beams.forEach(b=>W.remove(b)); if(t.link) W.remove(t.link); }); G.enemies.forEach(e=>{ W.freeEnemy(e.mesh); }); G.projs.forEach(p=>W.freeProj(p.kind,p.mesh));
  G.fires.forEach(f=>W.freeFire(f.mesh)); G.objs.forEach(o=>{ if(o.type==='secretgate') return; W.removeObject(o.mesh); if(o.kind==='sparkle') W.removeSpark(o.mesh); }); (G.falling||[]).forEach(f=>W.removeObject(f.mesh)); (G.dying||[]).forEach(d=>W.freeEnemy(d.mesh)); G.dying = [];
  G.links.forEach(l=>W.remove(l.mesh)); G.links = []; (G.runeMeshes||[]).forEach(m=>W.removeSpark(m)); G.runeMeshes = [];
  G.crates.forEach(c=>W.remove(c.mesh)); G.crates = []; G.tornados.forEach(o=>W.remove(o.mesh)); G.tornados = [];
  if(G.hero){ W.remove(G.hero.mesh); G.hero = null; }
  clearV6();
  (G.clouds||[]).forEach(c=>W.freeFire(c.mesh)); (G.rocks||[]).forEach(r=>W.removeObject(r.mesh)); G.clouds = []; G.rocks = [];
  G.map.collapseWarn = false;
  W.buildMap(G.map);
  G.towers = []; G.grid = new Map(); G.enemies = []; G.projs = []; G.queue = []; G.fires = []; G.objs = new Map(); G.falling = []; G.runes = new Set();
  W.fxReset(); W.hideRing(); W.hideGhost(); W.hideMarker(); numsClear();
  const lv = ulevel(), md = modeDef(mode), ru = ruleDef();
  G.waves = md.waves || G.map.waves;
  const goldBase = mode==='bossrush' ? md.gold : G.map.gold;
  G.mut = new Set(TD.MUTATOR_MODES.includes(mode) ? (SAVE.mutators||[]).filter(id=>TD.MUTATORS.some(m=>m.id===id)) : []);
  G.gold = ru && ru.gold ? ru.gold : Math.round(goldBase * (lv>=12 ? 1.1 : 1) * ((md.id==='hard' || md.id==='nightmare') ? md.gold : 1) * (1 + 0.05*rs('gold')) * (1 + 0.05*Math.min(TD.PRESTIGE_MAX, SAVE.prestige||0)));
  G.lives = ru && ru.lives ? ru.lives : G.map.lives + (lv>=17 ? 2 : 0) + 2*rs('lives'); if(mut('fragile') && G.lives > 1) G.lives = Math.ceil(G.lives/2); G.startLives = G.lives;
  G.wave = 0; G.endless = mode==='endless'; G.kills = 0; G.earned = 0; G.t = 0; G.livesLost = 0; G.builtTypes = new Set(); G.bossAlive = 0; G.boss = null;
  G.phase = 'build'; G.buildTimer = -1; G.sel = null; G.selObj = null; G.buildType = null; G.targetMode = null; G.over = false; G.won = false; G.speed = 1; G.paused = false;
  G.cd = { meteor:0, freeze:0, chain:0, overdrive:0, timewarp:0 }; G.storm = { active:false, timer: 38 }; G.lavaT = 0; G.slowmo = 0; G.overdrive = 0; G.surge = 0; G.surgeT = 18;
  G.night = false; G.nightTarget = 0; G.weather = 'clear'; G.fogTarget = 0; G.ev = null; G.evSurge = 0; G.waveEv = null; G.nextEv = null; G.perks = {}; G.perkPending = 0;
  G.synSeen = new Set(); G.routeRR = 0; G.log = []; G.booms = []; G.bonusCoins = 0;
  G.seasonMod = seasonMod(); ensureSeason();
  G.crystals = TD.CRYSTALS.start + ((SAVE.season && SAVE.season.tier >= 3) ? 1 : 0); G.streak = 0; G.streakLast = -9; G.killsC = 0; G.bonus = {}; G.tst = {};
  G.interludes = []; G.riskNext = false; G.waveRisk = false; G.timewarp = 0; G.timeStop = 0; G.mirror = false; G.secretOpen = false; G.secretNext = false; G.secretDone = false;
  G.echoes = []; G.loopT = 20; G.stormT = 4; G.ultToastT = 0; G.riskWaves = 0;
  if(G.seasonMod==='bloom') G.lives += 2, G.startLives = G.lives; G.bossDef = null; G.cmd = 0; G.iceAgeT = 20; G.lastStand = 0; G.heroMode = false; G.heroKills = 0; G.nightKills = 0;
  G.seed = (mode==='rogue' || (ru && ru.chaos)) ? 1 + Math.floor(Math.random()*1e6) : 0;
  G.mastery0 = {}; TD.TOWER_ORDER.forEach(k=>{ G.mastery0[k] = mastery(k); });
  // towers the player brought
  G.loadout = loadoutFor().filter(k=>towerUnlocked(k));
  if(!G.loadout.length) G.loadout = ['archer','cannon','frost'];
  G.allowed = null;
  if(ru && ru.pick){ G.allowed = G.loadout.slice(0, ru.pick); }
  if(ru && ru.rand){ const pool = G.loadout.filter(k=>k!=='bank'); const pick = []; while(pick.length < Math.min(ru.rand, pool.length)){ const k = pool[Math.floor(Math.random()*pool.length)]; if(!pick.includes(k)) pick.push(k); } G.allowed = pick; }
  if(ru && ru.allow){ G.loadout = ru.allow.filter(k=>towerUnlocked(k)); }
  if(ru && ru.chaos){ const pool = TD.TOWER_ORDER.filter(k=>towerUnlocked(k) && k!=='paradox' && !TOWERS[k].hybrid && !TOWERS[k].struct && !TOWERS[k].legendary), pick = [];
    while(pick.length < Math.min(6, pool.length)){ const k = pool[Math.floor(Math.random()*pool.length)]; if(!pick.includes(k)) pick.push(k); } G.loadout = pick.slice(); G.allowed = pick; }
  if(G.allowed) G.loadout = G.loadout.filter(k=>G.allowed.includes(k));
  if(G.map.effect==='reality' && !G.loadout.includes('paradox')) G.loadout = G.loadout.concat(['paradox']);
  G.map.routeDefs.forEach(r=>{ r.open = r.kind==='main' || r.kind==='fork' || r.kind==='twin'; }); W.refreshRoads(G.map);
  G.curRoutes = routesFor(1);
  W.setNight(0); G.nightK = 0; W.setFog(0);
  genObjects();
  for(const r of G.map.routeDefs){ if(r.kind==='secret' && r.gate){ const [x,z] = r.gate.split(',').map(Number); G.objs.set(r.gate, { type:'secretgate', cx:x, cz:z, x:x+0.5, z:z+0.5, route:r, mesh:r.gateMesh||{} }); } }
  if(ulevel() >= TD.HERO.unlock) spawnHero();
  // v6: base, energy, evolution, robot
  G.base = { walls:0, gate:0, guns: rs('guns') >= 2 ? 1 : 0, core:0 }; if(G.base.guns) W.castleUp(G.map.castle, 'guns', 1);
  G.adapt = { type:null, lvl:0 }; G.dmgWave = {}; G.dmgHist = []; G.survT = 0; G.survWave = false; G.combosRun = new Set(); G.choice = null; G.scouts = 0; G.moveT = null;
  G.coreT = 30; G.castleCool = 0; G.walls = []; G.warps = []; G.legendBuilt = false; G.threat = new Map(); G.smartToast = 0; G.adaptMax = 0;
  G.rankShown = 0; G.leakBy = {}; G.trails = []; G.selE = null; G.waveTotal = 0; G.waveDone = 0;
  // v8
  G.later = []; G.blaze = []; G.clouds = []; G.magnets = []; G.debT = 0; G.newExtra = 0; G.rockfall = 0; G.rocks = []; G.newQ = []; G.newT = 1; G.bossKillsWave = 0; G.bossRR = 0; G.timeUp = false; G.weakSeen = false; G.spreadN = 0; G.spreadWarn = [];
  G.clock = md.clock || 0; G.clockShown = -1; $('clockPill').style.display = G.clock ? '' : 'none'; W.warnClear(); G.lvTags = SAVE.lvTags !== false; $('app').classList.remove('finalForm');
  G.crystals += 2*rs('mine');
  if(ulevel() >= TD.ROBOT.unlock) spawnRobot();
  computePower();
  SAVE.games = (SAVE.games||0)+1; persist();
  $('app').classList.remove('menu'); $('menu').classList.add('hide'); $('result').classList.remove('show'); $('pauseWrap').classList.remove('show'); $('stormFx').classList.remove('show');
  $('perkWrap').classList.remove('show'); $('replayWrap').classList.remove('show'); $('shopWrap').classList.remove('show');
  $('bossBar').classList.remove('show'); setWeatherFx('clear'); $('nightFx').style.opacity = '0'; $('warpFx').classList.remove('show');
  G.started = true;
  if(typeof window.onGameplayStart==='function') window.onGameplayStart();
  $('buildBar').innerHTML = '';
  renderHud(); renderBuildBar(); renderPanel(); renderWaveBtn(); $('abilBar').innerHTML = ''; renderAbilities(); renderChips(); syncSpeed();
  toast(G.map.tip, 'tip');
  if(mode==='hard') setTimeout(()=>toast('💀 HARD MODE  ·  up to +60% enemy health', 'bad'), 900);
  if(mode==='rogue') setTimeout(()=>toast('🃏 ROGUELIKE  ·  pick a perk every 3 waves', 'good'), 900);
  if(mode==='bossrush') setTimeout(()=>toast('👑 BOSS RUSH  ·  10 bosses, one after another', 'bad'), 900);
  if(mode==='timeattack') setTimeout(()=>toast('⏱️ TIME ATTACK  ·  '+G.waves+' waves in '+Math.round(md.clock/60)+' minutes — send waves early!', 'bad'), 900);
  if(mode==='nightmare') setTimeout(()=>toast('😈 NIGHTMARE  ·  +80% health, elites from wave 11, a Mega Boss at wave 30', 'bad'), 900);
  if(G.mut.size) setTimeout(()=>toast('🎲 Mutators: '+[...G.mut].map(id=>{ const M = TD.MUTATORS.find(x=>x.id===id); return M.icon+' '+M.name; }).join(' · ')+'  ·  +'+Math.round(mutReward()*100)+'% rewards', 'bad'), 1300);
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
  if(TD.KEYSTONE_MAPS.includes(m.id) && !SAVE.keys.includes(m.id)){ const kr = ruins[1] || ruins[0]; if(kr) kr.secret = 'keystone'; }
  const sp = pick((x,z)=>!nearPath(x,z));
  if(sp){ const mesh = W.makeSparkle(); mesh.position.set(sp[0]+0.5, 0, sp[1]+0.5); const o = { type:'sparkle', kind:'sparkle', cx:sp[0], cz:sp[1], x:sp[0]+0.5, z:sp[1]+0.5, mesh, secret: rnd()<0.5 ? 'rune' : 'chest' }; G.objs.set(sp[0]+','+sp[1], o); }
}
const CLEAR_COST = { tree:25, ruin:60, boulder:30 };
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
    sfx('boom'); W.shake(0.12);
    if(o.type==='boulder'){ addCrystals(1); W.burst(o.x, 0.6, o.z, 0x7fe8ff, 30, 2.6, 0.8, 3, 2, 1.6); num(o.x, 1, o.z, '+1 💎', 'ice'); toast('🪨 Boulder smashed  ·  +1 💎 and the tile is free', 'good'); }
    else toast('🧱 Ruins demolished  ·  tile is free to build', 'good');
  }
  if(o.secret) setTimeout(()=>revealSecret(o), o.type==='tree' ? 650 : 200);
  chCheck(); renderPanel(); renderHud(); W.hideRing();
}
function revealSecret(o){
  const key = o.cx+','+o.cz;
  SAVE.stats.secrets = (SAVE.stats.secrets||0)+1; chCheck();
  W.flash(o.x, 0.6, o.z, 0xfff0a0, 3, 0.5); W.shock(o.x, o.z, 0xffe27a, 1.6, 0.6); sfx('level');
  if(o.secret==='keystone'){
    if(!SAVE.keys.includes(G.map.id)) SAVE.keys.push(G.map.id);
    W.burst(o.x, 0.5, o.z, 0x7affc8, 70, 3.8, 1.1, 3.5, 3, 2.2); W.shock(o.x, o.z, 0x7affc8, 2.4, 0.8); addCores(TD.CORES.keystone);
    const n = SAVE.keys.length, all = n >= TD.KEYSTONE_MAPS.length;
    showEvBanner({ icon:'🗝️', name:'ANCIENT KEYSTONE '+n+' / '+TD.KEYSTONE_MAPS.length, desc: all ? 'All three keys found — a hidden region has appeared on the world map!' : 'Two more lie hidden in ruins across the world… +'+TD.CORES.keystone+' 🔮' });
    chCheck(); persist(); renderHud(); return;
  }
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
function selectObj(o){ G.selE = null; G.sel = null; G.selObj = o; G.buildType = null; renderBuildBar(); renderPanel();
  if(o.type==='energy'||o.type==='ice') W.showRing(o.x, o.z, 1.5, true); else W.hideRing(); sfx('click');
  if(o.type==='sparkle'){ G.objs.delete(o.cx+','+o.cz); W.removeSpark(o.mesh); G.selObj = null; renderPanel(); revealSecret(o); } }

// ---- towers ----------------------------------------------------------
function makeMesh(t){
  const ml = mastery(TD.ultKey(t.type)), rar = ml >= 3 ? TD.rarityOf(ml).color : null;
  const m = W.makeTower(t.type, t.level, skinFor(t.type), t.branch, { rarity:rar, legendary: ml >= 9, aura: ml >= TD.MASTERY_REWARDS.aura });
  m.position.set(t.x, 0, t.z); if(t.level>=3 && ulevel()>=25 && !TOWERS[t.type].struct) W.legend(m, true);
  if(t.infused){ const sp = W.glowSprite(0x7fe8ff, 1.3, 0.45); sp.position.y = 0.25; m.add(sp); }
  if(t.vl > 1) W.towerStars(m, t.vl-1);
  return m;
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
  refreshStructs(); computePower();
}
// ---- v6: structures, energy, relocation, infusion ----
function refreshStructs(){
  G.walls = G.towers.filter(t=>t.type==='barricade'); G.warps = G.towers.filter(t=>t.type==='warp');
  G.towers.forEach(t=>{ t.oc = 0; });
  for(const g of G.towers){ if(g.type!=='generator' || !flag(g,'overcharge') || g.dis > 0) continue;
    for(const t of G.towers){ if(t===g || isStruct(t)) continue; if(Math.max(Math.abs(t.cx-g.cx), Math.abs(t.cz-g.cz)) <= 1) t.oc = Math.max(t.oc, flag(g,'overcharge')); } }
}
function computePower(){
  if(!G.map) return;
  let cap = TD.ENERGY.base + 3*rs('power') + 6*(G.base ? G.base.core : 0) + (G.waveEv==='estorm' ? 10 : 0), used = 0;
  for(const t of G.towers){ if(t.type==='generator'){ if(t.dis <= 0 && !(t.hijack > 0)) cap += Math.round(stat(t,'power')); } else used += TD.energyOf(t.type, t.level); }
  const was = G.powerK; G.eCap = cap; G.eUsed = used; G.powerK = used > cap ? Math.max(TD.ENERGY.floor, cap/used) : 1;
  if(G.powerK < 1 && was >= 1 && G.phase!=='menu' && G.t - (G.lowT||-99) > 8){ G.lowT = G.t; toast('⚡ LOW POWER — towers fire '+Math.round((1-G.powerK)*100)+'% slower. Build a 🔋 Generator!', 'bad'); sfx('nope'); }
  if(used >= 40 && G.powerK >= 1) chMark('power');
}
function roadFree(cx, cz){
  const key = cx+','+cz; if(!G.map || G.grid.has(key)) return false;
  const open = G.map.routeDefs.filter(r=>r.open);
  if(!open.some(r=>r.cells.has(key))) return false;
  for(const r of open) for(const end of [r.list[0], r.list[r.list.length-1]]){ const [x,z] = end.split(',').map(Number); if(Math.abs(x-cx)+Math.abs(z-cz) <= 1) return false; }
  return true;
}
function orientOnRoad(t){ const P = G.map.pathSet, h = P.has((t.cx-1)+','+t.cz) || P.has((t.cx+1)+','+t.cz), v = P.has(t.cx+','+(t.cz-1)) || P.has(t.cx+','+(t.cz+1)); t.mesh.rotation.y = (h && !v) ? Math.PI/2 : 0; }
function wallMax(t){ return Math.round(TOWERS.barricade.hp[Math.min(3,t.level)-1] * (1 + 0.08*G.wave) * (1 + 0.3*rs('masonry'))); }
function repairCost(t){ return Math.ceil((1 - t.hp/t.hpMax) * 45 * t.level); }
function repairWall(t){ if(G.phase!=='build'){ toast('🧱 Repairs happen between waves', 'bad'); sfx('nope'); return; } const c = repairCost(t); if(!c) return; if(G.gold < c){ toast('Not enough gold', 'bad'); sfx('nope'); return; }
  G.gold -= c; t.hp = t.hpMax; W.burst(t.x, 0.5, t.z, 0xffc857, 20, 2, 0.6, 2.6, 3, 1.6); sfx('build'); renderPanel(); renderHud(); }
function linkCrystal(t){
  const ck = t.type==='tesla' ? 'energy' : (t.type==='frost' ? 'ice' : null), cr = ck ? nearCrystal(t.cx, t.cz, ck) : null; if(!cr) return null;
  t.crystal = cr; t.link = W.makeLink(ck==='energy'?0xb07cff:0x7fe8ff); W.setBeam(t.link, new (window.THREE.Vector3)(cr.x, 0.72, cr.z), new (window.THREE.Vector3)(t.x, 0.9, t.z), 1); t.link.visible = true; return ck;
}
function relocateCost(){ return G.warps.length ? 0 : Math.round(TD.RELOCATE_COST*costMul()); }
function startMove(t){
  if(G.phase!=='build'){ toast('🌀 Towers can only be teleported between waves', 'bad'); sfx('nope'); return; }
  if(G.gold < relocateCost()){ toast('Teleporting costs '+relocateCost()+' gold', 'bad'); sfx('nope'); return; }
  G.moveT = t; G.buildType = null; G.targetMode = null; renderBuildBar(); W.portalFx(t.x, t.z, 0xb07cff); sfx('portal'); toast('🌀 Tap a free tile to teleport the '+TOWERS[t.type].name, 'tip');
}
function moveTower(t, cx, cz){
  if(!cellFree(cx,cz) || !G.towers.includes(t)){ sfx('nope'); return false; }
  const c = relocateCost(); if(G.gold < c){ sfx('nope'); return false; } G.gold -= c;
  const ox = t.cx, oz = t.cz;
  W.portalFx(t.x, t.z, 0xb07cff); W.burst(t.x, 0.6, t.z, 0xb07cff, 30, 3, 0.7, 3, 1, 2);
  G.grid.delete(t.cx+','+t.cz); t.cx = cx; t.cz = cz; t.x = cx+0.5; t.z = cz+0.5; t.mesh.position.set(t.x, 0, t.z); G.grid.set(cx+','+cz, t); t.rd = null; t.target = null;
  if(t.link){ W.remove(t.link); t.link = null; t.crystal = null; } linkCrystal(t);
  W.portalFx(t.x, t.z, 0xb07cff); t.mesh.scale.setScalar(0.3); t.pop = 0;
  G.moveT = null; G.log.push({ t:+G.t.toFixed(1), w:G.wave, a:'move', k:t.type, x:cx, z:cz, ox, oz, l:t.level, b:t.branch });
  recomputeSyn(); select(t); sfx('portal'); renderHud(); renderBuildBar(); return true;
}
function infuse(t){
  const d = TOWERS[t.type]; if(!t || t.infused || d.struct || d.legendary || d.proj==='none') return;
  if(G.crystals < TD.INFUSE_COST){ toast('Crystal Infusion needs '+TD.INFUSE_COST+' 💎', 'bad'); sfx('nope'); return; }
  G.crystals -= TD.INFUSE_COST; t.infused = true; SAVE.stats.crystalsSpent = (SAVE.stats.crystalsSpent||0) + TD.INFUSE_COST;
  const yaw = t.mesh.head.rotation.y; W.remove(t.mesh); t.mesh = makeMesh(t); t.mesh.head.rotation.y = yaw; W.add(t.mesh); t.mesh.scale.setScalar(0.8); t.pop = 0;
  W.burst(t.x, 1, t.z, 0x7fe8ff, 60, 3.5, 0.9, 3.5, 2, 2.2); W.shock(t.x, t.z, 0x7fe8ff, 1.8, 0.6); W.flash(t.x, 1, t.z, 0x7fe8ff, 3, 0.4); sfx('level');
  toast('💎 Crystal Infusion: '+d.name+' +25% damage, +10% range', 'good'); renderPanel(); renderHud();
}
// ---- the castle: walls, gate, cannon, power core ----
function baseCost(id){ const u = TD.BASE_UPGRADES.find(x=>x.id===id), l = G.base[id]; return l >= 3 ? 0 : Math.round(u.cost[l]*costMul()); }
function buyBase(id){
  if(G.phase!=='build'){ toast('🏰 The castle is built up between waves', 'bad'); sfx('nope'); return; }
  const l = G.base[id]; if(l >= 3){ sfx('nope'); return; } const c = baseCost(id);
  if(G.gold < c){ toast('Not enough gold', 'bad'); sfx('nope'); return; }
  G.gold -= c; G.base[id] = l+1;
  if(id==='walls'){ G.lives += 3; G.startLives += 3; }
  W.castleUp(G.map.castle, id, G.base[id]);
  const cp = G.map.castle.position; W.burst(cp.x, 1, cp.z, 0xffc857, 50, 3.4, 0.9, 3.5, 3, 2.2); W.shock(cp.x, cp.z, 0xffc857, 2, 0.6); W.flash(cp.x, 1.2, cp.z, 0xffe27a, 3, 0.4); W.shake(0.15);
  sfx('upgrade'); logAct('base', id, 0, 0); computePower(); renderPanel(); renderHud();
}
function selectCastle(){ G.selE = null; G.sel = null; G.selObj = { type:'castle' }; G.buildType = null; G.moveT = null; renderBuildBar(); renderPanel(); W.hideRing(); sfx('click'); }
function towerCount(type){ return G.towers.filter(t=>t.type===type).length; }
function build(type, cx, cz){
  const cost = towerCost(type, 1), D = TOWERS[type];
  if(!towerUnlocked(type)){ toast('🔒 '+D.name+' unlocks at player level '+D.unlock, 'bad'); sfx('nope'); return false; }
  if(D.legendary){
    if(!legendUnlocked(type)){ toast('🔒 Unlock the '+D.name+' in the Legendary Vault', 'bad'); sfx('nope'); return false; }
    if(G.legendBuilt){ toast('🌟 Only one legendary tower per match', 'bad'); sfx('nope'); return false; }
    if(G.crystals < D.cry){ toast(D.icon+' '+D.name+' needs '+D.cry+' 💎 crystals', 'bad'); sfx('nope'); return false; }
  }else if(D.struct){
    if(G.phase!=='build'){ toast('🏰 Structures are built between waves', 'bad'); sfx('nope'); return false; }
  }else if(banned(type) || !G.loadout.includes(type)){ toast('🚫 '+D.name+' is not in play this match', 'bad'); sfx('nope'); return false; }
  if(D.max && towerCount(type) >= D.max){ toast('Max '+D.max+' '+D.name+'s per match', 'bad'); sfx('nope'); return false; }
  const ru = ruleDef(); if(ru && ru.maxTowers && !D.struct && combatTowers().length >= ru.maxTowers){ toast('3️⃣ Trio: only '+ru.maxTowers+' towers at a time — sell one first', 'bad'); sfx('nope'); return false; }
  if(!D.legendary && G.gold < cost){ toast('Not enough gold', 'bad'); sfx('nope'); return false; }
  if(D.onPath ? !roadFree(cx,cz) : !cellFree(cx,cz)){ if(D.onPath) toast(D.icon+' '+D.name+' goes on an open road — not right next to the portal or the castle', 'bad'); sfx('nope'); return false; }
  if(D.legendary){ G.crystals -= D.cry; G.legendBuilt = true; chMark('legend1'); } else G.gold -= cost;
  const t = { type, level:1, branch:null, cx, cz, x:cx+0.5, z:cz+0.5, cool:0.3, target:null, kills:0, dmg:0, shots:0, ramp:1, acc:0, accT:0, dis:0, recoil:0, spent:cost, syn:new Set(), prio:TOWERS[type].prio||'first', charge:0, ultReady:false, hijack:0, xp:0, vl:1, perks:[], frenzyT:0 };
  tstat(type).built++;
  const ck = linkCrystal(t);
  if(ck) setTimeout(()=>toast((ck==='energy'?'⚡ Energized':'❄️ Ice-charged')+' by the crystal: +30% damage'+(ck==='energy'?', +1 chain':', faster freezing'), 'good'), 250);
  if(G.runes.has(cx+','+cz)) setTimeout(()=>toast('🔮 Built on an ancient rune: +25% damage, +0.3 range', 'good'), 250);
  t.mesh = makeMesh(t); t.mesh.scale.setScalar(0.01); t.pop = 0; W.add(t.mesh);
  if(type==='barricade'){ t.hpMax = wallMax(t); t.hp = t.hpMax; orientOnRoad(t); }
  if(D.legendary){ showEvBanner({ icon:D.icon, name:'LEGENDARY: '+D.name.toUpperCase(), desc:D.trait }); W.shake(0.3); W.punch(0.5); W.burst(t.x, 1.2, t.z, 0xffc857, 90, 4.5, 1.2, 4, 2, 2.4); }
  dEv('build', 1); logAct('build', type, cx, cz, t);
  if(TOWERS[type].proj==='beam'){ t.beams = [W.makeBeam(TOWERS[type].accent)]; }
  G.towers.push(t); G.grid.set(cx+','+cz, t);
  G.builtTypes.add(type); if(BASIC.every(k=>G.builtTypes.has(k))) chMark('alltypes');
  W.burst(t.x, 0.3, t.z, 0xd8c9a0, 18, 2.2, 0.6, 3.5, 6, 2.0); W.shock(t.x, t.z, TOWERS[type].accent, 0.9, 0.4); W.debris(t.x, 0.2, t.z, 0x9a8a6a, 6, 1.6);
  recomputeSyn();
  if(D.energy && G.powerK < 1 && !D.struct) setTimeout(()=>{ if(G.powerK < 1) toast('⚡ Energy '+G.eUsed+' / '+G.eCap+' — build a 🔋 Generator or upgrade the castle core', 'bad'); }, 400);
  sfx('build'); select(t); renderHud(); renderBuildBar();
  return true;
}
function upgrade(t, branch){
  if(!t || t.level>=4 || TOWERS[t.type].legendary) return;
  if(TOWERS[t.type].struct && G.phase!=='build'){ toast('🏰 Structures are upgraded between waves', 'bad'); sfx('nope'); return; }
  { const ru = ruleDef(); if(ru && ru.noUpgrade && !TOWERS[t.type].struct){ toast('⛔ No Upgrades — towers stay at level 1 (crystal infusions still work)', 'bad'); sfx('nope'); return; } }
  if(t.level===3){
    const d = TOWERS[t.type]; if(!d.ult) return;
    if(mastery(t.type) < TD.ULT_MASTERY){ toast('🔒 Reach mastery '+TD.ULT_MASTERY+' with the '+d.name+' to unlock its Ultimate', 'bad'); sfx('nope'); return; }
    branch = t.branch;
  }
  const cost = towerCost(t.type, t.level+1, branch);
  if(G.gold < cost){ toast('Not enough gold', 'bad'); sfx('nope'); return; }
  if(t.level===2 && branch==null && (TOWERS[t.type].branches||[]).length){ return; }   // level 3 needs a branch choice
  G.gold -= cost; t.spent += cost; t.level++; if(t.level===3){ t.branch = branch; dEv('spec', 1); }
  if(t.level===4){ chMark('ultimate'); toast('🌟 ULTIMATE: '+ultOf(t).icon+' '+ultOf(t).name+' — '+ultOf(t).desc, 'good'); }
  logAct('up', t.type, t.cx, t.cz, t);
  const yaw = t.mesh.head.rotation.y;
  W.remove(t.mesh); t.mesh = makeMesh(t); t.mesh.head.rotation.y = yaw; W.add(t.mesh);
  if(t.beams){ const want = flag(t,'beams')||1; while(t.beams.length < want) t.beams.push(W.makeBeam(TOWERS[t.type].accent)); }
  if(t.type==='barricade'){ t.hpMax = wallMax(t); t.hp = t.hpMax; orientOnRoad(t); }
  if(isStruct(t)) recomputeSyn(); else computePower();
  t.mesh.scale.setScalar(0.7); t.pop = 0;
  W.burst(t.x, 0.6, t.z, TOWERS[t.type].accent, 26, 2.6, 0.7, 3.5, 4, 2.2); W.shock(t.x, t.z, TOWERS[t.type].accent, 1.3, 0.5); W.flash(t.x, 0.9, t.z, TOWERS[t.type].accent, 2.4, 0.35);
  if(t.level>=3){ W.burst(t.x, 1.0, t.z, 0xffe27a, 40, 3.2, 0.9, 3.5, 3, 2.4); W.shock(t.x, t.z, 0xffe27a, 2.0, 0.7); }
  if(t.level===4){ W.burst(t.x, 1.4, t.z, 0xffffff, 60, 4, 1, 4, 2, 2.6); W.shock(t.x, t.z, 0xffffff, 3, 0.8); W.flash(t.x, 1.2, t.z, 0xffe27a, 4, 0.5); W.shake(0.2); W.punch(0.3); sfx('level'); }
  sfx('upgrade'); renderHud(); renderPanel(); renderBuildBar();
}
function sell(t){
  if(!t) return;
  const v = Math.round(t.spent*sellRate());
  if(TOWERS[t.type].legendary){ const back = Math.floor(TOWERS[t.type].cry/2); addCrystals(back); G.legendBuilt = false; toast('🌟 Legendary dismantled: +'+back+' 💎', 'tip'); }
  if(G.moveT===t) G.moveT = null;
  if(t.level>=3) chMark('sell3');
  logAct('sell', t.type, t.cx, t.cz, t);
  G.gold += v; W.remove(t.mesh); if(t.beams) t.beams.forEach(b=>W.remove(b)); if(t.link) W.remove(t.link); G.grid.delete(t.cx+','+t.cz); G.towers.splice(G.towers.indexOf(t),1);
  W.burst(t.x, 0.4, t.z, 0xffd54a, 16, 2.0, 0.6, 3, 5, 1.8);
  recomputeSyn();
  sfx('sell'); toast('+'+v+' gold', 'good'); deselect(); renderHud(); renderBuildBar();
}
function select(t){ G.selE = null; G.sel = t; G.selObj = null; G.buildType = null; G.targetMode = null; W.hideMarker(); renderPanel(); renderBuildBar(); renderAbilities(); W.showRing(t.x, t.z, stat(t,'range'), true); W.hideGhost(); }
function deselect(){ G.sel = null; G.selObj = null; if(G.selE){ G.selE = null; W.hideMarker(); } renderPanel(); W.hideRing(); }
function setBuildType(type){
  if(G.buildType===type) type = null;
  if(type && !towerUnlocked(type)){ toast('🔒 '+TOWERS[type].name+' unlocks at player level '+TOWERS[type].unlock, 'bad'); sfx('nope'); return; }
  if(type && banned(type)){ toast('🚫 '+TOWERS[type].name+' is banned in this challenge', 'bad'); sfx('nope'); return; }
  if(type && TOWERS[type].struct && G.phase!=='build'){ toast('🏰 Structures are built between waves — wait for the wave to end', 'bad'); sfx('nope'); return; }
  if(type && TOWERS[type].legendary){ const d = TOWERS[type]; if(G.legendBuilt){ toast('🌟 Only one legendary tower per match', 'bad'); sfx('nope'); return; } if(G.crystals < d.cry){ toast(d.icon+' '+d.name+' needs '+d.cry+' 💎 — you have '+G.crystals, 'bad'); sfx('nope'); return; } }
  G.moveT = null;
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
// weather with the season's twist (deterministic so the wave preview matches)
function weatherFor(n){
  let w = TD.rollWeather(G.map.theme, n, G.seed);
  const h = ((n*2654435761 + (G.seed||0)*97) >>> 0) % 1000 / 1000;
  if(w==='clear' && n > 2 && h < 0.3){ if(G.seasonMod==='frost') w = 'snow'; else if(G.seasonMod==='storm') w = 'storm'; }
  return w;
}
function makeSecret(e){
  e.secret = true; e.bname = TD.SECRET_BOSSES[G.map.id] || 'The Ancient One';
  e.hp = e.maxHp = Math.round(e.maxHp*2.5); e.scale = 1.6; e.gold *= 3; e.lives = 10;
  e.mesh.baseColor.setHex(0x2a3a34); W.secretLook(e.mesh); e.takeT = 6;
  G.boss = e; showBossBar(e); W.portalFx(e.pos.x, e.pos.z, 0x7affc8); W.shake(0.6); sfx('bossin');
  toast('🗿 '+e.bname+' has awoken!', 'bad');
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
    if(r.kind==='collapse' && !r.open && G.wave >= r.from){ collapseRoad(r); continue; }
    if(r.kind==='choice' && !r.open && !r.sealed && G.wave >= r.from){ const grp = G.map.routeDefs.filter(x=>x.kind==='choice' && x.group===r.group); if(!grp.some(x=>x.open)) chooseRoute(grp[0], true); continue; }
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
  const w = weatherFor(G.wave);
  if(w !== G.weather){ G.weather = w; setWeatherFx(w); if(w !== 'clear') setTimeout(()=>toast(TD.WEATHER[w].icon+' '+TD.WEATHER[w].name+': '+TD.WEATHER[w].desc, 'tip'), 700); }
  G.waveEv = G.nextEv; G.nextEv = null;
  if(G.waveEv==='eclipse'){ G.nightTarget = 1; toast('🌑 ECLIPSE — darkness falls, kills pay +50% gold', 'bad'); }
  // boss rush: each wave brings a different map's boss
  if(G.mode==='bossrush'){ const m = TD.MAPS[(G.wave-1) % TD.MAPS.length]; G.bossDef = { boss:m.boss, bossSkill:m.bossSkill, bossTint:m.bossTint, map:m.id }; }
  const groups = wavePlan(G.wave);
  let at = 0.6; G.queue = [];
  G.survWave = groups.some(g=>g.surv); G.survT = G.survWave ? TD.survivalTime(G.wave) : 0;
  groups.forEach(gr=>{ for(let i=0;i<gr.count;i++){ G.queue.push({ type:gr.type, at, armorT:gr.armorT }); at += gr.gap; } at += gr.pause; });
  // v8: nightmare / mutator bosses and the Mega Boss
  if(G.mode!=='bossrush'){
    if(G.mode==='nightmare' && G.wave % 10 === 0 && G.wave !== 30){ G.queue.push({ type:'boss', at: at + 2 }); at += 3; }
    if(mut('bosses') && G.wave % 10 === 5){ G.queue.push({ type:'boss', at: at + 1 }); at += 2; }
    const mega = (G.mode==='nightmare' && G.wave===30) || (G.wave >= TD.MEGA.from && (G.wave - TD.MEGA.from) % TD.MEGA.every === 0);
    if(mega){ G.queue.push({ type:'megaboss', at: at + 2 }); at += 4; setTimeout(()=>{ if(G.phase==='wave') showEvBanner({ icon:'🗻', name:'MEGA BOSS: '+TD.MEGA.name.toUpperCase(), desc:'A titan with four traits: '+TD.MEGA.traits.map(k=>TD.BOSS_TRAITS[k].icon+' '+TD.BOSS_TRAITS[k].name).join(' · ') }); }, 2600); }
  }
  G.bossKillsWave = 0; spreadBreak(); rockfallDrop();
  if(G.waveEv==='eclipse'){ for(let i=0;i<4;i++) G.queue.push({ type:'stalker', at: 2 + i*1.2 }); G.queue.sort((a,b)=>a.at-b.at); }
  computeThreat(); G.gateLeft = G.base.gate; computePower(); rankBanner();
  G.waveTotal = G.queue.length; G.waveDone = 0;
  if(G.secretNext){ G.secretNext = false; G.queue.push({ type:'boss', at: at + 1, secret:true }); at += 2; }
  G.waveDur = at + 8;
  // risk & reward, mirror waves
  G.waveRisk = G.riskNext;
  G.mirror = TD.isMirror(G.wave) && G.mode!=='bossrush' && !G.survWave;
  if(G.mirror){ const c = G.map.castle.position; W.portalFx(c.x, c.z, 0xff3cf0); setTimeout(()=>showEvBanner({ icon:'🪞', name:'MIRROR WAVE', desc:'The enemy marches from the castle side towards the portal!' }), 200); }
  G.spawnT = 0; G.phase = 'wave';
  G.swarmWave = groups.some(g=>g.swarm); G.livesAtWave = G.livesLost;
  sfx('horn');
  toast('Wave '+G.wave+(bonus?'  ·  +'+bonus+' early bonus':''), bonus?'good':'');
  if(G.swarmWave) setTimeout(()=>{ showEvBanner({ icon:'🐜', name:'SWARM WAVE', desc:'Hundreds of tiny enemies — splash damage shines!' }); }, 300);
  if(G.survWave) setTimeout(()=>{ showEvBanner({ icon:'💀', name:'SURVIVAL WAVE', desc:'An endless horde of weak enemies — hold out for '+TD.survivalTime(G.wave)+' seconds!' }); sfx('bossin'); }, 300);
  if(G.adapt.lvl > 0 && G.mode!=='bossrush'){ const I = TD.DTYPE_INFO[G.adapt.type]; setTimeout(()=>toast('🧬 Adapted enemies resist '+I.icon+' '+I.name+' damage by '+Math.round(adaptK()*100)+'%', 'bad'), 900); }
  if(groups.some(g=>g.type==='boss'||g.type==='airboss')) setTimeout(()=>{ if(G.phase==='wave') bossBanner(); }, 400);
  (G.map.gates || [G.map.gate]).forEach((gt,i)=>{ if(gt){ W.portalFx(gt.position.x, gt.position.z, i ? 0xff7a3c : 0xb07cff); } });
  renderHud(); renderWaveBtn(); renderChips(); renderAbilities();
}
function spawn(type, at, seg, route, opt){
  opt = opt || {};
  const diff = G.mode==='bossrush' ? 1.15 : mapDiff(G.map), md = modeDef(), ru = ruleDef();
  // hard mode eases in: its extra health ramps up over the first ten waves
  const hardHp = md.hp ? 1 + (md.hp-1)*Math.min(1, G.wave/10) : 1;
  const d = ENEMIES[type], big = isBigType(type);
  let mul = ((d.mini||big) ? TD.bossMul(G.mode==='bossrush' ? G.wave*3 : G.wave, diff) * (G.mode==='bossrush' ? 1.7 : 1) : TD.hpMul(G.mode==='bossrush' ? G.wave*2 : G.wave, diff)) * hardHp * ((ru&&ru.hp)||1);
  if(G.waveEv==='moon') mul *= 1.25;
  if(G.survWave && !big && !d.mini) mul *= 0.5;
  if(d.mini) mul *= Math.min(1, 0.55 + G.wave*0.03);
  if(mut('tough')) mul *= 1.5;
  if(type==='boss' && G.map.effect==='twin' && G.mode!=='bossrush') mul *= 0.62;
  let r = route, smart = false;
  if(!r){ if(d.air && !d.roadFlyer) r = G.mirror ? (G.map.airRev || (G.map.airRev = G.map.airRoute.slice().reverse())) : G.map.airRoute;
    else { const rs2 = G.curRoutes.length ? G.curRoutes : [G.map.routeDefs[0]]; let def = (big ? (G.map.effect==='twin' ? rs2[(G.bossRR++) % rs2.length] : rs2[0]) : rs2[(G.routeRR++) % rs2.length]);
      // smart enemies take the road you defend the least
      if(rs2.length > 1 && !big && (d.smart || G.scouts > 0 || (G.wave >= 15 && Math.random() < 0.2))){ const best = smartRoute(rs2); if(best){ smart = best !== def; def = best; } }
      r = G.mirror ? (def.rev || (def.rev = def.route.slice().reverse())) : def.route; } }
  let speed = d.speed * (md.speed||1) * ((ru&&ru.speed)||1) * (G.waveRisk ? TD.RISK.speed : 1) * (mut('fast') ? 1.3 : 1);
  if(G.map.effect==='ice') speed *= 1.12;
  if(G.map.effect==='lowgrav') speed *= d.air ? 1.3 : 0.85;
  if(G.map.effect==='surge') speed *= 1.06;
  if(G.map.tiered) speed *= TD.tierSpeed(G.map.curTier);
  const e = { type, d, hp: Math.round(d.hp*mul), maxHp: Math.round(d.hp*mul), speed, armor:d.armor, gold: Math.round(d.gold*TD.goldMul(G.wave)*(G.mode==='bossrush' ? 0.95 : 1)*(G.survWave ? 0.5 : 1)),
    air:!!d.air, ghost:!!d.ghost, mesh:W.makeEnemy(type, (type==='boss' && !opt.clone) ? bossInfo().bossTint : null), route:r, seg:seg||0, dist:0, slow:0, slowT:0, frozen:0, stun:0, burn:0, burnDps:0, healT:0,
    dead:false, flash:0, pos: (at ? at.clone() : r[0].clone()), lives:d.lives, shield: d.shield ? Math.round(d.shield*mul) : 0, shieldMax: d.shield ? Math.round(d.shield*mul) : 0,
    phase:0, bshield:0, bshieldT:0, enraged:false, hits:0, chill:0, freezeImm:0, cloakT: 1.5+Math.random()*2, invis:false, invisT:0, guarded:false, hasted:false,
    sab: d.sabotage ? { state:'road', wait:1.2 } : null, skillT:5, skillN:0, grow:0, born:G.t,
    ab: { cloak:!!d.cloak, heal:d.heal||0, aura:d.aura||null, auraR:d.auraR||0, dome:!!d.dome, blink:d.blink||0, dodge:d.dodge||0 },
    abT: 2+Math.random()*2, domeHp:0, poison:null, marked:0, winded:0, kbImm:0, brittle:false, mutStage:0, mutT:0, takeT:TD.TAKEOVER.every,
    big, smart, infT: 1+Math.random(), sT: 3+Math.random()*2, charged:0, grounded:0, gCool:0, eshield:0, eshieldMax:0 };
  e.pos.y = e.mesh.baseY; e.mesh.position.copy(e.pos); e.mesh.scale.setScalar(0.01); W.add(e.mesh);
  e.scale = type==='boss' ? 1.25 : (type==='megaboss' ? 1.55 : 1);
  // v7: enemy level (smooth growth) and army rank (new abilities every 10 waves)
  e.level = TD.enemyLevel(G.wave, G.mode, G.map.tiered ? G.map.curTier : 0) + (md.rankShift||0);
  if(!big && !d.mini){ e.speed *= Math.min(TD.LEVEL.speedCap, 1 + TD.LEVEL.speed*(e.level-1)); e.armor += Math.floor((e.level-1)/TD.LEVEL.armorEvery); }
  const rk = G.mode==='bossrush' ? 0 : TD.rankIdx(rankWave()); e.rank = rk;
  let vetArmor = null;
  if(!big && !d.mini && !opt.plain && !G.survWave && !TD.NO_RANK.includes(type)){
    if(rk >= 1 && TD.VETERAN[type]){ const V = TD.VETERAN[type]; e.vet = V; e.hp = e.maxHp = Math.round(e.maxHp*(V.hp||1)); e.speed *= V.speed||1; if(!opt.armorT) e.armor += V.armor||0; vetArmor = V.armorT||null; if(V.dash) e.dashT = 2 + Math.random()*2; }
    const eliteMut = mut('elites') && G.wave >= 6, rw = rankWave();
    let el = (rk >= 2 || eliteMut) && Math.random() < (eliteMut ? Math.min(0.5, 2*TD.ELITE.chance(Math.max(21, rw))) : TD.ELITE.chance(rw)), mu = rk >= 3 && Math.random() < TD.MUTATED.chance(rw);
    if(opt.elite) el = true; if(opt.mutated) mu = true; if(opt.escort) e.escort = true;
    if(el && mu && rk < 4 && !opt.elite) el = false;
    if(el) makeElite(e); if(mu) makeMutated(e);
  }
  if(G.lvTags !== false) W.levelBadge(e.mesh, 'Lv '+e.level, badgeColor(e));
  if(e.vet && !e.elite && !e.mutated) W.vetLook(e.mesh, d.size);
  if(e.vet && e.vet.plateLook && !vetArmor) W.armorLook(e.mesh, 'plate', d.size);
  // armor types, evolution and wind shields
  let aT = (e.rageOnBreak && !opt.armorT) ? 'eshield' : (opt.armorT || d.armorT || vetArmor);
  if(!aT && e.affix==='warded') aT = 'eshield';
  // adaptation sends counter-armor against the damage you rely on
  if(!aT && !big && !d.mini && !opt.plain && G.adapt.lvl >= 2 && G.mode!=='bossrush' && TD.ADAPT_COUNTER[G.adapt.type] && Math.random() < 0.12*G.adapt.lvl){ aT = TD.ADAPT_COUNTER[G.adapt.type]; e.counter = true; }
  if(aT && TD.ARMOR_TYPES[aT]){ e.armorT = aT; W.armorLook(e.mesh, aT, d.size); if(aT==='eshield'){ e.eshield = e.eshieldMax = Math.round(e.maxHp*0.6); e.mesh.eFill.visible = true; } }
  if(G.adapt.lvl > 0 && G.mode!=='bossrush'){ e.resist = { type:G.adapt.type, k:adaptK() }; W.evolved(e.mesh, parseInt(TD.DTYPE_INFO[G.adapt.type].color.slice(1), 16)); }
  if(d.windShield) e.gShield = true;
  if(smart && G.smartToast !== G.wave){ G.smartToast = G.wave; toast('🧠 Smart enemies are dodging your strongest road!', 'bad'); renderChips(); }
  if(type==='megaboss'){ e.bname = TD.MEGA.name; }
  if(type==='boss' && G.map.effect==='twin' && G.mode!=='bossrush' && !opt.clone){ e.bname = G.bossRR % 2 ? 'The Elder King' : 'The Younger King'; }
  if(type==='boss' || type==='megaboss'){ G.bossAlive++; if(!opt.clone){ G.boss = e; W.shake(type==='megaboss' ? 0.8 : 0.35); W.portalFx(e.pos.x, e.pos.z, type==='megaboss' ? 0xff3c1a : (bossInfo().bossTint||0xff3c3c)); showBossBar(e); } }
  if(type==='airboss'){ e.bname = G.map.airBoss || 'Sky Leviathan'; G.bossAlive++; G.boss = e; W.shake(0.45); W.portalFx(e.pos.x, e.pos.z, 0x9ffcff); showBossBar(e); }
  if(d.mini){ G.bossAlive++; miniIntro(e); }
  if(type==='commander'){ toast('👑 A Commander leads the attack — every enemy is faster and tougher while it lives!', 'bad'); sfx('phase'); }
  // v8: new enemy abilities, boss traits, bestiary
  if(d.dashes) e.dashT = 1.5 + Math.random()*2;
  if(d.burrow) e.burT = 2 + Math.random()*1.5;
  if(d.regen) e.regen = Math.max(e.regen||0, d.regen);
  if(d.summon){ e.sumT = 2.5; e.sumN = 0; }
  if(d.fireTrail || d.miasma) e.dropT = 0.4;
  if(big && !opt.clone) initBoss(e);
  seeEnemy(type);
  G.enemies.push(e);
  return e;
}
// ---- v7: veteran, elite and mutated enemies ----
function makeElite(e){
  const E = TD.ELITE; e.elite = true; e.hp = e.maxHp = Math.round(e.maxHp*E.hp); e.speed *= E.speed; e.gold = Math.round(e.gold*E.gold); e.armor += E.armor; e.lives += E.lives; e.scale *= 1.12;
  if(e.type==='knight'){ e.rageOnBreak = true; }
  if(e.type==='healer'){ e.ab.heal *= 2; e.healN = 2; }
  if(e.type==='guardian' || e.type==='drummer'){ e.ab.auraR *= 1.5; }
  W.eliteLook(e.mesh, e.d.size);
  // v8: every elite rolls one extra affix
  // fast enemies and boss escorts never roll the movement affixes
  const pool = (e.d.speed >= 1.5 || e.escort) ? TD.ELITE_AFFIXES.filter(a=>a.id!=='swift' && a.id!=='blink') : TD.ELITE_AFFIXES;
  const A = pool[Math.floor(Math.random()*pool.length)]; e.affix = A.id;
  if(A.id==='regen') e.regen = Math.max(e.regen||0, 0.03);
  else if(A.id==='swift' && e.dashT==null){ e.dashT = 2 + Math.random()*2; e.dashMul = 1.7; }
  else if(A.id==='blink' && !e.air) e.ab.blink = Math.max(e.ab.blink||0, 0.7);
}
function makeMutated(e){
  const M = TD.MUTATED, c = M.types[e.type] || M.other; e.mutated = true; e.mutConf = c;
  e.hp = e.maxHp = Math.round(e.maxHp*c.hp); e.gold = Math.round(e.gold*M.gold); e.lives += M.lives; e.scale *= 1.2;
  e.splitN = c.split||0; e.sprint = c.sprint||0; if(c.multiheal) e.healN = c.multiheal;
  e.mesh.baseColor.lerp(new (window.THREE.Color)(0x7ad84a), 0.4); W.mutantLook(e.mesh, e.d.size);
}
function badgeColor(e){ if(e.big) return '#7a1030'; if(e.d.mini) return '#8a2a5a'; if(e.elite && e.mutated) return TD.RANKS[4].badge; if(e.mutated) return TD.RANKS[3].badge; if(e.elite) return TD.RANKS[2].badge; if(e.vet) return TD.RANKS[1].badge; return TD.RANKS[0].badge; }
function enemyName(e){ const n = e.bname || e.d.name; if(e.elite && e.mutated) return 'Apex '+n; if(e.elite) return 'Elite '+n; if(e.mutated) return 'Mutated '+n; if(e.vet) return e.vet.tag+' '+n; return n; }
function enemyPowers(e){
  const out = [];
  if(e.d.note) out.push(e.d.note);
  if(e.vet && e.vet.note) out.push('⚔️ '+e.vet.note);
  if(e.elite) out.push('⭐ '+(TD.ELITE.powers[e.type] || TD.ELITE.powers.default));
  if(e.mutated) out.push('☣️ '+e.mutConf.note);
  if(e.armorT) out.push(TD.ARMOR_TYPES[e.armorT].icon+' '+TD.ARMOR_TYPES[e.armorT].desc);
  if(e.resist) out.push('🧬 Adapted: resists '+TD.DTYPE_INFO[e.resist.type].icon+' '+TD.DTYPE_INFO[e.resist.type].name+' by '+Math.round(e.resist.k*100)+'%');
  if(e.infected) out.push('🧟 Infected: +50% health, immune to poison');
  if(e.affix){ const A = TD.ELITE_AFFIXES.find(x=>x.id===e.affix); out.push(A.icon+' '+A.name+': '+A.desc); }
  if(e.counter) out.push('🧬 Counter-armor: bred to resist your favourite towers');
  if(e.traits && e.traits.length) e.traits.forEach(k=>{ const B = TD.BOSS_TRAITS[k]; out.push(B.icon+' '+B.name+': '+B.desc); });
  if(e.big && !e.isClone) out.push('🎯 Weak point: every '+TD.BOSS_UNIVERSAL.weakEvery+'s it is exposed for '+TD.BOSS_UNIVERSAL.weakT+'s — +'+Math.round((TD.BOSS_UNIVERSAL.weakMul-1)*100)+'% damage.');
  if(e.spirit != null) out.push('👻 Spirit: fades away in '+Math.max(0, e.spirit).toFixed(1)+'s');
  return out;
}
function rankBanner(){
  if(G.mode==='bossrush') return; const rk = TD.rankIdx(rankWave()); if(rk <= (G.rankShown||0)) return; G.rankShown = rk; const R = TD.RANKS[rk];
  setTimeout(()=>{ showEvBanner({ icon:R.icon, name:'RANK '+R.roman+': '+R.name.toUpperCase(), desc:'The enemy army evolves — '+R.desc }); sfx('bossin'); W.shake(0.2); }, 500);
  if(rk >= 4) chMark('rank5');
}
function miniIntro(e){
  showEvBanner({ icon:'👹', name:'MINI-BOSS: '+e.d.name.toUpperCase(), desc:(e.d.note||'').replace(/^(Flying )?[Mm]ini-boss\.\s*/, '') });
  sfx('phase'); W.portalFx(e.pos.x, e.pos.z, e.d.color); W.shake(0.2);
}
// how strongly each road is defended: tower damage × road tiles in reach
function computeThreat(){
  G.threat = new Map();
  const ts = G.towers.filter(t=>!isStruct(t) && TOWERS[t.type].proj!=='none');
  for(const r of G.map.routeDefs){ if(!r.open) continue; let th = 0;
    for(const t of ts){ const R = stat(t,'range')||0, dps = (stat(t,'dmg')||0) * (TOWERS[t.type].proj==='beam' ? 1 : (stat(t,'rate')||1)); let n = 0;
      for(const c of r.list){ const [x,z] = c.split(',').map(Number); if(Math.hypot(x+0.5-t.x, z+0.5-t.z) <= R) n++; }
      th += dps*n; }
    G.threat.set(r, th/Math.max(1, r.list.length)); }
}
function smartRoute(list){ let best = null, bv = Infinity; for(const r of list){ const v = G.threat.get(r); if(v==null) continue; if(v < bv){ bv = v; best = r; } } return best; }
function adaptK(){ return TD.ADAPT.step*G.adapt.lvl*(1 - 0.15*rs('breaker')); }
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
  else if(ev.id==='meteorpath') meteorEvent();
  else if(ev.id==='merchant'){ if(G.phase==='build') openShop(); else G.interludes.push('shop'); }
  else if(ev.id==='rockfall'){ G.rockfall = 3; }
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
  const bonus = TD.waveBonus(G.wave) * (G.waveRisk ? TD.RISK.gold : 1); G.gold += bonus; G.earned += bonus;
  const perfect = G.livesLost===G.livesAtWave;
  toast('Wave '+G.wave+' cleared  ·  +'+bonus+' gold'+(perfect?'  ·  perfect! +1 💎':''), 'good');
  addCrystals(TD.CRYSTALS.wave + (perfect ? TD.CRYSTALS.perfect : 0) + (G.seasonMod==='neon' && G.night ? 1 : 0) + (G.choice && G.choice.perk==='crystal' ? 1 : 0) + (G.map.effect==='caverns' ? 1 : 0) + (G.survWave ? 1 : 0));
  if(G.survWave && perfect) chMark('survive');
  if(G.adapt.lvl >= 3 && G.mode!=='bossrush') chMark('adapt');
  for(const w of G.walls){ if(w.hitThisWave && w.hp > 0) chMark('wall'); w.hitThisWave = false; const k = w.hp/w.hpMax; w.hpMax = wallMax(w); w.hp = Math.round(w.hpMax*k); }
  evolve(); G.survWave = false; G.survT = 0;
  spreadWarnNext(); bouldersAge();
  if(G.newExtra){ const n = G.newExtra; G.newExtra = 0; setTimeout(()=>toast('📖 '+n+' more new enemy type'+(n>1?'s':'')+' added to your Bestiary', 'tip'), 2200); }
  sEv('wave1', 1); if(G.endless) sEv('endless', G.wave);
  if(G.waveRisk){ SAVE.stats.riskWaves = (SAVE.stats.riskWaves||0)+1; sEv('risk', 1); chCheck(); }
  if(G.mirror && perfect) chMark('mirror');
  G.mirror = false;
  // banks (and the Royal Mint) pay out
  for(const t of G.towers){ if(!TOWERS[t.type].income) continue;
    if(t.type==='bank') chargeUlt(t, 1);
    let inc = Math.round(stat(t,'income')); const b = branchOf(t), u = ultOf(t);
    if(b && b.mod.interest){ const rate = b.mod.interest*(u && u.mod.interest ? u.mod.interest : 1), cap = b.mod.cap*(u && u.mod.cap ? u.mod.cap : 1); inc += Math.min(Math.round(cap), Math.round(G.gold*rate)); }
    G.gold += inc; G.earned += inc; t.dmg += inc; num(t.x, 1.4, t.z, '+'+inc+' 💰', 'gold'); W.burst(t.x, 1.1, t.z, 0xffd54a, 14, 1.8, 0.6, 2.4, 4, 1.8);
    if(t.type==='bank') SAVE.mastery.bank = (SAVE.mastery.bank||0) + Math.round(inc/5); sfx('coin'); }
  if(perk('interest')){ const i = Math.min(150, Math.round(G.gold*0.05*perk('interest'))); G.gold += i; G.earned += i; if(i) toast('🏦 Interest +'+i+' gold', 'good'); }
  if(G.swarmWave && G.livesLost===G.livesAtWave) chMark('swarm');
  G.waveEv = null; G.ev = G.evSurge > 0 ? 'surge' : null;
  if(G.wave >= 6 && combatTowers().length && combatTowers().every(t=>t.type==='archer')) chMark('archers');
  if(G.gold >= 1000) chMark('rich');
  if(G.wave >= 40) chMark('wave40');
  dEv('wave', G.wave); dEv('gold', G.earned);
  if(G.wave===10 && G.livesLost<=2) dEv('safe10', 1);
  if(G.wave >= G.waves && !G.endless){ finish(true); return; }
  G.phase = 'build'; G.buildTimer = G.mode==='bossrush' ? 15 : TD.BUILD_TIME;
  // stay flawless through wave 15 and a secret boss wakes up
  if(G.wave===TD.SECRET_BOSS_WAVE && G.livesLost===0 && !G.secretDone && ['normal','hard','endless','rogue'].includes(G.mode)){
    G.secretNext = true; setTimeout(()=>showEvBanner({ icon:'🗿', name:'A SECRET BOSS AWAKENS', desc:'No life lost for 15 waves… '+(TD.SECRET_BOSSES[G.map.id]||'Something ancient')+' joins the next wave!' }), 600); sfx('bossin'); }
  if(TD.isMirror(G.wave+1) && G.mode!=='bossrush') setTimeout(()=>toast('🪞 Next wave is a MIRROR WAVE — enemies will come from the castle side!', 'bad'), 1500);
  // warn about roads that change next wave
  for(const r of G.map.routeDefs) if((r.kind==='open'||r.kind==='reroute') && !r.open && r.from===G.wave+1) setTimeout(()=>toast('⚠️ Next wave the road changes — watch the '+(r.kind==='open'?'barricade':'south road')+'!', 'bad'), 900);
  for(const r of G.map.routeDefs) if(r.kind==='collapse' && !r.open && r.from===G.wave+1){ G.map.collapseWarn = true; W.refreshRoads(G.map); W.shake(0.25); sfx('stomp');
    setTimeout(()=>showEvBanner({ icon:'⚠️', name:'THE GROUND IS CRACKING', desc:'Next wave the cracked road collapses — enemies will take a new way!' }), 900); }
  if(TD.isSurvival(G.wave+1) && G.mode!=='bossrush') setTimeout(()=>toast('💀 Next wave is a SURVIVAL wave — splash damage and slows help!', 'bad'), 1700);
  // a random event now and then
  if(G.mode!=='bossrush' && G.wave >= 3 && Math.random() < 0.35){ const pool = TD.EVENTS.filter(e=>!(e.id==='repair' && G.lives >= G.startLives) && !(e.id==='merchant' && G.crystals < 3)); setTimeout(()=>{ if(!G.over && G.phase!=='menu') triggerEvent(pool[Math.floor(Math.random()*pool.length)]); }, 1200); }
  // interludes: the shop every 5th wave, perk picks (every 3rd wave in Roguelike, every 10th otherwise), road choices
  G.interludes = [];
  { const grp = G.map.routeDefs.filter(r=>r.kind==='choice' && r.from===G.wave+1 && !r.open && !r.sealed); if(grp.length && !grp.some(r=>r.open)) G.interludes.push('choice'); }
  if(G.wave % TD.SHOP_EVERY === 0) G.interludes.push('shop');
  if(G.mode==='rogue' ? G.wave % 3 === 0 : (G.wave % 10 === 0 && ['normal','endless'].includes(G.mode))) G.interludes.push('perk');
  if(G.interludes.length) nextInterlude();
  renderHud(); renderWaveBtn(); renderChips();
}


// =================== v6 mechanics ===================
// ---- roads: collapse, the player's choice, meteor strikes ----
function roadCells(r){ return r.list.filter(c=>!G.map.routeDefs[0].cells.has(c)); }
function evictFromClosedRoads(){
  for(const t of G.towers.slice()){ if(!TOWERS[t.type].onPath) continue; const key = t.cx+','+t.cz;
    if(G.map.routeDefs.some(r=>r.open && r.cells.has(key))) continue;
    const v = t.spent; G.gold += v; toast('↩️ '+TOWERS[t.type].name+' refunded (+'+v+') — its road is gone', 'tip');
    W.remove(t.mesh); G.grid.delete(key); G.towers.splice(G.towers.indexOf(t),1); }
  recomputeSyn();
}
function collapseRoad(r){
  const main = G.map.routeDefs[0], i0 = main.list.indexOf(r.closeAt), bad = i0 >= 0 ? main.list.slice(i0).filter(c=>!r.cells.has(c)) : [];
  r.open = true; main.open = false; G.map.collapseWarn = false;
  bad.forEach((k,i)=>{ const [x,z] = k.split(',').map(Number); setTimeout(()=>{ W.debris(x+0.5, 0.3, z+0.5, TD.THEMES[G.map.theme].rock, 8, 3); W.burst(x+0.5, 0.2, z+0.5, 0x5a4a44, 20, 2.6, 0.9, 4, -2, 1.6); W.burst(x+0.5, 0.1, z+0.5, 0xff5a1a, 10, 2, 0.6, 3, 3, 1.2); }, i*70); });
  evictFromClosedRoads(); setTimeout(()=>W.refreshRoads(G.map), Math.min(900, bad.length*70));
  sfx('bigboom'); sfx('stomp'); W.shake(0.7); W.punch(0.6);
  showEvBanner({ icon:'🌋', name:'THE ROAD COLLAPSES!', desc:r.text.replace(/^[^A-Z]*/, '') });
}
function chooseRoute(r, auto){
  const grp = G.map.routeDefs.filter(x=>x.kind==='choice' && x.group===r.group);
  grp.forEach(x=>{ if(x!==r) x.sealed = true; });
  r.open = true; G.choice = r; W.refreshRoads(G.map);
  if(r.gate){ const [gx,gz] = gatePos(r.gate); W.debris(gx, 0.4, gz, 0x9a6a3a, 18, 3.2); W.burst(gx, 0.4, gz, 0xd8c9a0, 50, 3.5, 0.8, 4, 5, 2); W.shock(gx, gz, 0xffc857, 2, 0.6); }
  sfx('bigboom'); W.shake(0.35); toast((auto ? '🔀 ' : '')+r.text+(r.perk==='gold' ? '  ·  +20% gold from kills' : '  ·  +1 💎 per wave'), 'good');
  G.curRoutes = routesFor(Math.max(1, G.wave+1));
}
function openChoice(){
  const grp = G.map.routeDefs.filter(r=>r.kind==='choice' && !r.open && !r.sealed); if(!grp.length) return nextInterlude();
  G.phase = 'choice'; G.choiceOffer = grp;
  $('choiceCards').innerHTML = grp.map((r,i)=>'<button class="choiceCard" data-i="'+i+'"><canvas class="chMap" width="280" height="200"></canvas><span class="ccIcon">'+r.icon+'</span><b>'+r.name+'</b><span>'+r.desc+'</span><em>'+(i+1)+'</em></button>').join('');
  $('choiceCards').querySelectorAll('.choiceCard').forEach((b,i)=>{ drawRouteMini(b.querySelector('canvas'), grp[i]); b.addEventListener('click', ()=>pickChoice(i)); });
  $('choiceWrap').classList.add('show'); sfx('daily');
}
function pickChoice(i){ const r = G.choiceOffer && G.choiceOffer[i]; if(!r || G.phase!=='choice') return; $('choiceWrap').classList.remove('show'); chooseRoute(r); nextInterlude(); renderWaveBtn(); renderChips(); }
function drawRouteMini(cv, sel){
  const m = G.map, g = cv.getContext('2d'), cs = Math.min(cv.width/m.w, cv.height/m.h), th = TD.THEMES[m.theme];
  const ox = (cv.width - cs*m.w)/2, oy = (cv.height - cs*m.h)/2;
  g.fillStyle = th.ground; g.fillRect(0,0,cv.width,cv.height);
  const cell = (k, col, a)=>{ const [x,z] = k.split(',').map(Number); g.globalAlpha = a; g.fillStyle = col; g.fillRect(ox+x*cs+1, oy+z*cs+1, cs-2, cs-2); };
  m.routeDefs.forEach(r=>{ if(r.open) r.list.forEach(k=>cell(k, th.path, 1)); });
  sel.list.forEach(k=>{ if(!m.routeDefs.some(r=>r.open && r.cells.has(k))) cell(k, '#ffc857', 1); });
  G.towers.forEach(t=>{ g.globalAlpha = 1; g.fillStyle = '#'+TOWERS[t.type].accent.toString(16).padStart(6,'0'); g.beginPath(); g.arc(ox+(t.cx+0.5)*cs, oy+(t.cz+0.5)*cs, cs*0.32, 0, Math.PI*2); g.fill(); });
  g.globalAlpha = 1;
}
function meteorEvent(){
  const cands = G.map.routeDefs.filter(r=>r.kind==='meteor' && !r.open);
  if(cands.length){ const r = cands[Math.floor(Math.random()*cands.length)], [gx,gz] = r.gate ? gatePos(r.gate) : [G.map.w/2, G.map.h/2];
    const mesh = W.projMesh('meteor'); mesh.scale.setScalar(1.4); const from = new (window.THREE.Vector3)(gx-3, 12, gz-2); mesh.position.copy(from);
    G.projs.push({ kind:'meteor', mesh, from, to:new (window.THREE.Vector3)(gx, 0.1, gz), t:0, dur:1.1, dmg:0, splash:1.5, road:r }); sfx('meteor'); return; }
  // no hidden road here: the meteor leaves a crater full of crystals instead
  const free = []; for(let x=0;x<G.map.w;x++) for(let z=0;z<G.map.h;z++) if(cellFree(x,z)) free.push([x,z]);
  if(!free.length){ addCrystals(2); return; }
  const [x,z] = free[Math.floor(Math.random()*free.length)], mesh = W.projMesh('meteor'); mesh.scale.setScalar(1.1);
  const from = new (window.THREE.Vector3)(x-2.5, 11, z-2); mesh.position.copy(from);
  G.projs.push({ kind:'meteor', mesh, from, to:new (window.THREE.Vector3)(x+0.5, 0.1, z+0.5), t:0, dur:1.0, dmg:0, splash:1.2, crater:[x,z] }); sfx('meteor');
}
function meteorLanded(p){
  if(p.road){ p.road.open = true; W.refreshRoads(G.map); W.shake(0.6); W.punch(0.5); showEvBanner({ icon:'☄️', name:'A NEW ROAD!', desc:p.road.text.replace(/^[^A-Z]*/, '')+' Enemies will split between the roads.' }); G.curRoutes = routesFor(G.wave+1); renderWaveBtn(); return; }
  if(p.crater){ const [x,z] = p.crater; if(!cellFree(x,z)) { addCrystals(2); return; } const mesh = W.makeCrater(); mesh.position.set(x+0.5, 0, z+0.5);
    G.objs.set(x+','+z, { type:'crater', cx:x, cz:z, x:x+0.5, z:z+0.5, mesh }); toast('☄️ A meteorite crater! Tap it to mine crystals', 'good'); }
}
function mineCrater(o){ G.objs.delete(o.cx+','+o.cz); W.removeObject(o.mesh); G.selObj = null; addCrystals(2); addCores(TD.CORES.crater, 'meteorite ore');
  W.burst(o.x, 0.4, o.z, 0x7fe8ff, 50, 3.4, 0.9, 3.5, 3, 2.2); W.debris(o.x, 0.3, o.z, 0x4a3a34, 14, 3); W.shock(o.x, o.z, 0x7fe8ff, 1.6, 0.6); sfx('coin'); sfx('shatter'); renderPanel(); renderHud(); }

// ---- evolution: enemies adapt to the damage type that kills them most ----
function evolve(){
  if(G.mode==='bossrush') return;
  G.dmgHist.push(G.dmgWave); G.dmgWave = {}; if(G.dmgHist.length > TD.ADAPT.window) G.dmgHist.shift();
  if(G.wave < TD.ADAPT.from) return;
  const tot = {}; let all = 0; G.dmgHist.forEach(h=>{ for(const k in h){ tot[k] = (tot[k]||0) + h[k]; all += h[k]; } });
  if(all <= 0) return;
  let top = null, tv = 0; for(const k in tot) if(tot[k] > tv){ tv = tot[k]; top = k; }
  const share = tv/all, A = G.adapt;
  if(share >= TD.ADAPT.share){
    if(A.type===top){ if(A.lvl < TD.ADAPT.max){ A.lvl++; announceEvo(); } } else { A.type = top; A.lvl = 1; announceEvo(); }
  }else if(A.lvl > 0 && (A.type!==top || share < TD.ADAPT.share - 0.1)){ A.lvl--; if(!A.lvl) A.type = null;
    setTimeout(()=>toast(A.lvl ? '🧬 The enemy\'s adaptation weakens (level '+A.lvl+')' : '🧬 Your mixed defense wore down their evolution!', 'good'), 1500); }
  renderChips();
}
function announceEvo(){
  const I = TD.DTYPE_INFO[G.adapt.type]; G.adaptMax = Math.max(G.adaptMax||0, G.adapt.lvl);
  const CA = G.adapt.lvl >= 2 && TD.ADAPT_COUNTER[G.adapt.type] ? TD.ARMOR_TYPES[TD.ADAPT_COUNTER[G.adapt.type]] : null;
  setTimeout(()=>showEvBanner({ icon:'🧬', name:'ENEMIES ADAPTED  ·  LEVEL '+G.adapt.lvl, desc:'Too much '+I.icon+' '+I.name+'! Next waves resist it by '+Math.round(adaptK()*100)+'%'+(CA ? ' and '+Math.round(12*G.adapt.lvl)+'% arrive in '+CA.icon+' '+CA.name : '')+' — mix up your towers.' }), 1400);
}

// ---- tower combos ----
function comboMul(){ return 1 + 0.15*rs('combo'); }
function combo(id, e, text){
  const C = TD.COMBOS.find(c=>c.id===id); if(!C) return;
  if(e && !e.dead) num(e.pos.x, e.pos.y + e.d.size*1.4 + 0.3, e.pos.z, text || (C.icon+' '+C.name.toUpperCase()), 'combo');
  if(!SAVE.combos.includes(id)){ SAVE.combos.push(id); addCores(TD.CORES.combo); showEvBanner({ icon:C.icon, name:'NEW COMBO: '+C.name.toUpperCase(), desc:C.desc+'  +1 🔮' }); sfx('level'); chCheck(); persist();
    if(SAVE.combos.length >= TD.COMBOS.length && !SAVE.legends.includes('aether')){ SAVE.legends.push('aether'); setTimeout(()=>showEvBanner({ icon:'💠', name:'SECRET TOWER UNLOCKED', desc:'Every combo mastered — the Aether Prism joins your Legendary Vault!' }), 3400); } }
  G.combosRun.add(id);
}
function setBurn(e, t, dps){ if(e.dead || e.armorT==='fireproof') return; e.burn = Math.max(e.burn, t); e.burnDps = Math.max(e.burnDps, dps); }
function overload(e, src){
  e.eshield = 0; W.eShield(e.mesh, false); W.shock(e.pos.x, e.pos.z, 0x4ad8ff, 2, 0.6); W.flash(e.pos.x, 1, e.pos.z, 0x9ffcff, 3, 0.35); W.burst(e.pos.x, e.pos.y+0.5, e.pos.z, 0x4ad8ff, 50, 3.5, 0.6, 3, 1, 2); sfx('bigzap');
  const dmg = (stat(src,'dmg')||30)*1.5*comboMul();
  for(const o of G.enemies){ if(o.dead) continue; if(o.pos.distanceTo(e.pos) <= 1.6){ o.stun = Math.max(o.stun, o.big ? 0.3 : 1); if(o!==e) hit(o, dmg, { kind:'bolt', src }); } }
  combo('overload', e);
}
// ---- air bosses: a wind shield until frost + lightning (or a gust) ground it ----
function airTag(e, k){ if(!e.gShield || e.dead) return; e[k] = G.t; if(e.grounded > 0 || e.gCool > 0) return;
  const W3 = TD.AIR.comboWindow, n = ['gIce','gZap','gWind'].filter(x=>e[x]!=null && G.t - e[x] <= W3).length; if(n >= 2) groundIt(e, TD.AIR.groundT, false); }
function groundIt(e, T, tired){
  e.grounded = T; e.air = false; e.gIce = e.gZap = e.gWind = null; SAVE.stats.grounded = (SAVE.stats.grounded||0) + 1; chCheck();
  W.shock(e.pos.x, e.pos.z, 0x9ffcff, 2.6, 0.7); W.burst(e.pos.x, 1, e.pos.z, 0xdffbff, 60, 4, 0.8, 3.5, 4, 2.2); W.debris(e.pos.x, 0.4, e.pos.z, 0x8a8a9a, 14, 3); sfx('stomp'); W.shake(0.5); W.punch(0.4);
  num(e.pos.x, 1.8, e.pos.z, tired ? '⬇️ EXHAUSTED' : '⬇️ GROUNDED!', 'combo');
  if(!tired) toast('⬇️ GROUNDED! '+(e.bname||'The air boss')+' crashes down — +50% damage, Cannons can hit it for '+T+'s', 'good');
}
// ---- robot helper ----
function spawnRobot(){ const c = G.map.castle.position; G.robot = { x:c.x, z:c.z, y:1.2, mode:'collect', cool:0, mesh:W.makeRobot(), got:0 }; G.robot.mesh.position.set(c.x, 1.2, c.z); }
function robotToggle(){ if(!G.robot){ toast('🔒 The robot helper joins at player level '+TD.ROBOT.unlock, 'bad'); sfx('nope'); return; }
  G.robot.mode = G.robot.mode==='collect' ? 'attack' : 'collect'; toast(G.robot.mode==='attack' ? '🤖 Bolt-9: ATTACK mode — hunts the enemy closest to the castle' : '🤖 Bolt-9: COLLECT mode — gathers loot and zaps what comes close', 'tip'); sfx('click'); renderAbilities(); }
function robotTick(dt){
  const R = G.robot; if(!R) return;
  const L = robotLv(), RB = TD.ROBOT, boost = 1 + 0.2*rs('robotics'), spd = RB.speed[L-1]*boost;
  let tx = null, tz = null, lead = null;
  for(const e of G.enemies){ if(e.dead || e.invis) continue; if(!lead || e.dist > lead.dist) lead = e; }
  if(R.mode==='collect' && G.pickups.length){ let bd = 1e9; for(const p of G.pickups){ const d2 = (p.x-R.x)**2 + (p.z-R.z)**2; if(d2 < bd){ bd = d2; tx = p.x; tz = p.z; } } }
  if(tx==null && lead){ const c = G.map.castle.position, k = R.mode==='attack' ? 1 : 0.55; tx = lead.pos.x + (c.x-lead.pos.x)*0.12*(1-k) ; tz = lead.pos.z + (c.z-lead.pos.z)*0.12*(1-k);
    if(R.mode!=='attack'){ tx = c.x + (lead.pos.x - c.x)*0.45; tz = c.z + (lead.pos.z - c.z)*0.45; } }
  if(tx==null){ const c = G.map.castle.position; tx = c.x - 0.6; tz = c.z; }
  const dx = tx-R.x, dz = tz-R.z, Lm = Math.hypot(dx,dz);
  if(Lm > 0.05){ const mv = Math.min(Lm, spd*dt); R.x += dx/Lm*mv; R.z += dz/Lm*mv; R.mesh.rotation.y = Math.atan2(dx, dz); }
  R.x = clamp(R.x, -0.5, G.map.w+0.5); R.z = clamp(R.z, -0.5, G.map.h+0.5);
  R.mesh.position.set(R.x, 1.15 + Math.sin(G.t*3)*0.08, R.z);
  // collect
  const mag = RB.magnet[L-1];
  for(let i=G.pickups.length-1;i>=0;i--){ const p = G.pickups[i]; if((p.x-R.x)**2 + (p.z-R.z)**2 <= mag*mag){ collectPickup(i, true); } }
  // shoot
  R.cool -= dt;
  if(R.cool <= 0){ let tg = null, bd = RB.range*RB.range;
    for(const e of G.enemies){ if(e.dead || e.invis) continue; const d2 = (e.pos.x-R.x)**2 + (e.pos.z-R.z)**2; if(d2 < bd){ bd = d2; tg = e; } }
    if(tg){ R.cool = 1/RB.rate[L-1]; const from = new (window.THREE.Vector3)(R.x, 1.1, R.z), to = headPos(tg).clone();
      W.bolt(from, to, R.mode==='attack' ? 0xff4b5c : 0x3affc8, 0.03, false); W.flash(to.x, to.y, to.z, 0x3affc8, 0.6, 0.1);
      hit(tg, RB.dmg[L-1]*(1 + 0.1*Math.max(0, G.wave-1))*boost*(R.mode==='attack' ? 1.6 : 1), { kind:'bolt', robot:true }); sfx('laser'); }
    else R.cool = 0.2; }
  W.animateRobot(R.mesh, G.t, R.mode);
}
function dropPickup(x, z, kind, val){
  if(G.pickups.length > 24) return;
  const mesh = W.makePickup(kind); mesh.position.set(x, 0, z);
  G.pickups.push({ x, z, kind, val, t:TD.ROBOT.pickT, mesh, y:0 });
}
function collectPickup(i, byRobot){
  const p = G.pickups[i]; G.pickups.splice(i,1); W.remove(p.mesh);
  if(p.kind==='crystal') { addCrystals(1); num(p.x, 0.8, p.z, '+1 💎', 'bolt'); }
  else { G.gold += p.val; G.earned += p.val; num(p.x, 0.8, p.z, '+'+p.val+' 💰', 'gold'); }
  W.burst(p.x, 0.4, p.z, p.kind==='crystal' ? 0x7fe8ff : 0xffd54a, 12, 2, 0.5, 2.4, 3, 1.6); sfx('coin');
  if(byRobot){ SAVE.stats.pickups = (SAVE.stats.pickups||0) + 1; if(SAVE.stats.pickups % 10 === 0) chCheck(); }
  renderHud();
}
function pickupsTick(dt){
  for(let i=G.pickups.length-1;i>=0;i--){ const p = G.pickups[i]; p.t -= dt; p.mesh.position.y = Math.sin(G.t*4 + p.x)*0.05; if(p.mesh.spin) p.mesh.spin.rotation.y += dt*4;
    if(p.t < 2) p.mesh.visible = Math.sin(G.t*20) > 0;
    if(p.t <= 0){ W.remove(p.mesh); G.pickups.splice(i,1); } }
}
// ---- legendary towers ----
function legendTick(t, dt){
  const d = TOWERS[t.type], r = stat(t,'range'), inR = e=>!e.dead && !e.invis && inRange(t, e, r);
  if(t.mesh.spin) t.mesh.spin.rotation.y += dt*2; if(t.mesh.orbit) t.mesh.orbit.rotation.y += dt*1.6; if(t.mesh.halo2) t.mesh.halo2.rotation.z += dt*0.8; if(t.mesh.coreRing) t.mesh.coreRing.rotation.z += dt*3;
  t.cool -= dt;
  if(t.type==='solar'){
    if(t.cool > 0) return; let tg = null; for(const e of G.enemies){ if(!inR(e)) continue; if(!tg || e.hp > tg.hp) tg = e; } if(!tg) return;
    t.cool = 1/stat(t,'rate'); chargeUlt(t, 1); const p = headPos(tg).clone(), dmg = stat(t,'dmg');
    W.bolt(new (window.THREE.Vector3)(p.x, 14, p.z), p, 0xffe27a, 0.22, false); W.bolt(new (window.THREE.Vector3)(p.x+0.1, 14, p.z), p, 0xffffff, 0.08, false);
    W.flash(p.x, p.y, p.z, 0xffe27a, 5, 0.5); W.shock(tg.pos.x, tg.pos.z, 0xffc857, 2, 0.6); W.burst(p.x, 0.4, p.z, 0xffe27a, 60, 4, 0.7, 4, 3, 2); W.shake(0.2);
    hit(tg, dmg, { kind:'meteor', src:t, pierce:true });
    for(const o of G.enemies){ if(o.dead || o===tg) continue; if(o.pos.distanceTo(tg.pos) <= 1.2) hit(o, dmg*0.4, { kind:'meteor', src:t }); }
    if(!tg.air) G.fires.push({ x:tg.pos.x, z:tg.pos.z, r:0.9, t:3, dps:dmg*0.06, src:t, tick:0, mesh:W.firePatch(tg.pos.x, tg.pos.z, 0.9, 0xffb347) });
    sfx('bigboom');
  }else if(t.type==='voidcore'){
    if(t.cool > 0) return; let best = null, bn = 0;
    for(const e of G.enemies){ if(!inR(e)) continue; let n = 0; for(const o of G.enemies){ if(!o.dead && o.pos.distanceTo(e.pos) < 1.6) n++; } if(n > bn){ bn = n; best = e; } }
    if(!best) return; t.cool = 1/stat(t,'rate'); chargeUlt(t, 1);
    const mesh = W.makeHole(); mesh.position.set(best.pos.x, 0, best.pos.z); mesh.scale.setScalar(0.01);
    G.holes.push({ x:best.pos.x, z:best.pos.z, t:3, max:3, src:t, mesh }); W.portalFx(best.pos.x, best.pos.z, 0xb04cff); sfx('portal'); W.shake(0.15);
  }else if(t.type==='dragon'){
    let tg = null; for(const e of G.enemies){ if(!inR(e)) continue; if(!tg || e.dist > tg.dist) tg = e; }
    W.animateDragon(t.mesh, G.t, tg ? tg.pos.x : null, tg ? tg.pos.z : null, !!tg);
    if(!tg || t.cool > 0) return; t.cool = 1/stat(t,'rate');
    const m = W.dragonMouth(t.mesh), p = headPos(tg).clone(), dmg = stat(t,'dmg');
    W.bolt(m, p, Math.random()<0.5 ? 0xff7a2a : 0xffc857, 0.09, false); W.burst(p.x, p.y, p.z, 0xff7a2a, 8, 2.4, 0.4, 3, 1, 1.6);
    for(const o of G.enemies){ if(o.dead) continue; if(o.pos.distanceTo(tg.pos) <= 0.95){ hit(o, dmg, { kind:'fire', src:t }); setBurn(o, 2.5, dmg*0.6); } }
    if(Math.random() < 0.3) sfx('shell');
  }else if(t.type==='aether'){
    if(t.cool > 0) return; const list = G.enemies.filter(inR).sort((a,b)=>b.dist-a.dist).slice(0, 5); if(!list.length) return;
    t.cool = 1/stat(t,'rate'); chargeUlt(t, 1); const m = muzzleWorld(t), dmg = stat(t,'dmg');
    const EL = [ ['ice',0xbdf3ff], ['fire',0xff7a2a], ['poison',0x9dff5a], ['bolt',0x9ffcff], ['void',0xb04cff] ];
    list.forEach((e,i)=>{ const [k,c] = EL[Math.floor(Math.random()*EL.length)], p = headPos(e).clone();
      W.bolt(m, p, c, 0.05, k==='bolt'); W.flash(p.x, p.y, p.z, c, 1.2, 0.15);
      hit(e, dmg, { kind: k==='void' ? 'meteor' : (k==='poison' ? 'phys' : k), src:t });
      if(e.dead) return;
      if(k==='ice') applySlow(e, 0.5, 2, t); else if(k==='fire') setBurn(e, 3, dmg*0.3); else if(k==='poison') applyPoison(e, t, 2); else if(k==='bolt') e.stun = Math.max(e.stun, e.big ? 0.2 : 0.6); else e.marked = 3; });
    sfx('zap');
  }
}
function holesTick(dt){
  for(let i=G.holes.length-1;i>=0;i--){ const h = G.holes[i]; h.t -= dt; const k = h.t > 0.4 ? Math.min(1, (h.max-h.t)*4) : Math.max(0.01, h.t/0.4);
    h.mesh.scale.setScalar(k); h.mesh.swirl.rotation.z += dt*6; h.mesh.disk.rotation.z -= dt*2;
    const pct = stat(h.src,'dmg')||0.05;
    for(const e of G.enemies){ if(e.dead) continue; const dx = h.x-e.pos.x, dz = h.z-e.pos.z, D = Math.hypot(dx,dz); if(D > 1.8) continue;
      const pull = (e.big ? 0.25 : (e.d.mini ? 0.6 : 1.6))*dt; if(D > 0.12){ const mv = Math.min(D-0.1, pull); e.pos.x += dx/D*mv; e.pos.z += dz/D*mv; }
      if(!e.big) e.stun = Math.max(e.stun, 0.12);
      hit(e, e.maxHp*pct*(e.big ? 0.2 : (e.d.mini ? 0.4 : 1))*dt, { kind:'beam', src:h.src }); }
    if(Math.random() < dt*30) W.burst(h.x+(Math.random()-0.5)*3, 0.3, h.z+(Math.random()-0.5)*3, 0xb04cff, 1, 0.3, 0.5, 2, 0, 0.2);
    if(h.t <= 0){ W.remove(h.mesh); G.holes.splice(i,1); } }
}
// ---- the castle cannon and the Final Zone's unstable core ----
function castleTick(dt){
  if(G.base.guns > 0 && G.phase==='wave'){ G.castleCool -= dt;
    if(G.castleCool <= 0){ const c = G.map.castle.position; let tg = null, bd = 3.0*3.0;
      for(const e of G.enemies){ if(e.dead || e.air || e.invis) continue; const d2 = (e.pos.x-c.x)**2 + (e.pos.z-c.z)**2; if(d2 < bd){ bd = d2; tg = e; } }
      if(tg){ G.castleCool = 1.1; const from = new (window.THREE.Vector3)(c.x, 1.25, c.z), dist = Math.hypot(tg.pos.x-c.x, tg.pos.z-c.z), dur = clamp(dist/7, 0.3, 0.7), to = predict(tg, dur); to.y = 0.08;
        const mesh = W.projMesh('shell'); mesh.position.copy(from);
        G.projs.push({ kind:'shell', mesh, from, to, t:0, dur, dmg: 26*(1 + 0.12*G.wave)*G.base.guns*(1 + 0.25*rs('guns')), splash:0.9, src:null, arc:1.2 });
        const tur = G.map.castle.userData.turret; if(tur) tur.rotation.y = Math.atan2(tg.pos.x-c.x, tg.pos.z-c.z) - G.map.castle.rotation.y;
        W.flash(c.x, 1.3, c.z, 0xffb347, 1.4, 0.15); sfx('shell'); } else G.castleCool = 0.25; } }
  if(G.map.effect==='core' && G.phase==='wave'){ G.coreT -= dt;
    if(G.coreT <= 0){ G.coreT = 30; const ts = G.towers.filter(t=>t.dis<=0 && !TOWERS[t.type].onPath); if(ts.length){ const t = ts[Math.floor(Math.random()*ts.length)];
        W.shock(G.map.w/2, G.map.h/2, 0xff3c5a, 9, 0.9); W.bolt(new (window.THREE.Vector3)(G.map.w/2, 6, G.map.h/2), new (window.THREE.Vector3)(t.x, 1, t.z), 0xff3c5a, 0.08, true); disableTower(t, 2.5, 'emp');
        toast('☢️ CORE PULSE — your '+TOWERS[t.type].name+' is knocked out', 'bad'); sfx('emp'); W.shake(0.2); } } }
}
// ---- walls and warp gates on the road ----
function routeDistAt(route, x, z){
  let acc = 0;
  for(let i=0;i<route.length-1;i++){ const a = route[i], b = route[i+1], dx = b.x-a.x, dz = b.z-a.z, L = Math.hypot(dx,dz); if(L < 1e-6) continue;
    const k = clamp(((x-a.x)*dx + (z-a.z)*dz)/(L*L), 0, 1), px = a.x+dx*k, pz = a.z+dz*k;
    if(Math.hypot(px-x, pz-z) < 0.3) return acc + k*L; acc += L; }
  return null;
}
function structAt(t, route){ const m = t.rd || (t.rd = new Map()); if(!m.has(route)) m.set(route, routeDistAt(route, t.x, t.z)); return m.get(route); }
function wallDps(e){ return (8 + G.wave*0.6) * Math.max(1, e.lives) * (e.big ? 5 : (e.d.mini ? 3 : 1)); }
function breakWall(w){
  W.debris(w.x, 0.4, w.z, 0x8a6a4a, 22, 3.4); W.burst(w.x, 0.3, w.z, 0xd8c9a0, 40, 3, 0.8, 4, 4, 1.8); W.shock(w.x, w.z, 0xffc857, 1.4, 0.5); sfx('boom'); W.shake(0.2);
  toast('🧱 A barricade was smashed!', 'bad'); W.remove(w.mesh); G.grid.delete(w.cx+','+w.cz); G.towers.splice(G.towers.indexOf(w),1); if(G.sel===w) deselect(); recomputeSyn();
}
// ---- mini-boss moves, infection, air bosses, survival, structures ----
function miniTick(e, dt){
  const d = e.d; e.sT -= dt;
  if(d.charge){ if(e.chargeK > 0){ e.chargeK -= dt; if(Math.random() < dt*25) W.burst(e.pos.x, 0.15, e.pos.z, 0xd8c9a0, 2, 1.5, 0.5, 3, 1, 1); }
    if(e.sT <= 0){ e.sT = 6; e.chargeK = 1.6; num(e.pos.x, e.pos.y+1.3, e.pos.z, '💨 CHARGE!', 'blk'); W.shock(e.pos.x, e.pos.z, 0xd8c9a0, 1.4, 0.4); sfx('stomp'); } }
  if(d.brood && e.sT <= 0){ e.sT = 4; for(let i=0;i<3;i++){ const m = spawn('swarmling', e.pos, e.seg, e.route); m.dist = e.dist - 0.1*(i+1); m.pos.x += (Math.random()-0.5)*0.3; m.pos.z += (Math.random()-0.5)*0.3; }
    W.burst(e.pos.x, 0.5, e.pos.z, 0xeaff7a, 30, 2.6, 0.6, 3, 2, 1.8); sfx('pop'); }
  if(d.phase && e.sT <= 0){ e.sT = 5; W.portalFx(e.pos.x, e.pos.z, 0xb07cff); advance(e, 2); W.portalFx(e.pos.x, e.pos.z, 0xb07cff); e.invisT = 1.2; sfx('portal'); }
  if(d.bomber && e.sT <= 0){ const ts = towersNear(e.pos.x, e.pos.z, 2).filter(t=>t.dis<=0).slice(0, 2);
    if(!ts.length){ e.sT = 0.8; } else { e.sT = 6; const hp = headPos(e).clone();
      ts.forEach((t,i)=>{ const mesh = W.projMesh('meteor'); mesh.scale.setScalar(0.35); mesh.position.copy(hp); G.projs.push({ kind:'meteor', mesh, from:hp.clone(), to:new (window.THREE.Vector3)(t.x, 0.3, t.z), t:-i*0.15, dur:0.6, lava:true, bomb:true, tower:t, dmg:0, splash:0 }); });
      num(e.pos.x, e.pos.y+0.8, e.pos.z, '💣 BOMBS!', 'blk'); sfx('meteor'); } }
  if(d.icer && e.sT <= 0){ let best = null, bd = 3*3; for(const t of G.towers){ if(t.dis > 0 || TOWERS[t.type].onPath) continue; const d2 = (t.x-e.pos.x)**2 + (t.z-e.pos.z)**2; if(d2 < bd){ bd = d2; best = t; } }
    if(!best){ e.sT = 1; } else { e.sT = 7; W.bolt(headPos(e).clone(), new (window.THREE.Vector3)(best.x, 1, best.z), 0xbdf3ff, 0.07, true); disableTower(best, 2.5, 'ice'); W.burst(best.x, 0.8, best.z, 0xbdf3ff, 26, 2.6, 0.7, 3, 1, 1.8); sfx('freeze'); } }
}
function canInfect(o){ return !o.dead && !o.infected && !o.big && !o.d.mini && !o.d.infect; }
function infect(o, src){
  o.infected = true; o.maxHp = Math.round(o.maxHp*1.5); o.hp = Math.min(o.maxHp, Math.round(o.hp*1.5)); o.speed *= 1.12; o.armor += 1; o.poison = null;
  W.infected(o.mesh, true); o.mesh.baseColor.lerp(_tox, 0.45);
  if(src && !src.dead) W.bolt(headPos(src).clone(), headPos(o).clone(), 0x9dff5a, 0.05, true);
  W.burst(o.pos.x, o.pos.y+0.5, o.pos.z, 0x9dff5a, 16, 2, 0.6, 2.6, -1, 1.6); num(o.pos.x, o.pos.y+1.1, o.pos.z, '🧟 INFECTED', 'heal'); sfx('heal');
}
function infectNear(e){ let best = null, bd = 2*2; for(const o of G.enemies){ if(o===e || !canInfect(o)) continue; const d2 = o.pos.distanceToSquared(e.pos); if(d2 < bd){ bd = d2; best = o; } } if(best) infect(best, e); }
function airTick(e, dt){
  if(e.grounded > 0){ e.grounded -= dt; if(e.grounded <= 0){ e.grounded = 0; e.air = true; e.gCool = TD.AIR.cooldown; toast('🚁 '+(e.bname||'The air boss')+' takes off again!', 'bad'); sfx('storm'); } }
  else if(e.gCool > 0) e.gCool -= dt;
  const want = e.grounded > 0 ? 0.3 : 1.5; e.mesh.baseY += (want - e.mesh.baseY)*Math.min(1, dt*3); e.pos.y = e.mesh.baseY;
  if(e.mesh.windShield) e.mesh.windShield.visible = !(e.grounded > 0);
}
function endSurvival(){
  G.queue = []; let n = 0;
  for(const e of G.enemies){ if(e.dead || e.big || e.d.mini) continue; e.dead = true; if(n++ < 12) W.portalFx(e.pos.x, e.pos.z, 0x9a7aff); }
  const g = 40 + G.wave*5; G.gold += g; G.earned += g;
  showEvBanner({ icon:'💀', name:'YOU SURVIVED!', desc:'The horde breaks and flees — +'+g+' gold' }); sfx('win'); renderHud();
}
function bashWall(e, w, dt){
  w.hp -= wallDps(e)*dt; w.hitThisWave = true; e.bash = (e.bash||0) + dt;
  const th = TOWERS.barricade.thorns[Math.min(3,w.level)-1]; if(th) hit(e, th*(1 + 0.08*G.wave)*dt, { kind:'beam' });
  if(e.bash > 0.45){ e.bash = 0; W.burst(w.x, 0.4, w.z, 0xd8c9a0, 4, 1.6, 0.4, 2.4, 3, 1.2); W.debris(w.x, 0.4, w.z, 0x8a6a4a, 1, 1.6); if(Math.random() < 0.3) sfx('hit'); }
  if(w.hp <= 0 && G.towers.includes(w)) breakWall(w);
}
function structTick(t, dt){
  if(t.type==='generator'){ if(t.mesh.spin) t.mesh.spin.rotation.y += dt*3; if(t.mesh.coreRing){ t.mesh.coreRing.rotation.x += dt*2; t.mesh.coreRing.rotation.y += dt*3; } if(t.mesh.glow) t.mesh.glow.material.opacity = 0.45 + Math.sin(G.t*5+t.x)*0.15; if(t.mesh.aura) t.mesh.aura.material.opacity = 0.14 + Math.sin(G.t*3)*0.06; }
  else if(t.type==='warp'){ if(t.wcool > 0) t.wcool -= dt; if(t.mesh.spin) t.mesh.spin.rotation.z += dt*(t.wcool > 0 ? 1 : 5); if(t.mesh.disc) t.mesh.disc.material.opacity = t.wcool > 0 ? 0.2 : 0.55 + Math.sin(G.t*6)*0.1; }
  else if(t.type==='barricade' && t.mesh.bar){ W.faceCamLocal(t.mesh.bar, t.mesh); t.mesh.fill.scale.x = Math.max(0.001, t.hp/t.hpMax); t.mesh.fill.material.color.set(t.hp/t.hpMax > 0.5 ? 0xffc857 : (t.hp/t.hpMax > 0.25 ? 0xff8c42 : 0xff4b5c)); }
}
// ---- combat ----------------------------------------------------------
const _v = V3(), _v2 = V3();
function inRange(t, e, r){ const dx = e.pos.x-t.x, dz = e.pos.z-t.z; return dx*dx+dz*dz <= (r+e.d.size)*(r+e.d.size); }
function canHit(t, e){ const d = TOWERS[t.type]; if(d.proj==='none') return false; if(e.ghost && (d.proj==='arrow'||d.proj==='shell'||d.proj==='gust')) return false; return e.air ? (d.air || !!flag(t,'air')) : d.ground; }
// target priority per tower: first / last / strongest / weakest / fastest
const PRIOS = [ { id:'first', icon:'⏩', name:'First' }, { id:'last', icon:'⏪', name:'Last' }, { id:'strong', icon:'💪', name:'Strongest' }, { id:'weak', icon:'🩸', name:'Weakest' }, { id:'fast', icon:'💨', name:'Fastest' } ];
function effSpeed(e){ return e.speed*(1-e.slow)*(e.hasted?1.3:1)*(e.frozen>0||e.stun>0?0:1); }
function prioScore(p, e){ switch(p){ case 'last': return -e.dist; case 'strong': return e.hp; case 'weak': return -e.hp; case 'fast': return effSpeed(e)*100 + e.dist*0.01; default: return e.dist; } }
function pickTarget(t){
  const r = stat(t,'range'), p = t.prio || 'first'; let best = null, bd = -Infinity;
  for(const e of G.enemies){ if(e.dead || e.invis || !canHit(t,e) || !inRange(t,e,r)) continue; const sc = prioScore(p, e); if(sc > bd){ bd = sc; best = e; } }
  return best;
}
function tstat(type){ return G.tst[type] || (G.tst[type] = { dmg:0, kills:0, crits:0, shots:0, built:0, ults:0 }); }
function muzzleWorld(t){ const v = t.mesh.muzzle.clone(); t.mesh.head.localToWorld(v); return v; }
function headPos(e){ return _v2.set(e.pos.x, e.pos.y + e.d.size*1.4, e.pos.z); }
// kind: 'phys' | 'bolt' | 'beam' | 'fire' | 'ice' | 'meteor'
const KIND_COL = { phys:0xffe6a0, bolt:0x9ffcff, ice:0xbdf3ff, meteor:0xff8c42, fire:0xff5a1a, beam:0xffb0d8 };
function isCold(e){ return e.frozen>0 || e.chill>0 || e.slow>0; }
function hit(e, dmg, o){
  if(e.dead || dmg<=0) return 0; o = o||{};
  const p = headPos(e), quiet = o.kind==='beam' || o.kind==='fire' || o.kind==='poison', dty = (o.src && o.kind!=='fire' && o.kind!=='poison' && TOWERS[o.src.type].dtype) || TD.DTYPE[o.kind] || null;
  if(o.kind==='poison' && e.infected) return 0;
  if(e.under > 0 && o.kind!=='poison' && o.kind!=='fire') return 0;
  const P = o.src && o.src.perks;
  if(e.weakT > 0) dmg *= TD.BOSS_UNIVERSAL.weakMul;
  if(P && P.length){ if(P.includes('slayer') && (e.elite || e.d.mini || e.big)) dmg *= 1.25; if(!quiet && P.includes('brutal') && Math.random() < 0.1){ dmg *= 3; o.brutal = true; } }
  if(e.blazeT > 0 && dty==='fire') dmg *= 0.25;
  if(e.gShield){ if(o.kind==='bolt') airTag(e, 'gZap'); else if(o.kind==='ice') airTag(e, 'gIce'); if(o.gust) airTag(e, 'gWind'); }
  if(e.guarded && !o.pierce) dmg *= 0.65;
  if(e.marked > 0) dmg *= 1.3;
  if(e.winded > 0) dmg *= 1.25;
  if(e.brittle && e.frozen > 0) dmg *= 1.5;
  if(e.poison && e.poison.corrode) dmg *= 1.2;
  if(o.cold && isCold(e)) dmg *= o.cold;
  if(o.crit && perk('double_crit')) dmg *= 2;
  if(e.resist && dty===e.resist.type) dmg *= 1 - e.resist.k;
  if(e.armorT){ if(e.armorT==='plate' && (dty==='phys' || dty==='blast') && !o.pierce) dmg *= 0.6; else if(e.armorT==='fireproof' && dty==='fire') dmg *= 0.25; else if(e.armorT==='insulated' && dty==='energy') dmg *= 0.6; dmg *= 1 + 0.08*rs('breaker'); }
  if(e.gShield){ if(e.grounded > 0) dmg *= 1.5; else { const cut = dmg*e.d.windShield; dmg -= cut; e.gAbs = (e.gAbs||0) + cut; if(e.gAbs >= e.maxHp*TD.AIR.autoGround && !(e.gCool > 0)){ e.gAbs = 0; groundIt(e, 3, true); } } }
  if(e.eshield > 0 && o.kind!=='poison'){
    if(o.kind==='bolt' && o.src && TOWERS[o.src.type].proj==='bolt' && e.eshield < e.eshieldMax*0.5){ overload(e, o.src); return 0; }
    e.eshield -= dmg*(dty==='energy' ? 2 : 0.5); if(!quiet) num(p.x,p.y,p.z, Math.round(dmg), 'shd'); e.flash = Math.max(e.flash, 0.04);
    if(e.eshield <= 0){ e.eshield = 0; W.eShield(e.mesh, false); W.burst(p.x,p.y,p.z,0x4ad8ff,24,2.6,0.5,3,4,1.6); W.shock(e.pos.x, e.pos.z, 0x4ad8ff, 1.2, 0.4); sfx('shatter');
      if(e.rageOnBreak){ e.rageOnBreak = false; e.raging = true; e.speed *= 1.5; num(p.x, p.y+0.4, p.z, '💢 RAGE!', 'crit'); W.burst(p.x, p.y, p.z, 0xff3c3c, 30, 3, 0.5, 3, 1, 1.8); sfx('phase'); } }
    return 0; }
  if(e.plateHp > 0 && o.kind!=='poison'){ e.plateHp -= dmg*(dty==='blast' ? 2 : 1); e.flash = Math.max(e.flash, 0.05); if(!quiet) num(p.x,p.y,p.z, 'PLATE', 'blk');
    if(e.plateHp <= 0){ e.plateHp = 0; W.bossPlates(e.mesh, false); W.debris(e.pos.x, 1, e.pos.z, 0x8a94a6, 24, 3.4); W.shock(e.pos.x, e.pos.z, 0xb8c2d0, 2.2, 0.6); W.flash(p.x, p.y, p.z, 0xffffff, 3, 0.3); sfx('shatter'); sfx('heavy'); W.shake(0.3);
      num(p.x, p.y+0.4, p.z, '🛡️ PLATES BROKEN!', 'combo'); toast('🛡️ '+(e.bname||bossInfo().boss)+'\'s armor plates are broken!', 'good'); }
    return 0; }
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
  let armor = e.armor + (e.led ? 3 : 0) - (e.poison && e.poison.corrode ? 4 : 0) - (P && P.includes('shredder') ? 5 : 0);
  let eff = (o.pierce || o.noArmor || o.kind==='poison') ? dmg : Math.max(1, dmg - Math.max(0, armor));
  if(o.assassin && (e.big||e.d.mini||e.armor>=3)) eff *= 2;
  eff = quiet ? eff : Math.round(eff);
  const before = e.hp; e.hp -= eff; e.flash = quiet ? Math.max(e.flash, 0.03) : 0.1; e.hits++;
  if(eff > before) eff = Math.max(1, before);
  if(o.src){ o.src.dmg += eff; tstat(o.src.type).dmg += eff; if(o.crit) tstat(o.src.type).crits++; if(dty && G.phase==='wave') G.dmgWave[dty] = (G.dmgWave[dty]||0) + eff; }
  if(o.crit){ SAVE.stats.crits = (SAVE.stats.crits||0)+1; dEv('crit', 1); }
  if(!quiet){
    if(o.brutal){ o.crit = true; }
    const cls = o.crit ? 'crit' : (o.long ? 'long' : (o.kind==='ice'?'ice':(o.kind==='bolt'?'bolt':(e.guarded?'shd':''))));
    num(p.x,p.y,p.z, o.crit ? Math.round(eff)+'!' : (o.long ? '🔭 '+Math.round(eff) : Math.round(eff)), cls);
    W.flash(p.x, p.y, p.z, o.crit ? 0xffb347 : (KIND_COL[o.kind]||0xffffff), o.crit ? 1.6 : 0.7, o.crit ? 0.22 : 0.12);
    if(o.crit){ W.burst(p.x,p.y,p.z, 0xffb347, 16, 3.2, 0.35, 2.6, 2, 1.8); W.shock(e.pos.x, e.pos.z, 0xffb347, 0.8, 0.3, e.pos.y+0.1); }
    if(eff >= e.maxHp*0.3 || o.crit) sfx(o.crit ? 'acrit' : 'heavy'); else if(o.kind==='phys') sfx('hit');
  }
  if(e.d.clone && !e.cloned && e.hp > 0 && e.hp <= e.maxHp*0.5) cloneImp(e);
  if(P && !quiet && P.includes('deepfreeze') && e.hp > 0 && !e.frozen && Math.random() < 0.08){ freezeOne(e, e.big ? 1.2 : 1.6); num(p.x, p.y+0.3, p.z, '❄️ DEEP FREEZE', 'ice'); }
  if(e.big) bossPhases(e);
  if(e.hp <= 0) kill(e, o.src, o);
  return eff;
}
function goldMul(src){
  const ru = ruleDef();
  return (1 + 0.04*rs('bounty')) * (1 + 0.15*perk('kill_gold')) * (G.waveEv==='rush' ? 1.5 : 1) * (G.waveEv==='moon' ? 1.75 : 1) * ((ru && ru.goldMul) || 1)
    * (src && src.type==='sniper' && hasSyn(src,'invest') ? 2 : 1)
    * (G.waveRisk ? TD.RISK.gold : 1) * (G.secretOpen ? 1.25 : 1) * (G.choice && G.choice.perk==='gold' ? 1.2 : 1) * (G.waveEv==='eclipse' ? 1.5 : 1) * (1 + 0.15*bonus('bounty')) * (G.seasonMod==='harvest' && G.night ? 1.15 : 1);
}
function addCrystals(n){ if(!n) return; G.crystals += n; const el = $('hCry'); if(el){ el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump'); } renderHud(); }
// kill streaks: kills close together keep the streak alive
function streakKill(e){
  if(G.t - G.streakLast <= TD.STREAK_WINDOW) G.streak++; else G.streak = 1;
  G.streakLast = G.t;
  sEv('streak', G.streak);
  const hit = TD.STREAKS.find(x=>x.n===G.streak);
  if(hit){ G.gold += hit.gold; G.earned += hit.gold; if(hit.crystals) addCrystals(hit.crystals);
    const el = $('streakFx'); el.textContent = hit.name; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    toast('🔥 '+hit.name+'!  '+G.streak+' kills  ·  +'+hit.gold+' gold'+(hit.crystals?' +'+hit.crystals+' 💎':''), 'good'); sfx(G.streak>=50 ? 'level' : 'upgrade');
    if(G.streak >= 100){ chMark('streak100'); W.shake(0.4); W.punch(0.6); $('flashFx').classList.remove('go'); void $('flashFx').offsetWidth; $('flashFx').classList.add('go'); }
    const c = G.map.castle.position; W.burst(c.x, 1.5, c.z, 0xffb347, 40+G.streak/2, 4, 1, 3.5, 3, 2.4); }
}
function kill(e, src, o){
  o = o || {};
  e.dead = true; G.kills++; if(src){ src.kills++; tstat(src.type).kills++; }
  let gold = Math.round(e.gold * goldMul(src));
  if(src && TOWERS[src.type].goldOnKill){ gold += TOWERS[src.type].goldOnKill; }
  if(src && tp(src,'bounty')) gold += 3;
  if(e.spirit != null) gold = Math.round(gold*0.5);
  if(src && !isStruct(src)) towerXp(src, e);
  streakKill(e);
  if(++G.killsC % TD.CRYSTALS.perKills === 0) addCrystals(1);
  if(e.d.echo && !e.isEcho){ const ec = spawn('echo', e.pos, e.seg, e.route); ec.isEcho = true; ec.hp = ec.maxHp = Math.round(e.maxHp*0.5); ec.dist = e.dist; ec.mesh.bodyM.opacity = 0.45; ec.gold = Math.round(e.gold*0.5); W.portalFx(e.pos.x, e.pos.z, 0x9ae6ff); num(e.pos.x, e.pos.y+1.2, e.pos.z, '👻 ECHO', 'bolt'); }
  if(e.secret){ G.secretDone = true; SAVE.secretBoss[G.map.id] = true; G.bonusCoins = (G.bonusCoins||0) + 250; addCrystals(3); chMark('secretboss');
    if(!SAVE.skins.owned.includes('ancient_tesla')){ SAVE.skins.owned.push('ancient_tesla'); setTimeout(()=>toast('🗿 Unlocked the Ancient Tesla skin!', 'good'), 1500); }
    showEvBanner({ icon:'🗿', name:'SECRET BOSS SLAIN', desc:e.bname+' falls — +250 coins, +3 💎' }); }
  if(e.big) addCrystals(TD.CRYSTALS.boss); else if(e.d.mini) addCrystals(TD.CRYSTALS.miniboss);
  if(G.mode!=='bossrush'){ if(e.type==='airboss'){ addCores(TD.CORES.airboss, 'air boss down'); chMark('airboss'); } else if(e.big && !e.secret) addCores(TD.CORES.boss); else if(e.d.mini){ addCores(TD.CORES.mini); } }
  if(e.d.mini){ SAVE.stats.minis = (SAVE.stats.minis||0) + 1; if(G.robot) dropPickup(e.pos.x, e.pos.z, 'crystal', 1); }
  if(e.secret) addCores(TD.CORES.secretBoss, 'secret boss');
  // loot for the robot
  if(G.robot && !e.d.mini && e.type!=='splitling' && e.type!=='swarmling'){ if(e.big){ for(let i=0;i<3;i++) dropPickup(e.pos.x+(Math.random()-0.5)*1.2, e.pos.z+(Math.random()-0.5)*1.2, 'gold', Math.round(10 + G.wave)); dropPickup(e.pos.x, e.pos.z, 'crystal', 1); }
    else if(Math.random() < TD.ROBOT.drop) dropPickup(e.pos.x, e.pos.z, Math.random() < 0.05 ? 'crystal' : 'gold', Math.round(3 + G.wave*0.7)); }
  // infectors burst into spores
  if(e.d.infect){ let n = 0; for(const o of G.enemies){ if(n >= 3) break; if(o.dead || o===e || !canInfect(o)) continue; if(o.pos.distanceTo(e.pos) <= 1.8){ infect(o, e); n++; } } W.burst(e.pos.x, 0.6, e.pos.z, 0x9dff5a, 40, 3, 0.8, 3.5, -1, 2); }
  // sun strikes recharge faster when enemies die nearby
  for(const t of G.towers){ if(t.type==='solar' && Math.hypot(t.x-e.pos.x, t.z-e.pos.z) <= 5) t.cool -= 0.3; }
  sEv('kill', 1); if(G.night) sEv('night', 1); if(e.big) sEv('boss', 1);
  // banks tax kills nearby
  for(const b of G.towers){ if(b.type!=='bank') continue; if(Math.hypot(b.x-e.pos.x, b.z-e.pos.z) > stat(b,'range')) continue;
    const u = ultOf(b); let tax = Math.round(stat(b,'tax')); if(u && u.mod.taxAdd) tax += u.mod.taxAdd; gold += tax; b.dmg += tax; }
  if(perk('lucky') && Math.random() < 0.12){ gold += 25; num(e.pos.x, e.pos.y+1.3, e.pos.z, '🍀 +25', 'gold'); }
  G.gold += gold; G.earned += gold;
  SAVE.stats.kills++; if(src){ SAVE.stats.killsBy[src.type] = (SAVE.stats.killsBy[src.type]||0)+1; const mk = TD.ultKey(src.type); SAVE.mastery[mk] = (SAVE.mastery[mk]||0)+1; }
  if(o.hero){ G.heroKills++; SAVE.stats.heroKills = (SAVE.stats.heroKills||0)+1; heroXp(1); }
  if(G.night){ SAVE.stats.nightKills = (SAVE.stats.nightKills||0)+1; }
  dEv('kill', 1, { tower: src && src.type, enemy: e.type });
  if(e.ghost) SAVE.stats.ghosts++;
  const c = e.mesh.baseColor ? e.mesh.baseColor.getHex() : e.d.color, big = e.big||e.d.mini, hy = e.pos.y+e.d.size*1.4;
  if(e.big && e.isClone){ G.bossAlive--; W.shake(0.3); W.punch(0.3); W.shock(e.pos.x, e.pos.z, 0x9a7aff, 2.4, 0.6); toast('👥 '+e.bname+' dissolves', 'good'); }
  else if(e.big){ SAVE.stats.bosses++; G.bossAlive--; dEv('boss', 1); if(G.t - e.born <= 20) chMark('speedboss'); bossDeath(e); }
  if(e.d.mini){ G.bossAlive--; W.shake(0.3); W.punch(0.4); }
  if(e.type==='commander'){ toast('👑 Commander down — the enemy loses its bonus!', 'good'); W.shock(e.pos.x, e.pos.z, 0xffc857, 3, 0.7); }
  if(e.charged > 0) W.charged(e.mesh, false);
  G.waveDone = (G.waveDone||0) + 1;
  if(e.elite) SAVE.stats.elites = (SAVE.stats.elites||0) + 1; if(e.mutated) SAVE.stats.mutants = (SAVE.stats.mutants||0) + 1;
  if(e.splitN){ for(let i=0;i<e.splitN;i++){ const m = spawn(e.type==='grunt' ? 'grunt' : 'splitling', e.pos, e.seg, e.route, { plain:true }); m.hp = m.maxHp = Math.round(e.maxHp*0.2); m.dist = e.dist - 0.15*i; m.scale = 0.8; m.pos.x += (Math.random()-0.5)*0.35; m.pos.z += (Math.random()-0.5)*0.35; if(e.sab) m.sab = null; }
    W.burst(e.pos.x, 0.5, e.pos.z, 0x9dff5a, 34, 3, 0.6, 3, 2, 1.8); num(e.pos.x, e.pos.y+1.2, e.pos.z, '☣️ SPLIT', 'heal'); }
  if(e.big && e.final) chMark('finalform');
  // v8 death effects
  if(e.d.deathBlast || e.affix==='volatile') volatileBlast(e);
  if(e.d.possess && e.spirit == null) spawnSpirit(e);
  for(const v of G.enemies){ if(v.dead || v===e || v.affix!=='vampiric' || v.hp >= v.maxHp) continue; if(v.pos.distanceToSquared(e.pos) > 4) continue; const a = Math.round(v.maxHp*0.2); v.hp = Math.min(v.maxHp, v.hp + a); W.bolt(headPos(e).clone(), headPos(v).clone(), 0xd8203a, 0.04, true); num(v.pos.x, v.pos.y+1.1, v.pos.z, '🩸 +'+a, 'heal'); }
  if(e.big || e.d.mini){ for(const t of G.towers) if(tp(t,'frenzy')){ t.frenzyT = 10; W.flash(t.x, 1.2, t.z, 0xffe14b, 1.2, 0.3); } }
  if(e.big && !e.isClone) bossDown(e);
  if(G.selE===e){ G.selE = null; W.hideMarker(); renderPanel(); }
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
  toast((e.secret?'🗿 ':'👑 ')+(e.bname||bossInfo().boss)+' defeated!', 'good');
}
function bossPhases(e){
  const r = e.hp/e.maxHp;
  while(e.phase < TD.BOSS_STAGES.length && r <= TD.BOSS_STAGES[e.phase].at){
    const ph = TD.BOSS_STAGES[e.phase]; e.phase++; e.stage = ph.stage;
    const nm = e.bname || bossInfo().boss;
    if(ph.kind==='enrage'){ e.enraged = true; e.speed *= 1.2; e.armor += 2;
      W.shock(e.pos.x, e.pos.z, 0xff2020, 2.6, 0.6); W.burst(e.pos.x, 1, e.pos.z, 0xff3030, 50, 4, 0.8, 4, 2, 2);
      const guard = G.mode==='bossrush' ? [] : (G.wave >= 20 ? ['knight','brute','grunt','knight'] : ['grunt','knight','grunt']);
      guard.forEach((k,i)=>{ const m = spawn(k, e.pos, e.seg, e.route, { plain:true }); m.dist = e.dist - 0.15*(i+1); m.pos.x += (Math.random()-0.5)*0.4; m.pos.z += (Math.random()-0.5)*0.4; });
      W.portalFx(e.pos.x, e.pos.z, 0xff3c3c); }
    else if(ph.kind==='emp'){
      const ts = G.towers.filter(t=>t.dis<=0 && !TOWERS[t.type].onPath).sort((a,b)=>Math.hypot(a.x-e.pos.x, a.z-e.pos.z) - Math.hypot(b.x-e.pos.x, b.z-e.pos.z)).slice(0, 4);
      ts.forEach(t=>{ disableTower(t, 3, 'emp'); W.bolt(headPos(e).clone(), new (window.THREE.Vector3)(t.x, 1, t.z), 0xff3cf0, 0.07, true); });
      G.towers.forEach(t=>{ if(t.charge){ t.charge *= 0.6; } if(t.ultReady){ t.ultReady = false; t.charge = (ultDef(t)||{need:0}).need*0.6; W.ultReady(t.mesh, false); } });
      e.bshield = Math.round(e.maxHp*0.1); e.bshieldT = 5; W.bubble(e.mesh, true);
      W.bossTransform(e.mesh, e.type==='megaboss' ? 0xff3c1a : 0xff3cf0); e.scale *= 1.1; e.grow = Math.min(e.grow, 0.6); e.speed *= 1.05; e.mesh.baseColor.lerp(new (window.THREE.Color)(0x3a0a3a), 0.35);
      W.shock(e.pos.x, e.pos.z, 0xff3cf0, 5, 0.9); W.shock(e.pos.x, e.pos.z, 0x2ef2ff, 3.4, 0.6); W.flash(e.pos.x, 1.2, e.pos.z, 0xff3cf0, 6, 0.5); sfx('emp');
      $('flashFx').classList.remove('bolt'); void $('flashFx').offsetWidth; $('flashFx').classList.add('bolt'); renderUltBtn(); }
    else if(ph.kind==='final') finalForm(e);
    showEvBanner({ icon:ph.icon, name:'STAGE '+TD.ROMAN[ph.stage-1]+' · '+ph.name, desc:nm+' '+ph.text });
    sfx('phase'); W.shake(ph.kind==='final' ? 0.7 : 0.3); W.punch(ph.kind==='final' ? 0.8 : 0.35);
    const mk = $('bbPh'+e.phase); if(mk) mk.classList.add('hit');
    if(G.boss===e) $('bbStage').textContent = 'STAGE '+TD.ROMAN[ph.stage-1];
  }
  bossTraitHp(e);
}
// the last stage: bigger, faster, tougher, with elite escorts and darker music
function finalForm(e){
  e.final = true; e.speed *= 1.2; e.armor += 2; e.scale *= 1.22; e.grow = 0.35; e.skillT = Math.min(e.skillT, 1.5);
  W.bossFinal(e.mesh); G.slowmo = Math.max(G.slowmo, 0.8); $('app').classList.add('finalForm');
  $('flashFx').classList.remove('go'); void $('flashFx').offsetWidth; $('flashFx').classList.add('go');
  for(let i=0;i<3;i++) setTimeout(()=>W.shock(e.pos.x, e.pos.z, i===1?0xffffff:0xff3c1a, 3+i*1.5, 0.8), i*150);
  W.burst(e.pos.x, 1.2, e.pos.z, 0xff5a1a, 140, 5.5, 1.2, 4.5, -1, 2.4); W.debris(e.pos.x, 0.5, e.pos.z, 0x3a2a2a, 20, 4);
  (G.mode==='bossrush' ? [] : (G.wave >= 20 ? ['knight','brute','runner'] : ['knight','runner'])).forEach((k,i)=>{ const m = spawn(k, e.pos, e.seg, e.route, G.wave >= 20 ? { elite:true, escort:true } : { plain:true }); m.dist = e.dist - 0.25*(i+1); });
  sfx('bossin'); sfx('bigboom');
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
  const sk = e.type==='airboss' ? 'dive' : (e.secret ? ['stomp','ice','emp','rewind'][e.skillN % 4] : (e.type==='megaboss' ? ['stomp','emp','lava'][e.skillN % 3] : (bossInfo().bossSkill || 'stomp')));
  let k = sk; if(k==='warden') k = ['stomp','ice','portal'][e.skillN % 3]; if(k==='nexus') k = ['lava','emp','portal'][e.skillN % 3]; e.skillN++;
  const def = TD.BOSS_SKILLS[k] || TD.BOSS_SKILLS[sk];
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
  }else if(k==='rewind'){
    W.shock(p.x, p.z, 0x2ef2ff, 3, 0.8); W.shock(p.x, p.z, 0xffffff, 2, 0.5); $('warpFx').classList.add('show'); setTimeout(()=>{ if(G.timewarp<=0) $('warpFx').classList.remove('show'); }, 900);
    const heal = o=>{ const a = Math.round(o.maxHp*(o===e ? 0.08 : 0.12)); o.hp = Math.min(o.maxHp, o.hp + a); W.burst(o.pos.x, o.pos.y+0.6, o.pos.z, 0x2ef2ff, 8, 1.4, 0.5, 2.2, -1, 1.2); };
    heal(e); for(const o of G.enemies){ if(!o.dead && o!==e && o.pos.distanceTo(e.pos) < 3) heal(o); } sfx('portal');
  }else if(k==='dive'){
    const ts = towersNear(p.x, p.z, 3.2).filter(t=>t.dis<=0).sort(()=>Math.random()-0.5).slice(0, 3);
    ts.forEach((t,i)=>{ const mesh = W.projMesh('meteor'); mesh.scale.setScalar(0.45); mesh.position.copy(hp);
      G.projs.push({ kind:'meteor', mesh, from:hp.clone(), to:new (window.THREE.Vector3)(t.x, 0.3, t.z), t:-i*0.18, dur:0.7, lava:true, bomb:true, tower:t, dmg:0, splash:0 }); });
    W.shock(p.x, p.z, 0x9ffcff, 2.4, 0.5); sfx('meteor'); W.shake(0.2);
  }else if(k==='emp'){
    W.shock(p.x, p.z, 0xff3cf0, 3.4, 0.7); W.shock(p.x, p.z, 0x2ef2ff, 2.4, 0.5); W.flash(p.x, 1, p.z, 0xff3cf0, 5, 0.4);
    towersNear(p.x, p.z, 3.4).forEach(t=>disableTower(t, 1.8, 'emp')); e.invisT = 2.2; sfx('emp'); W.shake(0.3); W.punch(0.4);
  }
  toast((e.secret?'🗿 ':'👑 ')+(e.bname||bossInfo().boss)+': '+def.icon+' '+def.name+'!', 'bad');
  $('bbSkill').textContent = def.icon+' '+def.name; $('bossBar').classList.remove('cast'); void $('bossBar').offsetWidth; $('bossBar').classList.add('cast');
}
function showBossBar(e){
  const def = TD.BOSS_SKILLS[bossSkillKey(e)];
  $('bbName').textContent = (e.secret?'🗿 ':(e.type==='airboss'?'🚁 ':(e.type==='megaboss'?'🗻 ':'👑 ')))+(e.bname||bossInfo().boss); $('bbSkill').textContent = e.secret ? '🗿 Secret boss — every move, plus takeover' : (e.type==='airboss' ? '🌪️ Wind Shield −50% · ground it with ❄️ + ⚡ (or 🌀) · '+def.icon+' '+def.name : def.icon+' '+def.name+' — '+def.desc);
  [1,2,3].forEach(i=>$('bbPh'+i).classList.toggle('hit', (e.phase||0) >= i)); $('bbStage').textContent = 'STAGE '+TD.ROMAN[(e.stage||1)-1]; $('bbLv').textContent = 'Lv '+(e.level||G.wave);
  $('bbTraits').innerHTML = (e.traits||[]).map(k=>{ const B = TD.BOSS_TRAITS[k]; return '<span title="'+B.desc+'">'+B.icon+' '+B.name+'</span>'; }).join('') + (e.isClone ? '' : '<span class="wk" title="Exposed every '+TD.BOSS_UNIVERSAL.weakEvery+'s for '+TD.BOSS_UNIVERSAL.weakT+'s">🎯 Weak point</span>');
  $('bossBar').classList.add('show'); $('app').classList.add('bossOn'); updateBossBar();
}
function hideBossBar(){ $('bossBar').classList.remove('show'); $('app').classList.remove('bossOn'); $('app').classList.remove('finalForm'); }
function updateBossBar(){
  const e = G.boss; if(!e) return;
  if(e.dead){ G.boss = G.enemies.find(o=>!o.dead && o.big) || null; if(!G.boss){ hideBossBar(); return; } showBossBar(G.boss); if(!G.boss.final) $('app').classList.remove('finalForm'); }
  const b = G.boss; $('bbFill').style.width = Math.max(0, b.hp/b.maxHp*100).toFixed(1)+'%';
  const shv = (b.bshield>0 ? b.bshield : 0) + (b.plateHp||0); $('bbShield').style.width = shv>0 ? Math.min(100, shv/b.maxHp*100/0.3).toFixed(1)+'%' : '0%'; $('bossBar').classList.toggle('weak', b.weakT > 0);
  $('bbHp').textContent = Math.max(0, Math.ceil(b.hp)).toLocaleString('en-US')+' / '+b.maxHp.toLocaleString('en-US');
}

// ---- frost: chill stacks up until the enemy freezes solid ----
function applySlow(e, s, t, src){
  if(e.armorT==='frostproof') return;
  if(e.gShield) airTag(e, 'gIce');
  e.slow = Math.max(e.slow, s); e.slowT = Math.max(e.slowT, t);
  if(!src) return;
  if(e.freezeImm > 0 || e.frozen > 0) return;
  e.chill++;
  const need = Math.max(2, Math.round(stat(src,'stacks')||6));
  if(e.chill >= need){ e.chill = 0; freezeOne(e, stat(src,'freezeT')||1); e.freezeImm = e.big ? 5 : 2.2; if(flag(src,'brittle')) e.brittle = true; sfx('shatter'); }
}
function freezeOne(e, t){
  if(e.armorT==='frostproof'){ num(e.pos.x, e.pos.y+1, e.pos.z, '❄️ IMMUNE', 'blk'); return; }
  if(e.gShield) airTag(e, 'gIce');
  if(e.big) t *= e.enraged ? 0.35 : 0.5;
  if(e.frozen <= 0){ SAVE.stats.frozen++; dEv('frozen', 1); }
  e.frozen = Math.max(e.frozen, t); e.chill = 0;
  W.burst(e.pos.x, e.pos.y+0.4, e.pos.z, 0xbdf3ff, 14, 1.8, 0.6, 2.4, 1, 1.4); W.debris(e.pos.x, e.pos.y+0.4, e.pos.z, 0xdff6ff, 5, 1.6);
  W.shock(e.pos.x, e.pos.z, 0xbdf3ff, 0.8, 0.35);
}
// ---- venom: poison stacks tick through armor ----
function applyPoison(e, src, n){
  if(!src || e.dead || e.infected) return;
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
  if(e.dead || e.air || e.kbImm > 0 || e.d.charge || e.d.kbImm) return false;
  const k = e.big ? 0.25 : (e.d.mini||e.type==='commander' ? 0.5 : 1);
  retreat(e, amt*k); e.kbImm = 1.1; return true;
}
function recoil(t, a){ t.recoil = Math.max(t.recoil, a); }
function nearestVenom(t){ let best = null, bd = 99; for(const o of G.towers){ if(o.type!=='venom') continue; const d = Math.max(Math.abs(o.cx-t.cx), Math.abs(o.cz-t.cz)); if(d < bd){ bd = d; best = o; } } return best; }
function fire(t, e){
  const d = TOWERS[t.type], dmg = stat(t,'dmg'), m = muzzleWorld(t); t.shots++; tstat(t.type).shots++;
  chargeUlt(t, 1);
  const sm = synMul();
  if(d.proj==='arrow' || d.proj==='ice' || d.proj==='venom'){
    // Volley ultimate: three arrows at three different enemies
    let targets = [e];
    const vol = d.proj==='arrow' ? (flag(t,'volley') || d.volley || 0) : 0;
    if(vol){ const r = stat(t,'range'); const others = G.enemies.filter(o=>!o.dead && !o.invis && o!==e && canHit(t,o) && inRange(t,o,r)).sort((a,b)=>b.dist-a.dist); targets = [e].concat(others.slice(0, vol-1)); while(targets.length < vol) targets.push(e); }
    const critMul = hasSyn(t,'spotter') ? 3.0 : d.critMul;
    for(let tg of targets){
      const mg = magnetFor(tg); if(mg){ tg = mg; if(Math.random() < 0.3) num(mg.pos.x, mg.pos.y+1.2, mg.pos.z, '🧲', 'bolt'); }
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
      fireGround: t.shots % every === 0 && !d.hybrid, fireT: stat(t,'fireT')||2, napalm:!!flag(t,'napalm'), cluster:flag(t,'cluster')||0, cold: hasSyn(t,'thermal') ? 1 + 0.4*sm : 0,
      chainBurst: d.chainBurst||0, freezeSplash: d.freezeSplash||0,
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
      const circ = (cur.frozen > 0 || cur.slow > 0) && !cur.dead;
      hit(cur, Math.round(dmg*Math.pow(fall,i)*(circ ? 1.4*comboMul() : 1)), { kind:'bolt', src:t, cold });
      if(circ && !cur.dead){ if(cur.charged <= 0){ W.charged(cur.mesh, true); combo('circuit', cur, i===0 ? '❄️⚡ CHARGED' : null); } cur.charged = 3; }
      if(d.chillHit && !cur.dead) for(let k=0;k<d.chillHit;k++) applySlow(cur, stat(t,'slow'), stat(t,'slowT'), t);
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
    if(e.frozen > 0 && k < 3){ crit = true; k = 3*comboMul(); combo('icepick', e); }
    if(!crit && d.critChance && Math.random() < stat(t,'critChance')){ crit = true; k = d.critMul || 2; }
    // long shot: the further the target, the harder it hits
    const r = stat(t,'range'), far = Math.hypot(e.pos.x-t.x, e.pos.z-t.z)/r, lb = 1 + (d.longShot||0)*clamp((far-0.4)/0.55, 0, 1), long = lb > 1.35;
    W.bolt(m, p, crit?0xff7a7a:(long?0xffe27a:0xffd0d0), crit?0.07:(long?0.05:0.03), false); W.burst(p.x,p.y,p.z, 0xffffff, crit?22:10, 2.4, 0.25, 2.2, 0, 1.6);
    W.burst(m.x, m.y, m.z, 0xffb347, 6, 1.5, 0.2, 1.6, 0, 1); W.flash(m.x, m.y, m.z, 0xffd0a0, 1.2, 0.12);
    if(flag(t,'mark') || d.mark){ e.marked = 4; }
    hit(e, Math.round(dmg*k*lb), { kind:'phys', pierce:true, src:t, assassin:!!flag(t,'assassin'), crit, long: long && !crit }); sfx(crit?'crit':(long?'long':'snipe'));
    // Execute ultimate
    const ex = flag(t,'execute');
    if(ex && !e.dead && !e.big && !e.d.mini && e.hp/e.maxHp < ex){ num(p.x, p.y+0.4, p.z, '☠️ EXECUTE', 'crit'); W.flash(p.x, p.y, p.z, 0xff3c3c, 1.6, 0.25); hit(e, e.hp+1, { kind:'phys', pierce:true, src:t }); }
    recoil(t, 0.2); if(crit||long) W.shake(crit?0.1:0.05);
  }else if(d.proj==='paradox'){
    fireParadox(t, e);
  }else if(d.proj==='gust'){
    const R = stat(t,'gustR')||0.9, push = stat(t,'push')||0.7, venom = hasSyn(t,'toxic') ? nearestVenom(t) : null;
    const tp = e.pos.clone();
    W.bolt(m, new (window.THREE.Vector3)(tp.x, 0.5, tp.z), 0xe8fffb, 0.08, false); W.shock(tp.x, tp.z, 0xe8fffb, R*1.2, 0.4); W.burst(tp.x, 0.4, tp.z, 0xe8fffb, 16, 3, 0.4, 2.6, 0, 0.6);
    let n = 0;
    const hitL = G.enemies.filter(o=>!o.dead && !o.invis && canHit(t,o) && Math.hypot(o.pos.x-tp.x, o.pos.z-tp.z) <= R + o.d.size);
    const burning = hitL.find(o=>o.burn > 0);
    if(burning && hitL.length > 1){ const bd = Math.max(burning.burnDps, dmg*0.8)*comboMul(); hitL.forEach(o=>{ if(o!==burning) setBurn(o, 3, bd); W.burst(o.pos.x, o.pos.y+0.4, o.pos.z, 0xff7a2a, 8, 2, 0.4, 2.4, 1, 1.4); }); combo('firestorm', burning); }
    for(const o of hitL){
      hit(o, dmg, { kind:'phys', src:t, gust:true }); if(o.dead) continue;
      const p2 = o.air ? 0 : push; if(p2 && knock(o, p2)) n++;
      if(o.air && flag(t,'air')) o.slowT = Math.max(o.slowT, 1), o.slow = Math.max(o.slow, 0.4);
      if(flag(t,'winded')) o.winded = 3;
      if(venom) applyPoison(o, venom, 1);
      if(d.poisonAll) applyPoison(o, t, 1); }
    if(n) num(tp.x, 1.1, tp.z, '💨', 'ice');
    const tn = flag(t,'tornado'); if(tn && t.shots % tn === 0) spawnTornado(e);
    sfx('storm'); recoil(t, 0.08);
  }
}
// ---- combo payloads ----
function shatterFx(e, p){
  const x = e.pos.x, z = e.pos.z; SAVE.stats.triples = (SAVE.stats.triples||0) + 1;
  W.burst(x, 0.6, z, 0xdff6ff, 70, 4.5, 0.8, 4, 2, 2.2); W.debris(x, 0.6, z, 0xbdf3ff, 16, 3.4); W.shock(x, z, 0x9ffcff, 2, 0.6); W.flash(x, 0.8, z, 0xffffff, 4, 0.4); W.punch(0.25); W.shake(0.15); sfx('shatter'); sfx('bigzap');
  for(const o of G.enemies){ if(o.dead || o===e) continue; if(Math.hypot(o.pos.x-x, o.pos.z-z) <= 1.3) hit(o, p.dmg*0.6*comboMul(), { kind:'ice', src:p.src }); }
  combo('shatter', e, '💥 TRIPLE COMBO!'); if(SAVE.stats.triples % 5 === 0) chCheck();
}
function toxicBlast(e, src){
  const P = e.poison, dmg = P.dps*P.stacks*Math.max(1, P.t)*0.7*comboMul(); e.poison = null;
  W.burst(e.pos.x, 0.5, e.pos.z, 0x9dff5a, 60, 3.6, 0.8, 3.5, 2, 2); W.shock(e.pos.x, e.pos.z, 0x9dff5a, 1.8, 0.6); sfx('heal'); sfx('boom');
  G.fires.push({ x:e.pos.x, z:e.pos.z, r:1.1, t:2.5, dps:P.dps*2, src:P.src, tick:0, toxic:true, mesh:W.firePatch(e.pos.x, e.pos.z, 1.1, 0x6ad83a) });
  for(const o of G.enemies){ if(o.dead) continue; if(o.pos.distanceTo(e.pos) <= 1.4) hit(o, dmg, { kind:'poison', src:P.src||src }); }
  combo('toxicblast', e);
}
// the Paradox tower: hit now, and again from the past a second later
function fireParadox(t, e){
  const d = TOWERS[t.type], dmg = stat(t,'dmg'), m = muzzleWorld(t), p = headPos(e).clone();
  W.bolt(m, p, 0x2ef2ff, 0.06, true); W.flash(p.x, p.y, p.z, 0x2ef2ff, 1.4, 0.2); W.shock(e.pos.x, e.pos.z, 0x2ef2ff, 0.8, 0.4, e.pos.y+0.1);
  hit(e, dmg, { kind:'bolt', src:t });
  if(!e.dead){ e.slow = Math.max(e.slow, 0.3); e.slowT = Math.max(e.slowT, 1.5); const st = flag(t,'stasis'); if(st) e.stun = Math.max(e.stun, e.big ? st*0.3 : st); }
  const n = flag(t,'echoes') || 1, mul = flag(t,'echoMul') || 1, fr = flag(t,'fracture') || 0;
  for(let i=1;i<=n;i++) G.echoes.push({ t:i*1.0, e, dmg:dmg*mul, src:t, fr, x:e.pos.x, z:e.pos.z });
  sfx('portal'); recoil(t, 0.05);
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
  const maxRamp = flag(t,'ramp') || d.ramp || 2.2; t.ramp = Math.min(maxRamp, t.ramp + dt*heatRate*(maxRamp-1)/2.2);
  if(t.deathRay > 0){ t.deathRay -= dt; t.ramp = maxRamp; }
  chargeUlt(t, dt);
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
    if(!e.dead && e.frozen > 0 && !d.beamSlow && !(e.steamT > G.t)){ e.steamT = G.t + 1.5; e.frozen = 0; const b = stat(t,'dmg')*t.ramp*1.5*comboMul();
      W.burst(e.pos.x, e.pos.y+0.5, e.pos.z, 0xffffff, 40, 3, 0.7, 4, -1, 2); W.shock(e.pos.x, e.pos.z, 0xdff6ff, 1.2, 0.4); sfx('shatter');
      for(const o of G.enemies){ if(o.dead) continue; if(o.pos.distanceTo(e.pos) <= 0.9) hit(o, b, { kind:'fire', src:t }); } combo('steam', e); }
    if(d.beamSlow && !e.dead){ e.slow = Math.max(e.slow, d.beamSlow); e.slowT = Math.max(e.slowT, 0.4);
      if(heat > 0.9 && e.freezeImm <= 0 && e.frozen <= 0){ freezeOne(e, 0.8); e.freezeImm = e.big ? 5 : 2; } }
    if(d.fireTrail && i===0){ t.trailT = (t.trailT||0) - dt; if(t.trailT <= 0 && !e.air){ t.trailT = 0.7; G.fires.push({ x:e.pos.x, z:e.pos.z, r:0.55, t:2.2, dps:dps*0.45, src:t, tick:0, mesh:W.firePatch(e.pos.x, e.pos.z, 0.55) }); } }
    if(melt){ for(const o of G.enemies){ if(o.dead||o===e) continue; if(o.pos.distanceTo(e.pos) < 1.0) hit(o, dps*dt*0.3, { kind:'fire', src:t }); } if(Math.random()<dt*12) W.shock(e.pos.x, e.pos.z, 0xff7a2a, 1.0, 0.3); }
    if(Math.random() < dt*(10+heat*20)) W.burst(hp.x, hp.y, hp.z, heat>0.8?0xffffff:d.accent, 2, 1.2+heat, 0.25, 1.8, 0, 1.4);
    if(Math.random() < dt*8) W.flash(hp.x, hp.y, hp.z, _beamCol.getHex(), 0.5+heat*0.9, 0.1);
  }
  if(t.mesh.glow){ t.mesh.glow.material.opacity = 0.5 + heat*0.5; t.mesh.glow.scale.setScalar(1.2 + heat*1.2); }
  t.accT += dt; if(t.accT >= 0.5){ if(t.acc > 0 && t.target && !t.target.dead) num(t.target.pos.x, t.target.pos.y+t.target.d.size*1.4, t.target.pos.z, Math.round(t.acc)+(heat>0.95?' 🔥':''), 'beam'); t.acc = 0; t.accT = 0; sfx('laser'); }
}

// ---- charged tower ultimates -----------------------------------------
function ultDef(t){ return TD.ULTS[TD.ultKey(t.type)]; }
function chargeUlt(t, n){
  const u = ultDef(t); if(!u || t.ultReady || t.jammed) return;
  t.charge = (t.charge||0) + n*(1 + 0.25*rs('overclock'));
  if(t.charge >= u.need){ t.charge = u.need; t.ultReady = true; W.ultReady(t.mesh, true, TOWERS[t.type].accent); W.flash(t.x, 1.9, t.z, 0xffe27a, 1.6, 0.4);
    if(SAVE.autoUlt){ setTimeout(()=>{ if(t.ultReady && G.towers.includes(t) && G.phase==='wave') unleash(t); }, 300); }
    else if(G.t - (G.ultToastT||-9) > 6){ G.ultToastT = G.t; toast('⚡ ULTIMATE READY — '+TOWERS[t.type].icon+' '+u.name+' (tap the tower)', 'good'); sfx('coin'); }
    if(G.sel===t) renderPanel(); renderUltBtn(); }
}
function unleash(t){
  if(t && t.jammed && t.ultReady){ toast('📡 Jammed! A Jammer\'s EMP field blocks this ultimate', 'bad'); sfx('nope'); return false; }
  if(!t || !t.ultReady || t.dis > 0 || t.hijack > 0) { sfx('nope'); return false; }
  const key = TD.ultKey(t.type), u = TD.ULTS[key], dmg = stat(t,'dmg') || 50, r = stat(t,'range') || 3;
  const inR = (rad)=>G.enemies.filter(e=>!e.dead && Math.hypot(e.pos.x-t.x, e.pos.z-t.z) <= rad + e.d.size);
  t.ultReady = false; t.charge = 0; W.ultReady(t.mesh, false); tstat(t.type).ults++;
  SAVE.stats.ults = (SAVE.stats.ults||0)+1; sEv('ult', 1);
  // mastery 10: the ultimate becomes a master ultimate
  const MU = mastery(key) >= 10 && TD.MASTER_ULTS[key], M = MU ? 1.5 : 1;
  if(MU){ chMark('master'); W.shock(t.x, t.z, 0xffe27a, 4, 0.9); W.burst(t.x, 1.4, t.z, 0xffe27a, 80, 5, 1, 4, 2, 2.4); }
  chCheck();
  showEvBanner({ icon:MU ? '🎖️' : u.icon, name:(MU ? 'MASTER: '+MU : u.name).toUpperCase()+'!', desc:TOWERS[t.type].name+(MU ? ' unleashes its MASTER ultimate' : ' unleashes its ultimate') });
  W.shock(t.x, t.z, TOWERS[t.type].accent, 2.2, 0.6); W.flash(t.x, 1.2, t.z, 0xffffff, 3, 0.4); W.punch(0.4); W.shake(0.25);
  const V = window.THREE.Vector3;
  if(key==='archer'){
    for(let v=0; v<(MU ? 5 : 3); v++) setTimeout(()=>{ if(G.over) return; for(const e of inR(r*(MU ? 1.3 : 1))){ if(e.ghost) continue; const p = headPos(e).clone();
        W.bolt(new V(p.x+(Math.random()-0.5)*0.6, 6, p.z+(Math.random()-0.5)*0.6), p, MU ? 0xffe27a : 0xffe6a0, 0.05, false); hit(e, dmg*1.8*M, { kind:'phys', src:t }); } sfx('arrow'); }, v*280);
  }else if(key==='cannon'){
    let best = null, bn = -1; for(const e of inR(r)){ if(e.air) continue; const n = G.enemies.filter(o=>!o.dead && o.pos.distanceTo(e.pos) < 1.5).length; if(n > bn){ bn = n; best = e; } }
    if(MU){ const extra = G.enemies.filter(e=>!e.dead && !e.air && e!==best).sort((a,b)=>b.dist-a.dist).slice(0, 2);
      extra.forEach((x,i)=>setTimeout(()=>{ if(G.over) return; const c2 = x.pos.clone(); W.burst(c2.x, 0.4, c2.z, 0xff8c42, 90, 5, 1, 5, 5, 2); W.shock(c2.x, c2.z, 0xff8c42, 3, 0.8); W.flash(c2.x, 0.8, c2.z, 0xffb347, 6, 0.5); W.debris(c2.x, 0.3, c2.z, 0x5a4a48, 20, 4);
        for(const e of G.enemies){ if(e.dead||e.ghost) continue; if(Math.hypot(e.pos.x-c2.x, e.pos.z-c2.z) <= 2.5) hit(e, dmg*5, { kind:'meteor', src:t }); } sfx('bigboom'); W.shake(0.5); }, 350*(i+1))); }
    const c = best ? best.pos.clone() : new V(t.x, 0, t.z);
    W.burst(c.x, 0.4, c.z, 0xff8c42, 140, 6, 1, 5, 5, 2); W.burst(c.x, 0.3, c.z, 0xffe14b, 60, 4, 0.8, 4, 4, 2); W.shock(c.x, c.z, 0xff8c42, 3.2, 0.8); W.shock(c.x, c.z, 0xffffff, 2, 0.5); W.flash(c.x, 0.8, c.z, 0xffb347, 7, 0.6); W.debris(c.x, 0.3, c.z, 0x5a4a48, 30, 5);
    for(const e of G.enemies){ if(e.dead||e.ghost) continue; if(Math.hypot(e.pos.x-c.x, e.pos.z-c.z) <= 2.5) hit(e, dmg*5, { kind:'meteor', src:t }); }
    sfx('bigboom'); W.shake(0.6);
  }else if(key==='frost'){
    for(const e of (MU ? G.enemies.filter(x=>!x.dead) : inR(r*2))){ freezeOne(e, MU ? 3 : 2.5); if(MU) hit(e, dmg*3, { kind:'ice', src:t }); } W.shock(t.x, t.z, 0xbdf3ff, MU ? 12 : r*2, 0.9); if(MU){ $('flashFx').classList.remove('go'); void $('flashFx').offsetWidth; $('flashFx').classList.add('go'); } W.burst(t.x, 1, t.z, 0xbdf3ff, 120, 6, 1, 4, 1, 2.4); sfx('freeze');
  }else if(key==='tesla'){
    const storm = ()=>{ let cur = null, bd = -1; for(const e of G.enemies){ if(!e.dead && !e.invis && e.dist > bd){ bd = e.dist; cur = e; } }
      const done = new Set(); let from = muzzleWorld(t);
      for(let i=0;i<(MU ? 40 : 20) && cur;i++){ const p = headPos(cur).clone(); W.bolt(from, p, 0xffffff, 0.1, true); W.burst(p.x,p.y,p.z, 0x9ffcff, 14, 2.4, 0.35, 2.6, 0, 1.6);
        hit(cur, dmg*4*M*Math.pow(0.93, i), { kind:'bolt', src:t }); if(MU && !cur.dead) cur.stun = Math.max(cur.stun, cur.big ? 0.3 : 1); done.add(cur);
        let next = null, nd = 1e9; for(const o of G.enemies){ if(o.dead||done.has(o)) continue; const dd = o.pos.distanceToSquared(cur.pos); if(dd<nd){ nd=dd; next=o; } }
        if(!next || nd > (MU ? 8 : 6)**2) break; from = p; cur = next; }
      sfx('bigzap'); };
    storm(); if(MU){ later(0.6, ()=>{ if(!G.over) storm(); }); $('flashFx').classList.remove('bolt'); void $('flashFx').offsetWidth; $('flashFx').classList.add('bolt'); }
  }else if(key==='sniper'){
    const tg = G.enemies.filter(e=>!e.dead).sort((a,b)=>b.hp-a.hp).slice(0, MU ? 6 : 3);
    tg.forEach((e,i)=>setTimeout(()=>{ if(e.dead||G.over) return; const p = headPos(e).clone(); W.bolt(muzzleWorld(t), p, 0xff4b5c, 0.09, false); W.flash(p.x,p.y,p.z, 0xff4b5c, 2.2, 0.3); hit(e, dmg*5*M, { kind:'phys', pierce:true, src:t, crit:true }); sfx('crit'); }, i*220));
  }else if(key==='laser'){
    t.deathRay = MU ? 8 : 5; t.ramp = flag(t,'ramp') || TOWERS[t.type].ramp || 2.2; sfx('overdrive');
  }else if(key==='venom'){
    const c = t.target && !t.target.dead ? t.target.pos.clone() : new V(t.x, 0, t.z);
    for(const e of G.enemies){ if(e.dead) continue; if(MU || Math.hypot(e.pos.x-c.x, e.pos.z-c.z) <= 2) applyPoison(e, t, 20); }
    G.fires.push({ x:c.x, z:c.z, r:1.6, t:4, dps:dmg*4, src:t, tick:0, toxic:true, mesh:W.firePatch(c.x, c.z, 1.6, 0x6ad83a) }); W.shock(c.x, c.z, 0x9dff5a, 2, 0.6); sfx('heal');
  }else if(key==='wind'){
    for(const e of inR(r*(MU ? 1.6 : 1))){ e.kbImm = 0; knock(e, MU ? 4 : 3); e.stun = Math.max(e.stun, MU ? 1.2 : 0.5); }
    if(MU) G.enemies.filter(e=>!e.dead && !e.air).sort((a,b)=>b.dist-a.dist).slice(0, 3).forEach(spawnTornado); W.shock(t.x, t.z, 0xe8fffb, r, 0.7); W.burst(t.x, 0.8, t.z, 0xe8fffb, 80, 6, 0.8, 3, 0, 0.8); sfx('storm');
  }else if(key==='bank'){
    const g = MU ? Math.min(600, Math.round(G.gold*0.35)) + 40 : Math.min(350, Math.round(G.gold*0.25)) + 20; G.gold += g; G.earned += g; num(t.x, 1.6, t.z, '🎰 +'+g, 'long'); W.burst(t.x, 1.2, t.z, 0xffd54a, 80, 4, 1.2, 3.5, 6, 2.4); sfx('coin'); sfx('level');
  }else if(key==='paradox'){
    G.timeStop = MU ? 5 : 3; for(const e of G.enemies) if(!e.dead) e.stun = Math.max(e.stun, G.timeStop); $('warpFx').classList.add('show','stop'); setTimeout(()=>$('warpFx').classList.remove('stop'), 3000); sfx('portal');
  }
  if(G.sel===t) renderPanel(); renderUltBtn(); renderHud();
  return true;
}
function readyUlts(){ return G.towers.filter(t=>t.ultReady); }
function unleashAll(){ const r = readyUlts(); if(!r.length || G.phase!=='wave'){ sfx('nope'); return; } r.forEach((t,i)=>setTimeout(()=>unleash(t), i*180)); }
function renderUltBtn(){ const n = readyUlts().length, b = $('ultAll'); if(!b) return; b.style.display = n && G.phase!=='menu' ? '' : 'none'; b.textContent = '⚡ ×'+n; }

// ---- merging: two neighbouring towers fuse into a hybrid ---------------
function mergeCandidates(t){
  if(!t || TOWERS[t.type].hybrid || t.level < 2) return [];
  const out = [];
  for(const o of G.towers){ if(o===t || o.level < 2 || TOWERS[o.type].hybrid) continue; if(Math.max(Math.abs(o.cx-t.cx), Math.abs(o.cz-t.cz)) > 1) continue;
    const r = TD.recipeFor(t.type, o.type); if(r) out.push({ o, r }); }
  return out;
}
function mergeTowers(t, o){
  const r = TD.recipeFor(t.type, o.type); if(!r) return;
  const fee = Math.round(TD.MERGE_FEE*costMul());
  if(G.gold < fee){ toast('Merging costs '+fee+' gold', 'bad'); sfx('nope'); return; }
  G.gold -= fee;
  const isNew = !SAVE.recipes.includes(r);
  logAct('merge', r, t.cx, t.cz, t);
  // the partner dissolves into the hybrid
  W.remove(o.mesh); if(o.beams) o.beams.forEach(b=>W.remove(b)); if(o.link) W.remove(o.link); G.grid.delete(o.cx+','+o.cz); G.towers.splice(G.towers.indexOf(o),1);
  W.bolt(new (window.THREE.Vector3)(o.x, 1, o.z), new (window.THREE.Vector3)(t.x, 1, t.z), TOWERS[r].accent, 0.1, true);
  W.burst(o.x, 0.6, o.z, TOWERS[o.type].accent, 40, 3, 0.8, 3, 2, 2);
  if(t.beams){ t.beams.forEach(b=>W.remove(b)); t.beams = null; }
  t.type = r; t.level = 3; t.branch = null; t.spent += o.spent + fee; t.kills += o.kills; t.charge = 0; t.ultReady = false; t.prio = TOWERS[r].prio || t.prio;
  if(TOWERS[r].proj==='beam') t.beams = [W.makeBeam(TOWERS[r].accent)];
  const yaw = t.mesh.head.rotation.y; W.remove(t.mesh); t.mesh = makeMesh(t); t.mesh.head.rotation.y = yaw; W.add(t.mesh); t.mesh.scale.setScalar(0.5); t.pop = 0;
  if(t.link){ W.remove(t.link); t.link = null; t.crystal = null; }
  W.burst(t.x, 1.2, t.z, 0xffffff, 90, 5, 1.2, 4, 2, 2.6); W.shock(t.x, t.z, TOWERS[r].accent, 3, 0.8); W.flash(t.x, 1.4, t.z, TOWERS[r].accent, 5, 0.6); W.shake(0.3); W.punch(0.5);
  sfx('level'); sfx('surge');
  if(isNew){ SAVE.recipes.push(r); persist(); showEvBanner({ icon:TOWERS[r].icon, name:'NEW HYBRID: '+TOWERS[r].name.toUpperCase(), desc:TOWERS[r].desc });
    chCheck(); }
  else toast('🔗 Merged into '+TOWERS[r].icon+' '+TOWERS[r].name, 'good');
  sEv('merge', 1);
  recomputeSyn(); select(t); renderHud(); renderBuildBar();
}

// ---- secret path -------------------------------------------------------
function openSecret(o){
  const r = o.route; if(!r || r.open) return;
  r.open = true; G.secretOpen = true; G.objs.delete(o.cx+','+o.cz); G.selObj = null; (SAVE.paths = SAVE.paths||{})[G.map.id] = true;
  W.refreshRoads(G.map); G.gold += 250; G.earned += 250; addCrystals(TD.CRYSTALS.secret);
  W.burst(o.x, 0.6, o.z, 0xb07cff, 80, 4, 1, 4, 3, 2.4); W.shock(o.x, o.z, 0xb07cff, 2.6, 0.8); W.debris(o.x, 0.5, o.z, 0x7a7088, 20, 3.2); W.shake(0.4); W.punch(0.4);
  showEvBanner({ icon:'🚪', name:'SECRET PATH UNLOCKED!', desc:'+250 gold, +2 💎, +25% gold from kills — but enemies now split between both roads' });
  sfx('bigboom'); sfx('level'); chMark('secretpath'); renderPanel(); renderHud(); W.hideRing();
}

// ---- boss takeover: an enraged boss hijacks your best tower -------------
function takeover(e){
  const cands = G.towers.filter(t=>t.dis<=0 && !(t.hijack>0) && TOWERS[t.type].proj!=='none').sort((a,b)=>towerValue(b)-towerValue(a));
  const t = cands[0]; if(!t) return;
  t.hijack = TD.TAKEOVER.time; t.hijackZap = 0.8; t.target = null; W.towerStatus(t.mesh, 'hijack'); if(t.beams) t.beams.forEach(b=>b.visible=false);
  W.bolt(headPos(e).clone(), new (window.THREE.Vector3)(t.x, 1.3, t.z), 0xb04cff, 0.09, true); W.shock(t.x, t.z, 0xb04cff, 1.6, 0.6);
  num(t.x, 1.8, t.z, '👑 HIJACKED', 'blk'); toast('👑 '+(e.bname||bossInfo().boss)+' takes control of your '+TOWERS[t.type].name+'! Tap it to break free', 'bad'); sfx('emp'); W.shake(0.2);
  if(G.sel===t) renderPanel();
}
function breakFree(t){
  if(!t || !(t.hijack > 0)) return;
  t.hijack -= 1.6; W.burst(t.x, 1.2, t.z, 0xffe27a, 14, 2.4, 0.4, 2.4, 1, 1.8); sfx('hit');
  if(t.hijack <= 0){ t.hijack = 0; W.towerStatus(t.mesh, null); toast('🔓 '+TOWERS[t.type].name+' broke free!', 'good'); chMark('breakfree'); sfx('upgrade'); W.shock(t.x, t.z, 0xffe27a, 1.4, 0.5); }
  if(G.sel===t) renderPanel();
}

// ---- shop & interludes (shop / perk pick between waves) ----------------
function nextInterlude(){
  const n = G.interludes.shift();
  if(n==='shop') return openShop();
  if(n==='perk') return offerPerks();
  if(n==='choice') return openChoice();
  G.phase = 'build'; G.buildTimer = G.mode==='bossrush' ? 15 : TD.BUILD_TIME;
  // stay flawless through wave 15 and a secret boss wakes up
  if(G.wave===TD.SECRET_BOSS_WAVE && G.livesLost===0 && !G.secretDone && ['normal','hard','endless','rogue'].includes(G.mode)){
    G.secretNext = true; setTimeout(()=>showEvBanner({ icon:'🗿', name:'A SECRET BOSS AWAKENS', desc:'No life lost for 15 waves… '+(TD.SECRET_BOSSES[G.map.id]||'Something ancient')+' joins the next wave!' }), 600); sfx('bossin'); }
  if(TD.isMirror(G.wave+1) && G.mode!=='bossrush') setTimeout(()=>toast('🪞 Next wave is a MIRROR WAVE — enemies will come from the castle side!', 'bad'), 1500); renderWaveBtn(); renderHud();
}
function openShop(){
  G.phase = 'shop';
  const pool = TD.SHOP_ITEMS.filter(it=>!(it.id==='elixir' && !G.hero) && !(it.id==='coil' && !G.loadout.includes('tesla')) && !(it.id==='frostcore' && !G.loadout.includes('frost')));
  const pick = []; const must = pool.filter(x=>x.id==='gold500' || x.id==='life');
  pick.push(...must); const rest = pool.filter(x=>!pick.includes(x)).sort(()=>Math.random()-0.5); pick.push(...rest.slice(0, 3));
  G.shopItems = pick.map(it=>({ it, bought:false }));
  renderShop(); $('shopWrap').classList.add('show'); sfx('coin');
}
function renderShop(){
  $('shopCry').textContent = G.crystals;
  $('shopWave').textContent = 'Wave '+G.wave+' cleared — spend your crystals wisely';
  $('shopItems').innerHTML = G.shopItems.map((s2,i)=>'<button class="shopItem'+(s2.bought?' sold':'')+'" data-i="'+i+'" '+(s2.bought||G.crystals<s2.it.cost?'disabled':'')+'><span class="siIcon">'+s2.it.icon+'</span><b>'+s2.it.name+'</b><span class="siDesc">'+s2.it.desc+'</span><em>'+(s2.bought?'SOLD':s2.it.cost+' 💎')+'</em></button>').join('');
  $('shopItems').querySelectorAll('.shopItem').forEach(b=>b.addEventListener('click', ()=>buyShop(+b.dataset.i)));
}
function buyShop(i){
  const s2 = G.shopItems[i]; if(!s2 || s2.bought || G.crystals < s2.it.cost){ sfx('nope'); return; }
  G.crystals -= s2.it.cost; s2.bought = true; SAVE.stats.crystalsSpent = (SAVE.stats.crystalsSpent||0) + s2.it.cost; sEv('shop', 1); chCheck();
  const id = s2.it.id;
  if(id==='gold500'){ G.gold += 500; G.earned += 500; }
  else if(id==='life') G.lives += 1;
  else if(id==='fortify') G.lives += 3;
  else if(id==='dmg20') G.bonus.dmg = bonus('dmg') + 1;
  else if(id==='range10'){ G.bonus.range = bonus('range') + 1; }
  else if(id==='frostcore') G.bonus.frostcore = bonus('frostcore') + 1;
  else if(id==='coil') G.bonus.coil = bonus('coil') + 1;
  else if(id==='bounty') G.bonus.bounty = bonus('bounty') + 1;
  else if(id==='elixir'){ G.bonus.hero = bonus('hero') + 1; if(G.hero){ const st = heroStats(); G.hero.maxHp = st.maxHp; G.hero.hp = st.maxHp; } }
  else if(id==='recharge'){ for(const k in G.cd) G.cd[k] = 0; G.towers.forEach(t=>chargeUlt(t, Math.ceil((ultDef(t)||{need:0}).need*0.5))); }
  sfx('coin'); renderShop(); renderHud();
}
function closeShop(){ $('shopWrap').classList.remove('show'); sfx('click'); nextInterlude(); }

// ---- seasons -----------------------------------------------------------
function ensureSeason(){
  const S = TD.seasonNow();
  if(SAVE.season && SAVE.season.id === S.id) return SAVE.season;
  let seed = S.id*7919 + 13; const rnd = ()=>{ seed = (seed*1103515245+12345) & 0x7fffffff; return seed/0x7fffffff; };
  const pool = TD.SEASON_POOL.slice(), goals = [];
  while(goals.length < 5 && pool.length){ const i = Math.floor(rnd()*pool.length); const g = pool.splice(i,1)[0]; goals.push({ id:g.id, n:g.n, p:0, done:false }); }
  SAVE.season = { id:S.id, sxp:0, tier:0, goals, best:0, rogue:0 };
  persist(); return SAVE.season;
}
function sEv(ev, amt){
  const SS = ensureSeason(); let ch = false;
  for(const g of SS.goals){ if(g.done) continue; const def = TD.SEASON_POOL.find(x=>x.id===g.id); if(!def || def.ev!==ev) continue;
    if(def.max) g.p = Math.max(g.p, amt); else g.p += amt; ch = true;
    if(g.p >= g.n){ g.p = g.n; g.done = true; SAVE.coins += TD.SEASON_GOAL_REWARD.coins; seasonXp(TD.SEASON_GOAL_REWARD.sxp); toast('🗓️ Season goal done: '+def.text.replace('{n}', g.n)+'  ·  +'+TD.SEASON_GOAL_REWARD.coins+' 💰', 'good'); sfx('daily'); } }
  if(ch) persistSoon();
}
function seasonXp(n){
  const SS = ensureSeason(), S = TD.seasonNow(); SS.sxp += n;
  while(SS.tier < TD.SEASON_TIERS && SS.sxp >= (SS.tier+1)*TD.SEASON_TIER_XP){
    SS.tier++; const r = TD.SEASON_REWARDS[SS.tier-1] || {};
    if(r.coins) SAVE.coins += r.coins;
    if(r.skin){ const sk = S.theme.skin, id = 'season'+S.id; if(!TD.SKINS.find(x=>x.id===id)) TD.SKINS.push(Object.assign({ id, icon:S.theme.icon, cost:0, season:S.id }, sk)); if(!SAVE.skins.owned.includes(id)) SAVE.skins.owned.push(id); }
    if(r.title){ const tid = 'season'+S.id; if(!SAVE.titles.includes(tid)) SAVE.titles.push(tid); }
    toast('🗓️ Season tier '+SS.tier+' reached!'+(r.skin?' New skin: '+S.theme.skin.name:'')+(r.title?' New title!':''), 'good');
  }
  persistSoon();
}
// season skins earned in earlier seasons stay in the collection
function restoreSeasonSkins(){ (SAVE.skins.owned||[]).forEach(id=>{ if(id.indexOf('season')!==0 || TD.SKINS.find(x=>x.id===id)) return; const n = +id.slice(6); const th = TD.SEASON_THEMES[((n-1)%TD.SEASON_THEMES.length+TD.SEASON_THEMES.length)%TD.SEASON_THEMES.length]; TD.SKINS.push(Object.assign({ id, icon:th.icon, cost:0, season:n }, th.skin)); }); }
function titleList(){
  const out = TD.TITLES.filter(t=>t.id==='commander' || (t.ach && SAVE.ch[t.ach] && SAVE.ch[t.ach].done) || (t.mastery && mastery(t.mastery) >= TD.MASTERY_REWARDS.title) || (t.check && t.check(SAVE)));
  (SAVE.titles||[]).forEach(id=>{ if(id.indexOf('season')===0){ const n = +id.slice(6); const th = TD.SEASON_THEMES[((n-1)%TD.SEASON_THEMES.length+TD.SEASON_THEMES.length)%TD.SEASON_THEMES.length]; out.push({ id, name:th.name+' Champion', how:'Season '+n+' tier 10' }); } });
  return out;
}
function titleName(){ const t = titleList().find(x=>x.id===SAVE.title); return t ? t.name : 'Commander'; }

// ---- abilities -------------------------------------------------------
function abilityUnlocked(a){ return ulevel() >= a.unlock; }
function cdMul(){ return (1 - 0.06*rs('arcana')) * (1 - 0.15*rs('timelord')) * Math.pow(0.7, perk('abil_cd')); }
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
  const mul = TD.hpMul(Math.max(1,G.wave), mapDiff(G.map)) * (1 + 0.2*rs('meteorcore'));
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
  }else if(id==='timewarp'){
    G.timewarp = 5 + 2*rs('timelord'); $('warpFx').classList.add('show'); sfx('portal'); W.punch(0.3);
    W.shock(G.map.w/2, G.map.h/2, 0x9a7aff, 10, 1); toast('⏳ TIME WARP — enemies crawl for 5 seconds', 'good');
  }else if(id==='overdrive'){
    G.overdrive = 8; sfx('overdrive'); W.shake(0.12); W.punch(0.3);
    for(const t of G.towers){ W.shock(t.x, t.z, 0xff8c42, 1.2, 0.5); W.flash(t.x, 1, t.z, 0xff8c42, 2, 0.4); W.burst(t.x, 0.8, t.z, 0xffb347, 12, 2.4, 0.5, 2.6, 1, 2); }
    $('odFx').classList.add('show'); toast('🔥 OVERDRIVE — towers fire 60% faster!', 'good');
  }
}

// ---- last stand: once per wave, shove the whole army back ------------
function lastStandMax(){ return 1 + perk('second_wind') + rs('aegis'); }
function useLastStand(){
  if(G.phase!=='wave' || G.over){ toast('🚨 Last Stand works during a wave', 'bad'); sfx('nope'); return; }
  if(G.lastStand >= lastStandMax()){ toast('🚨 Last Stand already used this wave', 'bad'); sfx('nope'); return; }
  G.lastStand++; if(G.lives <= 3) chMark('laststand');
  const c = G.map.castle.position;
  for(let i=0;i<4;i++) setTimeout(()=>W.shock(c.x, c.z, i%2?0xffffff:0xff5a5a, 4+i*3.5, 0.9), i*110);
  W.flash(c.x, 1.2, c.z, 0xffffff, 8, 0.6); W.burst(c.x, 1, c.z, 0xffe27a, 120, 7, 1, 4, 2, 2.4);
  $('flashFx').classList.remove('go'); void $('flashFx').offsetWidth; $('flashFx').classList.add('go');
  for(const e of G.enemies){ if(e.dead) continue; const boss = e.big;
    if(!e.air){ e.kbImm = 0; retreat(e, boss ? 0.8 : 2.2); }
    e.stun = Math.max(e.stun, boss ? 0.4 : 1.2);
    if(!boss) hit(e, e.hp*0.1, { kind:'meteor' });
    W.burst(e.pos.x, e.pos.y+0.4, e.pos.z, 0xffe27a, 6, 2, 0.4, 2.4, 2, 1.2); }
  sfx('bigboom'); sfx('stomp'); W.shake(0.7); W.punch(1);
  toast('🚨 LAST STAND! The castle strikes back', 'good'); renderAbilities();
}
// ---- the hero: a knight you move around the island --------------------
function heroStats(){ const H = TD.HERO, h = G.hero, lv = h ? h.lvl : 1, rsm = 1 + 0.1*rs('hero') + 0.4*bonus('hero'), pm = 1 + 0.6*perk('hero_pow');
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
    if(d2 < 0.36) near += (e.big ? 6 : (e.d.mini||e.type==='commander' ? 3 : 1));
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
  $('perkWrap').classList.remove('show');
  toast(p.icon+' '+p.name+' — '+p.desc, 'good'); sfx('level');
  G.towers.forEach(t=>W.flash(t.x, 1, t.z, 0xffe27a, 1.5, 0.3));
  nextInterlude();
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
  v8Tick(dt);
  for(const k in G.cd) if(G.cd[k] > 0) G.cd[k] = Math.max(0, G.cd[k]-dt);
  if(G.overdrive > 0){ G.overdrive -= dt; if(G.overdrive <= 0){ G.overdrive = 0; $('odFx').classList.remove('show'); }
    if(Math.random() < dt*20 && G.towers.length){ const t = G.towers[Math.floor(Math.random()*G.towers.length)]; W.burst(t.x, 0.9, t.z, 0xff8c42, 1, 1.5, 0.5, 2.2, -1, 1); } }
  if(G.evSurge > 0){ G.evSurge -= dt; if(G.evSurge <= 0){ G.evSurge = 0; if(G.ev==='surge') G.ev = null; renderChips(); }
    if(Math.random() < dt*10){ const ts = G.towers.filter(t=>t.type==='tesla'); if(ts.length){ const t = ts[Math.floor(Math.random()*ts.length)]; W.burst(t.x, 1.1, t.z, 0x9ffcff, 2, 1.5, 0.3, 2, 0, 1.6); } } }
  // day/night and fog blend smoothly
  // the sky follows the clock: dusk falls after wave 5, dawn breaks after wave 10 (and so on)
  let nx = G.wave + 0.5;
  if(G.phase==='wave') nx = G.wave + 0.5*Math.min(1, G.spawnT/(G.waveDur||30));
  else if(G.buildTimer > 0) nx = G.wave + 0.5 + 0.5*(1 - G.buildTimer/TD.BUILD_TIME);
  const nTarget = (G.waveEv==='eclipse' && G.phase==='wave') ? 1 : ((G.mode==='bossrush' || G.map.effect==='reality') ? (G.map.effect==='reality' ? 0.6 : 0) : TD.nightAt(nx));
  if(Math.abs(G.nightK - nTarget) > 0.001){ G.nightK += Math.sign(nTarget-G.nightK)*Math.min(Math.abs(nTarget-G.nightK), dt*0.5); W.setNight(G.nightK); $('nightFx').style.opacity = (G.nightK*0.55).toFixed(3); }
  if(G.timewarp > 0){ G.timewarp -= dt; if(G.timewarp <= 0){ G.timewarp = 0; $('warpFx').classList.remove('show'); } }
  if(G.timeStop > 0){ G.timeStop -= dt; if(G.timeStop <= 0){ G.timeStop = 0; $('warpFx').classList.remove('show'); } }
  // thunderstorm: lightning picks random enemies
  if(G.weather==='storm' && G.phase==='wave'){ G.stormT -= dt; if(G.stormT <= 0){ G.stormT = 2.5 + Math.random()*2.5; const pool = G.enemies.filter(e=>!e.dead);
      if(pool.length){ const e = pool[Math.floor(Math.random()*pool.length)], p = headPos(e).clone(); W.bolt(new (window.THREE.Vector3)(p.x+(Math.random()-0.5)*2, 12, p.z+(Math.random()-0.5)*2), p, 0xffffff, 0.14, true);
        W.flash(p.x, p.y, p.z, 0xffffff, 4, 0.3); W.shock(e.pos.x, e.pos.z, 0x9ffcff, 1.3, 0.4); hit(e, e.maxHp*(e.big?0.02:0.1), { kind:'bolt' }); if(!e.dead) e.stun = Math.max(e.stun, 0.4);
        $('flashFx').classList.remove('bolt'); void $('flashFx').offsetWidth; $('flashFx').classList.add('bolt'); sfx('bigzap'); W.shake(0.12); } } }
  // alternate reality: time loops
  if(G.map.effect==='reality' && G.phase==='wave'){ G.loopT -= dt; if(G.loopT <= 0){ G.loopT = 20;
      for(const e of G.enemies){ if(e.dead || e.air) continue; e.kbImm = 0; retreat(e, 1.5); e.hp = Math.min(e.maxHp, e.hp + e.maxHp*(e.big?0.03:0.1)); W.burst(e.pos.x, e.pos.y+0.5, e.pos.z, 0x2ef2ff, 6, 1.4, 0.4, 2, 0, 1.4); }
      W.shock(G.map.w/2, G.map.h/2, 0x2ef2ff, 9, 0.9); $('warpFx').classList.add('show'); setTimeout(()=>{ if(G.timewarp<=0 && G.timeStop<=0) $('warpFx').classList.remove('show'); }, 700);
      toast('⏪ TIME LOOP — the enemy rewinds (and heals)', 'tip'); sfx('portal'); } }
  // paradox echoes land
  for(let i=G.echoes.length-1;i>=0;i--){ const ec = G.echoes[i]; ec.t -= dt; if(ec.t > 0) continue; G.echoes.splice(i,1);
    const tgt = ec.e && !ec.e.dead ? ec.e : null; const x = tgt ? tgt.pos.x : ec.x, z = tgt ? tgt.pos.z : ec.z;
    W.shock(x, z, 0x2ef2ff, 0.9, 0.4); W.flash(x, 0.7, z, 0x9af8ff, 1.2, 0.2);
    if(tgt){ hit(tgt, ec.dmg, { kind:'bolt', src:ec.src }); num(x, tgt.pos.y+1.2, z, '⏳', 'bolt'); }
    if(ec.fr){ for(const o of G.enemies){ if(o.dead || o===tgt) continue; if(Math.hypot(o.pos.x-x, o.pos.z-z) <= ec.fr) hit(o, ec.dmg*0.6, { kind:'bolt', src:ec.src }); } } }
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
        for(const e of G.enemies){ if(e.dead||e.air) continue; if(Math.hypot(e.pos.x-cx, e.pos.z-cz) < 0.7) hit(e, Math.round(e.maxHp*(e.big?0.04:0.08)), { kind:'fire' }); } }
      sfx('boom'); W.shake(0.12);
    }
  }
  if(G.map.effect==='surge' && G.phase==='wave'){
    if(G.surge > 0){ G.surge -= dt; if(G.surge <= 0){ G.surge = 0; toast('The rift calms down', 'tip'); } }
    G.surgeT -= dt;
    if(G.surgeT <= 0){ G.surgeT = 25; G.surge = 6; sfx('surge'); toast('⚡ POWER SURGE — crystals ×2 for 6s!', 'good');
      G.objs.forEach(o=>{ if(o.type==='energy'||o.type==='ice'){ W.shock(o.x, o.z, o.type==='energy'?0xb07cff:0x7fe8ff, 1.8, 0.7); W.flash(o.x, 0.8, o.z, 0xffffff, 2.5, 0.4); } }); }
  }
  // v6 systems
  G.powerT = (G.powerT||0) - dt; if(G.powerT <= 0){ G.powerT = 0.25; refreshStructs(); computePower(); }
  if(G.phase==='wave' && G.survT > 0){ G.survT -= dt; if(G.survT <= 0){ G.survT = 0; endSurvival(); } }
  castleTick(dt); holesTick(dt); pickupsTick(dt); robotTick(dt);
  // roguelike Ice Age
  if(perk('freeze_all') && G.phase==='wave'){ G.iceAgeT -= dt; if(G.iceAgeT <= 0){ G.iceAgeT = 20; for(const e of G.enemies) if(!e.dead) freezeOne(e, 1.5); W.shock(G.map.w/2, G.map.h/2, 0xbdf3ff, 9, 0.8); sfx('freeze'); } }
  // falling trees, supply crates, tornadoes, chain explosions
  if(G.falling) for(let i=G.falling.length-1;i>=0;i--){ const f = G.falling[i]; f.t += dt; f.mesh.rotation.z = f.dir*Math.min(1.5, f.t*f.t*5); f.mesh.position.y = -Math.max(0, f.t-0.5)*0.8; if(f.t > 1.1){ W.removeObject(f.mesh); G.falling.splice(i,1); } }
  for(let i=G.crates.length-1;i>=0;i--){ const c = G.crates[i]; c.y -= dt*3.2; c.mesh.position.y = Math.max(0, c.y); c.mesh.rotation.y += dt*0.8; c.mesh.chute.visible = c.y > 0.2;
    if(c.y <= 0){ const g = 50 + G.wave*8; G.gold += g; G.earned += g; W.remove(c.mesh); G.crates.splice(i,1);
      W.burst(c.x, 0.4, c.z, 0xffd54a, 50, 3.2, 0.9, 3.2, 6, 2); W.debris(c.x, 0.3, c.z, 0xa0703a, 12, 2.6); W.shock(c.x, c.z, 0xffd54a, 1.4, 0.5); num(c.x, 1, c.z, '+'+g+' 💰', 'gold'); sfx('coin'); sfx('boom'); renderHud(); } }
  for(let i=G.tornados.length-1;i>=0;i--){ const o = G.tornados[i]; const mv = 2.2*dt; retreat(o, mv); o.left -= mv; o.mesh.position.set(o.pos.x, 0, o.pos.z); o.mesh.rotation.y += dt*12;
    if(Math.random()<dt*20) W.burst(o.pos.x, 0.5, o.pos.z, 0xe8fffb, 1, 1.5, 0.5, 2.4, -1, 1);
    for(const e of G.enemies){ if(e.dead || e.air) continue; if(Math.hypot(e.pos.x-o.pos.x, e.pos.z-o.pos.z) < 0.6 && !e.big){ e.kbImm = 0; retreat(e, mv*0.9); e.stun = Math.max(e.stun, 0.1); } }
    if(o.left <= 0 || o.seg===0 && o.pos.distanceTo(o.route[0]) < 0.05){ W.remove(o.mesh); G.tornados.splice(i,1); } }
  if(G.booms.length){ const list = G.booms; G.booms = []; for(const b of list){ W.burst(b.x, 0.4, b.z, 0xff8c42, 24, 3, 0.5, 3, 4, 1.6); W.shock(b.x, b.z, 0xff8c42, 1.1, 0.35);
    for(const e of G.enemies){ if(e.dead) continue; if(Math.hypot(e.pos.x-b.x, e.pos.z-b.z) < 1.0) hit(e, b.dmg, { kind:'meteor', boom:true }); } } }
  // spawns
  if(G.phase==='wave'){
    G.spawnT += dt;
    while(G.queue.length && G.queue[0].at <= G.spawnT){ const q = G.queue.shift(); const e = spawn(q.type, null, 0, null, { armorT:q.armorT }); if(q.secret) makeSecret(e); }
  }else if(G.phase==='build' && G.buildTimer > 0){
    G.buildTimer -= dt;
    if(G.buildTimer <= 0){ G.buildTimer = 0; callWave(); }
  }
  // auras: guardians protect, drummers hasten, commanders lead, carriers throw domes
  let cmd = 0;
  let sc = 0; for(const e of G.enemies){ e.guarded = false; e.hasted = false; e.led = false; if(!e.dead && e.type==='commander') cmd++; if(!e.dead && e.d.scout) sc++; }
  if(sc !== G.scouts){ G.scouts = sc; renderChips(); }
  if(cmd !== G.cmd){ G.cmd = cmd; renderChips(); }
  if(cmd) for(const c of G.enemies){ if(c.dead || c.type!=='commander') continue; const R2 = c.d.auraR*c.d.auraR; for(const o of G.enemies){ if(o===c || o.dead) continue; const dx = o.pos.x-c.pos.x, dz = o.pos.z-c.pos.z; if(dx*dx+dz*dz <= R2) o.led = true; } }
  for(const a of G.enemies){
    if(a.dead || !a.ab.aura || a.frozen>0 || a.stun>0) continue;
    const R2 = a.ab.auraR*a.ab.auraR;
    for(const o of G.enemies){ if(o===a || o.dead) continue; const dx = o.pos.x-a.pos.x, dz = o.pos.z-a.pos.z; if(dx*dx+dz*dz <= R2){ if(a.ab.aura==='guard') o.guarded = true; else o.hasted = true; } }
  }
  // enhanced runners leave speed trails behind them
  if(G.trails && G.trails.length){ for(let i=G.trails.length-1;i>=0;i--){ const tr = G.trails[i]; tr.t -= dt; if(tr.t <= 0){ G.trails.splice(i,1); continue; } if(Math.random() < dt*2.5) W.burst(tr.x, 0.08, tr.z, 0xffe14b, 1, 0.3, 0.6, 1.8, -0.5, 0.2); }
    for(const e of G.enemies){ if(e.dead || e.air || (e.vet && e.vet.trail)) continue; for(const tr of G.trails){ const dx = e.pos.x-tr.x, dz = e.pos.z-tr.z; if(dx*dx+dz*dz < 0.2){ e.hasteT = 1.2; break; } } } }
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
    if(e.big){ bossPhases(e); bossTick(e, dt); if(e.dead) continue; e.skillT -= dt; if(e.skillT <= 0 && e.frozen<=0){ const def = TD.BOSS_SKILLS[bossSkillKey(e)]; e.skillT = def.every*(e.enraged?0.75:1)*(e.final?0.6:1); bossSkill(e); if(e.dead) continue; } }
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
        const extra = (e.healN||1) > 1 ? G.enemies.filter(o=>!o.dead && o!==e && o!==best && o.hp < o.maxHp && o.pos.distanceTo(e.pos) <= 2.2).sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp)).slice(0, e.healN-1) : [];
        for(const tgt of (best ? [best] : []).concat(extra)){ const amt = Math.round(Math.min(tgt.maxHp*e.ab.heal, e.maxHp*0.6, tgt.maxHp-tgt.hp)); tgt.hp += amt;
          W.bolt(headPos(e).clone(), headPos(tgt).clone(), 0x52e07a, 0.05, false); W.burst(tgt.pos.x, tgt.pos.y+0.6, tgt.pos.z, 0x52e07a, 10, 1.4, 0.6, 2.4, -1.5, 1.2); W.flash(tgt.pos.x, tgt.pos.y+0.5, tgt.pos.z, 0x52e07a, 1.2, 0.25);
          num(tgt.pos.x, tgt.pos.y+1.1, tgt.pos.z, '+'+amt, 'heal'); sfx('heal'); } } }
    const cmdBoost = e.led ? 1.25 : 1;
    // mutants evolve as they walk: fast, then armored
    if(e.d.mutate && !busy){ e.mutT += dt; const want = e.mutT > 11 ? 2 : (e.mutT > 5 ? 1 : 0);
      if(want > e.mutStage){ e.mutStage = want; W.mutate(e.mesh, want); W.burst(e.pos.x, e.pos.y+0.6, e.pos.z, want===1?0xffe14b:0x9aa7b8, 26, 2.6, 0.6, 3, 1, 2); num(e.pos.x, e.pos.y+1.2, e.pos.z, '🧬 EVOLVED', 'long'); sfx('phase');
        if(want===1){ e.speed *= 1.8; e.mesh.baseColor.setHex(0xe8e04a); }
        else { e.speed = e.d.speed*0.9*(e.speed/(e.d.speed*1.8)); e.armor += 8; e.maxHp = Math.round(e.maxHp*1.3); e.hp = Math.round(e.hp*1.3); e.mesh.baseColor.setHex(0x8a94a6); } } }
    // enraged bosses (and secret bosses) hijack towers
    if(e.big && (e.enraged || e.secret) && !busy){ e.takeT -= dt; if(e.takeT <= 0){ e.takeT = TD.TAKEOVER.every*(e.secret?0.7:1); takeover(e); } }
    if(e.d.mini && !busy) miniTick(e, dt);
    if(e.d.infect && !busy){ e.infT -= dt; if(e.infT <= 0){ e.infT = e.d.infect; infectNear(e); } }
    if(e.charged > 0){ e.charged -= dt; if(e.charged <= 0) W.charged(e.mesh, false); }
    if(e.gShield) airTick(e, dt);
    if(e.dead) continue;
    if(e.vet && e.vet.trail && !busy){ e.trailT = (e.trailT||0) - dt; if(e.trailT <= 0){ e.trailT = 0.3; if(G.trails.length < 70) G.trails.push({ x:e.pos.x, z:e.pos.z, t:2.5 }); } }
    if(e.dashT != null && !busy){ e.dashT -= dt; if(e.dashK > 0){ e.dashK -= dt; if(Math.random() < dt*30) W.burst(e.pos.x, e.pos.y+0.3, e.pos.z, 0xd8c6ff, 1, 0.8, 0.3, 2.2, 0, 0.4); }
      if(e.dashT <= 0){ e.dashT = 4 + Math.random()*1.5; e.dashK = 0.7; num(e.pos.x, e.pos.y+0.9, e.pos.z, '💨 DASH', 'blk'); } }
    if(e.hasteT > 0) e.hasteT -= dt;
    const sprinting = e.sprint && e.seg >= e.route.length*0.65;
    if(sprinting && Math.random() < dt*12) W.burst(e.pos.x, 0.15, e.pos.z, 0x9dff5a, 1, 1, 0.4, 2.2, 0, 0.4);
    if(v8Enemy(e, dt, busy)) continue;
    const tw = (G.timewarp > 0 ? 0.35 : 1)*(e.under > 0 ? 1.3 : 1)*(e.blazeT > 0 ? 1.1 : 1), flyK = e.air && G.weather==='storm' ? 0.8 : 1;
    let move = busy || G.timeStop > 0 ? 0 : e.speed*(1-e.slow)*(e.hasted?1.3:1)*cmdBoost*wSpeed*tw*flyK*(e.chargeK > 0 ? 2.6 : 1)*(e.hasteT > 0 ? 1.15 : 1)*(e.dashK > 0 ? (e.dashMul||2.2) : 1)*(sprinting ? e.sprint : 1)*dt;
    const offRoad = e.sab && e.sab.state!=='road' && e.sab.state!=='done';
    // barricades hold ground enemies until they smash through
    if(G.walls.length && !e.air && !offRoad && !busy){
      for(const w of G.walls){ const wd = structAt(w, e.route); if(wd==null || e.dist >= wd) continue; const stop = wd - 0.38 - e.d.size*0.6;
        if(e.dist + move > stop){ move = Math.max(0, stop - e.dist); if(e.dist >= stop - 0.06) bashWall(e, w, dt); } } }
    const prevDist = e.dist;
    if(e.sab && e.sab.state!=='done' && saboteurTick(e, dt, move)){ /* off-road */ }
    else advance(e, move);
    // warp gates throw enemies back down the road
    if(G.warps.length && !e.air && !e.big && !e.d.mini && !e.d.kbImm && !e.reached){
      for(const w of G.warps){ if(w.dis > 0 || (w.wcool||0) > 0) continue; const wd = structAt(w, e.route); if(wd==null) continue;
        if(prevDist < wd && e.dist >= wd){ w.wcool = stat(w,'cd')||6; W.portalFx(e.pos.x, e.pos.z, 0xb07cff); e.kbImm = 0; retreat(e, stat(w,'back')||4); W.portalFx(e.pos.x, e.pos.z, 0xb07cff);
          num(e.pos.x, e.pos.y+1, e.pos.z, '🌀 WARPED', 'bolt'); sfx('portal'); break; } } }
    if(e.reached && !e.dead){
      e.dead = true; if(e.big||e.d.mini) G.bossAlive--;
      const c = G.mirror ? G.map.gate.position : castleFor(e);
      if(e.d.steal){ const s = Math.min(G.gold, e.d.steal); G.gold -= s; toast('💰 Gold Thief stole '+s+' gold!', 'bad'); sfx('steal'); W.burst(c.x, 0.9, c.z, 0xffd54a, 20, 2.4, 0.6, 3, 5, 1.6); }
      else if(G.gateLeft > 0 && !e.big && !G.mirror){ G.gateLeft--; W.shock(c.x, c.z, 0xffc857, 1.4, 0.5); W.debris(c.x, 0.5, c.z, 0x5a6270, 8, 2.4); num(c.x, 1.5, c.z, '🚪 BLOCKED', 'blk'); sfx('heavy'); if(!G.gateLeft) toast('🚪 The Iron Gate is holding no more enemies this wave', 'tip'); }
      else { G.lives -= e.lives; G.livesLost += e.lives; sfx('life'); const lk = (e.elite?'E:':'')+(e.mutated?'M:':'')+(e.vet?'V:':'')+e.type; (G.leakBy = G.leakBy||{})[lk] = (G.leakBy[lk]||0) + e.lives; W.burst(c.x, 0.9, c.z, 0xff4b5c, 30, 2.8, 0.6, 3.5, 5, 1.6); W.shock(c.x, c.z, 0xff4b5c, 1.8, 0.5); W.shake(0.2); toast('-'+e.lives+(e.lives>1?' lives':' life'), 'bad');
        $('hurtFx').classList.remove('go'); void $('hurtFx').offsetWidth; $('hurtFx').classList.add('go');
        if(G.lives <= 0){ G.lives = 0; finish(false); } }
    }
  }
  heroTick(dt);
  if(G.selE){ if(G.selE.dead){ G.selE = null; W.hideMarker(); renderPanel(); } else if(!G.targetMode) W.showMarker(G.selE.pos.x, G.selE.pos.z, 0.5); }
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
    if(t.frenzyT > 0) t.frenzyT -= dt;
    if((t.chilled || t.jammed || t.sick) && Math.random() < dt*3) W.burst(t.x, 1.1, t.z, t.chilled ? 0xbdf3ff : (t.jammed ? 0xb04cff : 0x9dff5a), 1, 0.8, 0.5, 2, t.chilled ? -0.5 : 1, 0.6);
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
    if(t.mesh.ultFx) W.tickUlt(t.mesh, G.t);
    if(t.mesh.core){ t.mesh.core.rotation.y += dt*2; t.mesh.core.position.y = 1.55 + Math.sin(G.t*3+t.x)*0.07; t.mesh.coreRing.rotation.x += dt*3; }
    if(t.mesh.aura) t.mesh.aura.material.opacity = 0.2 + Math.sin(G.t*2+t.x)*0.1;
    if(t.hijack > 0){
      t.hijack -= dt; t.target = null; if(t.beams) t.beams.forEach(b=>b.visible=false);
      if(t.mesh.status && t.mesh.status.userData.ring){ t.mesh.status.userData.ring.rotation.z += dt*6; }
      t.hijackZap -= dt;
      if(t.hijackZap <= 0){ t.hijackZap = 1.5; let best = null, bd = 3.2*3.2; for(const o of G.towers){ if(o===t || o.dis > 0) continue; const dd = (o.x-t.x)**2+(o.z-t.z)**2; if(dd < bd){ bd = dd; best = o; } }
        if(best){ W.bolt(new (window.THREE.Vector3)(t.x, 1.2, t.z), new (window.THREE.Vector3)(best.x, 1, best.z), 0xb04cff, 0.06, true); disableTower(best, 1.2, 'stun'); sfx('zap'); } }
      if(t.hijack <= 0){ t.hijack = 0; W.towerStatus(t.mesh, null); if(G.sel===t) renderPanel(); }
      continue;
    }
    if(t.type==='bank'){ if(t.mesh.spin) t.mesh.spin.rotation.z += dt*2; continue; }
    if(TOWERS[t.type].struct){ structTick(t, dt); continue; }
    if(TOWERS[t.type].legendary){ legendTick(t, dt); continue; }
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
          if(p.tower && G.towers.includes(p.tower)) disableTower(p.tower, p.disT || (p.bomb ? 1.8 : 2.5), p.bomb ? 'stun' : 'melt');
          if(p.siege && p.tower && G.towers.includes(p.tower)){ const U = ultDef(p.tower); if(p.tower.ultReady && U){ p.tower.ultReady = false; W.ultReady(p.tower.mesh, false); p.tower.charge = U.need*0.5; renderUltBtn(); } else p.tower.charge = (p.tower.charge||0)*0.5; num(c.x, 1.5, c.z, '🎯 −50% charge', 'blk'); W.debris(c.x, 0.4, c.z, 0x8a8480, 12, 3); }
          sfx('boom'); W.shake(0.15);
        }else if(p.kind==='meteor'){
          W.burst(c.x, 0.3, c.z, 0xff8c42, 90, 5, 0.8, 5, 5, 1.8); W.burst(c.x, 0.3, c.z, 0xffe14b, 40, 3.5, 0.6, 4, 4, 1.6); W.burst(c.x, 0.2, c.z, 0x4a4a4a, 30, 2.2, 1.2, 6, 2, 1.4);
          W.shock(c.x, c.z, 0xff8c42, 2.6, 0.6); W.shock(c.x, c.z, 0xffffff, 1.6, 0.35); W.flash(c.x, 0.6, c.z, 0xffb347, 5, 0.45); W.debris(c.x, 0.3, c.z, 0x5a4a48, 22, 4);
          if(p.road || p.crater) meteorLanded(p);
          for(const e of G.enemies){ if(e.dead) continue; const dd = Math.hypot(e.pos.x-c.x, e.pos.z-c.z); if(dd <= p.splash+e.d.size) hit(e, Math.round(p.dmg*(dd<p.splash*0.5?1:0.6)), { kind:'meteor' }); }
          sfx('bigboom'); W.shake(0.55); W.punch(0.6); W.hideMarker();
        }else{
          const small = p.kind==='bomblet';
          W.burst(c.x, 0.25, c.z, p.burn?0xff5a1a:0xff8c42, small?12:26, 3.2, 0.5, small?3:4, 5, 1.4); if(!small) W.burst(c.x, 0.2, c.z, 0x4a4a4a, 14, 1.6, 0.9, 5, 2, 1.2);
          W.shock(c.x, c.z, p.burn?0xff5a1a:0xffb347, p.splash*1.1, small?0.3:0.4); W.flash(c.x, 0.4, c.z, 0xffb347, (small?0.6:1.4)+p.splash, 0.2); if(!small) W.debris(c.x, 0.15, c.z, 0x6b5a48, p.quake?10:5, 2.6);
          for(const e of G.enemies){ if(e.dead||e.air||e.ghost) continue; const dd = Math.hypot(e.pos.x-c.x, e.pos.z-c.z); if(dd > p.splash+e.d.size) continue;
            if(e.ab.dodge && Math.random() < e.ab.dodge){ num(e.pos.x, e.pos.y+0.9, e.pos.z, 'MISS', 'blk'); continue; }
            let sm2 = 1;
            if(e.charged > 0 && p.src){ sm2 = 2.5*comboMul(); e.charged = 0; W.charged(e.mesh, false); shatterFx(e, p); }
            if(e.poison && e.poison.stacks >= 3 && p.src){ toxicBlast(e, p.src); }
            hit(e, Math.round(p.dmg*(dd<p.splash*0.5?1:0.6)*sm2), { kind:'phys', src:p.src, cold:p.cold });
            if(p.burn && !e.dead) setBurn(e, 3, p.dmg*0.22);
            if(p.quake && !e.dead) e.stun = Math.max(e.stun, e.big ? p.quake*0.3 : p.quake);
            if(p.freezeSplash && !e.dead) freezeOne(e, p.freezeSplash); }
          if(p.freezeSplash){ W.shock(c.x, c.z, 0xbdf3ff, p.splash*1.2, 0.5); W.debris(c.x, 0.3, c.z, 0xdff6ff, 10, 2.4); }
          if(p.chainBurst){ let from = new (window.THREE.Vector3)(c.x, 0.4, c.z); const done = new Set(); let cur = null;
            for(let k2=0;k2<p.chainBurst;k2++){ let best = null, bd = 2.2*2.2; for(const o of G.enemies){ if(o.dead||done.has(o)) continue; const dd = (o.pos.x-from.x)**2+(o.pos.z-from.z)**2; if(dd < bd){ bd = dd; best = o; } }
              if(!best) break; done.add(best); const hp2 = headPos(best).clone(); W.bolt(from, hp2, 0x9ffcff, 0.05, true); hit(best, p.dmg*0.5, { kind:'bolt', src:p.src }); from = hp2; }
            sfx('zap'); }
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
            if(p.src && TOWERS[p.src.type].poisonHit && !e.dead) applyPoison(e, p.src, 1);
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
    if(k >= 1){ W.freeEnemy(d.mesh); G.dying.splice(i,1); continue; }
    d.mesh.scale.set(d.s*(1+k*0.5)*(1-k), d.s*(1-k)*(1-k*0.5), d.s*(1+k*0.5)*(1-k)); }
  // dead enemies out, meshes updated
  for(let i=G.enemies.length-1;i>=0;i--){
    const e = G.enemies[i];
    if(e.dead){ if(!e.mesh.userData.keep) W.freeEnemy(e.mesh); G.enemies.splice(i,1); continue; }
    e.mesh.position.x = e.pos.x; e.mesh.position.z = e.pos.z; if(!e.air && !e.mesh.baseY) e.mesh.position.y = e.under > 0 ? -0.32 : 0;
    if(e.weakT > 0) W.weakPoint(e.mesh, true);
    if(e.yaw!=null) e.mesh.rotation.y = e.yaw;
    W.animateEnemy(e.mesh, G.t + e.dist, !(e.frozen>0||e.stun>0));
    e.mesh.fill.scale.x = Math.max(0.001, e.hp/e.maxHp);
    e.mesh.fill.material.color.set(e.hp/e.maxHp > 0.5 ? 0x52e07a : (e.hp/e.maxHp > 0.25 ? 0xffc857 : 0xff4b5c));
    if(e.mesh.shieldFill) e.mesh.shieldFill.scale.x = Math.max(0.001, e.shield/(e.shieldMax||1));
    if(e.eshieldMax){ e.mesh.eFill.visible = e.eshield > 0; if(e.eshield > 0) e.mesh.eFill.scale.x = Math.max(0.001, e.eshield/e.eshieldMax); }
    W.animateExtra(e.mesh, G.t + e.dist); W.animateRank(e.mesh, G.t + e.dist);
    // tint: hit flash, frozen, chill build-up, burning, poisoned, enraged, guarded, hasted
    const m = e.mesh.bodyM;
    if(e.ab.cloak || e.invisT>0 || e.invis || m.opacity < 1){ const want = e.invis ? 0.12 : ((e.d.ghost || e.ghost) ? 0.55 : (e.isClone ? 0.7 : 1)); m.opacity += (want - m.opacity)*Math.min(1, dt*8); if(Math.abs(m.opacity-want) < 0.01) m.opacity = want; m.transparent = true; e.mesh.bar.visible = !e.invis; }
    const tS = e.mesh.torsoS;
    if(e.flash>0){ e.flash -= dt; if(tS) e.mesh.torso.scale.copy(tS).multiplyScalar(1.12); else e.mesh.torso.scale.setScalar(1.18); m.emissive.setHex(0xffffff); m.emissiveIntensity = 0.55; }
    else { if(tS) e.mesh.torso.scale.copy(tS); else e.mesh.torso.scale.set(1,1.15,0.9);
      if(e.frozen>0){ m.color.setHex(0xbdf3ff); m.emissive.setHex(e.brittle ? 0xb07cff : 0x7fd4ff); m.emissiveIntensity = 0.45; }
      else if(e.chill>0){ m.color.copy(e.mesh.baseColor).lerp(_ice, Math.min(0.85, e.chill*0.16)); m.emissive.setHex(0x3f9fd8); m.emissiveIntensity = Math.min(0.4, e.chill*0.07); }
      else if(e.burn>0){ m.color.copy(e.mesh.baseColor); m.emissive.setHex(0xff5a1a); m.emissiveIntensity = 0.5; }
      else if(e.poison){ m.color.copy(e.mesh.baseColor).lerp(_tox, 0.35); m.emissive.setHex(0x3a8a1a); m.emissiveIntensity = 0.3 + e.poison.stacks*0.04; }
      else if(e.enraged){ m.color.copy(e.mesh.baseColor); m.emissive.setHex(0xff2020); m.emissiveIntensity = 0.55 + Math.sin(G.t*14)*0.2; }
      else if(e.guarded){ m.color.copy(e.mesh.baseColor); m.emissive.setHex(0x2ec4b6); m.emissiveIntensity = 0.35; }
      else if(e.hasted){ m.color.copy(e.mesh.baseColor); m.emissive.setHex(0xff7a3c); m.emissiveIntensity = 0.3; }
      else { m.color.copy(e.mesh.baseColor); m.emissive.setHex(e.big||e.d.mini ? e.mesh.baseColor.getHex() : (G.nightK > 0.5 && e.d.night ? 0x201030 : 0x000000)); m.emissiveIntensity = 0.25; } }
    if(e.hasted && Math.random()<dt*6) W.burst(e.pos.x, e.pos.y+0.15, e.pos.z, 0xffa03c, 1, 0.6, 0.35, 1.6, 0, 0.5);
    if(e.led && Math.random()<dt*2) W.burst(e.pos.x, e.pos.y+0.2, e.pos.z, 0xffc857, 1, 0.5, 0.4, 1.4, 0, 0.5);
    if(e.slow>0 && Math.random()<dt*6) W.burst(e.pos.x, e.pos.y+0.25, e.pos.z, 0xbdf3ff, 1, 0.5, 0.5, 1.6, 0.5, 1);
    if(e.frozen>0 && Math.random()<dt*4) W.burst(e.pos.x, e.pos.y+0.5, e.pos.z, 0xffffff, 1, 0.4, 0.6, 1.8, 0.2, 1);
    if(e.mesh.bossGlow) e.mesh.bossGlow.material.opacity = 0.3 + Math.sin(G.t*4)*0.1 + (e.enraged?0.2:0);
  }
  if(G.phase==='wave' && !G.queue.length && !G.enemies.length && !G.over) waveCleared();
}
const _tox = new (window.THREE.Color)(0x9dff5a);
const _ice = new (window.THREE.Color)(0xbdf3ff);

// ===================================================================
// v8 — bestiary behaviours, boss traits, tower battle levels, modes,
// mutators, Twin Keeps, spreading hazards, rockfall
// ===================================================================
const V3c = (x,y,z)=>new (window.THREE.Vector3)(x,y,z);
function castleFor(e){ const cs = G.map.castles; if(!cs || cs.length < 2) return G.map.castle.position; let best = cs[0], bd = 1e9; for(const c of cs){ const d2 = (c.position.x-e.pos.x)**2 + (c.position.z-e.pos.z)**2; if(d2 < bd){ bd = d2; best = c; } } return best.position; }
// ---- bestiary: first sightings ----
function seeEnemy(type){
  if(!SAVE.seen) SAVE.seen = [];
  if(SAVE.seen.includes(type)) return;
  SAVE.seen.push(type); persistSoon();
  if(!NO_INTRO.includes(type) && ENEMIES[type].note && G.phase!=='menu'){ if(G.newQ.length < 3) G.newQ.push(type); else G.newExtra = (G.newExtra||0) + 1; }
  if(SAVE.seen.length >= 30) chCheck();
}
// per-frame v8 systems that are not tied to one enemy
function v8Tick(dt){
  // delayed actions (meteor warnings etc.) respect pause and game speed
  if(G.later && G.later.length){ for(let i=G.later.length-1;i>=0;i--){ const l = G.later[i]; l.t -= dt; if(l.t <= 0){ G.later.splice(i,1); if(!G.over) try{ l.fn(); }catch(err){ console.error(err); } } } }
  // Time Attack clock (game time: speeding up doesn't cheat it)
  if(G.clock > 0 && (G.phase==='wave' || G.phase==='build')){ G.clock -= dt; const sec = Math.max(0, Math.ceil(G.clock));
    if(sec !== G.clockShown){ G.clockShown = sec; const el = $('hClock'); if(el){ el.textContent = Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'); el.parentElement.classList.toggle('low', sec <= 60); } if(sec === 60) toast('⏱️ One minute left!', 'bad'); }
    if(G.clock <= 0 && !G.over){ G.clock = 0; G.timeUp = true; toast('⏱️ TIME\'S UP!', 'bad'); finish(false); return; } }
  // new enemy introductions, one at a time
  if(G.newQ && G.newQ.length && G.phase==='wave'){ G.newT -= dt; if(G.newT <= 0){ const k = G.newQ.shift(), d = ENEMIES[k]; G.newT = 3.6;
      showEvBanner({ icon:'📖', name:'NEW ENEMY: '+d.name.toUpperCase(), desc:d.note }); } }
  // debuff auras on towers: frost, jamming, plague clouds (refreshed 5× a second)
  G.debT -= dt;
  if(G.debT <= 0){ G.debT = 0.2; for(const t of G.towers){ t.chilled = false; t.jammed = false; t.sick = false; }
    G.magnets = [];
    for(const e of G.enemies){ if(e.dead) continue; const d = e.d;
      if(d.magnet) G.magnets.push(e);
      if(d.chillTowers || d.jam){ const R = d.chillTowers || d.jam, R2 = R*R; for(const t of G.towers){ if(isStruct(t)) continue; const dx = t.x-e.pos.x, dz = t.z-e.pos.z; if(dx*dx+dz*dz <= R2){ if(d.chillTowers) t.chilled = true; else t.jammed = true; } } } }
    for(const c of G.clouds){ for(const t of G.towers){ if(isStruct(t)) continue; if(Math.abs(t.x-c.x) <= 1.25 && Math.abs(t.z-c.z) <= 1.25) t.sick = true; } } }
  // blazer trails and plague clouds fade
  for(let i=G.blaze.length-1;i>=0;i--){ const b = G.blaze[i]; b.t -= dt; if(b.t <= 0){ G.blaze.splice(i,1); continue; } if(Math.random() < dt*3) W.burst(b.x, 0.08, b.z, Math.random()<0.5 ? 0xff5a1a : 0xffb347, 1, 0.5, 0.5, 2, -1, 0.3); }
  for(let i=G.clouds.length-1;i>=0;i--){ const c = G.clouds[i]; c.t -= dt; if(c.t <= 0){ W.freeFire(c.mesh); G.clouds.splice(i,1); continue; } c.mesh.scale.set(0.55*Math.min(1, c.t), 1, 0.55*Math.min(1, c.t)); if(Math.random() < dt*6) W.burst(c.x+(Math.random()-0.5)*0.6, 0.3, c.z+(Math.random()-0.5)*0.6, 0x9dff5a, 1, 0.4, 0.9, 3, -0.8, 0.4); }
  if(G.blaze.length){ for(const e of G.enemies){ if(e.dead || e.air || e.d.fireTrail) continue; if(e.blazeT > 0) e.blazeT -= dt; for(const b of G.blaze){ const dx = e.pos.x-b.x, dz = e.pos.z-b.z; if(dx*dx+dz*dz < 0.16){ e.blazeT = 1.2; break; } } } }
  // falling boulders
  for(let i=G.rocks.length-1;i>=0;i--){ const r = G.rocks[i]; r.y -= dt*9; r.mesh.position.y = Math.max(0, r.y); r.mesh.rotation.x += dt*6;
    if(r.y <= 0){ G.rocks.splice(i,1); r.mesh.rotation.x = 0.3; W.debris(r.x, 0.3, r.z, TD.THEMES[G.map.theme].rock, 14, 3); W.burst(r.x, 0.2, r.z, 0xd8c9a0, 40, 3, 0.7, 4, 4, 1.8); W.shock(r.x, r.z, 0xd8c9a0, 1.4, 0.5); sfx('stomp'); W.shake(0.2);
      if(G.grid.has(r.cx+','+r.cz) || G.objs.has(r.cx+','+r.cz)){ W.removeObject(r.mesh); continue; }
      G.objs.set(r.cx+','+r.cz, { type:'boulder', cx:r.cx, cz:r.cz, x:r.x, z:r.z, mesh:r.mesh, age:3 }); } }
}
// v8 enemy behaviours; returns true when the enemy is gone
function v8Enemy(e, dt, busy){
  const d = e.d;
  if(e.spirit != null){ e.spirit -= dt; if(Math.random() < dt*10) W.burst(e.pos.x, e.pos.y+0.5, e.pos.z, 0xb07cff, 1, 0.6, 0.6, 2.2, -1, 0.6);
    if(e.spirit <= 0){ e.dead = true; G.waveDone++; W.portalFx(e.pos.x, e.pos.z, 0xb07cff); num(e.pos.x, e.pos.y+1, e.pos.z, '👻 faded', 'blk'); W.freeEnemy(e.mesh); e.mesh.userData.keep = false; return true; } }
  if(e.regen && e.burn <= 0 && !e.poison && e.hp < e.maxHp && !busy){ e.hp = Math.min(e.maxHp, e.hp + e.maxHp*e.regen*dt); if(Math.random() < dt*3) W.burst(e.pos.x, e.pos.y+0.5, e.pos.z, 0x6aff9a, 1, 0.6, 0.5, 2, -1.5, 0.6); }
  if(e.burT != null && !busy){
    if(e.under > 0){ e.under -= dt; e.invis = true; if(Math.random() < dt*16) W.burst(e.pos.x, 0.1, e.pos.z, 0x8a6a3a, 1, 1.2, 0.5, 2.4, 3, 0.8);
      if(e.under <= 0){ e.under = 0; e.invis = false; e.burT = 3.8 + Math.random()*1.5; W.debris(e.pos.x, 0.2, e.pos.z, 0x8a6a3a, 10, 2.4); W.burst(e.pos.x, 0.2, e.pos.z, 0xd8c9a0, 24, 2.6, 0.6, 3, 4, 1.4); W.shock(e.pos.x, e.pos.z, 0x8a6a3a, 1, 0.4); sfx('stomp'); } }
    else { e.burT -= dt; if(e.burT <= 0){ e.under = 1.8; e.invis = true; W.debris(e.pos.x, 0.2, e.pos.z, 0x8a6a3a, 8, 2); W.burst(e.pos.x, 0.2, e.pos.z, 0xd8c9a0, 20, 2.2, 0.6, 3, 4, 1.2); num(e.pos.x, e.pos.y+0.9, e.pos.z, '⛏️ BURROW', 'blk'); } } }
  if(e.dropT != null && !busy && !e.air){ e.dropT -= dt;
    if(e.dropT <= 0){ if(d.fireTrail){ e.dropT = 0.4; if(G.blaze.length < 45) G.blaze.push({ x:e.pos.x, z:e.pos.z, t:3 }); }
      else { e.dropT = 1.5; if(G.clouds.length < 12) G.clouds.push({ x:e.pos.x, z:e.pos.z, t:4.5, mesh:W.firePatch(e.pos.x, e.pos.z, 0.55, 0x7ad83a) }); } } }
  if(e.sumT != null && !busy){ e.sumT -= dt;
    if(e.sumT <= 0){ e.sumT = d.summon;
      if(e.sumN < 6){ e.sumN += 2; for(let i=0;i<2;i++){ const m = spawn('skeleton', e.pos, e.seg, e.route, { plain:true }); m.dist = e.dist - 0.15*(i+1); m.pos.x += (Math.random()-0.5)*0.4; m.pos.z += (Math.random()-0.5)*0.4; if(e.sab) m.sab = null; }
        W.shock(e.pos.x, e.pos.z, 0xb04cff, 1.2, 0.5); W.burst(e.pos.x, 0.3, e.pos.z, 0xb04cff, 24, 2.4, 0.6, 3, 2, 1.4); num(e.pos.x, e.pos.y+1.1, e.pos.z, '💀 RAISE DEAD', 'bolt'); sfx('portal'); } } }
  return false;
}
// the Mirror Imp splits off a copy at half health
function cloneImp(e){
  e.cloned = true; const c = spawn(e.type, e.pos, e.seg, e.route, { plain:true }); c.cloned = true; c.hp = e.hp; c.maxHp = e.maxHp; c.dist = e.dist - 0.25; c.gold = Math.round(e.gold*0.5); if(e.sab) c.sab = null;
  c.pos.x += (Math.random()-0.5)*0.3; c.pos.z += (Math.random()-0.5)*0.3; c.grow = 0.5;
  W.flash(e.pos.x, e.pos.y+0.6, e.pos.z, 0xdff6ff, 2, 0.3); W.burst(e.pos.x, e.pos.y+0.6, e.pos.z, 0xdff6ff, 24, 2.4, 0.5, 3, 1, 1.4); num(e.pos.x, e.pos.y+1.1, e.pos.z, '🪞 SPLIT!', 'bolt'); sfx('portal');
}
// the Possessed leaves a spirit behind
function spawnSpirit(e){
  const s = spawn(e.type, e.pos, e.seg, e.route, { plain:true }); s.spirit = 6; s.ghost = true; s.hp = s.maxHp = Math.round(e.maxHp*0.45); s.speed = e.speed*1.25; s.dist = e.dist; s.gold = Math.round(e.gold*0.5);
  s.mesh.bodyM.transparent = true; s.mesh.bodyM.opacity = 0.45; s.mesh.baseColor.setHex(0xb07cff); s.grow = 0.4; if(e.sab) s.sab = null;
  W.portalFx(e.pos.x, e.pos.z, 0xb07cff); num(e.pos.x, e.pos.y+1.2, e.pos.z, '👻 SPIRIT', 'bolt');
}
// the Volatile explodes: nearby towers are stunned
function volatileBlast(e){
  const R = e.d.deathBlast || 1.4, x = e.pos.x, z = e.pos.z;
  W.burst(x, 0.5, z, 0xffd24a, 50, 4, 0.6, 4, 3, 2); W.burst(x, 0.4, z, 0xff5a1a, 30, 3, 0.5, 3, 2, 1.6); W.shock(x, z, 0xffd24a, R, 0.5); W.flash(x, 0.7, z, 0xffe14b, 3, 0.3); sfx('boom'); W.shake(0.12);
  towersNear(x, z, R).forEach(t=>{ if(!TOWERS[t.type].onPath) disableTower(t, 1.2, 'stun'); });
}
// arrows, ice shards and acid bend towards a Magnetron nearby
function magnetFor(tg){
  if(!G.magnets || !G.magnets.length || !tg || tg.d.magnet) return null;
  for(const m of G.magnets){ if(m.dead || m.invis) continue; const R = m.d.magnet; if(m.pos.distanceToSquared(tg.pos) <= R*R) return m; }
  return null;
}
// ---- towers: battle levels and perks during a match ----
function towerXp(t, e){
  if(t.xp == null){ t.xp = 0; t.vl = 1; t.perks = []; }
  const V = TD.VETERANCY; if(t.vl >= V.xp.length) return;
  t.xp += e.big ? 10 : (e.d.mini ? 5 : ((e.elite || e.mutated) ? 3 : 1));
  while(t.vl < V.xp.length && t.xp >= V.xp[t.vl]){ t.vl++; towerLevelUp(t); }
}
function towerLevelUp(t){
  const V = TD.VETERANCY, D = TOWERS[t.type];
  W.towerStars(t.mesh, t.vl-1); W.burst(t.x, 1.2, t.z, 0xffd24a, 30, 2.6, 0.7, 3, 2, 1.8); W.shock(t.x, t.z, 0xffd24a, 1.2, 0.5); num(t.x, 1.7, t.z, '★ LEVEL '+t.vl, 'long'); sfx('upgrade');
  if(V.perkAt.includes(t.vl)){
    const pool = TD.TOWER_PERKS.filter(p=>!t.perks.includes(p.id) && !(p.id==='deepfreeze' && D.proj==='beam') && !(p.id==='bounty' && t.type==='bank'));
    if(pool.length){ const P = pool[Math.floor(Math.random()*pool.length)]; t.perks.push(P.id);
      toast(P.icon+' '+D.name+' reached battle level '+t.vl+' — new perk: '+P.name+' ('+P.desc.replace(/\.$/, '')+')', 'good'); num(t.x, 2.0, t.z, P.icon+' '+P.name, 'combo'); }
  }
  if(t.vl >= V.xp.length) chMark('veteran5');
  if(G.sel===t) renderPanel();
}
// ---- bosses: universal mechanics + traits ----
function bossTraitsFor(e){
  if(e.type==='megaboss') return TD.MEGA.traits.slice();
  if(e.type==='airboss') return TD.AIRBOSS_TRAITS.slice();
  const id = (G.mode==='bossrush' && G.bossDef && G.bossDef.map) || G.map.id;
  return (TD.BOSS_TRAIT_BY_MAP[id] || ['summon','heal']).slice();
}
function hasTrait(e, k){ return !!(e.traits && e.traits.includes(k)); }
function initBoss(e){
  e.traits = bossTraitsFor(e); const U = TD.BOSS_UNIVERSAL;
  e.weakCd = U.weakEvery*0.6; e.weakT = 0; e.trT = { summon:9, meteor:7, freeze:10, siege:6, roam:12 };
  if(hasTrait(e,'armor')){ e.plateHp = Math.round(e.maxHp*0.3); W.bossPlates(e.mesh, true); }
  if(G.boss===e) showBossBar(e);
}
function bossTick(e, dt){
  if(e.isClone || e.dead) return;
  const U = TD.BOSS_UNIVERSAL, busy = e.frozen > 0 || e.stun > 0;
  // weak point
  if(e.weakT > 0){ e.weakT -= dt; if(e.weakT <= 0){ e.weakT = 0; W.weakPoint(e.mesh, false); } }
  else { e.weakCd -= dt; if(e.weakCd <= 0){ e.weakCd = U.weakEvery; e.weakT = U.weakT; W.weakPoint(e.mesh, true); W.flash(e.pos.x, 1.2, e.pos.z, 0xff2a4a, 2.4, 0.3); num(e.pos.x, e.pos.y+1.8, e.pos.z, '🎯 WEAK POINT!', 'crit'); sfx('coin');
      if(!G.weakSeen){ G.weakSeen = true; toast('🎯 WEAK POINT exposed — all damage +'+Math.round((U.weakMul-1)*100)+'% for '+U.weakT+' seconds!', 'good'); } } }
  if(busy || !e.traits) return;
  const T = e.trT, sp = e.final ? 0.85 : (e.enraged ? 0.92 : 1);
  for(const k of ['summon','meteor','freeze','siege','roam']){ if(!hasTrait(e,k)) continue; T[k] -= dt; if(T[k] > 0) continue;
    T[k] = { summon:13, meteor:12, freeze:13, siege:12, roam:16 }[k]*sp; bossTrait(e, k); if(e.dead) return; }
}
function towerTargets(n, near){
  let ts = G.towers.filter(t=>t.dis<=0 && !TOWERS[t.type].onPath && !isStruct(t));
  if(near) ts = ts.filter(t=>Math.hypot(t.x-near.pos.x, t.z-near.pos.z) <= 5.5);
  return ts.sort((a,b)=>towerValue(b)-towerValue(a) + (Math.random()-0.5)*40).slice(0, n);
}
function traitToast(e, k){ const B = TD.BOSS_TRAITS[k]; toast('👑 '+(e.bname||bossInfo().boss)+': '+B.icon+' '+B.name+'!', 'bad'); if(G.boss===e){ $('bbSkill').textContent = B.icon+' '+B.name; $('bossBar').classList.remove('cast'); void $('bossBar').offsetWidth; $('bossBar').classList.add('cast'); } }
function bossTrait(e, k){
  const p = e.pos;
  if(k==='summon'){
    const pack = G.wave < 15 ? ['grunt','grunt','runner'] : (G.wave < 25 ? ['knight','runner','knight','runner'] : ['knight','brute','runner','runner']);
    pack.forEach((type,i)=>{ const m = spawn(type, e.pos, e.seg, e.route, G.wave >= 25 && i===0 ? { elite:true } : { plain:true }); m.dist = e.dist - 0.2*(i+1); m.pos.x += (Math.random()-0.5)*0.5; m.pos.z += (Math.random()-0.5)*0.5; });
    W.portalFx(p.x, p.z, 0xff3c3c); sfx('horn'); traitToast(e, k);
  }else if(k==='meteor'){
    const ts = towerTargets(2); if(!ts.length) return;
    ts.forEach(t=>W.warnMark(t.x, t.z, 0.75, 0xff5a1a, 1.5));
    traitToast(e, k); sfx('phase');
    later(1.5, ()=>ts.forEach((t,i)=>{ if(!G.towers.includes(t)) return; const mesh = W.projMesh('meteor'); mesh.scale.setScalar(0.55); const from = V3c(t.x+1.5, 9, t.z-1.5); mesh.position.copy(from);
      G.projs.push({ kind:'meteor', mesh, from, to:V3c(t.x, 0.3, t.z), t:-i*0.12, dur:0.55, lava:true, disT:2, tower:t, dmg:0, splash:0 }); }));
  }else if(k==='freeze'){
    const ts = towerTargets(2); if(!ts.length) return;
    ts.forEach(t=>W.warnMark(t.x, t.z, 0.7, 0x7fd4ff, 1.2));
    traitToast(e, k);
    later(1.2, ()=>{ if(e.dead) return; ts.forEach(t=>{ if(!G.towers.includes(t)) return; W.bolt(headPos(e).clone(), V3c(t.x, 1, t.z), 0xbdf3ff, 0.07, true); disableTower(t, 2.5, 'ice'); W.burst(t.x, 0.8, t.z, 0xbdf3ff, 26, 2.6, 0.7, 3, 1, 1.8); }); sfx('freeze'); sfx('shatter'); });
  }else if(k==='siege'){
    const near = G.towers.filter(t=>t.dis<=0 && !TOWERS[t.type].onPath && !isStruct(t) && Math.hypot(t.x-e.pos.x, t.z-e.pos.z) <= 5); if(!near.length) return; const t = near[Math.floor(Math.random()*near.length)];
    W.warnMark(t.x, t.z, 0.8, 0xffa03c, 1.2); traitToast(e, k); sfx('stomp');
    later(0.6, ()=>{ if(e.dead || !G.towers.includes(t)) return; const hp = headPos(e).clone(), mesh = W.projMesh('meteor'); mesh.scale.setScalar(0.6); mesh.position.copy(hp);
      G.projs.push({ kind:'meteor', mesh, from:hp, to:V3c(t.x, 0.3, t.z), t:0, dur:0.6, lava:true, bomb:true, siege:true, disT:1.2, tower:t, dmg:0, splash:0 }); });
  }else if(k==='roam'){
    if(e.air) return;
    const others = G.map.routeDefs.filter(r=>r.open && r.route !== e.route && r.rev !== e.route);
    let best = null; for(const r of others){ const R = G.mirror ? (r.rev || (r.rev = r.route.slice().reverse())) : r.route; const s2 = snapToRoute(R, e.pos.x, e.pos.z); if(s2 && s2.d < 3.2 && (!best || s2.d < best.d)){ best = s2; best.R = R; } }
    W.portalFx(p.x, p.z, 0xffa03c);
    if(best && best.dist < (best.total - 2)){ e.route = best.R; e.seg = best.seg; e.pos.x = best.x; e.pos.z = best.z; e.dist = best.dist; e.reached = false; num(e.pos.x, e.pos.y+1.5, e.pos.z, '🔀 NEW ROAD!', 'crit'); }
    else { advance(e, 1.1); num(e.pos.x, e.pos.y+1.5, e.pos.z, '🔀 BLINK!', 'crit'); }
    W.portalFx(e.pos.x, e.pos.z, 0xffa03c); sfx('portal'); traitToast(e, k);
  }
}
// closest point on a road, with its segment and distance along the road
function snapToRoute(R, x, z){
  let acc = 0, best = null;
  for(let i=0;i<R.length-1;i++){ const a = R[i], b = R[i+1], dx = b.x-a.x, dz = b.z-a.z, L = Math.hypot(dx,dz); if(L < 1e-6) continue;
    const k = clamp(((x-a.x)*dx + (z-a.z)*dz)/(L*L), 0, 1), px = a.x+dx*k, pz = a.z+dz*k, d = Math.hypot(px-x, pz-z);
    if(!best || d < best.d) best = { d, seg:i, x:px, z:pz, dist:acc + k*L }; acc += L; }
  if(best) best.total = acc; return best;
}
// health-triggered traits: clone, great shield, second wind, last-ditch attack
function bossTraitHp(e){
  if(e.dead || e.hp <= 0 || e.isClone) return; const r = e.hp/e.maxHp, p = e.pos;
  if(hasTrait(e,'clone') && !e.didClone && r <= 0.6){ e.didClone = true;
    const c = spawn(e.type==='megaboss' ? 'boss' : e.type, e.pos, e.seg, e.route, { clone:true, plain:true }); c.isClone = true; c.hp = c.maxHp = Math.round(e.maxHp/3); c.phase = TD.BOSS_STAGES.length; c.stage = 4; c.traits = [];
    c.scale = e.scale*0.78; c.grow = 0.3; c.gold = Math.round(e.gold*0.3); c.lives = 1; c.dist = e.dist - 0.35; c.bname = (e.bname||bossInfo().boss)+'\'s Shade'; c.speed = e.speed*1.1;
    c.mesh.bodyM.transparent = true; c.mesh.bodyM.opacity = 0.7; c.mesh.baseColor.setHex(0x9a7aff); if(e.air){ c.air = true; }
    W.portalFx(p.x, p.z, 0x9a7aff); W.flash(p.x, 1.2, p.z, 0xffffff, 4, 0.4); sfx('portal'); traitToast(e, 'clone'); }
  if(hasTrait(e,'bulwark') && !e.didBul && r <= 0.5){ e.didBul = true; e.bshield = Math.round(e.maxHp*0.25); e.bshieldT = 8; W.bubble(e.mesh, true); W.shock(p.x, p.z, 0x7fd4ff, 3, 0.7); sfx('shatter'); traitToast(e, 'bulwark'); }
  if(hasTrait(e,'heal') && !e.didHeal && r <= 0.3){ e.didHeal = true; const a = Math.round(e.maxHp*0.15); e.hp = Math.min(e.maxHp, e.hp + a);
    W.burst(p.x, 1, p.z, 0x52e07a, 70, 4, 1, 4, -1, 2.2); W.shock(p.x, p.z, 0x52e07a, 2.6, 0.7); num(p.x, e.pos.y+2, p.z, '💚 +'+a, 'heal'); sfx('heal'); traitToast(e, 'heal'); }
  if(!e.didLast && r <= TD.BOSS_UNIVERSAL.finalAt){ e.didLast = true; lastDitch(e); }
}
// at 6% health a boss throws everything it has left
function lastDitch(e){
  const p = e.pos;
  towersNear(p.x, p.z, 2.5).forEach(t=>{ if(!TOWERS[t.type].onPath) disableTower(t, 1.5, 'emp'); });
  e.bshield = Math.max(e.bshield, Math.round(e.maxHp*0.05)); e.bshieldT = 3; W.bubble(e.mesh, true);
  for(let i=0;i<3;i++) setTimeout(()=>W.shock(p.x, p.z, i===1 ? 0xffffff : 0xff2a4a, 2.5+i*1.1, 0.7), i*120);
  W.flash(p.x, 1.2, p.z, 0xff2a4a, 6, 0.5); W.shake(0.5); W.punch(0.5); sfx('emp'); sfx('bossin');
  showEvBanner({ icon:'☠️', name:'DEATH THROES', desc:(e.bname||bossInfo().boss)+' unleashes a final attack — finish it off!' });
}
// a boss falls: duo vengeance, mega boss rewards
function bossDown(e){
  G.bossKillsWave = (G.bossKillsWave||0) + 1; if(G.bossKillsWave >= 2) chMark('duo');
  if(e.type==='megaboss'){ chMark('megaboss'); addCrystals(3); if(G.mode!=='bossrush') addCores(2, 'Mega Boss slain'); G.bonusCoins = (G.bonusCoins||0) + 150; showEvBanner({ icon:'🗻', name:'TITAN SLAIN', desc:TD.MEGA.name+' falls — +3 💎, +2 🔮, +150 coins' }); }
  const other = G.enemies.find(o=>!o.dead && o.big && !o.isClone && o!==e);
  if(other && !other.vengeful){ other.vengeful = true; const a = Math.round(other.maxHp*0.1); other.hp = Math.min(other.maxHp, other.hp + a); other.speed *= 1.05; other.armor += 2;
    W.shock(other.pos.x, other.pos.z, 0xff2020, 3, 0.8); W.burst(other.pos.x, 1, other.pos.z, 0xff3030, 60, 4, 0.8, 4, 2, 2); num(other.pos.x, other.pos.y+2, other.pos.z, '💢 VENGEANCE', 'crit');
    setTimeout(()=>showEvBanner({ icon:'💢', name:'VENGEANCE', desc:(other.bname||bossInfo().boss)+' avenges its partner: heals 10%, faster and tougher!' }), 1400); }
}
// ---- maps: spreading lava, breaking ice ----
function spreadWarnNext(){
  const S = G.map.spread; if(!S || G.mode==='bossrush') return; const n = G.wave + 1;
  if(n < S.from || (n - S.from) % S.every !== 0 || G.spreadN >= S.max) return;
  const P = G.map.pathSet, cand = [];
  for(let x=0;x<G.map.w;x++) for(let z=0;z<G.map.h;z++){ const k = x+','+z; if(P.has(k) || G.objs.has(k) || G.grid.has(k)) continue;
    let near = false; for(let dx=-1;dx<=1 && !near;dx++) for(let dz=-1;dz<=1;dz++) if(P.has((x+dx)+','+(z+dz))){ near = true; break; }
    const ends = [G.map.path[0], G.map.path[G.map.path.length-1]]; if(ends.some(p=>Math.abs(p[0]-x)+Math.abs(p[1]-z) <= 1)) continue;
    cand.push([x, z, near]); }
  // prefer tiles next to the road, spread out a little
  cand.sort((a,b)=>(b[2]-a[2]) || (Math.random()-0.5)); const pick = [];
  for(const c of cand){ if(pick.length >= Math.min(S.n, S.max - G.spreadN)) break; if(pick.some(q=>Math.abs(q[0]-c[0])+Math.abs(q[1]-c[1]) < 3)) continue; pick.push(c); }
  if(!pick.length) return;
  for(const [x,z] of pick){ const mesh = W.makeHazard('crack'); mesh.position.set(x+0.5, 0, z+0.5); G.objs.set(x+','+z, { type:'crack', kind:S.kind, cx:x, cz:z, x:x+0.5, z:z+0.5, mesh }); G.spreadWarn.push(x+','+z); }
  setTimeout(()=>showEvBanner({ icon:S.kind==='lava' ? '🌋' : '🧊', name:S.kind==='lava' ? 'THE LAVA IS SPREADING' : 'THE ICE IS CRACKING', desc:pick.length+' tiles marked ⚠️ will be swallowed next wave — plan around them.' }), 1800);
}
function spreadBreak(){
  if(!G.spreadWarn || !G.spreadWarn.length) return;
  for(const k of G.spreadWarn){ const o = G.objs.get(k); if(!o || o.type!=='crack') continue; W.removeObject(o.mesh);
    const kind = o.kind==='lava' ? 'lava' : 'water', mesh = W.makeHazard(kind); mesh.position.set(o.x, 0, o.z);
    G.objs.set(k, { type:kind, cx:o.cx, cz:o.cz, x:o.x, z:o.z, mesh }); G.spreadN++;
    W.burst(o.x, 0.3, o.z, kind==='lava' ? 0xff5a1a : 0xbdf3ff, 36, 3, 0.8, 3.5, 4, 1.6); W.debris(o.x, 0.2, o.z, kind==='lava' ? 0x3a1a14 : 0xdff6ff, 10, 2.4); W.shock(o.x, o.z, kind==='lava' ? 0xff5a1a : 0x7fd4ff, 1.2, 0.5); }
  G.spreadWarn = []; sfx('bigboom'); W.shake(0.25);
}
// ---- rockfall event: boulders land on free tiles ----
function rockfallDrop(){
  if(!(G.rockfall > 0) || G.mode==='bossrush') return; G.rockfall--;
  const free = []; for(let x=0;x<G.map.w;x++) for(let z=0;z<G.map.h;z++) if(cellFree(x,z)) free.push([x,z]);
  for(let i=0;i<2 && free.length;i++){ const j = Math.floor(Math.random()*free.length), [x,z] = free.splice(j,1)[0];
    const mesh = W.makeHazard('boulder'); mesh.position.set(x+0.5, 8, z+0.5); G.rocks.push({ mesh, x:x+0.5, z:z+0.5, cx:x, cz:z, y:8 + i*2 }); }
  toast('🪨 ROCKFALL — boulders crash down! Smash one for a 💎', 'bad'); renderChips();
}
function bouldersAge(){
  for(const o of [...G.objs.values()]){ if(o.type!=='boulder') continue; o.age--; if(o.age > 0) continue;
    G.objs.delete(o.cx+','+o.cz); W.removeObject(o.mesh); W.debris(o.x, 0.3, o.z, TD.THEMES[G.map.theme].rock, 10, 2); W.burst(o.x, 0.2, o.z, 0xcfc8b8, 20, 2, 0.6, 3, 3, 1.2); if(G.selObj===o){ G.selObj = null; renderPanel(); } }
}
// ---- menu: mutators ----
function renderMutators(mode){
  const host = $('mutRow'); if(!host) return; const ok = TD.MUTATOR_MODES.includes(mode);
  host.style.display = ok ? '' : 'none'; if(!ok) return;
  const on = SAVE.mutators || (SAVE.mutators = []); let r = 0; on.forEach(id=>{ const M = TD.MUTATORS.find(x=>x.id===id); if(M) r += M.reward; });
  host.innerHTML = '<div class="mutHead">🎲 Mutators <span>'+(on.length ? '+'+Math.round(r*100)+'% XP & coins' : 'harder match, bigger rewards')+'</span></div>'+
    TD.MUTATORS.map(M=>'<button class="mutBtn'+(on.includes(M.id)?' on':'')+'" data-m="'+M.id+'" title="'+M.desc+'"><b>'+M.icon+' '+M.name+'</b><span>'+M.desc+' · +'+Math.round(M.reward*100)+'%</span></button>').join('');
  host.querySelectorAll('.mutBtn').forEach(b=>b.addEventListener('click', ()=>{ const id = b.dataset.m, i = on.indexOf(id); if(i>=0) on.splice(i,1); else on.push(id); persistSoon(); sfx('click'); renderMaps(); }));
}
// ---- menu: bestiary ----
function renderBestiary(){
  const seen = SAVE.seen || [], all = Object.keys(ENEMIES).filter(k=>!TD.BESTIARY_SKIP.includes(k)), met = all.filter(k=>seen.includes(k)).length;
  const hex = c=>'#'+c.toString(16).padStart(6,'0');
  const when = d=>d.mini ? 'mini-boss' : (d.night ? 'night waves' : (d.reality ? 'Alternate Reality' : (d.from >= 99 ? 'summoned' : 'wave '+d.from+'+')));
  let h = '<div class="bsProg"><b>📖 '+met+' / '+all.length+' enemies met</b><span>Tap an enemy in battle to see its level, health and powers. Meeting 30 types earns 🏆 Monster Hunter.</span><i style="width:'+Math.round(met/all.length*100)+'%"></i></div>';
  h += '<div class="bsGrid">'+all.map(k=>{ const d = ENEMIES[k], s2 = seen.includes(k);
    return '<div class="bsCard'+(s2?'':' unk')+(d.mini?' mini':'')+'"><i style="background:'+(s2 ? hex(d.color) : '#2a3040')+'"></i><b>'+(s2 ? d.name : '❔ ???')+'</b><em>'+when(d)+'</em><span>'+(s2 ? (d.note || 'A basic foot soldier.') : 'Not met yet.')+'</span></div>'; }).join('')+'</div>';
  h += '<div class="tiEnemies"><b>⭐ Elite affixes — every elite rolls one</b>'+TD.ELITE_AFFIXES.map(A=>'<span><u>'+A.icon+' '+A.name+'</u> — '+A.desc+'</span>').join('')+'</div>';
  const U = TD.BOSS_UNIVERSAL;
  h += '<div class="tiEnemies boss"><b>👑 How bosses fight</b><span><u>Four stages</u> — at 75% ENRAGED (faster, calls its guard), at 50% it TRANSFORMS and OVERLOADS (EMP), at 25% FINAL FORM.</span><span><u>🎯 Weak point</u> — every '+U.weakEvery+'s it is exposed for '+U.weakT+'s: +'+Math.round((U.weakMul-1)*100)+'% damage.</span><span><u>☠️ Death throes</u> — at '+Math.round(U.finalAt*100)+'% it stuns nearby towers and shields itself one last time.</span><span><u>💢 Vengeance</u> — when two bosses march together, the survivor heals and hardens.</span>'+
    Object.keys(TD.BOSS_TRAITS).map(k=>{ const B = TD.BOSS_TRAITS[k]; return '<span><u>'+B.icon+' '+B.name+'</u> — '+B.desc+'</span>'; }).join('')+'</div>';
  h += '<div class="tiEnemies"><b>🗺️ Boss traits by map</b>'+TD.MAPS.filter(m=>TD.BOSS_TRAIT_BY_MAP[m.id]).map(m=>'<span><u>'+m.boss+'</u> ('+m.name+') — '+TD.BOSS_TRAIT_BY_MAP[m.id].map(k=>TD.BOSS_TRAITS[k].icon+' '+TD.BOSS_TRAITS[k].name).join(' · ')+'</span>').join('')+
    '<span><u>🗻 '+TD.MEGA.name+'</u> (Mega Boss) — endless wave '+TD.MEGA.from+', then every '+TD.MEGA.every+' waves, and Nightmare wave 30: '+TD.MEGA.traits.map(k=>TD.BOSS_TRAITS[k].icon+' '+TD.BOSS_TRAITS[k].name).join(' · ')+'</span></div>';
  h += '<div class="tiEnemies ultl"><b>★ Tower battle levels</b><span>Towers gain battle XP from kills (elites ×3, mini-bosses ×5, bosses ×10) and climb to battle level 6: +'+Math.round(TD.VETERANCY.dmg*100)+'% damage per level. At levels 3 and 5 they roll a random perk:</span>'+
    TD.TOWER_PERKS.map(P=>'<span><u>'+P.icon+' '+P.name+'</u> — '+P.desc+'</span>').join('')+'</div>';
  h += '<div class="tiEnemies syn"><b>🎖️ Master ultimates — tower mastery 10</b>'+Object.keys(TD.MASTER_ULTS).filter(k=>TOWERS[k]).map(k=>{ const ml = mastery(k); return '<span><u>'+TOWERS[k].icon+' '+TD.MASTER_ULTS[k]+'</u> — '+TOWERS[k].name+' · '+(ml >= 10 ? '✅ unlocked' : 'mastery '+ml+' / 10')+'</span>'; }).join('')+'</div>';
  $('bestList').innerHTML = h;
}

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
  G.overdrive = 0; $('odFx').classList.remove('show'); $('perkWrap').classList.remove('show'); $('shopWrap').classList.remove('show'); $('warpFx').classList.remove('show'); $('waveBtn').classList.remove('show'); renderUltBtn();
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
  if(won && G.mode==='nightmare'){ chMark('nightmare'); if(!ms.nightmare) lines.push('😈 Nightmare conquered on '+G.map.name+'!'); ms.nightmare = true; }
  if(won && G.mode==='timeattack'){ chMark('timeatk'); const left = Math.max(0, Math.round(G.clock)); ms.ta = Math.max(ms.ta||0, left); lines.push('⏱️ Beat the clock with '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0')+' to spare'); }
  if(G.mut && G.mut.size){ lines.push('🎲 Mutators '+[...G.mut].map(id=>TD.MUTATORS.find(m=>m.id===id).icon).join('')+'  ·  +'+Math.round(mutReward()*100)+'% rewards'); if(won && G.mut.size >= 3) chMark('mutator3'); }
  // campaign regions, map challenges and the secret map
  const reg = TD.CAMPAIGN.find(c=>c.map===G.map.id);
  if(won && reg && (G.mode==='normal' || G.mode==='hard') && !G.endless && !SAVE.regionDone[G.map.id]){ SAVE.regionDone[G.map.id] = true; SAVE.cores += TD.CORES.region; chBonus += 100;
    const nx = TD.CAMPAIGN[TD.CAMPAIGN.indexOf(reg)+1]; lines.push('🗺️ Region cleared: '+reg.region+'  ·  +'+TD.CORES.region+' 🔮 +100 💰'+(nx ? '  ·  '+nx.icon+' '+nx.region+' unlocked!' : '  ·  THE WORLD IS SAVED!')); }
  if(won && G.mode==='challenge' && ru && TD.MAP_CHALLENGES.includes(ru.id)){ const mc = SAVE.mapCh[G.map.id] || (SAVE.mapCh[G.map.id] = {}); if(!mc[ru.id]){ mc[ru.id] = true; SAVE.cores += TD.CORES.mapCh; lines.push('🏅 Map challenge: '+G.map.name+' — '+ru.icon+' '+ru.name+'  ·  +'+TD.CORES.mapCh+' 🔮'); } }
  if(won && G.map.id==='caverns' && !SAVE.legends.includes('aether')){ SAVE.legends.push('aether'); lines.push('💠 SECRET TOWER: the Aether Prism joins your Legendary Vault!'); }
  if(G.combosRun.size) lines.push('🎯 Combos this match: '+[...G.combosRun].map(id=>TD.COMBOS.find(c=>c.id===id).icon).join(' '));
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
  const tr = (G.map.tiered ? TD.tierReward(G.map.curTier) : 1) * (md.reward||1) * (1 + mutReward());
  const xp = Math.round(TD.gameXp(wavesDone, G.kills, won, stars)*tr*(1+0.1*pr)), coins = Math.round(TD.gameCoins(wavesDone, won, stars)*tr) + chBonus + (G.bonusCoins||0);
  const rp = TD.rpFor(wavesDone, won, G.mode);
  let tierLine = '';
  if(G.map.tiered){ if(won && !G.endless){ ms.tier = (ms.tier||1)+1; tierLine = 'Tier '+G.map.curTier+' cleared → Tier '+ms.tier+' unlocked'; } else tierLine = 'Tier '+G.map.curTier; }
  SAVE.xp += xp; SAVE.coins += coins; SAVE.rp = (SAVE.rp||0) + rp;
  const SS = ensureSeason();
  recordRun({ mode:G.mode, map:G.map.id, wave:wavesDone, won, kills:G.kills, rule:G.rule, date:todayKey(), season:SS.id });
  if(G.endless) SS.best = Math.max(SS.best||0, wavesDone);
  if(won){ sEv('win', 1); if(G.mode==='rogue') sEv('roguewin', 1); if(G.map.effect==='reality') chMark('reality'); }
  const sxp = wavesDone*10 + (won ? 100 : 0); seasonXp(sxp); lines.push('🗓️ Season XP +'+sxp);
  G.replay = { map:G.mapIdx, log:G.log.slice(), waves:wavesDone, won, t:G.t, routes:G.map.routeDefs.map(r=>r.open) };
  persist(); chCheck();
  const lvAfter = plevel();
  if(typeof window.onGameplayStop==='function') window.onGameplayStop();
  sfx(won?'win':'lose');
  const r = $('result'); r.className = 'ov '+(won?'win':'lose');
  $('resTitle').textContent = won ? (G.endless ? 'ENDLESS RUN OVER' : ({ hard:'HARD VICTORY!', challenge:'CHALLENGE WON!', rogue:'RUN COMPLETE!', bossrush:'KING SLAYER!', nightmare:'NIGHTMARE SLAIN!', timeattack:'BEAT THE CLOCK!' }[G.mode] || 'VICTORY!')) : (G.endless ? 'ENDLESS RUN OVER' : (G.timeUp ? 'TIME\'S UP' : 'DEFEAT'));
  $('resSub').textContent = (won ? G.map.name+' defended' : (G.endless ? 'You held '+G.map.name+' for '+wavesDone+' waves' : (G.timeUp ? 'The clock ran out on wave '+G.wave : 'The castle fell on wave '+G.wave))) + (tierLine ? ' · '+tierLine : '') + (G.mode!=='normal' && !G.endless ? ' · '+md.icon+' '+md.name+(ru?' — '+ru.name:'') : '');
  $('resStars').innerHTML = won ? [1,2,3].map(i=>'<span class="'+(i<=stars?'on':'')+'" style="animation-delay:'+(0.25+i*0.22)+'s">★</span>').join('') : '';
  $('resStats').innerHTML = [['Waves', wavesDone],['Kills', G.kills],['Gold', G.earned],['XP', '+'+xp],['Coins', '+'+coins],['Research', '+'+rp]].map(([l,v])=>'<div><b>'+v+'</b><span>'+l+'</span></div>').join('');
  const lu = $('resLevel'); let html = lines.map(l=>'<b class="rl">'+l+'</b>').join('');
  if(lvAfter > lvBefore){ const un = TD.UNLOCKS.filter(u=>u.level>lvBefore && u.level<=lvAfter).map(u=>u.icon+' '+u.text); html += '<b>LEVEL UP → '+lvAfter+'</b>'+(un.length?'<span>Unlocked: '+un.join(', ')+'</span>':''); setTimeout(()=>sfx('level'), 600); }
  else { const li = TD.levelOf(SAVE.xp); html += '<span>Level '+li.level+' · '+li.into+' / '+li.need+' XP</span>'; }
  const nu = nextUnlockInfo(); if(nu) html += '<div class="nuMini"><em>NEXT UNLOCK</em> '+nu.u.icon+' Level '+nu.u.level+' — '+nu.u.text+' <small>('+nu.need+' XP to go)</small><i style="width:'+Math.round(nu.pct*100)+'%"></i></div>';
  lu.innerHTML = html; lu.style.display = '';
  // detailed per-tower statistics
  const rows = Object.keys(G.tst).map(k=>Object.assign({ k }, G.tst[k])).filter(r=>r.dmg>0 || r.kills>0).sort((a,b)=>b.dmg-a.dmg);
  const top = rows.length ? rows[0].dmg : 1;
  $('resTable').innerHTML = rows.length ? '<div class="rtHead"><span>Tower</span><span>Damage</span><span>Kills</span><span>Crits</span><span>Ults</span></div>'+rows.map((r,i)=>'<div class="rtRow'+(i===0?' mvp':'')+'"><span>'+TOWERS[r.k].icon+' '+TOWERS[r.k].name+(i===0?' <em>MVP</em>':'')+'</span><span class="rtDmg"><i style="width:'+Math.round(r.dmg/top*100)+'%"></i><b>'+Math.round(r.dmg).toLocaleString('en-US')+'</b></span><span>'+r.kills+'</span><span>'+r.crits+'</span><span>'+r.ults+'</span></div>').join('') : '';
  $('resTableWrap').style.display = rows.length ? '' : 'none';
  const next = G.mapIdx+1 < TD.MAPS.length && !G.map.tiered && unlocked(G.mapIdx+1) && !TD.MAPS[G.mapIdx+1].tiered;
  $('resNext').style.display = (won && next && !G.endless && (G.mode==='normal'||G.mode==='hard')) ? '' : 'none';
  $('resEndless').style.display = (won && !G.endless && G.mode!=='bossrush') ? '' : 'none';
  $('resRetry').textContent = won ? 'PLAY AGAIN' : 'TRY AGAIN';
  setTimeout(()=>r.classList.add('show'), won ? 700 : 400);
}

// ---- in-game UI ------------------------------------------------------
function renderHud(){
  $('hGold').textContent = G.gold; $('hLives').textContent = G.lives; $('hCry').textContent = G.crystals;
  const ru = ruleDef();
  $('hWave').textContent = (G.phase==='build'||G.phase==='perk'||G.phase==='shop' ? Math.min(G.wave+1, G.endless?999:G.waves) : G.wave) + (G.endless ? '' : ' / '+G.waves) + (G.map.tiered ? '  ·  T'+G.map.curTier : '') + (G.mode==='hard' ? '  💀' : '') + (ru ? '  '+ru.icon : '');
  $('hLives').parentElement.classList.toggle('low', G.lives <= 5 || (G.startLives <= 5 && G.lives <= 1));
  $('hEn').textContent = G.eUsed+'/'+G.eCap; $('hEn').parentElement.classList.toggle('low', G.powerK < 1);
  let left = 0; if(G.phase==='wave'){ left = G.queue.length; for(const e of G.enemies) if(!e.dead) left++; }
  $('hLeft').textContent = G.phase==='wave' ? (G.survT > 0 ? '· 💀 '+Math.ceil(G.survT)+'s' : '· 👾 '+left) : (G.phase==='build' && G.buildTimer > 0 ? '· ⏱ '+Math.ceil(G.buildTimer)+'s' : '');
  $('hProg').style.width = G.phase==='wave' && G.waveTotal ? Math.max(0, Math.min(100, (1 - left/Math.max(G.waveTotal, left))*100)).toFixed(0)+'%' : '0%';
}
function renderSurv(){
  const el = $('survHud'); if(!el) return; const on = G.survT > 0 && G.phase==='wave';
  el.classList.toggle('show', on); if(!on) return;
  const T = TD.survivalTime(G.wave); $('survT').textContent = Math.ceil(G.survT)+'s'; $('survFill').style.width = (G.survT/T*100).toFixed(1)+'%';
}
// small status chips: time of day, weather, events, commander, perks
function renderChips(){
  if(G.phase==='menu'){ $('chips').innerHTML = ''; return; }
  const c = [];
  c.push('<span class="chip">'+(G.night?'🌙 Night':'☀️ Day')+'</span>');
  if(G.mode!=='bossrush' && G.wave >= 1){ const R = TD.RANKS[TD.rankIdx(Math.max(1,G.wave) + (modeDef().rankShift||0))]; c.push('<span class="chip rank" style="color:'+R.color+'" title="'+R.desc+'">'+R.icon+' Rank '+R.roman+'</span>'); }
  if(G.weather!=='clear') c.push('<span class="chip w">'+TD.WEATHER[G.weather].icon+' '+TD.WEATHER[G.weather].name+'</span>');
  if(G.evSurge > 0) c.push('<span class="chip ev">⚡ Surge '+Math.ceil(G.evSurge)+'s</span>');
  const ev = G.waveEv || G.nextEv; if(ev){ const d = TD.EVENTS.find(x=>x.id===ev); if(d) c.push('<span class="chip ev">'+d.icon+' '+d.name.split(' ').map(w=>w[0]+w.slice(1).toLowerCase()).join(' ')+(G.nextEv?' (next)':'')+'</span>'); }
  if(G.cmd > 0) c.push('<span class="chip bad">👑 Commander</span>');
  if(G.waveRisk && G.phase==='wave') c.push('<span class="chip bad">🔴 Risk ×2 gold</span>');
  if(G.mirror && G.phase==='wave') c.push('<span class="chip bad">🪞 Mirror</span>');
  if(G.secretOpen) c.push('<span class="chip ev">🚪 Secret path</span>');
  if(G.timewarp > 0) c.push('<span class="chip ev">⏳ Warp</span>');
  if(G.curRoutes && G.curRoutes.length > 1 && G.phase==='wave') c.push('<span class="chip bad">🔀 Split</span>');
  if(G.powerK < 1) c.push('<span class="chip bad">⚡ Low power −'+Math.round((1-G.powerK)*100)+'%</span>');
  if(G.adapt && G.adapt.lvl > 0 && G.mode!=='bossrush'){ const I = TD.DTYPE_INFO[G.adapt.type]; c.push('<span class="chip bad" title="Enemies evolved against your most-used damage type">🧬 '+I.icon+' −'+Math.round(adaptK()*100)+'%</span>'); }
  if(G.scouts > 0) c.push('<span class="chip bad">🧠 Scouts</span>');
  if(G.choice) c.push('<span class="chip ev">'+G.choice.icon+' '+G.choice.name+'</span>');
  if(G.mode==='rogue'){ const n = Object.values(G.perks).reduce((a,b)=>a+b,0); c.push('<button class="chip pk" id="chipPerks">🃏 '+n+' perks</button>'); }
  if(G.mode==='nightmare') c.push('<span class="chip bad">😈 Nightmare</span>');
  if(G.mut && G.mut.size) c.push('<span class="chip bad" title="Mutators: '+[...G.mut].map(id=>TD.MUTATORS.find(m=>m.id===id).name).join(', ')+'">🎲 '+[...G.mut].map(id=>TD.MUTATORS.find(m=>m.id===id).icon).join('')+' +'+Math.round(mutReward()*100)+'%</span>');
  if(G.rockfall > 0) c.push('<span class="chip ev">🪨 Rockfall ×'+G.rockfall+'</span>');
  $('chips').innerHTML = c.join('');
  const pb = $('chipPerks'); if(pb) pb.onclick = ()=>{ const list = Object.keys(G.perks).map(k=>{ const p = TD.PERKS.find(x=>x.id===k); return p.icon+' '+p.name+(G.perks[k]>1?' ×'+G.perks[k]:''); }); toast(list.length ? list.join(' · ') : 'No perks yet — clear 3 waves', 'tip'); };
}
function setWeatherFx(w){ const a = $('app'); ['rain','snow','heat','fog','storm'].forEach(k=>a.classList.toggle('w-'+k, w===k)); }
function buildExtras(){
  const out = TD.STRUCTS.filter(k=>towerUnlocked(k)).concat(['castle']);
  if(ulevel() >= TD.LEGEND_UNLOCK_LEVEL) TD.LEGENDS.forEach(k=>{ if(legendUnlocked(k)) out.push(k); });
  return out;
}
function renderBuildBar(){
  const bar = $('buildBar');
  const lo = G.loadout && G.loadout.length ? G.loadout : TD.DEFAULT_LOADOUT, ex = G.phase==='menu' ? [] : buildExtras(), sig = lo.join(',')+'|'+ex.join(',');
  if(!bar.children.length || bar.dataset.lo !== sig){
    bar.dataset.lo = sig;
    bar.innerHTML = lo.map((k,i)=>{ const d = TOWERS[k], ml = mastery(k), rar = TD.rarityOf(ml); return '<button class="tcard" data-type="'+k+'" style="--rar:'+rar.css+'"><span class="ticon">'+d.icon+'</span><span class="tname">'+d.name+'</span><span class="tcost">'+towerCost(k,1)+'</span><span class="tkey">'+(i+1)+'</span>'+(ml>=3?'<span class="trar">'+'★'.repeat(Math.min(3,Math.floor(ml/3)))+'</span>':'')+'<span class="tlock">🔒 Lv '+(d.unlock||'')+'</span></button>'; }).join('')
      + (ex.length ? '<span class="tsep"></span>' : '')
      + ex.map(k=>{ if(k==='castle') return '<button class="tcard struct castle" data-type="castle" title="Castle upgrades: walls, gate, cannon, power core"><span class="ticon">🏰</span><span class="tname">Castle</span><span class="tcost">Base</span><span class="tlock"></span></button>';
          const d = TOWERS[k]; return '<button class="tcard '+(d.legendary?'legend':'struct')+'" data-type="'+k+'" title="'+d.name+' — '+d.desc+'"><span class="ticon">'+d.icon+'</span><span class="tname">'+d.name+'</span><span class="tcost">'+(d.legendary ? d.cry+'💎' : towerCost(k,1))+'</span><span class="tlock">🔒</span></button>'; }).join('');
    const more = ()=>bar.classList.toggle('more', bar.scrollWidth - bar.clientWidth - bar.scrollLeft > 8);
    if(!bar.dataset.sc){ bar.dataset.sc = 1; bar.addEventListener('scroll', more, { passive:true }); addEventListener('resize', more); } setTimeout(more, 50);
    bar.querySelectorAll('.tcard').forEach(b=>b.addEventListener('click', ()=>{ unlockAudio(); if(b.dataset.type==='castle'){ if(G.selObj && G.selObj.type==='castle') deselect(); else selectCastle(); } else setBuildType(b.dataset.type); }));
  }
  bar.querySelectorAll('.tcard').forEach(b=>{ const k = b.dataset.type; if(k==='castle'){ b.classList.toggle('on', !!(G.selObj && G.selObj.type==='castle')); return; }
    const d = TOWERS[k], ban = banned(k) && k!=='paradox'; b.classList.toggle('on', G.buildType===k); b.classList.toggle('poor', d.legendary ? (G.crystals < d.cry || G.legendBuilt) : G.gold < towerCost(k,1));
    b.classList.toggle('locked', !towerUnlocked(k) || ban); b.querySelector('.tlock').textContent = ban ? '🚫 Banned' : '🔒 Lv '+(d.unlock||'');
    if(!d.legendary) b.querySelector('.tcost').textContent = towerCost(k,1); });
  const bt = G.buildType ? TOWERS[G.buildType] : null;
  $('buildHint').textContent = G.moveT ? '🌀 Tap a free tile to teleport the '+TOWERS[G.moveT.type].name+' (Esc to cancel)' : (G.heroMode ? '🛡️ Tap where '+TD.HERO.name+' should go' : (G.targetMode ? '☄️ Tap where the meteor should land' :
    (bt ? (bt.onPath ? 'Tap an open road tile to place the '+bt.name+' · '+bt.trait : (bt.struct ? 'Tap a free tile to build the '+bt.name+' · '+bt.trait : 'Tap a free tile to place the '+bt.name+' · '+bt.trait)) : '')));
}
function renderAbilities(){
  const bar = $('abilBar');
  if(!bar.children.length){
    let h = '';
    if(ulevel() >= TD.HERO.unlock) h += '<button class="abtn hero" data-id="hero" title="Hero (H) — tap, then tap the island to move '+TD.HERO.name+'. Towers near him fire 15% faster."><span class="aic">🛡️</span><span class="acd"></span><span class="hhp"><i></i></span><span class="alk"></span></button>';
    h += '<button class="abtn stand" data-id="stand" title="Last Stand (E) — '+TD.LAST_STAND.desc+'"><span class="aic">🚨</span><span class="acd"></span><span class="alk"></span></button>';
    if(ulevel() >= TD.ROBOT.unlock) h += '<button class="abtn robot" data-id="robot" title="Robot Bolt-9 (R) — tap to switch between Collect and Attack"><span class="aic">🤖</span><span class="acd"></span><span class="alk"></span></button>';
    h += TD.ABILITIES.map(a=>'<button class="abtn" data-id="'+a.id+'" title="'+a.name+' ('+a.key+') — '+a.desc+'"><span class="aic">'+a.icon+'</span><span class="acd"></span><span class="alk">Lv '+a.unlock+'</span></button>').join('');
    bar.innerHTML = h;
    bar.querySelectorAll('.abtn').forEach(b=>b.addEventListener('click', ()=>{ unlockAudio(); const id = b.dataset.id; if(id==='hero') heroSelectToggle(); else if(id==='stand') useLastStand(); else if(id==='robot') robotToggle(); else useAbility(id); }));
  }
  const ru = ruleDef(), noA = !!(ru && ru.noAbil);
  bar.querySelectorAll('.abtn').forEach(b=>{ const id = b.dataset.id;
    if(id==='hero'){ const h = G.hero; b.classList.toggle('on', G.heroMode); b.classList.toggle('cool', !!(h && h.dead>0)); b.querySelector('.acd').textContent = h && h.dead>0 ? Math.ceil(h.dead)+'s' : ''; b.style.setProperty('--cd', h && h.dead>0 ? (h.dead/TD.HERO.respawn*100)+'%' : '0%');
      const f = b.querySelector('.hhp i'); if(f && h) f.style.width = Math.max(0, h.hp/h.maxHp*100)+'%'; b.classList.toggle('ready', !!(h && h.dead<=0)); return; }
    if(id==='robot'){ const R = G.robot; b.classList.toggle('ready', !!R); b.classList.toggle('on', !!(R && R.mode==='attack')); b.querySelector('.acd').textContent = R ? (R.mode==='attack' ? 'ATK' : 'LOOT') : ''; b.style.setProperty('--cd', '0%'); return; }
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
  secretgate: { name:'🚪 Hidden Door', tag:'Secret', text:'An old stone door on a forgotten road. Open it: +250 gold, +2 💎 and +25% gold from kills for the rest of the match — but enemies will split between both roads.' },
  boulder:{ name:'🪨 Boulder',       tag:'Rockfall', text:'Crashed down in a rockfall. It blocks building and crumbles on its own after a few waves — or smash it now for a 💎 crystal.' },
  crack:  { name:'⚠️ Cracking ground', tag:'Hazard', text:'The ground here is giving way. Next wave it turns to lava or open water and can never hold a tower.' },
  lava:   { name:'🌋 Lava flow',     tag:'Hazard',   text:'The volcano spreads — lava swallowed this tile. Nothing can be built here any more.' },
  water:  { name:'🧊 Broken ice',    tag:'Hazard',   text:'The ice broke open here. Nothing can be built on open water.' },
  crater: { name:'☄️ Meteorite Crater', tag:'Treasure', text:'A fallen meteorite, glittering with crystals. Mine it for +2 💎 and an Aether Core 🔮.' },
  energy: { name:'⚡ Energy Crystal', tag:'Power',   text:'Tesla towers on the 8 tiles around it deal +30% damage and chain +1. Surges double it.' },
  ice:    { name:'❄️ Ice Crystal',   tag:'Power',   text:'Frost towers on the 8 tiles around it deal +30% damage, slow longer and freeze 2 hits sooner.' },
};
function renderEnemyPanel(){
  const e = G.selE, p = $('panel'); if(!e || e.dead){ G.selE = null; p.classList.remove('show'); W.hideMarker(); return; }
  const up = $('pUp'), br = $('pBranch'), sl = $('pSell'); up.style.display = 'none'; br.style.display = 'none'; sl.style.display = 'none'; $('pExtra').innerHTML = ''; delete up.dataset.lock;
  $('pName').textContent = (e.big ? '👑 ' : (e.d.mini ? '👹 ' : '')) + enemyName(e);
  const R = TD.RANKS[Math.min(e.rank||0, TD.RANKS.length-1)];
  $('pLvl').innerHTML = '<span class="rankTag" style="background:'+badgeColor(e)+'">Lv '+e.level+'</span>';
  const hpP = Math.max(0, e.hp/e.maxHp*100), shP = e.eshieldMax ? e.eshield/e.eshieldMax*100 : (e.shieldMax ? e.shield/e.shieldMax*100 : 0);
  const st = []; if(e.frozen>0) st.push('🧊 frozen'); else if(e.slow>0) st.push('❄️ slowed'); if(e.charged>0) st.push('⚡ charged'); if(e.burn>0) st.push('🔥 burning'); if(e.poison) st.push('☠️ poisoned ×'+e.poison.stacks); if(e.marked>0) st.push('🎯 marked'); if(e.grounded>0) st.push('⬇️ grounded'); if(e.stun>0) st.push('💫 stunned'); if(e.raging) st.push('💢 raging');
  const row = (l,v)=>'<div class="prow"><span>'+l+'</span><b>'+v+'</b></div>';
  $('pStats').innerHTML = '<div class="epanel"><div class="ehp"><i style="width:'+hpP.toFixed(1)+'%"></i>'+(shP ? '<u style="width:'+shP.toFixed(1)+'%"></u>' : '')+'</div>'+
    (G.mode!=='bossrush' && !e.big ? row('Army rank', '<span style="color:'+R.color+'">'+R.icon+' '+R.roman+' · '+R.name+'</span>') : '') + row('Health', Math.ceil(Math.max(0,e.hp)).toLocaleString('en-US')+' / '+e.maxHp.toLocaleString('en-US')) + (e.eshieldMax ? row('Energy shield', Math.ceil(e.eshield)) : '') + (e.shieldMax ? row('Shield', Math.ceil(e.shield)) : '') +
    row('Speed', effSpeed(e).toFixed(2)+' tiles/s') + row('Armor', Math.max(0, e.armor + (e.led?3:0))) + row('Leak damage', e.d.steal ? 'steals '+e.d.steal+' 💰' : e.lives+' ❤️') + row('Bounty', e.gold+' 💰') +
    (st.length ? row('Status', st.join(' · ')) : '') + enemyPowers(e).map(x=>'<div class="epow">'+x+'</div>').join('')+'</div>';
  p.classList.add('show');
}
function selectEnemy(e){ G.sel = null; G.selObj = null; G.buildType = null; G.moveT = null; G.selE = e; W.hideRing(); W.hideGhost(); renderBuildBar(); renderEnemyPanel(); sfx('click'); }
function pickEnemy(cx, cy){ let best = null, bd = 34*34; const r = $('mount').getBoundingClientRect(); cx -= r.left; cy -= r.top;
  for(const e of G.enemies){ if(e.dead || e.invis) continue; const [sx,sy] = W.toScreen(e.pos.x, e.pos.y + e.d.size*1.3*(e.scale||1), e.pos.z); const d2 = (sx-cx)**2 + (sy-cy)**2; if(d2 < bd){ bd = d2; best = e; } }
  return best; }
function renderPanel(){
  const p = $('panel'), t = G.sel, o = G.selObj;
  if(!t && !o && G.selE) return renderEnemyPanel();
  const up = $('pUp'), br = $('pBranch'), sl = $('pSell'), ex = $('pExtra');
  ex.innerHTML = '';
  if(o && o.type==='castle') return renderCastlePanel();
  if(o){
    const inf = OBJ_INFO[o.type]; if(!inf){ p.classList.remove('show'); return; }
    $('pName').textContent = inf.name; $('pLvl').textContent = inf.tag;
    $('pStats').innerHTML = '<div class="ptrait">'+inf.text+'</div>';
    br.style.display = 'none'; sl.style.display = 'none';
    if(o.type==='secretgate'){ up.style.display = ''; up.textContent = '🚪 OPEN THE SECRET PATH'; up.disabled = false; }
    else if(o.type==='crater'){ up.style.display = ''; up.textContent = '⛏️ MINE CRYSTALS'; up.disabled = false; }
    else if(CLEAR_COST[o.type]){ const c = Math.round(CLEAR_COST[o.type]*costMul()); up.style.display = ''; up.textContent = (o.type==='tree'?'🪓 CLEAR  ':'🔨 DEMOLISH  ')+c; up.disabled = G.gold < c; } else up.style.display = 'none';
    p.classList.add('show'); return;
  }
  sl.style.display = '';
  if(!t){ p.classList.remove('show'); return; }
  const d = TOWERS[t.type], lv = t.level, nxt = lv<3 && !d.hybrid, b = branchOf(t), u = ultOf(t), mk = TD.ultKey(t.type), ml = mastery(mk), rar = TD.rarityOf(ml);
  $('pName').textContent = d.icon+' '+d.name; $('pLvl').innerHTML = (d.hybrid ? '🔗 Hybrid' : (u ? u.icon+' '+u.name : (lv>=3 && b ? b.icon+' '+b.name : 'Level '+lv)))+' <span class="prar" style="color:'+rar.css+'">'+rar.name+' '+ml+'</span>';
  const fmt = (k,v)=> v==null ? '' : (typeof v==='string' ? v : (k==='rate' ? (+v).toFixed(1)+'/s' : (k==='slow'||k==='critChance' ? Math.round(v*100)+'%' : (Math.round(v*10)/10))));
  const row = (l,k,a,bv)=>'<div class="prow"><span>'+l+'</span><b>'+fmt(k,a)+(bv!=null?' <i>→ '+fmt(k,bv)+'</i>':'')+'</b></div>';
  const nextVal = key => nxt && lv===1 && d[key] ? d[key][1] : null;
  let s = '';
  if(d.proj!=='none' && !d.legendary) s += '<div class="prioRow">'+PRIOS.map(pr=>'<button class="prioBtn'+((t.prio||'first')===pr.id?' on':'')+'" data-p="'+pr.id+'" title="Target: '+pr.name+' (T)">'+pr.icon+'<span>'+pr.name+'</span></button>').join('')+'</div>';
  const U = ultDef(t);
  if(U){ const pct = Math.round((t.charge||0)/U.need*100);
    const MU = mastery(TD.ultKey(t.type)) >= 10 && TD.MASTER_ULTS[TD.ultKey(t.type)];
    s += '<div class="chargeBar'+(t.ultReady?' ready':'')+(MU?' master':'')+(t.jammed?' jam':'')+'" title="'+U.desc+'"><i style="width:'+(t.ultReady?100:pct)+'%"></i><span>'+(MU ? '🎖️ '+MU : U.icon+' '+U.name)+(t.jammed ? ' · 📡 JAMMED' : (t.ultReady?' — READY!':' · '+pct+'%'))+'</span></div>'; }
  if(!d.struct && !d.legendary && t.type!=='bank' && d.proj!=='none'){ const V = TD.VETERANCY, vl = t.vl||1, nx = V.xp[vl], pv = V.xp[vl-1];
    s += '<div class="vetBar" title="Battle level: +'+Math.round(V.dmg*100)+'% damage per level, perks at levels '+V.perkAt.join(' & ')+'"><i style="width:'+(nx ? Math.round(((t.xp||0)-pv)/(nx-pv)*100) : 100)+'%"></i><span>★ Battle level '+vl+(vl>1 ? ' · +'+Math.round((vl-1)*V.dmg*100)+'% dmg' : '')+(nx ? ' · '+(t.xp||0)+' / '+nx+' XP' : ' · MAX')+'</span></div>';
    if(t.perks && t.perks.length) s += '<div class="perkRow">'+t.perks.map(id=>{ const P = TD.TOWER_PERKS.find(x=>x.id===id); return '<span title="'+P.desc+'">'+P.icon+' '+P.name+'</span>'; }).join('')+'</div>';
    const deb = []; if(t.chilled) deb.push('❄️ chilled −30% rate'); if(t.sick) deb.push('☠️ plague −25% dmg'); if(t.jammed) deb.push('📡 jammed'); if(t.frenzyT > 0) deb.push('⚡ frenzy +30% rate');
    if(deb.length) s += '<div class="ptrait '+(t.frenzyT > 0 && deb.length===1 ? 'good' : 'bad')+'">'+deb.join(' · ')+'</div>'; }
  if(t.type==='bank'){
    s += row('Income / wave','x',Math.round(stat(t,'income')),nextVal('income')) + row('Kill tax','x','+'+Math.round(stat(t,'tax'))+(u&&u.mod.taxAdd?'+'+u.mod.taxAdd:'')) + row('Tax range','range',stat(t,'range'),nextVal('range'));
    if(b && b.mod.interest) s += row('Interest','x',Math.round(b.mod.interest*(u&&u.mod.interest?u.mod.interest:1)*100)+'% (max '+Math.round(b.mod.cap*(u&&u.mod.cap?u.mod.cap:1))+')');
    s += row('Earned','x',Math.round(t.dmg)+' 💰');
  }else if(d.struct){
    if(t.type==='generator') s += row('Energy output','x','+'+Math.round(stat(t,'power'))+' ⚡', lv===1 ? '+'+d.power[1]+' ⚡' : null) + row('Your grid','x',G.eUsed+' / '+G.eCap+' ⚡') + (flag(t,'overcharge') ? row('Overcharge','x','+20% rate around it') : '');
    else if(t.type==='barricade') s += row('Health','x',Math.ceil(t.hp)+' / '+t.hpMax) + row('Spikes','x', d.thorns[Math.min(3,lv)-1] ? Math.round(d.thorns[Math.min(3,lv)-1]*(1+0.08*G.wave))+' dmg/s' : '— (level 2)');
    else if(t.type==='warp') s += row('Recharge','x',(stat(t,'cd')||0).toFixed(1)+'s', lv<3 ? d.cd[lv].toFixed(1)+'s' : null) + row('Throws back','x',(stat(t,'back')||0)+' tiles') + row('Energy','x','1 ⚡');
  }else if(t.type==='voidcore'){
    s += row('Crush','x','5% max health/s') + row('Black hole','x','every '+Math.round(1/stat(t,'rate'))+'s · 3s') + row('Range','range',stat(t,'range')) + row('Energy','x',TD.energyOf(t.type,t.level)+' ⚡');
  }else{
    s += row(d.proj==='beam'?'Damage/s':(d.proj==='venom'?'Poison/s':'Damage'),'dmg',stat(t,'dmg'),nextVal('dmg')) + row('Range','range',stat(t,'range'),nextVal('range'));
    if(d.energy) s += row('Energy','x',TD.energyOf(t.type,t.level)+' ⚡'+(G.powerK < 1 ? ' · LOW POWER' : ''));
    if(d.proj!=='beam') s += row('Rate','rate',stat(t,'rate'),nextVal('rate'));
    if(d.critChance) s += row('Crit chance','critChance',stat(t,'critChance'),nextVal('critChance'));
    if(d.splash) s += row('Splash','splash',stat(t,'splash'),nextVal('splash'));
    if(d.slow) s += row('Slow','slow',stat(t,'slow'),nextVal('slow'));
    if(d.chain) s += row('Chain','chain',Math.round(stat(t,'chain')),nextVal('chain'));
    if(d.proj==='beam') s += row('Heat','x','×'+t.ramp.toFixed(1)+' / ×'+(flag(t,'ramp')||d.ramp||2.2));
    s += row('Kills · damage','x',t.kills+' · '+Math.round(t.dmg).toLocaleString('en-US'), null);
  }
  s += '<div class="ptrait">'+d.trait+'</div>';
  if(u) s += '<div class="ptrait ult">⭐ Ascended — '+u.name+': '+u.desc+'</div>';
  if(t.syn && t.syn.size) t.syn.forEach(id=>{ const S = TD.SYNERGIES.find(x=>x.id===id); s += '<div class="ptrait syn">🔗 '+S.icon+' '+S.name+': '+S.desc+'</div>'; });
  if(t.crystal) s += '<div class="ptrait good">'+(t.type==='tesla'?'⚡ Energized by a crystal':'❄️ Ice-charged by a crystal')+(G.surge>0?' · SURGE ×2':'')+'</div>';
  if(G.runes.has(t.cx+','+t.cz)) s += '<div class="ptrait good">🔮 Ancient rune: +25% damage, +0.3 range</div>';
  if(t.dis > 0) s += '<div class="ptrait bad">⛔ '+(DIS_TEXT[t.disKind]||'Disabled')+' for '+t.dis.toFixed(1)+'s</div>';
  if(t.infused) s += '<div class="ptrait good">💎 Crystal-infused: +25% damage, +10% range</div>';
  if(t.oc) s += '<div class="ptrait good">⚡ Overcharged by a generator: +20% fire rate</div>';
  if(d.legendary) s += '<div class="ptrait ult">🌟 Legendary — can\'t be upgraded; grows stronger every wave.</div>';
  $('pStats').innerHTML = s;
  $('pStats').querySelectorAll('.prioBtn').forEach(x=>x.addEventListener('click', ()=>{ t.prio = x.dataset.p; t.target = null; sfx('click'); renderPanel(); }));
  // action buttons: break free, unleash, merge
  let e2 = '';
  if(t.hijack > 0) e2 += '<button class="brbtn hij" id="pFree"><b>🔓 BREAK FREE</b><span>Hijacked by the boss — tap fast! ('+t.hijack.toFixed(1)+'s)</span></button>';
  if(t.type==='barricade' && t.hp < t.hpMax){ const rc = repairCost(t); e2 += '<button class="brbtn" id="pRepair" '+(G.gold<rc||G.phase!=='build'?'disabled':'')+'><b>🔨 REPAIR · '+rc+' 💰</b><span>'+(G.phase==='build' ? 'Patch it up to full health' : 'Repairs happen between waves')+'</span></button>'; }
  if(!d.onPath && G.phase==='build'){ const mc = relocateCost(); e2 += '<button class="brbtn mv" id="pMove" '+(G.gold<mc?'disabled':'')+'><b>🌀 TELEPORT · '+(mc ? mc+' 💰' : 'FREE')+'</b><span>Move it to another free tile'+(mc ? ' (free while you own a Warp Gate)' : '')+'</span></button>'; }
  if(!d.struct && !d.legendary && d.proj!=='none' && !t.infused) e2 += '<button class="brbtn inf" id="pInf" '+(G.crystals<TD.INFUSE_COST?'disabled':'')+'><b>💎 CRYSTAL INFUSION · '+TD.INFUSE_COST+' 💎</b><span>A special upgrade: +25% damage and +10% range for this tower</span></button>';
  if(t.ultReady) e2 += '<button class="brbtn ultgo" id="pUnleash"><b>'+U.icon+' UNLEASH '+U.name.toUpperCase()+'</b><span>'+U.desc+'</span></button>';
  const mc = mergeCandidates(t);
  if(mc.length){ const fee = Math.round(TD.MERGE_FEE*costMul());
    e2 += '<div class="brTitle">🔗 Merge with a neighbour · '+fee+' 💰</div>'+mc.map((c,i)=>{ const known = SAVE.recipes.includes(c.r); return '<button class="brbtn merge" data-i="'+i+'" '+(G.gold<fee?'disabled':'')+'><b>'+TOWERS[c.o.type].icon+' + '+d.icon+' → '+(known ? TOWERS[c.r].icon+' '+TOWERS[c.r].name : '❔ ???')+'</b><span>'+(known ? TOWERS[c.r].desc : 'Unknown combination — merge to discover it!')+'</span></button>'; }).join(''); }
  ex.innerHTML = e2;
  if($('pFree')) $('pFree').addEventListener('click', ()=>breakFree(t));
  if($('pUnleash')) $('pUnleash').addEventListener('click', ()=>unleash(t));
  if($('pRepair')) $('pRepair').addEventListener('click', ()=>repairWall(t));
  if($('pMove')) $('pMove').addEventListener('click', ()=>startMove(t));
  if($('pInf')) $('pInf').addEventListener('click', ()=>infuse(t));
  ex.querySelectorAll('.merge').forEach(x=>x.addEventListener('click', ()=>mergeTowers(t, mc[+x.dataset.i].o)));
  if(d.hybrid || d.legendary){ up.style.display='none'; br.style.display='none'; }
  else if((ruleDef()||{}).noUpgrade && !d.struct){ up.style.display=''; br.style.display='none'; up.textContent = '⛔ NO UPGRADES'; up.disabled = true; up.dataset.lock = '1'; }
  else if(lv===1){ const c = towerCost(t.type, 2); up.style.display=''; br.style.display='none'; up.textContent = 'UPGRADE  '+c; up.disabled = G.gold < c; }
  else if(lv===2 && !(d.branches||[]).length){ const c = towerCost(t.type, 3); up.style.display=''; br.style.display='none'; up.textContent = 'UPGRADE  '+c; up.disabled = G.gold < c; }
  else if(lv===2){ const c = towerCost(t.type, 3); up.style.display='none'; br.style.display='block';
    br.innerHTML = '<div class="brTitle">Choose a specialization · '+c+' 💰</div>'+d.branches.map((x,i)=>'<button class="brbtn" data-i="'+i+'" '+(G.gold<c?'disabled':'')+'><b>'+x.icon+' '+x.name+'</b><span>'+x.desc+'</span>'+(d.ult ? '<small>Ascension: '+d.ult[i].icon+' '+d.ult[i].name+'</small>' : '')+'</button>').join('');
    br.querySelectorAll('.brbtn').forEach(x=>x.addEventListener('click', ()=>upgrade(t, +x.dataset.i))); }
  else if(lv===3 && d.ult){ const U2 = d.ult[t.branch], c = towerCost(t.type, 4, t.branch), okM = ml >= TD.ULT_MASTERY;
    up.style.display='none'; br.style.display='block';
    br.innerHTML = '<div class="brTitle">⭐ Ascension · '+c+' 💰</div><button class="brbtn ult" id="ultBtn" '+(okM?'':'data-lock="1" ')+(G.gold<c||!okM?'disabled':'')+'><b>'+U2.icon+' '+U2.name+'</b><span>'+U2.desc+'</span>'+(okM?'':'<small>🔒 Needs '+d.name+' mastery '+TD.ULT_MASTERY+' — you are at '+ml+'</small>')+'</button>';
    $('ultBtn').addEventListener('click', ()=>upgrade(t)); }
  else { up.style.display='none'; br.style.display='none'; }
  sl.textContent = d.legendary ? 'DISMANTLE  +'+Math.floor(d.cry/2)+' 💎' : 'SELL  +'+Math.round(t.spent*sellRate());
  p.classList.add('show');
}
function renderCastlePanel(){
  const p = $('panel'), up = $('pUp'), br = $('pBranch'), sl = $('pSell'), ex = $('pExtra');
  $('pName').textContent = '🏰 Castle'; $('pLvl').textContent = G.phase==='build' ? 'Base' : 'Base · wave running';
  $('pStats').innerHTML = '<div class="prow"><span>Lives</span><b>'+G.lives+'</b></div><div class="prow"><span>Energy</span><b>'+G.eUsed+' / '+G.eCap+' ⚡</b></div>'+(G.base.gate ? '<div class="prow"><span>Gate holds</span><b>'+G.gateLeft+' / '+G.base.gate+' this wave</b></div>' : '')+'<div class="ptrait">'+(G.phase==='build' ? '' : '⏳ Upgrades unlock when the wave is over. ')+'Stone walls, an iron gate, a cannon on the keep and a power core. 🔋 Generators, 🧱 barricades and 🌀 warp gates are in the build bar.</div>';
  up.style.display = 'none'; sl.style.display = 'none'; ex.innerHTML = ''; br.style.display = 'block';
  br.innerHTML = TD.BASE_UPGRADES.map(u=>{ const l = G.base[u.id], c = baseCost(u.id); return '<button class="brbtn base" data-id="'+u.id+'" '+(l>=3||G.gold<c||G.phase!=='build'?'disabled':'')+'><b>'+u.icon+' '+u.name+' <i class="pips">'+[1,2,3].map(i=>'<u class="'+(i<=l?'on':'')+'"></u>').join('')+'</i></b><span>'+u.desc+'</span><small>'+(l>=3 ? 'MAX' : c+' 💰')+'</small></button>'; }).join('');
  br.querySelectorAll('.brbtn').forEach(b=>b.addEventListener('click', ()=>buyBase(b.dataset.id)));
  p.classList.add('show');
}
// refresh the open panel without rebuilding its buttons (so taps never get lost)
function livePanel(t){
  const sig = [t.type, t.level, !!t.ultReady, t.hijack>0, t.dis>0, mergeCandidates(t).length, t.syn ? t.syn.size : 0, G.phase==='build', !!t.infused, t.type==='barricade' ? Math.round(t.hp/t.hpMax*20) : 0, !!t.oc, t.xp||0, !!t.chilled, !!t.jammed, !!t.sick, t.frenzyT > 0].join('|');
  if(sig !== G.panelSig){ G.panelSig = sig; renderPanel(); return; }
  const U = ultDef(t), cb = document.querySelector('#pStats .chargeBar');
  if(U && cb && !t.ultReady){ const pct = Math.round((t.charge||0)/U.need*100); cb.querySelector('i').style.width = pct+'%'; cb.querySelector('span').textContent = U.icon+' '+U.name+' · '+pct+'%'; }
  const f = document.querySelector('#pFree span'); if(f) f.textContent = 'Hijacked by the boss — tap fast! ('+Math.max(0,t.hijack).toFixed(1)+'s)';
}
function renderStreak(){
  const el = $('streakHud'); if(!el) return;
  const live = G.phase!=='menu' && G.streak >= 5 && G.t - G.streakLast <= TD.STREAK_WINDOW;
  el.classList.toggle('show', live);
  if(live){ $('streakN').textContent = G.streak; const nx = TD.STREAKS.find(x=>x.n > G.streak); $('streakNext').textContent = nx ? 'next: '+nx.name+' at '+nx.n : 'LEGENDARY'; el.style.setProperty('--k', Math.max(0, 1-(G.t-G.streakLast)/TD.STREAK_WINDOW)); }
}
function renderWaveBtn(){
  const b = $('waveBtn');
  if(G.phase!=='build' || G.over){ b.classList.remove('show'); return; }
  b.classList.add('show');
  const n = G.wave+1, groups = wavePlan(n), boss = groups.some(g=>g.type==='boss'||g.type==='airboss') || (G.mode==='nightmare' && n===30) || (G.mode!=='bossrush' && n >= TD.MEGA.from && (n - TD.MEGA.from) % TD.MEGA.every === 0), swarm = groups.some(g=>g.swarm), surv = groups.some(g=>g.surv), mini = groups.find(g=>ENEMIES[g.type].mini), air = groups.some(g=>g.type==='airboss');
  $('wbTitle').textContent = (n===1?'START':'SEND')+' WAVE '+n + (boss ? (air ? '  🚁' : '  👑') : '') + (swarm ? '  🐜' : '') + (surv ? '  💀' : '') + (mini ? '  👹' : '');
  const tags = [];
  if(G.mode!=='bossrush' && TD.isNight(n)) tags.push('🌙 Night');
  const w = TD.rollWeather(G.map.theme, n, G.seed); if(w!=='clear') tags.push(TD.WEATHER[w].icon+' '+TD.WEATHER[w].name);
  if(routesFor(n).length > 1) tags.push('🔀 Split roads');
  if(swarm) tags.push('🐜 Swarm');
  if(surv) tags.push('💀 Survival '+TD.survivalTime(n)+'s');
  if(mini) tags.push('👹 '+ENEMIES[mini.type].name);
  const sh = modeDef().rankShift||0;
  if(G.mode!=='bossrush'){ const rkN = TD.rankIdx(n+sh), rkC = TD.rankIdx(Math.max(1, G.wave)+sh); if(rkN > rkC && G.wave >= 1) tags.push(TD.RANKS[rkN].icon+' NEW RANK: '+TD.RANKS[rkN].name); if(rkN >= 2 && !surv) tags.push('⭐ Elites '+Math.round(TD.ELITE.chance(n+sh)*100)+'%'); if(rkN >= 3 && !surv) tags.push('☣️ Mutants '+Math.round(TD.MUTATED.chance(n+sh)*100)+'%'); }
  if(G.mode!=='bossrush' && ((G.mode==='nightmare' && n===30) || (n >= TD.MEGA.from && (n - TD.MEGA.from) % TD.MEGA.every === 0))) tags.push('🗻 MEGA BOSS');
  if(G.mode==='nightmare' && n % 10 === 0 && n !== 30) tags.push('😈 +1 boss');
  if(mut('bosses') && n % 10 === 5) tags.push('👑 Boss parade');
  if(G.spreadWarn && G.spreadWarn.length) tags.push(G.map.spread.kind==='lava' ? '🌋 Lava spreads' : '🧊 Ice breaks');
  if(G.rockfall > 0) tags.push('🪨 Rockfall');
  if(air) tags.push('🚁 Air boss: ground it with ❄️+⚡');
  for(const r of G.map.routeDefs) if(r.kind==='collapse' && !r.open && r.from===n) tags.push('🌋 Road collapses');
  if(TD.isMirror(n) && G.mode!=='bossrush') tags.push('🪞 Mirror');
  if(G.secretNext) tags.push('🗿 Secret boss');
  if(G.nextEv){ const d = TD.EVENTS.find(x=>x.id===G.nextEv); if(d) tags.push(d.icon+' '+d.name.toLowerCase()); }
  $('wbSub').textContent = (tags.length ? tags.join(' · ')+'  —  ' : '') + (surv ? '~'+groups.reduce((a,g)=>a+g.count,0)+' weak enemies' : TD.waveLabel(groups));
  $('wbTimer').textContent = G.buildTimer > 0 ? Math.ceil(G.buildTimer)+'s  ·  +'+Math.round(G.buildTimer*1.5)+' gold now' : 'Ready when you are';
  b.classList.toggle('boss', boss);
  const rb = $('riskBtn'); rb.classList.toggle('on', G.riskNext); rb.innerHTML = G.riskNext ? '🔴 RISK ON · +50% speed · ×2 gold' : '⚪ Risk & Reward: off';
}
function syncSpeed(){ document.querySelectorAll('.spd').forEach(b=>b.classList.toggle('on', +b.dataset.s===G.speed)); }
function syncToggles(){
  const set = (id, off) => { const el = $(id); if(el) el.classList.toggle('off', off); };
  set('sndBtn', SAVE.muted); set('sSound', SAVE.muted); set('sMusic', !SAVE.music); set('sNums', !SAVE.nums); set('sQuality', SAVE.quality==='low'); set('sAuto', !SAVE.autoUlt); set('sLevels', SAVE.lvTags===false);
  const sq = $('sQuality'); if(sq) sq.textContent = { auto:'Auto ('+W.qual+')', high:'High', medium:'Medium', low:'Low' }[SAVE.quality||'auto'] || 'Auto';
  const sl2 = $('sLevels'); if(sl2) sl2.textContent = SAVE.lvTags===false ? 'Off' : 'On';
  const sa = $('sAuto'); if(sa) sa.textContent = SAVE.autoUlt ? 'Auto' : 'Tap';
}

// ---- menu ------------------------------------------------------------
function showPanel(id){
  document.querySelectorAll('.mpanel').forEach(p=>p.classList.toggle('show', p.id==='mp-'+id));
  if(id==='maps') renderMaps(); if(id==='towers') renderTowers(); if(id==='challenges') renderChallenges(); if(id==='skins') renderSkins(); if(id==='settings') syncToggles(); if(id==='daily') renderDaily();
  if(id==='research') renderResearch(); if(id==='records') renderRecords(); if(id==='season') renderSeason();
  if(id==='world') renderWorld(); if(id==='secrets') renderSecrets(); if(id==='bestiary') renderBestiary();
  renderProfile();
}
function renderProfile(){
  const li = TD.levelOf(SAVE.xp), pr = SAVE.prestige||0;
  $('prLevel').textContent = li.level; $('prXp').textContent = li.into+' / '+li.need+' XP'; $('prTitle').textContent = titleName(); $('prFill').style.width = Math.max(2, Math.round(li.into/li.need*100))+'%';
  $('prCoins').textContent = SAVE.coins; $('prRp').textContent = SAVE.rp||0; $('prCores').textContent = SAVE.cores||0;
  $('prBadge').classList.toggle('pres', pr>0); $('prStarsP').textContent = pr ? '★'+pr : '';
  const nu = nextUnlockInfo();
  $('prNext').innerHTML = nu ? '<em>NEXT UNLOCK</em> <b>'+nu.u.icon+' Level '+nu.u.level+'</b> — '+nu.u.text+' <small>· '+nu.need+' XP to go</small>' : (pr ? '<em>PRESTIGE '+pr+'</em> +'+(pr*10)+'% XP · +'+(pr*5)+'% starting gold' : '<em>MAX</em> Everything unlocked');
  const canP = li.level >= TD.PRESTIGE_LEVEL && pr < TD.PRESTIGE_MAX; $('prPrestige').style.display = canP ? '' : 'none';
  const stars = TD.MAPS.reduce((a,m)=>a+mapSave(m.id).stars,0); $('prStars').textContent = stars+' / '+(TD.MAPS.length*3);
  const nc = TD.CHALLENGES.filter(c=>SAVE.ch[c.id]&&SAVE.ch[c.id].done).length; $('mChBadge').textContent = nc+'/'+TD.CHALLENGES.length;
  const D = dailyEnsure(), nd = D.tasks.filter(x=>x.done).length; $('mDayBadge').textContent = nd+'/3'; $('mDaily').classList.toggle('fresh', nd < 3);
  $('mRsBadge').textContent = (SAVE.rp||0)+' RP'; if($('mBestBadge')) $('mBestBadge').textContent = (SAVE.seen||[]).filter(k=>ENEMIES[k] && !TD.BESTIARY_SKIP.includes(k)).length+'/'+Object.keys(ENEMIES).filter(k=>!TD.BESTIARY_SKIP.includes(k)).length; $('mResearch').classList.toggle('fresh', affordableResearch());
}
function rsPrereq(n){ if(!n.tier) return true; const prev = TD.RESEARCH.find(x=>x.branch===n.branch && x.tier===n.tier-1); return !prev || rs(prev.id) >= 1; }
function affordableResearch(){ return TD.RESEARCH.some(n=>rs(n.id) < n.max && rsPrereq(n) && (SAVE.rp||0) >= TD.researchCost(n, rs(n.id)) && (SAVE.cores||0) >= (n.cores||0)); }
function doPrestige(){
  askConfirm('Prestige: your player level goes back to 1, but you keep every unlock, map, skin, coin, mastery and research — and gain a permanent +10% XP and +5% starting gold.', ()=>{
    SAVE.prestige = (SAVE.prestige||0)+1; SAVE.xp = 0; chMark('prestige'); persist(); sfx('level'); showPanel('home'); toast('⭐ Prestige '+SAVE.prestige+'! Permanent bonus unlocked', 'good'); }, 'PRESTIGE');
}
function renderMaps(){
  const host = $('mapCards');
  const mode = G.menuMode || 'normal';
  host.innerHTML = TD.MAPS.map((m,i)=>{
    const s = mapSave(m.id), open = unlocked(i);
    if(m.secretMap && !open) return '<button class="mapCard theme-cavern locked" data-i="'+i+'"><span class="mcName">❔ ???</span><span class="mcSub">A region that is on no map</span><span class="mcEff">🗝️ '+SAVE.keys.length+' / '+TD.KEYSTONE_MAPS.length+' keystones found — they hide in old ruins.</span><span class="mcLock">🔒 Secret</span></button>';
    const med = TD.MAP_CHALLENGES.map(id=>{ const r = TD.CHALLENGE_RULES.find(x=>x.id===id), got = SAVE.mapCh[m.id] && SAVE.mapCh[m.id][id]; return '<i class="medal'+(got?' got':'')+'" title="Map challenge: '+r.name+'">'+r.icon+'</i>'; }).join('');
    return '<button class="mapCard theme-'+m.theme+(open?'':' locked')+(i===G.mapIdx?' on':'')+'" data-i="'+i+'">'+
      '<span class="mcName">'+m.name+(m.tiered?' <em class="tier">Tier '+tierOf(m)+'</em>':'')+(s.hard?' <span class="crown" title="Won on Hard">👑</span>':'')+(m.routes?' <span class="crown" title="'+(m.routes[0].kind==='secret'?'A secret path hides here':'Changing roads')+'">'+(m.routes[0].kind==='secret'?'🚪':'🔀')+'</span>':'')+(SAVE.secretBoss[m.id]?' <span class="crown" title="Secret boss defeated">🗿</span>':'')+(s.nightmare?' <span class="crown" title="Won on Nightmare">😈</span>':'')+(m.effect==='twin'?' <span class="crown" title="Two portals, two castles">🏰🏰</span>':'')+'</span><span class="mcSub">'+(modeDef(mode).waves||m.waves)+' waves · boss: '+m.boss+(s.best?' · best '+s.best:'')+(s.endless?' · endless '+s.endless:'')+'</span>'+
      '<span class="mcEff">'+m.effectText+'</span>'+
      '<span class="mcStars">'+[1,2,3].map(k=>'<i class="'+(k<=s.stars?'on':'')+'">★</i>').join('')+'<span class="mcMed">'+med+'</span></span>'+
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
    const mid = TD.MAPS[G.mapIdx].id;
    rr.innerHTML = TD.CHALLENGE_RULES.map(r=>{ const mc = TD.MAP_CHALLENGES.includes(r.id), got = mc && SAVE.mapCh[mid] && SAVE.mapCh[mid][r.id]; return '<button class="ruleBtn'+(r.id===cur?' on':'')+(SAVE.chal[r.id]?' done':'')+(mc?' mapch':'')+'" data-r="'+r.id+'"><b>'+r.icon+' '+r.name+(SAVE.chal[r.id]?' ✓':'')+(mc?' <i class="medal'+(got?' got':'')+'">🏅</i>':'')+'</b><span>'+r.desc+(mc?' · map challenge: +1 🔮 per map':'')+'</span></button>'; }).join('');
    rr.querySelectorAll('.ruleBtn').forEach(b=>b.addEventListener('click', ()=>{ G.menuRule = b.dataset.r; SAVE.lastRule = G.menuRule; persistSoon(); sfx('click'); renderMaps(); })); }
  renderMutators(mode); renderLoadout();
  const nm = TD.MUTATOR_MODES.includes(mode) ? (SAVE.mutators||[]).length : 0;
  $('playBtn').textContent = 'PLAY  ·  '+TD.MAPS[G.mapIdx].name+(mode!=='normal' ? '  ·  '+md.name : '')+(nm ? '  ·  🎲×'+nm : '');
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
  const lv = ulevel(), vOpen = lv >= TD.LEGEND_UNLOCK_LEVEL;
  const vault = '<div class="tiEnemies vault"><b>🌟 Legendary Vault · 🔮 '+(SAVE.cores||0)+' Aether Cores</b><span>Rare towers with unique powers — one per match, built with 💎 crystals instead of gold. Unlock them with 🔮 Aether Cores'+(vOpen ? '' : ' (the vault opens at player level '+TD.LEGEND_UNLOCK_LEVEL+')')+'.</span><div class="vaultRow">'+
    TD.LEGENDS.map(k=>{ const d = TOWERS[k], got = legendUnlocked(k), secret = d.secret && !got;
      return '<div class="vcard'+(got?' got':'')+(secret?' secret':'')+'"><span class="vIc">'+(secret?'❔':d.icon)+'</span><b>'+(secret?'???':d.name)+'</b><span>'+(secret ? TD.AETHER_HOW : d.desc)+'</span>'+(got ? '<em>UNLOCKED · '+d.cry+' 💎 in battle</em>' : (secret ? '<em>SECRET</em>' : '<button class="vbuy" data-k="'+k+'" '+(!vOpen || (SAVE.cores||0) < d.cores ? 'disabled' : '')+'>UNLOCK · '+d.cores+' 🔮</button>'))+'</div>'; }).join('')+'</div></div>';
  const combos = '<div class="tiEnemies combo"><b>🎯 Tower combos — '+SAVE.combos.length+' / '+TD.COMBOS.length+' discovered</b><span>Effects chain between towers: freeze with ❄️ Frost, zap it with ⚡ Tesla, then crack it with 💣 Cannon for the TRIPLE COMBO. The others are secret — experiment! Each new combo pays 1 🔮.</span>'+
    TD.COMBOS.map(c=>{ const k = SAVE.combos.includes(c.id); return (k || c.known) ? '<span><u>'+c.icon+' '+c.name+(k ? '' : ' · not triggered yet')+'</u> — '+c.desc+'</span>' : '<span class="unk"><u>❔ ??? '+c.hint+'</u> — undiscovered</span>'; }).join('')+'</div>';
  const armor = '<div class="tiEnemies armor"><b>🛡️ Armor, ranks & adaptation</b>'+Object.values(TD.ARMOR_TYPES).map(a=>'<span><u>'+a.icon+' '+a.name+'</u> — '+a.desc+'</span>').join('')+
    '<span><u>⚔️ Army ranks</u> — every 10 waves the enemy learns something new: II Veterans (Enhanced Runners, Armored Brutes, Elite Flyers), III Elites, IV Mutants, V Apex. Every enemy shows its level.</span><span><u>🧬 Adaptation</u> — when one damage type (🗡️ physical, 💥 explosive, ⚡ energy, ❄️ ice, 🔥 fire, ☠️ poison) does most of the killing, enemies adapt and resist it — up to −30%. Mix your towers!</span></div>';
  const base = '<div class="tiEnemies base"><b>🏰 Base building & energy</b><span><u>⚡ Energy</u> — strong towers draw power (Tesla 2, Laser 3, hybrids 4…). The castle gives '+TD.ENERGY.base+'. Too little and they fire slower.</span><span><u>🔋 Generator</u> — +8/12/18 energy; level 3: Power Plant (+50%) or Overcharger (+20% fire rate around it).</span><span><u>🧱 Barricade</u> — a wall on the road that enemies must smash through. <u>🌀 Warp Gate</u> — throws enemies back; makes teleporting towers free.</span><span><u>🏰 Castle</u> — tap it between waves: stone walls, an iron gate, a cannon and a power core.</span><span><u>🤖 Robot</u> — collects dropped loot and zaps enemies; upgrade it in the Tech Tree workshop.</span></div>';
  $('towerList').innerHTML = vault + combos + base + armor + TD.TOWER_ORDER.map(k=>{ const d = TOWERS[k]; const locked = d.unlock && lv < d.unlock; const kills = SAVE.mastery[k]||0, ml = TD.masteryOf(kills), rar = TD.rarityOf(ml), nextK = TD.MASTERY[Math.min(10, ml+1)];
    return '<div class="tinfo'+(locked?' locked':'')+'" style="--rar:'+rar.css+'"><div class="tiHead"><span class="tiIcon">'+d.icon+'</span><div><b>'+d.name+' <i class="rarTag">'+rar.name+' · mastery '+ml+'</i></b><span>'+d.desc+'</span></div><em>'+(locked?'🔒 Lv '+d.unlock:d.cost+' 💰')+'</em></div>'+
      '<div class="mBar"><i style="width:'+(ml>=10?100:Math.round((kills-TD.MASTERY[ml])/(nextK-TD.MASTERY[ml])*100))+'%"></i><span>'+(ml>=10?'MAX':(k==='bank'?'':'')+kills+' / '+nextK+(k==='bank'?' (earned gold ÷5)':' kills'))+'</span></div>'+
      '<div class="tiTrait">'+d.trait+'</div>'+
      (d.dmg?'<div class="tiStats">Damage '+d.dmg.join(' / ')+' · Range '+d.range.join(' / ')+(d.proj!=='beam'&&d.rate?' · Rate '+d.rate.join(' / '):'')+'</div>':'<div class="tiStats">Income '+d.income.join(' / ')+' per wave · Range '+d.range.join(' / ')+'</div>')+
      '<div class="tiBr">'+d.branches.map((b,i)=>'<span><b>'+b.icon+' '+b.name+'</b> '+b.desc+'<small>🌟 '+d.ult[i].name+': '+d.ult[i].desc+'</small></span>').join('')+'</div>'+
      (ml < TD.ULT_MASTERY ? '<div class="tiLock">🔒 Ascensions unlock at mastery '+TD.ULT_MASTERY+' · 🎖️ skin at '+TD.MASTERY_REWARDS.skin+' · ✨ aura at '+TD.MASTERY_REWARDS.aura+' · 🏷️ title at '+TD.MASTERY_REWARDS.title+'</div>' : '')+'</div>'; }).join('')+
    '<div class="tiEnemies hyb"><b>⚗️ Hybrid towers — '+SAVE.recipes.length+' / '+Object.keys(TD.HYBRIDS).length+' discovered</b><span>Put two level-2+ towers next to each other and select one: if they can fuse, a MERGE button appears ('+TD.MERGE_FEE+' gold). Experiment!</span>'+
      Object.keys(TD.HYBRIDS).map(k=>{ const h = TD.HYBRIDS[k], known = SAVE.recipes.includes(k); return known ? '<span><u>'+h.icon+' '+h.name+'</u> = '+TOWERS[h.parts[0]].icon+' + '+TOWERS[h.parts[1]].icon+' — '+h.desc+'</span>' : '<span class="unk"><u>❔ ??? </u> = ❔ + ❔</span>'; }).join('')+'</div>'+
    '<div class="tiEnemies ultl"><b>⚡ Tower ultimates — every attack charges the meter</b>'+Object.keys(TD.ULTS).map(k=>'<span><u>'+TOWERS[k].icon+' '+TD.ULTS[k].icon+' '+TD.ULTS[k].name+'</u> — '+TD.ULTS[k].desc+'</span>').join('')+'<span>When a tower\'s meter is full, tap the tower (or ⚡ in the corner) to unleash it. Auto-fire can be turned on in Settings.</span></div>'+
    '<div class="tiEnemies syn"><b>🔗 Synergies — two towers within 2 tiles</b>'+TD.SYNERGIES.map(S=>'<span><u>'+S.icon+' '+S.name+'</u> — '+S.desc+'</span>').join('')+'</div>'+
    '<div class="tiEnemies"><b>Enemies to watch</b><span>Every enemy with its powers is in the 📖 Bestiary.</span>'+Object.keys(ENEMIES).filter(k=>ENEMIES[k].note && !TD.BESTIARY_SKIP.includes(k) && !['grunt','runner','brute','flyer','splitling','swarmling','skeleton'].includes(k)).map(k=>'<span><u>'+ENEMIES[k].name+' <small>('+(ENEMIES[k].night?'night waves':'wave '+ENEMIES[k].from+'+')+')</small></u> — '+ENEMIES[k].note+'</span>').join('')+'<span><u>Swarm waves</u> — every 7th wave brings a horde of tiny Swarmlings.</span></div>'+
    '<div class="tiEnemies boss"><b>Bosses</b><span>Every boss fights in four stages (75% enraged · 50% transform + EMP · 25% final form), shows a 🎯 weak point every '+TD.BOSS_UNIVERSAL.weakEvery+'s, has two traits (see 📖 Bestiary) — plus a signature move:</span>'+
      TD.MAPS.filter(m=>!m.secretMap || unlocked(mapIndex(m.id))).map(m=>{ const k = TD.BOSS_SKILLS[m.bossSkill]; return '<span><u>'+m.boss+'</u> ('+m.name+') — '+k.icon+' '+k.name+': '+k.desc+'</span>'; }).join('')+
      '<span><u>🚁 Air bosses</u> — '+TD.ENEMIES.airboss.note+'</span><span><u>👹 Mini-bosses</u> — every 8 waves (5, 13, 21…) one of six named mini-bosses joins the wave. <u>💀 Survival waves</u> (9, 18, 27…) — hold out against an endless horde.</span></div>'+
    '<div class="tiEnemies obj"><b>The world</b><span>🌙 Waves 6–10, 16–20, 26–30 are fought at night. 🌧️ Weather changes every wave. 🎲 Random events strike between waves.</span><span>🔀 Some roads fork or change mid-match. 🌳 Trees and 🧱 ruins can be cleared — one of them hides a secret, and a ✨ sparkle marks another.</span><span>⚡ Energy crystals power Teslas, ❄️ ice crystals power Frosts. 🛡️ Your hero speeds up towers near him. 🚨 Last Stand shoves every enemy back once per wave.</span></div>';
  $('towerList').querySelectorAll('.vbuy').forEach(b=>b.addEventListener('click', ()=>{ const k = b.dataset.k, d = TOWERS[k];
    if(ulevel() < TD.LEGEND_UNLOCK_LEVEL || (SAVE.cores||0) < d.cores || legendUnlocked(k)){ sfx('nope'); return; }
    SAVE.cores -= d.cores; SAVE.legends.push(k); persist(); sfx('level'); toast('🌟 '+d.icon+' '+d.name+' unlocked! Build it in battle with '+d.cry+' 💎', 'good'); renderTowers(); renderProfile(); }));
}
function renderChallenges(){
  $('chList').innerHTML = TD.CHALLENGES.map(c=>{ const e = SAVE.ch[c.id]||{p:0,done:false}; const v = Math.min(c.goal, chValue(c)); const pct = Math.round(v/c.goal*100);
    return '<div class="chItem'+(e.done?' done':'')+'"><span class="chIcon">'+c.icon+'</span><div class="chBody"><b>'+c.name+(e.done?' ✓':'')+'</b><span>'+c.desc+'</span>'+
      '<div class="chBar"><i style="width:'+(e.done?100:pct)+'%"></i></div></div><em>'+(e.done?'DONE':v+'/'+c.goal)+'<small>+'+c.coins+' 💰'+(c.xp?' +'+c.xp+' XP':'')+'</small></em></div>'; }).join('');
}
function renderResearch(){
  $('rsPoints').innerHTML = '🧠 <b>'+(SAVE.rp||0)+'</b> research points · 🔮 <b>'+(SAVE.cores||0)+'</b> Aether Cores<small>RP: 1 per 5 waves, +3 per win · 🔮 cores: bosses, mini-bosses, combos, regions and secrets</small>';
  $('rsTree').innerHTML = TD.RESEARCH_BRANCHES.map(B=>'<div class="rsCol" style="--bc:'+B.color+'"><h3>'+B.icon+' '+B.id+'</h3>'+TD.RESEARCH.filter(n=>n.branch===B.id).sort((a,b)=>a.tier-b.tier).map((n,j,arr)=>{
      const l = rs(n.id), max = l>=n.max, c = TD.researchCost(n, l), pre = rsPrereq(n), cc = n.cores||0, can = !max && pre && (SAVE.rp||0) >= c && (SAVE.cores||0) >= cc;
      return (j ? '<i class="rsLink'+(pre?' on':'')+'"></i>' : '')+'<button class="rsNode'+(max?' max':'')+(pre?'':' lockd')+(cc?' cap':'')+'" data-id="'+n.id+'" '+(can?'':'disabled')+'><span class="rsIc">'+n.icon+'</span><b>'+n.name+'</b><span>'+n.desc+'</span><i class="rsPips">'+Array.from({length:n.max},(_,i)=>'<u class="'+(i<l?'on':'')+'"></u>').join('')+'</i><em>'+(max ? 'MAX' : (pre ? c+' RP'+(cc ? ' + '+cc+' 🔮' : '') : '🔒 '+arr[j-1].name))+'</em></button>'; }).join('')+'</div>').join('');
  $('rsTree').querySelectorAll('.rsNode').forEach(b=>b.addEventListener('click', ()=>{ const n = TD.RESEARCH.find(x=>x.id===b.dataset.id), l = rs(n.id), c = TD.researchCost(n, l), cc = n.cores||0;
    if(l >= n.max || !rsPrereq(n) || (SAVE.rp||0) < c || (SAVE.cores||0) < cc){ sfx('nope'); return; } SAVE.rp -= c; SAVE.cores -= cc; SAVE.research[n.id] = l+1; const tot = Object.values(SAVE.research).reduce((a,b)=>a+b,0); if(tot >= 5) chMark('research5'); persist(); sfx('upgrade'); renderResearch(); renderProfile(); }));
  renderWorkshop();
}
function renderWorkshop(){
  const el = $('rsRobot'); if(!el) return; const L = robotLv(), RB = TD.ROBOT, lockd = ulevel() < RB.unlock, nx = L < RB.max ? RB.cost[L] : 0;
  el.innerHTML = '<div class="wsHead">🤖 Workshop — '+RB.name+' <i>level '+L+' / '+RB.max+'</i></div><div class="wsStats">Laser '+RB.dmg[L-1]+' × '+RB.rate[L-1]+'/s · speed '+RB.speed[L-1]+' · magnet '+RB.magnet[L-1]+' tiles</div>'+
    (lockd ? '<div class="wsLock">🔒 Joins you at player level '+RB.unlock+'</div>' : (L < RB.max ? '<button id="wsUp" '+(SAVE.coins<nx?'disabled':'')+'>UPGRADE → LEVEL '+(L+1)+' · '+nx+' 💰</button>' : '<div class="wsLock">MAX LEVEL</div>'))+
    '<div class="wsNote">In battle it picks up the 💰 and 💎 loot enemies drop and zaps enemies with its laser. Tap 🤖 (or R) to switch between Collect and Attack mode.</div>';
  const b = $('wsUp'); if(b) b.onclick = ()=>{ if(SAVE.coins < nx){ sfx('nope'); return; } SAVE.coins -= nx; SAVE.robotLv = L+1; persist(); sfx('upgrade'); renderResearch(); renderProfile(); };
}
// ---- world map campaign ----
function renderWorld(){
  const host = $('worldMap'); if(!host) return;
  let h = '<svg class="wmPath" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="'+TD.CAMPAIGN.map(c=>c.x+','+c.y).join(' ')+'"/></svg>';
  const node = (c, kind)=>{ const i = mapIndex(c.map), m = TD.MAPS[i], ms = mapSave(m.id), open = unlocked(i), done = !!SAVE.regionDone[m.id] || ms.stars > 0;
    return '<button class="wmNode '+kind+(open?'':' locked')+(done?' done':'')+(G.mapIdx===i?' on':'')+'" data-i="'+i+'" style="left:'+c.x+'%;top:'+c.y+'%;--c:'+(c.color||'#9aa7b8')+'"><span class="wmIc">'+(open ? c.icon : '🔒')+'</span><span class="wmName">'+(c.region || m.name)+'</span><span class="wmStars">'+(ms.stars ? '★'.repeat(ms.stars) : '')+(ms.hard ? '👑' : '')+'</span></button>'; };
  h += TD.CAMPAIGN.map(c=>node(c, 'main')).join('') + TD.CAMPAIGN_SIDE.map(c=>node(c, 'side')).join('');
  const sc = TD.CAMPAIGN_SECRET, si = mapIndex(sc.map);
  if(unlocked(si)){ if(!SAVE.secretMapSeen){ SAVE.secretMapSeen = true; persistSoon(); } h += node(Object.assign({ region:'Crystal Caverns', color:'#7affc8' }, sc), 'secret'); }
  else if(SAVE.keys.length) h += '<div class="wmNode secret hidden" style="left:'+sc.x+'%;top:'+sc.y+'%"><span class="wmIc">❔</span><span class="wmName">🗝️ '+SAVE.keys.length+'/'+TD.KEYSTONE_MAPS.length+'</span></div>';
  host.innerHTML = h;
  host.querySelectorAll('button.wmNode').forEach(b=>b.addEventListener('click', ()=>{ G.mapIdx = +b.dataset.i; sfx('click'); renderWorld(); }));
  const done = TD.CAMPAIGN.filter(c=>SAVE.regionDone[c.map]).length; $('worldProg').textContent = '🗺️ '+done+' / '+TD.CAMPAIGN.length+' regions cleared · each victory opens the next region';
  renderWorldInfo();
}
function renderWorldInfo(){
  const i = G.mapIdx, m = TD.MAPS[i], ms = mapSave(m.id), open = unlocked(i), reg = TD.CAMPAIGN.find(c=>c.map===m.id);
  const lockTxt = m.secretMap ? 'Find all three ancient keystones hidden in ruins' : (m.needLevel ? 'Reach player level '+m.needLevel : (m.tiered ? 'Win Green Valley first' : 'Win '+((TD.MAPS[i-1]||{}).name||'the previous region')+' first'));
  const ks = TD.KEYSTONE_MAPS.includes(m.id) ? (SAVE.keys.includes(m.id) ? ' · 🗝️ keystone found' : ' · 🗝️ something ancient hides in the ruins…') : '';
  const med = TD.MAP_CHALLENGES.map(id=>{ const r = TD.CHALLENGE_RULES.find(x=>x.id===id), got = SAVE.mapCh[m.id] && SAVE.mapCh[m.id][id]; return '<span class="medal'+(got?' got':'')+'" title="'+r.name+': '+r.desc+'">'+r.icon+'</span>'; }).join('');
  $('worldInfo').innerHTML = '<div class="wiHead"><b>'+(reg ? reg.icon+' '+reg.region+(reg.region!==m.name ? ' · '+m.name : '') : m.name)+'</b><span>'+(ms.stars ? '★'.repeat(ms.stars) : '☆☆☆')+(ms.hard ? ' 👑' : '')+(SAVE.regionDone[m.id] ? ' · cleared' : '')+'</span></div>'+
    '<div class="wiEff">'+m.effectText+'</div><div class="wiSub">Boss: '+m.boss+(TD.BOSS_TRAIT_BY_MAP[m.id] ? ' ('+TD.BOSS_TRAIT_BY_MAP[m.id].map(k=>TD.BOSS_TRAITS[k].icon+' '+TD.BOSS_TRAITS[k].name).join(', ')+')' : '')+(m.spread ? ' · '+(m.spread.kind==='lava' ? '🌋 spreading lava' : '🧊 breaking ice') : '')+(m.airBoss ? ' · Air boss: '+m.airBoss : '')+' · '+m.waves+' waves'+(ms.best ? ' · best '+ms.best : '')+ks+'</div>'+
    '<div class="wiMed">Map challenges '+med+' <small>(Challenge mode · +1 🔮 each)</small></div>'+
    (open ? '<div class="wiBtns"><button class="bigbtn fun" id="wiPlay">▶ PLAY</button><button id="wiHard">💀 HARD</button><button id="wiModes">MODES…</button></div>' : '<div class="wiLock">🔒 '+lockTxt+'</div>');
  if(open){ const go = mode=>()=>{ unlockAudio(); const f = ()=>startMap(G.mapIdx, mode); if(window.gameAdBreak) window.gameAdBreak('preroll', f); else f(); };
    $('wiPlay').onclick = go('normal'); $('wiHard').onclick = go('hard'); $('wiModes').onclick = ()=>{ sfx('click'); showPanel('maps'); }; }
}
// ---- secrets codex ----
function renderSecrets(){
  const sec = (icon, name, found, total, items)=>'<div class="scItem"><div class="scHead"><span>'+icon+'</span><b>'+name+'</b><i>'+found+' / '+total+'</i></div><div class="scList">'+items.join('')+'</div></div>';
  const it = (ok, txt, hint)=>'<span class="'+(ok?'ok':'unk')+'">'+(ok ? txt : '❔ '+(hint||'???'))+'</span>';
  const keys = TD.KEYSTONE_MAPS.map(id=>it(SAVE.keys.includes(id), '🗝️ '+TD.MAPS[mapIndex(id)].name, 'hidden in old ruins'));
  const pathMaps = TD.MAPS.filter(m=>(m.routes||[]).some(r=>r.kind==='secret')); const paths = pathMaps.map(m=>it(SAVE.paths && SAVE.paths[m.id], '🚪 '+m.name, 'a door on '+m.name));
  const bossMaps = Object.keys(TD.SECRET_BOSSES).filter(id=>mapIndex(id) >= 0); const bosses = bossMaps.map(id=>it(SAVE.secretBoss[id], '🗿 '+TD.SECRET_BOSSES[id]+' ('+TD.MAPS[mapIndex(id)].name+')', 'lose no life for 15 waves on '+TD.MAPS[mapIndex(id)].name));
  const combos = TD.COMBOS.map(c=>it(SAVE.combos.includes(c.id), c.icon+' '+c.name, c.hint));
  const hyb = Object.keys(TD.HYBRIDS).map(k=>it(SAVE.recipes.includes(k), TD.HYBRIDS[k].icon+' '+TD.HYBRIDS[k].name, 'merge two towers'));
  const others = [ it(legendUnlocked('aether'), '💠 Aether Prism (secret legendary)', TD.AETHER_HOW), it(unlocked(mapIndex('caverns')), '💎 Crystal Caverns (secret region)', 'a region that is on no map'), it(SAVE.skins.owned.includes('ancient_tesla'), '🗿 Ancient Tesla skin', 'defeat a secret boss') ];
  const cnt = a=>a.filter(x=>x.indexOf('class="ok"')>=0).length;
  const all = [keys, paths, bosses, combos, hyb, others], f = all.reduce((a,x)=>a+cnt(x),0), t = all.reduce((a,x)=>a+x.length,0);
  $('secretsList').innerHTML = '<div class="scTotal">🔍 '+f+' / '+t+' secrets found</div>'+sec('🗝️','Ancient keystones',cnt(keys),keys.length,keys)+sec('🎯','Tower combos',cnt(combos),combos.length,combos)+sec('🗿','Secret bosses',cnt(bosses),bosses.length,bosses)+sec('🚪','Secret paths',cnt(paths),paths.length,paths)+sec('⚗️','Hybrid towers',cnt(hyb),hyb.length,hyb)+sec('💠','Hidden treasures',cnt(others),others.length,others);
}
function renderSeason(){
  const S = TD.seasonNow(), SS = ensureSeason(), days = Math.max(1, Math.ceil((S.ends - new Date())/86400000));
  $('snName').innerHTML = S.theme.icon+' '+S.name; $('snName').style.color = S.theme.color;
  $('snInfo').textContent = 'Ends in '+days+' day'+(days>1?'s':'')+' · season twist: '+S.theme.modText;
  const into = SS.sxp - SS.tier*TD.SEASON_TIER_XP;
  $('snTrack').innerHTML = Array.from({length:TD.SEASON_TIERS},(_,i)=>{ const r = TD.SEASON_REWARDS[i], got = SS.tier > i;
    const lab = r.skin ? '🎨' : (r.title ? '🏷️' : (r.crystalsStart ? '💎' : '💰'));
    return '<div class="snTier'+(got?' got':'')+(i===SS.tier?' cur':'')+'" title="'+(r.skin?'Season skin: '+S.theme.skin.name:(r.title?S.theme.name+' Champion title':(r.crystalsStart?'+1 starting crystal every match':'')))+(r.coins?' +'+r.coins+' coins':'')+'"><b>'+(i+1)+'</b><span>'+lab+'</span></div>'; }).join('');
  $('snBar').style.width = (SS.tier>=TD.SEASON_TIERS ? 100 : Math.round(into/TD.SEASON_TIER_XP*100))+'%';
  $('snXp').textContent = SS.tier>=TD.SEASON_TIERS ? 'Season track complete!' : 'Tier '+SS.tier+' · '+into+' / '+TD.SEASON_TIER_XP+' season XP (10 per wave, +100 per win, +'+TD.SEASON_GOAL_REWARD.sxp+' per goal)';
  $('snGoals').innerHTML = SS.goals.map(g=>{ const def = TD.SEASON_POOL.find(x=>x.id===g.id); const pct = Math.round(g.p/g.n*100);
    return '<div class="chItem'+(g.done?' done':'')+'"><span class="chIcon">'+def.icon+'</span><div class="chBody"><b>'+def.text.replace('{n}', g.n)+(g.done?' ✓':'')+'</b><div class="chBar"><i style="width:'+pct+'%"></i></div></div><em>'+(g.done?'DONE':Math.floor(g.p)+'/'+g.n)+'<small>+'+TD.SEASON_GOAL_REWARD.coins+' 💰</small></em></div>'; }).join('');
  $('snBest').textContent = 'Season best — Endless: '+(SS.best||0)+' waves';
}
const MODE_NAME = id => (TD.MODES.find(m=>m.id===id)||{}).name || id;
function renderRecords(){
  const lb = SAVE.lb||[], mapName = id => (TD.MAPS.find(m=>m.id===id)||{}).name || id;
  const rowsOf = list => list.length ? list.map((r,i)=>'<div class="lbRow'+(i<3?' top':'')+'"><span class="lbPos">'+(i<3?['🥇','🥈','🥉'][i]:(i+1))+'</span><b>'+r.wave+' waves</b><span>'+mapName(r.map)+' · '+MODE_NAME(r.mode)+(r.won?' ✓':'')+'</span><small>'+r.kills+' kills · '+r.date+'</small></div>').join('') : '<div class="lbEmpty">No runs yet — go set a record!</div>';
  $('lbEndless').innerHTML = rowsOf(lb.filter(r=>r.mode==='endless').slice(0,10));
  $('lbOther').innerHTML = rowsOf(lb.filter(r=>r.mode!=='endless').slice(0,10));
  const S = TD.seasonNow(); $('lbSeasonHead').textContent = S.theme.icon+' '+S.name+' — this season';
  $('lbSeason').innerHTML = rowsOf(lb.filter(r=>r.season===S.id).slice(0,10));
}
function renderSkins(){
  $('skinCoins').textContent = SAVE.coins;
  const lv = ulevel();
  $('skinList').innerHTML = TD.SKINS.map(s=>{ const owned = SAVE.skins.owned.includes(s.id), sel = SAVE.skins.sel[s.tower]===s.id; const d = TOWERS[s.tower], lockd = s.level && lv < s.level;
    let btn;
    if(sel) btn = '<button class="skbtn on" data-id="'+s.id+'" data-act="unsel">EQUIPPED</button>';
    else if(owned) btn = '<button class="skbtn" data-id="'+s.id+'" data-act="sel">EQUIP</button>';
    else if(lockd) btn = '<button class="skbtn" disabled>🔒 LEVEL '+s.level+'</button>';
    else if(s.mastery && mastery(s.tower) < s.mastery) btn = '<button class="skbtn" disabled>🔒 MASTERY '+s.mastery+'</button>';
    else if(s.secret) btn = '<button class="skbtn" disabled>🔒 SECRET BOSS</button>';
    else if(s.season) btn = '<button class="skbtn" disabled>🔒 SEASON '+s.season+'</button>';
    else if(!s.cost) btn = '<button class="skbtn buy" data-id="'+s.id+'" data-act="buy">CLAIM FREE</button>';
    else btn = '<button class="skbtn buy" data-id="'+s.id+'" data-act="buy" '+(SAVE.coins<s.cost?'disabled':'')+'>BUY '+s.cost+' 💰</button>';
    return '<div class="skin'+(sel?' sel':'')+'"><span class="skSw" style="background:linear-gradient(135deg,#'+s.color.toString(16).padStart(6,'0')+',#'+s.accent.toString(16).padStart(6,'0')+')">'+d.icon+'</span>'+
      '<b>'+s.icon+' '+s.name+'</b><span>'+d.name+' skin'+(s.level?' · Lv '+s.level+' reward':'')+(s.mastery?' · mastery '+s.mastery:'')+(s.season?' · season '+s.season:'')+'</span>'+btn+'</div>'; }).join('');
  // titles
  const tl = titleList();
  $('titleList').innerHTML = TD.TITLES.concat(tl.filter(x=>!TD.TITLES.find(y=>y.id===x.id))).map(tt=>{ const own = tl.find(x=>x.id===tt.id), on = SAVE.title===tt.id;
    return '<button class="titleBtn'+(on?' on':'')+(own?'':' locked')+'" data-id="'+tt.id+'" '+(own?'':'disabled')+'><b>'+tt.name+'</b><span>'+(own?(on?'Equipped':'Tap to equip'):'🔒 '+tt.how)+'</span></button>'; }).join('');
  $('titleList').querySelectorAll('.titleBtn:not([disabled])').forEach(b=>b.addEventListener('click', ()=>{ SAVE.title = b.dataset.id; persist(); sfx('click'); renderSkins(); renderProfile(); }));
  $('skinList').querySelectorAll('.skbtn[data-id]').forEach(b=>b.addEventListener('click', ()=>{
    const s = TD.SKINS.find(x=>x.id===b.dataset.id), act = b.dataset.act;
    if(act==='buy'){ if(SAVE.coins < s.cost || (s.level && ulevel() < s.level)){ sfx('nope'); return; } SAVE.coins -= s.cost; SAVE.skins.owned.push(s.id); SAVE.skins.sel[s.tower] = s.id; sfx('coin'); }
    else if(act==='sel'){ SAVE.skins.sel[s.tower] = s.id; sfx('click'); }
    else { delete SAVE.skins.sel[s.tower]; sfx('click'); }
    persist(); renderSkins(); renderProfile();
  }));
}
function clearV6(){
  if(G.robot){ W.removeRobot(G.robot.mesh); G.robot = null; }
  (G.pickups||[]).forEach(p=>W.remove(p.mesh)); G.pickups = [];
  (G.holes||[]).forEach(h=>W.remove(h.mesh)); G.holes = [];
  const cw = $('choiceWrap'); if(cw) cw.classList.remove('show'); const sh = $('survHud'); if(sh) sh.classList.remove('show');
  G.moveT = null; G.survT = 0;
}
function openMenu(){
  clearV6();
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
    else if(a.a==='sell') towers.delete(key);
    else if(a.a==='move'){ const tt = towers.get(a.ox+','+a.oz); if(tt){ towers.delete(a.ox+','+a.oz); tt.x = a.x; tt.z = a.z; towers.set(key, tt); } } }
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
  if(moved > 10 || G.phase==='menu' || G.phase==='perk' || G.phase==='shop' || G.phase==='choice' || G.over || G.paused) return;
  unlockAudio();
  const p = W.pick(e.clientX, e.clientY);
  if(!p){ deselect(); return; }
  if(G.heroMode && G.hero){ G.hero.tx = clamp(p.x, 0.2, G.map.w-0.2); G.hero.tz = clamp(p.z, 0.2, G.map.h-0.2); G.heroMode = false; W.showMarker(G.hero.tx, G.hero.tz, 0.5); setTimeout(()=>{ if(!G.targetMode) W.hideMarker(); }, 500); sfx('click'); renderAbilities(); renderBuildBar(); return; }
  if(G.hero && G.hero.dead<=0 && !G.buildType && !G.targetMode && Math.hypot(p.x-G.hero.x, p.z-G.hero.z) < 0.45){ heroSelectToggle(); return; }
  if(G.targetMode){ if(inside(p.cx,p.cz) || true){ castAbility(G.targetMode, new (window.THREE.Vector3)(p.x, 0.1, p.z)); renderBuildBar(); } return; }
  if(G.moveT){ if(cellFree(p.cx,p.cz)) moveTower(G.moveT, p.cx, p.cz); else if(G.grid.get(p.cx+','+p.cz)===G.moveT){ G.moveT = null; renderBuildBar(); } else { toast('🌀 Pick a free tile', 'bad'); sfx('nope'); } return; }
  const cp = castleFor({ pos:p }); if(!G.buildType && Math.hypot(p.x-cp.x, p.z-cp.z) < 0.95){ if(G.selObj && G.selObj.type==='castle') deselect(); else selectCastle(); return; }
  for(let i=0;i<G.pickups.length;i++){ const q = G.pickups[i]; if(Math.hypot(p.x-q.x, p.z-q.z) < 0.5){ collectPickup(i, false); return; } }
  const t = G.grid.get(p.cx+','+p.cz);
  if(!t && !G.buildType){ const pe = pickEnemy(e.clientX, e.clientY); if(pe){ if(G.selE===pe) deselect(); else selectEnemy(pe); return; } }
  if(t){ if(t.hijack > 0){ breakFree(t); if(G.sel!==t) select(t); return; }
    if(t.ultReady && G.phase==='wave'){ unleash(t); if(G.sel!==t) select(t); return; }
    if(G.sel===t) deselect(); else select(t); return; }
  const ob = G.objs.get(p.cx+','+p.cz);
  if(ob){ if(G.selObj===ob) deselect(); else selectObj(ob); if(G.buildType && ob.type==='tree') toast('🌳 A tree is in the way — clear it for '+TREE_COST+' gold', 'tip'); return; }
  if(G.buildType){ if(TOWERS[G.buildType].onPath) build(G.buildType, p.cx, p.cz); else if(cellFree(p.cx,p.cz)) build(G.buildType, p.cx, p.cz); else if(inside(p.cx,p.cz)) { toast('Can\'t build on the road', 'bad'); sfx('nope'); } return; }
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
  if(G.moveT){ if(inside(p.cx,p.cz)){ const ok = cellFree(p.cx,p.cz); W.showGhost(p.cx,p.cz, ok); W.showRing(p.cx+0.5, p.cz+0.5, stat(G.moveT,'range')||1, ok); } else W.hideGhost(); return; }
  if(G.buildType){
    const B = TOWERS[G.buildType], ok = (B.onPath ? roadFree(p.cx,p.cz) : cellFree(p.cx,p.cz)) && (B.legendary ? G.crystals >= B.cry : G.gold >= B.cost);
    if(inside(p.cx,p.cz)){ W.showGhost(p.cx,p.cz, ok); W.showRing(p.cx+0.5, p.cz+0.5, (B.range ? B.range[0] : 1)*(G.storm.active?0.75:1), ok); } else { W.hideGhost(); if(!G.sel) W.hideRing(); }
  }else if(t && t!==G.sel){ W.showRing(t.x, t.z, stat(t,'range'), true); }
  else if(!G.sel){ W.hideRing(); }
}
function onKey(e){
  if(G.phase==='menu'){ if(e.code==='Enter'||e.code==='Space'){ e.preventDefault(); if($('mp-maps').classList.contains('show')) $('playBtn').click(); else if($('mp-world').classList.contains('show')){ if($('wiPlay')) $('wiPlay').click(); } else $('mPlay').click(); } return; }
  if(e.code==='KeyP' || (e.code==='Escape' && G.paused)){ setPaused(!G.paused); return; }
  if(G.over || G.paused) return;
  const n = parseInt(e.key,10);
  if(G.phase==='perk'){ if(n>=1 && n<=3) choosePerk(n-1); return; }
  if(G.phase==='shop'){ if(n>=1 && n<=6) buyShop(n-1); if(e.code==='Enter'||e.code==='Space'||e.code==='Escape'){ e.preventDefault(); closeShop(); } return; }
  if(G.phase==='choice'){ if(n>=1 && n<=3) pickChoice(n-1); return; }
  if(e.code==='Escape' && G.moveT){ G.moveT = null; W.hideGhost(); renderBuildBar(); return; }
  if(e.code==='KeyR'){ robotToggle(); return; }
  if(e.code==='KeyG'){ setBuildType('generator'); return; }
  if(n>=1 && n<=7){ const k = (G.loadout||[])[n-1]; if(k) setBuildType(k); return; }
  if(e.code==='KeyT' && G.sel && TOWERS[G.sel.type].proj!=='none'){ const i = PRIOS.findIndex(x=>x.id===(G.sel.prio||'first')); G.sel.prio = PRIOS[(i+1)%PRIOS.length].id; G.sel.target = null; toast('🎯 Target: '+PRIOS[(i+1)%PRIOS.length].name, 'tip'); renderPanel(); return; }
  if(e.code==='KeyF'){ unleashAll(); return; }
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
function autoQuality(){ return (navigator.maxTouchPoints > 0 || innerWidth*innerHeight < 700*500) ? 'medium' : 'high'; }
// Auto graphics: if the frame rate stays low during waves, step the quality down
const FPS = { t:0, n:0 };
function fpsWatch(dt){
  if(SAVE.quality!=='auto' || G.phase!=='wave' || G.paused || W.qual==='low') { FPS.t = FPS.n = 0; return; }
  FPS.t += dt; FPS.n++; if(FPS.t < 5) return; const fps = FPS.n/FPS.t; FPS.t = FPS.n = 0;
  if(fps < 38){ W.setQuality(W.qual==='high' ? 'medium' : 'low'); toast('⚙️ Graphics set to '+W.qual+' for smoother play', 'tip'); syncToggles(); }
}
function loop(now){
  G.raf = requestAnimationFrame(loop);
  if(W.sizeChanged()) W.resize();
  let dt = (now - G.last)/1000; G.last = now; if(!(dt>0)) dt = 0; if(dt > 0.1) dt = 0.1;
  if(!G.firstFrame){ G.firstFrame = true; setLoad(1); }
  fpsWatch(dt);
  if(G.phase!=='menu' && !G.paused && !G.over){
    let sim = dt*G.speed;
    while(sim > 0){ const h = Math.min(sim, 1/60); step(h); sim -= h; }
  }
  W.tick(dt, now/1000);
  if(G.phase!=='menu') numsTick(dt*G.speed);
  uiT += dt;
  if(G.boss && G.phase!=='menu') updateBossBar();
  if(uiT > 0.15){ uiT = 0; if(G.phase!=='menu'){ renderHud(); if(G.phase==='build') renderWaveBtn(); renderAbilities();
    if(G.sel) livePanel(G.sel); else if(G.selE && !G.selObj) renderEnemyPanel();
    if(G.selObj && G.selObj.type==='castle'){ const sig = G.phase+'|'+G.gateLeft+'|'+TD.BASE_UPGRADES.map(u=>G.gold>=baseCost(u.id)?1:0).join(''); if(sig!==G.castleSig){ G.castleSig = sig; renderPanel(); } }
    renderSurv();
    renderUltBtn(); renderStreak();
    if(G.selObj && CLEAR_COST[G.selObj.type]){ $('pUp').disabled = G.gold < Math.round(CLEAR_COST[G.selObj.type]*costMul()); }
    if(G.evSurge > 0 || G.cmd) renderChips();
    // the branch and ascension buttons need the same gold refresh as the upgrade button
    // ([data-lock] marks a button held shut by a rule or by missing mastery)
    if(G.sel && G.sel.level<4){ const up=$('pUp'), c = towerCost(G.sel.type, G.sel.level+1, G.sel.branch);
      if(up.style.display!=='none' && !up.dataset.lock) up.disabled = G.gold < c;
      if(G.sel.level>=2) $('pBranch').querySelectorAll('.brbtn:not([data-lock])').forEach(b=>b.disabled = G.gold < c); }
    renderBuildBarPoor(); } }
  W.render();
}
function renderBuildBarPoor(){ $('buildBar').querySelectorAll('.tcard').forEach(b=>{ const d = TOWERS[b.dataset.type]; if(!d) return; b.classList.toggle('poor', d.legendary ? (G.crystals < d.cry || G.legendBuilt) : G.gold < d.cost); }); }

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
  if(!SAVE.quality) SAVE.quality = 'auto';
  W.init($('mount'), SAVE.quality==='auto' ? autoQuality() : SAVE.quality);
  G.mapIdx = 0; for(let i=TD.MAPS.length-1;i>=0;i--){ if(unlocked(i)){ G.mapIdx = i; break; } }
  { const next = TD.CAMPAIGN.find(c=>{ const i = mapIndex(c.map); return unlocked(i) && !SAVE.regionDone[c.map]; }); if(next) G.mapIdx = mapIndex(next.map); }
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
  $('sQuality').addEventListener('click', ()=>{ const order = ['auto','high','medium','low']; SAVE.quality = order[(order.indexOf(SAVE.quality||'auto')+1) % order.length]; persist(); W.setQuality(SAVE.quality==='auto' ? autoQuality() : SAVE.quality); syncToggles(); });
  $('sLevels').addEventListener('click', ()=>{ SAVE.lvTags = SAVE.lvTags===false; persist(); G.lvTags = SAVE.lvTags !== false; syncToggles(); });
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
  $('pUp').addEventListener('click', ()=>{ if(G.selObj && G.selObj.type==='secretgate') openSecret(G.selObj); else if(G.selObj && G.selObj.type==='crater') mineCrater(G.selObj); else if(G.selObj && CLEAR_COST[G.selObj.type]) clearObj(G.selObj); else upgrade(G.sel); });
  $('prPrestige').addEventListener('click', ()=>{ unlockAudio(); doPrestige(); });
  $('ultAll').addEventListener('click', ()=>{ unlockAudio(); unleashAll(); });
  $('riskBtn').addEventListener('click', ev=>{ ev.stopPropagation(); G.riskNext = !G.riskNext; sfx(G.riskNext?'phase':'click'); renderWaveBtn(); if(G.riskNext) toast('🔴 '+TD.RISK.desc, 'bad'); });
  $('shopDone').addEventListener('click', ()=>closeShop());
  $('sAuto').addEventListener('click', ()=>{ SAVE.autoUlt = !SAVE.autoUlt; persist(); syncToggles(); });
  restoreSeasonSkins();
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
  dbgMerge:(a,b)=>mergeTowers(a,b), selectT:select, chooseRoute, pickChoice, openChoice, collapseRoad, meteorEvent, evolve, groundIt, buyBase, moveTower, startMove, infuse, spawnRobot, dropPickup, computePower,
  combo, selectCastle, robotToggle, selectEnemy, finalForm, renderWorld:()=>renderWorld(), mineCrater, endSurvival, infect, relocateCost, legendUnlocked, addCores, buyShop, closeShop, unleash, openShop, takeover, makeSecret, openSecret, choosePerk, offerPerks, triggerEvent, useLastStand, heroSelectToggle, openReplay, recomputeSyn, stat, retreat, selectObj, doPrestige,
  bossTrait, bossTraitHp, lastDitch, towerXp, spreadWarnNext, spreadBreak, rockfallDrop, bouldersAge, renderBestiary, renderMaps, cloneImp, volatileBlast, snapToRoute, later, mut:()=>G.mut };

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

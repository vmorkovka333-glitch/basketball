'use strict';
// ===================================================================
// Tower Defense 3D — game state, waves, combat, UI, audio, save
// ===================================================================
(function(){
const W = TD.W, TOWERS = TD.TOWERS, ENEMIES = TD.ENEMIES;
const $ = id => document.getElementById(id);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
let T;

const G = {
  phase:'menu', map:null, mapIdx:0, gold:0, lives:0, wave:0, endless:false,
  towers:[], grid:new Map(), enemies:[], projs:[], queue:[], buildTimer:-1,
  speed:1, paused:false, adPaused:false, sel:null, buildType:null, hover:null,
  t:0, kills:0, earned:0, started:false, raf:0, last:0, over:false, won:false,
};
window.TD.G = G;

// ---- save ------------------------------------------------------------
const SAVE_KEY = 'td.save.v1';
let SAVE = { maps:{}, vol:0.6, muted:false, music:true, games:0 };
function loadSave(){ try{ const r = localStorage.getItem(SAVE_KEY); if(r) SAVE = Object.assign(SAVE, JSON.parse(r)); }catch(e){} }
function persist(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); }catch(e){} }
function mapSave(id){ return SAVE.maps[id] || (SAVE.maps[id] = { stars:0, best:0 }); }
function unlocked(i){ return i===0 || (mapSave(TD.MAPS[i-1].id).stars > 0); }

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
function setMuted(m){ SAVE.muted = !!m; persist(); if(master) master.gain.value = SAVE.muted ? 0.0001 : SAVE.vol; syncSoundBtn(); }
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
    case 'ice': tone(1400, 'sine', t, 0.18, 0.09, 2200); tone(2100, 'sine', t+0.03, 0.14, 0.05); break;
    case 'zap': noise(t, 0.12, 0.2, 2500, 9000); tone(220, 'sawtooth', t, 0.12, 0.09, 80); break;
    case 'snipe': noise(t, 0.09, 0.4, 900, 7000); tone(180, 'square', t, 0.12, 0.12, 60); break;
    case 'pop': tone(320, 'triangle', t, 0.12, 0.12, 120); noise(t, 0.08, 0.1, 300, 3000); break;
    case 'bosspop': tone(120, 'sawtooth', t, 0.6, 0.3, 40); noise(t, 0.5, 0.35, 60, 2000); break;
    case 'build': noise(t, 0.12, 0.2, 100, 1200); tone(520, 'triangle', t+0.05, 0.16, 0.12); tone(780, 'triangle', t+0.12, 0.2, 0.1); break;
    case 'upgrade': [520,660,880].forEach((f,i)=>tone(f, 'triangle', t+i*0.07, 0.22, 0.12)); break;
    case 'sell': [880,660].forEach((f,i)=>tone(f, 'square', t+i*0.06, 0.12, 0.05)); noise(t, 0.1, 0.08, 3000, 9000); break;
    case 'horn': tone(196, 'sawtooth', t, 0.5, 0.14, 262); tone(262, 'sawtooth', t+0.25, 0.6, 0.14); break;
    case 'life': tone(140, 'sawtooth', t, 0.35, 0.22, 60); noise(t, 0.2, 0.15, 100, 800); break;
    case 'win': [523,659,784,1047,1319].forEach((f,i)=>tone(f, 'triangle', t+i*0.09, 0.5, 0.14)); break;
    case 'lose': [392,349,311,262].forEach((f,i)=>tone(f, 'sawtooth', t+i*0.16, 0.45, 0.1)); break;
    case 'click': tone(700, 'square', t, 0.04, 0.04); break;
    case 'nope': tone(160, 'square', t, 0.12, 0.08, 120); break;
  }
}
// ambient loop: slow chord pads with a soft pulse, ducked under the action
let musTimer=0, musGain=null, musStep=0;
const CHORDS = [[131,165,196,247],[110,131,165,196],[147,175,220,262],[123,147,185,220]];
function startMusic(){
  if(!AC) return;
  musGain = AC.createGain(); musGain.gain.value = SAVE.music ? 0.5 : 0.0001; musGain.connect(master);
  const step = ()=>{
    if(!AC) return;
    const t = AC.currentTime, ch = CHORDS[Math.floor(musStep/4)%CHORDS.length];
    if(musStep%4===0) ch.forEach((f,i)=>{ const o=AC.createOscillator(), g=AC.createGain(); o.type=i%2?'triangle':'sine'; o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.06,t+0.6); g.gain.exponentialRampToValueAtTime(0.0001,t+3.4); o.connect(g).connect(musGain); o.start(t); o.stop(t+3.5); });
    const o=AC.createOscillator(), g=AC.createGain(); o.type='sine'; o.frequency.value=ch[musStep%2?1:0]*2;
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.05,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+0.35); o.connect(g).connect(musGain); o.start(t); o.stop(t+0.4);
    musStep++; musTimer = setTimeout(step, 850);
  };
  step();
}
function setMusic(on){ SAVE.music = !!on; persist(); if(musGain) musGain.gain.value = on ? 0.5 : 0.0001; syncMusicBtn(); }

// ---- helpers ---------------------------------------------------------
function toast(msg, cls){
  const host = $('toasts'); const el = document.createElement('div'); el.className = 'toast '+(cls||''); el.textContent = msg; host.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 300); }, 2200);
  while(host.children.length>3) host.removeChild(host.firstChild);
}
function towerCost(type, level){ const d = TOWERS[type]; return level===1 ? d.cost : d.upg[level-2]; }
function towerValue(t){ let v = TOWERS[t.type].cost; for(let l=2;l<=t.level;l++) v += TOWERS[t.type].upg[l-2]; return v; }
function stat(t, key){ return TOWERS[t.type][key][t.level-1]; }
function cellFree(cx, cz){
  const m = G.map; if(cx<0||cz<0||cx>=m.w||cz>=m.h) return false;
  if(m.pathSet.has(cx+','+cz)) return false;
  return !G.grid.has(cx+','+cz);
}

// ---- match setup -----------------------------------------------------
function startMap(idx, endless){
  G.mapIdx = idx; G.map = TD.MAPS[idx];
  W.buildMap(G.map);
  // wipe anything from the last game
  G.towers.forEach(t=>W.remove(t.mesh)); G.enemies.forEach(e=>W.remove(e.mesh)); G.projs.forEach(p=>W.freeProj(p.kind,p.mesh));
  G.towers = []; G.grid = new Map(); G.enemies = []; G.projs = []; G.queue = []; W.fxReset(); W.hideRing(); W.hideGhost();
  G.gold = G.map.gold; G.lives = G.map.lives; G.wave = 0; G.endless = !!endless; G.kills = 0; G.earned = 0; G.t = 0;
  G.phase = 'build'; G.buildTimer = -1; G.sel = null; G.buildType = null; G.over = false; G.won = false; G.speed = 1; G.paused = false;
  SAVE.games = (SAVE.games||0)+1; persist();
  $('app').classList.remove('menu'); $('menu').classList.add('hide'); $('result').classList.remove('show'); $('pauseWrap').classList.remove('show');
  G.started = true;
  if(typeof window.onGameplayStart==='function') window.onGameplayStart();
  renderHud(); renderBuildBar(); renderPanel(); renderWaveBtn(); syncSpeed();
  toast(G.map.tip, 'tip');
}

// ---- towers ----------------------------------------------------------
function build(type, cx, cz){
  const cost = TOWERS[type].cost;
  if(G.gold < cost){ toast('Not enough gold', 'bad'); sfx('nope'); return false; }
  if(!cellFree(cx,cz)){ sfx('nope'); return false; }
  G.gold -= cost;
  const t = { type, level:1, cx, cz, x:cx+0.5, z:cz+0.5, mesh:W.makeTower(type,1), cool:0.3, target:null, kills:0, dmg:0 };
  t.mesh.position.set(t.x, 0, t.z); t.mesh.scale.setScalar(0.01); t.pop = 0; W.add(t.mesh);
  G.towers.push(t); G.grid.set(cx+','+cz, t);
  W.burst(t.x, 0.3, t.z, 0xd8c9a0, 18, 2.2, 0.6, 3.5, 6, 2.0);
  sfx('build'); select(t); renderHud(); renderBuildBar();
  return true;
}
function upgrade(t){
  if(!t || t.level>=3) return;
  const cost = towerCost(t.type, t.level+1);
  if(G.gold < cost){ toast('Not enough gold', 'bad'); sfx('nope'); return; }
  G.gold -= cost; t.level++;
  const yaw = t.mesh.head.rotation.y;
  W.remove(t.mesh); t.mesh = W.makeTower(t.type, t.level); t.mesh.position.set(t.x, 0, t.z); t.mesh.head.rotation.y = yaw; W.add(t.mesh);
  t.mesh.scale.setScalar(0.7); t.pop = 0;
  W.burst(t.x, 0.6, t.z, TOWERS[t.type].accent, 26, 2.6, 0.7, 3.5, 4, 2.2);
  sfx('upgrade'); renderHud(); renderPanel(); renderBuildBar();
}
function sell(t){
  if(!t) return;
  const v = Math.round(towerValue(t)*TD.SELL_RATE);
  G.gold += v; W.remove(t.mesh); G.grid.delete(t.cx+','+t.cz); G.towers.splice(G.towers.indexOf(t),1);
  W.burst(t.x, 0.4, t.z, 0xffd54a, 16, 2.0, 0.6, 3, 5, 1.8);
  sfx('sell'); toast('+'+v+' gold', 'good'); deselect(); renderHud(); renderBuildBar();
}
function select(t){ G.sel = t; G.buildType = null; renderPanel(); renderBuildBar(); W.showRing(t.x, t.z, stat(t,'range'), true); W.hideGhost(); }
function deselect(){ G.sel = null; renderPanel(); W.hideRing(); }
function setBuildType(type){
  if(G.buildType===type) type = null;
  G.buildType = type; G.sel = null; renderPanel(); renderBuildBar(); W.hideRing(); W.hideGhost();
  if(type) sfx('click');
}

// ---- waves -----------------------------------------------------------
function callWave(){
  if(G.phase!=='build' || G.over) return;
  let bonus = 0;
  if(G.buildTimer > 0){ bonus = Math.round(G.buildTimer*1.5); G.gold += bonus; G.earned += bonus; }
  G.wave++;
  const groups = TD.genWave(G.mapIdx, G.wave);
  let at = 0.6; G.queue = [];
  groups.forEach(gr=>{ for(let i=0;i<gr.count;i++){ G.queue.push({ type:gr.type, at }); at += gr.gap; } at += gr.pause; });
  G.spawnT = 0; G.phase = 'wave';
  sfx('horn');
  toast('Wave '+G.wave+(bonus?'  ·  +'+bonus+' early bonus':''), bonus?'good':'');
  renderHud(); renderWaveBtn();
}
function spawn(type){
  const d = ENEMIES[type], mul = type==='boss' ? TD.bossMul(G.wave, G.map.diff) : TD.hpMul(G.wave, G.map.diff);
  const route = d.air ? G.map.airRoute : G.map.route;
  const e = { type, d, hp: Math.round(d.hp*mul), maxHp: Math.round(d.hp*mul), speed:d.speed, armor:d.armor, gold: Math.round(d.gold*TD.goldMul(G.wave)),
    air:!!d.air, mesh:W.makeEnemy(type), route, seg:0, dist:0, slow:0, slowT:0, dead:false, flash:0,
    pos: route[0].clone(), lives:d.lives };
  e.pos.y = e.mesh.baseY; e.mesh.position.copy(e.pos); W.add(e.mesh);
  G.enemies.push(e);
}
function waveCleared(){
  const bonus = TD.waveBonus(G.wave); G.gold += bonus; G.earned += bonus;
  toast('Wave '+G.wave+' cleared  ·  +'+bonus+' gold', 'good');
  if(G.wave >= G.map.waves && !G.endless){ finish(true); return; }
  G.phase = 'build'; G.buildTimer = TD.BUILD_TIME;
  renderHud(); renderWaveBtn();
}

// ---- combat ----------------------------------------------------------
const _v = new THREE_VEC(), _v2 = new THREE_VEC();
function THREE_VEC(){ return new (window.THREE.Vector3)(); }
function inRange(t, e, r){ const dx = e.pos.x-t.x, dz = e.pos.z-t.z; return dx*dx+dz*dz <= (r+e.d.size)*(r+e.d.size); }
function canHit(t, e){ const d = TOWERS[t.type]; return e.air ? d.air : d.ground; }
function pickTarget(t){
  const r = stat(t,'range'); let best = null, bd = -1;
  for(const e of G.enemies){ if(e.dead || !canHit(t,e) || !inRange(t,e,r)) continue; if(e.dist > bd){ bd = e.dist; best = e; } }
  return best;
}
function muzzleWorld(t){ const v = t.mesh.muzzle.clone(); t.mesh.head.localToWorld(v); return v; }
function hit(e, dmg, pierce, src){
  if(e.dead) return;
  const eff = pierce ? dmg : Math.max(1, dmg - e.armor);
  e.hp -= eff; e.flash = 0.1; if(src) src.dmg += eff;
  if(e.hp <= 0) kill(e, src);
}
function kill(e, src){
  e.dead = true; G.kills++; G.gold += e.gold; G.earned += e.gold; if(src) src.kills++;
  const c = e.d.color;
  W.burst(e.pos.x, e.pos.y+e.d.size*1.4, e.pos.z, c, e.type==='boss'?90:22, e.type==='boss'?4.5:2.6, 0.7, e.type==='boss'?5:3.2, 6, 1.4);
  W.burst(e.pos.x, e.pos.y+e.d.size*1.4, e.pos.z, 0xffe14b, e.type==='boss'?24:6, 2.0, 0.5, 2.5, 4, 1.2);
  sfx(e.type==='boss'?'bosspop':'pop');
}
function fire(t, e){
  const d = TOWERS[t.type], lvl = t.level-1, dmg = d.dmg[lvl], m = muzzleWorld(t);
  if(d.proj==='arrow' || d.proj==='ice'){
    const mesh = W.projMesh(d.proj); mesh.position.copy(m);
    G.projs.push({ kind:d.proj, mesh, pos:m.clone(), target:e, speed:d.proj==='arrow'?15:10, dmg, src:t, slow:d.slow?d.slow[lvl]:0, slowT:d.slowT?d.slowT[lvl]:0, life:3 });
    W.burst(m.x, m.y, m.z, d.accent, 3, 1.2, 0.2, 1.6, 0, 1); sfx(d.proj==='arrow'?'arrow':'ice');
  }else if(d.proj==='shell'){
    const mesh = W.projMesh('shell'); mesh.position.copy(m);
    // lead the target: aim where it will be when the shell lands
    const dist = Math.hypot(e.pos.x-m.x, e.pos.z-m.z), dur = clamp(dist/7, 0.35, 0.9);
    const to = predict(e, dur); to.y = 0.08;
    G.projs.push({ kind:'shell', mesh, from:m.clone(), to, t:0, dur, dmg, splash:d.splash[lvl], src:t, arc:1.2+dist*0.25 });
    W.burst(m.x, m.y, m.z, 0xffb347, 10, 2.2, 0.3, 2.2, 0, 1.2); W.burst(m.x, m.y, m.z, 0x555555, 6, 1.0, 0.5, 3, -1, 1.2); sfx('shell');
  }else if(d.proj==='bolt'){
    const chain = d.chain[lvl]; let cur = e, from = m; const done = new Set([e]);
    for(let i=0;i<chain;i++){
      const p = cur.pos.clone(); p.y += cur.d.size*1.4;
      W.bolt(from, p, 0x9ffcff, 0.05, true); W.burst(p.x,p.y,p.z, 0x9ffcff, 8, 1.8, 0.25, 2.2, 0, 1.6);
      hit(cur, Math.round(dmg*Math.pow(d.chainFall,i)), false, t);
      let next = null, bd = 1.9*1.9;
      for(const o of G.enemies){ if(o.dead||done.has(o)||!canHit(t,o)) continue; const dd = o.pos.distanceToSquared(cur.pos); if(dd<bd){ bd=dd; next=o; } }
      if(!next) break; done.add(next); from = p; cur = next;
    }
    sfx('zap');
  }else if(d.proj==='tracer'){
    const p = e.pos.clone(); p.y += e.d.size*1.4;
    W.bolt(m, p, 0xffd0d0, 0.03, false); W.burst(p.x,p.y,p.z, 0xffffff, 10, 2.4, 0.25, 2.2, 0, 1.6);
    W.burst(m.x, m.y, m.z, 0xffb347, 6, 1.5, 0.2, 1.6, 0, 1);
    hit(e, dmg, true, t); sfx('snipe');
  }
}
function predict(e, dt){
  // walk the route ahead of the enemy by its speed for dt seconds
  const p = e.pos.clone(); let seg = e.seg, left = e.speed*(1-e.slow)*dt;
  while(left>0 && seg<e.route.length-1){
    const nxt = e.route[seg+1]; const dx = nxt.x-p.x, dz = nxt.z-p.z, L = Math.hypot(dx,dz);
    if(L<=left){ p.x = nxt.x; p.z = nxt.z; left -= L; seg++; } else { p.x += dx/L*left; p.z += dz/L*left; left = 0; }
  }
  return p;
}

// ---- simulation step -------------------------------------------------
function step(dt){
  G.t += dt;
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
    let left = e.speed*(1-e.slow)*dt;
    while(left>0 && e.seg < e.route.length-1){
      const nxt = e.route[e.seg+1]; const dx = nxt.x-e.pos.x, dz = nxt.z-e.pos.z, L = Math.hypot(dx,dz);
      if(L<=left){ e.pos.x = nxt.x; e.pos.z = nxt.z; left -= L; e.dist += L; e.seg++; if(e.seg===e.route.length-1) e.reached = true; }
      else { e.pos.x += dx/L*left; e.pos.z += dz/L*left; e.dist += left; e.yaw = Math.atan2(dx, dz); left = 0; }
    }
    if(e.reached && !e.dead){
      e.dead = true; G.lives -= e.lives; sfx('life');
      const c = G.map.castle.position; W.burst(c.x, 0.9, c.z, 0xff4b5c, 30, 2.8, 0.6, 3.5, 5, 1.6);
      toast('-'+e.lives+(e.lives>1?' lives':' life'), 'bad');
      if(G.lives <= 0){ G.lives = 0; finish(false); }
    }
  }
  // towers
  for(const t of G.towers){
    if(t.pop < 1){ t.pop = Math.min(1, t.pop + dt*4); const s = 0.01 + 0.99*(1 - Math.pow(1-t.pop, 3)); t.mesh.scale.setScalar(t.level>1 ? 0.7+0.3*s : s); }
    t.cool -= dt;
    if(!t.target || t.target.dead || !inRange(t, t.target, stat(t,'range'))) t.target = pickTarget(t);
    if(t.target){
      const dx = t.target.pos.x-t.x, dz = t.target.pos.z-t.z, want = Math.atan2(dx, dz);
      let diff = want - t.mesh.head.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      t.mesh.head.rotation.y += diff*Math.min(1, dt*14);
      if(t.cool <= 0 && Math.abs(diff) < 0.5){ fire(t, t.target); t.cool = 1/stat(t,'rate'); }
    }
    if(t.mesh.spin){ t.mesh.spin.rotation.y += dt*(t.type==='frost'?1.4:3); if(t.type==='frost') t.mesh.spin.rotation.x += dt*0.8; }
  }
  // projectiles
  for(let i=G.projs.length-1;i>=0;i--){
    const p = G.projs[i]; let done = false;
    if(p.kind==='shell'){
      p.t += dt/p.dur; const k = Math.min(1,p.t);
      p.mesh.position.lerpVectors(p.from, p.to, k); p.mesh.position.y += p.arc*4*k*(1-k);
      if(p.t >= 1){
        const c = p.to; W.burst(c.x, 0.25, c.z, 0xff8c42, 26, 3.2, 0.5, 4, 5, 1.4); W.burst(c.x, 0.2, c.z, 0x4a4a4a, 14, 1.6, 0.9, 5, 2, 1.2);
        for(const e of G.enemies){ if(e.dead||e.air) continue; const dd = Math.hypot(e.pos.x-c.x, e.pos.z-c.z); if(dd <= p.splash+e.d.size) hit(e, Math.round(p.dmg*(dd<p.splash*0.5?1:0.6)), false, p.src); }
        sfx('boom'); done = true;
      }
    }else{
      const e = p.target; p.life -= dt;
      if(!e || e.dead || p.life<=0){ done = true; }
      else{
        _v.set(e.pos.x, e.pos.y + e.d.size*1.3, e.pos.z).sub(p.pos); const L = _v.length(), mv = p.speed*dt;
        if(L <= mv+0.12){
          hit(e, p.dmg, false, p.src);
          if(p.slow){ e.slow = Math.max(e.slow, p.slow); e.slowT = Math.max(e.slowT, p.slowT); W.burst(e.pos.x, e.pos.y+0.3, e.pos.z, 0xbdf3ff, 8, 1.2, 0.5, 2.2, 1, 1.2); }
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
    e.mesh.position.x = e.pos.x; e.mesh.position.z = e.pos.z; if(!e.air) e.mesh.position.y = 0;
    if(e.yaw!=null) e.mesh.rotation.y = e.yaw;
    W.animateEnemy(e.mesh, G.t + e.dist, true);
    e.mesh.fill.scale.x = Math.max(0.001, e.hp/e.maxHp);
    e.mesh.fill.material.color.set(e.hp/e.maxHp > 0.5 ? 0x52e07a : (e.hp/e.maxHp > 0.25 ? 0xffc857 : 0xff4b5c));
    if(e.flash>0){ e.flash -= dt; e.mesh.torso.scale.setScalar(1.18); } else e.mesh.torso.scale.set(1,1.15,0.9);
    if(e.slow>0){ if(Math.random()<dt*6) W.burst(e.pos.x, e.pos.y+0.25, e.pos.z, 0xbdf3ff, 1, 0.5, 0.5, 1.6, 0.5, 1); }
  }
  if(G.phase==='wave' && !G.queue.length && !G.enemies.length && !G.over) waveCleared();
}

// ---- end of match ----------------------------------------------------
function finish(won){
  if(G.over) return;
  G.over = true; G.won = won; G.phase = 'over'; G.buildType = null; deselect(); W.hideGhost();
  const ms = mapSave(G.map.id);
  const stars = won ? (G.lives >= 18 ? 3 : (G.lives >= 10 ? 2 : 1)) : 0;
  if(won) ms.stars = Math.max(ms.stars, stars);
  ms.best = Math.max(ms.best, G.wave - (won?0:1)); persist();
  if(typeof window.onGameplayStop==='function') window.onGameplayStop();
  sfx(won?'win':'lose');
  const r = $('result'); r.className = 'show '+(won?'win':'lose');
  $('resTitle').textContent = won ? (G.endless ? 'ENDLESS RUN OVER' : 'VICTORY!') : (G.endless ? 'ENDLESS RUN OVER' : 'DEFEAT');
  $('resSub').textContent = won ? G.map.name+' defended' : (G.endless ? 'You held '+G.map.name+' for '+(G.wave-1)+' waves' : 'The castle fell on wave '+G.wave);
  $('resStars').innerHTML = won ? [1,2,3].map(i=>'<span class="'+(i<=stars?'on':'')+'">★</span>').join('') : '';
  $('resStats').innerHTML = [['Waves', won?G.wave:(G.wave-1)],['Kills', G.kills],['Gold earned', G.earned],['Towers', G.towers.length]].map(([l,v])=>'<div><b>'+v+'</b><span>'+l+'</span></div>').join('');
  const next = G.mapIdx+1 < TD.MAPS.length;
  $('resNext').style.display = (won && next && !G.endless) ? '' : 'none';
  $('resEndless').style.display = (won && !G.endless) ? '' : 'none';
  $('resRetry').textContent = won ? 'PLAY AGAIN' : 'TRY AGAIN';
  setTimeout(()=>r.classList.add('show'), 50);
}

// ---- UI --------------------------------------------------------------
function renderHud(){
  $('hGold').textContent = G.gold; $('hLives').textContent = G.lives;
  $('hWave').textContent = (G.phase==='build' ? Math.min(G.wave+1, G.endless?999:G.map.waves) : G.wave) + (G.endless ? '' : ' / '+G.map.waves);
  const lv = $('hLives').parentElement; lv.classList.toggle('low', G.lives <= 5);
}
function renderBuildBar(){
  const bar = $('buildBar');
  if(!bar.children.length){
    bar.innerHTML = TD.TOWER_ORDER.map((k,i)=>{ const d = TOWERS[k]; return '<button class="tcard" data-type="'+k+'"><span class="ticon">'+d.icon+'</span><span class="tname">'+d.name+'</span><span class="tcost">'+d.cost+'</span><span class="tkey">'+(i+1)+'</span></button>'; }).join('');
    bar.querySelectorAll('.tcard').forEach(b=>b.addEventListener('click', ()=>{ unlockAudio(); setBuildType(b.dataset.type); }));
  }
  bar.querySelectorAll('.tcard').forEach(b=>{ const d = TOWERS[b.dataset.type]; b.classList.toggle('on', G.buildType===b.dataset.type); b.classList.toggle('poor', G.gold < d.cost); });
  $('buildHint').textContent = G.buildType ? 'Tap a free tile to place the '+TOWERS[G.buildType].name+' · '+TOWERS[G.buildType].desc : '';
}
function renderPanel(){
  const p = $('panel'), t = G.sel;
  if(!t){ p.classList.remove('show'); return; }
  const d = TOWERS[t.type], lv = t.level, nxt = lv<3;
  $('pName').textContent = d.icon+' '+d.name; $('pLvl').textContent = 'Level '+lv+(lv===3?' · MAX':'');
  const row = (l,a,b)=>'<div class="prow"><span>'+l+'</span><b>'+a+(b!=null?' <i>→ '+b+'</i>':'')+'</b></div>';
  let s = row('Damage', d.dmg[lv-1], nxt?d.dmg[lv]:null) + row('Range', d.range[lv-1], nxt?d.range[lv]:null) + row('Rate', d.rate[lv-1]+'/s', nxt?d.rate[lv]+'/s':null);
  if(d.splash) s += row('Splash', d.splash[lv-1], nxt?d.splash[lv]:null);
  if(d.slow) s += row('Slow', Math.round(d.slow[lv-1]*100)+'%', nxt?Math.round(d.slow[lv]*100)+'%':null);
  if(d.chain) s += row('Chain', d.chain[lv-1], nxt?d.chain[lv]:null);
  s += row('Targets', (d.ground?'Ground':'')+(d.ground&&d.air?' + ':'')+(d.air?'Air':''));
  s += row('Kills', t.kills, null);
  $('pStats').innerHTML = s;
  const up = $('pUp');
  if(nxt){ const c = towerCost(t.type, lv+1); up.style.display=''; up.textContent = 'UPGRADE  '+c; up.disabled = G.gold < c; } else up.style.display = 'none';
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
function syncSoundBtn(){ const b = $('sndBtn'); if(b) b.classList.toggle('off', SAVE.muted); const m = $('mSound'); if(m) m.classList.toggle('off', SAVE.muted); }
function syncMusicBtn(){ const b = $('mMusic'); if(b) b.classList.toggle('off', !SAVE.music); }

function renderMenu(){
  const host = $('mapCards');
  host.innerHTML = TD.MAPS.map((m,i)=>{
    const s = mapSave(m.id), open = unlocked(i);
    return '<button class="mapCard theme-'+m.theme+(open?'':' locked')+(i===G.mapIdx?' on':'')+'" data-i="'+i+'">'+
      '<span class="mcName">'+m.name+'</span><span class="mcSub">'+m.waves+' waves'+(s.best?' · best '+s.best:'')+'</span>'+
      '<span class="mcStars">'+[1,2,3].map(k=>'<i class="'+(k<=s.stars?'on':'')+'">★</i>').join('')+'</span>'+
      (open?'':'<span class="mcLock">🔒 Win the previous map</span>')+'</button>';
  }).join('');
  host.querySelectorAll('.mapCard').forEach(b=>b.addEventListener('click', ()=>{ const i = +b.dataset.i; if(!unlocked(i)){ sfx('nope'); return; } G.mapIdx = i; sfx('click'); renderMenu(); }));
  $('playBtn').textContent = 'PLAY  ·  '+TD.MAPS[G.mapIdx].name;
  $('mVol').value = Math.round(SAVE.vol*100); $('mVolVal').textContent = Math.round(SAVE.vol*100)+'%';
  syncSoundBtn(); syncMusicBtn();
}
function openMenu(){
  G.phase = 'menu'; G.started = false; G.paused = false;
  if(typeof window.onGameplayStop==='function') window.onGameplayStop();
  $('app').classList.add('menu'); $('menu').classList.remove('hide'); $('result').classList.remove('show'); $('pauseWrap').classList.remove('show');
  W.hideRing(); W.hideGhost(); renderMenu();
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
  if(e.target.closest('button, .card, input, #panel, #buildBar, #waveBtn, #hud')) return;
  pdown = { x:e.clientX, y:e.clientY, id:e.pointerId };
}
function onPointerUp(e){
  if(!pdown || pdown.id!==e.pointerId) return;
  const moved = Math.hypot(e.clientX-pdown.x, e.clientY-pdown.y); pdown = null;
  if(moved > 10 || G.phase==='menu' || G.over || G.paused) return;
  unlockAudio();
  const p = W.pick(e.clientX, e.clientY);
  if(!p){ deselect(); return; }
  const t = G.grid.get(p.cx+','+p.cz);
  if(t){ if(G.sel===t) deselect(); else select(t); return; }
  if(G.buildType){ if(cellFree(p.cx,p.cz)) build(G.buildType, p.cx, p.cz); else if(p.cx>=0&&p.cz>=0&&p.cx<G.map.w&&p.cz<G.map.h) { toast('Can\'t build on the road', 'bad'); sfx('nope'); } return; }
  deselect();
}
function onPointerMove(e){
  if(e.pointerType!=='mouse' || G.phase==='menu' || G.over) return;
  if(e.target.closest('button, #panel, #buildBar, #waveBtn, #hud')){ W.hideGhost(); if(!G.sel) W.hideRing(); return; }
  const p = W.pick(e.clientX, e.clientY);
  if(!p){ W.hideGhost(); return; }
  const t = G.grid.get(p.cx+','+p.cz);
  if(G.buildType){
    const ok = cellFree(p.cx,p.cz) && G.gold >= TOWERS[G.buildType].cost;
    const inside = p.cx>=0&&p.cz>=0&&p.cx<G.map.w&&p.cz<G.map.h;
    if(inside){ W.showGhost(p.cx,p.cz, ok); W.showRing(p.cx+0.5, p.cz+0.5, TOWERS[G.buildType].range[0], ok); } else { W.hideGhost(); if(!G.sel) W.hideRing(); }
  }else if(t && t!==G.sel){ W.showRing(t.x, t.z, stat(t,'range'), true); }
  else if(!G.sel){ W.hideRing(); }
}
function onKey(e){
  if(G.phase==='menu'){ if(e.code==='Enter'||e.code==='Space'){ e.preventDefault(); $('playBtn').click(); } return; }
  if(e.code==='KeyP' || e.code==='Escape' && G.paused){ setPaused(!G.paused); return; }
  if(G.over || G.paused) return;
  const n = parseInt(e.key,10);
  if(n>=1 && n<=5){ setBuildType(TD.TOWER_ORDER[n-1]); return; }
  if(e.code==='Escape'){ if(G.buildType) setBuildType(null); else deselect(); W.hideGhost(); return; }
  if(e.code==='Space' || e.code==='Enter'){ e.preventDefault(); callWave(); return; }
  if(e.code==='KeyU' && G.sel) upgrade(G.sel);
  if(e.code==='KeyX' && G.sel) sell(G.sel);
  if(e.code==='KeyQ'){ G.speed = G.speed===1?2:(G.speed===2?3:1); syncSpeed(); }
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
  }else if(G.phase==='menu'){
    // idle: the castle flag waves, nothing else moves
  }
  W.tick(dt, now/1000);
  uiT += dt;
  if(uiT > 0.15){ uiT = 0; if(G.phase!=='menu'){ renderHud(); if(G.phase==='build') renderWaveBtn(); if(G.sel){ const up=$('pUp'); if(up.style.display!=='none'){ up.disabled = G.gold < towerCost(G.sel.type, G.sel.level+1); } } renderBuildBarPoor(); } }
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
  T = window.THREE;
  loadSave();
  W.init($('mount'));
  // preview map behind the menu
  G.mapIdx = 0; for(let i=TD.MAPS.length-1;i>=0;i--){ if(unlocked(i)){ G.mapIdx = i; break; } }
  W.buildMap(TD.MAPS[G.mapIdx]); G.map = TD.MAPS[G.mapIdx];
  renderMenu(); renderBuildBar();
  $('playBtn').addEventListener('click', ()=>{ unlockAudio(); startMap(G.mapIdx, false); });
  $('mVol').addEventListener('input', e=>{ unlockAudio(); setVolume(e.target.value/100); $('mVolVal').textContent = e.target.value+'%'; });
  $('mSound').addEventListener('click', ()=>{ unlockAudio(); setMuted(!SAVE.muted); });
  $('mMusic').addEventListener('click', ()=>{ unlockAudio(); setMusic(!SAVE.music); });
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
  setLoad(0.9);
  G.last = performance.now(); G.raf = requestAnimationFrame(loop);
}

// keep the page from scrolling when embedded in a page that scrolls the iframe into view
addEventListener('scroll', function(){ if(document.body.scrollTop || document.documentElement.scrollTop){ document.body.scrollTop = 0; document.documentElement.scrollTop = 0; } }, true);

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
TD.dbg = { step:(dt)=>step(dt), frame:()=>loop(performance.now()), start:startMap, callWave, build, upgrade, sell, finish, openMenu, sfx };

// ---- portal integration ----------------------------------------------
// A publisher drives the game through these globals; nothing else needs touching.
window.gamePauseForAd = function(on){
  on = !!on; if(on===G.adPaused) return; G.adPaused = on;
  if(on){ if(G.raf){ cancelAnimationFrame(G.raf); G.raf = 0; } try{ if(AC && AC.state==='running') AC.suspend(); }catch(e){} }
  else{ try{ if(AC && AC.state==='suspended') AC.resume(); }catch(e){} G.last = performance.now(); if(!G.raf) G.raf = requestAnimationFrame(loop); }
};
window.gameIsPaused = function(){ return G.adPaused; };
window.gameShowAd = window.gameShowAd || null;
// called only at natural breaks: leaving a finished match, never mid-wave
window.gameAdBreak = function(){ if(typeof window.gameShowAd==='function'){ try{ window.gameShowAd(); }catch(e){} } };
})();

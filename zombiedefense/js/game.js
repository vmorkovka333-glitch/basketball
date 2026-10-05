// Zombie Defense - simulation, input, AI, rounds, HUD, audio, menus, portal hooks.
(function(ZD){
const W = ZD.W, M = ZD.MAP, WEAP = ZD.WEAPONS, ZT = ZD.ZOMBIES;
const $ = id => document.getElementById(id);
const MOBILE = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (('ontouchstart' in window) && navigator.maxTouchPoints > 0);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
let THREE;

// ---- state ----------------------------------------------------------------
const G = ZD.G = {
  phase:'menu', paused:false, adPaused:false, over:false, t:0, slow:1,
  round:0, toSpawn:0, spawned:0, alive:0, spawnT:0, breakT:0, brutesLeft:0, dropsRound:0,
  points:0, kills:0, heads:0, zombies:[], drops:[], doubleT:0,
  gateOpen:false, wins:{}, interact:null, repairT:0, useHeld:false, usePressed:false,
  trigger:false, triggerPressed:false, adsHeld:false, adsToggle:false, locked:false, keys:{}, joy:{ x:0, y:0, on:false },
  bot:false, menuT:0, firstFrame:false, hudT:0,
};
const PL = ZD.PL = {
  x:M.start.x, z:M.start.z, vx:0, vz:0, yaw:M.start.yaw, pitch:-0.08, hp:100, hurtT:99, rig:null,
  weapons:[], cur:0, fireT:0, reloadT:0, swapT:0, meleeT:0, meleeCool:0, adsT:0, sprint:false, moving:false,
  kick:0, kickYaw:0, bloom:0, recoil:0, dead:false,
};

// ---- save -----------------------------------------------------------------
const SAVE_KEY = 'zd.save.v1';
let SAVE = { best:0, kills:0, games:0, sens:1, invert:false, vol:0.7, music:true, quality:'auto', assist:true };
function loadSave(){ try{ const r = localStorage.getItem(SAVE_KEY); if(r) SAVE = Object.assign(SAVE, JSON.parse(r)); }catch(e){} }
function persist(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); }catch(e){} }

// ---- audio (synthesised, no files) ------------------------------------------
const A = { ctx:null, master:null, noise:null, echo:null, groanLive:0 };
function unlockAudio(){
  if(A.ctx){ if(A.ctx.state === 'suspended') A.ctx.resume(); return; }
  try{
    const C = window.AudioContext || window.webkitAudioContext; if(!C) return;
    A.ctx = new C(); const ac = A.ctx;
    A.master = ac.createGain(); A.master.gain.value = SAVE.vol;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5;
    A.master.connect(comp); comp.connect(ac.destination);
    // a short slap echo gives gunshots some outdoor body
    const d = ac.createDelay(1); d.delayTime.value = 0.19; const fb = ac.createGain(); fb.gain.value = 0.22;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(A.master); A.echo = d;
    const len = ac.sampleRate; A.noise = ac.createBuffer(1, len, ac.sampleRate); const ch = A.noise.getChannelData(0);
    for(let i=0;i<len;i++) ch[i] = Math.random()*2 - 1;
    startAmbience();
  }catch(e){ A.ctx = null; }
}
function env(g, t, peak, a, d){ g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function noiseHit(t, peak, dur, type, freq, q, dest, rate){
  const ac = A.ctx, n = ac.createBufferSource(); n.buffer = A.noise; n.playbackRate.value = rate || 1;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; if(q) f.Q.value = q;
  const g = ac.createGain(); env(g, t, peak, 0.003, dur); n.connect(f); f.connect(g); g.connect(dest || A.master);
  n.start(t, Math.random()*0.5, dur + 0.05); return g;
}
function tone(t, type, f0, f1, peak, dur, dest){
  const ac = A.ctx, o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if(f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain(); env(g, t, peak, 0.004, dur); o.connect(g); g.connect(dest || A.master); o.start(t); o.stop(t + dur + 0.05);
}
function sfx(name, opt){
  if(!A.ctx || G.adPaused) return; const ac = A.ctx, t = ac.currentTime + 0.002; opt = opt || {};
  switch(name){
    case 'pistol': { const g = noiseHit(t, 0.55, 0.13, 'lowpass', 3600); g.connect(A.echo); tone(t, 'sine', 160, 50, 0.5, 0.12); noiseHit(t, 0.25, 0.04, 'highpass', 2500); break; }
    case 'rifle':  { const g = noiseHit(t, 0.5, 0.11, 'lowpass', 2800, 0, null, 0.9); g.connect(A.echo); tone(t, 'sine', 130, 45, 0.55, 0.1); noiseHit(t, 0.2, 0.03, 'highpass', 3000); break; }
    case 'shotgun':{ const g = noiseHit(t, 0.8, 0.28, 'lowpass', 1700, 0, null, 0.75); g.connect(A.echo); tone(t, 'sine', 110, 38, 0.8, 0.22); noiseHit(t + 0.32, 0.12, 0.05, 'bandpass', 1800, 4); noiseHit(t + 0.42, 0.12, 0.05, 'bandpass', 1300, 4); break; }
    case 'dry':    noiseHit(t, 0.15, 0.03, 'bandpass', 3000, 6); break;
    case 'reload': noiseHit(t, 0.18, 0.04, 'bandpass', 2400, 5); noiseHit(t + 0.22*(opt.k||1), 0.2, 0.05, 'bandpass', 1500, 5); noiseHit(t + 0.5*(opt.k||1), 0.22, 0.04, 'bandpass', 2800, 6); break;
    case 'hit':    tone(t, 'triangle', 2600, 2100, 0.12, 0.035); break;
    case 'head':   tone(t, 'triangle', 3400, 2800, 0.16, 0.05); noiseHit(t, 0.18, 0.06, 'bandpass', 900, 2); break;
    case 'kill':   tone(t, 'sine', 180, 60, 0.32, 0.14); noiseHit(t, 0.22, 0.12, 'lowpass', 700); break;
    case 'melee':  noiseHit(t, 0.2, 0.12, 'bandpass', 1200, 1.5, null, 1.6); break;
    case 'meleeHit': tone(t, 'sine', 140, 55, 0.5, 0.12); noiseHit(t, 0.3, 0.08, 'lowpass', 900); break;
    case 'board':  noiseHit(t, 0.4, 0.1, 'bandpass', 1100, 1.2); tone(t, 'square', 220, 90, 0.06, 0.08); break;
    case 'repair': tone(t, 'sine', 210, 120, 0.3, 0.08); noiseHit(t, 0.25, 0.05, 'bandpass', 1600, 3); break;
    case 'buy':    tone(t, 'square', 880, 0, 0.08, 0.08); tone(t + 0.09, 'square', 1320, 0, 0.08, 0.14); break;
    case 'nope':   tone(t, 'square', 160, 120, 0.1, 0.16); break;
    case 'hurt':   tone(t, 'sine', 90, 45, 0.6, 0.25); noiseHit(t, 0.3, 0.12, 'lowpass', 500); break;
    case 'swap':   noiseHit(t, 0.15, 0.05, 'bandpass', 2000, 4); noiseHit(t + 0.15, 0.15, 0.05, 'bandpass', 1400, 4); break;
    case 'gate':   noiseHit(t, 0.35, 1.0, 'lowpass', 500, 0, null, 0.5); tone(t, 'sawtooth', 70, 50, 0.08, 0.9); break;
    case 'pickup': tone(t, 'triangle', 660, 0, 0.18, 0.1); tone(t + 0.1, 'triangle', 990, 0, 0.18, 0.12); tone(t + 0.22, 'triangle', 1320, 0, 0.18, 0.22); break;
    case 'roundStart': { [55, 82.4, 110].forEach((f, i)=>{ const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
        o.connect(lp); lp.connect(g); g.connect(A.master); o.start(t + i*0.05); o.stop(t + 3.4); }); tone(t, 'sine', 48, 40, 0.5, 1.6); break; }
    case 'roundEnd': [196, 247, 294].forEach((f, i)=>tone(t + i*0.12, 'triangle', f, 0, 0.12, 1.2)); break;
    case 'groan': {
      const d = opt.dist || 8, vol = clamp(1 - d/28, 0, 1) * 0.22; if(vol < 0.01) break;
      const o = ac.createOscillator(); o.type = 'sawtooth'; const f0 = (opt.brute ? 55 : 80) + Math.random()*30; o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f0*(0.75 + Math.random()*0.2), t + 0.9);
      const lfo = ac.createOscillator(); lfo.frequency.value = 5 + Math.random()*4; const lg = ac.createGain(); lg.gain.value = 9; lfo.connect(lg); lg.connect(o.frequency);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520 + Math.random()*200; lp.Q.value = 3;
      const g = ac.createGain(); const dur = 0.7 + Math.random()*0.6; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
      o.connect(lp); lp.connect(g); if(pan){ pan.pan.value = clamp(opt.pan || 0, -1, 1); g.connect(pan); pan.connect(A.master); } else g.connect(A.master);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05); break; }
  }
}
let amb = null;
function startAmbience(){
  if(!A.ctx || amb) return; const ac = A.ctx;
  // wind: filtered noise, and a very low drone for unease
  const n = ac.createBufferSource(); n.buffer = A.noise; n.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.6;
  const g = ac.createGain(); g.gain.value = 0.04; n.connect(f); f.connect(g); g.connect(A.master); n.start();
  const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 41; const og = ac.createGain(); og.gain.value = SAVE.music ? 0.05 : 0; o.connect(og); og.connect(A.master); o.start();
  amb = { n, g, o, og };
}
function setMusic(on){ SAVE.music = on; if(amb) amb.og.gain.value = on ? 0.05 : 0; persist(); }
function setVolume(v){ SAVE.vol = v; if(A.master) A.master.gain.value = v; persist(); }

// ---- collision ----------------------------------------------------------------
let SOLID = [], BULLET = [];
function buildColliders(){
  SOLID = []; BULLET = [];
  for(const b of M.walls){ BULLET.push(b); if(b.y0 < 1.8) SOLID.push(b); }
  for(const p of M.props){ const b = { x0:p.x0, x1:p.x1, z0:p.z0, z1:p.z1, y0:0, y1:p.y1, kind:p.kind }; SOLID.push(b); BULLET.push(b); }
  if(!G.gateOpen){ SOLID.push(M.gate); BULLET.push(M.gate); }
}
function pushOut(p, r, boxes, skipWin){
  for(let pass=0; pass<2; pass++) for(const b of boxes){
    if(skipWin && b.win) continue;
    const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx*dx + dz*dz;
    if(d2 >= r*r) continue;
    if(d2 > 1e-8){ const d = Math.sqrt(d2), k = (r - d)/d; p.x += dx*k; p.z += dz*k; }
    else { const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bt = b.z1 - p.z, m = Math.min(l, rr, t, bt);
      if(m === l) p.x = b.x0 - r; else if(m === rr) p.x = b.x1 + r; else if(m === t) p.z = b.z0 - r; else p.z = b.z1 + r; }
  }
}
function rayBox(ox, oy, oz, dx, dy, dz, b, tmax){
  let t0 = 0, t1 = tmax;
  const ax = [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]];
  for(const [o, d, lo, hi] of ax){
    if(Math.abs(d) < 1e-9){ if(o < lo || o > hi) return -1; continue; }
    let a = (lo - o)/d, c = (hi - o)/d; if(a > c){ const s = a; a = c; c = s; }
    if(a > t0) t0 = a; if(c < t1) t1 = c; if(t0 > t1) return -1;
  }
  return t0;
}
function rayWorld(ox, oy, oz, dx, dy, dz, tmax){
  let best = tmax, hit = null;
  for(const b of BULLET){ const t = rayBox(ox, oy, oz, dx, dy, dz, b, best); if(t >= 0 && t < best){ best = t; hit = b; } }
  if(dy < -1e-6){ const tg = -oy/dy; if(tg >= 0 && tg < best){ best = tg; hit = { kind:'ground' }; } }
  return { t:best, hit };
}
// 2D line of sight against the solid boxes (inflated a little)
function segClear(x0, z0, x1, z1, pad){
  const dx = x1 - x0, dz = z1 - z0;
  for(const b of SOLID){ const bb = { x0:b.x0 - pad, x1:b.x1 + pad, y0:-1, y1:9, z0:b.z0 - pad, z1:b.z1 + pad };
    const t = rayBox(x0, 0, z0, dx, 0, dz, bb, 1); if(t >= 0 && t <= 1) return false; }
  return true;
}

// ---- navigation: a flow field over the yards, toward the player ---------------
const NAV = { cs:0.5, x0:M.X0, z0:M.Z0, nx:0, nz:0, blocked:null, dist:null, heap:null, timer:0, pcell:-1 };
function buildNav(){
  NAV.nx = Math.round((M.X1 - M.X0)/NAV.cs); NAV.nz = Math.round((M.Z1 - M.Z0)/NAV.cs);
  const n = NAV.nx*NAV.nz; NAV.blocked = new Uint8Array(n); NAV.dist = new Float32Array(n); NAV.heap = new Int32Array(n*8 + 16);
  const pad = 0.3;
  for(let iz=0; iz<NAV.nz; iz++) for(let ix=0; ix<NAV.nx; ix++){
    const x = NAV.x0 + (ix + 0.5)*NAV.cs, z = NAV.z0 + (iz + 0.5)*NAV.cs;
    let b = 0; for(const s of SOLID){ if(x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad){ b = 1; break; } }
    NAV.blocked[iz*NAV.nx + ix] = b;
  }
  NAV.pcell = -1;
}
function navCell(x, z){ const ix = Math.floor((x - NAV.x0)/NAV.cs), iz = Math.floor((z - NAV.z0)/NAV.cs);
  if(ix < 0 || iz < 0 || ix >= NAV.nx || iz >= NAV.nz) return -1; return iz*NAV.nx + ix; }
function updateNav(){
  let c = navCell(PL.x, PL.z); if(c < 0) return;
  if(NAV.blocked[c]){ // the player hugs a wall: start from the nearest open cell
    let best = -1, bd = 1e9; const cx = c % NAV.nx, cz = (c / NAV.nx)|0;
    for(let dz=-3; dz<=3; dz++) for(let dx=-3; dx<=3; dx++){ const x = cx+dx, z = cz+dz; if(x<0||z<0||x>=NAV.nx||z>=NAV.nz) continue;
      const k = z*NAV.nx + x; if(!NAV.blocked[k] && dx*dx+dz*dz < bd){ bd = dx*dx+dz*dz; best = k; } }
    if(best < 0) return; c = best; }
  if(c === NAV.pcell) return; NAV.pcell = c;
  const dist = NAV.dist, nx = NAV.nx, nz = NAV.nz, bl = NAV.blocked, heap = NAV.heap;
  dist.fill(1e9); dist[c] = 0; let hn = 0;
  const push = k => { let i = hn++; heap[i] = k; while(i > 0){ const p = (i-1)>>1; if(dist[heap[p]] <= dist[heap[i]]) break; const s = heap[p]; heap[p] = heap[i]; heap[i] = s; i = p; } };
  const pop = () => { const top = heap[0]; heap[0] = heap[--hn]; let i = 0;
    for(;;){ const l = i*2+1, r = l+1; let m = i; if(l < hn && dist[heap[l]] < dist[heap[m]]) m = l; if(r < hn && dist[heap[r]] < dist[heap[m]]) m = r; if(m === i) break; const s = heap[m]; heap[m] = heap[i]; heap[i] = s; i = m; }
    return top; };
  push(c);
  while(hn > 0){
    const k = pop(), kx = k % nx, kz = (k / nx)|0, dk = dist[k];
    for(let dz=-1; dz<=1; dz++) for(let dx=-1; dx<=1; dx++){
      if(!dx && !dz) continue; const x = kx+dx, z = kz+dz; if(x<0||z<0||x>=nx||z>=nz) continue;
      const j = z*nx + x; if(bl[j]) continue;
      if(dx && dz && (bl[kz*nx + x] || bl[z*nx + kx])) continue;     // no corner cutting
      const nd = dk + (dx && dz ? 1.414 : 1); if(nd < dist[j]){ dist[j] = nd; if(hn < heap.length) push(j); }
    }
  }
}
function navDir(x, z){
  const c = navCell(x, z); if(c < 0) return null;
  const nx = NAV.nx, cx = c % nx, cz = (c / nx)|0; let best = -1, bd = NAV.dist[c];
  for(let dz=-1; dz<=1; dz++) for(let dx=-1; dx<=1; dx++){
    if(!dx && !dz) continue; const xx = cx+dx, zz = cz+dz; if(xx<0||zz<0||xx>=nx||zz>=NAV.nz) continue;
    const j = zz*nx + xx; if(NAV.blocked[j]) continue; if(dx && dz && (NAV.blocked[cz*nx + xx] || NAV.blocked[zz*nx + cx])) continue;
    if(NAV.dist[j] < bd){ bd = NAV.dist[j]; best = j; } }
  if(best < 0) return null;
  const tx = NAV.x0 + ((best % nx) + 0.5)*NAV.cs, tz = NAV.z0 + (((best / nx)|0) + 0.5)*NAV.cs;
  const ddx = tx - x, ddz = tz - z, l = Math.hypot(ddx, ddz) || 1; return [ddx/l, ddz/l];
}

// ---- windows ----------------------------------------------------------------
function initWindows(){
  G.wins = {};
  for(const w of M.windows){ G.wins[w.id] = { w, boards:6, slots:[null, null], busy:null, tx:-w.nz, tz:w.nx }; W.setBoards(w.id, 6); }
}
function winActive(id){ const W2 = G.wins[id]; return W2.w.zone === 'A' || G.gateOpen; }
function winSlotPos(Wd, i){ const w = Wd.w; return { x: w.cx + w.nx*0.95 + Wd.tx*(i ? 0.55 : -0.55), z: w.cz + w.nz*0.95 + Wd.tz*(i ? 0.55 : -0.55) }; }
function winInside(Wd){ const w = Wd.w; return { x: w.cx - w.nx*1.05, z: w.cz - w.nz*1.05 }; }

// ---- weapons ------------------------------------------------------------------
function giveWeapon(id){
  const d = WEAP[id], have = PL.weapons.findIndex(w=>w.id===id);
  if(have >= 0){ PL.weapons[have].mag = d.mag; PL.weapons[have].res = d.reserve; return; }
  const w = { id, mag:d.mag, res:d.reserve };
  if(PL.weapons.length >= 2) PL.weapons[PL.cur] = w; else { PL.weapons.push(w); PL.cur = PL.weapons.length - 1; }
  equip(PL.cur);
}
function equip(i){ PL.cur = i; PL.reloadT = 0; PL.swapT = 0.45; W.setGunModel(PL.rig, WEAP[PL.weapons[i].id].model); updateHud(true); }
function curW(){ return PL.weapons[PL.cur]; }
function swapWeapon(){ if(PL.weapons.length < 2 || PL.swapT > 0) return; equip((PL.cur + 1) % PL.weapons.length); sfx('swap'); }
function startReload(){
  const w = curW(), d = WEAP[w.id]; if(PL.reloadT > 0 || w.mag >= d.mag || w.res <= 0 || PL.swapT > 0) return;
  PL.reloadT = d.reload; sfx('reload', { k:d.reload/2 }); $('reloadHint').classList.remove('show');
}
function finishReload(){ const w = curW(), d = WEAP[w.id]; const take = Math.min(d.mag - w.mag, w.res); w.mag += take; w.res -= take; updateHud(true); }

// ---- camera -------------------------------------------------------------------
const CAM = { side:1.05, up:0.5, back:3.6, fov:68 };
const tmpV = { x:0, y:0, z:0 };
function camBasis(){
  const cp = Math.cos(PL.pitch + PL.kick), sp = Math.sin(PL.pitch + PL.kick), cy = Math.cos(PL.yaw + PL.kickYaw), sy = Math.sin(PL.yaw + PL.kickYaw);
  return { fx:-sy*cp, fy:sp, fz:-cy*cp, rx:cy, rz:-sy };
}
function updateCamera(dt){
  const cam = W.camera, a = PL.adsT, B = camBasis();
  const side = lerp(CAM.side, 0.7, a), up = lerp(CAM.up, 0.25, a), back = lerp(CAM.back, 1.8, a);
  const px = PL.x, py = 1.62, pz = PL.z;
  const ox = px + B.rx*side*0.4, oz = pz + B.rz*side*0.4;
  let dx = -B.fx*back + B.rx*side*0.6, dy = -B.fy*back + up, dz = -B.fz*back + B.rz*side*0.6;
  const len = Math.hypot(dx, dy, dz); dx /= len; dy /= len; dz /= len;
  let t = len;
  for(const b of BULLET){ const h = rayBox(ox, py, oz, dx, dy, dz, b, t); if(h >= 0 && h < t) t = h; }
  t = Math.max(0.35, t - 0.22);
  cam.position.set(ox + dx*t, Math.max(0.3, py + dy*t), oz + dz*t);
  cam.rotation.set(PL.pitch + PL.kick, PL.yaw + PL.kickYaw, 0, 'YXZ');
  const fov = lerp(PL.sprint ? 76 : CAM.fov, 48, a);
  if(Math.abs(cam.fov - fov) > 0.05){ cam.fov = lerp(cam.fov, fov, 1 - Math.exp(-dt*14)); cam.updateProjectionMatrix(); }
}

// ---- shooting -------------------------------------------------------------------
const _v = () => new THREE.Vector3();
function traceShot(ox, oy, oz, dx, dy, dz, range){
  const wr = rayWorld(ox, oy, oz, dx, dy, dz, range);
  let best = wr.t, bz = null, head = false;
  const assist = MOBILE && SAVE.assist ? 1 : 0, hv = _v();
  for(const z of G.zombies){
    if(z.state === 'dead' || (z.state === 'rise' && z.riseT < 0.5)) continue;
    const s = ZT[z.type].scale;
    // cheap reject: the ray's closest pass to the zombie's axis, on the ground plane
    const qx = z.x - ox, qz = z.z - oz, hl = Math.hypot(dx, dz) || 1, along = (qx*dx + qz*dz)/hl;
    if(along < -1 || Math.abs(qx*dz - qz*dx)/hl > 1.3*s) continue;
    // the rendered pose can lag a step behind the simulation: refresh this one's matrices
    z.rig.root.position.set(z.x, z.y, z.z); z.rig.root.rotation.y = z.yaw; z.rig.root.updateMatrixWorld(true);
    z.rig.head.children[0].getWorldPosition(hv);
    // head: a sphere
    const hr = 0.2*s + assist*0.06; let hx = ox - hv.x, hy = oy - hv.y, hz = oz - hv.z;
    let b = hx*dx + hy*dy + hz*dz, c = hx*hx + hy*hy + hz*hz - hr*hr, disc = b*b - c;
    if(disc >= 0){ const t = -b - Math.sqrt(disc); if(t > 0 && t < best){ best = t; bz = z; head = true; } }
    // body: an upright cylinder, a touch forward of the feet because they hunch
    const r = 0.3*s + assist*0.12, cx = z.x - Math.sin(z.yaw)*0.08*s, cz = z.z - Math.cos(z.yaw)*0.08*s;
    const ex = ox - cx, ez = oz - cz, A2 = dx*dx + dz*dz;
    if(A2 > 1e-9){ const B2 = ex*dx + ez*dz, C2 = ex*ex + ez*ez - r*r, D2 = B2*B2 - A2*C2;
      if(D2 >= 0){ const t = (-B2 - Math.sqrt(D2))/A2; const y = oy + dy*t, top = hv.y - 0.15*s;
        if(t > 0 && t < best && y > z.y + 0.05 && y < top){ best = t; bz = z; head = false; } } }
  }
  return { t:best, z:bz, head, world:wr.hit, x:ox + dx*best, y:oy + dy*best, z2:oz + dz*best };
}
function fire(){
  const w = curW(), d = WEAP[w.id];
  if(PL.fireT > 0 || PL.reloadT > 0 || PL.swapT > 0 || PL.meleeT > 0 || PL.dead) return;
  if(w.mag <= 0){ if(w.res > 0) startReload(); else { sfx('dry'); PL.fireT = 0.25; } return; }
  if(PL.sprint){ PL.sprint = false; }
  w.mag--; PL.fireT = d.rate;
  const B = camBasis(), cam = W.camera;
  // start the ray at the player's depth so nothing between camera and player gets shot
  const depth = Math.max(0, (PL.x - cam.position.x)*B.fx + (1.5 - cam.position.y)*B.fy + (PL.z - cam.position.z)*B.fz - 0.2);
  const ox = cam.position.x + B.fx*depth, oy = cam.position.y + B.fy*depth, oz = cam.position.z + B.fz*depth;
  const spread = lerp(d.spreadHip, d.spreadAds, PL.adsT) * (PL.moving ? 1.35 : 1) + PL.bloom;
  // the rendered pose can trail the simulation by a frame: refresh the hero before reading the muzzle
  PL.rig.root.position.set(PL.x, 0, PL.z); PL.rig.root.rotation.y = PL.yaw; PL.rig.root.updateMatrixWorld(true);
  const muzzle = _v(); PL.rig.muzzle.getWorldPosition(muzzle);
  let anyHit = false, killed = false, headHit = false;
  for(let p=0; p<d.pellets; p++){
    const a = Math.random()*Math.PI*2, r = Math.sqrt(Math.random())*spread;
    let dx = B.fx + B.rx*Math.cos(a)*r, dy = B.fy + Math.sin(a)*r, dz = B.fz + B.rz*Math.cos(a)*r;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    const h = traceShot(ox, oy, oz, dx, dy, dz, d.range);
    // never shoot through a wall the camera can see past: check muzzle -> hit point
    let hx = h.x, hy = h.y, hz = h.z2, target = h.z;
    const mx = hx - muzzle.x, my = hy - muzzle.y, mz = hz - muzzle.z, ml = Math.hypot(mx, my, mz);
    if(ml > 0.3){ const block = rayWorld(muzzle.x, muzzle.y, muzzle.z, mx/ml, my/ml, mz/ml, ml - 0.05);
      if(block.hit && block.hit.kind !== 'ground'){ hx = muzzle.x + mx/ml*block.t; hy = muzzle.y + my/ml*block.t; hz = muzzle.z + mz/ml*block.t; target = null; } }
    if(target){
      const dist = h.t, fall = dist > d.range*0.6 ? lerp(1, 0.6, (dist - d.range*0.6)/(d.range*0.4)) : 1;
      const res = damageZombie(target, d.dmg * (h.head ? d.headMul : 1) * fall, h.head, hx, hy, hz, dx, dz, 'gun');
      anyHit = true; if(res === 'kill') killed = true; if(h.head) headHit = true;
    }else{
      if(h.world && h.world.kind === 'ground'){ W.dust(hx, 0.05, hz, 3); }
      else if(h.world){ W.dust(hx, hy, hz, 3); W.sparks(hx, hy, hz, 3); }
    }
    if(p < 3) W.tracer(muzzle.x, muzzle.y, muzzle.z, hx, hy, hz);
  }
  if(anyHit) hitmarker(killed ? 'kill' : (headHit ? 'head' : 'hit'));
  const md = new THREE.Vector3(B.fx, B.fy, B.fz); W.muzzleFlash(muzzle, md, d.flash);
  sfx(d.sound);
  // recoil: kick the view up and a little sideways, it settles back on its own
  const ads = 1 - PL.adsT*0.45;
  PL.kick += d.kick*ads; PL.kickYaw += (Math.random() - 0.5)*d.kickSide*2*ads; PL.bloom = Math.min(0.06, PL.bloom + d.kick*0.5);
  PL.recoil = 0.07; W.shake(d.pellets > 1 ? 0.22 : 0.05);
  if(w.mag === 0 && w.res > 0) $('reloadHint').classList.add('show');
  updateHud(true);
}
function melee(){
  if(PL.meleeCool > 0 || PL.dead || PL.swapT > 0) return;
  PL.meleeCool = ZD.MELEE.cool; PL.meleeT = 0.35; sfx('melee');   // a reload in progress keeps going
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw); let best = null, bd = ZD.MELEE.range;
  for(const z of G.zombies){ if(z.state === 'dead' || z.state === 'rise') continue;
    const dx = z.x - PL.x, dz = z.z - PL.z, d = Math.hypot(dx, dz); if(d > bd) continue;
    if((dx*fx + dz*fz)/Math.max(d, 0.01) < ZD.MELEE.cone) continue;
    if(z.state === 'board' || z.state === 'climb'){ if(!M.inside(z.x, z.z) && d > 1.6) continue; }
    best = z; bd = d; }
  if(best){ const hv = _v(); best.rig.head.children[0].getWorldPosition(hv);
    const r = damageZombie(best, ZD.MELEE.dmg, false, hv.x, hv.y - 0.3, hv.z, fx, fz, 'melee'); sfx('meleeHit'); W.shake(0.15);
    hitmarker(r === 'kill' ? 'kill' : 'hit'); }
}
function hitmarker(kind){ const h = $('hitm'); h.className = ''; void h.offsetWidth; h.className = 'show ' + kind; sfx(kind === 'head' ? 'head' : 'hit'); }

// ---- zombies --------------------------------------------------------------------
let zid = 0;
function pickWindow(){
  const act = M.windows.filter(w=>winActive(w.id));
  let tot = 0; const ws = act.map(w=>{ const d = Math.hypot(w.cx - PL.x, w.cz - PL.z); const k = 1/(1 + d/9); tot += k; return k; });
  let r = Math.random()*tot; for(let i=0;i<act.length;i++){ r -= ws[i]; if(r <= 0) return act[i]; } return act[0];
}
function spawnZombie(type, winId){
  const w = winId ? M.windows.find(x=>x.id===winId) : pickWindow(), Wd = G.wins[w.id];
  const dist = 7 + Math.random()*3, side = (Math.random() - 0.5)*6;
  const x = w.cx + w.nx*dist + Wd.tx*side, z = w.cz + w.nz*dist + Wd.tz*side;
  const d = ZT[type], shirt = ZD.SHIRTS[(Math.random()*ZD.SHIRTS.length)|0], pants = ZD.PANTS[(Math.random()*ZD.PANTS.length)|0];
  const rig = W.makeZombie(type, shirt, pants);
  const hp = Math.round(ZD.roundHp(Math.max(1, G.round)) * d.hp);
  const zb = { id:++zid, type, rig, x, z, y:-1.7, yaw:Math.atan2(w.nx, w.nz), hp, maxHp:hp, win:w.id, slot:-1,
    speed:d.speed * ZD.speedMul(Math.max(1, G.round)) * (0.9 + Math.random()*0.2), state:'rise', riseT:0, boardT:0, atkT:0, atkPose:0, hitDone:false,
    climbT:0, flinch:0, kx:0, kz:0, moveSpeed:0, deadT:0, fallDir:1, groanT:1 + Math.random()*5, stuckT:0, lx:x, lz:z, inside:false, waitA:Math.random()*6.28 };
  rig.root.position.set(x, zb.y, z); rig.root.rotation.y = zb.yaw;
  W.rise(x, z); G.zombies.push(zb); G.alive++;
  return zb;
}
function damageZombie(z, dmg, head, x, y, zz, dx, dz, kind){
  if(z.state === 'dead') return null;
  z.hp -= dmg; z.flinch = 0.25; z.kx += dx*0.6; z.kz += dz*0.6;
  W.goo(x, y, zz, -dx*0.3, 0.2, -dz*0.3, head ? 14 : 7, head);
  addPoints(ZD.POINTS.hit);
  if(z.hp <= 0){ killZombie(z, head, kind, x, y, zz); return 'kill'; }
  return 'hit';
}
function killZombie(z, head, kind, x, y, zz){
  z.state = 'dead'; z.deadT = 0; z.fallDir = Math.random() < 0.8 ? 1 : -1; releaseSlot(z);
  const Wd = G.wins[z.win]; if(Wd && Wd.busy === z) Wd.busy = null;
  G.alive--; G.kills++; SAVE.kills++;
  if(head){ G.heads++; z.rig.head.visible = false; W.goo(x, y, zz, 0, 1, 0, 22, true); }
  addPoints(kind === 'melee' ? ZD.POINTS.melee : (head ? ZD.POINTS.head : ZD.POINTS.kill), true);
  sfx('kill');
  // drops only where the player can reach them
  if(M.inside(z.x, z.z) && G.dropsRound < 2){ for(const d of ZD.DROPS){ if(Math.random() < d.chance){ spawnDrop(d.id, z.x, z.z); G.dropsRound++; break; } } }
}
function releaseSlot(z){ if(z.slot >= 0){ const Wd = G.wins[z.win]; if(Wd && Wd.slots[z.slot] === z) Wd.slots[z.slot] = null; z.slot = -1; } }
function turnTo(z, yaw, dt, rate){ let d = yaw - z.yaw; while(d > Math.PI) d -= Math.PI*2; while(d < -Math.PI) d += Math.PI*2; z.yaw += clamp(d, -rate*dt, rate*dt); }
function moveZ(z, dx, dz, speed, dt){
  z.x += dx*speed*dt + z.kx*dt; z.z += dz*speed*dt + z.kz*dt; z.kx *= Math.max(0, 1 - dt*8); z.kz *= Math.max(0, 1 - dt*8);
  z.moveSpeed = speed;
  if(Math.abs(dx) + Math.abs(dz) > 0.01) turnTo(z, Math.atan2(-dx, -dz), dt, 6);
}
function updateZombie(z, dt){
  const d = ZT[z.type], s = d.scale;
  if(z.flinch > 0) z.flinch -= dt;
  if(z.state === 'dead'){ z.deadT += dt; W.animZombie(z.rig, z, dt); if(z.deadT > 3.6){ W.remove(z.rig.root); z.gone = true; } return; }
  // groans
  z.groanT -= dt; if(z.groanT <= 0){ z.groanT = 3 + Math.random()*5;
    const dx = z.x - W.camera.position.x, dz = z.z - W.camera.position.z, dist = Math.hypot(dx, dz);
    const B = camBasis(), pan = (dx*B.rx + dz*B.rz)/Math.max(1, dist);
    if(dist < 28) sfx('groan', { dist, pan, brute: z.type === 'brute' }); }
  const pdx = PL.x - z.x, pdz = PL.z - z.z, pd = Math.hypot(pdx, pdz);
  z.moveSpeed = 0;
  switch(z.state){
    case 'rise': z.riseT += dt; z.y = -1.7*Math.pow(1 - Math.min(1, z.riseT/1.2), 2); if(z.riseT >= 1.2){ z.y = 0; z.state = 'approach'; } break;
    case 'approach': {
      const Wd = G.wins[z.win];
      if(z.slot < 0){ const free = Wd.slots.indexOf(null); if(free >= 0){ Wd.slots[free] = z; z.slot = free; } }
      let tx, tz;
      if(z.slot >= 0){ const sp = winSlotPos(Wd, z.slot); tx = sp.x; tz = sp.z; }
      else { z.waitA += dt*0.4; const r = 2.8 + Math.sin(z.waitA)*0.5; tx = Wd.w.cx + Wd.w.nx*r + Wd.tx*Math.cos(z.waitA*1.3)*1.2; tz = Wd.w.cz + Wd.w.nz*r + Wd.tz*Math.cos(z.waitA*1.3)*1.2; }
      const dx = tx - z.x, dz = tz - z.z, dl = Math.hypot(dx, dz);
      if(z.slot >= 0 && dl < 0.18){ z.state = Wd.boards > 0 ? 'board' : 'climbWait'; z.boardT = 0; }
      else if(dl > 0.12) moveZ(z, dx/dl, dz/dl, Math.min(z.speed, dl*4), dt);
      break; }
    case 'board': {
      const Wd = G.wins[z.win]; turnTo(z, Math.atan2(Wd.w.nx, Wd.w.nz), dt, 6);
      z.boardT += dt; z.atkPose = (Math.sin(z.boardT/d.board*Math.PI*2 - 1.2) + 1)/2;
      if(Wd.boards <= 0){ z.state = 'climbWait'; break; }
      if(z.boardT >= d.board){ z.boardT = 0; Wd.boards--; W.tearBoard(Wd.w.id, Wd.boards); sfx('board'); }
      break; }
    case 'climbWait': {
      const Wd = G.wins[z.win];
      if(Wd.boards > 0){ z.state = 'board'; z.boardT = 0; break; }
      if(!Wd.busy){ Wd.busy = z; releaseSlot(z); z.state = 'climb'; z.climbT = 0; z.cfx = z.x; z.cfz = z.z; const ins = winInside(Wd); z.ctx = ins.x; z.ctz = ins.z; }
      break; }
    case 'climb': {
      const Wd = G.wins[z.win]; z.climbT += dt/0.95; const k = Math.min(1, z.climbT);
      z.x = lerp(z.cfx, z.ctx, k); z.z = lerp(z.cfz, z.ctz, k); z.y = Math.sin(k*Math.PI)*0.95;
      turnTo(z, Math.atan2(Wd.w.nx, Wd.w.nz), dt, 8); z.moveSpeed = 1;
      if(k >= 1){ z.y = 0; z.state = 'chase'; z.inside = true; if(Wd.busy === z) Wd.busy = null; }
      break; }
    case 'chase': {
      if(pd < 1.15 + (s - 1)*0.4 && !PL.dead){ z.state = 'attack'; z.atkT = 0; z.hitDone = false; break; }
      let dx, dz;
      if(pd < 14 && segClear(z.x, z.z, PL.x, PL.z, 0.18)){ dx = pdx/pd; dz = pdz/pd; }
      else { const nd = navDir(z.x, z.z); if(nd){ dx = nd[0]; dz = nd[1]; } else { dx = pdx/pd; dz = pdz/pd; } }
      // separation from neighbours
      for(const o of G.zombies){ if(o === z || o.state === 'dead' || !o.inside) continue; const ox = z.x - o.x, oz = z.z - o.z, od = Math.hypot(ox, oz);
        if(od < 0.75 && od > 0.001){ dx += ox/od*0.6; dz += oz/od*0.6; } }
      const l = Math.hypot(dx, dz) || 1; moveZ(z, dx/l, dz/l, z.speed, dt);
      pushOut(z, 0.3*s, SOLID);
      // unstick: if a zombie has barely moved for a while, shove it sideways
      z.stuckT += dt; if(z.stuckT > 1.5){ if(Math.hypot(z.x - z.lx, z.z - z.lz) < 0.3){ z.kx += (Math.random()-0.5)*3; z.kz += (Math.random()-0.5)*3; } z.stuckT = 0; z.lx = z.x; z.lz = z.z; }
      break; }
    case 'attack': {
      z.atkT += dt; const p = z.atkT/d.atk; z.atkPose = p < 0.55 ? p/0.55 : 1 - (p - 0.55)/0.45;
      turnTo(z, Math.atan2(-pdx, -pdz), dt, 7);
      if(!z.hitDone && p >= 0.55){ z.hitDone = true; if(pd < 1.7 + (s - 1)*0.4) damagePlayer(d.dmg, z); }
      if(p >= 1){ z.state = 'chase'; z.atkPose = 0; }
      break; }
  }
  // zombies outside keep a little apart too
  if(!z.inside && z.state === 'approach') for(const o of G.zombies){ if(o === z || o.inside || o.state === 'dead') continue;
    const ox = z.x - o.x, oz = z.z - o.z, od = Math.hypot(ox, oz); if(od < 0.7 && od > 0.001){ z.x += ox/od*(0.7 - od)*0.5; z.z += oz/od*(0.7 - od)*0.5; } }
  z.rig.root.position.set(z.x, z.y, z.z); z.rig.root.rotation.y = z.yaw;
  W.animZombie(z.rig, z, dt);
}

// ---- player ---------------------------------------------------------------------
function damagePlayer(dmg, from){
  if(PL.dead || G.bot && G.botGod) return;
  PL.hp -= dmg; PL.hurtT = 0; sfx('hurt'); W.shake(0.35);
  const dir = $('hitDir'), B = camBasis(), dx = from.x - PL.x, dz = from.z - PL.z;
  const ang = Math.atan2(dx*B.rx + dz*B.rz, dx*B.fx + dz*B.fz);
  dir.style.transform = 'translate(-50%,-50%) rotate(' + ang + 'rad)'; dir.classList.remove('show'); void dir.offsetWidth; dir.classList.add('show');
  if(PL.hp <= 0){ PL.hp = 0; die(); }
  updateHud(true);
}
function die(){
  PL.dead = true; G.slow = 0.3; G.deathT = 0; $('hurt').style.opacity = 1;
  if(typeof window.onGameplayStop === 'function') window.onGameplayStop();
  if(document.pointerLockElement) document.exitPointerLock();
}
function updatePlayer(dt){
  const k = G.keys;
  let ix = 0, iz = 0;
  if(MOBILE && G.joy.on){ ix = G.joy.x; iz = -G.joy.y; }
  else { if(k.KeyW || k.ArrowUp) iz += 1; if(k.KeyS || k.ArrowDown) iz -= 1; if(k.KeyA) ix -= 1; if(k.KeyD) ix += 1; }
  const il = Math.hypot(ix, iz); if(il > 1){ ix /= il; iz /= il; }
  PL.moving = il > 0.12;
  const wantAds = (G.adsHeld || G.adsToggle) && !PL.dead;
  const sprintIn = MOBILE ? (G.joy.on && il > 0.92 && iz > 0.3) : (k.ShiftLeft || k.ShiftRight) && iz > 0.3;
  PL.sprint = sprintIn && !wantAds && !G.trigger && PL.reloadT <= 0 && PL.meleeT <= 0;
  PL.adsT = clamp(PL.adsT + (wantAds && !PL.sprint ? dt : -dt)*7, 0, 1);
  const sp = PL.sprint ? ZD.PLAYER.sprint : lerp(ZD.PLAYER.walk, ZD.PLAYER.ads, PL.adsT);
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw), rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw);
  const tvx = (fx*iz + rx*ix)*sp, tvz = (fz*iz + rz*ix)*sp, a = 1 - Math.exp(-dt*14);
  PL.vx += (tvx - PL.vx)*a; PL.vz += (tvz - PL.vz)*a;
  if(!PL.dead){ PL.x += PL.vx*dt; PL.z += PL.vz*dt; }
  pushOut(PL, ZD.PLAYER.radius, SOLID);
  // zombies are solid to the player
  for(const z of G.zombies){ if(z.state === 'dead' || z.state === 'rise' || z.state === 'climb') continue; const s = ZT[z.type].scale;
    const dx = PL.x - z.x, dz = PL.z - z.z, d = Math.hypot(dx, dz), m = 0.36 + 0.3*s; if(d < m && d > 0.001){ PL.x += dx/d*(m - d)*0.7; z.x -= dx/d*(m - d)*0.3; z.z -= dz/d*(m - d)*0.3; PL.z += dz/d*(m - d)*0.7; } }
  pushOut(PL, ZD.PLAYER.radius, SOLID);
  // timers
  PL.fireT -= dt; PL.meleeCool -= dt; if(PL.meleeT > 0) PL.meleeT -= dt;
  if(PL.swapT > 0) PL.swapT -= dt;
  if(PL.reloadT > 0){ PL.reloadT -= dt; if(PL.reloadT <= 0){ PL.reloadT = 0; finishReload(); } }
  PL.kick *= Math.exp(-dt*9); PL.kickYaw *= Math.exp(-dt*9); PL.bloom *= Math.exp(-dt*5); PL.recoil = Math.max(0, PL.recoil - dt);
  // fire
  const w = curW();
  if(w && !PL.dead){ const d = WEAP[w.id];
    if(G.trigger && (d.auto || G.triggerPressed)) fire();
    if(G.triggerPressed) G.triggerPressed = false;
    if(w.mag === 0 && w.res > 0 && PL.reloadT <= 0 && !G.trigger && PL.fireT < -0.25) startReload(); }
  // health regeneration
  PL.hurtT += dt; if(PL.hurtT > ZD.PLAYER.regenDelay && PL.hp < ZD.PLAYER.hp && !PL.dead){ PL.hp = Math.min(ZD.PLAYER.hp, PL.hp + ZD.PLAYER.regen*dt); }
  // mobile aim assist: ease the view toward a zombie close to the crosshair
  if(MOBILE && SAVE.assist && (G.trigger || PL.adsT > 0.5)) aimAssist(dt);
  PL.rig.root.position.set(PL.x, 0, PL.z); PL.rig.root.rotation.y = PL.yaw;
  W.animPlayer(PL.rig, { moving:PL.moving, sprint:PL.sprint, back: iz < -0.2, pitch:PL.pitch, ads:PL.adsT > 0.5, reload:PL.reloadT, swap:PL.swapT, melee:PL.meleeT, recoil:PL.recoil }, dt);
}
function aimAssist(dt){
  const B = camBasis(), cam = W.camera, hv = _v(); let best = null, ba = 0.13;
  for(const z of G.zombies){ if(z.state === 'dead' || z.state === 'rise') continue;
    z.rig.head.children[0].getWorldPosition(hv); const tx = hv.x, ty = hv.y - 0.35, tz = hv.z;
    const dx = tx - cam.position.x, dy = ty - cam.position.y, dz = tz - cam.position.z, d = Math.hypot(dx, dy, dz); if(d > 30) continue;
    const ang = Math.acos(clamp((dx*B.fx + dy*B.fy + dz*B.fz)/d, -1, 1)); if(ang < ba){ ba = ang; best = { dx, dy, dz, d }; } }
  if(!best) return;
  const yaw = Math.atan2(-best.dx, -best.dz), pitch = Math.asin(best.dy/best.d);
  let dy = yaw - PL.yaw; while(dy > Math.PI) dy -= Math.PI*2; while(dy < -Math.PI) dy += Math.PI*2;
  const rate = (PL.adsT > 0.5 ? 2.2 : 1.4)*dt;
  PL.yaw += clamp(dy, -rate, rate); PL.pitch += clamp(pitch - PL.pitch, -rate, rate);
}

// ---- interactions ---------------------------------------------------------------
function findInteract(){
  let best = null, bd = 9;
  for(const id in G.wins){ const Wd = G.wins[id]; if(!winActive(id) || Wd.boards >= 6) continue; const ins = winInside(Wd);
    const d = Math.hypot(PL.x - ins.x, PL.z - ins.z); if(d < 1.6 && d < bd){ bd = d; best = { kind:'repair', id }; } }
  for(const b of M.buys){ if(b.zone === 'B' && !G.gateOpen) continue; const d = Math.hypot(PL.x - b.ix, PL.z - b.iz); if(d < 1.6 && d < bd){ bd = d; best = { kind:'buy', b }; } }
  if(!G.gateOpen) for(const g of M.gateUse){ const d = Math.hypot(PL.x - g.x, PL.z - g.z); if(d < 1.7 && d < bd){ bd = d; best = { kind:'gate' }; } }
  return best;
}
function useInteract(dt){
  const it = G.interact; if(!it || PL.dead) { G.repairT = 0; return; }
  if(it.kind === 'repair'){
    if(G.useHeld){ G.repairT += dt; if(G.repairT >= 0.45){ G.repairT = 0; const Wd = G.wins[it.id];
      if(Wd.boards < 6){ W.addBoard(it.id, Wd.boards); Wd.boards++; addPoints(ZD.POINTS.board); sfx('repair'); W.shake(0.03); } } }
    else G.repairT = 0;
    return; }
  if(!G.usePressed) return;
  if(it.kind === 'buy'){
    const d = WEAP[it.b.weapon], own = PL.weapons.some(w=>w.id===it.b.weapon), cost = own ? d.ammoCost : d.cost;
    if(G.points < cost){ sfx('nope'); flashPoints(); return; }
    G.points -= cost; giveWeapon(it.b.weapon); if(own) updateHud(true); sfx('buy'); toast(own ? d.name + ' ammo refilled' : d.name + ' acquired'); updateHud(true);
  }else if(it.kind === 'gate'){
    if(G.points < ZD.GATE_COST){ sfx('nope'); flashPoints(); return; }
    G.points -= ZD.GATE_COST; G.gateOpen = true; W.openGate(); sfx('gate'); buildColliders(); buildNav(); toast('The back yard is open — more windows to watch'); updateHud(true);
  }
}

// ---- drops ------------------------------------------------------------------------
function spawnDrop(kind, x, z){ const m = W.makeDrop(kind); m.position.set(x, 0.9, z); G.drops.push({ kind, x, z, t:0, m }); }
function updateDrops(dt){
  for(const d of G.drops){ d.t += dt; d.m.rotation.y += dt*2; d.m.position.y = 0.9 + Math.sin(d.t*3)*0.12;
    d.m.visible = d.t < 20 || Math.floor(d.t*8) % 2 === 0;
    if(Math.hypot(PL.x - d.x, PL.z - d.z) < 1.3 && !PL.dead){ d.taken = true; const def = ZD.DROPS.find(x=>x.id===d.kind);
      if(d.kind === 'ammo'){ PL.weapons.forEach(w=>{ const wd = WEAP[w.id]; w.mag = wd.mag; w.res = wd.reserve; }); }
      if(d.kind === 'double'){ G.doubleT = def.time; }
      banner(def.name, '', 1.8); sfx('pickup'); W.pickupFx(d.x, 1, d.z, def.color); updateHud(true); }
    if(d.t > 25) d.taken = true;
    if(d.taken) W.remove(d.m); }
  G.drops = G.drops.filter(d=>!d.taken);
  if(G.doubleT > 0) G.doubleT -= dt;
}

// ---- rounds -------------------------------------------------------------------------
function startGame(){
  // clear the previous run
  G.zombies.forEach(z=>W.remove(z.rig.root)); G.drops.forEach(d=>W.remove(d.m));
  Object.assign(G, { phase:'play', paused:false, over:false, t:0, slow:1, round:0, toSpawn:0, spawned:0, alive:0, spawnT:0, breakT:0, brutesLeft:0, dropsRound:0,
    points:ZD.POINTS.start, kills:0, heads:0, zombies:[], drops:[], doubleT:0, gateOpen:false, interact:null, repairT:0, deathT:0 });
  Object.assign(PL, { x:M.start.x, z:M.start.z, vx:0, vz:0, yaw:M.start.yaw, pitch:-0.08, hp:ZD.PLAYER.hp, hurtT:99, weapons:[], cur:0, fireT:0, reloadT:0,
    swapT:0, meleeT:0, meleeCool:0, adsT:0, kick:0, kickYaw:0, bloom:0, recoil:0, dead:false });
  W.gate.position.x = 0; W.gateOpen = 0; W.gateOpening = false; W.gateSign.visible = true; W.gateSign2.visible = true;
  buildColliders(); buildNav(); initWindows();
  PL.rig.root.visible = true;
  giveWeapon('pistol'); PL.swapT = 0;
  $('app').classList.remove('menu'); $('app').classList.add('play');
  ['menu','overWrap','pauseWrap','setWrap','howWrap'].forEach(id=>$(id).classList.remove('show'));
  $('hurt').style.opacity = 0;
  SAVE.games++; persist();
  if(typeof window.onGameplayStart === 'function') window.onGameplayStart();
  nextRound();
  updateHud(true);
  if(!MOBILE) requestLock();
}
function nextRound(){
  G.round++; G.toSpawn = ZD.roundCount(G.round); G.spawned = 0; G.brutesLeft = ZD.bruteCount(G.round); G.spawnT = 2.2; G.dropsRound = 0;
  banner('ROUND', String(G.round), 3); sfx('roundStart'); updateHud(true);
}
function pickType(){
  const left = G.toSpawn - G.spawned;
  if(G.brutesLeft > 0 && Math.random() < G.brutesLeft/Math.max(1, left)){ G.brutesLeft--; return 'brute'; }
  return Math.random() < ZD.runnerShare(G.round) ? 'runner' : 'walker';
}
function updateRounds(dt){
  if(G.breakT > 0){ G.breakT -= dt; if(G.breakT <= 0) nextRound(); return; }
  const cap = MOBILE ? 16 : ZD.MAX_ALIVE;
  if(G.spawned < G.toSpawn){ G.spawnT -= dt;
    if(G.spawnT <= 0 && G.alive < cap){ spawnZombie(pickType()); G.spawned++; G.spawnT = ZD.spawnGap(G.round)*(0.7 + Math.random()*0.6); } }
  else if(G.alive <= 0){ G.breakT = ZD.BREAK; sfx('roundEnd'); }
}

// ---- points -----------------------------------------------------------------------
function addPoints(n, big){
  if(G.doubleT > 0) n *= 2; G.points += n;
  const el = document.createElement('div'); el.className = 'pp' + (big ? ' big' : ''); el.textContent = '+' + n;
  el.style.left = (Math.random()*30) + 'px'; $('ppWrap').appendChild(el); setTimeout(()=>el.remove(), 900);
  updateHud(true);
}
function flashPoints(){ const p = $('hPts'); p.classList.remove('nope'); void p.offsetWidth; p.classList.add('nope'); }

// ---- HUD --------------------------------------------------------------------------
let lastHud = '';
function updateHud(force){
  const w = curW(); if(!w) return; const d = WEAP[w.id];
  const sig = [G.round, G.points, w.id, w.mag, w.res, Math.round(PL.hp), G.doubleT > 0 ? Math.ceil(G.doubleT) : 0].join('|');
  if(!force && sig === lastHud) return; lastHud = sig;
  $('hRound').textContent = G.round; $('hPts').textContent = G.points.toLocaleString('en-US');
  $('wName').textContent = d.name.toUpperCase(); $('ammoMag').textContent = w.mag; $('ammoRes').textContent = w.res;
  $('ammoMag').classList.toggle('low', w.mag <= Math.ceil(d.mag*0.25));
  $('hpFill').style.width = Math.max(0, PL.hp/ZD.PLAYER.hp*100) + '%';
  const dbl = $('dbl'); dbl.classList.toggle('show', G.doubleT > 0); if(G.doubleT > 0) dbl.textContent = '2X  ' + Math.ceil(G.doubleT) + 's';
  const slots = $('wSlots'); slots.innerHTML = PL.weapons.map((x, i)=>'<i class="' + (i === PL.cur ? 'on' : '') + '">' + WEAP[x.id].name.split(' ')[0].toUpperCase() + '</i>').join('');
}
function updateHudFrame(dt){
  // crosshair opens with spread and movement
  const w = curW(); if(!w) return; const d = WEAP[w.id];
  const sp = lerp(d.spreadHip, d.spreadAds, PL.adsT)*(PL.moving ? 1.35 : 1) + PL.bloom;
  const gap = 4 + sp*520; $('xhair').style.setProperty('--g', gap.toFixed(1) + 'px');
  $('xhair').classList.toggle('hide', PL.sprint || PL.dead);
  const hurt = 1 - PL.hp/ZD.PLAYER.hp; $('hurt').style.opacity = PL.dead ? 1 : Math.min(0.85, hurt*1.1);
  // prompt
  const it = G.interact, pr = $('prompt');
  if(it && !PL.dead){ let txt = '', cost = '', bad = false;
    if(it.kind === 'repair'){ txt = (MOBILE ? 'Hold USE' : 'Hold [E]') + ' to rebuild the barricade'; cost = '+' + ZD.POINTS.board*(G.doubleT > 0 ? 2 : 1) + ' per board'; }
    else if(it.kind === 'buy'){ const wd = WEAP[it.b.weapon], own = PL.weapons.some(x=>x.id===it.b.weapon), c = own ? wd.ammoCost : wd.cost;
      txt = (MOBILE ? 'Tap USE' : 'Press [E]') + (own ? ' for ' + wd.name + ' ammo' : ' to buy ' + wd.name); cost = c; bad = G.points < c; }
    else if(it.kind === 'gate'){ txt = (MOBILE ? 'Tap USE' : 'Press [E]') + ' to open the gate'; cost = ZD.GATE_COST; bad = G.points < ZD.GATE_COST; }
    $('promptText').textContent = txt; $('promptCost').textContent = cost; $('promptCost').classList.toggle('bad', bad);
    pr.classList.add('show'); $('bUse').classList.add('show');
    const ring = $('promptRing'); ring.style.display = it.kind === 'repair' && G.useHeld ? 'block' : 'none'; ring.style.setProperty('--p', (G.repairT/0.45*100).toFixed(0) + '%');
  }else{ pr.classList.remove('show'); $('bUse').classList.remove('show'); }
  // reload progress
  const rb = $('reloadBar'); if(PL.reloadT > 0){ rb.classList.add('show'); rb.firstElementChild.style.width = ((1 - PL.reloadT/d.reload)*100) + '%'; } else rb.classList.remove('show');
  $('breakT').textContent = G.breakT > 0 ? 'Next round in ' + Math.ceil(G.breakT) : '';
  $('zLeft').textContent = G.breakT > 0 || G.phase !== 'play' ? '' : (G.toSpawn - G.spawned + G.alive) + ' left';
}
let bannerTimer = 0;
function banner(top, main, time){ $('bannerTop').textContent = top; $('bannerMain').textContent = main;
  const b = $('banner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); clearTimeout(bannerTimer); bannerTimer = setTimeout(()=>b.classList.remove('show'), (time||2.5)*1000); }
let toastT = 0;
function toast(t){ const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(()=>el.classList.remove('show'), 2200); }

// ---- game over ----------------------------------------------------------------------
function showOver(){
  G.phase = 'over'; G.over = true;
  const best = G.round > SAVE.best; if(best) SAVE.best = G.round; persist();
  $('oSub').textContent = 'You survived ' + G.round + ' round' + (G.round === 1 ? '' : 's');
  $('oStats').innerHTML = [['Round', G.round], ['Kills', G.kills], ['Headshots', G.heads], ['Points', G.points.toLocaleString('en-US')]]
    .map(([l, v])=>'<div><b>' + v + '</b><span>' + l + '</span></div>').join('');
  $('oBest').textContent = best ? 'NEW BEST ROUND!' : 'Best: round ' + SAVE.best; $('oBest').classList.toggle('new', best);
  $('overWrap').classList.add('show');
}

// ---- input ---------------------------------------------------------------------------
function requestLock(){
  const c = W.renderer.domElement; if(MOBILE || !c.requestPointerLock) return;
  try{ const p = c.requestPointerLock(); if(p && p.catch) p.catch(()=>showClick()); }catch(e){ showClick(); }
  setTimeout(()=>{ if(!document.pointerLockElement && G.phase === 'play' && !PL.dead) showClick(); }, 300);
}
function showClick(){ if(G.phase === 'play' && !PL.dead && !G.adPaused) $('clickWrap').classList.add('show'); }
function setPaused(on){
  if(G.phase !== 'play' || PL.dead) return; G.paused = on; $('pauseWrap').classList.toggle('show', on); $('clickWrap').classList.remove('show');
  if(on){ G.trigger = false; G.adsHeld = false; if(document.pointerLockElement) document.exitPointerLock(); if(typeof window.onGameplayStop === 'function') window.onGameplayStop(); }
  else { if(typeof window.onGameplayStart === 'function') window.onGameplayStart(); if(!MOBILE) requestLock(); }
}
function bindInput(){
  const c = W.renderer.domElement;
  addEventListener('keydown', e=>{
    // Escape releases the mouse on its own, which pauses through pointerlockchange
    if(e.code === 'KeyP'){ if(G.phase === 'play' && !PL.dead) setPaused(!G.paused); return; }
    if(e.code === 'Escape') return;
    if(G.keys[e.code]) return; G.keys[e.code] = true;
    if(G.phase !== 'play' || G.paused) return;
    if(e.code === 'KeyR') startReload();
    if(e.code === 'KeyE'){ G.useHeld = true; G.usePressed = true; }
    if(e.code === 'KeyV' || e.code === 'KeyF') melee();
    if(e.code === 'KeyQ' || e.code === 'Digit1' && PL.cur !== 0 || e.code === 'Digit2' && PL.cur !== 1) swapWeapon();
    if(['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e=>{ G.keys[e.code] = false; if(e.code === 'KeyE') G.useHeld = false; });
  addEventListener('blur', ()=>{ G.keys = {}; G.trigger = false; G.adsHeld = false; G.useHeld = false; });
  c.addEventListener('mousedown', e=>{
    unlockAudio();
    if(G.phase !== 'play' || G.paused || PL.dead) return;
    if(!document.pointerLockElement && !MOBILE){ requestLock(); return; }
    if(e.button === 0){ G.trigger = true; G.triggerPressed = true; }
    if(e.button === 2) G.adsHeld = true;
  });
  addEventListener('mouseup', e=>{ if(e.button === 0) G.trigger = false; if(e.button === 2) G.adsHeld = false; });
  c.addEventListener('contextmenu', e=>e.preventDefault());
  addEventListener('wheel', e=>{ if(G.phase === 'play' && !G.paused && Math.abs(e.deltaY) > 10) swapWeapon(); }, { passive:true });
  addEventListener('mousemove', e=>{
    if(!document.pointerLockElement || G.phase !== 'play' || G.paused || PL.dead) return;
    const s = 0.0022*SAVE.sens*(PL.adsT > 0.5 ? 0.6 : 1);
    PL.yaw -= e.movementX*s; PL.pitch -= e.movementY*s*(SAVE.invert ? -1 : 1); PL.pitch = clamp(PL.pitch, -1.0, 0.75);
  });
  document.addEventListener('pointerlockchange', ()=>{
    G.locked = !!document.pointerLockElement;
    if(G.locked){ $('clickWrap').classList.remove('show'); }
    else if(G.phase === 'play' && !PL.dead && !G.paused && !G.adPaused){ setPaused(true); }
  });
  $('clickWrap').addEventListener('click', ()=>{ unlockAudio(); requestLock(); });
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden && G.phase === 'play' && !PL.dead) setPaused(true); });
  if(MOBILE) bindTouch();
}
function bindTouch(){
  $('app').classList.add('mobile');
  const look = { id:null, x:0, y:0 }, joy = { id:null, ox:0, oy:0 }, fireT = { id:null, x:0, y:0 };
  const base = $('joyBase'), knob = $('joyKnob');
  const lookMove = (t, ref)=>{ const dx = t.clientX - ref.x, dy = t.clientY - ref.y; ref.x = t.clientX; ref.y = t.clientY;
    const s = 0.0055*SAVE.sens*(PL.adsT > 0.5 ? 0.55 : 1); PL.yaw -= dx*s; PL.pitch -= dy*s*(SAVE.invert ? -1 : 1); PL.pitch = clamp(PL.pitch, -1.0, 0.75); };
  const layer = $('touch');
  layer.addEventListener('touchstart', e=>{ unlockAudio(); if(G.phase !== 'play' || G.paused) return; e.preventDefault();
    for(const t of e.changedTouches){
      if(t.clientX < innerWidth*0.42 && joy.id === null){ joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY; G.joy.on = true; G.joy.x = 0; G.joy.y = 0;
        base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px'; base.classList.add('show'); knob.style.transform = 'translate(-50%,-50%)'; }
      else if(look.id === null){ look.id = t.identifier; look.x = t.clientX; look.y = t.clientY; } } }, { passive:false });
  layer.addEventListener('touchmove', e=>{ e.preventDefault();
    for(const t of e.changedTouches){
      if(t.identifier === joy.id){ let dx = (t.clientX - joy.ox)/55, dy = (t.clientY - joy.oy)/55; const l = Math.hypot(dx, dy); if(l > 1){ dx /= l; dy /= l; }
        G.joy.x = dx; G.joy.y = dy; knob.style.transform = 'translate(calc(-50% + ' + (dx*44) + 'px), calc(-50% + ' + (dy*44) + 'px))'; }
      else if(t.identifier === look.id) lookMove(t, look); } }, { passive:false });
  const end = e=>{ for(const t of e.changedTouches){ if(t.identifier === joy.id){ joy.id = null; G.joy.on = false; G.joy.x = G.joy.y = 0; base.classList.remove('show'); }
    if(t.identifier === look.id) look.id = null; } };
  layer.addEventListener('touchend', end); layer.addEventListener('touchcancel', end);
  // fire button: hold to shoot, drag on it to aim
  const bf = $('bFire');
  bf.addEventListener('touchstart', e=>{ e.preventDefault(); unlockAudio(); const t = e.changedTouches[0]; fireT.id = t.identifier; fireT.x = t.clientX; fireT.y = t.clientY; G.trigger = true; G.triggerPressed = true; bf.classList.add('on'); }, { passive:false });
  bf.addEventListener('touchmove', e=>{ e.preventDefault(); for(const t of e.changedTouches) if(t.identifier === fireT.id) lookMove(t, fireT); }, { passive:false });
  const fend = e=>{ for(const t of e.changedTouches) if(t.identifier === fireT.id){ fireT.id = null; G.trigger = false; bf.classList.remove('on'); } };
  bf.addEventListener('touchend', fend); bf.addEventListener('touchcancel', fend);
  const tap = (id, fn)=>$(id).addEventListener('touchstart', e=>{ e.preventDefault(); e.stopPropagation(); if(G.phase === 'play' && !G.paused) fn(); }, { passive:false });
  tap('bAim', ()=>{ G.adsToggle = !G.adsToggle; $('bAim').classList.toggle('on', G.adsToggle); });
  tap('bReload', startReload); tap('bSwap', swapWeapon); tap('bMelee', melee);
  const bu = $('bUse');
  bu.addEventListener('touchstart', e=>{ e.preventDefault(); G.useHeld = true; G.usePressed = true; }, { passive:false });
  bu.addEventListener('touchend', ()=>{ G.useHeld = false; }); bu.addEventListener('touchcancel', ()=>{ G.useHeld = false; });
  tap('bPause', ()=>setPaused(true));
}

// ---- simulation step ---------------------------------------------------------------------
function step(dt){
  G.t += dt;
  if(PL.dead){ G.deathT += dt; if(G.deathT > 1.6 && !G.over) showOver(); }
  updatePlayer(dt);
  NAV.timer -= dt; if(NAV.timer <= 0){ NAV.timer = 0.2; updateNav(); }
  for(const z of G.zombies) updateZombie(z, dt);
  G.zombies = G.zombies.filter(z=>!z.gone);
  if(!PL.dead) updateRounds(dt);
  updateDrops(dt);
  G.interact = findInteract(); useInteract(dt); G.usePressed = false;
  if(G.bot) botStep(dt);
}

// ---- menu backdrop: the camera circles the walls while zombies shamble outside -------------
const menuZ = [];
function menuStep(dt){
  G.menuT += dt;
  const a = G.menuT*0.06, cam = W.camera;
  cam.position.set(Math.sin(a)*30, 13 + Math.sin(G.menuT*0.2)*1.5, 3 + Math.cos(a)*30);
  cam.lookAt(0, 0.5, 3); if(cam.fov !== 55){ cam.fov = 55; cam.updateProjectionMatrix(); }
  while(menuZ.length < 9){ const ang = Math.random()*6.28, r = 18 + Math.random()*8; const type = Math.random() < 0.2 ? 'runner' : (Math.random() < 0.15 ? 'brute' : 'walker');
    const rig = W.makeZombie(type, ZD.SHIRTS[(Math.random()*ZD.SHIRTS.length)|0], ZD.PANTS[(Math.random()*ZD.PANTS.length)|0]);
    menuZ.push({ rig, type, x:Math.cos(ang)*r, z:3 + Math.sin(ang)*r, ang, r, yaw:0, state:'wander', moveSpeed:0, flinch:0, atkPose:0, sp:0.35 + Math.random()*0.3 }); }
  for(const z of menuZ){ z.ang += dt*z.sp/z.r*(z.type === 'runner' ? 2.5 : 1); const nx = Math.cos(z.ang)*z.r, nz = 3 + Math.sin(z.ang)*z.r;
    z.yaw = Math.atan2(-(nx - z.x), -(nz - z.z)); z.x = nx; z.z = nz; z.moveSpeed = z.sp*(z.type === 'runner' ? 2.5 : 1)*2;
    z.rig.root.position.set(z.x, 0, z.z); z.rig.root.rotation.y = z.yaw; W.animZombie(z.rig, z, dt); }
}
function clearMenuZombies(){ menuZ.forEach(z=>W.remove(z.rig.root)); menuZ.length = 0; }

// ---- screens -------------------------------------------------------------------------------
function openMenu(){
  G.zombies.forEach(z=>W.remove(z.rig.root)); G.zombies = []; G.drops.forEach(d=>W.remove(d.m)); G.drops = [];
  G.phase = 'menu'; G.paused = false; PL.rig.root.visible = false;
  $('app').classList.add('menu'); $('app').classList.remove('play');
  ['overWrap','pauseWrap','clickWrap','setWrap','howWrap'].forEach(id=>$(id).classList.remove('show'));
  $('menu').classList.add('show'); $('mBest').textContent = SAVE.best ? 'Best: round ' + SAVE.best + '  ·  ' + SAVE.kills.toLocaleString('en-US') + ' zombies down' : 'Hold the line as long as you can';
  if(document.pointerLockElement) document.exitPointerLock();
  if(typeof window.onGameplayStop === 'function') window.onGameplayStop();
}
function syncSettings(){
  $('sSens').value = SAVE.sens; $('sSensVal').textContent = (+SAVE.sens).toFixed(1);
  $('sVol').value = SAVE.vol; $('sVolVal').textContent = Math.round(SAVE.vol*100) + '%';
  $('sInvert').textContent = SAVE.invert ? 'On' : 'Off'; $('sMusic').textContent = SAVE.music ? 'On' : 'Off';
  $('sQuality').textContent = { auto:'Auto', high:'High', medium:'Medium', low:'Low' }[SAVE.quality];
  $('sAssist').textContent = SAVE.assist ? 'On' : 'Off';
}
function bindMenus(){
  $('mPlay').addEventListener('click', ()=>{ unlockAudio(); clearMenuZombies(); const go = ()=>startGame(); if(window.gameAdBreak) window.gameAdBreak('preroll', go); else go(); });
  $('mHow').addEventListener('click', ()=>$('howWrap').classList.add('show'));
  $('howBack').addEventListener('click', ()=>$('howWrap').classList.remove('show'));
  const openSet = ()=>{ syncSettings(); $('setWrap').classList.add('show'); };
  $('mSettings').addEventListener('click', openSet); $('pSettings').addEventListener('click', openSet);
  $('sBack').addEventListener('click', ()=>$('setWrap').classList.remove('show'));
  $('sSens').addEventListener('input', e=>{ SAVE.sens = +e.target.value; $('sSensVal').textContent = SAVE.sens.toFixed(1); persist(); });
  $('sVol').addEventListener('input', e=>{ setVolume(+e.target.value); $('sVolVal').textContent = Math.round(SAVE.vol*100) + '%'; });
  $('sInvert').addEventListener('click', ()=>{ SAVE.invert = !SAVE.invert; persist(); syncSettings(); });
  $('sMusic').addEventListener('click', ()=>{ setMusic(!SAVE.music); syncSettings(); });
  $('sAssist').addEventListener('click', ()=>{ SAVE.assist = !SAVE.assist; persist(); syncSettings(); });
  $('sQuality').addEventListener('click', ()=>{ const order = ['auto','high','medium','low']; SAVE.quality = order[(order.indexOf(SAVE.quality) + 1) % order.length]; persist(); syncSettings();
    applyQuality(); });
  $('pResume').addEventListener('click', ()=>{ unlockAudio(); setPaused(false); });
  $('pQuit').addEventListener('click', ()=>{ G.paused = false; $('pauseWrap').classList.remove('show'); window.gameAdBreak ? window.gameAdBreak('midgame', openMenu) : openMenu(); });
  $('oRetry').addEventListener('click', ()=>{ unlockAudio(); const go = ()=>startGame(); window.gameAdBreak ? window.gameAdBreak('midgame', go) : go(); });
  $('oMenu').addEventListener('click', ()=>{ window.gameAdBreak ? window.gameAdBreak('midgame', openMenu) : openMenu(); });
  $('howText').innerHTML = MOBILE
    ? '<p><b>Left side</b> — move (push the stick all the way to sprint)</p><p><b>Right side</b> — look around</p><p><b>FIRE</b> — hold to shoot, drag it to aim</p><p><b>AIM</b> — zoom in · <b>RELOAD</b> · <b>SWAP</b> · <b>KNIFE</b></p><p><b>USE</b> — rebuild boards, buy guns, open the gate</p>'
    : '<p><b>WASD</b> move · <b>Shift</b> sprint · <b>Mouse</b> look</p><p><b>Left click</b> shoot · <b>Right click</b> aim down sights</p><p><b>R</b> reload · <b>Q</b> or wheel switch weapon · <b>V</b> knife</p><p><b>E</b> use — hold at a window to rebuild the boards, press at a chalk outline to buy a gun</p><p><b>P</b> pause</p>';
  $('howText').innerHTML += '<p class="tip">Zombies rip the boards off the windows to get in. Rebuild them for points, aim for the head for bonus points, and save up to open the gate to the back yard.</p>';
}
function applyQuality(){
  const q = SAVE.quality === 'auto' ? (MOBILE ? 'medium' : 'high') : SAVE.quality;
  W.setQuality(q); W.lowFx = q === 'low';
}

// ---- portal integration -------------------------------------------------------------------
window.gamePauseForAd = function(on){
  G.adPaused = !!on;
  if(A.master) A.master.gain.value = on ? 0 : SAVE.vol;
  if(on){ G.trigger = false; G.adsHeld = false; if(document.pointerLockElement) document.exitPointerLock(); }
  else if(G.phase === 'play' && !PL.dead && !G.paused && !MOBILE && !document.pointerLockElement) showClick();
};
window.gameIsPaused = function(){ return G.adPaused || G.paused; };
window.gameShowAd = window.gameShowAd || null;
// kind: 'preroll' right after PLAY, 'midgame' on PLAY AGAIN / MENU / QUIT.
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

// ---- test bot (dev only): holds the yard, shoots what it can see, buys and repairs -----------
function botStep(dt){
  if(PL.dead) return;
  const B = G.botMem || (G.botMem = { hold:{ x:-3, z:-2 }, aimT:0 });
  // 1) a target it can actually see
  let best = null, bd = 1e9;
  for(const z of G.zombies){ if(z.state === 'dead' || (z.state === 'rise' && z.riseT < 0.9)) continue;
    const d = Math.hypot(z.x - PL.x, z.z - PL.z); if(d > 22 || d >= bd) continue;
    if(!segClear(PL.x, PL.z, z.x, z.z, 0.05)){ // through a window opening is fine for boarders
      if(!(z.state === 'board' || z.state === 'climbWait' || z.state === 'approach')) continue;
      const w = G.wins[z.win].w; if(!segClear(PL.x, PL.z, w.cx - w.nx*0.4, w.cz - w.nz*0.4, 0.05)) continue; }
    bd = d; best = z; }
  G.trigger = false; G.useHeld = false;
  const cam = W.camera, hv = _v();
  if(best){
    best.rig.root.position.set(best.x, best.y, best.z); best.rig.root.updateMatrixWorld(true); best.rig.head.children[0].getWorldPosition(hv);
    const ty = G.botBody ? hv.y - 0.45 : hv.y;
    const near = bd < 3, ox = near ? PL.x : cam.position.x, oy = near ? 1.62 : cam.position.y, oz = near ? PL.z : cam.position.z;
    const dx = hv.x - ox, dy = ty - oy, dz = hv.z - oz, d = Math.hypot(dx, dy, dz);
    PL.yaw = Math.atan2(-dx, -dz) - PL.kickYaw; PL.pitch = Math.asin(dy/d) - PL.kick;   // pulls against the recoil like a player would
    if(bd < 1.5 && PL.meleeCool <= 0) melee();
    else { G.trigger = true; if(!WEAP[curW().id].auto){ B.aimT += dt; G.triggerPressed = B.aimT > 0.12; if(G.triggerPressed) B.aimT = 0; } }
  }
  // 2) shopping: the rifle as soon as it is affordable, ammo when running dry
  const rifle = PL.weapons.find(w=>w.id==='rifle'), buy = M.buys[0];
  const ammoLow = PL.weapons.reduce((a, w)=>a + w.mag + w.res, 0) < 30;
  let goal = B.hold;
  if((!rifle && G.points >= WEAP.rifle.cost + 100) || (rifle && ammoLow && G.points >= WEAP.rifle.ammoCost)) goal = { x:buy.ix, z:buy.iz };
  // 3) repair the nearest broken window when nothing is in sight
  if(!best && !G.zombies.some(z=>z.inside && z.state !== 'dead')){
    let wb = null, wd = 1e9; for(const id in G.wins){ const Wd = G.wins[id]; if(!winActive(id) || Wd.boards >= 6) continue; const ins = winInside(Wd);
      const d = Math.hypot(ins.x - PL.x, ins.z - PL.z); if(d < wd){ wd = d; wb = ins; } }
    if(wb && goal === B.hold) goal = wb;
  }
  const gx = goal.x - PL.x, gz = goal.z - PL.z, gl = Math.hypot(gx, gz);
  if(gl > 0.6){ const sp = ZD.PLAYER.walk*dt; PL.x += gx/gl*Math.min(sp, gl); PL.z += gz/gl*Math.min(sp, gl); pushOut(PL, ZD.PLAYER.radius, SOLID); }
  if(G.interact){ if(G.interact.kind === 'repair' && !best) G.useHeld = true;
    if(G.interact.kind === 'buy' && goal !== B.hold){ G.usePressed = true; } }
}

// ---- loop --------------------------------------------------------------------------------
let last = 0, fpsAcc = 0, fpsN = 0, fpsLow = 0;
function loop(now){
  requestAnimationFrame(loop);
  if(W.sizeChanged()) W.resize();
  let dt = (now - last)/1000; last = now; if(!(dt > 0)) dt = 0; if(dt > 0.1) dt = 0.1;
  if(!G.firstFrame){ G.firstFrame = true; setLoad(1); }
  frame(dt, now);
}
function frame(dt, now){
  if(G.phase === 'play' || G.phase === 'over'){
    if(!G.paused && !G.adPaused){ let sim = dt*G.slow; if(PL.dead) G.slow = Math.min(1, G.slow + dt*0.3);
      while(sim > 1e-6){ const h = Math.min(sim, 1/60); step(h); sim -= h; } }
    updateCamera(dt); W.applyShake();
    G.hudT += dt; if(G.hudT > 0.1){ G.hudT = 0; updateHud(); }
    updateHudFrame(dt);
  }else if(G.phase === 'menu') menuStep(dt);
  W.tick(dt, (now || 0)/1000);
  W.render();
  // automatic quality: step down if the frame rate sags during play
  if(SAVE.quality === 'auto' && G.phase === 'play' && !G.paused){ fpsAcc += dt; fpsN++;
    if(fpsAcc > 4){ const fps = fpsN/fpsAcc; fpsAcc = 0; fpsN = 0; if(fps < 40 && ++fpsLow >= 2){ fpsLow = 0; W.setQuality('low'); W.lowFx = true; } } }
}

// ---- loading -------------------------------------------------------------------------------
const LOAD = { cur:0, target:0, done:false };
function setLoad(p){ LOAD.target = Math.max(LOAD.target, Math.min(1, p)); }
function loadTick(){
  if(LOAD.done) return;
  LOAD.cur += (LOAD.target - LOAD.cur)*0.18 + 0.004; if(LOAD.cur > LOAD.target) LOAD.cur = LOAD.target;
  $('loadFill').style.width = (LOAD.cur*100) + '%'; $('loadPct').textContent = Math.round(LOAD.cur*100) + '%';
  if(LOAD.cur >= 0.999 && LOAD.target >= 1){ LOAD.done = true; const el = $('loadWrap'); el.classList.add('gone'); setTimeout(()=>{ el.style.display = 'none'; }, 600);
    if(typeof window.onGameLoaded === 'function') window.onGameLoaded(); return; }
  setTimeout(loadTick, 40);
}
function boot(){
  THREE = window.THREE;
  loadSave();
  const q = SAVE.quality === 'auto' ? (MOBILE ? 'medium' : 'high') : SAVE.quality;
  W.init($('mount'), q, MOBILE); W.lowFx = q === 'low';
  if(MOBILE) $('app').classList.add('mobile');
  W.buildMap();
  PL.rig = W.makePlayer(); PL.rig.root.visible = false;
  buildColliders(); buildNav(); initWindows();
  bindInput(); bindMenus(); syncSettings();
  openMenu();
  setLoad(0.9);
  last = performance.now(); requestAnimationFrame(loop);
}
window.addEventListener('DOMContentLoaded', ()=>{
  setLoad(0.15); loadTick();
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>setLoad(0.4)); else setLoad(0.4);
  const t0 = performance.now();
  const wait = ()=>{ if(window.THREE) setLoad(0.65); const sized = innerWidth > 0 || $('mount').clientWidth > 0;
    if(window.THREE && (sized || performance.now() - t0 > 2500)) boot(); else setTimeout(wait, 60); };
  wait();
});

// dev hooks (harmless in production): drive the game from the console
ZD.dbg = { G, PL, W, NAV, MAP:M, step:dt=>step(dt), frame:dt=>frame(dt||1/60, performance.now()), start:startGame, openMenu, spawn:spawnZombie,
  simulate:(sec, fps)=>{ fps = fps||60; const n = Math.round(sec*fps); for(let i=0;i<n && !G.over;i++){ step(1/fps); updateCamera(1/fps); } return G.t; },
  nextRound, giveWeapon, fire, melee, damagePlayer, buildNav, updateNav, findInteract, save:()=>SAVE, persist, banner,
  setRound:n=>{ G.round = n - 1; G.zombies.forEach(z=>{ if(z.state !== 'dead'){ W.remove(z.rig.root); z.gone = true; } }); G.zombies = G.zombies.filter(z=>!z.gone); G.alive = 0; nextRound(); },
  openGate:()=>{ G.gateOpen = true; W.openGate(); buildColliders(); buildNav(); } };

})(window.ZD);

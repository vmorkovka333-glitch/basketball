// Zombie Squad - simulation, squad AI, missions, input, HUD, audio, menus, portal hooks.
(function(ZD){
const W = ZD.W, TOWN = ZD.TOWN, WEAP = ZD.WEAPONS, ZT = ZD.ZOMBIES;
const $ = id => document.getElementById(id);
const mq = q => !!(window.matchMedia && matchMedia(q).matches);
// phones and tablets; a touch-screen laptop with a mouse keeps the choice of mouse aim
const TOUCH = location.search.includes('touch') || mq('(pointer: coarse)') || (('ontouchstart' in window || navigator.maxTouchPoints > 0) && !mq('(pointer: fine)'));
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = arr => arr[(Math.random()*arr.length)|0];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let THREE;

// ---- state ------------------------------------------------------------------
const G = ZD.G = {
  phase:'menu', paused:false, adPaused:false, over:false, t:0, slow:1,
  mi:0, mission:null, step:-1, st:null, kills:0, heads:0, downs:0, zombies:[], items:[], nests:[], switches:[], marker:null,
  evac:null, heli:null, survivor:null, grenades:[], horde:0, hordeT:0, spawnT:0, feedT:0,
  trigger:false, triggerPressed:false, adsHeld:false, adsToggle:false, sprintBtn:false, useHeld:false, usePressed:false,
  keys:{}, joy:{ x:0, y:0, on:false }, interact:null, menuT:0, firstFrame:false, hudT:0, auto:false, autoMove:null, ap:null, god:false,
};
const PL = ZD.PL = { x:0, z:0, vx:0, vz:0, yaw:0, pitch:-0.08, hp:100, maxHp:100, hurtT:99, rig:null, weapons:[], cur:0, fireT:0, reloadT:0, swapT:0,
  meleeT:0, meleeCool:0, adsT:0, sprint:false, moving:false, kick:0, kickYaw:0, bloom:0, recoil:0, down:false, bleed:0, reviveT:0, nades:2, nadeCool:0, name:'YOU' };
const BOTS = ZD.BOTS = [];

// ---- save ---------------------------------------------------------------------
const SAVE_KEY = 'zsquad.save.v1';
let SAVE = { unlocked:1, stars:{}, kills:0, sens:1, invert:false, vol:0.7, music:true, quality:'auto', controls:'buttons', assist:true };
function loadSave(){ try{ const r = localStorage.getItem(SAVE_KEY); if(r) SAVE = Object.assign(SAVE, JSON.parse(r)); }catch(e){} }
function persist(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); }catch(e){} }
const buttonsMode = () => TOUCH || SAVE.controls === 'buttons';

// ---- audio --------------------------------------------------------------------
const A = { ctx:null, master:null, noise:null, echo:null };
function unlockAudio(){
  if(A.ctx){ if(A.ctx.state === 'suspended') A.ctx.resume(); return; }
  try{
    const C = window.AudioContext || window.webkitAudioContext; if(!C) return;
    A.ctx = new C(); const ac = A.ctx;
    A.master = ac.createGain(); A.master.gain.value = G.adPaused ? 0 : SAVE.vol;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; A.master.connect(comp); comp.connect(ac.destination);
    const d = ac.createDelay(1); d.delayTime.value = 0.19; const fb = ac.createGain(); fb.gain.value = 0.22; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(A.master); A.echo = d;
    const len = ac.sampleRate; A.noise = ac.createBuffer(1, len, ac.sampleRate); const ch = A.noise.getChannelData(0); for(let i=0;i<len;i++) ch[i] = Math.random()*2 - 1;
    startAmbience();
  }catch(e){ A.ctx = null; }
}
function env(g, t, peak, a, d){ g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function noiseHit(t, peak, dur, type, freq, q, dest, rate){
  const ac = A.ctx, n = ac.createBufferSource(); n.buffer = A.noise; n.playbackRate.value = rate || 1;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; if(q) f.Q.value = q;
  const g = ac.createGain(); env(g, t, peak, 0.003, dur); n.connect(f); f.connect(g); g.connect(dest || A.master); n.start(t, Math.random()*0.5, dur + 0.05); return g;
}
function tone(t, type, f0, f1, peak, dur, dest){
  const ac = A.ctx, o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if(f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain(); env(g, t, peak, 0.004, dur); o.connect(g); g.connect(dest || A.master); o.start(t); o.stop(t + dur + 0.05);
}
// distance falloff and stereo pan relative to the camera
function panned(x, z, vol){
  const ac = A.ctx, cam = W.camera, dx = x - cam.position.x, dz = z - cam.position.z, d = Math.hypot(dx, dz);
  const B = camBasis(), g = ac.createGain(); g.gain.value = clamp(1 - d/45, 0, 1)*(vol || 1);
  if(ac.createStereoPanner){ const p = ac.createStereoPanner(); p.pan.value = clamp((dx*B.rx + dz*B.rz)/Math.max(1, d), -1, 1); g.connect(p); p.connect(A.master); } else g.connect(A.master);
  return g;
}
function sfx(name, opt){
  if(!A.ctx || G.adPaused) return; const ac = A.ctx, t = ac.currentTime + 0.002; opt = opt || {};
  const out = opt.at ? panned(opt.at[0], opt.at[1], opt.vol) : A.master;
  switch(name){
    case 'pistol': { const g = noiseHit(t, 0.55, 0.13, 'lowpass', 3600, 0, out); if(!opt.at) g.connect(A.echo); tone(t, 'sine', 160, 50, 0.5, 0.12, out); break; }
    case 'rifle':  { const g = noiseHit(t, 0.5, 0.11, 'lowpass', 2800, 0, out, 0.9); if(!opt.at) g.connect(A.echo); tone(t, 'sine', 130, 45, 0.55, 0.1, out); break; }
    case 'smg':    { noiseHit(t, 0.42, 0.08, 'lowpass', 3200, 0, out, 1.1); tone(t, 'sine', 150, 60, 0.35, 0.07, out); break; }
    case 'shotgun':{ const g = noiseHit(t, 0.8, 0.28, 'lowpass', 1700, 0, out, 0.75); if(!opt.at) g.connect(A.echo); tone(t, 'sine', 110, 38, 0.8, 0.22, out); break; }
    case 'dry':    noiseHit(t, 0.15, 0.03, 'bandpass', 3000, 6); break;
    case 'reload': noiseHit(t, 0.18, 0.04, 'bandpass', 2400, 5); noiseHit(t + 0.22*(opt.k||1), 0.2, 0.05, 'bandpass', 1500, 5); noiseHit(t + 0.5*(opt.k||1), 0.22, 0.04, 'bandpass', 2800, 6); break;
    case 'hit':    tone(t, 'triangle', 2600, 2100, 0.12, 0.035); break;
    case 'head':   tone(t, 'triangle', 3400, 2800, 0.16, 0.05); noiseHit(t, 0.18, 0.06, 'bandpass', 900, 2); break;
    case 'kill':   tone(t, 'sine', 180, 60, 0.32, 0.14); noiseHit(t, 0.22, 0.12, 'lowpass', 700); break;
    case 'melee':  noiseHit(t, 0.2, 0.12, 'bandpass', 1200, 1.5, null, 1.6); break;
    case 'meleeHit': tone(t, 'sine', 140, 55, 0.5, 0.12); noiseHit(t, 0.3, 0.08, 'lowpass', 900); break;
    case 'boom':   noiseHit(t, 1.0, 0.9, 'lowpass', 600, 0, out, 0.6); tone(t, 'sine', 70, 28, 0.9, 0.7, out); noiseHit(t, 0.4, 0.2, 'highpass', 2000, 0, out); break;
    case 'splat':  noiseHit(t, 0.7, 0.5, 'lowpass', 900, 0, out, 0.8); tone(t, 'sine', 90, 40, 0.5, 0.35, out); break;
    case 'throw':  noiseHit(t, 0.12, 0.15, 'bandpass', 900, 1.5); break;
    case 'hurt':   tone(t, 'sine', 90, 45, 0.6, 0.25); noiseHit(t, 0.3, 0.12, 'lowpass', 500); break;
    case 'swap':   noiseHit(t, 0.15, 0.05, 'bandpass', 2000, 4); noiseHit(t + 0.15, 0.15, 0.05, 'bandpass', 1400, 4); break;
    case 'pickup': tone(t, 'triangle', 660, 0, 0.16, 0.08); tone(t + 0.08, 'triangle', 990, 0, 0.16, 0.14); break;
    case 'objective': [523, 659, 784, 1046].forEach((f, i)=>tone(t + i*0.09, 'triangle', f, 0, 0.14, 0.4)); break;
    case 'fail':   [392, 330, 262].forEach((f, i)=>tone(t + i*0.18, 'sawtooth', f, f*0.98, 0.1, 0.5)); break;
    case 'down':   tone(t, 'sawtooth', 220, 110, 0.18, 0.6); break;
    case 'revive': [440, 554, 659].forEach((f, i)=>tone(t + i*0.08, 'triangle', f, 0, 0.14, 0.25)); break;
    case 'blip':   tone(t, 'square', 1200, 0, 0.04, 0.05); break;
    case 'horde':  [55, 82.4, 110].forEach((f, i)=>{ const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
        o.connect(lp); lp.connect(g); g.connect(A.master); o.start(t + i*0.05); o.stop(t + 2.6); }); break;
    case 'groan': {
      const o = ac.createOscillator(); o.type = 'sawtooth'; const f0 = (opt.big ? 55 : 80) + Math.random()*30; o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f0*(0.75 + Math.random()*0.2), t + 0.9);
      const lfo = ac.createOscillator(); lfo.frequency.value = 5 + Math.random()*4; const lg = ac.createGain(); lg.gain.value = 9; lfo.connect(lg); lg.connect(o.frequency);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520 + Math.random()*200; lp.Q.value = 3;
      const g = ac.createGain(), dur = 0.7 + Math.random()*0.6; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(out); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05); break; }
  }
}
let amb = null, rotor = null;
function startAmbience(){
  if(!A.ctx || amb) return; const ac = A.ctx;
  const n = ac.createBufferSource(); n.buffer = A.noise; n.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.6;
  const g = ac.createGain(); g.gain.value = 0.04; n.connect(f); f.connect(g); g.connect(A.master); n.start();
  const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 41; const og = ac.createGain(); og.gain.value = SAVE.music ? 0.05 : 0; o.connect(og); og.connect(A.master); o.start();
  amb = { n, g, o, og };
}
function rotorSound(on){
  if(!A.ctx) return;
  if(on && !rotor){ const ac = A.ctx, n = ac.createBufferSource(); n.buffer = A.noise; n.loop = true; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const g = ac.createGain(); g.gain.value = 0; const lfo = ac.createOscillator(); lfo.frequency.value = 11; const lg = ac.createGain(); lg.gain.value = 0.12; lfo.connect(lg); lg.connect(g.gain);
    n.connect(f); f.connect(g); g.connect(A.master); n.start(); lfo.start(); rotor = { n, g, lfo }; }
  if(!on && rotor){ try{ rotor.n.stop(); rotor.lfo.stop(); }catch(e){} rotor = null; }
}
function setMusic(on){ SAVE.music = on; if(amb) amb.og.gain.value = on ? 0.05 : 0; persist(); }
function setVolume(v){ SAVE.vol = v; if(A.master && !G.adPaused) A.master.gain.value = v; persist(); }

// ---- collision ------------------------------------------------------------------
let SOLID = [], BULLET = [];
function buildColliders(){
  SOLID = []; BULLET = [];
  const add = b=>{ BULLET.push(b); SOLID.push(b); };
  for(const b of TOWN.buildings) add(b);
  for(const p of TOWN.props) add({ x0:p.x0, x1:p.x1, z0:p.z0, z1:p.z1, y0:0, y1:p.h, kind:p.kind });
  for(const [x, z] of TOWN.trees) add({ x0:x-0.3, x1:x+0.3, z0:z-0.3, z1:z+0.3, y0:0, y1:4, kind:'tree' });
  BULLET.push({ x0:16, x1:28, z0:-25, z1:-15, y0:4.45, y1:4.95, kind:'roof' });
  const H = TOWN.half, big = 40;
  [[-H-big, -H, -H-big, H+big], [H, H+big, -H-big, H+big], [-H, H, -H-big, -H], [-H, H, H, H+big]].forEach(([x0, x1, z0, z1])=>SOLID.push({ x0, x1, z0, z1, y0:0, y1:3, kind:'edge' }));
}
function pushOut(p, r, boxes){
  for(let pass=0; pass<2; pass++) for(const b of boxes){
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
  if(Math.abs(dx) < 1e-9){ if(ox < b.x0 || ox > b.x1) return -1; } else { let a = (b.x0-ox)/dx, c = (b.x1-ox)/dx; if(a > c){ const s=a; a=c; c=s; } if(a > t0) t0 = a; if(c < t1) t1 = c; if(t0 > t1) return -1; }
  if(Math.abs(dy) < 1e-9){ if(oy < b.y0 || oy > b.y1) return -1; } else { let a = (b.y0-oy)/dy, c = (b.y1-oy)/dy; if(a > c){ const s=a; a=c; c=s; } if(a > t0) t0 = a; if(c < t1) t1 = c; if(t0 > t1) return -1; }
  if(Math.abs(dz) < 1e-9){ if(oz < b.z0 || oz > b.z1) return -1; } else { let a = (b.z0-oz)/dz, c = (b.z1-oz)/dz; if(a > c){ const s=a; a=c; c=s; } if(a > t0) t0 = a; if(c < t1) t1 = c; if(t0 > t1) return -1; }
  return t0;
}
function rayWorld(ox, oy, oz, dx, dy, dz, tmax){
  let best = tmax, hit = null;
  for(const b of BULLET){ const t = rayBox(ox, oy, oz, dx, dy, dz, b, best); if(t >= 0 && t < best){ best = t; hit = b; } }
  if(dy < -1e-6){ const tg = -oy/dy; if(tg >= 0 && tg < best){ best = tg; hit = { kind:'ground' }; } }
  return { t:best, hit };
}
// flat line test; with low=false the low props (cars, barriers) do not block a look or a shot
const _seg = { x0:0, x1:0, y0:-1, y1:9, z0:0, z1:0 };
function segClear(x0, z0, x1, z1, pad, low){
  const dx = x1 - x0, dz = z1 - z0, mnx = Math.min(x0, x1) - pad, mxx = Math.max(x0, x1) + pad, mnz = Math.min(z0, z1) - pad, mxz = Math.max(z0, z1) + pad;
  for(const b of SOLID){
    if(!low && b.y1 < 1.6) continue;
    if(b.x1 < mnx || b.x0 > mxx || b.z1 < mnz || b.z0 > mxz) continue;
    _seg.x0 = b.x0 - pad; _seg.x1 = b.x1 + pad; _seg.z0 = b.z0 - pad; _seg.z1 = b.z1 + pad;
    const t = rayBox(x0, 1, z0, dx, 0, dz, _seg, 1); if(t >= 0 && t <= 1) return false; }
  return true;
}

// ---- navigation: a 1 m grid; zombies share a flow field, bots use A* ---------------
const NAV = { cs:1, x0:-TOWN.half, z0:-TOWN.half, nx:0, nz:0, blocked:null, dist:null, heap:null, timer:0, gen:1 };
function buildNav(){
  NAV.nx = Math.round(TOWN.half*2/NAV.cs); NAV.nz = NAV.nx; const n = NAV.nx*NAV.nz;
  NAV.blocked = new Uint8Array(n); NAV.dist = new Float32Array(n); NAV.heap = new Int32Array(n*8 + 16);
  NAV.g = new Float32Array(n); NAV.f = new Float32Array(n); NAV.from = new Int32Array(n); NAV.mark = new Uint32Array(n); NAV.closed = new Uint32Array(n);
  const pad = 0.42;
  for(const s of SOLID){
    const ix0 = Math.max(0, Math.floor((s.x0 - pad - NAV.x0)/NAV.cs)), ix1 = Math.min(NAV.nx-1, Math.floor((s.x1 + pad - NAV.x0)/NAV.cs));
    const iz0 = Math.max(0, Math.floor((s.z0 - pad - NAV.z0)/NAV.cs)), iz1 = Math.min(NAV.nz-1, Math.floor((s.z1 + pad - NAV.z0)/NAV.cs));
    for(let iz=iz0; iz<=iz1; iz++) for(let ix=ix0; ix<=ix1; ix++){ const x = NAV.x0 + (ix+0.5)*NAV.cs, z = NAV.z0 + (iz+0.5)*NAV.cs;
      if(x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad) NAV.blocked[iz*NAV.nx + ix] = 1; }
  }
}
function navCell(x, z){ const ix = Math.floor((x - NAV.x0)/NAV.cs), iz = Math.floor((z - NAV.z0)/NAV.cs);
  if(ix < 0 || iz < 0 || ix >= NAV.nx || iz >= NAV.nz) return -1; return iz*NAV.nx + ix; }
function cellPos(k){ return [NAV.x0 + ((k % NAV.nx) + 0.5)*NAV.cs, NAV.z0 + (((k / NAV.nx)|0) + 0.5)*NAV.cs]; }
function openNear(c){
  if(c < 0) return -1; if(!NAV.blocked[c]) return c;
  const cx = c % NAV.nx, cz = (c / NAV.nx)|0; let best = -1, bd = 1e9;
  for(let dz=-3; dz<=3; dz++) for(let dx=-3; dx<=3; dx++){ const x = cx+dx, z = cz+dz; if(x<0||z<0||x>=NAV.nx||z>=NAV.nz) continue;
    const k = z*NAV.nx + x; if(!NAV.blocked[k] && dx*dx+dz*dz < bd){ bd = dx*dx+dz*dz; best = k; } }
  return best;
}
function makeHeap(key){
  const heap = NAV.heap; let hn = 0;
  return {
    push(k){ if(hn >= heap.length - 1) return; let i = hn++; heap[i] = k; while(i > 0){ const p = (i-1)>>1; if(key[heap[p]] <= key[heap[i]]) break; const s = heap[p]; heap[p] = heap[i]; heap[i] = s; i = p; } },
    pop(){ const top = heap[0]; heap[0] = heap[--hn]; let i = 0;
      for(;;){ const l = i*2+1, r = l+1; let m = i; if(l < hn && key[heap[l]] < key[heap[m]]) m = l; if(r < hn && key[heap[r]] < key[heap[m]]) m = r; if(m === i) break; const s = heap[m]; heap[m] = heap[i]; heap[i] = s; i = m; }
      return top; },
    size(){ return hn; },
  };
}
// zombies walk down this field: distance to the nearest standing squad member, out to ~60 m
function updateFlow(){
  const d = NAV.dist, nx = NAV.nx, nz = NAV.nz, bl = NAV.blocked; d.fill(1e9);
  const H = makeHeap(d);
  for(const m of members()){ if(m.down) continue; const c = openNear(navCell(m.x, m.z)); if(c >= 0 && d[c] > 0){ d[c] = 0; H.push(c); } }
  while(H.size() > 0){
    const k = H.pop(), kx = k % nx, kz = (k / nx)|0, dk = d[k]; if(dk > 62) continue;
    for(let dz=-1; dz<=1; dz++) for(let dx=-1; dx<=1; dx++){
      if(!dx && !dz) continue; const x = kx+dx, z = kz+dz; if(x<0||z<0||x>=nx||z>=nz) continue;
      const j = z*nx + x; if(bl[j]) continue; if(dx && dz && (bl[kz*nx + x] || bl[z*nx + kx])) continue;
      const nd = dk + (dx && dz ? 1.414 : 1); if(nd < d[j]){ d[j] = nd; H.push(j); }
    }
  }
}
function flowDir(x, z){
  const c = navCell(x, z); if(c < 0) return null;
  const nx = NAV.nx, cx = c % nx, cz = (c / nx)|0; let best = -1, bd = NAV.dist[c];
  for(let dz=-1; dz<=1; dz++) for(let dx=-1; dx<=1; dx++){
    if(!dx && !dz) continue; const xx = cx+dx, zz = cz+dz; if(xx<0||zz<0||xx>=nx||zz>=NAV.nz) continue;
    const j = zz*nx + xx; if(NAV.blocked[j]) continue; if(dx && dz && (NAV.blocked[cz*nx + xx] || NAV.blocked[zz*nx + cx])) continue;
    if(NAV.dist[j] < bd){ bd = NAV.dist[j]; best = j; } }
  if(best < 0) return null;
  const [tx, tz] = cellPos(best), l = Math.hypot(tx - x, tz - z) || 1;
  return [(tx - x)/l, (tz - z)/l];
}
// A* between two points, then trimmed to the corners that matter
function findPath(x0, z0, x1, z1){
  const s = openNear(navCell(x0, z0)), e = openNear(navCell(x1, z1)); if(s < 0 || e < 0) return null;
  const endPt = navCell(x1, z1) === e ? [x1, z1] : cellPos(e);
  if(s === e) return [endPt];
  const nx = NAV.nx, nz = NAV.nz, bl = NAV.blocked, g = NAV.g, f = NAV.f, from = NAV.from, mark = NAV.mark, closed = NAV.closed;
  const gen = ++NAV.gen, ex = e % nx, ez = (e / nx)|0;
  const hf = k => { const dx = Math.abs((k % nx) - ex), dz = Math.abs(((k / nx)|0) - ez); return Math.max(dx, dz) + 0.414*Math.min(dx, dz); };
  const H = makeHeap(f); mark[s] = gen; g[s] = 0; f[s] = hf(s); from[s] = -1; H.push(s);
  let found = false, expanded = 0;
  while(H.size() > 0 && expanded < 9000){
    const k = H.pop(); if(closed[k] === gen) continue; closed[k] = gen; expanded++;
    if(k === e){ found = true; break; }
    const kx = k % nx, kz = (k / nx)|0;
    for(let dz=-1; dz<=1; dz++) for(let dx=-1; dx<=1; dx++){
      if(!dx && !dz) continue; const x = kx+dx, z = kz+dz; if(x<0||z<0||x>=nx||z>=nz) continue;
      const j = z*nx + x; if(bl[j] || closed[j] === gen) continue; if(dx && dz && (bl[kz*nx + x] || bl[z*nx + kx])) continue;
      const ng = g[k] + (dx && dz ? 1.414 : 1);
      if(mark[j] !== gen || ng < g[j]){ mark[j] = gen; g[j] = ng; f[j] = ng + hf(j); from[j] = k; H.push(j); }
    }
  }
  if(!found) return null;
  const cells = []; for(let k = e; k !== -1; k = from[k]) cells.push(k); cells.reverse();
  const pts = cells.map(cellPos); pts[pts.length-1] = endPt;
  const out = []; let cx = x0, cz = z0, i = 0;
  while(i < pts.length){ let j = i; while(j + 1 < pts.length && segClear(cx, cz, pts[j+1][0], pts[j+1][1], 0.3, true)) j++;
    out.push(pts[j]); cx = pts[j][0]; cz = pts[j][1]; i = j + 1; }
  return out;
}

// ---- the squad ------------------------------------------------------------------
function members(){ return [PL].concat(BOTS); }
function standing(){ return members().filter(m=>!m.down); }
function makeBots(){
  BOTS.forEach(b=>W.remove(b.rig.root)); BOTS.length = 0;
  for(const def of ZD.SQUAD){ const rig = W.makeBot(def);
    BOTS.push({ def, rig, name:def.name, x:0, z:0, yaw:0, hp:def.hp, maxHp:def.hp, hurtT:99, down:false, reviveT:0, fireT:0, mag:WEAP[def.weapon].mag,
      reloadT:0, path:null, pathT:0, goal:null, task:'follow', target:null, aimT:0, sayT:0, moving:false, lx:0, lz:0, stuckT:0, nadeCool:8 + Math.random()*8 }); }
}
let feedQ = [];
function say(m, kind, force){
  if(!m || !m.def || (m.sayT > 0 && !force)) return; const lines = ZD.CALLOUTS[kind]; if(!lines) return;
  if(G.feedT > 0 && !force) return;
  m.sayT = 4 + Math.random()*3; G.feedT = 0.9;
  feedQ.push({ name:m.name, css:m.def.css, text:rnd(lines), t:4 }); if(feedQ.length > 4) feedQ.shift(); renderFeed(); sfx('blip');
}
function renderFeed(){ $('feed').innerHTML = feedQ.map(f=>'<div style="opacity:' + Math.min(1, f.t).toFixed(2) + '"><b style="color:' + f.css + '">' + f.name + '</b> ' + f.text + '</div>').join(''); }

// ---- weapons --------------------------------------------------------------------
function giveWeapon(id){
  const d = WEAP[id], have = PL.weapons.findIndex(w=>w.id===id);
  if(have >= 0){ PL.weapons[have].mag = d.mag; PL.weapons[have].res = d.reserve; return; }
  PL.weapons.push({ id, mag:d.mag, res:d.reserve }); equip(PL.weapons.length - 1);
}
function equip(i){ PL.cur = i; PL.reloadT = 0; PL.swapT = 0.45; W.setGunModel(PL.rig, WEAP[PL.weapons[i].id].model); updateHud(true); }
function curW(){ return PL.weapons[PL.cur]; }
function swapWeapon(){ if(PL.weapons.length < 2 || PL.swapT > 0 || PL.down) return; equip((PL.cur + 1) % PL.weapons.length); sfx('swap'); }
function startReload(){ const w = curW(), d = WEAP[w.id]; if(PL.reloadT > 0 || w.mag >= d.mag || w.res <= 0 || PL.swapT > 0 || PL.down) return; PL.reloadT = d.reload; sfx('reload', { k:d.reload/2 }); }
function finishReload(){ const w = curW(), d = WEAP[w.id]; const take = Math.min(d.mag - w.mag, w.res); w.mag += take; if(w.res !== Infinity) w.res -= take; updateHud(true); }

// ---- camera -----------------------------------------------------------------------
const CAM = { side:1.05, up:0.5, back:3.6, fov:68 };
function camBasis(){
  const cp = Math.cos(PL.pitch + PL.kick), sp = Math.sin(PL.pitch + PL.kick), cy = Math.cos(PL.yaw + PL.kickYaw), sy = Math.sin(PL.yaw + PL.kickYaw);
  return { fx:-sy*cp, fy:sp, fz:-cy*cp, rx:cy, rz:-sy };
}
function updateCamera(dt){
  const cam = W.camera, a = PL.adsT, B = camBasis();
  const side = lerp(CAM.side, 0.7, a), up = lerp(CAM.up, 0.25, a), back = lerp(CAM.back, 1.8, a);
  const py = PL.down ? 1.0 : 1.62, ox = PL.x + B.rx*side*0.4, oz = PL.z + B.rz*side*0.4;
  let dx = -B.fx*back + B.rx*side*0.6, dy = -B.fy*back + up, dz = -B.fz*back + B.rz*side*0.6;
  const len = Math.hypot(dx, dy, dz); dx /= len; dy /= len; dz /= len;
  let t = len; for(const b of BULLET){ const h = rayBox(ox, py, oz, dx, dy, dz, b, t); if(h >= 0 && h < t) t = h; }
  t = Math.max(0.35, t - 0.22);
  cam.position.set(ox + dx*t, Math.max(0.3, py + dy*t), oz + dz*t);
  cam.rotation.set(PL.pitch + PL.kick, PL.yaw + PL.kickYaw, 0, 'YXZ');
  const fov = lerp(PL.sprint ? 74 : CAM.fov, 48, a);
  if(Math.abs(cam.fov - fov) > 0.05){ cam.fov = lerp(cam.fov, fov, 1 - Math.exp(-dt*14)); cam.updateProjectionMatrix(); }
  W.follow(PL.x, PL.z);
}

// ---- shooting -----------------------------------------------------------------------
let _hv = null, _mz = null;
function refreshRig(z){ z.rig.root.position.set(z.x, z.y, z.z); z.rig.root.rotation.y = z.yaw; z.rig.root.updateMatrixWorld(true); }
function traceShot(ox, oy, oz, dx, dy, dz, range, assist){
  const wr = rayWorld(ox, oy, oz, dx, dy, dz, range);
  let best = wr.t, bz = null, head = false, nest = null; const hv = _hv, hl = Math.hypot(dx, dz) || 1;
  for(const z of G.zombies){
    if(z.state === 'dead' || (z.state === 'rise' && z.riseT < 0.5)) continue;
    const s = ZT[z.type].scale, qx = z.x - ox, qz = z.z - oz, along = (qx*dx + qz*dz)/hl;
    if(along < -1 || along > best + 2 || Math.abs(qx*dz - qz*dx)/hl > 1.4*s) continue;
    refreshRig(z); z.rig.headMesh.getWorldPosition(hv);
    const hr = 0.2*s + assist*0.07; let hx = ox - hv.x, hy = oy - hv.y, hz = oz - hv.z;
    const b = hx*dx + hy*dy + hz*dz, c = hx*hx + hy*hy + hz*hz - hr*hr, disc = b*b - c;
    if(disc >= 0){ const t = -b - Math.sqrt(disc); if(t > 0 && t < best){ best = t; bz = z; head = true; } }
    const r = 0.3*s + assist*0.14, cx = z.x - Math.sin(z.yaw)*0.08*s, cz = z.z - Math.cos(z.yaw)*0.08*s;
    const ex = ox - cx, ez = oz - cz, A2 = dx*dx + dz*dz;
    if(A2 > 1e-9){ const B2 = ex*dx + ez*dz, C2 = ex*ex + ez*ez - r*r, D2 = B2*B2 - A2*C2;
      if(D2 >= 0){ const t = (-B2 - Math.sqrt(D2))/A2, y = oy + dy*t; if(t > 0 && t < best && y > z.y + 0.05 && y < hv.y - 0.15*s){ best = t; bz = z; head = false; } } }
  }
  for(const n of G.nests){ if(n.dead) continue; const hx = ox - n.x, hy = oy - 0.8, hz = oz - n.z, r = 1.15 + assist*0.2;
    const b = hx*dx + hy*dy + hz*dz, c = hx*hx + hy*hy + hz*hz - r*r, disc = b*b - c;
    if(disc >= 0){ const t = -b - Math.sqrt(disc); if(t > 0 && t < best){ best = t; nest = n; bz = null; head = false; } } }
  return { t:best, z:bz, head, nest, world:(bz || nest) ? null : wr.hit, x:ox + dx*best, y:oy + dy*best, z2:oz + dz*best };
}
function fire(){
  const w = curW(), d = WEAP[w.id];
  if(PL.fireT > 0 || PL.reloadT > 0 || PL.swapT > 0 || PL.meleeT > 0 || PL.down) return;
  if(w.mag <= 0){ if(w.res > 0) startReload(); else { sfx('dry'); PL.fireT = 0.25; } return; }
  w.mag--; PL.fireT = d.rate; PL.sprint = false;
  const B = camBasis(), cam = W.camera, assist = buttonsMode() && SAVE.assist ? 1 : 0;
  // rays start at the player's depth, so nothing between the camera and the hero can be hit
  const depth = Math.max(0, (PL.x - cam.position.x)*B.fx + (1.5 - cam.position.y)*B.fy + (PL.z - cam.position.z)*B.fz - 0.2);
  const ox = cam.position.x + B.fx*depth, oy = cam.position.y + B.fy*depth, oz = cam.position.z + B.fz*depth;
  const spread = lerp(d.spreadHip, d.spreadAds, PL.adsT) * (PL.moving ? 1.3 : 1) + PL.bloom;
  PL.rig.root.position.set(PL.x, 0, PL.z); PL.rig.root.rotation.y = PL.yaw; PL.rig.root.updateMatrixWorld(true);
  const muzzle = _mz; PL.rig.muzzle.getWorldPosition(muzzle);
  let anyHit = false, killed = false, headHit = false;
  for(let p=0; p<d.pellets; p++){
    const a = Math.random()*Math.PI*2, r = Math.sqrt(Math.random())*spread;
    let dx = B.fx + B.rx*Math.cos(a)*r, dy = B.fy + Math.sin(a)*r, dz = B.fz + B.rz*Math.cos(a)*r;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    const h = traceShot(ox, oy, oz, dx, dy, dz, d.range, assist);
    let hx = h.x, hy = h.y, hz = h.z2, target = h.z, nest = h.nest, world = h.world;
    // the barrel can be behind a corner the camera sees past
    const mx = hx - muzzle.x, my = hy - muzzle.y, mz = hz - muzzle.z, ml = Math.hypot(mx, my, mz);
    if(ml > 0.3){ const block = rayWorld(muzzle.x, muzzle.y, muzzle.z, mx/ml, my/ml, mz/ml, ml - 0.05);
      if(block.hit && block.hit.kind !== 'ground'){ hx = muzzle.x + mx/ml*block.t; hy = muzzle.y + my/ml*block.t; hz = muzzle.z + mz/ml*block.t; target = null; nest = null; world = block.hit; } }
    const fall = h.t > d.range*0.6 ? lerp(1, 0.6, (h.t - d.range*0.6)/(d.range*0.4)) : 1;
    if(target){ const res = damageZombie(target, d.dmg*(h.head ? d.headMul : 1)*fall, h.head, hx, hy, hz, dx, dz, PL); anyHit = true; if(res === 'kill') killed = true; if(h.head) headHit = true; }
    else if(nest){ damageNest(nest, d.dmg*fall, hx, hy, hz); anyHit = true; }
    else if(world && world.kind === 'ground') W.dust(hx, 0.05, hz, 3);
    else if(world){ W.dust(hx, hy, hz, 3); W.sparks(hx, hy, hz, 3); }
    if(p < 3) W.tracer(muzzle.x, muzzle.y, muzzle.z, hx, hy, hz);
  }
  if(anyHit) hitmarker(killed ? 'kill' : (headHit ? 'head' : 'hit'));
  W.muzzleFlash(muzzle, new THREE.Vector3(B.fx, B.fy, B.fz), d.flash); sfx(d.sound);
  const ads = 1 - PL.adsT*0.45; PL.kick += d.kick*ads; PL.kickYaw += (Math.random() - 0.5)*d.kickSide*2*ads; PL.bloom = Math.min(0.06, PL.bloom + d.kick*0.5);
  PL.recoil = 0.07; W.shake(d.pellets > 1 ? 0.22 : 0.05);
  updateHud(true);
}
function melee(){
  if(PL.meleeCool > 0 || PL.down || PL.swapT > 0) return;
  PL.meleeCool = ZD.MELEE.cool; PL.meleeT = 0.35; sfx('melee');
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw); let best = null, bd = ZD.MELEE.range;
  for(const z of G.zombies){ if(z.state === 'dead' || z.state === 'rise') continue;
    const dx = z.x - PL.x, dz = z.z - PL.z, d = Math.hypot(dx, dz); if(d > bd || (dx*fx + dz*fz)/Math.max(d, 0.01) < ZD.MELEE.cone) continue; best = z; bd = d; }
  if(best){ refreshRig(best); best.rig.headMesh.getWorldPosition(_hv);
    const r = damageZombie(best, ZD.MELEE.dmg, false, _hv.x, _hv.y - 0.3, _hv.z, fx, fz, PL); sfx('meleeHit'); W.shake(0.15); hitmarker(r === 'kill' ? 'kill' : 'hit'); }
}
function hitmarker(kind){ const h = $('hitm'); h.className = ''; void h.offsetWidth; h.className = 'show ' + kind; sfx(kind === 'head' ? 'head' : 'hit'); }

// ---- grenades ---------------------------------------------------------------------------
function throwNade(from, tx, tz){
  if(from === PL){ if(PL.nades <= 0 || PL.nadeCool > 0 || PL.down) return; PL.nades--; PL.nadeCool = 0.8; updateHud(true); }
  const m = W.makeGrenade(); let vx, vy, vz;
  if(from === PL){ const B = camBasis(); vx = B.fx*ZD.GRENADE.speed; vy = Math.max(3.5, B.fy*ZD.GRENADE.speed + 4.5); vz = B.fz*ZD.GRENADE.speed; }
  else { const dx = tx - from.x, dz = tz - from.z, d = Math.max(1, Math.hypot(dx, dz)), t = clamp(d/12, 0.6, 1.4); vx = dx/t; vz = dz/t; vy = 4.9*t; }
  const g = { x:from.x, y:1.5, z:from.z, vx, vy, vz, fuse:ZD.GRENADE.fuse, m, owner:from }; m.position.set(g.x, g.y, g.z);
  G.grenades.push(g); sfx('throw');
}
function updateGrenades(dt){
  for(const g of G.grenades){
    g.vy -= 14*dt; const nx = g.x + g.vx*dt, nz = g.z + g.vz*dt; let ny = g.y + g.vy*dt;
    if(ny < 0.11){ ny = 0.11; g.vy = Math.abs(g.vy)*0.35; g.vx *= 0.6; g.vz *= 0.6; }
    const p = { x:nx, z:nz }; if(ny < 5) pushOut(p, 0.12, SOLID); if(p.x !== nx) g.vx *= -0.5; if(p.z !== nz) g.vz *= -0.5;
    g.x = p.x; g.y = ny; g.z = p.z; g.m.position.set(g.x, g.y, g.z); g.m.rotation.x += dt*10;
    g.fuse -= dt; if(g.fuse <= 0){ explode(g.x, g.z, ZD.GRENADE.radius, ZD.GRENADE.dmg, g.owner, false); W.remove(g.m); g.done = true; }
  }
  G.grenades = G.grenades.filter(g=>!g.done);
}
function explode(x, z, r, dmg, owner, toxic){
  W.explosion(x, 0.2, z, r, toxic); sfx(toxic ? 'splat' : 'boom', { at:[x, z], vol:1.4 });
  W.shake(clamp(0.6 - Math.hypot(PL.x - x, PL.z - z)/30, 0.05, 0.6));
  for(const zz of G.zombies){ if(zz.state === 'dead') continue; const d = Math.hypot(zz.x - x, zz.z - z); if(d > r) continue;
    const k = 1 - d/r*0.6, nx = (zz.x - x)/(d||1), nz = (zz.z - z)/(d||1);
    damageZombie(zz, dmg*k, false, zz.x, 1, zz.z, nx, nz, owner); zz.kx += nx*6*k; zz.kz += nz*6*k; }
  for(const n of G.nests){ if(n.dead) continue; const d = Math.hypot(n.x - x, n.z - z); if(d < r + 1) damageNest(n, dmg*(1 - d/(r+1)*0.5), n.x, 1, n.z); }
  if(toxic) for(const m of members()){ const d = Math.hypot(m.x - x, m.z - z); if(d < r) hurtMember(m, ZT.bloater.blast.dmg*(1 - d/r*0.6), { x, z }); }
}

// ---- zombies ------------------------------------------------------------------------------
function pickType(){ const m = G.mission.mix, r = Math.random();
  if(r < m.brute) return 'brute'; if(r < m.brute + m.bloater) return 'bloater'; if(r < m.brute + m.bloater + m.runner) return 'runner'; return 'walker'; }
function spawnZombie(type, x, z){
  const d = ZT[type], rig = W.makeZombie(type, rnd(ZD.SHIRTS), rnd(ZD.PANTS));
  const hp = Math.round(d.hp*(1 + 0.15*(G.mission.intensity - 1)));
  const zb = { type, rig, x, z, y:-1.7, yaw:Math.random()*6.28, hp, maxHp:hp, speed:d.speed*(0.9 + Math.random()*0.2), state:'rise', riseT:0,
    atkT:0, atkPose:0, hitDone:false, flinch:0, kx:0, kz:0, moveSpeed:0, deadT:0, fallDir:1, groanT:1 + Math.random()*6, stuckT:0, lx:x, lz:z, losT:0, los:false, fuse:0, target:null };
  rig.root.position.set(x, zb.y, z); W.rise(x, z); G.zombies.push(zb); return zb;
}
function aliveZ(){ let n = 0; for(const z of G.zombies) if(z.state !== 'dead') n++; return n; }
function zCap(){ return TOUCH ? ZD.DIRECTOR.maxAliveMobile : ZD.DIRECTOR.maxAlive; }
// somewhere out of sight, 26-44 m away, that the zombies can walk to the squad from
function spawnPoint(){
  const cam = W.camera, B = camBasis();
  for(let tries=0; tries<40; tries++){
    const a = Math.random()*Math.PI*2, r = lerp(ZD.DIRECTOR.ring[0], ZD.DIRECTOR.ring[1], Math.random());
    const x = PL.x + Math.cos(a)*r, z = PL.z + Math.sin(a)*r;
    if(Math.abs(x) > TOWN.half - 2 || Math.abs(z) > TOWN.half - 2) continue;
    const c = navCell(x, z); if(c < 0 || NAV.blocked[c] || NAV.dist[c] > 58) continue;
    if(BOTS.some(b=>Math.hypot(b.x - x, b.z - z) < 14)) continue;
    const dx = x - cam.position.x, dz = z - cam.position.z, dl = Math.hypot(dx, dz);
    if((dx*B.fx + dz*B.fz)/dl > 0.35 && segClear(PL.x, PL.z, x, z, 0, false)) continue;
    return [x, z];
  }
  return null;
}
function director(dt){
  const cap = zCap(), alive = aliveZ();
  G.spawnT -= dt;
  if(G.horde > 0){ G.hordeT -= dt; if(G.hordeT <= 0 && alive < cap + 6){ const p = spawnPoint(); if(p){ spawnZombie(pickType(), p[0], p[1]); G.horde--; } G.hordeT = 0.28; } }
  const want = ZD.DIRECTOR.base + ZD.DIRECTOR.perIntensity*G.mission.intensity + (G.st && G.st.started ? 4 : 0) - (G.st && G.st.type === 'destroy' ? 5 : 0);
  if(G.spawnT <= 0 && alive < Math.min(want, cap)){ const p = spawnPoint(); if(p) spawnZombie(pickType(), p[0], p[1]); G.spawnT = ZD.DIRECTOR.gap*(0.6 + Math.random()*0.8); }
  for(const z of G.zombies){ if(z.state !== 'dead' && Math.hypot(z.x - PL.x, z.z - PL.z) > ZD.DIRECTOR.despawn){ W.remove(z.rig.root); z.gone = true; } }
}
function damageZombie(z, dmg, head, x, y, zz, dx, dz, by){
  if(z.state === 'dead') return null;
  z.hp -= dmg; z.flinch = 0.25; z.kx += dx*0.6; z.kz += dz*0.6;
  W.goo(x, y, zz, -dx*0.3, 0.2, -dz*0.3, by === PL ? (head ? 14 : 7) : 4, head && by === PL);
  if(z.hp <= 0){ killZombie(z, head, by, x, y, zz); return 'kill'; }
  return 'hit';
}
function killZombie(z, head, by, x, y, zz){
  z.state = 'dead'; z.deadT = 0; z.fallDir = Math.random() < 0.8 ? 1 : -1;
  if(by === PL){ G.kills++; SAVE.kills++; if(head) G.heads++; sfx('kill'); }
  else if(by && by.def){ G.botKills++; if(Math.random() < 0.08) say(by, 'kill'); }
  if(head){ z.rig.head.visible = false; W.goo(x, y, zz, 0, 1, 0, 18, true); }
  if(z.type === 'bloater') explode(z.x, z.z, ZT.bloater.blast.r, 160, by, true);
}
function damageNest(n, dmg, x, y, z){
  if(n.dead) return;
  n.hp -= dmg; W.pinkGoo(x, y, z, 5); n.hit = 0.15;
  if(n.hp <= 0){ n.dead = true; W.explosion(n.x, 0.6, n.z, 4, false); sfx('boom', { at:[n.x, n.z] }); W.remove(n.m); W.shake(0.3); toast('Nest destroyed'); }
}
function hurtMember(m, dmg, from){
  if(m.down || (G.god && m === PL)) return;
  m.hp -= dmg; m.hurtT = 0;
  if(m === PL){ sfx('hurt'); W.shake(0.3);
    const el = $('hitDir'), B = camBasis(), dx = from.x - PL.x, dz = from.z - PL.z, ang = Math.atan2(dx*B.rx + dz*B.rz, dx*B.fx + dz*B.fz);
    el.style.transform = 'translate(-50%,-50%) rotate(' + ang + 'rad)'; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  if(m.hp <= 0){ m.hp = 0; goDown(m); }
}
function goDown(m){
  m.down = true; m.bleed = ZD.PLAYER.bleed; m.reviveT = 0; sfx('down');
  if(m === PL){ G.downs++; G.trigger = false; PL.adsT = 0; PL.reloadT = 0; $('downWrap').classList.add('show'); }
  else say(m, 'down', true);
  if(standing().length === 0) failMission('The whole squad went down');
}
function revive(m, by){
  m.down = false; m.hp = m.maxHp*0.5; m.hurtT = 0; m.reviveT = 0; sfx('revive');
  if(m === PL) $('downWrap').classList.remove('show');
  if(by && by.def) say(by, 'revive', true); else if(m.def) say(m, 'revived', true);
}
function turnTo(o, yaw, dt, rate){ let d = yaw - o.yaw; while(d > Math.PI) d -= Math.PI*2; while(d < -Math.PI) d += Math.PI*2; o.yaw += clamp(d, -rate*dt, rate*dt); }
function updateZombie(z, dt){
  const d = ZT[z.type], s = d.scale;
  if(z.flinch > 0) z.flinch -= dt;
  if(z.state === 'dead'){ z.deadT += dt; W.animZombie(z.rig, z, dt); if(z.deadT > 3.4){ W.remove(z.rig.root); z.gone = true; } return; }
  z.groanT -= dt; if(z.groanT <= 0){ z.groanT = 4 + Math.random()*6; if(Math.hypot(z.x - PL.x, z.z - PL.z) < 30) sfx('groan', { at:[z.x, z.z], big:z.type === 'brute' }); }
  // the nearest squad member; downed ones only when nobody else is close
  let tg = PL, td = 1e9;
  for(const m of members()){ const dd = Math.hypot(m.x - z.x, m.z - z.z) + (m.down ? 6 : 0); if(dd < td){ td = dd; tg = m; } }
  z.target = tg; const pdx = tg.x - z.x, pdz = tg.z - z.z, pd = Math.hypot(pdx, pdz) || 0.01;
  z.moveSpeed = 0;
  if(G.over && z.state !== 'rise'){ z.state = 'chase'; z.atkPose = 0; }
  switch(z.state){
    case 'rise': z.riseT += dt; z.y = -1.7*Math.pow(1 - Math.min(1, z.riseT/1.2), 2); if(z.riseT >= 1.2){ z.y = 0; z.state = 'chase'; } break;
    case 'chase': {
      if(G.over) break;
      if(z.type === 'bloater' && pd < 1.8 && !tg.down){ z.state = 'fuse'; z.fuse = 0.8; break; }
      if(pd < 1.15 + (s - 1)*0.4){ z.state = 'attack'; z.atkT = 0; z.hitDone = false; break; }
      z.losT -= dt; if(z.losT <= 0){ z.losT = 0.25 + Math.random()*0.15; z.los = pd < 16 && segClear(z.x, z.z, tg.x, tg.z, 0.25, true); }
      let dx, dz; if(z.los){ dx = pdx/pd; dz = pdz/pd; } else { const fd = flowDir(z.x, z.z); if(fd){ dx = fd[0]; dz = fd[1]; } else { dx = pdx/pd; dz = pdz/pd; } }
      for(const o of G.zombies){ if(o === z || o.state === 'dead') continue; const ox = z.x - o.x, oz = z.z - o.z; if(Math.abs(ox) > 0.8 || Math.abs(oz) > 0.8) continue;
        const od = Math.hypot(ox, oz); if(od < 0.75 && od > 0.001){ dx += ox/od*0.6; dz += oz/od*0.6; } }
      const l = Math.hypot(dx, dz) || 1; moveZ(z, dx/l, dz/l, z.speed, dt); pushOut(z, 0.3*s, SOLID);
      z.stuckT += dt; if(z.stuckT > 1.5){ if(Math.hypot(z.x - z.lx, z.z - z.lz) < 0.3){ z.kx += (Math.random()-0.5)*3; z.kz += (Math.random()-0.5)*3; } z.stuckT = 0; z.lx = z.x; z.lz = z.z; }
      break; }
    case 'attack': {
      z.atkT += dt; const p = z.atkT/d.atk; z.atkPose = p < 0.55 ? p/0.55 : 1 - (p - 0.55)/0.45;
      turnTo(z, Math.atan2(-pdx, -pdz), dt, 7);
      if(!z.hitDone && p >= 0.55){ z.hitDone = true; if(pd < 1.7 + (s - 1)*0.4){ if(tg.down){ if(tg === PL) PL.bleed -= 3; } else hurtMember(tg, d.dmg, z); } }
      if(p >= 1){ z.state = 'chase'; z.atkPose = 0; }
      break; }
    case 'fuse': z.fuse -= dt; turnTo(z, Math.atan2(-pdx, -pdz), dt, 7); if(z.fuse <= 0){ z.hp = 0; killZombie(z, false, null, z.x, 1, z.z); } break;
  }
  z.rig.root.position.set(z.x, z.y, z.z); z.rig.root.rotation.y = z.yaw;
  W.animZombie(z.rig, z, dt);
}
function moveZ(z, dx, dz, speed, dt){
  z.x += dx*speed*dt + z.kx*dt; z.z += dz*speed*dt + z.kz*dt; z.kx *= Math.max(0, 1 - dt*8); z.kz *= Math.max(0, 1 - dt*8);
  z.moveSpeed = speed; if(Math.abs(dx) + Math.abs(dz) > 0.01) turnTo(z, Math.atan2(-dx, -dz), dt, 6);
}

// ---- bots ----------------------------------------------------------------------------------
const nearestTo = (list, p) => list.slice().sort((a, b)=>dist(a, p) - dist(b, p))[0];
function botGoalFor(b, idx){
  // 1) someone is down: the closest standing bot runs to help
  for(const m of members()){ if(!m.down || m === b) continue;
    const helper = nearestTo(BOTS.filter(o=>!o.down), m); if(helper === b) return { task:'revive', x:m.x, z:m.z, who:m }; }
  // 2) the mission needs hands
  const s = G.mission && G.mission.steps[G.step];
  if(s){
    if(s.type === 'collect' && idx < 2){ const free = G.items.filter(it=>!it.taken && dist(it, PL) < 36);
      if(free.length){ free.sort((a, c)=>dist(a, b) - dist(c, b)); const pick = free[Math.min(idx, free.length - 1)]; return { task:'collect', x:pick.x, z:pick.z, item:pick }; } }
    if(s.type === 'activate'){ const sw = nearestTo(G.switches.filter(w=>!w.done), PL);
      if(sw && dist(sw, PL) < 30){ const a = idx*2.1; return { task:'activate', x:sw.x + Math.cos(a)*1.3, z:sw.z + Math.sin(a)*1.3, sw }; } }
    if(s.type === 'evac' && G.st.started && dist({ x:s.at[0], z:s.at[1] }, PL) < 20){ const a = idx*2.1 + 0.5; return { task:'evac', x:s.at[0] + Math.cos(a)*3, z:s.at[1] + Math.sin(a)*3 }; }
  }
  // 3) stay with the player in a loose triangle behind them
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw), rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw), sl = b.def.slot;
  return { task:'follow', x:PL.x + rx*sl[0] - fx*sl[1], z:PL.z + rz*sl[0] - fz*sl[1] };
}
function botTarget(b){
  const s = G.mission && G.mission.steps[G.step];
  if(s && s.type === 'destroy'){ const n = nearestTo(G.nests.filter(x=>!x.dead), b);
    if(n && dist(n, b) < 24 && segClear(b.x, b.z, n.x, n.z, 0.05, false) && !G.zombies.some(z=>z.state !== 'dead' && z.state !== 'rise' && (dist(z, b) < 6 || dist(z, PL) < 4))) return { nest:n }; }
  let best = null, score = 1e9;
  for(const z of G.zombies){ if(z.state === 'dead' || (z.state === 'rise' && z.riseT < 0.8)) continue;
    const d = Math.hypot(z.x - b.x, z.z - b.z); if(d > 21) continue;
    let sc = d; if(z.target === PL && Math.hypot(z.x - PL.x, z.z - PL.z) < 4) sc -= 8; if(z.target && z.target.down) sc -= 6; if(z.type === 'bloater' && d < 5) sc += 20;
    if(sc < score && segClear(b.x, b.z, z.x, z.z, 0.05, false)){ score = sc; best = z; } }
  if(best) return { z:best };
  if(s && s.type === 'destroy') for(const n of G.nests){ if(!n.dead && dist(n, b) < 26 && segClear(b.x, b.z, n.x, n.z, 0.05, false)) return { nest:n }; }
  return null;
}
function updateBot(b, idx, dt){
  b.sayT -= dt; b.nadeCool -= dt;
  if(b.down){ W.animSoldier(b.rig, { down:true }, dt); b.rig.root.position.set(b.x, 0, b.z); return; }
  b.hurtT += dt; if(b.hurtT > 6 && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + 5*dt);
  // where to go
  b.pathT -= dt;
  if(b.pathT <= 0){ b.pathT = 0.5 + Math.random()*0.3; const goal = botGoalFor(b, idx);
    if(goal.task !== b.task && (goal.task === 'collect' || goal.task === 'activate')) say(b, 'use');
    b.task = goal.task; b.goal = goal;
    b.path = Math.hypot(goal.x - b.x, goal.z - b.z) > 1.2 && !segClear(b.x, b.z, goal.x, goal.z, 0.3, true) ? findPath(b.x, b.z, goal.x, goal.z) : [[goal.x, goal.z]]; }
  let mvx = 0, mvz = 0, speed = 0;
  if(b.path && b.path.length){ const [tx, tz] = b.path[0], dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    const near = b.path.length === 1 ? (b.task === 'follow' ? 1.0 : 0.35) : 0.6;
    if(d < near) b.path.shift();
    else { const far = dist(PL, b); speed = (b.task === 'follow' && far > 9) || b.task === 'revive' || b.task === 'collect' && d > 6 ? ZD.PLAYER.sprint*0.95 : ZD.PLAYER.walk*0.95;
      mvx = dx/d; mvz = dz/d; } }
  // keep a little apart from everyone else
  for(const o of members()){ if(o === b) continue; const ox = b.x - o.x, oz = b.z - o.z, od = Math.hypot(ox, oz); if(od < 1.1 && od > 0.001){ mvx += ox/od*0.8; mvz += oz/od*0.8; if(!speed) speed = 1.5; } }
  const ml = Math.hypot(mvx, mvz);
  if(ml > 0.01){ b.x += mvx/ml*speed*dt; b.z += mvz/ml*speed*dt; } pushOut(b, 0.38, SOLID);
  b.moving = speed > 0.1 && ml > 0.01;
  b.stuckT += dt; if(b.stuckT > 1.2){ if(b.moving && Math.hypot(b.x - b.lx, b.z - b.lz) < 0.3) b.pathT = 0; b.stuckT = 0; b.lx = b.x; b.lz = b.z; }
  // task work
  const g = b.goal, reviving = g && g.task === 'revive' && g.who.down && dist(g.who, b) < 1.5;
  if(reviving){ g.who.reviveT += dt; if(g.who.reviveT >= (b.def.medic ? 2 : ZD.PLAYER.revive)) revive(g.who, b); }
  if(g && g.task === 'collect' && !g.item.taken && dist(g.item, b) < 1.3){ takeItem(g.item, b); b.pathT = 0; }
  // combat
  b.fireT -= dt; if(b.reloadT > 0){ b.reloadT -= dt; if(b.reloadT <= 0) b.mag = WEAP[b.def.weapon].mag; }
  b.aimT -= dt; if(b.aimT <= 0){ b.aimT = 0.2; b.target = botTarget(b); }
  if(b.target && ((b.target.z && b.target.z.state === 'dead') || (b.target.nest && b.target.nest.dead))) b.target = null;
  let faceYaw = ml > 0.01 && speed > 2 ? Math.atan2(-mvx, -mvz) : b.yaw;
  if(b.target && !reviving){
    const t = b.target.z || b.target.nest; faceYaw = Math.atan2(-(t.x - b.x), -(t.z - b.z));
    let dy = faceYaw - b.yaw; while(dy > Math.PI) dy -= Math.PI*2; while(dy < -Math.PI) dy += Math.PI*2;
    if(Math.abs(dy) < 0.35 && b.fireT <= 0 && b.reloadT <= 0) botShoot(b, b.target);
    // a grenade into a crowd that is not on top of a friend
    if(b.target.z && b.nadeCool <= 0){ let n = 0; for(const z of G.zombies) if(z.state !== 'dead' && Math.hypot(z.x - t.x, z.z - t.z) < 4) n++;
      if(n >= 5 && dist(t, b) > 7 && members().every(m=>dist(m, t) > 6)){ throwNade(b, t.x, t.z); b.nadeCool = 14 + Math.random()*8; } }
  }
  turnTo(b, faceYaw, dt, 9);
  b.rig.root.position.set(b.x, 0, b.z); b.rig.root.rotation.y = b.yaw;
  W.animSoldier(b.rig, { moving:b.moving, sprint:speed > ZD.PLAYER.walk, pitch:0, reload:b.reloadT, recoil:Math.max(0, b.fireT - 0.1)*0.4 }, dt);
}
// bots roll for hits instead of tracing rays; they fire slower and weaker than the player so the player stays the star
function botShoot(b, tg){
  const wd = WEAP[b.def.weapon]; b.mag--; b.fireT = wd.rate*(wd.pellets > 1 ? 1.6 : (wd.auto ? 3.6 : 2)) + Math.random()*0.08;
  if(b.mag <= 0){ b.reloadT = wd.reload; if(Math.random() < 0.5) say(b, 'reload'); }
  const t = tg.z || tg.nest, d = Math.max(0.5, Math.hypot(t.x - b.x, t.z - b.z));
  b.rig.root.updateMatrixWorld(true); b.rig.muzzle.getWorldPosition(_mz); const mp = _mz;
  W.botFlash(mp.x, mp.y, mp.z); sfx(wd.sound, { at:[b.x, b.z], vol:0.45 });
  let chance = b.def.acc*clamp(1.2 - d/28, 0.25, 1); if(tg.z && tg.z.type === 'runner') chance *= 0.8; if(tg.nest) chance = 0.85;
  let hits = 0; for(let p=0; p<wd.pellets; p++) if(Math.random() < (wd.pellets > 1 ? (d < wd.range*0.6 ? 0.55 : 0.25) : chance)) hits++;
  const ty = tg.z ? 1.2*ZT[tg.z.type].scale : 0.9;
  if(hits > 0){
    if(tg.z){ const head = wd.pellets === 1 && Math.random() < 0.18; damageZombie(tg.z, wd.dmg*hits*(head ? wd.headMul : 1)*0.5, head, t.x, ty + (head ? 0.4 : 0), t.z, (t.x - b.x)/d, (t.z - b.z)/d, b); }
    else damageNest(tg.nest, wd.dmg*hits*0.6, t.x, 1, t.z);
    W.tracer(mp.x, mp.y, mp.z, t.x, ty, t.z, 0xffd28a);
  } else W.tracer(mp.x, mp.y, mp.z, t.x + (Math.random()-0.5)*2.5, ty + (Math.random()-0.5)*1.5, t.z + (Math.random()-0.5)*2.5, 0xffd28a);
}

// ---- the player ---------------------------------------------------------------------------
function updatePlayer(dt){
  const k = G.keys;
  let ix = 0, iz = 0;
  if(G.joy.on){ ix = G.joy.x; iz = -G.joy.y; }
  if(k.KeyW || k.ArrowUp) iz += 1; if(k.KeyS || k.ArrowDown) iz -= 1; if(k.KeyA || k.ArrowLeft) ix -= 1; if(k.KeyD || k.ArrowRight) ix += 1;
  if(G.autoMove){ ix = G.autoMove[0]; iz = G.autoMove[1]; }
  const il = Math.hypot(ix, iz); if(il > 1){ ix /= il; iz /= il; }
  PL.moving = il > 0.12 && !PL.down;
  const wantAds = (G.adsHeld || G.adsToggle) && !PL.down;
  const sprintIn = (k.ShiftLeft || k.ShiftRight || G.sprintBtn || (G.joy.on && il > 0.97)) && iz > 0.3;
  PL.sprint = sprintIn && !wantAds && !G.trigger && PL.reloadT <= 0 && PL.meleeT <= 0 && !PL.down;
  PL.adsT = clamp(PL.adsT + (wantAds && !PL.sprint ? dt : -dt)*7, 0, 1);
  const sp = PL.sprint ? ZD.PLAYER.sprint : lerp(ZD.PLAYER.walk, ZD.PLAYER.ads, PL.adsT);
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw), rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw);
  const tvx = (fx*iz + rx*ix)*sp, tvz = (fz*iz + rz*ix)*sp, a = 1 - Math.exp(-dt*14);
  PL.vx += (tvx - PL.vx)*a; PL.vz += (tvz - PL.vz)*a;
  if(!PL.down){ PL.x += PL.vx*dt; PL.z += PL.vz*dt; }
  for(const z of G.zombies){ if(z.state === 'dead' || z.state === 'rise') continue; const s = ZT[z.type].scale;
    const dx = PL.x - z.x, dz = PL.z - z.z, d = Math.hypot(dx, dz), m = 0.36 + 0.3*s; if(d < m && d > 0.001){ PL.x += dx/d*(m - d)*0.7; PL.z += dz/d*(m - d)*0.7; z.x -= dx/d*(m - d)*0.3; z.z -= dz/d*(m - d)*0.3; } }
  pushOut(PL, ZD.PLAYER.radius, SOLID);
  PL.fireT -= dt; PL.meleeCool -= dt; PL.nadeCool -= dt; if(PL.meleeT > 0) PL.meleeT -= dt; if(PL.swapT > 0) PL.swapT -= dt;
  if(PL.reloadT > 0){ PL.reloadT -= dt; if(PL.reloadT <= 0){ PL.reloadT = 0; finishReload(); } }
  PL.kick *= Math.exp(-dt*9); PL.kickYaw *= Math.exp(-dt*9); PL.bloom *= Math.exp(-dt*5); PL.recoil = Math.max(0, PL.recoil - dt);
  const w = curW();
  if(w && !PL.down){ const d = WEAP[w.id];
    if(G.trigger && (d.auto || G.triggerPressed)) fire();
    G.triggerPressed = false;
    if(w.mag === 0 && w.res > 0 && PL.reloadT <= 0 && !G.trigger && PL.fireT < -0.25) startReload(); }
  if(PL.down){ PL.bleed -= dt; if(PL.bleed <= 0) failMission('You bled out before help arrived'); }
  else { PL.hurtT += dt; if(PL.hurtT > ZD.PLAYER.regenDelay && PL.hp < PL.maxHp) PL.hp = Math.min(PL.maxHp, PL.hp + ZD.PLAYER.regen*dt); }
  if(buttonsMode() && SAVE.assist && (G.trigger || PL.adsT > 0.5) && !PL.down) aimAssist(dt);
  PL.rig.root.position.set(PL.x, 0, PL.z); PL.rig.root.rotation.y = PL.yaw;
  W.animSoldier(PL.rig, { moving:PL.moving, sprint:PL.sprint, back:iz < -0.2, pitch:PL.pitch, ads:PL.adsT > 0.5, reload:PL.reloadT, swap:PL.swapT, melee:PL.meleeT, recoil:PL.recoil, down:PL.down }, dt);
}
// with buttons, holding FIRE (or AIM) pulls the view onto the closest zombie near the crosshair
function aimAssist(dt){
  const B = camBasis(), cam = W.camera; let best = null, ba = TOUCH ? 0.3 : 0.22;
  for(const z of G.zombies){ if(z.state === 'dead' || z.state === 'rise') continue; if(Math.hypot(z.x - PL.x, z.z - PL.z) > 30) continue;
    refreshRig(z); z.rig.headMesh.getWorldPosition(_hv);
    const dx = _hv.x - cam.position.x, dy = _hv.y - 0.4 - cam.position.y, dz = _hv.z - cam.position.z, d = Math.hypot(dx, dy, dz);
    const ang = Math.acos(clamp((dx*B.fx + dy*B.fy + dz*B.fz)/d, -1, 1)); if(ang < ba){ ba = ang; best = { dx, dy, dz, d }; } }
  if(!best) return;
  const yaw = Math.atan2(-best.dx, -best.dz), pitch = Math.asin(best.dy/best.d);
  let dy = yaw - PL.yaw; while(dy > Math.PI) dy -= Math.PI*2; while(dy < -Math.PI) dy += Math.PI*2;
  const rate = (PL.adsT > 0.5 ? 2.8 : 2.0)*dt; PL.yaw += clamp(dy, -rate, rate); PL.pitch += clamp(pitch - PL.pitch, -rate, rate);
}

// ---- interactions -------------------------------------------------------------------------
function findInteract(){
  if(PL.down) return null;
  let best = null, bd = 9;
  for(const b of BOTS){ if(!b.down) continue; const d = dist(b, PL); if(d < 1.8 && d < bd){ bd = d; best = { kind:'revive', who:b }; } }
  if(best) return best;
  for(const [x, z] of TOWN.ammo){ const d = Math.hypot(x - PL.x, z - PL.z); if(d < 1.8 && d < bd){ bd = d; best = { kind:'ammo' }; } }
  const s = G.mission && G.mission.steps[G.step];
  if(s && s.type === 'activate') for(const sw of G.switches){ if(sw.done) continue; const d = dist(sw, PL); if(d < s.r && d < bd){ bd = d; best = { kind:'activate', sw }; } }
  return best;
}
function useInteract(dt){
  const it = G.interact; if(!it) return;
  if(it.kind === 'revive' && G.useHeld){ it.who.reviveT += dt; if(it.who.reviveT >= ZD.PLAYER.revive) revive(it.who, PL); }
  if(it.kind === 'ammo' && G.usePressed){ let any = false;
    PL.weapons.forEach(w=>{ const d = WEAP[w.id]; if(w.res !== Infinity && w.res < d.reserve){ w.res = d.reserve; any = true; } });
    if(PL.nades < ZD.GRENADE.max){ PL.nades = ZD.GRENADE.max; any = true; }
    toast(any ? 'Ammo and grenades refilled' : 'You are fully stocked'); if(any) sfx('pickup'); updateHud(true); }
}

// ---- missions -----------------------------------------------------------------------------
function clearMission(){
  G.zombies.forEach(z=>W.remove(z.rig.root)); G.zombies = [];
  G.items.forEach(i=>W.remove(i.m)); G.items = []; G.nests.forEach(n=>W.remove(n.m)); G.nests = []; G.switches.forEach(s=>W.remove(s.m)); G.switches = [];
  G.grenades.forEach(g=>W.remove(g.m)); G.grenades = [];
  if(G.marker){ W.remove(G.marker); G.marker = null; } if(G.evac){ W.remove(G.evac); G.evac = null; } if(G.heli){ W.remove(G.heli.m); G.heli = null; }
  if(G.survivor){ W.remove(G.survivor.rig.root); G.survivor = null; }
  rotorSound(false);
}
function startMission(i){
  clearMission(); clearMenuZombies();
  const M = ZD.MISSIONS[i]; G.mi = i; G.mission = M;
  Object.assign(G, { phase:'play', paused:false, over:false, t:0, slow:1, step:-1, st:null, kills:0, botKills:0, heads:0, downs:0, horde:0, hordeT:0, spawnT:3,
    interact:null, ap:null, autoMove:null, trigger:false, adsHeld:false, adsToggle:false, sprintBtn:false, useHeld:false });
  Object.assign(PL, { x:M.start.x, z:M.start.z, vx:0, vz:0, yaw:M.start.yaw, pitch:-0.08, hp:PL.maxHp, hurtT:99, weapons:[], cur:0, fireT:0, reloadT:0, swapT:0,
    meleeT:0, meleeCool:0, adsT:0, kick:0, kickYaw:0, bloom:0, recoil:0, down:false, bleed:0, reviveT:0, nades:ZD.GRENADE.start, nadeCool:0 });
  PL.rig.root.visible = true; PL.rig.body.rotation.x = 0; PL.rig.body.position.y = 0;
  giveWeapon('pistol'); giveWeapon('rifle'); PL.swapT = 0;
  makeBots();
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw), rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw);
  BOTS.forEach(b=>{ const s = b.def.slot; b.x = PL.x + rx*s[0] - fx*s[1]; b.z = PL.z + rz*s[0] - fz*s[1]; b.yaw = PL.yaw; });
  feedQ = []; renderFeed(); $('bAim').classList.remove('lock');
  $('app').classList.remove('menu'); $('app').classList.add('play');
  ['menu','missWrap','overWrap','winWrap','pauseWrap','setWrap','howWrap','downWrap','clickWrap'].forEach(id=>$(id).classList.remove('show'));
  $('hurt').style.opacity = 0;
  updateFlow(); nextStep(); updateCamera(1);
  banner('MISSION ' + (i + 1), M.name, 4, M.brief);
  updateHud(true); renderSquad();
  if(typeof window.onGameplayStart === 'function') window.onGameplayStart();
  if(!buttonsMode()) requestLock();
}
function nextStep(){
  const M = G.mission;
  if(G.marker){ W.remove(G.marker); G.marker = null; }
  G.step++;
  if(G.step >= M.steps.length){ winMission(); return; }
  const s = M.steps[G.step]; G.st = { type:s.type, done:0, need:1, waitT:0, started:false, landed:false };
  if(s.type === 'reach'){ G.marker = W.makeEvac(); G.marker.scale.setScalar(s.r/8); G.marker.position.set(s.at[0], 0, s.at[1]); }
  if(s.type === 'collect'){ G.st.need = s.count; for(const [x, z] of s.spots){ const m = W.makeItem(s.item); m.position.set(x, 0, z); G.items.push({ x, z, m, taken:false, kind:s.item }); } }
  if(s.type === 'activate'){ const pts = s.multi || [s.at]; G.st.need = pts.length;
    for(const [x, z] of pts){ const m = W.makeSwitch(); m.position.set(x, 0, z); G.switches.push({ x, z, m, prog:0, done:false, started:false }); } }
  if(s.type === 'destroy'){ G.st.need = s.count; for(const [x, z] of s.spots){ const m = W.makeNest(); m.position.set(x, 0, z); G.nests.push({ x, z, m, hp:s.nestHp, maxHp:s.nestHp, dead:false, spawnT:3, hit:0, seen:false }); } }
  if(s.type === 'rescue'){ const rig = W.makeSurvivor(); G.survivor = { rig, x:s.at[0], z:s.at[1], yaw:0, follow:false, path:null, pathT:0 }; rig.root.position.set(s.at[0], 0, s.at[1]); }
  if(s.type === 'evac'){ G.evac = W.makeEvac(); G.evac.position.set(s.at[0], 0, s.at[1]); }
  if(G.step > 0){ sfx('objective'); banner('NEW OBJECTIVE', s.text, 2.6); }
  updateHud(true);
}
function stepProgressText(){
  const s = G.mission && G.mission.steps[G.step], st = G.st; if(!s || !st) return '';
  if(s.type === 'collect' || s.type === 'destroy' || (s.type === 'activate' && st.need > 1)) return st.done + ' / ' + st.need;
  if(s.type === 'evac' && st.landed) return 'Get in!';
  if(s.type === 'evac' && st.started) return 'Chopper in ' + Math.ceil(st.waitT) + 's';
  return '';
}
function takeItem(it, by){
  if(it.taken) return; it.taken = true; W.remove(it.m); G.st.done++; sfx('pickup'); W.burst(it.x, 0.6, it.z, it.kind === 'fuel' ? 0xff8a3a : 0xffffff, 18);
  if(by !== PL) say(by, 'grab', true);
  toast((by === PL ? 'You' : by.name) + ' picked up ' + (it.kind === 'fuel' ? 'a fuel can' : 'a medkit') + '  ·  ' + G.st.done + '/' + G.st.need);
  updateHud(true);
}
function updateMission(dt){
  const s = G.mission.steps[G.step], st = G.st; if(!s || !st) return;
  if(s.type === 'reach'){ if(Math.hypot(PL.x - s.at[0], PL.z - s.at[1]) < s.r) nextStep(); return; }
  if(s.type === 'collect'){
    for(const it of G.items){ if(it.taken) continue; if(!PL.down && dist(it, PL) < 1.4) takeItem(it, PL); else it.m.rotation.y += dt*1.5; }
    if(st.done >= st.need){ G.items.forEach(it=>{ if(!it.taken){ W.remove(it.m); it.taken = true; } }); nextStep(); } return; }
  if(s.type === 'activate'){
    for(const sw of G.switches){ if(sw.done) continue;
      const n = standing().filter(m=>dist(m, sw) < s.r).length;
      if(n > 0){ if(!sw.started){ sw.started = true; G.horde += s.horde || 0; sfx('horde'); say(BOTS.find(o=>!o.down), 'horde', true); }
        sw.prog = Math.min(1, sw.prog + dt*(0.6 + 0.2*n)/s.time); }
      else sw.prog = Math.max(0, sw.prog - dt*0.04);
      if(sw.prog >= 1){ sw.done = true; st.done++; W.switchOn(sw.m); sfx('objective'); toast((s.label || 'SWITCH') + ' ONLINE  ·  ' + st.done + '/' + st.need); } }
    if(st.done >= st.need) nextStep(); return; }
  if(s.type === 'destroy'){
    for(const n of G.nests){ if(n.dead) continue; n.hit = Math.max(0, n.hit - dt); const pulse = 1 + Math.sin(G.t*4)*0.05 + n.hit; n.m.userData.core.scale.set(pulse, 0.8*pulse, pulse);
      const d = dist(n, PL);
      if(d < 30 && !n.seen){ n.seen = true; say(BOTS.find(o=>!o.down), 'nest', true); }
      n.spawnT -= dt; if(n.spawnT <= 0 && d < 45 && aliveZ() < zCap() + 4){ n.spawnT = 6 + Math.random()*3;
        const a = Math.random()*6.28; spawnZombie(Math.random() < 0.3 ? 'runner' : 'walker', n.x + Math.cos(a)*2, n.z + Math.sin(a)*2); } }
    st.done = G.nests.filter(n=>n.dead).length; if(st.done >= st.need) nextStep(); return; }
  if(s.type === 'rescue'){ const sv = G.survivor; if(!PL.down && dist(sv, PL) < s.r + 1){ sv.follow = true; toast('Survivor found — keep her close'); nextStep(); } return; }
  if(s.type === 'evac'){
    const inRing = m => Math.hypot(m.x - s.at[0], m.z - s.at[1]) < s.r;
    if(!st.started && inRing(PL)){ st.started = true; st.waitT = s.wait; G.horde += 10 + G.mission.intensity*4; sfx('horde'); say(BOTS.find(o=>!o.down), 'horde', true);
      const h = W.makeHeli(); G.heli = { m:h }; h.position.set(s.at[0] + 40, 30, s.at[1] + 60); rotorSound(true); banner('HOLD THE EVAC ZONE', 'Chopper inbound', 2.4); }
    if(st.started && !st.landed){ st.waitT -= dt; if(st.waitT <= 0){ st.waitT = 0; st.landed = true; banner('CHOPPER IS DOWN', 'GET IN!', 2); sfx('objective'); } }
    if(G.heli){ const k = st.landed ? 1 : clamp(1 - st.waitT/s.wait, 0, 1), e = 1 - Math.pow(1 - k, 2), h = G.heli.m;
      h.position.set(lerp(s.at[0] + 40, s.at[0] + 2, e), lerp(30, 0.1, e*e), lerp(s.at[1] + 60, s.at[1] + 5, e)); h.rotation.y = Math.PI*0.85;
      h.userData.rotor.rotation.y += dt*30; if(rotor) rotor.g.gain.value = 0.25 + e*0.35; }
    if(st.landed && !PL.down && inRing(PL) && (!s.escort || (G.survivor && inRing(G.survivor)))) nextStep();
  }
}
function updateSurvivor(dt){
  const sv = G.survivor; if(!sv) return;
  let moving = false;
  if(sv.follow){ const d = dist(PL, sv);
    sv.pathT -= dt; if(sv.pathT <= 0){ sv.pathT = 0.6; sv.path = d > 3 && !segClear(sv.x, sv.z, PL.x, PL.z, 0.3, true) ? findPath(sv.x, sv.z, PL.x, PL.z) : null; }
    let tx = PL.x, tz = PL.z; if(sv.path && sv.path.length){ [tx, tz] = sv.path[0]; if(Math.hypot(tx - sv.x, tz - sv.z) < 0.6) sv.path.shift(); }
    const dx = tx - sv.x, dz = tz - sv.z, dl = Math.hypot(dx, dz);
    if(d > 2.6 && dl > 0.05){ const sp = d > 8 ? ZD.PLAYER.sprint : ZD.PLAYER.walk; sv.x += dx/dl*sp*dt; sv.z += dz/dl*sp*dt; moving = true; turnTo(sv, Math.atan2(-dx, -dz), dt, 8); }
    pushOut(sv, 0.38, SOLID); }
  else sv.yaw += dt*0.3;
  sv.rig.root.position.set(sv.x, 0, sv.z); sv.rig.root.rotation.y = sv.yaw; W.animSurvivor(sv.rig, moving, dt);
}
function statsHtml(rows){ return rows.map(([l, v])=>'<div><b>' + v + '</b><span>' + l + '</span></div>').join(''); }
function winMission(){
  G.phase = 'over'; G.over = true; rotorSound(false);
  const M = G.mission, time = Math.round(G.t);
  const stars = G.downs === 0 && time <= M.par ? 3 : (G.downs <= 1 || time <= M.par*1.3 ? 2 : 1);
  SAVE.stars[M.id] = Math.max(SAVE.stars[M.id] || 0, stars); SAVE.unlocked = Math.max(SAVE.unlocked, Math.min(ZD.MISSIONS.length, G.mi + 2)); persist();
  sfx('objective'); $('downWrap').classList.remove('show');
  $('wSub').textContent = M.name;
  $('wStars').innerHTML = [1,2,3].map(i=>'<span class="' + (i <= stars ? 'on' : '') + '">★</span>').join('');
  $('wStats').innerHTML = statsHtml([['Time', Math.floor(time/60) + ':' + String(time%60).padStart(2,'0')], ['Kills', G.kills], ['Headshots', G.heads], ['Downs', G.downs]]);
  const last = G.mi + 1 >= ZD.MISSIONS.length;
  $('wNext').style.display = last ? 'none' : ''; $('wReplay').classList.toggle('main', last);
  $('wNote').textContent = last ? 'You finished every mission. More are coming.' : 'Next: ' + ZD.MISSIONS[G.mi + 1].name + '  ·  3★ = no downs under ' + Math.round(M.par/60) + ' min';
  setTimeout(()=>{ if(G.phase === 'over'){ $('winWrap').classList.add('show'); if(document.pointerLockElement) document.exitPointerLock(); } }, 900);
  if(typeof window.onGameplayStop === 'function') window.onGameplayStop();
}
function failMission(reason){
  if(G.over) return; G.over = true; G.phase = 'over'; G.slow = 0.35; rotorSound(false); sfx('fail');
  $('oSub').textContent = reason;
  $('oStats').innerHTML = statsHtml([['Objective', (G.step + 1) + ' / ' + G.mission.steps.length], ['Kills', G.kills], ['Headshots', G.heads], ['Time', Math.round(G.t) + 's']]);
  setTimeout(()=>{ if(G.phase === 'over'){ $('overWrap').classList.add('show'); $('downWrap').classList.remove('show'); if(document.pointerLockElement) document.exitPointerLock(); } }, 1400);
  if(typeof window.onGameplayStop === 'function') window.onGameplayStop();
}

// ---- HUD ------------------------------------------------------------------------------------
let lastHud = '', lastSquad = '';
function updateHud(force){
  const w = curW(); if(!w || !G.mission) return; const d = WEAP[w.id], s = G.mission.steps[G.step];
  const prog = stepProgressText();
  const sig = [G.step, w.id, w.mag, w.res, Math.round(PL.hp), PL.nades, prog].join('|');
  if(!force && sig === lastHud) return; lastHud = sig;
  $('objMission').textContent = 'MISSION ' + (G.mi + 1) + ' · ' + G.mission.name; $('objText').textContent = s ? s.text : 'Mission complete'; $('objProg').textContent = prog;
  $('wName').textContent = d.name.toUpperCase(); $('ammoMag').textContent = w.mag; $('ammoRes').textContent = w.res === Infinity ? '∞' : w.res;
  $('ammoMag').classList.toggle('low', w.mag <= Math.ceil(d.mag*0.25));
  $('hpFill').style.width = Math.max(0, PL.hp/PL.maxHp*100) + '%'; $('nades').textContent = PL.nades;
  $('nadeCnt').textContent = PL.nades; $('bNade').classList.toggle('empty', PL.nades <= 0);
  $('swapTo').textContent = WEAP[PL.weapons[(PL.cur + 1) % PL.weapons.length].id].model.toUpperCase();
}
function renderSquad(){
  const sig = BOTS.map(b=>b.down + ':' + Math.round(b.hp/b.maxHp*20)).join('|'); if(sig === lastSquad) return; lastSquad = sig;
  $('squad').innerHTML = BOTS.map(b=>'<div class="sq' + (b.down ? ' down' : '') + '"><b style="color:' + b.def.css + '">' + b.name + '</b><i><u style="width:' + Math.round(b.hp/b.maxHp*100) + '%;background:' + b.def.css + '"></u></i>' + (b.down ? '<em>DOWN</em>' : '') + '</div>').join('');
}
let _wv = null;
function objectiveTarget(){
  const s = G.mission && G.mission.steps[G.step]; if(!s) return null;
  const downBot = BOTS.find(b=>b.down && dist(b, PL) < 25); if(downBot && !PL.down) return { x:downBot.x, z:downBot.z, label:'REVIVE ' + downBot.name, help:true };
  if(s.type === 'reach' || s.type === 'evac') return { x:s.at[0], z:s.at[1], label:s.type === 'evac' ? 'EVAC' : 'GO HERE' };
  if(s.type === 'collect'){ const it = nearestTo(G.items.filter(i=>!i.taken), PL); if(it) return { x:it.x, z:it.z, label:s.item === 'fuel' ? 'FUEL' : 'MEDKIT' }; }
  if(s.type === 'activate'){ const sw = nearestTo(G.switches.filter(w=>!w.done), PL); if(sw) return { x:sw.x, z:sw.z, label:s.label || 'USE' }; }
  if(s.type === 'destroy'){ const n = nearestTo(G.nests.filter(x=>!x.dead), PL); if(n) return { x:n.x, z:n.z, label:'NEST' }; }
  if(s.type === 'rescue' && G.survivor) return { x:G.survivor.x, z:G.survivor.z, label:'SURVIVOR' };
  return null;
}
function waypoint(){
  const el = $('wp'), tg = G.over ? null : objectiveTarget();
  if(!tg){ el.style.display = 'none'; return; }
  el.style.display = 'block'; el.classList.toggle('help', !!tg.help);
  if(!_wv) _wv = new THREE.Vector3(); const v = _wv.set(tg.x, 2.4, tg.z); v.project(W.camera);
  const vw = innerWidth, vh = innerHeight, behind = v.z > 1;
  let x = (v.x*0.5 + 0.5)*vw, y = (-v.y*0.5 + 0.5)*vh; if(behind){ x = vw - x; y = vh*0.9; }
  const mx = 40, top = 110, bot = 70, cx = vw/2, cy = vh/2;
  const out = behind || x < mx || x > vw - mx || y < top || y > vh - bot;
  if(out){ const dx = x - cx, dy = y - cy, k = Math.min(dx > 0 ? (vw - mx - cx)/dx : (dx < 0 ? (mx - cx)/dx : 1e9), dy > 0 ? (vh - bot - cy)/dy : (dy < 0 ? (top - cy)/dy : 1e9));
    if(k < 1){ x = cx + dx*k; y = cy + dy*k; }
    $('wpArrow').style.display = 'block'; $('wpArrow').style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)'; }
  else $('wpArrow').style.display = 'none';
  el.style.transform = 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px)';
  $('wpLabel').textContent = tg.label; $('wpDist').textContent = Math.round(Math.hypot(tg.x - PL.x, tg.z - PL.z)) + ' m';
}
function updateHudFrame(dt){
  const w = curW(); if(!w) return; const d = WEAP[w.id];
  const sp = lerp(d.spreadHip, d.spreadAds, PL.adsT)*(PL.moving ? 1.3 : 1) + PL.bloom;
  $('xhair').style.setProperty('--g', (4 + sp*520).toFixed(1) + 'px'); $('xhair').classList.toggle('hide', PL.sprint || PL.down);
  $('hurt').style.opacity = PL.down ? 0.9 : Math.min(0.85, (1 - PL.hp/PL.maxHp)*1.1).toFixed(2);
  const it = G.over ? null : G.interact, pr = $('prompt'), use = $('bUse');
  if(it){ let txt = '';
    if(it.kind === 'revive') txt = (buttonsMode() ? 'Hold USE' : 'Hold E') + ' to revive ' + it.who.name;
    else if(it.kind === 'ammo') txt = (buttonsMode() ? 'Tap USE' : 'Press E') + ' for ammo and grenades';
    else txt = 'Hold the circle, the squad speeds it up';
    $('promptText').textContent = txt; pr.classList.add('show'); use.classList.toggle('show', it.kind !== 'activate');
    const p = it.kind === 'revive' ? it.who.reviveT/ZD.PLAYER.revive : (it.kind === 'activate' ? it.sw.prog : 0);
    $('promptRing').style.display = it.kind === 'ammo' ? 'none' : 'block'; $('promptRing').style.setProperty('--p', (p*100).toFixed(0) + '%');
  } else { pr.classList.remove('show'); use.classList.remove('show'); }
  // the objective card shows a progress bar while something is charging
  const s = G.mission && G.mission.steps[G.step], bar = $('objBar');
  let bp = -1;
  if(s && s.type === 'activate'){ const sw = G.switches.find(x=>!x.done && x.prog > 0); if(sw) bp = sw.prog; }
  else if(s && s.type === 'evac' && G.st.started) bp = G.st.landed ? 1 : 1 - G.st.waitT/s.wait;
  bar.style.display = bp >= 0 ? 'block' : 'none'; if(bp >= 0) bar.firstElementChild.style.width = (bp*100).toFixed(1) + '%';
  if(PL.down){ $('bleedFill').style.width = (PL.bleed/ZD.PLAYER.bleed*100) + '%';
    const helper = nearestTo(BOTS.filter(b=>!b.down), PL);
    $('downSub').textContent = helper ? (PL.reviveT > 0 ? helper.name + ' is pulling you up  ·  ' + Math.round(PL.reviveT/ZD.PLAYER.revive*100) + '%' : helper.name + ' is coming to help you') : 'Nobody can reach you'; }
  const rb = $('reloadBar'); if(PL.reloadT > 0){ rb.classList.add('show'); rb.firstElementChild.style.width = ((1 - PL.reloadT/d.reload)*100) + '%'; } else rb.classList.remove('show');
  if(feedQ.length){ let fading = false; for(const f of feedQ){ f.t -= dt; if(f.t < 1) fading = true; } if(fading){ feedQ = feedQ.filter(f=>f.t > 0); renderFeed(); } }
  waypoint();
}
let bannerTimer = 0;
function banner(top, main, time, sub){
  $('bannerTop').textContent = top; $('bannerMain').textContent = main; $('bannerSub').textContent = sub || '';
  const b = $('banner'); b.classList.toggle('long', main.length > 14); b.style.animationDuration = (time || 2.5) + 's';
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); clearTimeout(bannerTimer); bannerTimer = setTimeout(()=>b.classList.remove('show'), (time || 2.5)*1000);
}
let toastT = 0;
function toast(t){ const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(()=>el.classList.remove('show'), 2400); }

// ---- input ------------------------------------------------------------------------------------
function requestLock(){
  const c = W.renderer.domElement; if(buttonsMode() || !c.requestPointerLock) return;
  try{ const p = c.requestPointerLock(); if(p && p.catch) p.catch(()=>showClick()); }catch(e){ showClick(); }
  setTimeout(()=>{ if(!document.pointerLockElement) showClick(); }, 300);
}
function showClick(){ if(G.phase === 'play' && !G.over && !G.paused && !G.adPaused && !buttonsMode()) $('clickWrap').classList.add('show'); }
function setPaused(on){
  if(G.phase !== 'play' || G.over || G.paused === on) return; G.paused = on; $('pauseWrap').classList.toggle('show', on); $('clickWrap').classList.remove('show');
  if(on){ G.trigger = false; G.adsHeld = false; G.sprintBtn = false; G.useHeld = false; if(document.pointerLockElement) document.exitPointerLock(); if(typeof window.onGameplayStop === 'function') window.onGameplayStop(); }
  else { $('setWrap').classList.remove('show'); if(typeof window.onGameplayStart === 'function') window.onGameplayStart(); requestLock(); }
}
function look(dx, dy, s){ PL.yaw -= dx*s; PL.pitch -= dy*s*(SAVE.invert ? -1 : 1); PL.pitch = clamp(PL.pitch, -1.0, 0.75); }
function playing(){ return G.phase === 'play' && !G.paused && !G.over && !G.adPaused; }
function bindInput(){
  const c = W.renderer.domElement;
  addEventListener('keydown', e=>{
    if(e.code === 'KeyP' || (e.code === 'Escape' && buttonsMode())){ if(G.phase === 'play' && !G.over) setPaused(!G.paused); return; }
    if(e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if(G.keys[e.code]) return; G.keys[e.code] = true;
    if(!playing()) return;
    unlockAudio();
    if(e.code === 'Space'){ G.trigger = true; G.triggerPressed = true; }
    if(e.code === 'KeyR') startReload();
    if(e.code === 'KeyE'){ G.useHeld = true; G.usePressed = true; }
    if(e.code === 'KeyV' || e.code === 'KeyF') melee();
    if(e.code === 'KeyG') throwNade(PL);
    if(e.code === 'KeyQ' || (e.code === 'Digit1' && PL.cur !== 0) || (e.code === 'Digit2' && PL.cur !== 1)) swapWeapon();
  });
  addEventListener('keyup', e=>{ G.keys[e.code] = false; if(e.code === 'KeyE') G.useHeld = false; if(e.code === 'Space') G.trigger = false; });
  addEventListener('blur', ()=>{ G.keys = {}; G.trigger = false; G.adsHeld = false; G.useHeld = false; G.sprintBtn = false; });
  // "mouse aim" mode: the cursor is locked, left button fires, right button aims
  c.addEventListener('mousedown', e=>{ unlockAudio(); if(buttonsMode() || !playing()) return;
    if(!document.pointerLockElement){ requestLock(); return; }
    if(e.button === 0){ G.trigger = true; G.triggerPressed = true; } if(e.button === 2) G.adsHeld = true; });
  addEventListener('mouseup', e=>{ if(buttonsMode()) return; if(e.button === 0) G.trigger = false; if(e.button === 2) G.adsHeld = false; });
  c.addEventListener('contextmenu', e=>e.preventDefault()); $('tc').addEventListener('contextmenu', e=>e.preventDefault());
  addEventListener('wheel', e=>{ if(playing() && Math.abs(e.deltaY) > 10) swapWeapon(); }, { passive:true });
  addEventListener('mousemove', e=>{ if(!document.pointerLockElement || !playing()) return; look(e.movementX, e.movementY, 0.0022*SAVE.sens*(PL.adsT > 0.5 ? 0.6 : 1)); });
  document.addEventListener('pointerlockchange', ()=>{ if(document.pointerLockElement) $('clickWrap').classList.remove('show');
    else if(!buttonsMode() && playing()) setPaused(true); });
  $('clickWrap').addEventListener('click', ()=>{ unlockAudio(); requestLock(); });
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden && G.phase === 'play' && !G.over) setPaused(true); });
  bindButtons();
}
// on-screen controls, the same feel as the football game: a floating stick on the left,
// a cluster of round buttons on the right. Pointer events, so a finger and a mouse both work.
function bindButtons(){
  const zone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob'), lookZ = $('lookZone'), tc = $('tc');
  const stick = { id:null, ox:0, oy:0 }, lk = { id:null, x:0, y:0 }, fp = { id:null, x:0, y:0 }, R = 56;
  const lookS = () => (TOUCH ? 0.0058 : 0.0045)*SAVE.sens*(PL.adsT > 0.5 ? 0.55 : 1);
  const place = (el, x, y)=>{ el.style.left = x + 'px'; el.style.top = y + 'px'; };
  zone.addEventListener('pointerdown', e=>{ e.preventDefault(); unlockAudio(); if(!playing() || stick.id !== null) return;
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; try{ zone.setPointerCapture(e.pointerId); }catch(_){}
    G.joy.on = true; G.joy.x = G.joy.y = 0; place(base, e.clientX, e.clientY); place(knob, e.clientX, e.clientY); tc.classList.add('stickOn'); });
  zone.addEventListener('pointermove', e=>{ if(e.pointerId !== stick.id) return; let dx = (e.clientX - stick.ox)/R, dy = (e.clientY - stick.oy)/R; const l = Math.hypot(dx, dy); if(l > 1){ dx /= l; dy /= l; }
    G.joy.x = dx; G.joy.y = dy; place(knob, stick.ox + dx*R, stick.oy + dy*R); });
  const stickEnd = e=>{ if(e.pointerId !== stick.id) return; stick.id = null; G.joy.on = false; G.joy.x = G.joy.y = 0; tc.classList.remove('stickOn'); };
  zone.addEventListener('pointerup', stickEnd); zone.addEventListener('pointercancel', stickEnd);
  lookZ.addEventListener('pointerdown', e=>{ e.preventDefault(); unlockAudio(); if(!playing() || lk.id !== null) return; lk.id = e.pointerId; lk.x = e.clientX; lk.y = e.clientY; try{ lookZ.setPointerCapture(e.pointerId); }catch(_){} });
  lookZ.addEventListener('pointermove', e=>{ if(e.pointerId !== lk.id || !playing()) return; look(e.clientX - lk.x, e.clientY - lk.y, lookS()); lk.x = e.clientX; lk.y = e.clientY; });
  const lookEnd = e=>{ if(e.pointerId === lk.id) lk.id = null; }; lookZ.addEventListener('pointerup', lookEnd); lookZ.addEventListener('pointercancel', lookEnd);
  // FIRE: hold to shoot, slide the finger on it to steer the aim
  const bf = $('bFire');
  bf.addEventListener('pointerdown', e=>{ e.preventDefault(); e.stopPropagation(); unlockAudio(); if(!playing()) return; fp.id = e.pointerId; fp.x = e.clientX; fp.y = e.clientY;
    try{ bf.setPointerCapture(e.pointerId); }catch(_){} G.trigger = true; G.triggerPressed = true; bf.classList.add('on'); });
  bf.addEventListener('pointermove', e=>{ if(e.pointerId !== fp.id || !playing()) return; look(e.clientX - fp.x, e.clientY - fp.y, lookS()); fp.x = e.clientX; fp.y = e.clientY; });
  const fend = e=>{ if(e.pointerId !== fp.id) return; fp.id = null; G.trigger = false; bf.classList.remove('on'); };
  bf.addEventListener('pointerup', fend); bf.addEventListener('pointercancel', fend);
  const btn = (id, down, up)=>{ const el = $(id);
    el.addEventListener('pointerdown', e=>{ e.preventDefault(); e.stopPropagation(); unlockAudio(); if(!playing()) return; el.classList.add('on'); down(); });
    const off = ()=>{ if(!el.classList.contains('on')) return; el.classList.remove('on'); if(up) up(); };
    el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off); };
  btn('bNade', ()=>throwNade(PL)); btn('bReload', startReload); btn('bSwap', swapWeapon); btn('bKnife', melee);
  btn('bAim', ()=>{ G.adsToggle = !G.adsToggle; $('bAim').classList.toggle('lock', G.adsToggle); });
  btn('bSprint', ()=>{ G.sprintBtn = true; }, ()=>{ G.sprintBtn = false; });
  btn('bUse', ()=>{ G.useHeld = true; G.usePressed = true; }, ()=>{ G.useHeld = false; });
  $('bPause').addEventListener('click', ()=>setPaused(true));
}
function applyControls(){ $('app').classList.toggle('buttons', buttonsMode()); }

// ---- simulation step ---------------------------------------------------------------------------
function step(dt){
  G.t += dt; G.feedT -= dt;
  if(!G.over){
    updatePlayer(dt);
    NAV.timer -= dt; if(NAV.timer <= 0){ NAV.timer = 0.35; updateFlow(); }
    BOTS.forEach((b, i)=>updateBot(b, i, dt));
    updateSurvivor(dt);
    director(dt);
    updateMission(dt);
    if(!G.over){ G.interact = findInteract(); useInteract(dt); }
    G.usePressed = false;
    if(PL.down && PL.reviveT > 0 && !BOTS.some(b=>!b.down && dist(b, PL) < 1.6)) PL.reviveT = Math.max(0, PL.reviveT - dt*0.5);
    for(const b of BOTS) if(b.down && b.reviveT > 0 && !(G.interact && G.interact.who === b && G.useHeld) && !BOTS.some(o=>o !== b && !o.down && dist(o, b) < 1.6)) b.reviveT = Math.max(0, b.reviveT - dt*0.5);
    if(G.auto) autopilot(dt); else G.autoMove = null;
  } else if(G.slow < 1) G.slow = Math.min(1, G.slow + dt*0.3);
  for(const z of G.zombies) updateZombie(z, dt);
  if(G.zombies.some(z=>z.gone)) G.zombies = G.zombies.filter(z=>!z.gone);
  updateGrenades(dt);
}

// ---- autopilot (tests only): plays the player's part of a mission ---------------------------------
function autopilot(dt){
  G.autoMove = null; G.trigger = false; G.useHeld = false;
  if(PL.down) return;
  const cam = W.camera, w = curW();
  let best = null, bd = 1e9;
  const nestStep = G.mission.steps[G.step] && G.mission.steps[G.step].type === 'destroy';
  for(const z of G.zombies){ if(z.state === 'dead' || (z.state === 'rise' && z.riseT < 0.9)) continue; const d = dist(z, PL); if(d > (nestStep ? 7 : 20) || d >= bd) continue;
    if(segClear(PL.x, PL.z, z.x, z.z, 0.05, false)){ bd = d; best = z; } }
  if(best){ refreshRig(best); best.rig.headMesh.getWorldPosition(_hv); const near = bd < 3, ox = near ? PL.x : cam.position.x, oy = near ? 1.62 : cam.position.y, oz = near ? PL.z : cam.position.z;
    const dx = _hv.x - ox, dy = _hv.y - 0.3 - oy, dz = _hv.z - oz, d = Math.hypot(dx, dy, dz); PL.yaw = Math.atan2(-dx, -dz) - PL.kickYaw + Math.sin(G.t*2.3)*(G.apErr||0); PL.pitch = Math.asin(dy/d) - PL.kick + Math.cos(G.t*1.7)*(G.apErr||0)*0.6;
    if(bd < 1.5 && PL.meleeCool <= 0) melee(); else { G.trigger = true; if(!WEAP[w.id].auto) G.triggerPressed = ((G.t*8)|0) % 2 === 0; }
    let crowd = 0; for(const z of G.zombies) if(z.state !== 'dead' && dist(z, best) < 4) crowd++;
    if(crowd >= 5 && bd > 6 && PL.nades > 0 && PL.nadeCool <= 0) throwNade(PL); }
  if(w.mag === 0 && w.res <= 0) swapWeapon();
  if(w.res !== Infinity && w.res < 60){ const crate = TOWN.ammo.find(([x, z])=>Math.hypot(x - PL.x, z - PL.z) < 1.8); if(crate) G.usePressed = true; }
  let goal = null; const downBot = BOTS.find(b=>b.down && dist(b, PL) < 18);
  if(downBot && (!best || bd > 6)) goal = [downBot.x, downBot.z];
  else { const tg = objectiveTarget(); if(tg) goal = [tg.x, tg.z];
    const s = G.mission.steps[G.step];
    if(s && s.type === 'destroy' && tg){ goal = [tg.x + 7, tg.z];
      if(!best && Math.hypot(tg.x - PL.x, tg.z - PL.z) < 22){ const dx = tg.x - cam.position.x, dy = 0.8 - cam.position.y, dz = tg.z - cam.position.z, d = Math.hypot(dx, dy, dz);
        PL.yaw = Math.atan2(-dx, -dz); PL.pitch = Math.asin(dy/d); G.trigger = true; G.triggerPressed = true; } } }
  if(downBot && dist(downBot, PL) < 1.6) G.useHeld = true;
  if(!goal) return;
  const ap = G.ap || (G.ap = { path:null, t:0, goal:null });
  ap.t -= dt; if(ap.t <= 0 || !ap.goal || Math.hypot(ap.goal[0] - goal[0], ap.goal[1] - goal[1]) > 2){ ap.t = 0.6; ap.goal = goal; ap.path = findPath(PL.x, PL.z, goal[0], goal[1]); }
  if(!ap.path || !ap.path.length || Math.hypot(goal[0] - PL.x, goal[1] - PL.z) < 1.0) return;
  const [tx, tz] = ap.path[0]; if(Math.hypot(tx - PL.x, tz - PL.z) < 0.7){ ap.path.shift(); return; }
  const wx = tx - PL.x, wz = tz - PL.z, wl = Math.hypot(wx, wz);
  if(!best && !G.trigger){ PL.yaw = Math.atan2(-wx, -wz); PL.pitch = -0.08; }
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw), rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw);
  G.autoMove = [(wx*rx + wz*rz)/wl, (wx*fx + wz*fz)/wl];
}

// ---- menu backdrop: zombies shuffling down the main streets ----------------------------------------
const menuZ = [];
function menuStep(dt){
  G.menuT += dt; const a = G.menuT*0.05, cam = W.camera;
  cam.position.set(Math.sin(a)*30, 15 + Math.sin(G.menuT*0.2)*2, Math.cos(a)*30); cam.lookAt(0, 0, 0); if(cam.fov !== 55){ cam.fov = 55; cam.updateProjectionMatrix(); }
  W.follow(0, 0);
  while(menuZ.length < 14){ const r = Math.random(), type = r < 0.15 ? 'runner' : (r < 0.25 ? 'brute' : (r < 0.32 ? 'bloater' : 'walker'));
    const rig = W.makeZombie(type, rnd(ZD.SHIRTS), rnd(ZD.PANTS)), alongX = Math.random() < 0.4;
    menuZ.push({ rig, type, alongX, lane:alongX ? 1.95 : rnd([-2.4, 2.1]), pos:(Math.random() - 0.5)*80, dir:Math.random() < 0.5 ? 1 : -1, x:0, z:0, yaw:0,
      state:'chase', moveSpeed:0, flinch:0, atkPose:0, fuse:0, sp:ZT[type].speed*(type === 'runner' ? 0.5 : 0.8) }); }
  for(const z of menuZ){ z.pos += z.dir*z.sp*dt; if(Math.abs(z.pos) > 42) z.pos = -z.dir*42;
    z.x = z.alongX ? z.pos : z.lane; z.z = z.alongX ? z.lane : z.pos; z.yaw = z.alongX ? (z.dir > 0 ? -Math.PI/2 : Math.PI/2) : (z.dir > 0 ? Math.PI : 0); z.moveSpeed = z.sp;
    z.rig.root.position.set(z.x, 0, z.z); z.rig.root.rotation.y = z.yaw; W.animZombie(z.rig, z, dt); }
}
function clearMenuZombies(){ menuZ.forEach(z=>W.remove(z.rig.root)); menuZ.length = 0; }

// ---- screens --------------------------------------------------------------------------------------
function openMenu(){
  clearMission(); BOTS.forEach(b=>W.remove(b.rig.root)); BOTS.length = 0;
  G.phase = 'menu'; G.paused = false; G.over = false; G.mission = null; PL.rig.root.visible = false;
  $('app').classList.add('menu'); $('app').classList.remove('play');
  ['overWrap','winWrap','pauseWrap','clickWrap','setWrap','howWrap','missWrap','downWrap'].forEach(id=>$(id).classList.remove('show'));
  $('menu').classList.add('show');
  const next = Math.min(SAVE.unlocked, ZD.MISSIONS.length) - 1;
  $('mPlay').innerHTML = 'PLAY<small>Mission ' + (next + 1) + ' · ' + ZD.MISSIONS[next].name + '</small>';
  const total = ZD.MISSIONS.reduce((a, x)=>a + (SAVE.stars[x.id] || 0), 0);
  $('mBest').textContent = '★ ' + total + ' / ' + ZD.MISSIONS.length*3 + '   ·   ' + SAVE.kills.toLocaleString('en-US') + ' zombies down';
  if(document.pointerLockElement) document.exitPointerLock();
  if(typeof window.onGameplayStop === 'function') window.onGameplayStop();
}
function renderMissions(){
  $('missList').innerHTML = ZD.MISSIONS.map((m, i)=>{ const locked = i + 1 > SAVE.unlocked, st = SAVE.stars[m.id] || 0;
    return '<button class="mcard' + (locked ? ' locked' : '') + '" data-i="' + i + '"' + (locked ? ' disabled' : '') + '><span class="mnum">' + (i + 1) + '</span><div><b>' + m.name + '</b><span>' +
      (locked ? 'Complete mission ' + i + ' to unlock' : m.brief) + '</span></div><em>' + [1,2,3].map(k=>'<i class="' + (k <= st ? 'on' : '') + '">★</i>').join('') + '</em></button>'; }).join('');
  $('missList').querySelectorAll('.mcard').forEach(b=>b.addEventListener('click', ()=>launch(+b.dataset.i)));
}
function launch(i){ unlockAudio(); clearMenuZombies(); const go = ()=>startMission(i); if(window.gameAdBreak) window.gameAdBreak('preroll', go); else go(); }
function adThen(fn){ unlockAudio(); window.gameAdBreak ? window.gameAdBreak('midgame', fn) : fn(); }
function syncSettings(){
  $('sSens').value = SAVE.sens; $('sSensVal').textContent = (+SAVE.sens).toFixed(1);
  $('sVol').value = SAVE.vol; $('sVolVal').textContent = Math.round(SAVE.vol*100) + '%';
  $('sInvert').textContent = SAVE.invert ? 'On' : 'Off'; $('sMusic').textContent = SAVE.music ? 'On' : 'Off';
  $('sQuality').textContent = { auto:'Auto', high:'High', medium:'Medium', low:'Low' }[SAVE.quality];
  $('sAssist').textContent = SAVE.assist ? 'On' : 'Off';
  $('sControls').textContent = buttonsMode() ? 'Buttons' : 'Mouse aim'; $('sControls').disabled = TOUCH; $('setCtl').style.display = TOUCH ? 'none' : '';
}
function applyQuality(){ const q = SAVE.quality === 'auto' ? (TOUCH ? 'medium' : 'high') : SAVE.quality; W.setQuality(q); W.lowFx = q === 'low'; }
function bindMenus(){
  $('mPlay').addEventListener('click', ()=>launch(Math.min(SAVE.unlocked, ZD.MISSIONS.length) - 1));
  $('mMissions').addEventListener('click', ()=>{ renderMissions(); $('missWrap').classList.add('show'); });
  $('missBack').addEventListener('click', ()=>$('missWrap').classList.remove('show'));
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
  $('sControls').addEventListener('click', ()=>{ SAVE.controls = SAVE.controls === 'buttons' ? 'mouse' : 'buttons'; persist(); syncSettings(); applyControls(); });
  $('sQuality').addEventListener('click', ()=>{ const order = ['auto','high','medium','low']; SAVE.quality = order[(order.indexOf(SAVE.quality) + 1) % order.length]; persist(); syncSettings(); applyQuality(); });
  $('pResume').addEventListener('click', ()=>{ unlockAudio(); setPaused(false); });
  $('pQuit').addEventListener('click', ()=>{ G.paused = false; $('pauseWrap').classList.remove('show'); adThen(openMenu); });
  $('oRetry').addEventListener('click', ()=>adThen(()=>startMission(G.mi)));
  $('oMenu').addEventListener('click', ()=>adThen(openMenu));
  $('wNext').addEventListener('click', ()=>adThen(()=>startMission(G.mi + 1)));
  $('wReplay').addEventListener('click', ()=>adThen(()=>startMission(G.mi)));
  $('wMenu').addEventListener('click', ()=>adThen(openMenu));
  $('howText').innerHTML =
    '<p><b>Your squad.</b> ACE, DOC and TANK fight next to you. They pick up mission items, help at objectives, and run over to pull you up when you go down.</p>' +
    '<p><b>Buttons.</b> The stick on the left moves you. Drag anywhere on the right to look. Hold <b>FIRE</b> to shoot, and slide on it to steer your aim. <b>AIM</b>, <b>GRENADE</b>, <b>RELOAD</b>, <b>SWAP</b>, <b>KNIFE</b>, <b>SPRINT</b> and <b>USE</b> sit around it.</p>' +
    '<p><b>Keyboard.</b> WASD move · Shift sprint · Space fire · G grenade · R reload · Q swap · V knife · E use · P pause. For a locked mouse, pick “Mouse aim” in Settings.</p>' +
    '<p class="tip">Follow the marker to each objective. Stand in a yellow circle to switch something on; every teammate inside makes it faster. Blue crates refill ammo and grenades. When a teammate is down, hold USE next to them.</p>';
}

// ---- portal integration ----------------------------------------------------------------------------
window.gamePauseForAd = function(on){
  G.adPaused = !!on; if(A.master) A.master.gain.value = on ? 0 : SAVE.vol;
  if(on){ G.trigger = false; G.adsHeld = false; if(document.pointerLockElement) document.exitPointerLock(); }
  else showClick();
};
window.gameIsPaused = function(){ return G.adPaused || G.paused; };
// kind: 'preroll' right before a mission starts, 'midgame' on NEXT / REPLAY / RETRY / MENU / QUIT.
// A publisher hook taking (kind, done) plays the ad first and calls done when it ends.
window.gameAdBreak = function(kind, done){
  const fn = window.gameShowAd;
  if(typeof fn === 'function'){ try{ if(fn.length >= 2){ fn(kind || 'midgame', done || function(){}); return; } fn(kind || 'midgame'); }catch(e){} }
  if(typeof done === 'function') done();
};

// ---- loop ------------------------------------------------------------------------------------------
let last = 0, fpsAcc = 0, fpsN = 0, fpsLow = 0;
function loop(now){
  requestAnimationFrame(loop);
  if(W.sizeChanged()) W.resize();
  let dt = (now - last)/1000; last = now; if(!(dt > 0)) dt = 0; if(dt > 0.1) dt = 0.1;
  if(!G.firstFrame){ G.firstFrame = true; setLoad(1); }
  frame(dt);
}
function frame(dt){
  if(G.phase === 'play' || G.phase === 'over'){
    if(!G.paused && !G.adPaused){ let sim = dt*G.slow; while(sim > 1e-6){ const h = Math.min(sim, 1/60); step(h); sim -= h; } }
    updateCamera(dt); W.applyShake();
    G.hudT += dt; if(G.hudT > 0.1){ G.hudT = 0; updateHud(); renderSquad(); }
    updateHudFrame(dt);
    BOTS.forEach(b=>{ b.rig.tag.visible = dist(b, PL) > 2.5; });
  } else if(G.phase === 'menu') menuStep(dt);
  W.tick(dt);
  W.render();
  if(SAVE.quality === 'auto' && G.phase === 'play' && !G.paused && dt > 0){ fpsAcc += dt; fpsN++;
    if(fpsAcc > 4){ const fps = fpsN/fpsAcc; fpsAcc = 0; fpsN = 0; if(fps < 40 && ++fpsLow >= 2){ fpsLow = 0; W.setQuality('low'); W.lowFx = true; } } }
}

// ---- loading -----------------------------------------------------------------------------------------
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
  THREE = window.THREE; _hv = new THREE.Vector3(); _mz = new THREE.Vector3(); loadSave();
  const q = SAVE.quality === 'auto' ? (TOUCH ? 'medium' : 'high') : SAVE.quality;
  W.init($('mount'), q, TOUCH); W.lowFx = q === 'low';
  if(TOUCH) $('app').classList.add('touch');
  applyControls();
  W.buildTown(); buildColliders(); buildNav();
  PL.rig = W.makePlayer(); PL.rig.root.visible = false;
  bindInput(); bindMenus(); syncSettings(); openMenu();
  setLoad(0.9); last = performance.now(); requestAnimationFrame(loop);
}
window.addEventListener('DOMContentLoaded', ()=>{
  setLoad(0.15); loadTick();
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>setLoad(0.4)); else setLoad(0.4);
  const t0 = performance.now();
  const wait = ()=>{ if(window.THREE) setLoad(0.65); const sized = innerWidth > 0 || $('mount').clientWidth > 0;
    if(window.THREE && (sized || performance.now() - t0 > 2500)) boot(); else setTimeout(wait, 60); };
  wait();
});

// dev hooks (harmless in production)
ZD.dbg = { G, PL, BOTS, W, NAV, step:dt=>step(dt), frame:dt=>frame(dt || 1/60), start:startMission, openMenu, nextStep, spawn:spawnZombie, findPath, updateFlow,
  simulate:(sec, fps)=>{ fps = fps || 60; const n = Math.round(sec*fps); for(let i=0; i<n && !G.over; i++){ step(1/fps); updateCamera(1/fps); } return G.t; },
  fire, melee, throwNade, hurt:hurtMember, save:()=>SAVE, persist, winMission, failMission, objectiveTarget };

})(window.ZD);

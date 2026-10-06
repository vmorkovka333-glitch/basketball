// Zombie Squad - the core: state, collision and navigation, the player, weapons and damage,
// elements, projectiles, hazards, abilities, killstreaks, power-ups, interaction, input, loop.
// Zombie and bot brains live in ai.js, the modes in modes.js, screens and HUD in ui.js.
(function(ZD){
const W = ZD.W, A = ZD.A, S = ZD.S, WEAP = ZD.WEAPONS, ZT = ZD.ZOMBIES;
const $ = id => document.getElementById(id);
const mq = q => !!(window.matchMedia && matchMedia(q).matches);
// phones and tablets; a touch-screen laptop with a mouse keeps the choice of mouse aim
const TOUCH = location.search.includes('touch') || mq('(pointer: coarse)') || (('ontouchstart' in window || navigator.maxTouchPoints > 0) && !mq('(pointer: fine)'));
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a)*t;
const rnd = arr => arr[(Math.random()*arr.length)|0];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = a => { while(a > Math.PI) a -= Math.PI*2; while(a < -Math.PI) a += Math.PI*2; return a; };
let THREE, _hv, _mz, _v2;

// ---- state ------------------------------------------------------------------
const G = ZD.G = {
  phase:'menu', mode:null, paused:false, adPaused:false, uiPause:false, over:false, t:0, slow:1, M:null,
  zombies:[], proj:[], haz:[], drops:[], turrets:[], grenades:[], pow:{}, streak:0, points:0, kills:0, botKills:0, heads:0, downs:0,
  trigger:false, triggerPressed:false, adsHeld:false, adsToggle:false, sprintBtn:false, useHeld:false, usePressed:false, useT:0,
  keys:{}, joy:{ x:0, y:0, on:false }, interact:null, menuT:0, firstFrame:false, hudT:0, auto:false, autoMove:null, ap:null, god:false, boss:null, feedT:0,
};
const PL = ZD.PL = { x:0, z:0, vx:0, vz:0, yaw:0, pitch:-0.08, hp:100, maxHp:100, hurtT:99, rig:null, weapons:[], cur:0, fireT:0, reloadT:0, swapT:0,
  meleeT:0, meleeCool:0, adsT:0, sprint:false, moving:false, kick:0, kickYaw:0, bloom:0, recoil:0, down:false, bleed:0, reviveT:0, nades:2, nadeCool:0,
  name:'YOU', char:'max', perks:{}, fx:{}, ult:0, turnV:0, melee:'knife' };
const BOTS = ZD.BOTS = [];
const C = ZD.C = { G, PL, BOTS, TOUCH, clamp, lerp, rnd, dist, wrap };
const members = C.members = ()=>[PL].concat(BOTS);
const standing = C.standing = ()=>members().filter(m=>!m.down);
const buttonsMode = C.buttonsMode = () => TOUCH || S.data.settings.controls === 'buttons';
const sfx = C.sfx = (n, o)=>A.sfx(n, o);
const UI = ()=>ZD.UI, MO = ()=>ZD.Modes, AI = ()=>ZD.AI;

// ---- collision ------------------------------------------------------------------
let SOLID = [], BULLET = [], LOWFREE = [];
C.buildColliders = function(){
  const M = G.M; SOLID = []; BULLET = [];
  const add = b=>{ BULLET.push(b); SOLID.push(b); };
  M.walls.forEach(add); M.buildings.forEach(add); M.props.forEach(add);
  M.items.forEach(it=>{ if(it.solid) add({ x0:it.x0, x1:it.x1, z0:it.z0, z1:it.z1, y0:0, y1:it.h, kind:it.kind }); });
  M.doors.forEach(d=>{ if(!d.open) add(d.box); });
  LOWFREE = SOLID.filter(b=>b.y1 >= 1.6);
  C.SOLID = SOLID; C.BULLET = BULLET; C.LOWFREE = LOWFREE;
};
const pushOut = C.pushOut = function(p, r, boxes){
  boxes = boxes || SOLID;
  for(let pass=0; pass<2; pass++) for(const b of boxes){
    if(p.x < b.x0 - r || p.x > b.x1 + r || p.z < b.z0 - r || p.z > b.z1 + r) continue;
    const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx*dx + dz*dz;
    if(d2 >= r*r) continue;
    if(d2 > 1e-8){ const d = Math.sqrt(d2), k = (r - d)/d; p.x += dx*k; p.z += dz*k; }
    else { const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bt = b.z1 - p.z, m = Math.min(l, rr, t, bt);
      if(m === l) p.x = b.x0 - r; else if(m === rr) p.x = b.x1 + r; else if(m === t) p.z = b.z0 - r; else p.z = b.z1 + r; }
  }
};
function rayBox(ox, oy, oz, dx, dy, dz, b, tmax){
  let t0 = 0, t1 = tmax;
  if(Math.abs(dx) < 1e-9){ if(ox < b.x0 || ox > b.x1) return -1; } else { let a = (b.x0-ox)/dx, c = (b.x1-ox)/dx; if(a > c){ const s=a; a=c; c=s; } if(a > t0) t0 = a; if(c < t1) t1 = c; if(t0 > t1) return -1; }
  const y0 = b.y0 || 0, y1 = b.y1;
  if(Math.abs(dy) < 1e-9){ if(oy < y0 || oy > y1) return -1; } else { let a = (y0-oy)/dy, c = (y1-oy)/dy; if(a > c){ const s=a; a=c; c=s; } if(a > t0) t0 = a; if(c < t1) t1 = c; if(t0 > t1) return -1; }
  if(Math.abs(dz) < 1e-9){ if(oz < b.z0 || oz > b.z1) return -1; } else { let a = (b.z0-oz)/dz, c = (b.z1-oz)/dz; if(a > c){ const s=a; a=c; c=s; } if(a > t0) t0 = a; if(c < t1) t1 = c; if(t0 > t1) return -1; }
  return t0;
}
C.rayBox = rayBox;
const rayWorld = C.rayWorld = function(ox, oy, oz, dx, dy, dz, tmax){
  let best = tmax, hit = null;
  for(const b of BULLET){ const t = rayBox(ox, oy, oz, dx, dy, dz, b, best); if(t >= 0 && t < best){ best = t; hit = b; } }
  if(dy < -1e-6){ const tg = -oy/dy; if(tg >= 0 && tg < best){ best = tg; hit = { kind:'ground' }; } }
  return { t:best, hit };
};
// flat line test; with low=false the low props (cars, barriers) do not block a look or a shot
const _seg = { x0:0, x1:0, y0:-1, y1:9, z0:0, z1:0 };
const segClear = C.segClear = function(x0, z0, x1, z1, pad, low){
  const dx = x1 - x0, dz = z1 - z0, mnx = Math.min(x0, x1) - pad, mxx = Math.max(x0, x1) + pad, mnz = Math.min(z0, z1) - pad, mxz = Math.max(z0, z1) + pad;
  for(const b of (low ? SOLID : LOWFREE)){
    if(b.x1 < mnx || b.x0 > mxx || b.z1 < mnz || b.z0 > mxz) continue;
    _seg.x0 = b.x0 - pad; _seg.x1 = b.x1 + pad; _seg.z0 = b.z0 - pad; _seg.z1 = b.z1 + pad;
    const t = rayBox(x0, 1, z0, dx, 0, dz, _seg, 1); if(t >= 0 && t <= 1) return false; }
  return true;
};

// ---- navigation: a 1 m grid; zombies share a flow field, bots use A* ----------------
const NAV = C.NAV = { cs:1, x0:0, z0:0, nx:0, nz:0, blocked:null, dist:null, heap:null, timer:0, gen:1 };
C.buildNav = function(){
  const M = G.M; NAV.x0 = M.X0; NAV.z0 = M.Z0; NAV.nx = Math.round(M.W/NAV.cs); NAV.nz = Math.round(M.H/NAV.cs);
  const n = NAV.nx*NAV.nz;
  NAV.blocked = new Uint8Array(n); NAV.dist = new Float32Array(n); NAV.heap = new Int32Array(n*8 + 16);
  NAV.g = new Float32Array(n); NAV.f = new Float32Array(n); NAV.from = new Int32Array(n); NAV.mark = new Uint32Array(n); NAV.closed = new Uint32Array(n);
  C.rebuildNav();
};
C.rebuildNav = function(){
  NAV.blocked.fill(0); const pad = 0.42;
  for(const s of SOLID){
    const ix0 = Math.max(0, Math.floor((s.x0 - pad - NAV.x0)/NAV.cs)), ix1 = Math.min(NAV.nx-1, Math.floor((s.x1 + pad - NAV.x0)/NAV.cs));
    const iz0 = Math.max(0, Math.floor((s.z0 - pad - NAV.z0)/NAV.cs)), iz1 = Math.min(NAV.nz-1, Math.floor((s.z1 + pad - NAV.z0)/NAV.cs));
    for(let iz=iz0; iz<=iz1; iz++) for(let ix=ix0; ix<=ix1; ix++){ const x = NAV.x0 + (ix+0.5)*NAV.cs, z = NAV.z0 + (iz+0.5)*NAV.cs;
      if(x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad) NAV.blocked[iz*NAV.nx + ix] = 1; }
  }
  NAV.timer = 0;
};
const navCell = C.navCell = function(x, z){ const ix = Math.floor((x - NAV.x0)/NAV.cs), iz = Math.floor((z - NAV.z0)/NAV.cs);
  if(ix < 0 || iz < 0 || ix >= NAV.nx || iz >= NAV.nz) return -1; return iz*NAV.nx + ix; };
const cellPos = C.cellPos = k=>[NAV.x0 + ((k % NAV.nx) + 0.5)*NAV.cs, NAV.z0 + (((k / NAV.nx)|0) + 0.5)*NAV.cs];
const openNear = C.openNear = function(c){
  if(c < 0) return -1; if(!NAV.blocked[c]) return c;
  const cx = c % NAV.nx, cz = (c / NAV.nx)|0; let best = -1, bd = 1e9;
  for(let dz=-3; dz<=3; dz++) for(let dx=-3; dx<=3; dx++){ const x = cx+dx, z = cz+dz; if(x<0||z<0||x>=NAV.nx||z>=NAV.nz) continue;
    const k = z*NAV.nx + x; if(!NAV.blocked[k] && dx*dx+dz*dz < bd){ bd = dx*dx+dz*dz; best = k; } }
  return best;
};
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
// zombies walk down this field: distance to the nearest member they can see as a target
C.updateFlow = function(){
  const d = NAV.dist, nx = NAV.nx, nz = NAV.nz, bl = NAV.blocked; d.fill(1e9);
  const H = makeHeap(d);
  for(const m of members()){ if(m.down || (m.fx && m.fx.shadow > 0)) continue; const c = openNear(navCell(m.x, m.z)); if(c >= 0 && d[c] > 0){ d[c] = 0; H.push(c); } }
  while(H.size() > 0){
    const k = H.pop(), kx = k % nx, kz = (k / nx)|0, dk = d[k]; if(dk > 90) continue;
    for(let dz=-1; dz<=1; dz++) for(let dx=-1; dx<=1; dx++){
      if(!dx && !dz) continue; const x = kx+dx, z = kz+dz; if(x<0||z<0||x>=nx||z>=nz) continue;
      const j = z*nx + x; if(bl[j]) continue; if(dx && dz && (bl[kz*nx + x] || bl[z*nx + kx])) continue;
      const nd = dk + (dx && dz ? 1.414 : 1); if(nd < d[j]){ d[j] = nd; H.push(j); }
    }
  }
};
C.flowDir = function(x, z){
  const c = navCell(x, z); if(c < 0) return null;
  const nx = NAV.nx, cx = c % nx, cz = (c / nx)|0; let best = -1, bd = NAV.dist[c];
  for(let dz=-1; dz<=1; dz++) for(let dx=-1; dx<=1; dx++){
    if(!dx && !dz) continue; const xx = cx+dx, zz = cz+dz; if(xx<0||zz<0||xx>=nx||zz>=NAV.nz) continue;
    const j = zz*nx + xx; if(NAV.blocked[j]) continue; if(dx && dz && (NAV.blocked[cz*nx + xx] || NAV.blocked[zz*nx + cx])) continue;
    if(NAV.dist[j] < bd){ bd = NAV.dist[j]; best = j; } }
  if(best < 0) return null;
  const [tx, tz] = cellPos(best), l = Math.hypot(tx - x, tz - z) || 1;
  return [(tx - x)/l, (tz - z)/l];
};
C.flowDist = (x, z)=>{ const c = navCell(x, z); return c < 0 ? 1e9 : NAV.dist[c]; };
// A* between two points, then trimmed to the corners that matter
C.findPath = function(x0, z0, x1, z1){
  const s = openNear(navCell(x0, z0)), e = openNear(navCell(x1, z1)); if(s < 0 || e < 0) return null;
  const endPt = navCell(x1, z1) === e ? [x1, z1] : cellPos(e);
  if(s === e) return [endPt];
  const nx = NAV.nx, nz = NAV.nz, bl = NAV.blocked, g = NAV.g, f = NAV.f, from = NAV.from, mark = NAV.mark, closed = NAV.closed;
  const gen = ++NAV.gen, ex = e % nx, ez = (e / nx)|0;
  const hf = k => { const dx = Math.abs((k % nx) - ex), dz = Math.abs(((k / nx)|0) - ez); return Math.max(dx, dz) + 0.414*Math.min(dx, dz); };
  const H = makeHeap(f); mark[s] = gen; g[s] = 0; f[s] = hf(s); from[s] = -1; H.push(s);
  let found = false, expanded = 0;
  while(H.size() > 0 && expanded < 12000){
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
};
C.zoneAt = function(x, z){ const M = G.M; if(!M) return -1; const c = Math.floor((x - M.X0)/M.zoneSize), r = Math.floor((z - M.Z0)/M.zoneSize);
  if(c < 0 || r < 0 || c > 3 || r > 2) return -1; return r*4 + c; };
// doors change the walkable map
C.setDoorOpen = function(d, instant){
  if(d.open) return; d.open = true; W.openDoor(d, instant);
  C.buildColliders(); C.rebuildNav(); if(!instant) sfx('door', { at:[(d.box.x0 + d.box.x1)/2, (d.box.z0 + d.box.z1)/2], vol:1.2 });
};

// ---- the squad ------------------------------------------------------------------
let feedQ = []; C.feed = ()=>feedQ;
const say = C.say = function(m, kind, force){
  if(!m || !m.def || m.down || (m.sayT > 0 && !force)) return; const lines = ZD.CALLOUTS[kind]; if(!lines) return;
  if(G.feedT > 0 && !force) return;
  m.sayT = 4 + Math.random()*3; G.feedT = 0.9;
  feedQ.push({ name:m.name, css:m.def.css, text:rnd(lines), t:4 }); if(feedQ.length > 4) feedQ.shift(); UI().renderFeed(); sfx('blip');
};
C.radio = function(name, text, css){ feedQ.push({ name, css:css || '#b8b0c8', text, t:6 }); if(feedQ.length > 4) feedQ.shift(); UI().renderFeed(); sfx('radio'); };

// ---- weapons --------------------------------------------------------------------
C.makeWeapon = function(id, rar, element){ const w = { id, rar:rar || 0, element:element || null, mag:0, res:0 }; const st = wstat(w); w.mag = st.mag; w.res = st.reserve; return w; };
// everything that changes a gun: rarity, Armory upgrades, perks, power-ups and abilities
const wstat = C.wstat = function(w){
  const d = WEAP[w.id], R = ZD.RARITY[w.rar || 0], up = k=>S.upgradeLevel(w.id, k)*ZD.UPGRADES[k].step, pk = PL.perks, pw = G.pow, fx = PL.fx;
  return { d, rar:R,
    dmg: d.dmg*R.dmg*(1 + up('dmg'))*(pw.damage > 0 ? 2 : 1)*(fx.shadow > 0 ? 1.5 : 1),
    mag: Math.max(1, Math.round(d.mag*R.mag*(1 + up('mag')))),
    reserve: d.reserve === Infinity ? Infinity : Math.round(d.reserve*R.mag*(pk.pockets ? 1.5 : 1)),
    reload: d.reload*(1 - up('reload'))*(pk.quick ? 0.6 : 1)*(pw.reload > 0 ? 0.5 : 1)*(fx.adrenaline > 0 ? 0.67 : 1),
    rate: d.rate/(1 + up('rate'))/(fx.adrenaline > 0 ? 1.4 : 1),
    crit: ZD.CRIT.chance + R.crit + (pk.steady ? 0.1 : 0),
    spread: pk.steady ? 0.7 : 1,
    element: w.element || d.element || null };
};
const curW = C.curW = ()=>PL.weapons[PL.cur];
const equip = C.equip = function(i){ PL.cur = i; PL.reloadT = 0; PL.swapT = 0.45; const w = curW(); W.setGunModel(PL.rig, WEAP[w.id].model, ZD.RARITY[w.rar || 0].hex); UI().updateHud(true); };
// survival and the secret rooms hand out guns; with two in hand the current one is replaced
C.giveWeapon = function(id, rar, element){
  const have = PL.weapons.findIndex(w=>w.id === id);
  if(have >= 0){ const w = PL.weapons[have]; if((rar || 0) > w.rar){ w.rar = rar; } if(element) w.element = element; const st = wstat(w); w.mag = st.mag; w.res = st.reserve; equip(have); return; }
  const w = C.makeWeapon(id, rar, element);
  if(PL.weapons.length < 2) PL.weapons.push(w); else PL.weapons[PL.cur] = w;
  equip(PL.weapons.indexOf(w));
};
const swapWeapon = C.swapWeapon = function(){ if(PL.weapons.length < 2 || PL.swapT > 0 || PL.down) return; equip((PL.cur + 1) % PL.weapons.length); sfx('swap'); };
const startReload = C.startReload = function(){ const w = curW(), st = wstat(w); if(PL.reloadT > 0 || w.mag >= st.mag || w.res <= 0 || PL.swapT > 0 || PL.down) return; PL.reloadT = st.reload; PL.reloadMax = st.reload; sfx('reload', { k:st.reload/2 }); };
function finishReload(){ const w = curW(), st = wstat(w); const take = Math.min(st.mag - w.mag, w.res); w.mag += take; if(w.res !== Infinity) w.res -= take; UI().updateHud(true); }
C.refillAmmo = function(all){ for(const w of PL.weapons){ const st = wstat(w); w.res = st.reserve; if(all) w.mag = st.mag; } PL.nades = ZD.GRENADE.max + (PL.perks.pockets ? 2 : 0); for(const b of BOTS) b.mag = WEAP[b.weapon].mag; UI().updateHud(true); };

// ---- camera -----------------------------------------------------------------------
const CAM = { side:1.05, up:0.5, back:3.6, fov:68 };
const camBasis = C.camBasis = function(){
  const cp = Math.cos(PL.pitch + PL.kick), sp = Math.sin(PL.pitch + PL.kick), cy = Math.cos(PL.yaw + PL.kickYaw), sy = Math.sin(PL.yaw + PL.kickYaw);
  return { fx:-sy*cp, fy:sp, fz:-cy*cp, rx:cy, rz:-sy };
};
const updateCamera = C.updateCamera = function(dt){
  const cam = W.camera, a = PL.adsT, B = camBasis(), w = curW(), adsFov = w && WEAP[w.id].ads ? WEAP[w.id].ads : 48;
  const side = lerp(CAM.side, 0.7, a), up = lerp(CAM.up, 0.25, a), back = lerp(CAM.back, adsFov < 40 ? 1.2 : 1.8, a);
  const py = PL.down ? 1.0 : 1.62, ox = PL.x + B.rx*side*0.4, oz = PL.z + B.rz*side*0.4;
  let dx = -B.fx*back + B.rx*side*0.6, dy = -B.fy*back + up, dz = -B.fz*back + B.rz*side*0.6;
  const len = Math.hypot(dx, dy, dz); dx /= len; dy /= len; dz /= len;
  let t = len; for(const b of BULLET){ const h = rayBox(ox, py, oz, dx, dy, dz, b, t); if(h >= 0 && h < t) t = h; }
  t = Math.max(0.35, t - 0.22);
  cam.position.set(ox + dx*t, Math.max(0.3, py + dy*t), oz + dz*t);
  cam.rotation.set(PL.pitch + PL.kick, PL.yaw + PL.kickYaw, 0, 'YXZ');
  const fov = lerp(PL.sprint ? 74 : CAM.fov, adsFov, a);
  if(Math.abs(cam.fov - fov) > 0.05){ cam.fov = lerp(cam.fov, fov, 1 - Math.exp(-dt*14)); cam.updateProjectionMatrix(); }
  PL.rig.root.visible = !(a > 0.85 && adsFov < 40);       // scoped in: hide the hero
  W.follow(PL.x, PL.z);
};

// ---- hit tests ------------------------------------------------------------------------
function refreshRig(z){ z.rig.root.position.set(z.x, z.y, z.z); z.rig.root.rotation.y = z.yaw; z.rig.root.updateMatrixWorld(true); }
C.refreshRig = refreshRig;
function sphereT(ox, oy, oz, dx, dy, dz, cx, cy, cz, r){ const hx = ox - cx, hy = oy - cy, hz = oz - cz, b = hx*dx + hy*dy + hz*dz, c = hx*hx + hy*hy + hz*hz - r*r, disc = b*b - c;
  if(disc < 0) return -1; const t = -b - Math.sqrt(disc); return t > 0 ? t : -1; }
// every zombie the ray passes through before the world stops it, nearest first
function traceAll(ox, oy, oz, dx, dy, dz, range, assist){
  const wr = rayWorld(ox, oy, oz, dx, dy, dz, range), hits = [], hl = Math.hypot(dx, dz) || 1;
  for(const z of G.zombies){
    if(z.state === 'dead' || (z.state === 'rise' && z.riseT < 0.5) || z.fleeing) continue;
    const s = z.boss ? z.def.scale : ZT[z.type].scale, qx = z.x - ox, qz = z.z - oz, along = (qx*dx + qz*dz)/hl;
    if(along < -1.5 || along > wr.t + 2*s || Math.abs(qx*dz - qz*dx)/hl > 1.5*s) continue;
    refreshRig(z); z.rig.headMesh.getWorldPosition(_hv);
    let best = 1e9, part = null;
    const th = sphereT(ox, oy, oz, dx, dy, dz, _hv.x, _hv.y, _hv.z, 0.2*s + assist*0.07); if(th > 0){ best = th; part = 'head'; }
    if(z.boss && z.rig.weak && z.rig.weak !== z.rig.headMesh){ z.rig.weak.getWorldPosition(_v2); const tw = sphereT(ox, oy, oz, dx, dy, dz, _v2.x, _v2.y, _v2.z, 0.24*s + assist*0.05);
      if(tw > 0 && tw <= best + 0.05){ best = tw; part = 'weak'; } }
    const r = 0.3*s + assist*0.14, cx = z.x - Math.sin(z.yaw)*0.08*s, cz = z.z - Math.cos(z.yaw)*0.08*s, ex = ox - cx, ez = oz - cz, A2 = dx*dx + dz*dz;
    if(A2 > 1e-9){ const B2 = ex*dx + ez*dz, C2 = ex*ex + ez*ez - r*r, D2 = B2*B2 - A2*C2;
      if(D2 >= 0){ const t = (-B2 - Math.sqrt(D2))/A2, y = oy + dy*t; if(t > 0 && t < best && y > z.y + 0.05 && y < _hv.y - 0.15*s){ best = t; part = 'body'; } } }
    if(part && best < wr.t) hits.push({ t:best, z, part });
  }
  for(const n of (G.nests || [])){ if(n.dead) continue; const t = sphereT(ox, oy, oz, dx, dy, dz, n.x, 0.8, n.z, 1.15 + assist*0.2); if(t > 0 && t < wr.t) hits.push({ t, nest:n }); }
  hits.sort((a, b)=>a.t - b.t);
  return { hits, world:wr };
}
C.traceAll = traceAll;

// ---- shooting -----------------------------------------------------------------------
C.fire = function(){
  const w = PL.down ? PL.lsW : curW(), st = wstat(w), d = st.d;     // downed: last stand with a pistol
  if(!w || PL.fireT > 0 || (!PL.down && (PL.reloadT > 0 || PL.swapT > 0 || PL.meleeT > 0))) return;
  if(w.mag <= 0){ if(w.res > 0) startReload(); else { sfx('dry'); PL.fireT = 0.25; } return; }
  w.mag--; PL.fireT = st.rate; PL.sprint = false; G.shotsFired = (G.shotsFired || 0) + 1;
  const B = camBasis(), cam = W.camera, assist = buttonsMode() && S.data.settings.assist ? 1 : 0;
  const depth = Math.max(0, (PL.x - cam.position.x)*B.fx + (1.5 - cam.position.y)*B.fy + (PL.z - cam.position.z)*B.fz - 0.2);
  const ox = cam.position.x + B.fx*depth, oy = cam.position.y + B.fy*depth, oz = cam.position.z + B.fz*depth;
  PL.rig.root.position.set(PL.x, 0, PL.z); PL.rig.root.rotation.y = PL.yaw; PL.rig.root.updateMatrixWorld(true);
  const muzzle = _mz; PL.rig.muzzle.getWorldPosition(muzzle);
  const dirV = new THREE.Vector3(B.fx, B.fy, B.fz);
  if(d.flame){ fireFlame(st, muzzle, B); }
  else if(d.proj){ // launcher, ray gun, void cannon
    const spread = lerp(d.spreadHip, d.spreadAds, PL.adsT)*st.spread;
    // aim the projectile at what the crosshair sees
    const tr = traceAll(ox, oy, oz, B.fx, B.fy, B.fz, d.range, assist), tt = tr.hits.length ? tr.hits[0].t : tr.world.t;
    let tx = ox + B.fx*tt - muzzle.x, ty = oy + B.fy*tt - muzzle.y, tz = oz + B.fz*tt - muzzle.z; const tl = Math.hypot(tx, ty, tz) || 1;
    tx = tx/tl + (Math.random()-0.5)*spread; ty = ty/tl + (Math.random()-0.5)*spread; tz = tz/tl + (Math.random()-0.5)*spread;
    C.spawnProjectile({ kind:d.model === 'raygun' ? 'ray' : (d.model === 'void' ? 'void' : 'launcher'), x:muzzle.x, y:muzzle.y, z:muzzle.z, vx:tx*d.proj, vy:ty*d.proj + (d.model === 'launcher' ? 1.5 : 0), vz:tz*d.proj,
      grav:d.model === 'launcher' ? 6 : 0, owner:PL, dmg:st.dmg, aoe:d.aoe, element:st.element, implode:d.implode, life:4 });
  } else {
    const spread = lerp(d.spreadHip, d.spreadAds, PL.adsT)*(PL.moving ? 1.3 : 1)*st.spread + PL.bloom;
    let anyHit = false, killed = false, headHit = false, critHit = false;
    for(let p=0; p<d.pellets; p++){
      const a = Math.random()*Math.PI*2, r = Math.sqrt(Math.random())*spread;
      let dx = B.fx + B.rx*Math.cos(a)*r, dy = B.fy + Math.sin(a)*r, dz = B.fz + B.rz*Math.cos(a)*r;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const tr = traceAll(ox, oy, oz, dx, dy, dz, d.range, assist);
      let endT = tr.world.t, hitsDone = 0, firstZ = null;
      // the barrel can be behind a corner the camera sees past
      const fx = ox + dx*Math.min(endT, tr.hits.length ? tr.hits[0].t : endT), fy = oy + dy*Math.min(endT, tr.hits.length ? tr.hits[0].t : endT), fz = oz + dz*Math.min(endT, tr.hits.length ? tr.hits[0].t : endT);
      const mx = fx - muzzle.x, my = fy - muzzle.y, mz = fz - muzzle.z, ml = Math.hypot(mx, my, mz); let blocked = null;
      if(ml > 0.3){ const bl = rayWorld(muzzle.x, muzzle.y, muzzle.z, mx/ml, my/ml, mz/ml, ml - 0.05); if(bl.hit && bl.hit.kind !== 'ground') blocked = { x:muzzle.x + mx/ml*bl.t, y:muzzle.y + my/ml*bl.t, z:muzzle.z + mz/ml*bl.t }; }
      let lastX = ox + dx*endT, lastY = oy + dy*endT, lastZ = oz + dz*endT;
      if(!blocked){
        for(const h of tr.hits){
          if(hitsDone >= (d.pierce || 1)) { break; }
          const hx = ox + dx*h.t, hy = oy + dy*h.t, hz = oz + dz*h.t, fall = h.t > d.range*0.6 ? lerp(1, 0.6, (h.t - d.range*0.6)/(d.range*0.4)) : 1;
          if(h.nest){ C.damageNest(h.nest, st.dmg*fall, hx, hy, hz); anyHit = true; lastX = hx; lastY = hy; lastZ = hz; hitsDone = 99; break; }
          const z = h.z, dead = PL.fx.deadeye > 0, head = h.part === 'head' || dead, weak = h.part === 'weak' || (dead && z.boss);
          const crit = dead || Math.random() < st.crit;
          let mul = head ? d.headMul : 1; if(weak) mul = Math.max(mul, z.def.weakMul || 2.5);
          if(z.boss && head && z.def.weak === 'head') mul = Math.max(mul, z.def.weakMul);
          const res = C.damageZombie(z, st.dmg*mul*fall*(crit ? ZD.CRIT.mul : 1), { head, weak, crit, x:hx, y:hy, z:hz, dx, dz, by:PL, element:st.element });
          if(res !== 'block'){ anyHit = true; if(res === 'kill') killed = true; if(head || weak) headHit = true; if(crit) critHit = true; if(!firstZ) firstZ = z; }
          lastX = hx; lastY = hy; lastZ = hz; hitsDone++;
          if(res === 'block') break;
        }
        if(hitsDone === 0){ const wh = tr.world.hit; if(wh && wh.kind === 'ground') W.dust(lastX, 0.05, lastZ, 3); else if(wh){ W.dust(lastX, lastY, lastZ, 3); W.sparks(lastX, lastY, lastZ, 3); } }
      } else { lastX = blocked.x; lastY = blocked.y; lastZ = blocked.z; W.dust(lastX, lastY, lastZ, 2); W.sparks(lastX, lastY, lastZ, 2); }
      if(p < 3) W.tracer(muzzle.x, muzzle.y, muzzle.z, lastX, lastY, lastZ, st.element ? ZD.ELEMENTS[st.element].hex : null);
      if(d.chain && firstZ) C.chainLightning(firstZ, st.dmg*0.6, d.chain, PL);
    }
    if(anyHit) UI().hitmarker(killed ? 'kill' : (critHit ? 'crit' : (headHit ? 'head' : 'hit')));
  }
  W.muzzleFlash(muzzle, dirV, d.flash); sfx(d.sound);
  const ads = 1 - PL.adsT*0.45; PL.kick += d.kick*ads; PL.kickYaw += (Math.random() - 0.5)*d.kickSide*2*ads; PL.bloom = Math.min(0.06, PL.bloom + d.kick*0.5);
  PL.recoil = 0.07; W.shake(d.pellets > 1 || d.cat === 'sniper' ? 0.2 : 0.04);
  UI().updateHud(true);
};
function fireFlame(st, muzzle, B){
  W.flame(muzzle.x, muzzle.y, muzzle.z, B.fx, B.fy, B.fz, 3); A.loop('flame', true, 0.2); G.flameT = 0.15;
  const range = st.d.range;
  for(const z of G.zombies){ if(z.state === 'dead' || z.state === 'rise') continue;
    const dx = z.x - PL.x, dz = z.z - PL.z, d = Math.hypot(dx, dz); if(d > range || d < 0.01) continue;
    if((dx*B.fx + dz*B.fz)/d/Math.hypot(B.fx, B.fz) < 0.82) continue;
    if(!segClear(PL.x, PL.z, z.x, z.z, 0, false)) continue;
    C.damageZombie(z, st.dmg, { x:z.x, y:1.2, z:z.z, dx:dx/d, dz:dz/d, by:PL, element:'fire', quiet:true });
  }
  for(const n of (G.nests || [])) if(!n.dead && dist(n, PL) < range) C.damageNest(n, st.dmg, n.x, 1, n.z);
}
C.chainLightning = function(from, dmg, count, by){
  let cur = from; const hit = new Set([from]);
  for(let k=0; k<count; k++){
    let best = null, bd = 6.5; for(const z of G.zombies){ if(hit.has(z) || z.state === 'dead') continue; const d = dist(z, cur); if(d < bd){ bd = d; best = z; } }
    if(!best) break; hit.add(best);
    W.arc(cur.x, 1.3, cur.z, best.x, 1.3, best.z); sfx('zap', { at:[best.x, best.z], vol:0.6, gap:0.05 });
    C.damageZombie(best, dmg, { x:best.x, y:1.2, z:best.z, dx:0, dz:0, by, element:'shock', quiet:true, chained:true }); cur = best;
  }
};
C.melee = function(){
  if(PL.meleeCool > 0 || PL.down || PL.swapT > 0) return;
  const md = ZD.MELEE[PL.melee] || ZD.MELEE.knife;
  PL.meleeCool = md.cool; PL.meleeT = 0.35; sfx('melee');
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw); let best = null, bd = md.range*(PL.perks.brawler ? 1.25 : 1);
  for(const z of G.zombies){ if(z.state === 'dead' || z.state === 'rise') continue;
    const dx = z.x - PL.x, dz = z.z - PL.z, d = Math.hypot(dx, dz) - (z.boss ? 0.6 : 0); if(d > bd || (dx*fx + dz*fz)/Math.max(d, 0.01) < md.cone) continue; best = z; bd = d; }
  if(PL.perks.brawler && best && bd > 1.2){ PL.x += fx*(bd - 1.0); PL.z += fz*(bd - 1.0); pushOut(PL, ZD.PLAYER.radius); }   // a short lunge
  if(best){ refreshRig(best); best.rig.headMesh.getWorldPosition(_hv);
    const dmg = md.dmg*(PL.perks.brawler ? 3 : 1)*(G.pow.damage > 0 ? 2 : 1)*(PL.fx.shadow > 0 ? 1.5 : 1);
    const r = C.damageZombie(best, dmg, { x:_hv.x, y:_hv.y - 0.3, z:_hv.z, dx:fx, dz:fz, by:PL, melee:true });
    best.kx += fx*md.knock*3; best.kz += fz*md.knock*3;
    sfx('meleeHit'); W.shake(0.15); UI().hitmarker(r === 'kill' ? 'kill' : 'hit'); }
};

// ---- damage -------------------------------------------------------------------------
// opts: head, weak, crit, x, y, z, dx, dz, by, element, melee, explosive, quiet, chained
C.damageZombie = function(z, dmg, o){
  if(z.state === 'dead' || z.invuln || z.fleeing) return null;
  o = o || {}; const def = z.boss ? z.def : ZT[z.type];
  // riot shields stop bullets from the front, not explosions or fire
  if(z.shield && !o.explosive && !o.element && !o.head && !o.melee){ const fx = -Math.sin(z.yaw), fz = -Math.cos(z.yaw);
    if(-(o.dx*fx + o.dz*fz) > 0.45){ W.sparks(o.x, o.y, o.z, 4); sfx('armor', { at:[z.x, z.z], gap:0.06 }); return 'block'; } }
  if(G.pow.insta > 0 && !z.boss && z.type !== 'giant' && z.type !== 'captain') dmg = z.hp + (z.armor || 0) + 1;
  if(z.boss && G.pow.insta > 0) dmg *= 2;
  if(z.frozen > 0) dmg *= 1.5;
  if(z.cloak > 0) dmg *= 0.4;
  if(z.buffed > 0 && !z.boss) dmg *= 0.8;
  // helmets eat one headshot, armor soaks most of a hit until it breaks
  if(o.head && z.helmet && !o.explosive){ z.helmet = false; if(z.rig.helmet){ z.rig.helmet.parent.remove(z.rig.helmet); } W.sparks(o.x, o.y, o.z, 6); sfx('armor', { at:[z.x, z.z] }); dmg *= 0.3; }
  if(z.armor > 0 && !(G.pow.insta > 0)){ const soak = dmg*0.75; z.armor -= soak; dmg -= soak*(z.armor > 0 ? 1 : 0.5);
    if(z.armor <= 0 && z.rig.plates){ z.rig.plates.parent.remove(z.rig.plates); z.rig.plates = null; W.sparks(z.x, 1.2, z.z, 10); }
    else if(!o.quiet) { W.sparks(o.x, o.y, o.z, 2); sfx('armor', { at:[z.x, z.z], gap:0.08 }); } }
  z.hp -= dmg; z.flinch = z.boss ? 0.08 : 0.25; z.kx += (o.dx || 0)*(z.boss ? 0.05 : 0.6); z.kz += (o.dz || 0)*(z.boss ? 0.05 : 0.6); z.hitT = 0.1; z.revealT = 3;
  if(o.by === PL){ PL.ult = Math.min(1, PL.ult + dmg/ZD.ABILITY.charge); G.dmgDealt = (G.dmgDealt || 0) + dmg;
    if(G.mode === 'survival' && !o.quiet) MO().addPoints(ZD.SURVIVAL.hit); }
  else if(o.by && o.by.def) o.by.ult = Math.min(1, (o.by.ult || 0) + dmg/ZD.ABILITY.charge*0.6);
  if(!o.quiet) W.goo(o.x, o.y, o.z, -(o.dx || 0)*0.3, 0.2, -(o.dz || 0)*0.3, o.by === PL ? (o.head ? 14 : 7) : 4, o.head && o.by === PL);
  // elements
  if(o.element === 'fire'){ z.burn = 3; z.burnDps = Math.max(30, dmg*0.25); }
  else if(o.element === 'shock'){ z.stun = Math.max(z.stun || 0, z.boss ? 0.1 : 0.45); if(!o.chained) W.sparks(o.x, o.y, o.z, 5, 0x9ae8ff); }
  else if(o.element === 'cryo'){ z.chill = 3; z.chillN = (z.chillN || 0) + 1; if(z.chillN >= (z.boss ? 12 : 3) && !(z.frozen > 0)){ z.frozen = z.boss ? 1.2 : 2.2; z.chillN = 0; W.ice(z.x, 1.2, z.z, 18); sfx('freeze', { at:[z.x, z.z] }); } }
  else if(o.element === 'toxic'){ z.poison = 4; z.poisonDps = Math.max(25, dmg*0.15); }
  if(z.boss) AI().bossHit(z, dmg, o);
  if(z.hp <= 0){ C.killZombie(z, o); return 'kill'; }
  return 'hit';
};
C.killZombie = function(z, o){
  o = o || {}; if(z.state === 'dead') return;
  z.state = 'dead'; z.deadT = 0; z.fallDir = Math.random() < 0.8 ? 1 : -1;
  if(z.rig.ring){ z.rig.root.remove(z.rig.ring); }
  const by = o.by;
  if(by === PL){ G.kills++; G.streak++; S.track('kills'); if(o.head){ G.heads++; S.track('heads'); } if(o.melee) S.track('meleeKills'); if(o.explosive) S.track('boomKills');
    PL.ult = Math.min(1, PL.ult + ZD.ABILITY.killCharge); S.addXP(ZD.XP.kill + (o.head ? ZD.XP.head : 0)); sfx('kill'); C.checkStreak(); }
  else if(by && by.def){ G.botKills++; by.ult = Math.min(1, (by.ult || 0) + ZD.ABILITY.killCharge*0.8); if(Math.random() < 0.06) say(by, 'kill'); }
  if(o.head && z.rig.head){ z.rig.head.visible = false; W.goo(o.x, o.y, o.z, 0, 1, 0, 18, true); }
  if(z.type === 'bloater') C.explode(z.x, z.z, ZT.bloater.blast.r, 160, by, { toxic:true, hurtSquad:true, hurtZombies:true, squadDmg:ZT.bloater.blast.dmg });
  if(z.mut === 'volatile') C.explode(z.x, z.z, 3.2, 90, by, { toxic:true, small:true, hurtSquad:true, hurtZombies:true, squadDmg:22, cloud:false });
  if(z.type === 'golden'){ S.track('goldenKills'); MO().onGolden && MO().onGolden(z, by); }
  if(z.stealth) W.fadeZombie(z.rig, 0.9);
  MO().onKill(z, o);
  if(z.boss) AI().bossDead(z, o);
};
C.damageNest = function(n, dmg, x, y, z){
  if(n.dead) return;
  n.hp -= dmg; W.pinkGoo(x, y, z, 5); n.hit = 0.15;
  if(n.hp <= 0){ n.dead = true; W.explosion(n.x, 0.6, n.z, 4); sfx('boom', { at:[n.x, n.z] }); W.remove(n.m); W.shake(0.3); UI().toast('Nest destroyed'); }
};
// owner decides who is safe: the squad's explosions never hurt the squad, unless hurtSquad
// (a bloater bursting); enemy blasts skip zombies unless hurtZombies
C.explode = function(x, z, r, dmg, owner, opt){
  opt = opt || {};
  W.explosion(x, 0.2, z, r, opt.toxic ? true : opt.color); sfx(opt.toxic ? 'splat' : 'boom', { at:[x, z], vol:opt.small ? 0.8 : 1.4 });
  W.shake(clamp((opt.small ? 0.3 : 0.6) - Math.hypot(PL.x - x, PL.z - z)/30, 0.03, 0.6));
  const friendly = owner === PL || (owner && owner.def) || owner === 'squad';
  for(const zz of G.zombies){ if(zz.state === 'dead') continue; const d = Math.hypot(zz.x - x, zz.z - z); if(d > r + (zz.boss ? 1 : 0)) continue;
    const k = 1 - Math.min(1, d/r)*0.6, nx = (zz.x - x)/(d || 1), nz = (zz.z - z)/(d || 1);
    if(!friendly && !opt.hurtZombies) continue;
    C.damageZombie(zz, dmg*k, { x:zz.x, y:1, z:zz.z, dx:nx, dz:nz, by:friendly ? owner : null, explosive:true, element:opt.element, quiet:true });
    if(!zz.boss){ zz.kx += nx*6*k; zz.kz += nz*6*k; } }
  for(const n of (G.nests || [])){ if(n.dead || !friendly) continue; const d = Math.hypot(n.x - x, n.z - z); if(d < r + 1) C.damageNest(n, dmg*(1 - d/(r+1)*0.5), n.x, 1, n.z); }
  if(!friendly || opt.hurtSquad){ const hurt = opt.squadDmg || opt.memberDmg || dmg;
    for(const m of members()){ const d = Math.hypot(m.x - x, m.z - z); if(d < r) C.hurtMember(m, hurt*(1 - d/r*0.6), { x, z }); } }
  if(opt.toxic && opt.cloud !== false) C.addHazard({ kind:'toxic', x, z, r:r*0.8, t:3, dps:friendly ? 30 : 0, enemyDps:0 });
};

// ---- projectiles and hazards ------------------------------------------------------------
C.spawnProjectile = function(p){ p.m = W.makeProjectile(p.kind); p.m.position.set(p.x, p.y, p.z); p.life = p.life || 5; G.proj.push(p); return p; };
function updateProjectiles(dt){
  for(const p of G.proj){
    p.life -= dt; p.vy -= (p.grav || 0)*dt;
    const nx = p.x + p.vx*dt, ny = p.y + p.vy*dt, nz = p.z + p.vz*dt, sx = nx - p.x, sy = ny - p.y, sz = nz - p.z, sl = Math.hypot(sx, sy, sz) || 1e-6;
    let hit = null;
    const wr = rayWorld(p.x, p.y, p.z, sx/sl, sy/sl, sz/sl, sl); if(wr.hit) hit = { x:p.x + sx/sl*wr.t, y:p.y + sy/sl*wr.t, z:p.z + sz/sl*wr.t };
    if(p.owner === 'enemy'){ for(const m of members()){ if(m.down) continue; if(Math.hypot(m.x - nx, m.z - nz) < 0.6 && ny < 2.0){ hit = { x:nx, y:ny, z:nz, m }; break; } } }
    else { for(const z of G.zombies){ if(z.state === 'dead' || z.state === 'rise' || z.fleeing) continue; const s = z.boss ? z.def.scale : ZT[z.type].scale;
      if(Math.hypot(z.x - nx, z.z - nz) < 0.5*s + 0.2 && ny < 2.0*s && ny > 0){ hit = { x:nx, y:ny, z:nz, zb:z }; break; } } }
    p.x = nx; p.y = ny; p.z = nz; p.m.position.set(p.x, p.y, p.z);
    if(p.kind === 'ray' || p.kind === 'void') W.particle('add', p.x, p.y, p.z, 0, 0, 0, 0.2, 0.25, p.kind === 'ray' ? 0.6 : 0.7, p.kind === 'ray' ? 1 : 0.35, p.kind === 'ray' ? 0.25 : 1, 0.8, 0, 0);
    if(p.kind === 'meteor') W.burn(p.x, p.y, p.z);
    if(hit || p.life <= 0){ projectileHit(p, hit || { x:p.x, y:p.y, z:p.z }); p.done = true; W.remove(p.m); }
  }
  if(G.proj.some(p=>p.done)) G.proj = G.proj.filter(p=>!p.done);
}
function projectileHit(p, h){
  if(p.owner === 'enemy'){
    if(p.kind === 'spit'){ W.explosion(h.x, 0.2, h.z, 1.4, true); sfx('spit', { at:[h.x, h.z] }); if(h.m) C.hurtMember(h.m, p.dmg, p.from || h); C.addHazard({ kind:'acid', x:h.x, z:h.z, r:1.8, t:4, enemyDps:10 }); }
    else if(p.kind === 'meteor'){ C.explode(h.x, h.z, 3.2, 0, null, { color:0xff6a2a, memberDmg:p.dmg }); }
    else { if(h.m) C.hurtMember(h.m, p.dmg, p.from || h); W.sparks(h.x, h.y, h.z, 6, p.kind === 'shard' ? 0xa8e8ff : null); if(p.kind === 'shard' && h.m) h.m.chillT = 2; }
    return; }
  if(p.implode){ const x = h.x, z = h.z; W.blink(x, 1, z); sfx('void', { at:[x, z] });
    for(const zz of G.zombies){ if(zz.state === 'dead' || zz.boss) continue; const d = Math.hypot(zz.x - x, zz.z - z); if(d < p.aoe + 2 && d > 0.3){ zz.kx += (x - zz.x)/d*9; zz.kz += (z - zz.z)/d*9; } }
    G.pending = G.pending || []; G.pending.push({ t:0.7, f:()=>C.explode(x, z, p.aoe, p.dmg, p.owner, { color:0xb45cff }) }); return; }
  C.explode(h.x, h.z, p.aoe || 3, p.dmg, p.owner, { toxic:p.element === 'toxic', element:p.element === 'toxic' ? null : p.element, cloud:p.element === 'toxic', small:p.kind === 'ray' });
}
// hazards: toxic clouds, fire rings, boss gas. dps hurts zombies, enemyDps hurts the squad
C.addHazard = function(h){ h.t0 = h.t; G.haz.push(h); return h; };
function updateHazards(dt){
  for(const h of G.haz){
    h.t -= dt; if(h.follow){ h.x = h.follow.x; h.z = h.follow.z; }
    if(Math.random() < dt*8){ if(h.kind === 'toxic' || h.kind === 'gas' || h.kind === 'acid') W.toxicCloud(h.x, h.z, h.r*0.6); else if(h.kind === 'fire'){ for(let i=0;i<3;i++){ const a = Math.random()*6.28, r = Math.random()*h.r; W.burn(h.x + Math.cos(a)*r, 0.1, h.z + Math.sin(a)*r); } } }
    if(h.kind === 'fire' && h.ring){ for(let i=0;i<4;i++){ const a = Math.random()*6.28; W.burn(h.x + Math.cos(a)*h.r, 0.1, h.z + Math.sin(a)*h.r); } }
    if(h.dps) for(const z of G.zombies){ if(z.state === 'dead') continue; if(Math.hypot(z.x - h.x, z.z - h.z) < h.r){ C.damageZombie(z, h.dps*dt, { x:z.x, y:1, z:z.z, dx:0, dz:0, by:h.owner || PL, quiet:true, element:h.kind === 'fire' ? 'fire' : null }); } }
    if(h.enemyDps) for(const m of members()){ if(m.down) continue; if(Math.hypot(m.x - h.x, m.z - h.z) < h.r) C.hurtMember(m, h.enemyDps*dt, h, true); }
  }
  if(G.haz.some(h=>h.t <= 0)) G.haz = G.haz.filter(h=>h.t > 0);
}

// ---- grenades ---------------------------------------------------------------------------
C.throwNade = function(from, tx, tz){
  if(from === PL){ if(PL.nades <= 0 || PL.nadeCool > 0 || PL.down) return; PL.nades--; PL.nadeCool = 0.8; S.track('grenades'); UI().updateHud(true); }
  const m = W.makeGrenade(); let vx, vy, vz;
  if(from === PL){ const B = camBasis(); vx = B.fx*ZD.GRENADE.speed; vy = Math.max(3.5, B.fy*ZD.GRENADE.speed + 4.5); vz = B.fz*ZD.GRENADE.speed; }
  else { const dx = tx - from.x, dz = tz - from.z, d = Math.max(1, Math.hypot(dx, dz)), t = clamp(d/12, 0.6, 1.4); vx = dx/t; vz = dz/t; vy = 4.9*t; }
  const g = { x:from.x, y:1.5, z:from.z, vx, vy, vz, fuse:ZD.GRENADE.fuse, m, owner:from }; m.position.set(g.x, g.y, g.z);
  G.grenades.push(g); sfx('throw');
};
function updateGrenades(dt){
  for(const g of G.grenades){
    g.vy -= 14*dt; const nx = g.x + g.vx*dt, nz = g.z + g.vz*dt; let ny = g.y + g.vy*dt;
    if(ny < 0.11){ ny = 0.11; g.vy = Math.abs(g.vy)*0.35; g.vx *= 0.6; g.vz *= 0.6; }
    const p = { x:nx, z:nz }; if(ny < 5) pushOut(p, 0.12); if(p.x !== nx) g.vx *= -0.5; if(p.z !== nz) g.vz *= -0.5;
    g.x = p.x; g.y = ny; g.z = p.z; g.m.position.set(g.x, g.y, g.z); g.m.rotation.x += dt*10;
    g.fuse -= dt; if(g.fuse <= 0){ C.explode(g.x, g.z, ZD.GRENADE.radius, ZD.GRENADE.dmg*(1 + 0.08*((G.wave || 1) - 1)), g.owner); W.remove(g.m); g.done = true; }
  }
  if(G.grenades.some(g=>g.done)) G.grenades = G.grenades.filter(g=>!g.done);
}

// ---- hurting the squad ---------------------------------------------------------------------
C.hurtMember = function(m, dmg, from, quiet){
  if(m.down || (G.god && m === PL)) return;
  if(m.fx && (m.fx.bulwark > 0)) return;
  if(m === PL && G.pow.shield > 0) return;
  if(G.over) return;
  m.hp -= dmg; m.hurtT = 0;
  if(m === PL && !quiet){ sfx('hurt'); W.shake(0.3); if(from) UI().hurtDir(from); }
  if(m === PL && dmg > 1) G.tookHit = true;
  if(m.hp <= 0){ m.hp = 0; C.goDown(m); }
};
C.goDown = function(m){
  m.down = true; m.bleed = ZD.PLAYER.bleed; m.reviveT = 0; sfx('down'); if(m.fx) m.fx = {};
  if(m === PL){ G.downs++; G.trigger = false; PL.adsT = 0; PL.reloadT = 0; G.streak = 0; UI().setDown(true); PL.lsW = C.makeWeapon('pistol', 0); W.setGunModel(PL.rig, 'pistol'); }
  else say(m, 'down', true);
  if(standing().length === 0) MO().fail('The whole squad went down');
};
C.revive = function(m, by){
  m.down = false; m.hp = m.maxHp*0.5; m.hurtT = 0; m.reviveT = 0; sfx('revive');
  if(m === PL){ UI().setDown(false); PL.lsW = null; const w = curW(); if(w) W.setGunModel(PL.rig, WEAP[w.id].model, ZD.RARITY[w.rar || 0].hex); }
  if(by === PL || (by && by.def)) S.track('revives');
  if(by && by.def) say(by, 'revive', true); else if(m.def) say(m, 'revived', true);
};
C.reviveTime = by => (by && by.def && by.def.medic ? 2 : ZD.PLAYER.revive)*(by === PL && PL.perks.second ? 0.5 : 1);

// ---- abilities -----------------------------------------------------------------------------
C.useAbility = function(m){
  if(!m || m.down || (m.ult || 0) < 1) return false;
  const id = ZD.CHARS[m === PL ? PL.char : m.charId].ability; m.ult = 0; m.fx = m.fx || {};
  sfx('ult'); if(m === PL){ S.track('ults'); UI().banner(ZD.CHARS[PL.char].ult, '', 1.4); } else say(m, 'ult', true);
  switch(id){
    case 'adrenaline': m.fx.adrenaline = 10; W.setAura(m.rig, 0xff4a2a); break;
    case 'deadeye':    m.fx.deadeye = 8; W.setAura(m.rig, 0xffd23a); break;
    case 'medic':      for(const o of members()){ if(o.down && dist(o, m) < 16) C.revive(o, m); if(!o.down) o.hp = o.maxHp; } W.ringFx(m.x, m.z, 6, 0x5be36b); m.fx.medicGlow = 2; W.setAura(m.rig, 0x5be36b); break;
    case 'bulwark':    m.fx.bulwark = 8; W.setAura(m.rig, 0x7fe0ff); W.ringFx(m.x, m.z, 5, 0x7fe0ff);
      for(const z of G.zombies){ if(z.state === 'dead') continue; const d = dist(z, m); if(d < 5){ C.damageZombie(z, 150, { x:z.x, y:1, z:z.z, dx:(z.x - m.x)/(d || 1), dz:(z.z - m.z)/(d || 1), by:m, explosive:true, quiet:true }); if(!z.boss){ z.kx += (z.x - m.x)/(d || 1)*8; z.kz += (z.z - m.z)/(d || 1)*8; } } } break;
    case 'sentry': { const t = { x:m.x + Math.sin(m.yaw)*-1.2, z:m.z + Math.cos(m.yaw)*-1.2, t:25, fireT:0, m:W.makeTurret(), owner:m }; t.m.position.set(t.x, 0, t.z); G.turrets.push(t); break; }
    case 'shadow':     m.fx.shadow = 8; W.setAura(m.rig, 0x6a6a8a); break;
    case 'firestorm':  C.addHazard({ kind:'fire', ring:true, follow:m, x:m.x, z:m.z, r:6, t:6, dps:110, owner:m }); W.ringFx(m.x, m.z, 6, 0xff7a2a); break;
  }
  return true;
};
function tickFx(m, dt){ if(!m.fx) return; let any = false; for(const k in m.fx){ if(m.fx[k] > 0){ m.fx[k] -= dt; any = true; if(m.fx[k] <= 0){ delete m.fx[k]; if(m.rig) W.setAura(m.rig, null); } } } return any; }

// ---- killstreaks ---------------------------------------------------------------------------
C.checkStreak = function(){
  S.track('bestStreak', G.streak, true);
  const ks = ZD.KILLSTREAKS.find(k=>k.n === G.streak); if(!ks) return;
  UI().banner('KILLSTREAK', ks.name, 2, ks.desc); sfx('objective');
  if(ks.id === 'supply'){ const s = { x:PL.x + (Math.random()-0.5)*3, z:PL.z - 2 + (Math.random()-0.5)*2, y:14, m:W.makeSupply(), kind:'supply' }; const p = { x:s.x, z:s.z }; pushOut(p, 1); s.x = p.x; s.z = p.z; s.m.position.set(s.x, s.y, s.z); G.drops.push(s); }
  if(ks.id === 'airstrike'){ const target = densest(); if(target){ A.sfx('horde'); for(let k=0;k<5;k++){ const x = target.x + (k - 2)*2.4*target.dx, z = target.z + (k - 2)*2.4*target.dz; G.pending.push({ t:1.4 + k*0.18, f:()=>C.explode(x, z, 4.5, 700, 'squad') }); } } }
  if(ks.id === 'gunship') G.gunship = 15;
};
function densest(){ let best = null, bn = 0; for(const z of G.zombies){ if(z.state === 'dead') continue; let n = 0; for(const o of G.zombies) if(o.state !== 'dead' && dist(o, z) < 6) n++;
    if(n > bn && dist(z, PL) > 5){ bn = n; best = z; } } if(!best) return null; const d = dist(best, PL) || 1; return { x:best.x, z:best.z, dx:(best.x - PL.x)/d, dz:(best.z - PL.z)/d }; }
function updateKillstreakFx(dt){
  if(G.gunship > 0){ G.gunship -= dt; G.gunT = (G.gunT || 0) - dt;
    if(G.gunT <= 0){ G.gunT = 0.45; const list = G.zombies.filter(z=>z.state !== 'dead' && dist(z, PL) < 35 && !z.fleeing); const z = rnd(list);
      if(z){ W.tracer(z.x + 8, 30, z.z - 10, z.x, 1, z.z, 0xffd28a); C.explode(z.x, z.z, 2.4, 260, 'squad', { small:true }); } } }
}

// ---- power-ups --------------------------------------------------------------------------
C.dropPowerup = function(x, z, id){
  id = id || rnd(ZD.POWERUP_ORDER.filter(p=>p !== 'insta' || Math.random() < 0.6));
  const d = { kind:'powerup', id, x, z, y:0, t:25, m:W.makePowerup(id) }; d.m.position.set(x, 0, z); G.drops.push(d); sfx('blip'); return d;
};
C.applyPowerup = function(id, by){
  const p = ZD.POWERUPS[id]; S.track('powerups'); sfx('powerup'); UI().banner(p.name, '', 1.6); UI().flashColor(p.color);
  if(p.dur) G.pow[id] = p.dur;
  if(id === 'ammo') C.refillAmmo(false);
  if(id === 'health'){ for(const m of members()){ if(m.down) C.revive(m, null); m.hp = m.maxHp; } }
  if(id === 'insta' || id === 'double') A.music.set(1, G.boss != null);
};
function updateDrops(dt){
  for(const d of G.drops){
    if(d.kind === 'powerup'){ d.t -= dt; d.m.rotation.y += dt*2; d.m.userData.icon.position.y = 1.1 + Math.sin(G.t*3)*0.15; d.m.visible = d.t > 5 || Math.sin(G.t*14) > 0;
      for(const m of members()){ if(!m.down && dist(m, d) < 1.4){ C.applyPowerup(d.id, m); d.t = 0; break; } }
      if(d.t <= 0){ W.remove(d.m); d.done = true; } }
    else if(d.kind === 'supply'){ if(d.y > 0){ d.y = Math.max(0, d.y - dt*5); d.m.position.y = d.y; if(d.y === 0){ W.remove(d.m.userData.chute); W.dust(d.x, 0.3, d.z, 12); } }
      else for(const m of members()){ if(!m.down && dist(m, d) < 1.6){ C.refillAmmo(true); for(const o of members()) if(!o.down) o.hp = o.maxHp; sfx('pickup'); UI().toast('Supply drop: ammo, grenades and health'); W.remove(d.m); d.done = true; break; } } }
  }
  if(G.drops.some(d=>d.done)) G.drops = G.drops.filter(d=>!d.done);
}
function tickPowerups(dt){ for(const k in G.pow){ if(G.pow[k] > 0){ G.pow[k] -= dt; if(G.pow[k] <= 0) delete G.pow[k]; } } }

// ---- turrets ------------------------------------------------------------------------------
function updateTurrets(dt){
  for(const t of G.turrets){
    t.t -= dt; t.fireT -= dt;
    let best = null, bd = 18; for(const z of G.zombies){ if(z.state === 'dead' || z.state === 'rise' || z.fleeing) continue; const d = dist(z, t); if(d < bd && segClear(t.x, t.z, z.x, z.z, 0.05, false)){ bd = d; best = z; } }
    const head = t.m.userData.head;
    if(best){ const yaw = Math.atan2(-(best.x - t.x), -(best.z - t.z)); head.rotation.y = yaw;
      if(t.fireT <= 0){ t.fireT = 0.12; head.updateMatrixWorld(true); t.m.userData.muzzle.getWorldPosition(_mz); W.botFlash(_mz.x, _mz.y, _mz.z); W.tracer(_mz.x, _mz.y, _mz.z, best.x, 1.2, best.z, 0xffd28a);
        sfx('smg', { at:[t.x, t.z], vol:0.35 }); C.damageZombie(best, 45*(1 + 0.05*((G.wave || 1) - 1)), { x:best.x, y:1.2, z:best.z, dx:0, dz:0, by:t.owner, quiet:true }); } }
    if(t.t <= 0){ W.remove(t.m); t.done = true; W.dust(t.x, 0.5, t.z, 8); }
  }
  if(G.turrets.some(t=>t.done)) G.turrets = G.turrets.filter(t=>!t.done);
}

// ---- the player ---------------------------------------------------------------------------
function updatePlayer(dt){
  const k = G.keys;
  let ix = 0, iz = 0, turn = 0;
  // With buttons the stick and A/D steer: sideways turns the hero and the camera. While the
  // right thumb aims (dragging the screen, holding FIRE or AIM) the stick strafes instead.
  const steer = buttonsMode() && !G.lookDrag && !G.fireDrag && PL.adsT < 0.5;
  if(G.joy.on){ iz = -G.joy.y; const jx = G.joy.x;
    if(steer){ if(Math.abs(jx) > 0.15) turn = (jx - Math.sign(jx)*0.15)/0.85; } else ix = jx; }
  const kx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  if(buttonsMode()) turn += kx; else ix += kx;
  turn += (k.ArrowRight || k.KeyL ? 1 : 0) - (k.ArrowLeft || k.KeyJ ? 1 : 0);
  if(k.KeyW || k.ArrowUp) iz += 1; if(k.KeyS || k.ArrowDown) iz -= 1;
  if(G.autoMove){ ix = G.autoMove[0]; iz = G.autoMove[1]; turn = 0; }
  turn = clamp(turn, -1, 1);
  if(turn && !PL.down) PL.turnV = lerp(PL.turnV, turn, 1 - Math.exp(-dt*10)); else PL.turnV = lerp(PL.turnV, 0, 1 - Math.exp(-dt*14));
  if(Math.abs(PL.turnV) > 0.001) PL.yaw -= PL.turnV*(PL.adsT > 0.5 ? 1.3 : 2.7)*dt;
  const il = Math.hypot(ix, iz); if(il > 1){ ix /= il; iz /= il; }
  PL.moving = il > 0.12 && !PL.down;
  const wantAds = (G.adsHeld || G.adsToggle) && !PL.down;
  const sprintIn = (k.ShiftLeft || k.ShiftRight || G.sprintBtn || (G.joy.on && il > 0.97)) && iz > 0.3;
  PL.sprint = sprintIn && !wantAds && !G.trigger && PL.reloadT <= 0 && PL.meleeT <= 0 && !PL.down;
  PL.adsT = clamp(PL.adsT + (wantAds && !PL.sprint ? dt : -dt)*7, 0, 1);
  const spMul = (PL.perks.sprinter ? 1.2 : 1)*(G.pow.speed > 0 ? 1.3 : 1)*(PL.fx.adrenaline > 0 ? 1.35 : 1)*(PL.chillT > 0 ? 0.6 : 1);
  const sp = (PL.sprint ? ZD.PLAYER.sprint : lerp(ZD.PLAYER.walk, ZD.PLAYER.ads, PL.adsT))*spMul;
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw), rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw);
  const tvx = (fx*iz + rx*ix)*sp, tvz = (fz*iz + rz*ix)*sp, a = 1 - Math.exp(-dt*14);
  PL.vx += (tvx - PL.vx)*a; PL.vz += (tvz - PL.vz)*a;
  if(!PL.down){ PL.x += PL.vx*dt + (PL.pullX || 0)*dt; PL.z += PL.vz*dt + (PL.pullZ || 0)*dt; }
  PL.pullX = (PL.pullX || 0)*Math.max(0, 1 - dt*5); PL.pullZ = (PL.pullZ || 0)*Math.max(0, 1 - dt*5);
  for(const z of G.zombies){ if(z.state === 'dead' || z.state === 'rise') continue; const s = z.boss ? z.def.scale : ZT[z.type].scale;
    const dx = PL.x - z.x, dz = PL.z - z.z, d = Math.hypot(dx, dz), m = 0.36 + 0.3*s; if(d < m && d > 0.001){ const push = z.boss ? 1 : 0.7; PL.x += dx/d*(m - d)*push; PL.z += dz/d*(m - d)*push; if(!z.boss){ z.x -= dx/d*(m - d)*0.3; z.z -= dz/d*(m - d)*0.3; } } }
  pushOut(PL, ZD.PLAYER.radius);
  PL.fireT -= dt; PL.meleeCool -= dt; PL.nadeCool -= dt; if(PL.meleeT > 0) PL.meleeT -= dt; if(PL.swapT > 0) PL.swapT -= dt; if(PL.chillT > 0) PL.chillT -= dt;
  if(PL.reloadT > 0){ PL.reloadT -= dt; if(PL.reloadT <= 0){ PL.reloadT = 0; finishReload(); } }
  PL.kick *= Math.exp(-dt*9); PL.kickYaw *= Math.exp(-dt*9); PL.bloom *= Math.exp(-dt*5); PL.recoil = Math.max(0, PL.recoil - dt);
  const w = curW();
  if(w && !PL.down){ const d = WEAP[w.id];
    if(G.trigger && (d.auto || G.triggerPressed)) C.fire();
    G.triggerPressed = false;
    if(w.mag === 0 && w.res > 0 && PL.reloadT <= 0 && !G.trigger && PL.fireT < -0.25) startReload(); }
  if(PL.down && PL.lsW){ if(G.trigger && G.triggerPressed) C.fire(); G.triggerPressed = false; if(PL.lsW.mag <= 0){ PL.lsW.mag = 12; PL.fireT = 1.0; } }
  if(G.flameT > 0){ G.flameT -= dt; if(G.flameT <= 0) A.loop('flame', true, 0); }
  if(PL.down){ PL.bleed -= dt; if(PL.bleed <= 0) MO().fail('You bled out before help arrived'); }
  else { PL.hurtT += dt; const delay = ZD.PLAYER.regenDelay*(PL.perks.second ? 0.5 : 1), rate = ZD.PLAYER.regen*(PL.perks.second ? 2 : 1);
    if(PL.hurtT > delay && PL.hp < PL.maxHp) PL.hp = Math.min(PL.maxHp, PL.hp + rate*dt); }
  if(buttonsMode() && S.data.settings.assist && (G.trigger || PL.adsT > 0.5)) aimAssist(dt);
  if(buttonsMode() && PL.moving && !G.lookDrag && !G.fireDrag && !G.trigger) PL.pitch += (-0.08 - PL.pitch)*Math.min(1, dt*1.5);
  tickFx(PL, dt);
  PL.rig.root.position.set(PL.x, 0, PL.z); PL.rig.root.rotation.y = PL.yaw;
  W.animSoldier(PL.rig, { moving:PL.moving, sprint:PL.sprint, back:iz < -0.2, pitch:PL.pitch, ads:PL.adsT > 0.5, reload:PL.reloadT, swap:PL.swapT, melee:PL.meleeT, recoil:PL.recoil, down:PL.down }, dt);
}
// with buttons, holding FIRE (or AIM) pulls the view onto the closest zombie near the crosshair
function aimAssist(dt){
  const B = camBasis(), cam = W.camera; let best = null, ba = TOUCH ? 0.3 : 0.22;
  for(const z of G.zombies){ if(z.state === 'dead' || z.state === 'rise' || z.fleeing || (z.stealth && z.alpha < 0.4)) continue; if(Math.hypot(z.x - PL.x, z.z - PL.z) > 32) continue;
    refreshRig(z); (z.boss && z.rig.weak ? z.rig.weak : z.rig.headMesh).getWorldPosition(_hv);
    const dx = _hv.x - cam.position.x, dy = _hv.y - (z.boss ? 0 : 0.4) - cam.position.y, dz = _hv.z - cam.position.z, d = Math.hypot(dx, dy, dz);
    const ang = Math.acos(clamp((dx*B.fx + dy*B.fy + dz*B.fz)/d, -1, 1)); if(ang < ba){ ba = ang; best = { dx, dy, dz, d }; } }
  if(!best) return;
  const yaw = Math.atan2(-best.dx, -best.dz), pitch = Math.asin(best.dy/best.d);
  const rate = (PL.adsT > 0.5 ? 2.8 : 2.0)*dt; PL.yaw += clamp(wrap(yaw - PL.yaw), -rate, rate); PL.pitch += clamp(pitch - PL.pitch, -rate, rate);
}

// ---- interaction ------------------------------------------------------------------------------
// every frame the modes hand over what can be used nearby; hold or tap USE (E) on it
function findInteract(){
  if(PL.down) return null;
  let best = null, bd = 1e9;
  for(const b of BOTS){ if(!b.down) continue; const d = dist(b, PL); if(d < 1.8 && d < bd){ bd = d; best = { kind:'revive', who:b, hold:true, time:C.reviveTime(PL), text:'revive ' + b.name }; } }
  if(best) return best;
  for(const it of MO().interactables()){ const d = Math.hypot(it.x - PL.x, it.z - PL.z); if(d < (it.r || 1.8) && d < bd){ bd = d; best = it; } }
  return best;
}
function useInteract(dt){
  const it = G.interact;
  if(!it){ G.useT = 0; return; }
  if(it.kind === 'revive'){ if(G.useHeld){ it.who.reviveT += dt; if(it.who.reviveT >= it.time) C.revive(it.who, PL); } return; }
  if(it.zone) return;               // standing in a circle does the work
  if(it.hold){ if(G.useHeld){ G.useT += dt; if(G.useT >= it.time){ G.useT = 0; tryAct(it); G.useHeld = false; } } else G.useT = Math.max(0, G.useT - dt*2); return; }
  if(G.usePressed) tryAct(it);
}
function tryAct(it){
  if(it.cost && G.mode === 'survival'){ if(G.points < it.cost){ sfx('deny'); UI().toast('Not enough points'); return; } MO().spend(it.cost); }
  it.act();
}

// ---- input --------------------------------------------------------------------------------------
function requestLock(){
  const c = W.renderer.domElement; if(buttonsMode() || !c.requestPointerLock) return;
  try{ const p = c.requestPointerLock(); if(p && p.catch) p.catch(()=>showClick()); }catch(e){ showClick(); }
  setTimeout(()=>{ if(!document.pointerLockElement) showClick(); }, 300);
}
C.requestLock = requestLock;
function showClick(){ if(G.phase === 'play' && !G.over && !G.paused && !G.adPaused && !G.uiPause && !buttonsMode()) $('clickWrap').classList.add('show'); }
C.setPaused = function(on){
  if(G.phase !== 'play' || G.over || G.paused === on) return; G.paused = on; UI().showPause(on); $('clickWrap').classList.remove('show');
  if(on){ G.trigger = false; G.adsHeld = false; G.sprintBtn = false; G.useHeld = false; if(document.pointerLockElement) document.exitPointerLock(); if(typeof window.onGameplayStop === 'function') window.onGameplayStop(); }
  else { if(typeof window.onGameplayStart === 'function') window.onGameplayStart(); requestLock(); }
};
C.setUiPause = function(on){ G.uiPause = on; if(on){ G.trigger = false; G.useHeld = false; if(document.pointerLockElement) document.exitPointerLock(); } else requestLock(); };
function look(dx, dy, s){ PL.yaw -= dx*s; PL.pitch -= dy*s*(S.data.settings.invert ? -1 : 1); PL.pitch = clamp(PL.pitch, -1.0, 0.75); }
const playing = C.playing = ()=>G.phase === 'play' && !G.paused && !G.over && !G.adPaused && !G.uiPause;
function bindInput(){
  const c = W.renderer.domElement;
  addEventListener('keydown', e=>{
    if(e.code === 'KeyP' || (e.code === 'Escape' && buttonsMode())){ if(G.uiPause){ UI().closeOverlays(); return; } if(G.phase === 'play' && !G.over) C.setPaused(!G.paused); return; }
    if(e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if(G.keys[e.code]) return; G.keys[e.code] = true;
    if(!playing()) return;
    A.unlock();
    if(e.code === 'Space'){ G.trigger = true; G.triggerPressed = true; }
    if(e.code === 'KeyR') startReload();
    if(e.code === 'KeyE'){ G.useHeld = true; G.usePressed = true; }
    if(e.code === 'KeyV' || e.code === 'KeyF') C.melee();
    if(e.code === 'KeyG') C.throwNade(PL);
    if(e.code === 'KeyX' || e.code === 'KeyC') C.useAbility(PL);
    if(e.code === 'Enter') MO().skipBreak && MO().skipBreak();
    if(e.code === 'KeyQ' || (e.code === 'Digit1' && PL.cur !== 0) || (e.code === 'Digit2' && PL.cur !== 1)) swapWeapon();
  });
  addEventListener('keyup', e=>{ G.keys[e.code] = false; if(e.code === 'KeyE') G.useHeld = false; if(e.code === 'Space') G.trigger = false; });
  addEventListener('blur', ()=>{ G.keys = {}; G.trigger = false; G.adsHeld = false; G.useHeld = false; G.sprintBtn = false; G.lookDrag = false; G.fireDrag = false; });
  c.addEventListener('mousedown', e=>{ A.unlock(); if(buttonsMode() || !playing()) return;
    if(!document.pointerLockElement){ requestLock(); return; }
    if(e.button === 0){ G.trigger = true; G.triggerPressed = true; } if(e.button === 2) G.adsHeld = true; });
  addEventListener('mouseup', e=>{ if(buttonsMode()) return; if(e.button === 0) G.trigger = false; if(e.button === 2) G.adsHeld = false; });
  c.addEventListener('contextmenu', e=>e.preventDefault()); $('tc').addEventListener('contextmenu', e=>e.preventDefault());
  addEventListener('wheel', e=>{ if(playing() && Math.abs(e.deltaY) > 10) swapWeapon(); }, { passive:true });
  addEventListener('mousemove', e=>{ if(!document.pointerLockElement || !playing()) return; look(e.movementX, e.movementY, 0.0022*S.data.settings.sens*(PL.adsT > 0.5 ? 0.6 : 1)); });
  document.addEventListener('pointerlockchange', ()=>{ if(document.pointerLockElement) $('clickWrap').classList.remove('show');
    else if(!buttonsMode() && playing()) C.setPaused(true); });
  $('clickWrap').addEventListener('click', ()=>{ A.unlock(); requestLock(); });
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden && G.phase === 'play' && !G.over) C.setPaused(true); });
  bindButtons();
}
// on-screen controls, the same feel as the football game: a floating stick on the left,
// a cluster of round buttons on the right. Pointer events, so a finger and a mouse both work.
function bindButtons(){
  const zone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob'), lookZ = $('lookZone'), tc = $('tc');
  const stick = { id:null, ox:0, oy:0 }, lk = { id:null, x:0, y:0 }, fp = { id:null, x:0, y:0 }, R = 56;
  const lookS = () => (TOUCH ? 0.0058 : 0.0045)*S.data.settings.sens*(PL.adsT > 0.5 ? 0.55 : 1);
  const place = (el, x, y)=>{ el.style.left = x + 'px'; el.style.top = y + 'px'; };
  zone.addEventListener('pointerdown', e=>{ e.preventDefault(); A.unlock(); if(!playing() || stick.id !== null) return;
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; try{ zone.setPointerCapture(e.pointerId); }catch(_){}
    G.joy.on = true; G.joy.x = G.joy.y = 0; place(base, e.clientX, e.clientY); place(knob, e.clientX, e.clientY); tc.classList.add('stickOn'); });
  zone.addEventListener('pointermove', e=>{ if(e.pointerId !== stick.id) return; let dx = (e.clientX - stick.ox)/R, dy = (e.clientY - stick.oy)/R; const l = Math.hypot(dx, dy); if(l > 1){ dx /= l; dy /= l; }
    G.joy.x = dx; G.joy.y = dy; place(knob, stick.ox + dx*R, stick.oy + dy*R); });
  const stickEnd = e=>{ if(e.pointerId !== stick.id) return; stick.id = null; G.joy.on = false; G.joy.x = G.joy.y = 0; tc.classList.remove('stickOn'); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t=>zone.addEventListener(t, stickEnd));
  lookZ.addEventListener('pointerdown', e=>{ e.preventDefault(); A.unlock(); if(!playing() || lk.id !== null) return; lk.id = e.pointerId; lk.x = e.clientX; lk.y = e.clientY; G.lookDrag = true; try{ lookZ.setPointerCapture(e.pointerId); }catch(_){} });
  lookZ.addEventListener('pointermove', e=>{ if(e.pointerId !== lk.id || !playing()) return; look(e.clientX - lk.x, e.clientY - lk.y, lookS()); lk.x = e.clientX; lk.y = e.clientY; });
  const lookEnd = e=>{ if(e.pointerId === lk.id){ lk.id = null; G.lookDrag = false; } };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t=>lookZ.addEventListener(t, lookEnd));
  const bf = $('bFire');
  bf.addEventListener('pointerdown', e=>{ e.preventDefault(); e.stopPropagation(); A.unlock(); if(!playing()) return; fp.id = e.pointerId; fp.x = e.clientX; fp.y = e.clientY;
    try{ bf.setPointerCapture(e.pointerId); }catch(_){} G.trigger = true; G.triggerPressed = true; G.fireDrag = true; bf.classList.add('on'); });
  bf.addEventListener('pointermove', e=>{ if(e.pointerId !== fp.id || !playing()) return; look(e.clientX - fp.x, e.clientY - fp.y, lookS()); fp.x = e.clientX; fp.y = e.clientY; });
  const fend = e=>{ if(e.pointerId !== fp.id) return; fp.id = null; G.trigger = false; G.fireDrag = false; bf.classList.remove('on'); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t=>bf.addEventListener(t, fend));
  const btn = (id, down, up)=>{ const el = $(id);
    el.addEventListener('pointerdown', e=>{ e.preventDefault(); e.stopPropagation(); A.unlock(); if(!playing()) return; el.classList.add('on'); down(); });
    const off = ()=>{ if(!el.classList.contains('on')) return; el.classList.remove('on'); if(up) up(); };
    el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off); };
  btn('bNade', ()=>C.throwNade(PL)); btn('bReload', startReload); btn('bSwap', swapWeapon); btn('bKnife', C.melee);
  btn('bAim', ()=>{ G.adsToggle = !G.adsToggle; $('bAim').classList.toggle('lock', G.adsToggle); });
  btn('bSprint', ()=>{ G.sprintBtn = true; }, ()=>{ G.sprintBtn = false; });
  btn('bUse', ()=>{ G.useHeld = true; G.usePressed = true; }, ()=>{ G.useHeld = false; });
  btn('bUlt', ()=>C.useAbility(PL));
  $('bPause').addEventListener('click', ()=>C.setPaused(true));
}
C.applyControls = function(){ $('app').classList.toggle('buttons', buttonsMode()); };

// ---- the session: one place that builds a map and the squad for a mode -----------------------------
C.loadMap = function(mapIndex){
  const M = G.M = ZD.generateMap(mapIndex);
  W.buildMap(M); C.buildColliders(); C.buildNav();
  const T = M.T, wet = T.weather === 'rain' || T.weather === 'storm';
  W.setEnv(T.env, 0); W.setWeather(T.outdoor || !wet ? T.weather : null); A.ambience(T.amb); A.rain(wet ? (T.outdoor ? 1 : 0.35) : 0);
  W.flashlight(false);
  return M;
};
C.makeSquad = function(){
  BOTS.forEach(b=>W.remove(b.rig.root)); BOTS.length = 0;
  const lo = S.data.loadout, mine = lo.char;
  const pool = ZD.CHAR_ORDER.filter(c=>c !== mine && S.owns('chars', c)).slice(0, 3);
  while(pool.length < 3) pool.push(ZD.CHAR_ORDER.filter(c=>c !== mine && !pool.includes(c))[0]);
  for(const id of pool){ const def = ZD.CHARS[id], rig = W.makeSoldier(id, S.outfitOf(id), { tag:true });
    BOTS.push({ def, charId:id, rig, name:def.name, weapon:def.weapon, x:0, z:0, yaw:0, hp:def.hp*1.5, maxHp:def.hp*1.5, hurtT:99, down:false, reviveT:0, fireT:0, mag:WEAP[def.weapon].mag,
      reloadT:0, path:null, pathT:0, goal:null, task:'follow', target:null, aimT:0, sayT:0, moving:false, lx:0, lz:0, stuckT:0, nadeCool:8 + Math.random()*8, ult:0.3, fx:{},
      slot:[[-2.6, 2.4], [2.6, 2.4], [0, 4.2]][BOTS.length] }); }
};
C.resetPlayer = function(){
  const lo = S.data.loadout, M = G.M, sp = M.startPos;
  if(PL.rig) W.remove(PL.rig.root);
  PL.char = lo.char; PL.rig = W.makeSoldier(lo.char, S.outfitOf(lo.char), { weapon:lo.primary });
  PL.melee = lo.melee; W.setMeleeModel(PL.rig, ZD.MELEE[lo.melee].model);
  Object.assign(PL, { x:sp.x, z:sp.z, vx:0, vz:0, yaw:sp.yaw, pitch:-0.08, hurtT:99, weapons:[], cur:0, fireT:0, reloadT:0, swapT:0, meleeT:0, meleeCool:0, adsT:0, kick:0, kickYaw:0,
    bloom:0, recoil:0, down:false, bleed:0, reviveT:0, nades:ZD.GRENADE.start, nadeCool:0, turnV:0, perks:{}, fx:{}, ult:0, chillT:0, pullX:0, pullZ:0 });
  PL.maxHp = ZD.CHARS[lo.char].hp; PL.hp = PL.maxHp;
  UI().setDown(false);
};
C.placeSquad = function(){
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw), rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw);
  BOTS.forEach(b=>{ const s = b.slot; b.x = PL.x + rx*s[0] - fx*s[1]; b.z = PL.z + rz*s[0] - fz*s[1]; b.yaw = PL.yaw; const p = { x:b.x, z:b.z }; pushOut(p, 0.4); b.x = p.x; b.z = p.z; });
};
C.clearWorld = function(){
  for(const z of G.zombies) W.remove(z.rig.root); G.zombies = [];
  for(const p of G.proj) W.remove(p.m); G.proj = [];
  for(const g of G.grenades) W.remove(g.m); G.grenades = [];
  for(const d of G.drops) W.remove(d.m); G.drops = [];
  for(const t of G.turrets) W.remove(t.m); G.turrets = [];
  G.haz = []; G.pending = []; G.pow = {}; G.gunship = 0; G.boss = null;
  A.loop('rotor', false); A.loop('flame', false); A.loop('train', false);
};
C.beginPlay = function(){
  Object.assign(G, { phase:'play', paused:false, over:false, uiPause:false, t:0, slow:1, kills:0, botKills:0, heads:0, downs:0, streak:0, interact:null, useT:0, ap:null, autoMove:null,
    trigger:false, adsHeld:false, adsToggle:false, sprintBtn:false, useHeld:false, keys:{}, dmgDealt:0, shotsFired:0, tookHit:false });
  feedQ = []; UI().renderFeed(); $('bAim').classList.remove('lock');
  updateCamera(1);
  if(typeof window.onGameplayStart === 'function') window.onGameplayStart();
  if(!buttonsMode()) requestLock();
  else if((S.data.settings.tips || 0) < 3){ S.data.settings.tips = (S.data.settings.tips || 0) + 1; S.persist();
    setTimeout(()=>{ if(G.phase === 'play' && G.t < 14) UI().toast(TOUCH ? 'Stick left / right turns you · drag the screen to look around' : 'A / D or ← / → turn you · drag the screen to look around', 4200); }, 4300); }
};

// ---- simulation step ---------------------------------------------------------------------------
function step(dt){
  G.t += dt; G.feedT -= dt;
  if(G.pending && G.pending.length){ for(const p of G.pending){ p.t -= dt; if(p.t <= 0){ p.done = true; p.f(); } } G.pending = G.pending.filter(p=>!p.done); }
  if(!G.over){
    updatePlayer(dt);
    NAV.timer -= dt; if(NAV.timer <= 0){ NAV.timer = 0.35; C.updateFlow(); }
    BOTS.forEach((b, i)=>{ AI().updateBot(b, i, dt); tickFx(b, dt); b.sayT -= dt; });
    MO().update(dt);
    if(!G.over){ G.interact = findInteract(); useInteract(dt); }
    G.usePressed = false;
    if(PL.down && PL.reviveT > 0 && !BOTS.some(b=>!b.down && dist(b, PL) < 1.6)) PL.reviveT = Math.max(0, PL.reviveT - dt*0.5);
    for(const b of BOTS) if(b.down && b.reviveT > 0 && !(G.interact && G.interact.who === b && G.useHeld) && !BOTS.some(o=>o !== b && !o.down && dist(o, b) < 1.6)) b.reviveT = Math.max(0, b.reviveT - dt*0.5);
    if(G.auto) AI().autopilot(dt); else G.autoMove = null;
    tickPowerups(dt); updateKillstreakFx(dt); updateTurrets(dt); updateDrops(dt);
  } else if(G.slow < 1) G.slow = Math.min(1, G.slow + dt*0.3);
  AI().updateZombies(dt);
  updateGrenades(dt); updateProjectiles(dt); updateHazards(dt);
}
C.step = step;

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
    if(!G.paused && !G.adPaused && !G.uiPause){ let sim = dt*G.slow; while(sim > 1e-6){ const h = Math.min(sim, 1/60); step(h); sim -= h; } }
    updateCamera(dt); W.applyShake();
    G.hudT += dt; if(G.hudT > 0.1){ G.hudT = 0; UI().updateHud(); UI().renderSquad(); }
    UI().updateHudFrame(dt);
    BOTS.forEach(b=>{ if(b.rig.tag) b.rig.tag.visible = dist(b, PL) > 2.5; });
    MO().frame && MO().frame(dt);
  } else if(G.phase === 'menu') ZD.UI.menuStep(dt);
  W.tick(dt);
  W.render();
  if(S.data.settings.quality === 'auto' && G.phase === 'play' && !G.paused && dt > 0){ fpsAcc += dt; fpsN++;
    if(fpsAcc > 4){ const fps = fpsN/fpsAcc; fpsAcc = 0; fpsN = 0; if(fps < 40 && ++fpsLow >= 2){ fpsLow = 0; W.setQuality('low'); W.lowFx = true; } } }
}
C.frame = frame;

// ---- portal integration ----------------------------------------------------------------------------
window.gamePauseForAd = function(on){
  G.adPaused = !!on; A.setMuted(!!on);
  if(on){ G.trigger = false; G.adsHeld = false; if(document.pointerLockElement) document.exitPointerLock(); }
  else showClick();
};
window.gameIsPaused = function(){ return G.adPaused || G.paused; };
// kind: 'preroll' right before a match starts, 'midgame' on NEXT / REPLAY / RETRY / MENU / QUIT.
// A publisher hook taking (kind, done) plays the ad first and calls done when it ends.
window.gameAdBreak = function(kind, done){
  const fn = window.gameShowAd;
  if(typeof fn === 'function'){ try{ if(fn.length >= 2){ fn(kind || 'midgame', done || function(){}); return; } fn(kind || 'midgame'); }catch(e){} }
  if(typeof done === 'function') done();
};

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
  THREE = window.THREE; _hv = new THREE.Vector3(); _mz = new THREE.Vector3(); _v2 = new THREE.Vector3(); S.load();
  const st = S.data.settings, q = st.quality === 'auto' ? (TOUCH ? 'medium' : 'high') : st.quality;
  W.init($('mount'), q, TOUCH); W.lowFx = q === 'low';
  if(TOUCH) $('app').classList.add('touch');
  C.applyControls();
  bindInput(); ZD.UI.init();
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
ZD.dbg = { G, PL, BOTS, W, NAV, C, step:dt=>step(dt), frame:dt=>frame(dt || 1/60),
  simulate:(sec, fps)=>{ fps = fps || 60; const n = Math.round(sec*fps); for(let i=0; i<n && !G.over; i++){ step(1/fps); updateCamera(1/fps); } return G.t; } };

})(window.ZD);

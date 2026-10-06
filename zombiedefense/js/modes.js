// Zombie Squad - the two ways to play and everything that happens on a map:
// Campaign missions (all objective types, mystery missions, areas that unlock),
// Survival (waves, points, doors, wall-buys, perks, power, mystery box, upgrade station,
// wave events, zombie and map evolution), the secret-room mystery and the horror director.
(function(ZD){
const W = ZD.W, A = ZD.A, S = ZD.S, ZT = ZD.ZOMBIES, WEAP = ZD.WEAPONS;
const MO = ZD.Modes = {};
const C = ZD.C, G = C.G, PL = C.PL, BOTS = C.BOTS, clamp = C.clamp, lerp = C.lerp, rnd = C.rnd, dist = C.dist;
const UI = ()=>ZD.UI, AI = ()=>ZD.AI;
const SV = ZD.SURVIVAL;
const shuffle = a=>{ for(let i=a.length-1;i>0;i--){ const j = (Math.random()*(i+1))|0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

// ---- zones and doors -------------------------------------------------------------------
function roleZones(role){
  const M = G.M, zs = M.zones.filter(z=>z.kind !== 'secret');
  const by = f=>zs.filter(f);
  let out = [];
  if(role === 'start') out = [M.zones[M.start]];
  else if(role === 'arena') out = [M.zones[M.arena]];
  else if(role === 'near') out = by(z=>z.depth === 1);
  else if(role === 'mid'){ const md = Math.max(1, Math.round(M.maxDepth/2)); out = by(z=>z.depth === md && z.kind !== 'arena'); if(!out.length) out = by(z=>z.depth >= 1 && z.kind !== 'arena'); }
  else if(role === 'far'){ out = by(z=>z.depth >= M.maxDepth - 1 && z.kind !== 'arena' && z.depth > 0); if(!out.length) out = by(z=>z.depth >= 2); }
  else out = by(z=>z.kind !== 'start');
  return out.length ? out : by(z=>z.kind !== 'start');
}
const usedSpots = new Set();
function spotIn(zone){
  const free = zone.spots.filter(s=>!usedSpots.has(s));
  const s = free.length ? rnd(free) : { x:zone.cx + (Math.random() - 0.5)*4, z:zone.cz + (Math.random() - 0.5)*4 };
  usedSpots.add(s); return { x:s.x, z:s.z, zone:zone.i };
}
function computeOpenZones(){
  const M = G.M, open = new Array(M.zones.length).fill(false); open[M.start] = true; const q = [M.start];
  while(q.length){ const i = q.shift(); for(const bi of M.zones[i].nb){ const b = M.borders[bi]; const o = b.a === i ? b.b : b.a; if(open[o]) continue;
    const pass = b.type === 'open' || (b.door >= 0 && M.doors[b.door].open) || b.fallen; if(pass){ open[o] = true; q.push(o); } } }
  G.zoneOpen = open;
}
MO.openDoor = function(d, instant){ if(d.open) return; C.setDoorOpen(d, instant); computeOpenZones(); };
// campaign: open every door on the way from the start to a zone (the map grows with the mission)
function openPathTo(zi){
  const M = G.M, prev = new Array(M.zones.length).fill(-2); prev[M.start] = -1; const q = [M.start];
  while(q.length){ const i = q.shift(); if(i === zi) break; for(const bi of M.zones[i].nb){ const b = M.borders[bi]; if(b.type !== 'open' && b.type !== 'door' && !b.fallen) continue;
    const o = b.a === i ? b.b : b.a; if(prev[o] !== -2) continue; prev[o] = bi; q.push(o); } }
  let opened = 0, cur = zi;
  while(cur !== M.start && prev[cur] >= 0){ const b = M.borders[prev[cur]]; if(b.door >= 0 && !M.doors[b.door].open){ MO.openDoor(M.doors[b.door]); opened++; } cur = b.a === cur ? b.b : b.a; }
  return opened;
}
function collapseWall(border){
  const M = G.M, b = M.borders[border]; if(b.fallen) return; b.fallen = true;
  const walls = M.walls.filter(w=>w.border === border);
  for(const w of walls){ if(w.obj){ const o = w.obj; W.anims.push({ t:0, dur:1.4, f:k=>{ o.position.y = -w.h*k*1.05; if(k >= 1) W.remove(o); } }); }
    W.dust((w.x0 + w.x1)/2, 1, (w.z0 + w.z1)/2, 30); }
  M.walls = M.walls.filter(w=>w.border !== border);
  C.buildColliders(); C.rebuildNav(); computeOpenZones(); A.sfx('boom'); W.shake(0.5);
  UI().banner('THE MAP CHANGED', 'A wall came down. A new way opened.', 2.6);
}

// ---- shared spawning --------------------------------------------------------------------------
MO.hpMul = ()=>G.mode === 'survival' ? 1 + 0.1*((G.wave || 1) - 1) + 0.005*Math.pow((G.wave || 1) - 1, 2) : 1 + 0.15*((G.intensity || 1) - 1);
MO.zombieMix = function(){
  if(G.mode === 'campaign') return (G.mission && G.mission.mix) || G.M.def.mix;
  const w = G.wave || 1, m = { runner:Math.min(0.35, 0.05 + w*0.02) };
  if(w >= 3) m.brute = Math.min(0.1, 0.02 + w*0.004); if(w >= 4) m.bloater = 0.06; if(w >= 6) m.armored = 0.08; if(w >= 7) m.climber = 0.07;
  if(w >= 8) m.shield = 0.07; if(w >= 9) m.healer = 0.05; if(w >= 11) m.stealth = 0.07; if(w >= 12) m.mutant = 0.06; if(w >= 13) m.teleport = 0.06; if(w >= 15) m.giant = 0.015;
  return m;
};
MO.pickType = function(mix){ let r = Math.random(); for(const k in mix){ r -= mix[k]; if(r < 0) return k; } return 'walker'; };
// a spawn point in an open zone, away from the squad and preferably out of sight
function spawnPoint(){
  const M = G.M, cam = W.camera, B = C.camBasis(), list = [];
  const pz = C.zoneAt(PL.x, PL.z);
  for(const z of M.zones){ if(!G.zoneOpen[z.i] || z.kind === 'secret') continue;
    for(const s of z.spawns){ const d = Math.min(...C.members().filter(m=>!m.down).map(m=>dist(m, s)).concat([dist(PL, s)])); if(d < 13 || d > 48) continue;
      if(C.flowDist(s.x, s.z) > 75) continue; list.push(s); } }
  if(!list.length){ for(let k=0;k<30;k++){ const a = Math.random()*Math.PI*2, r = 16 + Math.random()*18, x = PL.x + Math.cos(a)*r, z = PL.z + Math.sin(a)*r, c = C.navCell(x, z);
      if(c < 0 || C.NAV.blocked[c] || C.NAV.dist[c] > 70) continue; const zi = C.zoneAt(x, z); if(zi < 0 || !G.zoneOpen[zi]) continue; return { x, z }; } return null; }
  for(let k=0; k<8; k++){ const s = rnd(list), dx = s.x - cam.position.x, dz = s.z - cam.position.z, dl = Math.hypot(dx, dz) || 1;
    if((dx*B.fx + dz*B.fz)/dl > 0.4 && C.segClear(PL.x, PL.z, s.x, s.z, 0, false) && k < 7) continue; return s; }
  void pz; return rnd(list);
}
MO.spawnPoint = spawnPoint;
function zCap(){ return C.TOUCH ? ZD.DIRECTOR.maxAliveMobile : ZD.DIRECTOR.maxAlive; }
function spawnOne(type, o){ const p = spawnPoint(); if(!p) return null; return AI().spawnZombie(type, p.x + (Math.random() - 0.5)*0.6, p.z + (Math.random() - 0.5)*0.6, Object.assign({ hpMul:MO.hpMul() }, o || {})); }

// ---- kills, points ------------------------------------------------------------------------------
MO.addPoints = function(n, at){ if(G.mode !== 'survival') return; n = Math.round(n*(G.pow.double > 0 ? 2 : 1)*(PL.perks.cashflow ? 1.5 : 1)*(G.bloodFog ? 2 : 1)); G.points += n; UI().popPoints(n); };
MO.spend = function(n){ G.points -= n; UI().popPoints(-n); A.sfx('buy'); };
MO.onKill = function(z, o){
  const by = o.by;
  if(G.mode === 'survival'){
    if(by === PL){ MO.addPoints(z.boss ? 1000 : (o.melee ? SV.melee : SV.kill + (o.head ? SV.head : 0)) + (o.explosive ? 20 : 0) - SV.hit); }
    else if(by && by.def) MO.addPoints(25);
    if(z.type === 'golden'){ MO.addPoints(2000); C.dropPowerup(z.x, z.z); }
    if(!z.boss && G.dropsThisWave < SV.dropsPerWave && Math.random() < SV.dropChance){ G.dropsThisWave++; C.dropPowerup(z.x, z.z); }
  } else {
    if(!z.boss && Math.random() < 0.012) C.dropPowerup(z.x, z.z);
    if(G.st && G.st.type === 'kill') G.st.done++;
  }
};
MO.onGolden = function(){ UI().banner('GOLDEN ZOMBIE', 'Caught it!', 2); };

// ---- campaign -------------------------------------------------------------------------------------
MO.startMission = function(mapIndex, missionIndex){
  const def = ZD.MAPS[mapIndex], ms = def.missions[missionIndex];
  C.clearWorld(); MO.clearObjectives();
  G.mode = 'campaign'; G.mission = ms; G.mapIndex = mapIndex; G.intensity = ms.intensity; G.wave = 0;
  C.loadMap(mapIndex); usedSpots.clear(); computeOpenZones();
  for(const d of G.M.doors) if(d.kind === 'door') W.setDoorLabel(d, 'LOCKED', '#b8b0a8');
  hideSurvivalGear(true);
  C.resetPlayer(); C.makeSquad(); C.placeSquad();
  const lo = S.data.loadout; PL.weapons = [C.makeWeapon(lo.primary, 0), C.makeWeapon(lo.secondary, 0)]; C.equip(0); PL.swapT = 0;
  // secret weapons stay legendary once found
  PL.weapons.forEach(w=>{ if(WEAP[w.id].secret){ w.rar = 3; const st = C.wstat(w); w.mag = st.mag; w.res = st.reserve; } });
  Object.assign(G, { step:-1, st:null, spawnT:3, horde:0, hordeT:0, stepXP:0, mysteryT:ms.steps.length > 1 && Math.random() < 0.4 ? 30 + Math.random()*50 : -1, mystery:null, collapseDone:false });
  resetMystery();
  UI().setMode('campaign'); UI().hideScreens();
  C.beginPlay(); A.music.set(0.25, false);
  nextStep();
  UI().banner('MISSION ' + (ZD.MISSION_LIST.indexOf(ms) + 1) + ' · ' + def.name, ms.name, 4, ms.brief);
  UI().updateHud(true); UI().renderSquad();
  horror.t = 40 + Math.random()*30;
};
MO.clearObjectives = function(){
  for(const k of ['items','nests','switches','scans','searches']) (G[k] || []).forEach(o=>W.remove(o.m)); G.items = []; G.nests = []; G.switches = []; G.scans = []; G.searches = [];
  for(const k of ['marker','evac','panel','gearObj','radioObj']) if(G[k]){ W.remove(G[k].m || G[k]); G[k] = null; }
  if(G.heli){ W.remove(G.heli.m); G.heli = null; } if(G.train){ W.remove(G.train); G.train = null; }
  if(G.survivor){ W.remove(G.survivor.rig.root); G.survivor = null; }
  if(G.mystery && G.mystery.m){ W.remove(G.mystery.m); } G.mystery = null;
  if(horror.figure){ W.remove(horror.figure.rig.root); horror.figure = null; }
  A.loop('rotor', false); A.loop('train', false);
};
function hideSurvivalGear(hide){
  for(const it of G.M.items){ if(!it.obj) continue;
    if(['wallbuy','perk','power','box','upgrade'].includes(it.kind)) it.obj.visible = !hide; }
}
function stepZones(s){ return (s.zones || (s.multi ? s.multi : [s.zone || 'any'])).map(r=>rnd(roleZones(r))); }
function nextStep(){
  const ms = G.mission;
  if(G.marker){ W.remove(G.marker); G.marker = null; }
  if(G.step >= 0){ S.addXP(ZD.XP.step); G.stepXP += ZD.XP.step; }
  G.step++;
  if(G.step >= ms.steps.length){ winMission(); return; }
  const s = ms.steps[G.step], st = G.st = { type:s.type, done:0, need:1, waitT:0, started:false, landed:false, t0:G.t, timeLimit:s.timeLimit || 0, prog:0 };
  const zs = stepZones(s);
  // the map opens up toward the objective
  let opened = 0; for(const z of zs) opened += openPathTo(z.i);
  if(opened && G.step > 0) UI().toast('Area unlocked');
  if(G.step === 2 && !G.collapseDone && Math.random() < 0.5){ const b = G.M.borders.find(x=>x.collapsible && G.zoneOpen[x.a] && G.zoneOpen[x.b]); if(b){ G.collapseDone = true; G.pending.push({ t:6, f:()=>collapseWall(b.i) }); } }
  switch(s.type){
    case 'reach': { const p = spotIn(zs[0]); st.at = p; st.r = 6; G.marker = W.makeEvac(0xffd23a); G.marker.scale.setScalar(st.r/8); G.marker.position.set(p.x, 0, p.z); break; }
    case 'collect': st.need = s.count; for(const z of zs){ const p = spotIn(z), m = W.makeItem(s.item); m.position.set(p.x, 0, p.z); G.items.push({ x:p.x, z:p.z, m, taken:false, kind:s.item }); } break;
    case 'activate': st.need = zs.length; for(const z of zs){ const p = spotIn(z), m = W.makeSwitch(); m.position.set(p.x, 0, p.z); G.switches.push({ x:p.x, z:p.z, m, prog:0, done:false, started:false }); } break;
    case 'destroy': st.need = s.count; for(const z of zs){ const p = spotIn(z), m = W.makeNest(); m.position.set(p.x, 0, p.z); G.nests.push({ x:p.x, z:p.z, m, hp:s.nestHp, maxHp:s.nestHp, dead:false, spawnT:3, hit:0, seen:false }); } break;
    case 'rescue': { const p = spotIn(zs[0]), rig = W.makeSurvivor(); G.survivor = { rig, x:p.x, z:p.z, yaw:0, follow:false, path:null, pathT:0 }; rig.root.position.set(p.x, 0, p.z); st.at = p; break; }
    case 'evac': { const z = zs[0], p = { x:z.cx, z:z.cz }; st.at = p; st.r = 8; G.evac = W.makeEvac(); G.evac.position.set(p.x, 0, p.z); break; }
    case 'code': st.need = 3; st.phase = 'find'; for(const z of zs.slice(0, 3)){ const p = spotIn(z), m = W.makeItem('code'); m.position.set(p.x, 0, p.z); G.items.push({ x:p.x, z:p.z, m, taken:false, kind:'code' }); }
      { const pz = rnd(roleZones(s.panel || 'mid')), p = spotIn(pz); G.panel = { x:p.x, z:p.z, m:W.makeSwitch(0x7affc8) }; G.panel.m.position.set(p.x, 0, p.z); } break;
    case 'signal': { const p = spotIn(zs[0]); st.at = p; G.radioObj = { m:W.makeItem('stash'), x:p.x, z:p.z }; G.radioObj.m.position.set(p.x, 0, p.z); G.radioObj.m.children.forEach(c=>{ if(c.userData.beacon) c.visible = false; }); st.beepT = 0; break; }
    case 'investigate': st.need = s.count; for(const z of zs){ const p = spotIn(z), m = W.makeScanPoint(); m.position.set(p.x, 0, p.z); G.scans.push({ x:p.x, z:p.z, m, prog:0, done:false }); } break;
    case 'kill': st.need = s.count; break;
    case 'boss': { const z = zs[0]; st.zone = z.i; st.bossZone = z; break; }
    case 'hold': { const z = zs[0], p = { x:z.cx, z:z.cz }; st.at = p; st.r = 6; st.need = s.time; G.marker = W.makeEvac(0xff8a3a); G.marker.scale.setScalar(st.r/8); G.marker.position.set(p.x, 0, p.z); break; }
    case 'search': { st.need = 1; const z = zs[0]; for(let k=0;k<(s.count || 3);k++){ const p = spotIn(z), m = W.makeItem('stash'); m.position.set(p.x, 0, p.z); G.searches.push({ x:p.x, z:p.z, m, checked:false, prog:0 }); }
      G.searches[(Math.random()*G.searches.length)|0].good = true; break; }
    case 'gear': { const p = spotIn(zs[0]), m = W.makeItem('gear'); m.position.set(p.x, 0, p.z); G.gearObj = { x:p.x, z:p.z, m, guard:false }; st.at = p; break; }
    case 'chase': { const pts = zs.map(z=>spotIn(z)); st.pts = pts; const b = AI().spawnBoss(G.M.def.boss, pts[0].x, pts[0].z, { chase:pts, hpMul:0.55*(1 + 0.04*(G.intensity - 2)) }); st.boss = b; break; }
  }
  if(G.step > 0){ A.sfx('objective'); UI().banner('NEW OBJECTIVE', s.text, 2.6); }
  UI().updateHud(true);
}
MO.stepText = function(){
  const ms = G.mission, s = ms && ms.steps[G.step], st = G.st; if(!s || !st) return '';
  if(s.type === 'collect' || s.type === 'destroy' || s.type === 'investigate' || (s.type === 'activate' && st.need > 1)) return st.done + ' / ' + st.need;
  if(s.type === 'code') return st.phase === 'find' ? st.done + ' / 3 found' : 'Enter it at the panel';
  if(s.type === 'kill') return Math.min(st.done, st.need) + ' / ' + st.need;
  if(s.type === 'hold') return st.started ? Math.ceil(st.need - st.prog) + 's left' : 'Get in the circle';
  if(s.type === 'evac' && st.landed) return 'Get in!';
  if(s.type === 'evac' && st.started) return (G.M.T.evac === 'heli' ? 'Chopper' : (G.M.T.evac === 'train' ? 'Train' : 'Exit opens')) + ' in ' + Math.ceil(st.waitT) + 's';
  if(s.type === 'signal') return 'Signal ' + Math.round(MO.signalStrength()*100) + '%';
  if(s.type === 'chase' && st.boss && st.boss.fleeing) return 'It is running!';
  return '';
};
MO.signalStrength = function(){ const st = G.st; if(!st || !st.at) return 0; const d = dist(PL, st.at); return clamp(1 - d/70, 0, 1); };
MO.takeItem = function(it, by){
  if(it.taken) return; it.taken = true; W.remove(it.m); G.st.done++; A.sfx('pickup'); W.burst(it.x, 0.6, it.z, { fuel:0xff8a3a, fuse:0xffd23a, bag:0x5aa8ff, code:0x7affc8 }[it.kind] || 0xffffff, 18);
  if(by !== PL) C.say(by, 'grab', true);
  const names = { fuel:'a fuel can', medkit:'a medkit', fuse:'a fuse', bag:'a supply bag', code:'a code fragment' };
  UI().toast((by === PL ? 'You' : by.name) + ' picked up ' + (names[it.kind] || 'it') + '  ·  ' + G.st.done + '/' + G.st.need);
  UI().updateHud(true);
};
function campaignDirector(dt){
  const cap = zCap(), alive = AI().aliveCount();
  G.spawnT -= dt;
  if(G.horde > 0){ G.hordeT -= dt; if(G.hordeT <= 0 && alive < cap + 6){ if(spawnOne(MO.pickType(MO.zombieMix()))) G.horde--; G.hordeT = 0.28; } }
  const s = G.mission.steps[G.step], st = G.st;
  let want = ZD.DIRECTOR.base + ZD.DIRECTOR.perIntensity*G.intensity + (st && st.started ? 4 : 0) - (st && st.type === 'destroy' ? 5 : 0) + (st && st.type === 'kill' ? 6 : 0);
  if(G.boss) want = Math.min(want, 5 + G.intensity);      // a boss fight is about the boss
  if(G.spawnT <= 0 && alive < Math.min(want, cap)){ const type = Math.random() < 0.008 && G.step >= 1 && !G.goldenSeen ? 'golden' : MO.pickType(MO.zombieMix());
    if(type === 'golden'){ G.goldenSeen = true; UI().toast('A golden zombie! Catch it before it escapes'); }
    spawnOne(type); G.spawnT = ZD.DIRECTOR.gap*(0.6 + Math.random()*0.8); }
  for(const z of G.zombies){ if(z.state !== 'dead' && !z.boss && dist(z, PL) > ZD.DIRECTOR.despawn){ W.remove(z.rig.root); z.gone = true; } }
  void s;
}
function updateCampaign(dt){
  const s = G.mission.steps[G.step], st = G.st; if(!s || !st) return;
  campaignDirector(dt);
  if(st.timeLimit && G.t - st.t0 > st.timeLimit){ MO.fail('Time ran out'); return; }
  updateSurvivor(dt); updateMysteryMission(dt);
  switch(s.type){
    case 'reach': if(dist(PL, st.at) < st.r) nextStep(); return;
    case 'collect': case 'code':
      for(const it of G.items){ if(it.taken) continue; if(!PL.down && dist(it, PL) < 1.4) MO.takeItem(it, PL); else it.m.rotation.y += dt*1.5; }
      if(s.type === 'code' && st.phase === 'find' && st.done >= 3){ st.phase = 'panel'; UI().banner('CODE COMPLETE', 'Enter it at the panel', 2.2); A.sfx('objective'); }
      if(s.type === 'collect' && st.done >= st.need){ G.items.forEach(it=>{ if(!it.taken){ W.remove(it.m); it.taken = true; } }); nextStep(); }
      return;
    case 'activate':
      for(const sw of G.switches){ if(sw.done) continue;
        const n = C.standing().filter(m=>dist(m, sw) < 2.6).length;
        if(n > 0){ if(!sw.started){ sw.started = true; G.horde += s.horde || 0; A.sfx('horde'); C.say(BOTS.find(o=>!o.down), 'horde', true); }
          sw.prog = Math.min(1, sw.prog + dt*(0.6 + 0.2*n)/s.time); }
        else sw.prog = Math.max(0, sw.prog - dt*0.04);
        if(sw.prog >= 1){ sw.done = true; st.done++; W.switchOn(sw.m); A.sfx('objective'); UI().toast((s.label || 'SWITCH') + ' ONLINE  ·  ' + st.done + '/' + st.need); } }
      if(st.done >= st.need) nextStep(); return;
    case 'destroy':
      for(const n of G.nests){ if(n.dead) continue; n.hit = Math.max(0, n.hit - dt); const pulse = 1 + Math.sin(G.t*4)*0.05 + n.hit; n.m.userData.core.scale.set(pulse, 0.8*pulse, pulse);
        const d = dist(n, PL);
        if(d < 30 && !n.seen){ n.seen = true; C.say(BOTS.find(o=>!o.down), 'nest', true); }
        n.spawnT -= dt; if(n.spawnT <= 0 && d < 45 && AI().aliveCount() < zCap() + 4){ n.spawnT = 6 + Math.random()*3;
          const a = Math.random()*6.28; AI().spawnZombie(Math.random() < 0.3 ? 'runner' : 'walker', n.x + Math.cos(a)*2, n.z + Math.sin(a)*2, { hpMul:MO.hpMul() }); } }
      st.done = G.nests.filter(n=>n.dead).length; if(st.done >= st.need) nextStep(); return;
    case 'rescue': { const sv = G.survivor; if(!PL.down && dist(sv, PL) < 4){ sv.follow = true; UI().toast('Survivor found. Keep them close'); nextStep(); } return; }
    case 'signal': st.beepT -= dt; if(st.beepT <= 0){ const k = MO.signalStrength(); st.beepT = lerp(1.6, 0.18, k); A.sfx('beep', { f:900 + k*900 }); }
      if(dist(PL, st.at) < 3){ W.remove(G.radioObj.m); G.radioObj = null; A.sfx('radio'); C.radio('RADIO', 'This is Patrol Six... if anyone hears this... come get us...', '#9ad8ff'); nextStep(); } return;
    case 'investigate':
      for(const sc of G.scans){ if(sc.done) continue; const n = C.standing().filter(m=>dist(m, sc) < 2.2).length;
        if(n > 0){ sc.prog = Math.min(1, sc.prog + dt*(1 + 0.5*(n - 1))/(s.time || 3)); if(sc.prog >= 1){ sc.done = true; st.done++; sc.m.userData.ring.material.color.set(0x5be36b); sc.m.children.forEach(c=>{ if(c.userData.beacon) c.visible = false; }); A.sfx('objective'); UI().toast((s.label || 'SCAN') + ' DONE  ·  ' + st.done + '/' + st.need); } } }
      if(st.done >= st.need) nextStep(); return;
    case 'kill': if(st.done >= st.need) nextStep(); return;
    case 'boss': if(!st.spawned && C.zoneAt(PL.x, PL.z) === st.zone){ st.spawned = true; const z = st.bossZone; const far = { x:z.cx + (z.cx - PL.x > 0 ? 1 : -1)*6, z:z.cz + (z.cz - PL.z > 0 ? 1 : -1)*6 };
        const c = C.openNear(C.navCell(far.x, far.z)), p = c >= 0 ? C.cellPos(c) : [z.cx, z.cz]; st.boss = AI().spawnBoss(G.M.def.boss, p[0], p[1], { hpMul:0.55*(1 + 0.04*(G.intensity - 2)) }); }
      if(st.spawned && st.boss && st.boss.state === 'dead') nextStep(); return;
    case 'chase': if(st.boss && st.boss.state === 'dead') nextStep(); return;
    case 'hold': { const n = C.standing().filter(m=>dist(m, st.at) < st.r).length;
      if(n > 0 && !st.started){ st.started = true; A.sfx('horde'); C.say(BOTS.find(o=>!o.down), 'horde', true); }
      if(st.started){ if(n > 0) st.prog += dt; st.hordeT = (st.hordeT || 0) - dt; if(st.hordeT <= 0){ st.hordeT = 8; G.horde += 4 + G.intensity; } }
      if(st.prog >= st.need) nextStep(); return; }
    case 'search': {
      const it = G.searches.find(x=>!x.checked && dist(x, PL) < 1.8);
      for(const x of G.searches){ if(x.checked) continue; const near = C.standing().some(m=>dist(m, x) < 1.8); if(near && (x !== it || G.useHeld)){ x.prog += dt/1.5; if(x.prog >= 1){ x.checked = true;
          if(x.good){ A.sfx('jackpot'); W.burst(x.x, 0.8, x.z, 0x7fe0ff, 30); C.refillAmmo(true); UI().toast('Found it! Ammo and grenades refilled'); G.searches.forEach(o=>W.remove(o.m)); G.searches = []; nextStep(); return; }
          else { A.sfx('deny'); x.m.children.forEach(c=>{ if(c.userData.beacon) c.visible = false; }); UI().toast('Empty. Check the next one'); } } } }
      return; }
    case 'gear': { const g = G.gearObj; if(!g) return;
      if(!g.guard && dist(PL, g) < 26){ g.guard = true; const ang = Math.random()*6.28, x = g.x + Math.cos(ang)*4, z = g.z + Math.sin(ang)*4, c = C.openNear(C.navCell(x, z)), p = c >= 0 ? C.cellPos(c) : [g.x, g.z];
        AI().spawnZombie('captain', p[0], p[1], { hpMul:MO.hpMul() }); A.sfx('roar', { at:[p[0], p[1]] }); UI().banner('GUARDED', 'A Brute Captain guards the gear', 2.2); }
      g.m.rotation.y += dt*1.5; if(!PL.down && dist(PL, g) < 1.5){ W.remove(g.m); G.gearObj = null; A.sfx('pickup'); UI().toast('Gear recovered'); nextStep(); } return; }
    case 'evac': {
      const inRing = m => dist(m, st.at) < st.r, kind = G.M.T.evac;
      if(!st.started && inRing(PL)){ st.started = true; st.waitT = s.wait; G.horde += 10 + G.intensity*4; A.sfx('horde'); C.say(BOTS.find(o=>!o.down), 'horde', true);
        if(kind === 'heli'){ const h = W.makeHeli(); G.heli = { m:h }; h.position.set(st.at.x + 40, 30, st.at.z + 60); A.loop('rotor', true, 0.1); }
        if(kind === 'train'){ G.train = W.makeTrain(); G.train.position.set(st.at.x + 60, 0, st.at.z); A.loop('train', true, 0.05); }
        UI().banner('HOLD THE EVAC ZONE', kind === 'heli' ? 'Chopper inbound' : (kind === 'train' ? 'The train is coming' : 'The exit is unlocking'), 2.4); }
      if(st.started && !st.landed){ st.waitT -= dt; if(st.waitT <= 0){ st.waitT = 0; st.landed = true; UI().banner(kind === 'heli' ? 'CHOPPER IS DOWN' : (kind === 'train' ? 'THE TRAIN IS HERE' : 'THE EXIT IS OPEN'), 'GET IN!', 2); A.sfx('objective'); } }
      const k = st.landed ? 1 : clamp(1 - st.waitT/s.wait, 0, 1), e = 1 - Math.pow(1 - k, 2);
      if(G.heli){ const h = G.heli.m; h.position.set(lerp(st.at.x + 40, st.at.x + 2, e), lerp(30, 0.1, e*e), lerp(st.at.z + 60, st.at.z + 5, e)); h.rotation.y = Math.PI*0.85; h.userData.rotor.rotation.y += dt*30; A.loop('rotor', true, 0.25 + e*0.35); }
      if(G.train){ G.train.position.x = lerp(st.at.x + 60, st.at.x, e); A.loop('train', true, st.landed ? 0 : 0.12); }
      if(st.landed && !PL.down && inRing(PL) && (!s.escort || (G.survivor && inRing(G.survivor)))) nextStep();
      return; }
  }
}
function updateSurvivor(dt){
  const sv = G.survivor; if(!sv) return;
  let moving = false;
  if(sv.follow){ const d = dist(PL, sv);
    sv.pathT -= dt; if(sv.pathT <= 0){ sv.pathT = 0.6; sv.path = d > 3 && !C.segClear(sv.x, sv.z, PL.x, PL.z, 0.3, true) ? C.findPath(sv.x, sv.z, PL.x, PL.z) : null; }
    let tx = PL.x, tz = PL.z; if(sv.path && sv.path.length){ [tx, tz] = sv.path[0]; if(Math.hypot(tx - sv.x, tz - sv.z) < 0.6) sv.path.shift(); }
    const dx = tx - sv.x, dz = tz - sv.z, dl = Math.hypot(dx, dz);
    if(d > 2.6 && dl > 0.05){ const sp = d > 8 ? ZD.PLAYER.sprint : ZD.PLAYER.walk; sv.x += dx/dl*sp*dt; sv.z += dz/dl*sp*dt; moving = true; sv.yaw += clamp(C.wrap(Math.atan2(-dx, -dz) - sv.yaw), -8*dt, 8*dt); }
    C.pushOut(sv, 0.38); }
  else sv.yaw += dt*0.3;
  sv.rig.root.position.set(sv.x, 0, sv.z); sv.rig.root.rotation.y = sv.yaw; W.animSurvivor(sv.rig, moving, dt);
}
// a mystery mission: a strange signal leads to a stash with a reward
function updateMysteryMission(dt){
  if(G.mysteryT < 0 || G.step < 1) return;
  if(!G.mystery){ G.mysteryT -= dt; if(G.mysteryT > 0) return; G.mysteryT = -1;
    const zones = G.M.zones.filter(z=>G.zoneOpen[z.i] && z.kind !== 'secret' && dist(PL, { x:z.cx, z:z.cz }) > 15); if(!zones.length) return;
    const p = spotIn(rnd(zones)), m = W.makeItem('stash'); m.position.set(p.x, 0, p.z); m.children.forEach(c=>{ if(c.userData.beacon) c.visible = false; });
    G.mystery = { x:p.x, z:p.z, m, beepT:0 };
    C.radio('???', 'You there. I left something for you. Follow the hum.', '#c8a8ff'); UI().banner('MYSTERY', 'A strange signal appeared (optional)', 2.6); C.say(BOTS.find(o=>!o.down), 'scary');
    return; }
  const ms = G.mystery; ms.beepT -= dt; const k = clamp(1 - dist(PL, ms)/70, 0, 1); if(ms.beepT <= 0){ ms.beepT = lerp(2.2, 0.25, k); A.sfx('beep', { f:400 + k*500 }); }
  if(dist(PL, ms) < 1.8){ W.remove(ms.m); G.mystery = null; A.sfx('jackpot'); W.burst(ms.x, 0.8, ms.z, 0xb45cff, 30);
    const pool = ZD.WEAPON_ORDER.filter(id=>!WEAP[id].secret && WEAP[id].box > 0), id = rnd(pool), rar = Math.random() < 0.3 ? 2 : 1;
    C.giveWeapon(id, rar); S.addCredits(300); S.addXP(150); C.radio('W.', 'Good. Now you owe me. Count the lines on the marks.', '#c8a8ff');
    UI().toast('Stash: ' + ZD.RARITY[rar].name + ' ' + WEAP[id].name + ', +300 credits'); }
}
function missionStars(){ const ms = G.mission, time = Math.round(G.t); return G.downs === 0 && time <= ms.par ? 3 : (G.downs <= 1 || time <= ms.par*1.3 ? 2 : 1); }
function winMission(){
  if(G.over) return;
  G.phase = 'over'; G.over = true; A.loop('rotor', false); A.loop('train', false); A.music.set(0.2, false);
  const ms = G.mission, time = Math.round(G.t), stars = missionStars(), first = S.missionDone(ms, stars);
  const xp = ZD.XP.mission + ZD.XP.star*stars, credits = 400 + 150*stars + G.kills*2 + (first ? 300 : 0);
  S.addXP(xp); S.addCredits(credits); A.sfx('objective');
  const k = ZD.MISSION_LIST.indexOf(ms), next = ZD.MISSION_LIST[k + 1];
  UI().showResult({ win:true, title:'MISSION COMPLETE', sub:ms.name, stars,
    stats:[['Time', Math.floor(time/60) + ':' + String(time % 60).padStart(2, '0')], ['Kills', G.kills], ['Headshots', G.heads], ['Downs', G.downs]],
    rewards:'+' + (xp + G.stepXP) + ' XP  ·  +' + credits + ' credits' + (first ? '  ·  first clear bonus' : ''),
    note:next ? 'Next: ' + next.name + (next.mapIndex !== ms.mapIndex ? '  ·  new map: ' + ZD.MAPS[next.mapIndex].name : '') : 'You finished the whole campaign. Try Survival on every map.',
    next:!!next });
  if(typeof window.onGameplayStop === 'function') window.onGameplayStop();
}
MO.fail = function(reason){
  if(G.over) return; G.over = true; G.phase = 'over'; G.slow = 0.35; A.loop('rotor', false); A.loop('train', false); A.sfx('fail'); A.music.set(0, false);
  if(G.mode === 'survival'){ survivalOver(reason); return; }
  const ms = G.mission;
  UI().showResult({ win:false, title:'MISSION FAILED', sub:reason, stats:[['Objective', (G.step + 1) + ' / ' + ms.steps.length], ['Kills', G.kills], ['Headshots', G.heads], ['Time', Math.round(G.t) + 's']],
    rewards:'+' + G.stepXP + ' XP kept from objectives' });
  if(typeof window.onGameplayStop === 'function') window.onGameplayStop();
};
MO.nestStep = ()=>G.mode === 'campaign' && G.st && G.st.type === 'destroy';

// ---- survival ---------------------------------------------------------------------------------------
MO.startSurvival = function(mapIndex){
  C.clearWorld(); MO.clearObjectives();
  G.mode = 'survival'; G.mission = null; G.mapIndex = mapIndex; G.intensity = 1; G.st = null; G.step = -1;
  C.loadMap(mapIndex); usedSpots.clear(); computeOpenZones();
  hideSurvivalGear(false);
  for(const it of G.M.items){ if(it.kind === 'perk') W.setPerkPower(it, false); if(it.kind === 'power') W.setPower(it, false); if(it.kind === 'upgrade') W.setUpgradeOn(it, false);
    if(it.kind === 'box'){ it.obj.visible = false; } }
  G.boxes = G.M.items.filter(i=>i.kind === 'box'); G.box = { idx:0, uses:0, state:'idle', t:0 }; if(G.boxes[0]) G.boxes[0].obj.visible = true;
  C.resetPlayer(); C.makeSquad(); C.placeSquad();
  PL.weapons = [C.makeWeapon('pistol', 0)]; C.equip(0); PL.swapT = 0;
  Object.assign(G, { wave:0, points:SV.startPoints, power:false, breakT:6, toSpawn:0, spawnT:0, dropsThisWave:0, waveEvent:null, bloodFog:false, blackout:false, announced:{}, perksRun:0, horde:0 });
  resetMystery();
  UI().setMode('survival'); UI().hideScreens();
  C.beginPlay(); A.music.set(0.2, false);
  UI().banner('SURVIVAL', ZD.MAPS[mapIndex].name, 3.5, 'Buy doors, weapons and perks with points. How long can the squad last?');
  UI().updateHud(true); UI().renderSquad();
  horror.t = 50 + Math.random()*30;
};
MO.skipBreak = function(){ if(G.mode === 'survival' && G.breakT > 1.5){ G.breakT = 1.5; A.sfx('blip'); } };
function startWave(){
  const w = ++G.wave; G.dropsThisWave = 0;
  const bossWave = w % 10 === 0, miniWave = w % 5 === 0 && !bossWave, king = w % 30 === 0;
  G.toSpawn = Math.round((6 + w*2.4 + 0.12*w*w)*(bossWave ? 0.5 : 1)); G.spawnT = 2;
  // atmosphere: night falls in the second half of every ten waves, boss waves turn blood red
  const T = G.M.T; G.bloodFog = false; G.blackout = false; G.waveEvent = null;
  if(bossWave) W.setEnv('blood', 3); else if(T.outdoor && w % 10 >= 5) W.setEnv('night', 4); else W.setEnv(T.env, 3);
  // evolution: new mutations get announced as they appear
  const evo = { 12:'armor', 14:'regen', 16:'volatile', 18:'swift', 20:'enraged' }[w];
  if(evo && !G.announced[evo]){ G.announced[evo] = true; G.pending.push({ t:3, f:()=>UI().banner('ZOMBIE EVOLUTION', ZD.MUTATIONS[evo].name, 3, ZD.MUTATIONS[evo].desc) }); }
  if(w === 10 || w === 20){ const b = G.M.borders.find(x=>x.collapsible && !x.fallen); if(b) G.pending.push({ t:8, f:()=>collapseWall(b.i) }); }
  // a wave event now and then
  if(w >= 3 && !bossWave && Math.random() < 0.35){ G.waveEvent = rnd(['blackout', 'bloodfog', 'supply', 'golden', 'rush', 'radio']); G.pending.push({ t:4, f:waveEvent }); }
  A.sfx('wave'); UI().banner('WAVE', String(w), 2.6, bossWave ? 'A boss is coming' : (miniWave ? 'A Brute Captain leads this wave' : ''));
  if(bossWave){ const bossId = king ? 'king' : G.M.def.boss, z = G.M.zones[G.M.arena];
    G.pending.push({ t:5, f:()=>{ const p = spawnPoint() || { x:z.cx, z:z.cz }; AI().spawnBoss(bossId, p.x, p.z, { hpMul:0.55 + 0.12*(w/10) + (king ? 0.3 : 0), dmgMul:0.8 + 0.04*w/10 }); } }); }
  if(miniWave) G.pending.push({ t:4, f:()=>spawnOne('captain', { hpMul:MO.hpMul()*0.5 }) });
  A.music.set(0.5, bossWave);
}
function waveEvent(){
  const e = G.waveEvent; if(!e || G.over) return;
  if(e === 'blackout'){ G.blackout = true; W.lightMul(0.25); W.lampsOn(0.1); UI().banner('BLACKOUT', 'The lights are out. Stay close.', 2.4); A.sfx('glitch'); }
  if(e === 'bloodfog'){ G.bloodFog = true; W.setEnv('blood', 2); UI().banner('BLOOD FOG', 'They are faster, but points are doubled', 2.4); for(const z of G.zombies) if(!z.boss) z.speed *= 1.2; }
  if(e === 'supply'){ const z = G.M.zones[C.zoneAt(PL.x, PL.z)] || G.M.zones[G.M.start], p = z.spots.length ? rnd(z.spots) : { x:z.cx, z:z.cz };
    const s = { x:p.x, z:p.z, y:16, m:W.makeSupply(), kind:'supply' }; s.m.position.set(s.x, s.y, s.z); G.drops.push(s); UI().banner('SUPPLY DROP', 'A crate is coming down nearby', 2.2); }
  if(e === 'golden'){ const zb = spawnOne('golden', { hpMul:MO.hpMul() }); if(zb) UI().banner('GOLDEN ZOMBIE', 'Catch it for 2000 points', 2.4); }
  if(e === 'rush'){ for(let k=0;k<12;k++) G.pending.push({ t:k*0.3, f:()=>spawnOne('runner', { hpMul:MO.hpMul() }) }); A.sfx('horde'); UI().banner('RUSH', 'Runners incoming!', 2); }
  if(e === 'radio'){ C.radio('W.', rnd(['The marks glow when you are close.', 'Three marks, three lines, one door.', 'Do not trust the quiet waves.', 'The box remembers who feeds it.']), '#c8a8ff'); }
}
function endWave(){
  const w = G.wave; G.breakT = SV.breakTime;
  A.sfx('waveEnd'); UI().banner('WAVE ' + w + ' SURVIVED', '', 2.2); S.track('waves'); S.addXP(ZD.XP.wave);
  MO.addPoints(50 + w*10);
  for(const m of C.members()) if(m.down) C.revive(m, null);   // the downed get back up between waves
  if(G.blackout){ G.blackout = false; W.lightMul(1); W.lampsOn(G.power ? 1.3 : 1); }
  if(G.bloodFog){ G.bloodFog = false; }
  if(w % 10 === 0) W.setEnv(G.M.T.env, 3);
  C.say(BOTS.find(o=>!o.down), 'wave');
  A.music.set(0.2, false);
}
function updateSurvival(dt){
  if(G.breakT > 0){ G.breakT -= dt; if(G.breakT <= 0) startWave(); return; }
  const cap = zCap(), alive = AI().aliveCount();
  G.spawnT -= dt;
  if(G.toSpawn > 0 && G.spawnT <= 0 && alive < cap){
    const w = G.wave, mutChance = w >= 12 ? Math.min(0.55, 0.05 + (w - 12)*0.035) : 0;
    const muts = Object.keys(G.announced).filter(k=>G.announced[k]), mut = muts.length && Math.random() < mutChance ? rnd(muts) : null;
    if(spawnOne(MO.pickType(MO.zombieMix()), { mut, speedMul:G.bloodFog ? 1.2 : 1, dmgMul:1 + 0.03*(w - 1) })) G.toSpawn--;
    G.spawnT = Math.max(0.25, 1.6 - w*0.06)*(0.6 + Math.random()*0.8); }
  if(G.toSpawn <= 0 && alive === 0 && !G.boss && !G.zombies.some(z=>z.state !== 'dead' && z.type === 'golden')) endWave();
  // music follows the pressure
  const near = G.zombies.filter(z=>z.state !== 'dead' && dist(z, PL) < 15).length; A.music.set(clamp(0.25 + near*0.06, 0, 1), !!G.boss);
}
function survivalOver(reason){
  const w = G.wave, time = Math.round(G.t), credits = w*60 + G.kills*2, xp = w*ZD.XP.wave;
  S.addCredits(credits);
  const best = S.recordRun({ map:G.M.id, wave:w, kills:G.kills, time, char:PL.char, date:Date.now() });
  UI().showResult({ win:false, survival:true, title:'SQUAD OVERRUN', sub:reason + '  ·  ' + ZD.MAPS[G.mapIndex].name,
    stats:[['Wave', w], ['Kills', G.kills], ['Points', G.points], ['Time', Math.floor(time/60) + ':' + String(time % 60).padStart(2, '0')]],
    rewards:'+' + credits + ' credits  ·  ' + xp + ' XP earned from waves', note:best ? 'NEW BEST WAVE ON THIS MAP!' : 'Best on this map: wave ' + (S.data.records.waves[G.M.id] || w), best });
  if(typeof window.onGameplayStop === 'function') window.onGameplayStop();
}
// survival gear: the box spins through guns, then offers one
function boxRoll(){
  const pool = []; for(const id of ZD.WEAPON_ORDER){ const d = WEAP[id]; if(!d.box || PL.weapons.some(w=>w.id === id)) continue; for(let k=0;k<d.box;k++) pool.push(id); }
  const id = rnd(pool), r = Math.random(), rar = r < 0.05 ? 3 : (r < 0.2 ? 2 : (r < 0.5 ? 1 : 0));
  const el = rar === 3 && !WEAP[id].element && Math.random() < 0.5 ? rnd(['fire', 'shock', 'cryo', 'toxic']) : null;
  return { id, rar, el };
}
function useBox(it){
  const b = G.box; if(b.state !== 'idle') return;
  b.state = 'spin'; b.t = 0; b.uses++; A.sfx('box'); it.lid.rotation.x = -1.2;
  b.teddy = b.uses >= 4 && Math.random() < 0.12;
  b.offer = boxRoll(); b.it = it; b.spinT = 0;
  b.rig = { gun:it.shown, muzzle:new THREE.Object3D() }; it.shown.add(b.rig.muzzle);
}
function updateBox(dt){
  const b = G.box; if(!b || b.state === 'idle' || !b.it) return; const it = b.it; b.t += dt;
  if(b.state === 'spin'){ b.spinT -= dt; it.shown.position.y = 0.9 + Math.min(1, b.t/2.6)*0.6; it.shown.rotation.y += dt*2;
    if(b.spinT <= 0){ b.spinT = 0.12 + b.t*0.05; const pool = ZD.WEAPON_ORDER.filter(id=>WEAP[id].box > 0); W.setGunModel(b.rig, WEAP[rnd(pool)].model); }
    if(b.t >= 3){ b.state = 'offer'; b.t = 0;
      if(b.teddy){ W.setGunModel(b.rig, 'none'); it.label && W.setLabel(it.label, 'BYE BYE', '#ff5a5a'); A.sfx('laugh'); MO.addPoints(SV.boxPrice); UI().toast('The box moves on. Points refunded'); }
      else { W.setGunModel(b.rig, WEAP[b.offer.id].model, ZD.RARITY[b.offer.rar].hex); if(b.offer.rar === 3){ A.sfx('jackpot'); S.track('boxLegendary'); } else A.sfx('pickup'); } } }
  else if(b.state === 'offer'){ it.shown.rotation.y += dt*1.2;
    if(b.teddy){ if(b.t > 2.5){ moveBox(); } }
    else if(b.t > 7){ closeBox(); } }
}
function closeBox(){ const b = G.box, it = b.it; if(!it) return; it.lid.rotation.x = 0; [...it.shown.children].forEach(c=>it.shown.remove(c)); it.shown.position.y = 1.1; b.state = 'idle'; b.it = null; W.setLabel(it.label, 'MYSTERY BOX\n' + SV.boxPrice, ['#7fe0ff', '#ffd23a']); }
function moveBox(){ const b = G.box, old = b.it; closeBox(); old.obj.visible = false; const choices = G.boxes.map((x, i)=>i).filter(i=>i !== b.idx); b.idx = choices.length ? rnd(choices) : b.idx; b.uses = 0;
  G.boxes[b.idx].obj.visible = true; W.blink(G.boxes[b.idx].x, 1, G.boxes[b.idx].z); UI().banner('THE BOX MOVED', 'Find it somewhere else on the map', 2.2); }
function buyPerk(it){ const p = ZD.PERKS[it.perk]; PL.perks[it.perk] = true; G.perksRun++; S.track('perksRun', G.perksRun, true); A.sfx('powerup'); UI().banner(p.name.toUpperCase(), p.desc, 2);
  if(it.perk === 'iron'){ PL.maxHp = ZD.CHARS[PL.char].hp*2; PL.hp = PL.maxHp; }
  if(it.perk === 'pockets'){ PL.nades += 2; for(const w of PL.weapons){ const st = C.wstat(w); w.res = Math.max(w.res, st.reserve); } }
  UI().updateHud(true); }
function powerOn(it){ G.power = true; W.setPower(it, true); A.sfx('objective'); A.sfx('door');
  for(const x of G.M.items){ if(x.kind === 'perk') W.setPerkPower(x, true); if(x.kind === 'upgrade') W.setUpgradeOn(x, true); }
  W.lampsOn(1.3); W.lightMul(1.15); setTimeout(()=>W.lightMul(1), 1500);
  UI().banner('POWER ON', 'Perk machines and the upgrade station work now', 2.6); C.say(BOTS.find(o=>!o.down), 'power', true); }
function upgradeWeapon(){ const w = C.curW(); if(w.rar >= 3){ UI().toast('Already legendary'); return false; }
  w.rar++; if(w.rar === 3 && !w.element && !WEAP[w.id].element) w.element = rnd(['fire', 'shock', 'cryo', 'toxic']);
  const st = C.wstat(w); w.mag = st.mag; w.res = st.reserve; C.equip(PL.cur); A.sfx('jackpot');
  UI().banner('UPGRADED', ZD.RARITY[w.rar].name.toUpperCase() + ' ' + WEAP[w.id].name + (w.element ? ' · ' + ZD.ELEMENTS[w.element].name : ''), 2.4); return true; }

// ---- interaction: what can be used near the player -------------------------------------------------------
MO.interactables = function(){
  const M = G.M, out = [], surv = G.mode === 'survival';
  if(!M) return out;
  for(const d of M.doors){ if(d.open) continue; const near = dist(PL, d.sideA) < 2.4 ? d.sideA : (dist(PL, d.sideB) < 2.4 ? d.sideB : null); if(!near) continue;
    if(d.kind === 'door' && surv) out.push({ kind:'door', x:near.x, z:near.z, r:2.4, cost:d.cost, text:'Open the door', act:()=>{ MO.openDoor(d); UI().toast('Door opened'); } });
    else if(d.kind === 'shortcut') out.push({ kind:'lever', x:near.x, z:near.z, r:2.4, hold:true, time:0.8, text:'Pull the lever (shortcut)', act:()=>{ MO.openDoor(d); A.sfx('creak'); } }); }
  for(const it of M.items){ if(!it.front || Math.abs(it.front.x - PL.x) > 3 || Math.abs(it.front.z - PL.z) > 3) continue;
    const at = { x:it.front.x, z:it.front.z };
    switch(it.kind){
      case 'wallbuy': if(!surv) break; { const d = WEAP[it.weapon], has = PL.weapons.find(w=>w.id === it.weapon);
        if(has) out.push(Object.assign(at, { kind:'buy', cost:Math.round(d.price*SV.ammoFactor), text:'Buy ammo for ' + d.name, act:()=>{ const st = C.wstat(has); has.res = st.reserve; has.mag = st.mag; UI().updateHud(true); } }));
        else out.push(Object.assign(at, { kind:'buy', cost:d.price, text:'Buy ' + d.name, act:()=>{ C.giveWeapon(it.weapon, 0); UI().toast(d.name + ' bought'); } })); } break;
      case 'perk': if(!surv) break; { const p = ZD.PERKS[it.perk];
        if(!G.power) out.push(Object.assign(at, { kind:'info', text:p.name + ' needs power', act:()=>A.sfx('deny') }));
        else if(PL.perks[it.perk]) out.push(Object.assign(at, { kind:'info', text:'You already have ' + p.name, act:()=>{} }));
        else out.push(Object.assign(at, { kind:'buy', cost:p.price, text:'Drink ' + p.name + ' (' + p.desc + ')', act:()=>buyPerk(it) })); } break;
      case 'power': if(!surv || G.power) break; out.push(Object.assign(at, { kind:'power', hold:true, time:1.5, text:'Turn on the power', act:()=>powerOn(it), auto:true })); break;
      case 'box': if(!surv || !it.obj.visible) break; { const b = G.box;
        if(b.state === 'idle') out.push(Object.assign(at, { kind:'buy', cost:SV.boxPrice, text:'Mystery box: a random weapon', act:()=>useBox(it) }));
        else if(b.state === 'offer' && !b.teddy && b.it === it) out.push(Object.assign(at, { kind:'take', text:'Take ' + ZD.RARITY[b.offer.rar].name + ' ' + WEAP[b.offer.id].name, act:()=>{ C.giveWeapon(b.offer.id, b.offer.rar, b.offer.el); closeBox(); } })); } break;
      case 'upgrade': if(!surv) break; if(!G.power){ out.push(Object.assign(at, { kind:'info', text:'The upgrade station needs power', act:()=>A.sfx('deny') })); break; }
        out.push(Object.assign(at, { kind:'buy', cost:SV.upgradePrice, text:'Upgrade ' + WEAP[C.curW().id].name + ' to the next rarity', act:()=>{ if(!upgradeWeapon()) MO.addPoints(SV.upgradePrice); } })); break;
      case 'ammo': out.push(Object.assign(at, { kind:'ammo', cost:surv ? 1500 : 0, text:surv ? 'Ammo crate: refill everything' : 'Ammo and grenades', act:()=>{ C.refillAmmo(false); A.sfx('pickup'); UI().toast('Ammo and grenades refilled'); } })); break;
      case 'note': if(!it.obj.visible) break; out.push(Object.assign(at, { kind:'note', text:'Read the note', act:()=>readNote(it) })); break;
      case 'keypad': if(G.secretOpen) break; out.push(Object.assign(at, { kind:'keypad', text:'Use the sealed keypad', act:()=>UI().openKeypad(G.M) })); break;
      case 'pedestal': if(!G.secretOpen || G.pedestalTaken) break; out.push(Object.assign(at, { kind:'take', r:2.2, text:'Take the ' + WEAP[M.def.secret].name, act:()=>takeSecret(it) })); break;
      case 'altar': if(!G.secretOpen || G.altarUsed) break; out.push(Object.assign(at, { kind:'altar', r:2.2, hold:true, time:2, text:'Awaken what sleeps here', act:()=>awaken(it) })); break;
    }
  }
  if(G.mode === 'campaign' && G.st){ const s = G.mission.steps[G.step];
    if(s.type === 'code' && G.st.phase === 'panel' && G.panel && dist(PL, G.panel) < 2.4) out.push({ kind:'panel', x:G.panel.x, z:G.panel.z, r:2.4, text:'Enter the code', auto:true, act:()=>{ W.switchOn(G.panel.m); A.sfx('objective'); UI().banner('CODE ACCEPTED', '', 1.6); nextStep(); } });
    if(s.type === 'activate') for(const sw of G.switches){ if(!sw.done && dist(PL, sw) < 2.6) out.push({ kind:'zone', zone:true, x:sw.x, z:sw.z, r:2.6, sw, text:'Hold the circle. The squad speeds it up' }); }
    if(s.type === 'investigate') for(const sc of G.scans){ if(!sc.done && dist(PL, sc) < 2.2) out.push({ kind:'zone', zone:true, x:sc.x, z:sc.z, r:2.2, sw:sc, text:'Stay here to scan' }); }
    if(s.type === 'search') for(const x of G.searches){ if(!x.checked && dist(PL, x) < 1.8) out.push({ kind:'zone', zone:true, x:x.x, z:x.z, r:1.8, sw:x, text:'Hold USE to search', auto:true }); }
  }
  return out;
};
// bots pitch in on campaign objectives
MO.botGoal = function(b, idx){
  if(G.mode !== 'campaign' || !G.st) return null;
  const s = G.mission.steps[G.step], st = G.st;
  if(s.type === 'collect' && idx < 2){ const free = G.items.filter(it=>!it.taken && dist(it, PL) < 36);
    if(free.length){ free.sort((a, c)=>dist(a, b) - dist(c, b)); const pick = free[Math.min(idx, free.length - 1)]; return { task:'collect', x:pick.x, z:pick.z, item:pick }; } }
  if(s.type === 'activate'){ const sw = AI().nearestTo(G.switches.filter(w=>!w.done), PL); if(sw && dist(sw, PL) < 30){ const a = idx*2.1; return { task:'activate', x:sw.x + Math.cos(a)*1.3, z:sw.z + Math.sin(a)*1.3 }; } }
  if(s.type === 'investigate'){ const sc = AI().nearestTo(G.scans.filter(w=>!w.done), b); if(sc && dist(sc, PL) < 30) return { task:'scan', x:sc.x + Math.cos(idx*2)*1.0, z:sc.z + Math.sin(idx*2)*1.0 }; }
  if(s.type === 'hold' && dist(PL, st.at) < 20){ const a = idx*2.1 + 0.5; return { task:'hold', x:st.at.x + Math.cos(a)*3, z:st.at.z + Math.sin(a)*3 }; }
  if(s.type === 'search'){ const x = AI().nearestTo(G.searches.filter(o=>!o.checked), b); if(x && dist(x, PL) < 25 && idx === 1) return { task:'scan', x:x.x, z:x.z }; }
  if(s.type === 'evac' && st.started && dist(st.at, PL) < 20){ const a = idx*2.1 + 0.5; return { task:'evac', x:st.at.x + Math.cos(a)*3, z:st.at.z + Math.sin(a)*3 }; }
  return null;
};
// where the HUD marker points
MO.objectiveTarget = function(){
  const downBot = BOTS.find(b=>b.down && dist(b, PL) < 25); if(downBot && !PL.down) return { x:downBot.x, z:downBot.z, label:'REVIVE ' + downBot.name, help:true };
  if(G.mode === 'survival'){ if(G.wave >= 2 && !G.power){ const it = G.M.items.find(i=>i.kind === 'power'); if(it && G.zoneOpen[it.zone]) return { x:it.front.x, z:it.front.z, label:'POWER' }; } return null; }
  const s = G.mission && G.mission.steps[G.step], st = G.st; if(!s || !st) return null;
  const near = list=>AI().nearestTo(list, PL);
  switch(s.type){
    case 'reach': return { x:st.at.x, z:st.at.z, label:'GO HERE' };
    case 'evac': return { x:st.at.x, z:st.at.z, label:'EVAC' };
    case 'hold': return { x:st.at.x, z:st.at.z, label:'DEFEND' };
    case 'collect': { const it = near(G.items.filter(i=>!i.taken)); return it ? { x:it.x, z:it.z, label:{ fuel:'FUEL', medkit:'MEDKIT', fuse:'FUSE', bag:'SUPPLIES' }[s.item] || 'ITEM' } : null; }
    case 'code': if(st.phase === 'find'){ const it = near(G.items.filter(i=>!i.taken)); return it ? { x:it.x, z:it.z, label:'CODE' } : null; } return G.panel ? { x:G.panel.x, z:G.panel.z, label:'PANEL' } : null;
    case 'activate': { const sw = near(G.switches.filter(w=>!w.done)); return sw ? { x:sw.x, z:sw.z, label:s.label || 'USE' } : null; }
    case 'destroy': { const n = near(G.nests.filter(x=>!x.dead)); return n ? { x:n.x, z:n.z, label:'NEST' } : null; }
    case 'investigate': { const sc = near(G.scans.filter(x=>!x.done)); return sc ? { x:sc.x, z:sc.z, label:s.label || 'SCAN' } : null; }
    case 'rescue': return G.survivor ? { x:G.survivor.x, z:G.survivor.z, label:'SURVIVOR' } : null;
    case 'search': { const x = near(G.searches.filter(o=>!o.checked)); return x ? { x:x.x, z:x.z, label:'SEARCH' } : null; }
    case 'gear': return G.gearObj ? { x:G.gearObj.x, z:G.gearObj.z, label:'GEAR' } : null;
    case 'boss': { if(st.boss && st.boss.state !== 'dead') return { x:st.boss.x, z:st.boss.z, label:'BOSS' }; const z = st.bossZone; return { x:z.cx, z:z.cz, label:'BOSS' }; }
    case 'chase': { const b = st.boss; if(!b || b.state === 'dead') return null; if(b.fleeing){ const p = b.chase[b.chaseIdx]; return { x:p.x, z:p.z, label:'IT RAN HERE' }; } return { x:b.x, z:b.z, label:'BOSS' }; }
    case 'kill': return null;
    case 'signal': return null;
  }
  return null;
};

// ---- the mystery: marks, the keypad, the secret room ---------------------------------------------------
function resetMystery(){ G.symbolsFound = new Set(); G.secretOpen = false; G.pedestalTaken = false; G.altarUsed = false; G.pending = G.pending || []; }
function updateMystery(dt){
  const M = G.M, cam = W.camera, B = C.camBasis();
  for(const s of M.symbols){ const key = s.order; if(G.symbolsFound.has(key)) { s.plate.material.opacity = 0.45 + Math.sin(G.t*2 + key)*0.1; continue; }
    const d = dist(PL, s); s.plate.material.opacity = 0.25 + (d < 10 ? (1 - d/10)*0.6 : 0) + Math.max(0, Math.sin(G.t*1.3 + key*2))*0.08;
    if(d < 5){ const dx = s.x - cam.position.x, dz = s.z - cam.position.z, dl = Math.hypot(dx, dz) || 1;
      if((dx*B.fx + dz*B.fz)/dl > 0.6){ G.symbolsFound.add(key); S.data.symbols[M.id + ':' + key] = 1; S.track('symbols'); A.sfx('whisper'); W.burst(s.x, s.y, s.z, 0x7affc8, 16);
        UI().toast('A strange mark: ' + G.symbolsFound.size + ' of 3  ·  ' + 'lines under it: ' + (key + 1)); UI().glyphFound(s.glyph, key); } } }
  for(const n of M.notes){ if(n.glow) n.glow.material.opacity = 0.35 + Math.sin(G.t*3)*0.15; }
  for(const it of M.items){ if(it.kind === 'pedestal' && it.gun){ it.gun.rotation.y += dt*1.2; it.gun.position.y = 1.6 + Math.sin(G.t*2)*0.08; } if(it.kind === 'upgrade' && it.ring) it.ring.rotation.x += dt*(G.power ? 2 : 0.3);
    if(it.kind === 'box' && it.beam) it.beam.material.opacity = 0.14 + Math.sin(G.t*3)*0.05; }
}
MO.tryCode = function(seq){
  const M = G.M, ok = seq.length === 3 && seq.every((g, i)=>g === M.code[i]);
  if(!ok){ A.sfx('deny'); return false; }
  G.secretOpen = true; const d = M.doors.find(x=>x.kind === 'secret'); if(d) MO.openDoor(d);
  const kp = M.items.find(i=>i.kind === 'keypad'); if(kp){ kp.screen.material.color.set(0x5be36b); W.setLabel(kp.label, 'OPEN', '#5be36b'); }
  if(!S.data.secrets[M.id]){ S.data.secrets[M.id] = 1; S.track('secrets'); S.addXP(ZD.XP.secret); }
  A.sfx('jackpot'); UI().banner('SECRET ROOM', 'Something waits inside', 3); C.radio('W.', 'You found it. Take what I built. Leave the altar alone.', '#c8a8ff');
  return true;
};
function takeSecret(it){
  const id = G.M.def.secret; G.pedestalTaken = true; W.remove(it.gun); it.glow.visible = false;
  C.giveWeapon(id, 3); A.sfx('jackpot');
  if(!S.owns('weapons', id)){ S.own('weapons', id); UI().banner('SECRET WEAPON', WEAP[id].name, 3, 'Unlocked for good: equip it in the Armory'); }
  else { S.addCredits(1000); UI().banner('SECRET WEAPON', WEAP[id].name, 2.4, 'You already own it: +1000 credits'); }
}
function awaken(it){
  G.altarUsed = true; it.runes.material.color.set(0xff2a2a); A.sfx('roar'); W.setEnv('blood', 2); W.shake(0.6);
  const z = G.M.zones[G.M.secret]; G.pending.push({ t:2, f:()=>AI().spawnBoss('hollow', z.cx + 4, z.cz + 4, { hpMul:G.mode === 'survival' ? 0.6 + 0.04*G.wave : 1 }) });
  UI().banner('THE ALTAR WAKES', 'The Hollow is coming', 2.4);
}
function readNote(it){
  const id = it.note, text = ZD.NOTES[id % ZD.NOTES.length];
  if(!S.data.notes[id]){ S.data.notes[id] = 1; S.track('notes'); S.addXP(ZD.XP.note); }
  A.sfx('pickup'); UI().showNote(text, Object.keys(S.data.notes).length);
}
MO.onBossDead = function(b){ if(b.id === 'hollow'){ S.addCredits(2500); UI().toast('The Hollow is gone. +2500 credits'); } };

// ---- light horror and mystery events ------------------------------------------------------------------
const horror = MO.horror = { t:60, figure:null, flicker:0, black:0 };
function horrorTick(dt){
  if(horror.figure){ const f = horror.figure; f.t -= dt; const d = dist(PL, f); if(f.t <= 0 || d < 12){ W.remove(f.rig.root); horror.figure = null; if(d < 12){ A.sfx('whisper'); W.blink(f.x, 1, f.z); } } }
  if(horror.flicker > 0){ horror.flicker -= dt; const on = Math.random() < 0.6; W.lampsOn(on ? (G.power ? 1.3 : 1) : 0.05); W.lightMul(on ? 1 : 0.55); if(horror.flicker <= 0){ W.lampsOn(G.power ? 1.3 : 1); W.lightMul(G.blackout ? 0.25 : 1); } }
  if(horror.black > 0){ horror.black -= dt; if(horror.black <= 0){ W.lightMul(G.blackout ? 0.25 : 1); W.lampsOn(G.power ? 1.3 : 1); A.sfx('glitch'); } }
  horror.t -= dt; if(horror.t > 0 || G.boss) return; horror.t = 40 + Math.random()*45;
  const T = G.M.T, opts = ['flicker', 'footsteps', 'radio', 'figure', 'whisper', 'creak', 'message', 'symbol'];
  if(!T.outdoor || W.envDark) opts.push('blackout', 'flicker');
  if(T.weather === 'storm' || T.weather === 'rain') opts.push('lightning', 'lightning');
  if(T.amb === 'city' || T.theme === 'military') opts.push('siren');
  const e = rnd(opts), back = { x:PL.x + Math.sin(PL.yaw)*8, z:PL.z + Math.cos(PL.yaw)*8 };
  switch(e){
    case 'flicker': horror.flicker = 2.4; A.sfx('glitch'); break;
    case 'blackout': horror.black = 5; W.lightMul(0.15); W.lampsOn(0.02); A.sfx('glitch'); C.say(BOTS.find(o=>!o.down), 'scary'); break;
    case 'footsteps': for(let k=0;k<6;k++) G.pending.push({ t:k*0.45, f:()=>A.sfx('step', { at:[back.x + (Math.random()-0.5)*2, back.z + (Math.random()-0.5)*2], vol:1.2, gap:0.1 }) }); break;
    case 'radio': C.radio('???', rnd(['...is anyone... still...', 'They are below us. They were always below us.', 'Do not open the altar.', 'Count... the lines...', '...the King is awake...']), '#c8a8ff'); break;
    case 'whisper': A.sfx('whisper', { at:[back.x, back.z], vol:1.4 }); break;
    case 'creak': { const d = G.M.doors.find(x=>!x.open && x.kind === 'shortcut'); if(d){ const c = { x:(d.box.x0 + d.box.x1)/2, z:(d.box.z0 + d.box.z1)/2 }; A.sfx('creak', { at:[c.x, c.z], vol:1.5 });
        if(Math.random() < 0.5 && dist(PL, c) > 10){ MO.openDoor(d); UI().toast('Somewhere, a gate opened by itself'); } } else A.sfx('creak', { at:[back.x, back.z] }); break; }
    case 'siren': A.sfx('siren'); break;
    case 'lightning': W.lightning(); A.sfx('thunder', { delay:0.6 + Math.random()*1.5 }); break;
    case 'figure': { const cam = W.camera, B = C.camBasis();
      for(let k=0;k<10;k++){ const dd = 22 + Math.random()*14, a = (Math.random() - 0.5)*0.5, x = PL.x + (B.fx*Math.cos(a) - B.fz*Math.sin(a))*dd, z = PL.z + (B.fz*Math.cos(a) + B.fx*Math.sin(a))*dd, c = C.navCell(x, z);
        if(c < 0 || C.NAV.blocked[c] || !C.segClear(PL.x, PL.z, x, z, 0.3, false)) continue;
        const rig = W.makeFigure(); rig.root.position.set(x, 0, z); rig.root.rotation.y = Math.atan2(-(PL.x - x), -(PL.z - z)); horror.figure = { rig, x, z, t:3.2 }; A.sfx('heart'); void cam; break; }
      if(horror.figure && Math.random() < 0.5) G.pending.push({ t:1.5, f:()=>C.say(BOTS.find(o=>!o.down), 'scary', true) }); break; }
    case 'message': { const zi = C.zoneAt(PL.x, PL.z), z = G.M.zones[zi]; if(!z) break; const ib = G.M.inner(z), yaw = PL.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), tx = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? ib.x1 - 0.05 : ib.x0 + 0.05) : PL.x, tz = Math.abs(fx) > Math.abs(fz) ? PL.z : (fz > 0 ? ib.z1 - 0.05 : ib.z0 + 0.05);
      const ry = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? -Math.PI/2 : Math.PI/2) : (fz > 0 ? Math.PI : 0);
      W.wallText(tx, 2.2, tz, ry, rnd(['THEY HEAR YOU', 'DON\'T LOOK BACK', 'W WAS HERE', 'COUNT THE LINES', 'HE IS BELOW', 'RUN'])); A.sfx('whisper'); break; }
    case 'symbol': { const s = G.M.symbols.find(x=>!G.symbolsFound.has(x.order)); if(s){ A.sfx('whisper', { at:[s.x, s.z], vol:1.5, far:60 }); C.radio('W.', 'One of my marks is near. Listen.', '#c8a8ff'); } break; }
  }
}

// ---- per-step and per-frame hooks -------------------------------------------------------------------------
MO.update = function(dt){
  if(G.mode === 'campaign') updateCampaign(dt); else if(G.mode === 'survival'){ updateSurvival(dt); updateBox(dt); }
  updateMystery(dt); horrorTick(dt);
  const dark = W.envDark || G.blackout || horror.black > 0;
  // the flashlight stutters during a flicker
  W.flashlight(dark, dark ? (horror.flicker > 0 && Math.random() < 0.35 ? 0.2 : 2.4) : 0);
};
MO.autopilotExtra = function(){
  if(G.mode !== 'survival') return;
  // tests: spend points like a player would
  if(!G.power){ const it = G.M.items.find(i=>i.kind === 'power'); if(it && G.zoneOpen[it.zone] && G.points > 0){ G.apGoal = it.front; } }
  const closed = G.M.doors.filter(d=>!d.open && d.kind === 'door' && (G.zoneOpen[d.a] !== G.zoneOpen[d.b]) && d.cost <= G.points);
  if(closed.length && G.breakT > 0){ closed.sort((a, b)=>a.cost - b.cost); MO.spend(closed[0].cost); MO.openDoor(closed[0]); }
  if(G.power){ for(const it of G.M.items){ if(it.kind === 'perk' && !PL.perks[it.perk] && G.points >= ZD.PERKS[it.perk].price + 1500 && G.zoneOpen[it.zone]){ MO.spend(ZD.PERKS[it.perk].price); buyPerk(it); break; } } }
};

})(window.ZD);

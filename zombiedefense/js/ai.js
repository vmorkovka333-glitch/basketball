// Zombie Squad - brains: every zombie type, mutations, status effects, bosses with phases,
// the bot squadmates (including their abilities) and a test autopilot.
(function(ZD){
const W = ZD.W, A = ZD.A, S = ZD.S, ZT = ZD.ZOMBIES, WEAP = ZD.WEAPONS;
const AI = ZD.AI = {};
const C = ZD.C, G = C.G, PL = C.PL, BOTS = C.BOTS, clamp = C.clamp, lerp = C.lerp, rnd = C.rnd, dist = C.dist, wrap = C.wrap;
const UI = ()=>ZD.UI, MO = ()=>ZD.Modes;
let _v;

// ---- spawning ----------------------------------------------------------------------
AI.spawnZombie = function(type, x, z, o){
  o = o || {}; const d = ZT[type], mut = o.mut || null;
  const rig = W.makeZombie(type, rnd(ZD.SHIRTS), rnd(ZD.PANTS), mut);
  const hpMul = o.hpMul || 1, hp = Math.round(d.hp*hpMul);
  const zb = { type, rig, x, z, y:o.rise === false ? 0 : -1.7, yaw:Math.random()*6.28, hp, maxHp:hp, armor:(d.armor || (mut === 'armor' ? 140 : 0))*hpMul, helmet:!!d.helmet,
    shield:!!d.shield, stealth:!!d.stealth, alpha:0.15, speed:d.speed*(0.9 + Math.random()*0.2)*(o.speedMul || 1)*(mut === 'swift' ? 1.35 : 1), dmg:d.dmg*(o.dmgMul || 1)*(mut === 'enraged' ? 1.5 : 1),
    state:o.rise === false ? 'chase' : 'rise', riseT:0, atkT:0, atkPose:0, hitDone:false, flinch:0, kx:0, kz:0, moveSpeed:0, deadT:0, fallDir:1, groanT:1 + Math.random()*6,
    stuckT:0, lx:x, lz:z, losT:0, los:false, fuse:0, target:null, mut, spitCool:2 + Math.random()*2, blinkT:d.blink ? d.blink.every*(0.5 + Math.random()) : 0, stompCool:3, hitT:0, revealT:0, life:0, chargeCool:4 };
  rig.root.position.set(x, zb.y, z); if(o.rise !== false) W.rise(x, z); G.zombies.push(zb); return zb;
};
AI.aliveCount = ()=>{ let n = 0; for(const z of G.zombies) if(z.state !== 'dead' && !z.boss) n++; return n; };

// ---- targets ---------------------------------------------------------------------------
function pickTarget(z){
  let tg = null, td = 1e9;
  if(z.boss){ for(const m of C.members()){ if(m.down || (m.fx && m.fx.shadow > 0)) continue; const dd = dist(m, z); if(dd < td){ td = dd; tg = m; } } if(tg) return tg; }
  for(const m of C.members()){ if(m.fx && m.fx.bulwark > 0 && dist(m, z) < 14) return m; }
  for(const m of C.members()){ if(m.fx && m.fx.shadow > 0) continue; const dd = dist(m, z) + (m.down ? 6 : 0); if(dd < td){ td = dd; tg = m; } }
  return tg || PL;
}
function turnTo(o, yaw, dt, rate){ o.yaw += clamp(wrap(yaw - o.yaw), -rate*dt, rate*dt); }
function moveZ(z, dx, dz, speed, dt){
  z.x += dx*speed*dt + z.kx*dt; z.z += dz*speed*dt + z.kz*dt; z.kx *= Math.max(0, 1 - dt*8); z.kz *= Math.max(0, 1 - dt*8);
  z.moveSpeed = speed; if(Math.abs(dx) + Math.abs(dz) > 0.01) turnTo(z, Math.atan2(-dx, -dz), dt, z.boss ? 4 : 6);
}
function speedOf(z){ return z.speed*(G.pow.slow > 0 ? 0.5 : 1)*(z.chill > 0 ? 0.5 : 1)*(z.buffed > 0 ? 1.3 : 1); }
// steer toward the target: straight when it is in sight, else down the flow field; zombies avoid each other
function steer(z, tg, dt, spd, low){
  const pdx = tg.x - z.x, pdz = tg.z - z.z, pd = Math.hypot(pdx, pdz) || 0.01;
  z.losT -= dt; if(z.losT <= 0){ z.losT = 0.25 + Math.random()*0.15; z.los = pd < 16 && C.segClear(z.x, z.z, tg.x, tg.z, 0.25, !low); }
  let dx, dz; if(z.los){ dx = pdx/pd; dz = pdz/pd; } else { const fd = C.flowDir(z.x, z.z); if(fd){ dx = fd[0]; dz = fd[1]; } else { dx = pdx/pd; dz = pdz/pd; } }
  if(!z.boss) for(const o of G.zombies){ if(o === z || o.state === 'dead') continue; const ox = z.x - o.x, oz = z.z - o.z; if(Math.abs(ox) > 0.8 || Math.abs(oz) > 0.8) continue;
    const od = Math.hypot(ox, oz); if(od < 0.75 && od > 0.001){ dx += ox/od*0.6; dz += oz/od*0.6; } }
  const l = Math.hypot(dx, dz) || 1; moveZ(z, dx/l, dz/l, spd, dt);
  const s = z.boss ? z.def.scale : ZT[z.type].scale; C.pushOut(z, (z.boss ? 0.45 : 0.3)*s, low ? C.LOWFREE : C.SOLID);
  z.stuckT += dt; if(z.stuckT > 1.5){ if(Math.hypot(z.x - z.lx, z.z - z.lz) < 0.3){ z.kx += (Math.random()-0.5)*3; z.kz += (Math.random()-0.5)*3; } z.stuckT = 0; z.lx = z.x; z.lz = z.z; }
}

// ---- the zombie update -------------------------------------------------------------------
AI.updateZombies = function(dt){
  for(const z of G.zombies) (z.boss ? updateBoss : updateZombie)(z, dt);
  if(G.zombies.some(z=>z.gone)) G.zombies = G.zombies.filter(z=>!z.gone);
};
function statuses(z, dt){
  if(z.burn > 0){ z.burn -= dt; z.hp -= z.burnDps*dt; if(Math.random() < dt*12) W.burn(z.x, 0.5, z.z); if(z.hp <= 0){ C.killZombie(z, { by:PL, element:'fire' }); return false; } }
  if(z.poison > 0){ z.poison -= dt; z.hp -= z.poisonDps*dt; if(Math.random() < dt*5) W.toxicCloud(z.x, z.z, 0.5); if(z.hp <= 0){ C.killZombie(z, { by:PL }); return false; } }
  if(z.chill > 0) z.chill -= dt; if(z.stun > 0) z.stun -= dt; if(z.buffed > 0) z.buffed -= dt; if(z.hitT > 0) z.hitT -= dt; if(z.revealT > 0) z.revealT -= dt;
  if(z.frozen > 0){ z.frozen -= dt; if(Math.random() < dt*6) W.ice(z.x, 1, z.z, 1); return false; }
  if(z.mut === 'regen' && z.hitT <= 0 && z.hp < z.maxHp) z.hp = Math.min(z.maxHp, z.hp + z.maxHp*0.03*dt);
  return true;
}
function updateZombie(z, dt){
  const d = ZT[z.type], s = d.scale;
  if(z.flinch > 0) z.flinch -= dt;
  if(z.state === 'dead'){ z.deadT += dt; W.animZombie(z.rig, z, dt); if(z.deadT > 3.4){ W.remove(z.rig.root); z.gone = true; } return; }
  z.life += dt;
  if(!statuses(z, dt)){ if(z.state !== 'dead'){ z.rig.root.position.set(z.x, z.y, z.z); } return; }
  z.groanT -= dt; if(z.groanT <= 0){ z.groanT = 4 + Math.random()*6; if(Math.hypot(z.x - PL.x, z.z - PL.z) < 30 && !z.stealth) A.sfx('groan', { at:[z.x, z.z], big:z.type === 'brute' || z.type === 'giant', gap:0.2 }); }
  // stalkers fade in only up close or when hit
  if(z.stealth){ const nd = Math.min(...C.members().map(m=>dist(m, z))); const want = z.revealT > 0 || nd < 7 ? 0.95 : 0.12; z.alpha += (want - z.alpha)*Math.min(1, dt*4); W.fadeZombie(z.rig, z.alpha); }
  if(z.type === 'healer'){ z.healT = (z.healT || 0) - dt; if(z.healT <= 0){ z.healT = 1; let any = false;
    for(const o of G.zombies){ if(o === z || o.state === 'dead' || o.boss) continue; if(dist(o, z) < d.heal.r && o.hp < o.maxHp){ o.hp = Math.min(o.maxHp, o.hp + d.heal.hps); any = true; W.particle('add', o.x, 1.6, o.z, 0, 1.5, 0, 0.6, 0.25, 0.35, 1, 0.4, 0.9, 0, 0); } }
    if(any) A.sfx('heal', { at:[z.x, z.z], vol:0.5, gap:0.3 }); } }
  const tg = z.target = pickTarget(z), pdx = tg.x - z.x, pdz = tg.z - z.z, pd = Math.hypot(pdx, pdz) || 0.01;
  z.moveSpeed = 0;
  if(G.over && z.state !== 'rise'){ z.state = 'chase'; z.atkPose = 0; }
  if(z.stun > 0 && z.state !== 'rise'){ z.rig.root.position.set(z.x, z.y, z.z); W.animZombie(z.rig, z, dt); return; }
  const spd = speedOf(z);
  switch(z.state){
    case 'rise': z.riseT += dt; z.y = -1.7*Math.pow(1 - Math.min(1, z.riseT/1.2), 2); if(z.riseT >= 1.2){ z.y = 0; z.state = 'chase'; } break;
    case 'chase': {
      if(G.over) break;
      if(z.type === 'golden'){ // runs from the squad and escapes after a while
        let ax = 0, az = 0; for(const m of C.members()){ const dd = dist(m, z) || 1; if(dd < 20){ ax += (z.x - m.x)/dd/dd; az += (z.z - m.z)/dd/dd; } }
        const l = Math.hypot(ax, az); if(l > 0.0001) moveZ(z, ax/l, az/l, spd, dt); C.pushOut(z, 0.3);
        if(z.life > 25){ W.blink(z.x, 1, z.z); W.remove(z.rig.root); z.gone = true; UI().toast('The golden zombie got away'); } break; }
      if(z.type === 'bloater' && pd < 1.8 && !tg.down){ z.state = 'fuse'; z.fuse = 0.8; break; }
      if(pd < 1.15 + (s - 1)*0.5){ z.state = 'attack'; z.atkT = 0; z.hitDone = false; break; }
      if(z.type === 'mutant'){ z.spitCool -= dt; if(z.spitCool <= 0 && pd < d.spit.range && pd > 4 && C.segClear(z.x, z.z, tg.x, tg.z, 0.1, false)){ z.state = 'spit'; z.atkT = 0; z.spitCool = d.spit.cool; break; } }
      if(z.type === 'giant'){ z.stompCool -= dt; if(z.stompCool <= 0 && pd < 4.5){ z.state = 'slam'; z.atkT = 0; z.stompCool = d.stomp.cool; break; } }
      if(z.type === 'captain'){ z.chargeCool -= dt; if(z.chargeCool <= 0 && pd > 5 && pd < 18 && C.segClear(z.x, z.z, tg.x, tg.z, 0.4, true)){ z.state = 'charge'; z.atkT = 0; z.chargeCool = 6; z.cdx = pdx/pd; z.cdz = pdz/pd; A.sfx('roar', { at:[z.x, z.z] }); break; } }
      if(z.type === 'teleport'){ z.blinkT -= dt; if(z.blinkT <= 0 && pd > 4 && pd < 26){ z.blinkT = d.blink.every*(0.8 + Math.random()*0.4); blinkToward(z, tg, Math.min(d.blink.dist, pd - 2)); break; } }
      steer(z, tg, dt, spd, z.type === 'climber');
      if(z.type === 'climber'){ let top = 0; for(const b of C.SOLID){ if(b.y1 < 1.6 && z.x > b.x0 - 0.2 && z.x < b.x1 + 0.2 && z.z > b.z0 - 0.2 && z.z < b.z1 + 0.2) top = Math.max(top, b.y1); } z.y += (top - z.y)*Math.min(1, dt*10); }
      break; }
    case 'attack': {
      z.atkT += dt; const p = z.atkT/d.atk; z.atkPose = p < 0.55 ? p/0.55 : 1 - (p - 0.55)/0.45;
      turnTo(z, Math.atan2(-pdx, -pdz), dt, 7);
      if(!z.hitDone && p >= 0.55){ z.hitDone = true; if(pd < 1.7 + (s - 1)*0.5){ if(tg.down){ if(tg === PL) PL.bleed -= 3; } else C.hurtMember(tg, z.dmg*(z.buffed > 0 ? 1.3 : 1), z); } }
      if(p >= 1){ z.state = 'chase'; z.atkPose = 0; }
      break; }
    case 'spit': z.atkT += dt; turnTo(z, Math.atan2(-pdx, -pdz), dt, 8);
      if(z.atkT >= 0.55){ z.state = 'chase'; A.sfx('spit', { at:[z.x, z.z] }); lob(z.x, 1.8*s, z.z, tg.x, tg.z, 'spit', d.spit.dmg, z); } break;
    case 'slam': z.atkT += dt; z.atkPose = Math.min(1, z.atkT/1.0); turnTo(z, Math.atan2(-pdx, -pdz), dt, 4);
      if(z.atkT >= 1.0){ z.state = 'chase'; z.atkPose = 0; shockwave(z.x, z.z, d.stomp.r, d.stomp.dmg, z, true); } break;
    case 'charge': z.atkT += dt;
      if(z.atkT < 0.5){ turnTo(z, Math.atan2(-pdx, -pdz), dt, 6); z.cdx = pdx/pd; z.cdz = pdz/pd; }
      else { moveZ(z, z.cdx, z.cdz, spd*3.2, dt); const bx = z.x, bz = z.z; C.pushOut(z, 0.45*s); const bumped = Math.hypot(bx - z.x, bz - z.z) > 0.01;
        for(const m of C.members()){ if(!m.down && dist(m, z) < 1.4*s && !z.chargeHit){ z.chargeHit = true; C.hurtMember(m, z.dmg*1.2, z); knock(m, z.cdx, z.cdz, 9); } }
        if(z.atkT > 1.6 || bumped){ z.state = 'chase'; z.chargeHit = false; if(bumped) W.dust(z.x, 0.5, z.z, 8); } } break;
    case 'fuse': z.fuse -= dt; turnTo(z, Math.atan2(-pdx, -pdz), dt, 7); if(z.fuse <= 0){ z.hp = 0; C.killZombie(z, {}); } break;
  }
  z.rig.root.position.set(z.x, z.y, z.z); z.rig.root.rotation.y = z.yaw;
  W.animZombie(z.rig, z, dt);
}
function blinkToward(z, tg, dd){
  const pdx = tg.x - z.x, pdz = tg.z - z.z, pd = Math.hypot(pdx, pdz) || 1;
  for(let k=0; k<6; k++){ const a = (Math.random() - 0.5)*1.2, cs = Math.cos(a), sn = Math.sin(a), nx = (pdx*cs - pdz*sn)/pd, nz = (pdx*sn + pdz*cs)/pd;
    const x = z.x + nx*dd, zz = z.z + nz*dd, c = C.navCell(x, zz); if(c < 0 || C.NAV.blocked[c]) continue;
    W.blink(z.x, 0, z.z); A.sfx('blink', { at:[z.x, z.z] }); z.x = x; z.z = zz; W.blink(x, 0, zz); return true; }
  return false;
}
function lob(x, y, z, tx, tz, kind, dmg, from){
  const dx = tx - x, dz = tz - z, d = Math.max(1, Math.hypot(dx, dz)), t = clamp(d/14, 0.5, 1.3);
  C.spawnProjectile({ kind, x, y, z, vx:dx/t, vy:(0.8 - y)/t + 0.5*9*t, vz:dz/t, grav:9, owner:'enemy', dmg, from, life:3 });
}
function knock(m, dx, dz, f){ if(m === PL){ PL.pullX = dx*f; PL.pullZ = dz*f; } else { m.x += dx*f*0.25; m.z += dz*f*0.25; C.pushOut(m, 0.38); } }
function shockwave(x, z, r, dmg, from, chill){
  W.ringFx(x, z, r, chill ? 0xa8e8ff : 0xffb070); W.dust(x, 0.3, z, 14); W.shake(0.4); A.sfx('stomp', { at:[x, z] });
  for(const m of C.members()){ if(m.down) continue; const d = dist(m, { x, z }); if(d < r){ C.hurtMember(m, dmg*(1 - d/r*0.5), from); knock(m, (m.x - x)/(d || 1), (m.z - z)/(d || 1), 7); if(chill) m.chillT = 2.5; } }
}

// ---- bosses ---------------------------------------------------------------------------------
const CD = { charge:7, cleave:0, slam:9, stomp:8, summon:14, buff:16, spit:4.5, gas:10, heal:18, teleport:9, pull:11, shards:8, cloak:16, meteor:14 };
AI.spawnBoss = function(id, x, z, o){
  o = o || {}; const def = ZD.BOSSES[id], rig = W.makeBoss(def), hp = Math.round(def.hp*(o.hpMul || 1));
  const b = { boss:true, id, def, type:'boss', rig, x, z, y:0, yaw:0, hp, maxHp:hp, armor:0, speed:def.speed, dmg:Math.min(def.dmg*0.6, 24)*(o.dmgMul || 1), state:'roar', atkT:0, atkPose:0, phase:0,
    cds:{}, flinch:0, kx:0, kz:0, moveSpeed:0, deadT:0, fallDir:1, stuckT:0, lx:x, lz:z, losT:0, los:false, target:null, born:G.t, chase:o.chase || null, chaseIdx:0, invuln:true, life:0, hitT:0 };
  for(const k in CD) b.cds[k] = CD[k]*(0.3 + Math.random()*0.5);
  rig.root.position.set(x, 0, z); G.zombies.push(b); G.boss = b;
  W.rise(x, z); A.sfx('boss'); A.sfx('roar', { at:[x, z] }); A.music.set(1, true);
  UI().bossBar(b); UI().banner('BOSS', def.name, 3);
  C.say(BOTS.find(o=>!o.down), 'boss', true);
  return b;
};
const abilitiesOf = b=>{ const out = []; for(let p=0; p<=b.phase; p++) for(const a of b.def.abilities[p]) if(!out.includes(a)) out.push(a); return out; };
AI.bossHit = function(b, dmg, o){
  const f = b.hp/b.maxHp;
  if(b.phase === 0 && f < 0.66 || b.phase === 1 && f < 0.33){ b.phase++; b.speed *= 1.15; b.state = 'roar'; b.atkT = 0; b.invuln = true; b.onCast = null;
    A.sfx('roar', { at:[b.x, b.z] }); UI().banner('PHASE ' + (b.phase + 1), b.def.name + ' is enraged', 2); W.shake(0.5);
    if(b.def.final && b.phase === 2) W.setEnv('blood', 2); }
  if(b.chase && b.chaseIdx < b.chase.length - 1 && f < [0.7, 0.4][b.chaseIdx]){ startFlee(b); }
};
function startFlee(b){
  b.chaseIdx++; b.fleeing = true; b.state = 'flee'; const p = b.chase[b.chaseIdx]; b.path = C.findPath(b.x, b.z, p.x, p.z); b.fleeT = 0;
  A.sfx('roar', { at:[b.x, b.z] }); UI().banner(b.def.name + ' RUNS', 'Follow the marker', 2.2); W.blink(b.x, 1, b.z);
}
AI.bossDead = function(b, o){
  const sec = Math.round(G.t - b.born); G.boss = null; UI().bossBar(null); A.music.set(0.4, false);
  G.haz = G.haz.filter(h=>!h.enemyDps); G.proj.filter(p=>p.owner === 'enemy').forEach(p=>{ p.done = true; W.remove(p.m); });   // its gas and shards go with it
  S.track('bossKills'); if(b.id === 'king') S.track('kingKills'); if(b.id === 'hollow') S.track('hollowKills');
  S.addXP(ZD.XP.boss); const rec = S.recordBoss(b.id, sec);
  UI().banner('BOSS DEFEATED', b.def.name, 3, (rec ? 'New best time: ' : 'Time: ') + Math.floor(sec/60) + ':' + String(sec % 60).padStart(2, '0'));
  W.explosion(b.x, 1, b.z, 5, 0xffd23a); A.sfx('objective');
  if(b.def.final || b.id === 'hollow') W.setEnv(G.M.T.env, 3);
  for(let k=0;k<2;k++) C.dropPowerup(b.x + (k - 0.5)*2, b.z);
  MO().onBossDead && MO().onBossDead(b, o);
};
function updateBoss(b, dt){
  const def = b.def, s = def.scale;
  if(b.flinch > 0) b.flinch -= dt;
  if(b.state === 'dead'){ b.deadT += dt; W.animZombie(b.rig, b, dt); if(b.deadT > 4){ W.remove(b.rig.root); b.gone = true; } return; }
  b.life += dt; if(b.hitT > 0) b.hitT -= dt;
  if(b.burn > 0){ b.burn -= dt; b.hp -= b.burnDps*dt*0.5; if(Math.random() < dt*10) W.burn(b.x, 1, b.z); }
  if(b.poison > 0){ b.poison -= dt; b.hp -= b.poisonDps*dt*0.5; }
  if(b.chill > 0) b.chill -= dt; if(b.stun > 0) b.stun -= dt; if(b.cloak > 0){ b.cloak -= dt; b.rig.root.visible = Math.random() < 0.25 || b.cloak < 0.4; } else b.rig.root.visible = true;
  if(b.frozen > 0){ b.frozen -= dt; W.animZombie(b.rig, b, dt); return; }
  if(b.hp <= 0 && b.state !== 'dead'){ C.killZombie(b, { by:PL }); return; }
  for(const k in b.cds) b.cds[k] -= dt*(1 + b.phase*0.2);
  const tg = b.target = pickTarget(b), pdx = tg.x - b.x, pdz = tg.z - b.z, pd = Math.hypot(pdx, pdz) || 0.01;
  b.moveSpeed = 0; b.rig.aura.material.opacity = 0.2 + Math.sin(G.t*4)*0.08 + b.phase*0.08;
  if(G.over){ b.state = 'chase'; b.rig.root.position.set(b.x, b.y, b.z); W.animZombie(b.rig, b, dt); return; }
  const spd = b.speed*(b.chill > 0 ? 0.7 : 1)*(G.pow.slow > 0 ? 0.6 : 1);
  switch(b.state){
    case 'roar': b.atkT += dt;
      if(b.onCast){ if(b.atkT >= b.castT){ const f = b.onCast; b.onCast = null; b.state = 'chase'; f(); } }
      else if(b.atkT > 1.4){ b.state = 'chase'; b.invuln = false; } break;
    case 'flee': { b.fleeT += dt; const p = b.chase[b.chaseIdx];
      if(b.path && b.path.length){ const [tx, tz] = b.path[0], dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz); if(d < 0.8) b.path.shift(); else moveZ(b, dx/d, dz/d, spd*2.2, dt); }
      C.pushOut(b, 0.45*s);
      if(dist(b, p) < 2 || b.fleeT > 20 || !b.path || !b.path.length){ if(dist(b, p) > 3){ b.x = p.x; b.z = p.z; W.blink(b.x, 1, b.z); } b.fleeing = false; b.state = 'roar'; b.atkT = 0; b.invuln = true; A.sfx('roar', { at:[b.x, b.z] }); }
      break; }
    case 'chase': {
      b.thinkT = (b.thinkT || 0) - dt;
      if(b.thinkT <= 0){ b.thinkT = 0.5; const los = C.segClear(b.x, b.z, tg.x, tg.z, 0.4, true);
        for(const a of abilitiesOf(b)){ if(b.cds[a] > 0) continue; if(tryAbility(b, a, tg, pd, los)){ b.cds[a] = CD[a]*(1 - b.phase*0.15); break; } } }
      if(b.state !== 'chase') break;
      if(pd < 1.5*s){ b.state = 'attack'; b.atkT = 0; b.hitDone = false; break; }
      steer(b, tg, dt, spd, false);
      break; }
    case 'attack': { b.atkT += dt; const dur = 1.2/(1 + b.phase*0.15), p = b.atkT/dur; b.atkPose = p < 0.55 ? p/0.55 : 1 - (p - 0.55)/0.45; turnTo(b, Math.atan2(-pdx, -pdz), dt, 5);
      if(!b.hitDone && p >= 0.55){ b.hitDone = true; const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
        for(const m of C.members()){ const dd = dist(m, b) || 1; if(m.down || dd > 1.8*s || ((m.x - b.x)*fx + (m.z - b.z)*fz)/dd < 0.2) continue; C.hurtMember(m, b.dmg, b); knock(m, (m.x - b.x)/dd, (m.z - b.z)/dd, 6); }
        A.sfx('meleeHit', { at:[b.x, b.z] }); }
      if(p >= 1){ b.state = 'chase'; b.atkPose = 0; } break; }
    case 'charge': b.atkT += dt;
      if(b.atkT < 0.7){ turnTo(b, Math.atan2(-pdx, -pdz), dt, 5); b.cdx = pdx/pd; b.cdz = pdz/pd; }
      else { moveZ(b, b.cdx, b.cdz, spd*3.4, dt); const bx = b.x, bz = b.z; C.pushOut(b, 0.45*s); const bumped = Math.hypot(bx - b.x, bz - b.z) > 0.01;
        for(const m of C.members()){ if(!m.down && dist(m, b) < 1.3*s && !(b.hitList || []).includes(m)){ (b.hitList = b.hitList || []).push(m); C.hurtMember(m, b.dmg*1.3, b); knock(m, b.cdx, b.cdz, 11); } }
        if(Math.random() < dt*20) W.dust(b.x, 0.3, b.z, 2);
        if(b.atkT > 2.0 || bumped){ b.state = 'chase'; b.hitList = []; if(bumped){ W.shake(0.3); W.dust(b.x, 0.8, b.z, 10); b.stun = 0.8; } } } break;
    case 'slam': case 'stomp': b.atkT += dt; b.atkPose = Math.min(1, b.atkT/1.0);
      if(b.atkT >= 1.0){ const stomp = b.lastAb === 'stomp'; b.state = 'chase'; b.atkPose = 0; shockwave(b.x, b.z, stomp ? 5 : 5.5, b.dmg*0.7, b, def.look === 'frost' || stomp); } break;
    case 'cast': case 'spit': b.atkT += dt; turnTo(b, Math.atan2(-pdx, -pdz), dt, 4);
      if(b.atkT >= b.castT){ b.state = 'chase'; if(b.onCast) b.onCast(); b.onCast = null; } break;
  }
  b.rig.root.position.set(b.x, b.y, b.z); b.rig.root.rotation.y = b.yaw;
  W.animZombie(b.rig, b, dt);
}
function cast(b, t, f, kind){ b.state = kind || 'cast'; b.atkT = 0; b.castT = t; b.onCast = f; }
function tryAbility(b, a, tg, pd, los){
  const def = b.def; b.lastAb = a;
  switch(a){
    case 'charge': if(pd < 6 || pd > 26 || !los) return false; b.state = 'charge'; b.atkT = 0; A.sfx('roar', { at:[b.x, b.z] }); return true;
    case 'slam': case 'stomp': if(pd > 8) return false; b.state = 'slam'; b.atkT = 0; return true;
    case 'cleave': return false;
    case 'summon': cast(b, 1.0, ()=>{ const n = 3 + b.phase, mix = MO().zombieMix();
      for(let k=0;k<n;k++){ const ang = k/n*Math.PI*2, x = b.x + Math.cos(ang)*3.5, z = b.z + Math.sin(ang)*3.5, c = C.navCell(x, z); if(c < 0 || C.NAV.blocked[c]) continue;
        AI.spawnZombie(MO().pickType(mix), x, z, { hpMul:MO().hpMul() }); } A.sfx('horde'); }, 'roar'); return true;
    case 'buff': cast(b, 1.0, ()=>{ for(const z of G.zombies){ if(z.boss || z.state === 'dead') continue; if(dist(z, b) < 16){ z.buffed = 12; W.particle('add', z.x, 1.8, z.z, 0, 1, 0, 0.8, 0.4, 1, 0.3, 0.2, 0.9, 0, 0); } } W.ringFx(b.x, b.z, 8, 0xff3a2a); A.sfx('roar', { at:[b.x, b.z] }); }, 'roar'); return true;
    case 'spit': if(pd > 22 || !los) return false; cast(b, 0.6, ()=>{ for(let k=-1;k<=1;k++) lob(b.x, 2.2*def.scale, b.z, tg.x + k*1.6, tg.z + k*1.2, 'spit', 16, b); A.sfx('spit', { at:[b.x, b.z] }); }, 'spit'); return true;
    case 'shards': cast(b, 0.7, ()=>{ const n = 10 + b.phase*2, kind = def.look === 'frost' ? 'shard' : (def.look === 'titan' || def.look === 'golem' ? 'rock' : 'shard'), base = Math.atan2(tg.x - b.x, tg.z - b.z);
      for(let k=0;k<n;k++){ const ang = base + (k/n - 0.5)*Math.PI*1.4, sx = Math.sin(ang), sz = Math.cos(ang);
        C.spawnProjectile({ kind, x:b.x + sx, y:1.4*def.scale*0.6, z:b.z + sz, vx:sx*16, vy:0, vz:sz*16, grav:0, owner:'enemy', dmg:12, from:b, life:2.2 }); } A.sfx('cryo', { at:[b.x, b.z] }); }); return true;
    case 'gas': cast(b, 0.8, ()=>{ for(const p of [tg, b]) C.addHazard({ kind:'gas', x:p.x + (Math.random()-0.5)*2, z:p.z + (Math.random()-0.5)*2, r:3.4, t:6, enemyDps:10 }); A.sfx('gas', { at:[b.x, b.z] }); }); return true;
    case 'heal': if(b.hp/b.maxHp > 0.6) return false; cast(b, 1.5, ()=>{ b.hp = Math.min(b.maxHp, b.hp + b.maxHp*0.08); W.ringFx(b.x, b.z, 3, 0x5be36b); A.sfx('heal', { at:[b.x, b.z] }); }); return true;
    case 'teleport': if(pd < 5) return false; { const ang = Math.random()*Math.PI*2; for(let k=0;k<8;k++){ const x = tg.x + Math.cos(ang + k)*5, z = tg.z + Math.sin(ang + k)*5, c = C.navCell(x, z);
      if(c < 0 || C.NAV.blocked[c]) continue; W.blink(b.x, 1, b.z); A.sfx('blink', { at:[b.x, b.z] }); b.x = x; b.z = z; W.blink(x, 1, z); return true; } } return false;
    case 'pull': if(pd > 18 || pd < 5 || !los || tg.down) return false; cast(b, 0.8, ()=>{ if(tg.down) return; W.arc(b.x, 1.8, b.z, tg.x, 1.2, tg.z, 0xd8d8d8); const d = dist(tg, b) || 1; knock(tg, (b.x - tg.x)/d, (b.z - tg.z)/d, 16); A.sfx('creak', { at:[b.x, b.z] }); }); return true;
    case 'cloak': b.cloak = 5; A.sfx('whisper', { at:[b.x, b.z] }); return true;
    case 'meteor': cast(b, 1.2, ()=>{ const targets = C.members().filter(m=>!m.down);
      for(let k=0;k<8;k++){ const m = rnd(targets) || tg; const x = m.x + (Math.random()-0.5)*7, z = m.z + (Math.random()-0.5)*7;
        G.pending.push({ t:k*0.22, f:()=>{ C.spawnProjectile({ kind:'meteor', x:x + 4, y:24, z:z - 3, vx:-4/1.0, vy:-24, vz:3/1.0, grav:0, owner:'enemy', dmg:18, life:2 }); W.ringFx(x, z, 1.5, 0xff6a2a); } }); }
      A.sfx('roar', { at:[b.x, b.z] }); }, 'roar'); return true;
  }
  return false;
}

// ---- bots ------------------------------------------------------------------------------------
const nearestTo = AI.nearestTo = (list, p) => list.slice().sort((a, b)=>dist(a, p) - dist(b, p))[0];
function botGoalFor(b, idx){
  for(const m of C.members()){ if(!m.down || m === b) continue;
    const helper = nearestTo(BOTS.filter(o=>!o.down), m); if(helper === b) return { task:'revive', x:m.x, z:m.z, who:m }; }
  const g = MO().botGoal ? MO().botGoal(b, idx) : null; if(g) return g;
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw), rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw), sl = b.slot;
  return { task:'follow', x:PL.x + rx*sl[0] - fx*sl[1], z:PL.z + rz*sl[0] - fz*sl[1] };
}
function botTarget(b){
  const nestStep = MO().nestStep && MO().nestStep();
  if(nestStep){ const n = nearestTo((G.nests || []).filter(x=>!x.dead), b);
    if(n && dist(n, b) < 24 && C.segClear(b.x, b.z, n.x, n.z, 0.05, false) && !G.zombies.some(z=>z.state !== 'dead' && z.state !== 'rise' && (dist(z, b) < 6 || dist(z, PL) < 4))) return { nest:n }; }
  let best = null, score = 1e9;
  for(const z of G.zombies){ if(z.state === 'dead' || (z.state === 'rise' && z.riseT < 0.8) || z.fleeing || (z.stealth && z.alpha < 0.4)) continue;
    const d = dist(z, b); if(d > 22) continue;
    let sc = d; if(z.target === PL && dist(z, PL) < 4) sc -= 8; if(z.target && z.target.down) sc -= 6; if(z.type === 'bloater' && d < 5) sc += 20; if(z.boss) sc -= 4; if(z.type === 'healer') sc -= 3;
    if(sc < score && C.segClear(b.x, b.z, z.x, z.z, 0.05, false)){ score = sc; best = z; } }
  if(best) return { z:best };
  if(nestStep) for(const n of (G.nests || [])){ if(!n.dead && dist(n, b) < 26 && C.segClear(b.x, b.z, n.x, n.z, 0.05, false)) return { nest:n }; }
  return null;
}
function botAbility(b){
  if((b.ult || 0) < 1 || b.down) return;
  const near = r=>G.zombies.filter(z=>z.state !== 'dead' && dist(z, b) < r).length, id = ZD.CHARS[b.charId].ability;
  let go = false;
  if(id === 'medic') go = C.members().some(m=>m.down) || C.members().reduce((a, m)=>a + m.hp/m.maxHp, 0)/4 < 0.5;
  else if(id === 'bulwark') go = near(6) >= 4 || (PL.down && near(8) >= 2);
  else if(id === 'sentry') go = near(15) >= 5 || !!G.boss;
  else if(id === 'shadow') go = b.hp < b.maxHp*0.4;
  else if(id === 'firestorm') go = near(6) >= 4;
  else go = near(10) >= 4 || !!G.boss;
  if(go) C.useAbility(b);
}
AI.updateBot = function(b, idx, dt){
  b.nadeCool -= dt;
  if(b.down){ W.animSoldier(b.rig, { down:true }, dt); b.rig.root.position.set(b.x, 0, b.z); return; }
  b.hurtT += dt; if(b.hurtT > 6 && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + 5*dt);
  b.pathT -= dt;
  if(b.pathT <= 0){ b.pathT = 0.5 + Math.random()*0.3; const goal = botGoalFor(b, idx);
    if(goal.task !== b.task && (goal.task === 'collect' || goal.task === 'activate' || goal.task === 'scan')) C.say(b, 'use');
    b.task = goal.task; b.goal = goal;
    b.path = Math.hypot(goal.x - b.x, goal.z - b.z) > 1.2 && !C.segClear(b.x, b.z, goal.x, goal.z, 0.3, true) ? C.findPath(b.x, b.z, goal.x, goal.z) : [[goal.x, goal.z]]; }
  const boss = G.boss; if(boss && !boss.fleeing && boss.state !== 'dead' && b.task !== 'revive' && dist(boss, b) < 7.5){ const d0 = dist(boss, b) || 1;
    const rx = b.x + (b.x - boss.x)/d0*8, rz = b.z + (b.z - boss.z)/d0*8, c = C.openNear(C.navCell(rx, rz)); if(c >= 0){ const p = C.cellPos(c); b.path = [[p[0], p[1]]]; b.pathT = 0.4; b.task = 'kite'; } }
  let mvx = 0, mvz = 0, speed = 0;
  if(b.path && b.path.length){ const [tx, tz] = b.path[0], dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    const near = b.path.length === 1 ? (b.task === 'follow' ? 1.0 : 0.35) : 0.6;
    if(d < near) b.path.shift();
    else { const far = dist(PL, b); speed = (b.task === 'follow' && far > 9) || b.task === 'revive' || b.task === 'kite' || (b.task === 'collect' && d > 6) ? ZD.PLAYER.sprint*0.95 : ZD.PLAYER.walk*0.95;
      if(b.chillT > 0) speed *= 0.6; mvx = dx/d; mvz = dz/d; } }
  for(const o of C.members()){ if(o === b) continue; const ox = b.x - o.x, oz = b.z - o.z, od = Math.hypot(ox, oz); if(od < 1.1 && od > 0.001){ mvx += ox/od*0.8; mvz += oz/od*0.8; if(!speed) speed = 1.5; } }
  const ml = Math.hypot(mvx, mvz);
  if(ml > 0.01){ b.x += mvx/ml*speed*dt; b.z += mvz/ml*speed*dt; } C.pushOut(b, 0.38);
  if(b.chillT > 0) b.chillT -= dt;
  b.moving = speed > 0.1 && ml > 0.01;
  b.stuckT += dt; if(b.stuckT > 1.2){ if(b.moving && Math.hypot(b.x - b.lx, b.z - b.lz) < 0.3) b.pathT = 0; b.stuckT = 0; b.lx = b.x; b.lz = b.z; }
  const g = b.goal, reviving = g && g.task === 'revive' && g.who.down && dist(g.who, b) < 1.5;
  if(reviving){ g.who.reviveT += dt; if(g.who.reviveT >= C.reviveTime(b)) C.revive(g.who, b); }
  if(g && g.task === 'collect' && g.item && !g.item.taken && dist(g.item, b) < 1.3){ MO().takeItem(g.item, b); b.pathT = 0; }
  b.fireT -= dt; if(b.reloadT > 0){ b.reloadT -= dt; if(b.reloadT <= 0) b.mag = WEAP[b.weapon].mag; }
  b.aimT -= dt; if(b.aimT <= 0){ b.aimT = 0.2; b.target = botTarget(b); botAbility(b); }
  if(b.target && ((b.target.z && (b.target.z.state === 'dead' || b.target.z.fleeing)) || (b.target.nest && b.target.nest.dead))) b.target = null;
  let faceYaw = ml > 0.01 && speed > 2 ? Math.atan2(-mvx, -mvz) : b.yaw;
  if(b.target && !reviving){
    const t = b.target.z || b.target.nest; faceYaw = Math.atan2(-(t.x - b.x), -(t.z - b.z));
    if(Math.abs(wrap(faceYaw - b.yaw)) < 0.35 && b.fireT <= 0 && b.reloadT <= 0) botShoot(b, b.target);
    if(b.target.z && b.nadeCool <= 0){ let n = 0; for(const z of G.zombies) if(z.state !== 'dead' && dist(z, t) < 4) n++;
      if(n >= 5 && dist(t, b) > 7 && C.members().every(m=>dist(m, t) > 6)){ C.throwNade(b, t.x, t.z); b.nadeCool = 14 + Math.random()*8; } }
  }
  b.yaw += clamp(wrap(faceYaw - b.yaw), -9*dt, 9*dt);
  b.rig.root.position.set(b.x, 0, b.z); b.rig.root.rotation.y = b.yaw;
  W.animSoldier(b.rig, { moving:b.moving, sprint:speed > ZD.PLAYER.walk, pitch:0, reload:b.reloadT, recoil:Math.max(0, b.fireT - 0.1)*0.4 }, dt);
};
// bots roll for hits instead of tracing rays; they fire slower and weaker than the player so the player stays the star
function botShoot(b, tg){
  const wd = WEAP[b.weapon], fx = b.fx || {}; b.mag--; b.fireT = wd.rate*(wd.pellets > 1 ? 1.6 : (wd.auto ? 3.6 : 2))/(fx.adrenaline > 0 ? 1.5 : 1) + Math.random()*0.08;
  if(b.mag <= 0){ b.reloadT = wd.reload; if(Math.random() < 0.5) C.say(b, 'reload'); }
  const t = tg.z || tg.nest, d = Math.max(0.5, Math.hypot(t.x - b.x, t.z - b.z));
  b.rig.root.updateMatrixWorld(true); b.rig.muzzle.getWorldPosition(_v || (_v = new THREE.Vector3())); const mp = _v;
  W.botFlash(mp.x, mp.y, mp.z); A.sfx(wd.sound, { at:[b.x, b.z], vol:0.45 });
  let chance = b.def.acc*clamp(1.2 - d/28, 0.25, 1); if(tg.z && (tg.z.type === 'runner' || tg.z.type === 'climber')) chance *= 0.8; if(tg.nest) chance = 0.85; if(fx.deadeye > 0) chance = 1;
  let hits = 0; for(let p=0; p<wd.pellets; p++) if(Math.random() < (wd.pellets > 1 ? (d < wd.range*0.6 ? 0.55 : 0.25) : chance)) hits++;
  const s = tg.z ? (tg.z.boss ? tg.z.def.scale : ZT[tg.z.type].scale) : 1, ty = tg.z ? 1.2*s : 0.9;
  const scale = 0.5*(G.mode === 'survival' ? 1 + 0.07*((G.wave || 1) - 1) : 1 + 0.08*((G.intensity || 1) - 1));
  if(hits > 0){
    if(tg.z){ const head = wd.pellets === 1 && (Math.random() < 0.18 || fx.deadeye > 0); C.damageZombie(tg.z, wd.dmg*hits*(head ? wd.headMul : 1)*scale, { head, x:t.x, y:ty + (head ? 0.4 : 0), z:t.z, dx:(t.x - b.x)/d, dz:(t.z - b.z)/d, by:b, element:wd.element }); }
    else C.damageNest(tg.nest, wd.dmg*hits*scale, t.x, 1, t.z);
    W.tracer(mp.x, mp.y, mp.z, t.x, ty, t.z, 0xffd28a);
  } else W.tracer(mp.x, mp.y, mp.z, t.x + (Math.random()-0.5)*2.5, ty + (Math.random()-0.5)*1.5, t.z + (Math.random()-0.5)*2.5, 0xffd28a);
}

// ---- autopilot (tests only): plays the player's part --------------------------------------------
AI.autopilot = function(dt){
  G.autoMove = null; G.trigger = false; G.useHeld = false;
  const cam = W.camera, w = C.curW(), _h = new THREE.Vector3();
  if(PL.down){ const z = nearestTo(G.zombies.filter(z=>z.state !== 'dead' && z.state !== 'rise' && !z.fleeing && dist(z, PL) < 20), PL);
    if(z){ C.refreshRig(z); (z.boss && z.rig.weak ? z.rig.weak : z.rig.headMesh).getWorldPosition(_h); const dx = _h.x - cam.position.x, dy = _h.y - cam.position.y, dz = _h.z - cam.position.z, d = Math.hypot(dx, dy, dz);
      PL.yaw = Math.atan2(-dx, -dz); PL.pitch = Math.asin(dy/d); G.trigger = true; G.triggerPressed = ((G.t*6)|0) % 2 === 0; } return; }
  if(!w) return;
  const tgObj = MO().objectiveTarget ? MO().objectiveTarget() : null, nestStep = MO().nestStep && MO().nestStep();
  let best = null, bd = 1e9;
  for(const z of G.zombies){ if(z.state === 'dead' || (z.state === 'rise' && z.riseT < 0.9) || z.fleeing) continue; const d = dist(z, PL); if(d > (nestStep ? 7 : 22) || d >= bd) continue;
    if(C.segClear(PL.x, PL.z, z.x, z.z, 0.05, false)){ bd = d; best = z; } }
  if(best){ C.refreshRig(best); (best.boss && best.rig.weak ? best.rig.weak : best.rig.headMesh).getWorldPosition(_h); const near = bd < 3, ox = near ? PL.x : cam.position.x, oy = near ? 1.62 : cam.position.y, oz = near ? PL.z : cam.position.z;
    const dx = _h.x - ox, dy = _h.y - (best.boss ? 0 : 0.3) - oy, dz = _h.z - oz, d = Math.hypot(dx, dy, dz);
    PL.yaw = Math.atan2(-dx, -dz) - PL.kickYaw + Math.sin(G.t*2.3)*(G.apErr || 0); PL.pitch = Math.asin(dy/d) - PL.kick + Math.cos(G.t*1.7)*(G.apErr || 0)*0.6;
    if(bd < 1.5 && PL.meleeCool <= 0 && !best.boss) C.melee(); else { G.trigger = true; if(!WEAP[w.id].auto) G.triggerPressed = ((G.t*8)|0) % 2 === 0; }
    let crowd = 0; for(const z of G.zombies) if(z.state !== 'dead' && dist(z, best) < 4) crowd++;
    if((crowd >= 5 || best.boss) && bd > 6 && PL.nades > 0 && PL.nadeCool <= 0) C.throwNade(PL);
    if(PL.ult >= 1 && (crowd >= 3 || best.boss)) C.useAbility(PL);
    if(best.boss && bd < 8 && !best.fleeing){ G.autoMove = [0, -1]; return; } }
  if(w.mag === 0 && w.res <= 0) C.swapWeapon();
  let goal = null; const downBot = BOTS.find(b=>b.down && dist(b, PL) < 18);
  if(downBot && (!best || bd > 6)) goal = [downBot.x, downBot.z];
  else if(tgObj || (G.st && G.st.at)){ const o = tgObj || G.st.at; goal = [o.x, o.z];
    if(nestStep){
      if(!best && Math.hypot(tgObj.x - PL.x, tgObj.z - PL.z) < 22){ const dx = tgObj.x - cam.position.x, dy = 0.8 - cam.position.y, dz = tgObj.z - cam.position.z, d = Math.hypot(dx, dy, dz);
        PL.yaw = Math.atan2(-dx, -dz); PL.pitch = Math.asin(dy/d); G.trigger = true; G.triggerPressed = true; } } }
  if(downBot && dist(downBot, PL) < 1.6) G.useHeld = true;
  if(G.interact && G.interact.auto) { G.useHeld = true; G.usePressed = true; }
  MO().autopilotExtra && MO().autopilotExtra(dt);
  if(!goal) return;
  const ap = G.ap || (G.ap = { path:null, t:0, goal:null });
  ap.t -= dt; if(ap.t <= 0 || !ap.goal || Math.hypot(ap.goal[0] - goal[0], ap.goal[1] - goal[1]) > 2){ ap.t = 0.6; ap.goal = goal; ap.path = C.findPath(PL.x, PL.z, goal[0], goal[1]); }
  if(!ap.path || !ap.path.length || Math.hypot(goal[0] - PL.x, goal[1] - PL.z) < (nestStep ? 8 : 1.0)) return;
  const [tx, tz] = ap.path[0]; if(Math.hypot(tx - PL.x, tz - PL.z) < 0.7){ ap.path.shift(); return; }
  const wx = tx - PL.x, wz = tz - PL.z, wl = Math.hypot(wx, wz);
  if(!best && !G.trigger){ PL.yaw = Math.atan2(-wx, -wz); PL.pitch = -0.08; }
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw), rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw);
  G.autoMove = [(wx*rx + wz*rz)/wl, (wx*fx + wz*fz)/wl];
};

})(window.ZD);

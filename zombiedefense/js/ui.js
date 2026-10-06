// Zombie Squad - the HUD, every menu screen (campaign, survival, armory, squad, challenges,
// records, settings), results, the keypad and notes, notifications, and the menu backdrop.
(function(ZD){
const W = ZD.W, A = ZD.A, S = ZD.S, WEAP = ZD.WEAPONS;
const UI = ZD.UI = {};
const C = ZD.C, G = C.G, PL = C.PL, BOTS = C.BOTS, clamp = C.clamp, dist = C.dist;
const MO = ()=>ZD.Modes;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const fmtTime = s => Math.floor(s/60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const OVERLAYS = ['menu','campWrap','survWrap','armWrap','squadWrap','chalWrap','recWrap','setWrap','howWrap','pauseWrap','resWrap','keyWrap','noteWrap','clickWrap'];

// ---- notifications (achievements, levels, challenges) -------------------------------------
const notes = [];
function notify(kind, title, text){
  const el = document.createElement('div'); el.className = 'nt ' + kind; el.innerHTML = '<b>' + esc(title) + '</b><span>' + esc(text) + '</span>';
  $('notes').appendChild(el); notes.push(el); requestAnimationFrame(()=>el.classList.add('show'));
  if(kind === 'level') A.sfx('level'); else A.sfx('powerup');
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 400); }, 4200);
  updateProfile();
}

// ---- HUD ------------------------------------------------------------------------------------
UI.setMode = function(mode){ $('app').classList.toggle('surv', mode === 'survival'); $('app').classList.toggle('camp', mode === 'campaign'); };
let lastHud = '', lastSquad = '';
UI.updateHud = function(force){
  const w = C.curW(); if(!w || !G.M) return; const st = C.wstat(w), d = WEAP[w.id];
  const prog = G.mode === 'campaign' ? MO().stepText() : '';
  const sig = [G.mode, G.step, G.wave, G.breakT > 0, w.id, w.rar, w.element, w.mag, w.res, Math.round(PL.hp), PL.maxHp, PL.nades, prog, G.points, Object.keys(PL.perks).join(), G.st && G.st.done].join('|');
  if(!force && sig === lastHud) return; lastHud = sig;
  if(G.mode === 'campaign'){ const s = G.mission.steps[G.step];
    $('objMission').textContent = ZD.MAPS[G.mapIndex].name + ' · ' + G.mission.name; $('objText').textContent = s ? s.text : 'Mission complete'; $('objProg').textContent = prog;
    $('objExtra').textContent = G.mystery ? 'OPTIONAL: follow the strange signal' : ''; }
  else { $('waveNum').textContent = G.wave || '-'; $('points').textContent = G.points.toLocaleString('en-US'); }
  $('wName').textContent = d.name.toUpperCase(); $('wName').style.color = st.rar.color;
  $('wTag').textContent = (w.rar ? st.rar.name.toUpperCase() : '') + (st.element ? (w.rar ? ' · ' : '') + ZD.ELEMENTS[st.element].name : ''); $('wTag').style.color = st.element ? ZD.ELEMENTS[st.element].color : st.rar.color;
  $('ammoMag').textContent = w.mag; $('ammoRes').textContent = w.res === Infinity ? '∞' : w.res;
  $('ammoMag').classList.toggle('low', w.mag <= Math.ceil(st.mag*0.25));
  $('hpFill').style.width = Math.max(0, PL.hp/PL.maxHp*100) + '%'; $('nades').textContent = PL.nades;
  $('nadeCnt').textContent = PL.nades; $('bNade').classList.toggle('empty', PL.nades <= 0);
  $('swapTo').textContent = PL.weapons.length > 1 ? WEAP[PL.weapons[(PL.cur + 1) % PL.weapons.length].id].model.toUpperCase() : '-';
  $('perkRow').innerHTML = Object.keys(PL.perks).map(p=>'<i style="background:' + ZD.PERKS[p].color + '" title="' + esc(ZD.PERKS[p].name) + '">' + ZD.PERKS[p].icon + '</i>').join('');
};
UI.renderSquad = function(){
  const sig = BOTS.map(b=>b.down + ':' + Math.round(b.hp/b.maxHp*20) + ':' + Math.round((b.ult || 0)*10)).join('|'); if(sig === lastSquad) return; lastSquad = sig;
  $('squad').innerHTML = BOTS.map(b=>'<div class="sq' + (b.down ? ' down' : '') + '"><b style="color:' + b.def.css + '">' + b.name + '</b><i><u style="width:' + Math.round(b.hp/b.maxHp*100) + '%;background:' + b.def.css + '"></u></i>' +
    (b.down ? '<em>DOWN</em>' : (b.ult >= 1 ? '<em class="ult">ULT</em>' : '')) + '</div>').join('');
};
UI.renderFeed = function(){ $('feed').innerHTML = C.feed().map(f=>'<div style="opacity:' + Math.min(1, f.t).toFixed(2) + '"><b style="color:' + f.css + '">' + esc(f.name) + '</b> ' + esc(f.text) + '</div>').join(''); };
let _wv = null;
function waypoint(){
  const el = $('wp'), tg = G.over ? null : MO().objectiveTarget();
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
UI.updateHudFrame = function(dt){
  const w = C.curW(); if(!w) return; const st = C.wstat(w), d = st.d;
  const sp = d.flame ? 0.02 : (d.spreadHip + (d.spreadAds - d.spreadHip)*PL.adsT)*(PL.moving ? 1.3 : 1)*st.spread + PL.bloom;
  const scoped = PL.adsT > 0.85 && (d.ads || 99) < 40;
  $('xhair').style.setProperty('--g', (4 + sp*520).toFixed(1) + 'px'); $('xhair').classList.toggle('hide', PL.sprint || PL.down || scoped); $('scope').classList.toggle('show', scoped);
  $('hurt').style.opacity = PL.down ? 0.9 : Math.min(0.85, (1 - PL.hp/PL.maxHp)*1.1).toFixed(2);
  // the prompt for whatever can be used
  const it = G.over ? null : G.interact, pr = $('prompt'), use = $('bUse');
  if(it){ const surv = G.mode === 'survival', btn = C.buttonsMode();
    let txt = it.kind === 'revive' ? (btn ? 'Hold USE' : 'Hold E') + ' to ' + it.text : (it.zone ? it.text : (btn ? (it.hold ? 'Hold USE: ' : 'USE: ') : (it.hold ? 'Hold E: ' : 'E: ')) + it.text);
    $('promptText').textContent = txt; const cost = surv && it.cost ? it.cost : 0;
    $('promptCost').textContent = cost ? cost.toLocaleString('en-US') : ''; $('promptCost').classList.toggle('bad', cost > G.points);
    pr.classList.add('show'); use.classList.toggle('show', !it.zone || !!it.auto);
    const p = it.kind === 'revive' ? it.who.reviveT/it.time : (it.zone && it.sw ? it.sw.prog : (it.hold ? G.useT/it.time : 0));
    $('promptRing').style.display = (it.hold || it.zone || it.kind === 'revive') ? 'block' : 'none'; $('promptRing').style.setProperty('--p', (clamp(p, 0, 1)*100).toFixed(0) + '%');
  } else { pr.classList.remove('show'); use.classList.remove('show'); }
  // objective progress bar
  if(G.mode === 'campaign'){ const s = G.mission.steps[G.step], bar = $('objBar'); let bp = -1;
    if(s && s.type === 'activate'){ const sw = G.switches.find(x=>!x.done && x.prog > 0); if(sw) bp = sw.prog; }
    else if(s && s.type === 'investigate'){ const sc = G.scans.find(x=>!x.done && x.prog > 0); if(sc) bp = sc.prog; }
    else if(s && s.type === 'evac' && G.st.started) bp = G.st.landed ? 1 : 1 - G.st.waitT/s.wait;
    else if(s && s.type === 'hold' && G.st.started) bp = G.st.prog/G.st.need;
    else if(s && s.type === 'kill') bp = Math.min(1, G.st.done/G.st.need);
    bar.style.display = bp >= 0 ? 'block' : 'none'; if(bp >= 0) bar.firstElementChild.style.width = (bp*100).toFixed(1) + '%';
    const tl = G.st && G.st.timeLimit ? Math.max(0, G.st.timeLimit - (G.t - G.st.t0)) : -1; $('timer').style.display = tl >= 0 ? 'block' : 'none'; if(tl >= 0){ $('timer').textContent = fmtTime(Math.ceil(tl)); $('timer').classList.toggle('low', tl < 20); }
    const sigOn = s && s.type === 'signal' || !!G.mystery; $('signal').style.display = sigOn ? 'block' : 'none';
    if(sigOn){ const k = G.mystery && !(s && s.type === 'signal') ? clamp(1 - dist(PL, G.mystery)/70, 0, 1) : MO().signalStrength(); $('signalFill').style.width = (k*100).toFixed(0) + '%'; $('signalLbl').textContent = G.mystery && !(s && s.type === 'signal') ? 'STRANGE SIGNAL' : 'RADIO SIGNAL'; } }
  else { $('timer').style.display = 'none'; $('signal').style.display = 'none';
    const alive = G.zombies.filter(z=>z.state !== 'dead').length;
    $('waveInfo').textContent = G.breakT > 0 ? 'Next wave in ' + Math.ceil(G.breakT) + 's' : (G.toSpawn + alive) + ' zombies left';
    $('bReady').style.display = G.breakT > 2 ? '' : 'none'; }
  if(PL.down){ $('bleedFill').style.width = (PL.bleed/ZD.PLAYER.bleed*100) + '%';
    const helper = ZD.AI.nearestTo(BOTS.filter(b=>!b.down), PL);
    $('downSub').textContent = helper ? (PL.reviveT > 0 ? helper.name + ' is pulling you up  ·  ' + Math.round(PL.reviveT/ZD.PLAYER.revive*100) + '%' : helper.name + ' is coming to help you') : 'Nobody can reach you'; }
  const rb = $('reloadBar'); if(PL.reloadT > 0){ rb.classList.add('show'); rb.firstElementChild.style.width = ((1 - PL.reloadT/(PL.reloadMax || 1))*100) + '%'; } else rb.classList.remove('show');
  // ability, power-ups, streak
  const u = clamp(PL.ult, 0, 1); $('ultRing').style.setProperty('--p', (u*100).toFixed(0) + '%'); $('bUlt').classList.toggle('ready', u >= 1); $('ultFill').style.width = (u*100) + '%';
  $('ultLbl').textContent = (u >= 1 ? 'READY · ' : '') + ZD.CHARS[PL.char].ult; $('ultRow').classList.toggle('ready', u >= 1);
  const pw = Object.keys(G.pow).filter(k=>G.pow[k] > 0); const sigP = pw.map(k=>k + Math.ceil(G.pow[k])).join();
  if(sigP !== UI._pw){ UI._pw = sigP; $('powRow').innerHTML = pw.map(k=>'<i style="border-color:' + ZD.POWERUPS[k].color + ';color:' + ZD.POWERUPS[k].color + '">' + ZD.POWERUPS[k].icon + '<small>' + Math.ceil(G.pow[k]) + '</small></i>').join(''); }
  const nk = ZD.KILLSTREAKS.find(k=>k.n > G.streak); $('streak').textContent = G.streak >= 3 ? 'STREAK ' + G.streak + (nk ? '  ·  ' + nk.name + ' at ' + nk.n : '') : '';
  if(G.boss){ const b = G.boss; $('bossFill').style.width = Math.max(0, b.hp/b.maxHp*100) + '%'; $('bossPhase').textContent = 'PHASE ' + (b.phase + 1) + (b.fleeing ? ' · RUNNING' : (b.cloak > 0 ? ' · CLOAKED' : '')); }
  const fq = C.feed(); if(fq.length){ let fading = false; for(const f of fq){ f.t -= dt; if(f.t < 1) fading = true; } if(fading){ const keep = fq.filter(f=>f.t > 0); fq.length = 0; fq.push(...keep); UI.renderFeed(); } }
  waypoint();
};
UI.hitmarker = function(kind){ const h = $('hitm'); h.className = ''; void h.offsetWidth; h.className = 'show ' + kind; A.sfx(kind === 'head' ? 'head' : (kind === 'crit' ? 'crit' : 'hit')); };
UI.hurtDir = function(from){ const el = $('hitDir'), B = C.camBasis(), dx = from.x - PL.x, dz = from.z - PL.z, ang = Math.atan2(dx*B.rx + dz*B.rz, dx*B.fx + dz*B.fz);
  el.style.transform = 'translate(-50%,-50%) rotate(' + ang + 'rad)'; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); };
UI.setDown = function(on){ $('downWrap').classList.toggle('show', !!on); };
UI.bossBar = function(b){ $('bossBar').classList.toggle('show', !!b); if(b){ $('bossName').textContent = b.def.name; $('bossFill').style.width = '100%'; } };
UI.popPoints = function(n){ const el = document.createElement('div'); el.className = 'pp' + (n < 0 ? ' neg' : (n >= 100 ? ' big' : '')); el.textContent = (n > 0 ? '+' : '') + n; el.style.left = (Math.random()*40) + 'px';
  $('pops').appendChild(el); setTimeout(()=>el.remove(), 900); $('points').textContent = G.points.toLocaleString('en-US'); };
UI.flashColor = function(css){ const f = $('flashC'); f.style.background = 'radial-gradient(ellipse at center, transparent 40%, ' + css + ' 140%)'; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show'); };
let bannerTimer = 0, toastT = 0;
UI.banner = function(top, main, time, sub){
  $('bannerTop').textContent = top; $('bannerMain').textContent = main; $('bannerSub').textContent = sub || '';
  const b = $('banner'); b.classList.toggle('long', String(main).length > 14); b.style.animationDuration = (time || 2.5) + 's';
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); clearTimeout(bannerTimer); bannerTimer = setTimeout(()=>b.classList.remove('show'), (time || 2.5)*1000);
};
UI.toast = function(t, ms){ const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(()=>el.classList.remove('show'), ms || 2400); };
UI.glyphFound = function(glyph, order){ const c = $('glyphs').children[order]; if(c){ c.classList.add('on'); drawGlyphTo(c.querySelector('canvas'), glyph, '#7affc8'); } };
function drawGlyphTo(cv, idx, color){ const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); ZD.drawGlyph(g, idx, cv.width, color); }

// ---- overlays: pause, results, keypad, notes ----------------------------------------------------
UI.hideScreens = function(){ OVERLAYS.forEach(id=>$(id).classList.remove('show')); $('app').classList.remove('menu'); $('app').classList.add('play'); UI.bossBar(null); UI.setDown(false);
  for(const c of $('glyphs').children){ c.classList.remove('on'); drawGlyphTo(c.querySelector('canvas'), -1, '#444'); } };
UI.showPause = function(on){ $('pauseWrap').classList.toggle('show', on); if(!on) $('setWrap').classList.remove('show');
  if(on){ const lines = []; if(G.mode === 'campaign') lines.push(G.mission.name + ' · ' + (G.mission.steps[G.step] ? G.mission.steps[G.step].text : '')); else lines.push('Wave ' + G.wave + ' · ' + G.points + ' points');
    lines.push('Marks found: ' + (G.symbolsFound ? G.symbolsFound.size : 0) + ' / 3'); $('pauseInfo').textContent = lines.join('  ·  '); } };
UI.showResult = function(r){
  setTimeout(()=>{ if(G.phase !== 'over') return;
    $('rTitle').textContent = r.title; $('rTitle').className = r.win ? 'win' : 'lose'; $('rSub').textContent = r.sub || '';
    $('rStars').innerHTML = r.stars ? [1,2,3].map(i=>'<span class="' + (i <= r.stars ? 'on' : '') + '">★</span>').join('') : ''; $('rStars').style.display = r.stars ? '' : 'none';
    $('rStats').innerHTML = r.stats.map(([l, v])=>'<div><b>' + esc(v) + '</b><span>' + esc(l) + '</span></div>').join('');
    $('rRewards').textContent = r.rewards || ''; $('rNote').textContent = r.note || ''; $('rNote').classList.toggle('best', !!r.best);
    $('rNext').style.display = r.win && r.next ? '' : 'none'; $('rRetry').textContent = r.win ? 'Replay' : (r.survival ? 'Play again' : 'Retry');
    $('rRetry').classList.toggle('main', !(r.win && r.next));
    $('resWrap').classList.add('show'); UI.setDown(false); if(document.pointerLockElement) document.exitPointerLock(); updateProfile(); }, r.win ? 900 : 1400);
};
let keySeq = [];
UI.openKeypad = function(M){
  C.setUiPause(true); keySeq = []; const all = M.code.concat(M.decoys).slice().sort(()=>Math.random() - 0.5);
  $('keyGrid').innerHTML = all.map(g=>'<button class="kg" data-g="' + g + '"><canvas width="64" height="64"></canvas></button>').join('');
  $('keyGrid').querySelectorAll('.kg').forEach(b=>{ drawGlyphTo(b.querySelector('canvas'), +b.dataset.g, '#7affc8'); b.addEventListener('click', ()=>{ if(keySeq.length >= 3) return; keySeq.push(+b.dataset.g); A.sfx('beep', { f:1000 + keySeq.length*200 }); renderSeq();
    if(keySeq.length === 3){ setTimeout(()=>{ if(MO().tryCode(keySeq)){ UI.closeOverlays(); } else { $('keyMsg').textContent = 'Wrong order. The marks know the way.'; keySeq = []; renderSeq(); } }, 350); } }); });
  $('keyMsg').textContent = G.symbolsFound.size < 3 ? 'You have found ' + G.symbolsFound.size + ' of 3 marks. Each mark has lines under it.' : 'Enter the three marks in the order of their lines.';
  renderSeq(); $('keyWrap').classList.add('show');
};
function renderSeq(){ $('keySeq').innerHTML = [0,1,2].map(i=>'<i>' + (keySeq[i] != null ? '<canvas width="48" height="48"></canvas>' : '') + '</i>').join('');
  $('keySeq').querySelectorAll('canvas').forEach((cv, i)=>drawGlyphTo(cv, keySeq[i], '#fff')); }
UI.showNote = function(text, count){ C.setUiPause(true); $('noteText').textContent = text; $('noteCount').textContent = 'Notes from the Watcher: ' + count + ' / ' + ZD.NOTES.length; $('noteWrap').classList.add('show'); };
UI.closeOverlays = function(){ $('keyWrap').classList.remove('show'); $('noteWrap').classList.remove('show'); C.setUiPause(false); };

// ---- the menu backdrop: the first map, zombies shuffling about -------------------------------------
const menuZ = [];
UI.menuStep = function(dt){
  if(!G.M) return;
  G.menuT += dt; const a = G.menuT*0.04, cam = W.camera, z0 = G.M.zones[G.M.start];
  cam.position.set(z0.cx + Math.sin(a)*26, 26 + Math.sin(G.menuT*0.2)*2, z0.cz + Math.cos(a)*26); cam.lookAt(z0.cx, 0, z0.cz - 8); if(cam.fov !== 55){ cam.fov = 55; cam.updateProjectionMatrix(); }
  W.follow(z0.cx, z0.cz);
  while(menuZ.length < 12){ const r = Math.random(), type = r < 0.15 ? 'runner' : (r < 0.25 ? 'brute' : (r < 0.32 ? 'bloater' : (r < 0.38 ? 'armored' : 'walker')));
    const zone = G.M.zones[(Math.random()*G.M.zones.length)|0]; if(!zone.spots.length || zone.kind === 'secret') continue;
    const s = zone.spots[(Math.random()*zone.spots.length)|0], rig = W.makeZombie(type, ZD.SHIRTS[(Math.random()*7)|0], ZD.PANTS[(Math.random()*4)|0]);
    menuZ.push({ rig, type, zone, x:s.x, z:s.z, yaw:0, state:'chase', moveSpeed:0, flinch:0, atkPose:0, fuse:0, tx:s.x, tz:s.z, sp:ZD.ZOMBIES[type].speed*0.6 }); }
  for(const z of menuZ){ let dx = z.tx - z.x, dz = z.tz - z.z, d = Math.hypot(dx, dz);
    if(d < 0.5){ const s = z.zone.spots[(Math.random()*z.zone.spots.length)|0]; z.tx = s.x; z.tz = s.z; continue; }
    z.x += dx/d*z.sp*dt; z.z += dz/d*z.sp*dt; z.yaw = Math.atan2(-dx, -dz); z.moveSpeed = z.sp;
    z.rig.root.position.set(z.x, 0, z.z); z.rig.root.rotation.y = z.yaw; W.animZombie(z.rig, z, dt); }
};
function clearMenuZombies(){ menuZ.forEach(z=>W.remove(z.rig.root)); menuZ.length = 0; }

// ---- screens ------------------------------------------------------------------------------------------
UI.openMenu = function(){
  C.clearWorld(); if(MO().clearObjectives) MO().clearObjectives(); BOTS.forEach(b=>W.remove(b.rig.root)); BOTS.length = 0;
  if(PL.rig){ W.remove(PL.rig.root); PL.rig = null; }
  if(!G.M || G.M.index !== 0){ C.loadMap(0); }
  W.setEnv(G.M.T.env, 1); W.lightMul(1); W.flashlight(false); A.ambience('menu'); A.rain(0.6); A.music.set(0.15, false);
  G.phase = 'menu'; G.paused = false; G.over = false; G.uiPause = false; G.mode = null;
  $('app').classList.add('menu'); $('app').classList.remove('play');
  OVERLAYS.forEach(id=>$(id).classList.remove('show')); $('menu').classList.add('show');
  S.refreshChallenges(); updateProfile();
  const next = ZD.MISSION_LIST.find(m=>!S.data.missions[m.id]) || ZD.MISSION_LIST[ZD.MISSION_LIST.length - 1];
  $('mPlay').innerHTML = 'PLAY<small>' + esc(ZD.MAPS[next.mapIndex].name) + ' · ' + esc(next.name) + '</small>'; UI._next = next;
  const dDone = S.data.daily.list.filter(c=>c.done).length; $('mChal').innerHTML = 'Challenges' + (dDone < 3 ? '<em>' + (3 - dDone) + '</em>' : '');
  if(document.pointerLockElement) document.exitPointerLock();
  if(typeof window.onGameplayStop === 'function') window.onGameplayStop();
};
function updateProfile(){ const d = S.data; if(!d) return;
  $('pLevel').textContent = d.level; $('pXp').style.width = (S.levelProgress()*100).toFixed(1) + '%'; $('pXpTxt').textContent = d.xp.toLocaleString('en-US') + ' / ' + ZD.xpNeed(d.level).toLocaleString('en-US') + ' XP';
  $('pCredits').textContent = d.credits.toLocaleString('en-US'); $('pStars').textContent = S.totalStars() + ' / ' + ZD.MISSION_LIST.length*3; }
function showOnly(id){ OVERLAYS.forEach(x=>$(x).classList.toggle('show', x === id)); }
const launch = (kind, fn)=>{ A.unlock(); clearMenuZombies(); const go = ()=>fn(); if(window.gameAdBreak) window.gameAdBreak(kind, go); else go(); };
const startMission = (mi, k)=>launch('preroll', ()=>MO().startMission(mi, k));
const startSurvival = mi=>launch('preroll', ()=>MO().startSurvival(mi));
const adThen = fn=>{ A.unlock(); clearMenuZombies(); window.gameAdBreak ? window.gameAdBreak('midgame', fn) : fn(); };

// campaign: maps on the left, missions of the picked map on the right
let campSel = 0;
function renderCampaign(){
  const maps = ZD.MAPS.map((m, i)=>{ const open = S.mapUnlocked(i), stars = m.missions.reduce((a, x)=>a + S.missionStars(x.id), 0);
    return '<button class="mapc' + (i === campSel ? ' sel' : '') + (open ? '' : ' locked') + '" data-i="' + i + '"><span class="mn">' + (i + 1) + '</span><b>' + esc(m.name) + '</b><em>' + (open ? '★ ' + stars + '/' + m.missions.length*3 : 'LOCKED') + '</em></button>'; }).join('');
  $('campMaps').innerHTML = maps;
  const m = ZD.MAPS[campSel], open = S.mapUnlocked(campSel), T = ZD.THEMES[m.theme];
  $('campInfo').innerHTML = '<h3>' + esc(m.name) + '</h3><p class="dim">' + (T.outdoor ? 'Outdoor' : 'Indoor') + ' · boss: ' + esc(ZD.BOSSES[m.boss].name) + ' · secret: ' + (S.data.secrets[m.id] ? esc(WEAP[m.secret].name) : '???') + '</p>' +
    m.missions.map((ms, k)=>{ const ok = S.missionUnlocked(ms), st = S.missionStars(ms.id);
      return '<div class="mis' + (ok ? '' : ' locked') + '"><div><b>' + esc(ms.name) + '</b><span>' + esc(ok ? ms.brief : 'Finish the mission before to unlock') + '</span></div><em>' + [1,2,3].map(i=>'<i class="' + (i <= st ? 'on' : '') + '">★</i>').join('') + '</em>' +
        '<button class="btn small main" data-k="' + k + '"' + (ok ? '' : ' disabled') + '>PLAY</button></div>'; }).join('') +
    (open ? '' : '<p class="dim">Clear the previous map to get here.</p>');
  $('campMaps').querySelectorAll('.mapc').forEach(b=>b.addEventListener('click', ()=>{ campSel = +b.dataset.i; renderCampaign(); }));
  $('campInfo').querySelectorAll('button[data-k]').forEach(b=>b.addEventListener('click', ()=>startMission(campSel, +b.dataset.k)));
}
function renderSurvival(){
  $('survMaps').innerHTML = ZD.MAPS.map((m, i)=>{ const open = S.mapUnlocked(i), best = S.data.records.waves[m.id] || 0;
    return '<button class="smap' + (open ? '' : ' locked') + '" data-i="' + i + '"' + (open ? '' : ' disabled') + '><span class="mn">' + (i + 1) + '</span><b>' + esc(m.name) + '</b><em>' + (open ? (best ? 'Best: wave ' + best : 'Not played') : 'Reach it in the campaign') + '</em></button>'; }).join('');
  $('survMaps').querySelectorAll('.smap').forEach(b=>b.addEventListener('click', ()=>startSurvival(+b.dataset.i)));
}
// armory: buy, upgrade and equip guns and melee
let armSel = 'rifle', armTab = 'guns';
function statBars(id){ const d = WEAP[id], bars = [['Damage', Math.min(1, d.dmg*d.pellets/320)], ['Fire rate', Math.min(1, 0.06/d.rate*1.2)], ['Magazine', Math.min(1, d.mag/100)], ['Range', Math.min(1, d.range/140)]];
  return bars.map(([l, v])=>'<div class="sb"><span>' + l + '</span><i><u style="width:' + (v*100).toFixed(0) + '%"></u></i></div>').join(''); }
function renderArmory(){
  const d = S.data;
  $('armTabs').querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.t === armTab));
  if(armTab === 'guns'){
    const list = ZD.WEAPON_ORDER.filter(id=>!WEAP[id].secret || S.owns('weapons', id) || true);
    $('armList').innerHTML = list.map(id=>{ const w = WEAP[id], own = S.owns('weapons', id), lock = w.secret ? !own : d.level < w.lvl;
      return '<button class="arm' + (id === armSel ? ' sel' : '') + (own ? ' own' : '') + (lock ? ' locked' : '') + '" data-id="' + id + '"><b>' + esc(w.secret && !own ? '???' : w.name) + '</b><span>' + esc(w.cat.toUpperCase()) +
        (d.loadout.primary === id ? ' · PRIMARY' : (d.loadout.secondary === id ? ' · SECONDARY' : '')) + '</span></button>'; }).join('');
    const w = WEAP[armSel], own = S.owns('weapons', armSel);
    let h = '<h3>' + esc(w.secret && !own ? 'Secret weapon' : w.name) + '</h3><p class="dim">' + esc(w.secret && !own ? 'Hidden in a secret room. Find the three marks and the sealed door.' : w.desc) + (w.element ? ' · ' + ZD.ELEMENTS[w.element].name : '') + '</p>' + statBars(armSel);
    if(own){
      h += '<div class="ups">' + Object.keys(ZD.UPGRADES).map(k=>{ const u = ZD.UPGRADES[k], lv = S.upgradeLevel(armSel, k), max = lv >= u.max, cost = max ? 0 : ZD.upgradeCost(armSel, k, lv);
        return '<div class="up"><span>' + u.name + '<small>' + u.label + '</small></span><i>' + Array.from({ length:u.max }, (_, i)=>'<b class="' + (i < lv ? 'on' : '') + '"></b>').join('') + '</i>' +
          '<button class="btn small" data-up="' + k + '"' + (max || d.credits < cost ? ' disabled' : '') + '>' + (max ? 'MAX' : cost) + '</button></div>'; }).join('') + '</div>';
      h += '<div class="row2"><button class="btn small" data-eq="primary"' + (d.loadout.primary === armSel ? ' disabled' : '') + '>Equip primary</button><button class="btn small" data-eq="secondary"' + (d.loadout.secondary === armSel ? ' disabled' : '') + '>Equip secondary</button></div>';
    } else if(!w.secret){ const lock = d.level < w.lvl;
      h += '<button class="btn main" data-buy="1"' + (lock || d.credits < w.cost ? ' disabled' : '') + '>' + (lock ? 'UNLOCKS AT LEVEL ' + w.lvl : 'BUY · ' + w.cost) + '</button>'; }
    $('armInfo').innerHTML = h;
  } else {
    $('armList').innerHTML = ZD.MELEE_ORDER.map(id=>{ const m = ZD.MELEE[id], own = S.owns('melee', id);
      return '<button class="arm' + (id === armSel ? ' sel' : '') + (own ? ' own' : '') + (d.level < m.lvl ? ' locked' : '') + '" data-id="' + id + '"><b>' + esc(m.name) + '</b><span>' + (d.loadout.melee === id ? 'EQUIPPED' : 'MELEE') + '</span></button>'; }).join('');
    const m = ZD.MELEE[armSel] || ZD.MELEE.knife, own = S.owns('melee', armSel);
    let h = '<h3>' + esc(m.name) + '</h3><div class="sb"><span>Damage</span><i><u style="width:' + (m.dmg/420*100).toFixed(0) + '%"></u></i></div><div class="sb"><span>Reach</span><i><u style="width:' + (m.range/2.5*100).toFixed(0) + '%"></u></i></div><div class="sb"><span>Speed</span><i><u style="width:' + (0.4/m.cool*100).toFixed(0) + '%"></u></i></div>';
    if(own) h += '<button class="btn main" data-eqm="1"' + (d.loadout.melee === armSel ? ' disabled' : '') + '>' + (d.loadout.melee === armSel ? 'EQUIPPED' : 'EQUIP') + '</button>';
    else h += '<button class="btn main" data-buy="1"' + (d.level < m.lvl || d.credits < m.cost ? ' disabled' : '') + '>' + (d.level < m.lvl ? 'UNLOCKS AT LEVEL ' + m.lvl : 'BUY · ' + m.cost) + '</button>';
    $('armInfo').innerHTML = h;
  }
  $('armList').querySelectorAll('.arm').forEach(b=>b.addEventListener('click', ()=>{ armSel = b.dataset.id; renderArmory(); }));
  const info = $('armInfo');
  info.querySelectorAll('[data-up]').forEach(b=>b.addEventListener('click', ()=>{ if(S.upgrade(armSel, b.dataset.up) === 'ok') A.sfx('buy'); renderArmory(); updateProfile(); }));
  info.querySelectorAll('[data-eq]').forEach(b=>b.addEventListener('click', ()=>{ const slot = b.dataset.eq, other = slot === 'primary' ? 'secondary' : 'primary';
    if(S.data.loadout[other] === armSel) S.equip(other, S.data.loadout[slot]); S.equip(slot, armSel); A.sfx('swap'); renderArmory(); }));
  info.querySelectorAll('[data-eqm]').forEach(b=>b.addEventListener('click', ()=>{ S.equip('melee', armSel); A.sfx('swap'); renderArmory(); }));
  info.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click', ()=>{ const r = S.buy(armTab === 'guns' ? 'weapons' : 'melee', armSel); if(r === 'ok') A.sfx('jackpot'); else A.sfx('deny'); renderArmory(); updateProfile(); }));
  $('armCredits').textContent = d.credits.toLocaleString('en-US') + ' credits';
}
// squad: pick the hero, unlock characters and outfits
let sqSel = 'max';
function renderSquadScreen(){
  const d = S.data;
  $('sqList').innerHTML = ZD.CHAR_ORDER.map(id=>{ const c = ZD.CHARS[id], own = S.owns('chars', id);
    return '<button class="chr' + (id === sqSel ? ' sel' : '') + (own ? '' : ' locked') + '" data-id="' + id + '" style="--c:' + c.css + '"><b>' + c.name + '</b><span>' + c.role + (d.loadout.char === id ? ' · YOU' : '') + '</span></button>'; }).join('');
  const c = ZD.CHARS[sqSel], own = S.owns('chars', sqSel);
  let h = '<h3 style="color:' + c.css + '">' + c.name + ' <small>' + c.role + '</small></h3><p><b>' + esc(c.ult) + '</b> · ' + esc(c.ultDesc) + '</p><p class="dim">Health ' + c.hp + ' · as a squadmate uses the ' + esc(WEAP[c.weapon].name) + (c.medic ? ' · revives faster' : '') + '</p>';
  if(own) h += '<button class="btn main" data-pick="1"' + (d.loadout.char === sqSel ? ' disabled' : '') + '>' + (d.loadout.char === sqSel ? 'PLAYING AS ' + c.name : 'PLAY AS ' + c.name) + '</button>';
  else h += '<button class="btn main" data-buyc="1"' + (d.level < c.lvl || d.credits < c.cost ? ' disabled' : '') + '>' + (d.level < c.lvl ? 'UNLOCKS AT LEVEL ' + c.lvl : 'UNLOCK · ' + c.cost) + '</button>';
  h += '<h4>OUTFITS</h4><div class="outfits">' + ZD.OUTFIT_ORDER.map(o=>{ const of = ZD.OUTFITS[o], has = S.owns('outfits', o), on = S.outfitOf(sqSel) === o;
    return '<button class="of' + (on ? ' on' : '') + (has ? '' : ' locked') + '" data-o="' + o + '"><i style="background:' + '#' + of.shirt.toString(16).padStart(6, '0') + '"></i><b>' + of.name + '</b><span>' + (has ? (on ? 'WORN' : 'WEAR') : (of.ach ? 'ACHIEVEMENT' : of.cost)) + '</span></button>'; }).join('') + '</div>';
  $('sqInfo').innerHTML = h;
  $('sqList').querySelectorAll('.chr').forEach(b=>b.addEventListener('click', ()=>{ sqSel = b.dataset.id; renderSquadScreen(); }));
  const info = $('sqInfo');
  info.querySelectorAll('[data-pick]').forEach(b=>b.addEventListener('click', ()=>{ S.equip('char', sqSel); A.sfx('swap'); renderSquadScreen(); }));
  info.querySelectorAll('[data-buyc]').forEach(b=>b.addEventListener('click', ()=>{ if(S.buy('chars', sqSel) === 'ok') A.sfx('jackpot'); else A.sfx('deny'); renderSquadScreen(); updateProfile(); }));
  info.querySelectorAll('[data-o]').forEach(b=>b.addEventListener('click', ()=>{ const o = b.dataset.o;
    if(!S.owns('outfits', o)){ if(S.buy('outfits', o) !== 'ok'){ A.sfx('deny'); UI.toast(ZD.OUTFITS[o].ach ? 'Comes from an achievement' : 'Not enough credits'); return; } A.sfx('jackpot'); }
    S.data.loadout.outfits[sqSel] = o; S.persist(); renderSquadScreen(); updateProfile(); }));
  $('sqCredits').textContent = d.credits.toLocaleString('en-US') + ' credits';
}
let chalTab = 'daily';
function renderChallenges(){
  S.refreshChallenges(); const d = S.data;
  $('chalTabs').querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.t === chalTab));
  if(chalTab === 'achievements'){ const n = ZD.ACHIEVEMENTS.filter(a=>d.ach[a.id]).length;
    $('chalBody').innerHTML = '<p class="dim">' + n + ' of ' + ZD.ACHIEVEMENTS.length + ' unlocked</p><div class="achs">' + ZD.ACHIEVEMENTS.map(a=>{ const got = !!d.ach[a.id], v = Math.min(a.n, d.stats[a.stat] || 0);
      return '<div class="ach' + (got ? ' got' : '') + '"><b>' + esc(a.name) + '</b><span>' + esc(a.desc) + '</span><i><u style="width:' + (v/a.n*100).toFixed(0) + '%"></u></i><em>' + (got ? '✓' : v.toLocaleString('en-US') + '/' + a.n.toLocaleString('en-US')) + ' · ' + a.credits + '</em></div>'; }).join('') + '</div>'; }
  else { const box = chalTab === 'daily' ? d.daily : d.weekly, left = chalTab === 'daily' ? S.timeToReset() : null;
    $('chalBody').innerHTML = (left ? '<p class="dim">New daily missions in ' + Math.floor(left/3600000) + 'h ' + Math.floor(left/60000) % 60 + 'm</p>' : '<p class="dim">Weekly missions change every Monday</p>') +
      box.list.map(c=>'<div class="ch' + (c.done ? ' done' : '') + '"><b>' + esc(c.text) + '</b><i><u style="width:' + (Math.min(1, c.prog/c.n)*100).toFixed(0) + '%"></u></i><em>' + (c.done ? 'DONE' : c.prog.toLocaleString('en-US') + ' / ' + c.n.toLocaleString('en-US')) + ' · ' + c.reward + ' credits</em></div>').join(''); }
}
function renderRecords(){
  const r = S.data.records, st = S.data.stats;
  let h = '<h4>BEST WAVE PER MAP</h4><div class="recs">' + ZD.MAPS.map(m=>'<div><span>' + esc(m.name) + '</span><b>' + (r.waves[m.id] || '-') + '</b></div>').join('') + '</div>';
  h += '<h4>TOP RUNS</h4>' + (r.runs.length ? '<div class="runs">' + r.runs.map((x, i)=>'<div><span>' + (i + 1) + '. ' + esc((ZD.MAPS.find(m=>m.id === x.map) || {}).name || x.map) + ' · ' + esc(ZD.CHARS[x.char] ? ZD.CHARS[x.char].name : '') + '</span><b>Wave ' + x.wave + ' · ' + x.kills + ' kills</b></div>').join('') + '</div>' : '<p class="dim">No Survival runs yet.</p>');
  h += '<h4>FASTEST BOSS KILLS</h4><div class="recs">' + Object.keys(ZD.BOSSES).map(id=>'<div><span>' + esc(ZD.BOSSES[id].name) + '</span><b>' + (r.bossTimes[id] ? fmtTime(r.bossTimes[id]) : '-') + '</b></div>').join('') + '</div>';
  h += '<h4>TOTALS</h4><div class="recs">' + [['Zombies killed', st.kills], ['Headshot kills', st.heads], ['Bosses defeated', st.bossKills], ['Missions done', st.missions], ['Teammates revived', st.revives], ['Secret rooms', st.secrets], ['Most kills in one run', r.mostKills]]
    .map(([l, v])=>'<div><span>' + l + '</span><b>' + (v || 0).toLocaleString('en-US') + '</b></div>').join('') + '</div>';
  $('recBody').innerHTML = h;
}
function syncSettings(){
  const st = S.data.settings;
  $('sSens').value = st.sens; $('sSensVal').textContent = (+st.sens).toFixed(1);
  $('sVol').value = st.vol; $('sVolVal').textContent = Math.round(st.vol*100) + '%';
  $('sInvert').textContent = st.invert ? 'On' : 'Off'; $('sMusic').textContent = st.music ? 'On' : 'Off';
  $('sQuality').textContent = { auto:'Auto', high:'High', medium:'Medium', low:'Low' }[st.quality];
  $('sAssist').textContent = st.assist ? 'On' : 'Off';
  $('sControls').textContent = C.buttonsMode() ? 'Buttons' : 'Mouse aim'; $('setCtl').style.display = C.TOUCH ? 'none' : '';
}
function applyQuality(){ const q = S.data.settings.quality === 'auto' ? (C.TOUCH ? 'medium' : 'high') : S.data.settings.quality; W.setQuality(q); W.lowFx = q === 'low'; }

UI.init = function(){
  S.listeners.push(notify);
  // glyph slots on the HUD
  $('glyphs').innerHTML = [0,1,2].map(()=>'<i><canvas width="40" height="40"></canvas></i>').join('');
  const on = (id, f)=>$(id).addEventListener('click', e=>{ A.unlock(); f(e); });
  on('mPlay', ()=>{ const n = UI._next; startMission(n.mapIndex, n.index); });
  on('mCamp', ()=>{ campSel = Math.max(0, ZD.MAPS.findIndex((m, i)=>S.mapUnlocked(i) && m.missions.some(x=>!S.data.missions[x.id]))); if(campSel < 0) campSel = 0; renderCampaign(); showOnly('campWrap'); });
  on('mSurv', ()=>{ renderSurvival(); showOnly('survWrap'); });
  on('mArm', ()=>{ armTab = 'guns'; armSel = S.data.loadout.primary; renderArmory(); showOnly('armWrap'); });
  on('mSquad', ()=>{ sqSel = S.data.loadout.char; renderSquadScreen(); showOnly('squadWrap'); });
  on('mChal', ()=>{ chalTab = 'daily'; renderChallenges(); showOnly('chalWrap'); });
  on('mRec', ()=>{ renderRecords(); showOnly('recWrap'); });
  on('mHow', ()=>showOnly('howWrap')); on('mSettings', ()=>{ syncSettings(); showOnly('setWrap'); });
  document.querySelectorAll('.back').forEach(b=>b.addEventListener('click', ()=>{ if(G.phase === 'play' && b.closest('#setWrap')){ $('setWrap').classList.remove('show'); return; } showOnly('menu'); updateProfile(); }));
  $('armTabs').querySelectorAll('button').forEach(b=>b.addEventListener('click', ()=>{ armTab = b.dataset.t; armSel = armTab === 'guns' ? S.data.loadout.primary : S.data.loadout.melee; renderArmory(); }));
  $('chalTabs').querySelectorAll('button').forEach(b=>b.addEventListener('click', ()=>{ chalTab = b.dataset.t; renderChallenges(); }));
  // settings
  const st = ()=>S.data.settings;
  $('sSens').addEventListener('input', e=>{ st().sens = +e.target.value; $('sSensVal').textContent = st().sens.toFixed(1); S.persist(); });
  $('sVol').addEventListener('input', e=>{ st().vol = +e.target.value; A.setVolume(st().vol); $('sVolVal').textContent = Math.round(st().vol*100) + '%'; S.persist(); });
  on('sInvert', ()=>{ st().invert = !st().invert; S.persist(); syncSettings(); });
  on('sMusic', ()=>{ st().music = !st().music; A.setMusic(st().music); S.persist(); syncSettings(); });
  on('sAssist', ()=>{ st().assist = !st().assist; S.persist(); syncSettings(); });
  on('sControls', ()=>{ st().controls = st().controls === 'buttons' ? 'mouse' : 'buttons'; S.persist(); syncSettings(); C.applyControls(); });
  on('sQuality', ()=>{ const order = ['auto','high','medium','low']; st().quality = order[(order.indexOf(st().quality) + 1) % order.length]; S.persist(); syncSettings(); applyQuality(); });
  // pause and results
  on('pResume', ()=>C.setPaused(false));
  on('pSettings', ()=>{ syncSettings(); $('setWrap').classList.add('show'); });
  on('pQuit', ()=>{ G.paused = false; $('pauseWrap').classList.remove('show'); if(G.mode === 'survival' && !G.over){ G.over = true; G.phase = 'over'; } adThen(UI.openMenu); });
  on('rNext', ()=>{ const k = ZD.MISSION_LIST.indexOf(G.mission), n = ZD.MISSION_LIST[k + 1]; adThen(()=>MO().startMission(n.mapIndex, n.index)); });
  on('rRetry', ()=>{ const mi = G.mapIndex; if(G.mode === 'survival') adThen(()=>MO().startSurvival(mi)); else { const ms = G.mission; adThen(()=>MO().startMission(ms.mapIndex, ms.index)); } });
  on('rMenu', ()=>adThen(UI.openMenu));
  on('keyClose', ()=>UI.closeOverlays()); on('keyClear', ()=>{ keySeq = []; renderSeq(); });
  on('noteClose', ()=>UI.closeOverlays());
  on('bReady', ()=>MO().skipBreak());
  $('howText').innerHTML =
    '<p><b>Your squad.</b> Three AI teammates fight next to you. They pick up mission items, help at objectives, use their own abilities and run over to pull you up when you go down.</p>' +
    '<p><b>Campaign.</b> 27 missions on 13 maps: fuel generators, find fuses, follow radio signals, scan intel, rescue survivors, burn nests, chase bosses and get out alive. New areas unlock as the mission goes on.</p>' +
    '<p><b>Survival.</b> Endless waves. Kill zombies for points, buy doors to open the map, guns from the walls, perks (once the power is on), the mystery box and the upgrade station. Every 5th wave brings a Brute Captain, every 10th a boss.</p>' +
    '<p><b>Buttons.</b> The stick walks you; left or right turns. Drag the screen to look. Hold FIRE to shoot. ULT fires your character\'s ability when it is charged. USE opens, buys and revives.</p>' +
    '<p><b>Keyboard.</b> W/S walk · A/D or ←/→ turn · Shift sprint · Space fire · G grenade · R reload · Q swap · V knife · E use · X ability · Enter skip the wave break · P pause. Prefer a locked mouse? Pick “Mouse aim” in Settings.</p>' +
    '<p class="tip">Every map hides three glowing marks with lines under them. Find them, then enter them in order at the sealed keypad. What waits behind the door is worth it. The altar is not.</p>';
  syncSettings(); UI.openMenu();
};

})(window.ZD);

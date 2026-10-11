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
  W.post.hurt = PL.down ? 1 : clamp(1 - PL.hp/PL.maxHp*2.2, 0, 1);
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
UI.hideScreens = function(){ W.post.dof = 0; OVERLAYS.forEach(id=>$(id).classList.remove('show')); $('app').classList.remove('menu'); $('app').classList.add('play'); UI.bossBar(null); UI.setDown(false);
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
    reward.credits = r.credits || 0; reward.used = false; reward.rewardsText = r.rewards || ''; syncRewarded();
    $('rNext').style.display = r.win && r.next ? '' : 'none'; $('rRetry').textContent = r.win ? 'Replay' : (r.survival ? 'Play again' : 'Retry');
    $('rRetry').classList.toggle('main', !(r.win && r.next));
    $('resWrap').classList.add('show'); UI.setDown(false); if(document.pointerLockElement) document.exitPointerLock(); updateProfile(); }, r.win ? 900 : 1400);
};
// ---- rewarded videos: only offered when the portal has one loaded, paid only for a full watch ------
const reward = { credits:0, used:false, rewardsText:'', freeAt:0 };
const FREE_CREDITS = 300, FREE_COOLDOWN = 180000;
function rewardedReady(){ return typeof window.gameRewardedReady === 'function' && window.gameRewardedReady(); }
function syncRewarded(){
  const ready = rewardedReady();
  $('rDouble').style.display = ready && reward.credits > 0 && !reward.used ? '' : 'none';
  $('rDouble').innerHTML = '<span class="tv"></span>DOUBLE CREDITS<small>watch a short video · +' + reward.credits.toLocaleString('en-US') + ' credits</small>';
  $('mFree').style.display = ready && Date.now() >= reward.freeAt ? '' : 'none';
}
function watchFor(onPaid){
  if(!rewardedReady()) return;
  window.gameShowRewarded(ok=>{ if(ok) onPaid(); else UI.toast('The video did not finish, so there is no reward this time', 3200); syncRewarded(); });
}
UI.syncRewarded = syncRewarded;

// ---- sound on / off, on every screen and the M key -------------------------------------------------
function syncMute(){ const m = !!S.data.settings.mute; document.querySelectorAll('.sndBtn').forEach(b=>{ b.classList.toggle('off', m); b.setAttribute('aria-label', m ? 'Sound off' : 'Sound on'); b.title = m ? 'Sound off (M)' : 'Sound on (M)'; }); }
UI.toggleMute = function(){ A.unlock(); A.setUserMute(!S.data.settings.mute); S.persist(); syncMute(); };

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

// ---- the menu backdrop: the squad holds a street at dusk while the dead come out of the rain ---------
// Visual only: no damage, no sound. UI.showcase(layout) also frames the shots for the store art.
const SC = { squad:[], zs:[], t:0, layout:'menu', S:null, f:null, r:null, b:null, ready:false };
// try each way across the start zone and keep one where nothing stands between the lens, the squad and the street
const SLOTS = { menu:[[0.6, 0], [-1.1, 1.3], [2.3, -0.7], [1.5, 1.7]], poster:[[0, -1.1], [-1.9, 0.2], [1.9, 0.3], [0.95, 1.5]] };
function scCam(layout, S0, f, r){ const menu = layout === 'menu'; return { x:S0.x - f.x*(menu ? 5.6 : 6.6) + r.x*(menu ? 2.2 : 0.8), z:S0.z - f.z*(menu ? 5.6 : 6.6) + r.z*(menu ? 2.2 : 0.8) }; }
function scBuild(){
  const M = G.M, z0 = M.zones[M.start], ib = M.inner(z0), menu = SC.layout === 'menu';
  const cx = (ib.x0 + ib.x1)/2, cz = (ib.z0 + ib.z1)/2, half = Math.min(ib.x1 - ib.x0, ib.z1 - ib.z0)/2;
  const inside = p=>p.x > ib.x0 + 0.6 && p.x < ib.x1 - 0.6 && p.z > ib.z0 + 0.6 && p.z < ib.z1 - 0.6;
  const free = p=>{ const q = { x:p.x, z:p.z }; C.pushOut(q, 0.55); return Math.hypot(q.x - p.x, q.z - p.z) < 0.02; };
  let best = null;
  for(const [fx, fz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) for(const back of (menu ? [half - 8, half - 6.5, half - 9.5, half - 5] : [-1, 1, -3, 3])) for(const lat of [0, -3, 3]){
    const f = { x:fx, z:fz }, r = { x:-fz, z:fx }, S0 = { x:cx - fx*back + r.x*lat, z:cz - fz*back + r.z*lat }, cam = scCam(SC.layout, S0, f, r);
    if(!inside(cam) || !inside(S0)) continue;
    const far = fx > 0 ? ib.x1 - S0.x : fx < 0 ? S0.x - ib.x0 : fz > 0 ? ib.z1 - S0.z : S0.z - ib.z0;
    const roomy = (()=>{ let n = 0; for(const rr of [2, 3, 4.2]){ const q = { x:cam.x, z:cam.z }; C.pushOut(q, rr); if(Math.hypot(q.x - cam.x, q.z - cam.z) < 0.02) n++; } return n; })();
    let score = far + (C.segClear(cam.x, cam.z, S0.x, S0.z, 0.7, true) ? 40 : 0) + (C.segClear(S0.x, S0.z, S0.x + fx*far*0.8, S0.z + fz*far*0.8, 1.2, true) ? 12 : 0) + roomy*9 - Math.abs(lat)*0.5;
    score += SLOTS[menu ? 'menu' : 'poster'].filter(sl=>free({ x:S0.x + r.x*sl[0] + f.x*sl[1], z:S0.z + r.z*sl[0] + f.z*sl[1] })).length*6;
    if(!best || score > best.score) best = { score, f, r, S0, far }; }
  if(!best) best = { f:{ x:0, z:-1 }, r:{ x:1, z:0 }, S0:{ x:cx, z:cz }, far:half };        // a cramped zone: stand in the middle
  SC.S = best.S0; SC.f = best.f; SC.r = best.r; SC.half = half; SC.far = best.far;
  const lo = S.data.loadout, ids = [lo.char].concat(ZD.CHAR_ORDER.filter(c=>c !== lo.char && S.owns('chars', c)).slice(0, 3));
  const slots = SLOTS[menu ? 'menu' : 'poster'];
  ids.forEach((id, i)=>{ const def = ZD.CHARS[id], rig = W.makeSoldier(id, S.outfitOf(id), { weapon:i === 0 ? lo.primary : def.weapon });
    const p = { x:SC.S.x + SC.r.x*slots[i][0] + SC.f.x*slots[i][1], z:SC.S.z + SC.r.z*slots[i][0] + SC.f.z*slots[i][1] }; C.pushOut(p, 0.5);
    SC.squad.push({ rig, x:p.x, z:p.z, yaw:Math.atan2(-SC.f.x, -SC.f.z) + (i - 1.5)*0.12, aimYaw:0, fireT:0.6 + i*0.4, recoil:0, pitch:-0.02, pose:[0.55, 1.0, -0.95, -0.6][i] }); });
  W.flashlight(!menu, 0.6);
  // the poster gets a burning flare behind the squad: orange backlight against the blue night
  if(!menu){ const T = THREE, fx = { x:SC.S.x + SC.f.x*7 - SC.r.x*3.2, z:SC.S.z + SC.f.z*7 - SC.r.z*3.2 };
    const light = new T.PointLight(0xff6a24, 1.6, 14, 1.8); light.position.set(fx.x, 1.4, fx.z); W.scene.add(light);
    const glow = W.helpers.glowSprite(0xff7a2a, 3, 0.7); glow.position.set(fx.x, 0.6, fx.z); W.scene.add(glow);
    SC.flare = { light, glow, x:fx.x, z:fx.z }; }
  SC.ready = true;
}
function scSpawn(z){
  const far = SC.layout === 'menu' ? SC.far - 2 - Math.random()*Math.min(6, SC.far*0.4) : 4.5 + Math.random()*Math.max(1, SC.far - 7), side = (Math.random() - 0.5)*SC.half*(SC.layout === 'menu' ? 1.5 : 1.1);
  z.x = SC.S.x + SC.f.x*far + SC.r.x*side; z.z = SC.S.z + SC.f.z*far + SC.r.z*side; const p = { x:z.x, z:z.z }; C.pushOut(p, 0.5); z.x = p.x; z.z = p.z;
  z.lane = SC.layout === 'menu' ? 0 : (Math.random() < 0.5 ? -1 : 1)*(1.4 + Math.random()*3.8); z.depth = Math.random()*2.6;
  z.state = 'chase'; z.hp = 2 + (Math.random()*3|0); z.deadT = 0; z.rig.root.position.y = 0; z.rig.body.rotation.x = 0; z.rig.body.rotation.z = 0; z.rig.body.position.y = 0; z.rig.landed = false; z.rig.twist = null; z.rig.root.visible = true;
}
function scZombie(){
  const r = Math.random(), type = r < 0.14 ? 'runner' : (r < 0.24 ? 'brute' : (r < 0.3 ? 'bloater' : (r < 0.36 ? 'armored' : 'walker')));
  const rig = W.makeZombie(type, ZD.SHIRTS[(Math.random()*7)|0], ZD.PANTS[(Math.random()*4)|0]);
  const z = { rig, type, x:0, z:0, yaw:0, state:'chase', moveSpeed:0, flinch:0, atkPose:0, fuse:0, sp:ZD.ZOMBIES[type].speed*0.45, hp:3, deadT:0, fallDir:1 };
  scSpawn(z); z.x += (Math.random() - 0.5)*4; SC.zs.push(z); return z;
}
UI.menuStep = function(dt){
  if(!G.M) return;
  if(!SC.ready) scBuild();
  G.menuT += dt; SC.t += dt;
  while(SC.zs.length < (SC.layout === 'menu' ? 9 : 14)) scZombie();
  // zombies shamble at the squad; those that get close fall back into the dark
  for(const z of SC.zs){
    if(z.state === 'dead'){ z.deadT += dt; if(z.deadT > 3.2) scSpawn(z); W.animZombie(z.rig, z, dt); continue; }
    const near = SC.layout === 'menu' ? 3 : 1.6 + z.depth, tx = SC.S.x + SC.f.x*near + SC.r.x*z.lane, tz = SC.S.z + SC.f.z*near + SC.r.z*z.lane; let dx = tx - z.x, dz = tz - z.z; const d = Math.hypot(dx, dz) || 1;
    if(d < 4 && SC.layout === 'menu'){ scSpawn(z); continue; }
    const step = SC.layout === 'menu' || d > 0.4 ? z.sp*dt : 0;       // on the poster the horde lines up right behind the squad
    z.x += dx/d*step; z.z += dz/d*step; const p = { x:z.x, z:z.z }; C.pushOut(p, 0.45); z.x = p.x; z.z = p.z;
    z.yaw = Math.atan2(-dx, -dz); z.moveSpeed = step > 0 ? z.sp : 0; z.flinch = Math.max(0, z.flinch - dt);
    z.rig.root.position.set(z.x, 0, z.z); z.rig.root.rotation.y = z.yaw; W.animZombie(z.rig, z, dt); }
  // the squad picks targets and fires: flashes, tracers and goo, nothing else
  for(const m of SC.squad){
    const live = SC.zs.filter(z=>z.state !== 'dead' && Math.hypot(z.x - m.x, z.z - m.z) < SC.half*1.6);
    let tg = null, bd = 1e9; for(const z of live){ const d = Math.hypot(z.x - m.x, z.z - m.z); if(d < bd){ bd = d; tg = z; } }
    const poster = SC.layout !== 'menu';
    const want = poster ? Math.atan2(SC.f.x, SC.f.z) + m.pose : (tg ? Math.atan2(-(tg.x - m.x), -(tg.z - m.z)) : m.yaw);
    m.aimYaw += C.wrap(want - (m.yaw + m.aimYaw))*(poster ? 1 : Math.min(1, dt*3));
    m.rig.root.position.set(m.x, 0, m.z); m.rig.root.rotation.y = m.yaw + m.aimYaw;
    m.fireT -= dt; m.recoil = Math.max(0, m.recoil - dt);
    if(tg && m.fireT <= 0 && !poster){
      m.fireT = 0.35 + Math.random()*1.1; m.recoil = 0.07; m.rig.root.updateMatrixWorld(true);
      const mv = m.rig.muzzle.getWorldPosition(new THREE.Vector3());
      W.muzzleFlash(mv, new THREE.Vector3(tg.x - mv.x, 1.3 - mv.y, tg.z - mv.z).normalize(), 0.8);
      W.tracer(mv.x, mv.y, mv.z, tg.x, 1.3, tg.z); W.goo(tg.x, 1.35, tg.z, (tg.x - m.x)/bd, 0.2, (tg.z - m.z)/bd, 6, false); tg.flinch = 0.25;
      if(--tg.hp <= 0){ tg.state = 'dead'; tg.deadT = 0; tg.fallDir = Math.random() < 0.8 ? 1 : -1; } }
    W.animSoldier(m.rig, { moving:false, sprint:false, back:false, pitch:poster ? -0.12 : m.pitch, ads:!poster, reload:0, swap:0, melee:0, recoil:m.recoil, down:false }, dt); }
  // depth of field: the squad sharp, the street behind them soft
  W.post.dof = SC.layout === 'menu' ? 1 : 0.75; W.post.focus = Math.hypot(W.camera.position.x - SC.S.x, W.camera.position.z - SC.S.z) + (SC.layout === 'menu' ? 0.5 : 0);
  if(SC.flare){ const fl = SC.flare; fl.light.intensity = 1.6 + Math.sin(SC.t*23)*0.2 + Math.sin(SC.t*7)*0.15; W.burn(fl.x, 0.15, fl.z); if(Math.random() < 0.5) W.smoke(fl.x, 1.4, fl.z); }
  scCamera(dt);
};
// framing: 'menu' looks over the squad's shoulders at the street and keeps the left side free for the
// buttons; 'poster' turns the squad to the lens with the horde behind them (store art)
function scCamera(){
  const cam = W.camera, S0 = SC.S, f = SC.f, r = SC.r, a = SC.t*0.05, L = SC.layout, aspect = cam.aspect || 1.6, c = scCam(L, S0, f, r);
  let h, lf, lr, ly, fov, sway = Math.sin(a)*0.5;
  if(L === 'menu'){ const narrow = aspect < 1.3; h = 2.3 + Math.sin(SC.t*0.3)*0.08; lf = 8; lr = narrow ? 0.4 : -2.4; ly = 1.15; fov = narrow ? 60 : 50; }
  else { const wide = aspect > 2; h = 1.0; lf = 2.4; lr = wide ? 2.6 : 0.8; ly = 1.6; fov = wide ? 44 : (aspect < 1.1 ? 58 : 50); sway = 0; }
  const o = SC.opt || {}; if(o.fov) fov = o.fov; if(o.ly != null) ly = o.ly; if(o.lr != null) lr = o.lr; if(o.h != null) h = o.h;
  if(o.back){ c.x -= f.x*o.back; c.z -= f.z*o.back; } if(o.side){ c.x += r.x*o.side; c.z += r.z*o.side; }
  cam.position.set(c.x + r.x*sway, h, c.z + r.z*sway);
  cam.lookAt(S0.x + f.x*lf + r.x*lr, ly, S0.z + f.z*lf + r.z*lr);
  if(cam.fov !== fov){ cam.fov = fov; cam.updateProjectionMatrix(); }
  W.follow(S0.x, S0.z);
}
// store art: UI.showcase('poster', { fov, ly, lr, h, back, side }) frames the squad for a thumbnail
UI.showcase = function(layout, opt){ clearMenuZombies(); SC.layout = layout || 'menu'; SC.opt = opt || null; };
function clearMenuZombies(){ SC.zs.forEach(z=>W.remove(z.rig.root)); SC.squad.forEach(m=>W.remove(m.rig.root)); SC.zs.length = 0; SC.squad.length = 0; SC.ready = false;
  if(SC.flare){ W.remove(SC.flare.light); W.remove(SC.flare.glow); SC.flare = null; } }

// ---- screens ------------------------------------------------------------------------------------------
UI.openMenu = function(){
  C.clearWorld(); if(MO().clearObjectives) MO().clearObjectives(); BOTS.forEach(b=>W.remove(b.rig.root)); BOTS.length = 0;
  if(PL.rig){ W.remove(PL.rig.root); PL.rig = null; }
  clearMenuZombies();
  if(!G.M || G.M.index !== 0){ C.loadMap(0); }
  W.setEnv(G.M.T.env, 1); W.lightMul(1); W.flashlight(false); A.ambience('menu'); A.rain(0.6); A.music.set(0.15, false);
  G.phase = 'menu'; G.paused = false; G.over = false; G.uiPause = false; G.mode = null; W.post.hurt = 0;
  $('app').classList.add('menu'); $('app').classList.remove('play');
  OVERLAYS.forEach(id=>$(id).classList.remove('show')); $('menu').classList.add('show');
  S.refreshChallenges(); updateProfile(); syncRewarded();
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
  on('rDouble', ()=>watchFor(()=>{ if(reward.used) return; reward.used = true; S.addCredits(reward.credits); A.sfx('jackpot');
    $('rRewards').textContent = reward.rewardsText + '  ·  +' + reward.credits.toLocaleString('en-US') + ' bonus credits'; UI.toast('Credits doubled!'); updateProfile(); }));
  on('mFree', ()=>watchFor(()=>{ S.addCredits(FREE_CREDITS); reward.freeAt = Date.now() + FREE_COOLDOWN; A.sfx('jackpot'); UI.toast('+' + FREE_CREDITS + ' credits'); updateProfile();
    setTimeout(syncRewarded, FREE_COOLDOWN + 500); }));
  document.querySelectorAll('.sndBtn').forEach(b=>b.addEventListener('click', e=>{ e.stopPropagation(); UI.toggleMute(); }));
  if(window.GDBridge) window.GDBridge.onChange(syncRewarded);
  syncMute(); syncRewarded();
  if(C.TOUCH) document.querySelector('.mfoot').textContent = 'Stick to move · drag to aim · hold FIRE to shoot';
  on('keyClose', ()=>UI.closeOverlays()); on('keyClear', ()=>{ keySeq = []; renderSeq(); });
  on('noteClose', ()=>UI.closeOverlays());
  on('bReady', ()=>MO().skipBreak());
  $('howText').innerHTML =
    '<p><b>Your squad.</b> Three AI teammates fight next to you. They pick up mission items, help at objectives, use their own abilities and run over to pull you up when you go down.</p>' +
    '<p><b>Campaign.</b> 27 missions on 13 maps: fuel generators, find fuses, follow radio signals, scan intel, rescue survivors, burn nests, chase bosses and get out alive. New areas unlock as the mission goes on.</p>' +
    '<p><b>Survival.</b> Endless waves. Kill zombies for points, buy doors to open the map, guns from the walls, perks (once the power is on), the mystery box and the upgrade station. Every 5th wave brings a Brute Captain, every 10th a boss.</p>' +
    '<p><b>Buttons.</b> The stick walks you; left or right turns. Drag the screen to look. Hold FIRE to shoot. ULT fires your character\'s ability when it is charged. USE opens, buys and revives.</p>' +
    '<p><b>Keyboard.</b> W/S walk · A/D or ←/→ turn · Shift sprint · Space fire · G grenade · R reload · Q swap · V knife · E use · X ability · Enter skip the wave break · P pause · M sound on / off. Prefer a locked mouse? Pick “Mouse aim” in Settings.</p>' +
    '<p class="tip">Every map hides three glowing marks with lines under them. Find them, then enter them in order at the sealed keypad. What waits behind the door is worth it. The altar is not.</p>';
  syncSettings(); UI.openMenu();
};

})(window.ZD);

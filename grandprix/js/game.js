/* =====================================================================
   GRAND PRIX 3D — season, race weekend and interface
   ===================================================================== */
(function () {
  'use strict';

  var GP, D, G;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var $ = function (id) { return document.getElementById(id); };

  var S = {
    phase: 'load',        // load|menu|season|setup|quali|grid|race|finished
    mode: 'season',       // season|single|trial
    diff: 1,
    laps: 8,
    trackIdx: 0,
    team: 'meridian',
    raceT: 0, countT: 0, sessionT: 0,
    safety: 0, yellow: [0, 0, 0],
    finishOrder: [], retirements: [],
    started: false, last: 0, raf: 0,
    flashT: 0, msgT: 0, penCd: 0, drsAuto: false, red: 0, redDone: 0, practice: 0, tick: 0,
    frame: 0, classFrame: -1, classCache: null, towerHTML: '', hudAcc: 0, mapAcc: 0,
    ftAvg: 16, scaleAdj: 1, scaleAcc: 0,
    rainTarget: 0, rainT: 0,
    ghost: null, ghostRec: null, ghostPlay: null,
    input: { steer: 0, gas: false, brake: false, hand: false, boost: false, drs: false },
    keys: {}, touch: { l: false, r: false, g: false, b: false, boost: false, drs: false },
    save: null, stintStart: 0, pitAsk: false
  };

  var fmtTime = function (ms) {
    if (!(ms > 0)) return '--:--.---';
    var m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms) % 1000;
    return m + ':' + String(s).padStart(2, '0') + '.' + String(c).padStart(3, '0');
  };
  var fmtGap = function (ms) {
    if (!isFinite(ms)) return '';
    return '+' + (ms / 1000).toFixed(1);
  };

  /* =================================================================
     SAVE
     ================================================================= */
  var KEY = 'gp3.save.v1';
  function blankSave() {
    return { year: 2026, round: 0, team: 'meridian', diff: 1, dstand: {}, tstand: {}, results: [], best: {}, vol: 0.55, muted: false, done: false };
  }
  function loadSave() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var o = JSON.parse(raw); if (o && o.dstand) { PROG.ensure(o); return o; } }
    } catch (e) { }
    var b = blankSave(); PROG.ensure(b); return b;
  }
  function achToast(ids) {
    if (!ids || !ids.length) return;
    var a = PROG.byId[ids[0]]; if (!a) return;
    flash(a.icon + ' ' + a.name.toUpperCase(), 'ach', 2.6);
    beep(true);
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(S.save)); } catch (e) { } }

  /* =================================================================
     FIELD
     ================================================================= */
  function buildField() {
    var THREE = window.THREE, entries = [];
    var drivers = D.DRIVERS;
    // the player takes the second seat of the chosen team
    var playerSeat = -1;
    for (var i = 0; i < drivers.length; i++) if (drivers[i].t === S.team && playerSeat < 0 && i % 2 === 1) playerSeat = i;
    G.cars = [];
    drivers.forEach(function (d, i) {
      var team = D.team(d.t);
      var isMe = (i === playerSeat);
      var c = GP.makeCar({
        color: new THREE.Color(team.color).getHex(),
        color2: new THREE.Color(team.color2).getHex(),
        name: isMe ? 'YOU' : d.n,
        tag: d.n.split(' ').pop().slice(0, 3).toUpperCase(),
        num: d.num, team: d.t, teamName: team.name, teamShort: team.short,
        nat: d.nat, ai: !isMe,
        skill: d.skill, agg: d.agg, cons: d.cons,
        perf: (team.power * 0.55 + team.grip * 0.45) * (0.965 + d.skill * 0.035),
        laneT: 0, avoid: 0, jitter: i * 1.7, mistCd: 4 + i, relCd: 30 + i * 3,
        lineTarget: 0, boxU: 0, stopsDone: 0, stopsPlanned: 1, pitLaps: [3], mistake: 0
      });
      if (isMe) { G.player = c; c.ai = false; applyCustom(c); }
      G.cars.push(c);
      entries.push(c);
    });
    // pit boxes: cars are assigned by championship order (team index)
    G.cars.forEach(function (c) {
      var ti = D.TEAMS.map(function (t) { return t.id; }).indexOf(c.team);
      var seat = (c === G.player) ? 1 : (D.DRIVERS.filter(function (d) { return d.t === c.team; })[0].n === c.name ? 0 : 1);
      var slot = ti * 2 + seat;
      c.boxU = G.pit.boxes[clamp(slot, 0, 19)];
      c.boxSlot = slot;
    });
  }

  function planStrategies() {
    var laps = S.laps;
    G.cars.forEach(function (c) {
      var stops = laps >= 9 ? 2 : 1;
      if (c.ai && Math.random() < 0.25) stops = stops === 1 ? 2 : 1;
      c.stopsPlanned = stops; c.stopsDone = 0;
      c.pitLaps = [];
      for (var k = 1; k <= stops; k++) {
        var ideal = laps * k / (stops + 1);
        c.pitLaps.push(clamp(Math.round(ideal + (Math.random() * 3 - 1.5)), 2, laps - 1));
      }
      // starting compound
      if (G.wet > 0.5) c.tyre = G.wet > 0.75 ? 'W' : 'I';
      else c.tyre = (stops === 2) ? (Math.random() < 0.6 ? 'S' : 'M') : (Math.random() < 0.55 ? 'M' : 'H');
      c.tw = 1;
    });
    if (!G.player.ai) { G.player.stopsPlanned = 9; G.player.stopsDone = 0; }
    G.cars.forEach(setBands);
  }

  /* =================================================================
     WEEKEND
     ================================================================= */
  function currentTrack() { return D.CAL[S.trackIdx]; }

  function loadTrack(def) {
    GP.buildTrack(def);
    S.laps = def.laps;
    if (!G.cars.length) buildField();
    else G.cars.forEach(function (c) { G.scene.add(c.group); });
    buildCrew();
    ensureTrackProps();
    applyUpgrades();
    drawMiniBase();
  }

  // Six conditions, not just sun and rain. Each one sets how wet the surface
  // is, how far you can see, and how the sky is lit.
  var CONDS = {
    sunny:    { name: 'Sunny',        wet: 0,    fog: 1.00, light: 1.00, grey: 0.00 },
    cloudy:   { name: 'Cloudy',       wet: 0,    fog: 0.88, light: 0.86, grey: 0.35 },
    overcast: { name: 'Overcast',     wet: 0.06, fog: 0.74, light: 0.70, grey: 0.62 },
    drizzle:  { name: 'Light rain',   wet: 0.42, fog: 0.62, light: 0.62, grey: 0.74 },
    storm:    { name: 'Heavy rain',   wet: 0.88, fog: 0.40, light: 0.46, grey: 0.90 },
    snow:     { name: 'Snow',         wet: 0.72, fog: 0.44, light: 0.74, grey: 0.82 }
  };

  function rollCondition(def) {
    var r = Math.random(), rain = def.rain || 0;
    if (def.cold && Math.random() < 0.07) return 'snow';
    if (r < rain * 0.42) return 'storm';
    if (r < rain) return 'drizzle';
    if (r < rain + 0.18) return 'overcast';
    if (r < rain + 0.46) return 'cloudy';
    return 'sunny';
  }

  function applyCondition(id) {
    var c = CONDS[id] || CONDS.sunny;
    S.cond = id;
    G.wet = c.wet;
    S.rainTarget = c.wet;
    GP.applyWet();
    if (G.scene && G.scene.fog) {
      G.scene.fog.near = 320 * c.fog;
      G.scene.fog.far = 1150 * c.fog;
      var base = new window.THREE.Color(currentTrack() && currentTrack().night ? 0x141d30 : 0xdce6e6);
      base.lerp(new window.THREE.Color(0x9aa3a8), c.grey * 0.7);
      G.scene.fog.color.copy(base);
      if (G.scene.background && G.scene.background.isColor) G.scene.background.lerp(base, 0.5);
    }
    if (G.sun) G.sun.intensity *= c.light;
    if (G.hemi) G.hemi.intensity *= 0.72 + c.light * 0.34;
    var b = document.body;
    b.classList.toggle('rain', id === 'drizzle' || id === 'storm');
    b.classList.toggle('heavy', id === 'storm');
    b.classList.toggle('snow', id === 'snow');
    b.classList.toggle('grey', c.grey > 0.5);
    b.classList.toggle('night', !!(currentTrack() && currentTrack().night));
  }

  function setWeather(def, forced) {
    applyCondition(forced != null ? forced : rollCondition(def));
    S.rainT = 0;
  }

  function startQuali(practice) {
    S.practice = practice || 0;
    S.phase = 'quali'; S.sessionT = practice ? 80 : 100; S.raceT = 0;
    S.finishOrder = []; S.retirements = [];
    // spread the field around the lap for a flying-lap session
    G.cars.forEach(function (c, i) {
      var n = G.N, idx = Math.round(n * i / G.cars.length);
      var s = G.samples[idx];
      var off = (i % 2 ? 1.6 : -1.6);
      c.x = s.x + s.nx * off; c.z = s.z + s.nz * off; c.h = s.h;
      c.idx = idx; c.lap = 0; c.prog = 0; c.speed = 28; c.vx = Math.sin(c.h) * 28; c.vz = Math.cos(c.h) * 28;
      c.bestLap = 0; c.lastLap = 0; c.lapStart = -1; c.tw = 1; c.fuel = 0.4; c.dmg = 0;
      c.tyre = G.wet > 0.5 ? (G.wet > 0.75 ? 'W' : 'I') : 'S';
      c.finished = false; c.retired = false; c.inPit = false; c.wantPit = false;
      c.stopsPlanned = 0; c.stopsDone = 0; c.penalty = 0; c.boost = GP.BOOST_MAX;
      c.group.visible = true; setBands(c);
      c.group.position.set(c.x, 0, c.z); c.group.rotation.set(0, c.h, 0);
    });
    G.camMode = 0;
    GP.updateCamera(1, true);
    showScreen(null);
    flash(S.practice ? ('PRACTICE ' + S.practice) : 'QUALIFYING', 'accent', 2.2);
    S.started = true;
    hudMode('quali');
  }

  function qualiOver() {
    if (S.practice) {
      var p = S.practice;
      S.phase = 'setup';
      S.save.fp = Math.max(S.save.fp || 0, p); persist();
      showPracticeResult(p);
      return;
    }
    // grid from best laps; anyone without a time starts at the back
    var order = G.cars.slice().sort(function (a, b) {
      var A = a.bestLap || 9e9, B = b.bestLap || 9e9;
      return A - B;
    });
    S.grid = order;
    S.phase = 'setup';
    if (order[0] === G.player && G.player.bestLap) { var pf = PROG.pole(S.save.profile); persist(); if (pf) setTimeout(function () { achToast(pf); }, 600); }
    showQualiResult(order);
  }

  function startRace() {
    S.practice = 0; S.restart = false;
    S.phase = 'grid'; S.countT = 0; S.raceT = 0;
    S.finishOrder = []; S.retirements = [];
    S.safety = 0; S.yellow = [0, 0, 0]; S.red = 0; S.redDone = 0;
    var order = S.grid || G.cars.slice();
    order.forEach(function (c, i) {
      GP.placeOnGrid(c, i); c.gridPos = i + 1;
      c.recovered = false; c.recover = 0; c.crane = null; c.penServed = 0; c.boxDone = false;
      S.wasInPit = false;
    });
    if (sc) { sc.active = false; sc.group.visible = false; }
    cranes.forEach(function (k) { k.busy = null; k.group.visible = false; });
    radioQ.length = 0;
    rState = { tyre: 1, fuel: 1, gap: 0, box: 0, pos: 0, t: 4, weather: G.wet };
    planStrategies();
    G.cars.forEach(function (c) { c.fuel = 1; });
    S.stintStart = 0;
    PROG.raceStart({ gridPos: G.player.gridPos || order.indexOf(G.player) + 1 });
    showScreen(null);
    hudMode('race');
    $('lights').style.display = 'flex';
    $('lights').querySelectorAll('i').forEach(function (e) { e.classList.remove('on'); });
    GP.updateCamera(1, true);
    S.started = true;
  }

  function stepLights(dt) {
    S.countT += dt;
    var L = $('lights').querySelectorAll('i');
    var lit = Math.min(5, Math.floor(S.countT / 0.85));
    L.forEach(function (el, i) {
      var on = i < lit;
      if (on && !el.classList.contains('on')) beep(false);
      el.classList.toggle('on', on);
    });
    if (S.countT > 0.85 * 5 + 0.9) {
      L.forEach(function (el) { el.classList.remove('on'); el.classList.add('go'); });
      setTimeout(function () { $('lights').style.display = 'none'; L.forEach(function (el) { el.classList.remove('go'); }); }, 700);
      G.shake = Math.max(G.shake || 0, 0.22);
      S.phase = 'race'; S.raceT = 0; beep(true);
      var restart = !!S.restart;
      G.cars.forEach(function (c) {
        c.lapStart = S.raceT;
        if (!restart) c.lap = 0;            // a restart resumes, it does not reset
      });
      S.restart = false;
      flash(restart ? 'GO!' : 'GO!', '', 0.9);
    }
  }

  /* =================================================================
     EVENTS from the engine
     ================================================================= */
  GPhook();
  function GPhook() {
    // deferred: GP may not exist yet at file parse time
    setTimeout(function () {
      window.GP.onLap = onLap;
      window.GP.onSector = onSector;
      window.GP.onHit = onHit;
      window.GP.onPenalty = function (c) {
        if (c === G.player) flash('+3s PIT LANE SPEEDING', 'warn', 2.4);
        else flash(c.tag + ' +3s · PIT LANE SPEEDING', '', 1.8);
      };
      window.GP.onRetire = retire;
    }, 0);
  }

  function onLap(c) {
    if (S.phase === 'quali') {
      if (c.lapStart >= 0) {
        var lt = S.raceT - c.lapStart;
        c.lastLap = lt;
        // a plausible lap floor scaled to this circuit, so a sliver of road
        // crossed at the flag can never be logged as a session-best
        var floor = G.trackLen / GP.MAX_SPEED * 600;
        if (lt > floor && (!c.bestLap || lt < c.bestLap)) c.bestLap = lt;
      }
      c.lapStart = S.raceT;
      return;
    }
    if (S.phase !== 'race') return;
    if (c.lap >= 2) {
      c.lastLap = S.raceT - c.lapStart;
      if (!c.bestLap || c.lastLap < c.bestLap) c.bestLap = c.lastLap;
      if (c === G.player) { c.boost = GP.BOOST_MAX; var fl = PROG.lap(S.save.profile); if (fl) setTimeout(function () { achToast(fl); }, 1200); }
      else c.boost = GP.BOOST_MAX;
    }
    c.lapStart = S.raceT;
    if (c.lap > S.laps && !c.finished) {
      c.finished = true; c.finishT = S.raceT + c.penalty * 1000;
      S.finishOrder.push(c);
      if (c === G.player) endRace();
    } else if (c === G.player) {
      if (c.lap === S.laps) { flash('FINAL LAP', 'accent', 1.8); radio('Last lap. Bring it home.', 'good', true); }
      else if (c.lap > 0) flash('LAP ' + c.lap + ' / ' + S.laps, '', 1.0);
    }
  }

  function onSector(c, from, to) {
    if (c !== G.player) return;
    if (S.phase !== 'race' && S.phase !== 'quali') return;
    var t = S.raceT;
    c.sectorMark = c.sectorMark || [0, 0, 0];
    var st = t - (c.sectorStart || 0);
    c.sectorStart = t;
    if (st > 1000 && st < 200000) {
      c.sectorT[from] = st;
      var better = !c.bestSector[from] || st < c.bestSector[from];
      if (better) c.bestSector[from] = st;
      showSector(from, st, better);
    }
  }

  function onHit(c, force) {
    if (c === G.player) {
      G.shake = Math.min(0.55, force * 0.7); sfxHit(force);
      if (force > 0.12) PROG.contact();
    }
    // Anyone who runs into the back of the car ahead is judged at fault —
    // the AI is held to the same standard as the player.
    if (force > 0.45 && S.phase === 'race' && c.speed > 18 && (c.penCd || 0) <= 0) {
      var rows = classification(), i = rows.indexOf(c);
      var ahead = rows[i - 1];
      if (ahead && !ahead.retired) {
        var d = Math.hypot(ahead.x - c.x, ahead.z - c.z);
        if (d < 5.5) { givePenalty(c, 5, 'Causing a collision'); c.penCd = 20; }
      }
    }
    if (force > 0.92 && S.phase === 'race' && c.lap >= 1 && Math.random() < 0.22) redFlag();
    else if (force > 0.6 && !S.safety && S.phase === 'race' && c.lap >= 1 && Math.random() < 0.12) deploySafety(c);
    if (force > 0.72) {
      var sec = c.idx < G.sectors[1] ? 0 : (c.idx < G.sectors[2] ? 1 : 2);
      S.yellow[sec] = Math.max(S.yellow[sec], 5);
    }
  }

  var MAX_DNF = 3;
  function retire(c) {
    if (c.retired || c.finished) return;
    // a damaged AI car limps to the pits and is repaired instead of stopping
    if (c.ai && S.retirements.length >= MAX_DNF) {
      c.dmg = Math.min(0.55, c.dmg);
      c.wantPit = true; c.stopsPlanned = Math.max(c.stopsPlanned, c.stopsDone + 1);
      return;
    }
    c.retired = true; c.group.visible = true; c.recover = 0; c.recovered = false;
    c.speed = 0; c.vx = 0; c.vz = 0;
    S.retirements.push(c);
    if (c === G.player) { flash('RETIRED', 'warn', 3); radio('That is the end of our race. Switch everything off.', 'urgent', true); endRace(); }
    else if (Math.random() < 0.3) deploySafety(c);
  }

  // A very heavy accident stops the session. Everyone crawls back to the
  // pits, the cars are repaired, and the race restarts from a standing grid
  // in the order it was running, with the laps already completed kept.
  function redFlag() {
    if (S.red > 0 || S.redDone >= 2 || S.phase !== 'race') return;
    S.red = 13; S.redDone++;
    S.safety = 0; document.body.classList.remove('sc');
    document.body.classList.add('redflag');
    flash('RED FLAG', 'warn', 3.2);
    radio('Red flag, red flag. Session stopped, come back to the pits.', 'urgent', true);
  }
  function redTick(dt) {
    if (S.red <= 0) return;
    S.red -= dt;
    G.cars.forEach(function (c) {
      if (c.retired || c.ai === false) return;
      c.wantPit = true;
    });
    if (S.red <= 0) {
      document.body.classList.remove('redflag');
      // restart: current order, laps kept, cars repaired and refuelled
      var rows = classification().filter(function (c) { return !c.retired; });
      var keptLap = Math.max.apply(null, G.cars.map(function (c) { return c.lap; }));
      rows.forEach(function (c, i) {
        var lap = c.lap;
        GP.placeOnGrid(c, i);
        c.lap = lap; c.prog = lap * G.N + c.idx;
        c.dmg = 0; c.fuel = 1; c.tw = 1; c.boxDone = false;
        if (c.mesh.fw) c.mesh.fw.visible = true;
        setBands(c);
      });
      S.phase = 'grid'; S.countT = 0; S.restart = true;
      $('lights').style.display = 'flex';
      $('lights').querySelectorAll('i').forEach(function (el) { el.classList.remove('on'); });
      GP.updateCamera(1, true);
      flash('STANDING RESTART', 'accent', 2.4);
      radio('Standing restart. Same order, clean getaway please.', 'good', true);
    }
  }

  function deploySafety(c) {
    if (S.safety > 0) return;
    S.safety = 26;
    flash('SAFETY CAR', 'warn', 2.6);
    document.body.classList.add('sc');
  }

  /* =================================================================
     PLAYER PIT STOP
     ================================================================= */
  var crew = null;
  function buildCrew() {
    var THREE = window.THREE;
    if (crew) { G.scene.remove(crew); crew = null; }
    crew = new THREE.Group();
    var body = new THREE.MeshStandardMaterial({ color: 0xc67139, roughness: 0.7 });
    var geo = new THREE.CylinderGeometry(0.2, 0.24, 0.9, 7);
    for (var i = 0; i < 6; i++) {
      var m = new THREE.Mesh(geo, body);
      m.position.set((i % 3 - 1) * 1.5, 0.55, (i < 3 ? 1.7 : -1.5));
      m.castShadow = true; crew.add(m);
    }
    crew.visible = false;
    G.scene.add(crew);
  }

  function teleportToBox(me) {
    var n = G.N, pit = G.pit;
    var i = (pit.entry + Math.round(me.boxU)) % n, s = G.samples[i];
    var lat = GP.laneLat(me.boxU) + 1.8;
    me.x = s.x + s.nx * lat; me.z = s.z + s.nz * lat;
    me.h = s.h; me.idx = i; me.lat = lat;
    me.speed = 0; me.vx = 0; me.vz = 0; me.slip = 0; me.spin = 0;
    me.group.position.set(me.x, 0, me.z); me.group.rotation.set(0, me.h, 0);
    GP.updateCamera(1, true);
    flash('IN THE BOX', 'accent', 1.4);
    radio('You are in the box. Tell us what you want on the car.', '', true);
  }

  function playerPitLogic(dt) {
    var me = G.player, n = G.N, pit = G.pit;
    var u = (me.idx - pit.entry + n) % n;
    var inLane = me.inPit && u < pit.len;
    if (inLane && !S.wasInPit && !me.boxDone) { teleportToBox(me); u = Math.round(me.boxU); }
    S.wasInPit = inLane;
    document.body.classList.toggle('inpit', inLane);
    var board = $('pitBoard');
    if (me.pitPhase === 1) {
      me.pitTimer -= dt;
      me.speed = 0; me.vx = me.vz = 0;
      var left = Math.max(0, me.pitTimer);
      board.innerHTML = '<b>' + left.toFixed(1) + 's</b><span>' + (me.pitService || 'SERVICE') + '</span>';
      board.className = 'show';
      if (me.pitTimer <= 0) {
        me.pitPhase = 2; me.stops++; me.boxDone = true;
        crew.visible = false;
        board.innerHTML = '<b>GO</b><span>box exit</span>';
        flash('GO GO GO', 'accent', 1.2);
        setTimeout(function () { board.className = ''; }, 1400);
        $('pitPanel').classList.remove('show');
      }
      return;
    }
    if (!inLane) {
      if (me.boxDone) { me.boxDone = false; me.pitPhase = 0; crew.visible = false; $('pitPanel').classList.remove('show'); }
      if (me.wantPit) { board.className = 'show'; board.innerHTML = '<b>BOX</b><span>pit entry ahead</span>'; }
      else if (board.className) board.className = '';
      return;
    }
    // in the lane, approaching the box
    var laneLat = GP.laneLat(u);
    var near = Math.abs(u - me.boxU) < 7 && Math.abs(me.lat - (laneLat + 1.5)) < 2.6;
    var kmh = Math.round(Math.max(0, me.speed) * GP.KMH);
    board.className = 'show' + (me.speed > GP.PIT_LIMIT + 0.6 ? ' over' : '');
    board.innerHTML = '<b>' + kmh + '</b><span>limit ' + Math.round(GP.PIT_LIMIT * GP.KMH) + ' km/h · box ' +
      (u < me.boxU ? Math.round(me.boxU - u) + 'm' : 'behind') + '</span>';
    if (near && Math.abs(me.speed) < 2.6 && me.pitPhase === 0 && !me.boxDone) {
      openPitPanel();
    }
    if (me.pitPhase === 0 && me.boxDone && Math.abs(u - me.boxU) > 26) {
      board.className = 'show';
      board.innerHTML = '<b>' + kmh + '</b><span>lane exit ahead · keep under the limit</span>';
    }
  }

  function openPitPanel() {
    var me = G.player;
    me.pitPhase = 0.5;
    me.speed = 0; me.vx = me.vz = 0;
    var box = G.pitBoxes[me.boxSlot];
    crew.position.set(me.x, 0, me.z); crew.rotation.y = me.h; crew.visible = true;
    var p = $('pitPanel');
    p.classList.add('show');
    var html = '<h4>Pit stop</h4><div class="tyrow">';
    D.TYRES.forEach(function (t, i) {
      html += '<button class="tbtn" data-t="' + t.id + '"><i style="background:' + t.color + '"></i>' + t.label + '</button>';
    });
    html += '</div><label class="fuelrow">Fuel <input id="pitFuel" type="range" min="35" max="100" value="' +
      Math.round(Math.max(35, me.fuel * 100)) + '"><span id="pitFuelV"></span></label>' +
      '<div class="pitacts"><button class="btn btn-primary" id="pitGo">Service the car</button>' +
      '<button class="btn btn-ghost" id="pitSkip">Drive through</button></div>';
    p.innerHTML = html;
    var fv = function () { $('pitFuelV').textContent = $('pitFuel').value + '%'; };
    $('pitFuel').addEventListener('input', fv); fv();
    var chosen = me.tyre;
    p.querySelectorAll('.tbtn').forEach(function (b) {
      b.classList.toggle('on', b.dataset.t === chosen);
      b.addEventListener('click', function () {
        chosen = b.dataset.t;
        p.querySelectorAll('.tbtn').forEach(function (o) { o.classList.toggle('on', o.dataset.t === chosen); });
      });
    });
    $('pitGo').addEventListener('click', function () {
      var f = parseInt($('pitFuel').value, 10) / 100;
      servicePlayer(chosen, f);
    });
    $('pitSkip').addEventListener('click', function () {
      me.pitPhase = 0; me.boxDone = true; crew.visible = false;
      p.classList.remove('show');
      flash('DRIVE THROUGH', '', 1.2);
    });
  }

  function servicePlayer(tyreId, fuel) {
    var me = G.player;
    var change = tyreId !== me.tyre;
    var added = Math.max(0, fuel - me.fuel);
    var pen = me.penalty || 0;
    var time = 2.3 + (change ? 0.6 : 0) + added * 4.5 + (me.dmg > 0.4 ? 1.8 : 0) + pen;
    me.pitService = (pen ? 'SERVING +' + pen + 's · ' : '') +
      (change ? D.tyre(tyreId).label : 'SAME') + (me.dmg > 0.4 ? ' + WING' : '') + (added > 0.02 ? ' + FUEL' : '');
    if (pen) { me.penalty = 0; me.penServed = (me.penServed || 0) + pen; radio('Penalty served. Clean air ahead, go.', 'good'); }
    me.tyre = tyreId; me.tw = 1; me.fuel = Math.max(me.fuel, fuel); setBands(me);
    if (me.dmg > 0.1) { me.dmg = 0; me.mesh.fw.visible = true; }
    me.pitPhase = 1; me.pitTimer = time;
    me.stopsDone++;
    $('pitPanel').classList.remove('show');
  }

  /* AI service when they stop in their box */
  function aiPitService(c, dt) {
    var n = G.N, u = (c.idx - G.pit.entry + n) % n;
    if (c.pitPhase === 0 && Math.abs(u - c.boxU) < 6 && Math.abs(c.speed) < 3 && c.stopsDone < c.stopsPlanned) {
      c.pitPhase = 1;
      var wetNow = G.wet > 0.5;
      c.tyre = wetNow ? (G.wet > 0.75 ? 'W' : 'I') : (S.laps - c.lap <= 4 ? 'S' : (Math.random() < 0.5 ? 'M' : 'H'));
      c.tw = 1; c.fuel = 1; setBands(c);
      var aiPen = c.penalty || 0;
      c.pitTimer = 2.2 + Math.random() * 1.4 + (c.dmg > 0.4 ? 1.5 : 0) + aiPen;
      if (aiPen) { c.penalty = 0; c.penServed = (c.penServed || 0) + aiPen; }
      if (c.dmg > 0.1) { c.dmg = 0; c.mesh.fw.visible = true; }
      c.stopsDone++;
    }
    if (c.pitPhase === 1) {
      c.speed = 0; c.vx = c.vz = 0;
      c.pitTimer -= dt;
      if (c.pitTimer <= 0) c.pitPhase = 2;
    }
  }

  /* =================================================================
     TEAM RADIO
     A short click, a burst of filtered tone shaped like speech, then the
     message on screen. Calls are queued so two never talk over each other.
     ================================================================= */
  var radioQ = [], radioT = 0;

  function radio(text, kind, urgent) {
    if (urgent) radioQ.unshift({ text: text, kind: kind || '' });
    else {
      if (radioQ.length > 3) return;
      radioQ.push({ text: text, kind: kind || '' });
    }
  }
  function radioTick(dt) {
    radioT -= dt;
    if (radioT > 0 || !radioQ.length) return;
    var m = radioQ.shift();
    var el = $('radio');
    el.className = 'show ' + m.kind;
    el.innerHTML = '<i></i><b>Race engineer</b><span>' + m.text + '</span>';
    radioT = 2.4 + Math.min(2.6, m.text.length * 0.045);
    setTimeout(function () { if (!radioQ.length) el.className = ''; }, (radioT - 0.25) * 1000);
    speak(m.text);
  }
  // Not speech synthesis — a radio click and a band-passed tone burst per
  // syllable, which reads as a voice under a helmet without needing samples.
  function speak(text) {
    if (!_ac) return;
    var t = _ac.currentTime;
    click(t);
    var syll = Math.min(16, Math.max(3, Math.round(text.length / 3.2)));
    for (var i = 0; i < syll; i++) {
      var at = t + 0.12 + i * 0.115;
      var o = _ac.createOscillator(), gg = _ac.createGain();
      o.type = 'sawtooth';
      var base = 118 + (i % 3) * 16 + (i === syll - 1 ? -18 : 0) + Math.random() * 18;
      o.frequency.setValueAtTime(base, at);
      o.frequency.linearRampToValueAtTime(base * (0.9 + Math.random() * 0.25), at + 0.09);
      var f = _ac.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = 900 + Math.random() * 900; f.Q.value = 3.4;
      var f2 = _ac.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 420;
      gg.gain.setValueAtTime(0.0001, at);
      gg.gain.exponentialRampToValueAtTime(0.075, at + 0.02);
      gg.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
      o.connect(f).connect(f2).connect(gg).connect(_bus); o.start(at); o.stop(at + 0.12);
    }
    click(t + 0.14 + syll * 0.115);
  }
  function click(at) {
    if (!_ac || !_noiseBuf) return;
    var s = _ac.createBufferSource(); s.buffer = _noiseBuf;
    var f = _ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 1.2;
    var gg = _ac.createGain();
    gg.gain.setValueAtTime(0.0001, at);
    gg.gain.exponentialRampToValueAtTime(0.045, at + 0.006);
    gg.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    s.connect(f).connect(gg).connect(_bus); s.start(at); s.stop(at + 0.09);
  }

  // What the engineer notices, checked once a second.
  var rState = { tyre: 1, fuel: 1, gap: 0, box: 0, pos: 0, t: 0, weather: 0 };
  function engineerTick(dt) {
    if (S.phase !== 'race' || !G.player || G.player.retired) return;
    rState.t -= dt; if (rState.t > 0) return;
    rState.t = 3.5;
    var me = G.player, rows = classification(), pos = rows.indexOf(me) + 1;

    if (me.tw < 0.28 && rState.tyre >= 0.28) {
      radio('Tyres are done. Box this lap, box this lap.', 'urgent', true); rState.box = S.raceT;
    } else if (me.tw < 0.5 && rState.tyre >= 0.5) {
      radio('Degradation is climbing. Start thinking about the stop.');
    }
    rState.tyre = me.tw;

    if (me.fuel < 0.14 && rState.fuel >= 0.14) radio('Fuel is critical. Lift and coast into the slow corners.', 'urgent');
    else if (me.fuel < 0.3 && rState.fuel >= 0.3) radio('Fuel target is off. Save where you can.');
    rState.fuel = me.fuel;

    if (G.wet > 0.45 && rState.weather < 0.45) {
      radio(D.tyre(me.tyre).dryOK ? 'Rain is here. We need intermediates, box now.' : 'Rain is here. Tyres are correct, stay out.', 'urgent', true);
    } else if (G.wet < 0.2 && rState.weather >= 0.45) {
      radio(D.tyre(me.tyre).dryOK ? 'Track is drying nicely, keep pushing.' : 'Track is drying. Wets are overheating, box for slicks.', 'urgent');
    }
    rState.weather = G.wet;

    if (me.dmg > 0.55 && rState.pos !== -99) {
      radio('We see damage on the car. Pit when you can and we will change the wing.');
      rState.pos = -99;
    }
    if (me.penalty > 0 && rState.pen !== me.penalty) {
      rState.pen = me.penalty;
      radio('You have a ' + me.penalty + ' second penalty. We will serve it at the stop.', 'urgent');
    }
    if (pos !== rState.pos && rState.pos > 0 && pos > 0) {
      if (pos < rState.pos) radio('Good work, that is P' + pos + ' now.', 'good');
      else if (pos > rState.pos) radio('We lost a place, P' + pos + '. Head down.');
    }
    if (rState.pos !== -99) rState.pos = pos;

    if (me.drsAllowed && !rState.drsTold) { rState.drsTold = 1; radio('DRS enabled, you are within one second.', 'good'); }
    if (!me.drsAllowed) rState.drsTold = 0;
  }

  /* =================================================================
     SAFETY CAR AND RECOVERY
     ================================================================= */
  var sc = null, cranes = [];

  function ensureTrackProps() {
    if (!sc) { sc = GP.makeSafetyCar(); G.scene.add(sc.group); }
    else G.scene.add(sc.group);
    if (!cranes.length) {
      for (var i = 0; i < 3; i++) { var c = GP.makeCrane(); cranes.push(c); G.scene.add(c.group); }
    } else cranes.forEach(function (c) { G.scene.add(c.group); });
    sc.idx = 0; sc.active = false; sc.group.visible = false;
    cranes.forEach(function (c) { c.group.visible = false; c.busy = null; });
  }

  function scTick(dt) {
    if (!sc) return;
    var n = G.N;
    if (S.safety > 0 && !sc.active) {
      // slot in just ahead of the race leader
      var lead = classification()[0];
      sc.idx = (lead.idx + 34) % n;
      sc.active = true; sc.group.visible = true; sc.speed = 30;
      radio('Safety car is out. Slow down, hold position.', 'urgent', true);
    }
    if (!sc.active) return;
    var target = S.safety > 4 ? 22 : 34;
    sc.speed += (target - sc.speed) * Math.min(1, dt * 0.8);
    sc.idx = (sc.idx + sc.speed * dt) % n;
    var s = G.samples[Math.floor(sc.idx) % n];
    var lane = s.line * 0.6;
    sc.group.position.set(s.x + s.nx * lane, 0, s.z + s.nz * lane);
    sc.group.rotation.y = s.h;
    sc.wheels.forEach(function (w) { w.rotation.x += sc.speed * dt / 0.42; });
    var blink = (performance.now() % 420) < 210;
    sc.lamps[0].material.color.setHex(blink ? 0xffe14a : 0x4a4630);
    sc.lamps[1].material.color.setHex(blink ? 0x4a4630 : 0xffe14a);
    if (S.safety <= 0) {
      sc.active = false; sc.group.visible = false;
      radio('Safety car in this lap. Get ready to go racing.', 'good', true);
    }
  }

  // A retired car sits for a moment, then a crane arrives, lifts it and the
  // car is taken away. Nothing is left on the circuit.
  function recoveryTick(dt) {
    G.cars.forEach(function (c) {
      if (!c.retired || c.recovered) return;
      c.recover = (c.recover || 0) + dt;
      if (c.recover < 1.6) return;
      if (!c.crane) {
        var free = cranes.filter(function (k) { return !k.busy; })[0];
        if (!free) {
          // no crane available: marshals push it behind the barrier instead
          if (c.recover > 5) { c.recovered = true; c.group.visible = false; }
          else c.group.visible = true;
          return;
        }
        free.busy = c; c.crane = free;
        var s = G.samples[c.idx];
        var side = c.lat > 0 ? 1 : -1;
        free.group.position.set(s.x + s.nx * side * (G.HALF_W + 6.5), 0, s.z + s.nz * side * (G.HALF_W + 6.5));
        free.group.rotation.y = s.h + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        free.group.visible = true;
        var sec = c.idx < G.sectors[1] ? 0 : (c.idx < G.sectors[2] ? 1 : 2);
        S.yellow[sec] = 7;
      }
      var lift = clamp((c.recover - 2.2) / 2.6, 0, 1);
      c.group.visible = lift < 1;
      c.group.position.y = lift * 3.2;
      c.group.rotation.z = lift * 0.22;
      c.crane.arm.rotation.x = 0.35 - lift * 0.22;
      if (c.recover > 6.4) {
        c.recovered = true; c.group.visible = false; c.group.position.y = 0; c.group.rotation.z = 0;
        c.crane.busy = null; c.crane.group.visible = false; c.crane = null;
      }
    });
  }

  /* =================================================================
     DRS
     ================================================================= */
  function drsTick(dt) {
    var rows = classification(), n = G.N;
    var open = S.phase === 'race' && G.player && G.player.lap >= 1 && G.wet < 0.35 && S.safety <= 0;
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i];
      if (c.retired || c.inPit) { c.drs = false; c.drsAllowed = false; continue; }
      var ahead = rows[i - 1];
      if (GP.atDRSDetection(c)) {
        var ok = false;
        if (open && ahead && !ahead.inPit && !ahead.retired) {
          var d = ahead.prog - c.prog;
          var gapS = d / Math.max(14, Math.abs(c.speed));
          ok = d > 0 && gapS < 1.0 && d < G.N * 0.5;
        }
        c.drsAllowed = ok;
      }
      var inZone = GP.inDRS(c);
      if (!inZone || !c.drsAllowed) { c.drs = false; continue; }
      if (c.ai) c.drs = true;
      else c.drs = !!(S.input.drs && S.input.gas && !S.input.brake);
    }
  }

  /* =================================================================
     PENALTIES
     ================================================================= */
  function givePenalty(c, secs, why) {
    c.penalty = (c.penalty || 0) + secs;
    if (c === G.player) {
      flash('+' + secs + 's PENALTY · ' + why, 'warn', 2.6);
      radio(why + '. That is a ' + secs + ' second penalty.', 'urgent', true);
    } else {
      flash(c.tag + ' +' + secs + 's · ' + why.toUpperCase(), '', 1.8);
    }
  }

  // Fitted parts. Everything in the garage is free to swap — a part is a
  // trade of one quality against another, never a purchase. The later tiers
  // are genuinely better hardware, not just a different character.
  var PARTS = {
    engine: {
      name: 'Power unit', note: 'The whole architecture behind you',
      opts: [
        { id: 'bal', name: 'Balanced V6', note: 'No weakness, no edge', power: 1.000, grip: 1.000, rely: 1.00, wear: 1.00 },
        { id: 'hi',  name: 'High-boost V6', note: 'Top speed, harder on itself', power: 1.030, grip: 0.996, rely: 0.90, wear: 1.06 },
        { id: 'tq',  name: 'Torque-biased V6', note: 'Punch out of slow corners', power: 1.012, grip: 1.010, rely: 0.97, wear: 1.10 },
        { id: 'end', name: 'Endurance V6', note: 'Built to finish', power: 0.988, grip: 1.000, rely: 1.14, wear: 0.92 },
        { id: 'evo', name: 'Evo V6', note: 'The season’s second-spec unit', power: 1.038, grip: 1.008, rely: 1.02, wear: 0.98 },
        { id: 'wks', name: 'Works V6', note: 'Everything the factory has', power: 1.055, grip: 1.014, rely: 1.06, wear: 0.95 }
      ]
    },
    gbox: {
      name: 'Gearbox', note: 'How the ratios come to you',
      opts: [
        { id: 'std',  name: 'Standard eight-speed', note: 'Dependable', power: 1.000, grip: 1.000, rely: 1.00, wear: 1.00 },
        { id: 'short',name: 'Short ratios', note: 'Acceleration over top end', power: 1.010, grip: 1.000, rely: 0.98, wear: 1.02 },
        { id: 'long', name: 'Long ratios', note: 'Top end over acceleration', power: 1.016, grip: 0.994, rely: 1.00, wear: 0.98 },
        { id: 'wks',  name: 'Works seamless', note: 'Fast shifts, strong internals', power: 1.024, grip: 1.002, rely: 1.05, wear: 0.99 }
      ]
    },
    wing: {
      name: 'Rear wing', note: 'Downforce against straight-line speed',
      opts: [
        { id: 'med', name: 'Medium downforce', note: 'The all-round choice', power: 1.000, grip: 1.000, rely: 1.00, wear: 1.00 },
        { id: 'low', name: 'Low downforce', note: 'For the fast circuits', power: 1.028, grip: 0.968, rely: 1.00, wear: 0.95 },
        { id: 'high',name: 'High downforce', note: 'For the street circuits', power: 0.972, grip: 1.036, rely: 1.00, wear: 1.06 },
        { id: 'evo', name: 'Evo bi-plane', note: 'More wing for less drag', power: 1.014, grip: 1.030, rely: 1.00, wear: 0.99 },
        { id: 'wks', name: 'Works bi-plane', note: 'The full upgrade package', power: 1.026, grip: 1.044, rely: 1.00, wear: 0.97 }
      ]
    },
    floor: {
      name: 'Floor and diffuser', note: 'Where most of the downforce is made',
      opts: [
        { id: 'std', name: 'Base floor', note: 'The car as it was homologated', power: 1.000, grip: 1.000, rely: 1.00, wear: 1.00 },
        { id: 'seal',name: 'Sealed edge floor', note: 'Steadier in fast corners', power: 0.998, grip: 1.024, rely: 1.00, wear: 0.98 },
        { id: 'evo', name: 'Evo floor', note: 'A big step in load', power: 1.006, grip: 1.036, rely: 0.99, wear: 1.00 },
        { id: 'wks', name: 'Works floor', note: 'Full development package', power: 1.012, grip: 1.050, rely: 1.00, wear: 0.98 }
      ]
    },
    susp: {
      name: 'Suspension', note: 'How the car takes kerbs and load',
      opts: [
        { id: 'norm', name: 'Neutral setup', note: 'Predictable everywhere', power: 1.000, grip: 1.000, rely: 1.00, wear: 1.00 },
        { id: 'stiff',name: 'Stiff setup', note: 'Sharp, punishes mistakes', power: 1.000, grip: 1.022, rely: 0.96, wear: 1.12 },
        { id: 'soft', name: 'Soft setup', note: 'Kind to the tyres', power: 1.000, grip: 0.986, rely: 1.04, wear: 0.86 },
        { id: 'evo',  name: 'Evo pushrod', note: 'Sharp without the punishment', power: 1.000, grip: 1.026, rely: 1.02, wear: 0.94 },
        { id: 'wks',  name: 'Works pushrod', note: 'Grip and tyre life together', power: 1.004, grip: 1.038, rely: 1.05, wear: 0.88 }
      ]
    },
    brakes: {
      name: 'Brakes', note: 'Stopping power and duct cooling',
      opts: [
        { id: 'std', name: 'Standard carbon', note: 'Even balance', power: 1.000, grip: 1.000, rely: 1.00, wear: 1.00 },
        { id: 'big', name: 'High-bite carbon', note: 'Later braking, more heat', power: 1.000, grip: 1.014, rely: 0.97, wear: 1.08 },
        { id: 'cool',name: 'Cooled ducts', note: 'Stable over a long run', power: 0.996, grip: 1.004, rely: 1.06, wear: 0.94 },
        { id: 'evo', name: 'Evo carbon', note: 'Bite with the cooling to match', power: 1.000, grip: 1.020, rely: 1.04, wear: 0.96 },
        { id: 'wks', name: 'Works carbon', note: 'The factory brake package', power: 1.002, grip: 1.030, rely: 1.07, wear: 0.93 }
      ]
    }
  };
  var PART_KEYS = ['engine', 'gbox', 'wing', 'floor', 'susp', 'brakes'];

  function fitOf() {
    var f = S.save.fit || (S.save.fit = {});
    PART_KEYS.forEach(function (k) {
      if (!f[k] || !PARTS[k].opts.some(function (o) { return o.id === f[k]; })) f[k] = PARTS[k].opts[0].id;
    });
    return f;
  }
  function partOpt(k) {
    var f = fitOf();
    return PARTS[k].opts.filter(function (o) { return o.id === f[k]; })[0];
  }
  function fitFactors() {
    var out = { power: 1, grip: 1, rely: 1, wear: 1 };
    PART_KEYS.forEach(function (k) {
      var o = partOpt(k);
      out.power *= o.power; out.grip *= o.grip; out.rely *= o.rely; out.wear *= o.wear;
    });
    return out;
  }

  function renderParts() {
    var f = fitOf(), html = '';
    PART_KEYS.forEach(function (k) {
      var P = PARTS[k], cur = partOpt(k);
      html += '<div class="partrow"><b>' + P.name + '</b><span>' + P.note + '</span><div class="partopts">';
      P.opts.forEach(function (o) {
        html += '<button class="popt' + (o.id === f[k] ? ' on' : '') + '" data-k="' + k + '" data-o="' + o.id + '">' +
          '<b>' + o.name + '</b><span>' + o.note + '</span></button>';
      });
      html += '</div><div class="partstats">' + statPills(cur) + '</div></div>';
    });
    $('garageParts').innerHTML = html;
    $('garageParts').querySelectorAll('.popt').forEach(function (b) {
      b.addEventListener('click', function () {
        fitOf()[b.dataset.k] = b.dataset.o;
        persist(); applyUpgrades(); renderParts(); applyGarageCar();
            flash('PART FITTED', 'accent', 1.2);
      });
    });
  }

  function statPills(o) {
    return [['Power', o.power], ['Grip', o.grip], ['Reliability', o.rely], ['Tyre life', 2 - o.wear]]
      .map(function (p) {
        var d = Math.round((p[1] - 1) * 1000) / 10;
        var cls = d > 0.05 ? ' up' : (d < -0.05 ? ' down' : '');
        return '<span class="pstat' + cls + '">' + p[0] + ' ' + (d > 0 ? '+' : '') + d.toFixed(1) + '%</span>';
      }).join('');
  }

  // the viewer shows the car in your own livery, with the fitted wing
  function applyGarageCar() {
    var rig = GP.garageRig(); if (!rig || !rig.car) return;
    var w = partOpt('wing');
    rig.car.rw.scale.y = w.id === 'high' ? 1.3 : (w.id === 'low' ? 0.74 : 1);
    var s = partOpt('susp');
    rig.car.group.position.y = 0.02 + (s.id === 'stiff' ? -0.03 : (s.id === 'soft' ? 0.04 : 0));
  }

  function bindGarageView() {
    var cv = $('garageCanvas'), rig = null, drag = null;
    function R() { return GP.garageRig(); }
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY };
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drag || !R()) return;
      var g = R();
      g.yaw -= (e.clientX - drag.x) * 0.008;
      g.pitch = clamp(g.pitch - (e.clientY - drag.y) * 0.006, -0.55, 1.25);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      cv.addEventListener(ev, function () { drag = null; });
    });
    cv.addEventListener('wheel', function (e) {
      if (!R()) return; e.preventDefault();
      R().dist = clamp(R().dist + e.deltaY * 0.012, 4.5, 20);
    }, { passive: false });
    $('garageLift').addEventListener('input', function () {
      if (R()) R().height = this.value / 100;
    });
    $('garageUnder').addEventListener('click', function () {
      var g = R(); if (!g) return;
      g.height = 1; $('garageLift').value = 100;
      g.pitch = -0.42; g.dist = 8.5;
    });
    $('garageReset').addEventListener('click', function () {
      var g = R(); if (!g) return;
      g.height = 0; $('garageLift').value = 0;
      g.yaw = 0.42; g.pitch = 0.17; g.dist = 13.5;
    });
  }

  /* =================================================================
     GARAGE — car development
     ================================================================= */
  function upgOf() { return { power: 0, aero: 0, tyres: 0, rely: 0 }; }
  function applyUpgrades() {
    if (!G.player) return;
    var u = upgOf(), team = D.team(S.team), f = fitFactors();
    var base = (team.power * 0.55 + team.grip * 0.45);
    G.player.perf = base * (f.power * 0.6 + f.grip * 0.4);
    G.player.gripMul = f.grip;
    G.player.wearMul = f.wear;
    G.player.relyMul = f.rely;
    G.player.upg = u;
    // the fitted rear wing is visibly different on the car
    var w = partOpt('wing');
    if (G.player.mesh && G.player.mesh.rw) {
      G.player.mesh.rw.scale.y = w.id === 'high' ? 1.3 : (w.id === 'low' ? 0.74 : 1);
    }
  }
  function openGarage(fromSetup) {
    S.phase = 'garage';
    S.garageBack = fromSetup ? 'setup' : 'season';
    showScreen('garageScreen');
    renderGarage();
    renderParts();
    var team = D.team(S.team), THREE = window.THREE;
    GP.garageEnter($('garageCanvas'), {
      color: new THREE.Color(team.color).getHex(),
      color2: new THREE.Color(team.color2).getHex(),
      num: G.player ? G.player.num : 32,
      teamName: team.name
    });
    applyGarageCar();
    var rig = GP.garageRig(); if (rig && rig.car) applyCustom(null, rig.car);
    setTimeout(GP.garageResize, 60);
  }
  function renderGarage() {
    var team = D.team(S.team);
    $('garageTeam').textContent = team.name;
    $('garageStripe').style.background = team.color;
    $('garageWhen').textContent = S.garageBack === 'setup'
      ? 'Changes take effect in the next session of this weekend.'
      : 'Changes are fitted for the rest of the season.';
  }


  /* =================================================================
     RESULTS, POINTS, STANDINGS
     ================================================================= */
  function setBands(c) {
    if (!c.mesh || !c.mesh.bands) return;
    var col = parseInt(D.tyre(c.tyre).color.slice(1), 16);
    c.mesh.bands.forEach(function (m) { m.color.setHex(col); });
  }

  function classification() {
    if (S.classFrame === S.frame && S.classCache) return S.classCache;
    S.classFrame = S.frame;
    return (S.classCache = G.cars.slice().sort(function (a, b) {
      if (a.finished && b.finished) return a.finishT - b.finishT;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.retired !== b.retired) return a.retired ? 1 : -1;
      return b.prog - a.prog;
    }));
  }

  function endRace() {
    if (S.phase === 'finished') return;
    S.phase = 'finished';
    var me = G.player;
    sfxFinish(S.finishOrder[0] === me);
    // finish the rest of the field on paper
    // Everyone still running is classified on the time they would actually
    // need to reach the flag: the distance they still owe, at their own pace.
    // (A fixed gap per position used to hand a car 41s adrift a 1.2s deficit.)
    var rows = classification();
    var finishProg = (S.laps + 1) * G.N;
    rows.forEach(function (c) {
      if (c.finished || c.retired) return;
      var owed = Math.max(0, finishProg - c.prog);
      var pace = Math.max(16, Math.abs(c.speed), c.bestLap ? G.N / (c.bestLap / 1000) : 0);
      c.finished = true;
      c.finishT = S.raceT + (owed / pace) * 1000 + c.penalty * 1000;
    });
    rows = classification();
    var fastest = rows.filter(function (c) { return c.bestLap; }).sort(function (a, b) { return a.bestLap - b.bestLap; })[0];
    S.award = PROG.raceEnd({
      profile: S.save.profile, pos: rows.indexOf(me) + 1, field: rows.length, retired: !!me.retired,
      fastest: fastest === me, wet: G.wet > 0.3, night: !!currentTrack().night,
      diffMul: [0.8, 1, 1.25][S.diff] || 1, stops: me.stops || 0
    });
    if (S.mode === 'season') awardPoints(rows);
    persist();
    setTimeout(function () { showPodium(rows); }, 1100);
  }

  // The rostrum: second on the left, winner in the middle on the tall step,
  // third on the right — the order they actually stand in.
  function showPodium(rows) {
    var top = rows.filter(function (c) { return !c.retired; }).slice(0, 3);
    if (top.length < 3) { showResults(rows); return; }
    var me = G.player;
    var order = [{ c: top[1], p: 2 }, { c: top[0], p: 1 }, { c: top[2], p: 3 }];
    var html = '';
    order.forEach(function (o) {
      var c = o.c, col = '#' + c.color.toString(16).padStart(6, '0');
      var gap = o.p === 1 ? fmtTime(c.finishT) : '+' + ((c.finishT - top[0].finishT) / 1000).toFixed(1);
      html += '<div class="pod p' + o.p + (c === me ? ' me' : '') + '">' +
        '<div class="bubble" style="background:' + col + '">' + c.num + '</div>' +
        '<div class="who">' + (c === me ? 'YOU' : c.name) + '</div>' +
        '<div class="team">' + c.teamName + '</div>' +
        '<div class="gap">' + gap + '</div>' +
        '<div class="step"><span class="pos">' + o.p + '</span>' +
        '<span class="pts">' + D.POINTS[o.p - 1] + ' PTS</span></div></div>';
    });
    $('podSteps').innerHTML = html;
    var mine = rows.indexOf(me) + 1;
    $('podTitle').textContent = top[0] === me ? 'You won' : top[0].name;
    $('podSub').textContent = currentTrack().gp + ' · ' + currentTrack().city +
      (me.retired ? ' · you retired' : ' · you finished P' + mine);
    $('podBtn').onclick = function () { GP.podiumExit(); showResults(rows); };
    showScreen('podiumScreen');
    $('hud').classList.remove('show');
    runCeremony(top);
    anthem(top[0] === me);
  }

  // The ceremony: third out first, then second, then the winner, each one
  // named on screen as they take the step.
  function runCeremony(top) {
    var THREE = window.THREE;
    GP.podiumEnter($('podCanvas'), {
      city: currentTrack().city,
      gp: currentTrack().gp,
      teams: D.TEAMS.map(function (t) { return new THREE.Color(t.color).getHex(); }),
      top: [1, 2, 3].map(function (p) {
        var c = top[p - 1];
        return { name: c === G.player ? 'YOU' : c.name, team: c.teamName, color: c.color, color2: c.color2 };
      })
    });
    setTimeout(GP.podiumResize, 60);
    var cap = $('podCaption');
    if (S.capTimers) S.capTimers.forEach(clearTimeout);
    S.capTimers = [];
    function say(at, kicker, text) {
      S.capTimers.push(setTimeout(function () {
        if (S.phase !== 'finished') return;
        cap.innerHTML = '<em>' + kicker + '</em>' + text;
        cap.classList.add('show');
      }, at));
      S.capTimers.push(setTimeout(function () { cap.classList.remove('show'); }, at + 3000));
    }
    var t3 = top[2], t2 = top[1], t1 = top[0];
    var nm = function (c) { return c === G.player ? 'You' : c.name; };
    say(700, 'Third place', nm(t3) + ' · ' + t3.teamName);
    say(4300, 'Second place', nm(t2) + ' · ' + t2.teamName);
    say(7900, 'Winner', nm(t1) + ' · ' + t1.teamName);
    say(12600, 'Champagne', t1 === G.player ? 'This one is yours' : 'The celebrations begin');
  }

  // A short major-key phrase over the podium, warmer than the finish chime.
  function anthem(won) {
    if (!_ac) return;
    var t = _ac.currentTime;
    var notes = won ? [392, 523, 659, 784, 659, 784, 1047] : [349, 440, 523, 659, 587];
    notes.forEach(function (f, i) {
      var at = t + 0.18 + i * 0.34;
      [1, 2].forEach(function (h, hi) {
        var o = _ac.createOscillator(), g2 = _ac.createGain();
        o.type = hi ? 'sine' : 'triangle'; o.frequency.value = f * h;
        g2.gain.setValueAtTime(0.0001, at);
        g2.gain.exponentialRampToValueAtTime(hi ? 0.035 : 0.1, at + 0.05);
        g2.gain.exponentialRampToValueAtTime(0.0001, at + 0.72);
        o.connect(g2).connect(_bus); o.start(at); o.stop(at + 0.78);
      });
    });
  }

  function awardPoints(rows) {
    var sv = S.save;
    var scoring = rows.filter(function (c) { return !c.retired; });
    scoring.forEach(function (c, i) {
      var pts = D.POINTS[i] || 0;
      if (!pts) return;
      sv.dstand[c.name] = (sv.dstand[c.name] || 0) + pts;
      sv.tstand[c.team] = (sv.tstand[c.team] || 0) + pts;
    });
    var fastest = rows.slice().filter(function (c) { return c.bestLap; }).sort(function (a, b) { return a.bestLap - b.bestLap; })[0];
    if (fastest && scoring.indexOf(fastest) < 10) {
      sv.dstand[fastest.name] = (sv.dstand[fastest.name] || 0) + 1;
      sv.tstand[fastest.team] = (sv.tstand[fastest.team] || 0) + 1;
    }
    sv.results.push({
      round: S.trackIdx + 1, track: currentTrack().id,
      top: rows.slice(0, 3).map(function (c) { return c.name; }),
      me: rows.indexOf(G.player) + 1
    });
    sv.round = Math.min(D.CAL.length, S.trackIdx + 1);
    if (sv.round >= D.CAL.length) {
      sv.done = true;
      var lead = Object.keys(sv.dstand).sort(function (a, b) { return sv.dstand[b] - sv.dstand[a]; })[0];
      if (lead === G.player.name && S.award) { var ch = PROG.champion(sv.profile); if (ch) S.award.fresh.push(PROG.byId.champion); }
    }
    persist();
  }

  function standingsRows(kind) {
    var sv = S.save;
    if (kind === 'teams') {
      return D.TEAMS.map(function (t) { return { name: t.name, color: t.color, pts: sv.tstand[t.id] || 0 }; })
        .sort(function (a, b) { return b.pts - a.pts; });
    }
    return D.DRIVERS.map(function (d) {
      var team = D.team(d.t);
      var nm = (d.t === S.team && D.DRIVERS.filter(function (x) { return x.t === d.t; })[1] === d) ? 'YOU' : d.n;
      return { name: nm, team: team.short, color: team.color, pts: sv.dstand[nm] || 0 };
    }).sort(function (a, b) { return b.pts - a.pts; });
  }

  /* =================================================================
     SCREENS
     ================================================================= */
  function showScreen(id) {
    ['menu', 'seasonScreen', 'setupScreen', 'resultScreen', 'standScreen', 'garageScreen', 'podiumScreen'].forEach(function (k) {
      var el = $(k); if (el) el.classList.toggle('show', k === id);
    });
    document.body.classList.toggle('inmenu', !!id);
  }

  function openMenu() {
    S.phase = 'menu'; S.started = false;
    if (typeof window.onGameplayStop === 'function') window.onGameplayStop();
    showScreen('menu');
    $('hud').classList.remove('show');
    var sv = S.save;
    $('contBtn').style.display = (sv.round > 0 && !sv.done) ? 'flex' : 'none';
    $('contSub').textContent = sv.round > 0 ? ('Round ' + (sv.round + 1) + ' · ' + D.CAL[Math.min(sv.round, 24)].city) : '';
    $('profileChip').innerHTML = PROG.chip(sv.profile);
    syncDiff();
  }
  function playerTeam() { return D.team(G.player ? G.player.team : S.team); }
  function applyCustom(car, mesh) {
    var THREE = window.THREE, p = S.save.profile, team = playerTeam();
    mesh = mesh || (car && car.mesh); if (!mesh) return;
    var paint = PROG.resolve(p, 'paint', team.color), trim = PROG.resolve(p, 'trim', team.color2);
    var helmet = PROG.resolve(p, 'helmet', team.color2), rim = PROG.resolve(p, 'rim', '#aeb4bc');
    mesh.paint.color.set(paint); mesh.trim.color.set(trim);
    if (mesh.helmet) mesh.helmet.material.color.set(helmet);
    if (mesh.rim) mesh.rim.color.set(rim);
    var num = p.custom.num || (car && car.num);
    if (mesh.num && num && mesh.num.userData.num !== num) {
      if (mesh.num.map) mesh.num.map.dispose();
      mesh.num.map = GP.numTexture(num); mesh.num.needsUpdate = true; mesh.num.userData.num = num;
    }
    if (car) { car.color = new THREE.Color(paint).getHex(); if (num) car.num = num; }
  }
  function renderCarTab() {
    $('driverCar').innerHTML = PROG.carTab(S.save.profile, playerTeam());
    $('driverCar').querySelectorAll('.sw').forEach(function (b) {
      b.addEventListener('click', function () {
        if (PROG.setCustom(S.save.profile, b.dataset.cat, b.dataset.id)) { persist(); applyCustom(G.player); renderCarTab(); }
      });
    });
    var inp = $('carNum');
    if (inp) inp.addEventListener('change', function () { PROG.setCustom(S.save.profile, 'num', inp.value); persist(); applyCustom(G.player); renderCarTab(); });
  }
  function openDriver(tab) {
    var p = S.save.profile;
    $('driverChip').innerHTML = PROG.chip(p);
    $('driverStats').innerHTML = PROG.stats(p);
    $('driverAch').innerHTML = PROG.achievements(p);
    if (typeof renderCarTab === 'function') renderCarTab();
    driverTab(tab || 'progress');
    $('driverScreen').classList.add('show');
  }
  function driverTab(tab) {
    $('driverScreen').querySelectorAll('.dtabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    $('driverScreen').querySelectorAll('.dtab').forEach(function (d) { d.style.display = d.id === 'dtab-' + tab ? 'block' : 'none'; });
  }

  function openSeason() {
    S.mode = 'season';
    S.phase = 'season';
    showScreen('seasonScreen');
    renderCalendar();
    renderStandings('drivers');
  }

  function renderCalendar() {
    var sv = S.save, html = '';
    D.CAL.forEach(function (t, i) {
      var done = i < sv.round;
      var next = i === sv.round;
      var res = sv.results.filter(function (r) { return r.round === i + 1; })[0];
      html += '<button class="calrow' + (done ? ' done' : '') + (next ? ' next' : '') + '" data-i="' + i + '">' +
        '<span class="rnd">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="cname">' + t.city + '<em>' + t.gp + '</em></span>' +
        '<span class="tags">' + (t.night ? '<i class="tag night">NIGHT</i>' : '') +
        (t.rain > 0.3 ? '<i class="tag wet">WET RISK</i>' : '') + '<i class="tag">' + t.laps + ' LAPS</i></span>' +
        '<span class="res">' + (res ? 'P' + res.me : (next ? 'NEXT' : '')) + '</span></button>';
    });
    $('calList').innerHTML = html;
    $('calList').querySelectorAll('.calrow').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = parseInt(b.dataset.i, 10);
        if (i > S.save.round) { flash('Win the earlier rounds first', 'warn', 1.8); return; }
        openSetup(i);
      });
    });
    $('seasonTitle').textContent = 'Season ' + sv.year;
    var me = standingsRows('drivers').map(function (r) { return r.name; }).indexOf('YOU') + 1;
    $('seasonSub').textContent = 'Round ' + Math.min(sv.round + 1, 25) + ' of 25 · ' + D.team(S.team).name + ' · championship P' + me;
    $('garageBtn').textContent = 'Garage';
  }

  function renderStandings(kind) {
    var rows = standingsRows(kind), html = '';
    rows.forEach(function (r, i) {
      html += '<div class="strow' + (r.name === 'YOU' ? ' me' : '') + '"><span class="p">' + (i + 1) + '</span>' +
        '<i class="dot" style="background:' + r.color + '"></i>' +
        '<span class="n">' + r.name + '</span>' +
        '<span class="tm">' + (r.team || '') + '</span>' +
        '<span class="pt">' + r.pts + '</span></div>';
    });
    $('standList').innerHTML = html;
    $('stTabD').classList.toggle('on', kind === 'drivers');
    $('stTabT').classList.toggle('on', kind === 'teams');
  }

  function openSetup(i) {
    S.trackIdx = i;
    S.phase = 'setup';
    var def = D.CAL[i];
    setWeather(def);
    showScreen('setupScreen');
    $('setupRound').textContent = 'Round ' + (i + 1);
    $('setupCity').textContent = def.city;
    $('setupGp').textContent = def.gp;
    $('setupMeta').innerHTML =
      '<span><em>Laps</em>' + def.laps + '</span>' +
      '<span><em>Session</em>' + (def.night ? 'Night' : 'Day') + '</span>' +
      '<span><em>Forecast</em>' + (CONDS[S.cond] || CONDS.sunny).name + '</span>' +
      '<span><em>Pit lane</em>' + Math.round(GP.PIT_LIMIT * GP.KMH) + ' km/h</span>';
    drawSetupMap(def);
    // start tyre
    var wrap = $('setupTyres'); wrap.innerHTML = '';
    D.TYRES.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'tbtn'; b.dataset.t = t.id;
      b.innerHTML = '<i style="background:' + t.color + '"></i>' + t.label;
      b.addEventListener('click', function () {
        S.startTyre = t.id;
        wrap.querySelectorAll('.tbtn').forEach(function (o) { o.classList.toggle('on', o.dataset.t === t.id); });
      });
      wrap.appendChild(b);
    });
    S.startTyre = G.wet > 0.5 ? (G.wet > 0.75 ? 'W' : 'I') : 'M';
    wrap.querySelectorAll('.tbtn').forEach(function (o) { o.classList.toggle('on', o.dataset.t === S.startTyre); });
  }

  function goSession(withQuali) {
    var def = currentTrack();
    unlockAudio();
    if (typeof window.onGameplayStart === 'function') window.onGameplayStart();
    loadTrack(def);
    $('hud').classList.add('show');
    S.practice = 0;
    if (withQuali === 'p1') startQuali(1);
    else if (withQuali === 'p2') startQuali(2);
    else if (withQuali) startQuali(0);
    else {
      S.grid = null;
      // grid by championship order, player mid-pack
      var rows = standingsRows('drivers');
      var order = G.cars.slice().sort(function (a, b) {
        return (rows.map(function (r) { return r.name; }).indexOf(a.name)) - (rows.map(function (r) { return r.name; }).indexOf(b.name));
      });
      S.grid = order;
      startRace();
      G.player.tyre = S.startTyre || 'M';
    }
  }

  function showPracticeResult(num) {
    var me = G.player;
    var order = G.cars.slice().sort(function (a, b) { return (a.bestLap || 9e9) - (b.bestLap || 9e9); });
    var html = '<h3>Practice ' + num + ' — timesheet</h3><div class="qlist">';
    order.slice(0, 10).forEach(function (c, i) {
      html += '<div class="qrow' + (c === me ? ' me' : '') + '"><span class="p">' + (i + 1) + '</span>' +
        '<i class="dot" style="background:#' + c.color.toString(16).padStart(6, '0') + '"></i>' +
        '<span class="n">' + c.name + '</span><span class="tm">' + c.teamShort + '</span>' +
        '<span class="t">' + (c.bestLap ? fmtTime(c.bestLap) : 'no time') + '</span></div>';
    });
    html += '</div>';
    $('resultBody').innerHTML = html;
    $('resultTitle').textContent = 'Practice ' + num + ' complete';
    $('resultSub').textContent = currentTrack().gp + ' · your best ' + fmtTime(me.bestLap) +
      ' · the car can be changed in the garage before the next session';
    $('resultBtn').textContent = 'Back to the weekend';
    $('resultBtn').onclick = function () { openSetup(S.trackIdx); };
    $('resultAlt').textContent = 'Garage';
    $('resultAlt').onclick = function () { openGarage(true); };
    showScreen('resultScreen');
    $('hud').classList.remove('show');
  }

  function showQualiResult(order) {
    var html = '<h3>Qualifying</h3><div class="qlist">';
    order.forEach(function (c, i) {
      var gap = (i && order[0].bestLap && c.bestLap) ? '+' + ((c.bestLap - order[0].bestLap) / 1000).toFixed(3) : (c.bestLap ? fmtTime(c.bestLap) : 'no time');
      html += '<div class="qrow' + (c === G.player ? ' me' : '') + '"><span class="p">' + (i + 1) + '</span>' +
        '<i class="dot" style="background:#' + c.color.toString(16).padStart(6, '0') + '"></i>' +
        '<span class="n">' + c.name + '</span><span class="tm">' + c.teamShort + '</span>' +
        '<span class="t">' + gap + '</span></div>';
    });
    html += '</div>';
    $('resultBody').innerHTML = html;
    $('resultTitle').textContent = 'P' + (order.indexOf(G.player) + 1) + ' on the grid';
    $('resultSub').textContent = currentTrack().gp + ' · best lap ' + fmtTime(G.player.bestLap);
    $('resultBtn').textContent = 'Start race';
    $('resultBtn').onclick = function () { showScreen(null); startRace(); G.player.tyre = S.startTyre || 'M'; };
    $('resultAlt').textContent = 'Back to season';
    $('resultAlt').onclick = function () { openSeason(); };
    showScreen('resultScreen');
    $('hud').classList.remove('show');
  }

  function showResults(rows) {
    var me = G.player, pos = rows.indexOf(me) + 1;
    var html = '<div class="qlist">';
    rows.forEach(function (c, i) {
      var t = c.retired ? 'DNF' : (i === 0 ? fmtTime(c.finishT) : '+' + ((c.finishT - rows[0].finishT) / 1000).toFixed(1));
      var pen = (c.penalty || 0) + (c.penServed || 0);
      if (pen && !c.retired) t += ' <em class="pen">+' + pen + 's</em>';
      var pts = (!c.retired && D.POINTS[i]) ? D.POINTS[i] : 0;
      html += '<div class="qrow' + (c === me ? ' me' : '') + (c.retired ? ' dnf' : '') + '"><span class="p">' + (c.retired ? '—' : i + 1) + '</span>' +
        '<i class="dot" style="background:#' + c.color.toString(16).padStart(6, '0') + '"></i>' +
        '<span class="n">' + c.name + '</span><span class="tm">' + c.teamShort + '</span>' +
        '<span class="t">' + t + '</span><span class="pts">' + (pts ? '+' + pts : '') + '</span></div>';
    });
    html += '</div>';
    $('resultBody').innerHTML = (S.award ? PROG.awardCard(S.award) : '') + html;
    $('resultTitle').textContent = me.retired ? 'Retired' : (pos === 1 ? 'Race win' : (pos <= 3 ? 'Podium · P' + pos : 'P' + pos));
    $('resultSub').textContent = currentTrack().gp + ' · best lap ' + fmtTime(me.bestLap) +
      ' · ' + me.stops + (me.stops === 1 ? ' stop' : ' stops') + (me.penalty ? ' · +' + me.penalty + 's penalty' : '');
    if (S.mode === 'season') {
      $('resultBtn').textContent = S.save.done ? 'Season finished' : 'Next round';
      $('resultBtn').onclick = function () { adBreak(); openSeason(); };
      $('resultAlt').textContent = 'Standings';
      $('resultAlt').onclick = function () { openSeason(); setTimeout(function () { renderStandings('drivers'); }, 0); };
    } else {
      $('resultBtn').textContent = 'Race again';
      $('resultBtn').onclick = function () { adBreak(); showScreen(null); startRace(); };
      $('resultAlt').textContent = 'Menu';
      $('resultAlt').onclick = openMenu;
    }
    showScreen('resultScreen');
    $('hud').classList.remove('show');
  }

  /* =================================================================
     HUD
     ================================================================= */
  function hudMode(m) {
    $('hud').classList.toggle('quali', m === 'quali');
    $('hud').classList.add('show');
  }

  function updateHUD() {
    var me = G.player; if (!me) return;
    var rows = classification();
    me.rank = rows.indexOf(me) + 1;
    $('posNum').textContent = me.rank;
    $('posOf').textContent = '/' + G.cars.length;
    $('lapNum').textContent = clamp(Math.max(1, me.lap), 1, S.laps);
    $('lapOf').textContent = '/' + S.laps;
    $('lapTime').textContent = (S.phase === 'race' || S.phase === 'quali') && me.lapStart >= 0 ?
      fmtTime(S.raceT - me.lapStart) : fmtTime(me.lastLap);
    $('bestTime').textContent = fmtTime(me.bestLap);
    var kmh = Math.round(Math.max(0, me.speed) * GP.KMH);
    $('speedVal').textContent = kmh;
    var g = 1; for (var i = 1; i < GP.GEARS.length; i++) if (me.speed >= GP.GEARS[i]) g = i + 1;
    $('gearVal').textContent = me.speed < 0.5 ? 'N' : Math.min(7, g);
    var revLo = GP.GEARS[Math.max(0, Math.min(6, g - 1))], revHi = GP.GEARS[Math.min(6, g)] || 70;
    $('revFill').style.width = clamp((me.speed - revLo) / Math.max(1, revHi - revLo) * 100, 0, 100) + '%';

    // tyre + fuel
    var ty = D.tyre(me.tyre);
    $('tyreDot').style.background = ty.color;
    $('tyreLab').textContent = ty.label;
    $('tyreBar').style.width = Math.round(me.tw * 100) + '%';
    $('tyreBar').className = 'bar' + (me.tw < 0.25 ? ' crit' : me.tw < 0.5 ? ' warn' : '');
    $('fuelBar').style.width = Math.round(me.fuel * 100) + '%';
    $('boostBar').style.width = Math.round(me.boost / GP.BOOST_MAX * 100) + '%';
    $('boostWrap').classList.toggle('active', !!(S.input.boost && me.boost > 0));
    var drsEl = $('drsPill');
    drsEl.className = 'pill drs' + (me.drs ? ' open' : (me.drsAllowed ? ' ready' : ''));
    drsEl.textContent = me.drs ? 'DRS OPEN' : (me.drsAllowed ? 'DRS READY' : 'DRS');
    $('penPill').classList.toggle('show', me.penalty > 0);
    $('penPill').textContent = '+' + me.penalty + 's PENALTY';
    $('dmgWrap').classList.toggle('show', me.dmg > 0.12);
    $('dmgBar').style.width = Math.round(me.dmg * 100) + '%';

    // tower: six around the player
    var start = clamp(me.rank - 4, 0, Math.max(0, rows.length - 7));
    var html = '';
    for (i = start; i < Math.min(rows.length, start + 7); i++) {
      var c = rows[i];
      var gap = '';
      if (i > 0 && !c.retired) {
        var ahead = rows[i - 1];
        var d = (ahead.prog - c.prog);
        gap = c.finished ? '' : (d > G.N ? '+' + Math.floor(d / G.N) + 'L' : '+' + (d / Math.max(12, Math.abs(c.speed) || 30)).toFixed(1));
      }
      html += '<div class="trow' + (c === me ? ' me' : '') + (c.retired ? ' out' : '') + '">' +
        '<span class="p">' + (i + 1) + '</span><i class="bar" style="background:#' + c.color.toString(16).padStart(6, '0') + '"></i>' +
        '<span class="n">' + (c === me ? 'YOU' : c.tag) + '</span>' +
        '<span class="g">' + (c.retired ? 'DNF' : (c.inPit ? 'PIT' : gap)) + '</span></div>';
    }
    if (html !== S.towerHTML) { S.towerHTML = html; $('tower').innerHTML = html; }

    // session clock
    if (S.phase === 'quali') {
      $('clock').textContent = Math.max(0, Math.ceil(S.sessionT)) + 's';
      $('clockLab').textContent = S.practice ? ('PRACTICE ' + S.practice) : 'QUALI';
    } else {
      $('clock').textContent = fmtTime(S.raceT).slice(0, -4);
      $('clockLab').textContent = S.red > 0 ? 'RED' : (S.safety > 0 ? 'SC' : (S.practice ? 'PRACTICE' : 'RACE'));
    }
    $('flagSC').classList.toggle('show', S.safety > 0);
    $('flagRed').classList.toggle('show', S.red > 0);
    if (S.red > 0) $('flagRed').textContent = 'RED FLAG · BOX · ' + Math.ceil(S.red) + 's';
    $('flagY').classList.toggle('show', S.yellow.some(function (v) { return v > 0; }));
    $('wetTag').classList.toggle('show', S.cond && S.cond !== 'sunny');
    $('wetTag').textContent = ((CONDS[S.cond] || CONDS.sunny).name).toUpperCase();
  }

  function showSector(i, t, best) {
    var el = $('sectors').children[i];
    if (!el) return;
    el.textContent = (t / 1000).toFixed(3);
    el.className = 'sec ' + (best ? 'best' : 'ok');
    setTimeout(function () { el.className = 'sec'; }, 4000);
  }

  function flash(text, cls, secs) {
    var f = $('flash');
    f.textContent = text; f.className = 'flash' + (cls ? ' ' + cls : '');
    if (secs > 0) { f.classList.add('show'); S.flashT = secs; } else f.classList.remove('show');
  }

  /* ---- minimap ----------------------------------------------------- */
  var MM = { s: 1, ox: 0, oy: 0, base: null };
  function drawMiniBase() {
    var cv = $('minimap'); if (!cv) return;
    var W = cv.width, H = cv.height;
    var minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    G.samples.forEach(function (s) {
      minx = Math.min(minx, s.x); maxx = Math.max(maxx, s.x);
      minz = Math.min(minz, s.z); maxz = Math.max(maxz, s.z);
    });
    var pad = 16, sc = Math.min((W - pad * 2) / (maxx - minx), (H - pad * 2) / (maxz - minz));
    MM.s = sc; MM.ox = W / 2 - (minx + maxx) / 2 * sc; MM.oy = H / 2 - (minz + maxz) / 2 * sc;
    var b = document.createElement('canvas'); b.width = W; b.height = H;
    var x = b.getContext('2d'); x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath();
    G.samples.forEach(function (s, i) {
      var px = s.x * sc + MM.ox, py = s.z * sc + MM.oy; i ? x.lineTo(px, py) : x.moveTo(px, py);
    });
    x.closePath();
    x.lineWidth = 9; x.strokeStyle = 'rgba(32,30,29,.35)'; x.stroke();
    x.lineWidth = 6; x.strokeStyle = '#e8ddc8'; x.stroke();
    var s0 = G.samples[0];
    x.fillStyle = '#c67139'; x.fillRect(s0.x * sc + MM.ox - 3, s0.z * sc + MM.oy - 3, 6, 6);
    MM.base = b;
  }
  function drawMini() {
    var cv = $('minimap'); if (!cv || !MM.base) return;
    var x = cv.getContext('2d');
    x.clearRect(0, 0, cv.width, cv.height);
    x.drawImage(MM.base, 0, 0);
    G.cars.forEach(function (c) {
      if (c.retired) return;
      var px = c.x * MM.s + MM.ox, py = c.z * MM.s + MM.oy, me = c === G.player;
      x.beginPath(); x.arc(px, py, me ? 5 : 3.4, 0, Math.PI * 2);
      x.fillStyle = '#' + c.color.toString(16).padStart(6, '0'); x.fill();
      if (me) { x.lineWidth = 2; x.strokeStyle = '#fff'; x.stroke(); }
    });
  }
  function drawSetupMap(def) {
    var cv = $('setupMap'); if (!cv) return;
    var x = cv.getContext('2d'), W = cv.width, H = cv.height;
    x.clearRect(0, 0, W, H);
    var pts = [], M = def.ctrl.length;
    for (var i = 0; i < M * 12; i++) {
      var t = i / 12, i0 = Math.floor(t) % M, f = t - Math.floor(t);
      var p0 = def.ctrl[(i0 - 1 + M) % M], p1 = def.ctrl[i0], p2 = def.ctrl[(i0 + 1) % M], p3 = def.ctrl[(i0 + 2) % M];
      var t2 = f * f, t3 = t2 * f;
      pts.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * f + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * f + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ]);
    }
    var minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    pts.forEach(function (p) {
      minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]);
      minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]);
    });
    var pad = 22, sc = Math.min((W - pad * 2) / (maxx - minx), (H - pad * 2) / (maxz - minz));
    var ox = W / 2 - (minx + maxx) / 2 * sc, oy = H / 2 - (minz + maxz) / 2 * sc;
    x.beginPath();
    pts.forEach(function (p, i) { var px = p[0] * sc + ox, py = p[1] * sc + oy; i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.closePath();
    x.lineWidth = 13; x.strokeStyle = 'rgba(32,30,29,.12)'; x.stroke();
    x.lineWidth = 9; x.strokeStyle = '#201e1d'; x.stroke();
    x.lineWidth = 2; x.strokeStyle = '#c67139'; x.setLineDash([5, 7]); x.stroke(); x.setLineDash([]);
    var p0b = pts[0];
    x.fillStyle = '#c67139'; x.beginPath(); x.arc(p0b[0] * sc + ox, p0b[1] * sc + oy, 5, 0, Math.PI * 2); x.fill();
  }

  /* =================================================================
     AUDIO
     ================================================================= */
  var _ac = null, _master, _bus, _engG, _engBP, _engLP, _parts = null, _detune,
      _turbo, _turboG, _scr, _scrG, _crowd, _crowdG, _wind, _windG, _noiseBuf;
  var _vol = 0.55, _muted = false;
  function unlockAudio() {
    if (_ac) { if (_ac.state === 'suspended') _ac.resume(); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext; _ac = new AC();
      _master = _ac.createGain(); _master.gain.value = _muted ? 0.0001 : _vol; _master.connect(_ac.destination);

      var comp = _ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 24; comp.ratio.value = 7;
      comp.attack.value = 0.004; comp.release.value = 0.16;
      comp.connect(_master);
      _bus = comp;

      /* --- power unit -------------------------------------------------
         A V6 sings mostly on the firing order's harmonics, so the engine is
         an additive stack: a sawtooth fundamental, a pair of odd harmonics
         that give the hard edge, and a high sine that carries the scream.
         A resonant band-pass swept by throttle and revs is what makes it
         howl on the way up instead of just droning. */
      _engG = _ac.createGain(); _engG.gain.value = 0;
      var bp = _ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.1;
      var lp = _ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = 0.6;
      var hp = _ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;
      _engBP = bp; _engLP = lp;
      hp.connect(bp).connect(lp).connect(_engG).connect(comp);

      _parts = [];
      [[1.0, 'sawtooth', 0.34], [1.5, 'square', 0.11], [2.0, 'sawtooth', 0.20],
       [3.0, 'sine', 0.14], [4.5, 'sine', 0.07], [6.0, 'sine', 0.05]].forEach(function (p) {
        var o = _ac.createOscillator(); o.type = p[1]; o.frequency.value = 70 * p[0];
        var gg = _ac.createGain(); gg.gain.value = p[2];
        o.connect(gg).connect(hp); o.start();
        _parts.push({ o: o, g: gg, mult: p[0], base: p[2] });
      });
      /* slight detune between banks so the note beats like a real engine */
      _detune = _ac.createOscillator(); _detune.type = 'sawtooth'; _detune.frequency.value = 70;
      var dg = _ac.createGain(); dg.gain.value = 0.09;
      _detune.detune.value = 14; _detune.connect(dg).connect(hp); _detune.start();

      /* turbo: a pure tone an octave and a half up, only audible on load */
      _turbo = _ac.createOscillator(); _turbo.type = 'sine'; _turbo.frequency.value = 2400;
      _turboG = _ac.createGain(); _turboG.gain.value = 0;
      var tf = _ac.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 3400; tf.Q.value = 6;
      _turbo.connect(tf).connect(_turboG).connect(comp); _turbo.start();

      /* noise bed reused for tyres, wind, crowd and the blow-off valve */
      var len = _ac.sampleRate * 2, buf = _ac.createBuffer(1, len, _ac.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      _noiseBuf = buf;

      _scr = _ac.createBufferSource(); _scr.buffer = buf; _scr.loop = true;
      var sf = _ac.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 2100; sf.Q.value = 2.4;
      _scrG = _ac.createGain(); _scrG.gain.value = 0;
      _scr.connect(sf).connect(_scrG).connect(comp); _scr.start();

      _wind = _ac.createBufferSource(); _wind.buffer = buf; _wind.loop = true;
      var wf = _ac.createBiquadFilter(); wf.type = 'highpass'; wf.frequency.value = 1100;
      _windG = _ac.createGain(); _windG.gain.value = 0;
      _wind.connect(wf).connect(_windG).connect(comp); _wind.start();

      _crowd = _ac.createBufferSource(); _crowd.buffer = buf; _crowd.loop = true;
      var cf = _ac.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 560; cf.Q.value = 0.6;
      _crowdG = _ac.createGain(); _crowdG.gain.value = 0;
      _crowd.connect(cf).connect(_crowdG).connect(comp); _crowd.start();
    } catch (e) { _ac = null; }
  }

  var _lastGear = 1, _shiftCut = 0, _lastThrottle = false;

  function audioTick(dt) {
    if (!_ac || !_parts) return;
    var me = G.player; if (!me) return;
    var t = _ac.currentTime;
    var s = Math.max(0, me.speed), g = 1;
    for (var i = 1; i < GP.GEARS.length; i++) if (s >= GP.GEARS[i]) g = i;
    var lo = GP.GEARS[g - 1] || 0, hi = GP.GEARS[g] || 70;
    var rev = clamp((s - lo) / Math.max(1, hi - lo), 0, 1);
    var racing = S.phase === 'race' || S.phase === 'quali' || S.phase === 'grid';
    var throttle = !!(S.input.gas && racing && !me.pitPhase);

    // gear change: cut the note for a moment, blip on the way down
    if (g !== _lastGear) {
      if (g > _lastGear) _shiftCut = 0.055; else { _shiftCut = 0.03; blip(); }
      _lastGear = g;
    }
    if (_shiftCut > 0) _shiftCut -= dt;

    // idle floor so the engine never drops to nothing
    var idleRev = racing ? 0.16 : 0.10;
    var revNorm = Math.max(throttle ? 0.2 : idleRev, rev);
    var f = 62 + revNorm * 172 + g * 7;
    if (me.pitPhase === 1) f = 74;
    _parts.forEach(function (p) {
      p.o.frequency.setTargetAtTime(f * p.mult, t, 0.035);
    });
    _detune.frequency.setTargetAtTime(f, t, 0.035);

    _engBP.frequency.setTargetAtTime(360 + revNorm * 2500 + (throttle ? 500 : 0), t, 0.05);
    _engBP.Q.setTargetAtTime(0.9 + revNorm * 2.6, t, 0.1);
    _engLP.frequency.setTargetAtTime(1700 + revNorm * 6200 + (throttle ? 1400 : 0), t, 0.06);

    var load = throttle ? 1 : 0.34;
    var vol = (racing ? 0.30 : 0.13) * load * (_shiftCut > 0 ? 0.18 : 1) * (S.phase === 'finished' ? 0.6 : 1);
    if (G.camMode === 1) vol *= 1.22;                 // louder in the cockpit
    if (me.retired) vol = 0;
    _engG.gain.setTargetAtTime(vol, t, _shiftCut > 0 ? 0.012 : 0.07);

    // turbo whistle rises with revs under power; blow-off on lift
    _turbo.frequency.setTargetAtTime(1500 + revNorm * 2600 + g * 90, t, 0.09);
    _turboG.gain.setTargetAtTime(throttle && racing ? 0.028 + revNorm * 0.045 : 0.0, t, 0.14);
    if (_lastThrottle && !throttle && s > 26) blowOff();
    _lastThrottle = throttle;

    // tyre scrub and wind
    var scr = (me.slip > 0.12 && s > 12 && !me.onGrass) ? clamp((me.slip - 0.12) * 3.2, 0, 1) * 0.22 : 0;
    if (me.onGrass && s > 10) scr = 0.13;
    if (S.input.brake && s > 30 && me.slip > 0.05) scr = Math.max(scr, 0.09);
    _scrG.gain.setTargetAtTime(racing ? scr : 0, t, 0.05);
    _windG.gain.setTargetAtTime(racing ? clamp(s / 66, 0, 1) * 0.055 : 0, t, 0.2);
    _crowdG.gain.setTargetAtTime(racing ? 0.03 + (G.wet > 0.2 ? 0.045 : 0) : 0.012, t, 0.4);
  }

  function blip() {
    if (!_ac) return;
    var t = _ac.currentTime, o = _ac.createOscillator(), g2 = _ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(130, t + 0.13);
    var f = _ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 2;
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.11, t + 0.012);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(f).connect(g2).connect(_bus); o.start(t); o.stop(t + 0.18);
  }
  function blowOff() {
    if (!_ac || !_noiseBuf) return;
    var t = _ac.currentTime, s = _ac.createBufferSource(); s.buffer = _noiseBuf;
    var f = _ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3800; f.Q.value = 1.6;
    var g2 = _ac.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.05, t + 0.015);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    s.connect(f).connect(g2).connect(_bus); s.start(t); s.stop(t + 0.3);
  }

  function beep(go) {
    if (!_ac) return;
    var t = _ac.currentTime, o = _ac.createOscillator(), g = _ac.createGain();
    o.type = 'square'; o.frequency.value = go ? 880 : 420;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (go ? 0.6 : 0.18));
    o.connect(g).connect(_bus); o.start(t); o.stop(t + (go ? 0.65 : 0.2));
  }
  function sfxHit(lvl) {
    if (!_ac) return;
    var t = _ac.currentTime, len = _ac.sampleRate * 0.3;
    var b = _ac.createBuffer(1, len, _ac.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    var s = _ac.createBufferSource(); s.buffer = b;
    var f = _ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 760;
    var g = _ac.createGain(); g.gain.value = 0.14 + 0.5 * lvl;
    s.connect(f).connect(g).connect(_bus); s.start(t);
  }
  function sfxFinish(win) {
    if (!_ac) return;
    var t = _ac.currentTime;
    (win ? [523, 659, 784, 1047] : [392, 494, 587]).forEach(function (f, i) {
      var o = _ac.createOscillator(), g = _ac.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.13);
      g.gain.exponentialRampToValueAtTime(0.26, t + i * 0.13 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.13 + 0.9);
      o.connect(g).connect(_bus); o.start(t + i * 0.13); o.stop(t + i * 0.13 + 1);
    });
  }
  function setVolume(v) {
    _vol = clamp(v, 0, 1);
    S.save.vol = _vol; persist();
    var lab = $('volVal'); if (lab) lab.textContent = Math.round(_vol * 100) + '%';
    if (_vol <= 0) { if (!_muted) setMuted(true); return; }
    if (_muted) setMuted(false);
    else if (_master) _master.gain.setTargetAtTime(_vol, _ac.currentTime, 0.05);
  }
  function setMuted(m) {
    _muted = m; S.save.muted = m; persist();
    var b = $('soundBtn'); if (b) b.classList.toggle('off', m);
    if (_master) _master.gain.setTargetAtTime(m ? 0.0001 : Math.max(0.0001, _vol), _ac.currentTime, 0.05);
  }

  /* =================================================================
     INPUT
     ================================================================= */
  function readInput() {
    var k = S.keys, t = S.touch, I = S.input, steer = 0;
    if (k.ArrowLeft || k.KeyA || t.l) steer -= 1;
    if (k.ArrowRight || k.KeyD || t.r) steer += 1;
    I.steer = steer;
    I.gas = !!(k.ArrowUp || k.KeyW || t.g);
    I.brake = !!(k.ArrowDown || k.KeyS || t.b);
    I.hand = !!k.Space;
    I.boost = !!(k.ShiftLeft || k.ShiftRight || t.boost);
    I.drs = !!(k.KeyE || k.Enter || t.drs);
  }
  function bindTouch(id, key) {
    var el = $(id); if (!el) return;
    var on = function (e) { e.preventDefault(); unlockAudio(); S.touch[key] = true; el.classList.add('down'); };
    var off = function (e) { e.preventDefault(); S.touch[key] = false; el.classList.remove('down'); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
  }

  /* =================================================================
     LOOP
     ================================================================= */
  var IDLE = { steer: 0, gas: false, brake: false, hand: true, boost: false };
  function loop(t) {
    S.raf = requestAnimationFrame(loop);
    var vp = GP.viewportSize();
    if (vp[0] !== G._vw || vp[1] !== G._vh) GP.onResize();
    S.tick = performance.now();
    S.frame++;
    var dt = (t - S.last) / 1000; S.last = t;
    // Adaptive resolution: a rolling average of frame time decides how many
    // pixels we can afford. Dropping the scale is invisible next to a stutter.
    S.ftAvg += ((dt * 1000) - S.ftAvg) * 0.08;
    S.scaleAcc += dt;
    if (S.scaleAcc > 0.6 && S.started) {
      S.scaleAcc = 0;
      var before = S.scaleAdj;
      if (S.ftAvg > 21 && S.scaleAdj > 0.62) S.scaleAdj -= 0.12;
      else if (S.ftAvg < 13.5 && S.scaleAdj < 1) S.scaleAdj = Math.min(1, S.scaleAdj + 0.06);
      if (S.scaleAdj !== before) GP.applyRenderScale(S.scaleAdj);
    }
    if (!(dt > 0)) dt = 0.016; dt = Math.min(dt, 0.05);

    readInput();
    if (S.phase === 'grid') stepLights(dt);
    var racing = S.phase === 'race' || S.phase === 'finished' || S.phase === 'quali';
    if (racing) S.raceT += dt * 1000;
    if (S.phase === 'quali') {
      S.sessionT -= dt;
      if (S.sessionT <= 0) { qualiOver(); }
    }
    // weather drift
    if (racing && currentTrack()) {
      var def = currentTrack();
      S.rainT += dt;
      if (S.rainT > 20 && Math.random() < dt * 0.014 && def.rain > 0.08) {
        var chain = ['sunny', 'cloudy', 'overcast', 'drizzle', 'storm'];
        if (S.cond === 'snow') chain = ['snow', 'overcast', 'cloudy'];
        var at = Math.max(0, chain.indexOf(S.cond));
        var next = chain[clamp(at + (Math.random() < 0.5 ? -1 : 1), 0, chain.length - 1)];
        if (next !== S.cond) {
          var wasWet = G.wet;
          applyCondition(next);
          S.rainTarget = G.wet; G.wet = wasWet;   // let the surface change gradually
          flash(CONDS[next].name.toUpperCase(), 'warn', 2.4);
        }
        S.rainT = 0;
      }
      if (Math.abs(G.wet - S.rainTarget) > 0.005) {
        G.wet += (S.rainTarget - G.wet) * Math.min(1, dt * 0.06);
        GP.applyWet();
        document.body.classList.toggle('rain', G.wet > 0.15);
      }
    }
    if (G.player && S.started) {
      var kmh = Math.max(0, G.player.speed) * GP.KMH, fxEl = $('speedFx');
      var v = clamp((kmh - 190) / 140, 0, 1) * (G.camMode === 3 ? 0 : 1);
      if (fxEl) { var op = (v * 0.55).toFixed(2); if (fxEl.style.opacity !== op) fxEl.style.opacity = op; }
      if (v > 0.35 && (G.shake || 0) < 0.03) G.shake = 0.03 * v;
    }
    if (S.penCd > 0) S.penCd -= dt;
    G.cars.forEach(function (c) { if (c.penCd > 0) c.penCd -= dt; });
    redTick(dt);
    if (S.phase === 'race' && G.player && !G.player.retired && !G.player.finished) {
      S.relCd = (S.relCd || 40) - dt;
      if (S.relCd <= 0) {
        S.relCd = 30 + Math.random() * 70;
        var u = S.save.upg || {}, guard = 1 - (u.rely || 0) * 0.16;
        if (Math.random() < 0.006 * D.DIFFS[S.diff].mist * guard * (1 + G.player.dmg)) {
          G.player.dmg = Math.min(1, G.player.dmg + 0.32);
          radio('We have a problem with the car. Watch the temperatures.', 'urgent', true);
        }
      }
    }
    if (S.safety > 0) { S.safety -= dt; if (S.safety <= 0) { document.body.classList.remove('sc'); flash('TRACK CLEAR', 'accent', 1.6); } }
    for (var y = 0; y < 3; y++) if (S.yellow[y] > 0) S.yellow[y] -= dt;

    var ctx = {
      phase: S.phase, t: S.raceT, dt: dt, safety: S.safety > 0,
      aiScale: D.DIFFS[S.diff].ai, mist: D.DIFFS[S.diff].mist,
      yellow: S.yellow, red: S.red
    };
    var sub = 2, h = dt / sub;
    for (var k = 0; k < sub; k++) {
      for (var i = 0; i < G.cars.length; i++) {
        var c = G.cars[i];
        if (c.retired) continue;
        var inp;
        if (c.ai) {
          if (racing) { aiPitService(c, h); inp = c.pitPhase === 1 ? IDLE : GP.aiInput(c, ctx); }
          else inp = IDLE;
        } else {
          if (c.pitPhase === 1 || c.pitPhase === 0.5) inp = IDLE;
          else if (S.phase === 'race' || S.phase === 'quali') inp = c.finished ? { steer: S.input.steer, gas: false, brake: true, hand: false } : S.input;
          else inp = IDLE;
        }
        // yellow flag / safety car cap for the player
        // behind the safety car the whole field is slow; a local yellow only
      // asks for a lift in that one sector, never a full stop
      if (!c.ai) {
        var capU = ctx.safety ? GP.CAPS.sc : (S.red > 0 ? GP.CAPS.red : (S.yellow[c.sector] > 0 ? GP.CAPS.yellow : 0));
        if (capU && c.speed > capU) inp = { steer: inp.steer, gas: false, brake: c.speed > capU + 6, hand: false, drs: false };
      }
        c.boosting = !c.ai ? (S.input.boost && c.boost > 0) : (c.slipstream > 0.5 && c.boost > 0 && c.agg > 0.6);
        GP.stepCar(c, inp, h);
      }
      GP.collisions();
    }
    GP.fxTick(dt);
    if (S.phase === 'race' && G.player && !G.player.finished) {
      var fresh = PROG.tick({ me: G.player, cars: G.cars, profile: S.save.profile });
      if (fresh) achToast(fresh);
    }
    if (S.phase === 'race' || S.phase === 'finished') playerPitLogic(dt);
    if (racing) { drsTick(dt); scTick(dt); recoveryTick(dt); engineerTick(dt); }
    radioTick(dt);
    if (S.flashT > 0) { S.flashT -= dt; if (S.flashT <= 0) flash('', '', 0); }
    GP.updateCamera(dt, false);
    GP.updateCarDetail();
    GP.animateCrowd(dt, S.started ? G.cars : null);
    if (S.started) {
      S.hudAcc = (S.hudAcc || 0) + dt;
      if (S.hudAcc > 0.075) { S.hudAcc = 0; updateHUD(); }
      S.mapAcc = (S.mapAcc || 0) + dt;
      if (S.mapAcc > 0.07) { S.mapAcc = 0; drawMini(); }
    }
    audioTick(dt);
    if (G.renderer) G.renderer.render(G.scene, G.camera);
    if (!S.firstFrame) S.firstFrame = true;
  }

  /* =================================================================
     LOADING
     ================================================================= */
  var LOAD = { cur: 0, target: 0, t0: 0, last: 0, done: false, timer: 0, backstop: 0 };
  function setLoad(p) { LOAD.target = Math.max(LOAD.target, Math.min(1, p)); }
  function loadTick() {
    if (LOAD.done) return;
    var now = performance.now(), dt = Math.min(0.15, (now - (LOAD.last || now)) / 1000);
    LOAD.last = now;
    LOAD.cur += (LOAD.target - LOAD.cur) * Math.min(1, dt * 7);
    if (LOAD.target >= 1 && LOAD.cur > 0.985) LOAD.cur = 1;
    var pct = Math.min(100, Math.round(LOAD.cur * 1000) / 10);
    $('loadFill').style.width = pct + '%';
    $('loadPct').textContent = Math.round(pct) + '%';
    var waited = now - LOAD.t0;
    if ((LOAD.cur >= 1 && waited > 800) || waited > 14000) { finishLoad(); return; }
    LOAD.timer = setTimeout(loadTick, 60);      // timers run while hidden; rAF does not
  }
  function finishLoad() {
    if (LOAD.done) return;
    LOAD.done = true;
    if (LOAD.timer) { clearTimeout(LOAD.timer); LOAD.timer = 0; }
    if (LOAD.backstop) { clearTimeout(LOAD.backstop); LOAD.backstop = 0; }
    LOAD.cur = 1; LOAD.target = 1;
    $('loadFill').style.width = '100%'; $('loadPct').textContent = '100%';
    var el = $('loadWrap');
    setTimeout(function () { el.classList.add('done'); }, 240);
    setTimeout(function () {
      el.classList.add('gone');
      if (typeof window.onGameLoaded === 'function') window.onGameLoaded();
    }, 760);
  }

  /* =================================================================
     MENU WIRING
     ================================================================= */
  function syncDiff() {
    $('diffSeg').querySelectorAll('button').forEach(function (b, i) { b.classList.toggle('on', i === S.diff); });
  }
  function renderTeamPick() {
    var wrap = $('teamPick'); wrap.innerHTML = '';
    D.TEAMS.forEach(function (t) {
      var d2 = D.DRIVERS.filter(function (d) { return d.t === t.id; });
      var b = document.createElement('button');
      b.className = 'teamcard' + (t.id === S.team ? ' on' : '');
      b.innerHTML = '<i class="stripe" style="background:' + t.color + '"></i>' +
        '<b>' + t.name + '</b>' +
        '<span>Team-mate ' + d2[0].n + '</span>' +
        '<span class="perf">Car ' + Math.round((t.power * 0.55 + t.grip * 0.45) * 100) + '</span>';
      b.addEventListener('click', function () {
        S.team = t.id; S.save.team = t.id; persist();
        wrap.querySelectorAll('.teamcard').forEach(function (o) { o.classList.remove('on'); });
        b.classList.add('on');
      });
      wrap.appendChild(b);
    });
  }

  function newSeason() {
    S.save = blankSave();
    S.save.team = S.team; S.save.diff = S.diff;
    S.save.vol = _vol; S.save.muted = _muted;
    persist();
    if (G.cars.length) { G.cars.forEach(function (c) { G.scene.remove(c.group); }); G.cars = []; G.player = null; }
    openSeason();
  }

  /* =================================================================
     BOOT
     ================================================================= */
  window.addEventListener('DOMContentLoaded', function () {
    LOAD.t0 = performance.now(); setLoad(0.1);
    LOAD.backstop = setTimeout(finishLoad, 14000);   // fires even if the tab is hidden
    loadTick();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      S.last = performance.now();
      if (!LOAD.done && !LOAD.timer) loadTick();
      if (window.gameIsPaused()) return;
      // the queued frame may have been dropped while hidden, leaving a live
      // handle with a dead callback — re-arm if the loop has gone cold
      if (S.raf) cancelAnimationFrame(S.raf);
      S.raf = requestAnimationFrame(loop);
    });
    // a slow watchdog catches any other way the frame chain can die
    setInterval(function () {
      if (document.hidden || window.gameIsPaused() || !S.tick) return;
      if (performance.now() - S.tick < 2000) return;
      S.last = performance.now();
      if (S.raf) cancelAnimationFrame(S.raf);
      S.raf = requestAnimationFrame(loop);
    }, 2000);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setLoad(0.35); });
    else setLoad(0.35);

    if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) document.body.classList.add('touch');

    var wait = function () {
      if (!window.GP || !window.GPDATA || !window.THREE) { setTimeout(wait, 60); return; }
      GP = window.GP; D = window.GPDATA; G = GP.G;
      setLoad(0.6);
      S.save = loadSave();
      _vol = typeof S.save.vol === 'number' ? S.save.vol : 0.55;
      _muted = !!S.save.muted;
      S.team = S.save.team || 'meridian';
      S.diff = typeof S.save.diff === 'number' ? S.save.diff : 1;
      G.quality = (navigator.hardwareConcurrency || 4) >= 4 && !document.body.classList.contains('touch') ? 3 : 2;
      GP.initRenderer($('mount'));
      G.scene = new window.THREE.Scene();
      // show the first circuit behind the menu
      loadTrack(D.CAL[Math.min(S.save.round, 24)]);
      setWeather(D.CAL[Math.min(S.save.round, 24)], 0);
      S.trackIdx = Math.min(S.save.round, 24);
      G.camMode = 3;
      GP.updateCamera(1, true);
      setLoad(0.9);
      wireUI();
      openMenu();
      S.last = performance.now();
      S.raf = requestAnimationFrame(loop);
      setLoad(1);                     // the game is built and reachable
    };
    wait();
  });

  function wireUI() {
    $('driverBtn').addEventListener('click', function () { openDriver('progress'); });
    $('driverBack').addEventListener('click', function () { $('driverScreen').classList.remove('show'); });
    $('driverScreen').querySelectorAll('.dtabs button').forEach(function (b) { b.addEventListener('click', function () { driverTab(b.dataset.tab); }); });
    window.addEventListener('keydown', function (e) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
      unlockAudio();
      S.keys[e.code] = true;
      if (e.code === 'KeyC') { G.camMode = (G.camMode + 1) % GP.CAM_MODES.length; flash(GP.CAM_MODES[G.camMode], '', 0.9); }
      if (e.code === 'KeyP' && (S.phase === 'race')) {
        var me = G.player; me.wantPit = !me.wantPit;
        flash(me.wantPit ? 'BOX THIS LAP' : 'STAY OUT', 'accent', 1.4);
      }
      if (e.code === 'Escape' && S.started) { openMenu(); }
    });
    window.addEventListener('keyup', function (e) { S.keys[e.code] = false; });
    window.addEventListener('resize', function () { GP.onResize(); GP.garageResize(); GP.podiumResize(); });

    ['tLeft:l', 'tRight:r', 'tGas:g', 'tBrake:b', 'tBoost:boost'].forEach(function (p) {
      var q = p.split(':'); bindTouch(q[0], q[1]);
    });
    $('tPit').addEventListener('click', function () {
      var me = G.player; if (S.phase !== 'race') return;
      me.wantPit = !me.wantPit;
      flash(me.wantPit ? 'BOX THIS LAP' : 'STAY OUT', 'accent', 1.4);
    });
    $('camBtn').addEventListener('click', function () {
      G.camMode = (G.camMode + 1) % GP.CAM_MODES.length;
      flash(GP.CAM_MODES[G.camMode], '', 0.9);
    });
    $('menuBtnHud').addEventListener('click', openMenu);

    $('newBtn').addEventListener('click', function () { unlockAudio(); $('teamScreen').classList.add('show'); renderTeamPick(); });
    $('teamGo').addEventListener('click', function () { $('teamScreen').classList.remove('show'); newSeason(); });
    $('teamBack').addEventListener('click', function () { $('teamScreen').classList.remove('show'); });
    $('contBtn').addEventListener('click', function () { unlockAudio(); openSeason(); });
    $('singleBtn').addEventListener('click', function () {
      unlockAudio(); S.mode = 'single';
      openSetup(Math.floor(Math.random() * D.CAL.length));
    });
    $('diffSeg').querySelectorAll('button').forEach(function (b, i) {
      b.addEventListener('click', function () { S.diff = i; S.save.diff = i; persist(); syncDiff(); });
    });
    $('soundBtn').addEventListener('click', function () { unlockAudio(); setMuted(!_muted); });
    $('soundBtn').classList.toggle('off', _muted);
    var sl = $('vol');
    sl.value = Math.round(_vol * 100);
    $('volVal').textContent = Math.round(_vol * 100) + '%';
    sl.addEventListener('input', function () { unlockAudio(); setVolume(sl.value / 100); });

    $('stTabD').addEventListener('click', function () { renderStandings('drivers'); });
    $('stTabT').addEventListener('click', function () { renderStandings('teams'); });
    $('seasonBack').addEventListener('click', openMenu);
    $('garageBtn').addEventListener('click', openGarage);
    $('garageBack').addEventListener('click', function () {
      GP.garageExit();
      if (S.garageBack === 'setup') openSetup(S.trackIdx); else openSeason();
    });
    bindGarageView();
    $('tDrs').addEventListener('pointerdown', function (e) { e.preventDefault(); S.touch.drs = true; $('tDrs').classList.add('down'); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      $('tDrs').addEventListener(ev, function (e) { e.preventDefault(); S.touch.drs = false; $('tDrs').classList.remove('down'); });
    });
    $('setupBack').addEventListener('click', function () { S.mode === 'season' ? openSeason() : openMenu(); });
    $('fp1Btn').addEventListener('click', function () { goSession('p1'); });
    $('fp2Btn').addEventListener('click', function () { goSession('p2'); });
    $('setupGarage').addEventListener('click', function () { openGarage(true); });
    $('qualiBtn').addEventListener('click', function () { goSession(true); });
    $('raceBtn').addEventListener('click', function () { goSession(false); });
  }

  /* =================================================================
     PORTAL / GameDistribution
     ================================================================= */
  var adPaused = false, wasMuted = false;
  window.gamePauseForAd = function (on) {
    on = !!on;
    if (on === adPaused) return;
    adPaused = on;
    if (on) {
      if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
      wasMuted = _muted; if (!wasMuted) setMuted(true);
      try { if (_ac && _ac.state === 'running') _ac.suspend(); } catch (e) { }
    } else {
      try { if (_ac && _ac.state === 'suspended') _ac.resume(); } catch (e) { }
      if (!wasMuted) setMuted(false);
      S.last = performance.now();
      if (!S.raf) S.raf = requestAnimationFrame(loop);
    }
  };
  window.gameIsPaused = function () { return adPaused; };
  window.gameShowAd = function () {
    try { if (window.gdsdk && typeof window.gdsdk.showAd === 'function') window.gdsdk.showAd(); } catch (e) { }
  };
  function adBreak() { if (typeof window.gameShowAd === 'function') { try { window.gameShowAd(); } catch (e) { } } }
})();

/* =====================================================================
   PROGRESS — driver level, XP and achievements.
   Owns the `profile` block of the save. The game calls in at a handful of
   moments (race start, each frame, each lap, contact, race end) and gets
   back what to show. Nothing here touches the 3D scene.
   ===================================================================== */
(function () {
  'use strict';

  var TITLES = [
    [1, 'Newcomer'], [2, 'Rookie'], [6, 'Amateur'], [11, 'Club Racer'], [16, 'Pro'],
    [21, 'Veteran'], [26, 'Expert'], [31, 'Ace'], [36, 'Master'], [41, 'Champion'],
    [46, 'Elite'], [50, 'Legend']
  ];
  var MAX_LEVEL = 50;
  // XP needed to go from level l to l+1: cheap early, a real climb late.
  // Cumulative to 50 is about 20,000 XP — roughly 130 races at pace.
  function need(l) { return 60 + l * 14; }
  function titleOf(level) { var t = TITLES[0][1]; TITLES.forEach(function (p) { if (level >= p[0]) t = p[1]; }); return t; }
  function levelOf(xp) { var l = 1; while (l < MAX_LEVEL && xp >= need(l)) { xp -= need(l); l++; } return { level: l, into: xp, need: l >= MAX_LEVEL ? 0 : need(l) }; }

  var ACH = [
    { id: 'first_race',    icon: '🏁', name: 'First Lights',    desc: 'Finish your first race' },
    { id: 'first_win',     icon: '🏆', name: 'First Win',       desc: 'Win a race' },
    { id: 'podium',        icon: '🥉', name: 'On the Rostrum',  desc: 'Finish on the podium' },
    { id: 'perfect_lap',   icon: '🔥', name: 'Perfect Lap',     desc: 'A lap with no contact and no wheels off the road' },
    { id: 'clean_race',    icon: '✨', name: 'Clean Race',      desc: 'Finish a race without touching anything' },
    { id: 'rain_master',   icon: '🌧️', name: 'Rain Master',     desc: 'Win a race in the wet' },
    { id: 'night_shift',   icon: '🌃', name: 'Night Shift',     desc: 'Win a night race' },
    { id: 'overtake_king', icon: '🏎️', name: 'Overtake King',   desc: 'Make 20 overtakes in total' },
    { id: 'charger',       icon: '⚡', name: 'Charger',         desc: 'Win from tenth on the grid or lower' },
    { id: 'pole',          icon: '🎯', name: 'Pole Sitter',     desc: 'Take pole position in qualifying' },
    { id: 'purple',        icon: '💜', name: 'Purple Lap',      desc: 'Set the fastest lap of a race' },
    { id: 'in_and_out',    icon: '🛞', name: 'In and Out',      desc: 'Make a pit stop without a speeding penalty' },
    { id: 'century',       icon: '💯', name: 'Century',         desc: 'Complete 100 racing laps' },
    { id: 'champion',      icon: '👑', name: 'Champion',        desc: 'Win the drivers’ championship' }
  ];
  var BY_ID = {}; ACH.forEach(function (a) { BY_ID[a.id] = a; });

  function blankProfile() {
    return {
      xp: 0, ach: {}, custom: { paint: null, trim: null, helmet: null, rim: null, num: null },
      stats: { races: 0, wins: 0, podiums: 0, overtakes: 0, laps: 0, cleanLaps: 0, poles: 0, fastLaps: 0, stops: 0, seasons: 0 }
    };
  }
  function ensure(save) {
    if (!save.profile) save.profile = blankProfile();
    var p = save.profile, b = blankProfile();
    if (!p.stats) p.stats = b.stats; if (!p.ach) p.ach = {}; if (!p.custom) p.custom = b.custom;
    for (var k in b.stats) if (typeof p.stats[k] !== 'number') p.stats[k] = 0;
    return p;
  }

  // ---- the running race ------------------------------------------------
  var R = null;
  function raceStart(o) {
    R = { grid: o.gridPos || 20, overtakes: 0, contacts: 0, offTrack: 0, lapContact: false, lapOff: false,
          cleanLaps: 0, laps: 0, ahead: null, pitClean: false, pitSpeeding: false, unlocked: [] };
  }
  function unlock(profile, id) {
    if (!profile || profile.ach[id]) return false;
    profile.ach[id] = Date.now(); if (R) R.unlocked.push(id); return true;
  }
  // called every frame during the race
  function tick(o) {
    if (!R) return null;
    var me = o.me, cars = o.cars, fresh = [];
    if (me.onGrass && !R.lapOff) { R.lapOff = true; R.offTrack++; }
    // overtakes: a car that was ahead of us last frame and is now behind,
    // with neither of us in the pit lane, is a pass on the road
    var ahead = {};
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i]; if (c === me || c.retired) continue;
      if (c.prog > me.prog) ahead[c.name] = true;
      else if (R.ahead && R.ahead[c.name] && !c.inPit && !me.inPit && !c.finished) {
        R.overtakes++; o.profile.stats.overtakes++;
        if (o.profile.stats.overtakes >= 20 && unlock(o.profile, 'overtake_king')) fresh.push('overtake_king');
      }
    }
    R.ahead = ahead;
    // pit lane: a stop without a speeding penalty
    if (me.inPit) { if (me.gotPen) R.pitSpeeding = true; }
    else if (R.wasInPit && me.stops > 0 && !R.pitSpeeding) { if (unlock(o.profile, 'in_and_out')) fresh.push('in_and_out'); }
    if (!me.inPit) R.pitSpeeding = false;
    R.wasInPit = me.inPit;
    return fresh.length ? fresh : null;
  }
  function contact() { if (R) { R.contacts++; R.lapContact = true; } }
  // a completed racing lap
  function lap(profile) {
    if (!R) return null;
    var fresh = [];
    R.laps++; profile.stats.laps++;
    if (!R.lapContact && !R.lapOff) {
      R.cleanLaps++; profile.stats.cleanLaps++;
      if (unlock(profile, 'perfect_lap')) fresh.push('perfect_lap');
    }
    if (profile.stats.laps >= 100 && unlock(profile, 'century')) fresh.push('century');
    R.lapContact = false; R.lapOff = false;
    return fresh.length ? fresh : null;
  }
  function pole(profile) { profile.stats.poles++; return unlock(profile, 'pole') ? ['pole'] : null; }

  // ---- race end: XP, levels, achievements --------------------------------
  function raceEnd(o) {
    var p = o.profile, st = p.stats, lines = [], xp = 0;
    var pos = o.pos, n = o.field, before = levelOf(p.xp);
    var add = function (label, v) { v = Math.round(v); if (v > 0) { lines.push([label, v]); xp += v; } };
    st.races++;
    if (o.retired) add('Retired', 20);
    else {
      add('P' + pos + ' finish', 40 + Math.max(0, n - pos) * 6);
      if (pos === 1) { add('Race win', 40); st.wins++; }
      if (pos <= 3) { add('Podium', 15); st.podiums++; }
    }
    if (R) {
      add(R.overtakes + (R.overtakes === 1 ? ' overtake' : ' overtakes'), R.overtakes * 4);
      add(R.cleanLaps + ' clean ' + (R.cleanLaps === 1 ? 'lap' : 'laps'), R.cleanLaps * 5);
      if (R.contacts === 0 && !o.retired && R.laps > 0) add('No contact', 25);
    }
    if (o.fastest) { add('Fastest lap', 20); st.fastLaps++; }
    if (o.wet) add('Wet race', Math.round(xp * 0.2));
    if (o.night) add('Night race', Math.round(xp * 0.1));
    if (o.diffMul && o.diffMul !== 1) { var extra = Math.round(xp * (o.diffMul - 1)); if (extra > 0) add('Difficulty bonus', extra); else if (extra < 0) { lines.push(['Rookie difficulty', extra]); xp += extra; } }
    st.stops += o.stops || 0;

    var fresh = [];
    var u = function (id) { if (unlock(p, id)) fresh.push(id); };
    if (!o.retired) u('first_race');
    if (pos === 1 && !o.retired) {
      u('first_win');
      if (o.wet) u('rain_master');
      if (o.night) u('night_shift');
      if (R && R.grid >= 10) u('charger');
    }
    if (pos <= 3 && !o.retired) u('podium');
    if (R && R.contacts === 0 && !o.retired && R.laps > 0) u('clean_race');
    if (o.fastest) u('purple');
    if (R && R.unlocked) R.unlocked.forEach(function (id) { if (fresh.indexOf(id) < 0) fresh.push(id); });

    p.xp += xp;
    var after = levelOf(p.xp);
    var award = { xp: xp, lines: lines, from: before, to: after, leveled: after.level > before.level,
                  title: titleOf(after.level), fresh: fresh.map(function (id) { return BY_ID[id]; }) };
    R = null;
    return award;
  }
  function champion(profile) { profile.stats.seasons++; return unlock(profile, 'champion') ? ['champion'] : null; }

  // ---- the car: paints, helmets, rims, a number ---------------------------
  // Nothing here is bought. Everything opens with levels or achievements.
  var PAINTS = [
    { id: 'team',     name: 'Team livery', hex: null },
    { id: 'crimson',  name: 'Crimson',     hex: '#d8382c', lvl: 1 },
    { id: 'ivory',    name: 'Ivory',       hex: '#f3efe6', lvl: 1 },
    { id: 'ink',      name: 'Ink',         hex: '#201e1d', lvl: 1 },
    { id: 'sky',      name: 'Sky',         hex: '#7fd4ff', lvl: 1 },
    { id: 'amber',    name: 'Amber',       hex: '#e6a63c', lvl: 3 },
    { id: 'sage',     name: 'Sage',        hex: '#7a8a5e', lvl: 5 },
    { id: 'violet',   name: 'Violet',      hex: '#8a6cff', lvl: 8 },
    { id: 'mint',     name: 'Mint',        hex: '#2fd7a2', lvl: 12 },
    { id: 'tangerine',name: 'Tangerine',   hex: '#ff7a1a', lvl: 16 },
    { id: 'rose',     name: 'Rose',        hex: '#ff5c8a', lvl: 20 },
    { id: 'chrome',   name: 'Chrome',      hex: '#c9ced6', lvl: 25 },
    { id: 'purple',   name: 'Purple',      hex: '#6a1fb5', ach: 'purple' },
    { id: 'rain',     name: 'Rain',        hex: '#2f6fd6', ach: 'rain_master' },
    { id: 'midnight', name: 'Midnight',    hex: '#0d1226', ach: 'night_shift' },
    { id: 'gold',     name: 'Gold',        hex: '#d4a017', ach: 'champion' }
  ];
  var HELMETS = [
    { id: 'team',   name: 'Team colours', hex: null },
    { id: 'white',  name: 'White',  hex: '#f4f1ea', lvl: 1 },
    { id: 'black',  name: 'Black',  hex: '#1a1a1e', lvl: 1 },
    { id: 'red',    name: 'Red',    hex: '#d8382c', lvl: 2 },
    { id: 'blue',   name: 'Blue',   hex: '#2f6fd6', lvl: 4 },
    { id: 'yellow', name: 'Yellow', hex: '#f2c231', lvl: 6 },
    { id: 'green',  name: 'Green',  hex: '#3c9a4f', lvl: 9 },
    { id: 'pink',   name: 'Pink',   hex: '#ff5c8a', lvl: 13 },
    { id: 'gold',   name: 'Gold',   hex: '#d4a017', ach: 'first_win' },
    { id: 'purple', name: 'Purple', hex: '#7a3fd6', ach: 'perfect_lap' }
  ];
  var RIMS = [
    { id: 'silver', name: 'Silver', hex: '#aeb4bc', lvl: 1 },
    { id: 'black',  name: 'Black',  hex: '#23262c', lvl: 5 },
    { id: 'bronze', name: 'Bronze', hex: '#b07a3a', lvl: 10 },
    { id: 'white',  name: 'White',  hex: '#eef0f2', ach: 'clean_race' },
    { id: 'gold',   name: 'Gold',   hex: '#d4a017', ach: 'champion' }
  ];
  var CATS = { paint: PAINTS, trim: PAINTS, helmet: HELMETS, rim: RIMS };
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function unlocked(profile, item) {
    if (!item) return false;
    if (item.ach) return !!profile.ach[item.ach];
    if (item.lvl) return levelOf(profile.xp).level >= item.lvl;
    return true;
  }
  function reqText(item) { return item.ach ? ('Achievement: ' + (BY_ID[item.ach] ? BY_ID[item.ach].name : item.ach)) : (item.lvl ? 'Level ' + item.lvl : ''); }
  // resolve what the car should actually wear: a custom pick if it is still unlocked, else the team's
  function resolve(profile, cat, teamHex) {
    var id = profile.custom[cat], item = id ? find(CATS[cat], id) : null;
    if (item && item.hex && unlocked(profile, item)) return item.hex;
    return teamHex;
  }
  function carSvg(paint, trim, helmet, rim, num) {
    // a top-down open-wheel car; nothing fancy, just enough to show the colours
    return '<svg viewBox="0 0 200 320" class="carsvg" aria-hidden="true">' +
      '<rect x="18" y="52" width="164" height="14" rx="4" fill="' + trim + '"/>' +
      '<rect x="16" y="46" width="8" height="26" rx="2" fill="#2a2d33"/><rect x="176" y="46" width="8" height="26" rx="2" fill="#2a2d33"/>' +
      '<path d="M100 30 L118 92 L118 210 L100 236 L82 210 L82 92 Z" fill="' + paint + '"/>' +
      '<rect x="48" y="128" width="34" height="90" rx="10" fill="' + paint + '"/><rect x="118" y="128" width="34" height="90" rx="10" fill="' + paint + '"/>' +
      '<rect x="48" y="128" width="34" height="10" fill="' + trim + '"/><rect x="118" y="128" width="34" height="10" fill="' + trim + '"/>' +
      '<rect x="30" y="238" width="140" height="12" rx="4" fill="' + trim + '"/>' +
      '<rect x="26" y="232" width="8" height="30" rx="2" fill="#2a2d33"/><rect x="166" y="232" width="8" height="30" rx="2" fill="#2a2d33"/>' +
      '<g fill="#1b1d22"><rect x="18" y="74" width="26" height="46" rx="6"/><rect x="156" y="74" width="26" height="46" rx="6"/><rect x="14" y="184" width="30" height="50" rx="6"/><rect x="156" y="184" width="30" height="50" rx="6"/></g>' +
      '<g fill="' + rim + '"><rect x="26" y="86" width="10" height="22" rx="3"/><rect x="164" y="86" width="10" height="22" rx="3"/><rect x="24" y="198" width="10" height="22" rx="3"/><rect x="166" y="198" width="10" height="22" rx="3"/></g>' +
      '<circle cx="100" cy="146" r="13" fill="' + helmet + '" stroke="#14161b" stroke-width="2"/>' +
      '<circle cx="100" cy="196" r="15" fill="#fffaf0"/><text x="100" y="201" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="15" fill="#201e1d">' + num + '</text>' +
      '</svg>';
  }
  function swatchRow(profile, cat, label, teamHex) {
    var cur = profile.custom[cat] || 'team';
    var html = '<div class="crow"><div class="clbl">' + label + '</div><div class="swatches">';
    CATS[cat].forEach(function (it) {
      if (cat === 'rim' && it.id === 'team') return;
      var ok = unlocked(profile, it), on = (it.id === cur) || (!profile.custom[cat] && it.id === 'team');
      var bg = it.hex || teamHex || '#999';
      html += '<button class="sw' + (on ? ' on' : '') + (ok ? '' : ' locked') + '" data-cat="' + cat + '" data-id="' + it.id + '" ' +
        'title="' + it.name + (ok ? '' : ' · ' + reqText(it)) + '" style="background:' + bg + '"' + (ok ? '' : ' disabled') + '>' +
        (ok ? '' : '<i>🔒</i>') + '</button>';
    });
    return html + '</div></div>';
  }
  function carTab(profile, team) {
    var paint = resolve(profile, 'paint', team.color), trim = resolve(profile, 'trim', team.color2);
    var helmet = resolve(profile, 'helmet', team.color2), rim = resolve(profile, 'rim', '#aeb4bc');
    var num = profile.custom.num || team.num || 7;
    var lvl = levelOf(profile.xp).level;
    var open = 0, total = 0;
    [PAINTS, HELMETS, RIMS].forEach(function (L) { L.forEach(function (it) { if (it.hex) { total++; if (unlocked(profile, it)) open++; } }); });
    return '<div class="carwrap"><div class="carprev">' + carSvg(paint, trim, helmet, rim, num) +
      '<small>' + open + ' of ' + total + ' colours unlocked · level ' + lvl + '</small></div><div class="caropts">' +
      swatchRow(profile, 'paint', 'Paint', team.color) + swatchRow(profile, 'trim', 'Accent', team.color2) +
      swatchRow(profile, 'helmet', 'Helmet', team.color2) + swatchRow(profile, 'rim', 'Rims', '#aeb4bc') +
      '<div class="crow"><div class="clbl">Number</div><div class="numpick"><input type="number" id="carNum" min="1" max="99" value="' + num + '"><span>1–99</span></div></div>' +
      '<p class="carnote">Locked colours open with levels and achievements — nothing here is sold.</p></div></div>';
  }
  function setCustom(profile, cat, id) {
    if (cat === 'num') { var n = parseInt(id, 10); profile.custom.num = (n >= 1 && n <= 99) ? n : null; return true; }
    var it = find(CATS[cat], id); if (!it) return false;
    if (it.hex && !unlocked(profile, it)) return false;
    profile.custom[cat] = it.hex ? id : null; return true;
  }

  // ---- rendering ---------------------------------------------------------
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function pct(l) { return l.need ? Math.round(l.into / l.need * 100) : 100; }
  function chip(profile) {
    var l = levelOf(profile.xp), done = Object.keys(profile.ach).length;
    return '<div class="pchip"><div class="plv">' + l.level + '</div><div class="pbody"><b>' + esc(titleOf(l.level)) + '</b>' +
      '<div class="pbar"><i style="width:' + pct(l) + '%"></i></div>' +
      '<small>' + (l.need ? (l.into + ' / ' + l.need + ' XP to level ' + (l.level + 1)) : 'Maximum level') +
      ' · ' + done + '/' + ACH.length + ' achievements</small></div></div>';
  }
  function achievements(profile) {
    var html = '<div class="achgrid">';
    ACH.forEach(function (a) {
      var got = !!profile.ach[a.id];
      html += '<div class="ach' + (got ? ' got' : '') + '"><span class="ai">' + a.icon + '</span><div><b>' + esc(a.name) + '</b><small>' + esc(a.desc) + '</small></div></div>';
    });
    return html + '</div>';
  }
  function awardCard(award) {
    var html = '<div class="award"><div class="awhead"><span class="awxp">+' + award.xp + ' XP</span>';
    if (award.leveled) html += '<span class="awlvl">Level up! <b>' + award.to.level + ' · ' + esc(award.title) + '</b></span>';
    else html += '<span class="awlvl muted">Level ' + award.to.level + ' · ' + esc(award.title) + '</span>';
    html += '</div><div class="pbar big"><i style="width:' + pct(award.to) + '%"></i></div><div class="awlines">';
    award.lines.forEach(function (l) { html += '<span>' + esc(l[0]) + '<b>' + (l[1] > 0 ? '+' : '') + l[1] + '</b></span>'; });
    html += '</div>';
    if (award.fresh.length) {
      html += '<div class="awach">';
      award.fresh.forEach(function (a) { html += '<div class="ach got small"><span class="ai">' + a.icon + '</span><div><b>' + esc(a.name) + '</b><small>' + esc(a.desc) + '</small></div></div>'; });
      html += '</div>';
    }
    return html + '</div>';
  }
  function stats(profile) {
    var s = profile.stats;
    var rows = [['Races', s.races], ['Wins', s.wins], ['Podiums', s.podiums], ['Poles', s.poles], ['Overtakes', s.overtakes],
      ['Laps', s.laps], ['Clean laps', s.cleanLaps], ['Fastest laps', s.fastLaps], ['Pit stops', s.stops], ['Titles', s.seasons]];
    return '<div class="statgrid">' + rows.map(function (r) { return '<div><b>' + r[1] + '</b><small>' + r[0] + '</small></div>'; }).join('') + '</div>';
  }

  window.PROG = { ACH: ACH, byId: BY_ID, ensure: ensure, raceStart: raceStart, tick: tick, contact: contact, lap: lap,
    pole: pole, raceEnd: raceEnd, champion: champion, levelOf: levelOf, titleOf: titleOf, need: need,
    chip: chip, achievements: achievements, awardCard: awardCard, stats: stats, current: function () { return R; },
    PAINTS: PAINTS, HELMETS: HELMETS, RIMS: RIMS, resolve: resolve, carTab: carTab, setCustom: setCustom, unlocked: unlocked };
})();

// Zombie Squad - the profile: level, credits, unlocks, upgrades, records,
// achievements and daily / weekly missions. Everything lives in localStorage.
(function(ZD){
const KEY = 'zsquad.save.v2', OLD = 'zsquad.save.v1';
const S = ZD.S = { data:null, listeners:[] };
const fresh = ()=>({
  v:2, xp:0, level:1, credits:600,
  settings:{ sens:1, invert:false, vol:0.7, music:true, quality:'auto', controls:'buttons', assist:true, tips:0 },
  owned:{ weapons:['pistol','smg','rifle','shotgun'], melee:['knife'], chars:['max','ace','doc','tank'], outfits:['woodland'] },
  loadout:{ primary:'rifle', secondary:'pistol', melee:'knife', char:'max', outfits:{} },
  upgrades:{}, missions:{}, secrets:{}, notes:{}, symbols:{}, ach:{},
  records:{ waves:{}, runs:[], bossTimes:{}, mostKills:0 },
  stats:{}, daily:{ key:'', list:[] }, weekly:{ key:'', list:[] },
});
S.load = function(){
  let d = null;
  try{ const raw = localStorage.getItem(KEY); if(raw) d = JSON.parse(raw); }catch(e){}
  const base = fresh();
  if(!d){ d = base;
    try{ const old = JSON.parse(localStorage.getItem(OLD) || 'null'); // carry over the first version's settings
      if(old){ ['sens','invert','vol','music','quality','controls','assist'].forEach(k=>{ if(old[k] != null) d.settings[k] = old[k]; }); } }catch(e){} }
  // fill in anything a newer version added
  for(const k in base){ if(d[k] == null) d[k] = base[k]; else if(typeof base[k] === 'object' && !Array.isArray(base[k])) for(const k2 in base[k]) if(d[k][k2] == null) d[k][k2] = base[k][k2]; }
  S.data = d; S.refreshChallenges(); return d;
};
let saveT = 0;
S.persist = function(now){ clearTimeout(saveT); const go = ()=>{ try{ localStorage.setItem(KEY, JSON.stringify(S.data)); }catch(e){} }; if(now) go(); else saveT = setTimeout(go, 300); };
S.notify = function(kind, title, text){ for(const f of S.listeners) try{ f(kind, title, text); }catch(e){} };
S.reset = function(){ S.data = fresh(); S.refreshChallenges(); S.persist(true); };

// ---- xp, levels, credits ------------------------------------------------------
S.addCredits = function(n){ S.data.credits = Math.max(0, Math.round(S.data.credits + n)); S.persist(); };
S.addXP = function(n){
  const d = S.data; d.xp += Math.round(n); let ups = 0;
  while(d.xp >= ZD.xpNeed(d.level)){ d.xp -= ZD.xpNeed(d.level); d.level++; ups++; const r = ZD.levelReward(d.level); d.credits += r;
    S.notify('level', 'LEVEL ' + d.level, '+' + r + ' credits' + unlockText(d.level)); }
  if(ups) S.track('level', d.level, true);
  S.persist(); return ups;
};
function unlockText(lvl){
  const things = [];
  for(const id of ZD.WEAPON_ORDER){ const w = ZD.WEAPONS[id]; if(w.lvl === lvl && !w.secret) things.push(w.name); }
  for(const id of ZD.CHAR_ORDER){ if(ZD.CHARS[id].lvl === lvl && ZD.CHARS[id].cost) things.push(ZD.CHARS[id].name); }
  for(const id of ZD.MELEE_ORDER){ if(ZD.MELEE[id].lvl === lvl && ZD.MELEE[id].cost) things.push(ZD.MELEE[id].name); }
  return things.length ? '  ·  Now in the Armory: ' + things.join(', ') : '';
}
S.levelProgress = ()=>S.data.xp/ZD.xpNeed(S.data.level);

// ---- stats, achievements, challenges ---------------------------------------------
// max = the stat is a best value (wave reached, level) instead of a running count
S.track = function(stat, n, max){
  if(n == null) n = 1;
  const st = S.data.stats;
  if(max) st[stat] = Math.max(st[stat] || 0, n); else st[stat] = (st[stat] || 0) + n;
  for(const a of ZD.ACHIEVEMENTS){ if(a.stat !== stat || S.data.ach[a.id]) continue;
    if((st[stat] || 0) >= a.n){ S.data.ach[a.id] = Date.now(); S.data.credits += a.credits; S.notify('ach', 'ACHIEVEMENT: ' + a.name, a.desc + '  ·  +' + a.credits + ' credits');
      if(a.id === 'kills_1000') S.own('outfits', 'crimson'); if(a.id === 'secret_all') S.own('outfits', 'gold'); } }
  for(const box of [S.data.daily, S.data.weekly]){ const weekly = box === S.data.weekly;
    for(const c of box.list){ if(c.done) continue; const tpl = ZD.CHALLENGES.find(t=>t.id === c.id); if(!tpl || tpl.stat !== stat) continue;
      c.prog = tpl.max ? Math.max(c.prog, max ? n : st[stat]) : c.prog + (max ? 0 : n);
      if(c.prog >= c.n){ c.prog = c.n; c.done = true; const cr = c.reward, xp = weekly ? ZD.CHALLENGE_REWARD.xpW : ZD.CHALLENGE_REWARD.xpD;
        S.data.credits += cr; S.notify('challenge', (weekly ? 'WEEKLY' : 'DAILY') + ' MISSION DONE', c.text + '  ·  +' + cr + ' credits, +' + xp + ' XP');
        if(!weekly) S.track('dailies'); S.addXP(xp); } } }
  S.persist();
};
const dayKey = d=>d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
const weekKey = d=>{ const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + '-W' + Math.ceil(((t - y)/86400000 + 1)/7); };
function makeList(key, weekly){
  const rng = ZD.RNG(ZD.hashStr(key + (weekly ? 'w' : 'd'))), pool = ZD.CHALLENGES.slice(), out = [];
  while(out.length < 3 && pool.length){ const t = pool.splice((rng()*pool.length)|0, 1)[0], arr = weekly ? t.w : t.d, n = arr[(rng()*arr.length)|0];
    const rr = weekly ? ZD.CHALLENGE_REWARD.w : ZD.CHALLENGE_REWARD.d;
    out.push({ id:t.id, n, prog:0, done:false, text:t.text.replace('{n}', n.toLocaleString('en-US')), reward:rr[0] + Math.round((rr[1] - rr[0])*rng()/50)*50 }); }
  return out;
}
S.refreshChallenges = function(){
  const now = new Date(), dk = dayKey(now), wk = weekKey(now), d = S.data;
  if(d.daily.key !== dk) d.daily = { key:dk, list:makeList(dk, false) };
  if(d.weekly.key !== wk) d.weekly = { key:wk, list:makeList(wk, true) };
};
S.timeToReset = function(){ const n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1); return t - n; };

// ---- missions and maps -------------------------------------------------------------
S.missionStars = id => S.data.missions[id] || 0;
S.missionUnlocked = function(ms){ const k = ZD.MISSION_LIST.indexOf(ms); return k <= 0 || !!S.data.missions[ZD.MISSION_LIST[k - 1].id]; };
S.mapUnlocked = mi => S.missionUnlocked(ZD.MAPS[mi].missions[0]);
S.missionDone = function(ms, stars){
  const first = !S.data.missions[ms.id]; const old = S.data.missions[ms.id] || 0;
  S.data.missions[ms.id] = Math.max(old, stars);
  S.track('missions'); if(stars > old) S.track('stars', stars - old);
  if(ZD.MISSION_LIST.every(m=>S.data.missions[m.id])) S.track('campaignDone', 1, true);
  S.persist(); return first;
};
S.totalStars = ()=>ZD.MISSION_LIST.reduce((a, m)=>a + (S.data.missions[m.id] || 0), 0);

// ---- the armory ---------------------------------------------------------------------
S.owns = (kind, id)=>S.data.owned[kind].includes(id);
S.own = function(kind, id){ if(!S.owns(kind, id)){ S.data.owned[kind].push(id); if(kind === 'chars') S.track('charsOwned', S.data.owned.chars.length, true); S.persist(); } };
S.buy = function(kind, id){
  const def = kind === 'weapons' ? ZD.WEAPONS[id] : kind === 'melee' ? ZD.MELEE[id] : kind === 'chars' ? ZD.CHARS[id] : ZD.OUTFITS[id];
  if(!def || S.owns(kind, id)) return 'owned';
  if(def.lvl && S.data.level < def.lvl) return 'level';
  if(def.ach || def.secret) return 'locked';
  if(S.data.credits < (def.cost || 0)) return 'credits';
  S.data.credits -= def.cost || 0; S.own(kind, id); S.persist(); return 'ok';
};
S.upgradeLevel = (w, key)=>((S.data.upgrades[w] || {})[key] || 0);
S.upgrade = function(w, key){
  const lvl = S.upgradeLevel(w, key), u = ZD.UPGRADES[key]; if(lvl >= u.max) return 'max';
  const cost = ZD.upgradeCost(w, key, lvl); if(S.data.credits < cost) return 'credits';
  S.data.credits -= cost; (S.data.upgrades[w] = S.data.upgrades[w] || {})[key] = lvl + 1;
  if(Object.keys(ZD.UPGRADES).every(k=>S.upgradeLevel(w, k) >= ZD.UPGRADES[k].max)) S.track('maxedWeapons');
  S.persist(); return 'ok';
};
S.equip = function(slot, id){ S.data.loadout[slot] = id; S.persist(); };
S.outfitOf = c => S.data.loadout.outfits[c] || 'woodland';

// ---- records --------------------------------------------------------------------------
S.recordRun = function(run){
  const r = S.data.records, best = r.waves[run.map] || 0, newBest = run.wave > best;
  if(newBest) r.waves[run.map] = run.wave;
  r.runs.push(run); r.runs.sort((a, b)=>b.wave - a.wave || b.kills - a.kills); r.runs = r.runs.slice(0, 10);
  if(run.kills > r.mostKills) r.mostKills = run.kills;
  S.track('bestWave', run.wave, true); S.track('waveBest', run.wave, true);
  S.persist(); return newBest;
};
S.recordBoss = function(id, sec){ const r = S.data.records.bossTimes, old = r[id]; if(!old || sec < old){ r[id] = sec; S.persist(); return true; } return false; };

})(window.ZD);

// Zombie Squad - synthesized sound: effects, ambience per map and a dynamic music loop.
// Nothing is loaded from files; every sound is built from oscillators and noise.
(function(ZD){
const A = ZD.A = { ctx:null, master:null, sfxBus:null, musicBus:null, ambBus:null, noise:null, echo:null, muted:false };
const clamp = (v, a, b)=>v < a ? a : (v > b ? b : v);
A.unlock = function(){
  if(A.ctx){ if(A.ctx.state === 'suspended') A.ctx.resume(); return; }
  try{
    const C = window.AudioContext || window.webkitAudioContext; if(!C) return;
    const ac = A.ctx = new C();
    A.master = ac.createGain(); A.master.gain.value = A.muted ? 0 : ZD.S.data.settings.vol;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; A.master.connect(comp); comp.connect(ac.destination);
    A.sfxBus = ac.createGain(); A.sfxBus.connect(A.master);
    A.musicBus = ac.createGain(); A.musicBus.gain.value = ZD.S.data.settings.music ? 0.55 : 0; A.musicBus.connect(A.master);
    A.ambBus = ac.createGain(); A.ambBus.gain.value = 0.9; A.ambBus.connect(A.master);
    const d = ac.createDelay(1); d.delayTime.value = 0.19; const fb = ac.createGain(); fb.gain.value = 0.22; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(A.sfxBus); A.echo = d;
    const len = ac.sampleRate*2; A.noise = ac.createBuffer(1, len, ac.sampleRate); const ch = A.noise.getChannelData(0); for(let i=0;i<len;i++) ch[i] = Math.random()*2 - 1;
    if(A.pendingAmb) A.ambience(A.pendingAmb);
    Music.start();
  }catch(e){ A.ctx = null; }
};
A.setMuted = function(on){ A.muted = on; if(A.master) A.master.gain.value = on ? 0 : ZD.S.data.settings.vol; };
A.setVolume = function(v){ if(A.master && !A.muted) A.master.gain.value = v; };
A.setMusic = function(on){ if(A.musicBus) A.musicBus.gain.value = on ? 0.55 : 0; };

function env(g, t, peak, a, d){ g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function noiseHit(t, peak, dur, type, freq, q, dest, rate){
  const ac = A.ctx, n = ac.createBufferSource(); n.buffer = A.noise; n.playbackRate.value = rate || 1;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; if(q) f.Q.value = q;
  const g = ac.createGain(); env(g, t, peak, 0.003, dur); n.connect(f); f.connect(g); g.connect(dest || A.sfxBus); n.start(t, Math.random()*1.5, dur + 0.05); return g;
}
function tone(t, type, f0, f1, peak, dur, dest, attack){
  const ac = A.ctx, o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if(f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain(); env(g, t, peak, attack || 0.004, dur); o.connect(g); g.connect(dest || A.sfxBus); o.start(t); o.stop(t + dur + (attack || 0) + 0.05);
}
// distance falloff and stereo pan relative to the camera
function panned(x, z, vol, far){
  const ac = A.ctx, cam = ZD.W.camera, dx = x - cam.position.x, dz = z - cam.position.z, d = Math.hypot(dx, dz);
  const yaw = cam.rotation.y, rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const g = ac.createGain(); g.gain.value = clamp(1 - d/(far || 45), 0, 1)*(vol || 1);
  if(ac.createStereoPanner){ const p = ac.createStereoPanner(); p.pan.value = clamp((dx*rx + dz*rz)/Math.max(1, d), -1, 1); g.connect(p); p.connect(A.sfxBus); } else g.connect(A.sfxBus);
  return g;
}
let lastPlay = {};
A.sfx = function(name, opt){
  if(!A.ctx || A.muted) return; const ac = A.ctx, t = ac.currentTime + 0.002; opt = opt || {};
  // the same sound at the same moment only once (shotgun pellets, chain lightning)
  const now = ac.currentTime; if(lastPlay[name] && now - lastPlay[name] < (opt.gap || 0.025)) return; lastPlay[name] = now;
  const out = opt.at ? panned(opt.at[0], opt.at[1], opt.vol, opt.far) : (opt.vol ? (()=>{ const g = ac.createGain(); g.gain.value = opt.vol; g.connect(A.sfxBus); return g; })() : A.sfxBus);
  const echo = g=>{ if(!opt.at) g.connect(A.echo); };
  switch(name){
    case 'pistol': echo(noiseHit(t, 0.55, 0.13, 'lowpass', 3600, 0, out)); tone(t, 'sine', 160, 50, 0.5, 0.12, out); break;
    case 'magnum': echo(noiseHit(t, 0.8, 0.22, 'lowpass', 2600, 0, out, 0.8)); tone(t, 'sine', 120, 38, 0.8, 0.2, out); break;
    case 'rifle':  echo(noiseHit(t, 0.5, 0.11, 'lowpass', 2800, 0, out, 0.9)); tone(t, 'sine', 130, 45, 0.55, 0.1, out); break;
    case 'smg':    noiseHit(t, 0.42, 0.08, 'lowpass', 3200, 0, out, 1.1); tone(t, 'sine', 150, 60, 0.35, 0.07, out); break;
    case 'lmg':    noiseHit(t, 0.5, 0.1, 'lowpass', 2200, 0, out, 0.85); tone(t, 'sine', 110, 40, 0.55, 0.09, out); break;
    case 'dmr':    echo(noiseHit(t, 0.6, 0.16, 'lowpass', 3000, 0, out, 0.85)); tone(t, 'sine', 140, 40, 0.6, 0.14, out); break;
    case 'sniper': echo(noiseHit(t, 0.95, 0.35, 'lowpass', 2400, 0, out, 0.7)); tone(t, 'sine', 100, 30, 0.9, 0.3, out); noiseHit(t + 0.4, 0.12, 0.08, 'bandpass', 2600, 5, out); break;
    case 'shotgun':echo(noiseHit(t, 0.8, 0.28, 'lowpass', 1700, 0, out, 0.75)); tone(t, 'sine', 110, 38, 0.8, 0.22, out); break;
    case 'launcher': noiseHit(t, 0.4, 0.12, 'lowpass', 900, 0, out, 0.6); tone(t, 'sine', 180, 70, 0.5, 0.15, out); break;
    case 'flamer': noiseHit(t, 0.18, 0.12, 'bandpass', 700, 0.8, out, 0.5); break;
    case 'tesla':  tone(t, 'sawtooth', 1800, 300, 0.12, 0.16, out); noiseHit(t, 0.35, 0.14, 'highpass', 3000, 0, out, 1.5); break;
    case 'cryo':   noiseHit(t, 0.25, 0.1, 'highpass', 4000, 0, out, 1.2); tone(t, 'sine', 1600, 900, 0.08, 0.1, out); break;
    case 'ray':    tone(t, 'square', 1400, 200, 0.12, 0.22, out); tone(t, 'sine', 700, 120, 0.2, 0.22, out); break;
    case 'void':   tone(t, 'sawtooth', 80, 30, 0.4, 0.5, out); tone(t, 'sine', 400, 40, 0.3, 0.5, out); break;
    case 'zap':    tone(t, 'sawtooth', 2200, 400, 0.08, 0.1, out); break;
    case 'dry':    noiseHit(t, 0.15, 0.03, 'bandpass', 3000, 6); break;
    case 'reload': noiseHit(t, 0.18, 0.04, 'bandpass', 2400, 5); noiseHit(t + 0.22*(opt.k||1), 0.2, 0.05, 'bandpass', 1500, 5); noiseHit(t + 0.5*(opt.k||1), 0.22, 0.04, 'bandpass', 2800, 6); break;
    case 'hit':    tone(t, 'triangle', 2600, 2100, 0.12, 0.035); break;
    case 'head':   tone(t, 'triangle', 3400, 2800, 0.16, 0.05); noiseHit(t, 0.18, 0.06, 'bandpass', 900, 2); break;
    case 'crit':   tone(t, 'triangle', 4200, 3600, 0.14, 0.05); tone(t + 0.04, 'triangle', 5000, 4400, 0.1, 0.05); break;
    case 'armor':  noiseHit(t, 0.25, 0.05, 'bandpass', 4200, 6, out); tone(t, 'square', 1900, 1700, 0.05, 0.04, out); break;
    case 'kill':   tone(t, 'sine', 180, 60, 0.32, 0.14); noiseHit(t, 0.22, 0.12, 'lowpass', 700); break;
    case 'melee':  noiseHit(t, 0.2, 0.12, 'bandpass', 1200, 1.5, null, 1.6); break;
    case 'meleeHit': tone(t, 'sine', 140, 55, 0.5, 0.12); noiseHit(t, 0.3, 0.08, 'lowpass', 900); break;
    case 'boom':   noiseHit(t, 1.0, 0.9, 'lowpass', 600, 0, out, 0.6); tone(t, 'sine', 70, 28, 0.9, 0.7, out); noiseHit(t, 0.4, 0.2, 'highpass', 2000, 0, out); break;
    case 'splat':  noiseHit(t, 0.7, 0.5, 'lowpass', 900, 0, out, 0.8); tone(t, 'sine', 90, 40, 0.5, 0.35, out); break;
    case 'throw':  noiseHit(t, 0.12, 0.15, 'bandpass', 900, 1.5); break;
    case 'hurt':   tone(t, 'sine', 90, 45, 0.6, 0.25); noiseHit(t, 0.3, 0.12, 'lowpass', 500); break;
    case 'swap':   noiseHit(t, 0.15, 0.05, 'bandpass', 2000, 4); noiseHit(t + 0.15, 0.15, 0.05, 'bandpass', 1400, 4); break;
    case 'pickup': tone(t, 'triangle', 660, 0, 0.16, 0.08); tone(t + 0.08, 'triangle', 990, 0, 0.16, 0.14); break;
    case 'powerup':[523, 784, 1046, 1568].forEach((f, i)=>tone(t + i*0.06, 'square', f, 0, 0.06, 0.2)); break;
    case 'buy':    tone(t, 'triangle', 880, 0, 0.14, 0.08); tone(t + 0.07, 'triangle', 1320, 0, 0.14, 0.18); noiseHit(t, 0.1, 0.06, 'highpass', 5000); break;
    case 'deny':   tone(t, 'square', 180, 150, 0.08, 0.18); break;
    case 'door':   noiseHit(t, 0.5, 0.9, 'lowpass', 500, 0, out, 0.5); tone(t, 'sawtooth', 70, 50, 0.12, 0.8, out); break;
    case 'creak':  tone(t, 'sawtooth', 220, 160, 0.06, 1.2, out); tone(t + 0.3, 'sawtooth', 260, 180, 0.05, 0.9, out); break;
    case 'objective': [523, 659, 784, 1046].forEach((f, i)=>tone(t + i*0.09, 'triangle', f, 0, 0.14, 0.4)); break;
    case 'fail':   [392, 330, 262].forEach((f, i)=>tone(t + i*0.18, 'sawtooth', f, f*0.98, 0.1, 0.5)); break;
    case 'down':   tone(t, 'sawtooth', 220, 110, 0.18, 0.6); break;
    case 'revive': [440, 554, 659].forEach((f, i)=>tone(t + i*0.08, 'triangle', f, 0, 0.14, 0.25)); break;
    case 'blip':   tone(t, 'square', 1200, 0, 0.04, 0.05); break;
    case 'beep':   tone(t, 'sine', opt.f || 1400, 0, 0.12, 0.08); break;
    case 'ult':    tone(t, 'sawtooth', 220, 880, 0.12, 0.45); noiseHit(t, 0.3, 0.5, 'bandpass', 1200, 1); break;
    case 'level':  [523, 659, 784, 1046, 1318].forEach((f, i)=>tone(t + i*0.08, 'triangle', f, 0, 0.12, 0.5)); break;
    case 'wave':   [196, 233, 196, 147].forEach((f, i)=>tone(t + i*0.32, 'sawtooth', f, f, 0.1, 0.5, null, 0.05)); noiseHit(t, 0.25, 1.6, 'lowpass', 300); break;
    case 'waveEnd':[392, 466, 523].forEach((f, i)=>tone(t + i*0.2, 'triangle', f, 0, 0.12, 0.6)); break;
    case 'boss':   [55, 58, 52].forEach((f, i)=>tone(t + i*0.5, 'sawtooth', f, f*0.9, 0.22, 1.2, null, 0.1)); noiseHit(t, 0.6, 2.4, 'lowpass', 220); break;
    case 'roar':   { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t); o.frequency.linearRampToValueAtTime(55, t + 1.2);
      const lfo = ac.createOscillator(); lfo.frequency.value = 22; const lg = ac.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; const g = ac.createGain(); env(g, t, 0.5, 0.08, 1.3);
      o.connect(lp); lp.connect(g); g.connect(out); o.start(t); lfo.start(t); o.stop(t + 1.5); lfo.stop(t + 1.5); noiseHit(t, 0.4, 1.2, 'bandpass', 400, 1, out); break; }
    case 'stomp':  tone(t, 'sine', 60, 25, 0.9, 0.5, out); noiseHit(t, 0.6, 0.4, 'lowpass', 300, 0, out, 0.5); break;
    case 'spit':   noiseHit(t, 0.35, 0.2, 'bandpass', 1400, 2, out, 0.8); break;
    case 'blink':  tone(t, 'sine', 300, 1600, 0.12, 0.15, out); tone(t + 0.1, 'sine', 1600, 300, 0.1, 0.15, out); break;
    case 'heal':   tone(t, 'sine', 600, 900, 0.05, 0.3, out); break;
    case 'gas':    noiseHit(t, 0.3, 1.0, 'lowpass', 600, 0, out, 0.4); break;
    case 'freeze': noiseHit(t, 0.3, 0.3, 'highpass', 5000, 0, out); tone(t, 'sine', 2400, 1800, 0.06, 0.25, out); break;
    case 'box':    [262, 330, 392, 523, 392, 330].forEach((f, i)=>tone(t + i*0.22, 'triangle', f, 0, 0.1, 0.3)); break;
    case 'jackpot':[523, 659, 784, 1046, 1318, 1568].forEach((f, i)=>tone(t + i*0.07, 'square', f, 0, 0.08, 0.35)); break;
    case 'laugh':  [300, 260, 300, 240].forEach((f, i)=>tone(t + i*0.16, 'sawtooth', f, f*0.8, 0.08, 0.14)); break;
    case 'thunder':noiseHit(t + (opt.delay || 0), 0.8, 2.8, 'lowpass', 180, 0, null, 0.4); noiseHit(t + (opt.delay || 0), 0.4, 0.4, 'lowpass', 900, 0, null, 0.6); break;
    case 'siren':  { const o = ac.createOscillator(); o.type = 'sine'; const lfo = ac.createOscillator(); lfo.frequency.value = 0.35; const lg = ac.createGain(); lg.gain.value = 220;
      o.frequency.value = 640; lfo.connect(lg); lg.connect(o.frequency); const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 1); g.gain.linearRampToValueAtTime(0.0001, t + 7);
      o.connect(g); g.connect(A.ambBus); o.start(t); lfo.start(t); o.stop(t + 7.2); lfo.stop(t + 7.2); break; }
    case 'radio':  for(let i=0;i<6;i++) noiseHit(t + i*0.11 + Math.random()*0.05, 0.12, 0.08, 'bandpass', 1800 + Math.random()*800, 3); tone(t, 'square', 900, 0, 0.03, 0.08); break;
    case 'whisper':for(let i=0;i<5;i++) noiseHit(t + i*0.18, 0.1 + Math.random()*0.05, 0.25, 'bandpass', 2500 + Math.random()*1500, 6, out, 1.2); break;
    case 'step':   noiseHit(t, 0.16, 0.06, 'lowpass', 400, 0, out, 0.7); break;
    case 'glitch': tone(t, 'square', 80 + Math.random()*400, 0, 0.05, 0.08); noiseHit(t, 0.12, 0.1, 'highpass', 3000); break;
    case 'heart':  tone(t, 'sine', 60, 40, 0.5, 0.12); tone(t + 0.22, 'sine', 55, 38, 0.4, 0.12); break;
    case 'groan': {
      const o = ac.createOscillator(); o.type = 'sawtooth'; const f0 = (opt.big ? 55 : 80) + Math.random()*30; o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f0*(0.75 + Math.random()*0.2), t + 0.9);
      const lfo = ac.createOscillator(); lfo.frequency.value = 5 + Math.random()*4; const lg = ac.createGain(); lg.gain.value = 9; lfo.connect(lg); lg.connect(o.frequency);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520 + Math.random()*200; lp.Q.value = 3;
      const g = ac.createGain(), dur = 0.7 + Math.random()*0.6; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(out); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05); break; }
    case 'horde':  [55, 82.4, 110].forEach((f, i)=>{ const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
        o.connect(lp); lp.connect(g); g.connect(A.sfxBus); o.start(t + i*0.05); o.stop(t + 2.6); }); break;
  }
};

// ---- looping sounds: ambience per map, rotors, flames ------------------------------
const loops = {};
function loopNoise(key, freq, type, q, gain, bus, rate){
  if(!A.ctx) return null; if(loops[key]) return loops[key];
  const ac = A.ctx, n = ac.createBufferSource(); n.buffer = A.noise; n.loop = true; n.playbackRate.value = rate || 1;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; if(q) f.Q.value = q;
  const g = ac.createGain(); g.gain.value = gain; n.connect(f); f.connect(g); g.connect(bus || A.ambBus); n.start();
  return loops[key] = { n, f, g, stop(){ try{ n.stop(); }catch(e){} delete loops[key]; } };
}
A.loop = function(key, on, level){
  if(!A.ctx) return;
  if(!on){ if(loops[key]) loops[key].stop(); return; }
  let l = loops[key];
  if(!l){ if(key === 'rotor'){ l = loopNoise('rotor', 260, 'lowpass', 0, 0, A.sfxBus); const lfo = A.ctx.createOscillator(); lfo.frequency.value = 11; const lg = A.ctx.createGain(); lg.gain.value = 0.12; lfo.connect(lg); lg.connect(l.g.gain); lfo.start(); const st = l.stop; l.stop = ()=>{ try{ lfo.stop(); }catch(e){} st(); }; }
    else if(key === 'flame') l = loopNoise('flame', 800, 'bandpass', 0.7, 0, A.sfxBus, 0.6);
    else if(key === 'train') l = loopNoise('train', 200, 'lowpass', 0, 0, A.sfxBus, 0.5); }
  if(l && level != null) l.g.gain.setTargetAtTime(level, A.ctx.currentTime, 0.08);
};
A.ambience = function(kind){
  A.pendingAmb = kind; if(!A.ctx) return;
  for(const k of ['amb1','amb2','amb3']) if(loops[k]) loops[k].stop();
  const set = { city:[[380,'bandpass',0.6,0.035],[1200,'highpass',0,0.02]], wind:[[300,'bandpass',0.4,0.06]], hum:[[120,'lowpass',0,0.05],[2400,'bandpass',8,0.006]],
    drip:[[200,'lowpass',0,0.04]], tunnel:[[90,'lowpass',0,0.07],[600,'bandpass',1,0.01]], forest:[[500,'bandpass',0.5,0.025],[3000,'highpass',0,0.008]],
    machines:[[150,'lowpass',0,0.06],[900,'bandpass',4,0.012]], sea:[[260,'lowpass',0,0.07]], cave:[[110,'lowpass',0,0.06]], menu:[[380,'bandpass',0.6,0.03]] }[kind] || [];
  set.forEach((s, i)=>loopNoise('amb' + (i + 1), s[0], s[1], s[2], s[3]));
  if(kind === 'sea' && loops.amb1){ const lfo = A.ctx.createOscillator(); lfo.frequency.value = 0.12; const lg = A.ctx.createGain(); lg.gain.value = 0.04; lfo.connect(lg); lg.connect(loops.amb1.g.gain); lfo.start(); }
};
A.rain = function(level){ if(!A.ctx) return; if(level <= 0){ if(loops.rain) loops.rain.stop(); return; } const l = loopNoise('rain', 2600, 'highpass', 0, 0); if(l) l.g.gain.setTargetAtTime(0.05*level, A.ctx.currentTime, 0.5); };

// ---- music: a small sequencer in a minor key; intensity adds layers -------------------
const Music = A.music = { on:false, step:0, next:0, intensity:0, target:0, boss:false, timer:0, bpm:92, root:45 };
const SCALE = [0, 2, 3, 5, 7, 8, 10];
const PROG = [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]];    // i - VI - VII - v
const mtof = m=>440*Math.pow(2, (m - 69)/12);
Music.start = function(){ if(Music.on || !A.ctx) return; Music.on = true; Music.next = A.ctx.currentTime + 0.1; Music.timer = setInterval(Music.schedule, 80); };
Music.set = function(intensity, boss){ Music.target = clamp(intensity, 0, 1); Music.boss = !!boss; };
Music.schedule = function(){
  const ac = A.ctx; if(!ac || ac.state !== 'running') return;
  Music.intensity += (Music.target - Music.intensity)*0.08;
  const bpm = Music.boss ? 128 : 84 + Music.intensity*30, sixteenth = 60/bpm/4, I = Music.intensity;
  while(Music.next < ac.currentTime + 0.25){
    const t = Music.next, s = Music.step % 64, bar = (Music.step >> 4) % 4, chord = PROG[bar], root = Music.root + (Music.boss ? -2 : 0), out = A.musicBus;
    if(s % 16 === 0){ // pad
      chord.forEach(iv=>{ const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(root + 12 + iv); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500 + I*900;
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + sixteenth*16);
        o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + sixteenth*16 + 0.1); }); }
    if(I > 0.15 && s % 4 === 0 || (Music.boss && s % 2 === 0)){ // bass pulse
      const n = root - 12 + chord[0] + (s % 8 === 6 ? 7 : 0); const o = ac.createOscillator(); o.type = Music.boss ? 'sawtooth' : 'triangle'; o.frequency.value = mtof(n);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300 + I*500; const g = ac.createGain(); env(g, t, 0.09 + I*0.06, 0.01, sixteenth*3);
      o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + sixteenth*4); }
    if(I > 0.35){ // drums
      if(s % 8 === 0 || (I > 0.75 && s % 8 === 6)){ tone(t, 'sine', 110, 40, 0.22*I, 0.18, out); }
      if(s % 8 === 4) noiseHit(t, 0.07*I, 0.12, 'bandpass', 1800, 0.8, out);
      if(I > 0.6 && s % 2 === 0) noiseHit(t, 0.02 + (s % 4 === 2 ? 0.015 : 0), 0.03, 'highpass', 7000, 0, out); }
    if(I > 0.55 && s % 4 === 2 && Math.random() < 0.5){ // arpeggio
      const deg = SCALE[(Music.step*3 + bar) % SCALE.length]; tone(t, 'square', mtof(root + 24 + deg), 0, 0.012 + I*0.01, sixteenth*1.6, out); }
    Music.next += sixteenth; Music.step++;
  }
};

})(window.ZD);

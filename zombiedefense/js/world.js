// Zombie Squad - the 3D side: renderer, lighting and weather, the generated maps,
// characters, zombies, bosses, mission and Survival objects, and effects.
(function(ZD){
let T = window.THREE;
const W = ZD.W = { lampSprites:[], anims:[], glowMats:[], lampMats:[], fires:[] };
let renderer, scene, camera, quality = 'high', shadows = true;
const geoCache = new Map(), matCache = new Map();
const rnd = (a, b)=>a + Math.random()*(b - a);
// boxes get softly rounded edges on Medium and High: the edges catch the light instead of ending in a hard line
function box(w, h, d){ const m = Math.min(w, h, d), round = phong && m >= 0.05, k = (round ? 'R' : '') + w+'|'+h+'|'+d; let g = geoCache.get(k);
  if(!g){ g = round ? rbox(w, h, d, Math.min(0.05, m*0.22)) : new T.BoxGeometry(w, h, d); geoCache.set(k, g); } return g; }
function sbox(w, h, d){ const k = 'S' + w + '|' + h + '|' + d; let g = geoCache.get(k); if(!g){ g = new T.BoxGeometry(w, h, d); geoCache.set(k, g); } return g; }
// a 3x3 grid per face; the rim rows stay on the flat face, the outer rows fold round onto a radius r
function rbox(w, h, d, r){
  const g = new T.BoxGeometry(1, 1, 1, 3, 3, 3), p = g.attributes.position, n = g.attributes.normal, hx = w/2, hy = h/2, hz = d/2;
  const at = (v, hh)=>Math.sign(v)*(Math.abs(v) > 0.4 ? hh : hh - r), cl = (v, a)=>v < -a ? -a : (v > a ? a : v);
  for(let i=0;i<p.count;i++){
    let x = at(p.getX(i), hx), y = at(p.getY(i), hy), z = at(p.getZ(i), hz);
    const ix = cl(x, hx - r), iy = cl(y, hy - r), iz = cl(z, hz - r); let ox = x - ix, oy = y - iy, oz = z - iz; const l = Math.hypot(ox, oy, oz);
    if(l > 1e-6){ ox /= l; oy /= l; oz /= l; x = ix + ox*r; y = iy + oy*r; z = iz + oz*r; n.setXYZ(i, ox, oy, oz); }
    p.setXYZ(i, x, y, z); }
  g.computeBoundingSphere(); return g;
}
// a box whose texture tiles every su x sv meters, so walls of any size share one material
function boxUV(w, h, d, su, sv){ const k = 'u'+w.toFixed(2)+'|'+h.toFixed(2)+'|'+d.toFixed(2)+'|'+su+'|'+sv; let g = geoCache.get(k);
  if(!g){ g = new T.BoxGeometry(w, h, d); const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for(let f=0; f<6; f++) for(let v=0; v<4; v++){ const i = f*4 + v; uv.setXY(i, uv.getX(i)*dims[f][0]/su, uv.getY(i)*dims[f][1]/(sv || su)); }
    geoCache.set(k, g); } return g; }
function cyl(rt, rb, h, seg){ const k = 'c'+rt+'|'+rb+'|'+h+'|'+(seg||8); let g = geoCache.get(k); if(!g){ g = new T.CylinderGeometry(rt, rb, h, seg||8); geoCache.set(k, g); } return g; }
function cone(r, h, seg){ const k = 'k'+r+'|'+h+'|'+(seg||7); let g = geoCache.get(k); if(!g){ g = new T.ConeGeometry(r, h, seg||7); geoCache.set(k, g); } return g; }
function sph(r, ws, hs){ const k = 's'+r+'|'+ws+'|'+hs; let g = geoCache.get(k); if(!g){ g = new T.SphereGeometry(r, ws||10, hs||8); geoCache.set(k, g); } return g; }
// ---- materials: per-pixel Phong on Medium and High (so muzzle flashes, blasts and the flashlight
// light the ground), Lambert on Low. Every lit material gets a shader patch: surfaces darken where
// they meet the ground, and characters (rim) catch a thin edge light in the mood's color.
let phong = true; const RIMU = { value:null };
const SHADE_V = 'varying vec3 vWPos; varying vec3 vWN;\n';
const SHADE_F = `{ float side = 1.0 - abs(vWN.y);
    gl_FragColor.rgb *= mix(1.0, 0.5 + 0.5*smoothstep(0.0, 1.5, vWPos.y), side*0.75);
    #ifdef RIM
    vec3 V = normalize(cameraPosition - vWPos); float r = 1.0 - clamp(dot(V, normalize(vWN)), 0.0, 1.0);
    gl_FragColor.rgb += rimColor*r*r*r*0.55;
    #endif
  }
  #include <tonemapping_fragment>`;
function patchMat(m, rim){
  if(rim){ m.defines = Object.assign(m.defines || {}, { RIM:'' }); }
  m.onBeforeCompile = function(sh){
    sh.uniforms.rimColor = RIMU;
    sh.vertexShader = SHADE_V + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vWPos = (modelMatrix*vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader = SHADE_V + 'uniform vec3 rimColor;\n' + sh.fragmentShader.replace('#include <tonemapping_fragment>', SHADE_F);
  };
  m.customProgramCacheKey = ()=>rim ? 'zs-rim' : 'zs';
  return m;
}
// opt.shine = [specular, shininess] (Phong only), opt.rim = edge light
function newMat(params){
  params = Object.assign({}, params); const shine = params.shine, rim = params.rim; delete params.shine; delete params.rim;
  const m = phong ? new T.MeshPhongMaterial(params) : new T.MeshLambertMaterial(params);
  if(phong){ m.specular.setHex(shine ? shine[0] : 0x0b0b0b); m.shininess = shine ? shine[1] : 10; }
  return patchMat(m, rim);
}
function keyOf(opt){ if(!opt) return ''; let s = ''; for(const k in opt){ const v = opt[k]; s += k + ':' + (v && v.isTexture ? v.uuid : (Array.isArray(v) ? v.join('/') : v)) + ','; } return s; }
function lam(color, opt){ const k = 'l'+color+'|'+keyOf(opt); let m = matCache.get(k);
  if(!m){ m = newMat(Object.assign({ color }, opt||{})); matCache.set(k, m); } return m; }
function basic(color, opt){ const k = 'b'+color+'|'+keyOf(opt); let m = matCache.get(k);
  if(!m){ m = new T.MeshBasicMaterial(Object.assign({ color }, opt||{})); matCache.set(k, m); } return m; }
function texMat(key, color, opt){ const k = 't'+key+'|'+(color||0xffffff)+'|'+keyOf(opt); let m = matCache.get(k);
  if(!m){ const p = Object.assign({ map:tex(key), color:color || 0xffffff }, opt || {});
    if(TEX[key + '_e']){ p.emissiveMap = TEX[key + '_e']; p.emissive = new T.Color(0xffffff); }
    m = newMat(p); if(p.emissiveMap) W.glowMats.push(m); matCache.set(k, m); } return m; }
function mesh(geo, mat, x, y, z, cast){ const m = new T.Mesh(geo, mat); m.position.set(x||0, y||0, z||0);
  if(shadows){ m.castShadow = cast !== false; m.receiveShadow = true; } return m; }
function glowSprite(color, size, opacity){ const s = new T.Sprite(new T.SpriteMaterial({ map:tex('soft'), color, transparent:true, opacity:opacity == null ? 0.5 : opacity, depthWrite:false, blending:T.AdditiveBlending }));
  s.scale.set(size, size, 1); return s; }
W.helpers = { box, boxUV, cyl, cone, sph, lam, basic, mesh, glowSprite, newMat, texMat };

// ---- canvas textures ----------------------------------------------------------
function canvasTex(w, h, draw, repeat){
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; if(repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4; return t;
}
function speckle(g, w, h, n, colors, rmin, rmax){
  for(let i=0;i<n;i++){ g.fillStyle = colors[(Math.random()*colors.length)|0]; g.globalAlpha = 0.25 + Math.random()*0.5;
    const r = rmin + Math.random()*(rmax-rmin); g.beginPath(); g.arc(Math.random()*w, Math.random()*h, r, 0, 7); g.fill(); }
  g.globalAlpha = 1;
}
function grid(g, w, h, nx, ny, color, lw){ g.strokeStyle = color; g.lineWidth = lw || 2;
  for(let i=0;i<=nx;i++){ g.beginPath(); g.moveTo(i*w/nx, 0); g.lineTo(i*w/nx, h); g.stroke(); }
  for(let i=0;i<=ny;i++){ g.beginPath(); g.moveTo(0, i*h/ny); g.lineTo(w, i*h/ny); g.stroke(); } }
function bricks(g, w, h, rows, cols, base, mortar){ g.fillStyle = mortar; g.fillRect(0, 0, w, h); const bh = h/rows, bw = w/cols;
  for(let r=0;r<rows;r++) for(let c=-1;c<=cols;c++){ const x = c*bw + (r % 2 ? bw/2 : 0); g.fillStyle = base[(Math.random()*base.length)|0]; g.fillRect(x + 1.5, r*bh + 1.5, bw - 3, bh - 3); } }
const STYLE = {
  police:   { wall:'#4a5a6e', trim:'#2a3442', win:'#1d2833', lit:'#ffe7a8' },
  brick:    { wall:'#7a3e30', trim:'#4a241c', win:'#1c1a1c', lit:'#ffd38a' },
  brick2:   { wall:'#6a4a3a', trim:'#3e2a20', win:'#1c1a1c', lit:'#ffd38a' },
  teal:     { wall:'#3e6a6a', trim:'#24403f', win:'#16222a', lit:'#bff2ff' },
  beige:    { wall:'#9a8a6e', trim:'#5a4e3c', win:'#1e1c1a', lit:'#ffe2a0' },
  beige2:   { wall:'#8a8270', trim:'#4e483c', win:'#1e1c1a', lit:'#ffe2a0' },
  diner:    { wall:'#8a2a2e', trim:'#e8dcc8', win:'#26201c', lit:'#ffb07a' },
};
const TEX = {};
const TEXDEF = {
  soft:()=>canvasTex(64, 64, (g)=>{ const r = g.createRadialGradient(32,32,0,32,32,32); r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(0.4,'rgba(255,255,255,.55)'); r.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0,0,64,64); }),
  flash:()=>canvasTex(128, 128, (g)=>{ g.translate(64,64); const r = g.createRadialGradient(0,0,0,0,0,64); r.addColorStop(0,'rgba(255,250,220,1)'); r.addColorStop(0.25,'rgba(255,200,90,.9)'); r.addColorStop(1,'rgba(255,120,30,0)');
    g.fillStyle = r; for(let i=0;i<6;i++){ g.rotate(Math.PI/3); g.beginPath(); g.moveTo(0,-7); g.lineTo(64,0); g.lineTo(0,7); g.fill(); } g.beginPath(); g.arc(0,0,22,0,7); g.fill(); }),
  ring:()=>canvasTex(128, 128, (g)=>{ g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(64,64,56,0,7); g.stroke(); g.lineWidth = 2; g.setLineDash([8,8]); g.beginPath(); g.arc(64,64,44,0,7); g.stroke(); }),
  helipad:()=>canvasTex(256, 256, (g)=>{ g.fillStyle = '#2c2e30'; g.fillRect(0,0,256,256); g.strokeStyle = '#e8e2c8'; g.lineWidth = 10; g.beginPath(); g.arc(128,128,104,0,7); g.stroke();
    g.fillStyle = '#e8e2c8'; g.fillRect(78,58,22,140); g.fillRect(156,58,22,140); g.fillRect(78,117,100,22); }),
  asphalt:()=>canvasTex(512, 512, (g,w,h)=>{ g.fillStyle = '#2a2b2e'; g.fillRect(0,0,w,h);
    speckle(g, w, h, 60, ['rgba(60,60,64,.25)','rgba(10,10,12,.3)'], 20, 70);                     // large patches break the tiling
    speckle(g, w, h, 6000, ['#2f3034','#25262a','#36373b','#1f2023','#3a3b3e'], 0.5, 2);
    g.fillStyle = 'rgba(20,20,22,.55)'; for(let i=0;i<3;i++){ const x = Math.random()*w, y = Math.random()*h; g.fillRect(x, y, 60 + Math.random()*90, 40 + Math.random()*70); }
    g.strokeStyle = 'rgba(8,8,10,.6)'; g.lineWidth = 1.6; for(let i=0;i<12;i++){ let x = Math.random()*w, y = Math.random()*h; g.beginPath(); g.moveTo(x,y); for(let k=0;k<7;k++){ x += (Math.random()-0.5)*60; y += (Math.random()-0.5)*60; g.lineTo(x,y); } g.stroke(); }
    speckle(g, w, h, 14, ['rgba(6,6,8,.45)','rgba(30,26,40,.35)'], 10, 30);
    g.fillStyle = 'rgba(210,200,160,.22)'; for(let y=20; y<h; y+=110) g.fillRect(w*0.5 - 4, y, 8, 55); }),
  walk:()=>canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#5a5a58'; g.fillRect(0,0,w,h); speckle(g, w, h, 400, ['#626260','#525250','#5e5e5c'], 0.5, 1.5); grid(g, w, h, 2, 2, 'rgba(20,20,20,.45)'); }),
  dirt:()=>canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#5a4e3a'; g.fillRect(0,0,w,h); speckle(g, w, h, 1400, ['#62553e','#4e4432','#6e6046','#463c2c'], 1, 4); speckle(g, w, h, 30, ['rgba(40,34,24,.5)'], 6, 16); }),
  grass:()=>canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#2b3a24'; g.fillRect(0,0,w,h); speckle(g, w, h, 1400, ['#33452a','#26341f','#3c4c2e','#2a3622','#40331f'], 1, 4); }),
  sand:()=>canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#c8a870'; g.fillRect(0,0,w,h); speckle(g, w, h, 1500, ['#d2b27a','#bc9c64','#d8bc88','#b09058'], 0.6, 3);
    g.strokeStyle = 'rgba(150,120,70,.25)'; g.lineWidth = 3; for(let i=0;i<10;i++){ const y = Math.random()*h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w*0.3, y - 10, w*0.6, y + 10, w, y); g.stroke(); } }),
  snow:()=>canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#e4eaf0'; g.fillRect(0,0,w,h); speckle(g, w, h, 900, ['#f4f8fc','#d4dce6','#c8d2de'], 1, 4); }),
  ceiltile:()=>canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#8a8c88'; g.fillRect(0,0,w,h); speckle(g, w, h, 900, ['rgba(0,0,0,.06)','rgba(255,255,255,.05)'], 0.5, 1.5);
    grid(g, w, h, 4, 4, 'rgba(40,42,40,.8)', 3); speckle(g, w, h, 6, ['rgba(90,70,40,.25)'], 6, 18); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(w*0.25 + 6, h*0.5 + 6, w*0.25 - 12, h*0.25 - 12);
    for(let x=w*0.25 + 12; x<w*0.5 - 8; x+=6) g.fillRect(x, h*0.5 + 10, 2, h*0.25 - 20); }),
  flame:()=>canvasTex(64, 64, (g)=>{ const r = g.createRadialGradient(32, 40, 0, 32, 36, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(46, 20, 56, 36, 52, 48); g.bezierCurveTo(48, 60, 16, 60, 12, 48); g.bezierCurveTo(8, 36, 18, 20, 32, 2); g.fill(); }),
  smoke:()=>canvasTex(128, 128, (g)=>{ g.clearRect(0,0,128,128); for(let i=0;i<22;i++){ const a = Math.random()*6.28, d = Math.random()*28, x = 64 + Math.cos(a)*d, y = 64 + Math.sin(a)*d, r = 18 + Math.random()*24;
      const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(255,255,255,.28)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 128, 128); } }),
  hole:()=>canvasTex(64, 64, (g)=>{ g.clearRect(0,0,64,64); const r = g.createRadialGradient(32,32,0,32,32,30); r.addColorStop(0,'rgba(5,5,5,1)'); r.addColorStop(0.18,'rgba(10,10,10,.95)'); r.addColorStop(0.3,'rgba(40,36,32,.6)'); r.addColorStop(1,'rgba(40,36,32,0)');
    g.fillStyle = r; g.fillRect(0,0,64,64); g.strokeStyle = 'rgba(10,10,10,.6)'; g.lineWidth = 1.5; for(let i=0;i<6;i++){ const a = Math.random()*6.28; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a)*(14 + Math.random()*14), 32 + Math.sin(a)*(14 + Math.random()*14)); g.stroke(); } }),
  blob:()=>canvasTex(64, 64, (g)=>{ const r = g.createRadialGradient(32,32,0,32,32,32); r.addColorStop(0,'rgba(0,0,0,1)'); r.addColorStop(0.45,'rgba(0,0,0,.7)'); r.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0,0,64,64); }),
  stain:()=>canvasTex(128, 128, (g,w,h)=>{ g.clearRect(0,0,w,h); for(let i=0;i<14;i++){ const x = 64 + (Math.random()-0.5)*60, y = 64 + (Math.random()-0.5)*60, r = 8 + Math.random()*26;
      const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(0,0,0,.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h); } }),
  puddle:()=>canvasTex(128, 128, (g,w,h)=>{ g.clearRect(0,0,w,h); g.fillStyle = '#fff'; for(let i=0;i<9;i++){ g.beginPath(); g.ellipse(64 + (Math.random()-0.5)*50, 64 + (Math.random()-0.5)*40, 14 + Math.random()*26, 10 + Math.random()*18, Math.random()*3, 0, 7); g.fill(); }
    const d = g.getImageData(0, 0, w, h); for(let i=3;i<d.data.length;i+=4){ const x = (i>>2) % w, y = (i>>2)/w|0, k = Math.min(x, y, w - x, h - y); if(k < 6) d.data[i] = 0; } g.putImageData(d, 0, 0); }),
  goo:()=>canvasTex(128, 128, (g,w,h)=>{ g.clearRect(0,0,w,h); for(let i=0;i<10;i++){ const a = Math.random()*6.28, r = Math.random()*34, x = 64 + Math.cos(a)*r, y = 64 + Math.sin(a)*r, rr = 4 + Math.random()*14;
      g.fillStyle = 'rgba(255,255,255,' + (0.6 + Math.random()*0.4) + ')'; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); }
    for(let i=0;i<16;i++){ g.beginPath(); const a = Math.random()*6.28; g.arc(64 + Math.cos(a)*(40 + Math.random()*18), 64 + Math.sin(a)*(40 + Math.random()*18), 1.5 + Math.random()*4, 0, 7); g.fill(); } }),
  // detail maps for characters: near white, so they shade the tuned colors instead of replacing them
  camo:()=>canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#e8e8e8'; g.fillRect(0,0,w,h); for(let i=0;i<26;i++){ g.fillStyle = ['rgba(0,0,0,.18)','rgba(0,0,0,.1)','rgba(255,255,255,.18)'][i%3]; g.beginPath();
      const x = Math.random()*w, y = Math.random()*h; g.ellipse(x, y, 8 + Math.random()*18, 5 + Math.random()*10, Math.random()*3, 0, 7); g.fill(); }
    speckle(g, w, h, 500, ['rgba(0,0,0,.08)','rgba(255,255,255,.08)'], 0.5, 1.5); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); }),
  gear:()=>canvasTex(64, 64, (g,w,h)=>{ g.fillStyle = '#e4e4e4'; g.fillRect(0,0,w,h); g.fillStyle = 'rgba(0,0,0,.22)'; for(let c=0;c<3;c++) g.fillRect(4 + c*20, 26, 16, 30); g.fillStyle = 'rgba(0,0,0,.35)';
    for(let c=0;c<3;c++) g.fillRect(4 + c*20, 26, 16, 4); g.fillRect(0, 12, w, 3); speckle(g, w, h, 120, ['rgba(0,0,0,.1)'], 0.5, 1.5); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); }),
  rot:()=>canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#e6e6e6'; g.fillRect(0,0,w,h); speckle(g, w, h, 60, ['rgba(70,20,40,.18)','rgba(0,0,0,.14)','rgba(255,255,200,.12)'], 4, 16);
    g.strokeStyle = 'rgba(60,20,60,.3)'; g.lineWidth = 1.2; for(let i=0;i<10;i++){ let x = Math.random()*w, y = Math.random()*h; g.beginPath(); g.moveTo(x, y); for(let k=0;k<5;k++){ x += (Math.random()-0.5)*24; y += Math.random()*14; g.lineTo(x, y); } g.stroke(); }
    speckle(g, w, h, 8, ['rgba(120,10,10,.45)'], 3, 8); speckle(g, w, h, 400, ['rgba(0,0,0,.08)'], 0.5, 1.5); }),
  rags:()=>canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#e2e2e2'; g.fillRect(0,0,w,h); speckle(g, w, h, 30, ['rgba(60,40,20,.25)','rgba(0,0,0,.2)'], 6, 22);
    speckle(g, w, h, 10, ['rgba(110,10,10,.55)','rgba(70,0,0,.5)'], 5, 14);
    for(let i=0;i<7;i++){ g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); const x = Math.random()*w, y = Math.random()*h; g.moveTo(x, y); for(let k=0;k<6;k++) g.lineTo(x + (Math.random()-0.5)*26, y + (Math.random()-0.5)*26); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 1; for(let y=0;y<h;y+=4){ g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }),
  concrete:()=>canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#6a6a66'; g.fillRect(0,0,w,h); speckle(g, w, h, 1200, ['#727270','#5e5e5a','#7a7a76','#565652'], 0.6, 2.5); grid(g, w, h, 2, 2, 'rgba(30,30,28,.35)', 2); speckle(g, w, h, 8, ['rgba(40,40,36,.35)'], 10, 30); }),
  tiles:()=>canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#c8ccc6'; g.fillRect(0,0,w,h); speckle(g, w, h, 300, ['#d0d4ce','#bcc0ba'], 0.5, 2); grid(g, w, h, 4, 4, 'rgba(80,90,86,.45)', 2); speckle(g, w, h, 6, ['rgba(90,70,50,.18)'], 4, 14); }),
  marble:()=>canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#e0d8cc'; g.fillRect(0,0,w,h); g.strokeStyle = 'rgba(150,140,130,.35)'; g.lineWidth = 1.5;
    for(let i=0;i<12;i++){ let x = Math.random()*w, y = Math.random()*h; g.beginPath(); g.moveTo(x,y); for(let k=0;k<6;k++){ x += (Math.random()-0.5)*60; y += (Math.random()-0.5)*60; g.lineTo(x,y); } g.stroke(); }
    grid(g, w, h, 2, 2, 'rgba(120,110,100,.45)', 2); }),
  metal:()=>canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#5a6066'; g.fillRect(0,0,w,h); g.fillStyle = 'rgba(255,255,255,.08)';
    for(let y=4;y<h;y+=12) for(let x=(y/12|0)%2*6;x<w;x+=12){ g.save(); g.translate(x, y); g.rotate(0.7); g.fillRect(-4, -1, 8, 2); g.restore(); } grid(g, w, h, 1, 1, 'rgba(20,24,28,.6)', 3); }),
  rock:()=>canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#3e3a40'; g.fillRect(0,0,w,h); speckle(g, w, h, 1300, ['#46424a','#36323a','#504a54','#2e2a30'], 1, 5); speckle(g, w, h, 20, ['rgba(20,16,24,.5)'], 8, 20); }),
  wood:()=>canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#6b4a2e'; g.fillRect(0,0,w,h); g.strokeStyle = 'rgba(40,24,12,.5)'; g.lineWidth = 2;
    for(let y=0;y<h;y+=16){ g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } speckle(g, w, h, 200, ['rgba(90,60,36,.6)','rgba(50,32,18,.5)'], 0.5, 2); }),
  // walls
  concwall:()=>canvasTex(128, 128, (g,w,h)=>{ bricks(g, w, h, 4, 2, ['#8a8a86','#82827e','#90908c'], '#5a5a56'); speckle(g, w, h, 300, ['rgba(0,0,0,.1)','rgba(255,255,255,.05)'], 0.5, 2); }),
  hesco:()=>canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#a89470'; g.fillRect(0,0,w,h); speckle(g, w, h, 500, ['#b8a47e','#988460'], 0.6, 2.5); grid(g, w, h, 8, 8, 'rgba(60,56,48,.55)', 1.5); grid(g, w, h, 2, 1, 'rgba(40,36,30,.8)', 4); }),
  tilewall:()=>canvasTex(128, 256, (g,w,h)=>{ g.fillStyle = '#d8dcd6'; g.fillRect(0,0,w,h); speckle(g, w, h, 200, ['rgba(0,0,0,.05)'], 0.5, 2);
    g.fillStyle = '#7aa894'; g.fillRect(0, h*0.62, w, h*0.38); grid(g, w, h*0.38, 6, 4, 'rgba(255,255,255,.35)', 1.5); g.save(); g.translate(0, h*0.62); grid(g, w, h*0.38, 6, 4, 'rgba(40,70,60,.5)', 1.5); g.restore();
    g.fillStyle = '#4a6e60'; g.fillRect(0, h*0.6, w, 6); speckle(g, w, h, 10, ['rgba(80,60,40,.18)'], 4, 12); }),
  metalwall:()=>canvasTex(128, 256, (g,w,h)=>{ g.fillStyle = '#4a5258'; g.fillRect(0,0,w,h); grid(g, w, h, 2, 4, 'rgba(20,24,28,.7)', 3);
    g.fillStyle = 'rgba(255,255,255,.25)'; for(let y=8;y<h;y+=64) for(let x=8;x<w;x+=64){ g.fillRect(x, y, 3, 3); g.fillRect(x + 48, y, 3, 3); }
    g.fillStyle = '#2ac8d8'; g.fillRect(0, h*0.7, w, 5); g.fillStyle = 'rgba(42,200,216,.25)'; g.fillRect(0, h*0.7 - 6, w, 17); }),
  shops:()=>canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#d8d0c4'; g.fillRect(0,0,w,h);
    const cols = ['#c83a3a','#3a7ac8','#e8b83a','#3ab878','#a84ac8','#e87a3a'];
    for(let i=0;i<2;i++){ const x = i*128; g.fillStyle = cols[(Math.random()*cols.length)|0]; g.fillRect(x + 8, 24, 112, 28);
      g.fillStyle = 'rgba(255,255,255,.9)'; g.font = 'bold 18px Arial'; g.textAlign = 'center'; g.fillText(['SALE','SHOES','TOYS','CAFE','TECH','BOOKS','SPORT','FASHION'][(Math.random()*8)|0], x + 64, 45);
      g.fillStyle = '#1e2a30'; g.fillRect(x + 12, 64, 104, 170); g.fillStyle = 'rgba(160,200,220,.25)'; g.fillRect(x + 16, 68, 46, 162); g.fillRect(x + 66, 68, 46, 162);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(x + 20, 68); g.lineTo(x + 40, 68); g.lineTo(x + 20, 140); g.fill(); } }),
  subtile:()=>canvasTex(128, 256, (g,w,h)=>{ g.fillStyle = '#d8d0b0'; g.fillRect(0,0,w,h); g.strokeStyle = 'rgba(90,84,60,.4)'; g.lineWidth = 1.5;
    for(let y=0;y<h;y+=10){ g.beginPath(); g.moveTo(0,y); g.lineTo(w,y); g.stroke(); for(let x=((y/10)|0)%2*10;x<w;x+=20){ g.beginPath(); g.moveTo(x,y); g.lineTo(x,y+10); g.stroke(); } }
    g.fillStyle = '#2a6a4a'; g.fillRect(0, h*0.45, w, 16); g.fillStyle = '#e8e0c0'; g.font = 'bold 12px Arial'; g.fillText('LINE 9', 30, h*0.45 + 12); speckle(g, w, h, 20, ['rgba(40,30,20,.2)'], 3, 10); }),
  brickwall:()=>canvasTex(128, 128, (g,w,h)=>{ bricks(g, w, h, 8, 4, ['#7a3e30','#6a3428','#84483a','#5e3024'], '#3a2a24'); speckle(g, w, h, 200, ['rgba(0,0,0,.15)'], 0.5, 2); }),
  rockwall:()=>canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#3a3640'; g.fillRect(0,0,w,h); for(let i=0;i<40;i++){ g.fillStyle = ['#46424c','#322e38','#524c58','#2a2630'][(Math.random()*4)|0];
    g.beginPath(); const x = Math.random()*w, y = Math.random()*h, r = 6 + Math.random()*16; g.moveTo(x - r, y); g.lineTo(x, y - r*0.7); g.lineTo(x + r, y); g.lineTo(x, y + r*0.7); g.fill(); } }),
  adobe:()=>canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#c09a6a'; g.fillRect(0,0,w,h); speckle(g, w, h, 500, ['#ccA676','#b08a5a','#d4b080'], 1, 3); speckle(g, w, h, 10, ['rgba(120,90,60,.3)'], 6, 16); }),
  logs:()=>canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#5a3e26'; g.fillRect(0,0,w,h); for(let x=0;x<w;x+=16){ g.fillStyle = ['#6a4a2e','#5e4028','#704e32'][(x/16)%3]; g.fillRect(x + 1, 0, 14, h); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x, 0, 2, h); } }),
  hlogs:()=>canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#5a3e26'; g.fillRect(0,0,w,h); for(let y=0;y<h;y+=16){ g.fillStyle = ['#6a4a2e','#5e4028','#704e32'][(y/16)%3]; g.fillRect(0, y + 1, w, 14); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, y, w, 2); } }),
  corrugated:()=>canvasTex(64, 64, (g,w,h)=>{ g.fillStyle = '#8a8a8a'; g.fillRect(0,0,w,h); for(let x=0;x<w;x+=8){ const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0,'rgba(0,0,0,.3)'); gr.addColorStop(0.5,'rgba(255,255,255,.15)'); gr.addColorStop(1,'rgba(0,0,0,.3)'); g.fillStyle = gr; g.fillRect(x, 0, 8, h); } }),
  crate:()=>canvasTex(64, 64, (g,w,h)=>{ g.fillStyle = '#8a6a40'; g.fillRect(0,0,w,h); g.strokeStyle = '#5a4026'; g.lineWidth = 5; g.strokeRect(3,3,w-6,h-6); g.beginPath(); g.moveTo(3,3); g.lineTo(w-3,h-3); g.stroke(); }),
  shelfgoods:()=>canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#3a3a3e'; g.fillRect(0,0,w,h); const cols = ['#c83a3a','#3a7ac8','#e8b83a','#3ab878','#e8e8e8','#e87a3a'];
    for(let r=0;r<4;r++){ g.fillStyle = '#6a6a6e'; g.fillRect(0, r*32 + 28, w, 4); for(let x=2;x<w-6;x+=8 + Math.random()*4){ g.fillStyle = cols[(Math.random()*cols.length)|0]; const hh = 10 + Math.random()*14; g.fillRect(x, r*32 + 28 - hh, 6 + Math.random()*3, hh); } } }),
  server:()=>canvasTex(64, 128, (g,w,h)=>{ g.fillStyle = '#1a1e22'; g.fillRect(0,0,w,h); for(let y=6;y<h;y+=10){ g.fillStyle = '#2a3036'; g.fillRect(4, y, w-8, 7); g.fillStyle = Math.random()<0.5 ? '#3aff7a' : '#ffb03a'; g.fillRect(8, y + 2, 3, 3); g.fillStyle = '#3ac8ff'; g.fillRect(14, y + 2, 3, 3); } }),
  trainwin:()=>canvasTex(256, 64, (g,w,h)=>{ g.fillStyle = '#b8bcc0'; g.fillRect(0,0,w,h); g.fillStyle = '#2a6a4a'; g.fillRect(0, h - 14, w, 6);
    for(let x=10;x<w;x+=50){ g.fillStyle = '#1a2026'; g.fillRect(x, 10, 36, 26); g.fillStyle = 'rgba(255,240,200,.15)'; g.fillRect(x + 2, 12, 14, 22); } }),
  bars:()=>canvasTex(64, 64, (g,w,h)=>{ g.clearRect(0,0,w,h); g.fillStyle = '#3a3e44'; for(let x=2;x<w;x+=10) g.fillRect(x, 0, 4, h); g.fillRect(0, 4, w, 4); g.fillRect(0, h - 8, w, 4); }),
  fence:()=>canvasTex(64, 64, (g,w,h)=>{ g.clearRect(0,0,w,h); g.strokeStyle = '#9aa0a6'; g.lineWidth = 2; for(let i=-h;i<w;i+=10){ g.beginPath(); g.moveTo(i,0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); } }),
  crack:()=>canvasTex(128, 128, (g,w,h)=>{ g.clearRect(0,0,w,h); g.strokeStyle = 'rgba(10,8,8,.75)'; g.lineWidth = 2.5;
    for(let i=0;i<7;i++){ let x = w/2, y = h/2; g.beginPath(); g.moveTo(x,y); for(let k=0;k<6;k++){ x += (Math.random()-0.5)*40; y += (Math.random()-0.5)*40; g.lineTo(x,y); } g.stroke(); } }),
  sky:()=>canvasTex(16, 256, (g,w,h)=>{ const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#d8d8d8'); gr.addColorStop(1, '#888888'); g.fillStyle = gr; g.fillRect(0,0,w,h); }),
};
function tex(key){ if(!TEX[key]){ if(STYLE[key]) TEX[key] = facadeTex(key); else TEX[key] = TEXDEF[key](); } return TEX[key]; }
W.tex = tex;
function facadeTex(style){
  const st = STYLE[style] || STYLE.beige, N = 512, glow = document.createElement('canvas'); glow.width = glow.height = N;
  const e = glow.getContext('2d'); e.fillStyle = '#000'; e.fillRect(0, 0, N, N);
  const t = canvasTex(N, N, (g, w, h)=>{
    g.fillStyle = st.wall; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2600, ['rgba(255,255,255,.05)', 'rgba(0,0,0,.10)', 'rgba(0,0,0,.06)'], 0.5, 2.2);
    if(style.startsWith('brick')){ g.globalAlpha = 0.28; bricks(g, w, h, 64, 16, ['rgba(0,0,0,.25)', 'rgba(255,255,255,.06)', 'rgba(0,0,0,.12)'], 'rgba(0,0,0,.35)'); g.globalAlpha = 1; }
    const fl = h/4, col = w/4;
    for(let r=0; r<4; r++){ const y0 = h - (r + 1)*fl;
      g.fillStyle = st.trim; g.fillRect(0, y0 + fl - 7, w, 7);                       // floor band
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y0 + fl, w, 3);
      for(let c=0; c<4; c++){ const x = c*col + col*0.2, ww = col*0.6;
        if(r === 0){ // street level: shop fronts and doors
          const y = y0 + fl*0.18, hh = fl*0.78, shop = (c + style.length) % 3 !== 0;
          g.fillStyle = st.trim; g.fillRect(x - 6, y - 6, ww + 12, hh + 6);
          g.fillStyle = shop ? '#141a1f' : '#2a2420'; g.fillRect(x, y, ww, hh);
          if(shop){ g.fillStyle = 'rgba(150,190,210,.16)'; g.fillRect(x + 3, y + 3, ww/2 - 4, hh - 6); g.fillRect(x + ww/2 + 1, y + 3, ww/2 - 4, hh - 6);
            const lit = Math.random() < 0.3; if(lit){ e.fillStyle = 'rgba(255,190,110,.32)'; e.fillRect(x + 3, y + 3, ww - 6, hh - 6); g.fillStyle = 'rgba(255,190,110,.35)'; g.fillRect(x + 3, y + 3, ww - 6, hh - 6); }
            const sc = ['#c83a3a', '#3a7ac8', '#e8b83a', '#3ab878', '#d86a2a'][(Math.random()*5)|0]; g.fillStyle = sc; g.fillRect(x - 6, y - 22, ww + 12, 14);
            if(Math.random() < 0.5){ e.fillStyle = sc; e.globalAlpha = 0.4; e.fillRect(x - 6, y - 22, ww + 12, 14); e.globalAlpha = 1; } }
          else { g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x + ww/2 - 1, y, 2, hh); }
          continue; }
        const y = y0 + fl*0.22, hh = fl*0.56;
        g.fillStyle = st.trim; g.fillRect(x - 5, y - 5, ww + 10, hh + 10); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x - 7, y + hh + 5, ww + 14, 5);
        const roll = Math.random();
        if(roll < 0.16){ const warm = g.createLinearGradient(0, y, 0, y + hh); warm.addColorStop(0, '#7a4a20'); warm.addColorStop(1, '#c8843a'); g.fillStyle = warm; g.fillRect(x, y, ww, hh);
          e.globalAlpha = 0.6; e.fillStyle = st.lit === '#bff2ff' ? '#6ab8d0' : '#ff9a40'; e.fillRect(x, y, ww, hh); e.globalAlpha = 1;
          g.fillStyle = 'rgba(80,50,20,.35)'; g.fillRect(x, y, ww, hh*0.3); e.fillStyle = 'rgba(0,0,0,.4)'; e.fillRect(x, y, ww, hh*0.3); }
        else if(roll < 0.3){ g.fillStyle = '#2a201a'; g.fillRect(x, y, ww, hh);                // boarded up
          for(let k=0; k<3; k++){ g.save(); g.translate(x + ww/2, y + hh*(0.2 + k*0.3)); g.rotate((Math.random() - 0.5)*0.35); g.fillStyle = ['#7a5a3a', '#6a4a2e', '#8a6a44'][k]; g.fillRect(-ww*0.6, -6, ww*1.2, 12); g.restore(); } }
        else { g.fillStyle = st.win; g.fillRect(x, y, ww, hh); g.fillStyle = 'rgba(160,190,220,.10)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + ww*0.45, y); g.lineTo(x, y + hh*0.7); g.fill();
          if(roll > 0.9){ g.strokeStyle = 'rgba(200,220,230,.35)'; g.lineWidth = 1; for(let k=0;k<4;k++){ g.beginPath(); g.moveTo(x + ww*0.5, y + hh*0.5); g.lineTo(x + Math.random()*ww, y + Math.random()*hh); g.stroke(); } } }
        g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x + ww/2 - 1, y, 2, hh); g.fillRect(x, y + hh*0.48, ww, 2);
        // grime runs down from the sill
        const gr = g.createLinearGradient(0, y + hh + 10, 0, y + hh + 70); gr.addColorStop(0, 'rgba(0,0,0,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, y + hh + 10, ww, 60); } }
    // dirt at the base and a little graffiti
    const base = g.createLinearGradient(0, h - 40, 0, h); base.addColorStop(0, 'rgba(0,0,0,0)'); base.addColorStop(1, 'rgba(10,8,6,.5)'); g.fillStyle = base; g.fillRect(0, h - 40, w, 40);
    if(Math.random() < 0.3){ g.font = 'bold 20px Bungee, Impact, sans-serif'; g.fillStyle = ['rgba(190,30,30,.6)', 'rgba(235,235,235,.35)'][(Math.random()*2)|0];
      g.save(); g.translate(w*(0.15 + Math.random()*0.5), h - fl*0.82); g.rotate(-0.06); g.fillText(['RUN', 'NO HOPE', 'HELP', 'DEAD ZONE', 'EVAC →', 'STAY OUT'][(Math.random()*6)|0], 0, 0); g.restore(); }
  });
  const et = new T.CanvasTexture(glow); et.wrapS = et.wrapT = T.RepeatWrapping; et.anisotropy = 4; TEX[style + '_e'] = et;
  return t;
}
// glyphs for the mystery: shared with the keypad UI
ZD.drawGlyph = function(g, idx, s, color){
  g.save(); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = s*0.07; g.lineCap = 'round'; g.lineJoin = 'round'; const c = s/2, r = s*0.36;
  g.beginPath();
  switch(idx){
    case 0: g.arc(c, c, r, 0, 7); g.stroke(); g.beginPath(); g.arc(c, c, s*0.07, 0, 7); g.fill(); break;
    case 1: g.arc(c, c, r, 0.6, 5.7); g.stroke(); g.beginPath(); g.arc(c + r*0.45, c, r*0.75, 1.9, 4.4, true); g.stroke(); break;
    case 2: g.moveTo(c, c - r); g.lineTo(c + r, c + r*0.8); g.lineTo(c - r, c + r*0.8); g.closePath(); g.stroke(); g.beginPath(); g.arc(c, c + r*0.2, r*0.25, 0, 7); g.fill(); break;
    case 3: g.moveTo(c - r*0.8, c - r); g.lineTo(c + r*0.8, c - r); g.lineTo(c - r*0.8, c + r); g.lineTo(c + r*0.8, c + r); g.closePath(); g.stroke(); break;
    case 4: for(let a=0; a<12; a+=0.2){ const rr = r*a/12; const x = c + Math.cos(a)*rr, y = c + Math.sin(a)*rr; if(a === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); break;
    case 5: g.arc(c, c, r*0.55, 0, 7); g.stroke(); g.beginPath(); g.moveTo(c, c - r); g.lineTo(c, c + r); g.moveTo(c - r, c); g.lineTo(c + r, c); g.stroke(); break;
    case 6: g.moveTo(c, c + r); g.lineTo(c, c - r); g.moveTo(c - r*0.7, c - r*0.6); g.quadraticCurveTo(c - r*0.7, c, c, c); g.quadraticCurveTo(c + r*0.7, c, c + r*0.7, c - r*0.6); g.stroke(); break;
    case 7: for(let k=-1;k<=1;k++){ const y = c + k*r*0.6; g.moveTo(c - r, y); g.bezierCurveTo(c - r*0.4, y - r*0.35, c + r*0.0, y + r*0.35, c + r, y - r*0.1); } g.stroke(); break;
    case 8: for(let k=0;k<5;k++){ const a = -Math.PI/2 + k*Math.PI*4/5; const x = c + Math.cos(a)*r, y = c + Math.sin(a)*r; if(k === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); g.stroke(); break;
  }
  g.restore();
};
function glyphTex(idx, order){ const k = 'glyph' + idx + '|' + order; if(!TEX[k]) TEX[k] = canvasTex(128, 160, (g, w, h)=>{ g.clearRect(0,0,w,h);
  ZD.drawGlyph(g, idx, 128, 'rgba(120,255,200,0.95)'); g.fillStyle = 'rgba(120,255,200,0.95)'; for(let i=0;i<=order;i++) g.fillRect(44 + i*16, 136, 8, 22); }); return TEX[k]; }
// a sprite with text, for labels and name tags
W.label = function(text, css, opt){ opt = opt || {};
  const c = document.createElement('canvas'); c.width = opt.w || 256; c.height = opt.h || 64; const t = new T.CanvasTexture(c);
  const s = new T.Sprite(new T.SpriteMaterial({ map:t, transparent:true, depthTest:opt.depthTest !== false ? (opt.depthTest == null ? true : opt.depthTest) : false, depthWrite:false }));
  s.userData.canvas = c; s.userData.tex = t; W.setLabel(s, text, css, opt);
  s.scale.set(opt.sx || 1.6, (opt.sx || 1.6)*c.height/c.width, 1); s.renderOrder = 10; return s; };
W.setLabel = function(s, text, css, opt){ opt = opt || {}; const c = s.userData.canvas, g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  const lines = String(text).split('\n'); const fs = opt.font || Math.min(38, c.height/lines.length*0.7);
  g.font = '700 ' + fs + 'px Oswald, Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((ln, i)=>{ const y = c.height*(i + 0.5)/lines.length; g.lineWidth = fs*0.2; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(ln, c.width/2, y); g.fillStyle = (Array.isArray(css) ? css[i] : css) || '#fff'; g.fillText(ln, c.width/2, y); });
  s.userData.tex.needsUpdate = true; };

// ---- init, lighting presets ---------------------------------------------------------
W.viewportSize = function(){ const m = W.mount; const w = (m && m.clientWidth) || innerWidth || 1, h = (m && m.clientHeight) || innerHeight || 1; return [Math.max(1, w), Math.max(1, h)]; };
W.init = function(mount, q, mobile){
  T = window.THREE; W.T = T; W.mount = mount; quality = q; shadows = q === 'high'; W.mobile = !!mobile; phong = q !== 'low';
  RIMU.value = new T.Color(0x3a4a66);
  // the post pass anti-aliases on Medium and High, so the canvas itself only does it on Low
  renderer = new T.WebGLRenderer({ antialias:q === 'low' && !mobile, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q === 'high' ? 2 : (q === 'medium' ? 1.5 : 1)));
  const [w, h] = W.viewportSize(); renderer.setSize(w, h);
  renderer.shadowMap.enabled = shadows; renderer.shadowMap.type = T.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);
  scene = new T.Scene(); scene.background = new T.Color(0x2a3442); scene.fog = new T.Fog(0x2e3846, 22, 80);
  camera = new T.PerspectiveCamera(68, w/h, 0.08, 260); camera.rotation.order = 'YXZ'; scene.add(camera);
  W.renderer = renderer; W.scene = scene; W.camera = camera;
  W.hemi = new T.HemisphereLight(0xa8b6d0, 0x3a3428, 1.05); scene.add(W.hemi);
  W.amb = new T.AmbientLight(0x404a5a, 0.3); scene.add(W.amb);
  const sun = new T.DirectionalLight(0xffd6a8, 0.85); sun.position.set(-30, 40, -20);
  if(shadows){ sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const s = sun.shadow.camera; s.left = -34; s.right = 34; s.top = 34; s.bottom = -34; s.near = 1; s.far = 120; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; }
  scene.add(sun); scene.add(sun.target); W.sun = sun;
  W.muzzleLight = new T.PointLight(0xffc27a, 0, 7, 2); scene.add(W.muzzleLight);
  W.lampLights = []; if(q === 'high') for(let i=0;i<4;i++){ const l = new T.PointLight(0xffb35a, 0, 13, 2); l.userData.src = null; scene.add(l); W.lampLights.push(l); }
  W.blastLight = new T.PointLight(0xff8a3a, 0, 16, 2); scene.add(W.blastLight);
  const fl = W.flash = new T.SpotLight(0xfff2d8, 0, 34, 0.5, 0.55, 1.4); fl.position.set(0, -0.15, -4.3); camera.add(fl); fl.target.position.set(0, -0.45, -6); camera.add(fl.target);
  W.horizon = new T.Sprite(new T.SpriteMaterial({ map:tex('soft'), color:0xff8a4a, transparent:true, opacity:0.35, fog:false, depthWrite:false, blending:T.AdditiveBlending }));
  W.horizon.scale.set(260, 90, 1); scene.add(W.horizon);
  initFx(); initWeather(); initSky(); W.post.init(renderer, q);
  W.lastSize = [w, h]; W.setEnv('dusk', 0);
};
W.follow = function(x, z){ W.focus = { x, z }; if(!W.sun) return; if(W.overhead) W.sun.position.set(x - 4, 40, z - 3); else W.sun.position.set(x - 30, 40, z - 20); W.sun.target.position.set(x, 0, z); if(W.weatherSys) W.weatherSys.center(x, z); };
W.sizeChanged = function(){ const [w, h] = W.viewportSize(); return w !== W.lastSize[0] || h !== W.lastSize[1]; };
W.resize = function(){ const [w, h] = W.viewportSize(); W.lastSize = [w, h]; renderer.setSize(w, h); camera.aspect = w/h; camera.updateProjectionMatrix();
  if(W.pUniforms) W.pUniforms.forEach(u=>u.uScale.value = h*renderer.getPixelRatio()*0.5); if(W.post) W.post.resize(true); };
W.quality = ()=>quality;
W.setQuality = function(q){ quality = q; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q === 'high' ? 2 : (q === 'medium' ? 1.5 : 1))); W.resize(); W.post.setQuality(q); };
W.render = function(){ if(W.sky.visible){ W.sky.position.copy(camera.position); W.sky.material.uniforms.time.value += 1/60; } W.post.render(scene, camera); };

// ---- the sky: a gradient dome with the sun or moon, drifting clouds and stars ------------------------
const SKY_V = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }';
const SKY_F = `uniform vec3 top, horizon, sunCol, cloudCol, sunDir; uniform float cloud, stars, time, moon; varying vec3 vDir;
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
  float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
    return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0; i<5; i++){ s += a*vn(p); p = p*2.03 + 1.7; a *= 0.5; } return s; }
  void main(){
    vec3 d = normalize(vDir); float h = d.y;
    vec3 col = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55));
    float sd = max(dot(d, normalize(sunDir)), 0.0);
    col += sunCol*(pow(sd, 32.0)*0.5 + pow(sd, 5.0)*0.22);
    // the disc: the sun burns white, the moon shows its seas and craters
    vec3 t1 = normalize(cross(sunDir, vec3(0.0, 1.0, 0.0))), t2 = cross(t1, normalize(sunDir)); vec2 lp = vec2(dot(d, t1), dot(d, t2))*90.0;
    float disc = smoothstep(0.99955, 0.99972, sd), seas = vn(lp*2.0 + 3.0)*0.6 + vn(lp*5.0)*0.4;
    vec3 dcol = sunCol*mix(3.2, 1.1 + smoothstep(0.35, 0.75, seas)*0.6, moon);
    float m = 0.0;
    if(h > 0.0){
      // two decks of cloud: the thin edges light up toward the sun or moon
      vec2 uv = d.xz/(h + 0.2)*1.3 + vec2(time*0.008, time*0.004), uv2 = d.xz/(h + 0.2)*2.7 + vec2(time*0.017, -time*0.006);
      float n1 = fbm(uv), n2 = fbm(uv2 + 7.3), m1 = smoothstep(0.44, 0.8, n1), m2 = smoothstep(0.56, 0.86, n2)*0.55;
      m = clamp(m1 + m2*(1.0 - m1), 0.0, 1.0)*smoothstep(0.0, 0.25, h)*cloud;
      float thin = 1.0 - smoothstep(0.5, 0.9, n1);
      vec3 cc = cloudCol*(0.8 + 0.35*(1.0 - n1)) + sunCol*(pow(sd, 4.0)*0.4 + pow(sd, 14.0)*thin*1.6);
      col = mix(col, cc, m*0.85);
      float st = step(0.9986, h3(floor(d*520.0)))*smoothstep(0.06, 0.45, h)*(1.0 - m);
      col += vec3(st*stars*(0.6 + 0.4*sin(time*3.0 + h3(floor(d*520.0) + 3.0)*40.0)));
    }
    col += dcol*disc*(1.0 - m*0.9);
    gl_FragColor = vec4(col, 1.0); }`;
function initSky(){
  const u = { top:{ value:new T.Color() }, horizon:{ value:new T.Color() }, sunCol:{ value:new T.Color() }, cloudCol:{ value:new T.Color() }, sunDir:{ value:new T.Vector3(0, 0.2, -1) },
    cloud:{ value:0.5 }, stars:{ value:0 }, time:{ value:0 }, moon:{ value:0 } };
  const sky = W.sky = new T.Mesh(new T.SphereGeometry(230, 32, 16), new T.ShaderMaterial({ uniforms:u, vertexShader:SKY_V, fragmentShader:SKY_F, side:T.BackSide, depthWrite:false, fog:false }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
}

const LOW_SUN = [-0.66, 0.1, -0.74], HIGH_SUN = [-0.55, 0.62, -0.56], MOON = [0.42, 0.38, -0.82];
const ENVS = {
  dusk:        { sky:0x2a3442, fog:[0x2e3846, 22, 85],  hemi:[0xa8b6d0, 0x3a3428, 1.05], amb:0.3,  sun:[0xffd6a8, 0.85], horizon:[0xff8a4a, 0.35], zen:0x0b1220, glow:[0xff8a4a, LOW_SUN], cloud:0.55, stars:0.3 },
  overcast:    { sky:0x7a828a, fog:[0x7e868e, 26, 100], hemi:[0xd0d8e0, 0x5a5440, 1.0],  amb:0.35, sun:[0xf0f0f0, 0.6],  horizon:[0xffffff, 0.1],  zen:0x48505a, glow:[0x6a6660, HIGH_SUN], cloud:0.95, stars:0 },
  day:         { sky:0xc8b48c, fog:[0xd0bc94, 30, 110], hemi:[0xfff0d8, 0x8a7050, 1.15], amb:0.35, sun:[0xfff2d8, 1.1],  horizon:[0xfff0c0, 0.3],  zen:0x4a7ab0, glow:[0xfff0c0, HIGH_SUN], cloud:0.3, stars:0 },
  snow:        { sky:0xb8c4d0, fog:[0xc8d2dc, 18, 80],  hemi:[0xe0e8f0, 0x8a96a4, 1.1],  amb:0.35, sun:[0xe8f0ff, 0.75], horizon:[0xffffff, 0.15], zen:0x6a84a0, glow:[0xc8d8f0, HIGH_SUN], cloud:0.75, stars:0 },
  night:       { sky:0x080c12, fog:[0x0a1016, 10, 55],  hemi:[0x4a5a7a, 0x10140c, 0.45], amb:0.18, sun:[0x8aa0d0, 0.25], horizon:[0x4a6a9a, 0.15], dark:true, zen:0x010208, glow:[0x9ab8f0, MOON], cloud:0.35, stars:1 },
  harbor:      { sky:0x3a4a58, fog:[0x4a5a66, 15, 75],  hemi:[0xa0b4c8, 0x3a3a34, 0.95], amb:0.3,  sun:[0xd8c8b0, 0.6],  horizon:[0xff9a6a, 0.2],  zen:0x162230, glow:[0xff9a6a, LOW_SUN], cloud:0.6, stars:0.1 },
  indoorGreen: { sky:0x0a0e0c, fog:[0x0e1210, 14, 60],  hemi:[0xc8e0d0, 0x2a302a, 0.9],  amb:0.3,  sun:[0xd8f0e0, 0.2],  horizon:[0, 0], indoor:true },
  indoorCyan:  { sky:0x060a0e, fog:[0x081016, 14, 60],  hemi:[0xb0e0f0, 0x203038, 0.9],  amb:0.3,  sun:[0xc0f0ff, 0.2],  horizon:[0, 0], indoor:true },
  indoorYellow:{ sky:0x0e0c08, fog:[0x14120c, 12, 55],  hemi:[0xe8d8a8, 0x302a20, 0.85], amb:0.28, sun:[0xffe0a0, 0.2],  horizon:[0, 0], indoor:true },
  indoorWarm:  { sky:0x100c0a, fog:[0x181410, 16, 70],  hemi:[0xffe8d0, 0x403028, 1.05], amb:0.35, sun:[0xfff0d8, 0.25], horizon:[0, 0], indoor:true },
  indoorDark:  { sky:0x050608, fog:[0x08090c, 9, 46],   hemi:[0x8a9ab0, 0x18181c, 0.55], amb:0.2,  sun:[0xb0c0d8, 0.1],  horizon:[0, 0], indoor:true, dark:true },
  indoorOrange:{ sky:0x0e0806, fog:[0x1a120c, 12, 60],  hemi:[0xffc890, 0x3a2a1a, 0.85], amb:0.3,  sun:[0xffb070, 0.2],  horizon:[0, 0], indoor:true },
  indoorPurple:{ sky:0x08060c, fog:[0x0e0a14, 10, 50],  hemi:[0xb8a0e0, 0x201828, 0.65], amb:0.22, sun:[0xc0a0ff, 0.1],  horizon:[0, 0], indoor:true, dark:true },
  blood:       { sky:0x2a0606, fog:[0x3a0808, 10, 52],  hemi:[0xff9a8a, 0x300a08, 0.85], amb:0.3,  sun:[0xff6a4a, 0.5],  horizon:[0xff2a1a, 0.4],  zen:0x0e0102, glow:[0xff2a1a, LOW_SUN], cloud:0.6, stars:0 },
};
const env = { from:null, to:null, t:1, dur:1, cur:null, mul:1, mulTarget:1, flash:0, name:'dusk' };
function envSnap(e){ const gl = e.glow || [0, [0, 0.2, -1]];
  return { sky:new T.Color(e.sky), fogC:new T.Color(e.fog[0]), near:e.fog[1], far:e.fog[2], hemiS:new T.Color(e.hemi[0]), hemiG:new T.Color(e.hemi[1]), hemiI:e.hemi[2],
  amb:e.amb, sunC:new T.Color(e.sun[0]), sunI:e.sun[1], horC:new T.Color(e.horizon[0] || 0), horO:e.horizon[1] || 0, dark:!!e.dark,
  zen:new T.Color(e.zen != null ? e.zen : e.sky), glowC:new T.Color(gl[0]), glowD:new T.Vector3(gl[1][0], gl[1][1], gl[1][2]).normalize(), cloud:e.cloud || 0, stars:e.stars || 0, moon:gl[1] === MOON ? 1 : 0 }; }
// an instant switch counts as done even before a frame has drawn it
W.setEnv = function(name, dur){ const e = ENVS[name] || ENVS.dusk; env.name = name;
  env.from = env.to && env.dur <= 0.001 ? Object.assign({}, env.to) : (env.cur ? Object.assign({}, env.cur) : envSnap(e));
  env.to = envSnap(e); env.t = 0; env.dur = Math.max(0.001, dur || 0); W.envDark = !!e.dark; W.envIndoor = !!e.indoor;
  if(W.post) W.post.mood(name, !!e.indoor, !dur); };
W.lightMul = function(m){ env.mulTarget = m; };
W.lightning = function(){ env.flash = 1; if(W.sky.visible) bolt(); };
// a forked bolt somewhere ahead in the sky, flickering with the flash
let boltL = null;
function bolt(){
  if(!boltL){ const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(160*3), 3));
    boltL = new T.LineSegments(g, new T.LineBasicMaterial({ color:new T.Color(3, 3.2, 4), transparent:true, opacity:1, blending:T.AdditiveBlending, depthWrite:false, fog:false })); boltL.frustumCulled = false; scene.add(boltL); boltL.t = 0; }
  const p = boltL.geometry.attributes.position.array, dir = new T.Vector3(); camera.getWorldDirection(dir);
  const a = Math.atan2(dir.x, dir.z) + (Math.random() - 0.5)*1.6, R = 80 + Math.random()*40; let n = 0;
  const seg = (x0, y0, z0, x1, y1, z1)=>{ if(n >= 160) return; p[n*3] = x0; p[n*3+1] = y0; p[n*3+2] = z0; p[n*3+3] = x1; p[n*3+4] = y1; p[n*3+5] = z1; n += 2; };
  const fork = (x, y, z, len, k)=>{ let cx = x, cy = y, cz = z; const steps = Math.round(len/4);
    for(let i=0;i<steps && n < 158;i++){ const nx = cx + (Math.random() - 0.5)*5, ny = cy - 3 - Math.random()*3, nz = cz + (Math.random() - 0.5)*5; seg(cx, cy, cz, nx, ny, nz); cx = nx; cy = ny; cz = nz;
      if(k > 0 && Math.random() < 0.18) fork(cx, cy, cz, len*0.35, k - 1); if(cy < 0) break; } };
  fork(camera.position.x + Math.sin(a)*R, 75, camera.position.z + Math.cos(a)*R, 80, 2);
  for(let i=n;i<160;i++){ p[i*3] = p[i*3+1] = p[i*3+2] = 0; }
  boltL.geometry.setDrawRange(0, n); boltL.geometry.attributes.position.needsUpdate = true; boltL.visible = true; boltL.t = 0.35;
}
function tickBolt(dt){ if(!boltL || !boltL.visible) return; boltL.t -= dt; boltL.material.opacity = boltL.t > 0.2 || (boltL.t > 0.06 && boltL.t < 0.12) ? 1 : 0.15; if(boltL.t <= 0) boltL.visible = false; }
function tickEnv(dt){
  if(!env.to) return; env.t = Math.min(1, env.t + dt/env.dur); const k = env.t, a = env.from, b = env.to, L = (x, y)=>x + (y - x)*k;
  const c = env.cur = { sky:a.sky.clone().lerp(b.sky, k), fogC:a.fogC.clone().lerp(b.fogC, k), near:L(a.near, b.near), far:L(a.far, b.far), hemiS:a.hemiS.clone().lerp(b.hemiS, k), hemiG:a.hemiG.clone().lerp(b.hemiG, k),
    hemiI:L(a.hemiI, b.hemiI), amb:L(a.amb, b.amb), sunC:a.sunC.clone().lerp(b.sunC, k), sunI:L(a.sunI, b.sunI), horC:a.horC.clone().lerp(b.horC, k), horO:L(a.horO, b.horO), dark:b.dark,
    zen:a.zen.clone().lerp(b.zen, k), glowC:a.glowC.clone().lerp(b.glowC, k), glowD:a.glowD.clone().lerp(b.glowD, k).normalize(), cloud:L(a.cloud, b.cloud), stars:L(a.stars, b.stars), moon:L(a.moon || 0, b.moon || 0) };
  env.mul += (env.mulTarget - env.mul)*Math.min(1, dt*6); env.flash = Math.max(0, env.flash - dt*3.5);
  const m = env.mul, f = env.flash > 0.6 || (env.flash > 0.2 && env.flash < 0.35) ? env.flash*1.6 : 0;
  scene.background.copy(c.sky).multiplyScalar(Math.max(0.25, m) + f*0.8); scene.fog.color.copy(c.fogC).multiplyScalar(Math.max(0.3, m) + f*0.5);
  scene.fog.near = c.near*(0.6 + 0.4*m); scene.fog.far = c.far*(0.55 + 0.45*m);
  W.hemi.color.copy(c.hemiS); W.hemi.groundColor.copy(c.hemiG); W.hemi.intensity = c.hemiI*m + f*1.4; W.amb.intensity = c.amb*m + f*0.3;
  W.sun.color.copy(c.sunC); W.sun.intensity = (c.sunI*(W.overhead && shadows ? 2.2 : 1))*m + f*0.6;
  W.horizon.material.color.copy(c.horC); W.horizon.material.opacity = c.horO*m;
  const u = W.sky.material.uniforms, sm = Math.max(0.3, m) + f*0.8;
  u.horizon.value.copy(scene.fog.color); u.top.value.copy(c.zen).multiplyScalar(sm); u.sunCol.value.copy(c.glowC).multiplyScalar(Math.max(0.2, m));
  u.cloudCol.value.copy(scene.fog.color).multiplyScalar(c.dark ? 1.4 : 1.08).lerp(c.zen, 0.2); u.sunDir.value.copy(c.glowD); u.cloud.value = c.cloud; u.stars.value = c.stars*m; u.moon.value = c.moon;
  RIMU.value.copy(c.hemiS).multiplyScalar(0.16*m).add(c.glowC.clone().multiplyScalar(0.14*m));
  W.flashAmt = f*0.12;
}
W.flashlight = function(on, power){ W.flash.intensity = on ? (power == null ? 2.2 : power) : 0; };

// ---- weather: particles that follow the camera ----------------------------------------
function initWeather(){
  const N = 1400, pos = new Float32Array(N*6), geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  const rain = new T.LineSegments(geo, new T.LineBasicMaterial({ color:0xb8c8d8, transparent:true, opacity:0.32, depthWrite:false })); rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  const M = 1600, ppos = new Float32Array(M*3), pgeo = new T.BufferGeometry(); pgeo.setAttribute('position', new T.BufferAttribute(ppos, 3));
  const flakes = new T.Points(pgeo, new T.PointsMaterial({ map:tex('soft'), color:0xffffff, size:0.16, transparent:true, opacity:0.85, depthWrite:false })); flakes.frustumCulled = false; flakes.visible = false; scene.add(flakes);
  const sys = W.weatherSys = { kind:null, rain, flakes, cx:0, cz:0, N, M, vel:new Float32Array(M*3),
    center(x, z){ this.cx = x; this.cz = z; },
    set(kind, outdoor){ this.kind = kind; rain.visible = kind === 'rain' || kind === 'storm'; this.splash = rain.visible && outdoor !== false; flakes.visible = kind === 'snow' || kind === 'sand' || kind === 'fog' || kind === 'wind';
      const mat = flakes.material; mat.color.set(kind === 'sand' ? 0xd8b880 : (kind === 'fog' ? 0xc8d8c8 : (kind === 'wind' ? 0xb8a890 : 0xffffff)));
      mat.size = kind === 'snow' ? 0.16 : (kind === 'fog' ? 0.5 : 0.08); mat.opacity = kind === 'fog' ? 0.12 : (kind === 'wind' ? 0.35 : 0.85);
      for(let i=0;i<this.N;i++) this.resetDrop(i, true); for(let i=0;i<this.M;i++) this.resetFlake(i, true);
      rain.geometry.attributes.position.needsUpdate = true; flakes.geometry.attributes.position.needsUpdate = true; },
    resetDrop(i, any){ const p = rain.geometry.attributes.position.array, x = this.cx + (Math.random() - 0.5)*44, z = this.cz + (Math.random() - 0.5)*44, y = any ? Math.random()*22 : 20 + Math.random()*4;
      p[i*6] = x; p[i*6+1] = y; p[i*6+2] = z; p[i*6+3] = x + 0.08; p[i*6+4] = y + 0.7; p[i*6+5] = z + 0.04; },
    resetFlake(i, any){ const p = flakes.geometry.attributes.position.array, v = this.vel, k = this.kind;
      p[i*3] = this.cx + (Math.random() - 0.5)*48; p[i*3+1] = k === 'sand' || k === 'wind' ? Math.random()*4 : (any ? Math.random()*18 : 16 + Math.random()*3); p[i*3+2] = this.cz + (Math.random() - 0.5)*48;
      if(k === 'snow'){ v[i*3] = (Math.random() - 0.5)*0.6; v[i*3+1] = -1.2 - Math.random()*0.8; v[i*3+2] = (Math.random() - 0.5)*0.6; }
      else if(k === 'sand' || k === 'wind'){ v[i*3] = 6 + Math.random()*5; v[i*3+1] = (Math.random() - 0.5)*0.4; v[i*3+2] = 2 + Math.random()*2; }
      else { v[i*3] = (Math.random() - 0.5)*0.3; v[i*3+1] = (Math.random() - 0.5)*0.1; v[i*3+2] = (Math.random() - 0.5)*0.3; } },
    tick(dt){
      if(rain.visible){ const p = rain.geometry.attributes.position.array, d = 22*dt;
        for(let i=0;i<this.N;i++){ p[i*6+1] -= d; p[i*6+4] -= d; p[i*6] -= d*0.08; p[i*6+3] -= d*0.08;
          if(p[i*6+1] < 0 || Math.abs(p[i*6] - this.cx) > 24 || Math.abs(p[i*6+2] - this.cz) > 24) this.resetDrop(i, false); }
        rain.geometry.attributes.position.needsUpdate = true; if(this.splash) rainSplashes(dt, this.cx, this.cz); }
      if(flakes.visible){ const p = flakes.geometry.attributes.position.array, v = this.vel, n = this.kind === 'wind' ? 300 : (this.kind === 'fog' ? 400 : this.M);
        for(let i=0;i<n;i++){ p[i*3] += v[i*3]*dt; p[i*3+1] += v[i*3+1]*dt; p[i*3+2] += v[i*3+2]*dt;
          if(p[i*3+1] < 0 || p[i*3+1] > 20 || Math.abs(p[i*3] - this.cx) > 25 || Math.abs(p[i*3+2] - this.cz) > 25) this.resetFlake(i, false); }
        flakes.geometry.setDrawRange(0, n); flakes.geometry.attributes.position.needsUpdate = true; } },
  };
}
W.setWeather = function(kind, outdoor){ W.weatherSys.set(kind, outdoor); };

// ---- static batching: one draw call per material for everything that never moves -----------
function batchStatic(root){
  root.updateMatrixWorld(true);
  const buckets = new Map(), kill = [];
  root.traverse(o=>{ if(!o.isMesh || o.userData.dyn || Array.isArray(o.material)) return; let p = o.parent; while(p && p !== root){ if(p.userData.dyn) return; p = p.parent; }
    const k = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : ''); let b = buckets.get(k);
    if(!b){ b = { mat:o.material, cast:o.castShadow, recv:o.receiveShadow, list:[] }; buckets.set(k, b); } b.list.push(o); });
  const out = new T.Group(); out.userData.merged = true;
  for(const b of buckets.values()){
    if(b.list.length < 2) continue;
    let count = 0; const geos = [];
    for(const m of b.list){ let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrixWorld); geos.push(g); count += g.attributes.position.count; }
    const pos = new Float32Array(count*3), nor = new Float32Array(count*3), uv = new Float32Array(count*2); let o = 0;
    for(const g of geos){ const n = g.attributes.position.count; pos.set(g.attributes.position.array, o*3); if(g.attributes.normal) nor.set(g.attributes.normal.array, o*3); if(g.attributes.uv) uv.set(g.attributes.uv.array, o*2); o += n; g.dispose(); }
    const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.BufferAttribute(pos, 3)); bg.setAttribute('normal', new T.BufferAttribute(nor, 3)); bg.setAttribute('uv', new T.BufferAttribute(uv, 2));
    bg.computeBoundingSphere(); const mm = new T.Mesh(bg, b.mat); mm.castShadow = b.cast; mm.receiveShadow = b.recv; out.add(mm);
    for(const m of b.list) kill.push(m);
  }
  for(const m of kill) m.parent.remove(m);
  root.add(out);
}

// ---- building a generated map ---------------------------------------------------------------
const WALLSTYLE = {
  facade:{ tex:null, su:12, sv:12.8 }, hesco:{ tex:'hesco', su:2.4, sv:3.2 }, tile:{ tex:'tilewall', su:3, sv:null }, metal:{ tex:'metalwall', su:3, sv:null },
  concrete:{ tex:'concwall', su:3, sv:3 }, shops:{ tex:'shops', su:7, sv:null }, subtile:{ tex:'subtile', su:3, sv:null }, treeline:{ tex:null },
  brickin:{ tex:'brickwall', su:3, sv:3 }, containers:{ tex:null }, rock:{ tex:'rockwall', su:4, sv:4 }, adobe:{ tex:'adobe', su:3, sv:3 }, palisade:{ tex:'logs', su:2, sv:null },
};
const FLOOR = { asphalt:['asphalt', 14], dirt:['dirt', 6], grass:['grass', 6], sand:['sand', 7], snow:['snow', 6], concrete:['concrete', 6], tiles:['tiles', 3], marble:['marble', 6], metal:['metal', 2.5], rock:['rock', 6] };
W.clearMap = function(){
  for(const g of [W.mapGroup, W.dynGroup]){ if(!g) continue; scene.remove(g);
    g.traverse(o=>{ if(o.userData && o.userData.ownGeo && o.geometry) o.geometry.dispose(); if(o.userData && o.userData.ownMap && o.material.map) o.material.map.dispose();
      if(o.isSprite && o.userData.tex){ o.userData.tex.dispose(); o.material.dispose(); }
      if(o.parent && o.parent.userData.merged && o.geometry) o.geometry.dispose(); }); }
  W.mapGroup = null; W.dynGroup = null; W.lampSprites = []; W.anims = []; W.fires = []; W.lampSrc = []; W.clearSplats(); clearBits();
  for(const l of (W.lampLights || [])){ l.userData.src = null; l.intensity = 0; } lampT = 0;
};
W.buildMap = function(M){
  W.clearMap(); W.M = M; W.lampsOn(1);
  const G = W.mapGroup = new T.Group(), D = W.dynGroup = new T.Group(); scene.add(G); scene.add(D);
  const TH = M.T, style = WALLSTYLE[TH.wall] || WALLSTYLE.concrete;
  // the floor
  const [fk, fs] = FLOOR[TH.floor] || FLOOR.concrete; const ft = tex(fk).clone(); ft.needsUpdate = true; ft.repeat.set((M.W + 40)/fs, (M.H + 40)/fs);
  const wet = (TH.weather === 'rain' || TH.weather === 'storm') && TH.outdoor;
  const floor = new T.Mesh(new T.PlaneGeometry(M.W + 40, M.H + 40), newMat({ map:ft, shine:wet ? [0x2c3036, 38] : (TH.floor === 'snow' || TH.floor === 'tiles' || TH.floor === 'marble' ? [0x1c1c1c, 24] : [0x0a0a0a, 8]) }));
  floor.rotation.x = -Math.PI/2; floor.receiveShadow = shadows; floor.userData.dyn = true; floor.userData.ownGeo = true; floor.userData.ownMap = true; G.add(floor);
  W.floorWet = wet ? 1 : 0; W.floorShine = { tiles:0.08, marble:0.1, metal:0.09, concrete:0.03 }[TH.floor] || 0;
  scatterDecals(G, M, wet);
  if(M.theme === 'city' && quality !== 'low') streetFurniture(G, M);
  if(!TH.outdoor && quality !== 'low') ceiling(G, M, TH);
  if(quality !== 'low' && (TH.floor === 'grass' || TH.floor === 'dirt')) G.add(makeGrass(M, TH.floor === 'dirt'));
  setWisps(quality !== 'low' && TH.outdoor && (TH.weather === 'fog' || TH.weather === 'wind' || M.theme === 'forest'));
  if(M.theme === 'city'){ // sidewalks along the zone walls
    const walk = texMat('walk', 0xc8c8c0);
    for(const z of M.zones){ const ib = M.inner(z), w = 2.4;
      for(const [x0, x1, z0, z1] of [[ib.x0, ib.x1, ib.z0, ib.z0 + w], [ib.x0, ib.x1, ib.z1 - w, ib.z1], [ib.x0, ib.x0 + w, ib.z0 + w, ib.z1 - w], [ib.x1 - w, ib.x1, ib.z0 + w, ib.z1 - w]]){
        const m = new T.Mesh(boxUV(x1 - x0, 0.03, z1 - z0, 2, 2), walk); m.position.set((x0 + x1)/2, 0.015, (z0 + z1)/2); m.receiveShadow = shadows; G.add(m); } } }
  if(M.T.evac === 'heli') for(const z of M.zones) if(z.kind === 'arena'){ const pad = new T.Mesh(new T.PlaneGeometry(12, 12), newMat({ map:tex('helipad'), polygonOffset:true, polygonOffsetFactor:-1 })); pad.rotation.x = -Math.PI/2; pad.position.set(z.cx, 0.03, z.cz); G.add(pad); }
  // walls
  const facades = ['brick','teal','beige','brick2','beige2','diner'];
  const contCols = [0x7a3b2a, 0x2e5a6e, 0x5a6a2e, 0x8a6a2a, 0x4a4a6a, 0x6a2e3a];
  for(const w of M.walls){
    if(w.collapse != null){ const o = new T.Group(); o.userData.dyn = true; G.add(o); w.obj = o; }
    const Gw = w.obj || G;
    const L = Math.max(w.x1 - w.x0, w.z1 - w.z0), along = (w.x1 - w.x0) >= (w.z1 - w.z0), cx = (w.x0 + w.x1)/2, cz = (w.z0 + w.z1)/2, bw = w.x1 - w.x0, bd = w.z1 - w.z0;
    if(TH.wall === 'treeline'){
      Gw.add(mesh(box(bw, 1.2, bd), lam(0x1e2a18), cx, 0.6, cz, false));
      for(let t=0; t<L; t+=1.6){ for(const off of [-0.6, 0.6]){ const x = along ? w.x0 + t + Math.random()*0.6 : cx + off*Math.min(1, bw), z = along ? cz + off*Math.min(1, bd) : w.z0 + t + Math.random()*0.6;
        Gw.add(treeMesh(x, z, 5 + Math.random()*3, M.theme === 'snow')); } }
      continue; }
    if(TH.wall === 'containers'){
      for(let t=0, row=0; row<2; row++){ for(t=0; t<L - 0.1; t+=6){ const len = Math.min(6, L - t), c = contCols[(Math.random()*contCols.length)|0];
        const x = along ? w.x0 + t + len/2 : cx, z = along ? cz : w.z0 + t + len/2; Gw.add(mesh(boxUV(along ? len : bw, 2.6, along ? bd : len, 0.6, 2.6), texMat('corrugated', c), x, 1.3 + row*2.6, z)); } }
      continue; }
    let mat, fstyle = null;
    if(TH.wall === 'facade'){ fstyle = facades[(Math.random()*facades.length)|0]; mat = texMat(fstyle); }
    else mat = texMat(style.tex, TH.wall === 'adobe' ? 0xffffff : 0xffffff);
    const sv = style.sv || w.h;
    Gw.add(mesh(boxUV(bw, w.h, bd, style.su, sv), mat, cx, w.h/2, cz));
    if(TH.wall === 'facade'){ Gw.add(mesh(box(bw + 0.3, 0.35, bd + 0.3), lam(0x3a3430), cx, w.h + 0.17, cz));
      if(quality !== 'low') facadeDetail(Gw, fstyle, w.x0, w.x1, w.z0, w.z1, w.h, along ? ['z+', 'z-'] : ['x+', 'x-']); }
    else if(TH.wall === 'adobe'){ for(let t=0.5; t<L; t+=1.5){ const x = along ? w.x0 + t : cx, z = along ? cz : w.z0 + t; Gw.add(mesh(box(along ? 0.7 : bw, 0.4, along ? bd : 0.7), texMat('adobe'), x, w.h + 0.2, z)); } }
    else if(TH.wall === 'palisade'){ Gw.add(mesh(box(bw + 0.1, 0.18, bd + 0.1), lam(0xf0f4f8), cx, w.h + 0.08, cz, false)); }
    else if(TH.wall === 'hesco'){ Gw.add(mesh(box(bw + 0.05, 0.12, bd + 0.05), lam(0x6a5a40), cx, w.h + 0.06, cz)); }
    else if(TH.wall === 'rock'){ for(let t=0; t<L; t+=2.2){ const x = along ? w.x0 + t : cx + (Math.random() - 0.5)*0.4, z = along ? cz + (Math.random() - 0.5)*0.4 : w.z0 + t;
      const r = mesh(sph(0.9 + Math.random()*0.6, 6, 5), lam(0x3a3640), x, 0.3, z); r.scale.set(1, 0.7, 1); Gw.add(r); } }
    else if(!M.outdoor){ Gw.add(mesh(box(bw + 0.06, 0.25, bd + 0.06), lam(0x2a2a2a), cx, 0.12, cz, false)); }
  }
  for(const b of M.buildings) G.add(makeBuilding(b));
  for(const p of M.props) G.add(makeProp(p, M));
  for(const l of M.lamps) G.add(makeLamp(l, TH.lamps));
  // items that stay put go into the batch; the ones that animate or change go to the dynamic group
  W.items = [];
  for(const it of M.items){ const o = makeItemMesh(it, M); if(!o) continue; it.obj = o; (o.userData.dyn ? D : G).add(o); W.items.push(it); }
  // doors
  for(const d of M.doors){ const o = makeDoor(d, M); d.obj = o; D.add(o); }
  W.horizon.visible = false; W.sky.visible = !!TH.outdoor;
  for(const w of M.walls) if(w.obj) batchStatic(w.obj);      // walls that can fall batch on their own
  batchStatic(G);
  W.sun.castShadow = shadows; W.overhead = !TH.outdoor;     // indoors the shadows fall straight down, as from the ceiling lights
};
// indoor maps get a ceiling (seen only from below, so the camera never loses the hero), beams or a cave roof,
// and pipes running along the walls
function ceiling(G, M, TH){
  const H = TH.wallH[0], cave = M.theme === 'underground', key = cave ? 'rock' : ({ hospital:'ceiltile', mall:'ceiltile', lab:'ceiltile' }[M.theme] || 'concrete');
  const t = tex(key).clone(); t.needsUpdate = true; t.repeat.set((M.W + 40)/(cave ? 8 : 4), (M.H + 40)/(cave ? 8 : 4));
  const c = new T.Mesh(new T.PlaneGeometry(M.W + 40, M.H + 40), newMat({ map:t, color:cave ? 0x6a6470 : (key === 'ceiltile' ? 0x9a9c98 : 0x7a7a76) }));
  c.rotation.x = Math.PI/2; c.position.set(M.X0 + M.W/2, H + (cave ? 0.6 : 0), M.Z0 + M.H/2); c.userData.dyn = true; c.userData.ownGeo = true; c.userData.ownMap = true; G.add(c);
  const metal = lam(0x3a3e44, { shine:[0x333333, 30] }), pipeC = [lam(0x7a5a3a, { shine:[0x3a3a3a, 30] }), lam(0x5a6a7a, { shine:[0x3a3a3a, 30] }), lam(0x6a7a5a, { shine:[0x3a3a3a, 30] })];
  const flat = (geo, mat, x, y, z)=>{ const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.receiveShadow = shadows; G.add(m); return m; };
  if(cave){ for(let i=0;i<M.W*M.H/60;i++){ const s = flat(cone(0.25 + Math.random()*0.4, 0.8 + Math.random()*1.6, 6), lam(0x4a4452), M.X0 + Math.random()*M.W, H, M.Z0 + Math.random()*M.H);     // stalactites
      s.rotation.x = Math.PI; s.position.y = H + 0.3 - s.geometry.parameters.height/2; } return; }
  if(M.theme !== 'hospital' && M.theme !== 'mall') for(let x = M.X0 + 3; x < M.X0 + M.W; x += 6) flat(sbox(0.3, 0.42, M.H), metal, x, H - 0.21, M.Z0 + M.H/2);
  for(const z of M.zones){ const ib = M.inner(z);                                                                                   // pipes along one wall of each room
    const side = (z.i*7) % 4, y0 = H - 0.55;
    for(let k=0;k<2;k++){ const mat = pipeC[(z.i + k) % 3], y = y0 - k*0.32, r = 0.09 - k*0.025;
      if(side < 2){ const zz = side ? ib.z1 - 0.25 - k*0.05 : ib.z0 + 0.25 + k*0.05, p = flat(cyl(r, r, ib.x1 - ib.x0, 10), mat, (ib.x0 + ib.x1)/2, y, zz); p.rotation.z = Math.PI/2; }
      else { const xx = side === 3 ? ib.x1 - 0.25 - k*0.05 : ib.x0 + 0.25 + k*0.05, p = flat(cyl(r, r, ib.z1 - ib.z0, 10), mat, xx, y, (ib.z0 + ib.z1)/2); p.rotation.x = Math.PI/2; } }
    if(Math.random() < 0.7){ flat(sbox(1.2, 0.18, 0.8), metal, z.cx + (Math.random() - 0.5)*8, H - 0.09, z.cz + (Math.random() - 0.5)*8); } }       // an air vent
}
// hydrants, signs, trash bags and cones along the sidewalks: decoration, nothing to collide with
function streetFurniture(G, M){
  const solids = M.walls.concat(M.buildings, M.props, M.items.filter(i=>i.solid), M.doors.map(d=>d.box));
  const free = (x, z, r)=>!solids.some(b=>x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r);
  const red = lam(0xb8241e, { shine:[0x553333, 40] }), pole = lam(0x5a5e64, { shine:[0x333333, 30] }), bag = lam(0x18191c, { shine:[0x444444, 60] }), cone = lam(0xe0601a), white = lam(0xe8e8e0);
  const signs = [0x1e5aa8, 0xc8281e, 0x2a8a3a, 0xd8b020];
  for(const z of M.zones){ const ib = M.inner(z);
    for(let n=0; n<9; n++){
      const side = (Math.random()*4)|0, t = Math.random(), x = side < 2 ? ib.x0 + 1 + t*(ib.x1 - ib.x0 - 2) : (side === 2 ? ib.x0 + 1.1 : ib.x1 - 1.1), zz = side >= 2 ? ib.z0 + 1 + t*(ib.z1 - ib.z0 - 2) : (side === 0 ? ib.z0 + 1.1 : ib.z1 - 1.1);
      if(!free(x, zz, 0.7)) continue;
      const g = new T.Group(); g.position.set(x, 0, zz); g.rotation.y = Math.random()*6.28; const kind = Math.random();
      if(kind < 0.22){ g.add(mesh(cyl(0.16, 0.2, 0.62, 10), red, 0, 0.31, 0)); g.add(mesh(sph(0.17, 10, 6), red, 0, 0.64, 0)); g.add(mesh(cyl(0.07, 0.07, 0.5, 8), red, 0, 0.42, 0, false)).rotation.z = Math.PI/2; }
      else if(kind < 0.42){ g.add(mesh(cyl(0.05, 0.05, 2.6, 8), pole, 0, 1.3, 0)); const sg = mesh(sbox(0.62, 0.62, 0.04), basic(signs[(Math.random()*signs.length)|0]), 0, 2.35, 0.04, false); sg.rotation.z = Math.PI/4*(Math.random() < 0.5 ? 1 : 0); g.add(sg);
        g.add(mesh(sbox(0.5, 0.06, 0.05), white, 0, 2.35, 0.065, false)); }
      else if(kind < 0.72){ for(let b=0; b<2 + (Math.random()*3|0); b++){ const s = mesh(sph(0.32, 9, 7), bag, (Math.random() - 0.5)*0.9, 0.24, (Math.random() - 0.5)*0.7); s.scale.set(1, 0.75 + Math.random()*0.3, 0.9); g.add(s); } }
      else { for(let b=0; b<1 + (Math.random()*3|0); b++){ const c = new T.Group(); c.position.set((Math.random() - 0.5)*1.4, 0, (Math.random() - 0.5)*1.4);
        c.add(mesh(sbox(0.42, 0.04, 0.42), cone, 0, 0.02, 0)); c.add(mesh(cyl(0.03, 0.17, 0.62, 10), cone, 0, 0.33, 0)); c.add(mesh(cyl(0.085, 0.12, 0.12, 10), white, 0, 0.36, 0, false));
        if(Math.random() < 0.3){ c.rotation.z = Math.PI/2; c.position.y = 0.17; } g.add(c); } }
      G.add(g); } }
}
// stains everywhere, puddles where it rains: one shared material each, so the batch makes them one draw
let decalMats = null;
function scatterDecals(G, M, wet){
  if(!decalMats){ decalMats = {
    stain:new T.MeshBasicMaterial({ map:tex('stain'), transparent:true, opacity:0.75, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 }),
    crack:new T.MeshBasicMaterial({ map:tex('crack'), transparent:true, opacity:0.6, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 }),
    puddle:newMat({ color:0x07090c, alphaMap:tex('puddle'), transparent:true, opacity:0.62, depthWrite:false, shine:[0x7a8a9a, 70], polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3 }) }; }
  const geo = new T.PlaneGeometry(1, 1);
  const put = (mat, x, z, sz)=>{ const m = new T.Mesh(geo, mat); m.rotation.set(-Math.PI/2, 0, Math.random()*6.28); m.position.set(x, 0.012, z); m.scale.set(sz, sz*(0.6 + Math.random()*0.6), 1); m.renderOrder = 1; G.add(m); };
  for(const z of M.zones){ const ib = M.inner(z), w = ib.x1 - ib.x0, d = ib.z1 - ib.z0, n = Math.round(w*d/70);
    const at = ()=>[ib.x0 + 1 + Math.random()*(w - 2), ib.z0 + 1 + Math.random()*(d - 2)];
    for(let i=0;i<n;i++){ const [x, zz] = at(); put(decalMats.stain, x, zz, 2 + Math.random()*4); }
    for(let i=0;i<n*0.35;i++){ const [x, zz] = at(); put(decalMats.crack, x, zz, 1.5 + Math.random()*2.5); }
    if(wet) for(let i=0;i<n*0.6;i++){ const [x, zz] = at(); put(decalMats.puddle, x, zz, 2.2 + Math.random()*4); } }
}
// ---- grass: thousands of tufts in one instanced draw, swaying in the wind ------------------------------
const WIND = { value:0 };
function grassGeo(){
  const pos = [], col = [], nor = [];
  for(let b=0; b<8; b++){ const a = b*2.4 + Math.random()*0.5, w = 0.05 + Math.random()*0.03, ox = (Math.random() - 0.5)*0.34, oz = (Math.random() - 0.5)*0.34;
    const c = Math.cos(a), sn = Math.sin(a), h = 0.45 + Math.random()*0.55, lean = 0.12 + Math.random()*0.25;   // blades splay outward
    const px = -sn, pz = c;                                  // the blade faces sideways to its own lean
    pos.push(ox - px*w, 0, oz - pz*w,  ox + px*w, 0, oz + pz*w,  ox + c*lean, h, oz + sn*lean);
    col.push(0.3, 0.3, 0.3,  0.3, 0.3, 0.3,  1.15, 1.15, 1.0); for(let k=0;k<3;k++) nor.push(0, 1, 0); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  return g;
}
function makeGrass(M, dry){
  const n = quality === 'high' ? 15000 : 5500;
  const mat = new T.MeshLambertMaterial({ vertexColors:true, side:T.DoubleSide });
  mat.onBeforeCompile = sh=>{ sh.uniforms.uWind = WIND;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
      float sw = sin(uWind*1.6 + ip.x*0.33 + ip.z*0.21) + 0.45*sin(uWind*3.1 + ip.x*0.9 - ip.z*0.4);
      transformed.x += sw*0.09*position.y*position.y; transformed.z += sw*0.05*position.y*position.y;`); };
  const mesh = new T.InstancedMesh(grassGeo(), mat, n); mesh.frustumCulled = false; mesh.receiveShadow = shadows; mesh.userData.dyn = true; mesh.userData.ownGeo = true;
  const solids = M.walls.concat(M.buildings, M.props, M.items.filter(i=>i.solid)), free = (x, z)=>!solids.some(b=>x > b.x0 - 0.25 && x < b.x1 + 0.25 && z > b.z0 - 0.25 && z < b.z1 + 0.25);
  const zones = M.zones.map(z=>M.inner(z)), o = new T.Object3D(), c = new T.Color(), base = new T.Color(dry ? 0x9a8a4c : 0x5a9a34), alt = new T.Color(dry ? 0x7a7a40 : 0x8ab040);
  const clumps = []; for(let i=0;i<n/40;i++){ const ib = zones[(Math.random()*zones.length)|0]; clumps.push([ib.x0 + Math.random()*(ib.x1 - ib.x0), ib.z0 + Math.random()*(ib.z1 - ib.z0), 1 + Math.random()*3]); }
  let k = 0;
  for(let tries=0; k<n && tries<n*4; tries++){
    let x, z; if(Math.random() < 0.65){ const cl = clumps[(Math.random()*clumps.length)|0], a = Math.random()*6.28, r = Math.sqrt(Math.random())*cl[2]; x = cl[0] + Math.cos(a)*r; z = cl[1] + Math.sin(a)*r; }
    else { const ib = zones[(Math.random()*zones.length)|0]; x = ib.x0 + Math.random()*(ib.x1 - ib.x0); z = ib.z0 + Math.random()*(ib.z1 - ib.z0); }
    if(!free(x, z)) continue;
    const sc = (dry ? 0.32 : 0.38) + Math.random()*0.3; o.position.set(x, 0, z); o.rotation.set(0, Math.random()*6.28, 0); o.scale.set(sc*1.2, sc, sc*1.2); o.updateMatrix();
    mesh.setMatrixAt(k, o.matrix); c.copy(base).lerp(alt, Math.random()).multiplyScalar(0.8 + Math.random()*0.35); mesh.setColorAt(k, c); k++; }
  mesh.count = k; mesh.instanceMatrix.needsUpdate = true; if(mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
// ---- fog banks drifting at knee height: big soft sprites that follow the camera ---------------------------
let wisps = null;
function setWisps(on){
  if(!wisps){ wisps = []; const m = new T.SpriteMaterial({ map:tex('soft'), color:0x9aa4ae, transparent:true, opacity:0.11, depthWrite:false });
    for(let i=0;i<22;i++){ const sp = new T.Sprite(m); const sz = 7 + Math.random()*9; sp.scale.set(sz, sz*0.4, 1); sp.userData.v = [(Math.random() - 0.5)*0.6, (Math.random() - 0.5)*0.4];
      sp.visible = false; scene.add(sp); wisps.push(sp); } wisps.mat = m; }
  wisps.on = on; for(const sp of wisps){ sp.visible = on; sp.position.set(camera.position.x + (Math.random() - 0.5)*60, 0.6 + Math.random()*1.6, camera.position.z + (Math.random() - 0.5)*60); }
}
function tickWisps(dt){
  if(!wisps || !wisps.on) return; wisps.mat.color.copy(scene.fog.color).multiplyScalar(1.8);
  for(const sp of wisps){ sp.position.x += sp.userData.v[0]*dt; sp.position.z += sp.userData.v[1]*dt;
    const dx = sp.position.x - camera.position.x, dz = sp.position.z - camera.position.z;
    if(Math.abs(dx) > 32) sp.position.x -= Math.sign(dx)*64; if(Math.abs(dz) > 32) sp.position.z -= Math.sign(dz)*64; }
}
function treeMesh(x, z, h, snowy){
  const g = new T.Group(); g.add(mesh(cyl(0.16, 0.26, h, 6), lam(0x3a2c22), 0, h/2, 0));
  const leaf = lam(snowy ? 0x2a3a30 : (Math.random() < 0.5 ? 0x34452a : 0x2c3c24));
  for(let i=0;i<3;i++){ g.add(mesh(cone(1.5 - i*0.35, 2.2), leaf, 0, h*0.55 + i*1.1, 0)); if(snowy) g.add(mesh(cone(1.2 - i*0.3, 0.7), lam(0xe8eef4), 0, h*0.55 + i*1.1 + 0.85, 0, false)); }
  g.position.set(x, 0, z); g.rotation.y = Math.random()*6; return g;
}
// the facade texture has 3 m bays and 3.2 m floors; this lines real geometry up with it: a ledge at every
// floor, a sill under every window, awnings over some shops and air conditioners hanging off some windows
const AWN = [0x7a1e1e, 0x1e4a2e, 0x1e3a6a, 0x6a4a12];
function facadeDetail(g, style, x0, x1, z0, z1, h, faces){
  const st = STYLE[style] || STYLE.beige, trim = lam(new T.Color(st.trim).getHex()), ac = lam(0x8a8e92, { shine:[0x333333, 30] }), floors = Math.floor(h/3.2 + 0.01);
  const add = (geo, mat, x, y, z)=>{ const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadows; m.receiveShadow = shadows; g.add(m); return m; };
  for(const f of faces){
    const onZ = f[0] === 'z', out = f[1] === '+' ? 1 : -1, len = onZ ? x1 - x0 : z1 - z0, plane = onZ ? (out > 0 ? z1 : z0) : (out > 0 ? x1 : x0);
    const u0 = f === 'z+' ? x0 : f === 'z-' ? x1 : f === 'x+' ? z1 : z0, ud = (f === 'z+' || f === 'x-') ? 1 : -1;
    const at = (u, y, o, geo, mat)=>{ const a = u0 + ud*u, p = plane + out*o; return add(geo, mat, onZ ? a : p, y, onZ ? p : a); };
    const along = (L, hh, dd)=>onZ ? sbox(L, hh, dd) : sbox(dd, hh, L);
    for(let r=1; r<floors; r++) if(r*3.2 < h - 0.4) at(len/2, r*3.2, 0.08, along(len, 0.14, 0.16), trim);
    for(let k=0; k*3 + 2.6 <= len; k++){
      for(let r=1; r<=3; r++){ const y = (r + 0.22)*3.2; if(y > h - 0.6) break;
        at(k*3 + 1.5, y - 0.05, 0.1, along(1.95, 0.09, 0.2), trim);
        if(Math.random() < 0.06) at(k*3 + 1.5 + (Math.random() - 0.5)*0.8, y - 0.38, 0.28, along(0.8, 0.5, 0.52), ac); }
      const shop = ((k % 4) + style.length) % 3 !== 0;
      if(shop && Math.random() < 0.45){ const aw = at(k*3 + 1.5, 2.72, 0.48, along(2.5, 0.07, 0.95), lam(AWN[(Math.random()*AWN.length)|0]));
        if(onZ) aw.rotation.x = out*0.28; else aw.rotation.z = -out*0.28; } }
  }
}
function waterTower(g, x, y, z){
  const wood = lam(0x5a4028), metal = lam(0x3a3e44, { shine:[0x333333, 30] });
  for(const [a, b] of [[-1,-1],[1,-1],[-1,1],[1,1]]) g.add(mesh(sbox(0.12, 2.2, 0.12), metal, x + a*0.9, y + 1.1, z + b*0.9));
  g.add(mesh(cyl(1.25, 1.25, 2.2, 16), wood, x, y + 3.2, z)); g.add(mesh(cone(1.4, 0.9, 16), lam(0x2a2a2e), x, y + 4.75, z));
  for(const yy of [2.6, 3.8]) g.add(mesh(cyl(1.28, 1.28, 0.08, 16), metal, x, y + yy, z, false));
}
function makeBuilding(b){
  const g = new T.Group(), w = b.x1 - b.x0, d = b.z1 - b.z0, h = b.h; g.position.set((b.x0 + b.x1)/2, 0, (b.z0 + b.z1)/2);
  const s = b.style;
  if(STYLE[s]){ g.add(mesh(boxUV(w, h, d, 12, 12.8), texMat(s), 0, h/2, 0)); g.add(mesh(box(w + 0.3, 0.35, d + 0.3), lam(new T.Color(STYLE[s].trim).getHex()), 0, h + 0.17, 0));
    if(w > 7 && d > 7){ g.add(mesh(box(1.6, 1, 1.4), lam(0x6a6e72), w*0.2, h + 0.85, d*0.15)); g.add(mesh(box(1.2, 0.8, 1.2), lam(0x5a5e62), -w*0.25, h + 0.75, -d*0.2)); }
    if(quality !== 'low'){ facadeDetail(g, s, -w/2, w/2, -d/2, d/2, h, ['x+', 'x-', 'z+', 'z-']);
      if(w > 6 && d > 6 && (b.x0*7 + b.z0*3) % 3 < 1.2) waterTower(g, w*0.12, h + 0.35, -d*0.18); } }
  else if(s === 'bunker'){ g.add(mesh(boxUV(w, h, d, 3, 3), texMat('concwall', 0xb8b4a8), 0, h/2, 0)); g.add(mesh(box(w + 0.4, 0.4, d + 0.4), lam(0x6a6a62), 0, h + 0.2, 0)); g.add(mesh(box(w*0.6, 0.25, 0.1), basic(0x101010), 0, h*0.65, d/2 + 0.01, false)); }
  else if(s === 'hangar' || s === 'warehouse'){ g.add(mesh(boxUV(w, h, d, 0.8, h), texMat('corrugated', s === 'hangar' ? 0x7a8a6a : 0x8a8e92), 0, h/2, 0)); g.add(mesh(box(w + 0.3, 0.3, d + 0.3), lam(0x4a4e52), 0, h + 0.15, 0)); g.add(mesh(box(Math.min(5, w*0.5), h*0.7, 0.1), lam(0x5a5e62), 0, h*0.35, d/2 + 0.03)); }
  else if(s === 'cabin'){ g.add(mesh(boxUV(w, h, d, 3, 3), texMat('hlogs'), 0, h/2, 0)); const roof = mesh(cone(Math.max(w, d)*0.75, 2.2, 4), lam(0x4a3a2e), 0, h + 1.1, 0); roof.rotation.y = Math.PI/4; roof.scale.set(w/Math.max(w, d), 1, d/Math.max(w, d)); g.add(roof); g.add(mesh(box(1.2, 2.0, 0.1), lam(0x3a2a1e), 0, 1.0, d/2 + 0.03)); }
  else if(s === 'adobe'){ g.add(mesh(boxUV(w, h, d, 3, 3), texMat('adobe'), 0, h/2, 0)); for(let k=-2;k<=2;k++) g.add(mesh(cyl(0.1, 0.1, 0.8, 5), lam(0x5a3e26), k*w*0.18, h - 0.4, d/2 + 0.3)); g.add(mesh(box(1.1, 1.0, 0.1), basic(0x1a1410), 0, h*0.5, d/2 + 0.02, false)); }
  else g.add(mesh(box(w, h, d), lam(0x6a6a6a), 0, h/2, 0));
  return g;
}
const PROPCOL = { barrel:[0x8a2a22, 0x2a4a8a, 0x5a4a2a, 0xc8a02a], car:[0x6a2a24, 0x2a3a5a, 0x2f4a34, 0x5a5a5e, 0x7a6a3a, 0x3a2a4a], container:[0x7a3b2a, 0x2e5a6e, 0x5a6a2e, 0x8a6a2a] };
function makeProp(p, M){
  const g = new T.Group(), [w0, d0, h] = ZD.PROPS[p.kind], cx = (p.x0 + p.x1)/2, cz = (p.z0 + p.z1)/2, L = w0, D = d0;
  g.position.set(cx, 0, cz); if(p.rot) g.rotation.y = Math.PI/2;
  const r = (arr)=>arr[p.seed % arr.length], add = (geo, mat, x, y, z, cast)=>{ const m = mesh(geo, mat, x, y, z, cast); g.add(m); return m; };
  const dark = lam(0x161616), metal = lam(0x5a5e64, { shine:[0x4a4a4a, 40] }), metal2 = lam(0x3a3e44, { shine:[0x3a3a3a, 40] }), wood = texMat('crate'), white = lam(0xe8e8e2);
  switch(p.kind){
    case 'car': case 'wreck': { const body = lam(p.kind === 'wreck' ? 0x5a3a2a : r(PROPCOL.car), p.kind === 'wreck' ? null : { shine:[0x3c3c3c, 70] }), glass = lam(0x1a242c, { shine:[0x8a9aaa, 110] });
      add(box(L, 0.7, D), body, 0, 0.6, 0); add(box(L*0.5, 0.6, D*0.92), body, -L*0.08, 1.2, 0); if(p.kind === 'car') add(box(L*0.48, 0.48, D*0.94), glass, -L*0.08, 1.22, 0);
      for(const [a, b] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ const wh = add(cyl(0.36, 0.36, 0.26, 12), dark, a*L*0.33, 0.3, b*D*0.46); wh.rotation.x = Math.PI/2;
        const hub = add(cyl(0.17, 0.17, 0.04, 10), metal, a*L*0.33, 0.3, b*(D*0.46 + 0.13), false); hub.rotation.x = Math.PI/2; }
      add(box(0.12, 0.22, D*0.96), dark, L/2 + 0.02, 0.45, 0); add(box(0.12, 0.22, D*0.96), dark, -L/2 - 0.02, 0.45, 0);              // bumpers
      if(p.kind === 'car'){ const on = p.seed % 5 < 2;
        for(const sd of [-1, 1]){ add(box(0.05, 0.13, 0.32), basic(on ? 0xfff4d0 : 0x9a9a90), L/2 + 0.01, 0.72, sd*D*0.32, false); add(box(0.05, 0.12, 0.26), basic(on ? 0xff2a1a : 0x5a1210), -L/2 - 0.01, 0.72, sd*D*0.33, false);
          add(box(0.12, 0.08, 0.06), body, -L*0.06 + L*0.24, 1.2, sd*(D*0.46 + 0.05)); }
        add(box(0.02, 0.12, 0.38), basic(0xd8d8cc), L/2 + 0.09, 0.42, 0, false); }
      if(M.theme === 'snow') add(box(L*0.9, 0.2, D*0.9), lam(0xeef2f6), 0, 1.55, 0, false); break; }
    case 'bus': add(box(L, 2.4, D), lam(0xc8a02a), 0, 1.5, 0); add(box(L*0.96, 0.7, D*1.01), lam(0x1a242c), 0, 2.1, 0); add(box(L, 0.3, D*1.01), lam(0x2a2a2a), 0, 0.45, 0);
      [-0.36, 0.3].forEach(t=>[-1,1].forEach(s=>{ const wh = add(cyl(0.5,0.5,0.3,10), dark, t*L, 0.5, s*D*0.5); wh.rotation.x = Math.PI/2; })); break;
    case 'truck': add(box(L*0.3, 2.0, D), lam(0x4a5a3a), L*0.35, 1.3, 0); add(box(L*0.68, 2.4, D), lam(0x5a6a46), -L*0.15, 1.5, 0); add(box(L*0.3, 0.5, D*0.94), lam(0x1a242c), L*0.38, 1.9, 0);
      [-0.35, 0, 0.35].forEach(t=>[-1,1].forEach(s=>{ const wh = add(cyl(0.45,0.45,0.3,10), dark, t*L, 0.45, s*D*0.48); wh.rotation.x = Math.PI/2; })); break;
    case 'barrier': add(box(L, h, D), lam(0xb8b6ae), 0, h/2, 0); add(box(L + 0.02, 0.16, D + 0.02), lam(0xc83a2e), 0, h*0.7, 0); break;
    case 'dumpster': add(box(L, h, D), lam(0x2e5a3a), 0, h/2, 0); add(box(L + 0.06, 0.1, D + 0.06), lam(0x203a28), 0, h, 0); break;
    case 'crates': add(box(1.2, 1.1, 1.2), wood, -0.6, 0.55, 0); add(box(1.2, 1.1, 1.2), wood, 0.6, 0.55, 0); add(box(1.1, 1.0, 1.1), wood, 0.1, 1.6, 0); break;
    case 'crate': add(box(1.2, 1.2, 1.2), wood, 0, 0.6, 0); break;
    case 'barrel': add(cyl(0.38, 0.38, 1.1, 12), lam(r(PROPCOL.barrel), { shine:[0x2a2a2a, 30] }), 0, 0.55, 0); add(cyl(0.39, 0.39, 0.06, 12), metal2, 0, 0.3, 0); add(cyl(0.39, 0.39, 0.06, 12), metal2, 0, 0.8, 0);
      if(M.T.outdoor && p.seed % 4 === 0 && quality !== 'low'){ add(cyl(0.34, 0.34, 0.02, 12), basic(0xff8a2a), 0, 1.1, 0, false);              // a fire in the barrel
        const gl = glowSprite(0xff7a2a, 2.6, 0.55); gl.position.set(0, 1.5, 0); g.add(gl); lightPool(g, 'fire', 0xc85a1a, 0, 1.2, 0, 5.5, 0.1, 1, 0, false);
        W.fires.push({ x:cx, z:cz, y:1.1 }); W.lampSrc.push({ x:cx, y:1.7, z:cz, color:LAMP_LIGHT.fire[0], power:LAMP_LIGHT.fire[1], fire:true }); } break;
    case 'bench': add(box(L, 0.08, 0.5), wood, 0, 0.45, 0); add(box(L, 0.4, 0.06), wood, 0, 0.7, -0.24); add(box(0.08, 0.45, 0.4), metal2, -L*0.4, 0.22, 0); add(box(0.08, 0.45, 0.4), metal2, L*0.4, 0.22, 0); break;
    case 'sandbags': for(let row=0; row<3; row++) for(let k=0; k<4 - row; k++){ const s = add(sph(0.42, 7, 5), lam(0x9a8a62), -L/2 + 0.45 + row*0.4 + k*0.75, 0.22 + row*0.32, 0); s.scale.set(1, 0.45, 0.9); } break;
    case 'container': add(boxUV(L, h, D, 0.6, h), texMat('corrugated', r(PROPCOL.container)), 0, h/2, 0); break;
    case 'tent': { const cloth = lam(M.theme === 'forest' ? 0x6a5a3a : 0x5a6440), slope = Math.hypot(D/2, h), ang = Math.atan2(D/2, h);
      for(const sg of [-1, 1]){ const r = add(box(L, slope, 0.06), cloth, 0, h/2, sg*D/4); r.rotation.x = -sg*ang; }
      add(box(0.08, h, 0.08), lam(0x3a2c22), -L/2 + 0.1, h/2, 0); add(box(0.08, h, 0.08), lam(0x3a2c22), L/2 - 0.1, h/2, 0); break; }
    case 'tower': for(const [a, b] of [[-1,-1],[1,-1],[-1,1],[1,1]]) add(box(0.18, 5, 0.18), wood, a*1.1, 2.5, b*1.1); add(box(2.8, 0.2, 2.8), wood, 0, 4.4, 0); add(box(2.8, 1.0, 0.1), wood, 0, 4.9, 1.35); add(box(2.8, 1.0, 0.1), wood, 0, 4.9, -1.35); add(cone(2.2, 1.2, 4), lam(0x4a5a3a), 0, 6.1, 0); break;
    case 'bed': add(box(L, 0.4, D), metal, 0, 0.35, 0); add(box(L*0.95, 0.18, D*0.9), lam(0xd8e0e8), 0, 0.62, 0); add(box(0.4, 0.12, D*0.6), white, -L*0.38, 0.76, 0); add(box(0.06, 0.6, D), metal2, -L/2, 0.6, 0); break;
    case 'cabinet': add(box(L, h, D), lam(0x7a8288), 0, h/2, 0); add(box(0.04, h*0.9, 0.02), metal2, 0, h/2, D/2 + 0.01, false); break;
    case 'desk': add(box(L, 0.08, D), wood, 0, 0.82, 0); add(box(L*0.9, 0.7, 0.06), lam(0x5a4a3a), 0, 0.42, -D*0.4); add(box(0.5, 0.35, 0.05), dark, 0.2, 1.05, -0.1); break;
    case 'curtain': add(box(L, h, D), lam(0x7ab0a8), 0, h/2 + 0.1, 0); add(box(L, 0.04, 0.04), metal2, 0, h + 0.15, 0); break;
    case 'gurney': add(box(L, 0.1, D), white, 0, 0.8, 0); add(box(L*0.9, 0.6, 0.05), metal2, 0, 0.45, 0); for(const a of [-1, 1]) add(cyl(0.08, 0.08, 0.06, 8), dark, a*L*0.4, 0.08, 0); break;
    case 'chairs': for(let k=-1;k<=1;k++){ add(box(0.55, 0.06, 0.5), lam(0x3a6a8a), k*0.65, 0.45, 0); add(box(0.55, 0.5, 0.06), lam(0x3a6a8a), k*0.65, 0.72, -0.24); } add(box(L, 0.06, 0.1), metal2, 0, 0.3, 0); break;
    case 'labtable': add(box(L, 0.1, D), white, 0, 0.95, 0); add(box(L*0.95, 0.85, D*0.9), lam(0x5a646a), 0, 0.45, 0);
      for(let k=0;k<3;k++){ const c = [0x3aff9a, 0x3ac8ff, 0xff5ad8][k]; add(cyl(0.08, 0.12, 0.3, 8), basic(c, { transparent:true, opacity:0.75 }), -L*0.3 + k*L*0.3, 1.15, 0, false); } break;
    case 'tank': add(cyl(0.8, 0.8, 0.3, 14), metal2, 0, 0.15, 0); add(cyl(0.8, 0.8, 0.3, 14), metal2, 0, 2.45, 0);
      add(cyl(0.72, 0.72, 2.0, 14), lam(0x6ae8d8, { transparent:true, opacity:0.35, emissive:0x0a3a34 }), 0, 1.3, 0, false);
      add(box(0.4, 1.2, 0.3), lam(0x3a4a3a), 0, 1.2, 0, false); break;
    case 'tankrow': for(let k=-1;k<=1;k++){ add(cyl(0.8, 0.8, 0.3, 14), metal2, k*2, 0.15, 0); add(cyl(0.8, 0.8, 0.3, 14), metal2, k*2, 2.45, 0);
      add(cyl(0.72, 0.72, 2.0, 14), lam(M.theme === 'underground' ? 0xb46ae8 : 0x6ae8d8, { transparent:true, opacity:0.35 }), k*2, 1.3, 0, false); } break;
    case 'server': add(boxUV(L, h, D, 1, h), texMat('server'), 0, h/2, 0); break;
    case 'table': add(box(L, 0.08, D), lam(0x7a7a72), 0, 0.8, 0); for(const [a, b] of [[-1,-1],[1,-1],[-1,1],[1,1]]) add(box(0.08, 0.8, 0.08), metal2, a*L*0.45, 0.4, b*D*0.4); break;
    case 'shelf': add(boxUV(L, h, D, 2, h), texMat('shelfgoods'), 0, h/2, 0); break;
    case 'kiosk': add(box(L, h, D), lam(0xe8d8b8), 0, h/2, 0); add(box(L + 0.2, 0.12, D + 0.2), lam(0xc83a3a), 0, h + 0.06, 0); add(box(0.1, 1.4, 0.1), metal2, -L*0.45, h + 0.7, 0); add(box(L, 0.5, 0.06), lam(0x3a7ac8), 0, h + 1.4, 0); break;
    case 'planter': add(box(L, h, D), lam(0x8a8478), 0, h/2, 0); add(sph(0.9, 8, 6), lam(0x3a6a2a), 0, h + 0.5, 0); break;
    case 'mannequin': add(cyl(0.12, 0.2, 1.1, 8), lam(0xe8e2d8), 0, 1.0, 0); add(sph(0.15, 8, 6), lam(0xe8e2d8), 0, 1.75, 0); add(cyl(0.25, 0.25, 0.05, 10), metal2, 0, 0.03, 0); break;
    case 'cart': add(box(L*0.9, 0.5, D*0.9), lam(0xa8acb0, { wireframe:true }), 0, 0.75, 0, false); add(box(L*0.9, 0.04, D*0.9), metal, 0, 0.5, 0); for(const a of [-1,1]) add(cyl(0.06, 0.06, 0.04, 6), dark, a*0.4, 0.06, 0); break;
    case 'pillar': add(box(L, h, D), lam(M.theme === 'subway' ? 0x8a7a5a : 0xb0aca4), 0, h/2, 0); add(box(L + 0.2, 0.3, D + 0.2), lam(0x5a5a52), 0, 0.15, 0); break;
    case 'trash': add(cyl(0.32, 0.28, 1.0, 10), lam(0x3a5a3a), 0, 0.5, 0); break;
    case 'tree': case 'pine': g.add(treeMesh(0, 0, h, M.theme === 'snow')); break;
    case 'rock': { const s = add(sph(1.0, 6, 5), lam(M.theme === 'desert' ? 0x9a7a5a : (M.theme === 'snow' ? 0x8a929a : 0x5a5a5e)), 0, 0.5, 0); s.scale.set(L/2, h/1.4, D/2); s.rotation.y = p.seed; break; }
    case 'log': { const l = add(cyl(0.32, 0.36, L, 8), lam(0x4a3422), 0, 0.34, 0); l.rotation.z = Math.PI/2; break; }
    case 'stump': add(cyl(0.42, 0.48, h, 8), lam(0x4a3422), 0, h/2, 0); add(cyl(0.4, 0.4, 0.02, 8), lam(0x8a6a44), 0, h + 0.01, 0, false); break;
    case 'machine': add(box(L, h, D), lam(0x5a6a5a), 0, h/2, 0); add(box(L*0.5, 0.6, 0.05), basic(0x1a2a1a), 0, h*0.7, D/2 + 0.01, false); add(box(0.25, 0.25, 0.04), basic(0xff4a2a), L*0.35, h*0.7, D/2 + 0.02, false);
      add(cyl(0.2, 0.2, h*0.9, 8), metal2, -L*0.4, h*0.45 + 0.1, -D*0.35); add(box(L + 0.04, 0.2, D + 0.04), lam(0xd8b83a), 0, 0.1, 0); break;
    case 'bigmachine': add(box(L, h, D), lam(0x4a5a6a), 0, h/2, 0); for(let k=-1;k<=1;k++) add(cyl(0.5, 0.5, h*1.2, 10), metal2, k*L*0.3, h*0.6, -D*0.2);
      add(box(L*0.4, 0.8, 0.05), basic(0x2a3a2a), 0, h*0.6, D/2 + 0.01, false); add(sph(0.2, 8, 6), basic(0xffa63a), L*0.3, h*0.65, D/2 + 0.1, false); add(box(L + 0.04, 0.25, D + 0.04), lam(0xd8b83a), 0, 0.12, 0); break;
    case 'conveyor': add(box(L, 0.15, D), dark, 0, h, 0); for(let t=-L/2 + 0.3; t<L/2; t+=0.5){ const c = add(cyl(0.07, 0.07, D*0.95, 6), metal, t, h - 0.1, 0); c.rotation.x = Math.PI/2; } for(const a of [-1,1]) add(box(0.12, h, D*0.9), metal2, a*L*0.4, h/2, 0); add(box(0.8, 0.6, 0.6), wood, -L*0.2, h + 0.35, 0); break;
    case 'pipes': for(let k=0;k<3;k++){ const c = add(cyl(0.18, 0.18, L, 8), lam([0x8a5a3a, 0x5a6a7a, 0x6a7a5a][k]), 0, 0.5 + k*0.45, (k - 1)*0.22); c.rotation.z = Math.PI/2; } for(const a of [-1,1]) add(box(0.15, h, 0.7), metal2, a*L*0.42, h/2, 0); break;
    case 'forklift': add(box(L*0.6, 1.0, D), lam(0xd8a82a), -L*0.15, 0.7, 0); add(box(0.1, h, D*0.8), metal2, L*0.2, h/2, 0); add(box(0.9, 0.06, D*0.6), metal2, L*0.4, 0.15, 0); add(box(L*0.4, 0.06, D), dark, -L*0.2, 2.0, 0);
      for(const [a, b] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ const wh = add(cyl(0.3, 0.3, 0.2, 8), dark, a*L*0.25 - 0.2, 0.3, b*D*0.45); wh.rotation.x = Math.PI/2; } break;
    case 'bollard': add(cyl(0.28, 0.32, h, 8), lam(0x2a2a2a), 0, h/2, 0); add(cyl(0.3, 0.3, 0.12, 8), lam(0xd8b83a), 0, h*0.7, 0); break;
    case 'crystal': for(let k=0;k<3;k++){ const c = add(cone(0.35 + k*0.1, 1.4 + k*0.5, 5), basic(0xa86aff, { transparent:true, opacity:0.85 }), (k - 1)*0.35, 0.7 + k*0.25, (k % 2)*0.3 - 0.15, false); c.rotation.z = (k - 1)*0.25; }
      { const gl = glowSprite(0xa86aff, 2.6, 0.45); gl.position.set(0, 1.2, 0); g.add(gl); } break;
    case 'cactus': add(cyl(0.22, 0.26, h, 8), lam(0x4a7a3a), 0, h/2, 0); { const a1 = add(cyl(0.14, 0.14, 0.9, 6), lam(0x4a7a3a), 0.35, h*0.55, 0); a1.rotation.z = 0.0; const b1 = add(cyl(0.14, 0.14, 0.5, 6), lam(0x4a7a3a), 0.2, h*0.42, 0); b1.rotation.z = Math.PI/2; } break;
    case 'reception': add(box(L, h, D), lam(0xc8c0b0), 0, h/2, 0); add(box(L + 0.1, 0.06, D + 0.1), lam(0x5a4a3a), 0, h + 0.03, 0); add(box(0.6, 0.4, 0.05), dark, L*0.25, h + 0.25, -0.2); break;
    case 'cells': { add(box(L, h, D), lam(0x4a4a46), 0, h/2, -0.05); const n = Math.max(2, Math.round(L/3));
      for(let k=0;k<n;k++){ const x = -L/2 + (k + 0.5)*L/n; for(let b=-5; b<=5; b++) add(cyl(0.035, 0.035, h - 0.2, 5), metal2, x + b*0.26, h/2, D/2 + 0.08, false); add(box(L/n - 0.1, 0.12, 0.1), metal2, x, h - 0.15, D/2 + 0.08, false); add(box(0.15, h, 0.2), lam(0x5a5a56), -L/2 + k*L/n, h/2, D/2 + 0.05); } break; }
    case 'fountain': add(cyl(L/2, L/2, h, 18), lam(0xb0aca4), 0, h/2, 0); add(cyl(L/2 - 0.25, L/2 - 0.25, 0.05, 18), basic(0x3a8ab8, { transparent:true, opacity:0.8 }), 0, h - 0.05, 0, false); add(cyl(0.3, 0.4, 2.2, 10), lam(0xb0aca4), 0, 1.1, 0); add(sph(0.6, 10, 8), lam(0xb0aca4), 0, 2.3, 0); break;
    case 'traincar': add(boxUV(L, h - 0.6, D, 5, h - 0.6), texMat('trainwin'), 0, (h - 0.6)/2 + 0.6, 0); add(box(L, 0.2, D + 0.05), lam(0x8a8e92), 0, h + 0.1, 0);
      for(const t of [-0.4, -0.3, 0.3, 0.4]){ const wh = add(cyl(0.35, 0.35, D*0.9, 10), dark, t*L, 0.35, 0); wh.rotation.x = Math.PI/2; } break;
  }
  return g;
}
const BEAM_V = 'varying float vH; varying float vF; void main(){ vH = uv.y; vec4 mv = modelViewMatrix*vec4(position, 1.0); vec3 n = normalize(normalMatrix*normal);'
  + ' vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix*mv; }';
const BEAM_F = 'uniform vec3 color; uniform float level; varying float vH; varying float vF; void main(){ float a = pow(vH, 1.6)*pow(vF, 2.0)*0.22*level; gl_FragColor = vec4(color*a, 1.0); }';
const lampKit = {};
function lampMats(kind, color){
  if(lampKit[kind]) return lampKit[kind];
  const pool = new T.MeshBasicMaterial({ map:tex('soft'), color, transparent:true, opacity:0.42, blending:T.AdditiveBlending, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4 });
  const beam = new T.ShaderMaterial({ uniforms:{ color:{ value:new T.Color(color) }, level:{ value:1 } }, vertexShader:BEAM_V, fragmentShader:BEAM_F, transparent:true, depthWrite:false, blending:T.AdditiveBlending, side:T.DoubleSide });
  W.lampMats.push({ m:pool, base:0.42 }, { m:beam, beam:true });
  return lampKit[kind] = { pool, beam };
}
function lightPool(g, kind, color, x, y, z, size, top, bottom, tilt, beamOn){
  const k = lampMats(kind, color);
  const p = new T.Mesh(new T.PlaneGeometry(size, size), k.pool); p.rotation.x = -Math.PI/2; p.position.set(x, 0.03, z); p.renderOrder = 2; p.userData.ownGeo = true; g.add(p);
  if(beamOn === false || W.mobile) return;
  const len = Math.hypot(y, tilt || 0), b = new T.Mesh(new T.CylinderGeometry(top, bottom, len, 18, 1, true), k.beam); b.userData.ownGeo = true;
  b.position.set(x, y/2, z - (tilt || 0)/2); b.rotation.x = tilt ? -Math.atan2(tilt, y) : 0; b.renderOrder = 3; g.add(b);
}
// every lamp and fire registers where its light comes from; the four nearest get a real point light
W.lampSrc = [];
const LAMP_LIGHT = { post:[0xffb060, 1.7], flood:[0xfff0d8, 2.2], lantern:[0xffa04a, 1.3], ceiling:[0xe0f4ff, 0.55], crystal:[0xa86aff, 0.9], fire:[0xff7a2a, 1.6] };
function lampSource(g, kind, lx, ly, lz){ const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y), L = LAMP_LIGHT[kind] || LAMP_LIGHT.post;
  W.lampSrc.push({ x:g.position.x + lx*c + lz*s, y:ly, z:g.position.z - lx*s + lz*c, color:L[0], power:L[1], fire:kind === 'fire' }); }
let lampT = 0;
function tickLampLights(dt){
  if(!W.lampLights.length) return; lampT -= dt; const fx = W.focus ? W.focus.x : camera.position.x, fz = W.focus ? W.focus.z : camera.position.z;
  if(lampT <= 0){ lampT = 0.3;
    const near = W.lampSrc.map(sr=>({ sr, d:Math.hypot(sr.x - fx, sr.z - fz) })).filter(o=>o.d < 34).sort((a, b)=>a.d - b.d).slice(0, W.lampLights.length);
    const want = new Set(near.map(o=>o.sr));
    for(const l of W.lampLights) if(l.userData.src && !want.has(l.userData.src)) l.userData.src = null;
    for(const o of near){ if(W.lampLights.some(l=>l.userData.src === o.sr)) continue; const l = W.lampLights.find(l=>!l.userData.src); if(!l) break;
      l.userData.src = o.sr; l.position.set(o.sr.x, o.sr.y, o.sr.z); l.color.setHex(o.sr.color); l.intensity = 0; } }
  for(const l of W.lampLights){ const sr = l.userData.src, lvl = W.lampLevel == null ? 1 : W.lampLevel;
    const want = sr ? sr.power*Math.min(1.2, lvl)*Math.max(0, 1 - Math.hypot(sr.x - fx, sr.z - fz)/34)*(sr.fire ? 0.85 + Math.sin(WIND.value*19 + sr.x)*0.15 : 1) : 0;
    l.intensity += (want - l.intensity)*Math.min(1, dt*5); }
}
function makeLamp(l, kind){
  const g = new T.Group(); g.position.set(l.x, 0, l.z); const pole = lam(0x26282b, { shine:[0x333333, 40] });
  let glow;
  if(kind === 'ceiling'){ g.add(mesh(box(1.4, 0.08, 0.4), basic(0xe8f0f0), 0, l.y, 0, false)); glow = glowSprite(0xe8f8ff, 3.2, 0.3); glow.position.y = l.y - 0.3;
    lightPool(g, 'ceiling', 0x9ab0b0, 0, l.y - 0.05, 0, 8, 0.7, 3.4, 0, true); lampSource(g, 'ceiling', 0, l.y - 0.4, 0); }
  else if(kind === 'crystal'){ const c = mesh(cone(0.3, 1.2, 5), basic(0xa86aff), 0, l.y - 0.4, 0, false); c.rotation.x = Math.PI; g.add(c); glow = glowSprite(0xa86aff, 3.4, 0.35); glow.position.y = l.y - 0.8;
    lightPool(g, 'crystal', 0x7a3ad0, 0, l.y - 0.8, 0, 7, 0.3, 2.8, 0, false); lampSource(g, 'crystal', 0, l.y - 0.9, 0); }
  else if(kind === 'flood'){ g.add(mesh(cyl(0.1, 0.12, 6, 6), pole, 0, 3, 0)); g.add(mesh(box(0.9, 0.5, 0.3), lam(0x3a3e42), 0, 6, 0)); g.add(mesh(box(0.8, 0.4, 0.05), basic(0xfff2d8), 0, 6, 0.17, false)); glow = glowSprite(0xfff2d8, 2.8, 0.45); glow.position.set(0, 5.9, 0.4); g.rotation.y = l.yaw || 0;
    lightPool(g, 'flood', 0xb8b0a0, 0, 5.9, 3.6, 10, 0.35, 3.2, 3.2, true); lampSource(g, 'flood', 0, 5.6, 1.2); }
  else if(kind === 'lantern'){ g.add(mesh(cyl(0.06, 0.08, 2.2, 6), lam(0x3a2c22), 0, 1.1, 0)); g.add(mesh(box(0.25, 0.32, 0.25), basic(0xffb35a), 0, 2.3, 0, false)); glow = glowSprite(0xffa04a, 2.4, 0.5); glow.position.y = 2.3;
    lightPool(g, 'lantern', 0xc8701e, 0, 2.2, 0, 5, 0.12, 1.6, 0, false); lampSource(g, 'lantern', 0, 2.2, 0); }
  else { g.add(mesh(cyl(0.07, 0.09, 4.6, 6), pole, 0, 2.3, 0)); g.add(mesh(box(0.08, 0.08, 1), pole, 0, 4.55, 0.45)); g.add(mesh(box(0.34, 0.12, 0.22), basic(0xffd59a), 0, 4.45, 0.9, false)); glow = glowSprite(0xffb35a, 1.5, 0.4); glow.position.set(0, 4.4, 0.9); g.rotation.y = (l.yaw || 0) + Math.PI;
    lightPool(g, 'post', 0xc88a3a, 0, 4.38, 0.9, 7, 0.14, 2.3, 0, true); lampSource(g, 'post', 0, 4.2, 0.9); }
  glow.userData.base = glow.material.opacity; glow.material = glow.material.clone(); W.lampSprites.push(glow); g.add(glow);
  return g;
}
W.lampsOn = function(level){ W.lampLevel = level; for(const s of W.lampSprites){ s.material.opacity = s.userData.base*level; }
  for(const k of W.lampMats){ if(k.beam) k.m.uniforms.level.value = level; else k.m.opacity = k.base*Math.min(1.4, level); }
  for(const m of W.glowMats) m.emissiveIntensity = Math.min(1.2, level); };

// ---- items: wall-buys, perk machines, the box, the upgrade station, the mystery ----------------
function makeItemMesh(it, M){
  const g = new T.Group(); g.position.set(it.x, 0, it.z); g.rotation.y = it.yaw;
  // local +z is out of the wall (yaw 0 faces -z, so flip: the item's front is local -z)
  const F = -1;
  switch(it.kind){
    case 'wallbuy': { const plate = mesh(box(1.9, 0.75, 0.05), basic(0x1a1c1e), 0, 1.55, F*0.03, false); g.add(plate);
      const gun = new T.Group(); gun.position.set(0, 1.55, F*0.12); gun.rotation.y = Math.PI/2; gun.scale.setScalar(2.1); const rig = { gun, muzzle:new T.Object3D() }; gun.add(rig.muzzle); W.setGunModel(rig, ZD.WEAPONS[it.weapon].model, 0xf0f0f0); g.add(gun);
      const lb = W.label(ZD.WEAPONS[it.weapon].name.toUpperCase() + '\n' + ZD.WEAPONS[it.weapon].price, ['#fff', '#ffd23a'], { h:96, sx:1.5, font:30 }); lb.position.set(0, 2.25, F*0.15); g.add(lb); it.label = lb;
      g.userData.dyn = true; break; }
    case 'perk': { const p = ZD.PERKS[it.perk]; g.add(mesh(box(1.25, 2.2, 0.85), lam(p.hex), 0, 1.1, 0)); g.add(mesh(box(1.27, 0.15, 0.87), lam(0x2a2a2a), 0, 2.27, 0));
      const panel = mesh(box(0.9, 1.0, 0.04), new T.MeshBasicMaterial({ color:0x202020 }), 0, 1.35, F*0.44, false); g.add(panel); it.panel = panel;
      g.add(mesh(box(0.4, 0.12, 0.05), basic(0x101010), 0, 0.5, F*0.44, false));
      const lb = W.label(p.icon + ' ' + p.name.toUpperCase() + '\n' + p.price, [p.color, '#ffd23a'], { h:96, sx:1.6, font:30 }); lb.position.set(0, 2.85, 0); g.add(lb); it.label = lb;
      const glow = glowSprite(p.hex, 2.6, 0); glow.position.set(0, 1.4, F*0.6); g.add(glow); it.glow = glow; g.userData.dyn = true; break; }
    case 'power': g.add(mesh(box(1.0, 1.4, 0.45), lam(0x5a6066), 0, 1.0, 0)); g.add(mesh(box(0.7, 0.5, 0.04), basic(0x1a1a1a), 0, 1.3, F*0.24, false));
      { const lever = new T.Group(); lever.position.set(0.3, 1.0, F*0.3); lever.add(mesh(box(0.08, 0.5, 0.08), lam(0xc83a2e), 0, 0.25, 0)); lever.rotation.x = 0.8; g.add(lever); it.lever = lever; }
      { const light = mesh(sph(0.08, 8, 6), new T.MeshBasicMaterial({ color:0xff3a2a }), -0.3, 1.8, F*0.1, false); g.add(light); it.light = light; }
      { const lb = W.label('POWER', '#ffd23a', { sx:1.2 }); lb.position.set(0, 2.2, 0); g.add(lb); it.label = lb; } g.userData.dyn = true; break;
    case 'box': { const body = mesh(box(1.8, 0.75, 0.85), texMat('crate', 0x9a7a50), 0, 0.38, 0); g.add(body);
      const lid = new T.Group(); lid.position.set(0, 0.76, 0.42); lid.add(mesh(box(1.82, 0.12, 0.87), texMat('crate', 0x8a6a44), 0, 0.06, -0.42)); g.add(lid); it.lid = lid;
      const q = W.label('?', '#7fe0ff', { w:64, h:64, sx:0.5, font:48 }); q.position.set(0, 0.45, F*0.46); g.add(q);
      const beam = new T.Mesh(cyl(0.25, 0.45, 40, 10, true), new T.MeshBasicMaterial({ color:0x7fe0ff, transparent:true, opacity:0.18, blending:T.AdditiveBlending, depthWrite:false }));
      beam.position.y = 20; g.add(beam); it.beam = beam;
      const lb = W.label('MYSTERY BOX\n' + ZD.SURVIVAL.boxPrice, ['#7fe0ff', '#ffd23a'], { h:96, sx:1.5, font:30 }); lb.position.set(0, 1.6, 0); g.add(lb); it.label = lb;
      const shown = new T.Group(); shown.position.set(0, 1.1, 0); g.add(shown); it.shown = shown; g.userData.dyn = true; break; }
    case 'upgrade': g.add(mesh(box(2.2, 1.0, 1.4), lam(0x3a2e4a), 0, 0.5, 0)); g.add(mesh(cyl(0.5, 0.6, 1.2, 12), lam(0x2a2236), 0, 1.6, 0));
      { const core = mesh(sph(0.35, 12, 10), new T.MeshBasicMaterial({ color:0x3a2a4a }), 0, 2.3, 0, false); g.add(core); it.core = core;
        const ring = new T.Mesh(new T.TorusGeometry(0.6, 0.05, 6, 24), new T.MeshBasicMaterial({ color:0xb45cff })); ring.position.y = 2.3; g.add(ring); it.ring = ring; ring.userData.ownGeo = true;
        const lb = W.label('UPGRADE STATION\n' + ZD.SURVIVAL.upgradePrice, ['#b45cff', '#ffd23a'], { h:96, sx:1.7, font:30 }); lb.position.set(0, 3.1, 0); g.add(lb); it.label = lb; }
      g.userData.dyn = true; break;
    case 'ammo': g.add(mesh(box(1.1, 0.55, 0.7), lam(0x3b4a2c), 0, 0.28, 0)); g.add(mesh(box(1.12, 0.1, 0.72), basic(0x7fe0ff), 0, 0.5, 0, false));
      { const gl = glowSprite(0x7fe0ff, 1.6, 0.45); gl.position.y = 0.6; g.add(gl); } break;
    case 'symbol': { const pl = new T.Mesh(new T.PlaneGeometry(0.8, 1.0), new T.MeshBasicMaterial({ map:glyphTex(it.glyph, it.order), transparent:true, opacity:0.55, depthWrite:false, blending:T.AdditiveBlending }));
      pl.userData.ownGeo = true; pl.position.set(0, it.y, F*0.06); pl.rotation.y = Math.PI; g.add(pl); it.plate = pl; g.userData.dyn = true; break; }
    case 'keypad': { g.add(mesh(box(0.6, 0.8, 0.08), lam(0x2a2e34), 0, 1.4, F*0.04)); const scr = mesh(box(0.46, 0.5, 0.02), new T.MeshBasicMaterial({ color:0x2a8a6a }), 0, 1.45, F*0.09, false); g.add(scr); it.screen = scr;
      const lb = W.label('SEALED', '#7affc8', { sx:1.0 }); lb.position.set(0, 2.0, F*0.1); g.add(lb); it.label = lb; g.userData.dyn = true; break; }
    case 'pedestal': { g.add(mesh(cyl(0.45, 0.55, 1.1, 10), lam(0x4a4a52), 0, 0.55, 0)); const gun = new T.Group(); gun.position.y = 1.6; gun.scale.setScalar(1.8); g.add(gun);
      const rig = { gun, muzzle:new T.Object3D() }; gun.add(rig.muzzle); W.setGunModel(rig, ZD.WEAPONS[M.def.secret].model, 0xffa63a); it.gun = gun;
      const gl = glowSprite(0xffa63a, 3, 0.55); gl.position.y = 1.6; g.add(gl); it.glow = gl; g.userData.dyn = true; break; }
    case 'altar': g.add(mesh(box(2.2, 1.0, 1.2), lam(0x24222a), 0, 0.5, 0)); for(const a of [-0.9, 0.9]){ g.add(mesh(cyl(0.06, 0.06, 0.3, 6), lam(0xe8e0d0), a, 1.15, 0)); const f = glowSprite(0xffa04a, 0.6, 0.8); f.position.set(a, 1.4, 0); g.add(f); }
      { const r = new T.Mesh(new T.PlaneGeometry(1.8, 0.9), new T.MeshBasicMaterial({ map:glyphTex(8, -1), transparent:true, opacity:0.7, blending:T.AdditiveBlending, depthWrite:false, color:0xff5a5a }));
        r.userData.ownGeo = true; r.rotation.x = -Math.PI/2; r.position.y = 1.01; g.add(r); it.runes = r; } g.userData.dyn = true; break;
    case 'note': { const pl = mesh(box(0.42, 0.55, 0.02), lam(0xe8dcc0), 0, it.y, F*0.02, false); g.add(pl); const gl = glowSprite(0xfff0c0, 0.9, 0.5); gl.position.set(0, it.y, F*0.1); g.add(gl); it.glow = gl; g.userData.dyn = true; break; }
    default: return null;
  }
  return g;
}
W.setPerkPower = function(it, on){ it.panel.material.color.set(on ? ZD.PERKS[it.perk].hex : 0x202020); it.glow.material.opacity = on ? 0.45 : 0; };
W.setPower = function(it, on){ it.lever.rotation.x = on ? -0.8 : 0.8; it.light.material.color.set(on ? 0x5be36b : 0xff3a2a); };
W.setUpgradeOn = function(it, on){ it.core.material.color.set(on ? 0xd89aff : 0x3a2a4a); };
function makeDoor(d, M){
  const g = new T.Group(), b = d.box, w = b.x1 - b.x0, dd = b.z1 - b.z0, h = Math.min(b.h, M.outdoor ? 3.4 : b.h); g.position.set((b.x0 + b.x1)/2, 0, (b.z0 + b.z1)/2);
  const style = d.kind === 'secret' ? 'secret' : (d.kind === 'shortcut' ? 'gate' : M.T.door);
  const add = (geo, mat, x, y, z)=>{ const m = mesh(geo, mat, x, y, z); g.add(m); return m; };
  if(style === 'secret'){ const wl = WALLSTYLE[M.T.wall] || WALLSTYLE.concrete; const mat = M.T.wall === 'facade' ? texMat('brick') : (wl.tex ? texMat(wl.tex) : lam(0x2a3a20));
    add(boxUV(w, b.h, dd, wl.su || 3, wl.sv || b.h), mat, 0, b.h/2, 0);
    const cr = new T.Mesh(new T.PlaneGeometry(2.6, 2.6), new T.MeshBasicMaterial({ map:tex('crack'), transparent:true, depthWrite:false })); cr.userData.ownGeo = true; cr.position.y = 1.4;
    const n = d.dir === 'x'; const c2 = cr.clone(); if(n){ cr.rotation.y = Math.PI/2; cr.position.x = w/2 + 0.02; c2.rotation.y = -Math.PI/2; c2.position.x = -w/2 - 0.02; } else { cr.position.z = dd/2 + 0.02; c2.rotation.y = Math.PI; c2.position.z = -dd/2 - 0.02; }
    c2.position.y = 1.4; g.add(cr); g.add(c2); }
  else if(style === 'gate'){ const fr = lam(0x5a5e64); const t = Math.min(w, dd), L = Math.max(w, dd), along = w > dd;
    add(boxUV(along ? L : 0.12, h, along ? 0.12 : L, 1, 1), newMat({ map:tex('fence'), transparent:true, alphaTest:0.4, side:T.DoubleSide, color:0xc8ccd0 }), 0, h/2, 0);
    add(box(along ? L : 0.14, 0.12, along ? 0.14 : L), fr, 0, h, 0); add(box(along ? L : 0.14, 0.12, along ? 0.14 : L), fr, 0, 0.1, 0);
    for(const s of [-1, 1]) add(box(0.14, h, 0.14), fr, along ? s*L/2 : 0, h/2, along ? 0 : s*L/2);
    if(d.kind === 'shortcut') add(box(along ? L*0.3 : 0.2, 0.3, along ? 0.2 : L*0.3), lam(0xd8b83a), 0, h*0.55, 0); }
  else { const mat = style === 'wood' ? texMat('logs') : style === 'shutter' ? texMat('corrugated', 0x9aa0a6) : style === 'bars' ? newMat({ map:tex('bars'), transparent:true, alphaTest:0.4, side:T.DoubleSide }) : lam(0x6a7078);
    add(boxUV(w, h, dd, style === 'shutter' ? 0.5 : 1.5, h), mat, 0, h/2, 0);
    if(style === 'metal'){ add(box(Math.max(w, dd)*0.25 + 0.02, 0.3, Math.min(w, dd) + 0.04), lam(0xd8b83a), 0, h*0.5, 0).rotation.y = w > dd ? 0 : Math.PI/2; } }
  if(d.kind === 'door'){ const lb = W.label('OPEN ' + d.cost, '#ffd23a', { sx:1.4 }); lb.position.y = h + 0.5; g.add(lb); d.label = lb; }
  if(d.kind === 'shortcut'){ const lb = W.label('LEVER', '#d8d8d8', { sx:1.0 }); lb.position.y = h + 0.5; g.add(lb); d.label = lb; }
  g.userData.dyn = true; g.userData.h = b.h; return g;
}
// doors sink into the floor (gates and walls) or roll up (shutters)
W.openDoor = function(d, instant){ const o = d.obj; if(!o) return; if(d.label) d.label.visible = false;
  if(instant){ W.remove(o); return; } W.anims.push({ t:0, dur:1.1, f:k=>{ o.position.y = -o.userData.h*k*1.05; if(k >= 1) W.remove(o); } }); };
W.setDoorLabel = function(d, text, css){ if(d.label) W.setLabel(d.label, text, css || '#ffd23a'); };

// ---- characters ---------------------------------------------------------------------------
function limb(len, w, mat){ const g = new T.Group(); g.add(mesh(box(w, len, w), mat, 0, -len/2, 0)); return g; }
function humanoid(c){
  const s = c.scale || 1, rig = { root:new T.Group(), s };
  const body = new T.Group(); rig.root.add(body); rig.body = body;
  const hips = new T.Group(); hips.position.y = 0.9; body.add(hips); rig.hips = hips;
  rig.legL = limb(0.46, 0.15, c.pants); rig.legL.position.set(-0.11, 0, 0); hips.add(rig.legL);
  rig.legR = limb(0.46, 0.15, c.pants); rig.legR.position.set( 0.11, 0, 0); hips.add(rig.legR);
  rig.shinL = limb(0.44, 0.13, c.pants); rig.shinL.position.y = -0.46; rig.legL.add(rig.shinL);
  rig.shinR = limb(0.44, 0.13, c.pants); rig.shinR.position.y = -0.46; rig.legR.add(rig.shinR);
  rig.shinL.add(mesh(box(0.16, 0.1, 0.24), c.boots, 0, -0.42, -0.04)); rig.shinR.add(mesh(box(0.16, 0.1, 0.24), c.boots, 0, -0.42, -0.04));
  rig.torso = new T.Group(); hips.add(rig.torso);
  rig.chest = mesh(box(0.44*(c.wide||1), 0.56, 0.24*(c.deep||1)), c.shirt, 0, 0.3, 0); rig.torso.add(rig.chest);
  rig.head = new T.Group(); rig.head.position.y = 0.62; rig.torso.add(rig.head);
  rig.headMesh = mesh(box(0.27, 0.29, 0.27), c.skin, 0, 0.15, 0); rig.head.add(rig.headMesh);
  rig.armL = limb(0.3, 0.12, c.sleeve || c.shirt); rig.armL.position.set(-0.29*(c.wide||1), 0.55, 0); rig.torso.add(rig.armL);
  rig.armR = limb(0.3, 0.12, c.sleeve || c.shirt); rig.armR.position.set( 0.29*(c.wide||1), 0.55, 0); rig.torso.add(rig.armR);
  rig.foreL = limb(c.zombie ? 0.36 : 0.28, 0.11, c.skinArm || c.skin); rig.foreL.position.y = -0.3; rig.armL.add(rig.foreL);
  rig.foreR = limb(c.zombie ? 0.36 : 0.28, 0.11, c.skinArm || c.skin); rig.foreR.position.y = -0.3; rig.armR.add(rig.foreR);
  rig.back = new T.Object3D(); rig.back.position.set(0, 0.35, 0.2*(c.deep||1)); rig.torso.add(rig.back);
  rig.blob = new T.Mesh(blobGeo(), c.blobMat || blobMat()); rig.blob.rotation.x = -Math.PI/2; rig.blob.position.y = 0.02; rig.blob.scale.set(1.15*(c.wide||1), 0.95*(c.deep||1), 1); rig.blob.renderOrder = 1; rig.root.add(rig.blob);
  rig.root.scale.setScalar(s);
  return rig;
}
// a soft dark spot under the feet: grounds characters when there are no shadow maps, deepens contact when there are
let _blobGeo = null, _blobMat = null;
function blobGeo(){ return _blobGeo || (_blobGeo = new T.PlaneGeometry(1, 1)); }
function blobMat(){ return _blobMat || (_blobMat = new T.MeshBasicMaterial({ map:tex('blob'), transparent:true, opacity:shadows ? 0.42 : 0.62, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 })); }
function soldier(outfit, accent, gold){
  const o = ZD.OUTFITS[outfit] || ZD.OUTFITS.woodland, cam = tex('camo'), R = { rim:true };
  const opt = extra=>Object.assign({}, R, gold ? { emissive:0x3a2a00, shine:[0x8a7030, 60] } : null, extra);
  const c = { pants:lam(o.pants, opt({ map:cam })), boots:lam(0x1c1b19, opt({ shine:[0x222222, 30] })), shirt:lam(o.shirt, opt({ map:cam })), sleeve:lam(o.sleeve, opt({ map:cam })), skin:lam(0xc29470, R), skinArm:lam(o.sleeve, opt({ map:cam })) };
  const rig = humanoid(c), vest = lam(o.vest, opt({ map:tex('gear') })), dark = lam(0x1e2022, opt({ shine:[0x2a2a2a, 30] }));
  rig.torso.add(mesh(box(0.5, 0.36, 0.3), vest, 0, 0.33, 0)); rig.torso.add(mesh(box(0.36, 0.42, 0.16), lam(o.vest, opt()), 0, 0.33, 0.2));
  rig.torso.add(mesh(box(0.3, 0.1, 0.13), dark, 0, 0.58, 0.22)); rig.torso.add(mesh(box(0.015, 0.34, 0.015), dark, 0.12, 0.74, 0.24, false));   // radio and antenna
  rig.torso.add(mesh(box(0.46, 0.06, 0.28), dark, 0, 0.02, 0));                                                                              // belt
  const helm = lam(accent != null ? accent : 0x3a4030, opt({ shine:[0x303030, 30] }));
  rig.head.add(mesh(box(0.33, 0.14, 0.33), helm, 0, 0.31, 0)); rig.head.add(mesh(box(0.31, 0.16, 0.06), helm, 0, 0.2, 0.14)); rig.head.add(mesh(box(0.35, 0.04, 0.36), helm, 0, 0.24, -0.01));
  rig.head.add(mesh(box(0.25, 0.06, 0.05), lam(0x101418, { shine:[0x8899aa, 90], rim:true }), 0, 0.29, -0.17, false));                         // goggles on the brim
  const eye = basic(0x15120f), skin = lam(0xc29470, R), brow = basic(0x2a1e14);
  rig.head.add(mesh(box(0.045, 0.03, 0.01), eye, -0.06, 0.17, -0.138, false)); rig.head.add(mesh(box(0.045, 0.03, 0.01), eye, 0.06, 0.17, -0.138, false));
  rig.head.add(mesh(box(0.055, 0.014, 0.01), brow, -0.06, 0.205, -0.139, false)); rig.head.add(mesh(box(0.055, 0.014, 0.01), brow, 0.06, 0.205, -0.139, false));
  rig.head.add(mesh(box(0.045, 0.06, 0.04), skin, 0, 0.13, -0.15, false)); rig.head.add(mesh(box(0.08, 0.014, 0.01), basic(0x5a2a22), 0, 0.075, -0.138, false));
  for(const sd of [-1, 1]) rig.head.add(mesh(box(0.012, 0.14, 0.012), dark, sd*0.138, 0.17, -0.05, false));                                   // chin strap
  for(let k=-1;k<=1;k++) rig.torso.add(mesh(box(0.1, 0.13, 0.05), lam(o.vest, opt({ map:tex('gear') })), k*0.12, 0.24, -0.17));              // magazine pouches
  for(const arm of [rig.armL, rig.armR]) arm.add(mesh(box(0.16, 0.09, 0.17), lam(o.vest, opt()), 0, -0.02, 0));                                // shoulder pads
  rig.legR.add(mesh(box(0.07, 0.17, 0.13), dark, 0.09, -0.2, 0)); rig.legR.add(mesh(box(0.05, 0.06, 0.1), lam(0x2a2c30, { shine:[0x444444, 40] }), 0.1, -0.1, 0, false));   // holster
  rig.shinL.add(mesh(box(0.15, 0.12, 0.05), dark, 0, -0.05, -0.07, false)); rig.shinR.add(mesh(box(0.15, 0.12, 0.05), dark, 0, -0.05, -0.07, false));   // knee pads
  if(accent != null){ rig.armL.add(mesh(box(0.13, 0.07, 0.13), basic(accent), 0, -0.08, 0, false)); rig.armR.add(mesh(box(0.13, 0.07, 0.13), basic(accent), 0, -0.08, 0, false)); }
  const glove = lam(0x2a2826, R); rig.foreL.add(mesh(box(0.1, 0.09, 0.1), glove, 0, -0.3, 0)); rig.foreR.add(mesh(box(0.1, 0.09, 0.1), glove, 0, -0.3, 0));
  rig.gun = new T.Group(); rig.gun.position.set(0.17, 0.36, -0.28); rig.torso.add(rig.gun);
  rig.muzzle = new T.Object3D(); rig.gun.add(rig.muzzle);
  rig.melee = new T.Group(); rig.melee.position.set(0, -0.28, 0); rig.foreL.add(rig.melee); rig.melee.visible = false;
  return rig;
}
W.makeSoldier = function(charId, outfit, opts){ opts = opts || {}; const c = ZD.CHARS[charId];
  const rig = soldier(outfit, c.color, outfit === 'gold'); rig.charId = charId;
  if(opts.tag){ rig.tag = nameTag(c.name, c.css); rig.tag.position.y = 2.35; rig.root.add(rig.tag); }
  W.setGunModel(rig, ZD.WEAPONS[opts.weapon || c.weapon].model);
  scene.add(rig.root); return rig; };
W.makeSurvivor = function(){
  const R = { rim:true }, c = { pants:lam(0x3a3f5a, R), boots:lam(0x2a2220, R), shirt:lam(0xc8a24a, { rim:true, map:tex('camo') }), skin:lam(0xd8a888, R), skinArm:lam(0xd8a888, R) };
  const rig = humanoid(c); rig.head.add(mesh(box(0.3, 0.12, 0.3), lam(0x4a2a1a), 0, 0.3, 0.02)); rig.head.add(mesh(box(0.3, 0.26, 0.08), lam(0x4a2a1a), 0, 0.14, 0.14));
  rig.foreL.add(mesh(box(0.1, 0.09, 0.1), lam(0xd8a888), 0, -0.3, 0)); rig.foreR.add(mesh(box(0.1, 0.09, 0.1), lam(0xd8a888), 0, -0.3, 0));
  rig.tag = nameTag('SURVIVOR', '#ffd23a'); rig.tag.position.y = 2.3; rig.root.add(rig.tag);
  scene.add(rig.root); return rig;
};
W.makeFigure = function(){ const c = { pants:basic(0x020203), boots:basic(0x020203), shirt:basic(0x050507), skin:basic(0x050507) }; const rig = humanoid(c); rig.root.scale.setScalar(1.08);
  const eye = basic(0xe8f0ff); rig.head.add(mesh(box(0.05, 0.03, 0.02), eye, -0.06, 0.18, -0.14, false)); rig.head.add(mesh(box(0.05, 0.03, 0.02), eye, 0.06, 0.18, -0.14, false));
  rig.armL.rotation.x = 0.05; rig.armR.rotation.x = 0.05; scene.add(rig.root); return rig; };
function nameTag(text, css){ const s = W.label(text, css, { sx:1.1 }); s.material.depthTest = false; return s; }
W.nameTag = nameTag;
// guns: the model is built from boxes; tint marks rarity
// guns: built from parts along -z (the barrel) with +y up; receivers, rails, optics, magazines, grips and stocks
W.setGunModel = function(rig, model, tint){
  [...rig.gun.children].forEach(ch=>{ if(ch !== rig.muzzle) rig.gun.remove(ch); });
  if(model === 'none'){ rig.muzzle.position.set(0, 0, 0); return; }
  const metal = lam(0x26282b, { shine:[0x5a5e64, 60] }), metal2 = lam(0x35383c, { shine:[0x4a4e54, 50] }), poly = lam(0x1c1d20, { shine:[0x1a1a1a, 14] }), wood = lam(0x6b4a2e, { shine:[0x1a1410, 20] });
  const add = (w, h, d, m, x, y, z, rx)=>{ const o = mesh(box(w, h, d), m, x, y, z); if(rx) o.rotation.x = rx; rig.gun.add(o); return o; };
  const tube = (r, len, m, x, y, z, seg)=>{ const o = mesh(cyl(r, r, len, seg || 10), m, x, y, z); o.rotation.x = Math.PI/2; rig.gun.add(o); return o; };
  const glass = basic(0x9ad8ff), red = basic(0xff3a2a);
  const grip = (z, m)=>add(0.04, 0.11, 0.045, m || poly, 0, -0.09, z, -0.32), mag = (z, h, m, curve)=>add(0.04, h || 0.13, 0.06, m || metal2, 0, -0.06 - (h || 0.13)/2, z, curve == null ? 0.18 : curve);
  const rail = (z, len)=>add(0.03, 0.014, len, metal, 0, 0.052, z), dot = (z)=>{ add(0.035, 0.04, 0.07, metal, 0, 0.08, z); add(0.025, 0.025, 0.004, red, 0, 0.085, z - 0.036); };
  let tip = -0.2;
  switch(model){
    case 'pistol': add(0.045, 0.05, 0.2, metal2, 0, 0.035, -0.06); add(0.04, 0.03, 0.17, poly, 0, 0.0, -0.05); grip(0.02); add(0.006, 0.014, 0.01, metal, 0, 0.066, -0.15); tube(0.009, 0.03, metal, 0, 0.035, -0.17, 8); tip = -0.18; break;
    case 'magnum': add(0.05, 0.06, 0.12, metal2, 0, 0.03, -0.02); tube(0.045, 0.07, metal, 0, 0.025, -0.03, 8); tube(0.018, 0.24, metal2, 0, 0.045, -0.2, 8); add(0.02, 0.012, 0.24, metal, 0, 0.068, -0.2);
      add(0.045, 0.12, 0.06, wood, 0, -0.06, 0.05, -0.35); tip = -0.32; break;
    case 'rifle': add(0.055, 0.07, 0.3, metal, 0, 0.012, -0.06); add(0.05, 0.05, 0.16, metal2, 0, -0.042, -0.02); add(0.064, 0.064, 0.24, poly, 0, 0.006, -0.31); rail(-0.18, 0.5);
      tube(0.013, 0.18, metal, 0, 0.012, -0.5); tube(0.019, 0.05, metal2, 0, 0.012, -0.61); add(0.012, 0.05, 0.012, metal, 0, 0.075, -0.41); dot(-0.08);
      mag(-0.08); grip(0.06); add(0.045, 0.065, 0.2, poly, 0, -0.02, 0.19); add(0.05, 0.1, 0.03, metal2, 0, -0.035, 0.3); tip = -0.65; break;
    case 'bulldog': add(0.065, 0.09, 0.42, metal, 0, 0.0, -0.1); add(0.07, 0.07, 0.2, poly, 0, -0.005, -0.38); tube(0.016, 0.16, metal2, 0, 0.0, -0.55); rail(-0.18, 0.4); dot(-0.12);
      mag(0.1, 0.15); grip(-0.15); add(0.06, 0.1, 0.04, metal2, 0, -0.02, 0.13); tip = -0.64; break;
    case 'smg': add(0.055, 0.075, 0.26, metal, 0, 0.0, -0.04); tube(0.015, 0.12, metal2, 0, 0.005, -0.23); add(0.045, 0.05, 0.1, poly, 0, -0.02, -0.17); rail(-0.04, 0.22); dot(-0.03);
      mag(-0.03, 0.17, metal2, 0.05); grip(0.07); add(0.012, 0.04, 0.16, metal2, 0, -0.01, 0.17); add(0.04, 0.07, 0.02, metal2, 0, -0.02, 0.25); tip = -0.3; break;
    case 'hornet': add(0.05, 0.075, 0.26, metal, 0, 0, -0.04); add(0.04, 0.28, 0.05, metal2, 0, -0.16, -0.06); tube(0.012, 0.1, metal2, 0, 0.01, -0.21); grip(0.06); dot(-0.02); tip = -0.28; break;
    case 'shotgun': tube(0.022, 0.6, metal, 0, 0.022, -0.26); tube(0.018, 0.5, metal2, 0, -0.022, -0.24); add(0.06, 0.055, 0.2, wood, 0, -0.02, -0.33); add(0.055, 0.075, 0.18, metal, 0, 0.005, -0.03);
      add(0.012, 0.02, 0.012, metal, 0, 0.05, -0.54); add(0.05, 0.09, 0.26, wood, 0, -0.04, 0.17, 0.12); add(0.052, 0.11, 0.03, poly, 0, -0.06, 0.3); tip = -0.58; break;
    case 'riot': add(0.07, 0.08, 0.28, metal, 0, 0.01, -0.06); tube(0.022, 0.32, metal2, 0, 0.02, -0.35); add(0.06, 0.06, 0.18, poly, 0, -0.025, -0.3); rail(-0.1, 0.36); dot(-0.05);
      add(0.05, 0.16, 0.08, metal2, 0, -0.1, -0.06); grip(0.08); add(0.05, 0.07, 0.18, poly, 0, -0.02, 0.2); tip = -0.52; break;
    case 'dmr': add(0.055, 0.07, 0.34, metal, 0, 0.0, -0.1); tube(0.014, 0.3, metal2, 0, 0.0, -0.42); tube(0.02, 0.05, metal, 0, 0.0, -0.6); add(0.06, 0.06, 0.16, wood, 0, -0.01, -0.3);
      tube(0.026, 0.22, metal, 0, 0.09, -0.08, 12); tube(0.032, 0.04, metal, 0, 0.09, -0.2, 12); add(0.025, 0.035, 0.03, metal2, 0, 0.06, -0.08); add(0.04, 0.004, 0.004, glass, 0, 0.09, -0.222);
      mag(-0.04, 0.09, metal2, 0.05); grip(0.08); add(0.05, 0.09, 0.22, wood, 0, -0.03, 0.22); tip = -0.64; break;
    case 'sniper': add(0.055, 0.065, 0.3, metal, 0, 0.0, -0.06); tube(0.016, 0.5, metal2, 0, 0.005, -0.45); tube(0.026, 0.06, metal, 0, 0.005, -0.72); add(0.06, 0.06, 0.24, poly, 0, -0.02, -0.28);
      tube(0.03, 0.32, metal, 0, 0.1, -0.06, 14); tube(0.04, 0.06, metal, 0, 0.1, -0.24, 14); tube(0.036, 0.05, metal, 0, 0.1, 0.12, 14); add(0.03, 0.04, 0.04, metal2, 0, 0.06, -0.12); add(0.03, 0.04, 0.04, metal2, 0, 0.06, 0.02);
      add(0.05, 0.006, 0.006, glass, 0, 0.1, -0.271); add(0.012, 0.03, 0.04, metal2, 0.035, 0.03, 0.02); mag(0.0, 0.07, metal2, 0); grip(0.1); add(0.05, 0.1, 0.26, poly, 0, -0.03, 0.24);
      for(const sd of [-1, 1]){ const b = add(0.012, 0.16, 0.012, metal2, sd*0.03, -0.07, -0.42); b.rotation.z = sd*0.25; } tip = -0.76; break;
    case 'lmg': add(0.075, 0.1, 0.4, metal, 0, 0.0, -0.08); add(0.08, 0.075, 0.22, poly, 0, 0.0, -0.36); tube(0.018, 0.22, metal2, 0, 0.0, -0.56); tube(0.024, 0.06, metal, 0, 0.0, -0.69); rail(-0.1, 0.36);
      add(0.12, 0.12, 0.13, metal2, 0.03, -0.1, -0.08); add(0.02, 0.06, 0.1, metal, -0.045, 0.0, -0.08); dot(-0.04); grip(0.08); add(0.06, 0.09, 0.22, poly, 0, -0.02, 0.22);
      for(const sd of [-1, 1]){ const b = add(0.012, 0.2, 0.012, metal2, sd*0.04, -0.09, -0.5); b.rotation.z = sd*0.3; } tip = -0.72; break;
    case 'launcher': tube(0.07, 0.5, metal, 0, 0.0, -0.18, 14); tube(0.11, 0.14, metal2, 0, 0, -0.06, 14); tube(0.075, 0.03, poly, 0, 0, -0.44, 14); add(0.05, 0.14, 0.08, metal2, 0, -0.1, 0.02); grip(0.05); add(0.05, 0.09, 0.2, wood, 0, -0.02, 0.2);
      add(0.03, 0.06, 0.06, metal2, 0, 0.1, -0.1); tip = -0.45; break;
    case 'flamer': tube(0.05, 0.5, metal2, 0, 0, -0.2); tube(0.07, 0.06, metal, 0, 0, -0.46); tube(0.09, 0.3, lam(0xc83a2a, { shine:[0x553333, 40] }), 0, -0.11, 0.05, 12); add(0.02, 0.04, 0.02, basic(0x3ab8ff), 0, -0.03, -0.49); grip(0.06); tip = -0.5; break;
    case 'tesla': add(0.07, 0.1, 0.4, metal, 0, 0, -0.1); for(let k=0;k<3;k++) tube(0.06, 0.03, basic(0x7fd8ff), 0, 0, -0.18 - k*0.08, 12); tube(0.012, 0.1, metal2, 0, 0, -0.38); add(0.05, 0.13, 0.07, metal2, 0, -0.1, 0.02); grip(0.08); tip = -0.44; break;
    case 'cryo': add(0.07, 0.1, 0.42, lam(0xd8e8f0, { shine:[0x8a9aaa, 60] }), 0, 0, -0.12); tube(0.05, 0.18, basic(0xa8e8ff), 0, 0.09, -0.08, 12); tube(0.02, 0.1, metal2, 0, 0, -0.38); add(0.05, 0.13, 0.07, metal2, 0, -0.1, 0.02); grip(0.08); tip = -0.42; break;
    case 'raygun': add(0.06, 0.1, 0.3, lam(0x8a2a2a, { shine:[0x8a5050, 60] }), 0, 0, -0.08); for(let k=0;k<3;k++) tube(0.07 - k*0.01, 0.03, basic(0x9cff3c), 0, 0, -0.14 - k*0.07, 14); add(0.05, 0.12, 0.06, lam(0x5a1a1a), 0, -0.1, 0.02, -0.3); tip = -0.34; break;
    case 'storm': add(0.07, 0.1, 0.52, lam(0x2a3a5a, { shine:[0x4a6a9a, 60] }), 0, 0, -0.12); add(0.03, 0.03, 0.24, basic(0x7fd8ff), 0, 0.01, -0.48); rail(-0.1, 0.4); dot(-0.06); mag(-0.04); grip(0.08); add(0.05, 0.09, 0.22, lam(0x2a3a5a), 0, -0.02, 0.22); tip = -0.62; break;
    case 'dragon': tube(0.022, 0.62, lam(0x3a1a12, { shine:[0x5a3020, 40] }), 0, 0.02, -0.26); add(0.07, 0.06, 0.22, lam(0x8a2a12), 0, -0.04, -0.3); add(0.06, 0.1, 0.24, lam(0x5a2a1a), 0, -0.03, 0.18); add(0.04, 0.04, 0.1, basic(0xff7a2a), 0, 0.06, -0.5); tip = -0.58; break;
    case 'void': tube(0.08, 0.46, lam(0x2a1a3a, { shine:[0x6a4a9a, 60] }), 0, 0, -0.16, 12); rig.gun.add(mesh(sph(0.08, 12, 10), basic(0xb45cff), 0, 0.02, -0.4, false)); add(0.05, 0.13, 0.07, metal2, 0, -0.1, 0.02); grip(0.08); tip = -0.44; break;
    default: add(0.05, 0.06, 0.2, metal2, 0, 0.03, -0.06); break;
  }
  if(tint != null && tint !== 0xd8d4cc){ rig.gun.add(mesh(box(0.075, 0.025, 0.12), basic(tint), 0, 0.03, 0.02, false)); }
  rig.muzzle.position.set(0, 0.02, tip);
};
W.setMeleeModel = function(rig, model){
  [...rig.melee.children].forEach(ch=>rig.melee.remove(ch));
  const add = (w, h, d, m, y)=>rig.melee.add(mesh(box(w, h, d), m, 0, y, 0));
  if(model === 'bat'){ add(0.06, 0.8, 0.06, lam(0x7a5a3a), -0.35); for(let k=0;k<4;k++) rig.melee.add(mesh(box(0.1, 0.02, 0.02), lam(0x8a8a8a), 0, -0.55 - k*0.1, 0)); }
  else if(model === 'machete'){ add(0.04, 0.14, 0.05, lam(0x2a2a2a), -0.05); add(0.02, 0.5, 0.08, lam(0xb8bcc0), -0.38); }
  else if(model === 'katana'){ add(0.04, 0.2, 0.04, lam(0x2a1a1a), -0.06); add(0.1, 0.02, 0.06, lam(0xc8a038), -0.17); add(0.015, 0.75, 0.05, lam(0xd8dce0), -0.55); }
  else { add(0.03, 0.1, 0.04, lam(0x2a2a2a), -0.04); add(0.015, 0.2, 0.04, lam(0xb8bcc0), -0.18); }
};
W.setAura = function(rig, color){ if(rig.aura){ rig.root.remove(rig.aura); rig.aura = null; } if(color == null) return; const a = glowSprite(color, 3.2, 0.35); a.position.y = 1.1; rig.root.add(a); rig.aura = a; };

// ---- zombies --------------------------------------------------------------------------------
const ZMAT = {};
function zmat(color, opt, map){ const k = color + keyOf(opt) + (map || ''); return ZMAT[k] || (ZMAT[k] = lam(color, Object.assign({ rim:true }, map ? { map:tex(map) } : null, opt))); }
// two eyes as one mesh: one draw call instead of two
let _eyes = null;
function eyesGeo(){ if(_eyes) return _eyes; const a = new T.BoxGeometry(0.06, 0.035, 0.02).toNonIndexed(), b = a.clone(); a.translate(-0.065, 0, 0); b.translate(0.065, 0, 0);
  const g = new T.BufferGeometry(), cat = k=>{ const x = a.attributes[k].array, y = b.attributes[k].array, o = new Float32Array(x.length + y.length); o.set(x); o.set(y, x.length); return new T.BufferAttribute(o, a.attributes[k].itemSize); };
  g.setAttribute('position', cat('position')); g.setAttribute('normal', cat('normal')); g.setAttribute('uv', cat('uv')); return _eyes = g; }
W.makeZombie = function(type, shirt, pants, mut){
  const d = ZD.ZOMBIES[type], gold = type === 'golden';
  const skinC = { brute:0x6a7d58, runner:0x8da371, bloater:0x8a9a5a, armored:0x76866a, healer:0x9aa88a, shield:0x72825e, stealth:0x5a6658, climber:0x6a7268, teleport:0x8a7a9a, mutant:0x7a9a4a, giant:0x5e7050, captain:0x667a52, golden:0xd8b048 }[type] || 0x7e9668;
  const opt = gold ? { emissive:0x4a3a08 } : null;
  const c = { pants:zmat(gold ? 0xb89038 : pants, opt, 'rags'), boots:zmat(0x1e1c1a), shirt:zmat(gold ? 0xc8a038 : (type === 'healer' ? 0xd8d8cc : shirt), opt, 'rags'), skin:zmat(skinC, opt, 'rot'), skinArm:zmat(skinC, opt, 'rot'), scale:d.scale,
    wide:{ brute:1.35, bloater:1.5, giant:1.3, captain:1.4, armored:1.1 }[type] || 1, deep:{ brute:1.5, bloater:1.9, giant:1.4, captain:1.5 }[type] || 1, zombie:true };
  let rig;
  if(type === 'stealth'){ // own see-through materials so each one can fade
    const fade = col=>newMat({ color:col, transparent:true, opacity:0.15, rim:true }); const mats = [fade(pants), fade(0x1e1c1a), fade(shirt), fade(skinC)];
    const bm = blobMat().clone(); bm.userData.base = bm.opacity; bm.opacity *= 0.15;
    rig = humanoid({ pants:mats[0], boots:mats[1], shirt:mats[2], skin:mats[3], skinArm:mats[3], scale:d.scale, zombie:true, blobMat:bm }); rig.fadeMats = mats; rig.fadeBlob = bm; }
  else rig = humanoid(c);
  const eyeC = { runner:0xff4a2a, bloater:0x9cff3c, teleport:0xc86aff, mutant:0x9cff3c, stealth:0xe8f0ff, healer:0x5be36b, golden:0xffffff }[type] || 0xffd23a;
  const eye = basic(mut === 'enraged' ? 0xff1a1a : eyeC, { fog:false });
  rig.head.add(mesh(eyesGeo(), eye, 0, 0.18, -0.14, false));
  if((W.envDark || W.envIndoor) && quality !== 'low' && type !== 'stealth'){ const g = glowSprite(mut === 'enraged' ? 0xff1a1a : eyeC, 0.5, 0.5); g.position.set(0, 0.18, -0.16); rig.head.add(g); }
  rig.head.add(mesh(box(0.13, 0.05, 0.02), basic(0x1a0404), 0, 0.075, -0.137, false));          // the jaw hangs open
  if(type !== 'stealth' && !gold){
    rig.head.add(mesh(box(0.04, 0.07, 0.012), basic(0x3a0606), 0.025, 0.035, -0.139, false));
    const claw = zmat(skinC === 0x8da371 ? 0x6a7a52 : 0x4a5a3a);
    for(const f of [rig.foreL, rig.foreR]) for(let k=-1;k<=1;k++){ const c = mesh(box(0.022, 0.1, 0.022), claw, k*0.032, -0.4, -0.025, false); c.rotation.x = 0.35; f.add(c); }
    const v = Math.random();
    if(v < 0.4){ const hair = zmat([0x1a1410, 0x3a2a1a, 0x5a4a3a, 0x2a2a2a][(Math.random()*4)|0]);                                           // patchy hair
      for(let k=0;k<3;k++) rig.head.add(mesh(box(0.11 + Math.random()*0.08, 0.05, 0.11 + Math.random()*0.08), hair, (Math.random() - 0.5)*0.14, 0.3, (Math.random() - 0.5)*0.12 + 0.03, false)); }
    else if(v < 0.55) rig.head.add(mesh(box(0.12, 0.04, 0.12), zmat(0x9a4a5a), 0.04, 0.3, 0.02, false));                                      // the skull is open
    if(Math.random() < 0.28 && (type === 'walker' || type === 'runner' || type === 'climber')){                                                 // ribs through the shirt
      rig.torso.add(mesh(box(0.3, 0.2, 0.012), basic(0x2a0606), 0, 0.42, -0.121, false));
      for(let k=0;k<3;k++) rig.torso.add(mesh(box(0.28, 0.022, 0.016), zmat(0xd8d0b8), 0, 0.36 + k*0.06, -0.128, false)); }
    if(Math.random() < 0.15){ const f = Math.random() < 0.5 ? rig.foreL : rig.foreR; f.add(mesh(box(0.035, 0.22, 0.035), zmat(0xd8d0b8), 0.04, -0.18, -0.04, false)); }   // a bone shows
  }
  rig.limp = Math.random() < 0.35 ? 0.5 + Math.random()*0.4 : 0; rig.twitchT = 1 + Math.random()*4; rig.twitch = 0;
  const steel = zmat(0x6a6e74), dark = zmat(0x2a2a2e);
  if(type === 'brute' || type === 'captain') rig.torso.add(mesh(box(0.5, 0.3, 0.36), c.shirt, 0, 0.18, -0.06));
  if(type === 'captain'){ rig.head.add(mesh(box(0.34, 0.1, 0.34), dark, 0, 0.32, 0)); rig.head.add(mesh(box(0.22, 0.12, 0.22), dark, 0, 0.42, 0)); rig.foreR.add(mesh(box(0.08, 0.6, 0.14), steel, 0, -0.5, -0.05)); }
  if(type === 'bloater'){ const pus = basic(0x9cff3c); rig.torso.add(mesh(sph(0.36, 12, 10), zmat(0x7a8a4a), 0, 0.22, -0.1));
    for(let i=0;i<5;i++) rig.torso.add(mesh(sph(0.06 + Math.random()*0.05, 8, 6), pus, (Math.random()-0.5)*0.5, 0.1 + Math.random()*0.4, -0.38 - Math.random()*0.04, false)); }
  if(type === 'armored' || mut === 'armor'){ rig.plates = new T.Group(); rig.torso.add(rig.plates);
    rig.plates.add(mesh(box(0.48, 0.36, 0.06), steel, 0, 0.34, -0.15)); rig.plates.add(mesh(box(0.48, 0.3, 0.06), steel, 0, 0.36, 0.15)); rig.plates.add(mesh(box(0.14, 0.12, 0.16), steel, -0.3, 0.6, 0)); rig.plates.add(mesh(box(0.14, 0.12, 0.16), steel, 0.3, 0.6, 0));
    if(d.helmet){ rig.helmet = mesh(box(0.33, 0.2, 0.33), steel, 0, 0.3, 0); rig.head.add(rig.helmet); } }
  if(type === 'healer'){ const orb = mesh(sph(0.1, 8, 6), basic(0x5be36b), 0, -0.36, -0.05, false); rig.foreL.add(orb); const g = glowSprite(0x5be36b, 1.2, 0.6); g.position.copy(orb.position); rig.foreL.add(g);
    rig.ring = new T.Mesh(new T.RingGeometry(d.heal.r - 0.15, d.heal.r, 32), new T.MeshBasicMaterial({ color:0x5be36b, transparent:true, opacity:0.18, side:T.DoubleSide, depthWrite:false })); rig.ring.userData.ownGeo = true;
    rig.ring.rotation.x = -Math.PI/2; rig.ring.position.y = 0.05; rig.root.add(rig.ring); }
  if(type === 'shield'){ rig.shield = mesh(box(0.7, 1.05, 0.06), newMat({ color:0x2a3440, transparent:true, opacity:0.85, shine:[0x6a7a8a, 60] }), 0, 0.3, -0.42); rig.shield.add(mesh(box(0.5, 0.1, 0.02), basic(0xd8d8d8), 0, 0.35, -0.04, false)); rig.torso.add(rig.shield); }
  if(type === 'teleport'){ const g = glowSprite(0xc86aff, 1.6, 0.4); g.position.y = 0.4; rig.torso.add(g); }
  if(type === 'mutant'){ const sac = mesh(sph(0.26, 10, 8), zmat(0x9aba3a, { emissive:0x1a3a00 }), 0, 0.4, 0.22); rig.torso.add(sac); rig.sac = sac; }
  if(type === 'giant'){ for(let k=0;k<5;k++){ const sp = mesh(cone(0.08, 0.35, 5), zmat(0xd8d0c0), -0.2 + k*0.1, 0.62, 0.12); sp.rotation.x = -0.6; rig.torso.add(sp); } }
  if(type === 'climber'){ rig.armL.scale.y = 1.4; rig.armR.scale.y = 1.4; }
  if(mut === 'volatile'){ const g = glowSprite(0x9cff3c, 1.2, 0.5); g.position.set(0, 0.3, -0.1); rig.torso.add(g); }
  if(mut === 'swift'){ const g = glowSprite(0x3ab8ff, 1.0, 0.45); g.position.set(0, 0.5, 0.15); rig.torso.add(g); }
  if(mut === 'regen'){ const g = glowSprite(0x5be36b, 1.0, 0.45); g.position.set(0, 0.5, 0); rig.torso.add(g); }
  if(gold){ const g = glowSprite(0xffd23a, 2.4, 0.5); g.position.y = 0.4; rig.torso.add(g); }
  rig.phase = Math.random()*10; rig.sway = Math.random()*10; rig.tilt = (Math.random()-0.5)*0.5;
  scene.add(rig.root); return rig;
};
W.fadeZombie = function(rig, a){ if(rig.fadeMats) for(const m of rig.fadeMats) m.opacity = a; if(rig.fadeBlob) rig.fadeBlob.opacity = rig.fadeBlob.userData.base*a; };
W.makeBoss = function(def){
  const R = { rim:true }, skin = lam(def.skin, { rim:true, map:tex('rot') }), shirt = lam(def.shirt, { rim:true, map:tex('rags') }), c = { pants:lam(0x2a2a2a, { rim:true, map:tex('rags') }), boots:lam(0x1a1a1a, R), shirt, skin, skinArm:skin, scale:def.scale, wide:1.25, deep:1.3 };
  const rig = humanoid(c), L = def.look, add = (parent, geo, mat, x, y, z)=>{ const m = mesh(geo, mat, x, y, z); parent.add(m); return m; };
  const eyeC = { frost:0x8ae8ff, hollow:0xffffff, king:0xff3a2a, specimen:0x3affd8, mannequin:0x1a1a1a }[L] || 0xffd23a;
  add(rig.head, box(0.06, 0.04, 0.02), basic(eyeC, { fog:false }), -0.07, 0.18, -0.14); add(rig.head, box(0.06, 0.04, 0.02), basic(eyeC, { fog:false }), 0.07, 0.18, -0.14);
  rig.foreL.add(mesh(box(0.11, 0.1, 0.11), skin, 0, -0.3, 0)); rig.foreR.add(mesh(box(0.11, 0.1, 0.11), skin, 0, -0.3, 0));
  const steel = lam(0x6a6e74), dark = lam(0x1a1a1e), gold = lam(0xd8b048, { emissive:0x3a2a00 });
  let weak = null;
  switch(L){
    case 'butcher': add(rig.torso, box(0.46, 0.6, 0.04), lam(0xc8c0b0), 0, 0.22, -0.15); add(rig.foreR, box(0.06, 0.5, 0.26), steel, 0, -0.5, -0.1); add(rig.head, box(0.3, 0.12, 0.05), dark, 0, 0.12, -0.15); break;
    case 'general': add(rig.head, box(0.34, 0.08, 0.36), lam(0x3a4a2a), 0, 0.33, -0.02); add(rig.head, box(0.36, 0.03, 0.12), dark, 0, 0.29, -0.2); for(const s of [-1, 1]) add(rig.torso, box(0.16, 0.04, 0.2), gold, s*0.28, 0.6, 0);
      weak = add(rig.torso, sph(0.22, 10, 8), basic(0xff7a4a), 0, 0.42, 0.24); break;
    case 'doctor': add(rig.torso, box(0.48, 0.9, 0.3), lam(0xe8e8e0), 0, 0.05, 0); add(rig.head, box(0.22, 0.14, 0.06), dark, 0, 0.1, -0.16); add(rig.foreR, cyl(0.03, 0.03, 0.3, 6), basic(0x9cff3c), 0, -0.45, 0); break;
    case 'specimen': for(let k=-1;k<=1;k++){ const t = add(rig.torso, cyl(0.06, 0.06, 0.5, 8), basic(0x3affd8), k*0.12, 0.4, 0.2); t.rotation.x = 0.3; } rig.armL.scale.y = 1.5; rig.armR.scale.y = 1.5; weak = rig.back; break;
    case 'warden': add(rig.head, box(0.34, 0.08, 0.34), lam(0x1a2030), 0, 0.33, 0); add(rig.head, box(0.36, 0.03, 0.14), dark, 0, 0.29, -0.2); for(let k=0;k<6;k++) add(rig.torso, box(0.06, 0.06, 0.06), steel, 0.22 - k*0.06, 0.1 - k*0.06, -0.16);
      add(rig.foreR, box(0.06, 0.6, 0.06), dark, 0, -0.5, 0); break;
    case 'mannequin': add(rig.head, sph(0.18, 10, 8), lam(0xe8e2d8), 0, 0.16, 0); break;
    case 'conductor': add(rig.head, cyl(0.17, 0.17, 0.3, 10), lam(0x1a1a3a), 0, 0.44, 0); add(rig.head, cyl(0.24, 0.24, 0.03, 10), lam(0x1a1a3a), 0, 0.3, 0);
      { const lan = add(rig.foreL, box(0.16, 0.22, 0.16), basic(0xffb35a), 0, -0.45, 0); const g = glowSprite(0xffa04a, 1.6, 0.6); g.position.copy(lan.position); rig.foreL.add(g); } weak = rig.back; break;
    case 'stalker': add(rig.head, box(0.36, 0.38, 0.36), lam(0x22261e), 0, 0.18, 0.03); for(const f of [rig.foreL, rig.foreR]) for(let k=-1;k<=1;k++) add(f, box(0.02, 0.25, 0.02), lam(0xd8d0c0), k*0.03, -0.45, -0.03); break;
    case 'golem': for(let k=0;k<6;k++) add(rig.torso, box(0.2, 0.2, 0.06), steel, (k%2 - 0.5)*0.24, 0.1 + (k>>1)*0.2, -0.16); add(rig.head, box(0.32, 0.3, 0.32), steel, 0, 0.16, 0);
      weak = add(rig.torso, sph(0.2, 10, 8), basic(0xff8a2a), 0, 0.4, 0.2); { const g = glowSprite(0xff8a2a, 1.4, 0.6); g.position.copy(weak.position); rig.torso.add(g); } break;
    case 'captain': add(rig.head, box(0.36, 0.1, 0.36), lam(0x1a2a4a), 0, 0.32, 0); add(rig.head, box(0.24, 0.12, 0.24), lam(0x1a2a4a), 0, 0.42, 0); add(rig.torso, sph(0.34, 12, 10), lam(0x7a8a4a), 0, 0.15, -0.14);
      weak = add(rig.torso, sph(0.24, 10, 8), basic(0x9cff3c), 0, 0.42, 0.22); break;
    case 'titan': for(let k=0;k<5;k++){ const r = add(rig.torso, sph(0.16, 5, 4), lam(0x8a7048), (Math.random()-0.5)*0.4, 0.2 + Math.random()*0.4, (Math.random()-0.5)*0.3); r.scale.y = 0.7; } break;
    case 'frost': for(const s of [-1, 1]) for(let k=0;k<3;k++){ const sp = add(rig.torso, cone(0.07, 0.4 + k*0.1, 5), basic(0xa8e8ff), s*(0.2 + k*0.06), 0.65 + k*0.05, 0); sp.rotation.z = -s*0.4; } break;
    case 'king': { const crown = new T.Group(); crown.position.y = 0.34; rig.head.add(crown); add(crown, cyl(0.19, 0.19, 0.12, 12), gold, 0, 0, 0);
      for(let k=0;k<6;k++){ const a = k/6*Math.PI*2; add(crown, cone(0.04, 0.16, 4), gold, Math.cos(a)*0.17, 0.12, Math.sin(a)*0.17); }
      const gem = add(crown, sph(0.06, 8, 6), basic(0xff2a2a), 0, 0.02, -0.19); weak = crown; const g = glowSprite(0xffd23a, 1.4, 0.5); crown.add(g);
      add(rig.torso, box(0.6, 1.0, 0.04), lam(0x6a1a2a), 0, 0.0, 0.16); add(rig.foreR, cyl(0.04, 0.04, 1.4, 6), gold, 0, -0.5, 0); void gem; break; }
    case 'hollow': { const hm = newMat({ color:0x0a0a0e, transparent:true, opacity:0.85, rim:true }); rig.root.traverse(o=>{ if(o.isMesh && o !== rig.blob && o.material !== undefined) o.material = hm; }); }
      add(rig.head, box(0.07, 0.05, 0.02), basic(0xffffff), -0.07, 0.18, -0.14); add(rig.head, box(0.07, 0.05, 0.02), basic(0xffffff), 0.07, 0.18, -0.14); break;
  }
  rig.weak = weak || rig.headMesh;
  const aura = glowSprite({ hollow:0x6a6aff, frost:0x8ae8ff, king:0xff3a2a }[L] || 0xff5a3a, 4, 0.25); aura.position.y = 1.0; rig.root.add(aura); rig.aura = aura;
  rig.phase = 0; rig.sway = 0; rig.tilt = 0;
  scene.add(rig.root); return rig;
};
W.remove = function(o){ if(o && o.parent) o.parent.remove(o); };

// ---- mission objects -------------------------------------------------------------------------
function beacon(color, h){ const g = new T.Group();
  const beam = new T.Mesh(cyl(0.18, 0.32, h, 10), new T.MeshBasicMaterial({ color, transparent:true, opacity:0.22, blending:T.AdditiveBlending, depthWrite:false }));
  beam.position.y = h/2; g.add(beam); const glow = glowSprite(color, 1.4, 0.7); glow.position.y = 0.35; g.add(glow);
  g.userData.beacon = true; return g; }
W.makeItem = function(kind){
  const g = new T.Group();
  if(kind === 'fuel'){ g.add(mesh(box(0.34, 0.46, 0.18), lam(0xc8302a), 0, 0.23, 0)); g.add(mesh(box(0.1, 0.1, 0.06), lam(0x222222), 0.1, 0.5, 0)); g.add(mesh(box(0.2, 0.05, 0.05), lam(0x222222), -0.05, 0.48, 0)); }
  else if(kind === 'medkit'){ g.add(mesh(box(0.52, 0.3, 0.34), lam(0xf0f0ea), 0, 0.15, 0)); g.add(mesh(box(0.08, 0.2, 0.36), basic(0xd8282a), 0, 0.17, 0, false)); g.add(mesh(box(0.22, 0.06, 0.36), basic(0xd8282a), 0, 0.17, 0, false)); }
  else if(kind === 'fuse'){ g.add(mesh(cyl(0.12, 0.12, 0.42, 10), lam(0xd8b83a), 0, 0.3, 0)); g.add(mesh(cyl(0.13, 0.13, 0.06, 10), lam(0x3a3a3a), 0, 0.08, 0)); g.add(mesh(cyl(0.13, 0.13, 0.06, 10), lam(0x3a3a3a), 0, 0.52, 0)); }
  else if(kind === 'bag'){ const b = mesh(sph(0.3, 8, 6), lam(0x3a5a8a), 0, 0.3, 0); b.scale.set(1.2, 0.9, 0.8); g.add(b); }
  else if(kind === 'code'){ g.add(mesh(box(0.42, 0.04, 0.55), lam(0xe8dcc0), 0, 0.03, 0)); }
  else if(kind === 'gear'){ g.add(mesh(box(0.8, 0.5, 0.45), lam(0x3a4a2c), 0, 0.25, 0)); g.add(mesh(box(0.82, 0.08, 0.47), lam(0xd8b83a), 0, 0.42, 0)); }
  else if(kind === 'stash'){ g.add(mesh(box(0.9, 0.55, 0.6), lam(0x4a3a5a), 0, 0.28, 0)); g.add(mesh(box(0.92, 0.08, 0.62), basic(0xb45cff), 0, 0.5, 0)); }
  g.add(beacon({ fuel:0xff8a3a, fuse:0xffd23a, bag:0x5aa8ff, code:0x7affc8, gear:0xffd23a, stash:0xb45cff }[kind] || 0xffffff, 2.4));
  scene.add(g); return g;
};
W.makeSwitch = function(color){
  const g = new T.Group(); g.add(mesh(box(0.9, 1.4, 0.6), lam(0x4a5058), 0, 0.7, 0)); g.add(mesh(box(0.7, 0.4, 0.05), basic(0x1a1e22), 0, 1.0, -0.31, false));
  const light = mesh(sph(0.1, 10, 8), basic(0xff3a2a), 0, 1.55, 0, false); g.add(light); g.userData.light = light;
  const ring = new T.Mesh(new T.PlaneGeometry(5.2, 5.2), new T.MeshBasicMaterial({ map:tex('ring'), color:color || 0xffd23a, transparent:true, opacity:0.6, depthWrite:false }));
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.04; g.add(ring); g.userData.ring = ring;
  g.add(beacon(color || 0xffd23a, 4)); scene.add(g); return g; };
W.switchOn = function(g){ g.userData.light.material = basic(0x5be36b); g.userData.ring.material.color.set(0x5be36b); g.children.forEach(c=>{ if(c.userData.beacon) c.visible = false; }); };
W.makeScanPoint = function(){ const g = new T.Group(); const ring = new T.Mesh(new T.PlaneGeometry(4, 4), new T.MeshBasicMaterial({ map:tex('ring'), color:0x7fe0ff, transparent:true, opacity:0.6, depthWrite:false }));
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.04; g.add(ring); g.userData.ring = ring; g.add(beacon(0x7fe0ff, 3)); g.add(mesh(box(0.5, 1.0, 0.5), lam(0x3a4a5a), 0, 0.5, 0)); scene.add(g); return g; };
W.makeNest = function(){
  const g = new T.Group(), flesh = lam(0x6a2a3a), dark = lam(0x3a1420), glowm = basic(0xff4a8a);
  const core = mesh(sph(1.1, 14, 10), flesh, 0, 0.8, 0); core.scale.set(1, 0.8, 1); g.add(core); g.userData.core = core;
  for(let i=0;i<7;i++){ const a = i/7*Math.PI*2, t = mesh(cyl(0.12, 0.3, 2.2, 6), dark, Math.cos(a)*1.1, 0.4, Math.sin(a)*1.1); t.rotation.z = Math.cos(a)*1.1; t.rotation.x = -Math.sin(a)*1.1; g.add(t); }
  for(let i=0;i<9;i++) g.add(mesh(sph(0.1 + Math.random()*0.08, 8, 6), glowm, (Math.random()-0.5)*1.6, 0.6 + Math.random()*0.8, (Math.random()-0.5)*1.6, false));
  g.add(beacon(0xff4a8a, 5)); scene.add(g); return g;
};
W.makeEvac = function(color){
  const g = new T.Group();
  const ring = new T.Mesh(new T.PlaneGeometry(16, 16), new T.MeshBasicMaterial({ map:tex('ring'), color:color || 0x5be36b, transparent:true, opacity:0.55, depthWrite:false }));
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.05; g.add(ring); g.userData.ring = ring;
  g.add(beacon(color || 0x5be36b, 9)); scene.add(g); return g;
};
W.makeHeli = function(){
  const g = new T.Group(), body = lam(0x3d4a36), dark = lam(0x1e2420);
  g.add(mesh(box(2.2, 2.0, 5.2), body, 0, 1.4, 0)); g.add(mesh(box(1.9, 1.1, 1.6), lam(0x2a3a44), 0, 1.7, -2.4));
  g.add(mesh(box(0.5, 0.5, 4.6), body, 0, 1.8, 4.6)); g.add(mesh(box(0.12, 1.4, 0.8), body, 0, 2.5, 6.8));
  g.add(mesh(box(0.15, 0.15, 3.2), dark, -1.1, 0.15, 0)); g.add(mesh(box(0.15, 0.15, 3.2), dark, 1.1, 0.15, 0));
  const rotor = new T.Group(); rotor.position.y = 2.65; rotor.add(mesh(box(11, 0.06, 0.4), dark, 0, 0, 0)); rotor.add(mesh(box(0.4, 0.06, 11), dark, 0, 0, 0)); g.add(rotor); g.userData.rotor = rotor;
  scene.add(g); return g;
};
W.makeTrain = function(){ const g = new T.Group(); g.add(mesh(boxUV(16, 2.8, 3, 5, 2.8), texMat('trainwin'), 0, 2.0, 0)); g.add(mesh(box(16, 0.2, 3.05), lam(0x8a8e92), 0, 3.5, 0));
  g.add(mesh(box(0.2, 1.2, 2.4), basic(0xfff2c0), -8.05, 2.2, 0, false)); const l = glowSprite(0xfff2c0, 3, 0.6); l.position.set(-8.3, 2.2, 0); g.add(l); scene.add(g); return g; };
W.makeGrenade = function(){ const m = mesh(sph(0.11, 10, 8), lam(0x3a4a2a), 0, 0, 0); scene.add(m); return m; };
W.makeProjectile = function(kind){
  const g = new T.Group();
  if(kind === 'launcher'){ g.add(mesh(cyl(0.07, 0.07, 0.24, 8), lam(0x4a5a3a), 0, 0, 0, false)); }
  else if(kind === 'ray'){ g.add(mesh(sph(0.16, 8, 6), basic(0x9cff3c), 0, 0, 0, false)); g.add(glowSprite(0x9cff3c, 1.4, 0.8)); }
  else if(kind === 'void'){ g.add(mesh(sph(0.22, 10, 8), basic(0x1a0a2a), 0, 0, 0, false)); g.add(glowSprite(0xb45cff, 1.8, 0.8)); }
  else if(kind === 'spit'){ g.add(mesh(sph(0.2, 8, 6), basic(0x9cff3c), 0, 0, 0, false)); g.add(glowSprite(0x9cff3c, 1.0, 0.6)); }
  else if(kind === 'shard'){ const c = mesh(cone(0.12, 0.6, 5), basic(0xa8e8ff), 0, 0, 0, false); c.rotation.x = Math.PI/2; g.add(c); }
  else if(kind === 'rock'){ g.add(mesh(sph(0.3, 6, 5), lam(0x7a6a5a), 0, 0, 0, false)); }
  else if(kind === 'meteor'){ g.add(mesh(sph(0.45, 8, 6), basic(0xff6a2a), 0, 0, 0, false)); g.add(glowSprite(0xff8a3a, 3, 0.9)); }
  scene.add(g); return g;
};
W.makePowerup = function(id){ const p = ZD.POWERUPS[id], g = new T.Group();
  const lb = W.label(p.icon, p.color, { w:128, h:128, sx:0.9, font:84 }); lb.position.y = 1.1; g.add(lb); g.userData.icon = lb;
  const gl = glowSprite(p.hex, 2.2, 0.7); gl.position.y = 1.1; g.add(gl); g.add(beacon(p.hex, 3));
  scene.add(g); return g; };
W.makeTurret = function(){ const g = new T.Group(); for(let k=0;k<3;k++){ const a = k/3*Math.PI*2, l = mesh(cyl(0.04, 0.04, 1.0, 5), lam(0x2a2a2a), Math.cos(a)*0.3, 0.45, Math.sin(a)*0.3); l.rotation.z = Math.cos(a)*0.4; l.rotation.x = -Math.sin(a)*0.4; g.add(l); }
  const head = new T.Group(); head.position.y = 0.95; g.add(head); head.add(mesh(box(0.4, 0.3, 0.5), lam(0xd8b83a), 0, 0, 0)); head.add(mesh(cyl(0.04, 0.04, 0.6, 6), lam(0x2a2a2a), 0, 0.02, -0.5)).rotation.x = Math.PI/2;
  const m = new T.Object3D(); m.position.set(0, 0.02, -0.8); head.add(m); g.userData.head = head; g.userData.muzzle = m; scene.add(g); return g; };
W.makeSupply = function(){ const g = new T.Group(); g.add(mesh(box(1.2, 0.8, 1.2), lam(0x4a5a3a), 0, 0.4, 0)); g.add(mesh(box(1.22, 0.1, 1.22), basic(0x7fe0ff), 0, 0.82, 0));
  const chute = mesh(sph(1.6, 10, 6, 0, Math.PI*2, 0, Math.PI/2), lam(0xd8d0c0), 0, 3.6, 0); g.add(chute); g.userData.chute = chute; g.add(beacon(0x7fe0ff, 4)); scene.add(g); return g; };
W.wallText = function(x, y, z, yaw, text){ const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.font = 'bold 72px "Bungee", Impact, sans-serif'; g.fillStyle = 'rgba(150,10,10,.9)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 64);
  for(let i=0;i<20;i++){ g.fillRect(40 + Math.random()*430, 80 + Math.random()*10, 3, 10 + Math.random()*30); }
  const t = new T.CanvasTexture(c), m = new T.Mesh(new T.PlaneGeometry(4, 1), new T.MeshBasicMaterial({ map:t, transparent:true, depthWrite:false })); m.userData.ownGeo = true;
  m.position.set(x, y, z); m.rotation.y = yaw; (W.dynGroup || scene).add(m); return m; };

// ---- animation ------------------------------------------------------------------------------
function lerpA(a, b, k){ return a + (b - a)*Math.min(1, k); }
W.animSoldier = function(rig, st, dt){
  if(st.down){ rig.body.rotation.x = lerpA(rig.body.rotation.x, -1.3, dt*6); rig.body.position.y = lerpA(rig.body.position.y, 0.28, dt*6);
    rig.armL.rotation.set(1.0, 0, 0.4); rig.armR.rotation.set(1.6, 0, -0.2); rig.legL.rotation.x = 0.3; rig.legR.rotation.x = -0.1; return; }
  rig.body.rotation.x = lerpA(rig.body.rotation.x, 0, dt*8); rig.body.position.y = lerpA(rig.body.position.y, 0, dt*8);
  rig.phase = (rig.phase || 0) + dt*(st.moving ? (st.sprint ? 11 : 8) : 0)*(st.back ? -1 : 1);
  const a = st.moving ? (st.sprint ? 0.85 : 0.6) : 0, ph = rig.phase;
  rig.legL.rotation.x = Math.sin(ph)*a; rig.legR.rotation.x = -Math.sin(ph)*a;
  rig.shinL.rotation.x = Math.max(0, -Math.sin(ph))*a*1.1; rig.shinR.rotation.x = Math.max(0, Math.sin(ph))*a*1.1;
  rig.hips.position.y = 0.9 + Math.abs(Math.sin(ph))*0.04*(a > 0 ? 1 : 0);
  const lower = st.sprint ? 0.55 : (st.swap > 0 ? 0.9*Math.sin(Math.min(1, st.swap)*Math.PI) : 0) + (st.reload > 0 ? 0.35 : 0);
  rig.torso.rotation.x = st.pitch*0.65 - (st.sprint ? 0.15 : 0); rig.head.rotation.x = st.pitch*0.3;
  const melee = st.melee > 0 ? Math.sin((1 - st.melee/0.35)*Math.PI) : 0;
  rig.armR.rotation.set(1.42 - lower, 0, -0.08);
  rig.armL.rotation.set(melee > 0 ? 1.6 + melee*1.2 : 1.25 - lower, 0, melee > 0 ? 0.2 - melee*0.9 : 0.55);
  if(rig.melee) rig.melee.visible = melee > 0.05;
  rig.foreR.rotation.x = 0.25; rig.foreL.rotation.x = 0.45;
  rig.breath = (rig.breath || Math.random()*6) + dt*(st.moving ? 0 : 1.9); const br = st.moving ? 0 : Math.sin(rig.breath);
  rig.torso.position.y = br*0.006; rig.torso.rotation.x += br*0.012;
  rig.gun.rotation.x = -lower*0.8 + (st.recoil||0)*2.2 + br*0.01; rig.gun.rotation.y = st.moving ? 0 : Math.sin(rig.breath*0.6)*0.012; rig.gun.position.z = -0.28 + (st.recoil||0)*0.4;
  rig.torso.rotation.y = st.ads ? 0.12 : 0.05;
};
W.animSurvivor = function(rig, moving, dt){
  rig.phase = (rig.phase || 0) + dt*(moving ? 8 : 0); const a = moving ? 0.6 : 0, ph = rig.phase;
  rig.legL.rotation.x = Math.sin(ph)*a; rig.legR.rotation.x = -Math.sin(ph)*a; rig.shinL.rotation.x = Math.max(0, -Math.sin(ph))*a; rig.shinR.rotation.x = Math.max(0, Math.sin(ph))*a;
  rig.armL.rotation.x = -Math.sin(ph)*a*0.6; rig.armR.rotation.x = Math.sin(ph)*a*0.6;
};
W.animZombie = function(rig, z, dt){
  const d = z.boss ? { lean:0.15, arms:1.1 } : ZD.ZOMBIES[z.type];
  if(z.state === 'dead'){ const t = z.deadT, kn = Math.min(1, t/0.22), k = Math.min(1, Math.max(0, t - 0.12)/0.5), e = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
    if(rig.twist == null) rig.twist = (Math.random() - 0.5)*1.2;
    const bounce = k >= 1 ? Math.max(0, Math.sin((t - 0.62)*14))*Math.exp(-(t - 0.62)*7)*0.12 : 0;
    rig.body.rotation.x = z.fallDir*(e*1.42 - bounce); rig.body.rotation.z = rig.twist*e*0.5; rig.body.position.y = -kn*(1 - e)*0.18;
    rig.legL.rotation.x = -kn*(1 - e)*0.7 + e*0.35; rig.legR.rotation.x = -kn*(1 - e)*0.4 - e*0.15;
    rig.shinL.rotation.x = kn*(1 - e)*1.3 + e*0.2; rig.shinR.rotation.x = kn*(1 - e)*0.9 + e*0.5;
    rig.armL.rotation.set(0.4 + e*1.5, 0, e*0.7); rig.armR.rotation.set(0.2 + e*1.8, 0, -e*0.5); rig.head.rotation.set(z.fallDir*e*0.5, 0, rig.twist*0.6*e);
    if(k >= 1 && !rig.landed){ rig.landed = true; const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw); W.dust(z.x - fx*z.fallDir*1.2, 0.1, z.z - fz*z.fallDir*1.2, 7); }
    if(t > 2.2) rig.root.position.y = -(t - 2.2)*0.6; return; }
  if(z.frozen > 0) return;
  const moving = z.moveSpeed > 0.05;
  rig.phase += dt*(moving ? z.moveSpeed*(z.type === 'runner' || z.type === 'climber' ? 2.4 : 3.4)/(rig.s || 1) : 0.8);
  const ph = rig.phase, a = moving ? (z.type === 'runner' || z.type === 'climber' ? 0.85 : 0.5) : 0.08;
  const lr = 1 - (rig.limp || 0)*(moving ? 1 : 0);                      // a dragged leg swings less
  rig.legL.rotation.x = Math.sin(ph)*a; rig.legR.rotation.x = -Math.sin(ph)*a*lr;
  rig.shinL.rotation.x = Math.max(0, -Math.sin(ph))*a*1.2; rig.shinR.rotation.x = Math.max(0, Math.sin(ph))*a*1.2*lr;
  rig.hips.position.y = 0.9 + Math.abs(Math.sin(ph))*0.05; rig.hips.rotation.z = rig.limp && moving ? Math.sin(ph)*0.07*rig.limp : 0;
  rig.twitchT -= dt; if(rig.twitchT <= 0){ rig.twitchT = 1.5 + Math.random()*4; rig.twitch = (Math.random() < 0.5 ? -1 : 1)*(0.25 + Math.random()*0.3); }
  rig.twitch *= Math.exp(-dt*7);
  rig.sway += dt*1.3;
  const flinch = z.flinch > 0 ? z.flinch/0.25 : 0;
  rig.torso.rotation.x = -d.lean + Math.sin(rig.sway)*0.05 + flinch*0.55 + (z.state === 'charge' ? -0.5 : 0);
  rig.torso.rotation.z = Math.sin(ph*0.5)*0.08 + rig.tilt*0.1;
  rig.head.rotation.x = d.lean*0.9 + Math.sin(rig.sway*1.7)*0.08 + flinch*0.4; rig.head.rotation.z = rig.tilt + Math.sin(rig.sway)*0.1 + (rig.twitch || 0);
  rig.head.rotation.y = (rig.twitch || 0)*0.6;
  let armX = d.arms + Math.sin(ph*0.5 + 1)*0.12, armX2 = d.arms + Math.sin(ph*0.5)*0.12;
  if(z.state === 'attack' || z.state === 'slam'){ const k = z.atkPose || 0; armX = 1.9 - k*1.6 + (z.state === 'slam' ? 1.2*(1 - k) : 0); armX2 = 1.9 - Math.max(0, k - 0.15)*1.6 + (z.state === 'slam' ? 1.2*(1 - k) : 0); }
  if(z.state === 'roar'){ armX = 2.6; armX2 = 2.6; rig.torso.rotation.x = 0.3; }
  if(z.state === 'spit' || z.state === 'cast'){ armX = 2.2; armX2 = 0.6; }
  if(z.type === 'shield' && rig.shield){ armX = 1.4; armX2 = 1.4; }
  rig.armL.rotation.set(armX2, 0, 0.12); rig.armR.rotation.set(armX, 0, -0.12);
  rig.foreL.rotation.x = 0.25; rig.foreR.rotation.x = 0.2;
  rig.body.rotation.x = z.state === 'rise' ? 0.4*(1 - Math.min(1, z.riseT/1.2)) : 0;
  if(z.type === 'bloater'){ const s = 1 + Math.sin(rig.sway*3)*0.03 + (z.fuse > 0 ? (1 - z.fuse/0.8)*0.3 : 0); rig.torso.scale.set(s, s, s); }
  if(rig.ring) rig.ring.rotation.z += dt*0.6;
};

// ---- effects --------------------------------------------------------------------------------
const P = {};
const tracers = [], arcs = []; let flash, shakeT = 0;
function makePsys(max, additive, key, ramp){
  const geo = new T.BufferGeometry();
  const pos = new Float32Array(max*3), col = new Float32Array(max*4), size = new Float32Array(max), rot = new Float32Array(max);
  geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('rgba', new T.BufferAttribute(col, 4)); geo.setAttribute('size', new T.BufferAttribute(size, 1)); geo.setAttribute('rot', new T.BufferAttribute(rot, 1));
  const uniforms = { map:{ value:tex(key || 'soft') }, uScale:{ value:400 } };
  const mat = new T.ShaderMaterial({ uniforms, transparent:true, depthWrite:false, blending:additive ? T.AdditiveBlending : T.NormalBlending,
    vertexShader:'attribute float size; attribute float rot; attribute vec4 rgba; uniform float uScale; varying vec4 vC; varying float vR; void main(){ vC = rgba; vR = rot; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*uScale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; }',
    fragmentShader:'uniform sampler2D map; varying vec4 vC; varying float vR; void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); vec4 t = texture2D(map, vec2(c*p.x - s*p.y, s*p.x + c*p.y) + 0.5); float a = vC.a*t.a; if(a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a); }' });
  const pts = new T.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  return { max, n:0, pos, col, size, rot, geo, pts, uniforms, ramp:!!ramp, spin:key === 'smoke', vel:new Float32Array(max*3), life:new Float32Array(max), age:new Float32Array(max), base:new Float32Array(max*5), grav:new Float32Array(max), drag:new Float32Array(max), rv:new Float32Array(max) };
}
function initFx(){
  P.normal = makePsys(1600, false); P.add = makePsys(900, true); P.fire = makePsys(700, true, 'flame', true); P.smoke = makePsys(500, false, 'smoke');
  W.pUniforms = [P.normal.uniforms, P.add.uniforms, P.fire.uniforms, P.smoke.uniforms];
  initMotes();
  const [, h] = W.viewportSize(); W.pUniforms.forEach(u=>u.uScale.value = h*renderer.getPixelRatio()*0.5);
  const tm = new T.MeshBasicMaterial({ color:0xffe7a0, transparent:true, opacity:0.9, blending:T.AdditiveBlending, depthWrite:false });
  for(let i=0;i<48;i++){ const m = new T.Mesh(new T.BoxGeometry(1, 1, 1), tm.clone()); m.visible = false; scene.add(m); tracers.push({ m, t:0 }); }
  for(let i=0;i<16;i++){ const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(24*3), 3));
    const l = new T.Line(g, new T.LineBasicMaterial({ color:0x9ae8ff, transparent:true, opacity:1, blending:T.AdditiveBlending, depthWrite:false })); l.frustumCulled = false; l.visible = false; scene.add(l); arcs.push({ l, t:0 }); }
  const fm = new T.MeshBasicMaterial({ map:tex('flash'), transparent:true, opacity:0.55, blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide });
  flash = new T.Group(); const p1 = new T.Mesh(new T.PlaneGeometry(0.5, 0.5), fm), p2 = p1.clone(); p2.rotation.y = Math.PI/2; const p3 = p1.clone(); p3.rotation.x = Math.PI/2;
  flash.add(p1, p2, p3); flash.visible = false; flash.t = 0; scene.add(flash);
}
// dust floating in the air: drifts on the GPU, wraps around the camera, glows where the light catches it
let motes = null;
function initMotes(){
  const N = 280, pos = new Float32Array(N*3), rnd = new Float32Array(N); for(let i=0;i<N;i++){ pos[i*3] = Math.random()*24; pos[i*3+1] = Math.random()*6; pos[i*3+2] = Math.random()*24; rnd[i] = Math.random(); }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('rnd', new T.BufferAttribute(rnd, 1));
  const u = { map:{ value:tex('soft') }, uScale:{ value:400 }, uTime:{ value:0 }, uCam:{ value:new T.Vector3() }, uColor:{ value:new T.Color(0xfff0d8) }, uAlpha:{ value:0 } };
  const mat = new T.ShaderMaterial({ uniforms:u, transparent:true, depthWrite:false, blending:T.AdditiveBlending,
    vertexShader:`attribute float rnd; uniform float uTime, uScale; uniform vec3 uCam; varying float vA;
      void main(){ vec3 p = position + vec3(sin(uTime*0.3 + rnd*20.0)*0.7, uTime*(0.04 + rnd*0.07), cos(uTime*0.23 + rnd*13.0)*0.7);
        vec3 box = vec3(24.0, 6.0, 24.0), o = vec3(uCam.x - 12.0, 0.0, uCam.z - 12.0); p = mod(p - o, box) + o;
        vec3 e = min(p - o, o + box - p); vA = clamp(min(e.x, e.z)/3.0, 0.0, 1.0)*clamp(e.y, 0.0, 1.0)*(0.55 + 0.45*sin(uTime*1.7 + rnd*40.0));
        vec4 mv = modelViewMatrix*vec4(p, 1.0); gl_PointSize = (0.02 + rnd*0.025)*uScale/max(0.1, -mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader:'uniform sampler2D map; uniform vec3 uColor; uniform float uAlpha; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).a*vA*uAlpha; if(a < 0.01) discard; gl_FragColor = vec4(uColor*a, a); }' });
  motes = new T.Points(geo, mat); motes.frustumCulled = false; scene.add(motes); W.motes = u;
}
function tickMotes(){ if(!motes) return; const u = W.motes; u.uTime.value = WIND.value; u.uCam.value.copy(camera.position);
  u.uScale.value = W.pUniforms[0].uScale.value; u.uAlpha.value = quality === 'low' ? 0 : (W.envIndoor ? 0.75 : (W.envDark ? 0.6 : 0.3)); }
W.particle = function(sys, x, y, z, vx, vy, vz, life, size, r, g, b, a, grav, drag){
  const s = P[sys]; if(W.lowFx && Math.random() < 0.5) return;
  const i = s.n < s.max ? s.n++ : (Math.random()*s.max)|0;
  s.pos[i*3] = x; s.pos[i*3+1] = y; s.pos[i*3+2] = z; s.vel[i*3] = vx; s.vel[i*3+1] = vy; s.vel[i*3+2] = vz;
  s.life[i] = life; s.age[i] = 0; s.base[i*5] = r; s.base[i*5+1] = g; s.base[i*5+2] = b; s.base[i*5+3] = a; s.base[i*5+4] = size;
  s.grav[i] = grav||0; s.drag[i] = drag||0; s.rot[i] = Math.random()*6.28; s.rv[i] = s.spin ? (Math.random() - 0.5)*1.2 : 0;
};
function tickPsys(s, dt){
  let w = 0;
  for(let i=0;i<s.n;i++){
    s.age[i] += dt; if(s.age[i] >= s.life[i]) continue;
    const k = s.age[i]/s.life[i], dr = Math.max(0, 1 - s.drag[i]*dt);
    s.vel[i*3+1] -= s.grav[i]*dt; s.vel[i*3] *= dr; s.vel[i*3+1] *= dr; s.vel[i*3+2] *= dr;
    let x = s.pos[i*3] + s.vel[i*3]*dt, y = s.pos[i*3+1] + s.vel[i*3+1]*dt, z = s.pos[i*3+2] + s.vel[i*3+2]*dt;
    if(y < 0.02){ y = 0.02; s.vel[i*3+1] *= -0.2; s.vel[i*3] *= 0.6; s.vel[i*3+2] *= 0.6; }
    s.pos[w*3] = x; s.pos[w*3+1] = y; s.pos[w*3+2] = z;
    s.vel[w*3] = s.vel[i*3]; s.vel[w*3+1] = s.vel[i*3+1]; s.vel[w*3+2] = s.vel[i*3+2];
    s.life[w] = s.life[i]; s.age[w] = s.age[i]; s.grav[w] = s.grav[i]; s.drag[w] = s.drag[i]; s.rv[w] = s.rv[i]; s.rot[w] = s.rot[i] + s.rv[i]*dt;
    for(let j=0;j<5;j++) s.base[w*5+j] = s.base[i*5+j];
    if(s.ramp){ s.col[w*4] = s.base[w*5]*(1 - k*0.25); s.col[w*4+1] = s.base[w*5+1]*(1 - k*0.85); s.col[w*4+2] = s.base[w*5+2]*(1 - k); }     // white-hot to deep red
    else { s.col[w*4] = s.base[w*5]; s.col[w*4+1] = s.base[w*5+1]; s.col[w*4+2] = s.base[w*5+2]; }
    s.col[w*4+3] = s.base[w*5+3]*(1 - k*k);
    s.size[w] = s.base[w*5+4]*(0.6 + k*0.8);
    w++;
  }
  s.n = w; s.geo.setDrawRange(0, w);
  s.geo.attributes.position.needsUpdate = true; s.geo.attributes.rgba.needsUpdate = true; s.geo.attributes.size.needsUpdate = true; s.geo.attributes.rot.needsUpdate = true;
}
const C3 = c=>{ const t = new T.Color(c); return [t.r, t.g, t.b]; };
W.goo = function(x, y, z, dx, dy, dz, n, big){
  for(let i=0;i<n;i++){ const sp = 1.5 + Math.random()*3.5*(big ? 1.5 : 1);
    W.particle('normal', x, y, z, dx*sp + (Math.random()-0.5)*2.4, dy*sp + Math.random()*2.2, dz*sp + (Math.random()-0.5)*2.4,
      0.45 + Math.random()*0.5, 0.07 + Math.random()*0.09*(big ? 1.6 : 1), 0.36 + Math.random()*0.15, 0.62 + Math.random()*0.2, 0.12, 0.95, 9, 1.2); }
  if(big) for(let i=0;i<6;i++) W.particle('normal', x, y, z, (Math.random()-0.5)*1.4, Math.random()*1.4, (Math.random()-0.5)*1.4, 0.7, 0.26, 0.28, 0.42, 0.1, 0.6, 2, 2);
};
W.pinkGoo = function(x, y, z, n){ for(let i=0;i<n;i++) W.particle('normal', x, y, z, (Math.random()-0.5)*4, Math.random()*4, (Math.random()-0.5)*4, 0.6, 0.12 + Math.random()*0.1, 0.9, 0.3, 0.55, 0.9, 9, 1); };
W.dust = function(x, y, z, n){ for(let i=0;i<n;i++) W.particle('normal', x, y, z, (Math.random()-0.5)*1.6, Math.random()*1.4, (Math.random()-0.5)*1.6, 0.5 + Math.random()*0.5, 0.18 + Math.random()*0.16, 0.55, 0.52, 0.48, 0.45, 1.2, 1.5); };
W.sparks = function(x, y, z, n, color){ const c = color ? C3(color) : [1, 0.75, 0.35]; for(let i=0;i<n;i++) W.particle('add', x, y, z, (Math.random()-0.5)*5, Math.random()*4, (Math.random()-0.5)*5, 0.18 + Math.random()*0.15, 0.05, c[0], c[1], c[2], 1, 12, 0.5); };
W.smoke = function(x, y, z){ W.particle('smoke', x, y, z, (Math.random()-0.5)*0.3, 0.5 + Math.random()*0.3, (Math.random()-0.5)*0.3, 0.9, 0.22, 0.62, 0.62, 0.64, 0.4, -0.4, 1.2); };
W.rise = function(x, z){ for(let i=0;i<14;i++) W.particle('normal', x + (Math.random()-0.5)*0.8, 0.1, z + (Math.random()-0.5)*0.8, (Math.random()-0.5)*1.2, 1 + Math.random()*1.5, (Math.random()-0.5)*1.2, 0.8, 0.22, 0.24, 0.2, 0.15, 0.7, 4, 1); };
W.burst = function(x, y, z, color, n){ const c = C3(color); for(let i=0;i<n;i++){ const a = Math.random()*6.28, s = 2 + Math.random()*3;
  W.particle('add', x, y, z, Math.cos(a)*s, Math.random()*3, Math.sin(a)*s, 0.6, 0.12, c[0], c[1], c[2], 1, 2, 1.5); } };
W.flame = function(x, y, z, dx, dy, dz, n){ for(let i=0;i<n;i++){ const s = 7 + Math.random()*5;
  W.particle('fire', x, y, z, dx*s + (Math.random()-0.5)*2.2, dy*s + Math.random()*1.4, dz*s + (Math.random()-0.5)*2.2, 0.35 + Math.random()*0.25, 0.34 + Math.random()*0.25, 1, 0.75 + Math.random()*0.2, 0.35, 0.9, -2, 2.5); } };
W.burn = function(x, y, z){ W.particle('fire', x + (Math.random()-0.5)*0.45, y + Math.random()*0.5, z + (Math.random()-0.5)*0.45, (Math.random()-0.5)*0.3, 1.4 + Math.random(), (Math.random()-0.5)*0.3, 0.45 + Math.random()*0.2, 0.3 + Math.random()*0.15, 1, 0.8, 0.4, 0.85, -1, 1); };
W.ice = function(x, y, z, n){ for(let i=0;i<n;i++) W.particle('add', x, y, z, (Math.random()-0.5)*3, Math.random()*2.5, (Math.random()-0.5)*3, 0.5, 0.1, 0.7, 0.9, 1, 0.9, 4, 1); };
W.toxicCloud = function(x, z, r){ for(let i=0;i<3;i++) W.particle('smoke', x + (Math.random()-0.5)*r*1.6, 0.4 + Math.random()*0.8, z + (Math.random()-0.5)*r*1.6, (Math.random()-0.5)*0.3, 0.2, (Math.random()-0.5)*0.3, 1.4, 1.0 + Math.random()*0.8, 0.45, 0.8, 0.2, 0.28, -0.1, 0.5); };
W.ringFx = function(x, z, r, color){ const c = C3(color); const n = Math.round(r*10); for(let i=0;i<n;i++){ const a = i/n*Math.PI*2; W.particle('add', x + Math.cos(a)*r, 0.3, z + Math.sin(a)*r, Math.cos(a)*2, 1.2, Math.sin(a)*2, 0.45, 0.35, c[0], c[1], c[2], 0.9, 0, 1.5); } };
W.blink = function(x, y, z){ for(let i=0;i<16;i++) W.particle('add', x + (Math.random()-0.5)*0.6, y + Math.random()*1.6, z + (Math.random()-0.5)*0.6, (Math.random()-0.5)*1.5, (Math.random()-0.5)*1.5, (Math.random()-0.5)*1.5, 0.5, 0.2, 0.8, 0.4, 1, 1, 0, 1); };
W.explosion = function(x, y, z, r, color){
  const c1 = color === true ? [0.6, 1, 0.3] : (color ? C3(color) : [1, 0.7, 0.3]);
  for(let i=0;i<55;i++){ const a = Math.random()*6.28, e = Math.random()*1.4, s = (3 + Math.random()*6)*(r/5);
    W.particle('fire', x, y + 0.3, z, Math.cos(a)*Math.cos(e)*s, Math.sin(e)*s, Math.sin(a)*Math.cos(e)*s, 0.35 + Math.random()*0.35, 0.5 + Math.random()*0.5, Math.min(1, c1[0] + 0.2), Math.min(1, c1[1] + 0.2), c1[2] + 0.2, 1, 3, 2.5); }
  for(let i=0;i<24;i++){ const a = Math.random()*6.28, s = (3 + Math.random()*5)*(r/5);
    W.particle('add', x, y + 0.3, z, Math.cos(a)*s, 2 + Math.random()*5, Math.sin(a)*s, 0.5 + Math.random()*0.5, 0.05, 1, 0.75, 0.35, 1, 9, 0.6); }                 // sparks
  for(let i=0;i<30;i++){ const a = Math.random()*6.28, s = 1 + Math.random()*2.5;
    W.particle('smoke', x + Math.cos(a)*r*0.2, y + 0.5, z + Math.sin(a)*r*0.2, Math.cos(a)*s, 1 + Math.random()*2.5, Math.sin(a)*s, 1.8 + Math.random()*1.2, 1.0 + Math.random()*0.8, 0.2, 0.19, 0.18, 0.75, -0.6, 1.2); }
  W.blastLight.position.set(x, y + 1.6, z); W.blastLight.color.setRGB(c1[0], c1[1], c1[2]); W.blastLight.intensity = 2.6;
  blastFx(x, z, r, c1);
};
W.tracer = function(fx, fy, fz, tx, ty, tz, color){
  const o = tracers.find(t=>t.t <= 0) || tracers[0];
  const dx = tx-fx, dy = ty-fy, dz = tz-fz, len = Math.hypot(dx, dy, dz);
  o.m.position.set((fx+tx)/2, (fy+ty)/2, (fz+tz)/2); o.m.scale.set(0.025, 0.025, len); o.m.lookAt(tx, ty, tz);
  o.m.material.color.set(color || 0xffe7a0); o.m.visible = true; o.m.material.opacity = 0.85; o.t = 0.07;
};
W.arc = function(x0, y0, z0, x1, y1, z1, color){
  const o = arcs.find(a=>a.t <= 0) || arcs[0], p = o.l.geometry.attributes.position.array, n = 24;
  for(let i=0;i<n;i++){ const k = i/(n - 1), j = (i === 0 || i === n - 1) ? 0 : 0.35; p[i*3] = x0 + (x1 - x0)*k + (Math.random()-0.5)*j; p[i*3+1] = y0 + (y1 - y0)*k + (Math.random()-0.5)*j; p[i*3+2] = z0 + (z1 - z0)*k + (Math.random()-0.5)*j; }
  o.l.geometry.attributes.position.needsUpdate = true; o.l.material.color.set(color || 0x9ae8ff); o.l.visible = true; o.t = 0.12;
};
W.muzzleFlash = function(pos, dir, size){
  if(size <= 0) return;
  flash.position.copy(pos); flash.lookAt(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z); flash.rotation.z = Math.random()*6;
  flash.scale.setScalar((0.7 + Math.random()*0.5)*size); flash.visible = true; flash.t = 0.045;
  W.muzzleLight.position.set(pos.x + dir.x*0.9, pos.y + dir.y*0.9, pos.z + dir.z*0.9); W.muzzleLight.intensity = 1.25*size;
  W.smoke(pos.x, pos.y, pos.z);
};
// splats where zombies fall: a ring of reused decals, one shared material
const splats = []; let splatI = 0;
W.splat = function(x, z, size){
  if(!splats.length){ const m = new T.MeshBasicMaterial({ map:tex('goo'), color:0x2c4a12, transparent:true, opacity:0.85, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3 }), g = new T.PlaneGeometry(1, 1);
    for(let i=0;i<W_SPLATS;i++){ const d = new T.Mesh(g, m); d.rotation.x = -Math.PI/2; d.visible = false; d.renderOrder = 1; scene.add(d); splats.push(d); } }
  const d = splats[splatI]; splatI = (splatI + 1) % splats.length;
  const sz = (size || 1.2)*(0.8 + Math.random()*0.5); d.position.set(x + (Math.random() - 0.5)*0.4, 0.016 + splatI*0.0001, z + (Math.random() - 0.5)*0.4); d.rotation.z = Math.random()*6.28; d.scale.set(sz, sz, 1); d.visible = true;
};
const W_SPLATS = 40;
// small physical bits: shell casings, zombie gibs, debris. They fly, spin, bounce and settle, then sink away
const bits = []; let bitI = 0, bitMats = null;
function bitPool(){ if(bits.length) return; const g = new T.BoxGeometry(1, 1, 1);
  bitMats = { brass:lam(0xc8a040, { shine:[0xffe2a0, 90] }), shell:lam(0xa8221c, { shine:[0x6a3030, 40] }), debris:lam(0x2a2622) };
  for(let i=0;i<90;i++){ const m = new T.Mesh(g, bitMats.brass); m.visible = false; m.castShadow = false; m.receiveShadow = false; scene.add(m);
    bits.push({ m, v:new T.Vector3(), spin:new T.Vector3(), life:0, rest:false, h:0.01 }); } }
function bit(mat, x, y, z, sx, sy, sz, vx, vy, vz, life){
  bitPool(); const b = bits[bitI]; bitI = (bitI + 1) % bits.length;
  b.m.material = mat; b.m.scale.set(sx, sy, sz); b.m.position.set(x, y, z); b.m.rotation.set(Math.random()*6, Math.random()*6, Math.random()*6); b.m.visible = true;
  b.v.set(vx, vy, vz); b.spin.set((Math.random() - 0.5)*24, (Math.random() - 0.5)*24, (Math.random() - 0.5)*24); b.life = life; b.rest = false; b.h = Math.min(sx, sy, sz)*0.5; return b;
}
function tickBits(dt){
  for(const b of bits){ if(!b.m.visible) continue; b.life -= dt;
    if(b.life <= 0){ b.m.position.y -= dt*0.4; if(b.life < -1) b.m.visible = false; continue; }
    if(b.rest) continue;
    b.v.y -= 11*dt; const p = b.m.position; p.addScaledVector(b.v, dt); b.m.rotation.x += b.spin.x*dt; b.m.rotation.y += b.spin.y*dt; b.m.rotation.z += b.spin.z*dt;
    if(p.y < b.h){ p.y = b.h; b.v.y = -b.v.y*0.32; b.v.x *= 0.55; b.v.z *= 0.55; b.spin.multiplyScalar(0.5);
      if(Math.abs(b.v.y) < 0.6 && Math.hypot(b.v.x, b.v.z) < 0.4){ b.rest = true; b.m.rotation.x = Math.round(b.m.rotation.x/1.5708)*1.5708; b.m.rotation.z = Math.round(b.m.rotation.z/1.5708)*1.5708; } } }
}
function clearBits(){ for(const b of bits) b.m.visible = false; for(const r of rings) r.m.visible = false; for(const d of scorches) d.visible = false; }
// a spent case kicked out to the right of the gun
W.casing = function(x, y, z, rx, rz, kind){
  if(W.lowFx || !kind) return; bitPool(); const sh = kind === 'shell', s = 0.6 + Math.random()*0.4;
  bit(sh ? bitMats.shell : bitMats.brass, x, y, z, sh ? 0.03 : 0.016, sh ? 0.03 : 0.016, sh ? 0.07 : 0.045, rx*(1.6 + Math.random())*s + (Math.random() - 0.5)*0.6, 2 + Math.random()*1.4, rz*(1.6 + Math.random())*s + (Math.random() - 0.5)*0.6, 3);
};
// a piece of a zombie: mat is the zombie's own skin or cloth
W.gib = function(mat, x, y, z, sx, sy, sz, vx, vz){ bit(mat, x, y, z, sx, sy, sz, vx + (Math.random() - 0.5)*2, 3 + Math.random()*3, vz + (Math.random() - 0.5)*2, 7 + Math.random()*3); };
const rings = [], scorches = [];
function blastFx(x, z, r, c){
  if(!rings.length){ const g = new T.RingGeometry(0.82, 1, 48);
    for(let i=0;i<5;i++){ const m = new T.Mesh(g, new T.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0, blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide }));
      m.rotation.x = -Math.PI/2; m.visible = false; m.renderOrder = 4; scene.add(m); rings.push({ m, t:1, r:1 }); }
    const sg = new T.PlaneGeometry(1, 1), sm = new T.MeshBasicMaterial({ map:tex('stain'), color:0xffffff, transparent:true, opacity:1, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3 });
    for(let i=0;i<14;i++){ const d = new T.Mesh(sg, sm); d.rotation.x = -Math.PI/2; d.visible = false; d.renderOrder = 1; scene.add(d); scorches.push(d); } scorches.i = 0; }
  const ring = rings.find(o=>o.t >= 1) || rings[0]; ring.t = 0; ring.r = r; ring.m.position.set(x, 0.12, z); ring.m.material.color.setRGB(c[0], c[1]*0.85, c[2]*0.7); ring.m.visible = true;
  const d = scorches[scorches.i]; scorches.i = (scorches.i + 1) % scorches.length; d.position.set(x, 0.014, z); d.scale.set(r*1.3, r*1.3, 1); d.rotation.z = Math.random()*6.28; d.visible = true;
  if(!W.lowFx){ bitPool(); for(let i=0;i<7;i++){ const a = Math.random()*6.28, sp = 3 + Math.random()*5, sz = 0.05 + Math.random()*0.09;
    bit(bitMats.debris, x, 0.4, z, sz, sz, sz, Math.cos(a)*sp, 4 + Math.random()*4, Math.sin(a)*sp, 4 + Math.random()*2); } }
}
function tickRings(dt){ for(const o of rings){ if(o.t >= 1) continue; o.t = Math.min(1, o.t + dt/0.4); const e = 1 - Math.pow(1 - o.t, 3), s = 0.4 + e*o.r*1.35;
  o.m.scale.set(s, s, 1); o.m.material.opacity = (1 - o.t)*0.9; if(o.t >= 1) o.m.visible = false; } }
// rain hitting the ground near the camera
function rainSplashes(dt, cx, cz){
  const n = W.lowFx ? 0 : Math.round((quality === 'high' ? 900 : 450)*dt);
  for(let i=0;i<n;i++){ const x = cx + (Math.random() - 0.5)*24, z = cz + (Math.random() - 0.5)*24;
    W.particle('normal', x, 0.03, z, (Math.random() - 0.5)*0.5, 0.7 + Math.random()*0.6, (Math.random() - 0.5)*0.5, 0.16, 0.045, 0.72, 0.78, 0.85, 0.55, 9, 0); }
}
W.clearSplats = function(){ for(const d of splats) d.visible = false; for(const d of holes) d.visible = false; };
const holes = []; let holeI = 0;
W.bulletHole = function(x, y, z, nx, ny, nz){
  if(quality === 'low') return;
  if(!holes.length){ const m = new T.MeshBasicMaterial({ map:tex('hole'), transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4 }), g = new T.PlaneGeometry(1, 1);
    for(let i=0;i<60;i++){ const d = new T.Mesh(g, m); d.visible = false; d.renderOrder = 2; scene.add(d); holes.push(d); } }
  const d = holes[holeI], sz = 0.1 + Math.random()*0.07; holeI = (holeI + 1) % holes.length;
  d.position.set(x + nx*0.012, y + ny*0.012, z + nz*0.012); d.lookAt(x + nx, y + ny, z + nz); d.rotateZ(Math.random()*6.28); d.scale.set(sz, sz, 1); d.visible = true;
};
W.botFlash = function(x, y, z){ W.particle('add', x, y, z, 0, 0, 0, 0.06, 0.4, 1, 0.8, 0.4, 1, 0, 0); };
W.shake = function(a){ shakeT = Math.min(1, shakeT + a); };
W.applyShake = function(){ if(shakeT <= 0) return; const s = shakeT*shakeT*0.06;
  camera.position.x += (Math.random()-0.5)*s; camera.position.y += (Math.random()-0.5)*s; camera.rotation.z += (Math.random()-0.5)*s*0.6; };
W.tick = function(dt){
  tickPsys(P.normal, dt); tickPsys(P.add, dt); tickPsys(P.fire, dt); tickPsys(P.smoke, dt); tickEnv(dt); tickMotes(); tickBolt(dt); if(W.weatherSys) W.weatherSys.tick(dt);
  for(const o of tracers){ if(o.t > 0){ o.t -= dt; o.m.material.opacity = Math.max(0, o.t/0.07)*0.85; if(o.t <= 0) o.m.visible = false; } }
  for(const o of arcs){ if(o.t > 0){ o.t -= dt; o.l.material.opacity = Math.max(0, o.t/0.12); if(o.t <= 0) o.l.visible = false; } }
  if(flash.t > 0){ flash.t -= dt; if(flash.t <= 0) flash.visible = false; }
  W.muzzleLight.intensity = Math.max(0, W.muzzleLight.intensity - dt*60);
  W.blastLight.intensity = Math.max(0, W.blastLight.intensity - dt*7);
  shakeT = Math.max(0, shakeT - dt*1.8);
  for(const a of W.anims){ a.t += dt; a.f(Math.min(1, a.t/a.dur)); } W.anims = W.anims.filter(a=>a.t < a.dur);
  WIND.value += dt; tickBits(dt); tickRings(dt); tickWisps(dt); tickLampLights(dt);
  for(const f of W.fires){ if(Math.random() < dt*20) W.burn(f.x, f.y, f.z); if(Math.random() < dt*6) W.smoke(f.x, f.y + 0.8, f.z);
    if(Math.random() < dt*7) W.particle('add', f.x + (Math.random()-0.5)*0.4, f.y + 0.5, f.z + (Math.random()-0.5)*0.4, (Math.random()-0.5)*0.7, 1.4 + Math.random()*1.6, (Math.random()-0.5)*0.7, 1.4 + Math.random(), 0.035, 1, 0.55, 0.15, 1, -0.5, 0.4); }
};

})(window.ZD);

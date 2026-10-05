// Zombie Squad - the 3D side: scene, the town, characters, mission objects, effects.
(function(ZD){
let T = window.THREE;
const W = ZD.W = {};
const TOWN = ZD.TOWN;

let renderer, scene, camera, quality = 'high', shadows = true;
const geoCache = new Map(), matCache = new Map();
function box(w, h, d){ const k = w+'|'+h+'|'+d; let g = geoCache.get(k); if(!g){ g = new T.BoxGeometry(w, h, d); geoCache.set(k, g); } return g; }
function cyl(rt, rb, h, seg){ const k = 'c'+rt+'|'+rb+'|'+h+'|'+(seg||8); let g = geoCache.get(k); if(!g){ g = new T.CylinderGeometry(rt, rb, h, seg||8); geoCache.set(k, g); } return g; }
function sph(r, ws, hs){ const k = 's'+r+'|'+ws+'|'+hs; let g = geoCache.get(k); if(!g){ g = new T.SphereGeometry(r, ws||10, hs||8); geoCache.set(k, g); } return g; }
function lam(color, opt){ const k = 'l'+color+'|'+JSON.stringify(opt||{}); let m = matCache.get(k);
  if(!m){ m = new T.MeshLambertMaterial(Object.assign({ color }, opt||{})); matCache.set(k, m); } return m; }
function basic(color, opt){ const k = 'b'+color+'|'+JSON.stringify(opt||{}); let m = matCache.get(k);
  if(!m){ m = new T.MeshBasicMaterial(Object.assign({ color }, opt||{})); matCache.set(k, m); } return m; }
function mesh(geo, mat, x, y, z, cast){ const m = new T.Mesh(geo, mat); m.position.set(x||0, y||0, z||0);
  if(shadows){ m.castShadow = cast !== false; m.receiveShadow = true; } return m; }

// ---- canvas textures --------------------------------------------------
function canvasTex(w, h, draw, repeat){
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new T.CanvasTexture(c); if(repeat){ t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4; return t;
}
function noise(g, w, h, n, colors, rmin, rmax){
  for(let i=0;i<n;i++){ g.fillStyle = colors[(Math.random()*colors.length)|0]; g.globalAlpha = 0.25 + Math.random()*0.5;
    const r = rmin + Math.random()*(rmax-rmin); g.beginPath(); g.arc(Math.random()*w, Math.random()*h, r, 0, 7); g.fill(); }
  g.globalAlpha = 1;
}
const TEX = {};
const STYLE = {
  police:   { wall:'#4a5a6e', trim:'#2a3442', win:'#1d2833', lit:'#ffe7a8' },
  brick:    { wall:'#7a3e30', trim:'#4a241c', win:'#1c1a1c', lit:'#ffd38a' },
  brick2:   { wall:'#6a4a3a', trim:'#3e2a20', win:'#1c1a1c', lit:'#ffd38a' },
  teal:     { wall:'#3e6a6a', trim:'#24403f', win:'#16222a', lit:'#bff2ff' },
  clinic:   { wall:'#c9d2cf', trim:'#6a8a88', win:'#22343a', lit:'#d8fbff' },
  beige:    { wall:'#9a8a6e', trim:'#5a4e3c', win:'#1e1c1a', lit:'#ffe2a0' },
  beige2:   { wall:'#8a8270', trim:'#4e483c', win:'#1e1c1a', lit:'#ffe2a0' },
  diner:    { wall:'#8a2a2e', trim:'#e8dcc8', win:'#26201c', lit:'#ffb07a' },
  gasshop:  { wall:'#d8d4c8', trim:'#c8402e', win:'#1c2226', lit:'#fff2c0' },
  warehouse:{ wall:'#5e6266', trim:'#3a3e42', win:'#202326', lit:'#d8e0ff' },
  tower:    { wall:'#5a5e6a', trim:'#34363e', win:'#1a1c22', lit:'#ffe9b0' },
};
function facadeTex(style){
  const s = STYLE[style] || STYLE.beige;
  return canvasTex(128, 128, (g, w, h)=>{ g.fillStyle = s.wall; g.fillRect(0, 0, w, h);
    noise(g, w, h, 300, ['rgba(255,255,255,.06)', 'rgba(0,0,0,.12)'], 0.5, 2.5);
    if(style === 'warehouse'){ g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; for(let x=4;x<w;x+=8){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,h); g.stroke(); } return; }
    for(let i=0;i<2;i++){ const x = 18 + i*64, y = 30;
      g.fillStyle = s.trim; g.fillRect(x-4, y-4, 36, 52);
      g.fillStyle = Math.random() < 0.18 ? s.lit : s.win; g.fillRect(x, y, 28, 44);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x+13, y, 2, 44); g.fillRect(x, y+20, 28, 2); }
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h-6, w, 6);
  });
}
function makeTextures(){
  TEX.asphalt = canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#2a2b2e'; g.fillRect(0,0,w,h);
    noise(g, w, h, 1500, ['#2f3034','#25262a','#333438','#202124'], 0.5, 2);
    g.strokeStyle = 'rgba(10,10,12,.5)'; g.lineWidth = 1.2;
    for(let i=0;i<6;i++){ let x = Math.random()*w, y = Math.random()*h; g.beginPath(); g.moveTo(x,y); for(let k=0;k<5;k++){ x += (Math.random()-0.5)*50; y += (Math.random()-0.5)*50; g.lineTo(x,y); } g.stroke(); }
    noise(g, w, h, 10, ['rgba(8,9,10,.5)'], 8, 22); }, [32, 32]);
  TEX.ground = canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#3a3d34'; g.fillRect(0,0,w,h);
    noise(g, w, h, 900, ['#42463a','#33372e','#4a4c3e','#2e3128'], 1, 4); }, [36, 36]);
  TEX.grass = canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#2b3a24'; g.fillRect(0,0,w,h);
    noise(g, w, h, 900, ['#33452a','#26341f','#3c4c2e','#2a3622'], 1, 4); }, [6, 10]);
  TEX.walk = canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#5a5a58'; g.fillRect(0,0,w,h);
    noise(g, w, h, 400, ['#626260','#525250','#5e5e5c'], 0.5, 1.5);
    g.strokeStyle = 'rgba(20,20,20,.45)'; g.lineWidth = 2; for(let i=0;i<=2;i++){ g.beginPath(); g.moveTo(i*w/2,0); g.lineTo(i*w/2,h); g.stroke(); g.beginPath(); g.moveTo(0,i*h/2); g.lineTo(w,i*h/2); g.stroke(); } }, null);
  TEX.soft = canvasTex(64, 64, (g,w,h)=>{ const r = g.createRadialGradient(32,32,0,32,32,32);
    r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(0.4,'rgba(255,255,255,.55)'); r.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0,0,w,h); }, null);
  TEX.flash = canvasTex(128, 128, (g,w,h)=>{ g.translate(64,64);
    const r = g.createRadialGradient(0,0,0,0,0,64); r.addColorStop(0,'rgba(255,250,220,1)'); r.addColorStop(0.25,'rgba(255,200,90,.9)'); r.addColorStop(1,'rgba(255,120,30,0)');
    g.fillStyle = r; for(let i=0;i<6;i++){ g.rotate(Math.PI/3); g.beginPath(); g.moveTo(0,-7); g.lineTo(64,0); g.lineTo(0,7); g.fill(); }
    g.beginPath(); g.arc(0,0,22,0,7); g.fill(); }, null);
  TEX.ring = canvasTex(128, 128, (g,w,h)=>{ g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 6; g.beginPath(); g.arc(64,64,56,0,7); g.stroke();
    g.lineWidth = 2; g.setLineDash([8,8]); g.beginPath(); g.arc(64,64,44,0,7); g.stroke(); }, null);
  TEX.helipad = canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#2c2e30'; g.fillRect(0,0,w,h);
    g.strokeStyle = '#e8e2c8'; g.lineWidth = 10; g.beginPath(); g.arc(128,128,104,0,7); g.stroke();
    g.fillStyle = '#e8e2c8'; g.fillRect(78,58,22,140); g.fillRect(156,58,22,140); g.fillRect(78,117,100,22); }, null);
}

// ---- init -------------------------------------------------------------
W.viewportSize = function(){
  const m = W.mount; const w = (m && m.clientWidth) || innerWidth || document.documentElement.clientWidth || 0;
  const h = (m && m.clientHeight) || innerHeight || document.documentElement.clientHeight || 0;
  return [Math.max(1, w), Math.max(1, h)];
};
W.init = function(mount, q, mobile){
  T = window.THREE; W.T = T;
  W.mount = mount; quality = q; shadows = q === 'high'; W.mobile = !!mobile;
  renderer = new T.WebGLRenderer({ antialias: !mobile, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q === 'high' ? 2 : (q === 'medium' ? 1.5 : 1)));
  const [w, h] = W.viewportSize(); renderer.setSize(w, h);
  renderer.shadowMap.enabled = shadows; renderer.shadowMap.type = T.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);
  // stormy dusk: readable streets, heavy haze in the distance
  scene = new T.Scene(); scene.background = new T.Color(0x2a3442); scene.fog = new T.Fog(0x2e3846, 22, 78);
  camera = new T.PerspectiveCamera(68, w / h, 0.08, 260); camera.rotation.order = 'YXZ';
  W.renderer = renderer; W.scene = scene; W.camera = camera;
  makeTextures();
  scene.add(new T.HemisphereLight(0xa8b6d0, 0x3a3428, 1.05));
  scene.add(new T.AmbientLight(0x404a5a, 0.3));
  const sun = new T.DirectionalLight(0xffd6a8, 0.85); sun.position.set(-30, 40, -20);
  if(shadows){ sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const s = sun.shadow.camera;
    s.left = -34; s.right = 34; s.top = 34; s.bottom = -34; s.near = 1; s.far = 120; sun.shadow.bias = -0.0007; }
  scene.add(sun); scene.add(sun.target); W.sun = sun;
  W.muzzleLight = new T.PointLight(0xffc27a, 0, 9, 2); scene.add(W.muzzleLight);
  W.blastLight = new T.PointLight(0xff8a3a, 0, 16, 2); scene.add(W.blastLight);
  initFx();
  W.lastSize = [w, h];
};
// the shadow frustum follows the hero so the town can be bigger than one frustum
W.follow = function(x, z){ if(!W.sun) return; W.sun.position.set(x - 30, 40, z - 20); W.sun.target.position.set(x, 0, z); };
W.sizeChanged = function(){ const [w, h] = W.viewportSize(); return w !== W.lastSize[0] || h !== W.lastSize[1]; };
W.resize = function(){ const [w, h] = W.viewportSize(); W.lastSize = [w, h]; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  if(W.pUniforms) W.pUniforms.forEach(u=>u.uScale.value = h * renderer.getPixelRatio() * 0.5); };
W.setQuality = function(q){ quality = q; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q === 'high' ? 2 : (q === 'medium' ? 1.5 : 1))); W.resize(); };
W.render = function(){ renderer.render(scene, camera); };

// ---- the town -------------------------------------------------------------
W.buildTown = function(){
  const H = TOWN.half;
  const ground = new T.Mesh(new T.PlaneGeometry(320, 320), new T.MeshLambertMaterial({ map:TEX.ground, color:0xb0b0a8 }));
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = shadows; scene.add(ground);
  const flat = (x0, x1, z0, z1, mat, y)=>{ const m = new T.Mesh(new T.PlaneGeometry(x1-x0, z1-z0), mat); m.rotation.x = -Math.PI/2; m.position.set((x0+x1)/2, y, (z0+z1)/2); m.receiveShadow = shadows; scene.add(m); return m; };
  // sidewalks under the whole town, roads on top
  const walkTex = TEX.walk.clone(); walkTex.needsUpdate = true; walkTex.wrapS = walkTex.wrapT = T.RepeatWrapping; walkTex.repeat.set(H, H);
  flat(-H, H, -H, H, new T.MeshLambertMaterial({ map:walkTex, color:0xc8c8c0 }), 0.006);
  const asphalt = new T.MeshLambertMaterial({ map:TEX.asphalt, color:0xffffff });
  for(const [x0, x1, z0, z1] of TOWN.roads) flat(x0, x1, z0, z1, asphalt, 0.012);
  const mark = basic(0xd8c870);
  for(let z=-62; z<62; z+=6) if(Math.abs(z) > 9 && Math.abs(Math.abs(z) - 42) > 5){ const m = new T.Mesh(box(0.22, 0.01, 2.6), mark); m.position.set(0, 0.02, z); scene.add(m); }
  for(let x=-62; x<62; x+=6) if(Math.abs(x) > 9 && Math.abs(Math.abs(x) - 42) > 5){ const m = new T.Mesh(box(2.6, 0.01, 0.22), mark); m.position.set(x, 0.02, 0); scene.add(m); }
  // park and plaza
  flat(-H, -47, -37, 37, new T.MeshLambertMaterial({ map:TEX.grass }), 0.016);
  const [px0, px1, pz0, pz1] = TOWN.plaza; const plazaTex = TEX.walk.clone(); plazaTex.needsUpdate = true; plazaTex.wrapS = plazaTex.wrapT = T.RepeatWrapping; plazaTex.repeat.set((px1-px0)/2, (pz1-pz0)/2);
  flat(px0, px1, pz0, pz1, new T.MeshLambertMaterial({ map:plazaTex, color:0xa8a8a0 }), 0.014);
  const pad = new T.Mesh(new T.PlaneGeometry(14, 14), new T.MeshLambertMaterial({ map:TEX.helipad })); pad.rotation.x = -Math.PI/2; pad.position.set(0, 0.03, 56); scene.add(pad);
  for(const b of TOWN.buildings) scene.add(makeBuilding(b));
  for(const p of TOWN.props) scene.add(makeProp(p));
  // the gas station canopy roof
  scene.add(mesh(box(12, 0.5, 10), lam(0xe0dccf), 22, 4.7, -20)); scene.add(mesh(box(12.1, 0.3, 10.1), lam(0xc8402e), 22, 4.4, -20));
  for(const [x, z] of TOWN.trees) scene.add(makeTree(x, z));
  for(const [x, z] of TOWN.lamps) scene.add(makeLamp(x, z));
  for(const [x, z] of TOWN.ammo) scene.add(makeAmmoCrate(x, z));
  // the edge of the playable town: barriers fading into the haze
  const bar = lam(0x8a8a86), stripe = lam(0xc83a2e);
  for(let t=-H; t<=H; t+=4) [[t, -H-1, 0], [t, H+1, 0], [-H-1, t, Math.PI/2], [H+1, t, Math.PI/2]].forEach(([x, z, ry])=>{
    const g = new T.Group(); g.add(mesh(box(3.6, 0.9, 0.6), bar, 0, 0.45, 0)); g.add(mesh(box(3.62, 0.18, 0.62), stripe, 0, 0.7, 0)); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); });
  const glow = new T.Sprite(new T.SpriteMaterial({ map:TEX.soft, color:0xff8a4a, transparent:true, opacity:0.35, fog:false, depthWrite:false, blending:T.AdditiveBlending }));
  glow.scale.set(260, 90, 1); glow.position.set(-150, 20, -170); scene.add(glow);
};
function makeBuilding(b){
  const g = new T.Group(), w = b.x1-b.x0, d = b.z1-b.z0, h = b.h, s = STYLE[b.style] || STYLE.beige;
  g.position.set((b.x0+b.x1)/2, 0, (b.z0+b.z1)/2);
  const tex = facadeTex(b.style); tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(Math.max(1, Math.round(Math.max(w, d)/5)), Math.max(1, Math.round(h/3.2)));
  g.add(mesh(box(w, h, d), new T.MeshLambertMaterial({ map:tex }), 0, h/2, 0));
  g.add(mesh(box(w+0.3, 0.35, d+0.3), lam(new T.Color(s.trim).getHex()), 0, h+0.17, 0));
  if(w > 7 && d > 7){ g.add(mesh(box(1.6, 1, 1.4), lam(0x6a6e72), w*0.2, h+0.85, d*0.15)); g.add(mesh(box(1.2, 0.8, 1.2), lam(0x5a5e62), -w*0.25, h+0.75, -d*0.2)); }
  const sign = { police:'POLICE', clinic:'CLINIC', gasshop:'FUEL · SHOP', diner:'DINER', warehouse:'WAREHOUSE 7' }[b.style];
  if(sign){ const st = canvasTex(512, 96, (gg, cw, ch)=>{ gg.fillStyle = b.style==='clinic' ? '#2a6a6a' : (b.style==='diner' ? '#e8dcc8' : '#1c1e22'); gg.fillRect(0,0,cw,ch);
      gg.fillStyle = b.style==='diner' ? '#8a2a2e' : (b.style==='police' ? '#8ac8ff' : '#f2ead8'); gg.font = '700 64px Oswald, Arial Narrow, sans-serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(sign, cw/2, ch/2+3); });
    const sm = new T.Mesh(new T.PlaneGeometry(Math.min(w*0.8, 8), 1.4), new T.MeshBasicMaterial({ map:st }));
    // hang the sign on the face toward the street the landmark is reached from
    const face = b.style === 'gasshop' || b.style === 'warehouse' ? 'z' : (Math.abs((b.z0+b.z1)/2) > Math.abs((b.x0+b.x1)/2) ? 'z' : 'x');
    const cz = (b.z0+b.z1)/2, cx = (b.x0+b.x1)/2;
    if(face === 'z'){ const toward = b.style === 'warehouse' ? 1 : (cz > 0 ? -1 : 1); sm.position.set(0, h - 1.2, toward*(d/2 + 0.05)); sm.rotation.y = toward > 0 ? 0 : Math.PI; }
    else { const toward = cx > 0 ? -1 : 1; sm.position.set(toward*(w/2 + 0.05), h - 1.2, 0); sm.rotation.y = toward > 0 ? Math.PI/2 : -Math.PI/2; }
    g.add(sm); }
  return g;
}
function makeProp(p){
  const g = new T.Group(); const w = p.x1-p.x0, d = p.z1-p.z0, h = p.h, cx = (p.x0+p.x1)/2, cz = (p.z0+p.z1)/2;
  g.position.set(cx, 0, cz);
  const along = w > d;
  if(p.kind === 'car' || p.kind === 'ambulance'){
    const L = Math.max(w, d), Wd = Math.min(w, d), body = lam(p.kind === 'ambulance' ? 0xe8e8e2 : p.color), dark = lam(0x161616), glass = lam(0x1a242c);
    const c = new T.Group(); if(!along) c.rotation.y = Math.PI/2;
    c.add(mesh(box(L, 0.7, Wd), body, 0, 0.6, 0)); c.add(mesh(box(L*0.5, 0.6, Wd*0.92), body, -L*0.08, 1.2, 0)); c.add(mesh(box(L*0.48, 0.48, Wd*0.94), glass, -L*0.08, 1.22, 0));
    if(p.kind === 'ambulance'){ c.add(mesh(box(L*0.62, 1.1, Wd*0.98), body, L*0.12, 1.35, 0)); c.add(mesh(box(L*0.63, 0.2, Wd*1.0), lam(0xc8302a), L*0.12, 1.2, 0)); }
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>{ const wh = mesh(cyl(0.36,0.36,0.26,10), dark, a*L*0.33, 0.3, b*Wd*0.46); wh.rotation.x = Math.PI/2; c.add(wh); });
    c.rotation.z = (Math.random()-0.5)*0.03; g.add(c); }
  else if(p.kind === 'bus'){ const c = new T.Group(); if(!along) c.rotation.y = Math.PI/2; const L = Math.max(w,d), Wd = Math.min(w,d);
    c.add(mesh(box(L, 2.4, Wd), lam(p.color), 0, 1.5, 0)); c.add(mesh(box(L*0.96, 0.7, Wd*1.01), lam(0x1a242c), 0, 2.1, 0)); c.add(mesh(box(L, 0.3, Wd*1.01), lam(0x2a2a2a), 0, 0.45, 0));
    [-0.36, 0.3].forEach(t=>[-1,1].forEach(s=>{ const wh = mesh(cyl(0.5,0.5,0.3,10), lam(0x161616), t*L, 0.5, s*Wd*0.5); wh.rotation.x = Math.PI/2; c.add(wh); }));
    g.add(c); }
  else if(p.kind === 'barrier'){ g.add(mesh(box(w, h, d), lam(0xb8b6ae), 0, h/2, 0)); g.add(mesh(box(w+0.02, 0.16, d+0.02), lam(0xc83a2e), 0, h*0.7, 0)); }
  else if(p.kind === 'container'){ g.add(mesh(box(w, h, d), lam(p.color), 0, h/2, 0)); const rib = lam(new T.Color(p.color).multiplyScalar(0.75).getHex());
    const n = 12; for(let i=0;i<n;i++){ const t = -0.5 + (i+0.5)/n; g.add(mesh(box(along?0.06:w+0.04, h-0.1, along?d+0.04:0.06), rib, along ? t*w : 0, h/2, along ? 0 : t*d)); } }
  else if(p.kind === 'pillar'){ g.add(mesh(box(w, h, d), lam(0xd8d4c8), 0, h/2, 0)); }
  else if(p.kind === 'pump'){ g.add(mesh(box(w, h, d), lam(0xc8402e), 0, h/2, 0)); g.add(mesh(box(w*0.8, 0.3, d+0.02), basic(0x1c2226), 0, h*0.7, 0, false)); }
  else if(p.kind === 'dumpster'){ g.add(mesh(box(w, h, d), lam(0x2e5a3a), 0, h/2, 0)); g.add(mesh(box(w+0.06, 0.1, d+0.06), lam(0x203a28), 0, h, 0)); }
  return g;
}
function makeTree(x, z){
  const g = new T.Group(), h = 3.5 + Math.random()*2;
  g.add(mesh(cyl(0.16, 0.26, h, 6), lam(0x3a2c22), 0, h/2, 0));
  const leaf = lam(Math.random() < 0.5 ? 0x34452a : 0x2c3c24);
  for(let i=0;i<3;i++){ g.add(mesh(new T.ConeGeometry(1.5 - i*0.35, 2.2, 7), leaf, 0, h*0.55 + i*1.1, 0)); }
  g.position.set(x, 0, z); g.rotation.y = Math.random()*6; return g;
}
function makeLamp(x, z){
  const g = new T.Group(); g.add(mesh(cyl(0.07, 0.09, 4.6, 6), lam(0x26282b), 0, 2.3, 0));
  const alongZ = Math.abs(x) < 10;            // posts on the main street lean over it along x
  const dx = alongZ ? (x > 0 ? -1 : 1) : 0, dz = alongZ ? 0 : (z > 0 ? -1 : 1);
  g.add(mesh(box(dx ? 1 : 0.08, 0.08, dz ? 1 : 0.08), lam(0x26282b), dx*0.45, 4.55, dz*0.45));
  g.add(mesh(box(0.34, 0.12, 0.22), basic(0xffd59a), dx*0.9, 4.45, dz*0.9, false));
  const glow = new T.Sprite(new T.SpriteMaterial({ map:TEX.soft, color:0xffb35a, transparent:true, opacity:0.35, depthWrite:false, blending:T.AdditiveBlending }));
  glow.scale.set(1.3, 1.3, 1); glow.position.set(dx*0.9, 4.4, dz*0.9); g.add(glow);
  g.position.set(x, 0, z); return g;
}
function makeAmmoCrate(x, z){
  const g = new T.Group(); g.add(mesh(box(1.1, 0.55, 0.7), lam(0x3b4a2c), 0, 0.28, 0)); g.add(mesh(box(1.12, 0.1, 0.72), basic(0x7fe0ff), 0, 0.5, 0, false));
  const glow = new T.Sprite(new T.SpriteMaterial({ map:TEX.soft, color:0x7fe0ff, transparent:true, opacity:0.5, depthWrite:false, blending:T.AdditiveBlending })); glow.scale.set(1.8, 1.8, 1); glow.position.y = 0.6; g.add(glow);
  g.position.set(x, 0, z); return g;
}

// ---- characters -----------------------------------------------------------
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
  rig.torso.add(mesh(box(0.44 * (c.wide||1), 0.56, 0.24 * (c.deep||1)), c.shirt, 0, 0.3, 0));
  rig.head = new T.Group(); rig.head.position.y = 0.62; rig.torso.add(rig.head);
  rig.headMesh = mesh(box(0.27, 0.29, 0.27), c.skin, 0, 0.15, 0); rig.head.add(rig.headMesh);
  rig.armL = limb(0.3, 0.12, c.sleeve || c.shirt); rig.armL.position.set(-0.29 * (c.wide||1), 0.55, 0); rig.torso.add(rig.armL);
  rig.armR = limb(0.3, 0.12, c.sleeve || c.shirt); rig.armR.position.set( 0.29 * (c.wide||1), 0.55, 0); rig.torso.add(rig.armR);
  rig.foreL = limb(0.28, 0.11, c.skinArm || c.skin); rig.foreL.position.y = -0.3; rig.armL.add(rig.foreL);
  rig.foreR = limb(0.28, 0.11, c.skinArm || c.skin); rig.foreR.position.y = -0.3; rig.armR.add(rig.foreR);
  rig.root.scale.setScalar(s);
  return rig;
}
function soldier(accent){
  const c = { pants:lam(0x3b4130), boots:lam(0x1c1b19), shirt:lam(0x5a6346), sleeve:lam(0x4e573d), skin:lam(0xc29470), skinArm:lam(0x4e573d) };
  const rig = humanoid(c);
  rig.torso.add(mesh(box(0.5, 0.36, 0.3), lam(0x464d36), 0, 0.33, 0));
  rig.torso.add(mesh(box(0.36, 0.42, 0.16), lam(0x3c4230), 0, 0.33, 0.2));
  const helm = lam(accent != null ? accent : 0x3a4030);
  rig.head.add(mesh(box(0.33, 0.14, 0.33), helm, 0, 0.31, 0)); rig.head.add(mesh(box(0.31, 0.16, 0.06), helm, 0, 0.2, 0.14));
  rig.head.add(mesh(box(0.35, 0.04, 0.36), helm, 0, 0.24, -0.01));
  if(accent != null){ rig.armL.add(mesh(box(0.13, 0.07, 0.13), basic(accent), 0, -0.08, 0, false)); rig.armR.add(mesh(box(0.13, 0.07, 0.13), basic(accent), 0, -0.08, 0, false)); }
  rig.foreL.add(mesh(box(0.1, 0.09, 0.1), lam(0xc29470), 0, -0.3, 0)); rig.foreR.add(mesh(box(0.1, 0.09, 0.1), lam(0xc29470), 0, -0.3, 0));
  rig.gun = new T.Group(); rig.gun.position.set(0.17, 0.36, -0.28); rig.torso.add(rig.gun);
  rig.muzzle = new T.Object3D(); rig.gun.add(rig.muzzle);
  return rig;
}
W.makePlayer = function(){ const rig = soldier(null); scene.add(rig.root); W.player = rig; return rig; };
W.makeBot = function(m){
  const rig = soldier(m.color); W.setGunModel(rig, ZD.WEAPONS[m.weapon].model);
  rig.tag = nameTag(m.name, m.css); rig.tag.position.y = 2.35; rig.root.add(rig.tag);
  scene.add(rig.root); return rig;
};
W.makeSurvivor = function(){
  const c = { pants:lam(0x3a3f5a), boots:lam(0x2a2220), shirt:lam(0xc8a24a), skin:lam(0xd8a888), skinArm:lam(0xd8a888) };
  const rig = humanoid(c); rig.head.add(mesh(box(0.3, 0.12, 0.3), lam(0x4a2a1a), 0, 0.3, 0.02)); rig.head.add(mesh(box(0.3, 0.26, 0.08), lam(0x4a2a1a), 0, 0.14, 0.14));
  rig.foreL.add(mesh(box(0.1, 0.09, 0.1), lam(0xd8a888), 0, -0.3, 0)); rig.foreR.add(mesh(box(0.1, 0.09, 0.1), lam(0xd8a888), 0, -0.3, 0));
  rig.tag = nameTag('SURVIVOR', '#ffd23a'); rig.tag.position.y = 2.3; rig.root.add(rig.tag);
  scene.add(rig.root); return rig;
};
function nameTag(text, css){
  const t = canvasTex(256, 64, (g, w, h)=>{ g.font = '700 38px Oswald, Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(text, w/2, h/2); g.fillStyle = css; g.fillText(text, w/2, h/2); });
  const s = new T.Sprite(new T.SpriteMaterial({ map:t, transparent:true, depthTest:false, depthWrite:false }));
  s.scale.set(1.1, 0.28, 1); s.renderOrder = 10; return s;
}
W.setGunModel = function(rig, model){
  [...rig.gun.children].forEach(ch=>{ if(ch !== rig.muzzle) rig.gun.remove(ch); });
  const metal = lam(0x26282b), metal2 = lam(0x35383c), wood = lam(0x6b4a2e);
  let tip = -0.2;
  if(model === 'pistol'){ rig.gun.add(mesh(box(0.05, 0.06, 0.2), metal2, 0, 0.03, -0.06)); rig.gun.add(mesh(box(0.045, 0.12, 0.06), metal, 0, -0.04, 0.02)); tip = -0.17; }
  else if(model === 'rifle'){ rig.gun.add(mesh(box(0.06, 0.09, 0.5), metal, 0, 0, -0.12)); rig.gun.add(mesh(box(0.03, 0.03, 0.26), metal2, 0, 0.01, -0.5));
    rig.gun.add(mesh(box(0.045, 0.16, 0.08), metal2, 0, -0.1, -0.1)); rig.gun.add(mesh(box(0.05, 0.09, 0.22), metal, 0, -0.02, 0.22));
    rig.gun.add(mesh(box(0.035, 0.04, 0.12), metal2, 0, 0.07, -0.08)); tip = -0.64; }
  else if(model === 'smg'){ rig.gun.add(mesh(box(0.06, 0.09, 0.34), metal, 0, 0, -0.06)); rig.gun.add(mesh(box(0.035, 0.035, 0.12), metal2, 0, 0.01, -0.28));
    rig.gun.add(mesh(box(0.04, 0.2, 0.06), metal2, 0, -0.12, -0.04)); rig.gun.add(mesh(box(0.04, 0.07, 0.14), metal, 0, -0.01, 0.16)); tip = -0.35; }
  else if(model === 'shotgun'){ rig.gun.add(mesh(box(0.05, 0.05, 0.62), metal, 0, 0.02, -0.26)); rig.gun.add(mesh(box(0.06, 0.05, 0.22), wood, 0, -0.04, -0.3));
    rig.gun.add(mesh(box(0.055, 0.1, 0.24), wood, 0, -0.03, 0.18)); rig.gun.add(mesh(box(0.05, 0.08, 0.14), metal2, 0, -0.01, -0.02)); tip = -0.58; }
  rig.muzzle.position.set(0, 0.02, tip);
};
const ZMAT = {};
function zmat(color){ return ZMAT[color] || (ZMAT[color] = lam(color)); }
W.makeZombie = function(type, shirt, pants){
  const d = ZD.ZOMBIES[type];
  const skin = { brute:0x6a7d58, runner:0x8da371, bloater:0x8a9a5a }[type] || 0x7e9668;
  const c = { pants:zmat(pants), boots:zmat(0x1e1c1a), shirt:zmat(shirt), skin:zmat(skin), skinArm:zmat(skin), scale:d.scale,
    wide: type === 'brute' ? 1.35 : (type === 'bloater' ? 1.5 : 1), deep: type === 'brute' ? 1.5 : (type === 'bloater' ? 1.9 : 1) };
  const rig = humanoid(c);
  const eye = basic(type === 'runner' ? 0xff4a2a : (type === 'bloater' ? 0x9cff3c : 0xffd23a), { fog:false });
  rig.head.add(mesh(box(0.06, 0.035, 0.02), eye, -0.065, 0.18, -0.14, false)); rig.head.add(mesh(box(0.06, 0.035, 0.02), eye, 0.065, 0.18, -0.14, false));
  rig.head.add(mesh(box(0.16, 0.04, 0.02), zmat(0x2a1a14), 0, 0.06, -0.14, false));
  rig.foreL.add(mesh(box(0.1, 0.09, 0.1), zmat(skin), 0, -0.3, 0)); rig.foreR.add(mesh(box(0.1, 0.09, 0.1), zmat(skin), 0, -0.3, 0));
  if(type === 'brute') rig.torso.add(mesh(box(0.5, 0.3, 0.36), zmat(shirt), 0, 0.18, -0.06));
  if(type === 'bloater'){ const pus = basic(0x9cff3c);
    rig.torso.add(mesh(sph(0.36, 12, 10), zmat(0x7a8a4a), 0, 0.22, -0.1));
    for(let i=0;i<5;i++) rig.torso.add(mesh(sph(0.06 + Math.random()*0.05, 8, 6), pus, (Math.random()-0.5)*0.5, 0.1 + Math.random()*0.4, -0.38 - Math.random()*0.04, false)); }
  rig.phase = Math.random()*10; rig.sway = Math.random()*10; rig.tilt = (Math.random()-0.5)*0.5;
  scene.add(rig.root); return rig;
};
W.remove = function(o){ if(o && o.parent) o.parent.remove(o); };

// ---- mission objects ---------------------------------------------------------
function beacon(color, h){ const g = new T.Group();
  const beam = new T.Mesh(cyl(0.18, 0.32, h, 10), new T.MeshBasicMaterial({ color, transparent:true, opacity:0.22, blending:T.AdditiveBlending, depthWrite:false }));
  beam.position.y = h/2; g.add(beam);
  const glow = new T.Sprite(new T.SpriteMaterial({ map:TEX.soft, color, transparent:true, opacity:0.7, blending:T.AdditiveBlending, depthWrite:false })); glow.scale.set(1.4, 1.4, 1); glow.position.y = 0.35; g.add(glow);
  g.userData.beacon = true; return g; }
W.makeItem = function(kind){
  const g = new T.Group();
  if(kind === 'fuel'){ g.add(mesh(box(0.34, 0.46, 0.18), lam(0xc8302a), 0, 0.23, 0)); g.add(mesh(box(0.1, 0.1, 0.06), lam(0x222222), 0.1, 0.5, 0)); g.add(mesh(box(0.2, 0.05, 0.05), lam(0x222222), -0.05, 0.48, 0)); }
  else if(kind === 'medkit'){ g.add(mesh(box(0.52, 0.3, 0.34), lam(0xf0f0ea), 0, 0.15, 0)); g.add(mesh(box(0.08, 0.2, 0.36), basic(0xd8282a), 0, 0.17, 0, false)); g.add(mesh(box(0.22, 0.06, 0.36), basic(0xd8282a), 0, 0.17, 0, false)); }
  g.add(beacon(kind === 'fuel' ? 0xff8a3a : 0xffffff, 2.4));
  scene.add(g); return g;
};
W.makeSwitch = function(){
  const g = new T.Group(); g.add(mesh(box(0.9, 1.4, 0.6), lam(0x4a5058), 0, 0.7, 0)); g.add(mesh(box(0.7, 0.4, 0.05), basic(0x1a1e22), 0, 1.0, -0.31, false));
  const light = mesh(sph(0.1, 10, 8), basic(0xff3a2a), 0, 1.55, 0, false); g.add(light); g.userData.light = light;
  const ring = new T.Mesh(new T.PlaneGeometry(5.2, 5.2), new T.MeshBasicMaterial({ map:TEX.ring, color:0xffd23a, transparent:true, opacity:0.6, depthWrite:false }));
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.04; g.add(ring); g.userData.ring = ring;
  g.add(beacon(0xffd23a, 4)); scene.add(g); return g;
};
W.switchOn = function(g){ g.userData.light.material = basic(0x5be36b); g.userData.ring.material.color.set(0x5be36b); g.children.forEach(c=>{ if(c.userData.beacon) c.visible = false; }); };
W.makeNest = function(){
  const g = new T.Group(), flesh = lam(0x6a2a3a), dark = lam(0x3a1420), glowm = basic(0xff4a8a);
  const core = mesh(sph(1.1, 14, 10), flesh, 0, 0.8, 0); core.scale.set(1, 0.8, 1); g.add(core); g.userData.core = core;
  for(let i=0;i<7;i++){ const a = i/7*Math.PI*2, t = mesh(cyl(0.12, 0.3, 2.2, 6), dark, Math.cos(a)*1.1, 0.4, Math.sin(a)*1.1); t.rotation.z = Math.cos(a)*1.1; t.rotation.x = -Math.sin(a)*1.1; g.add(t); }
  for(let i=0;i<9;i++) g.add(mesh(sph(0.1 + Math.random()*0.08, 8, 6), glowm, (Math.random()-0.5)*1.6, 0.6 + Math.random()*0.8, (Math.random()-0.5)*1.6, false));
  g.add(beacon(0xff4a8a, 5)); scene.add(g); return g;
};
W.makeEvac = function(){
  const g = new T.Group();
  const ring = new T.Mesh(new T.PlaneGeometry(16, 16), new T.MeshBasicMaterial({ map:TEX.ring, color:0x5be36b, transparent:true, opacity:0.55, depthWrite:false }));
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.05; g.add(ring); g.userData.ring = ring;
  g.add(beacon(0x5be36b, 9)); scene.add(g); return g;
};
W.makeHeli = function(){
  const g = new T.Group(), body = lam(0x3d4a36), dark = lam(0x1e2420);
  g.add(mesh(box(2.2, 2.0, 5.2), body, 0, 1.4, 0)); g.add(mesh(box(1.9, 1.1, 1.6), lam(0x2a3a44), 0, 1.7, -2.4));
  g.add(mesh(box(0.5, 0.5, 4.6), body, 0, 1.8, 4.6)); g.add(mesh(box(0.12, 1.4, 0.8), body, 0, 2.5, 6.8));
  g.add(mesh(box(0.15, 0.15, 3.2), dark, -1.1, 0.15, 0)); g.add(mesh(box(0.15, 0.15, 3.2), dark, 1.1, 0.15, 0));
  const rotor = new T.Group(); rotor.position.y = 2.65; rotor.add(mesh(box(11, 0.06, 0.4), dark, 0, 0, 0)); rotor.add(mesh(box(0.4, 0.06, 11), dark, 0, 0, 0)); g.add(rotor); g.userData.rotor = rotor;
  scene.add(g); return g;
};
W.makeGrenade = function(){ const m = mesh(sph(0.11, 10, 8), lam(0x3a4a2a), 0, 0, 0); scene.add(m); return m; };

// ---- animation ------------------------------------------------------------
function lerpA(a, b, k){ return a + (b - a)*Math.min(1, k); }
W.animSoldier = function(rig, st, dt){
  if(st.down){ rig.body.rotation.x = lerpA(rig.body.rotation.x, -1.3, dt*6); rig.body.position.y = lerpA(rig.body.position.y, 0.28, dt*6);
    rig.armL.rotation.set(1.0, 0, 0.4); rig.armR.rotation.set(1.6, 0, -0.2); rig.legL.rotation.x = 0.3; rig.legR.rotation.x = -0.1; return; }
  rig.body.rotation.x = lerpA(rig.body.rotation.x, 0, dt*8); rig.body.position.y = lerpA(rig.body.position.y, 0, dt*8);
  rig.phase = (rig.phase || 0) + dt * (st.moving ? (st.sprint ? 11 : 8) : 0) * (st.back ? -1 : 1);
  const a = st.moving ? (st.sprint ? 0.85 : 0.6) : 0, ph = rig.phase;
  rig.legL.rotation.x =  Math.sin(ph)*a; rig.legR.rotation.x = -Math.sin(ph)*a;
  rig.shinL.rotation.x = Math.max(0, -Math.sin(ph))*a*1.1; rig.shinR.rotation.x = Math.max(0, Math.sin(ph))*a*1.1;
  rig.hips.position.y = 0.9 + Math.abs(Math.sin(ph))*0.04*(a>0?1:0);
  const lower = st.sprint ? 0.55 : (st.swap > 0 ? 0.9*Math.sin(Math.min(1, st.swap)*Math.PI) : 0) + (st.reload > 0 ? 0.35 : 0);
  rig.torso.rotation.x = st.pitch*0.65 - (st.sprint ? 0.15 : 0); rig.head.rotation.x = st.pitch*0.3;
  const melee = st.melee > 0 ? Math.sin((1 - st.melee/0.35)*Math.PI) : 0;
  rig.armR.rotation.set(1.42 - lower + melee*0.6, 0, -0.08 - melee*0.6);
  rig.armL.rotation.set(1.25 - lower, 0, 0.55);
  rig.foreR.rotation.x = 0.25; rig.foreL.rotation.x = 0.45;
  rig.gun.rotation.x = -lower*0.8 + (st.recoil||0)*2.2; rig.gun.position.z = -0.28 + (st.recoil||0)*0.4;
  rig.torso.rotation.y = st.ads ? 0.12 : 0.05;
};
W.animSurvivor = function(rig, moving, dt){
  rig.phase = (rig.phase || 0) + dt*(moving ? 8 : 0); const a = moving ? 0.6 : 0, ph = rig.phase;
  rig.legL.rotation.x = Math.sin(ph)*a; rig.legR.rotation.x = -Math.sin(ph)*a; rig.shinL.rotation.x = Math.max(0, -Math.sin(ph))*a; rig.shinR.rotation.x = Math.max(0, Math.sin(ph))*a;
  rig.armL.rotation.x = -Math.sin(ph)*a*0.6; rig.armR.rotation.x = Math.sin(ph)*a*0.6;
};
W.animZombie = function(rig, z, dt){
  const d = ZD.ZOMBIES[z.type];
  if(z.state === 'dead'){ const k = Math.min(1, z.deadT/0.55), e = k<1 ? 1-Math.pow(1-k,3) : 1;
    rig.body.rotation.x = z.fallDir * e * 1.45; rig.body.position.y = 0;
    rig.legL.rotation.x = e*0.3; rig.legR.rotation.x = -e*0.2; rig.armL.rotation.x = 0.4 + e*1.6; rig.armR.rotation.x = 0.2 + e*1.9;
    if(z.deadT > 2.2) rig.root.position.y = -(z.deadT-2.2)*0.6;
    return; }
  const moving = z.moveSpeed > 0.05;
  rig.phase += dt * (moving ? z.moveSpeed * (z.type === 'runner' ? 2.4 : 3.4) : 0.8);
  const ph = rig.phase, a = moving ? (z.type === 'runner' ? 0.85 : 0.5) : 0.08;
  rig.legL.rotation.x =  Math.sin(ph)*a; rig.legR.rotation.x = -Math.sin(ph)*a;
  rig.shinL.rotation.x = Math.max(0, -Math.sin(ph))*a*1.2; rig.shinR.rotation.x = Math.max(0, Math.sin(ph))*a*1.2;
  rig.hips.position.y = 0.9 + Math.abs(Math.sin(ph))*0.05;
  rig.sway += dt*1.3;
  const flinch = z.flinch > 0 ? z.flinch/0.25 : 0;
  rig.torso.rotation.x = -d.lean + Math.sin(rig.sway)*0.05 + flinch*0.55;
  rig.torso.rotation.z = Math.sin(ph*0.5)*0.08 + rig.tilt*0.1;
  rig.head.rotation.x = d.lean*0.9 + Math.sin(rig.sway*1.7)*0.08 + flinch*0.4; rig.head.rotation.z = rig.tilt + Math.sin(rig.sway)*0.1;
  let armX = d.arms + Math.sin(ph*0.5 + 1)*0.12, armX2 = d.arms + Math.sin(ph*0.5)*0.12;
  if(z.state === 'attack'){ const k = z.atkPose || 0; armX = 1.9 - k*1.6; armX2 = 1.9 - Math.max(0, k-0.15)*1.6; }
  rig.armL.rotation.set(armX2, 0, 0.12); rig.armR.rotation.set(armX, 0, -0.12);
  rig.foreL.rotation.x = 0.25; rig.foreR.rotation.x = 0.2;
  rig.body.rotation.x = z.state === 'rise' ? 0.4*(1 - Math.min(1, z.riseT/1.2)) : 0;
  if(z.type === 'bloater'){ const s = 1 + Math.sin(rig.sway*3)*0.03 + (z.fuse > 0 ? (1 - z.fuse/0.8)*0.3 : 0); rig.torso.scale.set(s, s, s); }
};

// ---- effects --------------------------------------------------------------
const P = {};
const tracers = []; let flash, shakeT = 0;
function makePsys(max, additive){
  const geo = new T.BufferGeometry();
  const pos = new Float32Array(max*3), col = new Float32Array(max*4), size = new Float32Array(max);
  geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('rgba', new T.BufferAttribute(col, 4)); geo.setAttribute('size', new T.BufferAttribute(size, 1));
  const uniforms = { map:{ value:TEX.soft }, uScale:{ value:400 } };
  const mat = new T.ShaderMaterial({ uniforms, transparent:true, depthWrite:false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
    vertexShader:'attribute float size; attribute vec4 rgba; uniform float uScale; varying vec4 vC; void main(){ vC = rgba; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*uScale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; }',
    fragmentShader:'uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = vC.a*t.a; if(a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a); }' });
  const pts = new T.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  return { max, n:0, pos, col, size, geo, pts, uniforms, vel:new Float32Array(max*3), life:new Float32Array(max), age:new Float32Array(max), base:new Float32Array(max*5), grav:new Float32Array(max), drag:new Float32Array(max) };
}
function initFx(){
  P.normal = makePsys(1200, false); P.add = makePsys(500, true);
  W.pUniforms = [P.normal.uniforms, P.add.uniforms];
  const [, h] = W.viewportSize(); W.pUniforms.forEach(u=>u.uScale.value = h * renderer.getPixelRatio() * 0.5);
  const tm = new T.MeshBasicMaterial({ color:0xffe7a0, transparent:true, opacity:0.9, blending:T.AdditiveBlending, depthWrite:false });
  for(let i=0;i<40;i++){ const m = new T.Mesh(new T.BoxGeometry(1, 1, 1), tm.clone()); m.visible = false; scene.add(m); tracers.push({ m, t:0 }); }
  const fm = new T.MeshBasicMaterial({ map:TEX.flash, transparent:true, blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide });
  flash = new T.Group(); const p1 = new T.Mesh(new T.PlaneGeometry(0.5, 0.5), fm), p2 = p1.clone(); p2.rotation.y = Math.PI/2; const p3 = p1.clone(); p3.rotation.x = Math.PI/2;
  flash.add(p1, p2, p3); flash.visible = false; flash.t = 0; scene.add(flash);
}
W.particle = function(sys, x, y, z, vx, vy, vz, life, size, r, g, b, a, grav, drag){
  const s = P[sys]; if(W.lowFx && Math.random() < 0.5) return;
  const i = s.n < s.max ? s.n++ : (Math.random()*s.max)|0;
  s.pos[i*3] = x; s.pos[i*3+1] = y; s.pos[i*3+2] = z; s.vel[i*3] = vx; s.vel[i*3+1] = vy; s.vel[i*3+2] = vz;
  s.life[i] = life; s.age[i] = 0; s.base[i*5] = r; s.base[i*5+1] = g; s.base[i*5+2] = b; s.base[i*5+3] = a; s.base[i*5+4] = size;
  s.grav[i] = grav||0; s.drag[i] = drag||0;
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
    s.life[w] = s.life[i]; s.age[w] = s.age[i]; s.grav[w] = s.grav[i]; s.drag[w] = s.drag[i];
    for(let j=0;j<5;j++) s.base[w*5+j] = s.base[i*5+j];
    s.col[w*4] = s.base[w*5]; s.col[w*4+1] = s.base[w*5+1]; s.col[w*4+2] = s.base[w*5+2]; s.col[w*4+3] = s.base[w*5+3]*(1 - k*k);
    s.size[w] = s.base[w*5+4]*(0.6 + k*0.8);
    w++;
  }
  s.n = w; s.geo.setDrawRange(0, w);
  s.geo.attributes.position.needsUpdate = true; s.geo.attributes.rgba.needsUpdate = true; s.geo.attributes.size.needsUpdate = true;
}
W.goo = function(x, y, z, dx, dy, dz, n, big){
  for(let i=0;i<n;i++){ const sp = 1.5 + Math.random()*3.5*(big?1.5:1);
    W.particle('normal', x, y, z, dx*sp + (Math.random()-0.5)*2.4, dy*sp + Math.random()*2.2, dz*sp + (Math.random()-0.5)*2.4,
      0.45 + Math.random()*0.5, 0.07 + Math.random()*0.09*(big?1.6:1), 0.36 + Math.random()*0.15, 0.62 + Math.random()*0.2, 0.12, 0.95, 9, 1.2); }
  if(big) for(let i=0;i<6;i++) W.particle('normal', x, y, z, (Math.random()-0.5)*1.4, Math.random()*1.4, (Math.random()-0.5)*1.4, 0.7, 0.26, 0.28, 0.42, 0.1, 0.6, 2, 2);
};
W.pinkGoo = function(x, y, z, n){ for(let i=0;i<n;i++) W.particle('normal', x, y, z, (Math.random()-0.5)*4, Math.random()*4, (Math.random()-0.5)*4, 0.6, 0.12 + Math.random()*0.1, 0.9, 0.3, 0.55, 0.9, 9, 1); };
W.dust = function(x, y, z, n){ for(let i=0;i<n;i++) W.particle('normal', x, y, z, (Math.random()-0.5)*1.6, Math.random()*1.4, (Math.random()-0.5)*1.6, 0.5 + Math.random()*0.5, 0.18 + Math.random()*0.16, 0.55, 0.52, 0.48, 0.45, 1.2, 1.5); };
W.sparks = function(x, y, z, n){ for(let i=0;i<n;i++) W.particle('add', x, y, z, (Math.random()-0.5)*5, Math.random()*4, (Math.random()-0.5)*5, 0.18 + Math.random()*0.15, 0.05, 1, 0.75, 0.35, 1, 12, 0.5); };
W.smoke = function(x, y, z){ W.particle('normal', x, y, z, (Math.random()-0.5)*0.3, 0.5 + Math.random()*0.3, (Math.random()-0.5)*0.3, 0.6, 0.16, 0.6, 0.6, 0.62, 0.22, -0.4, 1.2); };
W.rise = function(x, z){ for(let i=0;i<14;i++) W.particle('normal', x + (Math.random()-0.5)*0.8, 0.1, z + (Math.random()-0.5)*0.8, (Math.random()-0.5)*1.2, 1 + Math.random()*1.5, (Math.random()-0.5)*1.2, 0.8, 0.22, 0.24, 0.2, 0.15, 0.7, 4, 1); };
W.burst = function(x, y, z, color, n){ const c = new T.Color(color); for(let i=0;i<n;i++){ const a = Math.random()*6.28, s = 2 + Math.random()*3;
  W.particle('add', x, y, z, Math.cos(a)*s, Math.random()*3, Math.sin(a)*s, 0.6, 0.12, c.r, c.g, c.b, 1, 2, 1.5); } };
W.explosion = function(x, y, z, r, green){
  const c1 = green ? [0.6, 1, 0.3] : [1, 0.7, 0.3];
  for(let i=0;i<70;i++){ const a = Math.random()*6.28, e = Math.random()*1.4, s = (3 + Math.random()*6)*(r/5);
    W.particle('add', x, y + 0.3, z, Math.cos(a)*Math.cos(e)*s, Math.sin(e)*s, Math.sin(a)*Math.cos(e)*s, 0.35 + Math.random()*0.3, 0.35 + Math.random()*0.4, c1[0], c1[1], c1[2], 1, 3, 2.5); }
  for(let i=0;i<26;i++){ const a = Math.random()*6.28, s = 1 + Math.random()*2.5;
    W.particle('normal', x, y + 0.5, z, Math.cos(a)*s, 1 + Math.random()*2.5, Math.sin(a)*s, 1.2 + Math.random()*0.8, 0.7 + Math.random()*0.6, green ? 0.3 : 0.22, green ? 0.36 : 0.2, 0.18, 0.55, -0.6, 1.2); }
  W.blastLight.position.set(x, y + 1.2, z); W.blastLight.color.set(green ? 0x8aff4a : 0xff8a3a); W.blastLight.intensity = 5;
};
W.tracer = function(fx, fy, fz, tx, ty, tz, color){
  const o = tracers.find(t=>t.t <= 0) || tracers[0];
  const dx = tx-fx, dy = ty-fy, dz = tz-fz, len = Math.hypot(dx, dy, dz);
  o.m.position.set((fx+tx)/2, (fy+ty)/2, (fz+tz)/2); o.m.scale.set(0.025, 0.025, len); o.m.lookAt(tx, ty, tz);
  o.m.material.color.set(color || 0xffe7a0); o.m.visible = true; o.m.material.opacity = 0.85; o.t = 0.07;
};
W.muzzleFlash = function(pos, dir, size){
  flash.position.copy(pos); flash.lookAt(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z); flash.rotation.z = Math.random()*6;
  flash.scale.setScalar((0.7 + Math.random()*0.5)*size); flash.visible = true; flash.t = 0.045;
  W.muzzleLight.position.copy(pos); W.muzzleLight.intensity = 2.4*size;
  W.smoke(pos.x, pos.y, pos.z);
};
W.botFlash = function(x, y, z){ W.particle('add', x, y, z, 0, 0, 0, 0.06, 0.4, 1, 0.8, 0.4, 1, 0, 0); };
W.shake = function(a){ shakeT = Math.min(1, shakeT + a); };
W.applyShake = function(){ if(shakeT <= 0) return; const s = shakeT*shakeT*0.06;
  camera.position.x += (Math.random()-0.5)*s; camera.position.y += (Math.random()-0.5)*s; camera.rotation.z += (Math.random()-0.5)*s*0.6; };
W.tick = function(dt){
  tickPsys(P.normal, dt); tickPsys(P.add, dt);
  for(const o of tracers){ if(o.t > 0){ o.t -= dt; o.m.material.opacity = Math.max(0, o.t/0.07)*0.85; if(o.t <= 0) o.m.visible = false; } }
  if(flash.t > 0){ flash.t -= dt; if(flash.t <= 0) flash.visible = false; }
  W.muzzleLight.intensity = Math.max(0, W.muzzleLight.intensity - dt*60);
  W.blastLight.intensity = Math.max(0, W.blastLight.intensity - dt*12);
  shakeT = Math.max(0, shakeT - dt*1.8);
};

})(window.ZD);

// Zombie Defense - the 3D side: scene, map, characters, effects.
(function(ZD){
let T = window.THREE;
const W = ZD.W = {};
const M = ZD.MAP;

let renderer, scene, camera, quality = 'high', shadows = true;
const geoCache = new Map(), matCache = new Map();
function box(w, h, d){ const k = w+'|'+h+'|'+d; let g = geoCache.get(k); if(!g){ g = new T.BoxGeometry(w, h, d); geoCache.set(k, g); } return g; }
function cyl(rt, rb, h, seg){ const k = 'c'+rt+'|'+rb+'|'+h+'|'+(seg||8); let g = geoCache.get(k); if(!g){ g = new T.CylinderGeometry(rt, rb, h, seg||8); geoCache.set(k, g); } return g; }
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
let TEX = {};
function makeTextures(){
  TEX.grass = canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#1d2a1a'; g.fillRect(0,0,w,h);
    noise(g, w, h, 900, ['#24331f','#18231a','#2c3a22','#202a1c','#33402a'], 1, 5);
    noise(g, w, h, 60, ['#2a2620','#3a3328'], 4, 12); }, [40, 40]);
  TEX.concrete = canvasTex(256, 256, (g,w,h)=>{ g.fillStyle = '#4a4c4e'; g.fillRect(0,0,w,h);
    noise(g, w, h, 1400, ['#505254','#444648','#3c3e40','#56585a'], 0.6, 2.2);
    g.strokeStyle = 'rgba(20,20,22,.55)'; g.lineWidth = 2;
    for(let i=0;i<=4;i++){ g.beginPath(); g.moveTo(i*w/4,0); g.lineTo(i*w/4,h); g.stroke(); g.beginPath(); g.moveTo(0,i*h/4); g.lineTo(w,i*h/4); g.stroke(); }
    g.strokeStyle = 'rgba(15,15,16,.6)'; g.lineWidth = 1;
    for(let i=0;i<7;i++){ let x = Math.random()*w, y = Math.random()*h; g.beginPath(); g.moveTo(x,y);
      for(let k=0;k<6;k++){ x += (Math.random()-0.5)*40; y += (Math.random()-0.5)*40; g.lineTo(x,y); } g.stroke(); }
    noise(g, w, h, 12, ['rgba(10,12,14,.5)'], 10, 26); }, [7, 7.5]);
  TEX.wall = canvasTex(128, 128, (g,w,h)=>{ g.fillStyle = '#9a978e'; g.fillRect(0,0,w,h);
    noise(g, w, h, 500, ['#a3a097','#8e8b83','#96938a','#86837b'], 0.5, 2);
    g.fillStyle = 'rgba(30,32,28,.35)'; g.fillRect(0, h*0.82, w, h*0.18); }, null);
  TEX.wood = canvasTex(128, 32, (g,w,h)=>{ g.fillStyle = '#6e4e30'; g.fillRect(0,0,w,h);
    for(let i=0;i<14;i++){ g.strokeStyle = 'rgba(40,24,12,'+(0.2+Math.random()*0.3)+')'; g.lineWidth = 1+Math.random()*1.5;
      g.beginPath(); const y = Math.random()*h; g.moveTo(0,y); g.bezierCurveTo(w*0.3,y+4,w*0.6,y-4,w,y+2); g.stroke(); }
    g.fillStyle = '#2a2a2a'; [8, w-8].forEach(x=>{ g.beginPath(); g.arc(x, h/2, 2.2, 0, 7); g.fill(); }); }, null);
  TEX.asphalt = canvasTex(256, 64, (g,w,h)=>{ g.fillStyle = '#1b1c1e'; g.fillRect(0,0,w,h);
    noise(g, w, h, 600, ['#222326','#18191b','#26272a'], 0.5, 1.8);
    g.fillStyle = 'rgba(200,190,120,.55)'; for(let x=10;x<w;x+=64) g.fillRect(x, h/2-2, 34, 4); }, [10, 1]);
  TEX.soft = canvasTex(64, 64, (g,w,h)=>{ const r = g.createRadialGradient(32,32,0,32,32,32);
    r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(0.4,'rgba(255,255,255,.55)'); r.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0,0,w,h); }, null);
  TEX.flash = canvasTex(128, 128, (g,w,h)=>{ g.translate(64,64);
    const r = g.createRadialGradient(0,0,0,0,0,64); r.addColorStop(0,'rgba(255,250,220,1)'); r.addColorStop(0.25,'rgba(255,200,90,.9)'); r.addColorStop(1,'rgba(255,120,30,0)');
    g.fillStyle = r; for(let i=0;i<6;i++){ g.rotate(Math.PI/3); g.beginPath(); g.moveTo(0,-7); g.lineTo(64,0); g.lineTo(0,7); g.fill(); }
    g.beginPath(); g.arc(0,0,22,0,7); g.fill(); }, null);
}

// ---- init -------------------------------------------------------------
W.viewportSize = function(){
  const m = W.mount; let w = (m && m.clientWidth) || innerWidth || document.documentElement.clientWidth || 0;
  let h = (m && m.clientHeight) || innerHeight || document.documentElement.clientHeight || 0;
  return [Math.max(1, w), Math.max(1, h)];
};
W.init = function(mount, q, mobile){
  T = window.THREE;
  W.mount = mount; quality = q; shadows = q === 'high'; W.mobile = !!mobile;
  renderer = new T.WebGLRenderer({ antialias: !mobile, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q === 'high' ? 2 : (q === 'medium' ? 1.5 : 1)));
  const [w, h] = W.viewportSize(); renderer.setSize(w, h);
  renderer.shadowMap.enabled = shadows; renderer.shadowMap.type = T.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);
  scene = new T.Scene(); scene.background = new T.Color(0x101a2a); scene.fog = new T.Fog(0x16223a, 16, 62);
  camera = new T.PerspectiveCamera(70, w / h, 0.08, 220); camera.rotation.order = 'YXZ';
  W.renderer = renderer; W.scene = scene; W.camera = camera;
  makeTextures();
  // night lighting: cold moon, dim sky, warm lamps inside the walls
  scene.add(new T.HemisphereLight(0x8496c4, 0x2a2a22, 1.0));
  scene.add(new T.AmbientLight(0x3a4458, 0.35));
  const moon = new T.DirectionalLight(0xb4c6ff, 0.95); moon.position.set(-18, 30, -14);
  if(shadows){ moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048); const s = moon.shadow.camera;
    s.left = -26; s.right = 26; s.top = 26; s.bottom = -26; s.near = 1; s.far = 80; moon.shadow.bias = -0.0006; }
  moon.target.position.set(0, 0, 3); scene.add(moon); scene.add(moon.target);
  W.lampLights = [];
  [[-1, -4.5], [0, 11]].forEach(([x, z], i)=>{ const l = new T.PointLight(0xffb15e, 1.0, 20, 1.4); l.position.set(x, 3.6, z); scene.add(l); W.lampLights.push({ l, base:1.0, flick: i===1 }); });
  W.muzzleLight = new T.PointLight(0xffc27a, 0, 9, 2); scene.add(W.muzzleLight);
  initFx();
  W.lastSize = [w, h];
};
W.sizeChanged = function(){ const [w, h] = W.viewportSize(); return w !== W.lastSize[0] || h !== W.lastSize[1]; };
W.resize = function(){ const [w, h] = W.viewportSize(); W.lastSize = [w, h]; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  if(W.pUniforms) W.pUniforms.forEach(u=>u.uScale.value = h * renderer.getPixelRatio() * 0.5); };
W.setQuality = function(q){ quality = q;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q === 'high' ? 2 : (q === 'medium' ? 1.5 : 1))); W.resize(); };
W.render = function(){ renderer.render(scene, camera); };

// ---- map --------------------------------------------------------------
W.boards = {};      // window id -> { group, list:[mesh], win }
W.buildMap = function(){
  // ground and the yard floor
  const ground = new T.Mesh(new T.PlaneGeometry(240, 240), new T.MeshLambertMaterial({ map:TEX.grass, color:0x8a9a80 }));
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = shadows; scene.add(ground);
  const floor = new T.Mesh(new T.PlaneGeometry(M.X1 - M.X0, M.Z1 - M.Z0), new T.MeshLambertMaterial({ map:TEX.concrete, color:0xb0b0aa }));
  floor.rotation.x = -Math.PI/2; floor.position.set((M.X0+M.X1)/2, 0.012, (M.Z0+M.Z1)/2); floor.receiveShadow = shadows; scene.add(floor);
  const road = new T.Mesh(new T.PlaneGeometry(240, 7), new T.MeshLambertMaterial({ map:TEX.asphalt, color:0xffffff }));
  road.rotation.x = -Math.PI/2; road.position.set(0, 0.008, -27); road.receiveShadow = shadows; scene.add(road);
  // walls, sills and lintels
  const wallMat = new T.MeshLambertMaterial({ map:TEX.wall, color:0xa8a49a });
  const capMat = lam(0x3d3e3c), sillMat = new T.MeshLambertMaterial({ map:TEX.wall, color:0x8c897f });
  for(const b of M.walls){
    const w = b.x1-b.x0, h = b.y1-b.y0, d = b.z1-b.z0;
    const m = mesh(box(w, h, d), b.kind === 'wall' ? wallMat : sillMat, (b.x0+b.x1)/2, (b.y0+b.y1)/2, (b.z0+b.z1)/2);
    scene.add(m);
    if(b.kind === 'wall'){ scene.add(mesh(box(w+0.06, 0.14, d+0.06), capMat, (b.x0+b.x1)/2, b.y1+0.07, (b.z0+b.z1)/2));
      // pillars every few metres break up the long faces
      const len = Math.max(w, d), th = Math.min(w, d), along = w > d ? 'x' : 'z', n = Math.floor(len / 4.2);
      for(let i=1;i<=n;i++){ const t = i/(n+1); const px = along==='x' ? b.x0 + w*t : (b.x0+b.x1)/2, pz = along==='z' ? b.z0 + d*t : (b.z0+b.z1)/2;
        scene.add(mesh(box(along==='x'?0.42:th+0.16, H(b)+0.05, along==='z'?0.42:th+0.16), sillMat, px, H(b)/2, pz)); } }
  }
  function H(b){ return b.y1 - b.y0; }
  // windows: dark frames and six boards each
  for(const win of M.windows){
    const g = new T.Group(); g.position.set(win.cx, 0, win.cz); if(win.dir === 'v') g.rotation.y = Math.PI/2;
    // outward is +z in the group's frame after the flip below
    const out = win.dir === 'h' ? win.nz : win.nx;    // rotation.y = 90deg maps local +z to world +x
    const frameMat = lam(0x2b2622);
    g.add(mesh(box(0.12, M.TOP - M.SILL, M.T + 0.1), frameMat, -M.GAP/2 + 0.06, (M.TOP+M.SILL)/2, 0));
    g.add(mesh(box(0.12, M.TOP - M.SILL, M.T + 0.1), frameMat,  M.GAP/2 - 0.06, (M.TOP+M.SILL)/2, 0));
    const woodMat = new T.MeshLambertMaterial({ map:TEX.wood, color:0xcaa77a });
    const list = [];
    for(let i=0;i<6;i++){ const b = mesh(box(M.GAP + 0.32, 0.17, 0.07), woodMat, 0, M.SILL + 0.16 + i*0.25, out * (M.T/2 + 0.06));
      b.rotation.z = (i % 2 ? 1 : -1) * (0.08 + Math.random()*0.12); b.userData.home = { p:b.position.clone(), r:b.rotation.z }; g.add(b); list.push(b); }
    scene.add(g); W.boards[win.id] = { group:g, list, win, out, fly:[] };
  }
  // the gate between the yards
  const gate = new T.Group(); const gm = lam(0x3f4448), gd = lam(0x2a2d30);
  const gw = M.gate.x1 - M.gate.x0;
  gate.add(mesh(box(gw, 0.12, 0.1), gm, 0, 0.25, 0)); gate.add(mesh(box(gw, 0.12, 0.1), gm, 0, M.H - 0.35, 0)); gate.add(mesh(box(gw, 0.1, 0.1), gm, 0, M.H/2, 0));
  for(let i=0;i<=10;i++) gate.add(mesh(box(0.06, M.H - 0.4, 0.06), gd, -gw/2 + i*gw/10, M.H/2 - 0.05, 0));
  gate.position.set((M.gate.x0+M.gate.x1)/2, 0, (M.gate.z0+M.gate.z1)/2); scene.add(gate); W.gate = gate; W.gateOpen = 0;
  W.gateSign = signPlane('OPEN GATE', ZD.GATE_COST, 2.4, 0.6, '#ffd37a'); W.gateSign.position.set(0, M.H + 0.55, M.ZM - M.T/2 - 0.05); W.gateSign.rotation.y = Math.PI; scene.add(W.gateSign);
  const gateSign2 = W.gateSign.clone(); gateSign2.position.z = M.ZM + M.T/2 + 0.05; gateSign2.rotation.y = 0; scene.add(gateSign2); W.gateSign2 = gateSign2;
  // props
  for(const p of M.props) scene.add(makeProp(p));
  // wall buys
  W.buyMeshes = {};
  for(const b of M.buys){ const s = buyPlane(b.weapon); s.position.set(b.x, 1.55, b.z); s.rotation.y = b.face[1] < 0 ? Math.PI : 0; scene.add(s); W.buyMeshes[b.id] = s; }
  // lamps
  for(const l of M.lamps){ const g = new T.Group();
    g.add(mesh(cyl(0.07, 0.09, 4.2, 6), lam(0x26282b), 0, 2.1, 0)); g.add(mesh(box(0.9, 0.08, 0.08), lam(0x26282b), 0.4, 4.15, 0));
    const bulb = mesh(box(0.34, 0.12, 0.22), basic(0xffd59a), 0.8, 4.06, 0, false); g.add(bulb);
    const glow = new T.Sprite(new T.SpriteMaterial({ map:TEX.soft, color:0xffb35a, transparent:true, opacity:0.35, depthWrite:false, blending:T.AdditiveBlending }));
    glow.scale.set(1.1, 1.1, 1); glow.position.set(0.8, 3.98, 0); g.add(glow);
    g.position.set(l.x, 0, l.z); scene.add(g); }
  buildOutside();
};

function signPlane(label, cost, w, h, color){
  const t = canvasTex(512, 128, (g,cw,ch)=>{ g.fillStyle = 'rgba(12,12,14,.85)'; g.fillRect(0,0,cw,ch);
    g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(6,6,cw-12,ch-12);
    g.fillStyle = color; g.font = '700 54px Oswald, Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label + '  ·  ' + cost, cw/2, ch/2 + 2); });
  return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map:t, transparent:true }));
}
function buyPlane(weapon){
  const d = ZD.WEAPONS[weapon];
  const t = canvasTex(512, 256, (g,cw,ch)=>{ g.clearRect(0,0,cw,ch);
    g.strokeStyle = 'rgba(235,240,230,.92)'; g.lineWidth = 7; g.lineJoin = 'round'; g.lineCap = 'round';
    g.shadowColor = 'rgba(200,255,200,.6)'; g.shadowBlur = 10;
    // chalk silhouette of the gun
    g.beginPath();
    if(weapon === 'shotgun'){ g.moveTo(40,120); g.lineTo(380,112); g.lineTo(470,108); g.lineTo(470,124); g.lineTo(380,128); g.lineTo(150,140);
      g.lineTo(120,200); g.lineTo(70,206); g.lineTo(96,140); g.closePath(); g.moveTo(240,136); g.lineTo(330,134); g.lineTo(330,152); g.lineTo(240,154); }
    else { g.moveTo(30,110); g.lineTo(120,100); g.lineTo(360,100); g.lineTo(470,104); g.lineTo(470,118); g.lineTo(360,124); g.lineTo(300,126);
      g.lineTo(280,190); g.lineTo(250,186); g.lineTo(262,128); g.lineTo(190,130); g.lineTo(176,170); g.lineTo(150,168); g.lineTo(158,130); g.lineTo(110,134); g.lineTo(40,160); g.closePath();
      g.moveTo(200,92); g.lineTo(260,92); }
    g.stroke(); g.shadowBlur = 0;
    g.fillStyle = 'rgba(235,240,230,.95)'; g.font = '700 40px Oswald, Arial Narrow, sans-serif'; g.textAlign = 'center';
    g.fillText(d.name.toUpperCase() + '  ·  ' + d.cost, cw/2, 236); });
  const m = new T.Mesh(new T.PlaneGeometry(2.4, 1.2), new T.MeshBasicMaterial({ map:t, transparent:true, depthWrite:false }));
  return m;
}
function makeProp(p){
  const g = new T.Group(); const w = p.x1-p.x0, d = p.z1-p.z0, h = p.y1, cx = (p.x0+p.x1)/2, cz = (p.z0+p.z1)/2;
  g.position.set(cx, 0, cz);
  if(p.kind === 'container'){ const c = lam(p.color);
    g.add(mesh(box(w, h, d), c, 0, h/2, 0));
    const rib = lam(0x5e2c20); for(let i=0;i<14;i++) g.add(mesh(box(0.06, h-0.1, d+0.04), rib, -w/2 + 0.2 + i*(w-0.4)/13, h/2, 0));
    g.add(mesh(box(w+0.04, 0.1, d+0.04), lam(0x4a241a), 0, h-0.05, 0)); }
  else if(p.kind === 'sandbags'){ const s = lam(0x8a7a58), s2 = lam(0x7a6b4c);
    const along = w > d, n = Math.max(2, Math.round((along ? w : d) / 0.55));
    for(let r=0;r<3;r++) for(let i=0;i<n - (r%2);i++){ const t = (i + (r%2)*0.5 + 0.5)/n - 0.5;
      const b = mesh(box(along?0.56:d*0.9, 0.3, along?d*0.9:0.56), (i+r)%2 ? s : s2, along ? t*w : 0, 0.16 + r*0.3, along ? 0 : t*d); b.rotation.y = (Math.random()-0.5)*0.12; g.add(b); } }
  else if(p.kind === 'jeep'){ const body = lam(0x4b5236), dark = lam(0x1d1e1f), glass = lam(0x2e3a44);
    g.add(mesh(box(w*0.86, 0.7, d*0.94), body, 0, 0.75, 0)); g.add(mesh(box(w*0.86, 0.5, d*0.36), body, 0, 1.3, -d*0.12));
    g.add(mesh(box(w*0.8, 0.42, 0.06), glass, 0, 1.32, -d*0.31));
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz])=>{ const wh = mesh(cyl(0.36,0.36,0.3,12), dark, sx*w*0.43, 0.36, sz*d*0.3); wh.rotation.z = Math.PI/2; g.add(wh); });
    g.add(mesh(cyl(0.34,0.34,0.24,12), dark, 0, 1.0, d*0.5)); }
  else if(p.kind === 'crate'){ const c = new T.MeshLambertMaterial({ map:TEX.wood, color:0xb8935e }), e = lam(0x4a3420);
    g.add(mesh(box(w, h, d), c, 0, h/2, 0));
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz])=>g.add(mesh(box(0.08, h+0.02, 0.08), e, sx*(w/2-0.03), h/2, sz*(d/2-0.03)))); }
  else if(p.kind === 'barrel'){ const col = Math.random() < 0.5 ? 0x8a2e24 : 0x2f4f6e;
    g.add(mesh(cyl(0.38, 0.38, h, 12), lam(col), 0, h/2, 0)); g.add(mesh(cyl(0.39, 0.39, 0.06, 12), lam(0x222222), 0, h*0.33, 0)); g.add(mesh(cyl(0.39, 0.39, 0.06, 12), lam(0x222222), 0, h*0.7, 0)); }
  else if(p.kind === 'generator'){ g.add(mesh(box(w, h*0.7, d), lam(0x5a5f3a), 0, h*0.35, 0)); g.add(mesh(box(w*0.7, h*0.3, d*0.6), lam(0x3a3d2a), 0, h*0.85, 0));
    g.add(mesh(box(0.1, 0.1, 0.02), basic(0x7dff6a), w*0.3, h*0.55, -d/2-0.01, false)); }
  else if(p.kind === 'truck'){ const body = lam(0x44502f), dark = lam(0x1d1e1f), canvas = lam(0x5d6243);
    g.add(mesh(box(w*0.62, h*0.8, d), canvas, -w*0.18, h*0.55, 0)); g.add(mesh(box(w*0.3, h*0.65, d*0.92), body, w*0.33, h*0.45, 0));
    g.add(mesh(box(w, 0.25, d*0.95), dark, 0, 0.45, 0));
    [-0.38, 0.05, 0.36].forEach(t=>[-1,1].forEach(s=>{ const wh = mesh(cyl(0.42,0.42,0.3,12), dark, t*w, 0.42, s*d*0.46); wh.rotation.x = Math.PI/2; g.add(wh); })); }
  return g;
}
function buildOutside(){
  // dead trees, wrecks, a road fence and a small graveyard, kept clear of the
  // lanes zombies walk from their spawns to the windows
  const lanes = M.windows.map(w=>({ x:w.cx, z:w.cz, nx:w.nx, nz:w.nz }));
  const clear = (x, z)=>{ if(x > M.X0-3 && x < M.X1+3 && z > M.Z0-3 && z < M.Z1+3) return false;
    for(const l of lanes){ const dx = x-l.x, dz = z-l.z, along = dx*l.nx + dz*l.nz, side = Math.abs(dx*l.nz - dz*l.nx);
      if(along > -1 && along < 18 && side < 5.5) return false; } return true; };
  const bark = lam(0x2a2420), bark2 = lam(0x332b24);
  let placed = 0, tries = 0;
  while(placed < 70 && tries++ < 900){ const a = Math.random()*Math.PI*2, r = 20 + Math.random()*55, x = Math.cos(a)*r, z = Math.sin(a)*r + 3;
    if(!clear(x, z) || Math.abs(z + 27) < 4.5) continue;
    const t = new T.Group(), h = 3 + Math.random()*3.5; t.add(mesh(cyl(0.12, 0.26, h, 6), Math.random()<0.5?bark:bark2, 0, h/2, 0));
    for(let i=0;i<4;i++){ const b = mesh(box(0.1, 1.2 + Math.random(), 0.1), bark, 0, h*(0.55 + Math.random()*0.4), 0);
      b.rotation.z = (Math.random()<0.5?1:-1)*(0.5 + Math.random()*0.6); b.rotation.y = Math.random()*6; t.add(b); }
    t.position.set(x, 0, z); t.rotation.y = Math.random()*6; scene.add(t); placed++; }
  // wrecked cars
  const wrecks = [[-24, -30, 0.3], [21, -24, 2.6], [-30, 14, 1.2], [28, 26, 0.7]];
  for(const [x, z, ry] of wrecks){ if(!clear(x, z)) continue; const g = new T.Group(), c = lam(0x3a3430), d = lam(0x161616);
    g.add(mesh(box(4.2, 0.8, 1.9), c, 0, 0.62, 0)); g.add(mesh(box(2.2, 0.62, 1.7), c, -0.3, 1.32, 0));
    g.add(mesh(box(2.0, 0.5, 1.72), lam(0x10151a), -0.3, 1.34, 0));
    [[-1.4,-1],[1.4,-1],[-1.4,1],[1.4,1]].forEach(([a,b])=>{ const wh = mesh(cyl(0.38,0.38,0.28,10), d, a, 0.3, b*0.86); wh.rotation.x = Math.PI/2; g.add(wh); });
    g.position.set(x, 0, z); g.rotation.y = ry; g.rotation.z = (Math.random()-0.5)*0.08; scene.add(g); }
  // fence along the road
  const post = lam(0x2b2622);
  for(let x=-60;x<=60;x+=3){ if(!clear(x, -31.5)) continue; scene.add(mesh(box(0.12, 1.3, 0.12), post, x, 0.65, -31.5)); if(x < 60 && clear(x+1.5, -31.5)) scene.add(mesh(box(3, 0.08, 0.05), post, x+1.5, 1.05, -31.5)); }
  // graveyard to the north
  const stone = lam(0x55575a);
  for(let i=0;i<22;i++){ const x = -18 + (i%11)*3.4 + (Math.random()-0.5), z = 32 + Math.floor(i/11)*3.5 + (Math.random()-0.5);
    if(!clear(x, z)) continue; const s = mesh(box(0.7, 0.9 + Math.random()*0.4, 0.16), stone, x, 0.5, z); s.rotation.z = (Math.random()-0.5)*0.2; s.rotation.y = (Math.random()-0.5)*0.3; scene.add(s); }
  // stars and a moon (unfogged so they read through the haze)
  const sg = new T.BufferGeometry(), sp = [];
  for(let i=0;i<700;i++){ const a = Math.random()*Math.PI*2, e = 0.12 + Math.random()*1.3, r = 160;
    sp.push(Math.cos(a)*Math.cos(e)*r, Math.sin(e)*r, Math.sin(a)*Math.cos(e)*r); }
  sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
  scene.add(new T.Points(sg, new T.PointsMaterial({ color:0xcfd8ff, size:0.7, fog:false, transparent:true, opacity:0.75 })));
  const moon = new T.Mesh(new T.SphereGeometry(5, 20, 14), new T.MeshBasicMaterial({ color:0xe8eeff, fog:false }));
  moon.position.set(-70, 80, -110); scene.add(moon);
  const halo = new T.Sprite(new T.SpriteMaterial({ map:TEX.soft, color:0x9fb6ff, transparent:true, opacity:0.45, fog:false, depthWrite:false, blending:T.AdditiveBlending }));
  halo.scale.set(40, 40, 1); halo.position.copy(moon.position); scene.add(halo);
}

// ---- boards ---------------------------------------------------------------
W.tearBoard = function(winId, idx){
  const B = W.boards[winId]; const b = B.list[idx]; if(!b || !b.visible) return;
  // the board flies off outward with a spin, then vanishes
  const wp = new T.Vector3(); b.getWorldPosition(wp);
  const o = { m:b, t:0, vx:B.win.nx*(2.2+Math.random()) + (Math.random()-0.5)*1.5, vy:2.2 + Math.random()*1.4, vz:B.win.nz*(2.2+Math.random()) + (Math.random()-0.5)*1.5,
    rx:(Math.random()-0.5)*8, rz:(Math.random()-0.5)*10 };
  B.fly.push(o); W.dust(wp.x, wp.y, wp.z, 6);
};
W.addBoard = function(winId, idx){
  const B = W.boards[winId]; const b = B.list[idx]; if(!b) return;
  B.fly = B.fly.filter(o=>o.m !== b);
  b.position.copy(b.userData.home.p); b.rotation.set(0, 0, b.userData.home.r); b.visible = true; b.scale.set(1.25, 1.25, 1.25); b.userData.pop = 0.18;
  const wp = new T.Vector3(); b.getWorldPosition(wp); W.dust(wp.x, wp.y, wp.z, 4);
};
W.setBoards = function(winId, n){ const B = W.boards[winId]; B.fly = [];
  B.list.forEach((b, i)=>{ b.visible = i < n; b.position.copy(b.userData.home.p); b.rotation.set(0,0,b.userData.home.r); b.scale.set(1,1,1); }); };
function tickBoards(dt){
  for(const id in W.boards){ const B = W.boards[id];
    for(const o of B.fly){ o.t += dt; const b = o.m;
      // the board lives in the window's group; move it in world terms through the group's rotation
      const g = B.group, ry = g.rotation.y, c = Math.cos(ry), s = Math.sin(ry);
      const lx = o.vx*c - o.vz*s, lz = o.vx*s + o.vz*c;
      b.position.x += lx*dt; b.position.y += o.vy*dt; b.position.z += lz*dt; o.vy -= 9.8*dt;
      b.rotation.x += o.rx*dt; b.rotation.z += o.rz*dt;
      if(b.position.y < 0.05){ b.position.y = 0.05; o.vy = 0; o.vx *= 0.6; o.vz *= 0.6; }
      if(o.t > 1.4) b.visible = false; }
    B.fly = B.fly.filter(o=>o.t <= 1.4);
    for(const b of B.list){ if(b.userData.pop > 0){ b.userData.pop -= dt; const k = 1 + Math.max(0, b.userData.pop)*1.4; b.scale.set(k, k, k); } }
  }
}
W.openGate = function(){ W.gateOpening = true; };

// ---- characters -----------------------------------------------------------
function limb(len, w, mat){ const g = new T.Group(); const m = mesh(box(w, len, w), mat, 0, -len/2, 0); g.add(m); g.userData.len = len; return g; }
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
  rig.head.add(mesh(box(0.27, 0.29, 0.27), c.skin, 0, 0.15, 0));
  rig.armL = limb(0.3, 0.12, c.sleeve || c.shirt); rig.armL.position.set(-0.29 * (c.wide||1), 0.55, 0); rig.torso.add(rig.armL);
  rig.armR = limb(0.3, 0.12, c.sleeve || c.shirt); rig.armR.position.set( 0.29 * (c.wide||1), 0.55, 0); rig.torso.add(rig.armR);
  rig.foreL = limb(0.28, 0.11, c.skinArm || c.skin); rig.foreL.position.y = -0.3; rig.armL.add(rig.foreL);
  rig.foreR = limb(0.28, 0.11, c.skinArm || c.skin); rig.foreR.position.y = -0.3; rig.armR.add(rig.foreR);
  rig.root.scale.setScalar(s);
  return rig;
}
W.makePlayer = function(){
  const c = { pants:lam(0x3b4130), boots:lam(0x1c1b19), shirt:lam(0x5a6346), sleeve:lam(0x4e573d), skin:lam(0xc29470), skinArm:lam(0x4e573d) };
  const rig = humanoid(c);
  rig.torso.add(mesh(box(0.5, 0.36, 0.3), lam(0x464d36), 0, 0.33, 0));          // vest
  rig.torso.add(mesh(box(0.36, 0.42, 0.16), lam(0x3c4230), 0, 0.33, 0.2));      // backpack
  rig.head.add(mesh(box(0.33, 0.14, 0.33), lam(0x3a4030), 0, 0.31, 0));         // helmet
  rig.head.add(mesh(box(0.31, 0.16, 0.06), lam(0x3a4030), 0, 0.2, 0.14));        // helmet back, so the hero reads from behind
  rig.head.add(mesh(box(0.2, 0.05, 0.02), lam(0x1a1a1a), 0, 0.2, -0.145, false)); // goggles strap
  rig.head.add(mesh(box(0.35, 0.04, 0.36), lam(0x3a4030), 0, 0.24, -0.01));
  rig.foreL.add(mesh(box(0.1, 0.09, 0.1), lam(0xc29470), 0, -0.3, 0)); rig.foreR.add(mesh(box(0.1, 0.09, 0.1), lam(0xc29470), 0, -0.3, 0));
  rig.gun = new T.Group(); rig.gun.position.set(0.17, 0.36, -0.28); rig.torso.add(rig.gun);
  rig.muzzle = new T.Object3D(); rig.gun.add(rig.muzzle);
  scene.add(rig.root); W.player = rig; return rig;
};
W.setGunModel = function(rig, model){
  [...rig.gun.children].forEach(ch=>{ if(ch !== rig.muzzle) rig.gun.remove(ch); });
  const metal = lam(0x26282b), metal2 = lam(0x35383c), wood = lam(0x6b4a2e);
  let tip = -0.2;
  if(model === 'pistol'){ rig.gun.add(mesh(box(0.05, 0.06, 0.2), metal2, 0, 0.03, -0.06)); rig.gun.add(mesh(box(0.045, 0.12, 0.06), metal, 0, -0.04, 0.02)); tip = -0.17; }
  else if(model === 'rifle'){ rig.gun.add(mesh(box(0.06, 0.09, 0.5), metal, 0, 0, -0.12)); rig.gun.add(mesh(box(0.03, 0.03, 0.26), metal2, 0, 0.01, -0.5));
    rig.gun.add(mesh(box(0.045, 0.16, 0.08), metal2, 0, -0.1, -0.1)); rig.gun.add(mesh(box(0.05, 0.09, 0.22), metal, 0, -0.02, 0.22));
    rig.gun.add(mesh(box(0.035, 0.04, 0.12), metal2, 0, 0.07, -0.08)); tip = -0.64; }
  else if(model === 'shotgun'){ rig.gun.add(mesh(box(0.05, 0.05, 0.62), metal, 0, 0.02, -0.26)); rig.gun.add(mesh(box(0.06, 0.05, 0.22), wood, 0, -0.04, -0.3));
    rig.gun.add(mesh(box(0.055, 0.1, 0.24), wood, 0, -0.03, 0.18)); rig.gun.add(mesh(box(0.05, 0.08, 0.14), metal2, 0, -0.01, -0.02)); tip = -0.58; }
  rig.muzzle.position.set(0, 0.02, tip);
};
const ZMAT = {};
function zmat(color){ return ZMAT[color] || (ZMAT[color] = lam(color)); }
W.makeZombie = function(type, shirt, pants){
  const d = ZD.ZOMBIES[type];
  const skin = type === 'brute' ? 0x6a7d58 : (type === 'runner' ? 0x8da371 : 0x7e9668);
  const c = { pants:zmat(pants), boots:zmat(0x1e1c1a), shirt:zmat(shirt), skin:zmat(skin), skinArm:zmat(skin), scale:d.scale,
    wide: type === 'brute' ? 1.35 : 1, deep: type === 'brute' ? 1.5 : 1 };
  const rig = humanoid(c);
  // glowing eyes: unfogged so they read in the dark
  const eye = basic(type === 'runner' ? 0xff4a2a : 0xffd23a, { fog:false });
  rig.head.add(mesh(box(0.06, 0.035, 0.02), eye, -0.065, 0.18, -0.14, false)); rig.head.add(mesh(box(0.06, 0.035, 0.02), eye, 0.065, 0.18, -0.14, false));
  rig.head.add(mesh(box(0.16, 0.04, 0.02), zmat(0x2a1a14), 0, 0.06, -0.14, false));      // mouth
  rig.foreL.add(mesh(box(0.1, 0.09, 0.1), zmat(skin), 0, -0.3, 0)); rig.foreR.add(mesh(box(0.1, 0.09, 0.1), zmat(skin), 0, -0.3, 0));
  if(type === 'brute') rig.torso.add(mesh(box(0.5, 0.3, 0.36), zmat(shirt), 0, 0.18, -0.06));
  rig.phase = Math.random()*10; rig.sway = Math.random()*10; rig.tilt = (Math.random()-0.5)*0.5;
  scene.add(rig.root); return rig;
};
W.remove = function(o){ if(o && o.parent) o.parent.remove(o); };

// ---- animation ------------------------------------------------------------
W.animPlayer = function(rig, st, dt){
  // st: { moving, speed, back, sprint, pitch, ads, reload, swap, melee, hurt }
  rig.phase = (rig.phase || 0) + dt * (st.moving ? (st.sprint ? 11 : 8) : 0) * (st.back ? -1 : 1);
  const a = st.moving ? (st.sprint ? 0.85 : 0.6) : 0, ph = rig.phase;
  rig.legL.rotation.x =  Math.sin(ph)*a; rig.legR.rotation.x = -Math.sin(ph)*a;
  rig.shinL.rotation.x = Math.max(0, -Math.sin(ph))*a*1.1; rig.shinR.rotation.x = Math.max(0, Math.sin(ph))*a*1.1;
  rig.hips.position.y = 0.9 + Math.abs(Math.sin(ph))*0.04*(a>0?1:0);
  // aim: torso pitches with the camera, arms hold the gun forward
  const lower = st.sprint ? 0.55 : (st.swap > 0 ? 0.9*Math.sin(Math.min(1, st.swap)*Math.PI) : 0) + (st.reload > 0 ? 0.35 : 0);
  rig.torso.rotation.x = st.pitch*0.65 - (st.sprint ? 0.15 : 0); rig.head.rotation.x = st.pitch*0.3;
  const melee = st.melee > 0 ? Math.sin((1 - st.melee/0.35)*Math.PI) : 0;
  rig.armR.rotation.set(1.42 - lower + melee*0.6, 0, -0.08 - melee*0.6);
  rig.armL.rotation.set(1.25 - lower, 0, 0.55);
  rig.foreR.rotation.x = 0.25; rig.foreL.rotation.x = 0.45;
  rig.gun.rotation.x = -lower*0.8 + st.recoil*2.2; rig.gun.position.z = -0.28 + st.recoil*0.4;
  rig.torso.rotation.y = st.ads ? 0.12 : 0.05;
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
  // hunch, sway and a flinch when shot
  const flinch = z.flinch > 0 ? z.flinch/0.25 : 0;
  rig.torso.rotation.x = -d.lean + Math.sin(rig.sway)*0.05 + flinch*0.55;
  rig.torso.rotation.z = Math.sin(ph*0.5)*0.08 + rig.tilt*0.1;
  rig.head.rotation.x = d.lean*0.9 + Math.sin(rig.sway*1.7)*0.08 + flinch*0.4; rig.head.rotation.z = rig.tilt + Math.sin(rig.sway)*0.1;
  let armX = d.arms + Math.sin(ph*0.5 + 1)*0.12, armX2 = d.arms + Math.sin(ph*0.5)*0.12;
  if(z.state === 'attack' || z.state === 'board'){ const k = z.atkPose || 0; armX = 1.9 - k*1.6; armX2 = 1.9 - Math.max(0, k-0.15)*1.6; }
  if(z.state === 'climb'){ armX = 2.4; armX2 = 2.2; }
  rig.armL.rotation.set(armX2, 0, 0.12); rig.armR.rotation.set(armX, 0, -0.12);
  rig.foreL.rotation.x = 0.25; rig.foreR.rotation.x = 0.2;
  rig.body.rotation.x = z.state === 'rise' ? 0.4*(1 - Math.min(1, z.riseT/1.2)) : 0;
};

// ---- drops ----------------------------------------------------------------
W.makeDrop = function(kind){
  const d = ZD.DROPS.find(x=>x.id===kind), g = new T.Group();
  if(kind === 'ammo'){ g.add(mesh(box(0.6, 0.36, 0.36), lam(0x3b4a2c), 0, 0, 0)); g.add(mesh(box(0.62, 0.08, 0.38), basic(d.color), 0, 0.1, 0, false)); }
  else { const coin = mesh(cyl(0.36, 0.36, 0.08, 18), basic(d.color), 0, 0, 0, false); coin.rotation.x = Math.PI/2; g.add(coin);
    g.add(mesh(box(0.34, 0.1, 0.1), basic(0x7a5a00), 0, 0, 0.05, false)); }
  const beam = new T.Mesh(cyl(0.25, 0.4, 6, 10), new T.MeshBasicMaterial({ color:d.color, transparent:true, opacity:0.18, blending:T.AdditiveBlending, depthWrite:false }));
  beam.position.y = 2.6; g.add(beam);
  const glow = new T.Sprite(new T.SpriteMaterial({ map:TEX.soft, color:d.color, transparent:true, opacity:0.8, blending:T.AdditiveBlending, depthWrite:false }));
  glow.scale.set(1.8, 1.8, 1); g.add(glow);
  scene.add(g); return g;
};

// ---- effects --------------------------------------------------------------
let P = [];                // particle systems
let tracers = [], flash, shakeT = 0;
function makePsys(max, additive){
  const geo = new T.BufferGeometry();
  const pos = new Float32Array(max*3), col = new Float32Array(max*4), size = new Float32Array(max);
  geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('rgba', new T.BufferAttribute(col, 4)); geo.setAttribute('size', new T.BufferAttribute(size, 1));
  const uniforms = { map:{ value:TEX.soft }, uScale:{ value:400 } };
  const mat = new T.ShaderMaterial({ uniforms, transparent:true, depthWrite:false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
    vertexShader:'attribute float size; attribute vec4 rgba; uniform float uScale; varying vec4 vC; void main(){ vC = rgba; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*uScale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; }',
    fragmentShader:'uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = vC.a*t.a; if(a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a); }' });
  const pts = new T.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  const s = { max, n:0, pos, col, size, geo, pts, uniforms,
    vel:new Float32Array(max*3), life:new Float32Array(max), age:new Float32Array(max), base:new Float32Array(max*5) /* r,g,b,a,size */, grav:new Float32Array(max), drag:new Float32Array(max) };
  return s;
}
function initFx(){
  P.normal = makePsys(900, false); P.add = makePsys(400, true);
  W.pUniforms = [P.normal.uniforms, P.add.uniforms];
  const [, h] = W.viewportSize(); W.pUniforms.forEach(u=>u.uScale.value = h * renderer.getPixelRatio() * 0.5);
  const tm = new T.MeshBasicMaterial({ color:0xffe7a0, transparent:true, opacity:0.9, blending:T.AdditiveBlending, depthWrite:false });
  for(let i=0;i<24;i++){ const m = new T.Mesh(new T.BoxGeometry(1, 1, 1), tm.clone()); m.visible = false; scene.add(m); tracers.push({ m, t:0 }); }
  const fm = new T.MeshBasicMaterial({ map:TEX.flash, transparent:true, blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide });
  flash = new T.Group(); const p1 = new T.Mesh(new T.PlaneGeometry(0.5, 0.5), fm), p2 = p1.clone(); p2.rotation.y = Math.PI/2; const p3 = p1.clone(); p3.rotation.x = Math.PI/2;
  flash.add(p1, p2, p3); flash.visible = false; flash.t = 0; scene.add(flash);
}
W.particle = function(sys, x, y, z, vx, vy, vz, life, size, r, g, b, a, grav, drag){
  const s = P[sys]; if(W.lowFx && Math.random() < 0.5) return;
  let i = s.n < s.max ? s.n++ : (Math.random()*s.max)|0;
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
    // compact live particles to the front of the arrays
    s.pos[w*3] = x; s.pos[w*3+1] = y; s.pos[w*3+2] = z;
    s.vel[w*3] = s.vel[i*3]; s.vel[w*3+1] = s.vel[i*3+1]; s.vel[w*3+2] = s.vel[i*3+2];
    s.life[w] = s.life[i]; s.age[w] = s.age[i]; s.grav[w] = s.grav[i]; s.drag[w] = s.drag[i];
    for(let j=0;j<5;j++) s.base[w*5+j] = s.base[i*5+j];
    s.col[w*4] = s.base[w*5]; s.col[w*4+1] = s.base[w*5+1]; s.col[w*4+2] = s.base[w*5+2]; s.col[w*4+3] = s.base[w*5+3]*(1 - k*k);
    s.size[w] = s.base[w*5+4]*(0.6 + k*0.8);
    w++;
  }
  s.n = w;
  s.geo.setDrawRange(0, w);
  s.geo.attributes.position.needsUpdate = true; s.geo.attributes.rgba.needsUpdate = true; s.geo.attributes.size.needsUpdate = true;
}
W.goo = function(x, y, z, dx, dy, dz, n, big){
  for(let i=0;i<n;i++){ const sp = 1.5 + Math.random()*3.5*(big?1.5:1);
    W.particle('normal', x, y, z, dx*sp + (Math.random()-0.5)*2.4, dy*sp + Math.random()*2.2, dz*sp + (Math.random()-0.5)*2.4,
      0.45 + Math.random()*0.5, 0.07 + Math.random()*0.09*(big?1.6:1), 0.36 + Math.random()*0.15, 0.62 + Math.random()*0.2, 0.12, 0.95, 9, 1.2); }
  if(big) for(let i=0;i<6;i++) W.particle('normal', x, y, z, (Math.random()-0.5)*1.4, Math.random()*1.4, (Math.random()-0.5)*1.4, 0.7, 0.26, 0.28, 0.42, 0.1, 0.6, 2, 2);
};
W.dust = function(x, y, z, n){ for(let i=0;i<n;i++) W.particle('normal', x, y, z, (Math.random()-0.5)*1.6, Math.random()*1.4, (Math.random()-0.5)*1.6, 0.5 + Math.random()*0.5, 0.18 + Math.random()*0.16, 0.55, 0.52, 0.48, 0.45, 1.2, 1.5); };
W.sparks = function(x, y, z, n){ for(let i=0;i<n;i++) W.particle('add', x, y, z, (Math.random()-0.5)*5, Math.random()*4, (Math.random()-0.5)*5, 0.18 + Math.random()*0.15, 0.05, 1, 0.75, 0.35, 1, 12, 0.5); };
W.smoke = function(x, y, z){ W.particle('normal', x, y, z, (Math.random()-0.5)*0.3, 0.5 + Math.random()*0.3, (Math.random()-0.5)*0.3, 0.6, 0.16, 0.6, 0.6, 0.62, 0.22, -0.4, 1.2); };
W.rise = function(x, z){ for(let i=0;i<14;i++) W.particle('normal', x + (Math.random()-0.5)*0.8, 0.1, z + (Math.random()-0.5)*0.8, (Math.random()-0.5)*1.2, 1 + Math.random()*1.5, (Math.random()-0.5)*1.2, 0.8, 0.22, 0.24, 0.2, 0.15, 0.7, 4, 1); };
W.pickupFx = function(x, y, z, color){ const c = new T.Color(color); for(let i=0;i<30;i++){ const a = Math.random()*6.28, s = 2 + Math.random()*3;
  W.particle('add', x, y, z, Math.cos(a)*s, Math.random()*3, Math.sin(a)*s, 0.6, 0.12, c.r, c.g, c.b, 1, 2, 1.5); } };
W.tracer = function(fx, fy, fz, tx, ty, tz){
  const o = tracers.find(t=>t.t <= 0) || tracers[0];
  const dx = tx-fx, dy = ty-fy, dz = tz-fz, len = Math.hypot(dx, dy, dz);
  o.m.position.set((fx+tx)/2, (fy+ty)/2, (fz+tz)/2); o.m.scale.set(0.025, 0.025, len); o.m.lookAt(tx, ty, tz);
  o.m.visible = true; o.m.material.opacity = 0.85; o.t = 0.07;
};
W.muzzleFlash = function(pos, dir, size){
  flash.position.copy(pos); flash.lookAt(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z); flash.rotation.z = Math.random()*6;
  flash.scale.setScalar((0.7 + Math.random()*0.5)*size); flash.visible = true; flash.t = 0.045;
  W.muzzleLight.position.copy(pos); W.muzzleLight.intensity = 2.4*size;
  W.smoke(pos.x, pos.y, pos.z);
};
W.shake = function(a){ shakeT = Math.min(1, shakeT + a); };
W.applyShake = function(){ if(shakeT <= 0) return; const s = shakeT*shakeT*0.06;
  camera.position.x += (Math.random()-0.5)*s; camera.position.y += (Math.random()-0.5)*s; camera.rotation.z += (Math.random()-0.5)*s*0.6; };
W.tick = function(dt, t){
  tickPsys(P.normal, dt); tickPsys(P.add, dt);
  for(const o of tracers){ if(o.t > 0){ o.t -= dt; o.m.material.opacity = Math.max(0, o.t/0.07)*0.85; if(o.t <= 0) o.m.visible = false; } }
  if(flash.t > 0){ flash.t -= dt; if(flash.t <= 0) flash.visible = false; }
  W.muzzleLight.intensity = Math.max(0, W.muzzleLight.intensity - dt*60);
  shakeT = Math.max(0, shakeT - dt*1.8);
  tickBoards(dt);
  if(W.gateOpening && W.gateOpen < 1){ W.gateOpen = Math.min(1, W.gateOpen + dt*0.8); W.gate.position.x = W.gateOpen*3.1; W.gate.position.y = -Math.sin(W.gateOpen*Math.PI)*0.02;
    if(W.gateOpen >= 1){ W.gateSign.visible = false; W.gateSign2.visible = false; } }
  for(const L of W.lampLights) if(L.flick) L.l.intensity = L.base * (Math.random() < 0.04 ? 0.25 : (0.9 + Math.sin(t*23)*0.05));
};

})(window.ZD);

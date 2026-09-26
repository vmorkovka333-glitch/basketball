'use strict';
// ===================================================================
// Tower Defense 3D — the Three.js side: scene, map, meshes, effects
// ===================================================================
(function(){
const W = {};
TD.W = W;

// three.min.js is a deferred script ahead of this one, so THREE exists at parse time
let T = window.THREE, renderer, scene, camera, mount, sun, hemi, rim, ground;
let mapGroup = null, theme = null, curMap = null;
W.elev = 0.93; W.yaw = 0; W.shakeAmt = 0;

// The page may be an iframe that starts 0x0: fall back to sane numbers rather than NaN.
function viewportSize(){
  let w = mount ? mount.clientWidth : 0, h = mount ? mount.clientHeight : 0;
  if(!(w>0) || !(h>0)){ w = innerWidth; h = innerHeight; }
  if(!(w>0) || !(h>0)){ w = 1280; h = 720; }
  return [w,h];
}
W.viewportSize = viewportSize;
function renderScale(w,h){
  const base = Math.min(devicePixelRatio||1, 2);
  const px = w*h;
  if(px < 500*400) return Math.min(2.5, base*1.35);
  if(px > 1900*1100) return Math.min(base, 1.5);
  return base;
}

W.init = function(el, quality){
  T = window.THREE; mount = el;
  renderer = new T.WebGLRenderer({ antialias:true, alpha:false, powerPreference:'high-performance' });
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  
  mount.appendChild(renderer.domElement);
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(42, 1, 0.5, 200);
  hemi = new T.HemisphereLight(0xdfefff, 0x5a4a2a, 0.75); scene.add(hemi);
  sun = new T.DirectionalLight(0xfff2d8, 1.05);
  rim = new T.DirectionalLight(0x9fd8ff, 0.35); rim.position.set(20, 8, -20); scene.add(rim);
  sun.castShadow = true;
  const sm = navigator.maxTouchPoints>0 ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  scene.fog = new T.Fog(0xffffff, 1000, 2000);
  W.renderer = renderer; W.scene = scene; W.camera = camera;
  fxInit(); glowInit();
  W.resize();
};
W.setQuality = function(q){ renderer.shadowMap.enabled = q !== 'low'; renderer.shadowMap.needsUpdate = true;
  scene.traverse(o=>{ if(o.material) o.material.needsUpdate = true; }); };

W.resize = function(){
  const [w,h] = viewportSize();
  renderer.setPixelRatio(renderScale(w,h));
  renderer.setSize(w,h,false);
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  W._vw = w; W._vh = h;
  if(curMap) W.frame();
};
W.sizeChanged = function(){ const [w,h] = viewportSize(); return w!==W._vw || h!==W._vh; };

// ---- camera: fit the whole island into the free band between the HUD bars ----
W.frame = function(){
  const m = curMap; if(!m) return;
  const [vw,vh] = viewportSize();
  const aspect = vw/vh, portrait = aspect < 1;
  camera.aspect = aspect;
  W.yaw = portrait ? -Math.PI/2 : 0;
  const elev = portrait ? 0.98 : 0.92;
  const cx = m.w/2, cz = m.h/2;
  const pts = [];
  for(const x of [-1.6, m.w+1.6]) for(const z of [-1.6, m.h+1.6]) for(const y of [0,1.4]) pts.push(new T.Vector3(x,y,z));
  const limX = 0.95, limY = portrait ? 0.64 : 0.74;
  let dist = 18;
  const dir = new T.Vector3(Math.sin(W.yaw)*Math.cos(elev), Math.sin(elev), Math.cos(W.yaw)*Math.cos(elev));
  camera.clearViewOffset();
  for(let it=0; it<5; it++){
    camera.position.set(cx,0,cz).addScaledVector(dir, dist);
    camera.lookAt(cx, 0.2, cz);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    let mx = 0;
    for(const p of pts){ const q = p.clone().project(camera); mx = Math.max(mx, Math.abs(q.x)/limX, Math.abs(q.y)/limY); }
    dist *= mx;
  }
  const shift = Math.round(vh * (portrait ? -0.02 : 0.055));
  camera.setViewOffset(vw, vh, 0, shift, vw, vh);
  camera.updateProjectionMatrix();
  W.dist = dist; W.basePos = camera.position.clone();
  const s = sun.shadow.camera;
  s.left = -(m.w/2+3); s.right = m.w/2+3; s.top = m.h/2+3; s.bottom = -(m.h/2+3); s.near = 1; s.far = 60;
  s.updateProjectionMatrix();
};
W.shake = function(a){ W.shakeAmt = Math.min(0.6, W.shakeAmt + a); };

// ---- picking: pointer -> ground cell ----
const _ray = new T.Raycaster(), _pl = new T.Plane(new T.Vector3(0,1,0), 0), _hit = new T.Vector3(), _ndc = new T.Vector2();
W.pick = function(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  _ndc.set(((clientX-r.left)/r.width)*2-1, -((clientY-r.top)/r.height)*2+1);
  _ray.setFromCamera(_ndc, camera);
  if(!_ray.ray.intersectPlane(_pl, _hit)) return null;
  return { x:_hit.x, z:_hit.z, cx:Math.floor(_hit.x), cz:Math.floor(_hit.z) };
};
const _sv = new T.Vector3();
W.toScreen = function(x,y,z){
  _sv.set(x,y,z).project(camera); const [vw,vh] = viewportSize();
  return [ (_sv.x+1)/2*vw, (1-_sv.y)/2*vh ];
};

// ---- materials ----
const matCache = {};
function mat(color, opts){
  const key = color+'|'+JSON.stringify(opts||{});
  if(!matCache[key]) matCache[key] = new T.MeshLambertMaterial(Object.assign({color}, opts||{}));
  return matCache[key];
}
function emissive(color, intensity){
  return new T.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity==null?0.6:intensity });
}
W.mat = mat;

// ---- map ----
W.buildMap = function(map){
  if(mapGroup){ scene.remove(mapGroup); disposeGroup(mapGroup); }
  curMap = map; theme = TD.THEMES[map.theme];
  mapGroup = new T.Group(); scene.add(mapGroup);
  scene.background = skyTexture(theme);
  hemi.color.set(theme.hemi); sun.color.set(theme.sun);
  hemi.intensity = map.theme==='space'||map.theme==='neon' ? 0.58 : (map.theme==='lava' ? 0.62 : 0.75);
  W.light = map.theme==='grass'||map.theme==='sand'||map.theme==='snow';
  rim.color.set(theme.rimLight || 0x9fd8ff); rim.intensity = theme.rimLight ? 0.6 : 0.35;
  sun.position.set(map.w/2 - 6, 14, map.h/2 + 5); sun.target.position.set(map.w/2, 0, map.h/2);

  // roads: the main path plus optional forks / passages that open / reroutes
  const P = map.path;
  const cellList = P => { const out = []; for(let i=0;i<P.length-1;i++){ const [x0,z0]=P[i], [x1,z1]=P[i+1]; const dx=Math.sign(x1-x0), dz=Math.sign(z1-z0); let x=x0, z=z0; if(!i) out.push(x+','+z); while(x!==x1 || z!==z1){ x+=dx; z+=dz; out.push(x+','+z); } } return out; };
  const ext = (a,b)=>a.clone().sub(b).normalize().multiplyScalar(2.2).add(a);
  const toRoute = P => { const r = P.map(([x,z])=>new T.Vector3(x+0.5, 0, z+0.5)); r[0] = ext(r[0], r[1]); r[r.length-1] = ext(r[r.length-1], r[r.length-2]); return r; };
  map.routeDefs = [{ kind:'main', path:P, list:cellList(P), route:toRoute(P), open:true }];
  (map.routes||[]).forEach(d=>map.routeDefs.push(Object.assign({}, d, { list:cellList(d.path), route:toRoute(d.path), open: d.kind==='fork' })));
  map.routeDefs.forEach(r=>{ r.cells = new Set(r.list); });
  const main = map.routeDefs[0];
  for(const r of map.routeDefs.slice(1)){
    r.gate = r.list.find(c=>!main.cells.has(c));                       // where the barricade sits
    if(r.kind==='reroute') r.closeAt = main.list.find(c=>!r.cells.has(c)); // where the old road gets buried
  }
  const pathSet = new Set(); map.routeDefs.forEach(r=>r.cells.forEach(c=>pathSet.add(c)));
  map.pathSet = pathSet;
  map.route = main.route;
  const airPts = map.air.map(([x,z])=>new T.Vector3(x+0.5, 0, z+0.5));
  airPts[0] = ext(airPts[0], airPts[1]); airPts[airPts.length-1] = ext(airPts[airPts.length-1], airPts[airPts.length-2]);
  map.airRoute = airPts;

  // ground texture (redrawn whenever a road opens or closes)
  const RIM = 2, cs = 64;
  const gw = map.w + RIM*2, gh = map.h + RIM*2;
  const cv = document.createElement('canvas'); cv.width = gw*cs; cv.height = gh*cs;
  map.groundCanvas = cv;
  drawGround(map);
  const tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding; tex.anisotropy = 4; map.groundTex = tex;
  ground = new T.Mesh(new T.PlaneGeometry(gw, gh), new T.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI/2; ground.position.set(map.w/2, 0, map.h/2); ground.receiveShadow = true;
  mapGroup.add(ground);
  map.gateMeshes = []; buildGates(map);
  const rnd = (()=>{ let seed = 777 + map.id.length*91; return ()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }; })();
  const route = main.route;
  const cliff = new T.Mesh(new T.BoxGeometry(gw, 1.4, gh), mat(theme.side));
  cliff.position.set(map.w/2, -0.72, map.h/2); mapGroup.add(cliff);
  const cliff2 = new T.Mesh(new T.BoxGeometry(gw-1.2, 1.2, gh-1.2), mat(theme.side));
  cliff2.position.set(map.w/2, -1.9, map.h/2); mapGroup.add(cliff2);

  // props on the rim
  const treeGeo = new T.ConeGeometry(0.34, 0.9, 7), trunkGeo = new T.CylinderGeometry(0.07,0.09,0.32,6);
  const rockGeo = new T.DodecahedronGeometry(0.28, 0);
  const treeMat = (map.theme==='space'||map.theme==='neon') ? emissive(theme.tree, 0.6) : mat(theme.tree), trunkMat = mat(theme.trunk), rockMat = mat(theme.rock), snowMat = mat(0xf4f8fc);
  const nearRoad = (x,z)=>route.some((v,i)=>{ if(i===route.length-1) return false; const a=route[i], b=route[i+1];
    const t=Math.max(0,Math.min(1,((x-a.x)*(b.x-a.x)+(z-a.z)*(b.z-a.z))/(a.distanceToSquared(b)||1)));
    return Math.hypot(x-(a.x+(b.x-a.x)*t), z-(a.z+(b.z-a.z)*t)) < 0.9; });
  for(let cx=-RIM; cx<map.w+RIM; cx++) for(let cz=-RIM; cz<map.h+RIM; cz++){
    const inside = cx>=0 && cz>=0 && cx<map.w && cz<map.h;
    if(inside) continue;
    if(rnd() > 0.42) continue;
    const px = cx+0.2+rnd()*0.6, pz = cz+0.2+rnd()*0.6;
    if(nearRoad(px,pz)) continue;
    if(rnd() < 0.72){
      const s = 0.8+rnd()*0.7;
      if(map.theme==='space'||map.theme==='neon'){ // crystals
        const c = new T.Mesh(new T.OctahedronGeometry(0.28, 0), treeMat); c.position.set(px, 0.35*s, pz); c.scale.set(s*0.7, s*1.6, s*0.7); c.rotation.y = rnd()*3; c.castShadow = true; mapGroup.add(c);
      }else if(map.theme==='lava'){ // dead spikes
        const c = new T.Mesh(new T.ConeGeometry(0.2, 1.0, 5), treeMat); c.position.set(px, 0.5*s, pz); c.scale.setScalar(s); c.rotation.set((rnd()-0.5)*0.4, 0, (rnd()-0.5)*0.4); c.castShadow = true; mapGroup.add(c);
      }else{
        const tr = new T.Mesh(trunkGeo, trunkMat); tr.position.set(px, 0.16*s, pz); tr.scale.setScalar(s); tr.castShadow = true;
        const c = new T.Mesh(treeGeo, treeMat); c.position.set(px, 0.32*s+0.45*s, pz); c.scale.setScalar(s); c.castShadow = true;
        mapGroup.add(tr, c);
        if(map.theme==='snow'){ const cap = new T.Mesh(new T.ConeGeometry(0.2,0.3,7), snowMat); cap.position.set(px, 0.32*s+0.78*s, pz); cap.scale.setScalar(s); mapGroup.add(cap); }
        if(map.theme==='sand' && rnd()<0.5){ c.geometry = new T.CylinderGeometry(0.12,0.16,0.9,6); c.material = mat(0x4f9a3c); c.position.y = 0.6*s; }
      }
    }else{
      const r = new T.Mesh(rockGeo, rockMat); r.position.set(px, 0.12, pz); r.rotation.set(rnd()*3, rnd()*3, rnd()*3);
      r.scale.set(0.6+rnd()*0.9, 0.5+rnd()*0.6, 0.6+rnd()*0.9); r.castShadow = true; mapGroup.add(r);
    }
  }
  // lava pools on the road
  map.lavaMeshes = [];
  if(map.lava){
    for(const [x,z] of map.lava){
      const pool = new T.Mesh(new T.CircleGeometry(0.42, 18), emissive(0xff5a1a, 0.9)); pool.rotation.x = -Math.PI/2; pool.position.set(x+0.5, 0.02, z+0.5);
      const rim = new T.Mesh(new T.RingGeometry(0.42, 0.5, 18), emissive(0x2a1010, 0.2)); rim.rotation.x = -Math.PI/2; rim.position.set(x+0.5, 0.025, z+0.5);
      mapGroup.add(pool, rim); map.lavaMeshes.push(pool);
    }
  }
  // day / night: remember the daytime look so the night can blend from it
  W.day = { hemiI:hemi.intensity, sunI:sun.intensity, rimI:rim.intensity, hemiC:new T.Color(theme.hemi), sunC:new T.Color(theme.sun), rimC:rim.color.clone(), light:W.light, bg:scene.background };
  W.nightBg = skyTexture({ sky:0x10163a, skyTop:0x04061a, skyBot:0x2a2a5a });
  W.nightK = -1; W.setNight(0);
  if(!theme.stars){
    const n = 500, pos = new Float32Array(n*3);
    for(let i=0;i<n;i++){ const a = rnd()*Math.PI*2, e = rnd()*1.2-0.1; const R = 60+rnd()*30; pos[i*3]=map.w/2+Math.cos(a)*Math.cos(e)*R; pos[i*3+1]=Math.sin(e)*R-10; pos[i*3+2]=map.h/2+Math.sin(a)*Math.cos(e)*R; }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos,3));
    map.nightStars = new T.Points(geo, new T.PointsMaterial({ color:0xffffff, size:0.35, sizeAttenuation:true, transparent:true, opacity:0, fog:false })); mapGroup.add(map.nightStars);
  }
  // stars in space
  if(theme.stars){
    const n = 600, pos = new Float32Array(n*3);
    for(let i=0;i<n;i++){ const a = rnd()*Math.PI*2, e = rnd()*1.2-0.1; const R = 60+rnd()*30; pos[i*3]=map.w/2+Math.cos(a)*Math.cos(e)*R; pos[i*3+1]=Math.sin(e)*R-10; pos[i*3+2]=map.h/2+Math.sin(a)*Math.cos(e)*R; }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos,3));
    const st = new T.Points(geo, new T.PointsMaterial({ color:0xffffff, size:0.35, sizeAttenuation:true })); mapGroup.add(st);
  }

  // floating rocks and clouds below the island: sells the "sky island" look
  map.floaters = [];
  for(let i=0;i<9;i++){
    const a = i/9*Math.PI*2 + rnd()*0.4, R = Math.max(map.w,map.h)*0.55 + 3 + rnd()*5;
    const fx = map.w/2 + Math.cos(a)*R, fz = map.h/2 + Math.sin(a)*R*0.8, fy = -3.2 - rnd()*4;
    const isCloud = !theme.stars && map.theme!=='lava' && rnd()<0.55;
    let o;
    if(isCloud){ o = new T.Group(); const cm = mat(0xffffff);
      for(let k=0;k<4;k++){ const b = new T.Mesh(new T.DodecahedronGeometry(0.7+rnd()*0.6,0), cm); b.position.set(k*0.9-1.3, rnd()*0.3, rnd()*0.6); b.scale.y = 0.55; o.add(b); } }
    else { o = new T.Group(); const r = new T.Mesh(new T.DodecahedronGeometry(0.8+rnd()*0.9,0), mat(theme.side)); r.scale.y = 1.3; o.add(r);
      const top = new T.Mesh(new T.CylinderGeometry(0.9,0.5,0.3,7), mat(theme.rim)); top.position.y = 0.9; top.scale.setScalar(0.9+rnd()*0.4); o.add(top);
      if(theme.stars||map.theme==='lava'){ const c = new T.Mesh(new T.OctahedronGeometry(0.25,0), emissive(theme.glow||theme.tree, 0.9)); c.position.y = 1.3; o.add(c); } }
    o.position.set(fx, fy, fz); o.userData.y0 = fy; o.userData.ph = rnd()*6; mapGroup.add(o); map.floaters.push(o);
  }
  // castle at the end of the road, portal at the start
  const last = P[P.length-1];
  const castle = makeCastle(); castle.position.set(last[0]+0.5, 0, last[1]+0.5);
  const dirOut = new T.Vector3().subVectors(route[route.length-1], route[route.length-2]).normalize();
  castle.position.addScaledVector(dirOut, 1.15); castle.lookAt(castle.position.clone().sub(dirOut));
  mapGroup.add(castle); map.castle = castle;
  const gate = makeGate(); gate.position.copy(route[1]).addScaledVector(new T.Vector3().subVectors(route[0],route[1]).normalize(), 1.15);
  gate.lookAt(route[1].clone().setY(0)); mapGroup.add(gate); map.gate = gate;
  const gl = glowSprite(0xb07cff, 2.6, 0.75); gl.position.set(0, 0.5, 0); gate.add(gl); gate.userData.glow = gl;
  if(map.lavaMeshes) for(const p of map.lavaMeshes){ const g2 = glowSprite(0xff6a1a, 1.8, 0.7); g2.position.set(p.position.x, 0.3, p.position.z); mapGroup.add(g2); p.userData.glow = g2; }

  W.frame();
};

// k: 0 = day, 1 = full night
const _nc = new T.Color();
W.setNight = function(k){
  if(!W.day || k===W.nightK) return; W.nightK = k;
  const D = W.day, dark = theme && theme.stars;
  hemi.intensity = D.hemiI*(1 - (dark?0.35:0.55)*k); sun.intensity = D.sunI*(1 - (dark?0.4:0.62)*k);
  hemi.color.copy(D.hemiC).lerp(_nc.set(0x6a78c8), k*0.7); sun.color.copy(D.sunC).lerp(_nc.set(0x8a9cff), k*0.8);
  rim.intensity = D.rimI + 0.45*k; rim.color.copy(D.rimC).lerp(_nc.set(0x7a8cff), k);
  W.light = D.light && k < 0.5;
  if(!dark) scene.background = k > 0.5 ? W.nightBg : D.bg;
  if(curMap && curMap.nightStars) curMap.nightStars.material.opacity = Math.max(0, k*1.3-0.3);
};
// weather fog: k 0..1
W.setFog = function(k, color){
  if(!scene.fog) return;
  scene.fog.color.set(color!=null ? color : 0xd8dde8);
  const d = W.dist || 25;
  scene.fog.near = 1000*(1-k) + d*0.62*k; scene.fog.far = 2000*(1-k) + d*1.45*k;
};

function drawGround(map){
  const th = TD.THEMES[map.theme], cv = map.groundCanvas, g = cv.getContext('2d');
  const RIM = 2, cs = 64;
  let seed = 12345 + map.id.length*77;
  const rnd = ()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };
  g.globalAlpha = 1; g.fillStyle = th.ground; g.fillRect(0,0,cv.width,cv.height);
  for(let i=0;i<260;i++){
    g.fillStyle = i%2 ? th.ground2 : th.rim; g.globalAlpha = 0.18+rnd()*0.2;
    const r = 18+rnd()*46; g.beginPath(); g.ellipse(rnd()*cv.width, rnd()*cv.height, r, r*(0.6+rnd()*0.6), rnd()*3, 0, Math.PI*2); g.fill();
  }
  g.globalAlpha = 1;
  g.strokeStyle = map.theme==='space'||map.theme==='lava' ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.10)'; g.lineWidth = 2;
  for(let x=0;x<=map.w;x++){ g.beginPath(); g.moveTo((x+RIM)*cs, RIM*cs); g.lineTo((x+RIM)*cs, (map.h+RIM)*cs); g.stroke(); }
  for(let z=0;z<=map.h;z++){ g.beginPath(); g.moveTo(RIM*cs, (z+RIM)*cs); g.lineTo((map.w+RIM)*cs, (z+RIM)*cs); g.stroke(); }
  if(map.theme==='neon'){
    g.strokeStyle = 'rgba(46,242,255,.28)'; g.lineWidth = 3;
    for(let x=0;x<=map.w;x++){ g.beginPath(); g.moveTo((x+RIM)*cs, RIM*cs); g.lineTo((x+RIM)*cs, (map.h+RIM)*cs); g.stroke(); }
    for(let z=0;z<=map.h;z++){ g.beginPath(); g.moveTo(RIM*cs, (z+RIM)*cs); g.lineTo((map.w+RIM)*cs, (z+RIM)*cs); g.stroke(); }
  }
  const line = (rp)=>{ g.beginPath(); rp.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1])); g.stroke(); };
  // closed roads first (dim, overgrown), then open roads on top
  const order = map.routeDefs.slice().sort((a,b)=>(a.open?1:0)-(b.open?1:0));
  for(const r of order){
    const rp = r.route.map(v=>[(v.x+RIM)*cs, (v.z+RIM)*cs]);
    g.lineJoin = 'round'; g.lineCap = 'butt';
    if(!r.open){
      g.globalAlpha = 0.5; g.setLineDash([cs*0.3, cs*0.18]); g.strokeStyle = th.edge; g.lineWidth = cs*0.8; line(rp);
      g.setLineDash([]); g.globalAlpha = 0.28; g.strokeStyle = th.path; g.lineWidth = cs*0.6; line(rp);
      g.globalAlpha = 0.5; g.fillStyle = th.rim;
      for(let i=0;i<rp.length-1;i++){ const [x0,y0]=rp[i],[x1,y1]=rp[i+1]; const L=Math.hypot(x1-x0,y1-y0), n=Math.floor(L/20);
        for(let k=0;k<n;k++){ const t=k/n; g.beginPath(); g.arc(x0+(x1-x0)*t+(rnd()-0.5)*cs*0.5, y0+(y1-y0)*t+(rnd()-0.5)*cs*0.5, 3+rnd()*5, 0, Math.PI*2); g.fill(); } }
      g.globalAlpha = 1; continue;
    }
    g.globalAlpha = 1; g.strokeStyle = th.edge; g.lineWidth = cs*0.86; line(rp);
    g.strokeStyle = th.path; g.lineWidth = cs*0.72; line(rp);
    g.globalAlpha = 0.22; g.fillStyle = th.edge;
    for(let i=0;i<rp.length-1;i++){ const [x0,y0]=rp[i],[x1,y1]=rp[i+1]; const L=Math.hypot(x1-x0,y1-y0), n=Math.floor(L/14);
      for(let k=0;k<n;k++){ const t=k/n; const px=x0+(x1-x0)*t+(rnd()-0.5)*cs*0.5, py=y0+(y1-y0)*t+(rnd()-0.5)*cs*0.5; g.beginPath(); g.arc(px,py,2+rnd()*3,0,Math.PI*2); g.fill(); } }
    g.globalAlpha = 1;
    if(map.theme==='neon'){ g.strokeStyle = 'rgba(255,60,240,.85)'; g.lineWidth = 4;
      for(const off of [-1,1]){ g.beginPath(); rp.forEach((p,i)=>{ const q = rp[Math.min(i+1,rp.length-1)], o = rp[Math.max(i-1,0)]; const dx=q[0]-o[0], dy=q[1]-o[1], L=Math.hypot(dx,dy)||1; const nx=-dy/L*cs*0.36*off, ny=dx/L*cs*0.36*off; i?g.lineTo(p[0]+nx,p[1]+ny):g.moveTo(p[0]+nx,p[1]+ny); }); g.stroke(); } }
  }
  if(map.theme==='lava'){ // glowing cracks
    g.globalAlpha = 1; g.strokeStyle = 'rgba(255,90,26,.55)'; g.lineWidth = 3;
    for(let i=0;i<40;i++){ let x=rnd()*cv.width, y=rnd()*cv.height; g.beginPath(); g.moveTo(x,y); for(let k=0;k<5;k++){ x+=(rnd()-0.5)*60; y+=(rnd()-0.5)*60; g.lineTo(x,y); } g.stroke(); }
  }
  g.globalAlpha = 1;
}
// wooden barricades on passages that are still shut, rock piles on buried roads
function buildGates(map){
  (map.gateMeshes||[]).forEach(m=>mapGroup.remove(m)); map.gateMeshes = [];
  const wood = mat(0x7a5230), plank = mat(0x9a6a3a), stone = mat(TD.THEMES[map.theme].rock);
  const at = key => { const [x,z] = key.split(',').map(Number); return [x+0.5, z+0.5]; };
  for(const r of map.routeDefs.slice(1)){
    if(!r.open && r.gate){ const [x,z] = at(r.gate), g = new T.Group();
      for(const sx of [-0.38,0.38]){ const post = new T.Mesh(new T.BoxGeometry(0.1,0.62,0.1), wood); post.position.set(sx,0.31,0); post.castShadow = true; g.add(post); }
      for(let i=0;i<2;i++){ const p2 = new T.Mesh(new T.BoxGeometry(0.95,0.12,0.06), plank); p2.position.set(0,0.22+i*0.24,0); p2.rotation.z = i?0.12:-0.1; p2.castShadow = true; g.add(p2); }
      const x1 = new T.Mesh(new T.BoxGeometry(0.9,0.07,0.05), wood); x1.rotation.z = 0.55; x1.position.set(0,0.34,0.05); g.add(x1);
      const warn = glowSprite(0xffc857, 0.9, 0.5); warn.position.y = 0.75; g.add(warn); g.userData.warn = warn;
      const i = r.list.indexOf(r.gate), prev = r.list[i-1];
      if(prev){ const [px,pz] = at(prev); g.rotation.y = Math.atan2(x-px, z-pz) + Math.PI/2; }
      g.position.set(x,0,z); mapGroup.add(g); map.gateMeshes.push(g); r.gateMesh = g; }
    if(r.kind==='reroute' && r.open && r.closeAt){ const [x,z] = at(r.closeAt), g = new T.Group();
      for(let i=0;i<6;i++){ const b = new T.Mesh(new T.DodecahedronGeometry(0.16+Math.random()*0.14,0), stone); b.position.set((Math.random()-0.5)*0.7, 0.12+Math.random()*0.2, (Math.random()-0.5)*0.7); b.rotation.set(Math.random()*3,Math.random()*3,0); b.castShadow = true; g.add(b); }
      if(map.theme==='lava'){ const lv = new T.Mesh(new T.CircleGeometry(0.45, 14), emissive(0xff5a1a, 0.9)); lv.rotation.x = -Math.PI/2; lv.position.y = 0.03; g.add(lv); const gl = glowSprite(0xff5a1a, 1.6, 0.6); gl.position.y = 0.3; g.add(gl); }
      g.position.set(x,0,z); mapGroup.add(g); map.gateMeshes.push(g); }
  }
}
W.refreshRoads = function(map){ drawGround(map); map.groundTex.needsUpdate = true; buildGates(map); };

function makeCastle(){
  const g = new T.Group();
  const stone = mat(0xb9b4a8), dark = mat(0x8c867a), roof = mat(0xb3403a), wood = mat(0x6b4427);
  const keep = new T.Mesh(new T.BoxGeometry(1.7, 1.0, 1.3), stone); keep.position.y = 0.5; keep.castShadow = true; g.add(keep);
  for(const [x,z] of [[-0.8,-0.6],[0.8,-0.6],[-0.8,0.6],[0.8,0.6]]){
    const t = new T.Mesh(new T.CylinderGeometry(0.26,0.3,1.5,10), dark); t.position.set(x,0.75,z); t.castShadow = true; g.add(t);
    const r = new T.Mesh(new T.ConeGeometry(0.34,0.45,10), roof); r.position.set(x,1.72,z); r.castShadow = true; g.add(r);
  }
  const gate = new T.Mesh(new T.BoxGeometry(0.5, 0.62, 0.1), wood); gate.position.set(0, 0.31, 0.68); g.add(gate);
  const pole = new T.Mesh(new T.CylinderGeometry(0.02,0.02,0.7,5), wood); pole.position.set(0,1.35,0); g.add(pole);
  const flag = new T.Mesh(new T.PlaneGeometry(0.42,0.26), new T.MeshLambertMaterial({color:0xffb63d, side:T.DoubleSide})); flag.position.set(0.22,1.58,0); g.add(flag);
  g.userData.flag = flag;
  return g;
}
function makeGate(){
  const g = new T.Group();
  const disc = new T.Mesh(new T.CircleGeometry(0.62, 24), emissive(0x7a2ee0, 0.9)); disc.rotation.x = -Math.PI/2; disc.position.y = 0.03; g.add(disc);
  const rim = new T.Mesh(new T.TorusGeometry(0.66, 0.07, 8, 24), mat(0x3a2f3f)); rim.rotation.x = Math.PI/2; rim.position.y = 0.05; g.add(rim);
  const arch = new T.Mesh(new T.TorusGeometry(0.62, 0.1, 8, 18, Math.PI), mat(0x4a3f52)); arch.position.y = 0.1; arch.castShadow = true; g.add(arch);
  for(const sx of [-1,1]){ const p = new T.Mesh(new T.BoxGeometry(0.2, 0.7, 0.2), mat(0x4a3f52)); p.position.set(sx*0.72, 0.35, 0); p.castShadow = true; g.add(p); }
  g.userData.disc = disc;
  return g;
}
function disposeGroup(gr){
  gr.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material && o.material.map) o.material.map.dispose(); });
}

// ---- towers ----
// returns a Group with .head (yaws toward the target) and .muzzle (Vector3 in head space)
W.makeTower = function(type, level, skin, branch, opts){
  opts = opts || {};
  const d = TD.TOWERS[type], g = new T.Group();
  const col = skin ? skin.color : d.color, accC = skin ? skin.accent : d.accent, trimC = skin ? skin.trim : 0xffc857;
  const stone = mat(0xa9a59b), stoneD = mat(0x7f7b72), wood = mat(0x8a5a2b), gold = emissive(trimC, 0.35);
  const base = new T.Mesh(new T.CylinderGeometry(0.36, 0.42, 0.28, 12), stone); base.position.y = 0.14; base.castShadow = true; g.add(base);
  const step = new T.Mesh(new T.CylinderGeometry(0.44, 0.48, 0.08, 12), stoneD); step.position.y = 0.04; g.add(step);
  const head = new T.Group(); g.add(head); g.head = head; g.muzzle = new T.Vector3(0, 0.2, 0.32);
  // neon rune on the ground under every tower
  const runeC = opts.rarity ? opts.rarity : accC;
  const rune = new T.Mesh(new T.RingGeometry(0.5, opts.rarity ? 0.6 : 0.57, 32), new T.MeshBasicMaterial({ color:runeC, transparent:true, opacity:0.55, blending:T.AdditiveBlending, depthWrite:false }));
  rune.rotation.x = -Math.PI/2; rune.position.y = 0.012; g.add(rune); g.rune = rune;
  const body = skin ? emissive(col, 0.25) : mat(col), acc = emissive(accC, 0.5);
  if(type==='archer'){
    const post = new T.Mesh(new T.CylinderGeometry(0.16,0.2,0.5,8), wood); post.position.y = 0.53; post.castShadow = true; g.add(post);
    head.position.y = 0.82;
    const bow = new T.Mesh(new T.TorusGeometry(0.24, 0.03, 6, 14, Math.PI), skin?body:mat(0x5a3a1a)); bow.rotation.set(-Math.PI/2, 0, 0); bow.position.z = 0.12; head.add(bow);
    const str = new T.Mesh(new T.BoxGeometry(0.48,0.015,0.015), mat(0xf0e6c8)); str.position.z = 0.12; head.add(str);
    const bolt = new T.Mesh(new T.BoxGeometry(0.04,0.04,0.42), acc); bolt.position.z = 0.12; head.add(bolt);
    const hood = new T.Mesh(new T.ConeGeometry(0.16,0.3,7), body); hood.position.set(0,0.12,-0.12); head.add(hood);
    g.muzzle.set(0,0.02,0.34);
  }else if(type==='cannon'){
    const mount = new T.Mesh(new T.BoxGeometry(0.5,0.22,0.5), wood); mount.position.y = 0.39; mount.castShadow = true; g.add(mount);
    head.position.y = 0.62;
    const barrel = new T.Mesh(new T.CylinderGeometry(0.11,0.14,0.62,10), body); barrel.rotation.x = Math.PI/2; barrel.position.z = 0.18; barrel.castShadow = true; head.add(barrel);
    const ring = new T.Mesh(new T.TorusGeometry(0.15,0.03,6,12), acc); ring.position.z = 0.42; head.add(ring);
    const drum = new T.Mesh(new T.SphereGeometry(0.19, 10, 8), skin?body:mat(0x3f424b)); head.add(drum);
    g.muzzle.set(0,0,0.52);
  }else if(type==='frost'){
    const pil = new T.Mesh(new T.CylinderGeometry(0.14,0.18,0.42,8), mat(0x9fc8e0)); pil.position.y = 0.49; pil.castShadow = true; g.add(pil);
    head.position.y = 0.95;
    const crystal = new T.Mesh(new T.OctahedronGeometry(0.26, 0), emissive(col, 0.7)); crystal.castShadow = true; head.add(crystal); g.spin = crystal;
    const fg = glowSprite(col, W.light?0.9:1.3, W.light?0.3:0.5); head.add(fg); g.glow = fg;
    for(let i=0;i<3;i++){ const s = new T.Mesh(new T.OctahedronGeometry(0.08,0), acc); s.position.set(Math.cos(i*2.1)*0.3, -0.15, Math.sin(i*2.1)*0.3); head.add(s); }
    g.muzzle.set(0,0,0.25);
  }else if(type==='tesla'){
    const coil = new T.Mesh(new T.CylinderGeometry(0.12,0.16,0.6,8), skin?body:mat(0x7a6cc2)); coil.position.y = 0.58; coil.castShadow = true; g.add(coil);
    for(let i=0;i<3;i++){ const r = new T.Mesh(new T.TorusGeometry(0.19,0.025,6,14), skin?acc:mat(0xc9b8ff)); r.rotation.x = Math.PI/2; r.position.y = 0.4+i*0.16; g.add(r); }
    head.position.y = 1.0;
    const orb = new T.Mesh(new T.SphereGeometry(0.2, 12, 10), emissive(accC, 0.9)); head.add(orb); g.spin = orb;
    const og = glowSprite(accC, W.light?1.0:1.5, W.light?0.35:0.6); head.add(og); g.glow = og;
    g.muzzle.set(0,0,0);
  }else if(type==='sniper'){
    const tower = new T.Mesh(new T.CylinderGeometry(0.15,0.22,0.9,8), skin?body:stoneD); tower.position.y = 0.73; tower.castShadow = true; g.add(tower);
    head.position.y = 1.25;
    const rail = new T.Mesh(new T.CylinderGeometry(0.05,0.06,0.9,8), skin?acc:body); rail.rotation.x = Math.PI/2; rail.position.z = 0.3; rail.castShadow = true; head.add(rail);
    const scope = new T.Mesh(new T.CylinderGeometry(0.05,0.05,0.2,8), acc); scope.rotation.x = Math.PI/2; scope.position.set(0,0.09,0.05); head.add(scope);
    const box = new T.Mesh(new T.BoxGeometry(0.26,0.2,0.3), mat(0x2b3240)); box.position.z = -0.08; head.add(box);
    g.muzzle.set(0,0,0.76);
  }else if(type==='laser'){
    const pil = new T.Mesh(new T.CylinderGeometry(0.16,0.2,0.7,8), skin?body:mat(0x4a3a5a)); pil.position.y = 0.63; pil.castShadow = true; g.add(pil);
    head.position.y = 1.08;
    const lens = new T.Mesh(new T.SphereGeometry(0.17, 10, 8), emissive(accC, 0.9)); head.add(lens); g.spin = lens;
    const lg = glowSprite(accC, W.light?0.9:1.2, W.light?0.3:0.5); head.add(lg); g.glow = lg;
    const housing = new T.Mesh(new T.TorusGeometry(0.2, 0.05, 8, 16), body); head.add(housing);
    for(const sx of [-1,1]){ const fin = new T.Mesh(new T.BoxGeometry(0.05,0.3,0.2), body); fin.position.set(sx*0.24, 0, -0.05); head.add(fin); }
    g.muzzle.set(0,0,0.2);
  }
  else if(type==='venom'){
    const pot = new T.Mesh(new T.CylinderGeometry(0.28,0.22,0.36,10,1,true), skin?body:mat(0x3a3f35)); pot.material.side = T.DoubleSide; pot.position.y = 0.46; pot.castShadow = true; g.add(pot);
    const brim = new T.Mesh(new T.TorusGeometry(0.28,0.04,6,14), skin?acc:mat(0x5a5f55)); brim.rotation.x = Math.PI/2; brim.position.y = 0.64; g.add(brim);
    const goo = new T.Mesh(new T.CircleGeometry(0.26, 14), emissive(accC, 0.9)); goo.rotation.x = -Math.PI/2; goo.position.y = 0.6; g.add(goo);
    const gg = glowSprite(accC, W.light?0.8:1.2, W.light?0.3:0.5); gg.position.y = 0.72; g.add(gg); g.glow = gg;
    for(let i=0;i<3;i++){ const b = new T.Mesh(new T.SphereGeometry(0.05+i*0.015, 6, 5), emissive(accC, 1)); b.position.set(Math.cos(i*2.1)*0.12, 0.66, Math.sin(i*2.1)*0.12); g.add(b); g.bubbles = (g.bubbles||[]).concat(b); }
    head.position.y = 0.78;
    const tube = new T.Mesh(new T.CylinderGeometry(0.05,0.07,0.42,8), skin?body:mat(0x4f7a3a)); tube.rotation.x = Math.PI/2.6; tube.position.set(0,0.08,0.14); head.add(tube);
    g.muzzle.set(0,0.2,0.32);
  }else if(type==='wind'){
    const post = new T.Mesh(new T.CylinderGeometry(0.1,0.16,0.8,8), skin?body:mat(0xdfe8e6)); post.position.y = 0.66; post.castShadow = true; g.add(post);
    head.position.y = 1.08;
    const hub = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), acc); hub.position.z = 0.1; head.add(hub);
    const fan = new T.Group(); fan.position.z = 0.16; head.add(fan);
    for(let i=0;i<4;i++){ const bl = new T.Mesh(new T.BoxGeometry(0.1, 0.42, 0.02), skin?body:mat(0xf4fbfa)); bl.position.y = 0.22; const arm = new T.Group(); arm.rotation.z = i*Math.PI/2; arm.add(bl); bl.rotation.y = 0.35; fan.add(arm); }
    const nose = new T.Mesh(new T.ConeGeometry(0.08,0.3,8), mat(0x7a8a88)); nose.rotation.x = -Math.PI/2; nose.position.z = -0.15; head.add(nose);
    g.fan = fan; g.muzzle.set(0,0,0.3);
  }else if(type==='bank'){
    const hall = new T.Mesh(new T.BoxGeometry(0.62,0.42,0.52), skin?body:mat(0xf1e6c8)); hall.position.y = 0.49; hall.castShadow = true; g.add(hall);
    for(const sx of [-0.22,0,0.22]){ const col = new T.Mesh(new T.CylinderGeometry(0.035,0.035,0.4,6), mat(0xffffff)); col.position.set(sx,0.49,0.28); g.add(col); }
    const roof = new T.Mesh(new T.ConeGeometry(0.46,0.24,4), skin?acc:mat(0xb88a3a)); roof.rotation.y = Math.PI/4; roof.position.y = 0.82; roof.castShadow = true; g.add(roof);
    head.position.y = 1.12;
    const coin = new T.Mesh(new T.CylinderGeometry(0.16,0.16,0.04,16), emissive(0xffc857, 0.7)); coin.rotation.x = Math.PI/2; head.add(coin); g.spin = coin;
    const cg = glowSprite(0xffd24a, W.light?0.8:1.2, W.light?0.3:0.5); head.add(cg); g.glow = cg;
    g.muzzle.set(0,0,0);
  }
  head.userData.z0 = 0;
  if(level>=4){
    const crown = new T.Mesh(new T.OctahedronGeometry(0.12,0), emissive(opts.rarity||0xffe27a, 1)); crown.position.y = 1.55; crown.scale.y = 1.6; g.add(crown); g.crown = crown;
    const cg2 = glowSprite(opts.rarity||0xffe27a, 1.1, 0.7); cg2.position.y = 1.55; g.add(cg2);
    const r4 = new T.Mesh(new T.TorusGeometry(0.52, 0.03, 6, 24), emissive(opts.rarity||0xffe27a, 0.8)); r4.rotation.x = Math.PI/2; r4.position.y = 0.2; g.add(r4); g.ring4 = r4;
  }
  if(opts.legendary){ const sp = glowSprite(0xffc857, 0.5, 0.8); sp.position.set(0.4, 0.5, 0); const orb = new T.Group(); orb.add(sp); g.add(orb); g.orbit = orb; }
  if(level>=2){ const r = new T.Mesh(new T.TorusGeometry(0.4, 0.035, 6, 18), gold); r.rotation.x = Math.PI/2; r.position.y = 0.3; g.add(r); }
  if(level>=3){
    const r = new T.Mesh(new T.TorusGeometry(0.46, 0.04, 6, 18), gold); r.rotation.x = Math.PI/2; r.position.y = 0.09; g.add(r);
    const pole = new T.Mesh(new T.CylinderGeometry(0.015,0.015,0.6,5), wood); pole.position.set(-0.36,0.55,-0.2); g.add(pole);
    const flag = new T.Mesh(new T.PlaneGeometry(0.26,0.16), new T.MeshLambertMaterial({color: branch===1 ? 0xff5a2e : accC, side:T.DoubleSide})); flag.position.set(-0.23,0.76,-0.2); g.add(flag);
    g.flag = flag;
  }
  return g;
};

// ---- enemies ----
W.makeEnemy = function(type, tint){
  const d = TD.ENEMIES[type], g = new T.Group(), s = d.size*1.2;
  const col = tint!=null ? tint : d.color;
  // each enemy owns its torso material so it can flash, tint and fade
  const bodyM = new T.MeshLambertMaterial({ color:col, transparent: !!(d.ghost||d.cloak), opacity: d.ghost ? 0.55 : 1 });
  const dark = mat(0x2a2430), skin = d.ghost ? bodyM : mat(0xf1c9a0);
  const torso = new T.Mesh(new T.SphereGeometry(s, 12, 10), bodyM); torso.scale.set(1,1.15,0.9); torso.position.y = s*1.35; torso.castShadow = !d.ghost; g.add(torso);
  const head = new T.Mesh(new T.SphereGeometry(s*0.62, 10, 8), type==='knight'?mat(0x6f7a8a):skin); head.position.y = s*2.65; head.castShadow = !d.ghost; g.add(head);
  for(const sx of [-1,1]){ const eye = new T.Mesh(new T.SphereGeometry(s*0.1, 6, 5), mat(type==='ghost'?0x2a1a5a:0x1a1620)); eye.position.set(sx*s*0.24, s*2.72, s*0.52); g.add(eye); }
  const legs = [];
  for(const sx of [-1,1]){ const l = new T.Mesh(new T.BoxGeometry(s*0.42, s*0.9, s*0.42), dark); l.position.set(sx*s*0.42, s*0.45, 0); g.add(l); legs.push(l); }
  g.legs = legs; g.torso = torso; g.head = head; g.baseY = 0; g.bodyM = bodyM; g.baseColor = new T.Color(col);
  if(type==='brute'){ const club = new T.Mesh(new T.CylinderGeometry(0.05,0.09,0.6,6), mat(0x5a3a1a)); club.position.set(s*1.1, s*1.6, 0.1); club.rotation.z = 0.5; g.add(club); }
  if(type==='knight'){ const helm = new T.Mesh(new T.ConeGeometry(s*0.5, s*0.6, 8), mat(0xb8c2d0)); helm.position.y = s*3.2; g.add(helm);
    const shield = new T.Mesh(new T.BoxGeometry(s*0.9, s*1.1, 0.05), mat(0x3b6fd6)); shield.position.set(-s*1.05, s*1.4, 0.05); g.add(shield); }
  if(type==='shield'){ const sh = new T.Mesh(new T.BoxGeometry(s*1.9, s*2.1, 0.06), emissive(0x7fb8ff, 0.35)); sh.position.set(0, s*1.5, s*0.75); g.add(sh); g.shieldMesh = sh; }
  if(type==='thief'){ const bag = new T.Mesh(new T.SphereGeometry(s*0.6, 8, 6), mat(0xd8b24a)); bag.position.set(-s*0.9, s*1.9, -s*0.2); g.add(bag);
    const mask = new T.Mesh(new T.BoxGeometry(s*1.1, s*0.3, s*0.2), dark); mask.position.set(0, s*2.72, s*0.5); g.add(mask); }
  if(type==='healer'){ const c1 = new T.Mesh(new T.BoxGeometry(s*0.9, s*0.25, s*0.2), emissive(0xffffff, 0.8)); c1.position.set(0, s*1.5, s*0.85); g.add(c1);
    const c2 = new T.Mesh(new T.BoxGeometry(s*0.25, s*0.9, s*0.2), emissive(0xffffff, 0.8)); c2.position.set(0, s*1.5, s*0.85); g.add(c2);
    const hg = glowSprite(0x52e07a, s*4, 0.45); hg.position.set(0, s*1.5, s*0.6); g.add(hg); }
  const auraRing = (color, R)=>{ const r = new T.Mesh(new T.RingGeometry(R*0.9, R, 36), new T.MeshBasicMaterial({ color, transparent:true, opacity:0.4, blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide })); r.rotation.x = -Math.PI/2; r.position.y = 0.05; g.add(r); g.aura = r; };
  if(type==='guardian'){ const dome = new T.Mesh(new T.SphereGeometry(s*0.7, 10, 6, 0, Math.PI*2, 0, Math.PI/2), emissive(0x7fe8ff, 0.4)); dome.position.y = s*2.7; g.add(dome);
    const sh = new T.Mesh(new T.CylinderGeometry(s*0.8, s*0.8, 0.06, 6), emissive(0x2ec4b6, 0.45)); sh.rotation.x = Math.PI/2; sh.position.set(0, s*1.45, s*0.8); g.add(sh); auraRing(0x5ff5e6, d.auraR); }
  if(type==='drummer'){ const drum = new T.Mesh(new T.CylinderGeometry(s*0.6, s*0.6, s*0.6, 10), mat(0xc8502a)); drum.rotation.x = Math.PI/2; drum.position.set(0, s*1.25, s*0.85); g.add(drum);
    const skinD = new T.Mesh(new T.CircleGeometry(s*0.58, 10), mat(0xf1e0c0)); skinD.position.set(0, s*1.25, s*1.16); g.add(skinD);
    for(const sx of [-1,1]){ const st = new T.Mesh(new T.CylinderGeometry(0.015,0.015,s*1.2,4), mat(0x5a3a1a)); st.position.set(sx*s*0.5, s*1.9, s*0.9); st.rotation.x = 0.7; g.add(st); g.sticks = (g.sticks||[]).concat(st); }
    auraRing(0xffa03c, d.auraR); }
  if(type==='shade'){ const hood = new T.Mesh(new T.ConeGeometry(s*0.8, s*1.3, 7), bodyM); hood.position.y = s*3.0; g.add(hood);
    for(const sx of [-1,1]){ const ey = new T.Mesh(new T.SphereGeometry(s*0.12, 6, 5), emissive(0xff4bd8, 1)); ey.position.set(sx*s*0.24, s*2.72, s*0.56); g.add(ey); } head.material = bodyM; }
  if(type==='saboteur'){ head.geometry = new T.BoxGeometry(s*1.1, s*0.95, s*1.0); head.material = mat(0x8a94a6);
    const ant = new T.Mesh(new T.CylinderGeometry(0.012,0.012,s*0.9,4), mat(0x2a2430)); ant.position.set(0, s*3.4, 0); g.add(ant);
    const tip = new T.Mesh(new T.SphereGeometry(s*0.14, 6, 5), emissive(0xff3c6a, 1)); tip.position.set(0, s*3.85, 0); g.add(tip);
    const tg = glowSprite(0xff3c6a, 0.6, 0.8); tg.position.copy(tip.position); g.add(tg); g.tip = tg;
    const visor = new T.Mesh(new T.BoxGeometry(s*0.9, s*0.2, 0.03), emissive(0xff3c6a, 1)); visor.position.set(0, s*2.7, s*0.52); g.add(visor); }
  if(type==='commander'){ const cape = new T.Mesh(new T.BoxGeometry(s*1.4, s*1.8, 0.04), mat(0x8a1f2e)); cape.position.set(0, s*1.6, -s*0.75); cape.rotation.x = 0.15; g.add(cape);
    const crown = new T.Mesh(new T.CylinderGeometry(s*0.42, s*0.36, s*0.3, 6, 1, true), emissive(0xffc857, 0.8)); crown.material.side = T.DoubleSide; crown.position.y = s*3.1; g.add(crown);
    const pole = new T.Mesh(new T.CylinderGeometry(0.015,0.015,s*4.5,5), mat(0x5a3a1a)); pole.position.set(s*0.9, s*2.3, -s*0.3); g.add(pole);
    const flag = new T.Mesh(new T.PlaneGeometry(s*1.3, s*0.8), new T.MeshLambertMaterial({ color:0xc8a040, emissive:0x5a3a00, emissiveIntensity:0.4, side:T.DoubleSide })); flag.position.set(s*1.55, s*4.1, -s*0.3); g.add(flag); g.flag = flag;
    const cg = glowSprite(0xffc857, s*6, 0.3); cg.position.y = s*1.5; g.add(cg); g.bossGlow = cg; }
  if(type==='mimic'){ head.visible = false;
    const box = new T.Mesh(new T.BoxGeometry(s*1.3, s*0.7, s*1.0), mat(0x8a5a2a)); box.position.y = s*2.45; g.add(box);
    const lid = new T.Mesh(new T.BoxGeometry(s*1.35, s*0.3, s*1.05), mat(0x6a4020)); lid.position.set(0, s*2.95, -s*0.1); lid.rotation.x = -0.45; g.add(lid); g.lid = lid;
    for(let i=0;i<4;i++){ const tooth = new T.Mesh(new T.ConeGeometry(s*0.08, s*0.2, 4), mat(0xffffff)); tooth.position.set(-s*0.45+i*s*0.3, s*2.78, s*0.45); tooth.rotation.x = Math.PI; g.add(tooth); }
    const eyeG = glowSprite(0xffe14b, s*1.6, 0.8); eyeG.position.set(0, s*2.6, s*0.5); g.add(eyeG); }
  if(type==='splitter' || type==='splitling'){ for(let i=0;i<3;i++){ const lump = new T.Mesh(new T.SphereGeometry(s*0.38, 8, 6), bodyM); lump.position.set(Math.cos(i*2.1)*s*0.75, s*1.7+Math.sin(i*1.3)*s*0.3, Math.sin(i*2.1)*s*0.6); g.add(lump); } }
  if(type==='carrier'){ const pack = new T.Mesh(new T.BoxGeometry(s*1.0, s*1.2, s*0.5), mat(0x2a3a6a)); pack.position.set(0, s*1.6, -s*0.8); g.add(pack);
    const emit = new T.Mesh(new T.SphereGeometry(s*0.3, 10, 8), emissive(0x7fb8ff, 1)); emit.position.set(0, s*2.5, -s*0.8); g.add(emit);
    const eg = glowSprite(0x7fb8ff, s*3, 0.6); eg.position.copy(emit.position); g.add(eg); g.tip = eg; auraRing(0x7fb8ff, d.auraR); }
  if(type==='blinker'){ for(let i=0;i<2;i++){ const r = new T.Mesh(new T.TorusGeometry(s*(0.9+i*0.3), 0.02, 6, 20), emissive(0x39d0ff, 1)); r.rotation.x = Math.PI/2; r.position.y = s*(1.2+i*0.9); g.add(r); g.rings = (g.rings||[]).concat(r); } }
  if(type==='swarmling'){ legs.forEach(l=>l.visible=false); g.baseY = 0.02; torso.scale.set(1.3,0.7,1.5);
    for(const sx of [-1,1]){ const w = new T.Mesh(new T.BoxGeometry(s*1.4, 0.02, s*0.7), new T.MeshBasicMaterial({ color:0xeaffc0, transparent:true, opacity:0.6 })); w.position.set(sx*s*0.9, s*1.9, 0); g.add(w); g.wings = (g.wings||[]).concat(w); } g.buzz = true; }
  if(type==='stalker'){ torso.scale.set(0.9,1.3,0.8); head.material = mat(0x1a1428);
    for(const sx of [-1,1]){ const horn = new T.Mesh(new T.ConeGeometry(s*0.12, s*0.6, 5), mat(0x3a2a4a)); horn.position.set(sx*s*0.35, s*3.1, 0); horn.rotation.z = -sx*0.4; g.add(horn);
      const ey = new T.Mesh(new T.SphereGeometry(s*0.1, 6, 5), emissive(0xff2a4a, 1)); ey.position.set(sx*s*0.22, s*2.72, s*0.54); g.add(ey); }
    const eg = glowSprite(0xff2a4a, s*2.4, 0.7); eg.position.set(0, s*2.72, s*0.6); g.add(eg); }
  if(type==='runner'){ const band = new T.Mesh(new T.TorusGeometry(s*0.62, 0.03, 6, 12), mat(0xff4b5c)); band.position.y = s*2.75; band.rotation.x = Math.PI/2; g.add(band); }
  if(type==='flyer'){
    g.baseY = 0.95; const wings = [];
    for(const sx of [-1,1]){ const w = new T.Mesh(new T.BoxGeometry(s*1.8, 0.03, s*0.8), mat(0xd8c6ff)); w.position.set(sx*s*1.1, s*1.6, 0); w.castShadow = true; g.add(w); wings.push(w); }
    g.wings = wings; legs.forEach(l=>l.visible=false);
  }
  if(type==='ghost'){ g.baseY = 0.15; legs.forEach(l=>l.visible=false); const tail = new T.Mesh(new T.ConeGeometry(s*0.8, s*1.2, 8), bodyM); tail.rotation.x = Math.PI; tail.position.y = s*0.5; g.add(tail); }
  if(type==='boss' || type==='miniboss'){
    for(const sx of [-1,1]){ const horn = new T.Mesh(new T.ConeGeometry(s*0.18, s*0.7, 6), mat(0xf4e3c0)); horn.position.set(sx*s*0.45, s*3.1, 0); horn.rotation.z = -sx*0.5; g.add(horn); }
    const eye = new T.Mesh(new T.SphereGeometry(s*0.12, 6, 6), emissive(0xffe14b, 1)); eye.position.set(0, s*2.7, s*0.55); g.add(eye);
    const eg = glowSprite(0xffe14b, s*2.2, 0.8); eg.position.copy(eye.position); g.add(eg);
    bodyM.emissive = new T.Color(col); bodyM.emissiveIntensity = 0.25;
    if(type==='boss'){ const aura = glowSprite(col, s*7, 0.35); aura.position.y = s*1.6; g.add(aura); g.bossGlow = aura;
      for(const sx of [-1,1]){ const pad = new T.Mesh(new T.DodecahedronGeometry(s*0.42,0), mat(0x3a3440)); pad.position.set(sx*s*0.95, s*2.0, 0); g.add(pad);
        const sp = new T.Mesh(new T.ConeGeometry(s*0.12, s*0.5, 5), emissive(col, 0.5)); sp.position.set(sx*s*0.95, s*2.45, 0); g.add(sp); } }
    if(type==='boss'){ const crown = new T.Mesh(new T.CylinderGeometry(s*0.5, s*0.42, s*0.3, 6, 1, true), emissive(0xffc857, 0.6)); crown.material.side = T.DoubleSide; crown.position.y = s*3.35; g.add(crown); }
  }
  // health bar: two thin boxes that always face the camera; the fill is anchored on the left
  const bar = new T.Group(); bar.position.y = s*3.5 + (type==='boss'?0.35:0.1);
  const bw = Math.max(0.5, s*2.4);
  const bg = new T.Mesh(new T.PlaneGeometry(bw, 0.09), new T.MeshBasicMaterial({color:0x14181f, depthTest:false, transparent:true, opacity:0.85})); bar.add(bg);
  const fillGeo = new T.PlaneGeometry(bw, 0.06); fillGeo.translate(bw/2, 0, 0.001);
  const fill = new T.Mesh(fillGeo, new T.MeshBasicMaterial({color:0x52e07a, depthTest:false, transparent:true})); fill.position.x = -bw/2; bar.add(fill);
  bg.renderOrder = 10; fill.renderOrder = 11;
  if(d.shield){ const sg = new T.PlaneGeometry(bw, 0.04); sg.translate(bw/2, 0, 0.002); const sf = new T.Mesh(sg, new T.MeshBasicMaterial({color:0x7fb8ff, depthTest:false, transparent:true})); sf.position.set(-bw/2, 0.07, 0); sf.renderOrder = 12; bar.add(sf); g.shieldFill = sf; }
  g.add(bar); g.bar = bar; g.fill = fill;
  return g;
};
W.animateEnemy = function(g, t, moving){
  const k = moving ? 1 : 0.2;
  if(g.legs && g.legs[0].visible){ g.legs[0].rotation.x = Math.sin(t*12)*0.7*k; g.legs[1].rotation.x = -Math.sin(t*12)*0.7*k; }
  g.torso.position.y = g.torso.userData.y0 || (g.torso.userData.y0 = g.torso.position.y);
  g.torso.position.y += Math.abs(Math.sin(t*12))*0.04*k;
  if(g.wings){ g.wings[0].rotation.z = Math.sin(t*(g.buzz?40:22))*0.55; g.wings[1].rotation.z = -Math.sin(t*(g.buzz?40:22))*0.55; g.position.y = g.baseY + Math.sin(t*3)*(g.buzz?0.02:0.08); }
  if(g.flag) g.flag.rotation.y = Math.sin(t*5)*0.3;
  if(g.lid) g.lid.rotation.x = -0.3 - Math.abs(Math.sin(t*4))*0.4;
  if(g.rings) g.rings.forEach((r,i)=>{ r.rotation.z = t*(3+i); r.position.y = r.userData.y0 || (r.userData.y0 = r.position.y); r.position.y += Math.sin(t*6+i)*0.03; });
  if(g.dome) g.dome.material.opacity = 0.22 + Math.sin(t*5)*0.06;
  if(g.baseY && !g.wings) g.position.y = g.baseY + Math.sin(t*2.5)*0.06;
  if(g.aura){ g.aura.rotation.z = t*1.5; g.aura.material.opacity = 0.28 + Math.sin(t*6)*0.12; }
  if(g.sticks){ g.sticks[0].rotation.x = 0.7 + Math.sin(t*16)*0.5; g.sticks[1].rotation.x = 0.7 - Math.sin(t*16)*0.5; }
  if(g.tip) g.tip.material.opacity = 0.5 + Math.sin(t*10)*0.4;
  g.bar.quaternion.copy(camera.quaternion);
};
// shield-carrier dome over an ordinary enemy
W.dome = function(g, on, size){
  if(on && !g.dome){ g.dome = new T.Mesh(new T.SphereGeometry((size||0.25)*3.2, 12, 8), new T.MeshLambertMaterial({ color:0x7fb8ff, emissive:0x4a7cff, emissiveIntensity:0.5, transparent:true, opacity:0.25, depthWrite:false })); g.dome.position.y = (size||0.25)*1.5; g.add(g.dome); }
  if(!on && g.dome){ g.remove(g.dome); g.dome = null; }
};
// sniper "mark for death" target reticle
W.mark = function(g, on){
  if(on && !g.markM){ g.markM = new T.Mesh(new T.RingGeometry(0.28, 0.34, 4), new T.MeshBasicMaterial({ color:0xff3c3c, transparent:true, opacity:0.9, depthTest:false, side:T.DoubleSide })); g.markM.renderOrder = 12; g.markM.position.y = 1.25; g.add(g.markM); }
  if(!on && g.markM){ g.remove(g.markM); g.markM = null; }
  if(g.markM){ g.markM.quaternion.copy(camera.quaternion); g.markM.rotateZ(performance.now()/300); }
};
// boss shield bubble
W.bubble = function(g, on){
  if(on && !g.bubble){ g.bubble = new T.Mesh(new T.SphereGeometry(TD.ENEMIES.boss.size*1.2*3.2, 16, 12), new T.MeshLambertMaterial({color:0x7fd4ff, emissive:0x7fd4ff, emissiveIntensity:0.4, transparent:true, opacity:0.32})); g.bubble.position.y = 0.9; g.add(g.bubble); }
  if(!on && g.bubble){ g.remove(g.bubble); g.bubble = null; }
};

// ---- projectiles ----
const projPool = { arrow:[], shell:[], ice:[], meteor:[], venom:[], bomblet:[] };
function projMesh(kind){
  const pool = projPool[kind];
  if(pool.length) { const m = pool.pop(); m.visible = true; return m; }
  let m;
  if(kind==='arrow') m = new T.Mesh(new T.BoxGeometry(0.05,0.05,0.38), emissive(0xffe6a0, 0.4));
  else if(kind==='shell') { m = new T.Mesh(new T.SphereGeometry(0.11, 8, 6), mat(0x23262c)); m.castShadow = true; }
  else if(kind==='meteor') { m = new T.Mesh(new T.DodecahedronGeometry(0.42, 0), emissive(0xff6a2c, 0.9)); }
  else if(kind==='venom') { m = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), emissive(0x9dff5a, 0.9)); }
  else if(kind==='bomblet') { m = new T.Mesh(new T.SphereGeometry(0.07, 6, 5), mat(0x2a2a2a)); }
  else m = new T.Mesh(new T.OctahedronGeometry(0.12, 0), emissive(0xbdf3ff, 0.9));
  const gc = { arrow:[0xffe6a0,0.55,0.5], shell:[0xff8c42,0.7,0.45], meteor:[0xff6a2c,3.2,0.9], venom:[0x9dff5a,0.9,0.7], bomblet:[0xffb347,0.5,0.5] }[kind] || [0xbdf3ff,0.9,0.8];
  const gl = glowSprite(gc[0], gc[1], gc[2]); m.add(gl); m.glow = gl;
  scene.add(m); return m;
}
W.projMesh = projMesh;
W.freeProj = function(kind, m){ m.visible = false; projPool[kind].push(m); };

// ---- laser beams: one persistent thin box per beam, updated every frame ----
W.makeBeam = function(color){
  const m = new T.Mesh(new T.BoxGeometry(0.06, 0.06, 1), new T.MeshBasicMaterial({ color, transparent:true, opacity:0.9, depthWrite:false }));
  m.visible = false; scene.add(m); return m;
};
W.setBeam = function(m, a, b, width){
  m.visible = true; m.position.lerpVectors(a, b, 0.5); m.lookAt(b); m.scale.set(width||1, width||1, a.distanceTo(b));
};

// ---- range ring + build ghost + target marker ----
let ring = null, ghost = null, marker = null;
W.showRing = function(x, z, r, ok){
  if(!ring){
    ring = new T.Group();
    ring.line = new T.Mesh(new T.RingGeometry(0.94, 1, 64), new T.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.75, depthWrite:false}));
    ring.disc = new T.Mesh(new T.CircleGeometry(0.94, 64), new T.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.13, depthWrite:false}));
    ring.line.rotation.x = ring.disc.rotation.x = -Math.PI/2; ring.add(ring.line, ring.disc); ring.position.y = 0.03; scene.add(ring);
  }
  ring.visible = true; ring.position.x = x; ring.position.z = z; ring.scale.set(r,r,r);
  const c = ok ? 0x7fd4ff : 0xff5252; ring.line.material.color.set(c); ring.disc.material.color.set(c);
};
W.hideRing = function(){ if(ring) ring.visible = false; };
W.showGhost = function(cx, cz, ok){
  if(!ghost){
    ghost = new T.Mesh(new T.CylinderGeometry(0.38, 0.44, 0.9, 12), new T.MeshLambertMaterial({color:0x7fd4ff, transparent:true, opacity:0.45}));
    ghost.position.y = 0.45; scene.add(ghost);
  }
  ghost.visible = true; ghost.position.x = cx+0.5; ghost.position.z = cz+0.5;
  ghost.material.color.set(ok ? 0x7fd4ff : 0xff5252);
};
W.hideGhost = function(){ if(ghost) ghost.visible = false; };
W.showMarker = function(x, z, r){
  if(!marker){ marker = new T.Mesh(new T.RingGeometry(0.85, 1, 48), new T.MeshBasicMaterial({color:0xff8c42, transparent:true, opacity:0.9, depthWrite:false})); marker.rotation.x = -Math.PI/2; marker.position.y = 0.04; scene.add(marker); }
  marker.visible = true; marker.position.x = x; marker.position.z = z; marker.scale.set(r,r,r);
};
W.hideMarker = function(){ if(marker) marker.visible = false; };

// ---- lightning / tracer beams: jagged thin boxes that fade out ----
const bolts = [];
W.bolt = function(a, b, color, thick, jag){
  const segs = jag ? 6 : 1, pts = [a.clone()];
  const dir = new T.Vector3().subVectors(b,a), L = dir.length(); dir.normalize();
  const side = new T.Vector3(-dir.z, 0, dir.x);
  for(let i=1;i<segs;i++){ const t=i/segs; pts.push(a.clone().addScaledVector(dir, L*t).addScaledVector(side, (Math.random()-0.5)*0.5).add(new T.Vector3(0,(Math.random()-0.5)*0.35,0))); }
  pts.push(b.clone());
  const m = new T.MeshBasicMaterial({color, transparent:true, opacity:1, depthWrite:false});
  const meshes = [];
  for(let i=0;i<pts.length-1;i++){
    const p = pts[i], q = pts[i+1], len = p.distanceTo(q);
    const mesh = new T.Mesh(new T.BoxGeometry(thick, thick, 1), m);
    mesh.position.lerpVectors(p, q, 0.5); mesh.lookAt(q); mesh.scale.z = len; scene.add(mesh); meshes.push(mesh);
  }
  bolts.push({ meshes, mat:m, life: jag?0.16:0.11, max: jag?0.16:0.11 });
};
function boltsTick(dt){
  for(let i=bolts.length-1;i>=0;i--){
    const b = bolts[i]; b.life -= dt; b.mat.opacity = Math.max(0, b.life/b.max);
    if(b.life<=0){ b.meshes.forEach(m=>{ scene.remove(m); m.geometry.dispose(); }); b.mat.dispose(); bolts.splice(i,1); }
  }
}

// ---- particles ----
const FX = { max: 2600, n: 0 };
function fxInit(){
  FX.pos = new Float32Array(FX.max*3); FX.col = new Float32Array(FX.max*3); FX.size = new Float32Array(FX.max); FX.alpha = new Float32Array(FX.max);
  FX.vel = new Float32Array(FX.max*3); FX.life = new Float32Array(FX.max); FX.maxLife = new Float32Array(FX.max); FX.grav = new Float32Array(FX.max); FX.size0 = new Float32Array(FX.max);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(FX.pos, 3).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('col', new T.BufferAttribute(FX.col, 3).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('size', new T.BufferAttribute(FX.size, 1).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('alpha', new T.BufferAttribute(FX.alpha, 1).setUsage(T.DynamicDrawUsage));
  const m = new T.ShaderMaterial({
    transparent:true, depthWrite:false, blending:T.AdditiveBlending,
    vertexShader:`attribute float size; attribute float alpha; attribute vec3 col; varying float vA; varying vec3 vC;
      void main(){ vA=alpha; vC=col; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*(220.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`varying float vA; varying vec3 vC; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); if(r>0.5) discard; float a=vA*(1.0-r*2.0); gl_FragColor=vec4(vC,a); }`
  });
  FX.points = new T.Points(geo, m); FX.points.frustumCulled = false; scene.add(FX.points);
  FX.geo = geo;
}
const _c = new T.Color();
W.burst = function(x,y,z, color, n, speed, life, size, grav, spread){
  _c.set(color);
  for(let k=0;k<n;k++){
    const i = FX.n < FX.max ? FX.n++ : Math.floor(Math.random()*FX.max);
    FX.pos[i*3]=x; FX.pos[i*3+1]=y; FX.pos[i*3+2]=z;
    const a = Math.random()*Math.PI*2, e = (Math.random()-0.3)*(spread==null?1.6:spread), sp = speed*(0.4+Math.random()*0.8);
    FX.vel[i*3]=Math.cos(a)*Math.cos(e)*sp; FX.vel[i*3+1]=Math.sin(e)*sp+speed*0.3; FX.vel[i*3+2]=Math.sin(a)*Math.cos(e)*sp;
    FX.life[i]=FX.maxLife[i]=life*(0.6+Math.random()*0.6); FX.size0[i]=size*(0.6+Math.random()*0.8); FX.grav[i]=grav||0;
    FX.col[i*3]=_c.r; FX.col[i*3+1]=_c.g; FX.col[i*3+2]=_c.b; FX.alpha[i]=1;
  }
};
function fxTick(dt){
  for(let i=0;i<FX.n;i++){
    if(FX.life[i]<=0) continue;
    FX.life[i]-=dt;
    if(FX.life[i]<=0){ FX.alpha[i]=0; FX.size[i]=0; continue; }
    FX.vel[i*3+1] -= FX.grav[i]*dt;
    FX.pos[i*3]+=FX.vel[i*3]*dt; FX.pos[i*3+1]+=FX.vel[i*3+1]*dt; FX.pos[i*3+2]+=FX.vel[i*3+2]*dt;
    if(FX.pos[i*3+1]<0.02){ FX.pos[i*3+1]=0.02; FX.vel[i*3+1]*=-0.3; FX.vel[i*3]*=0.7; FX.vel[i*3+2]*=0.7; }
    const f = FX.life[i]/FX.maxLife[i];
    FX.alpha[i]=Math.min(1,f*1.6); FX.size[i]=FX.size0[i]*(0.5+0.5*f);
  }
  let last = FX.n-1; while(last>=0 && FX.life[last]<=0) last--; FX.n = last+1;
  FX.geo.attributes.position.needsUpdate = FX.geo.attributes.col.needsUpdate = FX.geo.attributes.size.needsUpdate = FX.geo.attributes.alpha.needsUpdate = true;
  FX.geo.setDrawRange(0, FX.n);
}
W.fxReset = function(){ FX.n = 0; FX.geo.setDrawRange(0,0); };


// =================================================================
// ---- neon juice: glow sprites, shock rings, debris, fire, statuses
// =================================================================
function skyTexture(th){
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
  const base = new T.Color(th.sky), top = base.clone().lerp(new T.Color(th.skyTop!=null?th.skyTop:0xffffff), th.skyTop!=null?1:0.25), bot = base.clone().lerp(new T.Color(th.skyBot!=null?th.skyBot:0x000000), th.skyBot!=null?1:0.35);
  const gr = g.createLinearGradient(0,0,0,256); gr.addColorStop(0, '#'+top.getHexString()); gr.addColorStop(0.55, '#'+base.getHexString()); gr.addColorStop(1, '#'+bot.getHexString());
  g.fillStyle = gr; g.fillRect(0,0,4,256);
  const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
}
let glowTex = null;
function getGlowTex(){
  if(glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32,32,0,32,32,32); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(0.25,'rgba(255,255,255,.55)'); gr.addColorStop(0.6,'rgba(255,255,255,.12)'); gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0,0,64,64); glowTex = new T.CanvasTexture(c); return glowTex;
}
function glowSprite(color, size, opacity){
  const sp = new T.Sprite(new T.SpriteMaterial({ map:getGlowTex(), color, blending:T.AdditiveBlending, transparent:true, depthWrite:false, opacity: opacity==null?0.8:opacity }));
  sp.scale.set(size,size,1); sp.renderOrder = 5; return sp;
}
W.glowSprite = glowSprite;
const FL = [], RINGS = [], DEB = [], FIRES = [], PORT = [];
let ringGeo = null, debGeo = null;
function glowInit(){
  for(let i=0;i<90;i++){ const sp = glowSprite(0xffffff, 1, 1); sp.visible = false; sp.userData = { life:0, max:1, size:1 }; scene.add(sp); FL.push(sp); }
  ringGeo = new T.RingGeometry(0.82, 1, 40); debGeo = new T.TetrahedronGeometry(0.075, 0);
}
// a quick additive flash: muzzle flashes, impacts, explosions
W.flash = function(x,y,z,color,size,life){
  let sp = FL.find(f=>!f.visible); if(!sp){ sp = FL[Math.floor(Math.random()*FL.length)]; }
  sp.visible = true; sp.position.set(x,y,z); sp.material.color.set(color); sp.material.opacity = W.light ? 0.5 : 1; size = (size||1)*(W.light?0.6:1);
  sp.userData.life = sp.userData.max = life||0.18; sp.userData.size = size||1; sp.scale.set(size,size,1);
};
// expanding ground ring: explosions, stomps, freeze waves
W.shock = function(x,z,color,radius,life,y){
  let r = RINGS.find(o=>!o.visible);
  if(!r){ if(RINGS.length < 40){ r = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color, transparent:true, depthWrite:false, blending:T.AdditiveBlending, side:T.DoubleSide })); r.rotation.x = -Math.PI/2; scene.add(r); RINGS.push(r); } else r = RINGS[0]; }
  r.visible = true; r.position.set(x, y==null?0.06:y, z); r.material.color.set(color); r.material.opacity = 1; r.material.blending = W.light ? T.NormalBlending : T.AdditiveBlending;
  r.userData = { life:life||0.45, max:life||0.45, R:radius||1.5 }; r.scale.setScalar(0.1);
};
// low-poly shards that tumble and bounce
W.debris = function(x,y,z,color,n,speed){
  for(let k=0;k<n;k++){
    let d = DEB.find(o=>!o.visible);
    if(!d){ if(DEB.length < 160){ d = new T.Mesh(debGeo, mat(0xffffff)); d.castShadow = false; scene.add(d); DEB.push(d); } else break; }
    d.material = mat(color); d.visible = true; d.position.set(x,y,z);
    const a = Math.random()*Math.PI*2, sp = (speed||2.5)*(0.5+Math.random()*0.8);
    d.userData = { vx:Math.cos(a)*sp, vy:1.5+Math.random()*2.5*(speed||2.5)/2.5, vz:Math.sin(a)*sp, rx:(Math.random()-0.5)*14, rz:(Math.random()-0.5)*14, life:0.9+Math.random()*0.5 };
    d.scale.setScalar(0.7+Math.random()*1.1);
  }
};
// burning ground left by cannon shells
W.firePatch = function(x,z,r,color){
  let f = FIRES.find(o=>!o.visible);
  if(!f){ f = new T.Group();
    const disc = new T.Mesh(new T.CircleGeometry(1, 20), new T.MeshBasicMaterial({ color:0xff5a1a, transparent:true, opacity:0.55, depthWrite:false, blending:T.AdditiveBlending })); disc.rotation.x = -Math.PI/2; disc.position.y = 0.04; f.add(disc);
    const gl = glowSprite(0xff7a2a, 2.2, 0.55); gl.position.y = 0.35; f.add(gl); f.userData.disc = disc; f.userData.gl = gl; scene.add(f); FIRES.push(f); }
  f.visible = true; f.position.set(x, 0, z); f.scale.set(r, 1, r); f.userData.gl.scale.set(2.2*r, 2.2*r, 1); f.userData.t = Math.random()*6;
  f.userData.disc.material.color.set(color || 0xff5a1a); f.userData.gl.material.color.set(color ? color : 0xff7a2a);
  return f;
};
W.freeFire = function(f){ f.visible = false; };
// tower status overlays: ice block, lava melt, EMP sparks, stunned
W.towerStatus = function(g, kind){
  if(g.status){ g.remove(g.status); g.status = null; }
  if(!kind) return;
  const o = new T.Group();
  if(kind==='ice'){ const b = new T.Mesh(new T.BoxGeometry(0.85, 1.3, 0.85), new T.MeshLambertMaterial({ color:0xbdf3ff, emissive:0x7fd4ff, emissiveIntensity:0.35, transparent:true, opacity:0.55 })); b.position.y = 0.62; b.rotation.y = 0.4; o.add(b); }
  else if(kind==='melt'){ const b = new T.Mesh(new T.CylinderGeometry(0.5, 0.55, 0.22, 10), emissive(0xff5a1a, 0.9)); b.position.y = 0.12; o.add(b); const gl = glowSprite(0xff5a1a, 1.8, 0.8); gl.position.y = 0.6; o.add(gl); }
  else { const gl = glowSprite(kind==='emp'?0xff3c6a:0xffe14b, 1.4, 0.8); gl.position.y = 1.2; o.add(gl); o.userData.spark = gl;
    const ring = new T.Mesh(new T.TorusGeometry(0.3, 0.03, 6, 16), emissive(kind==='emp'?0xff3c6a:0xffe14b, 1)); ring.rotation.x = Math.PI/2; ring.position.y = 1.35; o.add(ring); o.userData.ring = ring; }
  g.add(o); g.status = o; g.statusKind = kind;
};
// max-level towers get a legendary halo at player level 25
W.legend = function(g, on){
  if(on && !g.halo){ const h = new T.Group();
    const r = new T.Mesh(new T.TorusGeometry(0.55, 0.025, 6, 30), new T.MeshBasicMaterial({ color:0xffe27a, transparent:true, opacity:0.9, blending:T.AdditiveBlending, depthWrite:false })); r.rotation.x = Math.PI/2; h.add(r);
    const gl = glowSprite(0xffd24a, 1.6, 0.35); gl.position.y = 0.2; h.add(gl); h.position.y = 0.08; g.add(h); g.halo = h; }
  if(!on && g.halo){ g.remove(g.halo); g.halo = null; }
};
// portal flash (Void Wraith, bosses, spawns)
W.portalFx = function(x,z,color){
  color = color||0xb07cff;
  W.shock(x,z,color,1.4,0.6,0.08); W.shock(x,z,0xffffff,0.8,0.35,0.1); W.flash(x,0.8,z,color,3.2,0.45);
  let p = PORT.find(o=>!o.visible);
  if(!p){ p = new T.Mesh(new T.TorusGeometry(0.55, 0.08, 8, 24), new T.MeshBasicMaterial({ color, transparent:true, blending:T.AdditiveBlending, depthWrite:false })); scene.add(p); PORT.push(p); }
  p.visible = true; p.material.color.set(color); p.position.set(x, 0.7, z); p.userData = { life:1.2, max:1.2 }; p.lookAt(camera.position);
};
// short FOV punch for big hits
W.punch = function(a){ W.punchAmt = Math.min(1, (W.punchAmt||0) + a); };
// thin persistent link (crystal -> tower, healer -> patient)
W.makeLink = function(color){ const m = new T.Mesh(new T.BoxGeometry(0.035, 0.035, 1), new T.MeshBasicMaterial({ color, transparent:true, opacity:0.65, blending:T.AdditiveBlending, depthWrite:false })); m.visible = false; scene.add(m); return m; };

// ---- map objects: trees you can clear, rocks, power crystals ----
W.makeObject = function(type){
  const th = theme || TD.THEMES.grass, g = new T.Group();
  if(type==='tree'){
    const neonish = th.stars || curMap && curMap.theme==='neon';
    if(neonish){ const c = new T.Mesh(new T.OctahedronGeometry(0.3,0), emissive(th.tree, 0.55)); c.scale.set(0.8,1.9,0.8); c.position.y = 0.55; c.castShadow = true; g.add(c);
      const c2 = c.clone(); c2.scale.set(0.5,1.1,0.5); c2.position.set(0.22,0.35,0.12); g.add(c2); }
    else { const tr = new T.Mesh(new T.CylinderGeometry(0.08,0.11,0.4,6), mat(th.trunk)); tr.position.y = 0.2; tr.castShadow = true; g.add(tr);
      for(let i=0;i<3;i++){ const c = new T.Mesh(new T.ConeGeometry(0.42-i*0.09, 0.55, 7), mat(th.tree)); c.position.y = 0.55+i*0.28; c.castShadow = true; g.add(c); }
      if(curMap && curMap.theme==='snow'){ const cap = new T.Mesh(new T.ConeGeometry(0.18,0.25,7), mat(0xf4f8fc)); cap.position.y = 1.2; g.add(cap); } }
  }else if(type==='ruin'){
    const st = mat(0x9a948a), st2 = mat(0x7a756c), moss = mat(th.tree);
    const base = new T.Mesh(new T.CylinderGeometry(0.36,0.42,0.3,8), st); base.position.y = 0.15; base.castShadow = true; g.add(base);
    const wall = new T.Mesh(new T.CylinderGeometry(0.3,0.34,0.55,8,1,true, 0, Math.PI*1.3), st2); wall.material.side = T.DoubleSide; wall.position.y = 0.55; wall.castShadow = true; g.add(wall);
    for(let i=0;i<4;i++){ const b = new T.Mesh(new T.BoxGeometry(0.16,0.12,0.12), st); b.position.set(Math.cos(i*1.7)*0.45, 0.06, Math.sin(i*1.7)*0.45); b.rotation.y = i; g.add(b); }
    const m1 = new T.Mesh(new T.SphereGeometry(0.12, 6, 4), moss); m1.position.set(0.2,0.32,0.18); m1.scale.y = 0.5; g.add(m1);
  }else if(type==='rock'){
    const r = new T.Mesh(new T.DodecahedronGeometry(0.36,0), mat(th.rock)); r.position.y = 0.22; r.scale.set(1.1,0.8,1); r.rotation.set(0.3,0.7,0.1); r.castShadow = true; g.add(r);
    const r2 = new T.Mesh(new T.DodecahedronGeometry(0.2,0), mat(th.rock)); r2.position.set(0.28,0.12,0.2); r2.castShadow = true; g.add(r2);
  }else{
    const col = type==='energy' ? 0xb07cff : 0x7fe8ff, col2 = type==='energy' ? 0x7fffe6 : 0xffffff;
    const base = new T.Mesh(new T.CylinderGeometry(0.34,0.4,0.14,6), mat(0x4a4f5c)); base.position.y = 0.07; g.add(base);
    const c = new T.Mesh(new T.OctahedronGeometry(0.26,0), emissive(col, 1.0)); c.scale.set(1,1.8,1); c.position.y = 0.72; c.castShadow = true; g.add(c); g.userData.spin = c;
    for(let i=0;i<3;i++){ const s = new T.Mesh(new T.OctahedronGeometry(0.1,0), emissive(col2, 0.9)); s.position.set(Math.cos(i*2.1)*0.28, 0.3, Math.sin(i*2.1)*0.28); s.scale.y = 1.8; g.add(s); }
    const gl = glowSprite(col, 2.0, 0.7); gl.position.y = 0.72; g.add(gl); g.userData.glow = gl;
    const ring = new T.Mesh(new T.RingGeometry(1.25, 1.35, 4, 1), new T.MeshBasicMaterial({ color:col, transparent:true, opacity:0.35, depthWrite:false, blending:T.AdditiveBlending })); ring.rotation.x = -Math.PI/2; ring.rotation.z = Math.PI/4; ring.position.y = 0.035; ring.scale.setScalar(1.07); g.add(ring); g.userData.ring = ring;
  }
  scene.add(g); return g;
};
W.removeObject = function(g){ scene.remove(g); };

// ---- hero, crates, secrets, runes, tornadoes ----
W.makeHero = function(){
  const g = new T.Group(), s = 0.3;
  const armor = mat(0xc8d0dc), dark = mat(0x3a4250), gold = emissive(0xffc857, 0.5);
  const legs = [];
  for(const sx of [-1,1]){ const l = new T.Mesh(new T.BoxGeometry(s*0.38, s*0.9, s*0.38), dark); l.position.set(sx*s*0.3, s*0.45, 0); l.castShadow = true; g.add(l); legs.push(l); }
  const body = new T.Mesh(new T.BoxGeometry(s*1.1, s*1.1, s*0.7), armor); body.position.y = s*1.45; body.castShadow = true; g.add(body);
  const belt = new T.Mesh(new T.BoxGeometry(s*1.15, s*0.15, s*0.75), gold); belt.position.y = s*1.0; g.add(belt);
  const head = new T.Mesh(new T.BoxGeometry(s*0.7, s*0.7, s*0.7), armor); head.position.y = s*2.35; head.castShadow = true; g.add(head);
  const visor = new T.Mesh(new T.BoxGeometry(s*0.5, s*0.1, s*0.05), emissive(0x7fd4ff, 1)); visor.position.set(0, s*2.38, s*0.36); g.add(visor);
  const plume = new T.Mesh(new T.ConeGeometry(s*0.15, s*0.7, 6), mat(0xd8323c)); plume.position.set(0, s*2.95, -s*0.1); plume.rotation.x = -0.4; g.add(plume);
  const cape = new T.Mesh(new T.BoxGeometry(s*1.0, s*1.4, 0.03), mat(0x2a5bd8)); cape.position.set(0, s*1.35, -s*0.4); cape.rotation.x = 0.18; g.add(cape); g.cape = cape;
  const shield = new T.Mesh(new T.CylinderGeometry(s*0.5, s*0.5, 0.05, 8), mat(0x2a5bd8)); shield.rotation.z = Math.PI/2; shield.position.set(-s*0.72, s*1.45, s*0.1); g.add(shield);
  const boss = new T.Mesh(new T.SphereGeometry(s*0.14, 6, 5), gold); boss.position.set(-s*0.76, s*1.45, s*0.1); g.add(boss);
  const arm = new T.Group(); arm.position.set(s*0.7, s*1.8, 0); g.add(arm);
  const blade = new T.Mesh(new T.BoxGeometry(0.05, s*2.2, 0.02), emissive(0xbdf3ff, 0.8)); blade.position.y = -s*0.2+s*1.1; arm.add(blade);
  const hilt = new T.Mesh(new T.BoxGeometry(s*0.5, 0.04, 0.05), gold); hilt.position.y = -s*0.2; arm.add(hilt);
  const sg = glowSprite(0x9ff0ff, 0.7, 0.6); sg.position.y = s*1.2; arm.add(sg);
  arm.rotation.x = 0.6; g.arm = arm; g.legs = legs;
  const ring = new T.Mesh(new T.RingGeometry(0.34, 0.4, 32), new T.MeshBasicMaterial({ color:0xffc857, transparent:true, opacity:0.8, depthWrite:false, blending:T.AdditiveBlending })); ring.rotation.x = -Math.PI/2; ring.position.y = 0.03; g.add(ring); g.ring = ring;
  const aura = new T.Mesh(new T.RingGeometry(0.95, 1, 48), new T.MeshBasicMaterial({ color:0xffc857, transparent:true, opacity:0.25, depthWrite:false, side:T.DoubleSide })); aura.rotation.x = -Math.PI/2; aura.position.y = 0.025; g.add(aura); g.aura = aura;
  const bar = new T.Group(); bar.position.y = s*3.6;
  const bg = new T.Mesh(new T.PlaneGeometry(0.6, 0.08), new T.MeshBasicMaterial({color:0x14181f, depthTest:false, transparent:true, opacity:0.85})); bar.add(bg);
  const fg = new T.PlaneGeometry(0.6, 0.055); fg.translate(0.3, 0, 0.001); const fill = new T.Mesh(fg, new T.MeshBasicMaterial({color:0xffc857, depthTest:false, transparent:true})); fill.position.x = -0.3; bar.add(fill);
  bg.renderOrder = 10; fill.renderOrder = 11; g.add(bar); g.bar = bar; g.fill = fill;
  scene.add(g); return g;
};
W.animateHero = function(g, t, moving, swing){
  const k = moving ? 1 : 0.15;
  g.legs[0].rotation.x = Math.sin(t*11)*0.8*k; g.legs[1].rotation.x = -Math.sin(t*11)*0.8*k;
  g.arm.rotation.x = 0.6 - swing*2.2; g.cape.rotation.x = 0.18 + (moving?0.25:0) + Math.sin(t*6)*0.05;
  g.aura.scale.setScalar(TD.HERO.aura); g.aura.rotation.z = t*0.5; g.ring.material.opacity = 0.6 + Math.sin(t*4)*0.25;
  g.bar.quaternion.copy(camera.quaternion);
};
W.makeCrate = function(){
  const g = new T.Group();
  const box = new T.Mesh(new T.BoxGeometry(0.42,0.36,0.42), mat(0xa0703a)); box.position.y = 0.18; box.castShadow = true; g.add(box);
  for(const r of [0, Math.PI/2]){ const band = new T.Mesh(new T.BoxGeometry(0.44,0.06,0.06), emissive(0xffc857, 0.6)); band.position.y = 0.2; band.rotation.y = r; g.add(band); }
  const chute = new T.Mesh(new T.SphereGeometry(0.55, 10, 6, 0, Math.PI*2, 0, Math.PI/2), new T.MeshLambertMaterial({ color:0xff5a5a, side:T.DoubleSide })); chute.position.y = 1.2; g.add(chute); g.chute = chute;
  const gl = glowSprite(0xffc857, 1.2, 0.6); gl.position.y = 0.3; g.add(gl);
  scene.add(g); return g;
};
W.makeSparkle = function(){
  const g = new T.Group(); const sp = glowSprite(0xfff4c0, 0.5, 0.9); sp.position.y = 0.25; g.add(sp); g.sp = sp;
  const cross = new T.Mesh(new T.PlaneGeometry(0.5, 0.06), new T.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.8, blending:T.AdditiveBlending, depthWrite:false }));
  const c2 = cross.clone(); c2.rotation.z = Math.PI/2; const star = new T.Group(); star.add(cross, c2); star.position.y = 0.25; g.add(star); g.star = star;
  scene.add(g); SPARK.push(g); return g;
};
W.makeRuneTile = function(){
  const g = new T.Group();
  const ring = new T.Mesh(new T.RingGeometry(0.34, 0.44, 6), new T.MeshBasicMaterial({ color:0xb07cff, transparent:true, opacity:0.8, blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide })); ring.rotation.x = -Math.PI/2; ring.position.y = 0.02; g.add(ring);
  const inner = new T.Mesh(new T.CircleGeometry(0.3, 6), new T.MeshBasicMaterial({ color:0x7a4cff, transparent:true, opacity:0.35, blending:T.AdditiveBlending, depthWrite:false })); inner.rotation.x = -Math.PI/2; inner.position.y = 0.021; g.add(inner);
  const gl = glowSprite(0xb07cff, 1.3, 0.5); gl.position.y = 0.2; g.add(gl); g.ring = ring;
  scene.add(g); SPARK.push(g); return g;
};
W.makeTornado = function(){
  const g = new T.Group();
  for(let i=0;i<5;i++){ const r = new T.Mesh(new T.TorusGeometry(0.12+i*0.09, 0.03, 6, 16), new T.MeshBasicMaterial({ color:0xe8fffb, transparent:true, opacity:0.55, depthWrite:false })); r.rotation.x = Math.PI/2; r.position.y = 0.15+i*0.2; g.add(r); }
  scene.add(g); return g;
};
const SPARK = [];
W.removeSpark = function(g){ scene.remove(g); const i = SPARK.indexOf(g); if(i>=0) SPARK.splice(i,1); };

function juiceTick(dt, t){
  for(const g of SPARK){ if(g.star){ const k = Math.max(0, Math.sin(t*2.2 + g.position.x*3)); g.star.scale.setScalar(0.2 + k*1.1); g.star.rotation.z = t; g.star.quaternion.copy(camera.quaternion); g.star.rotateZ(t); g.sp.material.opacity = 0.25 + k*0.7; }
    else if(g.ring){ g.ring.rotation.z = t*0.8; } }
  for(const sp of FL){ if(!sp.visible) continue; const u = sp.userData; u.life -= dt; if(u.life<=0){ sp.visible = false; continue; } const k = u.life/u.max; sp.material.opacity = k*(W.light?0.5:1); const s = u.size*(0.6+0.6*(1-k)); sp.scale.set(s,s,1); }
  for(const r of RINGS){ if(!r.visible) continue; const u = r.userData; u.life -= dt; if(u.life<=0){ r.visible = false; continue; } const k = 1-u.life/u.max; r.scale.setScalar(0.1 + u.R*(1-Math.pow(1-k,3))); r.material.opacity = (1-k)*(W.light?0.75:1); }
  for(const d of DEB){ if(!d.visible) continue; const u = d.userData; u.life -= dt; if(u.life<=0){ d.visible = false; continue; }
    u.vy -= 9*dt; d.position.x += u.vx*dt; d.position.y += u.vy*dt; d.position.z += u.vz*dt; d.rotation.x += u.rx*dt; d.rotation.z += u.rz*dt;
    if(d.position.y < 0.05){ d.position.y = 0.05; u.vy *= -0.35; u.vx *= 0.6; u.vz *= 0.6; u.rx *= 0.5; u.rz *= 0.5; }
    if(u.life < 0.3) d.scale.multiplyScalar(0.9); }
  for(const f of FIRES){ if(!f.visible) continue; f.userData.t += dt; f.userData.disc.material.opacity = 0.4 + Math.sin(f.userData.t*11)*0.12; f.userData.gl.material.opacity = 0.45 + Math.sin(f.userData.t*7)*0.15; }
  for(const p of PORT){ if(!p.visible) continue; p.userData.life -= dt; if(p.userData.life<=0){ p.visible = false; continue; } const k = p.userData.life/p.userData.max; p.scale.setScalar(Math.sin(Math.min(1,(1-k)*4)*Math.PI/2) * (0.6+k*0.6)); p.material.opacity = Math.min(1, k*2); p.rotation.z += dt*6; }
}

// ---- per-frame ----
W.tick = function(dt, t){
  fxTick(dt); boltsTick(dt); juiceTick(dt, t);
  if(curMap){
    if(curMap.floaters) for(const o of curMap.floaters){ o.position.y = o.userData.y0 + Math.sin(t*0.6+o.userData.ph)*0.25; o.rotation.y += dt*0.05; }
    if(curMap.gate && curMap.gate.userData.glow) curMap.gate.userData.glow.material.opacity = 0.55+Math.sin(t*4)*0.2;
    if(curMap.castle) curMap.castle.userData.flag.rotation.y = Math.sin(t*4)*0.25;
    if(curMap.gate) curMap.gate.userData.disc.material.emissiveIntensity = 0.7+Math.sin(t*5)*0.25;
    if(curMap.lavaMeshes) for(const p of curMap.lavaMeshes){ p.material.emissiveIntensity = 0.55+Math.sin(t*3+p.position.x)*0.35; if(p.userData.glow) p.userData.glow.material.opacity = 0.45+Math.sin(t*3+p.position.x)*0.25; }
  }
  if(W.shakeAmt > 0){ W.shakeAmt = Math.max(0, W.shakeAmt - dt*1.6); }
};
W.render = function(){
  if(W.punchAmt > 0){ W.punchAmt = Math.max(0, W.punchAmt - 0.05); camera.fov = 42 - W.punchAmt*2.2; camera.updateProjectionMatrix(); }
  else if(camera.fov !== 42){ camera.fov = 42; camera.updateProjectionMatrix(); }
  if(W.shakeAmt > 0 && W.basePos){
    const a = W.shakeAmt*0.35;
    camera.position.copy(W.basePos).add(new T.Vector3((Math.random()-0.5)*a, (Math.random()-0.5)*a*0.6, (Math.random()-0.5)*a));
  } else if(W.basePos) camera.position.copy(W.basePos);
  renderer.render(scene, camera);
};
W.add = o => scene.add(o); W.remove = o => scene.remove(o);
})();

'use strict';
// ===================================================================
// Tower Defense 3D — the Three.js side: scene, map, meshes, effects
// ===================================================================
(function(){
const W = {};
TD.W = W;

// three.min.js is a deferred script ahead of this one, so THREE exists at parse time
let T = window.THREE, renderer, scene, camera, mount, sun, hemi, ground;
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
  sun.castShadow = true;
  const sm = navigator.maxTouchPoints>0 ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  W.renderer = renderer; W.scene = scene; W.camera = camera;
  fxInit();
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
  scene.background = new T.Color(theme.sky);
  hemi.color.set(theme.hemi); sun.color.set(theme.sun);
  hemi.intensity = map.theme==='space' ? 0.55 : (map.theme==='lava' ? 0.6 : 0.75);
  sun.position.set(map.w/2 - 6, 14, map.h/2 + 5); sun.target.position.set(map.w/2, 0, map.h/2);

  const pathSet = new Set();
  const P = map.path;
  for(let i=0;i<P.length-1;i++){
    const [x0,z0]=P[i], [x1,z1]=P[i+1];
    const dx=Math.sign(x1-x0), dz=Math.sign(z1-z0);
    let x=x0, z=z0; pathSet.add(x+','+z);
    while(x!==x1 || z!==z1){ x+=dx; z+=dz; pathSet.add(x+','+z); }
  }
  map.pathSet = pathSet;
  const route = P.map(([x,z])=>new T.Vector3(x+0.5, 0, z+0.5));
  const ext = (a,b)=>a.clone().sub(b).normalize().multiplyScalar(2.2).add(a);
  route[0] = ext(route[0], route[1]); route[route.length-1] = ext(route[route.length-1], route[route.length-2]);
  map.route = route;
  const airPts = map.air.map(([x,z])=>new T.Vector3(x+0.5, 0, z+0.5));
  airPts[0] = ext(airPts[0], airPts[1]); airPts[airPts.length-1] = ext(airPts[airPts.length-1], airPts[airPts.length-2]);
  map.airRoute = airPts;

  // ground texture
  const RIM = 2, cs = 64;
  const gw = map.w + RIM*2, gh = map.h + RIM*2;
  const cv = document.createElement('canvas'); cv.width = gw*cs; cv.height = gh*cs;
  const g = cv.getContext('2d');
  g.fillStyle = theme.ground; g.fillRect(0,0,cv.width,cv.height);
  let seed = 12345 + map.id.length*77;
  const rnd = ()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };
  for(let i=0;i<260;i++){
    g.fillStyle = i%2 ? theme.ground2 : theme.rim; g.globalAlpha = 0.18+rnd()*0.2;
    const r = 18+rnd()*46; g.beginPath(); g.ellipse(rnd()*cv.width, rnd()*cv.height, r, r*(0.6+rnd()*0.6), rnd()*3, 0, Math.PI*2); g.fill();
  }
  g.globalAlpha = 1;
  g.strokeStyle = map.theme==='space'||map.theme==='lava' ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.10)'; g.lineWidth = 2;
  for(let x=0;x<=map.w;x++){ g.beginPath(); g.moveTo((x+RIM)*cs, RIM*cs); g.lineTo((x+RIM)*cs, (map.h+RIM)*cs); g.stroke(); }
  for(let z=0;z<=map.h;z++){ g.beginPath(); g.moveTo(RIM*cs, (z+RIM)*cs); g.lineTo((map.w+RIM)*cs, (z+RIM)*cs); g.stroke(); }
  const rp = route.map(v=>[(v.x+RIM)*cs, (v.z+RIM)*cs]);
  g.lineJoin = 'round'; g.lineCap = 'butt';
  g.strokeStyle = theme.edge; g.lineWidth = cs*0.86; g.beginPath(); rp.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1])); g.stroke();
  g.strokeStyle = theme.path; g.lineWidth = cs*0.72; g.beginPath(); rp.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1])); g.stroke();
  g.globalAlpha = 0.22; g.fillStyle = theme.edge;
  for(let i=0;i<rp.length-1;i++){
    const [x0,y0]=rp[i],[x1,y1]=rp[i+1]; const L=Math.hypot(x1-x0,y1-y0); const n=Math.floor(L/14);
    for(let k=0;k<n;k++){ const t=k/n; const px=x0+(x1-x0)*t+(rnd()-0.5)*cs*0.5, py=y0+(y1-y0)*t+(rnd()-0.5)*cs*0.5; g.beginPath(); g.arc(px,py,2+rnd()*3,0,Math.PI*2); g.fill(); }
  }
  g.globalAlpha = 1;
  if(map.theme==='lava'){ // glowing cracks
    g.strokeStyle = 'rgba(255,90,26,.55)'; g.lineWidth = 3;
    for(let i=0;i<40;i++){ let x=rnd()*cv.width, y=rnd()*cv.height; g.beginPath(); g.moveTo(x,y); for(let k=0;k<5;k++){ x+=(rnd()-0.5)*60; y+=(rnd()-0.5)*60; g.lineTo(x,y); } g.stroke(); }
  }
  const tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
  ground = new T.Mesh(new T.PlaneGeometry(gw, gh), new T.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI/2; ground.position.set(map.w/2, 0, map.h/2); ground.receiveShadow = true;
  mapGroup.add(ground);
  const cliff = new T.Mesh(new T.BoxGeometry(gw, 1.4, gh), mat(theme.side));
  cliff.position.set(map.w/2, -0.72, map.h/2); mapGroup.add(cliff);
  const cliff2 = new T.Mesh(new T.BoxGeometry(gw-1.2, 1.2, gh-1.2), mat(theme.side));
  cliff2.position.set(map.w/2, -1.9, map.h/2); mapGroup.add(cliff2);

  // props on the rim
  const treeGeo = new T.ConeGeometry(0.34, 0.9, 7), trunkGeo = new T.CylinderGeometry(0.07,0.09,0.32,6);
  const rockGeo = new T.DodecahedronGeometry(0.28, 0);
  const treeMat = map.theme==='space' ? emissive(theme.tree, 0.5) : mat(theme.tree), trunkMat = mat(theme.trunk), rockMat = mat(theme.rock), snowMat = mat(0xf4f8fc);
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
      if(map.theme==='space'){ // crystals
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
  // stars in space
  if(theme.stars){
    const n = 600, pos = new Float32Array(n*3);
    for(let i=0;i<n;i++){ const a = rnd()*Math.PI*2, e = rnd()*1.2-0.1; const R = 60+rnd()*30; pos[i*3]=map.w/2+Math.cos(a)*Math.cos(e)*R; pos[i*3+1]=Math.sin(e)*R-10; pos[i*3+2]=map.h/2+Math.sin(a)*Math.cos(e)*R; }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos,3));
    const st = new T.Points(geo, new T.PointsMaterial({ color:0xffffff, size:0.35, sizeAttenuation:true })); mapGroup.add(st);
  }

  // castle at the end of the road, portal at the start
  const last = P[P.length-1];
  const castle = makeCastle(); castle.position.set(last[0]+0.5, 0, last[1]+0.5);
  const dirOut = new T.Vector3().subVectors(route[route.length-1], route[route.length-2]).normalize();
  castle.position.addScaledVector(dirOut, 1.15); castle.lookAt(castle.position.clone().sub(dirOut));
  mapGroup.add(castle); map.castle = castle;
  const gate = makeGate(); gate.position.copy(route[1]).addScaledVector(new T.Vector3().subVectors(route[0],route[1]).normalize(), 1.15);
  gate.lookAt(route[1].clone().setY(0)); mapGroup.add(gate); map.gate = gate;

  W.frame();
};

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
W.makeTower = function(type, level, skin, branch){
  const d = TD.TOWERS[type], g = new T.Group();
  const col = skin ? skin.color : d.color, accC = skin ? skin.accent : d.accent, trimC = skin ? skin.trim : 0xffc857;
  const stone = mat(0xa9a59b), stoneD = mat(0x7f7b72), wood = mat(0x8a5a2b), gold = emissive(trimC, 0.35);
  const base = new T.Mesh(new T.CylinderGeometry(0.36, 0.42, 0.28, 12), stone); base.position.y = 0.14; base.castShadow = true; g.add(base);
  const step = new T.Mesh(new T.CylinderGeometry(0.44, 0.48, 0.08, 12), stoneD); step.position.y = 0.04; g.add(step);
  const head = new T.Group(); g.add(head); g.head = head; g.muzzle = new T.Vector3(0, 0.2, 0.32);
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
    for(let i=0;i<3;i++){ const s = new T.Mesh(new T.OctahedronGeometry(0.08,0), acc); s.position.set(Math.cos(i*2.1)*0.3, -0.15, Math.sin(i*2.1)*0.3); head.add(s); }
    g.muzzle.set(0,0,0.25);
  }else if(type==='tesla'){
    const coil = new T.Mesh(new T.CylinderGeometry(0.12,0.16,0.6,8), skin?body:mat(0x7a6cc2)); coil.position.y = 0.58; coil.castShadow = true; g.add(coil);
    for(let i=0;i<3;i++){ const r = new T.Mesh(new T.TorusGeometry(0.19,0.025,6,14), skin?acc:mat(0xc9b8ff)); r.rotation.x = Math.PI/2; r.position.y = 0.4+i*0.16; g.add(r); }
    head.position.y = 1.0;
    const orb = new T.Mesh(new T.SphereGeometry(0.2, 12, 10), emissive(accC, 0.9)); head.add(orb); g.spin = orb;
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
    const housing = new T.Mesh(new T.TorusGeometry(0.2, 0.05, 8, 16), body); head.add(housing);
    for(const sx of [-1,1]){ const fin = new T.Mesh(new T.BoxGeometry(0.05,0.3,0.2), body); fin.position.set(sx*0.24, 0, -0.05); head.add(fin); }
    g.muzzle.set(0,0,0.2);
  }
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
W.makeEnemy = function(type){
  const d = TD.ENEMIES[type], g = new T.Group(), s = d.size*1.2;
  // each enemy owns its torso material so it can flash, tint and fade
  const bodyM = new T.MeshLambertMaterial({ color:d.color, transparent: !!d.ghost, opacity: d.ghost ? 0.55 : 1 });
  const dark = mat(0x2a2430), skin = d.ghost ? bodyM : mat(0xf1c9a0);
  const torso = new T.Mesh(new T.SphereGeometry(s, 12, 10), bodyM); torso.scale.set(1,1.15,0.9); torso.position.y = s*1.35; torso.castShadow = !d.ghost; g.add(torso);
  const head = new T.Mesh(new T.SphereGeometry(s*0.62, 10, 8), type==='knight'?mat(0x6f7a8a):skin); head.position.y = s*2.65; head.castShadow = !d.ghost; g.add(head);
  for(const sx of [-1,1]){ const eye = new T.Mesh(new T.SphereGeometry(s*0.1, 6, 5), mat(type==='ghost'?0x2a1a5a:0x1a1620)); eye.position.set(sx*s*0.24, s*2.72, s*0.52); g.add(eye); }
  const legs = [];
  for(const sx of [-1,1]){ const l = new T.Mesh(new T.BoxGeometry(s*0.42, s*0.9, s*0.42), dark); l.position.set(sx*s*0.42, s*0.45, 0); g.add(l); legs.push(l); }
  g.legs = legs; g.torso = torso; g.head = head; g.baseY = 0; g.bodyM = bodyM; g.baseColor = new T.Color(d.color);
  if(type==='brute'){ const club = new T.Mesh(new T.CylinderGeometry(0.05,0.09,0.6,6), mat(0x5a3a1a)); club.position.set(s*1.1, s*1.6, 0.1); club.rotation.z = 0.5; g.add(club); }
  if(type==='knight'){ const helm = new T.Mesh(new T.ConeGeometry(s*0.5, s*0.6, 8), mat(0xb8c2d0)); helm.position.y = s*3.2; g.add(helm);
    const shield = new T.Mesh(new T.BoxGeometry(s*0.9, s*1.1, 0.05), mat(0x3b6fd6)); shield.position.set(-s*1.05, s*1.4, 0.05); g.add(shield); }
  if(type==='shield'){ const sh = new T.Mesh(new T.BoxGeometry(s*1.9, s*2.1, 0.06), emissive(0x7fb8ff, 0.35)); sh.position.set(0, s*1.5, s*0.75); g.add(sh); g.shieldMesh = sh; }
  if(type==='thief'){ const bag = new T.Mesh(new T.SphereGeometry(s*0.6, 8, 6), mat(0xd8b24a)); bag.position.set(-s*0.9, s*1.9, -s*0.2); g.add(bag);
    const mask = new T.Mesh(new T.BoxGeometry(s*1.1, s*0.3, s*0.2), dark); mask.position.set(0, s*2.72, s*0.5); g.add(mask); }
  if(type==='healer'){ const c1 = new T.Mesh(new T.BoxGeometry(s*0.9, s*0.25, s*0.2), emissive(0xffffff, 0.8)); c1.position.set(0, s*1.5, s*0.85); g.add(c1);
    const c2 = new T.Mesh(new T.BoxGeometry(s*0.25, s*0.9, s*0.2), emissive(0xffffff, 0.8)); c2.position.set(0, s*1.5, s*0.85); g.add(c2); }
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
    bodyM.emissive = new T.Color(d.color); bodyM.emissiveIntensity = 0.25;
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
  if(g.wings){ g.wings[0].rotation.z = Math.sin(t*22)*0.55; g.wings[1].rotation.z = -Math.sin(t*22)*0.55; g.position.y = g.baseY + Math.sin(t*3)*0.08; }
  if(g.baseY && !g.wings) g.position.y = g.baseY + Math.sin(t*2.5)*0.06;
  g.bar.quaternion.copy(camera.quaternion);
};
// boss shield bubble
W.bubble = function(g, on){
  if(on && !g.bubble){ g.bubble = new T.Mesh(new T.SphereGeometry(TD.ENEMIES.boss.size*1.2*3.2, 16, 12), new T.MeshLambertMaterial({color:0x7fd4ff, emissive:0x7fd4ff, emissiveIntensity:0.4, transparent:true, opacity:0.32})); g.bubble.position.y = 0.9; g.add(g.bubble); }
  if(!on && g.bubble){ g.remove(g.bubble); g.bubble = null; }
};

// ---- projectiles ----
const projPool = { arrow:[], shell:[], ice:[], meteor:[] };
function projMesh(kind){
  const pool = projPool[kind];
  if(pool.length) { const m = pool.pop(); m.visible = true; return m; }
  let m;
  if(kind==='arrow') m = new T.Mesh(new T.BoxGeometry(0.05,0.05,0.38), emissive(0xffe6a0, 0.4));
  else if(kind==='shell') { m = new T.Mesh(new T.SphereGeometry(0.11, 8, 6), mat(0x23262c)); m.castShadow = true; }
  else if(kind==='meteor') { m = new T.Mesh(new T.DodecahedronGeometry(0.42, 0), emissive(0xff6a2c, 0.9)); }
  else m = new T.Mesh(new T.OctahedronGeometry(0.12, 0), emissive(0xbdf3ff, 0.9));
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

// ---- per-frame ----
W.tick = function(dt, t){
  fxTick(dt); boltsTick(dt);
  if(curMap){
    if(curMap.castle) curMap.castle.userData.flag.rotation.y = Math.sin(t*4)*0.25;
    if(curMap.gate) curMap.gate.userData.disc.material.emissiveIntensity = 0.7+Math.sin(t*5)*0.25;
    if(curMap.lavaMeshes) for(const p of curMap.lavaMeshes) p.material.emissiveIntensity = 0.55+Math.sin(t*3+p.position.x)*0.35;
  }
  if(W.shakeAmt > 0){ W.shakeAmt = Math.max(0, W.shakeAmt - dt*1.6); }
};
W.render = function(){
  if(W.shakeAmt > 0 && W.basePos){
    const a = W.shakeAmt*0.35;
    camera.position.copy(W.basePos).add(new T.Vector3((Math.random()-0.5)*a, (Math.random()-0.5)*a*0.6, (Math.random()-0.5)*a));
  } else if(W.basePos) camera.position.copy(W.basePos);
  renderer.render(scene, camera);
};
W.add = o => scene.add(o); W.remove = o => scene.remove(o);
})();

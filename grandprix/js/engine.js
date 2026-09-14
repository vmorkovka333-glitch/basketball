/* =====================================================================
   GRAND PRIX 3D — engine
   Track geometry (including a real, drivable pit lane), scenery, cars,
   physics with tyres / fuel / wet grip / damage, AI and cameras.
   Exposes window.GP.
   ===================================================================== */
(function () {
  'use strict';

  var T = function () { return window.THREE; };
  var D = function () { return window.GPDATA; };

  /* ---- tuning ------------------------------------------------------ */
  var MAX_SPEED = 66;       // world units / s at reference grip
  var ACCEL     = 31;
  var BRAKE     = 56;
  var ROLL      = 3.2;
  var DRAG      = 0.0021;
  var STEER_MAX = 1.0;
  var TURN_RATE = 1.58;
  var KMH       = 5.1;
  var GEARS     = [0, 11, 21, 32, 44, 55, 70];
  var WALL_OFF  = 2.8;
  var PIT_LAT   = 15.0;     // lane centreline, lateral units beyond the track edge
  var PIT_HALF  = 4.2;      // lane half width
  var APRON     = 8.0;      // paved depth in front of the garages
  var PIT_LIMIT = 15.0;     // ~77 km/h
  var LANE_LEN  = 460;      // samples (≈ metres) of pit lane
  var BOOST_MAX = 7.0;      // seconds of overtake mode per lap
  // One set of neutralisation speeds, used by the player and the AI alike, so
  // nobody gains by ignoring a flag.
  var CAPS = { sc: 26, red: 30, yellow: 44 };

  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var wrapAng = function (a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

  var G = {
    scene: null, camera: null, renderer: null, mountEl: null,
    cars: [], player: null, samples: [], N: 0, trackLen: 0,
    track: null, HALF_W: 6.4,
    pit: null, group: null,
    wet: 0, rainRate: 0, night: false,
    sun: null, sky: null, hemi: null,
    camMode: 0, camPos: null, camLook: null, shake: 0,
    quality: 2,
    _vw: 0, _vh: 0
  };

  /* =================================================================
     TRACK
     ================================================================= */
  function buildSamples(ctrl) {
    var P = ctrl, M = P.length, per = 46, out = [];
    for (var i = 0; i < M; i++) {
      var p0 = P[(i - 1 + M) % M], p1 = P[i], p2 = P[(i + 1) % M], p3 = P[(i + 2) % M];
      for (var k = 0; k < per; k++) {
        var t = k / per, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          z: 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        });
      }
    }
    var seg = [], L = 0, a, b, d;
    for (i = 0; i < out.length; i++) {
      a = out[i]; b = out[(i + 1) % out.length];
      d = Math.hypot(b.x - a.x, b.z - a.z); seg.push(d); L += d;
    }
    var res = [], idx = 0, carry = 0, step = 1.0;
    while (res.length < Math.floor(L / step)) {
      while (carry >= seg[idx]) { carry -= seg[idx]; idx = (idx + 1) % out.length; }
      a = out[idx]; b = out[(idx + 1) % out.length];
      var f = carry / seg[idx];
      res.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
      carry += step;
    }
    var n = res.length, j;
    for (j = 0; j < n; j++) {
      a = res[(j - 1 + n) % n]; b = res[(j + 1) % n];
      var tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      res[j].tx = tx; res[j].tz = tz; res[j].nx = tz; res[j].nz = -tx;
      res[j].h = Math.atan2(tx, tz);
    }
    for (j = 0; j < n; j++) {
      a = res[(j - 5 + n) % n]; b = res[(j + 5) % n];
      res[j].curv = wrapAng(b.h - a.h) / 10;
    }
    var sm = res.map(function (s, q) {
      var c = 0; for (var k2 = -7; k2 <= 7; k2++) c += res[(q + k2 + n) % n].curv; return c / 15;
    });
    sm.forEach(function (c, q) { res[q].curv = c; });

    // racing line: cut to the inside of a bend, run wide on entry and exit
    var raw = res.map(function (s) { return clamp(s.curv * 170, -1, 1); });
    for (var pass = 0; pass < 26; pass++) {
      var nx2 = raw.slice();
      for (j = 0; j < n; j++) nx2[j] = (raw[(j - 1 + n) % n] + raw[j] * 1.6 + raw[(j + 1) % n]) / 3.6;
      raw = nx2;
    }
    var hw = G.HALF_W;
    for (j = 0; j < n; j++) res[j].line = raw[j] * (hw - 1.7);

    // apex speed target used by the AI and by the "brake" hint
    for (j = 0; j < n; j++) {
      var mc = 0;
      for (var k3 = 3; k3 < 60; k3 += 3) mc = Math.max(mc, Math.abs(res[(j + k3) % n].curv));
      res[j].vmax = Math.sqrt(22 / (mc + 1e-4));
    }
    var maxR = 0;
    for (j = 0; j < n; j++) maxR = Math.max(maxR, Math.hypot(res[j].x, res[j].z));
    G.samples = res; G.N = n; G.trackLen = L; G.maxR = maxR;
    // where the far scenery begins: just outside the widest point of the lap
    G.farBase = maxR + 140;
  }

  /* ---- textures ---------------------------------------------------- */
  function makeTex(w, h, draw) {
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    var t = new (T().CanvasTexture)(cv); t.anisotropy = 4; return t;
  }
  function flatTex(base, spec, dots) {
    return makeTex(128, 128, function (x, w, h) {
      x.fillStyle = base; x.fillRect(0, 0, w, h);
      for (var i = 0; i < dots; i++) {
        x.fillStyle = spec; x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    });
  }
  function kerbTex(c1, c2) {
    return makeTex(16, 64, function (x, w, h) {
      x.fillStyle = c1; x.fillRect(0, 0, w, h); x.fillStyle = c2; x.fillRect(0, 0, w, h / 2);
    });
  }
  // A crowd that supports somebody: the stand is divided into blocks, each
  // block dressed in one team's colour. Where the round has a home team, most
  // of the stand wears that colour — at the Italian rounds the grandstands go
  // almost entirely red, the way a home crowd really does.
  function standTex(cols, home) {
    return makeTex(512, 128, function (x, w, h) {
      x.fillStyle = '#2b2f36'; x.fillRect(0, 0, w, h);
      var blocks = 5, bw = w / blocks, rows = 8, seats = 64;
      for (var b = 0; b < blocks; b++) {
        // the home team takes four blocks in five; visitors get the rest
        var col = (home && b !== 2) ? home : cols[(b * 2 + 1) % cols.length];
        x.fillStyle = col; x.globalAlpha = home && b !== 2 ? 0.26 : 0.16;
        x.fillRect(b * bw, 0, bw, h); x.globalAlpha = 1;
        var loyal = (home && b !== 2) ? 0.88 : 0.72;
        for (var r = 0; r < rows; r++) {
          for (var s = 0; s < seats / blocks; s++) {
            if (Math.random() < 0.14) continue;
            var fx = b * bw + s * (bw / (seats / blocks)) + 1;
            var fy = r * (h / rows) + 3;
            x.fillStyle = Math.random() < loyal ? col : cols[(Math.random() * cols.length) | 0];
            x.fillRect(fx, fy, bw / (seats / blocks) - 2, h / rows - 6);
            x.fillStyle = ['#c99a76', '#8d6247', '#e0b894', '#6b4530'][(Math.random() * 4) | 0];
            x.fillRect(fx + 1, fy - 2, 3, 3);
          }
        }
        if (Math.random() < 0.7) {
          var byy = h - 16;
          x.fillStyle = col; x.fillRect(b * bw + 6, byy, bw - 12, 13);
          x.fillStyle = 'rgba(255,250,240,.85)';
          x.fillRect(b * bw + 10, byy + 5, bw - 20, 3);
        }
      }
    });
  }
  function checkTex() {
    return makeTex(64, 16, function (x) {
      for (var i = 0; i < 8; i++) for (var j = 0; j < 2; j++) {
        x.fillStyle = ((i + j) % 2) ? '#20242b' : '#f4f2ed'; x.fillRect(i * 8, j * 8, 8, 8);
      }
    });
  }

  /* ---- ribbons ----------------------------------------------------- */
  function ribbon(fnA, fnB, y, mat, uvScale, yB, range) {
    var THREE = T(), S = G.samples, n = G.N;
    var i0 = range ? range[0] : 0, i1 = range ? range[1] : n;
    var pos = [], uv = [], idx = [], count = 0;
    for (var i = i0; i <= i1; i++) {
      var s = S[(i + n * 4) % n];
      var oa = (typeof fnA === 'function') ? fnA(i, s) : fnA;
      var ob = (typeof fnB === 'function') ? fnB(i, s) : fnB;
      pos.push(s.x + s.nx * oa, y, s.z + s.nz * oa, s.x + s.nx * ob, (yB == null ? y : yB), s.z + s.nz * ob);
      uv.push(0, i * uvScale, 1, i * uvScale);
      count++;
    }
    for (i = 0; i < count - 1; i++) { var a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    mat.side = THREE.DoubleSide;
    var m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
  }
  function ribbonWhere(test, offA, offB, y, mat, uvScale) {
    var THREE = T(), S = G.samples, n = G.N, grp = new THREE.Group(), run = null;
    function flush() {
      if (!run || run.length < 8) { run = null; return; }
      var pos = [], uv = [], idx = [];
      run.forEach(function (i, k) {
        var s = S[i % n];
        pos.push(s.x + s.nx * offA, y, s.z + s.nz * offA, s.x + s.nx * offB, y, s.z + s.nz * offB);
        uv.push(0, k * uvScale, 1, k * uvScale);
      });
      for (var k2 = 0; k2 < run.length - 1; k2++) { var a = k2 * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      mat.side = THREE.DoubleSide; grp.add(new THREE.Mesh(g, mat)); run = null;
    }
    for (var i = 0; i < n; i++) { if (test(S[i], i)) { (run = run || []).push(i); } else flush(); }
    flush(); return grp;
  }

  /* ---- pit lane ---------------------------------------------------- */
  // u is the distance along the lane, 0 at the entry, LANE_LEN at the exit.
  function laneLat(u) {
    var edge = G.HALF_W - 1.2;
    var ramp = smooth(0, 64, u) * smooth(LANE_LEN, LANE_LEN - 64, u);
    return edge + ramp * (PIT_LAT - edge);
  }
  function buildPit(def) {
    var n = G.N;
    var entry = Math.round((def.pit || 0) * n - LANE_LEN * 0.62 + n) % n;
    var side = 1;                                   // pit lane on the right of travel
    var boxes = [];
    var first = 100, last = LANE_LEN - 96;
    for (var j = 0; j < 20; j++) boxes.push(first + (last - first) * (j / 19));
    G.pit = { entry: entry, side: side, len: LANE_LEN, boxes: boxes, wallFrom: 72, wallTo: LANE_LEN - 72 };
  }
  function pitU(c) {
    var n = G.N, u = (c.idx - G.pit.entry + n) % n;
    return u;
  }

  /* =================================================================
     SCENE
     ================================================================= */
  function viewportSize() {
    var el = G.mountEl;
    var w = window.innerWidth || (el ? el.clientWidth : 0) || 1;
    var h = window.innerHeight || (el ? el.clientHeight : 0) || 1;
    return [Math.max(1, w), Math.max(1, h)];
  }
  function renderScale() {
    var s = Math.min(window.devicePixelRatio || 1, 1.75);
    try { if (window.self !== window.top && screen && screen.width > window.innerWidth) s *= Math.min(1.6, screen.width / window.innerWidth); } catch (e) { }
    if (G.quality < 2) s = Math.min(s, 1.25);
    return Math.min(2, Math.max(1, s));
  }

  function initRenderer(mount) {
    var THREE = T(), vp = viewportSize();
    G.mountEl = mount;
    var r = new THREE.WebGLRenderer({ antialias: G.quality > 1, powerPreference: 'high-performance' });
    r.setPixelRatio(renderScale()); r.setSize(vp[0], vp[1]);
    r.shadowMap.enabled = G.quality > 1;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputEncoding = THREE.sRGBEncoding;
    G.renderer = r; G._vw = vp[0]; G._vh = vp[1];
    mount.appendChild(r.domElement);
    G.camera = new THREE.PerspectiveCamera(60, vp[0] / vp[1], 0.4, 1400);
    G.camPos = new THREE.Vector3(); G.camLook = new THREE.Vector3();
  }

  function applyRenderScale(adj) {
    if (!G.renderer) return;
    G.scaleAdj = adj;
    G.renderer.setPixelRatio(renderScale() * adj);
    var vp = viewportSize();
    G.renderer.setSize(vp[0], vp[1]);
  }

  function onResize() {
    if (!G.renderer) return;
    var vp = viewportSize(); G._vw = vp[0]; G._vh = vp[1];
    G.camera.aspect = vp[0] / vp[1]; G.camera.updateProjectionMatrix();
    G.renderer.setPixelRatio(renderScale() * (G.scaleAdj || 1)); G.renderer.setSize(vp[0], vp[1]);
  }

  // palette per venue: flat, clean, slightly washed
  function palette(def) {
    var night = !!def.night, B = BIOMES[def.env] || BIOMES.parkland;
    if (night) {
      return {
        sky: B.sky && B.neon ? B.sky : ['#0b1020', '#15203a', '#22304d', '#2c3c5c'],
        fog: 0x141d30, ground: new (T().Color)(B.ground).multiplyScalar(0.42).getHex(),
        grass: B.grass, tar: B.tar,
        amb: 0.42, sun: 0.55, sunCol: 0xbfd4ff, hemiA: 0x30405c, hemiB: 0x1b2016
      };
    }
    return {
      sky: B.sky || ['#5fa3d8', '#9dc8e6', '#d9e7ef', '#eef1ec'],
      fog: 0xdce6e6, ground: B.ground, grass: B.grass, tar: B.tar,
      amb: 0.78, sun: 1.12, sunCol: 0xfff2d8, hemiA: 0xe8eef4, hemiB: 0x55663c
    };
  }

  function buildTrack(def) {
    var THREE = T();
    G.track = def;
    G.HALF_W = (def.w || 6.4) * 1.5;
    G.night = !!def.night;
    buildSamples(def.ctrl);
    buildPit(def);

    if (G.group) { disposeGroup(G.group); G.scene.remove(G.group); }
    var scene = G.scene || (G.scene = new THREE.Scene());
    fxInit(); fxReset();
    var grp = new THREE.Group(); G.group = grp; scene.add(grp);

    var P = palette(def);
    scene.background = new THREE.Color(P.sky[1]);
    scene.fog = new THREE.Fog(P.fog, 320, 1150);

    var skyTex = makeTex(16, 256, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, P.sky[0]); g.addColorStop(0.45, P.sky[1]);
      g.addColorStop(0.78, P.sky[2]); g.addColorStop(1, P.sky[3]);
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      if (def.night) for (var i = 0; i < 120; i++) {
        x.fillStyle = 'rgba(255,255,255,' + (0.25 + Math.random() * 0.5) + ')';
        x.fillRect(Math.random() * w, Math.random() * h * 0.5, 1, 1);
      }
    });
    var domeR = Math.max(1250, G.farBase + 900);
    if (G.camera) { G.camera.far = domeR + 250; G.camera.updateProjectionMatrix(); }
    var sky = new THREE.Mesh(new THREE.SphereGeometry(domeR, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.position.y = -60; grp.add(sky); G.sky = sky;

    var hemi = new THREE.HemisphereLight(P.hemiA, P.hemiB, P.amb);
    grp.add(hemi); G.hemi = hemi;
    var sun = new THREE.DirectionalLight(P.sunCol, P.sun);
    sun.position.set(80, 120, 50);
    sun.castShadow = G.quality > 1;
    sun.shadow.mapSize.set(1024, 1024);
    var sc = sun.shadow.camera;
    sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 20; sc.far = 210;
    sun.shadow.bias = -0.0006;
    grp.add(sun); grp.add(sun.target); G.sun = sun;

    // ground
    var gt = flatTex(P.grass, 'rgba(255,255,255,.05)', 500);
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(120, 120);
    var groundSize = (G.maxR + 1500) * 2;
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize),
      new THREE.MeshStandardMaterial({ map: gt, color: P.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; ground.receiveShadow = true; grp.add(ground);

    var hw = G.HALF_W;
    var at = flatTex(P.tar, 'rgba(255,255,255,.05)', 700);
    at.wrapS = at.wrapT = THREE.RepeatWrapping;
    G.tarMat = new THREE.MeshStandardMaterial({ map: at, color: 0xb0b2b6, roughness: 0.92 });
    grp.add(ribbon(-hw, hw, 0, G.tarMat, 0.09));

    var lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f0ea });
    grp.add(ribbon(-hw - 0.05, -hw + 0.3, 0.012, lineMat, 0.05));
    grp.add(ribbon(hw - 0.3, hw + 0.05, 0.012, lineMat.clone(), 0.05));

    var kt = kerbTex('#f2efe8', def.night ? '#c05a3a' : '#c67139');
    kt.wrapS = kt.wrapT = THREE.RepeatWrapping;
    var kerbMat = new THREE.MeshStandardMaterial({ map: kt, roughness: 0.6 });
    grp.add(ribbonWhere(function (s) { return s.curv > 0.013; }, hw, hw + 1.2, 0.02, kerbMat, 0.16));
    grp.add(ribbonWhere(function (s) { return s.curv < -0.013; }, -hw - 1.2, -hw, 0.02, kerbMat, 0.16));
    grp.add(ribbonWhere(function (s) { return s.curv < -0.013; }, hw, hw + 1.2, 0.02, kerbMat, 0.16));
    grp.add(ribbonWhere(function (s) { return s.curv > 0.013; }, -hw - 1.2, -hw, 0.02, kerbMat, 0.16));

    // barriers — skipped on the pit side where the pit lane runs
    var wo = hw + WALL_OFF;
    var wallMat = new THREE.MeshStandardMaterial({ color: def.night ? 0xd8d2c6 : 0xf2efe8, roughness: 0.7, side: THREE.DoubleSide });
    var stripeMat = new THREE.MeshStandardMaterial({ color: 0xc67139, roughness: 0.7, side: THREE.DoubleSide });
    grp.add(ribbon(-wo, -wo, 0, wallMat, 0.06, 1.05));
    grp.add(ribbon(-wo - 0.12, -wo + 0.12, 1.05, stripeMat, 0.05));
    var pe = G.pit.entry, n = G.N;
    grp.add(ribbon(wo, wo, 0, wallMat.clone(), 0.06, 1.05, [pe + LANE_LEN - 30, pe + n - 30]));
    grp.add(ribbon(wo - 0.12, wo + 0.12, 1.05, stripeMat.clone(), 0.05, null, [pe + LANE_LEN - 30, pe + n - 30]));

    buildPitGeometry(grp, def, P);
    buildStartLine(grp);
    buildScenery(grp, def, P);
    buildSectors();
    return G;
  }

  function buildSectors() {
    var n = G.N;
    G.sectors = [0, Math.round(n / 3), Math.round(2 * n / 3)];
    buildDRS();
  }

  // DRS zones sit on the longest straights: runs of low curvature at least
  // 110 units long. The detection point is 55 units before the zone opens.
  function buildDRS() {
    var S = G.samples, n = G.N, zones = [], run = null;
    for (var i = 0; i < n; i++) {
      if (Math.abs(S[i].curv) < 0.0055) { if (run === null) run = i; }
      else { if (run !== null && i - run > 110) zones.push([run + 30, i - 24]); run = null; }
    }
    if (run !== null && n - run > 110) zones.push([run + 30, n - 24]);
    zones.sort(function (a, b) { return (b[1] - b[0]) - (a[1] - a[0]); });
    zones = zones.slice(0, 3);
    G.drsZones = zones.map(function (z) { return { det: (z[0] - 55 + n) % n, from: z[0], to: z[1] }; });
    for (i = 0; i < n; i++) { S[i].drs = 0; S[i].drsDet = 0; }
    G.drsZones.forEach(function (z) {
      for (var k = z.from; k < z.to; k++) S[k % n].drs = 1;
      for (k = z.det; k < z.det + 55; k++) S[k % n].drsDet = 1;
    });
  }

  function inDRS(c) { return !!(G.samples[c.idx] && G.samples[c.idx].drs); }
  function atDRSDetection(c) { return !!(G.samples[c.idx] && G.samples[c.idx].drsDet); }

  // distance from a world point to the nearest piece of circuit, ignoring the
  // samples right around `near` (the stretch the object is meant to serve)
  function trackClearance(x, z, near, span) {
    var S = G.samples, n = G.N, best = 1e9;
    for (var i = 0; i < n; i += 3) {
      if (near != null) {
        var dd = Math.abs(i - near); dd = Math.min(dd, n - dd);
        if (dd < (span || 70)) continue;
      }
      var d = Math.hypot(S[i].x - x, S[i].z - z);
      if (d < best) best = d;
    }
    return best;
  }
  function clearOfTrack(x, z, near, need, span) {
    return trackClearance(x, z, near, span) > (need || G.HALF_W + 9);
  }
  // A footprint test: an object of radius `rad` centred at (x,z) must keep its
  // whole outline clear of the circuit, not merely its centre point. Mountains,
  // dunes, mounds and crop fields are tens of units across, so testing the
  // centre alone let their skirts run straight over the road.
  function footprintClear(x, z, rad, margin) {
    var S = G.samples, n = G.N, need = rad + G.HALF_W + WALL_OFF + (margin == null ? 14 : margin);
    for (var i = 0; i < n; i++) {
      var dx = S[i].x - x, dz = S[i].z - z;
      if (dx * dx + dz * dz < need * need) return false;
    }
    return true;
  }

  function buildPitGeometry(grp, def, P) {
    var THREE = T(), pit = G.pit, n = G.N, e = pit.entry, L = pit.len;
    var hw = G.HALF_W;
    var lat = function (i) { return laneLat((i - e + n * 4) % n); };
    var tarMat = new THREE.MeshStandardMaterial({ color: def.night ? 0x3a3d44 : 0x8e9196, roughness: 0.9, side: THREE.DoubleSide });
    grp.add(ribbon(function (i) { return lat(i) - PIT_HALF; }, function (i) { return lat(i) + PIT_HALF + APRON; }, 0.005, tarMat, 0.09, null, [e, e + L]));
    // a slightly darker apron so the working area reads apart from the lane
    var apronMat = new THREE.MeshStandardMaterial({ color: def.night ? 0x32353c : 0x7e8187, roughness: 0.94, side: THREE.DoubleSide });
    grp.add(ribbon(function (i) { return lat(i) + PIT_HALF; }, function (i) { return lat(i) + PIT_HALF + APRON; }, 0.011, apronMat, 0.09, null, [e + 40, e + L - 40]));
    // blue lane lines
    var blue = new THREE.MeshBasicMaterial({ color: 0x7a8a5e, side: THREE.DoubleSide });
    grp.add(ribbon(function (i) { return lat(i) - PIT_HALF; }, function (i) { return lat(i) - PIT_HALF + 0.3; }, 0.018, blue, 0.05, null, [e, e + L]));
    grp.add(ribbon(function (i) { return lat(i) + PIT_HALF - 0.3; }, function (i) { return lat(i) + PIT_HALF; }, 0.018, blue.clone(), 0.05, null, [e, e + L]));

    // separating wall between track and lane
    var wallMat = new THREE.MeshStandardMaterial({ color: 0xece7dc, roughness: 0.7, side: THREE.DoubleSide });
    grp.add(ribbon(hw + 1.7, hw + 1.7, 0, wallMat, 0.06, 1.0, [e + pit.wallFrom, e + pit.wallTo]));
    var stripe = new THREE.MeshStandardMaterial({ color: 0xc67139, roughness: 0.7, side: THREE.DoubleSide });
    grp.add(ribbon(hw + 1.58, hw + 1.82, 1.0, stripe, 0.05, null, [e + pit.wallFrom, e + pit.wallTo]));

    // garages, boxes and crews
    var teams = D().TEAMS;
    G.pitBoxes = []; G.bayKits = [];
    var garWall = new THREE.MeshStandardMaterial({ color: def.night ? 0x39404c : 0xf2ede2, roughness: 0.82 });
    var garInner = new THREE.MeshStandardMaterial({ color: def.night ? 0x232831 : 0x8d8a82, roughness: 0.9, side: THREE.DoubleSide });
    var glassMat = new THREE.MeshStandardMaterial({ color: def.night ? 0x1d2530 : 0x9fb6c4, roughness: 0.15, metalness: 0.5 });
    var eqDark = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.7 });
    var boxGeo = new THREE.PlaneGeometry(4.6, 7.0);
    for (var j = 0; j < 20; j++) {
      var u = pit.boxes[j], i = (e + Math.round(u)) % n, s = G.samples[i];
      var cl = laneLat(u);
      var team = teams[Math.floor(j / 2)];
      var tc = new THREE.Color(team.color);
      var at = function (off, side) {
        return [s.x + s.nx * off + s.tx * (side || 0), s.z + s.nz * off + s.tz * (side || 0)];
      };
      // painted box with the team colour and a white outline
      var bx = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: tc.clone().multiplyScalar(0.8) }));
      bx.rotation.x = -Math.PI / 2; bx.rotation.z = -s.h;
      var p0 = at(cl + 2.2);
      bx.position.set(p0[0], 0.02, p0[1]); grp.add(bx);
      var outline = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 7.3),
        new THREE.MeshBasicMaterial({ color: 0xf4f1e9 }));
      outline.rotation.x = -Math.PI / 2; outline.rotation.z = -s.h;
      outline.position.set(p0[0], 0.014, p0[1]); grp.add(outline);

      // garage bay: side walls, back wall, roof, open front
      var gp = at(cl + 9.4);
      var bay = new THREE.Group(); bay.position.set(gp[0], 0, gp[1]); bay.rotation.y = s.h + Math.PI / 2;
      G.pitBoxes.push({ u: u, i: i, lat: cl + 1.8, team: team.id, x: p0[0], z: p0[1], crew: null, s: s, bay: bay });
      var need = G.HALF_W + 5;
      var okBay = true;
      [at(cl + 5.9), gp, at(cl + 13.0), at(cl + 9.4, 4), at(cl + 9.4, -4)].forEach(function (pt) {
        if (trackClearance(pt[0], pt[1], null) < need) okBay = false;
      });
      if (!okBay) continue;
      grp.add(bay);
      var back = new THREE.Mesh(new THREE.BoxGeometry(7.0, 5.0, 0.3), garWall);
      back.position.set(0, 2.5, 3.4); bay.add(back);
      [-1, 1].forEach(function (sd) {
        var wl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.0, 7.0), garWall);
        wl.position.set(sd * 3.5, 2.5, 0); bay.add(wl);
      });
      var roof = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.34, 7.4), garWall);
      roof.position.set(0, 5.1, 0); roof.castShadow = true; bay.add(roof);
      var floor = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 7.0), garInner);
      floor.rotation.x = -Math.PI / 2; floor.position.y = 0.03; bay.add(floor);
      // fascia band in team colour with the name
      var nameTex = makeTex(256, 48, function (x, w, h) {
        x.fillStyle = '#' + tc.getHexString(); x.fillRect(0, 0, w, h);
        var lum = tc.r * 0.299 + tc.g * 0.587 + tc.b * 0.114;
        x.fillStyle = lum > 0.55 ? '#201e1d' : '#fffaf0';
        x.font = 'bold 22px Helvetica,Arial,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(team.name.toUpperCase(), w / 2, h / 2 + 1);
      });
      var fascia = new THREE.Mesh(new THREE.BoxGeometry(7.3, 1.15, 0.36),
        new THREE.MeshBasicMaterial({ color: team.color }));
      fascia.position.set(0, 4.35, -3.5); bay.add(fascia);
      var nameP2 = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 1.0),
        new THREE.MeshBasicMaterial({ map: nameTex }));
      nameP2.position.set(0, 4.35, -3.68); nameP2.rotation.y = Math.PI; bay.add(nameP2);
      // engineers' glass pod above the bay
      var pod = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.5, 2.6), glassMat);
      pod.position.set(0, 6.0, -1.0); bay.add(pod);
      bay.updateMatrixWorld(true);
      var podRoof = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.24, 3.0), garWall);
      podRoof.position.set(0, 6.85, -1.0); bay.add(podRoof);
      // equipment inside: tyre stacks, trolleys, a wheel gun rack
      var kit = new THREE.Group(); bay.add(kit); kit.visible = false;
      G.bayKits = G.bayKits || [];
      G.bayKits.push({ g: kit, x: gp[0], z: gp[1] });
      for (var q = 0; q < 3; q++) {
        for (var st = 0; st < 3; st++) {
          var tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12), eqDark);
          tyre.position.set(-2.4 + q * 0.95, 0.18 + st * 0.31, 2.5); kit.add(tyre);
        }
      }
      var bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.7), eqDark);
      bench.position.set(1.7, 0.45, 2.6); kit.add(bench);
      var screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8),
        new THREE.MeshBasicMaterial({ color: def.night ? 0x7fd4c8 : 0x2c3a44 }));
      screen.position.set(1.7, 1.6, 3.18); kit.add(screen);
      // lollipop / gantry rig over the box
      var rigY = 3.4;
      var rig = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.22, 0.22), eqDark);
      rig.position.set(0, rigY, -3.0); kit.add(rig);
      [-1, 1].forEach(function (sd) {
        var leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, rigY, 0.18), eqDark);
        leg.position.set(sd * 2.5, rigY / 2, -3.0); kit.add(leg);
      });
      var jack = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: team.color }));
      jack.position.set(0, rigY - 0.4, -3.0); kit.add(jack);

    }

    // pit wall: timing stands facing the lane
    for (var w2 = 0; w2 < 10; w2++) {
      var uu = pit.boxes[w2 * 2] + 2, ii = (e + Math.round(uu)) % n, ss = G.samples[ii];
      var stand = new THREE.Group();
      var spx = ss.x + ss.nx * (hw + 1.1), spz = ss.z + ss.nz * (hw + 1.1);
      if (!clearOfTrack(spx, spz, ii, hw + 4, 60)) continue;
      stand.position.set(spx, 0, spz);
      stand.rotation.y = ss.h; grp.add(stand);
      var deck = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 4.2),
        new THREE.MeshStandardMaterial({ color: 0x2f343d, roughness: 0.7 }));
      deck.position.y = 1.35; stand.add(deck);
      var shade = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 4.4),
        new THREE.MeshStandardMaterial({ color: teams[w2].color, roughness: 0.6 }));
      shade.position.y = 2.9; stand.add(shade);
      [-1.8, 1.8].forEach(function (zz) {
        var post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), eqDark);
        post.position.set(0, 2.15, zz); stand.add(post);
      });
      for (var e2 = 0; e2 < 3; e2++) {
        var eng = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.84, 6),
          new THREE.MeshStandardMaterial({ color: teams[w2].color, roughness: 0.7 }));
        eng.position.set(0, 1.95, -1.3 + e2 * 1.3); eng.castShadow = true; stand.add(eng);
      }
    }
  }

  function buildStartLine(grp) {
    var THREE = T(), s0 = G.samples[0], hw = G.HALF_W;
    var line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 1.8), new THREE.MeshBasicMaterial({ map: checkTex() }));
    line.rotation.x = -Math.PI / 2; line.rotation.z = -s0.h;
    line.position.set(s0.x, 0.016, s0.z); grp.add(line);
    // grid boxes
    var boxMat = new THREE.MeshBasicMaterial({ color: 0xf2f0ea, transparent: true, opacity: 0.7 });
    for (var k = 0; k < 20; k++) {
      var back = 8 + k * 4.6, side = (k % 2 === 0 ? 1 : -1) * (hw * 0.40);
      var i = (G.N - Math.round(back) + G.N) % G.N, s = G.samples[i];
      var b = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 3.2), boxMat);
      b.rotation.x = -Math.PI / 2; b.rotation.z = -s.h;
      b.position.set(s.x + s.nx * (side - 1.3), 0.016, s.z + s.nz * (side - 1.3)); grp.add(b);
      var b2 = b.clone(); b2.position.set(s.x + s.nx * (side + 1.3), 0.016, s.z + s.nz * (side + 1.3)); grp.add(b2);
    }
    // gantry
    var gMat = new THREE.MeshStandardMaterial({ color: 0xece7dc, roughness: 0.55 });
    var gantry = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 9, 0.7, 0.7), gMat);
    gantry.position.set(s0.x, 7.4, s0.z); gantry.rotation.y = s0.h; grp.add(gantry);
    [-1, 1].forEach(function (k2) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 7.4, 0.45), gMat);
      leg.position.set(s0.x + s0.nx * k2 * (hw + 4), 3.7, s0.z + s0.nz * k2 * (hw + 4)); grp.add(leg);
    });
    var t = G.track;
    var boardTex = makeTex(512, 96, function (x, w, h) {
      x.fillStyle = '#201e1d'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#f5ead8'; x.font = 'bold 46px Helvetica,Arial,sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText((t.city || '').toUpperCase(), w / 2, h / 2 + 2);
    });
    var board = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 2, 2.6),
      new THREE.MeshBasicMaterial({ map: boardTex, side: T().DoubleSide }));
    board.position.set(s0.x, 5.7, s0.z); board.rotation.y = s0.h + Math.PI; grp.add(board);
  }

  // Each venue gets its own ground, sky, planting and backdrop, so a circuit
  // reads as the place it is named after rather than the same green field.
  var BIOMES = {
    parkland:  { ground: 0x7f9c5c, grass: '#6f8f4c', tar: '#4d5055', tree: 'broad',
                 leaf: [0x4e7a3a, 0x5f8f44, 0x3f6a30], density: 1.25, backdrop: 'trees',
                 sky: ['#5fa3d8', '#9dc8e6', '#d9e7ef', '#eef1ec'] },
    forest:    { ground: 0x5c7a44, grass: '#546f3c', tar: '#494c52', tree: 'conifer',
                 leaf: [0x2f5a30, 0x3a6b38, 0x27482a], density: 1.7, backdrop: 'hills',
                 sky: ['#6f9ec4', '#a6c4d4', '#d2dee0', '#e9ece6'], hill: 0x3f5c38 },
    alpine:    { ground: 0x82a161, grass: '#77965a', tar: '#4d5055', tree: 'conifer',
                 leaf: [0x35603a, 0x2c5133, 0x3f6d40], density: 1.1, backdrop: 'mountains',
                 sky: ['#4f96d4', '#8fc0e4', '#d6e5ee', '#eef1ec'], hill: 0x8290a0 },
    desert:    { ground: 0xd8bd8a, grass: '#cfb17c', tar: '#565359', tree: 'palm',
                 leaf: [0x6d8a4a, 0x5d7a3e], density: 0.35, backdrop: 'dunes',
                 sky: ['#6ba6cf', '#b9cfd8', '#e4dcc4', '#efe4c8'], hill: 0xd2b681 },
    dunes:     { ground: 0xcfc298, grass: '#c2b38a', tar: '#4f5257', tree: 'scrub',
                 leaf: [0x7d8a5c, 0x6d7b4e], density: 1.0, backdrop: 'dunes',
                 sky: ['#7fa8c8', '#aec8d6', '#d8e0e0', '#eceee8'], hill: 0xc9bb92 },
    coast:     { ground: 0x88a566, grass: '#7b9a58', tar: '#4e5156', tree: 'palm',
                 leaf: [0x4f7d3c, 0x5f8f44], density: 0.9, backdrop: 'sea',
                 sky: ['#48a0dc', '#8fc8ea', '#d2e6f0', '#eef3f2'], water: 0x2f7fa8 },
    marina:    { ground: 0x9aa87a, grass: '#8d9c6e', tar: '#4c4f54', tree: 'palm',
                 leaf: [0x4f7d3c, 0x628f48], density: 0.7, backdrop: 'sea',
                 sky: ['#3d6fa8', '#5f92bd', '#9fb8c8', '#c8d2d2'], water: 0x1f5e84 },
    harbour:   { ground: 0x8f9c70, grass: '#849163', tar: '#4a4d52', tree: 'palm',
                 leaf: [0x54803c, 0x476f34], density: 0.55, backdrop: 'harbour',
                 sky: ['#4fa2d8', '#95c8e6', '#d6e6ee', '#eff2ec'], water: 0x2b7ea6 },
    metropolis:{ ground: 0x74875f, grass: '#6a7d56', tar: '#4b4e54', tree: 'broad',
                 leaf: [0x466f36, 0x3c6030], density: 0.6, backdrop: 'towers',
                 sky: ['#5b98c8', '#93bcd4', '#cfdde2', '#e8ebe6'] },
    strip:     { ground: 0xa89878, grass: '#9c8d6e', tar: '#4a4d53', tree: 'palm',
                 leaf: [0x4d7038, 0x3f5c2e], density: 0.5, backdrop: 'towers',
                 sky: ['#0b1020', '#1a2438', '#2a3550', '#38405c'], neon: true },
    oldtown:   { ground: 0xa89a72, grass: '#9c8f68', tar: '#4d5055', tree: 'scrub',
                 leaf: [0x5f7a42, 0x506a38], density: 0.6, backdrop: 'oldtown',
                 sky: ['#5ea2cf', '#9ec6dc', '#d6e2e4', '#ecefe8'], water: 0x2c6f96 },
    hillcity:  { ground: 0x789460, grass: '#6d8a55', tar: '#4c4f55', tree: 'broad',
                 leaf: [0x3f6f33, 0x4d8040, 0x35602c], density: 1.3, backdrop: 'hillcity',
                 sky: ['#5c9cc8', '#96c0d4', '#cfdee0', '#e9ece6'], hill: 0x5c7a4a },
    plateau:   { ground: 0x8a9a64, grass: '#7f8f5a', tar: '#4d5055', tree: 'broad',
                 leaf: [0x4a7238, 0x3e6330], density: 0.8, backdrop: 'towers',
                 sky: ['#5290c4', '#8fb8d0', '#cbd8dc', '#e6e9e4'] },
    prairie:   { ground: 0x9aa464, grass: '#8e995b', tar: '#4e5157', tree: 'scrub',
                 leaf: [0x64803e, 0x566f34], density: 0.9, backdrop: 'mesa',
                 sky: ['#57a0d8', '#96c4e2', '#d4e2e8', '#ebeee8'], hill: 0xb09468 },
    farmland:  { ground: 0x82a05e, grass: '#769352', tar: '#4d5055', tree: 'hedge',
                 leaf: [0x487036, 0x3c6030, 0x548040], density: 1.5, backdrop: 'fields',
                 sky: ['#77a4c4', '#a8c4d4', '#d4dee0', '#eaece6'] },
    vineyard:  { ground: 0x8ea065, grass: '#83955c', tar: '#4d5055', tree: 'cypress',
                 leaf: [0x37602f, 0x2e5228], density: 1.2, backdrop: 'hills',
                 sky: ['#5f9fd0', '#9cc4de', '#d4e0e4', '#ecefe8'], hill: 0x6f8a52 },
    dryhills:  { ground: 0xa3a468, grass: '#98995f', tar: '#4e5157', tree: 'scrub',
                 leaf: [0x5e7a3c, 0x6c8846], density: 0.9, backdrop: 'hills',
                 sky: ['#5aa0d4', '#9ac6e0', '#d8e2e4', '#eef0e8'], hill: 0x94955c },
    island:    { ground: 0x789c5e, grass: '#6d9154', tar: '#4c4f55', tree: 'conifer',
                 leaf: [0x35662f, 0x407539, 0x2c5628], density: 1.4, backdrop: 'sea',
                 sky: ['#5ba2d8', '#95c6e4', '#d2e2ea', '#eaeee8'], water: 0x39708c },
    japan:     { ground: 0x7d9a5c, grass: '#729052', tar: '#4d5055', tree: 'conifer',
                 leaf: [0x3a6634, 0x47763c, 0x305728], density: 1.3, backdrop: 'ferris',
                 sky: ['#6ba2cc', '#a0c6da', '#d4e0e2', '#ebeee8'] }
  };
  function biome(def) { return BIOMES[def.env] || BIOMES.parkland; }

  function buildScenery(grp, def, P) {
    var THREE = T(), n = G.N, hw = G.HALF_W, wo = hw + WALL_OFF;
    var night = !!def.night;
    var cols = D().TEAMS.map(function (t) { return t.color; });
    var homeTeam = def.home ? D().team(def.home) : null;
    var homeCol = homeTeam ? homeTeam.color : null;
    var st = standTex(cols, homeCol); st.wrapS = THREE.RepeatWrapping; st.repeat.set(6, 1);
    var standBody = new THREE.MeshStandardMaterial({ color: def.night ? 0x2f3542 : 0xe8e2d6, roughness: 0.9 });
    var roofMat = new THREE.MeshStandardMaterial({ color: def.night ? 0x3b4350 : 0xc67139, roughness: 0.6 });
    // A grandstand is a long straight box, so it only fits beside a straight
    // piece of circuit — on a curve its ends swing out over the racing line.
    // Find the flattest stretch near each target and set it back from there.
    var SL = 34, SD = 9, SBACK = 17;
    var used = [];
    G.crowd = { fans: [], groups: {}, stands: [], excite: 0 };
    var tierMat = new THREE.MeshStandardMaterial({ color: night ? 0x2f3542 : 0xe0d8c8, roughness: 0.9 });
    var teamsAll = D().TEAMS;
    var seedC = 4711, rndC = function () { seedC = (seedC * 16807) % 2147483647; return seedC / 2147483647; };

    for (var k = 0; k < 5; k++) {
      var want = Math.floor(n * (k / 5) + 30) % n, pick = -1, flat = 1e9;
      for (var o = -90; o <= 90; o += 6) {
        var ci = (want + o + n) % n, worst = 0;
        for (var q2 = -Math.round(SL / 2); q2 <= Math.round(SL / 2); q2 += 4) {
          worst = Math.max(worst, Math.abs(G.samples[(ci + q2 + n) % n].curv));
        }
        if (worst < flat) { flat = worst; pick = ci; }
      }
      if (pick < 0 || flat > 0.006) continue;
      var s = G.samples[pick];
      var sd0 = -1;
      var gx = s.x + s.nx * sd0 * (wo + SBACK), gz = s.z + s.nz * sd0 * (wo + SBACK);
      if (!clearOfTrack(gx, gz, pick, wo + SL * 0.55, 140)) continue;
      if (used.some(function (u2) { return Math.hypot(u2[0] - gx, u2[1] - gz) < SL; })) continue;
      used.push([gx, gz]);

      // the terracing itself: eight stepped tiers rising away from the track.
      // A tier is built in short segments and every segment is footprint-tested
      // against the whole circuit — a single 34-unit box swings its corners out
      // over the road wherever the track is not perfectly straight.
      var ROWS = 8, STEP_D = 1.55, STEP_H = 0.78, FRONT = wo + 8;
      var BLOCKS = 5, perBlock = 13, segW = SL / BLOCKS;
      var segRad = Math.hypot(segW, STEP_D) * 0.5;
      var standIdx = G.crowd.stands.length;
      var okSeg = [];
      for (var r = 0; r < ROWS; r++) {
        okSeg[r] = [];
        for (var sb = 0; sb < BLOCKS; sb++) {
          var off = FRONT + r * STEP_D;
          var alongS = -SL / 2 + (sb + 0.5) * segW;
          var sx3 = s.x + s.nx * sd0 * off + s.tx * alongS;
          var sz3 = s.z + s.nz * sd0 * off + s.tz * alongS;
          var clear = footprintClear(sx3, sz3, segRad, 2.5);
          okSeg[r][sb] = clear;
          if (!clear) continue;
          var hSeg = STEP_H * (r + 1) + 0.5;
          var tier = new THREE.Mesh(new THREE.BoxGeometry(segW, hSeg, STEP_D), tierMat);
          tier.position.set(sx3, hSeg / 2, sz3);
          tier.rotation.y = s.h; tier.receiveShadow = true; grp.add(tier);
        }
      }
      // a stand with almost nothing standing is not worth its fixtures
      var built = 0;
      okSeg.forEach(function (row) { row.forEach(function (v) { if (v) built++; }); });
      if (built < ROWS * BLOCKS * 0.5) { used.pop(); continue; }
      // each block of the terrace supports one team; the home team takes most
      for (var b = 0; b < BLOCKS; b++) {
        var blockTeam = (homeTeam && b !== 2) ? homeTeam : teamsAll[(b * 2 + 1 + k) % teamsAll.length];
        var bandCol = new THREE.Color(blockTeam.color).getHex();
        // a real banner draped over the front of the block
        var bw2 = segW - 1.2;
        var alongB = -SL / 2 + (b + 0.5) * segW;
        var bnX = s.x + s.nx * sd0 * (FRONT - 0.9) + s.tx * alongB;
        var bnZ = s.z + s.nz * sd0 * (FRONT - 0.9) + s.tz * alongB;
        if (okSeg[0][b] && footprintClear(bnX, bnZ, bw2 * 0.55, 2)) {
          var banner = new THREE.Mesh(new THREE.BoxGeometry(bw2, 1.5, 0.2),
            new THREE.MeshStandardMaterial({ color: bandCol, roughness: 0.72 }));
          banner.position.set(bnX, 1.5, bnZ); banner.rotation.y = s.h; grp.add(banner);
          var strip = new THREE.Mesh(new THREE.BoxGeometry(bw2 * 0.8, 0.3, 0.24),
            new THREE.MeshBasicMaterial({ color: 0xfffaf0 }));
          strip.position.set(bnX, 1.5, bnZ); strip.rotation.y = s.h; grp.add(strip);
        }

        // the spectators — only on segments that were actually built
        for (var rr = 0; rr < ROWS; rr++) {
          if (!okSeg[rr][b]) continue;
          for (var c2 = 0; c2 < perBlock; c2++) {
            if (rndC() < 0.12) continue;                        // an empty seat
            var along = -SL / 2 + b * segW + (c2 + 0.5) * (segW / perBlock) + (rndC() - 0.5) * 0.3;
            var offR = FRONT + rr * STEP_D - 0.4;
            var fx2 = s.x + s.nx * sd0 * offR + s.tx * along;
            var fz2 = s.z + s.nz * sd0 * offR + s.tz * along;
            var fy2 = STEP_H * (rr + 1) + 0.5;
            // most of a block wears its team; a few wear somebody else's
            var wear = rndC() < (homeTeam && b !== 2 ? 0.9 : 0.74)
              ? bandCol : new THREE.Color(teamsAll[(rndC() * teamsAll.length) | 0].color).getHex();
            G.crowd.fans.push({
              x: fx2, y: fy2, z: fz2, h: s.h + (sd0 < 0 ? 0 : Math.PI),
              col: wear, team: (wear === bandCol) ? blockTeam.id : null,
              ph: rndC() * Math.PI * 2, flag: rndC() < 0.3, stand: standIdx
            });
          }
        }
      }
      // roof on pillars, clear of the seats
      var backOff = FRONT + ROWS * STEP_D;
      var rx = s.x + s.nx * sd0 * (FRONT + ROWS * STEP_D * 0.5);
      var rz = s.z + s.nz * sd0 * (FRONT + ROWS * STEP_D * 0.5);
      var roofD = ROWS * STEP_D + 3;
      if (footprintClear(rx, rz, Math.hypot(SL + 2, roofD) * 0.5, 2)) {
        var roof = new THREE.Mesh(new THREE.BoxGeometry(SL + 2, 0.55, roofD), roofMat);
        roof.position.set(rx, 11.4, rz); roof.rotation.y = s.h; roof.castShadow = true; grp.add(roof);
      }
      var pilMat = new THREE.MeshStandardMaterial({ color: night ? 0x3b4350 : 0xd4ccbc, roughness: 0.8 });
      [-1, 1].forEach(function (e2) {
        var px2 = s.x + s.nx * sd0 * backOff + s.tx * e2 * (SL / 2);
        var pz2 = s.z + s.nz * sd0 * backOff + s.tz * e2 * (SL / 2);
        if (!footprintClear(px2, pz2, 1.2, 2)) return;
        var pil = new THREE.Mesh(new THREE.BoxGeometry(0.7, 11.4, 0.7), pilMat);
        pil.position.set(px2, 5.7, pz2); grp.add(pil);
      });
      // the stand's own banner across the roof edge, in the home colour
      var fasciaCol = homeTeam ? homeTeam.color : teamsAll[(k * 2 + 1) % teamsAll.length].color;
      var fX = s.x + s.nx * sd0 * (FRONT - 1.4), fZ = s.z + s.nz * sd0 * (FRONT - 1.4);
      if (footprintClear(fX, fZ, (SL + 2.1) * 0.5, 2)) {
        var fascia = new THREE.Mesh(new THREE.BoxGeometry(SL + 2.1, 1.1, 0.3),
          new THREE.MeshStandardMaterial({ color: fasciaCol, roughness: 0.65 }));
        fascia.position.set(fX, 11.0, fZ); fascia.rotation.y = s.h; grp.add(fascia);
      }

      G.crowd.stands.push({ idx: pick, x: gx, z: gz });
    }
    buildCrowdMeshes(grp, def);
    // tyre stacks on the outside of the quick corners
    var tyreGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.32, 8);
    var tyreMat = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.95 });
    var tyreTop = new THREE.MeshStandardMaterial({ color: 0xc67139, roughness: 0.7 });
    for (var q = 0; q < n; q += 9) {
      var s2 = G.samples[q]; if (Math.abs(s2.curv) < 0.022) continue;
      var side = s2.curv > 0 ? -1 : 1;
      if (side > 0 && ((q - G.pit.entry + n) % n) < G.pit.len) continue;
      var tx2 = s2.x + s2.nx * side * (wo + 1.7), tz2 = s2.z + s2.nz * side * (wo + 1.7);
      if (!clearOfTrack(tx2, tz2, q, hw + 2.5, 40)) continue;
      for (var hh = 0; hh < 3; hh++) {
        var tt = new THREE.Mesh(tyreGeo, hh === 2 ? tyreTop : tyreMat);
        tt.position.set(tx2, 0.16 + hh * 0.32, tz2);
        grp.add(tt);
      }
    }
    // trees / palms away from the circuit
    var B = biome(def);
    var trunkMat = new THREE.MeshStandardMaterial({ color: def.night ? 0x3a2f22 : 0x6b4a2e, roughness: 0.9 });
    var leafCols = def.night ? B.leaf.map(function (c) { return new THREE.Color(c).multiplyScalar(0.5).getHex(); }) : B.leaf;
    var leafMats = leafCols.map(function (c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }); });
    var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    // the planting differs by region: broadleaf, conifer, palm, cypress, hedge or scrub
    function plant(kind, m) {
      var g2 = new THREE.Group();
      if (kind === 'palm') {
        var st = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 6.5, 6), trunkMat);
        st.position.y = 3.25; st.rotation.z = (rnd() - 0.5) * 0.22; g2.add(st);
        for (var f = 0; f < 7; f++) {
          var frond = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.6, 4), m);
          frond.position.set(Math.cos(f) * 1.3, 6.3, Math.sin(f) * 1.3);
          frond.rotation.set(Math.PI / 2.4, f * 0.9, 0); g2.add(frond);
        }
      } else if (kind === 'conifer') {
        var ct = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 2.2, 5), trunkMat);
        ct.position.y = 1.1; g2.add(ct);
        for (var t2 = 0; t2 < 3; t2++) {
          var c2 = new THREE.Mesh(new THREE.ConeGeometry(2.6 - t2 * 0.6, 4 - t2 * 0.5, 7), m);
          c2.position.y = 3.2 + t2 * 2.1; g2.add(c2);
        }
      } else if (kind === 'cypress') {
        var cy = new THREE.Mesh(new THREE.ConeGeometry(1.0, 9, 7), m);
        cy.position.y = 4.5; g2.add(cy);
      } else if (kind === 'hedge') {
        var hg = new THREE.Mesh(new THREE.BoxGeometry(7 + rnd() * 9, 1.5, 0.8), m);
        hg.position.y = 0.75; hg.rotation.y = rnd() * Math.PI; g2.add(hg);
      } else if (kind === 'scrub') {
        for (var s6 = 0; s6 < 3; s6++) {
          var bu = new THREE.Mesh(new THREE.SphereGeometry(0.9 + rnd() * 0.5, 6, 5), m);
          bu.position.set((rnd() - 0.5) * 2.4, 0.6, (rnd() - 0.5) * 2.4);
          bu.scale.y = 0.7; g2.add(bu);
        }
      } else {
        var bt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 3, 6), trunkMat);
        bt.position.y = 1.5; g2.add(bt);
        var ball = new THREE.Mesh(new THREE.SphereGeometry(2.7, 8, 7), m);
        ball.position.y = 5.4; ball.scale.y = 0.86; g2.add(ball);
      }
      g2.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      return g2;
    }

    var placed = 0, tries = 0;
    var want = Math.round((G.quality > 1 ? 150 : 60) * (B.density || 1));
    while (placed < want && tries < 6000) {
      tries++;
      var span = (G.maxR + 200) * 2;
      var x = -span / 2 + rnd() * span, z = -span / 2 + rnd() * span, dmin = 1e9;
      for (var i2 = 0; i2 < n; i2 += 7) {
        var s3 = G.samples[i2], d = Math.hypot(s3.x - x, s3.z - z); if (d < dmin) dmin = d;
      }
      if (dmin > 170) continue;
      var scl = 0.75 + rnd() * 0.75;
      // widest spread of each planting type, scaled
      var spread = ({ hedge: 9.5, broad: 3.0, conifer: 2.8, palm: 2.0, cypress: 1.2, scrub: 2.2 }[B.tree] || 3.0) * scl;
      if (!footprintClear(x, z, spread, 10)) continue;
      var g2 = plant(B.tree, leafMats[placed % leafMats.length]);
      g2.scale.set(scl, scl, scl);
      g2.position.set(x, 0, z); grp.add(g2); placed++;
    }

    buildBackdrop(grp, def, B, rnd);
    buildLandmarks(grp, def, B, rnd);
    // floodlights at night
    if (def.night) {
      var poleMat = new THREE.MeshStandardMaterial({ color: 0x545a63, roughness: 0.6 });
      var lampMat = new THREE.MeshBasicMaterial({ color: 0xfff4d8 });
      for (var f = 0; f < 14; f++) {
        var i3 = Math.floor(n * f / 14), s4 = G.samples[i3], sd = (f % 2 ? 1 : -1);
        if (sd > 0 && ((i3 - G.pit.entry + n) % n) < G.pit.len) sd = -1;
        var plx = s4.x + s4.nx * sd * (wo + 5), plz = s4.z + s4.nz * sd * (wo + 5);
        if (!clearOfTrack(plx, plz, i3, wo + 4, 60)) continue;
        var pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, 16, 0.5), poleMat);
        pole.position.set(plx, 8, plz); grp.add(pole);
        var lamp = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.7, 1.2), lampMat);
        lamp.position.set(plx, 16.2, plz); lamp.rotation.y = s4.h; grp.add(lamp);
      }
    }
    // billboards
    var bbCols = [0xc67139, 0x7a8a5e, 0x201e1d, 0xece7dc];
    for (var b = 0; b < 10; b++) {
      var i4 = Math.floor(n * (b + 0.5) / 10), s5 = G.samples[i4], sd2 = (b % 2 ? 1 : -1);
      if (sd2 > 0 && ((i4 - G.pit.entry + n) % n) < G.pit.len) continue;
      var bx2 = s5.x + s5.nx * sd2 * (wo + 7), bz2 = s5.z + s5.nz * sd2 * (wo + 7);
      if (!clearOfTrack(bx2, bz2, i4, wo + 6, 60)) continue;
      var bb = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 0.3),
        new THREE.MeshStandardMaterial({ color: bbCols[b % 4], roughness: 0.5 }));
      bb.position.set(bx2, 2.5, bz2); bb.rotation.y = s5.h; grp.add(bb);
    }
  }

  // Far scenery on the horizon, outside the run-off: the silhouette that says
  // which city or country this is. All of it sits beyond 260 units so it can
  // never interfere with the circuit.
  function buildBackdrop(grp, def, B, rnd) {
    var THREE = T(), n = G.N, kind = B.backdrop, night = !!def.night;
    var far = new THREE.Group(); grp.add(far);
    // r is written as an old-world radius; re-base it outside the circuit
    function ringPos(a, r) {
      var R = G.farBase + (r - 280);
      return [Math.cos(a) * R, Math.sin(a) * R];
    }
    function clearFar(x, z, need) {
      var best = 1e9;
      for (var i = 0; i < n; i += 8) {
        var d = Math.hypot(G.samples[i].x - x, G.samples[i].z - z);
        if (d < best) best = d;
      }
      return best > (need || 240);
    }
    function add(geo, mat, x, y, z, ry) {
      var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      if (ry) m.rotation.y = ry; far.add(m); return m;
    }

    if (kind === 'towers' || kind === 'hillcity') {
      // a skyline: slab towers of varying height, dark by day, lit at night
      var glassCol = night ? 0x1c2634 : 0x93a4b2;
      var body = new THREE.MeshStandardMaterial({ color: glassCol, roughness: night ? 0.35 : 0.6, metalness: 0.35 });
      var winTex = makeTex(32, 64, function (x, w, h) {
        x.fillStyle = night ? '#141b26' : '#8fa0ae'; x.fillRect(0, 0, w, h);
        for (var r = 0; r < 16; r++) for (var c = 0; c < 6; c++) {
          if (Math.random() < (night ? 0.45 : 0.75)) continue;
          x.fillStyle = night ? 'rgba(255,228,164,.95)' : 'rgba(226,236,242,.6)';
          x.fillRect(c * 5 + 1, r * 4 + 1, 3, 2);
        }
      });
      winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
      var count = kind === 'hillcity' ? 70 : 46;
      for (var t = 0; t < count; t++) {
        var a = rnd() * Math.PI * 2, r = 300 + rnd() * 190;
        var p = ringPos(a, r);
        if (!clearFar(p[0], p[1], 260)) continue;
        var w2 = 14 + rnd() * 20, h2 = kind === 'hillcity' ? (12 + rnd() * 26) : (34 + rnd() * 108);
        if (!footprintClear(p[0], p[1], w2 * 0.75, 40)) continue;
        var y0 = kind === 'hillcity' ? rnd() * 34 : 0;
        var wt = winTex.clone(); wt.needsUpdate = true;
        wt.repeat.set(Math.max(1, Math.round(w2 / 9)), Math.max(1, Math.round(h2 / 9)));
        var mat = new THREE.MeshStandardMaterial({ map: wt, color: 0xffffff, roughness: 0.55, metalness: 0.25 });
        add(new THREE.BoxGeometry(w2, h2, w2 * 0.85), mat, p[0], y0 + h2 / 2, p[1], rnd() * 0.7);
      }
      if (B.neon) {
        // the strip: tall lit signs in saturated colour
        var neonCols = [0xff3b6b, 0x2fd8ff, 0xffd23b, 0x9b5cff];
        for (var q = 0; q < 16; q++) {
          var a2 = rnd() * Math.PI * 2, p2 = ringPos(a2, 290 + rnd() * 120);
          if (!footprintClear(p2[0], p2[1], 6, 40)) continue;
          var sign = add(new THREE.BoxGeometry(3 + rnd() * 5, 22 + rnd() * 40, 1.4),
            new THREE.MeshBasicMaterial({ color: neonCols[(rnd() * 4) | 0] }),
            p2[0], 24 + rnd() * 30, p2[1], rnd() * Math.PI);
        }
      }
    } else if (kind === 'mountains' || kind === 'hills') {
      var big = kind === 'mountains';
      var rockMat = new THREE.MeshStandardMaterial({
        color: B.hill || 0x7a8a6a, roughness: 1, flatShading: true
      });
      var snowMat = new THREE.MeshStandardMaterial({ color: 0xf0f2f4, roughness: 0.9, flatShading: true });
      for (var m2 = 0; m2 < (big ? 26 : 30); m2++) {
        var a3 = rnd() * Math.PI * 2, p3 = ringPos(a3, (big ? 400 : 320) + rnd() * 220);
        var rad = (big ? 70 : 55) + rnd() * (big ? 120 : 70);
        var hh = (big ? 90 : 26) + rnd() * (big ? 160 : 40);
        if (!footprintClear(p3[0], p3[1], rad, 30)) continue;
        var peak = add(new THREE.ConeGeometry(rad, hh, big ? 6 : 7), rockMat, p3[0], hh / 2 - 6, p3[1], rnd() * 2);
        if (big && hh > 150) {
          var cap = add(new THREE.ConeGeometry(rad * 0.34, hh * 0.3, 6), snowMat, p3[0], hh - hh * 0.15 - 6, p3[1]);
          cap.rotation.y = peak.rotation.y;
        }
      }
    } else if (kind === 'dunes' || kind === 'mesa') {
      var sandMat = new THREE.MeshStandardMaterial({ color: B.hill || 0xd2b681, roughness: 1, flatShading: true });
      for (var s7 = 0; s7 < 34; s7++) {
        var a4 = rnd() * Math.PI * 2, p4 = ringPos(a4, 280 + rnd() * 260);
        if (kind === 'mesa' && rnd() < 0.4) {
          var mw = 46 + rnd() * 70, mh = 26 + rnd() * 40;
          if (!footprintClear(p4[0], p4[1], mw, 30)) continue;
          add(new THREE.CylinderGeometry(mw * 0.8, mw, mh, 7), sandMat, p4[0], mh / 2 - 3, p4[1], rnd() * 2);
        } else {
          var dr = 60 + rnd() * 120, dh = 14 + rnd() * 34;
          if (!footprintClear(p4[0], p4[1], dr * 1.4, 30)) continue;
          var dn = add(new THREE.SphereGeometry(dr, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), sandMat, p4[0], -dr + dh, p4[1], rnd() * 2);
          dn.scale.set(1, dh / dr * 2.2, 1.4);
        }
      }
    } else if (kind === 'sea' || kind === 'harbour' || kind === 'oldtown') {
      // open water on one side, with a shoreline
      var waterMat = new THREE.MeshStandardMaterial({
        color: B.water || 0x2f7fa8, roughness: night ? 0.2 : 0.36, metalness: 0.5
      });
      // the shoreline sits beyond the northernmost point of the circuit
      var minZ = 1e9;
      for (var zi = 0; zi < n; zi++) minZ = Math.min(minZ, G.samples[zi].z);
      var shore = minZ - (G.HALF_W + WALL_OFF) - 260;
      var seaW = (G.maxR + 1500) * 2;
      var sea = new THREE.Mesh(new THREE.PlaneGeometry(seaW, 2200), waterMat);
      sea.rotation.x = -Math.PI / 2; sea.position.set(0, -1.2, shore - 1100); far.add(sea);
      var beachMat = new THREE.MeshStandardMaterial({ color: 0xdfd0a6, roughness: 1 });
      var beach = new THREE.Mesh(new THREE.PlaneGeometry(seaW, 90), beachMat);
      beach.rotation.x = -Math.PI / 2; beach.position.set(0, -0.9, shore); far.add(beach);
      if (kind === 'harbour' || kind === 'oldtown') {
        // hillside apartments and, in the bay, moored boats
        var wallCol = kind === 'oldtown' ? 0xd9c9a4 : 0xf0e6d4;
        var bMat = new THREE.MeshStandardMaterial({ color: night ? 0x3d4453 : wallCol, roughness: 0.85 });
        var roofMat2 = new THREE.MeshStandardMaterial({ color: night ? 0x2b3240 : 0xb4653c, roughness: 0.8 });
        for (var b2 = 0; b2 < 46; b2++) {
          var a5 = Math.PI * 0.15 + rnd() * Math.PI * 0.7, p5 = ringPos(a5, 285 + rnd() * 170);
          var bw = 14 + rnd() * 16, bh = 14 + rnd() * (kind === 'oldtown' ? 26 : 54);
          if (!footprintClear(p5[0], p5[1], bw * 0.8, 40)) continue;
          var yb = rnd() * 26;
          add(new THREE.BoxGeometry(bw, bh, bw), bMat, p5[0], yb + bh / 2, p5[1], rnd() * 0.8);
          if (kind === 'oldtown') {
            var rf = add(new THREE.ConeGeometry(bw * 0.82, 6, 4), roofMat2, p5[0], yb + bh + 3, p5[1]);
            rf.rotation.y = Math.PI / 4;
          }
        }
        var hullMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.5 });
        var mastMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.6 });
        for (var y2 = 0; y2 < 16; y2++) {
          var bx2 = -420 + rnd() * 840, bz2 = shore - 60 - rnd() * 320;
          if (!footprintClear(bx2, bz2, 12, 40)) continue;
          var hull = add(new THREE.BoxGeometry(7 + rnd() * 12, 3.4, 3 + rnd() * 2.4), hullMat, bx2, 1.2, bz2, rnd() * 2);
          add(new THREE.BoxGeometry(2.6, 2.4, 2.2), hullMat, bx2, 3.6, bz2, hull.rotation.y);
          add(new THREE.CylinderGeometry(0.16, 0.16, 14, 5), mastMat, bx2, 10, bz2);
        }
      }
    } else if (kind === 'fields') {
      // hedged farmland: a quilt of crop squares out to the horizon
      var cropCols = [0x8fa653, 0xa8b062, 0x7d9a4c, 0xc3b871, 0x6f8f4c];
      for (var f2 = 0; f2 < 60; f2++) {
        var a6 = rnd() * Math.PI * 2, p6 = ringPos(a6, 250 + rnd() * 300);
        var fw = 50 + rnd() * 80, fd = 50 + rnd() * 80;
        if (!footprintClear(p6[0], p6[1], Math.max(fw, fd) * 0.72, 24)) continue;
        var fld = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd),
          new THREE.MeshStandardMaterial({ color: cropCols[(rnd() * 5) | 0], roughness: 1 }));
        fld.rotation.x = -Math.PI / 2; fld.rotation.z = rnd() * 0.5;
        fld.position.set(p6[0], 0.03, p6[1]); far.add(fld);
      }
      var barnMat = new THREE.MeshStandardMaterial({ color: 0xb4a68a, roughness: 0.9 });
      for (var bn = 0; bn < 8; bn++) {
        var a7 = rnd() * Math.PI * 2, p7 = ringPos(a7, 270 + rnd() * 190);
        if (!footprintClear(p7[0], p7[1], 14, 40)) continue;
        add(new THREE.BoxGeometry(22, 9, 13), barnMat, p7[0], 4.5, p7[1], rnd() * 2);
      }
    } else if (kind === 'ferris') {
      // the wheel that stands over this circuit, plus a low town
      var steel = new THREE.MeshStandardMaterial({ color: night ? 0x5c6472 : 0xd8d2c6, roughness: 0.5, metalness: 0.3 });
      var wx = 240, wz = -250;
      // The wheel was the one landmark placed by hand rather than through the
      // re-based ring, so it stayed in the infield. footprintClear only asks
      // "is this clear of the tarmac", which an infield point satisfies — the
      // seed has to come from the same ring everything else uses.
      var seed0 = ringPos(-0.6, 300);
      wx = seed0[0]; wz = seed0[1];
      for (var tryW = 0; tryW < 30 && !footprintClear(wx, wz, 54, 40); tryW++) {
        var aw = -0.6 + (tryW % 2 ? 1 : -1) * Math.ceil(tryW / 2) * 0.3;
        var seedN = ringPos(aw, 300 + Math.floor(tryW / 6) * 60);
        wx = seedN[0]; wz = seedN[1];
      }
      var wheel = new THREE.Group(); wheel.position.set(wx, 0, wz); far.add(wheel);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(46, 1.6, 8, 40), steel);
      rim.position.y = 56; wheel.add(rim);
      for (var sp = 0; sp < 16; sp++) {
        var ang = sp / 16 * Math.PI * 2;
        var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.7, 92, 0.7), steel);
        spoke.position.y = 56; spoke.rotation.z = ang; wheel.add(spoke);
        var car2 = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4),
          new THREE.MeshBasicMaterial({ color: [0xd8382c, 0x2f6fd0, 0xe8be1d, 0x1f9e4d][sp % 4] }));
        car2.position.set(Math.cos(ang) * 46, 56 + Math.sin(ang) * 46, 0); wheel.add(car2);
      }
      [-1, 1].forEach(function (sd) {
        var leg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 60, 2.2), steel);
        leg.position.set(sd * 16, 28, 0); leg.rotation.z = -sd * 0.26; wheel.add(leg);
      });
      var townMat = new THREE.MeshStandardMaterial({ color: night ? 0x39404e : 0xe2dac8, roughness: 0.9 });
      for (var tw = 0; tw < 30; tw++) {
        var a8 = rnd() * Math.PI * 2, p8 = ringPos(a8, 280 + rnd() * 200);
        var tww = 16 + rnd() * 14, th = 10 + rnd() * 22;
        if (!footprintClear(p8[0], p8[1], tww * 0.8, 40)) continue;
        add(new THREE.BoxGeometry(tww, th, 16 + rnd() * 12), townMat, p8[0], th / 2, p8[1], rnd() * 2);
      }
    } else {
      // parkland and everything else: a soft wooded rim
      var rimMat = new THREE.MeshStandardMaterial({
        color: night ? 0x24361f : (B.hill || 0x4e6f38), roughness: 1, flatShading: true
      });
      for (var w3 = 0; w3 < 30; w3++) {
        var a9 = rnd() * Math.PI * 2, p9 = ringPos(a9, 290 + rnd() * 180);
        var wr = 50 + rnd() * 80, wh = 16 + rnd() * 26;
        if (!footprintClear(p9[0], p9[1], wr * 1.15, 30)) continue;
        var mound = add(new THREE.SphereGeometry(wr, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), rimMat, p9[0], -wr + wh, p9[1]);
        mound.scale.set(1, wh / wr * 2.4, 1.15);
      }
    }
    far.traverse(function (o) {
      if (o.isMesh) { o.receiveShadow = false; o.castShadow = false; o.frustumCulled = true; }
    });
    return far;
  }

  // City landmarks. Each round gets structures on its far horizon that say
  // where it is: glowing shapes over Las Vegas, old terracotta-roofed houses
  // and a bell tower at the Italian rounds, a lighthouse over the dunes, and
  // so on. All original geometry — architecture, never anybody's insignia —
  // and all of it footprint-tested so nothing reaches the circuit.
  function buildLandmarks(grp, def, B, rnd) {
    var THREE = T(), night = !!def.night;
    var L = new THREE.Group(); grp.add(L);

    function M(col, rough, metal) {
      return new THREE.MeshStandardMaterial({ color: col, roughness: rough == null ? 0.8 : rough, metalness: metal || 0 });
    }
    function lit(col) { return new THREE.MeshBasicMaterial({ color: col }); }
    var concrete = M(night ? 0x3a4150 : 0xe6dfd0, 0.85);
    var stone = M(night ? 0x3e4134 : 0xd9c9a4, 0.9);
    var terracotta = M(night ? 0x3a2a22 : 0xa8542f, 0.85);
    var steel = M(night ? 0x5a626e : 0xbfc4cb, 0.45, 0.4);
    var glass = M(night ? 0x1b2430 : 0x8fb0c4, 0.15, 0.6);

    // find a spot on the far ring whose footprint is clear of the whole circuit
    function place(build, wantAng, radius, clearRad) {
      var base = G.farBase + (radius - 280) + clearRad * 0.8;
      for (var k = 0; k < 40; k++) {
        var a = wantAng + (k % 2 ? 1 : -1) * Math.floor(k / 2) * 0.22;
        var r = base + Math.floor(k / 10) * 70;
        var x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!footprintClear(x, z, clearRad, 40)) continue;
        var g = build();
        g.position.set(x, 0, z);
        g.rotation.y = Math.atan2(-x, -z);        // face the circuit
        L.add(g);
        return g;
      }
      return null;
    }
    function add(g, geo, mat, x, y, z, ry) {
      var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      if (ry) m.rotation.y = ry; g.add(m); return m;
    }

    /* ---- reusable structures ---- */
    // a large illuminated sphere on a low plinth, its shell showing pictures
    function glowSphere(rad) {
      var g = new THREE.Group();
      var tex = makeTex(256, 128, function (x, w, h) {
        var bands = 9;
        for (var i = 0; i < bands; i++) {
          var g2 = x.createLinearGradient(0, i * h / bands, w, (i + 1) * h / bands);
          var cs = ['#ff3b6b', '#2fd8ff', '#ffd23b', '#9b5cff', '#3bff9b'];
          g2.addColorStop(0, cs[i % cs.length]); g2.addColorStop(1, cs[(i + 2) % cs.length]);
          x.fillStyle = g2; x.fillRect(0, i * h / bands, w, h / bands);
        }
        for (var d = 0; d < 400; d++) {
          x.fillStyle = 'rgba(255,255,255,' + (0.12 + Math.random() * 0.3) + ')';
          x.fillRect(Math.random() * w, Math.random() * h, 3, 3);
        }
      });
      add(g, new THREE.CylinderGeometry(rad * 0.92, rad, rad * 0.3, 24), concrete, 0, rad * 0.15, 0);
      var sph = add(g, new THREE.SphereGeometry(rad, 32, 24),
        new THREE.MeshBasicMaterial({ map: tex }), 0, rad * 1.02, 0);
      sph.scale.y = 0.96;
      return g;
    }
    // a tapering observation needle with a pod
    function needle(h, podAt) {
      var g = new THREE.Group();
      add(g, new THREE.CylinderGeometry(1.6, 6, h, 10), concrete, 0, h / 2, 0);
      var pod = add(g, new THREE.CylinderGeometry(9, 12, 7, 14), night ? lit(0xffe9b8) : glass, 0, (podAt || 0.76) * h, 0);
      add(g, new THREE.CylinderGeometry(0.7, 0.7, h * 0.2, 6), steel, 0, h * 1.08, 0);
      return g;
    }
    // a needle carrying two spheres
    function pearlTower(h) {
      var g = new THREE.Group();
      add(g, new THREE.CylinderGeometry(2.2, 5, h, 10), concrete, 0, h / 2, 0);
      [[0.42, 11], [0.74, 7.5]].forEach(function (s) {
        add(g, new THREE.SphereGeometry(s[1], 18, 14), night ? lit(0xff7a9c) : M(0xd45f78, 0.4), 0, s[0] * h, 0);
      });
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (q) {
        var leg = add(g, new THREE.CylinderGeometry(1.5, 2.2, h * 0.42, 6), concrete,
          q[0] * 7, h * 0.21, q[1] * 7);
        leg.rotation.x = -q[1] * 0.16; leg.rotation.z = q[0] * 0.16;
      });
      return g;
    }
    // three curved tapering towers
    function flameTowers() {
      var g = new THREE.Group();
      [0, 1, 2].forEach(function (i) {
        var h = 120 + i * 18, a = i * 2.1;
        var t = new THREE.Group(); t.position.set(Math.cos(a) * 26, 0, Math.sin(a) * 26);
        for (var s = 0; s < 7; s++) {
          var seg = add(t, new THREE.BoxGeometry(20 - s * 2.2, h / 7, 14 - s * 1.4),
            night ? lit(0xff6a3c) : glass, s * 1.8, h / 14 + s * (h / 7), 0);
          seg.rotation.z = -0.06 * s;
        }
        g.add(t);
      });
      return g;
    }
    // a run of old houses with terracotta roofs, and a bell tower
    function oldQuarter(count, campanile) {
      var g = new THREE.Group();
      for (var i = 0; i < count; i++) {
        var w = 11 + rnd() * 9, h = 12 + rnd() * 14, d2 = 10 + rnd() * 8;
        var x = (i - count / 2) * 15 + (rnd() - 0.5) * 5, z = (rnd() - 0.5) * 26;
        add(g, new THREE.BoxGeometry(w, h, d2), stone, x, h / 2, z, rnd() * 0.5);
        var rf = add(g, new THREE.ConeGeometry(w * 0.84, 5.5, 4), terracotta, x, h + 2.6, z);
        rf.rotation.y = Math.PI / 4;
        // shutters picked out on the facade
        if (rnd() < 0.7) {
          add(g, new THREE.BoxGeometry(w * 0.6, h * 0.3, 0.4),
            M(night ? 0x2a3326 : 0x7a8a5e, 0.7), x, h * 0.6, z + d2 / 2, 0);
        }
      }
      if (campanile) {
        var ch = 46;
        add(g, new THREE.BoxGeometry(11, ch, 11), stone, 0, ch / 2, -34);
        add(g, new THREE.BoxGeometry(12, 5, 12), stone, 0, ch - 6, -34);
        var spire = add(g, new THREE.ConeGeometry(8, 13, 4), terracotta, 0, ch + 6, -34);
        spire.rotation.y = Math.PI / 4;
        add(g, new THREE.BoxGeometry(4.5, 5, 0.5), M(0x2a2e36, 0.7), 0, ch - 12, -28.4);
      }
      return g;
    }
    // a lattice sphere
    function latticeDome(rad) {
      var g = new THREE.Group();
      add(g, new THREE.SphereGeometry(rad, 16, 12),
        new THREE.MeshStandardMaterial({
          color: night ? 0x59636f : 0xcfd6dc, roughness: 0.4, metalness: 0.3,
          wireframe: true
        }), 0, rad * 0.92, 0);
      add(g, new THREE.SphereGeometry(rad * 0.94, 18, 14),
        new THREE.MeshStandardMaterial({
          color: night ? 0x1d2733 : 0xa8c0cf, roughness: 0.2, metalness: 0.5,
          transparent: true, opacity: 0.42
        }), 0, rad * 0.92, 0);
      return g;
    }
    function lighthouse() {
      var g = new THREE.Group();
      var h = 38;
      add(g, new THREE.CylinderGeometry(3.4, 5.4, h, 12), M(0xf2ede2, 0.8), 0, h / 2, 0);
      for (var b = 0; b < 3; b++) {
        add(g, new THREE.CylinderGeometry(3.9 - b * 0.7, 4.4 - b * 0.7, 4, 12), M(0xd8382c, 0.7),
          0, 8 + b * 11, 0);
      }
      add(g, new THREE.CylinderGeometry(4.4, 4.4, 5, 12), lit(0xfff2c8), 0, h + 2, 0);
      add(g, new THREE.ConeGeometry(5, 5, 12), M(0x2a2e36, 0.7), 0, h + 7, 0);
      return g;
    }
    function pagoda() {
      var g = new THREE.Group();
      for (var i = 0; i < 5; i++) {
        var w = 20 - i * 3;
        add(g, new THREE.BoxGeometry(w, 5, w), stone, 0, 4 + i * 8, 0);
        var rf = add(g, new THREE.ConeGeometry(w * 0.95, 4, 4), terracotta, 0, 8.5 + i * 8, 0);
        rf.rotation.y = Math.PI / 4;
      }
      add(g, new THREE.CylinderGeometry(0.5, 0.8, 8, 6), steel, 0, 48, 0);
      return g;
    }
    function stadium(rad) {
      var g = new THREE.Group();
      var ring = add(g, new THREE.CylinderGeometry(rad, rad * 1.06, 26, 28, 1, true), concrete, 0, 13, 0);
      add(g, new THREE.TorusGeometry(rad * 1.04, 3, 8, 28), steel, 0, 27, 0).rotation.x = Math.PI / 2;
      var bowl = add(g, new THREE.CylinderGeometry(rad * 0.88, rad * 0.7, 18, 28, 1, true),
        new THREE.MeshBasicMaterial({ map: standTex(D().TEAMS.map(function (t) { return t.color; }),
          def.home ? D().team(def.home).color : null), side: THREE.DoubleSide }), 0, 11, 0);
      if (night) for (var i = 0; i < 8; i++) {
        var a = i / 8 * Math.PI * 2;
        add(g, new THREE.BoxGeometry(7, 1.4, 2), lit(0xfff4d8), Math.cos(a) * rad * 1.05, 31, Math.sin(a) * rad * 1.05, a);
      }
      return g;
    }
    function spiredChurch() {
      var g = new THREE.Group();
      add(g, new THREE.BoxGeometry(34, 26, 24), stone, 0, 13, 0);
      [[-11, -7], [-4, 7], [4, -7], [11, 7]].forEach(function (p, i) {
        var h = 54 + (i % 2) * 18;
        add(g, new THREE.CylinderGeometry(2.2, 6, h, 8), stone, p[0], h / 2 + 18, p[1]);
        add(g, new THREE.ConeGeometry(3, 9, 8), terracotta, p[0], h + 22, p[1]);
      });
      return g;
    }
    function pyramid(h) {
      var g = new THREE.Group();
      var p = add(g, new THREE.ConeGeometry(h * 0.78, h, 4), night ? glass : M(0x3a4450, 0.3, 0.5), 0, h / 2, 0);
      p.rotation.y = Math.PI / 4;
      if (night) add(g, new THREE.CylinderGeometry(1.4, 1.4, 80, 6), lit(0xfff8e0), 0, h + 40, 0);
      return g;
    }
    function chalet() {
      var g = new THREE.Group();
      add(g, new THREE.BoxGeometry(26, 12, 16), M(night ? 0x3a2f22 : 0x8c6242, 0.9), 0, 6, 0);
      var rf = add(g, new THREE.BoxGeometry(31, 1.2, 21), M(night ? 0x2a3026 : 0x51603c, 0.8), 0, 12.8, 0);
      rf.rotation.x = 0.16;
      add(g, new THREE.BoxGeometry(31, 1.2, 21), M(night ? 0x2a3026 : 0x51603c, 0.8), 0, 12.8, 0).rotation.x = -0.16;
      return g;
    }
    function hangars() {
      var g = new THREE.Group();
      for (var i = 0; i < 3; i++) {
        var sh = add(g, new THREE.CylinderGeometry(13, 13, 34, 16, 1, false, 0, Math.PI), steel,
          (i - 1) * 32, 0, 0);
        sh.rotation.z = Math.PI / 2; sh.rotation.y = Math.PI / 2;
      }
      var th = 26;
      add(g, new THREE.BoxGeometry(11, th, 11), concrete, 62, th / 2, 0);
      add(g, new THREE.BoxGeometry(15, 6, 15), glass, 62, th + 2, 0);
      return g;
    }
    function domedPalace() {
      var g = new THREE.Group();
      add(g, new THREE.BoxGeometry(78, 22, 26), stone, 0, 11, 0);
      for (var i = 0; i < 9; i++) {
        var sh = 30 + (i % 2) * 8;
        add(g, new THREE.CylinderGeometry(2, 2.6, sh, 6), stone, -34 + i * 8.5, sh / 2 + 20, -9);
        add(g, new THREE.ConeGeometry(3.2, 9, 6), terracotta, -34 + i * 8.5, sh + 26, -9);
      }
      add(g, new THREE.SphereGeometry(17, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        M(night ? 0x3d4a3a : 0x6f8a5e, 0.6, 0.2), 0, 22, 0);
      add(g, new THREE.ConeGeometry(4, 16, 8), terracotta, 0, 44, 0);
      return g;
    }
    function favelaHill() {
      var g = new THREE.Group();
      for (var i = 0; i < 90; i++) {
        var rr = rnd() * 78, aa = rnd() * Math.PI * 2;
        var x = Math.cos(aa) * rr, z = Math.sin(aa) * rr;
        var y0 = Math.max(0, 40 - rr * 0.5) + rnd() * 4;
        var h = 6 + rnd() * 9;
        add(g, new THREE.BoxGeometry(7 + rnd() * 5, h, 7 + rnd() * 5),
          M(night ? 0x3b3a42 : [0xe8dcc4, 0xdcc6a8, 0xe0cfc0, 0xd8b9a0][(rnd() * 4) | 0], 0.9),
          x, y0 + h / 2, z, rnd() * 1.4);
      }
      return g;
    }
    function volcano() {
      var g = new THREE.Group();
      var h = 210, rad = 165;
      var cone = add(g, new THREE.ConeGeometry(rad, h, 9), M(night ? 0x2f3540 : 0x6b6f62, 1), 0, h / 2 - 10, 0);
      cone.geometry.computeVertexNormals();
      add(g, new THREE.ConeGeometry(rad * 0.3, h * 0.26, 9), M(0xf0f2f4, 0.9), 0, h - h * 0.13 - 10, 0);
      return g;
    }
    function latticeHotel() {
      var g = new THREE.Group();
      [-1, 1].forEach(function (s) {
        add(g, new THREE.BoxGeometry(26, 44, 22), glass, s * 22, 22, 0);
      });
      var arch = add(g, new THREE.TorusGeometry(26, 4.5, 8, 20, Math.PI), night ? lit(0x7ad2ff) : steel, 0, 42, 0);
      arch.rotation.x = Math.PI / 2; arch.rotation.z = Math.PI;
      if (night) for (var i = 0; i < 14; i++) {
        add(g, new THREE.BoxGeometry(52, 0.6, 0.6), lit([0x7ad2ff, 0xff7ad2, 0xffe07a][i % 3]), 0, 6 + i * 3.2, 11.5);
      }
      return g;
    }
    function fountainTower() {
      var g = new THREE.Group();
      var h = 96;
      add(g, new THREE.CylinderGeometry(3.4, 9, h, 12), concrete, 0, h / 2, 0);
      add(g, new THREE.CylinderGeometry(1.2, 1.2, 46, 8), night ? lit(0xdff0ff) : M(0xeaf2f8, 0.2, 0.3), 0, h + 23, 0);
      add(g, new THREE.CylinderGeometry(16, 19, 3, 20), concrete, 0, 1.5, 0);
      return g;
    }
    function whiteVillage(count) {
      var g = new THREE.Group();
      for (var i = 0; i < count; i++) {
        var w = 10 + rnd() * 7, h = 8 + rnd() * 8;
        var x = (rnd() - 0.5) * 150, z = (rnd() - 0.5) * 90;
        add(g, new THREE.BoxGeometry(w, h, w * 0.9), M(night ? 0x424a52 : 0xf4efe4, 0.85), x, h / 2, z, rnd());
        var rf = add(g, new THREE.BoxGeometry(w + 1.6, 1.6, w), terracotta, x, h + 0.8, z);
        rf.rotation.y = 0;
      }
      return g;
    }
    function cableCar() {
      var g = new THREE.Group();
      [[-70, 0], [70, 0]].forEach(function (p, i) {
        var h = 40 + i * 26;
        add(g, new THREE.BoxGeometry(3, h, 3), steel, p[0], h / 2, p[1]);
        add(g, new THREE.BoxGeometry(12, 2, 6), steel, p[0], h, p[1]);
      });
      var cab = add(g, new THREE.BoxGeometry(7, 6, 5), M(0xd8382c, 0.5), -10, 46, 0);
      add(g, new THREE.BoxGeometry(146, 0.4, 0.4), steel, 0, 52, 0).rotation.z = 0.18;
      return g;
    }
    function grandTerrace() {
      var g = new THREE.Group();
      add(g, new THREE.BoxGeometry(56, 20, 26), M(night ? 0x454b3e : 0xefe4cc, 0.8), 0, 10, 0);
      for (var i = 0; i < 8; i++) {
        add(g, new THREE.CylinderGeometry(1.5, 1.5, 16, 8), M(night ? 0x4d5346 : 0xf6efdd, 0.7),
          -24 + i * 7, 8, 14);
      }
      add(g, new THREE.BoxGeometry(60, 2, 30), M(night ? 0x3a4034 : 0xd8c9a8, 0.7), 0, 21, 0);
      [[-1], [1]].forEach(function (s) {
        var dm = add(g, new THREE.SphereGeometry(9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
          M(night ? 0x4a5a4a : 0x8fa36e, 0.6, 0.2), s[0] * 22, 22, 0);
      });
      return g;
    }

    /* ---- what stands where ---- */
    var pick = {
      vegas: function () {
        place(function () { return glowSphere(48); }, -0.5, 330, 60);
        place(function () { return needle(190, 0.8); }, 0.5, 350, 30);
        place(function () { return pyramid(86); }, 1.6, 330, 72);
        place(function () { return latticeHotel(); }, -1.6, 320, 55);
      },
      monza: function () {
        place(function () { return oldQuarter(9, true); }, -0.4, 300, 80);
        place(function () { return oldQuarter(7, false); }, 2.2, 310, 62);
        place(function () { return grandTerrace(); }, 1.1, 300, 40);
      },
      imola: function () {
        place(function () { return oldQuarter(8, true); }, 0.3, 290, 74);
        place(function () { return whiteVillage(12); }, 2.4, 300, 90);
      },
      monaco: function () {
        place(function () { return grandTerrace(); }, 1.2, 290, 40);
        place(function () { return oldQuarter(10, false); }, 2.6, 300, 84);
      },
      shanghai: function () {
        place(function () { return pearlTower(200); }, -0.3, 340, 34);
        place(function () { return needle(240, 0.84); }, 0.4, 350, 28);
      },
      baku: function () {
        place(function () { return flameTowers(); }, -0.5, 330, 62);
        place(function () { return oldQuarter(11, true); }, 2.3, 300, 88);
      },
      montreal: function () {
        place(function () { return latticeDome(44); }, -0.4, 300, 50);
        place(function () { return needle(120, 0.7); }, 0.8, 320, 26);
      },
      zandvoort: function () { place(function () { return lighthouse(); }, -0.6, 280, 22); },
      suzuka: function () {
        place(function () { return pagoda(); }, 1.4, 300, 26);
        place(function () { return whiteVillage(10); }, -1.2, 300, 90);
      },
      barcelona: function () { place(function () { return spiredChurch(); }, -0.4, 310, 46); },
      budapest: function () { place(function () { return domedPalace(); }, 0.5, 300, 52); },
      spa: function () {
        place(function () { return chalet(); }, 1.5, 280, 26);
        place(function () { return chalet(); }, -1.8, 290, 26);
      },
      silverstone: function () { place(function () { return hangars(); }, 0.2, 300, 78); },
      spielberg: function () { place(function () { return cableCar(); }, -0.8, 300, 82); },
      saopaulo: function () { place(function () { return favelaHill(); }, -0.5, 320, 92); },
      mexico: function () {
        place(function () { return volcano(); }, -0.7, 520, 170); 
        place(function () { return stadium(62); }, 0.9, 310, 72);
      },
      miami: function () { place(function () { return stadium(70); }, 0.6, 320, 80); },
      lusail: function () { place(function () { return stadium(64); }, -0.5, 320, 74); },
      austin: function () { place(function () { return needle(150, 0.78); }, 0.4, 320, 28); },
      jeddah: function () { place(function () { return fountainTower(); }, -0.6, 310, 24); },
      yasmarina: function () { place(function () { return latticeHotel(); }, -0.4, 300, 55); },
      singapore: function () {
        place(function () { return needle(210, 0.82); }, -0.4, 340, 30);
        place(function () { return latticeDome(36); }, 0.7, 310, 42);
      },
      melbourne: function () {
        place(function () { return needle(160, 0.76); }, -0.5, 330, 28);
        place(function () { return stadium(58); }, 1.0, 310, 68);
      },
      sakhir: function () { place(function () { return needle(110, 0.72); }, -0.4, 310, 24); },
      portimao: function () { place(function () { return whiteVillage(14); }, 0.4, 300, 92); }
    };
    if (pick[def.id]) pick[def.id]();
    return L;
  }

  // The spectators are drawn as instanced bodies, heads, raised arms and hand
  // flags — grouped by the colour they wear, so a few draw calls carry a few
  // thousand people and every one of them can still be moved individually.
  function buildCrowdMeshes(grp, def) {
    var THREE = T(), C = G.crowd;
    if (!C || !C.fans.length) return;
    var bodyGeo = new THREE.BoxGeometry(0.42, 0.66, 0.3);
    var headGeo = new THREE.SphereGeometry(0.17, 7, 5);
    var armGeo = new THREE.BoxGeometry(0.11, 0.52, 0.12);
    var flagGeo = new THREE.PlaneGeometry(0.7, 0.46);
    var poleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.85, 4);
    var skinCols = [0xc99a76, 0x8d6247, 0xe0b894, 0x6b4530];
    var col = new THREE.Color();

    // one set of meshes per stand
    var byStand = [];
    C.fans.forEach(function (f) {
      var si = f.stand;
      if (!byStand[si]) byStand[si] = [];
      f.gi = byStand[si].length;
      byStand[si].push(f);
    });

    C.groups = [];
    byStand.forEach(function (list, si) {
      if (!list) return;
      var cnt = list.length;
      var shirtMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 });
      var skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.76 });
      var body = new THREE.InstancedMesh(bodyGeo, shirtMat, cnt);
      var armL = new THREE.InstancedMesh(armGeo, shirtMat, cnt);
      var armR = new THREE.InstancedMesh(armGeo, shirtMat, cnt);
      var head = new THREE.InstancedMesh(headGeo, skinMat, cnt);
      var flagged = list.filter(function (f) { return f.flag; });
      var fi = 0; flagged.forEach(function (f) { f.fi = fi++; });
      var flagM = null, poleM = null;
      if (flagged.length) {
        flagM = new THREE.InstancedMesh(flagGeo, new THREE.MeshBasicMaterial({
          color: 0xffffff, side: THREE.DoubleSide
        }), flagged.length);
        poleM = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({
          color: 0xe0dccf, roughness: 0.7
        }), flagged.length);
      }
      [body, armL, armR, head, flagM, poleM].forEach(function (im) {
        if (!im) return;
        im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        grp.add(im);
      });
      // per-instance colour: the shirt the spectator is actually wearing
      list.forEach(function (f) {
        col.setHex(f.col);
        body.setColorAt(f.gi, col);
        armL.setColorAt(f.gi, col);
        armR.setColorAt(f.gi, col);
        head.setColorAt(f.gi, col.setHex(skinCols[f.gi % skinCols.length]));
        if (f.flag && flagM) flagM.setColorAt(f.fi, col.setHex(f.col));
      });
      [body, armL, armR, head, flagM].forEach(function (im) {
        if (im && im.instanceColor) im.instanceColor.needsUpdate = true;
      });
      C.groups[si] = { list: list, body: body, armL: armL, armR: armR, head: head, flag: flagM, pole: poleM, on: true };
    });
    C.dummy = new THREE.Object3D();
    C.t = 0; C.acc = 0; C.primed = false;
    animateCrowd(0, null);
  }

  // Called every frame. Fans bob while they wait; when a car comes past their
  // stand the whole block stands up — and the ones wearing that team's colour
  // jump highest, arms up, flags going, willing their car on. A stand out of
  // range is switched off entirely and costs nothing.
  function animateCrowd(dt, cars) {
    var C = G.crowd;
    if (!C || !C.groups || !C.dummy) return;
    C.t += dt;
    C.acc = (C.acc || 0) + dt;
    if (C.primed && C.acc < 1 / 30) return;
    C.primed = true; C.acc = 0;
    var t = C.t, d = C.dummy;
    var cam = G.camera;
    var cx = cam ? cam.position.x : 0, cz = cam ? cam.position.z : 0;

    for (var si = 0; si < C.groups.length; si++) {
      var g = C.groups[si];
      if (!g) continue;
      var st = C.stands[si];
      var dist = Math.hypot(cx - st.x, cz - st.z);
      var want = dist < 230;
      if (g.on !== want) {
        g.on = want;
        g.body.visible = want; g.armL.visible = want;
        g.armR.visible = want; g.head.visible = want;
        if (g.flag) { g.flag.visible = want; g.pole.visible = want; }
      }
      if (!want) continue;

      // which car is at this stand, and how close
      var heat = 0, heatTeam = null;
      if (cars) {
        var bestD = 1e9, bestC = null;
        for (var c = 0; c < cars.length; c++) {
          var car = cars[c];
          if (car.retired) continue;
          var dd = Math.hypot(car.x - st.x, car.z - st.z);
          if (dd < bestD) { bestD = dd; bestC = car; }
        }
        if (bestC && bestD < 95) { heat = 1 - bestD / 95; heatTeam = bestC.team; }
      }

      var list = g.list;
      for (var k = 0; k < list.length; k++) {
        var f = list[k];
        var mine = (f.team && f.team === heatTeam) ? 1 : 0.45;
        var drive = heat * mine;
        var bounce = Math.abs(Math.sin(t * (2.4 + drive * 7.5) + f.ph));
        var y = f.y + bounce * (0.045 + drive * 0.42);
        var ca = Math.cos(f.h), sa = Math.sin(f.h);

        d.position.set(f.x, y + 0.33, f.z);
        d.rotation.set(0, f.h + Math.sin(t * 1.1 + f.ph) * 0.12 * (1 - drive), 0);
        d.scale.set(1, 1 + bounce * 0.06 * drive, 1);
        d.updateMatrix();
        g.body.setMatrixAt(f.gi, d.matrix);

        d.position.set(f.x, y + 0.8, f.z);
        d.scale.set(1, 1, 1);
        d.rotation.set(0, f.h, Math.sin(t * 2.1 + f.ph) * 0.12 * drive);
        d.updateMatrix();
        g.head.setMatrixAt(f.gi, d.matrix);

        // arms: folded when idle, thrown up when their car is on them
        var wave = Math.sin(t * (3 + drive * 7) + f.ph);
        var lift = 0.45 + drive * 2.0;
        for (var side = 0; side < 2; side++) {
          var sx = side ? 0.27 : -0.27;
          d.position.set(f.x + ca * sx, y + 0.62, f.z - sa * sx);
          d.rotation.set(0, f.h, (side ? -1 : 1) * (lift + wave * (0.2 + drive * 0.6)));
          d.updateMatrix();
          (side ? g.armR : g.armL).setMatrixAt(f.gi, d.matrix);
        }

        if (f.flag && g.flag) {
          var fh = y + 1.05 + drive * 0.5;
          var fx3 = f.x + ca * 0.42, fz3 = f.z - sa * 0.42;
          d.position.set(fx3, fh, fz3);
          d.rotation.set(0, f.h, wave * (0.25 + drive * 0.45));
          d.updateMatrix();
          g.pole.setMatrixAt(f.fi, d.matrix);
          d.position.set(fx3 + ca * 0.3, fh + 0.5, fz3 - sa * 0.3);
          d.rotation.set(0, f.h + Math.PI / 2 + wave * 0.3, wave * 0.2);
          d.updateMatrix();
          g.flag.setMatrixAt(f.fi, d.matrix);
        }
      }
      g.body.instanceMatrix.needsUpdate = true;
      g.head.instanceMatrix.needsUpdate = true;
      g.armL.instanceMatrix.needsUpdate = true;
      g.armR.instanceMatrix.needsUpdate = true;
      if (g.flag) { g.flag.instanceMatrix.needsUpdate = true; g.pole.instanceMatrix.needsUpdate = true; }
    }
  }

  function disposeGroup(g) {
    g.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        var ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }

  /* =================================================================
     CARS
     ================================================================= */
  // A modern open-wheel car: floor, tapering monocoque, nose and multi-element
  // front wing, sidepods with inlets, engine cover and airbox, halo, a driver
  // sat in the tub with hands on the wheel, and a rear wing whose upper flap
  // opens for DRS. Tyre sidewalls are recoloured per compound.
  function numTexture(num) {
    return makeTex(64, 64, function (x, w, h) {
      x.fillStyle = '#fffaf0'; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#201e1d'; x.font = 'bold ' + (String(num).length > 2 ? 30 : 40) + 'px Helvetica,Arial,sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(num), w / 2, h / 2 + 2);
    });
  }
  function makeCarMesh(color, color2, num) {
    var THREE = T(), g = new THREE.Group();
    var paint = new THREE.MeshStandardMaterial({ color: color, roughness: 0.26, metalness: 0.22 });
    var trim = new THREE.MeshStandardMaterial({ color: color2, roughness: 0.34, metalness: 0.1 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x191c22, roughness: 0.72 });
    var carbon = new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.42, metalness: 0.32 });
    var chrome = new THREE.MeshStandardMaterial({ color: 0xc3c8cf, roughness: 0.22, metalness: 0.8 });
    function add(geo, mat, x, y, z, rx, ry, rz, parent) {
      var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz;
      m.castShadow = true; (parent || g).add(m); return m;
    }
    var detail = new THREE.Group(); g.add(detail);
    var fine = [];

    /* floor and plank */
    add(new THREE.BoxGeometry(1.42, 0.06, 4.5), carbon, 0, 0.11, 0.15);
    add(new THREE.BoxGeometry(0.34, 0.05, 3.9), dark, 0, 0.07, 0.1, 0, 0, 0, detail);

    /* monocoque: three tapering blocks read as a survival cell */
    add(new THREE.BoxGeometry(0.96, 0.40, 1.5), paint, 0, 0.38, -0.35);
    add(new THREE.BoxGeometry(0.82, 0.38, 1.2), paint, 0, 0.37, 0.85);
    add(new THREE.BoxGeometry(0.54, 0.30, 1.0), paint, 0, 0.34, 1.85);
    /* nose cone */
    var nose = add(new THREE.CylinderGeometry(0.11, 0.24, 1.15, 8), paint, 0, 0.31, 2.55, Math.PI / 2);
    nose.rotation.z = 0; nose.rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.3, 0.1, 0.9), trim, 0, 0.44, 2.2, 0, 0, 0, detail);

    /* front wing: two elements, endplates, turning vanes */
    var fw = new THREE.Group(); g.add(fw);
    add(new THREE.BoxGeometry(2.02, 0.045, 0.42), paint, 0, 0.17, 2.92, 0.06, 0, 0, fw);
    add(new THREE.BoxGeometry(1.92, 0.04, 0.3), trim, 0, 0.26, 2.72, 0.20, 0, 0, fw);
    [-1, 1].forEach(function (s) {
      fine.push(add(new THREE.BoxGeometry(0.05, 0.30, 0.72), trim, s * 1.0, 0.26, 2.84, 0, 0, 0, fw));
      fine.push(add(new THREE.BoxGeometry(0.04, 0.22, 0.5), carbon, s * 0.52, 0.32, 2.25, 0, 0, 0, fw));
    });

    /* sidepods with inlets and cooling louvres */
    [-1, 1].forEach(function (s) {
      add(new THREE.BoxGeometry(0.52, 0.40, 1.9), paint, s * 0.66, 0.40, -0.05);
      add(new THREE.BoxGeometry(0.46, 0.34, 0.18), dark, s * 0.66, 0.44, 0.92, 0, 0, 0, detail);
      add(new THREE.BoxGeometry(0.42, 0.24, 1.1), trim, s * 0.70, 0.58, -0.35, 0, 0, 0, detail);
      /* bargeboard ahead of the pod */
      add(new THREE.BoxGeometry(0.04, 0.30, 0.75), carbon, s * 0.74, 0.30, 1.42, 0, 0, 0, detail);
      /* floor edge wing */
      add(new THREE.BoxGeometry(0.16, 0.04, 2.6), carbon, s * 0.76, 0.16, 0.1, 0, 0, 0, detail);
    });

    /* cockpit opening, seat and driver */
    add(new THREE.BoxGeometry(0.62, 0.16, 1.05), dark, 0, 0.58, 0.55, 0, 0, 0, detail);
    var driver = new THREE.Group(); detail.add(driver);
    var suit = new THREE.MeshStandardMaterial({ color: color, roughness: 0.62 });
    var glove = new THREE.MeshStandardMaterial({ color: color2, roughness: 0.6 });
    add(new THREE.BoxGeometry(0.5, 0.24, 0.36), suit, 0, 0.62, 0.28, 0, 0, 0, driver);      // shoulders
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 6), suit, -0.22, 0.62, 0.52, 0.7, 0, 0.2, driver);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 6), suit, 0.22, 0.62, 0.52, 0.7, 0, -0.2, driver);
    add(new THREE.BoxGeometry(0.09, 0.09, 0.09), glove, -0.13, 0.70, 0.74, 0, 0, 0, driver);
    add(new THREE.BoxGeometry(0.09, 0.09, 0.09), glove, 0.13, 0.70, 0.74, 0, 0, 0, driver);
    var helmet = add(new THREE.SphereGeometry(0.155, 14, 12), new THREE.MeshStandardMaterial({
      color: color2, roughness: 0.18, metalness: 0.12
    }), 0, 0.80, 0.34, 0, 0, 0, driver);
    helmet.scale.set(1, 0.94, 1.06);
    var visor = add(new THREE.SphereGeometry(0.158, 14, 10, 0, Math.PI, 1.0, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.1, metalness: 0.7 }),
      0, 0.80, 0.34, 0, 0, 0, driver);
    visor.rotation.y = -Math.PI / 2; visor.scale.set(1, 0.94, 1.06);
    /* steering wheel */
    add(new THREE.BoxGeometry(0.30, 0.12, 0.05), dark, 0, 0.70, 0.80, -0.5, 0, 0, driver);

    /* halo */
    var halo = new THREE.Group(); detail.add(halo);
    var ring = add(new THREE.TorusGeometry(0.40, 0.035, 8, 20, Math.PI), carbon, 0, 0.86, 0.34, 0, 0, 0, halo);
    ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI;
    add(new THREE.BoxGeometry(0.07, 0.24, 0.07), carbon, 0, 0.76, 0.74, 0, 0, 0, halo);
    [-1, 1].forEach(function (s) {
      add(new THREE.BoxGeometry(0.05, 0.28, 0.05), carbon, s * 0.40, 0.74, 0.2, 0, 0, 0, halo);
    });

    /* airbox, engine cover, shark fin */
    add(new THREE.CylinderGeometry(0.17, 0.21, 0.3, 8), carbon, 0, 0.86, 0.02, Math.PI / 2);
    add(new THREE.BoxGeometry(0.46, 0.34, 1.5), paint, 0, 0.68, -0.85);
    add(new THREE.BoxGeometry(0.30, 0.24, 1.1), paint, 0, 0.84, -1.05);
    add(new THREE.BoxGeometry(0.03, 0.30, 1.35), trim, 0, 1.00, -1.1, 0, 0, 0, detail);
    add(new THREE.BoxGeometry(0.26, 0.2, 0.22), dark, 0, 0.58, -1.85, 0, 0, 0, detail);
    add(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8), chrome, 0, 0.58, -1.98, Math.PI / 2, 0, 0, detail);

    /* diffuser */
    add(new THREE.BoxGeometry(1.1, 0.26, 0.5), carbon, 0, 0.20, -1.95, -0.25);
    [-1, 1].forEach(function (s) {
      add(new THREE.BoxGeometry(0.03, 0.24, 0.5), dark, s * 0.34, 0.22, -1.95, -0.25, 0, 0, detail);
    });

    /* rear wing: fixed main plane + a DRS flap that pivots open */
    var rw = new THREE.Group(); g.add(rw);
    add(new THREE.BoxGeometry(1.62, 0.05, 0.34), trim, 0, 0.92, -2.02, 0.22, 0, 0, rw);
    var drsPivot = new THREE.Group(); drsPivot.position.set(0, 1.08, -2.14); rw.add(drsPivot);
    var drsFlap = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.045, 0.26), paint);
    drsFlap.position.set(0, 0, -0.04); drsFlap.rotation.x = 0.55; drsFlap.castShadow = true;
    drsPivot.add(drsFlap);
    [-1, 1].forEach(function (s) {
      fine.push(add(new THREE.BoxGeometry(0.05, 0.52, 0.62), trim, s * 0.81, 0.94, -2.04, 0, 0, 0, rw));
    });
    fine.push(add(new THREE.BoxGeometry(0.07, 0.5, 0.1), carbon, 0, 0.74, -2.0, 0, 0, 0, rw));
    /* rear light */
    var rearLight = add(new THREE.BoxGeometry(0.12, 0.12, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x5a1510 }), 0, 0.60, -2.12, 0, 0, 0, rw);

    /* number roundel on the airbox sides */
    var numMat = null;
    if (num != null) {
      numMat = new THREE.MeshBasicMaterial({ map: numTexture(num), transparent: true });
      [-1, 1].forEach(function (s) {
        var p = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), numMat);
        p.position.set(s * 0.24, 0.72, -0.7); p.rotation.y = s * Math.PI / 2; detail.add(p);
      });
    }

    /* wheels: slick tyre, coloured sidewall band, rim, brake disc */
    var tyreGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.46, 18);
    var bandGeo = new THREE.TorusGeometry(0.335, 0.028, 6, 20);
    var rimGeo = new THREE.CylinderGeometry(0.225, 0.225, 0.48, 14);
    var discGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.05, 14);
    var rubber = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.95 });
    var rimMat = new THREE.MeshStandardMaterial({ color: 0xaeb4bc, roughness: 0.3, metalness: 0.62 });
    var discMat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.55, metalness: 0.3 });
    var wheels = {}, bands = [];
    [['fl', -0.86, 1.62], ['fr', 0.86, 1.62], ['rl', -0.92, -1.34], ['rr', 0.92, -1.34]].forEach(function (w) {
      var pivot = new THREE.Group(); pivot.position.set(w[1], 0.38, w[2]);
      var tw = new THREE.Mesh(tyreGeo, rubber); tw.rotation.z = Math.PI / 2; tw.castShadow = true; pivot.add(tw);
      var rr = new THREE.Mesh(rimGeo, rimMat); rr.rotation.z = Math.PI / 2; pivot.add(rr);
      var dsc = new THREE.Mesh(discGeo, discMat); dsc.rotation.z = Math.PI / 2; pivot.add(dsc);
      fine.push(rr); fine.push(dsc);
      var bandMat = new THREE.MeshBasicMaterial({ color: 0xe8be1d });
      [-1, 1].forEach(function (s) {
        var bd = new THREE.Mesh(bandGeo, bandMat);
        bd.rotation.y = Math.PI / 2; bd.position.x = s * 0.2; pivot.add(bd); fine.push(bd);
      });
      bands.push(bandMat);
      /* brake duct */
      var duct = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.3), carbon);
      duct.position.set(-Math.sign(w[1]) * 0.18, 0.02, 0); pivot.add(duct); fine.push(duct);
      g.add(pivot); wheels[w[0]] = { pivot: pivot, tyre: tw, rim: rr, disc: dsc };
    });

    g.scale.setScalar(0.92);
    return {
      group: g, wheels: wheels, paint: paint, trim: trim, fw: fw, rw: rw,
      helmet: helmet, driver: driver, halo: halo, drs: drsPivot, bands: bands,
      rearLight: rearLight, nose: nose, detail: detail, fine: fine, lod: 1,
      rim: rimMat, num: numMat
    };
  }

  // The safety car: a road-car silhouette in the series livery with a light bar.
  function makeSafetyCar() {
    var THREE = T(), g = new THREE.Group();
    var body = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.3, metalness: 0.2 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.6 });
    var glass = new THREE.MeshStandardMaterial({ color: 0x2a3440, roughness: 0.12, metalness: 0.6 });
    function add(geo, mat, x, y, z, rx) {
      var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      if (rx) m.rotation.x = rx; m.castShadow = true; g.add(m); return m;
    }
    add(new THREE.BoxGeometry(1.86, 0.58, 4.5), body, 0, 0.58, 0);
    add(new THREE.BoxGeometry(1.62, 0.52, 2.1), glass, 0, 1.08, -0.15);
    add(new THREE.BoxGeometry(1.7, 0.14, 4.3), dark, 0, 0.30, 0);
    add(new THREE.BoxGeometry(1.5, 0.1, 0.5), dark, 0, 1.38, -0.9);
    /* livery stripes */
    [-1, 1].forEach(function (s) {
      var st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 4.4),
        new THREE.MeshBasicMaterial({ color: s > 0 ? 0xd8382c : 0x2f6fd0 }));
      st.position.set(s * 0.94, 0.62, 0); g.add(st);
    });
    /* light bar */
    var bar = new THREE.Group(); bar.position.set(0, 1.42, -0.15); g.add(bar);
    add(new THREE.BoxGeometry(1.2, 0.1, 0.22), dark, 0, 1.40, -0.15);
    var lamps = [];
    [-1, 1].forEach(function (s) {
      var l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.24),
        new THREE.MeshBasicMaterial({ color: s > 0 ? 0xe8be1d : 0xe8be1d }));
      l.position.set(s * 0.32, 1.46, -0.15); g.add(l); lamps.push(l);
    });
    var wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 16);
    var tyreMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.95 });
    var wheels = [];
    [[-0.86, 1.5], [0.86, 1.5], [-0.86, -1.5], [0.86, -1.5]].forEach(function (w) {
      var m = new THREE.Mesh(wheelGeo, tyreMat);
      m.position.set(w[0], 0.42, w[1]); m.rotation.z = Math.PI / 2; m.castShadow = true;
      g.add(m); wheels.push(m);
    });
    g.visible = false;
    return { group: g, lamps: lamps, wheels: wheels };
  }

  // A recovery crane that lifts a stricken car off the circuit.
  function makeCrane() {
    var THREE = T(), g = new THREE.Group();
    var yellow = new THREE.MeshStandardMaterial({ color: 0xe8be1d, roughness: 0.6 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.7 });
    var base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 4.2), yellow);
    base.position.y = 0.9; base.castShadow = true; g.add(base);
    var cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.4), dark);
    cab.position.set(0, 1.8, 1.1); g.add(cab);
    var arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 4.6), yellow);
    arm.position.set(0, 2.3, -1.6); arm.rotation.x = 0.35; g.add(arm);
    [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]].forEach(function (w) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12), dark);
      m.position.set(w[0], 0.5, w[1]); m.rotation.z = Math.PI / 2; g.add(m);
    });
    g.visible = false;
    return { group: g, arm: arm };
  }

  function makeCar(opts) {
    var mesh = makeCarMesh(opts.color, opts.color2, opts.num);
    G.scene.add(mesh.group);
    var c = Object.assign({
      group: mesh.group, wheels: mesh.wheels, mesh: mesh,
      x: 0, z: 0, h: 0, vx: 0, vz: 0, speed: 0, steer: 0, idx: 0, lat: 0,
      lap: 0, prog: 0, ai: false, name: '?', rank: 1,
      tyre: 'M', tw: 1, fuel: 1, dmg: 0, boost: BOOST_MAX, boosting: false,
      inPit: false, pitPhase: 0, pitTimer: 0, stops: 0, penalty: 0, speeding: 0,
      finished: false, finishT: 0, lapStart: 0, bestLap: 0, lastLap: 0,
      hit: 0, slip: 0, onGrass: false, spin: 0, retired: false,
      sector: 0, sectorT: [0, 0, 0], bestSector: [0, 0, 0],
      wantPit: false, strategy: null, gapAhead: 0, slipstream: 0,
      drs: false, drsOpen: 0, drsAllowed: false, recover: 0, servePen: 0, upg: null
    }, opts);
    return c;
  }

  function placeOnGrid(car, slot) {
    var S = G.samples, n = G.N, hw = G.HALF_W;
    var back = 8 + slot * 4.6, side = (slot % 2 === 0 ? 1 : -1) * (hw * 0.40);
    var i = (n - Math.round(back) + n) % n, s = S[i];
    car.x = s.x + s.nx * side; car.z = s.z + s.nz * side; car.h = s.h;
    car.vx = car.vz = 0; car.speed = 0; car.steer = 0; car.idx = i; car.lat = side;
    car.lap = 0; car.prog = i - n;
    car.finished = false; car.retired = false; car.finishT = 0; car.lapStart = 0;
    car.bestLap = 0; car.lastLap = 0; car.hit = 0; car.slip = 0; car.spin = 0;
    car.tw = 1; car.fuel = 1; car.dmg = 0; car.boost = BOOST_MAX;
    car.inPit = false; car.pitPhase = 0; car.pitTimer = 0; car.stops = 0;
    car.penalty = 0; car.speeding = 0; car.wantPit = false; car.sector = 0;
    car.drs = false; car.drsOpen = 0; car.drsAllowed = false; car.recover = 0; car.servePen = 0;
    if (car.mesh.fw) car.mesh.fw.visible = true;
    if (car.mesh.drs) car.mesh.drs.rotation.x = 0;
    car.group.position.set(car.x, 0, car.z); car.group.rotation.set(0, car.h, 0);
    car.group.visible = true;
  }

  /* =================================================================
     PHYSICS
     ================================================================= */
  function tyreGrip(c) {
    var ty = D().tyre(c.tyre);
    var dry = ty.grip, wet = ty.wet;
    var g = dry * (1 - G.wet) + wet * G.wet;
    if (!ty.dryOK && G.wet < 0.3) g *= 0.93 - (0.3 - G.wet) * 0.25;   // wets cook in the dry
    g *= 0.80 + 0.20 * c.tw;
    g *= (1 - c.dmg * 0.14);
    if (c.gripMul) g *= c.gripMul;
    return g;
  }

  function latLimits(c) {
    var hw = G.HALF_W, n = G.N, pit = G.pit;
    var u = (c.idx - pit.entry + n) % n;
    if (c.inPit && u < pit.len) {
      var cl = laneLat(u);
      var apron = (u > 40 && u < pit.len - 40) ? APRON - 1.4 : 0;
      return { lo: cl - PIT_HALF + 0.6, hi: cl + PIT_HALF + apron - 0.6, pit: true };
    }
    var lo = -(hw + WALL_OFF - 1.0), hi = hw + WALL_OFF - 1.0;
    if (u > pit.wallFrom - 4 && u < pit.wallTo + 4) hi = hw + 1.0;
    else if (u < pit.len) hi = hw + WALL_OFF + PIT_HALF * 2;        // open at entry/exit
    return { lo: lo, hi: hi, pit: false };
  }

  function updateTrackPos(c) {
    var S = G.samples, n = G.N, best = c.idx, bd = 1e9;
    for (var k = -10; k <= 46; k++) {
      var i = (c.idx + k + n * 4) % n, s = S[i];
      var d = (s.x - c.x) * (s.x - c.x) + (s.z - c.z) * (s.z - c.z);
      if (d < bd) { bd = d; best = i; }
    }
    var prev = c.idx; c.idx = best;
    var s0 = S[best];
    c.lat = (c.x - s0.x) * s0.nx + (c.z - s0.z) * s0.nz;
    var lim = latLimits(c);
    c.onGrass = !lim.pit && (c.lat > G.HALF_W + 0.4 || c.lat < -G.HALF_W - 0.4);
    if (prev > n * 0.85 && best < n * 0.15) { c.lap++; if (GP.onLap) GP.onLap(c); }
    else if (prev < n * 0.15 && best > n * 0.85) c.lap--;
    c.prog = c.lap * n + best;
    // sectors
    var sec = best < G.sectors[1] ? 0 : (best < G.sectors[2] ? 1 : 2);
    if (sec !== c.sector) { if (GP.onSector) GP.onSector(c, c.sector, sec); c.sector = sec; }
  }

  function stepCar(c, inp, dt) {
    if (c.retired) return;
    var n = G.N, pit = G.pit;
    var u = (c.idx - pit.entry + n) % n;
    var lim = latLimits(c);

    // pit lane entry / exit bookkeeping
    if (!c.inPit && u < 55 && c.lat > G.HALF_W - 1.9 && c.wantPit) c.inPit = true;
    if (c.pitPhase === 2 && Math.abs(c.speed) > 4) c.pitPhase = 0;
    if (c.inPit && u >= pit.len - 2) {
      c.inPit = false; c.wantPit = false; c.pitPhase = 0;
      var sx = G.samples[c.idx];
      var want = G.HALF_W - 1.6;
      var shift = c.lat - want;
      c.x -= sx.nx * shift; c.z -= sx.nz * shift; c.lat = want;
    }

    var grip = tyreGrip(c) * (c.onGrass ? 0.42 : 1);
    var maxS = MAX_SPEED * c.perf * (1 - c.dmg * 0.18) * (1 - (1 - c.tw) * 0.05);
    if (c.onGrass) maxS = Math.min(maxS, 27);
    if (c.inPit) maxS = Math.min(maxS, PIT_LIMIT * 2.2);
    if (c.slipstream > 0) maxS *= 1 + 0.075 * c.slipstream;
    if (c.boosting && c.boost > 0) maxS *= 1.075;
    if (c.drs) maxS *= 1.105;

    var s = c.speed;
    var fuelMass = 1 - c.fuel * 0.11;
    var held = (c.pitPhase === 1 || c.pitPhase === 0.5);
    if (inp.gas && !c.finished && !held) {
      var acc = ACCEL * fuelMass * (c.boosting && c.boost > 0 ? 1.16 : 1);
      s += acc * dt * (1 - Math.max(0, s) / maxS * 0.62);
      c.fuel = Math.max(0, c.fuel - dt * 0.0022);
    }
    if (inp.brake) { if (s > 0.5) s -= BRAKE * grip * 0.92 * dt; else s = Math.max(-9, s - BRAKE * 0.3 * dt); }
    if (inp.hand && s > 0) s -= BRAKE * 0.55 * dt;
    if (!inp.gas && !inp.brake) { if (s > 0) s = Math.max(0, s - ROLL * dt); else if (s < 0) s = Math.min(0, s + ROLL * 3 * dt); }
    if (c.onGrass && s > 0) s = Math.max(0, s - 16 * dt);
    s -= DRAG * s * Math.abs(s) * dt;
    if (s > maxS + 4) s -= (s - maxS) * 2.5 * dt;
    c.speed = s;

    if (c.boosting && c.boost > 0 && inp.gas) c.boost = Math.max(0, c.boost - dt);

    // tyre wear: cornering load and slip cost more than straight-line running
    var ty = D().tyre(c.tyre);
    var load = 0.45 + Math.abs(c.steer) * 0.9 + c.slip * 1.4 + (inp.brake ? 0.3 : 0);
    var tyreUp = c.upg ? (1 - c.upg.tyres * 0.055) : 1;
    if (c.wearMul) tyreUp *= c.wearMul;
    c.tw = Math.max(0, c.tw - dt * 0.0072 * ty.wear * load * (1 - G.wet * 0.35) * tyreUp);

    // steering
    var sf = 1 / (1 + Math.abs(s) * 0.021);
    var target = inp.steer * STEER_MAX * sf;
    c.steer += (target - c.steer) * Math.min(1, dt * 10);
    var wob = c.dmg > 0.3 ? Math.sin(performance.now() * 0.011) * c.dmg * 0.05 : 0;
    var turn = (c.steer + wob) * TURN_RATE * clamp(Math.abs(s) / 12, 0, 1) * (s < 0 ? -1 : 1) * (inp.hand ? 1.35 : 1);
    turn *= 0.86 + grip * 0.16;
    if (c.spin > 0) { turn += c.spinDir * 2.4 * Math.min(1, c.spin); c.spin -= dt; }
    c.h += turn * dt;

    var fx = Math.sin(c.h), fz = Math.cos(c.h);
    var gk = (c.onGrass ? 2.2 : (inp.hand ? 3.0 : 7.4)) * (0.72 + grip * 0.34);
    c.vx += (fx * s - c.vx) * Math.min(1, gk * dt);
    c.vz += (fz * s - c.vz) * Math.min(1, gk * dt);
    c.x += c.vx * dt; c.z += c.vz * dt;
    var vlen = Math.hypot(c.vx, c.vz);
    c.slip = vlen > 6 ? Math.abs(wrapAng(Math.atan2(c.vx, c.vz) - c.h)) : 0;

    updateTrackPos(c);
    lim = latLimits(c);

    // pit lane speeding
    if (c.inPit && u > 30 && u < pit.len - 30) {
      if (c.speed > PIT_LIMIT + 0.6) {
        c.speeding += dt;
        if (c.speeding > 0.5 && !c.gotPen) { c.gotPen = true; c.penalty += 3; if (GP.onPenalty) GP.onPenalty(c); }
      }
    } else { c.speeding = 0; c.gotPen = false; }

    // walls
    if (c.lat > lim.hi || c.lat < lim.lo) {
      var s0 = G.samples[c.idx];
      var over = c.lat > lim.hi ? c.lat - lim.hi : c.lat - lim.lo;
      c.x -= s0.nx * over; c.z -= s0.nz * over; c.lat -= over;
      var vn = c.vx * s0.nx + c.vz * s0.nz;
      if ((over > 0 && vn > 0) || (over < 0 && vn < 0)) { c.vx -= s0.nx * vn * 1.35; c.vz -= s0.nz * vn * 1.35; }
      if (c.hit <= 0) {
        var force = Math.min(1, Math.abs(vn) / 30);
        c.speed *= 0.55; c.hit = 0.35;
        if (fxNear(c.x, c.z)) fxSparks(c.x + s0.nx * (over > 0 ? 1 : -1) * 0.9, c.z + s0.nz * (over > 0 ? 1 : -1) * 0.9, -s0.nx * (over > 0 ? 1 : -1) + fx * 0.6, -s0.nz * (over > 0 ? 1 : -1) + fz * 0.6, 8 + Math.round(force * 18));
        c.dmg = Math.min(1, c.dmg + force * 0.045 * (c.upg ? 1 - c.upg.rely * 0.08 : 1));
        if (c.dmg > 0.7 && c.mesh.fw.visible) c.mesh.fw.visible = false;
        if (GP.onHit) GP.onHit(c, force);
      }
    }
    if (c.hit > 0) c.hit -= dt;

    // pose
    c.group.position.set(c.x, 0, c.z);
    c.group.rotation.set(0, c.h, -c.steer * 0.055 * clamp(Math.abs(s) / 40, 0, 1));
    var wr = s * dt / 0.37;
    for (var k in c.wheels) { c.wheels[k].tyre.rotation.x += wr; c.wheels[k].rim.rotation.x += wr; }
    c.wheels.fl.pivot.rotation.y = c.wheels.fr.pivot.rotation.y = c.steer * 0.55;
    // DRS flap animates open, rear light blinks in the wet
    if (c.mesh.drs) {
      var want = c.drs ? -0.62 : 0;
      c.drsOpen += (want - c.drsOpen) * Math.min(1, dt * 9);
      c.mesh.drs.rotation.x = c.drsOpen;
    }
    if (c.mesh.rearLight) {
      var lit = inp.brake || (G.wet > 0.3 && (performance.now() % 500 < 250));
      c.mesh.rearLight.material.color.setHex(lit ? 0xff2a18 : 0x5a1510);
    }
    fxCarTick(c, inp, dt);
  }

  function collisions() {
    var cs = G.cars;
    for (var i = 0; i < cs.length; i++) for (var j = i + 1; j < cs.length; j++) {
      var a = cs[i], b = cs[j];
      if (a.retired || b.retired) continue;
      var dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), R = 2.9;
      if (d < R && d > 0.001) {
        var nx = dx / d, nz = dz / d, push = (R - d) * 0.5 + 0.02;
        a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
        var rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rel < 0) {
          var k = rel * 1.05;                       // near-elastic, no squashing through
          a.vx += nx * k; a.vz += nz * k; b.vx -= nx * k; b.vz -= nz * k;
          var f = Math.min(1, Math.abs(rel) / 26);
          a.speed *= 1 - f * 0.14; b.speed *= 1 - f * 0.14;
          a.dmg = Math.min(1, a.dmg + f * 0.02); b.dmg = Math.min(1, b.dmg + f * 0.02);
          // a solid hit sends the car that was struck sideways, off the line
          if (f > 0.22) {
            var s0 = G.samples[b.idx];
            var side = (nx * s0.nx + nz * s0.nz) > 0 ? 1 : -1;
            var kick = f * 16;
            b.vx += s0.nx * side * kick; b.vz += s0.nz * side * kick;
            b.spin = Math.min(1.0, f * 0.9); b.spinDir = side;
            a.vx -= s0.nx * side * kick * 0.35; a.vz -= s0.nz * side * kick * 0.35;
          }
          if (f > 0.3 && GP.onHit) { GP.onHit(a, f * 0.8); GP.onHit(b, f * 0.6); }
          if (f > 0.25 && fxNear(a.x, a.z)) fxSparks((a.x + b.x) / 2, (a.z + b.z) / 2, -nx, -nz, 6 + Math.round(f * 12));
        }
      }
    }
    // slipstream: a car close behind another gains top speed
    for (i = 0; i < cs.length; i++) {
      var c = cs[i]; c.slipstream = 0;
      if (c.retired || c.inPit) continue;
      for (j = 0; j < cs.length; j++) {
        var o = cs[j]; if (o === c || o.retired) continue;
        var ddx = o.x - c.x, ddz = o.z - c.z;
        var fwd = ddx * Math.sin(c.h) + ddz * Math.cos(c.h);
        var side = ddx * Math.cos(c.h) - ddz * Math.sin(c.h);
        if (fwd > 2 && fwd < 15 && Math.abs(side) < 3.2) {
          c.slipstream = Math.max(c.slipstream, 1 - (fwd - 2) / 13);
        }
      }
    }
  }

  /* =================================================================
     AI
     ================================================================= */
  function aiInput(c, ctx) {
    var S = G.samples, n = G.N, pit = G.pit;
    var u = (c.idx - pit.entry + n) % n;
    var skill = c.skill || 0.9;

    // --- pit lane driving
    if (c.inPit && u < pit.len) {
      var cl = laneLat(u);
      var boxU = c.boxU;
      var tgtLat = (u > boxU - 40 && u < boxU + 12) ? cl + 1.6 : cl;
      var look = 7 + Math.abs(c.speed) * 0.28;
      var t2 = S[(c.idx + Math.round(look)) % n];
      var ang2 = wrapAng(Math.atan2(t2.x + t2.nx * tgtLat - c.x, t2.z + t2.nz * tgtLat - c.z) - c.h);
      var want = PIT_LIMIT - 0.8;
      if (c.pitPhase === 1) want = 0;
      else if (u > boxU - 26 && c.pitPhase === 0 && c.stopsDone < c.stopsPlanned) want = Math.max(0, (boxU - u) * 0.5);
      return { steer: clamp(ang2 * 2.2, -1, 1), gas: c.speed < want, brake: c.speed > want + 1.2, hand: false };
    }

    // --- decide to pit
    if (!c.wantPit && !c.finished && ctx.phase === 'race' && c.stopsDone < c.stopsPlanned) {
      var lapDue = c.pitLaps[c.stopsDone];
      if (c.lap >= lapDue || c.tw < 0.22 || (G.wet > 0.55 && D().tyre(c.tyre).dryOK) || (G.wet < 0.2 && !D().tyre(c.tyre).dryOK)) {
        if (u > pit.len && u < n - 90) c.wantPit = true;
      }
    }
    var laneBias = 0;
    if (c.wantPit && ((c.idx - pit.entry + n) % n) > n - 90) laneBias = (G.HALF_W - 1.4) - c.lineTarget;

    // --- racing line with a small personal offset
    c.laneT += (Math.sin(ctx.t * 0.0003 + c.jitter) * 1.6 - c.laneT) * 0.0018;
    var lookAhead = 8 + Math.abs(c.speed) * (0.38 + skill * 0.08);
    var t = S[(c.idx + Math.round(lookAhead)) % n];
    c.lineTarget = t.line;
    var tlat = t.line + c.laneT + laneBias + c.avoid;
    tlat = clamp(tlat, -G.HALF_W + 1.1, G.HALF_W - 1.1);
    var ang = wrapAng(Math.atan2(t.x + t.nx * tlat - c.x, t.z + t.nz * tlat - c.z) - c.h);

    // --- traffic
    c.avoid += (0 - c.avoid) * 0.04;
    var blocked = 0;
    for (var i = 0; i < G.cars.length; i++) {
      var o = G.cars[i]; if (o === c || o.retired) continue;
      var dx = o.x - c.x, dz = o.z - c.z;
      var fwd = dx * Math.sin(c.h) + dz * Math.cos(c.h);
      var side = dx * Math.cos(c.h) - dz * Math.sin(c.h);
      if (fwd > 0 && fwd < 13 && Math.abs(side) < 2.6) {
        blocked = Math.max(blocked, 1 - fwd / 13);
        var dir = side > 0 ? -1 : 1;
        if (Math.abs(c.lineTarget + c.avoid) > G.HALF_W - 2.4) dir = -dir;
        c.avoid += dir * (0.5 + c.agg * 0.8) * 0.06;
        ang += dir * 0.16 * (0.6 + c.agg * 0.7);
      }
    }
    c.avoid = clamp(c.avoid, -G.HALF_W + 1.6, G.HALF_W - 1.6);

    // --- speed target: scan ahead far enough to actually brake for the corner
    var grip = tyreGrip(c);
    var cornerK = (0.93 + skill * 0.075) * (0.86 + grip * 0.16) * ctx.aiScale;
    var decel = BRAKE * grip * 0.72;
    var v = Math.abs(c.speed);
    var tgt = MAX_SPEED * c.perf * ctx.aiScale;
    var scan = Math.min(300, 40 + v * 3.4);
    for (var d = 8; d < scan; d += 8) {
      var sv = S[(c.idx + d) % n].vmax * cornerK;
      if (sv >= tgt) continue;
      var allowed = Math.sqrt(sv * sv + 2 * decel * d);
      if (allowed < tgt) tgt = allowed;
    }
    if (blocked > 0.45 && Math.abs(c.avoid) < 1.2) tgt *= 1 - blocked * 0.22;
    if (c.slipstream > 0.4 && c.agg > 0.6) tgt *= 1.03;
    if (c.drs) tgt *= 1.06;
    // flags: the same ceilings the player is held to
    if (ctx.red > 0) tgt = Math.min(tgt, CAPS.red);
    else if (ctx.safety) tgt = Math.min(tgt, CAPS.sc);
    else if (ctx.yellow && ctx.yellow[c.sector] > 0) tgt = Math.min(tgt, CAPS.yellow);
    if (ctx.safety) tgt = Math.min(tgt, CAPS.sc);
    if (c.finished) tgt = Math.min(tgt, 26);
    if (G.wet > 0.4) tgt *= 1 - G.wet * 0.06;

    // --- mistakes
    if (ctx.phase === 'race' && !ctx.safety) {
      c.mistCd -= ctx.dt;
      if (c.mistCd <= 0) {
        c.mistCd = 6 + Math.random() * 30;
        var chance = (1 - c.cons) * 0.55 * ctx.mist * (1 + G.wet * 1.4) * (c.tw < 0.3 ? 1.6 : 1);
        if (Math.random() < chance) {
          if (Math.random() < 0.45) { c.spin = 0.5 + Math.random() * 0.5; c.spinDir = Math.random() < 0.5 ? -1 : 1; }
          c.mistake = 0.7 + Math.random() * 0.8;
        }
      }
      if (c.mistake > 0) { c.mistake -= ctx.dt; tgt *= 0.62; }
    }
    // technical trouble
    if (ctx.phase === 'race' && !c.retired) {
      c.relCd -= ctx.dt;
      if (c.relCd <= 0) {
        c.relCd = 45 + Math.random() * 90;
        if (Math.random() < 0.0016 * ctx.mist) c.dmg = Math.min(1, c.dmg + 0.26);
        if (c.dmg > 0.95 && Math.random() < 0.3) { if (GP.onRetire) GP.onRetire(c); }
      }
    }

    return {
      steer: clamp(ang * 2.5, -1, 1),
      gas: c.speed < tgt,
      brake: c.speed > tgt + 2.5,
      hand: false
    };
  }

  /* =================================================================
     FX — tyre smoke, grass dust, sparks and rubber on the road.
     One Points object per blend mode and one InstancedMesh for the skid
     marks, so the whole lot is three draw calls whatever is going on.
     ================================================================= */
  var FX = { n: 520, smoke: null, spark: null, skid: null, skidN: 1100, skidI: 0, ready: false, camX: 0, camZ: 0 };

  function fxPoints(additive) {
    var THREE = T(), n = FX.n;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(n * 3), col = new Float32Array(n * 3), siz = new Float32Array(n), alp = new Float32Array(n);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
    var mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute float aSize; attribute float aAlpha; attribute vec3 aCol; varying float vA; varying vec3 vC;' +
        'void main(){ vA=aAlpha; vC=aCol; vec4 mv=modelViewMatrix*vec4(position,1.0);' +
        ' gl_PointSize=aSize*(260.0/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying float vA; varying vec3 vC;' +
        'void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); if(r>0.5) discard;' +
        ' float a=smoothstep(0.5,0.12,r)*vA; gl_FragColor=vec4(vC,a); }'
    });
    var pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
    return { pts: pts, geo: geo, pos: pos, col: col, siz: siz, alp: alp, i: 0,
      vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), grow: new Float32Array(n), additive: additive };
  }
  function fxInit() {
    if (FX.ready) return;
    var THREE = T();
    FX.smoke = fxPoints(false); FX.spark = fxPoints(true);
    G.scene.add(FX.smoke.pts); G.scene.add(FX.spark.pts);
    var skidMat = new THREE.MeshBasicMaterial({ color: 0x121417, transparent: true, opacity: 0.55, depthWrite: false });
    var skid = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.36, 1.0), skidMat, FX.skidN);
    skid.frustumCulled = false; skid.renderOrder = 2;
    var zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (var i = 0; i < FX.skidN; i++) skid.setMatrixAt(i, zero);
    skid.instanceMatrix.needsUpdate = true;
    FX.skid = skid; G.scene.add(skid);
    FX.ready = true;
  }
  function fxReset() {
    if (!FX.ready) return;
    var zero = new (T().Matrix4)().makeScale(0, 0, 0);
    for (var i = 0; i < FX.skidN; i++) FX.skid.setMatrixAt(i, zero);
    FX.skid.instanceMatrix.needsUpdate = true; FX.skidI = 0;
    [FX.smoke, FX.spark].forEach(function (P) { for (var k = 0; k < FX.n; k++) { P.life[k] = 0; P.alp[k] = 0; P.siz[k] = 0; } });
  }
  function fxEmit(P, x, y, z, vx, vy, vz, life, size, r, g, b, grow) {
    var i = P.i; P.i = (P.i + 1) % FX.n;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
    P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    P.life[i] = life; P.max[i] = life; P.siz[i] = size; P.grow[i] = grow || 0;
    P.col[i * 3] = r; P.col[i * 3 + 1] = g; P.col[i * 3 + 2] = b; P.alp[i] = 1;
  }
  // near the camera only: nobody sees a puff of smoke 300 metres away
  function fxNear(x, z) { var dx = x - FX.camX, dz = z - FX.camZ; return dx * dx + dz * dz < 90 * 90; }

  function fxSmoke(x, z, strength, dust) {
    if (!FX.ready) return;
    var n = dust ? 1 : 2;
    for (var k = 0; k < n; k++) {
      var a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.2;
      if (dust) fxEmit(FX.smoke, x + (Math.random() - 0.5) * 0.6, 0.25, z + (Math.random() - 0.5) * 0.6,
        Math.cos(a) * sp, 0.9 + Math.random() * 0.8, Math.sin(a) * sp, 0.7 + Math.random() * 0.5, 1.4 + Math.random(), 0.62, 0.52, 0.36, 2.2);
      else fxEmit(FX.smoke, x + (Math.random() - 0.5) * 0.4, 0.28, z + (Math.random() - 0.5) * 0.4,
        Math.cos(a) * sp * 0.7, 1.1 + Math.random() * 1.2, Math.sin(a) * sp * 0.7, 0.8 + Math.random() * 0.7 * strength, 1.0 + Math.random() * 0.8 * strength, 0.84, 0.84, 0.86, 2.0);
    }
  }
  function fxSparks(x, z, dx, dz, count) {
    if (!FX.ready) return;
    for (var k = 0; k < count; k++) {
      var a = Math.atan2(dx, dz) + (Math.random() - 0.5) * 1.6, sp = 6 + Math.random() * 12;
      var hot = Math.random();
      fxEmit(FX.spark, x, 0.22 + Math.random() * 0.3, z, Math.sin(a) * sp, 2 + Math.random() * 5, Math.cos(a) * sp,
        0.25 + Math.random() * 0.35, 0.14 + Math.random() * 0.14, 1.0, 0.72 + hot * 0.25, 0.25 + hot * 0.4, -0.3);
    }
  }
  var _m4 = null, _q = null, _v3 = null, _sc = null;
  function fxSkid(x, z, h, dark) {
    if (!FX.ready) return;
    var THREE = T();
    _m4 = _m4 || new THREE.Matrix4(); _q = _q || new THREE.Quaternion(); _v3 = _v3 || new THREE.Vector3(); _sc = _sc || new THREE.Vector3();
    // a flat quad, turned to lie on the road and point along the heading
    _q.setFromEuler(new THREE.Euler(-Math.PI / 2, h, 0, 'YXZ'));
    _v3.set(x, 0.02, z); _sc.set(1, 1, 1);
    _m4.compose(_v3, _q, _sc);
    FX.skid.setMatrixAt(FX.skidI, _m4);
    FX.skid.instanceMatrix.needsUpdate = true;
    FX.skidI = (FX.skidI + 1) % FX.skidN;
  }

  // per car, per physics step: decide what the tyres are doing right now
  function fxCarTick(c, inp, dt) {
    if (!FX.ready || c.retired) return;
    var sp = Math.abs(c.speed);
    if (sp < 4 || !fxNear(c.x, c.z)) { c.skidAcc = 0; return; }
    var fx = Math.sin(c.h), fz = Math.cos(c.h), rx = Math.cos(c.h), rz = -Math.sin(c.h);
    var lockup = inp.brake && sp > 26 && !c.onGrass && (c.tw < 0.35 || c.slip > 0.05 || Math.random() < 0.12);
    var sliding = c.slip > 0.16 || (inp.hand && sp > 14) || c.spin > 0 || lockup;
    c.skidAcc = (c.skidAcc || 0) + sp * dt;
    if (c.onGrass) {
      if (Math.random() < dt * 24) fxSmoke(c.x - fx * 1.2, c.z - fz * 1.2, 0.8, true);
      c.skidAcc = 0; return;
    }
    if (!sliding) { c.skidAcc = 0; return; }
    var strength = Math.min(1, (c.slip > 0.16 ? c.slip * 2.2 : 0.6) + (c.spin > 0 ? 0.6 : 0));
    var wet = G.wet > 0.3;
    if (Math.random() < dt * (wet ? 8 : 22) * strength)
      fxSmoke(c.x - fx * 1.15 + rx * (Math.random() < 0.5 ? 0.9 : -0.9), c.z - fz * 1.15 + rz * (Math.random() < 0.5 ? 0.9 : -0.9), strength, false);
    // rubber every 0.55 units of travel, under both rear wheels
    if (!wet && c.skidAcc > 0.55) {
      c.skidAcc = 0;
      fxSkid(c.x - fx * 1.15 + rx * 0.9, c.z - fz * 1.15 + rz * 0.9, c.h);
      fxSkid(c.x - fx * 1.15 - rx * 0.9, c.z - fz * 1.15 - rz * 0.9, c.h);
    }
  }

  function fxTick(dt) {
    if (!FX.ready) return;
    FX.camX = G.camera.position.x; FX.camZ = G.camera.position.z;
    [FX.smoke, FX.spark].forEach(function (P) {
      var any = false;
      for (var i = 0; i < FX.n; i++) {
        if (P.life[i] <= 0) { if (P.alp[i] !== 0) { P.alp[i] = 0; P.siz[i] = 0; any = true; } continue; }
        any = true;
        P.life[i] -= dt;
        var t = 1 - P.life[i] / P.max[i];
        if (P.additive) { P.vel[i * 3 + 1] -= 22 * dt; P.alp[i] = 1 - t; }
        else { P.vel[i * 3] *= 0.97; P.vel[i * 3 + 2] *= 0.97; P.siz[i] += P.grow[i] * dt; P.alp[i] = (1 - t) * 0.42; }
        P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
        if (P.additive && P.pos[i * 3 + 1] < 0.02) { P.pos[i * 3 + 1] = 0.02; P.vel[i * 3 + 1] *= -0.35; }
      }
      if (any) { P.geo.attributes.position.needsUpdate = true; P.geo.attributes.aAlpha.needsUpdate = true; P.geo.attributes.aSize.needsUpdate = true; P.geo.attributes.aCol.needsUpdate = true; }
    });
  }

  /* =================================================================
     CAMERA
     ================================================================= */
  // Distance culling for car detail. Only flipped when the band changes, so a
  // car sitting at a constant distance costs nothing.
  function updateCarDetail() {
    var cam = G.camera; if (!cam) return;
    var cx = cam.position.x, cz = cam.position.z;
    for (var i = 0; i < G.cars.length; i++) {
      var c = G.cars[i], m = c.mesh;
      if (!m || !m.detail) continue;
      var d = Math.hypot(c.x - cx, c.z - cz);
      var want = (c === G.player || d < 46) ? 1 : 0;
      if (want === m.lod) continue;
      m.lod = want;
      m.detail.visible = !!want;
      for (var k = 0; k < m.fine.length; k++) m.fine[k].visible = !!want;
    }
    if (G.bayKits) {
      for (var b = 0; b < G.bayKits.length; b++) {
        var kt = G.bayKits[b];
        var on = Math.hypot(kt.x - cx, kt.z - cz) < 80;
        if (kt.g.visible !== on) kt.g.visible = on;
      }
    }
  }

  var CAM_MODES = ['CHASE', 'COCKPIT', 'HOOD', 'TV'];
  function updateCamera(dt, snap) {
    var me = G.player, cam = G.camera;
    if (!me) return;
    var fx = Math.sin(me.h), fz = Math.cos(me.h);
    var sp = Math.max(0, me.speed);
    var mode = CAM_MODES[G.camMode];
    var tx, ty, tz, lx, ly, lz, fov, k = snap ? 1 : Math.min(1, dt * 6);

    if (mode === 'CHASE') {
      var back = 8.8 + sp * 0.036, up = 3.1 + sp * 0.012;
      tx = me.x - fx * back; ty = up; tz = me.z - fz * back;
      lx = me.x + fx * 7; ly = 0.95; lz = me.z + fz * 7;
      fov = 58 + sp * 0.26;
    } else if (mode === 'COCKPIT') {
      tx = me.x + fx * 0.28; ty = 1.05; tz = me.z + fz * 0.28;
      lx = me.x + fx * 14; ly = 0.98; lz = me.z + fz * 14;
      fov = 74 + sp * 0.18; k = snap ? 1 : Math.min(1, dt * 18);
    } else if (mode === 'HOOD') {
      tx = me.x + fx * 1.5; ty = 0.95; tz = me.z + fz * 1.5;
      lx = me.x + fx * 16; ly = 0.9; lz = me.z + fz * 16;
      fov = 68 + sp * 0.2; k = snap ? 1 : Math.min(1, dt * 16);
    } else {
      var s = G.samples[(me.idx + 30) % G.N];
      var sd = s.curv > 0 ? -1 : 1;
      tx = s.x + s.nx * sd * (G.HALF_W + 16); ty = 9; tz = s.z + s.nz * sd * (G.HALF_W + 16);
      lx = me.x; ly = 1.0; lz = me.z; fov = 46; k = snap ? 1 : Math.min(1, dt * 4);
    }
    G.camPos.x = lerp(G.camPos.x, tx, k); G.camPos.y = lerp(G.camPos.y, ty, k); G.camPos.z = lerp(G.camPos.z, tz, k);
    G.camLook.x = lerp(G.camLook.x, lx, k); G.camLook.y = lerp(G.camLook.y, ly, k); G.camLook.z = lerp(G.camLook.z, lz, k);
    cam.position.copy(G.camPos);
    if (G.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * G.shake;
      cam.position.y += (Math.random() - 0.5) * G.shake * 0.6;
      cam.position.z += (Math.random() - 0.5) * G.shake;
      G.shake = Math.max(0, G.shake - dt * 1.6);
    }
    cam.lookAt(G.camLook);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (G.sky) G.sky.position.set(me.x, -60, me.z);
    if (G.sun) {
      G.sun.position.set(me.x + 80, 120, me.z + 50);
      G.sun.target.position.set(me.x, 0, me.z); G.sun.target.updateMatrixWorld();
    }
    if (me.mesh && me.mesh.driver) me.mesh.driver.visible = (mode !== 'COCKPIT');
    if (me.mesh && me.mesh.halo) me.mesh.halo.visible = (mode !== 'COCKPIT');
  }

  /* =================================================================
     WEATHER visuals
     ================================================================= */
  function applyWet() {
    if (!G.tarMat) return;
    var w = G.wet;
    G.tarMat.color.setHex(0xb0b2b6).multiplyScalar(1 - w * 0.4);
    G.tarMat.roughness = 0.92 - w * 0.55;
    G.tarMat.metalness = w * 0.35;
    if (G.hemi) G.hemi.intensity = (G.night ? 0.42 : 0.78) * (1 - w * 0.3);
    if (G.sun) G.sun.intensity = (G.night ? 0.55 : 1.12) * (1 - w * 0.55);
    if (G.scene && G.scene.fog) G.scene.fog.near = 320 - w * 150;
  }

  // A person, used by the garage, the pit crew and the podium ceremony.
  // Returns the group plus the joints the ceremony needs to animate.
  function makePerson(opts) {
    var THREE = T(), o = opts || {};
    var suit = new THREE.MeshStandardMaterial({ color: o.suit == null ? 0x15a89d : o.suit, roughness: 0.72 });
    var trim = new THREE.MeshStandardMaterial({ color: o.trim == null ? 0xeaf6f4 : o.trim, roughness: 0.6 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.7 });
    var skin = new THREE.MeshStandardMaterial({ color: o.skin == null ? 0xc99a76 : o.skin, roughness: 0.72 });
    var g = new THREE.Group();
    function part(geo, mat, x, y, z, parent) {
      var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      m.castShadow = true; (parent || g).add(m); return m;
    }
    var hipL = new THREE.Group(); hipL.position.set(-0.12, 0.84, 0); g.add(hipL);
    var hipR = new THREE.Group(); hipR.position.set(0.12, 0.84, 0); g.add(hipR);
    part(new THREE.BoxGeometry(0.18, 0.84, 0.2), dark, 0, -0.42, 0, hipL);
    part(new THREE.BoxGeometry(0.18, 0.84, 0.2), dark, 0, -0.42, 0, hipR);
    part(new THREE.BoxGeometry(0.22, 0.1, 0.32), dark, 0, -0.84, 0.05, hipL);
    part(new THREE.BoxGeometry(0.22, 0.1, 0.32), dark, 0, -0.84, 0.05, hipR);
    var torso = part(new THREE.BoxGeometry(0.48, 0.64, 0.28), suit, 0, 1.17, 0);
    part(new THREE.BoxGeometry(0.5, 0.16, 0.3), trim, 0, 1.0, 0);
    var shL = new THREE.Group(); shL.position.set(-0.31, 1.4, 0); g.add(shL);
    var shR = new THREE.Group(); shR.position.set(0.31, 1.4, 0); g.add(shR);
    part(new THREE.BoxGeometry(0.14, 0.58, 0.16), suit, 0, -0.29, 0, shL);
    part(new THREE.BoxGeometry(0.14, 0.58, 0.16), suit, 0, -0.29, 0, shR);
    part(new THREE.BoxGeometry(0.13, 0.13, 0.13), skin, 0, -0.62, 0, shL);
    part(new THREE.BoxGeometry(0.13, 0.13, 0.13), skin, 0, -0.62, 0, shR);
    var neck = part(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 8), skin, 0, 1.54, 0);
    var head = part(new THREE.SphereGeometry(0.15, 14, 12), skin, 0, 1.71, 0);
    head.scale.set(1, 1.06, 0.96);
    var hair = part(new THREE.SphereGeometry(0.155, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: o.hair == null ? 0x3a2b1f : o.hair, roughness: 0.85 }), 0, 1.73, 0);
    if (o.cap) {
      part(new THREE.SphereGeometry(0.163, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), suit, 0, 1.74, 0);
      part(new THREE.BoxGeometry(0.3, 0.03, 0.17), suit, 0, 1.72, 0.17);
      hair.visible = false;
    }
    g.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
    return { group: g, shL: shL, shR: shR, hipL: hipL, hipR: hipR, head: head, torso: torso, suit: suit, trim: trim };
  }

  /* =================================================================
     GARAGE VIEWER
     Its own renderer on its own canvas: the car on a four-post lift that
     raises so the floor and diffuser can be inspected from underneath.
     ================================================================= */
  var GAR = null;

  function garageEnter(canvas, opts) {
    var THREE = T();
    if (!GAR) {
      var r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.outputEncoding = THREE.sRGBEncoding;
      var sc = new THREE.Scene();
      var cam = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
      sc.add(new THREE.HemisphereLight(0xf4ece0, 0x4a4238, 0.42));
      var key = new THREE.DirectionalLight(0xfff3e0, 0.72);
      key.position.set(4, 9, 7); key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -6; key.shadow.camera.right = 6;
      key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
      sc.add(key);
      var fill = new THREE.DirectionalLight(0xdfe6ef, 0.3); fill.position.set(-6, 3, -5); sc.add(fill);
      var up = new THREE.PointLight(0xffe6c0, 0.4, 14); up.position.set(0, -1.2, 0); sc.add(up);
      // daylight spilling in through the open front of the bay
      var mouth = new THREE.DirectionalLight(0xeaf2ff, 0.5); mouth.position.set(0, 3, 14); sc.add(mouth);
      var floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30),
        new THREE.MeshStandardMaterial({ color: 0xe6ddcd, roughness: 0.55, metalness: 0.06 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
      GAR = {
        r: r, sc: sc, cam: cam, key: key,
        lift: new THREE.Group(), posts: [], car: null, room: null, crew: [],
        yaw: 0.42, pitch: 0.17, dist: 13.5, height: 0, raf: 0, team: null
      };
      sc.background = null;
      sc.add(GAR.lift);
      var postMat = new THREE.MeshStandardMaterial({ color: 0x6f7681, roughness: 0.5, metalness: 0.35 });
      [[-1.5, 2.0], [1.5, 2.0], [-1.5, -2.0], [1.5, -2.0]].forEach(function (p) {
        var post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.2, 0.22), postMat);
        post.position.set(p[0], 2.1, p[1]); sc.add(post);
        GAR.posts.push(post);
      });
      var armMat = new THREE.MeshStandardMaterial({ color: 0xe8be1d, roughness: 0.6 });
      [-1, 1].forEach(function (s) {
        var arm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 4.6), armMat);
        arm.position.set(s * 1.5, -0.1, 0); GAR.lift.add(arm);
      });
    }
    garageSetCar(opts && opts.color, opts && opts.color2, opts && opts.num);
    garageBuildRoom(opts || {});
    garageResize();
    if (!GAR.raf) garageLoop();
    return GAR;
  }

  // The bay itself: back and side walls in the team's colour, a branded
  // fascia, ceiling light strips, tool cabinets, tyre stacks, monitor bank,
  // the pit crew standing around the car and the driver beside it.
  function garageBuildRoom(opts) {
    var THREE = T();
    var key = (opts.teamName || '') + '|' + (opts.color || 0);
    if (GAR.room && GAR.team === key) return;
    if (GAR.room) { GAR.sc.remove(GAR.room); disposeGroup(GAR.room); }
    GAR.team = key;
    var col = new THREE.Color(opts.color == null ? 0x15a89d : opts.color);
    var col2 = new THREE.Color(opts.color2 == null ? 0xeaf6f4 : opts.color2);
    var room = new THREE.Group(); GAR.room = room; GAR.sc.add(room);
    GAR.crew = [];

    var W = 13, Dp = 15, H = 6.2;
    var wallMat = new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.85 });
    var darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.6 });
    var teamMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });
    function box(w, h, d, mat, x, y, z, ry) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); if (ry) m.rotation.y = ry;
      m.receiveShadow = true; room.add(m); return m;
    }
    // back wall with a broad team-colour band and the team name
    box(W, H, 0.3, wallMat, 0, H / 2, -Dp / 2);
    box(W, 1.5, 0.34, teamMat, 0, 4.5, -Dp / 2 + 0.04);
    var nameTex = makeTex(1024, 128, function (x, w, h) {
      x.fillStyle = '#' + col.getHexString(); x.fillRect(0, 0, w, h);
      var lum = col.r * 0.299 + col.g * 0.587 + col.b * 0.114;
      x.fillStyle = lum > 0.55 ? '#201e1d' : '#fffaf0';
      x.font = 'bold 64px Helvetica,Arial,sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText((opts.teamName || 'TEAM').toUpperCase(), w / 2, h / 2 + 3);
    });
    var nameP = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.2, 1.2),
      new THREE.MeshBasicMaterial({ map: nameTex }));
    nameP.position.set(0, 4.5, -Dp / 2 + 0.24); room.add(nameP);
    // side walls, open front
    box(0.3, H, Dp, wallMat, -W / 2, H / 2, 0);
    box(0.3, H, Dp, wallMat, W / 2, H / 2, 0);
    box(0.34, 1.2, Dp, teamMat, -W / 2 + 0.04, 4.5, 0);
    box(0.34, 1.2, Dp, teamMat, W / 2 - 0.04, 4.5, 0);
    // ceiling with light strips
    box(W, 0.3, Dp, new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.9 }), 0, H, 0);
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xfffaf0 });
    [-3.6, 0, 3.6].forEach(function (x) {
      var strip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, Dp - 2), lampMat);
      strip.position.set(x, H - 0.24, 0); room.add(strip);
      var pl = new THREE.PointLight(0xfff4e2, 0.36, 20);
      pl.position.set(x, H - 0.9, 0); room.add(pl);
    });
    // floor gloss panel lines
    var lineMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 });
    [-W / 2 + 1.2, W / 2 - 1.2].forEach(function (x) {
      var ln = new THREE.Mesh(new THREE.PlaneGeometry(0.2, Dp - 1), lineMat);
      ln.rotation.x = -Math.PI / 2; ln.position.set(x, 0.012, 0); room.add(ln);
    });
    // tool cabinets along the back, with drawers in team colour
    for (var t = -2; t <= 2; t++) {
      var cab = box(2.0, 1.05, 0.75, darkMat, t * 2.2, 0.53, -Dp / 2 + 0.9);
      for (var dr = 0; dr < 3; dr++) {
        var handle = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.05), teamMat);
        handle.position.set(t * 2.2, 0.22 + dr * 0.32, -Dp / 2 + 1.29); room.add(handle);
      }
    }
    // monitor bank on the left wall
    for (var mi = 0; mi < 4; mi++) {
      var scr = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.78),
        new THREE.MeshBasicMaterial({ color: mi % 2 ? 0x1d3b45 : 0x24323d }));
      scr.rotation.y = Math.PI / 2;
      scr.position.set(-W / 2 + 0.33, 2.5 + (mi > 1 ? 1.0 : 0), -2.4 + (mi % 2) * 1.6); room.add(scr);
    }
    var desk = box(0.9, 0.9, 5.0, darkMat, -W / 2 + 0.9, 0.45, -1.6);
    // tyre stacks on the right
    var tyreGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14);
    var rubber = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.95 });
    for (var sx = 0; sx < 3; sx++) for (var sy = 0; sy < 4; sy++) {
      var ty = new THREE.Mesh(tyreGeo, rubber);
      ty.position.set(W / 2 - 1.1, 0.18 + sy * 0.31, -4.6 + sx * 1.0);
      ty.castShadow = true; room.add(ty);
    }
    // wheel-gun rack and a fuel rig
    box(0.5, 1.3, 1.6, darkMat, W / 2 - 1.2, 0.65, -1.0);
    box(0.9, 2.1, 0.9, teamMat, W / 2 - 1.4, 1.05, 1.6);
    // overhead pit rig with the team colour beam
    box(5.6, 0.22, 0.22, darkMat, 0, 3.5, 2.6);
    box(4.6, 0.16, 0.16, teamMat, 0, 3.28, 2.6);

    // people: crew around the car, engineers at the desk, driver beside it
    var suit = new THREE.MeshStandardMaterial({ color: col, roughness: 0.72 });
    var suit2 = new THREE.MeshStandardMaterial({ color: col2, roughness: 0.7 });
    var skin = new THREE.MeshStandardMaterial({ color: 0xc99a76, roughness: 0.72 });
    function person(x, z, ry, tall, mat, cap) {
      var p = new THREE.Group(); p.position.set(x, 0, z); p.rotation.y = ry || 0;
      var s2 = tall || 1;
      var legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.82 * s2, 0.24), darkMat);
      legs.position.y = 0.41 * s2; legs.castShadow = true; p.add(legs);
      var torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62 * s2, 0.28), mat);
      torso.position.y = 1.13 * s2; torso.castShadow = true; p.add(torso);
      [-1, 1].forEach(function (sd) {
        var arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58 * s2, 0.15), mat);
        arm.position.set(sd * 0.3, 1.1 * s2, 0.02); arm.rotation.x = -0.18; p.add(arm);
      });
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 10), skin);
      head.position.y = 1.57 * s2; head.castShadow = true; p.add(head);
      if (cap) {
        var c2 = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
        c2.position.y = 1.6 * s2; p.add(c2);
        var peak = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.16), mat);
        peak.position.set(0, 1.58 * s2, 0.16); p.add(peak);
      }
      room.add(p); GAR.crew.push(p); return p;
    }
    // four mechanics around the car, clear of the bodywork
    person(-3.5, 2.6, 0.6, 1, suit, true);
    person(3.5, 2.6, -0.6, 1, suit, true);
    person(-3.4, -2.9, 2.5, 1, suit, true);
    person(3.4, -3.1, -2.5, 1, suit, true);
    // two engineers at the monitor desk, facing the screens
    person(-4.9, -2.2, Math.PI / 2, 1, suit2, false);
    person(-4.9, -0.6, Math.PI / 2, 1, suit2, false);
    // the driver, helmet under the arm, standing beside the front wing
    var drv = person(3.9, 0.8, -Math.PI / 2 - 0.25, 1.02, suit, false);
    var hel = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12),
      new THREE.MeshStandardMaterial({ color: col2, roughness: 0.2, metalness: 0.1 }));
    hel.position.set(0.34, 1.02, 0.16); drv.add(hel);
    GAR.driver = drv;
    return room;
  }

  function garageSetCar(color, color2, num) {
    if (!GAR) return;
    if (GAR.car) { GAR.lift.remove(GAR.car.group); disposeGroup(GAR.car.group); }
    var m = makeCarMesh(color == null ? 0x15a89d : color, color2 == null ? 0xeaf6f4 : color2, num);
    m.group.position.y = 0.02;
    m.group.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
    GAR.lift.add(m.group);
    GAR.car = m;
  }

  function garageResize() {
    if (!GAR) return;
    var c = GAR.r.domElement;
    var w = c.clientWidth || 640, h = c.clientHeight || 420;
    GAR.r.setSize(w, h, false);
    GAR.cam.aspect = w / h; GAR.cam.updateProjectionMatrix();
  }

  function garageLoop() {
    if (!GAR) return;
    GAR.raf = requestAnimationFrame(garageLoop);
    if (!GAR.r.domElement.isConnected || !GAR.r.domElement.offsetParent) return;
    var g = GAR;
    g.lift.position.y = g.height * 2.6;
    g.posts.forEach(function (p) { p.visible = g.height > 0.02; });
    var cy = 0.7 + g.height * 2.6;
    var r = g.dist, p = g.pitch;
    g.cam.position.set(Math.sin(g.yaw) * Math.cos(p) * r, cy + 0.5 + Math.sin(p) * r, Math.cos(g.yaw) * Math.cos(p) * r);
    g.cam.lookAt(0, cy, 0);
    g.r.render(g.sc, g.cam);
  }

  function garageExit() {
    if (GAR && GAR.raf) { cancelAnimationFrame(GAR.raf); GAR.raf = 0; }
  }

  /* =================================================================
     PODIUM CEREMONY
     A staged scene on its own canvas: the rostrum, a grandstand of fans in
     team colours, and the top three walking out in order — third, second,
     then the winner — each lifting a trophy, then spraying champagne.
     ================================================================= */
  var POD = null;

  function podiumEnter(canvas, opts) {
    var THREE = T(), o = opts || {};
    if (POD && POD.r) { POD.sc.remove(POD.root); disposeGroup(POD.root); }
    if (!POD) {
      var r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.outputEncoding = THREE.sRGBEncoding;
      var sc = new THREE.Scene();
      var cam = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
      POD = { r: r, sc: sc, cam: cam, raf: 0, t: 0, last: 0, root: null, skip: false };
    }
    var sc2 = POD.sc, root = new THREE.Group(); POD.root = root; sc2.add(root);
    POD.t = 0; POD.last = performance.now();

    sc2.add(new THREE.HemisphereLight(0xf4ece0, 0x6a5f4c, 0.85));
    var key = new THREE.DirectionalLight(0xfff3e0, 1.05);
    key.position.set(6, 12, 9); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -14; key.shadow.camera.right = 14;
    key.shadow.camera.top = 14; key.shadow.camera.bottom = -14;
    root.add(key);
    root.add(new THREE.DirectionalLight(0xdfe6ef, 0.4).translateZ(0));

    var ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x6f8f4c, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
    var apron = new THREE.Mesh(new THREE.PlaneGeometry(44, 30),
      new THREE.MeshStandardMaterial({ color: 0x4d5055, roughness: 0.92 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(0, 0.01, 4); apron.receiveShadow = true; root.add(apron);

    /* ---- the rostrum: 2nd left, winner centre and tallest, 3rd right ---- */
    var accent = 0xc67139, cream = 0xf5ead8, ink = 0x201e1d;
    var faceMat = new THREE.MeshStandardMaterial({ color: cream, roughness: 0.7 });
    var sideMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6 });
    var stepH = { 1: 1.5, 2: 1.05, 3: 0.72 };
    var stepX = { 1: 0, 2: -2.9, 3: 2.9 };
    POD.steps = {};
    [1, 2, 3].forEach(function (p) {
      var h = stepH[p], w = 2.6;
      var blk = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.4), faceMat);
      blk.position.set(stepX[p], h / 2, 0); blk.receiveShadow = true; blk.castShadow = true; root.add(blk);
      var band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.3, 2.46), sideMat);
      band.position.set(stepX[p], h - 0.2, 0); root.add(band);
      var numTex = makeTex(128, 128, function (x, w2, h2) {
        x.fillStyle = '#f5ead8'; x.fillRect(0, 0, w2, h2);
        x.fillStyle = '#c67139'; x.font = 'bold 92px Georgia,serif';
        x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(p), w2 / 2, h2 / 2 + 4);
      });
      var np = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({ map: numTex, transparent: true }));
      np.position.set(stepX[p], h * 0.45, 1.22); root.add(np);
      POD.steps[p] = h;
    });

    /* ---- backdrop board with the event name ---- */
    var boardTex = makeTex(1024, 256, function (x, w2, h2) {
      x.fillStyle = '#201e1d'; x.fillRect(0, 0, w2, h2);
      x.fillStyle = '#c67139'; x.fillRect(0, h2 - 26, w2, 26);
      x.fillStyle = '#f5ead8'; x.font = 'bold 78px Georgia,serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText((o.city || 'GRAND PRIX').toUpperCase(), w2 / 2, h2 / 2 - 26);
      x.fillStyle = 'rgba(245,234,216,.68)'; x.font = 'bold 34px Helvetica,Arial,sans-serif';
      x.fillText((o.gp || '').toUpperCase(), w2 / 2, h2 / 2 + 44);
    });
    var board = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.75),
      new THREE.MeshBasicMaterial({ map: boardTex }));
    board.position.set(0, 3.9, -3.4); root.add(board);
    var wallMat = new THREE.MeshStandardMaterial({ color: ink, roughness: 0.85 });
    var wall = new THREE.Mesh(new THREE.BoxGeometry(22, 6.4, 0.5), wallMat);
    wall.position.set(0, 3.2, -3.8); wall.receiveShadow = true; root.add(wall);

    /* ---- the fans ---- */
    POD.fans = [];
    buildFanStand(root, o.teams || [], 1);

    /* ---- the top three ---- */
    POD.drivers = [];
    [3, 2, 1].forEach(function (p, order) {
      var d = o.top && o.top[p - 1];
      if (!d) return;
      var per = makePerson({ suit: d.color, trim: d.color2, cap: true, hair: 0x3a2b1f });
      // trophy carried in the right hand
      var tro = new THREE.Group();
      var gold = new THREE.MeshStandardMaterial({ color: 0xe0b445, roughness: 0.22, metalness: 0.85 });
      var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.1, 0.28, 12), gold);
      cup.position.y = 0.3; tro.add(cup);
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), gold);
      stem.position.y = 0.1; tro.add(stem);
      var foot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.07, 12), gold);
      foot.position.y = 0.02; tro.add(foot);
      [-1, 1].forEach(function (s) {
        var handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 12, Math.PI), gold);
        handle.position.set(s * 0.19, 0.3, 0); handle.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        tro.add(handle);
      });
      tro.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
      tro.position.set(0, -0.68, 0.12); tro.scale.setScalar(p === 1 ? 1.25 : 1);
      per.shR.add(tro);
      // champagne bottle in the left hand, hidden until the spraying starts
      var bot = new THREE.Group();
      var glass = new THREE.MeshStandardMaterial({ color: 0x2e4a2a, roughness: 0.2, metalness: 0.3 });
      var body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 10), glass);
      body.position.y = 0.15; bot.add(body);
      var neckB = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.055, 0.16, 8), glass);
      neckB.position.y = 0.36; bot.add(neckB);
      var foil = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.06, 8),
        new THREE.MeshStandardMaterial({ color: 0xe0b445, roughness: 0.3, metalness: 0.7 }));
      foil.position.y = 0.45; bot.add(foil);
      bot.position.set(0, -0.66, 0.1); bot.visible = false;
      per.shL.add(bot);
      // champagne spray
      var N = 130, pos = new Float32Array(N * 3), vel = [];
      for (var i = 0; i < N; i++) { pos[i * 3] = 0; pos[i * 3 + 1] = -99; pos[i * 3 + 2] = 0; vel.push(null); }
      var pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      var spray = new THREE.Points(pg, new THREE.PointsMaterial({
        color: 0xfdf3d8, size: 0.09, transparent: true, opacity: 0.92, depthWrite: false
      }));
      root.add(spray);
      var startX = stepX[p] + (p === 3 ? 7 : (p === 2 ? -7 : 0));
      var startZ = p === 1 ? 9 : 2.2;
      per.group.position.set(startX, 0, startZ);
      per.group.rotation.y = p === 1 ? Math.PI : (p === 3 ? -Math.PI / 2 : Math.PI / 2);
      root.add(per.group);
      POD.drivers.push({
        p: p, per: per, tro: tro, bot: bot, spray: spray, vel: vel, N: N,
        from: new THREE.Vector3(startX, 0, startZ),
        to: new THREE.Vector3(stepX[p], stepH[p], 0.1),
        inAt: 0.6 + order * 3.6, name: d.name, walk: 0
      });
    });

    podiumResize();
    if (!POD.raf) podiumLoop();
    return POD;
  }

  // Tiered stand packed with fans, grouped into blocks by team colour, each
  // with a flag they wave. They jump when the winner arrives.
  function buildFanStand(root, teams, scale) {
    var THREE = T();
    var cols = (teams && teams.length ? teams : [0xc67139, 0x7a8a5e, 0x2f6fd0, 0xd8382c]).slice();
    var standMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.9 });
    var rows = 6, perRow = 30;
    for (var r = 0; r < rows; r++) {
      var tier = new THREE.Mesh(new THREE.BoxGeometry(34, 0.7, 1.7), standMat);
      tier.position.set(0, 0.35 + r * 0.72, 9.5 + r * 1.7);
      tier.receiveShadow = true; root.add(tier);
    }
    var headGeo = new THREE.SphereGeometry(0.17, 8, 6);
    var bodyGeo = new THREE.BoxGeometry(0.38, 0.62, 0.26);
    var armGeo = new THREE.BoxGeometry(0.1, 0.5, 0.11);
    var flagGeo = new THREE.PlaneGeometry(0.62, 0.42);
    var poleGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.8, 5);
    var poleMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.7 });
    var skinMats = [0xc99a76, 0x8d6247, 0xe0b894, 0x6b4530].map(function (c) {
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });
    });
    var seed = 991, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // each block of the stand supports one team
    var blocks = 6, blockW = 34 / blocks;
    for (var r2 = 0; r2 < rows; r2++) {
      for (var k = 0; k < perRow; k++) {
        if (rnd() < 0.1) continue;
        var bi = Math.min(blocks - 1, Math.floor(k / (perRow / blocks)));
        var col = cols[(bi + r2) % cols.length];
        var shirt = new THREE.MeshStandardMaterial({ color: col, roughness: 0.78 });
        var fan = new THREE.Group();
        var x = -16.4 + (k + 0.5) * (33 / perRow) + (rnd() - 0.5) * 0.4;
        var z = 9.5 + r2 * 1.7 - 0.3;
        fan.position.set(x, 0.7 + r2 * 0.72, z);
        var body = new THREE.Mesh(bodyGeo, shirt); body.position.y = 0.31; fan.add(body);
        var head = new THREE.Mesh(headGeo, skinMats[(rnd() * skinMats.length) | 0]);
        head.position.y = 0.78; fan.add(head);
        // arms up, holding either a flag or nothing
        var armL = new THREE.Group(); armL.position.set(-0.25, 0.6, 0); fan.add(armL);
        var armR = new THREE.Group(); armR.position.set(0.25, 0.6, 0); fan.add(armR);
        var al = new THREE.Mesh(armGeo, shirt); al.position.y = -0.25; armL.add(al);
        var ar = new THREE.Mesh(armGeo, shirt); ar.position.y = -0.25; armR.add(ar);
        armL.rotation.z = 0.35 + rnd() * 2.1; armR.rotation.z = -0.35 - rnd() * 2.1;
        var flag = null;
        if (rnd() < 0.34) {
          flag = new THREE.Group();
          var pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 0.4; flag.add(pole);
          var cloth = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({
            color: col, side: THREE.DoubleSide
          }));
          cloth.position.set(0.33, 0.62, 0); flag.add(cloth);
          flag.position.set(0, -0.48, 0.05); armR.add(flag);
        }
        root.add(fan);
        POD.fans.push({ g: fan, armL: armL, armR: armR, flag: flag, ph: rnd() * Math.PI * 2, y0: fan.position.y });
      }
    }
  }

  function podiumResize() {
    if (!POD) return;
    var c = POD.r.domElement;
    var w = c.clientWidth || 640, h = c.clientHeight || 400;
    POD.r.setSize(w, h, false);
    POD.cam.aspect = w / h; POD.cam.updateProjectionMatrix();
  }

  function podiumLoop() {
    if (!POD) return;
    POD.raf = requestAnimationFrame(podiumLoop);
    var el = POD.r.domElement;
    if (!el.isConnected || !el.offsetParent) return;
    var now = performance.now();
    var dt = Math.min(0.05, (now - POD.last) / 1000); POD.last = now;
    POD.t += dt;
    var t = POD.t;

    var CHAMP = 12.4;                     // the moment the corks come out
    var roar = 0;

    POD.drivers.forEach(function (d) {
      var per = d.per, e = t - d.inAt;
      var walkT = 2.4, lift = d.inAt + walkT + 0.55;
      if (e < 0) { per.group.position.copy(d.from); return; }
      var k = clamp(e / walkT, 0, 1);
      var ease = k * k * (3 - 2 * k);
      per.group.position.lerpVectors(d.from, d.to, ease);
      // face the crowd once up on the step
      var faceY = Math.PI;
      per.group.rotation.y = lerp(d.from.x > 0 ? -Math.PI / 2 : (d.from.x < 0 ? Math.PI / 2 : Math.PI), faceY, ease);
      // legs stride while walking, still once arrived
      if (k < 1) {
        var s = Math.sin(e * 9);
        per.hipL.rotation.x = s * 0.5; per.hipR.rotation.x = -s * 0.5;
        per.shL.rotation.x = -s * 0.35; per.shR.rotation.x = s * 0.35;
        per.group.position.y += Math.abs(Math.sin(e * 9)) * 0.04;
      } else {
        per.hipL.rotation.x = per.hipR.rotation.x = 0;
        // the trophy goes up, then is held high with a slow sway
        var l = clamp((t - lift) / 1.1, 0, 1);
        var le = l * l * (3 - 2 * l);
        per.shR.rotation.x = lerp(0, -2.5, le);
        per.shR.rotation.z = lerp(0, -0.35, le) + Math.sin(t * 1.6 + d.p) * 0.05 * le;
        if (t > CHAMP) {
          // one hand keeps the trophy, the other sprays
          d.bot.visible = true;
          var c2 = clamp((t - CHAMP) / 0.8, 0, 1);
          per.shL.rotation.x = lerp(0, -2.2, c2);
          per.shL.rotation.z = lerp(0, 0.5, c2) + Math.sin(t * 3.1 + d.p * 2) * 0.22 * c2;
          per.group.position.y = d.to.y + Math.abs(Math.sin(t * 4 + d.p)) * 0.05;
          roar = 1;
        } else {
          per.shL.rotation.x = Math.sin(t * 1.3 + d.p) * 0.12 - 0.1;
        }
        per.head.rotation.y = Math.sin(t * 0.7 + d.p * 2) * 0.3;
      }
      // champagne particles
      var pos = d.spray.geometry.attributes.position;
      if (t > CHAMP) {
        var mouth = new (T().Vector3)(0, 0.5, 0);
        d.bot.localToWorld(mouth); POD.root.worldToLocal(mouth);
        for (var i = 0; i < d.N; i++) {
          var v = d.vel[i];
          if (!v) {
            if (Math.random() < 0.22) {
              var a = (Math.random() - 0.5) * 1.1, b = 0.5 + Math.random() * 0.9;
              d.vel[i] = { x: Math.sin(a) * 2.4 + (Math.random() - 0.5), y: b * 4.2, z: Math.cos(a) * 2.2, life: 1.5 };
              pos.setXYZ(i, mouth.x, mouth.y, mouth.z);
            }
            continue;
          }
          v.life -= dt;
          if (v.life <= 0) { d.vel[i] = null; pos.setXYZ(i, 0, -99, 0); continue; }
          v.y -= 9.4 * dt;
          pos.setXYZ(i, pos.getX(i) + v.x * dt, pos.getY(i) + v.y * dt, pos.getZ(i) + v.z * dt);
        }
        pos.needsUpdate = true;
      }
    });

    // the crowd: a steady bob, then jumping and flag-waving once the bottles open
    POD.fans.forEach(function (f, i) {
      var hop = roar ? 0.19 : 0.05, rate = roar ? 7.5 : 2.6;
      f.g.position.y = f.y0 + Math.abs(Math.sin(t * rate + f.ph)) * hop;
      var wav = Math.sin(t * (roar ? 8 : 3.4) + f.ph);
      f.armL.rotation.z = 0.5 + wav * (roar ? 0.7 : 0.25);
      f.armR.rotation.z = -0.5 - wav * (roar ? 0.7 : 0.25);
      if (f.flag) f.flag.rotation.z = wav * 0.5;
    });

    // camera: a slow arc in, tightening on the winner, pulling back for the spray
    var camT = clamp(t / 16, 0, 1);
    var ang = -0.55 + camT * 0.75;
    var dist = lerp(15.5, t > CHAMP ? 13.5 : 10.5, clamp(t / 12, 0, 1));
    var hgt = lerp(5.2, 3.4, clamp(t / 12, 0, 1));
    POD.cam.position.set(Math.sin(ang) * dist, hgt, Math.cos(ang) * dist + 1.5);
    POD.cam.lookAt(0, t > CHAMP ? 2.5 : 2.1, 0);
    POD.r.render(POD.sc, POD.cam);
  }

  function podiumExit() {
    if (POD && POD.raf) { cancelAnimationFrame(POD.raf); POD.raf = 0; }
  }
  function podiumTime() { return POD ? POD.t : 0; }

  var GP = {
    G: G, KMH: KMH, GEARS: GEARS, MAX_SPEED: MAX_SPEED, PIT_LIMIT: PIT_LIMIT, BOOST_MAX: BOOST_MAX,
    CAPS: CAPS,
    CAM_MODES: CAM_MODES,
    clamp: clamp, lerp: lerp, wrapAng: wrapAng, smooth: smooth,
    initRenderer: initRenderer, onResize: onResize, viewportSize: viewportSize,
    buildTrack: buildTrack, makeCar: makeCar, placeOnGrid: placeOnGrid,
    makeSafetyCar: makeSafetyCar, makeCrane: makeCrane, numTexture: numTexture,
    inDRS: inDRS, atDRSDetection: atDRSDetection, applyRenderScale: applyRenderScale,
    updateCarDetail: updateCarDetail,
    garageEnter: garageEnter, garageExit: garageExit, garageResize: garageResize,
    garageSetCar: garageSetCar, garageRig: function () { return GAR; },
    podiumEnter: podiumEnter, podiumExit: podiumExit, podiumResize: podiumResize,
    podiumTime: podiumTime, makePerson: makePerson, animateCrowd: animateCrowd,
    stepCar: stepCar, collisions: collisions, aiInput: aiInput,
    fxTick: fxTick, fxSmoke: fxSmoke, fxSparks: fxSparks, fxReset: fxReset,
    updateCamera: updateCamera, laneLat: laneLat, pitU: pitU,
    tyreGrip: tyreGrip, applyWet: applyWet, makeTex: makeTex,
    onLap: null, onSector: null, onHit: null, onPenalty: null, onRetire: null
  };
  window.GP = GP;
})();

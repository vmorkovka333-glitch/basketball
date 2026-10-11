// Zombie Squad - the image after the 3D pass.
// Medium: HDR bloom, a soft filmic shoulder, color grading per map mood, vignette, grain, FXAA.
// High adds the cinema set, built on the scene's depth: ambient occlusion (SSAO) in every corner and under
// every boot, light shafts from the sun or moon, depth of field on the menu, lens dirt and fringing.
// Without depth textures High falls back to MSAA. Low skips all of it and draws straight to the screen.
(function(ZD){
const W = ZD.W;
const P = W.post = { on:false, strength:0.85, threshold:0.72, grade:null, dof:0, focus:8, hurt:0 };
let T, R, rtScene = null, levels = [], quad, qScene, qCam, M = {}, size = [1, 1], t0 = performance.now(), ext = {};
const _v = { a:null, b:null };

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// bright pass with a soft knee, 4 taps so the half-res image is already smooth
const BRIGHT = `uniform sampler2D tMap; uniform vec2 texel; uniform float threshold; varying vec2 vUv;
  vec3 tap(vec2 o){ return texture2D(tMap, vUv + o*texel).rgb; }
  void main(){ vec3 c = (tap(vec2(-1.,-1.)) + tap(vec2(1.,-1.)) + tap(vec2(-1.,1.)) + tap(vec2(1.,1.)))*0.25;
    float l = max(c.r, max(c.g, c.b)); float knee = threshold*0.5;
    float s = clamp(l - threshold + knee, 0.0, 2.0*knee); s = s*s/(4.0*knee + 1e-4);
    float w = max(s, l - threshold)/max(l, 1e-4);
    gl_FragColor = vec4(c*w, 1.0); }`;
const DOWN = `uniform sampler2D tMap; uniform vec2 texel; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tMap, vUv + vec2(-1.,-1.)*texel).rgb + texture2D(tMap, vUv + vec2(1.,-1.)*texel).rgb
    + texture2D(tMap, vUv + vec2(-1.,1.)*texel).rgb + texture2D(tMap, vUv + vec2(1.,1.)*texel).rgb; gl_FragColor = vec4(c*0.25, 1.0); }`;
// 9-tap gaussian in 5 linear fetches
const BLUR = `uniform sampler2D tMap; uniform vec2 dir; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tMap, vUv).rgb*0.2270270270;
    vec2 o1 = dir*1.3846153846, o2 = dir*3.2307692308;
    c += (texture2D(tMap, vUv + o1).rgb + texture2D(tMap, vUv - o1).rgb)*0.3162162162;
    c += (texture2D(tMap, vUv + o2).rgb + texture2D(tMap, vUv - o2).rgb)*0.0702702703;
    gl_FragColor = vec4(c, 1.0); }`;
const DEPTH = `uniform float near, far;
  float lin(float d){ return near*far/(far - d*(far - near)); }`;
// ambient occlusion from the depth buffer alone: normals come from the neighbors, 14 samples on a spiral
const SSAO = `uniform sampler2D tDepth; uniform vec2 texel; uniform mat4 projInv; uniform float radius, intensity, projScale, aspect; varying vec2 vUv;
  vec3 vpos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = projInv*vec4(uv*2.0 - 1.0, d*2.0 - 1.0, 1.0); return p.xyz/p.w; }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
  void main(){
    float d0 = texture2D(tDepth, vUv).x; if(d0 >= 0.99999){ gl_FragColor = vec4(1.0); return; }
    vec3 p = vpos(vUv);
    vec3 pr = vpos(vUv + vec2(texel.x, 0.0)), pl = vpos(vUv - vec2(texel.x, 0.0)), pu = vpos(vUv + vec2(0.0, texel.y)), pd = vpos(vUv - vec2(0.0, texel.y));
    vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
    vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
    vec3 n = normalize(cross(dx, dy));
    float rad = min(radius*projScale/max(0.1, -p.z), 0.1), ang = hash(gl_FragCoord.xy)*6.2831, ao = 0.0;
    for(int i=0; i<14; i++){
      float f = (float(i) + 0.5)/14.0, a = ang + float(i)*2.39996;
      vec2 off = vec2(cos(a)/aspect, sin(a))*rad*f;
      vec3 s = vpos(vUv + off) - p; float vv = dot(s, s);
      ao += max(0.0, dot(s, n)/sqrt(vv + 1e-4) - 0.06)*clamp(1.0 - vv/(radius*radius*4.0), 0.0, 1.0); }
    gl_FragColor = vec4(vec3(clamp(1.0 - ao/14.0*intensity, 0.0, 1.0)), 1.0); }`;
// blur the noisy AO without bleeding across edges
const AOBLUR = DEPTH + `uniform sampler2D tAO, tDepth; uniform vec2 texel; varying vec2 vUv;
  void main(){ float z0 = lin(texture2D(tDepth, vUv).x), s = 0.0, w = 0.0;
    for(int x=-2; x<=1; x++) for(int y=-2; y<=1; y++){ vec2 uv = vUv + (vec2(float(x), float(y)) + 0.5)*texel;
      float z = lin(texture2D(tDepth, uv).x), k = max(0.0, 1.0 - abs(z - z0)/(z0*0.06)) + 1e-3; s += texture2D(tAO, uv).r*k; w += k; }
    gl_FragColor = vec4(vec3(s/w), 1.0); }`;
// shafts of light: march from each pixel toward the sun, gathering the bright sky the march passes over
const RAYS = `uniform sampler2D tScene, tDepth; uniform vec2 sun; uniform float strength; varying vec2 vUv;
  void main(){ vec2 st = (vUv - sun)/40.0*0.9; vec2 uv = vUv; vec3 acc = vec3(0.0); float decay = 1.0;
    for(int i=0; i<40; i++){ uv -= st; vec2 c = clamp(uv, 0.001, 0.999);
      float sky = step(0.99999, texture2D(tDepth, c).x); acc += max(texture2D(tScene, c).rgb - 0.22, 0.0)*sky*decay; decay *= 0.955; }
    gl_FragColor = vec4(acc*strength/20.0, 1.0); }`;
// reflections on wet ground and polished floors: march the reflected ray through the depth buffer.
// Puddles (world-space noise) mirror more than the rest of the street; blur after makes them glossy.
const SSR = `uniform sampler2D tScene, tDepth; uniform vec2 texel; uniform mat4 proj, projInv, viewToWorld; uniform float wet, shine, time; varying vec2 vUv;
  vec3 vpos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = projInv*vec4(uv*2.0 - 1.0, d*2.0 - 1.0, 1.0); return p.xyz/p.w; }
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main(){
    gl_FragColor = vec4(0.0);
    float d0 = texture2D(tDepth, vUv).x; if(d0 >= 0.99999) return;
    vec3 p = vpos(vUv);
    vec3 pr = vpos(vUv + vec2(texel.x, 0.0)), pl = vpos(vUv - vec2(texel.x, 0.0)), pu = vpos(vUv + vec2(0.0, texel.y)), pd = vpos(vUv - vec2(0.0, texel.y));
    vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl, dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
    vec3 n = normalize(cross(dx, dy)), nw = normalize(mat3(viewToWorld)*n), pw = (viewToWorld*vec4(p, 1.0)).xyz;
    if(nw.y < 0.92 || pw.y > 0.12) return;
    float puddle = smoothstep(0.42, 0.62, vn(pw.xz*0.21)*0.7 + vn(pw.xz*0.83)*0.3);
    float amt = wet*mix(0.3, 1.0, puddle) + shine; if(amt < 0.01) return;
    vec3 v = normalize(p), r = normalize(reflect(v, n));
    float t = 0.2 + h2(gl_FragCoord.xy + fract(time)*61.0)*0.25, hit = 0.0; vec2 huv = vec2(0.0), sky = vec2(-1.0);
    for(int i=0; i<30; i++){
      vec3 q = p + r*t; vec4 c = proj*vec4(q, 1.0); vec2 uv = c.xy/c.w*0.5 + 0.5;
      if(c.w <= 0.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
      float sd = texture2D(tDepth, uv).x;
      if(sd >= 0.99999) sky = uv;
      else { float dz = vpos(uv).z - q.z; if(dz > 0.0 && dz < 0.5 + t*0.12){ huv = uv; hit = 1.0; break; } }
      t = t*1.15 + 0.06; }
    if(hit < 0.5 && sky.x >= 0.0){ huv = sky; hit = 0.7; }
    if(hit < 0.5) return;
    vec2 e = min(huv, 1.0 - huv); float edge = smoothstep(0.0, 0.08, e.x)*smoothstep(0.0, 0.12, e.y);
    float fres = 0.25 + 0.75*pow(1.0 - max(dot(-v, n), 0.0), 4.0);
    gl_FragColor = vec4(texture2D(tScene, huv).rgb*amt*fres*edge*hit, 1.0); }`;
const COMPOSITE = `uniform sampler2D tScene, tB0, tB1, tB2, tB3; uniform vec2 texel; uniform float strength, exposure, sat, contrast, vig, grain, time, flash, hurt;
  uniform vec3 shadowTint, lightTint; varying vec2 vUv;
  #ifdef CINEMA
  uniform sampler2D tDepth, tAO, tRays, tDof, tDirt, tSSR; uniform float near, far, aoAmt, dof, focus, ca, mist;
  uniform mat4 projInv, viewToWorld; uniform vec3 camPos, mistCol, sunDir, sunCol;
  float lin(float d){ return near*far/(far - d*(far - near)); }
  #endif
  #ifdef FXAA
  vec3 fxaa(vec2 uv){
    vec3 rgbNW = texture2D(tScene, uv + vec2(-1.,-1.)*texel).rgb, rgbNE = texture2D(tScene, uv + vec2(1.,-1.)*texel).rgb;
    vec3 rgbSW = texture2D(tScene, uv + vec2(-1.,1.)*texel).rgb, rgbSE = texture2D(tScene, uv + vec2(1.,1.)*texel).rgb, rgbM = texture2D(tScene, uv).rgb;
    vec3 luma = vec3(0.299, 0.587, 0.114);
    float lNW = dot(min(rgbNW, 1.0), luma), lNE = dot(min(rgbNE, 1.0), luma), lSW = dot(min(rgbSW, 1.0), luma), lSE = dot(min(rgbSE, 1.0), luma), lM = dot(min(rgbM, 1.0), luma);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    if(lMax - lMin < max(0.0312, lMax*0.125)) return rgbM;
    vec2 d = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
    float red = max((lNW + lNE + lSW + lSE)*0.03125, 0.0078125), rcp = 1.0/(min(abs(d.x), abs(d.y)) + red);
    d = clamp(d*rcp, -8.0, 8.0)*texel;
    vec3 a = 0.5*(texture2D(tScene, uv + d*(1.0/3.0 - 0.5)).rgb + texture2D(tScene, uv + d*(2.0/3.0 - 0.5)).rgb);
    vec3 b = a*0.5 + 0.25*(texture2D(tScene, uv - d*0.5).rgb + texture2D(tScene, uv + d*0.5).rgb);
    float lB = dot(min(b, 1.0), luma); return (lB < lMin || lB > lMax) ? a : b; }
  #endif
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
  vec3 shoulder(vec3 x){ vec3 k = vec3(0.62); return min(x, k) + (1.0 - k)*(1.0 - exp(-max(x - k, 0.0)/(1.0 - k))); }
  void main(){
    #ifdef FXAA
    vec3 c = fxaa(vUv);
    #else
    vec3 c = texture2D(tScene, vUv).rgb;
    #endif
    vec3 b = texture2D(tB0, vUv).rgb*0.5 + texture2D(tB1, vUv).rgb*0.7 + texture2D(tB2, vUv).rgb*0.9;
    #ifdef DEEP
    b += texture2D(tB3, vUv).rgb*1.1;
    #endif
    #ifdef CINEMA
    vec3 nb = (texture2D(tScene, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tScene, vUv - vec2(texel.x, 0.0)).rgb + texture2D(tScene, vUv + vec2(0.0, texel.y)).rgb + texture2D(tScene, vUv - vec2(0.0, texel.y)).rgb)*0.25;
    c = max(c + (c - nb)*0.32, 0.0);                                             // crisp edges after FXAA
    vec2 cd = (vUv - 0.5)*(ca + hurt*0.012);                                  // the lens splits color at the edges
    c.r = mix(c.r, texture2D(tScene, vUv - cd).r, 0.85); c.b = mix(c.b, texture2D(tScene, vUv + cd).b, 0.85);
    float z = lin(texture2D(tDepth, vUv).x);
    if(dof > 0.0){ float coc = max(smoothstep(focus*1.25, focus*3.2, z), smoothstep(focus*0.55, focus*0.25, z))*dof; c = mix(c, texture2D(tDof, vUv).rgb, coc); }
    c *= mix(1.0, texture2D(tAO, vUv).r, aoAmt);
    c += texture2D(tSSR, vUv).rgb;
    float d0 = texture2D(tDepth, vUv).x;
    if(d0 < 0.99999 && mist > 0.0){                                            // mist that hugs the ground and glows toward the sun
      vec4 vp = projInv*vec4(vUv*2.0 - 1.0, d0*2.0 - 1.0, 1.0); vec3 wp = (viewToWorld*vec4(vp.xyz/vp.w, 1.0)).xyz, ray = wp - camPos; float dist = length(ray);
      float m = (1.0 - exp(-dist*0.032))*exp(-max(wp.y, 0.0)*0.42)*mist;
      c = mix(c, mistCol + sunCol*pow(max(dot(ray/dist, sunDir), 0.0), 6.0)*0.6, clamp(m, 0.0, 0.85)); }
    b *= 1.0 + texture2D(tDirt, vUv).rgb*1.6;                                 // glare catches the dust on the lens
    c += texture2D(tRays, vUv).rgb;
    #endif
    c = c*exposure + b*strength + flash;
    c = shoulder(c);
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, sat*(1.0 - hurt*0.75));
    c = mix(c, c*c*(3.0 - 2.0*c), contrast);
    c += shadowTint*(1.0 - l)*(1.0 - l)*0.09 + lightTint*l*l*0.07;
    vec2 q = vUv - 0.5; q.x *= 1.15; float v = smoothstep(0.92, 0.28, length(q)); c *= mix(1.0, v, vig);
    c += (hash(vUv*vec2(1931.0, 1213.0) + time) - 0.5)*grain;
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`;

function mat(frag, uniforms, defines){ return new T.ShaderMaterial({ vertexShader:VS, fragmentShader:frag, uniforms, defines:defines || {}, depthTest:false, depthWrite:false }); }
function canFloat(){ const e = R.extensions; return R.capabilities.isWebGL2 ? !!(e.get('EXT_color_buffer_float') || e.get('EXT_color_buffer_half_float')) : !!(e.get('OES_texture_half_float') && e.get('EXT_color_buffer_half_float') && e.get('OES_texture_half_float_linear')); }
function rt(w, h, opt){ return new T.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), Object.assign({ minFilter:T.LinearFilter, magFilter:T.LinearFilter, format:T.RGBAFormat, depthBuffer:false, stencilBuffer:false, type:P.type }, opt || {})); }
function draw(m, target){ quad.material = m; R.setRenderTarget(target); R.render(qScene, qCam); }
// dust and smudges on the lens, only seen where the bloom lights them up
function dirtTex(){
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  for(let i=0;i<70;i++){ const x = Math.random()*256, y = Math.random()*256, r = 3 + Math.random()*Math.random()*30, a = 0.05 + Math.random()*0.16;
    const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(255,250,235,' + a + ')'); rg.addColorStop(0.7, 'rgba(255,250,235,' + a*0.6 + ')'); rg.addColorStop(1, 'rgba(255,250,235,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r*2, r*2); }
  g.strokeStyle = 'rgba(255,250,235,.05)'; g.lineWidth = 6; for(let i=0;i<5;i++){ g.beginPath(); g.moveTo(Math.random()*256, Math.random()*256); g.bezierCurveTo(Math.random()*256, Math.random()*256, Math.random()*256, Math.random()*256, Math.random()*256, Math.random()*256); g.stroke(); }
  const t = new T.CanvasTexture(c); t.minFilter = T.LinearFilter; return t;
}

P.init = function(renderer, q){
  T = window.THREE; R = renderer;
  qScene = new T.Scene(); qCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  quad = new T.Mesh(new T.PlaneGeometry(2, 2)); quad.frustumCulled = false; qScene.add(quad);
  P.type = canFloat() ? T.HalfFloatType : T.UnsignedByteType;
  ext.depth = R.capabilities.isWebGL2 || !!R.extensions.get('WEBGL_depth_texture');
  M.bright = mat(BRIGHT, { tMap:{ value:null }, texel:{ value:new T.Vector2() }, threshold:{ value:P.threshold } });
  M.down = mat(DOWN, { tMap:{ value:null }, texel:{ value:new T.Vector2() } });
  M.blur = mat(BLUR, { tMap:{ value:null }, dir:{ value:new T.Vector2() } });
  const nf = { near:{ value:0.1 }, far:{ value:260 } };
  M.ssao = mat(SSAO, { tDepth:{ value:null }, texel:{ value:new T.Vector2() }, projInv:{ value:new T.Matrix4() }, radius:{ value:0.55 }, intensity:{ value:1.35 }, projScale:{ value:1 }, aspect:{ value:1 } });
  M.aoBlur = mat(AOBLUR, Object.assign({ tAO:{ value:null }, tDepth:{ value:null }, texel:{ value:new T.Vector2() } }, nf));
  M.raysMat = mat(RAYS, { tScene:{ value:null }, tDepth:{ value:null }, sun:{ value:new T.Vector2() }, strength:{ value:0 } });
  M.nf = nf; M.dirt = dirtTex();
  M.mats = { proj:{ value:new T.Matrix4() }, projInv:{ value:new T.Matrix4() }, viewToWorld:{ value:new T.Matrix4() } };
  M.ssr = mat(SSR, { tScene:{ value:null }, tDepth:{ value:null }, texel:{ value:new T.Vector2() }, proj:M.mats.proj, projInv:M.mats.projInv, viewToWorld:M.mats.viewToWorld, wet:{ value:0 }, shine:{ value:0 }, time:{ value:0 } });
  _v.a = new T.Vector3(); _v.b = new T.Vector3();
  P.setQuality(q);
};
function buildComposite(){
  const old = M.comp; const defs = {}; if(!P.msaa) defs.FXAA = ''; if(P.deep) defs.DEEP = ''; if(P.cinema) defs.CINEMA = '';
  M.comp = mat(COMPOSITE, Object.assign({ tScene:{ value:null }, tB0:{ value:null }, tB1:{ value:null }, tB2:{ value:null }, tB3:{ value:null }, texel:{ value:new T.Vector2() },
    strength:{ value:P.strength }, exposure:{ value:1 }, sat:{ value:1.08 }, contrast:{ value:0.22 }, vig:{ value:0.55 }, grain:{ value:0.03 }, time:{ value:0 }, flash:{ value:0 }, hurt:{ value:0 },
    shadowTint:{ value:new T.Vector3(-0.2, 0.1, 0.5) }, lightTint:{ value:new T.Vector3(0.5, 0.25, -0.2) },
    tDepth:{ value:null }, tAO:{ value:null }, tRays:{ value:null }, tDof:{ value:null }, tDirt:{ value:M.dirt }, aoAmt:{ value:1 }, dof:{ value:0 }, focus:{ value:8 }, ca:{ value:0.004 },
    tSSR:{ value:null }, mist:{ value:0 }, projInv:M.mats.projInv, viewToWorld:M.mats.viewToWorld, camPos:{ value:new T.Vector3() }, mistCol:{ value:new T.Color() }, sunDir:{ value:new T.Vector3(0, 0.2, -1) }, sunCol:{ value:new T.Color() } }, M.nf), defs);
  if(old) old.dispose();
}
P.setQuality = function(q){
  P.q = q; P.on = q !== 'low';
  P.cinema = q === 'high' && ext.depth;
  P.msaa = q === 'high' && !P.cinema && R.capabilities.isWebGL2 && typeof T.WebGLMultisampleRenderTarget === 'function';
  P.deep = q === 'high';
  buildComposite(); P.resize(true);
};
P.resize = function(force){
  if(!R) return;
  const v = R.getDrawingBufferSize(new T.Vector2()), w = v.x|0, h = v.y|0;
  if(!force && w === size[0] && h === size[1]) return; size = [w, h];
  if(rtScene){ if(rtScene.depthTexture) rtScene.depthTexture.dispose(); rtScene.dispose(); }
  levels.forEach(l=>{ l.a.dispose(); l.b.dispose(); }); levels = []; rtScene = null;
  ['ao', 'ao2', 'raysRT', 'dofA', 'dofB', 'ssrA', 'ssrB'].forEach(k=>{ if(M[k]){ M[k].dispose(); M[k] = null; } });
  if(!P.on) return;
  if(P.msaa){ rtScene = new T.WebGLMultisampleRenderTarget(w, h, { format:T.RGBAFormat, type:P.type, depthBuffer:true, stencilBuffer:false }); rtScene.samples = 4; }
  else rtScene = rt(w, h, { depthBuffer:true });
  if(P.cinema){ rtScene.depthTexture = new T.DepthTexture(w, h, T.UnsignedIntType);
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    M.ao = rt(hw, hh, { type:T.UnsignedByteType }); M.ao2 = rt(hw, hh, { type:T.UnsignedByteType }); M.raysRT = rt(Math.max(1, w >> 2), Math.max(1, h >> 2)); M.raysOn = true; M.dofA = rt(hw, hh); M.dofB = rt(hw, hh); M.ssrA = rt(hw, hh); M.ssrB = rt(hw, hh); M.ssrOn = true; }
  const n = P.deep ? 4 : 3; let lw = w, lh = h;
  for(let i=0;i<n;i++){ lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1); levels.push({ a:rt(lw, lh), b:rt(lw, lh), w:lw, h:lh }); }
};
// the look of each mood: saturation, contrast, split toning, bloom
// th: how bright a pixel must be to glow (bright daylight maps only let real lights bloom), exp: exposure,
// rays: strength of the light shafts from the sun or moon
const GRADES = {
  dusk:{ sat:1.12, contrast:0.24, sh:[-0.25, 0.05, 0.55], li:[0.6, 0.3, -0.15], bloom:0.9, th:0.78, exp:1.04, rays:1.3, mist:0.42 },
  overcast:{ sat:0.98, contrast:0.22, sh:[-0.1, 0.05, 0.25], li:[0.2, 0.15, 0.05], bloom:0.45, th:0.98, exp:0.98, rays:0.35, mist:0.3 },
  day:{ sat:1.08, contrast:0.22, sh:[-0.05, 0.05, 0.3], li:[0.45, 0.3, 0.0], bloom:0.3, th:1.25, exp:0.9, rays:0.55, mist:0.14 },
  snow:{ sat:0.98, contrast:0.24, sh:[-0.15, 0.05, 0.45], li:[0.15, 0.15, 0.2], bloom:0.3, th:1.3, exp:0.86, rays:0.4, mist:0.32 },
  night:{ sat:1.05, contrast:0.28, sh:[-0.3, 0.1, 0.7], li:[0.55, 0.35, 0.0], bloom:1.05, th:0.7, exp:1.08, rays:1.15, mist:0.5 },
  harbor:{ sat:1.05, contrast:0.22, sh:[-0.25, 0.1, 0.5], li:[0.5, 0.25, -0.1], bloom:0.8, th:0.85, exp:1.0, rays:1.1, mist:0.55 },
  indoor:{ sat:1.08, contrast:0.26, sh:[-0.15, 0.15, 0.35], li:[0.4, 0.3, 0.05], bloom:0.75, th:0.95, exp:0.93, rays:0, mist:0.16 },
  blood:{ sat:1.15, contrast:0.3, sh:[0.3, -0.1, 0.05], li:[0.7, 0.1, -0.1], bloom:1.0, th:0.75, exp:1.02, rays:1.3, mist:0.55 },
};
P.mood = function(name, indoor, snap){ P.grade = GRADES[name] || (indoor ? GRADES.indoor : GRADES.dusk);
  if(snap && M.comp){ const g = P.grade, u = M.comp.uniforms; u.sat.value = g.sat; u.contrast.value = g.contrast; u.strength.value = g.bloom*P.strength; u.exposure.value = g.exp;
    u.shadowTint.value.set(g.sh[0], g.sh[1], g.sh[2]); u.lightTint.value.set(g.li[0], g.li[1], g.li[2]); M.bright.uniforms.threshold.value = g.th; } };
P.render = function(scene, camera){
  if(!P.on || !rtScene){ R.setRenderTarget(null); R.render(scene, camera); return; }
  P.resize(false);
  const gt = P.grade || GRADES.dusk, bt = M.bright.uniforms.threshold; bt.value += (gt.th - bt.value)*0.06;
  R.setRenderTarget(rtScene); R.render(scene, camera);
  // bright pass into the first level, then down and blur each level
  let src = rtScene, sw = size[0], sh = size[1];
  for(let i=0;i<levels.length;i++){ const L = levels[i];
    const m = i === 0 ? M.bright : M.down; m.uniforms.tMap.value = src.texture; m.uniforms.texel.value.set(1/sw, 1/sh); draw(m, L.a);
    M.blur.uniforms.tMap.value = L.a.texture; M.blur.uniforms.dir.value.set(1/L.w, 0); draw(M.blur, L.b);
    M.blur.uniforms.tMap.value = L.b.texture; M.blur.uniforms.dir.value.set(0, 1/L.h); draw(M.blur, L.a);
    src = L.a; sw = L.w; sh = L.h; }
  const u = M.comp.uniforms, g = P.grade || GRADES.dusk;
  if(P.cinema) cinema(camera, u, g);
  u.tScene.value = rtScene.texture; u.texel.value.set(1/size[0], 1/size[1]);
  u.tB0.value = levels[0].a.texture; u.tB1.value = levels[1].a.texture; u.tB2.value = levels[2].a.texture; u.tB3.value = (levels[3] || levels[2]).a.texture;
  const k = 0.06; u.sat.value += (g.sat - u.sat.value)*k; u.contrast.value += (g.contrast - u.contrast.value)*k; u.strength.value += (g.bloom*P.strength - u.strength.value)*k;
  u.exposure.value += (g.exp - u.exposure.value)*k;
  u.shadowTint.value.lerp(new T.Vector3(g.sh[0], g.sh[1], g.sh[2]), k); u.lightTint.value.lerp(new T.Vector3(g.li[0], g.li[1], g.li[2]), k);
  u.time.value = ((performance.now() - t0)/1000) % 100; u.grain.value = P.q === 'high' ? 0.032 : 0.02; u.flash.value = W.flashAmt || 0; u.hurt.value += ((P.hurt || 0) - u.hurt.value)*0.1;
  draw(M.comp, null);
};
function cinema(camera, u, g){
  const dt = rtScene.depthTexture, hw = M.ao.width, hh = M.ao.height;
  M.nf.near.value = camera.near; M.nf.far.value = camera.far;
  M.mats.proj.value.copy(camera.projectionMatrix); M.mats.projInv.value.copy(camera.projectionMatrixInverse); M.mats.viewToWorld.value.copy(camera.matrixWorld);
  // reflections, at half size and blurred into gloss
  const sr = M.ssr.uniforms, wet = W.floorWet || 0, shine = W.floorShine || 0;
  if(wet + shine > 0.01){ sr.tScene.value = rtScene.texture; sr.tDepth.value = dt; sr.texel.value.set(2/size[0], 2/size[1]); sr.wet.value = wet; sr.shine.value = shine; sr.time.value = performance.now()/1000;
    draw(M.ssr, M.ssrA); M.blur.uniforms.tMap.value = M.ssrA.texture; M.blur.uniforms.dir.value.set(1/hw, 0); draw(M.blur, M.ssrB);
    M.blur.uniforms.tMap.value = M.ssrB.texture; M.blur.uniforms.dir.value.set(0, 1/hh); draw(M.blur, M.ssrA); M.ssrOn = true; }
  else if(M.ssrOn){ R.setRenderTarget(M.ssrA); R.clear(); M.ssrOn = false; }
  u.tSSR.value = M.ssrA.texture;
  // ground mist, tinted by the sky
  u.mist.value += ((g.mist || 0) - u.mist.value)*0.05; u.camPos.value.copy(camera.position);
  if(W.scene && W.scene.fog) u.mistCol.value.copy(W.scene.fog.color).multiplyScalar(1.35);
  if(W.sky){ u.sunDir.value.copy(W.sky.material.uniforms.sunDir.value); u.sunCol.value.copy(W.sky.material.uniforms.sunCol.value).multiplyScalar(W.sky.visible ? 1 : 0); }
  // ambient occlusion at half size, then an edge-aware blur
  const s = M.ssao.uniforms; s.tDepth.value = dt; s.texel.value.set(2/size[0], 2/size[1]); s.projInv.value.copy(camera.projectionMatrixInverse);
  s.projScale.value = camera.projectionMatrix.elements[5]*0.5; s.aspect.value = size[0]/size[1];
  draw(M.ssao, M.ao);
  const b = M.aoBlur.uniforms; b.tAO.value = M.ao.texture; b.tDepth.value = dt; b.texel.value.set(1/hw, 1/hh); draw(M.aoBlur, M.ao2);
  // light shafts: only while the sun or moon is in front of the lens
  const sky = W.sky, r = M.raysMat.uniforms; let shafts = 0;
  if(sky && sky.visible && g.rays > 0){ const dir = sky.material.uniforms.sunDir.value; camera.getWorldDirection(_v.a);
    const facing = _v.a.dot(dir); if(facing > 0.05){ _v.b.copy(camera.position).addScaledVector(dir, 200).project(camera);
      r.sun.value.set(_v.b.x*0.5 + 0.5, _v.b.y*0.5 + 0.5); shafts = g.rays*Math.min(1, (facing - 0.05)*3); } }
  r.strength.value += (shafts - r.strength.value)*0.08;
  if(r.strength.value > 0.01){ r.tScene.value = rtScene.texture; r.tDepth.value = dt; draw(M.raysMat, M.raysRT); M.raysOn = true; }
  else if(M.raysOn){ R.setRenderTarget(M.raysRT); R.clear(); M.raysOn = false; }           // indoors or facing away: no shafts
  // depth of field for the menu: a soft copy of the frame to fade into away from the focus
  u.dof.value += (P.dof - u.dof.value)*0.08;
  if(u.dof.value > 0.01){ M.down.uniforms.tMap.value = rtScene.texture; M.down.uniforms.texel.value.set(1/size[0], 1/size[1]); draw(M.down, M.dofA);
    for(let i=1;i<=2;i++){ M.blur.uniforms.tMap.value = M.dofA.texture; M.blur.uniforms.dir.value.set(i/hw, 0); draw(M.blur, M.dofB);
      M.blur.uniforms.tMap.value = M.dofB.texture; M.blur.uniforms.dir.value.set(0, i/hh); draw(M.blur, M.dofA); } }
  u.tDepth.value = dt; u.tAO.value = M.ao2.texture; u.tDof.value = M.dofA.texture; u.focus.value = P.focus;
  u.tRays.value = M.raysRT.texture;
}
})(window.ZD);

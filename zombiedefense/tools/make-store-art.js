// Renders the GameDistribution store art from the real game: the squad poster scene with the logo on
// top, at every thumbnail size, plus a few gameplay screenshots.
//   npm i -g playwright   (or any install where require('playwright') works)
//   node tools/make-store-art.js
// Output: gamedistribution/assets/*.jpg. Needs Python 3 with Pillow for the final downscale.
// ART_ONLY=1 renders just the thumbnails, SHOTS_ONLY=1 just the gameplay screenshots (each takes minutes in software).
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
let chromium; try{ ({ chromium } = require('playwright')); }catch(e){ ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'gamedistribution', 'assets'), TMP = path.join(OUT, '.raw');
// w x h: the size GameDistribution asks for. css: the size the page is rendered at before scaling down.
// logo: where the logo sits (percent of the frame). cam: framing overrides for UI.showcase('poster').
const ART = [
  { name:'thumb-512x384', w:512, h:384, css:[1024, 768], logo:{ left:15, top:3, width:70 }, cam:{ ly:2.1, fov:54, back:-1.6 } },
  { name:'thumb-512x512', w:512, h:512, css:[960, 960], logo:{ left:12, top:3, width:76 }, cam:{ ly:2.35, fov:60, back:-1.4 } },
  { name:'thumb-512x340', w:512, h:340, css:[1024, 680], logo:{ left:17, top:3, width:66 }, cam:{ ly:2.05, fov:52, back:-1.6 } },
  { name:'thumb-200x120', w:200, h:120, css:[900, 540], logo:{ left:6, top:3, width:88 }, cam:{ ly:2.2, fov:54, back:-1.8 }, noTag:true },
  { name:'banner-1280x720', w:1280, h:720, css:[1280, 720], logo:{ left:4, top:8, width:38 }, cam:{ lr:-2.4, ly:1.6, fov:48, back:-1.2 } },
  { name:'banner-1280x550', w:1280, h:550, css:[1280, 550], logo:{ left:4, top:10, width:33 }, cam:{ lr:-3.4, ly:1.55, fov:42, back:-0.8 } },
];
const SHOTS = [
  { name:'screenshot-1-city', map:0, mission:true },
  { name:'screenshot-2-forest', map:7 },
  { name:'screenshot-3-military', map:1 },
];

function serve(){
  const types = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.json':'application/json' };
  const srv = http.createServer((req, res)=>{ const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if(!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type':types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  return new Promise(r=>srv.listen(0, ()=>r(srv)));
}
async function boot(page, url){
  await page.goto(url);
  await page.waitForFunction(()=>window.ZD && ZD.C && ZD.C.G.firstFrame, null, { timeout:90000 });
  await page.waitForTimeout(1200);
}
const HIDE = '.ov, #hud, #tc, #bPause, #bSound, #notes, #loadWrap, #rotate, #adWait { display:none !important; }';

(async ()=>{
  fs.mkdirSync(TMP, { recursive:true });
  const srv = await serve(), url = 'http://localhost:' + srv.address().port + '/index.html';
  const browser = await chromium.launch({ args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for(const a of (process.env.SHOTS_ONLY ? [] : ART)){
    const page = await browser.newPage({ viewport:{ width:a.css[0], height:a.css[1] }, deviceScaleFactor:1.5 });
    await boot(page, url);
    await page.addStyleTag({ content:HIDE + `
      #artLogo{ position:absolute; z-index:90; left:${a.logo.left}%; top:${a.logo.top}%; width:${a.logo.width}%; text-align:center; }
      #artLogo::before{ content:''; position:absolute; inset:-30% -18% -40%; background:radial-gradient(ellipse at center, rgba(3,4,6,.72), rgba(3,4,6,0) 68%); z-index:-1; }
      #artLogo .logo{ max-width:none; width:100%; } #artLogo .tag{ font-size:${Math.round(a.css[0]*a.logo.width/100*0.034)}px; color:#f3efe6; text-shadow:0 2px 6px #000; margin-top:0; }` });
    await page.evaluate(({ cam, noTag })=>{
      const src = document.querySelector('#menu .logoWrap'), el = document.createElement('div'); el.id = 'artLogo';
      el.innerHTML = src.innerHTML.replace(/lg([ZSB])/g, 'art$1'); if(noTag){ const t = el.querySelector('.tag'); if(t) t.remove(); }
      document.getElementById('app').appendChild(el);
      ZD.UI.showcase('poster', cam);
      for(let i=0;i<220;i++) ZD.UI.menuStep(0.1);        // let the horde close in
    }, { cam:a.cam, noTag:!!a.noTag });
    await page.waitForTimeout(2500);
    await page.screenshot({ path:path.join(TMP, a.name + '.png') });
    await page.close(); console.log('rendered', a.name);
  }
  for(const s of (process.env.ART_ONLY ? [] : SHOTS)){
    const page = await browser.newPage({ viewport:{ width:1280, height:720 }, deviceScaleFactor:1 });
    page.setDefaultTimeout(180000);
    await boot(page, url);
    await page.addStyleTag({ content:'#notes, #toast, #banner, #clickWrap { display:none !important; }' });
    await page.evaluate(s=>{ if(s.mission) ZD.Modes.startMission(s.map, 0); else { ZD.Modes.startSurvival(s.map); ZD.C.G.breakT = 0.3; } }, s);
    await page.waitForTimeout(4000);                          // let the map's light and sky settle
    await page.evaluate(()=>{ const d = ZD.dbg; d.G.god = true; d.simulate(9); d.frame(0.016); });
    await page.waitForTimeout(2500);
    await page.screenshot({ path:path.join(TMP, s.name + '.png') });
    await page.close(); console.log('rendered', s.name);
  }
  await browser.close(); srv.close();
  // exact sizes, sharp downscale, small JPGs
  const py = `
import sys, os
from PIL import Image
tmp, out = sys.argv[1], sys.argv[2]
sizes = dict(a.split(':') for a in sys.argv[3:])
for f in sorted(os.listdir(tmp)):
    n = f[:-4]; im = Image.open(os.path.join(tmp, f)).convert('RGB')
    w, h = (int(v) for v in sizes.get(n, '1280x720').split('x'))
    im = im.resize((w, h), Image.LANCZOS); im.save(os.path.join(out, n + '.jpg'), quality=92, optimize=True, progressive=True)
    print('wrote', n + '.jpg', w, 'x', h)
`;
  execFileSync('python3', ['-c', py, TMP, OUT, ...ART.map(a=>a.name + ':' + a.w + 'x' + a.h)], { stdio:'inherit' });
  fs.rmSync(TMP, { recursive:true, force:true });
})().catch(e=>{ console.error(e); process.exit(1); });

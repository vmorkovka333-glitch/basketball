GRAND PRIX 3D
=============

Self-contained HTML5 game (Three.js r128). No build step. NO external dependencies
and NO external network calls - Three.js is bundled and both fonts are embedded.
Fully licensable.

FILES
  index.html     the game (single file, fonts embedded)
  three.min.js   Three.js r128 (bundled)

AD INTEGRATION (for the publisher)
  Ad-free by default. Define window.gameShowAd = function(){ ... } to show your
  interstitial; the game calls it only between races, never mid-race. Wrap the
  ad with window.gamePauseForAd(true) / (false); window.gameIsPaused() reports
  the state.

GAMEPLAY
  Arcade open-wheel racing on a fictional circuit: a long pit straight, a fast
  right-hander, a hairpin, a chicane and a sweeping back section. Five AI
  rivals, 3 or 5 laps, start from the back of the grid behind five red lights.
  Arcade handling with drift, grass slows you down, barriers cost speed.

CONTROLS
  Desktop  Arrows or WASD to steer, accelerate and brake; Space is a handbrake.
  Mobile   On-screen buttons: steer left/right, GAS, BRAKE. Portrait and landscape.

AUDIO
  Web Audio, unlocked on the first tap: a synthesised engine that follows a
  seven-gear rev bar, tyre screech on slip, start-light beeps, a finish jingle.

STORAGE
  localStorage keys "gp.vol" and "gp.muted" remember the audio settings.
  Nothing else is stored; no cookies, no analytics, no tracking.

LOADING
  Three.js and the SDK are deferred, so a loading screen with real progress
  appears at once; window.onGameLoaded fires when it finishes. Safe in an iframe
  of any size, including one that starts at 0x0 and is sized later.

RUN LOCALLY
  Serve the folder over HTTP:  python3 -m http.server   ->  http://localhost:8000/

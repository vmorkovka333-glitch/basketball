3D BOWLING
==========

Self-contained HTML5 game (Three.js r128). No build step. NO external dependencies
and NO external network calls — Three.js is bundled and both fonts are embedded in
the page as base64. Fully licensable.

FILES
  index.html     the game (single file, fonts embedded)
  three.min.js   Three.js r128 (bundled)

AD INTEGRATION (for the publisher)
  Ad-free by default. No third-party SDK is embedded, so you can plug in ANY ad
  network (AdSense, GameDistribution, your own):

  1) Show your interstitial: define a global function

         window.gameShowAd = function () { /* show your interstitial ad */ };

     The game calls it automatically at a natural break — when PLAY AGAIN is
     pressed, between games. It is NEVER called during a throw.

  2) Pause the game around the ad:

         window.gamePauseForAd(true)    // before the ad -> freezes world, mutes audio
         window.gamePauseForAd(false)   // after the ad  -> resumes

     If your ad SDK fires pause/resume events, wire them to these two calls.
     window.gameIsPaused() reports the current state.

GAMEPLAY
  Ten-pin bowling, 1 or 2 players, full ten-frame scoring with strikes, spares
  and the three-ball tenth. Rigid-body pin simulation on USBC spec dimensions
  (15" pins, 12" rack spacing, 9.6 degree balance tilt), sweeper rake and pin
  setter between throws, gutter and pit.

CONTROLS
  Desktop  move the pointer left/right to aim, hold to charge, release to bowl.
           SPACE = charge/release, LEFT/RIGHT arrows = fine aim.
  Mobile   drag to aim, hold to charge, lift to bowl. Portrait and landscape.
  Buttons  MUS = music on/off, note = sound on/off, 1P/2P = player count.

AUDIO
  Web Audio, unlocked on the first tap. Recorded rack crash with a synthetic
  room tail, deck thuds, strike/spare chimes, and five synthesised house tracks
  (132/112/100/138/88 bpm) that duck under the crash. No background ambience.

STORAGE
  localStorage keys "bowl.muted" and "bowl.music" remember the audio toggles.
  Nothing else is stored; no cookies, no analytics, no tracking.

RUN LOCALLY
  Serve the folder over HTTP:  python3 -m http.server   ->  http://localhost:8000/

TECH
  Three.js r128 (classic script -> ./three.min.js), plain DOM/CSS HUD, Web Audio API.
  Bungee + Oswald embedded as woff2 data URIs (latin subset).

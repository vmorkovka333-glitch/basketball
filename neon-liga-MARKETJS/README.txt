NEON LIGA — 3D Arcade Football (11v11)
======================================

Self-contained HTML5 game (Three.js). No build step. NO external dependencies and
NO external network calls — Three.js and PeerJS are bundled locally. All club and
player names are original/fictional. Fully licensable.

FILES
  index.html        the game (single-file ES module)
  three.module.js   Three.js r160 (bundled)
  peerjs.min.js     PeerJS 1.5.4 (bundled; only for optional online 1v1)

HOW TO RUN
  Serve the folder over HTTP (ES modules need http/https, not file://):
      python3 -m http.server        then open  http://localhost:8000/
  Works on desktop and mobile browsers, portrait and landscape.

AD INTEGRATION (for the publisher)
  Ad-free by default. To monetize, plug in ANY ad network (AdSense, GameDistribution,
  your own — no third-party SDK is embedded):

  1) Show your interstitial: define a global function
         window.gameShowAd = function () { /* show your interstitial ad */ };
     The game calls it automatically at natural breaks (after each match — on the
     "Menu" and "Rematch" buttons). It is NEVER called during gameplay.

  2) Pause the game around the ad:
         window.gamePauseForAd(true)    // before the ad  -> pauses world + mutes audio
         window.gamePauseForAd(false)   // after the ad   -> resumes
     If your ad SDK fires pause/resume events, wire them to these two calls.

FEATURES
  Manager career, player career, league seasons, cup, World Cup with national teams,
  transfer market, stadium upgrades, youth academy, curl/finesse free kicks, penalties,
  VAR reviews, red cards, per-player goal celebrations, commentary, online 1v1 (PeerJS),
  progression with autosave (localStorage key: neonliga_save_v1).

CONTROLS
  Desktop: WASD move, SHIFT sprint, SPACE pass/tackle, X shoot (hold = power),
           C cross/press, Q switch/feint, P pause.
  Mobile:  left joystick + right action buttons (touch-ready).

TECH
  Three.js r160 (ESM via importmap -> ./three.module.js), classic DOM UI, Web Audio API.

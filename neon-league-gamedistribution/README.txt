NEON LEAGUE — 3D Arcade Football (11v11)  ·  GameDistribution build
===================================================================
HTML5 game (Three.js). English. Original/fictional club and player names.
Desktop + mobile (portrait & landscape), touch controls. No build step.

FILES
  index.html        the game (classic scripts — also runs from file://)
  three.global.js   Three.js r160 (bundled locally)
  peerjs.min.js     PeerJS 1.5.4 (bundled; optional online 1v1)

GAMEDISTRIBUTION SDK — ALREADY INTEGRATED
  Game ID is already set: 7bf9ac5a92e8405a85ad6a67ad1d8068
  Interstitial ads are shown ONLY at natural breaks (after a match — on
  "TO MENU" and "REMATCH"), never during gameplay. While an ad plays the
  world pauses and audio is muted (SDK_GAME_PAUSE / SDK_GAME_START).

RUN LOCALLY
  Serve over HTTP:  python3 -m http.server   ->  http://localhost:8000/

FEATURES
  Manager & player career, league seasons, euro cups, World Cup with national
  teams, transfer market, stadium upgrades, youth academy, curled free kicks,
  penalties, VAR, red cards, goal celebrations, commentary, online 1v1.
  Autosave via localStorage (key: neonliga_save_v1).

CONTROLS
  Desktop: WASD move, SHIFT sprint, SPACE pass/tackle, X shoot (hold = power),
           C cross/press, Q switch/skill move, P pause.
  Mobile:  left joystick + right action buttons.

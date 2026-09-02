3D BOWLING  ·  CrazyGames build
===============================

HTML5 game (Three.js r128). Self-contained apart from the CrazyGames SDK:
Three.js and both fonts are bundled locally, so the game keeps working even if
the SDK is unreachable.

FILES
  index.html     the game, with CrazyGames SDK v3 wiring; fonts embedded
  three.min.js   Three.js r128 (bundled locally)

CRAZYGAMES SDK — ALREADY INTEGRATED
  - Loads https://sdk.crazygames.com/crazygames-sdk-v3.js and calls SDK.init().
  - Loading events: game.loadingStart() before init, game.loadingStop() after.
  - Gameplay events: game.gameplayStart() when a game begins (and on PLAY AGAIN),
    game.gameplayStop() when a game ends, so ads never interrupt a throw.
  - Midgame interstitials are requested only at a natural break — when PLAY AGAIN
    is pressed. While the ad runs the simulation is frozen and audio is muted,
    then both resume automatically.
  Outside crazygames.com the SDK runs in limited mode and the game simply plays
  ad-free — no errors, nothing to configure.

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

3D BOWLING  .  GameDistribution build
=====================================

HTML5 game (Three.js r128). Three.js and both fonts are bundled locally; the
only external request is the GameDistribution SDK.

BEFORE PUBLISHING - ONE EDIT REQUIRED
  Open index.html and replace the placeholder on the GD_OPTIONS line:

      gameId: "YOUR-GAMEDISTRIBUTION-GAME-ID"

  with the id from your GameDistribution dashboard. Nothing else needs changing.

FILES
  index.html     the game, with the GD SDK loader and event wiring
  three.min.js   Three.js r128 (bundled locally)

GD SDK - ALREADY INTEGRATED
  - Loader for https://html5.api.gamedistribution.com/main.min.js in the header.
  - SDK_GAME_PAUSE freezes the simulation and mutes audio; SDK_GAME_START resumes
    it. Both are wired through the game's own gamePauseForAd() helper.
  - gdsdk.showAd() is called only at a natural break - when PLAY AGAIN is pressed.
    It is never called during a throw.
  - The game carries no ads, analytics or external links of its own.

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

LOADING
  Three.js and the portal SDK are both deferred, so the first paint is never blocked:
  a loading screen appears immediately and fills a lane-shaped progress bar from real
  milestones (fonts, the bundle, the built scene, the first rendered frame). When it
  finishes it calls window.onGameLoaded, then hands over to the start menu.

START MENU
  The game opens on a menu with the instructions, a 1P/2P choice, a master volume
  slider and a music toggle. It ignores all input until PLAY is pressed. A MENU
  button beside PLAY AGAIN reopens it after a game.

EMBEDDING
  Safe in an iframe of any size, including one that starts at 0x0 and is sized
  or revealed later: the game waits for a real viewport, and the render loop
  re-checks the size every frame rather than relying on resize events.

RUN LOCALLY
  Serve the folder over HTTP:  python3 -m http.server   ->  http://localhost:8000/

GRAND PRIX 3D - SEASON  .  GameDistribution build
================================================

HTML5 game (Three.js r128). Three.js and both fonts are bundled locally; the
only external request is the GameDistribution SDK.

READY TO UPLOAD
  gameId: c870d2c80d8e4890a2f936fd99059c53   (already set in index.html)

FILES
  index.html     markup, styles, GD SDK loader and event wiring; fonts embedded
  three.min.js   Three.js r128 (bundled)
  js/            data.js, engine.js, game.js

GD SDK - ALREADY INTEGRATED
  SDK_GAME_PAUSE freezes the game and mutes audio; SDK_GAME_START resumes it.
  gdsdk.showAd() is called only between races, never during one.

GAMEPLAY
  A 25-round championship of original circuits, 20 drivers across 10 invented
  teams. Qualifying, tyre wear and five compounds, fuel, a drivable pit lane
  with a speed limit, changing weather, DRS, safety car, penalties, team radio,
  a garage with upgrades, driver and constructor standings, a 3D podium.
  Single race mode for a quick go. 7-10 laps per race.

CONTROLS
  Desktop  Arrows or WASD steer, accelerate, brake. Space handbrake. Shift
           overtake mode. E or Enter hold for DRS. P call the pit lane. C camera.
  Mobile   On-screen buttons appear automatically. Portrait and landscape.

STORAGE
  The season is saved in localStorage under "gp3.save.v1". No cookies, no
  analytics, no tracking.

LEGAL
  No real team, driver, sponsor or circuit layout is reproduced. Host city and
  country names are used as event names only.

RUN LOCALLY
  Serve the folder over HTTP:  python3 -m http.server   ->  http://localhost:8000/

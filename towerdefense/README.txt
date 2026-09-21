TOWER DEFENSE 3D  .  %TITLE%
=====================================

HTML5 game (Three.js r128, bundled locally). Fonts are embedded; the game makes
no external requests of its own. Upload the folder contents as they are:

  index.html        the game shell, HUD and menus
  js/data.js        towers, enemies, maps, wave rules
  js/world.js       the 3D side: island, meshes, particles
  js/game.js        simulation, waves, UI, audio, save, portal hooks
  three.min.js      Three.js r128

%SDK%

GAMEPLAY
  Classic tower defense on a floating low-poly island. Enemies walk the road
  from the portal to the castle; flyers cut across the island instead. Build
  towers on any free tile, upgrade them twice, sell for 70%. Survive 30 waves
  to win a map and unlock the next one; keep playing in endless mode after.

  Maps      Green Valley, Dusty Canyon, Frostpeak - each with its own road,
            flight lane and difficulty. Stars (1-3) depend on lives left.
  Towers    Archer (fast, hits air), Cannon (splash, ground only), Frost
            (slows), Tesla (chain lightning), Sniper (long range, ignores
            armor). Three levels each, sell value 70% of what was spent.
  Enemies   Grunt, Runner, Brute (armored, costs 2 lives), Flyer (air lane),
            Knight (heavy armor), Boss every 10th wave (costs 5 lives).
  Economy   Gold per kill and per wave; sending the next wave early pays a
            bonus for every second left on the timer.

CONTROLS
  Mouse    click a tower card, then a free tile to build; click a tower to
           upgrade or sell it; hover shows range.
  Keys     1-5 pick a tower, Space/Enter send the next wave, U upgrade,
           X sell, Q cycle speed, P pause, Esc cancel.
  Touch    tap a card, tap a tile; tap a tower for its panel. Portrait and
           landscape both work - the island rotates to fit.
  Speed    1x / 2x / 3x buttons in the HUD.

AUDIO
  Web Audio, unlocked on the first tap. Synthesised shots, explosions, chimes
  and an ambient chord loop (music toggle in the menu). No audio files.

STORAGE
  localStorage key "td.save.v1": stars and best wave per map, volume, sound
  and music toggles. Local to the device; no cookies, no analytics.

LOADING
  Three.js is deferred so the loading screen paints first; the bar tracks real
  milestones (fonts, bundle, first frame) and then calls window.onGameLoaded.

EMBEDDING
  Safe in an iframe of any size, including one that starts at 0x0 and is sized
  later: the renderer waits for a real viewport and re-checks the size every
  frame. The camera refits the island whenever the aspect ratio changes.

RUN LOCALLY
  Serve the folder over HTTP:  python3 -m http.server   ->  http://localhost:8000/

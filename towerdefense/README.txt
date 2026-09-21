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
  towers on any free tile, upgrade them, sell for 70%. Survive 30 waves to
  win a map and unlock the next one; keep playing in endless mode after.

  Maps      Green Valley, Dusty Canyon (sandstorms cut tower range), Frostpeak
            (faster enemies), Volcano (lava pools erupt on the road), Deep
            Space (low gravity: slow walkers, fast and frequent flyers), and
            The Gauntlet - a tiered map: every win raises its tier (+30%
            enemy health, +3% speed, +8% more enemies and +25% rewards per
            tier), so it never stays beaten. Each map has its own boss.
            Stars (1-3) depend on lives lost.
  Towers    Archer, Cannon, Frost, Tesla, Sniper, Laser (unlocks at player
            level 8). Two straight upgrades, then level 3 is a choice between
            two specializations per tower (e.g. Rapid Fire / Longbow, Big
            Blast / Fire Shells, Deep Chill / Freeze, Storm / Overcharge,
            Headshot / Assassin, Focus / Prism).
  Abilities Meteor, Freeze and Mega Chain on cooldowns, unlocked at player
            levels 2 / 4 / 6.
  Enemies   Grunt, Runner, Brute, Flyer, Shieldman (shield soaks damage;
            snipers and lightning pass through), Gold Thief (steals gold at
            the castle), Knight (heavy armor), Ghost (arrows and shells pass
            through it), Healer, Mini Boss mid-wave, and a Boss every 10th
            wave with three phases: enrages at 50%, summons at 25%, shields
            at 10%.
  Economy   Gold per kill and per wave; sending the next wave early pays a
            bonus for every second left on the timer.
  Progress  XP and coins after every game (win or lose). Player level unlocks
            abilities, the Laser, extra starting gold and lives. 12 challenges
            pay coins + XP. Six cosmetic tower skins bought with coins - no
            pay to win, skins only change colours.
  Feel      Damage numbers, hit flashes, camera shake, particles, lightning,
            boss banner and darker boss music.

CONTROLS
  Mouse    click a tower card, then a free tile to build; click a tower to
           upgrade or sell it; hover shows range.
  Keys     1-6 pick a tower, Space/Enter send the next wave, U upgrade,
           X sell, Q cycle speed, Z/C/V abilities, P pause, Esc cancel.
  Touch    tap a card, tap a tile; tap a tower for its panel. Portrait and
           landscape both work - the island rotates to fit.
  Speed    1x / 2x / 3x buttons in the HUD.

AUDIO
  Web Audio, unlocked on the first tap. Synthesised shots, explosions, chimes
  and an ambient chord loop (music toggle in the menu). No audio files.

STORAGE
  localStorage key "td.save.v2": stars and best wave per map, XP, coins,
  skins, challenge progress, settings. Local to the device; no cookies, no analytics.

LOADING
  Three.js is deferred so the loading screen paints first; the bar tracks real
  milestones (fonts, bundle, first frame) and then calls window.onGameLoaded.

EMBEDDING
  Safe in an iframe of any size, including one that starts at 0x0 and is sized
  later: the renderer waits for a real viewport and re-checks the size every
  frame. The camera refits the island whenever the aspect ratio changes.

RUN LOCALLY
  Serve the folder over HTTP:  python3 -m http.server   ->  http://localhost:8000/

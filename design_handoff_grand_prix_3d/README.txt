GRAND PRIX 3D — Season
======================

A full championship racing game in one folder. No build step, no dependencies
beyond the bundled three.js. Open index.html and it runs.

FILES
-----
index.html      markup, styles, GameDistribution SDK hook
three.min.js    bundled renderer
js/data.js      teams, drivers, tyre compounds, points, the 25-round calendar
js/engine.js    track + pit lane geometry, scenery, physics, AI, cameras
js/game.js      weekend flow, pit stops, weather, standings, HUD, audio, save

WHAT IS IN IT
-------------
- 25 rounds. Every circuit is an original layout, named after a real venue and
  shaped to evoke its character (Monza long and fast, Monaco tight, Singapore
  and Las Vegas at night). Laps run 2.0–5.0 km, 7–10 laps per race.
- Nineteen different environments, one per region, so a circuit looks like the
  place it is named after: desert dunes at Sakhir and Lusail, a city skyline at
  Shanghai and Singapore, neon towers over Las Vegas at night, moored boats and
  hillside apartments at Monte Carlo, snow-capped mountains at Spielberg,
  hedged crop fields at Silverstone, cypress rows at Imola, a ferris wheel at
  Suzuka, mesas at Austin, open water at Miami, Montreal, Jeddah and Yas
  Marina. Ground colour, sky gradient, planting (broadleaf, conifer, palm,
  cypress, hedgerow or scrub) and horizon silhouette all change with it.
- 20 drivers across 10 teams, each with its own car rating, and drivers with
  separate skill, aggression and consistency values. Every car carries a
  driver in the tub — shoulders, arms on the wheel, helmet and visor under a
  halo — plus a multi-element front wing, sidepods, airbox, diffuser and a
  rear wing whose flap opens for DRS. Tyre sidewalls are coloured by compound.
- DRS. Three detection points per circuit on the longest straights. Get within
  one second of the car ahead at the detection line and the zone opens; hold E
  (or the DRS button) on the throttle to run the flap open.
- A real safety car that comes out after a heavy incident, picks up the leader
  and leads the field until the track is clear, and recovery cranes that lift
  stricken cars off the circuit so nothing is left lying on the racing line.
- Team radio. Your race engineer calls tyre degradation, fuel, the weather,
  damage, positions gained and lost, penalties and when to box.
- Penalties. Five seconds for causing a collision, three for speeding in the
  pit lane, both served at your next stop.
- The Garage. Development points arrive after every race; spend them on the
  power unit, aerodynamics, tyre management and reliability, and the upgrades
  stay fitted for the season.
- A drivable pit lane with a speed limit and a penalty for breaking it: 20 team
  garages with open fronts, lit interiors, tyre stacks, benches, engineers'
  glass pods above and lollipop rigs over each box, a pit wall lined with
  timing stands, and a crew that comes over the wall to service your car. You
  choose the compound and the fuel load at the stop.
- Five compounds: soft, medium, hard, intermediate, wet. Grip falls as the
  tyre wears and the wets overheat in the dry.
- Weather changes mid-race. A dry track can go wet and back again.
- Safety cars, yellow sectors, AI mistakes, contact damage and retirements.
- Qualifying (a short session of free flying laps) sets the grid, or skip it.
- Four cameras: chase, cockpit, bonnet, trackside. Press C.
- A podium ceremony after every race, staged in 3D: third place walks out and
  takes the low step, then second, then the winner onto the tall centre step,
  each lifting a trophy, each named on screen as they arrive. Then the corks
  come out and all three spray champagne while the grandstand jumps and waves.
- Grandstands full of individual people — around 2,300 of them per circuit,
  seated on eight stepped tiers under a roof on pillars. Each stand is split
  into five blocks, every block dressed in one team's colour with a banner
  draped over its front rail. Where a round has a national team in the field
  that becomes the home crowd: nine spectators in ten wear its colour, so the
  Italian rounds turn the grandstands red.
- The crowd reacts to the racing. They bob gently while they wait, and when a
  car comes past their stand they stand up and cheer — the ones wearing that
  team's colour jump highest, throw both arms up and wave their flags, willing
  their car on. Passing in someone else's colours gets you a fraction of it.
  All of it drawn as instanced geometry, so thousands of people cost about
  sixty draw calls.
- City landmarks on the far horizon, so a round looks like the place it is.
  A glowing sphere, a pyramid, a light-lattice hotel and an observation needle
  over Las Vegas at night; terracotta-roofed old houses and a bell tower at
  Monza and Imola; a sphere-topped needle at Shanghai; three curved towers and
  a walled old quarter at Baku; a lighthouse over the Zandvoort dunes; a
  lattice dome at Montreal; a pagoda at Suzuka; a spired basilica at
  Barcelona; a domed riverside palace at Budapest; airfield hangars and a
  control tower at Silverstone; a cable car at Spielberg; a hillside of dense
  housing at Sao Paulo; a snow-capped volcano and a floodlit bowl at Mexico
  City; chalets in the Spa forest; whitewashed villages at Portimao. All of it
  original architecture, and all of it footprint-tested against the circuit so
  nothing reaches the road.
- Driver and constructor standings, points for the top ten plus fastest lap.
  The season is saved in the browser.

CONTROLS
--------
Arrow keys or WASD    steer, accelerate, brake
Space                 handbrake
Shift                 overtake mode (limited per lap, recharges each lap)
E or Enter            hold for DRS when the zone is open
P                     call the pit lane for this lap
C                     change camera
Esc                   menu
Touch devices get on-screen buttons automatically.

PUBLISHING ON GAMEDISTRIBUTION
------------------------------
1. Open index.html and replace YOUR-GAMEDISTRIBUTION-GAME-ID near the bottom
   with the game id from your GameDistribution dashboard.
2. Zip the contents of this folder (index.html at the root of the zip, with
   three.min.js and the js folder beside it) and upload it.

The SDK hook is already wired:
  window.gamePauseForAd(true/false)   pauses the loop and mutes audio
  window.gameIsPaused()               current state
  window.gameShowAd()                 called between races
SDK_GAME_PAUSE and SDK_GAME_START events are handled in index.html.

NOTES
-----
- No real team, driver or circuit layouts are reproduced. Names of host cities
  and countries are used as event names only.
- Audio starts on the first key press or tap, as browsers require.
- Rendering quality steps down automatically on touch devices.

TOWER DEFENSE 3D  .  Publisher build (no SDK)
=====================================

HTML5 game (Three.js r128, bundled locally). Fonts are embedded; the game makes
no external requests of its own. Upload the folder contents as they are:

  index.html        the game shell, HUD and menus
  js/data.js        towers, enemies, maps, wave rules
  js/world.js       the 3D side: island, meshes, particles
  js/game.js        simulation, waves, UI, audio, save, portal hooks
  three.min.js      Three.js r128

AD INTEGRATION (for the publisher)
  Ad-free by default. No third-party SDK is embedded and the game makes no
  external network calls, so you can plug in ANY ad network:

  1) window.gameShowAd = function (kind, done) { /* show your interstitial */ };
     kind is 'preroll' (player pressed PLAY) or 'midgame' (RETRY / NEXT MAP /
     MENU). If your hook declares the second argument, the game waits and only
     starts once you call done(); otherwise it continues right away. It is
     NEVER called during a wave.
  2) window.gamePauseForAd(true)  before the ad -> freezes world, mutes audio
     window.gamePauseForAd(false) after the ad  -> resumes
     window.gameIsPaused() reports the current state.

GAMEPLAY
  Classic tower defense on a floating low-poly island with neon lighting.
  Enemies walk the road from the portal to the castle; flyers cut across.

  Modes     Normal (30 waves, stars) · Hard (health ramps up to +45%, crown)
            · Endless · Challenge (20 waves + a rule: No Tesla, Shoestring,
            Glass Castle, No Magic, Swarm, Old School, Build Mode (4 towers),
            Lucky Three (3 random towers), Blitz (2x speed, 2x gold), Random)
            · Roguelike (Lv 4: pick 1 of 3 random perks every 3 waves, random
            waves every run) · Boss Rush (Lv 8: 10 bosses back to back).
  Maps      7 maps. Dusty Canyon and Neon Rift have forking roads on some
            waves; Frostpeak opens a new passage at wave 12; Volcano buries
            its south road at wave 16. Each map has its own boss with a
            signature move.
  World     Day and night (waves 6-10, 16-20, 26-30 are night: Night
            Stalkers appear, Lasers/Teslas see further, Archers/Snipers less).
            Weather per wave: rain, snow, fog, heatwave - each changes towers.
            Random events between waves: Power Surge, Gold Rush, Supply Drop,
            Blood Moon, Tailwind, Repairs, Mana Spring. Trees and ruins can be
            cleared; one of them and a sparkle spot hide secrets (a treasure
            chest or an ancient rune tile that boosts a tower). Energy / ice
            crystals boost Teslas / Frosts.
  Towers    9 towers (Archer, Cannon, Frost, Tesla, Sniper, Laser, Venom,
            Wind, Bank). Pick 6 as your loadout. Each has a trait, two
            specializations and a level-4 Ultimate per specialization
            (unlocked by tower mastery 2). 6 synergies between neighbouring
            towers (e.g. Frost+Tesla Superconductor, Archer+Sniper Spotter).
            Mastery: kills level each tower type up to 10 (+1% damage/level)
            with Common / Rare / Epic / Legendary rarity visuals.
  Enemies   Grunt, Runner, Brute, Flyer, Shieldman, Gold Thief, War Drummer,
            Knight, Guardian, Ghost, Shade, Healer, Saboteur, Blinker
            (teleports), Splitter (splits in 3), Mimic (copies abilities),
            Shield Carrier (domes), Commander (buffs the whole army), Night
            Stalker (dodges), Swarmlings (every 7th wave is a swarm).
  Hero      Sir Aegis (Lv 3): move him with a tap, he fights on the road and
            speeds up nearby towers; levels up during a match.
  Abilities Last Stand (once per wave), Meteor, Freeze, Mega Chain, Overdrive.
  Progress  XP, coins, research points. Research tree (9 permanent upgrades),
            Prestige from level 30 (keeps unlocks, +10% XP / +5% gold per
            star), 29 achievements, 3 daily challenges, local records (best
            endless and other runs on this device), build replay after every
            match. Skins are cosmetic only - no real-money purchases.

CONTROLS
  Mouse    click a tower card, then a free tile to build; click a tower to
           upgrade or sell it; hover shows range.
  Keys     1-6 pick a tower from your loadout, Space/Enter send the next
           wave, U upgrade (or clear a selected tree/ruin), X sell, Q speed,
           Z/C/V/B abilities, H hero, E Last Stand, 1-3 pick a perk,
           P pause, Esc cancel.
  Touch    tap a card, tap a tile; tap a tower for its panel. Portrait and
           landscape both work - the island rotates to fit.
  Speed    1x / 2x / 3x buttons in the HUD.

AUDIO
  Web Audio, unlocked on the first tap. Synthesised shots, explosions, chimes
  and an ambient chord loop (music toggle in the menu). No audio files.

STORAGE
  localStorage key "td.save.v2": stars, crowns and best wave per map, XP,
  coins, skins, challenge + daily progress, settings. Old saves carry over. Local to the device; no cookies, no analytics.

LOADING
  Three.js is deferred so the loading screen paints first; the bar tracks real
  milestones (fonts, bundle, first frame) and then calls window.onGameLoaded.

EMBEDDING
  Safe in an iframe of any size, including one that starts at 0x0 and is sized
  later: the renderer waits for a real viewport and re-checks the size every
  frame. The camera refits the island whenever the aspect ratio changes.

RUN LOCALLY
  Serve the folder over HTTP:  python3 -m http.server   ->  http://localhost:8000/

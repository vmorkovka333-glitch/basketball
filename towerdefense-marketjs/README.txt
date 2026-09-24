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
  Build towers on any free tile, upgrade them, sell for 70%.

  Modes     Normal (30 waves, stars), Hard (health ramps up to +35%, +6% speed,
            x1.6 rewards, crown on win), Endless, Challenge (20 waves with a
            rule: No Tesla, Shoestring 100 gold, Glass Castle 5 lives, No Magic,
            Swarm, Old School). First win of each rule pays 100 coins.
  Maps      Green Valley, Dusty Canyon (sandstorms), Frostpeak (icy road),
            Volcano (lava pools), Deep Space (low gravity), The Gauntlet
            (tiers), Neon Rift (player level 20; power surges double crystal
            bonuses). Every map has trees (clear for 25 gold), rocks
            (blocked), an energy crystal (buffs adjacent Teslas) and an ice
            crystal (buffs adjacent Frosts).
  Towers    Each has a signature trait plus two level-3 specializations:
            Archer crit shots; Cannon leaves burning ground; Frost chill
            stacks until the enemy freezes solid; Tesla arcs can bounce back;
            Sniper long-shot bonus; Laser heats up on one target.
  Enemies   Grunt, Runner, Brute, Flyer, Shieldman, Gold Thief, War Drummer
            (speeds up neighbours), Knight, Guardian (35% damage reduction
            aura), Ghost, Shade (turns invisible), Healer (beams heals into
            the strongest wounded ally), Saboteur (leaves the road to shut
            down your most valuable tower), Mini Boss.
  Bosses    Three phases (enrage 50%, summon 25%, shield 10%), a boss health
            bar, and one signature move per map: Earthquake Stomp, Sandstorm,
            Glacial Prison, Lava Rain, Void Portals, Warden's Wrath, Neon
            Overload.
  Abilities Meteor (Lv 2), Freeze (Lv 4), Mega Chain (Lv 6), Overdrive (Lv 15).
  Progress  XP and coins after every game. Unlocks: Laser (8), Neon Archer
            skin (10), +10% gold (12), Overdrive (15), +2 lives (17), Neon
            Rift (20), legendary aura on max towers (25). The menu always
            shows NEXT UNLOCK. 15 challenges, 3 daily challenges (same for
            everyone on a date, local clock) plus a daily bonus.
            Skins are cosmetic only - no pay to win, no real-money purchases.
  Feel      Glow sprites, shock rings, low-poly debris, tower recoil, crit
            pop-ups, boss death slow motion, hit/crit/heavy sounds.

CONTROLS
  Mouse    click a tower card, then a free tile to build; click a tower to
           upgrade or sell it; hover shows range.
  Keys     1-6 pick a tower, Space/Enter send the next wave, U upgrade
           (or clear a selected tree), X sell, Q cycle speed, Z/C/V/B
           abilities, P pause, Esc cancel.
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

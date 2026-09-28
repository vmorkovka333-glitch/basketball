TOWER DEFENSE 3D  .  GameDistribution build
=====================================

HTML5 game (Three.js r128, bundled locally). Fonts are embedded; the game makes
no external requests of its own. Upload the folder contents as they are:

  index.html        the game shell, HUD and menus
  js/data.js        towers, enemies, maps, wave rules
  js/world.js       the 3D side: island, meshes, particles
  js/game.js        simulation, waves, UI, audio, save, portal hooks
  three.min.js      Three.js r128

GAMEDISTRIBUTION SDK - ALREADY INTEGRATED
  - Loader for https://html5.api.gamedistribution.com/main.min.js in the header.
  - gameId: REPLACE_WITH_YOUR_GAMEDISTRIBUTION_GAME_ID (set in index.html)
  - SDK_GAME_PAUSE freezes the simulation and mutes audio; SDK_GAME_START resumes
    it. Both are wired through the game's own gamePauseForAd() helper.
  - Pre-roll: the moment the player presses PLAY the game asks for an
    interstitial and waits for it to finish before the map starts, so no
    gameplay ever runs behind the ad.
  - Midgame interstitials are requested from non-gameplay buttons only -
    RETRY, NEXT MAP and MENU. They are never shown during a wave.
  - An interstitial is preloaded on SDK_READY.
  - The game carries no ads, analytics or external links of its own.

GAMEPLAY
  Classic tower defense on a floating low-poly island with neon lighting.

  Campaign  World map: Green Valley -> Desert -> Frostpeak -> Volcano ->
            Space -> The Final Zone. Each victory opens the next region
            (first clear: +3 Aether Cores, +100 coins). Side regions: The
            Gauntlet, Alternate Reality, Neon Rift, Twin Keeps (player level
            14: two portals, two castles, shared lives). A secret region (Crystal
            Caverns) appears once three ancient keystones - hidden in ruins on
            three maps - are found.
  Modes     Normal · Hard · Endless · Challenge (16 rules incl. One Tower,
            No Upgrades, Hardcore = 1 life, Chaos = 6 random towers + random
            army; 4 of them are map challenges: Trio, Rush, No Magic,
            Shoestring - each first clear per map pays an Aether Core)
            · Roguelike · Boss Rush · Time Attack (20 waves, 15-minute game
            clock, x1.4 rewards) · Nightmare (+80% health, elites from wave
            11, mutants from 21, extra bosses, Mega Boss at wave 30, x2.5).
            Risk & Reward before any wave.
  Mutators  Optional modifiers before a match (Tough, Fast, Inflation, Boss
            Parade, Elite Army, Fragile Castle, Fog of War): each adds
            +20-30% XP & coins.
  Roads     Forks, passages that open, secret doors, meteor strikes that tear
            open a new road, roads that COLLAPSE mid-match (Green Valley,
            Final Zone - cracks warn one wave ahead), and road CHOICES
            (Frostpeak, Final Zone: pick which passage opens; each has a
            perk). Smart enemies (Scouts, and some others late on) take the
            least-defended road.
  Base      Between waves: Generators (energy), Barricades on the road
            (enemies must smash through; spikes at level 2+), Warp Gates
            (throw enemies back; make teleporting towers free). Tap the
            castle: Stone Walls, Iron Gate (stops the first leaks each wave),
            Castle Cannon, Power Core.
  Energy    Strong towers draw power (Tesla 2, Laser 3, hybrids 4...). Too
            little energy and they fire slower. Overcharger generators speed
            up the towers around them.
  Towers    9 towers + Paradox, loadout of 6, target priority, specs,
            Ascensions, synergies, 9 hybrids by merging, ultimates, Crystal
            Infusion (3 crystals: +25% dmg / +10% range), teleporting.
            Legendary towers (one per match, paid in crystals, unlocked with
            Aether Cores): Solar Obelisk, Void Singularity, Dragon Roost and
            the secret Aether Prism.
  Combos    Status chains between towers: Frozen Circuit (frost + tesla ->
            CHARGED), Shatter Blast (charged enemy + cannon = TRIPLE COMBO),
            plus five secret ones (Ice Pick, Steam Burst, Firestorm, Toxic
            Detonation, Overload) collected in a codex.
  Enemies   49 types incl. bosses, e.g. Infector (turns enemies into
            stronger infected), Scout (smart routing), Dasher, Burrower
            (digs under, untargetable), Regenerator, Blazer (fire trail),
            Bulwark (walking wall, can't be pushed), Volatile (stuns towers
            when it dies), Frostbringer (slows towers), Magnetron (pulls
            projectiles), Jammer (blocks ultimates), Possessed (spirit after
            death), Mirror Imp (splits), Summoner (skeletons), Plaguebearer
            (toxic clouds weaken towers). Every new type is introduced with
            a banner the first time it appears; the BESTIARY lists them all.
            Armor types: Plated, Energy Shield, Fireproof, Frost-proof,
            Insulated. EVOLUTION: when one damage type does most of the
            killing, later waves resist it (up to -30%) and, from level 2,
            some enemies arrive in counter-armor (announced in a banner).
  Ranks     The enemy army evolves every 10 waves: I Recruits (smooth
            growth), II Veterans (Enhanced Runners leave speed trails,
            Armored Brutes, dashing Elite Flyers), III Elites (double
            health, faster, special powers - e.g. Elite Knights rage when
            their shield breaks, Elite Healers heal two at once), IV Mutants
            (Mutated Grunts split, Mutated Runners sprint near the castle,
            Mutated Healers heal three), V Apex (elite mutants). Every elite also rolls an affix
            (Regenerating, Volatile, Swift, Warded, Vampiric, Blinking). Every enemy
            shows its level (Lv 1 ... Lv 60+ in Endless); levels add a little
            speed and armor on top of the health curve. Tap an enemy to see
            its level, health, armor, status and powers.
  Bosses    Four stages: I normal, II ENRAGED at 75% (faster, armored, calls
            its guard), III TRANSFORM + OVERLOAD at 50% (new look, EMP knocks
            out towers and drains ultimates, shield), IV FINAL FORM at 25%
            (bigger, faster, elite escorts, darker music, red screen pulse).
            A glowing WEAK POINT opens every 12s (+60% damage for 3s); DEATH
            THROES at 6%. Every boss has two traits by map: Armor Plating,
            Second Wind, Clone, Warband, Meteor Storm (red warning circles),
            Frost Breath, Siege, Pathfinder (changes road), Great Shield.
            Two bosses at once: the survivor takes VENGEANCE. MEGA BOSS
            "Colossus of Ruin" at endless wave 40, 60, 80... and Nightmare
            wave 30.
  Waves     Named mini-bosses every 8 waves (Juggernaut, Brood Mother,
            Phantom Lord, Plague Warlock, Sky Warden, Frost Golem), Survival
            waves (9, 18, 27: hold out against a horde), swarms, mirror waves,
            giant AIR BOSSES behind a wind shield that must be grounded with
            frost + lightning (or a gust), secret bosses.
  Veterans  Towers earn battle XP from kills and climb to battle level 6
            (+5% damage per level, stars under the tower); at levels 3 and 5
            they roll a perk (Elite Slayer, Boss Frenzy, Deep Freeze, Eagle
            Eye, Rapid Fire, Brutal, Bounty, Shredder). Mastery 10 turns a
            tower's ultimate into a MASTER ultimate (e.g. Tesla: CHAIN STORM).
  Hazards   Volcano lava and Frostpeak ice spread every 6 waves (tiles are
            marked a wave ahead); Rockfall events drop boulders you can smash
            for a crystal.
  Helper    Robot Bolt-9 (Lv 6) collects loot enemies drop and zaps enemies;
            Collect / Attack mode; upgraded in the Tech Tree workshop.
  Progress  XP, coins, Tech Tree (Attack / Defense / Economy / Abilities,
            5 tiers each, capstones cost Aether Cores), prestige, mastery,
            titles, 67 achievements, dailies, monthly seasons, records,
            replay, Secrets codex. Rare resource: Aether Cores (bosses,
            mini-bosses, combos, regions, keystones, map challenges).
            Skins are cosmetic only - no real-money purchases.

CONTROLS
  Mouse    click a tower card, then a free tile to build; click a tower to
           upgrade or sell it; hover shows range.
  Keys     1-7 pick a tower from your loadout, G generator, Space/Enter
           send the next wave, U upgrade (or clear a selected tree/ruin),
           X sell, T target priority, F unleash all ready ultimates, Q speed,
           Z/C/V/N/B abilities, H hero, R robot mode, E Last Stand, 1-3 pick
           a perk or a road, 1-6 buy in the shop, P pause, Esc cancel.
  Touch    tap a card, tap a tile; tap a tower for its panel. Portrait and
           landscape both work - the island rotates to fit.
  Speed    1x / 2x / 3x buttons in the HUD.

GRAPHICS
  Settings > Graphics: Auto (default), High, Medium, Low. Auto starts at High
  on desktop and Medium on phones and steps down if the frame rate drops
  during a wave. Low turns off shadows and ambient particles, lowers the
  render resolution and halves particle effects. Enemy meshes share their
  geometry, so big waves stay smooth.

AUDIO
  Web Audio, unlocked on the first tap. Synthesised shots, explosions, chimes
  and an ambient chord loop (music toggle in the menu). No audio files.

STORAGE
  localStorage key "td.save.v2": stars, crowns and best wave per map, XP,
  coins, cores, research, legendaries, combos, keystones, campaign, skins,
  bestiary, mutators,
  challenge + daily progress, settings. Old saves carry over. Local to the device; no cookies, no analytics.

LOADING
  Three.js is deferred so the loading screen paints first; the bar tracks real
  milestones (fonts, bundle, first frame) and then calls window.onGameLoaded.

EMBEDDING
  Safe in an iframe of any size, including one that starts at 0x0 and is sized
  later: the renderer waits for a real viewport and re-checks the size every
  frame. The camera refits the island whenever the aspect ratio changes.

RUN LOCALLY
  Serve the folder over HTTP:  python3 -m http.server   ->  http://localhost:8000/

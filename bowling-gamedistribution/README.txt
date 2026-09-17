3D BOWLING  .  GameDistribution build
=====================================

HTML5 game (Three.js r128). Three.js and both fonts are bundled locally; the
only external request is the GameDistribution SDK. Ready to upload as is.

  gameId: dc8df03639974dc6925f17ff2d8d85bf   (already set in index.html)

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
           SPACE = charge/release, LEFT/RIGHT arrows = fine aim. Nudging the
           aim WHILE charging puts a hook on the ball instead of changing its
           line outright - it breaks late, right before the pocket.
  Mobile   drag to aim, hold to charge, lift to bowl. Portrait and landscape.
  Buttons  MUS = music on/off, note = sound on/off, 1P/2P = player count.

PROGRESSION (client-side, cosmetic only - never pay to win)
  Levels    Rookie -> Pro (5) -> Star (10) -> Champion (20) -> Bowling Legend (50).
            XP for strikes, spares, pins knocked down and a growing strike combo
            ("3X STRIKE STREAK" -> "ON FIRE" -> "UNSTOPPABLE"), shown on the
            strike/spare card and on the level pill during play.
  League    A five-tier ladder (Bronze/Silver/Gold/Diamond/Legend) driven by
            career "league points" earned from every game's performance, win
            or lose.
  Challenges  Three picked deterministically from the date (reset free at local
            midnight), tracked live during play, paid out in XP + coins.
  Shop      Five ball skins (Basic/Ice/Fire/Galaxy/Gold - different colour and
            particle trail only, identical physics) and five lane themes
            (Classic/Neon/Space/Volcano/Ice - relight the room, pins and
            physics unchanged), bought with coins earned from play.
  Daily reward  A 5-day login cycle (XP, coins, a ball unlock) on first play
            of a new calendar day; the streak resets if a day is missed.

AUDIO
  Web Audio, unlocked on the first tap. Recorded rack crash with a synthetic
  room tail, deck thuds, strike/spare chimes, and five synthesised house tracks
  (132/112/100/138/88 bpm) that duck under the crash. No background ambience.

STORAGE
  localStorage keys "bowl.muted", "bowl.music" and "bowl.vol" remember the audio
  toggles, and "bowl.profile.v1" holds the progression save (XP, coins, league
  points, lifetime stats, owned/selected cosmetics, today's challenges, the
  daily-reward streak) as a single JSON blob. All of it is local to the device;
  no cookies, no analytics, no tracking, nothing sent anywhere.

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

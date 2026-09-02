# Handoff: 3D Bowling — game + HUD

## Overview

A single-player / two-player ten-pin bowling game rendered in 3D. The player aims by
moving the pointer left/right across the lane, holds to charge a power meter, and releases
to bowl. A rigid-body pin simulation decides what falls; a sweeper rake and a pin setter
clear and re-rack between throws; a full ten-frame scoresheet with strikes, spares and the
tenth-frame bonus balls runs the scoring. Audio is a recorded rack crash plus five
synthesised in-house music tracks.

The design shipped here is one self-contained HTML file: `Bowling Realistic.html`.

## About the design files

The file in this bundle is a **design reference created in HTML** — a working prototype
that shows the intended look, feel, physics behaviour and audio design. It is not
production code to lift wholesale.

The task is to **recreate this design inside the target codebase's own environment** —
React/React Three Fiber, Vue, Unity, SwiftUI + SceneKit, a native engine, whatever is
already established — using that project's patterns, asset pipeline and state management.
If there is no environment yet, pick the framework that best fits the target platform
(for web, React + three.js or React Three Fiber is the natural match, since the prototype
is already three.js) and implement the design there.

Two parts of the prototype are worth treating differently:

- **The HUD/UI layer** is plain DOM + CSS. Recreate it pixel-for-pixel in the target UI
  layer using the tokens below.
- **The physics, machinery and audio** are original game logic, not styling. The formulas,
  constants and timings in this README are the design: they were tuned by hand until the
  rack behaved correctly. Port the *numbers*, even if the code shape changes.

## Fidelity

**High fidelity.** Colours, typography, spacing, timings and physics constants are final.
The HUD should be recreated exactly. The 3D scene proportions come from real USBC
specifications (see *World units*) and should not be re-eyeballed.

---

## Screens / views

There is one screen. The 3D scene fills the viewport; every UI element is an absolutely
positioned overlay on top of it.

### 1. Lane view (the only screen)

**Purpose:** aim, charge and bowl; read the score.

**Layout:** a full-bleed `#mount` canvas at `z-index: 0`, a non-interactive vignette at
`z-index: 1`, HUD plates at `z-index: 3`, controls and the power meter at `z-index: 4`,
and the centre message overlay at `z-index: 5`.

The vignette is
`radial-gradient(120% 85% at 50% 42%, rgba(0,0,0,0) 45%, rgba(0,0,0,.45) 100%)`,
`pointer-events: none`. It exists to stop the bright maple lane from washing out the HUD.

#### Overhead scoresheet — `#board`

Top centre, flush to the top edge of the viewport like a real alley monitor.

- `position: absolute; top: 0; left: 50%; transform: translateX(-50%)`
- Background `rgba(12,16,22,.80)`, `backdrop-filter: blur(16px) saturate(1.25)`
- Border `1px solid rgba(255,255,255,.13)`, **no top border**
- `border-radius: 0 0 14px 14px`, `padding: 7px 10px 8px`
- `box-shadow: 0 14px 40px rgba(0,0,0,.55), inset 0 -1px 0 rgba(127,212,255,.10)`

Header row `#boardHead`: flex, `align-items: baseline`, `gap: 10px`, `justify-content:
center`, `padding: 0 2px 6px`, `margin-bottom: 6px`, bottom rule
`1px solid rgba(255,255,255,.09)`.

- Title `BOWLING` — Bungee 11px, `letter-spacing: .22em`, colour `#7fd4ff`
- Player tag (`PLAYER 1` / `PLAYER 2`, empty in single-player) — Oswald 500, 10px,
  `letter-spacing: .16em`, uppercase, `rgba(234,242,248,.5)`

Frame cells `.fcell`: ten of them in a flex row, no gap. Each `width: 38px`,
`padding: 0 1px`, `border-left: 1px solid rgba(255,255,255,.09)` (first cell none),
`border-radius: 4px`, transition `background .25s, box-shadow .25s`.
The tenth cell `.w10` is `52px` wide (three balls).

- `.flabel` (frame number) — Oswald 400, 9px, `letter-spacing: .1em`,
  `rgba(234,242,248,.42)`, centred, `line-height: 12px`
- `.fmarks` — flex, `gap: 2px`, `padding: 2px 2px 0`
- `.fmark` — `flex: 1; height: 17px`, centred, `background: rgba(255,255,255,.055)`,
  `border-radius: 3px`, Bungee 11px, `#f4f9fd`
- `.fcum` (running total) — centred, Bungee 12px, `#7fd4ff`, `line-height: 18px`
- Current frame `.fcell.cur` — `background: rgba(127,212,255,.11)`,
  `box-shadow: inset 0 -2px 0 #7fd4ff`; its `.fmark`s go to `rgba(255,255,255,.09)`

#### Readout plates — shared `.plate` style

- `background: rgba(12,16,22,.78)`, `backdrop-filter: blur(14px) saturate(1.2)`
- `border: 1px solid rgba(255,255,255,.13)`, `border-radius: 13px`
- `padding: 8px 15px 9px`, `text-align: center`, `box-shadow: 0 10px 30px rgba(0,0,0,.5)`
- `.lbl` — Oswald 500, 9px, `letter-spacing: .2em`, uppercase, `rgba(234,242,248,.45)`
- `.val` — Bungee 24px, `#f4f9fd`, `line-height: 1.15`, `margin-top: 2px`

**`#info` (frame counter)** — `top: 88px; right: 14px; min-width: 96px`.
Label `FRAME`, value `1/10` … `10/10`, subline `.sub` = `Throw 1` / `Throw 2` /
`Throw 3` / `Finished`, styled Oswald 500, 10px, `letter-spacing: .14em`, uppercase,
`rgba(127,212,255,.8)`, `margin-top: 1px`.

**`#pindeck` (pindeck monitor)** — `top: 178px; right: 14px; min-width: 96px`,
`padding: 9px 13px 10px`. Label `PINDECK`. Below it `#pinrows`: a column, `align-items:
center`, `gap: 3px`, `margin-top: 5px`, holding four `.pdrow` flex rows (`gap: 4px`) in
house-monitor order — back row first:

```
row 1: pins 7 8 9 10
row 2: pins 4 5 6
row 3: pins 2 3
row 4: pin  1
```

Each `.ppin` is `9 × 12px`, `border-radius: 46% 46% 38% 38%` (a pin silhouette),
`background: #f4f9fd`, `box-shadow: 0 0 8px rgba(244,249,253,.45)`.
Knocked down → `.down`: `background: rgba(255,255,255,.10)`, no shadow, `opacity: .7`.
Transitions `background .2s, box-shadow .2s, opacity .2s`.

**`#total` (score)** — `bottom: 22px; left: 16px; min-width: 104px`. Label `SCORE`,
value Bungee **34px**, colour `#7fd4ff`, `text-shadow: 0 0 18px rgba(127,212,255,.45)`.
Shows the running total of the player whose turn it is.

#### Turn indicator — `#turnBar`

Only rendered with two players. `top: 92px; left: 50%; transform: translateX(-50%)`
(directly under the scoresheet), `display: none` → `flex` when active.
Pill: `background: rgba(12,16,22,.78)`, `blur(14px)`,
`border: 1px solid rgba(255,255,255,.13)`, `border-radius: 99px`, `padding: 7px 16px`,
`gap: 16px`, `box-shadow: 0 10px 28px rgba(0,0,0,.5)`.

Each `.pseg`: flex, `gap: 7px`, Oswald 400 12px, `letter-spacing: .1em`, colour
`rgba(234,242,248,.42)`; content `P1 <total>`. Active `.pseg.act`: `#f4f9fd`, weight 500.
`.pdot` is an `8px` circle filled with the player colour, `opacity: .45`; when active,
`opacity: 1` and `box-shadow: 0 0 10px currentColor` (the dot's `color` is set to the same
player hex so the glow matches).

Player colours: **P1 `#ffb63d`**, **P2 `#7fd4ff`**.

#### Power meter — `#powerWrap`

`bottom: 64px; left: 50%; transform: translateX(-50%)`, `216 × 9px`,
`border-radius: 99px`, `overflow: hidden`,
`background: rgba(255,255,255,.12)`,
`box-shadow: inset 0 0 0 1px rgba(255,255,255,.12), 0 6px 18px rgba(0,0,0,.5)`.
Hidden with `opacity: 0`, shown with `.on { opacity: 1 }`, transition `.18s`.

Scale ticks are an overlay `::after`:
`repeating-linear-gradient(90deg, transparent 0 23px, rgba(11,15,20,.55) 23px 24px)`
(mobile: 20px/21px).

`#powerFill` — `height: 100%`, width driven from 0→100%,
`background: linear-gradient(90deg, #7fd4ff, #ffb63d 62%, #ff5240)`,
`box-shadow: 0 0 14px rgba(255,140,60,.55)`, `border-radius: 99px`.

#### Hint pill — `#hint`

`bottom: 22px; left: 50%; transform: translateX(-50%)`, `padding: 6px 16px`,
`border-radius: 99px`, `background: rgba(12,16,22,.74)`, `blur(12px)`,
`border: 1px solid rgba(255,255,255,.11)`, `box-shadow: 0 8px 22px rgba(0,0,0,.4)`.
Text Oswald 400, 10.5px, `letter-spacing: .18em`, uppercase,
`rgba(234,242,248,.85)`, `white-space: nowrap`.
Copy: `Aim · hold to charge · release to bowl`.
Visible only while `phase === 'aim'` (`opacity` transition `.35s`).
The dark backing is required: without it the text sits on lit maple (~`#e0b070`) at
about 1.3:1 contrast.

#### Controls — `#controls`

`bottom: 20px; right: 16px`, flex row, `align-items: center`, `gap: 10px`.
Order left→right: music, sound, players.

`.rbtn` base: `46 × 46px` circle, `background: rgba(12,16,22,.78)`, `blur(14px)`,
`border: 1px solid rgba(255,255,255,.16)`, colour `#eaf2f8`,
`box-shadow: 0 8px 22px rgba(0,0,0,.45)`,
transition `transform .12s, border-color .2s, color .2s, box-shadow .2s`.

- Hover: `border-color: rgba(127,212,255,.6)`, colour `#b9e8ff`
- Active: `transform: scale(.92)`
- Disabled: `opacity: .35`
- `#musicBtn` — label `MUS`, Bungee 11px
- `#soundBtn` — glyph `♪` (`&#9834;`), 18px
- `#playersBtn` — `54 × 54px`, Bungee 14px, label `1P` / `2P`,
  `border-color: rgba(255,182,61,.45)`, colour `#ffb63d`;
  hover `border-color: #ffb63d`, colour `#ffd08a`
- Muted state on the two audio buttons — `.off`: colour `rgba(234,242,248,.28)`,
  `border-color: rgba(255,255,255,.07)`, no shadow

Minimum touch target is 44px on mobile — do not shrink below that.

#### Centre message — `#msgWrap` / `#msgBox`

Full-bleed overlay, `pointer-events: none`, scrim
`radial-gradient(60% 45% at 50% 50%, rgba(4,7,11,.55), rgba(4,7,11,0))`.

`#msgBox` (`pointer-events: auto`): `padding: 26px 48px 28px`, `border-radius: 20px`,
`background: rgba(12,16,22,.86)`, `backdrop-filter: blur(20px) saturate(1.2)`,
`border: 1px solid rgba(255,255,255,.15)`,
`box-shadow: 0 26px 70px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.08)`.

Entry animation `pop .3s cubic-bezier(.2,1.4,.4,1)`:
`from { transform: scale(.88) translateY(10px); opacity: 0 } to { none; 1 }`.

- `#msgTitle` — Bungee 50px, `line-height: 1.05`. **Colour is per message**, applied
  inline together with `text-shadow: 0 0 30px <colour>80`:
  `STRIKE!` → `#ffb63d`, `SPARE!` → `#7fd4ff`, end-of-game → `#7fd4ff`
- `#msgSub` — Oswald 400, 13px, `letter-spacing: .16em`, uppercase,
  `rgba(234,242,248,.55)`, `margin-top: 8px`
- `#msgBtn` (`PLAY AGAIN`, shown only on the end-of-game message) — `margin-top: 18px`,
  `padding: 11px 30px`, Bungee 14px, `letter-spacing: .08em`, colour `#08131c`,
  `background: #7fd4ff`, `border: none`, `border-radius: 99px`,
  `box-shadow: 0 0 26px rgba(127,212,255,.35)`; hover shadow `0 0 34px rgba(127,212,255,.6)`;
  active `transform: scale(.95)`

---

## Interactions & behaviour

### Input

| Input | Effect |
|---|---|
| Pointer move (mouse) | Aims continuously while `phase === 'aim'` |
| Pointer move (touch) | Aims only while the pointer is down |
| Pointer down on the scene | Sets aim to that x and starts charging |
| Pointer up / cancel | Releases the throw |
| `Space` down / up | Starts charging / releases (ignores auto-repeat) |
| `←` / `→` | Nudges aim by ∓0.012 rad (keyboard aiming) |
| Pointer down on a button | Ignored by the aim handler (`e.target.closest('button')`) |

Aim mapping: normalised pointer x in `[-1, 1]` × `0.23`, clamped to **±0.20 rad**.
The aim guide (dashed arrow on the lane) rotates by `-aimAngle`.

Charge: `CHARGE_MS = 1100`. Release power = `MINP + (MAXP - MINP) × f` where
`MINP = 7.5`, `MAXP = 16.5`, `f = clamp(elapsed / CHARGE_MS, 0, 1)`.
Every throw adds a random lateral drift of `(random() - .5) × 0.036` rad, so a centre ball
is not automatically a strike.

### Aim guide idle animation (only while aiming)

Dashes pulse `opacity = 0.30 + 0.55 × (0.5 + 0.5·sin(t·4 − i·0.6))`;
the release ring pulses `0.55 + 0.4 × (0.5 + 0.5·sin(t·3))`.

### Phase machine

`loading → aim → roll → settle → resolve → aim …`

- **aim** — guide visible, hint visible, input live
- **roll** — the ball is integrated in sub-steps and can hit pins
- **settle** — no more ball/pin contact scoring; wait for the rack to stop.
  Enters `settle` when the ball is in the pit, past `endZ`, slower than `0.7`, or after
  `rollTime > 6s`
- **resolve** — score recorded, machinery running, input dead.
  Leaves `settle` when `settleTime > 3.0` **or** (`settleTime > 0.9` and the rack is at rest)
- Timers advance on simulated time, so a backgrounded tab cannot skip a throw
- A restart bumps a generation counter `G.gen`; every deferred callback checks it and
  bails, so an old throw can never resolve into a new game

### Camera framing

The camera is reframed from the aspect ratio so portrait and landscape frame the deck the
same way. With `t = clamp((1.6 − aspect) / (1.6 − 0.46), 0, 1)`, lerp:

| | wide (t=0) | tall (t=1) |
|---|---|---|
| fov | 30 | 46 |
| camY | 1.3 | 1.5 |
| camZ | 8.0 | 6.6 |
| lookY | 0.5 | 0.45 |
| lookZ | −6.5 | −7.2 |

### Machinery timings

**Sweeper rake** (end of frame; `home = pitZ − 0.75`, `front = pinFrontZ + 1.4`,
`back = pitZ − 0.45`, `hi = 0.70`, `lo = 0.02`):

| t (s) | motion |
|---|---|
| 0 – 0.55 | rides out of the dark at `hi`, `home → front` |
| 0.55 – 0.85 | drops `hi → lo` at `front` |
| 0.85 – 1.75 | sweeps at `lo`, `front → back` — everything it touches goes in the pit |
| 1.75 – 2.05 | backs out at `lo`, `back → home` |
| 2.05 | hidden, callback fires |

While below `y = 0.5` the bar tips any standing pin it reaches (`p.ox -= 7.5`) and pushes
pins to `rz − 0.11` with `vz ≤ −3.4`.

**Pin setter** (`rackZ = pinFrontZ − 0.55`, `rest = comH + 0.38`, `over = comH + 0.44`):

| t (s) | motion |
|---|---|
| 0 – 0.60 | rides in from `home` to `rackZ`, new pins hanging 0.30 above the deck |
| 0.60 – 1.00 | lowers the rack onto the spots, `drop = 0.30(1−k)(1−0.4k)` |
| 1.00 – 1.16 | rises clear of the new pins |
| 1.16 – 1.60 | backs out to `home`, then hides; phase returns to `aim` |

**Between the two balls of a frame** the deadwood drains off by itself instead of being
raked: fallen pins work out to `|x| = 0.86` (clear of every spot), then accelerate back
into the pit (`vz` down to `−2.5`). The next ball is released after `0.9s` — it does not
wait for the pit. After `8s` any straggler is abandoned as ordinary deadwood and gets its
normal deck friction back, so the next ball treats it like wood.

### Message timing

- Strike or spare → message shown for **1150 ms**, then the machinery runs
- Otherwise → **650 ms** pause before the machinery runs

---

## Physics design

### World units

One inch = `IN = 0.03721` world units, derived from the ball (a real ball is 8.5" across,
a pin 15" tall). Every pin dimension is the USBC spec figure, so the rack is correctly
proportioned.

```
laneHalf   1.0            half-width of the lane
ballR      0.16           ball radius
startZ     3.2            ball spawn
pinFrontZ  −10.0          head pin
endZ       −12.2
pinH       15 × IN        pin height
comH       6.0 × IN       centre of mass height
bellyR     2.383 × IN     belly radius (collision radius)
baseR      1.015 × IN     base radius
balanceTilt atan(baseR / comH) ≈ 9.6°   past this a pin cannot recover
grav       11.0
topple     30             gravity torque past balance
restore    22             righting torque inside the foot
pitZ       −11.35
gutTop     −0.07          top surface of the gutter trough
gutterY    −0.07 + 0.16   ball centre when riding the trough
pitFront   −11.45         back edge of the pin deck = mouth of the pit
pitBack    −12.30         front face of the brick wall = back of the pit
```

Rack: pin centres 12" apart on an equilateral triangle — spacing `s = 0.40`,
row offset `dz = −s·sin(60°)`, four rows (1 / 2 / 3 / 4 pins).

### Ball integration

The ball covers more ground per frame than a pin is wide, so a single jump per frame lets
it tunnel straight through the rack — worse the lower the frame rate. It is therefore
advanced in sub-steps: `sub = clamp(ceil(distance / 0.05), 1, 12)`, with a contact test
after each slice.

Damping per frame: `vx ×= 1 − dt·0.15`, `vz ×= 1 − dt·0.05`.
Rolling animation: `rotation.x -= (speed / ballR) · dt`.

**Gutter.** The ball is flagged `gutter` once `|x| > laneHalf − ballR·0.4`. It then eases
to the channel centre (`±(laneHalf + 0.17)`, rate `dt·4`, `vx ×= 0.7`) and its height eases
to `gutterY` at rate `dt·7` — it *rides the trough*, sitting 7 cm below the boards, rather
than being buried. Gutter geometry ends at `pitFront`, exactly like the lane, so a channel
ball cannot travel on under the back wall.

**Pit.** Past `pitFront` there is nothing underneath, so the ball is flagged `inPit` and
falls under gravity (`pvy -= grav·dt`) **while keeping its forward speed**
(`vz ×= 1 − dt·1.2`, `vx ×= 0.80`) — it arcs over the lip instead of stopping dead and
sinking on the spot. It is clamped at `pitBack + ballR` so it rests against the wall, and
hidden once its centre passes `y = −1.1`.

### Ball → pin contact

Reach = `ballR + bellyR`. A pin whose centre of mass is above `comH + 0.45` is airborne
and the ball passes under it. Separating pairs are skipped.

```
vn      = max(b.v · n, 0)
speed   = vn·0.46 + 1.05
gain    = 3.6 + min(2.8, vn·0.32)      torque about the base contact
lift    = 0.07 + min(0.18, vn·0.020)
pin.v  += b.v × 0.11
ball.v  = (b.v − n·vn·0.40) × 0.978    a solid hit turns the ball
```

That deflection is what leaves splits instead of a strike on every centre ball.

### Pin → pin contact

Threshold `2·bellyR + 0.015`. Only pins moving faster than `0.32` are treated as movers,
and pairs more than `0.34` apart in `y` are flying over one another.
A pin already lying on the deck (`ay < 0.5`) **cannot be knocked over again** — it is only
pushed apart positionally. Without that rule two flat pins side by side sit permanently
inside the contact radius and feed energy back into a rack that should be coming to rest.

```
speed = spd·0.21 + 0.10
gain  = 0.9 + min(1.15, spd·0.21)
lift  = min(0.09, spd·0.018)
striker.v -= n · spd · 0.64
```

### Pin body

Full rigid body: gravity, free rotation about any axis (quaternion premultiplied by an
axis-angle delta from the angular-velocity vector `o`), deck contact with bounce and
friction, and the gravity torque that decides whether a leaning pin recovers or goes over.

- `ay` = the pin's up-axis y-component; `tilt = acos(ay)`
- `tilt < balanceTilt` → righting torque `restore·sin(tilt)·dt` (rocks upright), plus
  angular damping `dt·2.2`
- `balanceTilt ≤ tilt < 90°` → toppling torque `topple·sin(max(tilt, 0.28))·dt`
- `tilt ≥ 90°` → torque back down onto its side, `topple·sin(tilt − 90°)·dt·2.4`,
  so a pin can never end up balanced on its head
- Deck bounce `vy = −vy × 0.28`, zeroed below `0.5`
- Ground friction `dt·5.0` normally, `dt·1.6` while being swept
- Axis spin only from a real blow: `bite = clamp((speed − 0.6) / 1.4, 0, 1)`,
  `oy += (random − .5)·gain·1.8·bite` — stops fallen pins grinding against each other and
  re-spinning forever
- A pin in the pit has no deck under it: it just falls, tumbling, and is removed at
  `y < −1.9`

---

## State management

```
phase           'loading' | 'aim' | 'roll' | 'settle' | 'resolve'
gen             generation counter; invalidates deferred callbacks after a restart
aimAngle        radians, ±0.20
charging        bool
chargeStart     performance.now() at charge start
rollTime        seconds since release
settleTime      seconds since entering settle
standingBefore  pins up at release (used for strike/spare and for the crash sound)
pinsStanding    pins up right now (drives the pindeck monitor)
gameOver        bool
msg             null | { title, sub, colour, btn }

numPlayers      1 | 2
cur             index of the player to throw
players[]       { frames: Frame[10] }
framesData      alias of players[cur].frames
Frame           { rolls: number[] }

ball            { x, z, vx, vz, py, pvy, rolling, gutter, inPit, mesh }
pins[10]        { x, y, z, vx, vy, vz, ox, oy, oz, quat, ay,
                  knocked, active, moving, pit, sweep, hold, side, sound }
```

- `active: false` means the pin has left the deck (in the pit) and is no longer counted
- `knocked: true` with `active: true` is deadwood still lying on the deck
- Fallen pins are **never deleted in place**; the rake disposes of them at the end of the
  frame

**Persistence** — two keys in local storage, both read on load:

| key | values | meaning |
|---|---|---|
| `bowl.muted` | `'1'` / other | all sound muted |
| `bowl.music` | `'0'` / other | music off (default on) |

No data fetching. Everything, including the pin-crash sample, is inlined in the file.

### Scoring

Standard ten-pin. `frameComplete` for frames 1–9 is `rolls[0] === 10 || rolls.length >= 2`;
frame 10 needs a third ball if the first is a strike or the first two make ten.
`computeScores` walks a flat roll list and stops emitting totals at the first frame whose
bonus balls have not been thrown yet (so the scoresheet shows blanks, not wrong numbers).

Marks: `X` for a strike (drawn in the second box of the cell), `/` for a spare, `-` for a
miss, digits otherwise; the tenth frame has three boxes with its own strike/spare logic.

Two-player turns alternate per frame; a strike or a spare in the tenth frame keeps the
same player up for the bonus ball and re-racks a fresh set.

---

## Audio design

Web Audio, unlocked on the first user gesture. One `_master` gain feeds everything.

- **Pin crash** — a recorded rack going over, inlined as a base64 MP3 (`PIN_MP3`). Used
  whole rather than synthesised per tap, because the take already contains the tumbling
  that follows the first contact. Playback length is scaled to the number of pins knocked
  down (1 pin = a short clip, 10 pins = the full take) and given a natural decay plus
  pin-fall echoes from the same recording, so it never cuts off abruptly. The pin count is
  read early enough that the length decision is correct.
- **Room tail** — impacts go dry to the master *and* into a synthetic room reverb: a
  bowling alley is a hard, echoing hall, and that tail is most of what makes the crack
  sound real.
- **Deck thud** — a separate softer hit when a pin lands on the maple (`vy < −0.55`,
  intensity `min(1, −vy / 3.2)`).
- **Chime** — strike: 523 / 659 / 784 / 1047 Hz sines, 70 ms apart; spare: the first three.
  Each note ramps to 0.22 in 20 ms and decays over 400 ms.
- **Music** — five synthesised tracks, each with its own chord set rather than one track
  transposed, scheduled a fifth of a second ahead of the audio clock so timing never
  depends on frame rate. A track plays for `TRACK_SECS = 180`, then a different one is
  picked at random. Base level `_musLvl = 0.22`.

| style | bpm | character |
|---|---|---|
| `drive` | 132 | A-minor arcade rock |
| `boogie` | 112 | swung E-minor boogie |
| `synth` | 100 | D-minor synthwave |
| `surf` | 138 | driving surf, harmonic minor |
| `lounge` | 88 | late-night lounge sevenths |

- **Ducking** — the music drops to 30 % of level (time constant 0.04 s) while the rack is
  crashing and returns over 0.45 s once the wood has stopped.
- There is deliberately **no** background ambience (no hall hum, no distant lanes).

---

## Design tokens

### Colour

| token | value | use |
|---|---|---|
| Glass panel | `rgba(12,16,22,.78)` | plates, buttons, pills |
| Glass panel (board) | `rgba(12,16,22,.80)` | scoresheet |
| Glass panel (modal) | `rgba(12,16,22,.86)` | message box |
| Hairline | `rgba(255,255,255,.13)` | panel borders |
| Hairline (inner) | `rgba(255,255,255,.09)` | cell dividers, rules |
| Text | `#f4f9fd` | values, marks |
| Text (body) | `#eaf2f8` | button glyphs |
| Text muted | `rgba(234,242,248,.45)` | labels |
| Text faint | `rgba(234,242,248,.42)` | frame numbers, inactive player |
| **Accent ice** | `#7fd4ff` | current frame, totals, spare, primary button |
| Accent ice hover | `#b9e8ff` | button hover |
| **Accent amber** | `#ffb63d` | strike, player 1, players button |
| Accent amber hover | `#ffd08a` | players button hover |
| Power hot | `#ff5240` | end of the power gradient |
| Page background | `#0b0f14` | behind the canvas |

Scene colours (three.js): fog and clear `#2b1c14`; lane maple tint `#f0e2cc`;
pin deck `#f0dcb4`; gutters teal `#1f8f80`; side rails red `#c0392b` with cream caps
`#f6e3bd`; kickback walls `#160d09`; pit `#120b08`; brick wall `#8a7266`.
Lighting is warm: ambient `#ffe6c4` 0.38, hemisphere `#ffe9c9`/`#2a1810` 0.3,
directional `#fff2d8` 0.72 with a 1024² shadow map, three `#ffd9a0` point lights at 0.22,
and a `#fff4e0` spot over every deck at 0.75 so the neighbour lanes are lit like this one.

### Typography

| role | font | size / weight | tracking |
|---|---|---|---|
| Display (values, marks, titles) | **Bungee** 400 | 11 – 50px | `.02em`–`.22em` |
| UI (labels, hint, turn bar) | **Oswald** 300–600 | 9 – 13px | `.06em`–`.2em` |

`<link href="https://fonts.googleapis.com/css2?family=Bungee&family=Oswald:wght@300;400;500;600&display=swap">`

All labels are uppercase and letter-spaced. Nothing in the HUD is below 9px, and the two
critical readouts (score, frame) are 24px and 34px.

### Spacing, radius, shadow

- Screen inset: `14–16px` desktop, `9–11px` mobile
- Panel padding: `8px 15px 9px` (plates), `7px 10px 8px` (board), `26px 48px 28px` (modal)
- Radius: `3px` (marks) · `4px` (cells) · `13px` (plates) · `14px` (board bottom) ·
  `20px` (modal) · `99px` (pills, meter) · `50%` (buttons)
- Shadows: `0 8px 22px rgba(0,0,0,.45)` (buttons) · `0 10px 30px rgba(0,0,0,.5)` (plates) ·
  `0 14px 40px rgba(0,0,0,.55)` (board) · `0 26px 70px rgba(0,0,0,.65)` (modal)
- Blur: `blur(12px)` (hint) · `blur(14px)` (plates, buttons) ·
  `blur(16px) saturate(1.25)` (board) · `blur(20px) saturate(1.2)` (modal)
- Transitions: `.12s` (press) · `.18s`–`.25s` (state) · `.35s` (hint fade)

### Responsive

One breakpoint, `max-width: 560px`. Frame cells drop to `28px` (tenth `39px`), the score
value to `26px`, the frame value to `18px`, plates to `padding: 6px 11px 7px`, buttons to
`44px` (players `48px`), the power meter to `168 × 8px` with 20px ticks, and the plates
move to `top: 66px` / `top: 138px` on the right. The camera reframes itself from the aspect
ratio, so no scene work is needed for portrait.

---

## Assets

| asset | origin | notes |
|---|---|---|
| Pin-crash recording | user-supplied take | inlined as a base64 MP3 (`PIN_MP3`); the only external recording in the design |
| Wood / brick textures | generated on a canvas at runtime | `woodTexture()`, `brickTexture()`; keeps the file self-contained |
| Music | synthesised at runtime (Web Audio oscillators) | no audio files |
| Fonts | Google Fonts — Bungee, Oswald | replace with the codebase's own font loading |
| three.js | `unpkg.com/three@0.128.0` | pin this or use the version already in the codebase |

There are no image files. In a real build the pin sample should be a proper asset request
rather than a base64 blob, and the procedural textures can be replaced with authored maps
if the target project has an art pipeline.

## Files

| file | contents |
|---|---|
| `Bowling Realistic.html` | the entire design: HUD markup + CSS, three.js scene, physics, machinery, scoring, audio |

Rough map inside that file:

| lines (approx.) | section |
|---|---|
| 13–190 | HUD CSS and responsive rules |
| 191–250 | HUD markup |
| 253–275 | constants, rack layout, global state |
| 277–310 | procedural textures |
| 310–580 | scene: lighting, lane, gutters, rails, neighbour lanes, deck, kickbacks, wall, pit, rake, setter, pins, ball, aim guide |
| 590–620 | player setup |
| 620–860 | audio: unlock, pin crash, room tail, deck thud |
| 870–1090 | music tracks, scheduler, ducking, chimes |
| 1090–1115 | charge / release |
| 1115–1200 | input, camera framing, resize, reset |
| 1200–1330 | rake, deadwood drain, setter |
| 1340–1560 | main step: ball integration, collisions, pin rigid body |
| 1600–1700 | settle → score → machinery → next ball |
| 1700–1790 | scoring maths and marks |
| 1790–1851 | pindeck monitor, HUD render, main loop, bootstrap |

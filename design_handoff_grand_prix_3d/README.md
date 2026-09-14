# Handoff: Grand Prix 3D — Season

## Overview

A complete single-player open-wheel racing game: a 25-round championship with
qualifying, two practice sessions, a drivable pit lane, tyre and fuel models,
changing weather, race control (safety car, yellow and red flags, penalties),
DRS, team radio, a 3D garage where the car can be inspected and re-specified,
and a 3D podium ceremony. It ships as a self-contained folder intended for
upload to the GameDistribution HTML5 portal.

## About the Design Files

`design/` holds the **working prototype**, written as plain HTML, CSS and
JavaScript on top of three.js r128. Treat it as a **design and behaviour
reference**, not production code to lift verbatim.

The task is to **recreate this in the target codebase's own environment** —
React, Vue, Svelte, a TypeScript game stack, a native engine — using its
established patterns, module system, build tooling and state conventions. If
no environment exists yet, choose one appropriate to a real-time 3D browser
game (a Vite + TypeScript + three.js setup is the natural fit) and implement
there.

Two things in the prototype are deliberate and should carry over: the
**separation of concerns across the three modules** (see Architecture) and the
**numeric tuning constants**, which are balanced against each other and should
be ported as values, not re-derived.

## Fidelity

**High fidelity.** All 2D interface surfaces are final: exact colours,
typography, spacing, radii, shadows, hover and pressed states, and final copy.
Recreate them pixel-accurately using the codebase's own component library where
one exists. Every value is listed under Design Tokens.

The 3D content is also final in behaviour and proportion, but it is procedural
— there are no imported models or textures. All geometry is built from
primitives at runtime and all textures are drawn to `<canvas>`. A production
implementation may legitimately replace the procedural car, track furniture and
people with authored assets; if it does, the dimensions in this document are the
spec those assets must match.

## Architecture

Four files, loaded in this order, each with a single responsibility:

| File | Responsibility |
| --- | --- |
| `three.min.js` | three.js r128, vendored. No other dependency. |
| `js/data.js` | Pure data. Teams, drivers, tyre compounds, points table, difficulty presets, the 25-round calendar. Exposes `window.GPDATA`. No behaviour. |
| `js/engine.js` | Simulation and rendering. Track geometry, pit lane, scenery, cars, physics, AI, cameras, the garage viewer, the podium scene. Exposes `window.GP`. Knows nothing about screens or session flow. |
| `js/game.js` | Session flow and interface. The weekend, race control, pit stops, standings, HUD, audio, save, portal hooks. Owns the frame loop. |

`engine.js` communicates upward through five assignable callbacks, set by
`game.js`: `GP.onLap`, `GP.onSector`, `GP.onHit`, `GP.onPenalty`, `GP.onRetire`.
Keep that boundary — it is what lets the simulation be tested without a UI.

### Frame loop

`game.js` owns one `requestAnimationFrame` loop. Per frame, in order:

1. Read input (keyboard flags plus on-screen buttons merged into one struct).
2. Advance the session clock and phase machine.
3. Drift the weather.
4. Step the simulation **twice** at `dt/2` (see Physics).
5. Resolve collisions after each substep.
6. Pit-lane logic, DRS, safety car, recovery cranes, engineer radio.
7. Update camera, car detail culling, crowd animation.
8. Update HUD (throttled) and minimap (throttled).
9. Audio.
10. Render.

Also in the loop: a rolling frame-time average driving adaptive resolution, and
a watchdog that re-arms the loop if it has gone cold for more than 2 s (a tab
can be backgrounded with a queued frame that never fires).

## Screens / Views

Screens are full-viewport siblings; exactly one carries `.show`. The 3D canvas
sits behind all of them and keeps rendering, so menus float over a live circuit.

### 1. Loading

Full-bleed `--bg`. Left-aligned, vertically centred, padding
`0 clamp(24px,7vw,110px)`, gap `22px`.

- Kicker "Grand Prix 3D" — `--fb` 700, 11px, letter-spacing `.24em`, uppercase, `--acc-7`.
- Heading "Twenty cars. / Twenty-five circuits." — `--fh`, `clamp(38px,8vw,86px)`, line-height `.95`, max-width `12em`. The word "circuits" is `--acc`.
- Progress bar — `min(460px,80vw)` × 12px, radius 999px, track `rgba(32,30,29,.1)`, fill `--acc`, `transition: width .2s`.
- Percent — `--fb` 700, 13px, letter-spacing `.12em`, `--ink-60`.
- Hint paragraph — 14px, `--ink-60`, line-height 1.5, max-width `34em`.

Fades out over `.5s`, then `display:none`.

**Critical:** drive the progress from a `setTimeout` chain, not
`requestAnimationFrame`. rAF does not fire in a hidden tab, and a bar that
schedules itself through rAF will freeze mid-load and never reach its own
timeout escape. Arm an independent backstop timer at boot (14 s) that force-
completes, and re-arm on `visibilitychange`.

### 2. Main menu

Background `radial-gradient(120% 90% at 8% 0%, #fdf6e9 0%, var(--bg) 42%, var(--bg2) 100%)`.
Two columns, `minmax(0,1.15fr) minmax(0,.85fr)`, gap `clamp(24px,5vw,70px)`,
max-width 1180px, centred. Collapses to one column at 860px.

Left column: kicker, `h1` "Grand Prix 3D" at `clamp(44px,9vw,104px)` / `.9` with
"Prix" in `--acc`, a lede paragraph (`clamp(15px,1.5vw,18px)`, `--ink-60`,
max-width `33em`), then three action cards in a `12px` gap column, max-width 420px.

**Action card** (`.bigbtn`) — `--surf`, radius `--r-lg`, padding `18px 22px`,
`--sh-sm`, flex row, gap 16px, `transition: box-shadow .16s, transform .1s`.
Hover `--sh-md` + `translateY(-1px)`; active `translateY(1px)`. Leading badge is
a 42px circle, `--acc-3` fill with `--acc-7` text (primary variant: `--acc` fill,
`#fff8ef` text). Title `--fb` 700 17px; subtitle 13px `--ink-60`. Title and
subtitle sit in a nested flex-column wrapper so they stack.

The three cards: **New season** (badge "01"), **Continue season** (badge "→",
subtitle shows the next round; `display:none` when no save), **Single race**
(badge "GP").

Right column: settings panel — `--surf`, radius `--r-lg`, padding 22px,
`--sh-sm`, max-width 460px. Rows separated by `1px solid var(--line)`,
padding `11px 0`. Contains a 3-way segmented difficulty control, a volume
slider with mute button, and a keyboard legend of `.keyhint b` chips
(`--fb` 700 11px, `rgba(32,30,29,.07)`, radius 8px, padding `5px 8px`).

### 3. Team selection (modal)

Overlay `rgba(32,30,29,.55)` + `backdrop-filter: blur(6px)`. Dialog max-width
980px, `--bg`, radius `--r-lg`, padding `clamp(20px,3vw,34px)`, `--sh-lg`.
Grid of 10 cards, `repeat(auto-fill, minmax(190px,1fr))`, gap 12px.

**Team card** — `--surf`, `2px solid transparent` (selected: `--acc`), radius
`--r`, padding `16px 16px 14px`, `--sh-sm`, `overflow:hidden`. A 6px full-height
stripe in the team colour is absolutely positioned at the left; text is inset
`padding-left:10px`. Name `--fb` 700 15px; team-mate line 12px `--ink-60`; car
rating line 700 `--sage-7`.

### 4. Season (calendar + standings)

Header row: `h2` "Season 2026" at `clamp(28px,4.4vw,52px)`, subline 15px
`--ink-60` reading "Round N of 25 · <team> · championship P<n>". Right side
holds a Garage button and a Main-menu ghost button.

Body: two columns `minmax(0,1.45fr) minmax(0,1fr)`, gap `clamp(16px,3vw,34px)`,
max-width 1240px. One column under 900px. Each column is a `.panel` —
`--surf`, radius `--r-lg`, padding `clamp(14px,2vw,22px)`, `--sh-sm`.

**Calendar row** — grid `38px minmax(0,1fr) auto 46px`, gap 12px, padding
`11px 12px`, radius `--r`. Hover `rgba(32,30,29,.05)`. Completed rounds
`opacity:.6`; the next round has an `--acc-3` background. Columns: round number
(700 13px `--ink-60`), city (700 15px) with the Grand Prix name beneath
(400 12px `--ink-60`, ellipsised), a right-aligned tag cluster, then the result
("P4") or "NEXT". Tags: `--fb` 700 10px, letter-spacing `.1em`, uppercase,
radius 999px, padding `5px 9px`; neutral `rgba(32,30,29,.07)`/`--ink-60`,
`.night` `#2b3345`/`#dfe6f2`, `.wet` `rgba(122,138,94,.2)`/`--sage-7`.
List scrolls at `max-height:62vh`.

**Standings row** — grid `26px 10px minmax(0,1fr) 44px 44px`, gap 10px, padding
`9px 4px`, `border-top: 1px solid var(--line)`. Position 700 12px `--ink-60`;
a 10px colour dot; name 600 14px; team short code 11px `--ink-60`
letter-spacing `.06em`; points 800 right-aligned. The player's row gets
`--acc-3` and radius 10px. Two tabs above (Drivers / Constructors) styled as
`.tabs button`: 700 12px, letter-spacing `.08em`, uppercase, `--ink-60`,
active `rgba(32,30,29,.08)` + `--ink`.

### 5. Race weekend

Two columns `minmax(0,1fr) minmax(0,1fr)`, gap `clamp(16px,3vw,40px)`,
max-width 1120px, vertically centred. One column under 820px.

Left: round kicker, city at `clamp(38px,7vw,80px)` / `.92`, Grand Prix name
16px `--ink-60`, then a 2-up metadata grid (max-width 440px, gap 10px) of
`--surf` tiles — radius `--r`, padding `11px 14px`, label `--fb` 600 10px
letter-spacing `.12em` uppercase `--ink-60`, value 700 15px. The four tiles are
Laps, Session (Day/Night), Forecast (the named weather condition) and Pit lane
speed limit.

Then a "Starting tyre" label and a row of five compound chips (`.tbtn`) —
`--surf`, radius 999px, padding `9px 15px`, `--sh-sm`, `2px solid transparent`
(selected `--acc`), a 12px colour dot then the compound name in `--fb` 700 12px
letter-spacing `.06em`.

Two action rows: Practice 1 / Practice 2 / Garage, then Qualifying (primary) /
Straight to the race / Back.

Right: a 940×700 `<canvas>` drawing the circuit outline — 13px
`rgba(32,30,29,.12)` outer stroke, 9px `--ink` stroke, then a 2px `--acc`
dashed centreline (`[5,7]`), and a 5px `--acc` dot at the start line.

### 6. Garage

Header, then a team bar — `--surf`, radius `--r-lg`, padding `12px 18px`,
`--sh-sm`, max-width 720px: an 8px × 30px colour stripe, the team name in
`--fh` 20px, and a right-aligned 13px `--ink-60` note about when changes apply.

Body: two columns `minmax(0,1.1fr) minmax(0,1fr)`, gap `clamp(14px,2.5vw,28px)`,
max-width 1240px, single column under 900px.

**Left — 3D viewer.** `--surf`, radius `--r-lg`, `--sh-sm`, `aspect-ratio:4/3`,
`overflow:hidden`, holding its own `<canvas>`. Drag orbits (0.008 rad/px yaw,
0.006 rad/px pitch clamped to −0.55…1.25), wheel zooms (0.012 per delta unit,
clamped 4.5…20). Overlaid bottom-left: a "Lift" range input in a
`rgba(245,234,216,.92)` pill, a "Look underneath" secondary button and a
"Reset view" ghost button. Lift raises the car on a four-post lift (posts appear
above 0.02); "Look underneath" sets lift to max, pitch to −0.42 and distance to
8.5. Hint text top-left: `--fb` 600 10px letter-spacing `.12em` uppercase
`--ink-60`.

**Right — parts list**, scrolling at `max-height:74vh` above 900px. Six
`.partrow` cards: `--surf`, radius `--r-lg`, padding `15px 18px`, `--sh-sm`,
holding the group name (700 15px), a description (12px `--ink-60`), a wrapping
row of option buttons, and a stat row.

Option button (`.popt`): `--bg2`, radius `--r`, padding `9px 13px`,
`2px solid transparent` (selected `--acc` + `--acc-3` background), hover
`--acc-3`. Name 700 12px, note 11px `--ink-60`.

Stat pill (`.pstat`): `--fb` 700 10px, radius 999px, padding `5px 9px`.
Neutral `rgba(32,30,29,.06)`/`--ink-60`; gain `rgba(122,138,94,.22)`/`--sage-7`;
loss `rgba(200,64,44,.16)`/`#8e2d1e`. Four pills per group: Power, Grip,
Reliability, Tyre life, each as a signed percentage to one decimal.

Nothing in the garage costs anything — every part is freely swappable, any
number of times, before practice, qualifying or the race.

### 7. In-race HUD

Pointer-events-none overlay, four corners. Plates are `rgba(255,250,240,.92)`,
radius `--r`, padding `10px 14px`, `--sh-md`.

**Top left** — position plate: current position in `--fh` 40px/1 beside the
field size in `--fb` 700 13px `--ink-60`. Then a stacked plate (gap 3px) with
Lap, Current and Best rows — label `--fb` 600 9px letter-spacing `.14em`
uppercase `--ink-60`, value `--fb` 700 15px tabular-nums. Below it three sector
boxes: `--fb` 700 11px tabular-nums, min-width 48px, radius 8px,
`rgba(32,30,29,.07)` / `--ink-60` idle, `--sage`/white when set, `--acc`/white
on a personal best, reverting after 4 s.

**Top right** — a clock pill (radius 999px) with the session time and a label
that reads PRACTICE n / QUALI / RACE / SC / RED. Under it two flag rows, then
the timing tower.

Flag chips: `--fb` 700 10px, letter-spacing `.12em`, radius 999px, padding
`6px 10px` — `#flagRed` `#c8402c`/`#fff8ef` (shows a live countdown),
`#flagSC` `#e8be1d`/`#2c2a20`, `#flagY` `#f0d64e`/`#2c2a20`, `#wetTag`
`--sage`/white (carries the current weather name). DRS pill: idle
`rgba(255,250,240,.92)`/`--ink-60`, ready `--sage`/white, open `--acc`/`#fff8ef`
with a `.7s` pulse to `--acc-7`. Penalty pill `#c8402c`/white.

Timing tower: min-width 148px, padding `7px 9px`. Rows are grid
`18px 4px minmax(0,1fr) auto`, gap 7px, 12px type — position (800 11px
`--ink-60`), a 13px team-colour bar, the three-letter tag (700, letter-spacing
`.04em`), and the gap (600 11px `--ink-60`, or PIT / DNF). Player row `--acc-3`
radius 8px; retired rows `opacity:.45`. Seven rows, windowed around the player.

**Bottom left** — a 132×112 minimap canvas (`rgba(255,250,240,.9)`, radius
`--r`) drawn from a pre-rendered base layer with live car dots on top (3.4px,
5px with a 2px white ring for the player). Under it a plate with four readouts:
the tyre compound (16px dot with `inset 0 0 0 3px rgba(32,30,29,.25)`, the
compound name in 700 11px, and a wear bar), Fuel, Overtake and Damage. Bars are
7px, radius 999px, track `rgba(32,30,29,.14)`, fill `--sage` (`--acc` warning
under 50%, `#c8402c` critical under 25%; fuel `--ink-30`; damage `#c8402c`),
`transition: width .2s`. Captions are `--fb` 600 9px letter-spacing `.12em`
`--ink-60`, width 38px.

**Bottom right** — a CAM and a MENU icon button (38px circles), then the
speedometer: `rgba(255,250,240,.92)`, radius `--r-lg`, padding `10px 18px 12px`
— speed in `--fh` 46px/1 tabular-nums, "km/h" in `--fb` 700 10px
letter-spacing `.14em` `--ink-60`, gear in `--fh` 30px `--acc`. Beneath it a
5px rev bar filled `linear-gradient(90deg, var(--sage), var(--acc))`.

**Centre** — start lights: five circles, `clamp(20px,4.2vw,34px)`, gap 10px,
`rgba(32,30,29,.35)` with `inset 0 0 0 3px rgba(32,30,29,.5)`; lit state
`#d8382c` plus `0 0 22px rgba(216,56,44,.85)`. Message flash at 32% height,
`--fh` `clamp(30px,7vw,72px)`, `#fffaf0` with
`text-shadow: 0 6px 26px rgba(32,30,29,.55)`, accent variant `#f4c79b`, warning
`#f4d76a`, `.25s` opacity and scale transition.

**Pit board** at 16% height: `rgba(32,30,29,.9)`, `#f5ead8`, radius `--r`,
padding `10px 20px`, value in `--fh` 30px, caption in `--fb` 600 10px
letter-spacing `.12em` uppercase at 75% opacity. Turns `#c8402c` when over the
pit limit.

**Team radio** at 16% from the bottom: grid `26px minmax(0,1fr)`, gap
`4px 11px`, `rgba(32,30,29,.9)`, `#f5ead8`, radius `--r`, padding
`11px 18px 12px`, `--sh-lg`, max-width `min(520px,84vw)`. A 26px `--acc` circle
with an inner `#fff8ef` dot pulsing at `.9s`; "Race engineer" in `--fb` 700 9px
letter-spacing `.16em` uppercase `--acc-3`; the message in 500 14px/1.35 with
`text-wrap: pretty`. Urgent variant `#7a2418` background with an `#f4c79b` dot;
good variant a `--sage` dot.

**Pit stop panel** (centre modal, pointer-events auto): `--bg`, radius
`--r-lg`, padding `22px 24px`, `--sh-lg`, min-width `min(360px,90vw)`. Heading
`--fh` 24px, a compound chip row, a fuel range input with a percentage readout,
then "Service the car" (primary) and "Drive through" (ghost).

**Touch controls** (added when `maxTouchPoints > 0`): six round buttons,
`clamp(64px,17vw,94px)` for LEFT / RIGHT / BRAKE / GAS and
`clamp(52px,13vw,68px)` for OT / PIT / DRS, `rgba(255,250,240,.78)`,
`--sh-md`, label `--fb` 700 11px letter-spacing `.08em` `--ink-60`, pressed
`--acc` / `#fff8ef`. All corner HUD clusters shift up by
`clamp(78px,20vw,112px)` on touch. Respect `env(safe-area-inset-*)` throughout.

### 8. Podium ceremony

Background `radial-gradient(120% 95% at 50% 0%, #fdf6e9 0%, var(--bg) 46%, var(--bg2) 100%)`.
Centred column: kicker, winner name in `--fh` `clamp(38px,7vw,80px)`, a subline,
a 3D stage, three step cards, and a "Full result" button.

**Stage**: `min(880px,94vw)`, `aspect-ratio:16/9`, radius `--r-lg`, `--surf`,
`--sh-md`, holding its own canvas. A caption strip is absolutely positioned
across the bottom — `linear-gradient(transparent, rgba(32,30,29,.82))`,
`#f5ead8`, padding `26px 22px 16px`, text in `--fh` `clamp(18px,2.6vw,30px)`,
with a kicker line above in `--fb` 700 10px letter-spacing `.2em` uppercase
`--acc-3`. Fades in and out over `.4s`. The four captions and their cues:
"Third place" at 0.7 s, "Second place" at 4.3 s, "Winner" at 7.9 s,
"Champagne" at 12.6 s, each visible for 3 s.

**Step cards** below: three columns, `align-items:end`, gap
`clamp(8px,2vw,20px)`, width `min(680px,94vw)`, ordered second / first / third.
Each has a driver-number bubble (`clamp(52px,11vw,78px)` circle in the team
colour, number in `--fh` `clamp(20px,4.4vw,30px)`, `#fff8ef`), the name
(`--fb` 700 `clamp(13px,1.6vw,16px)`), the team (500 11px `--ink-60`), the gap
(700 11px `--ink-60` tabular-nums), then the step itself — `--surf`, radius
`--r --r 0 0`, `--sh-sm`, position number in `--fh` `clamp(26px,5vw,40px)` and
points in `--fb` 700 10px letter-spacing `.12em` `--sage-7`. Step heights:
first `clamp(96px,17vw,132px)` with an `--acc-3` background and `--acc-7`
numeral, second `clamp(68px,12vw,96px)`, third `clamp(52px,9.5vw,74px)`.
Cards rise in with a `.6s cubic-bezier(.2,.8,.3,1)` translate, delayed
`.1s` / `.22s` / `.34s` for second / third / first. The player's card gets an
`--acc-7` name and a `0 0 0 4px var(--acc-3)` ring on the bubble.

### 9. Results

Max-width 760px. Title `--fh` `clamp(32px,6vw,68px)` reading "Race win",
"Podium · P3", "P7" or "Retired". Subline 15px `--ink-60` with the best lap,
stop count and any penalty. Then a `.qlist` — `--surf`, radius `--r-lg`,
padding `10px 14px`, `--sh-sm` — of rows in grid
`30px 10px minmax(0,1fr) 46px 78px 42px`, gap 10px, 14px type: position
(800 13px `--ink-60`), colour dot, name (600), team code (11px `--ink-60`),
time or gap (600, tabular-nums, right-aligned, with any served penalty appended
as `+5s` in 800 11px `#c8402c`), and points gained (800 13px `--sage-7`).
Player row `--acc-3`; DNF rows `opacity:.5`.

## Interactions & Behavior

### Session flow

`phase` is a string state machine: `load → menu → season → setup → (quali |
grid) → race → finished`. `garage` is entered from and returned to either
`season` or `setup`.

- **Practice** and **qualifying** share one implementation: the field is spread evenly around the lap and drives free laps against a countdown (80 s practice, 100 s qualifying). Practice publishes a timesheet and changes nothing. Qualifying sorts the grid by best lap; a driver without a time starts at the back.
- **Race start**: five lights illuminate at 0.85 s intervals, then go out 0.9 s after the fifth. Lap counters zero **only on a genuine start** — a red-flag restart runs the same light sequence and must preserve the laps already completed.
- **Finish**: the player crossing the line ends the session. Cars still running are classified on the time they would actually have needed to reach the flag — remaining distance divided by their own pace — plus any penalty. Do not substitute a fixed gap per position; a car 41 s adrift must be classified 41 s adrift.

### Race control

- **Yellow flag**: raised only by a heavy incident (impact force > 0.72), lasts 5 s, applies to one sector of three, caps speed at 44 units (224 km/h).
- **Safety car**: deployed on a heavy incident or a retirement, runs 26 s. A real vehicle with a flashing light bar slots in 34 samples ahead of the leader and leads the field. Cap 26 units (133 km/h).
- **Red flag**: a very heavy incident (force > 0.92, 22% chance), maximum twice per race. The session stops for 13 s, all cars are sent to the pits, damage and fuel and tyres are reset, and the race resumes from a standing grid in the running order **with laps intact**. Cap 30 units (153 km/h).
- **Recovery**: a retired car waits 1.6 s, then a crane drives up, lifts it over 2.6 s and removes it by 6.4 s. Nothing is left on the circuit.
- **Penalties**: 5 s for causing a collision (rear-ending the car ahead within 5.5 units at over 18 units of speed, with a 20 s per-car cooldown), 3 s for exceeding the pit limit for more than 0.5 s. Applied identically to the player and the AI, and served at the next stop by adding the time to the stationary period.

All neutralisation caps live in one shared table so the player and the AI are
held to the same limits — a separate AI table lets the field gain by ignoring a
flag.

### DRS

Up to three zones per circuit, found automatically: runs of curvature below
0.0055 that are at least 110 samples long, trimmed 30 in and 24 out, longest
three kept. The detection point is 55 samples before the zone opens. A car
within one second of the car ahead at detection may open the flap for that
zone. Available from lap 2, disabled when the track is wet (above 0.35) or
under a safety car. The player holds `E` or the DRS button; the AI uses it
whenever eligible. Effect: +10.5% top speed, and the rear wing's upper flap
visibly rotates open over ~0.11 s.

### Pit stops

The lane is a real, drivable corridor built as a lateral offset from the racing
line, ramping out over the first 64 samples and back in over the last 64, 460
samples long, with 20 numbered boxes.

Entering the lane **teleports the player straight to their own team's box**
with the crew already in place — hunting down the lane for the right stall is
tedious and adds nothing. The stop panel then offers compound and fuel load.
Service time: 2.3 s base, +0.6 s for a compound change, +4.5 s per unit of fuel
added, +1.8 s for front-wing damage above 0.4, plus any outstanding penalty.
A "Drive through" option leaves without service.

**The throttle must only be blocked while the car is genuinely stationary for
service.** Gating it on any non-zero pit phase traps every car in its box
forever, because the post-service phase is also non-zero.

### Weather

Six named conditions, each setting surface wetness, fog distances, light level
and sky grey: Sunny (0 wet), Cloudy (0), Overcast (0.06), Light rain (0.42),
Heavy rain (0.88), Snow (0.72). Rolled per round from the circuit's rain
probability; ten cold-climate venues can also roll snow at 7%. Mid-session the
condition walks one step along the chain and the surface transitions gradually
rather than snapping. Rain and snow are CSS overlays over the canvas
(repeating linear gradients and radial-gradient dot fields, animated by
`transform`), not particles.

### Camera

Four modes, cycled with `C`: chase (back `8.8 + speed*0.036`, height
`3.1 + speed*0.012`, FOV `58 + speed*0.26`), cockpit (FOV `74 + speed*0.18`,
driver mesh hidden), bonnet, and a trackside TV camera placed on the outside of
the corner ahead. All but cockpit and bonnet interpolate at `dt*6`; those two
at `dt*18` and `dt*16`. Impacts add a decaying positional shake.

### Audio

Built entirely from `WebAudio` primitives; no audio files. Unlocked on the
first keypress or tap. Everything passes through a `DynamicsCompressor`
(threshold −14 dB, knee 24, ratio 7, attack 4 ms, release 160 ms).

The engine is an additive stack — a sawtooth fundamental plus odd harmonics at
1.5× and 2×, and sines at 3×, 4.5× and 6×, with a second detuned sawtooth
(+14 cents) so the note beats. A resonant band-pass swept by revs and throttle
(360–3400 Hz, Q 0.9–3.5) is what makes it howl rather than drone. Frequency
`62 + revs*172 + gear*7`. An upshift cuts the gain for 55 ms; a downshift
blips. A sine an octave and a half up is the turbo, audible only under load,
with a band-passed noise burst as the blow-off on lift. Tyre scrub, wind and
crowd are filtered noise from one shared buffer.

Team radio is not speech synthesis: a band-passed noise click, then one
band-passed sawtooth burst per syllable (115–150 Hz, 115 ms apart, random
formant 900–1800 Hz, Q 3.4), then a closing click. It reads as a voice under a
helmet without any assets.

## State Management

### Persistent (localStorage, key `gp3.save.v1`)

```
{ year, round, team, diff, dstand:{driverName:points},
  tstand:{teamId:points}, results:[{round,track,top[3],me}],
  fit:{engine,gbox,wing,floor,susp,brakes}, fp, vol, muted, done }
```

Write on every change. Never clear keys the game did not write.

### Session (in memory)

`phase`, `mode` (season | single), `diff`, `laps`, `trackIdx`, `team`,
`raceT`, `sessionT`, `countT`, `safety`, `yellow[3]`, `red`, `redDone`,
`practice`, `restart`, `cond`, `rainTarget`, `finishOrder[]`, `retirements[]`,
`grid[]`, `input{}`, `keys{}`, `touch{}`.

### Per car

`x, z, h, vx, vz, speed, steer, idx, lat, lap, prog, sector` (kinematics);
`tyre, tw, fuel, dmg, boost, drs, drsAllowed, slipstream` (condition);
`inPit, wantPit, pitPhase, pitTimer, stops, boxU, boxSlot, penalty, speeding`
(pit and penalties); `bestLap, lastLap, lapStart, sectorT[3], bestSector[3],
finished, finishT, retired, gridPos, rank` (timing); `skill, agg, cons, perf,
gripMul, wearMul, relyMul` (character and car).

## Physics

World units are roughly metres; `KMH = 5.1` converts unit/s to the displayed
speed. Stepped **twice per frame at half `dt`** — one step at 60 Hz lets a car
tunnel through a barrier at top speed.

Longitudinal: `speed += ACCEL * fuelMass * dt * (1 - speed/maxSpeed * 0.62)`,
braking `BRAKE * grip * 0.92`, coasting `ROLL`, and `DRAG * speed² `. Top speed
scales by car performance, damage, tyre wear, slipstream (+7.5% at full effect),
overtake mode (+7.5%) and DRS (+10.5%).

Grip is the compound's dry and wet figures blended by surface wetness, then
scaled by tyre life (0.80 + 0.20 × life), damage (−14% at full) and the fitted
parts. Wet-weather compounds lose grip below 0.3 wetness — they overheat in
the dry.

Steering: `steer` eases toward `input * STEER_MAX / (1 + |speed| * 0.021)` at
`dt*10`; heading changes by `steer * TURN_RATE * clamp(|speed|/12,0,1)`.
Velocity is pulled toward the heading vector at a rate set by grip
(7.4 on asphalt, 3.0 on the handbrake, 2.2 on grass) — that lag is the drift.
Slip angle above 0.13 rad drives tyre squeal and accelerates wear.

Tyre wear per second: `0.0072 × compound wear × load × (1 - wetness*0.35) ×
part modifier`, where load is `0.45 + |steer|*0.9 + slip*1.4 + (braking ? 0.3 : 0)`.

Collisions: 2.9-unit separation radius, near-elastic impulse at 1.05, plus a
lateral kick proportional to impact that shoves the struck car off line and can
put it into the barrier. Damage accrues at 2% of impact per contact and 10% per
wall strike; above 0.7 the front wing detaches.

**Track position** is recovered by searching a window of samples around the
last known index (−10 to +46) rather than the whole lap; lap transitions are
detected by that index wrapping across the 85%/15% boundary.

## Circuit generation

Each of the 25 circuits is defined as polar nodes `[angleDeg, radius]` in
increasing angle, plus `sx`/`sz` stretch and a rotation. Because the nodes are
angularly ordered the closed Catmull-Rom spline through them cannot
self-intersect, while sharp radius drops read as hairpins and long flat spans as
straights. A shaping exponent (1.95) and a floor (0.36) exaggerate the contrast
before a scale factor (3.5) sets real lap lengths — 2.0 to 5.0 km.

The spline is resampled to one-unit spacing, then each sample gets its tangent,
normal, heading, smoothed curvature, a racing-line offset (curvature-driven,
smoothed over 26 passes) and a corner speed target used by the AI.

**Every piece of scenery is footprint-tested against the whole circuit before
it is built** — not just its centre point. Circuits fold back on themselves, so
"behind the barrier here" can be "on the racing line there". Test the object's
full radius or half-diagonal against every sample; skip the object if it does
not fit. Grandstand terracing is built in five short segments per tier for the
same reason: a single 34-unit box swings its corners over the road on the
slightest curve.

**All far scenery radii must derive from the circuit's own measured extent**
(`maxR` over all samples), never from literals. Hard-coded radii put the
skyline inside the loop as soon as the track scale changes.

## Performance

Budget on a mid-range laptop: 62 draw calls and 2.1 ms out on the circuit,
418 calls and 3.2 ms beside a grandstand.

- **Car detail culling.** A car is 77 meshes, so 20 cars alone cost 1,540 draw calls. Fine detail (driver, halo, endplates, vanes, exhaust, diffuser fins, numbers, rims, discs, sidewalls) lives in a separate group, switched off beyond 46 units and only toggled when the band changes.
- **Crowd.** ~2,300 spectators per circuit as instanced bodies, heads, arms and flags, **grouped per stand** with per-instance colour, so a whole stand is culled beyond 230 units. Animated at 30 Hz, not 60, and only the instance buffers that changed are re-uploaded.
- **Garage interiors** hidden beyond 80 units.
- **Shadows**: 1024 map, a tight ±46 volume, and no shadow casting from crowds, trees or backdrop.
- **HUD** at 13 Hz with the timing tower rewritten only when its text changes; minimap at 14 Hz; the classification sorted once per frame and cached.
- **Adaptive resolution**: a rolling frame-time average lowers the pixel ratio in 0.12 steps when it exceeds 21 ms and recovers above 13.5 ms. A slightly softer image beats a stutter.

Two traps worth naming: an `InstancedMesh` whose matrices are never written
renders as black specks at the origin, so a throttled animator must always run
its first pass; and colours read from data as CSS strings (`'#d8382c'`) become
`NaN` through `parseInt`, which also resolves to black.

## Design Tokens

### Colour

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#f5ead8` | Page ground |
| `--bg2` | `#efe2cc` | Gradient end, inset fills |
| `--ink` | `#201e1d` | Body and heading text |
| `--ink-60` | `rgba(32,30,29,.62)` | Secondary text, labels, captions |
| `--ink-30` | `rgba(32,30,29,.3)` | **Borders and hairlines only** — 1.9:1 against the HUD plates, never legible as text |
| `--acc` | `#c67139` | Primary accent, fills, active states |
| `--acc-7` | `#8e4c22` | Accent text on light grounds, pressed |
| `--acc-3` | `#e9c4a4` | Accent tint, selected rows, badges |
| `--sage` | `#7a8a5e` | Second accent, healthy bars |
| `--sage-7` | `#4e5a37` | Sage text on light grounds |
| `--surf` | `#fffaf0` | Cards and panels |
| `--line` | `rgba(32,30,29,.12)` | Row rules |

Not tokenised but fixed: HUD plate `rgba(255,250,240,.92)`, danger `#c8402c`,
danger text `#8e2d1e`, caution `#e8be1d`, yellow flag `#f0d64e`, night surface
`#2b3345`.

Team colours (also the crowd, banner and livery palette): `#d8382c`,
`#1f7a4d`, `#aeb8c2`, `#2f6fd0`, `#2b2f38`, `#ef7a1f`, `#15a89d`, `#e8be1d`,
`#c33d86`, `#7a5cf0`.

Tyre compounds: soft `#d8382c`, medium `#e8be1d`, hard `#e6e2da`,
intermediate `#1f9e4d`, wet `#2f6fd0`.

### Typography

- Display `--fh`: `'Caprasimo', Georgia, serif` — all headings, large numerals, the speedometer, podium numbers. Weight 400 only.
- Body `--fb`: `'Figtree', Helvetica, Arial, sans-serif` — weights 400, 500, 600, 700, 800.
- Loaded from Google Fonts: `Caprasimo` and `Figtree:wght@400;500;600;700;800`.
- Micro-labels are 9–11px, 600–700, letter-spacing `.12em`–`.24em`, uppercase.
- Numeric readouts use `font-variant-numeric: tabular-nums`.

### Radius

`--r: 16px` (cards, tiles, plates) · `--r-lg: 26px` (panels, large cards,
dialogs) · `999px` (buttons, chips, pills, bars, dots).

### Shadow

```
--sh-sm: 0 1px 2px rgba(32,30,29,.08), 0 2px 6px rgba(32,30,29,.06)
--sh-md: 0 2px 6px rgba(32,30,29,.1),  0 10px 24px rgba(32,30,29,.12)
--sh-lg: 0 8px 20px rgba(32,30,29,.14), 0 26px 60px rgba(32,30,29,.18)
```

### Buttons

Base: `--fb` 700 15px, letter-spacing `.01em`, radius 999px, padding
`13px 26px`, no border, `transition: background .15s, color .15s, transform .08s`,
`:active { transform: translateY(1px) }`.

- Primary — `--acc` on `#fff8ef`; hover `--acc-7`.
- Secondary — `rgba(32,30,29,.07)` on `--ink`; hover `rgba(32,30,29,.13)`.
- Ghost — transparent on `--ink-60`; hover `rgba(32,30,29,.07)` on `--ink`.
- Small variant: padding `9px 16px`, 12px.

Focus is `2px solid var(--acc)` with `2px` offset on `:focus-visible`
throughout; selection is `--acc-3`. Disabled drops to 45% opacity.

### Contrast

Text must reach 4.5:1 against its ground (3:1 for headline-scale type). The
HUD plates blend to roughly `#fdf7ea`, against which `--ink-60` measures 4.61:1
and `--ink-30` only 1.9:1 — which is why `--ink-30` is reserved for borders.

### Breakpoints

`900px` (garage and season collapse), `860px` (menu collapses), `820px`
(weekend collapses), `620px` (garage note hides), `560px` (HUD compacts:
minimap 96×80, speedometer 34px, tower 118px).

## Assets

**None.** There are no image, model, font or audio files beyond the two Google
Fonts and the vendored `three.min.js`.

- All textures are drawn to `<canvas>` at runtime: sky gradients, asphalt, grass, kerbs, crowd blocks, the checkered start line, garage fascia lettering, car numbers, the illuminated sphere's shell.
- All geometry is three.js primitives: boxes, cylinders, spheres, cones, tori, planes.
- All audio is synthesised from oscillators and generated noise buffers.

A production implementation may replace the procedural car, track furniture,
people and landmarks with authored models and textures. The dimensions and
colours in this document are then the spec those assets must meet. Keep the
procedural circuit generation — it is what makes 25 distinct venues possible.

## Portal integration

The prototype targets GameDistribution. `index.html` carries the SDK loader and
a `GD_OPTIONS` object whose `gameId` is a placeholder to be replaced. The game
exposes three hooks the SDK drives:

- `window.gamePauseForAd(bool)` — cancels the frame loop, mutes audio, suspends the AudioContext, and restores all three on release.
- `window.gameIsPaused()` — current state.
- `window.gameShowAd()` — called between races.

`SDK_GAME_PAUSE` and `SDK_GAME_START` are mapped to `gamePauseForAd(true|false)`.
If the target platform differs, keep the same three-function shape — it is the
only coupling to the portal.

## Legal note

No real team, driver, sponsor or circuit layout is reproduced. The ten teams and
twenty drivers are invented. Circuit layouts are original shapes that merely
evoke the character of their venue; host city and country names are used as
event names only. Landmarks are original architecture with no insignia. Keep
this constraint — do not substitute real liveries, names or surveyed layouts.

## Files

Everything is under `design/`:

| Path | Contents |
| --- | --- |
| `design/index.html` | All markup and all CSS, including the token block, every screen, the HUD and the portal SDK hook |
| `design/js/data.js` | Teams, drivers, compounds, points, difficulties, the 25-round calendar |
| `design/js/engine.js` | Track and pit geometry, scenery, landmarks, cars, physics, AI, cameras, garage viewer, podium scene |
| `design/js/game.js` | Weekend flow, race control, pit stops, weather, standings, HUD, audio, save, portal hooks |
| `design/three.min.js` | three.js r128, vendored |
| `design/README.txt` | Player-facing notes and the GameDistribution upload steps |

Open `design/index.html` directly in a browser to run the prototype — there is
no build step.

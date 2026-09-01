# Handoff: 3D Bowling Game

## Overview
A complete, playable 3D ten-pin bowling game rendered in WebGL (Three.js). The player
aims by moving the pointer left/right and clicks/taps to bowl. The game runs a full
10-frame standard scoring system (strikes, spares, and the special 10th frame with up
to three rolls), with chain-reaction pin physics, a moving cinematic camera, and a
glass HUD scoreboard.

This is a finished, working prototype — not just a static mockup. It plays end to end.

## About the Design Files
The files in this bundle are a **design + behavior reference created in HTML/WebGL**.
They demonstrate the intended look, feel, and game logic. The task in a real codebase is
to **recreate this experience using the project's established environment and patterns**
(e.g. React Three Fiber, a game engine, or vanilla Three.js in a build system) — or, if
no environment exists yet, to pick the most appropriate stack and implement it there.

The single-file `bowling-standalone.html` works offline as-is (double-click to play) and
is the best artifact to run while developing, to compare behavior 1:1.

## Fidelity
**High-fidelity.** Final colors, typography, lighting, physics tuning, camera moves, and
full scoring logic are all present and intended to be matched closely.

## How It Plays
- **Aim:** pointer move left/right rotates the launch angle (clamped to ±0.19 rad).
  A gold arrow indicator on the lane shows the aim direction.
- **Bowl:** pointer down / tap launches the ball at fixed speed along the aim vector.
- **Gutters:** if the ball drifts past the lane edge it falls into the gutter and rolls
  past the pins (scores 0 for that roll).
- **Pins:** ball→pin and pin→pin collisions both transfer impulse, producing a realistic
  chain reaction. A well-aimed center/pocket shot reliably clears all 10 for a strike.
- **Settle:** ~1.15s after the ball passes the pin deck, the roll is resolved and scored.
- **Messages:** "STRIKE!" / "SPARE!" overlays appear; "GAME OVER" with a Play Again button
  at the end.

## Scene Layout (3D)
Coordinate system: lane runs along -Z (away from camera). Units are meters-ish.
- **Lane:** 2.0 wide × 18 long box, dark blue (`#0c1124`), roughness 0.34, metalness 0.32.
- **Gutters:** two `#05070f` channels just outside each lane edge.
- **Neon edge strips:** thin emissive cyan (`#38e1ff`, emissiveIntensity 2.2) strips along
  both lane edges — these drive the bloom glow.
- **Foul line:** thin emissive red (`#ff3b5c`) strip near the start.
- **Aiming arrows:** 5 small gold emissive cones inlaid in the lane (classic targeting dots).
- **Back wall:** dark box behind the pins with a horizontal emissive cyan neon line.
- **Pin deck:** raised platform under the pins (`#11173a`).
- **Pins (10):** standard triangular layout, front pin at z ≈ -10.0, rows spaced -0.31 in z,
  pins spaced 0.17 in x. Each pin = white body (cylinder 0.046→0.072 r, 0.30 tall) +
  sphere head + neck + a red band (`#ff3b5c`) + a gold band (`#ffcf5c`).
- **Ball:** sphere radius 0.16, violet metallic (`#2a1448`, roughness 0.12, metalness 0.6,
  faint emissive `#18092e`).

### Lighting
- Ambient `#3a3f66` @ 0.55; Hemisphere `#9fb4ff`/`#0a0c18` @ 0.4.
- Directional key light `#ffffff` @ 1.05 from (3.5, 9, 5), shadow-casting (PCF soft, 1024).
- Point lights: cyan `#38e1ff` @0.7 near pins; gold `#ffcf5c` @0.55 behind camera;
  violet `#8b5cff` @0.4 mid-lane.
- Fog `#06070f`, near 9 / far 26. Scene background `#06070f`.

### Camera
- PerspectiveCamera FOV 52. Idle pose: position (0, 2.4, 5.6), looking at (0, 0.5, -5.5).
- While the ball rolls, the camera eases to follow it down the lane (tracks ball z, slight
  x parallax). Lerp factor ≈ dt * 2.2.

### Post-processing
- UnrealBloomPass: strength 0.55, radius 0.5, threshold 0.8. Falls back to plain render if
  the composer fails to construct.

## HUD (DOM overlay, not in the 3D scene)
Glassmorphism panels: `rgba(11,13,26,0.55)` + `backdrop-filter: blur(16px)`,
1px `rgba(255,255,255,0.09)` border, radius 18px, soft drop shadow + inset top highlight.
- **Top-left scoreboard:** title "BOWLING" (gold gradient text, letter-spacing 5px) + a
  "LANE 01" chip. Row of 10 frame cells; the current frame is highlighted with a gold
  border + faint gold fill. Each cell shows its roll marks (X / number / "/" for spare /
  "-" for miss) and cumulative score. The 10th cell is wider (3 marks).
- **Top-right:** "FRAME n / 10", current throw label, live standing-pin count.
- **Bottom-right:** big gold cumulative TOTAL.
- **Bottom-center:** control hint pill ("↔ Move to aim · ● Click / tap to bowl").
- **Center overlay:** STRIKE/SPARE/GAME OVER message card with pop-in animation; Play Again
  button on game over.

## Design Tokens
- **Background base:** `#06070f`; radial page bg `#141833 → #090b16 → #050609`.
- **Gold accent:** `#ffcf5c` (with light `#ffe6a8` for gradients).
- **Cyan accent:** `#38e1ff`.
- **Violet:** `#8b5cff` (ball `#2a1448`).
- **Red:** `#ff3b5c`.
- **Pin white:** `#f6f7fb`.
- **Text:** primary `#eef0fb` / `#dfe3f7`, muted `#aeb3d0`, dim `#6c7295`.
- **Glass panel:** bg `rgba(11,13,26,0.55)`, border `rgba(255,255,255,0.09)`, blur 16px,
  radius 18px.
- **Fonts:** "Space Grotesk" (UI) and "JetBrains Mono" (numbers/scores), from Google Fonts.

## Scoring Logic (must match exactly)
Standard 10-pin bowling:
- Frames 1–9: a strike (10 on first ball) ends the frame; otherwise two balls.
- Strike bonus = 10 + next two rolls. Spare bonus = 10 + next one roll. Open frame = pins.
- Frame 10: two balls, plus a third if the player threw a strike or spare; score is the
  raw sum of the (up to 3) rolls in that frame.
- Cumulative running totals shown per frame; null until the frame's bonus is known.
See `computeScores()`, `frameComplete()`, and `frameMarks()` in the logic class for the
authoritative implementation.

## State Model
Authoritative game state is kept on the component instance (not React state), driven by a
`requestAnimationFrame` loop with a `phase` machine:
`loading → aim → roll → settle → resolve → (aim | over)`.
Key state: `framesData` (per-frame rolls), `frameIndex`, `pinsStanding`, `aimAngle`,
`phase`, `gameOver`, and the `ball` / `pins` physics objects. The DOM HUD is re-rendered
via `renderVals()` whenever something player-visible changes.

## Physics Tuning (important — this is what makes strikes feel right)
- Ball speed ≈ 12. Ball→pin impulse: `bs*0.7 + 3.2` spread along the contact normal plus a
  forward component from the ball velocity.
- Pin→pin: collision threshold `2*pinR + 0.1`, push `spd*0.85 + 2.3`, velocity damping
  `1 - dt*2.5`. These values were tuned so the back-corner pins (7 & 10) fall on a good
  pocket hit — weaker values leave splits and the game feels like strikes are impossible.

## Files
- `bowling-standalone.html` — **self-contained, double-click to play.** Best for running
  and comparing behavior. (Three.js + fonts inlined.)
- `Bowling.dc.html` — the authored source: HTML template (markup + glass HUD) plus the
  `class Component` game logic (Three.js setup, physics, scoring). This is the file to read
  for the real implementation logic.
- `support.js` — the runtime that `Bowling.dc.html` depends on (only needed if you open the
  `.dc.html` directly rather than the standalone build).

## Assets
No external image assets. Three.js r128 and Google Fonts (Space Grotesk, JetBrains Mono)
are loaded from CDN in the source and inlined in the standalone build. All geometry,
materials, and the thumbnail icon are generated in code.

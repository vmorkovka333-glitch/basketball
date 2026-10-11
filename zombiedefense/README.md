# Zombie Squad

Third-person co-op zombie shooter for the browser. You lead a squad of three bots through story missions, or hold out in endless Survival. Built with Three.js r128 (bundled locally), with no build step. The only outside request is the GameDistribution SDK, and only once a game ID is set.

**Play:** https://vmorkovka333-glitch.github.io/basketball/zombiedefense/

## Content

- **Campaign**: 13 maps and 27 missions with 15 objective types: reach, collect, activate, destroy nests, rescue, evacuate, codes, signals, hold, chase and more. Zones open as the mission goes on.
- **Survival**: endless waves. Earn points to buy doors, wall weapons, perks, power, the mystery box and the upgrade station. Every 5th wave brings a captain and every 10th a boss. Zombies evolve from wave 12, and walls collapse at waves 10 and 20.
- **Weapons**: 19 guns (4 of them secret) and 4 melee weapons. Each has 4 rarities, upgrades, crits, headshots and elements: fire, shock, cryo, toxic.
- **Enemies**: 14 zombie types and 14 bosses. Bosses have three phases, weak spots and special abilities.
- **Squad**: 7 characters, each with an ultimate ability and outfits. Bots revive, collect, activate, kite bosses and use their own abilities.
- **Combat extras**: killstreaks, 9 power-ups, 8 perks and a last stand.
- **Progression**: levels, credits, 35 achievements, daily and weekly challenges, and local records.
- **Mystery**: hidden marks, a keypad, secret rooms, notes, and an altar boss. Light horror events, weather, day/night and dynamic music.
- **Graphics**: per-pixel lighting so muzzle flashes, blasts and the flashlight light the world; HDR bloom, filmic grading per map mood, vignette and grain. High adds a cinema set built on the depth buffer: ambient occlusion, screen-space reflections on wet streets and polished floors, ground mist that glows toward the sun, light shafts from the sun or moon, depth of field on the menu, sharpening, lens dirt and color fringing, plus real lights at the four nearest lamps and fires. A sky dome with sun or moon, clouds and stars; street lamps with light pools and beams; burning barrels; facades with ledges, sills, awnings, air conditioners and water towers lined up with lit and boarded windows; hydrants, signs, cones and trash bags; wind-swept grass; drifting fog banks; rain splashes, puddles, stains, scorch marks and splats on the ground; rounded edges, faces, gear, contact shadows, rim light and detail textures on every character; zombies with claws, hair, ribs and bones that limp and twitch; detailed guns; shell casings, flying gibs and explosion shockwaves. Low turns the extras off for weak devices, and Auto steps down from High to Medium to Low when the frame rate drops.

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move | W A S D | left stick |
| Turn / aim | mouse (pointer lock; drag-to-aim if the page blocks the lock), arrow keys, J / L | drag right side, stick steers |
| Fire | left mouse, Space | fire button |
| Aim down sights | right mouse | ADS button |
| Sprint | Shift | push the stick fully forward |
| Reload | R | reload button |
| Use / interact | E (hold) | use button |
| Melee | V or F | melee button |
| Grenade | G | grenade button |
| Ability | X or C | ability button |
| Swap weapon | Q, 1, 2 | swap button |
| Skip break (Survival) | Enter | |
| Pause | P, Esc | pause button |
| Sound on / off | M | sound button |

## Run locally

Serve the folder over HTTP. Opening `index.html` as a file will not work, because the browser blocks local scripts.

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## Files

Scripts load in this order and share the `ZD` namespace:

| File | Purpose |
|---|---|
| `index.html` | shell, HUD, menus and overlays (fonts embedded as base64), the GameDistribution game ID |
| `js/portal.js` | GameDistribution SDK bridge: interstitials, rewarded videos, pause and mute (`window.gameShowAd`) |
| `js/data.js` | weapons, rarities, characters, zombies, bosses, perks, power-ups, XP, achievements |
| `js/maps.js` | themes, the 13 maps, missions, notes, seeded zone-based map generator |
| `js/save.js` | profile, credits, XP, unlocks, challenges, records (`ZD.S`) |
| `js/audio.js` | synthesized sound effects, ambience and the dynamic music sequencer (`ZD.A`) |
| `js/world.js` | rendering: materials, textures, lighting, sky, weather, map meshes, models, effects (`ZD.W`) |
| `js/post.js` | post-processing: bloom, grading, SSAO, reflections, mist, light shafts, depth of field, lens effects, anti-aliasing (`ZD.W.post`) |
| `js/game.js` | core loop, collision, navigation, weapons, damage, player, input, portal hooks (`ZD.C`) |
| `js/ai.js` | zombie behaviors, bosses, bot squadmates (`ZD.AI`) |
| `js/modes.js` | campaign and survival logic, mystery, horror director (`ZD.Modes`) |
| `js/ui.js` | HUD updates, result screen, menu screens, the menu's live squad scene (`ZD.UI`) |
| `three.min.js` | Three.js r128 |
| `tools/build-gd.py` | builds the GameDistribution upload zip and checks it |
| `tools/make-store-art.js` | renders the store thumbnails and screenshots from the game |
| `gamedistribution/` | upload guide, store text and the rendered thumbnails |

## GameDistribution

The game is set up for [GameDistribution](https://gamedistribution.com). See [gamedistribution/README.md](gamedistribution/README.md) for the upload steps, the store text and the thumbnails.

1. Put the game ID from the developer dashboard in `index.html` (`window.GD_GAME_ID = '...'`), or pass it to the build script.
2. `python3 tools/build-gd.py --game-id <ID>` writes `dist/zombie-squad-gamedistribution.zip`.

How the SDK is used (`js/portal.js`):

- The SDK loads once in `<head>`, before the game starts. With no game ID it is not loaded at all.
- `gdsdk.showAd()` runs only after the player presses a button outside of play: PLAY (or a mission or Survival map) before a run, and Next / Retry / Replay / Menu / Quit after one. Never during play.
- `SDK_GAME_PAUSE` freezes the world and suspends the audio context; `SDK_GAME_START` resumes both.
- Rewarded videos (double the credits of a run, +300 free credits in the menu) show only when one is preloaded, and pay only after `SDK_REWARDED_WATCH_COMPLETE`.
- With the SDK blocked or failing, every call continues the game; a stuck ad request gives up after 9 seconds.

The game exposes `window.gamePauseForAd(true | false)` and `window.gameIsPaused()`, and still calls `window.onGameplayStart()`, `window.onGameplayStop()` and `window.onGameLoaded()` when another portal wrapper defines them.

## Save data

The save is stored in `localStorage` under the key `zsquad.save.v2`. Settings from v1 carry over. Nothing leaves the device.

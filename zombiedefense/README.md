# Zombie Squad

Third-person co-op zombie shooter for the browser. You lead a squad of three bots through story missions, or hold out in endless Survival. Built with Three.js r128 (bundled locally), with no build step and no external requests.

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

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move | W A S D | left stick |
| Turn / aim | mouse (pointer lock), arrow keys, J / L | drag right side, stick steers |
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
| `index.html` | shell, HUD, menus and overlays (fonts embedded as base64) |
| `js/data.js` | weapons, rarities, characters, zombies, bosses, perks, power-ups, XP, achievements |
| `js/maps.js` | themes, the 13 maps, missions, notes, seeded zone-based map generator |
| `js/save.js` | profile, credits, XP, unlocks, challenges, records (`ZD.S`) |
| `js/audio.js` | synthesized sound effects, ambience and the dynamic music sequencer (`ZD.A`) |
| `js/world.js` | rendering: textures, lighting, weather, map meshes, models, effects (`ZD.W`) |
| `js/game.js` | core loop, collision, navigation, weapons, damage, player, input, portal hooks (`ZD.C`) |
| `js/ai.js` | zombie behaviors, bosses, bot squadmates (`ZD.AI`) |
| `js/modes.js` | campaign and survival logic, mystery, horror director (`ZD.Modes`) |
| `js/ui.js` | HUD updates, result screen, menu screens (`ZD.UI`) |
| `three.min.js` | Three.js r128 |

## Portal hooks

No ad SDK is embedded. A portal build adds a small wrapper that defines:

- `window.gameShowAd(kind, done)`: plays the ad and calls `done` when it ends. `kind` is `'preroll'` right before a mission or a Survival run, and `'midgame'` on Next / Retry / Menu / Quit. Ads never run during gameplay.
- `window.onGameplayStart()`, `window.onGameplayStop()` and `window.onGameLoaded()`: optional. The game calls them when they exist.

The game exposes these functions for the wrapper to call:

- `window.gamePauseForAd(true | false)`: freezes the world and audio around an ad.
- `window.gameIsPaused()`: reports the current paused state.

## Save data

The save is stored in `localStorage` under the key `zsquad.save.v2`. Settings from v1 carry over. Nothing leaves the device.

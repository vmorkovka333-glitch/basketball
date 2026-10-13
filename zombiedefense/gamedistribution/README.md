# Zombie Squad auf GameDistribution

Anleitung für den Upload auf [developer.gamedistribution.com](https://developer.gamedistribution.com). Der Text für die Spielseite steht unten auf Englisch, weil GameDistribution die Seite auf Englisch zeigt.

## 1. Game ID eintragen

**Die Game ID von Zombie Squad ist `c950aa9d1da242faa1d5a0c236d57555`** (angelegt am 13.10.2026).
Damit baut das Skript das fertige Zip:

```bash
python3 tools/build-gd.py --game-id c950aa9d1da242faa1d5a0c236d57555
```

Im Repository bleibt `GD_GAME_ID` leer, damit die öffentliche Fassung auf GitHub Pages das SDK nicht lädt.

Für ein anderes Spiel:

1. Im Developer-Bereich ein neues Spiel anlegen. Unter **Upload** steht die **Game ID**.
2. Die ID in `index.html` eintragen:

   ```html
   window.GD_GAME_ID = 'HIER-DIE-GAME-ID';
   ```

   Oder das Build-Skript macht es: `python3 tools/build-gd.py --game-id HIER-DIE-GAME-ID`

Ohne ID lädt das Spiel das SDK nicht und zeigt keine Werbung. Das ist nur zum Testen gedacht.

## 2. Zip bauen und hochladen

```bash
python3 tools/build-gd.py --game-id HIER-DIE-GAME-ID
```

Das erzeugt `dist/zombie-squad-gamedistribution.zip` mit `index.html` im Hauptordner, so wie GameDistribution es verlangt. Das Skript prüft dabei auch die Regeln: keine Links nach außen, keine Browser-Dialoge, `gdsdk.showAd` ist eingebaut.

## 3. Einstellungen im Dashboard

- **Rewarded Ads einschalten.** Das Spiel hat zwei Belohnungs-Videos: „Credits verdoppeln“ nach jeder Runde und „+300 Credits“ im Hauptmenü. Die Knöpfe erscheinen nur, wenn das SDK ein Video vorgeladen hat. Ist die Option aus, bleiben sie unsichtbar.
- **Mobile:** ja, Querformat (Landscape). Hochkant zeigt das Spiel „Bitte drehen“.
- **Größe:** responsiv, empfohlen 1280 × 720 (16:9). Läuft auch in 800 × 600.

## 4. Bilder

Alle in `gamedistribution/assets/`, direkt aus dem Spiel gerendert:

| Datei | Größe | Wofür |
|---|---|---|
| `thumb-512x384.jpg` | 512 × 384 | Haupt-Thumbnail |
| `thumb-512x512.jpg` | 512 × 512 | quadratisches Thumbnail |
| `thumb-512x340.jpg` | 512 × 340 | Thumbnail (ältere Formulare) |
| `thumb-200x120.jpg` | 200 × 120 | kleines Thumbnail |
| `banner-1280x720.jpg` | 1280 × 720 | großes Bild / Cover |
| `banner-1280x550.jpg` | 1280 × 550 | Banner |
| `screenshot-*.jpg` | 1280 × 720 | Screenshots aus dem Spiel |

Neu rendern: `node tools/make-store-art.js` (braucht Playwright und Python mit Pillow).

## Wie die Regeln umgesetzt sind

| Regel von GameDistribution | Umsetzung |
|---|---|
| SDK einmal laden, bevor das Spiel startet | `js/portal.js` lädt `main.min.js` im `<head>` |
| Werbung nur nach einer Aktion des Spielers | Preroll beim Klick auf PLAY (und auf eine Mission oder Survival-Karte), Midroll bei Next, Retry, Replay, Menu und Quit |
| Keine Werbung während des Spielens | `showAd` wird nur aus Menü und Ergebnis-Bildschirm aufgerufen |
| Bei `SDK_GAME_PAUSE` pausieren und stumm schalten | Spielwelt angehalten, AudioContext angehalten (komplett still) |
| Bei `SDK_GAME_START` weiter | Spiel und Ton laufen wieder |
| Belohnung nur nach ganzem Video | Credits nur nach `SDK_REWARDED_WATCH_COMPLETE`, bei Abbruch oder Fehler nichts |
| Spiel läuft auch ohne Werbung (Adblocker) | Ohne SDK oder bei Fehlern läuft das Spiel einfach weiter; hängt das SDK, geht es nach 9 s weiter |
| Kein Doppelklick während die Werbung lädt | ein Lade-Schleier blockiert weitere Klicks |
| Keine Links nach außen, keine andere Werbung | geprüft durch `tools/build-gd.py` |
| Ton abschaltbar | Lautsprecher-Knopf oben rechts, im Pausenmenü und Taste M |
| Läuft im iframe, Desktop und Mobil | responsive Layouts für Desktop, 800 × 600 und Handy quer; Pfeiltasten und Leertaste scrollen die Seite nicht |
| Pausiert, wenn der Tab verlassen wird | ja, auch beim Klick außerhalb des Spiels (Desktop) |
| Speicherstand | `localStorage` mit try/catch, nichts verlässt das Gerät |

## Text für die Spielseite (English)

**Title:** Zombie Squad

**Short description:** Lead a squad of three AI soldiers through a zombie-infested world in this third-person co-op shooter.

**Description:**
The dead have taken the city. Lead your squad of three AI soldiers through 27 story missions on 13 maps: fuel the generator, find the fuses, rescue survivors, burn the nests and reach the chopper alive. Your squadmates fight beside you, pick up mission items, use their own abilities and pull you up when you go down.

When the campaign is not enough, hold out in endless Survival: earn points, buy doors, wall weapons, perks and the mystery box, and see how many waves your squad can survive. Every 10th wave brings a boss.

- 27 missions on 13 maps: city, military base, hospital, lab, prison, mall, subway, forest, ironworks, harbor, desert, snow and the Hive
- 19 guns and 4 melee weapons with rarities, upgrades and elemental damage
- 14 zombie types and 14 bosses with weak spots and three phases
- 7 characters with their own ultimate abilities and outfits
- Daily and weekly challenges, 35 achievements, levels and unlocks
- Hidden marks, secret rooms and secret weapons on every map

**Instructions:**
- Desktop: WASD to move, mouse to aim, left click to shoot, right click to aim down sights. R reload, G grenade, V melee, X ability, E use, Q swap weapon, Shift sprint, P pause, M sound.
- Mobile: left stick to move, drag the screen to look, FIRE to shoot. The other buttons throw grenades, reload, swap, aim and use your ability.

**Category:** Shooter · **Tags:** zombie, shooter, third person, co-op, survival, 3D, action, army, soldier, horror, waves, boss

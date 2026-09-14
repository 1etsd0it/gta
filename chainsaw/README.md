# CHAINSAW RAMPAGE — Level 01: Suburbs

A cinematic 2D side-scrolling action runner built on HTML5 Canvas. You play a
chainsaw-headed killer sprinting through a suburban street at dawn: cut through
whatever is in front of you, shoot what isn't, and blow the block apart.

Everything — the character, the street, the cars, the sky, every sound — is
generated procedurally in code. There are no image files, no audio files, no
libraries and no build step.

```
# just open it
xdg-open chainsaw/index.html      # Linux
open chainsaw/index.html          # macOS
start chainsaw/index.html         # Windows
```

If the browser blocks local files, serve the folder:
`python3 -m http.server 8000`, then open `http://localhost:8000/chainsaw/`.

---

## Controls

| Input | Action |
|---|---|
| `SPACE` / `↑` / `W` | Jump (hold for height, tap for a short hop) |
| `↓` / `S` | Slide — ducks under gunfire, cuts low |
| `Z` / **Left mouse** | Chainsaw attack |
| `X` / **Right mouse** | Pistol |
| `E` | Plant explosive in a marked zone |
| `←` `→` / `A` `D` | Shift position while running; free movement in locked fights |
| `P` / `ESC` | Pause |
| `M` | Mute |
| `ENTER` | Start / retry / next level |

Right-click is captured by the canvas, so the browser menu never appears.

## The run

The street scrolls itself; he runs whether you like it or not. The level moves
through scripted beats: a quiet dawn street, the first police response, the
chase, tactical units, a mini-boss, a locked arena, and the precinct.

* **Chainsaw** — the primary weapon. One hit kills a civilian, two drop a cop,
  armour takes more. Every swing burns fuel; on an empty tank swings are slower
  and much weaker, so keep picking up gasoline.
* **Pistol** — fast and accurate at range, weak against armour, and the
  magazine is finite. Best used on police before they close.
* **Explosives** — orange spray-painted zones outside condemned houses. Stand in
  one, press `E`, then get clear: the charge takes out the building, everything
  near it, and scores every body caught in the blast.
* **Combo** — kills chain while the timer runs. The multiplier climbs to x3 and
  the screen starts to come apart at `CHAIN x10`.

### The cast

| Enemy | Behaviour | Score |
|---|---|---|
| Civilians (5 variants) | Panic and run when you get close | 50 |
| Police | Close to firing range and shoot back | 100 |
| Dogs | Fast, low, bite on contact — jump or cut them | 75 |
| Armoured units | Shrug off bullets, fire three-round bursts | 150 |
| **THE ENFORCER** | Shotgun, charge and melee — punish him after a charge | 500 |

The boss telegraphs his charge and is left winded afterwards: that recovery
window takes 60% extra damage and is the intended way to kill him.

### Pickups

Ammo (+12), gasoline (+60 fuel), medkit (+45 health), explosive charge (+1).

### Rank

The results screen scores the run on total points, best combo, buildings
levelled, body count and how much health you finished with, from **D** to **S+**.

---

## How it is built

```
chainsaw/
  index.html      screens, HUD containers, script order
  style.css       dark cinematic UI
  js/
    collision.js  math helpers, AABB/segment/circle tests
    assets.js     procedural art: sky, skyline, trees, houses, props, vehicles
    rig.js        the character system + pose library
    particles.js  pooled particles and ground decals
    postfx.js     bloom, grain, vignette, colour grade, chromatic aberration
    camera.js     follow, trauma shake, zoom, lock
    audio.js      Web Audio synthesis: chainsaw, guns, screams, score
    weapons.js    bullets, muzzle flashes, the explosion routine
    player.js     the protagonist: movement, weapons, damage, death
    enemies.js    civilians, police, dogs, armour, boss, cars, pickups
    level.js      Level 01 layout, parallax rendering, destructible buildings
    ui.js         HUD, banners, floating numbers, menus, results
    game.js       orchestration: input, entities, beats, waves, scoring
    main.js       boot, resize, main loop, adaptive quality
```

A few decisions worth knowing before changing anything:

* **The character is one rig.** Body parts are pre-rendered once into offscreen
  canvases at 2x and composed per frame with transforms, so the protagonist is
  literally the same pixels in every animation — run, slide, attack and death
  can never drift apart. Civilians, police, SWAT and the boss are the same
  skeleton with different outfits, which is why the whole cast is lit alike.
  His chainsaw head, arm bars and spinning chain teeth are his own parts.
* **Poses, not frames.** `CR.Poses` returns joint angles; actors blend toward
  them. Locomotion blends smoothly, attacks and hits snap.
* **Nothing is loaded.** `assets.js` draws every house, tree, car and prop into
  canvases at boot (a few hundred milliseconds), so the frame loop only ever
  does `drawImage`.
* **The world is drawn straight to the visible canvas** and post-processed in
  place; bloom is computed at 1/5 resolution. Frame rate is watched, and quality
  steps down automatically if the budget is missed.
* **Coordinates**: ground is world `y = 0`, up is negative, `x` grows to the
  right. An actor's `y` is the point under its feet.
* **Audio** is synthesised on the fly and only starts after a user gesture, per
  browser autoplay rules. The chainsaw is a continuous oscillator stack whose
  pitch and filter track how hard you are revving it.

### Level 02

`NEXT LEVEL` is wired up and functional: it reports that Downtown is coming and
restarts the slice. The level script lives in `level.js → buildScript()` as a
list of spawns and beats, so a second level is a new script plus a palette.

## Content note

Cartoon-grade but heavy violence: blood, dismemberment particles and demolished
buildings. Gore can be turned off in **Settings → Blood & Gore**, which replaces
the red with dust.

# Voxel art direction — “Cute blocks”

13 October 2026 · user direction: _“Turn this into a browser based game — more cute cartoony, like Minecraft. Add amazing visual effects.”_

This supersedes the painterly, realistic look of the three screen concepts and the Meshy/Blender runtime models as the **runtime art direction**. The concept images, Meshy characters, Blender sources and their evidence remain in the repository as historical references and preserved production evidence; they are no longer loaded by the game. Game rules, the twelve-guild scope, open PvP outside towns/safe zones, the quest and the authoritative simulation are unchanged.

All voxel art is generated procedurally in TypeScript at load time. No paid generation, external model, or texture download is used.

## Pillars

1. **Toy diorama.** The world reads like a handmade block model seen from above: chunky, saturated, softly lit, with a gentle tilt-shift blur at the top and bottom of the screen.
2. **Chibi characters.** Big heads, short bodies, expressive eyes. Silhouettes are distinct at gameplay distance: Knight (silver helm, red plume, blue tabard, sword and kite shield), Cyborg (white/cyan shell, glowing visor, arm cannon), Briar Hound (charcoal-plum fur, glowing amber eyes, cute but menacing), Mara (keeper of hours: lavender robe, silver bun, hourglass), Nemi (provisioner: green apron, straw hat, satchel), Concord Watch (guard: gold and crimson armour, halberd).
3. **Every action pops.** Hits, casts and status changes are confirmed server events turned into big, colourful, short-lived effects: voxel debris, stars, rings, trails, shockwaves, screen shake and hit-stop. Gameplay telegraphs stay clearer than decoration.
4. **A living world.** Day/night, lanterns that wake at dusk, fireflies, petals, butterflies, chimney smoke, campfire embers, river sparkles, jumping fish, a waterfall with mist and a glowing magical astrolabe.
5. **Rules stay legible.** The safe-town edge, refuge and PvP state are always obvious. Selected targets, enemy windups and the player character must never be lost in effects or foliage.

## Scale and coordinates

- World voxel: **0.5 m** (`VOXEL` in `apps/client/src/voxel/blocks.ts`). Ground surface is **y = 0**; the top ground block is `iy = -1`.
- Grid bounds x −40..40, z −56..76, y −4..24 (160 × 264 × 56 voxels). The playable map is x −20..20, z −40..60 (`packages/simulation/map.ts`); everything else is scenery that frames the diorama.
- Babylon scene is right-handed. +z is north (toward Briar March), the default camera looks north from the south. Actors face local **+Z**; `root.rotation.y = heading` where movement direction is `(sin heading, cos heading)`.
- Characters are ~1.9 m tall (chibi: head ≈ 40% of height). Character voxels are **0.1 m** (or finer for faces), meshed with `meshColors`.
- Server collision is authoritative and unchanged. Visual structures must not occupy walkable space at body height (0–2 m) except decorative tree trunks/foliage, which the old scene also allowed and which fade when they hide the player. Footprints of houses, towers, walls, the pipe ruin and memorial pillars must sit inside their `OBSTACLES` boxes (rounded inward to the 0.5 m grid), and the astrolabe pedestal inside its 2.1 m radius.

## Layout (from `map.ts` and the previous Blender assembly)

| Feature         | Location                                                                                   | Notes                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Highcross plaza | z −40..0, x −20..20                                                                        | Paved with light/dark stone patterns, flower beds, benches, barrels, crates. Town walls along x = ±19.5..20 and z = −40                                                                             |
| Houses          | (−13,−24) 6.825², (13,−25) 6.24², (−13,−9) 6.5², (13,−9) 6.305²                            | Cute timber-frame cottages, distinct roof colours, lit windows, chimney smoke, doors face the plaza (x<0 → +x, x>0 → −x)                                                                            |
| Astrolabe       | (0,−10), radius 2.1                                                                        | Marble/gold pedestal; floating, rotating golden armillary rings, a glowing orb and orbiting motes in realm colours (Fantasy green, Science cyan, Chaos magenta). Compass ring inlay radius ~3.8–4.6 |
| Market stall    | x 5.8..9.3, z −17.2..−12.6                                                                 | Striped awning (fades when hiding the player), produce crates; Nemi at (7,−14)                                                                                                                      |
| Mara / guard    | (−5,−9) / (−3,−3)                                                                          |                                                                                                                                                                                                     |
| Safe line       | z = 0                                                                                      | Glowing rune tiles plus a soft shimmering curtain and rising sparkles; signs reading SAFE / PVP                                                                                                     |
| North gate      | towers (±5.6, 5) 2.7×3.7, 8 m; arch over                                                   | x                                                                                                                                                                                                   | <4.1 at z 3.2..6.8                       | Stone brick, banners, torches; walls (−11,5) w10 d1.8 and (9,5) w7 d1.8, 3.6 m high. Gaps at x −20..−16 and 12.5..20 stay open |
| Road            | z 0..60, centre x = sin(z·0.13)·1.3                                                        | Dirt path with gravel edges and stepping stones; meadow and forest either side                                                                                                                      |
| River           | z 17..23 across the whole world                                                            | Water surface ≈ −0.2 m; sand banks, reeds, lily pads; a waterfall from the west cliffs                                                                                                              |
| Bridges         |                                                                                            | x                                                                                                                                                                                                   | <4 (deck 8 m) and x 12.5..17.5, z 16..24 | Planks with post railings outside the walkable deck                                                                            |
| Pipe ruin       | box (−13,31) 6×6; ruined wall x≈−10, z 27..35                                              | Oxidised copper pipe with steam and sparks: Science bleeding into Fantasy                                                                                                                           |
| Memorial        | pillars (−6.2,34.8) & (−1.8,34.8), 0.65×0.68; arch on top ~3 m; epitaph stone at (−4,33.6) | Glowing runes; quest beacon while the clue is the objective                                                                                                                                         |
| Refuge          | (14,45), radius 4                                                                          | Gold-rimmed stone circle, two lantern pillars at x = 14±3.7, cosy tent and campfire with embers                                                                                                     |
| Hound dens      | (1,11), (−2,29), (7,39)                                                                    |                                                                                                                                                                                                     |
| Forest          | trees at x ±(8..19), z 7..59 avoiding river, refuge and pipe                               | Oak, birch, cherry blossom, spruce, autumn and a few golden trees; mushrooms, ferns, flowers                                                                                                        |
| Beyond          |                                                                                            | x                                                                                                                                                                                                   | > 20, z < −40, z > 60                    | Terraced hills/cliffs rising 2–10 m, more forest, rooftops beyond the town wall, distant crystals hinting at Chaos             |

## Palette (sRGB)

| Token   | Hex                                                                | Use                           |
| ------- | ------------------------------------------------------------------ | ----------------------------- |
| grass   | `#7ccf5a` → `#5fb548`                                              | Meadow tops (biome variation) |
| leaf    | `#4fae4a`, cherry `#ffaed1`, autumn `#ff9f43`, gold `#ffd45e`      | Canopies                      |
| path    | `#d9b27c`                                                          | Road, gravel `#b9b2a6`        |
| stone   | `#c9c3b8`, brick `#a9a4a0`, dark `#7d7a86`                         | Plaza, gate, cliffs           |
| wood    | `#c58f53`, dark `#7a5232`                                          | Planks, timber                |
| plaster | `#fff3df`                                                          | Walls                         |
| roofs   | red `#e8574f`, blue `#4e8fe0`, teal `#3fb8a8`                      | Houses                        |
| water   | `#53c7f0` deep `#2f8fd8`, foam `#ffffff`                           | River                         |
| magic   | gold `#ffd45e`, cyan `#5ef2ff`, magenta `#ff6bd6`, green `#7dff8a` | Astrolabe, runes, VFX         |
| ink     | `#2b2140`                                                          | UI outlines, text             |
| cream   | `#fff7e8`                                                          | UI panels                     |

UI: rounded, chunky, cream panels with ink outlines and a hard 3–4 px drop “shelf” shadow; fonts **Fredoka** (UI) and **Pixelify Sans** (numbers, titles, key caps), bundled via `@fontsource` (no network dependency). Ability, item and portrait art are **pixel-art sprites drawn in code** (`apps/client/src/pixel-art.ts`).

## Lighting and post-processing

- Hemispheric sky light + directional sun/moon with soft PCF shadows (2048, frustum following the player). Day/night cycle (`dayPhase`), default 12-minute loop starting mid-morning; `?time=0.0..1` freezes the phase for captures. Night stays readable: cool moonlight, warm lantern pools, emissive windows.
- Default rendering pipeline: HDR, ACES tone mapping, gentle saturation boost, bloom (threshold ~0.8), FXAA, vignette, **tilt-shift depth of field** (focus on the player, disabled on Low), chromatic aberration pulses for heavy impacts only.
- Glow layer for emissive meshes (lanterns, windows, runes, astrolabe, VFX). Selection outline / highlight for the selected target. Characters receive a dark cartoon outline when supported.
- Baked voxel AO (mesher) replaces SSAO.

## VFX catalogue (presentation only — server events decide)

| Trigger                  | Effect                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Knight basic / Sunder    | Wide gradient slash arcs + sword trail; Sunder adds golden overhead arc, ground crack, voxel debris, dust ring, shake + hit-stop                                                               |
| Shield Bash              | Shield flash, shockwave ring, cartoon stars; dizzy stars orbit stunned heads                                                                                                                   |
| Challenge                | Golden “!” pop above the target, radiating taunt lines                                                                                                                                         |
| Interpose                | Golden tether beam and a shield bubble on the protected ally while `protectedBy`                                                                                                               |
| Rally                    | Healing circle with rising plus signs and sparkles while healing                                                                                                                               |
| Last Oath                | Pillar of light, rotating rune circle, floating crest, golden aura while `oath`                                                                                                                |
| Brace / Reactive Plating | Translucent hex/kite shield in front while `guarding`                                                                                                                                          |
| Cyborg Pulse Tap / Lance | Muzzle flash, glowing bolts with trails, impact rings; Lance charge-up gathers particles, then a thick beam with electric afterglow                                                            |
| Mag Clamp                | Magnetic ring projectile; spinning rings at the feet while rooted                                                                                                                              |
| Arc Mine                 | Blinking mine with arming ring; electric explosion with arcs, debris, shockwave                                                                                                                |
| Coolant Burst            | Frost ring, snowflakes, ice shards; frost motes on slowed actors                                                                                                                               |
| Repair Drone             | Tiny voxel drone orbiting with green beam pulses                                                                                                                                               |
| Overclock                | Crackling cyan aura and heat sparks                                                                                                                                                            |
| Evade / Break Free       | Afterimages, dust puffs and speed streaks / shattering shackles                                                                                                                                |
| Hound bite / telegraph   | Red ground warning that fills before the bite; three claw streaks on contact                                                                                                                   |
| Hit                      | White flash and squash on the victim, voxel debris and stars; damage numbers bounce (DOM)                                                                                                      |
| Death                    | Cartoon smoke poof and debris; creatures drop sparkling marks/XP orbs that fly to the killer                                                                                                   |
| Level up / loot          | Golden beam, firework burst, rings                                                                                                                                                             |
| Player hurt / low health | Red vignette pulse / heartbeat vignette                                                                                                                                                        |
| Ambient                  | Fireflies (night), butterflies and pollen (day), cherry petals, chimney smoke, campfire embers, waterfall mist, river sparkles, jumping fish, astrolabe magic, safe-line shimmer, quest beacon |

Budgets: ≤ 250 draw calls p95 in normal play, ≤ 800 k active triangles, effects bounded by pools; Low quality disables DOF, halves particles and turns off shadows. Every transient mesh, particle system and material must be disposed or pooled.

## Module ownership

| File                                                                                     | Responsibility                                                                                                 |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `voxel/blocks.ts`, `voxel/grid.ts`, `voxel/mesher.ts`, `voxel/api.ts`, `vfx/textures.ts` | Shared foundation and contracts                                                                                |
| `voxel/atlas.ts`                                                                         | Procedural 16 px block textures (one per `TILES` entry)                                                        |
| `voxel/world-gen.ts`                                                                     | Deterministic pure-data world (`generateWorld`, cached `getWorld`)                                             |
| `voxel/world-mesh.ts`                                                                    | Babylon meshes, materials, water, foliage sway, emissive night, occlusion fading                               |
| `voxel/characters.ts`                                                                    | Voxel character models, procedural animation, hit flash                                                        |
| `vfx/combat-vfx.ts` (+ helpers)                                                          | Event-driven combat effects, statuses, projectiles, mines, telegraphs                                          |
| `vfx/ambient.ts`                                                                         | World ambience, safe-line shimmer, quest beacon                                                                |
| `scene.ts`                                                                               | Engine, camera, sky, lights, day/night, pipeline, composition, picking, screen effects, public `GameScene` API |
| `local-world.ts`, `network.ts`                                                           | In-browser world host and the shared connection interface                                                      |
| `App.tsx`, `style.css`, `pixel-art.ts`, `Minimap.tsx`                                    | Cute HUD, entrance, mode choice, pixel icons/portraits, voxel minimap                                          |
| `audio.ts`                                                                               | Cute synthesized sound and music box ambience                                                                  |

## Shared runtime contracts

`GameScene` (`apps/client/src/scene.ts`) keeps its existing public API (`constructor(canvas, onProgress)`, `load()`, `setSnapshot`, `select`, `rotate`, `quality(low)`, `project(pos, height)`, `direction`, `aim`, `metrics()`, `stress`, `previewHound`, `previewElemental`, `dispose`, `onSelect`/`onGround`/`onFrame`, `canvas`, `camera`, `engine`, `scene`) and adds:

- `setQuality(level: "low" | "medium" | "high")` — `quality(low)` maps to low/medium. High adds full DOF and more particles; Low disables shadows, DOF and halves effects.
- `setDayCycle(enabled: boolean)` and `readonly dayPhase: number` (0..1). `?time=<0..1>` freezes the phase.
- `project(pos, height)` measures `height` above the visual ground (`surfaceHeight`), so labels follow terraces.
- Before the first snapshot it renders an attract-mode orbit of Highcross behind the entrance screen.

Connections (`apps/client/src/network.ts`): `GameConnection { mode; onSnapshot; onNotice; onStatus; join(name, guild); send(intent); leave() }`, `createConnection(mode: "solo" | "server")` and `preferredMode()` (`?server` or `?mode=server` selects the local Colyseus server; everything else plays solo). `LocalConnection` (`local-world.ts`) runs the same `World` simulation in the page at 20 Hz with 10 Hz snapshots and reports `"Connected"` once joined. Solo progress is saved in `localStorage` when available.

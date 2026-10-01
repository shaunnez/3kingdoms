# Briar Gate art and HUD comparison

**Final result: blocked**

This report concerns fidelity to the approved visual target. The revised slice is playable, but final environment-art acceptance and bulk production remain open. The report does not reject the verified bug fixes or claim that the complete twelve-guild game exists.

**Visual truth and evidence**

- Source: `design/screens/01-highcross.png`, `02-wilderness-pvp.png`, and `design/art-direction.json`. Original source images remain unchanged.
- Full comparison: `artifacts/checkpoint/captures/art-direction-comparison.jpg`, assembled from the approved town concept, pre-pass town, rejected first iteration and revised plaza. Each image is fitted into a 960×540 panel without cropping. The concept is 1672×941; runtime captures are 1920×1080 CSS pixels at device pixel ratio 1.
- Focused comparison: `artifacts/checkpoint/captures/art-hud-comparison.jpg` puts the portrait/vitals, action bar and safety/quest regions together. The concept is first normalized to 1920×1080; crops retain a 1:1 pixel scale. The runtime's auxiliary controls make its bar wider, and functional text is smaller than the concept lettering; small supporting text remains a human-readability follow-up.
- Revised plaza: `artifacts/checkpoint/captures/2026-10-01T06-26-14-156Z-8457da59.png`, source `b3dcdc0a…`; ordinary camera, traveller at (0, −17), unaccepted quest. This precedes the final fern, tree-fade, tangent and map-water corrections. It must not be labelled as a capture of the later build.
- Final forest: `artifacts/checkpoint/captures/2026-10-01T06-37-03-806Z-4e664b09.png`, source `7ae7fc7c…`; ordinary camera, traveller at (18, 54), completed quest.
- Smaller viewport: `artifacts/checkpoint/captures/2026-10-01T06-28-55-496Z-3f7b2d71.png`, 1280×720 CSS pixels, before final forest-only corrections. Main HUD controls remained accessible. The inventory panel and earned charm were inspected at this viewport; its content scrolls.
- The source illustrates the eventual three-gate hub. This checkpoint depicts the market and northern gate approach; there is no pixel-for-pixel claim of equivalent geography, population or quest state.

**Findings**

- [P1, open] Environment construction and density remain below the reference. The concept has layered masonry, detailed shopfronts, inhabited stalls, stepped portal architecture and integrated planting. The runtime still uses a small repeated house library, simple market props and broad ground patches. Further authored architecture and prop work is required; copying additional incomplete guilds into this scene would not resolve it.
- [P2, open] Ground and furniture repetition is still visible. The new paving is less angular and less contrasty than the first candidate, but its repeated pattern and simple barrel/rock silhouettes are conspicuous. The next environment pass needs localized wear, transitions and a small finished prop set, assessed at the same camera.
- [P2, fixed] Small bars, a schematic minimap and crowded log competed with play. Enlarged vitals/actions, a survey of the actual environment, live quest/safety markers and a collapsible log improve legibility. Selected-target information replaces the location title. Generated portraits/action art are retained.
- [P1, fixed] Fading leaves alone exposed a screenful of opaque branches. The rejected clearing frame `2026-10-01T06-30-37-535Z-93180fab.png` shows the player obscured. Trees now have separate groups; only geometry intersecting the bounded camera-to-player segment fades. The final forest frame shows the Knight through the obstruction while surrounding trees retain foliage.
- [P2, fixed] The first paving candidate was too contrasty and the plaza lacked a focal point. The source texture is preserved; its runtime grade is softer. The astrolabe is now in the plaza, with matching server collision and a clear route around it.
- [P2, fixed] Primitive fern colours looked pale against the forest floor. Darker linear material colours bring them closer to the leaf cutouts. They remain simple prototype geometry.

**Five fidelity surfaces**

| Surface | Assessment |
| --- | --- |
| Fonts and typography | Serif locations, names and dialogue; clean sans-serif functional labels. Larger health/resource labels and action keys remain readable at 1080p and 720p. The concept's exact generated lettering is not a reproducible font specification. Small supporting labels still need a human readability check. |
| Spacing and layout | Required HUD anchors retained. Actions have larger hit areas; auxiliary actions remain separate because this build implements Brace, Evade and Break Free. The concept shows fewer controls. Camera beta 0.79 gives about 44.7 degrees downward, radius 26, FOV 0.52 radians; it deliberately prioritizes actor readability over an exact match to the 50-degree composition target. |
| Colours and tokens | Parchment text, muted brass edges, charcoal panels, blue ambient light and warm lamps follow the palette. The reference has richer localized colour and a denser range of warm lights; that gap remains open. |
| Image and asset quality | Real generated portrait/action assets, three new Higgsfield material sources, Blender geometry and an actual survey render. The game viewport is live 3D. Leaf alpha works without rectangular backgrounds. Derived normal/roughness maps are approximations, not measured scans. Final environment GLB validates without errors or warnings; character warnings are retained. |
| Copy and content | Mara, bridge keeper Elian Voss, the copied inscription and the explicit reward form a coherent local quest. North-gate wording matches this map. The historical concept's east-gate wording does not override current geometry. Safety/loot text follows the agreed rules. |

**Comparison history**

1. Baseline frame `2026-10-01T06-07-33-142Z-fdc608f7.png`: coarse paving, small HUD, schematic map, weak focal point.
2. First candidate `2026-10-01T06-19-32-407Z-31deb54c.png`: HUD/map improved, but paving contrast and empty centre still failed composition review.
3. Revised plaza `2026-10-01T06-26-14-156Z-8457da59.png`: softened stone and centred astrolabe. Briefing, combat, clue and reward completed in the browser. `highcross-art-expedition.mp4` records 75.04 seconds of this source, before the final forest correction.
4. Off-path review found opaque tree branches and pale ferns. Per-tree camera obstruction, fern grading and a final explicit tangent export corrected those defects. Final source: `7ae7fc7c5b86923611c39c37312ee499d65b578d0f17d45e39f78d4eed0c3fe5`.

**Interactions and checks**

Browser review covered briefing, target selection/combat through ordinary server inputs, bridge traversal, clue, return reward, inventory, 720p layout and off-path camera obstruction. The final production browser had no captured warning/error log entries before the sustained render test. This was a developer rehearsal; follow `docs/expedition-playtest.md` for the separate human test. Full multiplayer rules have automated coverage and retained earlier browser evidence, not a new multi-player visual acceptance in this art pass.

**Implementation checklist**

1. Obtain the uncoached human feedback before changing combat scope.
2. Finish the environment construction/prop set needed to resolve the two remaining art findings, preserving the same camera comparison.
3. Resolve the separate heap target and qualify lower-end hardware before widening asset production.

Final result: blocked

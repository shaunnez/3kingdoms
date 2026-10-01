# Verification history

Current game implementation and asset evidence: [Briar Gate checkpoint](checkpoint-status.md). The dated planning entries below are retained as historical records; their statements about an absent runtime or unsubmitted generation describe that earlier stage.

30 September 2026. This record concerns the specification, catalogue and static journal only.

## Inputs inspected

- Read the full approved `game-concept.md` and `design/art-direction.json`.
- Visually inspected all three referenced PNGs: town, open-PvP combat and twelve-guild selection. Existing files preserved.
- Inspected the live Desecration journal in the browser for its editorial structure and visual hierarchy.
- Read-only GitHub inspection confirmed `shaunnez/3kingdoms` was an empty public repository before project setup.
- Queried Higgsfield model discovery and a cost-only estimate with no reference upload or job submission. Read current official Meshy pricing/rigging and engine/server documentation; references are linked in the relevant specification.

## Automated checks

`python3 tools/build_catalogue.py` and `python3 tools/build_devlog.py` generate the planning manifests, guild catalogue, counts and static journal. `python3 tools/validate_plan.py` verifies roster/action coverage, unique IDs, valid and acyclic prerequisites/dependencies, quest/map asset coverage, generated counts, unchanged PNG hashes/dimensions, local document/media links and image alternative text. The first validation found a link to this not-yet-created report; creating the report resolves that draft-stage omission. Final results are appended below after execution.

No game unit/integration/E2E, load, performance or human fun tests have run: no game runtime exists. All game acceptance rows remain not run. The static journal is not a game build or a deployed public website. No new paid generation jobs were submitted.

## Initial planning results

- Catalogue and journal generation: passed. Final inventory has 12 full guilds plus Adventurer, 117 guild/starter actions, 25 scenes, 25 named NPCs, 23 creatures, 6 bosses, 44 quests, 62 equipment/material/consumable definitions and 22 screens.
- Manifest: 2,173 planned delivery units, including explicitly bundled variants/stems; 1,902 C1 and 271 C2. This is not a count of completed assets or unique generated meshes.
- Validator: passed; all ID/dependency/coverage/link/hash checks above. Three original PNGs remain byte-identical to their manifests.
- Python syntax compilation: passed for all three planning/journal tools.
- Regeneration: catalogue and journal outputs rebuilt with identical SHA-256 hashes; passed deterministic-output check.
- Browser: local journal index and all three articles opened in Codex's browser; images loaded, navigation and captions verified, no horizontal overflow in the inspected production/visual article desktop viewport. Index layout visually inspected; browser error/warning log returned empty. This is not a mobile/accessibility certification or game E2E test.
- Initial loopback-server attempt was blocked by the filesystem/network sandbox; permitted loopback preview was then started successfully. Initial Git setup was likewise rerun with the required filesystem permission. No automatic-approval rejection remained unresolved.
- No paid provider generation, public game/blog deployment, infrastructure purchase, or 48-hour build activation occurred.

## Repository handoff

Workspace `/Users/shaun/new-game` is initialized on `main`, with `origin` set to `https://github.com/shaunnez/3kingdoms.git`. The original 36 project files were staged at the initial handoff. The configured 1Password SSH signer failed with `failed to fill whole buffer`, followed by `failed to write commit object`; no initial commit was created and nothing was pushed. Signing configuration was preserved. The later PvP revision adds working-tree changes and new files; stage the reviewed revision before retrying the commit when signing is available, then push `main` and verify local/remote HEAD. This blocker does not affect the saved plan or local journal.

## PvP revision checks

The user's one-item/two-item loot, red-name timer, hostile guards and merchant refusal replace the initial no-equipment-loss rule. Added `docs/pvp-and-outlaw-rules.md`, synchronized supporting documents, promoted the guard role to active law enforcement, added a corpse screen and published a fourth local journal entry. Supporting timer/loot-selection/self-defence/arena rules are explicitly proposed defaults.

`python3 tools/build_catalogue.py`, `python3 tools/build_devlog.py`, `python3 tools/validate_plan.py`, Python syntax compilation and `git diff --check` passed. The current catalogue has 23 screens, one reusable law-enforcement role and 2,194 planned asset units (1,923 C1 / 271 C2); existing guild, map and quest counts are unchanged. The validator covers the required one/two-item split, outlaw consequences and guard model/rig references. The fourth article's local links and generated HTML were checked structurally; it has not had a fresh browser visual review. No gameplay implementation, paid generation or signing retry occurred in this revision.

## First playable checkpoint — 1 October 2026

The user subsequently authorized unsigned commits, paid Higgsfield/Meshy production and continued P1/P2 work. Commit `c4281324c2ba6dea689cf84319b5056896bcf1b6` added the local game, source assets, tests and browser evidence. The runtime fingerprint is `5267608d4f38e8d0cbb9fe46fbf768654ddc340bae30294bfeb57033be11cd2c`; its frozen manifest is [retained separately](../artifacts/checkpoint/build-manifest-pre-environment-repair.json) while the environment receives further art repair.

Thirty local rule/transport checks, type checking, formatting, production build and six-model glTF validation passed. Two actual browser sessions exercised town safety, one-item clean-victim claims, two-item red-victim claims, lawful retaliation, guard pursuit, merchant refusal and refuge respawn. [Scoped acceptance](../artifacts/checkpoint/acceptance.json) distinguishes those observations from simulation fixtures, concept imagery and untested full-game features.

The first GitHub CI run found a historical concept link into the author's home directory. Commit `3b5486920bd8fa9666075dcd4129feaec6ae9aef` preserves that layout reference inside `design/`, uses a repository-relative link and makes the validator reject links outside the checkout. [CI run 36722527673](https://github.com/shaunnez/3kingdoms/actions/runs/36722527673) passed every configured check on that exact commit. Signing was disabled only for authorized commands; global signing settings were preserved.

The measured ten-minute rendering baseline and server-load trace passed their scoped local targets, with their longest stall and bandwidth limitations retained. This is separate from final art acceptance, lower-end hardware qualification, human fun testing and a public game deployment. Later source changes require their own evidence; a green earlier run does not verify an uncommitted repair.

## Environment repair and collision alignment — 1 October 2026

Commit `5f0ff3f8bae392d13287bb45fa3ff9453ac7599a` adds the bounded merchant-house, foliage and lantern pass, market-awning visibility repair, explicit recording cleanup and matching server collision footprints. That checkpoint runtime fingerprint is `19f52fbc4ae879b22026c7bee1d7e07cead8f8463915c1fec1a06103ca5eae9a`. [CI run 36731536802](https://github.com/shaunnez/3kingdoms/actions/runs/36731536802) completed successfully on that exact commit.

That local suite had 31 passing checks. Its first rerun exposed a wall-clock assumption in the transport test: the target stopped at z=+0.05, outside town, yet the test expected protection. The corrected fixture waits for the authoritative safe-state snapshot and retains the unchanged-health assertion. Failed output and a sanitized explanation are preserved in [the fixture record](../artifacts/checkpoint/network-boundary-fixture.json). No game protection rule was weakened.

The environment source re-exports from its checked-in Blender file. Six runtime GLBs have zero errors and eleven retained warnings. A normal browser click toward the front house stopped at x=-9.3 beside its -9.75m facade; the merchant visit verified the awning fade and ordinary dialogue. The renderer trace completed 600.38s at 108.58 median fps, 10.30ms p95 and 11.10ms p99 on Apple M5/Chromium 154 at 1920×1080. Its maximum active count was 1,468,177 triangles, with 202 p95 draw calls. The 312.80ms worst frame remains unexplained.

That renderer trace uses `9fea75ee…`, immediately before the server collision correction. [All 266 production client files are byte-identical](../artifacts/checkpoint/client-collision-equivalence.json) in that combined build. The thirty-minute load/unload run was in progress when that commit was published; its completed result follows below. No Blender exports, video transcodes or local game builds ran during that trace; source/document review and repository publication occurred independently.

## Final landmark and memory follow-up — 1 October 2026

Game commit `b49c48f92d700c9347e988be0f1a03cbc7ba7b66`, source fingerprint `41e30695fe06c0c86733c42820b896d714472ff80497a27256d3783ed9926c67`, adds solid tower bounds and the round astrolabe pedestal. [CI 36736079686](https://github.com/shaunnez/3kingdoms/actions/runs/36736079686) passed. All 32 local checks, type checking, formatting and production build passed. The negative pre-fix regression is retained. Ordinary browser movement stops outside both landmarks; the central arch remains traversable. The tower can still partly obscure the player. [Review and frame associations](../artifacts/checkpoint/landmark-review.json) disclose that the idle QA character died to a hound before the tower frame was saved.

The renderer still uses the same 266 client runtime files; [the comparison](../artifacts/checkpoint/client-landmark-equivalence.json) includes scripts, styles, models and textures, excluding debug source maps. The thirty-minute memory trace on `19f52fbc…` completed in 1800.07 seconds without hidden samples. Fourteen measured post-load disposal phases retain 138 meshes, 67 textures, 9 skeletons and 32 animation groups; materials rise from 80 to 81, then remain stable. Heap estimate is 278.15–559.35 MiB, so the 300 MiB target remains missed. The summarizer excludes the one pre-load transition sample from disposal counts; raw traces are unchanged. [Both traces and their limits](../artifacts/checkpoint/captures/memory-comparison.svg) remain visible.

The final 16-client loopback run completed in 600.54 seconds: tick p95 7.87ms and p99 9.13ms. [The final report](../artifacts/checkpoint/server-load-final-summary.json) retains decoded snapshot size and the fixture limitations; it does not qualify impaired-network or production bandwidth behavior. Browser and journal review ran concurrently.

The local journal was inspected at desktop and a 390px mobile viewport (375px document width after scrollbar). A long-hash overflow was repaired: document scroll width now equals its 375px client width. Stylesheet content hashes avoid stale CSS. The 75.035-second H.264/AAC return video reports ready state 4, correct 1920×1080 dimensions, controls and poster. The SVG comparison was visually inspected. No deployed-site browser QA is claimed.

## Journal publication — 1 October 2026

Milestones 001–006 are published to the existing owner-private [THREEFOLD journal](https://threefold-devlog.shaunnesbittuk.chatgpt.site). Native Sites deployment succeeded for source `1f8f60af46270234ad239e30376e480e8d8d17e2` at 15:38 UTC on 30 September. Its exported package checked 89 HTML and 59 Markdown references. The first Git source push returned HTTP 503; retry pushed the same retained local commit. [The canonical publication receipt](https://github.com/shaunnez/3kingdoms/blob/main/devlog/site.json) records the exact version, archive hash and deployment. Game/evidence commit `01f963cdecfb0e869225f12d91f5c43c6d6473c9` independently passed [CI 36737466020](https://github.com/shaunnez/3kingdoms/actions/runs/36737466020). No public game hosting or deployed-site browser QA is claimed.

## Combat and quest repair — 1 October

Runtime source `03698a82f0c180cd1777c21df1c83bf04174b40acca79365af772d809ad8fc27` adds held-equipment correction, thirteen Knight clips, action-specific effects and sound, explicit returning-creature state and a coherent local quest conclusion. The [repair receipt](../artifacts/checkpoint/combat-repair.json) preserves build associations and rejected diagnostic evidence. All 37 local checks, typing, formatting and production build pass. Six GLBs have zero errors and eleven warnings. The final browser expedition and post-recording quest reward are captured separately. This does not relabel older multi-client PvP or memory evidence as a fresh result, and reference art acceptance remains open.

Game source `16d58c5df921d54be6809644070b317c7edc842d` is pushed to `main`; [CI 36818046116](https://github.com/shaunnez/3kingdoms/actions/runs/36818046116) passed every required step. Later evidence and journal receipt commits do not change the runtime fingerprint.

Milestone 007, “Giving the Knight weight,” is published to the existing owner-private journal, including the actual browser recording and subsequent quest reward frame. The native Sites deployment succeeded for source `b93f8eeedf7e44474c0bdadcd90383ae01a4f773`; exact version, deployment and archive receipts are in [devlog/site.json](../devlog/site.json). This is journal publication; the playable game remains a local preview.

## Art and HUD milestone — 1 October 2026

Runtime commit `9e767f9110a260b3e932a9cc540dbcd9823ffd86` passed [GitHub CI 36826235826](https://github.com/shaunnez/3kingdoms/actions/runs/36826235826). All 31 runtime hashes match source fingerprint `7ae7fc7c5b86923611c39c37312ee499d65b578d0f17d45e39f78d4eed0c3fe5`. Local checks include 38 gameplay/transport tests, formatting, production build, six valid GLBs and the unchanged planning roster/references. The revised environment itself has zero GLB errors or warnings; six warnings remain in character models.

The [fixed-viewport renderer trace](../artifacts/checkpoint/captures/2026-10-01T06-47-14-184Z-f2b47586.json) completed 600.54 seconds on Apple M5/WebGL2 at 1920×1080, DPR 1, without viewport changes or hidden samples: median 83.73fps, p95 17.40ms, p99 21.30ms, maximum 511.20ms. Draw p95 was 234 and maximum active triangles 1,239,422. It meets the numerical limits for this synthetic animation/draw fixture, not the specified lower-end machines or a full online battle. No new thirty-minute memory qualification or independent human fun test is claimed.

Mara's briefing, the bridge, hound encounters, memorial and single-use reward were exercised through the browser. The 75.04-second recording carries its earlier art fingerprint; final tree visibility and material-export fixes have separate still evidence. The [visual comparison](../design-qa.md) remains blocked on architectural detail and repeated ground/prop treatment. The [human playtest brief](expedition-playtest.md) is ready for the next acceptance step. The three new Higgsfield material jobs were estimated at 8.25 credits; actual billing remains unverified. No new Meshy job was run.

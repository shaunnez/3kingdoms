# Delivery, estimates and acceptance

Updated 1 October 2026. All estimates are planning ranges, not a promise that the complete game can be produced in 48 hours. The user explicitly authorized P1/P2 and full Higgsfield/Meshy use; paid calibration and the local game checkpoint are underway. The separate 48-hour experiment has not started. Current results and verified consumption are in the [checkpoint report](checkpoint-status.md).

Latest user direction: prioritize quality and fun, keep going while the user sleeps, and do not repeatedly seek the generation permission already granted. Retain estimates as operational information, not reasons to cut the required design. The browser/rigging/multiplayer gate below still governs expansion into bulk asset production.

## Delivery stages

| Stage | Deliverable | Exit condition / evidence | What it does not establish |
| --- | --- | --- | --- |
| P0 · Specification | This plan, content/asset catalogues, screen contracts, local journal | Cross-references and counts validated; user can review defaults and scope | Playability, balance or final art approval |
| P1 · Visual calibration | Small Higgsfield batch, consistent sheets for humanoid/mechanical/nonhuman and materials | Review selected references, reject inconsistent anatomy and unclear silhouettes; record credit receipts | Game-ready geometry |
| P2 · Browser proof | Highcross corner + short Briar lane, Knight/Cyborg/wolf body, live HUD, one enemy, one projectile, one ground effect, sound | Walk/turn/attack/dodge and body transforms work; two real clients fight across a tested safe boundary; measured frame/memory/load report | Completion of even one full region or all guilds |
| P3 · Multiplayer foundation | Persistent login/character, combat, three engineering guild kits, inventory, death/reconnect | Independent clients, no duplicate items/rewards, complete mini expedition and recovery; fault tests | Twelve-guild scope completion |
| P4 · Guild breadth | All twelve full kits, forms, resources, trials, mastery and equipment | Each plays solo and party role, real progression, counterplay and assets; 66-pair smoke matrix | All world content or proven competitive balance |
| P5 · Chapter One content | 22 scenes, 38 quests, three bosses, jobs/crafting/social/arena | All Chapter One acceptance rows; real novice and multiplayer playtests | Later three destinations |
| P6 · Chapter One release candidate | Optimized build, recovery/operations, accessibility and content polish | Exact-commit evidence, no release blockers, deployment rehearsal and rollback tested | Public activation until requested |
| P7 · Chapter Two | Remaining three regions, six quests, six creatures, three bosses, prestige | Later-content rows plus regression of Chapter One | Unlimited expansion or ongoing live-service staffing |

P1/P2 occur before bulk art. P3 and later can reuse accepted assets and incremental batches, but cannot substitute placeholder bodies for a completed-art claim. A provider failure can move work to independent code/content tasks within authorized scope; it does not authorize unbounded retries or spending from another provider.

## Early browser proof: exact scene and review

Scene A is a 40×40m Highcross corner: cobbles, arch, astrolabe fragment, two market props, two NPCs, warm/cool light, safe boundary and exact functional HUD. Scene B is a 60×40m Briar route: bridge, pipe ruin, three foliage clusters, hound, player ambush lane and alternate retreat. Use final intended camera and quality presets. The safe line is visible and sourced from server collision data.

Bring three representative bodies through the pipeline: Knight humanoid, Cyborg mechanical humanoid, Changeling wolf quadruped. Include a minimal four-material Elemental silhouette preview to expose alpha/lighting risk; it need not be a paid generated body yet. The wolf's custom Blender locomotion and dodge are a mandatory proof, not a later surprise. Use actual GLBs and matching in-engine VFX. HUD numbers change, abilities animate, casts have sound, network hits are authoritative.

Capture matched-camera stills against the existing art references, a 60–90s uncut browser walkthrough, both client views for PvP/safety, a 10min stress trace and a 30min load/unload memory trace. Review: silhouette/scale, material cohesion, shadow/contact, movement, feet and threat readability, HUD legibility, sound identity and pacing. Any failed category has a specific repair and rerun. Do not bulk-generate after only a still-image pass.

## Cost basis and credit envelopes

The Higgsfield read-only estimate on 30 September 2026 returned **2 credits** for one `nano_banana_pro`, 2K, 16:9 image, `use_unlim:false`, count 1. It explicitly submitted no job. Reference uploads, different resolutions/models and video require fresh estimates. This is a tool estimate, not a universal list price. The audit record is [cost-basis.json](../design/cost-basis.json).

The official [Meshy API price list](https://docs.meshy.ai/en/api/pricing), checked the same day, lists 30 credits for Meshy-6/7.1 image-to-3D with 2K/4K textures, 5 for auto-rigging, 3 per animation action, 5 for remesh and 10 for ordinary retexture. Model availability and the actual CLI pipeline must be checked before execution. Web-app allowances and API credit wallets are not assumed interchangeable. Source-image generation remains planned through Higgsfield.

| Package | Assumption | Estimated credits | Boundary |
| --- | --- | ---: | --- |
| Calibration reference pilot | 8 reference units × at most 2 candidates × 2 credits | Higgsfield 32 | Additional multi-view output calls must fit a separately stated ceiling |
| Browser-proof Meshy pilot | 3 textured bodies × 30 + 2 humanoid rigs × 5 + 4 animation actions × 3 | Meshy 112 first-pass | Wolf rig/animations in Blender; no automatic rig budget for it |
| Pilot with geometry retries | Up to one additional geometry candidate for each of 3 bodies | Meshy 202 total | Original planning suggestion: 250 credits; superseded by explicit pilot authorization. Actual consumption is reported separately |
| Full baseline reference package | 164 reference units × 1.5 average image calls × 2 credits | Higgsfield 492 | Includes pilot; 328–656 range at 1–2 calls per unit; multi-view requirements may increase this |
| Chapter One generated-model candidate pool | 80 textured candidates × 30 | Meshy 2,400 | Pool includes 13 guild looks, 15 forms, 23 named NPCs, 17 creatures, 3 bosses and 9 hero props; reuse/manual builds can reduce calls |
| Chapter One finishing allowance | 32 suitable auto-rigs × 5 + 40 clip actions × 3 + 10 remesh × 5 | Meshy 330 | Manual custom rigs, retargeting and Blender LODs remain outside credit cost |
| Chapter One candidate reserve | Up to 24 replacement geometry candidates × 30 | Meshy 720 | Total indicative C1 envelope 2,730–3,450; pilot included, not additive |
| Chapter Two candidate pool | 17 candidates (2 NPC, 6 creatures, 3 bosses, 6 props) × 30, plus 4 rigs × 5 and 12 clips × 3 | Meshy 566 | +6 geometry candidates contingency = 746; custom dragon/ray work is manual |
| Icon/portrait reference contingency | Up to 80 curated image calls if manual/vector production needs support | Higgsfield 160 | Not one paid call per UI manifest entry; batch style studies first |
| Generated video | Optional title/devlog concept film | Unquoted | Discover model and estimate exact duration/resolution before proposing spend |
| Audio/music/voice | Original synthesis/recording or licensed supplier | Unquoted | No audio vendor chosen; must quote once representative sample and rights are known |

The 164 reference units are not identical workloads: a map layout may be hand-authored, a multi-view character may need several calls, a screen can use manual typography. The envelope is deliberately transparent rather than pretending one prompt guarantees one usable deliverable. Reserve is a planning assumption, not permission to rerun. Purchased credit-to-currency conversion depends on the user's current plan, top-up terms, currency and tax; **no verified USD/NZD conversion is available**, so don't invent a dollar total from these credits.

The nine C1 hero-prop candidates are astrolabe, three realm gates, abbey bell, cistern clock, reactor, carousel and bargain counter. The six C2 candidates are Winter city gate and tablet, city memory rack and power node, Sea lighthouse and observatory wheel. Ordinary walls, floors, joins and fitted attachment variants are Blender kit work. This is a finite candidate pool, not an instruction to generate every manifest row through Meshy.

Suggested operating allowance for a small external playtest: **US$75–250/month** for a server, managed database/backups, static delivery and basic monitoring, excluding labor, AI subscriptions, media generation and unusually high bandwidth. This is an engineering budget placeholder, not a provider quote. Before launch, compare actual hosting quotes to measured room CPU/memory and expected traffic. Example bandwidth model: 100 daily players × 30MiB uncached downloads ≈88GiB/month, plus WebSocket traffic; 40kbit/s/client × 100 players × 2h/day ≈103GiB/month. Multiply by actual measured player-hours and cache-hit rate. Costs scale with concurrency and behavior, not account count alone.

The user has explicitly authorized Higgsfield and Meshy generation for the checkpoint. Do not ask for that permission again. The representative browser and rigging quality gate governs bulk production; this authorization does not start a recurring purchase or switch providers. Record estimated, submitted, completed and actually charged costs separately; an unknown failed-job charge remains unknown.

## Effort and schedule realism

These are engineering/creative effort ranges from the specified scope, not externally sourced market quotes and not a calendar commitment. Parallel capable humans can compress elapsed time; provider queues and review still constrain it.

| Workstream | Focused effort estimate |
| --- | ---: |
| Calibration + browser proof | 16–32 hours |
| Core client/server, durable state and multiplayer failure handling | 60–110 hours |
| Twelve guild kits/forms/mastery and combat tuning | 60–110 hours |
| Chapter One maps, quest implementation and bosses | 70–120 hours |
| Model/material/rig/animation cleanup and integration | 100–220 hours |
| UI, accessibility, sound and music integration | 40–80 hours |
| QA, performance, novice playtests and release operations | 50–90 hours |
| Chapter One total | **396–762 hours** |
| Chapter Two additional content and verification | **100–200 hours** |

These ranges overlap conceptually with iteration but are summed as a conservative work budget. They show why 48 hours is an experiment in how far a strong agent pipeline can get, not a credible guarantee of finished production quality across this inventory. The user can choose a more aggressive attempt without changing what completion means.

## Proposed 48-hour experiment, when separately started

Clock starts only on an explicit build instruction after plan/visual review and any relevant spend agreement. Keep elapsed wall time and active work distinguishable. The schedule is a prioritized attempt; missed gates remain visible.

| Elapsed window | Priority |
| --- | --- |
| 0–6h | Repository/runtime skeleton, authoritative movement, actual scene import, HUD, safe-zone invariant |
| 6–12h | Three engineering kits, mobs, interaction, two real clients, basic persistence/reconnect |
| 12–20h | Full twelve guild mechanics and representative forms; continuous combat and integrity checks |
| 20–30h | Highcross and three excursions, initial story/jobs, equipment, crafting and recovery |
| 30–38h | Boss quality pass, remaining Chapter One content as capacity permits, sound/UI integration |
| 38–44h | Performance, accessibility, mixed PvE/PvP and recovery failure tests; human feedback |
| 44–48h | Repair blockers, checkpoint complete work, record capture/devlog and exact unmet acceptance rows |

If the early renderer/rig/multiplayer proof fails, focus on the smallest repair that makes it pass. Do not spend the rest of the time mass-producing assets against an invalid pipeline. At 48 hours stop at a recoverable checkpoint and report what is playable, verified, unfinished and spent. Do not replace the required guilds with disabled menu entries or claim the experiment completed the full game.

## Acceptance matrix

The complete-game rows below remain release criteria. Selected P2 behaviors now have automated and real-browser evidence in [checkpoint-status.md](checkpoint-status.md) and [acceptance.json](../artifacts/checkpoint/acceptance.json). A verified slice does not pass the entire corresponding release row. P0 document checks are recorded separately in `docs/verification.md`.

| ID | Requirement | Observable acceptance / evidence | Stage |
| --- | --- | --- | --- |
| A01 | Twelve full guilds | Each has working resource, 9 catalogue actions, trial, mastery, outfit/forms, sound and progression; Adventurer separate | P4 |
| A02 | Guild distinction | Player demonstrates each guild's defining decision; no reskin-only kits; all twelve complete same solo job | P4 |
| A03 | Open PvP | Two independent clients can attack any nonparty eligible player in every unsafe scene without consent; safety tests cover all transports | P2/P5 |
| A04 | Safety | Zero damage/control/support-across-boundary violations for melee, projectile, trap, AOE, DoT, pet, reflected/redirected damage and revive; server overrides forged flags | P2/P5 |
| A05 | Combat | Casts, hits, interrupts, evade and control limits match catalogue under 100ms RTT; no queued input after chat/blur | P3/P5 |
| A06 | Movement/camera | All paths and forms traverse without traps; stairs, camera fades, collision, rotation/zoom and interaction work at target sizes | P2/P5 |
| A07 | World | All 22 C1 scenes and defined routes/clues/landmarks accessible; first realm choice unrestricted after intro | P5 |
| A08 | Quests | All 38 C1 quests complete; every branch, recovery and out-of-order clue case checked; no guild-exclusive critical clue | P5 |
| A09 | Bosses | Three C1 bosses implement all three mechanics, readable warnings, reset/credit logic and quest alternatives | P5 |
| A10 | Progression | New character reaches 20, switches guild without loss, unlocks full kits, equips form-equivalent items and earns quest points | P5 |
| A11 | Economy | Concurrent/replayed trade, bank, purchase, craft and reward tests never duplicate or lose committed property; full-bag/timeout handled | P3/P5 |
| A12 | Death/reconnect | Safe respawn, personal echo, fee recovery, downed/revive and camping alternative work; disconnect body remains exposed; no duplicate avatar | P3/P5 |
| A13 | Social | Real players party, invite, friend, Company, chat, trade, mute and report; no client injection or cross-account private-state exposure | P5 |
| A14 | Screens | All 23 screens including corpse claims, and stated empty/loading/error/partial states; 720p/1080p, remap and keyboard paths usable | P5/P6 |
| A15 | Art | Every C1 required manifest unit verified or explicitly replaced by accepted equivalent; no proxy cube or broken rig in release scope | P6 |
| A16 | Effects/audio | Ability/attack cues match timing/shape; no ally-effect masking; subtitle/hint alternatives; ten-minute repetition and mix review | P6 |
| A17 | Performance | All applicable target-table scenarios measured on named hardware/browser matrix; document exceptions before release decision | P6 |
| A18 | Persistence/operations | Crash/retry/handoff tests, restored backup, observable failures, compatible rollout/rollback and authenticated public configuration | P6 |
| A19 | Arena | Separate unsafe scene, normalized stats, 1v1/2v2 start/results/reconnect and bounded cosmetic rewards | P5 |
| A20 | Novice comprehension | At least five new testers: ≥4/5 complete intro and explain safety without coaching; median first guild ≤25min | P6 |
| A21 | Fun and recovery | ≥4/5 testers voluntarily start another expedition; ≥3/5 choose to continue after one PvP loss; interview exact frustrations | P6 |
| A22 | Party play | Four independent clients finish a realm boss and a mixed PvE/PvP encounter; supports earn fair credit and warnings remain readable | P5/P6 |
| A23 | Full named world | Three C2 maps, six C2 quests, six C2 creatures, three C2 bosses and prestige complete, with all shared checks repeated | P7 |
| A24 | Journal integrity | Each relevant milestone has dated entry, labelled media, exact scope and verification; gameplay claims link to actual capture/build | Every stage |
| A25 | PvP loot and law | One item from an ordinary victim, two from a red victim total across claimants; eligible equipped/form gear and protected exclusions; concurrent/retried claims cannot duplicate or over-loot; timer refresh/expiry/offline/death persistence, self-defence and accomplice attribution; guards detect/chase/leash without harming clean bystanders; red merchants/bank refuse, red refuge respawn works, towns still prevent player damage | P2/P5/P6 |

Small human samples are directional evidence, not statistical proof of retention or perfect balance. A20/A21 failure blocks a “fun and ready” claim and drives specific revision. If testers are unavailable, mark these not run and report that limitation; do not replace them with invented users or an agent's preference.

## Risk and decision register

| Risk / decision | Proposed response | When revisited |
| --- | --- | --- |
| Art target exceeds browser budget | Matched-camera proof, lighting/material reuse, selective reflections | P2 before bulk art |
| Nonhuman rigs consume schedule | Custom Blender proof for wolf first; reuse rig families with explicit action bindings | P2 |
| PvP drives new players away | One/two-item stakes, protected essentials, explicit red timer, guard/service consequences, two exits and refuge recovery; test returning after losing valued gear | Novice and mixed-threat playtest |
| Twelve guild interactions explode tuning | Common status rules, catalogue IDs, pair matrix, focused human matchup tests | P4 onward |
| Provider images inconsistent | Lock identity references; approve smaller batches; retain rejected evidence | Every batch |
| Generated topology fails deformation | Reject early; repair or rebuild; count human/agent cleanup time | Every rig review |
| Content count outruns quality | Stage C1/C2 explicitly; quality gate; never silently omit required C1 guilds | Every checkpoint |
| Budget/hosting unknown | Credit estimates now; quote actual wallets, audio and host before spend | Before paid/public work |
| Devlog publication mistaken for current build | Publish exact commit, verify deployed version and URL separately | Every future publication |

Remaining product decisions are final title/naming, reference-art acceptance and commercial-release intent. Higgsfield/Meshy use and the owner-private ChatGPT Sites journal have been authorized. Public game hosting and the separate 48-hour experiment remain later decisions; authorized checkpoint work continues independently.

# Asset bible and production specification

Every new asset is currently planned. The [manifest](../design/asset-manifest.json) is a list of delivery units with IDs, owner, chapter, dependencies, rig, budget profile, proposed path and evidence fields. A unit can contain explicit variants or stems; counts are not a claim that thousands of unrelated models need generation. The [catalogue totals](catalogue-totals.md) are generated from the same source.

The PvP/outlaw revision adds a corpse-claim composition/component bundle, red-name and timer symbols, loot eligibility/protection/remaining-quota badges, merchant-refusal and hostile-guard states, guard reference/polearm attack and law/loot audio. It promotes the existing guard body to an active Concord Watch actor; shield-bash and dash use the existing humanoid action library. Other corpse interaction poses reuse each body's inspect/kneel/sniff binding. No new images or production models have been generated for this revision.

## Visual direction and reference review

Mature, tactile semi-realism: worn stone and metal, visible cloth weave, restrained saturation, strong silhouettes. Highcross's warm amber light against blue dusk is the shared anchor. Fantasy uses moss, wet slate and aged gold; Science oxidised steel, white ceramic, cold cyan and sodium orange; Chaos velvet, porcelain, ink and bruised violet. Characters must look as though they occupy the same lighting environment despite incompatible origins.

The inspected three concept images are 1672×941, targeting a 1920×1080 composition. The town image establishes architecture, open movement space, three gates and player scale; the combat image establishes a thin hostile lane, clear feet and source/target distinction; the guild image establishes Knight detail and the twelve-guild selection layout. Their art is a target, not proof of renderer performance. They were created with built-in image generation, not Higgsfield. Do not relabel them retrospectively.

Gameplay camera: 50° downward, perspective FOV initially 30°, distance calibrated to 9% player height in frame; zoom bounds 6–12% screen height. Inspect every asset at 100%, 50% and default gameplay distance, on dry and wet ground, in town amber, forest blue and industrial cyan. Reject silhouettes that require a close-up to distinguish a guild or hostile cast. Limited 90° camera steps still require complete back surfaces and side profiles.

Lighting is authored: one principal shadowed directional light, baked/static contribution and reflection probes, a small pool of local lights. Puddles use selective planar or probe reflection where measured affordable; the low preset removes expensive reflections but preserves wet-material roughness. Bloom is selective, no full-screen fog hiding feet, no baked bright highlights in base colour. Use compositional foliage and architecture, not thousands of unique props.

## Model and material contracts

| Profile | LOD0 triangles | LOD1 / LOD2 | Materials / bones | Texture target | Download target |
| --- | ---: | --- | --- | --- | --- |
| char-30k-2k | ≤30k including outfit | 15k / 6k | ≤4 / ≤75 | 2K body+outfit sets, shared where possible | ≤4 MiB compressed per assembled look |
| form-20k-2k | ≤20k | 10k / 4k | ≤3 / ≤60 | 1–2K | ≤3 MiB |
| npc-15k-1k | ≤15k | 7k / 3k | ≤3 / shared humanoid | 1K, hero portrait can be 2K | ≤2 MiB |
| mob-18k-1k | ≤18k | 8k / 3k | ≤3 / ≤60 | 1K, one hero 2K exception documented | ≤2 MiB |
| boss-50k-2k | ≤50k | 25k / 10k | ≤5 / ≤100 | 2K | ≤6 MiB |
| prop-5k-atlas | ≤5k ordinary; landmark exception ≤20k | 50% / 20% | 1–2 / none | shared 1–2K atlas | ordinary ≤250 KiB |
| equip-4k-1k | ≤4k | 2k / 800 | 1–2 / sockets | 512–1K | ≤500 KiB |

These are maxima and review targets, not a request to spend every polygon. Distant static crowds use LODs or simplified impostors. Instanced modules share material resources. Texture GPU residency and transparent overdraw are reviewed independently from file size. A single 2K RGBA texture is about 16 MiB uncompressed before mipmaps; a small compressed download can still exceed memory budgets after decoding.

Blender source uses metres, applied scale, consistent ground pivot; export GLB uses Y-up and forward +Z with a right-handed scene configuration. Verify the actual exporter result in the browser with an axis test, not just the source viewport. Character root at ground centre; weapon sockets named `hand_r`, `hand_l`, `back`, `head`, `chest`. Collider is authored capsule or primitive combination stored separately from render mesh. Decorative cloth and accessories never change authoritative hit volume.

PBR: base colour in sRGB; tangent normal and ORM (occlusion, roughness, metallic) in linear; preserve correct channels through KTX2 conversion. Prefer opaque/alpha-mask surfaces; use blended transparency only where necessary. Mesh compression must preserve skinning and morph data. Texture and geometry optimization tools are selected and pinned at implementation; compare optimized result visually to source, including UV seams and normal handedness. No embedded provider links or runtime network textures.

Two adult humanoid builds share a canonical skeleton, six heads and six hair options including a hidden-mesh bald choice. Six skin swatches and six hair swatches are parameter values, not separate generated characters. Every guild has a starter, journey and relic outfit appearance: reuse silhouette foundations with documented attachments/material changes, plus a clear guild identity at all tiers. Forms have separate bodies and a constant identity motif. Symbiont adaptations are host attachments; Elemental bodies share an elemental rig but different mass silhouettes/material motion; Powered Armour uses three configurations of a custom heavy rig.

Station Nine Custodian extends the heavy master with extra-leg/arm controls. White Regent extends the dragon rig; flying-looking enemies remain constrained to authored ground combat navigation unless their encounter explicitly uses a scripted jump. Never assume every unusual body can use a humanoid animation pack.

## Animation and ability presentation

The manifest lists master-rig clip libraries, every player action clip, required form adaptations and dedicated enemy mechanic clips. Shared humanoid locomotion can be retargeted; action timing remains per ability. Form-dependent actions have explicit bindings to compatible rigs. Additive breathing, aim and hit reactions must not obscure the authored anticipation pose.

Author at 30fps, sample/compress after review. Locomotion is in-place with speed metadata and foot-contact markers; server controls translation. Dashes/leaps use server movement curves with animation matched to displacement, not unrestricted root motion. Combat clip events: `anticipation`, `commit`, `impact`, `recover`, `cancelable`. The client follows server timestamps; animation event callbacks never independently award damage. Upper-body blends only for attacks marked movable.

Review walk, run, eight movement directions, turn in place, start/stop, two weapon sets, cast, dodge, stagger, death and revival before accepting a rig. Reject foot sliding over 10cm through a planted contact, visible joint collapse, detached weapons, penetrations through torso, exploding normals and incorrect scale. A static beauty render is insufficient. Clothing is mainly skinned/additive; simulated cloth is optional cosmetic with bounded CPU cost and a deterministic disabled fallback.

Each ability package consists of icon, animation, VFX recipe and prepare/resolve audio. The recipe has wind-up, active and decay phases, plus a low-effects alternative. Shape and timing must match the collision specification: lane, cone, disk, ring, projectile or selected-target cue. Never make a 2m hit look like 6m damage. Shared impact textures and shaders are reused; recipes configure identity through silhouettes, rhythm, material and sound.

VFX budget profile `vfx-512`: 512px source flipbooks initially, ≤300 live particles for an ordinary skill, ≤1,500 for one signature, ≤8,000 visible cosmetic particles in the stress scene. Cosmetic emission culls by distance and priority; threat outlines/cast warnings never do. Maximum two simultaneous distortion effects on medium, zero on low. Blend effects leave feet and ground warnings visible; prioritize enemy outline above friendly ground art. No effect exceeds three flashes per second; avoid saturated full-screen flashes entirely. Culling must not change server hit behavior.

## Sound and music production

Source WAV 48kHz/24-bit, deliver Ogg plus a verified browser-compatible fallback if needed. Game playback uses buses: master, music, ambience, combat, voice, UI. Stream music/long ambience; preload only current-area critical cues. One-shot critical cues should start within 50ms of the render event when ready. Audio unlock waits for a user gesture and shows a clear muted/enable state.

Aim for consistent perceived loudness by category with no clipping; production target masters ≤−1dBTP and an initial gameplay mix around −18 LUFS integrated, verified in a representative capture. These are mixing targets, not mandatory loudness normalization on every tiny sound. Keep voice intelligible by ducking music 3–6dB; critical hostile warnings take priority over friendly cosmetics. Spatialize combat, cap at 32 voices on medium and 16 on low; preserve nearby hostile warning voices first.

Each ability has separate preparation and resolution stems; shared tails are permitted with explicit dependency references. Guild palettes are specified in the catalogue. Bard motifs share tempo/key families with the score and use short layers, not twelve simultaneous independent songs. Audio reduced-effects mode preserves rhythm and captions. No voice cloning of a real person without permission; use original performance or appropriately licensed synthetic voices and retain source/usage records.

Twenty-five NPCs need three selective voiced lines each, not full voiced novels. Three player voice profiles each require exertion, hurt, defeat and revive variants; gender is not tied to body build. All quest dialogue exists as authored text. Each map ambience unit contains one 60–120s loop and three details; score has six families × four states (explore, suspicion, combat, resolution), sharing bar-aligned transitions. Footstep banks cover stone, mud, metal, wood, water, snow and cloth, with six variations and equipment-weight layers. Do not pay to generate hundreds of near-identical steps independently.

UI sounds, enemy idle/alert/hit/death, every enemy attack warning/contact, portals, rain, death echo, revive and loot all have catalogue entries. Interface errors are short and gentle; footsteps and barks are repetition-tested for ten minutes. Public gameplay videos require caption tracks and readable audio levels.

## Higgsfield visual generation plan

Higgsfield produces references and selected promotional motion. It does not prove a usable 3D topology, exact map collision or real-time gameplay. Use model discovery before each production batch. The read-only discovery on 30 September 2026 offered Nano Banana Pro and Soul 2.0; prefer a small Nano Banana Pro reference-conditioning test for model sheets and scene layouts, judged against Soul only if a concrete quality gap merits another authorized test. Model choice is provisional until a controlled sample passes.

Prompt contract: asset ID, owner, chapter, scale, body/rig, silhouette, palette, materials, camera, pose, views, lighting, isolated background, negative constraints and target outputs. Character sheets include front/side/back plus a three-quarter view, neutral A-pose, separate hands/limbs, no smoke over joints, no cropped feet and an equipment attachment inset. For multi-view 3D input, export consistent separate view images; a collage is not automatically valid multi-view geometry.

Use the approved town/material reference as the style anchor and one locked character sheet as each character's identity reference. Every edit specifies invariants and requested changes. Store exact model ID, parameters, reference hashes, prompt, output IDs, actual charges and review outcome. Do not drift a face, crest or garment motif across batches without a recorded revision. No automatic regeneration on uncertain submission or timeout: recover the existing job ID first.

Batch sequence:

1. **Calibration:** eight reference units: Knight, Cyborg, Changeling wolf, four-body Elemental sheet, human base/material sheet, Highcross module kit, Briar combat slice, HUD/icon language. At most two candidates each, selected deliberately. Final multi-view outputs may require additional calls within the approved ceiling.
2. **Browser proof assets:** use the accepted humanoid, mechanical and nonhuman references plus a small town/forest kit. Validate camera, rigs, movement and effects before bulk art.
3. **Guild expansion:** the remaining guild looks and all form bodies; revise a shared style board if necessary, not each model independently.
4. **World cast and environment:** mentors, creatures, bosses, modular kits, every map layout/vista and quest evidence motifs, prioritized by chapter.
5. **Presentation:** remaining screens, portraits and coherent ability/icon families. Compose exact typography and interactive states manually.

Do not generate a film for each ability. Ability studies can be a timed three-frame sheet; the real effect is made in the engine. Video generation is optional for a title mood film or devlog concept reel, clearly labelled generated concept footage. Actual gameplay milestones should use captured browser footage.

## Meshy and Blender production plan

The official [Meshy rigging API](https://docs.meshy.ai/en/api/rigging) currently describes standard textured humanoid bipeds with clear limbs; it excludes nonhumanoids and unclear bodies. It also specifies forward +Z for uploaded GLBs and a 300,000-face ceiling for task-input rigging. The browser budgets here are much lower. Plan custom Blender rigs for quadrupeds, birds, beetles, unusual machines and the dragon rather than assuming an automatic rig will work.

For each selected candidate: approved reference → generated geometry/texture candidate → inspect all sides → Blender geometry repair/retopology where necessary → UV/material cleanup → canonical rig or custom rig → animation and sockets → collision/LODs → compressed export → browser review. Remeshing can destroy rig/UV assumptions; stabilize topology before binding and baking final maps. Do not automatically purchase remesh/retexture/convert steps when local work or the existing output already satisfies the contract.

Use the Meshy CLI workflow required by the installed skill during future production, with dry-run estimates and explicit retained task IDs. Check the live supported model names; pin the selected model rather than a moving `latest` alias. Download the produced GLB and source texture maps, keep provider provenance privately, and create a Blender source file for edited assets. Generation source archives can live in controlled object storage; Git stores compact approved outputs, manifests and hashes. Do not commit signed download URLs, raw API responses containing credentials, or private account metadata to the public repository.

Blender is the coherence pass: apply common scale, correct anatomy and silhouette, reduce tiny topology, assign standard material groups, fit equipment, inspect deformation, place sockets, generate LODs and collision, bake animation. Rebuild simple architecture procedurally/manually in Blender rather than generating every wall segment. Human cleanup remains a significant effort estimate.

## Provenance and acceptance workflow

The production workflow progresses from planned through reference selection, generation, repair, rigging, export, integration and verification. The machine-readable manifest now uses `planned`, `prototype`, `produced`, `verified` and `rejected`, with evidence and explicit limitations on delivered prototypes. `design/production-overrides.json` applies real production state to the catalogue without losing the complete requirements. A rejection retains its candidate and reason. The three original screens remain concept-only evidence even though the general visual direction is accepted.

Asset record extensions at production time: provider/model, task ID, prompt path/hash, input references, downloaded file hash, source license evidence, Blender version, exporter settings, triangle/material/bone/texture counts, clip durations, collision dimensions, output hash, owning scene, browser screenshot/video and reviewer result. Status promotion requires evidence; source-image approval alone cannot mark a model verified.

Acceptance: correct identity at gameplay distance; complete views; within documented budget; correct transform/scale; working materials; no material visual defects; deforming rig and required clips; precise gameplay cues; appropriate sound mix; accessible alternatives; no missing dependencies; load/dispose without resource leak. Scene acceptance also requires real browser timing and multiple-client combat evidence. A budget exception requires a measured scene reason and an offset elsewhere, not just a prettier thumbnail.

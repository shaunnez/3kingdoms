# Asset production and recovery

The checkpoint uses paid tools only for offline authoring. The game client and server require no Higgsfield, Meshy or model-provider credential.

## Traceable inputs and outputs

| Layer | Location | Handling |
| --- | --- | --- |
| Original screen targets | `design/screens/` | Preserve byte-identical originals |
| Higgsfield calibration | `design/calibration/`, `design/prompts/p1-*.txt` | Reference art; never label as gameplay |
| Provider recovery records | `artifacts/checkpoint/*-receipts.json` | Sanitized task IDs, file hashes and verified/estimated consumption |
| Private downloads/receipts | `assets/source/private/` | Git ignored; may contain expiring signed URLs |
| Editable local source | `assets/source/*.blend` | Original scene, equipment, rig and material assembly |
| Browser deliveries | `assets/runtime/models/`, `assets/runtime/ui/` | Packaged GLBs/WebP; no runtime generation |
| Inspection/validation | `artifacts/checkpoint/` | Rig counts, optimizer receipts, GLB issues and captures |
| Full-game tracking | `design/asset-manifest.json` | Generated from catalogue plus `design/production-overrides.json` |

The five bodies are prototypes. Their smaller checkpoint GLBs do not satisfy every source, LOD, build, equipment, motion, icon or review requirement of the eventual manifest entries. Keep limitations on each production override rather than marking a whole guild delivered because one model loads.

## Pipeline used

1. Higgsfield GPT Image 2.5 references establish the Knight/Cyborg/wolf silhouettes, Mara and Nemi, Highcross/Briar lighting, the twelve identities, icon language and stone/wood/soil materials. A fourteenth reference directs the representative merchant house. Inspect reference anatomy, silhouette and style before 3D conversion. Fourteen completed jobs are recorded.
2. Meshy image-to-3D produces textured source candidates. Preserve raw candidates and task receipts. Reduce topology while retaining UVs before auto-rigging; the original Cyborg candidate exceeded the rig upload limit and was replaced by a reduced input to the same finishing stage.
3. `tools/prepare_character.py` reduces humanoids to about 24k triangles, NPCs to 12k and the hound to 18k, packs textures and keeps original evidence. It does not certify deformation topology.
4. Auto-rig suitable bipeds and fetch selected idle/run/attack/dodge motion. `tools/assemble_humanoid.py` combines compatible clips, strips horizontal root travel, restores the source PBR surface and authors the collapse clip. Knight equipment is original weighted Blender geometry, with a tapered sword and clockwork shield crest. A 60Hz finishing bake corrects collapse contact and wrist clearance around the held equipment. The server owns movement.
5. `tools/rig_wolf.py` authors an 18-bone quadruped and six motion clips locally. The first weights stretched the tail and belly during the run pose. Continuous four-bone distance weights repaired the defect; the failed candidate and comparative pose images are retained. All six clips were subsequently reviewed in a live browser study and the recorded collapse pose was checked. This verifies the prototype pipeline, not production-quality quadruped acting.
6. `tools/prepare_house.py` reduces the 2,143,102-triangle Meshy merchant-house candidate to 18,000 triangles and corrects its compressed width to a 6.5×6.5×8.2m envelope. The original candidate and first narrow preparation are retained. The checked-in `merchant-house.blend` is an editable library, reused four times in the town; it is part of the environment delivery rather than a seventh standalone runtime file.
7. `tools/build_environment.py` builds the seeded gate, cobbles, bridge, pipe ruin, foliage and astrolabe assembly around that house library. Three generated albedos are paired with locally authored normal/roughness treatment. Small leaves follow twigs and use two triangles each; ferns replace the former rock-shaped shrubs. The gate arch, nearby canopies and merchant awning fade to preserve the gameplay view. Three shadowless light slots follow the nearest actual lantern locations; the traveller light is the fourth. Architecture and foliage are still checkpoint art.
8. `tools/pack_assets.mjs` validates/reconstructs degenerate zero tangents, quantizes mesh data and converts textures to WebP. Body textures are capped at 1024px; environment textures at 2048px to retain the house facade, while the existing authored surfaces remain 512px. It deliberately avoids flattening or merging animated hierarchies. Five character files and one environment file are packaged without a network decoder.
9. `tools/validate-runtime.mjs` runs Khronos validation over all runtime GLBs. Then inspect materials, scale, skin deformation, shadows, foot contact, effects and transparency in Babylon at the gameplay camera. Save actual frames and uncut motion. The [environment repair record](../artifacts/checkpoint/environment-repair.json) associates the before/after frames, provider task, proportion repair and performance preflight with their source fingerprints.

## Rebuild without purchasing generation

The checked-in runtime files are sufficient to run the game. Rebuilding the private provider-derived intermediate stages additionally requires the preserved local input files. Do not automatically resubmit missing generation jobs; recover the existing task by ID first.

Blender 5.2.1 LTS was used locally. Always pass `--python-exit-code 1`: Blender otherwise can report a successful process exit after a Python script failure.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/prepare_character.py -- INPUT.glb OUTPUT.glb 24000
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/assemble_humanoid.py -- PRIVATE_CLIP_FOLDER knight
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/rig_wolf.py -- PRIVATE_WOLF_RIG_INPUT.glb
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/prepare_house.py -- PRIVATE_HOUSE_SOURCE.glb
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/build_environment.py
node tools/pack_assets.mjs briar-gate knight cyborg wolf mara nemi
npm run validate:assets
```

The checked-in `.blend` files can also be exported directly, without the private provider downloads:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/export_authored.py -- briar-gate knight cyborg wolf mara nemi
```

This writes review candidates under `assets/source/private/authored-exports/` and leaves the accepted runtime files intact. Compare animation names, durations, materials and motion before promoting a candidate into `runtime-unoptimized/` and packing it. Exporting is not a new paid generation request.

The placeholder paths above must be replaced with known local files. The humanoid folder contains `rig-input.blend`, `idle.glb`, `run.glb`, `attack.glb` and `dodge.glb`; NPC assembly needs only source material and idle. `collect_meshy.py` polls/downloads already-submitted jobs; it does not create new paid tasks.

After an export changes, update the production override hashes, run `python3 tools/build_catalogue.py`, rebuild the browser and record a fresh `node tools/record-build.mjs` manifest. A changed model or material invalidates related visual/performance evidence until it is rerun. Keep rejected exports and the reason privately; never overwrite the only raw source.

## Known validator output

All six delivered GLBs currently have zero validator errors. Retained warnings include five environment surfaces without explicit tangents and six skinned-mesh nodes below a root. Imported bind transforms and deformed bounds must be reviewed in-engine; do not suppress those warnings to manufacture a clean report. A diagnostic also reports degenerate decorative environment triangles. The runtime output and exact issue list are in `artifacts/checkpoint/gltf-validation.json`.

## Rights and release

The prompts and Blender-authored scene/rig/equipment are retained. Generated assets are subject to the provider terms and the user's plan at generation time. Provider receipt IDs establish provenance; they do not themselves establish a blanket distribution license. Select the repository/distribution license and retain provider usage evidence before a public game release. The checkpoint does not copy 3 Kingdoms' proprietary art, maps, prose or music.

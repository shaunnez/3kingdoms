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

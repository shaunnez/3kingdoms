# THREEFOLD — Production plan

Version 3 · 1 October 2026 · **P1/P2 production authorized and underway.** The local Briar Gate checkpoint implements a representative slice. See the [current evidence and remaining gates](docs/checkpoint-status.md); the full-game requirements below remain mandatory.

THREEFOLD is a persistent desktop browser RPG about belonging to a guild, discovering strange places, and returning to a shared home. Fantasy, Science and Chaos meet in Highcross. Combat is real time, the world remembers progress, and players can attack one another everywhere outside towns and explicitly marked safe zones.

This plan develops the approved [concept](game-concept.md). All twelve guilds are required. Newly specified numbers, names and supporting rules below are **implementation defaults requiring playtesting**, not tested balance. The existing three [screen concepts](design/art-direction.json) remain the agreed visual direction; the browser checkpoint must demonstrate how closely it can match them. Their level 28 characters, figures and decorative icons are illustrative; Chapter One caps at level 20.

## Read the production package

| Document | Owns |
| --- | --- |
| [Combat and guilds](docs/combat-and-guilds.md) | All guild kits, progression, equipment, PvE/PvP and recovery rules |
| [PvP and outlaw rules](docs/pvp-and-outlaw-rules.md) | One/two-item loot, red-name timer, self-defence, guards and merchant refusal |
| [World and quests](docs/world-and-quests.md) | Maps, characters, creatures, encounter design and authored quest structure |
| [Screens and controls](docs/screens-and-controls.md) | Every screen, states, navigation, HUD, controls and accessibility |
| [Asset bible](docs/asset-bible.md) | Visual/audio standards, asset contracts, generation and Blender pipeline |
| [Content catalogue](design/content-catalogue.json) | Named entities, actions, maps, quests, equipment, rigs and reusable kits |
| [Asset manifest](design/asset-manifest.json) | Individually identified production deliverables, dependencies, budgets and status |
| [Architecture](docs/technical-architecture.md) | Browser, server, persistence, networking, security and operations |
| [Delivery and budget](docs/delivery-and-budget.md) | Estimates, stages, 48-hour experiment and acceptance matrix |
| [Development journal](devlog/index.html) | Milestones and labelled media; source entries in `devlog/posts/` |

The catalogue defines content identities; the manifest expands them into required files. A model record is not a completed model. Everything newly specified starts as `planned`. Existing images are `concept-only`. Changes to counts must update the catalogue, manifest and budget together. Run `python3 tools/build_catalogue.py` after changing catalogue source data, then `python3 tools/validate_plan.py`.

## What is being delivered

**Chapter One: The Missing Hour** is the first complete release target: levels 1–20, all twelve guilds, Highcross, its facilities, three early outdoor regions, three compact deeper adventures, three bosses, a cross-realm mystery, equipment/crafting, persistent multiplayer and unrestricted location-based PvP. Estimated authored first-character journey: 8–12 hours, a hypothesis to playtest. Jobs and new guild builds support repeat expeditions.

**Chapter Two: The Unwritten Accord** completes the currently named larger-world content: Crown of Winter, Glass Megacity and Unwritten Sea, levels 21–30, three further bosses, six quests and prestige. It is separately costed, still part of this world plan, and not represented as delivered by Chapter One. Housing, mounts, guild wars, auction-house speculation, procedural infinite worlds, mobile touch controls and live AI NPC dialogue are outside this baseline.

Chapter One does not mean three guilds. The early three-guild engineering checkpoint is explicitly incomplete. A finished room, an attractive screenshot, a generated model, or a successful local build does not satisfy a playable-game milestone by itself.

## The opening, minute by minute

| Time target | Player experience | Evidence of success |
| --- | --- | --- |
| 0–3 min | Arrive in Highcross, move, rotate once, help Nemi lift a fallen stall | Player can move and interact without hunting menus |
| 3–7 min | Gate spill releases a training-scale creature; evade its lane, interrupt its second cast | Player intentionally avoids and interrupts one attack |
| 7–10 min | Examine an astrolabe inscription; optional hidden token | Curiosity produces a real reward |
| 10–18 min | Browse twelve guilds, preview powers, take one short trial | Choice explained by mechanics, no twelve-trial chore |
| 18–22 min | Join at level 5, choose first mastery modification, prepare supplies | Identity and preparation feel consequential |
| 22–30 min | Choose any realm, pass the visible safety line, complete an initial job, return | Player understands open PvP and wants another expedition |

Training spaces are explicitly safe against player damage; scripted PvE remains possible. The introduction is not a concealed rule exception. It awards enough experience to reach five without grinding. Returning players may replay instruction or skip completed instruction on alts; the guild trial remains available.

## Why this should be fun

Three pillars guide cuts and refinements: distinctive guild decisions, discoveries with usable consequences, and expeditions whose tension resolves in a social home. Each region has two routes, one optional secret, one noncombat interaction and a reason to return. Every 5–15 minutes should offer a completed job, clue, useful item or new route, rather than only an experience bar.

Solo PvE is viable for every guild. Parties add combinations, not mandatory role slots. Ordinary same-level encounters target 10–25 seconds; elites 45–90 seconds; bosses 3–6 minutes. These are pacing targets, not measured facts. Initial PvP targets a 12–25 second duel with opportunities to interrupt, escape or reverse pressure. Surprise plus a numerical advantage should matter, but one invisible burst should not settle an equal-level duel.

Each guild receives a resource decision and two viable mastery directions. Rewards first alter decisions, then improve numbers. Quests require observation, asking about topics and presenting evidence; the journal preserves clues but does not reveal every solution. Graduated hints make a stuck evening recoverable.

Open PvP now puts actual equipment at risk: one eligible item from an ordinary victim, two from a red victim. Readable danger, retreat routes, protected starter/quest essentials, outlaw consequences and reliable recovery are essential to keeping defeat playable. Playtests must measure whether players return after losing a valuable item as well as whether combat is exciting.

## Decisions fixed by this plan's proposed defaults

- Camera: 50° downward perspective, near-isometric long lens, 90° rotation steps, bounded zoom; character approximately 9% of viewport height at default zoom.
- One active character guild at a time; free guild changes in Highcross after a short confirmation. Retain earned mastery, equipment and quest history; no respec payment during experimentation.
- Four-player parties; 16 players per wilderness instance and 32 per town instance as initial capacity targets. These are not proven limits.
- No party friendly fire; Companies grant no immunity. Leaving a party prevents rejoining it for 30 seconds, without granting damage protection.
- Safe areas protect both directions of interaction: players inside cannot harm or assist a fight outside. Projectiles, summons, traps and periodic effects obey the same server rule.
- World PvP retains level and equipment progression with bounded numerical advantage; arena stats are normalized separately. No consent flag outside safety.
- Death retains levels and mastery; PvP can transfer one eligible item, or two when the victim is red. Aggression/player-killer timers, hostile guards and merchant refusal follow the outlaw specification. Ten percent of unbanked expedition currency remains a separate personal recovery echo.
- Authored dialogue and clues. Generative tools are offline asset-production tools; the game has no inference dependency.
- TypeScript, Babylon.js, React DOM HUD, authoritative Colyseus server and PostgreSQL are the proposed stack. Validate engine/renderer choices in the early browser checkpoint before expansion.

## Completion and change control

The [acceptance matrix](docs/delivery-and-budget.md#acceptance-matrix) is the completion contract. All Chapter One rows must pass for a Chapter One release; all Chapter Two rows additionally pass for the full named-world baseline. Quality and fun require human playtesting. Automation cannot truthfully certify that a game is enjoyable.

For every milestone, record implemented scope, independently tested scope, missing scope, measured performance, exact commit, media and spend. Keep a clear evidence trail from asset reference to exported model to browser screenshot. The journal is updated when relevant work lands; no recurring automation or public-site deployment is created by this plan.

The user authorized adding project work to `shaunnez/3kingdoms`, accepted the direction and PvP revision, then explicitly instructed production to proceed with full permission for Higgsfield and Meshy. Cost and timeline optimization are secondary to a fun, high-quality result. The current work is P1/P2: prove the representative assets, rigging, combat and multiplayer rules in the browser before bulk production. Preserve unsuccessful evidence and repair failed checks. The separate 48-hour build experiment has not started. The development journal is hosted privately on ChatGPT Sites under the previously authorized audience policy.

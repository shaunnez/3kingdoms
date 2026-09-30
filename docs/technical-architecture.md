# Technical architecture and operating targets

This is a proposed architecture. No game runtime, database, service, provider generation job or deployment is created by this planning package. Version numbers will be pinned in a lockfile when implementation starts and compatibility is verified; do not assume a future package release behaves like today's documentation.

## Stack and boundaries

| Layer | Choice | Why / constraint |
| --- | --- | --- |
| Client | TypeScript, Vite, Babylon.js | Browser-first rendering, scene/animation/loading tools, explicit render lifecycle |
| Interface | React DOM over canvas, CSS tokens | Real accessible controls and reliable text/input; scene state stays outside React frame updates |
| Renderer | WebGL2 baseline, optional WebGPU after comparison | One visual feature set with scalable effects; WebGPU failure falls back, never blank screen |
| Game server | TypeScript on current supported Node LTS, Colyseus authoritative rooms | Small shared areas, state synchronization and reconnect lifecycle |
| Persistence | PostgreSQL, explicit SQL migrations and typed queries | Transactional inventory, quest flags, trade and rewards; no premature event-sourcing framework |
| Assets | GLB, KTX2 textures, hashed static bundles | Cacheable progressive scene loading; source metadata separate from runtime payload |
| Audio | Browser audio through engine/Web Audio, authored buses | Positional cues and synchronized adaptive stems, with user-gesture unlock |
| Identity | Standards-based hosted OIDC, Authorization Code + PKCE | Avoid bespoke password storage; select existing account-compatible provider before public release |
| Devlog | Static HTML/CSS and Markdown in this repository | Simple versioned milestone/media log, independent of game server and deployment |

Babylon's official [WebGPU documentation](https://doc.babylonjs.com/setup/support/webGPU) is the renderer reference; compatibility must still be measured on target hardware. Colyseus documents server-owned [state synchronization](https://docs.colyseus.io/state), [room lifecycle](https://docs.colyseus.io/room) and [reconnection](https://docs.colyseus.io/room/reconnection). These features support the design but do not supply this game's combat, safe-zone rules or durable transaction semantics automatically.

Start with one server process and one database. Add Redis presence/room coordination only when measured multi-process need exists. Do not begin with microservices, global sharding, a custom ECS framework or an unbounded content backend. Small modules with typed contracts are enough.

Proposed repository shape after build authorization:

```text
apps/client/                 bootstrap, engine scene lifecycle, UI, input, audio
apps/server/                 identity/session boundary, rooms, persistence, operations
packages/contracts/         versioned wire messages and schemas; public item/ability IDs
packages/simulation/        deterministic combat, movement, effects, PvE rules
content/                    validated authored gameplay data and compiled quest graphs
assets/runtime/             approved compact exports or hash-addressed fetch manifests
assets/source/              references to controlled source archives, not secret URLs
tools/                      content/asset validation, Blender exports, capture scripts
tests/                      contract, simulation, persistence, browser and load scenarios
docs/                       architecture, design and evidence reports
devlog/                     milestone source posts and static journal
```

Do not import server persistence into shared packages. Clients receive only visible game state and public content descriptions, never hidden quest solutions, moderation data or authentication secrets. Server-only puzzle answers may be inferred through play, but should not be bundled as an obvious answer list.

## Simulation and network contract

Server fixed-step target: 20Hz (50ms tick), movement snapshots initially 10–20Hz depending on measured payload. Render at monitor cadence. Predict local movement and immediate animation, interpolate remote actors with an initial 100ms buffer, reconcile against authoritative positions. Combat wind-ups use server timestamps. Client never declares that a hit succeeded, an item exists or a quest completed.

Input commands include protocol version, session/character identity bound by server authentication, monotonically increasing sequence, client tick, action ID and bounded target/aim parameters. Ignore client-supplied damage, inventory totals, guild unlocks and safe flags. Validate finite numeric values, range, line of sight, cooldown, resources, ownership, state and tick window. Reject stale/replayed sequences. Initial per-client ceilings: 30 movement intents/s, 10 action intents/s, 2 social messages/s burst 5, with measured adjustments. Logging a rejected action must not itself permit a denial of service.

Use capsule-on-navmesh movement with simple server collision and shared static obstacle data, avoiding divergent client physics. Projectiles use server paths and swept collision. World geometry versions and safe polygon hashes are part of the content build. Reconciliation cannot teleport through walls or enter protected areas by extrapolation.

For ranged validation, bounded lag compensation can rewind visible target transforms up to 150ms, but never rewinds current safety membership or resurrects dead targets. Actor history is server-generated. Default to current authoritative state for AOE/DoT and document this in latency tests. State replication uses an area-of-interest radius with margin; hostile cast sources must remain visible early enough for counterplay. Client fog hides undiscovered map art; server interest controls sensitive entity state.

Wilderness rooms target 16 players, 48 active AI, 32 summons maximum globally (including item-enabled echoes), with distance sleeping for idle AI. Each player has at most two combat summons; the repair drone and Echo count toward the cap. Town targets 32 players and 24 active nearby NPCs; crowds are visual reuse. Party matchmaking brings companions into the same compatible instance when out of combat; no private party dungeon grants immunity. Instance list/switch is accessible in town, with 60s transfer cooldown and combat-tag rejection. Capacity targets are accepted only after load tests.

## Atomic actions and persistence

Database entities: accounts, characters, guild_mastery, loadouts, items, inventory_slots, currency_ledger, quest_progress, discoveries, travel_anchors, recovery_echoes, reward_receipts, parties, companies, friendships, trades, reports and sanctions. Store item instance IDs, owner and slot with uniqueness constraints. Currency is integer-valued with nonnegative checks. Migrations are numbered and tested forward from the previous release; breaking content changes require an explicit compatibility mapping.

The [outlaw revision](pvp-and-outlaw-rules.md) additionally requires persisted outlaw remaining-time, aggression/self-defence events, causal support attribution, death snapshots, corpse claim ownership/quota/expiry, item escrow and immutable loot-transfer receipts. Use one transaction to enforce each corpse's one/two-item quota across concurrent looters, plus item-row locking to exclude equip/trade/sale/craft/drop races. Protected items never enter escrow; quest flags remain independent from a looted reward. Expiry returns unclaimed items safely; retry/reconnect cannot create or erase ownership. Merchant refusal is rechecked inside the transaction against authoritative status. Guard hostility is server NPC behavior, never a client-provided red flag or an exemption from town PvP safety. Pending offences and timer expiry use deterministic tick ordering; death and disconnect do not clear outlaw time.

Durable rewards, loot grants, crafting, banking, guild changes and trade confirmations commit before success is acknowledged. Use idempotency keys plus database unique constraints. A room saves transient position/vitals every 10s and on controlled exit; inventory/currency never rely on that periodic save. After process failure, reopen at last valid position or safe fallback without inventing missing money. State recovery must preserve pending transaction outcomes by receipt ID.

Trade protocol: both actors in range and not combat-tagged; reserve item instances/currency; version offer; both ready; both confirm same version; transaction locks affected ownership records in stable order; transfer both sides atomically; create one receipt; release reservations. A changed offer resets confirmations. Disconnect/timeout cancels uncommitted trade; committed trade remains queryable. Test two tabs and network retries rather than relying only on mocks.

Zone handoff uses a single-owner lease with fencing token. Prepare destination, persist a transfer record, acknowledge readiness, revoke source simulation ownership, commit destination ownership, then route client. Failure before commit leaves source authoritative; failure after commit reconnects to destination. No interval permits two actors or rewards from both rooms. Safe status is evaluated from the authoritative destination only after committed spawn.

Quest graphs are versioned authored data. Rewards reference a unique `(character, quest, completion-kind)` key. Per-player choices affect dialogue/permissions, not shared collision unpredictably. Discovered clues and character notes persist independently from active quest state. Loot bags use eligible-owner lists; dropping an item is a durable transfer to a server world object with expiry and recovery semantics.

## Identity, safety and operations

Local development may use a clearly labelled mock identity restricted to loopback; it cannot be enabled in a public build. Before public testing, choose a hosted OIDC provider, verify issuer/audience/signature/nonce and session expiry, use secure HttpOnly SameSite cookies with CSRF protection for mutations, validate WebSocket Origin and one-time join tickets, and rate-limit login/join. The provider selection is an operational dependency, not an excuse to expose development authentication.

Sanitize chat as text, limit length to 300 characters, escape display names and notes, block script/HTML insertion. Private tells require authenticated recipients; block/mute apply to chat, not world combat. Report categories include harassment, cheating and inappropriate name; store reporter/target, time, instance and relevant bounded evidence. Operator tools need separate permissions and auditable actions. Do not expose admin controls in client UI via a hidden key.

Log build/content version, request ID, room ID, opaque character ID, action/transaction ID, validation failures and latency. Never log credentials or full private chat by default. Reports may retain a narrow player-submitted context for 30 days under an explicit privacy policy; normal logs target 14 days, performance aggregates 90 days. Export public devlog evidence with player aliases and consent for identifiable participants. Retention is a proposed policy requiring review before a public service, not legal advice.

Operations baseline: TLS reverse proxy, separate static asset delivery and WebSocket origin, secrets in host secret store, restricted database network, automated backups daily with point-in-time recovery where the chosen host supports it. Target recovery point ≤15 minutes for infrastructure disaster and recovery time ≤2 hours for a small playtest; verify by restore drill before claiming them. Normal room crashes should lose no committed transactions.

Deployment builds one immutable client/server/content version with hashes. CI gates types/lint/build, contract/simulation tests, database integration and asset validation. Staging uses isolated accounts/data; run two independent browser clients. Drain rooms before compatible server upgrade; incompatible protocol advertises maintenance and refuses mismatched joins. Roll back executable and content manifest together; forward-only database changes must remain compatible with one previous release or include a tested recovery procedure. Paid hosting/public activation requires a separate explicit instruction.

## Performance targets and evidence

| Scenario | Test configuration | Gate |
| --- | --- | --- |
| Recommended desktop | Windows 11, Ryzen 5 3600, GTX 1660 6GB, 16GB RAM; 1920×1080 medium | Median ≥60fps, p95 frame ≤20ms, p99 ≤33ms over 10min combat |
| Minimum Mac | Apple M1 8GB, current supported macOS, 1280×720 low/medium | Median ≥30fps, p95 ≤40ms, p99 ≤66ms; no critical missing effects |
| High visual comparison | Recommended or better, 1080p high | Best match to reference; still ≥45fps median; never required for fair cues |
| Town density | 32 players, 24 nearby NPCs, guild looks varied | Same preset gates with LOD, no repeated >100ms stalls after warmup |
| Wilderness stress | 16 players, 48 AI, 32 summons, eight simultaneous signatures | Same minimum gates; telegraphs and cast sources remain legible |
| Room CPU | 16 clients and maximum encounter population | Tick p95 <15ms, p99 <25ms within 50ms step; no growing queue |
| Network | 100ms RTT, 20ms jitter, 1% packet loss simulated at transport | No duplicate actions/rewards; movement reconciles within 0.5m for p95 samples; no safety violations |
| Higher latency | 200ms RTT and 2% loss | Playable with warning; no integrity loss; document experience degradation |
| First load | Cold cache, 25Mbps/50ms RTT, recommended machine | ≤20 MiB to first controlled town view, interactive ≤15s, no unexplained blank stage |
| Warm load | Cached common assets, same machine | Character controllable ≤4s after authenticated join |
| Realm transition | ≤12 MiB new streamed assets with common rigs cached | Target ≤6s; body/transfer semantics shown honestly |
| Memory | 30min, six zone round trips | Client JS heap ≤300MiB target, estimated GPU resources ≤512MiB medium; retained-resource growth <5% after settle |
| Content draw budget | Representative medium camera | ≤300 draw calls, ≤1.5M visible triangles, one shadowed sun, ≤4 shadowless local lights |

GPU memory estimates are derived from resource formats/dimensions when browser measurements are unavailable; label estimates separately from measured heap. Device models here are benchmark targets, not machines claimed to be tested. Record exact OS, browser version, viewport/DPR, renderer, commit, content hash and preset with every report. Cap DPR at 1.5 medium; low at 1; dynamic resolution must never scale DOM text.

Support latest two stable desktop Chrome/Edge and current stable Firefox/Safari at release, with WebGL2 fallback. Verify actual versions then; no mobile or outdated-browser performance claim. Handle context loss and restoration, tab suspend/resume, audio re-unlock and resize. Background tabs cannot accumulate queued actions or accelerated simulation.

Use pooled VFX/projectiles, instance static props, light/probe budgets, animation LOD and warm shader preparation in the loading stage. Avoid rebuilding React HUD components each frame; bind only to changed snapshots at a suitable UI cadence. Dispose scene resources through explicit ownership; asset caches use byte budgets and reference counts. Test leak behavior through repeated map visits.

## Engineering acceptance

Simulation tests cover timed hits, cancels, resources, every control category and all twelve guild mechanics; property-style tests cover no negative currency, no duplicate ownership, and safety invariants for every damage transport. Database tests include concurrent trade confirmations, reward retries and failed handoff. Browser tests cover real movement/target/interaction, full panel states, reconnect, two-client PvP, safe entry with projectiles and summons, and actual audio/visual checks.

Metrics and videos supplement assertions rather than replace them. A bot match proves only its scripted path. Human playtests prove comprehension and enjoyment provisionally; no claim of balance from one match. No game tests have been run as part of this document-only task.

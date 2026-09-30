# The Briar Gate — production checkpoint

1 October 2026 · P1/P2 · Local build `0.1.0-briar-gate`.

The first playable THREEFOLD scene now runs in a browser. Walk from Highcross through the Briar gate, speak to Mara, fight hounds, examine the epitaph and return with a clue. Knight and Cyborg are practice kits. The other ten guilds remain in the approved catalogue and the in-game codex; they have not been quietly removed from the game scope.

The user explicitly authorized Higgsfield and Meshy and instructed work to continue. This checkpoint exercises the production pipeline before bulk generation. The separate 48-hour build experiment has not started.

## Run and inspect

From the repository root, use Node 22.12+:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4177/`. A production-bundle preview is available with `npm run build` followed by `npm run preview` at `http://127.0.0.1:4181/`; keep the game server running on port 2567. Each browser tab creates its own local character identity. Refreshing the same tab reconnects that identity.

Append `?lab=1` to expose the local field tools. These route ordinary movement and ability commands through the same server protocol as keyboard play. Capture, material-study and rendering-crowd tools are explicitly separate from gameplay. There is no client command for granting items, teleporting or changing PvP outcomes.

| Control | Action |
| --- | --- |
| WASD / arrows | Move |
| Right-click ground | Walk to point |
| Click actor / Tab | Select target / cycle creatures |
| F, held | Basic attack |
| 1–5, R, Q | Guild actions, signature and defence |
| Space | Evade; two charges, one recovered every seven seconds |
| C | Break stun/root |
| E | Context interaction |
| I, G, H | Inventory, twelve-guild codex, help |
| [ / ], wheel | Rotate camera / zoom |
| Esc | Stop movement or close panel |

## Implemented slice

- One contiguous 40×100m environment: 40×40m Highcross corner and 40×60m Briar route, with two river crossings, refuge, market, gate, pipe ruin, foliage and epitaph.
- Five generated/finished bodies: Knight, Cyborg, hound, Mara and Nemi. Knight/Cyborg have idle, run, attack, evade and collapse clips; the custom quadruped has idle/walk/run/attack/dodge/death. NPCs have idle and collapse. Shared rigs and source Blender files are retained.
- Live React HUD over Babylon rendering, target/cast information, safe-area state, resource and experience, outlaw timer, quest log, inventory, corpse claims, merchant dialogue, death/recovery, controls and sound settings.
- Authoritative movement, collisions, targeting, windup/commit, cooldowns, resources, travelling pulse shots, line attack, mine arming, shields, healing, evade and crowd-control escape. Three hounds chase, telegraph and fight. Kills award experience and marks.
- One clue expedition with a single-use reward. It is a representative quest, not the complete Missing Hour story.
- PvP outside safe places, red status on aggression, ten connected minutes for aggression and sixty for a player kill; lawful retaliation and hunting a red target are exempt. Timer pauses offline. Town guards pursue red players; the merchant refuses them.
- Downed interval, slow crawl, four-second ally revive, revive lockout, corpse escrow and one/two-item quotas. Starter/quest essentials are protected. Claims require proximity and an uninterrupted channel; unclaimed items return after expiry. Duplicate and replayed claims cannot duplicate an item. Three actual browser transfers remain in the [sanitized durable receipt ledger](../artifacts/checkpoint/pvp-claim-receipts.json).
- Server-held local persistence and reconnect. Offline bodies remain vulnerable through the combat/logout interval.
- Original synthesized ambience, movement, attacks, impacts, healing and loot sounds. No microphone recording, paid audio vendor or runtime AI inference.

## Evidence and gates

The [build manifest](../artifacts/checkpoint/build-manifest.json) hashes runtime source, package lock and asset files. Tests and captures must be assessed against that exact build, not whichever source is edited later.

| Gate | Current evidence | Limit |
| --- | --- | --- |
| Generation recovery | 13 Higgsfield references and 17 completed Meshy tasks; sanitized recovery IDs and hashes retained | Provider completion does not certify game-ready quality |
| GLB validity | Six runtime files, zero Khronos errors and eleven retained warnings | Imported skin roots and decorative tangent issues still need visual review |
| Rules and transport | 30 checks passed, including independent real WebSockets, durable item claims, reconnect, capacity and identity races | Loopback, not impaired internet or production database |
| Two actual browser clients | Town rejection, red aggression, guard pursuit, clean victim one-item transfer, red victim two-item transfer, lawful hunter stays clean, merchant refusal, refuge respawn | Two tabs in one Chromium instance; full guild/party/summon matrix is later work |
| Uncut expedition | [75-second actual browser recording](../artifacts/checkpoint/captures/briar-gate-expedition.mp4), including town, combat, bridge, clue and return | Field tools send ordinary inputs; this character revisits an already-completed quest |
| Custom wolf motion | Six clips inspected live; [18-second study excerpt](../artifacts/checkpoint/captures/hound-motion-study.mp4) and deformed bounds retained | Prototype weighting/acting; not a playable Changeling transformation |
| Elemental surfaces | [Four materials in the browser](../artifacts/checkpoint/captures/2026-09-30T13-14-34-125Z-38faf925.png): emission, water, air and opaque earth | Deliberately simple silhouettes, not finished guild art |
| Sustained renderer | 600.43s: median 116.10fps; uncapped frame p95 9.70ms / p99 10.40ms; 208 p95 draws, 1,393,019 maximum active triangles; no hidden samples | Apple M5 / Chromium 154 / WebGL2, synthetic crowd. Worst frame 358.10ms, cause unestablished. Not M1 qualification or a full networked battle |
| Repeated load/unload | Final-build thirty-minute trace pending; earlier baseline retained | Count/heap stability is not a GPU-memory measurement or real zone transition test |
| Visual target | Follow camera, equipment grounding, HUD portrait capture, gate fade and canopy obstruction repaired | Environment richness and motion remain below the approved image targets; no final art acceptance |
| Human fun and readability | Not run | Requires a person playing without developer guidance |

Detailed scoped results and build associations are recorded in [acceptance.json](../artifacts/checkpoint/acceptance.json). The engineering slice is playable; P2 art acceptance remains open. This does not authorize a completed P2 quality claim or bulk generation.

## Architecture choices and limits

Babylon.js renders GLBs with PBR textures, shared animation containers, shadows, HDR bloom and instanced crowd proxies. The DOM HUD remains selectable and keyboard accessible. Quantized meshes and WebP textures avoid a remote decoder dependency. Asset originals and production exports are separate.

Colyseus accepts typed, sequence-numbered inputs, runs a 20Hz authoritative simulation and sends 10Hz snapshots. The server validates movement, range, safety, resource cost and item ownership. It enforces a single 16-player room, rejects duplicate identities and limits input rate and size. The renderer interpolates server state; it cannot commit damage or inventory changes.

For this local checkpoint, identity is an anonymous per-tab token and durable state is an atomically replaced mode-0600 JSON file under `.local/`. This preserves repeatable development and recovery without pretending to implement production accounts, transactional PostgreSQL inventory, horizontal room ownership or anti-abuse operations. HTTP and WebSocket bind to loopback. Do not expose this checkpoint server publicly. The [production architecture](technical-architecture.md) still governs the next stage.

The transport benchmark completed 600.45 seconds with 16 clients and 80 AI-cost fixtures: tick p95 10.32ms and p99 13.13ms, within the 15ms/25ms targets. The first run missed p95 at 17.82ms; profiling identified serialization cost, and sending each combat event once reduced redundant work. The browser preserves the two-second presentation history locally. Both reports are retained. Thirty-two of those fixtures stand in for summon simulation cost; they do not implement complete summon behavior. The renderer crowd is a separate workload with 16 player bodies, 48 hounds and 32 low-poly summon proxies. Combining two separate traces is not proof of a full end-to-end 96-actor battle.

The actual browser PvP recordings show [the attacker](../artifacts/checkpoint/captures/outlaw-two-item-claim.mp4) and [the victim](../artifacts/checkpoint/captures/outlaw-victim-view.mp4) in the same encounter. Two items were transferred through the ordinary three-second claim channel; both clients received matching receipts and the quota reached zero. Those recordings precede the canopy fade repair and retain the obstruction that motivated it. [Nemi's refusal](../artifacts/checkpoint/captures/2026-09-30T13-07-49-832Z-d574227f.png) was received while Vex was alive; the captured frame was saved just after the guard killed him.

Current build fingerprint: `5267608d4f38e8d0cbb9fe46fbf768654ddc340bae30294bfeb57033be11cd2c`. The normal camera is alpha -1.7508, beta 0.72, radius 22; follow now preserves those values. Render fixture captures and ordinary gameplay are labelled separately. The prototype cannot be approved against a cinematic camera alone.

The local production preview's resource timing reported approximately 11.58 MiB across unique observed transfers and assets ready about 1.16 seconds after navigation. This includes local capture code subsequently requested and is not the specified 25Mbps/50ms cold-cache experiment. The preview serves gzip and measures the actual delivered bytes; public cache/CDN behavior is untested. Runtime dependency advisory audit reported zero known vulnerabilities at this checkpoint, which is not a security certification.

## Remaining game work

Neither practice kit implements its full exploration utility, mastery, trials or equipment variants. Healing field/drone presentation currently resolves as self support; party fields and destroyable drone AI remain. Party membership, chat, banking, trade, crafting, authentic account login, PostgreSQL transactions, room transfer, complete guild resource mechanics and the other ten playable guilds are future stages. Cooldown/CC balance and ability-specific recovery motion need playtesting.

The hound is a quadruped pipeline representative, not a playable Changeling transformation. The four-material Elemental preview is a material/alpha study, not a finished body. Most of the 2,194 required asset units remain planned. All 25 scenes, 44 quests and 117 actions retain their specified identity and acceptance requirements.

The next art repair should improve the town composition and lighting, replace the coarse vegetation language, and give attacks/recovery more convincing motion. Keep the same ordinary camera and compare a matched frame before expanding the asset batch. The art still needs more convincing architecture, foliage, surface variation and grounded motion. Generic bloom, generated textures or an attractive still cannot substitute for readable fighting and a coherent world at the ordinary gameplay camera. Key remapping, a complete accessibility pass and unsupported-browser handling also remain.

## Consumption and provenance

Higgsfield: 13 completed reference jobs, estimated at 2.75 credits each, **35.75 credits estimated**. This is the returned per-job estimate, not a verified billing ledger. Meshy: **194 consumed credits** across 17 completed jobs, taken from provider receipts. Idle animation action 0 is charged at three credits; it was not free. An initial oversized Cyborg rig request failed before returning a task ID; no unverified zero-charge claim is made for that failed request.

See the [Higgsfield receipts](../artifacts/checkpoint/higgsfield-receipts.json), [Meshy receipts](../artifacts/checkpoint/meshy-receipts.json) and [production pipeline](asset-production.md). No account balances, credentials or signed download URLs belong in public evidence. No verified currency conversion is available.

## Delivery state

Local source, local checks, GitHub publication and ChatGPT Sites publication are independent outcomes. The journal retains its owner-private audience. Its deployed source version is recorded in [devlog/site.json](../devlog/site.json). A local game URL is not an internet deployment of the game.

The next production decision follows the completed browser and rigging evidence. Any failed quality or correctness category gets a concrete repair and rerun before expanding the asset batch. Human playtesting remains necessary to decide whether the combat and equipment risk are enjoyable.

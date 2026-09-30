# THREEFOLD — Game Concept

Status: approved concept baseline, incorporating the user's guild, open-PvP and item-looting/outlaw changes on 30 September 2026. Detailed supporting defaults are in [PvP and outlaw rules](docs/pvp-and-outlaw-rules.md).

This document defines the game concept, world, player experience, screen inventory, and creative direction. It is the reference for the subsequent visual designs and full game production plan. It is not the implementation plan or evidence that the game has been built.

## Confirmed direction

- Build a persistent, browser-based, graphically ambitious 3D RPG closely inspired by 3 Kingdoms MUD.
- Use cinematic isometric 3D with zoom and limited camera rotation.
- Preserve the Fantasy, Science, and Chaos structure, a shared social home, distinctive guilds, deep progression, exploration, NPC interaction, mysteries, and community.
- Include **all twelve full guilds in this concept**, plus the starting Adventurer guild. The twelve are required game scope, not optional future additions.
- Enable **open-world PvP at any time outside towns and explicitly designated safe zones**. Ordinary wilderness questing does not grant immunity. PvP does not require an opt-in flag or a duel request outside protected locations.
- Give quality assets, responsive controls, a strong HUD, readable combat, atmospheric sound, and fun moment-to-moment play equal importance with content breadth.
- Complete the visual design and full game plan before asset production and the proposed build of up to 48 hours.

The latest guild and PvP decisions supersede the original proposal to defer nine guilds and limit PvP to consensual duels or specially entered battlegrounds.

## The player promise

You begin as an ordinary adventurer, discover a guild that changes how you play, and gradually become someone other players recognise.

The defining experience:

> You leave town to investigate a haunted bell. An hour later, you are exploring an abandoned reactor with a necromancer and a cyborg because the ghost inside the bell remembers being a machine.

Discovery, strange connections, character depth, and community are the centre of the game. Combat and progression give discoveries consequence, while a familiar social home makes expeditions feel like departures and returns.

## Relationship to 3 Kingdoms

The official 3 Kingdoms material establishes Pinnacle as a shared home, three contrasting realms, highly distinctive guilds, and quests involving exploration and puzzles alongside shorter missions. THREEFOLD preserves these foundations while introducing original locations, characters, stories, and assets. Highcross fills Pinnacle's role.

| Preserve closely | Graphical interpretation |
| --- | --- |
| Fantasy, Science, and Chaos | Three coherent visual worlds connected through one town |
| Guilds define character identity | Different resources, abilities, equipment rules, progression, and guild halls |
| Inspecting and manipulating the world | Examine, search, listen, talk, give, and use-item interactions |
| Character and guild advancement | Separate world experience and guild mastery |
| Challenging quests and secrets | Environmental clues, multi-step mysteries, hidden passages, unusual rewards |
| Persistent social community | Recognisable characters, parties, trading, guild channels, shared events |
| Knowledge accumulated through play | Discoveries that remain useful on later visits |

Starting as an Adventurer and choosing a full guild at level five follows the original structure. Proposed abilities, named content, combat timing, death rules, and PvP rules in this document are THREEFOLD design choices, not claims about the current MUD's exact rules.

Sources: [3Kingdoms overview](https://www.3k.org/about/3kingdoms/index.php), [realms](https://www.3k.org/realms/index.php), [official guild guide](https://www.3k.org/guilds/index.php), and [We Mud Together guild explanation](https://wemudtogether.com/guilds/).

Research limitation: the supplied [Fandom wiki](https://3kmud.fandom.com/wiki/3_Kingdoms_MUD_Wiki) blocked direct access during concept research. Official pages were the main source; indexed wiki material was supplementary. Historical wiki details should not be treated as verified current mechanics without checking them.

## World and story

Highcross stands around an ancient device that keeps three incompatible realities connected. Recently, people have begun receiving memories from their other possible lives. The device is failing, and someone is deliberately accelerating it.

This supplies an overarching mystery without making every adventure about saving the universe. Players still encounter petty thieves, eccentric shopkeepers, haunted households, guild rivalries, and dangerous wildlife.

The world should feel intimate before it feels enormous. It consists of connected, handcrafted areas. Roads, gates, lifts, caves, and strange thresholds make transitions part of the journey.

### Highcross

Highcross is a safe town and the shared social home.

- **The Three Gates:** the unmistakable centre of town and entrances to the realms.
- **The Lantern & Circuit:** an inn where adventurers gather and hear rumours.
- **Guild Row:** physically distinct halls, trainers, and practice spaces for the full guild roster.
- **The Exchange:** merchants, crafting, banking, and player trade.
- **The Understeps:** cellars, tunnels, and an early mystery. Boundaries between the safe town and any dangerous connected areas must be explicit.
- **The Concord Arena:** organised competition in a separately entered combat space outside the town's protected rules. Safe spectator areas must remain clearly distinguished.

Players learn the town by landmarks. New guild facilities should fit its geography without burying every service in menus.

### Realm map

| Realm | Early region | Deeper region | Later destination |
| --- | --- | --- | --- |
| Fantasy | **Briar March:** rain-dark forests, toll roads, standing stones, predatory packs | **Hollow Abbey:** ruined sanctuary, flooded crypts, spectral knights | **Crown of Winter:** mountain settlements, an ancient dragon, a city beneath the ice |
| Science | **Rustwater Verge:** flooded industry, salvage camps, malfunctioning machines | **Station Nine:** sealed transit complex, security systems, reactor chambers | **The Glass Megacity:** corporate enclaves, synthetic citizens, an orbital elevator |
| Chaos | **The Wrong Fair:** a midnight carnival where bargains alter reality | **Mirror Theatre:** living performances, stolen identities, rooms that repeat actions | **The Unwritten Sea:** floating islands, impossible tides, unfinished worlds |

All three early regions become accessible after the introduction. Fantasy is not compulsory before Science or Chaos.

Conceptual connections:

```text
                              HIGHCROSS
                         Safe town and guilds
                        /         |          \
                 FANTASY       SCIENCE       CHAOS
                Briar March  Rustwater Verge  The Wrong Fair
                     |            |               |
                Hollow Abbey  Station Nine   Mirror Theatre
                     |            |               |
              Crown of Winter Glass Megacity Unwritten Sea
```

Maps reveal explored terrain and discovered landmarks. Secret entrances remain unmarked until found. Discovered travel anchors shorten repeat journeys; they do not replace the initial exploration.

Each area needs a memorable landmark, an optional detour, an interaction beyond combat, and a reason to return. Maps and world signs must clearly identify town and safe-zone boundaries, because leaving them permits PvP.

## Opening and gameplay loop

The first 30 minutes establish the game's main pleasures:

1. Arrive in Highcross during a small gate malfunction.
2. Learn movement and interaction by helping someone trapped beneath fallen market stalls.
3. Fight an escaped creature; use a defensive ability and interrupt its obvious attack.
4. Discover an optional reward by examining something curious.
5. Meet guild representatives and try powers in short training encounters. The introduction need not force twelve trials in sequence.
6. Reach level five and choose a full guild.
7. Select a realm expedition from rumours gathered in town, understanding that PvP becomes possible outside protected locations.

Recurring loop:

**Hear something interesting → prepare → explore → make discoveries → overcome danger → return with a meaningful reward → develop your character.**

A short session can finish a local job. A longer session can solve a mystery, complete a dungeon, or join a group expedition. Open-world player encounters add uncertainty to preparation and travel.

## All twelve full guilds

Guilds are character disciplines. Player-created social organisations are called **Companies**, keeping the two concepts distinct.

All twelve guilds below belong in the completed game. They must have actual playable identities, progression, visuals, and abilities; menu entries or reskins do not satisfy that requirement. The Adventurer is the starting guild before selecting one of these twelve.

| Guild | Core identity and mechanics | Visual direction |
| --- | --- | --- |
| **Knight** | Resolve earned through successful defence; protection, interruption, committed melee attacks | Weathered plate, cloth standards, engraved shields, restrained oath magic |
| **Cyborg** | Heat management, pulse attacks, deliberate venting, configurable implants | Visible human features, ceramic armour, exposed mechanisms |
| **Necromancer** | Essence, curses, spirit commands, sacrificing or preserving summons | Layered robes, funerary ornaments, spectral companions, bone and bronze |
| **Mage** | Prepared spells and elemental combinations | Arcane implements, layered fabrics, readable geometric spell forms |
| **Monk** | Stances, counters, movement, unarmed combat | Unencumbered silhouette, wraps and travelling clothes, precise physical animation |
| **Priest** | Vows, healing, wards, divine consequences | Distinct sacred symbols, ceremonial equipment, protective light |
| **Bard** | Layered songs and party coordination | Instruments, practical adventuring clothes, rhythmic visual and audio cues |
| **Changeling** | Learned creature forms with combat and exploration uses | Recognisable forms and readable transformations; animation appropriate to each body |
| **Elemental** | Transformations and environmental manipulation | Fire, water, air, and earth expressed through silhouette, material, and motion |
| **Psion** | Control, displacement, mental defences | Restrained equipment, distortion, focused mental projections |
| **Symbiont** | Adaptation through different host forms | Organic connections between host and symbiont; distinct adaptive silhouettes |
| **Powered Armour** | Heavy weapons, armour configurations, squad tactics | Heavy mechanical suits, weighty movement, visible weapon configurations |

Powered Armour is a working guild label. Final guild names, detailed kits, resources for the remaining nine guilds, equipment restrictions, advancement curves, and PvP counters belong in the full design plan.

Knight, Cyborg, and Necromancer remain useful early implementation references because they exercise melee protection, ranged resource management, and summons. That implementation order does not reduce the required twelve-guild scope.

### Initial detailed ability concepts

Each guild has a basic attack, a defensive action, exploration utility, five equipped abilities, and a signature ability. The final plan should validate this common control structure against transformations, songs, summons, and other guild-specific needs.

| Guild | Five equipped abilities | Signature ability |
| --- | --- | --- |
| Knight | **Sunder:** armour break. **Shield Bash:** interrupt. **Challenge:** pressure an enemy. **Interpose:** protect an ally. **Rally:** recovery field. | **Last Oath:** brief stagger resistance and empowered defensive actions |
| Cyborg | **Pulse Lance:** piercing shot. **Mag Clamp:** brief immobilisation. **Arc Mine:** control a route. **Coolant Burst:** vent heat and slow nearby enemies. **Repair Drone:** limited recovery. | **Overclock:** powerful attacks at rapidly increasing heat |
| Necromancer | **Grave Bolt:** ranged attack. **Wither:** weakening curse. **Raise Echo:** summon a spirit. **Soul Tether:** command focused pressure. **Consume:** sacrifice a spirit for recovery. | **Procession:** a short, directional advance of spectral dead |

Guild advancement changes behaviour. For example, a Cyborg can make Coolant Burst create protective cover or turn it into an aggressive shattering attack.

PvP adaptations must preserve player control and meaningful counterplay. For example, a Knight's Challenge can pressure a rival's attacks against allies rather than forcibly controlling the rival's movement or target selection.

## Combat

Use real-time movement with soft target selection. Basic attacks can repeat while engaged; the player directs abilities, defensive timing, positioning, and target changes. This preserves some MUD combat rhythm while making encounters visually active.

- Ordinary fights initially target roughly 10–25 seconds, subject to playtesting.
- Elites introduce a mechanic that demands a response.
- Bosses combine previously learned mechanics.
- Enemy attacks have readable wind-ups, shapes, and sounds.
- Interrupts, armour breaks, cleansing, displacement, and retreat matter.
- Damage numbers remain secondary to animation and effects.
- Friendly effects must not conceal enemy danger or another player's attacks.

Example encounter:

> A shielded machine advances while two drones repair it. The Knight interrupts its charge. The Necromancer sends a spirit after a drone. The Cyborg vents coolant across the machine's route, then fires through the exposed core.

### Enemy families

| Enemy family | Distinct behaviour |
| --- | --- |
| Briar hounds | Circle and attack from different directions |
| Toll-road raiders | Archers retreat behind shield carriers |
| Abbey revenants | Reform unless their binding is disrupted |
| Salvage drones | Repair allies and prioritise damaged machinery |
| Reactor constructs | Telegraph attacks through heat and exposed components |
| Carnival performers | Switch between clearly communicated rules |
| Mirror creatures | Repeat a limited sequence of the player's recent actions |

### Boss concepts

- **The Bellbound Warden:** fights to a rhythm; discovering a lost verse changes the encounter.
- **The Station Nine Custodian:** weaponises its reactor, security shutters, and coolant systems.
- **The Master of Revels:** changes arena rules through theatrical acts.

Bosses need strong silhouettes, readable attack poses, distinctive sound cues, and dedicated signature sequences.

## Progression, equipment, and economy

Character level improves general capability. Guild mastery unlocks deeper mechanics. Exploration skills expand what the player can discover. Quest points recognise completed mysteries.

- **Levels 1–5:** introduction and guild trials.
- **Levels 5–20:** first chapter, three realms, complete initial builds.
- **Later chapters:** additional regions, greater guild depth, and prestige.
- **High Mortal-style prestige:** earned through advancement and significant discoveries, granting titles, visual identity, and useful privileges.

Equipment should frequently change decisions:

- **The Bellkeeper's Blade:** interrupting releases a resonant burst.
- **A configurable drone module:** trade healing strength for wider coverage.
- **A funerary lantern:** support an additional weaker spirit.
- **The Glass Compass:** reacts near unread inscriptions.

Persistent equipment, inexpensive early experimentation, and clear comparisons keep progression approachable. Crafting combines materials from different realms through smithing, engineering, enchanting, and cooking.

Guild-specific equipment, forms, and implants must provide equivalent progression opportunities without forcing every guild into the same weapon-and-armour model.

### Death and recovery

Death creates tension through party revival, sanctuary recovery and risk to carried equipment. Levels and guild advancement remain protected. On a PvP kill, the killer may loot one eligible item; a red-name victim exposes two. Starting unlawful aggression marks a player red for a timer, guards attack red players on sight and merchants refuse service.

This supersedes the initial no-equipment-loss proposal. The [outlaw specification](docs/pvp-and-outlaw-rules.md) defines proposed timer durations, eligible equipment, self-defence, corpse claims, guard behavior and recovery; these supporting details remain tunable. Ordinary PvE death does not expose gear unless the victim is red under the proposed red-death rule.

## Quests and NPC interaction

Substantial quests reward observation, exploration, reasoning, and discoveries. Short missions provide momentum and useful rewards. Quest-critical dialogue is authored and consistent.

NPC interaction includes asking about discovered topics, presenting evidence, giving items, trading, training, and responding to reputation. Opening dialogue, inventory, or a journal does not pause a multiplayer world or create PvP immunity outside a safe zone.

| Quest | What the player does | Meaningful reward |
| --- | --- | --- |
| **The Thirteenth Bell** | Examine a silent bell, connect inscriptions with a remembered melody, uncover a concealed crypt | A named relic and an alternative approach to the abbey boss |
| **A Light for Rustwater** | Restore a damaged grid and choose which service receives its limited power first | Local reputation and a different route or service |
| **The Man Who Died Tomorrow** | Follow a forest epitaph, a machine prediction, and a stolen carnival memory across all three realms | A major story revelation and a build-changing relic |
| **The Stolen Shadow** | Identify which carnival performer is wearing someone else's shadow | A disguise utility and access to a hidden performance |
| **An Oath Without Witnesses** | Complete the Knight initiation where the easiest victory breaks the stated oath | Guild advancement with a consequential choice |

Short missions target 5–15 minute adventures: defeat a pack leader, investigate a missing courier, retrieve an unstable component, or escort a vulnerable NPC.

The journal records observations, people, and clues. Optional hints become progressively more explicit. Important puzzle information always has a visual or textual alternative to sound.

### Recurring cast

| Character | Role and visual identity |
| --- | --- |
| **Mara, Bellkeeper** | Weathered traveller with a bronze prosthetic hand; remembers a missing verse |
| **Orren Vale** | Knight mentor in repaired ceremonial armour; judges decisions more than bravado |
| **Dr. Ilex** | Cyborg surgeon with precise mechanical fingers and an unsettling bedside manner |
| **Mother Sable** | Necromancer archivist who treats the dead as people with unfinished business |
| **Patch** | Small salvage robot carrying an oversized pack; cheerful local guide |
| **Nemi** | Innkeeper who remembers adventurers and introduces rumours |
| **The Velvet Usher** | Immaculate, masked carnival attendant whose shadow behaves independently |
| **The Cartographer** | A recurring explorer mapping places that should not coexist |

The full guild roster also requires mentors or equivalent initiation characters for the remaining guilds. Their names and individual story arcs are to be designed rather than inferred from this initial cast.

## Multiplayer and open-world PvP

The game remains enjoyable alone, with PvE encounters designed for solo players or parties of up to four. Shared town spaces, small shared adventure instances, party invitations, trading, guild channels, friends, emotes, and cooperative events create community.

### Confirmed PvP rule

**Players can fight other players at any time outside towns and explicitly designated safe zones.**

- Wilderness PvP is enabled by location; there is no consent prompt or opt-in flag.
- Ordinary questing, gathering, travelling, or opening a menu does not create immunity.
- Entering a dungeon or another instance does not automatically make it safe. Any protected location must be explicitly designated and visibly communicated.
- Towns and marked safe zones prevent player-versus-player damage, including indirect attacks through summons, projectiles, traps, and area effects.
- The HUD and map communicate whether the current location is protected or PvP-enabled.
- Safe-zone boundaries must be visible and consistent with server-enforced rules.
- Organised duels and arena matches supplement open-world PvP. A combat arena must be a distinct non-safe space rather than silently overriding town protection.

The previous safe-wilderness and opt-in-battleground proposal is superseded.

### Supporting rules in the production plan

Open-world PvP is a core rule. The production plan and [outlaw revision](docs/pvp-and-outlaw-rules.md) supply explicit proposed defaults for the following details; they must not silently introduce broad wilderness immunity:

- Party and Company friendly-fire rules, target selection, and accidental attacks.
- Level and equipment advantages in world PvP; guild matchups, crowd-control limits, and escape options.
- Aggression tracking, combat logout, disconnect recovery, and behaviour at safe-zone boundaries.
- Respawning, camping pressure, and access to corpse or expedition-reward recovery.
- Kill rewards and penalties, including prevention of repeated-kill reward farming.
- Required red-name aggression/player-killer status, timer, guard response and merchant refusal; a separate bounty economy is optional later scope.
- Loot and quest-credit ownership when PvE and PvP overlap.
- Treatment of revives, pets, summons, projectiles, and persistent effects across zone transitions.

The original arena concept normalises major equipment advantages while preserving build choices, with rewards favouring appearance and reputation. This is an organised-match design only; world-PvP scaling is undecided.

### Multiplayer integrity

Combat, inventory, rewards, and trading need server authority. Reconnection and persistent saves belong in the first playable multiplayer version. Shared play must be validated with actual independent clients rather than simulated local companions.

## Visual direction

Handcrafted, tactile, and slightly strange. The realms share a coherent rendering style while differing in materials, architecture, lighting, and atmosphere.

| Place | Palette and materials | Atmosphere |
| --- | --- | --- |
| Highcross | Amber lanterns, blue dusk, old stone, copper machinery | Warm, inhabited, dependable |
| Fantasy | Moss, wet slate, aged gold, deep woodland greens | Ancient and mysterious |
| Science | Oxidised steel, ceramic armour, sodium orange, cold cyan | Beautiful decay and stubborn survival |
| Chaos | Porcelain, velvet, ink, bruised violet, impossible reflections | Seductive, playful, unsettling |

Characters need strong silhouettes at gameplay distance. Environments need carefully composed views, atmospheric depth, animated foliage, convincing contact shadows, and selective reflections.

The browser performance goal is smooth desktop play, with scalable shadows, effects, resolution, and texture quality. Exact hardware targets, supported browsers, loading budgets, and performance acceptance criteria belong in the production plan.

## Screens, HUD, and controls

The world remains visible wherever practical. Opening a panel does not pause danger. Protected status and PvP eligibility must remain visible during normal play and relevant overlays.

| Screen or overlay | Design and purpose |
| --- | --- |
| **Title and connection** | Animated Highcross view; continue, play, settings, connection status |
| **Character selection** | Characters standing in the inn; guild, level, and last location |
| **Character creation** | Full-body preview; appearance, name, voice, background flavour |
| **Introduction and guild trials** | Instructions attached to actual interactions; replayable practice and previews for all guilds |
| **Exploration HUD** | World dominates; vitals, target information, minimap, compact quest tracking, safe/PvP location state |
| **Combat HUD** | Enemy casts, threat cues, status effects, boss mechanics, readable hostile-player information |
| **NPC conversation** | Portrait or close view beside dialogue topics, evidence, and service actions |
| **Inventory and equipment** | Character preview, equipment slots, searchable bag, clear comparisons; guild-specific equipment or forms where needed |
| **Guild and abilities** | Guild identity, advancement, loadout, upgrade choices, practice access; complete twelve-guild support |
| **Character development** | World level, guild rank, attributes, exploration skills, reputation |
| **World atlas and local map** | Realm overview, discovered routes, landmarks, personal markers, explicit safe-zone boundaries |
| **Quest journal and codex** | Missions, mysteries, collected clues, creature knowledge, player notes |
| **Merchant, crafting, and bank** | Consistent item presentation, costs, previews, storage, transactions |
| **Social and party** | Friends, party roles, guild channel, invitations, mute/report controls |
| **Trade** | Two inventories, explicit offers, final confirmation by both players |
| **Arena** | Rules, invitations or matchmaking, match state, results |
| **Death and recovery** | Revival options, sanctuary choice, recovery location, applicable PvE/PvP consequences |
| **Settings and help** | Remapping, UI scale, graphics, sound, subtitles, reduced effects |
| **Loading and reconnection** | Useful progress, retry information, restored session state |

HUD placement:

- Party and vitals upper-left.
- Target upper-centre.
- Minimap, location, and protected/PvP state upper-right.
- Abilities bottom-centre.
- Collapsible chat bottom-left.
- Context panels along the side of the screen.

Controls: **WASD** movement, mouse selection, **1–5** abilities, **R** signature, **Space** evade, **E** interact, **Tab** target, **M** map, **I** inventory, **J** journal. Everything is remappable. An optional command bar supports familiar actions such as `/look`, `/consider`, and `/tell`.

### Existing layout study

The conversation includes an interactive layout study covering exploration, atlas, guild, journal, and equipment views. It demonstrates screen relationships and contextual information, not final graphical quality.

Local reference: [Threefold screen layout study](/Users/shaun/.codex/visualizations/2026/09/30/01a0f154-a52e-7ff2-b2aa-7e268f6a1d9d/threefold-screens.html).

The study predates the expanded guild requirement and open-world PvP decision: it shows three sample guilds and does not yet show the required safe-zone/PvP HUD. This concept document is authoritative where they differ. The next visual pass must incorporate both changes.

## Asset production direction

| Asset family | Required content |
| --- | --- |
| Player characters | Shared humanoid foundation, appearance options, distinctive looks for all twelve guilds |
| Guild forms and bodies | Changeling creatures, Elemental transformations, Symbiont hosts, Powered Armour configurations |
| Equipment | Visible weapons, shields, armour silhouettes, implants, staffs, instruments, sacred implements, relics |
| NPCs | Named-character variants, full guild mentor coverage, reusable townsfolk |
| Creatures | Humanoid, quadruped, mechanical, spectral, and other bodies required by the approved guild forms |
| Bosses | Strong silhouettes, readable attack poses, dedicated signature sequences |
| Environments | Highcross and guild facilities, forest/abbey kit, industrial kit, carnival/theatre kit |
| Animation | Locomotion, attacks, casting, defence, stagger, death, interaction, emotes, transformation and form-specific movement |
| Interface | Ability and item icons, portraits, cursors, markers, status symbols, safe/PvP indicators |
| Effects | Shared impact and telegraph language with distinctive treatments for every guild and realm |
| Audio | Ambience, music layers, movement, combat, guild signatures, UI feedback, selected NPC voices |

Higgsfield fits concept imagery, portraits, visual references, and selected cinematic material. Meshy fits selected model candidates. Blender provides the consistency pass: topology, proportions, materials, rigging corrections, animation cleanup, collision, and export optimisation.

Generated assets require inspection in the actual game camera. Animation, material consistency, and readable silhouettes determine whether they feel finished. Transformation and host-based guilds materially expand model and animation needs; they must be accounted for in the asset plan.

Production estimates, credit budgets, reusable rigs, asset acceptance criteria, and generation batches belong in the full game plan. No paid generation or full asset production is implied by saving this concept.

## Sound, music, and visual effects

Each ability has a preparation cue, impact, and short decay. A shield bash feels physically different from a pulse weapon or spectral curse.

- **Knight:** metal weight, cloth movement, stone-like impacts, brief choral overtones.
- **Cyborg:** capacitor charge, servo movement, pressure release, electrical fracture.
- **Necromancer:** breath, distant voices, brittle bone, low resonances.
- **Other guilds:** dedicated sound and effect identities consistent with their mechanics; Bard music must coexist with the score and remain readable in a party.
- **Fantasy ambience:** wind through branches, rain, birds falling silent near danger.
- **Science ambience:** ventilation, stressed machinery, distant announcements.
- **Chaos ambience:** music in the wrong place, footsteps without owners, subtly changing acoustics.

Music changes between exploration, suspicion, combat, and resolution. NPCs use selected voiced greetings and important lines; full dialogue remains readable.

Enemy danger remains visible beneath friendly spell effects. Screenshake, flashes, particle density, and audio intensity are adjustable. Important sound cues also have visual equivalents.

## Delivery scope and the 48-hour build

The user intends a full game plan, followed by asset creation and a build lasting up to 48 hours. The build duration is a timebox, not evidence that every feature can be completed to the desired quality within it.

The completed game includes all twelve full guilds and open-world PvP outside towns and safe zones. An implementation slice containing three guilds is not completion of this requirement.

The first chapter should provide:

- Highcross and three compact realm excursions.
- The required guild roster with distinct playable identities and progression.
- A complete progression and equipment loop.
- Several short missions and a substantial cross-realm mystery.
- At least one particularly polished boss encounter as the initial quality benchmark.
- Persistent saves, cooperative play, open-world PvP, and enforced town/safe-zone protection.
- Finished presentation for included content.

Additional regions, deeper guild progression, housing, large-scale events, and a sophisticated player economy can follow that foundation. All twelve guilds are already part of the required scope and must not be reclassified as optional expansions without a new user decision.

Twelve guilds and unrestricted hostile encounters outside protected areas substantially increase asset, animation, balance, networking, and testing work. The production plan must expose that cost, establish staged checkpoints, and report unfinished scope honestly if the timebox ends. It must not quietly replace the approved game with a smaller one.

## What makes the game successful

Judge the experience through playtesting:

- Can a new player understand a fight and intentionally use an ability?
- Do the guilds create different decisions and experiences?
- Does an unexplained detail make the player curious enough to investigate?
- Do rewards change a build or provide a memorable discovery?
- Does returning to Highcross feel useful and socially meaningful?
- Can players recognise danger, safe-zone boundaries, and opportunities for PvP counterplay?
- Are defeat and recovery understandable enough that players continue playing?
- Do players voluntarily begin another expedition?

Graphical quality supports these experiences. It does not replace them.

## Next deliverables

1. **Visual design package:** high-fidelity game-screen concepts and an art direction reference, beginning with Highcross exploration, a wilderness combat/PvP encounter, and the guild/character screen. Establish the actual visual target beyond the existing layout study.
2. **Full game plan:** all twelve guild kits and progression, detailed world and quest structure, complete screen flows and states, PvP rules, asset manifest, sound/effect specifications, browser/server architecture, budgets, milestones, and acceptance tests.
3. **Asset and implementation production:** execute against the approved visual target and plan, using the build timebox and reporting completed, tested, and unfinished work separately.

Saving this document does not start asset generation, deployment, or the 48-hour build.

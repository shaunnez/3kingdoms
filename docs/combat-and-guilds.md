# Combat, guilds and multiplayer rules

Proposed implementation specification v1. The [ability catalogue](guild-ability-catalogue.md) supplies every named action, cost, timing, range, visual cue and counter. [Source data](../tools/build_catalogue.py) generates that document and the production manifests.

## Combat contract

Movement is continuous on navigable ground, 4.5m/s normally. Left click selects; right click or F engages a target and repeats basic attacks while in range. Selection alone never attacks. Tab cycles visible eligible enemies, prioritizing mobs until a hostile player is explicitly selected or has attacked the player. Clicking a player and pressing an attack is sufficient anywhere open; there is no consent dialog. A visible cursor, target portrait and `PLAYER` label distinguish hostile targeting. Esc clears engagement.

Basic attacks have an explicit wind-up, impact and recovery; characters face their target without instantly turning through a committed attack. Abilities are queued at most 150ms before recovery ends. Movement cancels channels unless stated otherwise. Interrupted casts pay no resource before commit; at commit they pay the whole cost and start cooldown. No refund after a projectile has launched. Hit confirmation is authoritative; predicted local animation can cancel into a brief fizzle on rejection. No random misses on correctly aimed close-range attacks.

Space is a universal 3m ground evade, two charges, one charge recovered every 7s, a 0.35s hit-avoidance window against avoidable attacks, no wall or safe-boundary tunnelling. Its avoidance is a combat mechanic available to every guild, not a PvP flag. Each guild also has a separate Q defence from the catalogue. Slow and root rules apply consistently; evade cannot start while rooted or stunned. A universal C break-free has a 45s cooldown and removes current stun/root/silence once. Give every control effect a visible expiry timer.

Each attack declares target type, range, shape, damage type, collision policy, cast lock, cancel conditions, status payload and maximum targets. Ground actions use cursor projection onto valid ground, then show a preview; press again or release key to confirm, with optional quickcast. Ally skills default to self if no valid ally is selected; never silently heal a hostile player. Hostile AOE affects eligible players and PvE enemies within the shape; party members are excluded. Nonparty players remain eligible even if they belong to the same Company.

### Starting numerical model

Use `P = 40 + 6 × (level − 1)` as level power. Player base maximum HP = `12P`. Equipment adds up to 15% power and 15% HP in Chapter One, with mastery emphasizing behavior. All catalogue coefficients multiply P. Physical and magical mitigation each cap at 40%; temporary defensive actions multiply remaining damage rather than adding to permanent mitigation. Damage floors at 1 after mitigation. Crit chance starts at 5%, damage multiplier 1.3, equipment cap 15% chance. Healing does not crit. Crowd-control durations are never randomly modified.

Same-level ordinary mobs have 4–7P HP and 0.4–0.7P basic hits; elites 20–35P HP and mechanics; bosses 100–150P HP solo. Encounter tuning must reach pacing targets, not preserve these seed values blindly. Boss HP scales `1 + 0.6 × (participants − 1)` with up to four PvE participants sampled at encounter start; boss damage does not multiply with party size. Late arrivals may earn participation but cannot repeatedly rescale HP. PvP does not scale boss health. Abandoning/resetting a boss clears its encounter ledger after a visible reset.

World PvP damage uses `coefficient × (defender base HP / 12) × clamp(attacker base P / defender base P, 0.85, 1.25) × attacker equipment multiplier`, then mitigation. This bounds the level ratio while preserving a modest advantage and earned abilities. It is an explicit proposed world-scaling rule. Healing and shields use the caster's own P; during the 20s PvP combat tag, their effective value is multiplied by 0.75 to constrain sustain. Reassess this alongside burst and time-to-kill data, especially party healing. Arena uses a common level-20 base P and fixed item-stat budget while retaining selected mastery and item behaviors.

No forced player target changes, fear-driven movement or indefinite charm. Stun/knockdown maximum 1s per application in PvP, roots 1.5s, silences 1s; catalogue shorter values prevail. Same category within 8s: 100%, 50%, then immune for the remainder of that window. Bosses convert hard control into stagger-meter damage; filling it grants a 2s vulnerability window at most once per 15s. Displacement checks navigation and cannot enter walls, inaccessible platforms, safe areas from an offensive cast, or lethal voids. Environmental falls use explicit recovery logic, not hidden instant PvP kill exploits.

## Guild progression and equipment

Adventurer begins with basic, defence, Examine and Heavy Cut; the intro unlocks the remaining starter actions as lessons. Level 5 grants a full guild's basic, defence, utility and slots 1–2. Slots 3, 4, 5 and signature unlock at levels 6, 8, 10 and 12. Trials temporarily loan the full kit in a labelled practice loadout. Form-based guilds receive the minimum form switching needed immediately at admission; their level locks apply to advanced attacks, never to access to their defining forms. The loadout displays locked actions and exact unlock criteria.

Six equipped combat actions occupy 1–5 and R. Q defence, Space evade, C break-free and contextual E utility remain separate. Changeling and Elemental actions change form in those same slots; form-specific tooltips update without rearranging keys. Necromancer commands use a small pet bar with passive/follow/assist and a recall button, also bindable. Bard songs show two active slots and beat bars; no rhythm-perfect input is required. Powered Armour configuration selection and Priest vow selection are accessible in the guild panel in town; neither adds a hidden combat action wheel.

World XP comes from first quest completions, eligible mobs and exploration. Proposed XP to next level: `100 + 35L + 12L²`, with authored intro rewards overriding grind to reach five. Award same-level ordinary kills 8% of the next-level requirement up to level 10, then 3%; apply diminished rewards for trivial enemies. Substantial quests award 25–40%, jobs 10–15%, landmark discoveries 3% once. Tune to 8–12 hours through Chapter One with exploration; there is no daily progression lock. Do not reward repeated suicide, player killing or healing damage generated by one's own party with XP.

Guild mastery ranks 1–5 in Chapter One require use of distinct kit mechanics plus world progress: admission, level 8, level 12, level 16, level 20. No grinding a heal against a wall. Rank 2 chooses one of the two catalogue mastery directions; rank 3 improves signature cooldown by 10s; rank 4 adds an extra utility clue annotation; rank 5 strengthens the chosen direction by a small authored modifier, capped at +10% damage or healing. Rank-5 details per direction: Knight redirected-damage cap +5% HP / post-block Sunder window +1s; Cyborg cover +1s / Shatter +10 percentage points; Necromancer Echo +4s / detonation +0.2P; Mage combo +5 percentage points / refund +5; Monk speed +5 percentage points / third hit +0.15P; Priest ward heal +0.15P / shield +0.15P; Bard radius +1m / Finale resource cost −10; Changeling mark +1s / refund +5; Elemental displacement resistance +10 percentage points / cycle strike +0.2P; Psion refund +5 / empowered hit +5 percentage points; Symbiont shield +0.1P / restore +2; Powered Armour projector +0.5s / splash +0.15P. These changes require no new skill icons or rigs.

Chapter Two adds levels 21–30, mastery ranks 6–7 (one additional modifier slot and a cosmetic mastery appearance) and prestige after completing the three later epics plus level 30 and 35 quest points. Prestige grants a title, aura toggle and extra saved loadout, never safe-zone bypass or unbounded combat stats. The already listed kits remain the complete initial action set; further skills require an explicit scope revision.

Exploration skills are Observation, Lore, Mechanisms and Survival, ranks 0–5. Each distinct relevant discovery grants one mark; ranks need 2, 4, 7, 11 and 16 total marks respectively. Observation annotates small physical clues; Lore cross-links inscriptions; Mechanisms previews switch consequences; Survival improves resource-node identification and authored trail reading. They provide information and convenience, never a mandatory main-quest lock or hidden player radar. Character creation offers four cosmetic backgrounds (Traveller, Archivist, Salvager, Performer) with one opening dialogue variation each and no stat advantage.

Equipment slots: primary implement, secondary implement/module, body, head, hands, feet and two relics. One item per slot; same relic unique-equip. Humanoid equipment is fitted to two shared adult builds. Forms consume equivalent totem/core/graft/module item stats and use attachment/material tiers, not boots on a bird. Starting gear, journey gear and one mastery look exist for every guild. Twelve full guilds cannot share an indistinguishable reskinned outfit.

Guild switching in town is free, retains each guild's earned mastery and banks incompatible items. It is unavailable during combat, trade locks or pending reward transactions. No gear deletion or character reset. Saved loadouts store item IDs, abilities, mastery, vow/configuration; missing items produce a clear unresolved-slot state rather than automatic substitution.

### Finite economy

Copper marks are the single currency; banked marks are safe. Vendors have explicit buy/sell prices; ordinary sales return 25% of purchase value. No cash shop, cash-out, durability tax or random paid boxes. Inventory has 40 slots, bank 120, ordinary materials stack to 99; capacity errors must prevent consumption. Quest evidence uses a separate journal inventory. Bind quest rewards on acquisition; crafted goods and ordinary drops are tradable. Use integer amounts everywhere.

Crafting has four professions, each with three Chapter One recipes, all visible with discovery requirements:

| Profession | Recipes / inputs / output |
| --- | --- |
| Smithing | Journey sword or shield: 3 bronze fragments + 2 briar fibre; Oath Brooch: 2 bronze fragments + 2 theatre seals; Bellkeeper upgrade: owned blade + 3 abbey ash + 1 reactor glass |
| Engineering | Repair Kit: 2 copper wire + 1 ceramic shard; Drone Module: 3 circuit boards + 2 coolant; Siege Regulator: 2 reactor glass + 3 copper wire |
| Enchanting | Ward Salt: 1 rune chalk + 1 abbey ash; Mind Prism: 2 mirror dust + 2 porcelain shards; Funerary Lantern: 2 shadow thread + 2 bronze fragments |
| Cooking | Trail Stew: 2 forage portions + 1 clean water; Berry Tonic: 2 berries + 1 clean water; Clarity Tea: 2 tea leaves + 1 clean water |

Food inputs are separate catalogue items: forage-portion, clean-water, berry and tea-leaf. Consumables share a 30s combat cooldown: tonic heals 1P over 4s; repair kit equivalent instant 0.8P; ward salt removes one DoT; tea restores 20 resource (or vents 20 Heat); stew/broth grant out-of-combat recovery only. Crafting takes 2s, server locks ingredients and consumes atomically with output delivery. Later recipes from Winter and Elevator quests produce Frost Seal attachment and Glass Warrant attachment using frost thread/glass foil plus existing materials; exact recipes: 3 late material + 2 bronze fragment or copper wire respectively.

Named relics have one behavior: Bellkeeper's Blade 0.25P interrupt burst/10s; Drone Module +2m heal coverage but −15% healing; Funerary Lantern second Echo at 40% strength with combined summon cap; Glass Compass annotates nearby undiscovered inscription objects without revealing players; Borrowed Shadow appearance disguise with player name and guild intact. Other relics map to a catalogue guild's mastery motif and offer +5 resource capacity or −1s on one non-signature cooldown, not both. Their exact chosen action is displayed before equipping and stored in versioned item data. Frost Seal reduces incoming slow duration 10%; Glass Warrant highlights one public terminal route; Accord Relic provides one additional saved loadout; cosmetic sail is purely visual.

## PvP and shared-world rules

**Location alone grants safety.** Highcross, twelve halls, practice rooms and marked sanctuary polygons are safe. Everything else, including the Understeps beyond its signed stair, wilderness, dungeons and arena floor, permits attacks at any time. Story progress, level, guild, gathering, dialogue, loading UI, travel intent or instance ownership does not grant immunity.

The [PvP and outlaw revision](pvp-and-outlaw-rules.md) adds one-item/two-item looting, red-name timers, self-defence rights, guards and merchant refusal. It is authoritative for these mechanics. Towns remain protected from player damage; lawful guard NPCs may attack red players there.

| Situation | Server rule |
| --- | --- |
| Source or target in safe polygon | Reject player damage, debuff, displacement, healing/shielding of an external fight and offensive pet orders across boundary |
| Projectile/trap/DoT after boundary crossing | Recheck source, owner and target at hit/tick; clear hostile player statuses on safe entry; no delayed safe-town hit |
| Safe boundary edge | Server capsule centre determines membership against versioned polygons; exact edge counts safe. Client interpolates presentation only; authoritative status wins |
| Safety display | Shield + SAFE TOWN/SAFE ZONE inside; crossed swords + OPEN PVP outside; ground posts and map outline share polygon source |
| Healing an aggressor outside | Apply same combat tag and involvement; no untargetable healer exploit |
| Party | Four members, no friendly fire; leaving immediately removes exclusion; 30s rejoin lock prevents toggling shields |
| Company | Social only; members may fight outside safety; no automatic alliance exemptions |
| PvP tag | Damage, hostile control or assisting a tagged combatant refreshes 20s timer; inhibits fast travel, gear/guild changes and instance hopping, never walking into town |
| Safe return | Walking across boundary always prevents player damage in both directions; red status persists, guards remain hostile and merchants refuse service |
| Disconnect | Body remains for at least 60s and until 20s since last combat; can be damaged and killed. Reconnect resumes same body and state; no duplicate avatar |
| Voluntary logout | Safe: immediate. Open: 20s standing channel cancelled by movement/damage; closing tab uses disconnect rule |
| Zone transfer | Open-to-open door/portal requires no combat tag; signed town entrances remain reachable by walking. One authoritative actor during handoff; failure returns it to source |
| Travel anchor | Discovered endpoints only; 8s interruptible channel, no combat tag, arrival in declared safe anchor footprint. Walking beyond restores PvP immediately |

Do not make entire salvage camps or carnival service areas safe by convenience. Early wilderness service NPCs cannot be killed or body-blocked, but players using their menus remain vulnerable. Town residents use non-blocking collision so crowds cannot trap players. Starter exits have two traversable routes and cannot be sealed by player models.

World PvP transfers up to one existing eligible item from an ordinary victim or two from a red victim under the outlaw specification. It does not mint currency or kill XP. Red-name aggression/player-killer status and law enforcement are required; an additional bounty economy is deferred. Organized arena matches are proposed as sport rules with no permanent item loss or new outlaw flag, explicitly disclosed on entry; red players cannot enter. Arena cosmetic-token limits remain once per opponent per day with minimum participation.

PvE rewards use individual contribution records: damage or effective healing/shielding of an engaged participant, with presence at a meaningful phase. All eligible participants get personal monster rewards without last-hit theft. Player corpse equipment is governed separately by PvP claims. Hostile players cannot earn support contribution by healing mobs or dealing token damage immediately before death. Minimum contribution threshold starts at 5% encounter budget or one required objective with 20s participation; tune accessibility for supports. Quest interaction credit belongs to each player's persisted flags. A player killed during a fight retains earned PvE contribution. Monster loot collection expiry is 10 minutes, with unclaimed eligible rewards mailed to the character's server-side recovery inbox rather than dropped.

## Death, recovery and camping

At zero HP enter downed for 10s: crawl slowly, no attacks. Allies can channel a 4s revive, interrupted by damage; enemy damage can finish downed players outside safety. One downed state per 60s; a second lethal hit kills immediately. Bosses follow the same rule. A revived player returns at 35% HP, no invulnerability, with the 60s downed lock. The UI names exposure before the ally commits.

Death transfers 10% of unbanked marks, rounded down, to a personal recovery echo at the death location. Levels, mastery, bank contents, quest evidence and protected starter gear remain owned. Eligible carried/equipped items can be permanently transferred under the one/two-item corpse rule; they are not restored by currency recovery. The personal currency echo cannot be looted by others. Recover via a 2s exposed channel or, when not red, pay a town caretaker 5% of the echo's contents after 5 minutes to deliver the remainder. Echo expiry after 24h mails 80% of echo value. At most one active echo; a new death merges currency into the previous echo. Bank transfers are unavailable from open-world menus and all bank service is refused while red.

Respawn choice when not red: Highcross or a previously discovered marked sanctuary. While red, use an unpatrolled marked refuge at an existing realm shrine; the town option returns when the timer clears. No respawn in a guard's attack range. Sanctuaries have two outbound routes and remain protected from player attacks; guard leashes respect refuge boundaries. A warning after three deaths to the same player suggests a different route once safely out of combat, without wilderness immunity. Report/mute are always available. Moderation records are access-controlled and do not enter the public devlog.

## PvE encounters and fun validation

Group encounter templates combine one pressure role, one support/control role and enough space for flanking. Maximum two repair drones support one construct; their beams reveal priority. Leashes stop at authored encounter bounds and visibly reset health; no dragging a boss into town. AI perceives line of sight and recent noise, chooses a clear goal, telegraphs, acts and recovers. No hidden omniscient player tracking.

The Bellbound Warden is the initial quality boss: 100–70% teaches 0.9s sweep; 70–35% adds binding acolytes and a captioned toll rhythm; below 35% alternates three expanding rings with recoveries. Discovering the verse adds a 1.5s delay to the third ring and a peaceful-resolution interaction after the boss is staggered under 10%. Damage and credit remain server-owned. Science boss alternates laser, shutters and exposed-core cooling; Chaos boss shows named act cards before changing a rule. PvP remains possible in each arena: encounters must have exits and support mixed threat, and journal text warns explicitly.

Test all 66 unordered guild matchups in scripted smoke scenarios (both initiative directions), then human-test the riskiest sustain/control/summon pairs. No demand for universal 50% duels: ranged pressure, defence and utility tradeoffs should be readable. Rebalance based on time-to-kill, control uptime, healing, resource stalls and retreat success. Measure novice understanding and voluntary return after defeat; see acceptance gates for thresholds.

# PvP loot, red names and outlaw consequences

Revision 2 rules · implementation checkpoint updated 1 October 2026. This supersedes the original no-equipment-loss and deferred-notoriety proposals. The local Briar Gate implementation now exercises these core rules; see [verified behavior and remaining limits](checkpoint-status.md). Production database transactions, parties and the complete game remain later delivery stages.

## Confirmed direction

- Open-world PvP stays enabled everywhere outside towns and designated safe zones.
- Killing another player allows an item to be looted from them.
- Starting an attack makes the aggressor's name red.
- A red-name victim exposes two items on death instead of one.
- A timer clears player-killer status after a period without further offences.
- Guards attack red players they detect. Merchants refuse to deal with them.

The rules below are explicit **proposed defaults** for details the user did not specify. They are design decisions to review and playtest, not already implemented behavior. Loot selection is currently proposed as killer choice; the user's choice/random preference is pending.

## Aggression and the timer

| Event | Proposed outcome |
| --- | --- |
| Commit a hostile action against a non-red player who has not attacked you | Name immediately red, `AGGRESSOR` label, timer set to at least 10 minutes remaining |
| Further unlawful attacks | Refresh to at least 10 minutes; never shorten a longer player-killer timer |
| Unlawful kill or material participation in it | `PLAYER KILLER` label, timer set to at least 60 minutes remaining |
| Further unlawful kills | Refresh to at least 60 minutes; no infinite cumulative sentence in this initial rule |
| Defend against someone who attacked you, or attack an already-red player | No new red flag; existing red timer is never cleared by lawful combat |
| Assist an unlawful aggressor during an active fight | Effective healing, shielding, revival or pet support adopts the associated aggression and kill responsibility |
| No further offences | Timer counts down during connected, server-simulated playtime, including time in safe zones; pauses offline and during server downtime |
| Death, respawn, zone transfer or reconnect | Preserve remaining timer; suicide and disconnect never wash away the flag |

Use the same server-owned remaining-time field for red display and service/guard rules. It is separate from the existing 20-second combat tag. Show `Red: 09:42` or `Player killer: 58:12` to the owner, and a red name plus status symbol/label to others. Colour alone is insufficient. At zero, clear red status only after pending same-tick offence events have been applied.

An unlawful action is evaluated at commit: a missed attack still counts. Explicitly targeting a clean player and attacking needs no consent prompt. For untargeted AOE, evaluate aggression when an eligible clean player is actually affected, attributed to the owner; an empty attack cannot guess future victims. Pet orders, traps, reflected damage, redirected damage and periodic effects retain causal ownership. A friendly support spell cannot be used to spread criminal status to its recipient.

Self-defence rights are recorded against actual aggressors and accomplices until 30 seconds after the most recent hostile/support event. Returning fire cannot retroactively turn the original attack lawful or increase the innocent victim's loot tier. Attacking a red player is lawful but does not prevent that player defending themself. Attacking an unrelated clean player still makes the hunter red. Traps and damaging AOE can cause an offence; preview this risk clearly in crowded open areas.

Kill responsibility uses each participant's unlawful-aggression record for this encounter, not the victim's current red colour alone. The original attacker still receives player-killer time when the victim fought back. Effective accomplices share the consequence; only the corpse's single loot allowance is shared. The server records legal basis and involved actors for disputes and debugging.

## What can be looted

Proposed default: the eligible killer chooses up to one item from a non-red victim, or up to two from a victim already red at their final death. The allowance belongs to the corpse, not to every attacker. Being downed creates no loot; revival before final death preserves items. Loot exposes carried inventory and equipped gear. One stack unit counts as one item; splitting a stack cannot increase or conceal its eligibility.

Protected: quest evidence, keys required for story progress, bank contents, nontransferable account cosmetics and a visibly labelled basic starter set. Learned abilities, guild admission and transformation bodies are character progression, never loot. Equipment used by forms—totems, cores, graft modules and suit modules—is eligible on the same terms as a sword. Ordinary acquired gear and noncritical relics are eligible even if normally bound to the owner; PvP transfer is an explicit ownership rebind. Protect a quest's permission/clue flag separately from its reward item so losing a relic never bricks a quest.

If fewer than the allowed number exist, take only what exists. Never fabricate a reward or confiscate a protected item. No random destruction of additional possessions. The death screen identifies the exact exposed and taken items and their new ownership; “recover your gear” must not imply stolen items will be returned automatically.

At final death, snapshot eligibility and escrow all eligible items for a 120-second claim window. The victim respawns immediately with protected starter gear available; the UI shows their other items as temporarily held, not vanished. The killer can inspect the corpse within 3m and claim the selected items with a 3-second channel; movement, damage or incapacitation cancels it. Claim transfers and decrements the shared quota atomically. Claiming the complete quota releases the rest immediately; otherwise expiry releases all unclaimed items to the victim. Returned items go to their previous slot when still free, otherwise the recovery inbox. Full bags never delete property or expand the quota. Selected items that successfully transfer are permanently lost to the victim unless later recovered by ordinary play or trade.

Proposed kill ownership: the eligible opposing player with highest effective player damage in the 20 seconds preceding final death, including their summons; tie resolves by first contribution. An execution-only last hit does not steal the claim. A monster/guard finish during that interval retains that player's claim. Before opening the corpse, the claim holder may assign its remaining allowance once to a participating party member; no copied rights. Log both participants. Offline claim holders lose the opportunity when the 120-second timer expires; this does not cancel already committed transfers.

Red victims killed solely by guards or PvE also expose two items, preventing suicide from avoiding the penalty. With no eligible player killer, the first living player to finish the corpse channel owns its remaining claim; all claims still share a global two-item cap. A clean victim killed solely by PvE retains gear under the original PvE rules. This red-death extension is a proposed default, clearly disclosed before the player starts aggression.

PvP loot transfers existing items; it does not mint kill XP, bonus currency or duplicate quest rewards. Repeated/arranged kills still obey the same one/two-item cap and eligibility rules. Do not silently revoke the user's loot mechanic through a repeat-victim reward exemption. Detect suspicious transfers for review without claiming that this eliminates collusion. The existing personal currency echo remains a separate recovery mechanism; killers do not loot banked money or the currency echo.

## Guards, towns and service denial

Highcross already had a visual guard role planned. It now becomes a real combat actor: Concord Watch patrols the gates, Exchange and Guild Row. Later protected settlements use the same behavior with local uniform variants. Guards have clear sight lines, approximately 20m detection range and a short visible attack wind-up. Detection alerts nearby guards within 25m. They pursue within a 40m patrol leash, search for 10s after losing sight and return; no omniscient cross-map chase.

Guards are strong PvE opponents, not arbitrary instant kills. Their initial kit is polearm strike, interrupting shield bash and a short approach dash, borrowing the existing humanoid combat clips. Single-target attacks only; no collateral harm to bystanders. Attacking a lawful guard is itself an offence and turns the player red. Guards provide no farmable item/XP reward and respawn after 60s. Killing one refreshes the 60-minute outlaw penalty.

**Town safety still blocks player-versus-player damage in both directions, including against red players.** Red status does not secretly turn a town into a PvP arena. Guards are the explicit NPC-law-enforcement exception: they can fight red players inside town, and the red player can defend against them. Guard effects cannot be reflected/redirected into clean bystanders. UI copy while red in town: `SAFE FROM PLAYERS · GUARDS HOSTILE`.

All ordinary merchants refuse buy/sell, paid crafting, repairs and banking while red. Refusal is checked again at transaction commit; opening the shop while clean cannot bypass it. Quest-critical conversations and evidence submission remain available. Free recovery information and the basic starter set remain available. No hidden black-market exemption in this baseline; such a feature would need a later deliberate design decision.

Marked, unpatrolled refuges at the existing realm shrines provide an escape from town guards without adding a new map. They remain safe from player damage but offer no merchant/bank services. Red players respawn at a selected unpatrolled refuge and cannot choose a guarded town spawn until the timer clears. Guards leash before the refuge boundary. This prevents endless guard spawn-killing while preserving item loss, service denial and the remaining timer. At least two open routes leave each refuge.

Arena proposal: organized matches use explicit sport rules—no permanent item transfer and no new outlaw flag. Entry requires no existing red flag, so the arena cannot hide an outlaw timer; the match-rules screen states this exception. It does not affect ordinary wilderness or dungeon PvP. This supporting exception remains a proposed default.

## Required screens, assets and server checks

Extend existing exploration/combat HUD with red status and countdown, inventory with eligibility/protected badges, merchant/bank with refusal states, death/recovery with one/two-item consequences, and a new corpse-claim overlay. Add inspectable guard patrol/alert/attack states, law-enforcement voice cues, loot-channel animation/effect/audio and immutable transfer receipts. Existing concept images predate the outlaw UI and are still visual references rather than updated gameplay captures.

Server persistence needs remaining outlaw time, lawful self-defence records, causal attack/support ownership, death snapshots, escrowed items, claim quota/owner/expiry and transfer receipts. Red status and ownership must survive reconnect, crash and zone handoff. Claiming, equipping, trading, dropping, crafting or selling the same escrowed item concurrently must have exactly one winner. A failed transfer returns ownership safely; a retry never duplicates the item.

Acceptance cases: initial attack and miss; AOE/pet/trap offence; retaliation and hunting red players; accomplice healing; unlawful kill refresh; offline/death timer persistence; exactly one/two total items; equipped and form-specific gear; bound rebind and protected exclusions; multiple looters; full inventory; interrupted claim; claimant disconnect; escrow expiry; guard/monster-assisted death; pure guard death; guard sight/leash/refuge; clean bystander protection; merchant race; town red safety; arena rules. No runtime behavior is verified by this specification update.

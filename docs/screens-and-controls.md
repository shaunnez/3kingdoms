# Screens, flows and interaction specification

Use the [three visual references](../design/art-direction.json) as composition targets, with functional text and icons built as actual UI. Do not bake health bars, numbers, labels or buttons into a background image. The world remains visible behind panels and multiplayer never pauses.

## UI visual language

Charcoal surfaces `#151819`, parchment text `#F0E5CA`, secondary text `#C2B8A1`, warm brass `#BFA269`; blue/cyan ally accents and orange/red hostile accents supplemented with symbols and labels. Test actual rendered contrasts: 4.5:1 normal text, 3:1 large text and essential controls. Serif for short headings, system sans-serif for body/controls initially; select and record font licenses before shipping a custom typeface. Body 16px minimum at 1080p, labels 14px minimum, primary controls 44×44 CSS px. UI scale 80–150%, text size independent where possible.

At 1920×1080, vitals and party upper left; selected target and cast top center; minimap with persistent safety label upper right; abilities bottom center; collapsible chat bottom left; one primary context panel along a side. Ability buttons carry name on focus/hover, key, cooldown number/radial and resource failure reason. The selected target shows character/mob/player type, HP, effects and interruptible cast icon. Safe state remains visible over maps, inventory and dialogue, never hidden by a tooltip.

At 1366×768 use a 300px panel and compress decorative trim; at 1280×720 allow one panel, collapsible tracker and condensed chat. Below 1024 CSS px wide, show an honest desktop-layout notice while settings and journal remain usable; touch/mobile combat is not a release promise. At 200% browser zoom, panels remain scrollable and keyboard-operable rather than clipping transactions. The 3D viewport can shrink; danger indicators stay in its visible area.

## Flow

Title/connect → character selection → create or continue → introduction → guild trial/choice → Highcross → realm exploration/combat → recovery or town → equipment/mastery/quests → next expedition. All world panels return to the same world state. Disconnect supersedes transactions and displays pending/confirmed outcome on reconnect. Arena selection in town leads to a separate combat scene and results, then returns to a safe town spawn.

## Complete screen specification

Each row includes default, empty/locked, busy and failure states in addition to the specific states below. Focus returns to the opening control when closed. Esc closes the top noncritical overlay; it never accepts a trade, deletes a character or discards an unconfirmed irreversible choice.

| ID / screen | Layout and actions | Required states and acceptance |
| --- | --- | --- |
| title | Animated or still Highcross backdrop, Play/Continue, status, Settings, Help | Connecting, online, maintenance, incompatible renderer, failed auth, retry; no fake percentage; Play works with keyboard |
| characters | Inn character lineup with level/guild/location, three slots, Create/Continue | Empty account, loading, character already online, archived/deletion pending; deleting requires typed name and recovery window |
| creation | Full-body preview, two adult body builds, six heads, six hair choices including bald, skin/hair swatches, three voice profiles, name | Name validation 3–20 Unicode letters/numbers/spaces with server uniqueness and reserved-name rules; no body-linked stat advantage; preview matches saved character |
| intro | Compact contextual instruction and objective, replay lesson, accessibility shortcut | New/returning player, skipped step, failed practice, hint; twelve previews available without twelve mandatory trials |
| exploration | HUD layout above, E context prompt, three tracked objectives maximum, rumour/clue toast | Safe/open transition, discovery, interact blocked by distance, bag full; safety has text+symbol and ground cue |
| combat | Same HUD plus hostile cast, threat direction, party states, boss mechanic strip | Valid/invalid target, cooldown/resource/range/LOS failure, interrupted, downed ally, dual PvE/PvP threat; no generic “can't do that” errors |
| dialogue | NPC portrait and topics; evidence tray; service buttons; transcript | Unknown topic, newly learned topic, exhausted topic, branch, missing item, NPC busy, combat interruption; close never grants protection |
| inventory | 40-slot searchable bag, paper doll, compare, sort, drop/sell lock, stats | Full, empty, bound, pending transaction, incompatible form/guild, equipped, missing saved loadout item; dropping valuable item confirms and respects ownership |
| guild | Twelve visible cards, identity, full-body preview, trial/join; current abilities and mastery | Unjoined, trial, locked by level, joined, switch warning, resource demo, form/config/vow; each of twelve usable and mechanically distinct |
| progression | World XP, mastery, exploration skills, quest points, reputation and titles | New unlock, requirement unmet, rank cap; next requirement expressed as an action, not just a bar |
| atlas | Three realms and Highcross; local fog, roads, discovery markers, safe polygons, party positions, personal pins | Unknown terrain, discovered secret, inaccessible anchor, combat travel lock, current recovery echo; no undiscovered-player radar |
| journal | Active/completed/jobs, clues grouped by mystery, codex, notes, hint levels | No quests, accepted/branched/completed, missing evidence, out-of-order clue, hint disclosed; persistence survives reload |
| merchant | Stock, bag, price/quantity and result; buyback last ten eligible sold items | Insufficient currency, full bag, stale price, pending, success, disconnect/unknown outcome; no duplicate purchases on double click |
| crafting | Profession, recipes, ingredients, preview, quantity, start/cancel | Unknown recipe, missing input, inventory capacity, working, server success/failure; ingredient/output mutation atomic |
| bank | Bag and 120-slot bank, deposit/withdraw/search | Town only, full destination, bound restrictions, pending transfer; values reconcile after reconnect |
| social | Friends, four-player party, Company roster, chat tabs and invite controls | Offline, pending invite, full party, ignored sender, departed leader, duplicate invite; keyboard chat cannot trigger movement abilities |
| trade | Two offer grids, currency, change history, Ready then Confirm from both | Offer changed resets both confirmations, out of range, combat, disconnect, timeout, success; item IDs remain reserved and visible |
| arena | Rules, unranked 1v1/2v2 queue or invite, loadout, match HUD, results | Queue/cancel, opponent found, loading, disconnect, draw, win/loss; announce normalization; 5min match cap, no invisible protected floor |
| death | Downed timer/revive progress then sanctuary/refuge selection, item claim and currency echo summary | PvE/PvP/guard cause, revived, finished, red status retained, escrowed/transferred/returned items, recovery fee; explain permanent item loss and distinguish it from recoverable currency |
| corpse | Eligible carried/equipped items, protected-item explanation, one/two-item remaining quota, claim owner and expiry | Claim available/assigned, channeling, interrupted, full inventory, already claimed, expired; server receipt lists transferred items; no bag drag bypass |
| settings | Input bindings, camera, UI/text scale, graphics presets, audio buses, subtitles, reduced effects, help | Conflict resolution, unsupported feature, apply/reset, audio locked until gesture; settings persist locally, account subset on server |
| connection | Loading stages, network quality, retry and safe exit | Assets downloading, shaders preparing, dropped socket, reconnecting, session superseded, failed transfer, maintenance; explain body remains exposed |
| report | Player summary, mute/block, reason, optional text, submit receipt | Pending, rate limit, success, failure; blocking chat never removes enemy model or attack warnings |

Character deletion is outside the combat loop and retains a seven-day recoverable archive. The confirm copy names the character; it does not auto-accept on Enter after opening. No account deletion UI is needed for the first closed test, but the public release must provide an accessible support/privacy route.

## Controls and input priority

| Input | Action |
| --- | --- |
| WASD | Ground movement relative to current camera orientation |
| Mouse left / right / F | Select / engage / engage selected target |
| 1–5, R | Equipped abilities and signature |
| Q / Space / C | Guild defence / universal evade / break-free |
| E | Nearest highlighted interaction; hold for utility options if applicable |
| Tab / Shift+Tab | Cycle eligible targets forward/back |
| M / I / J / K | Map / inventory / journal / guild |
| Enter / slash | Chat / optional command bar |
| Z / X, wheel | Rotate camera −/+90° / zoom within limits |
| Esc | Close top panel, then clear target, then menu |

Rebinding includes mouse buttons and preserves a keyboard path for every service. Conflicts must show both affected actions. Text input has first priority, modal controls second, gameplay last; closing chat never emits a queued spell. Pointer dragging UI must not rotate camera or move the character. Window blur releases held keys. Target selection remains stable across UI updates.

Optional commands are `/look`, `/consider`, `/tell`, `/party`, `/guild`, `/company`, `/help`; parse a fixed grammar and show suggestions. They call the same validated actions as the UI. No arbitrary server command execution, slash-script macros or client authority.

## Accessibility and danger communication

Every critical audio cue has a visible shape, cast timer or caption; the bell and Bard puzzles show symbol/beat sequences. Colourblind palettes change colour while preserving shape. Hostile telegraphs use outlined shapes and directional edges, ally effects use thinner outlines. Reduce motion disables camera shake, large zoom transitions and flashing impacts; the world and combat timings remain equivalent. Subtitles name the speaker; the transcript retains quest lines.

Render ordinary menus as semantic DOM: real buttons/labels, focus rings, keyboard navigation, live-region summaries for transaction outcomes. Do not put combat damage spam in a screen-reader live region. Full nonvisual real-time combat is not claimed by this plan; readable textual inspection, accessible menus and configurable combat assistance are the initial target. Test motor-friendly hold/toggle options for repeated basics and key-hold channels.

## Screen production assets

The manifest contains one composition target and one UI component bundle for each of the 23 screens, shared symbols, every ability icon, each item icon and each map. A screen bundle includes normal/hover/focus/pressed/disabled/loading/error states, panel corners, dividers and layout tokens. It is not a separate generated picture for every button state. Higgsfield supplies material and composition references; vector emblems, text, masks, focus rings and layout are authored for exactness.

The [outlaw revision](pvp-and-outlaw-rules.md) adds red-name status plus a countdown in the HUD, item eligibility/protection badges, permanent item-loss receipts, merchant/bank refusal states and unpatrolled-refuge respawn choices. In town a red player sees `SAFE FROM PLAYERS · GUARDS HOSTILE`. Guard sight/alert cues must be visible before their attack lands. Corpse looting is exposed interaction and never pauses combat. Existing concept art predates these overlays.

Review the three current images before approving bulk design: town atmosphere and camera are strong; combat telegraphs must remain this readable under four players; Knight appearance is the only fully depicted guild model. Fix the provisional Knight ability-icon mismatch across images by using one canonical ID-to-icon mapping in code and manifest. Public devlog captions must continue to identify these as built-in-generated concept art, not Higgsfield output or screenshots of a running game.

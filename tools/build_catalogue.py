#!/usr/bin/env python3
"""Expand the finite production specification. No provider or game-runtime calls."""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def slug(value: str) -> str:
    return value.lower().replace(" & ", "-").replace("'", "").replace(" ", "-")


def rows(text: str) -> list[list[str]]:
    return [line.split("|") for line in text.strip().splitlines()]


# Costs, cooldowns and coefficients are starting balance values, not measured balance.
# Six hotbar actions, followed by basic, defence and exploration utility.
GUILDS = [
    ("Knight", "Resolve", "100; +12 on block, +6 on basic hit; starts at 30", "humanoid", "plate, teal cloth, cream tabard; bronze shield; short gold oath strokes", "guarded metal strike / low choir", "Bulwark: Interpose protects two nearby allies at half strength; Duelist: Sunder gains 20% damage after a successful defence", "Resolve on defence makes positioning valuable; ranged kiting punishes overcommitment", """
Sunder|15|5|0.45|2.5|1.4P physical; armour reduced 15% for 5s|overhead diagonal cut; split brass arc|evade the committed swing
Shield Bash|20|12|0.35|2|0.5P; interrupt and 0.7s stun|shield draw-back; blue edge snap|bait then step beyond reach
Challenge|10|14|0.3|10|PvE taunt 3s; PvP target deals 15% less damage to other allies for 4s|raised sword; thin gold tether|attack Knight or disengage; never forced targeting
Interpose|25|16|0.2|8|dash to ally; redirect 30% damage for 3s, capped at 20% own max HP|shield forward dash; linked shield outlines|separate allies; interrupt before link
Rally|30|22|0.7|4|ground field heals 0.25P/s for 4s; maximum four allies|plant banner; low amber pulse|leave or interrupt cast
Last Oath|60|75|0.6|self|6s stagger resistance; defence restores 0.4P HP once per second maximum|kneeling oath then rising shield crest|disengage; resistance grants no damage immunity
Measured Cut|0|1.1|0.3|2.5|1.0P physical basic|compact waist-height blade trail|maintain distance
Brace|0|8|0.1|self|0.8s front guard reduces incoming damage 60%; no movement|shield lock and sparks|flank or delay
Oath Sight|0|3|6.0|6|reveal oath marks and sworn mechanisms while channeling out of combat|small bronze glyph; no through-wall player detection|taking damage cancels interaction
"""),
    ("Cyborg", "Heat", "0–100; actions add heat; cool 8/s after 2s without spending; at 100 offence locks until 50", "humanoid", "human face, ceramic limbs, exposed copper mechanisms; cyan coils", "capacitor whine / pressure vent", "Insulator: Coolant Burst leaves 15% ranged-damage cover for 3s; Shatter: cooled enemies take 20% more Pulse Lance damage once", "Manage heat bursts and vent timing; interrupts and pressure during cooling punish greed", """
Pulse Lance|+24|4|0.65|16|1.6P piercing lane, 1m wide; enemies beyond first take half|coils gather; narrow orange lane then cyan shot|sidestep visible lane
Mag Clamp|+18|14|0.5|10|0.3P; root 1s, boss slow 20%|magnet prongs; ground brackets|cleanse or evade projectile
Arc Mine|+16|12|0.5|6|one visible mine, 12s life; 0.8P and 30% slow 2s|crouch deploy; crackling ring|destroy from range; arm time 1s
Coolant Burst|-45|12|0.4|3|vent heat; 25% slow 2s|shoulder vent; transparent ice spray|keep beyond short radius
Repair Drone|+20|24|0.6|self|one drone heals 0.3P/s for 5s; destroyable|release drone; quiet cyan repair beam|kill drone or interrupt launch
Overclock|+8/s|75|0.4|self|6s; 25% faster basic attacks and +15% damage; normal heat cap still applies|core opens; rising pulse rate|pressure cooling window
Pulse Tap|+4|1.0|0.2|12|0.8P ranged basic|small blue muzzle pulse|line of sight
Reactive Plating|+8|10|0.1|self|45% damage reduction for 1s|ceramic shutters close|wait out short plate window
Diagnostic Scan|0|3|6.0|6|read machines and hidden maintenance labels out of combat|fine cyan scan grid|damage cancels; no player reveal
"""),
    ("Necromancer", "Essence", "100; regenerates 7/s; enemy defeat restores 10 once per eligible creature", "humanoid", "bone and bronze ornaments, layered black robes; pale blue spirits and violet curses", "breath / brittle chime / hollow resonance", "Keeper: Echo lasts 8s longer but Consume heals 25% less; Reaper: Consume detonates for 0.6P within 2m", "Choose spirit survival or sacrifice; cleansing and summon focus disrupt setup", """
Grave Bolt|12|3|0.5|14|1.1P spectral projectile|lantern draws inward; thin blue bolt|cover or evade
Wither|20|12|0.4|12|0.25P/s for 5s and 15% healing reduction|pinch gesture; violet rib glyph|cleanse; only one Wither per caster/target
Raise Echo|30|20|0.8|5|one wolf spirit for 16s; 0.25P attack per 1.5s; 1.5P HP|lantern kneel; blue pawprints assemble|interrupt or destroy summon
Soul Tether|15|10|0.3|12|command Echo to target; 20% slow 2s, line of sight required|point; fine visible tether|break distance beyond 16m
Consume|0|18|0.4|12|sacrifice own Echo; heal self 1.1P|beckon spirit; inward lantern spiral|force early sacrifice
Procession|50|75|1.0|12|three ghost fronts move along 3m lane; total 2.4P, one hit per front|staff sweep; marching silhouettes|leave lane during wind-up
Ash Touch|0|1.2|0.3|11|0.65P ranged basic; +4 Essence on hit|finger smoke thread|line of sight
Veil of Dust|15|10|0.1|self|45% damage reduction 1s; no invisibility|robe fold; thin dust veil|wait or follow visible feet
Speak with Remnants|0|3|6.0|4|read authored memory remnants, optional clue route|lantern held to remnant|combat cancels; base clue alternative always exists
"""),
    ("Mage", "Mana", "100; regenerates 8/s; last two elements determine next combination", "humanoid", "layered indigo cloth, geometric staff head, restrained elemental forms", "glass harmonics / air crack / small ignition", "Evoker: mixed-element hit gains 15% damage; Scholar: successful combination refunds 10 Mana once per 6s", "Prepare a sequence then cash it in; interrupt long casts and move before combinations land", """
Ember Sigil|15|4|0.6|14|1.0P fire; marks Ember for 4s|draw triangle; orange spark|dodge projectile
Rime Shard|15|5|0.6|14|0.8P frost; 20% slow 2s; marks Rime|draw diamond; blue shard|cover or cleanse slow
Arc Thread|18|7|0.5|12|0.9P lightning; chains once within 3m for 0.4P; marks Arc|two fingers; narrow branching line|spread apart
Spell Weave|25|12|0.8|12|consume two distinct marks: Ember/Rime 1.8P steam disk; Rime/Arc 1.2P plus 0.7s root; Ember/Arc 2P lane|two glyphs orbit then combine|watch shape; interrupt; no marks means disabled
Runic Ward|20|18|0.4|self|absorb 1.0P damage for 4s|hexagonal floor outline and hand ward|sustained pressure
Convergence|45|75|1.0|12|three delayed 2m blasts, 0.8P each over 3s|staff raised; three sequential sigils|move between marked blasts
Wand Spark|0|1.1|0.25|12|0.65P arcane basic|small point flash|cover
Phase Step|15|10|0.1|4|short collision-checked blink; no walls or boundary bypass|narrow split silhouette|predict arrival point
Read the Weave|0|3|6.0|5|decode arcane inscriptions and optional rune shortcuts|fine floating annotation|combat cancels; clues have alternate method
"""),
    ("Monk", "Flow", "0–100; +12 on alternating basics/skills, -10 for repeating same skill; decays 5/s out of combat", "humanoid", "sand wraps, charcoal travel clothes, beads; clean physical silhouettes", "cloth snap / breath / wooden block", "Crane: successful Palm Counter gives 1s of 20% speed; Tiger: third alternating hit adds 0.35P damage", "Alternate actions and time counters; feints and range deny Flow", """
Tiger Palm|10|4|0.25|2|1.15P physical; +10 Flow if following another action|hip-driven palm; small air cone|step out of melee
Crane Step|15|9|0.2|5|dash to ground; next basic gains 0.3P within 2s|low pivot then glide|predict destination
Palm Counter|20|12|0.1|self|0.7s guard; first melee hit countered for 0.8P and interrupted|open palm stillness|feint or use range
Sweeping Reed|25|14|0.5|3|0.7P arc and 0.8s knockdown|leg draws circle; dust arc|backstep; CC limits apply
Still Breath|0|20|2.0|self|channel heals 0.4P/s and gains 10 Flow/s; movement cancels|kneel, measured expanding ring|interrupt
Hundred Hands|60|75|0.6|3|five strikes over 2s, total 2.5P; can move slowly, interruptible|five distinct arm beats|leave reach or interrupt
Open Hand|0|0.9|0.2|2|0.7P physical; alternate hands|compact left/right punches|kite
Slip|0|8|0.1|self|0.35s evade window; 1m lateral step|shoulder turn|delay attack
Stillness|0|3|6.0|4|hear mechanical rhythms and vibration clues|settled stance with captioned pulses|combat cancels
"""),
    ("Priest", "Grace", "100; regenerates 7/s; maintain one vow: Shelter reduces own damage 10% and increases healing 10%, Judgment reverses", "humanoid", "ivory stole, practical bronze mail, open sun emblem; warm protective planes", "bell / breath choir / soft bronze", "Shelter: ward expiry heals 0.3P; Judgment: Smite against condemned target grants 0.4P self shield", "Vow trades healing for pressure; interrupts, spread pressure and anti-heal counter sustain", """
Smite|12|4|0.55|13|1.05P radiant|raise focus; falling narrow ray|line of sight
Mend|22|8|0.7|12|heal ally or self 1.0P|open palm; warm thread|interrupt; combat support rules apply
Sanctuary Ward|25|18|0.7|4|4s field reduces damage 15%; does not change PvP eligibility|trace sun ring at ground|push targets from field
Absolve|20|16|0.3|10|remove one oldest removable control and one damage-over-time|bronze bell ripple|bait before major debuff
Condemn|18|12|0.45|12|0.6P and target healing received -20% for 4s|broken sun mark|cleanse
Dawn Covenant|45|75|1.0|6|heal allies 1.3P then shield 0.5P for 4s, max four|raised stole; low dawn wave|interrupt wind-up or disengage
Pilgrim Strike|0|1.1|0.3|3|0.7P physical basic|mace or focus tap|range
Votive Shield|15|10|0.1|self|absorb 0.7P for 1.5s|small sun disk|sustained pressure
Consecrate Memory|0|3|6.0|4|restore readable text on memorials and blessed devices|hand over inscription|combat cancels; not a safe zone
"""),
    ("Bard", "Resonance", "0–100; +10 per basic beat; songs spend per second; two concurrent songs maximum", "humanoid", "rust-red coat, compact lyre and curved blade; thin rhythmic ribbons", "plucked strings / hand drum / restrained chord", "Conductor: song radius +2m; Duelist: ending two songs grants next Cadenza 0.4P damage", "Layer and release songs without losing position; interrupts and separation deny group value", """
Cadenza|15|4|0.4|12|1.0P sonic projectile; +0.2P per active song|strum forward; thin visible ripple|cover
March of Embers|5/s|8|0.5|5|toggle up to 8s; party movement +10%, damage +5%|walking beat; small warm foot rings|split group or silence
Quiet Refrain|5/s|8|0.5|5|toggle up to 8s; allies heal 0.15P/s|slow pluck; low teal rings|interrupt sustain; one healing song per target
Discord|20|14|0.5|10|0.5P and interrupt; 1s silence|sharp damped chord|bait cast then attack
Borrowed Courage|25|18|0.3|10|one ally gets 0.7P shield and cleansed slow|instrument offered; gold thread|switch target
Finale|50|75|0.8|6|end songs; 1.2P damage to enemies and 0.8P heal to allies|held breath then chord; radial staff lines|interrupt or leave radius
Backbeat|0|1.0|0.25|10|0.65P basic sonic note|single string stroke|cover
Dancer's Turn|10|9|0.1|2|pivot dodge 0.35s|coat turn; small cloth trail|track ending direction
Remembered Tune|0|3|6.0|5|replay learned melodies at devices; captions and symbol sequence provided|quiet instrument pose|combat cancels; no audio-only puzzle
"""),
    ("Changeling", "Instinct", "100; regenerates 8/s; forms Wolf, Raven, Beetle; combat uses ground movement for all", "quadruped", "wolf with pale crest, ground-skimming raven, plated beetle; constant amber eye motif", "bone shift / wing cloth / claw rhythm", "Hunter: Wolf Pounce marks prey for 10% bonus basic damage 3s; Wanderer: form change restores 10 Instinct once per 8s", "Form determines reach and escape; predict swaps, use sustained pressure during transformation", """
Rending Pounce|20|7|0.5|6|Wolf form; leap along navigable ground, 1.2P|wolf crouch; amber landing oval|sidestep landing
Raven Shift|15|10|0.6|self|enter raven; basic becomes 9m feather shot at 0.6P; no flight over walls|fold to black feathers|attack during visible shift
Beetle Shift|20|12|0.7|self|enter beetle; basics 0.7P melee, 20% armour, speed -15%|shell plates close|kite slow form
Wild Return|10|6|0.4|self|return to Wolf, basic 0.9P melee; clear own form speed penalty|crest emerges from swirl|predict melee arrival
Borrowed Hide|25|18|0.2|self|absorb 0.8P for 3s; retain silhouette|brief translucent form outline|wait then burst
Primal Chorus|50|75|0.8|4|6s; next three form changes trigger 0.6P local shock, once per 1.5s|three readable silhouettes|keep distance during swaps
Instinct Strike|0|1.0|0.25|form|Wolf bite / Raven feather / Beetle mandible as specified by form|form contact animation|respect current range
Feral Sidestep|10|8|0.1|3|ground evade, same 0.35s window in all forms|species-specific lateral move|track landing
Borrowed Passage|0|3|6.0|2|Raven fits marked vents, Beetle lifts marked latches, Wolf tracks clues; endpoints nav-validated|inspect then form gesture|only authored links; never cross a safe boundary unseen
"""),
    ("Elemental", "Stability", "100; regenerates 6/s; Fire, Water, Earth, Air; swapping costs Stability", "elemental", "four humanoid masses with different outline crowns; feet always readable", "stone / steam / wind / water in matching register", "Anchor: Earth reduces displacement 50%; Tempest: cycling three elements empowers next basic by 0.6P", "Each element commits to a function; punish repeated swapping and forecast delayed zones", """
Ember Body|15|6|0.5|self|enter Fire; next basic adds 0.3P burn over 3s|fractured coal body ignites|cleanse and pressure low Stability
Tidal Body|15|6|0.5|self|enter Water; next basic restores 0.25P self HP|water gathers around clear core|anti-heal
Stone Body|20|9|0.65|self|enter Earth; +20% armour, -10% speed while active|strata lock into shoulders|kite
Gale Body|20|9|0.5|self|enter Air; +10% movement; next basic pushes 1m|wind ring and suspended stone hands|corners and ranged pressure
Elemental Surge|25|12|0.7|10|2m ground disk: Fire 1.5P; Water 0.8P heal allies; Earth 0.8P plus 0.7s root; Air 0.7P plus 2m push|element-specific disk with same boundary|leave disk or interrupt
Worldheart|45|75|1.0|5|4s field pulses current element Surge at half strength twice; form locked|exposed core and low concentric waves|exit field; no invulnerability
Elemental Reach|0|1.2|0.3|10|0.65P elemental basic; form bonus as above|material-matched hand projectile|cover
Coalesce|15|10|0.1|self|50% damage reduction for 0.8s|core closes, silhouette retained|delay burst
Shape the Way|0|3|6.0|4|ignite braziers, fill basins, lift stones, turn vents at marked puzzles|small sustained element stream|combat cancels; manual alternatives exist
"""),
    ("Psion", "Focus", "100; regenerates 8/s; interrupted casts remove additional 10 Focus", "humanoid", "dark tailored coat, suspended crystal halo fragments; lilac line distortions", "tuned hum / soft glass / low pressure click", "Anchor: Mind Bulwark returns 10 Focus on full absorption; Vector: successful displacement empowers Thought Spike by 20%", "Control space through anticipated lines; interrupts and cover deny setup", """
Thought Spike|15|4|0.5|14|1.0P psychic|touch temple; thin lilac lance|cover or interrupt
Vector Push|22|14|0.6|10|0.5P and 3m collision-checked push|palm plane gathers|dodge line; no wall penetration
Gravity Knot|25|16|0.8|12|2m disk slows 30% for 3s; 0.5P|point then compress; inward lines|leave before knot closes
Mind Bulwark|20|18|0.3|10|ally shield 0.9P for 4s|angular head-height ring|switch target
Echo Step|18|12|0.2|5|dash along clear ground; leave harmless visible decoy for 2s|two offset silhouettes|real player remains targetable; decoy labelled on consider
Still Horizon|45|75|1.0|5|0.7s stun then 0.4P/s for 3s in stationary disk|horizon line folds|leave telegraph or interrupt
Mental Needle|0|1.0|0.25|12|0.65P psychic basic|single glass flick|cover
Mental Slip|15|10|0.1|self|remove slow and reduce next hit 40% within 1s|brief outline offset|bait before larger hit
Surface Memory|0|3|6.0|4|read imprints on authored objects; no mind reading player messages|hand held near object|combat cancels
"""),
    ("Symbiont", "Bond", "100; regenerates 7/s; host adaptations Guardian, Stalker, Mender share HP and cooldowns", "humanoid", "recognizable human host with amber resin tendrils, bark plates and distinct limb attachments", "wet fibre / hollow wood / heartbeat", "Mutualist: Mender heals grant 0.2P shield; Predator: Stalker attacks on marked targets restore 4 Bond once per second", "Trade armour, reach and healing through adaptations; focus exposed host during swaps", """
Thorn Lash|15|5|0.45|8|1.0P physical line; Stalker adds 2m range|arm draws tendril taut|sidestep line
Guardian Graft|20|12|0.6|self|enter Guardian; +20% armour, -10% speed|shoulder plates bloom|kite
Stalker Graft|15|10|0.5|self|enter Stalker; lash +2m and movement +5%|forearm thorns unfold|close distance after missed lash
Mender Graft|20|12|0.6|self|enter Mender; basic heals lowest-HP party member within 5m for 0.15P per hit|luminescent seed pods open|separate party or anti-heal
Spore Covenant|25|18|0.7|8|one ally receives 0.8P heal over 4s; enemies within 2m slowed 20%|seed travels then low spores|cleanse or move away
Perfect Union|45|75|0.8|self|6s; current adaptation bonus doubled; 0.8P shield; no new body or immunity|host and parasite breath synchronize|disengage then punish cooldown
Host Strike|0|1.0|0.3|2.5|0.8P basic; Mender secondary heal as above|arm strike with tendril follow-through|range
Reflex Husk|15|10|0.1|self|0.8P shield for 1s|rapid bark shell|sustained damage
Living Interface|0|3|6.0|3|connect to marked organic machinery and growth clues|root fingertips into socket|combat cancels; no access to enemy player data
"""),
    ("Powered Armour", "Capacitor", "100; regenerates 6/s when not firing; Assault, Bastion, Support configurations selected in town", "heavy", "broad industrial suit, visible pilot viewport, orange warning marks and massive readable feet", "heavy servo / cartridge slam / grounded recoil", "Bastion: Brace Projector lasts 1s longer; Assault: Siege Round splash +0.3P but cooldown +2s", "Manage power and firing commitment; flanks and line-of-sight breaks beat frontal strength", """
Siege Round|22|6|0.85|16|1.5P direct; 0.4P splash within 2m|shoulder cannon unfolds; orange targeting lane|evade lane during long wind-up
Anchor Shot|18|14|0.65|12|0.7P and 25% slow 3s|recoil brace; cable-shaped tracer|cleanse or sidestep
Brace Projector|25|20|0.6|4|3s directional cover; incoming frontal ranged damage -30%; no physical wall|deploy low shield fins|flank; effects still obey town rules
Servo Rush|20|12|0.4|5|ground dash; stop before collision, 0.5P contact once|vents fire; heavy footfalls|sidestep endpoint
Field Patch|25|24|1.2|self|heal 1.0P; movement interrupts|open shoulder service hatch|interrupt or pressure
Fortress Protocol|50|75|1.0|self|6s immobile; +20% damage, +25% armour; can cancel, no refund|legs anchor, cannon rises|flank or leave line of sight
Repeater|6|1.2|0.25|13|0.9P physical ranged basic|compact mechanical burst|cover
Hard Lock|12|10|0.1|self|60% frontal damage reduction for 0.8s|plates interlock|flank
Heavy Access|0|3|6.0|3|operate marked winches, pressure plates and bulkheads|braced mechanical interaction|combat cancels; alternate manual lever route
"""),
    ("Adventurer", "Stamina", "100; regenerates 10/s; starter guild levels 1–5", "humanoid", "weathered linen coat, practical leather, simple iron weapon", "leather / iron / breath", "No mastery branch; choose a full guild at level five", "Learn movement, readable danger and interaction before specialization", """
Heavy Cut|15|5|0.5|2.5|1.2P melee|raised blade|sidestep
Dust Throw|20|12|0.4|4|0.3P and 20% slow 2s|dust cone|step back
Field Dressing|25|20|1.5|self|heal 0.8P|wrap bandage|interrupt
Spot Weakness|10|14|0.3|10|next basic gains 0.4P within 4s|point at target|break line of sight
Stone Toss|15|10|0.5|10|0.5P and interrupt|overhand stone|dodge
Second Wind|40|60|0.5|self|heal 1P and recover 20 Stamina|steady breath|pressure after cooldown
Strike|0|1.1|0.3|2.5|0.8P melee basic|short blade swing|range
Guard|10|8|0.1|self|40% damage reduction for 1s|weapon held across body|delay attack
Careful Examine|0|3|2.0|4|inspect authored clue or object; universal alternative to specialist utility|lean and inspect|combat interrupts lengthy interactions
"""),
]

MAPS = rows("""
highcross|Highcross|C1|safe|240x220|Astrolabe plaza, three gates, inn, exchange, guild row|Three radial exits with two streets to each; safe bank and respawn|astrolabe|Nemi
understeps|The Understeps|C1|open|100x100|Sealed town stair, cistern, missing-hour chamber|Two exits beyond signed safety threshold; flooding puzzle detour|cistern clock|Mara
training|Concord Practice Rooms|C1|safe|60x60|Twelve replayable guild simulations|Clearly designated safe training; PvE dummies and authored trial actors|practice obelisk|Orren Vale
arena|Concord Arena|C1|open|80x80|Combat floor, pillars, two ramps|Separate loading entrance from town; no safe combat-floor pocket|concord gong|Arena Steward
briar-march|Briar March|C1|open|300x240|Toll bridge, standing stones, lost courier path|Bridge and riverbank flank; secret inscription grove|toll bridge|The Cartographer
hollow-abbey|Hollow Abbey|C1|open|160x160|Bell court, flooded crypt, binding chamber|Cloister and drainage routes; lost-verse shortcut|silent bell|Mara
rustwater-verge|Rustwater Verge|C1|open|300x240|Salvage camp, pump spine, relay yards|Raised road and maintenance culvert; optional generator room|flooded relay tower|Patch
station-nine|Station Nine|C1|open|180x150|Security concourse, shutters, reactor chamber|Main corridor and vent loop; coolant bypass|reactor core|Dr. Ilex
wrong-fair|The Wrong Fair|C1|open|280x240|Lantern midway, shadow tents, bargain stalls|Two circular paths; concealed backstage bridge|inverted carousel|The Velvet Usher
mirror-theatre|Mirror Theatre|C1|open|160x160|Foyer, repeated stage, mirrored wings|Stage and backstage loops; shadow door|fractured proscenium|The Velvet Usher
crown-of-winter|Crown of Winter|C2|open|360x280|Snow settlement exterior, ice descent, buried city|Switchback and frozen aqueduct; settlement interiors are separately marked safe polygons|icebound city gate|Tala Frostwright
glass-megacity|The Glass Megacity|C2|open|360x280|Corporate plaza, synthetic quarter, elevator base|Service alleys and elevated walkways; staffed civic hall is marked safe|orbital elevator|Civic Echo
unwritten-sea|The Unwritten Sea|C2|open|360x280|Three islands, tide bridges, unfinished observatory|Two timed bridge circuits; dock sanctuary is marked safe|empty lighthouse|The Cartographer
""")

NPCS = rows("""
Mara|Bellkeeper; bronze prosthetic hand, travel coat|highcross|bell and tomorrow clues|humanoid
Orren Vale|Knight mentor; repaired plate and faded cream mantle|highcross|Knight trial|humanoid
Dr. Ilex|Cyborg mentor; precise metal fingers and white ceramic coat|highcross|Cyborg trial, reactor advice|humanoid
Mother Sable|Necromancer mentor; funerary bronze and layered veil|highcross|Necromancer trial|humanoid
Archivist Vey|Mage mentor; indigo coat, orbiting wooden glyph frame|highcross|Mage trial|humanoid
Sister Ren|Monk mentor; sand wraps and one polished wooden bracer|highcross|Monk trial|humanoid
Keeper Sol|Priest mentor; pilgrim mail and split sun focus|highcross|Priest trial|humanoid
Lark Fen|Bard mentor; russet coat and weathered lyre|highcross|Bard trial|humanoid
Many-in-Reeds|Changeling mentor; crest shared with wolf and raven forms|highcross|Changeling trial|humanoid
The Fourfold Ember|Elemental mentor; four slow material quadrants|highcross|Elemental trial|elemental
Serin Quill|Psion mentor; graphite clothes and floating crystal fragments|highcross|Psion trial|humanoid
Host Aster|Symbiont mentor; amber root collar and visible human face|highcross|Symbiont trial|humanoid
Marshal Ferrum|Powered Armour mentor; retired suit, orange service marks|highcross|Powered Armour trial|heavy
Patch|Cheerful salvage robot; oversized pack, three-point rolling base|rustwater-verge|Rustwater jobs and grid repair|drone
Nemi|Innkeeper; rolled sleeves, brass key ring, braided hair|highcross|intro and rumours|humanoid
The Velvet Usher|Carnival guide; porcelain mask, immaculate violet coat, detached shadow|wrong-fair|shadow mystery and theatre|humanoid
The Cartographer|Recurring explorer; map cases and weathered sea-green cloak|briar-march|cross-realm mystery, later sea|humanoid
Edda Forge|Smith; soot apron, broad gloves|highcross|smithing merchant|humanoid
Ro Coil|Engineer; lens goggles and copper harness|highcross|engineering merchant|humanoid
Ina Prism|Enchanter; inked sleeves and prism loupe|highcross|enchanting merchant|humanoid
Tess Kettle|Cook; red scarf and heavy ladle|highcross|cooking and supplies|humanoid
Ledger|Banker; narrow spectacles and numbered brass keys|highcross|bank and transactions|humanoid
Arena Steward|Referee; striped black and bronze tabard|highcross|arena rules and results|humanoid
Tala Frostwright|Ice-city surveyor; quilted blue coat and frost tools|crown-of-winter|winter quest pair|humanoid
Civic Echo|Synthetic citizen; translucent ceramic face and office cloak|glass-megacity|megacity quest pair|humanoid
""")

CREATURES = rows("""
gate-mite|Gate Mite|C1|training|quadruped|small ceramic-backed animal|short bite, visible lane lunge; tutorial recovery pauses|1
briar-hound|Briar Hound|C1|briar-march|quadruped|lean wet wolf with thorn crest|circle, flank, committed 0.8s pounce|5
pack-matriarch|Pack Matriarch|C1|briar-march|quadruped|larger hound with pale scar crest|howl recruits two hounds; interrupt howl|8
toll-shield|Toll Shieldbearer|C1|briar-march|humanoid|mismatched mail, road-sign shield|front guard then 1s bash; vulnerable behind|6
toll-archer|Toll Archer|C1|briar-march|humanoid|ochre hood and recurved bow|retreat behind shield; 0.8s aimed shot|6
abbey-revenant|Abbey Revenant|C1|hollow-abbey|humanoid|corroded mail, pale lantern chest|reforms once unless visible binding interrupted|10
bell-acolyte|Bell Acolyte|C1|hollow-abbey|humanoid|rope belt and bronze bell headgear|channel binding shield; prioritize interrupt|11
salvage-drone|Salvage Drone|C1|rustwater-verge|drone|three-lobed hovering repair tool|repairs weakest machine; fragile exposed core|5
scrap-stalker|Scrap Stalker|C1|rustwater-verge|quadruped|canine scrap limbs, sensor eye|tracks sound then charges marked lane|7
coil-sentry|Coil Sentry|C1|rustwater-verge|heavy|short stationary turret|rotating cone fire, 2s cooldown exposure|8
reactor-construct|Reactor Construct|C1|station-nine|heavy|broad ceramic shoulders, hot open core|heat rises visibly, vent or delayed slam|11
security-warden|Security Warden|C1|station-nine|humanoid|jointed enforcer with shutter shield|stun baton and ranged warning line|12
mask-juggler|Mask Juggler|C1|wrong-fair|humanoid|striped velvet, three floating masks|alternates throw and dash on obvious mask cue|5
ribbon-dancer|Ribbon Dancer|C1|wrong-fair|humanoid|long violet ribbons and white shoes|sweeping line attacks; planted feet during wind-up|7
ticket-mimic|Ticket Mimic|C1|wrong-fair|mimic|folded ticket booth with walking legs|false booth visibly breathes; opens to bite|8
mirror-double|Mirror Double|C1|mirror-theatre|humanoid|silver cloth, delayed reflection|replays last two basic/ability shapes at 70% damage using whitelisted scripts|12
stagehand-hollow|Hollow Stagehand|C1|mirror-theatre|humanoid|black coat, empty brass face|moves spotlights; telegraphed trap pads|11
frost-pilgrim|Frost Pilgrim|C2|crown-of-winter|humanoid|ice-choked travelling armour|slow spear reach and freezing path|23
glass-drake|Glass Drake|C2|crown-of-winter|dragon|small winged ice lizard|breath lane then vulnerable wing fold|25
corporate-enforcer|Corporate Enforcer|C2|glass-megacity|heavy|clean corporate ceramic suit|paired suppressing fire and flank|24
memory-leech|Memory Leech|C2|glass-megacity|drone|floating segmented silver parasite|drains resource channel; interruptable|25
ink-ray|Ink Ray|C2|unwritten-sea|ray|flat ink-swimming creature near ground|sweeps bridge with readable wake|25
unfinished-sailor|Unfinished Sailor|C2|unwritten-sea|humanoid|blank cloth body and inked limbs|telegraphs missing limb before it manifests|26
""")

BOSSES = rows("""
bellbound-warden|The Bellbound Warden|C1|hollow-abbey|heavy|bell-chest knight, chains, slate pauldrons|bell sweep; binding adds; three toll rings|Interrupt acolytes; learned verse delays third ring|13
station-nine-custodian|Station Nine Custodian|C1|station-nine|heavy|four-legged reactor frame with humanoid service arms|lane laser; shutter squeeze; overheating core|Route coolant; attack exposed core; vents announce reset|15
master-of-revels|The Master of Revels|C1|mirror-theatre|humanoid|towering velvet coat, porcelain rotating mask|spotlight chase; mirror duet; final curtain|Watch act placards; use shadow door to cut an add wave|17
white-regent|The White Regent|C2|crown-of-winter|dragon|ancient ice dragon with brass relics embedded in scales|breath sweep; falling ice; broken wing dive|Melt marked anchors; shelter behind durable pillars|27
glass-executor|The Glass Executor|C2|glass-megacity|heavy|corporate judgement chassis, many glass panels|audit beams; confiscation drones; elevator surge|Break declared power nodes in shown order|29
unwritten-captain|The Unwritten Captain|C2|unwritten-sea|humanoid|blank admiral outlined by a moving ink sea|tidal lanes; erased platforms; authored storm|Restore bridge names; read tide before moving|30
""")

QUESTS = rows("""
arrival|A Stall in the Storm|C1|highcross|Nemi|none|lift stall; talk to Nemi; inspect fallen token|movement and interaction|level 2, supplies|cannot lose token; reset interaction on reload
first-danger|The Gate Spills|C1|training|Orren Vale|arrival|enter marked safe practice; evade mite; interrupt; return|cast timing|level 3|repeatable practice without duplicate XP
first-secret|A Mark Between Hours|C1|highcross|Mara|first-danger|examine astrolabe; rotate three marked rings; present token|optional inspection clue|level 5, guild choice|captioned clue; skip hint never removes optional reward
thirteenth-bell|The Thirteenth Bell|C1|briar-march,hollow-abbey|Mara|first-secret|inspect forest epitaph; copy abbey inscription; match captioned melody; open crypt; defeat or pacify Warden using verse|thirteen marks distinguish false verse|Bellkeeper's Blade, 3 quest points|wrong melody resets rings only; alternate guild-independent route
light-rustwater|A Light for Rustwater|C1|rustwater-verge,station-nine|Patch|first-secret|collect relay; trace three circuits; choose clinic or pumps first; stabilize reactor|power map shows load limits|Drone Module, 3 quest points|choice changes personal service discount or route; both paths keep main quest possible
stolen-shadow|The Stolen Shadow|C1|wrong-fair,mirror-theatre|The Velvet Usher|first-secret|observe three performers; compare reflected gestures; present evidence; chase shadow; enter hidden performance|shadow mismatches repeated emote|Borrowed Shadow cosmetic disguise, 3 quest points|wrong suspect gives new observation; disguise never hides PvP identity
died-tomorrow|The Man Who Died Tomorrow|C1|briar-march,station-nine,wrong-fair|The Cartographer|first-secret|copy epitaph; read prediction terminal; recover carnival memory; compare timestamps; confront Usher|three timestamps refer to the same missing hour|Glass Compass, 5 quest points|steps work in any realm order; flags individual, clues can be shared
missing-hour|The Missing Hour|C1|understeps|Mara|died-tomorrow,thirteenth-bell,light-rustwater,stolen-shadow|assemble four evidence pieces; turn cistern clock; expose the forged memory; choose preserve or disclose|author of sabotage is a future echo of Cartographer|chapter title, mastery token, 5 quest points|choice affects dialogue and epilogue, never invalidates another player's world
winter-ledger|The Winter Ledger|C2|crown-of-winter|Tala Frostwright|missing-hour|survey three iced memorials; thaw dated tablets; identify the dragon's stolen oath; face White Regent|false date exposed by bell clue|Frost Seal relic, 4 quest points|no irreversible tablet destruction
warm-window|One Warm Window|C2|crown-of-winter|Tala Frostwright|missing-hour|gather insulation; restore one safe settlement room; guide stranded scholar|smoke tells intact flue|cooking recipe, 1 quest point|escort can be recalled; town safety polygons explicit
citizen-zero|Citizen Zero|C2|glass-megacity|Civic Echo|missing-hour|collect three memories; dispute synthetic citizenship audit; break Executor nodes; return records|authorship and identity are separate|Glass Warrant relic, 4 quest points|failed audit permits evidence retry
elevator-song|The Elevator Song|C2|glass-megacity|Civic Echo|missing-hour|trace maintenance chime; align relays; rescue lift passengers|rhythm also shown as symbols|engineering recipe, 1 quest point|reset elevator at checkpoint on failure
shore-unwritten|The Shore Unwritten|C2|unwritten-sea|The Cartographer|missing-hour|name three island anchors; follow tide map; face Unwritten Captain; reconcile future echo|names learned in prior realms rebuild bridge|Accord relic, 5 quest points, prestige eligibility|tide recovery returns to last safe dock, no soft lock
bottle-tomorrow|A Bottle for Tomorrow|C2|unwritten-sea|The Cartographer|missing-hour|collect messages on three bridges; order dates; launch one reply|message dates match missing hour|cosmetic sail, 1 quest point|letters are persistent quest flags
""")

TRIALS = rows("""
Knight|An Oath Without Witnesses|Orren Vale|protect courier instead of chasing duelist; block, interrupt, return|breaking oath triggers retry and explanation
Cyborg|The Heat Between Beats|Dr. Ilex|fire until warned; vent; interrupt overloaded machine; stabilize|overheat resets dummy, no permanent damage
Necromancer|A Name Before Service|Mother Sable|ask remnant its name; raise echo; command; choose preserve or consume|both choices viable with different mentor response
Mage|Two Truths of Fire|Archivist Vey|prepare two elements; combine against marked dummies; ward backlash|wrong combination shows clue
Monk|The Unstruck Bell|Sister Ren|alternate attacks; counter obvious strike; cross moving hazards|mistake resets rhythm only
Priest|The Weight of a Vow|Keeper Sol|choose vow; heal pilgrim; cleanse curse; smite ward guardian|both vows can complete through different timing
Bard|A Song for Four Feet|Lark Fen|layer two songs; move practice allies; interrupt; finish chord|visual beat track supports muted audio
Changeling|Three Ways Through|Many-in-Reeds|wolf track; raven vent; beetle latch; pounce dummy|forms cannot leave authored practice route
Elemental|A Vessel for Weather|The Fourfold Ember|ignite basin; fill channel; hold plate; turn vent; surge|all four forms used; failed puzzle resets locally
Psion|The Space Between Thoughts|Serin Quill|push dummy to mark; shield ally; read imprint; avoid reflected spike|displacement never crosses collision
Symbiont|Permission to Grow|Host Aster|hear host; switch three grafts; heal and guard practice ally|explicit authored host consent; no coercive reward branch
Powered Armour|The Suit Remembers|Marshal Ferrum|brace projectile; vent power through pause; rush; anchor cannon|resource depletion recoverable without restart
""")

JOBS = rows("""
briar-march|Hounds at the Toll|The Cartographer|break pack howl, defeat matriarch|briar fibre
briar-march|The Missing Courier|Nemi|find satchel, follow footprints, bring courier home|copper marks
briar-march|Standing Stone Weather|Mara|inspect and align three marked stones|rune chalk
hollow-abbey|Names Under Water|Mara|collect three readable grave names, present record|abbey ash
hollow-abbey|Bind the Binder|Mother Sable|interrupt two acolyte bindings, recover seal|bronze fragment
hollow-abbey|A Dry Way Home|The Cartographer|open drainage loop and inspect hidden reliquary|travel anchor
rustwater-verge|A Pack for Patch|Patch|recover dropped pack and defeat scrap stalker|copper wire
rustwater-verge|Unstable Component|Ro Coil|retrieve core, vent at two sockets, deliver|ceramic shard
rustwater-verge|The Pump Line|Patch|defend moving repair unit through three stops|coolant
station-nine|Quiet the Alarm|Dr. Ilex|trace alarm source and disable three sentries|circuit board
station-nine|Borrowed Clearance|Ro Coil|find badge, compare log, open maintenance door|relay recipe
station-nine|Hot Work|Patch|cool overheated constructs and salvage cores|reactor glass
wrong-fair|Tickets for Nobody|The Velvet Usher|spot breathing booth, defeat mimic, return real tickets|velvet scrap
wrong-fair|The Laughing Mask|Nemi|follow laugh captions, observe juggler, recover mask|ink vial
wrong-fair|A Walk Without Feet|The Cartographer|follow independent shadow around midway loop|shadow thread
mirror-theatre|Rehearsal Notes|The Velvet Usher|observe repeat sequence and reorder stage cards|mirror dust
mirror-theatre|Lights Out Please|The Velvet Usher|redirect three spotlights while dodging stagehands|porcelain shard
mirror-theatre|A Better Ending|Mara|recover script page and perform alternate final gesture|theatre seal
""")

KITS = {
    "town": ("C1", "cobble-tile wall-straight wall-corner arch door window roof-straight roof-corner stair balcony chimney inn-sign guild-sign market-stall lantern bench table chair crate barrel fountain bank-counter forge cooker astrolabe gate-fantasy gate-science gate-chaos safe-boundary-post practice-obelisk arena-gong"),
    "forest": ("C1", "ground-tile mud-path rock-small rock-large cliff tree-oak tree-pine tree-dead bush fern grass log bridge-plank bridge-stone fence standing-stone toll-barrier courier-cart cave-mouth"),
    "abbey": ("C1", "floor wall arch pillar stair crypt-door coffin grave-marker bell bell-rope binding-pedestal drain-grate stained-glass altar rubble water-plane cistern-clock"),
    "industrial": ("C1", "floor wall corner doorway shutter catwalk stair railing pipe-straight pipe-bend pipe-valve pump relay cabinet terminal reactor coolant-tank cable spool vent lift-platform warning-sign salvage-pile"),
    "carnival": ("C1", "ground booth tent-small tent-large ribbon-post lantern mask-display ticket-roll carousel stage curtain mirror-panel spotlight backstage-door seat prop-chest ink-basin bargain-counter"),
    "winter": ("C2", "snow-tile ice-wall ice-arch frozen-pillar ice-bridge snow-pine brazier insulated-door glacier cliff tablet city-gate"),
    "city": ("C2", "glass-floor glass-wall glass-corner glass-door glass-roof walkway lift transit-sign civic-terminal memory-rack power-node city-plant"),
    "sea": ("C2", "island-small island-large tide-bridge dock rope-post sail mast name-stone blank-lighthouse ink-water observatory-wheel bottle"),
}

SCREENS = rows("""
title|Title and connection
characters|Character selection
creation|Character creation
intro|Introduction and trial guidance
exploration|Exploration HUD
combat|Combat HUD and boss mechanics
dialogue|NPC conversation and evidence
inventory|Inventory and equipment
guild|Guild selection and ability loadout
progression|Character development
atlas|World atlas and local map
journal|Quest journal and codex
merchant|Merchant
crafting|Crafting
bank|Bank
social|Friends, party, Company and chat
trade|Player trade and confirmation
arena|Arena setup, match and results
death|Death and recovery
corpse|Corpse loot claim
settings|Settings, accessibility and help
connection|Loading, disconnect and reconnection
report|Mute and player report
""")

RIGS = {
    "humanoid": "idle walk run strafe-left strafe-right turn-left turn-right basic-1 basic-2 cast-start cast-loop cast-release block dodge hit stagger knockdown get-up death interact kneel sit talk point wave cheer revive gather craft instrument",
    "heavy": "idle walk run turn-left turn-right fire charge brace vent hit stagger death interact deploy recover",
    "quadruped": "idle walk run turn-left turn-right bite pounce dodge howl hit stagger death sniff shift-in shift-out",
    "raven": "idle ground-hop glide-low peck feather-shot dodge hit death shift-in shift-out",
    "beetle": "idle walk run turn mandible brace dodge hit death shift-in shift-out latch",
    "elemental": "idle drift turn strike cast coalesce surge hit collapse form-change interact",
    "drone": "idle hover move turn repair fire hit break deploy recall",
    "mimic": "idle breathe walk open bite recoil hit death",
    "dragon": "idle walk run wing-fold breath leap land claw hit death roar",
    "ray": "idle glide turn dive sweep hit dissolve",
}

def build() -> None:
    guilds, abilities = [], []
    for name, resource, rule, rig, look, sound, talents, identity, table in GUILDS:
        gid = slug(name)
        ids = []
        for i, row in enumerate(rows(table)):
            title, cost, cd, cast, reach, effect, cue, counter = row
            aid = f"ability.{gid}.{slug(title)}"
            ids.append(aid)
            abilities.append(dict(id=aid, guild=gid, name=title, role=["slot1", "slot2", "slot3", "slot4", "slot5", "signature", "basic", "defence", "utility"][i], cost=cost, cooldown_seconds=float(cd), windup_seconds=float(cast), range_metres=reach, effect=effect, visual_cue=cue, counterplay=counter, chapter="C1", rig=rig))
        guilds.append(dict(id=gid, name=name, resource=resource, resource_rule=rule, rig=rig, appearance=look, audio=sound, mastery_choice=talents, identity=identity, abilities=ids, full_guild=name != "Adventurer"))
    maps = [dict(zip(["id", "name", "chapter", "safety", "size_metres", "landmarks", "routes", "hero_prop", "guide"], r)) for r in MAPS]
    for g in guilds:
        if g["full_guild"]:
            maps.append(dict(id=f"hall-{g['id']}", name=f"{g['name']} Hall", chapter="C1", safety="safe", size_metres="24x20", landmarks=f"{g['name']} emblem, mentor station, relic display", routes="Town doorway, visible practice portal; services usable from accessible ground floor", hero_prop=f"{g['name']} guild altar", guide=next(t[2] for t in TRIALS if t[0] == g["name"])))
    npcs = [dict(id=slug(r[0]), name=r[0], description=r[1], map=r[2], role=r[3], rig=r[4], chapter="C2" if r[2] in ["crown-of-winter", "glass-megacity"] else "C1") for r in NPCS]
    creatures = [dict(zip(["id", "name", "chapter", "map", "rig", "description", "behaviour", "level"], r)) for r in CREATURES]
    bosses = [dict(zip(["id", "name", "chapter", "map", "rig", "description", "mechanics", "counterplay", "level"], r)) for r in BOSSES]
    quests = [dict(zip(["id", "name", "chapter", "map", "giver", "requires", "steps", "clue", "reward", "recovery"], r)) for r in QUESTS]
    for guild, title, giver, steps, recovery in TRIALS:
        quests.append(dict(id=f"trial-{slug(guild)}", name=title, chapter="C1", map="training", giver=giver, requires="first-secret", steps=steps, clue="Mentor explains mechanics; narrated text and visual practice cues", reward=f"{guild} admission, starter equipment; only first joined trial grants world XP", recovery=recovery))
    for region, title, giver, steps, reward in JOBS:
        quests.append(dict(id=slug(title), name=title, chapter="C1", map=region, giver=giver, requires="first-secret", steps=steps, clue="Rumour gives landmark, local inspection gives exact object", reward=reward, recovery="No quest item drops on death; escort or timer resets at its checkpoint; repeat reward daily reduced, first completion permanent"))
    equipment = []
    implements = ["sword", "shield", "pulse-arm", "lantern", "staff", "hand-wraps", "sun-focus", "lyre", "form-totem", "element-core", "psionic-focus", "graft-seed", "suit-cannon", "bow", "mace"]
    for name in implements:
        equipment.append(dict(id=name, name=name.replace("-", " ").title(), chapter="C1", type="visible-implement", tiers=["starter", "journey", "relic"], appearance="same base silhouette, three material/attachment variants"))
    for name in ["Bellkeeper's Blade", "Drone Module", "Funerary Lantern", "Glass Compass", "Borrowed Shadow", "Oath Brooch", "Ember Lens", "Reed Beads", "Pilgrim Seal", "Copper Pick", "Hunter Crest", "Worldheart Shard", "Mind Prism", "Living Buckle", "Siege Regulator"]:
        equipment.append(dict(id=slug(name), name=name, chapter="C1", type="relic", tiers=["unique"], appearance="readable single motif; attachment or icon where not hand-held"))
    for name in ["Frost Seal", "Glass Warrant", "Accord Relic", "Cosmetic Sail"]:
        equipment.append(dict(id=slug(name), name=name, chapter="C2", type="relic", tiers=["unique"], appearance="realm material and heraldic emblem"))
    materials = "briar-fibre rune-chalk abbey-ash bronze-fragment copper-wire ceramic-shard coolant circuit-board reactor-glass velvet-scrap ink-vial shadow-thread mirror-dust porcelain-shard theatre-seal forage-portion clean-water berry tea-leaf frost-thread glass-foil tide-ink".split()
    consumables = "trail-stew berry-tonic ward-salt repair-kit clarity-tea hearty-broth".split()
    for n in materials + consumables:
        equipment.append(dict(id=n, name=n.replace("-", " ").title(), chapter="C2" if n in materials[-3:] else "C1", type="material" if n in materials else "consumable", tiers=["base"], appearance="inventory icon; shared bag or vial for world pickup"))
    content = dict(version=1, date="2026-09-30", status="proposed-specification", guilds=guilds, abilities=abilities, maps=maps, npcs=npcs, creatures=creatures, bosses=bosses, quests=quests, equipment=equipment, screens=[dict(id=r[0], name=r[1]) for r in SCREENS], rigs=RIGS, environment_kits={k:dict(chapter=v[0], pieces=v[1].split()) for k,v in KITS.items()})
    content["version"] = 2
    content["pvp_rules"] = dict(
        specification="docs/pvp-and-outlaw-rules.md",
        confirmed=dict(normal_victim_items=1, red_victim_items=2, red_on_aggression=True, guards_attack_red=True, merchants_refuse_red=True),
        proposed_defaults=dict(assault_seconds=600, unlawful_kill_seconds=3600, countdown="connected-server-playtime", clear_on_death=False, loot_selection="killer-choice-pending-user-preference", equipped_items_eligible=True, quest_and_starter_items_protected=True, self_defence_exempt=True, claim_seconds=120, loot_channel_seconds=3),
    )
    content["law_agents"] = [dict(id="concord-watch", name="Concord Watch", chapter="C1", rig="humanoid", model="model.crowd.guard", behavior="Patrol town gates, Exchange and Guild Row; detect red players by sight; polearm strike, shield interrupt and approach dash; no collateral damage", specification="docs/pvp-and-outlaw-rules.md")]

    assets = []
    budgets = dict(model_character="char-30k-2k", model_form="form-20k-2k", model_npc="npc-15k-1k", model_creature="mob-18k-1k", model_boss="boss-50k-2k", model_prop="prop-5k-atlas", model_equipment="equip-4k-1k", animation="clip-30fps", vfx="vfx-512", audio="audio-48k", ui="ui-vector-or-256", reference="reference-2k", scene="scene-budget", material="pbr-1k", text="text-data")
    def add(aid, kind, owner, chapter="C1", brief="", deps=(), rig=None, variants=None):
        ext = {"reference":"png", "animation":"glb", "vfx":"json", "audio":"ogg", "ui":"svg", "scene":"json", "material":"ktx2", "text":"json"}.get(kind, "glb")
        if kind == "ui" and aid.startswith(("portrait.", "codex.", "item.icon.", "icon.", "map.", "clue.")):
            ext = "png"
        assets.append(dict(id=aid, kind=kind, owner=owner, chapter=chapter, status="planned", brief=brief, dependencies=list(deps), rig=rig, variants=variants or [], budget=budgets[kind], output=f"assets/{kind}/{aid}.{ext}", acceptance="docs/asset-bible.md", source_job=None, source_hash=None, license_evidence=None, verified_in_browser=False))
    for rig, clips in RIGS.items():
        chapter = "C2" if rig in ["dragon", "ray"] else "C1"
        add(f"rig.{rig}", "model_character", rig, chapter, "Blender master skeleton, sockets, skin test dummy", rig=rig)
        for clip in clips.split():
            add(f"anim.{rig}.{clip}", "animation", rig, chapter, f"{clip}; root-motion policy and markers in bible", [f"rig.{rig}"], rig)
    for g in guilds:
        gid = g["id"]
        add(f"ref.guild.{gid}", "reference", gid, brief=f"front/side/back/three-quarter A-pose, material callouts; {g['appearance']}")
        add(f"model.guild.{gid}", "model_character", gid, brief=g["appearance"] + "; fitted outfit on both human builds, except active creature/elemental bodies specified separately", deps=[f"ref.guild.{gid}", "rig.humanoid"], rig="humanoid", variants=["starter", "journey", "relic"])
        add(f"ui.guild.{gid}", "ui", gid, brief="emblem and resource symbol")
    for build_name in ["slender", "broad"]:
        add(f"body.{build_name}", "model_character", "creation", brief="1.75–1.9m normalized shared humanoid; one skeleton; no sex-locked guilds", deps=["rig.humanoid"], rig="humanoid")
    for i in range(1, 7):
        add(f"head.{i:02}", "model_character", "creation", brief="distinct adult face; six skin swatches shared; no facial-motion requirement", deps=["rig.humanoid"], rig="humanoid")
        add(f"hair.{i:02}", "model_prop", "creation", brief="six cap-compatible hair silhouettes; short, tied, coiled, cropped, braided, bald option via hidden mesh")
    forms = [
        ("changeling-wolf", "quadruped"), ("changeling-raven", "raven"), ("changeling-beetle", "beetle"),
        ("elemental-fire", "elemental"), ("elemental-water", "elemental"), ("elemental-earth", "elemental"), ("elemental-air", "elemental"),
        ("symbiont-guardian", "humanoid"), ("symbiont-stalker", "humanoid"), ("symbiont-mender", "humanoid"),
        ("armour-assault", "heavy"), ("armour-bastion", "heavy"), ("armour-support", "heavy"),
        ("necromancer-echo", "quadruped"), ("cyborg-repair-drone", "drone")]
    for name, rig in forms:
        add(f"ref.form.{name}", "reference", name, brief="isolated orthographic body with separated limbs; no effects obscuring anatomy")
        add(f"model.form.{name}", "model_form", name, brief="unique form silhouette, shared HP and explicit hit capsule", deps=[f"ref.form.{name}", f"rig.{rig}"], rig=rig)
    for a in abilities:
        stem, owner = a["id"].removeprefix("ability."), a["id"]
        add(f"icon.{stem}", "ui", owner, brief=f"{a['name']}: single readable motif from {a['visual_cue']}")
        add(f"anim.action.{stem}", "animation", owner, brief=f"{a['windup_seconds']}s wind-up; {a['visual_cue']}; markers before commit/impact/recovery", deps=[f"rig.{a['rig']}"], rig=a["rig"])
        add(f"vfx.{stem}", "vfx", owner, brief=f"{a['visual_cue']}; anticipation/active/decay; geometry follows {a['range_metres']}m range and effect shape")
        for phase in ["prepare", "resolve"]:
            add(f"sfx.{stem}.{phase}", "audio", owner, brief=f"{phase}: {a['name']}; guild sound palette; caption if gameplay critical")
    # Form-dependent actions must have their own compatible motion bindings.
    for guild_id, extra_rigs in [("changeling", ["raven", "beetle"]), ("elemental", ["elemental"]), ("powered-armour", ["heavy"])]:
        for a in [x for x in abilities if x["guild"] == guild_id]:
            for rig in extra_rigs:
                if a["rig"] != rig:
                    add(f"anim.form.{guild_id}.{slug(a['name'])}.{rig}", "animation", a["id"], brief="species-specific action; unavailable actions use disabled pose, never humanoid retarget", deps=[f"rig.{rig}"], rig=rig)
    for category, entities in [("npc", npcs), ("creature", creatures), ("boss", bosses)]:
        for e in entities:
            eid, chapter = e["id"], e["chapter"]
            add(f"ref.{category}.{eid}", "reference", eid, chapter, e["description"] + "; silhouette and material sheet")
            add(f"model.{category}.{eid}", f"model_{category}", eid, chapter, e["description"], [f"ref.{category}.{eid}", f"rig.{e['rig']}"], e["rig"])
            if category == "npc":
                add(f"portrait.{eid}", "ui", eid, chapter, "painted portrait consistent with model")
                for line in ["greeting", "quest-turn", "farewell"]:
                    add(f"voice.{eid}.{line}", "audio", eid, chapter, f"original or licensed voice, 1–6 seconds, full transcript; {line}")
                add(f"dialogue.{eid}", "text", eid, chapter, "greeting, topics, evidence, services, quest branch, repeat and unavailable states")
            else:
                add(f"codex.{eid}", "ui", eid, chapter, "creature portrait and tactical clue")
                attacks = e.get("mechanics", "basic; special").split(";")
                for index, attack in enumerate(attacks, 1):
                    add(f"anim.enemy.{eid}.{index}", "animation", eid, chapter, attack.strip() + "; distinct readable anticipation and recovery", [f"rig.{e['rig']}"], e["rig"])
                    add(f"vfx.enemy.{eid}.{index}", "vfx", eid, chapter, attack.strip() + "; authoritative ground shape")
                    add(f"sfx.enemy.{eid}.{index}", "audio", eid, chapter, attack.strip() + "; warning and contact stems")
                for cue in ["idle", "alert", "hit", "death"]:
                    add(f"sfx.enemy.{eid}.{cue}", "audio", eid, chapter, f"{e['name']} {cue}")
    for name in ["resident", "merchant", "guard", "traveller", "scholar", "worker"]:
        if name == "guard":
            add("ref.guard.concord-watch", "reference", "concord-watch", brief="Highcross law-enforcement guard; bronze and slate uniform, polearm and shield; calm patrol and aggressive silhouette")
            add("model.crowd.guard", "model_npc", "concord-watch", brief="active Concord Watch guard, not passive crowd; reusable local uniform variants", deps=["rig.humanoid", "ref.guard.concord-watch"], rig="humanoid")
        else:
            add(f"model.crowd.{name}", "model_npc", "highcross", brief="modular adult town NPC; palette/head reuse, no unique quest state", deps=["rig.humanoid"], rig="humanoid")
    for cue in ["red-name", "outlaw-timer", "loot-eligible", "loot-protected", "claim-remaining", "merchant-refusal", "guards-hostile"]:
        add(f"ui.law.{cue}", "ui", "pvp", brief=f"{cue}; clear label, symbol and accessible explanation")
    for cue in ["guard-alert", "guard-strike", "guard-bash", "guard-dash", "merchant-refusal", "claim-start", "claim-complete", "outlaw-expired"]:
        add(f"sfx.law.{cue}", "audio", "pvp", brief=f"{cue}; short readable cue with caption when critical")
    add("vfx.law.corpse-claim", "vfx", "pvp", brief="one/two-item corpse marker, three-second exposed claim channel and expiry")
    add("anim.guard.polearm-strike", "animation", "concord-watch", brief="readable single-target polearm strike; reuse Knight timing conventions", deps=["rig.humanoid"], rig="humanoid")
    add("rules.law-enforcement", "text", "pvp", brief="guard perception/leash, lawful retaliation, red timer, merchant refusal and atomic corpse claim data")
    for kit, (chapter, pieces) in KITS.items():
        add(f"ref.kit.{kit}", "reference", kit, chapter, "kit breakdown, dimensions, joins, hero materials, ground camera inset")
        for piece in pieces.split():
            add(f"prop.{kit}.{piece}", "model_prop", kit, chapter, f"{piece}; snapped module, simple collision, LODs", [f"ref.kit.{kit}"])
        for material in ["primary", "secondary", "ground", "trim", "decal", "organic"]:
            add(f"material.{kit}.{material}", "material", kit, chapter, "base colour, tangent normal, ORM; material master and tiling test")
    for m in maps:
        chapter, mid = m["chapter"], m["id"]
        add(f"layout.{mid}", "reference", mid, chapter, f"top-down layout {m['size_metres']}m; routes, collisions, boundaries, encounters, quest objects")
        add(f"vista.{mid}", "reference", mid, chapter, f"game-camera target; {m['landmarks']}")
        add(f"scene.{mid}", "scene", mid, chapter, "assembled geometry, lighting, navmesh, collision, safe polygons, spawn and encounter data", [f"layout.{mid}", f"vista.{mid}"])
        add(f"map.{mid}", "ui", mid, chapter, "fogged atlas/local map, exact safe boundaries; secrets hidden until found")
        add(f"ambience.{mid}", "audio", mid, chapter, "60–120s seamless base plus three one-shot details; no misleading combat warnings")
    # Six score families, each with four synchronized adaptive stems.
    for realm in ["highcross", "fantasy", "science", "chaos", "boss", "accord"]:
        for state in ["explore", "suspicion", "combat", "resolution"]:
            add(f"music.{realm}.{state}", "audio", realm, "C2" if realm == "accord" else "C1", "90–150s loop/stem, shared tempo and key, transitions on next bar; resolution can be 8s sting")
    for e in equipment:
        add(f"item.icon.{e['id']}", "ui", e["id"], e["chapter"], e["appearance"])
        if e["type"] not in ["material", "consumable"]:
            add(f"item.model.{e['id']}", "model_equipment", e["id"], e["chapter"], e["appearance"], variants=e["tiers"])
    for q in quests:
        add(f"quest.{q['id']}", "text", q["id"], q["chapter"], "state graph, dialogue, objectives, clue journal, three hint levels, completion and recovery")
        add(f"clue.{q['id']}", "ui", q["id"], q["chapter"], "one authored clue sheet with all subclues; accessible transcript")
        add(f"questprop.{q['id']}", "model_prop", q["id"], q["chapter"], "one evidence object or reusable quest marker variant; no random geometry duplication")
    for s in content["screens"]:
        add(f"screen.{s['id']}", "reference", s["id"], brief="desktop composition plus states specified in screens document; real text composed separately")
        add(f"ui.{s['id']}", "ui", s["id"], brief="reusable panel/border/control assets and state tokens; responsive DOM implementation separately")
    for symbol in "safe open-pvp hostile-player ally neutral target selected quest bank merchant craft guild death recovery gather interact disconnected loading muted report focus cursor-attack cursor-talk cursor-inspect stun root slow silence burn curse shield heal armour-break heat combo cooldown disabled unknown-item damage-type".split():
        add(f"ui.symbol.{symbol}", "ui", "shared", brief=f"{symbol}; shape plus label; high contrast and 24px recognition")
    for cue in "hover select back error confirm equip unequip quest-accept quest-complete level-up guild-join trade-offer trade-lock trade-complete safe-enter safe-leave disconnect reconnect low-health death revive loot craft-success craft-fail whisper report-sent".split():
        add(f"sfx.ui.{cue}", "audio", "shared", brief=f"{cue}; short and non-fatiguing")
    for surface in "stone mud metal wood water snow cloth".split():
        add(f"sfx.move.{surface}", "audio", "shared", brief="six alternating footsteps, three equipment weights; variation bank, no repeated double hit")
    for voice in ["warm", "dry", "bright"]:
        for cue in ["exertion", "hurt", "defeat", "revive"]:
            add(f"voice.player.{voice}.{cue}", "audio", "creation", brief=f"original {voice} performance: {cue}; three short variants; no real-person imitation")
    for cue in ["portal-fantasy", "portal-science", "portal-chaos", "rain", "revive-channel", "death-echo", "loot-glint"]:
        add(f"sfx.world.{cue}", "audio", "shared", brief=f"{cue}; loop or one-shot as appropriate, fades and distance attenuation")
    for effect in "rain fog water-ripple portal-fantasy portal-science portal-chaos safe-boundary telegraph-lane telegraph-disk telegraph-cone telegraph-ring hit-physical hit-elemental heal shield-break interrupt level-up death-echo revive loot-glint".split():
        add(f"vfx.shared.{effect}", "vfx", "shared", brief="pooled effect with distance budget; telegraphs never culled by cosmetic quality")
    for action in ["evade", "break-free"]:
        add(f"ui.shared.{action}", "ui", "shared", brief=f"{action} icon and cooldown state; label and key binding")
        add(f"vfx.shared.{action}", "vfx", "shared", brief=f"{action}; readable brief outline with reduced-effects variant")
        add(f"sfx.shared.{action}", "audio", "shared", brief=f"{action}; short movement/control-release cue")
    for prop, action, chapter in [
        ("town.door", "open-close", "C1"), ("town.astrolabe", "ring-turn", "C1"),
        ("town.market-stall", "collapse-lift", "C1"), ("abbey.bell", "swing-toll", "C1"),
        ("abbey.crypt-door", "open-close", "C1"), ("abbey.cistern-clock", "align-turn", "C1"),
        ("industrial.shutter", "open-close", "C1"), ("industrial.pipe-valve", "turn", "C1"),
        ("industrial.pump", "pump-cycle", "C1"), ("industrial.reactor", "vent-expose", "C1"),
        ("industrial.lift-platform", "travel-stop", "C1"), ("carnival.carousel", "rotate", "C1"),
        ("carnival.curtain", "open-close", "C1"), ("carnival.spotlight", "aim-sweep", "C1"),
        ("winter.city-gate", "open-close", "C2"), ("city.lift", "travel-stop", "C2"),
        ("sea.tide-bridge", "rise-fall", "C2")]:
        add(f"anim.prop.{prop}.{action}", "animation", prop, chapter, f"{action}; object animation with authoritative interaction-state markers", [f"prop.{prop}"])
        add(f"sfx.prop.{prop}.{action}", "audio", prop, chapter, f"{action}; start/loop/stop or contact sound bundle")
    content["counts"] = {key: len(content[key]) for key in ["guilds", "abilities", "maps", "npcs", "creatures", "bosses", "quests", "equipment", "screens", "law_agents"]}
    production_path = ROOT / "design/production-overrides.json"
    overrides = json.loads(production_path.read_text()) if production_path.exists() else {}
    known_ids = {asset["id"] for asset in assets}
    if set(overrides) - known_ids:
        raise ValueError(f"Unknown production asset IDs: {set(overrides) - known_ids}")
    allowed = {"status", "prototype_output", "source_job", "source_hash", "license_evidence", "verified_in_browser", "evidence", "limitations"}
    for asset in assets:
        update = overrides.get(asset["id"], {})
        if set(update) - allowed:
            raise ValueError(f"Unsupported production fields for {asset['id']}")
        asset.update(update)
    manifest = dict(version=2, generated_by="tools/build_catalogue.py", status="production-tracked", budgets=budgets, counts=dict(total=len(assets), by_kind=dict(Counter(a["kind"] for a in assets)), by_chapter=dict(Counter(a["chapter"] for a in assets)), by_status=dict(Counter(a["status"] for a in assets))), assets=assets)
    (ROOT / "design/content-catalogue.json").write_text(json.dumps(content, indent=2) + "\n")
    (ROOT / "design/asset-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    lines = ["# Guild ability catalogue", "", "Generated from `tools/build_catalogue.py`. Proposed balance v1; all coefficients use P defined in combat-and-guilds.md. Each full guild has five equipped abilities, a signature, a basic attack, a defence and an exploration utility. The six hotbar actions are all available in a level-5 trial; normal unlocks follow the progression table. Shared evade is additional. Costs use each guild's own resource; Cyborg positive numbers add Heat.", ""]
    for g in guilds:
        lines += [f"## {g['name']}", "", f"**Resource:** {g['resource']} — {g['resource_rule']}.", "", f"**Identity:** {g['identity']}.", "", f"**Appearance:** {g['appearance']}. **Sound:** {g['audio']}.", "", f"**Mastery choice:** {g['mastery_choice']}.", "", "| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |", "| --- | --- | --- | --- | --- | --- |"]
        for a in [a for a in abilities if a["guild"] == g["id"]]:
            reach = a['range_metres'] + ("m" if a['range_metres'].replace('.', '').isdigit() else "")
            lines.append(f"| **{a['name']}** · {a['role']} | {a['cost']} | {a['cooldown_seconds']:g}s / {a['windup_seconds']:g}s | {reach} | {a['effect']} | {a['visual_cue']}; {a['counterplay']} |")
        lines.append("")
    (ROOT / "docs/guild-ability-catalogue.md").write_text("\n".join(lines).rstrip() + "\n")
    report = ["# Catalogue totals", "", "Generated planning counts, not completed assets. Variants and multi-stem bundles are explicitly costed in the asset bible; an entry is a reviewable delivery unit, not necessarily one source file.", "", "| Content | Count |", "| --- | ---: |"]
    report += [f"| {k} | {v} |" for k,v in content["counts"].items()]
    report += ["", "| Deliverable type | Count |", "| --- | ---: |"] + [f"| {k} | {v} |" for k,v in manifest["counts"]["by_kind"].items()]
    report += ["", f"Total manifest delivery units: **{len(assets)}**.", ""] + [f"- {k}: {v}" for k,v in manifest["counts"]["by_chapter"].items()]
    (ROOT / "docs/catalogue-totals.md").write_text("\n".join(report) + "\n")
    print(json.dumps({"content": content["counts"], "assets": manifest["counts"]}, indent=2))


if __name__ == "__main__":
    build()

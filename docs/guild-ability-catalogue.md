# Guild ability catalogue

Generated from `tools/build_catalogue.py`. Proposed balance v1; all coefficients use P defined in combat-and-guilds.md. Each full guild has five equipped abilities, a signature, a basic attack, a defence and an exploration utility. The six hotbar actions are all available in a level-5 trial; normal unlocks follow the progression table. Shared evade is additional. Costs use each guild's own resource; Cyborg positive numbers add Heat.

## Knight

**Resource:** Resolve — 100; +12 on block, +6 on basic hit; starts at 30.

**Identity:** Resolve on defence makes positioning valuable; ranged kiting punishes overcommitment.

**Appearance:** plate, teal cloth, cream tabard; bronze shield; short gold oath strokes. **Sound:** guarded metal strike / low choir.

**Mastery choice:** Bulwark: Interpose protects two nearby allies at half strength; Duelist: Sunder gains 20% damage after a successful defence.

| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |
| --- | --- | --- | --- | --- | --- |
| **Sunder** · slot1 | 15 | 5s / 0.45s | 2.5m | 1.4P physical; armour reduced 15% for 5s | overhead diagonal cut; split brass arc; evade the committed swing |
| **Shield Bash** · slot2 | 20 | 12s / 0.35s | 2m | 0.5P; interrupt and 0.7s stun | shield draw-back; blue edge snap; bait then step beyond reach |
| **Challenge** · slot3 | 10 | 14s / 0.3s | 10m | PvE taunt 3s; PvP target deals 15% less damage to other allies for 4s | raised sword; thin gold tether; attack Knight or disengage; never forced targeting |
| **Interpose** · slot4 | 25 | 16s / 0.2s | 8m | dash to ally; redirect 30% damage for 3s, capped at 20% own max HP | shield forward dash; linked shield outlines; separate allies; interrupt before link |
| **Rally** · slot5 | 30 | 22s / 0.7s | 4m | ground field heals 0.25P/s for 4s; maximum four allies | plant banner; low amber pulse; leave or interrupt cast |
| **Last Oath** · signature | 60 | 75s / 0.6s | self | 6s stagger resistance; defence restores 0.4P HP once per second maximum | kneeling oath then rising shield crest; disengage; resistance grants no damage immunity |
| **Measured Cut** · basic | 0 | 1.1s / 0.3s | 2.5m | 1.0P physical basic | compact waist-height blade trail; maintain distance |
| **Brace** · defence | 0 | 8s / 0.1s | self | 0.8s front guard reduces incoming damage 60%; no movement | shield lock and sparks; flank or delay |
| **Oath Sight** · utility | 0 | 3s / 6s | 6m | reveal oath marks and sworn mechanisms while channeling out of combat | small bronze glyph; no through-wall player detection; taking damage cancels interaction |

## Cyborg

**Resource:** Heat — 0–100; actions add heat; cool 8/s after 2s without spending; at 100 offence locks until 50.

**Identity:** Manage heat bursts and vent timing; interrupts and pressure during cooling punish greed.

**Appearance:** human face, ceramic limbs, exposed copper mechanisms; cyan coils. **Sound:** capacitor whine / pressure vent.

**Mastery choice:** Insulator: Coolant Burst leaves 15% ranged-damage cover for 3s; Shatter: cooled enemies take 20% more Pulse Lance damage once.

| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |
| --- | --- | --- | --- | --- | --- |
| **Pulse Lance** · slot1 | +24 | 4s / 0.65s | 16m | 1.6P piercing lane, 1m wide; enemies beyond first take half | coils gather; narrow orange lane then cyan shot; sidestep visible lane |
| **Mag Clamp** · slot2 | +18 | 14s / 0.5s | 10m | 0.3P; root 1s, boss slow 20% | magnet prongs; ground brackets; cleanse or evade projectile |
| **Arc Mine** · slot3 | +16 | 12s / 0.5s | 6m | one visible mine, 12s life; 0.8P and 30% slow 2s | crouch deploy; crackling ring; destroy from range; arm time 1s |
| **Coolant Burst** · slot4 | -45 | 12s / 0.4s | 3m | vent heat; 25% slow 2s | shoulder vent; transparent ice spray; keep beyond short radius |
| **Repair Drone** · slot5 | +20 | 24s / 0.6s | self | one drone heals 0.3P/s for 5s; destroyable | release drone; quiet cyan repair beam; kill drone or interrupt launch |
| **Overclock** · signature | +8/s | 75s / 0.4s | self | 6s; 25% faster basic attacks and +15% damage; normal heat cap still applies | core opens; rising pulse rate; pressure cooling window |
| **Pulse Tap** · basic | +4 | 1s / 0.2s | 12m | 0.8P ranged basic | small blue muzzle pulse; line of sight |
| **Reactive Plating** · defence | +8 | 10s / 0.1s | self | 45% damage reduction for 1s | ceramic shutters close; wait out short plate window |
| **Diagnostic Scan** · utility | 0 | 3s / 6s | 6m | read machines and hidden maintenance labels out of combat | fine cyan scan grid; damage cancels; no player reveal |

## Necromancer

**Resource:** Essence — 100; regenerates 7/s; enemy defeat restores 10 once per eligible creature.

**Identity:** Choose spirit survival or sacrifice; cleansing and summon focus disrupt setup.

**Appearance:** bone and bronze ornaments, layered black robes; pale blue spirits and violet curses. **Sound:** breath / brittle chime / hollow resonance.

**Mastery choice:** Keeper: Echo lasts 8s longer but Consume heals 25% less; Reaper: Consume detonates for 0.6P within 2m.

| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |
| --- | --- | --- | --- | --- | --- |
| **Grave Bolt** · slot1 | 12 | 3s / 0.5s | 14m | 1.1P spectral projectile | lantern draws inward; thin blue bolt; cover or evade |
| **Wither** · slot2 | 20 | 12s / 0.4s | 12m | 0.25P/s for 5s and 15% healing reduction | pinch gesture; violet rib glyph; cleanse; only one Wither per caster/target |
| **Raise Echo** · slot3 | 30 | 20s / 0.8s | 5m | one wolf spirit for 16s; 0.25P attack per 1.5s; 1.5P HP | lantern kneel; blue pawprints assemble; interrupt or destroy summon |
| **Soul Tether** · slot4 | 15 | 10s / 0.3s | 12m | command Echo to target; 20% slow 2s, line of sight required | point; fine visible tether; break distance beyond 16m |
| **Consume** · slot5 | 0 | 18s / 0.4s | 12m | sacrifice own Echo; heal self 1.1P | beckon spirit; inward lantern spiral; force early sacrifice |
| **Procession** · signature | 50 | 75s / 1s | 12m | three ghost fronts move along 3m lane; total 2.4P, one hit per front | staff sweep; marching silhouettes; leave lane during wind-up |
| **Ash Touch** · basic | 0 | 1.2s / 0.3s | 11m | 0.65P ranged basic; +4 Essence on hit | finger smoke thread; line of sight |
| **Veil of Dust** · defence | 15 | 10s / 0.1s | self | 45% damage reduction 1s; no invisibility | robe fold; thin dust veil; wait or follow visible feet |
| **Speak with Remnants** · utility | 0 | 3s / 6s | 4m | read authored memory remnants, optional clue route | lantern held to remnant; combat cancels; base clue alternative always exists |

## Mage

**Resource:** Mana — 100; regenerates 8/s; last two elements determine next combination.

**Identity:** Prepare a sequence then cash it in; interrupt long casts and move before combinations land.

**Appearance:** layered indigo cloth, geometric staff head, restrained elemental forms. **Sound:** glass harmonics / air crack / small ignition.

**Mastery choice:** Evoker: mixed-element hit gains 15% damage; Scholar: successful combination refunds 10 Mana once per 6s.

| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |
| --- | --- | --- | --- | --- | --- |
| **Ember Sigil** · slot1 | 15 | 4s / 0.6s | 14m | 1.0P fire; marks Ember for 4s | draw triangle; orange spark; dodge projectile |
| **Rime Shard** · slot2 | 15 | 5s / 0.6s | 14m | 0.8P frost; 20% slow 2s; marks Rime | draw diamond; blue shard; cover or cleanse slow |
| **Arc Thread** · slot3 | 18 | 7s / 0.5s | 12m | 0.9P lightning; chains once within 3m for 0.4P; marks Arc | two fingers; narrow branching line; spread apart |
| **Spell Weave** · slot4 | 25 | 12s / 0.8s | 12m | consume two distinct marks: Ember/Rime 1.8P steam disk; Rime/Arc 1.2P plus 0.7s root; Ember/Arc 2P lane | two glyphs orbit then combine; watch shape; interrupt; no marks means disabled |
| **Runic Ward** · slot5 | 20 | 18s / 0.4s | self | absorb 1.0P damage for 4s | hexagonal floor outline and hand ward; sustained pressure |
| **Convergence** · signature | 45 | 75s / 1s | 12m | three delayed 2m blasts, 0.8P each over 3s | staff raised; three sequential sigils; move between marked blasts |
| **Wand Spark** · basic | 0 | 1.1s / 0.25s | 12m | 0.65P arcane basic | small point flash; cover |
| **Phase Step** · defence | 15 | 10s / 0.1s | 4m | short collision-checked blink; no walls or boundary bypass | narrow split silhouette; predict arrival point |
| **Read the Weave** · utility | 0 | 3s / 6s | 5m | decode arcane inscriptions and optional rune shortcuts | fine floating annotation; combat cancels; clues have alternate method |

## Monk

**Resource:** Flow — 0–100; +12 on alternating basics/skills, -10 for repeating same skill; decays 5/s out of combat.

**Identity:** Alternate actions and time counters; feints and range deny Flow.

**Appearance:** sand wraps, charcoal travel clothes, beads; clean physical silhouettes. **Sound:** cloth snap / breath / wooden block.

**Mastery choice:** Crane: successful Palm Counter gives 1s of 20% speed; Tiger: third alternating hit adds 0.35P damage.

| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |
| --- | --- | --- | --- | --- | --- |
| **Tiger Palm** · slot1 | 10 | 4s / 0.25s | 2m | 1.15P physical; +10 Flow if following another action | hip-driven palm; small air cone; step out of melee |
| **Crane Step** · slot2 | 15 | 9s / 0.2s | 5m | dash to ground; next basic gains 0.3P within 2s | low pivot then glide; predict destination |
| **Palm Counter** · slot3 | 20 | 12s / 0.1s | self | 0.7s guard; first melee hit countered for 0.8P and interrupted | open palm stillness; feint or use range |
| **Sweeping Reed** · slot4 | 25 | 14s / 0.5s | 3m | 0.7P arc and 0.8s knockdown | leg draws circle; dust arc; backstep; CC limits apply |
| **Still Breath** · slot5 | 0 | 20s / 2s | self | channel heals 0.4P/s and gains 10 Flow/s; movement cancels | kneel, measured expanding ring; interrupt |
| **Hundred Hands** · signature | 60 | 75s / 0.6s | 3m | five strikes over 2s, total 2.5P; can move slowly, interruptible | five distinct arm beats; leave reach or interrupt |
| **Open Hand** · basic | 0 | 0.9s / 0.2s | 2m | 0.7P physical; alternate hands | compact left/right punches; kite |
| **Slip** · defence | 0 | 8s / 0.1s | self | 0.35s evade window; 1m lateral step | shoulder turn; delay attack |
| **Stillness** · utility | 0 | 3s / 6s | 4m | hear mechanical rhythms and vibration clues | settled stance with captioned pulses; combat cancels |

## Priest

**Resource:** Grace — 100; regenerates 7/s; maintain one vow: Shelter reduces own damage 10% and increases healing 10%, Judgment reverses.

**Identity:** Vow trades healing for pressure; interrupts, spread pressure and anti-heal counter sustain.

**Appearance:** ivory stole, practical bronze mail, open sun emblem; warm protective planes. **Sound:** bell / breath choir / soft bronze.

**Mastery choice:** Shelter: ward expiry heals 0.3P; Judgment: Smite against condemned target grants 0.4P self shield.

| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |
| --- | --- | --- | --- | --- | --- |
| **Smite** · slot1 | 12 | 4s / 0.55s | 13m | 1.05P radiant | raise focus; falling narrow ray; line of sight |
| **Mend** · slot2 | 22 | 8s / 0.7s | 12m | heal ally or self 1.0P | open palm; warm thread; interrupt; combat support rules apply |
| **Sanctuary Ward** · slot3 | 25 | 18s / 0.7s | 4m | 4s field reduces damage 15%; does not change PvP eligibility | trace sun ring at ground; push targets from field |
| **Absolve** · slot4 | 20 | 16s / 0.3s | 10m | remove one oldest removable control and one damage-over-time | bronze bell ripple; bait before major debuff |
| **Condemn** · slot5 | 18 | 12s / 0.45s | 12m | 0.6P and target healing received -20% for 4s | broken sun mark; cleanse |
| **Dawn Covenant** · signature | 45 | 75s / 1s | 6m | heal allies 1.3P then shield 0.5P for 4s, max four | raised stole; low dawn wave; interrupt wind-up or disengage |
| **Pilgrim Strike** · basic | 0 | 1.1s / 0.3s | 3m | 0.7P physical basic | mace or focus tap; range |
| **Votive Shield** · defence | 15 | 10s / 0.1s | self | absorb 0.7P for 1.5s | small sun disk; sustained pressure |
| **Consecrate Memory** · utility | 0 | 3s / 6s | 4m | restore readable text on memorials and blessed devices | hand over inscription; combat cancels; not a safe zone |

## Bard

**Resource:** Resonance — 0–100; +10 per basic beat; songs spend per second; two concurrent songs maximum.

**Identity:** Layer and release songs without losing position; interrupts and separation deny group value.

**Appearance:** rust-red coat, compact lyre and curved blade; thin rhythmic ribbons. **Sound:** plucked strings / hand drum / restrained chord.

**Mastery choice:** Conductor: song radius +2m; Duelist: ending two songs grants next Cadenza 0.4P damage.

| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |
| --- | --- | --- | --- | --- | --- |
| **Cadenza** · slot1 | 15 | 4s / 0.4s | 12m | 1.0P sonic projectile; +0.2P per active song | strum forward; thin visible ripple; cover |
| **March of Embers** · slot2 | 5/s | 8s / 0.5s | 5m | toggle up to 8s; party movement +10%, damage +5% | walking beat; small warm foot rings; split group or silence |
| **Quiet Refrain** · slot3 | 5/s | 8s / 0.5s | 5m | toggle up to 8s; allies heal 0.15P/s | slow pluck; low teal rings; interrupt sustain; one healing song per target |
| **Discord** · slot4 | 20 | 14s / 0.5s | 10m | 0.5P and interrupt; 1s silence | sharp damped chord; bait cast then attack |
| **Borrowed Courage** · slot5 | 25 | 18s / 0.3s | 10m | one ally gets 0.7P shield and cleansed slow | instrument offered; gold thread; switch target |
| **Finale** · signature | 50 | 75s / 0.8s | 6m | end songs; 1.2P damage to enemies and 0.8P heal to allies | held breath then chord; radial staff lines; interrupt or leave radius |
| **Backbeat** · basic | 0 | 1s / 0.25s | 10m | 0.65P basic sonic note | single string stroke; cover |
| **Dancer's Turn** · defence | 10 | 9s / 0.1s | 2m | pivot dodge 0.35s | coat turn; small cloth trail; track ending direction |
| **Remembered Tune** · utility | 0 | 3s / 6s | 5m | replay learned melodies at devices; captions and symbol sequence provided | quiet instrument pose; combat cancels; no audio-only puzzle |

## Changeling

**Resource:** Instinct — 100; regenerates 8/s; forms Wolf, Raven, Beetle; combat uses ground movement for all.

**Identity:** Form determines reach and escape; predict swaps, use sustained pressure during transformation.

**Appearance:** wolf with pale crest, ground-skimming raven, plated beetle; constant amber eye motif. **Sound:** bone shift / wing cloth / claw rhythm.

**Mastery choice:** Hunter: Wolf Pounce marks prey for 10% bonus basic damage 3s; Wanderer: form change restores 10 Instinct once per 8s.

| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |
| --- | --- | --- | --- | --- | --- |
| **Rending Pounce** · slot1 | 20 | 7s / 0.5s | 6m | Wolf form; leap along navigable ground, 1.2P | wolf crouch; amber landing oval; sidestep landing |
| **Raven Shift** · slot2 | 15 | 10s / 0.6s | self | enter raven; basic becomes 9m feather shot at 0.6P; no flight over walls | fold to black feathers; attack during visible shift |
| **Beetle Shift** · slot3 | 20 | 12s / 0.7s | self | enter beetle; basics 0.7P melee, 20% armour, speed -15% | shell plates close; kite slow form |
| **Wild Return** · slot4 | 10 | 6s / 0.4s | self | return to Wolf, basic 0.9P melee; clear own form speed penalty | crest emerges from swirl; predict melee arrival |
| **Borrowed Hide** · slot5 | 25 | 18s / 0.2s | self | absorb 0.8P for 3s; retain silhouette | brief translucent form outline; wait then burst |
| **Primal Chorus** · signature | 50 | 75s / 0.8s | 4m | 6s; next three form changes trigger 0.6P local shock, once per 1.5s | three readable silhouettes; keep distance during swaps |
| **Instinct Strike** · basic | 0 | 1s / 0.25s | form | Wolf bite / Raven feather / Beetle mandible as specified by form | form contact animation; respect current range |
| **Feral Sidestep** · defence | 10 | 8s / 0.1s | 3m | ground evade, same 0.35s window in all forms | species-specific lateral move; track landing |
| **Borrowed Passage** · utility | 0 | 3s / 6s | 2m | Raven fits marked vents, Beetle lifts marked latches, Wolf tracks clues; endpoints nav-validated | inspect then form gesture; only authored links; never cross a safe boundary unseen |

## Elemental

**Resource:** Stability — 100; regenerates 6/s; Fire, Water, Earth, Air; swapping costs Stability.

**Identity:** Each element commits to a function; punish repeated swapping and forecast delayed zones.

**Appearance:** four humanoid masses with different outline crowns; feet always readable. **Sound:** stone / steam / wind / water in matching register.

**Mastery choice:** Anchor: Earth reduces displacement 50%; Tempest: cycling three elements empowers next basic by 0.6P.

| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |
| --- | --- | --- | --- | --- | --- |
| **Ember Body** · slot1 | 15 | 6s / 0.5s | self | enter Fire; next basic adds 0.3P burn over 3s | fractured coal body ignites; cleanse and pressure low Stability |
| **Tidal Body** · slot2 | 15 | 6s / 0.5s | self | enter Water; next basic restores 0.25P self HP | water gathers around clear core; anti-heal |
| **Stone Body** · slot3 | 20 | 9s / 0.65s | self | enter Earth; +20% armour, -10% speed while active | strata lock into shoulders; kite |
| **Gale Body** · slot4 | 20 | 9s / 0.5s | self | enter Air; +10% movement; next basic pushes 1m | wind ring and suspended stone hands; corners and ranged pressure |
| **Elemental Surge** · slot5 | 25 | 12s / 0.7s | 10m | 2m ground disk: Fire 1.5P; Water 0.8P heal allies; Earth 0.8P plus 0.7s root; Air 0.7P plus 2m push | element-specific disk with same boundary; leave disk or interrupt |
| **Worldheart** · signature | 45 | 75s / 1s | 5m | 4s field pulses current element Surge at half strength twice; form locked | exposed core and low concentric waves; exit field; no invulnerability |
| **Elemental Reach** · basic | 0 | 1.2s / 0.3s | 10m | 0.65P elemental basic; form bonus as above | material-matched hand projectile; cover |
| **Coalesce** · defence | 15 | 10s / 0.1s | self | 50% damage reduction for 0.8s | core closes, silhouette retained; delay burst |
| **Shape the Way** · utility | 0 | 3s / 6s | 4m | ignite braziers, fill basins, lift stones, turn vents at marked puzzles | small sustained element stream; combat cancels; manual alternatives exist |

## Psion

**Resource:** Focus — 100; regenerates 8/s; interrupted casts remove additional 10 Focus.

**Identity:** Control space through anticipated lines; interrupts and cover deny setup.

**Appearance:** dark tailored coat, suspended crystal halo fragments; lilac line distortions. **Sound:** tuned hum / soft glass / low pressure click.

**Mastery choice:** Anchor: Mind Bulwark returns 10 Focus on full absorption; Vector: successful displacement empowers Thought Spike by 20%.

| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |
| --- | --- | --- | --- | --- | --- |
| **Thought Spike** · slot1 | 15 | 4s / 0.5s | 14m | 1.0P psychic | touch temple; thin lilac lance; cover or interrupt |
| **Vector Push** · slot2 | 22 | 14s / 0.6s | 10m | 0.5P and 3m collision-checked push | palm plane gathers; dodge line; no wall penetration |
| **Gravity Knot** · slot3 | 25 | 16s / 0.8s | 12m | 2m disk slows 30% for 3s; 0.5P | point then compress; inward lines; leave before knot closes |
| **Mind Bulwark** · slot4 | 20 | 18s / 0.3s | 10m | ally shield 0.9P for 4s | angular head-height ring; switch target |
| **Echo Step** · slot5 | 18 | 12s / 0.2s | 5m | dash along clear ground; leave harmless visible decoy for 2s | two offset silhouettes; real player remains targetable; decoy labelled on consider |
| **Still Horizon** · signature | 45 | 75s / 1s | 5m | 0.7s stun then 0.4P/s for 3s in stationary disk | horizon line folds; leave telegraph or interrupt |
| **Mental Needle** · basic | 0 | 1s / 0.25s | 12m | 0.65P psychic basic | single glass flick; cover |
| **Mental Slip** · defence | 15 | 10s / 0.1s | self | remove slow and reduce next hit 40% within 1s | brief outline offset; bait before larger hit |
| **Surface Memory** · utility | 0 | 3s / 6s | 4m | read imprints on authored objects; no mind reading player messages | hand held near object; combat cancels |

## Symbiont

**Resource:** Bond — 100; regenerates 7/s; host adaptations Guardian, Stalker, Mender share HP and cooldowns.

**Identity:** Trade armour, reach and healing through adaptations; focus exposed host during swaps.

**Appearance:** recognizable human host with amber resin tendrils, bark plates and distinct limb attachments. **Sound:** wet fibre / hollow wood / heartbeat.

**Mastery choice:** Mutualist: Mender heals grant 0.2P shield; Predator: Stalker attacks on marked targets restore 4 Bond once per second.

| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |
| --- | --- | --- | --- | --- | --- |
| **Thorn Lash** · slot1 | 15 | 5s / 0.45s | 8m | 1.0P physical line; Stalker adds 2m range | arm draws tendril taut; sidestep line |
| **Guardian Graft** · slot2 | 20 | 12s / 0.6s | self | enter Guardian; +20% armour, -10% speed | shoulder plates bloom; kite |
| **Stalker Graft** · slot3 | 15 | 10s / 0.5s | self | enter Stalker; lash +2m and movement +5% | forearm thorns unfold; close distance after missed lash |
| **Mender Graft** · slot4 | 20 | 12s / 0.6s | self | enter Mender; basic heals lowest-HP party member within 5m for 0.15P per hit | luminescent seed pods open; separate party or anti-heal |
| **Spore Covenant** · slot5 | 25 | 18s / 0.7s | 8m | one ally receives 0.8P heal over 4s; enemies within 2m slowed 20% | seed travels then low spores; cleanse or move away |
| **Perfect Union** · signature | 45 | 75s / 0.8s | self | 6s; current adaptation bonus doubled; 0.8P shield; no new body or immunity | host and parasite breath synchronize; disengage then punish cooldown |
| **Host Strike** · basic | 0 | 1s / 0.3s | 2.5m | 0.8P basic; Mender secondary heal as above | arm strike with tendril follow-through; range |
| **Reflex Husk** · defence | 15 | 10s / 0.1s | self | 0.8P shield for 1s | rapid bark shell; sustained damage |
| **Living Interface** · utility | 0 | 3s / 6s | 3m | connect to marked organic machinery and growth clues | root fingertips into socket; combat cancels; no access to enemy player data |

## Powered Armour

**Resource:** Capacitor — 100; regenerates 6/s when not firing; Assault, Bastion, Support configurations selected in town.

**Identity:** Manage power and firing commitment; flanks and line-of-sight breaks beat frontal strength.

**Appearance:** broad industrial suit, visible pilot viewport, orange warning marks and massive readable feet. **Sound:** heavy servo / cartridge slam / grounded recoil.

**Mastery choice:** Bastion: Brace Projector lasts 1s longer; Assault: Siege Round splash +0.3P but cooldown +2s.

| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |
| --- | --- | --- | --- | --- | --- |
| **Siege Round** · slot1 | 22 | 6s / 0.85s | 16m | 1.5P direct; 0.4P splash within 2m | shoulder cannon unfolds; orange targeting lane; evade lane during long wind-up |
| **Anchor Shot** · slot2 | 18 | 14s / 0.65s | 12m | 0.7P and 25% slow 3s | recoil brace; cable-shaped tracer; cleanse or sidestep |
| **Brace Projector** · slot3 | 25 | 20s / 0.6s | 4m | 3s directional cover; incoming frontal ranged damage -30%; no physical wall | deploy low shield fins; flank; effects still obey town rules |
| **Servo Rush** · slot4 | 20 | 12s / 0.4s | 5m | ground dash; stop before collision, 0.5P contact once | vents fire; heavy footfalls; sidestep endpoint |
| **Field Patch** · slot5 | 25 | 24s / 1.2s | self | heal 1.0P; movement interrupts | open shoulder service hatch; interrupt or pressure |
| **Fortress Protocol** · signature | 50 | 75s / 1s | self | 6s immobile; +20% damage, +25% armour; can cancel, no refund | legs anchor, cannon rises; flank or leave line of sight |
| **Repeater** · basic | 6 | 1.2s / 0.25s | 13m | 0.9P physical ranged basic | compact mechanical burst; cover |
| **Hard Lock** · defence | 12 | 10s / 0.1s | self | 60% frontal damage reduction for 0.8s | plates interlock; flank |
| **Heavy Access** · utility | 0 | 3s / 6s | 3m | operate marked winches, pressure plates and bulkheads | braced mechanical interaction; combat cancels; alternate manual lever route |

## Adventurer

**Resource:** Stamina — 100; regenerates 10/s; starter guild levels 1–5.

**Identity:** Learn movement, readable danger and interaction before specialization.

**Appearance:** weathered linen coat, practical leather, simple iron weapon. **Sound:** leather / iron / breath.

**Mastery choice:** No mastery branch; choose a full guild at level five.

| Action / role | Cost | Cooldown / wind-up | Range | Effect | Visible cue / counterplay |
| --- | --- | --- | --- | --- | --- |
| **Heavy Cut** · slot1 | 15 | 5s / 0.5s | 2.5m | 1.2P melee | raised blade; sidestep |
| **Dust Throw** · slot2 | 20 | 12s / 0.4s | 4m | 0.3P and 20% slow 2s | dust cone; step back |
| **Field Dressing** · slot3 | 25 | 20s / 1.5s | self | heal 0.8P | wrap bandage; interrupt |
| **Spot Weakness** · slot4 | 10 | 14s / 0.3s | 10m | next basic gains 0.4P within 4s | point at target; break line of sight |
| **Stone Toss** · slot5 | 15 | 10s / 0.5s | 10m | 0.5P and interrupt | overhand stone; dodge |
| **Second Wind** · signature | 40 | 60s / 0.5s | self | heal 1P and recover 20 Stamina | steady breath; pressure after cooldown |
| **Strike** · basic | 0 | 1.1s / 0.3s | 2.5m | 0.8P melee basic | short blade swing; range |
| **Guard** · defence | 10 | 8s / 0.1s | self | 40% damage reduction for 1s | weapon held across body; delay attack |
| **Careful Examine** · utility | 0 | 3s / 2s | 4m | inspect authored clue or object; universal alternative to specialist utility | lean and inspect; combat interrupts lengthy interactions |

# The Briar Gate: first uncoached playtest

This is a ten-minute human test of the existing expedition. It is not yet recorded as passed. Developer route tools, an automated completion test and a crowd benchmark cannot establish enjoyment.

Open the local production preview at `http://127.0.0.1:4181/` while the loopback game server is running. Use a fresh browser tab and a new traveller name, choose Knight, and leave the `?lab=1` tools off. A new character starts at level five for this checkpoint.

Give the player only this task: **“Meet Mara, follow what you learn, and return alive.”** Let the game's controls, quest panel and dialogue explain the rest. Do not point out the memorial or coach an ability unless the player asks; record any help given. Stop after ten minutes or when the player chooses to stop. A recording requires the participant's consent; notes are sufficient.

| Observe | Success evidence |
| --- | --- |
| First minute | Finds Mara and understands why the bell matters without external directions. |
| Navigation | Identifies the town boundary, crosses the bridge and finds the memorial using visible landmarks and the minimap. |
| Combat | Selects a hound, uses basic attack and deliberately tries at least two different actions; can explain what they did. |
| Feedback | Can distinguish preparation, a hit, a block and a retreat. No lingering encounter bar when the hound disengages. |
| Visibility | Knight, equipment, target and ground warning stay legible at the ordinary follow camera, including near trees and the gate. |
| Quest | Understands what the inscription proves, returns to Mara, and notices the charm/pay and completed objective. |
| Risk | Can explain where another player may attack and the one-item/two-item loss rule from the interface. This single-person test does not exercise PvP transfers. |
| Desire to continue | Describes a moment they enjoyed and one thing they want to try next. A numerical rating alone is insufficient. |

Afterward, ask: “What was confusing?”, “Which attack felt best or worst?”, and “Would you keep playing for another ten minutes, and why?” Record their words, elapsed time, deaths, help requests, abandoned actions and any camera/target obstruction. Record browser, display size and exact source fingerprint from `artifacts/checkpoint/build-manifest.json`.

Do not count a coached recovery as an unassisted success. Reproduce each concrete defect, fix the smallest cause, and repeat only the affected segment before another full human run. Keep visual fidelity, performance, multiplayer qualification and fun as separate decisions. The approved twelve-guild scope remains unchanged.

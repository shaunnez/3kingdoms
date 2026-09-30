# THREEFOLD

A browser RPG inspired by the structure and community of 3 Kingdoms MUD: Fantasy, Science and Chaos connected through Highcross, twelve distinctive guilds, authored mysteries and open PvP outside towns and safe zones.

**Current state: playable local P1/P2 checkpoint, “The Briar Gate.”** Higgsfield references, Meshy characters and original Blender environment/rig work are running in an authoritative multiplayer browser prototype. This is the representative production checkpoint; the complete twelve-guild game and the separate 48-hour experiment have not been delivered or started.

- [Checkpoint status, evidence and limitations](docs/checkpoint-status.md)
- [Asset production and recovery](docs/asset-production.md)

- [Approved game concept](game-concept.md)
- [Complete production plan](game-plan.md)
- [Asset bible](docs/asset-bible.md) and [catalogue totals](docs/catalogue-totals.md)
- [All guild abilities](docs/guild-ability-catalogue.md)
- [Budget, stages and acceptance](docs/delivery-and-budget.md)
- [Development journal](devlog/README.md)
- [Verification record](docs/verification.md)

## Planning tools

Python 3 standard library only; no dependencies or provider credentials required.

```sh
python3 tools/build_catalogue.py
python3 tools/build_devlog.py
python3 tools/validate_plan.py
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/devlog/` to read the local journal. The server exposes this project directory on loopback only. The [hosted journal](https://threefold-devlog.shaunnesbittuk.chatgpt.site) is deployed on ChatGPT Sites with owner-private access. The exact deployed source and version are recorded in [devlog/site.json](devlog/site.json); this deployment does not imply the game repository has been pushed to GitHub.

The catalogue source is `tools/build_catalogue.py`; it expands named content into JSON manifests and an ability reference. `devlog/posts.json` is the journal content source. Generated HTML/Markdown/JSON outputs are checked in so the specification can be read without running tools. Rebuild after changing source, then validate.

Repository: [shaunnez/3kingdoms](https://github.com/shaunnez/3kingdoms). Original content and asset provenance are tracked here; no license is granted merely by this public repository. A distribution license and provider usage evidence must be selected before shipping third-party/generated assets.

## Play the local checkpoint

Node 22.12+ and npm are required. No provider credentials are used by the game.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4177/`. Choose Knight or Cyborg, accept Mara's job, cross the gate, fight the hounds, read the ruined epitaph and return. WASD moves, right-click walks, Tab targets, F attacks, 1–5/R/Q use abilities, Space evades, C breaks crowd control and E interacts. The twelve-guild codex distinguishes the two practice kits from the full planned roster.

For a production-bundle preview, leave the game server running, run `npm run build`, then `npm run preview` and open `http://127.0.0.1:4181/`. Add `?lab=1` for explicit local capture/benchmark controls. Two browser tabs create independent characters and can fight outside the gate. Red names lose two eligible items on death; ordinary victims lose one. Protected starter/quest equipment remains yours. Guards and merchants enforce the outlaw rules.

This preview binds to loopback. Its anonymous local identity and atomic JSON save (`.local/checkpoint-world.json`) are checkpoint infrastructure, not production account security or the planned PostgreSQL service. Do not expose it to the internet. Generated assets are already included; `npm ci`, builds and tests never purchase generation.

```sh
npm run typecheck
npm test
npm run build
npm run validate:assets
npm run validate:plan
npm run format:check
```

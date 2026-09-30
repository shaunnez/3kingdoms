# THREEFOLD project guidance

Read `game-concept.md`, `game-plan.md` and the relevant specification before game work. Current user instructions take precedence. All twelve full guilds and open PvP outside towns/marked safe zones are mandatory; an engineering slice is not completion.

At the planning handoff, no paid generation or 48-hour build has been authorized. Follow subsequent explicit user instructions and agreed spend scope; do not infer permission from this plan's estimates. Keep provider receipts and task recovery IDs, but never put secrets, private account information or signed download URLs in this public repository.

Catalogue source: `tools/build_catalogue.py`. Journal source: `devlog/posts.json`. Rebuild generated outputs and run `python3 tools/validate_plan.py` after changes to the planning package. When actual implementation begins, evolve the validator's status checks explicitly; do not keep a planning-only assertion that rejects legitimate verified assets.

Update the development journal for meaningful milestones, with actual images/captures where available. Label concept art, asset previews, in-engine frames, gameplay videos and generated concept films accurately. Record what changed, verified behavior, exact build/commit and remaining limitations. Git push, local preview and live deployment are separate outcomes.

Before bulk asset production, pass the representative browser/rigging/multiplayer checkpoint in `docs/delivery-and-budget.md`. Never certify real-time quality from a static render or fun from unobserved playtests. Preserve original references and rejected production evidence. No need to create a new abstraction, service or package for each guild.

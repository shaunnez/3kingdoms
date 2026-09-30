# THREEFOLD development journal

The journal begins with concept, visual-target, production-plan and PvP milestones. Read [index.html](index.html) through the loopback preview command in the repository README. ChatGPT Sites registration and the latest confirmed publication are recorded in [site.json](site.json); registration alone does not mean the journal is deployed.

Live: [THREEFOLD — The Highcross Journal](https://threefold-devlog.shaunnesbittuk.chatgpt.site), currently private to the owner's account. The current deployment includes milestones 001–006, all three original concept images, in-engine captures, gameplay/rig videos and both memory traces. Its source commit is `1f8f60af46270234ad239e30376e480e8d8d17e2`, published using an explicitly approved unsigned deployment commit. The game repository's signing configuration remains enabled.

`posts.json` owns entry text and media metadata. Run `python3 tools/build_devlog.py` to rebuild the index and individual article pages. Keep all relevant milestones, including unsuccessful experiments that materially affect quality or direction. Add an entry when an asset batch is accepted, a playable feature is verified, a visual/performance checkpoint changes or a release is made. Avoid a post for every trivial edit.

Media may use `after_paragraph` (zero-based) to accompany the relevant explanation; omission places it after the opening paragraph. The validator rejects out-of-range positions. Stylesheet links carry a content hash so new layout fixes reach returning readers.

Each entry records: stable slug, local date, milestone number, title, category, status, summary, what changed, why it matters, verification, limitations, and related media. Production entries additionally record exact commit/build, content manifest hash, measured environment and credit totals where relevant. Do not include private logs, signed provider URLs or credentials in this public repository.

Media labels are mandatory:

- **Concept art:** generated or illustrated target, with actual tool attribution.
- **Asset preview:** rendered model turntable, with pipeline and remaining rig/material limits.
- **In-engine capture:** real browser frame, preset, device/browser and build reference.
- **Gameplay video:** real browser footage, disclose edits/time-lapse and synthetic teammates.
- **Generated concept video:** promotional/reference motion; never called gameplay.

Prefer 1600px stills and 1080p 30fps H.264 MP4/WebM gameplay clips with poster, duration and WebVTT captions. Use click-to-play with controls, no autoplay sound. Capture ordinary movement/combat first, cinematic camera second. Keep videos outside ordinary Git history when large: attach to a release or approved media host, store stable URL, checksum and transcript in the entry. Do not purchase storage or create hosting automatically.

Before publishing later: identify exact repository commit, generate from that commit, verify all media and captions, deploy that version and verify the native deployment status and exact packaged milestone. Local preview, GitHub push and live publication are separate results. The [Desecration journal](https://desecration-devlog.shaunnesbittuk.chatgpt.site/) is an editorial reference for focused field notes, not this project's deployment destination.

## ChatGPT Sites publication

The canonical editable source remains here. The Sites checkout is `.sites/journal`, ignored by the game repository; its independent source commit contains only the exported journal, reference images and planning documents. `tools/prepare_journal_site.py` uses an explicit file allowlist and validates local HTML references. It does not copy Git metadata, credentials, environment files or private assets. Its `dist/publication.json` records source and exported-file hashes.

For updates, open the same Site using the Sites hosting skill and the project ID in `site.json` before editing its checkout. Then run:

```sh
python3 tools/build_devlog.py
python3 tools/validate_plan.py
python3 tools/prepare_journal_site.py
```

Use the Sites workflow to commit and push the exact exported source, package it, save that version and deploy it. Preserve the existing audience. Keep temporary write credentials in the workflow's hidden stdin, never files or command arguments. Record the returned source commit, version, deployment status and live URL in `site.json`. Do not infer deployment success from a push or registration response. Publish journal updates with meaningful game milestones; no scheduled updater is configured.

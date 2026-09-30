#!/usr/bin/env python3
"""Export only the public journal and planning documents to the Sites checkout."""
import hashlib
import json
import shutil
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / ".sites" / "journal"
DIST = SITE / "dist"


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ("href", "src", "poster") and value:
                self.links.append(value)


def main():
    files = [ROOT / "game-plan.md", ROOT / "game-concept.md", ROOT / "tools/build_catalogue.py"]
    for pattern in ("devlog/index.html", "devlog/style.css", "devlog/posts/*.html",
                    "docs/*.md", "design/*.json", "design/*.html", "design/screens/*.png",
                    "design/prompts/*.txt"):
        files.extend(sorted(ROOT.glob(pattern)))
    # Only explicitly published media is exported. Never copy runtime saves or provider downloads.
    posts = json.loads((ROOT / "devlog/posts.json").read_text())
    for post in posts:
        for item in post["media"]:
            for key in ("path", "poster", "captions"):
                if not item.get(key):
                    continue
                source = (ROOT / "devlog" / item[key]).resolve()
                allowed = (ROOT / "design/calibration", ROOT / "design/screens", ROOT / "artifacts/checkpoint/captures")
                if not any(source.is_relative_to(path) for path in allowed) or not source.is_file():
                    raise ValueError(f"Unapproved or missing journal media: {item[key]}")
                files.append(source)
    # Auditable, sanitized checkpoint evidence; no private receipts or credentials.
    for pattern in ("artifacts/checkpoint/*.json", "artifacts/checkpoint/all-tests.tap"):
        files.extend(sorted(ROOT.glob(pattern)))
    acceptance_path = ROOT / "artifacts/checkpoint/acceptance.json"
    if acceptance_path.is_file():
        for check in json.loads(acceptance_path.read_text())["checks"]:
            for evidence in check.get("evidence", []):
                source = (ROOT / evidence).resolve()
                allowed = (ROOT / "artifacts/checkpoint", ROOT / "design/screens")
                if not any(source.is_relative_to(path) for path in allowed) or not source.is_file():
                    raise ValueError(f"Missing or unapproved checkpoint evidence: {evidence}")
                files.append(source)
    files = sorted(set(files))
    DIST.mkdir(parents=True, exist_ok=True)
    expected = {str(path.relative_to(ROOT)) for path in files}
    expected.update({"index.html", "publication.json"})
    for path in DIST.rglob("*"):
        if path.is_file() and str(path.relative_to(DIST)) not in expected:
            path.unlink()
    for source in files:
        target = DIST / source.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    (DIST / "index.html").write_text('''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=devlog/index.html"><title>THREEFOLD journal</title></head>
<body><a href="devlog/index.html">Open the THREEFOLD development journal</a></body></html>\n''')
    checked = 0
    for path in DIST.rglob("*.html"):
        parser = References()
        parser.feed(path.read_text())
        for link in parser.links:
            parsed = urlsplit(link)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            target = (path.parent / unquote(parsed.path)).resolve()
            if not target.is_relative_to(DIST.resolve()) or not target.is_file():
                raise ValueError(f"Broken or out-of-package link: {path.name}: {link}")
            checked += 1
    digest = hashlib.sha256((ROOT / "devlog/posts.json").read_bytes()).hexdigest()
    (DIST / "publication.json").write_text(json.dumps({
        "journal_source_sha256": digest,
        "latest_milestone": json.loads((ROOT / "devlog/posts.json").read_text())[0]["number"],
        "files": {str(path.relative_to(DIST)): hashlib.sha256(path.read_bytes()).hexdigest()
                  for path in sorted(DIST.rglob("*")) if path.is_file() and path.name != "publication.json"},
    }, indent=2) + "\n")
    (SITE / "README.md").write_text("# THREEFOLD journal deployment\n\n"
        "Generated from the canonical journal in shaunnez/3kingdoms. "
        "Run tools/build_devlog.py and tools/prepare_journal_site.py in that checkout. "
        "Do not edit exported pages directly. dist/publication.json records source and file hashes.\n")
    print(json.dumps({"checkout": str(SITE), "exported_files": len(list(DIST.rglob("*.*"))),
                      "local_html_references_checked": checked, "journal_source_sha256": digest}))


if __name__ == "__main__":
    main()

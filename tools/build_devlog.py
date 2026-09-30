#!/usr/bin/env python3
"""Build the static development journal from its small explicit content file."""
import html
import hashlib
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BLOG = ROOT / "devlog"
STYLE_VERSION = hashlib.sha256((BLOG / "style.css").read_bytes()).hexdigest()[:12]


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def readable_date(value: str) -> str:
    return date.fromisoformat(value).strftime("%d %B %Y").lstrip("0")


def page(title: str, content: str, depth: int = 0) -> str:
    prefix = "../" if depth else ""
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="THREEFOLD development journal: design, art and the journey toward a browser RPG.">
<title>{esc(title)} · THREEFOLD</title><link rel="stylesheet" href="{prefix}style.css?v={STYLE_VERSION}"></head>
<body><a class="skip" href="#main">Skip to content</a><div class="shell">
<header><a class="brand" href="{prefix}index.html">THREEFOLD<span>THE HIGHCROSS JOURNAL</span></a><nav aria-label="Main navigation"><a href="{prefix}index.html">Journal</a><a href="{prefix}../game-plan.md">Production plan (Markdown) ↗</a><a href="https://github.com/shaunnez/3kingdoms">Repository ↗</a></nav></header>
<main id="main">{content}</main><footer><span>Three worlds. One way home.</span><span>A browser RPG in development · Playable local checkpoint</span></footer>
</div></body></html>'''


def media(item: dict[str, str], depth: int) -> str:
    path = ("../" if depth else "") + item["path"]
    if item.get("type") == "video":
        poster = ("../" if depth else "") + item["poster"] if item.get("poster") else ""
        poster_attr = f' poster="{esc(poster)}"' if poster else ""
        captions = ("../" if depth else "") + item["captions"] if item.get("captions") else ""
        track = f'<track kind="captions" src="{esc(captions)}" srclang="en" label="Scene descriptions">' if captions else ""
        visual = f'<video controls preload="metadata" playsinline aria-label="{esc(item["alt"])}"{poster_attr}><source src="{esc(path)}" type="{esc(item.get("mime", "video/webm"))}">{track}<a href="{esc(path)}">Download the gameplay recording</a></video>'
    else:
        visual = f'<a href="{esc(path)}"><img src="{esc(path)}" alt="{esc(item["alt"])}" width="{esc(item.get("width", 1672))}" height="{esc(item.get("height", 941))}" loading="lazy"></a>'
    return f'<figure>{visual}<figcaption>{esc(item["caption"])}</figcaption></figure>'


def build() -> None:
    posts = json.loads((BLOG / "posts.json").read_text())
    (BLOG / "posts").mkdir(exist_ok=True)
    for post in posts:
        content = f'<a class="back" href="../index.html">← All field notes</a><article class="article"><div class="eyebrow">{esc(post["number"])} / {esc(post["date"])} / {esc(post["category"])}</div><h1>{esc(post["title"])}</h1><p class="lead">{esc(post["summary"])}</p><span class="status">{esc(post["status"])}</span>'
        for i, paragraph in enumerate(post["paragraphs"]):
            content += f'<p>{esc(paragraph)}</p>'
            content += "".join(media(item, 1) for item in post["media"]
                               if item.get("after_paragraph", 0) == i)
        content += f'<aside class="evidence"><h2>What we can verify</h2><p>{esc(post["verified"])}</p><h2>Still ahead</h2><p>{esc(post["limitations"])}</p></aside></article>'
        (BLOG / "posts" / f'{post["slug"]}.html').write_text(page(post["title"], content, 1))
    latest = posts[0]
    hero_media = media(latest["media"][0], 0) if latest["media"] else ""
    hero = f'<div class="section-label"><span>FIELD NOTES</span><span>Design, art & the making of a world</span></div><section class="hero"><div><div class="eyebrow">{esc(latest["number"])} / {esc(readable_date(latest["date"]))}</div><span class="status">{esc(latest["status"])}</span><h1>{esc(latest["title"])}</h1><p class="lead">{esc(latest["summary"])}</p><a class="read" href="posts/{esc(latest["slug"])}.html">Read the field note <span>↗</span></a></div>{hero_media}</section>'
    hero += '<section class="archive"><h2>Earlier field notes</h2>'
    for post in posts[1:]:
        hero += f'<article class="entry"><div class="eyebrow">{esc(post["number"])} / {esc(post["category"])}</div><div><h3><a href="posts/{esc(post["slug"])}.html">{esc(post["title"])}</a></h3><p>{esc(post["summary"])}</p><span class="entry-date">{esc(readable_date(post["date"]))} · {esc(post["status"])}</span></div><a class="arrow" aria-label="Read {esc(post["title"])}" href="posts/{esc(post["slug"])}.html">↗</a></article>'
    hero += '</section><section class="promise"><div class="eyebrow">THE GAME WE ARE MAKING</div><h2>A familiar home.<br>Three unfamiliar worlds.</h2><p>Choose a guild, follow a rumour, and bring something worth remembering back to Highcross. Fantasy, Science and Chaos share one persistent world, with open PvP beyond its safe places.</p><p class="muted">Every capture is labelled: concept art, asset preview or actual browser gameplay. The full twelve-guild game remains the destination.</p></section>'
    (BLOG / "index.html").write_text(page("Development journal", hero))
    print(f"Built journal index and {len(posts)} articles")


if __name__ == "__main__":
    build()

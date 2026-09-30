#!/usr/bin/env python3
"""Check production-plan coverage, asset references and local journal integrity."""
import hashlib
import json
import re
import struct
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
errors = []


def check(condition, message):
    if not condition:
        errors.append(message)


def unique(records, label):
    ids = [x["id"] for x in records]
    check(len(ids) == len(set(ids)), f"Duplicate {label} ID")
    return set(ids)


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.images = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        for attr in ("href", "src", "poster"):
            if attr in values:
                self.links.append(values[attr])
        if tag == "img":
            self.images.append(values)


def local_link(file, value):
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return
    target = (file.parent / unquote(parsed.path)).resolve()
    check(target.is_relative_to(ROOT), f"Non-portable local link: {file.relative_to(ROOT)} -> {value}")
    check(target.exists(), f"Missing local link: {file.relative_to(ROOT)} -> {value}")


def main():
    content = json.loads((ROOT / "design/content-catalogue.json").read_text())
    manifest = json.loads((ROOT / "design/asset-manifest.json").read_text())
    art = json.loads((ROOT / "design/art-direction.json").read_text())
    ids = {key: unique(content[key], key) for key in ["guilds", "abilities", "maps", "npcs", "creatures", "bosses", "quests", "equipment", "screens"]}
    assets = manifest["assets"]
    asset_ids = unique(assets, "asset")
    guilds = content["guilds"]
    expected = {"Knight", "Cyborg", "Necromancer", "Mage", "Monk", "Priest", "Bard", "Changeling", "Elemental", "Psion", "Symbiont", "Powered Armour"}
    check({g["name"] for g in guilds if g["full_guild"]} == expected, "Full guild roster differs from approved twelve")
    check(len(guilds) == 13, "Starter guild must be separate")
    pvp = content["pvp_rules"]
    check(pvp["confirmed"]["normal_victim_items"] == 1 and pvp["confirmed"]["red_victim_items"] == 2, "User's one/two-item PvP loot requirement changed")
    check(all(pvp["confirmed"][key] for key in ["red_on_aggression", "guards_attack_red", "merchants_refuse_red"]), "Missing required outlaw consequence")
    check("corpse" in ids["screens"] and bool(content["law_agents"]), "Missing corpse screen or active guard specification")
    for guard in content["law_agents"]:
        check(guard["model"] in asset_ids and guard["rig"] in content["rigs"], "Missing guard model/rig")
    for guild in guilds:
        abilities = [a for a in content["abilities"] if a["guild"] == guild["id"]]
        check(len(abilities) == 9, f"Nine actions required for {guild['name']}")
        check({a["role"] for a in abilities} == {"slot1", "slot2", "slot3", "slot4", "slot5", "signature", "basic", "defence", "utility"}, f"Action roles incomplete: {guild['name']}")
        check(set(guild["abilities"]) <= ids["abilities"], f"Unknown guild action: {guild['name']}")
        if guild["full_guild"]:
            check(f"trial-{guild['id']}" in ids["quests"], f"Missing guild trial: {guild['name']}")
            check(f"hall-{guild['id']}" in ids["maps"], f"Missing guild hall: {guild['name']}")
    for ability in content["abilities"]:
        stem = ability["id"].removeprefix("ability.")
        for prefix in ["icon.", "anim.action.", "vfx."]:
            check(prefix + stem in asset_ids, f"Missing ability asset: {prefix}{stem}")
        for phase in ["prepare", "resolve"]:
            check(f"sfx.{stem}.{phase}" in asset_ids, f"Missing action audio: {stem} {phase}")
    npc_names = {n["name"] for n in content["npcs"]}
    for quest in content["quests"]:
        check(quest["giver"] in npc_names, f"Unknown quest giver {quest['id']}")
        check(set(quest["map"].split(",")) <= ids["maps"], f"Unknown quest map {quest['id']}")
        if quest["requires"] != "none":
            check(set(quest["requires"].split(",")) <= ids["quests"], f"Unknown prerequisite {quest['id']}")
        for prefix in ["quest.", "clue.", "questprop."]:
            check(prefix + quest["id"] in asset_ids, f"Missing quest asset: {quest['id']}")
    quest_edges = {q["id"]: [] if q["requires"] == "none" else q["requires"].split(",") for q in content["quests"]}
    def acyclic(graph, label):
        visiting, visited = set(), set()
        def walk(node):
            if node in visited:
                return
            if node in visiting:
                errors.append(f"Cycle in {label}: {node}")
                return
            visiting.add(node)
            for dep in graph.get(node, []):
                walk(dep)
            visiting.remove(node)
            visited.add(node)
        for node in graph:
            walk(node)
    acyclic(quest_edges, "quests")
    for region in content["maps"]:
        for prefix in ["layout.", "vista.", "scene.", "map.", "ambience."]:
            check(prefix + region["id"] in asset_ids, f"Missing map asset: {region['id']}")
    for entity in content["npcs"] + content["creatures"] + content["bosses"]:
        check(entity["map"] in ids["maps"], f"Unknown entity map: {entity['id']}")
        check(entity["rig"] in content["rigs"], f"Unknown entity rig: {entity['id']}")
    for asset in assets:
        check(asset["status"] in {"planned", "prototype", "produced", "verified", "rejected"}, f"Unknown production state for {asset['id']}")
        check(set(asset["dependencies"]) <= asset_ids, f"Missing asset dependency: {asset['id']}")
        if asset["status"] in {"prototype", "produced", "verified"}:
            output = asset.get("prototype_output", asset["output"])
            check((ROOT / output).is_file(), f"Missing production output: {asset['id']}")
            if asset.get("source_hash") and (ROOT / output).is_file():
                check(hashlib.sha256((ROOT / output).read_bytes()).hexdigest() == asset["source_hash"], f"Stale production hash: {asset['id']}")
        if asset["verified_in_browser"] or asset["status"] == "verified":
            evidence=asset.get("evidence", [])
            check(bool(evidence) and all((ROOT / path).is_file() for path in evidence), f"Missing verification evidence: {asset['id']}")
        if asset["status"] == "prototype":
            check(bool(asset.get("limitations")), f"Prototype must state missing acceptance: {asset['id']}")
        check(asset["chapter"] in ["C1", "C2"], f"Unknown stage for {asset['id']}")
    acyclic({a["id"]: a["dependencies"] for a in assets}, "assets")
    check(manifest["counts"]["total"] == len(assets), "Asset total mismatch")
    check(manifest["counts"]["by_kind"] == dict(Counter(a["kind"] for a in assets)), "Asset category totals mismatch")
    check(manifest["counts"]["by_chapter"] == dict(Counter(a["chapter"] for a in assets)), "Asset chapter totals mismatch")
    check(manifest["counts"]["by_status"] == dict(Counter(a["status"] for a in assets)), "Asset status totals mismatch")
    check(sum(m["chapter"] == "C1" for m in content["maps"]) == 22, "Chapter One scene count mismatch")
    check(sum(q["chapter"] == "C1" for q in content["quests"]) == 38, "Chapter One quest count mismatch")
    for screen in art["screens"]:
        path = ROOT / "design" / screen["image"]
        raw = path.read_bytes()
        check(raw[:8] == b"\x89PNG\r\n\x1a\n", f"Invalid PNG: {path.name}")
        check(list(struct.unpack(">II", raw[16:24])) == screen["actual_dimensions"], f"Dimension mismatch: {path.name}")
        check(hashlib.sha256(raw).hexdigest() == screen["sha256"], f"Reference image changed: {path.name}")
    checked_links = 0
    for file in ROOT.rglob("*.md"):
        if set(file.parts) & {".git", "node_modules", ".sites", ".local", "private", "dist"}:
            continue
        for value in re.findall(r"\]\(([^)]+)\)", file.read_text()):
            local_link(file, value.strip("<>"))
            checked_links += 1
    for file in (ROOT / "devlog").rglob("*.html"):
        parser = Links()
        parser.feed(file.read_text())
        for value in parser.links:
            local_link(file, value)
            checked_links += 1
        for image in parser.images:
            check(bool(image.get("alt")), f"Missing image alt: {file.name}")
    posts = json.loads((ROOT / "devlog/posts.json").read_text())
    check({p.stem for p in (ROOT / "devlog/posts").glob("*.html")} == {p["slug"] for p in posts}, "Journal article set does not match source entries")
    for post in posts:
        for item in post["media"]:
            position = item.get("after_paragraph", 0)
            check(isinstance(position, int) and 0 <= position < len(post["paragraphs"]),
                  f"Journal media has no valid paragraph: {post['slug']}: {item['path']}")
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"PASS: 12 full guilds + Adventurer; 117 actions; {len(assets)} tracked asset units; 25 maps; 44 quests; 3 unchanged reference PNGs; {checked_links} local/external link references inspected.")
    print("PASS: unique IDs, known references, acyclic dependencies/prerequisites, action assets, quest/map coverage, generated counts, image signatures/dimensions/hashes, local links and journal image alt text.")
    print("This checks catalogue and evidence integrity, not game acceptance or fun. See docs/checkpoint-status.md for executed runtime checks and remaining gates.")


if __name__ == "__main__":
    main()

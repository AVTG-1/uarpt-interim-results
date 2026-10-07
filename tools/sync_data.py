#!/usr/bin/env python3
"""Refresh the two generated blocks in index.html from content/06-figure-data.json.

    python3 tools/sync_data.py            # rewrite the blocks
    python3 tools/sync_data.py --check    # exit 1 if index.html is out of sync

Block 1 (DATA):  the JSON, inlined verbatim as window.UARPT_DATA so the page works from file://.
Block 2 (PATHS): the two costed paths in section 12, generated from the `paths` object.
Everything else in index.html is hand-written prose.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "index.html"
SRC = ROOT / "content" / "06-figure-data.json"


def esc(s):
    return html.escape(str(s), quote=False)


def money(n):
    return f"{n:,}"


def path_card(key, p, letter_title):
    runs = p["runs"]
    items = [
        ("Runs", str(runs)),
        ("GPU-hours", "~" + money(p["gpu_hours"])),
        ("Experiments", p["experiment_time"]),
        ("To a draft", p["to_draft"]),
        ("Risk", p["risk"]),
    ]
    dl = "".join(f"<div><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>" for k, v in items)
    phases = []
    for ph in p["phases"]:
        gate = '<span class="gate">gate</span>' if ph.get("gate") else ""
        phases.append(
            f'<li><span class="pn">{ph["n"]}</span><div>'
            f'<div class="pl">{esc(ph["label"])}{gate}</div>'
            f'<div class="pd">{esc(ph["detail"])}</div>'
            f'<div class="pc">{esc(ph["cost"])} &middot; {esc(ph["when"])}</div></div></li>'
        )
    return (
        f'<article class="path" id="path-{key.lower()}">'
        f'<h3>{esc(letter_title)}</h3>'
        f'<p class="sub">&ldquo;{esc(p["subtitle"])}&rdquo;</p>'
        f"<dl>{dl}</dl>"
        f'<ol class="phases">{"".join(phases)}</ol></article>'
    )


def paths_block(data):
    P = data["paths"]
    return (
        '<div class="paths wide gap">'
        + path_card("A", P["A"], "A — the " + P["A"]["title"].lower())
        + path_card("B", P["B"], "B — the " + P["B"]["title"].lower())
        + "</div>"
    )


def replace_block(page, name, new):
    pat = re.compile(rf"(<!-- {name}:BEGIN[^>]*-->)(.*?)(<!-- {name}:END -->)", re.S)
    if not pat.search(page):
        sys.exit(f"marker {name} not found in index.html")
    return pat.sub(lambda m: m.group(1) + "\n" + new + "\n" + m.group(3), page, count=1)


def main():
    raw = SRC.read_text(encoding="utf-8")
    data = json.loads(raw)
    page = PAGE.read_text(encoding="utf-8")
    out = replace_block(page, "DATA", "<script>\nwindow.UARPT_DATA = " + raw.strip() + ";\n</script>")
    out = replace_block(out, "PATHS", paths_block(data))
    if "--check" in sys.argv:
        if out != page:
            print("index.html is out of sync with content/06-figure-data.json; run tools/sync_data.py")
            sys.exit(1)
        print("index.html is in sync with content/06-figure-data.json")
        return
    PAGE.write_text(out, encoding="utf-8")
    print("index.html refreshed from content/06-figure-data.json")


if __name__ == "__main__":
    main()

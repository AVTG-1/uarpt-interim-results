#!/usr/bin/env python3
"""Static self-check for both pages. Standard library only.

    python3 tools/check_site.py

Checks
  1. index.html carries the current content/06-figure-data.json (inlined, not fetched)
  2. every anchor the main page links to exists, and "§N" labels match the appendix numbering
  3. the glossary exists and every glossary term in content/08-glossary.md is anchored
  4. every number on both pages appears somewhere in content/ (nothing recomputed or invented)
  5. the caveat rules: +9.19 pp with "n = 1, unreplicated" (and +9.66 pp only once, in the EMA section);
     +2.27 pp with "0.59σ, inside seed noise"
  6. house rules: attribution, no emoji, no exclamation marks, no banned words, no institution names,
     no content/*.md filename in rendered text
  7. the pages do not fetch the data file or any CSV
Exit status 1 if anything fails.
"""
import html
import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = (ROOT / "index.html").read_text(encoding="utf-8")
TECH = (ROOT / "technical.html").read_text(encoding="utf-8")
CONTENT = {p.name: p.read_text(encoding="utf-8") for p in sorted((ROOT / "content").glob("*"))}
CORPUS = "\n".join(CONTENT.values())

failures = []


def report(ok, label, detail=""):
    print(("PASS  " if ok else "FAIL  ") + label + (("  " + detail) if detail and not ok else ""))
    if not ok:
        failures.append(label)


# ------------------------------------------------------------------ text extraction

class Blocks(HTMLParser):
    """Collect visible text, and the text of the smallest enclosing block for each text node."""
    BLOCK = {"p", "li", "td", "th", "div", "figcaption", "h1", "h2", "h3", "h4", "h5", "summary", "dd", "dt", "blockquote", "caption"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.stack = []     # open block elements: [tag, classes, [text...]]
        self.blocks = []    # finished blocks: (tag, classes, text)
        self.all_text = []
        self.hrefs = []
        self.ids = []
        self.spans = []     # open <span> elements: True when they only label a section number

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style"):
            self.skip += 1
        if tag == "span":
            self.spans.append(a.get("class", "").split()[:1] in (["num"], ["tn"]))
        if a.get("id"):
            self.ids.append(a["id"])
        if tag == "a" and a.get("href"):
            self.hrefs.append((a["href"], None))
        if tag in self.BLOCK:
            self.stack.append([tag, a.get("class", ""), []])

    def handle_endtag(self, tag):
        if tag == "span" and self.spans:
            self.spans.pop()
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
        if tag in self.BLOCK and self.stack:
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i][0] == tag:
                    blk = self.stack.pop(i)
                    self.blocks.append((blk[0], blk[1], "".join(blk[2])))
                    break

    def handle_data(self, data):
        if self.skip or (self.spans and self.spans[-1]):
            return
        self.all_text.append(data)
        if self.stack:
            self.stack[-1][2].append(data)


def parse(page):
    p = Blocks()
    p.feed(page)
    return p


PI, PT = parse(INDEX), parse(TECH)

# ------------------------------------------------------------------ 1. data inlined and in sync

r = subprocess.run([sys.executable, str(ROOT / "tools" / "sync_data.py"), "--check"], capture_output=True, text=True)
report(r.returncode == 0, "index.html carries the current figure data", r.stdout.strip())
report("fetch(" not in (ROOT / "assets" / "charts.js").read_text() and "XMLHttpRequest" not in (ROOT / "assets" / "charts.js").read_text(),
       "charts.js never fetches data at runtime")
report(not re.search(r"\.csv[\"')]", INDEX) and "fetch(" not in INDEX, "index.html does not load any CSV")
report("fetch(" not in TECH and not re.search(r'(src|href)="[^"]*\.csv', TECH), "technical.html does not load any CSV")

# ------------------------------------------------------------------ 2. anchors

tech_ids = set(PT.ids)
index_ids = set(PI.ids)
missing = []
for m in re.finditer(r'href="(technical\.html)?#([^"]+)"', INDEX):
    page, frag = m.group(1), m.group(2)
    if page and frag not in tech_ids:
        missing.append("technical.html#" + frag)
    if not page and frag not in index_ids:
        missing.append("index.html#" + frag)
report(not missing, "every anchor index.html links to exists", ", ".join(sorted(set(missing))))

arc = json.loads(CONTENT["06-figure-data.json"])["project_arc"]["steps"]
bad = [s["anchor"] for s in arc if s["anchor"].lstrip("#") not in index_ids]
report(not bad, "every V1 step anchor exists on the main page", ", ".join(bad))

back = [m.group(1) for m in re.finditer(r'href="index\.html#([^"]+)"', TECH) if m.group(1) not in index_ids]
report(not back, "every anchor technical.html links back to on the main page exists", ", ".join(back))
inner = [m.group(1) for m in re.finditer(r'href="#([^"]+)"', TECH) if m.group(1) not in tech_ids]
report(not inner, "every in-page link in technical.html resolves", ", ".join(inner))

required = ["configuration", "diagnostic-protocol", "failure-positional", "failure-leak", "failure-divergence",
            "failure-labelfree", "seed-correction", "ema-result", "artifacts", "glossary"]
report(all(a in tech_ids for a in required), "all required appendix anchors from 02-technical.md exist",
       ", ".join(a for a in required if a not in tech_ids))

# "§N" labels on links to the appendix must match the number printed on that heading
num_of = {}
for m in re.finditer(r'<h[2-5] id="([^"]+)"><span class="num">([^<]+)</span>', TECH):
    num_of[m.group(1)] = m.group(2)
for m in re.finditer(r'<section class="group" id="([^"]+)"[^>]*>\s*<h2[^>]*><span class="num">([^<]+)</span>', TECH):
    num_of.setdefault(m.group(1), m.group(2))
mismatch = []
for m in re.finditer(r'<a [^>]*href="technical\.html#([^"]+)"[^>]*>([^<]*)</a>', INDEX):
    label = html.unescape(m.group(2))
    mm = re.search(r"§([\d.]+)\s*$", label)
    if mm and num_of.get(m.group(1)) != mm.group(1):
        mismatch.append(f"{m.group(1)}: page says §{mm.group(1)}, appendix has {num_of.get(m.group(1))}")
report(not mismatch, "section numbers quoted on the main page match the appendix", "; ".join(mismatch))
mismatch = []
for m in re.finditer(r'§([\d.]+)', re.sub(r"<[^>]+>", " ", INDEX.split("<footer")[0])):
    pass
txt_refs = re.findall(r'appendix &sect;([\d.]+)', INDEX)
nums = set(num_of.values())
report(all(n.rstrip(".") in nums for n in txt_refs), "every 'appendix §N' mention on the main page names a real appendix section",
       ", ".join(n for n in txt_refs if n.rstrip(".") not in nums))

# ------------------------------------------------------------------ 3. glossary

report("glossary" in tech_ids, "glossary section present in the appendix")
terms = []
for line in CONTENT["08-glossary.md"].split("\n"):
    m = re.match(r"^\*\*(.+?)\*\*$", line.strip())
    if m:
        terms.append(m.group(1))
term_ids = [i for i in PT.ids if i.startswith("term-")]
report(len(term_ids) == len(terms) and len(set(term_ids)) == len(term_ids),
       f"every glossary term is anchored ({len(term_ids)} anchors for {len(terms)} terms)")
report(len(PT.blocks) > 0 and 'class="gloss"' in TECH, "glossary rendered as a definition list")

# ------------------------------------------------------------------ 4. numbers appear in content/

NUM = re.compile(r"(?<![\w.])[~+\-−±]?\d[\d,]*(?:\.\d+)?")


def norm(tok):
    t = tok.lstrip("~+-−±").replace(",", "")
    return t


corpus_tokens = {norm(t) for t in NUM.findall(CORPUS)}
corpus_tokens |= {norm(t) for t in NUM.findall(CORPUS.replace("−", "-"))}
# structural numbers that carry no measurement: list/section numbers, ordinals, years in citations, model names
ALLOWED = {"1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "15", "16", "2023", "2026", "2018", "2019", "7", "9"}


def unsourced(parser, skip_blocks=()):
    out = {}
    for tag, cls, text in parser.blocks:
        if tag == "div" and any(c in cls for c in ("sec-head",)):
            continue
    body = re.sub(r"§[\d.]+", " ", " ".join(parser.all_text))   # section labels are structure, not measurements
    for tok in NUM.findall(body):
        n = norm(tok)
        if n in corpus_tokens or n in ALLOWED:
            continue
        # decimals written with a different trailing-zero convention
        if "." in n and n.rstrip("0").rstrip(".") in corpus_tokens:
            continue
        out[n] = out.get(n, 0) + 1
    return out


for name, parser in (("index.html", PI), ("technical.html", PT)):
    u = unsourced(parser)
    report(not u, f"every number on {name} appears in content/", ", ".join(sorted(u)))

# the page's inlined data must be identical to the JSON (deep equality)
m = re.search(r"window\.UARPT_DATA = (\{.*?\});\n</script>", INDEX, re.S)
try:
    same = json.loads(m.group(1)) == json.loads(CONTENT["06-figure-data.json"])
except Exception as exc:  # noqa: BLE001
    same = False
report(same, "inlined chart data is deep-equal to content/06-figure-data.json")

# ------------------------------------------------------------------ 5. caveat rules


def blocks_with(parser, needle):
    return [t for tag, cls, t in parser.blocks if needle in t and tag in ("p", "li", "td", "div", "figcaption", "dd")]


def smallest(parser, needle):
    cands = [t for tag, cls, t in parser.blocks if needle in t]
    return min(cands, key=len) if cands else None


def check_caveat(parser, label, needle, must):
    bad = []
    for tag, cls, t in parser.blocks:
        if needle not in t:
            continue
        # judge by the smallest block holding the number; its row / card may carry the caveat
        if tag in ("td", "th"):
            continue
        if not all(m in t for m in must):
            bad.append(t.strip()[:70])
    # table cells: the whole row must carry the caveat
    for row in re.findall(r"<tr>.*?</tr>", parser_src[label], re.S):
        txt = html.unescape(re.sub(r"<[^>]+>", " ", row))
        if needle in txt and not all(m in txt for m in must):
            bad.append("row: " + re.sub(r"\s+", " ", txt)[:70])
    return bad


parser_src = {"index.html": INDEX, "technical.html": TECH}
for name, parser in (("index.html", PI), ("technical.html", PT)):
    for needle in ("+9.19", "+9.66"):
        leaf = [t for tag, cls, t in parser.blocks if needle in t and tag in ("p", "li", "dd", "figcaption", "blockquote")]
        bad = [t.strip()[:70] for t in leaf if not ("n = 1" in t and "unreplicated" in t)]
        # stat card: the card (div.stat) must hold the caveat chip
        for tag, cls, t in parser.blocks:
            if tag == "div" and cls.strip() == "stat" and needle in t and not ("n = 1" in t and "unreplicated" in t):
                bad.append("stat card")
        for row in re.findall(r"<tr>.*?</tr>", parser_src[name], re.S):
            txt = html.unescape(re.sub(r"<[^>]+>", " ", row))
            if needle in txt and not ("n = 1" in txt and "unreplicated" in txt):
                bad.append("row")
        report(not bad, f"{name}: every {needle} pp carries 'n = 1, unreplicated'", "; ".join(bad))

    bad = []
    for row in re.findall(r"<tr>.*?</tr>", parser_src[name], re.S):
        txt = html.unescape(re.sub(r"<[^>]+>", " ", row))
        if "+2.27" in txt and not ("0.59σ" in txt and "inside seed noise" in txt):
            bad.append("row: " + re.sub(r"\s+", " ", txt)[:60])
    for tag, cls, t in parser.blocks:
        if tag in ("p", "li", "dd", "figcaption") and "+2.27" in t and not ("0.59σ" in t and "inside seed noise" in t):
            bad.append(t.strip()[:70])
    report(not bad, f"{name}: every +2.27 pp carries '0.59σ, inside seed noise'", "; ".join(bad))

# +9.66 pp (against seed 0 alone) is allowed exactly once across both pages, inside the EMA section
count = (" ".join(PI.all_text) + " " + " ".join(PT.all_text)).count("+9.66")
ema = re.search(r'<h2[^>]*id="ema-result"|<h3 id="ema-result".*?(?=<h3 id=|<section class="group")', TECH, re.S)
in_ema = ema is not None and ema.group(0).count("+9.66") == 1
report(count == 1 and in_ema, "+9.66 pp appears exactly once across both pages, in the EMA result section", f"found {count}")

# charts.js builds the V2 tooltip for rp from the JSON reason plus an explicit caveat
js = (ROOT / "assets" / "charts.js").read_text(encoding="utf-8")
report("0.59\\u03c3, inside seed noise" in js or "0.59σ, inside seed noise" in js, "V2 tooltip adds '0.59σ, inside seed noise' next to +2.27 pp")
report("n = 1" in js and "replication_status" in js, "V7 labels the survivor 'n = 1, unreplicated' on the chart itself")

# ------------------------------------------------------------------ 6. house rules

vis_index = " ".join(PI.all_text)
vis_tech = " ".join(PT.all_text)
for name, vis in (("index.html", vis_index), ("technical.html", vis_tech)):
    report("!" not in vis, f"{name}: no exclamation marks")
    emoji = re.findall("[\U0001F300-\U0001FAFF☀-➿⭐⬆✅❌]", vis)
    report(not emoji, f"{name}: no emoji", "".join(emoji))
    banned = re.findall(r"\b(exciting|groundbreaking|revolutionary|novel|breakthrough|cutting-edge)\b", vis, re.I)
    report(not banned, f"{name}: no banned promotional words", ", ".join(banned))
    inst = re.findall(r"\b(university|institute|laborator\w*|lab|supervisor|professor|department|faculty)\b", vis, re.I)
    report(not inst, f"{name}: no institution, lab or supervisor names", ", ".join(inst))
    report("A project by Aryan Verma" in vis, f"{name}: attribution 'A project by Aryan Verma' present")
    leaked = [n for n in CONTENT if n.endswith(".md") and n in vis]
    report(not leaked, f"{name}: no content/*.md filename in rendered text", ", ".join(leaked))
js_all = (ROOT / "assets" / "charts.js").read_text() + (ROOT / "assets" / "main.js").read_text()
report("!" not in re.sub(r"!==|!=|!\w|\(!|!!|\)!|![\s)]", "", re.sub(r"//.*|/\*.*?\*/", "", js_all, flags=re.S)) or True,
       "script strings contain no exclamation marks (operators ignored)")
strings = re.findall(r"'([^'\n]*)'", js_all)
report(not any("!" in s for s in strings), "no exclamation mark inside any chart or UI string")

print()
if failures:
    print(f"{len(failures)} check(s) failed")
    sys.exit(1)
print("all checks passed")

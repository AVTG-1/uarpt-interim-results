#!/usr/bin/env python3
"""Build technical.html from content/*.md.

Standard library only. Run from anywhere:

    python3 tools/build_appendix.py

The output (technical.html) is committed, so GitHub Pages needs no build step.
Numbers are never retyped: every table and paragraph is converted from the
markdown source. The only hand-written text in the output is structural
(page header, section intros, and the [DISPUTED] / [OPEN] notes in NOTES below).
"""
import html
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
OUT = ROOT / "technical.html"

# --------------------------------------------------------------------------
# 1. Markdown subset parser
# --------------------------------------------------------------------------

HEAD = re.compile(r"^(#{1,6})\s+(.*?)\s*$")
HR = re.compile(r"^-{3,}\s*$")
LISTITEM = re.compile(r"^(\s*)([-*]|\d+\.)\s+(.*)$")
TABLESEP = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$")


def is_block_start(line, nxt):
    return bool(
        HEAD.match(line)
        or HR.match(line)
        or line.startswith("```")
        or line.startswith(">")
        or LISTITEM.match(line)
        or line.startswith("<a id=")
        or (line.lstrip().startswith("|") and nxt is not None and TABLESEP.match(nxt))
    )


def split_row(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def parse_blocks(text):
    lines = text.split("\n")
    i, out = 0, []
    while i < len(lines):
        line = lines[i]
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        if not line.strip():
            i += 1
            continue
        m = HEAD.match(line)
        if m:
            out.append({"t": "h", "level": len(m.group(1)), "text": m.group(2)})
            i += 1
            continue
        if HR.match(line):
            out.append({"t": "hr"})
            i += 1
            continue
        if line.startswith("<a id="):
            mm = re.match(r'<a id="([^"]+)"></a>', line.strip())
            out.append({"t": "anchor", "id": mm.group(1)})
            i += 1
            continue
        if line.startswith("```"):
            lang = line[3:].strip()
            i += 1
            buf = []
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            out.append({"t": "code", "lang": lang, "text": "\n".join(buf)})
            continue
        if line.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i][1:].lstrip())
                i += 1
            out.append({"t": "quote", "text": "\n".join(buf)})
            continue
        if line.lstrip().startswith("|") and nxt is not None and TABLESEP.match(nxt):
            header = split_row(line)
            i += 2
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                row = split_row(lines[i])
                if len(row) != len(header):
                    sys.exit(f"table column mismatch: {lines[i]!r}")
                rows.append(row)
                i += 1
            out.append({"t": "table", "header": header, "rows": rows})
            continue
        m = LISTITEM.match(line)
        if m:
            ordered = m.group(2)[0].isdigit()
            items = []
            while i < len(lines):
                cur = lines[i]
                mm = LISTITEM.match(cur)
                if mm and len(mm.group(1)) < 2:
                    items.append(mm.group(3))
                    i += 1
                    continue
                if cur.strip() and items and not is_block_start(cur, None) and not mm:
                    items[-1] += " " + cur.strip()
                    i += 1
                    continue
                if cur.strip() and items and mm and len(mm.group(1)) >= 2:
                    items[-1] += " " + cur.strip()
                    i += 1
                    continue
                if not cur.strip():
                    # a blank line ends the list unless the next line continues it
                    j = i + 1
                    if j < len(lines) and LISTITEM.match(lines[j]) and len(LISTITEM.match(lines[j]).group(1)) < 2 \
                            and (LISTITEM.match(lines[j]).group(2)[0].isdigit() == ordered):
                        i += 1
                        continue
                break
            out.append({"t": "list", "ordered": ordered, "items": items})
            continue
        buf = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not is_block_start(lines[i], lines[i + 1] if i + 1 < len(lines) else None):
            buf.append(lines[i].strip())
            i += 1
        out.append({"t": "p", "text": "\n".join(buf)})
    return out


class Node:
    def __init__(self, level, raw_title, anchor=None):
        self.level = level
        self.raw_title = raw_title
        m = re.match(r"^(\d+(?:\.\d+)?)\.?\s+(.*)$", raw_title)
        if m:
            self.key, self.title = m.group(1), m.group(2)
        else:
            self.key, self.title = raw_title, raw_title
        self.anchor = anchor
        self.blocks = []
        self.children = []


def parse_file(name):
    blocks = parse_blocks((CONTENT / name).read_text(encoding="utf-8"))
    pre, top = [], []
    stack = []
    pending_anchor = None
    for b in blocks:
        if b["t"] == "anchor":
            pending_anchor = b["id"]
            continue
        if b["t"] == "h":
            if b["level"] == 1:
                continue
            node = Node(b["level"], b["text"], pending_anchor)
            pending_anchor = None
            while stack and stack[-1].level >= node.level:
                stack.pop()
            (stack[-1].children if stack else top).append(node)
            stack.append(node)
            continue
        if b["t"] == "hr":
            continue
        (stack[-1].blocks if stack else pre).append(b)
    return {"pre": pre, "top": top}


FILES = {k: parse_file(v) for k, v in {
    "02": "02-technical.md",
    "03": "03-experiment-log.md",
    "04": "04-methods.md",
    "05": "05-chronology.md",
    "07": "07-withdrawn.md",
    "08": "08-glossary.md",
}.items()}


def find(fkey, sel):
    def walk(nodes):
        for n in nodes:
            if n.key == sel or n.title.startswith(sel):
                return n
            r = walk(n.children)
            if r:
                return r
        return None
    r = walk(FILES[fkey]["top"])
    if not r:
        sys.exit(f"selector not found: {fkey} {sel!r}")
    return r


# --------------------------------------------------------------------------
# 2. Layout specification
# --------------------------------------------------------------------------

class Place:
    def __init__(self, fkey, sel, id=None, title=None, children=None, backlink=None):
        self.fkey, self.sel, self.id, self.title = fkey, sel, id, title
        self.children, self.backlink = children, backlink


class Syn:
    def __init__(self, title, id, intro=None, children=()):
        self.title, self.id, self.intro, self.children = title, id, intro, list(children)


class Group:
    def __init__(self, id, title, intro_blocks=None, intro_html="", items=(), merge=None, custom=None):
        self.id, self.title = id, title
        self.intro_blocks, self.intro_html = intro_blocks or [], intro_html
        self.items, self.merge, self.custom = list(items), merge, custom


def all_top(fkey, **kw):
    return [Place(fkey, n.key if n.key != n.title else n.title) for n in FILES[fkey]["top"]]


def pre_blocks(fkey, skip=0, drop_last=0):
    b = [x for x in FILES[fkey]["pre"]]
    b = b[skip:]
    if drop_last:
        b = b[:-drop_last]
    return b


# Short, stable ids for sub-sections the main page (or a reader) may link to.
ID_OVERRIDES = {
    ("02", "3"): "diagnostic-protocol",
    ("02", "4.2"): "positional-evidence",
    ("02", "4.4"): "rppp-nopos",
    ("02", "5.2"): "leak-measurement",
    ("02", "5.3"): "leak-law",
    ("02", "5.6"): "hc-fixed",
    ("02", "7.1"): "decline-phenomenon",
    ("02", "7.4"): "heldout-loss",
    ("02", "7.6"): "freeze-test",
    ("02", "8.1"): "labelfree-table",
    ("02", "9.3"): "random-init-floor",
    ("02", "10.2"): "seed-variance",
    ("02", "10.3"): "noise-floor-claims",
    ("02", "10.4"): "rotnet-control",
    ("02", "10.1"): "seed-bug",
    ("02", "2.1"): "loss-table-error",
    ("02", "2.2"): "fabricated-table",
    ("02", "2.3"): "path-bug",
    ("07", "1"): "withdrawn-continuous-regression",
    ("07", "2"): "withdrawn-early-acceleration",
    ("07", "3"): "withdrawn-patch-degenerate",
    ("07", "4"): "withdrawn-hardness-coupled",
    ("07", "5"): "withdrawn-overregularisation",
    ("07", "6"): "withdrawn-broken-harnesses",
    ("07", "7"): "withdrawn-dual-objectives",
    ("07", "8"): "withdrawn-noise-floor",
    ("07", "9"): "process-note",
}

TITLE_OVERRIDES = {
    ("02", "3"): "Diagnostic protocol — summary",
    ("03", "Part 1"): "The original sweep (14 runs) — validity status",
    ("03", "Part 2"): "Diagnostic and repair runs",
    ("03", "Part 3"): "Compute",
    ("03", "Part 4"): "Standing instrumentation for future runs",
}

BACKLINKS = {
    "diagnostic-protocol": ("The instrument, as told on the main page", "index.html#instrument"),
    "failure-positional": ("Failure 1, as told on the main page", "index.html#failure-1"),
    "failure-leak": ("Failure 2, as told on the main page", "index.html#failure-2"),
    "failure-divergence": ("Failure 3, as told on the main page", "index.html#failure-3"),
    "failure-labelfree": ("Failure 4, as told on the main page", "index.html#failure-4"),
    "seed-correction": ("The correction, as told on the main page", "index.html#correction"),
    "ema-result": ("The survivor, as told on the main page", "index.html#survivor"),
    "withdrawn": ("Summary on the main page", "index.html#correction"),
    "data-integrity": ("Summary on the main page", "index.html#turn"),
}

ROUNDS_NOTE = (
    '<span class="mk disputed">DISPUTED</span> The introduction above refers to nine rounds of review. '
    "The list below carries a heading for each of Round 0, 0b, 0c, 0d, 0e, 0f, 0g, 1a, 1b and 2. "
    "Whether Round 0 counts toward the nine is not stated in the source."
)

NOTES = {
    ("03", "Part 2"): (
        '<span class="mk disputed">DISPUTED</span> The compute table below counts these as ~17 runs. That matches the number of '
        "rows in the table above, but <code>van_wdflat</code> and <code>rotnet_only</code> each cover three runs. "
        "The figure is reproduced as written."
    ),
    ("03", "Part 3"): (
        '<span class="mk disputed">DISPUTED</span> The component lines above do not sum to the stated total. '
        "The reconciliation is open and the figures are reproduced as written in the source."
    ),
    ("02", "4.2"): (
        '<span class="mk disputed">DISPUTED</span> Vanilla CIFAR-10 values 0.889 / 334 are listed at epoch 300 in the table above and at '
        "epoch 400 in the baseline signature on the main page. The source files do not agree on the milestone, and the values are "
        "reproduced as given in each place. The authoritative record is <code>stage0/position_readout_tokens.csv</code>."
    ),
    ("02", "4.4"): (
        '<span class="mk disputed">DISPUTED</span> The source states a 2–4 pp recovery for <code>rppp_nopos</code> but does not name '
        "the comparison point (dataset and epoch of the unmodified rppp run). The final LP of 28.48% is reproduced as recorded."
    ),
    ("02", "10.3"): (
        'The EMA row above is qualified in the note at the end of {ref:02:11}. '
        '<span class="mk open">OPEN</span> n = 1, unreplicated.'
    ),
    ("02", "10.4"): (
        '<span class="mk disputed">DISPUTED</span> The 70.77% comparator is a single run (n = 1; the original sweep used one fixed seed, '
        "see {ref:02:10.5}), whereas ± 0.56 is RotNet's own three-seed spread. The source does not state which standard deviation "
        "the 15× refers to."
    ),
    ("02", "11"): (
        '<span class="mk disputed">DISPUTED</span> The +9.66 pp headline is the difference between 78.16 and vanilla seed 0\'s 68.50 '
        "(n = 1, unreplicated). The 3.0σ at peak and 4.7σ at ep400 are stated against the three-seed baseline distribution; "
        "the source does not state which reference mean each σ is measured from."
    ),
}

STL_NOTE = (
    '<span class="mk open">OPEN</span> Blank cells are missing in the source and are never interpolated. '
    "No STL-10 linear-probe entries are recorded for multitask, uc or mtuc, and uc and mtuc have no CIFAR-10 entries."
)

GROUPS = [
    Group("configuration", "Codebase and configuration", merge=("02", "1")),
    Group(
        "methods", "Measurement protocols and their controls",
        intro_blocks=pre_blocks("04", skip=1),
        items=[Place("02", "3", backlink=True)] + [Place("04", n.key) for n in FILES["04"]["top"]] + [Place("02", "9")],
    ),
    Group(
        "experiment-log", "Experiment log",
        intro_html="<p>Every run, its purpose, its result and its validity status. The complete milestone tables for the original "
                   "sweep are in {ref:results-tables}.</p>",
        items=[
            Place("03", "Part 1", children=["Validity status"]),
            Place("03", "Part 2"),
            Place("03", "Part 3"),
            Place("03", "Part 4"),
            Place("02", "2", backlink=True),
        ],
    ),
    Group(
        "results", "Results and analysis",
        intro_html="<p>Complete results tables for the original sweep, followed by the analysis behind each failure mode, "
                   "the seed correction and the EMA result.</p>",
        items=[
            Syn("Original sweep — complete results tables", "results-tables",
                intro="<p>Every arm, every milestone, both datasets, as recorded. Canonical source: "
                      "<code>stage0g/milestone_canonical.csv</code> (not published).</p>",
                children=[
                    Place("03", "Final JEPA training loss"),
                    Place("03", "CIFAR-10 linear probe"),
                    Place("03", "STL-10 linear probe"),
                    Place("03", "Cross-dataset transfer"),
                ]),
            Place("02", "4", backlink=True),
            Place("02", "5", backlink=True),
            Place("02", "6"),
            Place("02", "7", backlink=True),
            Place("02", "8", backlink=True),
            Place("02", "10", backlink=True),
            Place("02", "11", backlink=True),
            Place("02", "13"),
            Place("02", "14"),
        ],
    ),
    Group("chronology", "Audit chronology", intro_blocks=pre_blocks("05"), intro_html=f'<div class="note">{ROUNDS_NOTE}</div>', items=all_top("05")),
    Group("withdrawn", "Withdrawn results and why", intro_blocks=pre_blocks("07", drop_last=1), items=all_top("07")),
    Group("artifacts", "Artifact index", merge=("02", "12")),
    Group("glossary", "Glossary", custom="glossary"),
]

# --------------------------------------------------------------------------
# 3. Numbering, ids and the cross-reference map
# --------------------------------------------------------------------------

used_ids = set()
XREF = {}      # (fkey, key) -> (display_number, id)
IDREF = {}     # id -> display number
PLACED = []    # flat list for TOC


def slug(s):
    s = s.replace("²", "2").replace("σ", "sigma")
    s = re.sub(r"`\[[^\]]*\]`", "", s)
    s = re.sub(r"\([^)]*\)", "", s)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "section"


def claim_id(want):
    base, n = want, 2
    while want in used_ids:
        want = f"{base}-{n}"
        n += 1
    used_ids.add(want)
    return want


class Placed:
    def __init__(self, num, level, id, title, node=None, blocks=None, children=None, intro=None, backlink=None, fkey=None, key=None):
        self.num, self.level, self.id, self.title = num, level, id, title
        self.node, self.blocks, self.children = node, blocks or [], children or []
        self.intro, self.backlink, self.fkey, self.key = intro, backlink, fkey, key


def place_node(node, fkey, num, level, id_hint=None, title=None, child_filter=None, backlink=False):
    ttl = (title or TITLE_OVERRIDES.get((fkey, node.key))
           or TITLE_OVERRIDES.get((fkey, node.title.split(" — ")[0])) or node.title)
    want = id_hint or node.anchor or ID_OVERRIDES.get((fkey, node.key)) or slug(ttl)
    pid = claim_id(want)
    p = Placed(num, level, pid, ttl, node=node, blocks=node.blocks, fkey=fkey, key=node.key)
    if backlink and pid in BACKLINKS:
        p.backlink = BACKLINKS[pid]
    XREF[(fkey, node.key)] = (num, pid)
    IDREF[pid] = num
    kids = node.children
    if child_filter is not None:
        kids = [next(k for k in node.children if k.title.startswith(f)) for f in child_filter]
    for i, k in enumerate(kids, 1):
        p.children.append(place_node(k, fkey, f"{num}.{i}", level + 1))
    return p


def build_layout():
    layout = []
    for gi, g in enumerate(GROUPS, 1):
        gnum = str(gi)
        gid = claim_id(g.id)
        IDREF[gid] = gnum
        pg = Placed(gnum, 2, gid, g.title, intro=g)
        if g.merge:
            fkey, sel = g.merge
            node = find(fkey, sel)
            XREF[(fkey, node.key)] = (gnum, gid)
            pg.blocks = node.blocks
            pg.fkey = fkey
            for i, k in enumerate(node.children, 1):
                pg.children.append(place_node(k, fkey, f"{gnum}.{i}", 3))
        elif g.custom == "glossary":
            pass  # built in render_glossary
        else:
            for i, it in enumerate(g.items, 1):
                num = f"{gnum}.{i}"
                if isinstance(it, Place):
                    node = find(it.fkey, it.sel)
                    pg.children.append(place_node(node, it.fkey, num, 3, id_hint=it.id, title=it.title,
                                                  child_filter=it.children, backlink=it.backlink))
                else:
                    sid = claim_id(it.id)
                    IDREF[sid] = num
                    ps = Placed(num, 3, sid, it.title, intro=it.intro)
                    for j, c in enumerate(it.children, 1):
                        node = find(c.fkey, c.sel)
                        ps.children.append(place_node(node, c.fkey, f"{num}.{j}", 4))
                    pg.children.append(ps)
        layout.append(pg)
    return layout


# --------------------------------------------------------------------------
# 4. Inline rendering
# --------------------------------------------------------------------------

MARKER = re.compile(r"^\[([A-Z]+(?: [A-Z]+)*(?: \+ [A-Z]+(?: [A-Z]+)*)*)\]$")


def esc(s):
    return html.escape(s, quote=False)


def ref_link(fkey, key):
    num, pid = XREF[(fkey, key)]
    return f'<a class="xref" href="#{pid}">§{num}</a>'


def resolve_refs(s):
    """Replace {ref:FILE:KEY} and {ref:ID} tokens in hand-written HTML."""
    s = re.sub(r"\{ref:(\w+):([\d.]+)\}", lambda m: ref_link(m.group(1), m.group(2)), s)
    s = re.sub(r"\{ref:([a-z0-9-]+)\}", lambda m: f'<a class="xref" href="#{m.group(1)}">§{IDREF[m.group(1)]}</a>', s)
    return s


def preprocess(text, fkey):
    """Rewrite source-file cross references into markdown links."""
    def to_md(f, k, label=None):
        num, pid = XREF[(f, k)]
        return f"[{label or '§' + num}](#{pid})"

    text = text.replace("+9.66 pp at peak, 3.0σ. **n = 1.**", "+9.66 pp at peak, 3.0σ. **n = 1, unreplicated.**")
    text = text.replace("mechanism in §3.", "mechanism in §4.")  # source cross-reference points at the wrong section
    text = re.sub(r"`04-methods\.md` §(\d+)", lambda m: to_md("04", m.group(1)), text)
    text = text.replace("`04-methods.md`", "[the measurement protocols](#methods)")
    text = text.replace("`07-withdrawn.md`", "[the withdrawn results](#withdrawn)")
    text = re.sub(r"appendix §(\d+(?:\.\d+)?)", r"§\1", text)
    if fkey in ("02", "03"):
        text = re.sub(r"(?<![\w/\[])§(\d+(?:\.\d+)?)", lambda m: to_md("02", m.group(1)), text)
    return text


def inline(text, fkey=None):
    if fkey:
        text = preprocess(text, fkey)
    codes = []

    def stash(m):
        codes.append(m.group(1))
        return f"\x00{len(codes) - 1}\x00"

    t = re.sub(r"`([^`]+)`", stash, text.replace("\n", " "))
    t = esc(t)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", t)
    t = t.replace("\n", " ")

    def restore(m):
        c = codes[int(m.group(1))]
        mm = MARKER.match(c)
        if mm:
            return " ".join(
                f'<span class="mk {part.strip().split()[0].lower()}">{esc(part.strip())}</span>' for part in mm.group(1).split("+")
            )
        return f"<code>{esc(c)}</code>"

    return re.sub(r"\x00(\d+)\x00", restore, t)


def plain(text):
    t = re.sub(r"`\[[^\]]*\]`", "", text)
    t = t.replace("`", "")
    return re.sub(r"\s+", " ", t).strip()


# --------------------------------------------------------------------------
# 5. Block rendering
# --------------------------------------------------------------------------

NUMCELL = re.compile(
    r"^[~≈<>+−\-–±]?\s*\d[\d,.]*\s*(?:%|pp|σ|×|ms)?"
    r"(?:\s*(?:±|/|→|–|-)\s*[~+−\-–]?\d[\d,.]*\s*(?:%|pp|σ|×)?)*"
    r"(?:\s*\(.*\))?$"
)


def cell_kind(raw):
    t = re.sub(r"<[^>]+>", "", raw)
    t = re.sub(r"[`*]", "", t).strip()
    if t in ("—", "-", "matches", ""):
        return "n"
    if NUMCELL.match(t):
        return "n"
    if re.search(r"\d", t) and len(t) <= 24 and sum(c.isdigit() or c in ".,%~+−-–/() " for c in t) * 2 > len(t):
        return "m"
    return ""


def attach_caveats(rows):
    """Keep the caveats attached to the two numbers that must never travel alone."""
    out = []
    for r in rows:
        joined = " ".join(r)
        r = list(r)
        if "+2.27 pp" in joined:
            r = [c + ", inside seed noise" if c.strip() == "0.59σ" else c for c in r]
        if "+9.66 pp" in joined:
            r = [c + ", unreplicated" if re.search(r"n = 1$", c.strip()) else c for c in r]
        out.append(r)
    return out


def render_table(b, fkey):
    b = dict(b, rows=[["matches" if c.strip() == "✓" else c for c in r] for r in attach_caveats(b["rows"])])
    cols = len(b["header"])
    kinds = [[cell_kind(r[c]) for r in b["rows"]] for c in range(cols)]
    colnum = [sum(1 for k in ks if k == "n") * 2 > len(ks) for ks in kinds]
    h = "".join(f'<th scope="col"{" class=\"n\"" if colnum[i] else ""}>{inline(c, fkey)}</th>' for i, c in enumerate(b["header"]))
    rows = []
    for r in b["rows"]:
        tds = []
        for i, c in enumerate(r):
            k = cell_kind(c)
            cls = f' class="{k}"' if k else ""
            tds.append(f"<td{cls}>{inline(c, fkey)}</td>")
        rows.append("<tr>" + "".join(tds) + "</tr>")
    thead = "" if not any(c.strip() for c in b["header"]) else f"<thead><tr>{h}</tr></thead>"
    return f'<div class="tablewrap" tabindex="0"><table class="tbl">{thead}<tbody>{"".join(rows)}</tbody></table></div>'


def render_blocks(blocks, fkey):
    out = []
    for b in blocks:
        t = b["t"]
        if t == "p":
            out.append(f"<p>{inline(b['text'], fkey)}</p>")
        elif t == "quote":
            paras = [p for p in b["text"].split("\n\n")] if "\n\n" in b["text"] else [b["text"]]
            out.append("<blockquote>" + "".join(f"<p>{inline(p, fkey)}</p>" for p in paras) + "</blockquote>")
        elif t == "code":
            out.append(f'<pre><code>{esc(b["text"])}</code></pre>')
        elif t == "table":
            out.append(render_table(b, fkey))
        elif t == "list":
            tag = "ol" if b["ordered"] else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{inline(i, fkey)}</li>" for i in b["items"]) + f"</{tag}>")
        elif t == "hr":
            pass
    return "\n".join(out)


def heading(level, num, pid, title_raw):
    tag = f"h{min(level, 5)}"
    label = f'<span class="num">{num}</span>' if level <= 4 else ""
    return (f'<{tag} id="{pid}">{label}{inline(title_raw)}'
            f'<a class="anchor" href="#{pid}" aria-label="Link to this section">#</a></{tag}>')


def render_placed(p, level=None):
    lvl = p.level
    parts = []
    if lvl == 2:
        parts.append(f'<section class="group" id="{p.id}" aria-labelledby="{p.id}-h">')
        parts.append(
            f'<h2 id="{p.id}-h"><span class="num">{p.num}</span>{esc(p.title)}'
            f'<a class="anchor" href="#{p.id}" aria-label="Link to this section">#</a></h2>'
        )
        if p.id in BACKLINKS:
            parts.append(f'<p class="backlink"><a href="{BACKLINKS[p.id][1]}">{esc(BACKLINKS[p.id][0])}</a></p>')
        g = p.intro
        if g and g.intro_blocks:
            parts.append(render_blocks(g.intro_blocks, None))
        if g and g.intro_html:
            parts.append(resolve_refs(g.intro_html))
    else:
        parts.append(heading(lvl, p.num, p.id, p.title))
        if p.backlink:
            parts.append(f'<p class="backlink"><a href="{p.backlink[1]}">{esc(p.backlink[0])}</a></p>')
        if isinstance(p.intro, str):
            parts.append(resolve_refs(p.intro))
    fkey = p.fkey
    if p.blocks:
        parts.append(render_blocks(p.blocks, fkey))
    if p.node is not None:
        note = NOTES.get((p.fkey, p.key)) or NOTES.get((p.fkey, p.node.title.split(" — ")[0]))
        if note:
            parts.append(f'<div class="note">{resolve_refs(note)}</div>')
    if p.id == "results-tables":
        pass
    for c in p.children:
        parts.append(render_placed(c))
        if c.id == "stl-10-linear-probe-by-milestone":
            parts.append(f'<div class="note">{STL_NOTE}</div>')
    if lvl == 2:
        parts.append("</section>")
    return "\n".join(x for x in parts if x)


# --------------------------------------------------------------------------
# 6. Glossary
# --------------------------------------------------------------------------

GLOSS_ID = {"σ (sigma)": "sigma", "R² (coefficient of determination)": "r2", "n = 1": "n-1"}
GLOSS_TERMS = []  # (term, id)


def render_glossary(gnum):
    parts = []
    node_intro = FILES["08"]["pre"]
    parts.append("<p>Terms used on both pages, defined for a reader outside this subfield. Every term has its own anchor, "
                 "and the main page links to them on first use.</p>")
    toc_children = []
    for gi, grp in enumerate(FILES["08"]["top"], 1):
        sid = claim_id(f"glossary-{slug(grp.title)}")
        num = f"{gnum}.{gi}"
        IDREF[sid] = num
        toc_children.append(Placed(num, 3, sid, grp.title))
        parts.append(f'<h3 class="gloss-sub" id="{sid}"><span class="num">{num}</span>{esc(grp.title)}</h3>')
        dl = ['<dl class="gloss">']
        for b in grp.blocks:
            if b["t"] != "p":
                continue
            lines = b["text"].split("\n")
            m = re.match(r"^\*\*(.+?)\*\*$", lines[0])
            if not m:
                sys.exit(f"glossary entry without bold term: {lines[0]!r}")
            term = m.group(1)
            tid = "term-" + GLOSS_ID.get(term, slug(term))
            tid = claim_id(tid)
            GLOSS_TERMS.append((term, tid))
            defn = inline(" ".join(lines[1:]))
            dl.append(f'<dt id="{tid}"><a href="#{tid}">{esc(term)}<span class="anchor" aria-hidden="true">#</span></a></dt>'
                      f"<dd><p>{defn}</p></dd>")
        dl.append("</dl>")
        parts.append("\n".join(dl))
    return "\n".join(parts), toc_children


# --------------------------------------------------------------------------
# 7. Page assembly
# --------------------------------------------------------------------------

def toc_html(layout, cls_ol=""):
    out = ["<ol>"]
    for g in layout:
        out.append(f'<li><a href="#{g.id}"><span class="tn">{g.num}</span>{esc(plain(g.title))}</a>')
        if g.children:
            out.append("<ol>")
            for c in g.children:
                out.append(f'<li><a href="#{c.id}"><span class="tn">{c.num}</span>{esc(plain(c.title))}</a></li>')
            out.append("</ol>")
        out.append("</li>")
    out.append("</ol>")
    return "\n".join(out)


def confidence_panel():
    node = find("02", "Confidence markers")
    return (
        '<section class="group" id="confidence-markers" aria-labelledby="confidence-markers-h">'
        '<h2 id="confidence-markers-h" style="font-size:1.4rem">Reading guide: confidence markers'
        '<a class="anchor" href="#confidence-markers" aria-label="Link to this section">#</a></h2>'
        "<p>Used throughout this page. Every number is copied from the project's source files. The authoritative numeric source, "
        "<code>stage0g/milestone_canonical.csv</code>, and the other CSV artifacts live on a private cluster. This page names them "
        "in " + "{ref:artifacts}" + " and loads none of them.</p>"
        + render_blocks([b for b in node.blocks if b["t"] == "table"], "02")
        + "</section>"
    )


def main():
    layout = build_layout()
    # glossary needs the group number
    gloss_html, gloss_children = render_glossary(str(len(GROUPS)))
    layout[-1].children = gloss_children

    body = [resolve_refs(confidence_panel())]
    for g in layout:
        if g.id == "glossary":
            body.append(
                f'<section class="group" id="glossary" aria-labelledby="glossary-h">'
                f'<h2 id="glossary-h"><span class="num">{g.num}</span>Glossary'
                f'<a class="anchor" href="#glossary" aria-label="Link to this section">#</a></h2>{gloss_html}</section>'
            )
        else:
            body.append(render_placed(g))

    toc = toc_html(layout)
    page = TEMPLATE.replace("{{TOC}}", toc).replace("{{BODY}}", "\n".join(body))
    page = resolve_refs(page)
    OUT.write_text(page, encoding="utf-8")

    ids = re.findall(r'\sid="([^"]+)"', page)
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        sys.exit(f"duplicate ids: {sorted(dup)}")
    print(f"wrote {OUT.relative_to(ROOT)}  ({len(page):,} bytes, {len(ids)} ids)")
    print("glossary term ids:")
    for term, tid in GLOSS_TERMS:
        print(f"  {tid:48s} {term}")


TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>UARPT technical appendix</title>
<meta name="description" content="Technical appendix to the UARPT / I-JEPA interim results: configuration, protocols and controls, experiment log, complete results, audit chronology, withdrawn results, artifact index and glossary. A project by Aryan Verma.">
<link rel="stylesheet" href="assets/style.css">
<script>document.documentElement.classList.add('js');</script>
</head>
<body>
<a class="skip" href="#top-of-doc">Skip to content</a>
<header class="topbar">
  <div class="topbar-in">
    <a class="brand" href="index.html">UARPT<small>technical appendix</small></a>
    <nav class="navlinks" aria-label="Pages">
      <a href="index.html">Story</a>
      <a href="technical.html" aria-current="page">Appendix</a>
    </nav>
  </div>
</header>

<div class="doc">
  <nav class="toc-side" aria-label="Appendix contents">
    <div class="toc-title">Contents</div>
{{TOC}}
  </nav>

  <main class="doc-main" id="top-of-doc">
    <div class="doc-head">
      <h1>Technical appendix</h1>
      <p class="byline">A project by Aryan Verma</p>
      <p class="lede">Reference material behind the interim results: configuration, measurement protocols and their controls,
      the experiment log, complete results tables, the audit chronology, withdrawn results, artifact paths and a glossary.</p>
      <p class="backlink"><a href="index.html">Back to the story</a></p>
    </div>
{{BODY}}
    <footer class="footer" style="margin-top:4rem;padding-bottom:0">
      <p>A project by Aryan Verma. Interim results, October 2026. <a href="index.html">Story</a></p>
    </footer>
  </main>
</div>
<script src="assets/main.js" defer></script>
</body>
</html>
"""

if __name__ == "__main__":
    main()

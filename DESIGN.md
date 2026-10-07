# DESIGN.md — visual direction

## Intent

This is a research findings page, not a product landing page. It should feel like
something a careful person made: dense where density helps, spacious where it doesn't,
and never decorated for its own sake.

The main page carries the argument visually. The appendix is a reference document and
should look like one.

---

## Palette

Dark throughout. Both pages share it.

```
--bg            #0D1520   page background
--surface       #141F2E   cards, panels
--surface-2     #1B2838   raised / hover
--border        #223247
--text          #E8EEF5   body
--text-dim      #8CA0B8   captions, labels, axis text
--text-faint    #5E738C   footnotes

--accent        #4D9FE8   primary — links, active states, the "vanilla" series
--proven        #2FA37A   green — proven claims, frozen runs, the survivor
--refuted       #D9544A   red — refuted claims, collapsed runs, the leak
--caution       #D99A2B   amber — unreplicated, open, abandoned
```

One colour dominates (the deep navy background), the accent blue carries navigation
and the baseline series, and the three semantic colours are reserved strictly for
status. **Never use proven/refuted/caution decoratively** — if something is green on
this site it means a claim survived measurement.

---

## Typography

System stack, no webfont downloads.

```
--font-body:  ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
--font-mono:  ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
```

| Element | Size | Weight |
|---|---|---|
| Hero title | clamp(2.2rem, 5vw, 3.4rem) | 700 |
| Section heading | 1.9rem | 650 |
| Subsection | 1.25rem | 600 |
| Body | 1.0rem / 1.65 line-height | 400 |
| Caption, axis | 0.82rem | 400 |
| Stat callout | 2.6rem | 700 |

Monospace for: every number in a results table, file paths, config keys, code
references. This is a deliberate signal — if it's monospace, it came from a
measurement or a file.

---

## Layout

- Max content width **760px** for prose. Charts and tables may break out to **1100px**.
- Section vertical rhythm: 5rem between major sections, 2rem within.
- Generous left margin on the appendix for the sticky ToC (240px sidebar, collapses
  under 900px).

---

## Components

**Stat callout** — a large monospace number with a small dim label beneath. Used for
the handful of figures that carry an argument on their own (`+9.66 pp`, `±3.04 pp`,
`−0.01 pp`, `0.9999981`).

**Status chip** — small rounded pill, uppercase, 0.72rem. Values: `PROVEN`,
`NOT PROVEN`, `ABANDONED`, `n = 1`. Coloured per the palette. Appears beside section
headings and ledger entries.

**Evidence card** — a bordered panel holding a claim, the measurement that supports
it, and a deep link into the appendix. Use for each of the four failure modes.

**Callout — correction** — a distinct panel style for the places where the project
corrected itself (the fabricated tables, the seed bug, the withdrawn results). These
should be visible, not buried. Use a left-indent and the caution colour for the label
only.

---

## Avoid

- Accent stripes and colour bars along card edges — reads as template filler.
- Gradients, glows, glassmorphism.
- Icons for their own sake. If an icon doesn't disambiguate something, leave it out.
- Centred body text. Headings may centre; paragraphs never do.
- Scroll-triggered animation beyond a simple fade-in on first view.
- Any chart that needs a legend to be read when a direct label would do.

---

## Charts

- Transparent chart backgrounds; the page background shows through.
- Gridlines `#223247` at 1px, horizontal only.
- Axis text `--text-dim` at 0.78rem.
- Series colours from the semantic palette, never arbitrary: vanilla/baseline is
  `--accent`, anything that failed is `--refuted`, anything that worked is `--proven`,
  anything unreplicated is `--caution`.
- Direct-label series at the line end where space allows; fall back to a legend only
  when three or more series overlap.
- Every chart has a one-line caption beneath it in `--text-dim` stating what it shows
  and which dataset it is from.

---

## Responsive

- Under 900px: appendix ToC collapses to a top dropdown.
- Under 760px: charts go full-bleed with horizontal scroll rather than shrinking text.
- The V5 patch grid must stay square and legible on a phone — cap it at 320px and
  scale the cells.

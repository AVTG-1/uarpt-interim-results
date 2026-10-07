# CLAUDE.md — build brief for this repository

**Project:** UARPT / I-JEPA interim results site
**Author:** Aryan Verma
**Repo:** `uarpt-interim-results`
**Your job:** build a two-page static site from the content in `content/`, deployable on GitHub Pages.

---

## 0. What this site is

A research project ran for several months, produced no working method, and instead
produced four characterised failure modes plus one unreplicated positive lead. This
site explains that honestly, to two different audiences:

| Page | File | Audience | Tone |
|---|---|---|---|
| **Main** | `index.html` | A supervisor, a collaborator, a reviewer skimming before a meeting. No knowledge of the codebase, the cluster, or the file layout. | Narrative. Visual. Every claim readable on its own. |
| **Appendix** | `technical.html` | Someone who will reproduce, audit, or extend the work. | Dense. Exhaustive. File paths, line numbers, CSV references, full tables. |

The main page must build the **whole picture start to end** without the reader
needing the appendix. The appendix exists for anyone who then wants proof.

---

## 1. Hard requirements

1. **Two pages only.** `index.html` and `technical.html`. Cross-linked throughout.
2. **Deployable from the repo root** via GitHub Pages (`main` branch, `/` root). No build
   step, no bundler, no npm install. Everything the browser needs is either inline or
   loaded from a CDN.
3. **JavaScript visualisations on the main page.** See §3. The appendix is text and
   tables only — no charts there.
4. **No data files to fetch at runtime.** Chart data is in `content/06-figure-data.json`;
   inline it into the page as a JS object so the site works from `file://` as well as
   from Pages.
5. **Attribution:** "A project by Aryan Verma." No institution, no lab, no supervisor
   name anywhere.
6. **Responsive.** It will be opened on a laptop in a meeting and possibly on a phone.
7. **Dark theme.** See `DESIGN.md`.

---

## 2. Content sources

Everything you need is in `content/`. Do not invent, round, or restate numbers —
copy them exactly as written. Where a number carries a caveat (n=1, unreplicated,
inside noise), the caveat travels with the number everywhere it appears.

| File | Use |
|---|---|
| `01-story.md` | **Source for `index.html`.** Section order and argument are already decided — follow them. |
| `02-technical.md` | **Source for `technical.html`.** |
| `03-experiment-log.md` | Every run, its config, its result, its validity status. Appendix. |
| `04-methods.md` | Measurement protocols and controls. Appendix. |
| `05-chronology.md` | The nine audit rounds. Appendix. |
| `06-figure-data.json` | Numeric series for the charts. Main page. |
| `07-withdrawn.md` | Claims made during the project and later refuted. Appendix, with a short summary on the main page. |
| `08-glossary.md` | **Required section in the appendix.** Terms defined for a reader outside this subfield. |

---

## 3. Visualisations (main page only)

Build these seven. Use **D3 v7** or **Chart.js v4** from a CDN — your choice, but use
one library consistently. Data for all of them is in `06-figure-data.json`.

Each visual sits inside the narrative at the point its argument is made. None of them
is decorative; each one *is* the evidence for the paragraph it follows.

### V1 — Project arc (top of page)
A horizontal stepped flow: **Hypothesis → 14 runs → Nothing worked → Why nothing worked →
Four mechanisms → One survivor → Decision**. Clickable steps that scroll to the matching
section. This is the reader's map; it should make the shape of the story legible in
three seconds.

### V2 — Experiment matrix
7 arms × 2 datasets as a grid. Each cell coloured by validity status (valid / invalid /
unexplained) with the failure reason on hover. Data: `experiment_matrix` in the JSON.
This is where a reader sees that five of seven arms are struck out.

### V3 — The healthy baseline signature
Dual-series: position readout R² falling (0.989 → 0.889) while token rank rises
(119 → 334), across ep30 / ep66 / ep400. Two y-axes or two stacked panels — whichever
reads more clearly. Include the random-init control point (R² = 0.9999981) as an
annotated marker, because it is what makes the rest interpretable.
Data: `baseline_signature`.

### V4 — The positional shortcut
Grouped bars, vanilla vs rppp, token-level effective rank at ep30 / ep66 / ep300,
with an annotated vertical marker at **epoch 40 — auxiliary activates**. The visual
point: the two are identical before the marker and 20× apart after it.
Data: `positional_shortcut`.

### V5 — The mask leak
An interactive patch grid, 16×16 for CIFAR-10. Three toggleable states:
**vanilla** (context and target disjoint, 0 overlap), **curriculum easy** (39.9% of
targets visible), **curriculum hard** (59.7% visible). Colour context, target, and
overlap distinctly. Show the running counts. This is the single hardest thing in the
project to explain in words and the easiest to show.
Data: `mask_leak`.

### V6 — The freeze test
Line chart, linear probe accuracy vs epoch, three series: **vanilla**, **freeze@200**,
**freeze@150**. Annotate the freeze points. The visual point: the frozen runs go flat
and stay flat while vanilla falls away.
Data: `freeze_test`.

### V7 — Seed variance and the survivor
Two layers in one chart. A shaded band showing the three baseline seeds' spread
(±3.04 pp at peak), and on top of it the `emaconst_high` curve sitting clearly outside
that band. Label it **n = 1, unreplicated** directly on the chart — not in a footnote.
Data: `seed_variance` and `ema_survivor`.

**Interaction floor:** tooltips on every data point, and V5 must be toggleable. Beyond
that, restraint — no scroll-jacking, no autoplay animation, no parallax.

---

## 4. Main page structure

Follow `01-story.md`. Section order is deliberate and argued; do not rearrange.

```
Hero            title, one-line framing, "A project by Aryan Verma"
V1              project arc
1. The goal     what we set out to do, and why small images
2. The setup    7 arms × 2 datasets × 400 epochs            → V2
3. The turn     every upgrade failed, but mechanically
4. The instrument   how we learned to see what was happening → V3
5. Failure 1    positional shortcut                          → V4
6. Failure 2    mask leakage                                 → V5
7. Failure 3    the baseline degrades                        → V6
8. Failure 4    label-free evaluation fails
9. The correction   seed variance, and what it killed
10. The survivor    the EMA result                           → V7
11. The ledger  proven / not proven / abandoned untested
12. Where it stands  two paths, costed
```

**Section 11 is the one your supervisor will read twice.** Three columns, visually
distinct: what was **proven**, what was **not proven**, and what was **abandoned
without proper experimentation**. That third column matters — several directions were
dropped on judgement rather than evidence, and the page must say so plainly.

---

## 5. Appendix page structure

Follow `02-technical.md`. Include, in this order:

1. Codebase and configuration (file paths, line numbers, hyperparameters)
2. Measurement protocols and their controls (`04-methods.md`)
3. Full experiment log (`03-experiment-log.md`)
4. Complete results tables — every arm, every milestone, both datasets
5. Audit chronology (`05-chronology.md`)
6. Withdrawn results and why (`07-withdrawn.md`)
7. Artifact index — CSV paths on the DGX
8. **Glossary** (`08-glossary.md`)

Give it a sticky table of contents; it is long. Anchor IDs must be stable, because the
main page deep-links into specific appendix sections.

---

## 6. Things to get right

- **Numbers are exact.** `68.50`, not `~68.5`. `0.9999981`, not `~1.0`.
- **Caveats are attached, not appended.** Anywhere `+9.66 pp` appears, `n = 1,
  unreplicated` appears with it.
- **Nothing is overstated.** This project's defining feature is that it corrected itself
  nine times. The site should read as careful, not as salvage.
- **No emoji. No exclamation marks.** No "exciting", "groundbreaking", "revolutionary".
- **Every main-page claim that has backing links to the appendix anchor** that holds it.
- **Do not fetch the CSVs.** They are on a private cluster. The appendix *names* them;
  it does not load them.

---

## 7. Deliverables

- `index.html`, `technical.html`, `assets/style.css`, `assets/main.js`, `assets/charts.js`
- Keep `content/` in the repo as the source of truth — do not delete it after building.
- A short note in `README.md` on how to regenerate the pages if the content changes.

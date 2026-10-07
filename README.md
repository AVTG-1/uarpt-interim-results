# uarpt-interim-results

Interim results site for a self-supervised learning project on I-JEPA in the small-image
regime.

**A project by Aryan Verma.**

---

## What this is

Two pages, cross-linked:

- **`index.html`** — the story. What the project set out to do, what went wrong, how each
  failure was proven, what survived, and what it would cost to finish. Readable by
  someone with no knowledge of the codebase or the cluster. Carries seven interactive
  visualisations.
- **`technical.html`** — the appendix. Configurations, file-and-line code references,
  measurement protocols with their controls, full results tables, the audit record,
  withdrawn results, artifact paths, and a glossary.

The main page is self-contained: it builds the whole picture without the appendix. The
appendix exists for anyone who then wants proof.

---

## Status of the findings

Four failure modes are established by measurement with passing controls. One positive
result — a change to the EMA momentum schedule worth +9.66 pp — is **n = 1 and
unreplicated**, and is labelled as such everywhere it appears.

Several claims made during the project were later contradicted by better measurement.
Those are listed in `content/07-withdrawn.md` rather than quietly removed, so that older
documents can be read against them.

The only authoritative numeric source is `stage0g/milestone_canonical.csv` on the
project's compute cluster. **That file and the other CSVs are not published here** — the
appendix names them, it does not load them.

---

## Repository layout

```
CLAUDE.md                     build brief — what to construct and how
DESIGN.md                     palette, typography, components, what to avoid
content/
  01-story.md                 source for index.html
  02-technical.md             source for technical.html
  03-experiment-log.md        every run, config, result, validity status
  04-methods.md               measurement protocols and their controls
  05-chronology.md            the nine audit rounds
  06-figure-data.json         numeric series for the visualisations
  07-withdrawn.md             refuted claims
  08-glossary.md              terms defined for a general reader
```

`content/` is the source of truth and stays in the repo after the pages are built.

---

## Building

The site is static — no build step, no bundler, no dependencies to install. Open
`index.html` directly, or serve the directory:

```bash
python3 -m http.server 8000
```

Chart data is inlined into the page rather than fetched, so the pages work from
`file://` as well as over HTTP.

## Deploying

GitHub Pages, `main` branch, `/` root. Settings → Pages → Source: *Deploy from a branch*.

## Regenerating

Edit the relevant file under `content/`, then rebuild the affected page. Numbers in
`06-figure-data.json` are exact as measured — do not round them, and keep every caveat
(`n = 1`, `unreplicated`, `inside noise`) attached to the number it qualifies.

---

October 2026.

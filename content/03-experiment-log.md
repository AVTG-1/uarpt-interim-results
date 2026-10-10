# Experiment log

Every run, its purpose, its result, its validity status. Appendix section 3.

---

## Part 1 — the original sweep (14 runs)

Seven arms × two datasets, 400 epochs each, auxiliary objectives from epoch 40.
Milestones at ep30 / 66 / 100 / 200 / 300 / 400. All share `_GLOBAL_SEED = 0`.

### Validity status

| Arm | Status | Reason |
|---|---|---|
| `vanilla` | **Valid to ep200** | Healthy trajectory to ep200; degrades thereafter (appendix §7) |
| `rp` | **Valid, unexplained** | Only accuracy gain; dissolves against seed noise (0.59σ) |
| `rppp` | **Invalid as method** | Positional shortcut — but the project's strongest scientific result |
| `multitask` | **Invalid** | Inherits rppp's collapse |
| `uc` | **Invalid** | 40–60% target leakage plus context-ratio confound; 12 eval entries still missing |
| `hc` | **Invalid** | Same, plus the score is a global spatial prior rather than per-image |
| `mtuc` | **Invalid** | Both failure modes; 12 eval entries still missing |

### Final JEPA training loss

| Arm | CIFAR-10 | STL-10 |
|---|---|---|
| vanilla | 0.169 | 0.179 |
| rp | 0.108 | 0.135 |
| rppp | ~0.000 | 0.003 |
| multitask | 0.038 | 0.047 |
| uc | 0.019 | 0.050 |
| hc | 0.021 | 0.050 |
| mtuc | 0.020 | 0.030 |

### CIFAR-10 linear probe, by milestone

| Arm | ep30 | ep66 | ep100 | ep200 | ep300 | ep400 |
|---|---|---|---|---|---|---|
| vanilla | 53.46 | 63.64 | 67.19 | **68.50** | 65.58 | 64.93 |
| rp | 52.34 | 65.91 | 68.66 | 70.27 | 70.71 | **70.77** |
| rppp | 53.48 | 28.81 | 26.24 | 23.60 | 23.42 | corrupt |
| multitask | 52.43 | 61.31 | — | — | — | — |
| hc | 53.13 | 59.49 | — | — | — | 62.02 |
| uc | — | — | — | — | — | — |
| mtuc | — | — | — | — | — | — |

Blank cells are genuinely missing — either the path bug (§2.3) or an eval that was never
collected. They are not interpolated. Canonical source:
`stage0g/milestone_canonical.csv`.

### STL-10 linear probe, by milestone

| Arm | ep30 | ep66 | ep100 | ep200 | ep300 | ep400 |
|---|---|---|---|---|---|---|
| vanilla | 65.67 | 73.88 | 76.74 | **77.14** | 75.41 | 73.70 |
| rp | 66.53 | 73.72 | 76.17 | 78.34 | 79.12 | **79.34** |
| rppp | 65.84 | 28.84 | 30.05 | 28.52 | 29.52 | 29.45 |
| hc | 65.91 | 66.84 | — | — | — | 66.04 |

### Cross-dataset transfer, ep400

**CIFAR-10 encoder → STL-10 images:** vanilla 58.52% LP / 49.11% k-NN; rp 63.00 / 41.31;
multitask 60.80 / 43.08

**STL-10 encoder → CIFAR-10 images:** vanilla 68.54% LP / 53.50% k-NN; rp **78.20** /
56.74; multitask 75.62 / 52.02; rppp 32.81 / 31.87

Two caveats. The protocol is unresolved — the executed sweep resizes to source
resolution, while the planning document recommended bicubic positional-embedding
interpolation, and resizing CIFAR 32→96 for the STL encoder is a large distribution
shift. And these are ep400 numbers, which appendix §7 shows is a degraded endpoint.

---

## Part 2 — diagnostic and repair runs

| Run | Purpose | Result | Status |
|---|---|---|---|
| `van_baseline` | Reproduce vanilla under the new instrumentation | Within 0.70 pp of original at every milestone | Valid |
| `van_baseline` seed 2 | Noise floor | Peak 66.20 (ep350), ep400 66.08, decline −0.12 | Valid |
| `van_baseline` seed 3 | Noise floor | Peak 72.22 (ep200), ep400 68.55, decline −3.67 | Valid |
| `van_wdflat` | Weight decay constant at 0.05 | ep400 66.18 / 67.67 / 66.87 across 3 runs; peaks 68.15 / 69.03 / 68.71 | Inside noise |
| `van_wd_mid` | WD ramp to 0.2 instead of 0.4 | Peak 69.43 | Inside noise |
| `van_lrfloor` | Final LR 1e-5 instead of 1e-6 | Decline 4.25 pp — **worse** than baseline | Negative |
| `van_emacap` | EMA capped at 0.9995 | Decline 4.04 pp. Cap binds only at ep308, 158 epochs after the peak — effectively untested | Void |
| `van_emacap_hard` | EMA capped at 0.999 | Decline 1.58 pp | Inside noise |
| `van_emacap_early` | EMA capped at 0.997 | Peak 69.77, ep400 66.43 | Inside noise |
| **`van_emaconst_high`** | **EMA constant at 0.999 from ep0** | **Peak 78.16, ep400 75.16 — 3.0σ / 4.7σ** | **n = 1** |
| `van_freeze200` | LR → 0 from ep200, EMA running | ep200 70.33 → ep400 70.32 (−0.01 pp) | Valid |
| `van_freeze150` | LR → 0 from ep150 | ep150 69.18 → ep400 69.58 (+0.40 pp) | Valid |
| `rotnet_only` × 3 seeds | Is RP an I-JEPA result? | 61.95 ± 0.56% vs I-JEPA+RP 70.77 | Valid, conclusive |
| `rppp_nopos` | Strip pos_embed before the RPPP head | ep400 LP 28.48 — still collapsed | Failed |
| `hc_fixed` | Curriculum resample constrained to acceptable_regions | Peak 63.14 (ep100), ep400 59.48 | Worse than vanilla |
| `stl10_van_baseline` | STL baseline under new instrumentation | **Invalid** — launched single-GPU, changing effective batch | Discarded |
| `stl10_van_wdflat` | WD flat on STL | Peak 76.04 (ep100), ep400 68.95, decline 7.09 pp vs canonical baseline's 3.44 | Negative transfer |

---

## Part 3 — compute

| | |
|---|---|
| Original sweep | 14 runs, ~300 GPU-hours |
| Diagnostic and repair runs | ~21 runs (17 configs; van_wdflat and rotnet_only are three seeds each), ~144 GPU-hours |
| Audit analysis (no training) | ~20 GPU-hours |
| **Total** | **~464 GPU-hours** |

Timing notes: auxiliary runs ran at ~105 ms/iter against vanilla's ~71 ms (+48%);
multitask and mtuc at 2083 iters/epoch against 1563 (+33%). At ep400 the auxiliary runs
consumed roughly 1.5–2× vanilla's compute. **Any acceleration claim must be plotted
against wall-clock, not epochs.**

---

## Part 4 — standing instrumentation for future runs

1. `assert len(masks_1 ∩ masks_2) == 0` every step, every run. The §5 bug survived 14 runs
   because nothing checked.
2. At every checkpoint: LP, k-NN, pooled rank, token-level position R² and token RankMe
   (via `stage0/position_readout_tokens.py`), mean token norm, held-out JEPA loss,
   encoder weight norm.
3. Denser milestones through ep150–350, where the decline lives. Add ep5/10/20 for any
   acceleration claim.
4. Report best-epoch, not final-epoch. ep400 is an unfair endpoint for every arm.
5. Measured GPU-hours per run.
6. Load-verification before any checkpoint analysis: print the module class, confirm
   `strict=True` load with zero missing and unexpected keys, and check a computed scalar
   against its logged training value.
7. Range-check every statistic against its mathematical bounds before it enters a table.
8. Every number traces to a file path.

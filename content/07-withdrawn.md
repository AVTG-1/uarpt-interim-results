# Withdrawn results

Claims made during the project and later contradicted by measurement. Listed so they are
not revived, and so a reader encountering an older document knows which numbers to
distrust.

A short summary of this section belongs on the main page; the full list belongs here.

---

## 1. "Continuous (Δrow, Δcol) regression fixes the RPPP shortcut"

**Proposed four times across the project.** Refuted by the token-level position probe:
readout is at **R² = 1.0000**. If absolute position is perfectly linearly decodable, then
relative position is a *difference of two linear decodings* — equally trivial. Changing
the loss function does not remove a shortcut that lives in the architecture.

The related claim — that STL-10's smaller 144-position grid made the classes "more
memorisable" — is refuted by RPPP collapsing identically on CIFAR's 256-position grid.

---

## 2. "Curriculum masking produces early acceleration (+8 pp at epoch 30)"

Built on a milestone table that was later found to contain 11 fabricated entries.

Canonical values: CIFAR HC at ep30 is **53.13** against vanilla's 53.46; STL HC at ep30
is **65.91** against vanilla's 65.67. **Parity, not an 8 pp lead.** The
"mask-leak-as-acceleration" narrative is dead.

---

## 3. "CIFAR's 2×2-pixel patches make the prediction task degenerate"

Predicted that CIFAR's within-image target patches would be *more* similar to each other
than STL's — i.e. a more trivial prediction problem. Measured: CIFAR **0.287** against
STL **0.345**. CIFAR is *more* diverse.

Caveat in the other direction: CIFAR has 256 tokens against STL's 144, and finer
granularity lowers cosine similarity somewhat by construction. The direction holds and
the original argument does not survive it.

---

## 4. "The mask leak is hardness-coupled"

Hypothesised that the hard-phase sampler would bias the leak upward, since the hardness
score is a per-patch reconstruction loss accrued only on target patches.

Measured leak matches **uniform** sampling to within 0.1 of a patch in all four
configurations. The hardness weighting has no measurable effect on where the leak lands.
The leak is a plain unconstrained-sampling artifact whose magnitude is fully predicted by
one configuration number, `1 − mask_ratio`.

---

## 5. "Late-training degradation is weight-decay-driven over-regularisation"

Contradicted by two independent measurements:

- Training loss falls **monotonically −19.5%** through the decline window. A model
  regularised into oblivion has a rising or flat loss.
- Effective rank *rises* from ep200 to ep300 rather than collapsing.

The supporting evidence offered for this claim included a context-vs-target encoder
cosine similarity of **1.0082 and 1.0094** — values outside cosine similarity's
mathematical range of [−1, 1], and therefore a bug report rather than a measurement.

---

## 6. Two broken measurement harnesses

**Outputs from both must not be cited.**

### 6a — the per-patch error analysis

Built the predictor from `vit_small` defaults rather than the I-JEPA
`VisionTransformerPredictor` class, and never loaded the checkpoint's predictor weights.
Every result is the signature of an untrained predictor:

| Reported | Consistent with a random predictor |
|---|---|
| Mean error 2.0347 against a logged 0.169 | 12× too large |
| CV = 5.17–5.77% | see below |
| Positional R² = −43 to −34 | no structure in a random map |
| Content R² = −81 to −65 | same |
| Spearman ρ = 0.043 between ep66 and ep400 | two different random initialisations |

The CV figure is the quantitative proof. With a random predictor, per-patch error
≈ `‖target_p‖² / D`. Token norms are ≈20 across D = 384, giving ≈1.0–2.0 per patch —
matching the observed 2.03. And because the encoder's final LayerNorm holds token norms
nearly constant, that quantity varies by only a few percent across patches.
**The reported CV measured LayerNorm's norm consistency, not prediction difficulty.**

The predictor parameter count derived from the same module (21,397,632 — identical to the
encoder) is withdrawn with it. The correct figure is **11,041,920 across 6 blocks**.

Affected artifacts: `stage0d/error_structure.csv`, `stage0d/predictor_capacity.csv`.

### 6b — a rewritten position-readout probe

Returned R² = 0.999999 at every epoch and token RankMe of 32.44 for CIFAR vanilla at
ep400, against the validated script's 0.889 and 334 — a 10× disagreement. **Neither of
its outputs is usable.** Use `stage0/position_readout_tokens.py`.

---

## 7. "I-JEPA requires dual objectives from the start"

Unsupported. The project's own earlier ImageNet experience was that activating auxiliary
objectives from epoch 0 destabilised training, and rppp — identical to vanilla at ep30,
collapsed by ep66 — would have collapsed sooner, not later.

---

## 8. Claims that dissolved against the corrected noise floor

Not errors of measurement, but of inference: each was compared against a seed variance
estimate that was ten times too small.

| Claim | Measured | Against ±3.04 pp | Status |
|---|---|---|---|
| Rotation prediction beats vanilla | +2.27 pp | 0.59σ | dead |
| Moderate EMA caps improve ep400 | +1.4 to +1.5 pp | sits at the baseline mean (66.3–66.5 vs 66.52) | dead |
| Flat weight decay halves the decline | +2.0 pp | inside noise | dead |
| `van_emacap` (0.9995) tests the EMA hypothesis | 4.04 pp decline | cap binds only at ep308, 158 epochs after the peak | void, not tested |

---

## 9. Process note

Across nine audit rounds, **six arithmetically impossible values were reported as
findings**: five negative R² from OLS regressions with an intercept (bounded ≥ 0 on their
own fitting data) and one cosine similarity above 1. In every case the impossible value
was annotated and reasoned past rather than treated as a stop condition.

Every statistic should be range-checked against its mathematical bounds before it enters
a results table. See `04-methods.md` §10.

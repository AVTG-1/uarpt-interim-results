# Main page source — the story

> Build `index.html` from this. Section order is argued; keep it.
> Visual markers `[V1]`–`[V7]` indicate where each chart belongs.
> Deep links to the appendix are written as `→ technical.html#anchor`.

---

## HERO

**UARPT — what the project actually found**

Seven upgrades to I-JEPA. Zero improvements. Four characterised failure modes,
one unreplicated lead, and a measurement that explains all of them.

*A project by Aryan Verma*

`15 training runs · 444 GPU-hours · 9 rounds of audit · CIFAR-10 and STL-10`

[V1 — project arc]

---

## 1. The goal

I-JEPA (Assran et al., CVPR 2023) learns image representations without labels by
predicting the *representation* of hidden image patches from visible ones, rather than
predicting pixels. It works well at scale. On small datasets it is weaker, and the
reasons are not well characterised.

The project's hypothesis was that **borrowing auxiliary objectives from masked image
modelling — rotation prediction, relative patch position prediction — and adding a
difficulty curriculum would improve I-JEPA in the small-image regime.**

Small images were originally a compute constraint. The direction outlasted the
constraint: the work is about Vision Transformers on small datasets as a setting in
its own right, where I-JEPA is known to underperform and where nobody had looked
closely at why.

---

## 2. The setup

Seven configurations, two datasets, 400 epochs each. Fourteen runs, 84 milestone
checkpoints.

| Arm | What it adds |
|---|---|
| `vanilla` | I-JEPA baseline, unmodified |
| `rp` | + rotation prediction |
| `rppp` | + relative patch position prediction |
| `multitask` | + both |
| `uc` | + uncertainty-driven curriculum masking |
| `hc` | + hardness-driven curriculum masking |
| `mtuc` | + both auxiliaries and the uncertainty curriculum |

**CIFAR-10** at 32px with ViT-S/2 → a 16×16 grid of 256 patches.
**STL-10** at 96px with ViT-S/8 → a 12×12 grid of 144 patches.
Both use a 384-dimensional embedding. Auxiliary objectives activate at epoch 40, after
warmup. → `technical.html#configuration`

[V2 — experiment matrix]

---

## 3. The turn

Nothing improved on the baseline. But the failures were not noise — each one had a
mechanism that could be measured, reproduced, and in two cases stated as an exact
quantitative law.

That is what made the project worth continuing, and it is what this page is about.

Five of the seven arms turned out to be **invalid as method comparisons** — not merely
unsuccessful, but measuring something other than what they claimed to measure. One arm
produced a gain that later dissolved. And the baseline itself turned out to have a
problem nobody had been looking for.

---

## 4. The instrument

Before you can say an upgrade broke something, you need a way to see what the encoder
is doing. The project built one, and it is the most reusable thing it produced.

**Two numbers, computable on any checkpoint, with no labels.**

**Position readout R².** Fit a ridge regression from each individual patch token to its
own coordinate on the image grid, training and testing on disjoint sets of images. It
answers: *how much of this representation is still just location?*

**Effective rank (RankMe).** The entropy of the singular-value spectrum of the patch
token matrix. It answers: *how many of the 384 available dimensions is the encoder
actually using?*

**Why this works, and the control that makes it trustworthy.** In a Vision Transformer,
positional embeddings are *added to the patches at the input*. Position is handed to
the network for free. An untrained, randomly initialised ViT scores
**R² = 0.9999981** on this probe — essentially perfect. So the question is never
whether the encoder knows where patches are. It is what training does with that.

That control is load-bearing. Three separate measurement harnesses in this project
produced mathematically impossible values — negative R² from a regression that cannot
go below zero, a cosine similarity above 1 — and the control is what caught them.
→ `technical.html#diagnostic-protocol`

**What healthy training looks like:** position readout falls while effective rank rises,
monotonically and together. On CIFAR-10 the baseline goes from R² 0.989 at epoch 30 to
0.889 at epoch 400, while rank climbs 119 → 334 of 384. STL-10 shows the same shape:
0.974 → 0.806, rank 222 → 334.

The encoder starts by passing position straight through, then spends training
overwriting it with content.

[V3 — healthy baseline signature]

Every failure below inverts one or both halves of that signature — except the third,
which inverts neither, and that is precisely what makes it interesting.

---

## 5. Failure 1 — the positional shortcut

`PROVEN`

**The mechanism.** The relative-patch-position head consumes the encoder's *output*
tokens. Those tokens still carry the positional embedding that was added at the input.
So predicting the offset between two patches is solvable by reading back the encoder's
own position code — a near-linear operation requiring no understanding of image content
whatsoever.

The gradient then rewards the encoder for *preserving and amplifying* position and
suppressing everything else.

**How it was proven.** The auxiliary objective activates at epoch 40, which gives a
before/after contrast inside a single training run — no cross-run comparison needed.

| | ep30 (before) | ep66 (after) | ep300 |
|---|---|---|---|
| vanilla — R² / rank | 0.989 / 119 | 0.981 / 208 | 0.889 / 334 |
| rppp — R² / rank | **0.991 / 117** | 0.9999 / 9.2 | **1.0000 / 5.9** |

At epoch 30 the two runs are statistically indistinguishable. Within 26 epochs of the
auxiliary switching on, position readout is **perfect** and the encoder has collapsed
from 117 usable dimensions to **5.9** — roughly what a two-dimensional sinusoidal
position code occupies. Token norms *rise* over the same window (19.7 → 39.5), so the
encoder is amplifying that low-rank positional subspace, not merely shrinking.

Linear probe accuracy follows exactly: **53.48% → 28.81% → 23.42%**. Both datasets show
the same pattern. → `technical.html#failure-positional`

[V4 — positional shortcut]

**The fix we tried, and why it failed.** Stripping the positional embedding from the
head's input recovers only 2–4 pp. The reason is structural: position is added at the
input and then propagates through twelve layers of attention, so subtracting it at the
output removes the residual copy but not the information. The remaining option — an
adversarial head that actively pushes position *out* of the representation — was not
built.

---

## 6. Failure 2 — mask leakage

`PROVEN`

**The mechanism.** I-JEPA guarantees that the patches the encoder sees (context) and the
patches it must predict (targets) never overlap. That guarantee is the entire task.

The curriculum code re-drew the context mask *after* that guarantee had been
established, using an unconstrained random draw. The guarantee was silently destroyed,
and nothing in the training loop checked.

**How it was measured.** 45,600 per-image samples through the real data pipeline, with
vanilla as a control.

| | context patches | target patches | overlap | % of targets leaked |
|---|---|---|---|---|
| vanilla | 76.7 | 115.0 | **0** | 0% |
| curriculum, easy phase | 102.0 | 115.3 | 46.0 | **39.9%** |
| curriculum, hard phase | 153.0 | 114.9 | 68.6 | **59.7%** |

Vanilla's overlap is exactly zero across all 22,800 control samples. The curriculum
showed the encoder **40–60% of the answers it was being asked to predict.**

[V5 — interactive mask leak grid]

**It follows an exact law.** Under uniform sampling the expected leak is
`num_keep × |targets| / N`. Predicted: 45.94, 68.67, 25.14, 37.98 patches across the four
configurations. Measured: 46.0, 68.6, 25.2, 38.0. Four for four, within a tenth of a
patch. The leak fraction equals the context keep-ratio exactly.

**A second confound in the same direction.** Vanilla gives the encoder 76.7 context
patches. The curriculum gives 102 and 153 — 33% and 99% *more* than vanilla ever sees,
on top of the leak. Both documents describing the project had assumed the curriculum
*reduced* context. It increases it.

**The signature.** Training loss 8× below baseline (0.021 vs 0.169) with a linear probe
2.9 pp *worse*. This is the project's recurring lesson in its clearest form:

> A falling loss is not evidence of learning. It is evidence that the task got easier.

**The fix, and what it showed.** Closing the leak did not rescue the method.
`hc_fixed` peaks at 63.14% against vanilla's 68.50%. The leak was real *and* the
curriculum design was independently wrong. → `technical.html#failure-leak`

---

## 7. Failure 3 — the baseline degrades

`PROVEN`

The most general finding, and the one that is not about our modifications at all.

**Vanilla I-JEPA peaks around epoch 200 and then gets worse.** On CIFAR-10 the linear
probe falls 68.50% → 64.93% between epoch 200 and 400. On STL-10, 77.14% → 73.70%.

**It is in the features, not the measurement.** k-NN accuracy has no fitted
hyperparameters, and it declines alongside the linear probe — −3.53 pp on CIFAR,
−5.27 pp on STL.

**The decisive experiment.** Stop the optimiser at the peak, leave everything else
running, and train 200 more epochs.

| | at the freeze point | at epoch 400 | change |
|---|---|---|---|
| vanilla | 68.50 | 64.93 | **−3.57 pp** |
| freeze @ ep200 | 70.33 | 70.32 | **−0.01 pp** |
| freeze @ ep150 | 69.18 | 69.58 | **+0.40 pp** |

Frozen runs go flat and stay flat. This is a within-run comparison, so run-to-run
variance does not touch it. **The optimiser does the damage.**

[V6 — freeze test]

**Four alternative explanations, each eliminated by its own measurement:**

- *Probe underfitting?* k-NN is hyperparameter-free and declines too.
- *Memorisation?* Held-out JEPA loss falls alongside training loss (0.186 → 0.158) and
  the generalisation gap plateaus at 1.5%.
- *Over-regularisation?* Training loss falls monotonically −19.5% across the decline
  window. A model regularised into oblivion has a *rising* loss.
- *Rank collapse?* Effective rank *rises* from epoch 200 to 300 on both datasets while
  accuracy falls.

What remains: the encoder genuinely keeps getting better at masked latent prediction,
on data it has never seen, while its representations become less useful. The pretext
objective and the downstream task have diverged. → `technical.html#failure-divergence`

---

## 8. Failure 4 — label-free evaluation misses it

`PROVEN`

If a model peaks mid-training and you have no labels, you need an unsupervised signal
to tell you when to stop. Effective rank is the standard candidate — RankMe (Garrido
et al., ICML 2023) proposes exactly this.

Across every checkpoint in the project, **no label-free signal locates the peak.**

| Signal | Peak-detection error |
|---|---|
| mean token norm | 89 epochs |
| training loss | 106 epochs |
| entropy rank | 112 epochs |
| stable rank | 123 epochs |
| RankMe | 125 epochs |
| held-out loss | 167 epochs |

And 53 separate (run, epoch-interval) pairs where effective rank **rose while accuracy
fell**.

The nuance matters: rank correlates *positively* with accuracy across whole training
trajectories (Spearman +0.37). It tracks quality broadly and still cannot find the
peak — which is the one thing checkpoint selection needs it for.

This should be framed as *rank-based selection fails in the post-peak small-data
regime*, not as *RankMe is wrong*. Its claims were made at ImageNet scale on different
method families. → `technical.html#failure-labelfree`

---

## 9. The correction

`CORRECTION`

Partway through, an audit found that `train.py` **hardcoded the global random seed and
never read it from the configuration.** Every historical run — including every run
labelled a "seed replicate" — shared one initialisation and one data order.

What had been reported as seed variance (±0.29 pp) was nondeterminism jitter. Properly
measured, seed variance is **±3.04 pp at peak and ±1.85 pp at epoch 400.** Ten times
larger.

Seeds change the *shape* of training, not just its level:

- seed 0 — peaks at epoch 200, declines 3.57 pp
- seed 2 — rises monotonically to epoch 350, declines **0.12 pp**
- seed 3 — peaks at epoch 200, declines 3.67 pp

One of three seeds shows essentially no decline at all. Failure mode 3 is real in two
of three and **not universal** — the honest figure is −2.45 ± 2.02 pp.

**What the noise floor removed:**

| Claim | Measured | Against noise | Status |
|---|---|---|---|
| Rotation prediction beats vanilla | +2.27 pp | 0.59σ | dead |
| Moderate EMA caps improve ep400 | +1.4 to +1.5 pp | at the baseline mean | dead |
| Flat weight decay halves the decline | +2.0 pp | inside noise | dead |
| Curriculum masking, leak-fixed | −5.4 pp | outside noise | worse than vanilla |
| Positional shortcut fix recovers the head | +2 to +4 pp | still collapsed | failed |

**One control came back clean and positive.** RotNet-only — rotation prediction with no
JEPA loss at all — reaches 61.95 ± 0.56% across three seeds, against I-JEPA+RP's 70.77%.
An 8.82 pp gap at fifteen times the seed standard deviation. **The JEPA objective, not
the rotation task, is doing the work.** → `technical.html#seed-correction`

---

## 10. The survivor

`n = 1 — UNREPLICATED`

One intervention clears the noise floor by a wide margin.

I-JEPA ramps its EMA momentum from 0.996 to 1.0 over training, so the target encoder
tracks the student closely early and freezes completely at the end. Holding momentum
**constant at 0.999 from epoch 0** gives the encoder a stable target throughout.

| | peak | epoch 400 |
|---|---|---|
| vanilla | 68.50 | 64.93 |
| baseline, 3-seed mean | 68.97 ± 3.04 | 66.52 ± 1.85 |
| **EMA 0.999 constant** | **78.16** | **75.16** |

**+9.66 pp at peak — 3.0σ at peak, 4.7σ at epoch 400** against properly measured seed
variance. Every other EMA variant tested clusters at 66.3–66.5% at epoch 400; this one
sits nine points clear of all of them.

[V7 — seed variance band and the survivor]

**This is a single run.** It has not been replicated. It is 3σ against a distribution
that was itself only characterised a few weeks earlier. Three seeds would settle it,
and that is the immediate next step. → `technical.html#ema-result`

---

## 11. The ledger

Three columns. The third one matters as much as the first two.

### Proven

- The diagnostic instrument, with a passing positive control
- The positional shortcut — causal, both datasets, within-run before/after contrast
- Mask leakage — an exact quantitative law over 45,600 measurements
- The optimiser drives the post-peak decline — freeze test, −0.01 pp
- Four alternative explanations for that decline, each eliminated by measurement
- Label-free metrics miss the peak by roughly 100 epochs
- RotNet-only is 8.82 pp below I-JEPA+RP across three seeds
- Per-patch prediction error is heteroscedastic and content-driven, not positional

### Not proven

- Any accuracy improvement from the original UARPT design
- Rotation prediction's advantage — 0.59σ, inside seed noise
- That the late-training decline is universal — one of three seeds is flat
- The EMA result — n = 1, no replication
- That any of this transfers to STL-10 at matched settings — the STL baseline run was
  launched on a single GPU, which changes the effective batch size, and is invalid
- That removing the positional shortcut rescues the auxiliary objective
- Anything at ImageNet scale — entirely untested

### Abandoned without proper experimentation

These were dropped on judgement, not on evidence. Recording them so the distinction
stays visible.

- **The curriculum as originally designed.** The intended method selected *prediction
  targets* by difficulty percentile. What was built selected *encoder context* by soft
  multinomial weighting. The designed version never ran. It was not revived, because the
  difficulty proxy is a target-side quantity being used to make a context-side decision,
  and the literature leans toward easy-first rather than hard-mining.
- **Uncertainty-weighted latent prediction (β-NLL).** The gate for this was measured and
  came back **open** — per-patch error has a coefficient of variation of 0.32–0.52 and a
  positional R² below 0.013, so the signal is heteroscedastic and content-driven, which
  is exactly what such a method needs. The method was never built.
- **The adversarial fix for the positional shortcut.** A gradient-reversal head that
  removes absolute position while the auxiliary recovers relative position. Designed,
  never implemented.
- **Predictor capacity.** The predictor is 384 wide against a 384-wide encoder — no
  width bottleneck, where the reference implementation has a 3.3× one. Never swept.
- **Mask geometry.** Block scales and counts were inherited from the ImageNet recipe,
  tuned for a 14×14 grid at 224px. Never re-tuned for a 16×16 grid of 2×2-pixel patches.
- **Anti-collapse regularisation.** LeJEPA / SIGReg is the current principled answer to
  this family of problems and would be the obvious baseline to compare against. Never
  run.

---

## 12. Where it stands

Two paths, costed separately. They share only their first week.

**A — the diagnostic paper.** *"Failure modes of I-JEPA on small data."* Four mechanisms,
each with a measurement, a signature and an attempted fix. The remaining work is
replication, not discovery: nine runs, roughly 430 GPU-hours, about one week of
experiments and six weeks to a draft. Nothing in it depends on a future result going a
particular way.

**B — the method paper.** *"A stable EMA target improves I-JEPA on small data."*
Conditional on the EMA result replicating at three seeds. Then a momentum dose-response
curve, an STL-10 confirmation against a valid baseline, and ImageNet-100 for the scale
claim. Roughly 35 runs, 4,500 GPU-hours, three months of experiments.

**The decision costs one week.** Three seeds of the EMA configuration — about 130
GPU-hours — tells us which paper exists. Path A's replication runs launch either way,
and if the EMA result holds, path A's material becomes path B's mechanism section.

---

## FOOTER

*A project by Aryan Verma. Interim results, October 2026.
Full configurations, protocols, artifact paths and the complete audit record are in the
[technical appendix](technical.html).*

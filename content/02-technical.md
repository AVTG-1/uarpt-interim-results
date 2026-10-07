# Technical appendix source

> Build `technical.html` from this plus `03`–`08`. No charts on this page.
> Sticky table of contents. Stable anchor IDs — the main page deep-links into them.
>
> Required anchors: `#configuration`, `#diagnostic-protocol`, `#failure-positional`,
> `#failure-leak`, `#failure-divergence`, `#failure-labelfree`, `#seed-correction`,
> `#ema-result`, `#artifacts`, `#glossary`.

---

## Confidence markers

Used throughout. Render as inline chips.

| Marker | Meaning |
|---|---|
| `[MEASURED]` | Instrumented code executed against checkpoints or data; artifact on disk |
| `[CODE]` | Established by reading source, with file and line |
| `[VERIFIED]` | Cross-checked against two independent sources |
| `[DISPUTED]` | Sources disagree; unresolved |
| `[OPEN]` | Identified as necessary, not yet measured |
| `[WITHDRAWN]` | Measured, but the harness was wrong; result retracted |

---

<a id="configuration"></a>
## 1. Codebase and configuration

Codebase: `ua_rpt_general`. A sister codebase `ua_rpt_imagenet/` holds the unmodified
ImageNet original for reference.

### 1.1 Architecture per dataset

| | CIFAR-10 | STL-10 |
|---|---|---|
| Image size | 32 px | 96 px |
| Patch size | 2 px | 8 px |
| Grid | 16 × 16 | 12 × 12 |
| Tokens | 256 | 144 |
| Encoder | ViT-S, embed 384, depth 12 | ViT-S, embed 384, depth 12 |
| Scalars per patch | 12 | 192 |
| Reference I-JEPA for comparison | 224 px / patch 14 → 588 scalars per patch | |

CIFAR-10's patches carry 0.02× the raw information of the reference configuration's;
STL-10's carry 0.33×. `[CODE]`

### 1.2 Predictor

`VisionTransformerPredictor`, **11,041,920 parameters, 6 blocks, embed dim 384**.
That is 0.516× the encoder's parameter count. `[CODE]`

Note the shape: depth is halved relative to the encoder's 12 blocks, but **width is
1:1** (384 vs 384). The reference I-JEPA runs a 384-wide predictor against ViT-H's 1280
— a 3.3× width bottleneck that does not exist here. This was never ablated.

The predictor also **receives positional embeddings for the target locations**. This is
intentional in I-JEPA, and it compounds the mechanism in §3.

### 1.3 Shared hyperparameters

| Parameter | Value |
|---|---|
| Epochs | 400 |
| Effective batch | 512 (see `[DISPUTED]` below) |
| Peak LR | 3e-4, warm from 5e-5 over 40 epochs, final 1e-6 |
| Weight decay | 0.05 → 0.4, cosine, increasing |
| EMA momentum | 0.996 → 1.0 |
| Precision | float16 AMP with GradScaler |
| `auxiliary_start_epoch` | 40 |
| Auxiliary loss weight | 0.1 (the only value ever run; no sweep exists) |
| `warmup_epochs_curriculum` | 10 |
| `enc_mask_scale` | [0.85, 1.0] |
| `pred_mask_scale` | [0.15, 0.2] |
| Aspect ratio | [0.75, 1.5] |
| `num_enc_masks` / `num_pred_masks` | 1 / 4 |
| `min_keep` | 10 patches |
| Hardness EMA momentum | 0.99 |
| Multinomial weight floor | 1e-6 |

Milestones: epochs 30, 66, 100, 200, 300, 400 for the original sweep; later runs added
150, 250, 350.

Cluster: 16 × Tesla V100-SXM3-32GB. 1–3 GPUs per training run.

### 1.4 Key code locations `[CODE]`

| What | Where |
|---|---|
| Curriculum mask override (uncertainty) | `src/train.py:396` |
| Curriculum mask override (hardness) | `src/train.py:410` |
| Hardness tracker | `src/masks/hardness.py:16–62` |
| Hardness sampler | `src/masks/hardness.py:65–129` |
| Uncertainty predictor | `src/models/uncertainty_predictor.py:7–122` |
| RPPP head | `src/models/rppp_head.py:30–39` |
| Positional embedding injection | `src/models/vision_transformer.py:412` |
| CKA centering | `eval/cka_analysis.py:77–78` |
| Curriculum warmup flag | `src/train.py:128` |
| Hardcoded global seed | `src/train.py:56–58` |

### 1.5 Disputed configuration items

**Effective batch.** Three different values were reported across audit rounds: 32;
512 via `grad_accum 16`; and `24 × 21 = 512` for multitask, which is arithmetically 504.
The project's own table states K=8 across 2 GPUs → 512, and `24 × 11 × 2 = 528` for the
multitask configs. All figures to date are YAML-derived; `grad_accum` is almost
certainly computed at runtime as `target_effective_batch / (batch_size × world_size)`
and has never been traced through the code. `[DISPUTED]`

Matters for reproduction and for any future batch-statistic regulariser, which sees only
the per-forward-pass batch (32/GPU), not the effective batch.

**Early stopping.** Reported patience is 400 epochs, which would never fire — yet CIFAR
logs record halts at ep303 (rp), ep332 (multitask), ep357 (rppp), ep303 (mtuc) before
resume. Either patience differs from what was read, or those halts were quota, crash, or
manual events. `[DISPUTED]`

**Resume semantics.** Whether the resume path restores optimiser state, EMA state and
GradScaler state, or only model weights, was never established. A weights-only resume
mid-cosine-schedule would confound every resumed run. `[OPEN]`

---

<a id="data-integrity"></a>
## 2. Data-integrity corrections

Three separate problems were found in the project's own reporting. All are corrected
here; the corrected values are what the main page uses.

### 2.1 The CIFAR-10 final-loss table was wrong in five of seven rows `[VERIFIED]`

Verified against raw `.log` files and against the body of the running-analysis document,
which records each run's completion with checkpoint save timestamps.

| Arm | Summary table claimed | Actual | Error |
|---|---|---|---|
| vanilla | 0.169 | **0.169** | ✓ |
| rp | 0.019 | **0.108** | 5.7× |
| rppp | 0.019 | **~0.000** | collapsed |
| multitask | 0.019 | **0.038** | 2.0× |
| uc | 0.170 | **0.019** | 8.9× |
| hc | 0.168 | **0.021** | 8.0× |
| mtuc | 0.020 | **0.020** | ✓ |

Root cause: transcription failure at summary-writing time, not log truncation — the
correct values appear in multiple places in the body of the same document.

**Corrected cross-dataset picture.** Every method behaves the same way on both datasets,
which dissolves an earlier claim that cross-dataset behaviour was inconsistent:

| Arm | CIFAR-10 | STL-10 |
|---|---|---|
| vanilla | 0.169 | 0.179 |
| rp | 0.108 | 0.135 |
| rppp | ~0.000 | 0.003 |
| multitask | 0.038 | 0.047 |
| uc | 0.019 | 0.050 |
| hc | 0.021 | 0.050 |
| mtuc | 0.020 | 0.030 |

### 2.2 A second table was fabricated mid-audit `[MEASURED]`

A later milestone table contained **11 discrepancies** against the canonical eval JSONs —
5 in the multitask row, 6 in the hardness-curriculum row. Largest: HC at ep30 reported
as 61.68 against an actual 53.13 (8.55 pp); multitask at ep30 reported as 58.42 against
52.43 (5.99 pp). The RPPP row was wrong at every epoch except ep30.

**Consequence:** no number from an intermediate findings document may be cited without
tracing it to `/eval_results/**/*.json`. The canonical source is
`stage0g/milestone_canonical.csv`.

### 2.3 Two arms were never evaluated — a path bug `[CODE]`

Checkpoint stems on disk abbreviate:

```
jepa_cifar10_vits2_unc_curriculum-ep400.pth.tar
jepa_cifar10_vits2_multitask_unc_curriculum-ep400.pth.tar
```

`run_eval_sweep.sh` built paths from the unabbreviated config names, producing
`jepa_cifar10_vits2_uncertainty_curriculum-ep400.pth.tar` — a file that does not exist.
Roughly 28 eval jobs never ran. `hardness_curriculum` is *not* abbreviated on disk, which
is why HC appears in the results tables and UC does not.

Misattributed for three audit rounds as a `collect_results.py` parsing bug. It is a
path-construction bug. Fixed via `run_eval_sweep_FIXED.sh`; as of the last audit round
UC and MT+UC were still missing 12 entries each.

### 2.4 One corrupt checkpoint `[VERIFIED]`

`jepa_cifar10_vits2_rppp-ep400.pth.tar` exists at 147.1 MB but fails to load:
`PytorchStreamReader failed reading zip archive`. 83 of 84 milestone checkpoints load
cleanly. CIFAR RPPP analysis therefore uses ep300 throughout; the ep400 cell is
`NOT EVALUATED`, never interpolated.

---

<a id="diagnostic-protocol"></a>
## 3. The diagnostic protocol

See `04-methods.md` for the full specification. Summary:

**Token-level position readout R².** Extract per-patch encoder output tokens — **not**
globally pooled — for ~2,000 images. Ridge regression from token embedding to that
token's own normalised grid coordinate `(row, col) ∈ [−1, 1]²`. One token = one sample.
**Split by image**, so train and test share no image. Sweep α ∈ {1e-3, 1e-1, 1, 10, 100},
select on validation, report held-out and train R².

**Token-level RankMe.** On the `[n_images × n_patches, 384]` matrix:
`p_k = σ_k / ‖σ‖₁ + ε` with ε = 1e-7, then `RankMe = exp(−Σ p_k log p_k)`.

**Positive control, mandatory.** A randomly initialised ViT of the same architecture:
train R² 0.9999982, **held-out R² 0.9999981**, token RankMe 21.0. This control must pass
before any checkpoint's number is interpretable.

**Pooled features cannot be used for this probe.** If tokens are position-dominated,
`token_i ≈ f(pos_i) + small content`, then global average pooling gives
`mean_i f(pos_i) + small` ≈ the same constant vector for every image, since all images
share the patch grid. Pooled rank collapses to ≈1 whether tokens are constant *or* purely
positional. Only token-level analysis discriminates between the two.

Reference implementation: `stage0/position_readout_tokens.py`. This script is validated;
a later rewrite disagreed with it by 10× and was discarded (see `07-withdrawn.md`).

---

<a id="failure-positional"></a>
## 4. Failure mode 1 — positional shortcut

### 4.1 Mechanism `[CODE]`

The RPPP head (`src/models/rppp_head.py:30–39`) consumes encoder **output** tokens
`emb_a`, `emb_b`. Those tokens carry the positional embedding injected at
`vision_transformer.py:412` via `get_2d_sincos_pos_embed()`. Relative patch position is
therefore solvable by linear self-readout of the encoder's own positional embedding.

Compounding this: the predictor also receives positional embeddings for the target
locations, so against a positionally-dominated encoder, predicting a target
representation is near-trivial. This is the direct mechanism behind rppp's JEPA loss
reaching ~0.000.

### 4.2 Evidence `[MEASURED]`

`auxiliary_start_epoch = 40`, so ep30 is the last pre-activation milestone.

**CIFAR-10**

| Epoch | rppp R² | rppp RankMe | rppp token norm | vanilla R² / RankMe |
|---|---|---|---|---|
| 30 (pre-aux) | 0.991 | 117 | 19.7 | 0.989 / 119 |
| 66 | 0.9999 | 9.2 | 28.7 | 0.981 / 208 |
| 300 | **1.0000** | **5.9** | 39.5 | 0.889 / 334 |

**STL-10**

| Epoch | rppp R² | rppp RankMe | rppp token norm | vanilla R² / RankMe |
|---|---|---|---|---|
| 30 (pre-aux) | 0.975 | 221 | 19.6 | 0.974 / 222 |
| 66 | 0.9991 | 23.5 | 30.1 | 0.954 / 278 |
| 400 | **1.0000** | **17.2** | 37.0 | 0.806 / 334 |

RankMe ≈ 5.9 is consistent with the dimensionality of a 2-D sin-cos positional code.
Token norm rising while rank falls indicates amplification of that low-rank subspace,
not simple shrinkage.

### 4.3 Downstream `[MEASURED]`

Canonical linear probe, from `/eval_results/`:

| Epoch | CIFAR-10 | STL-10 |
|---|---|---|
| 30 (pre-aux) | 53.48 | 65.84 |
| 66 | **28.81** | **28.84** |
| 100 | 26.24 | 30.05 |
| 200 | 23.60 | 28.52 |
| 300 | 23.42 | 29.52 |
| 400 | NOT EVALUATED (corrupt) | 29.45 |

The LP crash between ep30 and ep66 tracks the token-rank collapse over the identical
window. Two independent measurements, same mechanism.

Also: JEPA final loss ~0.000 / 0.003; pooled entropy rank 6.2 / 10.6; μ ratio
`‖μ‖ / mean‖z‖` exactly **1.0000** on both datasets (every pooled feature is essentially
the same vector); cross-dataset STL→CIFAR LP 32.81%.

### 4.4 The attempted fix `[MEASURED]`

`rppp_nopos` — strip the positional embedding before the head. Final LP **28.48%**, a
2–4 pp recovery. Not a fix.

**Why it was incomplete by construction:** subtracting the input positional embedding
from output tokens removes the residual-stream copy but not the positional information
that has propagated non-linearly through twelve layers of attention.

The position readout R² was **not measured on these checkpoints**, which leaves open
whether the shortcut survived or whether something else destroys the representation.
`[OPEN]`

Unresolved: whether `pos_embed` is a registered buffer or an `nn.Parameter` with
`requires_grad=False`. Contradictory answers were given within one audit document.
`[DISPUTED]`

### 4.5 Why continuous regression does not fix this

An early proposal was to replace discrete 144-way position classification with
continuous `(Δrow, Δcol)` regression, on the theory that discrete classes are
memorisable. **Refuted by measurement.** If absolute position is linearly decodable at
R² = 1.0000, relative position is a difference of two linear decodings — equally trivial.
Changing the loss does not remove a shortcut that lives in the architecture.

The related claim that STL-10's smaller 144-position grid made classes more memorisable
is also refuted: RPPP collapsed on CIFAR's 256-position grid too.

### 4.6 Related work

Doersch et al. 2015 (chromatic-aberration shortcut in context prediction); Noroozi &
Favaro 2016 (jigsaw shortcuts). The novelty here is that the shortcut is supplied by the
*architecture's own positional embedding* rather than a data artifact, and is detectable
with a cheap label-free probe.

**The positional angle is crowded — cite carefully.** MoCo v3 (Chen et al. 2021) found
removing positional embeddings from an SSL ViT costs only ~1.6% accuracy, observing the
model "has not made good use of positions." Auto-PE (2025) proposes a single-parameter
norm modulation enabling unlearning of position, for supervised classifiers. Active
Spatial Guidance (2026) omits positional injection from the backbone and adds a
training-only coordinate-regression head — essentially the `rppp_nopos` fix, already
published.

---

<a id="failure-leak"></a>
## 5. Failure mode 2 — mask leakage

### 5.1 Mechanism `[CODE]`

`src/train.py:396` (UC) and `:410` (HC) overwrite `masks_1` **after** `multiblock.py` has
constrained the encoder masks to `acceptable_regions`. The replacement uses
`torch.multinomial` over `[0, N)` with no such constraint, destroying I-JEPA's
context/target non-overlap guarantee.

```python
num_keep = max(1, int(N * (1.0 - mask_ratio)))
```

Nothing in the training loop asserted non-overlap. The bug survived 14 runs and
roughly 300 GPU-hours.

### 5.2 Measurement `[MEASURED]`

`stage0/mask_overlap_measured.csv` — 45,600 per-image measurements, real dataloader, real
checkpoints, no optimiser step.

**Control:** vanilla `n_overlap = 0` across all 22,800 vanilla rows. Sanity constraint
`n_ctx + n_tgt − n_overlap ≤ N` holds everywhere.

**CIFAR-10 (N = 256)**

| Config | n_ctx | n_tgt | n_overlap | frac leaked |
|---|---|---|---|---|
| vanilla | 76.7 (range 41–106) | 115.0 | **0** | 0% |
| curriculum easy (ep100) | 102.0 | 115.3 | 46.0 | **39.9%** |
| curriculum hard (ep300) | 153.0 | 114.9 | 68.6 | **59.7%** |

**STL-10 (N = 144)**

| Config | n_ctx | n_tgt | n_overlap | frac leaked |
|---|---|---|---|---|
| vanilla | 39.2 (range 19–55) | 63.6 | **0** | 0% |
| curriculum easy (ep100) | 57.0 | 63.5 | 25.2 | **39.6%** |
| curriculum hard (ep300) | 86.0 | 63.6 | 38.0 | **59.7%** |

### 5.3 The leak is uniform and exactly predicted

Expected leak under pure uniform sampling is `num_keep × |targets| / N`:

| Config | Predicted | Measured | Δ |
|---|---|---|---|
| CIFAR easy | 45.94 | 46.0 | 0.06 |
| CIFAR hard | 68.67 | 68.6 | 0.07 |
| STL easy | 25.14 | 25.2 | 0.06 |
| STL hard | 37.98 | 38.0 | 0.02 |

The leaked fraction equals `num_keep / N` exactly: 102/256 = 39.8%, 153/256 = 59.8%,
57/144 = 39.6%, 86/144 = 59.7%.

An earlier hypothesis — that the hardness sampler would bias the leak upward, since the
hardness score is a per-patch reconstruction loss accrued only on target patches — is
**refuted**. The hardness weighting has no measurable effect on where the leak lands.
§6 explains why.

### 5.4 The second confound

**Vanilla's realised context is 76.7 patches (CIFAR) and 39.2 (STL)** — substantially
below the naive `enc_mask_scale × N`, because `acceptable_regions` removes target areas
from the context block. The curriculum gives 102 and 153 (CIFAR), 57 and 86 (STL):
**+33% context in the easy phase and +99% in the hard phase**, on top of the leak.

This inverts a documented assumption — both project documents had assumed the curriculum
*reduced* context.

The CIFAR log's own ep201 observation is consistent: context 102 → 153, JEPA loss
0.049 → 0.024 in a single epoch, with the note that *"the hard curriculum's primary effect
on the loss metric is from the mask_ratio change, not the patch difficulty selection."*
That observation was made at the time and not acted on.

### 5.5 A design constraint discovered

On CIFAR-10, targets cover ~115 of 256 patches, leaving 141 available. **The hard phase's
request for 153 context patches is unsatisfiable without overlap.** Any repaired
curriculum must cap `num_keep` at the available count or rescale the ratio.

### 5.6 The repaired run `[MEASURED]`

`hc_fixed` — resample constrained to `acceptable_regions`, overlap asserted zero every
step. Peaks at **63.14%** at ep100 against vanilla's 68.50%, declining to 59.48% at ep400.
Worse than vanilla at every post-warmup epoch.

The JEPA loss trajectory: 0.095 → 0.159 (ep100) → 0.146 (ep150) → 0.120 (ep200) →
0.111 (ep250) → 0.112 (ep400). It returns toward vanilla's 0.169 during the easy phase
and then diverges again.

Conclusion: **the leak was real and the curriculum design was independently wrong.**

---

<a id="curriculum-design"></a>
## 6. The curriculum as implemented versus as designed

### 6.1 What the code does `[CODE]`

`src/masks/hardness.py:16–62`, class `PatchHardnessTracker`:

```python
def update(self, patch_loss):
    batch_mean = loss.mean(dim=0)          # [num_patches]
    self._ema = self.momentum * self._ema + (1.0 - self.momentum) * batch_mean

def get_hardness_scores(self, batch_size, device):
    scores = self._ema.to(device)
    return scores.unsqueeze(0).expand(batch_size, -1)   # identical for every image
```

**Granularity is per-position global.** The EMA is a single `[num_patches]` vector
broadcast across the batch. Every image receives identical hardness scores. HC is a
**fixed spatial prior** — "position P is always hard" — not a per-image difficulty
signal. Momentum 0.99.

Sampler (`hardness.py:65–129`): per-batch min-max normalisation (line 105), temperature
as exponent `weights.pow(1.0/temperature)` (line 116), weight floor
`weights.clamp(min=1e-6)` (line 117, a float16 underflow guard), per-image multinomial
without replacement (line 122).

**UC differs structurally.** `src/models/uncertainty_predictor.py:7–122` is a convolutional
network over the spatial grid: `[B,N,D]` → reshape `[B,D,H,W]` → `D → hidden → hidden/2 → 1`
→ `[B,N]` raw scores. **UC is per-image.** Warmup is 10 epochs
(`src/train.py:128`, `warmup_epochs_curriculum`). Both the UC predictor state and the
hardness EMA are checkpointed and restored.

**The asymmetry is diagnostic.** One signal is a global spatial prior, the other
per-image and learned — yet they produced identical STL final losses (0.050 / 0.050) and
near-identical CIFAR losses (0.019 / 0.021), and §5.3 shows the leak matched uniform
sampling in both. **The scoring signal was never the operative variable in either arm.**
`mask_ratio` and the leak account for the outcomes.

### 6.2 Divergence from the intended design

The intended design was: plain JEPA during warmup; then an easy→hard **target** selection
strategy in 2–3 levels; difficulty proxied by predictor-output variance (UC) or
teacher–student error (HC); selection by **percentile pool** — sample uniformly from e.g.
the top 75% by hardness, shrinking to ~60% then ~50%.

**Four divergences, all confirmed from source:**

1. **Wrong side.** The code selects encoder *context*; the design selects prediction
   *targets*.
2. **No percentile pool.** The code uses a soft multinomial over *all* N patches. Every
   patch remains eligible at every phase; only its probability changes.
3. **Inverted phase semantics.** Because `mask_ratio` applies to the encoder mask, the
   "hard" phase hides *less* and the encoder sees *more*.
4. **Non-overlap discarded** (§5.1).

**The designed curriculum has never run.** A fifth, conceptual issue: both difficulty
proxies are target-side quantities — a patch only accrues prediction error when selected
as a target — so using them to decide what the *encoder* should see asks the metric a
question it was not built to answer.

---

<a id="failure-divergence"></a>
## 7. Failure mode 3 — objective/representation divergence

### 7.1 The phenomenon `[MEASURED]`

From `stage0g/milestone_canonical.csv`, rebuilt directly from `/eval_results/**/*.json`.

**CIFAR-10 vanilla**

| Epoch | LP | k-NN | Rank |
|---|---|---|---|
| 30 | 53.46 | 42.02 | 31.2 |
| 66 | 63.64 | 55.98 | 82.1 |
| 100 | 67.19 | 58.62 | 119.7 |
| **200** | **68.50** | **59.80** | 201.6 |
| 300 | 65.58 | 57.66 | 203.5 |
| 400 | 64.93 | 56.27 | 163.2 |

**STL-10 vanilla**

| Epoch | LP | k-NN | Rank |
|---|---|---|---|
| 30 | 65.67 | 58.13 | 70.9 |
| 66 | 73.88 | 67.68 | 111.2 |
| 100 | 76.74 | 69.81 | 131.7 |
| **200** | **77.14** | **69.69** | 192.6 |
| 300 | 75.41 | 67.83 | 213.9 |
| 400 | 73.70 | 64.42 | 195.1 |

### 7.2 It is in the features, not the probe `[MEASURED]`

k-NN has no fitted hyperparameters and declines alongside LP: CIFAR −3.53 pp,
STL −5.27 pp.

### 7.3 The encoder optimises successfully while degrading `[MEASURED]`

`stage0g/g2_training_loss_trajectory.csv`:

| Epoch | CIFAR train JEPA loss | STL train JEPA loss |
|---|---|---|
| 100 | 0.2060 | 0.2450 |
| 150 | 0.2140 | 0.2340 |
| 200 | 0.2100 | 0.2240 |
| 250 | 0.1970 | 0.2120 |
| 300 | 0.1850 | 0.2000 |
| 350 | 0.1740 | 0.1850 |
| 400 | 0.1690 | 0.1790 |

−19.5% (CIFAR) and −20.1% (STL) across the decline window. This rules out
over-regularisation: a model regularised into oblivion has a rising or flat loss.

### 7.4 Held-out loss rules out memorisation `[MEASURED]`

Measured on `van_baseline`, CIFAR-10, same masking collator and reduction as `train.py`,
fixed mask seed across epochs, held-out test split:

| Epoch | Train | Held-out | Gap |
|---|---|---|---|
| 100 | 0.1811 | 0.1855 | 0.44% |
| 200 | 0.1887 | 0.2009 | 1.22% |
| 300 | 0.1672 | 0.1827 | 1.54% |
| 400 | 0.1429 | 0.1582 | 1.53% |

Both fall monotonically. The gap **widens to ep300 then plateaus** — not "stays
constant," as an intermediate document stated. A 1.5% generalisation gap after 400 epochs
on 50k images is tight.

Note: these absolute values sit ~13% below the logged training values at every epoch. The
most likely cause is that training-time loss is computed on randomly-augmented crops
while this measurement uses deterministic ones. The *gap* is unaffected, since train and
held-out went through the identical code path. `[OPEN]`

### 7.5 Rank collapse is not the mechanism either `[MEASURED]`

Effective rank *rises* from ep200 to ep300 on both datasets (CIFAR 201.6 → 203.5,
STL 192.6 → 213.9) while LP falls 2.92 and 1.73 pp. STL's rank at ep400 (195.1) remains
*above* its ep200 value despite a 3.44 pp LP loss.

This is the first decoupling of the rank diagnostic from downstream performance anywhere
in the project, and it means §3's instrument does not detect this failure mode.

### 7.6 The freeze test `[MEASURED]`

LR set to 0 from the freeze epoch onward, EMA left running, training continued to ep400.

| Epoch | vanilla | freeze @200 | freeze @150 |
|---|---|---|---|
| 30 | 53.46 | 50.55 | 51.17 |
| 66 | 63.64 | 62.47 | 63.03 |
| 100 | 67.19 | 67.34 | 66.87 |
| 150 | 68.40 | 69.69 | 69.18 |
| 200 | 68.50 | 70.33 | 69.41 |
| 300 | 65.58 | 69.99 | 69.69 |
| 400 | 64.93 | 70.32 | 69.58 |

freeze@200: −0.01 pp from its freeze point to ep400. freeze@150: +0.40 pp. vanilla over
the same span: −3.57 pp.

Within-run comparison, so seed variance does not affect the preservation claim. Note that
freeze200's ep150 (69.69) differs from van_baseline's ep150 (68.40) despite identical
pre-freeze training — that 1.29 pp gap is run-to-run variance, and it means cross-run
freeze-vs-baseline comparisons carry noise even though the within-run claim does not.

### 7.7 Timing is dataset-asymmetric `[MEASURED]`

`stage0g/g5_decline_timing.csv`:

| | ep200→300 | ep300→400 | Total | Pattern |
|---|---|---|---|---|
| CIFAR LP | −2.92 | −0.65 | −3.57 | 81.8% front-loaded |
| STL LP | −1.73 | −1.71 | −3.44 | balanced |
| CIFAR k-NN | −2.14 | −1.39 | −3.53 | front-loaded |
| STL k-NN | −1.86 | −3.41 | −5.27 | 64.7% back-loaded |
| CIFAR rank | +2.0 | −40.3 | −38.3 | rises then falls |
| STL rank | +21.3 | −18.7 | +2.6 | net stable |

Most of CIFAR's damage occurs while LR is still ~40× above its floor, which argues
against passive weight shrinkage.

### 7.8 EMA staleness `[MEASURED]`

| Epoch | cosine(context, target) | ‖θ_ctx − θ_tgt‖ / ‖θ_tgt‖ |
|---|---|---|
| 200 | 0.999255 | 0.029 |
| 300 | 0.999764 | 0.015 |
| 400 | 0.999962 | **0.0063** |

The target encoder's distance from the context encoder halves, then halves again. Target
drift rate decays smoothly (0.213 → 0.009) with **no knee** near the LP peak.

An earlier test looked for a sharp coincidence between drift collapse and the LP peak.
That test was mis-designed: the LP decline is itself smooth, so a smooth cause would
produce no knee even if the hypothesis were true. The absence of a knee does **not** rule
out EMA convergence as a contributing mechanism.

---

<a id="failure-labelfree"></a>
## 8. Failure mode 4 — label-free evaluation

### 8.1 Peak-detection error `[MEASURED]`

Mean absolute error, in epochs, between where each label-free metric peaks and where
linear probe accuracy peaks:

| Metric | MAE (epochs) |
|---|---|
| mean token norm | 89.1 |
| training loss | 106.0 |
| entropy rank | 111.6 |
| stable rank | 122.5 |
| RankMe (token) | 125.2 |
| held-out loss | 166.7 |

53 separate (run, epoch-interval) pairs where effective rank rose while LP fell.

Pooled Spearman correlation for stable rank against LP: **+0.363** — positive. Rank
tracks quality broadly across whole trajectories and still cannot locate the peak.

### 8.2 Framing

RankMe (Garrido et al., ICML 2023) proposes effective rank as a label-free predictor of
downstream performance. Its claims were made at ImageNet scale on different method
families. The defensible statement is **"rank-based label-free selection fails in the
post-peak small-data regime,"** not "RankMe is wrong."

---

<a id="evaluation-stack"></a>
## 9. Evaluation stack audit

### 9.1 CKA is correctly implemented `[CODE]`

`eval/cka_analysis.py` lines 77–78 implement `_center()` per column before computing
alignment, matching Kornblith et al. 2019. A concern raised during review arose from a
planning document omitting the centering step in its *written formula*; the code is
correct. Existing CKA matrices stand. `CKA(RP, Vanilla) = 0.096` is valid.

### 9.2 The k-NN protocol is sound `[CODE + MEASURED]`

Cosine on L2-normalised vectors (min-clamp 1e-8), k ∈ {5, 10, 20} default 20,
similarity-weighted via `scatter_add_`. Three independent metric choices agree within
1 pp:

| Config | Cosine-weighted | Cosine-unweighted | Euclidean | LP−kNN gap |
|---|---|---|---|---|
| CIFAR vanilla ep400 | 56.68 | 56.27 | 56.87 | +8.25 pp |
| CIFAR rp ep400 | 55.13 | 55.15 | 55.43 | **+15.64 pp** |
| STL vanilla ep400 | 64.78 | 64.42 | 64.36 | +8.92 pp |
| STL rp ep400 | 57.88 | 58.08 | 58.36 | **+21.46 pp** |

The gap is a property of the features, not the protocol.

**Centered and whitened variants** (`stage0d/knn_centered.csv`):

| Dataset | Arm | Gap (original → centered) | μ ratio `‖μ‖/mean‖z‖` |
|---|---|---|---|
| CIFAR | vanilla | 8.25 → 7.60 | 0.630 |
| CIFAR | rp | 15.64 → 16.09 | 0.698 |
| CIFAR | rppp | −3.64 → −6.01 | **1.0000** |
| STL | vanilla | 9.47 → 8.82 | 0.622 |
| STL | rp | 17.02 → 17.47 | 0.695 |
| STL | rppp | 0.31 → −1.15 | **1.0000** |

Centering closes only ~11% of vanilla's gap. It makes RP's gap slightly *worse*, so RP's
distortion is not a shared-offset phenomenon. The residual gap is consistent with the
DMT-JEPA argument that I-JEPA has comparatively weak *local* semantics. Reference:
VICReg/ResNet-18 reports k-NN *above* LP on CIFAR-10 and near-parity on STL-10.

### 9.3 Random-initialisation floor `[MEASURED]`

`stage0d/random_init_baseline.csv`

| Dataset | LP | k-NN | Rank |
|---|---|---|---|
| CIFAR | 10.00% | 7.63% | 1.33 |
| STL | 13.04% | 7.71% | 2.77 |

At chance. Learned contribution against vanilla's ep200 peak: 58.50 pp (CIFAR),
64.10 pp (STL). Method deltas of 2–6 pp should be read against that span.

---

<a id="seed-correction"></a>
## 10. The seed correction

### 10.1 The bug `[CODE]`

`src/train.py:56–58` hardcodes `_GLOBAL_SEED = 0` and never reads `meta.seed` from the
configuration. Every historical run — including every variant labelled a seed replicate —
trained with identical initialisation and data order.

What had been reported as seed variance (±0.29 pp) was data-loader and DDP-scheduling
nondeterminism.

### 10.2 True variance `[MEASURED]`

Three genuine seeds of `van_baseline`, CIFAR-10:

| Seed | Peak | Peak epoch | ep400 | Decline |
|---|---|---|---|---|
| 0 | 68.50 | 200 | 64.93 | −3.57 |
| 2 | 66.20 | 350 | 66.08 | **−0.12** |
| 3 | 72.22 | 200 | 68.55 | −3.67 |
| **mean ± std** | **68.97 ± 3.04** | | **66.52 ± 1.85** | **−2.45 ± 2.02** |

**Seeds change the shape of training, not just its level.** One of three shows
essentially no decline. Failure mode 3 is real in two of three and not universal.

### 10.3 What it removed

| Claim | Measured | Against noise | Status |
|---|---|---|---|
| RP beats vanilla | +2.27 pp | 0.59σ | dead |
| Moderate EMA caps improve ep400 | +1.4 to +1.5 pp | at baseline mean (66.3–66.5 vs 66.52) | dead |
| Flat weight decay halves the decline | +2.0 pp | inside noise | dead |
| Curriculum masking, leak-fixed | −5.4 pp | outside noise | worse |
| RPPP shortcut fix recovers the head | +2 to +4 pp | still collapsed | failed |
| EMA fixed at 0.999 from ep0 | +9.66 pp | 3.0σ at peak | survives, n = 1 |

### 10.4 The RotNet control `[MEASURED]`

RotNet-only — rotation prediction head, no JEPA loss, same encoder, schedule and budget.
Three seeds: **61.95 ± 0.56%** against I-JEPA+RP's 70.77%. An 8.82 pp gap at 15× the seed
standard deviation.

This retires the objection that "I-JEPA + RP" is RotNet with a JEPA regulariser attached.
The JEPA objective does the work.

### 10.5 A note on the hardcoded seed

Because `_GLOBAL_SEED` was fixed, all 14 original runs shared identical initialisation and
data order. For *controlled comparison between arms* this is a positive — the arms differ
only in the intervention. It is only the variance estimate that was invalid.

---

<a id="ema-result"></a>
## 11. The EMA result

`van_emaconst_high` — EMA momentum held constant at 0.999 from epoch 0, instead of
ramping 0.996 → 1.0.

| Epoch | 30 | 66 | 100 | 150 | 200 | 250 | 300 | 350 | 400 |
|---|---|---|---|---|---|---|---|---|---|
| LP | 58.44 | 67.45 | 73.57 | 77.10 | **78.16** | 77.16 | 76.55 | 75.64 | 75.16 |

Against the three-seed baseline distribution: **3.0σ at peak, 4.7σ at ep400.**

Every other EMA variant tested clusters at 66.3–66.5% at ep400. `van_emacap` (cap 0.9995)
showed a 4.04 pp decline — *worse* than baseline — because the cap only binds at ep308,
158 epochs after the LP peak, so that run was effectively identical to baseline through
the entire onset of the decline. `van_emacap_hard` (cap 0.999, binding earlier) gave a
1.58 pp decline, comparable to the best weight-decay variant.

**Mechanism, hypothesised not proven.** Vanilla's ramp means the target tracks the student
with a ~0.16-epoch lag early — a fast-moving, noisy objective exactly when the encoder is
changing fastest — and freezes completely at the end. A constant 0.999 gives a ~0.64-epoch
lag throughout.

**Status: n = 1, unreplicated.** This is the single most important open item in the
project.

---

<a id="artifacts"></a>
## 12. Artifact index

All paths are on the DGX cluster under the project root. **These files are not published
with this site.**

| Path | Contents |
|---|---|
| `stage0g/milestone_canonical.csv` | **Authoritative** — 59 rows, LP / k-NN / ranks, all arms × milestones × datasets, rebuilt from eval JSONs |
| `stage0g/milestone_discrepancies.csv` | The 11 fabricated table entries |
| `stage0g/g2_training_loss_trajectory.csv` | Per-epoch training JEPA loss, both datasets |
| `stage0g/g5_decline_timing.csv` | Per-interval deltas |
| `stage0/mask_overlap_measured.csv` | 45,600 rows: n_ctx, n_tgt, n_overlap, frac_leaked, sanity_ok |
| `stage0/position_readout_tokens.csv` | Validated position R² / token RankMe / token norm |
| `stage0/position_readout_tokens.py` | **The working probe** — use this one |
| `stage0/c5_knn_protocol.txt`, `c5_knn_variants.csv` | Protocol audit + three-variant results |
| `stage0d/knn_centered.csv` | Centered/whitened k-NN + μ ratio |
| `stage0d/milestone_curves.csv` | LP / k-NN / rank at every milestone |
| `stage0d/random_init_baseline.csv` | Random-init floor |
| `stage0d/patch_size_config_audit.csv` | Patch geometry |
| `stage0d/patch_diversity.csv` | Within-image target similarity |
| `stage0d/D6_DEFINITIONS_FROM_SOURCE.md` | Hardness / UC definitions with file:line |
| `stage0f/*`, `stage1a/*`, `stage1b/*`, `stage2/*` | Later audit rounds |
| `run_eval_sweep_FIXED.sh` | Path-corrected eval sweep (§2.3) |
| `stage0d/error_structure.csv` | **DO NOT USE** — see `07-withdrawn.md` |
| `stage0d/predictor_capacity.csv` | **DO NOT USE** — see `07-withdrawn.md` |
| `stage0g/` position-readout outputs | **DO NOT USE** — see `07-withdrawn.md` |

---

<a id="patch-geometry"></a>
## 13. Patch geometry and task difficulty

`stage0d/patch_diversity.csv`, at ep400:

| | CIFAR-10 | STL-10 |
|---|---|---|
| Mean within-image patch cosine similarity | **0.287** | **0.345** |
| Target effective rank | 273.89 | 279.51 |

A hypothesis that CIFAR's 2×2-pixel patches make the prediction task degenerate was
**refuted in the direction predicted**: CIFAR's within-image targets are *less* similar,
not more. CIFAR presents a genuinely harder prediction problem.

Caveat: CIFAR has 256 tokens against STL's 144, and finer granularity lowers similarity
somewhat by construction. The direction holds and the original argument does not survive
it. Patch size remains a plausible contributor to the CIFAR/STL performance gap via task
difficulty, not via misconfiguration.

---

<a id="open-items"></a>
## 14. Open items

**Measured but not followed up**

- Per-patch JEPA error heteroscedasticity: CV 0.32–0.52, positional R² < 0.013, Sobel
  gradient R² 0.013–0.060, within-image variance dominant. The gate for an
  uncertainty-weighted objective is **open**; the method was never built. Note that the
  difficulty signal is predictable from neither position nor simple texture statistics,
  so an amortised predictor would have to learn something genuinely semantic.

**Never measured**

- Position readout on the `rppp_nopos` checkpoints — decides whether the shortcut
  survived the attempted fix
- Real gradient norms — two attempts failed (activation norms mistaken for gradient
  norms; a zero context-encoder gradient rationalised as by-design). This distinguishes
  scale mismatch, fixable by a λ sweep, from gradient conflict, which needs gradient
  surgery
- Resume semantics (§1.5)
- UC and MT+UC evaluations — 12 entries missing each; two of seven arms have no data
- Mask-sampler fallback rate — the recurring `"Valid mask not found, decreasing
  acceptable-regions"` warnings have never been counted

**Controls that must run before any claim**

| Run | Question |
|---|---|
| `van_emaconst_high` × 3 seeds | Does the EMA result replicate? |
| `rppp_grl` | Does adversarial position removal rescue the auxiliary? |
| `rp_lambda_sweep` λ ∈ {0.01, 0.03, 0.3} | Is RP's rank collapse a weight-tuning artifact? |
| Valid multi-GPU STL-10 baseline | The existing one is single-GPU and invalid |
| `random_mask_matched` | Isolates the hardness signal from the mask-geometry change |

**Three seeds for anything claimed.** Everything prior to the seed correction is n = 1.

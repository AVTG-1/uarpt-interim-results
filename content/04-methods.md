# Measurement protocols

Every protocol used, with its control. Appendix section 2.

The governing rule, learned the hard way across nine audit rounds:

> **A measurement without a passing control is not a measurement.**

Three separate harnesses in this project produced mathematically impossible values and
were caught only by their controls. Those cases are in `07-withdrawn.md`.

---

## 1. Token-level position readout R²

**What it answers.** How much of a representation is still just location?

**Procedure**

1. Forward the full image through the encoder with no masking. Keep per-patch output
   tokens, shape `[B, N_patches, 384]`. **Do not pool.**
2. Build the regression problem: `X` is `[n_images × n_patches, 384]`; `y` is
   `[n_images × n_patches, 2]`, each token's own normalised grid coordinate
   `(row, col) ∈ [−1, 1]²`.
3. **Split by image**, not by token, so train and test share no image.
4. Ridge regression, α swept over {1e-3, 1e-1, 1, 10, 100}, selected on validation.
5. Report **both** train R² and held-out R².

~2,000 images is sufficient.

**Mandatory positive control.** A randomly initialised encoder of the same architecture
must score R² ≈ 0.9999. Measured: train 0.9999982, **held-out 0.9999981**, token RankMe
21.0.

Positional embeddings are added at the ViT's input, so an untrained network already
encodes position almost perfectly. If the control does not pass, the harness is broken
and nothing downstream is interpretable.

**Interpretation rule.** R² from OLS with an intercept, evaluated on its own fitting
data, is bounded at ≥ 0. **A negative held-out R² is a bug report, not a finding.**

**Reference implementation:** `stage0/position_readout_tokens.py`.

---

## 2. Token-level effective rank (RankMe)

**What it answers.** How many of the 384 available dimensions is the encoder using?

On the `[n_images × n_patches, 384]` token matrix, with singular values σ:

```
p_k = σ_k / ‖σ‖₁ + ε          ε = 1e-7
RankMe = exp(−Σ_k p_k log p_k)
```

**Pooled features cannot substitute.** If tokens are position-dominated,
`token_i ≈ f(pos_i) + small content`, then global average pooling gives
`mean_i f(pos_i) + small` — approximately the same constant vector for every image,
since every image shares the patch grid. Pooled rank collapses to ≈1 whether the tokens
are *constant* or *purely positional*. Only token-level analysis distinguishes them.

Corroborated independently: rppp's μ ratio `‖μ‖ / mean‖z‖` is exactly **1.0000** on both
datasets, meaning every pooled feature is essentially the same vector.

---

## 3. Mask overlap audit

**What it answers.** Does the encoder see patches it is being asked to predict?

**Procedure.** Load a real checkpoint, build the real dataloader, run ≤200 iterations
with **no optimiser step**. Per image per step, record:

- `n_ctx` — context patch count after any curriculum override
- `n_tgt` — unique target patches, union across all target blocks, deduplicated
- `n_overlap` — `|context ∩ targets|`
- `frac_leaked` — `n_overlap / n_tgt`

Report distributions (mean, median, p5, p95), not just means.

**Two mandatory sanity checks, reported before any finding:**

1. **Vanilla `n_overlap` must be exactly 0** at every step. If it is not, either the
   harness is wrong or `acceptable_regions` is not doing what the code appears to do —
   either way, stop.
2. `n_ctx + n_tgt − n_overlap ≤ N` for every image.

Both passed: zero overlap across all 22,800 vanilla rows.

**Scale:** 45,600 per-image measurements. Artifact:
`stage0/mask_overlap_measured.csv`.

---

## 4. Held-out JEPA loss

**What it answers.** Is the encoder memorising, or genuinely improving on unseen data?

**Procedure.** Encoder, predictor and target encoder all loaded from the same checkpoint.
Same masking collator, same loss and reduction as `train.py`. Evaluate on the held-out
test split (CIFAR test 10k, STL test 8k). **Fix the mask seed** so draws are identical
across epochs — otherwise the comparison is noise. ≥200 batches.

Also compute the same quantity on a fixed ~10k subset of the *training* set, through the
identical code path, so train and held-out are directly comparable.

**Gate.** The computed training-set value must match the logged training loss for that
epoch within ±20%. If it does not, the harness is wrong — stop and report.

**Known offset.** The measured values sit ~13% below logged values at every epoch. Most
likely cause: training-time loss is computed on randomly-augmented crops while this
measurement uses deterministic ones. The *gap* between train and held-out is unaffected,
since both went through the same path. Unresolved. `[OPEN]`

---

## 5. k-NN protocol

`[CODE]` Cosine similarity on L2-normalised vectors, minimum norm clamped at 1e-8.
k ∈ {5, 10, 20}, default 20. Similarity-weighted vote via `scatter_add_`.

**Validation.** Three independent metric choices — cosine-weighted, cosine-unweighted,
euclidean — agree within 1 pp on every arm tested. The LP−kNN gap is therefore a property
of the features, not an artifact of the protocol.

Additional variants computed: column-centered then L2-normalised, and diagonally
whitened. Centering closes only ~11% of vanilla's gap.

---

## 6. Linear probe

Frozen encoder, features taken as the global average pool over patch tokens (no CLS
token). Trained classifier on top. Reported as top-1 and top-5.

**Known limitation:** the probe hyperparameters are not re-tuned per checkpoint. This was
raised as a possible explanation for the late-training decline and **ruled out** by the
k-NN control, which is hyperparameter-free and declines alongside it.

---

## 7. CKA

`eval/cka_analysis.py` lines 77–78. Linear CKA with per-column centering, matching
Kornblith et al. 2019. Verified correct.

---

## 8. Per-patch error structure

**What it answers.** Is per-patch JEPA prediction error heteroscedastic enough, and free
enough of shortcut structure, for an uncertainty-weighted objective to exploit?

**Procedure.** ≤200 iterations, no optimiser step, per-target-patch loss left unreduced,
same loss and reduction as `train.py`. Hard gate on the ±20% match to logged loss,
reported first.

Then: coefficient of variation, p90/p10, full decile distribution; positional R² by OLS
with intercept (verify R² ∈ [0,1] on fitting data); content R² against pixel variance and
Sobel gradient magnitude; between-image versus within-image variance split; spatial
heatmap; Spearman ρ across epochs using identical images and identical masks.

**Result.** CV 0.32–0.52; positional R² < 0.013; Sobel R² 0.013–0.060; within-image
variance dominant. The error is heteroscedastic and content-driven, not locational — the
gate is **open**.

Note the complication: the difficulty signal is predictable from neither position nor
simple texture statistics, so an amortised predictor would have to learn something
genuinely semantic. Better for novelty, harder to make work.

---

## 9. Load verification

Required before any checkpoint analysis. Added after a harness built the predictor from
the wrong module class and produced an entire round of invalid results.

1. Print the module's class name and path. Confirm it is the expected class.
2. Infer architecture parameters from the checkpoint's state-dict key shapes — ground
   truth, not YAML.
3. `load_state_dict(..., strict=True)` with **zero missing and zero unexpected keys**.
4. Check one computed scalar against its logged training value.

---

## 10. Range checking

Every statistic is checked against its mathematical bounds before it enters a results
table.

| Statistic | Bound |
|---|---|
| R² from OLS with intercept, on its own fitting data | [0, 1] |
| Cosine similarity | [−1, 1] |
| RankMe | [1, D] |
| Fraction leaked | [0, 1] |

Across nine audit rounds, **six out-of-range values were reported as findings** before
this rule was adopted: five negative R² and one cosine above 1. Each was a broken
harness.

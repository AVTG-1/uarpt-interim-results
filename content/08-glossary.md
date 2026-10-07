# Glossary

Terms used on both pages, defined for a reader outside this subfield. Appendix section —
make every term an anchor so the main page and the rest of the appendix can link to it.

---

## Core setting

**Self-supervised learning (SSL)**
Training a model on unlabelled data by inventing a task from the data itself — for
example, hiding part of an image and asking the model to predict what was hidden. The
point is to learn useful general-purpose features without needing labels.

**Pretext task**
The invented task used for training. It is a means, not an end: nobody cares whether the
model predicts hidden patches well, only whether doing so produces useful
representations. **Most of this project's findings come from the pretext task and the
downstream goal pulling apart.**

**Representation**
The vector a trained encoder produces for an input. Good representations put semantically
similar images near each other and make categories linearly separable.

**Vision Transformer (ViT)**
An image model that splits the image into fixed-size square patches, embeds each as a
vector, and processes the sequence with self-attention. `ViT-S/2` means the small variant
with 2×2-pixel patches.

**Patch / token**
A patch is a square region of the image; a token is its vector representation inside the
model. CIFAR-10 at 32px with 2px patches gives a 16×16 grid — 256 tokens.

**Positional embedding**
A vector added to each patch token at the model's input that encodes *where* the patch
sits in the image, since self-attention has no inherent notion of order. In this codebase
it is a fixed sinusoidal pattern. **It is the origin of failure mode 1**: because it is
added at the input, every output token still carries location information the model never
had to learn.

---

## I-JEPA specifically

**I-JEPA (Image-based Joint-Embedding Predictive Architecture)**
An SSL method that predicts the *representation* of hidden image regions from visible
ones, rather than predicting pixels. Avoiding pixel prediction is deliberate: pixel-level
detail is often unpredictable noise, and chasing it wastes capacity.

**Context / target**
The context is the set of patches the encoder is allowed to see. The targets are the
hidden patches whose representations must be predicted. **I-JEPA guarantees these never
overlap** — that guarantee is the task. Breaking it is failure mode 2.

**Context encoder (student)**
The network being trained. It sees only the context patches.

**Target encoder (teacher)**
A slowly-updated copy of the context encoder that sees the whole image and produces the
prediction targets. It is not trained by gradient descent.

**EMA (exponential moving average) momentum**
The rate at which the target encoder copies the context encoder:
`target ← m × target + (1−m) × context`, applied every step. Higher `m` means a
slower-moving, more stable target. `m = 1.0` freezes it entirely. I-JEPA ramps `m` from
0.996 to 1.0 over training; **the project's one surviving positive result comes from
holding it constant at 0.999 instead.**

**Predictor**
A small transformer that takes the context encoder's output plus the target positions and
predicts what the target encoder would produce there.

**Mask ratio / keep ratio**
The fraction of patches hidden from, or shown to, the encoder. In this codebase
`mask_ratio` is applied to the *encoder* mask, which inverts the intuitive meaning —
the "hard" curriculum phase hides *less*.

**Collator**
The data-pipeline component that samples the context and target blocks per image and
enforces non-overlap via `acceptable_regions`.

---

## Auxiliary objectives

**Auxiliary task**
A second training objective added alongside the main one, in the hope that it teaches
something the main objective misses.

**Rotation prediction (RP, RotNet)**
Rotate the image by 0°, 90°, 180° or 270° and have the model predict which. From Gidaris
et al., ICLR 2018.

**Relative patch position prediction (RPPP)**
Given two patches, predict the offset between them. **The source of failure mode 1**: in
a ViT the answer is already sitting in the positional embedding, so the model can solve it
without understanding the image.

**Curriculum masking**
Varying *which* patches are hidden over the course of training, typically easy-to-hard.
The intent was to make the prediction task progressively more demanding.

**Shortcut**
A way to solve a pretext task that bypasses the intended learning. Gradient descent has no
preference for the interesting solution; if a shortcut exists it will be found. Classic
examples: Doersch et al. 2015 found a model solving spatial context prediction using
chromatic aberration at the lens level.

---

## Measurement

**Linear probe (LP)**
Freeze the encoder, train only a linear classifier on top, report accuracy. The standard
measure of how linearly accessible class information is. Can succeed on a geometrically
distorted space as long as the information survives somewhere.

**k-NN accuracy**
For each test image, find its nearest neighbours in feature space and take a vote. No
training, no hyperparameters to fit. Measures whether the *geometry* of the space is
semantically sensible. **Because it has nothing to tune, it is the control that rules out
"the linear probe was just underfitting."**

**LP − k-NN gap**
A large gap means class information is present but the space is geometrically distorted —
linearly separable, poor neighbourhood structure.

**Effective rank**
How many of the available dimensions a representation actually uses. A 384-dimensional
encoder whose outputs lie on a 6-dimensional surface has thrown away 98% of its capacity.

**RankMe**
A specific effective-rank measure: the entropy of the singular-value spectrum,
`exp(−Σ p_k log p_k)` where `p_k = σ_k / ‖σ‖₁`. Scale-invariant and hyperparameter-free.
Proposed by Garrido et al. (ICML 2023) as a label-free predictor of downstream
performance — **a claim this project finds fails in the post-peak small-data regime.**

**Stable rank / entropy rank**
Two other scalar summaries of the same singular-value spectrum. Reported alongside RankMe
because earlier project documents used them.

**Position readout R²**
The project's own diagnostic. Fit a ridge regression from each patch token to its own grid
coordinate. R² near 1 means position is perfectly linearly recoverable; lower means the
encoder has overwritten it with content. **Only meaningful against the random-init control
of 0.9999981** — an untrained ViT already scores essentially perfectly, because position
was handed to it at the input.

**R² (coefficient of determination)**
How much of a target's variance a model explains. 1 is perfect, 0 is no better than
guessing the mean. From ordinary least squares *with an intercept, evaluated on its own
fitting data*, it is bounded at ≥ 0 — **a negative value means the setup is broken, not
that the signal is absent.** This project reported five such values before adopting a
range-check rule.

**CKA (Centered Kernel Alignment)**
A similarity measure between two models' representations. The "centered" is load-bearing
— the matrices must be column-centered first (Kornblith et al., ICML 2019).

**Heteroscedasticity**
When the variance of an error differs across cases — here, when some image patches are
much harder to predict than others. **Coefficient of variation (CV)**, the standard
deviation divided by the mean, quantifies how much spread there is. A method that weights
patches by difficulty needs this spread to exist, which is why it was measured as a gate.

**Aleatoric uncertainty**
Irreducible unpredictability in the data — texture, fine detail, occlusion boundaries —
as opposed to uncertainty the model could reduce by learning more. Chasing it wastes
capacity, which is part of why I-JEPA predicts representations rather than pixels.

---

## Experimental practice

**Seed**
The initialiser for all random number generation in a run — weight initialisation,
data order, mask sampling. Two runs with different seeds and identical configuration give
different results, and that spread is the **noise floor** against which any claimed
improvement must be compared. **This project's seed was hardcoded for its entire
duration**, which made every prior variance estimate invalid.

**σ (sigma)**
A difference expressed in standard deviations of the noise floor. "3.0σ" means the effect
is three times the run-to-run spread. Below about 2σ, an effect is not distinguishable
from chance.

**n = 1**
A result from a single run, with no replication. Used as a caveat throughout this site.

**Control**
A run or measurement whose expected answer is known in advance, used to check that the
apparatus works. Examples here: a randomly-initialised encoder must score R² ≈ 0.9999 on
the position probe; vanilla must show exactly zero mask overlap.

**Ablation**
Removing or changing one component to isolate its contribution.

**pp (percentage points)**
The arithmetic difference between two percentages. 68.50% to 64.93% is a fall of
3.57 **pp** — not 3.57%.

**Milestone / checkpoint**
A saved copy of the model at a specific epoch, used for later evaluation.

**GPU-hours**
One GPU running for one hour. A run on 3 GPUs for 14 hours costs 42 GPU-hours. The
relevant unit for comparing experiment cost, since wall-clock depends on how many GPUs
are free.

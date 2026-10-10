# Audit chronology

Ten rounds of review between the completion of the original sweep and the current
state. Each round is listed with what it settled and what it got wrong.

This section exists because the project's conclusions changed substantially several
times, and a reader needs to know which document supersedes which. **The only
authoritative numeric source is `stage0g/milestone_canonical.csv`**, rebuilt from the
eval JSONs; every intermediate findings document contains at least one error.

---

## Round 0 — initial review

External review of the project documentation and the proposed upgrade plan. Ten
investigation tasks issued, no new training.

**Settled:** CKA implementation verified correct (concern withdrawn). The curriculum
mask override traced to `train.py:396` / `:410`. The RPPP head wiring traced. One corrupt
checkpoint found.

**Incomplete:** the two headline measurements — mask overlap and position readout — were
delivered as code reading only, with no execution.

---

## Round 0b

**Settled:** the eval path bug found and fixed (abbreviated checkpoint stems vs
unabbreviated config names). 83 of 84 checkpoints verified loadable.

**Wrong:** the position probe was run on *pooled* features, which cannot encode the
quantity being regressed, producing R² < 0 at every epoch. The mask overlap was estimated
from YAML arithmetic rather than measured, and the estimate was wrong by 2.5×.

---

## Round 0c

Prescriptive specifications with mandatory controls reported before findings.

**Settled:** both headline measurements executed correctly with controls passing. The
positional shortcut (failure mode 1) and the mask leak (failure mode 2) were established
here.

---

## Round 0d

Direction-setting diagnostics.

**Settled:** the hardness score confirmed as a per-position global spatial prior rather
than a per-image signal. The late-training decline discovered. The patch-size-triviality
hypothesis refuted.

**Wrong:** the error-structure harness built the predictor from `vit_small` defaults
rather than the I-JEPA predictor class, invalidating that measurement and the predictor
capacity figure derived from the same module.

---

## Round 0e

**Settled:** the predictor load gate passed; predictor architecture corrected to
11,041,920 parameters / 6 blocks.

**Wrong:** the milestone table produced in this round contained **11 fabricated
entries** against the canonical eval JSONs.

---

## Round 0f

**Settled:** k-NN confirmed the late-training decline is in the features, not the probe.
The RPPP numbers reconciled against canonical JSONs. An "early acceleration" claim from
the previous round refuted — it had been built on the fabricated table.

**Wrong:** a schedule-based diagnosis of the decline, supported by a cosine similarity of
1.0082 — outside cosine's mathematical range.

---

## Round 0g

**Settled:** the canonical milestone table rebuilt from eval JSONs. RP's best-versus-best
figure verified. The training-loss trajectory obtained, showing loss falling while
accuracy declined. Decline timing mapped and found to be dataset-asymmetric.

**Not done:** the overfitting test was reported as complete but never performed — training
loss was compared against accuracy rather than against held-out loss. The schedule
ablation was specified but not launched.

---

## Round 1a

**Settled:** held-out JEPA loss finally measured. Both train and test loss fall; the absolute
gap widens to ep300 then plateaus near 0.015, while the relative gap grows from 2.4% to
10.7%. **Memorisation ruled out** — the finding is
objective/representation divergence.

**Wrong:** a claim that three schedule-ablation variants had all failed to eliminate the
decline appeared in the recommendations section with no supporting table, no artifacts,
and no corresponding entry in the cost accounting.

---

## Round 1b

**Settled:** the ablation claim substantiated with full curves. Position readout across
the decline window confirmed monotone, so position is not the mechanism. Target drift
confirmed smooth with no knee.

**Found:** `train.py:56–58` hardcodes the global seed and never reads it from config. All
prior "seed replicates" shared one seed. **The reported ±0.29 pp was nondeterminism, not
seed variance.**

---

## Round 2

Closing experimental round. Seed bug fixed; genuine three-seed replication run.

**Settled:**

- True seed variance: **±3.04 pp at peak, ±1.85 pp at ep400** — ten times the previous
  figure. Several prior claims dissolved against it.
- The freeze test: stopping the optimiser at the peak costs 0.01 pp over 200 further
  epochs. **The optimiser drives the decline.**
- RotNet-only across three seeds: 61.95 ± 0.56% against I-JEPA+RP's 70.77%. The JEPA
  objective does the work.
- Label-free metrics miss the LP peak by 89–167 epochs.
- The error-structure gate: CV 0.32–0.52, positional R² < 0.013 — open.
- `van_emaconst_high`: +9.19 pp at peak against the three-seed baseline mean, 3.0σ. **n = 1, unreplicated.**

---

## Recurring failure patterns

Worth recording, because they cost more time than any single experiment.

1. **Argument substituted for measurement.** A required measurement was replaced with
   reasoning from configuration files in five separate rounds. Twice the substituted
   reasoning produced a number that was wrong by more than 2×.
2. **Out-of-range statistics reported as findings.** Six times — five negative R² values
   and one cosine above 1. Each was a broken harness, and in each case the impossible
   value was annotated and reasoned past rather than treated as a stop condition.
3. **Summary tables diverging from their own source data.** Twice: once in the original
   running-analysis document (5 of 7 rows wrong) and once mid-audit (11 entries).
4. **Claims appearing only in summary or implications sections**, with no body section or
   table behind them.
5. **Controls skipped.** The mask-overlap control and the random-init probe control both
   caught real bugs on the rounds where they were run, and both were omitted on earlier
   rounds where bugs went undetected.

**The mitigations that worked:** prescriptive near-pseudocode specification; a mandatory
control per measurement, reported *before* the finding; an explicit rule that a
written-but-unexecuted script reports as `NOT RUN`; a hard stop when a gate fails; load
verification before checkpoint analysis; and range-checking every statistic.

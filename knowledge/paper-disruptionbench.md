---
id: paper-disruptionbench
title: DisruptionBench — multi-tokamak benchmark for ML disruption prediction (co-author)
type: research
summary: Journal of Fusion Energy 2025 paper introducing DisruptionBench, the first standardized multi-tokamak disruption-prediction benchmark; Dhruva co-authored it and is credited with cleaning, characterization, and PCA of the larger dataset.
tags: [benchmark, disruption-prediction, tokamak, fusion, transformer, ccnn, transfer-learning, time-series, co-author]
links:
  repo: https://github.com/MIT-PSFC/DisruptionBench
  paper: https://link.springer.com/article/10.1007/s10894-025-00495-2
---

# DisruptionBench and Complimentary New Models

## TL;DR
*DisruptionBench and Complimentary New Models: Two Advancements in Machine Learning Driven Disruption Prediction* appeared in the **Journal of Fusion Energy** 44:26 (online 24 May 2025, open access, CC BY 4.0). It introduces **DisruptionBench**, which the authors call the first standardized multi-tokamak benchmark for ML disruption prediction (Alcator C-Mod, DIII-D, EAST). Dhruva is **4th of 10 authors** and is credited with the "cleaning, characterization, and PCA of the larger dataset." First author is Lucas Spangher, and the PI is Cristina Rea (MIT PSFC). The paper benchmarks four models:
- a re-implemented random forest (RF)
- a re-implemented Hybrid Deep Learner (HDL)
- a new GPT-2-style transformer
- a new Continuous CNN (CCNN)

The CCNN is the most consistent, with AUC up to 0.97 on C-Mod. DisruptionBench is also the evaluation framework for Dhruva's first-author viewmaker paper.

## Problem & motivation
Without shared multi-device benchmarks, ML disruption predictors are hard to compare. Borrowing the benchmark idea from NLP and computer vision, the paper tests whether models learn *general* plasma dynamics that transfer to a new or data-poor tokamak.

## Architecture
Each task is time-series classification. A model outputs a per-timestep "disruptivity" (the probability that the shot ends in a disruption). DisruptionBench simulates a disruption-mitigation-system (DMS) trigger to turn that into a shot-level outcome:
- **T_high**: going above it increments a counter.
- **T_low**: going below it resets the counter.
- **T_hyst**: the counter value that fires an alarm.
- **T_useful**: the minimum useful lead time.

An alarm on a disruptive shot before T_useful is a true positive. Any alarm on a non-disruptive shot is a false positive.

Tasks combine three choices:
1. **New machine**: C-Mod, DIII-D, or EAST.
2. **Data split**: zero-shot, few-shot (20 or fewer new-machine examples), or many-shot.
3. **Training class composition**: how many disruptive and non-disruptive shots come from each machine.

The test set is a fixed sample of new-machine shots, equal to 15% of the dataset's size. The paper studies six cases with **C-Mod as the new machine**, the hardest target because of its short pulses and fast impurity-driven disruptions. For example, Case 4 is zero-shot and Case 6 uses all data.

## Implementation details
**Data.** Discharge counts are C-Mod 4,510, DIII-D 8,608, and EAST 14,347. Inputs are global state variables:
- βp, ℓi, q95, n=1 mode, n/nG
- lower gap, κ, Ip error / Ip programmed, Vloop
- three machine indicators

Processing:
- clip outliers at the 1st and 99th percentiles (QuantileTransformer)
- forward-fill DIII-D and EAST to 5 ms
- drop discharges under 125 ms
- truncate the final 40 ms
- in zero-shot cases, scale using training-machine statistics only

**Dataset work.** Dhruva's credited contribution is the cleaning, characterization, and PCA of the larger dataset. The paper's future work also describes a larger dataset in preparation: all of Alcator C-Mod operation, 26.5k discharges from 1991–2016, with EFIT re-run on a 5 ms timebase.

**Models.**
- **RF**, after Rea et al. 2018: Bayesian tuning and subsampling for class balance.
- **HDL(2)**, an improved re-implementation of Zhu et al.: new windowing, QuantileTransformer, no label smoothing, and depth-wise convolutions.
- **GPT-2**: pretrained on next-state prediction (MAE, 50k steps), then trained with a curriculum over 0–30 ms data cutoffs.
- **CCNN**: continuous kernels that learn long filters (190 ms to 1,360 ms).

## Infrastructure & deployment
The GPT-2 family was trained on a 48×A100 cluster, with sweeps logged to Weights & Biases. All models' forward inference fits the roughly 5 ms DMS latency budget: RF 0.01 ms, HDL 0.03 ms, CCNN 0.02 ms, and GPT-2 2–3 ms, so each is viable for real-time control. The benchmark code is public at github.com/MIT-PSFC/DisruptionBench.

## Results & performance
These numbers are from the paper's Table 5, with C-Mod as the new machine.

**Mean metrics by model:**

| Model | Mean AUC | Mean F2 |
|---|---|---|
| RF | 0.76 | 0.52 |
| HDL(2) | 0.84 | 0.63 |
| GPT-2 | 0.74 | 0.62 |
| CCNN | 0.81 | 0.75 |

**By case:**
- **Case 2 (C-Mod only):** CCNN reached AUC 0.97 and F2 0.89.
- **Zero-shot (Case 4):** HDL(2) and CCNN both reached AUC 0.83.
- **Few-shot (Case 1):** HDL(2) had the best AUC, 0.85.
- **Case 3 (other machines' disruptions added):** HDL(2) had the best AUC, 0.92. GPT-2 had recall 0.92 and F2 0.84.

**Warning time and memory:**
- Average warning time was 110–350 ms before the end of the discharge for GPT-2, 90–200 ms for CCNN, and 40–60 ms for RF and HDL.
- Shortening GPT-2's data context significantly hurts its recall. Its attention keeps early-discharge information. The authors read this as evidence of plasma "memory."

## Testing & evaluation
Each model is scored on AUC, recall, precision, and F2 under the DMS alarm logic across the six cases. Inference is timed at 0.05, 0.5, and 5 s sequence lengths. The paper emphasizes F2 alongside AUC, since AUC alone can mislead under class imbalance.

## Tech stack
scikit-learn's QuantileTransformer, a Hugging Face transformers GPT-2 implementation, Weights & Biases, and A100 GPUs.

## Design decisions & tradeoffs
- **DMS-style evaluation** instead of plain per-timestep classification, so scores reflect how an alarm would actually fire.
- **Forward-fill instead of linear interpolation**, because interpolation leaks future data (up to 75 ms on EAST).
- **Uniform 5 ms sampling**, which the authors found empirically helped.
- **Few-shot defined as 20 disruptions**, for consistency with prior work.

## Next steps
- Next: evaluate DIII-D and EAST as the new machine, not only C-Mod.
- Next: train models to be robust to missing real-time EFIT features, and bring in profiles, 2D data, and images.
- Next: complete the all-C-Mod dataset (26.5k discharges, 1991–2016, EFIT re-run on a 5 ms timebase).
- Next: explore attention plus continuous-state models such as Autoformer, and run competitions to promote the benchmark.

## Likely questions (Q&A)
- **What is DisruptionBench?** A public, model- and machine-agnostic benchmark for disruption prediction across three tokamaks, with zero-, few-, and many-shot tasks and DMS-style scoring.
- **Which model won?** The CCNN overall (mean AUC 0.81, F2 0.75). HDL(2) and GPT-2 beat it in some transfer cases.
- **What did Dhruva contribute?** Dhruva is a co-author (4th of 10) and is credited with the cleaning, characterization, and PCA of the larger dataset. Dhruva also used DisruptionBench to evaluate the first-author viewmaker augmentation work.
- **Who built the models?** Lucas Spangher built GPT-2 and William Arnold built CCNN. Matteo Bonotto and Tommaso Gallingani built RF and HDL.
- **How does it relate to the viewmaker paper?** Dhruva's first-author viewmaker paper evaluates its augmentations on DisruptionBench tasks (see `paper-viewmakers`).
- **Why C-Mod as the test machine?** It has short pulses and the finest sampling, and about 30% of its disruptions come from fast impurity injection.

## Sources
- L. Spangher, M. Bonotto, W. Arnold, D. Chayapathy, T. Gallingani, A. Spangher, F. Cannarile, D. Bigoni, E. de Marchi, C. Rea. *Journal of Fusion Energy* 44:26 (2025), DOI 10.1007/s10894-025-00495-2: https://link.springer.com/article/10.1007/s10894-025-00495-2. Full open-access PDF.
- Crossref/OpenAlex DOI metadata.

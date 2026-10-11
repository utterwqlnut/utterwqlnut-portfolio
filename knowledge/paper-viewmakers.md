---
id: paper-viewmakers
title: Time Series Viewmakers for Robust Disruption Prediction (first-author paper)
type: research
summary: Dhruva's first-author NeurIPS 2024 workshop paper and Springer chapter: the first time-series viewmaker, lifting tokamak disruption-prediction F2 by 18.1% few-shot and AUC across all models.
tags: [viewmaker, data-augmentation, contrastive-learning, simclr, time-series, disruption-prediction, tokamak, neurips-workshop, fusion]
links:
  repo: https://github.com/utterwqlnut/plasma-data-augmentation
  paper: https://arxiv.org/abs/2410.11065
---

# Time Series Viewmakers for Robust Disruption Prediction

## TL;DR
Dhruva is **first author** of a paper that adapts *viewmaker networks* (Tamkin et al., 2021) from images to multivariate tokamak time series, the first time-series adaptation of the method. A viewmaker is a neural network that learns to generate augmentations. Dhruva's version uses a trend/seasonal decomposition with two LSTM/Transformer-style generators to create realistic but challenging "views" of plasma discharges, which are added to training data for disruption-prediction models. Across three post-hoc models (LSTMFormer, FCN, GPT-2), viewmaker views gave the **highest mean AUC** of every augmentation strategy tested. They improved F2 by **18.1% in the few-shot case** and **7.6% in the many-shot case**, while standard `tsaug` augmentations cut F2 by up to ~20%. The work is published three ways: an arXiv preprint, a **NeurIPS 2024 workshop paper (ML4PS)**, and a **Springer IFIP AICT chapter**.

## Problem & motivation
Disruptions are sudden losses of plasma stability that can damage a tokamak and take it offline for months. Physics-only models struggle to predict them, so ML predictors are used. Those predictors generalize poorly across machines with different designs, sampling rates, and dynamics. Augmentation is a standard way to improve robustness. The paper argues, though, that naive time-series augmentations (jitter, slicing, warping) can produce traces that don't look like plausible plasma behavior. Viewmakers instead *learn* perturbations from the data under a bounded distortion budget. The hypothesis: this yields realistic but challenging views that help models learn machine-agnostic disruptive features.

Novelty claimed by the paper:
1. The first time-series adaptation of the image-based viewmaker, benchmarked against other time-series augmentations.
2. The first rigorous test of generative augmentation on nuclear-fusion datasets.

## Architecture
**What a viewmaker is.** A generator ("viewmaker") and an encoder are trained adversarially, in a GAN-like setup, using a SimCLR contrastive loss. The generator produces two stochastic perturbations (views) of each input. The encoder tries to embed the two views of the same input close together and different inputs apart. The generator is trained to *maximize* that same loss, i.e., to make views harder. Perturbations are projected onto an ℓp ball whose radius is set by a **distortion budget** ε, so views remain recognizable versions of the input.

**Time-series adaptation (paper, Section 3):**
```
X (T x d)
  ├─ X_t = AvgPool(Pad(X))      trend-cycle
  └─ X_s = X - X_t               seasonal
X_t --V_t--> δ_t     X_s --V_s--> δ_s      (noise injected between layers)
δ = constrain(smooth(δ_t + δ_s), ε)     view = X + δ
view --> encoder --> embedding --> SimCLR loss (encoder minimizes, viewmaker maximizes)
```
The decomposition is inspired by Autoformer's series-decomposition block. Generators V_t and V_s replace the original residual blocks with an LSTM-Transformer-style network, chosen to capture long-range temporal dependence. Noise is concatenated between Transformer layers so outputs stay stochastic.

**Hyperparameters reported in the paper:**
- distortion budget ε = 0.1
- adversarial SimCLR loss weight 2.5 and temperature 0.05339
- 10,000 training steps

## Implementation details
The code is public on Dhruva's GitHub at github.com/utterwqlnut/plasma-data-augmentation (linked in the paper's footnote). Key paths:

- **`src/models.py`**
  - `series_decomp`/`moving_avg`: 25-step moving average, adapted from DLinear.
  - `TestViewmaker`, the default used by `main.py`. It has two `VNet`s, one for trend and one for seasonal. Each VNet runs Conv1d (13→64→128) → `TransformerDecoder` whose memory input is random noise → ConvTranspose1d back to 13 channels → Linear to 12. A uniform-noise channel is appended to the input first.
  - `get_delta` rescales the perturbation so its mean absolute value equals the distortion budget.
  - Perturbations on three selected channel indices (5, 8, 11) are zeroed, so those signals pass through unchanged.
  - Padded timesteps (value −100) are restored after the view is created.
  - Alternative generators (`TimeSeriesViewMaker`, `DecompTimeSeriesViewMaker*`) are included for comparison.
- **`src/train.py`**
  - `ViewMakerTrainer` builds two views of each batch. The encoder (`PlasmaViewEncoderTransformer`) takes an AdamW step on the SimCLR loss of *detached* views. The viewmaker then steps on `-weight * loss`.
  - `SimCLR_Loss` is the standard NT-Xent loss with cosine similarity and a positive-pair mask.
  - Exponential LR decay (γ = 0.9).
  - Hyperparameters such as temperature and loss weight are exposed as CLI flags in `arg_parsing.py`.
- **`src/data.py`**
  - `generate_datasets` implements the four cases with C-Mod as the new machine (10% of C-Mod disruptive and non-disruptive shots held out for test). Case 1 trains on the other machines only. Case 2 uses C-Mod non-disruptive shots, 20 C-Mod disruptions, and the other machines. Case 3 uses all data. Case 4 uses C-Mod only.
  - Sequences of 25 steps or fewer, or 2,048 or more, are dropped.
  - A StandardScaler is fit on the training set only, avoiding test leakage.
  - The viewmaker collate function randomly trims 2–12 final steps.
  - A length-bucketing `BatchSampler` reduces padding for efficient batching.
- **`src/post_hoc.py`**
  - Trains an LSTMFormer classifier (BCE loss) with and without views.
  - Disruptive shots are windowed into several end-cutoff prefixes with smoothed labels (0.8–1.0). Non-disruptive shots contribute two random prefixes.
- **`src/setup_datasets.py` / `src/tsaug_datasets.py`** export augmented train/val/test pickles: each original discharge plus `n_reps` synthetic copies per machine. The tsaug baseline chains TimeWarp, Drift, Quantize, Dropout, and AddNoise and is configured with 3 copies.

## Infrastructure & deployment
The paper reports a shared cluster of 48 NVIDIA A100 GPUs, at roughly 3–5 hours per run. In code, training uses Lightning Fabric with mixed precision, and experiments are logged to Weights & Biases. The dataset is the open multi-machine set at Harvard Dataverse (doi:10.7910/DVN/XIOHW1). This is research code built for reproducible experiments.

## Results & performance
All numbers below are from the arXiv v1 / ML4PS version (Table 1 and Table 4). C-Mod is the "new machine" throughout.

- **Mean AUC (none → viewmaker), best of all strategies for every model:**
  - LSTMFormer: 0.691 → 0.692 (+0.14%)
  - FCN: 0.697 → 0.713 (+2.3%)
  - GPT-2: 0.681 → 0.689 (+1.17%)
- **Mean F2:** views gave the best mean F2 for FCN (+0.97%) and GPT-2 (+4.02%), with LSTMFormer about flat (0.576 → 0.573).
- **Few-shot (Case 2):** **18.1%** F2 improvement. GPT-2 F2 went from 0.523 to 0.628, and LSTMFormer from 0.389 to 0.545.
- **Many-shot (Case 3):** average F2 +7.6%. The best result was FCN with AUC 0.853 and F2 0.777.
- **tsaug baseline:** dropped mean F2 for LSTMFormer (−18.23%) and FCN (−19.55%), underscoring the value of learned augmentation.
- **Realism:** over 250 sampled disruptive discharges, average DTW distance to the original was 409.14 for views vs. 770.39 for tsaug, so views stay nearly twice as close to real plasma behavior.
- **LSTMFormer precision rose 5.2%** with views.
- Gains are concentrated in the transfer settings with some target-machine data (few- and many-shot); zero-shot (Case 1) and C-Mod-only (Case 4) results were mixed.

## Testing & evaluation
Evaluation follows **DisruptionBench**: a simulated mitigation-system trigger with high/low thresholds and hysteresis turns per-timestep disruptivity into shot-level TP/FP/TN/FN. Metrics are AUC, F2 (which weights recall over precision, since missed disruptions are costlier), precision, and recall. There are three post-hoc models: LSTMFormer, FCN (Wang et al., 2016), and GPT-2 (Spangher et al., with pretraining and curriculum). Each is trained three ways (no augmentation, tsaug, and viewmaker views) for a controlled comparison across four transfer cases. Realism is measured separately with DTW distance.

## Tech stack
- Python, PyTorch, Lightning Fabric, tsaug, scikit-learn, Weights & Biases

## Design decisions & tradeoffs
- **Trend/seasonal decomposition with separate generators**, so slow and fast dynamics are perturbed independently. The paper calls the choice of generator "critical."
- **Distortion budget ε = 0.1** keeps views realistic and learnable.
- **F2 as the headline metric**, because missed disruptions cost more than false alarms.
- **C-Mod as the test machine**, because its disruptions cluster apart from DIII-D and EAST in UMAP, making it the hardest transfer target.

## Next steps
- Next: run multiple seeds and more tokamaks as the new machine (the paper's compute budget allowed one seed and C-Mod).
- Next: improve precision for FCN (−2.3%) and GPT-2 (−9.4%), which the authors attribute to similarity between disruptive and non-disruptive shots and class imbalance.
- Next: refine viewmaker features and reuse the trained encoder in a new classifier.
- Next: compare against TimeGAN, test more post-hoc models, and add tokamaks to DisruptionBench.

## Likely questions (Q&A)
- **What is a viewmaker?** A generator network trained adversarially against a contrastive encoder. It learns bounded perturbations ("views") of inputs that serve as data augmentations.
- **What's new versus the original viewmaker?** Trend/seasonal decomposition with two generators, LSTM/Transformer generators with injected noise, and the first application to multivariate tokamak time series.
- **What data did it use?** About 30k discharges from Alcator C-Mod, DIII-D, and EAST, with 9 plasma signals plus 3 machine indicators, resampled to 5 ms.
- **What's the key result?** Highest mean AUC for all three models, F2 gains of 18.1% (few-shot) and 7.6% (many-shot), and views nearly twice as close to real discharges (by DTW) as tsaug.
- **How did it compare with standard augmentation?** tsaug cut mean F2 by about 18–20% for LSTMFormer and FCN, while viewmaker views raised mean AUC for all three models.
- **What was Dhruva's role?** First author on all three versions. The code repo is on Dhruva's GitHub.
- **Where was it published?** arXiv (Oct 2024), the NeurIPS 2024 ML4PS workshop, and a chapter in IFIP AICT, *Artificial Intelligence for Sustainability and Global Security* (Springer, 2026, pp. 62–80).

## Sources
Versions and links:
- **arXiv:2410.11065** (v1, 14 Oct 2024), "Time Series Viewmakers for Robust Disruption Prediction." Authors: D. Chayapathy, T. Siebert, L. Spangher, A. K. Moharir, O. M. Patil, C. Rea. https://arxiv.org/abs/2410.11065
- **NeurIPS 2024 ML4PS workshop**, "Towards Commercialization of Tokamaks: Time Series Viewmakers for Robust Disruption Prediction." Same authors and tables as arXiv v1. https://raw.githubusercontent.com/ml4physicalsciences/ml4physicalsciences.github.io/master/2024/files/NeurIPS_ML4PS_2024_141.pdf
- **Springer IFIP AICT chapter**, "Time Series Augmentations with Unsupervised Viewmakers for Robust Disruption Prediction in Nuclear Fusion." Authors: D. Chayapathy, L. Spangher, T. Siebert, O. Patil, E. Zapata-Cornejo, A. K. Moharir, C. Rea. DOI 10.1007/978-3-032-21184-2_6. https://link.springer.com/chapter/10.1007/978-3-032-21184-2_6. Technical content in this doc follows the arXiv/workshop versions.
- Repo files: `src/models.py`, `src/train.py`, `src/data.py`, `src/main.py`, `src/post_hoc.py`, `src/arg_parsing.py`, `src/setup_datasets.py`, `src/tsaug_datasets.py`.

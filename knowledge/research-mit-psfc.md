---
id: research-mit-psfc
title: MIT Plasma Science and Fusion Center — Research Assistant (ML for tokamak disruption prediction)
type: experience
summary: ML research on tokamak disruption prediction at MIT PSFC (Aug 2024 – Dec 2025): first-author NeurIPS workshop paper, 18.1% few-shot F2 gain, 0.881 ROC-AUC, 300M-row Dask analysis.
tags: [fusion, tokamak, disruption-prediction, time-series, pytorch, data-augmentation, contrastive-learning, dask, pca, research]
links:
  repo: https://github.com/utterwqlnut/plasma-data-augmentation
  paper: https://arxiv.org/abs/2410.11065
---

# MIT Plasma Science and Fusion Center: Research Assistant

## TL;DR
From August 2024 to December 2025, Dhruva was a Research Assistant at the MIT Plasma Science and Fusion Center (PSFC), working on machine learning for **plasma disruption prediction** in tokamaks. Disruptions are sudden losses of plasma confinement that can damage a reactor. Dhruva's work spanned three areas:
- **Large-scale data analysis:** cleaning, characterization, and PCA of about **300M rows** of multi-machine tokamak data using Dask.
- **PyTorch time-series classifiers** for disruption prediction, reaching **0.881 ROC-AUC**.
- **Generative data augmentation** with time-series viewmaker networks, which enlarged the training set **over 3x** and improved F2 by **18.1% in the few-shot case**.

Dhruva is **first author** of the viewmaker paper (arXiv 2410.11065, NeurIPS 2024 ML4PS workshop, and a Springer IFIP chapter) and a **co-author of DisruptionBench** (Journal of Fusion Energy, 2025). The advising PI on both papers is Cristina Rea (MIT PSFC).

## Problem & motivation
ML disruption predictors already run on some tokamaks, but they often fail to generalize from one machine to another. Every device differs in size, sampling rate, discharge length, and how instabilities develop. Disruptive examples are also scarce: roughly 10% of discharges end in disruptions (viewmaker paper; DisruptionBench). A newly commissioned machine has even less data. Dhruva's work asked whether learned, data-driven augmentations could improve robustness and transfer, especially in low-data ("few-shot") settings, the setting a newly built reactor would face.

## Architecture
The research pipeline, assembled from the papers and the `plasma-data-augmentation` repo:

```
Multi-machine discharge data (C-Mod, DIII-D, EAST; ~30k discharges)
        |  clean / resample to 5 ms / truncate final 40 ms
        v
Per-discharge multivariate time series (12-13 global plasma signals)
        |
        +--> Viewmaker training (generator vs. contrastive encoder, SimCLR loss)
        |          |
        |          v
        |    Synthetic "views" of each training discharge
        v
Post-hoc disruption classifiers (LSTMFormer, FCN, GPT-2)
        trained with: no augmentation | tsaug | viewmaker views
        v
DisruptionBench-style evaluation (AUC, F2, precision, recall), C-Mod as "new machine"
```

## Implementation details
**Datasets and signals.** The work uses the open multi-machine dataset derived from Zhu et al. 2020 (Harvard Dataverse doi:10.7910/DVN/XIOHW1). Per Table 3 of the viewmaker paper, it covers Alcator C-Mod (about 4,000 discharges, 0.52 s average length), DIII-D (about 8,000, 3.7 s), and EAST (about 11,000, 5.3 s); DisruptionBench reports its counts as 4,510, 8,608, and 14,347. The features are global (0D) plasma state variables:
- poloidal beta βp
- internal inductance ℓi
- q95
- n=1 mode amplitude
- Greenwald fraction n/nG
- lower gap
- elongation κ
- Ip error / Ip programmed
- loop voltage
- three binary machine-indicator columns

Discharges shorter than 125 ms are dropped. Data are discretized to 5 ms with forward-fill, and the last 40 ms are truncated, which is the time a mitigation system needs to fire.

**Data analysis / PCA.** Dhruva performed exploration, cleaning, characterization, and PCA on about 300M rows using Dask. DisruptionBench's author-contributions statement credits Dhruva with having "performed cleaning, characterization, and PCA of the larger dataset." That paper's future-work section also describes a larger dataset in preparation: all of Alcator C-Mod operation, 26.5k discharges from 1991–2016, re-run through EFIT on a 5 ms timebase.

**Models (repo `src/models.py`).**
- `LSTMFormer`: an LSTM (12→128) that provides "time-conscious" positional information, then LayerNorm, a 4-layer Transformer encoder (2 heads, FF 512), and a mean-pooled sigmoid head.
- `PlasmaLSTM`, plus a Transformer view-encoder used for contrastive training.
- Several viewmaker generators. The default is `TestViewmaker`, which splits each series into trend (25-step moving average) and seasonal parts. It perturbs each part with a Conv1d → TransformerDecoder → ConvTranspose1d network fed with a random-noise channel. The perturbation is rescaled to a distortion budget and added back to the input.

**Augmentation pipeline.** `src/setup_datasets.py` exports train/val/test pickles in which each training discharge is accompanied by `n_reps` viewmaker-generated copies, configurable per machine. `src/tsaug_datasets.py` does the same with a hand-crafted `tsaug` pipeline (time warp, drift, quantize, dropout, noise) for the baseline, configured with 3 copies per discharge, in line with the over-3x dataset enlargement.

**Related repo: `torax-2-cmod`** (Oct 2025). Dhruva also built a dataset-generation pipeline that connects real experiments to physics simulation. It pulls Alcator C-Mod shots with `disruption-py`, fits Gaussian profiles to Thomson-scattering Te/ne data, writes EFIT equilibria to EQDSK files, and builds per-shot configs for the **TORAX** transport simulator (`torax==1.0.3`, JAX-based, QLKNN transport model). It then runs the simulations and saves simulated quantities alongside measured signals to CSV. Simulated quantities include βN, βp, Greenwald fraction, li, q95, loop voltage, Ip, and peaking factors.

## Infrastructure & deployment
- Training uses Lightning `Fabric`: 16-bit mixed precision on CUDA and bf16 on CPU. Experiments are logged to Weights & Biases, with an offline fallback and later sync (`src/utils.py`).
- According to the viewmaker paper, experiments ran on a shared cluster of 48 NVIDIA A100 GPUs at roughly 3–5 hours per run.
- The dataset is the open Harvard Dataverse set; `data/data.txt` names the expected file.

## Results & performance
- **0.881 ROC-AUC** for PyTorch time-series disruption prediction.
- **18.1% F2 improvement in the few-shot case** (Case 2, C-Mod as new machine) from training with viewmaker views, i.e. in low-data regimes (viewmaker paper).
- **Dataset enlarged over 3x** with synthetic data.
- **~300M rows** explored, cleaned, and analyzed with Dask and PCA.
- Viewmaker views gave the highest mean AUC for all three post-hoc models: +0.14% for LSTMFormer, +2.3% for FCN, +1.17% for GPT-2 (viewmaker paper).
- Many-shot (Case 3): +7.6% average F2 (viewmaker paper).
- Views stayed much closer to the originals than tsaug augmentations: average DTW distance 409.14 vs. 770.39 over 250 sampled disruptive discharges (viewmaker paper).
- Publications: first-author viewmaker paper (arXiv, NeurIPS 2024 ML4PS, Springer IFIP AICT chapter) and co-authorship on DisruptionBench (J. Fusion Energy 44:26, 2025).

## Testing & evaluation
Models were evaluated on DisruptionBench-style tasks with Alcator C-Mod as the held-out "new machine": zero-shot, few-shot (20 C-Mod disruptions), many-shot, and C-Mod-only. Metrics were AUC, F2 (which weights recall above precision, since missed disruptions are costlier), precision, and recall. Each post-hoc model (LSTMFormer, FCN, GPT-2) was trained three ways (no augmentation, tsaug, viewmaker views) for a controlled comparison. In-repo validation (`src/eval.py`) logs accuracy, F1, and AUC during training, and `src/lime.py` adds LIME interpretability experiments.

## Tech stack
- Python, PyTorch, Lightning Fabric
- Dask (large-scale analysis and PCA)
- scikit-learn (scalers, metrics), tsaug, fastdtw, LIME experiments (`src/lime.py`)
- Weights & Biases, matplotlib
- JAX / TORAX, disruption-py, MDSplus, eqtools (`torax-2-cmod`)

## Design decisions & tradeoffs
- **Learned vs. hand-crafted augmentation.** The paper argues that jitter, warp, and slicing can create physically implausible plasma traces. Adversarially learned views are constrained by a distortion budget instead, and the DTW results confirm they stay closer to real discharges.
- **Trend/seasonal decomposition** (borrowed from Autoformer/DLinear) lets separate generators perturb slow and fast dynamics.
- **C-Mod as the test machine** because its disruptions cluster apart from DIII-D and EAST in UMAP, making it the hardest transfer target (viewmaker paper, Fig. 3).
- **Machine balancing** (`balance_machines`) downsamples DIII-D and EAST to C-Mod's count during viewmaker training.

## Next steps
- Next: extend to multiple seeds and additional tokamaks as "new machines" (the paper's runs used one seed and C-Mod, given compute limits).
- Next: tune views to lift precision for FCN and GPT-2 alongside the recall-driven F2 gains.
- Next: compare against TimeGAN and reuse the trained contrastive encoder inside a classifier.
- Next: scale experiments to the larger all-C-Mod dataset (26.5k discharges) described in DisruptionBench's future work.

## Likely questions (Q&A)
- **What did Dhruva do at MIT PSFC?** ML research on tokamak disruption prediction: data cleaning, characterization, and PCA on ~300M rows with Dask; PyTorch time-series models reaching 0.881 ROC-AUC; and generative augmentation with viewmaker networks that enlarged the dataset over 3x.
- **Which tokamaks?** Alcator C-Mod (MIT), DIII-D (General Atomics), and EAST (Chinese Academy of Sciences).
- **What's a disruption?** A sudden loss of plasma stability and confinement that can damage the machine and take it offline. Predictors have to warn early enough for mitigation, at least 40 ms in these papers.
- **What was the headline augmentation result?** In the few-shot case, training with viewmaker views improved F2 by 18.1%, plus +7.6% average F2 in the many-shot case and the highest mean AUC for all three models.
- **What ROC-AUC did Dhruva reach?** 0.881 for PyTorch time-series disruption prediction.
- **Did Dhruva use Dask?** Yes, for exploration, cleaning, and PCA on about 300M rows. DisruptionBench credits Dhruva with "cleaning, characterization, and PCA of the larger dataset."
- **Which papers came out of this?** The first-author viewmaker paper (arXiv 2410.11065 / NeurIPS 2024 ML4PS / IFIP AICT chapter) and co-authorship on DisruptionBench (J. Fusion Energy 44:26, 2025). See `paper-viewmakers` and `paper-disruptionbench`.
- **Is the code public?** Yes: github.com/utterwqlnut/plasma-data-augmentation (linked from the paper) and github.com/utterwqlnut/torax-2-cmod.

## Sources
- Dhruva's résumé (role, dates, 300M rows/Dask/PCA, 0.881 ROC-AUC, >3x, 18.1% F2).
- Repo `utterwqlnut/plasma-data-augmentation`: `src/models.py`, `src/train.py`, `src/data.py`, `src/main.py`, `src/post_hoc.py`, `src/setup_datasets.py`, `src/tsaug_datasets.py`, `src/eval.py`, `src/utils.py`, `src/arg_parsing.py`, `src/lime.py`, `data/data.txt`.
- Repo `utterwqlnut/torax-2-cmod`: `datasets/*.py`, `environment.yml`.
- arXiv 2410.11065 (HTML v1) and the NeurIPS 2024 ML4PS PDF (#141).
- DisruptionBench, J. Fusion Energy 44:26 (2025), open-access PDF (author contributions, future work).
- Crossref metadata for the IFIP chapter, DOI 10.1007/978-3-032-21184-2_6.

---
id: research-fung-group
title: Georgia Tech Fung Group — Research Assistant (GNNs and LLMs for materials)
type: experience
summary: Materials-ML research in Victor Fung's Georgia Tech group: 50% GNN memory cut, 11.5% accuracy gain from crystal-graph feature engineering, and an ICLR AI4Mat LLM crystal-generation paper.
tags: [materials-science, graph-neural-networks, pytorch-geometric, crystal-graphs, llm, fine-tuning, matdeeplearn, slices, mace, research]
links:
  repo: https://github.com/Fung-Lab/MatDeepLearn_dev
  paper: https://openreview.net/forum?id=w1JsxPYWLL
---

# Georgia Tech Fung Group: Research Assistant

## TL;DR
Dhruva was a Research Assistant in Victor Fung's computational materials group at Georgia Tech from Aug 2024 to Dec 2025, working in Python, PyTorch, PyTorch Geometric and HuggingFace. Key results:
- **Optimized MatDeepLearn GNN pipelines, cutting memory use by 50%** with negligible performance loss.
- **Improved GNN predictive performance by 11.5%** through feature engineering of crystal graph embeddings.
- **LLM4StructGen:** benchmarked 2 LLMs, 4 text representations and 2 preprocessing configurations for LLM-based crystal generation.

Dhruva's concrete code contributions include MatDeepLearn PR #68, "Infinite Potential Edges", which adds PotNet-style Coulomb, London-dispersion and Pauli lattice-sum edge features to crystal graphs, and LLM4StructGen commits that add MACE-based relaxation and randomized-SLICES augmentation. Dhruva is also a co-author of the related **ICLR 2025 AI4Mat workshop paper** (see `paper-crystal-text-representations`), contributed while still a high-school student.

## Problem & motivation
Two problems are involved. Both are about predicting or generating crystalline materials without running expensive simulations.
- **Property prediction (MatDeepLearn).** A crystal is turned into a graph: atoms become nodes and nearby atom pairs become edges. A GNN then predicts properties such as formation energy. How the graph and its edge features are built affects both accuracy and memory use, and Dhruva improved both.
- **Structure generation (LLM4StructGen).** LLMs can be fine-tuned to generate new crystals written out as text. The open question is which text format works best.

## Architecture
**MatDeepLearn** is the Fung Lab's shared GNN framework for materials property prediction (1,800+ commits across the lab). Dhruva contributed to it through PR #68 from their fork. How the framework works:
```
config.yml ─► main.py (Runner) ─► processor.py: structures → PyG Data graphs
                                   ├─ calculate_edges_master (mdl | ocp)
                                   ├─ generate_node_features (one-hot)
                                   └─ generate_edge_features (Gaussian smearing)
           ─► trainers/property_trainer.py ─► models/ (CGCNN, MPNN, SchNet,
              TorchMD-ET, TensorNet, CrystalGraph …) ─► metrics / checkpoints
```
- **Graph construction** (`matdeeplearn/preprocessor/processor.py::get_data_list`). Each structure becomes a `torch_geometric.data.Data` object holding positions, cell, atomic numbers and targets. Edges come from `helpers.py::calculate_edges_master`. The `mdl` method uses a periodic cutoff-distance matrix; the `ocp` method uses `radius_graph_pbc` with all neighbors. The default config uses `cutoff_radius: 8.0`, `n_neighbors: 250`, one-hot node features (`node_dim: 100`) and Gaussian-smeared distance edge features (`edge_dim: 50`).
- **Models.** Models are registered via `@registry.register_model` in `matdeeplearn/models/`. The example config uses CGCNN, built on PyG `CGConv`.
- **Training.** `PropertyTrainer` handles training, with AdamW, ReduceLROnPlateau, L1 loss and optional AMP autocast.
- **Memory-related settings in the framework.** The config exposes `use_amp`, on-the-fly `otf_edge_index`/`otf_edge_attr`/`otf_node_attr`, `preprocess_*` flags and `dataset_device`.

## Implementation details
**MatDeepLearn PR #68, "Infinite Potential Edges"** (branch `potnet_updated` from Dhruva's fork; opened 2024-02-10; +929/−44). Dhruva implemented infinite-potential edges from PotNet (arXiv 2306.10045), giving crystal graphs physics-informed long-range interaction features:
- Adds a new `edge_calc_method: inf` to `calculate_edges_master`. It builds a fully connected `inf_edge_index` over every atom pair in the unit cell.
- Adds `calculate_inf_potentials`, which computes periodic lattice sums for three potentials: Coulomb, London dispersion and Pauli. Coulomb and London dispersion use Epstein-zeta evaluations; Pauli uses an exponential sum. The three results are combined as a weighted sum with coefficients `[-0.801, -0.074, 0.145]` and stored as `inf_edge_attr`.
- Adds `generate_edge_features_inf`. It concatenates a Gaussian expansion of the normal edge distances with a Gaussian expansion of `inf_edge_attr`, giving each edge both local-distance and infinite-potential information.
- Adds high-performance Cython/C helpers (`matdeeplearn/preprocessor/inf_functions/series.pyx`, `bessel.c`, `setup.py`) for incomplete Bessel and GSL gamma functions, compiled against GSL. The PR also includes a CGCNN example config, `configs/examples/config_potnet.yml`.

**LLM4StructGen contributions** (lab repo `shuyijia/LLM4StructGen`, led by Shuyi Jia):
- `9a27643` (2024-07-30): adds `InvCryRepMace` to `llm4structgen/representations/slices.py`. It subclasses the SLICES library's `InvCryRep` and replaces its M3GNet relaxation methods with a MACE-MP "large" calculator and ASE `FIRE` optimization, with per-method timeouts (180/360/1000 s). The commit also adds `mace-torch` to the README install steps. This is the MACE relaxation path the paper uses to decode SLICES outputs.
- `4776604`: routes FIRE optimizer logging to the console.
- `72d37b7` (2024-08-07): adds a `randomized` flag through `torchtune_dataset.py` to `SLICES.encode`. When set, encoding uses `structure2SLICESAug(num=1)`, so the model sees a randomized SLICES string for each structure, a data-augmentation option for training.

## Infrastructure & deployment
MatDeepLearn uses conda env files (`env.common.yaml`, `env.gpu.yaml`), and the PR documents building on Perlmutter (`module load gsl`). LLM4StructGen runs with `tune run` (a forked torchtune), logs to wandb, and per the paper was run on A100 40GB GPUs.

## Results & performance
- **50% memory reduction** in MatDeepLearn GNN pipelines with negligible performance loss.
- **11.5% higher GNN predictive performance** from feature engineering of crystal graph embeddings.
- **LLM4StructGen benchmark: 2 LLMs × 4 representations × 2 preprocessing configs** — LLaMA-2 7B and LLaMA-3 8B; Fractional, Z-matrix, distance-matrix and SLICES representations; with and without atom-permutation augmentation. Results are in `paper-crystal-text-representations`.
- **Publication:** co-author, ICLR 2025 AI4Mat workshop.

## Testing & evaluation
MatDeepLearn evaluates models on train/val/test splits (default 0.8/0.05/0.15) and writes predictions to CSV. LLM4StructGen decodes generated strings to CIFs, reports the decoding success rate, and computes CDVAE validity, coverage and property-EMD metrics on 10,000 structures (`llm4structgen/evaluation/evaluate.py`), plus the IPT metric.

## Tech stack
- Python, PyTorch, PyTorch Geometric, torch_scatter/torch_sparse
- Cython + C + GSL (PR #68)
- ASE, pymatgen, SLICES (`invcryrep`), MACE (`mace-torch`), TensorFlow (used by SLICES)
- torchtune, LoRA, LLaMA-2/LLaMA-3, HuggingFace, wandb

## Design decisions & tradeoffs
- **PR #68:** local cutoff edges are kept and infinite-potential features are added alongside them, so models get both short-range geometry and long-range physics. The lattice sums run in compiled C for speed.
- **MACE in place of M3GNet** for relaxing structures decoded from SLICES. The MACE calculator runs on CUDA in float32, and timeouts bound slow relaxations.

## Next steps
- Next: package the infinite-potential C extensions for a simpler install and add a sparse alternative to the all-pairs `inf_edge_index` for larger unit cells.
- Next: benchmark the randomized-SLICES augmentation in the LLM4StructGen study.
- Next: extend the LLM crystal-generation work toward conditional generation and physically constrained text formats (the paper's stated future work).

## Likely questions (Q&A)
- **What did Dhruva achieve in the Fung Group?** A 50% memory reduction in MatDeepLearn GNN pipelines with negligible performance loss, an 11.5% gain in GNN predictive performance from crystal-graph feature engineering, and a co-authored ICLR 2025 AI4Mat paper on LLM crystal generation.
- **What is MatDeepLearn?** The Fung Lab's shared GNN framework for materials property prediction. Dhruva optimized its pipelines and contributed PR #68, which adds infinite-potential edge features.
- **What feature engineering did Dhruva do?** One public example is PotNet-style infinite-potential edge attributes (Coulomb, London dispersion and Pauli lattice sums) concatenated with Gaussian distance features, implemented with Cython/C/GSL helpers.
- **What did Dhruva add to LLM4StructGen?** MACE-based relaxation for SLICES decoding, replacing M3GNet (`9a27643`), console logging for it (`4776604`), and a randomized-SLICES augmentation flag (`72d37b7`).
- **Which LLMs were benchmarked?** LLaMA-2 7B and LLaMA-3 8B, fine-tuned with LoRA (rank 8, alpha 16).
- **Is there a publication?** Yes. Dhruva co-authored "Benchmarking Text Representations for Crystal Structure Generation with Large Language Models" (ICLR 2025 AI4Mat workshop), listed with an Alpharetta High School affiliation: a high-school co-author on an ICLR workshop paper.
- **Which GNNs does MatDeepLearn support?** Registered models include CGCNN, MPNN, SchNet, TorchMD-ET, TensorNet and CrystalGraph, with more in `models/in_progress`.

## Sources
- Dhruva's résumé
- https://github.com/Fung-Lab/MatDeepLearn_dev: `configs/config.yml`, `matdeeplearn/preprocessor/processor.py`, `helpers.py`, `models/`, `trainers/property_trainer.py`, `main.py`; git history
- PR #68: https://github.com/Fung-Lab/MatDeepLearn_dev/pull/68 (description, commits, diff)
- https://github.com/shuyijia/LLM4StructGen: README, `llm4structgen/representations/slices.py`, `base_representation.py`, `datasets/torchtune_dataset.py`, `datasets/prompts.py`, `evaluation/evaluate.py`, `configs/train/llama3/8B_lora_single_device.yaml`; commits `9a27643`, `4776604`, `72d37b7`
- Paper PDF via https://openreview.net/forum?id=w1JsxPYWLL

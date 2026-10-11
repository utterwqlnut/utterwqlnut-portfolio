---
id: paper-crystal-text-representations
title: Benchmarking Text Representations for Crystal Structure Generation with LLMs (co-author)
type: research
summary: ICLR 2025 AI4Mat workshop paper, the first benchmark of text representations for LLM crystal generation; Dhruva co-authored it as a high-school student and built its MACE-relaxation path for SLICES.
tags: [llm, crystal-structure-generation, materials-discovery, lora, llama, slices, text-representations, benchmark, iclr-workshop]
links:
  repo: https://github.com/shuyijia/LLM4StructGen
  paper: https://openreview.net/forum?id=w1JsxPYWLL
---

# Benchmarking Text Representations for Crystal Structure Generation with LLMs

## TL;DR
Dhruva co-authored this **ICLR 2025 workshop paper** ("AI4Mat: AI for Accelerated Materials Design") with Shuyi Jia, Aamod Varma, Pranav Manivannan and Victor Fung, while affiliated with Alpharetta High School: a high-school co-author on an ICLR workshop paper. The authors call it the **first benchmark of text representations for LLM-based crystal generation**. It fine-tunes LLaMA-2 7B and LLaMA-3 8B with LoRA to generate crystal structures in four text formats: Fractional (reduced CIF), Z-matrix, distance matrix and SLICES. All four formats work. The key finding: the simplest format, Fractional, which has no built-in invariances, performs best overall, while formats with built-in invariances and random atom-permutation augmentation mostly did not help. Dhruva's code contributions to the LLM4StructGen repo include the **MACE relaxation backend used to decode SLICES** and a randomized-SLICES augmentation option.

## Problem & motivation
LLMs can generate new materials by writing out crystal structures as text. Earlier work mostly used CIF-like formats. Those formats do not have the rotation, translation and permutation invariances that are usually considered important when representing atomic structures. Earlier text-representation benchmarks also focused on property prediction and used formats that cannot be decoded back into a structure. The research question is whether text formats with built-in invariances, which can still be decoded back into structures, improve LLM-based crystal generation.

## Architecture
```
MP-20 structures ─► text encoding (Fractional | Z-matrix | Distance | SLICES)
   ─► optional atom-permutation augmentation ─► LoRA fine-tune (LLaMA-2 7B / LLaMA-3 8B)
   ─► unconditional sampling ─► decode (direct, gradient reconstruction, or SLICES+MACE)
   ─► CDVAE metrics, IPT
```
- **Fractional:** lattice parameters, element symbols and fractional coordinates. This is the reduced CIF format from Gruver et al. (2024).
- **Z-matrix:** internal coordinates (bond length, angle, dihedral) plus lattice parameters and three dummy anchor atoms. It is invariant to translation and rotation.
- **Distance matrix:** the lower triangle of the pairwise distance matrix, prefixed with lattice parameters. It is invariant to translation and rotation. Decoding requires reconstruction.
- **SLICES** (Xiao et al., 2023): atom symbols plus edge descriptors that encode bonding across periodic cells. It is invariant to translation and rotation. Decoding requires reconstruction.
None of the four formats is permutation-invariant (paper Table 1).

## Implementation details
- **Data:** the MP-20 dataset, made of Materials Project structures with at most 20 atoms. It is split into roughly 27k training, 9k validation and 9k test structures (§2.2).
- **Fine-tuning:** done with torchtune and LoRA (rank 8, alpha 16) on A100 40GB GPUs. Settings: batch size 4, gradient accumulation 64, BF16, AdamW with learning rate 3e-4 and weight decay 0.01, 10 epochs, cosine schedule with 100 warmup steps (Appendix B; matching `configs/train/llama3/8B_lora_single_device.yaml`).
- **Prompts:** adapted from Gruver et al.'s unconditional-generation prompt, with one header per format (Appendix C; `llm4structgen/datasets/prompts.py`).
- **Preprocessing configurations:** each format is fine-tuned with and without random permutation of atom order as augmentation (§3).
- **Decoding:**
  - Fractional and Z-matrix are decoded directly.
  - Distance matrices are decoded with a gradient-based reconstruction (Appendix A, from Fung et al. 2022). It starts from random positions, uses gradient descent to match the target distances, and adds noise "basin hops" to escape bad local minima.
  - SLICES is decoded with the SLICES library and then relaxed with the MACE interatomic potential. Dhruva implemented this path in the repo (commit `9a27643`): `InvCryRepMace` subclasses SLICES' `InvCryRep` and swaps its M3GNet relaxation for a MACE-MP "large" calculator with ASE `FIRE` optimization.
- **Randomized SLICES:** Dhruva also added a `randomized` encoding flag (commit `72d37b7`) that feeds the model a randomized SLICES string per structure via `structure2SLICESAug`.
- **Token cost** (Appendix D): Fractional uses about 10 tokens per atom and Z-matrix about 6. Distance-matrix cost grows quadratically with atom count. SLICES strings average about 40 edges per training structure, roughly 2–3 times the length of the other formats.

## Infrastructure & deployment
A research benchmark. Code: https://github.com/shuyijia/LLM4StructGen (torchtune fork, wandb logging, single-device inference).

## Results & performance
All numbers are from the paper (§3).
- **Decoding success:** Fractional, Z-matrix and distance matrix mostly decode more than 99% of 10,000 sampled strings. SLICES reaches up to 64.37%.
- **Overall ranking:** Fractional performs best overall, with high structural validity and close agreement with the test set on density and element count. The distance matrix is competitive and has the best coverage recall and precision. Z-matrix follows, then SLICES, even after MACE relaxation.
- **Permutation augmentation:** it makes little difference for Fractional and hurts the other formats. For Z-matrix and SLICES, turning it off improves every metric.
- **Post-generation MACE relaxation** of the Fractional, Z-matrix and distance outputs (LLaMA-3 8B) improves results, especially validity (Table 3).
- **IPT** (Increase in Perplexity under Transformation, measured on 500 test structures × 20 permutations): lower for Fractional and distance matrix, much higher for Z-matrix and SLICES, consistent with their generation results. This gives a cheap diagnostic that tracks downstream generation quality.

## Testing & evaluation
The paper uses the CDVAE metrics:
- **Structural validity:** no atom pair closer than 0.5 Å.
- **Compositional validity:** charge-neutral according to SMACT.
- **Coverage recall and precision** against the test set.
- **Earth Mover's Distance (EMD)** between generated and test-set distributions of density and number of distinct elements.

It also reports the decoding success rate and IPT. Formation-energy distributions use MACE relaxation and Orb-v2 energies (Appendix E). The baseline is the LLaMA-2 7B result from Gruver et al. (2024).

## Tech stack
- LLaMA-2 7B, LLaMA-3 8B, LoRA, torchtune, PyTorch
- ASE, pymatgen, SLICES, MACE, SMACT, matminer, Orb-v2

## Design decisions & tradeoffs
- The benchmark compares formats with different invariances and different decoding methods (direct decoding versus reconstruction), isolating the effect of representation.
- The authors suggest three reasons SLICES did poorly: its strings are long, LLMs are unlikely to have seen the format during pretraining, and it may need its own tokenizer (§3).
- Z-matrix values (lengths, angles, dihedrals) span very different scales. Fractional coordinates all fall in [0, 1). The paper offers this as a reason Fractional is easier for the model.

## Next steps
- Next: add physical properties or constraints directly into the text formats.
- Next: extend from unconditional generation on MP-20 to conditional generation.
- Next: strengthen validation beyond CDVAE metrics, for example with DFT (§4).

## Likely questions (Q&A)
- **What was Dhruva's role?** Co-author. Dhruva worked on LLM4StructGen, benchmarking 2 LLMs, 4 text representations and 2 preprocessing configurations, and contributed code: the MACE relaxation backend for SLICES decoding (`9a27643`) and a randomized-SLICES augmentation flag (`72d37b7`).
- **What are the "2 preprocessing configurations"?** Training with and without random atom-permutation augmentation.
- **Which representation won?** Fractional overall. The distance matrix had the best coverage.
- **Why did SLICES do poorly?** Long strings, unfamiliarity to LLMs, and possibly the need for its own tokenizer (the authors' hypotheses).
- **Did invariances help?** Mostly not, which is the paper's main and somewhat surprising finding: the simplest format wins.
- **Where was it published?** The ICLR 2025 AI4Mat workshop (OpenReview w1JsxPYWLL). Dhruva is listed with an Alpharetta High School affiliation, making this an ICLR workshop paper co-authored in high school.

## Sources
- Paper PDF via https://openreview.net/forum?id=w1JsxPYWLL (abstract, §1–4, Tables 1–3, Appendices A–F)
- https://github.com/shuyijia/LLM4StructGen (README, configs, `llm4structgen/representations/`, `datasets/prompts.py`, `evaluation/evaluate.py`, commit history)
- Dhruva's résumé

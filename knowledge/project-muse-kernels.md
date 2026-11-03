---
id: project-muse-kernels
title: Muse Spark GPU Kernel Optimization — projection and routing kernels on H200
type: project
summary: Hand-tuned BF16 projection and FP32 routing kernels for Muse Spark, an 816B MoE, at 1.35x SGLang's production kernels on H200, including a lossless 12-bit weight format and Hopper TMA + wgmma kernels.
tags: [cuda, triton, hopper, h200, wgmma, tma, gemm, gemv, split-k, moe, sglang, cublas, optuna, compression]
links:
  repo: https://github.com/utterwqlnut/muse_bf16_proj
---

# Muse Spark GPU Kernel Optimization

## TL;DR
Dhruva optimized the projection kernels of Muse Spark, an 816B-parameter mixture-of-experts model, reaching **1.35×** the speed of SGLang's production kernels on an NVIDIA H200 (geometric mean over the scored shapes, timed as CUDA-graph replays with a cold L2). The work combines three kinds of kernels, each picked per shape and batch size:
- a **lossless 12-bit** weight format with a CUDA-core GEMV for single-token (m = 1) matrices, **1.5–1.8×** over cuBLAS;
- hand-written **Hopper TMA + wgmma** GEMMs for small batches, with split-K inside a thread-block cluster;
- fused **FP32-exact routing** kernels, **2–4×** faster than SGLang, tuned per shape with Bayesian (Optuna) search.

Stack: Python, C++, CUDA (compiled at runtime with NVRTC), Triton, PyTorch.

## The problem
At decode time an LLM multiplies a big weight matrix by a "skinny" activation matrix: only 1 to 256 tokens. The work is memory-bound: the speed limit is how fast the weights stream out of HBM, not how fast the tensor cores multiply. The layers covered were the attention QKV/gate projection (2304×8192), the output projection (8192×1024), a pooler (4096×8192), an unpooler (8192×4096), and the MoE router (256×8192, which must stay exact in FP32). Results had to match a full-precision reference: no lowering precision to go faster.

## What the kernels do
- **m = 1: 12-bit GEMV.** BF16 weights in a trained model use far fewer than 2^16 distinct values per row, so the weights were re-encoded losslessly in 12 bits: a low-byte plane, a 4-bit code plane, and a small per-row escape list for rare values. Streaming 25% fewer bytes from HBM is a direct win when the kernel is bandwidth-bound, and at m = 1 CUDA cores keep up with the decode.
- **Small batches: TMA + wgmma GEMM.** The weight matrix is the wgmma A operand (64 rows per warpgroup) and the tokens are N, rounded up to a multiple of 8. Activations arrive by TMA with an L2 `evict_last` hint; weights stream as bulk copies from a pre-swizzled copy packed once at load time, through an mbarrier ring. The K dimension is split across the CTAs of a thread-block cluster and the partial sums are added over distributed shared memory (DSMEM). This won 1.13–1.20× on the QKV projection at every batch size from 2 to 128.
- **Elsewhere: tuned Triton split-K** or cuBLAS, whichever measured faster for that exact shape.
- **Router:** a Triton FP32 kernel for 1–2 tokens; above that, split-K over the high and low BF16 halves of the FP32 weights with TMA, accumulating into FP32. It stays exact in FP32 and runs 2–4× faster than SGLang's path.
- At load time the kernels are compiled with NVRTC and every dispatched kernel is checked against an FP32 product. Anything that fails falls back to Triton or cuBLAS.

## What was learned (selected)
- Ablations showed the TMA kernel ran as fast with loads only as with the full math, so it was purely memory-bound: weights streamed at ~3.9 TB/s. Each SM could take in only ~110 GB/s of activations, so TMA multicast wouldn't help.
- Bigger clusters save activation traffic but pay more for the DSMEM reduce (~1 µs at 3 CTAs, ~2.4 µs at 6), so cluster size was tuned per shape.
- Some ideas lost: a 12-bit format on tensor cores (decoding ate the byte savings), hand-written TMA router kernels (0.82–0.91× the Triton version), and persistent kernels (no gain).
- Kernels were timed as CUDA-graph replays, the way they run in production. Configurations that win in eager timing can lose under graphs at these sizes.

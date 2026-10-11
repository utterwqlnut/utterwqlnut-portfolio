---
id: project-dinference
title: dInference — verifiable LLM inference marketplace on Solana
type: project
summary: Permissionless Solana protocol for LLM inference where a 256-byte hidden-state fingerprint lets a staked verifier committee catch model substitution with 100% TPR and 0% FPR.
tags: [solana, anchor, rust, pytorch, verifiable-inference, llm, depin, walrus, optimistic-verification, crypto-economics]
links:
  repo: https://github.com/utterwqlnut/dInference
---

# dInference — verifiable LLM inference marketplace on Solana

## TL;DR
dInference is Dhruva's DePIN protocol for verifiable LLM inference on open-source models. Dhruva designed both the on-chain economics (a Rust/Anchor Solana program) and the ML verification scheme (PyTorch). Users post SOL bounties on Solana. Staked GPU providers race to answer them, and each provider commits a 64-float (256-byte) "activation fingerprint" of the model's final-layer hidden states. If the user challenges the response, a randomly drawn committee of staked verifiers recomputes the fingerprint in one teacher-forced forward pass and votes on chain; slashing and payouts settle automatically. In a 1,500-sample evaluation the fingerprint caught model substitution at **100% TPR and 0% FPR**, including the hard case of swapping in a smaller model from the same family. It adds only **+1.3% provider overhead**, and verification runs about **18× faster** than re-execution.

## Problem & motivation
As the whitepaper (`whitepaper.md` §1) frames it, nothing in an LLM API response proves which model produced it. A provider could quietly serve a cheaper model, truncate the output, or return a cached answer. Meanwhile, independent GPUs have no trusted way to sell their capacity. The whitepaper weighs the alternatives: reputation systems, N-way redundant execution (N× cost), and zkML (cited as roughly 10²–10⁴× slower than native). dInference instead uses optimistic verification: responses are trusted by default and checked only when challenged, and the check is a cheap fingerprint that runs at native speed.

## Architecture
```
User/SDK --upload prompt--> Walrus (Sui testnet)
   | post_bounty (escrow SOL)            ^ upload response
   v                                     |
Solana program (Anchor) --BountyPosted--> Provider daemons (race)
   ^  claim_bounty(response_blob_id, fingerprint[64])
   | challenge(bond) -> committee drawn from VerifierPool
   +--ChallengeOpened--> Verifier daemons -> verifier_vote -> finalize_challenge
```
On-chain accounts (`programs/dinference/src/state.rs`): global `GlobalConfig`, `RotatingSeed`, and one `StakeVault` PDA holding all stakes and escrows; per-model `ModelInfo`/`VerifierPool`; per-operator `ProviderAccount`/`VerifierAccount`; per-request `Bounty`, `ResponseCommitment`, `Challenge`.

## Implementation details
**Lifecycle (`programs/dinference/src/lib.rs`):**
1. **Bounty.** `post_bounty(nonce, prompt_txid, bounty_lamports)` escrows SOL in the vault, snapshots the rotating seed into `seed_at_submission` (used for the projection), sets status `Open`, and emits `BountyPosted`.
2. **Race.** `claim_bounty(response_txid, fingerprint)` requires status `Open`, an active provider, and a matching model hash. It reserves collateral of `2 × (premium + verify_fee × committee_size)`, where premium is the challenger reward above 1× the bounty (0.25× at 12,500 bps). It then flips the bounty to `Claimed` and creates the `ResponseCommitment` with `challenge_deadline_slot = now + challenge_window_slots`. A second claim fails with `WrongBountyStatus`, so exactly one provider wins each race.
3. **Challenge window.** If unchallenged, anyone can call `finalize_payment` after the deadline to pay the winner and release collateral. If no provider ever claims, `reclaim_unclaimed_bounty` refunds the user after `unclaim_timeout_slots`.
4. **Committee selection.** The bounty's user calls `challenge(bond)`, with a bond of at least `verify_fee × committee_size`. The program draws K verifiers deterministically from the on-chain seed:
   ```rust
   buf = seed(32) || bounty_pda(32) || i as u64 LE
   r = u64::from_le_bytes(sha256(buf)[..8]) % pool.len()
   committee.push(pool[r]); pool.swap_remove(r);
   ```
   Because selected verifiers are removed from the pool, no verifier can sit on two committees at once.
5. **Votes.** `verifier_vote(verdict, fp_cos_scaled)` accepts only committee members, one vote each, before `vote_deadline_slot`. The cosine is stored ×10,000 as an i32.
6. **Finalize, slash, and pay.** `finalize_challenge` is permissionless. With quorum `q = floor(n × quorum_fraction / 10,000)`, it finalizes early once guilty votes reach `q` (guilty locked) or once guilty plus remaining votes falls below `q` (honest locked), and otherwise after the vote deadline. Committee members who voted with the majority are credited `verify_fee`. Members who voted with the minority or did not vote are slashed `dishonesty_fee`, capped at their stake, and deactivated if they fall below the minimum stake. Still-active members are pushed back into the pool. If the provider is guilty, half their stake is slashed and the user receives `bounty × challenger_reward_bps / 10,000`. Otherwise the winner receives the bounty. `ChallengeResolved` is emitted.

`rotate_seed` is also permissionless. It sets the new seed to `sha256(seed || slot)` once `seed_rotation_slots` have elapsed.

**Fingerprint (`off_chain_inference/fingerprint_pipeline.py`):**
- `FingerprintProvider` subclasses `transformers.Pipeline`. It registers a forward hook on `model.model.norm`, the final RMSNorm, and captures the last-position hidden state at each generation step. It keeps the first `n_new` captures, which are the states that produced each generated token.
- The projection `P` is `torch.randn(hidden_dim, 64)` seeded through a CPU `torch.Generator`. The seed is the first 8 bytes, little-endian, of the bounty's on-chain `seed_at_submission`. The fingerprint is `(H.float() @ P).sum(0)`: 64 float32 values, or 256 bytes, no matter how long the response is.
- Using a forward hook keeps overhead to ~2%, versus 50%+ for `output_hidden_states=True` during generation (per a design note in the code).

**Verification (`off_chain_verifier/fingerprint_pipeline.py`):**
- `FingerprintVerifier` builds `prompt_ids ++ tokenize(response, add_special_tokens=False)` and runs one forward pass with `output_hidden_states=True`. It takes `hidden_states[-1][prompt_len-1 : -1]`, projects with the same seed, and computes the cosine against the committed vector.
- The response passes if `fp_cos > 0.99` and it is not truncated. A response counts as truncated when it is shorter than `max_new_tokens` and its last token is not one of the model's EOS or generation-config stop tokens, so the check also catches cut-short outputs.

**Daemons:**
- `off_chain_inference/ramp.py` subscribes to program logs via `chain/events.py`, which uses `logsSubscribe` and decodes Anchor `Program data:` events. It handles bounties first-come-first-served behind a single busy flag.
- `off_chain_verifier/ramp.py` acts when its operator is on the committee. It votes guilty with `fp_cos=-1` if a Walrus fetch fails (an unavailable response counts against the provider), then attempts `finalize_challenge` as soon as the tally is decidable.

**Storage (`chain/walrus.py`):** Blobs are written over plain HTTP with `PUT /v1/blobs?epochs=1` to the Walrus testnet publisher and read with GET from the aggregator. The 32-byte blob ID, decoded from base64url, is stored on chain as the txid, keeping on-chain state small.

**SDK:** `sdk/client.py`'s `DInference.inference()` wraps the whole flow in one call: it uploads the prompt, posts the bounty, polls for the commitment, and returns the response with `<|...|>` tokens stripped.

## Infrastructure & deployment
- Anchor 0.31.0 (`Anchor.toml`), running on a local Solana test validator.
- `scripts/local_e2e.sh` gives a one-command end-to-end demo: it deploys the program, initializes SmolLM2-135M-Instruct (hidden_dim 576), registers 1 provider and 3 verifiers, spawns the daemons, and offers `bounty`/`challenge` commands. Its config: committee 3, quorum 6,700 bps, cos_threshold 9,900, 200-slot challenge window, 50-slot vote window.
- GPU evaluation runs on Modal A10Gs (`scripts/experiment_cross_family.py`).

## Results & performance
- **Accuracy** (README, `whitepaper.md` §11, `results/cross_family_verified.csv`): 500 prompts × 3 scenarios = 1,500 samples, with the claimed model Qwen2.5-1.5B-Instruct.

  | Scenario | Model actually served | Mean cosine | Pass rate |
  |---|---|---|---|
  | Honest | Qwen2.5-1.5B | 1.0000 | 100% |
  | Same-family downsizing | Qwen2.5-0.5B | −0.0059 | 0% |
  | Cross-family | SmolLM2-1.7B | −0.0018 | 0% |

  That gives FPR 0, TPR 1, and accuracy 1 at τ=0.99. The separation is wide: the honest minimum cosine is about 0.9995, while substituted models land near zero.
- **Speed** (`whitepaper.md` §4.5, produced by `scripts/bench_fingerprint.py`): 100 Dolly-15k prompts, SmolLM2-135M-Instruct, Apple MPS, bf16, greedy decoding, up to 256 new tokens.
  - Provider overhead only +1.3% wall time (1013.7 → 1027.2 ms mean).
  - Verification 56.8 ms mean, about 5.5% of generation time, roughly 18× faster than re-execution.
  - Mean cosine 0.99964 (min 0.99435) for honest runs.

## Testing & evaluation
- `programs/dinference/src/tests.rs` contains a Rust unit-test suite covering quorum math, early-finalize decidability, slash arithmetic, the collateral reservation formula, deterministic pool selection, and vault invariants.
- The cross-family experiment above (1,500 samples on Modal A10Gs) evaluates detection accuracy, and `scripts/bench_fingerprint.py` benchmarks overhead and verification latency.
- `results/exp1_verified.csv` records an earlier 60-sample Qwen 0.5B vs. 1.5B experiment that paired the fingerprint with a KS-statistic check. The current verifier streamlines this to the fingerprint check, which delivered the clean separation reported above.

## Tech stack
- Rust, Anchor 0.31, Solana
- Python 3.11, PyTorch, Hugging Face `transformers`
- `solana-py`, `solders`, `httpx`
- Walrus (Sui testnet); Modal (A10G) for evaluation

## Design decisions & tradeoffs
From the README and whitepaper:
- **Fingerprint instead of zkML.** The fingerprint runs at native speed and relies on economic rather than cryptographic finality. The whitepaper is explicit that it is a heuristic, not a proof, and pairs it with staking and slashing to make cheating unprofitable.
- **Hidden states instead of sampled tokens.** Sampling tampering (for example, switching to greedy decoding) is deliberately out of scope, because it saves the attacker roughly no compute. The attacks that do save compute show up as hidden-state divergence.
- **A constant verify fee regardless of verdict,** which removes any incentive to vote in a particular direction.
- **2× collateral,** because a cheater loses only half their stake, and that half must still cover the challenger premium plus verifier fees.
- **Walrus instead of Arweave,** after Python-client issues and ~60 s Irys indexing lag (whitepaper §9).
- **The 0.99 threshold** absorbs bf16 noise between KV-cached decoding and single-pass teacher forcing.

## Next steps
- Next: tune the economic parameters and add profit-aware scheduling to the provider daemon.
- Next: commit raw token IDs to make the prompt/response boundary fully robust to re-tokenization.
- Next: characterize bf16 determinism across GPU types and move enforcement of `cos_threshold` on chain.
- Next: batched verification and multi-layer hooks.
- Next: move from local validator and Walrus testnet toward a public deployment with private prompts.

## Likely questions (Q&A)
- **How big is the proof?** 64 float32 values, 256 bytes, for any response length.
- **Which layer is fingerprinted?** The final layer after the last RMSNorm, at each position that produced a generated token.
- **How is the projection kept from being gamed?** It is seeded from the on-chain rotating seed snapshotted at bounty time, so a memorized fingerprint from an earlier request cannot be reused.
- **How fast is verification?** One forward pass: 56.8 ms mean in the benchmark, about 18× faster than re-running generation, and only +1.3% overhead for the provider.
- **Does it catch a smaller model from the same family?** Yes. Serving Qwen2.5-0.5B in place of 1.5B gave a mean cosine of −0.006 and a 0% pass rate, versus 1.0000 and 100% for honest serving.
- **What happens to a cheater?** Half of their stake is slashed, and the user receives 1.25× the bounty under the default bps setting.
- **What stops verifier collusion?** Committees are drawn pseudorandomly from an on-chain seed, minority voters and non-voters are slashed, and each Sybil account needs a full stake.
- **Why not zkML?** zkML is cited as roughly 10²–10⁴× slower than native; dInference's optimistic fingerprint check runs at native speed and only when challenged.
- **Where does it run?** End to end on a local Solana test validator with Walrus testnet storage, plus GPU evaluation on Modal.

## Sources
- https://github.com/utterwqlnut/dInference: README.md, whitepaper.md, programs/dinference/src/*, off_chain_inference/*, off_chain_verifier/*, chain/*, sdk/client.py, scripts/*, results/*.csv, Anchor.toml

---
id: project-polymarket-insiders
title: Polymarket Insider Flagger — real-time statistical anomaly leaderboard
type: project
summary: Real-time async Python pipeline over 1,000+ Polymarket markets that Monte Carlo-tests large traders in 3 ms with Numba and ranks statistical outliers in a Redis leaderboard.
tags: [python, asyncio, numba, monte-carlo, redis, fastapi, prediction-markets, polymarket, real-time]
links:
  repo: https://github.com/utterwqlnut/polymarket-insiders
---

# Polymarket Insider Flagger

## TL;DR
Dhruva built a real-time Python pipeline that ingests and processes trades from **1,000+ Polymarket markets concurrently**, picks out large ones, pulls the trader's position history, and runs a Numba-compiled, parallel Monte Carlo test of how likely their results are by chance. Numba JIT brought **wallet analysis latency down to 3 ms**. Each result becomes an "insider score" ranked in a Redis sorted-set leaderboard served by FastAPI. The system is a statistical screen: it surfaces traders whose performance is hard to explain by the prices they paid.

## Problem & motivation
A prediction-market price can be read as the market's implied probability. The README states the goal as "flagging Polymarket traders whose on-chain performance is statistically hard to explain." A trader who keeps winning bets priced as unlikely stands out from chance. The project finds such traders as large trades happen and ranks the most anomalous ones in real time.

## Architecture
The README calls it "a simple producer / consumer pipeline." Dhruva built it as one Python process on one asyncio event loop, plus a process pool for the CPU-heavy work (`server/main.py`).

```
Polymarket data-api /trades (polled)
        │  FlagAPI (producer, server/flag.py)
        ▼
asyncio.PriorityQueue  (largest cash-size trade first)
        │  2×CPU fetch workers (server/user_check.py)
        │   - first-trade age check (/activity, cached in Redis hash)
        │   - /closed-positions + /positions → NumPy (N,3) array
        ▼
asyncio.Queue (bounded, 4×CPU)
        │  CPU-count score workers → ProcessPoolExecutor
        │   - monte_carlo() [Numba @njit(parallel=True)]
        ▼
Redis: ZADD leaderboard {user: 1 - p}; trim to top 1000
        ▼
FastAPI (uvicorn): GET /leaderboard, GET / (frontend/index.html)
```

## Implementation details
**Producer (`server/flag.py`, class `FlagAPI`).** Polls `data-api.polymarket.com/trades` every `--rate` seconds (default 5.0) with `takerOnly=true&filterType=CASH&filterAmount=<suspicious_size>`, so the API does the filtering and returns only trades above the cash threshold (default 10,000). Requests can be scoped with `&market=` filters. To skip trades already seen, it stores the newest trade's timestamp and transaction hash and stops the next poll when it reaches an older timestamp or that hash. New trades go into an `asyncio.PriorityQueue` keyed by `-(size*price)` (largest first, `itertools.count()` breaks ties), carrying market ID, asset ID, transaction hash, proxy wallet, and timestamp.

**Consumer (`server/user_check.py`, class `UserChecker`).** The consumer has two kinds of workers:
- `_fetch_worker` (2× CPU count) takes a flagged trade and looks up the user's first `TRADE` event via `/activity` (cached as `first_trade_ts` in a Redis hash). Wallets whose first trade is older than `--max_trading_age_days` (default 120; 0 disables) are skipped, focusing the screen on newer wallets. Otherwise it fetches `/closed-positions` and `/positions` concurrently with `asyncio.gather` (`limit=--limit_history`, default 10,000), builds rows of `(totalBought, curPrice, avgPrice)`, and puts them on a bounded ready queue.
- `_score_worker` (one per CPU) runs `monte_carlo` inside the `ProcessPoolExecutor` through `loop.run_in_executor`, so the event loop never blocks.

**Monte Carlo test (`server/analysis.py`).** `monte_carlo(closed_positions, num_runs)` is decorated with `@njit(parallel=True)`. For each position:
size = `totalBought`; outcome = `curPrice` (resolved positions, 1 = won or 0 = lost, enter the test); prob = `avgPrice`, the average entry price as implied win probability.

Actual PnL is the sum of `size*(1-prob)` for wins minus `size*prob` for losses. Each run draws a win per resolved position with probability `prob` and applies the same payoff. It returns the fraction of runs with simulated PnL ≥ actual PnL, an empirical one-sided p-value. The runs loop is parallelized with `prange`; default 10,000 runs (`--monte_carlo_runs`).

```python
for _ in prange(num_runs):
    local = 0.0
    for i in range(len(closed_positions)):
        ...
        if np.random.random() < prob: local += size * (1.0 - prob)
        else:                          local -= size * prob
    if local >= overall_pnl: total += 1
return total / num_runs
```

**Score conversion.** `insider_score = 1.0 - p` (`server/user_check.py`). A higher score means the actual result is less likely under the price-implied odds.

**Redis.** After scoring: `ZADD leaderboard {user: 1-p}` then `ZREMRANGEBYRANK leaderboard 0 -1001`, which keeps only the 1,000 highest scores. Per-user metadata lives in the hash `user_meta:{user}`.

**JIT warmup (`server/main.py`).** `warmup_numba` runs `monte_carlo` on a two-row sample (`min(num_runs, 500)` runs) in every pool worker before real traffic, so each process compiles up front and the first real wallet is scored at full speed. `warmup_http` hits each Polymarket endpoint once to warm DNS, TLS, and the connection pool.

**Orchestration.** `run()` requires `REDIS_URL`, shares one `aiohttp.ClientSession` and a `redis.asyncio` client, and starts three tasks (producer, `check_loop`, uvicorn), waiting with `FIRST_EXCEPTION` and cleaning up in `finally` for clean shutdown.

**API (`server/api_endpoints.py`).** `GET /leaderboard?page=1&limit=25` calls `ZREVRANGE ... WITHSCORES` and `ZCARD`, then fetches each user's metadata hash in one Redis pipeline. It returns `{page, limit, total, results:[{rank, user, prob, first_trade_ts, trading_age_days}]}`, where `prob` carries the insider score. `GET /` serves `frontend/index.html`; CORS allows all origins.

**Frontend (`frontend/index.html`).** A lightweight HTML/JS paged table of rank, user, insider score, and trading age.

## Infrastructure & deployment
- `Dockerfile`: starts from `python:3.11-slim`, installs `requirements.txt`, copies `server/` and `frontend/`, and runs `python server/main.py`. It exposes port 8080 for Fly.io (per the Dockerfile comment). The server reads its port from `PORT` and falls back to 8000.
- Redis is an external service set through `REDIS_URL`.
- Runtime settings are CLI flags in `server/argparsing.py` (`--suspicious_size`, `--max_trades_per_call` default 100, `--rate`, `--limit_history`, `--monte_carlo_runs`, `--max_trading_age_days`).

## Results & performance
- Ingests and processes trades from **1,000+ Polymarket markets concurrently**.
- **3 ms wallet analysis latency** with the Numba JIT-compiled, parallel Monte Carlo.
- A Redis sorted-set leaderboard backs the FastAPI endpoints with O(log N) inserts and paged reads.
- Configured scale: 10,000 simulations per wallet, up to 10,000 positions of history, top-1,000 leaderboard, 120-day wallet-age filter.

## Testing & evaluation
Dhruva built startup self-checks into `server/main.py`: `warmup_numba` compiles and exercises the Monte Carlo kernel in every pool worker, and `warmup_http` verifies connectivity to every Polymarket endpoint before traffic starts. The scoring itself is an empirical one-sided significance test, 10,000 simulated outcomes per wallet by default.

## Tech stack
- Python 3.11 with asyncio and `concurrent.futures.ProcessPoolExecutor`
- aiohttp, the async HTTP client for the Polymarket data API
- Numba 0.60 and NumPy 2.0 for the parallel JIT-compiled Monte Carlo
- Redis through `redis.asyncio`: sorted sets, hashes, pipelines
- FastAPI and uvicorn
- Docker (targeting Fly.io)
- A plain HTML/JS frontend

## Design decisions & tradeoffs
- **Fetching and scoring are split** (`server/user_check.py`). Fetchers "prefetch wallet data while scorers run Monte Carlo" so that scorers keep the process pool "saturated". There are twice as many fetchers as CPUs, and the ready queue is bounded (4× CPUs) to provide backpressure.
- **CPU work in a process pool** "to avoid blocking the event loop" (class docstring). **Largest trades first** under backlog via the priority queue (`server/flag.py`).
- **Thin API layer**: the app "does not perform any heavy computation itself"; ranking lives in Redis (`api_endpoints.py` docstring).
- **Average entry price as the probability** (`pull_user` docstring: "used as win probability proxy"). This keeps the test model-free: it asks only whether a trader won more often than the prices they paid implied.

## Next steps
- Next: switch ingestion from REST polling to streaming for lower detection latency.
- Next: add a minimum resolved-position count and a multiple-testing correction to sharpen the leaderboard.
- Next: incorporate open positions and trade timing into the score.
- Next: add automated tests and a latency benchmark harness.

## Likely questions (Q&A)
**Q: Where does the trade data come from?**
A: Polymarket's public data API (`data-api.polymarket.com`), using the `/trades`, `/closed-positions`, `/positions`, and `/activity` endpoints, fetched asynchronously over aiohttp.

**Q: How much does it handle?**
A: Trades from 1,000+ Polymarket markets concurrently, with 3 ms wallet analysis thanks to Numba.

**Q: How is a "large trade" defined?**
A: As a taker trade above a cash threshold (`--suspicious_size`, default 10,000). The API applies this filter server-side through `filterType=CASH&filterAmount=...`.

**Q: What does the Monte Carlo test, and how is the score computed?**
A: Each resolved position's average entry price is its win probability; outcomes are simulated (10,000 runs default). p = fraction of runs whose PnL ≥ actual PnL; insider score = `1 - p`.

**Q: Where does Numba come in?**
A: `monte_carlo` uses `@njit(parallel=True)` with a `prange` loop, pre-compiled in each pool worker at startup. That is what brings wallet analysis to 3 ms.

**Q: How is concurrency handled?**
A: One asyncio loop runs the poller, fetch and score workers, and uvicorn; the Monte Carlo runs in a `ProcessPoolExecutor`. A priority queue serves the largest trades first and a bounded ready queue provides backpressure.

**Q: How is Redis used?**
A: A sorted set named `leaderboard` holds `user → score` and is trimmed to the top 1,000 after every insert. The hashes `user_meta:{user}` store the first-trade timestamp, trading age, and score.

**Q: Does a high score mean someone is an insider?**
A: It means their resolved results are statistically unlikely given the prices they paid. The tool is designed as a screen that surfaces wallets worth a closer look.

## Sources
- https://github.com/utterwqlnut/polymarket-insiders (HEAD 13e6e15)
- README.md, Dockerfile, requirements.txt
- server/main.py, server/flag.py, server/user_check.py, server/analysis.py, server/api_endpoints.py, server/argparsing.py
- frontend/index.html
- Dhruva's résumé

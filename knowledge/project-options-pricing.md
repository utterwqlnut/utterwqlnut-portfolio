---
id: project-options-pricing
title: Options Pricing Tool — C++ Black–Scholes and Monte Carlo pricer with 3D price surfaces
type: project
summary: C++17 options pricer that pulls live prices, estimates volatility, and prices European options via Black–Scholes or a Monte Carlo engine with pluggable shock distributions, rendered as 3D surfaces.
tags: [c++, options-pricing, black-scholes, monte-carlo, quantitative-finance, accept-reject-sampling, matplotplusplus]
links:
  repo: https://github.com/utterwqlnut/options-pricing-tool
---

# Options Pricing Tool — C++ Black–Scholes and Monte Carlo pricer

## TL;DR
Dhruva wrote this C++17 command-line options pricer: about 490 lines across 14 files, with a clean polymorphic model interface. It fetches daily closing prices for any ticker from a stock-price API and estimates annualized historical volatility from them. It then prices European calls or puts across a full grid of strikes and days to expiry using either closed-form Black–Scholes or a Monte Carlo simulator whose random shocks come from a **user-defined probability distribution via accept–reject sampling**, so the model is not locked to Gaussian returns. Results render as a 3D option-price surface and, for Monte Carlo, as plotted price paths using Matplot++; the grid is also written to `data.txt`. Built between 2025-05-23 and 2025-06-02 (GitHub metadata), with both models marked "Done" in the README.

## Problem & motivation
The README (`README.md`) describes the goal as "an options pricing tool, meant to provide visualizations and options pricing data through black scholes and other pricing models." Its key idea for Monte Carlo: standard simulations draw Gaussian shocks (geometric Brownian motion), while this model samples from a user-defined distribution. The README says this makes it "more generalizable and applicable to different market scenarios", for example right-skewed shocks, as shown in its AAPL screenshot.

## Architecture
```
stdin prompts (run/run.cpp)
      │
      ▼
StockTimeSeries (api/api.cpp) ──HTTP (cpr)──► daily stock-price API
      │  closing prices, historical vol (nlohmann/json parse)
      ▼
grid loop: days × strikes ──► Base* calc = new BlackScholes(...) | new MonteCarlo(...)
      │                              (models/*.cpp; helpers/math.cpp: ncdf, PDF)
      ▼
matplot::surf(...) 3D surface ─► optional MonteCarlo::graph_paths ─► data.txt
```
- `src/models/base.h/.cpp`: the `Base` class with a virtual `get_price()`.
- `src/models/black_scholes.*` and `src/models/monte_carlo.*`: these classes derive from `Base`. Each computes its price inside its constructor.
- `src/helpers/math.*`: the normal CDF and the user-editable `PDF` class.
- `src/api/api.*`: the data fetch and the volatility estimate.
- `src/run/run.cpp`: the interactive driver and the plotting.

## Implementation details

**Finance background (general):** Black–Scholes gives a closed-form price for a European option, assuming the stock follows geometric Brownian motion with constant volatility σ and risk-free rate r. Monte Carlo pricing instead simulates many stock paths under risk-neutral dynamics, takes the average of the payoffs, and discounts that average at r. Accept–reject sampling draws from a target density f by proposing candidates from a simpler density h and keeping each one with probability f/(c·h).

**What the code does:**

- **Black–Scholes** (`src/models/black_scholes.cpp`): computes d1 = (ln(S/K) + (r + σ²/2)t)/(σ√t) and d2 = d1 − σ√t. The call price is N(d1)S − N(d2)Ke^(−rt). The put price comes from put–call parity: Ke^(−rt) − S + C. N(·) is `ncdf` in `src/helpers/math.cpp`, implemented as 0.5·(erf(z/√2)+1).
- **Volatility input** (`src/api/api.cpp`): `StockTimeSeries` takes the most recent `iv_window` daily closes. It computes log returns ln(Pᵢ/Pᵢ₊₁), takes their sample standard deviation (dividing by n−1, where n is the number of returns), and annualizes it by multiplying by √252. This historical volatility is the σ fed to both models.
- **Monte Carlo** (`src/models/monte_carlo.cpp`): each path starts at the latest close and steps with an Euler update under risk-neutral drift r:
  ```cpp
  return curr_s + r*curr_s*delta_t
       + sigma*curr_s*std::sqrt(delta_t)*accept_reject_sampling();
  ```
  The step loop runs `for (j = delta_t; j <= t; j += delta_t)`. At expiry, the code adds the discounted payoff e^(−rt)·max(S−K,0) (or max(K−S,0) for a put) to a running sum. The price is the sum divided by the number of paths. Every path is stored in `paths_v` so it can be plotted later.
- **Random numbers / sampling:** a single global `std::mt19937` is seeded from `std::random_device`. `accept_reject_sampling()` proposes z ~ U(`PDF::min_range`, `PDF::max_range`) and draws u ~ U(0,1). It accepts z if u ≤ f(z)/`PDF::max_density`. The default `PDF` in `src/helpers/math.cpp` is the standard normal truncated to [−3, 3], with max density 1/√(2π). Swapping in a different distribution means editing that one class and recompiling (README "Usage").
- **Driver** (`src/run/run.cpp`): prompts for:
  - ticker
  - annualized rate
  - volatility window
  - call or put
  - min and max days
  - grid resolution `res`
  - model name (`black_scholes` or `monte_carlo`)
  - for Monte Carlo only: path count and Δt in days

  Days run from min to max in `res` steps. Strikes run from 50% to 150% of the latest close in `res` steps. Time inputs are converted to years by dividing by 365. The tool draws `matplot::surf` with axes for days to expiration, strike, and option price, with a camera angle tuned separately for calls and puts. For Monte Carlo, it then asks for one strike and expiry and plots the simulated paths (dashed grey) after the historical prices (dark line). Finally, it writes each grid point to `data.txt`.
- **Option types:** European calls and puts.

## Infrastructure & deployment
Builds locally with `src/Makefile`, which compiles all sources with `clang++ -std=c++17` into `run_script`. It links `-lcpr -lcurl -lmatplot` and uses Homebrew and `/usr/local` include and library paths (macOS-first; the README notes other systems may need path edits). The external libraries are nlohmann/json, Matplot++, and cpr.

## Results & performance
The README showcases two results: an AAPL Black–Scholes price surface (2025-05-27) and AAPL Monte Carlo paths driven by right-skewed distribution sampling (2025-06-02), demonstrating the non-Gaussian shock feature end to end on live market data.

## Testing & evaluation
Dhruva ran the full pipeline end to end on live AAPL data, producing the Black–Scholes surface and skewed-distribution Monte Carlo paths shown in the README. `api.cpp` also includes a `test_api_connection()` helper that issues a sample price request (IBM) and prints the response for checking API connectivity.

## Tech stack
- C++17, clang++, Make
- cpr and libcurl (HTTP)
- nlohmann/json (parsing)
- Matplot++ (3D surface and line plots)
- `<random>` (mt19937), `<cmath>` (erf, log, exp)
- A daily stock-price HTTP API

## Design decisions & tradeoffs
- **Pluggable distribution via accept–reject (from the README):** chosen to "support a variety of probability distributions". It needs only a density function, its maximum, and a bounded domain, with no inverse CDF, so almost any shape can be plugged in. The domain is truncated to keep proposals bounded; with the default uniform proposal on [−3, 3], about 42% of candidates are accepted.
- **Polymorphic model interface:** `Base* calc` lets the grid loop swap between models at runtime based on the model-name string, so new models drop in as new `Base` subclasses.
- **Price computed in the constructor:** each grid point creates a new model object, so every (day, strike) cell gets its own independent Monte Carlo simulation.

## Next steps
- Next: add Greeks and an implied-volatility solver that backs σ out of market option prices.
- Next: switch to the exact log-normal step and normalize custom shock distributions to keep risk-neutral drift exact.
- Next: support American options.
- Next: parallelize path simulation across threads.
- Next: add a test suite that checks Monte Carlo prices against Black–Scholes under Gaussian shocks.

## Likely questions (Q&A)
- **Which pricing models are implemented?** Closed-form Black–Scholes and a Monte Carlo simulator (`src/models/`), behind a shared polymorphic `Base` interface.
- **What option types does it support?** European calls and puts.
- **What's unusual about the Monte Carlo model?** Its random shocks come from a user-defined PDF through accept–reject sampling instead of always being Gaussian, so it can model scenarios such as right-skewed shocks.
- **Where does volatility come from?** Annualized historical volatility of daily log returns over a window the user chooses, computed from live daily closing prices.
- **What does it output?** A 3D surface of option price against strike and days to expiry, optional Monte Carlo path plots over the price history, and `data.txt`.
- **Why accept–reject sampling?** It only needs the density and its maximum, not an inverse CDF, which makes arbitrary distributions easy to plug in.
- **What would come next?** Greeks, an implied-volatility solver, American options, and multithreaded path simulation.
- **How do you run it?** Install cpr, Matplot++, and nlohmann/json, then run `make` in `src/` and `./run_script`.

## Sources
- https://github.com/utterwqlnut/options-pricing-tool (GitHub API metadata for creation and push dates)
- `README.md`, `src/Makefile`
- `src/models/base.h`, `base.cpp`, `black_scholes.h`, `black_scholes.cpp`, `monte_carlo.h`, `monte_carlo.cpp`
- `src/api/api.h`, `api.cpp`
- `src/helpers/math.h`, `math.cpp`
- `src/run/run.cpp`

---
id: project-kalshi-climate
title: Kalshi Climate — ensemble forecaster for Kalshi daily-high-temperature markets
type: project
summary: Streamlit forecaster that fuses six weather-model ensembles into Gaussian-KDE probabilities for Kalshi temperature ranges, with a built-in NOAA-backed backtester.
tags: [forecasting, weather, ensemble, kde, probability, streamlit, kalshi, prediction-markets, python, backtesting]
links:
  repo: https://github.com/utterwqlnut/kalshi-climate
---

# Kalshi Climate — ensemble forecaster for Kalshi daily-high-temperature markets

## TL;DR
Kalshi Climate is a Python/Streamlit forecasting tool Dhruva built for Kalshi's "highest temperature of the day" markets. It pulls daily-max 2 m temperature ensemble members from up to six weather models (GFS, ECMWF IFS, ECMWF AIFS, GEM) through the OpenMeteo Ensemble API, balances them so each model carries equal weight, fits a Gaussian kernel density estimate (KDE) over the pooled members, and integrates that density over a Kalshi temperature range to estimate that range's probability. A backtest mode scores past ensemble forecasts against observed daily highs from NOAA's GHCND dataset and reports the hit rate of the model's top-probability range. It is a decision-support tool: it gives the trader a probability to compare against the market price, with the trader staying in the loop.

## Problem & motivation
The README states the goal as "a tool to forecast highest temperature trades on kalshi and inform decisions." Kalshi contracts settle on which bucket a city's daily high lands in. A single deterministic forecast gives no bucket probability. An ensemble's spread, smoothed into a distribution, does, so a user can compare it directly with the market price. The README links background reading on ECMWF/GFS 2 m temperature errors and wethr.net for live data.

## Architecture
The repo is a compact set of four Python modules:

```
 Streamlit UI (streamlit_app.py)  --inputs-->  main.py
                                                 |
               +---------------------------------+------------------+
               | live mode                                          | backtest mode
               v                                                    v
   api.OpenMeteoAPI.pull_forecast                     api.OpenMeteoAPI.pull_backtest
   (OpenMeteo Ensemble API)                           (OpenMeteo past_days + NOAA CDO GHCND TMAX)
               |                                                    |
   bias/multiplier -> interp_forecasts (KDE,          backtest.back_test (KDE per day,
   mean, std, t-interval, entropy)                    best 2-degree range vs. observed)
               |                                                    |
   streamlit_app.render_non_backtest                  streamlit_app.render_backtest
```

## Implementation details
**Ingestion (`api.py`)**
- `OpenMeteoAPI` covers seven Kalshi cities, each with coordinates and the GHCND station used for settlement-style ground truth: NYC (`USW00094728`, Central Park), Miami (`USW00012839`), Chicago (`USW00014819`), Denver (`USW00093067`), Austin (`USW00013904`), Los Angeles (`USW00023174`) and Philadelphia (`USW00013771`).
- The selectable ensemble models are `gfs_seamless`, `gfs025`, `gfs05`, `ecmwf_ifs025`, `ecmwf_aifs025` and `gem_global`. The user picks any subset in the sidebar.
- The tool requests `https://ensemble-api.open-meteo.com/v1/ensemble` with `daily=temperature_2m_max` and `timezone=auto`. Live mode uses `forecast_days=3`. Backtest mode uses `forecast_days=7` plus `past_days=history`.
- **Model balancing:** models ship different numbers of members, so the code finds the smallest member count across the selected models and `random.sample`s that many members from each one. Every model then carries equal weight in the pooled ensemble.
- Members are filtered to the 2 m temperature variable and converted from °C to °F with a vectorized lambda. Live mode returns column 0 for "Today" and column 1 for "Tomorrow".
- HTTP uses `requests_cache` (1-hour expiry) and `retry_requests` (5 retries) for resilient, fast repeat queries. Both pull functions are memoized with `@st.cache_data`.

**Ground truth for backtesting (`api.py`, `pull_backtest`)**
- Observed highs come from NOAA NCEI's Climate Data Online v2 API (`datasetid=GHCND`, `datatypeid=TMAX`, `units=standard`), keyed by each city's station ID. The README calls this "NWS Climatology dailys."
- The NOAA token is read from the `NOAA` environment variable.
- Forecast rows are aligned to the observations, which are appended as the last column. Backtesting targets the "Tomorrow" forecast horizon.

**Distribution fitting (`main.py`, `interp_forecasts`)**
- Before fitting, the ensemble is linearly adjusted: multiplied by `multiplier` and shifted by `bias`. These are user-tunable correction knobs for systematic model error.
- The KDE is `scipy.stats.gaussian_kde(forecasts, bw_method=kde_factor)`. The "KDE Factor" slider runs from 0 to 2 and defaults to 1.0. With a scalar `bw_method`, SciPy uses that value directly as the bandwidth factor, scaled by the data's standard deviation.
- It also computes mean, standard deviation (ddof=1) and a Student-t interval at a confidence level set by a slider labelled "Alpha" (0–100, default 95).
- **Entropy:** `scipy.stats.entropy` over a histogram of members with ~0.05 °F bins (counts + 1e-9), shown as an uncertainty indicator alongside the forecast.

**Range probabilities (`streamlit_app.py`, `backtest.py`)**
- Kalshi ranges are modelled as integer pairs (e.g. 71–72). To estimate a range's probability, the KDE is evaluated on a 0.01 °F grid from `low − 0.5` to `high + 0.5` and integrated with `np.trapezoid`. This acts as a continuity correction for integer-reported highs:

```python
rangeL = low - 0.5; rangeR = high + 0.5
grid = np.linspace(rangeL, rangeR, int((rangeR - rangeL) / 0.01))
p = np.trapezoid(kde(grid), x=grid)
```

- In live mode, the user selects a range from a dropdown. The page shows the CI, mean/std and entropy, then prints "Trade Yes" if `p > min_prob` and "Trade No" otherwise. "Min prob" is a slider from 0 to 100, default 50, divided by 100.
- A Plotly chart overlays the KDE curve on a histogram of the ensemble members.

**Backtest loop (`backtest.py`, `back_test`)**
For each historical day, the loop:
1. applies the multiplier and bias;
2. fits the KDE;
3. enumerates the 2-degree odd-start ranges spanning the ensemble;
4. picks the range with the highest integrated probability.

If that probability exceeds `min_prob`, the day counts as an "acted" trade. It is a success when the chosen range contains the rounded observed high and a fail otherwise.

## Infrastructure & deployment
Runs locally as a Streamlit app: `pip install -r requirments.txt` and then `streamlit run main.py` (README). Backtesting also needs a NOAA CDO token in the `NOAA` environment variable. The README includes a UI screenshot dated 2025-10-06.

## Results & performance
The backtest view computes, at runtime, "Odds" (successes ÷ acted trades) and the number of acted trades for the chosen city, models, and settings. It turns that into a concrete trading rule: act only when Kalshi's implied odds are below the backtested hit rate. Because every knob (models, bandwidth, bias, multiplier, threshold, history window) feeds the same backtest, a user can calibrate the forecaster against real NOAA outcomes before using it live.

## Testing & evaluation
Evaluation is built into the product: the backtest mode replays the OpenMeteo `past_days` window ("History" slider, 0–92 days, default 7) and scores each day's top-probability range against NOAA GHCND observed TMAX, reporting hit rate and number of acted trades.

## Tech stack
- Python, NumPy, pandas, SciPy (`gaussian_kde`, `entropy`, `t.interval`)
- Streamlit (UI and `st.cache_data`) and Plotly (a histogram of members overlaid with the KDE curve)
- `openmeteo_requests` / `openmeteo_sdk` (FlatBuffers responses), `requests_cache` and `retry_requests`
- `requests` for the NOAA NCEI CDO v2 API

## Design decisions & tradeoffs
- **KDE over a parametric fit:** it can represent skewed or bimodal ensembles (e.g. GFS and ECMWF disagreeing), with a bandwidth slider to control smoothing.
- **Equal member counts per model** (`api.py`) keep a large ensemble from dominating the pooled distribution.
- **±0.5 °F continuity correction** maps a continuous density onto integer-reported highs.
- **Linear bias/multiplier** gives simple manual calibration for systematic model error.
- **Probability gating:** both modes only "act" above a confidence threshold, trading volume for hit rate.

## Next steps
- Next: integrate the Kalshi API to pull live market prices and show edge directly.
- Next: use entropy as a tunable gate in the backtest alongside minimum probability.
- Next: join forecasts to observations by date and extend to more cities and stations.
- Next: fit bias and multiplier automatically from backtest history.

## Likely questions (Q&A)
**Does it trade automatically?**
It is a decision-support tool: it shows a range probability and a "Trade Yes/No" signal, and the user places the trade. Live Kalshi price integration is a planned next step.

**Which weather models does it use?**
GFS (seamless, 0.25°, 0.5°), ECMWF IFS 0.25°, ECMWF AIFS 0.25° and GEM Global, all ensembles via OpenMeteo (`api.py`), balanced to equal weight.

**How is a range's probability computed?**
The tool integrates the Gaussian KDE with the trapezoid rule on a 0.01 °F grid from the low bound minus 0.5 to the high bound plus 0.5.

**How is the KDE bandwidth chosen?**
The user sets it with a "KDE Factor" slider (0–2, default 1.0), which is passed as SciPy's `bw_method`, and can tune it against the backtest.

**Where does ground truth come from?**
NOAA NCEI Climate Data Online GHCND daily TMAX at each city's station, which the README calls NWS climatology dailies.

**How is it evaluated?**
The built-in backtest replays up to 92 days of past ensemble forecasts and reports the hit rate of the top-probability range against NOAA observations.

**What is the entropy used for?**
It is the Shannon entropy of a fine histogram of members, displayed as an uncertainty signal next to the forecast.

## Sources
- https://github.com/utterwqlnut/kalshi-climate (2025-10-07)
- `README.md`, `main.py`, `api.py`, `backtest.py`, `streamlit_app.py`, `requirments.txt`

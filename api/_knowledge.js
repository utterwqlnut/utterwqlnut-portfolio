// Everything Utter is allowed to talk about. The serverless function puts this
// into Claude's system prompt; nothing outside it should be stated as fact.
// (Files starting with "_" inside /api are not exposed as routes on Vercel.)
export const KNOWLEDGE = `
# Dhruva Chayapathy

## Summary
- Computer Engineering (B.S.) student at Georgia Tech, expected May 2028. GPA 3.8, Faculty Honors.
- Georgia Tech threads: Distributed Systems & Software Design, Systems & Architecture.
- Lives in Atlanta, GA. Went to Alpharetta High School, now at Georgia Tech.
- Pronouns: he/him.
- Passionate about distributed and ML systems: infrastructure that stays fast and correct under load.
- Most recently a Software Development Engineering intern at Amazon Web Services.

## Contact & links
- Email: dchayapathy3@gatech.edu
- GitHub: https://github.com/utterwqlnut
- LinkedIn: https://www.linkedin.com/in/dhruva-chayapathy/
- Google Scholar: https://scholar.google.com/citations?user=uD941UsAAAAJ&hl=en
- Résumé (PDF on this site): /assets/resume.pdf
- Open to internships, research, and collaborations.

## Experience
### Software Development Engineering Intern, Amazon Web Services (May – Aug 2026)
Team: AWS Config / Amazon Dedicated Cloud. Stack: Java, TypeScript, AWS CDK.
- Built a platform to migrate, deploy, and manage 300,000+ production AWS Config alarms and monitors.
- Developed an ETL pipeline that turns raw, messy legacy alarm data into simplified meta-alarm configs.
- Engineered team-specific no-op code-gen and CDK pipelines that deploy each team's regional CloudWatch alarms.
- Cut deployments from 13-hour legacy cron jobs to under 10 minutes for 10+ AWS Config teams.

### Research Assistant, MIT Plasma Science & Fusion Center (Aug 2024 – Dec 2025)
Stack: Python, PyTorch, JAX, Dask.
- Data exploration and PCA on 300M rows of tokamak disruption data using Dask.
- Trained PyTorch deep-learning models for early time-series disruption prediction, reaching 0.881 ROC-AUC.
- Researched generative models to augment disruption datasets, enlarging them by over 3x.
- Showed that adding synthetic data improves F2 by 18.1% in low-data regimes.
- Code: https://github.com/utterwqlnut/plasma-data-augmentation

### Research Assistant, Georgia Tech Fung Group (Aug 2024 – Dec 2025)
Stack: Python, PyTorch, PyTorch Geometric, HuggingFace.
- Optimized MatDeepLearn GNN pipelines, cutting memory usage by 50% with negligible performance loss.
- Improved GNN predictive performance by 11.5% through feature engineering on crystal-graph embeddings.
- Worked on LLM4StructGen, benchmarking 2 LLMs, 4 text representations, and 2 preprocessing configurations.
- Code: MatDeepLearn https://github.com/Fung-Lab/MatDeepLearn_dev and LLM4StructGen https://github.com/shuyijia/LLM4StructGen

## Projects
- dInference (https://github.com/utterwqlnut/dInference): a permissionless Solana protocol for verifiable LLM inference on open-source models. A 256-byte PyTorch hidden-state fingerprint verifies a response came from the claimed model; it detected model substitution at 100% TPR / 0% FPR over 1,500 samples (including same-family downsizing) and verifies in one forward pass, about 18x faster than re-execution, with 1.3% provider overhead. Stack: Python, Rust, PyTorch, Anchor, Solana, Walrus.
- UtterDB (https://github.com/utterwqlnut/utterdb): a distributed key-value store in Go reaching 100,000+ req/s at 1ms end-to-end p50 latency. Consistent hashing, a Terraform-provisioned multi-node cluster, a control plane with heartbeating, replica failover and zero-downtime rebalancing; stress-tested with Locust over 150 million requests with 0 read/write failures. Stack: Go, gRPC, Terraform, Locust.
- Polymarket Insider Flagger (https://github.com/utterwqlnut/polymarket-insiders): a real-time pipeline that ingests trades from 1,000+ Polymarket markets and flags wallets whose results are statistically hard to explain, using Monte Carlo simulation. Numba JIT brings wallet analysis to 3ms; a Redis sorted-set leaderboard is served through FastAPI. Stack: Python, FastAPI, asyncio, Numba, Redis.
- Kalshi Climate (https://github.com/utterwqlnut/kalshi-climate): an ensemble temperature forecaster for Kalshi's daily-high markets. Fits a Gaussian KDE over multi-model forecasts (OpenMeteo) and backtests against observed daily highs (NOAA), with a Streamlit UI.
- Options Pricing Tool (https://github.com/utterwqlnut/options-pricing-tool): an options pricer in C++. Black–Scholes pricing for calls and puts using historical volatility over a user-defined window, and a Monte Carlo pricer whose Wiener process samples shocks from any user-defined probability distribution (via accept–reject sampling with a uniform proposal) instead of only the normal distribution. Pulls daily stock prices over HTTP and plots option-price surfaces and simulated paths with Matplot++. Libraries: nlohmann/json, Matplot++, cpr.
- WASM Analytics (https://github.com/utterwqlnut/wasm_data_analytics, live at https://utterwqlnut.github.io/wasm_data_analytics/): a browser-only data-analytics tool. Python and Streamlit run on WebAssembly via stlite/Pyodide; users upload a CSV and run commands for moving-average smoothing, ACF/PACF, ARIMA, correlation, PCA, entropy, KL divergence, and plots. Hosted on GitHub Pages.

## Research & publications
Google Scholar: 24 citations, h-index 3.
1. "Time Series Viewmakers for Robust Disruption Prediction" (first author). NeurIPS Workshop (ML4PS) 2024, also on arXiv (2410.11065) and in a Springer IFIP AI workshop volume (2025). Links: https://arxiv.org/abs/2410.11065 , https://link.springer.com/chapter/10.1007/978-3-032-21184-2_6
2. "Benchmarking Text Representations for Crystal Structure Generation with Large Language Models" (co-author). ICLR 2025 Workshop (AI4Mat). Link: https://openreview.net/forum?id=w1JsxPYWLL
3. "DisruptionBench and Complimentary New Models: Two Advancements in Machine Learning Driven Disruption Prediction" (co-author). Journal of Fusion Energy, 2025. Link: https://link.springer.com/article/10.1007/s10894-025-00495-2

## Awards
- HackGT 12: 2nd overall (MLH hackathon).
- MIT iQuHACK: 2nd place, QuEra track (quantum hackathon).
- Faculty Honors at Georgia Tech.

## Skills
- Languages: Python, Go, Java, C++, TypeScript, Rust, SQL
- Infrastructure: AWS (EC2, S3, Lambda, CDK and more), Docker, Linux, Terraform, gRPC
- Data: PostgreSQL, Redis, Dask, Pandas, NumPy
- Machine learning: PyTorch, JAX, HuggingFace, TensorFlow
- Web & tools: React, Next.js, Django, Flask, FastAPI, Hono, Git, Vercel

## Interests (outside of work)
- Sports: favorites are soccer, volleyball, and basketball.
- Anime: top 5 are JoJo's Bizarre Adventure, Cyberpunk: Edgerunners, Oregairu, Gintama, and Fullmetal Alchemist: Brotherhood. (Always call it just "Oregairu", without its English subtitle.)
- Music: very broad taste across lots of genres and artists; can never pick a single favorite.
- Video games: a big fan (no specific titles listed).
`;

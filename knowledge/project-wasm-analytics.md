---
id: project-wasm-analytics
title: WASM Analytics — in-browser data analytics with a mini command language
type: project
summary: Serverless analytics app running Python entirely in the browser via WebAssembly, with a custom composable command language for time series, stats, PCA, and plots.
tags: [webassembly, pyodide, stlite, streamlit, python, data-analytics, time-series, dsl, github-pages]
links:
  repo: https://github.com/utterwqlnut/wasm_data_analytics
---

# WASM Analytics — in-browser data analytics with a mini command language

## TL;DR
WASM Analytics ("A Blazingly Fast Data Analytics WebTool") is a Python/Streamlit analytics app that runs **entirely client-side**, with no backend. It uses stlite, which runs Streamlit on Pyodide (CPython compiled to WebAssembly). Users upload a CSV and type nested, composable commands such as `plot(smooth(line("Year","Value"),5,"Value"))`. Dhruva designed a small command language for this: a hand-written parser that turns each command into an AST, an evaluator that walks it, and a typed dispatch layer that runs it with pandas, statsmodels, scikit-learn, scipy and matplotlib. It is live as a static site on GitHub Pages: https://utterwqlnut.github.io/wasm_data_analytics/.

## Problem & motivation
The README calls it "a swiss army knife for everyday data science/analytic tools". Running Python in the browser means there is no backend server to host or scale. The uploaded CSV is processed on the user's own machine, so data stays private, and the deployment is just static files.

## Architecture
```
Browser loads index.html (GitHub Pages)
  └─ stlite mount() ── loads Pyodide (WASM) + installs matplotlib, statsmodels,
       │               numpy, scikit-learn, scipy
       └─ runs src/main.py (Streamlit UI)
            CSV upload → pandas DataFrame
            command text → parsing/parser.py (adjacency-list AST)
                         → tools/command_ast_evaluator.py (DFS)
                         → tools/command_builder.py (dispatch by name)
                         → tools/commands.py (analysis/plots) → st.markdown / st.pyplot
```

## Implementation details
- **WebAssembly layer (`index.html`):** Imports `mount` from `@stlite/browser@0.83.0` on jsDelivr. It lists the pip requirements (matplotlib, statsmodels, numpy, scikit-learn, scipy), sets `entrypoint: "src/main.py"`, and maps every Python file by URL so stlite fetches it into Pyodide's virtual filesystem. The Streamlit config sets `client.toolbarMode: "viewer"` and `server.maxUploadSize: 1028`. The WebAssembly runtime is Pyodide, via stlite; Dhruva's application code is pure Python.
- **UI (`src/main.py`):** A title, a `st.file_uploader` for the CSV, and a `st.text_input` for the command. With no command entered, it previews `df.head()` as a table. Scalar results appear as "Result: …" and plots render through `st.pyplot`. Parse and evaluation errors each surface as a plain-text message.
- **Parser (`src/parsing/parser.py`):** A character scanner that skips spaces outside double-quoted literals and splits tokens on `(`, `)`, and `,`. It adds a positional suffix to each token (e.g. `line_2`, `"Year"_4`) so repeated names get unique keys. It then uses a stack to build the AST as an adjacency list: dict from node to list of children.
- **Evaluator (`src/tools/command_ast_evaluator.py`):** A recursive DFS. Leaf nodes (literals) return themselves. Inner nodes evaluate their children first, then call `Builder.build(name, params)`.
- **Builder (`src/tools/command_builder.py`):** Strips the positional suffixes and the quotes, then dispatches with a Python `match` statement. `line`, `points`, and `dist` get the uploaded DataFrame injected when their first argument isn't already a typed object, which is what makes commands composable.
- **Types (`src/tools/types_.py`):** Thin wrapper classes `Lines`, `Points`, and `Distribution` around pandas data. Commands check which wrapper they received to decide how to behave. For example, `plot` draws a line, scatter, or histogram depending on the type.
- **Commands (`src/tools/commands.py`):**
  - Series: `line`, `smooth`/`trend` (moving average via `np.convolve(..., mode='same')`), `seasonal` (series minus moving average), `acf`/`pacf` (statsmodels), `forecast` (statsmodels ARIMA(p,d,q)).
  - Points: `points`, `correlation` (Pearson r from `scipy.stats.linregress`), `pca` (StandardScaler then sklearn PCA).
  - Distributions: `dist`, `entropy` (histogram, then `scipy.stats.entropy`), `kl_divergence` (both samples binned on A's bin edges, with 1e-9 added to avoid log 0), `mean`, `std`.
  - `plot`: line, scatter, or histogram. Lines and points take two columns. Distributions take a bin count.
  - Column selectors coerce values with `pd.to_numeric(errors="coerce")` and drop NaNs, so messy CSVs still load cleanly.

## Infrastructure & deployment
Zero-build deployment: GitHub Pages serves the `main` branch root (legacy Pages build, per the GitHub API), and a `.nojekyll` file makes Pages serve the files as-is. The live URL serves `index.html` with `src/main.py` next to it. All Python runs in the visitor's browser, so hosting cost is effectively that of static files.

## Results & performance
- Fully serverless: the live site runs the complete Python data stack (pandas, statsmodels, scikit-learn, scipy, matplotlib) in the browser.
- After the one-time Pyodide and package load on first visit, every command runs locally with no backend round-trip.
- The core language machinery is compact: the parser is about 60 lines and the evaluator about 20.

## Testing & evaluation
The app is its own test harness: the live deployment runs the full parse → evaluate → render pipeline on any uploaded CSV, with parse and evaluation errors surfaced separately in the UI. The parser module also includes a built-in sample `parse(...)` invocation for quick manual checks of the AST.

## Tech stack
- Python 3.10+ (`match` statement), Streamlit, pandas
- stlite `@stlite/browser` 0.83.0, Pyodide (WebAssembly)
- statsmodels, scikit-learn, scipy, numpy, matplotlib
- GitHub Pages (static hosting)

## Design decisions & tradeoffs
- **Client-side Python via stlite** instead of a hosted Streamlit server. The app needs no hosting beyond static files and keeps data on the user's machine, in exchange for a heavier first load.
- **A custom command language** instead of widgets. Commands compose (e.g. `plot(pca(points(...),2,...))`), and the parser and evaluator stay small (about 60 and 20 lines).
- **Typed wrappers** (`Lines`/`Points`/`Distribution`) let a single `plot` or `line` command behave differently depending on its input type, keeping the command vocabulary small.

## Next steps
- Next: extend the tokenizer to accept unquoted trailing numeric arguments.
- Next: make the ACF/PACF lag axis follow `nlags` and harden the ARIMA `forecast` and `mean`/`std` commands.
- Next: add a parser and evaluator test suite.
- Next: benchmark first-load and per-command latency to quantify the in-browser speed.

## Likely questions (Q&A)
- **How does it use WebAssembly?** Through stlite, which runs Streamlit on Pyodide (CPython compiled to WASM). That lets Dhruva ship a full Python data stack to the browser with no server.
- **Is there a server?** No. It's static files on GitHub Pages, and the Python runs in the browser.
- **How is data loaded?** The user uploads a CSV with Streamlit's file uploader, and pandas reads it with `pd.read_csv`. The data never leaves the user's machine.
- **What analyses are available?** Moving-average smoothing/trend, seasonal residual, ACF/PACF, ARIMA forecast, Pearson correlation, PCA, entropy, KL divergence, mean/std, and line/scatter/histogram plots.
- **How are commands parsed?** A hand-written tokenizer plus a stack builds an adjacency-list AST, a recursive DFS evaluates it, and a `match` statement dispatches each command.
- **Example command?** `plot(smooth(line("Year","Value"),5,"Value"))`
- **Why is it fast?** After the initial Pyodide load, every command executes locally in the browser with no network round-trip.
- **How is it deployed?** GitHub Pages serves the `main` branch root, with `.nojekyll` and no build step.

## Sources
- Repo files: `README.md`, `index.html`, `.nojekyll`, `src/main.py`, `src/parsing/parser.py`, `src/tools/command_ast_evaluator.py`, `src/tools/command_builder.py`, `src/tools/commands.py`, `src/tools/types_.py`
- GitHub API: repo metadata and Pages config (legacy build, `main` branch, `/`)
- Live page: https://utterwqlnut.github.io/wasm_data_analytics/

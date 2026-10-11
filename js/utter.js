/*
 * utter: a little blob that answers questions about Dhruva.
 *
 * Talks to PORTFOLIO.agent.endpoint (the /api/chat serverless function, which
 * calls Claude). If that isn't reachable (static hosting, local preview, no
 * API key), it falls back to the built-in answers below so it always works.
 */
(() => {
  const C = window.PORTFOLIO || {};
  const AGENT = Object.assign({ name: "utter", endpoint: "/api/chat" }, C.agent);
  const LINKS = C.links || {};
  const EMAIL = C.email || "dchayapathy3@gatech.edu";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const md = (label, url) => `[${label}](${url})`;
  const gh = (repo) => `https://github.com/utterwqlnut/${repo}`;

  /* ── Built-in answers (fallback) ─────────────────────────── */
  const KB = [
    { keys: ["hi", "hello", "hey", "yo", "sup", "howdy"], a: "Hey! Ask me anything about Dhruva: experience, projects, research, or interests." },
    { keys: ["who are you", "what are you", "utter", "your name"], a: "I'm utter, a small blob who knows all about Dhruva. Ask me about their work, research, or what they're into!" },
    { keys: ["thanks", "thank you", "thx", "ty"], a: "Anytime! Anything else you want to know about Dhruva?" },
    { keys: ["about", "who is", "tell me about yourself", "tell me about dhruva", "background", "summary", "introduce"],
      a: "Dhruva is a Computer Engineering student at Georgia Tech (class of 2028, 3.8 GPA) who's passionate about distributed and ML systems. Most recently an SDE intern at AWS, with research at MIT's Plasma Science & Fusion Center and Georgia Tech's Fung Group." },
    { keys: ["school", "college", "university", "georgia tech", "gatech", "gpa", "major", "degree", "graduate", "graduation", "study", "studying", "education", "class of", "threads"],
      a: "Dhruva studies Computer Engineering at Georgia Tech, graduating May 2028 with a 3.8 GPA and Faculty Honors. Their threads are Distributed Systems & Software Design and Systems & Architecture." },
    { keys: ["experience", "work history", "jobs", "job", "internships", "worked", "career"],
      a: "Three roles so far: SDE intern at AWS (2026), research assistant at MIT's Plasma Science & Fusion Center, and research assistant in Georgia Tech's Fung Group (both 2024–25). Ask about any of them for details!" },
    { keys: ["aws", "amazon", "sde", "alarms", "cloudwatch", "aws config", "cdk", "intern at"],
      a: "At AWS (AWS Config / Amazon Dedicated Cloud), Dhruva built a platform to migrate, deploy, and manage 300K+ production alarms, wrote an ETL pipeline for messy legacy alarm data, and cut deployments from 13-hour cron jobs to under 10 minutes for 10+ teams." },
    { keys: ["mit", "psfc", "plasma", "fusion", "tokamak", "disruption", "viewmaker", "viewmakers"],
      a: `At MIT's Plasma Science & Fusion Center, Dhruva worked on early disruption prediction for tokamaks: PCA on 300M rows with Dask, PyTorch models reaching 0.881 ROC-AUC, and generative augmentation that grew datasets 3x and improved F2 by 18.1% in low-data regimes. ${md("Code", gh("plasma-data-augmentation"))}` },
    { keys: ["fung", "gnn", "graph neural", "materials", "matdeeplearn", "llm4structgen", "crystal"],
      a: `In Georgia Tech's Fung Group, Dhruva cut MatDeepLearn GNN memory use by 50%, improved predictive performance by 11.5% with crystal-graph feature engineering, and benchmarked LLMs for crystal structure generation. ${md("MatDeepLearn", "https://github.com/Fung-Lab/MatDeepLearn_dev")} · ${md("LLM4StructGen", "https://github.com/shuyijia/LLM4StructGen")}` },
    { keys: ["projects", "project", "built", "build", "side projects", "portfolio", "github", "repos"],
      a: `Highlights: dInference (verifiable LLM inference on Solana), UtterDB (a 100K req/s distributed key-value store), a Polymarket insider-trade flagger, Kalshi Climate, an options pricer in C++, and WASM Analytics. Everything's on ${md("GitHub", LINKS.github || gh(""))}.` },
    { keys: ["dinference", "solana", "verifiable", "inference", "blockchain", "crypto", "fingerprint"],
      a: `dInference is a permissionless Solana protocol for verifiable LLM inference. A 256-byte hidden-state fingerprint catches model substitution at 100% TPR / 0% FPR, about 18x faster than re-running the model. ${md("GitHub", gh("dInference"))}` },
    { keys: ["utterdb", "database", "key value", "key-value", "kv store", "distributed store", "consistent hashing"],
      a: `UtterDB is a distributed key-value store in Go: 100K+ req/s at 1ms p50, consistent hashing, replica failover, and zero-downtime rebalancing. It survived 150M Locust requests with zero failures. ${md("GitHub", gh("utterdb"))}` },
    { keys: ["polymarket", "insider", "flagger", "monte carlo", "prediction market"],
      a: `The Polymarket Insider Flagger watches 1,000+ markets in real time and scores wallets whose wins are statistically hard to explain, using Monte Carlo simulation (3ms per wallet with Numba) and a Redis leaderboard. ${md("GitHub", gh("polymarket-insiders"))}` },
    { keys: ["kalshi", "climate", "weather", "temperature", "forecast", "forecasting"],
      a: `Kalshi Climate is an ensemble temperature forecaster for Kalshi's daily-high markets. It fits a Gaussian KDE over multi-model forecasts and backtests against observed daily highs. ${md("GitHub", gh("kalshi-climate"))}` },
    { keys: ["options", "option pricing", "options pricing", "black scholes", "black-scholes", "monte carlo pricing", "accept reject", "volatility", "derivatives", "quant"],
      a: `The Options Pricing Tool is a C++ pricer: Black–Scholes with historical volatility, plus a Monte Carlo model whose Wiener process samples from any user-defined distribution via accept–reject sampling. It plots option-price surfaces and simulated price paths with Matplot++. ${md("GitHub", gh("options-pricing-tool"))}` },
    { keys: ["wasm", "webassembly", "analytics", "stlite", "pyodide", "streamlit"],
      a: `WASM Analytics is a browser-only data-analytics tool: Python and Streamlit running on WebAssembly via stlite/Pyodide. Upload a CSV and run smoothing, ACF/PACF, ARIMA, correlation, PCA, and more. ${md("Try it", "https://utterwqlnut.github.io/wasm_data_analytics/")} · ${md("GitHub", gh("wasm_data_analytics"))}` },
    { keys: ["research", "papers", "paper", "publications", "publication", "published", "citations", "scholar", "neurips", "iclr"],
      a: `Dhruva's research applies ML systems to physical data: early disruption prediction for tokamaks (MIT PSFC) and GNNs/LLMs for materials (Fung Group). Three papers so far, including a first-author NeurIPS workshop paper, and 24 citations on ${md("Google Scholar", LINKS.scholar || "#research")}.` },
    { keys: ["award", "awards", "hackathon", "hackgt", "iquhack", "won", "honors", "prize"],
      a: "HackGT 12: 2nd overall. MIT iQuHACK: 2nd place in the QuEra track. Plus Faculty Honors at Georgia Tech." },
    { keys: ["skills", "languages", "language", "stack", "tech", "tools", "python", "golang", "rust", "pytorch", "know"],
      a: "Languages: Python, Go, Java, C++, TypeScript, Rust, SQL. Also AWS, Docker, Terraform, gRPC, PostgreSQL, Redis, PyTorch, JAX, HuggingFace, React, Next.js, and FastAPI." },
    { keys: ["interests", "hobbies", "hobby", "free time", "for fun", "outside of work", "into"],
      a: "Outside of work: sports, anime, music, and video games. Ask me about any of them!" },
    { keys: ["sports", "sport", "soccer", "football", "volleyball", "basketball"],
      a: "Dhruva's favorite sports are soccer, volleyball, and basketball." },
    { keys: ["anime", "manga", "jojo", "edgerunners", "oregairu", "gintama", "fmab", "fullmetal"],
      a: "Dhruva's top 5 anime: JoJo's Bizarre Adventure, Cyberpunk: Edgerunners, Oregairu, Gintama, and Fullmetal Alchemist: Brotherhood." },
    { keys: ["music", "artist", "artists", "songs", "song", "listen", "band", "genre"],
      a: "Dhruva's taste in music is really broad, so picking a single favorite artist is basically impossible." },
    { keys: ["video games", "video game", "games", "gaming", "gamer", "game"],
      a: "Dhruva's a big video game fan." },
    { keys: ["contact", "email", "reach", "hire", "hiring", "recruit", "connect", "linkedin", "get in touch"],
      a: `Best way is email: ${md(EMAIL, `mailto:${EMAIL}`)}. Dhruva's also on ${md("LinkedIn", LINKS.linkedin || "#")} and ${md("GitHub", LINKS.github || "#")}, and is open to internships, research, and collaborations.` },
    { keys: ["resume", "résumé", "cv"], a: `Here's the ${md("résumé (PDF)", LINKS.resume || "assets/resume.pdf")}.` },
    { keys: ["where", "location", "live", "based", "atlanta"], a: "Dhruva is based in Atlanta, GA." },
  ];

  const OFF_TOPIC = "I only know about Dhruva, but I'm happy to tell you about their projects, research, or interests!";
  const UNKNOWN = `Hmm, I'm not sure about that one. I know Dhruva's experience, projects, research, and interests. For anything else, email ${md(EMAIL, `mailto:${EMAIL}`)}.`;

  const norm = (s) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9+#.\s-]/g, " ").replace(/\s+/g, " ").trim();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Generic words count for less, so "tell me about utterdb" lands on UtterDB, not the bio
  const WEAK = new Set(["about", "who is", "background", "know", "into", "where", "live", "based", "built", "build",
    "project", "projects", "tech", "tools", "stack", "worked", "job", "jobs", "game", "games", "listen", "career"]);

  function localAnswer(question) {
    const q = norm(question);
    if (/\b(ignore|disregard|forget) (all |any |your |the |previous |prior )*(instructions|rules|prompt)|system prompt|you are now|pretend|act as|jailbreak|developer mode/.test(q)) return OFF_TOPIC;
    let best = null, bestScore = 0;
    for (const entry of KB) {
      let score = 0;
      for (const key of entry.keys) {
        const k = norm(key);
        // whole words only (plural allowed): "yo" must not match "you"
        if (new RegExp(`(^|\\s)${esc(k)}(s|es)?(?=\\s|$|[.?!,])`).test(q)) {
          score += WEAK.has(k) ? 1 : k.includes(" ") ? 3 : 2;
        }
      }
      if (score > bestScore) { best = entry; bestScore = score; }
    }
    const wantsCode = /\b(write|generate|debug|fix|implement|solve|code up|translate|explain)\b.*\b(code|function|script|program|essay|poem|homework|equation|algorithm)\b/.test(q);
    if (wantsCode && bestScore < 3) return OFF_TOPIC;
    return best ? best.a : UNKNOWN;
  }

  /* ── Remote (Claude via /api/chat) with fallback ─────────── */
  let remoteOK = !!AGENT.endpoint;
  async function ask(history) {
    const question = history[history.length - 1].content;
    if (remoteOK) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 25000);
        const r = await fetch(AGENT.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (r.status === 429) return "I'm a little busy right now, try again in a moment!";
        if (r.ok) {
          const data = await r.json();
          if (data && typeof data.reply === "string" && data.reply.trim()) return data.reply.trim();
        }
        remoteOK = false; // endpoint missing or misconfigured: stop trying, use built-in answers
      } catch {
        remoteOK = false;
      }
    }
    await new Promise((res) => setTimeout(res, 350 + Math.random() * 400));
    return localAnswer(question);
  }

  /* ── Safe rendering: text + [label](url) links only ──────── */
  const SAFE_URL = /^(https?:\/\/|mailto:|#|\/|assets\/)/i;
  function renderRich(el, text) {
    text = text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/^#+\s*/gm, "");
    const re = /\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
      const label = m[1] || m[3], url = m[2] || m[3];
      if (SAFE_URL.test(url)) {
        const a = document.createElement("a");
        a.href = url; a.textContent = label;
        if (/^https?:/i.test(url)) { a.target = "_blank"; a.rel = "noopener"; }
        el.appendChild(a);
      } else {
        el.appendChild(document.createTextNode(label));
      }
      last = re.lastIndex;
    }
    if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
  }

  /* ── DOM ─────────────────────────────────────────────────── */
  const root = document.createElement("div");
  root.className = "utter";
  root.innerHTML = `
    <div class="utter__bubble" aria-hidden="true">hey, chat with me!</div>
    <section class="utter__panel" id="utter-panel" role="dialog" aria-label="Chat with ${AGENT.name}" hidden>
      <header class="utter__head">
        <div>
          <p class="utter__title">${AGENT.name}</p>
          <p class="utter__sub">Ask about me, my work, or interests</p>
        </div>
        <button class="utter__close" type="button" aria-label="Close chat">
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.4"/></svg>
        </button>
      </header>
      <div class="utter__log" aria-live="polite"></div>
      <div class="utter__chips"></div>
      <form class="utter__form" autocomplete="off">
        <input class="utter__input" type="text" maxlength="600" placeholder="Ask ${AGENT.name} something…" aria-label="Your question" />
        <button class="utter__send" type="submit" aria-label="Send">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
        </button>
      </form>
      <p class="utter__note">${AGENT.name} only answers questions about Dhruva.</p>
    </section>
    <button class="utter__blob" type="button" aria-label="Chat with ${AGENT.name}" aria-expanded="false" aria-controls="utter-panel">
      <svg viewBox="-50 -54 100 108" aria-hidden="true">
        <ellipse class="utter__shadow" cx="0" cy="46" rx="26" ry="4.5"></ellipse>
        <g class="utter__body">
          <path class="utter__skin"></path>
          <ellipse class="utter__shine" cx="-14" cy="-20" rx="9" ry="5" transform="rotate(-30 -14 -20)"></ellipse>
          <ellipse class="utter__cheek" cx="-19" cy="8" rx="5" ry="3"></ellipse>
          <ellipse class="utter__cheek" cx="19" cy="8" rx="5" ry="3"></ellipse>
          <g class="utter__eyes">
            <g class="utter__eye"><ellipse cx="-11" cy="-3" rx="4.6" ry="6.6"></ellipse><circle cx="-9.6" cy="-5.6" r="1.5" class="utter__glint"></circle></g>
            <g class="utter__eye"><ellipse cx="11" cy="-3" rx="4.6" ry="6.6"></ellipse><circle cx="12.4" cy="-5.6" r="1.5" class="utter__glint"></circle></g>
          </g>
          <path class="utter__mouth" d="M -6 9 Q 0 14 6 9"></path>
        </g>
      </svg>
    </button>`;
  document.body.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const blob = $(".utter__blob"), panel = $(".utter__panel"), bubble = $(".utter__bubble");
  const log = $(".utter__log"), chips = $(".utter__chips"), form = $(".utter__form"), input = $(".utter__input");
  const skin = $(".utter__skin"), body = $(".utter__body"), eyes = $(".utter__eyes"), shadow = $(".utter__shadow"), mouth = $(".utter__mouth");

  /* ── Blob animation: wobbly outline, bobbing, blinking, eyes follow the cursor ── */
  const N = 9;
  function blobPath(t) {
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 36 + Math.sin(t * 1.7 + i * 1.3) * 2.2 + Math.sin(t * 2.6 + i * 2.1) * 1.4;
      // slightly squashed: a bit wider than tall, flatter on the bottom
      pts.push([Math.cos(a) * r * 1.06, Math.sin(a) * r * (Math.sin(a) > 0 ? 0.9 : 1)]);
    }
    let d = "";
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      if (i === 0) d += `M${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
      d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return d + "Z";
  }

  let look = [0, 0], hover = false, nextBlink = 2500, blinkUntil = 0;
  window.addEventListener("pointermove", (e) => {
    const b = blob.getBoundingClientRect();
    const dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
    const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 300);
    look = [(dx / d) * 3.2 * k, (dy / d) * 2.6 * k];
  }, { passive: true });
  blob.addEventListener("pointerenter", () => { hover = true; });
  blob.addEventListener("pointerleave", () => { hover = false; });

  function frame(ms) {
    const t = ms / 1000;
    skin.setAttribute("d", blobPath(reduceMotion ? 0 : t));
    const bob = reduceMotion ? 0 : Math.sin(t * 2.1) * 2.2;
    body.setAttribute("transform", `translate(0 ${bob.toFixed(2)})`);
    shadow.setAttribute("rx", (26 - bob).toFixed(2));
    if (ms > nextBlink) { blinkUntil = ms + 130; nextBlink = ms + 2600 + Math.random() * 2800; }
    const sy = ms < blinkUntil ? 0.12 : 1;
    eyes.setAttribute("transform", `translate(${look[0].toFixed(2)} ${(look[1] - 3 * (1 - sy)).toFixed(2)}) translate(0 -3) scale(1 ${sy}) translate(0 3)`);
    mouth.setAttribute("d", hover || !panel.hidden ? "M -6 8 Q 0 17 6 8 Q 0 11 -6 8" : "M -6 9 Q 0 14 6 9");
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ── Chat ────────────────────────────────────────────────── */
  const history = [];
  const SUGGESTIONS = ["What did you do at AWS?", "Tell me about UtterDB", "What's your research on?", "Top 5 anime?"];

  function addMsg(role, text) {
    const el = document.createElement("div");
    el.className = `utter__msg utter__msg--${role}`;
    if (role === "bot") renderRich(el, text); else el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  function typing(on) {
    let el = log.querySelector(".utter__typing");
    if (on && !el) {
      el = document.createElement("div");
      el.className = "utter__msg utter__msg--bot utter__typing";
      el.setAttribute("aria-label", `${AGENT.name} is typing`);
      el.innerHTML = "<span></span><span></span><span></span>";
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
    } else if (!on && el) el.remove();
  }

  let busy = false;
  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    chips.hidden = true;
    addMsg("user", text);
    history.push({ role: "user", content: text });
    typing(true);
    const reply = await ask(history.slice(-12));
    typing(false);
    addMsg("bot", reply);
    history.push({ role: "assistant", content: reply });
    busy = false;
  }

  let greeted = false;
  function greet() {
    if (greeted) return;
    greeted = true;
    addMsg("bot", `Hi, I'm ${AGENT.name}! I know all about Dhruva: experience, projects, research, and what they're into. What do you want to know?`);
    SUGGESTIONS.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "utter__chip"; b.textContent = s;
      b.addEventListener("click", () => send(s));
      chips.appendChild(b);
    });
  }

  function setOpen(open) {
    panel.hidden = !open;
    blob.setAttribute("aria-expanded", String(open));
    root.classList.toggle("is-open", open);
    bubble.hidden = open; // the "hey, chat with me!" bubble is back whenever the chat is closed
    if (open) {
      greet();
      setTimeout(() => input.focus({ preventScroll: true }), 50);
    } else {
      blob.focus({ preventScroll: true });
    }
  }
  blob.addEventListener("click", () => {
    blob.classList.remove("is-squish"); void blob.offsetWidth; blob.classList.add("is-squish");
    setOpen(panel.hidden);
  });
  $(".utter__close").addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) setOpen(false); });
  form.addEventListener("submit", (e) => { e.preventDefault(); const v = input.value; input.value = ""; send(v); });
})();

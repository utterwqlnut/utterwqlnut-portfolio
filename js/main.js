(() => {
  const C = window.PORTFOLIO || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const get = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), C);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Fill content from config.js ─────────────────────────── */
  $$("[data-bind]").forEach((el) => {
    const v = get(el.dataset.bind);
    if (v != null) el.textContent = v;
  });
  $$("[data-href]").forEach((el) => {
    const v = get(el.dataset.href);
    if (v == null) return;
    el.href = el.hasAttribute("data-mailto") ? `mailto:${v}` : v;
  });
  const initials = C.initials || (C.name || "Y N").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  $$("[data-initials]").forEach((el) => (el.textContent = initials));
  if (C.name) document.title = `${C.name} — ${C.role || "Portfolio"}`;

  /* ── Publications (from config) ──────────────────────────── */
  const pubList = $("[data-pubs]");
  if (pubList) {
    (C.publications || []).forEach((p) => {
      const li = document.createElement("li");
      li.className = "pub";
      const main = document.createElement("div");
      const venue = document.createElement("p");
      venue.className = "pub__venue eyebrow";
      venue.textContent = [p.venue, p.year].filter(Boolean).join(" · ");
      const links = p.links || [];
      const title = document.createElement(links.length ? "a" : "p");
      title.className = "pub__title";
      title.textContent = p.title || p.venue;
      if (links.length) { title.href = links[0].url; title.target = "_blank"; title.rel = "noopener"; }
      main.append(venue, title);
      if (links.length > 1) {
        const row = document.createElement("p");
        row.className = "pub__links";
        links.forEach((l) => {
          const a = document.createElement("a");
          a.href = l.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = l.label;
          row.appendChild(a);
        });
        main.appendChild(row);
      }
      const role = document.createElement("p");
      role.className = "pub__role" + (/first/i.test(p.role) ? " pub__role--first" : "");
      role.textContent = p.role;
      li.append(main, role);
      pubList.appendChild(li);
    });
  }

  /* ── Toolkit (from config) ───────────────────────────────── */
  const stack = $("[data-stack]");
  if (stack) {
    const LABELS = { languages: "Languages", infra: "Infrastructure", data: "Data", ml: "Machine learning", web: "Web" };
    Object.entries(C.skills || {}).forEach(([k, items]) => {
      const col = document.createElement("div");
      const h = document.createElement("h3");
      h.textContent = LABELS[k] || k;
      const ul = document.createElement("ul");
      ul.className = "checks";
      items.forEach((it) => { const li = document.createElement("li"); li.textContent = it; ul.appendChild(li); });
      col.append(h, ul);
      stack.appendChild(col);
    });
  }

  /* ── Pixel icons (11×11 bitmaps) ─────────────────────────── */
  const PIXELS = {
    window: [
      "11111111111", "10000000001", "11111111111", "10000000001", "10100000001",
      "10010001001", "10100011101", "10000001001", "10000000001", "11111111111", "00000000000",
    ],
    eye: [
      "00100100100", "00010101000", "00000000000", "00111111100", "01100100110",
      "11001110011", "01100100110", "00111111100", "00000000000", "00000000000", "00000000000",
    ],
    doc: [
      "01111110000", "01000011000", "01000010100", "01011011110", "01000000010",
      "01011111010", "01000000010", "01011110010", "01000000010", "01111111110", "00000000000",
    ],
    globe: [
      "00011111000", "00110101100", "01100100110", "11111111111", "10000100001",
      "10000100001", "10000100001", "11111111111", "01100100110", "00110101100", "00011111000",
    ],
    spark: [
      "00000100000", "00000100000", "00001110000", "00001110000", "11111111111",
      "00111111100", "00011111000", "00110001100", "00100000100", "01000000010", "00000000000",
    ],
    bolt: [
      "00000011110", "00000111100", "00001111000", "00011110000", "00111111110",
      "01111111100", "00000111000", "00001110000", "00011100000", "00111000000", "00100000000",
    ],
  };
  $$("[data-pixel]").forEach((el) => {
    const rows = PIXELS[el.dataset.pixel];
    if (!rows) return;
    let rects = "";
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === "1") rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }));
    el.innerHTML = `<svg viewBox="0 0 11 11" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`;
  });

  /* ── Fit giant watermark text to its container ───────────── */
  const fitEls = $$("[data-fit]");
  const fit = () => fitEls.forEach((el) => {
    const host = el.closest(".wrap") || el.parentElement;
    const cs = getComputedStyle(host);
    const inner = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const target = Math.min(inner, 1080) * parseFloat(el.dataset.fit || "1");
    el.style.fontSize = "100px";
    const range = document.createRange();
    range.selectNodeContents(el);
    const w = range.getBoundingClientRect().width || 1;
    el.style.fontSize = `${Math.min(420, (100 * target) / w)}px`;
  });
  fit();
  (document.fonts?.ready || Promise.resolve()).then(fit);
  window.addEventListener("resize", fit);

  /* ── Load-in ─────────────────────────────────────────────── */
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add("is-loaded")));

  /* ── Resume dropdown ─────────────────────────────────────── */
  $$("[data-dropdown]").forEach((dd) => {
    const btn = $("button", dd);
    const set = (open) => {
      dd.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
    };
    btn.addEventListener("click", (e) => { e.stopPropagation(); set(!dd.classList.contains("is-open")); });
    document.addEventListener("click", (e) => { if (!dd.contains(e.target)) set(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
  });

  /* ── Mobile menu ─────────────────────────────────────────── */
  const burger = $("[data-burger]");
  const menu = $("[data-mobile-menu]");
  if (burger && menu) {
    const set = (open) => {
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      menu.hidden = !open;
    };
    burger.addEventListener("click", () => set(menu.hidden));
    $$("a", menu).forEach((a) => a.addEventListener("click", () => set(false)));
  }

  /* ── Sticky bar after the hero ───────────────────────────── */
  const sticky = $("[data-sticky]");
  const hero = $(".hero");
  if (sticky && hero) {
    new IntersectionObserver(([e]) => {
      const show = !e.isIntersecting && e.boundingClientRect.top < 0;
      sticky.classList.toggle("is-visible", show);
      sticky.setAttribute("aria-hidden", String(!show));
      $$("a", sticky).forEach((a) => (a.tabIndex = show ? 0 : -1));
    }, { threshold: 0 }).observe(hero);
  }

  /* ── Scroll reveal ───────────────────────────────────────── */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("is-in"); revealIO.unobserve(e.target); }
    });
  }, { rootMargin: "0px 0px -8% 0px" });
  $$("[data-reveal]").forEach((el) => revealIO.observe(el));

  /* ── Accordion ───────────────────────────────────────────── */
  $$("[data-accordion] .acc").forEach((item) => {
    const q = $(".acc__q", item);
    const a = $(".acc__a", item);
    q.addEventListener("click", () => {
      const open = q.getAttribute("aria-expanded") === "true";
      q.setAttribute("aria-expanded", String(!open));
      if (reduceMotion) { a.hidden = open; return; }
      if (!open) {
        a.hidden = false;
        const h = a.scrollHeight;
        a.animate([{ height: "0px", opacity: 0 }, { height: `${h}px`, opacity: 1 }], { duration: 380, easing: "cubic-bezier(.2,.7,.1,1)" });
      } else {
        const h = a.scrollHeight;
        const anim = a.animate([{ height: `${h}px`, opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 300, easing: "cubic-bezier(.2,.7,.1,1)" });
        anim.onfinish = () => (a.hidden = true);
      }
    });
  });

})();

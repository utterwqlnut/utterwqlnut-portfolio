/*
 * Generative "engraving" art.
 *
 * Every <canvas class="art" data-art="scene"> is drawn in grayscale by a
 * scene function, then error-diffusion dithered into a 4-tone blue palette.
 * That is what gives the site its printed / halftone look without shipping
 * any image files.
 *
 * Attributes:
 *   data-art      scene name (see SCENES below) or "image"
 *   data-src      image URL when data-art="image" (your own screenshots)
 *   data-seed     integer, changes the composition
 *   data-palette  deep | blue | mid
 *   data-cell     CSS pixels per dithered dot (default 2)
 *   data-animate  always | visible | hover   (omit for static)
 *   data-text     text for the "type" scene
 */
(() => {
  const TAU = Math.PI * 2;

  const PALETTES = {
    deep: ["#0000f2", "#2525f4", "#7272f8", "#efefff"],
    blue: ["#0000dc", "#2a2af3", "#7676f9", "#f2f2ff"],
    mid: ["#3d3df5", "#5858f7", "#8484f9", "#d6d6fd"],
  };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const PAL_RGB = Object.fromEntries(
    Object.entries(PALETTES).map(([k, v]) => [k, v.map(hex)])
  );

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── seeded randomness + value noise ─────────────────────── */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeNoise(seed) {
    const r = mulberry32(seed * 9973 + 1);
    const perm = new Uint8Array(512);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const val = new Float32Array(256).map(() => r());
    const fade = (t) => t * t * (3 - 2 * t);
    const lerp = (a, b, t) => a + (b - a) * t;
    const h = (x, y) => val[perm[(perm[x & 255] + y) & 255]];

    function noise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = fade(xf), v = fade(yf);
      return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
    }
    function fbm(x, y, oct = 4) {
      let s = 0, a = 0.5, f = 1, n = 0;
      for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); n += a; a *= 0.5; f *= 2.02; }
      return s / n;
    }
    return { noise, fbm };
  }

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  /* ── helpers available to scenes ─────────────────────────── */
  function pixelPass(ctx, W, H, fn) {
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i += 4) {
        const v = fn(x, y, d[i] / 255);
        if (v === undefined) continue;
        const c = clamp01(v) * 255;
        d[i] = d[i + 1] = d[i + 2] = c;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function hatch(ctx, x, y, w, h, gap, lum) {
    ctx.fillStyle = `rgb(${lum * 255},${lum * 255},${lum * 255})`;
    for (let yy = y; yy < y + h; yy += gap) ctx.fillRect(x, Math.round(yy), w, 1);
  }

  /* ── scenes ──────────────────────────────────────────────── */
  const SCENES = {
    // A sun/orb behind a hatched plate, with radiating rays and fanned bundles of line
    sunburst(ctx, W, H, o) {
      const { rand, t } = o;
      const m = Math.min(W, H), cx = W / 2, cy = H * 0.5;

      const plate = m * 0.64;
      hatch(ctx, cx - plate / 2, cy - plate / 2, plate, plate, 3, 0.26);

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.55);
      g.addColorStop(0, "rgba(255,255,255,.5)");
      g.addColorStop(0.4, "rgba(255,255,255,.14)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // rays
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      const N = 150;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU + t * 0.04;
        const r0 = m * 0.2, r1 = m * (0.4 + 0.08 * rand());
        ctx.globalAlpha = 0.55 + 0.45 * rand();
        line(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }

      // bundles of lines that fan from points near the orb out past the frame
      const B = 6 + Math.floor(rand() * 3);
      for (let k = 0; k < B; k++) {
        const A = (k / B) * TAU + rand() * 0.6 + Math.sin(t * 0.4 + k) * 0.04;
        const ax = cx + Math.cos(A) * m * 0.22, ay = cy + Math.sin(A) * m * 0.22;
        const spread = 0.25 + rand() * 0.3;
        const n = 12 + Math.floor(rand() * 10);
        ctx.lineWidth = 0.8;
        for (let j = 0; j < n; j++) {
          const b = A + (j / (n - 1) - 0.5) * spread + Math.sin(t * 0.7 + j + k) * 0.01;
          const R = m * (0.7 + rand() * 0.5);
          ctx.globalAlpha = 0.5 + rand() * 0.5;
          line(ctx, ax, ay, cx + Math.cos(b) * R, cy + Math.sin(b) * R);
        }
        // the "knot" where a bundle is gathered
        ctx.globalAlpha = 1; ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(ax, ay, m * 0.018, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // dashed ring
      ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,.6)";
      ctx.beginPath(); ctx.arc(cx, cy, m * 0.31, t * 0.1, t * 0.1 + TAU); ctx.stroke();
      ctx.setLineDash([]);

      // orb
      const R = m * 0.16;
      const og = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx, cy, R);
      og.addColorStop(0, "#fff"); og.addColorStop(0.55, "#bbb"); og.addColorStop(1, "#333");
      ctx.fillStyle = og; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.save(); ctx.clip();
      for (let i = 0; i < 46; i++) {
        const a = rand() * TAU, d = Math.sqrt(rand()) * R * 0.95;
        const rr = R * (0.03 + rand() * 0.11);
        ctx.fillStyle = `rgba(0,0,0,${0.15 + rand() * 0.25})`;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 0.7; ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.07, 0, TAU); ctx.stroke();
    },

    // Wide banner: a ringed planet over a starfield
    planet(ctx, W, H, o) {
      const { rand, t, fbm } = o;
      for (let i = 0; i < W * H * 0.004; i++) {
        const l = 0.3 + rand() * 0.7;
        ctx.fillStyle = `rgba(255,255,255,${l})`;
        const s = rand() < 0.08 ? 2 : 1;
        ctx.fillRect(rand() * W, rand() * H, s, s);
      }
      // a few sparkle crosses
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const x = rand() * W, y = rand() * H, s = 3 + rand() * 6;
        line(ctx, x - s, y, x + s, y); line(ctx, x, y - s, x, y + s);
      }

      const cx = W * 0.42, cy = H * 0.56, R = H * 0.34;
      const tilt = -0.22, rx = R * 2.3, ry = R * 0.42;

      const ring = (front) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt);
        for (let k = 0; k < 14; k++) {
          const s = 1 + k * 0.035;
          ctx.globalAlpha = k % 4 === 3 ? 0.25 : 0.8;
          ctx.lineWidth = k % 5 === 0 ? 1.5 : 0.8;
          ctx.beginPath();
          ctx.ellipse(0, 0, rx * s * 0.78, ry * s * 0.78, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
          ctx.stroke();
        }
        ctx.restore(); ctx.globalAlpha = 1;
      };
      ring(false);

      // shaded sphere with drifting bands
      const lx = -0.55, ly = -0.6, lz = 0.58;
      const x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), y0 = Math.floor(cy - R), y1 = Math.ceil(cy + R);
      const img = ctx.getImageData(0, 0, W, H), d = img.data;
      for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
          const nx = (x - cx) / R, ny = (y - cy) / R, rr = nx * nx + ny * ny;
          if (rr > 1) continue;
          const nz = Math.sqrt(1 - rr);
          const lam = Math.max(0, nx * lx + ny * ly + nz * lz);
          const lat = Math.asin(ny), lon = Math.atan2(nx, nz) + t * 0.05;
          const band = fbm(lon * 1.2 + 10, lat * 7, 4);
          const v = clamp01(0.08 + lam * (0.55 + 0.6 * band));
          const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = v * 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      ring(true);

      // small moon
      const mx = W * 0.8, my = H * 0.3, mr = H * 0.07;
      const mg = ctx.createRadialGradient(mx - mr * 0.4, my - mr * 0.4, 0, mx, my, mr);
      mg.addColorStop(0, "#fff"); mg.addColorStop(1, "#444");
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
      ctx.setLineDash([1, 3]); ctx.strokeStyle = "rgba(255,255,255,.7)";
      ctx.beginPath(); ctx.ellipse(cx, cy, W * 0.42, H * 0.5, tilt, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    },

    // Concentric tilted orbits around a bright core
    orbit(ctx, W, H, o) {
      const { rand, t } = o;
      const cx = W / 2, cy = H / 2, m = Math.min(W, H);
      for (let i = 0; i < W * H * 0.003; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.6})`;
        ctx.fillRect(rand() * W, rand() * H, 1, 1);
      }
      hatch(ctx, 0, 0, W, H, 4, 0.12);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.5);
      g.addColorStop(0, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      const orbits = 7;
      for (let k = 0; k < orbits; k++) {
        const rx = m * (0.14 + k * 0.055), ry = rx * (0.35 + 0.05 * k);
        const rot = -0.5 + k * 0.08;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = k % 3 === 0 ? 1.4 : 0.8;
        ctx.globalAlpha = 0.85;
        if (k % 2) ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        const a = rand() * TAU + t * (0.5 / (k + 1));
        const px = Math.cos(a) * rx, py = Math.sin(a) * ry, pr = m * (0.012 + rand() * 0.025);
        ctx.globalAlpha = 1; ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
        ctx.restore();
      }
      const cg = ctx.createRadialGradient(cx - m * 0.03, cy - m * 0.03, 0, cx, cy, m * 0.1);
      cg.addColorStop(0, "#fff"); cg.addColorStop(1, "#555");
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, m * 0.09, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU, r0 = m * 0.11, r1 = m * (0.12 + (i % 3 ? 0.02 : 0.05));
        line(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }
    },

    // Two interfering wave sources
    waves(ctx, W, H, o) {
      const { t, fbm, rand } = o;
      const c1x = W * (0.3 + rand() * 0.1), c1y = H * (0.35 + rand() * 0.1);
      const c2x = W * (0.6 + rand() * 0.15), c2y = H * (0.55 + rand() * 0.15);
      const k = 0.36;
      pixelPass(ctx, W, H, (x, y) => {
        const d1 = Math.hypot(x - c1x, y - c1y), d2 = Math.hypot(x - c2x, y - c2y);
        const v = Math.sin(d1 * k - t * 2.2) + Math.sin(d2 * k * 0.9 - t * 1.7);
        const m = fbm(x * 0.02 + 3, y * 0.02, 3);
        return 0.45 + 0.28 * v * (0.6 + m * 0.8) - 0.15 * (1 - m);
      });
    },

    // Big serif letters cropped at the bottom with a starburst above
    type(ctx, W, H, o) {
      const { rand, t, fbm, el } = o;
      pixelPass(ctx, W, H, (x, y) => 0.12 + 0.3 * fbm(x * 0.03, y * 0.03, 4) + (y % 3 === 0 ? 0.12 : 0));
      const bx = W * 0.64, by = H * 0.34;
      ctx.strokeStyle = "#fff";
      for (let i = 0; i < 110; i++) {
        const a = rand() * TAU;
        const len = Math.min(W, H) * (0.08 + rand() * 0.38) * (0.85 + 0.15 * Math.sin(t * 3 + i));
        ctx.globalAlpha = 0.5 + rand() * 0.5; ctx.lineWidth = rand() < 0.2 ? 1.5 : 0.8;
        line(ctx, bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len);
      }
      ctx.globalAlpha = 1;
      const core = ctx.createRadialGradient(bx, by, 0, bx, by, W * 0.07);
      core.addColorStop(0, "#fff"); core.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(bx, by, W * 0.07, 0, TAU); ctx.fill();

      const text = (el.dataset.text || "Hello").toUpperCase();
      let size = H * 0.4;
      ctx.font = `500 ${size}px "EB Garamond", Garamond, Georgia, serif`;
      const w = ctx.measureText(text).width;
      if (w > W * 1.15) { size *= (W * 1.15) / w; ctx.font = `500 ${size}px "EB Garamond", Garamond, Georgia, serif`; }
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillText(text, W * 0.5, H + size * 0.14);
    },

    // Spiral checkerboard tunnel
    vortex(ctx, W, H, o) {
      const { t, fbm } = o;
      const cx = W / 2, cy = H / 2, m = Math.min(W, H);
      pixelPass(ctx, W, H, (x, y) => {
        const dx = (x - cx) / m, dy = (y - cy) / m;
        const r = Math.hypot(dx, dy) + 1e-4;
        const a = Math.atan2(dy, dx);
        const v = Math.log(r) * 5 - t * 0.8;
        const w = fbm(x * 0.04, y * 0.04, 3) * 0.8;
        const u = (a / TAU) * 18 + v * 0.45 + w + t * 0.15;
        const chk = (Math.floor(u) + Math.floor(v + w)) & 1;
        const depth = smooth(0.0, 0.5, r);
        const base = chk ? 0.85 : 0.12;
        const core = r < 0.07 ? 1 - r / 0.07 : 0;
        return base * (0.35 + 0.65 * depth) + core * 0.9;
      });
      ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    },

    // Topographic contour map
    terrain(ctx, W, H, o) {
      const { t, fbm } = o;
      const s = 3.2 / Math.min(W, H);
      pixelPass(ctx, W, H, (x, y) => {
        const n = fbm(x * s + 7, y * s - t * 0.03, 5);
        const f = (n * 16) % 1;
        const edge = Math.min(f, 1 - f);
        const lineV = edge < 0.08 ? 1 : 0;
        const major = Math.floor(n * 16) % 4 === 0 && edge < 0.14 ? 1 : 0;
        return Math.max(lineV * 0.92, major) || 0.08 + n * 0.35;
      });
      // survey grid
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1; ctx.setLineDash([1, 3]);
      for (let x = W / 6; x < W; x += W / 6) line(ctx, x, 0, x, H);
      for (let y = H / 6; y < H; y += H / 6) line(ctx, 0, y, W, y);
      ctx.setLineDash([]);
    },

    // Perspective box corridor toward a bright portal
    corridor(ctx, W, H, o) {
      const { t, fbm } = o;
      const cx = W / 2, cy = H * 0.42;
      pixelPass(ctx, W, H, (x, y) => {
        const dx = (x - cx) / (W * 0.5), dy = (y - cy) / (H * 0.55);
        const d = Math.max(Math.abs(dx), Math.abs(dy)) + 1e-4;
        const z = 1 / d;
        const frac = (v) => v - Math.floor(v);
        const ring = frac(z * 1.6 - t * 0.6);
        // coordinate around the square perimeter
        let p;
        if (Math.abs(dx) > Math.abs(dy)) p = dy / Math.abs(dx); else p = dx / Math.abs(dy);
        const rib = Math.abs(frac(p * 4) - 0.5);
        const grid = ring < 0.1 || rib < 0.04 ? 1 : 0;
        const fog = smooth(0.05, 0.9, d);
        const portal = d < 0.12 ? 1 : 0;
        const tex = fbm(x * 0.05, y * 0.05, 3) * 0.25;
        return portal || (0.06 + grid * 0.85 + tex) * fog + (1 - fog) * 0.7;
      });
      // rays from the portal
      ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 0.8;
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU + t * 0.05;
        line(ctx, cx, cy, cx + Math.cos(a) * W * 0.12, cy + Math.sin(a) * H * 0.12);
      }
    },

    // Hero: looping explosions with fireballs, shockwaves, debris and embers
    explosion(ctx, W, H, o) {
      const { t, fbm, rand } = o;
      const m = Math.min(W, H);
      hatch(ctx, 0, H * 0.64, W, H * 0.36, 3, 0.12);

      // embers drifting upward
      for (let i = 0; i < 80; i++) {
        const x = rand() * W, sp = 5 + rand() * 12, ph = rand() * (H + 10);
        const y = H - ((t * sp + ph) % (H + 10));
        ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.5})`;
        ctx.fillRect(x + Math.sin(t * 1.3 + i) * 3, y, 1, 1);
      }

      // each burst loops on its own period; position re-rolls every cycle
      const bursts = [
        { period: 4.2, off: 0.0, main: true },
        { period: 2.9, off: 0.45 },
        { period: 3.5, off: 0.8 },
      ];
      const live = bursts.map((b, k) => {
        const u = t / b.period + b.off;
        const n = Math.floor(u);
        const r = mulberry32((k + 1) * 7919 + n * 104729 + o.seed);
        return {
          k, n, r, main: !!b.main, p: u - n,
          cx: b.main ? W * (0.5 + (r() - 0.5) * 0.1) : W * (0.16 + r() * 0.68),
          cy: b.main ? H * (0.5 + (r() - 0.5) * 0.08) : H * (0.16 + r() * 0.5),
          R: b.main ? m * 0.42 : m * (0.12 + r() * 0.1),
        };
      });

      // fireballs: billowing fbm cores that cool from white to blue as they rise
      const img = ctx.getImageData(0, 0, W, H), d = img.data;
      for (const b of live) {
        const grow = 1 - Math.pow(1 - Math.min(1, b.p * 2.2), 3);
        const rf = b.R * 0.5 * (0.25 + 0.75 * grow);
        const heat = 1 - smooth(0.12, 1, b.p);
        const fx = b.cx, fy = b.cy - b.R * 0.35 * b.p;
        const ox = b.k * 13.7 + b.n * 3.1;
        const x0 = Math.max(0, Math.floor(fx - rf * 1.4)), x1 = Math.min(W, Math.ceil(fx + rf * 1.4));
        const y0 = Math.max(0, Math.floor(fy - rf * 1.4)), y1 = Math.min(H, Math.ceil(fy + rf * 1.4));
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const dx = (x - fx) / rf, dy = (y - fy) / rf;
            const dd = Math.sqrt(dx * dx + dy * dy);
            if (dd > 1.4) continue;
            const nz = fbm(x * 0.07 + ox, y * 0.07 + t * 0.9 + ox, 4);
            let v = 1.15 - dd + (nz - 0.5) * 1.1;
            if (v <= 0) continue;
            v = Math.min(1, v * 1.5) * (0.3 + 0.7 * heat);
            if (dd < 0.35 && heat > 0.4) v = Math.max(v, heat);
            const i = (y * W + x) * 4;
            const c = Math.max(d[i] / 255, v) * 255;
            d[i] = d[i + 1] = d[i + 2] = c;
          }
        }
      }
      ctx.putImageData(img, 0, 0);

      for (const b of live) {
        const e = 1 - Math.pow(1 - b.p, 3);
        const fade = 1 - b.p;
        if (b.main && b.p < 0.05) {
          ctx.fillStyle = `rgba(255,255,255,${(1 - b.p / 0.05) * 0.4})`;
          ctx.fillRect(0, 0, W, H);
        }
        // shockwave rings
        ctx.strokeStyle = `rgba(255,255,255,${fade})`;
        ctx.lineWidth = Math.max(0.6, 2.2 * fade);
        ctx.beginPath(); ctx.arc(b.cx, b.cy, b.R * 1.5 * e, 0, TAU); ctx.stroke();
        if (b.main) {
          ctx.lineWidth = 0.8; ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.ellipse(b.cx, b.cy + b.R * 0.3, b.R * 2.1 * e, b.R * 0.45 * e, 0, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
        }
        // debris streaks with a little gravity droop
        const nd = b.main ? 70 : 26;
        const gy = b.R * 0.3 * b.p * b.p;
        ctx.lineWidth = 0.8; ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff";
        for (let j = 0; j < nd; j++) {
          const a = b.r() * TAU, sp = 0.5 + b.r() * 0.9, tl = 0.55 + 0.2 * b.r(), al = 0.5 + b.r() * 0.5;
          const head = b.R * 1.3 * e * sp, tail = head * tl;
          const hx = b.cx + Math.cos(a) * head, hy = b.cy + Math.sin(a) * head + gy;
          ctx.globalAlpha = fade * al;
          line(ctx, b.cx + Math.cos(a) * tail, b.cy + Math.sin(a) * tail + gy * 0.5, hx, hy);
          if (j % 4 === 0) ctx.fillRect(hx - 1, hy - 1, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
    },

    // dInference: peer-to-peer network with packets in flight, verifier pings, and a block chain
    network(ctx, W, H, o) {
      const { t, rand } = o;
      ctx.fillStyle = "rgba(255,255,255,.16)";
      for (let y = 3; y < H; y += 6) for (let x = 3; x < W; x += 6) ctx.fillRect(x, y, 1, 1);

      const nodes = [];
      for (let i = 0; i < 15; i++) {
        const bx = W * (0.08 + rand() * 0.84), by = H * (0.08 + rand() * 0.6);
        nodes.push({ x: bx + Math.sin(t * 0.5 + i) * 2, y: by + Math.cos(t * 0.4 + i * 1.3) * 2, v: rand() < 0.25 });
      }
      const seen = new Set(), edges = [];
      nodes.forEach((a, i) => {
        nodes
          .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
          .filter((e) => e.j !== i)
          .sort((p, q) => p.d - q.d)
          .slice(0, 3)
          .forEach(({ j }) => {
            const key = i < j ? `${i}-${j}` : `${j}-${i}`;
            if (!seen.has(key)) { seen.add(key); edges.push([i, j]); }
          });
      });

      ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 0.7;
      edges.forEach(([i, j]) => line(ctx, nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y));
      ctx.fillStyle = "#fff";
      edges.forEach(([i, j], k) => {
        const ph = (t * 0.35 * (0.6 + (k % 5) * 0.15) + k * 0.37) % 1;
        const a = nodes[i], b = nodes[j];
        ctx.fillRect(a.x + (b.x - a.x) * ph - 1, a.y + (b.y - a.y) * ph - 1, 2, 2);
      });

      // block chain sliding along the bottom
      const by = H * 0.86, bh = H * 0.1, bw = bh * 1.3, step = bw * 1.45;
      const travel = t * 6, shift = travel % step, base = Math.floor(travel / step);
      ctx.lineWidth = 1;
      for (let idx = -1; idx * step - shift < W + step; idx++) {
        const x = idx * step - shift;
        const rr = mulberry32((base + idx) * 977 + 5);
        ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(x, by - bh / 2, bw, bh);
        ctx.strokeStyle = "#fff"; ctx.strokeRect(x + 0.5, by - bh / 2 + 0.5, bw - 1, bh - 1);
        ctx.globalAlpha = 0.7;
        for (let l = 0; l < 3; l++) {
          const yy = by - bh / 2 + 3 + l * ((bh - 5) / 3);
          line(ctx, x + 3, yy, x + 3 + (bw - 6) * (0.35 + 0.65 * rr()), yy);
        }
        ctx.globalAlpha = 1;
        line(ctx, x + bw, by, x + step, by);
      }

      // verifiers commit down to the chain and ping
      nodes.forEach((n, i) => {
        if (n.v && i % 2 === 0) {
          ctx.setLineDash([1, 2]); ctx.strokeStyle = "rgba(255,255,255,.6)";
          line(ctx, n.x, n.y + 4, n.x, by - bh / 2 - 2);
          ctx.setLineDash([]);
        }
      });
      nodes.forEach((n, i) => {
        ctx.beginPath(); ctx.arc(n.x, n.y, n.v ? 3.5 : 2.5, 0, TAU);
        ctx.fillStyle = n.v ? "#fff" : "#000"; ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
        if (n.v) {
          const q = (t * 0.6 + i * 0.21) % 1;
          ctx.globalAlpha = 1 - q;
          ctx.beginPath(); ctx.arc(n.x, n.y, 4 + q * 10, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      });
    },

    // UtterDB: consistent-hashing ring with shard arcs, server racks, keys and live requests
    hashring(ctx, W, H, o) {
      const { t, rand } = o;
      const cx = W / 2, cy = H / 2, m = Math.min(W, H), R = m * 0.3;
      const rot = t * 0.15;
      hatch(ctx, 0, 0, W, H, 4, 0.08);

      ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 0.6; ctx.setLineDash([1, 3]);
      [1.55, 1.78].forEach((k) => { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, TAU); ctx.stroke(); });
      ctx.setLineDash([]);

      // requests streaming in from every direction toward the proxy
      for (let i = 0; i < 40; i++) {
        const a = rand() * TAU, sp = 0.5 + rand() * 0.8, off = rand();
        const ph = (t * sp * 0.5 + off) % 1;
        const r0 = m * 0.78 * (1 - ph) + R * 0.25;
        const x = cx + Math.cos(a) * r0, y = cy + Math.sin(a) * r0;
        ctx.globalAlpha = 0.25 + 0.6 * ph; ctx.lineWidth = 0.8; ctx.strokeStyle = "#fff";
        line(ctx, x, y, x + Math.cos(a) * 6, y + Math.sin(a) * 6);
      }
      ctx.globalAlpha = 1;

      const NN = 6;
      const angles = Array.from({ length: NN }, (_, i) => (i / NN) * TAU + (rand() - 0.5) * 0.5).sort((a, b) => a - b);
      angles.forEach((a, i) => {
        const prev = i === 0 ? angles[NN - 1] - TAU : angles[i - 1];
        ctx.strokeStyle = i % 2 ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.75)";
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.85, prev + rot + 0.05, a + rot - 0.05); ctx.stroke();
      });

      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * TAU + rot, l = i % 6 === 0 ? 4 : 2;
        line(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, cx + Math.cos(a) * (R + l), cy + Math.sin(a) * (R + l));
      }

      // server racks with blinking LEDs
      angles.forEach((a0, i) => {
        const a = a0 + rot, sx = cx + Math.cos(a) * R * 1.35, sy = cy + Math.sin(a) * R * 1.35;
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.8;
        line(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, sx, sy);
        const bw = 10, bh = 12;
        ctx.fillStyle = "#000"; ctx.fillRect(sx - bw / 2, sy - bh / 2, bw, bh);
        ctx.strokeRect(sx - bw / 2 + 0.5, sy - bh / 2 + 0.5, bw - 1, bh - 1);
        for (let r = 0; r < 3; r++) {
          ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(sx - bw / 2 + 2, sy - bh / 2 + 2.5 + r * 3, bw - 6, 1);
          ctx.fillStyle = Math.sin(t * 9 + i * 2 + r * 1.7) > 0 ? "#fff" : "#333";
          ctx.fillRect(sx + bw / 2 - 3, sy - bh / 2 + 2 + r * 3, 1.5, 1.5);
        }
      });

      const keys = Array.from({ length: 36 }, () => rand() * TAU);
      ctx.fillStyle = "#fff";
      keys.forEach((a0) => {
        const a = a0 + rot;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 1.3, 0, TAU); ctx.fill();
      });

      // proxy routes a handful of reads/writes each tick
      const tick = Math.floor(t * 4), ph = (t * 4) % 1;
      for (let s = 0; s < 5; s++) {
        const rr = mulberry32(tick * 31 + s);
        const a = keys[Math.floor(rr() * keys.length)] + rot;
        ctx.globalAlpha = 0.9 - ph * 0.5; ctx.lineWidth = 0.8; ctx.strokeStyle = "#fff";
        line(ctx, cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.fillRect(cx + Math.cos(a) * R * ph - 1, cy + Math.sin(a) * R * ph - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.16, 0, TAU); ctx.fill();
      ctx.fillStyle = "#000"; ctx.fillRect(cx - R * 0.07, cy - 0.5, R * 0.14, 1); ctx.fillRect(cx - 0.5, cy - R * 0.07, 1, R * 0.14);
    },

    // Insider Flagger: Monte Carlo fan of random PnL walks, one path that shouldn't exist
    montecarlo(ctx, W, H, o) {
      const { t, rand } = o;
      const L = W * 0.08, Rr = W * 0.7, T = H * 0.08, B = H * 0.9;
      const y0 = T + (B - T) * 0.62;
      ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 0.6; ctx.setLineDash([1, 3]);
      for (let i = 1; i < 5; i++) { const y = T + ((B - T) * i) / 5; line(ctx, L, y, W * 0.96, y); }
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1;
      line(ctx, L, T, L, B); line(ctx, L, B, Rr, B);

      const M = 48, N = 55, sx = (Rr - L) / M, sig = (B - T) * 0.035;
      // the simulated fan is always fully drawn; only the flagged wallet's path grows
      const reveal = Math.min(1, 0.3 + ((t * 0.15) % 1) * 0.9);
      const steps = Math.max(2, Math.floor(M * reveal));
      const finals = [];
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.9;
      for (let n = 0; n < N; n++) {
        let y = y0;
        ctx.globalAlpha = 0.5 + rand() * 0.4;
        ctx.beginPath(); ctx.moveTo(L, y);
        for (let s = 1; s <= M; s++) {
          y += (rand() - 0.5) * 2 * sig;
          ctx.lineTo(L + s * sx, y);
        }
        ctx.stroke(); finals.push(y);
      }

      ctx.globalAlpha = 1; ctx.lineWidth = 1.8;
      let y = y0, ix = L, iy = y0;
      ctx.beginPath(); ctx.moveTo(L, y);
      for (let s = 1; s <= M; s++) {
        y -= (B - T) * 0.011 + (rand() - 0.5) * sig * 1.2;
        if (s <= steps) { ix = L + s * sx; iy = Math.max(T, y); ctx.lineTo(ix, iy); }
      }
      ctx.stroke();

      // crosshair + pulse on the flagged wallet
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ix, iy, 5, 0, TAU); ctx.stroke();
      line(ctx, ix - 10, iy, ix - 6, iy); line(ctx, ix + 6, iy, ix + 10, iy);
      line(ctx, ix, iy - 10, ix, iy - 6); line(ctx, ix, iy + 6, ix, iy + 10);
      const pulse = (t * 1.5) % 1;
      ctx.globalAlpha = 1 - pulse;
      ctx.beginPath(); ctx.arc(ix, iy, 5 + pulse * 10, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;

      // sideways histogram of where the random walks ended
      const bins = 14, hx = W * 0.75, hw = W * 0.21, bh = (B - T) / bins;
      const counts = new Array(bins).fill(0);
      finals.forEach((v) => { const b = Math.floor(((v - T) / (B - T)) * bins); if (b >= 0 && b < bins) counts[b]++; });
      const mx = Math.max(1, ...counts);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      counts.forEach((c, i) => ctx.fillRect(hx, T + bh * i + 1, (hw * c) / mx, bh - 2));
      ctx.fillStyle = "#fff"; ctx.fillRect(hx, iy - 1, hw, 2);
    },

    // Kalshi Climate: ensemble forecast spaghetti, KDE, and the market's temperature buckets
    ensemble(ctx, W, H, o) {
      const { t, rand, fbm } = o;
      pixelPass(ctx, W, H, (x, y) => {
        const n = fbm(x * 0.025 + 2, y * 0.025, 3);
        const f = (n * 10) % 1;
        return Math.min(f, 1 - f) < 0.05 ? 0.2 : 0.04;
      });
      const L = W * 0.06, Rr = W * 0.66, T = H * 0.12, B = H * 0.88;
      const base = (u) => T + (B - T) * (0.55 - 0.3 * Math.sin(u * Math.PI * 1.1 - 0.3));

      ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.7;
      const ends = [];
      for (let n = 0; n < 26; n++) {
        const a1 = rand() - 0.5, a2 = rand() - 0.5, ph = rand() * TAU;
        ctx.globalAlpha = 0.35 + rand() * 0.45;
        ctx.beginPath();
        for (let s = 0; s <= 40; s++) {
          const u = s / 40, spread = (B - T) * 0.22 * u * u;
          const y = base(u) + spread * (a1 * 1.6 + a2 * Math.sin(u * 6 + ph)) + Math.sin(t * 0.8 + n + u * 4) * 1.2;
          const x = L + (Rr - L) * u;
          if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          if (s === 40) ends.push(y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let s = 0; s <= 40; s++) { const u = s / 40, x = L + (Rr - L) * u; if (s) ctx.lineTo(x, base(u)); else ctx.moveTo(x, base(u)); }
      ctx.stroke();

      // "now" marker sweeping through the forecast horizon
      const nowX = L + (Rr - L) * ((t * 0.08) % 1);
      ctx.setLineDash([1, 2]); ctx.lineWidth = 0.8; line(ctx, nowX, T, nowX, B); ctx.setLineDash([]);

      const mu = ends.reduce((a, b) => a + b, 0) / ends.length;
      const sd = Math.sqrt(ends.reduce((a, b) => a + (b - mu) ** 2, 0) / ends.length) || 1;
      const kx = W * 0.72, kw = W * 0.24, bucket = (B - T) / 10;
      for (let i = 0; i < 10; i++) {
        const yc = T + bucket * (i + 0.5);
        const p = Math.exp(-0.5 * ((yc - mu) / sd) ** 2);
        ctx.fillStyle = Math.abs(yc - mu) < bucket * 0.5 ? "#fff" : "rgba(255,255,255,.4)";
        ctx.fillRect(kx, T + bucket * i + 1, kw * p, bucket - 2);
      }
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let yy = T, first = true; yy <= B; yy += 1, first = false) {
        const x = kx + kw * Math.exp(-0.5 * ((yy - mu) / sd) ** 2);
        if (first) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();

      // little sun
      const sx = W * 0.12, sy = H * 0.12, sr = Math.min(W, H) * 0.035;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + t * 0.3;
        line(ctx, sx + Math.cos(a) * sr * 1.5, sy + Math.sin(a) * sr * 1.5, sx + Math.cos(a) * sr * 2.3, sy + Math.sin(a) * sr * 2.3);
      }
    },

    // Gravity Sim: an actual n-body integration with orbit trails (state lives on the canvas)
    nbody(ctx, W, H, o) {
      const el = o.el;
      const STEP = 0.004, TRAIL = 70;
      const init = () => {
        const r = mulberry32(o.seed * 13 + 1);
        const bodies = [{ x: 0, y: 0, vx: 0, vy: 0, m: 1, star: true }];
        for (let i = 0; i < 7; i++) {
          const dist = 0.2 + i * 0.1 + r() * 0.04, a = r() * TAU;
          const v = Math.sqrt(1 / dist) * (0.92 + r() * 0.12);
          bodies.push({ x: Math.cos(a) * dist, y: Math.sin(a) * dist, vx: -Math.sin(a) * v, vy: Math.cos(a) * v, m: 0.001 + r() * 0.004 });
        }
        return { bodies, trails: bodies.map(() => []), last: o.t, n: 0 };
      };
      const step = (S, h) => {
        const b = S.bodies;
        for (const p of b) {
          let ax = 0, ay = 0;
          for (const q of b) {
            if (q === p) continue;
            const dx = q.x - p.x, dy = q.y - p.y, r2 = dx * dx + dy * dy + 0.002;
            const f = q.m / (r2 * Math.sqrt(r2));
            ax += dx * f; ay += dy * f;
          }
          p.vx += ax * h; p.vy += ay * h;
        }
        for (const p of b) { p.x += p.vx * h; p.y += p.vy * h; }
        if (++S.n % 3 === 0) S.trails.forEach((tr, i) => { tr.push([b[i].x, b[i].y]); if (tr.length > TRAIL) tr.shift(); });
      };

      let S = el._nbody;
      if (!S) {
        S = el._nbody = init();
        for (let k = 0; k < 600; k++) step(S, STEP);
      }
      const dt = Math.min(0.2, Math.max(0, o.t - S.last)) * 0.35;
      S.last = o.t;
      const sub = Math.ceil(dt / STEP);
      for (let k = 0; k < sub; k++) step(S, dt / sub);
      if (S.bodies.some((p) => Math.hypot(p.x, p.y) > 2.5)) { el._nbody = null; }

      const { rand } = o;
      for (let i = 0; i < W * H * 0.003; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.5})`;
        ctx.fillRect(rand() * W, rand() * H, 1, 1);
      }
      const cx = W / 2, cy = H / 2, s = Math.min(W, H) * 0.55;
      ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 0.6; ctx.setLineDash([1, 3]);
      for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(cx, cy, s * 0.2 * k, 0, TAU); ctx.stroke(); }
      ctx.setLineDash([]);

      const star = S.bodies[0];
      const ox = cx - star.x * s, oy = cy - star.y * s;
      S.trails.forEach((tr, i) => {
        if (i === 0 || tr.length < 2) return;
        for (let k = 1; k < tr.length; k++) {
          ctx.globalAlpha = (k / tr.length) * 0.9; ctx.lineWidth = 1; ctx.strokeStyle = "#fff";
          line(ctx, ox + tr[k - 1][0] * s, oy + tr[k - 1][1] * s, ox + tr[k][0] * s, oy + tr[k][1] * s);
        }
      });
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.18);
      g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, s * 0.18, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff";
      S.bodies.forEach((p, i) => {
        const r = i === 0 ? 5 : 1.5 + p.m * 300;
        ctx.beginPath(); ctx.arc(ox + p.x * s, oy + p.y * s, r, 0, TAU); ctx.fill();
      });
    },

    // WASM Analytics: a scrolling memory dump being scanned into a live histogram
    membits(ctx, W, H, o) {
      const { t } = o;
      const cs = 3, gx = W * 0.06, gy = H * 0.08;
      const cols = Math.floor((W * 0.5) / cs), rows = Math.floor((H * 0.84) / cs);
      const scroll = Math.floor(t * 10);
      const scan = Math.floor(((t * 0.5) % 1) * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (c % 9 === 8) continue; // byte gap
          const on = mulberry32((r + scroll) * 7919 + c * 31 + o.seed)() > 0.55;
          let l = on ? 0.7 : 0.1;
          if (r === scan) l = on ? 1 : 0.45;
          else if (Math.abs(r - scan) < 3) l += 0.12;
          const v = Math.round(l * 255);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(gx + c * cs, gy + r * cs, cs - 1, cs - 1);
        }
      }
      const hx = W * 0.64, hw = W * 0.31, hb = H * 0.9, hh = H * 0.72, nb = 7, bw = hw / nb;
      const sy = gy + scan * cs + 1;
      ctx.setLineDash([1, 2]); ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 0.8;
      line(ctx, gx + cols * cs + 2, sy, hx - 3, sy);
      ctx.setLineDash([]);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      line(ctx, hx, hb, hx + hw, hb);
      for (let i = 0; i < nb; i++) {
        const v = 0.2 + 0.8 * Math.abs(Math.sin(t * 0.9 + i * 1.3) * (0.6 + 0.4 * Math.sin(i * 2.1)));
        const h = hh * v;
        hatch(ctx, hx + i * bw + 1, hb - h, bw - 2, h, 2, 0.75);
        ctx.strokeRect(hx + i * bw + 1.5, hb - h + 0.5, bw - 3, h);
      }
    },

    // Research banner: a tokamak with field coils, glowing plasma ring and helical field lines
    tokamak(ctx, W, H, o) {
      const { t, rand } = o;
      // starfield + floor hatch
      for (let i = 0; i < W * H * 0.002; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.45})`;
        ctx.fillRect(rand() * W, rand() * H, 1, 1);
      }
      hatch(ctx, 0, H * 0.86, W, H * 0.14, 3, 0.16);

      const R = 1, rv = 0.38, rc = 0.5, rp = 0.2;      // major, vessel, coil, plasma radii
      const s = (W * 0.28) / (R + rc), k = 0.25;
      const cx = W * 0.5, cy = H * 0.54;
      const P = (X, Y, Z) => [cx + X * s, cy - Y * s * k - Z * s];
      const torusPt = (phi, th, r, flatIn = 1) => {
        const rr = Math.cos(th) < 0 ? r * flatIn : r;
        const rad = R + rr * Math.cos(th);
        return P(rad * Math.cos(phi), rad * Math.sin(phi), r * Math.sin(th));
      };
      const ring = (phiFrom, phiTo, z, rad, n = 80) => {
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const ph = phiFrom + ((phiTo - phiFrom) * i) / n;
          const [x, y] = P(rad * Math.cos(ph), rad * Math.sin(ph), z);
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      };

      // poloidal field coils, back halves
      ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 1.2;
      [rc * 1.15, -rc * 1.15].forEach((z) => ring(0, Math.PI, z, R * 1.15));

      // toroidal field coils (D-shaped), back ones first
      const NC = 16;
      const coil = (i, front) => {
        const phi = (i / NC) * TAU;
        if ((Math.sin(phi) < 0) !== front) return;
        ctx.strokeStyle = front ? "#fff" : "rgba(255,255,255,.4)";
        ctx.lineWidth = front ? 2 : 1;
        ctx.beginPath();
        for (let j = 0; j <= 40; j++) {
          const [x, y] = torusPt(phi, (j / 40) * TAU, rc, 0.55);
          if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      };
      for (let i = 0; i < NC; i++) coil(i, false);

      // central solenoid
      const [sx0, sy0] = P(-0.22, 0, rc * 1.3), [sx1, sy1] = P(0.22, 0, -rc * 1.3);
      ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      for (let y = sy0; y < sy1; y += 3) ctx.fillRect(sx0, Math.round(y), sx1 - sx0, 1);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(sx0 + 0.5, sy0 + 0.5, sx1 - sx0, sy1 - sy0);

      // vacuum vessel silhouette
      ctx.setLineDash([2, 3]); ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 0.8;
      ring(0, TAU, 0, R + rv); ring(0, TAU, rv * 0.92, R); ring(0, TAU, -rv * 0.92, R);
      ctx.setLineDash([]);

      // plasma: layered glow around the magnetic axis, breathing slightly
      const breathe = 1 + Math.sin(t * 2.2) * 0.06;
      [[3.2, 0.12], [2.2, 0.22], [1.4, 0.45], [0.8, 0.8], [0.3, 1]].forEach(([wf, a]) => {
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = rp * s * wf * breathe;
        ring(0, TAU, 0, R, 120);
      });

      // helical field lines flowing around the plasma surface (q ≈ 3)
      for (let L = 0; L < 3; L++) {
        for (let i = 0; i < 360; i++) {
          const phi = (i / 360) * TAU;
          const th = phi * 3.2 + (L * TAU) / 3 + t * 1.5;
          const front = Math.sin(phi) < 0;
          const [x, y] = torusPt(phi, th, rp * 1.25 * breathe);
          ctx.fillStyle = front ? "#fff" : "rgba(255,255,255,.35)";
          ctx.fillRect(x - 0.5, y - 0.5, front ? 1.5 : 1, front ? 1.5 : 1);
        }
      }

      // front coils and poloidal coil halves sit in front of the plasma
      for (let i = 0; i < NC; i++) coil(i, true);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4;
      [rc * 1.15, -rc * 1.15].forEach((z) => ring(Math.PI, TAU, z, R * 1.15));

      // diagnostic ports and a couple of sparks inside the plasma
      for (let i = 0; i < 5; i++) {
        const phi = Math.PI + 0.35 + i * 0.6;
        const [x, y] = P((R + rc + 0.08) * Math.cos(phi), (R + rc + 0.08) * Math.sin(phi), 0);
        ctx.fillStyle = "#000"; ctx.fillRect(x - 3, y - 3, 6, 6);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(x - 2.5, y - 2.5, 5, 5);
      }
      const sr = mulberry32(Math.floor(t * 8) + o.seed);
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 6; i++) {
        const [x, y] = torusPt(sr() * TAU, sr() * TAU, rp * sr());
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    },

    // Georgia Tech tile: an (original) yellow jacket buzzing over honeycomb
    bee(ctx, W, H, o) {
      const { t, rand } = o;
      const m = Math.min(W, H);

      // honeycomb with a few filled cells
      const hr = m * 0.075, hw = hr * Math.sqrt(3);
      for (let row = -1; row * hr * 1.5 < H + hr; row++) {
        for (let col = -1; col * hw < W + hw; col++) {
          const x = col * hw + (row % 2 ? hw / 2 : 0), y = row * hr * 1.5;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU + Math.PI / 6;
            const px = x + Math.cos(a) * hr * 0.92, py = y + Math.sin(a) * hr * 0.92;
            if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.closePath();
          if (rand() < 0.12) { ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.fill(); }
          ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 0.8; ctx.stroke();
        }
      }

      // figure-eight flight path
      const cx = W * 0.5, cy = H * 0.6;
      const path = (tt) => [cx + Math.sin(tt * 0.9) * W * 0.16, cy + Math.sin(tt * 1.8) * H * 0.05];
      ctx.fillStyle = "#fff";
      for (let k = 1; k < 36; k += 2) {
        const [x, y] = path(t - k * 0.06);
        ctx.globalAlpha = 0.6 * (1 - k / 36);
        ctx.fillRect(x - 0.5, y - 0.5, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;

      const [bx, by] = path(t);
      const dir = Math.cos(t * 0.9) >= 0 ? 1 : -1;
      const s = m * 0.0048;
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(dir * s, s);
      ctx.rotate(-0.12);
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = "#fff";
      const shape = (fill, draw) => { ctx.beginPath(); draw(); if (fill != null) { ctx.fillStyle = `rgb(${fill},${fill},${fill})`; ctx.fill(); } ctx.stroke(); };

      // legs
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(-6 + i * 7, 10); ctx.lineTo(-10 + i * 8, 22); ctx.lineTo(-14 + i * 9, 28); ctx.stroke();
      }
      // abdomen with stripes and stinger
      shape(null, () => { ctx.moveTo(-54, 16); ctx.lineTo(-62, 21); ctx.lineTo(-52, 21); });
      ctx.save();
      ctx.beginPath(); ctx.ellipse(-30, 7, 26, 17, 0.25, 0, TAU);
      ctx.fillStyle = "rgb(150,150,150)"; ctx.fill();
      ctx.clip();
      ctx.fillStyle = "rgb(25,25,25)";
      for (const x of [-46, -33, -20]) { ctx.save(); ctx.translate(x, 7); ctx.rotate(0.25); ctx.fillRect(-3.5, -30, 7, 60); ctx.restore(); }
      ctx.restore();
      shape(null, () => ctx.ellipse(-30, 7, 26, 17, 0.25, 0, TAU));
      // thorax with fuzz
      shape(185, () => ctx.ellipse(0, 0, 15, 13, 0, 0, TAU));
      ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 15, Math.sin(a) * 13); ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 16); ctx.stroke();
      }
      ctx.lineWidth = 1.8;
      // head, eye, antennae
      shape(160, () => ctx.arc(19, -3, 11, 0, TAU));
      shape(20, () => ctx.ellipse(23, -5, 4.5, 6.5, 0.2, 0, TAU));
      ctx.fillStyle = "#fff"; ctx.fillRect(23, -9, 2, 2);
      ctx.beginPath(); ctx.moveTo(21, -13); ctx.quadraticCurveTo(26, -30, 36, -32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, -13); ctx.quadraticCurveTo(16, -30, 26, -36); ctx.stroke();
      // wings flapping fast
      const flap = 0.45 + 0.55 * Math.abs(Math.sin(t * 26));
      ctx.fillStyle = "rgba(255,255,255,.38)";
      [[-8, -18, -0.6, 20], [4, -20, -0.25, 16]].forEach(([x, y, r, rx]) => {
        ctx.beginPath(); ctx.ellipse(x, y, rx, 9 * flap, r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - Math.cos(r) * rx * 0.8, y - Math.sin(r) * rx * 0.8); ctx.lineTo(x + Math.cos(r) * rx * 0.8, y + Math.sin(r) * rx * 0.8); ctx.lineWidth = 0.8; ctx.stroke(); ctx.lineWidth = 1.8;
      });
      ctx.restore();
    },

    // HackGT tile: inside a natural-history hall, dinosaur skeletons under a skylight
    museum(ctx, W, H, o) {
      const { t, rand } = o;
      const g = (v) => `rgb(${v},${v},${v})`;
      const vx = W / 2, vy = H * 0.4;                  // vanishing point
      const bwL = W * 0.24, bwR = W * 0.76, bwT = H * 0.2, bwB = H * 0.6;

      // ceiling, side walls, floor
      ctx.fillStyle = g(40); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = g(25);
      ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(bwL, bwB); ctx.lineTo(bwR, bwB); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      // floor tiles in perspective
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 0.8;
      for (let i = -6; i <= 6; i++) line(ctx, vx + (i * (bwR - bwL)) / 12, bwB, vx + (i * W) / 5, H);
      for (let k = 1; k < 7; k++) {
        const f = Math.pow(k / 7, 1.8), y = bwB + (H - bwB) * f;
        const xl = bwL - bwL * f, xr = bwR + (W - bwR) * f;
        line(ctx, xl, y, xr, y);
      }
      // back wall with an arched doorway
      ctx.fillStyle = g(70); ctx.fillRect(bwL, bwT, bwR - bwL, bwB - bwT);
      hatch(ctx, bwL, bwT, bwR - bwL, bwB - bwT, 3, 0.35);
      ctx.fillStyle = g(15);
      const dw = (bwR - bwL) * 0.22, dh = (bwB - bwT) * 0.45;
      ctx.beginPath(); ctx.moveTo(vx - dw / 2, bwB); ctx.lineTo(vx - dw / 2, bwB - dh);
      ctx.arc(vx, bwB - dh, dw / 2, Math.PI, 0); ctx.lineTo(vx + dw / 2, bwB); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      ctx.strokeRect(bwL + 0.5, bwT + 0.5, bwR - bwL, bwB - bwT);
      line(ctx, 0, 0, bwL, bwT); line(ctx, W, 0, bwR, bwT); line(ctx, 0, H, bwL, bwB); line(ctx, W, H, bwR, bwB);
      // framed paintings on the side walls
      [[0.04, 0.16], [0.13, 0.2]].forEach(([x0, x1]) => {
        [[x0, x1], [1 - x1, 1 - x0]].forEach(([a0, a1]) => {
          const xa = W * a0, xb = W * a1;
          const yTop = (x) => bwT * (x < vx ? x / bwL : (W - x) / (W - bwR)) + H * 0.12;
          const yBot = (x) => H - (H - bwB) * (x < vx ? x / bwL : (W - x) / (W - bwR)) - H * 0.22;
          ctx.fillStyle = g(130);
          ctx.beginPath(); ctx.moveTo(xa, yTop(xa)); ctx.lineTo(xb, yTop(xb)); ctx.lineTo(xb, yBot(xb)); ctx.lineTo(xa, yBot(xa)); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
        });
      });

      // skylight and shafts of light
      ctx.fillStyle = g(210);
      ctx.beginPath(); ctx.moveTo(W * 0.3, 0); ctx.lineTo(W * 0.7, 0); ctx.lineTo(W * 0.62, bwT * 0.7); ctx.lineTo(W * 0.38, bwT * 0.7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = g(60); ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) line(ctx, W * (0.3 + i * 0.4 / 6), 0, W * (0.38 + i * 0.24 / 6), bwT * 0.7);
      line(ctx, W * 0.34, bwT * 0.35, W * 0.66, bwT * 0.35);
      const shimmer = 0.16 + Math.sin(t * 0.8) * 0.04;
      const beam = ctx.createLinearGradient(0, 0, 0, H);
      beam.addColorStop(0, `rgba(255,255,255,${shimmer + 0.1})`); beam.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = beam;
      ctx.beginPath(); ctx.moveTo(W * 0.38, bwT * 0.7); ctx.lineTo(W * 0.62, bwT * 0.7); ctx.lineTo(W * 0.85, H * 0.95); ctx.lineTo(W * 0.15, H * 0.95); ctx.closePath(); ctx.fill();

      // hanging pterosaur skeleton, swaying on its wires
      ctx.save();
      const px = W * 0.26, py = H * 0.2, sw = Math.sin(t * 0.8) * 0.08;
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 0.6;
      line(ctx, px - 8, 0, px - 6, py - 2); line(ctx, px + 8, 0, px + 6, py - 2);
      ctx.translate(px, py); ctx.rotate(sw);
      const ps = W / 260; ctx.scale(ps, ps);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(16, 0); ctx.stroke();                       // body
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(28, -4); ctx.lineTo(38, -2); ctx.stroke();    // head + beak
      ctx.beginPath(); ctx.moveTo(26, -4); ctx.lineTo(18, -12); ctx.stroke();                      // crest
      const flap = Math.sin(t * 1.6) * 3;
      [-1, 1].forEach((d) => {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, -14 * d + flap); ctx.lineTo(-30, -34 * d + flap); ctx.stroke();
        ctx.lineWidth = 0.8;
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-6 - i * 6, -14 * d - i * 5 * d + flap); ctx.lineTo(-10 + i * 3, 0); ctx.stroke(); }
        ctx.lineWidth = 2;
      });
      ctx.restore();

      // the big one: a theropod skeleton on a plinth
      ctx.save();
      const s = W / 210;
      ctx.translate(W * 0.53, H * 0.7);
      ctx.scale(s, s);
      // plinth + plaque
      ctx.fillStyle = g(110); ctx.fillRect(-72, 50, 144, 14);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2; ctx.strokeRect(-72, 50, 144, 14);
      ctx.fillStyle = g(220); ctx.fillRect(-12, 54, 24, 6);
      // mount rods
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1;
      line(ctx, -42, 50, -42, -14); line(ctx, 12, 50, 12, -24);
      ctx.strokeStyle = "#fff"; ctx.lineCap = "round";
      // spine: tail tip → hips → neck → skull
      const spine = (u) => {
        const P0 = [-95, 8], P1 = [-40, -34], P2 = [30, -22], P3 = [46, -44];
        const v = 1 - u;
        return [
          v * v * v * P0[0] + 3 * v * v * u * P1[0] + 3 * v * u * u * P2[0] + u * u * u * P3[0],
          v * v * v * P0[1] + 3 * v * v * u * P1[1] + 3 * v * u * u * P2[1] + u * u * u * P3[1],
        ];
      };
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const [x, y] = spine(i / 40); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      // vertebrae ticks
      ctx.lineWidth = 1.2;
      for (let i = 1; i < 38; i++) {
        const [x0, y0] = spine((i - 0.5) / 40), [x1, y1] = spine((i + 0.5) / 40);
        const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
        const [x, y] = spine(i / 40), len = i < 18 ? 3 : 5;
        line(ctx, x - (nx / nl) * len, y - (ny / nl) * len, x + (nx / nl) * 2, y + (ny / nl) * 2);
      }
      // ribs
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) {
        const [x, y] = spine(0.5 + i * 0.045);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 8, y + 12, x + 2, y + 24 - i * 1.5); ctx.stroke();
      }
      // legs (far one dimmer)
      const leg = (ox, a) => {
        ctx.globalAlpha = a; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(-36 + ox, -30); ctx.lineTo(-26 + ox, 2); ctx.lineTo(-34 + ox, 34); ctx.lineTo(-22 + ox, 48); ctx.stroke();
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-22 + ox, 48); ctx.lineTo(-12 + ox, 49); ctx.moveTo(-22 + ox, 48); ctx.lineTo(-14 + ox, 45); ctx.stroke();
        ctx.beginPath(); ctx.arc(-26 + ox, 2, 2.2, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      };
      leg(-8, 0.5); leg(0, 1);
      // tiny arms
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(30, -20); ctx.lineTo(36, -10); ctx.lineTo(41, -9); ctx.stroke();
      // skull + jaw that slowly opens
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(42, -52); ctx.lineTo(62, -58); ctx.lineTo(80, -50); ctx.lineTo(80, -44); ctx.lineTo(46, -40); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(56, -51, 3, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(68, -48, 4, 2.5, -0.2, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1;
      for (let x = 52; x < 79; x += 4) line(ctx, x, -43, x + 1, -39.5);
      const jaw = 0.06 + 0.16 * Math.max(0, Math.sin(t * 1.1));
      ctx.save(); ctx.translate(46, -40); ctx.rotate(jaw);
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(32, 1); ctx.lineTo(30, 6); ctx.lineTo(2, 7); ctx.closePath(); ctx.stroke();
      ctx.lineWidth = 1;
      for (let x = 8; x < 31; x += 4) line(ctx, x, 1, x + 1, -2.5);
      ctx.restore();
      ctx.restore();

      // velvet ropes in front
      const ropeY = H * 0.93;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4;
      [W * 0.1, W * 0.5, W * 0.9].forEach((x) => { line(ctx, x, ropeY, x, ropeY - H * 0.07); ctx.beginPath(); ctx.arc(x, ropeY - H * 0.075, 2, 0, TAU); ctx.stroke(); });
      ctx.lineWidth = 1.8;
      [[0.1, 0.5], [0.5, 0.9]].forEach(([a, b]) => {
        ctx.beginPath(); ctx.moveTo(W * a, ropeY - H * 0.065);
        ctx.quadraticCurveTo(W * (a + b) / 2, ropeY - H * 0.01 + Math.sin(t * 1.3 + a * 5), W * b, ropeY - H * 0.065); ctx.stroke();
      });

      // dust drifting through the light
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 40; i++) {
        const bx = W * (0.25 + rand() * 0.5), sp = 2 + rand() * 4, ph = rand() * H;
        const y = (ph + t * sp) % H;
        ctx.globalAlpha = 0.25 + rand() * 0.5;
        ctx.fillRect(bx + Math.sin(t * 0.7 + i) * 4, y, 1, 1);
      }
      ctx.globalAlpha = 1;
    },

    // iQuHACK tile: a rubber duck bobbing on water, with orbiting "qubits"
    duck(ctx, W, H, o) {
      const { t } = o;
      const m = Math.min(W, H);
      const water = H * 0.7;
      const bob = Math.sin(t * 1.6) * H * 0.012, tilt = Math.sin(t * 1.6 + 0.6) * 0.05;
      const dx = W * 0.5, dy = water - m * 0.06 + bob;

      // ripples
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.8;
      for (let k = 0; k < 3; k++) {
        const p = (t * 0.35 + k / 3) % 1;
        ctx.globalAlpha = 1 - p;
        ctx.beginPath(); ctx.ellipse(dx, water + 2, m * (0.2 + p * 0.35), m * (0.03 + p * 0.05), 0, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // orbit rings with electrons (behind)
      const orbit = (rot, speed, front) => {
        ctx.save(); ctx.translate(dx, dy - m * 0.08); ctx.rotate(rot);
        ctx.setLineDash([2, 3]); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.ellipse(0, 0, m * 0.36, m * 0.09, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke();
        ctx.setLineDash([]);
        const a = t * speed;
        if ((Math.sin(a) > 0) === front) {
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(Math.cos(a) * m * 0.36, Math.sin(a) * m * 0.09, 2.5, 0, TAU); ctx.fill();
        }
        ctx.restore();
      };
      orbit(-0.35, 1.3, false); orbit(0.45, -1.0, false);

      ctx.save();
      ctx.translate(dx, dy); ctx.rotate(tilt);
      const s = m * 0.0048; ctx.scale(s, s);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.8;
      const shade = (cx, cy, r) => {
        const gr = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.5, r * 0.1, cx, cy, r * 1.2);
        gr.addColorStop(0, "rgb(245,245,245)"); gr.addColorStop(1, "rgb(120,120,120)");
        return gr;
      };
      // body + tail
      ctx.beginPath();
      ctx.moveTo(-40, 4); ctx.quadraticCurveTo(-56, -22, -46, -24); ctx.quadraticCurveTo(-36, -12, -24, -10);
      ctx.quadraticCurveTo(0, -8, 14, -6); ctx.quadraticCurveTo(44, 0, 38, 18);
      ctx.quadraticCurveTo(28, 34, -6, 34); ctx.quadraticCurveTo(-38, 32, -40, 4);
      ctx.fillStyle = shade(-4, 6, 40); ctx.fill(); ctx.stroke();
      // wing
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-26, 6); ctx.quadraticCurveTo(-8, -6, 8, 8); ctx.quadraticCurveTo(-6, 22, -26, 6); ctx.stroke();
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-20 + i * 7, 10 + i); ctx.lineTo(-12 + i * 7, 6 + i * 2); ctx.stroke(); }
      ctx.lineWidth = 1.8;
      // head
      ctx.beginPath(); ctx.arc(20, -26, 18, 0, TAU);
      ctx.fillStyle = shade(20, -26, 18); ctx.fill(); ctx.stroke();
      // beak
      ctx.beginPath(); ctx.moveTo(34, -26); ctx.quadraticCurveTo(54, -28, 52, -18); ctx.quadraticCurveTo(44, -12, 33, -17);
      ctx.fillStyle = "rgb(250,250,250)"; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(36, -21); ctx.lineTo(50, -21); ctx.lineWidth = 1; ctx.stroke(); ctx.lineWidth = 1.8;
      // eye
      ctx.beginPath(); ctx.arc(26, -31, 3.4, 0, TAU); ctx.fillStyle = "rgb(15,15,15)"; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(26, -33, 1.6, 1.6);
      ctx.restore();

      // water in front hides the duck's underside
      ctx.fillStyle = "rgb(70,70,70)"; ctx.fillRect(0, water, W, H - water);
      for (let y = water; y < H; y += 3) {
        ctx.strokeStyle = `rgba(255,255,255,${0.15 + 0.3 * ((y - water) / (H - water))})`; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 3) {
          const yy = y + Math.sin(x * 0.12 + t * 2 + y * 0.3) * 1.2;
          if (x) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 2) { const yy = water + Math.sin(x * 0.1 + t * 2) * 1.5; if (x) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); }
      ctx.stroke();

      orbit(-0.35, 1.3, true); orbit(0.45, -1.0, true);

      // bubbles
      for (let i = 0; i < 6; i++) {
        const p = (t * 0.25 + i / 6) % 1;
        const x = dx + Math.sin(i * 2.3) * m * 0.3, y = water - p * H * 0.55;
        ctx.globalAlpha = 1 - p; ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(x + Math.sin(t * 2 + i) * 2, y, 1.5 + i % 3, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },

    // Footer: a drifting constellation of interests (systems, ML, fusion, markets, …)
    interests(ctx, W, H, o) {
      const { t, rand } = o;
      for (let i = 0; i < W * H * 0.002; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.45})`;
        ctx.fillRect(rand() * W, rand() * H, 1, 1);
      }
      const g = (v) => `rgb(${v},${v},${v})`;
      const L = (x1, y1, x2, y2) => line(ctx, x1, y1, x2, y2);
      // each icon is drawn around (0,0) in a ~[-1,1] box, then scaled
      const ICONS = [
        function database() {
          for (let k = 0; k < 3; k++) {
            const y = -0.6 + k * 0.5;
            ctx.fillStyle = g(90 + k * 30);
            ctx.beginPath(); ctx.ellipse(0, y + 0.25, 0.7, 0.22, 0, 0, Math.PI); ctx.lineTo(-0.7, y); ctx.ellipse(0, y, 0.7, 0.22, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill(); ctx.stroke();
          }
          ctx.beginPath(); ctx.ellipse(0, -0.6, 0.7, 0.22, 0, 0, TAU); ctx.fillStyle = g(200); ctx.fill(); ctx.stroke();
        },
        function server() {
          ctx.fillStyle = g(40); ctx.fillRect(-0.6, -0.9, 1.2, 1.8); ctx.strokeRect(-0.6, -0.9, 1.2, 1.8);
          for (let k = 0; k < 4; k++) {
            const y = -0.75 + k * 0.42;
            ctx.strokeRect(-0.48, y, 0.96, 0.3);
            ctx.fillStyle = Math.sin(t * 6 + k * 1.9) > 0 ? "#fff" : g(90);
            ctx.fillRect(0.28, y + 0.1, 0.1, 0.1);
          }
        },
        function neuralNet() {
          const layers = [[-0.8, 3], [0, 4], [0.8, 2]];
          const pts = layers.map(([x, n]) => Array.from({ length: n }, (_, i) => [x, (i - (n - 1) / 2) * 0.5]));
          ctx.globalAlpha *= 0.7;
          for (let l = 0; l < 2; l++) for (const a of pts[l]) for (const b of pts[l + 1]) L(a[0], a[1], b[0], b[1]);
          ctx.globalAlpha /= 0.7;
          pts.flat().forEach(([x, y], i) => {
            ctx.beginPath(); ctx.arc(x, y, 0.13, 0, TAU);
            ctx.fillStyle = Math.sin(t * 3 + i) > 0.3 ? "#fff" : g(60); ctx.fill(); ctx.stroke();
          });
        },
        function chip() {
          ctx.fillStyle = g(70); ctx.fillRect(-0.6, -0.6, 1.2, 1.2); ctx.strokeRect(-0.6, -0.6, 1.2, 1.2);
          ctx.fillStyle = g(170); ctx.fillRect(-0.3, -0.3, 0.6, 0.6);
          for (let k = -2; k <= 2; k++) {
            const p = k * 0.22;
            L(p, -0.6, p, -0.85); L(p, 0.6, p, 0.85); L(-0.6, p, -0.85, p); L(0.6, p, 0.85, p);
          }
        },
        function tokamak() {
          ctx.lineWidth *= 2.4; ctx.strokeStyle = g(230);
          ctx.beginPath(); ctx.ellipse(0, 0, 0.75, 0.28, 0, 0, TAU); ctx.stroke();
          ctx.lineWidth /= 2.4; ctx.strokeStyle = "#fff";
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * TAU, x = Math.cos(a) * 0.75, y = Math.sin(a) * 0.28;
            ctx.beginPath(); ctx.ellipse(x, y, 0.08 + Math.abs(Math.cos(a)) * 0.06, 0.3, 0, 0, TAU); ctx.stroke();
          }
        },
        function orbit() {
          ctx.beginPath(); ctx.arc(0, 0, 0.18, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill();
          [[0.85, 0.35, 0.4], [0.85, 0.35, -0.6]].forEach(([rx, ry, r], k) => {
            ctx.save(); ctx.rotate(r);
            ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke();
            const a = t * (1.2 + k * 0.5);
            ctx.beginPath(); ctx.arc(Math.cos(a) * rx, Math.sin(a) * ry, 0.09, 0, TAU); ctx.fill();
            ctx.restore();
          });
        },
        function blocks() {
          for (let k = 0; k < 3; k++) {
            const x = -0.85 + k * 0.62;
            ctx.fillStyle = g(60 + k * 40); ctx.fillRect(x, -0.22, 0.42, 0.42); ctx.strokeRect(x, -0.22, 0.42, 0.42);
            L(x + 0.08, -0.1, x + 0.34, -0.1); L(x + 0.08, 0.02, x + 0.26, 0.02);
            if (k < 2) L(x + 0.42, 0, x + 0.62, 0);
          }
        },
        function probability() {
          // histogram with a bell curve over it
          L(-0.9, 0.8, 0.9, 0.8);
          const bars = 9;
          for (let k = 0; k < bars; k++) {
            const x = -0.85 + k * 0.19, u = (x + 0.095) / 0.45;
            const h = 1.4 * Math.exp(-0.5 * u * u) * (0.9 + 0.1 * Math.sin(t * 2 + k));
            ctx.fillStyle = Math.abs(u) < 0.5 ? "#fff" : g(90);
            ctx.fillRect(x, 0.8 - h, 0.15, h); ctx.strokeRect(x, 0.8 - h, 0.15, h);
          }
          ctx.beginPath();
          for (let k = 0; k <= 40; k++) {
            const x = -0.9 + k * 0.045, u = x / 0.45, y = 0.8 - 1.55 * Math.exp(-0.5 * u * u);
            if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.stroke();
        },
        function linux() {
          // an original little penguin for Linux
          ctx.fillStyle = g(40);
          ctx.beginPath(); ctx.ellipse(0, 0.12, 0.62, 0.8, 0, 0, TAU); ctx.fill(); ctx.stroke();          // body
          ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.ellipse(0, 0.26, 0.4, 0.58, 0, 0, TAU); ctx.fill();                          // belly
          ctx.fillStyle = g(40);
          ctx.beginPath(); ctx.arc(0, -0.5, 0.42, 0, TAU); ctx.fill(); ctx.stroke();                        // head
          ctx.fillStyle = "#fff";
          [-0.15, 0.15].forEach((x) => { ctx.beginPath(); ctx.ellipse(x, -0.56, 0.11, 0.14, 0, 0, TAU); ctx.fill(); });
          ctx.fillStyle = g(10);
          [-0.13, 0.13].forEach((x) => { ctx.beginPath(); ctx.arc(x, -0.54, 0.05, 0, TAU); ctx.fill(); });  // pupils
          ctx.fillStyle = g(220);
          ctx.beginPath(); ctx.moveTo(-0.16, -0.36); ctx.lineTo(0.16, -0.36); ctx.lineTo(0, -0.2); ctx.closePath(); ctx.fill(); ctx.stroke(); // beak
          ctx.beginPath(); ctx.ellipse(-0.28, 0.92, 0.22, 0.09, 0, 0, TAU); ctx.fill(); ctx.stroke();      // feet
          ctx.beginPath(); ctx.ellipse(0.28, 0.92, 0.22, 0.09, 0, 0, TAU); ctx.fill(); ctx.stroke();
        },
        function gitGraph() {
          const nodes = [[-0.8, 0.4], [-0.3, 0.4], [0.2, 0.4], [0.75, 0.4], [-0.05, -0.35], [0.45, -0.35]];
          L(-0.8, 0.4, 0.75, 0.4);
          ctx.beginPath(); ctx.moveTo(-0.3, 0.4); ctx.quadraticCurveTo(-0.3, -0.35, -0.05, -0.35); ctx.lineTo(0.45, -0.35); ctx.quadraticCurveTo(0.75, -0.35, 0.75, 0.4); ctx.stroke();
          nodes.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 0.11, 0, TAU); ctx.fillStyle = g(40); ctx.fill(); ctx.stroke(); });
        },
      ];

      // a row of icon tiles drifting along a track, with data packets flowing between them
      const n = ICONS.length;
      const size = H * 0.25;                       // icon scale (icons are drawn in a ~[-1,1] box)
      const tile = size * 1.45;                    // half-width of each tile
      const spacing = Math.max(tile * 3.6, W / 6.5);
      const total = n * spacing;
      const shift = (t * 14) % total;
      const trackY = H * 0.5;

      const roundRect = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      };

      // track
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1;
      L(0, trackY, W, trackY);
      // packets: little bright dashes flowing left-to-right along the track
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 18; i++) {
        const px = ((i / 18) * (W + 40) + t * 45) % (W + 40) - 20;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(i * 2.3);
        ctx.fillRect(px, trackY - 1, 4, 2);
      }
      ctx.globalAlpha = 1;

      for (let k = 0; k < n; k++) {
        let x = k * spacing - shift + spacing / 2;
        if (x < -spacing) x += total;
        if (x > W + spacing) continue;
        const bob = Math.sin(t * 0.9 + k * 1.7) * H * 0.04;
        const y = trackY + bob;
        // tile: drop shadow, body, highlight edge
        ctx.fillStyle = "rgba(0,0,0,.9)";
        roundRect(x - tile + 2, y - tile + 3, tile * 2, tile * 2, tile * 0.28); ctx.fill();
        ctx.fillStyle = "rgb(55,55,55)";
        roundRect(x - tile, y - tile, tile * 2, tile * 2, tile * 0.28); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.35)";
        L(x - tile * 0.7, y - tile + 2, x + tile * 0.7, y - tile + 2);
        // connector stub to the track (tiles hang on the line)
        ctx.strokeStyle = "rgba(255,255,255,.5)";
        L(x, trackY, x, y);
        // icon
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(t * 0.5 + k) * 0.06);
        ctx.scale(size, size);
        ctx.lineWidth = 1.4 / size;
        ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.globalAlpha = 1;
        ICONS[k]();
        ctx.restore();
      }
    },

    // Options Pricing: a rotating Black–Scholes price surface over (strike, time to expiry),
    // and accept–reject sampling filling in a skewed target distribution
    options(ctx, W, H, o) {
      const { t, seed } = o;
      const erf = (x) => { // Abramowitz–Stegun 7.1.26
        const sg = Math.sign(x); x = Math.abs(x);
        const k = 1 / (1 + 0.3275911 * x);
        return sg * (1 - (((((1.061405429 * k - 1.453152027) * k) + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-x * x));
      };
      const N = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
      const S0 = 1, r = 0.03, sig = 0.4;
      const call = (K, tau) => {
        const d1 = (Math.log(S0 / K) + (r + sig * sig / 2) * tau) / (sig * Math.sqrt(tau));
        return S0 * N(d1) - K * Math.exp(-r * tau) * N(d1 - sig * Math.sqrt(tau));
      };

      /* ── top: 3D wireframe of C(K, tau), auto-fitted into its panel ── */
      const top = H * 0.05, bottom = H * 0.55, left = W * 0.06, right = W * 0.94;
      // sway between flattering angles instead of spinning edge-on
      const a = 0.75 + Math.sin(t * 0.35) * 0.45, ca = Math.cos(a), sa = Math.sin(a);
      const kMin = 0.6, kMax = 1.4, tMin = 0.05, tMax = 1;
      const raw = (K, tau) => {
        const x = ((K - kMin) / (kMax - kMin)) * 2 - 1, y = ((tau - tMin) / (tMax - tMin)) * 2 - 1;
        const z = call(K, tau) / 0.45;
        return [x * ca - y * sa, (x * sa + y * ca) * 0.32 - z * 2.1, z];
      };
      const NK = 14, NT = 10, steps = 20;
      // fit: bounding box of the projected surface + floor corners → panel
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i <= NK; i++) for (let j = 0; j <= NT; j++) {
        const [px, py] = raw(kMin + ((kMax - kMin) * i) / NK, tMin + ((tMax - tMin) * j) / NT);
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      }
      const floorPt = (x, y) => [x * ca - y * sa, (x * sa + y * ca) * 0.32];
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const [px, py] = floorPt(x, y);
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      }
      const fit = Math.min((right - left) / (maxX - minX), (bottom - top) / (maxY - minY));
      const ox = (left + right) / 2 - ((minX + maxX) / 2) * fit, oy = (top + bottom) / 2 - ((minY + maxY) / 2) * fit;
      const proj = (K, tau) => { const [px, py, z] = raw(K, tau); return [ox + px * fit, oy + py * fit, z]; };
      // floor outline
      ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 0.6; ctx.setLineDash([1, 2]);
      ctx.beginPath();
      [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].forEach(([x, y], i) => {
        const [px, py] = floorPt(x, y);
        if (i) ctx.lineTo(ox + px * fit, oy + py * fit); else ctx.moveTo(ox + px * fit, oy + py * fit);
      });
      ctx.stroke(); ctx.setLineDash([]);
      {
        const [px, py] = floorPt(-1, 1);
        ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 0.8;
        line(ctx, ox + px * fit, oy + py * fit, ox + px * fit, oy + (py - 2.1) * fit);
      }
      // wireframe: lines of constant strike and constant expiry, brighter where the price is higher
      const wire = (fixedK, fixedT) => {
        for (let i = 0; i < steps; i++) {
          const u0 = i / steps, u1 = (i + 1) / steps;
          const p0 = fixedK != null ? proj(fixedK, tMin + (tMax - tMin) * u0) : proj(kMin + (kMax - kMin) * u0, fixedT);
          const p1 = fixedK != null ? proj(fixedK, tMin + (tMax - tMin) * u1) : proj(kMin + (kMax - kMin) * u1, fixedT);
          ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.65 * Math.min(1, (p0[2] + p1[2]) / 2)})`;
          line(ctx, p0[0], p0[1], p1[0], p1[1]);
        }
      };
      ctx.lineWidth = 0.8;
      for (let i = 0; i <= NK; i++) wire(kMin + ((kMax - kMin) * i) / NK, null);
      for (let j = 0; j <= NT; j++) wire(null, tMin + ((tMax - tMin) * j) / NT);

      /* ── bottom: accept–reject sampling ── */
      const L = W * 0.08, R = W * 0.92, T = H * 0.62, B = H * 0.95;
      const f = (u) => Math.pow(u, 1.4) * Math.exp(-5.5 * u);           // right-skewed target density
      const fMax = f(1.4 / 5.5);
      const X = (u) => L + u * (R - L), Y = (v) => B - v * (B - T);
      // envelope c·h(x): uniform proposal scaled to the max density
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 0.8; ctx.setLineDash([2, 2]);
      ctx.strokeRect(L + 0.5, T + 0.5, R - L, B - T);
      ctx.setLineDash([]);

      const bins = 18, counts = new Array(bins).fill(0);
      const cycle = 420, shown = 90 + Math.floor((t * 30) % (cycle - 90));
      const rng = mulberry32(seed * 7 + Math.floor((t * 30) / (cycle - 90)));
      const pts = [];
      for (let i = 0; i < shown; i++) {
        const u = rng(), v = rng();                                       // candidate + uniform draw
        const ok = v <= f(u) / fMax;                                      // accept if under the target
        if (ok) counts[Math.min(bins - 1, Math.floor(u * bins))]++;
        pts.push([u, v, ok, i]);
      }
      // histogram of accepted samples, scaled to the curve
      const area = counts.reduce((s, c) => s + c, 0) || 1;
      const norm = 1 / (area / bins) * (1 / 3.2);
      for (let k = 0; k < bins; k++) {
        const h = Math.min(1, counts[k] * norm);
        ctx.fillStyle = "rgba(255,255,255,.28)";
        ctx.fillRect(X(k / bins) + 1, Y(h), (R - L) / bins - 2, Y(0) - Y(h));
      }
      // target density curve
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) { const u = i / 60, y = Y(f(u) / fMax); if (i) ctx.lineTo(X(u), y); else ctx.moveTo(X(u), y); }
      ctx.stroke();
      // samples: accepted = bright dots, rejected = dim ticks; the newest one pulses
      for (const [u, v, ok, i] of pts) {
        const x = X(u), y = Y(v);
        if (ok) { ctx.fillStyle = "#fff"; ctx.fillRect(x - 1, y - 1, 2, 2); }
        else { ctx.fillStyle = "rgba(255,255,255,.3)"; ctx.fillRect(x, y, 1, 1); }
        if (i === shown - 1) {
          ctx.strokeStyle = ok ? "#fff" : "rgba(255,255,255,.6)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.stroke();
          ctx.setLineDash([1, 2]); line(ctx, x, B, x, y); ctx.setLineDash([]);
        }
      }
      // divider between the two panels
      ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 0.6;
      line(ctx, W * 0.06, H * 0.575, W * 0.94, H * 0.575);
    },

    // Soft domain-warped marble, for backgrounds behind text
    flow(ctx, W, H, o) {
      const { fbm, t } = o;
      const s = 2.4 / Math.min(W, H);
      pixelPass(ctx, W, H, (x, y) => {
        const qx = fbm(x * s, y * s, 4), qy = fbm(x * s + 5.2, y * s + 1.3, 4);
        const n = fbm(x * s + 3 * qx + t * 0.02, y * s + 3 * qy, 5);
        const vein = Math.abs(Math.sin(n * 22));
        return 0.3 + 0.28 * n + (vein < 0.08 ? 0.3 : 0);
      });
    },
  };

  /* ── image scene: dither your own pictures ───────────────── */
  const imageCache = new Map();
  function loadImage(src) {
    if (!imageCache.has(src)) {
      imageCache.set(src, new Promise((res, rej) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
      }));
    }
    return imageCache.get(src);
  }

  /* ── dithering ───────────────────────────────────────────── */
  function dither(ctx, W, H, palette, opts) {
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const N = W * H;
    const buf = new Float32Array(N);
    const { contrast = 1, bias = 0, grain = 0.06, rand } = opts;
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      let v = d[j] / 255;
      v = (v - 0.5) * contrast + 0.5 + bias + (rand() - 0.5) * grain;
      buf[i] = v;
    }
    const L = palette.length - 1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const old = buf[i];
        let q = Math.round(old * L);
        q = q < 0 ? 0 : q > L ? L : q;
        const err = old - q / L;
        const c = palette[q], j = i * 4;
        d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255;
        if (x + 1 < W) buf[i + 1] += err * 0.4375;
        if (y + 1 < H) {
          if (x > 0) buf[i + W - 1] += err * 0.1875;
          buf[i + W] += err * 0.3125;
          if (x + 1 < W) buf[i + W + 1] += err * 0.0625;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /* ── one canvas instance ─────────────────────────────────── */
  class Art {
    constructor(el) {
      this.el = el;
      this.ctx = el.getContext("2d", { willReadFrequently: true });
      this.name = el.dataset.art;
      this.seed = parseInt(el.dataset.seed || "1", 10);
      this.palette = PAL_RGB[el.dataset.palette] || PAL_RGB.blue;
      this.cell = parseFloat(el.dataset.cell || "2");
      this.animate = reduceMotion ? null : el.dataset.animate || null;
      this.contrast = parseFloat(el.dataset.contrast || "1");
      this.bias = parseFloat(el.dataset.bias || "0");
      this.noise = makeNoise(this.seed);
      this.t = this.seed * 3.7;
      this.visible = false;
      this.hovered = false;
      this.last = 0;
      this.raf = 0;
      this.frame = 0;
      this.tick = this.tick.bind(this);

      if (this.animate === "hover") {
        const host = el.closest("a, .card, .tile") || el;
        host.addEventListener("pointerenter", () => { this.hovered = true; this.start(); });
        host.addEventListener("pointerleave", () => { this.hovered = false; });
      }
    }

    get wantsMotion() {
      if (!this.animate || !this.visible) return false;
      if (this.animate === "hover") return this.hovered;
      return true;
    }

    resize() {
      const r = this.el.getBoundingClientRect();
      const W = Math.max(8, Math.round(r.width / this.cell));
      const H = Math.max(8, Math.round(r.height / this.cell));
      if (W === this.W && H === this.H) return false;
      this.W = this.el.width = W;
      this.H = this.el.height = H;
      return true;
    }

    async render() {
      const { ctx, W, H } = this;
      if (!W || !H) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      const o = {
        rand: mulberry32(this.seed),
        seed: this.seed,
        t: this.t,
        fbm: this.noise.fbm,
        noise: this.noise.noise,
        el: this.el,
      };

      if (this.name === "image") {
        try {
          const img = await loadImage(this.el.dataset.src);
          const s = Math.max(W / img.width, H / img.height);
          const w = img.width * s, h = img.height * s;
          ctx.filter = "grayscale(1)";
          ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
          ctx.filter = "none";
        } catch (e) {
          return;
        }
      } else {
        const scene = SCENES[this.name];
        if (!scene) return;
        scene(ctx, W, H, o);
      }

      try {
        dither(ctx, W, H, this.palette, {
          contrast: this.contrast,
          bias: this.bias,
          rand: mulberry32(this.seed * 31 + this.frame),
        });
      } catch (e) {
        // A cross-origin image taints the canvas; fall back to a CSS duotone.
        this.fallback();
      }
    }

    fallback() {
      if (this.el.dataset.fallback) return;
      this.el.dataset.fallback = "1";
      const img = document.createElement("img");
      img.src = this.el.dataset.src;
      img.alt = "";
      img.style.cssText =
        "width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.2);mix-blend-mode:screen;display:block";
      const wrap = document.createElement("div");
      wrap.style.cssText = "width:100%;height:100%;background:#0000f2";
      wrap.appendChild(img);
      this.el.replaceWith(wrap);
    }

    start() {
      if (!this.raf && this.wantsMotion) {
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.tick);
      }
    }

    tick(now) {
      this.raf = 0;
      if (!this.wantsMotion) return;
      const dt = now - this.last;
      // ~15fps: reads as a flickering print rather than smooth video
      if (dt >= 66) {
        this.t += Math.min(dt, 200) / 1000;
        this.frame++;
        this.last = now;
        this.render();
      }
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  /* ── boot ────────────────────────────────────────────────── */
  const arts = [];
  function boot() {
    document.querySelectorAll("canvas.art[data-art]").forEach((el) => arts.push(new Art(el)));

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const a = arts.find((x) => x.el === e.target);
          if (!a) continue;
          a.visible = e.isIntersecting;
          if (a.visible) {
            if (a.resize() || !a.drawn) { a.drawn = true; a.render(); }
            a.start();
          }
        }
      },
      { rootMargin: "200px" }
    );
    arts.forEach((a) => io.observe(a.el));

    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        arts.forEach((a) => {
          if (!a.resize()) return;
          if (a.visible) a.render();
          else a.drawn = false;
        });
      }, 150);
    });
  }

  const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  const go = () => ready.then(boot, boot);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
})();

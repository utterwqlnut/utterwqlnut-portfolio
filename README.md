# Portfolio template

A single-page portfolio in a cobalt-and-paper, print-engraving style. It's plain HTML, CSS and JS with no build step and no dependencies, so it runs on GitHub Pages, Netlify, Vercel or any static host.

## Run it

```bash
python3 -m http.server 4173
# open http://localhost:4173
```

Opening `index.html` directly also works. The one exception is dithering your own images (`data-art="image"`), which needs a local server.

## Make it yours

1. **`js/config.js`**: your name, wordmark, email, links, Google Scholar stats, publications and skills. Any element with `data-bind="…"` or `data-href="…"` in the HTML gets filled from here.
2. **`index.html`**: hero headline, project cards, experience accordion and toolkit columns. Every section is a plain block of markup, so copy a card to add another.
3. **`assets/resume.pdf`**: drop your résumé here (or change `links.resume`).

## Sections

| Section | What it is |
| --- | --- |
| Header | Spread nav, stacked wordmark, social icons, résumé dropdown. A compact paper bar slides in after the hero. |
| Hero | Thin condensed headline, CTA pair, tabbed "reach me via terminal" command box with copy, animated generative art. |
| Find Me Online | Three textured tiles for GitHub, LinkedIn and Writing. |
| Projects | Six cards with label, title, blurb and art. The art animates on hover. |
| Experience | An accordion of roles. |
| Toolkit | Skill chips, a wide banner and four "tier" columns with checklists. |
| Footers | A paper footer with a giant watermark, then a full-height blue footer that un-blurs as you scroll into it. |

## The art

Nothing in this template is a bitmap. Each `<canvas class="art">` is drawn in grayscale by a small scene function in `js/art.js`, then error-diffusion dithered into a four-tone blue palette.

```html
<canvas class="art" data-art="orbit" data-seed="5" data-animate="hover"></canvas>
```

| Attribute | Values |
| --- | --- |
| `data-art` | Hero: `explosion`. Projects: `network` (dInference), `hashring` (UtterDB), `montecarlo` (Insider Flagger), `ensemble` (Kalshi), `options` (Options Pricing), `membits` (WASM). Other: `nbody` `sunburst` `planet` `orbit` `waves` `type` `vortex` `terrain` `corridor` `flow` `image` |
| `data-seed` | Any integer. Changes the composition. |
| `data-palette` | `blue` (default), `deep` (blends into the page blue), `mid` (lighter) |
| `data-animate` | `always`, `visible`, `hover`, or omit for static |
| `data-text` | The lettering for the `type` scene |
| `data-cell` | CSS px per dot (default `2`). Larger values look chunkier. |

**Using your own screenshots in the same style:**

```html
<canvas class="art" data-art="image" data-src="assets/my-project.png"></canvas>
```

## Fonts

Antonio (display), Barlow Condensed (UI labels), Geist (body), Geist Mono (labels and terminal) and EB Garamond (lettering in art). All come from Google Fonts. Swap them via the `--f-*` variables at the top of `css/style.css`.

## Accessibility

- Respects `prefers-reduced-motion`: no grain, no reveals, no art animation.
- Has a skip link, labelled icon buttons, `aria-expanded` on menus and the accordion, and visible focus rings.
- Without JS, all content is still in the HTML. Only the art needs scripts.

## utter (the chat blob)

utter lives in the bottom-right corner and answers visitors' questions about Dhruva: experience, projects (with GitHub links), papers (with links), skills, and interests.

- **`js/utter.js`**: the blob, the chat panel, and a built-in fallback answerer that works on any static host.
- **`api/chat.js`**: a Vercel serverless function that calls Claude Sonnet 5.5 at `low` effort. Its system prompt only allows questions about Dhruva. Code requests, general questions, and attempts to change its instructions get a polite redirect.
- **`api/_knowledge.js`**: everything utter is allowed to say. Edit this when anything changes. The `KB` list in `js/utter.js` holds the fallback answers.

To turn on Claude-powered answers:

1. **Locally:** copy `.env.example` to `.env`, paste your key after `ANTHROPIC_API_KEY=`, and run `node --env-file=.env dev-server.mjs`, then open http://localhost:4174. (`npx vercel dev` also works if you're logged in to Vercel. `.env` is gitignored.)
2. **Deployed:** the `.env` file isn't uploaded, so add `ANTHROPIC_API_KEY` in Vercel → Project → Settings → Environment Variables, then redeploy.
3. `PORTFOLIO.agent.endpoint` in `js/config.js` already points at `/api/chat`.

If the endpoint isn't reachable (for example on GitHub Pages, in a local preview, or with no key set), utter quietly switches to the built-in answers.

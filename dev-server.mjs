// Local preview with utter's Claude answers working, no Vercel account needed.
//   node --env-file=.env dev-server.mjs      → http://localhost:4174
// Serves the static site and routes POST /api/chat to api/chat.js (same handler Vercel runs).
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import handler from "./api/chat.js";

const PORT = Number(process.env.PORT) || 4174;
const ROOT = path.resolve(".");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".pdf": "application/pdf",
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/chat") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
      // minimal Vercel-style response helpers
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (data) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); return res; };
      return handler(req, res);
    }

    // static files (never serve anything outside the project, or dotfiles like .env)
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.resolve(ROOT, "." + rel);
    if (!file.startsWith(ROOT + path.sep) || rel.split("/").some((p) => p.startsWith(".")) || rel.startsWith("/api/")) {
      res.writeHead(404).end("Not found");
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" }).end(data);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(PORT, () => console.log(`Portfolio + utter running at http://localhost:${PORT}`));

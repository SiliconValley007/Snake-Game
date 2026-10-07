import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = join(process.cwd(), "dist");
const PREFIX = "/viper";
const PORT = Number(process.env.LHCI_PORT || 4174);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
};

http
  .createServer(async (req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    if (url === "/" || url === "") {
      res.writeHead(302, { Location: PREFIX + "/" });
      res.end();
      return;
    }
    if (!url.startsWith(PREFIX)) {
      res.writeHead(404);
      res.end();
      return;
    }
    let rel = url.slice(PREFIX.length) || "/";
    if (rel.endsWith("/")) rel += "index.html";
    const file = normalize(join(ROOT, rel.replace(/^\/+/, "")));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      if (!existsSync(file)) throw new Error("missing");
      const st = statSync(file);
      if (st.isDirectory()) {
        res.writeHead(302, { Location: url.endsWith("/") ? url : url + "/" });
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      createReadStream(file).pipe(res);
    } catch {
      try {
        const fb = await readFile(join(ROOT, "404.html"));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(fb);
      } catch {
        res.writeHead(404);
        res.end();
      }
    }
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log("Local: http://127.0.0.1:" + PORT + PREFIX + "/");
  });

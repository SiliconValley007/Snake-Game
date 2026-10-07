import { defineConfig } from "vite";
import { writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function listFiles(dir, base = "") {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + "/" + name.name : name.name;
    if (name.isDirectory()) out.push(...listFiles(join(dir, name.name), rel));
    else out.push("./" + rel.replace(/\\/g, "/"));
  }
  return out;
}

function siteUrl() {
  const raw = (process.env.SITE_URL || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw.endsWith("/") ? raw : raw + "/");
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.href;
  } catch {
    return "";
  }
}

function ogPlugin() {
  return {
    name: "og-site-url",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const base = siteUrl();
        if (!base) return html;
        const img = base + "icons/og-card.png";
        return html
          .replace(
            /property="og:url" content="[^"]*"/,
            'property="og:url" content="' + base + '"',
          )
          .replace(
            /property="og:image" content="[^"]*"/,
            'property="og:image" content="' + img + '"',
          )
          .replace(
            /name="twitter:image" content="[^"]*"/,
            'name="twitter:image" content="' + img + '"',
          );
      },
    },
  };
}

function swPlugin() {
  return {
    name: "sw-precache",
    closeBundle() {
      const dist = join(process.cwd(), "dist");
      const files = listFiles(dist).filter((f) => !f.endsWith("/sw.js"));
      const precache = ["./", ...files];
      const hash = Date.now().toString(36);
      let src = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
      src = src
        .replace('const VERSION = "dev";', 'const VERSION = "' + hash + '";')
        .replace(
          /const PRECACHE = \[[^\]]*\];/,
          "const PRECACHE = " + JSON.stringify(precache) + ";",
        );
      writeFileSync(join(dist, "sw.js"), src);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [ogPlugin(), swPlugin()],
  server: {
    host: true,
    allowedHosts: [".monkeycode-ai.live"],
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: [".monkeycode-ai.live", "localhost", "127.0.0.1"],
  },
  build: {
    target: "es2020",
    sourcemap: false,
    assetsDir: "assets",
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
});

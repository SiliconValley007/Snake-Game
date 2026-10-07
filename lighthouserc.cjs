const { existsSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { homedir } = require("node:os");

function findChrome() {
  const env = process.env.CHROME_PATH;
  if (env && existsSync(env)) return env;
  const cache = join(homedir(), ".cache/ms-playwright");
  if (existsSync(cache)) {
    for (const name of readdirSync(cache)) {
      if (!name.startsWith("chromium-")) continue;
      const p = join(cache, name, "chrome-linux64/chrome");
      if (existsSync(p)) return p;
    }
  }
  for (const p of ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"]) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

const chromePath = findChrome();
const chromeArgs = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];

module.exports = {
  ci: {
    collect: {
      startServerCommand: "node scripts/preview-subpath.mjs",
      startServerReadyPattern: "Local:",
      url: ["http://127.0.0.1:4174/viper/"],
      numberOfRuns: 1,
      puppeteerScript: "./scripts/lhci-puppeteer.cjs",
      puppeteerLaunchOptions: {
        executablePath: chromePath,
        args: chromeArgs,
      },
      settings: {
        preset: "desktop",
        throttlingMethod: "provided",
        chromePath,
        chromeFlags: chromeArgs.join(" "),
        skipAudits: ["uses-http2", "total-blocking-time", "interactive", "bf-cache"],
        plugins: ["lighthouse-plugin-pwa"],
        onlyCategories: ["performance", "accessibility", "best-practices", "seo", "lighthouse-plugin-pwa"],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 0.9 }],
        "categories:lighthouse-plugin-pwa": ["error", { minScore: 0.9 }],
        viewport: ["error", { minScore: 1 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};

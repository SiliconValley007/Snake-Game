import { test, expect } from "@playwright/test";

async function ready(page) {
  await page.addInitScript(() => {
    const cur = (() => {
      try {
        return JSON.parse(
          localStorage.getItem("viper:save") ||
            localStorage.getItem("viper") ||
            "{}",
        );
      } catch {
        return {};
      }
    })();
    cur.v = 2;
    cur.seenTutorial = true;
    localStorage.setItem("viper:save", JSON.stringify(cur));
  });
  await page.goto("./");
  await page
    .locator("#splash")
    .evaluate((el) => el.classList.add("hide"))
    .catch(() => {});
  await page
    .locator("#panel")
    .evaluate((el) => {
      el.hidden = true;
    })
    .catch(() => {});
  await expect(page.locator("#btn")).toBeVisible({ timeout: 8000 });
}

async function toIdle(page) {
  const ui = page.locator("#ui");
  const hidden = await ui.evaluate((el) => el.classList.contains("hide"));
  if (hidden) {
    await page.locator("#pause").click();
    await expect(ui).not.toHaveClass(/hide/, { timeout: 5000 });
  }
  const restart = page.locator("#restartBtn");
  if (await restart.isVisible()) {
    await restart.click();
  }
  await expect(page.locator("#btn")).toHaveText(/Play/i, { timeout: 5000 });
  await expect(page.locator("#modeRow .chip").first()).toBeVisible({
    timeout: 5000,
  });
}

test.describe.configure({ mode: "serial" });

test("classic: start, steer, eat or die, pause/resume", async ({ page }) => {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await ready(page);
  await expect(page.locator("h1").first()).toBeVisible();
  await page.locator("#modeRow .chip", { hasText: "Classic" }).click();
  await page.locator("#btn").click();
  await expect(page.locator("#ui")).toHaveClass(/hide/, { timeout: 8000 });
  await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(60);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(60);
  }
  const ui = page.locator("#ui");
  if (await ui.evaluate((el) => el.classList.contains("hide"))) {
    await page.locator("#pause").click();
  }
  await expect(ui).not.toHaveClass(/hide/, { timeout: 5000 });
  await page.locator("#btn").click();
  await expect(ui).toHaveClass(/hide/, { timeout: 8000 });
  expect(
    errors.filter((e) => !/Failed to load resource|vite/i.test(e)),
  ).toEqual([]);
});

test("run keeps ticking without hitstop stalls", async ({ page }) => {
  await ready(page);
  await page.locator("#btn").click();
  await expect(page.locator("#ui")).toHaveClass(/hide/, { timeout: 8000 });
  await page.evaluate(() => {
    const g = window.__VIPER__.getGame();
    g.wrapOn = true;
    g.food = { x: g.snake[0].x + 1, y: g.snake[0].y, type: "normal" };
  });
  const samples = [];
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(350);
    samples.push(
      await page.evaluate(() => window.__VIPER__.getGame().tickCount),
    );
  }
  expect(samples[samples.length - 1]).toBeGreaterThan(samples[0] + 4);
  for (let i = 1; i < samples.length; i++) {
    expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
  }
});

test("each mode starts", async ({ page }) => {
  await ready(page);
  for (const name of ["Classic", "Time Attack", "Endless", "Daily", "Zen"]) {
    await toIdle(page);
    await page.locator("#modeRow .chip", { hasText: name }).click();
    await page.locator("#btn").click();
    await expect(page.locator("#ui")).toHaveClass(/hide/, { timeout: 8000 });
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(80);
    await page.locator("#pause").click();
    await expect(page.locator("#ui")).not.toHaveClass(/hide/, {
      timeout: 5000,
    });
    await page.locator("#restartBtn").click();
    await expect(page.locator("#btn")).toHaveText(/Play/i);
  }
});

test("settings persist across reload", async ({ page }) => {
  await ready(page);
  await page.locator("#settingsBtn").click();
  await expect(page.locator("#panel")).toBeVisible();
  await page.locator("#hapCk").uncheck();
  await page.locator("#panelClose").click();
  await expect(page.locator("#panel")).toBeHidden();
  await page.reload();
  await page
    .locator("#splash")
    .evaluate((el) => el.classList.add("hide"))
    .catch(() => {});
  await page.locator("#settingsBtn").click();
  await expect(page.locator("#hapCk")).not.toBeChecked();
});

test("home title visible without scroll; overlays close", async ({ page }) => {
  await ready(page);
  const title = page.locator("#ui h1");
  await expect(title).toBeVisible();
  await expect(title).toHaveText("VIPER");
  const fit = await page.locator("#ui").evaluate((el) => {
    const h1 = el.querySelector("h1");
    const r = h1.getBoundingClientRect();
    const u = el.getBoundingClientRect();
    return {
      noScroll:
        el.scrollHeight <= el.clientHeight + 1 &&
        el.scrollWidth <= el.clientWidth + 1,
      titleInView: r.top >= u.top - 1 && r.bottom <= u.bottom + 1,
      overflow: getComputedStyle(el).overflow,
    };
  });
  expect(fit.noScroll).toBe(true);
  expect(fit.titleInView).toBe(true);
  expect(fit.overflow).toMatch(/hidden|clip/);
  for (const id of [
    "settingsBtn",
    "garageBtn",
    "boardBtn",
    "achBtn",
    "helpBtn",
  ]) {
    await page.locator("#" + id).click();
    await expect(page.locator("#panel")).toBeVisible();
    await page.locator("#panelClose").click();
    await expect(page.locator("#panel")).toBeHidden();
    await expect(page.locator("#btn")).toHaveText(/Play/i);
  }
  await page.locator("#settingsBtn").click();
  await expect(page.locator("#panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#panel")).toBeHidden();
});

test("offline load via service worker", async ({ page, context }) => {
  await ready(page);
  await page.waitForFunction(
    async () => {
      if (!navigator.serviceWorker) return false;
      const r = await navigator.serviceWorker.ready;
      return !!(r && r.active);
    },
    null,
    { timeout: 20000 },
  );
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("h1").first()).toBeVisible();
  await context.setOffline(false);
});

test("eat does not stall head or tail interpolation", async ({ page }) => {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await ready(page);
  await page.locator("#btn").click();
  await expect(page.locator("#ui")).toHaveClass(/hide/, { timeout: 8000 });
  const result = await page.evaluate(async () => {
    const api = window.__VIPER__;
    const g = api.getGame();
    g.wrapOn = true;
    g.food = {
      x: g.snake[0].x + (g.dir.x || 1),
      y: g.snake[0].y + (g.dir.y || 0),
      type: "normal",
    };
    const samples = [];
    const t0 = performance.now();
    function wrapD(a, b, cols, rows) {
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      if (dx > cols / 2) dx -= cols;
      else if (dx < -cols / 2) dx += cols;
      if (dy > rows / 2) dy -= rows;
      else if (dy < -rows / 2) dy += rows;
      return Math.hypot(dx, dy);
    }
    await new Promise((resolve) => {
      function sample(now) {
        const game = api.getGame();
        if (!game) return resolve();
        if (game.alive && game.snake[0]) {
          const hd = game.snake[0];
          game.food = {
            x: (hd.x + (game.dir.x || 1) + game.cols) % game.cols,
            y: (hd.y + (game.dir.y || 0) + game.rows) % game.rows,
            type: "normal",
          };
        }
        const a = api.getAlpha();
        const h = { ...api.headCell(game, a) };
        const t = { ...api.tailCell(game, a) };
        samples.push({
          h,
          t,
          now,
          len: game.snake.length,
          cols: game.cols,
          rows: game.rows,
          score: game.score,
        });
        if (now - t0 < 1400) requestAnimationFrame(sample);
        else resolve();
      }
      requestAnimationFrame(sample);
    });
    let maxHead = 0;
    let maxTail = 0;
    let ate = false;
    let stall = 0;
    let maxStall = 0;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      if (b.len > a.len || b.score > a.score) ate = true;
      const dh = wrapD(a.h, b.h, b.cols, b.rows);
      const dt = wrapD(a.t, b.t, b.cols, b.rows);
      if (dh > maxHead) maxHead = dh;
      if (dt > maxTail) maxTail = dt;
      if (ate && dh < 0.002) stall++;
      else stall = 0;
      if (stall > maxStall) maxStall = stall;
    }
    return { maxHead, maxTail, n: samples.length, ate, maxStall };
  });
  expect(result.n).toBeGreaterThan(10);
  expect(result.ate).toBe(true);
  expect(result.maxHead).toBeLessThan(1);
  expect(result.maxTail).toBeLessThan(1);
  expect(result.maxStall).toBeLessThan(10);
  expect(
    errors.filter((e) => !/Failed to load resource|vite/i.test(e)),
  ).toEqual([]);
});

test("wrap-turn chain stays contiguous", async ({ page }) => {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await ready(page);
  await page.locator("#btn").click();
  await expect(page.locator("#ui")).toHaveClass(/hide/, { timeout: 8000 });
  const result = await page.evaluate(async () => {
    const api = window.__VIPER__;
    const cases = [
      {
        cells: (c) => [
          { x: c.cols - 1, y: 8 },
          { x: c.cols - 2, y: 8 },
          { x: c.cols - 3, y: 8 },
        ],
        dir: { x: 1, y: 0, name: "right" },
        turn: { x: 0, y: -1, name: "up" },
        wrapped: (g) => g.snake[0].x === 0,
      },
      {
        cells: (c) => [
          { x: 0, y: 8 },
          { x: 1, y: 8 },
          { x: 2, y: 8 },
        ],
        dir: { x: -1, y: 0, name: "left" },
        turn: { x: 0, y: 1, name: "down" },
        wrapped: (g) => g.snake[0].x === g.cols - 1,
      },
      {
        cells: (c) => [
          { x: 8, y: 0 },
          { x: 8, y: 1 },
          { x: 8, y: 2 },
        ],
        dir: { x: 0, y: -1, name: "up" },
        turn: { x: 1, y: 0, name: "right" },
        wrapped: (g) => g.snake[0].y === g.rows - 1,
      },
      {
        cells: (c) => [
          { x: 8, y: c.rows - 1 },
          { x: 8, y: c.rows - 2 },
          { x: 8, y: c.rows - 3 },
        ],
        dir: { x: 0, y: 1, name: "down" },
        turn: { x: -1, y: 0, name: "left" },
        wrapped: (g) => g.snake[0].y === 0,
      },
    ];
    const out = [];
    for (const cs of cases) {
      const g = api.getGame();
      g.wrapOn = true;
      g.obstacles = [];
      g.alive = true;
      g.snake = cs.cells(g).map((p) => ({ ...p }));
      g.prev = g.snake.map((p) => ({ ...p }));
      g.dir = { ...cs.dir };
      g.queued.length = 0;
      g.food = { x: 5, y: 5, type: "normal" };
      let wrapped = false;
      const gaps = [];
      const t0 = performance.now();
      await new Promise((resolve) => {
        function sample() {
          const game = api.getGame();
          if (!game) return resolve();
          if (!wrapped && cs.wrapped(game)) {
            wrapped = true;
            game.queued.length = 0;
            game.queued.push({ ...cs.turn });
          }
          const a = api.getAlpha();
          const scratchX = new Float64Array(game.snake.length);
          const scratchY = new Float64Array(game.snake.length);
          const scratchS = new Uint8Array(game.snake.length);
          gaps.push(api.chainMaxGap(game, a, scratchX, scratchY, scratchS));
          if (performance.now() - t0 < 700) requestAnimationFrame(sample);
          else resolve();
        }
        requestAnimationFrame(sample);
      });
      out.push({ max: Math.max(...gaps), n: gaps.length, wrapped });
    }
    return out;
  });
  for (const r of result) {
    expect(r.n).toBeGreaterThan(8);
    expect(r.max).toBeLessThanOrEqual(1.05);
  }
  expect(
    errors.filter((e) => !/Failed to load resource|vite/i.test(e)),
  ).toEqual([]);
});

test("bfcache pageshow restores idle", async ({ page }) => {
  await ready(page);
  await expect(page.locator("#btn")).toHaveText(/Play/i);
  await page.goto("about:blank");
  await page.goBack();
  await page
    .locator("#splash")
    .evaluate((el) => el.classList.add("hide"))
    .catch(() => {});
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 8000 });
  await expect(page.locator("#btn")).toBeVisible();
  await page.locator("#btn").click();
  await expect(page.locator("#ui")).toHaveClass(/hide/, { timeout: 8000 });
});

test("gamepad mock steers", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
    buttons[0] = { pressed: true };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [{ axes: [0, 0], buttons, connected: true, id: "mock" }],
    });
  });
  await page.waitForTimeout(400);
  await expect(page.locator("#ui")).toHaveClass(/hide/, { timeout: 8000 });
  await page.evaluate(() => {
    const buttons = Array.from({ length: 16 }, (_, i) => ({
      pressed: i === 12,
    }));
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [{ axes: [0, 0], buttons, connected: true, id: "mock" }],
    });
  });
  await page.waitForTimeout(200);
  const dir = await page.evaluate(() => {
    const g = window.__VIPER__.getGame();
    return g && g.dir && g.dir.name;
  });
  expect(["up", "right", "left", "down"]).toContain(dir);
  await page.locator("#pause").click();
  await expect(page.locator("#ui")).not.toHaveClass(/hide/, { timeout: 5000 });
  await page.evaluate(() => {
    const buttons = Array.from({ length: 16 }, (_, i) => ({
      pressed: i === 0,
    }));
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [{ axes: [0, 0], buttons, connected: true, id: "mock" }],
    });
  });
  await page.waitForTimeout(400);
  await expect(page.locator("#ui")).toHaveClass(/hide/, { timeout: 8000 });
  await expect(page.locator("#c")).toBeVisible();
});

test("update toast can reload", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const t = document.getElementById("toast");
    if (t) t.classList.add("show");
  });
  await expect(page.locator("#toast")).toHaveClass(/show/);
  await expect(page.locator("#toastGo")).toBeVisible();
  await page.locator("#toastGo").click();
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 8000 });
});

test("music stops on pause and idle", async ({ page }) => {
  await ready(page);
  await page.locator("#btn").click();
  await expect(page.locator("#ui")).toHaveClass(/hide/, { timeout: 8000 });
  expect(await page.evaluate(() => window.__VIPER__.musicPlaying())).toBe(true);
  await page.locator("#pause").click();
  await expect(page.locator("#ui")).not.toHaveClass(/hide/, { timeout: 5000 });
  expect(await page.evaluate(() => window.__VIPER__.musicPlaying())).toBe(
    false,
  );
  await page.locator("#restartBtn").click();
  await expect(page.locator("#btn")).toHaveText(/Play/i);
  expect(await page.evaluate(() => window.__VIPER__.musicPlaying())).toBe(
    false,
  );
});

test("legacy save migrates and quota does not crash", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "viper",
      JSON.stringify({ best: 77, wrap: true, sound: true }),
    );
    localStorage.setItem("viperBest", "90");
  });
  await page.goto("./");
  await page
    .locator("#splash")
    .evaluate((el) => el.classList.add("hide"))
    .catch(() => {});
  await page
    .locator("#panel")
    .evaluate((el) => {
      el.hidden = true;
    })
    .catch(() => {});
  await expect(page.locator("#btn")).toBeVisible({ timeout: 8000 });
  const save = await page.evaluate(() => window.__VIPER__.getSave());
  expect(save.best).toBeGreaterThanOrEqual(90);
  expect(save.wrap).toBe(true);
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      const e = new Error("quota");
      e.name = "QuotaExceededError";
      e.code = 22;
      throw e;
    };
    window.__quotaOrig = orig;
  });
  await page.locator("#wrapBtn").click();
  await expect(page.locator("h1").first()).toBeVisible();
  await page.evaluate(() => {
    if (window.__quotaOrig) Storage.prototype.setItem = window.__quotaOrig;
  });
});

test("swipe steers", async ({ page }) => {
  await ready(page);
  await page.locator("#btn").click();
  await expect(page.locator("#ui")).toHaveClass(/hide/, { timeout: 8000 });
  const box = await page.locator("#c").boundingBox();
  expect(box).toBeTruthy();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 80, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  await expect(page.locator("#c")).toBeVisible();
});

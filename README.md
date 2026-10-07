# VIPER

Precision arcade snake. Vite + vanilla JS, Canvas2D, fully local. GitHub Pages ready.

## Play

Do not open `index.html` as a file. Use the dev server, preview, or GitHub Pages.

```bash
npm ci
npm run dev
```

Production:

```bash
npm run build
npm run preview
```

## Controls

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Move | Arrows or WASD | Swipe or D-pad | D-pad / left stick |
| Pause / Resume | Space, P, or Esc | Pause button or Resume | Start |
| Restart | R | Pause menu Restart, or Again after game over | A (primary) |

Restart from pause returns to the ready screen so Wrap, Sound, mode, map, and difficulty can be changed before Play.

Space on a focused chip does not steal the toggle. Swipe updates live on pointermove.

## Rules

- Eat food to grow and score. Golden food is worth more. Poison food hurts.
- Eat quickly to stack combos.
- Crash into walls (if Wrap is off), obstacles, moving bars, or your tail and the run ends.
- Portals warp you to the paired cell. Ghost lets you pass through body and hazards.
- Slow-mo, magnet, x2 score, and shrink are timed power-ups.

## Modes

| Mode | Notes |
| --- | --- |
| Classic | Clear the board. Hazards from the selected map. |
| Time Attack | 90 seconds. Score as much as you can. |
| Endless | Clearing a board advances a level and cycles maps. |
| Daily | Seeded from the UTC date. Shared local daily board. |
| Zen | No poison, no extra hazards, slower floor. |

Difficulty: Easy, Normal, Hard, Viper. Maps: Arena, Garden, Fortress, Rivers, Voidgate, Colossus, plus seeded procedural maps and a local editor.

## Meta

XP and player levels unlock skins, trails, and themes. A meta-upgrade tree spends XP. Perks (Hardy, Swift, Pull, Lucky, Shade) apply at run start; Endless offers a 1-of-3 draft each level. Achievements, daily missions with streak/claim, and a live HUD are stored locally. Per-mode/difficulty top-10 boards, daily board, JSON export/import, replay 1x/2x/skip with `verifyReplay`, best-run ghost, share card via `canvas.toBlob` + Web Share (download fallback). Save lives under `viper:save` and migrates from the original `viper` / `viperBest` keys.

## Options

Wrap, Sound, Music/SFX sliders, mute, haptics, reduced-motion override, swipe sensitivity, colorblind palettes, quality High/Med/Low/Auto, left-handed pad, best-run ghost, fullscreen, wake lock, orientation-any PWA. First-run tutorial. Pause on blur / hidden tab. bfcache-safe `pageshow` re-init. No `desynchronized` canvas attribute.

## Scripts

| Script | What |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Icons + production bundle (`base: ./`) |
| `npm run preview` | Serve `dist` at `/` |
| `npm run preview:subpath` | Serve `dist` at `/viper/` |
| `npm test` | Vitest |
| `npm run test:e2e` | Playwright against `/viper/` preview |
| `npm run lhci` | Lighthouse CI on `/viper/` |
| `npm run icons` | PNG icons |

## Deploy (GitHub Pages)

1. Enable Pages (GitHub Actions).
2. Push `main`. `.github/workflows/deploy.yml` runs tests, Playwright, Lighthouse CI, then builds with relative `base`, injects absolute OG URLs from `SITE_URL`, and uploads `dist`.
3. Or copy `dist` to any static host. `public/.nojekyll` avoids Jekyll filtering.

## Testing

```bash
npm ci
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

Vitest covers seeded RNG, collisions, wrap, power-ups, portals, scoring, replay verification, storage v1→v2 / `viper:save` migration, interpolation continuity (eat/wrap/portal/speed), and WebAudio stingers (mocked AudioContext).

Playwright covers mode start, keyboard steer, pause/resume, settings persistence, service-worker offline load, eat-continuity, wrap-turn at all four walls, bfcache with input restore, gamepad on menu/pause, music stop on pause/idle, update toast, legacy save/quota, and swipe on desktop Chrome and Pixel 5 with zero skips.

## Architecture

```
src/core     pure simulation, maps, seeded RNG, storage schema
src/render   Canvas2D, cached bg/grid/vignette, interpolation
src/audio    WebAudio layered SFX + procedural music
src/input    keys, live swipe, D-pad, Gamepad
src/ui       overlays, settings, garage, boards
src/meta     XP, unlocks, achievements, missions, share, replay
src/pwa      SW registration, wake lock, fullscreen
public       manifest, sw.js, icons
tests        Vitest
e2e          Playwright
```

Fixed timestep + interpolation. Render is decoupled from logic. Object pools for particles/floats. Static layers rebuild only on resize/theme change.

## Stack

Vite 6, vanilla ES modules, Vitest, Playwright, GitHub Actions → Pages. Zero runtime dependencies.

## Roadmap / limitations

- No backend; leaderboards are device-local.
- Replay is input-log verification, not a video.
- Procedural audio only (no sample packs).
- Canvas2D, no WebGL bloom; glow uses cached sprites, not shadowBlur.
- Lighthouse PWA installability needs HTTPS (Pages provides it).

## License

MIT. See `LICENSE`.

## Verification (this build)

- `npx vitest run` — 63/63 passed
- `npm run build` — Vite 6.4.3, 16 modules, warning-free
- `SITE_URL=https://example.github.io/viper/ npm run build` — `og:image`/`og:url`/`twitter:image` absolute
- `npx playwright test` — 28/28 passed, 0 skipped (chromium + Pixel 5)
- `npx lhci autorun` — `/viper/` sub-path: Performance 100, Accessibility 100, Best Practices 100, SEO 100, PWA 100

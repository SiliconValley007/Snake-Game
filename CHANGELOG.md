# Changelog

## 3.1.2

- Absolute OG/Twitter URLs from `SITE_URL` at build; 1200x630 `og-card.png`; local builds keep relative-safe tags.

## 3.1.1

- Production audit: OG/Twitter tags, SW `scope: "./"`, sub-path Playwright, deploy.yml gates test+lhci, engines Node >=20.

## 3.1.0

- Event stingers (eat, gold, power-up, level-up, perk, die, win) on the SFX bus with music ducking, mute/volume respect, and node cleanup.
- Playwright runs on desktop Chrome and Pixel 5 with no skips.
- Lighthouse CI against a `/viper/` sub-path preview; lhci job gates deploy.

## 3.0.0

- Removed logic hitstop. Eat juice is visual only (zoom-punch, shake, flash, squash, burst, haptic).
- Growth-eat: new tail `prev` copies the old tail so the extra segment slides in.
- Catmull-Rom body spline via `src/render/interp.js`; contiguous min-image wrap chain + tile copies (no wrap-turn gaps); portal split-draw.
- Cheap eat frame: deferred HUD/missions/audio, WAAPI score pop, delayed haptic; voice cap 24.
- Fixed-timestep loop: EMA dt, rescale `acc` on speed change, cap 3 steps/frame, carry remainder.
- Camera-only shake; cached glow sprites (no shadowBlur).
- Quality High / Med / Low / Auto (frame-time driven).
- Replay 1x / 2x / skip; best-run ghost racing.
- 1-of-3 perk drafts at Endless level-ups; meta-upgrade tree spends XP.
- Live mission HUD, daily streak, claim rewards.
- Seeded procedural maps and a local map editor (save / export / import).
- Lookahead stemmed music with ducking and stingers.
- Namespaced `viper:save` storage with legacy `viper` / `viperBest` migration; quota-safe writes.
- GitHub Pages `404.html` SPA fallback without self-redirect loop; relative `base: ./`.

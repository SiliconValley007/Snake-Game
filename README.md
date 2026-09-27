# VIPER

Precision arcade snake. Single-file HTML, CSS, and JavaScript. No build step.

## Play

Open `index.html` in a browser, or serve the folder (GitHub Pages already works with this file as the site root).

## Controls

| Action         | Keyboard         | Touch                                        |
| -------------- | ---------------- | -------------------------------------------- |
| Move           | Arrows or WASD   | Swipe or D-pad                               |
| Pause / Resume | Space, P, or Esc | Pause button or Resume                       |
| Restart        | R                | Pause menu Restart, or Again after game over |

Restart from pause returns to the ready screen so Wrap and Sound can be changed before Play.

## Rules

- Eat food to grow and score. Golden food is worth more.
- Eat quickly to stack combos.
- Crash into walls (if Wrap is off) or your tail and the run ends.

## Options

Wrap and Sound can be toggled on the ready screen. Best score, wrap, and sound persist in localStorage.

## Stack

HTML5 Canvas, CSS, vanilla JS (Web Audio, pointer events, localStorage).

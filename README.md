# VIPER 🐍

> **Precision Arcade Snake** — A fast-paced, high-precision single-player arcade game built with vanilla Web technologies.

VIPER elevates the classic Snake game experience with smooth animations, custom Web Audio API sound effects, dynamic scoring multiplier combos, responsive touch controls, and grid-wrapping options.

---

## ✨ Features

- **Smooth 60FPS Canvas Graphics**: Dynamic score pops, floating score text, particle explosion effects, and ambient glow effects.
- **Audio & Haptic Feedback**: Web Audio API synthesized sound effects paired with mobile vibration support.
- **Combo System & Special Food**: Chain quick pickups within 2.4 seconds to stack combos; collect golden special food items for bonus points.
- **Versatile Input Options**: Full keyboard support (Arrows/WASD), touch swipes, and an on-screen Direction Pad for mobile play[cite: 4].
- **Customizable Gameplay**: Toggle wall wrap-around mode on/off and sound settings[cite: 4].
- **Persistent High Scores**: Automatically saves your best score and preferences via LocalStorage[cite: 4].
- **Zero Dependencies**: Lightweight single-file deployment built entirely with native HTML, CSS, and JavaScript[cite: 4].

---

## 🎮 How to Play

### Controls

| Action | Keyboard | Touch / Mobile |
| :--- | :--- | :--- |
| **Move Up** | `Arrow Up` / `W` | Swipe Up / D-Pad Up |
| **Move Down** | `Arrow Down` / `S` | Swipe Down / D-Pad Down |
| **Move Left** | `Arrow Left` / `A` | Swipe Left / D-Pad Left |
| **Move Right** | `Arrow Right` / `D` | Swipe Right / D-Pad Right |
| **Pause / Resume** | `Space` / `P` / `Esc` | Pause Button / On-Screen Prompt |
| **Restart** | `R` | On-Screen Button |

### Rules & Mechanics

1. **Eat & Grow**: Collect green or golden food drops to grow your length and increase your score[cite: 4].
2. **Combo Multipliers**: Eat food items quickly in succession to gain multiplier points[cite: 4].
3. **Special Drops**: Keep an eye out for golden food items that grant +35 points and high score bonuses[cite: 4].
4. **Game Over**: Avoid crashing into your own tail or running into boundaries (when Wrap Mode is disabled)[cite: 4].

---

## 🚀 Getting Started

Since VIPER has zero external dependencies or build tools required, running it is simple[cite: 4]:

1. Clone or download this repository:

   ```bash

   git clone [https://github.com/your-username/viper-snake.git](https://github.com/your-username/viper-snake.git)

   ```

### THEN ###

1. Navigate into the project folder:

```bash
cd viper-snake
```

2. Open index.html in any web browser!

🛠️ Built With
• HTML5 (Canvas API)[cite: 4]

• CSS3 (Flexbox, CSS Grid, Variables, Backdrop Filters)[cite: 4]

• JavaScript ES6+ (Web Audio API, LocalStorage, Touch Events)[cite: 4]
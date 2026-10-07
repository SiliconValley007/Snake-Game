import { POWER } from "../core/constants.js";

function envGain(g, ac, peak, dur, t0) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.012);
  g.gain.setValueAtTime(
    Math.max(0.0002, peak),
    t0 + Math.max(0.02, dur * 0.35),
  );
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

const SCALE = [220, 246.94, 261.63, 293.66, 329.63, 349.23, 392, 440];
const BASS_SEQ = [110, 110, 130.81, 98, 110, 110, 146.83, 130.81];
const LOOKAHEAD = 0.12;
const TICK = 25;

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let duckGain = null;
  let stems = null;
  let noiseBuf = null;
  let schedulerId = 0;
  let nextNoteTime = 0;
  let noteIndex = 0;
  let secondsPerBeat = 0.48;
  let intensity = 0.2;
  let enabled = true;
  let musicVol = 0.55;
  let sfxVol = 0.8;
  let playing = false;
  const voices = new Set();
  const VOICE_CAP = 24;

  function ensure() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        duckGain = ctx.createGain();
        musicGain = ctx.createGain();
        sfxGain = ctx.createGain();
        musicGain.gain.value = musicVol;
        sfxGain.gain.value = sfxVol;
        duckGain.gain.value = 1;
        stems = {
          bass: ctx.createGain(),
          lead: ctx.createGain(),
          perc: ctx.createGain(),
        };
        stems.bass.gain.value = 0.9;
        stems.lead.gain.value = 0.3;
        stems.perc.gain.value = 0;
        for (const k in stems) stems[k].connect(musicGain);
        musicGain.connect(duckGain);
        duckGain.connect(master);
        sfxGain.connect(master);
        master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(
          1,
          (ctx.sampleRate * 0.2) | 0,
          ctx.sampleRate,
        );
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch (_) {
      return null;
    }
  }

  function track(o, g) {
    if (voices.size >= VOICE_CAP) {
      const oldest = voices.values().next().value;
      if (oldest) {
        try {
          oldest.o.stop();
          oldest.o.disconnect();
          oldest.g.disconnect();
        } catch (_) {}
        voices.delete(oldest);
      }
    }
    const rec = { o, g };
    voices.add(rec);
    o.addEventListener("ended", () => {
      voices.delete(rec);
      try {
        o.disconnect();
        g.disconnect();
      } catch (_) {}
    });
  }

  function tone(freq, dur, type, peak, dest, t0) {
    if (!ctx || !enabled) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t0);
      envGain(g, ctx, peak || 0.05, dur, t0);
      o.connect(g);
      g.connect(dest || sfxGain);
      track(o, g);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    } catch (_) {}
  }

  function noiseHit(t0, dur, peak, dest) {
    if (!ctx || !enabled || !noiseBuf) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 4200;
      const g = ctx.createGain();
      envGain(g, ctx, peak || 0.02, dur, t0);
      src.connect(f);
      f.connect(g);
      g.connect(dest || stems.perc);
      track(src, g);
      src.start(t0);
      src.stop(t0 + dur + 0.03);
    } catch (_) {}
  }

  function beep(freq, dur, type, gain, combo) {
    if (!enabled) return;
    const ac = ensure();
    if (!ac) return;
    const f = freq * (1 + Math.min(8, combo || 0) * 0.035);
    tone(f, dur, type || "square", gain || 0.05, sfxGain, ac.currentTime);
  }

  function layer(freqs, dur, type, gain) {
    const ac = ctx || ensure();
    if (!ac) return;
    for (let i = 0; i < freqs.length; i++) {
      tone(
        freqs[i],
        dur,
        type,
        (gain || 0.04) / freqs.length,
        sfxGain,
        ac.currentTime,
      );
    }
  }

  function duck(ms) {
    if (!ctx || !duckGain) return;
    const t = ctx.currentTime;
    duckGain.gain.cancelScheduledValues(t);
    duckGain.gain.setValueAtTime(0.3, t);
    duckGain.gain.linearRampToValueAtTime(1, t + ms / 1000);
  }

  const STING = {
    eat: { duck: 80, notes: [[660, 0.07, "square", 0.05, 0]] },
    gold: {
      duck: 110,
      notes: [
        [880, 0.08, "triangle", 0.055, 0],
        [1320, 0.06, "sine", 0.03, 0.02],
      ],
    },
    power: {
      duck: 70,
      notes: [
        [400, 0.12, "triangle", 0.045, 0],
        [600, 0.1, "triangle", 0.03, 0],
      ],
    },
    level: {
      duck: 120,
      notes: [
        [440, 0.16, "triangle", 0.03, 0],
        [554.37, 0.16, "triangle", 0.03, 0],
        [659.25, 0.16, "triangle", 0.03, 0],
      ],
    },
    perk: {
      duck: 100,
      notes: [
        [523.25, 0.1, "sine", 0.04, 0],
        [659.25, 0.12, "triangle", 0.035, 0.04],
      ],
    },
    die: {
      duck: 0,
      notes: [
        [180, 0.28, "sawtooth", 0.045, 0],
        [90, 0.28, "sawtooth", 0.045, 0],
      ],
    },
    win: {
      duck: 0,
      notes: [
        [520, 0.1, "triangle", 0.05, 0],
        [780, 0.18, "triangle", 0.05, 0.09],
      ],
    },
  };

  function sting(kind) {
    if (!enabled) return;
    const spec = STING[kind];
    if (!spec) return;
    const ac = ensure();
    if (!ac) return;
    if (spec.duck) duck(spec.duck);
    const t0 = ac.currentTime;
    const notes = spec.notes;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      tone(n[0], n[1], n[2], n[3], sfxGain, t0 + n[4]);
    }
  }

  function scheduleNote(n, t) {
    const s = n % 16;
    if (s % 4 === 0) {
      tone(
        BASS_SEQ[((n / 4) | 0) % BASS_SEQ.length],
        secondsPerBeat * 0.9,
        "triangle",
        0.05 + intensity * 0.03,
        stems.bass,
        t,
      );
    }
    if (intensity > 0.28 && (s === 2 || s === 6 || s === 10 || s === 14)) {
      tone(
        SCALE[(n * 3) % SCALE.length],
        secondsPerBeat * 0.5,
        "sine",
        0.02 + intensity * 0.02,
        stems.lead,
        t,
      );
    }
    if (s === 0 || s === 8) {
      tone(
        BASS_SEQ[(((n / 8) | 0) + 2) % BASS_SEQ.length] * 2,
        secondsPerBeat * 0.8,
        "sawtooth",
        0.012 + intensity * 0.012,
        stems.lead,
        t,
      );
    }
    if (intensity > 0.45 && (s === 4 || s === 12)) {
      noiseHit(t, 0.06, 0.02 + intensity * 0.02, stems.perc);
    }
  }

  function scheduler() {
    if (!playing || !enabled || !ctx) return;
    while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
      scheduleNote(noteIndex, nextNoteTime);
      nextNoteTime += secondsPerBeat / 4;
      noteIndex++;
    }
  }

  function startMusic() {
    const ac = ensure();
    if (!ac || !enabled) return;
    stopMusic();
    playing = true;
    noteIndex = 0;
    intensity = 0.2;
    secondsPerBeat = 0.48;
    nextNoteTime = ac.currentTime + 0.06;
    scheduler();
    schedulerId = setInterval(scheduler, TICK);
  }

  function tickMusic(dt, speed, combo) {
    intensity +=
      ((Math.min(1, speed / 2.4 + combo / 14) - intensity) * dt) / 400;
    secondsPerBeat = Math.max(0.28, 0.52 - intensity * 0.18);
    if (stems) {
      stems.lead.gain.value = 0.22 + intensity * 0.85;
      stems.perc.gain.value = Math.max(0, intensity - 0.25) * 1.2;
    }
  }

  function stopMusic() {
    playing = false;
    if (schedulerId) clearInterval(schedulerId);
    schedulerId = 0;
    for (const rec of voices) {
      try {
        rec.o.stop();
        rec.o.disconnect();
        rec.g.disconnect();
      } catch (_) {}
    }
    voices.clear();
  }

  return {
    ensure,
    setEnabled(v) {
      enabled = v;
      if (!v) stopMusic();
    },
    setMusic(v) {
      musicVol = v;
      if (musicGain) musicGain.gain.value = v;
    },
    setSfx(v) {
      sfxVol = v;
      if (sfxGain) sfxGain.gain.value = v;
    },
    startMusic,
    stopMusic,
    tickMusic,
    isPlaying() {
      return playing;
    },
    sting,
    eat(gold, combo) {
      sting(gold ? "gold" : "eat");
      if (combo > 1) beep(990 + combo * 40, 0.05, "sine", 0.03, combo);
    },
    die() {
      stopMusic();
      sting("die");
    },
    win() {
      stopMusic();
      sting("win");
    },
    level() {
      sting("level");
    },
    perk() {
      sting("perk");
    },
    power(type) {
      sting("power");
      const f =
        {
          [POWER.SLOW]: 320,
          [POWER.GHOST]: 480,
          [POWER.MAGNET]: 540,
          [POWER.X2]: 720,
          [POWER.SHRINK]: 240,
        }[type] || 400;
      const ac = ctx;
      if (ac && enabled)
        tone(f * 1.5, 0.1, "triangle", 0.02, sfxGain, ac.currentTime);
    },
    start() {
      beep(520, 0.06, "square", 0.04, 0);
    },
    portal() {
      beep(240, 0.08, "sine", 0.04, 0);
      beep(480, 0.1, "sine", 0.03, 0);
    },
    poison() {
      beep(110, 0.16, "sawtooth", 0.05, 0);
    },
    ui() {
      beep(640, 0.06, "square", 0.035, 0);
    },
    close() {
      stopMusic();
      try {
        if (ctx && ctx.state !== "closed") ctx.close();
      } catch (_) {}
      ctx = null;
      master = null;
      musicGain = null;
      sfxGain = null;
      duckGain = null;
      stems = null;
      noiseBuf = null;
    },
    restore() {
      ctx = null;
      master = null;
      musicGain = null;
      sfxGain = null;
      duckGain = null;
      stems = null;
      noiseBuf = null;
      voices.clear();
      playing = false;
      schedulerId = 0;
    },
  };
}

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAudio } from "../src/audio/audio.js";

class Param {
  constructor() {
    this.value = 1;
    this.calls = [];
  }
  setValueAtTime(v, t) {
    this.calls.push(["set", v, t]);
    this.value = v;
  }
  exponentialRampToValueAtTime(v, t) {
    this.calls.push(["exp", v, t]);
  }
  linearRampToValueAtTime(v, t) {
    this.calls.push(["lin", v, t]);
  }
  cancelScheduledValues(t) {
    this.calls.push(["cancel", t]);
  }
}

class Node {
  constructor(kind, ac) {
    this.kind = kind;
    this.ac = ac;
    this.connected = [];
    this.disconnected = false;
    this.ended = null;
    this.frequency = new Param();
    this.gain = new Param();
    this.type = "sine";
  }
  connect(n) {
    this.connected.push(n);
    return n;
  }
  disconnect() {
    this.disconnected = true;
    this.ac.disconnected.push(this);
  }
  addEventListener(type, fn) {
    if (type === "ended") this.ended = fn;
  }
  start() {}
  stop() {
    if (this.ended) this.ended();
  }
}

class Filter extends Node {
  constructor(ac) {
    super("filter", ac);
    this.frequency = new Param();
  }
}

class BufferSource extends Node {
  constructor(ac) {
    super("buffer", ac);
    this.buffer = null;
  }
}

class MockAC {
  constructor() {
    this.state = "running";
    this.currentTime = 1;
    this.sampleRate = 44100;
    this.destination = { kind: "dest" };
    this.created = [];
    this.disconnected = [];
    this.closed = false;
  }
  createGain() {
    const n = new Node("gain", this);
    this.created.push(n);
    return n;
  }
  createOscillator() {
    const n = new Node("osc", this);
    this.created.push(n);
    return n;
  }
  createBuffer(ch, len, rate) {
    return { ch, length: len, sampleRate: rate, getChannelData: () => new Float32Array(len) };
  }
  createBufferSource() {
    const n = new BufferSource(this);
    this.created.push(n);
    return n;
  }
  createBiquadFilter() {
    const n = new Filter(this);
    this.created.push(n);
    return n;
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    this.state = "closed";
    return Promise.resolve();
  }
}

let ac;

describe("event stingers", () => {
  beforeEach(() => {
    ac = new MockAC();
    globalThis.window = globalThis;
    globalThis.AudioContext = function () {
      return ac;
    };
    globalThis.webkitAudioContext = globalThis.AudioContext;
  });
  afterEach(() => {
    delete globalThis.AudioContext;
    delete globalThis.webkitAudioContext;
  });

  it("routes eat/gold/power/level/perk/die/win through sfx and ducks music", () => {
    const a = createAudio();
    a.ensure();
    const duck = ac.created[1];
    const oscBefore = ac.created.filter((n) => n.kind === "osc").length;
    for (const k of ["eat", "gold", "power", "level", "perk", "die", "win"]) a.sting(k);
    const oscs = ac.created.filter((n) => n.kind === "osc");
    expect(oscs.length).toBeGreaterThan(oscBefore);
    const duckSets = duck.gain.calls.filter((c) => c[0] === "set" && c[1] === 0.3);
    expect(duckSets.length).toBeGreaterThan(0);
    const restored = duck.gain.calls.filter((c) => c[0] === "lin" && c[1] === 1);
    expect(restored.length).toBe(duckSets.length);
    for (const o of oscs) {
      expect(o.connected.length).toBeGreaterThan(0);
      const g = o.connected[0];
      expect(g.disconnected).toBe(true);
      expect(o.disconnected).toBe(true);
    }
  });

  it("respects mute and volume sliders", () => {
    const a = createAudio();
    a.setSfx(0.2);
    a.setMusic(0.4);
    a.ensure();
    const music = ac.created[2];
    const sfx = ac.created[3];
    expect(music.gain.value).toBe(0.4);
    expect(sfx.gain.value).toBe(0.2);
    a.setEnabled(false);
    const n = ac.created.length;
    a.sting("eat");
    a.eat(false, 0);
    expect(ac.created.length).toBe(n);
  });

  it("named event helpers fire stingers", () => {
    const a = createAudio();
    a.ensure();
    const n0 = ac.created.length;
    a.eat(false, 0);
    a.eat(true, 3);
    a.power("slow");
    a.level();
    a.perk();
    a.die();
    a.win();
    expect(ac.created.length).toBeGreaterThan(n0);
  });
});

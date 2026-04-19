(() => {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
 
  function createRainSystem(containerElement) {
    if (!containerElement || typeof window.p5 === "undefined") {
      return null;
    }
 
    const state = {
      seed: 130821,
      intensity: 0,
      storm: false,
      emitters: [],
      particles: [],
      maxParticles: 1200,
    };
 
    const sketch = (p) => {
      const windSeedA = 0.013;
      const windSeedB = 0.027;
 
      function spawnFromEmitter(emitter, budget) {
        const count = Math.max(0, Math.floor(budget));
        for (let i = 0; i < count; i += 1) {
          if (state.particles.length >= state.maxParticles) {
            state.particles.shift();
          }
 
          const x = emitter.x + (p.random() - 0.5) * emitter.w;
          const y = emitter.y + p.random() * 12;
          const speed = p.random(720, 1400) * (state.storm ? 1.05 : 0.95);
          const len = p.random(10, 38) + state.intensity * 22;
          const thick = p.random(0.6, 1.25);
          const life = p.random(0.8, 1.35);
          const tilt = p.random(-0.34, -0.14);
          const alpha = p.random(0.12, 0.42) + state.intensity * 0.22;
 
          state.particles.push({
            x,
            y,
            vx: speed * tilt,
            vy: speed,
            len,
            thick,
            alpha: clamp(alpha, 0.08, 0.9),
            life,
            age: 0,
          });
        }
      }
 
      p.setup = () => {
        const frame = window.__FRAME_VIEWPORT__;
        const vw = frame?.width || p.windowWidth;
        const vh = frame?.height || p.windowHeight;
        const c = p.createCanvas(vw, vh);
        c.parent(containerElement);
        c.style("position", "fixed");
        c.style("inset", "0");
        c.style("pointer-events", "none");
        c.style("z-index", "0");
        p.pixelDensity(1);
        p.frameRate(60);
        p.randomSeed(state.seed);
        p.noiseSeed(state.seed);
      };
 
      p.windowResized = () => {
        const frame = window.__FRAME_VIEWPORT__;
        if (frame?.width && frame?.height) {
          p.resizeCanvas(frame.width, frame.height);
          return;
        }
        p.resizeCanvas(p.windowWidth, p.windowHeight);
      };
 
      p.draw = () => {
        p.clear();
 
        const dt = p.deltaTime / 1000;
        if (dt <= 0) {
          return;
        }
 
        const intensity = clamp(state.intensity, 0, 1.25);
        if (intensity > 0 && state.emitters.length > 0) {
          const base = state.storm ? 6 : 3;
          const perEmitter = (state.storm ? 16 : 10) * intensity;
          for (const emitter of state.emitters) {
            const jitter = p.random(-1.4, 1.6);
            spawnFromEmitter(emitter, base + perEmitter + jitter);
          }
        }
 
        p.strokeCap(p.ROUND);
        p.blendMode(p.ADD);
 
        for (let i = state.particles.length - 1; i >= 0; i -= 1) {
          const drop = state.particles[i];
          drop.age += dt;
          if (drop.age >= drop.life || drop.y > p.height + 80) {
            state.particles.splice(i, 1);
            continue;
          }
 
          const wind =
            (p.noise(p.frameCount * windSeedA, drop.y * 0.002) - 0.5) * 220 +
            (p.noise(p.frameCount * windSeedB, drop.y * 0.0012) - 0.5) * 160;
 
          const vx = drop.vx + wind * (state.storm ? 0.65 : 0.45);
          drop.x += vx * dt;
          drop.y += drop.vy * dt;
 
          const fade = 1 - drop.age / drop.life;
          const a = clamp(drop.alpha * fade, 0, 1);
          p.stroke(210, 220, 232, a * 255);
          p.strokeWeight(drop.thick);
 
          const x2 = drop.x - vx * 0.018;
          const y2 = drop.y - drop.len;
          p.line(drop.x, drop.y, x2, y2);
        }
 
        p.blendMode(p.BLEND);
      };
    };
 
    const instance = new window.p5(sketch);
 
    return {
      setSeed(seed) {
        state.seed = seed;
        if (instance) {
          instance.randomSeed(seed);
          instance.noiseSeed(seed);
        }
      },
      setStormMode(storm) {
        state.storm = Boolean(storm);
      },
      setEmitters(emitters) {
        state.emitters = Array.isArray(emitters) ? emitters : [];
      },
      setIntensity(intensity) {
        state.intensity = clamp(Number(intensity) || 0, 0, 1.25);
      },
      clear() {
        state.particles.length = 0;
      },
    };
  }
 
  window.createRainSystem = createRainSystem;
})();

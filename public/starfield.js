(() => {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createStarfieldSystem(containerElement) {
    if (!containerElement || typeof window.p5 === "undefined") {
      return null;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const state = {
      enabled: false,
      seed: 1337,
      stars: [],
      brightStars: [],
      falling: [],
      shooting: [],
      nextShootingAt: 0,
      persistentTrails: [],
    };

    const sketch = (p) => {
      let canvas = null;

      function getFrameViewport() {
        const frame = window.__FRAME_VIEWPORT__;
        if (!frame?.width || !frame?.height) {
          return null;
        }
        return frame;
      }

      function applyCanvasLayout(canvas) {
        const frame = getFrameViewport();
        if (!frame) {
          canvas.style("left", "0");
          canvas.style("top", "0");
          canvas.style("transform", "none");
          return;
        }
        canvas.style("left", `${frame.offsetX}px`);
        canvas.style("top", `${frame.offsetY}px`);
        canvas.style("transform-origin", "top left");
        canvas.style("transform", `scale(${frame.scale || 1})`);
      }

      function reseed(seed) {
        state.seed = seed;
        p.randomSeed(seed);
        p.noiseSeed(seed);
      }

      function initStars() {
        state.stars = [];
        state.brightStars = [];
        state.falling = [];
        state.shooting = [];
        state.persistentTrails = [];

        const count = Math.round((p.width * p.height) / 9000);
        for (let i = 0; i < count; i += 1) {
          const x = p.random(p.width);
          const y = p.random(p.height);
          const r = p.random(0.6, 1.6);
          const a = p.random(0.05, 0.22);
          const tw = p.random(0.002, 0.008);
          const ph = p.random(1000);
          state.stars.push({ x, y, r, a, tw, ph });
        }

        const brightCount = 8;
        for (let i = 0; i < brightCount; i += 1) {
          const x = p.random(p.width);
          const y = p.random(p.height * 0.75);
          const r = p.random(1.6, 2.8);
          const a = p.random(0.28, 0.6);
          state.brightStars.push({ x, y, r, a, id: i, hit: 12 });
        }

        state.nextShootingAt = p.millis() + p.random(3800, 9800);
      }

      function drawBackgroundStars() {
        p.noStroke();
        for (const s of state.stars) {
          const twinkle = prefersReducedMotion
            ? 1
            : 1 + (p.noise(s.ph + p.millis() * s.tw) - 0.5) * 0.35;
          const a = clamp(s.a * twinkle, 0, 1);
          p.fill(235, 242, 255, a * 255);
          p.circle(s.x, s.y, s.r);
        }
      }

      function drawBrightStars() {
        for (const s of state.brightStars) {
          const a = s.a;
          p.noStroke();
          p.fill(245, 248, 255, a * 255);
          p.circle(s.x, s.y, s.r);
          p.fill(245, 248, 255, Math.min(255, a * 255 * 0.22));
          p.circle(s.x, s.y, s.r * 6);
        }
      }

      function spawnShootingStar() {
        const startX = p.random(p.width * 0.2, p.width * 0.9);
        const startY = p.random(p.height * 0.05, p.height * 0.35);
        const vx = p.random(1100, 1600);
        const vy = p.random(520, 760);
        state.shooting.push({
          x: startX,
          y: startY,
          vx,
          vy,
          life: 0.75,
          age: 0,
        });
      }

      function drawShooting(dt) {
        for (let i = state.shooting.length - 1; i >= 0; i -= 1) {
          const s = state.shooting[i];
          s.age += dt;
          if (s.age >= s.life) {
            state.shooting.splice(i, 1);
            continue;
          }
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          const t = 1 - s.age / s.life;
          p.strokeCap(p.ROUND);
          p.stroke(255, 255, 255, Math.min(255, t * 255));
          p.strokeWeight(1.6);
          p.line(s.x, s.y, s.x - s.vx * 0.05, s.y - s.vy * 0.05);
        }
      }

      function drawPersistentTrails(dt) {
        if (prefersReducedMotion) {
          return;
        }

        for (let i = state.persistentTrails.length - 1; i >= 0; i -= 1) {
          const trail = state.persistentTrails[i];
          trail.age += dt;
          if (trail.age >= trail.life) {
            state.persistentTrails.splice(i, 1);
            continue;
          }

          const t = 1 - trail.age / trail.life;
          p.strokeCap(p.ROUND);
          p.stroke(185, 209, 255, Math.min(255, t * 160));
          p.strokeWeight(1.2);
          p.line(trail.x1, trail.y1, trail.x2, trail.y2);
        }
      }

      function drawFalling(dt) {
        for (let i = state.falling.length - 1; i >= 0; i -= 1) {
          const s = state.falling[i];
          s.age += dt;
          if (s.age >= s.life || s.y > p.height + 80) {
            state.falling.splice(i, 1);
            continue;
          }
          s.vy += 1400 * dt;
          s.vx += (p.noise(s.id * 10, p.millis() * 0.001) - 0.5) * 40;
          s.x += s.vx * dt;
          s.y += s.vy * dt;

          const t = 1 - s.age / s.life;
          p.strokeCap(p.ROUND);
          p.stroke(255, 255, 255, Math.min(255, t * 255));
          p.strokeWeight(1.8);
          p.line(s.x, s.y, s.x - s.vx * 0.03, s.y - 42);

          p.noStroke();
          p.fill(255, 255, 255, Math.min(255, t * 255));
          p.circle(s.x, s.y, s.r);
        }
      }

      p.setup = () => {
        const frame = getFrameViewport();
        const w = frame?.width || p.windowWidth;
        const h = frame?.height || p.windowHeight;
        canvas = p.createCanvas(w, h);
        canvas.parent(containerElement);
        canvas.style("position", "fixed");
        canvas.style("inset", "auto");
        canvas.style("pointer-events", "none");
        canvas.style("z-index", "0");
        applyCanvasLayout(canvas);
        p.pixelDensity(1);
        reseed(state.seed);
        initStars();
      };

      p.windowResized = () => {
        const frame = getFrameViewport();
        const w = frame?.width || p.windowWidth;
        const h = frame?.height || p.windowHeight;
        p.resizeCanvas(w, h);
        if (canvas) {
          applyCanvasLayout(canvas);
        }
        initStars();
      };

      p.draw = () => {
        p.clear();
        if (!state.enabled) {
          return;
        }

        const dt = p.deltaTime / 1000;
        if (dt <= 0) {
          return;
        }

        p.blendMode(p.ADD);
        drawBackgroundStars();
        drawBrightStars();
        drawPersistentTrails(dt);
        drawFalling(dt);

        if (!prefersReducedMotion) {
          if (p.millis() >= state.nextShootingAt) {
            spawnShootingStar();
            state.nextShootingAt = p.millis() + p.random(4200, 12000);
          }
          drawShooting(dt);
        }

        p.blendMode(p.BLEND);
      };
    };

    const instance = new window.p5(sketch);

    return {
      setEnabled(enabled) {
        state.enabled = Boolean(enabled);
      },
      setSeed(seed) {
        state.seed = seed;
        if (instance) {
          instance.randomSeed(seed);
          instance.noiseSeed(seed);
        }
      },
      hitTestBrightStar(x, y) {
        for (const s of state.brightStars) {
          const dx = x - s.x;
          const dy = y - s.y;
          if (dx * dx + dy * dy <= s.hit * s.hit) {
            return s;
          }
        }
        return null;
      },
      triggerFall(star) {
        if (!star || prefersReducedMotion) {
          return;
        }
        state.falling.push({
          id: star.id,
          x: star.x,
          y: star.y,
          vx: (Math.random() - 0.5) * 120,
          vy: 240,
          r: star.r + 0.6,
          life: 1.15,
          age: 0,
        });
      },
      spawnPersistentShootingStar() {
        if (prefersReducedMotion || !state.enabled || !instance) {
          return;
        }

        const startX = instance.random(instance.width * 0.18, instance.width * 0.76);
        const startY = instance.random(instance.height * 0.06, instance.height * 0.28);
        const length = instance.random(140, 240);
        const driftX = instance.random(96, 180);
        const driftY = instance.random(54, 110);

        state.persistentTrails.push({
          x1: startX,
          y1: startY,
          x2: startX - length,
          y2: startY - length * 0.52,
          life: 2.8,
          age: 0,
        });

        state.shooting.push({
          x: startX,
          y: startY,
          vx: driftX * 10,
          vy: driftY * 10,
          life: 0.85,
          age: 0,
        });
      },
    };
  }

  window.createStarfieldSystem = createStarfieldSystem;
})();

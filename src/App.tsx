import { HashRouter, Route, Routes } from "react-router-dom";
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./global.css";
import { useSession } from "./auth/useSession";
import { Toast } from "./ui/Toast";
import { useToast } from "./ui/useToast";
import { bulkInsertTodos, createTodo, deleteTodo, listTodos, reorderTodos, updateTodo } from "./data/cloudTodoStore";
import { normalizeLocalTodosForImport } from "./data/importLocalTodos";

type Filter = "all" | "active" | "done" | "today";

type Todo = {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  notes: string;
  done: boolean;
};

type StarfieldSystem = {
  setEnabled: (enabled: boolean) => void;
  setSeed: (seed: number) => void;
  triggerFall: (star?: unknown) => void;
  spawnPersistentShootingStar?: () => void;
};

type GsapTimeline = {
  to: (target: unknown, vars: Record<string, unknown>, position?: number) => GsapTimeline;
  kill: () => void;
  eventCallback: (event: string, cb: () => void) => void;
};

type Gsap = {
  timeline: () => GsapTimeline;
  to: (target: unknown, vars: Record<string, unknown>) => void;
  killTweensOf: (target: unknown) => void;
};

type RainSystem = {
  setSeed: (seed: number) => void;
  setStormMode: (storm: boolean) => void;
  setEmitters: (emitters: Array<{ x: number; y: number; w: number }>) => void;
  setIntensity: (value: number) => void;
  clear: () => void;
};

declare global {
  interface Window {
    createStarfieldSystem?: (container: HTMLElement) => StarfieldSystem | null;
    createRainSystem?: (container: HTMLElement) => RainSystem | null;
    gsap?: unknown;
  }
}

const STORAGE_KEY = "personal-command-desk-todos";
const THEME_STORAGE_KEY = "personal-command-desk-theme";

const CLOUDS: Array<{ id: string; className: string; src: string }> = [
  { id: "a", className: "cloud cloud-a", src: "assets/clouds/云1.png" },
  { id: "b", className: "cloud cloud-b", src: "assets/clouds/云2.png" },
  { id: "c", className: "cloud cloud-c", src: "assets/clouds/云3.png" },
  { id: "d", className: "cloud cloud-d", src: "assets/clouds/云4.png" },
  { id: "e", className: "cloud cloud-e", src: "assets/clouds/云5.png" },
];

function nowMs() {
  return Date.now();
}

function rand() {
  return Math.random();
}

function getGsap() {
  const gsap = window.gsap as unknown;
  if (!gsap) {
    return null;
  }
  return gsap as Gsap;
}

function withBase(pathname: string) {
  const base = import.meta.env.BASE_URL;
  return `${base}${pathname.replace(/^\//, "")}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function isSameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function parseIsoDate(value: string) {
  const parts = value.split("-");
  if (parts.length !== 3) {
    return null;
  }
  const [yearStr, monthStr, dayStr] = parts;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return startOfDay(date);
}

function getWeekRange(date: Date) {
  const base = startOfDay(date);
  const day = base.getDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const start = addDays(base, offsetToMonday);
  const end = addDays(start, 6);
  return { start, end };
}

function getWeekdayLabel(date: Date) {
  const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return labels[date.getDay()] || "";
}

function formatDateInputValue(date: Date) {
  const safe = startOfDay(date);
  const year = safe.getFullYear();
  const month = String(safe.getMonth() + 1).padStart(2, "0");
  const day = String(safe.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayKey() {
  return formatDateInputValue(new Date());
}

function formatDueDateLabel(value: string) {
  const due = parseIsoDate(value);
  if (!due) {
    return "";
  }

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  if (isSameDate(due, today)) {
    return "今天";
  }
  if (isSameDate(due, tomorrow)) {
    return "明天";
  }

  const thisWeek = getWeekRange(today);
  const nextWeek = getWeekRange(addDays(thisWeek.start, 7));
  if (due >= thisWeek.start && due <= thisWeek.end) {
    return `本周${getWeekdayLabel(due)}`;
  }
  if (due >= nextWeek.start && due <= nextWeek.end) {
    return `下周${getWeekdayLabel(due)}`;
  }

  const [, month, day] = value.split("-");
  if (!month || !day) {
    return "";
  }
  return `${month}/${day}`;
}

function migrateTodo(input: unknown): Todo {
  const todo = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  const id = typeof todo.id === "string" && todo.id ? todo.id : crypto.randomUUID();
  const title = typeof todo.title === "string" ? todo.title : "";
  const owner = typeof todo.owner === "string" && todo.owner.trim() ? todo.owner : "自己";
  const dueDate = typeof todo.dueDate === "string" ? todo.dueDate : "";
  const notes = typeof todo.notes === "string" ? todo.notes : "";
  const done = Boolean(todo.done);
  return { id, title, owner, dueDate, notes, done };
}

function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const today = startOfDay(new Date());
      return [
        {
          id: crypto.randomUUID(),
          title: "整理作品集首页结构",
          owner: "自己",
          dueDate: formatDateInputValue(today),
          notes: "先调整层级，再处理封面图与项目顺序。",
          done: false,
        },
        {
          id: crypto.randomUUID(),
          title: "确认文字与图片比例",
          owner: "摄影",
          dueDate: formatDateInputValue(addDays(today, 1)),
          notes: "统一标题密度，减少无效说明文字。",
          done: false,
        },
        {
          id: crypto.randomUUID(),
          title: "补一版移动端浏览状态",
          owner: "开发",
          dueDate: formatDateInputValue(today),
          notes: "优先保证一屏内能看到主要信息与首条内容。",
          done: true,
        },
      ];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(migrateTodo);
  } catch {
    return [];
  }
}

function getInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "night") {
      return "night";
    }
  } catch (error) {
    void error;
  }
  return "day";
}

function Home() {
  const [todos, setTodos] = useState<Todo[]>(() => loadTodos());
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"day" | "night">(() => getInitialTheme());

  const { user, enabled: authEnabled } = useSession();
  const { items: toasts, push: pushToast, remove: removeToast } = useToast();
  const cloudActive = Boolean(authEnabled && user);

  const [titleDraft, setTitleDraft] = useState("");
  const [ownerDraft, setOwnerDraft] = useState("");
  const [dueDraft, setDueDraft] = useState("");

  const skyLayerRef = useRef<HTMLDivElement | null>(null);
  const skyDimRef = useRef<HTMLDivElement | null>(null);
  const lightningLayerRef = useRef<HTMLDivElement | null>(null);
  const rainDropsLayerRef = useRef<HTMLDivElement | null>(null);
  const cloudRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const starLayerRef = useRef<HTMLDivElement | null>(null);
  const rainLayerRef = useRef<HTMLDivElement | null>(null);
  const starfieldRef = useRef<StarfieldSystem | null>(null);
  const rainRef = useRef<RainSystem | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const meteorLeftRef = useRef<HTMLButtonElement | null>(null);
  const meteorRightRef = useRef<HTMLButtonElement | null>(null);
  const stormTimelineRef = useRef<GsapTimeline | null>(null);
  const stormTickRef = useRef<number | null>(null);
  const rainTimerRef = useRef<number | null>(null);
  const lastCloudClickAtRef = useRef(0);
  const lastCloudClickIdRef = useRef<string | null>(null);
  const stormActiveCloudRef = useRef<HTMLButtonElement | null>(null);
  const importPromptedRef = useRef(false);

  const activeCount = useMemo(() => todos.filter((todo) => !todo.done).length, [todos]);
  const progressPercent = useMemo(() => {
    if (!todos.length) {
      return 0;
    }
    const doneCount = todos.filter((todo) => todo.done).length;
    return Math.round((doneCount / todos.length) * 100);
  }, [todos]);

  const visibleTodos = useMemo(() => {
    const todayKey = getTodayKey();
    return todos.filter((todo) => {
      if (filter === "today") {
        return todo.dueDate === todayKey;
      }
      if (filter === "active") {
        return !todo.done;
      }
      if (filter === "done") {
        return todo.done;
      }
      return true;
    });
  }, [filter, todos]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (error) {
      void error;
    }
  }, [todos]);

  useEffect(() => {
    if (!cloudActive) {
      importPromptedRef.current = false;
      return;
    }

    let alive = true;
    (async () => {
      try {
        const cloudTodos = await listTodos();
        if (!alive) {
          return;
        }

        const mapped = cloudTodos.map((t) => ({
          id: t.id,
          title: t.title,
          owner: t.owner,
          dueDate: t.dueDate,
          notes: t.notes,
          done: t.done,
        }));
        setTodos(mapped);

        if (cloudTodos.length === 0 && !importPromptedRef.current) {
          importPromptedRef.current = true;
          const raw = localStorage.getItem(STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          if (Array.isArray(parsed) && parsed.length) {
            const shouldImport = window.confirm("云端清单为空，是否将本机清单导入云端？");
            if (shouldImport) {
              const rows = normalizeLocalTodosForImport(parsed);
              await bulkInsertTodos(rows);
              const refreshed = await listTodos();
              if (!alive) {
                return;
              }
              setTodos(
                refreshed.map((t) => ({
                  id: t.id,
                  title: t.title,
                  owner: t.owner,
                  dueDate: t.dueDate,
                  notes: t.notes,
                  done: t.done,
                })),
              );
            }
          }
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "云端同步失败";
        pushToast(message);
      }
    })();

    return () => {
      alive = false;
    };
  }, [cloudActive, pushToast]);

  useEffect(() => {
    if (theme === "night") {
      document.documentElement.dataset.theme = "night";
    } else {
      delete document.documentElement.dataset.theme;
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      void error;
    }
  }, [theme]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preset = (params.get("nightPreset") || params.get("preset") || "B").trim().toUpperCase();
    if (preset) {
      document.documentElement.dataset.nightPreset = preset;
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--starfield-image",
      `url("${withBase("assets/starfield-blue.png")}")`,
    );
    document.documentElement.style.setProperty("--moon-image", `url("${withBase("assets/moon-blue.png")}")`);
  }, []);

  useEffect(() => {
    if (starfieldRef.current) {
      starfieldRef.current.setSeed(nowMs() % 1000000000);
      starfieldRef.current.setEnabled(theme === "night");
    }
  }, [theme]);

  useEffect(() => {
    const starLayer = starLayerRef.current;
    if (starLayer && !starfieldRef.current && window.createStarfieldSystem) {
      starfieldRef.current = window.createStarfieldSystem(starLayer);
      if (starfieldRef.current) {
        starfieldRef.current.setEnabled(theme === "night");
        starfieldRef.current.setSeed(nowMs() % 1000000000);
        starfieldRef.current.spawnPersistentShootingStar?.();
      }
    }

    const rainLayer = rainLayerRef.current;
    if (rainLayer && !rainRef.current && window.createRainSystem) {
      rainRef.current = window.createRainSystem(rainLayer);
    }
  }, [theme]);

  const prefersReducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  function stopStorm() {
    if (stormTimelineRef.current) {
      stormTimelineRef.current.kill();
      stormTimelineRef.current = null;
    }
    if (stormTickRef.current) {
      window.clearInterval(stormTickRef.current);
      stormTickRef.current = null;
    }
    if (rainTimerRef.current) {
      window.clearTimeout(rainTimerRef.current);
      rainTimerRef.current = null;
    }

    rainDropsLayerRef.current?.replaceChildren();

    const rainSystem = rainRef.current;
    if (rainSystem) {
      rainSystem.setStormMode(false);
      rainSystem.setIntensity(0);
      rainSystem.setEmitters([]);
      rainSystem.clear();
    }

    skyLayerRef.current?.classList.remove("is-raining", "is-storm");
    Object.values(cloudRefs.current).forEach((cloud) => cloud?.classList.remove("is-raining"));
    stormActiveCloudRef.current = null;

    if (skyDimRef.current) {
      skyDimRef.current.style.opacity = "0";
    }
    if (lightningLayerRef.current) {
      lightningLayerRef.current.style.opacity = "0";
      lightningLayerRef.current.replaceChildren();
    }
  }

  useEffect(() => {
    if (theme === "night") {
      stopStorm();
    }
  }, [theme]);

  function flashLightning(timeline: GsapTimeline, atSeconds: number, peakOpacity: number) {
    const lightningLayer = lightningLayerRef.current;
    if (!lightningLayer) {
      return;
    }

    timeline
      .to(lightningLayer, { opacity: peakOpacity, duration: 0.04, ease: "power4.out" }, atSeconds)
      .to(lightningLayer, { opacity: 0, duration: 0.18, ease: "power4.in" }, atSeconds + 0.05);
  }

  function triggerStorm() {
    stopStorm();

    skyLayerRef.current?.classList.add("is-raining", "is-storm");
    Object.values(cloudRefs.current).forEach((cloud) => cloud?.classList.add("is-raining"));

    const totalMs = 3800;
    const rampUpMs = 700;
    const rampDownMs = 700;

    const rainSystem = rainRef.current;
    const clouds = Object.values(cloudRefs.current).filter(Boolean) as HTMLButtonElement[];
    if (rainSystem && clouds.length) {
      const cloudRects = clouds.map((cloud) => cloud.getBoundingClientRect());
      const viewportW = window.innerWidth;
      const emitters = cloudRects.map((rect) => {
        const w = Math.min(viewportW * 0.42, rect.width * 3.3);
        return { x: rect.left + rect.width / 2, y: rect.bottom - 6, w };
      });
      rainSystem.setSeed(nowMs() % 1000000000);
      rainSystem.setStormMode(true);
      rainSystem.setEmitters(emitters);
    }

    const gsap = getGsap();
    if (prefersReducedMotion || !gsap) {
      if (rainSystem) {
        rainSystem.setIntensity(1);
        rainTimerRef.current = window.setTimeout(() => {
          stopStorm();
        }, totalMs);
      }
      return;
    }

    const timeline = gsap.timeline();
    stormTimelineRef.current = timeline;

    const skyDim = skyDimRef.current;
    if (skyDim) {
      timeline.to(skyDim, { opacity: 0.84, duration: 0.32, ease: "power2.out" }, 0);
      timeline.to(
        skyDim,
        { opacity: 0, duration: 0.65, ease: "power2.inOut" },
        (totalMs - rampDownMs) / 1000,
      );
    }

    flashLightning(timeline, 0.65, 1.0);
    flashLightning(timeline, 0.92, 0.86);
    flashLightning(timeline, 1.18, 1.0);
    flashLightning(timeline, 1.44, 0.88);
    flashLightning(timeline, 1.72, 1.0);
    flashLightning(timeline, 1.98, 0.84);
    flashLightning(timeline, 2.25, 1.0);
    flashLightning(timeline, 2.52, 0.86);
    flashLightning(timeline, 2.8, 1.0);

    if (rainSystem) {
      const driver = { t: 0 };
      timeline
        .to(
          driver,
          {
            t: 1,
            duration: rampUpMs / 1000,
            ease: "power2.out",
            onUpdate: () => {
              rainSystem.setIntensity(driver.t);
            },
          },
          0,
        )
        .to(
          driver,
          {
            t: 1,
            duration: (totalMs - rampUpMs - rampDownMs) / 1000,
            ease: "none",
            onUpdate: () => {
              rainSystem.setIntensity(driver.t);
            },
          },
          rampUpMs / 1000,
        )
        .to(
          driver,
          {
            t: 0,
            duration: rampDownMs / 1000,
            ease: "power2.in",
            onUpdate: () => {
              rainSystem.setIntensity(driver.t);
            },
          },
          (totalMs - rampDownMs) / 1000,
        );
    }

    timeline.eventCallback("onComplete", () => {
      stopStorm();
    });
  }

  function triggerSingleRainReduced(cloud: HTMLButtonElement) {
    stopStorm();

    skyLayerRef.current?.classList.add("is-raining");
    Object.values(cloudRefs.current).forEach((item) => item?.classList.remove("is-raining"));
    cloud.classList.add("is-raining");

    const rainLayer = rainDropsLayerRef.current;
    if (!rainLayer) {
      return;
    }

    const cloudRect = cloud.getBoundingClientRect();
    const showerWidth = Math.min(window.innerWidth * 0.5, cloudRect.width * 2.8);
    const showerLeft = Math.max(-60, cloudRect.left + cloudRect.width / 2 - showerWidth / 2);
    const showerTop = cloudRect.bottom - 6;

    rainLayer.replaceChildren();
    const dropCount = 18;
    for (let index = 0; index < dropCount; index += 1) {
      const drop = document.createElement("span");
      drop.className = "raindrop";
      drop.style.left = `${showerLeft + rand() * showerWidth}px`;
      drop.style.top = `${showerTop - rand() * 18}px`;
      drop.style.height = `${18 + rand() * 36}px`;
      drop.style.width = `${0.8 + rand() * 0.7}px`;
      drop.style.opacity = `${0.12 + rand() * 0.35}`;
      drop.style.animationDuration = `${0.75 + rand() * 0.55}s`;
      drop.style.setProperty("--rain-drift", `${-6 - rand() * 18}px`);
      drop.style.setProperty("--rain-tilt", `${-8 - rand() * 10}deg`);
      rainLayer.append(drop);
    }

    rainTimerRef.current = window.setTimeout(() => {
      rainLayer.replaceChildren();
      skyLayerRef.current?.classList.remove("is-raining");
      cloud.classList.remove("is-raining");
    }, 1300);
  }

  function triggerSingleRain(cloud: HTMLButtonElement) {
    stopStorm();

    const cloudRect = cloud.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const w = Math.min(viewportW * 0.62, cloudRect.width * 3.2);

    skyLayerRef.current?.classList.add("is-raining");
    Object.values(cloudRefs.current).forEach((item) => item?.classList.remove("is-raining"));
    cloud.classList.add("is-raining");
    stormActiveCloudRef.current = cloud;

    const gsap = getGsap();
    if (!prefersReducedMotion && gsap) {
      gsap.killTweensOf(cloud);
      gsap
        .timeline()
        .to(cloud, { scaleX: 0.97, scaleY: 0.94, y: "+=4", duration: 0.18, ease: "power2.out" })
        .to(
          cloud,
          { scaleX: 1.03, scaleY: 1.06, y: "-=8", duration: 0.34, ease: "power2.out" },
          0.08,
        )
        .to(cloud, { scaleX: 1, scaleY: 1, y: 0, duration: 0.9, ease: "elastic.out(1, 0.5)" });
    }

    lightningLayerRef.current?.replaceChildren();
    if (lightningLayerRef.current) {
      lightningLayerRef.current.style.opacity = "0";
    }

    const totalMs = 2600;
    const rampUpMs = 650;
    const rampDownMs = 650;

    const rainSystem = rainRef.current;
    if (rainSystem) {
      rainSystem.setSeed(nowMs() % 1000000000);
      rainSystem.setStormMode(false);
      rainSystem.setEmitters([{ x: cloudRect.left + cloudRect.width / 2, y: cloudRect.bottom - 6, w }]);

      if (gsap) {
        const driver = { t: 0 };
        const timeline = gsap.timeline();
        stormTimelineRef.current = timeline;
        timeline
          .to(
            driver,
            {
              t: 1,
              duration: rampUpMs / 1000,
              ease: "power2.out",
              onUpdate: () => {
                rainSystem.setIntensity(driver.t);
              },
            },
            0,
          )
          .to(
            driver,
            {
              t: 1,
              duration: (totalMs - rampUpMs - rampDownMs) / 1000,
              ease: "none",
              onUpdate: () => {
                rainSystem.setIntensity(driver.t);
              },
            },
            rampUpMs / 1000,
          )
          .to(
            driver,
            {
              t: 0,
              duration: rampDownMs / 1000,
              ease: "power2.in",
              onUpdate: () => {
                rainSystem.setIntensity(driver.t);
              },
            },
            (totalMs - rampDownMs) / 1000,
          );

        timeline.eventCallback("onComplete", () => {
          rainSystem.setIntensity(0);
          rainSystem.clear();
          rainSystem.setEmitters([]);
          skyLayerRef.current?.classList.remove("is-raining");
          stormActiveCloudRef.current?.classList.remove("is-raining");
          stormActiveCloudRef.current = null;
        });
      } else {
        rainTimerRef.current = window.setTimeout(() => {
          rainSystem.setIntensity(0);
          rainSystem.clear();
          rainSystem.setEmitters([]);
          skyLayerRef.current?.classList.remove("is-raining");
          stormActiveCloudRef.current?.classList.remove("is-raining");
          stormActiveCloudRef.current = null;
        }, totalMs);
      }
      return;
    }

    triggerSingleRainReduced(cloud);
  }

  function onCloudClick(cloud: HTMLButtonElement, cloudId: string) {
    if (theme === "night") {
      return;
    }

    if (prefersReducedMotion) {
      triggerSingleRainReduced(cloud);
      return;
    }

    const now = nowMs();
    const withinWindow = now - lastCloudClickAtRef.current <= 3000;
    const differentCloud = lastCloudClickIdRef.current && lastCloudClickIdRef.current !== cloudId;

    lastCloudClickAtRef.current = now;
    lastCloudClickIdRef.current = cloudId;

    if (withinWindow && differentCloud) {
      triggerStorm();
      lastCloudClickAtRef.current = 0;
      lastCloudClickIdRef.current = null;
      return;
    }

    triggerSingleRain(cloud);
  }

  useEffect(() => {
    const gsap = getGsap();
    const clouds = Object.values(cloudRefs.current).filter(Boolean) as HTMLButtonElement[];
    if (theme !== "day" || prefersReducedMotion || !gsap || clouds.length === 0) {
      return;
    }

    clouds.forEach((cloud, index) => {
      const distanceX = index === 1 ? -18 : index === 2 ? 14 : 20;
      const distanceY = index === 1 ? 10 : 6;
      const scale = index === 1 ? 1.03 : 1.04;

      gsap.to(cloud, {
        x: distanceX,
        y: distanceY,
        scale,
        duration: 6.4 + index,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    });

    return () => {
      clouds.forEach((cloud) => {
        gsap.killTweensOf(cloud);
      });
    };
  }, [prefersReducedMotion, theme]);

  function addTodo(event: React.FormEvent) {
    event.preventDefault();
    const title = titleDraft.trim();
    if (!title) {
      return;
    }

    const draft = {
      title,
      owner: ownerDraft.trim() || "自己",
      dueDate: dueDraft || "",
      notes: "",
      done: false,
    };

    if (cloudActive) {
      const optimisticId = crypto.randomUUID();
      setTodos((current) => [...current, { id: optimisticId, ...draft }]);
      createTodo({ ...draft, sortIndex: todos.length })
        .then((created) => {
          setTodos((current) =>
            current.map((t) =>
              t.id === optimisticId
                ? {
                    id: created.id,
                    title: created.title,
                    owner: created.owner,
                    dueDate: created.dueDate,
                    notes: created.notes,
                    done: created.done,
                  }
                : t,
            ),
          );
        })
        .catch((e) => {
          const message = e instanceof Error ? e.message : "云端保存失败";
          pushToast(message);
          setTodos((current) => current.filter((t) => t.id !== optimisticId));
        });
    } else {
      setTodos((current) => [...current, { id: crypto.randomUUID(), ...draft }]);
    }

    setTitleDraft("");
    setOwnerDraft("");
    setDueDraft("");
  }

  function toggleDone(id: string) {
    setTodos((current) => {
      const next = current.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo));
      if (cloudActive) {
        const todo = next.find((t) => t.id === id);
        if (todo) {
          updateTodo(id, { done: todo.done }).catch((e) => {
            const message = e instanceof Error ? e.message : "云端更新失败";
            pushToast(message);
            listTodos()
              .then((cloudTodos) => {
                setTodos(
                  cloudTodos.map((t) => ({
                    id: t.id,
                    title: t.title,
                    owner: t.owner,
                    dueDate: t.dueDate,
                    notes: t.notes,
                    done: t.done,
                  })),
                );
              })
              .catch(() => {});
          });
        }
      }
      return next;
    });
  }

  function removeTodo(id: string) {
    const before = todos;
    setTodos((current) => current.filter((todo) => todo.id !== id));
    if (cloudActive) {
      deleteTodo(id).catch((e) => {
        const message = e instanceof Error ? e.message : "云端删除失败";
        pushToast(message);
        setTodos(before);
      });
    }
  }

  function setTodoField(id: string, patch: Partial<Todo>) {
    setTodos((current) => current.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo)));
  }

  function onDragStart(id: string) {
    dragIdRef.current = id;
  }

  function onDrop(overId: string) {
    const draggedId = dragIdRef.current;
    dragIdRef.current = null;
    if (!draggedId || draggedId === overId) {
      return;
    }
    setTodos((current) => {
      const next = [...current];
      const from = next.findIndex((t) => t.id === draggedId);
      const to = next.findIndex((t) => t.id === overId);
      if (from < 0 || to < 0) {
        return current;
      }
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      if (cloudActive) {
        reorderTodos(next.map((t) => t.id)).catch((e) => {
          const message = e instanceof Error ? e.message : "云端排序失败";
          pushToast(message);
          listTodos()
            .then((cloudTodos) => {
              setTodos(
                cloudTodos.map((t) => ({
                  id: t.id,
                  title: t.title,
                  owner: t.owner,
                  dueDate: t.dueDate,
                  notes: t.notes,
                  done: t.done,
                })),
              );
            })
            .catch(() => {});
        });
      }
      return next;
    });
  }

  function fireMeteor(button: HTMLButtonElement | null) {
    if (!button) {
      return;
    }
    button.classList.remove("is-firing");
    void button.offsetWidth;
    button.classList.add("is-firing");
    starfieldRef.current?.spawnPersistentShootingStar?.();
  }

  return (
    <div id="appRoot">
      <div className="ambient ambient-a"></div>
      <div className="ambient ambient-b"></div>

      <div className="sky-layer" aria-hidden="true" ref={skyLayerRef}>
        <div className="sky-dim" ref={skyDimRef}></div>
        <div className="lightning-layer" id="lightningLayer" ref={lightningLayerRef}></div>
        <div className="rain-canvas-layer" id="rainCanvasLayer" ref={rainLayerRef}></div>
        <div className="star-canvas-layer" id="starCanvasLayer" ref={starLayerRef}></div>
        <div className="moon-layer" aria-hidden="true"></div>
        {CLOUDS.map((cloud) => (
          <button
            key={cloud.id}
            className={cloud.className}
            type="button"
            aria-label="点击下雨"
            data-cloud-trigger
            data-cloud-id={cloud.id}
            ref={(el) => {
              cloudRefs.current[cloud.id] = el;
            }}
            onClick={() => {
              const node = cloudRefs.current[cloud.id];
              if (node) {
                onCloudClick(node, cloud.id);
              }
            }}
          >
            <span className="cloud-shadow"></span>
            <img className="cloud-art" src={withBase(cloud.src)} alt="" />
          </button>
        ))}
        <div className="rain-layer" id="rainLayer" ref={rainDropsLayerRef}></div>
      </div>

      <div className="theme-toggle" role="group" aria-label="切换日夜模式">
        <button
          className="theme-toggle__item"
          type="button"
          data-theme-set="day"
          aria-pressed={theme === "day" ? "true" : "false"}
          onClick={() => setTheme("day")}
        >
          日
        </button>
        <div className="theme-toggle__divider" aria-hidden="true"></div>
        <button
          className="theme-toggle__item"
          type="button"
          data-theme-set="night"
          aria-pressed={theme === "night" ? "true" : "false"}
          onClick={() => setTheme("night")}
        >
          夜
        </button>
      </div>

      <button
        ref={meteorLeftRef}
        className="meteor-trigger meteor-trigger--left"
        type="button"
        aria-label="召唤一颗流星"
        onClick={() => {
          if (theme !== "night") {
            setTheme("night");
          }
          fireMeteor(meteorLeftRef.current);
        }}
      ></button>
      <button
        ref={meteorRightRef}
        className="meteor-trigger meteor-trigger--right"
        type="button"
        aria-label="召唤一颗流星"
        onClick={() => {
          if (theme !== "night") {
            setTheme("night");
          }
          fireMeteor(meteorRightRef.current);
        }}
      ></button>

      <main className="shell">
        <section className="hero panel">
          <div className="hero-copy">
            <h1 className="hero-title">
              <span className="title-block">天水围的日与夜</span>
            </h1>
          </div>

          <div className="hero-side">
            <div className="hero-meta">
              <div className="meta-card">
                <div className="meta-item">
                  <span className="meta-label">今日项目</span>
                  <strong>{activeCount} 项待完成</strong>
                </div>
                <div className="meta-item">
                  <span className="meta-label">完成进度</span>
                  <strong>{progressPercent}%</strong>
                </div>
              </div>
            </div>

            <div className="quote-card todo-panel">
              <div className="toolbar toolbar-inline">
                <div className="filter-group" id="filterGroup">
                  <button
                    className={`filter ${filter === "all" ? "is-active" : ""}`}
                    data-filter="all"
                    type="button"
                    onClick={() => setFilter("all")}
                  >
                    全部
                  </button>
                  <button
                    className={`filter ${filter === "active" ? "is-active" : ""}`}
                    data-filter="active"
                    type="button"
                    onClick={() => setFilter("active")}
                  >
                    进行中
                  </button>
                  <button
                    className={`filter ${filter === "done" ? "is-active" : ""}`}
                    data-filter="done"
                    type="button"
                    onClick={() => setFilter("done")}
                  >
                    已完成
                  </button>
                </div>
                <button
                  className={`checkpoint checkpoint-today ${filter === "today" ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setFilter((current) => (current === "today" ? "all" : "today"))}
                >
                  只看今天
                </button>
              </div>

              <ul className="todo-list" aria-live="polite">
                {visibleTodos.map((todo, index) => {
                  const isEditing = editingId === todo.id;
                  return (
                    <li
                      key={todo.id}
                      className={`todo-item ${todo.done ? "is-done" : ""} ${isEditing ? "is-editing" : ""}`}
                      draggable
                      onDragStart={() => onDragStart(todo.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => onDrop(todo.id)}
                    >
                      <div className="drag-handle" aria-hidden="true">
                        ⋮⋮
                      </div>
                      <button
                        className="check-button"
                        type="button"
                        aria-label="切换完成状态"
                        onClick={() => toggleDone(todo.id)}
                      ></button>
                      <div className="row-index" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div className="todo-body">
                        <div className="todo-display">
                          <div className="todo-line">
                            <span className="todo-title-text">{todo.title || "未命名条目"}</span>
                            <span className="tag owner-tag">{todo.owner || ""}</span>
                            <span className="tag due-tag">{todo.dueDate ? formatDueDateLabel(todo.dueDate) : ""}</span>
                          </div>
                        </div>

                        <div className="todo-editor">
                          <label className="inline-field">
                            <span>Todo内容</span>
                            <input
                              className="todo-title-input"
                              type="text"
                              maxLength={80}
                              placeholder="点击这里直接修改条目标题"
                              readOnly={!isEditing}
                              value={todo.title}
                              onChange={(event) => setTodoField(todo.id, { title: event.target.value })}
                            />
                          </label>

                          <label className="inline-field">
                            <span>协作方</span>
                            <input
                              className="todo-owner-input"
                              type="text"
                              maxLength={40}
                              placeholder="负责人 / 依赖对象"
                              readOnly={!isEditing}
                              value={todo.owner}
                              onChange={(event) => setTodoField(todo.id, { owner: event.target.value })}
                            />
                          </label>

                          <label className="inline-field">
                            <span>完成时间</span>
                            <input
                              className="todo-due-input"
                              type="date"
                              readOnly={!isEditing}
                              value={todo.dueDate}
                              onChange={(event) => setTodoField(todo.id, { dueDate: event.target.value })}
                            />
                          </label>

                          <label className="note-field">
                            <span>项目备注</span>
                            <textarea
                              className="todo-note-input"
                              rows={2}
                              maxLength={240}
                              placeholder="记录问题、上下文、下一步动作"
                              readOnly={!isEditing}
                              value={todo.notes}
                              onChange={(event) => setTodoField(todo.id, { notes: event.target.value })}
                            ></textarea>
                          </label>
                        </div>
                      </div>

                      <div className="item-actions">
                        <button
                          className="item-edit-button"
                          type="button"
                          onClick={() => {
                            setEditingId((current) => {
                              const next = current === todo.id ? null : todo.id;
                              if (current === todo.id && cloudActive) {
                                updateTodo(todo.id, {
                                  title: todo.title,
                                  owner: todo.owner,
                                  dueDate: todo.dueDate,
                                  notes: todo.notes,
                                  done: todo.done,
                                }).catch((e) => {
                                  const message = e instanceof Error ? e.message : "云端更新失败";
                                  pushToast(message);
                                  listTodos()
                                    .then((cloudTodos) => {
                                      setTodos(
                                        cloudTodos.map((t) => ({
                                          id: t.id,
                                          title: t.title,
                                          owner: t.owner,
                                          dueDate: t.dueDate,
                                          notes: t.notes,
                                          done: t.done,
                                        })),
                                      );
                                    })
                                    .catch(() => {});
                                });
                              }
                              return next;
                            });
                          }}
                        >
                          {isEditing ? "完成" : "编辑"}
                        </button>
                        <button
                          className="delete-button"
                          type="button"
                          aria-label="删除任务"
                          onClick={() => removeTodo(todo.id)}
                        >
                          删除
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {visibleTodos.length === 0 ? (
                <p className="empty-state">还没有条目，先把今天最重要的一件工作收录进来。</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="composer panel">
          <div className="composer-head">
            <div>
              <h2>新增待办</h2>
            </div>
          </div>

          <form className="todo-form" onSubmit={addTodo}>
            <label className="field">
              <span>Todo内容</span>
              <input
                id="todoInput"
                name="title"
                type="text"
                maxLength={80}
                placeholder="日光落在楼群之间"
                autoComplete="off"
                required
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
              />
            </label>

            <label className="field">
              <span>协作方</span>
              <input
                id="ownerInput"
                name="owner"
                type="text"
                maxLength={40}
                placeholder="可填写负责人或依赖对象"
                autoComplete="off"
                value={ownerDraft}
                onChange={(event) => setOwnerDraft(event.target.value)}
              />
            </label>

            <label className="field">
              <span>完成时间</span>
              <input
                id="dueInput"
                name="dueDate"
                type="date"
                autoComplete="off"
                value={dueDraft}
                onChange={(event) => setDueDraft(event.target.value)}
              />
            </label>

            <button className="primary-button" type="submit">
              加入清单
            </button>
          </form>
        </section>
      </main>

      <Toast items={toasts} onRemove={removeToast} />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </HashRouter>
  );
}

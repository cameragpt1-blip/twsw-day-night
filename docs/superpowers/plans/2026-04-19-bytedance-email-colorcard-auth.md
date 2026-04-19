# 字节邮箱前缀 + 色卡密码登录（Supabase）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将站点登录体系替换为“字节邮箱前缀 + 色卡密码”，默认登录态、保留去注册入口；移除手机号/邮箱验证码登录与跨设备配对入口；Todo 继续云端隔离（RLS）与同步。

**Architecture:** 前端 GitHub Pages（React）使用 Supabase Auth（Email+Password）+ Postgres（RLS）实现隔离。登录弹窗只暴露“邮箱前缀 + 色卡密码”，底层映射为 `prefix@bytedance.com` 与 `C?-C?` 密码串。忘记密码不走找回，提供“同名覆盖注册”，由 Edge Function（service role）完成用户删除 + 重建 + 返回 session。

**Tech Stack:** React + TypeScript + Vite + react-router-dom(HashRouter) + Supabase(Auth + Postgres + RLS + Edge Functions) + GitHub Pages

---

## File Structure

**Create**
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/bytedanceEmail.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/colorPassword.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/__tests__/bytedanceEmail.test.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/__tests__/colorPassword.test.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/OverwriteRegisterModal.tsx`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/overwriteRegisterClient.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/supabase/functions/overwrite-register/index.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/supabase/migrations/20260419_pair_logins_cleanup.sql`（可选：彻底下线配对相关表/策略）

**Modify**
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/LoginModal.tsx`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/App.tsx`（移除 `/pair` 路由与配对 UI 入口）
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/pairLoginClient.ts`（不再使用；可删除或留但不引用）
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/supabaseClient.ts`（保留；确认 `detectSessionInUrl` 不再依赖 magic link）
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/eslint.config.js`（如需调整忽略 supabase 目录保持）

**Test**
- 继续使用 Vitest：`npm run test`

---

## Task 0: Supabase Auth 配置（一次性后台操作）

**Goal:** 允许 Email+Password 注册/登录且无需邮箱确认。

- [ ] **Step 1: 启用 Email Provider**
  - Supabase → Authentication → Providers → Email：Enabled

- [ ] **Step 2: 关闭邮箱确认**
  - Supabase → Authentication → Settings（或 Email 设置）：
    - 关闭 “Confirm email / Email confirmations / Enable email confirmations”

- [ ] **Step 3: 允许注册**
  - Supabase → Authentication → Settings：
    - 允许 Signups（如有开关）

**Expected:** `signUp(email,password)` 成功后能直接拿到 session（不需要点邮件）。

---

## Task 1: 邮箱前缀规范化（TDD）

**Files:**
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/bytedanceEmail.ts`
- Test: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/__tests__/bytedanceEmail.test.ts`

- [ ] **Step 1: 写 failing test**

```ts
import { describe, expect, it } from "vitest";
import { normalizeBytedanceEmailPrefix } from "../bytedanceEmail";

describe("normalizeBytedanceEmailPrefix", () => {
  it("rejects empty or contains @", () => {
    expect(normalizeBytedanceEmailPrefix("")).toEqual({ ok: false, error: "请输入字节邮箱前缀" });
    expect(normalizeBytedanceEmailPrefix("a@b")).toEqual({ ok: false, error: "只需输入邮箱前缀" });
  });

  it("accepts prefix and builds @bytedance.com email", () => {
    expect(normalizeBytedanceEmailPrefix("zhangsan")).toEqual({ ok: true, email: "zhangsan@bytedance.com" });
  });

  it("rejects invalid chars", () => {
    expect(normalizeBytedanceEmailPrefix("张三")).toEqual({ ok: false, error: "仅允许字母数字及 . _ -" });
    expect(normalizeBytedanceEmailPrefix("a b")).toEqual({ ok: false, error: "仅允许字母数字及 . _ -" });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
cd /Users/bytedance/Documents/trae_projects/personal-todo-aipa
npm run test
```

Expected: FAIL（找不到模块/函数）。

- [ ] **Step 3: 最小实现**

```ts
export type NormalizeResult =
  | { ok: true; email: string; prefix: string }
  | { ok: false; error: string };

const SUFFIX = "@bytedance.com";
const PREFIX_RE = /^[a-z0-9._-]{2,32}$/i;

export function normalizeBytedanceEmailPrefix(input: string): NormalizeResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "请输入字节邮箱前缀" };
  if (raw.includes("@")) return { ok: false, error: "只需输入邮箱前缀" };
  if (!PREFIX_RE.test(raw)) return { ok: false, error: "仅允许字母数字及 . _ -" };
  return { ok: true, prefix: raw.toLowerCase(), email: `${raw.toLowerCase()}${SUFFIX}` };
}
```

- [ ] **Step 4: 运行测试，确认通过**

- [ ] **Step 5: Commit（可选）**
```bash
git add src/auth/bytedanceEmail.ts src/auth/__tests__/bytedanceEmail.test.ts
git commit -m "feat(auth): normalize bytedance email prefix"
```

---

## Task 2: 色卡密码映射（TDD）

**Goal:** 2 色无序 → 稳定密码串 `C?-C?`。

**Files:**
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/colorPassword.ts`
- Test: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/__tests__/colorPassword.test.ts`

- [ ] **Step 1: 写 failing test**

```ts
import { describe, expect, it } from "vitest";
import { colorIdsToPassword, isColorId } from "../colorPassword";

describe("color password", () => {
  it("validates ids", () => {
    expect(isColorId("C1")).toBe(true);
    expect(isColorId("C9")).toBe(true);
    expect(isColorId("C0")).toBe(false);
  });

  it("is order-insensitive and stable", () => {
    expect(colorIdsToPassword("C2", "C8")).toBe("C2-C8");
    expect(colorIdsToPassword("C8", "C2")).toBe("C2-C8");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

- [ ] **Step 3: 最小实现**

```ts
export type ColorId = `C${1|2|3|4|5|6|7|8|9}`;

export function isColorId(value: string): value is ColorId {
  return /^C[1-9]$/.test(value);
}

export function colorIdsToPassword(a: ColorId, b: ColorId) {
  return [a, b].sort().join("-");
}

export const COLOR_CARDS: Array<{ id: ColorId; hex: string; label: string }> = [
  { id: "C1", hex: "#5E7CFF", label: "蓝" },
  { id: "C2", hex: "#8B5CF6", label: "紫" },
  { id: "C3", hex: "#F97316", label: "橙" },
  { id: "C4", hex: "#22C55E", label: "绿" },
  { id: "C5", hex: "#06B6D4", label: "青" },
  { id: "C6", hex: "#E11D48", label: "玫红" },
  { id: "C7", hex: "#FACC15", label: "黄" },
  { id: "C8", hex: "#94A3B8", label: "银灰" },
  { id: "C9", hex: "#111827", label: "墨黑" },
];
```

- [ ] **Step 4: 测试通过**

- [ ] **Step 5: Commit（可选）**
```bash
git add src/auth/colorPassword.ts src/auth/__tests__/colorPassword.test.ts
git commit -m "feat(auth): add color card password mapping"
```

---

## Task 3: 重做 LoginModal（只保留“前缀+色卡”登录/注册，主题适配）

**Goal:** UI 高级、符合日/夜风格；默认登录态；保留去注册入口；移除旧模式。

**Files:**
- Modify: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/LoginModal.tsx`
- Modify: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/global.css`（如需新增弹窗 token/色卡样式）

- [ ] **Step 1: 写一个最小 UI test（可选）**
  - 本项目目前无 React Testing Library 体系要求，可跳过 UI test，依赖 lint/build + 手动验证。

- [ ] **Step 2: 代码重构：删除旧 mode/step**
  - 删除手机号 OTP、邮箱 magic link、pairing UI 与相关状态
  - 替换为：
    - `view: "login" | "register"`
    - `prefix: string`
    - `selected: ColorId[]`（最多 2 个，第三次替换最早选择）
    - `inlineError: string | null`
    - `busy: boolean`

- [ ] **Step 3: 实现登录**
  - 规范化 email：`normalizeBytedanceEmailPrefix(prefix)`
  - 生成 password：`colorIdsToPassword(selected[0], selected[1])`
  - 调用：

```ts
await supabase.auth.signInWithPassword({ email, password });
```

- [ ] **Step 4: 实现注册**
  - 调用：

```ts
await supabase.auth.signUp({ email, password });
```

  - 若返回 error 且包含 “already registered / already exists”：
    - 在注册页显示“该账号已存在，请去登录”
  - 增加“覆盖注册”按钮（见 Task 4）

- [ ] **Step 5: 主题适配**
  - 读取当前主题：通过 `document.documentElement.dataset.theme`（day/night）
  - 弹窗容器根据主题选择不同背景/边框/阴影 token（写入 `global.css`）

- [ ] **Step 6: 手动验证**
  - 日/夜切换下弹窗对比度与质感一致
  - 选择色卡 2 个可提交，第三个会替换第一个
  - 错误文案不会一闪而过（inline 展示）

- [ ] **Step 7: Commit（可选）**
```bash
git add src/auth/LoginModal.tsx src/global.css
git commit -m "feat(auth): add bytedance prefix + color card login modal"
```

---

## Task 4: 覆盖注册（同名重置）Edge Function + 前端强确认

**Goal:** “忘记密码 → 覆盖注册”实现：删除旧用户与 todos，创建新用户并直接登录；同时必须强确认降低误触。

**Files:**
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/overwriteRegisterClient.ts`
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/OverwriteRegisterModal.tsx`
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/supabase/functions/overwrite-register/index.ts`

### Edge Function（服务端）

- [ ] **Step 1: Edge Function 设计**
  - 入参：`email`（完整字节邮箱）、`password`（C?-C?）
  - 行为：
    1) 用 service role 找到该 email 的 user（如存在）
    2) 删除其 todos（`delete from public.todos where user_id = <id>`）
    3) 删除 user
    4) 创建 user（email + password），返回用户 id
    5) 用 `signInWithPassword` 方式创建 session 并返回 `access_token` / `refresh_token`

- [ ] **Step 2: 在 Supabase 侧新增 function secret（不允许 SUPABASE_ 前缀）**
  - `SERVICE_ROLE_KEY`：sb_secret_...
  - `SUPABASE_URL` 为系统内置

### 前端（强确认）

- [ ] **Step 3: 覆盖注册入口（注册页）**
  - 文案：`重新注册（会清空云端旧数据）`
  - 点击后弹出二次确认 modal：
    - 显示账号（prefix@bytedance.com）
    - 显示风险
    - 倒计时 5 秒后按钮可点击
    - 要求再次输入一次邮箱前缀确认（降低误触）

- [ ] **Step 4: 覆盖注册成功后登录**
  - 调用 Edge Function → 拿到 tokens
  - `supabase.auth.setSession({ access_token, refresh_token })`

- [ ] **Step 5: Commit（可选）**
```bash
git add src/auth/overwriteRegisterClient.ts src/auth/OverwriteRegisterModal.tsx supabase/functions/overwrite-register
git commit -m "feat(auth): add overwrite register flow"
```

---

## Task 5: 下线旧登录方式与配对入口

**Goal:** UI 与路由层面彻底隐藏旧方案。

**Files:**
- Modify: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/App.tsx`
- Modify: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/LoginModal.tsx`
- Optional delete: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/pairLoginClient.ts`
- Optional delete: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/redirect.ts`（若不再使用）

- [ ] **Step 1: 删除 `/pair` 路由**
  - `Routes` 中移除 `path="/pair"`
  - `Home` 中移除配对 overlay UI
  - 站点内不再出现配对文案/按钮

- [ ] **Step 2: 移除旧登录 UI**
  - LoginModal 中去掉手机号/邮箱验证码相关分支与状态

- [ ] **Step 3:（可选）清理 Supabase 侧旧资源**
  - 可先不删 function/表（避免误删），但前端不再调用

- [ ] **Step 4: Commit（可选）**
```bash
git add src/App.tsx src/auth/LoginModal.tsx
git commit -m "chore(auth): remove pairing and otp auth flows"
```

---

## Verification Checklist

- [ ] `npm run lint` 无报错
- [ ] `npm run test` 全绿
- [ ] `npm run build` 成功
- [ ] 线上（GitHub Pages）：
  - [ ] 登录弹窗仅有“字节邮箱前缀 + 色卡密码”
  - [ ] 注册/登录成功后云端 Todo 生效
  - [ ] 不同账号隔离生效（RLS）
  - [ ] “覆盖注册”强确认有效，且会清空旧数据

---

## Execution Handoff

Plan complete and saved to `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/docs/superpowers/plans/2026-04-19-bytedance-email-colorcard-auth.md`.

Two execution options:
- **1. Subagent-Driven (recommended)** — Use superpowers:subagent-driven-development task-by-task
- **2. Inline Execution** — Execute in this session

Which approach?


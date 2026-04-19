# 手机号登录 + 云端 Todo（Supabase）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 GitHub Pages 上的 Todo 站点增加“手机号验证码登录 + 云端存储 + 多用户隔离”，并保持入口 B：未登录可浏览，但所有写操作需要登录。

**Architecture:** 前端继续 GitHub Pages；使用 Supabase 提供 Auth（Phone OTP）与 Postgres 数据库。前端通过 `supabase-js` 直接读写，依靠 RLS 强制 `user_id = auth.uid()` 数据隔离；本地 `localStorage` 仅作为访客模式/缓存与导入源。

**Tech Stack:** React + TypeScript + Vite + react-router-dom(HashRouter) + Supabase(Auth + Postgres + RLS) + GitHub Actions Pages 部署

---

## File Structure

**Create**
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/supabaseClient.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/useSession.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/LoginModal.tsx`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/todoRepo.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/todoTypes.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/localTodoStore.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/cloudTodoStore.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/syncPolicy.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/importLocalTodos.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/ui/Toast.tsx`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/ui/useToast.ts`

**Modify**
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/App.tsx`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/.github/workflows/pages.yml`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/package.json`（新增 supabase-js，新增 test 脚本）

**Test**
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/__tests__/importLocalTodos.test.ts`
- `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/__tests__/syncPolicy.test.ts`

---

## Task 0: Supabase 项目与短信登录配置（一次性后台操作）

**Goal:** 创建 Supabase 项目 + 开启手机号 OTP + 创建 todos 表 + 打开 RLS。

- [ ] **Step 1: 创建 Supabase 项目**
  - 打开 https://supabase.com/dashboard
  - New project → 填 Project name、Database password、Region → Create new project

- [ ] **Step 2: 开启手机号登录（Phone OTP）**
  - Project → Authentication → Providers
  - 启用 Phone
  - OTP 设置：
    - 选择 OTP（验证码）模式
    - 设置合理的 OTP 过期时间（例如 5 分钟）
  - 配置短信供应商（生产环境必须）
    - Authentication → SMS Provider → 选择 Twilio（或你选用的供应商）
    - 填 Account SID / Auth Token / Sender number（由供应商提供）
    - 保存

- [ ] **Step 3: 创建表与 RLS（SQL）**
  - Project → SQL Editor → New query → 粘贴并运行：

```sql
create extension if not exists pgcrypto;

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  owner text not null default '',
  due_date date null,
  notes text not null default '',
  done boolean not null default false,
  sort_index int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists todos_user_sort_idx on public.todos(user_id, sort_index);
create index if not exists todos_user_due_idx on public.todos(user_id, due_date);

alter table public.todos enable row level security;

create policy "todos_select_own"
on public.todos
for select
to authenticated
using (auth.uid() = user_id);

create policy "todos_insert_own"
on public.todos
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "todos_update_own"
on public.todos
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "todos_delete_own"
on public.todos
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_todos_updated_at on public.todos;
create trigger set_todos_updated_at
before update on public.todos
for each row
execute function public.set_updated_at();
```

- [ ] **Step 4: 获取前端配置**
  - Project Settings → API
  - 复制：
    - Project URL
    - anon public key

**Expected:** 可以通过 Supabase Dashboard 看到 `public.todos` 表；RLS 已启用；Providers 启用了 Phone。

---

## Task 1: 在前端接入 Supabase 客户端与 Session（TDD）

**Files:**
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/supabaseClient.ts`
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/useSession.ts`
- Modify: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/package.json`

- [ ] **Step 1: 安装依赖（supabase-js）**

Run:
```bash
cd /Users/bytedance/Documents/trae_projects/personal-todo-aipa
npm i @supabase/supabase-js
```

- [ ] **Step 2: 增加环境变量读取（本地开发）**
  - 在本机创建 `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/.env.local`（不要提交到 git）：

```bash
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

- [ ] **Step 3: 实现 supabaseClient**

```ts
// /Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
```

- [ ] **Step 4: 实现 useSession**

```ts
// /Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/useSession.ts
import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      setReady(true);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { ready, session, user };
}
```

- [ ] **Step 5: Commit（可选）**
```bash
git add package.json package-lock.json src/auth
git commit -m "feat: add supabase client and session hook"
```

---

## Task 2: 登录弹窗（手机号 OTP）+ 入口 B 写操作拦截

**Files:**
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/LoginModal.tsx`
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/ui/useToast.ts`
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/ui/Toast.tsx`
- Modify: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/App.tsx`

- [ ] **Step 1: 实现一个最小 Toast（用于错误提示）**

```ts
// /Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/ui/useToast.ts
import { useCallback, useState } from "react";

export type ToastItem = { id: string; message: string };

export function useToast() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { items, push, remove };
}
```

```tsx
// /Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/ui/Toast.tsx
import type { ToastItem } from "./useToast";

export function Toast({ items, onRemove }: { items: ToastItem[]; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div style={{ position: "fixed", left: 16, bottom: 16, zIndex: 50, display: "grid", gap: 10 }}>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onRemove(t.id)}
          style={{
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(10,12,20,0.82)",
            color: "rgba(244,248,255,0.9)",
            padding: "10px 12px",
            borderRadius: 14,
            textAlign: "left",
            cursor: "pointer",
            maxWidth: 360,
          }}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 实现 LoginModal（手机号 OTP）**

```tsx
// /Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/auth/LoginModal.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

type Step = "phone" | "otp";

function normalizePhone(input: string) {
  const value = input.trim();
  if (!value) return "";
  if (value.startsWith("+")) return value;
  return `+86${value.replace(/\s+/g, "")}`;
}

export function LoginModal({
  open,
  onClose,
  onLoggedIn,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  onLoggedIn: () => void;
  onToast: (message: string) => void;
}) {
  const [step, setStep] = useState<Step>("phone");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const phone = useMemo(() => normalizePhone(phoneRaw), [phoneRaw]);

  useEffect(() => {
    if (!open) return;
    setStep("phone");
    setOtp("");
    setBusy(false);
    setCooldown(0);
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (!open) return null;

  async function sendOtp() {
    if (!phone || phone.length < 8) {
      onToast("请输入正确手机号");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) throw error;
      setStep("otp");
      setCooldown(60);
      onToast("验证码已发送");
    } catch (e) {
      const message = e instanceof Error ? e.message : "发送失败";
      onToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (!otp || otp.length < 4) {
      onToast("请输入验证码");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
      if (error) throw error;
      onLoggedIn();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "验证失败";
      onToast(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.46)",
        padding: 18,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(10,12,20,0.86)",
          padding: 16,
          boxShadow: "0 22px 72px rgba(0,0,0,0.58)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 12 }}>
            登录以同步到云端
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 0, background: "transparent", color: "rgba(244,248,255,0.72)", cursor: "pointer" }}
          >
            关闭
          </button>
        </div>

        {step === "phone" ? (
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "rgba(244,248,255,0.64)" }}>手机号</span>
              <input
                value={phoneRaw}
                onChange={(e) => setPhoneRaw(e.target.value)}
                placeholder="例如 13800138000"
                autoComplete="tel"
                inputMode="tel"
                style={{
                  height: 46,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(5,6,12,0.62)",
                  color: "rgba(244,248,255,0.9)",
                  padding: "0 12px",
                }}
              />
            </label>
            <button
              type="button"
              onClick={sendOtp}
              disabled={busy}
              style={{
                height: 46,
                borderRadius: 14,
                border: 0,
                background: "linear-gradient(180deg, rgba(169,194,255,0.92), rgba(79,110,232,0.98))",
                color: "rgba(7,10,14,0.96)",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              获取验证码
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "rgba(244,248,255,0.64)" }}>验证码</span>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6 位验证码"
                autoComplete="one-time-code"
                inputMode="numeric"
                style={{
                  height: 46,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(5,6,12,0.62)",
                  color: "rgba(244,248,255,0.9)",
                  padding: "0 12px",
                }}
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                onClick={verifyOtp}
                disabled={busy}
                style={{
                  height: 46,
                  borderRadius: 14,
                  border: 0,
                  background: "linear-gradient(180deg, rgba(169,194,255,0.92), rgba(79,110,232,0.98))",
                  color: "rgba(7,10,14,0.96)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                登录
              </button>
              <button
                type="button"
                onClick={sendOtp}
                disabled={busy || cooldown > 0}
                style={{
                  height: 46,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(5,6,12,0.62)",
                  color: "rgba(244,248,255,0.86)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {cooldown > 0 ? `重发 (${cooldown}s)` : "重发验证码"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 在 App.tsx 引入 useSession + LoginModal，并拦截写操作**
  - 规则：未登录时，允许浏览；但以下行为必须弹窗：
    - 新增
    - 编辑字段变更（title/owner/due/notes）
    - 删除
    - 拖拽排序
    - 切换 done
  - 实现方式：
    - 在每个 handler 开头判断 `user == null` → `setLoginOpen(true)` 并 return
    - 登录成功后不需要自动重放动作（MVP），仅解锁功能

- [ ] **Step 4: 提供“退出登录”按钮**
  - 在右上角或 hero meta 里增加：

```ts
await supabase.auth.signOut();
```

- [ ] **Step 5: Commit（可选）**
```bash
git add src/auth src/ui src/App.tsx
git commit -m "feat: add phone otp login modal and write gate"
```

---

## Task 3: 云端 Todo Repo + 同步（TDD）

**Goal:** 登录后从 Supabase 拉取 todo；写操作写入云端；保留访客 localStorage。

**Files:**
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/todoTypes.ts`
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/cloudTodoStore.ts`
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/localTodoStore.ts`
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/importLocalTodos.ts`
- Create: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/syncPolicy.ts`
- Create test: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/__tests__/importLocalTodos.test.ts`
- Create test: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/__tests__/syncPolicy.test.ts`

### Test setup（Vitest）

- [ ] **Step 1: 安装 vitest + jsdom**

Run:
```bash
cd /Users/bytedance/Documents/trae_projects/personal-todo-aipa
npm i -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: 在 package.json 增加 test 脚本**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### Unit: 导入规则与同步策略（先写测试）

- [ ] **Step 3: 写入失败测试：importLocalTodos 会生成 sort_index 并做字段归一**

```ts
// /Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/__tests__/importLocalTodos.test.ts
import { describe, expect, it } from "vitest";
import { normalizeLocalTodosForImport } from "../importLocalTodos";

describe("normalizeLocalTodosForImport", () => {
  it("assigns sort_index and normalizes fields", () => {
    const raw = [
      { id: "a", title: "t1", owner: "o", dueDate: "2026-04-19", notes: "", done: false },
      { id: "b", title: "t2", owner: "", dueDate: "", notes: "n", done: true },
    ];
    const out = normalizeLocalTodosForImport(raw);
    expect(out[0].sort_index).toBe(0);
    expect(out[1].sort_index).toBe(1);
    expect(out[0].title).toBe("t1");
    expect(out[1].owner).toBe("");
    expect(out[0].due_date).toBe("2026-04-19");
  });
});
```

- [ ] **Step 4: 运行测试，确认失败**

Run:
```bash
cd /Users/bytedance/Documents/trae_projects/personal-todo-aipa
npm run test
```

Expected: FAIL（找不到 `normalizeLocalTodosForImport`）。

- [ ] **Step 5: 实现 importLocalTodos（最小实现通过测试）**

```ts
// /Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/importLocalTodos.ts
export type LocalTodo = {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  notes: string;
  done: boolean;
};

export type InsertTodoRow = {
  title: string;
  owner: string;
  due_date: string | null;
  notes: string;
  done: boolean;
  sort_index: number;
};

export function normalizeLocalTodosForImport(input: unknown): InsertTodoRow[] {
  const arr = Array.isArray(input) ? input : [];
  return arr.map((t, i) => {
    const todo = typeof t === "object" && t ? (t as Record<string, unknown>) : {};
    const title = typeof todo.title === "string" ? todo.title : "";
    const owner = typeof todo.owner === "string" ? todo.owner : "";
    const dueDate = typeof todo.dueDate === "string" ? todo.dueDate : "";
    const notes = typeof todo.notes === "string" ? todo.notes : "";
    const done = Boolean(todo.done);
    return {
      title,
      owner,
      due_date: dueDate ? dueDate : null,
      notes,
      done,
      sort_index: i,
    };
  });
}
```

- [ ] **Step 6: 运行测试，确认通过**

Expected: PASS。

### Cloud store（实现 repo，运行时验证）

- [ ] **Step 7: 实现 todoTypes**

```ts
// /Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/todoTypes.ts
export type Todo = {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  notes: string;
  done: boolean;
  sortIndex: number;
  updatedAt: string;
};

export type TodoPatch = Partial<Pick<Todo, "title" | "owner" | "dueDate" | "notes" | "done" | "sortIndex">>;
```

- [ ] **Step 8: 实现 cloudTodoStore（CRUD + reorder）**

```ts
// /Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/cloudTodoStore.ts
import { supabase } from "../auth/supabaseClient";
import type { Todo, TodoPatch } from "./todoTypes";

function rowToTodo(row: any): Todo {
  return {
    id: row.id,
    title: row.title,
    owner: row.owner ?? "",
    dueDate: row.due_date ?? "",
    notes: row.notes ?? "",
    done: Boolean(row.done),
    sortIndex: Number(row.sort_index ?? 0),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  };
}

export async function listTodos() {
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .order("sort_index", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToTodo);
}

export async function createTodo(input: { title: string; owner: string; dueDate: string; notes: string; done: boolean; sortIndex: number }) {
  const { data, error } = await supabase
    .from("todos")
    .insert({
      title: input.title,
      owner: input.owner,
      due_date: input.dueDate ? input.dueDate : null,
      notes: input.notes,
      done: input.done,
      sort_index: input.sortIndex,
      user_id: (await supabase.auth.getUser()).data.user?.id,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToTodo(data);
}

export async function updateTodo(id: string, patch: TodoPatch) {
  const { data, error } = await supabase
    .from("todos")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.owner !== undefined ? { owner: patch.owner } : {}),
      ...(patch.dueDate !== undefined ? { due_date: patch.dueDate ? patch.dueDate : null } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.done !== undefined ? { done: patch.done } : {}),
      ...(patch.sortIndex !== undefined ? { sort_index: patch.sortIndex } : {}),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToTodo(data);
}

export async function deleteTodo(id: string) {
  const { error } = await supabase.from("todos").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderTodos(idsInOrder: string[]) {
  const updates = idsInOrder.map((id, index) => ({ id, sort_index: index }));
  const { error } = await supabase.from("todos").upsert(updates, { onConflict: "id" });
  if (error) throw error;
}
```

Notes:
- `user_id` 在 insert 里必须写入；若 `getUser()` 为空则抛错并要求重新登录。

- [ ] **Step 9: 在 App.tsx 登录后改为读取云端**
  - `useSession()` ready 且 user 存在时：
    - `listTodos()` → `setTodos(...)`
  - 访客模式仍使用原本的 localStorage（现有逻辑）

- [ ] **Step 10: 写操作从“本地写入”切换为“云端写入 + 乐观 UI”**
  - 增删改排序、toggle done：先更新 UI，再 await 云端；失败 toast 并回滚（MVP 可直接重新 `listTodos()`）

- [ ] **Step 11: Commit（可选）**
```bash
git add src/data package.json package-lock.json src/App.tsx
git commit -m "feat: sync todos with supabase (rls isolated)"
```

---

## Task 4: 首次登录导入（localStorage → 云端）

**Goal:** 云端为空时提示导入；导入写入 Supabase 并保持排序。

**Files:**
- Modify: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/App.tsx`
- Modify: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/cloudTodoStore.ts`
- Use: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/src/data/importLocalTodos.ts`

- [ ] **Step 1: 在 cloudTodoStore 增加批量插入**

```ts
export async function bulkInsertTodos(rows: Array<{ title: string; owner: string; due_date: string | null; notes: string; done: boolean; sort_index: number }>) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not logged in");
  const payload = rows.map((r) => ({ ...r, user_id: user.id }));
  const { error } = await supabase.from("todos").insert(payload);
  if (error) throw error;
}
```

- [ ] **Step 2: App.tsx 中实现“云端为空 → 弹导入提示”**
  - 登录后 `listTodos()` 若返回空数组：
    - 读取本地 `localStorage.getItem("personal-command-desk-todos")`
    - 若本地有内容：弹窗询问是否导入
    - 选“导入”：
      - `normalizeLocalTodosForImport(...)`
      - `bulkInsertTodos(...)`
      - 再 `listTodos()` 刷新

- [ ] **Step 3: Commit（可选）**
```bash
git add src/App.tsx src/data/cloudTodoStore.ts
git commit -m "feat: prompt import local todos on first login"
```

---

## Task 5: GitHub Pages Secrets 注入（生产环境可用）

**Goal:** 不把 Supabase URL/anon key 写死在仓库里，通过 GitHub Actions 构建注入。

**Files:**
- Modify: `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/.github/workflows/pages.yml`

- [ ] **Step 1: 在 GitHub 仓库添加 Secrets**
  - Repo → Settings → Secrets and variables → Actions → New repository secret
  - 新增：
    - `VITE_SUPABASE_URL`
    - `VITE_SUPABASE_ANON_KEY`

- [ ] **Step 2: workflow 中 build 步骤增加 env**

```yml
- name: Build
  run: npm run build
  env:
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

- [ ] **Step 3: 在本地删除/忽略 .env.local**
  - 确保 `.env.local` 不提交

- [ ] **Step 4: 推送后验证**
  - GitHub → Actions → Deploy to GitHub Pages 变绿
  - 打开线上页面尝试发送验证码（短信供应商未配置会失败，属于预期）

- [ ] **Step 5: Commit（可选）**
```bash
git add .github/workflows/pages.yml
git commit -m "chore: inject supabase env for pages build"
```

---

## Verification Checklist

- [ ] 本地：`npm run lint` 无报错
- [ ] 本地：`npm run build` 成功
- [ ] 本地：`npm run test` 全绿
- [ ] 未登录：
  - [ ] 页面可浏览、动效正常
  - [ ] 新增/编辑/删除/拖拽/切换完成态会弹出登录
- [ ] 登录后：
  - [ ] 能加载云端 todo
  - [ ] 写操作能落到云端并在刷新后保持一致
- [ ] 不同手机号：
  - [ ] 互相看不到对方 todo（RLS 生效）
- [ ] GitHub Pages：
  - [ ] Actions 自动发布成功
  - [ ] 线上资源路径正确（clouds/starfield/moon 均可加载）

---

## Execution Handoff

Plan complete and saved to `/Users/bytedance/Documents/trae_projects/personal-todo-aipa/docs/superpowers/plans/2026-04-19-phone-login-supabase.md`.

Two execution options:
- **1. Subagent-Driven (recommended)** — Use superpowers:subagent-driven-development task-by-task
- **2. Inline Execution** — Execute in this session

Which approach?


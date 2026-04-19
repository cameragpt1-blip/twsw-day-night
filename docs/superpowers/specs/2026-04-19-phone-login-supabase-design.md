# 手机号登录 + 云端 Todo（Supabase）设计稿

**项目**：天水围的日与夜（GitHub Pages 前端）

**目标**：
- 朋友可用：每个手机号一个账号，Todo 彼此隔离
- 云端存储更安全：跨设备同步、浏览器清缓存不丢
- 尽量保持现有前端体验（视觉/动效/交互节奏）

**已确认选择**：
- 入口：B（可浏览，但编辑/新增需要登录）
- 云端：C（Supabase）

---

## 约束与结论

### 约束
- 前端托管：GitHub Pages（静态站点）
- 需要手机号 + 验证码：必须依赖短信通道（第三方供应商），纯前端无法“真实发送短信”
- 不引入自建后端：尽量用 BaaS（Supabase）完成 Auth + DB

### 结论
- 使用 Supabase Auth 的 Phone OTP（短信验证码）做登录
- 使用 Supabase Postgres 存 Todo，并用 Row Level Security（RLS）按 `user_id` 强制隔离
- 前端继续 GitHub Pages；云端能力由 Supabase 提供

---

## 方案对比（简版）

### 方案 1：Supabase Auth + Postgres（推荐）
- 优点：最少后端代码、RLS 天然隔离、SQL 查询直观、后续扩展（协作/共享）容易
- 缺点：需要配置短信供应商；Supabase 端要开策略与表结构

### 方案 2：Supabase 只存“整表 JSON”
- 优点：后端表结构简单
- 缺点：冲突/合并困难、排序/筛选难做、后续扩展会痛苦

推荐选择：方案 1。

---

## 产品体验（入口 B）

### 未登录状态
- 页面可正常浏览（展示“示例 Todo 列表”或本机的访客数据）
- 新增/编辑/删除/拖拽排序/切换完成态等“写操作”会触发登录弹窗
- 右上角主题切换保持可用；夜景/雨/星空/流星交互保持可用

### 登录弹窗
- 字段：手机号（E.164 或简单国内手机号校验）+ 验证码（6 位）
- 操作：发送验证码（带倒计时、重发）+ 验证并登录
- 登录成功后：
  - 自动拉取云端 Todo 列表渲染
  - 顶部显示“已登录手机号（脱敏）”与“退出”

### 登录后状态
- 所有写操作恢复
- Todo 来源以云端为准；可保留本地缓存以加速首屏/弱网体验

---

## 数据模型（Supabase）

### 表：`todos`

字段（建议）：
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null`（引用 `auth.users.id`）
- `title text not null`
- `owner text not null default ''`（协作方）
- `due_date date null`（完成时间）
- `notes text not null default ''`
- `done boolean not null default false`
- `sort_index int not null`（排序）
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

索引：
- `(user_id, sort_index)` 用于列表渲染
- `(user_id, due_date)` 用于“今天”筛选

### RLS 策略
- `SELECT`：仅允许 `auth.uid() = user_id`
- `INSERT`：仅允许 `auth.uid() = user_id`
- `UPDATE`：仅允许 `auth.uid() = user_id`
- `DELETE`：仅允许 `auth.uid() = user_id`

### 排序策略
- 前端维护 `sort_index`，拖拽后批量更新受影响的若干行
- 初始插入：`sort_index = max(sort_index)+1`

---

## 同步策略（保持简单但可靠）

### MVP 同步（第一阶段）
- 登录后：从云端拉取整表（该用户）
- 任意写操作：乐观更新 UI → 调用 Supabase 写入 → 失败则回滚并提示
- 本地缓存：
  - 用 `localStorage` 保存最近一次云端快照（按 user_id 分桶）
  - 断网时允许浏览缓存，但写操作提示“离线不可保存”或进入“离线草稿”

### 冲突处理
MVP 先采用简单策略：
- 同一用户多端同时编辑：以最后写入为准（`updated_at`）
- 不做复杂合并；必要时在 UI 提示“云端已更新，已刷新”

---

## 迁移与导入（从现有 localStorage）

现状：现在的 Todo 存在 `localStorage`（key：`personal-command-desk-todos`）。

建议行为：
- 首次登录且云端为空：弹出一次性提示“是否将本地清单导入云端？”
  - 选“导入”：把本地 Todo 写入云端，并设置 `sort_index`
  - 选“跳过”：保持云端为空并使用云端数据
- 如果云端已有数据：默认以云端为准；提供“导入为新任务（追加）”选项（可后续做）

---

## 前端结构（React）

新增模块（概念）：
- `auth/`：
  - `useSession()`：订阅 Supabase session
  - `LoginModal`：手机号 OTP 登录弹窗
- `data/`：
  - `todoRepo`：封装 `list/create/update/delete/reorder`，避免组件里散落 DB 逻辑

现有 UI 保持：
- 天空层（云/雨/星空/流星/月亮）、主题切换
- Todo 列表与编辑体验

写操作拦截点：
- `onAddTodo`、`onEdit`、`onDelete`、`onReorder`、`onToggleDone`
  - 若未登录：打开 `LoginModal`，并记录“用户原本的意图”（登录成功后继续执行一次）

---

## 部署与配置（GitHub Pages）

### Supabase 公钥配置
- 前端需要 `SUPABASE_URL` 与 `SUPABASE_ANON_KEY`
- 这些不是“秘密”，可以放在前端，但要依赖 RLS 保护数据

### 推荐配置方式
- 使用 GitHub Actions 的 `VITE_` 环境变量注入构建（GitHub Secrets + workflow env）
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- 前端代码通过 `import.meta.env.VITE_SUPABASE_URL` 读取

---

## 安全与风控

最低要求：
- RLS 必须开启并正确配置（否则 anon key 会导致全库可读写）
- OTP 发送频率限制（由 Supabase + 短信供应商侧控制）
- UI 侧补充基本防刷：
  - 发送验证码按钮倒计时
  - 同手机号频繁发送提示

---

## 验收标准（MVP）

- 未登录可浏览，但任何写操作都会要求登录
- 登录后：
  - Todo 能云端读取
  - 新增/编辑/删除/拖拽排序/切换完成态都能写入云端并刷新一致
  - 同一账号换设备登录能看到同一份 Todo
- 不同手机号登录看到的是各自 Todo（隔离生效）


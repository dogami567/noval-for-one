# Backend Foundation Spec: Supabase Schema + Services (Final)

**ID**: 005-supabase-foundation  
**Status**: FINAL  
**Date**: 2025-12-12  
**Owner**: Technical Architect (GPT‑5.2)  
**Target**: Execution Agent

本任务 spec 继承并遵循全局基线：`spec/000-system-architecture-final.md`。  
本文件为 005 的**唯一执行规格**。

---

## 1. Goals / Non‑Goals

### Goals
- 为 MVP 建立 Supabase 作为唯一 SoT：落地 **schema + RLS + services**。
- 将前端数据源从 `constants.ts` 迁移为 Supabase 读取，保持 002/003/004 交互行为不变。
- 支持“动态世界”的最小数据管线：`currentLocationId` / `discoveryStage` / `locations.status` 可被未来状态机更新。
- 资产迁移到 Supabase Storage（public buckets）。

### Non‑Goals (V1)
- MVP **不做登录/用户态**：不实现 `chat_logs`、收藏、用户进度等。
- 不实现 V2 的小模型事件抽取/状态机，只做表与字段预留。

---

## 2. Environment & Keys

### 2.1 Frontend env（Vite）
在 `.env.local`（不提交）中配置：
```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_ADMIN_MODE=false
```
`VITE_ADMIN_MODE` 用于本地/管理员模式开关（见 6.3）。

### 2.2 Server env（Vercel Functions / 未来用）
在 Vercel 项目环境变量中配置（不下发前端）：
```
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

---

## 3. Migrations Workflow

**首选**：Supabase CLI + 迁移文件（可追溯）。
- 在仓库根创建 `supabase/migrations/`。
- 执行 AI 产出 `005_init_schema.sql`（或时间戳命名）放入该目录。
- 你可用 CLI `supabase db push` 或在 Supabase SQL Editor 手动执行该 migration。

**允许手动 fallback**：若暂不使用 CLI，则只要确保 migration SQL 被执行到远端即可。

---

## 4. Database Schema (public)

> 约定：表/列使用 snake_case；主键 uuid；`created_at` 默认 `now()`。

### 4.1 `locations`（public read）
字段：
- `id uuid pk`
- `name text not null`
- `type text not null`（mystic|nature|city|ruin…）
- `x numeric not null`（0–100）
- `y numeric not null`（0–100）
- `description text`
- `lore text`
- `image_url text`
- `status text not null`（locked|unlocked）
- `created_at timestamptz`

RLS：
- enable RLS
- policy: anon/public 允许 `select`
- 不创建任何 `insert/update/delete` policy（默认拒绝）

### 4.2 `characters`（public read）
字段（对齐现有 UI + 未来 Tavern）：
- `id uuid pk`
- `name text not null`
- `title text`
- `faction text`
- `description text`
- `lore text`
- `image_url text`
- `stories jsonb`（array）
- `current_location_id uuid fk → locations.id not null`
- `home_location_id uuid fk → locations.id null`
- `discovery_stage text not null`（hidden|rumor|revealed）
- `bio text`（给 Tavern/叙事用）
- `rp_prompt text`（system prompt 片段）
- `attributes jsonb`（结构化属性）
- `created_at timestamptz`

RLS：
- enable RLS
- policy: anon/public 允许 `select`
- 无写入 policy

### 4.3 `timeline_events`（public read）
用于 Chronicles 区域（对应 `ChronicleEntry`）：
- `id uuid pk`
- `title text not null`
- `date_label text`
- `summary text`
- `status text not null`（completed|active|pending）
- `created_at timestamptz`

RLS：
- enable RLS
- policy: anon/public 允许 `select`
- 无写入 policy

### 4.4 `world_state`（private, singleton）
用于 AI/叙事的**全局记忆**（V2+ 才会真正读写）：
- `id text pk default 'global'`
- `summary text`（当前世界全局摘要/记忆）
- `memory jsonb`（可选：结构化状态）
- `updated_at timestamptz`
- `source text`（manual|ai）

RLS：
- enable RLS
- **不开放 anon 读写**（无 policy）

### 4.5 `world_events`（private, append‑only）
V2 事件日志/人工兜底入口：
- `id uuid pk`
- `type text not null`（CHARACTER_MOVED / LOCATION_UNLOCKED / CHARACTER_DISCOVERY_UPDATED）
- `payload jsonb not null`
- `source text not null`（ai|manual）
- `confidence numeric null`
- `approved boolean default false`
- `created_at timestamptz`
- `applied_at timestamptz null`

RLS：
- enable RLS
- 无 anon policy

---

## 5. Storage Buckets

创建 **public buckets**（Supabase 控制台或 CLI）：
- `maps`
- `locations`
- `characters`

文件约定：
- `maps/map-v1.jpg`
- `locations/<locationId>/cover.jpg`
- `characters/<characterId>/portrait.jpg`

前端通过 `supabase.storage.from('<bucket>').getPublicUrl(path)` 获取 URL。

---

## 6. Services Layer & Frontend Refactor

### 6.1 Dependencies
执行 AI 需安装：
```
npm install @supabase/supabase-js
```

### 6.2 New services
新增：
- `services/supabaseClient.ts`：用 `VITE_SUPABASE_URL/ANON_KEY` 初始化 browser client。
- `services/locationService.ts`：`listLocations()` / `getLocation(id)`。
- `services/characterService.ts`：`listCharacters()` / `listCharactersByLocation(id)`。
- `services/chronicleService.ts`：`listTimelineEvents()`。
- `services/worldStateService.ts`：只做读取占位（未来 V2 用）。

所有 services 返回强类型（对齐 `types.ts`；必要时在 service 内做字段 camelCase 映射）。

### 6.3 Disable editing for public MVP
由于 MVP 无登录且 public 表禁止写入：
- 在 `Sidebar.tsx` / `CharacterSidebar.tsx` 中：
  - 当 `import.meta.env.VITE_ADMIN_MODE !== 'true'` 时隐藏/禁用编辑按钮与保存流程。
  - 避免匿名用户触发无权限写入错误。

### 6.4 Replace constants source
在 `App.tsx`：
- mount 时并行拉取 locations/characters/timeline_events。
- 在加载完成前可保留 skeleton/placeholder。
- 若拉取失败，可 fallback 到 `constants.ts`（仅作容错，不作为主路径）。

保持 003/004 的过滤逻辑，但数据来自 Supabase。

---

## 7. Acceptance Criteria
- App 首屏能从 Supabase 正常拉取 locations/characters/timeline_events 并渲染。
- 003/004 的筛选、locked gating、rumor 占位卡行为与当前一致。
- public 表匿名只读；无登录情况下 UI 不出现编辑入口。
- Storage public buckets 能正确加载地图/头图/角色图（或暂用外链 fallback）。


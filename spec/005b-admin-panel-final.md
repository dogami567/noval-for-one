# Admin Editing Spec: Frontend Admin Panel + Serverless CRUD (Final)

**ID**: 005b-admin-panel  
**Status**: FINAL  
**Date**: 2025-12-12  
**Owner**: Technical Architect (GPT‑5.2)  
**Target**: Execution Agent

本任务为 005/005a 之后的轻量管理能力补充，继承并遵循：  
- `spec/000-system-architecture-final.md`  
- `spec/005-supabase-foundation-final.md`

本文件为 005b 的**唯一执行规格**。

---

## 1. Goals / Non‑Goals

### Goals
- 在**不引入登录体系**的前提下，提供一个仅管理员可用的前端编辑页，方便非技术用户（女朋友）直接维护世界观数据。
- 通过 Vercel Serverless Functions 使用 `service_role` 进行 Supabase 写入，保持 public 表对游客继续只读。
- 覆盖三张 public lore 表的 CRUD：
  - `locations`
  - `characters`
  - `timeline_events`

### Non‑Goals
- 不做正式 Auth / 角色系统（游客 vs 管理员仍靠“口令 + 后端校验”）。
- 不做复杂的可视化拖点/地图编辑器（只做表单字段编辑）。
- 不做 Storage 上传流程（V1 仅允许填 `image_url` 外链；真正上传留到后续）。

---

## 2. Environment & Secrets

### 2.1 Vercel 环境变量（仅后端）
在 Vercel 项目设置中添加（**不下发前端**）：
```
SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
ADMIN_EDIT_TOKEN=<long-random-secret>
```

说明：
- `SUPABASE_SERVICE_ROLE_KEY` 用于后端绕过 RLS 写入，严禁出现在浏览器端。
- `ADMIN_EDIT_TOKEN` 是管理员口令对应的共享 secret（可随时更换）。

### 2.2 Frontend（浏览器）
前端**不新增 env**，管理员口令由用户在 `/admin` 页面输入。

---

## 3. Serverless Admin API（Vercel Functions）

### 3.1 通用约定
- 目录：`api/admin/`
- 每个文件对应一张表，支持 CRUD。
- Admin 身份校验：
  - 前端请求必须带 header：`x-admin-token: <token>`。
  - 后端读取 `process.env.ADMIN_EDIT_TOKEN` 对比，不匹配则返回 `401`。
- 后端 Supabase client：
  ```ts
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
  ```

### 3.2 Endpoints

#### `api/admin/locations.ts`
- `GET /api/admin/locations`
  - 返回 `locations` 全量（按 `created_at asc`）。
- `POST /api/admin/locations`
  - body: `Partial<LocationRow>`（snake_case）
  - 允许创建新地点。
- `PATCH /api/admin/locations?id=<uuid>`
  - body: `Partial<LocationRow>`
  - 仅更新指定 id。
- `DELETE /api/admin/locations?id=<uuid>`
  - 删除指定 id（谨慎使用）。

#### `api/admin/characters.ts`
同上 CRUD 结构，对表 `characters`。
- `PATCH` 需允许更新：
  - `current_location_id`
  - `discovery_stage`
  - `image_url / bio / rp_prompt / attributes / stories`

#### `api/admin/timeline-events.ts`
同上 CRUD 结构，对表 `timeline_events`。

### 3.3 错误处理
- Supabase error 直接透传 `status=500` + `message`。
- 所有成功返回 JSON：
  - `GET`：`{ data: Row[] }`
  - 其它：`{ data: Row | null }`

---

## 4. Frontend Admin Page

### 4.1 路由/入口
由于当前为 Vite SPA，无 router：
- 当 `window.location.pathname === '/admin'` 时渲染管理员界面。
- 其它路径保持现有 App。
- 不在 Navbar/页面中提供入口链接（仅通过手动输入 URL 进入）。

实现方式二选一：
1. 在 `index.tsx`（或 `App.tsx` 顶层）判断 pathname，选择渲染 `<AdminPage />` 或 `<App />`。
2. 新增轻量 router（不推荐，本任务避免引入依赖）。

### 4.2 AdminPage 功能
新增 `components/AdminPage.tsx`（或 `pages/AdminPage.tsx`）：
- 首屏为“管理员口令”输入框。
- 口令正确后：
  - 缓存到 `localStorage.setItem('adminEditToken', token)`。
  - 展示管理面板；提供“退出管理模式”按钮清除缓存。

### 4.3 数据读取与写入
- 读取：
  - 可复用现有 `listLocations/listCharacters/listTimelineEvents` 读取 public 数据。
- 写入：
  - 新增 `services/adminApi.ts`（或同名）：
    - 封装 `fetch('/api/admin/...')`。
    - 自动从 localStorage 取 `adminEditToken` 并写入 `x-admin-token` header。
    - 提供 `create/update/delete` 方法。

### 4.4 UI 形态（最小可用）
面板结构：
- 顶部 Tabs：`地点` / `角色` / `编年史事件`。
- 每个 Tab：
  - 左侧列表（按 name 或 created_at 排序）。
  - 右侧表单编辑区（选中即加载表单）。
  - `新增` / `保存` / `删除` 按钮。

字段表单（snake_case 在保存前由前端映射）：

**Locations**
- `name`（文本）
- `type`（下拉：mystic/nature/city/ruin）
- `x`/`y`（数字 0–100）
- `description`（短文）
- `lore`（长文）
- `imageUrl`（URL）
- `status`（locked/unlocked 下拉）

**Characters**
- `name/title/faction/description/lore/bio/rpPrompt`（文本/长文）
- `imageUrl`（URL）
- `stories`（textarea JSON 或简易列表编辑，V1 允许直接编辑 JSON）
- `currentLocationId`（下拉：locations）
- `homeLocationId`（可选下拉）
- `discoveryStage`（hidden/rumor/revealed 下拉）

**Timeline Events**
- `title/date/summary`（文本/长文）
- `status`（completed/active/pending 下拉）

保存成功后：
- toast/提示“已保存”，并刷新当前列表。

---

## 5. Acceptance Criteria
- 访问 `/admin` 时出现口令页；错误口令无法进入面板。
- 正确口令进入后可对三张表进行新增/编辑/删除，刷新页面数据仍存在（写入 Supabase 成功）。
- 普通游客路径下无编辑入口，且 anon 仍然只读 public 表。
- 不出现 `service_role` 泄漏到前端 bundle 的情况。


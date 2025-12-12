# Chat Attachments Spec: 图片/文本文件随聊上传（Final）

**ID**: 006b-chat-attachments  
**Status**: FINAL  
**Date**: 2025-12-12  
**Owner**: Technical Architect (GPT‑5.2)  
**Target**: Execution Agent

本任务为 006 的扩展补丁，继承并遵循：  
- `spec/000-system-architecture-final.md`  
- `spec/006-chat-backend-final.md`

本文件为 006b 的**唯一执行规格**。

---

## 1. Goals / Non‑Goals

### Goals
- 在对话框中增加**图片上传**与**文本文件上传**入口，让模型可直接识别内容并基于附件回答。
- 走现有 `/api/chat` 管线（OpenAI 兼容多模态 messages），**不暴露 key**。
- 附件默认不落库、不持久化（仅本次请求传给模型）。

### Non‑Goals
- 不支持 PDF/DOCX 等解析（留到后续）。
- 不做 streaming。
- 不把附件存到 Supabase Storage（管理面板的媒体上传见 005c）。

---

## 2. Supported Types & Limits

### 2.1 图片
- `image/jpeg`
- `image/png`
- `image/webp`

### 2.2 文本文件（会被读成纯文本送入 prompt）
- `text/plain` (`.txt`)
- `text/markdown` (`.md`)
- `application/json` (`.json`)

### 2.3 大小限制
考虑 Vercel body limit 与模型 token：
- 单个附件 ≤ 2MB
- 单次消息附件总大小 ≤ 4MB
- 文本文件读取后截断到 **最多 8k 字符**，超出部分丢弃并提示“已截断”。

前端先做校验；后端再做兜底校验。

---

## 3. Frontend Changes

### 3.1 UI 增强（ChatWidget）
在 `components/ChatWidget.tsx` 输入框区域新增：
- 一个“📎 附件”按钮（或 icon），触发隐藏 `<input type="file" multiple>`。
- `accept`：
  - 图片：`image/jpeg,image/png,image/webp`
  - 文本：`.txt,.md,.json,text/plain,text/markdown,application/json`
- 选中文件后在输入框上方显示**附件 chip 列表**：
  - 显示文件名、类型（图片/文本）、大小
  - 每个 chip 有“移除”按钮
  - 对图片可显示 48px 缩略图预览

### 3.2 前端读取与序列化
在发送消息前，将附件读入内存并序列化到 request body：

**图片附件**
- `FileReader.readAsDataURL(file)` 获取 dataURL
- 去掉前缀 `data:<mime>;base64,`，仅保留 base64
- 生成：
  ```ts
  {
    kind: 'image',
    filename: file.name,
    contentType: file.type,
    base64: '<...>'
  }
  ```

**文本附件**
- `await file.text()` 读取字符串
- 截断到 8k 字符
- 生成：
  ```ts
  {
    kind: 'text',
    filename: file.name,
    contentType: file.type || 'text/plain',
    text: '<content>'
  }
  ```

### 3.3 调用链
`generateChronicleResponse` 扩展一个可选参数 `attachments`：
```ts
generateChronicleResponse(userMessage, context, history, attachments?)
```

`services/geminiService.ts` 发送到 `/api/chat` 的 body 增加 `attachments` 字段：
```json
{ "message": "...", "context": "...", "history": [...], "attachments": [...] }
```

`ChatWidget` 发送时把当前 message 的 recent history（最多 6 条）与 attachments 传入。

### 3.4 本地展示（可选但推荐）
用户发送的消息气泡中：
- 若有图片附件，显示缩略图栈（点击可放大）。
- 若有文本附件，显示一行“已附加：filename”。

不需要让 `ChatMessage` 在全局支持复杂多模态，只要 ChatWidget 内部渲染即可。

---

## 4. Backend Changes (`/api/chat`)

### 4.1 Request 扩展
`api/chat.ts` 解析 body 增加：
```ts
attachments?: Array<
  | { kind:'image'; filename:string; contentType:string; base64:string }
  | { kind:'text'; filename:string; contentType:string; text:string }
>;
```

### 4.2 组装 OpenAI 多模态 messages
保持 system + history 不变，最后一条 user message 改为**多 part**：

- 先加入文本 part（用户原始输入 + 文本附件拼接）：
  ```ts
  const textParts: string[] = [message];
  for text attachment:
    textParts.push(`\n\n【附件：${filename}】\n${text}`);
  ```
  然后：
  ```json
  { "type":"text", "text": "<joinedText>" }
  ```

- 对每个图片附件追加一个 `image_url` part：
  ```json
  {
    "type":"image_url",
    "image_url": { "url": "data:<contentType>;base64,<base64>" }
  }
  ```

最终 user message 结构：
```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "..." },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
  ]
}
```

### 4.3 校验与兜底
- 只允许 2.1/2.2 的类型；否则忽略并在返回 text 中附加提示。
- 若附件过大（单个或总量超限）：
  - 返回 `400` + `{ text: '附件过大，请压缩或减少数量后再试。' }`
- 不打印 base64 到日志。

---

## 5. Acceptance Criteria
- ChatWidget 输入区可选择并移除多附件。
- 图片/文本文件能随消息一起发送，模型可基于附件内容回应。
- 普通文本聊天无回归；无 key 泄漏。
- 超大附件有清晰中文提示，不导致页面卡死/崩溃。


import type { VercelRequest, VercelResponse } from '@vercel/node';

const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL;

type HistoryMessage = { role: 'user' | 'assistant'; content: string };

type ChatAttachment =
  | { kind: 'image'; filename: string; contentType: string; base64: string }
  | { kind: 'text'; filename: string; contentType: string; text: string };

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 8000;

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'application/json']);

const parseBody = (req: VercelRequest): any => {
  const raw = req.body;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
};

const normalizeHistory = (history: unknown): HistoryMessage[] => {
  if (!Array.isArray(history)) return [];
  return history
    .filter((h) => h && typeof h === 'object')
    .map((h: any): HistoryMessage => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: String(h.content ?? ''),
    }))
    .filter((h) => h.content.length > 0)
    .slice(-6);
};

const sanitizeBase64 = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.startsWith('data:')) {
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex >= 0) return trimmed.slice(commaIndex + 1).trim();
  }
  const marker = 'base64,';
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex >= 0) return trimmed.slice(markerIndex + marker.length).trim();
  return trimmed;
};

const estimateBase64Bytes = (base64: string): number => {
  const cleaned = base64.replace(/\s+/g, '').replace(/=+$/, '');
  return Math.floor((cleaned.length * 3) / 4);
};

const normalizeAttachments = (
  raw: unknown
): { images: ChatAttachment[]; texts: ChatAttachment[]; warnings: string[]; totalBytes: number } => {
  const warnings: string[] = [];
  const images: ChatAttachment[] = [];
  const texts: ChatAttachment[] = [];
  let totalBytes = 0;

  if (!Array.isArray(raw)) return { images, texts, warnings, totalBytes };

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const kind = (item as any).kind;
    const filename = String((item as any).filename ?? '').trim();
    const contentType = String((item as any).contentType ?? '').toLowerCase().trim();

    if (kind === 'image') {
      if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
        warnings.push(`已忽略不支持的图片类型：${filename || '未命名文件'}`);
        continue;
      }
      const base64Raw = String((item as any).base64 ?? '');
      const base64 = sanitizeBase64(base64Raw);
      const bytes = estimateBase64Bytes(base64);
      if (bytes <= 0) {
        warnings.push(`图片附件为空：${filename || '未命名文件'}`);
        continue;
      }
      if (bytes > MAX_ATTACHMENT_BYTES || totalBytes + bytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new Error('ATTACHMENTS_TOO_LARGE');
      }
      images.push({ kind: 'image', filename, contentType, base64 });
      totalBytes += bytes;
      continue;
    }

    if (kind === 'text') {
      if (!ALLOWED_TEXT_TYPES.has(contentType)) {
        warnings.push(`已忽略不支持的文本类型：${filename || '未命名文件'}`);
        continue;
      }
      const rawText = String((item as any).text ?? '');
      const text = rawText.slice(0, MAX_TEXT_CHARS);
      const bytes = Buffer.byteLength(text, 'utf8');
      if (bytes <= 0) {
        warnings.push(`文本附件为空：${filename || '未命名文件'}`);
        continue;
      }
      if (bytes > MAX_ATTACHMENT_BYTES || totalBytes + bytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new Error('ATTACHMENTS_TOO_LARGE');
      }
      texts.push({ kind: 'text', filename, contentType, text });
      totalBytes += bytes;
      continue;
    }

    warnings.push(`已忽略未知附件：${filename || '未命名文件'}`);
  }

  return { images, texts, warnings, totalBytes };
};

const resolveChatUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/v1/chat/completions')) return trimmed;
  if (trimmed.endsWith('/v1/chat')) return `${trimmed}/completions`;
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ text: '仅支持 POST 请求' });
    return;
  }

  if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) {
    res.status(500).json({ text: '后端未配置 LLM 环境变量' });
    return;
  }

  const { message, context, history, attachments } = parseBody(req);

  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (typeof message !== 'string' || (message.trim().length === 0 && !hasAttachments)) {
    res.status(400).json({ text: '缺少 message' });
    return;
  }

  let normalizedMessage = message;
  if (normalizedMessage.trim().length === 0 && hasAttachments) {
    normalizedMessage = '请阅读附件并回答。';
  }

  const systemPrompt = `
你是「编年史守护者」，一位栖居在奇幻大陆地图中的古老智能。
口吻睿智、略带史诗感，但保持友好与简洁。

当前选中地点信息（如有）：${context ?? '无'}。

回答要求：
- 80 字以内，中文输出。
- 若被问及地点/角色，结合已知信息进行沉浸式扩写，但不要胡编完全违背设定的事实。
- 如果用户想继续探索，引导其查看地图或英雄群像。
`.trim();

  let normalized = { images: [] as ChatAttachment[], texts: [] as ChatAttachment[], warnings: [] as string[] };
  try {
    normalized = normalizeAttachments(attachments);
  } catch (err: any) {
    if (err?.message === 'ATTACHMENTS_TOO_LARGE') {
      res.status(400).json({ text: '附件过大，请压缩或减少数量后再试。' });
      return;
    }
    res.status(400).json({ text: '附件格式不正确，请检查后重试。' });
    return;
  }

  const textParts: string[] = [normalizedMessage];
  for (const att of normalized.texts) {
    textParts.push(`\n\n【附件：${att.filename || '未命名文件'}】\n${(att as any).text ?? ''}`);
  }

  const userContentParts: any[] = [{ type: 'text', text: textParts.join('') }];
  for (const att of normalized.images) {
    userContentParts.push({
      type: 'image_url',
      image_url: { url: `data:${att.contentType};base64,${(att as any).base64 ?? ''}` },
    });
  }

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...normalizeHistory(history),
    { role: 'user', content: userContentParts },
  ];

  const url = resolveChatUrl(LLM_BASE_URL);

  try {
    const llmRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 180,
        stream: false,
      }),
    });

    if (!llmRes.ok) {
      console.error('[chat] provider error', llmRes.status);
      res.status(500).json({ text: '档案馆暂时无法回应，请稍后再试。' });
      return;
    }

    const data: any = await llmRes.json();
    const text = data?.choices?.[0]?.message?.content?.trim();

    const warningSuffix =
      normalized.warnings.length > 0 ? `\n\n（提示：${normalized.warnings.join('；')}）` : '';

    res
      .status(200)
      .json({ text: (text || '档案馆暂时无法回应，请稍后再试。') + warningSuffix });
  } catch (error) {
    console.error('[chat] request failed', error);
    res.status(500).json({ text: '档案馆暂时无法回应，请稍后再试。' });
  }
}

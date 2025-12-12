import type { VercelRequest, VercelResponse } from '@vercel/node';

const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL;

type HistoryMessage = { role: 'user' | 'assistant'; content: string };

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
    .map((h: any) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: String(h.content ?? ''),
    }))
    .filter((h) => h.content.length > 0)
    .slice(-6);
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

  const { message, context, history } = parseBody(req);

  if (!message || typeof message !== 'string') {
    res.status(400).json({ text: '缺少 message' });
    return;
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

  const messages = [
    { role: 'system', content: systemPrompt },
    ...normalizeHistory(history),
    { role: 'user', content: message },
  ];

  const url = `${LLM_BASE_URL.replace(/\\/$/, '')}/v1/chat/completions`;

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
      const errText = await llmRes.text().catch(() => '');
      console.error('[chat] provider error', llmRes.status, errText.slice(0, 200));
      res.status(500).json({ text: '档案馆暂时无法回应，请稍后再试。' });
      return;
    }

    const data: any = await llmRes.json();
    const text = data?.choices?.[0]?.message?.content?.trim();

    res.status(200).json({ text: text || '档案馆暂时无法回应，请稍后再试。' });
  } catch (error) {
    console.error('[chat] request failed', error);
    res.status(500).json({ text: '档案馆暂时无法回应，请稍后再试。' });
  }
}


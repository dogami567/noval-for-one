import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

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

type CharacterMatchRow = { id: string; name: string; aliases: string[] | null };
type PlaceMatchRow = { id: string; name: string };

type CharacterDetailRow = {
  id: string;
  name: string;
  title: string | null;
  faction: string | null;
  description: string | null;
  lore: string | null;
  bio: string | null;
  aliases: string[] | null;
};

type PlaceDetailRow = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  lore_md: string | null;
};

type StoryListRow = { id: string; title: string; excerpt: string | null };

const MAX_CONTEXT_PACK_CHARS = 2400;
const MAX_CONTEXT_SOURCE_CHARS = 1200;
const MAX_MATCHED_CHARACTERS = 4;
const MAX_MATCHED_PLACES = 4;
const MAX_RELATED_STORIES = 6;

const CANDIDATE_CACHE_TTL_MS = 2 * 60 * 1000;
let candidateCache:
  | { expiresAt: number; characters: CharacterMatchRow[]; places: PlaceMatchRow[] }
  | null = null;

const compactText = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const clipText = (value: unknown, maxChars: number): string => {
  const text = compactText(value);
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
};

const truncatePreserveNewlines = (value: unknown, maxChars: number): string => {
  const text = String(value ?? '');
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
};

const normalizeForMatch = (value: string): string => value.toLowerCase();

const scoreNeedlesInText = (needles: Array<string | null | undefined>, haystack: string): number => {
  let best = 0;
  for (const raw of needles) {
    const needle = compactText(raw);
    if (needle.length < 2) continue;
    if (haystack.includes(normalizeForMatch(needle))) best = Math.max(best, needle.length);
  }
  return best;
};

const getContextCandidates = async (): Promise<{
  characters: CharacterMatchRow[];
  places: PlaceMatchRow[];
}> => {
  if (!supabaseAdmin) return { characters: [], places: [] };

  const now = Date.now();
  if (candidateCache && candidateCache.expiresAt > now) {
    return { characters: candidateCache.characters, places: candidateCache.places };
  }

  const [{ data: characters, error: characterError }, { data: places, error: placeError }] =
    await Promise.all([
      supabaseAdmin.from('characters').select('id,name,aliases').limit(500),
      supabaseAdmin.from('places').select('id,name').limit(800),
    ]);

  if (characterError) throw characterError;
  if (placeError) throw placeError;

  const normalizedCharacters = (characters as CharacterMatchRow[]) ?? [];
  const normalizedPlaces = (places as PlaceMatchRow[]) ?? [];

  candidateCache = {
    expiresAt: now + CANDIDATE_CACHE_TTL_MS,
    characters: normalizedCharacters,
    places: normalizedPlaces,
  };

  return { characters: normalizedCharacters, places: normalizedPlaces };
};

const buildContextPack = async (rawUserText: string): Promise<string> => {
  if (!supabaseAdmin) return '';

  const haystack = normalizeForMatch(compactText(rawUserText));
  if (haystack.length === 0) return '';

  try {
    const { characters: characterCandidates, places: placeCandidates } = await getContextCandidates();

    const matchedCharacterIds = ((characterCandidates as CharacterMatchRow[]) ?? [])
      .map((row) => ({
        id: String(row.id),
        score: scoreNeedlesInText([row.name, ...(row.aliases ?? [])], haystack),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MATCHED_CHARACTERS)
      .map((row) => row.id);

    const matchedPlaceIds = ((placeCandidates as PlaceMatchRow[]) ?? [])
      .map((row) => ({
        id: String(row.id),
        score: scoreNeedlesInText([row.name], haystack),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MATCHED_PLACES)
      .map((row) => row.id);

    if (matchedCharacterIds.length === 0 && matchedPlaceIds.length === 0) return '';

    const [characterDetailsRes, placeDetailsRes] = await Promise.all([
      matchedCharacterIds.length > 0
        ? supabaseAdmin
            .from('characters')
            .select('id,name,title,faction,description,lore,bio,aliases')
            .in('id', matchedCharacterIds)
        : Promise.resolve({ data: [] as unknown[], error: null as any }),
      matchedPlaceIds.length > 0
        ? supabaseAdmin
            .from('places')
            .select('id,name,kind,description,lore_md')
            .in('id', matchedPlaceIds)
        : Promise.resolve({ data: [] as unknown[], error: null as any }),
    ]);

    if (characterDetailsRes.error) throw characterDetailsRes.error;
    if (placeDetailsRes.error) throw placeDetailsRes.error;

    const characterDetails = ((characterDetailsRes.data as CharacterDetailRow[]) ?? []).sort(
      (a, b) => matchedCharacterIds.indexOf(a.id) - matchedCharacterIds.indexOf(b.id)
    );
    const placeDetails = ((placeDetailsRes.data as PlaceDetailRow[]) ?? []).sort(
      (a, b) => matchedPlaceIds.indexOf(a.id) - matchedPlaceIds.indexOf(b.id)
    );

    const storyIdSet = new Set<string>();

    if (matchedCharacterIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('story_characters')
        .select('story_id')
        .in('character_id', matchedCharacterIds)
        .limit(200);
      if (error) throw error;
      for (const row of (data as Array<{ story_id: string }>) ?? []) {
        if (row?.story_id) storyIdSet.add(String(row.story_id));
      }
    }

    if (matchedPlaceIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('story_places')
        .select('story_id')
        .in('place_id', matchedPlaceIds)
        .limit(200);
      if (error) throw error;
      for (const row of (data as Array<{ story_id: string }>) ?? []) {
        if (row?.story_id) storyIdSet.add(String(row.story_id));
      }
    }

    const storyIds = Array.from(storyIdSet).slice(0, 50);
    let storyRows: StoryListRow[] = [];
    if (storyIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('stories')
        .select('id,title,excerpt')
        .in('id', storyIds)
        .order('created_at', { ascending: false })
        .limit(MAX_RELATED_STORIES);
      if (error) throw error;
      storyRows = ((data as StoryListRow[]) ?? []).map((row) => ({
        id: String((row as any).id),
        title: String((row as any).title ?? ''),
        excerpt: (row as any).excerpt ?? null,
      }));
    }

    const lines: string[] = [];

    if (characterDetails.length > 0) {
      lines.push('【角色】');
      for (const c of characterDetails) {
        const meta: string[] = [];
        const title = compactText(c.title);
        if (title) meta.push(title);
        const faction = compactText(c.faction);
        if (faction) meta.push(faction);

        lines.push(`- ${compactText(c.name)}${meta.length > 0 ? `（${meta.join(' · ')}）` : ''}`);

        const aliases = (c.aliases ?? []).map(compactText).filter(Boolean);
        if (aliases.length > 0) lines.push(`  别名：${clipText(aliases.join('、'), 120)}`);

        const desc = clipText(c.description, 220);
        if (desc) lines.push(`  简介：${desc}`);

        const lore = clipText(c.lore, 600);
        if (lore) lines.push(`  设定：${lore}`);

        const bio = clipText(c.bio, 400);
        if (bio) lines.push(`  Bio：${bio}`);
      }
    }

    if (placeDetails.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('【地点】');
      for (const p of placeDetails) {
        lines.push(`- ${compactText(p.name)}（${compactText(p.kind)}）`);

        const desc = clipText(p.description, 220);
        if (desc) lines.push(`  简介：${desc}`);

        const lore = clipText(p.lore_md, 600);
        if (lore) lines.push(`  设定：${lore}`);
      }
    }

    if (storyRows.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('【相关短篇（仅摘要）】');
      for (const s of storyRows) {
        const excerpt = clipText(s.excerpt, 220);
        lines.push(`- ${clipText(s.title, 80)}：${excerpt || '（无摘要）'}`);
      }
    }

    return truncatePreserveNewlines(lines.join('\n'), MAX_CONTEXT_PACK_CHARS);
  } catch (error: any) {
    console.error('[chat] context pack error', error?.message ?? 'unknown');
    return '';
  }
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

  const safeContext = clipText(typeof context === 'string' ? context : '', MAX_CONTEXT_SOURCE_CHARS);
  const contextPack = await buildContextPack(textParts.join('\n'));

  const systemPrompt = `
你是「编年史守护者」，一位栖居在奇幻大陆地图中的古老智能。
口吻睿智、略带史诗感，但保持友好与简洁。

当前选中地点信息（如有）：${safeContext || '无'}。

${contextPack ? `可引用设定资料（来自数据库，可能不完整）：\n${contextPack}\n` : ''}

回答要求：
- 80 字以内，中文输出。
- 若被问及地点/角色，结合已知信息进行沉浸式扩写，但不要胡编完全违背设定的事实。
- 如果用户想继续探索，引导其查看地图或英雄群像。
`.trim();

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

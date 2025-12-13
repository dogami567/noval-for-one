import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminTokenSecret = process.env.ADMIN_EDIT_TOKEN;

const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

const isAdminRequest = (req: VercelRequest): boolean => {
  const token = req.headers['x-admin-token'];
  if (!adminTokenSecret) return false;
  if (typeof token === 'string') return token === adminTokenSecret;
  if (Array.isArray(token)) return token[0] === adminTokenSecret;
  return false;
};

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

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: '仅支持 POST 请求' });
    return;
  }

  if (!isAdminRequest(req)) {
    res.status(401).json({ message: '无效的管理员口令' });
    return;
  }

  if (!supabaseAdmin) {
    res.status(500).json({ message: '后端未配置 Supabase 环境变量' });
    return;
  }

  const { entity, id, filename, contentType, base64 } = parseBody(req);

  if (!entity || !id || !filename || !contentType || !base64) {
    res.status(400).json({ message: '参数缺失' });
    return;
  }

  const objectId = String(id).trim();
  if (!UUID_REGEX.test(objectId)) {
    res.status(400).json({ message: 'id 必须是 uuid' });
    return;
  }
  if (objectId.includes('/') || objectId.includes('\\')) {
    res.status(400).json({ message: 'id 不合法' });
    return;
  }

  if (entity !== 'location' && entity !== 'character' && entity !== 'place' && entity !== 'story') {
    res.status(400).json({ message: '不支持的实体类型' });
    return;
  }

  const ext = CONTENT_TYPE_TO_EXT[String(contentType).toLowerCase()];
  if (!ext) {
    res.status(400).json({ message: '不支持的图片类型（仅 jpg/png/webp）' });
    return;
  }

  const bucket =
    entity === 'location'
      ? 'locations'
      : entity === 'character'
        ? 'characters'
        : entity === 'place'
          ? 'places'
          : 'stories';

  const fileName =
    entity === 'character' ? `portrait.${ext}` : `cover.${ext}`;
  const path = `${objectId}/${fileName}`;

  try {
    const buffer = Buffer.from(String(base64), 'base64');
    if (buffer.length <= 0) {
      res.status(400).json({ message: '图片内容为空' });
      return;
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
      res.status(400).json({ message: '图片过大（> 2MB），请压缩后再上传' });
      return;
    }
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, buffer, {
        upsert: true,
        contentType: String(contentType),
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
    res.status(200).json({ publicUrl: data.publicUrl });
  } catch (error: any) {
    console.error('[admin/upload] failed', error?.message ?? error);
    res.status(500).json({ message: '图片上传失败，请稍后再试' });
  }
}

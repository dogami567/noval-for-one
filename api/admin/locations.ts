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

const getBody = (req: VercelRequest) => {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAdminRequest(req)) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  if (!supabaseAdmin) {
    res.status(500).json({ message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
    return;
  }

  try {
    switch (req.method) {
      case 'GET': {
        const { data, error } = await supabaseAdmin
          .from('locations')
          .select('*')
          .order('created_at', { ascending: true });
        if (error) throw error;
        res.status(200).json({ data });
        return;
      }
      case 'POST': {
        const payload = getBody(req);
        const { data, error } = await supabaseAdmin
          .from('locations')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        res.status(200).json({ data });
        return;
      }
      case 'PATCH': {
        const id = req.query.id;
        if (!id || Array.isArray(id)) {
          res.status(400).json({ message: 'Missing id' });
          return;
        }
        const payload = getBody(req);
        const { data, error } = await supabaseAdmin
          .from('locations')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        res.status(200).json({ data });
        return;
      }
      case 'DELETE': {
        const id = req.query.id;
        if (!id || Array.isArray(id)) {
          res.status(400).json({ message: 'Missing id' });
          return;
        }
        const { data, error } = await supabaseAdmin
          .from('locations')
          .delete()
          .eq('id', id)
          .select()
          .maybeSingle();
        if (error) throw error;
        res.status(200).json({ data: data ?? null });
        return;
      }
      default: {
        res.status(405).json({ message: 'Method not allowed' });
        return;
      }
    }
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Unknown error' });
  }
}


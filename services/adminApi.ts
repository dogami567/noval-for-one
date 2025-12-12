type AdminRow = Record<string, unknown>;

export interface AdminUploadPayload {
  entity: 'location' | 'character';
  id: string;
  filename: string;
  contentType: string;
  base64: string;
}

const getAdminToken = (): string => {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('adminEditToken') ?? '';
};

const adminFetch = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<T> => {
  const headers = new Headers(options.headers);
  headers.set('x-admin-token', getAdminToken());
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || res.statusText);
  }
  return json.data as T;
};

export const adminListLocations = () => adminFetch<AdminRow[]>('/api/admin/locations');
export const adminCreateLocation = (payload: AdminRow) =>
  adminFetch<AdminRow>('/api/admin/locations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
export const adminUpdateLocation = (id: string, payload: AdminRow) =>
  adminFetch<AdminRow>(`/api/admin/locations?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
export const adminDeleteLocation = (id: string) =>
  adminFetch<AdminRow | null>(`/api/admin/locations?id=${id}`, {
    method: 'DELETE',
  });

export const adminListCharacters = () => adminFetch<AdminRow[]>('/api/admin/characters');
export const adminCreateCharacter = (payload: AdminRow) =>
  adminFetch<AdminRow>('/api/admin/characters', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
export const adminUpdateCharacter = (id: string, payload: AdminRow) =>
  adminFetch<AdminRow>(`/api/admin/characters?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
export const adminDeleteCharacter = (id: string) =>
  adminFetch<AdminRow | null>(`/api/admin/characters?id=${id}`, {
    method: 'DELETE',
  });

export const adminListTimelineEvents = () =>
  adminFetch<AdminRow[]>('/api/admin/timeline-events');
export const adminCreateTimelineEvent = (payload: AdminRow) =>
  adminFetch<AdminRow>('/api/admin/timeline-events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
export const adminUpdateTimelineEvent = (id: string, payload: AdminRow) =>
  adminFetch<AdminRow>(`/api/admin/timeline-events?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
export const adminDeleteTimelineEvent = (id: string) =>
  adminFetch<AdminRow | null>(`/api/admin/timeline-events?id=${id}`, {
    method: 'DELETE',
  });

export const adminUploadImage = async (payload: AdminUploadPayload): Promise<string> => {
  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': getAdminToken(),
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || res.statusText);
  }

  return String(json.publicUrl || '');
};

// 回家作業照片：設定了 Supabase（SUPABASE_URL＋SUPABASE_SECRET_KEY）就存到 Supabase Storage 的私人 bucket，
// 沒設定時存在 Durable Object（和課堂作答照片一樣）。照片只經過 Worker 讀寫，瀏覽器拿不到 Supabase 金鑰。
// 2026-10-30 老師決定：目前不用 Supabase，照片以 Durable Object 為準；下面的 Supabase 實作留作參考。
import type { Vault } from './ai';
import { type StorageEnv, supabaseHeaders, supabaseUrl } from './storage';
import { HttpError } from './validation';

export interface PhotoEnv extends StorageEnv {
  /** Supabase Storage 的 bucket 名稱（要先建立成 private），預設 homework-photos。 */
  HOMEWORK_BUCKET?: string;
}
export interface PhotoStore {
  kind: 'supabase' | 'durable';
  put(key: string, dataUrl: string): Promise<void>;
  /** 回傳 data URL（AI 批改直接送圖）。 */
  get(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
}
export function photoStore(env: PhotoEnv, vault: Vault): PhotoStore {
  if (env.SUPABASE_URL && env.SUPABASE_SECRET_KEY) return supabasePhotos(env);
  return {
    kind: 'durable',
    put: (key, dataUrl) => vault.put(`hwphoto:${key}`, dataUrl),
    get: (key) => vault.get<string>(`hwphoto:${key}`),
    delete: async (key) => void (await vault.delete(`hwphoto:${key}`)),
  };
}
function supabasePhotos(env: PhotoEnv): PhotoStore {
  const bucket = encodeURIComponent(env.HOMEWORK_BUCKET || 'homework-photos');
  const object = (key: string) => `${supabaseUrl(env)}/storage/v1/object/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const headers = (type?: string) => {
    const h = supabaseHeaders(env);
    if (type) h.set('Content-Type', type);
    else h.delete('Content-Type');
    return h;
  };
  return {
    kind: 'supabase',
    async put(key, dataUrl) {
      const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!m) throw new HttpError(400, '只接受 JPEG、PNG 或 WebP 圖片');
      const h = headers(m[1]);
      h.set('x-upsert', 'true');
      const r = await fetch(object(key), { method: 'POST', headers: h, body: base64Bytes(m[2]), signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new HttpError(503, `照片上傳到 Supabase 失敗（${r.status}），請確認 bucket 已建立`);
    },
    async get(key) {
      const r = await fetch(object(key), { headers: headers(), signal: AbortSignal.timeout(20000) });
      if (r.status === 404 || r.status === 400) return undefined;
      if (!r.ok) throw new HttpError(503, `從 Supabase 讀取照片失敗（${r.status}）`);
      const type = r.headers.get('Content-Type') || 'image/jpeg';
      return `data:${type};base64,${bytesBase64(new Uint8Array(await r.arrayBuffer()))}`;
    },
    async delete(key) {
      await fetch(object(key), { method: 'DELETE', headers: headers(), signal: AbortSignal.timeout(20000) }).catch(() => undefined);
    },
  };
}
export function base64Bytes(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function bytesBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

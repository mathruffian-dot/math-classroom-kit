// 照片存放：課堂作答照片與回家作業照片。
// - 有 R2 綁定（PHOTOS）就存到 R2（2026-11-24 老師決定啟用 R2：免費 10 GB、不占 Durable Object 空間）。
// - 沒有 R2、但設定了 Supabase（SUPABASE_URL＋SUPABASE_SECRET_KEY）：回家作業照片存 Supabase Storage（保留給以後用）。
// - 都沒有：存在 Durable Object（vault）。
// 改用 R2 之前存在 Durable Object 的舊照片照樣讀得到、刪得掉（讀不到 R2 時再讀 vault）。照片只經過 Worker 讀寫。
import type { Vault } from './ai';
import { type StorageEnv, supabaseHeaders, supabaseUrl } from './storage';
import { HttpError } from './validation';

/** Cloudflare R2 bucket 綁定（只宣告這裡用到的部分）。 */
export interface R2Like {
  put(key: string, value: Uint8Array<ArrayBuffer>, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
  /** 一次最多 1000 個 key。 */
  delete(keys: string | string[]): Promise<void>;
  list(options: { prefix?: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string; size: number; uploaded: Date }[]; truncated: boolean; cursor?: string }>;
}
export interface PhotoEnv extends StorageEnv {
  /** R2 bucket 綁定（wrangler.jsonc 的 r2_buckets）。 */
  PHOTOS?: R2Like;
  /** Supabase Storage 的 bucket 名稱（要先建立成 private），預設 homework-photos。 */
  HOMEWORK_BUCKET?: string;
}
export type PhotoKind = 'r2' | 'supabase' | 'durable';
export interface PhotoStore {
  kind: PhotoKind;
  put(key: string, dataUrl: string): Promise<void>;
  /** 回傳 data URL（AI 批改直接送圖）。 */
  get(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
  /** 一次刪很多張（R2 每次最多 1000 個 key，少發子請求）。 */
  deleteMany(keys: string[]): Promise<void>;
}
/** 照片存在哪裡（設定頁顯示）。 */
export function photoKind(env: PhotoEnv): PhotoKind {
  return env.PHOTOS ? 'r2' : env.SUPABASE_URL && env.SUPABASE_SECRET_KEY ? 'supabase' : 'durable';
}
/** R2 物件名稱的開頭：每一套站（APP_INSTANCE）各用自己的資料夾，共用 bucket 時清理不會刪到別套站的照片。 */
export function r2Prefix(env: PhotoEnv) {
  // encodeURIComponent 一對一（不同站名不會變成同一個資料夾，例如 class.a 與 class_a），也把 / 編掉
  return `${encodeURIComponent(env.APP_INSTANCE || 'default')}/`;
}
/** 回家作業照片（key：作業 ID/座號/照片 ID）。 */
export function photoStore(env: PhotoEnv, vault: Vault): PhotoStore {
  const durable = vaultPhotos(vault, (key) => `hwphoto:${key}`);
  if (env.PHOTOS) return withFallback(r2Photos(env.PHOTOS, (key) => `${r2Prefix(env)}homework/${key}`), durable);
  if (env.SUPABASE_URL && env.SUPABASE_SECRET_KEY) return supabasePhotos(env);
  return durable;
}
/** 課堂作答照片（key：照片 ID）。 */
export function answerPhotos(env: PhotoEnv, vault: Vault): PhotoStore {
  const durable = vaultPhotos(vault, (id) => `blob:${id}`);
  return env.PHOTOS ? withFallback(r2Photos(env.PHOTOS, (id) => `${r2Prefix(env)}answers/${id}`), durable) : durable;
}
/**
 * 待檢查的照片（存在 vault 的 photo-check）：每張照片在「存進去之前」與「紀錄拿掉它之前」先記一筆。
 * 清理時只刪「放超過寬限時間、而且已經沒有任何紀錄指到」的，所以不管哪一步失敗（照片存好了紀錄沒寫進去、
 * 紀錄拿掉了照片沒刪掉、只刪掉 R2 沒刪掉 Durable Object 的舊照片）都會在清理時收尾，也不會刪到還在用的照片。
 * 名稱：`a:<照片 ID>`（課堂作答照片）、`h:<作業 ID>/<座號>/<照片 ID>`（回家作業照片）。
 */
export const PHOTO_CHECK = 'photo-check';
/**
 * 每一筆是自己的 key（`pc:<名稱>` → 記下的時間），不是一個越長越大的物件：故障再久也不會碰到單筆大小上限，
 * 清理一次處理一批（`PHOTO_CHECK_PREFIX` 依名稱列出）。舊版的 `photo-check` 物件在清理時搬過來。
 * 每次記都更新時間（同一張照片重寫，寬限時間從這次重算）。
 */
export const PHOTO_CHECK_PREFIX = 'pc:';
export async function notePhotos(vault: Vault, refs: string[]) {
  const now = Date.now();
  for (const r of new Set(refs)) await vault.put(PHOTO_CHECK_PREFIX + r, now);
}
/** 已確定的照片（存好且紀錄寫進去了、或已經刪掉）：從待檢查清單拿掉。失敗沒關係，清理時會再確認。 */
export async function settlePhotos(vault: Vault, refs: string[]) {
  try {
    for (const r of new Set(refs)) await vault.delete(PHOTO_CHECK_PREFIX + r);
  } catch {
    /* 留在清單，清理時再看 */
  }
}
function vaultPhotos(vault: Vault, name: (key: string) => string): PhotoStore {
  const del = async (key: string) => void (await vault.delete(name(key)));
  return {
    kind: 'durable',
    put: async (key, dataUrl) => {
      parseDataUrl(dataUrl);
      await vault.put(name(key), dataUrl);
    },
    get: (key) => vault.get<string>(name(key)),
    delete: del,
    async deleteMany(keys) {
      for (const k of keys) await del(k);
    },
  };
}
/** 新照片寫到 R2；讀不到時讀舊的 Durable Object；刪除兩邊都刪。 */
function withFallback(primary: PhotoStore, old: PhotoStore): PhotoStore {
  return {
    kind: primary.kind,
    put: (key, dataUrl) => primary.put(key, dataUrl),
    get: async (key) => (await primary.get(key)) ?? (await old.get(key)),
    async delete(key) {
      await primary.delete(key);
      await old.delete(key);
    },
    async deleteMany(keys) {
      await primary.deleteMany(keys);
      await old.deleteMany(keys);
    },
  };
}
/** 檢查照片的格式與 base64（壞的回 400）；存之前、記待檢查清單之前先呼叫。 */
export function parseDataUrl(dataUrl: string) {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new HttpError(400, '只接受 JPEG、PNG 或 WebP 圖片');
  // 解不開的 base64 是照片本身的問題（400），不是儲存服務故障（503）
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64Bytes(m[2]);
  } catch {
    throw new HttpError(400, '照片資料損壞，請重新拍照或選照片');
  }
  return { type: m[1], bytes };
}
function r2Photos(bucket: R2Like, name: (key: string) => string): PhotoStore {
  return {
    kind: 'r2',
    async put(key, dataUrl) {
      const { type, bytes } = parseDataUrl(dataUrl);
      try {
        await bucket.put(name(key), bytes, { httpMetadata: { contentType: type } });
      } catch {
        throw new HttpError(503, '照片存到 R2 失敗，請稍後再試');
      }
    },
    async get(key) {
      const obj = await bucket.get(name(key));
      if (!obj) return undefined;
      return `data:${obj.httpMetadata?.contentType || 'image/jpeg'};base64,${bytesBase64(new Uint8Array(await obj.arrayBuffer()))}`;
    },
    delete: (key) => bucket.delete(name(key)),
    async deleteMany(keys) {
      for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000).map(name));
    },
  };
}
/**
 * R2 清理：列出 answers/、homework/ 底下的照片，刪掉沒有任何紀錄指到、而且放超過 graceMs 的
 * （刪除中途失敗、照片存好了但紀錄沒寫進去，都會留下這種照片）。順便算出 R2 實際用了多少。
 */
export async function sweepR2(bucket: R2Like, prefix0: string, referenced: (key: string) => boolean, graceMs = 3600_000, now = Date.now()) {
  let objects = 0,
    bytes = 0;
  const orphans: string[] = [];
  for (const prefix of [`${prefix0}answers/`, `${prefix0}homework/`]) {
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix, cursor, limit: 1000 });
      for (const o of page.objects) {
        if (!referenced(o.key) && now - new Date(o.uploaded).getTime() > graceMs) orphans.push(o.key);
        else {
          objects++;
          bytes += o.size;
        }
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  for (let i = 0; i < orphans.length; i += 1000) await bucket.delete(orphans.slice(i, i + 1000));
  return { objects, bytes, removed: orphans.length };
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
      const { type, bytes } = parseDataUrl(dataUrl);
      const h = headers(type);
      h.set('x-upsert', 'true');
      const r = await fetch(object(key), { method: 'POST', headers: h, body: bytes, signal: AbortSignal.timeout(20000) });
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
    async deleteMany(keys) {
      for (const k of keys) await fetch(object(k), { method: 'DELETE', headers: headers(), signal: AbortSignal.timeout(20000) }).catch(() => undefined);
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
/** base64 解碼後的位元組數（扣掉結尾的補位 =）。 */
export function decodedBytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}
/** 照片內容的指紋（同一張照片重傳不會變成兩張）。 */
export async function photoHash(dataUrl: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl)));
  return [...d.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

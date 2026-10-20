import { HttpError, assert } from './validation';

export interface StorageEnv {
  APP_MODE?: string;
  APP_INSTANCE?: string;
  ALLOW_PUBLIC_DEMO?: string;
  SESSION_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  TEACHER_EMAILS?: string;
  TEACHER_ACCOUNT?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  AI_API_KEY?: string;
  AI_DAILY_LIMIT?: string;
  /** 手寫辨識每日上限（全站），預設 3000 次。 */
  OCR_DAILY_LIMIT?: string;
}
export interface StorageTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
}
export interface LocalStorage extends StorageTransaction {
  transaction<T>(operation: (transaction: StorageTransaction) => Promise<T>): Promise<T>;
}
export interface Store<T> {
  read(): Promise<T | undefined>;
  write(value: T): Promise<void>;
}
export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
export const MAX_RESTORE_BYTES = 9 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;
function encodeSnapshot(value: unknown, maxBytes = MAX_SNAPSHOT_BYTES): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  assert(bytes.byteLength <= maxBytes, '資料已達 8 MiB 上限，請先備份並刪除舊課堂紀錄', 413);
  return bytes;
}
export function supabaseUrl(env: StorageEnv): string {
  assert(env.SUPABASE_URL, '尚未設定 SUPABASE_URL', 503);
  const u = new URL(env.SUPABASE_URL);
  assert(
    u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash,
    'SUPABASE_URL 需要 HTTPS',
    503,
  );
  return u.origin;
}
export function supabaseHeaders(env: StorageEnv): Headers {
  assert(env.SUPABASE_SECRET_KEY, '尚未設定 SUPABASE_SECRET_KEY', 503);
  const headers = new Headers({
    apikey: env.SUPABASE_SECRET_KEY,
    'Content-Type': 'application/json',
  });
  // New sb_secret_ keys belong in apikey, never in the Bearer JWT field.
  if (!env.SUPABASE_SECRET_KEY.startsWith('sb_secret_'))
    headers.set('Authorization', `Bearer ${env.SUPABASE_SECRET_KEY}`);
  return headers;
}
export class SupabaseStore<T> implements Store<T> {
  private revision = 0;
  constructor(private env: StorageEnv) {}
  async read(): Promise<T | undefined> {
    const id = encodeURIComponent(this.env.APP_INSTANCE || 'default');
    const response = await fetch(
      `${supabaseUrl(this.env)}/rest/v1/classroom_state?id=eq.${id}&select=revision,payload`,
      { headers: supabaseHeaders(this.env), signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) throw new HttpError(503, 'Supabase 資料讀取失敗，請檢查設定及資料庫建置');
    const rows = (await response.json()) as { revision: number; payload: T }[];
    this.revision = rows[0]?.revision ?? 0;
    return rows[0]?.payload;
  }
  async write(value: T): Promise<void> {
    encodeSnapshot(value);
    const response = await fetch(
      `${supabaseUrl(this.env)}/rest/v1/rpc/classroom_compare_and_swap`,
      {
        method: 'POST',
        headers: supabaseHeaders(this.env),
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          p_id: this.env.APP_INSTANCE || 'default',
          p_expected: this.revision,
          p_payload: value,
        }),
      },
    );
    if (!response.ok) throw new HttpError(503, 'Supabase 資料儲存失敗，請稍後重試');
    const revision = await response.json();
    if (!Number.isInteger(revision) || revision <= this.revision)
      throw new HttpError(409, '資料已更新，請重新整理後再試');
    this.revision = revision;
  }
}
export class DurableStore<T> implements Store<T> {
  constructor(
    private storage: LocalStorage,
    private prefix = 'classroom-state',
  ) {}
  async read(): Promise<T | undefined> {
    const manifest = await this.storage.get<{ format: string; chunks: number; bytes: number }>(
      `${this.prefix}:manifest`,
    );
    // Upgrade existing v0.1 local data on its next successful write.
    if (!manifest) return this.storage.get<T>(this.prefix);
    assert(
      manifest.format === 'json-chunks-v1' &&
        Number.isInteger(manifest.chunks) &&
        manifest.chunks > 0 &&
        manifest.chunks <= MAX_SNAPSHOT_BYTES / CHUNK_BYTES &&
        manifest.bytes <= MAX_SNAPSHOT_BYTES,
      '本機資料索引損壞，請使用備份還原',
      503,
    );
    const bytes = new Uint8Array(manifest.bytes);
    for (let i = 0; i < manifest.chunks; i++) {
      const chunk = await this.storage.get<Uint8Array>(`${this.prefix}:chunk:${i}`);
      const expected = Math.min(CHUNK_BYTES, manifest.bytes - i * CHUNK_BYTES);
      assert(
        chunk instanceof Uint8Array && chunk.byteLength === expected,
        '本機資料區塊缺失，請使用備份還原',
        503,
      );
      bytes.set(chunk, i * CHUNK_BYTES);
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  }
  async write(value: T): Promise<void> {
    const bytes = encodeSnapshot(value),
      chunks = Math.ceil(bytes.byteLength / CHUNK_BYTES);
    // SQLite DO values are limited to 2 MB; 64 KiB chunks also remain below the
    // legacy KV 128 KiB value limit. One transaction commits the complete new
    // snapshot and index or leaves the prior snapshot completely unchanged.
    await this.storage.transaction(async (txn) => {
      const previous = await txn.get<{ chunks: number }>(`${this.prefix}:manifest`);
      for (let i = 0; i < chunks; i++)
        await txn.put(
          `${this.prefix}:chunk:${i}`,
          bytes.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES),
        );
      for (let i = chunks; i < (previous?.chunks || 0); i++)
        await txn.delete(`${this.prefix}:chunk:${i}`);
      await txn.put(`${this.prefix}:manifest`, {
        format: 'json-chunks-v1',
        chunks,
        bytes: bytes.byteLength,
      });
      await txn.delete(this.prefix);
    });
  }
}

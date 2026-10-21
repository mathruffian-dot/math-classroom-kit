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
/* ───────────── 課堂紀錄分開存（Durable Object，SQLite） ─────────────
 * 主檔（班級、課程、登入…）一份、每一堂課各一份。每次儲存只寫內容有變的那幾份，
 * 一份通常 1 列（1 MiB 一塊，SQLite 單值上限 2 MB）：學生交一次答案只寫 1–2 列，
 * 不會撞到免費方案每天 10 萬列的寫入上限，也不再受單一檔案 8 MiB 的限制。
 * 已結束一段時間的課堂移到「封存」：不在每次讀取時載入，有人打開時才讀。 */
const PIECE_CHUNK = 1024 * 1024;
type PieceManifest = { format: 'json-chunks-v2'; chunks: number; bytes: number };
async function readPiece<T>(storage: StorageTransaction, key: string): Promise<T | undefined> {
  const m = await storage.get<PieceManifest>(`${key}:m`);
  if (!m) return undefined;
  assert(m.format === 'json-chunks-v2' && Number.isInteger(m.chunks) && m.chunks > 0, '資料索引損壞，請使用備份還原', 503);
  const bytes = new Uint8Array(m.bytes);
  for (let i = 0; i < m.chunks; i++) {
    const chunk = await storage.get<Uint8Array>(`${key}:c:${i}`);
    assert(chunk instanceof Uint8Array && chunk.byteLength === Math.min(PIECE_CHUNK, m.bytes - i * PIECE_CHUNK), '資料區塊缺失，請使用備份還原', 503);
    bytes.set(chunk, i * PIECE_CHUNK);
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
/** 寫一份資料；回傳寫了幾列（給用量統計）。 */
async function writePiece(txn: StorageTransaction, key: string, json: string): Promise<number> {
  const bytes = new TextEncoder().encode(json);
  assert(bytes.byteLength <= MAX_SNAPSHOT_BYTES, '這一堂課的資料超過 8 MiB 上限，請刪除部分白板筆跡或照片', 413);
  const chunks = Math.max(1, Math.ceil(bytes.byteLength / PIECE_CHUNK));
  const previous = await txn.get<PieceManifest>(`${key}:m`);
  for (let i = 0; i < chunks; i++) await txn.put(`${key}:c:${i}`, bytes.slice(i * PIECE_CHUNK, (i + 1) * PIECE_CHUNK));
  for (let i = chunks; i < (previous?.chunks || 0); i++) await txn.delete(`${key}:c:${i}`);
  await txn.put(`${key}:m`, { format: 'json-chunks-v2', chunks, bytes: bytes.byteLength });
  return chunks + 1;
}
async function deletePiece(txn: StorageTransaction, key: string) {
  const m = await txn.get<PieceManifest>(`${key}:m`);
  for (let i = 0; i < (m?.chunks || 0); i++) await txn.delete(`${key}:c:${i}`);
  await txn.delete(`${key}:m`);
}
function pieceDigest(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `${text.length}:${(h >>> 0).toString(36)}`;
}
export interface SplitHooks<S> {
  /** 這一堂課可以封存了嗎（例如結束超過 1 小時）。 */
  archivable(session: S, now: number): boolean;
  /** 封存後留在主檔的摘要（課堂清單用）。 */
  summary(session: S): unknown;
}
export interface StorageUsage {
  /** 主檔＋所有課堂紀錄的大小（位元組）。 */
  dataBytes: number;
  /** 今天（UTC）寫入的列數；免費方案上限每天 100,000 列。 */
  rowsToday: number;
  sessions: number;
}
type SplitState<S> = { sessions: Record<string, S>; archive?: Record<string, unknown> };
export class SessionSplitStore<T extends SplitState<S>, S = unknown> implements Store<T> {
  /** 每一份上次寫入內容的摘要：沒變就不寫。 */
  private written = new Map<string, string>();
  private known = new Set<string>();
  private legacyChecked = false;
  /** 不經過這裡的寫入（照片、登入次數）：下一次儲存時一起記進用量。 */
  private extraRows = 0;
  constructor(
    private storage: LocalStorage,
    private hooks: SplitHooks<S>,
    private legacy = new DurableStore<T>(storage),
  ) {}
  async read(): Promise<T | undefined> {
    const main = await readPiece<T & { hot?: string[] }>(this.storage, 'main');
    if (!main) return this.legacy.read(); // 舊版：全部在一份快照裡，下一次儲存時拆開
    const sessions: Record<string, S> = {};
    for (const id of main.hot || []) {
      const s = await this.loadSession(id);
      if (s) sessions[id] = s;
    }
    this.known = new Set([...(main.hot || []), ...Object.keys(main.archive || {})]);
    this.written.set('main', pieceDigest(JSON.stringify(main)));
    const { hot: _hot, ...rest } = main;
    return { ...rest, sessions } as unknown as T;
  }
  countRows(rows: number) {
    this.extraRows += rows;
  }
  /** 讀一堂封存的課（有人打開、批改、匯出或備份時）。 */
  async loadSession(id: string): Promise<S | undefined> {
    const s = await readPiece<S>(this.storage, `sess:${id}`);
    // 記下讀到的內容：沒被改過就不必再寫回去（Durable Object 醒來後的第一次儲存也一樣）
    if (s) this.written.set(id, pieceDigest(JSON.stringify(s)));
    return s;
  }
  async write(value: T): Promise<void> {
    const now = Date.now(),
      archive = { ...(value.archive || {}) },
      hot: string[] = [],
      puts: [string, string, string][] = [];
    for (const [id, s] of Object.entries(value.sessions)) {
      const json = JSON.stringify(s),
        d = pieceDigest(json);
      if (this.written.get(id) !== d) puts.push([id, json, d]);
      if (this.hooks.archivable(s, now)) archive[id] = this.hooks.summary(s);
      else {
        hot.push(id);
        delete archive[id];
      }
    }
    const keep = new Set([...hot, ...Object.keys(archive)]);
    const removed = [...this.known].filter((id) => !keep.has(id));
    value.archive = archive;
    const mainJson = JSON.stringify({ ...value, sessions: undefined, hot }),
      mainDigest = pieceDigest(mainJson);
    const day = new Date(now).toISOString().slice(0, 10);
    await this.storage.transaction(async (txn) => {
      let rows = this.extraRows;
      for (const [id, json] of puts) rows += await writePiece(txn, `sess:${id}`, json);
      for (const id of removed) await deletePiece(txn, `sess:${id}`);
      if (this.written.get('main') !== mainDigest) rows += await writePiece(txn, 'main', mainJson);
      if (!this.legacyChecked) {
        // 第一次拆開存：刪掉舊版的單一快照
        const old = await txn.get<{ chunks: number }>('classroom-state:manifest');
        for (let i = 0; i < (old?.chunks || 0); i++) await txn.delete(`classroom-state:chunk:${i}`);
        await txn.delete('classroom-state:manifest');
        await txn.delete('classroom-state');
      }
      const usage = (await txn.get<{ day: string; rows: number }>('usage:rows')) || { day, rows: 0 };
      await txn.put('usage:rows', { day, rows: (usage.day === day ? usage.rows : 0) + rows + 1 });
    });
    this.legacyChecked = true;
    this.extraRows = 0;
    for (const [id, , d] of puts) this.written.set(id, d);
    for (const id of removed) this.written.delete(id);
    this.written.set('main', mainDigest);
    this.known = keep;
  }
  /** 用量：資料大小與今天寫入的列數（設定頁顯示，避免超過免費額度）。 */
  async usage(): Promise<StorageUsage> {
    let dataBytes = 0;
    for (const key of ['main', ...[...this.known].map((id) => `sess:${id}`)]) dataBytes += (await this.storage.get<PieceManifest>(`${key}:m`))?.bytes || 0;
    const day = new Date().toISOString().slice(0, 10);
    const u = await this.storage.get<{ day: string; rows: number }>('usage:rows');
    return { dataBytes, rowsToday: u?.day === day ? u.rows : 0, sessions: this.known.size };
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

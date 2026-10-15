import { assert } from './validation';
import { type StorageEnv, supabaseUrl } from './storage';
const encoder = new TextEncoder();
export async function hash(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
export function checkOrigin(request: Request): void {
  const origin = request.headers.get('Origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    assert(origin === new URL(request.url).origin, '來源驗證失敗，請從相同網站操作', 403);
    assert(
      request.method === 'DELETE' ||
        request.headers.get('Content-Type')?.split(';')[0] === 'application/json',
      '請使用 JSON 請求',
      415,
    );
  }
  assert(request.headers.get('Sec-Fetch-Site') !== 'cross-site', '不接受跨網站請求', 403);
}
export function demoAllowed(request: Request, env: StorageEnv): boolean {
  return (
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname) ||
    env.ALLOW_PUBLIC_DEMO === 'true'
  );
}
export function teacherAllowed(email: string, env: StorageEnv): boolean {
  return (env.TEACHER_EMAILS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .includes(email.toLowerCase());
}
export async function verifyCloudTeacher(
  accessToken: string,
  env: StorageEnv,
): Promise<{ id: string; email: string }> {
  assert(env.SUPABASE_PUBLISHABLE_KEY, '尚未設定 SUPABASE_PUBLISHABLE_KEY', 503);
  const r = await fetch(`${supabaseUrl(env)}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });
  assert(r.ok, '教師登入已失效，請重新登入', 401);
  const user = (await r.json()) as { id: string; email: string };
  assert(
    typeof user.id === 'string' &&
      typeof user.email === 'string' &&
      teacherAllowed(user.email, env),
    '此帳號未列入教師名單',
    403,
  );
  return user;
}

/** 預設教師密碼（費氏數列 1,1,2,3,5,8,13）。第一次登入後請立即修改。 */
export const DEFAULT_TEACHER_PASSWORD = '11235813';
export interface TeacherSecret {
  salt: string;
  hash: string;
  iterations: number;
  changedAt: string;
}
const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
export async function hashPassword(
  password: string,
  salt = toHex(crypto.getRandomValues(new Uint8Array(16))),
  iterations = 100000,
): Promise<TeacherSecret> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations },
    key,
    256,
  );
  return { salt, hash: toHex(new Uint8Array(bits)), iterations, changedAt: new Date().toISOString() };
}
export async function verifyPassword(password: string, secret: TeacherSecret | undefined) {
  if (!secret) return password === DEFAULT_TEACHER_PASSWORD;
  const candidate = await hashPassword(password, secret.salt, secret.iterations);
  // 固定時間比較，避免以回應時間猜測雜湊。
  let diff = candidate.hash.length ^ secret.hash.length;
  for (let i = 0; i < Math.min(candidate.hash.length, secret.hash.length); i++)
    diff |= candidate.hash.charCodeAt(i) ^ secret.hash.charCodeAt(i);
  return diff === 0;
}
/** 教師帳號：部署時以 TEACHER_ACCOUNT 設為自己的 Cloudflare 帳號信箱。 */
export function teacherAccount(env: StorageEnv): string {
  const account = (env.TEACHER_ACCOUNT || '').trim().toLowerCase();
  if (account) return account;
  assert(env.APP_MODE !== 'cloudflare', '尚未設定 TEACHER_ACCOUNT（教師帳號）', 503);
  return 'teacher';
}

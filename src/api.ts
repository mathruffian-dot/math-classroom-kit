export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
/** 伺服器時間與本機時間的差（毫秒）：倒數計時用伺服器時間，各裝置才會一致。 */
let clockOffset = 0;
export function serverTime() {
  return Date.now() + clockOffset;
}
export function syncClock(data: unknown) {
  const at = (data as { serverNow?: unknown } | null)?.serverNow;
  if (typeof at === 'number') clockOffset = at - Date.now();
}
export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ error: '伺服器回應格式不正確' }));
  if (!response.ok)
    throw new ApiError(data.error || `連線失敗 (${response.status})`, response.status);
  syncClock(data);
  return data;
}
export function download(name: string, data: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

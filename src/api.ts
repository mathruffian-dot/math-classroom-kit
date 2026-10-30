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
/** 網路斷掉或卡住（學校網路常見）時給的訊息；status 0 表示沒有收到伺服器回應。 */
export const NETWORK_ERROR = '網路連線不穩，沒有收到伺服器回應。請確認網路後再按一次。';
/**
 * 呼叫後端。signal：呼叫端可以中止（例如學生離開作業頁、換人登入）；中止時丟出 status 0 的 ApiError，
 * 呼叫端自己判斷要不要顯示（已經離開的畫面不顯示）。
 */
export async function api<T = any>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  // 一般請求 30 秒沒回應就放棄（不讓畫面一直卡著）；AI 批改、手寫辨識、上傳照片、備份還原比較久
  const slow = /^\/(ai|backup|restore)\b|\/(ocr|ocr-work|images)$/.test(path);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? anySignal(AbortSignal.timeout(slow ? 150_000 : 30_000), signal) : AbortSignal.timeout(slow ? 150_000 : 30_000),
    });
  } catch {
    throw new ApiError(NETWORK_ERROR, 0);
  }
  const data = await response.json().catch(() => ({ error: '伺服器回應格式不正確' }));
  if (!response.ok)
    throw new ApiError(data.error || `連線失敗 (${response.status})`, response.status);
  syncClock(data);
  return data;
}
/** AbortSignal.any（舊版 iPad Safari 沒有時自己合併）。 */
function anySignal(...signals: AbortSignal[]): AbortSignal {
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (any) return any.call(AbortSignal, signals);
  const c = new AbortController();
  for (const s of signals) {
    if (s.aborted) c.abort();
    else s.addEventListener('abort', () => c.abort(), { once: true });
  }
  return c.signal;
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

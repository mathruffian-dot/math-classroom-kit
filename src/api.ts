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
export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  // 一般請求 30 秒沒回應就放棄（不讓畫面一直卡著）；AI 批改、手寫辨識、上傳照片、備份還原比較久
  const slow = /^\/(ai|backup|restore)\b|\/(ocr|ocr-work|images)$/.test(path);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(slow ? 150_000 : 30_000),
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

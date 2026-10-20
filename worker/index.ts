import { handleApi, liveTicket, liveView, type Deferred, type LiveTicket, type Presence, type State } from './app';
import {
  DurableStore,
  SupabaseStore,
  type LocalStorage,
  type StorageEnv,
  type Store,
} from './storage';
import type { Vault } from './ai';
import { checkOrigin, hash } from './security';
import { HttpError, assert } from './validation';

/** Cloudflare 執行環境提供的 WebSocket 介面（只宣告這裡用到的部分）。 */
interface LiveSocket {
  send(message: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
declare const WebSocketPair: { new (): { 0: LiveSocket; 1: LiveSocket } };
declare const WebSocketRequestResponsePair: { new (request: string, response: string): unknown };

interface DurableState {
  storage: LocalStorage;
  acceptWebSocket?(socket: LiveSocket, tags?: string[]): void;
  getWebSockets?(tag?: string): LiveSocket[];
  setWebSocketAutoResponse?(pair: unknown): void;
  /** 自動回覆 ping 的最後時間（休眠中也會記錄）。 */
  getWebSocketAutoResponseTimestamp?(socket: LiveSocket): Date | null;
}
interface Namespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
interface Env extends StorageEnv {
  CLASSROOM: Namespace;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
const LIVE_PATH = '/api/live';
function digest(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

/** A single durable object serializes classroom commands. Cloud persistence also uses
 * a database compare-and-swap revision to fail safely if another deployment races. */
export class ClassroomDurableObject {
  private queue: Promise<void> = Promise.resolve();
  private state: DurableState;
  private env: Env;
  private broadcastTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(state: DurableState, env: Env) {
    this.state = state;
    this.env = env;
    // 心跳由執行環境自動回覆，不會喚醒休眠中的物件。
    if (state.setWebSocketAutoResponse && typeof WebSocketRequestResponsePair !== 'undefined')
      state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this.queue.then(job);
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  fetch(request: Request): Promise<Response> {
    if (
      new URL(request.url).pathname === LIVE_PATH &&
      request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
    )
      return this.enqueue(() => this.openLive(request));
    let deferred: Deferred | undefined;
    const response = this.enqueue(() =>
      this.run(request, (job) => {
        deferred = job;
      }),
    );
    return response.then(async (r) => {
      // 任何成功的寫入都推送最新畫面給連線中的師生（取代每 2 秒輪詢）。
      if (r.ok && !['GET', 'HEAD'].includes(request.method)) this.scheduleBroadcast();
      if (!deferred) return r;
      const job = deferred;
      try {
        // 外部 AI 呼叫在佇列外執行，完成後再回到佇列寫入結果（例如批改分數）。
        const result = await job.operation();
        if (job.commit) {
          await this.enqueue(async () => {
            const store = this.store();
            const latest = await store.read();
            if (!latest) return;
            job.commit!(latest, result);
            await store.write(latest);
          });
          this.scheduleBroadcast();
        }
        return Response.json(result);
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof HttpError ? error.message : 'AI 服務暫時無法使用，課堂功能不受影響',
          },
          { status: error instanceof HttpError ? error.status : 502 },
        );
      }
    });
  }
  /** 建立即時連線：驗證身分後接受 WebSocket（可休眠），並立刻送出目前畫面。 */
  private async openLive(request: Request): Promise<Response> {
    try {
      assert(this.state.acceptWebSocket, '此環境不支援即時連線', 426);
      // 防止其他網站借用學生的 cookie 開連線。
      assert(request.headers.get('Origin') === new URL(request.url).origin, '來源驗證失敗', 403);
      const state = await this.store().read();
      assert(state, '請先登入', 401);
      const ticket = await liveTicket(request, state);
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.state.acceptWebSocket!(server, [ticket.role, ticket.sessionId || `class:${ticket.classId}`]);
      const view = liveView(state, ticket, this.onlineUsers());
      const message = JSON.stringify({ type: 'view', view });
      server.serializeAttachment({ ...ticket, at: Date.now(), sent: digest(message) });
      server.send(message);
      if (ticket.role === 'student') this.scheduleBroadcast(); // 老師端的上線名單要更新
      return new Response(null, { status: 101, webSocket: client } as ResponseInit);
    } catch (error) {
      return Response.json(
        { error: error instanceof HttpError ? error.message : '即時連線失敗' },
        { status: error instanceof HttpError ? error.status : 503 },
      );
    }
  }
  /** 短時間內多次變更（例如全班一起交卷）合併成一次推送。 */
  private scheduleBroadcast() {
    if (!this.state.getWebSockets || this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = undefined;
      void this.enqueue(() => this.broadcast()).catch(() => {});
    }, 250);
  }
  private async broadcast() {
    const sockets = this.state.getWebSockets?.() || [];
    if (!sockets.length) return;
    const state = await this.store().read();
    if (!state) return;
    const online = this.onlineUsers();
    for (const socket of sockets) {
      try {
        const ticket = socket.deserializeAttachment() as LiveTicket;
        const view = liveView(state, ticket, online);
        if (view === null) {
          socket.close(4001, 'login expired');
          continue;
        }
        const message = JSON.stringify({ type: 'view', view });
        const sent = digest(message);
        if (sent === ticket.sent) continue;
        socket.send(message);
        socket.serializeAttachment({ ...ticket, sent });
      } catch {
        // 單一連線失敗不影響其他人；用戶端會自動重連。
      }
    }
  }
  webSocketMessage(socket: LiveSocket, message: string | ArrayBuffer) {
    if (message === 'ping') socket.send('pong');
  }
  webSocketClose(socket: LiveSocket, code: number, reason: string) {
    try {
      socket.close(code === 1005 ? 1000 : code, reason);
    } catch {}
    try {
      const t = socket.deserializeAttachment() as LiveTicket;
      if (t.role === 'student') this.closedAt.set(t.userId, Date.now());
    } catch {}
    this.scheduleBroadcast(); // 學生離線，老師端名單更新
  }
  /** 學生連線關掉的時間（記憶體內；Durable Object 休眠後清空，改用最後出現時間判斷）。 */
  private closedAt = new Map<string, number>();
  /**
   * 目前上線的學生（userId）：有即時連線，而且 100 秒內有 ping（用戶端每 45 秒送一次）或剛連上。
   * iPad 闔上螢幕時連線可能不會立刻關閉，用 ping 時間判斷才不會一直顯示上線。
   */
  private onlineUsers(): Presence {
    const out = new Set<string>();
    for (const socket of this.state.getWebSockets?.('student') || []) {
      try {
        const t = socket.deserializeAttachment() as LiveTicket & { at?: number };
        const ping = this.state.getWebSocketAutoResponseTimestamp?.(socket)?.getTime() || 0;
        if (Date.now() - Math.max(ping, t.at || 0) < 100_000) out.add(t.userId);
      } catch {
        /* 壞掉的連線不算 */
      }
    }
    return { live: out, closedAt: this.closedAt };
  }
  /** 伺服器端秘密與作答圖片：只存在 Durable Object，不進入快照、Supabase 或備份。 */
  private vault(): Vault {
    const storage = this.state.storage;
    return {
      get: (key) => storage.get(key),
      put: (key, value) => storage.put(key, value),
      delete: (key) => storage.delete(key),
    };
  }
  private store(): Store<State> {
    let store: Store<State> = new DurableStore<State>(this.state.storage);
    if (this.env.APP_MODE === 'supabase') {
      const database = new SupabaseStore<State>(this.env),
        logins = new DurableStore<State['logins']>(this.state.storage, 'cloud-logins');
      store = {
        async read() {
          const state = await database.read();
          if (!state) return undefined;
          state.logins = (await logins.read()) || {};
          return state;
        },
        async write(state: State) {
          // Signing secrets and provider/Auth tokens stay in Worker/DO storage,
          // never in the Supabase snapshot or downloadable backups.
          await database.write({ ...state, secret: '', logins: {} });
          await logins.write(state.logins);
        },
      };
    }
    return store;
  }
  private async run(request: Request, deferAi: (job: Deferred) => void): Promise<Response> {
    try {
      checkOrigin(request);
      if (request.method === 'POST' && new URL(request.url).pathname === '/api/login') {
        const now = Date.now(),
          ip = request.headers.get('CF-Connecting-IP') || 'local',
          key = `login-rate:${await hash(ip, 'local-rate-limit-v1')}`;
        const existing = await this.state.storage.get<{ time: number; count: number }>(key);
        const bucket =
          existing && now - existing.time < 600000 ? existing : { time: now, count: 0 };
        bucket.count++;
        await this.state.storage.put(key, bucket);
        // One classroom often shares a NAT address. This permits 40 students to
        // sign in together, while preventing unbounded password guessing.
        if (bucket.count > 200)
          return Response.json(
            { error: '登入嘗試過多，請於 10 分鐘後重試' },
            { status: 429, headers: { 'Retry-After': '600' } },
          );
      }
      return await handleApi(request, {
        env: this.env,
        store: this.store(),
        vault: this.vault(),
        assets: this.env.ASSETS,
        online: () => this.onlineUsers(),
        deferAi,
      });
    } catch (error) {
      return Response.json(
        { error: error instanceof HttpError ? error.message : '服務暫時無法處理，請稍後重試' },
        { status: error instanceof HttpError ? error.status : 503 },
      );
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // 課本截圖只能經由 /api/assets（需登入）讀取。
    if (url.pathname.startsWith('/lesson-assets/')) return new Response('Not found', { status: 404 });
    const response = url.pathname.startsWith('/api/')
      ? await env.CLASSROOM.get(env.CLASSROOM.idFromName(env.APP_INSTANCE || 'default')).fetch(
          request,
        )
      : await env.ASSETS.fetch(request);
    // WebSocket 升級回應必須原樣傳回，不能重新包裝。
    if (response.status === 101) return response;
    const secured = new Response(response.body, response);
    secured.headers.set('X-Content-Type-Options', 'nosniff');
    secured.headers.set('Referrer-Policy', 'same-origin');
    const isCustomHtml =
      /^\/api\/(?:sessions|lessons)\/[\w-]+\/slides\/[\w-]+\/html$/.test(url.pathname) &&
      response.headers.get('Content-Type')?.startsWith('text/html');
    secured.headers.set('X-Frame-Options', isCustomHtml ? 'SAMEORIGIN' : 'DENY');
    // 拍照作答使用 <input capture>，由系統相機程式處理，不需要開放 getUserMedia。
    secured.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const live = `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`;
    secured.headers.set(
      'Content-Security-Policy',
      isCustomHtml
        ? "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
        : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${live}; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    );
    if (url.protocol === 'https:')
      secured.headers.set('Strict-Transport-Security', 'max-age=31536000');
    if (
      url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/api/images/') &&
      !url.pathname.startsWith('/api/assets/')
    )
      secured.headers.set('Cache-Control', 'no-store');
    return secured;
  },
};

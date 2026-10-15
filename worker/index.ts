import { handleApi, type Deferred, type State } from './app';
import {
  DurableStore,
  SupabaseStore,
  type LocalStorage,
  type StorageEnv,
  type Store,
} from './storage';
import type { Vault } from './ai';
import { checkOrigin, hash } from './security';
import { HttpError } from './validation';

interface DurableState {
  storage: LocalStorage;
}
interface Namespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
interface Env extends StorageEnv {
  CLASSROOM: Namespace;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** A single durable object serializes classroom commands. Cloud persistence also uses
 * a database compare-and-swap revision to fail safely if another deployment races. */
export class ClassroomDurableObject {
  private queue: Promise<void> = Promise.resolve();
  private state: DurableState;
  private env: Env;
  constructor(state: DurableState, env: Env) {
    this.state = state;
    this.env = env;
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
    let deferred: Deferred | undefined;
    const response = this.enqueue(() =>
      this.run(request, (job) => {
        deferred = job;
      }),
    );
    return response.then(async (r) => {
      if (!deferred) return r;
      const job = deferred;
      try {
        // 外部 AI 呼叫在佇列外執行，完成後再回到佇列寫入結果（例如批改分數）。
        const result = await job.operation();
        if (job.commit)
          await this.enqueue(async () => {
            const store = this.store();
            const latest = await store.read();
            if (!latest) return;
            job.commit!(latest, result);
            await store.write(latest);
          });
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
    const secured = new Response(response.body, response);
    secured.headers.set('X-Content-Type-Options', 'nosniff');
    secured.headers.set('Referrer-Policy', 'same-origin');
    const isCustomHtml =
      /^\/api\/(?:sessions|lessons)\/[\w-]+\/slides\/[\w-]+\/html$/.test(url.pathname) &&
      response.headers.get('Content-Type')?.startsWith('text/html');
    secured.headers.set('X-Frame-Options', isCustomHtml ? 'SAMEORIGIN' : 'DENY');
    // 拍照作答使用 <input capture>，由系統相機程式處理，不需要開放 getUserMedia。
    secured.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    secured.headers.set(
      'Content-Security-Policy',
      isCustomHtml
        ? "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
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

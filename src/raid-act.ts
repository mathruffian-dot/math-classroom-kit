// 魔王戰學生的操作（選角色、設目標、抽題、換一題、作答）：送伺服器、回應回來後改本機畫面。
// 從 main.ts 拆出來（2026-11-07 Codex 複審第三輪），相依的東西由 initRaidAct 注入，tests/raid-act.test.mjs 直接驅動。
import type { RaidView } from '../shared/types';
import type { RaidKind } from '../shared/raid';
import { raidBusy, raidFlashHtml, raidLocal, raidTakenHtml, type RaidAnswerResult } from './raid-ui';

type Mine = NonNullable<RaidView['mine']>;
type Question = NonNullable<Mine['question']>;
export interface RaidActDeps {
  api<T>(path: string, method: string, body: unknown): Promise<T>;
  /** 現在的課堂畫面（推送會換掉它）。 */
  view(): { session: { id: string; revision: number }; raid?: RaidView } | null | undefined;
  /** 換畫面就加一（main.ts 的 routeVersion）。 */
  route(): number;
  refresh(): void;
  resync(): void;
  toast(message: string): void;
  playCorrect(): void;
}
let D: RaidActDeps;
export function initRaidAct(d: RaidActDeps) {
  D = d;
}

/**
 * 這一場看過最新的正式 revision（作答回應與推送都算）。
 * 只看 session.revision 不夠：A 的回應晚到之前，較新的抽題回應（同一個題目 id 再抽到，題庫循環時會發生）可能比推送先到，
 * 這時 session.revision 還是舊的，A 會誤以為自己最新、把新題目刪掉（Codex 複審第三輪）。
 */
const newest = { run: '', rev: 0 };
export function raidRevisionOf(run: string) {
  return newest.run === run ? newest.rev : 0;
}
export function noteRaidRevision(run: string, rev: number) {
  if (newest.run !== run) Object.assign(newest, { run, rev });
  else newest.rev = Math.max(newest.rev, rev);
}
/** 每一次操作的序號：只有最後一次完成、改過結果卡的操作可以放結果；比它早送出的舊回應晚到不蓋掉。 */
let gen = 0;

export async function raidAct(act: string, el: { dataset: DOMStringMap }) {
  const view0 = D.view();
  const v = view0?.raid;
  if (!v || !view0 || raidBusy(v)) return;
  const sessionId = view0.session.id,
    route = D.route();
  const path = `/sessions/${sessionId}/raid`;
  // 等回應時畫面可能已經換成別的推送：結果寫進「現在的」畫面（同一場）
  const mineNow = () => {
    const cur = D.view()?.raid;
    return ((cur?.run.id === v.run.id ? cur : v).mine ||= {});
  };
  // 回應晚到時已經換畫面、換課堂或換一場：結果不套用到別的魔王戰
  const live = () => {
    const cur = D.view();
    return route === D.route() && cur?.session.id === sessionId && !(cur.raid && cur.raid.run.id !== v.run.id);
  };
  // 回應比畫面上的正式狀態舊（較新的推送或較新的回應先到，例如另一個分頁已經換題）：以較新的為準
  const fresh = (rev: number) => {
    const ok = rev >= D.view()!.session.revision && rev >= raidRevisionOf(v.run.id);
    noteRaidRevision(v.run.id, rev);
    return ok;
  };
  const req: NonNullable<typeof raidLocal.sending> = { run: v.run.id, route, gen: ++gen };
  const flash = (html: string) => {
    raidLocal.flash = html;
    raidLocal.flashGen = req.gen;
  };
  raidLocal.sending = req;
  try {
    if (act === 'raid-role') {
      const r = await D.api<{ revision: number }>(path, 'POST', { runId: v.run.id, op: 'role', role: el.dataset.role });
      if (live() && fresh(r.revision)) mineNow().role = el.dataset.role as Mine['role'];
    } else if (act === 'raid-goal') {
      const goal = Number(el.dataset.goal);
      if (!goal) raidLocal.noGoal = v.run.id;
      else {
        const r = await D.api<{ goal: number; revision: number }>(path, 'POST', { runId: v.run.id, op: 'goal', goal });
        if (live() && fresh(r.revision)) mineNow().goal = r.goal;
      }
    } else if (act === 'raid-skip') {
      const r = await D.api<{ question: Question; skipAt: number; revision: number }>(path, 'POST', { runId: v.run.id, op: 'skip' });
      if (live() && fresh(r.revision)) {
        mineNow().question = r.question;
        mineNow().skipAt = r.skipAt;
      }
    } else if (act === 'raid-draw') {
      const r = await D.api<{ question: Question; revision: number }>(path, 'POST', { runId: v.run.id, op: 'draw', kind: el.dataset.kind as RaidKind });
      if (live() && fresh(r.revision)) {
        mineNow().question = r.question;
        if (raidLocal.pick.q !== r.question.id) raidLocal.pick = { q: r.question.id };
        flash('');
      }
    } else {
      const q = v.mine?.question;
      if (!q) return;
      // 分析題「判斷＋理由」：兩段的選擇在 raidLocal.pick（raid-pick 選的）
      const two = !!q.reason;
      const pick = raidLocal.pick.q === q.id ? raidLocal.pick : { q: q.id };
      if (two && (pick.a === undefined || pick.r === undefined)) return;
      const choice = two ? pick.a! : Number(el.dataset.choice);
      // 先顯示再同步：送出前就把選的標成已選、鎖住這一題的選項（分析題兩段本來就標著）；對錯、傷害等伺服器
      Object.assign(req, { q: q.id, choice });
      D.refresh();
      const r = await D.api<RaidAnswerResult & { lockUntil?: number; revision: number; taken?: boolean; question?: Question }>(path, 'POST', { runId: v.run.id, op: 'answer', choice, ...(two ? { reason: pick.r } : {}) });
      if (!live()) return;
      const ok = fresh(r.revision);
      const cur = mineNow().question?.id;
      // 畫面上還是這一題、也沒有更新的正式狀態：題目、鎖住時間照回應改
      const own = ok && cur === q.id;
      if (r.taken) {
        // 分析題已經不能計入（同學先解開、或開新護盾前抽到的）：不算錯、不鎖，直接換一題
        if (!own) return; // 已經是別的題目（另一個分頁換了、較新的推送）：不蓋掉
        flash(raidTakenHtml(!!r.question));
        raidLocal.pick = { q: '' };
        if (r.question) mineNow().question = r.question;
        else delete mineNow().question;
        return;
      }
      // 畫面上已經是別的題目：這題的結果不蓋上去、不刪掉新題目
      // 之後送出的操作已經改過結果卡（抽了下一題又答完）：舊的對錯不蓋掉新的
      if (!own && (cur !== undefined || req.gen < raidLocal.flashGen)) return;
      // 較新的推送已經把這題收掉（同一次作答）：照樣顯示對錯，題目與鎖住時間以推送為準
      flash(raidFlashHtml(r, q.options, q.reason));
      raidLocal.pick = { q: '' };
      if (r.correct) D.playCorrect();
      if (own) {
        delete mineNow().question;
        if (r.lockUntil) mineNow().lockUntil = r.lockUntil;
        if (r.analysisLockUntil) mineNow().analysisLockUntil = r.analysisLockUntil;
      }
    }
  } catch (e) {
    if (live()) D.toast(e instanceof Error ? e.message : '送出失敗，請再試一次');
    D.resync();
  } finally {
    // 失敗、逾時：拿掉剛才的已選（分析題兩段的選擇留著，直接再按送出），選項解鎖可以再點
    // 只拿掉自己這一次：已經換場、換畫面後新的請求不被舊請求解開
    if (raidLocal.sending === req) raidLocal.sending = null;
    D.refresh();
  }
}

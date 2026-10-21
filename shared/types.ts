export type Role = 'teacher' | 'student';
export interface User {
  id: string;
  role: Role;
  name: string;
  classId?: string;
  seat?: number;
}

/** 評量規準：每個向度有配分與分級描述，AI 與教師都依此批改。 */
export interface RubricLevel {
  score: number;
  description: string;
}
export interface RubricCriterion {
  id: string;
  label: string;
  points: number;
  levels: RubricLevel[];
}
export interface Rubric {
  criteria: RubricCriterion[];
  /** 參考解答；公布結果前不會送給學生。 */
  reference?: string;
  /** 給批改者的額外提醒，例如可接受的替代解法。 */
  graderNotes?: string;
}

export type ActivityType =
  | 'single'
  | 'multiple'
  | 'scale'
  | 'short'
  | 'numeric'
  | 'canvas'
  | 'manipulate';

export interface Activity {
  id: string;
  type: ActivityType;
  prompt: string;
  options?: string[];
  correct?: number[];
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  explanation?: string;
  sensitive?: boolean;
  aiAllowed?: boolean;
  /** numeric：標準答案（可寫分數或算式，例如 "3/4"、"1681"、"2√3"）。 */
  answer?: string;
  /**
   * numeric：同類型換數字的小題（1–3 題），學生一次作答、逐題判定。
   * 設定 items 時不需要頂層 answer。
   */
  items?: NumericItem[];
  /** numeric：'simplest-radical' 表示答案須化成最簡根式（數值相同但未化簡判錯並說明）。 */
  form?: 'simplest-radical';
  tolerance?: number;
  unit?: string;
  /** manipulate：以互動變數判斷正確的運算式，例如 "a==4 && b==3"。 */
  check?: string;
  /** manipulate：提交時要記錄的互動變數；省略時記錄全部參數與點座標。 */
  record?: string[];
  /** short／canvas：評量規準；numeric 設了 photoWork 時是拍照作答的會考評分（0–3 分）。 */
  rubric?: Rubric;
  /**
   * numeric：也可以拍照交計算過程（AI 依辨識稿批改）。學生可以直接送答案，或拍課本上的計算過程。
   * items：照片要批改的小題（課本原題，從 0 起算）；省略表示全部小題。
   */
  photoWork?: { items?: number[] };
  /** canvas：畫布底圖。 */
  canvas?: 'blank' | 'grid' | 'axes' | 'dots';
  /** canvas：是否允許拍照上傳作答（預設允許）。 */
  allowPhoto?: boolean;
  /**
   * numeric：補救練習（第 1、2、3 輪各一題）。全班作答後，老師把練習派給答錯的同學；
   * 每輪限時、答錯或逾時自動換下一輪。題目格式（form、unit、tolerance）沿用這一題。
   */
  practice?: PracticeQuestion[];
}
export interface PracticeQuestion {
  prompt: string;
  answer: string;
  explanation?: string;
  tolerance?: number;
}

/** 可操作視覺化：以數學座標描述圖形，滑桿、拖曳點與步驟揭示都會即時重算。 */
export type Expr = string | number;
export interface InteractiveParam {
  id: string;
  label?: string;
  kind?: 'slider' | 'toggle';
  min?: number;
  max?: number;
  step?: number;
  value: number;
  unit?: string;
}
export interface InteractivePoint {
  id: string;
  label?: string;
  x: number;
  y: number;
  /** 拖曳時的格點間距，0 表示連續。 */
  snap?: number;
  /** 'x'：只能水平移動；'y'：只能垂直移動。 */
  lock?: 'x' | 'y';
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  color?: string;
}
export type ShapeType =
  | 'function'
  | 'segment'
  | 'line'
  | 'polygon'
  | 'circle'
  | 'rect'
  | 'text'
  | 'point'
  | 'angle'
  | 'brace';
export interface InteractiveShape {
  type: ShapeType;
  /** function：y = expr(x)。 */
  expr?: string;
  domain?: [Expr, Expr];
  /** segment／line／polygon／angle 的頂點。 */
  points?: [Expr, Expr][];
  x?: Expr;
  y?: Expr;
  w?: Expr;
  h?: Expr;
  r?: Expr;
  /** text：可用 {運算式} 插入即時數值，例如 "面積 = {a*b}"。 */
  text?: string;
  color?: string;
  fill?: string;
  dash?: boolean;
  width?: number;
  size?: number;
  /** 運算式為假時隱藏。 */
  show?: string;
  /** 步驟揭示：step 變數 ≥ 此值才顯示。 */
  step?: number;
  /**
   * 步驟聚焦：列出的步驟中此圖形發光、其餘圖形反暗。
   * 省略時，圖形在「自己出現的那一步」（step）發光。
   */
  focus?: number[];
  /** 可點擊切換的圖形會設定此 toggle 參數。 */
  toggle?: string;
}
export interface Interactive {
  view: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    grid?: number;
    axes?: boolean;
    /** 'equal' 讓 x、y 單位長相同（幾何圖形必用）。 */
    aspect?: 'equal' | 'fill';
  };
  params?: InteractiveParam[];
  points?: InteractivePoint[];
  shapes: InteractiveShape[];
  readouts?: { label: string; expr: string; digits?: number }[];
  /** 步驟揭示的說明文字；變數 step 從 0 開始。 */
  steps?: string[];
  caption?: string;
  /** 只由伺服器設定：學生端在老師「公布結果」前，解題步驟只留第 1 步（題目）。 */
  locked?: boolean;
}

export interface NumericItem {
  prompt: string;
  answer: string;
  tolerance?: number;
}
/** 課本截圖（只截最重要的部分）；檔案放在 public/lesson-assets/，登入後才能讀取。 */
export interface Figure {
  src: string;
  alt: string;
  caption?: string;
}
/**
 * 動畫片段：靜音 mp4＋封面圖，放在 public/lesson-assets/，檔名以 anim- 開頭。
 * 頁面有 IRS 時，學生端要等老師「公布結果」才解鎖（動畫通常演示答案）；reveal: 'always' 則一律可看。
 */
export interface Animation {
  src: string;
  poster?: string;
  caption: string;
  seconds?: number;
  reveal?: 'after-results' | 'always';
  /** 只由伺服器設定：學生端尚未解鎖時，src／poster 會被移除。 */
  locked?: boolean;
}
export interface Slide {
  id: string;
  title: string;
  /** 課後檢核・PK 戰頁（每堂課最後一頁）：投影片區是對戰／測驗畫面，右側是派題與配對。 */
  quizPage?: boolean;
  eyebrow?: string;
  body: string;
  bullets?: string[];
  /** 本頁的認知設計標記，例如「提取練習」「工作範例」。 */
  phase?: string;
  visual?: 'balance' | 'steps' | 'cards' | 'bars';
  interactive?: Interactive;
  figures?: Figure[];
  animation?: Animation;
  activity?: Activity;
  notes?: string;
  source?: string;
  customHtml?: string;
}
export interface Lesson {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  subject: string;
  duration: number;
  objectives: string[];
  slides: Slide[];
  updatedAt?: string;
  /** 課後形成性評量題庫（10 個題位 × 3 題換數字）；學生端看不到。 */
  quiz?: QuizBank;
}
/** 課後形成性評量題庫：每個題位有 3 題同類型換數字的四選一題目。 */
export interface QuizBank {
  title: string;
  source?: string;
  slots: QuizSlot[];
}
export interface QuizSlot {
  id: string;
  topic: string;
  variants: QuizItem[];
}
export interface QuizItem {
  stem: string;
  /** 幾何題的附圖（SVG 文字，出題程式依同一組數字畫出）；學生端以圖片顯示。 */
  figure?: string;
  options: string[];
  /** 正確選項（原始順序，從 0 起算）。 */
  answer: number;
  explanation?: string;
}
/** 抽好的一份卷子：每個題位抽到第幾題，以及選項的顯示順序（order[顯示位置]＝原始選項）。 */
export interface QuizPaper {
  picks: { variant: number; order: number[] }[];
}
/** PK 一組：b＝0 表示和電腦對戰。 */
export interface PkMatch {
  id: string;
  a: number;
  b: number;
}
/** 一次全班測驗或一場 PK（同一份卷子；PK 時所有組與觀眾都用這一份）。 */
export interface QuizRun {
  id: string;
  /** class：全班測驗；pk：PK 戰；review：錯題練習（每人只做自己錯的題型，換數字）。 */
  mode: 'class' | 'pk' | 'review';
  paper: QuizPaper;
  /** 錯題練習：每個人自己的卷子（picks 依題位、slots 是要做的題位）。 */
  personal?: Record<string, { picks: QuizPaper['picks']; slots: number[] }>;
  /** 開始作答的時間（PK 有 3 秒倒數，所以比建立時間晚）。 */
  startedAt: number;
  seconds: number;
  endedAt?: number;
  matches?: PkMatch[];
}
/** 一位同學在一次測驗的作答：answers 存原始選項，times 是從開始算起的毫秒。 */
export interface QuizSheet {
  answers: (number | null)[];
  times: (number | null)[];
  /** 交卷（全部答完）的時間，從開始算起的毫秒。 */
  done?: number;
}
/** 學生、大螢幕看到的成績摘要（只有題數，不含答案）。 */
export interface QuizScore {
  answered: number;
  correct: number;
  /** 用時（毫秒）：交卷時間；時間到還沒交卷就是整段時間；還在作答就是 null。 */
  timeMs: number | null;
  finished: boolean;
}
/** PK 配對區：已配好的組，以及等待對手的那一位。 */
export interface PkLobby {
  pairs: [number, number][];
  waiting: number | null;
  /** 開放搶答上場。 */
  buzz: boolean;
}
export interface QuizView {
  run: QuizRun;
  title: string;
  questions: {
    /** 題位（從 0 起算）；作答時送這個。錯題練習只列自己的題位。 */
    slot: number;
    topic: string;
    stem: string;
    figure?: string;
    /** 顯示順序的選項。 */
    options: string[];
    /** 正確選項的顯示位置：老師都有；學生在 PK 答過的題、全班測驗結束後才有。 */
    answer?: number;
    explanation?: string;
  }[];
  /** 自己的作答（顯示位置）。 */
  mine?: { answers: (number | null)[]; correct: (boolean | null)[]; done?: number };
  /** 每位同學的成績摘要（座號 → 摘要；0＝電腦）。學生只在 PK 時看得到。 */
  scores: Record<string, QuizScore>;
  /** 老師：每一題每個選項（顯示位置）有幾人選。 */
  picks?: number[][];
  /** 電腦對手的作答時間表（各裝置自己算即時進度）。 */
  bot?: { correct: boolean[]; times: number[] };
  /** 老師：每位同學每個題位的對錯（大螢幕的每題 ✓／✗，不含答案）。 */
  detail?: Record<string, (boolean | null)[]>;
}
/** 老師：這堂課所有測驗、PK、錯題練習累計的錯題與 PK 戰績。 */
export interface QuizRecord {
  topics: string[];
  /** 座號 → 目前還錯的題位（最近一次做那個題型是錯的或沒作答）。 */
  wrong: Record<string, number[]>;
  /** PK 戰績：座號 → 勝、負、平手。 */
  standings: Record<string, { win: number; lose: number; draw: number }>;
  runs: number;
}
export interface Classroom {
  id: string;
  name: string;
  code: string;
  seats: number;
  createdAt: string;
  /** 學生登入是否需要個人識別碼。預設 false（測試階段）：只要班級代碼＋座號。 */
  requireCode?: boolean;
}
export interface Credential {
  seat: number;
  code: string;
}
export interface CanvasAnswer {
  text?: string;
  imageId?: string;
  /** 'draw'：手寫畫布；'photo'：拍照上傳（可再加註）。 */
  source?: 'draw' | 'photo';
  /** 拍照作答：學生確認（可修改）後的辨識稿，快速批改依這份文字給分。 */
  work?: string;
  /** 拍照作答：AI 原始辨識結果（和 work 不同表示學生改過，老師端會標示）。 */
  ocr?: string;
}
export interface ManipulateAnswer {
  vars: Record<string, number>;
}
export type AnswerValue = string | string[] | number | number[] | CanvasAnswer | ManipulateAnswer;
export interface Answer {
  id: string;
  submissionId: string;
  userId: string;
  seat: number;
  activityId: string;
  value: AnswerValue;
  submittedAt: string;
  /** numeric／manipulate 由伺服器即時判定。 */
  correct?: boolean;
  /** numeric 多小題：逐題對錯。 */
  itemsCorrect?: boolean[];
  /** 判定說明，例如「數值正確，但還沒化成最簡根式」。 */
  note?: string;
}
export type AnnotationMark =
  | 'check'
  | 'cross'
  | 'circle'
  | 'underline'
  | 'note'
  | 'question'
  | 'arrow';
/**
 * 紅筆批註：座標一律為 0–1 相對值（以作答圖片左上角為原點）。
 * 只以向量疊圖呈現，永遠不改動學生原圖。
 */
export interface Annotation {
  mark: AnnotationMark;
  /** check／cross／note／question 的位置；circle 的左上角；underline／arrow 的起點。 */
  x: number;
  y: number;
  /** circle 的右下角；underline／arrow 的終點。 */
  x2?: number;
  y2?: number;
  text: string;
}
/** 辨識稿上的批註：line 從 1 起算；quote 是這一行裡出錯的那一段（省略就圈整行）；missing 表示這一行之後少了步驟。 */
export interface TextMark {
  line: number;
  kind: 'error' | 'ok' | 'missing';
  quote?: string;
  note?: string;
}
export interface Grade {
  answerId: string;
  activityId: string;
  seat: number;
  mode: 'mock' | 'live' | 'teacher';
  /**
   * 批改層級：'verdict' 第 1 層，只判斷對錯（預設，快又省）；
   * 'full' 第 2 層，依規準逐項給分並加紅筆批註。
   */
  depth?: 'verdict' | 'full';
  /** 'text'：快速批改，只看學生確認過的辨識稿（不看圖、不畫紅筆）。 */
  basis?: 'text' | 'image';
  /** 拍照交的數值題：AI 從辨識稿讀到的每一小題最後答案（依 photoWork.items 的順序），伺服器再判定對錯。 */
  finals?: string[];
  /** 快速批改：在辨識稿上的批註（第幾行、哪一段），畫面上把錯的地方圈起來。 */
  marks?: TextMark[];
  /** 第 1 層的對錯判定；第 2 層以滿分視為答對。 */
  correct?: boolean;
  scores: { criterionId: string; score: number; comment: string }[];
  total: number;
  max: number;
  feedback: string;
  annotations: Annotation[];
  /** AI 逐行轉寫的學生手寫內容，供師生核對 AI 有沒有讀錯字。 */
  transcript?: string;
  /** 0–1；多次投票的一致率 × 模型自評信心。 */
  confidence?: number;
  /** 各次投票的總分。 */
  votes?: number[];
  needsReview?: boolean;
  gradedAt: string;
  released: boolean;
}
export interface Point {
  x: number;
  y: number;
}
export interface Stroke {
  id: string;
  color: string;
  width: number;
  points: Point[];
}
export interface Session {
  /** 目前（或剛結束）的形成性評量／PK。 */
  quiz?: QuizRun | null;
  /** PK 配對中。 */
  pkLobby?: PkLobby | null;
  id: string;
  classId: string;
  className: string;
  lessonId: string;
  title: string;
  createdAt: string;
  ended: boolean;
  /** 結束時間（毫秒時間戳）；結束超過 1 小時的課堂會封存，不在每次讀取時載入。 */
  endedAt?: number;
  slideIndex: number;
  activityOpen: boolean;
  resultsVisible: boolean;
  followTeacher: boolean;
  buzzOpen: boolean;
  buzzWinner: { seat: number; at: string } | null;
  drawnSeat: number | null;
  drawnSeats: number[];
  drawFilter?: 'all' | 'unanswered' | 'correct' | 'incorrect';
  revision: number;
  /** 老師按「派發拍照題」後，可拍照的數值題才出現拍照交計算過程（換頁收回）。 */
  photoOpen?: boolean;
  /** 這一次開放作答的時間（毫秒時間戳）：彈幕的「每題 3 則」從這裡重新計算。 */
  activityOpenedAt?: number;
  /** 開放作答的截止時間（毫秒時間戳）；null／省略表示不限時。時間到就鎖住作答。 */
  activityDeadline?: number | null;
  /** 補救練習進行中（只在老師目前這一頁）。 */
  practice?: PracticeRun | null;
  /** 彈幕開放中：學生可以送出短訊息，在老師的畫面由右至左飛過。 */
  danmakuOpen?: boolean;
  /** 老師按「清除彈幕」的時間：畫面上正在飛的彈幕一起清掉。 */
  danmakuClearedAt?: number;
}
/** 彈幕：匿名時畫面上不顯示座號（老師的紀錄看得到）。 */
export interface Danmaku {
  id: string;
  seat: number;
  text: string;
  anon: boolean;
  at: number;
}
export interface PracticeRun {
  activityId: string;
  startedAt: number;
  /** 每輪秒數。 */
  seconds: number;
  /** 最多幾輪（原題再做一次時：答錯最多小題的同學要做幾題）。 */
  rounds: number;
  /** 原題再做一次：每位同學把自己答錯的原題逐題再做一次（不另外出題）；答對答錯都換下一題，全對才算通過。 */
  retry?: boolean;
}
/** 一位同學的補救練習紀錄：開始時間與每一輪的作答。 */
export interface PracticeEntry {
  seat: number;
  start: number;
  subs: { round: number; value: string; correct: boolean; at: number }[];
  /** 原題再做一次：要重做的小題（從 0 起算，依序一輪一題）。 */
  items?: number[];
}
export interface PracticeView {
  run: PracticeRun;
  /** 老師：全部同學；學生：只有自己。 */
  entries: PracticeEntry[];
  /** 每輪題目（只有題目文字）；老師另外從課程看得到答案。 */
  prompts: string[];
  /** 已結束的輪次才公布答案與說明。 */
  reveals: { round: number; answer: string; explanation?: string }[];
}
export interface SessionView {
  session: Session;
  lesson: Lesson;
  answers: Answer[];
  aggregate: {
    counts: Record<string, number>;
    submitted: number;
    total: number;
    correct?: number;
  };
  whiteboard: Record<string, Stroke[]>;
  grades: Grade[];
  /** 只給老師：每個座號最後出現時間、目前是否上線（有即時連線或 75 秒內有動作）、這一頁是否已作答。 */
  roster?: { seat: number; lastSeen?: string; online?: boolean; answered?: boolean }[];
  /** 伺服器時間（毫秒），用來校正各裝置的倒數計時。 */
  serverNow?: number;
  /** 補救練習；學生端只有在自己被派到練習時才有。 */
  practice?: PracticeView;
  /** 只給老師：最近的彈幕。 */
  danmaku?: Danmaku[];
  /** 形成性評量／PK（有進行中或剛結束的才有）。 */
  quiz?: QuizView;
  /** 老師：錯題紀錄與 PK 戰績（這一課有題庫、做過測驗才有）。 */
  quizRecord?: QuizRecord;
  /**
   * 學生：作答開放中時彈幕有限制（只有答對的同學能送，這一題每人 3 則）。
   * limited 為 false 表示平常時間，不限則數。
   */
  danmakuQuota?: { limited: boolean; eligible: boolean; left: number };
}
export interface Dashboard {
  lessons: Lesson[];
  classes: Classroom[];
  sessions: Session[];
  /** 來自專案 content/lessons 的課程 ID。 */
  catalog?: string[];
}
export type AppMode = 'demo' | 'cloudflare' | 'supabase';
export interface AppConfig {
  mode: AppMode;
  aiConfigured: boolean;
  version: string;
  /** 教師帳號提示（只在 demo 模式提供預設值，正式模式不回傳）。 */
  teacherHint?: string;
}
/** 免費額度用量（設定頁）。Cloudflare 免費方案：儲存 5 GB、每天寫入 10 萬列。 */
export interface StorageUsageInfo {
  /** 這個部署模式有沒有用量資料（Supabase 模式沒有）。 */
  available: boolean;
  /** 課堂資料（課程、班級、作答、白板、批改）大小，位元組。 */
  dataBytes: number;
  /** 作答照片／手寫圖：張數與大約大小（位元組）。 */
  photos: number;
  photoBytes: number;
  /** 今天（UTC）大約寫入的列數。 */
  rowsToday: number;
  sessions: number;
  archived: number;
  limits: { storageBytes: number; rowsPerDay: number };
}
export interface AiSettings {
  /** 最近一次 AI 呼叫失敗的原因（沒有就省略）。 */
  lastError?: { at: number; path: string; message: string };
  configured: boolean;
  source: 'teacher' | 'env' | 'none';
  provider: string;
  baseUrl: string;
  model: string;
  keyHint: string;
  dailyLimit: number;
  usedToday: number;
}

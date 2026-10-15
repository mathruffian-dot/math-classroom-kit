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
  /** short／canvas：評量規準。 */
  rubric?: Rubric;
  /** canvas：畫布底圖。 */
  canvas?: 'blank' | 'grid' | 'axes' | 'dots';
  /** canvas：是否允許拍照上傳作答（預設允許）。 */
  allowPhoto?: boolean;
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
export interface Slide {
  id: string;
  title: string;
  eyebrow?: string;
  body: string;
  bullets?: string[];
  /** 本頁的認知設計標記，例如「提取練習」「工作範例」。 */
  phase?: string;
  visual?: 'balance' | 'steps' | 'cards' | 'bars';
  interactive?: Interactive;
  figures?: Figure[];
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
}
export interface Classroom {
  id: string;
  name: string;
  code: string;
  seats: number;
  createdAt: string;
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
export interface Grade {
  answerId: string;
  activityId: string;
  seat: number;
  mode: 'mock' | 'live' | 'teacher';
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
  id: string;
  classId: string;
  className: string;
  lessonId: string;
  title: string;
  createdAt: string;
  ended: boolean;
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
  roster?: { seat: number; lastSeen?: string }[];
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
export interface AiSettings {
  configured: boolean;
  source: 'teacher' | 'env' | 'none';
  provider: string;
  baseUrl: string;
  model: string;
  keyHint: string;
  dailyLimit: number;
  usedToday: number;
}

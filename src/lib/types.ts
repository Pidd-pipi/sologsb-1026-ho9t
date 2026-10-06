// 课程模板 / 班级方案两层模型的核心类型定义。
// 班级方案只保存相对模板的覆盖项（overrides），活动本体永远来自模板发布版本。

export type ActivityType = '音素' | '单词' | '句子' | '练习';
export type IssueLevel = 'error' | 'warning' | 'info';

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  content: string;
  phonemes: string[];
  dependencies: string[];
  difficulty: number;
  prompt: string;
  accessibility: string;
  duration: number;
  feedback: string;
}

export interface CourseMeta {
  title: string;
  level: string;
  ageRange: string;
  objective: string;
}

// 活动上允许被班级覆盖的字段
export type ActivityFieldKey =
  | 'type'
  | 'title'
  | 'content'
  | 'phonemes'
  | 'dependencies'
  | 'difficulty'
  | 'prompt'
  | 'accessibility'
  | 'duration'
  | 'feedback';

export type MetaFieldKey = keyof CourseMeta;
export type FieldKey = ActivityFieldKey | MetaFieldKey;
export type FieldValue = string | number | string[];

/** 同一字段两边都改时，先保留两份，等待老师裁决 */
export interface DualValue {
  local: FieldValue;
  remote: FieldValue;
}

export interface FieldOverride {
  value: FieldValue;
  /** 离线合并发现双方同改时的两份取值；未裁决前 value 先取本机值 */
  dual: DualValue | null;
  updatedAt: string;
}

/**
 * 单个模板活动的覆盖集合：
 * - fields 仅保存与模板不同的字段
 * - removed 表示本班停用该模板活动
 * - added 保存班级自建活动（模板中不存在，整对象由班级持有）
 */
export interface ActivityOverride {
  fields?: Partial<Record<ActivityFieldKey, FieldOverride>>;
  removed?: boolean;
  added?: Activity;
}

export interface OverrideMap {
  meta: Partial<Record<MetaFieldKey, FieldOverride>>;
  /** 键为模板活动 id（班级自建活动使用自己的新 id） */
  activities: Record<string, ActivityOverride>;
  /** 本班完整活动顺序；null 表示继承模板顺序，新增活动自动排到末尾 */
  order: string[] | null;
}

/** 模板升级 / 离线合并后需要老师人工处理的事项 */
export type PendingKind = 'activity-removed' | 'dependency-redirected' | 'field-conflict';

export interface PendingItem {
  id: string;
  kind: PendingKind;
  /** '__meta__' 表示课程级字段冲突 */
  activityId: string;
  activityTitle: string;
  field?: FieldKey;
  /** dependency-redirected：失效的旧依赖 id */
  dependencyId?: string;
  dependencyTitle?: string;
  /** activity-removed：被模板移除时的活动快照，可转为本班活动 */
  snapshot?: Activity;
  /** activity-removed：模板移除前本班在该活动上的字段覆盖（转为本班活动时带回） */
  keptFields?: ActivityOverride['fields'];
  /** field-conflict：同字段两边都改时保留的两份取值 */
  localValue?: FieldValue;
  remoteValue?: FieldValue;
  detail: string;
  createdAt: string;
}

export interface TemplateVersion {
  id: string;
  label: string;
  note: string;
  savedAt: string;
  meta: CourseMeta;
  activities: Activity[];
}

export interface CourseTemplate {
  id: string;
  /** 教研组正在编排、尚未发布的草稿，其他班级不受草稿影响 */
  draftMeta: CourseMeta;
  draftActivities: Activity[];
  draftNote: string;
  draftUpdatedAt: string;
  versions: TemplateVersion[];
  createdAt: string;
}

/** 升级处理失败时保留的班级草稿（保留已算好的结果，可重试或放弃） */
export interface UpgradeStage {
  targetVersionId: string;
  targetLabel: string;
  overrides: OverrideMap;
  pending: PendingItem[];
  error: string;
  createdAt: string;
}

export interface ClassPlan {
  id: string;
  className: string;
  templateId: string;
  /** 钉住的模板发布版本：模板继续升级不影响本班，直到老师主动升级 */
  templateVersionId: string;
  overrides: OverrideMap;
  pending: PendingItem[];
  upgradeStage: UpgradeStage | null;
  createdAt: string;
  updatedAt: string;
}

// ---- 断网平板编辑 ----

export type OfflineOpType =
  | 'set-field'
  | 'set-meta'
  | 'toggle-dependency'
  | 'move-activity'
  | 'hide-activity'
  | 'restore-activity'
  | 'add-activity'
  | 'delete-activity';

export interface OfflineOp {
  id: string;
  type: OfflineOpType;
  activityId?: string;
  field?: FieldKey;
  value?: FieldValue;
  checked?: boolean;
  dependencyId?: string;
  direction?: -1 | 1;
  activity?: Activity;
  at: string;
}

/** 断网期间的平板会话：进入时冻结基线，修改以操作队列形式保存 */
export interface OfflineState {
  planId: string;
  startedAt: string;
  baselineVersionId: string;
  baselineOverrides: OverrideMap;
  /** 模拟“他机/教研组服务器侧”的覆盖项修改（用于同字段两边改） */
  remoteOverridePatches: Record<string, FieldOverride>;
  /** 模拟断网期间教研组发布的新版本 id（到达服务器侧） */
  remoteVersionId: string | null;
  ops: OfflineOp[];
  mergeError: string | null;
}

export interface Workspace {
  schema: 2;
  templates: CourseTemplate[];
  plans: ClassPlan[];
  /** 非 null 表示当前有一台平板处于断网编辑会话 */
  offline: OfflineState | null;
  updatedAt: string;
}

// ---- 派生结果 ----

export interface EffectiveActivity extends Activity {
  source: 'template' | 'local';
  hidden: boolean;
  overriddenFields: ActivityFieldKey[];
  conflictFields: ActivityFieldKey[];
}

export interface EffectivePlan {
  meta: CourseMeta;
  overriddenMeta: MetaFieldKey[];
  conflictMeta: MetaFieldKey[];
  activities: EffectiveActivity[];
  templateVersion: TemplateVersion | null;
  templateMissing: boolean;
}

export interface Diagnostic {
  id: string;
  activityId: string;
  level: IssueLevel;
  category: string;
  title: string;
  detail: string;
  pendingId?: string;
}

export type DiffKind = 'added' | 'removed' | 'changed' | 'meta-changed';

export interface VersionDiff {
  id: string;
  title: string;
  kind: DiffKind;
  detail: string;
}

export interface DiffSnapshot {
  meta: CourseMeta;
  activities: Activity[];
}

export const FIELD_LABELS: Record<FieldKey, string> = {
  type: '类型',
  title: '标题',
  content: '内容',
  phonemes: '音素',
  dependencies: '依赖',
  difficulty: '难度',
  prompt: '教师提示语',
  accessibility: '无障碍说明',
  duration: '时长',
  feedback: '练习反馈',
  level: '课程等级',
  ageRange: '适用年龄',
  objective: '学习目标'
};

export const META_FIELDS: MetaFieldKey[] = ['title', 'level', 'ageRange', 'objective'];
export const ACTIVITY_FIELDS: ActivityFieldKey[] = [
  'type',
  'title',
  'content',
  'phonemes',
  'dependencies',
  'difficulty',
  'prompt',
  'accessibility',
  'duration',
  'feedback'
];

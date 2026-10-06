export type ActivityType = '音素' | '单词' | '句子' | '练习';

export const ACTIVITY_TYPES: ActivityType[] = ['音素', '单词', '句子', '练习'];

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

export type ActivityField =
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

export const ACTIVITY_FIELDS: ActivityField[] = [
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

export interface TemplateVersion {
  id: string;
  label: string;
  savedAt: string;
  note: string;
  activities: Activity[];
}

export interface Template {
  id: string;
  title: string;
  level: string;
  ageRange: string;
  objective: string;
  activities: Activity[];
  versions: TemplateVersion[];
  updatedAt: string;
}

export type PendingKind =
  | 'activity-removed'
  | 'field-conflict'
  | 'dependency-redirect'
  | 'dependency-missing';

export type Resolution = 'local' | 'template' | 'both' | 'remove' | 'dismiss';

export interface PendingItem {
  id: string;
  kind: PendingKind;
  activityId: string;
  activityTitle: string;
  field?: ActivityField;
  /** 失效依赖的 id（dependency-missing） */
  refId?: string;
  baseValue?: unknown;
  localValue?: unknown;
  templateValue?: unknown;
  message: string;
  resolution?: Resolution;
}

export interface ClassDraft {
  targetVersionId: string;
  overrides: Record<string, Partial<Activity>>;
  localActivities: Activity[];
  removedActivityIds: string[];
  order: string[];
  pendingItems: PendingItem[];
  savedAt: string;
  /** 处理失败时保留错误，草稿不丢失，可重试 */
  error?: string;
}

export interface ClassPlan {
  id: string;
  name: string;
  templateId: string;
  /** 方案基于哪一个模板版本快照 */
  baseVersionId: string;
  /** 仅保存相对模板版本的覆盖项 */
  overrides: Record<string, Partial<Activity>>;
  /** 班级自行新增的活动（模板中不存在） */
  localActivities: Activity[];
  /** 班级删除的模板活动 id */
  removedActivityIds: string[];
  /** 方案内活动的展示顺序（模板活动 + 本地活动的 id 序列） */
  order: string[];
  /** 上一次合并后未处理的事项 */
  pendingItems: PendingItem[];
  /** 升级模板时的合并草稿（含失败状态） */
  draft: ClassDraft | null;
  updatedAt: string;
}

export interface Diagnostic {
  id: string;
  activityId: string;
  level: 'error' | 'warning' | 'info';
  category: string;
  title: string;
  detail: string;
}

export interface VersionDiff {
  id: string;
  title: string;
  kind: 'added' | 'removed' | 'changed';
  detail: string;
}

export type ContextKind = 'template' | 'plan';

export interface EditingContext {
  kind: ContextKind;
  planId?: string | null;
}

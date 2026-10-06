import type {
  Activity,
  ActivityFieldKey,
  ClassPlan,
  CourseMeta,
  EffectiveActivity,
  EffectivePlan,
  FieldOverride,
  MetaFieldKey,
  OverrideMap,
  TemplateVersion,
  Workspace
} from './types';
import { ACTIVITY_FIELDS, META_FIELDS } from './types';
import { sameValue } from './utils';

export function findTemplate(workspace: Workspace, templateId: string) {
  return workspace.templates.find((item) => item.id === templateId) ?? null;
}

export function findVersion(workspace: Workspace, templateId: string, versionId: string): TemplateVersion | null {
  return findTemplate(workspace, templateId)?.versions.find((version) => version.id === versionId) ?? null;
}

export function planTemplate(workspace: Workspace, plan: ClassPlan) {
  return findTemplate(workspace, plan.templateId);
}

/** 模板缺失（极端数据错误）时仍给出可编辑的降级课程 */
function fallbackPlan(version: TemplateVersion | null): EffectivePlan {
  const meta: CourseMeta = version
    ? { ...version.meta }
    : { title: '模板缺失', level: '—', ageRange: '—', objective: '引用的课程模板已被删除，请联系教研组。' };
  return {
    meta,
    overriddenMeta: [],
    conflictMeta: [],
    activities: (version?.activities ?? []).map((activity) => toEffective(activity, {}, 'template', false)),
    templateVersion: version,
    templateMissing: !version
  };
}

function toEffective(
  base: Activity,
  fields: Partial<Record<ActivityFieldKey, FieldOverride>>,
  source: 'template' | 'local',
  hidden: boolean
): EffectiveActivity {
  const merged = { ...base };
  const overridden: ActivityFieldKey[] = [];
  const conflicts: ActivityFieldKey[] = [];
  for (const key of ACTIVITY_FIELDS) {
    const override = fields[key];
    if (!override) continue;
    if (override.dual) conflicts.push(key);
    overridden.push(key);
    (merged as Record<string, unknown>)[key] = override.value;
  }
  return { ...merged, source, hidden, overriddenFields: overridden, conflictFields: conflicts };
}

/**
 * 解析班级方案的有效课程（质量检查、路径预览、版本比较、复制都基于它）。
 * 覆盖项里与模板取值一致的字段会被视为“已回归模板”，不标为覆盖。
 */
export function resolvePlan(
  workspace: Workspace,
  plan: ClassPlan,
  overrides: OverrideMap = plan.overrides
): EffectivePlan {
  const version = findVersion(workspace, plan.templateId, plan.templateVersionId);
  if (!version) return fallbackPlan(null);

  const meta = { ...version.meta };
  const overriddenMeta: MetaFieldKey[] = [];
  const conflictMeta: MetaFieldKey[] = [];
  for (const key of META_FIELDS) {
    const override = overrides.meta[key];
    if (!override) continue;
    if (override.dual) conflictMeta.push(key);
    if (!sameValue(override.value, version.meta[key])) overriddenMeta.push(key);
    meta[key] = override.value as string;
  }

  const hiddenIds = new Set<string>();
  const local: EffectiveActivity[] = [];
  const byId = new Map<string, EffectiveActivity>();

  for (const activity of version.activities) {
    const override = overrides.activities[activity.id];
    const effective = toEffective(activity, override?.fields ?? {}, 'template', Boolean(override?.removed));
    byId.set(activity.id, effective);
    if (effective.hidden) hiddenIds.add(activity.id);
  }

  for (const [id, override] of Object.entries(overrides.activities)) {
    if (!override.added) continue;
    const fields = override.fields ?? {};
    const effective = toEffective(override.added, fields, 'local', Boolean(override.removed));
    byId.set(id, effective);
    if (effective.hidden) hiddenIds.add(id);
  }

  // 顺序：班级顺序优先；未排过的（模板新增）追加到末尾；已停用的活动不进入学习路径
  const templateOrder = version.activities.map((activity) => activity.id);
  const known = new Set(byId.keys());
  const order: string[] = [];
  for (const id of overrides.order ?? templateOrder) {
    if (known.has(id) && !order.includes(id)) order.push(id);
  }
  for (const id of templateOrder) {
    if (!order.includes(id)) order.push(id);
  }
  for (const id of known) {
    if (!order.includes(id)) order.push(id);
  }
  for (const id of order) local.push(byId.get(id)!);

  // 清理指向停用活动的依赖，避免学习路径出现失效引用
  for (const activity of local) {
    if (activity.dependencies.some((id) => hiddenIds.has(id))) {
      activity.dependencies = activity.dependencies.filter((id) => !hiddenIds.has(id));
    }
  }

  return { meta, overriddenMeta, conflictMeta, activities: local, templateVersion: version, templateMissing: false };
}

/** 某字段当前是否为本地覆盖（用于编辑器显示“覆盖 / 继承”角标与还原按钮） */
export function fieldState(
  plan: ClassPlan,
  activityId: string,
  field: ActivityFieldKey,
  base: Activity
): 'inherited' | 'overridden' | 'conflict' {
  const override = plan.overrides.activities[activityId]?.fields?.[field];
  if (!override) return 'inherited';
  if (override.dual) return 'conflict';
  return sameValue(override.value, base[field]) ? 'inherited' : 'overridden';
}

export function metaState(plan: ClassPlan, field: MetaFieldKey, base: CourseMeta): 'inherited' | 'overridden' | 'conflict' {
  const override = plan.overrides.meta[field];
  if (!override) return 'inherited';
  if (override.dual) return 'conflict';
  return sameValue(override.value, base[field]) ? 'inherited' : 'overridden';
}

/** 模板侧的原始活动（含版本内查找），供“依赖改向”等场景引用标题 */
export function activityTitle(workspace: Workspace, plan: ClassPlan, activityId: string): string {
  const version = findVersion(workspace, plan.templateId, plan.templateVersionId);
  return version?.activities.find((item) => item.id === activityId)?.title
    ?? Object.values(plan.overrides.activities).find((item) => item.added?.id === activityId)?.added?.title
    ?? activityId;
}

import type {
  Activity,
  ActivityFieldKey,
  ClassPlan,
  CourseTemplate,
  MetaFieldKey,
  OverrideMap,
  PendingItem,
  TemplateVersion
} from './types';
import { clone, now, uid } from './utils';

export interface UpgradeResult {
  overrides: OverrideMap;
  pending: PendingItem[];
}

/**
 * 计算班级方案升级到目标模板版本后的覆盖项与待处理事项。
 * 纯函数：不修改入参，失败时由上层保留返回结果作为班级草稿。
 */
export function computeUpgrade(template: CourseTemplate, plan: ClassPlan, target: TemplateVersion): UpgradeResult {
  const overrides = clone(plan.overrides);
  overrides.order = overrides.order ? [...overrides.order] : null;
  const pending: PendingItem[] = [];

  const oldVersion = template.versions.find((version) => version.id === plan.templateVersionId);
  const oldActivities = oldVersion?.activities ?? [];
  const oldById = new Map(oldActivities.map((activity) => [activity.id, activity]));
  const newIds = new Set(target.activities.map((activity) => activity.id));
  const newById = new Map(target.activities.map((activity) => [activity.id, activity]));

  // 1) 模板中被移除的活动
  for (const activity of oldActivities) {
    if (newIds.has(activity.id)) continue;
    const local = plan.overrides.activities[activity.id];
    // 班级自己停用的活动与模板移除一致：直接清理覆盖，无需待处理
    if (local?.removed) {
      delete overrides.activities[activity.id];
      continue;
    }
    // 班级自建活动（理论上 id 不会与模板撞车）直接保留
    if (local?.added) continue;
    // 记住班级在该活动上的字段覆盖，转为本班活动时继续生效
    const keptFields = local?.fields ? clone(local.fields) : undefined;
    pending.push({
      id: uid('pd'),
      kind: 'activity-removed',
      activityId: activity.id,
      activityTitle: activity.title,
      snapshot: clone(activity),
      keptFields,
      detail: `模板“${target.label}”已移除该活动${keptFields ? '（含本班本地覆盖）' : ''}，可转为本班活动继续使用，或跟随模板移除。`,
      createdAt: now()
    });
    delete overrides.activities[activity.id];
  }

  // 2) 依赖改向：旧依赖活动在新版消失，或模板改写了某活动的依赖
  const classDepsOverride = (activityId: string): string[] | null => {
    const raw = plan.overrides.activities[activityId]?.fields?.dependencies?.value;
    return Array.isArray(raw) ? raw : null;
  };

  for (const activity of target.activities) {
    const oldActivity = oldById.get(activity.id);
    if (!oldActivity) continue;
    const oldDeps = classDepsOverride(activity.id) ?? oldActivity.dependencies;
    const newDeps = activity.dependencies;
    const dropped = oldDeps.filter((dep) => !newDeps.includes(dep)).filter((dep) => !newIds.has(dep) || !newById.get(dep));
    for (const dep of dropped) {
      const depTitle = oldById.get(dep)?.title ?? dep;
      pending.push({
        id: uid('pd'),
        kind: 'dependency-redirected',
        activityId: activity.id,
        activityTitle: activity.title,
        dependencyId: dep,
        dependencyTitle: depTitle,
        detail: `模板“${target.label}”中“${activity.title}”不再依赖“${depTitle}”，新的前置为：${
          newDeps.map((id) => newById.get(id)?.title ?? id).join('、') || '无'
        }。请确认跟随模板，或保留旧依赖（将自动把旧活动补回本班）。`,
        createdAt: now()
      });
    }
    // 班级显式覆盖过依赖且仍引用了已删除活动：从覆盖中剪掉失效引用，保证路径可用
    const overridden = classDepsOverride(activity.id);
    if (overridden && overridden.some((dep) => !newIds.has(dep))) {
      const entry = overrides.activities[activity.id] ?? {};
      entry.fields = entry.fields ?? {};
      entry.fields.dependencies = {
        value: overridden.filter((dep) => newIds.has(dep)),
        dual: null,
        updatedAt: now()
      };
      overrides.activities[activity.id] = entry;
    }
  }

  // 3) 存活活动的字段覆盖（时长、说明、依赖等）原样保留；模板再升级也不会覆盖
  // 4) 顺序覆盖：移除已消失 id；模板新增活动稍后由 resolvePlan 自动追加到末尾
  if (overrides.order) {
    overrides.order = overrides.order.filter((id) => newIds.has(id) || Boolean(overrides.activities[id]?.added));
  }
  return { overrides, pending };
}

export type PendingAction = 'retain-local' | 'follow-template' | 'follow' | 'keep-dependency' | 'choose-local' | 'choose-remote' | 'inherit-template';

/**
 * 老师裁决一条待处理事项，返回新的覆盖项与待处理列表（纯函数）。
 */
export function resolvePending(
  template: CourseTemplate,
  plan: ClassPlan,
  stageOverrides: OverrideMap,
  pendingList: PendingItem[],
  pendingId: string,
  action: PendingAction,
  currentVersionId: string
): { overrides: OverrideMap; pending: PendingItem[] } {
  const overrides = clone(stageOverrides);
  overrides.order = overrides.order ? [...overrides.order] : null;
  const item = pendingList.find((pending) => pending.id === pendingId);
  if (!item) return { overrides, pending: pendingList };

  const drop = () => pendingList.filter((pending) => pending.id !== pendingId);

  if (item.kind === 'activity-removed' && item.snapshot) {
    if (action === 'retain-local') {
      const kept = (item as PendingItem & { keptFields?: OverrideMap['activities'][string]['fields'] }).keptFields;
      overrides.activities[item.activityId] = { added: clone(item.snapshot), fields: kept ? clone(kept) : undefined };
      if (!overrides.order) overrides.order = template.versions.find((v) => v.id === currentVersionId)?.activities.map((a) => a.id) ?? [];
      overrides.order = overrides.order.filter((id) => id !== item.activityId);
      overrides.order.push(item.activityId);
    }
    return { overrides, pending: drop() };
  }

  if (item.kind === 'dependency-redirected' && item.dependencyId) {
    if (action === 'keep-dependency') {
      // 把旧依赖活动补回本班（从模板任意历史版本里找回快照）
      const snapshot: Activity | undefined = template.versions
        .flatMap((version) => version.activities)
        .find((activity) => activity.id === item.dependencyId);
      if (snapshot && !overrides.activities[item.dependencyId]?.added) {
        overrides.activities[item.dependencyId] = { added: clone(snapshot) };
      }
      const entry = overrides.activities[item.activityId] ?? {};
      entry.fields = entry.fields ?? {};
      const current = currentActivities(template, currentVersionId, overrides);
      const currentDeps = Array.isArray(entry.fields.dependencies?.value)
        ? (entry.fields.dependencies!.value as string[])
        : current.find((activity) => activity.id === item.activityId)?.dependencies ?? [];
      entry.fields.dependencies = {
        value: [...new Set([...currentDeps, item.dependencyId])],
        dual: null,
        updatedAt: now()
      };
      overrides.activities[item.activityId] = entry;
    }
    return { overrides, pending: drop() };
  }

  if (item.kind === 'field-conflict' && item.field) {
    const isMeta = item.activityId === '__meta__';
    if (isMeta) {
      const key = item.field as MetaFieldKey;
      delete overrides.meta[key];
      if (action === 'choose-local' && item.localValue !== undefined) {
        overrides.meta[key] = { value: clone(item.localValue), dual: null, updatedAt: now() };
      } else if (action === 'choose-remote' && item.remoteValue !== undefined) {
        overrides.meta[key] = { value: clone(item.remoteValue), dual: null, updatedAt: now() };
      }
    } else {
      const key = item.field as ActivityFieldKey;
      const entry = overrides.activities[item.activityId] ?? {};
      entry.fields = entry.fields ?? {};
      delete entry.fields[key];
      if (action === 'choose-local' && item.localValue !== undefined) {
        entry.fields[key] = { value: clone(item.localValue), dual: null, updatedAt: now() };
      } else if (action === 'choose-remote' && item.remoteValue !== undefined) {
        entry.fields[key] = { value: clone(item.remoteValue), dual: null, updatedAt: now() };
      }
      if (Object.keys(entry.fields).length === 0 && !entry.added && !entry.removed) {
        delete overrides.activities[item.activityId];
      } else {
        overrides.activities[item.activityId] = entry;
      }
    }
    return { overrides, pending: drop() };
  }

  return { overrides, pending: drop() };
}

function currentActivities(template: CourseTemplate, versionId: string, overrides: OverrideMap): Activity[] {
  const version = template.versions.find((item) => item.id === versionId);
  const base = version ? [...version.activities] : [];
  for (const [id, entry] of Object.entries(overrides.activities)) {
    if (entry.added) base.push({ ...entry.added, id });
  }
  return base;
}

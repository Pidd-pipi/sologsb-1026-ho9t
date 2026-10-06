import type {
  Activity,
  ActivityField,
  ClassDraft,
  ClassPlan,
  PendingItem,
  Resolution,
  TemplateVersion,
  VersionDiff
} from './types';
import { ACTIVITY_FIELDS } from './types';
import { FIELD_LABELS, clone, deepEqual, nextId } from './fields';

/** 计算 current 相对 base 的最小覆盖项（按 id 匹配）。 */
export function computeOverrides(
  base: Activity[],
  current: Activity[]
): Record<string, Partial<Activity>> {
  const baseMap = new Map(base.map((activity) => [activity.id, activity]));
  const overrides: Record<string, Partial<Activity>> = {};
  for (const cur of current) {
    const baseActivity = baseMap.get(cur.id);
    if (!baseActivity) continue; // 班级本地新增活动单独存放
    const diff: Partial<Activity> = {};
    for (const field of ACTIVITY_FIELDS) {
      if (!deepEqual(baseActivity[field], cur[field])) {
        diff[field] = clone(cur[field]) as never;
      }
    }
    if (Object.keys(diff).length) overrides[cur.id] = diff;
  }
  return overrides;
}

/** 基于模板版本快照，应用班级覆盖项与本地活动，得到实际课程。 */
export function resolveActivities(
  base: Activity[],
  plan: Pick<ClassPlan, 'overrides' | 'localActivities' | 'removedActivityIds' | 'order'>
): Activity[] {
  const removed = new Set(plan.removedActivityIds);
  const resolved = base
    .filter((activity) => !removed.has(activity.id))
    .map((activity) => {
      const override = plan.overrides[activity.id];
      return override ? { ...activity, ...override } : { ...activity };
    });
  const locals = plan.localActivities.map((activity) => ({ ...activity }));
  const byId = new Map([...resolved, ...locals].map((activity) => [activity.id, activity]));
  const ordered: Activity[] = [];
  for (const id of plan.order) {
    const activity = byId.get(id);
    if (activity) ordered.push(activity);
  }
  // order 中未列出的活动（如模板新增）追加到末尾
  for (const activity of byId.values()) {
    if (!ordered.includes(activity)) ordered.push(activity);
  }
  return ordered;
}

/**
 * 三方合并：baseVersion（方案当前基线）、plan（本地覆盖）、targetVersion（新模板）。
 * 同一字段两边都改 → 保留两份，进入待处理，不丢任何一方。
 */
export function mergePlanToDraft(
  plan: ClassPlan,
  baseVersion: TemplateVersion,
  targetVersion: TemplateVersion
): ClassDraft {
  const baseMap = new Map(baseVersion.activities.map((activity) => [activity.id, activity]));
  const targetMap = new Map(targetVersion.activities.map((activity) => [activity.id, activity]));
  const mergedOverrides: Record<string, Partial<Activity>> = {};
  const pending: PendingItem[] = [];

  for (const targetActivity of targetVersion.activities) {
    const baseActivity = baseMap.get(targetActivity.id);
    const localOverride = plan.overrides[targetActivity.id];
    if (!baseActivity) continue; // 模板新增活动，本地不可能有覆盖
    const merged: Partial<Activity> = {};
    for (const field of ACTIVITY_FIELDS) {
      const baseValue = baseActivity[field];
      const targetValue = targetActivity[field];
      const localValue = localOverride?.[field];
      const localChanged = localValue !== undefined && !deepEqual(baseValue, localValue);
      const targetChanged = !deepEqual(baseValue, targetValue);
      if (localChanged && targetChanged) {
        pending.push({
          id: `conflict-${targetActivity.id}-${field}`,
          kind: field === 'dependencies' ? 'dependency-redirect' : 'field-conflict',
          activityId: targetActivity.id,
          activityTitle: targetActivity.title,
          field,
          baseValue: clone(baseValue),
          localValue: clone(localValue),
          templateValue: clone(targetValue),
          message:
            field === 'dependencies'
              ? `「${targetActivity.title}」的前置依赖在班级方案和模板中都被修改，已保留两份。`
              : `「${targetActivity.title}」的${FIELD_LABELS[field]}在本地和模板中都被修改，已保留两份。`
        });
        merged[field] = clone(localValue) as never; // 课程先采用本地值，等待老师决定
      } else if (localChanged) {
        merged[field] = clone(localValue) as never;
      }
      // 仅模板变化 → 不产生覆盖，直接采用新模板值
    }
    if (Object.keys(merged).length) mergedOverrides[targetActivity.id] = merged;
  }

  // 模板移除的活动：若班级有本地修改，列出待处理；无修改则随模板移除
  for (const baseActivity of baseVersion.activities) {
    if (!targetMap.has(baseActivity.id)) {
      const localOverride = plan.overrides[baseActivity.id];
      const hasLocalChanges = !!localOverride && Object.keys(localOverride).length > 0;
      if (hasLocalChanges) {
        pending.push({
          id: `removed-${baseActivity.id}`,
          kind: 'activity-removed',
          activityId: baseActivity.id,
          activityTitle: baseActivity.title,
          baseValue: clone(baseActivity),
          localValue: clone(localOverride),
          message: `模板已移除「${baseActivity.title}」，但班级方案保留了对它的本地修改。请决定保留本地版本或随模板移除。`
        });
        mergedOverrides[baseActivity.id] = clone(localOverride);
      }
    }
  }

  // 合并后检查依赖缺失（依赖改向/活动移除导致）
  const resolved = resolveActivities(targetVersion.activities, {
    overrides: mergedOverrides,
    localActivities: plan.localActivities,
    removedActivityIds: plan.removedActivityIds,
    order: mergeOrder(plan, baseVersion, targetVersion)
  });
  const ids = new Set(resolved.map((activity) => activity.id));
  for (const activity of resolved) {
    for (const dependency of activity.dependencies) {
      if (!ids.has(dependency)) {
        pending.push({
          id: `dep-missing-${activity.id}-${dependency}`,
          kind: 'dependency-missing',
          activityId: activity.id,
          activityTitle: activity.title,
          field: 'dependencies',
          refId: dependency,
          message: `「${activity.title}」依赖的活动已不存在，请移除失效依赖或重新选择前置活动。`
        });
      }
    }
  }

  return {
    targetVersionId: targetVersion.id,
    overrides: mergedOverrides,
    localActivities: clone(plan.localActivities),
    removedActivityIds: clone(plan.removedActivityIds),
    order: mergeOrder(plan, baseVersion, targetVersion),
    pendingItems: pending,
    savedAt: new Date().toISOString()
  };
}

/** 合并顺序：保留方案已有顺序，移除已删活动，模板新增活动追加到末尾。 */
function mergeOrder(
  plan: ClassPlan,
  baseVersion: TemplateVersion,
  targetVersion: TemplateVersion
): string[] {
  const removed = new Set(plan.removedActivityIds);
  const baseIds = new Set(baseVersion.activities.map((activity) => activity.id));
  const targetIds = new Set(targetVersion.activities.map((activity) => activity.id));
  const order: string[] = [];
  for (const id of plan.order) {
    if (removed.has(id)) continue;
    if (baseIds.has(id) && !targetIds.has(id)) continue; // 模板已移除
    order.push(id);
  }
  for (const activity of targetVersion.activities) {
    if (!order.includes(activity.id) && !removed.has(activity.id)) order.push(activity.id);
  }
  for (const activity of plan.localActivities) {
    if (!order.includes(activity.id)) order.push(activity.id);
  }
  return order;
}

/**
 * 对待处理事项应用老师的决定，返回新草稿。
 * - field-conflict / dependency-redirect：local / template / both（保留两份，继续待处理）
 * - activity-removed：local（保留为班级本地活动）/ remove（随模板移除）
 * - dependency-missing：dismiss（移除失效依赖）
 */
export function resolveDraft(
  draft: ClassDraft,
  resolutions: Record<string, Resolution>,
  targetVersion: TemplateVersion
): ClassDraft {
  const next: ClassDraft = {
    ...clone(draft),
    overrides: clone(draft.overrides),
    localActivities: clone(draft.localActivities),
    removedActivityIds: clone(draft.removedActivityIds),
    order: clone(draft.order),
    pendingItems: []
  };
  const targetMap = new Map(targetVersion.activities.map((activity) => [activity.id, activity]));

  for (const item of draft.pendingItems) {
    const resolution = resolutions[item.id] ?? item.resolution;
    if (
      (item.kind === 'field-conflict' || item.kind === 'dependency-redirect') &&
      item.field
    ) {
      if (resolution === 'local') {
        // 采用本地值：覆盖项已保留，冲突解决，清除该事项
        item.resolution = 'local';
      } else if (resolution === 'template') {
        const override = next.overrides[item.activityId];
        if (override) {
          delete override[item.field];
          if (Object.keys(override).length === 0) delete next.overrides[item.activityId];
        }
        item.resolution = 'template';
      } else if (resolution === 'both') {
        item.resolution = 'both';
        next.pendingItems.push(item); // 两份都留着，暂不决定
      } else {
        next.pendingItems.push(item);
      }
    } else if (item.kind === 'activity-removed') {
      if (resolution === 'remove') {
        delete next.overrides[item.activityId];
        if (!next.removedActivityIds.includes(item.activityId)) {
          next.removedActivityIds.push(item.activityId);
        }
        item.resolution = 'remove';
      } else if (resolution === 'local') {
        // 以基线活动为底、本地覆盖为差异，提升为班级本地活动
        const baseActivity = item.baseValue as Activity | undefined;
        const localOverride = item.localValue as Partial<Activity> | undefined;
        if (baseActivity) {
          const full: Activity = { ...clone(baseActivity), ...clone(localOverride ?? {}) };
          if (!next.localActivities.some((activity) => activity.id === full.id)) {
            next.localActivities.push(full);
          }
        }
        delete next.overrides[item.activityId];
        item.resolution = 'local';
      } else {
        next.pendingItems.push(item);
      }
    } else if (item.kind === 'dependency-missing') {
      if (resolution === 'dismiss' && item.refId) {
        const targetActivity = targetMap.get(item.activityId);
        const override = next.overrides[item.activityId] ?? {};
        const currentDeps =
          (override.dependencies as string[] | undefined) ??
          targetActivity?.dependencies ??
          [];
        override.dependencies = currentDeps.filter((dep) => dep !== item.refId);
        next.overrides[item.activityId] = override;
        item.resolution = 'dismiss';
      } else {
        next.pendingItems.push(item);
      }
    } else {
      next.pendingItems.push(item);
    }
  }

  next.savedAt = new Date().toISOString();
  return next;
}

/** 校验草稿是否可以应用：存在未决的硬性冲突则阻止。 */
export function validateDraft(draft: ClassDraft): string | null {
  const blocking = draft.pendingItems.filter(
    (item) =>
      (item.kind === 'field-conflict' ||
        item.kind === 'dependency-redirect' ||
        item.kind === 'activity-removed' ||
        item.kind === 'dependency-missing') &&
      item.resolution !== 'both' &&
      item.resolution !== 'local'
  );
  if (blocking.length) {
    return `还有 ${blocking.length} 项待处理未决定，请先处理或选择“保留两份”。`;
  }
  return null;
}

/** 比较两个活动列表的增删与字段变化（用于版本比较 / 升级预览）。 */
export function diffActivities(base: Activity[], target: Activity[]): VersionDiff[] {
  const rows: VersionDiff[] = [];
  const baseMap = new Map(base.map((activity) => [activity.id, activity]));
  const targetMap = new Map(target.map((activity) => [activity.id, activity]));
  for (const activity of base) {
    if (!targetMap.has(activity.id)) {
      rows.push({
        id: activity.id,
        title: activity.title,
        kind: 'removed',
        detail: '目标版本已删除该活动'
      });
    }
  }
  for (const activity of target) {
    const before = baseMap.get(activity.id);
    if (!before) {
      rows.push({
        id: activity.id,
        title: activity.title,
        kind: 'added',
        detail: `${activity.type} · ${activity.duration} 分钟`
      });
      continue;
    }
    const fields: string[] = [];
    for (const field of ACTIVITY_FIELDS) {
      if (!deepEqual(before[field], activity[field])) fields.push(FIELD_LABELS[field]);
    }
    if (fields.length) {
      rows.push({
        id: activity.id,
        title: activity.title,
        kind: 'changed',
        detail: `变化字段：${fields.join('、')}`
      });
    }
  }
  return rows;
}

export function createId(prefix: string): string {
  return nextId(prefix);
}

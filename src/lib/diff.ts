import type {
  Activity,
  ActivityFieldKey,
  CourseMeta,
  DiffSnapshot,
  MetaFieldKey,
  VersionDiff
} from './types';
import { FIELD_LABELS, META_FIELDS, ACTIVITY_FIELDS } from './types';

/**
 * 比较两份课程快照。
 * 快照可以来自：模板发布版本 / 班级有效方案（模板+覆盖重算结果）/ 班级升级草稿。
 * 因此模板或依赖一变化，版本比较立即按班级方案重算。
 */
export function diffSnapshots(base: DiffSnapshot, target: DiffSnapshot): VersionDiff[] {
  const rows: VersionDiff[] = [];

  for (const field of META_FIELDS) {
    if (base.meta[field] !== target.meta[field]) {
      rows.push({
        id: `meta-${field}`,
        title: `课程信息 · ${FIELD_LABELS[field as MetaFieldKey]}`,
        kind: 'meta-changed',
        detail: `「${base.meta[field]}」 → 「${target.meta[field]}」`
      });
    }
  }

  const baseMap = new Map(base.activities.map((activity) => [activity.id, activity]));
  const targetMap = new Map(target.activities.map((activity) => [activity.id, activity]));

  for (const activity of base.activities) {
    if (!targetMap.has(activity.id)) {
      rows.push({
        id: activity.id,
        title: activity.title,
        kind: 'removed',
        detail: `目标中已删除该${activity.type}活动`
      });
    }
  }

  for (const activity of target.activities) {
    const before = baseMap.get(activity.id);
    if (!before) {
      rows.push({
        id: activity.id,
        title: activity.title,
        kind: 'added',
        detail: `${activity.type} · ${activity.duration} 分钟 · 班级${isLocal(activity) ? '自建' : ''}活动`
      });
      continue;
    }
    const fields: string[] = [];
    for (const field of ACTIVITY_FIELDS) {
      const left = before[field as keyof Activity];
      const right = activity[field as keyof Activity];
      if (Array.isArray(left) || Array.isArray(right)) {
        if (JSON.stringify(left) !== JSON.stringify(right)) fields.push(FIELD_LABELS[field as ActivityFieldKey]);
      } else if (left !== right) {
        fields.push(FIELD_LABELS[field as ActivityFieldKey]);
      }
    }
    const beforeIndex = base.activities.findIndex((item) => item.id === activity.id);
    const afterIndex = target.activities.findIndex((item) => item.id === activity.id);
    if (beforeIndex !== afterIndex) fields.push('顺序');
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

function isLocal(activity: Activity & { source?: string }): boolean {
  return activity.source === 'local';
}

export function snapshotOf(meta: CourseMeta, activities: Activity[]): DiffSnapshot {
  return { meta: { ...meta }, activities: activities.map((activity) => ({ ...activity, phonemes: [...activity.phonemes], dependencies: [...activity.dependencies] })) };
}

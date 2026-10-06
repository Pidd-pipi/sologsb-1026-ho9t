import type {
  Diagnostic,
  EffectiveActivity,
  EffectivePlan,
  FieldKey,
  PendingItem,
  TemplateVersion
} from './types';
import { FIELD_LABELS } from './types';

const confusablePairs: Array<[string, string]> = [
  ['/b/', '/p/'],
  ['/d/', '/t/'],
  ['/f/', '/v/'],
  ['/m/', '/n/'],
  ['/ɪ/', '/iː/'],
  ['/æ/', '/e/']
];

function valueText(value: string | number | string[] | undefined): string {
  if (value === undefined) return '—';
  return Array.isArray(value) ? value.join('、') || '（空）' : String(value);
}

/** 待处理事项转成质量检查里的阻断项，处理完自动消失（因为一切都按方案重算） */
export function pendingDiagnostics(pending: PendingItem[]): Diagnostic[] {
  return pending.map((item) => {
    if (item.kind === 'activity-removed') {
      return {
        id: `pending-${item.id}`,
        activityId: item.activityId,
        level: 'error',
        category: '模板升级',
        title: `待处理：模板移除了“${item.activityTitle}”`,
        detail: item.detail,
        pendingId: item.id
      };
    }
    if (item.kind === 'dependency-redirected') {
      return {
        id: `pending-${item.id}`,
        activityId: item.activityId,
        level: 'error',
        category: '依赖改向',
        title: `待处理：“${item.activityTitle}”的前置“${item.dependencyTitle}”已改向`,
        detail: item.detail,
        pendingId: item.id
      };
    }
    const field = (item.field ? FIELD_LABELS[item.field as FieldKey] : '') ?? '';
    return {
      id: `pending-${item.id}`,
      activityId: item.activityId === '__meta__' ? '' : item.activityId,
      level: 'error',
      category: '双方修改',
      title: `待裁决：“${item.activityTitle}”的${field}有两份取值`,
      detail: `${item.detail} 平板值：${valueText(item.localValue)}；教研组侧：${valueText(item.remoteValue)}。`,
      pendingId: item.id
    };
  });
}

/** 对解析后的有效课程做质量检查（模板草稿 / 任意班级方案均可） */
export function analyze(
  plan: EffectivePlan,
  activities: EffectiveActivity[],
  pending: PendingItem[] = []
): Diagnostic[] {
  const visible = activities.filter((activity) => !activity.hidden);
  const issues: Diagnostic[] = pendingDiagnostics(pending);
  const learned = new Set<string>();
  const seenPhonemes: Array<{ activity: EffectiveActivity; phoneme: string }> = [];

  visible.forEach((activity, index) => {
    activity.phonemes.forEach((phoneme) => {
      if (!learned.has(phoneme) && activity.type !== '音素') {
        issues.push({
          id: `early-${activity.id}-${phoneme}`,
          activityId: activity.id,
          level: 'error',
          category: '前置知识',
          title: `${activity.title} 提前使用 ${phoneme}`,
          detail: `第 ${index + 1} 个活动中使用了尚未单独教学的音素。请增加前置音素活动或调整顺序。`
        });
      }
      if (activity.type === '音素') learned.add(phoneme);
      seenPhonemes.push({ activity, phoneme });
    });

    if (activity.type === '句子') {
      const words = activity.content.trim().split(/\s+/).filter(Boolean);
      if (words.length > 12) {
        issues.push({
          id: `long-${activity.id}`,
          activityId: activity.id,
          level: 'warning',
          category: '例句长度',
          title: `${activity.title} 包含 ${words.length} 个单词`,
          detail: '启蒙阶段建议控制在 12 个单词以内，或拆成两个意群。'
        });
      }
    }

    if (activity.type === '练习' && !activity.feedback.trim()) {
      issues.push({
        id: `feedback-${activity.id}`,
        activityId: activity.id,
        level: 'error',
        category: '练习反馈',
        title: `${activity.title} 缺少反馈`,
        detail: '答对或答错后需要给出可理解、可行动的学习反馈。'
      });
    }

    if (!activity.accessibility.trim()) {
      issues.push({
        id: `a11y-${activity.id}`,
        activityId: activity.id,
        level: 'error',
        category: '无障碍说明',
        title: `${activity.title} 缺少无障碍说明`,
        detail: '请说明视觉、听觉、运动或认知支持方式。'
      });
    }

    activity.dependencies.forEach((dependency) => {
      if (!visible.some((item) => item.id === dependency)) {
        issues.push({
          id: `missing-dep-${activity.id}-${dependency}`,
          activityId: activity.id,
          level: 'error',
          category: '依赖缺失',
          title: `${activity.title} 的依赖已不存在`,
          detail: '该活动引用了已停用或已删除的前置活动，请移除失效依赖或重新选择。'
        });
      } else if (visible.findIndex((item) => item.id === dependency) > visible.findIndex((item) => item.id === activity.id)) {
        issues.push({
          id: `forward-dep-${activity.id}-${dependency}`,
          activityId: activity.id,
          level: 'warning',
          category: '依赖顺序',
          title: `${activity.title} 的前置排在它后面`,
          detail: '前置活动应排在当前活动之前，否则学习路径会先遇到依赖项。'
        });
      }
    });
  });

  confusablePairs.forEach(([left, right]) => {
    const leftActivity = seenPhonemes.find((item) => item.phoneme === left)?.activity;
    const rightActivity = seenPhonemes.find((item) => item.phoneme === right)?.activity;
    if (leftActivity && rightActivity) {
      issues.push({
        id: `confusable-${left}-${right}`,
        activityId: rightActivity.id,
        level: 'info',
        category: '相似音',
        title: `${left} 与 ${right} 可能混淆`,
        detail: `建议在“${leftActivity.title}”和“${rightActivity.title}”之间加入口型对比或辨音练习。`
      });
    }
  });

  const cycle = findDependencyCycle(visible);
  if (cycle) {
    issues.push({
      id: 'cycle',
      activityId: cycle[0],
      level: 'error',
      category: '依赖关系',
      title: '活动依赖形成循环',
      detail: cycle.map((id) => visible.find((item) => item.id === id)?.title ?? id).join(' → ')
    });
  }

  if (plan.templateMissing) {
    issues.push({
      id: 'template-missing',
      activityId: '',
      level: 'error',
      category: '模板缺失',
      title: '班级方案引用的模板或版本不存在',
      detail: '教研组可能已删除该模板。本班覆盖项仍保留，请复制为独立课程或重新绑定模板。'
    });
  }

  return issues;
}

function findDependencyCycle(activities: EffectiveActivity[]): string[] | null {
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  let cycle: string[] = [];
  const visit = (id: string, path: string[]): boolean => {
    if (visiting.has(id)) {
      cycle = [...path.slice(path.indexOf(id)), id];
      return true;
    }
    if (visited.has(id)) return false;
    visiting.add(id);
    const activity = byId.get(id);
    for (const dependency of activity?.dependencies ?? []) {
      if (visit(dependency, [...path, dependency])) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const activity of activities) {
    if (visit(activity.id, [activity.id])) break;
  }
  return cycle.length ? cycle : null;
}

export function snapshotFromVersion(version: TemplateVersion) {
  return { meta: version.meta, activities: version.activities };
}

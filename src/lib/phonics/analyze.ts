import type { Activity, Diagnostic } from './types';

const confusablePairs: Array<[string, string]> = [
  ['/b/', '/p/'],
  ['/d/', '/t/'],
  ['/f/', '/v/'],
  ['/m/', '/n/'],
  ['/ɪ/', '/iː/'],
  ['/æ/', '/e/']
];

export function analyzeCourse(activities: Activity[]): Diagnostic[] {
  const issues: Diagnostic[] = [];
  const learned = new Set<string>();
  const seenPhonemes: Array<{ activity: Activity; phoneme: string }> = [];

  activities.forEach((activity, index) => {
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
      if (!activities.some((item) => item.id === dependency)) {
        issues.push({
          id: `missing-dep-${activity.id}-${dependency}`,
          activityId: activity.id,
          level: 'error',
          category: '依赖缺失',
          title: `${activity.title} 的依赖已不存在`,
          detail: '请移除失效依赖或重新选择前置活动。'
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

  const cycle = findDependencyCycle(activities);
  if (cycle) {
    issues.push({
      id: 'cycle',
      activityId: cycle[0],
      level: 'error',
      category: '依赖关系',
      title: '活动依赖形成循环',
      detail: cycle.join(' → ')
    });
  }
  return issues;
}

export function findDependencyCycle(activities: Activity[]): string[] | null {
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

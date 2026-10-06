import type { Activity, ActivityField, ActivityType } from './types';

export const FIELD_LABELS: Record<ActivityField, string> = {
  type: '活动类型',
  title: '标题',
  content: '内容',
  phonemes: '涉及音素',
  dependencies: '前置依赖',
  difficulty: '难度',
  prompt: '教师提示语',
  accessibility: '无障碍说明',
  duration: '时长',
  feedback: '学习反馈'
};

export function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function emptyActivity(type: ActivityType = '练习'): Activity {
  return {
    id: nextId('a'),
    type,
    title: `新的${type}活动`,
    content: '',
    phonemes: [],
    dependencies: [],
    difficulty: 1,
    prompt: '请输入教师提示语。',
    accessibility: '请描述视觉、听觉或键盘无障碍支持。',
    duration: type === '练习' ? 10 : 8,
    feedback: ''
  };
}

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

export function activityIcon(type: ActivityType): string {
  return type === '音素'
    ? 'ear'
    : type === '单词'
      ? 'text-font'
      : type === '句子'
        ? 'text-align-left'
        : 'game-console';
}

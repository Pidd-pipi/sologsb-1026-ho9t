import type { FieldValue, Workspace } from './types';

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function sameValue(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    return left.length === right.length && left.every((item, index) => item === right[index]);
  }
  return a === b;
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

export function totalDuration(activities: { duration: number }[]): number {
  return activities.reduce((sum, activity) => sum + activity.duration, 0);
}

/** 迁移旧版本 localStorage；无数据时回落到内置教研组模板 */
export function migrateWorkspace(raw: unknown): Workspace {
  if (!raw || typeof raw !== 'object') return seedWorkspace();
  const value = raw as Partial<Workspace>;
  if (value.schema !== 2 || !Array.isArray(value.templates) || !Array.isArray(value.plans)) {
    return seedWorkspace();
  }
  for (const plan of value.plans) {
    plan.pending ??= [];
    plan.upgradeStage ??= null;
    plan.overrides.meta ??= {};
    plan.overrides.activities ??= {};
    plan.overrides.order ??= null;
  }
  value.offline ??= null;
  return value as Workspace;
}

import { seedWorkspace } from './seed';

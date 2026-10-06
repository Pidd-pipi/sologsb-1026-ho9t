import { writable } from 'svelte/store';

export type Scope = 'template' | 'plan';
export type ViewId = 'compose' | 'path' | 'issues' | 'versions';
export type PreviewWidth = 'phone' | 'tablet' | 'desktop';

interface UiState {
  scope: Scope;
  templateId: string;
  planId: string;
  view: ViewId;
  templateActivityId: string;
  planActivityId: string;
  previewWidth: PreviewWidth;
  // 版本比较选择
  templateBaseVersionId: string;
  templateTargetVersionId: string;
  planCompareBase: string; // ''=当前模板版本, 'stage'=升级草稿, 或 version id
  planCompareTarget: string;
  // 演示开关
  simulatePublishFail: boolean;
  simulateUpgradeFail: boolean;
  simulateMergeFail: boolean;
  // 全局提示条
  toast: { id: number; kind: 'success' | 'error' | 'info'; title: string; subtitle?: string } | null;
}

const initial: UiState = {
  scope: 'plan',
  templateId: 'tpl-a',
  planId: 'p-1',
  view: 'compose',
  templateActivityId: 'a-1',
  planActivityId: 'a-1',
  previewWidth: 'desktop',
  templateBaseVersionId: 'v-t1',
  templateTargetVersionId: 'v-t2',
  planCompareBase: '',
  planCompareTarget: 'plan',
  simulatePublishFail: false,
  simulateUpgradeFail: false,
  simulateMergeFail: false,
  toast: null
};

export const ui = writable<UiState>(initial);

let toastSeq = 0;
export function notify(kind: 'success' | 'error' | 'info', title: string, subtitle?: string): void {
  toastSeq += 1;
  ui.update((state) => ({ ...state, toast: { id: toastSeq, kind, title, subtitle } }));
}

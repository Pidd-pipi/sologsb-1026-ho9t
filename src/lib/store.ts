import { writable } from 'svelte/store';
import type {
  Activity,
  ActivityFieldKey,
  ActivityType,
  ClassPlan,
  CourseTemplate,
  FieldValue,
  MetaFieldKey,
  OfflineOp,
  OfflineOpType,
  OverrideMap,
  TemplateVersion,
  Workspace
} from './types';
import { clone, migrateWorkspace, now, sameValue, uid } from './utils';
import { findTemplate, findVersion } from './resolve';
import { computeUpgrade, resolvePending, type PendingAction } from './upgrade';
import { mergeOffline, remotePatchKey, replayOps } from './offline';

const STORAGE_KEY = 'sologsb-1026-phonics-workspace-v2';
const HISTORY_LIMIT = 60;

function load(): Workspace {
  if (typeof localStorage === 'undefined') return migrateWorkspace(null);
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return migrateWorkspace(null);
  try {
    return migrateWorkspace(JSON.parse(raw));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return migrateWorkspace(null);
  }
}

const initial = load();
const { subscribe, set, update } = writable<Workspace>(initial);
let hydrated = false;

if (typeof localStorage !== 'undefined') hydrated = true;
subscribe((workspace) => {
  if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
});

// ---- 撤销 / 重做 ----
let past: Workspace[] = [];
let future: Workspace[] = [];
const historyStore = writable({ canUndo: false, canRedo: false });

function refreshHistory(): void {
  historyStore.set({ canUndo: past.length > 0, canRedo: future.length > 0 });
}

function act(recipe: (draft: Workspace) => void, mergeIntoHistory = true): void {
  update((workspace) => {
    if (mergeIntoHistory) {
      past = [...past.slice(-(HISTORY_LIMIT - 1)), clone(workspace)];
      future = [];
    }
    const draft = clone(workspace);
    recipe(draft);
    draft.updatedAt = now();
    return draft;
  });
  refreshHistory();
}

function undoState(): void {
  if (!past.length) return;
  update((workspace) => {
    const previous = past[past.length - 1];
    past = past.slice(0, -1);
    future = [clone(workspace), ...future].slice(0, HISTORY_LIMIT);
    return previous;
  });
  refreshHistory();
}

function redoState(): void {
  if (!future.length) return;
  update((workspace) => {
    const next = future[0];
    future = future.slice(1);
    past = [...past, clone(workspace)].slice(-HISTORY_LIMIT);
    return next;
  });
  refreshHistory();
}

// ---- 选择器辅助 ----

function mutatePlan(draft: Workspace, planId: string, recipe: (plan: ClassPlan) => void): void {
  const plan = draft.plans.find((item) => item.id === planId);
  if (plan) recipe(plan);
}

function mutateTemplate(draft: Workspace, templateId: string, recipe: (template: CourseTemplate) => void): void {
  const template = draft.templates.find((item) => item.id === templateId);
  if (template) recipe(template);
}

function isOfflineEditing(workspace: Workspace, planId: string): boolean {
  return workspace.offline?.planId === planId;
}

function baseActivityFor(workspace: Workspace, plan: ClassPlan, activityId: string): Activity | undefined {
  const version = findVersion(workspace, plan.templateId, plan.templateVersionId);
  return version?.activities.find((activity) => activity.id === activityId) ?? plan.overrides.activities[activityId]?.added;
}

// ---- 教研组模板：草稿编辑 ----

function editTemplateMeta(templateId: string, field: MetaFieldKey, value: string): void {
  act((draft) => mutateTemplate(draft, templateId, (template) => { template.draftMeta[field] = value; template.draftUpdatedAt = now(); }));
}

function editDraftNote(templateId: string, note: string): void {
  act((draft) => mutateTemplate(draft, templateId, (template) => { template.draftNote = note; }));
}

function editTemplateActivity(templateId: string, activityId: string, field: ActivityFieldKey, value: FieldValue): void {
  act((draft) => mutateTemplate(draft, templateId, (template) => {
    const target = template.draftActivities.find((activity) => activity.id === activityId);
    if (target) {
      (target as unknown as Record<string, unknown>)[field] = value;
      template.draftUpdatedAt = now();
    }
  }));
}

function addTemplateActivity(templateId: string, type: ActivityType): string {
  const id = uid('a');
  act((draft) => mutateTemplate(draft, templateId, (template) => {
    template.draftActivities.push(blankActivity(id, type));
    template.draftUpdatedAt = now();
  }));
  return id;
}

function deleteTemplateActivity(templateId: string, activityId: string): void {
  act((draft) => mutateTemplate(draft, templateId, (template) => {
    template.draftActivities = template.draftActivities.filter((activity) => activity.id !== activityId);
    template.draftActivities.forEach((activity) => {
      activity.dependencies = activity.dependencies.filter((dep) => dep !== activityId);
    });
    template.draftUpdatedAt = now();
  }));
}

function duplicateTemplateActivity(templateId: string, activityId: string): string {
  const id = uid('a');
  act((draft) => mutateTemplate(draft, templateId, (template) => {
    const index = template.draftActivities.findIndex((activity) => activity.id === activityId);
    if (index < 0) return;
    const copy: Activity = { ...clone(template.draftActivities[index]), id, title: `${template.draftActivities[index].title}（副本）`, dependencies: [...template.draftActivities[index].dependencies] };
    template.draftActivities.splice(index + 1, 0, copy);
  }));
  return id;
}

function moveTemplateActivity(templateId: string, activityId: string, direction: -1 | 1): void {
  act((draft) => mutateTemplate(draft, templateId, (template) => {
    moveInArray(template.draftActivities, activityId, direction);
  }));
}

function toggleTemplateDependency(templateId: string, activityId: string, dependencyId: string, checked: boolean): void {
  act((draft) => mutateTemplate(draft, templateId, (template) => {
    const target = template.draftActivities.find((activity) => activity.id === activityId);
    if (!target) return;
    target.dependencies = checked
      ? [...new Set([...target.dependencies, dependencyId])]
      : target.dependencies.filter((dep) => dep !== dependencyId);
  }));
}

/** 教研组发布新版本：已发布版本不可变，其他班级继续钉在旧版本上不受影响 */
function publishTemplate(templateId: string, label: string, note: string, fail: boolean): { ok: boolean; error?: string; versionId?: string } {
  let result: { ok: boolean; error?: string; versionId?: string } = { ok: true };
  act((draft) => mutateTemplate(draft, templateId, (template) => {
    if (fail) {
      result = { ok: false, error: '发布失败：无法连接教研组服务器（模拟）。草稿已保留，可改后重试。' };
      return;
    }
    const versionId = uid('v');
    const version: TemplateVersion = {
      id: versionId,
      label: label.trim() || `版本 ${template.versions.length + 1}`,
      note: note.trim(),
      savedAt: now(),
      meta: clone(template.draftMeta),
      activities: clone(template.draftActivities)
    };
    template.versions.push(version);
    result = { ok: true, versionId };
  }));
  return result;
}

function resetDraftToVersion(templateId: string, versionId: string): void {
  act((draft) => mutateTemplate(draft, templateId, (template) => {
    const version = template.versions.find((item) => item.id === versionId);
    if (!version) return;
    template.draftMeta = clone(version.meta);
    template.draftActivities = clone(version.activities);
    template.draftNote = '';
    template.draftUpdatedAt = now();
  }));
}

function createTemplate(): string {
  const id = uid('tpl');
  act((draft) => {
    const meta = { title: '未命名课程模板', level: '启蒙', ageRange: '5–6 岁', objective: '' };
    draft.templates.push({
      id,
      draftMeta: { ...meta },
      draftActivities: [blankActivity(uid('a'), '音素')],
      draftNote: '',
      draftUpdatedAt: now(),
      versions: [],
      createdAt: now()
    });
  });
  return id;
}

/** 复制模板：复制出全新模板与活动 id，不影响任何班级 */
function duplicateTemplate(templateId: string): string {
  const id = uid('tpl');
  act((draft) => {
    const source = draft.templates.find((item) => item.id === templateId);
    if (!source) return;
    const idMap = new Map<string, string>();
    const remap = (activities: Activity[]): Activity[] =>
      activities.map((activity) => {
        const newId = uid('a');
        idMap.set(activity.id, newId);
        return { ...clone(activity), id: newId, dependencies: [...activity.dependencies] };
      });
    const draftActivities = remap(source.draftActivities).map((activity) => ({
      ...activity,
      dependencies: activity.dependencies.map((dep) => idMap.get(dep) ?? dep)
    }));
    const versions = source.versions.map((version) => {
      idMap.clear();
      const activities = remap(version.activities).map((activity) => ({
        ...activity,
        dependencies: activity.dependencies.map((dep) => idMap.get(dep) ?? dep)
      }));
      return { ...clone(version), id: uid('v'), savedAt: version.savedAt, meta: clone(version.meta), activities };
    });
    draft.templates.push({
      id,
      draftMeta: { ...clone(source.draftMeta), title: `${source.draftMeta.title} · 模板副本` },
      draftActivities,
      draftNote: '',
      draftUpdatedAt: now(),
      versions,
      createdAt: now()
    });
  });
  return id;
}

// ---- 班级方案 ----

function createPlan(templateId: string, className: string, versionId?: string): string {
  const id = uid('p');
  act((draft) => {
    const template = findTemplate(draft, templateId);
    const version = versionId ? template?.versions.find((item) => item.id === versionId) : template?.versions.at(-1);
    draft.plans.push({
      id,
      className: className.trim() || `新班级 ${draft.plans.length + 1}`,
      templateId,
      templateVersionId: version?.id ?? '',
      overrides: { meta: {}, activities: {}, order: null },
      pending: [],
      upgradeStage: null,
      createdAt: now(),
      updatedAt: now()
    });
  });
  return id;
}

function renamePlan(planId: string, className: string): void {
  act((draft) => mutatePlan(draft, planId, (plan) => { plan.className = className; plan.updatedAt = now(); }));
}

/** 复制班级方案：复制结果是同模板、同版本上的一组全新覆盖项，并立即按方案重算 */
function duplicatePlan(planId: string): string {
  const id = uid('p');
  act((draft) => mutatePlan(draft, planId, (plan) => {
    draft.plans.push({
      ...clone(plan),
      id,
      className: `${plan.className} 副本`,
      pending: [],
      upgradeStage: null,
      createdAt: now(),
      updatedAt: now()
    });
  }));
  return id;
}

function setPlanMeta(planId: string, field: MetaFieldKey, value: string): void {
  queueOrApply(planId, { type: 'set-meta', field, value, at: now() }, (plan, workspace) => {
    const version = findVersion(workspace, plan.templateId, plan.templateVersionId);
    plan.overrides.meta[field] = { value, dual: null, updatedAt: now() };
    if (version && value === version.meta[field]) delete plan.overrides.meta[field];
    plan.updatedAt = now();
  });
}

function resetPlanMeta(planId: string, field: MetaFieldKey): void {
  act((draft) => mutatePlan(draft, planId, (plan) => {
    delete plan.overrides.meta[field];
    plan.pending = plan.pending.filter((item) => !(item.kind === 'field-conflict' && item.activityId === '__meta__' && item.field === field));
  }));
}

function setPlanActivityField(planId: string, activityId: string, field: ActivityFieldKey, value: FieldValue): void {
  queueOrApply(planId, { type: 'set-field', activityId, field, value, at: now() }, (plan, workspace) => {
    const base = baseActivityFor(workspace, plan, activityId);
    const entry = plan.overrides.activities[activityId] ?? (plan.overrides.activities[activityId] = {});
    entry.fields = entry.fields ?? {};
    entry.fields[field] = { value, dual: null, updatedAt: now() };
    if (base && sameValue(value, base[field])) delete entry.fields[field];
    // 与模板一致后清理空壳
    if (entry.fields && Object.keys(entry.fields).length === 0) delete entry.fields;
    if (!entry.fields && !entry.added && !entry.removed) delete plan.overrides.activities[activityId];
    plan.pending = plan.pending.filter((item) => !(item.kind === 'field-conflict' && item.activityId === activityId && item.field === field));
    plan.updatedAt = now();
  });
}

function resetPlanActivityField(planId: string, activityId: string, field: ActivityFieldKey): void {
  act((draft) => mutatePlan(draft, planId, (plan) => {
    const entry = plan.overrides.activities[activityId];
    if (entry?.fields) delete entry.fields[field];
    plan.pending = plan.pending.filter((item) => !(item.kind === 'field-conflict' && item.activityId === activityId && item.field === field));
  }));
}

function togglePlanDependency(planId: string, activityId: string, dependencyId: string, checked: boolean): void {
  let value: string[] = [];
  act((draft) => {
    const workspace = draft;
    const plan = draft.plans.find((item) => item.id === planId);
    if (!plan) return;
    if (isOfflineEditing(workspace, planId)) {
      pushOfflineOp(draft, { type: 'toggle-dependency', activityId, dependencyId, checked, at: now() });
      return;
    }
    const base = baseActivityFor(workspace, plan, activityId);
    const current = Array.isArray(plan.overrides.activities[activityId]?.fields?.dependencies?.value)
      ? (plan.overrides.activities[activityId]!.fields!.dependencies!.value as string[])
      : base?.dependencies ?? [];
    value = checked ? [...new Set([...current, dependencyId])] : current.filter((id) => id !== dependencyId);
    const entry = plan.overrides.activities[activityId] ?? (plan.overrides.activities[activityId] = {});
    entry.fields = entry.fields ?? {};
    entry.fields.dependencies = { value, dual: null, updatedAt: now() };
    if (base && JSON.stringify(value) === JSON.stringify(base.dependencies)) delete entry.fields.dependencies;
    if (!entry.fields && !entry.added && !entry.removed) delete plan.overrides.activities[activityId];
    plan.updatedAt = now();
  });
}

function movePlanActivity(planId: string, activityId: string, direction: -1 | 1): void {
  act((draft) => {
    const plan = draft.plans.find((item) => item.id === planId);
    if (!plan) return;
    if (isOfflineEditing(draft, planId)) {
      pushOfflineOp(draft, { type: 'move-activity', activityId, direction, at: now() });
      return;
    }
    const version = findVersion(draft, plan.templateId, plan.templateVersionId);
    if (!version) return;
    if (!plan.overrides.order) {
      plan.overrides.order = version.activities.map((activity) => activity.id);
      for (const id of Object.keys(plan.overrides.activities)) {
        if (plan.overrides.activities[id]?.added && !plan.overrides.order.includes(id)) plan.overrides.order.push(id);
      }
    }
    moveInArray(plan.overrides.order, activityId, direction);
    plan.updatedAt = now();
  });
}

function hidePlanActivity(planId: string, activityId: string): void {
  queueOrApply(planId, { type: 'hide-activity', activityId, at: now() }, (plan) => {
    const entry = plan.overrides.activities[activityId] ?? (plan.overrides.activities[activityId] = {});
    entry.removed = true;
  });
}

function restorePlanActivity(planId: string, activityId: string): void {
  queueOrApply(planId, { type: 'restore-activity', activityId, at: now() }, (plan) => {
    const entry = plan.overrides.activities[activityId];
    if (entry) delete entry.removed;
  });
}

function addPlanActivity(planId: string, type: ActivityType): string {
  const id = uid('p-a');
  const activity = blankActivity(id, type);
  act((draft) => {
    const plan = draft.plans.find((item) => item.id === planId);
    if (!plan) return;
    if (isOfflineEditing(draft, planId)) {
      pushOfflineOp(draft, { type: 'add-activity', activity, at: now() });
      return;
    }
    plan.overrides.activities[id] = { added: activity };
    plan.updatedAt = now();
  });
  return id;
}

function duplicatePlanActivity(planId: string, activityId: string): string {
  const id = uid('p-a');
  act((draft) => {
    const plan = draft.plans.find((item) => item.id === planId);
    if (!plan) return;
    const version = findVersion(draft, plan.templateId, plan.templateVersionId);
    const source = version?.activities.find((activity) => activity.id === activityId) ?? plan.overrides.activities[activityId]?.added;
    if (!source) return;
    const copy: Activity = { ...clone(source), id, title: `${source.title}（本班副本）`, dependencies: [...source.dependencies] };
    plan.overrides.activities[id] = { added: copy };
    if (!plan.overrides.order && version) {
      plan.overrides.order = version.activities.map((activity) => activity.id);
    }
    if (plan.overrides.order) {
      const index = plan.overrides.order.indexOf(activityId);
      plan.overrides.order.splice(index + 1, 0, id);
    }
    plan.updatedAt = now();
  });
  return id;
}

function deletePlanActivity(planId: string, activityId: string): void {
  act((draft) => {
    const plan = draft.plans.find((item) => item.id === planId);
    if (!plan) return;
    if (isOfflineEditing(draft, planId)) {
      pushOfflineOp(draft, { type: 'delete-activity', activityId, at: now() });
      return;
    }
    const entry = plan.overrides.activities[activityId];
    if (entry?.added) {
      delete plan.overrides.activities[activityId];
      if (plan.overrides.order) plan.overrides.order = plan.overrides.order.filter((id) => id !== activityId);
    } else if (entry) {
      entry.removed = true;
    }
    plan.updatedAt = now();
  });
}

/** 待处理事项裁决（在线方案直接生效；升级草稿写回草稿，重试提交时一并生效） */
function resolvePlanPending(planId: string, pendingId: string, action: PendingAction, inStage = false): void {
  act((draft) => {
    const plan = draft.plans.find((item) => item.id === planId);
    const template = plan && findTemplate(draft, plan.templateId);
    if (!plan || !template) return;
    if (inStage && plan.upgradeStage) {
      const result = resolvePending(
        template,
        plan,
        plan.upgradeStage.overrides,
        plan.upgradeStage.pending,
        pendingId,
        action,
        plan.upgradeStage.targetVersionId
      );
      plan.upgradeStage.overrides = result.overrides;
      plan.upgradeStage.pending = result.pending;
      return;
    }
    const result = resolvePending(
      template,
      plan,
      plan.overrides,
      plan.pending,
      pendingId,
      action,
      plan.templateVersionId
    );
    plan.overrides = result.overrides;
    plan.pending = result.pending;
    plan.updatedAt = now();
  });
}

// ---- 模板升级：先算草稿，失败保留，可重试 ----

function startUpgrade(planId: string, targetVersionId: string, fail: boolean): { ok: boolean; error?: string } {
  let result: { ok: boolean; error?: string } = { ok: true };
  act((draft) => {
    const plan = draft.plans.find((item) => item.id === planId);
    const template = plan && findTemplate(draft, plan.templateId);
    const target = template?.versions.find((version) => version.id === targetVersionId);
    if (!plan || !template || !target) {
      result = { ok: false, error: '找不到目标模板版本' };
      return;
    }
    const computed = computeUpgrade(template, plan, target);
    if (fail) {
      plan.upgradeStage = {
        targetVersionId,
        targetLabel: target.label,
        overrides: computed.overrides,
        pending: computed.pending,
        error: '同步失败：与教研组服务器的连接中断（模拟）。班级草稿已保留，其他班级仍可正常使用旧模板。',
        createdAt: now()
      };
      result = { ok: false, error: plan.upgradeStage.error };
      return;
    }
    plan.templateVersionId = targetVersionId;
    plan.overrides = computed.overrides;
    plan.pending = computed.pending;
    plan.upgradeStage = null;
    plan.updatedAt = now();
  });
  return result;
}

/** 重试提交已保留的升级草稿 */
function retryUpgrade(planId: string, fail: boolean): { ok: boolean; error?: string } {
  let result: { ok: boolean; error?: string } = { ok: true };
  act((draft) => {
    const plan = draft.plans.find((item) => item.id === planId);
    if (!plan?.upgradeStage) return;
    if (fail) {
      plan.upgradeStage.error = '重试仍然失败：服务器无响应（模拟）。草稿继续保留。';
      result = { ok: false, error: plan.upgradeStage.error };
      return;
    }
    plan.templateVersionId = plan.upgradeStage.targetVersionId;
    plan.overrides = plan.upgradeStage.overrides;
    plan.pending = plan.upgradeStage.pending;
    plan.upgradeStage = null;
    plan.updatedAt = now();
  });
  return result;
}

function discardUpgrade(planId: string): void {
  act((draft) => mutatePlan(draft, planId, (plan) => { plan.upgradeStage = null; }));
}

// ---- 断网平板会话 ----

function beginOffline(planId: string): void {
  act((draft) => {
    if (draft.offline) return;
    const plan = draft.plans.find((item) => item.id === planId);
    if (!plan) return;
    draft.offline = {
      planId,
      startedAt: now(),
      baselineVersionId: plan.templateVersionId,
      baselineOverrides: clone(plan.overrides),
      remoteOverridePatches: {},
      remoteVersionId: null,
      ops: [],
      mergeError: null
    };
  });
}

function pushOfflineOp(draft: Workspace, op: Omit<OfflineOp, 'id'>): void {
  draft.offline?.ops.push({ id: uid('op'), ...op });
}

function queueOrApply(
  planId: string,
  op: Omit<OfflineOp, 'id'>,
  applyOnline: (plan: ClassPlan, workspace: Workspace) => void
): void {
  act((draft) => {
    const plan = draft.plans.find((item) => item.id === planId);
    if (!plan) return;
    if (isOfflineEditing(draft, planId)) {
      pushOfflineOp(draft, op);
      return;
    }
    applyOnline(plan, draft);
  });
}

function undoOfflineOp(): void {
  act((draft) => {
    draft.offline?.ops.pop();
  });
}

/** 模拟教研组在断网期间发布了新版本（到达“服务器侧”，本机还没合） */
function simulateRemotePublish(templateId: string): string | null {
  let versionId: string | null = null;
  act((draft) => {
    if (!draft.offline) return;
    const template = draft.templates.find((item) => item.id === templateId);
    if (!template) return;
    const version: TemplateVersion = {
      id: uid('v'),
      label: `热修订 ${template.versions.length + 1}`,
      note: '断网期间教研组发布的热修订（模拟）。',
      savedAt: now(),
      meta: clone(template.draftMeta),
      activities: clone(template.draftActivities)
    };
    template.versions.push(version);
    draft.offline.remoteVersionId = version.id;
    versionId = version.id;
  });
  return versionId;
}

/** 模拟另一台设备（如教室主机）在服务器侧改了某字段，用于制造同字段两边都改 */
function simulateRemoteOverride(scope: 'meta' | 'act', id: string, field: MetaFieldKey | ActivityFieldKey, value: FieldValue): void {
  act((draft) => {
    if (!draft.offline) return;
    draft.offline.remoteOverridePatches[remotePatchKey(scope, id, field)] = { value, dual: null, updatedAt: now() };
  });
}

/** 断网回来合并；失败时保留班级草稿（离线会话与错误信息）可重试 */
function mergeBack(planId: string, fail: boolean): { ok: boolean; error?: string } {
  let result: { ok: boolean; error?: string } = { ok: true };
  act((draft) => {
    const plan = draft.plans.find((item) => item.id === planId);
    if (!plan || !draft.offline || draft.offline.planId !== planId) {
      result = { ok: false, error: '没有待合并的平板会话' };
      return;
    }
    if (fail) {
      draft.offline.mergeError = '合并失败：无法把平板改动写回教研组服务器（模拟）。本地覆盖项已完整保留，请重试。';
      result = { ok: false, error: draft.offline.mergeError };
      return;
    }
    const merged = mergeOffline(draft, plan);
    plan.templateVersionId = merged.versionId;
    plan.overrides = merged.overrides;
    plan.pending = [...plan.pending, ...merged.pending];
    plan.upgradeStage = null;
    plan.updatedAt = now();
    draft.offline = null;
  });
  return result;
}

function retryMerge(planId: string, fail: boolean): { ok: boolean; error?: string } {
  return mergeBack(planId, fail);
}

function cancelOffline(planId: string): void {
  act((draft) => {
    if (draft.offline?.planId === planId) draft.offline = null;
  });
}

function previewOfflineOps(workspace: Workspace, plan: ClassPlan): { fieldCount: number; structureCount: number } {
  if (workspace.offline?.planId !== plan.id) return { fieldCount: 0, structureCount: 0 };
  const structural: OfflineOpType[] = ['move-activity', 'hide-activity', 'restore-activity', 'add-activity', 'delete-activity'];
  return {
    fieldCount: workspace.offline.ops.filter((op) => !structural.includes(op.type)).length,
    structureCount: workspace.offline.ops.filter((op) => structural.includes(op.type)).length
  };
}

function offlineEffectiveOverrides(workspace: Workspace, plan: ClassPlan): OverrideMap {
  if (workspace.offline?.planId !== plan.id) return plan.overrides;
  const version = findVersion(workspace, plan.templateId, workspace.offline.baselineVersionId);
  return replayOps(workspace.offline.baselineOverrides, version, workspace.offline.ops);
}

// ---- 工具 ----

function blankActivity(id: string, type: ActivityType): Activity {
  return {
    id,
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

function moveInArray<T extends { id?: string } | string>(list: T[], id: string, direction: -1 | 1): void {
  const index = list.findIndex((item) => (typeof item === 'string' ? item === id : item.id === id));
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
}

// 仅用于测试/重置
function resetAll(): void {
  localStorage.removeItem(STORAGE_KEY);
  past = [];
  future = [];
  set(migrateWorkspace(null));
  refreshHistory();
}

export const history = historyStore;

export const workspaceStore = {
  subscribe,
  undo: undoState,
  redo: redoState,
  resetAll,
  // template
  editTemplateMeta,
  editDraftNote,
  editTemplateActivity,
  addTemplateActivity,
  deleteTemplateActivity,
  duplicateTemplateActivity,
  moveTemplateActivity,
  toggleTemplateDependency,
  publishTemplate,
  resetDraftToVersion,
  createTemplate,
  duplicateTemplate,
  // plan
  createPlan,
  renamePlan,
  duplicatePlan,
  setPlanMeta,
  resetPlanMeta,
  setPlanActivityField,
  resetPlanActivityField,
  togglePlanDependency,
  movePlanActivity,
  hidePlanActivity,
  restorePlanActivity,
  addPlanActivity,
  duplicatePlanActivity,
  deletePlanActivity,
  resolvePlanPending,
  // upgrade
  startUpgrade,
  retryUpgrade,
  discardUpgrade,
  // offline
  beginOffline,
  undoOfflineOp,
  simulateRemotePublish,
  simulateRemoteOverride,
  mergeBack,
  retryMerge,
  cancelOffline,
  previewOfflineOps,
  offlineEffectiveOverrides
};

import { get, writable } from 'svelte/store';
import type {
  Activity,
  ClassDraft,
  ClassPlan,
  EditingContext,
  Resolution,
  Template,
  TemplateVersion
} from './types';
import {
  computeOverrides,
  createId,
  mergePlanToDraft,
  resolveActivities,
  resolveDraft,
  validateDraft
} from './merge';
import { emptyActivity } from './fields';
import { seedPlans, seedTemplate } from './seed';

const STORAGE_KEY = 'sologsb-1026-phonics-template-v2';
const LEGACY_KEY = 'sologsb-1026-phonics-course-v1';

interface PersistShape {
  template: Template;
  plans: ClassPlan[];
}

interface StoreState extends PersistShape {
  history: PersistShape[];
  future: PersistShape[];
  context: EditingContext;
}

function loadInitial(): PersistShape {
  if (typeof localStorage === 'undefined') return { template: seedTemplate(), plans: [] };
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as PersistShape;
      if (parsed.template && Array.isArray(parsed.plans)) return parsed;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  // 从旧版整门课程数据迁移为模板
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const old = JSON.parse(legacy) as {
        title: string;
        level: string;
        ageRange: string;
        objective: string;
        activities: Activity[];
        versions: TemplateVersion[];
        updatedAt: string;
      };
      if (Array.isArray(old.activities)) {
        const template: Template = {
          id: 'template-phonics-1',
          title: old.title,
          level: old.level,
          ageRange: old.ageRange,
          objective: old.objective,
          activities: old.activities,
          versions: Array.isArray(old.versions) ? old.versions : [],
          updatedAt: old.updatedAt ?? new Date().toISOString()
        };
        return { template, plans: [] };
      }
    } catch {
      // fall through to seed
    }
  }
  const template = seedTemplate();
  return { template, plans: seedPlans(template) };
}

function persist(state: PersistShape): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createStore() {
  const initial = loadInitial();
  const { subscribe, update } = writable<StoreState>({
    ...initial,
    history: [],
    future: [],
    context: { kind: 'template', planId: null }
  });

  function commit(recipe: (draft: PersistShape) => void): void {
    update((state) => {
      const snapshot: PersistShape = {
        template: structuredClone(state.template),
        plans: structuredClone(state.plans)
      };
      const next: PersistShape = structuredClone(snapshot);
      recipe(next);
      next.template.updatedAt = new Date().toISOString();
      persist(next);
      return {
        ...state,
        template: next.template,
        plans: next.plans,
        history: [...state.history.slice(-49), snapshot],
        future: []
      };
    });
  }

  function undo(): void {
    update((state) => {
      const previous = state.history.at(-1);
      if (!previous) return state;
      const current: PersistShape = {
        template: structuredClone(state.template),
        plans: structuredClone(state.plans)
      };
      persist(previous);
      return {
        ...state,
        template: previous.template,
        plans: previous.plans,
        history: state.history.slice(0, -1),
        future: [current, ...state.future].slice(0, 50)
      };
    });
  }

  function redo(): void {
    update((state) => {
      const next = state.future[0];
      if (!next) return state;
      const current: PersistShape = {
        template: structuredClone(state.template),
        plans: structuredClone(state.plans)
      };
      persist(next);
      return {
        ...state,
        template: next.template,
        plans: next.plans,
        history: [...state.history, current].slice(-50),
        future: state.future.slice(1)
      };
    });
  }

  function saveNow(): void {
    update((state) => {
      persist({ template: state.template, plans: state.plans });
      return state;
    });
  }

  function findPlan(state: PersistShape, planId: string): ClassPlan | undefined {
    return state.plans.find((plan) => plan.id === planId);
  }

  function baseVersionOf(template: Template, plan: ClassPlan): TemplateVersion {
    return (
      template.versions.find((version) => version.id === plan.baseVersionId) ??
      template.versions[0]
    );
  }

  function resolvedActivitiesOf(state: PersistShape, context: EditingContext): Activity[] {
    if (context.kind === 'template') return state.template.activities;
    const plan = findPlan(state, context.planId ?? '');
    if (!plan) return state.template.activities;
    const base = baseVersionOf(state.template, plan);
    return resolveActivities(base.activities, plan);
  }

  function buildUpgradeDraft(plan: ClassPlan, template: Template, targetVersionId?: string): ClassDraft {
    const base = baseVersionOf(template, plan);
    const target =
      template.versions.find((version) => version.id === targetVersionId) ??
      template.versions.at(-1) ??
      base;
    try {
      return mergePlanToDraft(plan, base, target);
    } catch (error) {
      return {
        targetVersionId: target.id,
        overrides: structuredClone(plan.overrides),
        localActivities: structuredClone(plan.localActivities),
        removedActivityIds: structuredClone(plan.removedActivityIds),
        order: structuredClone(plan.order),
        pendingItems: [],
        savedAt: new Date().toISOString(),
        error: `合并处理失败：${error instanceof Error ? error.message : String(error)}。已保留草稿，可重试。`
      };
    }
  }

  return {
    subscribe,
    commit,
    undo,
    redo,
    saveNow,
    resolvedActivitiesOf,
    setContext(next: EditingContext) {
      update((state) => ({ ...state, context: next }));
    },

    // ---- 模板元信息 ----
    updateTemplateMeta(field: 'title' | 'level' | 'ageRange' | 'objective', value: string) {
      commit((draft) => {
        draft.template[field] = value;
      });
    },

    // ---- 模板活动 ----
    updateTemplateActivity(id: string, field: keyof Activity, value: unknown) {
      commit((draft) => {
        const target = draft.template.activities.find((activity) => activity.id === id);
        if (target) (target as unknown as Record<string, unknown>)[field] = value;
      });
    },
    addTemplateActivity(type: Activity['type'] = '练习') {
      const activity = emptyActivity(type);
      commit((draft) => {
        draft.template.activities.push(activity);
      });
      return activity.id;
    },
    deleteTemplateActivity(id: string) {
      commit((draft) => {
        draft.template.activities = draft.template.activities.filter((activity) => activity.id !== id);
        draft.template.activities.forEach((activity) => {
          activity.dependencies = activity.dependencies.filter((dep) => dep !== id);
        });
      });
    },
    duplicateTemplateActivity(id: string) {
      let newId = '';
      commit((draft) => {
        const source = draft.template.activities.find((activity) => activity.id === id);
        if (!source) return;
        const copy: Activity = {
          ...structuredClone(source),
          id: createId('a'),
          title: `${source.title}（副本）`,
          dependencies: [...source.dependencies]
        };
        newId = copy.id;
        const index = draft.template.activities.findIndex((activity) => activity.id === id);
        draft.template.activities.splice(index + 1, 0, copy);
      });
      return newId;
    },
    moveTemplateActivity(id: string, direction: -1 | 1) {
      commit((draft) => {
        const index = draft.template.activities.findIndex((activity) => activity.id === id);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= draft.template.activities.length) return;
        const [item] = draft.template.activities.splice(index, 1);
        draft.template.activities.splice(nextIndex, 0, item);
      });
    },

    // ---- 模板版本 ----
    saveTemplateVersion() {
      commit((draft) => {
        const versionNumber = draft.template.versions.length + 1;
        draft.template.versions.push({
          id: createId('v'),
          label: `版本 ${versionNumber}`,
          savedAt: new Date().toISOString(),
          note: `保存 ${draft.template.activities.length} 个活动，总计 ${draft.template.activities.reduce(
            (sum, item) => sum + item.duration,
            0
          )} 分钟。`,
          activities: structuredClone(draft.template.activities)
        });
      });
    },

    // ---- 班级方案 ----
    createPlan(name: string, baseVersionId: string) {
      const id = createId('plan');
      commit((draft) => {
        const base = draft.template.versions.find((version) => version.id === baseVersionId);
        draft.plans.push({
          id,
          name,
          templateId: draft.template.id,
          baseVersionId,
          overrides: {},
          localActivities: [],
          removedActivityIds: [],
          order: base ? base.activities.map((activity) => activity.id) : [],
          pendingItems: [],
          draft: null,
          updatedAt: new Date().toISOString()
        });
      });
      return id;
    },
    deletePlan(planId: string) {
      commit((draft) => {
        draft.plans = draft.plans.filter((plan) => plan.id !== planId);
      });
    },
    updatePlanMeta(planId: string, name: string) {
      commit((draft) => {
        const plan = findPlan(draft, planId);
        if (plan) {
          plan.name = name;
          plan.updatedAt = new Date().toISOString();
        }
      });
    },
    duplicatePlan(planId: string) {
      const id = createId('plan');
      commit((draft) => {
        const source = findPlan(draft, planId);
        if (!source) return;
        draft.plans.push({
          ...structuredClone(source),
          id,
          name: `${source.name} · 副本`,
          draft: null,
          updatedAt: new Date().toISOString()
        });
      });
      return id;
    },

    /** 编辑班级方案中的活动：写入相对基线版本的覆盖项。 */
    updatePlanActivity(planId: string, id: string, field: keyof Activity, value: unknown) {
      commit((draft) => {
        const plan = findPlan(draft, planId);
        if (!plan) return;
        const base = baseVersionOf(draft.template, plan);
        const working = resolveActivities(base.activities, plan);
        const target = working.find((activity) => activity.id === id);
        if (!target) return;
        (target as unknown as Record<string, unknown>)[field] = value;
        plan.overrides = computeOverrides(base.activities, working);
        plan.updatedAt = new Date().toISOString();
      });
    },
    addPlanActivity(planId: string, type: Activity['type'] = '练习') {
      const activity = emptyActivity(type);
      commit((draft) => {
        const plan = findPlan(draft, planId);
        if (!plan) return;
        plan.localActivities.push(activity);
        plan.order.push(activity.id);
        plan.updatedAt = new Date().toISOString();
      });
      return activity.id;
    },
    deletePlanActivity(planId: string, id: string) {
      commit((draft) => {
        const plan = findPlan(draft, planId);
        if (!plan) return;
        plan.localActivities = plan.localActivities.filter((activity) => activity.id !== id);
        if (!plan.removedActivityIds.includes(id)) plan.removedActivityIds.push(id);
        delete plan.overrides[id];
        plan.order = plan.order.filter((orderId) => orderId !== id);
        plan.updatedAt = new Date().toISOString();
      });
    },
    duplicatePlanActivity(planId: string, id: string) {
      let newId = '';
      commit((draft) => {
        const plan = findPlan(draft, planId);
        if (!plan) return;
        const base = baseVersionOf(draft.template, plan);
        const working = resolveActivities(base.activities, plan);
        const source = working.find((activity) => activity.id === id);
        if (!source) return;
        const copy: Activity = {
          ...structuredClone(source),
          id: createId('a'),
          title: `${source.title}（副本）`,
          dependencies: [...source.dependencies]
        };
        newId = copy.id;
        plan.localActivities.push(copy);
        const orderIndex = plan.order.findIndex((orderId) => orderId === id);
        plan.order.splice(orderIndex + 1, 0, copy.id);
        plan.updatedAt = new Date().toISOString();
      });
      return newId;
    },
    movePlanActivity(planId: string, id: string, direction: -1 | 1) {
      commit((draft) => {
        const plan = findPlan(draft, planId);
        if (!plan) return;
        const index = plan.order.findIndex((orderId) => orderId === id);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= plan.order.length) return;
        const [item] = plan.order.splice(index, 1);
        plan.order.splice(nextIndex, 0, item);
        plan.updatedAt = new Date().toISOString();
      });
    },

    // ---- 模板升级与合并 ----
    /** 生成升级草稿（三方合并）。targetVersionId 缺省为最新版本。 */
    buildUpgradeDraft(planId: string, targetVersionId?: string) {
      commit((draft) => {
        const plan = findPlan(draft, planId);
        if (!plan) return;
        plan.draft = buildUpgradeDraft(plan, draft.template, targetVersionId);
      });
    },

    /** 应用对待处理事项的决定，更新草稿。 */
    resolveDraftItem(planId: string, itemId: string, resolution: Resolution) {
      commit((draft) => {
        const plan = findPlan(draft, planId);
        if (!plan || !plan.draft) return;
        const target = draft.template.versions.find(
          (version) => version.id === plan.draft?.targetVersionId
        );
        if (!target) return;
        plan.draft = resolveDraft(plan.draft, { [itemId]: resolution }, target);
      });
    },

    /** 应用草稿：校验通过则升级基线并清空草稿；失败则保留草稿与错误。 */
    applyDraft(planId: string) {
      let error: string | null = null;
      commit((draft) => {
        const plan = findPlan(draft, planId);
        if (!plan || !plan.draft) return;
        const validationError = validateDraft(plan.draft);
        if (validationError) {
          plan.draft.error = validationError;
          error = validationError;
          return;
        }
        const target = draft.template.versions.find(
          (version) => version.id === plan.draft?.targetVersionId
        );
        if (!target) {
          plan.draft.error = '目标模板版本不存在，无法应用。';
          error = plan.draft.error;
          return;
        }
        plan.overrides = plan.draft.overrides;
        plan.localActivities = plan.draft.localActivities;
        plan.removedActivityIds = plan.draft.removedActivityIds;
        plan.order = plan.draft.order;
        plan.pendingItems = plan.draft.pendingItems;
        plan.baseVersionId = target.id;
        plan.draft = null;
        plan.updatedAt = new Date().toISOString();
      });
      return error;
    },

    discardDraft(planId: string) {
      commit((draft) => {
        const plan = findPlan(draft, planId);
        if (plan) plan.draft = null;
      });
    },

    /** 重试失败的合并：重新执行三方合并，保留草稿。 */
    retryDraft(planId: string) {
      commit((draft) => {
        const plan = findPlan(draft, planId);
        if (!plan || !plan.draft) return;
        plan.draft = buildUpgradeDraft(plan, draft.template, plan.draft.targetVersionId);
      });
    },

    /** 离线恢复在线：对落后于最新模板的方案自动合并，生成草稿。 */
    mergeOfflineChanges(): string[] {
      const affected: string[] = [];
      commit((draft) => {
        for (const plan of draft.plans) {
          const latest = draft.template.versions.at(-1);
          if (!latest || plan.baseVersionId === latest.id) continue;
          plan.draft = buildUpgradeDraft(plan, draft.template, latest.id);
          affected.push(plan.id);
        }
      });
      return affected;
    }
  };
}

export type AppStore = ReturnType<typeof createStore>;

export const app = createStore();

/** 取当前状态快照（用于事件处理）。 */
export function getState(): StoreState {
  return get(app);
}

export { resolveActivities };

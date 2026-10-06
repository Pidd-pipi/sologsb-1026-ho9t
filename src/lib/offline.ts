import type {
  Activity,
  ActivityFieldKey,
  ClassPlan,
  FieldKey,
  FieldOverride,
  FieldValue,
  MetaFieldKey,
  OfflineOp,
  OverrideMap,
  PendingItem,
  TemplateVersion,
  Workspace
} from './types';
import { clone, now, sameValue, uid } from './utils';
import { findVersion } from './resolve';
import { computeUpgrade } from './upgrade';

// ---------- 操作回放：把断网期间的操作队列应用到基线覆盖项上 ----------

export function replayOps(base: OverrideMap, version: TemplateVersion | null, ops: OfflineOp[]): OverrideMap {
  const overrides: OverrideMap = {
    meta: clone(base.meta),
    activities: clone(base.activities),
    order: base.order ? [...base.order] : null
  };

  const ensureActivity = (id: string): NonNullable<OverrideMap['activities'][string]> =>
    (overrides.activities[id] ??= {});

  const templateOrder = () => version?.activities.map((activity) => activity.id) ?? [];
  const fullOrder = (): string[] => {
    if (overrides.order) return overrides.order;
    overrides.order = [...templateOrder()];
    for (const id of Object.keys(overrides.activities)) {
      if (!overrides.order.includes(id)) overrides.order.push(id);
    }
    return overrides.order;
  };
  const baseActivity = (id: string): Activity | undefined =>
    version?.activities.find((activity) => activity.id === id) ?? overrides.activities[id]?.added;

  for (const op of ops) {
    if (op.type === 'set-field' && op.activityId && op.field) {
      const entry = ensureActivity(op.activityId);
      entry.fields = entry.fields ?? {};
      entry.fields[op.field as ActivityFieldKey] = { value: op.value as FieldValue, dual: null, updatedAt: op.at };
    } else if (op.type === 'set-meta' && op.field) {
      overrides.meta[op.field as MetaFieldKey] = { value: op.value as FieldValue, dual: null, updatedAt: op.at };
    } else if (op.type === 'toggle-dependency' && op.activityId && op.dependencyId) {
      const entry = ensureActivity(op.activityId);
      entry.fields = entry.fields ?? {};
      const current = Array.isArray(entry.fields.dependencies?.value)
        ? (entry.fields.dependencies!.value as string[])
        : baseActivity(op.activityId)?.dependencies ?? [];
      const deps = op.checked
        ? [...new Set([...current, op.dependencyId])]
        : current.filter((id) => id !== op.dependencyId);
      entry.fields.dependencies = { value: deps, dual: null, updatedAt: op.at };
    } else if (op.type === 'move-activity' && op.activityId && op.direction) {
      const order = fullOrder();
      const index = order.indexOf(op.activityId);
      const target = index + op.direction;
      if (index >= 0 && target >= 0 && target < order.length) {
        const [item] = order.splice(index, 1);
        order.splice(target, 0, item);
      }
    } else if (op.type === 'hide-activity' && op.activityId) {
      ensureActivity(op.activityId).removed = true;
    } else if (op.type === 'restore-activity' && op.activityId) {
      const entry = overrides.activities[op.activityId];
      if (entry) delete entry.removed;
    } else if (op.type === 'add-activity' && op.activity) {
      const created: Activity = clone(op.activity);
      overrides.activities[created.id] = { added: created };
      const order = fullOrder();
      if (!order.includes(created.id)) order.push(created.id);
    } else if (op.type === 'delete-activity' && op.activityId) {
      const entry = overrides.activities[op.activityId];
      if (entry?.added) {
        delete overrides.activities[op.activityId];
        if (overrides.order) overrides.order = overrides.order.filter((id) => id !== op.activityId);
      } else if (entry) {
        entry.removed = true;
      }
    }
  }
  return overrides;
}

/** 断网期间在平板上看到的有效课程 = 基线覆盖 + 操作队列 */
export function offlineOverrides(workspace: Workspace, plan: ClassPlan): OverrideMap {
  const offline = workspace.offline;
  if (!offline || offline.planId !== plan.id) return plan.overrides;
  const version = findVersion(workspace, plan.templateId, offline.baselineVersionId);
  return replayOps(offline.baselineOverrides, version, offline.ops);
}

// ---------- 三路合并 ----------

export interface MergeResult {
  versionId: string;
  overrides: OverrideMap;
  pending: PendingItem[];
}

interface MergeContext {
  baseVersion: TemplateVersion | null;
  serverVersion: TemplateVersion | null;
}

/**
 * 断网回来后合并：
 * - base  = 进入断网时的模板版本 + 基线覆盖
 * - local = 基线覆盖 + 平板操作队列
 * - server = 当前模板版本 + 教研组改动 + 他机覆盖补丁
 * 同一字段两边都改时，两份都保留，生成 field-conflict 待处理。
 */
export function mergeOffline(workspace: Workspace, plan: ClassPlan): MergeResult {
  const offline = workspace.offline;
  if (!offline || offline.planId !== plan.id) {
    throw new Error('没有待合并的断网会话');
  }

  const ctx: MergeContext = {
    baseVersion: findVersion(workspace, plan.templateId, offline.baselineVersionId),
    serverVersion: findVersion(workspace, plan.templateId, offline.remoteVersionId ?? plan.templateVersionId)
  };

  const local = replayOps(offline.baselineOverrides, ctx.baseVersion, offline.ops);
  const pending: PendingItem[] = [];

  // 服务器侧覆盖 = 基线覆盖 ＋ 他机补丁（补丁只改字段值）
  const serverOverrides: OverrideMap = clone(offline.baselineOverrides);
  serverOverrides.order = serverOverrides.order ? [...serverOverrides.order] : null;
  applyRemotePatches(serverOverrides, offline.remoteOverridePatches, ctx.serverVersion);

  // 若教研组在断网期间发布了新版本，先做一次结构升级
  let server = serverOverrides;
  if (offline.remoteVersionId && offline.remoteVersionId !== offline.baselineVersionId && ctx.serverVersion) {
    const template = workspace.templates.find((item) => item.id === plan.templateId)!;
    const upgrade = computeUpgrade(template, { ...plan, templateVersionId: offline.baselineVersionId }, ctx.serverVersion);
    pending.push(...upgrade.pending);
    // 结构升级后的覆盖作为“服务器侧”，再与本地按字段三路合并
    server = upgrade.overrides;
    applyRemotePatches(server, offline.remoteOverridePatches, ctx.serverVersion);
  }

  const merged = mergeOverrideMaps(offline.baselineOverrides, local, server, ctx, pending);
  return { versionId: offline.remoteVersionId ?? plan.templateVersionId, overrides: merged, pending };
}

function applyRemotePatches(
  overrides: OverrideMap,
  patches: Record<string, FieldOverride>,
  version: TemplateVersion | null
): void {
  for (const [key, patch] of Object.entries(patches)) {
    const [scope, id, field] = key.split(':');
    if (scope === 'meta' && field) {
      overrides.meta[field as MetaFieldKey] = clone(patch);
    } else if (scope === 'act' && id && field) {
      const entry = (overrides.activities[id] ??= {});
      entry.fields = entry.fields ?? {};
      entry.fields[field as ActivityFieldKey] = clone(patch);
    }
  }
  void version;
}

/**
 * 字段级三路合并。key 形如 meta:title / act:a-3:duration
 */
function mergeOverrideMaps(
  base: OverrideMap,
  local: OverrideMap,
  server: OverrideMap,
  ctx: MergeContext,
  pending: PendingItem[]
): OverrideMap {
  const merged: OverrideMap = { meta: {}, activities: {}, order: local.order ? [...local.order] : server.order ? [...server.order] : null };

  // 课程级字段
  const metaKeys = new Set<MetaFieldKey>([
    ...Object.keys(base.meta) as MetaFieldKey[],
    ...Object.keys(local.meta) as MetaFieldKey[],
    ...Object.keys(server.meta) as MetaFieldKey[]
  ]);
  for (const key of metaKeys) {
    const resolve = mergeField(
      base.meta[key],
      local.meta[key],
      server.meta[key],
      ctx.baseVersion?.meta[key] as FieldValue | undefined,
      ctx.serverVersion?.meta[key] as FieldValue | undefined
    );
    if (resolve.conflict) {
      merged.meta[key] = { value: resolve.local!, dual: { local: resolve.local!, remote: resolve.remote! }, updatedAt: now() };
      pending.push({
        id: uid('pd'),
        kind: 'field-conflict',
        activityId: '__meta__',
        activityTitle: '课程信息',
        field: key,
        localValue: clone(resolve.local!),
        remoteValue: clone(resolve.remote!),
        detail: `课程字段“${key}”平板与教研组侧都做了修改，两份取值已保留，请选择。`,
        createdAt: now()
      });
    } else if (resolve.value !== undefined) {
      merged.meta[key] = { value: resolve.value, dual: null, updatedAt: now() };
    }
  }

  // 活动级字段
  const ids = new Set<string>([
    ...Object.keys(base.activities),
    ...Object.keys(local.activities),
    ...Object.keys(server.activities)
  ]);
  for (const id of ids) {
    const baseEntry = base.activities[id];
    const localEntry = local.activities[id];
    const serverEntry = server.activities[id];

    const removed = (localEntry?.removed ?? false) || (serverEntry?.removed ?? false);
    const added = localEntry?.added ?? serverEntry?.added ?? baseEntry?.added;

    const entry: NonNullable<OverrideMap['activities'][string]> = {};
    if (added) entry.added = clone(added);
    if (removed) entry.removed = true;

    const fieldKeys = new Set<ActivityFieldKey>([
      ...Object.keys(baseEntry?.fields ?? {}) as ActivityFieldKey[],
      ...Object.keys(localEntry?.fields ?? {}) as ActivityFieldKey[],
      ...Object.keys(serverEntry?.fields ?? {}) as ActivityFieldKey[]
    ]);
    const baseActivity = ctx.baseVersion?.activities.find((activity) => activity.id === id);
    const serverActivity = ctx.serverVersion?.activities.find((activity) => activity.id === id);

    for (const field of fieldKeys) {
      const resolve = mergeField(
        baseEntry?.fields?.[field],
        localEntry?.fields?.[field],
        serverEntry?.fields?.[field],
        baseActivity?.[field] as FieldValue | undefined,
        serverActivity?.[field] as FieldValue | undefined
      );
      if (resolve.conflict) {
        entry.fields = entry.fields ?? {};
        entry.fields[field] = { value: resolve.local!, dual: { local: resolve.local!, remote: resolve.remote! }, updatedAt: now() };
        pending.push({
          id: uid('pd'),
          kind: 'field-conflict',
          activityId: id,
          activityTitle: serverActivity?.title ?? baseActivity?.title ?? localEntry?.added?.title ?? id,
          field,
          localValue: clone(resolve.local!),
          remoteValue: clone(resolve.remote!),
          detail: `同一字段两边都做了修改，平板值与教研组侧值都已保留，请选择采用哪一份。`,
          createdAt: now()
        });
      } else if (resolve.value !== undefined) {
        entry.fields = entry.fields ?? {};
        entry.fields[field] = { value: resolve.value, dual: null, updatedAt: now() };
      }
    }
    if (entry.fields || entry.added || entry.removed) merged.activities[id] = entry;
  }

  return merged;
}

interface FieldMerge {
  value?: FieldValue;
  local?: FieldValue;
  remote?: FieldValue;
  conflict: boolean;
}

/**
 * 单个字段的三路合并。
 * bOverride/lOverride/sOverride 是各方的覆盖项（可能为 undefined 表示继承模板）；
 * bTemplate/sTemplate 是新旧模板自带取值。
 */
function mergeField(
  bOverride: FieldOverride | undefined,
  lOverride: FieldOverride | undefined,
  sOverride: FieldOverride | undefined,
  bTemplate: FieldValue | undefined,
  sTemplate: FieldValue | undefined
): FieldMerge {
  const effective = (override: FieldOverride | undefined, template: FieldValue | undefined) =>
    override ? override.value : template;
  const baseVal = effective(bOverride, bTemplate);
  const localVal = effective(lOverride, bTemplate); // 本地基线仍是旧模板
  const serverVal = effective(sOverride, sTemplate);

  const localChanged = !sameValue(localVal, baseVal);
  const serverChanged = !sameValue(serverVal, baseVal);

  if (localChanged && serverChanged && !sameValue(localVal, serverVal)) {
    return { local: localVal, remote: serverVal, conflict: true };
  }
  if (localChanged) return { value: localVal, conflict: false };
  if (serverChanged) return { value: serverVal, conflict: false };
  // 两边都没改：若相对旧模板有覆盖且服务器已回归新模板，跟随继承
  return { value: lOverride ? localVal : sOverride ? serverVal : undefined, conflict: false };
}

// ---------- 断网期间模拟“服务器侧”的改动 ----------

export function remotePatchKey(scope: 'meta' | 'act', id: string, field: FieldKey): string {
  return scope === 'meta' ? `meta:${field}` : `act:${id}:${field}`;
}

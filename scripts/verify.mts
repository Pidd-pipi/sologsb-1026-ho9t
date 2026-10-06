/* 核心算法验证：覆盖模型、升级、待处理、离线三路合并、按方案重算 */
import { seedWorkspace } from '../src/lib/seed';
import { resolvePlan } from '../src/lib/resolve';
import { computeUpgrade, resolvePending } from '../src/lib/upgrade';
import { mergeOffline, replayOps } from '../src/lib/offline';
import { analyze } from '../src/lib/analysis';
import { diffSnapshots, snapshotOf } from '../src/lib/diff';
import { clone } from '../src/lib/utils';

let passed = 0;
let failed = 0;
function assert(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

const workspace = seedWorkspace();
const templateA = workspace.templates.find((t) => t.id === 'tpl-a')!;
const v1 = templateA.versions.find((v) => v.id === 'v-t1')!;
const v2 = templateA.versions.find((v) => v.id === 'v-t2')!;

// 1) 班级方案只存覆盖项：解析结果合并模板与覆盖
console.log('1. 覆盖项模型');
const p1 = workspace.plans.find((p) => p.id === 'p-1')!;
const resolved1 = resolvePlan(workspace, p1);
const a3 = resolved1.activities.find((a) => a.id === 'a-3')!;
assert('p1 的 a-3 时长覆盖为 14', a3.duration === 14, `实际 ${a3.duration}`);
assert('a-3 标记为覆盖字段', a3.overriddenFields.includes('duration'));
assert('a-1 未覆盖，取模板时长 6', resolved1.activities.find((a) => a.id === 'a-1')!.duration === 6);
assert('覆盖项本身不含活动全量副本', p1.overrides.activities['a-3']?.fields?.title === undefined);

// 2) 升级保留本地覆盖
console.log('2. 模板升级保留本地覆盖');
const upgrade = computeUpgrade(templateA, p1, v2);
const p1Upgraded = { ...clone(p1), templateVersionId: 'v-t2', overrides: upgrade.overrides, pending: upgrade.pending };
const resolvedUp = resolvePlan(workspace, p1Upgraded);
const a3Up = resolvedUp.activities.find((a) => a.id === 'a-3')!;
assert('升级后 a-3 时长仍是本班 14（模板已改 12）', a3Up.duration === 14, `实际 ${a3Up.duration}`);
assert('升级后 a-3 提示仍是本班文案', a3Up.prompt.includes('三关口型操'));
assert('升级后 a-1 提示跟随新模板', a3Up === undefined ? false : resolvedUp.activities.find((a) => a.id === 'a-1')!.prompt.includes('/s/ 做对比'));
assert('课程目标本地覆盖保留', resolvedUp.meta.objective.includes('放慢节奏'));

// 3) 活动移除 → 待处理，且裁决前不影响其他班级
console.log('3. 活动移除与依赖改向待处理');
const removedItems = upgrade.pending.filter((p) => p.kind === 'activity-removed');
const depItems = upgrade.pending.filter((p) => p.kind === 'dependency-redirected');
assert('列出 1 条活动移除待处理（a-5）', removedItems.length === 1 && removedItems[0].activityId === 'a-5', `实际 ${removedItems.length}`);
assert('列出 1 条依赖改向待处理（a-8→a-5）', depItems.length === 1 && depItems[0].activityId === 'a-8' && depItems[0].dependencyId === 'a-5', `实际 ${depItems.length}`);
const p4 = workspace.plans.find((p) => p.id === 'p-4')!;
assert('其他班级 p4 仍钉在 v2 且无待处理', p4.templateVersionId === 'v-t2' && p4.pending.length === 0);
// 移除的活动不进入有效路径
assert('a-5 在升级后的有效路径中消失', !resolvedUp.activities.some((a) => a.id === 'a-5'));

// 4) 裁决：转为本班活动 / 跟随模板移除 / 保留旧依赖
console.log('4. 待处理裁决');
const retainResult = resolvePending(templateA, p1Upgraded, upgrade.overrides, upgrade.pending, removedItems[0].id, 'retain-local', 'v-t2');
const afterRetain = resolvePlan(workspace, { ...p1Upgraded, overrides: retainResult.overrides, pending: retainResult.pending });
assert('选择保留后 a-5 转为本班活动出现在路径末尾', afterRetain.activities.some((a) => a.id === 'a-5' && a.source === 'local'));
const followResult = resolvePending(templateA, p1Upgraded, upgrade.overrides, upgrade.pending, removedItems[0].id, 'follow-template', 'v-t2');
assert('跟随模板后无 a-5', !resolvePlan(workspace, { ...p1Upgraded, overrides: followResult.overrides, pending: followResult.pending }).activities.some((a) => a.id === 'a-5'));
const keepDepResult = resolvePending(templateA, p1Upgraded, upgrade.overrides, upgrade.pending, depItems[0].id, 'keep-dependency', 'v-t2');
const afterKeep = resolvePlan(workspace, { ...p1Upgraded, overrides: keepDepResult.overrides, pending: keepDepResult.pending });
const a8 = afterKeep.activities.find((a) => a.id === 'a-8')!;
assert('保留旧依赖后 a-5 补回本班且 a-8 重新依赖它', a8.dependencies.includes('a-5') && afterKeep.activities.some((a) => a.id === 'a-5'));

// 5) 待处理进入质量检查
console.log('5. 质量检查按班级方案重算');
const withPending = resolvePlan(workspace, p1Upgraded);
const issues = analyze(withPending, withPending.activities, upgrade.pending);
assert('待处理事项表现为 error 级质量项', issues.some((i) => i.category === '模板升级') && issues.some((i) => i.category === '依赖改向'));
const cleared = analyze(withPending, withPending.activities, []);
assert('裁决后待处理项从质量检查消失', !cleared.some((i) => i.pendingId));

// 6) 断网三路合并：同字段两边都改 → 两份都保留
console.log('6. 断网合并（同字段双方修改保留两份）');
const ws = seedWorkspace();
const plan = clone(ws.plans.find((p) => p.id === 'p-1')!);
ws.plans = ws.plans.map((p) => (p.id === 'p-1' ? plan : p));
// 进入断网基线
ws.offline = {
  planId: plan.id,
  startedAt: new Date().toISOString(),
  baselineVersionId: 'v-t1',
  baselineOverrides: clone(plan.overrides),
  remoteOverridePatches: {},
  remoteVersionId: null,
  ops: [],
  mergeError: null
};
// 平板上：a-3 时长改成 18（基线已有 14）；a-1 提示改成本机版（单边）
ws.offline.ops = [
  { id: 'op-1', type: 'set-field', activityId: 'a-3', field: 'duration', value: 18, at: new Date().toISOString() },
  { id: 'op-2', type: 'set-field', activityId: 'a-1', field: 'prompt', value: '平板版 /m/ 提示', at: new Date().toISOString() }
];
// 他机：a-3 时长改成 9（同字段两边改）；a-2 时长他机单边改 11
ws.offline.remoteOverridePatches = {
  'act:a-3:duration': { value: 9, dual: null, updatedAt: new Date().toISOString() },
  'act:a-2:duration': { value: 11, dual: null, updatedAt: new Date().toISOString() }
};
const merged = mergeOffline(ws, plan);
assert('a-3 时长产生冲突，两份值分别为 18 和 9',
  merged.overrides.activities['a-3']?.fields?.duration?.dual?.local === 18
  && merged.overrides.activities['a-3']?.fields?.duration?.dual?.remote === 9,
  JSON.stringify(merged.overrides.activities['a-3']?.fields?.duration));
assert('冲突列入待处理 field-conflict',
  merged.pending.some((p) => p.kind === 'field-conflict' && p.activityId === 'a-3' && p.field === 'duration' && p.localValue === 18 && p.remoteValue === 9));
assert('单边修改（平板 a-1 提示）直接生效', merged.overrides.activities['a-1']?.fields?.prompt?.value === '平板版 /m/ 提示');
assert('单边修改（他机 a-2 时长 11）直接生效', merged.overrides.activities['a-2']?.fields?.duration?.value === 11);
assert('平板基线覆盖 a-4 反馈在合并后保留', String(merged.overrides.activities['a-4']?.fields?.feedback?.value).includes('喉咙'));

// 7) 冲突裁决：采用本机/他机/继承
console.log('7. 冲突裁决');
const planMerged = { ...clone(plan), overrides: merged.overrides, pending: merged.pending };
const conflict = merged.pending.find((p) => p.kind === 'field-conflict')!;
const chooseLocal = resolvePending(templateA, planMerged, merged.overrides, merged.pending, conflict.id, 'choose-local', 'v-t1');
assert('采用本机值后 dual 清除、值为 18', chooseLocal.overrides.activities['a-3']?.fields?.duration?.value === 18 && !chooseLocal.overrides.activities['a-3']?.fields?.duration?.dual);
const chooseRemote = resolvePending(templateA, planMerged, merged.overrides, merged.pending, conflict.id, 'choose-remote', 'v-t1');
assert('采用他机值后值为 9', chooseRemote.overrides.activities['a-3']?.fields?.duration?.value === 9);

// 8) 断网期间教研组发新版：合并同时做结构升级
console.log('8. 断网期间模板发布');
const ws2 = seedWorkspace();
const plan2 = clone(ws2.plans.find((p) => p.id === 'p-4')!); // 钉在 v2
ws2.plans = ws2.plans.map((p) => (p.id === 'p-4' ? plan2 : p));
const tpl = ws2.templates.find((t) => t.id === 'tpl-a')!;
const v3 = {
  id: 'v-t3', label: '断网热修订', note: '新增 a-9', savedAt: new Date().toISOString(),
  meta: clone(tpl.draftMeta), activities: clone(tpl.draftActivities)
};
tpl.versions.push(v3);
ws2.offline = {
  planId: plan2.id, startedAt: new Date().toISOString(), baselineVersionId: 'v-t2',
  baselineOverrides: clone(plan2.overrides), remoteOverridePatches: {}, remoteVersionId: 'v-t3',
  ops: [{ id: 'op-1', type: 'set-field', activityId: 'a-2', field: 'prompt', value: '平板备注', at: new Date().toISOString() }],
  mergeError: null
};
const merged2 = mergeOffline(ws2, plan2);
assert('合并后钉到新版本 v-t3', merged2.versionId === 'v-t3');
const resolved2 = resolvePlan(ws2, { ...plan2, templateVersionId: 'v-t3', overrides: merged2.overrides, pending: merged2.pending });
assert('模板新增活动 a-9 自动进入本班路径', resolved2.activities.some((a) => a.id === 'a-9'));
assert('平板上 a-2 提示本地覆盖保留', merged2.overrides.activities['a-2']?.fields?.prompt?.value === '平板备注');

// 9) 断网操作回放（停用/新增/排序）
console.log('9. 操作回放与停用');
const replayed = replayOps(
  { meta: {}, activities: {}, order: null },
  v1,
  [
    { id: 'op-1', type: 'hide-activity', activityId: 'a-4', at: new Date().toISOString() },
    { id: 'op-2', type: 'add-activity', activity: { id: 'x-1', type: '练习', title: '平板自建', content: '', phonemes: [], dependencies: [], difficulty: 1, prompt: '', accessibility: '', duration: 5, feedback: '' }, at: new Date().toISOString() },
    { id: 'op-3', type: 'move-activity', activityId: 'x-1', direction: -1, at: new Date().toISOString() }
  ]
);
const replayedPlan = { ...clone(plan), templateVersionId: 'v-t1', overrides: replayed, pending: [], upgradeStage: null };
const replayedResolved = resolvePlan(seedWorkspace(), replayedPlan);
assert('停用活动标记 hidden 且不进入学习路径', replayedResolved.activities.find((a) => a.id === 'a-4')?.hidden === true
  && !replayedResolved.activities.filter((a) => !a.hidden).some((a) => a.id === 'a-4'));
assert('新增活动在回放中存在', replayedResolved.activities.some((a) => a.id === 'x-1'));
assert('依赖中指向停用活动的引用被清理', replayedResolved.activities.every((a) => !a.dependencies.includes('a-4')));

// 10) 版本比较按班级方案立即重算；复制结果
console.log('10. 版本比较与复制');
const baseSnap = snapshotOf(v1.meta, v1.activities);
const targetSnap = snapshotOf(v2.meta, v2.activities);
const rows = diffSnapshots(baseSnap, targetSnap);
assert('比较得出 a-5 被删除', rows.some((r) => r.id === 'a-5' && r.kind === 'removed'));
assert('比较得出 a-3 时长变化', rows.some((r) => r.id === 'a-3' && r.kind === 'changed' && r.detail.includes('时长')));
const planRows = diffSnapshots(
  snapshotOf(v2.meta, v2.activities),
  snapshotOf(resolvedUp.meta, resolvedUp.activities)
);
assert('当前模板 vs 本班方案：a-3 仍显示本地化差异', planRows.some((r) => r.id === 'a-3' && r.detail.includes('时长')));

// 11) 失败重试：升级草稿保留已算结果
console.log('11. 升级失败保留草稿');
const p3 = workspace.plans.find((p) => p.id === 'p-3')!;
assert('p3 仍停在旧版本', p3.templateVersionId === 'v-t1');
assert('p3 保留可重试的升级草稿且含 2 条待处理', p3.upgradeStage !== null && p3.upgradeStage.pending.length === 2);
const p3Resolved = resolvePlan(workspace, p3);
assert('重试前本班课程仍可正常解析（旧模板）', p3Resolved.activities.length === 8);
// 模拟重试提交
p3.templateVersionId = p3.upgradeStage!.targetVersionId;
p3.overrides = p3.upgradeStage!.overrides;
p3.pending = p3.upgradeStage!.pending;
p3.upgradeStage = null;
const p3After = resolvePlan(workspace, p3);
assert('重试成功后升级到 v2 且 a-5 待处理保留', p3.templateVersionId === 'v-t2' && p3.pending.length === 2 && !p3After.activities.some((a) => a.id === 'a-5'));
assert('p3 的课程标题本地覆盖在升级后保留', p3After.meta.title.includes('小三班'));

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed) process.exit(1);

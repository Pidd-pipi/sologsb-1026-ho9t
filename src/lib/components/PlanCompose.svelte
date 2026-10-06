<script lang="ts">
  import { Button, InlineNotification, Tag, TextInput, Tile } from 'carbon-components-svelte';
  import { workspaceStore } from '../store';
  import { ui, notify } from '../ui';
  import { findVersion, resolvePlan, metaState } from '../resolve';
  import type { ActivityFieldKey, FieldValue, MetaFieldKey, EffectiveActivity } from '../types';
  import { readText } from './events';
  import ActivitySidebar from './ActivitySidebar.svelte';
  import ActivityForm from './ActivityForm.svelte';
  import DependencyList from './DependencyList.svelte';
  import MetaFields from './MetaFields.svelte';
  import OfflineBanner from './OfflineBanner.svelte';

  $: plan = $workspaceStore.plans.find((item) => item.id === $ui.planId);
  $: template = plan && $workspaceStore.templates.find((item) => item.id === plan.templateId);
  $: version = plan && findVersion($workspaceStore, plan.templateId, plan.templateVersionId);
  $: offline = $workspaceStore.offline;
  $: isOffline = offline?.planId === $ui.planId;
  $: overrides = plan
    ? workspaceStore.offlineEffectiveOverrides($workspaceStore, plan)
    : ({ meta: {}, activities: {}, order: null } as const);
  $: effective = plan ? resolvePlan($workspaceStore, plan, overrides) : null;
  $: visible = effective?.activities ?? [];
  $: selected = visible.find((item) => item.id === $ui.planActivityId) ?? visible[0] ?? null;

  function selectActivity(id: string): void {
    ui.update((state) => ({ ...state, planActivityId: id }));
  }

  function badgeFor(field: ActivityFieldKey): 'inherited' | 'overridden' | 'conflict' {
    if (!selected) return 'inherited';
    if (selected.conflictFields.includes(field)) return 'conflict';
    if (selected.overriddenFields.includes(field)) return 'overridden';
    return 'inherited';
  }

  function setField(field: ActivityFieldKey, value: FieldValue): void {
    if (plan && selected) workspaceStore.setPlanActivityField(plan.id, selected.id, field, value);
  }

  function resetField(field: ActivityFieldKey): void {
    if (plan && selected) {
      if (badgeFor(field) === 'conflict') ui.update((s) => ({ ...s, view: 'issues' }));
      else workspaceStore.resetPlanActivityField(plan.id, selected.id, field);
    }
  }

  function toggleDependency(dependencyId: string, checked: boolean): void {
    if (plan && selected) workspaceStore.togglePlanDependency(plan.id, selected.id, dependencyId, checked);
  }

  function resetDependency(): void {
    if (plan && selected) {
      if (badgeFor('dependencies') === 'conflict') ui.update((s) => ({ ...s, view: 'issues' }));
      else workspaceStore.resetPlanActivityField(plan.id, selected.id, 'dependencies');
    }
  }

  function add(): void {
    if (!plan) return;
    const id = workspaceStore.addPlanActivity(plan.id, '练习');
    selectActivity(id);
  }

  function move(direction: -1 | 1): void {
    if (plan && selected) workspaceStore.movePlanActivity(plan.id, selected.id, direction);
  }

  function duplicate(): void {
    if (plan && selected) {
      const id = workspaceStore.duplicatePlanActivity(plan.id, selected.id);
      selectActivity(id);
    }
  }

  function remove(): void {
    if (!plan || !selected) return;
    if (selected.source === 'local') {
      if (!window.confirm(`删除本班自建活动“${selected.title}”？`)) return;
    } else if (!selected.hidden) {
      if (!window.confirm(`在本班停用模板活动“${selected.title}”？活动仍保留在模板中，可随时恢复。`)) return;
    }
    workspaceStore.deletePlanActivity(plan.id, selected.id);
  }

  function restore(): void {
    if (plan && selected) workspaceStore.restorePlanActivity(plan.id, selected.id);
  }

  function setMeta(field: MetaFieldKey, value: string): void {
    if (plan) workspaceStore.setPlanMeta(plan.id, field, value);
  }

  function resetMeta(field: MetaFieldKey): void {
    if (!plan || !effective) return;
    if (effective.conflictMeta.includes(field)) ui.update((s) => ({ ...s, view: 'issues' }));
    else workspaceStore.resetPlanMeta(plan.id, field);
  }

  function metaBadgeFor(field: MetaFieldKey): 'inherited' | 'overridden' | 'conflict' {
    if (!plan || !effective || !effective.templateVersion) return 'inherited';
    return metaState(plan, field, effective.templateVersion.meta);
  }

  function doUpgrade(): void {
    if (!plan || !template) return;
    const target = template.versions.at(-1);
    if (!target) return;
    const result = workspaceStore.startUpgrade(plan.id, target.id, $ui.simulateUpgradeFail);
    if (result.ok) notify('success', `已升级到“${target.label}”`, '本地覆盖项已保留；若有活动移除或依赖改向，已列入待处理事项。');
    else notify('error', '升级处理失败', result.error);
  }

  function retryUpgrade(): void {
    if (!plan?.upgradeStage) return;
    const result = workspaceStore.retryUpgrade(plan.id, $ui.simulateUpgradeFail);
    if (result.ok) notify('success', '升级草稿已成功提交');
    else notify('error', '重试失败', result.error);
  }

  $: newerVersion = template && plan && !plan.upgradeStage && template.versions.at(-1)?.id !== plan.templateVersionId
    ? template.versions.at(-1) ?? null
    : null;
</script>

{#if plan && effective && template && version}
  <OfflineBanner planId={plan.id} />

  {#if plan.upgradeStage}
    <div class="stage-banner">
      <InlineNotification
        kind="error"
        lowContrast
        title={`升级到“${plan.upgradeStage.targetLabel}”失败，班级草稿已保留（${plan.upgradeStage.pending.length} 条待处理）`}
        subtitle={`${plan.upgradeStage.error} 本班仍停留在 ${version.label}，其他班级不受影响。可在“版本与复用”页先处理草稿中的待处理事项，再重试。`}
      />
      <div class="stage-actions">
        <Button size="small" kind="primary" on:click={retryUpgrade}>重试提交</Button>
        <Button size="small" kind="ghost" on:click={() => { workspaceStore.discardUpgrade(plan.id); notify('info', '已放弃升级草稿，继续使用旧版本'); }}>放弃升级</Button>
        <label><input type="checkbox" bind:checked={$ui.simulateUpgradeFail} /> 模拟仍失败</label>
      </div>
    </div>
  {:else if newerVersion}
    <div class="stage-banner info">
      <InlineNotification
        kind="info"
        lowContrast
        title={`教研组已发布“${newerVersion.label}”，本班仍使用“${version.label}”`}
        subtitle="升级会保留本地覆盖；被移除活动与改向依赖会列为待处理，不会静默覆盖。"
      />
      <div class="stage-actions">
        <Button size="small" kind="primary" on:click={doUpgrade}>升级并保留覆盖</Button>
        <label><input type="checkbox" bind:checked={$ui.simulateUpgradeFail} /> 模拟处理失败</label>
      </div>
    </div>
  {/if}

  {#if isOffline}
    <div class="offline-edit-note">
      <Tag type="magenta" size="sm">平板视图</Tag>
      <span>当前显示基线模板 + 本机操作队列的预演结果；合并前不影响服务器与其他班级。</span>
    </div>
  {/if}

  <main class="compose-layout">
    <ActivitySidebar mode="plan" activities={visible} selectedId={selected?.id ?? ''} onSelect={selectActivity} onAdd={add} />

    <section class="editor-column">
      {#if selected}
        <div class="editor-toolbar">
          <div>
            <span class="kicker">CLASS PLAN · {plan.className}</span>
            <h3>{selected.title}</h3>
          </div>
          <div>
            <Button size="small" kind="ghost" disabled={visible[0]?.id === selected.id} on:click={() => move(-1)}>上移</Button>
            <Button size="small" kind="ghost" disabled={visible.at(-1)?.id === selected.id} on:click={() => move(1)}>下移</Button>
            <Button size="small" kind="ghost" on:click={duplicate}>复制</Button>
            {#if selected.hidden}
              <Button size="small" kind="tertiary" on:click={restore}>恢复使用</Button>
            {:else}
              <Button size="small" kind="danger-ghost" on:click={remove}>{selected.source === 'local' ? '删除' : '本班停用'}</Button>
            {/if}
          </div>
        </div>

        <Tile class="editor-card">
          <div class="card-source">
            {#if selected.source === 'local'}
              <Tag type="teal" size="sm">本班自建活动</Tag>
            {:else}
              <Tag type="cool-gray" size="sm">来自模板 · {version.label}</Tag>
              {#if selected.overriddenFields.length}<Tag type="blue" size="sm">{selected.overriddenFields.length} 个字段本地化</Tag>{/if}
            {/if}
          </div>
          <ActivityForm mode="plan" activity={selected} badgeFor={badgeFor} onField={setField} onReset={resetField} />
        </Tile>

        {#if selected.source === 'template'}
          <DependencyList
            candidates={visible.filter((activity) => !activity.hidden && activity.id !== selected.id)}
            dependencies={selected.dependencies}
            badge={badgeFor('dependencies') === 'inherited' ? null : badgeFor('dependencies')}
            onToggle={toggleDependency}
            onReset={resetDependency}
          />
        {/if}
      {/if}
    </section>

    <aside class="inspector">
      <Tile class="compact-card">
        <span class="kicker">CLASS META · 仅存覆盖项</span>
        <h3>班级课程信息</h3>
        <MetaFields meta={effective.meta} badgeFor={metaBadgeFor} onSet={setMeta} onReset={resetMeta} />
        <TextInput labelText="班级名称" value={plan.className} on:input={(e) => workspaceStore.renamePlan(plan.id, readText(e))} />
      </Tile>

      <Tile class="compact-card">
        <span class="kicker">INHERITANCE</span>
        <h3>覆盖项统计</h3>
        <ul class="override-summary">
          <li>模板活动：{version.activities.length} 个；本班自建：{visible.filter((a) => a.source === 'local').length} 个；停用：{visible.filter((a) => a.hidden).length} 个</li>
          <li>字段覆盖：{visible.reduce((sum, a) => sum + a.overriddenFields.length, 0)} 处</li>
          <li>待处理事项：{plan.pending.length + (plan.upgradeStage?.pending.length ?? 0)} 条</li>
        </ul>
        <Button size="small" kind="ghost" on:click={() => ui.update((s) => ({ ...s, view: 'issues' }))}>去处理</Button>
      </Tile>
    </aside>
  </main>
{/if}

<style lang="postcss">
  .stage-banner { margin: 12px 22px 0; padding: 12px 16px; border: 1px solid #ffb3b8; background: #fff1f1; }
  .stage-banner.info { border-color: #a6c8ff; background: #edf5ff; }
  .stage-actions { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
  .stage-actions label { display: flex; align-items: center; gap: 6px; color: #6f6f6f; font-size: 11px; }
  .offline-edit-note { display: flex; align-items: center; gap: 10px; margin: 12px 22px 0; padding: 10px 14px; background: #fff0f7; font-size: 12px; }
  .card-source { display: flex; gap: 8px; margin-bottom: 12px; }
  .override-summary { margin: 0 0 12px; padding-left: 16px; color: #525252; font-size: 12px; line-height: 1.9; }
</style>

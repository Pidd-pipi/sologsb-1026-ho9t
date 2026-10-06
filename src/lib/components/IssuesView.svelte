<script lang="ts">
  import { Button, Tag, Tile } from 'carbon-components-svelte';
  import { workspaceStore } from '../store';
  import { ui, notify } from '../ui';
  import { findVersion, resolvePlan } from '../resolve';
  import { analyze } from '../analysis';

  export let mode: 'template' | 'plan' = 'plan';

  $: template = $workspaceStore.templates.find((item) => item.id === $ui.templateId);
  $: plan = $workspaceStore.plans.find((item) => item.id === $ui.planId);

  $: resolved = mode === 'plan' && plan
    ? resolvePlan($workspaceStore, plan, workspaceStore.offlineEffectiveOverrides($workspaceStore, plan))
    : null;

  // 模板草稿直接构造有效视图（不走版本）
  $: draftEffective = mode === 'template' && template
    ? {
        meta: template.draftMeta,
        overriddenMeta: [],
        conflictMeta: [],
        activities: template.draftActivities.map((a) => ({ ...a, source: 'template' as const, hidden: false, overriddenFields: [], conflictFields: [] })),
        templateVersion: null,
        templateMissing: false
      }
    : null;

  $: activePending = plan
    ? plan.upgradeStage
      ? plan.upgradeStage.pending
      : plan.pending
    : [];
  $: effectiveForCheck = mode === 'template' ? draftEffective : resolved;
  $: diagnostics = effectiveForCheck
    ? analyze(effectiveForCheck, effectiveForCheck.activities, mode === 'plan' ? activePending : [])
    : [];
  $: errorCount = diagnostics.filter((d) => d.level === 'error').length;
  $: warningCount = diagnostics.filter((d) => d.level === 'warning').length;

  function focus(activityId: string): void {
    if (!activityId) return;
    ui.update((s) => ({ ...s, view: 'compose', planActivityId: activityId, templateActivityId: activityId }));
  }

  function resolveItem(pendingId: string, action: 'retain-local' | 'follow-template' | 'follow' | 'keep-dependency' | 'choose-local' | 'choose-remote' | 'inherit-template'): void {
    if (!plan) return;
    workspaceStore.resolvePlanPending(plan.id, pendingId, action, Boolean(plan.upgradeStage));
    notify('success', '待处理事项已裁决');
  }

  $: pendingById = new Map(activePending.map((item) => [item.id, item]));
</script>

<main class="issues-view">
  <div class="view-heading">
    <div>
      <span class="kicker">CURRICULUM QA</span>
      <h2>质量检查{mode === 'plan' ? ` · ${plan?.className}` : ' · 模板草稿'}</h2>
      <p>模板或依赖一变，本页立即按当前班级方案重算；待处理事项处理完即自动消失。</p>
    </div>
    <div class="issue-summary"><span><b>{errorCount}</b> 必须处理</span><span><b>{warningCount}</b> 建议调整</span><span><b>{diagnostics.length}</b> 全部提示</span></div>
  </div>

  <div class="issue-board">
    {#each diagnostics as issue, index (issue.id)}
      {@const pending = issue.pendingId ? pendingById.get(issue.pendingId) : null}
      <article class:critical={issue.level === 'error'} class:caution={issue.level === 'warning'} class:info={issue.level === 'info'}>
        <span class="issue-index">{String(index + 1).padStart(2, '0')}</span>
        <div>
          <div class="issue-meta">
            <Tag type={issue.level === 'error' ? 'red' : issue.level === 'warning' ? 'magenta' : 'blue'}>{issue.category}</Tag>
            <small>{issue.level === 'error' ? '必须处理' : issue.level === 'warning' ? '建议调整' : '教学提示'}</small>
          </div>
          <h3>{issue.title}</h3>
          <p>{issue.detail}</p>
          {#if pending?.kind === 'field-conflict'}
            <div class="conflict-values">
              <div class="conflict-box local"><b>平板/本机值</b><span>{renderValue(pending.localValue)}</span></div>
              <div class="conflict-box remote"><b>教研组侧值</b><span>{renderValue(pending.remoteValue)}</span></div>
            </div>
          {/if}
          {#if pending}
            <div class="pending-actions">
              {#if pending.kind === 'activity-removed'}
                <Button size="small" kind="primary" on:click={() => resolveItem(pending.id, 'retain-local')}>转为本班活动保留</Button>
                <Button size="small" kind="ghost" on:click={() => resolveItem(pending.id, 'follow-template')}>跟随模板移除</Button>
              {:else if pending.kind === 'dependency-redirected'}
                <Button size="small" kind="primary" on:click={() => resolveItem(pending.id, 'follow')}>跟随新依赖</Button>
                <Button size="small" kind="ghost" on:click={() => resolveItem(pending.id, 'keep-dependency')}>保留旧依赖（活动补回本班）</Button>
              {:else}
                <Button size="small" kind="primary" on:click={() => resolveItem(pending.id, 'choose-local')}>采用本机值</Button>
                <Button size="small" kind="tertiary" on:click={() => resolveItem(pending.id, 'choose-remote')}>采用教研组侧值</Button>
                <Button size="small" kind="ghost" on:click={() => resolveItem(pending.id, 'inherit-template')}>都放弃，继承模板</Button>
              {/if}
              {#if plan?.upgradeStage}<Tag type="magenta" size="sm">写入升级草稿</Tag>{/if}
            </div>
          {/if}
        </div>
        {#if issue.activityId && !pending}
          <Button size="small" kind="ghost" on:click={() => focus(issue.activityId)}>定位活动</Button>
        {/if}
      </article>
    {:else}
      <Tile class="all-clear"><h3>检查通过</h3><p>教学顺序、反馈、无障碍说明与模板升级事项均已完成。</p></Tile>
    {/each}
  </div>
</main>

{#snippet renderValue(value: unknown)}
  {#if Array.isArray(value)}{value.join('、') || '（空）'}{:else}{value ?? '—'}{/if}
{/snippet}

<style lang="postcss">
  .conflict-values { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; max-width: 640px; }
  .conflict-box { padding: 10px 12px; border: 1px solid #d8d8d8; }
  .conflict-box.local { border-left: 4px solid #0f62fe; background: #edf5ff; }
  .conflict-box.remote { border-left: 4px solid #007d79; background: #d9fbfb; }
  .conflict-box b { display: block; font-size: 10px; color: #525252; }
  .conflict-box span { font-size: 13px; }
  .pending-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
</style>

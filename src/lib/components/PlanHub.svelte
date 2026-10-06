<script lang="ts">
  import { Button, Select, SelectItem, Tag, Tile } from 'carbon-components-svelte';
  import { workspaceStore } from '../store';
  import { ui, notify } from '../ui';
  import { findVersion, resolvePlan } from '../resolve';
  import { diffSnapshots, snapshotOf } from '../diff';
  import { computeUpgrade } from '../upgrade';
  import { formatTime, totalDuration } from '../utils';
  import { readText } from './events';
  import type { DiffSnapshot } from '../types';

  $: plan = $workspaceStore.plans.find((item) => item.id === $ui.planId);
  $: template = plan && $workspaceStore.templates.find((item) => item.id === plan.templateId);
  $: currentVersion = plan && template && findVersion($workspaceStore, template.id, plan.templateVersionId);
  $: effective = plan ? resolvePlan($workspaceStore, plan, workspaceStore.offlineEffectiveOverrides($workspaceStore, plan)) : null;

  $: upgradePreview = plan && template && template.versions.at(-1) && template.versions.at(-1)!.id !== plan.templateVersionId && !plan.upgradeStage
    ? computeUpgrade(template, plan, template.versions.at(-1)!)
    : null;

  $: sideOptions = plan && template
    ? [
        { id: 'current', label: `当前钉住：${currentVersion?.label ?? '?'}（原始模板）` },
        { id: 'plan', label: '本班方案（模板＋覆盖，实时解析）' },
        ...template.versions.map((version) => ({ id: version.id, label: `模板版本：${version.label}` })),
        ...(plan.upgradeStage ? [{ id: 'stage', label: `升级草稿：${plan.upgradeStage.targetLabel}` }] : [])
      ]
    : [];

  function snapshotFor(side: string): DiffSnapshot | null {
    if (!plan || !template) return null;
    if (side === 'current') {
      const version = findVersion($workspaceStore, template.id, plan.templateVersionId);
      return version ? snapshotOf(version.meta, version.activities) : null;
    }
    if (side === 'plan') {
      const resolved = resolvePlan($workspaceStore, plan, workspaceStore.offlineEffectiveOverrides($workspaceStore, plan));
      return snapshotOf(resolved.meta, resolved.activities);
    }
    if (side === 'stage' && plan.upgradeStage) {
      const stagedPlan = { ...plan, templateVersionId: plan.upgradeStage.targetVersionId, overrides: plan.upgradeStage.overrides };
      const resolved = resolvePlan($workspaceStore, stagedPlan, plan.upgradeStage.overrides);
      return snapshotOf(resolved.meta, resolved.activities);
    }
    const version = template.versions.find((item) => item.id === side);
    return version ? snapshotOf(version.meta, version.activities) : null;
  }

  $: baseSide = sideOptions.some((o) => o.id === ($ui.planCompareBase || 'current')) ? ($ui.planCompareBase || 'current') : 'current';
  $: targetSide = sideOptions.some((o) => o.id === $ui.planCompareTarget) ? $ui.planCompareTarget : 'plan';
  $: baseSnapshot = snapshotFor(baseSide);
  $: targetSnapshot = snapshotFor(targetSide);
  $: rows = baseSnapshot && targetSnapshot ? diffSnapshots(baseSnapshot, targetSnapshot) : [];

  function upgrade(): void {
    if (!plan || !template?.versions.at(-1)) return;
    const result = workspaceStore.startUpgrade(plan.id, template.versions.at(-1)!.id, $ui.simulateUpgradeFail);
    if (result.ok) notify('success', '升级完成', '本地覆盖保留，待处理事项见质量检查页。');
    else notify('error', '升级失败', result.error);
  }

  function retry(): void {
    if (!plan?.upgradeStage) return;
    const result = workspaceStore.retryUpgrade(plan.id, $ui.simulateUpgradeFail);
    if (result.ok) notify('success', '升级草稿提交成功');
    else notify('error', '重试失败', result.error);
  }

  function duplicate(): void {
    if (!plan) return;
    const id = workspaceStore.duplicatePlan(plan.id);
    ui.update((s) => ({ ...s, planId: id }));
    notify('success', '已复制班级方案', '复制结果已按新方案立即重算。');
  }
</script>

{#if plan && template && effective}
  <main class="versions-view">
    <div class="view-heading">
      <div>
        <span class="kicker">CLASS PLAN REUSE</span>
        <h2>版本、升级与复制 · {plan.className}</h2>
        <p>方案只存覆盖项；升级模板时保留依赖、时长与说明的本地改动，移除/改向列入待处理。</p>
      </div>
      <div class="version-actions">
        <Button kind="tertiary" on:click={duplicate}>复制本班方案</Button>
      </div>
    </div>

    <div class="version-layout-svelte">
      <Tile class="version-timeline">
        <div class="section-title"><div><span class="kicker">TEMPLATE LIFECYCLE</span><h3>模板与升级</h3></div></div>
        <article class="latest">
          <span class="timeline-dot"></span>
          <div>
            <b>当前使用</b>
            <h4>{currentVersion?.label}</h4>
            <p>{formatTime(currentVersion?.savedAt ?? '')} · {currentVersion?.activities.length ?? 0} 个活动 · 本班 {effective.activities.filter((a) => a.source === 'local').length} 个自建</p>
          </div>
        </article>

        {#if plan.upgradeStage}
          <div class="stage-card">
            <Tag type="red" size="sm">处理失败 · 草稿保留</Tag>
            <h4>待提交：{plan.upgradeStage.targetLabel}</h4>
            <p>{plan.upgradeStage.error}</p>
            <p>草稿中含 {plan.upgradeStage.pending.length} 条待处理，可先到质量检查页裁决（写入草稿），再重试。</p>
            <div class="stage-buttons">
              <Button size="small" kind="primary" on:click={retry}>重试提交</Button>
              <Button size="small" kind="ghost" on:click={() => { workspaceStore.discardUpgrade(plan.id); notify('info', '已放弃升级'); }}>放弃</Button>
              <label><input type="checkbox" bind:checked={$ui.simulateUpgradeFail} /> 模拟仍失败</label>
            </div>
          </div>
        {:else if upgradePreview}
          <div class="stage-card pending-upgrade">
            <Tag type="blue" size="sm">可升级</Tag>
            <h4>{template.versions.at(-1)?.label}</h4>
            <p>{template.versions.at(-1)?.note}</p>
            <ul>
              <li>升级后新增/保留活动：自动并入学习路径</li>
              <li>将产生 {upgradePreview.pending.length} 条待处理（移除活动、依赖改向）</li>
              <li>本班已有覆盖项全部保留</li>
            </ul>
            <div class="stage-buttons">
              <Button size="small" kind="primary" on:click={upgrade}>升级并保留覆盖</Button>
              <label><input type="checkbox" bind:checked={$ui.simulateUpgradeFail} /> 模拟处理失败</label>
            </div>
          </div>
        {:else}
          <div class="stage-card ok">
            <Tag type="green" size="sm">已是最新</Tag>
            <p>本班方案使用的就是教研组最新发布版本。</p>
          </div>
        {/if}

        <div class="version-list">
          <b>模板全部版本（其他班级仍可继续使用旧版）</b>
          {#each template.versions as version (version.id)}
            <div class="mini-version">
              <span>{version.label}</span>
              <small>{formatTime(version.savedAt)} · {totalDuration(version.activities)} 分钟</small>
              {#if version.id === plan.templateVersionId}<Tag type="blue" size="sm">本班</Tag>{/if}
            </div>
          {/each}
        </div>
      </Tile>

      <Tile class="diff-card">
        <div class="section-title"><div><span class="kicker">COMPARE BY PLAN</span><h3>按班级方案比较</h3><p>两侧均为实时解析结果：模板、依赖或覆盖一变，比较立即重算。</p></div></div>
        <div class="compare-pickers">
          <Select labelText="基准" selected={baseSide} on:change={(e) => ui.update((s) => ({ ...s, planCompareBase: readText(e) }))}>
            {#each sideOptions as option}<SelectItem value={option.id} text={option.label} />{/each}
          </Select>
          <Select labelText="目标" selected={targetSide} on:change={(e) => ui.update((s) => ({ ...s, planCompareTarget: readText(e) }))}>
            {#each sideOptions as option}<SelectItem value={option.id} text={option.label} />{/each}
          </Select>
        </div>
        <div class="diff-list">
          {#each rows as row (row.id + row.kind)}
            <article class={row.kind}><span>{row.kind === 'added' ? '新增' : row.kind === 'removed' ? '删除' : '变化'}</span><div><b>{row.title}</b><p>{row.detail}</p></div></article>
          {:else}
            <p class="empty-state">两侧没有差异。</p>
          {/each}
        </div>
      </Tile>
    </div>
  </main>
{/if}

<style lang="postcss">
  .stage-card { margin-top: 14px; padding: 14px; border-left: 4px solid #da1e28; background: #fff1f1; }
  .stage-card.pending-upgrade { border-left-color: #0f62fe; background: #edf5ff; }
  .stage-card.ok { border-left-color: #198038; background: #defbe6; }
  .stage-card h4 { margin: 8px 0 4px; font-size: 13px; }
  .stage-card p, .stage-card li { color: #525252; font-size: 11px; line-height: 1.7; }
  .stage-buttons { display: flex; align-items: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
  .stage-buttons label { display: flex; gap: 5px; align-items: center; font-size: 11px; color: #6f6f6f; }
  .version-list { margin-top: 16px; border-top: 1px solid #e0e0e0; padding-top: 12px; }
  .version-list > b { font-size: 11px; color: #0f62fe; }
  .mini-version { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px dashed #e0e0e0; font-size: 12px; }
  .mini-version small { color: #8d8d8d; }
</style>

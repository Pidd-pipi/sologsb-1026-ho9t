<script lang="ts">
  import { Button, Select, SelectItem, Tag, Tile } from 'carbon-components-svelte';
  import { workspaceStore } from '../store';
  import { ui, notify } from '../ui';
  import { diffSnapshots, snapshotOf } from '../diff';
  import { formatTime, totalDuration } from '../utils';
  import { readText } from './events';

  $: template = $workspaceStore.templates.find((item) => item.id === $ui.templateId);
  $: versions = template?.versions ?? [];

  $: baseVersion = versions.find((v) => v.id === $ui.templateBaseVersionId) ?? versions[0] ?? null;
  $: targetVersion = versions.find((v) => v.id === $ui.templateTargetVersionId) ?? versions.at(-1) ?? null;
  $: rows = baseVersion && targetVersion
    ? diffSnapshots(snapshotOf(baseVersion.meta, baseVersion.activities), snapshotOf(targetVersion.meta, targetVersion.activities))
    : [];

  function duplicate(): void {
    if (!template) return;
    const id = workspaceStore.duplicateTemplate(template.id);
    ui.update((s) => ({ ...s, templateId: id }));
    notify('success', '已复制为新模板', '副本拥有独立活动 id，不影响任何现有班级。');
  }
</script>

<main class="versions-view">
  <div class="view-heading">
    <div>
      <span class="kicker">TEMPLATE VERSIONS</span>
      <h2>模板发布与版本比较 · {template?.draftMeta.title}</h2>
      <p>发布版本不可变；班级钉在指定版本上，教研组继续改草稿或发新版都不会覆盖班级。</p>
    </div>
    <div class="version-actions">
      <Button kind="tertiary" on:click={duplicate}>复制模板</Button>
    </div>
  </div>

  <div class="version-layout-svelte">
    <Tile class="version-timeline">
      <div class="section-title">
        <div><span class="kicker">TIMELINE</span><h3>已发布版本</h3></div>
        <Tag type="cool-gray">{versions.length} 个版本</Tag>
      </div>
      {#each versions as version, index (version.id)}
        <article class:latest={index === versions.length - 1}>
          <span class="timeline-dot"></span>
          <div>
            <b>{version.label}</b>
            {#if index === versions.length - 1}<Tag type="green" size="sm">最新</Tag>{/if}
            <h4>{version.note}</h4>
            <p>{formatTime(version.savedAt)} · {version.activities.length} 个活动 · {totalDuration(version.activities)} 分钟</p>
            <div class="used-by">
              {#each $workspaceStore.plans.filter((p) => p.templateId === template?.id && p.templateVersionId === version.id) as plan (plan.id)}
                <Tag type="blue" size="sm">{plan.className}</Tag>
              {/each}
            </div>
          </div>
        </article>
      {:else}
        <p class="empty-state">还没有发布版本，请在编排页发布第一版。</p>
      {/each}
      <div class="draft-box">
        <b>当前草稿</b>
        <p>{template?.draftActivities.length ?? 0} 个活动 · {template?.draftNote || '未填写版本说明'}</p>
        <Tag type="magenta" size="sm">未发布，班级不可见</Tag>
      </div>
    </Tile>

    <Tile class="diff-card">
      <div class="section-title"><div><span class="kicker">COMPARE</span><h3>比较两个发布版本</h3></div></div>
      {#if versions.length >= 2}
        <div class="compare-pickers">
          <Select labelText="基准版本" selected={baseVersion?.id} on:change={(e) => ui.update((s) => ({ ...s, templateBaseVersionId: readText(e) }))}>
            {#each versions as version}<SelectItem value={version.id} text={`${version.label} · ${formatTime(version.savedAt)}`} />{/each}
          </Select>
          <Select labelText="目标版本" selected={targetVersion?.id} on:change={(e) => ui.update((s) => ({ ...s, templateTargetVersionId: readText(e) }))}>
            {#each versions as version}<SelectItem value={version.id} text={`${version.label} · ${formatTime(version.savedAt)}`} />{/each}
          </Select>
        </div>
        <div class="diff-list">
          {#each rows as row (row.id + row.kind)}
            <article class={row.kind}><span>{row.kind === 'added' ? '新增' : row.kind === 'removed' ? '删除' : '变化'}</span><div><b>{row.title}</b><p>{row.detail}</p></div></article>
          {:else}
            <p class="empty-state">两个版本之间没有差异。</p>
          {/each}
        </div>
      {:else}
        <p class="empty-state">至少发布两个版本后才能比较。</p>
      {/if}
    </Tile>
  </div>
</main>

<style lang="postcss">
  .used-by { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
  .draft-box { margin-top: 14px; padding: 14px; border: 1px dashed #f1c21b; background: #fffdf5; }
  .draft-box b { font-size: 12px; }
  .draft-box p { margin: 6px 0; color: #6f6f6f; font-size: 11px; }
</style>

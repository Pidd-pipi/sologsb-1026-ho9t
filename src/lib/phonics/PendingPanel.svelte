<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button, InlineNotification, Tag, Tile } from 'carbon-components-svelte';
  import type { ClassPlan, PendingItem, Resolution, Template } from './types';
  import { FIELD_LABELS, formatTime } from './fields';

  export let plan: ClassPlan;
  export let template: Template;

  const dispatch = createEventDispatcher<{
    resolve: { itemId: string; resolution: Resolution };
    apply: void;
    discard: void;
    retry: void;
    upgrade: string;
  }>();

  $: draft = plan.draft;
  $: items = draft ? draft.pendingItems : plan.pendingItems;
  $: targetVersion = template.versions.find((version) => version.id === draft?.targetVersionId);
  $: latestVersion = template.versions.at(-1);
  $: canUpgrade = latestVersion && latestVersion.id !== plan.baseVersionId;

  function kindLabel(kind: PendingItem['kind']): string {
    return kind === 'field-conflict'
      ? '字段冲突'
      : kind === 'dependency-redirect'
        ? '依赖改向'
        : kind === 'activity-removed'
          ? '活动移除'
          : '依赖缺失';
  }

  function kindTag(kind: PendingItem['kind']): 'red' | 'magenta' | 'blue' | 'cool-gray' {
    if (kind === 'field-conflict') return 'magenta';
    if (kind === 'dependency-redirect' || kind === 'dependency-missing') return 'red';
    return 'blue';
  }

  function valueText(value: unknown): string {
    if (value === undefined) return '—';
    if (Array.isArray(value)) return value.length ? value.join('、') : '（空）';
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>;
      if (typeof record.title === 'string') return record.title;
      return Object.entries(record)
        .map(([key, val]) => `${key}: ${JSON.stringify(val)}`)
        .join('；');
    }
    return String(value);
  }

  function resolutions(item: PendingItem): Array<{ key: Resolution; label: string; kind: 'primary' | 'tertiary' | 'ghost' }> {
    if (item.kind === 'field-conflict' || item.kind === 'dependency-redirect') {
      return [
        { key: 'local', label: '采用本地', kind: 'primary' },
        { key: 'template', label: '采用模板', kind: 'tertiary' },
        { key: 'both', label: '保留两份', kind: 'ghost' }
      ];
    }
    if (item.kind === 'activity-removed') {
      return [
        { key: 'local', label: '保留本地活动', kind: 'primary' },
        { key: 'remove', label: '随模板移除', kind: 'tertiary' }
      ];
    }
    return [{ key: 'dismiss', label: '移除失效依赖', kind: 'primary' }];
  }
</script>

<Tile class="pending-panel">
  <div class="section-title">
    <div>
      <span class="kicker">PENDING CHANGES</span>
      <h3>待处理事项</h3>
      <p>模板升级或依赖变化后，班级方案需要确认的冲突与失效引用。</p>
    </div>
    <Tag type={items.length ? 'red' : 'green'}>{items.length} 项待处理</Tag>
  </div>

  {#if draft}
    <InlineNotification
      lowContrast
      kind={draft.error ? 'error' : 'info'}
      title={draft.error ? '升级处理失败，草稿已保留' : '有未应用的升级草稿'}
      subtitle={draft.error ?? `目标版本：${targetVersion?.label ?? draft.targetVersionId} · 生成于 ${formatTime(draft.savedAt)}`}
    />
    <div class="draft-actions">
      {#if draft.error}
        <Button size="small" kind="primary" on:click={() => dispatch('retry')}>重试合并</Button>
      {:else}
        <Button size="small" kind="primary" on:click={() => dispatch('apply')}>应用草稿并升级基线</Button>
      {/if}
      <Button size="small" kind="ghost" on:click={() => dispatch('discard')}>放弃草稿</Button>
    </div>
  {:else if canUpgrade}
    <InlineNotification
      lowContrast
      kind="info"
      title="模板有新版本可用"
      subtitle={`当前基线：${template.versions.find((v) => v.id === plan.baseVersionId)?.label ?? plan.baseVersionId} → 最新：${latestVersion?.label}。升级时会保留本班覆盖项。`}
    />
    <div class="draft-actions">
      <Button size="small" kind="tertiary" on:click={() => dispatch('upgrade', latestVersion?.id ?? '')}>升级到最新模板</Button>
    </div>
  {/if}

  <div class="pending-list">
    {#each items as item (item.id)}
      <article class="pending-card">
        <div class="pending-head">
          <Tag type={kindTag(item.kind)}>{kindLabel(item.kind)}</Tag>
          <b>{item.activityTitle}</b>
          {#if item.field}<small>{FIELD_LABELS[item.field]}</small>{/if}
        </div>
        <p class="pending-message">{item.message}</p>
        {#if item.kind === 'field-conflict' || item.kind === 'dependency-redirect'}
          <div class="pending-values">
            <div><span>基线版本</span><code>{valueText(item.baseValue)}</code></div>
            <div><span>本班覆盖</span><code class="local">{valueText(item.localValue)}</code></div>
            <div><span>模板新值</span><code class="remote">{valueText(item.templateValue)}</code></div>
          </div>
        {:else if item.kind === 'activity-removed'}
          <div class="pending-values">
            <div><span>本地保留字段</span><code class="local">{valueText(item.localValue)}</code></div>
          </div>
        {/if}
        <div class="pending-resolve">
          {#each resolutions(item) as action}
            <Button
              size="small"
              kind={action.kind}
              disabled={item.resolution === action.key || (item.resolution === 'both' && action.key !== 'both')}
              on:click={() => dispatch('resolve', { itemId: item.id, resolution: action.key })}
            >
              {#if item.resolution === action.key}✓ {/if}{action.label}
            </Button>
          {/each}
        </div>
      </article>
    {:else}
      {#if !draft}
        <p class="empty-state">没有待处理事项。模板升级后，冲突和失效依赖会列在这里。</p>
      {/if}
    {/each}
  </div>
</Tile>

<style>
  .draft-actions { display: flex; gap: 8px; margin: 10px 0 14px; }
  .pending-list { display: grid; gap: 8px; margin-top: 10px; }
  .pending-card { padding: 14px 16px; border: 1px solid #e0e0e0; border-left: 4px solid #8a3ffc; background: #fff; }
  .pending-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .pending-head b { font-size: 13px; }
  .pending-head small { color: #6f6f6f; font-size: 10px; }
  .pending-message { margin: 0 0 8px; color: #525252; font-size: 12px; line-height: 1.6; }
  .pending-values { display: grid; gap: 4px; margin-bottom: 10px; }
  .pending-values > div { display: grid; grid-template-columns: 90px 1fr; gap: 8px; align-items: baseline; }
  .pending-values span { color: #8d8d8d; font-size: 10px; }
  .pending-values code { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: #393939; word-break: break-all; }
  .pending-values code.local { color: #007d79; }
  .pending-values code.remote { color: #0043ce; }
  .pending-resolve { display: flex; gap: 6px; flex-wrap: wrap; }
</style>

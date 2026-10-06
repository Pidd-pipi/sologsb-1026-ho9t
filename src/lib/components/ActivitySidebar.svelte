<script lang="ts">
  import { Button } from 'carbon-components-svelte';
  import type { EffectiveActivity } from '../types';

  export let activities: EffectiveActivity[];
  export let selectedId = '';
  export let mode: 'template' | 'plan' = 'template';
  export let onSelect: (id: string) => void = () => {};
  export let onAdd: () => void = () => {};
</script>

<aside class="activity-sidebar">
  <div class="sidebar-heading">
    <div><span class="kicker">LESSON MAP</span><h3>学习活动</h3></div>
    <Button size="small" kind="ghost" on:click={onAdd}>添加</Button>
  </div>
  <div class="type-legend">
    {#each ['音素', '单词', '句子', '练习'] as type}
      <span><i class:practice={type === '练习'} class:phoneme={type === '音素'} class:word={type === '单词'} class:sentence={type === '句子'}></i>{type}</span>
    {/each}
  </div>
  <div class="activity-list">
    {#each activities as activity, index (activity.id)}
      <button class:selected={activity.id === selectedId} class:dimmed={activity.hidden} class="activity-row" on:click={() => onSelect(activity.id)}>
        <span class="sequence">{String(index + 1).padStart(2, '0')}</span>
        <span class="activity-type {activity.type}">{activity.type}</span>
        <span class="activity-copy">
          <b>
            {activity.title}
            {#if mode === 'plan' && activity.source === 'local'}<em class="local-tag">本班</em>{/if}
            {#if mode === 'plan' && activity.hidden}<em class="hidden-tag">已停用</em>{/if}
            {#if mode === 'plan' && activity.conflictFields.length}<em class="conflict-tag">冲突</em>{/if}
            {#if mode === 'plan' && activity.overriddenFields.length && activity.source !== 'local'}<em class="ov-tag">覆盖</em>{/if}
          </b>
          <small>{activity.duration} 分钟 · 难度 {activity.difficulty}/5</small>
        </span>
        {#if activity.dependencies.length}<i title="有前置依赖">↳</i>{/if}
      </button>
    {/each}
  </div>
  <div class="sidebar-help">
    {#if mode === 'template'}
      教研组在此修改模板；发布版本后才会对班级可见。
    {:else}
      班级只保存覆盖项；“覆盖”可随时还原为模板值，模板升级不会冲掉。
    {/if}
  </div>
</aside>

<style lang="postcss">
  .activity-copy em { margin-left: 5px; padding: 1px 4px; font-size: 9px; font-style: normal; border-radius: 2px; vertical-align: 1px; }
  .local-tag { color: #005d5d; background: #d9fbfb; }
  .hidden-tag { color: #6f6f6f; background: #e0e0e0; }
  .conflict-tag { color: #a2191f; background: #ffd7d9; }
  .ov-tag { color: #0043ce; background: #d0e2ff; }
  .activity-row.dimmed { opacity: .55; }
</style>

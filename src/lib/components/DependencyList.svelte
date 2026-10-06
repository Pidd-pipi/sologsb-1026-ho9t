<script lang="ts">
  import { Checkbox, Tag } from 'carbon-components-svelte';
  import type { Activity, ActivityFieldKey } from '../types';
  import { readChecked } from './events';

  export let candidates: Activity[] = [];
  export let dependencies: string[] = [];
  export let disabled = false;
  export let badge: 'inherited' | 'overridden' | 'conflict' | null = null;
  export let onToggle: (dependencyId: string, checked: boolean) => void = () => {};
  export let onReset: () => void = () => {};
</script>

<div class="dependency-card">
  <div class="section-title">
    <div>
      <span class="kicker">PREREQUISITES</span>
      <h3>前置活动与依赖关系</h3>
      <p>勾选后表示必须先完成该活动；模板升级导致依赖改向时会在质量检查中列出待处理。</p>
    </div>
    <div class="dep-side">
      {#if badge === 'overridden'}
        <Tag type="blue" size="sm">依赖已本地化</Tag>
        <button class="reset-link" on:click={onReset}>跟随模板依赖</button>
      {:else if badge === 'conflict'}
        <Tag type="red" size="sm">两份待裁决</Tag>
      {/if}
      <Tag type="cool-gray">{dependencies.length} 个依赖</Tag>
    </div>
  </div>
  <div class="dependency-grid">
    {#each candidates as activity (activity.id)}
      <Checkbox
        labelText={`${activity.title} · ${activity.type}`}
        checked={dependencies.includes(activity.id)}
        disabled={disabled}
        on:change={(e) => onToggle(activity.id, readChecked(e))}
      />
    {/each}
  </div>
</div>

<style lang="postcss">
  .dep-side { display: flex; align-items: center; gap: 8px; }
  .reset-link { border: 0; padding: 0; color: #0f62fe; background: none; font-size: 11px; cursor: pointer; text-decoration: underline; white-space: nowrap; }
</style>

<script lang="ts">
  import { workspaceStore } from '../store';
  import { ui, type PreviewWidth } from '../ui';
  import { resolvePlan } from '../resolve';
  import { totalDuration } from '../utils';

  export let mode: 'template' | 'plan' = 'plan';

  $: template = $workspaceStore.templates.find((item) => item.id === $ui.templateId) ?? null;
  $: plan = $workspaceStore.plans.find((item) => item.id === $ui.planId) ?? null;

  $: planEffective = mode === 'plan' && plan && template
    ? resolvePlan($workspaceStore, plan, workspaceStore.offlineEffectiveOverrides($workspaceStore, plan))
    : null;

  $: meta = mode === 'template' ? template?.draftMeta : planEffective?.meta;
  $: activities = (mode === 'template' ? template?.draftActivities : planEffective?.activities.filter((a) => !a.hidden)) ?? [];
  $: total = totalDuration(activities);

  function titleOf(id: string): string {
    return activities.find((activity) => activity.id === id)?.title ?? id;
  }

  const widths: Array<{ id: PreviewWidth; label: string }> = [
    { id: 'phone', label: '手机' },
    { id: 'tablet', label: '平板' },
    { id: 'desktop', label: '桌面' }
  ];

  function setWidth(id: PreviewWidth): void {
    ui.update((state) => ({ ...state, previewWidth: id }));
  }
</script>

<main class="path-view">
  <div class="path-toolbar">
    <div>
      <span class="kicker">RESPONSIVE SEQUENCE</span>
      <h2>学习顺序预览</h2>
      <p>{mode === 'plan' ? '按当前班级方案（模板＋覆盖）实时解析；模板升级或依赖改向会立即反映。' : '按教研组草稿解析；发布前班级看不到这些变化。'}</p>
    </div>
    <div class="width-switcher">
      {#each widths as item (item.id)}
        <button class:active={$ui.previewWidth === item.id} on:click={() => setWidth(item.id)}>{item.label}</button>
      {/each}
    </div>
  </div>
  <div class="preview-stage">
    <div class="device-preview {$ui.previewWidth}">
      <div class="device-bar"><span></span><b>{$ui.previewWidth === 'phone' ? '390 px' : $ui.previewWidth === 'tablet' ? '768 px' : '1200 px'}</b></div>
      <div class="lesson-preview">
        <header><span>今日学习 · {mode === 'plan' ? plan?.className : '模板草稿'}</span><h3>{meta?.title}</h3><p>{meta?.objective}</p></header>
        {#each activities as activity, index (activity.id)}
          <article>
            <div class="lesson-number">{index + 1}</div>
            <div class="lesson-type {activity.type}">{activity.type}</div>
            <div class="lesson-content">
              <h4>
                {activity.title}
                {#if mode === 'plan' && 'source' in activity && activity.source === 'local'}<em class="src-tag">本班</em>{/if}
              </h4>
              <p>{activity.content}</p>
              {#if activity.prompt}<blockquote>{activity.prompt}</blockquote>{/if}
              <div class="lesson-tags">
                {#each activity.phonemes as phoneme}<span>{phoneme}</span>{/each}
                <em>{activity.duration} 分钟</em>
              </div>
              {#if activity.dependencies.length}<small>前置：{activity.dependencies.map(titleOf).filter(Boolean).join('、')}</small>{/if}
            </div>
          </article>
        {/each}
        <footer>课程结束 · 预计 {total} 分钟</footer>
      </div>
    </div>
  </div>
</main>

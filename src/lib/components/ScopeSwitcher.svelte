<script lang="ts">
  import { Select, SelectItem, Button } from 'carbon-components-svelte';
  import { workspaceStore } from '../store';
  import { ui } from '../ui';
  import { findVersion } from '../resolve';
  import { readText } from './events';

  function selectTemplate(id: string): void {
    ui.update((state) => {
      const template = $workspaceStore.templates.find((item) => item.id === id);
      return { ...state, scope: 'template', templateId: id, templateActivityId: template?.draftActivities[0]?.id ?? '' };
    });
  }

  function selectPlan(id: string): void {
    ui.update((state) => {
      const plan = $workspaceStore.plans.find((item) => item.id === id);
      const version = plan && findVersion($workspaceStore, plan.templateId, plan.templateVersionId);
      return { ...state, scope: 'plan', planId: id, planActivityId: version?.activities[0]?.id ?? plan?.overrides.order?.[0] ?? '' };
    });
  }

  function newPlan(): void {
    const currentPlan = $workspaceStore.plans.find((item) => item.id === $ui.planId);
    const templateId = currentPlan?.templateId ?? $ui.templateId;
    const id = workspaceStore.createPlan(templateId, `新班级 ${$workspaceStore.plans.length + 1}`);
    selectPlan(id);
  }

  function newTemplate(): void {
    const id = workspaceStore.createTemplate();
    selectTemplate(id);
  }
</script>

<div class="scope-bar">
  <div class="scope-switch" role="tablist" aria-label="工作范围">
    <button
      role="tab"
      class:active={$ui.scope === 'template'}
      aria-selected={$ui.scope === 'template'}
      on:click={() => ui.update((s) => ({ ...s, scope: 'template' }))}
    >教研组 · 课程模板</button>
    <button
      role="tab"
      class:active={$ui.scope === 'plan'}
      aria-selected={$ui.scope === 'plan'}
      on:click={() => ui.update((s) => ({ ...s, scope: 'plan' }))}
    >老师 · 班级方案</button>
  </div>

  {#if $ui.scope === 'template'}
    <div class="scope-selectors">
      <Select hideLabel labelText="模板" selected={$ui.templateId} on:change={(e) => selectTemplate(readText(e))}>
        {#each $workspaceStore.templates as template (template.id)}
          <SelectItem value={template.id} text={template.draftMeta.title} />
        {/each}
      </Select>
      <Button kind="ghost" size="small" on:click={newTemplate}>新建模板</Button>
    </div>
  {:else}
    <div class="scope-selectors">
      <Select hideLabel labelText="班级" selected={$ui.planId} on:change={(e) => selectPlan(readText(e))}>
        {#each $workspaceStore.plans as plan (plan.id)}
          {@const template = $workspaceStore.templates.find((t) => t.id === plan.templateId)}
          {@const version = template?.versions.find((v) => v.id === plan.templateVersionId)}
          <SelectItem value={plan.id} text={`${plan.className} · ${template?.draftMeta.title ?? '模板缺失'} @ ${version?.label ?? '?'}`} />
        {/each}
      </Select>
      <Button kind="ghost" size="small" on:click={newPlan}>从模板建班</Button>
    </div>
  {/if}
</div>

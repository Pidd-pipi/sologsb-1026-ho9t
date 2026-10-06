<script lang="ts">
  import { onMount } from 'svelte';
  import { InlineNotification } from 'carbon-components-svelte';
  import { workspaceStore } from '../lib/store';
  import { ui } from '../lib/ui';
  import { findVersion, resolvePlan } from '../lib/resolve';
  import { analyze } from '../lib/analysis';
  import { totalDuration } from '../lib/utils';
  import Header from '../lib/components/Header.svelte';
  import ScopeSwitcher from '../lib/components/ScopeSwitcher.svelte';
  import WorkspaceTabs from '../lib/components/WorkspaceTabs.svelte';
  import Hero from '../lib/components/Hero.svelte';
  import TemplateCompose from '../lib/components/TemplateCompose.svelte';
  import PlanCompose from '../lib/components/PlanCompose.svelte';
  import PathView from '../lib/components/PathView.svelte';
  import IssuesView from '../lib/components/IssuesView.svelte';
  import TemplateHub from '../lib/components/TemplateHub.svelte';
  import PlanHub from '../lib/components/PlanHub.svelte';

  $: template = $workspaceStore.templates.find((item) => item.id === $ui.templateId);
  $: plan = $workspaceStore.plans.find((item) => item.id === $ui.planId);
  $: version = plan && findVersion($workspaceStore, plan.templateId, plan.templateVersionId);
  $: resolved = plan ? resolvePlan($workspaceStore, plan, workspaceStore.offlineEffectiveOverrides($workspaceStore, plan)) : null;
  $: diagnostics = resolved ? analyze(resolved, resolved.activities, plan!.upgradeStage ? plan!.upgradeStage.pending : plan!.pending) : [];
  $: templateActivities = $ui.scope === 'template'
    ? template?.draftActivities.map((a) => ({ ...a, source: 'template' as const, hidden: false, overriddenFields: [], conflictFields: [] })) ?? []
    : [];
  $: templateDiagnostics = template ? analyze(
    { meta: template.draftMeta, overriddenMeta: [], conflictMeta: [], activities: templateActivities, templateVersion: null, templateMissing: false },
    templateActivities,
    []
  ) : [];
  $: errorCount = diagnostics.filter((d) => d.level === 'error').length;
  $: warningCount = diagnostics.filter((d) => d.level === 'warning').length;
  $: templateErrorCount = templateDiagnostics.filter((d) => d.level === 'error').length;

  $: heroKicker = $ui.scope === 'template'
    ? `TEMPLATE / ${template?.draftMeta.level ?? ''}`
    : `CLASS PLAN / ${plan?.className ?? ''} @ ${version?.label ?? '?'}`;
  $: heroTitle = $ui.scope === 'template' ? template?.draftMeta.title ?? '' : resolved?.meta.title ?? '';
  $: heroSubtitle = $ui.scope === 'template'
    ? `${template?.draftMeta.objective ?? ''} · 教研组草稿，发布后班级才可见`
    : `${resolved?.meta.objective ?? ''} · 只保存相对模板的覆盖项`;
  $: heroActivities = $ui.scope === 'template' ? template?.draftActivities ?? [] : resolved?.activities ?? [];
  $: pendingCount = plan ? plan.pending.length + (plan.upgradeStage?.pending.length ?? 0) : 0;
  $: heroStats = [
    { value: heroActivities.length, label: '活动', tone: undefined },
    { value: totalDuration(heroActivities), label: '分钟', tone: undefined },
    {
      value: $ui.scope === 'plan' ? errorCount : templateErrorCount,
      label: '必修问题',
      tone: ($ui.scope === 'plan' ? errorCount : templateErrorCount) ? ('critical' as const) : ('ok' as const)
    },
    {
      value: $ui.scope === 'plan' ? pendingCount : template?.versions.length ?? 0,
      label: $ui.scope === 'plan' ? '待处理' : '已发布版本',
      tone: $ui.scope === 'plan' && pendingCount ? ('caution' as const) : undefined
    }
  ];

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  $: if ($ui.toast) {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.update((s) => ({ ...s, toast: null })), 4600);
  }

  onMount(() => () => { if (toastTimer) clearTimeout(toastTimer); });

  function handleKeyboard(event: KeyboardEvent): void {
    const modifier = event.ctrlKey || event.metaKey;
    const tag = (event.target as HTMLElement)?.tagName;
    const editing = tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement)?.isContentEditable;
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? workspaceStore.redo() : workspaceStore.undo();
    } else if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      workspaceStore.redo();
    } else if (!editing && event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      const order = ['compose', 'path', 'issues', 'versions'] as const;
      const index = order.indexOf($ui.view);
      if (index > 0) ui.update((s) => ({ ...s, view: order[index - 1] }));
    } else if (!editing && event.altKey && event.key === 'ArrowRight') {
      event.preventDefault();
      const order = ['compose', 'path', 'issues', 'versions'] as const;
      const index = order.indexOf($ui.view);
      if (index < order.length - 1) ui.update((s) => ({ ...s, view: order[index + 1] }));
    }
  }
</script>

<svelte:window on:keydown={handleKeyboard} />

<div class="app-frame">
  <Header />
  <ScopeSwitcher />

  {#if $ui.toast}
    <div class="toast-layer">
      <InlineNotification
        lowContrast
        kind={$ui.toast.kind}
        title={$ui.toast.title}
        subtitle={$ui.toast.subtitle}
        on:close={() => ui.update((s) => ({ ...s, toast: null }))}
      />
    </div>
  {/if}

  <Hero kicker={heroKicker} title={heroTitle} subtitle={heroSubtitle} stats={heroStats} />
  <WorkspaceTabs />

  {#if $ui.scope === 'template'}
    {#if $ui.view === 'compose'}<TemplateCompose />
    {:else if $ui.view === 'path'}<PathView mode="template" />
    {:else if $ui.view === 'issues'}<IssuesView mode="template" />
    {:else}<TemplateHub />{/if}
  {:else}
    {#if $ui.view === 'compose'}<PlanCompose />
    {:else if $ui.view === 'path'}<PathView mode="plan" />
    {:else if $ui.view === 'issues'}<IssuesView mode="plan" />
    {:else}<PlanHub />{/if}
  {/if}

  <footer class="app-footer">
    <span>数据保存在本机 localStorage · 班级方案仅保存覆盖项，模板版本不可变</span>
    <span>Ctrl/⌘+Z 撤销 · Ctrl/⌘+Y 重做 · Alt+←/→ 切换工作台</span>
  </footer>
</div>

<script lang="ts">
  import { Button, Tag, TextArea, TextInput, Tile } from 'carbon-components-svelte';
  import { workspaceStore } from '../store';
  import { ui, notify } from '../ui';
  import type { ActivityFieldKey, FieldValue } from '../types';
  import { readText } from './events';
  import ActivitySidebar from './ActivitySidebar.svelte';
  import ActivityForm from './ActivityForm.svelte';
  import DependencyList from './DependencyList.svelte';
  import type { EffectiveActivity } from '../types';

  $: template = $workspaceStore.templates.find((item) => item.id === $ui.templateId);
  $: activities = template?.draftActivities ?? [];
  $: selected = activities.find((item) => item.id === $ui.templateActivityId) ?? activities[0] ?? null;
  $: effective = activities.map((activity): EffectiveActivity => ({
    ...activity,
    source: 'template',
    hidden: false,
    overriddenFields: [],
    conflictFields: []
  }));

  function selectActivity(id: string): void {
    ui.update((state) => ({ ...state, templateActivityId: id }));
  }

  function field(field: ActivityFieldKey, value: FieldValue): void {
    if (template && selected) workspaceStore.editTemplateActivity(template.id, selected.id, field, value);
  }

  function add(): void {
    if (!template) return;
    const id = workspaceStore.addTemplateActivity(template.id, '练习');
    selectActivity(id);
  }

  function move(direction: -1 | 1): void {
    if (template && selected) workspaceStore.moveTemplateActivity(template.id, selected.id, direction);
  }

  function duplicate(): void {
    if (!template || !selected) return;
    const id = workspaceStore.duplicateTemplateActivity(template.id, selected.id);
    selectActivity(id);
  }

  function remove(): void {
    if (!template || !selected) return;
    if (!window.confirm(`从模板草稿删除“${selected.title}”？已发布版本与其他班级不受影响。`)) return;
    workspaceStore.deleteTemplateActivity(template.id, selected.id);
  }

  function toggleDependency(dependencyId: string, checked: boolean): void {
    if (template && selected) workspaceStore.toggleTemplateDependency(template.id, selected.id, dependencyId, checked);
  }
</script>

{#if template && selected}
  <main class="compose-layout">
    <ActivitySidebar mode="template" activities={effective} selectedId={selected.id} onSelect={selectActivity} onAdd={add} />

    <section class="editor-column">
      <div class="editor-toolbar">
        <div>
          <span class="kicker">TEMPLATE DRAFT · 教研组草稿</span>
          <h3>{selected.type}活动</h3>
        </div>
        <div>
          <Button size="small" kind="ghost" disabled={activities[0]?.id === selected.id} on:click={() => move(-1)}>上移</Button>
          <Button size="small" kind="ghost" disabled={activities.at(-1)?.id === selected.id} on:click={() => move(1)}>下移</Button>
          <Button size="small" kind="ghost" on:click={duplicate}>复制</Button>
          <Button size="small" kind="danger-ghost" on:click={remove}>删除</Button>
        </div>
      </div>

      <Tile class="editor-card">
        <ActivityForm mode="template" activity={selected} onField={field} />
      </Tile>

      <DependencyList
        candidates={activities.filter((activity) => activity.id !== selected.id)}
        dependencies={selected.dependencies}
        onToggle={toggleDependency}
      />
    </section>

    <aside class="inspector">
      <Tile class="compact-card">
        <span class="kicker">TEMPLATE META</span>
        <h3>模板课程信息</h3>
        <TextInput labelText="课程名称" value={template.draftMeta.title} on:input={(e) => workspaceStore.editTemplateMeta(template.id, 'title', readText(e))} />
        <TextInput labelText="课程等级" value={template.draftMeta.level} on:input={(e) => workspaceStore.editTemplateMeta(template.id, 'level', readText(e))} />
        <TextInput labelText="适用年龄" value={template.draftMeta.ageRange} on:input={(e) => workspaceStore.editTemplateMeta(template.id, 'ageRange', readText(e))} />
        <TextArea labelText="学习目标" rows={3} value={template.draftMeta.objective} on:input={(e) => workspaceStore.editTemplateMeta(template.id, 'objective', readText(e))} />
      </Tile>
      <Tile class="compact-card">
        <span class="kicker">PUBLISH</span>
        <h3>发布新版本</h3>
        <p class="empty-state">
          已发布 {template.versions.length} 个版本。已发布版本不可变；班级钉在各自版本上，发布不会覆盖任何班级。
        </p>
        <TextArea labelText="版本说明" rows={2} value={template.draftNote} on:input={(e) => workspaceStore.editDraftNote(template.id, readText(e))} />
        <label class="switch-row">
          <input type="checkbox" bind:checked={$ui.simulatePublishFail} />
          <span>模拟发布失败（验证草稿保留与重试）</span>
        </label>
        <Button
          kind="primary"
          size="small"
          on:click={() => {
            const result = workspaceStore.publishTemplate(template.id, `版本 ${template.versions.length + 1}`, template.draftNote, $ui.simulatePublishFail);
            if (result.ok) notify('success', '新版本已发布', '未升级的班级继续使用旧版本；老师可在班级页主动升级。');
            else notify('error', '发布失败', result.error);
          }}
        >发布新版本</Button>
        {#if template.versions.length}
          <Button
            kind="ghost"
            size="small"
            on:click={() => {
              workspaceStore.resetDraftToVersion(template.id, template.versions.at(-1)!.id);
              notify('info', '草稿已回退到最近发布版本');
            }}
          >草稿回退到最近版本</Button>
        {/if}
      </Tile>
    </aside>
  </main>
{:else if template}
  <Tile class="empty-tile">模板草稿中还没有活动，点击“添加”开始编排。</Tile>
{/if}

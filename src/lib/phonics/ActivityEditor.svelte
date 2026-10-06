<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    Button,
    Checkbox,
    Select,
    SelectItem,
    Tag,
    TextArea,
    TextInput,
    Tile
  } from 'carbon-components-svelte';
  import type { Activity, ActivityField, ActivityType } from './types';

  export let activities: Activity[];
  export let selectedId: string;
  export let overrides: Record<string, Partial<Activity>> = {};
  export let localIds: Set<string> = new Set();
  export let contextLabel = '课程模板';

  const dispatch = createEventDispatcher<{
    select: string;
    update: { field: ActivityField; value: unknown };
    'update-phonemes': string;
    add: ActivityType;
    delete: void;
    duplicate: void;
    move: -1 | 1;
    'toggle-dep': { depId: string; checked: boolean };
  }>();

  $: selected = activities.find((activity) => activity.id === selectedId) ?? activities[0] ?? null;
  $: selectedOverride = selected ? overrides[selected.id] : undefined;
  $: overrideCount = selectedOverride ? Object.keys(selectedOverride).length : 0;

  function readText(event: Event): string {
    const custom = event as CustomEvent<{ value?: string; text?: string } | string>;
    if (typeof custom.detail === 'string') return custom.detail;
    if (typeof custom.detail === 'number') return String(custom.detail);
    if (custom.detail?.value) return custom.detail.value;
    if (custom.detail?.text) return custom.detail.text;
    const target = (event.currentTarget ?? event.target) as HTMLInputElement | HTMLTextAreaElement | null;
    return target?.value ?? '';
  }

  function readNumber(event: Event): number {
    return Number(readText(event));
  }

  function readChecked(event: Event): boolean {
    const custom = event as CustomEvent<{ checked?: boolean } | boolean>;
    if (typeof custom.detail === 'boolean') return custom.detail;
    if (typeof custom.detail?.checked === 'boolean') return custom.detail.checked;
    const target = (event.currentTarget ?? event.target) as HTMLInputElement | null;
    return Boolean(target?.checked);
  }

  function fieldOverridden(field: ActivityField): boolean {
    return selectedOverride?.[field] !== undefined;
  }
</script>

<aside class="activity-sidebar">
  <div class="sidebar-heading">
    <div>
      <span class="kicker">LESSON MAP</span>
      <h3>学习活动</h3>
    </div>
    <Button size="small" kind="ghost" on:click={() => dispatch('add', '练习')}>添加</Button>
  </div>
  <div class="type-legend">
    {#each ['音素', '单词', '句子', '练习'] as type}
      <span><i class:practice={type === '练习'} class:phoneme={type === '音素'}></i>{type}</span>
    {/each}
  </div>
  <div class="activity-list">
    {#each activities as activity, index (activity.id)}
      <button
        class:selected={activity.id === selectedId}
        class="activity-row"
        on:click={() => dispatch('select', activity.id)}
      >
        <span class="sequence">{String(index + 1).padStart(2, '0')}</span>
        <span class="activity-type {activity.type}">{activity.type}</span>
        <span class="activity-copy">
          <b>{activity.title}</b>
          <small>{activity.duration} 分钟 · 难度 {activity.difficulty}/5</small>
        </span>
        {#if overrides[activity.id] && Object.keys(overrides[activity.id]).length}
          <i class="override-dot" title="有本地覆盖">●</i>
        {:else if localIds.has(activity.id)}
          <i class="local-tag" title="班级本地新增">班</i>
        {:else if activity.dependencies.length}
          <i title="有前置依赖">↳</i>
        {/if}
      </button>
    {/each}
  </div>
  <div class="sidebar-help">当前编辑：{contextLabel} · 快捷键 Alt + N 新建 · Alt + ↑/↓ 调整顺序</div>
</aside>

<section class="editor-column">
  {#if selected}
    <div class="editor-toolbar">
      <div>
        <span class="kicker">ACTIVITY EDITOR</span>
        <h3>{selected.type}活动</h3>
        {#if overrideCount}
          <Tag type="blue">已覆盖 {overrideCount} 项（仅本班方案）</Tag>
        {/if}
        {#if localIds.has(selected.id)}
          <Tag type="teal">班级本地新增</Tag>
        {/if}
      </div>
      <div>
        <Button size="small" kind="ghost" disabled={activities[0]?.id === selected.id} on:click={() => dispatch('move', -1)}>上移</Button>
        <Button size="small" kind="ghost" disabled={activities.at(-1)?.id === selected.id} on:click={() => dispatch('move', 1)}>下移</Button>
        <Button size="small" kind="ghost" on:click={() => dispatch('duplicate')}>复制</Button>
        <Button size="small" kind="danger-ghost" on:click={() => dispatch('delete')}>删除</Button>
      </div>
    </div>

    <Tile class="editor-card">
      <div class="form-grid">
        <TextInput
          labelText="活动标题{fieldOverridden('title') ? '（已覆盖）' : ''}"
          value={selected.title}
          on:input={(event) => dispatch('update', { field: 'title', value: readText(event) })}
        />
        <Select
          labelText="活动类型{fieldOverridden('type') ? '（已覆盖）' : ''}"
          selected={selected.type}
          on:change={(event) => dispatch('update', { field: 'type', value: readText(event) })}
        >
          <SelectItem value="音素" text="音素" />
          <SelectItem value="单词" text="单词" />
          <SelectItem value="句子" text="句子" />
          <SelectItem value="练习" text="练习活动" />
        </Select>
        <TextInput
          labelText="预计时长（分钟）{fieldOverridden('duration') ? '（已覆盖）' : ''}"
          type="number"
          min="1"
          max="60"
          value={String(selected.duration)}
          on:input={(event) => dispatch('update', { field: 'duration', value: readNumber(event) })}
        />
        <div class="difficulty-field">
          <label for="difficulty">难度：{selected.difficulty}/5{fieldOverridden('difficulty') ? '（已覆盖）' : ''}</label>
          <input
            id="difficulty"
            type="range"
            min="1"
            max="5"
            value={selected.difficulty}
            on:input={(event) => dispatch('update', { field: 'difficulty', value: readNumber(event) })}
          />
        </div>
      </div>
      <TextArea
        labelText={selected.type === '音素' ? '音素内容' : selected.type === '句子' ? '目标句子' : '教学内容'}
        rows={3}
        value={selected.content}
        on:input={(event) => dispatch('update', { field: 'content', value: readText(event) })}
      />
      <TextInput
        labelText="涉及音素（用逗号或空格分隔）"
        value={selected.phonemes.join(', ')}
        on:input={(event) => dispatch('update-phonemes', readText(event))}
      />
      <TextArea
        labelText="教师提示语{fieldOverridden('prompt') ? '（已覆盖）' : ''}"
        rows={2}
        value={selected.prompt}
        on:input={(event) => dispatch('update', { field: 'prompt', value: readText(event) })}
      />
      <TextArea
        labelText="无障碍说明{fieldOverridden('accessibility') ? '（已覆盖）' : ''}"
        rows={2}
        value={selected.accessibility}
        on:input={(event) => dispatch('update', { field: 'accessibility', value: readText(event) })}
      />
      <TextArea
        labelText={selected.type === '练习' ? '练习反馈（必填）' : '学习反馈'}
        rows={2}
        value={selected.feedback}
        on:input={(event) => dispatch('update', { field: 'feedback', value: readText(event) })}
      />
    </Tile>

    <Tile class="dependency-card">
      <div class="section-title">
        <div>
          <span class="kicker">PREREQUISITES</span>
          <h3>前置活动与依赖关系</h3>
          <p>只有完成选中的活动后，系统才会按当前顺序推荐本活动。</p>
        </div>
        <Tag type="cool-gray">{selected.dependencies.length} 个依赖</Tag>
      </div>
      <div class="dependency-grid">
        {#each activities.filter((activity) => activity.id !== selected?.id) as activity (activity.id)}
          <Checkbox
            labelText={`${activity.title} · ${activity.type}`}
            checked={selected.dependencies.includes(activity.id)}
            on:change={(event) => dispatch('toggle-dep', { depId: activity.id, checked: readChecked(event) })}
          />
        {/each}
      </div>
    </Tile>
  {/if}
</section>

<style>
  .override-dot { color: #0f62fe; font-size: 10px; font-style: normal; }
  .local-tag { color: #007d79; font-size: 10px; font-style: normal; border: 1px solid #007d79; border-radius: 3px; padding: 0 3px; }
  .editor-toolbar > div:first-child { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
</style>

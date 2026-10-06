<script lang="ts">
  import { Button, Select, SelectItem, Tag, TextArea, TextInput } from 'carbon-components-svelte';
  import type { Activity, ActivityFieldKey, ActivityType, FieldValue } from '../types';
  import { parsePhonemes, readNumber, readText } from './events';

  export let activity: Activity;
  export let mode: 'template' | 'plan' = 'template';
  export let disabled = false;
  export let badgeFor: ((field: ActivityFieldKey) => 'inherited' | 'overridden' | 'conflict') | null = null;
  export let onField: (field: ActivityFieldKey, value: FieldValue) => void = () => {};
  export let onReset: (field: ActivityFieldKey) => void = () => {};
</script>

{#snippet badge(field: ActivityFieldKey)}
  {#if mode === 'plan' && badgeFor}
    {@const state = badgeFor(field)}
    {#if state === 'overridden'}
      <span class="field-badge"><Tag type="blue" size="sm">本地覆盖</Tag><button class="reset-link" on:click={() => onReset(field)}>还原为模板值</button></span>
    {:else if state === 'conflict'}
      <span class="field-badge"><Tag type="red" size="sm">两份待裁决</Tag><button class="reset-link" on:click={() => onReset(field)}>去版本页裁决</button></span>
    {/if}
  {/if}
{/snippet}

<div class="activity-form" class:readonly={disabled}>
  <div class="form-grid">
    <div class="field-wrap">
      <TextInput labelText="活动标题" value={activity.title} disabled={disabled} on:input={(e) => onField('title', readText(e))} />
      {@render badge('title')}
    </div>
    <div class="field-wrap">
      <Select labelText="活动类型" selected={activity.type} disabled={disabled} on:change={(e) => onField('type', readText(e) as ActivityType)}>
        <SelectItem value="音素" text="音素" />
        <SelectItem value="单词" text="单词" />
        <SelectItem value="句子" text="句子" />
        <SelectItem value="练习" text="练习活动" />
      </Select>
      {@render badge('type')}
    </div>
    <div class="field-wrap">
      <TextInput labelText="预计时长（分钟）" type="number" min="1" max="60" value={String(activity.duration)} disabled={disabled} on:input={(e) => onField('duration', readNumber(e))} />
      {@render badge('duration')}
    </div>
    <div class="difficulty-field">
      <label for="difficulty-range">难度：{activity.difficulty}/5</label>
      <input id="difficulty-range" type="range" min="1" max="5" value={activity.difficulty} disabled={disabled} on:input={(e) => onField('difficulty', readNumber(e))} />
      {@render badge('difficulty')}
    </div>
  </div>

  <div class="field-wrap">
    <TextArea labelText={activity.type === '音素' ? '音素内容' : activity.type === '句子' ? '目标句子' : '教学内容'} rows={3} value={activity.content} disabled={disabled} on:input={(e) => onField('content', readText(e))} />
    {@render badge('content')}
  </div>
  <div class="field-wrap">
    <TextInput labelText="涉及音素（用逗号或空格分隔）" value={activity.phonemes.join(', ')} disabled={disabled} on:input={(e) => onField('phonemes', parsePhonemes(readText(e)))} />
    {@render badge('phonemes')}
  </div>
  <div class="field-wrap">
    <TextArea labelText="教师提示语" rows={2} value={activity.prompt} disabled={disabled} on:input={(e) => onField('prompt', readText(e))} />
    {@render badge('prompt')}
  </div>
  <div class="field-wrap">
    <TextArea labelText="无障碍说明" rows={2} value={activity.accessibility} disabled={disabled} on:input={(e) => onField('accessibility', readText(e))} />
    {@render badge('accessibility')}
  </div>
  <div class="field-wrap">
    <TextArea labelText={activity.type === '练习' ? '练习反馈（必填）' : '学习反馈'} rows={2} value={activity.feedback} disabled={disabled} on:input={(e) => onField('feedback', readText(e))} />
    {@render badge('feedback')}
  </div>
</div>

<style lang="postcss">
  .field-badge { display: flex; align-items: center; gap: 8px; margin: -4px 0 10px; }
  .reset-link { border: 0; padding: 0; color: #0f62fe; background: none; font-size: 11px; cursor: pointer; text-decoration: underline; }
  .field-wrap { min-width: 0; }
  .readonly :global(input), .readonly :global(textarea) { color: #525252; }
</style>

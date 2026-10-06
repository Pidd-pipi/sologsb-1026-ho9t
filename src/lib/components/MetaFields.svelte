<script lang="ts">
  import { Tag, TextArea, TextInput } from 'carbon-components-svelte';
  import type { CourseMeta, MetaFieldKey } from '../types';

  export let meta: CourseMeta;
  export let badgeFor: (field: MetaFieldKey) => 'inherited' | 'overridden' | 'conflict';
  export let onSet: (field: MetaFieldKey, value: string) => void;
  export let onReset: (field: MetaFieldKey) => void;

  import { readText } from './events';
</script>

<div class="field-wrap">
  <TextInput labelText="课程名称" value={meta.title} on:input={(e) => onSet('title', readText(e))} />
  {#if badgeFor('title') !== 'inherited'}
    <span class="field-badge">
      <Tag type={badgeFor('title') === 'conflict' ? 'red' : 'blue'} size="sm">{badgeFor('title') === 'conflict' ? '两份待裁决' : '本地覆盖'}</Tag>
      <button class="reset-link" on:click={() => onReset('title')}>{badgeFor('title') === 'conflict' ? '去裁决' : '还原模板值'}</button>
    </span>
  {/if}
</div>
<div class="field-wrap">
  <TextInput labelText="课程等级" value={meta.level} on:input={(e) => onSet('level', readText(e))} />
  {#if badgeFor('level') !== 'inherited'}
    <span class="field-badge">
      <Tag type={badgeFor('level') === 'conflict' ? 'red' : 'blue'} size="sm">{badgeFor('level') === 'conflict' ? '两份待裁决' : '本地覆盖'}</Tag>
      <button class="reset-link" on:click={() => onReset('level')}>{badgeFor('level') === 'conflict' ? '去裁决' : '还原模板值'}</button>
    </span>
  {/if}
</div>
<div class="field-wrap">
  <TextInput labelText="适用年龄" value={meta.ageRange} on:input={(e) => onSet('ageRange', readText(e))} />
  {#if badgeFor('ageRange') !== 'inherited'}
    <span class="field-badge">
      <Tag type={badgeFor('ageRange') === 'conflict' ? 'red' : 'blue'} size="sm">{badgeFor('ageRange') === 'conflict' ? '两份待裁决' : '本地覆盖'}</Tag>
      <button class="reset-link" on:click={() => onReset('ageRange')}>{badgeFor('ageRange') === 'conflict' ? '去裁决' : '还原模板值'}</button>
    </span>
  {/if}
</div>
<div class="field-wrap">
  <TextArea labelText="学习目标" rows={3} value={meta.objective} on:input={(e) => onSet('objective', readText(e))} />
  {#if badgeFor('objective') !== 'inherited'}
    <span class="field-badge">
      <Tag type={badgeFor('objective') === 'conflict' ? 'red' : 'blue'} size="sm">{badgeFor('objective') === 'conflict' ? '两份待裁决' : '本地覆盖'}</Tag>
      <button class="reset-link" on:click={() => onReset('objective')}>{badgeFor('objective') === 'conflict' ? '去裁决' : '还原模板值'}</button>
    </span>
  {/if}
</div>

<style lang="postcss">
  .field-badge { display: flex; align-items: center; gap: 8px; margin: -4px 0 10px; }
  .reset-link { border: 0; padding: 0; color: #0f62fe; background: none; font-size: 11px; cursor: pointer; text-decoration: underline; }
</style>

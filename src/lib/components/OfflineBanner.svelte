<script lang="ts">
  import { Button, Checkbox, InlineNotification } from 'carbon-components-svelte';
  import { workspaceStore } from '../store';
  import { ui, notify } from '../ui';
  import { findVersion } from '../resolve';
  import { formatTime } from '../utils';
  import { readChecked } from './events';

  export let planId: string;

  $: offline = $workspaceStore.offline;
  $: active = offline?.planId === planId;
  $: plan = $workspaceStore.plans.find((item) => item.id === planId);
  $: template = plan && $workspaceStore.templates.find((item) => item.id === plan.templateId);
  $: version = plan && template && findVersion($workspaceStore, template.id, plan.templateVersionId);
  $: ops = active && offline ? offline.ops : [];
  $: counts = plan && active && offline ? workspaceStore.previewOfflineOps($workspaceStore, plan) : { fieldCount: 0, structureCount: 0 };

  function begin(): void {
    workspaceStore.beginOffline(planId);
    notify('info', '已进入平板断网模式', '改动进入操作队列；现在可以模拟教研组发布新版本或他机修改，再回来合并。');
  }

  function remotePublish(): void {
    if (!template) return;
    const id = workspaceStore.simulateRemotePublish(template.id);
    if (id) notify('info', '教研组发布了新版本（模拟）', '平板仍停在断网基线版本，回来合并时会自动做结构升级。');
  }

  // 选择一个和老师在平板上同改的字段（默认 a-3 时长，与示例引导一致）
  function remoteSameField(): void {
    workspaceStore.simulateRemoteOverride('act', 'a-3', 'duration', 9);
    notify('info', '他机已修改 a-3 时长为 9（模拟）', '若平板上也改了同一字段，合并时将保留两份并列出待裁决。');
  }

  function mergeBack(): void {
    const result = workspaceStore.mergeBack(planId, $ui.simulateMergeFail);
    if (result.ok) {
      notify('success', '平板改动已合并', '同字段两边都改的取值已各保留一份，请在“质量检查/版本”页裁决待处理事项。');
    } else {
      notify('error', '合并失败', result.error);
    }
  }

  function retry(): void {
    const result = workspaceStore.retryMerge(planId, $ui.simulateMergeFail);
    if (result.ok) notify('success', '重试成功，合并完成');
    else notify('error', '重试失败', result.error);
  }
</script>

{#if !active && !offline}
  <div class="offline-entry">
    <Button kind="tertiary" size="small" on:click={begin}>📱 平板断网编辑</Button>
    <Checkbox labelText="模拟回来合并时失败" bind:checked={$ui.simulateMergeFail} />
  </div>
{:else if active && offline}
  <div class="offline-panel">
    <InlineNotification
      lowContrast
      kind="warning"
      title={`平板断网中 · 自 ${formatTime(offline.startedAt)}`}
      subtitle={`${ops.length} 个操作（${counts.fieldCount} 个字段修改、${counts.structureCount} 个结构操作）暂存本机，基线为 ${version?.label ?? '?'}`}
    />
    <div class="offline-actions">
      <Button size="small" kind="ghost" on:click={remotePublish}>模拟教研组发布新版本</Button>
      <Button size="small" kind="ghost" on:click={remoteSameField}>模拟他机改 a-3 时长</Button>
      <Button size="small" kind="ghost" disabled={ops.length === 0} on:click={() => workspaceStore.undoOfflineOp()}>撤销最后操作</Button>
      <Button size="small" kind="danger-ghost" on:click={() => { if (window.confirm('放弃本次平板上的全部断网改动？')) { workspaceStore.cancelOffline(planId); notify('info', '已放弃断网会话'); } }}>放弃会话</Button>
      <Button size="small" kind="primary" on:click={mergeBack}>恢复联网并合并</Button>
    </div>
    {#if offline.mergeError}
      <div class="merge-error">
        <InlineNotification lowContrast kind="error" title="合并失败，班级草稿已保留" subtitle={offline.mergeError} />
        <Button size="small" kind="primary" on:click={retry}>重试合并</Button>
      </div>
    {/if}
    <p class="hint">建议演示路径：先改“拼读短词：sat”的时长，再点“模拟他机改 a-3 时长”，然后合并 → 同一字段保留两份。</p>
  </div>
{:else if offline}
  <div class="offline-locked"><InlineNotification lowContrast kind="info" title="另一台平板正在断网编辑" subtitle="合并前该班级之外的切换仅允许查看；请回到对应班级完成合并。" /></div>
{/if}

<style lang="postcss">
  .offline-entry { display: flex; align-items: center; gap: 16px; margin: 12px 22px 0; }
  .offline-panel { margin: 12px 22px 0; padding: 14px 16px; border: 1px solid #f1c21b; background: #fffdf5; }
  .offline-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .merge-error { margin-top: 10px; display: flex; align-items: center; gap: 12px; }
  .hint { margin: 10px 0 0; color: #8d8d8d; font-size: 11px; }
  .offline-locked { margin: 12px 22px 0; }
</style>

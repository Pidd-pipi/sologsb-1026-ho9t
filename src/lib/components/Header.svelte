<script lang="ts">
  import { Button } from 'carbon-components-svelte';
  import { workspaceStore, history } from '../store';
  import { notify } from '../ui';
  import { formatTime } from '../utils';

  let online = true;
  if (typeof navigator !== 'undefined') online = navigator.onLine;

  function updateNetwork(): void {
    online = navigator.onLine;
    if (!online) notify('info', '浏览器已离线', '本机编辑仍可保存；平板断网会话请使用班级页的“平板断网”按钮模拟。');
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
  }

  function doReset(): void {
    if (window.confirm('将清空本机全部模板与班级数据并恢复演示数据，确定吗？')) {
      workspaceStore.resetAll();
      notify('success', '已恢复内置教研组演示数据');
    }
  }
</script>

<header class="app-header">
  <div class="brand">
    <div class="brand-symbol" aria-hidden="true"><span>a</span><i>+</i><span>m</span></div>
    <div>
      <h1>Phonics Studio</h1>
      <p>课程模板 × 班级方案教研台</p>
    </div>
  </div>

  <div class="header-center">
    <span class:connected={online} class="network-dot"></span>
    <span>{online ? '本机在线' : '浏览器离线'}</span>
    {#if $workspaceStore.offline}
      <span class="offline-chip">平板断网中 · {$workspaceStore.offline.ops.length} 项待合并</span>
    {/if}
    <strong>已保存 · {formatTime($workspaceStore.updatedAt)}</strong>
  </div>

  <div class="header-actions">
    <Button size="small" kind="ghost" disabled={!$history.canUndo} on:click={() => workspaceStore.undo()}>撤销</Button>
    <Button size="small" kind="ghost" disabled={!$history.canRedo} on:click={() => workspaceStore.redo()}>重做</Button>
    <Button size="small" kind="ghost" on:click={doReset}>重置演示</Button>
  </div>
</header>

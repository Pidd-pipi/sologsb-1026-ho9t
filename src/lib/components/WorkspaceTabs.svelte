<script lang="ts">
  import { ui, type ViewId } from '../ui';

  const tabs: Array<{ id: ViewId; no: string; title: string; subtitle: string }> = [
    { id: 'compose', no: '01', title: '编排', subtitle: '活动、依赖与说明' },
    { id: 'path', no: '02', title: '学习路径', subtitle: '多屏顺序预览' },
    { id: 'issues', no: '03', title: '质量检查', subtitle: '按当前方案实时重算' },
    { id: 'versions', no: '04', title: '版本与复用', subtitle: '发布、升级与比较' }
  ];
</script>

<nav class="workspace-tabs" aria-label="工作区">
  {#each tabs as tab}
    <button class:active={$ui.view === tab.id} on:click={() => ui.update((s) => ({ ...s, view: tab.id }))}>
      <span>{tab.no}</span><b>{tab.title}</b><small>{tab.subtitle}</small>
    </button>
  {/each}
</nav>

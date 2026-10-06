<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Button,
    InlineNotification,
    Select,
    SelectItem,
    Tag,
    TextArea,
    TextInput,
    Tile
  } from 'carbon-components-svelte';
  import { app, getState } from '$lib/phonics/store';
  import type {
    Activity,
    ActivityField,
    ActivityType,
    ClassPlan,
    EditingContext,
    Resolution,
    VersionDiff
  } from '$lib/phonics/types';
  import { analyzeCourse } from '$lib/phonics/analyze';
  import { diffActivities, resolveActivities } from '$lib/phonics/merge';
  import { activityIcon, formatTime } from '$lib/phonics/fields';
  import ActivityEditor from '$lib/phonics/ActivityEditor.svelte';
  import PendingPanel from '$lib/phonics/PendingPanel.svelte';

  type ViewMode = 'compose' | 'path' | 'issues' | 'versions';
  type PreviewWidth = 'phone' | 'tablet' | 'desktop';

  $: template = $app.template;
  $: plans = $app.plans;
  $: context = $app.context;
  $: history = $app.history;
  $: future = $app.future;

  let activeView: ViewMode = 'compose';
  let previewWidth: PreviewWidth = 'desktop';
  let selectedActivityId = '';
  let compareBaseId = '';
  let compareTargetId = '';
  let showNewPlanForm = false;
  let newPlanName = '';
  let newPlanBase = '';
  let online = true;
  let showOfflineNotice = false;
  let savedLabel = '等待载入';
  let hydrated = false;

  $: contextPlan =
    context.kind === 'plan' ? plans.find((plan) => plan.id === context.planId) : undefined;
  $: resolvedActivities = contextPlan
    ? resolveActivities(
        template.versions.find((version) => version.id === contextPlan.baseVersionId)?.activities ??
          template.activities,
        contextPlan
      )
    : template.activities;
  $: diagnostics = analyzeCourse(resolvedActivities);
  $: errorCount = diagnostics.filter((issue) => issue.level === 'error').length;
  $: warningCount = diagnostics.filter((issue) => issue.level === 'warning').length;
  $: totalMinutes = resolvedActivities.reduce((sum, activity) => sum + activity.duration, 0);
  $: pendingCount = contextPlan
    ? (contextPlan.draft ? contextPlan.draft.pendingItems.length : contextPlan.pendingItems.length)
    : 0;
  $: latestVersion = template.versions.at(-1);
  $: canUpgrade = contextPlan && latestVersion && contextPlan.baseVersionId !== latestVersion.id;

  $: compareBase = template.versions.find((version) => version.id === compareBaseId);
  $: compareTarget = template.versions.find((version) => version.id === compareTargetId);
  $: versionDiff = computeVersionDiff();

  $: localIds = new Set((contextPlan?.localActivities ?? []).map((activity) => activity.id));
  $: overrides = contextPlan?.overrides ?? {};

  onMount(() => {
    selectedActivityId = getState().template.activities[0]?.id ?? '';
    compareBaseId = getState().template.versions[0]?.id ?? '';
    compareTargetId = getState().template.versions.at(-1)?.id ?? '';
    newPlanBase = getState().template.versions.at(-1)?.id ?? '';
    hydrated = true;
    const updateNetwork = () => {
      const wasOffline = !online;
      online = navigator.onLine;
      showOfflineNotice = !online;
      if (online && wasOffline) {
        const affected = app.mergeOfflineChanges();
        if (affected.length) {
          showOfflineNotice = true;
          savedLabel = `已合并离线修改，${affected.length} 个方案生成升级草稿`;
        }
      }
    };
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
    };
  });

  function computeVersionDiff(): VersionDiff[] {
    if (!compareBase || !compareTarget) return [];
    if (contextPlan) {
      const baseResolved = resolveActivities(compareBase.activities, contextPlan);
      const targetResolved = resolveActivities(compareTarget.activities, contextPlan);
      return diffActivities(baseResolved, targetResolved);
    }
    return diffActivities(compareBase.activities, compareTarget.activities);
  }

  function selectContext(next: EditingContext): void {
    app.setContext(next);
    selectedActivityId = '';
  }

  function planLabel(plan: ClassPlan): string {
    const base = template.versions.find((version) => version.id === plan.baseVersionId);
    return base?.label ?? plan.baseVersionId;
  }

  // ---- 活动编辑（按上下文分发到模板或班级方案） ----
  function handleSelect(event: CustomEvent<string>): void {
    selectedActivityId = event.detail;
  }

  function handleUpdate(event: CustomEvent<{ field: ActivityField; value: unknown }>): void {
    const { field, value } = event.detail;
    if (contextPlan) {
      app.updatePlanActivity(contextPlan.id, selectedActivityId, field, value);
    } else {
      app.updateTemplateActivity(selectedActivityId, field, value);
    }
  }

  function handleUpdatePhonemes(event: CustomEvent<string>): void {
    const value = event.detail.split(/[\s,，、]+/).map((item) => item.trim()).filter(Boolean);
    if (contextPlan) {
      app.updatePlanActivity(contextPlan.id, selectedActivityId, 'phonemes', value);
    } else {
      app.updateTemplateActivity(selectedActivityId, 'phonemes', value);
    }
  }

  function handleAdd(event: CustomEvent<ActivityType>): void {
    const type = event.detail;
    const id = contextPlan ? app.addPlanActivity(contextPlan.id, type) : app.addTemplateActivity(type);
    selectedActivityId = id;
  }

  function handleDelete(): void {
    if (contextPlan) {
      app.deletePlanActivity(contextPlan.id, selectedActivityId);
    } else {
      app.deleteTemplateActivity(selectedActivityId);
    }
    selectedActivityId = '';
  }

  function handleDuplicate(): void {
    const id = contextPlan
      ? app.duplicatePlanActivity(contextPlan.id, selectedActivityId)
      : app.duplicateTemplateActivity(selectedActivityId);
    if (id) selectedActivityId = id;
  }

  function handleMove(event: CustomEvent<-1 | 1>): void {
    if (contextPlan) {
      app.movePlanActivity(contextPlan.id, selectedActivityId, event.detail);
    } else {
      app.moveTemplateActivity(selectedActivityId, event.detail);
    }
  }

  function handleToggleDep(event: CustomEvent<{ depId: string; checked: boolean }>): void {
    const { depId, checked } = event.detail;
    const current = resolvedActivities.find((activity) => activity.id === selectedActivityId);
    if (!current) return;
    const next = checked
      ? [...new Set([...current.dependencies, depId])]
      : current.dependencies.filter((id) => id !== depId);
    if (contextPlan) {
      app.updatePlanActivity(contextPlan.id, selectedActivityId, 'dependencies', next);
    } else {
      app.updateTemplateActivity(selectedActivityId, 'dependencies', next);
    }
  }

  // ---- 班级方案 ----
  function createPlan(): void {
    const name = newPlanName.trim() || `新班级 ${plans.length + 1}`;
    const id = app.createPlan(name, newPlanBase || latestVersion?.id || '');
    app.setContext({ kind: 'plan', planId: id });
    showNewPlanForm = false;
    newPlanName = '';
    selectedActivityId = '';
  }

  function duplicatePlan(): void {
    if (contextPlan) {
      const id = app.duplicatePlan(contextPlan.id);
      app.setContext({ kind: 'plan', planId: id });
    } else {
      const id = app.createPlan(`${template.title} · 副本`, latestVersion?.id ?? '');
      app.setContext({ kind: 'plan', planId: id });
    }
  }

  function handleUpgrade(event: CustomEvent<string>): void {
    if (!contextPlan) return;
    app.buildUpgradeDraft(contextPlan.id, event.detail);
  }

  function handleResolveDraft(event: CustomEvent<{ itemId: string; resolution: Resolution }>): void {
    if (!contextPlan) return;
    const { itemId, resolution } = event.detail;
    app.resolveDraftItem(contextPlan.id, itemId, resolution);
  }

  function handleApplyDraft(): void {
    if (!contextPlan) return;
    const error = app.applyDraft(contextPlan.id);
    if (error) savedLabel = `草稿未应用：${error}`;
    else savedLabel = '升级草稿已应用';
  }

  function handleDiscardDraft(): void {
    if (!contextPlan) return;
    app.discardDraft(contextPlan.id);
  }

  function handleRetryDraft(): void {
    if (!contextPlan) return;
    app.retryDraft(contextPlan.id);
  }

  function saveVersion(): void {
    app.saveTemplateVersion();
    savedLabel = '模板版本已存档';
  }

  function focusIssue(activityId: string): void {
    selectedActivityId = activityId;
    activeView = 'compose';
  }

  function readText(event: Event): string {
    const custom = event as CustomEvent<{ value?: string; text?: string } | string>;
    if (typeof custom.detail === 'string') return custom.detail;
    if (typeof custom.detail === 'number') return String(custom.detail);
    if (custom.detail?.value) return custom.detail.value;
    if (custom.detail?.text) return custom.detail.text;
    const target = (event.currentTarget ?? event.target) as HTMLInputElement | HTMLTextAreaElement | null;
    return target?.value ?? '';
  }

  function handleKeyboard(event: KeyboardEvent): void {
    const modifier = event.ctrlKey || event.metaKey;
    const tag = (event.target as HTMLElement)?.tagName;
    const editing = tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement)?.isContentEditable;
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? app.redo() : app.undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      app.redo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 's') {
      event.preventDefault();
      app.saveNow();
      savedLabel = `已保存 · ${formatTime(new Date().toISOString())}`;
      return;
    }
    if (event.altKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      handleAdd(new CustomEvent('add', { detail: '练习' }));
      return;
    }
    if (!editing && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      handleMove(new CustomEvent('move', { detail: event.key === 'ArrowUp' ? -1 : 1 }));
    }
  }
</script>

<svelte:window on:keydown={handleKeyboard} />

<div class="app-frame">
  <header class="app-header">
    <div class="brand">
      <div class="brand-symbol" aria-hidden="true"><span>a</span><i>+</i><span>m</span></div>
      <div>
        <h1>Phonics Studio</h1>
        <p>儿童自然拼读课程编排台</p>
      </div>
    </div>
    <div class="header-center">
      <span class:connected={online} class="network-dot"></span>
      <span>{online ? '本地离线编辑可用' : '当前离线，修改仍会保存'}</span>
      <strong>{savedLabel}</strong>
    </div>
    <div class="header-actions">
      <Button size="small" kind="ghost" disabled={history.length === 0} on:click={() => app.undo()}>撤销</Button>
      <Button size="small" kind="ghost" disabled={future.length === 0} on:click={() => app.redo()}>重做</Button>
      <Button size="small" kind="tertiary" on:click={() => { app.saveNow(); savedLabel = `已保存 · ${formatTime(new Date().toISOString())}`; }}>保存</Button>
      <Button size="small" kind="primary" on:click={saveVersion}>存档模板版本</Button>
    </div>
  </header>

  {#if showOfflineNotice}
    <div class="offline-notice">
      <InlineNotification
        lowContrast
        kind={online ? 'success' : 'info'}
        title={online ? '已恢复网络' : '已切换到离线模式'}
        subtitle={online
          ? '离线期间的覆盖项已合并为草稿，请在“待处理事项”中确认。'
          : '所有修改会先保存在本机浏览器，恢复网络后自动合并。'}
      />
    </div>
  {/if}

  <section class="course-hero">
    <div class="hero-copy">
      <span class="kicker">COURSE BUILDER / {template.level}</span>
      <h2>{contextPlan ? contextPlan.name : template.title}</h2>
      <p>{contextPlan ? `基于模板版本「${planLabel(contextPlan)}」· 仅保存本班覆盖项` : template.objective}</p>
      <div class="context-switcher">
        <button class:active={context.kind === 'template'} on:click={() => selectContext({ kind: 'template' })}>课程模板</button>
        {#each plans as plan (plan.id)}
          <button
            class:active={context.kind === 'plan' && context.planId === plan.id}
            on:click={() => selectContext({ kind: 'plan', planId: plan.id })}
          >
            {plan.name}
            {#if plan.pendingItems.length || plan.draft?.pendingItems.length}
              <i class="pending-dot">{plan.draft?.pendingItems.length ?? plan.pendingItems.length}</i>
            {/if}
          </button>
        {/each}
        <button class="new-plan" on:click={() => (showNewPlanForm = !showNewPlanForm)}>+ 新建班级方案</button>
      </div>
      {#if showNewPlanForm}
        <div class="new-plan-form">
          <TextInput labelText="班级名称" bind:value={newPlanName} placeholder="例如：一(3)班" />
          <Select labelText="基于模板版本" bind:value={newPlanBase}>
            {#each template.versions as version}
              <SelectItem value={version.id} text={`${version.label} · ${version.activities.length} 个活动`} />
            {/each}
          </Select>
          <Button size="small" kind="primary" on:click={createPlan}>创建</Button>
        </div>
      {/if}
    </div>
    <div class="hero-stats">
      <div><strong>{resolvedActivities.length}</strong><span>活动</span></div>
      <div><strong>{totalMinutes}</strong><span>分钟</span></div>
      <div><strong class="critical">{errorCount}</strong><span>必修问题</span></div>
      <div><strong class="caution">{warningCount}</strong><span>建议调整</span></div>
    </div>
  </section>

  <nav class="workspace-tabs" aria-label="工作区">
    <button class:active={activeView === 'compose'} on:click={() => (activeView = 'compose')}>
      <span>01</span><b>课程编排</b><small>{contextPlan ? '班级覆盖与待处理' : '模板活动、依赖与版本'}</small>
    </button>
    <button class:active={activeView === 'path'} on:click={() => (activeView = 'path')}><span>02</span><b>学习路径</b><small>多屏幕顺序预览</small></button>
    <button class:active={activeView === 'issues'} on:click={() => (activeView = 'issues')}><span>03</span><b>质量检查</b><small>按当前方案重算</small></button>
    <button class:active={activeView === 'versions'} on:click={() => (activeView = 'versions')}><span>04</span><b>版本与复用</b><small>比较、复制与升级</small></button>
  </nav>

  {#if activeView === 'compose'}
    <main class="compose-layout">
      {#if contextPlan}
        <div class="plan-banner">
          <Tag type="cool-gray">基线：{planLabel(contextPlan)}</Tag>
          <Tag type="blue">覆盖 {Object.keys(contextPlan.overrides).length} 项</Tag>
          <Tag type="teal">本地活动 {contextPlan.localActivities.length} 个</Tag>
          {#if pendingCount}<Tag type="red">{pendingCount} 项待处理</Tag>{/if}
          {#if canUpgrade && !contextPlan.draft}
            <Button size="small" kind="tertiary" on:click={() => app.buildUpgradeDraft(contextPlan.id, latestVersion?.id)}>升级到最新模板</Button>
          {/if}
        </div>
        <div class="pending-wrap">
          <PendingPanel
            plan={contextPlan}
            {template}
            on:upgrade={handleUpgrade}
            on:resolve={handleResolveDraft}
            on:apply={handleApplyDraft}
            on:discard={handleDiscardDraft}
            on:retry={handleRetryDraft}
          />
        </div>
      {/if}
      <ActivityEditor
        activities={resolvedActivities}
        selectedId={selectedActivityId}
        {overrides}
        {localIds}
        contextLabel={contextPlan ? contextPlan.name : '课程模板'}
        on:select={handleSelect}
        on:update={handleUpdate}
        on:update-phonemes={handleUpdatePhonemes}
        on:add={handleAdd}
        on:delete={handleDelete}
        on:duplicate={handleDuplicate}
        on:move={handleMove}
        on:toggle-dep={handleToggleDep}
      />
      <aside class="inspector">
        <Tile class="compact-card">
          <span class="kicker">{contextPlan ? 'PLAN META' : 'TEMPLATE META'}</span>
          <h3>{contextPlan ? '班级方案信息' : '课程模板信息'}</h3>
          {#if contextPlan}
            <TextInput labelText="班级名称" value={contextPlan.name} on:input={(event) => app.updatePlanMeta(contextPlan.id, readText(event))} />
            <p class="meta-note">基线模板版本：{planLabel(contextPlan)} · 升级时保留本班覆盖项。</p>
          {:else}
            <TextInput labelText="课程名称" value={template.title} on:input={(event) => app.updateTemplateMeta('title', readText(event))} />
            <TextInput labelText="课程等级" value={template.level} on:input={(event) => app.updateTemplateMeta('level', readText(event))} />
            <TextInput labelText="适用年龄" value={template.ageRange} on:input={(event) => app.updateTemplateMeta('ageRange', readText(event))} />
            <TextArea labelText="学习目标" rows={3} value={template.objective} on:input={(event) => app.updateTemplateMeta('objective', readText(event))} />
          {/if}
        </Tile>
        <Tile class="compact-card issue-peek">
          <div class="section-title">
            <div><span class="kicker">LIVE CHECK</span><h3>实时提示</h3></div>
            <Tag type={errorCount ? 'red' : 'green'}>{errorCount ? `${errorCount} 项` : '通过'}</Tag>
          </div>
          {#each diagnostics.slice(0, 4) as issue}
            <button on:click={() => focusIssue(issue.activityId)} class="peek-row">
              <i class:error={issue.level === 'error'} class:warning={issue.level === 'warning'}></i>
              <span><b>{issue.title}</b><small>{issue.category}</small></span>
            </button>
          {/each}
          {#if diagnostics.length === 0}<p class="empty-state">课程结构完整，没有发现提示。</p>{/if}
          <Button size="small" kind="ghost" on:click={() => (activeView = 'issues')}>查看全部检查</Button>
        </Tile>
      </aside>
    </main>
  {/if}

  {#if activeView === 'path'}
    <main class="path-view">
      <div class="path-toolbar">
        <div>
          <span class="kicker">RESPONSIVE SEQUENCE</span>
          <h2>学习顺序预览</h2>
          <p>按{contextPlan ? '班级方案' : '模板'}的活动依赖和课程顺序生成，可切换设备宽度检查信息密度。</p>
        </div>
        <div class="width-switcher">
          <button class:active={previewWidth === 'phone'} on:click={() => (previewWidth = 'phone')}>手机</button>
          <button class:active={previewWidth === 'tablet'} on:click={() => (previewWidth = 'tablet')}>平板</button>
          <button class:active={previewWidth === 'desktop'} on:click={() => (previewWidth = 'desktop')}>桌面</button>
        </div>
      </div>
      <div class="preview-stage">
        <div class="device-preview {previewWidth}">
          <div class="device-bar"><span></span><b>{previewWidth === 'phone' ? '390 px' : previewWidth === 'tablet' ? '768 px' : '1200 px'}</b></div>
          <div class="lesson-preview">
            <header><span>今日学习</span><h3>{contextPlan ? contextPlan.name : template.title}</h3><p>{template.objective}</p></header>
            {#each resolvedActivities as activity, index (activity.id)}
              <article>
                <div class="lesson-number">{index + 1}</div>
                <div class="lesson-type {activity.type}">{activity.type}</div>
                <div class="lesson-content">
                  <h4>{activity.title}</h4>
                  <p>{activity.content}</p>
                  {#if activity.prompt}<blockquote>{activity.prompt}</blockquote>{/if}
                  <div class="lesson-tags">
                    {#each activity.phonemes as phoneme}<span>{phoneme}</span>{/each}
                    <em>{activity.duration} 分钟</em>
                  </div>
                  {#if activity.dependencies.length}
                    <small>前置：{activity.dependencies.map((id) => resolvedActivities.find((item) => item.id === id)?.title).filter(Boolean).join('、')}</small>
                  {/if}
                </div>
              </article>
            {/each}
            <footer>课程结束 · 预计 {totalMinutes} 分钟</footer>
          </div>
        </div>
      </div>
    </main>
  {/if}

  {#if activeView === 'issues'}
    <main class="issues-view">
      <div class="view-heading">
        <div>
          <span class="kicker">CURRICULUM QA</span>
          <h2>课程质量检查</h2>
          <p>按{contextPlan ? '班级方案' : '模板'}当前活动、依赖与覆盖项重算：前置知识、相似音、例句长度、练习反馈、无障碍说明和依赖完整性。</p>
        </div>
        <div class="issue-summary"><span><b>{errorCount}</b> 必须处理</span><span><b>{warningCount}</b> 建议调整</span><span><b>{diagnostics.length}</b> 全部提示</span></div>
      </div>
      <div class="issue-board">
        {#each diagnostics as issue, index}
          <article class:critical={issue.level === 'error'} class:caution={issue.level === 'warning'} class:info={issue.level === 'info'}>
            <span class="issue-index">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <div class="issue-meta">
                <Tag type={issue.level === 'error' ? 'red' : issue.level === 'warning' ? 'magenta' : 'blue'}>{issue.category}</Tag>
                <small>{issue.level === 'error' ? '必须处理' : issue.level === 'warning' ? '建议调整' : '教学提示'}</small>
              </div>
              <h3>{issue.title}</h3>
              <p>{issue.detail}</p>
            </div>
            <Button size="small" kind="ghost" on:click={() => focusIssue(issue.activityId)}>定位活动</Button>
          </article>
        {:else}
          <Tile class="all-clear"><h3>课程检查通过</h3><p>教学顺序、反馈与无障碍说明均已完成。</p></Tile>
        {/each}
        {#if diagnostics.length}
          <div class="rule-grid">
            <Tile><span>前置知识</span><strong>先教后用</strong><p>非音素活动使用未单独教学的音素时阻断。</p></Tile>
            <Tile><span>相似音</span><strong>对比教学</strong><p>发现 /b/-/p/、/f/-/v/ 等音对时建议增加辨音。</p></Tile>
            <Tile><span>例句</span><strong>≤ 12 词</strong><p>超过建议长度时提示拆分意群。</p></Tile>
            <Tile><span>练习</span><strong>必须有反馈</strong><p>每个练习活动都要提供可行动反馈。</p></Tile>
          </div>
        {/if}
      </div>
    </main>
  {/if}

  {#if activeView === 'versions'}
    <main class="versions-view">
      <div class="view-heading">
        <div>
          <span class="kicker">REUSE & HISTORY</span>
          <h2>版本与课程复用</h2>
          <p>比较{contextPlan ? '班级方案在两个模板版本间的实际变化（含覆盖项）' : '模板版本差异'}；复制结果按当前方案重算。</p>
        </div>
        <div class="version-actions">
          {#if contextPlan}
            <Button kind="tertiary" on:click={duplicatePlan}>复制本方案</Button>
          {:else}
            <Button kind="tertiary" on:click={duplicatePlan}>复制为新班级方案</Button>
          {/if}
          <Button kind="primary" on:click={saveVersion}>保存新版本</Button>
        </div>
      </div>
      <div class="version-layout-svelte">
        <Tile class="version-timeline">
          <div class="section-title"><div><span class="kicker">TIMELINE</span><h3>模板版本</h3></div><Tag type="cool-gray">{template.versions.length} 个快照</Tag></div>
          {#each template.versions as version, index (version.id)}
            <article class:latest={index === template.versions.length - 1}>
              <span class="timeline-dot"></span>
              <div><b>{version.label}</b><h4>{version.note}</h4><p>{formatTime(version.savedAt)} · {version.activities.length} 个活动</p></div>
            </article>
          {/each}
        </Tile>
        <Tile class="diff-card">
          <div class="section-title">
            <div><span class="kicker">COMPARE</span><h3>比较两个版本{contextPlan ? '（按当前方案）' : ''}</h3></div>
          </div>
          <div class="compare-pickers">
            <Select labelText="基准版本" bind:value={compareBaseId}>
              {#each template.versions as version}<SelectItem value={version.id} text={`${version.label} · ${formatTime(version.savedAt)}`} />{/each}
            </Select>
            <Select labelText="目标版本" bind:value={compareTargetId}>
              {#each template.versions as version}<SelectItem value={version.id} text={`${version.label} · ${formatTime(version.savedAt)}`} />{/each}
            </Select>
          </div>
          <div class="diff-list">
            {#each versionDiff as diff}
              <article class={diff.kind}>
                <span>{diff.kind === 'added' ? '新增' : diff.kind === 'removed' ? '删除' : '修改'}</span>
                <div><b>{diff.title}</b><p>{diff.detail}</p></div>
              </article>
            {:else}
              <p class="empty-state">两个版本之间没有活动差异，或尚未选择版本。</p>
            {/each}
          </div>
        </Tile>
      </div>
    </main>
  {/if}

  <footer class="app-footer">
    <span>模板与班级方案保存在当前浏览器 localStorage · 班级方案仅保存覆盖项</span>
    <span>Ctrl/Cmd + Z 撤销 · Ctrl/Cmd + Y 重做 · Alt + N 新建活动 · Ctrl/Cmd + S 保存</span>
  </footer>
</div>

<style>
  .context-switcher { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
  .context-switcher button { padding: 6px 12px; border: 1px solid rgba(255,255,255,.25); border-radius: 16px; color: #d0e2ff; background: rgba(255,255,255,.06); cursor: pointer; font-size: 12px; }
  .context-switcher button.active { color: #161616; background: #fff; border-color: #fff; }
  .context-switcher button.new-plan { border-style: dashed; color: #78a9ff; }
  .context-switcher .pending-dot { display: inline-grid; place-items: center; min-width: 16px; height: 16px; margin-left: 6px; border-radius: 8px; color: #fff; background: #da1e28; font: 600 10px/1 "IBM Plex Mono", monospace; font-style: normal; }
  .new-plan-form { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; margin-top: 12px; padding: 12px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); }
  .plan-banner { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px 18px; background: #fff; border-bottom: 1px solid #e0e0e0; }
  .pending-wrap { grid-column: 1 / -1; padding: 14px 14px 0; background: #f4f4f4; }
  .pending-wrap :global(.pending-panel) { margin: 0; }
  .meta-note { margin: 10px 0 0; color: #6f6f6f; font-size: 11px; line-height: 1.6; }
  .compose-layout { grid-template-rows: auto auto 1fr; }
  @media (max-width: 820px) {
    .new-plan-form { grid-template-columns: 1fr; }
  }
</style>

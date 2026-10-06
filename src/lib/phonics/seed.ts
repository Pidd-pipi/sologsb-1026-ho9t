import type { Activity, ClassPlan, Template } from './types';
import { mergePlanToDraft } from './merge';

function buildActivities(): Activity[] {
  return [
    {
      id: 'a-1',
      type: '音素',
      title: '听音游戏：认识 /m/',
      content: '/m/',
      phonemes: ['/m/'],
      dependencies: [],
      difficulty: 1,
      prompt: '闭上嘴唇，轻轻发出 /m/，感受鼻子的震动。',
      accessibility: '提供口型示范图和可重复播放的低频音频。',
      duration: 6,
      feedback: ''
    },
    {
      id: 'a-2',
      type: '音素',
      title: '首音识别：/s/ 与 /m/',
      content: '/s/ /m/',
      phonemes: ['/s/', '/m/'],
      dependencies: ['a-1'],
      difficulty: 1,
      prompt: '听到单词时拍手，听到 /m/ 时把手放在鼻子上。',
      accessibility: '视觉提示使用不同形状，不只依赖颜色。',
      duration: 8,
      feedback: ''
    },
    {
      id: 'a-3',
      type: '单词',
      title: '拼读短词：sat',
      content: 's – a – t → sat',
      phonemes: ['/s/', '/æ/', '/t/'],
      dependencies: ['a-2'],
      difficulty: 2,
      prompt: '用手指依次点每个字母，再连起来读。',
      accessibility: '字母块支持键盘逐字聚焦和屏幕阅读器朗读。',
      duration: 10,
      feedback: '三条电缆拼在一起形成完整电路。'
    },
    {
      id: 'a-4',
      type: '练习',
      title: '听音选图：m / s 开头',
      content: 'moon, sun, mat, sock',
      phonemes: ['/m/', '/s/'],
      dependencies: ['a-2'],
      difficulty: 2,
      prompt: '先听单词，再从两张图片中选出正确首音。',
      accessibility: '所有图片均配替代文本，可只用键盘选择。',
      duration: 8,
      feedback: ''
    },
    {
      id: 'a-5',
      type: '音素',
      title: '短元音 /æ/ 的口型',
      content: '/æ/',
      phonemes: ['/æ/'],
      dependencies: ['a-1'],
      difficulty: 2,
      prompt: '嘴巴张大，舌尖放低，声音短而有力。',
      accessibility: '提供正面口型、侧面舌位和慢速音频。',
      duration: 6,
      feedback: ''
    },
    {
      id: 'a-6',
      type: '句子',
      title: '拼读句子：Mat sat.',
      content: 'Mat sat on the mat.',
      phonemes: ['/m/', '/æ/', '/s/', '/t/'],
      dependencies: ['a-3'],
      difficulty: 3,
      prompt: '先读每个单词，再按意群连读句子。',
      accessibility: '句子可按词高亮，并提供更大字号选项。',
      duration: 10,
      feedback: '读对了，再试试让声音更连贯。'
    },
    {
      id: 'a-7',
      type: '练习',
      title: '把单词和图片配对',
      content: 'mat · map · sun · sock',
      phonemes: ['/m/', '/æ/', '/s/'],
      dependencies: ['a-3', 'a-4'],
      difficulty: 3,
      prompt: '读出单词，然后把单词卡拖到对应图片。',
      accessibility: '支持键盘选择起点和终点，不使用拖拽也能完成。',
      duration: 12,
      feedback: '答对后播放该单词的分解音。'
    },
    {
      id: 'a-8',
      type: '句子',
      title: '迁移朗读：A man sat.',
      content: 'A man sat and had a nap.',
      phonemes: ['/m/', '/æ/', '/n/'],
      dependencies: ['a-6'],
      difficulty: 4,
      prompt: '观察 a 和 man 之间的联系，再完整朗读。',
      accessibility: '提供分句导航、朗读速度控制和高对比模式。',
      duration: 12,
      feedback: ''
    }
  ];
}

/** 取活动子集并按字段覆盖，生成历史版本快照。 */
function subset(
  activities: Activity[],
  ids: string[],
  tweaks: Record<string, Partial<Activity>>
): Activity[] {
  return ids.map((id) => {
    const source = activities.find((activity) => activity.id === id);
    if (!source) throw new Error(`seed: missing activity ${id}`);
    return { ...source, ...(tweaks[id] ?? {}) };
  });
}

export function seedTemplate(): Template {
  const activities = buildActivities();
  const v1: Activity[] = subset(activities, ['a-1', 'a-2', 'a-3', 'a-4'], {
    'a-1': { prompt: '闭上嘴唇，轻轻发出 /m/。' },
    'a-2': { prompt: '听到单词时拍手。' },
    'a-3': { prompt: '用手指依次点每个字母。' },
    'a-4': { accessibility: '图片配替代文本，可键盘选择。' }
  });
  const v2: Activity[] = subset(activities, ['a-1', 'a-2', 'a-3', 'a-4', 'a-5', 'a-6'], {
    'a-1': { prompt: '闭上嘴唇，轻轻发出 /m/。' },
    'a-2': { prompt: '听到单词时拍手，听到 /m/ 时把手放在鼻子上。' },
    'a-6': { accessibility: '按词高亮。' }
  });
  return {
    id: 'template-phonics-1',
    title: 'Starter Phonics · 声音侦探',
    level: '启蒙一级',
    ageRange: '5–6 岁',
    objective: '建立音素意识，能听辨、拼读并书写短元音单词。',
    activities,
    versions: [
      {
        id: 'v-1',
        label: '初稿',
        savedAt: '2026-09-21T10:00:00+08:00',
        note: '完成音素和基础拼读活动。',
        activities: v1
      },
      {
        id: 'v-2',
        label: '增加句子迁移',
        savedAt: '2026-09-24T15:30:00+08:00',
        note: '补充短元音 /æ/ 与拼读句子。',
        activities: v2
      }
    ],
    updatedAt: '2026-09-24T16:20:00+08:00'
  };
}

export function seedPlans(template: Template): ClassPlan[] {
  const v1 = template.versions[0];
  const v2 = template.versions[1];
  const now = new Date().toISOString();

  // 一(3)班：基于 v-1，覆盖时长与提示，新增一个课堂游戏活动
  const plan1: ClassPlan = {
    id: 'plan-1',
    name: '一(3)班',
    templateId: template.id,
    baseVersionId: v1.id,
    overrides: {
      'a-2': { duration: 12 },
      'a-3': { prompt: '用手指依次点每个字母，再连起来读，注意 /æ/ 的口型。' }
    },
    localActivities: [
      {
        id: 'a-local-1',
        type: '练习',
        title: '课堂游戏：听音抢椅子',
        content: '播放首音，抢到对应音素卡片。',
        phonemes: ['/m/', '/s/'],
        dependencies: ['a-2'],
        difficulty: 2,
        prompt: '听到 /m/ 抢左边，听到 /s/ 抢右边。',
        accessibility: '游戏过程提供视觉倒计时，不依赖语音指令。',
        duration: 10,
        feedback: '抢对了，大声读出音素。'
      }
    ],
    removedActivityIds: [],
    order: [...v1.activities.map((activity) => activity.id), 'a-local-1'],
    pendingItems: [],
    draft: null,
    updatedAt: now
  };

  // 一(4)班：基于 v-2，覆盖无障碍说明；升级时该字段两边都改，已保留两份
  const plan2: ClassPlan = {
    id: 'plan-2',
    name: '一(4)班',
    templateId: template.id,
    baseVersionId: v2.id,
    overrides: {
      'a-6': { accessibility: '句子可按词高亮，提供更大字号和朗读速度控制。' }
    },
    localActivities: [],
    removedActivityIds: [],
    order: v2.activities.map((activity) => activity.id),
    pendingItems: [],
    draft: null,
    updatedAt: now
  };
  const draft2 = mergePlanToDraft(plan2, v2, template.versions.at(-1) ?? v2);
  plan2.pendingItems = draft2.pendingItems.map((item) => ({ ...item, resolution: 'both' as const }));

  // 一(5)班：基于 v-1，覆盖提示语；上次升级处理失败，保留草稿可重试
  const plan3: ClassPlan = {
    id: 'plan-3',
    name: '一(5)班',
    templateId: template.id,
    baseVersionId: v1.id,
    overrides: {
      'a-2': { prompt: '听到单词时拍手，听到 /m/ 时把手放在鼻子上，再跟读一遍。' }
    },
    localActivities: [],
    removedActivityIds: [],
    order: v1.activities.map((activity) => activity.id),
    pendingItems: [],
    draft: null,
    updatedAt: now
  };
  const draft3 = mergePlanToDraft(plan3, v1, template.versions.at(-1) ?? v1);
  draft3.error = '合并草稿校验失败：目标版本缺少活动 a-2 的基线快照，请重试。';
  plan3.draft = draft3;

  return [plan1, plan2, plan3];
}

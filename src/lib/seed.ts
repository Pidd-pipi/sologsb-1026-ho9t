import type {
  Activity,
  ClassPlan,
  CourseMeta,
  CourseTemplate,
  OverrideMap,
  PendingItem,
  UpgradeStage,
  Workspace
} from './types';

const metaV1: CourseMeta = {
  title: 'Starter Phonics · 声音侦探',
  level: '启蒙一级',
  ageRange: '5–6 岁',
  objective: '建立音素意识，能听辨、拼读并书写短元音单词。'
};

const t: (
  id: string,
  type: Activity['type'],
  title: string,
  content: string,
  phonemes: string[],
  dependencies: string[],
  difficulty: number,
  prompt: string,
  accessibility: string,
  duration: number,
  feedback?: string
) => Activity = (
  id,
  type,
  title,
  content,
  phonemes,
  dependencies,
  difficulty,
  prompt,
  accessibility,
  duration,
  feedback = ''
) => ({ id, type, title, content, phonemes, dependencies, difficulty, prompt, accessibility, duration, feedback });

// 教研组第一版（2026 春季）：保留旧课程里的 8 个活动
const activitiesV1: Activity[] = [
  t('a-1', '音素', '听音游戏：认识 /m/', '/m/', ['/m/'], [], 1,
    '闭上嘴唇，轻轻发出 /m/，感受鼻子的震动。',
    '提供口型示范图和可重复播放的低频音频。', 6),
  t('a-2', '音素', '首音识别：/s/ 与 /m/', '/s/ /m/', ['/s/', '/m/'], ['a-1'], 1,
    '听到单词时拍手，听到 /m/ 时把手放在鼻子上。',
    '视觉提示使用不同形状，不只依赖颜色。', 8),
  t('a-3', '单词', '拼读短词：sat', 's – a – t → sat', ['/s/', '/æ/', '/t/'], ['a-2'], 2,
    '用手指依次点每个字母，再连起来读。',
    '字母块支持键盘逐字聚焦和屏幕阅读器朗读。', 10,
    '先读准每个音素，再把它们连起来。'),
  t('a-4', '练习', '听音选图：m / s 开头', 'moon, sun, mat, sock', ['/m/', '/s/'], ['a-2'], 2,
    '先听单词，再从两张图片中选出正确首音。',
    '所有图片均配替代文本，可只用键盘选择。', 8,
    '选错时再听一遍首音，并对比两张图。'),
  t('a-5', '音素', '短元音 /æ/ 的口型', '/æ/', ['/æ/'], ['a-1'], 2,
    '嘴巴张大，舌尖放低，声音短而有力。',
    '提供正面口型、侧面舌位和慢速音频。', 6),
  t('a-6', '句子', '拼读句子：Mat sat.', 'Mat sat on the mat.', ['/m/', '/æ/', '/s/', '/t/'], ['a-3'], 3,
    '先读每个单词，再按意群连读句子。',
    '句子可按词高亮，并提供更大字号选项。', 10,
    '读对了，再试试让声音更连贯。'),
  t('a-7', '练习', '把单词和图片配对', 'mat · map · sun · sock', ['/m/', '/æ/', '/s/'], ['a-3', 'a-4'], 3,
    '读出单词，然后把单词卡拖到对应图片。',
    '支持键盘选择起点和终点，不使用拖拽也能完成。', 12,
    '答对后播放该单词的分解音。'),
  t('a-8', '句子', '迁移朗读：A man sat.', 'A man sat and had a nap.', ['/m/', '/æ/', '/n/'], ['a-5', 'a-6'], 4,
    '观察 a 和 man 之间的联系，再完整朗读。',
    '提供分句导航、朗读速度控制和高对比模式。', 12,
    '先跟读，再独立朗读，注意 /n/ 的鼻音。')
];

// 教研组第二版（2026 秋季）：并入 /æ/ 口型、删掉独立活动 a-5，调整 a-3 时长与 a-1 说明，a-8 依赖改向
const activitiesV2: Activity[] = activitiesV1
  .filter((activity) => activity.id !== 'a-5')
  .map((activity) => {
    if (activity.id === 'a-1') {
      return {
        ...activity,
        prompt: '闭上嘴唇发 /m/，把手放在鼻子上感受震动，再和 /s/ 做对比。',
        accessibility: '口型正面图、侧面舌位图与可重复慢速音频。'
      };
    }
    if (activity.id === 'a-3') {
      return { ...activity, duration: 12, content: 's – a – t → sat（含 /æ/ 口型示范）' };
    }
    if (activity.id === 'a-8') {
      return { ...activity, dependencies: ['a-6'], prompt: '观察 a 和 man 之间的联系，再完整朗读。跟读两遍。' };
    }
    return activity;
  });

const emptyOverrides = (): OverrideMap => ({ meta: {}, activities: {}, order: null });

function plan(
  id: string,
  className: string,
  templateId: string,
  versionId: string,
  build: (overrides: OverrideMap, pending: PendingItem[]) => UpgradeStage | void,
  createdAt: string
): ClassPlan {
  const overrides = emptyOverrides();
  const pending: PendingItem[] = [];
  const stage = build(overrides, pending) ?? null;
  return {
    id,
    className,
    templateId,
    templateVersionId: versionId,
    overrides,
    pending,
    upgradeStage: stage,
    createdAt,
    updatedAt: createdAt
  };
}

export function seedWorkspace(): Workspace {
  const templateA: CourseTemplate = {
    id: 'tpl-a',
    draftMeta: { ...metaV1, objective: '建立音素意识，能听辨、拼读短元音词，并初步朗读完整句子。' },
    draftNote: '强化 /s/ 听辨时长，新增单元复习活动。',
    draftActivities: [
      ...activitiesV2.map((activity) => (activity.id === 'a-2' ? { ...activity, duration: 10 } : activity)),
      t('a-9', '练习', '单元复习：声音侦探闯关', 'mat, sat, man, sun, sock', ['/m/', '/s/', '/æ/', '/t/'], ['a-7', 'a-8'], 3,
        '依次完成听辨、拼读和朗读三关，每关得一枚侦探徽章。',
        '关卡支持键盘操作并朗读当前任务，徽章不只靠颜色区分。', 14,
        '完成后按错误音素给出对应重练卡片。')
    ],
    draftUpdatedAt: '2026-10-05T09:10:00+08:00',
    createdAt: '2026-03-02T09:00:00+08:00',
    versions: [
      {
        id: 'v-t1',
        label: '2026 春季版',
        note: '完成音素和基础拼读活动，独立教授 /æ/ 口型。',
        savedAt: '2026-03-10T10:00:00+08:00',
        meta: { ...metaV1 },
        activities: activitiesV1
      },
      {
        id: 'v-t2',
        label: '2026 秋季版',
        note: '/æ/ 口型并入 sat 拼读，删除独立口型活动；a-8 改为只依赖 Mat sat；更新提示与时长。',
        savedAt: '2026-09-20T15:30:00+08:00',
        meta: { ...metaV1 },
        activities: activitiesV2
      }
    ]
  };

  const templateB: CourseTemplate = {
    id: 'tpl-b',
    draftMeta: {
      title: 'Word Family · at 家族',
      level: '启蒙二级',
      ageRange: '6–7 岁',
      objective: '掌握 -at 词族的押韵替换与朗读。'
    },
    draftNote: '',
    draftActivities: [
      t('b-1', '音素', '押韵意识：-at', '/æt/', ['/æ/', '/t/'], [], 1,
        '拍手读出 -at 的尾韵，感受不变的部分。',
        '提供节拍动画和重读音频。', 6),
      t('b-2', '单词', '替换首音：cat / bat / hat', 'c-at, b-at, h-at', ['/k/', '/b/', '/h/', '/æ/', '/t/'], ['b-1'], 2,
        '只换第一个音，保持 -at 不变，快速连读。',
        '首音块大字号高对比，可键盘切换。', 10,
        '换错首音时回放到 -at 的对比。'),
      t('b-3', '练习', '押韵词圈一圈', 'cat, hat, mat, sun', ['/k/', '/h/', '/m/', '/s/'], ['b-2'], 2,
        '圈出所有和 cat 押韵的单词。',
        '支持键盘逐个聚焦勾选并朗读单词。', 9,
        '圈错时重读尾韵再判断。')
    ],
    draftUpdatedAt: '2026-09-28T11:00:00+08:00',
    createdAt: '2026-09-25T09:00:00+08:00',
    versions: [
      {
        id: 'v-b1',
        label: '首版',
        note: '-at 词族押韵与替换练习。',
        savedAt: '2026-09-26T10:00:00+08:00',
        meta: {
          title: 'Word Family · at 家族',
          level: '启蒙二级',
          ageRange: '6–7 岁',
          objective: '掌握 -at 词族的押韵替换与朗读。'
        },
        activities: [
          t('b-1', '音素', '押韵意识：-at', '/æt/', ['/æ/', '/t/'], [], 1,
            '拍手读出 -at 的尾韵，感受不变的部分。',
            '提供节拍动画和重读音频。', 6),
          t('b-2', '单词', '替换首音：cat / bat / hat', 'c-at, b-at, h-at', ['/k/', '/b/', '/h/', '/æ/', '/t/'], ['b-2'], 2,
            '只换第一个音，保持 -at 不变，快速连读。',
            '首音块大字号高对比，可键盘切换。', 10,
            '换错首音时回放到 -at 的对比。'),
          t('b-3', '练习', '押韵词圈一圈', 'cat, hat, mat, sun', ['/k/', '/h/', '/m/', '/s/'], ['b-2'], 2,
            '圈出所有和 cat 押韵的单词。',
            '支持键盘逐个聚焦勾选并朗读单词。', 9,
            '圈错时读完尾韵再判断。')
        ]
      }
    ]
  };

  const plans: ClassPlan[] = [
    // 大一班：改过时长与说明，升级到秋季版时应保留本地覆盖
    plan('p-1', '大一班', 'tpl-a', 'v-t1', (ov) => {
      ov.activities['a-3'] = {
        fields: {
          duration: { value: 14, dual: null, updatedAt: '2026-09-12T08:30:00+08:00' },
          prompt: { value: '本班节奏较慢，先做三关口型操再拼读 sat。', dual: null, updatedAt: '2026-09-12T08:31:00+08:00' }
        }
      };
      ov.activities['a-4'] = {
        fields: {
          feedback: { value: '选错时让孩子再摸一次喉咙感受 /m/ 的震动。', dual: null, updatedAt: '2026-09-13T10:00:00+08:00' }
        }
      };
      ov.meta.objective = { value: '放慢节奏，确保每个孩子都能独立拼读 sat。', dual: null, updatedAt: '2026-09-13T10:05:00+08:00' };
    }, '2026-09-01T09:00:00+08:00'),

    // 中二班：有一个本地自建活动
    plan('p-2', '中二班', 'tpl-a', 'v-t1', (ov) => {
      ov.activities['p2-song'] = {
        added: t('p2-song', '练习', '课前热身：鼻音歌', 'mmm ~ sss 跟唱', ['/m/', '/s/'], ['a-1'], 1,
          '全班跟着音频哼唱，用手势区分两个音。',
          '歌词配大号图示与震动提示，听障儿童可看手势参与。', 5,
          '唱完请孩子指出哪个音需要闭嘴唇。')
      };
      ov.order = ['p2-song', 'a-1', 'a-2', 'a-3', 'a-4', 'a-5', 'a-6', 'a-7', 'a-8'];
    }, '2026-09-03T14:00:00+08:00'),

    // 小三班：上次升级处理失败，保留了班级草稿待重试
    plan('p-3', '小三班', 'tpl-a', 'v-t1', (ov, pending) => {
      ov.activities['a-3'] = {
        fields: {
          duration: { value: 15, dual: null, updatedAt: '2026-09-15T09:00:00+08:00' }
        }
      };
      ov.meta.title = { value: '声音侦探 · 小三班定制', dual: null, updatedAt: '2026-09-15T09:05:00+08:00' };
      const stageOverrides: OverrideMap = {
        meta: { ...ov.meta },
        activities: structuredClone(ov.activities),
        order: ov.order ? [...ov.order] : null
      };
      pending.push({
        id: 'pg-a5',
        kind: 'activity-removed',
        activityId: 'a-5',
        activityTitle: '短元音 /æ/ 的口型',
        snapshot: activitiesV1.find((item) => item.id === 'a-5'),
        detail: '秋季版已删除该活动，本班曾在课后加练口型，请选择转为本班活动或跟随模板移除。',
        createdAt: '2026-09-21T16:00:00+08:00'
      });
      pending.push({
        id: 'pg-dep-a8',
        kind: 'dependency-redirected',
        activityId: 'a-8',
        activityTitle: '迁移朗读：A man sat.',
        dependencyId: 'a-5',
        dependencyTitle: '短元音 /æ/ 的口型',
        detail: '秋季版中 A man sat. 不再依赖 /æ/ 口型活动，请确认改向到 Mat sat. 或改选其他前置。',
        createdAt: '2026-09-21T16:00:00+08:00'
      });
      const stage: UpgradeStage = {
        targetVersionId: 'v-t2',
        targetLabel: '2026 秋季版',
        overrides: stageOverrides,
        pending,
        error: '同步到教研组服务器超时（断网），升级结果已保留为班级草稿。',
        createdAt: '2026-09-21T16:00:00+08:00'
      };
      return stage;
    }, '2026-09-05T09:00:00+08:00'),

    // 大四班：已升级秋季版，覆盖项很少
    plan('p-4', '大四班', 'tpl-a', 'v-t2', (ov) => {
      ov.activities['a-2'] = {
        fields: {
          duration: { value: 9, dual: null, updatedAt: '2026-09-25T10:00:00+08:00' }
        }
      };
    }, '2026-09-22T09:00:00+08:00')
  ];

  return {
    schema: 2,
    templates: [templateA, templateB],
    plans,
    offline: null,
    updatedAt: '2026-10-06T08:00:00+08:00'
  };
}

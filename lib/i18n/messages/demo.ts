import { defineMessages } from '../locale'

// The public demo pages (app/demo/…) and the names of the fictional students in the demo data (lib/demo-data.ts)
export const demo = defineMessages({
  zh: {
    header: (app: string) => `${app} · 演示`,
    analyticsTitle: '分析（演示）',
    analyticsIntro: '一个家教用的进度管理系统里的分析页。下面的学生和记录全部是随机生成的，不是真实数据。',
    scheduleTitle: '课表（演示）',
    scheduleIntro:
      '课表：每周固定时间按规则展开，发生过的（上了 / 请假 / 加课）用记录；请假的课不显示；每节课按真实起止时间画，时间重叠的并排，淡色背景是四个标准时段。学生和课都是虚构的。',
    teacherSchedule: '老师的课表',
    studentPage: (name: string) => `学生 ${name} 的页面（只高亮 ${name}）`,
    // fictional students in the analytics demo (keyed by the ids in demo-data.ts)
    students: {
      'demo-a': '演示A・小6',
      'demo-b': '演示B・中1',
      'demo-c': '演示C・中3',
      'demo-d': '演示D・日语',
    } as Record<string, string>,
  },
  en: {
    header: (app: string) => `${app} · Demo`,
    analyticsTitle: 'Analytics (demo)',
    analyticsIntro:
      'The analytics page of a progress-tracking system for a private tutor. All students and records below are randomly generated, not real data.',
    scheduleTitle: 'Schedule (demo)',
    scheduleIntro:
      'Schedule: weekly times are expanded from rules, and what actually happened (held / leave / extra lessons) comes from records. Lessons on leave are not shown. Each lesson is drawn at its real start and end time, overlapping lessons side by side; the light background marks the four standard time slots. All students and lessons are fictional.',
    teacherSchedule: "Teacher's schedule",
    studentPage: (name: string) => `Student ${name}'s page (only ${name} highlighted)`,
    students: {
      'demo-a': 'Demo A · Grade 6',
      'demo-b': 'Demo B · Grade 7',
      'demo-c': 'Demo C · Grade 9',
      'demo-d': 'Demo D · Japanese',
    },
  },
  ja: {
    header: (app: string) => `${app} · デモ`,
    analyticsTitle: '分析（デモ）',
    analyticsIntro: '家庭教師向けの進捗管理システムの分析ページです。以下の生徒と記録はすべてランダムに生成したもので、実際のデータではありません。',
    scheduleTitle: 'スケジュール（デモ）',
    scheduleIntro:
      'スケジュール：毎週の固定時間はルールから展開し、実際にあったこと（実施 / お休み / 追加授業）は記録を使います。お休みの授業は表示しません。各授業は実際の開始・終了時刻で描き、重なる授業は横に並べます。薄い背景は 4 つの標準時間帯です。生徒と授業はすべて架空です。',
    teacherSchedule: '講師のスケジュール',
    studentPage: (name: string) => `生徒 ${name} のページ（${name} だけ強調）`,
    students: {
      'demo-a': 'デモA・小6',
      'demo-b': 'デモB・中1',
      'demo-c': 'デモC・中3',
      'demo-d': 'デモD・日本語',
    },
  },
})

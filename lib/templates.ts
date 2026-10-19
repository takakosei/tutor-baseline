// Checkpoint templates for adding a student. Pure functions, covered by tests.
// Exam templates count back from the end date (the exam); the ongoing template counts forward from the start date.
// Checkpoints before the start date aren't created: a student who joins midway shouldn't start out "behind".
// Parent visibility is always false (the column's default in the schema); the teacher turns it on per checkpoint
// on the edit page.
// Checkpoint text follows the teacher's language: it's stored in that language, and switching languages later
// doesn't change checkpoints already created.
// Template names are UI text, in templates in lib/i18n/messages/student.ts

import { addDays } from './analytics'
import type { Locale } from './i18n/locale'

export type TemplateId = 'none' | 'exam' | 'eiken' | 'ongoing'

// [checkpoint, criterion]
type Text = readonly [title: string, criterion: string | null]
// offset: days relative to the anchor (the end date for exams, the start date for ongoing); null = an ongoing item
type Item = { offset: number | null } & Record<Locale, Text>

const TEMPLATES: Record<Exclude<TemplateId, 'none'>, { anchor: 'end' | 'start'; items: Item[] }> = {
  exam: {
    anchor: 'end',
    items: [
      {
        offset: -120,
        zh: ['过去问 1 周目跑完', '志望校 3 年分做完，失分分类表填满一页'],
        en: ['First pass through past papers', "Three years of the target school's papers done; one full page of the mistake-type log"],
        ja: ['過去問 1 周目完了', '志望校 3 年分を解き終え、失点分類表が 1 ページ埋まる'],
      },
      {
        offset: -90,
        zh: ['失分类型收敛', '连续 2 次复盘里，新出现的失分类型 ≤ 1 个'],
        en: ['Mistake types narrowing down', 'At most 1 new mistake type across 2 reviews in a row'],
        ja: ['失点パターンの収束', '2 回続けての振り返りで、新しい失点パターンが 1 つ以下'],
      },
      {
        offset: -65,
        zh: ['答题模板固定', '作文、资料读取各一套模板，不看模板能复述结构'],
        en: ['Answer templates settled', 'One template each for essays and data reading; can explain the structure without looking'],
        ja: ['解答の型を固める', '作文・資料読み取りそれぞれ型を 1 つ決め、見ないで構成を説明できる'],
      },
      {
        offset: -40,
        zh: ['时间分配定稿', '每道大题的放弃线写下来，连续 2 次模考没超时'],
        en: ['Time plan finalized', 'A give-up point written down for each main question; no overrun in 2 mock exams in a row'],
        ja: ['時間配分の確定', '大問ごとの見切りラインを書き出し、模試 2 回連続で時間内'],
      },
      {
        offset: -14,
        zh: ['併願校过去问各 1 回 + 复盘', '题型差异列出来'],
        en: ['One past paper from each backup school + review', 'Differences in question types listed'],
        ja: ['併願校の過去問を各 1 回 + 振り返り', '出題形式の違いを書き出す'],
      },
      {
        offset: -3,
        zh: ['最后几天只复盘', '不开新题，只过错题本和时间分配'],
        en: ['Final days: review only', 'No new problems; only the mistake notebook and the time plan'],
        ja: ['直前は振り返りのみ', '新しい問題はやらず、間違いノートと時間配分だけ見直す'],
      },
      { offset: 0, zh: ['本番', null], en: ['Exam day', null], ja: ['本番', null] },
    ],
  },
  eiken: {
    anchor: 'end',
    items: [
      {
        offset: -90,
        zh: ['报名 + 确定考试日', '报名完成，把真实日期填进系统'],
        en: ['Register + fix the test date', 'Registration done; the real date entered in the system'],
        ja: ['申込 + 受験日の確定', '申込を済ませ、実際の日付をシステムに入力'],
      },
      {
        offset: -60,
        zh: ['单词 1 周目', '过去问词汇部分 6 成'],
        en: ['First pass through vocabulary', '60% on the vocabulary section of past papers'],
        ja: ['単語 1 周目', '過去問の語彙問題で 6 割'],
      },
      {
        offset: -30,
        zh: ['过去问 3 回目', '笔试稳定 6 成以上'],
        en: ['Third past paper', 'Written test steadily at 60% or more'],
        ja: ['過去問 3 回目', '筆記で安定して 6 割以上'],
      },
      {
        offset: -14,
        zh: ['弱点两块专项', '最差的两个题型各练 3 次，正答率翻倍'],
        en: ['Targeted work on two weak areas', 'The two weakest question types practiced 3 times each; accuracy doubled'],
        ja: ['弱点 2 分野の集中対策', '一番苦手な 2 つの形式を各 3 回練習し、正答率を倍に'],
      },
      { offset: 0, zh: ['本番', null], en: ['Test day', null], ja: ['本番', null] },
    ],
  },
  ongoing: {
    anchor: 'start',
    items: [
      {
        offset: 28,
        zh: ['第一次回顾', '和家长确认目标和上课节奏'],
        en: ['First review', 'Confirm goals and lesson pace with the parents'],
        ja: ['1 回目の振り返り', '保護者と目標・授業ペースを確認'],
      },
      {
        offset: 84,
        zh: ['三个月回顾', '这三个月的进步写成一段话给家长'],
        en: ['Three-month review', 'Progress over the three months written up in a paragraph for the parents'],
        ja: ['3 か月の振り返り', 'この 3 か月の成長を短い文章にまとめて保護者に渡す'],
      },
      {
        offset: null,
        zh: ['每次课固定 15 分钟复习上次内容', '持续项，不参与进度计算'],
        en: ['Every lesson: 15 minutes reviewing last time', 'Ongoing item, not counted in progress'],
        ja: ['毎回 15 分、前回の内容を復習', '継続項目、進捗には含めない'],
      },
    ],
  },
}

export const TEMPLATE_OPTIONS: { id: TemplateId; needsEnd: boolean }[] = [
  { id: 'none', needsEnd: false },
  ...(Object.entries(TEMPLATES) as [Exclude<TemplateId, 'none'>, (typeof TEMPLATES)['exam']][]).map(([id, t]) => ({
    id,
    needsEnd: t.anchor === 'end',
  })),
]

export type TemplateCheckpoint = {
  seq: number
  due_date: string | null
  title: string
  criterion: string | null
  date_tbd: boolean
  parent_visible: boolean
}

export function templateCheckpoints(
  id: TemplateId,
  { startDate, endDate, locale }: { startDate: string; endDate: string | null; locale: Locale }
): TemplateCheckpoint[] {
  if (id === 'none') return []
  const t = TEMPLATES[id]
  const anchor = t.anchor === 'end' ? endDate : startDate
  if (anchor === null) throw new Error(`Template ${id} needs an end date`)

  return t.items
    .map((item) => ({ text: item[locale], due: item.offset === null ? null : addDays(anchor, item.offset) }))
    .filter((item) => item.due === null || item.due >= startDate)
    .map((item, i) => ({
      seq: i + 1,
      due_date: item.due,
      title: item.text[0],
      criterion: item.text[1],
      date_tbd: false,
      parent_visible: false,
    }))
}

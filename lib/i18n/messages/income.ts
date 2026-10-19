import { defineMessages } from '../locale'

// Income page (app/(app)/income)
const lessonsEn = (n: number) => `${n} ${n === 1 ? 'lesson' : 'lessons'}`
// The month column is narrow (4.5rem on phones), so English uses abbreviations
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const income = defineMessages({
  zh: {
    back: '← 返回',
    allTime: (since: string) => `开始到现在（${since}起）`,
    // months of the current year show only the month (sameYear); other years include the year
    month: (y: number, m: number, sameYear: boolean) => (sameYear ? `${m} 月` : `${y}年${m}月`),
    lessonsDuration: (n: number, duration: string) => `${n} 节 · ${duration}`,
    byMonth: '每个月（点开看每个学生）',
    toDate: '到今天',
    unlogged: (n: number) => `这个月还有 ${n} 节课没记，不在上面的数字里。`,
    noBillable: '这个月没有收费的课。',
    extrasNote: (total: string) =>
      `「其他」是学费明细里另外加减的（代买教材、优惠），不算在课时费里。加上之后这个月学费明细合计 ${total}。`,
  },
  en: {
    back: '← Back',
    allTime: (since: string) => `All time (since ${since})`,
    month: (y: number, m: number, sameYear: boolean) => (sameYear ? MONTHS_EN[m - 1] : `${MONTHS_EN[m - 1]} ${y}`),
    lessonsDuration: (n: number, duration: string) => `${lessonsEn(n)} · ${duration}`,
    byMonth: 'By month (open one to see each student)',
    toDate: 'to date',
    unlogged: (n: number) => `${lessonsEn(n)} this month ${n === 1 ? 'is' : 'are'} not logged yet and not in the figures above.`,
    noBillable: 'No billable lessons this month.',
    extrasNote: (total: string) =>
      `"Other" is what was added or taken off on the tuition statement (materials bought for the student, discounts); it is not part of the lesson fees. Including it, this month's statements total ${total}.`,
  },
  ja: {
    back: '← 戻る',
    allTime: (since: string) => `累計（${since}から）`,
    month: (y: number, m: number, sameYear: boolean) => (sameYear ? `${m}月` : `${y}年${m}月`),
    lessonsDuration: (n: number, duration: string) => `${n} コマ · ${duration}`,
    byMonth: '月別（開くと生徒ごとに表示）',
    toDate: '今日まで',
    unlogged: (n: number) => `今月はまだ記録していない授業が ${n} コマあり、上の数字には含まれていません。`,
    noBillable: '今月は請求対象の授業がありません。',
    extrasNote: (total: string) =>
      `「その他」は授業料明細で別に加減した項目（教材の立替、割引）で、授業料には含まれません。含めると今月の明細の合計は ${total} です。`,
  },
})

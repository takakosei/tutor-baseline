import { defineMessages } from '../locale'
import { statement } from './statement'

// The teacher's tuition statement page (app/(app)/students/[id]/statement): title, month navigation, unlogged
// lessons, publishing to parents, adding other items. The text on the statement itself is in statement.ts (shared
// with the parent page)
export const statementPage = defineMessages({
  zh: {
    // The page title may be printed in the page header and is the default file name for Save as PDF
    title: (y: number, m: number) => `${y}年${m}月 学费明细`,
    back: (name: string) => `← 返回 ${name}`,
    prevMonth: '← 上个月',
    nextMonth: '下个月 →',
    unlogged: (dates: string[]) => `这个月还有 ${dates.length} 节课没记（${dates.join('、')}），明细里不包括它们。先去记好再打印。`,
    published: (date: string) => `家长页上能看到这个月的明细（${date} 起）`,
    unpublish: '收回',
    notPublished: '家长还看不到这个月的明细。检查好、教材费加好以后再给家长看',
    publish: '给家长看',
    linkOff: '这个学生的家长链接没开（在学生页打开），开了之后才能把明细给家长看',
    delete: '删除',
    // adding other items
    addItem: '＋ 加一项（代买的教材、优惠等）',
    itemPlaceholder: '内容，比如：代买教材《…》',
    sign: '加还是减',
    plus: '加（家长付）',
    minus: '减（优惠、抵扣）',
    add: '添加',
  },
  en: {
    title: (y: number, m: number) => `${statement.en.month(y, m)} tuition statement`,
    back: (name: string) => `← Back to ${name}`,
    prevMonth: '← Prev month',
    nextMonth: 'Next month →',
    unlogged: (dates: string[]) =>
      `${dates.length} ${dates.length === 1 ? 'lesson' : 'lessons'} this month not logged yet (${dates.join(', ')}). Unlogged lessons aren't in the statement; log them before printing.`,
    published: (date: string) => `Parents can see this month's statement (since ${date})`,
    unpublish: 'Withdraw',
    notPublished: "Parents can't see this month's statement yet. Check it and add any materials fees, then show it to parents",
    publish: 'Show to parents',
    linkOff: "This student's parent link is off (turn it on on the student page). Once it's on, the statement can be shown to parents",
    delete: 'Delete',
    addItem: '+ Add an item (materials bought for the student, discounts, etc.)',
    itemPlaceholder: 'Item, e.g. Workbook "…" (bought on your behalf)',
    sign: 'Add or subtract',
    plus: 'Add (parent pays)',
    minus: 'Subtract (discount, credit)',
    add: 'Add',
  },
  ja: {
    title: (y: number, m: number) => `${y}年${m}月 授業料明細`,
    back: (name: string) => `← ${name} に戻る`,
    prevMonth: '← 前月',
    nextMonth: '翌月 →',
    unlogged: (dates: string[]) =>
      `今月はまだ記録していない授業が ${dates.length} コマあります（${dates.join('、')}）。明細には含まれていません。記録してから印刷してください。`,
    published: (date: string) => `保護者ページで今月の明細を公開しています（${date} から）`,
    unpublish: '公開をやめる',
    notPublished: '保護者にはまだ今月の明細が見えません。内容を確認し、教材費などを追加してから公開してください',
    publish: '保護者に公開',
    linkOff: 'この生徒の保護者リンクがオフです（生徒ページでオンにできます）。オンにすると明細を公開できます',
    delete: '削除',
    addItem: '＋ 項目を追加（立替の教材費、割引など）',
    itemPlaceholder: '内容（例：教材『…』立替分）',
    sign: '加算か減算か',
    plus: '加算（保護者負担）',
    minus: '減算（割引・相殺）',
    add: '追加',
  },
})

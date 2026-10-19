import { defineMessages } from '../locale'

// The email the teacher gets when a parent requests an extra lesson or leave (requestMail in lib/booking.ts),
// in the teacher's own language
export const mail = defineMessages({
  zh: {
    fromName: '家教管理',
    student: '学生',
    subject: (who: string, add: boolean, when: string) => `【家教管理】${who} ${add ? '想加课' : '请假'} ${when}`,
    addIntro: (who: string) => `${who} 的家长想加一节课：`,
    leaveIntro: (who: string) => `${who} 的家长请假了（已经记成请假，课表上拿掉了）：`,
    message: (m: string) => `留言：${m}`,
    addLink: (url: string) => `可以的话在 dashboard 上点「可以」就加到课表：${url}`,
    addNoLink: '可以的话在 dashboard 的提醒里点「可以」就加到课表。',
    leaveLink: (url: string) => `dashboard：${url}`,
    leaveNoLink: '在 dashboard 的提醒里可以看到。',
  },
  en: {
    fromName: 'Tutor Baseline',
    student: 'Student',
    subject: (who: string, add: boolean, when: string) => `[Tutor Baseline] ${who} ${add ? 'wants an extra lesson' : 'is taking leave'} ${when}`,
    addIntro: (who: string) => `${who}'s parent would like an extra lesson:`,
    leaveIntro: (who: string) => `${who}'s parent has taken leave (already recorded as leave and removed from the schedule):`,
    message: (m: string) => `Message: ${m}`,
    addLink: (url: string) => `To accept, click "Accept" on the dashboard and it goes on the schedule: ${url}`,
    addNoLink: 'To accept, click "Accept" in the dashboard reminders and it goes on the schedule.',
    leaveLink: (url: string) => `Dashboard: ${url}`,
    leaveNoLink: 'You can see it in the dashboard reminders.',
  },
  ja: {
    fromName: '家庭教師管理',
    student: '生徒',
    subject: (who: string, add: boolean, when: string) => `【家庭教師管理】${who} ${add ? '追加授業の希望' : 'お休みの連絡'} ${when}`,
    addIntro: (who: string) => `${who} の保護者から追加授業の希望がありました：`,
    leaveIntro: (who: string) => `${who} の保護者からお休みの連絡がありました（お休みとして記録し、予定から外しました）：`,
    message: (m: string) => `メッセージ：${m}`,
    addLink: (url: string) => `よければダッシュボードで「承認」を押すと予定に入ります：${url}`,
    addNoLink: 'よければダッシュボードのお知らせで「承認」を押すと予定に入ります。',
    leaveLink: (url: string) => `ダッシュボード：${url}`,
    leaveNoLink: 'ダッシュボードのお知らせで確認できます。',
  },
})

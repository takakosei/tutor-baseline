import { defineMessages } from '../locale'

// Language settings: the Account page (the teacher's own UI) and the student edit page (that student's parent page)
export const settings = defineMessages({
  zh: {
    language: '界面语言',
    languageHint: '你这边所有页面和通知邮件的语言。家长页的语言在每个学生的「编辑」里设，不跟着这里变。',
    save: '保存',
    parentLanguage: '家长页语言',
    parentLanguageHint: '家长打开链接时看到的语言，和你自己的界面语言无关',
  },
  en: {
    language: 'Language',
    languageHint: "Language for all your pages and notification emails. Each student's parent page has its own language, set on the student's Edit page; it doesn't change with this one.",
    save: 'Save',
    parentLanguage: 'Parent page language',
    parentLanguageHint: "What parents see when they open the link; separate from your own language",
  },
  ja: {
    language: '表示言語',
    languageHint: 'あなたのすべてのページと通知メールの言語です。保護者ページの言語は各生徒の「編集」で設定し、ここを変えても変わりません。',
    save: '保存',
    parentLanguage: '保護者ページの言語',
    parentLanguageHint: '保護者がリンクを開いたときに表示される言語。自分の表示言語とは別です',
  },
})

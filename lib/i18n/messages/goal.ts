import { defineMessages } from '../locale'

// The goal card's trend chart (components/goal-chart.tsx)
export const goal = defineMessages({
  zh: {
    chartLabel: '模拟考的分数和阶段目标',
    exam: (date: string) => `本番 ${date}`,
    actual: '实际',
    passLine: '合格所需线',
    bestLine: '最好情况线',
    gapToStage: (date: string, pass: string, best: string) => ` · 距 ${date} 的目标 ${pass} / ${best}`,
  },
  en: {
    chartLabel: 'Mock exam scores and stage targets',
    exam: (date: string) => `Exam ${date}`,
    actual: 'Actual',
    passLine: 'Pass line',
    bestLine: 'Best-case line',
    gapToStage: (date: string, pass: string, best: string) => ` · vs the ${date} target ${pass} / ${best}`,
  },
  ja: {
    chartLabel: '模試の得点と段階目標',
    exam: (date: string) => `本番 ${date}`,
    actual: '実績',
    passLine: '合格ライン',
    bestLine: 'ベストライン',
    gapToStage: (date: string, pass: string, best: string) => ` · ${date} の目標まで ${pass} / ${best}`,
  },
})

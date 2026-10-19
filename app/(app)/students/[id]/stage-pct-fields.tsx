'use client'

import { useState } from 'react'
import { tekiseiPct, totalPctFor } from '@/lib/metrics'
import { useLocale } from '@/components/locale-provider'
import { goalCard } from '@/lib/i18n/messages/grades'

// Toritsu stage targets: either the total-score % or the aptitude-test % can be entered, and changing one updates the other
// (converted with the current school report). The total-score % is stored (hidden pass / best, two decimals, so a value
// entered on the aptitude side reads back unchanged). Aptitude above 100 = out of reach: flagged red but not blocked
// (the stored total-score % is what the server rejects above 100). Without report-card grades (report = null) only the
// total can be entered
const box = 'w-16 rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-right text-sm tabular-nums'
const one = (n: number) => String(Math.round(n * 10) / 10)

function Line({ name, label, report, initial }: { name: 'pass' | 'best'; label: string; report: number | null; initial: number | null }) {
  const t = goalCard[useLocale()]
  const [total, setTotal] = useState(initial === null ? '' : one(initial))
  const [tekisei, setTekisei] = useState(initial === null || report === null ? '' : one(tekiseiPct(initial, report)))
  const [stored, setStored] = useState(initial === null ? '' : String(initial))
  const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v))

  const onTotal = (v: string) => {
    setTotal(v)
    const n = num(v)
    setStored(n === null ? '' : String(n))
    setTekisei(n === null || report === null ? '' : one(tekiseiPct(n, report)))
  }
  const onTekisei = (v: string) => {
    setTekisei(v)
    const n = num(v)
    if (n === null || report === null) {
      setStored('')
      setTotal('')
      return
    }
    const t = Math.round(totalPctFor(n, report) * 100) / 100
    setStored(String(t))
    setTotal(one(t))
  }
  const over = num(tekisei) !== null && num(tekisei)! > 100

  return (
    <span className="flex items-center gap-1.5 text-xs text-foreground/60">
      <input type="hidden" name={name} value={stored} />
      {/* The Japanese "best" label is wider than two characters: at least w-6, never truncated */}
      <span className="min-w-6 shrink-0">{label}</span>
      {t.total}
      <input
        type="number"
        value={total}
        onChange={(e) => onTotal(e.target.value)}
        min={0}
        max={100}
        step="any"
        inputMode="decimal"
        placeholder="—"
        aria-label={t.pctOfTotal(label)}
        className={box}
      />
      %<span className="ml-1.5">{t.tekisei}</span>
      <input
        type="number"
        value={tekisei}
        onChange={(e) => onTekisei(e.target.value)}
        min={0}
        step="any"
        inputMode="decimal"
        placeholder="—"
        disabled={report === null}
        aria-label={t.pctOfTekisei(label)}
        className={`${box} disabled:opacity-40 ${over ? 'border-red-500 text-red-700 dark:text-red-400' : ''}`}
      />
      %
    </span>
  )
}

export function StagePctFields({ report, pass, best }: { report: number | null; pass: number | null; best: number | null }) {
  const t = goalCard[useLocale()]
  return (
    <span className="flex basis-full flex-col gap-1.5">
      <Line name="pass" label={t.passShort} report={report} initial={pass} />
      <Line name="best" label={t.bestShort} report={report} initial={best} />
    </span>
  )
}

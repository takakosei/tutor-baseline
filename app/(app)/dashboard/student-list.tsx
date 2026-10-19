'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useLocale } from '@/components/locale-provider'
import { dashboard } from '@/lib/i18n/messages/dashboard'
import { reorderStudents } from './actions'

// The dashboard's student section: the cards (rendered on the server and passed in; cards[i] is the card for students[i])
// plus reordering. "Sort" turns them into a list of names: drag by the ⠿ handle on the right, or use ↑↓ to move one step;
// "Done" saves the order (in the database, so it's the same on every device), "Cancel" discards it.
// Dragging only starts from ⠿ (that area doesn't scroll the page), so on a phone touching elsewhere still scrolls
export function StudentList({ students, cards }: { students: { id: string; name: string }[]; cards: React.ReactNode[] }) {
  const [order, setOrder] = useState<string[] | null>(null) // null = not sorting
  const [dragging, setDragging] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()
  const list = useRef<HTMLUListElement>(null)
  const t = dashboard[useLocale()].list

  const ids = students.map((s) => s.id)
  const nameOf = new Map(students.map((s) => [s.id, s.name]))
  const changed = order !== null && order.join() !== ids.join()

  function move(id: string, by: -1 | 1) {
    setOrder((o) => {
      if (!o) return o
      const i = o.indexOf(id)
      const j = i + by
      if (j < 0 || j >= o.length) return o
      const next = [...o]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  // while dragging: the row moves below every other row whose midline the finger (mouse) is past
  function dragTo(clientY: number) {
    if (!dragging || !order || !list.current) return
    const rows = [...list.current.children] as HTMLElement[]
    const target = rows.filter((el, i) => {
      if (order[i] === dragging) return false
      const r = el.getBoundingClientRect()
      return clientY > r.top + r.height / 2
    }).length
    const next = order.filter((id) => id !== dragging)
    next.splice(target, 0, dragging)
    if (next.join() !== order.join()) setOrder(next)
  }

  function finish() {
    if (!changed) return setOrder(null)
    startSaving(async () => {
      await reorderStudents(order)
      setOrder(null)
    })
  }

  const button = 'text-sm text-foreground/60 hover:text-foreground disabled:opacity-50'

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground/60">{t.title}</h2>
        <div className="flex gap-4">
          {order === null ? (
            <>
              {students.length > 1 && (
                <button type="button" onClick={() => setOrder(ids)} className={button}>
                  {t.reorder}
                </button>
              )}
              <Link href="/students/new" className={button}>
                {t.addStudent}
              </Link>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setOrder(null)} disabled={saving} className={button}>
                {t.cancel}
              </button>
              <button type="button" onClick={finish} disabled={saving} className="text-sm font-medium disabled:opacity-50">
                {saving ? t.saving : t.done}
              </button>
            </>
          )}
        </div>
      </div>

      {order === null ? (
        <ul className="space-y-3">
          {students.map((s, i) => (
            <li key={s.id}>{cards[i]}</li>
          ))}
        </ul>
      ) : (
        <>
          <p className="text-xs text-foreground/50">{t.hint}</p>
          <ul ref={list} className="space-y-2">
            {order.map((id, i) => (
              <li
                key={id}
                className={`flex items-center gap-2 rounded-xl border bg-background py-1 pr-1 pl-4 text-sm transition-shadow ${
                  dragging === id ? 'relative z-10 border-foreground/30 shadow-lg' : 'border-foreground/10'
                }`}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{nameOf.get(id)}</span>
                <Arrow label={t.up} disabled={i === 0 || saving} onClick={() => move(id, -1)}>
                  ↑
                </Arrow>
                <Arrow label={t.down} disabled={i === order.length - 1 || saving} onClick={() => move(id, 1)}>
                  ↓
                </Arrow>
                <span
                  aria-hidden
                  onPointerDown={(e) => {
                    if (saving) return
                    e.currentTarget.setPointerCapture(e.pointerId)
                    setDragging(id)
                  }}
                  onPointerMove={(e) => dragTo(e.clientY)}
                  onPointerUp={() => setDragging(null)}
                  onPointerCancel={() => setDragging(null)}
                  className="flex size-11 cursor-grab touch-none items-center justify-center text-lg text-foreground/40 select-none active:cursor-grabbing"
                >
                  ⠿
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function Arrow({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-lg text-base text-foreground/70 hover:bg-foreground/[0.05] disabled:opacity-25"
    >
      {children}
    </button>
  )
}

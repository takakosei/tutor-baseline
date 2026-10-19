import { describe, expect, it } from 'vitest'
import { toParentStatement, toParentView } from './parent-view'

// Internal fields passed in from upstream (say, if a query were changed to select *) must never reach the output
const SECRET = '内部机密'
const student = {
  display_name: 'B',
  goal: '数学・英语',
  end_label: '无终点 · 长期',
  start_date: '2026-09-01',
  end_date: null,
  name: `学生B ${SECRET}`,
  risk_level: 'warn',
  risk_note: `家长又改时间 ${SECRET}`,
  rate_per_hour: 2000,
}

function cp(id: string, seq: number, due_date: string | null, opts: Partial<{ done_at: string | null; parent_visible: boolean; criterion: string | null }> = {}) {
  return {
    id,
    seq,
    due_date,
    title: `节点${id}`,
    criterion: opts.criterion ?? null,
    done_at: opts.done_at ?? null,
    parent_visible: opts.parent_visible ?? true,
  }
}

const DONE = '2026-09-20T10:00:00+09:00'

describe('toParentView: field whitelist', () => {
  it('no internal field reaches the output (parents get whitelisted fields only, never the internal lesson note)', () => {
    const view = toParentView(
      student,
      [{ ...cp('1', 1, '2026-10-01'), note: SECRET } as never],
      [
        { date: '2026-09-24', status: 'done', parent_summary: '今天做了过去问', note: SECRET, mood: 3, billable: true } as never,
      ],
      '2026-09-25'
    )
    expect(JSON.stringify(view)).not.toContain(SECRET)
    expect(JSON.stringify(view)).not.toMatch(/risk|rate|mood|billable|note|offsetDays|catchUp/)
    expect(Object.keys(view).sort()).toEqual([
      'booking', 'checkpoints', 'displayName', 'endDate', 'endLabel', 'goal', 'grades', 'lessons', 'requests', 'startDate', 'statements',
      'summary', 'upcoming',
    ])
    expect(Object.keys(view.checkpoints[0]).sort()).toEqual(['criterion', 'done', 'dueDate', 'title'])
    expect(Object.keys(view.lessons[0]).sort()).toEqual(['date', 'proctor', 'summary', 'trial'])
    expect(view).toMatchObject({ startDate: '2026-09-01', endDate: null })
  })

  it('trial lessons carry the flag (yes / no only, never the price)', () => {
    const view = toParentView(
      student,
      [],
      [
        { date: '2026-09-13', status: 'done', parent_summary: '了解目前的学习情况', trial: true, rate_per_hour: 1000 } as never,
        { date: '2026-09-20', status: 'done', parent_summary: '开始过去问' },
      ],
      '2026-09-25'
    )
    expect(view.lessons).toEqual([
      { date: '2026-09-13', summary: '了解目前的学习情况', trial: true, proctor: false },
      { date: '2026-09-20', summary: '开始过去问', trial: false, proctor: false },
    ])
    expect(JSON.stringify(view)).not.toMatch(/rate|1000/)
  })

  it('checkpoints hidden from parents are left out, including from the progress calculation', () => {
    const view = toParentView(
      student,
      [
        cp('internal', 1, '2026-09-26', { parent_visible: false, criterion: `别问什么时候方便 ${SECRET}` }),
        cp('a', 2, '2026-10-15'),
      ],
      [],
      '2026-10-01'
    )
    expect(view.checkpoints.map((c) => c.title)).toEqual(['节点a'])
    expect(JSON.stringify(view)).not.toContain(SECRET)
    // the internal item is overdue and unfinished; counting it would make the child look "behind"
    expect(view.summary).toEqual({ total: 1, done: 0, state: 'ontrack' })
  })

  it('shows only held lessons with a non-empty parent summary (the internal note is never shown to parents)', () => {
    const view = toParentView(
      student,
      [],
      [
        { date: '2026-09-24', status: 'done', parent_summary: '  做了资料读取  ' },
        { date: '2026-09-23', status: 'canceled', parent_summary: '台风取消' },
        { date: '2026-09-22', status: 'done', parent_summary: null },
        { date: '2026-09-21', status: 'done', parent_summary: '   ' },
      ],
      '2026-09-25'
    )
    expect(view.lessons).toEqual([{ date: '2026-09-24', summary: '做了资料读取', trial: false, proctor: false }])
  })

  it('progress gives only the done count and a neutral state, never days', () => {
    const view = toParentView(
      student,
      [cp('a', 1, '2026-10-01', { done_at: DONE }), cp('b', 2, '2026-10-10'), cp('c', 3, '2026-11-01')],
      [],
      '2026-10-20'
    )
    expect(view.summary).toEqual({ total: 3, done: 1, state: 'behind' })
  })

  it('no dated checkpoint visible to parents → no progress summary; ongoing items go last', () => {
    const view = toParentView(student, [cp('o', 1, null), cp('x', 2, null, { parent_visible: false })], [], '2026-09-25')
    expect(view.summary).toBeNull()
    expect(view.checkpoints).toEqual([{ title: '节点o', criterion: null, dueDate: null, done: false }])
  })
})

describe('toParentView: upcoming lessons', () => {
  const rule = { id: 'r1', studentId: 's1', weekday: 2, start: '19:00', end: '21:00', startsOn: '2026-09-01', endsOn: null }

  it('shows only lessons still scheduled in the next two weeks, with date, start and end only', () => {
    const view = toParentView(student, [], [], '2026-10-05', {
      schedule: {
        rules: [rule], // every Wednesday
        lessons: [
          { id: 'x', studentId: 's1', date: '2026-10-07', status: 'canceled', start: '19:00', end: '21:00', scheduleId: 'r1' },
          { id: 'y', studentId: 's1', date: '2026-10-10', status: 'scheduled', start: '13:00', end: '15:00', scheduleId: null },
        ],
      },
    })
    expect(view.upcoming).toEqual([
      { date: '2026-10-10', start: '13:00', end: '15:00', proctor: false, moved: false }, // one-off lesson
      { date: '2026-10-14', start: '19:00', end: '21:00', proctor: false, moved: false },
    ])
    // 10/7 was canceled; 10/21 is more than two weeks out
    expect(JSON.stringify(view.upcoming)).not.toMatch(/r1|"x"|"y"|scheduleId|lessonId|studentId/)
  })

  it('a moved lesson shows its new time and a moved flag; the original date and time never appear', () => {
    const view = toParentView(student, [], [], '2026-10-05', {
      schedule: {
        rules: [rule],
        lessons: [
          {
            id: 'm', studentId: 's1', date: '2026-10-08', status: 'scheduled', start: '16:30', end: '18:30', scheduleId: 'r1',
            movedFrom: '2026-10-07', movedFromStart: '19:00', movedFromEnd: '21:00',
          },
        ],
      },
    })
    expect(view.upcoming).toEqual([
      { date: '2026-10-08', start: '16:30', end: '18:30', proctor: false, moved: true }, // the 10/7 lesson moved to 10/8
      { date: '2026-10-14', start: '19:00', end: '21:00', proctor: false, moved: false },
    ])
    expect(JSON.stringify(view.upcoming)).not.toMatch(/10-07|movedFrom|"m"/)
  })

  it('no schedule → empty list', () => {
    expect(toParentView(student, [], [], '2026-10-05').upcoming).toEqual([])
  })

  it('grades: only metrics visible to parents, with date and value only; record notes and hidden metrics never appear', () => {
    const metric = (id: string, name: string, parent_visible: boolean, direction = 1) =>
      ({ id, name, unit: '分', direction, max_value: 100, parent_visible, owner_id: SECRET, student_id: SECRET }) as never
    const rec = (id: string, metric_id: string, date: string, value: number, created_at = `${date}T10:00:00Z`) =>
      ({ id, metric_id, date, value, created_at, note: SECRET, student_id: SECRET }) as never
    const view = toParentView(student, [], [], '2026-09-29', {
      grades: {
      metrics: [metric('m1', '過去問·数学', true), metric('m2', '内部的诊断', false), metric('m3', '计算·用时', true, -1), metric('m4', '还没有记录', true)],
      records: [
        rec('r2', 'm1', '2026-09-20', 75, '2026-09-27T13:48:01Z'),
        rec('r1', 'm1', '2026-09-20', 62, '2026-09-27T13:47:52Z'), // same day: the one entered first comes first
        rec('r3', 'm1', '2026-09-27', 81),
        rec('r4', 'm2', '2026-09-27', 30),
        rec('r5', 'm3', '2026-09-27', 12),
      ],
      },
    })
    expect(view.grades).toEqual([
      { name: '计算·用时', unit: '分', maxValue: 100, lowerIsBetter: true, records: [{ date: '2026-09-27', value: 12 }], parts: [] },
      {
        name: '過去問·数学', unit: '分', maxValue: 100, lowerIsBetter: false,
        records: [{ date: '2026-09-20', value: 62 }, { date: '2026-09-20', value: 75 }, { date: '2026-09-27', value: 81 }],
        parts: [],
      },
    ])
    expect(JSON.stringify(view)).not.toContain(SECRET)
    expect(JSON.stringify(view)).not.toContain('内部的诊断')
    expect(Object.keys(view.grades[0]).sort()).toEqual(['lowerIsBetter', 'maxValue', 'name', 'parts', 'records', 'unit'])
    expect(Object.keys(view.grades[0].records[0]).sort()).toEqual(['date', 'value'])
  })
})


describe('toParentStatement: tuition statement', () => {
  const lesson = (date: string, opts: Partial<{ status: string; durationMin: number | null; billable: boolean; ratePerHour: number | null; trial: boolean }> = {}) => ({
    studentId: 's1',
    date,
    status: opts.status ?? 'done',
    durationMin: opts.durationMin ?? 120,
    start: '19:00',
    end: '21:00',
    billable: opts.billable ?? true,
    ratePerHour: opts.ratePerHour === undefined ? 3000 : opts.ratePerHour,
    trial: opts.trial ?? false,
    note: SECRET, // lesson notes passed in from upstream must not appear either
    parent_summary: SECRET,
  })

  it('outputs only the fields the statement shows: lesson notes and item ids never appear (whitelisted fields only, never the internal lesson note)', () => {
    const st = toParentStatement(
      '2026-09',
      '2026-10-01',
      [lesson('2026-09-17'), lesson('2026-09-13', { trial: true, durationMin: 60, ratePerHour: 1000 })] as never,
      3000,
      [{ id: `item-${SECRET}`, month: '2026-09', date: '2026-09-20', label: '代买教材', amount: 1980, created_at: SECRET } as never]
    )
    expect(JSON.stringify(st)).not.toContain(SECRET)
    expect(JSON.stringify(st)).not.toMatch(/note|summary|billable|studentId|"id"/)
    expect(Object.keys(st).sort()).toEqual(['fee', 'issuedOn', 'items', 'lessonFee', 'lessons', 'minutes', 'month', 'rows'])
    expect(Object.keys(st.rows[0]).sort()).toEqual(['date', 'end', 'fee', 'minutes', 'perSession', 'rate', 'start', 'tag'])
    expect(st.items).toEqual([{ date: '2026-09-20', label: '代买教材', amount: 1980 }])
  })

  it("amounts match the tutor's statement: only this month's billable lessons, trial lessons and billed cancellations tagged, other items in the total", () => {
    const st = toParentStatement(
      '2026-09',
      '2026-10-01',
      [
        lesson('2026-09-13', { trial: true, durationMin: 60, ratePerHour: 1000 }),
        lesson('2026-09-17'),
        lesson('2026-09-24', { status: 'leave', billable: false, durationMin: null }),
        lesson('2026-09-27', { status: 'cancelled', durationMin: null }),
        lesson('2026-10-01'),
      ],
      3000,
      [
        { id: 'a', month: '2026-09', date: null, label: '优惠', amount: -500 },
        { id: 'b', month: '2026-10', date: '2026-10-02', label: '下个月的', amount: 1000 },
      ]
    )
    expect(st.rows.map((r) => [r.date, r.fee, r.tag])).toEqual([
      ['2026-09-13', 1000, 'trial'],
      ['2026-09-17', 6000, null],
      ['2026-09-27', 6000, 'cancelled'],
    ])
    expect(st).toMatchObject({ month: '2026-09', issuedOn: '2026-10-01', lessons: 3, lessonFee: 13000, fee: 12500 })
    expect(st.items).toEqual([{ date: null, label: '优惠', amount: -500 }])
  })

  it('the parent page itself lists only month and total, newest first', () => {
    const sep = toParentStatement('2026-09', '2026-10-01', [lesson('2026-09-17')], 3000, [])
    const oct = toParentStatement('2026-10', '2026-11-01', [lesson('2026-10-01')], 3000, [])
    const view = toParentView(student, [], [], '2026-11-02', { statements: [sep, oct] })
    expect(view.statements).toEqual([
      { month: '2026-10', fee: 6000 },
      { month: '2026-09', fee: 6000 },
    ])
    expect(toParentView(student, [], [], '2026-11-02').statements).toEqual([])
  })
})

describe('toParentView: extra lesson / leave requests', () => {
  // 2026-10-03 is a Saturday (weekday 5)
  const windows = [{ weekday: 5, start: '10:00', end: '14:00' }]

  it("gives only possible start times; what makes a time busy (other students' lessons, other parents' requests) never appears", () => {
    const view = toParentView(student, [], [], '2026-10-02', {
      booking: {
        windows,
        busy: [{ date: '2026-10-03', start: '12:00', end: '14:00', studentId: SECRET, name: SECRET } as never],
        minutes: 120,
      },
    })
    expect(view.booking).toEqual({
      minutes: 120,
      days: [
        { date: '2026-10-03', starts: ['10:00'] },
        { date: '2026-10-10', starts: ['10:00', '10:30', '11:00', '11:30', '12:00'] },
      ],
    })
    expect(JSON.stringify(view)).not.toContain(SECRET)
  })

  it('no weekly availability set by the tutor → no extra-lesson booking', () => {
    expect(toParentView(student, [], [], '2026-10-02').booking).toBeNull()
    expect(toParentView(student, [], [], '2026-10-02', { booking: { windows: [], busy: [], minutes: 120 } }).booking).toBeNull()
  })

  it('requests: kind, date, time and status only; messages, ids, withdrawn and past requests never appear', () => {
    const req = (kind: string, date: string, start: string, status: string) =>
      ({ id: SECRET, student_id: SECRET, kind, date, start_time: `${start}:00`, end_time: '21:00:00', status, message: SECRET }) as never
    const view = toParentView(student, [], [], '2026-10-02', {
      requests: [
        req('leave', '2026-10-08', '19:00', 'pending'),
        req('add', '2026-10-03', '10:00', 'declined'),
        req('add', '2026-10-04', '10:00', 'withdrawn'),
        req('add', '2026-10-01', '10:00', 'accepted'),
        req('add', '2026-10-03', '09:00', 'accepted'),
      ],
    })
    expect(view.requests).toEqual([
      { kind: 'add', date: '2026-10-03', start: '09:00', end: '21:00', status: 'accepted' },
      { kind: 'add', date: '2026-10-03', start: '10:00', end: '21:00', status: 'declined' },
      { kind: 'leave', date: '2026-10-08', start: '19:00', end: '21:00', status: 'pending' },
    ])
    expect(JSON.stringify(view)).not.toContain(SECRET)
    expect(Object.keys(view.requests[0]).sort()).toEqual(['date', 'end', 'kind', 'start', 'status'])
  })
})

describe('toParentView: grade parts', () => {
  const metric = (id: string, name: string, parent_visible: boolean, parent_id: string | null = null, max_value: number | null = 100) =>
    ({ id, name, unit: '', direction: 1, max_value, parent_visible, parent_id, owner_id: SECRET, student_id: SECRET }) as never
  const rec = (id: string, metric_id: string, date: string, value: number) =>
    ({ id, metric_id, date, value, created_at: `${date}T10:00:00Z`, note: SECRET }) as never

  it("parts go in the whole metric's parts, sorted by name, with date and value only; the whole is shown even before it has records", () => {
    const view = toParentView(student, [], [], '2026-10-02', {
      grades: {
        metrics: [
          metric('t', '適性検査　合計', true, null, 300),
          metric('p2', '適性検査Ⅱ', true, 't'),
          metric('p1', '適性検査Ⅰ', true, 't'),
          metric('p3', '適性検査Ⅲ', true, 't'),
          metric('u', '还没开的整体', false),
          metric('up', '还没开的整体的部分', false, 'u'),
        ],
        records: [rec('a', 'p1', '2026-10-01', 20), rec('b', 'p2', '2026-10-01', 12), rec('c', 'up', '2026-10-01', 5)],
      },
    })
    expect(view.grades).toEqual([
      {
        name: '適性検査　合計', unit: '', maxValue: 300, lowerIsBetter: false, records: [],
        parts: [
          { name: '適性検査Ⅰ', unit: '', maxValue: 100, lowerIsBetter: false, records: [{ date: '2026-10-01', value: 20 }] },
          { name: '適性検査Ⅱ', unit: '', maxValue: 100, lowerIsBetter: false, records: [{ date: '2026-10-01', value: 12 }] },
        ],
      },
    ])
    expect(JSON.stringify(view)).not.toContain(SECRET)
    expect(JSON.stringify(view)).not.toContain('还没开')
  })
})

describe("toParentView: past-paper practice (proctoring on the tutor's side)", () => {
  it('upcoming lessons and lesson records carry only a past-paper-practice flag, never the fee', () => {
    const view = toParentView(
      student,
      [],
      [{ date: '2026-10-11', status: 'done', parent_summary: '做了 2024 年的过去问', proctor: true, proctor_fee: 2000 } as never],
      '2026-10-12',
      {
        schedule: {
          rules: [{ id: 'p', studentId: 's1', weekday: 6, start: '09:00', end: '12:15', startsOn: '2026-10-11', endsOn: null, proctor: true }],
          lessons: [],
        },
      }
    )
    expect(view.lessons).toEqual([{ date: '2026-10-11', summary: '做了 2024 年的过去问', trial: false, proctor: true }])
    expect(view.upcoming[0]).toEqual({ date: '2026-10-18', start: '09:00', end: '12:15', proctor: true, moved: false })
    expect(JSON.stringify(view)).not.toMatch(/fee|2000/)
  })
})

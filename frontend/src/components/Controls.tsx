import { currentMonth, formatMonth, formatMoney, shiftMonth, toNumber } from '../lib/format'

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="month-nav">
      <button
        type="button"
        className="btn"
        onClick={() => onChange(shiftMonth(value, -1))}
        aria-label="Предыдущий месяц"
      >
        ←
      </button>
      <span className="label-month">{formatMonth(value)}</span>
      <button
        type="button"
        className="btn"
        onClick={() => onChange(shiftMonth(value, 1))}
        disabled={value >= currentMonth()}
        aria-label="Следующий месяц"
      >
        →
      </button>
    </div>
  )
}

export function Amount({ value }: { value: string }) {
  const income = toNumber(value) > 0
  return (
    <span className={income ? 'tabular income' : 'tabular'}>
      {formatMoney(value, { sign: income })}
    </span>
  )
}

type PaginationProps = {
  page: number
  pageSize: number
  count: number
  onChange: (page: number) => void
}

export function Pagination({ page, pageSize, count, onChange }: PaginationProps) {
  const pages = Math.ceil(count / pageSize)
  if (pages <= 1) return null
  return (
    <div className="pagination">
      <button type="button" className="btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ←
      </button>
      <span className="tabular">
        {page} из {pages}
      </span>
      <button
        type="button"
        className="btn"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        →
      </button>
    </div>
  )
}

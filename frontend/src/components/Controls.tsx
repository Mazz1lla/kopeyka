import { currentMonth, formatMonth, formatMoney, shiftMonth, toNumber } from '../lib/format'

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="d-flex align-items-center gap-2">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(shiftMonth(value, -1))}
        aria-label="Предыдущий месяц"
      >
        &larr;
      </button>
      <span className="month-title fw-bold">{formatMonth(value)}</span>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(shiftMonth(value, 1))}
        disabled={value >= currentMonth()}
        aria-label="Следующий месяц"
      >
        &rarr;
      </button>
    </div>
  )
}

export function Amount({ value }: { value: string }) {
  const income = toNumber(value) > 0
  return (
    <span className={income ? 'text-success' : undefined}>
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
    <ul className="pagination">
      <li className={page <= 1 ? 'page-item disabled' : 'page-item'}>
        <button type="button" className="page-link" onClick={() => onChange(page - 1)}>
          &laquo;
        </button>
      </li>
      <li className="page-item active">
        <span className="page-link">
          {page} / {pages}
        </span>
      </li>
      <li className={page >= pages ? 'page-item disabled' : 'page-item'}>
        <button type="button" className="page-link" onClick={() => onChange(page + 1)}>
          &raquo;
        </button>
      </li>
    </ul>
  )
}

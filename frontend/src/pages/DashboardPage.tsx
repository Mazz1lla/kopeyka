import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'

import { api, toQuery } from '../api/client'
import { queryKeys } from '../api/queries'
import type { MonthlyPoint, MonthSummary } from '../api/types'
import { MonthPicker } from '../components/Controls'
import { MonthlyChart } from '../components/MonthlyChart'
import { LoadError, Loading } from '../components/States'
import { currentMonth, formatMoney, monthRange, toNumber } from '../lib/format'

function transactionsLink(month: string, extra: Record<string, string | number>) {
  const { from, to } = monthRange(month)
  return `/transactions${toQuery({ date_from: from, date_to: to, ...extra })}`
}

export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const month = params.get('month') ?? currentMonth()

  const summary = useQuery({
    queryKey: [...queryKeys.analytics, 'summary', month],
    queryFn: () => api<MonthSummary>(`/analytics/summary/?month=${month}`),
  })
  const monthly = useQuery({
    queryKey: [...queryKeys.analytics, 'monthly', month],
    queryFn: () => api<MonthlyPoint[]>(`/analytics/monthly/?month=${month}&months=12`),
  })

  const setMonth = (value: string) => setParams(value === currentMonth() ? {} : { month: value })
  const noData =
    summary.data?.transactions_count === 0 &&
    monthly.data?.every((p) => toNumber(p.income) === 0 && toNumber(p.expense) === 0)

  return (
    <>
      <div className="d-flex align-items-center gap-3 mb-4">
        <h1 className="visually-hidden">Месяц</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {summary.isError ? (
        <LoadError error={summary.error} onRetry={() => summary.refetch()} />
      ) : summary.isPending ? (
        <Loading />
      ) : noData ? (
        <div className="alert alert-secondary">
          Операций пока нет. <Link to="/import">Загрузить выписку</Link>
        </div>
      ) : (
        <>
          <Totals summary={summary.data} />
          <CategoriesTable summary={summary.data} month={month} />
          <div className="card">
            <div className="card-header">За год</div>
            <div className="card-body">
            {monthly.isError ? (
              <LoadError error={monthly.error} onRetry={() => monthly.refetch()} />
            ) : monthly.isPending ? (
              <Loading />
            ) : (
              <MonthlyChart data={monthly.data} />
            )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function Totals({ summary }: { summary: MonthSummary }) {
  const net = toNumber(summary.net)
  return (
    <div className="row mb-4">
      <div className="col-6 col-md-3 mb-2">
        <div className="text-muted">Доходы</div>
        <div className="fs-4 text-success">{formatMoney(summary.income)}</div>
      </div>
      <div className="col-6 col-md-3 mb-2">
        <div className="text-muted">Расходы</div>
        <div className="fs-4">{formatMoney(summary.expense)}</div>
      </div>
      <div className="col-6 col-md-3 mb-2">
        <div className="text-muted">{net >= 0 ? 'Остаток' : 'Перерасход'}</div>
        <div className={net >= 0 ? 'fs-4' : 'fs-4 text-danger'}>{formatMoney(Math.abs(net))}</div>
      </div>
    </div>
  )
}

type Row = {
  id: number | null
  name: string
  color: string
  spent: number
  share: number
  limit: number | null
}

function CategoriesTable({ summary, month }: { summary: MonthSummary; month: string }) {
  const limits = new Map(summary.budgets.map((b) => [b.category_id, toNumber(b.limit)]))
  const rows: Row[] = summary.by_category.map((c) => ({
    id: c.category_id,
    name: c.name,
    color: c.color,
    spent: toNumber(c.total),
    share: c.share,
    limit: (c.category_id && limits.get(c.category_id)) ?? null,
  }))
  // категории с бюджетом, по которым в этом месяце ещё ничего не потрачено
  for (const b of summary.budgets) {
    if (!rows.some((row) => row.id === b.category_id)) {
      rows.push({ id: b.category_id, name: b.name, color: b.color, spent: 0, share: 0, limit: toNumber(b.limit) })
    }
  }
  const limitsTotal = summary.budgets.reduce((sum, b) => sum + toNumber(b.limit), 0)

  return (
    <div className="mb-5">
      <div className="d-flex align-items-baseline gap-3 mb-2">
        <h4 className="mb-0">Расходы по категориям</h4>
        <Link to={month === currentMonth() ? '/categories' : `/categories?month=${month}`}>
          бюджеты
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted">Расходов в этом месяце нет.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Категория</th>
                <th className="text-end">Потрачено</th>
                <th className="text-end hide-sm">%</th>
                <th className="text-end">Бюджет</th>
                <th className="text-end">Осталось</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const left = row.limit === null ? null : row.limit - row.spent
                return (
                  <tr key={row.id ?? 'none'}>
                    <td className="text-nowrap">
                      {row.id === null ? (
                        <Link to={transactionsLink(month, { uncategorized: 'true' })}>
                          без категории ({summary.uncategorized_count})
                        </Link>
                      ) : (
                        <Link to={transactionsLink(month, { category: row.id })} className="link-light text-decoration-none">
                          <span className="swatch" style={{ background: row.color }} />
                          {row.name}
                        </Link>
                      )}
                    </td>
                    <td className="text-end text-nowrap">{formatMoney(row.spent)}</td>
                    <td className="text-end text-muted hide-sm">{Math.round(row.share * 100)}</td>
                    <td className="text-end text-nowrap">{row.limit === null ? '' : formatMoney(row.limit)}</td>
                    <td className={left !== null && left < 0 ? 'text-end text-nowrap text-danger' : 'text-end text-nowrap'}>
                      {left === null ? '' : formatMoney(left)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="fw-bold">
                <td>Итого</td>
                <td className="text-end text-nowrap">{formatMoney(summary.expense)}</td>
                <td className="hide-sm" />
                <td className="text-end text-nowrap">{limitsTotal ? formatMoney(limitsTotal) : ''}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

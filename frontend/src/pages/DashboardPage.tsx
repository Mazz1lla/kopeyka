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
      <div className="page-header">
        <h1 className="visually-hidden">Месяц</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {summary.isError ? (
        <LoadError error={summary.error} onRetry={() => summary.refetch()} />
      ) : summary.isPending ? (
        <Loading />
      ) : noData ? (
        <p>
          Операций пока нет. <Link to="/import">Загрузить выписку</Link>
        </p>
      ) : (
        <>
          <Totals summary={summary.data} />
          <CategoriesTable summary={summary.data} month={month} />
          <div className="section">
            <h2>За год</h2>
            {monthly.isError ? (
              <LoadError error={monthly.error} onRetry={() => monthly.refetch()} />
            ) : monthly.isPending ? (
              <Loading />
            ) : (
              <MonthlyChart data={monthly.data} />
            )}
          </div>
        </>
      )}
    </>
  )
}

function Totals({ summary }: { summary: MonthSummary }) {
  const net = toNumber(summary.net)
  return (
    <div className="totals">
      <div>
        <span>Доходы</span>
        <b className="income">{formatMoney(summary.income)}</b>
      </div>
      <div>
        <span>Расходы</span>
        <b>{formatMoney(summary.expense)}</b>
      </div>
      <div>
        <span>{net >= 0 ? 'Остаток' : 'Перерасход'}</span>
        <b className={net >= 0 ? undefined : 'danger-text'}>{formatMoney(Math.abs(net))}</b>
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
    <div className="section">
      <div className="section-head">
        <h2>Расходы по категориям</h2>
        <Link to={month === currentMonth() ? '/categories' : `/categories?month=${month}`} className="small">
          бюджеты
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="muted">Расходов в этом месяце нет.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Категория</th>
                <th className="num">Потрачено</th>
                <th className="num hide-sm">%</th>
                <th className="num">Бюджет</th>
                <th className="num">Осталось</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const left = row.limit === null ? null : row.limit - row.spent
                return (
                  <tr key={row.id ?? 'none'}>
                    <td className="nowrap">
                      {row.id === null ? (
                        <Link to={transactionsLink(month, { uncategorized: 'true' })}>
                          без категории ({summary.uncategorized_count})
                        </Link>
                      ) : (
                        <Link to={transactionsLink(month, { category: row.id })} style={{ color: 'inherit' }}>
                          <span className="swatch" style={{ background: row.color }} />
                          {row.name}
                        </Link>
                      )}
                    </td>
                    <td className="num">{formatMoney(row.spent)}</td>
                    <td className="num muted hide-sm">{Math.round(row.share * 100)}</td>
                    <td className="num">{row.limit === null ? '' : formatMoney(row.limit)}</td>
                    <td className={left !== null && left < 0 ? 'num danger-text' : 'num'}>
                      {left === null ? '' : formatMoney(left)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Итого</td>
                <td className="num">{formatMoney(summary.expense)}</td>
                <td className="hide-sm" />
                <td className="num">{limitsTotal ? formatMoney(limitsTotal) : ''}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

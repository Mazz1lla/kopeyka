import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { api, ApiError, toQuery } from '../api/client'
import { queryKeys, transactionDependentKeys, useAccounts, useCategories } from '../api/queries'
import type { Category, Paginated, Transaction } from '../api/types'
import { CategorySelect } from '../components/Category'
import { Amount, Pagination } from '../components/Controls'
import { ConfirmDialog, Dialog } from '../components/Dialog'
import { LoadError, Loading } from '../components/States'
import { useToast } from '../components/Toast'
import { formatDate, formatMoney, toNumber } from '../lib/format'
import { useDebounced } from '../lib/useDebounced'

const PAGE_SIZE = 50
const FILTER_KEYS = [
  'search',
  'account',
  'category',
  'uncategorized',
  'kind',
  'date_from',
  'date_to',
  'import_batch',
]

export function TransactionsPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const debouncedSearch = useDebounced(search)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Transaction | null>(null)

  const page = Number(params.get('page') ?? 1)
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? '']))
  const hasFilters = FILTER_KEYS.some((key) => params.get(key))

  const updateParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    if ((params.get('search') ?? '') !== debouncedSearch) updateParams({ search: debouncedSearch })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только на ввод в поиске
  }, [debouncedSearch])

  // при смене фильтров снимаем выделение
  const filterKey = FILTER_KEYS.map((key) => params.get(key) ?? '').join('|')
  useEffect(() => setSelected(new Set()), [filterKey])

  const accounts = useAccounts()
  const categories = useCategories()

  const transactions = useQuery({
    queryKey: [...queryKeys.transactions, 'list', filters, page],
    queryFn: () =>
      api<Paginated<Transaction>>(
        `/transactions/${toQuery({ ...filters, page, page_size: PAGE_SIZE })}`,
      ),
    placeholderData: keepPreviousData,
  })

  const invalidate = () =>
    Promise.all(
      transactionDependentKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
    )

  const updateCategory = useMutation({
    mutationFn: ({ id, category }: { id: number; category: number | null }) =>
      api<Transaction>(`/transactions/${id}/`, { method: 'PATCH', body: { category } }),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  })

  const bulkCategorize = useMutation({
    mutationFn: (category: number | null) =>
      api<{ updated: number }>('/transactions/bulk-categorize/', {
        method: 'POST',
        body: { ids: [...selected], category },
      }),
    onSuccess: async (data) => {
      const skipped = selected.size - data.updated
      toast.success(
        `Обновлено: ${data.updated}` +
          (skipped ? `, пропущено ${skipped} (категория не подходит по знаку суммы)` : ''),
      )
      setSelected(new Set())
      await invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/transactions/${id}/`, { method: 'DELETE' }),
    onSuccess: async () => {
      setDeleting(null)
      await invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const rows = transactions.data?.results ?? []
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const togglePage = () =>
    setSelected((current) => {
      const next = new Set(current)
      for (const row of rows) {
        if (allSelected) next.delete(row.id)
        else next.add(row.id)
      }
      return next
    })

  const categoryFilter = filters.uncategorized === 'true' ? 'none' : filters.category

  return (
    <>
      <div className="d-flex align-items-center flex-wrap gap-3 mb-4">
        <h1 className="h3 mb-0">Операции</h1>
        {transactions.data && (
          <span className="text-muted">{transactions.data.count.toLocaleString('ru-RU')}</span>
        )}
        <div className="ms-auto d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            Добавить
          </button>
        </div>
      </div>

      <div className="row g-2 align-items-end mb-3">
        <label className="col-12 col-md-3">
          <span className="form-label d-block">Поиск</span>
          <input
            className="form-control"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="col-6 col-md">
          <span className="form-label d-block">Категория</span>
          <select
            className="form-select"
            value={categoryFilter}
            onChange={(event) => {
              const value = event.target.value
              updateParams({
                category: value && value !== 'none' ? value : null,
                uncategorized: value === 'none' ? 'true' : null,
              })
            }}
          >
            <option value="">все</option>
            <option value="none">без категории</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="col-6 col-md">
          <span className="form-label d-block">Тип</span>
          <select
            className="form-select"
            value={filters.kind}
            onChange={(event) => updateParams({ kind: event.target.value })}
          >
            <option value="">все</option>
            <option value="expense">расходы</option>
            <option value="income">доходы</option>
          </select>
        </label>
        {(accounts.data?.length ?? 0) > 1 && (
          <label className="col-6 col-md">
            <span className="form-label d-block">Счёт</span>
            <select
              className="form-select"
              value={filters.account}
              onChange={(event) => updateParams({ account: event.target.value })}
            >
              <option value="">все</option>
              {accounts.data?.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="col-6 col-md">
          <span className="form-label d-block">С</span>
          <input
            className="form-control"
            type="date"
            value={filters.date_from}
            onChange={(event) => updateParams({ date_from: event.target.value })}
          />
        </label>
        <label className="col-6 col-md">
          <span className="form-label d-block">По</span>
          <input
            className="form-control"
            type="date"
            value={filters.date_to}
            onChange={(event) => updateParams({ date_to: event.target.value })}
          />
        </label>
        {hasFilters && (
          <div className="col-auto">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSearch('')
              setParams({}, { replace: true })
            }}
          >
            Сбросить
          </button>
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          categories={categories.data ?? []}
          pending={bulkCategorize.isPending}
          onApply={(category) => bulkCategorize.mutate(category)}
          onClear={() => setSelected(new Set())}
        />
      )}

      {transactions.isError ? (
        <LoadError error={transactions.error} onRetry={() => transactions.refetch()} />
      ) : transactions.isPending ? (
        <Loading />
      ) : rows.length === 0 ? (
        hasFilters ? (
          <p className="text-muted">Ничего не найдено.</p>
        ) : (
          <p>
            Операций нет. <Link to="/import">Загрузить выписку</Link> или{' '}
            <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => setCreating(true)}>
              добавить вручную
            </button>
          </p>
        )
      ) : (
        <>
          <div className="table-responsive" style={{ opacity: transactions.isPlaceholderData ? 0.6 : 1 }}>
            <table className="table table-hover table-sm align-middle tx-table">
              <thead>
                <tr>
                  <th className="text-nowrap">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={togglePage}
                      aria-label="Выбрать все на странице"
                    />
                  </th>
                  <th className="text-nowrap">Дата</th>
                  <th>Описание</th>
                  <th>Категория</th>
                  <th className="text-end text-nowrap">Сумма</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((tx) => (
                  <tr key={tx.id} className={selected.has(tx.id) ? 'selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(tx.id)}
                        onChange={() => toggle(tx.id)}
                        aria-label={`Выбрать: ${tx.description}`}
                      />
                    </td>
                    <td className="text-nowrap">
                      {formatDate(tx.date)}
                    </td>
                    <td>
                      <div className="desc" title={tx.description}>
                        {tx.description}
                      </div>
                    </td>
                    <td>
                      <CategorySelect
                        categories={categories.data ?? []}
                        value={tx.category}
                        kind={toNumber(tx.amount) > 0 ? 'income' : 'expense'}
                        className="form-select form-select-sm"
                        onChange={(category) => updateCategory.mutate({ id: tx.id, category })}
                        aria-label={`Категория: ${tx.description}`}
                      />
                    </td>
                    <td className="text-end text-nowrap">
                      <Amount value={tx.amount} />
                    </td>
                    <td className="text-end text-nowrap">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => setDeleting(tx)}
                      >
                        удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            count={transactions.data.count}
            onChange={(next) => {
              updateParams({ page: String(next) })
              window.scrollTo({ top: 0 })
            }}
          />
        </>
      )}

      <TransactionDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async () => {
          setCreating(false)
          await invalidate()
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Удалить операцию?"
        message={
          deleting &&
          `${formatDate(deleting.date, true)}, ${deleting.description}, ${formatMoney(deleting.amount)}`
        }
        confirmLabel="Удалить"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}

function BulkBar(props: {
  count: number
  categories: Category[]
  pending: boolean
  onApply: (category: number | null) => void
  onClear: () => void
}) {
  const [category, setCategory] = useState<number | null>(null)
  return (
    <div className="alert alert-info d-flex flex-wrap align-items-center gap-2 py-2">
      <span>Выбрано: {props.count}. Категория:</span>
      <CategorySelect
        className="form-select form-select-sm w-auto"
        categories={props.categories}
        value={category}
        onChange={setCategory}
        emptyLabel="без категории"
        aria-label="Категория для выбранных"
      />
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={props.pending}
        onClick={() => props.onApply(category)}
      >
        Применить
      </button>
      <button type="button" className="btn btn-link p-0 align-baseline" onClick={props.onClear}>
        снять выделение
      </button>
    </div>
  )
}

function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function TransactionDialog(props: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const accounts = useAccounts()
  const categories = useCategories()
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [form, setForm] = useState({ date: today(), amount: '', description: '', account: '' })
  const [category, setCategory] = useState<number | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    if (props.open) {
      setForm((current) => ({
        date: today(),
        amount: '',
        description: '',
        account: current.account || String(accounts.data?.[0]?.id ?? ''),
      }))
      setCategory(null)
      setError(null)
    }
  }, [props.open, accounts.data])

  const create = useMutation({
    mutationFn: () => {
      const amount = Math.abs(Number(form.amount.replace(',', '.')))
      return api<Transaction>('/transactions/', {
        method: 'POST',
        body: {
          account: Number(form.account),
          date: form.date,
          amount: kind === 'expense' ? -amount : amount,
          description: form.description.trim(),
          category,
        },
      })
    },
    onSuccess: props.onCreated,
    onError: (err) => setError(err instanceof ApiError ? err : null),
  })

  const amount = Number(form.amount.replace(',', '.'))
  const amountInvalid = form.amount !== '' && !(amount > 0)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    create.mutate()
  }

  return (
    <Dialog open={props.open} title="Новая операция" onClose={props.onClose}>
      <form onSubmit={onSubmit} noValidate>
        {error && !error.field('amount') && !error.field('description') && (
          <div className="alert alert-danger">{error.message}</div>
        )}
        <div className="row g-3">
          <div className="col-12">
            <div className="d-flex gap-4">
              <label className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  checked={kind === 'expense'}
                  onChange={() => {
                    setKind('expense')
                    setCategory(null)
                  }}
                />
                Расход
              </label>
              <label className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  checked={kind === 'income'}
                  onChange={() => {
                    setKind('income')
                    setCategory(null)
                  }}
                />
                Доход
              </label>
            </div>
          </div>
          <label className="col-md-6">
            <span className="form-label d-block">Сумма</span>
            <input
              className="form-control"
              inputMode="decimal"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              aria-invalid={amountInvalid || Boolean(error?.field('amount'))}
              autoFocus
            />
            {(amountInvalid || error?.field('amount')) && (
              <span className="invalid-feedback d-block">{error?.field('amount') ?? 'Нужно число больше нуля'}</span>
            )}
          </label>
          <label className="col-md-6">
            <span className="form-label d-block">Дата</span>
            <input
              className="form-control"
              type="date"
              value={form.date}
              max={today()}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
          </label>
          <label className="col-12">
            <span className="form-label d-block">Описание</span>
            <input
              className="form-control"
              value={form.description}
              maxLength={255}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              aria-invalid={Boolean(error?.field('description'))}
            />
            {error?.field('description') && (
              <span className="invalid-feedback d-block">{error.field('description')}</span>
            )}
          </label>
          <label className="col-md-6">
            <span className="form-label d-block">Категория</span>
            <CategorySelect
              categories={categories.data ?? []}
              value={category}
              onChange={setCategory}
              kind={kind}
            />
          </label>
          <label className="col-md-6">
            <span className="form-label d-block">Счёт</span>
            <select
              className="form-select"
              value={form.account}
              onChange={(event) => setForm({ ...form, account: event.target.value })}
            >
              {accounts.data?.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-4">
          <button type="button" className="btn btn-secondary" onClick={props.onClose}>
            Отмена
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              create.isPending ||
              !(amount > 0) ||
              !form.description.trim() ||
              !form.date ||
              !form.account
            }
          >
            Добавить
          </button>
        </div>
      </form>
    </Dialog>
  )
}

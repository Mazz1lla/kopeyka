import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import { api, ApiError } from '../api/client'
import { queryKeys, transactionDependentKeys, useCategories } from '../api/queries'
import type { Budget, Category, CategoryKind } from '../api/types'
import { CategoryName, CategorySelect } from '../components/Category'
import { MonthPicker } from '../components/Controls'
import { ConfirmDialog, Dialog } from '../components/Dialog'
import { LoadError, Loading } from '../components/States'
import { useToast } from '../components/Toast'
import { currentMonth, shiftMonth } from '../lib/format'

const COLORS = [
  '#2e8b57', '#3a9d9b', '#3b7dd8', '#5b5fc7', '#8e5bc7', '#c2508f',
  '#d0453b', '#e07b2e', '#d4a72c', '#7a8b3c', '#8a6d5a', '#7d8590',
]

export function CategoriesPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const categories = useCategories()
  const [editing, setEditing] = useState<Category | CategoryKind | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/categories/${id}/`, { method: 'DELETE' }),
    onSuccess: async () => {
      setDeleting(null)
      await Promise.all(
        [...transactionDependentKeys, queryKeys.rules, queryKeys.budgets].map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      )
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <>
      <div className="d-flex align-items-center flex-wrap gap-3 mb-4">
        <h1 className="h3 mb-0">Категории</h1>
      </div>

      <div className="row g-4">
        <div className="col-lg-6">
          {categories.isError ? (
            <LoadError error={categories.error} onRetry={() => categories.refetch()} />
          ) : categories.isPending ? (
            <Loading />
          ) : (
            (['expense', 'income'] as const).map((kind) => (
              <div key={kind} className="mb-4">
                <div className="d-flex align-items-center mb-2">
                  <h4 className="mb-0">{kind === 'expense' ? 'Расходы' : 'Доходы'}</h4>
                  <button type="button" className="btn btn-sm btn-success ms-auto" onClick={() => setEditing(kind)}>
                    Добавить
                  </button>
                </div>
                <ul className="list-group">
                  {categories.data
                    .filter((category) => category.kind === kind)
                    .map((category) => (
                      <li key={category.id} className="list-group-item d-flex align-items-center gap-2">
                        <CategoryName category={category} />
                        {category.transactions_count > 0 && (
                          <span className="badge bg-secondary rounded-pill" title="Операций">
                            {category.transactions_count}
                          </span>
                        )}
                        <span className="ms-auto text-nowrap">
                          <button type="button" className="btn btn-sm btn-secondary me-2" onClick={() => setEditing(category)}>
                            Изменить
                          </button>
                          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setDeleting(category)}>
                            Удалить
                          </button>
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="col-lg-6">
          <Budgets categories={categories.data ?? []} />
        </div>
      </div>

      <CategoryDialog
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null)
          await Promise.all(
            transactionDependentKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
          )
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Удалить «${deleting?.name ?? ''}»?`}
        message={
          deleting &&
          (deleting.transactions_count > 0
            ? `Операции (${deleting.transactions_count}) останутся без категории. Правила и бюджеты этой категории удалятся.`
            : 'Правила и бюджеты этой категории удалятся.')
        }
        confirmLabel="Удалить"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}

function CategoryDialog(props: {
  value: Category | CategoryKind | null
  onClose: () => void
  onSaved: () => void
}) {
  const isNew = typeof props.value === 'string'
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0] as string)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    if (props.value === null) return
    setError(null)
    if (typeof props.value === 'string') {
      setName('')
      setColor(COLORS[Math.floor(Math.random() * COLORS.length)] as string)
    } else {
      setName(props.value.name)
      setColor(props.value.color)
    }
  }, [props.value])

  const save = useMutation({
    mutationFn: () => {
      const value = props.value
      if (typeof value === 'string') {
        return api<Category>('/categories/', {
          method: 'POST',
          body: { name: name.trim(), color, kind: value },
        })
      }
      return api<Category>(`/categories/${value?.id}/`, {
        method: 'PATCH',
        body: { name: name.trim(), color },
      })
    },
    onSuccess: props.onSaved,
    onError: (err) => setError(err instanceof ApiError ? err : null),
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    save.mutate()
  }

  return (
    <Dialog open={props.value !== null} title={isNew ? 'Новая категория' : 'Категория'} onClose={props.onClose} width={400}>
      <form onSubmit={onSubmit} noValidate>
        <label className="d-block mb-3">
          <span className="form-label d-block">Название</span>
          <input
            className="form-control"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(error?.field('name'))}
            autoFocus
          />
          {error && <span className="invalid-feedback d-block">{error.field('name') ?? error.message}</span>}
        </label>
        <div>
          <span className="form-label d-block">Цвет</span>
          <div className="d-flex flex-wrap gap-2">
            {COLORS.map((value) => (
              <button
                key={value}
                type="button"
                className={value === color ? 'color-btn rounded active' : 'color-btn rounded'}
                style={{ background: value }}
                onClick={() => setColor(value)}
                aria-label={value}
                aria-pressed={value === color}
              />
            ))}
          </div>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-4">
          <button type="button" className="btn btn-secondary" onClick={props.onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || save.isPending}>
            Сохранить
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function Budgets({ categories }: { categories: Category[] }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const month = params.get('month') ?? currentMonth()
  const [newCategory, setNewCategory] = useState<number | null>(null)
  const [newLimit, setNewLimit] = useState('')

  const fetchBudgets = (value: string) => api<Budget[]>(`/budgets/?month=${value}-01`)
  const budgets = useQuery({
    queryKey: [...queryKeys.budgets, month],
    queryFn: () => fetchBudgets(month),
  })
  // если месяц пустой, предлагаем скопировать прошлый
  const previous = useQuery({
    queryKey: [...queryKeys.budgets, shiftMonth(month, -1)],
    queryFn: () => fetchBudgets(shiftMonth(month, -1)),
    enabled: budgets.data?.length === 0,
  })

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const used = new Set(budgets.data?.map((budget) => budget.category))
  const available = categories.filter((c) => c.kind === 'expense' && !used.has(c.id))

  const invalidate = () =>
    Promise.all(
      [queryKeys.budgets, queryKeys.analytics].map((key) =>
        queryClient.invalidateQueries({ queryKey: key }),
      ),
    )

  const create = useMutation({
    mutationFn: (items: { category: number; limit: string }[]) =>
      Promise.all(
        items.map((item) => api<Budget>('/budgets/', { method: 'POST', body: { ...item, month } })),
      ),
    onSuccess: async () => {
      setNewCategory(null)
      setNewLimit('')
      await invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const update = useMutation({
    mutationFn: ({ id, limit }: { id: number; limit: string }) =>
      api<Budget>(`/budgets/${id}/`, { method: 'PATCH', body: { limit } }),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/budgets/${id}/`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  })

  const limitValid = Number(newLimit.replace(',', '.')) >= 1

  return (
    <div>
      <div className="d-flex align-items-center flex-wrap gap-3 mb-2">
        <h4 className="mb-0">Бюджеты</h4>
        <MonthPicker
          value={month}
          onChange={(value) => setParams(value === currentMonth() ? {} : { month: value })}
        />
      </div>

      {budgets.isError ? (
        <LoadError error={budgets.error} onRetry={() => budgets.refetch()} />
      ) : budgets.isPending ? (
        <Loading />
      ) : (
        <>
          {budgets.data.length === 0 ? (
            <p className="text-muted">
              На этот месяц бюджетов нет.
              {previous.data && previous.data.length > 0 && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="btn btn-link p-0 align-baseline"
                    disabled={create.isPending}
                    onClick={() =>
                      create.mutate(
                        previous.data.map((budget) => ({ category: budget.category, limit: budget.limit })),
                      )
                    }
                  >
                    Скопировать с прошлого месяца
                  </button>
                </>
              )}
            </p>
          ) : (
            <ul className="list-group">
              {budgets.data.map((budget) => (
                <BudgetRow
                  key={budget.id}
                  budget={budget}
                  category={byId.get(budget.category)}
                  onSave={(limit) => update.mutate({ id: budget.id, limit })}
                  onDelete={() => remove.mutate(budget.id)}
                />
              ))}
            </ul>
          )}

          {available.length > 0 && (
            <form
              className="d-flex flex-wrap gap-2 mt-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (newCategory && limitValid)
                  create.mutate([{ category: newCategory, limit: newLimit.replace(',', '.') }])
              }}
            >
              <CategorySelect
                className="form-select w-auto"
                categories={available}
                value={newCategory}
                onChange={setNewCategory}
                kind="expense"
                emptyLabel="категория…"
                aria-label="Категория"
              />
              <input
                className="form-control"
                style={{ width: 130 }}
                inputMode="decimal"
                value={newLimit}
                onChange={(event) => setNewLimit(event.target.value)}
                placeholder="лимит"
                aria-label="Лимит"
              />
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={!newCategory || !limitValid || create.isPending}
              >
                Добавить
              </button>
            </form>
          )}
        </>
      )}
    </div>
  )
}

function BudgetRow(props: {
  budget: Budget
  category: Category | undefined
  onSave: (limit: string) => void
  onDelete: () => void
}) {
  const [value, setValue] = useState(String(Number(props.budget.limit)))
  useEffect(() => setValue(String(Number(props.budget.limit))), [props.budget.limit])
  const changed = Number(value.replace(',', '.')) !== Number(props.budget.limit)
  const valid = Number(value.replace(',', '.')) >= 1

  return (
    <li className="list-group-item d-flex align-items-center gap-2">
      <CategoryName category={props.category ?? null} />
      <form
        className="ms-auto d-flex align-items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (changed && valid) props.onSave(value.replace(',', '.'))
        }}
      >
        {changed && (
          <button type="submit" className="btn btn-sm btn-primary" disabled={!valid}>
            Сохранить
          </button>
        )}
        <input
          className="form-control form-control-sm text-end"
          style={{ width: 110 }}
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={`Лимит: ${props.category?.name ?? ''}`}
        />
        <button type="button" className="btn btn-sm btn-outline-danger" onClick={props.onDelete}>
          Удалить
        </button>
      </form>
    </li>
  )
}

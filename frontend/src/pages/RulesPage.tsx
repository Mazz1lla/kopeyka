import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

import { api, ApiError } from '../api/client'
import { queryKeys, transactionDependentKeys, useCategories } from '../api/queries'
import type { ApplyRulesResult, MatchType, Rule, RuleDraft, RuleTestResult } from '../api/types'
import { CategoryName, CategorySelect } from '../components/Category'
import { Amount } from '../components/Controls'
import { ConfirmDialog, Dialog } from '../components/Dialog'
import { LoadError, Loading } from '../components/States'
import { useToast } from '../components/Toast'
import { formatDate, formatMoney } from '../lib/format'
import { useDebounced } from '../lib/useDebounced'

const MATCH_LABELS: Record<MatchType, string> = {
  contains: 'содержит',
  starts_with: 'начинается с',
  regex: 'regex',
}

function describeAmount(rule: Pick<Rule, 'amount_min' | 'amount_max'>) {
  if (rule.amount_min && rule.amount_max)
    return `от ${formatMoney(rule.amount_min)} до ${formatMoney(rule.amount_max)}`
  if (rule.amount_min) return `от ${formatMoney(rule.amount_min)}`
  if (rule.amount_max) return `до ${formatMoney(rule.amount_max)}`
  return null
}

export function RulesPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const categories = useCategories()
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Rule | null>(null)
  const [applying, setApplying] = useState(false)

  const rules = useQuery({ queryKey: queryKeys.rules, queryFn: () => api<Rule[]>('/rules/') })
  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category])),
    [categories.data],
  )

  const toggle = useMutation({
    mutationFn: (rule: Rule) =>
      api<Rule>(`/rules/${rule.id}/`, { method: 'PATCH', body: { is_active: !rule.is_active } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rules }),
    onError: (error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/rules/${id}/`, { method: 'DELETE' }),
    onSuccess: async () => {
      setDeleting(null)
      await queryClient.invalidateQueries({ queryKey: queryKeys.rules })
    },
    onError: (error) => toast.error(error.message),
  })

  const hasActive = rules.data?.some((rule) => rule.is_active)

  return (
    <>
      <div className="page-header">
        <h1>Правила</h1>
        <div className="actions">
          <button type="button" className="btn" onClick={() => setApplying(true)} disabled={!hasActive}>
            Применить ко всем операциям
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            Добавить
          </button>
        </div>
      </div>

      {rules.isError ? (
        <LoadError error={rules.error} onRetry={() => rules.refetch()} />
      ) : rules.isPending ? (
        <Loading />
      ) : rules.data.length === 0 ? (
        <p className="muted">Правил нет.</p>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Проверяются по порядку, срабатывает первое подходящее.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="num shrink">#</th>
                  <th>Описание</th>
                  <th>Категория</th>
                  <th className="shrink">Вкл.</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {rules.data.map((rule) => {
                  const amount = describeAmount(rule)
                  return (
                    <tr key={rule.id} className={rule.is_active ? undefined : 'off'}>
                      <td className="num">{rule.priority}</td>
                      <td>
                        {MATCH_LABELS[rule.match_type]} <code>{rule.pattern}</code>
                        {amount && <span className="muted">, сумма {amount}</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <CategoryName category={categoryById.get(rule.category) ?? null} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={rule.is_active}
                          onChange={() => toggle.mutate(rule)}
                          aria-label={`Правило «${rule.pattern}» включено`}
                        />
                      </td>
                      <td className="actions">
                        <button type="button" className="link-btn" onClick={() => setEditing(rule)}>
                          изменить
                        </button>
                        <button type="button" className="link-btn danger" onClick={() => setDeleting(rule)}>
                          удалить
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <RuleDialog
        rule={editing}
        nextPriority={Math.max(0, ...(rules.data ?? []).map((rule) => rule.priority)) + 10}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null)
          await queryClient.invalidateQueries({ queryKey: queryKeys.rules })
        }}
      />

      <ApplyDialog open={applying} onClose={() => setApplying(false)} />

      <ConfirmDialog
        open={deleting !== null}
        title="Удалить правило?"
        message={deleting && <>«{deleting.pattern}». Уже разложенные операции останутся как есть.</>}
        confirmLabel="Удалить"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}

const EMPTY_DRAFT: RuleDraft = {
  category: 0,
  match_type: 'contains',
  pattern: '',
  amount_min: null,
  amount_max: null,
  priority: 100,
}

function RuleDialog(props: {
  rule: Rule | 'new' | null
  nextPriority: number
  onClose: () => void
  onSaved: () => void
}) {
  const categories = useCategories()
  const isNew = props.rule === 'new'
  const [draft, setDraft] = useState<RuleDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    if (props.rule === null) return
    setError(null)
    setDraft(
      props.rule === 'new'
        ? { ...EMPTY_DRAFT, priority: props.nextPriority }
        : {
            category: props.rule.category,
            match_type: props.rule.match_type,
            pattern: props.rule.pattern,
            amount_min: props.rule.amount_min,
            amount_max: props.rule.amount_max,
            priority: props.rule.priority,
          },
    )
    // nextPriority меняется после сохранения, форму из-за этого сбрасывать не надо
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.rule])

  // пока пользователь печатает, показываем, какие операции подойдут
  const testInput = useDebounced(draft, 400)
  const canTest = Boolean(testInput.category && testInput.pattern.trim())
  const test = useQuery({
    queryKey: ['rule-test', testInput],
    queryFn: ({ signal }) =>
      api<RuleTestResult>('/rules/test/', {
        method: 'POST',
        body: { ...testInput, amount_min: testInput.amount_min || null, amount_max: testInput.amount_max || null },
        signal,
      }),
    enabled: props.rule !== null && canTest,
    retry: false,
  })

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...draft,
        pattern: draft.pattern.trim(),
        amount_min: draft.amount_min || null,
        amount_max: draft.amount_max || null,
      }
      return props.rule === 'new' || props.rule === null
        ? api<Rule>('/rules/', { method: 'POST', body })
        : api<Rule>(`/rules/${props.rule.id}/`, { method: 'PATCH', body })
    },
    onSuccess: () => props.onSaved(),
    onError: (err) => setError(err instanceof ApiError ? err : null),
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    save.mutate()
  }

  const testError = test.error instanceof ApiError ? test.error.field('pattern') : undefined
  const patternError = error?.field('pattern') ?? testError

  return (
    <Dialog
      open={props.rule !== null}
      title={isNew ? 'Новое правило' : 'Правило'}
      onClose={props.onClose}
      width={600}
    >
      <form onSubmit={onSubmit} noValidate>
        {error && !error.field('pattern') && !error.field('amount_max') && (
          <div className="error-box">{error.message}</div>
        )}
        <div className="form-grid">
          <label className="field">
            <span>Описание</span>
            <select
              className="select"
              value={draft.match_type}
              onChange={(event) => setDraft({ ...draft, match_type: event.target.value as MatchType })}
            >
              {Object.entries(MATCH_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Текст</span>
            <input
              className="input"
              value={draft.pattern}
              maxLength={200}
              onChange={(event) => setDraft({ ...draft, pattern: event.target.value })}
              placeholder={draft.match_type === 'regex' ? 'такси|uber' : 'пятерочка'}
              aria-invalid={Boolean(patternError)}
              autoFocus
            />
            {patternError && <span className="field-error">{patternError}</span>}
          </label>
          <label className="field full">
            <span>Категория</span>
            <CategorySelect
              categories={categories.data ?? []}
              value={draft.category || null}
              onChange={(value) => setDraft({ ...draft, category: value ?? 0 })}
            />
          </label>
          <label className="field">
            <span>Сумма от</span>
            <input
              className="input tabular"
              inputMode="decimal"
              value={draft.amount_min ?? ''}
              onChange={(event) => setDraft({ ...draft, amount_min: event.target.value || null })}
            />
          </label>
          <label className="field">
            <span>Сумма до</span>
            <input
              className="input tabular"
              inputMode="decimal"
              value={draft.amount_max ?? ''}
              onChange={(event) => setDraft({ ...draft, amount_max: event.target.value || null })}
              aria-invalid={Boolean(error?.field('amount_max'))}
            />
            {error?.field('amount_max') && <span className="field-error">{error.field('amount_max')}</span>}
          </label>
          <label className="field">
            <span>Порядок</span>
            <input
              className="input tabular"
              type="number"
              min={0}
              value={draft.priority}
              onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })}
            />
          </label>
        </div>

        {canTest && (
          <div className="preview" aria-live="polite">
            {test.isFetching && !test.data ? (
              <span className="muted">Поиск…</span>
            ) : test.data && !testError ? (
              <>
                Подходит операций: <b>{test.data.matched}</b>
                {test.data.already_in_category > 0 && (
                  <span className="muted"> (уже в этой категории: {test.data.already_in_category})</span>
                )}
                {test.data.sample.length > 0 && (
                  <table className="table">
                    <tbody>
                      {test.data.sample.slice(0, 5).map((item) => (
                        <tr key={item.id}>
                          <td className="shrink tabular">{formatDate(item.date)}</td>
                          <td>
                            <div className="desc" style={{ maxWidth: 330 }}>
                              {item.description}
                            </div>
                          </td>
                          <td className="num">
                            <Amount value={item.amount} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : null}
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn" onClick={props.onClose}>
            Отмена
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={save.isPending || !draft.pattern.trim() || !draft.category}
          >
            Сохранить
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function ApplyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const categories = useCategories()
  const [overwriteManual, setOverwriteManual] = useState(false)

  useEffect(() => {
    if (open) setOverwriteManual(false)
  }, [open])

  // сначала dry-run, чтобы показать, что поменяется
  const preview = useQuery({
    queryKey: ['rules-apply-preview', overwriteManual],
    queryFn: () =>
      api<ApplyRulesResult>('/rules/apply/', {
        method: 'POST',
        body: { dry_run: true, overwrite_manual: overwriteManual },
      }),
    enabled: open,
    gcTime: 0,
  })

  const apply = useMutation({
    mutationFn: () =>
      api<ApplyRulesResult>('/rules/apply/', {
        method: 'POST',
        body: { dry_run: false, overwrite_manual: overwriteManual },
      }),
    onSuccess: async (result) => {
      toast.success(`Обновлено операций: ${result.changed}`)
      onClose()
      await Promise.all(
        transactionDependentKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
      )
    },
    onError: (error) => toast.error(error.message),
  })

  const byId = new Map((categories.data ?? []).map((category) => [category.id, category]))
  const data = preview.data

  return (
    <Dialog open={open} title="Применить правила" onClose={onClose} width={480}>
      {preview.isError ? (
        <LoadError error={preview.error} onRetry={() => preview.refetch()} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            {data.changed === 0
              ? 'Менять нечего.'
              : `Категория поменяется у ${data.changed} из ${data.checked.toLocaleString('ru-RU')} операций.`}
          </p>
          {data.by_category.length > 0 && (
            <table className="table">
              <tbody>
                {data.by_category.slice(0, 8).map((item) => (
                  <tr key={item.category_id}>
                    <td>
                      <CategoryName category={byId.get(item.category_id) ?? null} />
                    </td>
                    <td className="num">{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(data.skipped_manual > 0 || overwriteManual) && (
            <label className="checkbox" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                checked={overwriteManual}
                onChange={(event) => setOverwriteManual(event.target.checked)}
              />
              перезаписать категории, выставленные вручную
              {data.skipped_manual > 0 && ` (${data.skipped_manual})`}
            </label>
          )}
        </>
      )}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onClose}>
          {data?.changed === 0 ? 'Закрыть' : 'Отмена'}
        </button>
        {data?.changed !== 0 && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!data || apply.isPending || preview.isFetching}
            onClick={() => apply.mutate()}
          >
            Применить
          </button>
        )}
      </div>
    </Dialog>
  )
}

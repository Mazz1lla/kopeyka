import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { api, ApiError } from '../api/client'
import { queryKeys, transactionDependentKeys, useAccounts } from '../api/queries'
import type { ImportBatch, Paginated } from '../api/types'
import { LoadError, Loading } from '../components/States'
import { formatDate } from '../lib/format'

const MAX_SIZE = 5 * 1024 * 1024

export function ImportPage() {
  const queryClient = useQueryClient()
  const accounts = useAccounts()
  const inputRef = useRef<HTMLInputElement>(null)
  const [account, setAccount] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<ImportBatch | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!account && accounts.data?.[0]) setAccount(String(accounts.data[0].id))
  }, [account, accounts.data])

  const history = useQuery({
    queryKey: queryKeys.imports,
    queryFn: () => api<Paginated<ImportBatch>>('/imports/?page_size=10'),
  })

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.append('account', account)
      form.append('file', file as File)
      return api<ImportBatch>('/imports/', { method: 'POST', form })
    },
    onSuccess: async (batch) => {
      setResult(batch)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      await Promise.all(
        [...transactionDependentKeys, queryKeys.imports].map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      )
    },
    onError: (err) => setError(err instanceof ApiError ? (err.field('file') ?? err.message) : String(err)),
  })

  function pick(selected: File | undefined) {
    setResult(null)
    setError(null)
    if (!selected) return
    if (selected.size > MAX_SIZE) {
      setError('Файл больше 5 МБ')
      return
    }
    setFile(selected)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragOver(false)
    pick(event.dataTransfer.files[0])
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    upload.mutate()
  }

  return (
    <>
      <div className="d-flex align-items-center flex-wrap gap-3 mb-4">
        <h1 className="h3 mb-0">Импорт выписки</h1>
      </div>

      <form className="mb-4" style={{ maxWidth: 600 }} onSubmit={onSubmit}>
        <label className="d-block mb-3" style={{ maxWidth: 300 }}>
          <span>Счёт</span>
          <select className="form-select" value={account} onChange={(e) => setAccount(e.target.value)}>
            {accounts.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <div
          className={dragOver ? 'dropzone rounded mb-3 active' : 'dropzone rounded mb-3'}
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {file ? (
            <>
              <b>{file.name}</b> <span className="text-muted">{Math.ceil(file.size / 1024)} КБ</span>{' '}
              <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => inputRef.current?.click()}>
                другой файл
              </button>
            </>
          ) : (
            <>
              Перетащите CSV сюда или{' '}
              <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => inputRef.current?.click()}>
                выберите файл
              </button>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,text/csv"
            className="visually-hidden"
            onChange={(event) => pick(event.target.files?.[0])}
            tabIndex={-1}
          />
        </div>

        <details className="mb-3">
          <summary>Формат файла</summary>
          <p className="text-muted small mt-2">
            Нужны колонки «Дата операции», «Сумма» и «Описание» (или Date, Amount, Description).
            Разделитель «;» или «,», кодировка UTF-8 или Windows-1251. Пример лежит в репозитории:{' '}
            <code>samples/statement_example.csv</code>
          </p>
        </details>

        {error && <div className="alert alert-danger">{error}</div>}

        <div>
          <button type="submit" className="btn btn-primary" disabled={!file || !account || upload.isPending}>
            {upload.isPending ? 'Загрузка…' : 'Загрузить'}
          </button>
        </div>
      </form>

      {result && <ImportResult batch={result} />}

      <div>
        <h4>Загрузки</h4>
        {history.isError ? (
          <LoadError error={history.error} onRetry={() => history.refetch()} />
        ) : history.isPending ? (
          <Loading />
        ) : history.data.results.length === 0 ? (
          <p className="text-muted">Пока ничего не загружали.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Файл</th>
                  <th>Счёт</th>
                  <th className="text-end text-nowrap">Новых</th>
                  <th className="text-end text-nowrap">Повторов</th>
                  <th className="text-end text-nowrap">Ошибок</th>
                  <th className="text-nowrap">Дата</th>
                </tr>
              </thead>
              <tbody>
                {history.data.results.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <Link className="desc d-block" to={`/transactions?import_batch=${batch.id}`} title={batch.filename}>
                        {batch.filename}
                      </Link>
                    </td>
                    <td>{batch.account_name}</td>
                    <td className="text-end text-nowrap">{batch.rows_created}</td>
                    <td className="text-end text-nowrap">{batch.rows_duplicates}</td>
                    <td className="text-end text-nowrap">{batch.errors.length || ''}</td>
                    <td className="text-nowrap">
                      {formatDate(batch.created_at, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

function ImportResult({ batch }: { batch: ImportBatch }) {
  const uncategorized = batch.rows_created - batch.rows_categorized
  return (
    <div className="alert alert-secondary" style={{ maxWidth: 600 }} aria-live="polite">
      <b>{batch.rows_created > 0 ? `Добавлено операций: ${batch.rows_created}` : 'Новых операций нет'}</b>
      <ul className="mb-0 mt-2">
        <li>строк в файле: {batch.rows_total}</li>
        {batch.rows_duplicates > 0 && <li>уже были загружены: {batch.rows_duplicates}</li>}
        {batch.rows_skipped > 0 && <li>пропущено со статусом FAILED: {batch.rows_skipped}</li>}
        {batch.rows_created > 0 && (
          <li>
            разложено по правилам: {batch.rows_categorized}
            {uncategorized > 0 && (
              <>
                , без категории:{' '}
                <Link to={`/transactions?import_batch=${batch.id}&uncategorized=true`}>
                  {uncategorized}
                </Link>
              </>
            )}
          </li>
        )}
      </ul>
      {batch.errors.length > 0 && (
        <div className="text-danger mt-2">
          Не прочитались строки:
          <ul>
            {batch.errors.slice(0, 10).map((item) => (
              <li key={item.line}>
                {item.line}: {item.message}
              </li>
            ))}
          </ul>
          {batch.errors.length > 10 && <div>и ещё {batch.errors.length - 10}</div>}
        </div>
      )}
    </div>
  )
}

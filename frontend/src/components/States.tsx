import { ApiError } from '../api/client'

export function Loading() {
  return (
    <div className="text-muted my-3">
      <span className="spinner-border spinner-border-sm me-2" /> Загрузка…
    </div>
  )
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Не удалось загрузить данные'
  return (
    <div className="alert alert-danger d-flex align-items-center gap-3" role="alert">
      {message}
      {onRetry && (
        <button type="button" className="btn btn-sm btn-outline-light" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  )
}

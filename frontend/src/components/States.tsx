import { ApiError } from '../api/client'

export function Loading() {
  return <p className="muted">Загрузка…</p>
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Не удалось загрузить данные'
  return (
    <p className="danger-text" role="alert">
      {message}.{' '}
      {onRetry && (
        <button type="button" className="link-btn" onClick={onRetry}>
          Повторить
        </button>
      )}
    </p>
  )
}

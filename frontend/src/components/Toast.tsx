import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Toast = { id: number; text: string; error?: boolean }
type ToastApi = { success: (text: string) => void; error: (text: string) => void }

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current.slice(-2), { id, text, error }])
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      error ? 6000 : 3500,
    )
  }, [])

  const value = useMemo<ToastApi>(
    () => ({ success: (text) => push(text), error: (text) => push(text, true) }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container position-fixed bottom-0 start-0 p-3" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={toast.error ? 'toast show text-bg-danger' : 'toast show text-bg-success'}>
            <div className="toast-body">{toast.text}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}

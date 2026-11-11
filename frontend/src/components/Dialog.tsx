import { useEffect, useRef, type ReactNode } from 'react'

type DialogProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
}

export function Dialog({ open, title, onClose, children, width }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="dialog"
      style={width ? { width: `min(${width}px, calc(100vw - 24px))` } : undefined}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // клик по затемнению вокруг окна
        if (event.target === ref.current) onClose()
      }}
      aria-labelledby="dialog-title"
    >
      {open && (
        <>
          <div className="dialog-header">
            <h2 id="dialog-title">{title}</h2>
            <button type="button" className="dialog-close" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
          <div className="dialog-body">{children}</div>
        </>
      )}
    </dialog>
  )
}

type ConfirmProps = {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel: string
  pending?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog(props: ConfirmProps) {
  return (
    <Dialog open={props.open} title={props.title} onClose={props.onClose} width={420}>
      {props.message && <div>{props.message}</div>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={props.onClose}>
          Отмена
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={props.onConfirm}
          disabled={props.pending}
        >
          {props.confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}

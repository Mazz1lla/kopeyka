import { useEffect, useRef, type ReactNode } from 'react'

type DialogProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}

// нативный <dialog>, чтобы не тащить bootstrap.js ради модалок
export function Dialog({ open, title, onClose, children, footer, width }: DialogProps) {
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
      className="modal-native"
      style={width ? { width: `min(${width}px, calc(100vw - 24px))` } : undefined}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      aria-labelledby="dialog-title"
    >
      {open && (
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="dialog-title">
              {title}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Закрыть" />
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </div>
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
    <Dialog
      open={props.open}
      title={props.title}
      onClose={props.onClose}
      width={420}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={props.onClose}>
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
        </>
      }
    >
      {props.message}
    </Dialog>
  )
}

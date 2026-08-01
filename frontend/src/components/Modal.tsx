import { useCallback, useEffect, useRef, type ReactNode } from 'react'

const CLOSE_MS = 200

type Props = {
  onClose: () => void
  label: string
  className?: string
  children: ReactNode | ((close: () => void) => ReactNode)
}

export function Modal({ onClose, label, className = '', children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const closingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const requestClose = useCallback(() => {
    const el = ref.current
    if (closingRef.current) return
    closingRef.current = true

    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      if (timerRef.current != null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      onCloseRef.current()
    }

    if (!el || !el.open) {
      finish()
      return
    }

    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== 'opacity') return
      el.removeEventListener('transitionend', onEnd)
      finish()
    }
    el.addEventListener('transitionend', onEnd)
    timerRef.current = setTimeout(() => {
      el.removeEventListener('transitionend', onEnd)
      finish()
    }, CLOSE_MS + 50)

    el.close()
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!el.open) el.showModal()

    function onCancel(e: Event) {
      e.preventDefault()
      requestClose()
    }
    function onClick(e: MouseEvent) {
      if (e.target === el) requestClose()
    }
    el.addEventListener('cancel', onCancel)
    el.addEventListener('click', onClick)
    return () => {
      el.removeEventListener('cancel', onCancel)
      el.removeEventListener('click', onClick)
      if (timerRef.current != null) clearTimeout(timerRef.current)
    }
  }, [requestClose])

  const content =
    typeof children === 'function' ? children(requestClose) : children

  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={`m-auto w-full max-h-[90vh] overflow-auto rounded-2xl border border-line bg-card text-ink shadow-xl p-0 opacity-0 open:opacity-100 starting:open:opacity-0 transition-all transition-discrete duration-200 ease-out backdrop:bg-backdrop/70 backdrop:opacity-0 open:backdrop:opacity-100 starting:open:backdrop:opacity-0 backdrop:transition-opacity backdrop:transition-discrete backdrop:duration-200 ${className}`}
    >
      {content}
    </dialog>
  )
}

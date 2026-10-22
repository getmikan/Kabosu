import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import type { Toast } from '../hooks/useToasts'
import { Button, IconButton } from '../ui/M3'

type Props = {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

/**
 * Stacked snackbars in the bottom-right corner, so they don't cover the
 * primary content. The most recent one sits closest to the edge.
 */
export function ToastHub({ toasts, onDismiss }: Props) {
  const { t } = useTranslation()
  return (
    <div className="toastHub" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            className={`toast toast-${toast.kind}`}
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 48, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 460, damping: 30 }}
          >
            <span className="toastMsg">{toast.message}</span>
            {toast.actionLabel ? (
              <Button
                variant="text"
                onClick={() => {
                  toast.onAction?.()
                  onDismiss(toast.id)
                }}
              >
                {toast.actionLabel}
              </Button>
            ) : null}
            <IconButton
              icon="close"
              label={t('common.dismiss')}
              onClick={() => onDismiss(toast.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

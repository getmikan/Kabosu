import { useEffect } from 'react'

// Existing dialogs retain their own open/close handlers. This supplies the
// shared keyboard and focus behavior for all of their existing render paths.
export function useDialogFocus() {
  useEffect(() => {
    let dialog: HTMLElement | null = null
    let opener: HTMLElement | null = null
    const backgrounds = new Map<HTMLElement, boolean>()
    const focusable = () =>
      dialog
        ? Array.from(
            dialog.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((element) => element.getClientRects().length > 0)
        : []
    const sync = () => {
      const dialogs = document.querySelectorAll<HTMLElement>(
        '[role="dialog"][aria-modal="true"]',
      )
      const next = dialogs.item(dialogs.length - 1)
      if (next === dialog) return
      if (next) {
        if (!dialog)
          opener =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null
        dialog = next
        for (const element of document.querySelectorAll<HTMLElement>(
          '.shell > .nav, .shell > .workspace',
        )) {
          if (!backgrounds.has(element)) backgrounds.set(element, element.inert)
          element.inert = true
        }
        if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1
        queueMicrotask(() => {
          if (dialog?.isConnected) (focusable()[0] ?? dialog).focus()
        })
      } else {
        dialog = null
        for (const [element, inert] of backgrounds) element.inert = inert
        backgrounds.clear()
        if (opener?.isConnected) opener.focus()
        opener = null
      }
    }
    const keydown = (event: KeyboardEvent) => {
      if (!dialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        dialog.closest<HTMLElement>('.modalOverlay, .modalBackdrop')?.click()
      } else if (event.key === 'Tab') {
        const items = focusable()
        const first = items[0] ?? dialog
        const last = items.at(-1) ?? dialog
        if (
          !dialog.contains(document.activeElement) ||
          (event.shiftKey
            ? document.activeElement === first
            : document.activeElement === last)
        ) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        }
      }
    }
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('keydown', keydown, true)
    sync()
    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', keydown, true)
      for (const [element, inert] of backgrounds) element.inert = inert
    }
  }, [])
}

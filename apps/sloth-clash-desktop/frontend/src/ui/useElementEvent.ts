import { useEffect, useRef } from 'react'

/** Subscribes to a native DOM event on a custom element; always calls the latest handler. */
export function useElementEvent<E extends HTMLElement>(
  ref: React.RefObject<E | null>,
  type: string,
  handler: ((e: Event) => void) | undefined,
) {
  const latestRef = useRef(handler)
  useEffect(() => {
    latestRef.current = handler
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fn = (e: Event) => latestRef.current?.(e)
    el.addEventListener(type, fn)
    return () => el.removeEventListener(type, fn)
  }, [ref, type])
}

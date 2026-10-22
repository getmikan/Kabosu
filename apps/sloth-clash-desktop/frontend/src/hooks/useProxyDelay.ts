import { useCallback, useState } from 'react'

import { TestProxyDelay, TestProxyGroupDelay } from '../api/proxy'

/**
 * Per-node delay state and ping actions for the Proxies screen.
 *
 * `busy[id]` is `true` while a probe is in flight. `delays[id]` holds the last
 * successful round-trip in ms. `errors[id]` holds the last failure message.
 *
 * `__all_<group>` batch keys are exposed on `busy` so the Proxies group toolbar
 * can disable the "Ping all" button while a sweep is running.
 */
export function useProxyDelay() {
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [delays, setDelays] = useState<Record<string, number>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const ping = useCallback(async (name: string) => {
    const id = String(name ?? '').trim()
    if (!id) return
    setBusy((prev) => ({ ...prev, [id]: true }))
    setErrors((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    try {
      const ms = await TestProxyDelay(id)
      setDelays((prev) => ({ ...prev, [id]: Number(ms) || 0 }))
    } catch (e: any) {
      setErrors((prev) => ({ ...prev, [id]: String(e) }))
    } finally {
      setBusy((prev) => ({ ...prev, [id]: false }))
    }
  }, [])

  // Citrus schedules the whole group test and keeps its native health history.
  const pingAll = useCallback(async (groupName: string, proxies: string[]) => {
    const list = proxies.map((name) => String(name).trim()).filter(Boolean)
    if (!list.length) return
    const batchKey = `__all_${groupName}`
    setBusy((prev) => ({
      ...prev,
      [batchKey]: true,
      ...Object.fromEntries(list.map((name) => [name, true])),
    }))
    try {
      const measured = await TestProxyGroupDelay(groupName)
      setDelays((prev) => ({
        ...prev,
        ...Object.fromEntries(
          list
            .filter((name) => Object.hasOwn(measured, name))
            .map((name) => [name, Number(measured[name]) || 0]),
        ),
      }))
      setErrors((prev) => {
        const next = { ...prev }
        for (const name of list) {
          if (!Object.hasOwn(measured, name) || Number(measured[name]) > 0)
            delete next[name]
          else next[name] = 'no delay value'
        }
        return next
      })
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        ...Object.fromEntries(list.map((name) => [name, String(error)])),
      }))
    } finally {
      setBusy((prev) => ({
        ...prev,
        [batchKey]: false,
        ...Object.fromEntries(list.map((name) => [name, false])),
      }))
    }
  }, [])

  return { busy, delays, errors, ping, pingAll }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { GetProfileProxyGroupsBaseline } from '../api/profile'
import { SetProxyNode } from '../api/proxy'

const LS_PICKS_PREFIX = 'kabosu.pendingNodes.'

type Picks = Record<string, string>

export type OfflineProxyGroup = {
  name: string
  type: string
  proxies: string[]
  selected: string
  hidden?: boolean
  offline: true
}

// Config group types → the names the core reports at runtime, so the Proxies
// screen renders offline groups exactly like live ones.
const TYPE_NAMES: Record<string, string> = {
  select: 'Selector',
  'url-test': 'URLTest',
  fallback: 'Fallback',
  'load-balance': 'LoadBalance',
  relay: 'Relay',
}

function readPicks(profileId: string): Picks {
  if (!profileId) return {}
  try {
    const raw = localStorage.getItem(LS_PICKS_PREFIX + profileId)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Picks) : {}
  } catch {
    return {}
  }
}

function writePicks(profileId: string, picks: Picks) {
  try {
    localStorage.setItem(LS_PICKS_PREFIX + profileId, JSON.stringify(picks))
  } catch {
    // Storage unavailable: the pick still applies for this session.
  }
}

/**
 * Proxy groups read from the active profile's config while the core is not
 * running, so the user can browse servers and pick one before Connect. The
 * user's last pick per group is remembered per profile and pushed to the core
 * whenever a live group disagrees with it (i.e. right after Connect).
 */
export function useOfflineProxyGroups({
  profileId,
  coreRunning,
  liveGroups,
  onApplied,
}: {
  profileId: string
  coreRunning: boolean
  liveGroups: any[]
  /** Called after picks were pushed to the core (refresh state). */
  onApplied: () => void
}) {
  const [baseline, setBaseline] = useState<{ id: string; groups: any[] }>({
    id: '',
    groups: [],
  })
  const [stored, setStored] = useState<{ id: string; picks: Picks }>(() => ({
    id: profileId,
    picks: readPicks(profileId),
  }))
  const picks = useMemo(
    () => (stored.id === profileId ? stored.picks : readPicks(profileId)),
    [stored, profileId],
  )

  // Load the profile's groups whenever we need them offline. Cheap: the
  // backend reads the cached subscription, not the network.
  useEffect(() => {
    if (!profileId || coreRunning || baseline.id === profileId) return
    let cancelled = false
    void GetProfileProxyGroupsBaseline(profileId)
      .then((peek) => {
        if (!cancelled) setBaseline({ id: profileId, groups: peek?.groups ?? [] })
      })
      .catch(() => {
        if (!cancelled) setBaseline({ id: profileId, groups: [] })
      })
    return () => {
      cancelled = true
    }
  }, [profileId, coreRunning, baseline.id])

  const groups = useMemo<OfflineProxyGroup[]>(() => {
    if (baseline.id !== profileId) return []
    return baseline.groups
      .map((g: any) => {
        const name = String(g?.name ?? '').trim()
        const proxies = Array.isArray(g?.proxies)
          ? (g.proxies as unknown[]).map((p) => String(p)).filter(Boolean)
          : []
        const rawType = String(g?.type ?? '').trim().toLowerCase()
        const pick = picks[name]
        return {
          name,
          type: TYPE_NAMES[rawType] ?? (rawType || 'Selector'),
          proxies,
          selected: pick && proxies.includes(pick) ? pick : (proxies[0] ?? ''),
          hidden: g?.hidden === true,
          offline: true as const,
        }
      })
      .filter((g) => g.name && g.proxies.length > 0)
  }, [baseline, profileId, picks])

  /** Remember the user's pick for a group (live or offline). */
  const rememberPick = useCallback(
    (group: string, node: string) => {
      if (!profileId) return
      const next = { ...picks, [group]: node }
      writePicks(profileId, next)
      setStored({ id: profileId, picks: next })
    },
    [profileId, picks],
  )

  // Each pick is pushed at most once per core session, so a group that
  // refuses manual selection (url-test) can never cause a retry loop.
  const attemptedRef = useRef(new Set<string>())
  useEffect(() => {
    if (!coreRunning) attemptedRef.current.clear()
  }, [coreRunning])

  useEffect(() => {
    if (!profileId || !coreRunning || liveGroups.length === 0) return
    const todo = Object.entries(picks).filter(([group, node]) => {
      const live = liveGroups.find((g: any) => g?.name === group)
      return (
        live &&
        live.type === 'Selector' &&
        live.selected !== node &&
        (live.proxies ?? []).includes(node) &&
        !attemptedRef.current.has(`${group}\u0000${node}`)
      )
    })
    if (todo.length === 0) return
    for (const [group, node] of todo) {
      attemptedRef.current.add(`${group}\u0000${node}`)
    }
    void (async () => {
      for (const [group, node] of todo) {
        try {
          await SetProxyNode(group, node)
        } catch {
          // The core keeps its own choice; the next pick retries.
        }
      }
      onApplied()
    })()
  }, [profileId, coreRunning, liveGroups, picks, onApplied])

  return { groups, rememberPick }
}

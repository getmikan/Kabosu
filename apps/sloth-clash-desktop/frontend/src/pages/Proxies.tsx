import { AnimatePresence, motion } from 'motion/react'
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { main } from '../api/models'
import { FlagMark } from '../components/FlagMark'
import { MaterialSymbol } from '../components/MaterialSymbol'
import '../styles/proxies.css'
import { Button, Loading, Segmented, Select, Shape, TextField } from '../ui/M3'
import {
  extractNodeFlagIso,
  filterProxyNodesForDisplay,
  isUnsafeGroupName,
  nodeDisplayName,
  nodeFeatureTags,
} from '../utils/proxyNames'
import { friendlyErrorMessage } from '../utils/yaml'

// Mihomo /proxies/{name}/delay surfaces a handful of recurring failure modes.
// Map to a short label so the chip stays compact; full message stays in title=.
function shortProxyDelayError(raw: string | undefined): string {
  if (!raw) return ''
  const s = String(raw)
  const httpMatch = /HTTP\s+(\d{3})/i.exec(s)
  if (httpMatch) return httpMatch[1]
  if (/context deadline exceeded|timeout/i.test(s)) return 'timeout'
  if (/no delay value/i.test(s)) return 'no reply'
  if (/connection refused|no such host|network is unreachable/i.test(s)) {
    return 'no route'
  }
  if (/EOF|broken pipe|reset by peer/i.test(s)) return 'broken'
  return 'fail'
}

// Latency bands → quality class for at-a-glance colouring.
function delayBand(ms: number): 'good' | 'ok' | 'slow' | '' {
  if (ms <= 0) return ''
  if (ms < 120) return 'good'
  if (ms < 300) return 'ok'
  return 'slow'
}

type GroupHealth = { alive: number; total: number; best: number }

function groupHealth(
  proxies: string[],
  delayMap: Record<string, number>,
  delayErr: Record<string, string>,
): GroupHealth {
  let alive = 0
  let best = 0
  for (const p of proxies) {
    const d = delayMap[p] ?? 0
    if (d > 0 && !delayErr[p]) {
      alive++
      if (best === 0 || d < best) best = d
    }
  }
  return { alive, total: proxies.length, best }
}

function fastestNode(
  proxies: string[],
  delayMap: Record<string, number>,
  delayErr: Record<string, string>,
): string {
  let best = ''
  let bestD = Number.POSITIVE_INFINITY
  for (const p of proxies) {
    const d = delayMap[p] ?? 0
    if (d > 0 && !delayErr[p] && d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

type SortMode = 'default' | 'latency' | 'name'
type Density = 'comfortable' | 'compact'

const LS = {
  open: 'slothProxies.open',
  sort: 'slothProxies.sort',
  hideDead: 'slothProxies.hideDead',
  density: 'slothProxies.density',
}

function lsGet(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

// GroupIcon renders a proxy group's `icon` from mihomo: a URL (http/https/data)
// becomes an <img> that hides itself if it fails to load; anything else (e.g. an
// emoji a provider set) renders as text. Empty/absent icon renders nothing.
function GroupIcon({ icon }: { icon: unknown }) {
  const s = String(icon ?? '').trim()
  if (!s)
    return (
      <span className="proxyGroupSymbol">
        <MaterialSymbol name="proxies" />
      </span>
    )
  if (/^(https?:|data:)/i.test(s)) {
    return (
      <img
        className="proxyGroupIcon"
        src={s}
        alt=""
        loading="lazy"
        aria-hidden
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
    )
  }
  return (
    <span className="proxyGroupIconEmoji" aria-hidden>
      {s}
    </span>
  )
}

export function ProxiesPage({
  panel,
  hideGlobalMode,
  profileID,
  groups,
  connectionStatus,
  displayMode,
  showBuiltin,
  proxyDelayBusy,
  proxyDelayMap,
  proxyDelayErr,
  error,
  onRefreshProxies,
  onToggleShowBuiltin,
  onSetMode,
  onSelectNode,
  onPingAll,
}: {
  panel?: main.SubscriptionPanel
  profileID?: string
  hideGlobalMode?: boolean
  groups: any[]
  activeGroup: string
  connectionStatus: string
  displayMode: string
  showBuiltin: boolean
  proxyDelayBusy: Record<string, boolean>
  proxyDelayMap: Record<string, number>
  proxyDelayErr: Record<string, string>
  error: string | null
  onRefreshProxies: () => void
  onToggleShowBuiltin: () => void
  onSetMode: (mode: 'rule' | 'global') => void
  onSelectGroup: (name: string) => void
  onSelectNode: (group: string, node: string) => void
  onPingAll: (group: string, nodes: string[]) => void
}) {
  const { t } = useTranslation()
  // Groups the subscription flags `hidden: true` (mihomo passes this through on
  // /proxies) are collapsed by default; a toolbar toggle reveals them. The
  // toggle only appears when there is something to reveal.
  const [layout, setLayout] = useState(() =>
    lsGet(
      `kabosu.groupLayout.${profileID || ''}`,
      panel?.brand?.proxyGroupLayout || 'tabs',
    ),
  )
  const [showHidden, setShowHidden] = useState(false)
  const baseVisibleGroups = groups.filter((g: any) => {
    const name = String(g?.name ?? '')
    if (!showBuiltin) {
      if (isUnsafeGroupName(name)) return false
      if (displayMode === 'rule' && name.toUpperCase() === 'GLOBAL')
        return false
    }
    return true
  })
  const hiddenGroupCount = baseVisibleGroups.filter(
    (g: any) => g?.hidden === true,
  ).length
  const visibleGroups = showHidden
    ? baseVisibleGroups
    : baseVisibleGroups.filter((g: any) => g?.hidden !== true)

  return (
    <div className="page pxPage">
      <h2 className="srOnly">{t('ui.proxies.title')}</h2>
      <p className="srOnly">{t('ui.proxies.lead')}</p>
      <div className="pageToolbar pxToolbar">
        {!hideGlobalMode ? (
          <Segmented
            ariaLabel={t('ui.proxies.proxyModeAria')}
            value={displayMode === 'global' ? 'global' : 'rule'}
            onChange={(next) => onSetMode(next)}
            options={[
              { value: 'rule', label: t('ui.common.rule') },
              { value: 'global', label: t('ui.common.global') },
            ]}
          />
        ) : null}
        <Select
          ariaLabel={t('panel.groupLayout')}
          className="pxLayoutSelect"
          value={layout}
          onChange={(next) => {
            setLayout(next)
            lsSet(`kabosu.groupLayout.${profileID || ''}`, next)
          }}
          options={[
            { value: 'tabs', label: t('panel.tabs') },
            { value: 'dropdown', label: t('panel.dropdown') },
          ]}
        />
        <span className="spacer" />
        <div className="pxToolbarActions">
          <Button
            variant="tonal"
            icon="refresh"
            disabled={connectionStatus !== 'connected'}
            onClick={onRefreshProxies}
          >
            {t('ui.proxies.refreshGroups')}
          </Button>
          <Button
            variant={showBuiltin ? 'tonal' : 'outlined'}
            toggle
            selected={showBuiltin}
            onClick={onToggleShowBuiltin}
          >
            {t('ui.proxies.showBuiltin')}
          </Button>
          {hiddenGroupCount > 0 ? (
            <Button
              variant={showHidden ? 'tonal' : 'outlined'}
              toggle
              selected={showHidden}
              title={t('ui.proxies.showHiddenHint')}
              onClick={() => setShowHidden((v) => !v)}
            >
              {t('ui.proxies.showHidden')} ({hiddenGroupCount})
            </Button>
          ) : null}
        </div>
      </div>
      <ProxyGroupsAccordion
        layout={layout}
        panelGroups={panel?.groups}
        visibleGroups={visibleGroups}
        connectionStatus={connectionStatus}
        showBuiltin={showBuiltin}
        proxyDelayBusy={proxyDelayBusy}
        proxyDelayMap={proxyDelayMap}
        proxyDelayErr={proxyDelayErr}
        onSelectNode={onSelectNode}
        onPingAll={onPingAll}
      />
      {error ? (
        <div className="inlineError" role="alert">
          <p>{friendlyErrorMessage(error)}</p>
        </div>
      ) : null}
    </div>
  )
}

type AccordionProps = {
  layout: string
  panelGroups?: main.MikanGroups
  visibleGroups: any[]
  connectionStatus: string
  showBuiltin: boolean
  proxyDelayBusy: Record<string, boolean>
  proxyDelayMap: Record<string, number>
  proxyDelayErr: Record<string, string>
  onSelectNode: (group: string, node: string) => void
  onPingAll: (group: string, nodes: string[]) => void
}

/**
 * Single-open accordion: groups are full-width rows; clicking one expands its
 * nodes inline. Adds a group quick-filter, per-group health (alive/total +
 * best latency), auto-test + "select fastest", latency bars, density toggle,
 * and persists the open group / sort / filters. "Our own" take on the
 * FlClashX / mobile accordion — not a 1:1 clash-verge clone.
 */
function ProxyGroupsAccordion({
  layout,
  panelGroups,
  visibleGroups,
  connectionStatus,
  showBuiltin,
  proxyDelayBusy,
  proxyDelayMap,
  proxyDelayErr,
  onSelectNode,
  onPingAll,
}: AccordionProps) {
  const { t } = useTranslation()
  const [serverGroupID, setServerGroupID] = useState('')
  const quotaByProxy = useMemo(() => {
    const result = new Map<string, main.MikanServerGroup>()
    for (const group of panelGroups?.groups ?? []) {
      for (const node of group.proxies ?? []) {
        if (!result.has(node)) result.set(node, group)
      }
    }
    return result
  }, [panelGroups])
  const [groupSearch, setGroupSearch] = useState('')
  const [openName, setOpenName] = useState(() => lsGet(LS.open, ''))
  const [nodeSearch, setNodeSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>(
    () => lsGet(LS.sort, 'default') as SortMode,
  )
  const [hideDead, setHideDead] = useState(
    () => lsGet(LS.hideDead, '0') === '1',
  )
  const [density, setDensity] = useState<Density>(
    () => lsGet(LS.density, 'compact') as Density,
  )
  const autoTestedRef = useRef<Set<string>>(new Set())
  const activeCardRef = useRef<HTMLButtonElement | null>(null)

  const connected = connectionStatus === 'connected'

  useEffect(() => lsSet(LS.open, openName), [openName])
  useEffect(() => lsSet(LS.sort, sortMode), [sortMode])
  useEffect(() => lsSet(LS.hideDead, hideDead ? '1' : '0'), [hideDead])
  useEffect(() => lsSet(LS.density, density), [density])

  // Auto-test the open group's nodes once, if they have no delays yet — so
  // opening a group surfaces live latencies without a manual ping.
  useEffect(() => {
    if (!openName || !connected) return
    if (autoTestedRef.current.has(openName)) return
    const g = visibleGroups.find((x: any) => String(x.name ?? '') === openName)
    if (!g) return
    const ps = filterProxyNodesForDisplay(
      (g.proxies ?? []) as string[],
      showBuiltin,
      String(g.selected ?? ''),
    )
    if (ps.length === 0) return
    const anyMeasured = ps.some(
      (p) => (proxyDelayMap[p] ?? 0) > 0 || proxyDelayErr[p],
    )
    if (!anyMeasured) {
      autoTestedRef.current.add(openName)
      onPingAll(openName, ps)
    }
  }, [
    openName,
    connected,
    visibleGroups,
    showBuiltin,
    proxyDelayMap,
    proxyDelayErr,
    onPingAll,
  ])

  // Scroll the selected node into view when a group opens.
  useEffect(() => {
    activeCardRef.current?.scrollIntoView({ block: 'nearest' })
  }, [openName])

  if (visibleGroups.length === 0) {
    return (
      <div className="emptyState pxEmpty">
        <Shape name={connected ? 'soft-burst' : 'pill'} />
        <strong>
          {connected ? t('ui.proxies.noGroups') : t('ui.proxies.connectFirst')}
        </strong>
      </div>
    )
  }

  const gq = groupSearch.trim().toLowerCase()
  const shownGroups = gq
    ? visibleGroups.filter((g: any) =>
        String(g.name ?? '')
          .toLowerCase()
          .includes(gq),
      )
    : visibleGroups

  const chosenGroupName = shownGroups.some(
    (group: any) => group.name === openName,
  )
    ? openName
    : shownGroups[0]?.name || ''

  const sortNodes = (nodes: string[]): string[] => {
    if (sortMode === 'name') {
      return [...nodes].sort((a, b) =>
        nodeDisplayName(a).localeCompare(nodeDisplayName(b)),
      )
    }
    if (sortMode === 'latency') {
      const rank = (p: string): number => {
        if (proxyDelayErr[p]) return Number.MAX_SAFE_INTEGER
        const d = proxyDelayMap[p] ?? 0
        return d > 0 ? d : Number.MAX_SAFE_INTEGER - 1
      }
      return [...nodes].sort((a, b) => rank(a) - rank(b))
    }
    return nodes
  }

  return (
    <div className="pxAccordion">
      <div className="pxFilters">
        <TextField
          className="pxGroupSearch"
          leadingIcon="search"
          value={groupSearch}
          onChange={setGroupSearch}
          placeholder={t('ui.proxies.searchGroup')}
          ariaLabel={t('ui.proxies.searchGroup')}
        />
        {layout === 'dropdown' ? (
          <Select
            className="pxFilterSelect"
            ariaLabel={t('ui.proxies.searchGroup')}
            value={chosenGroupName}
            onChange={setOpenName}
            options={shownGroups.map((group: any) => ({
              value: String(group.name),
              label: String(group.name),
            }))}
          />
        ) : null}
        {panelGroups?.groups.some((group) => group.proxies?.length) ? (
          <Select
            className="pxFilterSelect"
            ariaLabel={t('panel.serverGroups')}
            value={serverGroupID}
            onChange={setServerGroupID}
            options={[
              { value: '', label: t('panel.allGroups') },
              ...panelGroups.groups
                .filter((group) => group.proxies?.length)
                .map((group) => ({
                  value: String(group.id),
                  label: `${group.name}${group.exhausted ? ` · ${t('panel.exhausted')}` : ''}`,
                })),
            ]}
          />
        ) : null}
      </div>
      <div className="pxList stagger">
        {(layout === 'dropdown'
          ? shownGroups.filter((g: any) => g.name === chosenGroupName)
          : shownGroups
        ).map((g: any, gi: number) => {
          const name = String(g.name ?? '')
          const isOpen = layout === 'dropdown' || name === openName
          const selected = String(g.selected ?? '')
          const type = String(g.type ?? '')
            .toLowerCase()
            .replace(/-/g, '')
          const isAuto =
            type === 'urltest' || type === 'fallback' || type === 'loadbalance'
          const isChain = type === 'chain'
          const readOnly = isAuto || isChain
          const allProxies = isChain
            ? ((g.proxies ?? []) as string[])
            : filterProxyNodesForDisplay(
                (g.proxies ?? []) as string[],
                showBuiltin,
                selected,
              )
          const pingKey = `__all_${name}`
          const selectedIso = extractNodeFlagIso(selected)
          const health = groupHealth(allProxies, proxyDelayMap, proxyDelayErr)

          let nodes = allProxies
          if (isOpen) {
            const q = nodeSearch.trim().toLowerCase()
            if (q) {
              nodes = nodes.filter(
                (p) =>
                  nodeDisplayName(p).toLowerCase().includes(q) ||
                  p.toLowerCase().includes(q),
              )
            }
            if (!isChain && serverGroupID)
              nodes = nodes.filter(
                (node) => String(quotaByProxy.get(node)?.id) === serverGroupID,
              )
            if (!isChain && hideDead)
              nodes = nodes.filter((p) => !proxyDelayErr[p])
            if (!isChain) nodes = sortNodes(nodes)
          }

          return (
            <div
              className={`pxGroup${isOpen ? ' open' : ''}`}
              key={name}
              style={{ '--i': gi } as CSSProperties}
            >
              <button
                type="button"
                className="pxHeader"
                aria-expanded={isOpen}
                onClick={() => setOpenName(isOpen ? '' : name)}
              >
                <GroupIcon icon={g.icon} />
                <span className="pxName">{name}</span>
                {g.hidden === true ? (
                  <span
                    className="pxChip pxChipHidden"
                    title={t('ui.proxies.hiddenChipHint')}
                  >
                    {t('ui.proxies.hiddenChip')}
                  </span>
                ) : null}
                <span className={`pxChip pxChipType pxType-${type}`}>
                  {g.type}
                </span>
                <span className="pxChip pxChipCount">
                  {(g.proxies ?? []).length}
                </span>
                {health.best > 0 ? (
                  <span
                    className="pxHealth"
                    title={t('ui.proxies.healthTitle')}
                  >
                    {health.alive}/{health.total} · {health.best} ms
                  </span>
                ) : null}
                <span className="pxCurrent">
                  <FlagMark iso2={selectedIso} width={12} height={9} />
                  <span className="pxCurrentName">
                    {nodeDisplayName(selected) || '—'}
                  </span>
                </span>
                <span className="pxChevron" aria-hidden>
                  <MaterialSymbol name="chevron" />
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    className="pxBodyWrap"
                    key="body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                  >
                <div className="pxBody">
                  <div className="pxActions">
                    <Button
                      variant="tonal"
                      icon="speed"
                      busy={Boolean(proxyDelayBusy[pingKey])}
                      disabled={!connected}
                      title={t('ui.proxies.pingAll')}
                      onClick={() => onPingAll(name, allProxies)}
                    >
                      {t('ui.proxies.pingAllShort')}
                    </Button>
                    {!readOnly ? (
                      <Button
                        variant="outlined"
                        icon="check"
                        title={t('ui.proxies.selectFastest')}
                        disabled={
                          !fastestNode(allProxies, proxyDelayMap, proxyDelayErr)
                        }
                        onClick={() => {
                          const f = fastestNode(
                            allProxies,
                            proxyDelayMap,
                            proxyDelayErr,
                          )
                          if (f && f !== selected) onSelectNode(name, f)
                        }}
                      >
                        {t('ui.proxies.fastest')}
                      </Button>
                    ) : null}
                    <Select
                      className="pxSort"
                      disabled={isChain}
                      value={sortMode}
                      onChange={(next) => setSortMode(next as SortMode)}
                      ariaLabel={t('ui.proxies.sortLabel')}
                      options={[
                        { value: 'default', label: t('ui.proxies.sortDefault') },
                        { value: 'latency', label: t('ui.proxies.sortLatency') },
                        { value: 'name', label: t('ui.proxies.sortName') },
                      ]}
                    />
                    <Button
                      variant={hideDead ? 'tonal' : 'outlined'}
                      toggle
                      selected={hideDead}
                      aria-label={t('ui.proxies.hideDead')}
                      onClick={() => setHideDead((v) => !v)}
                    >
                      {t('ui.proxies.hideDead')}
                    </Button>
                    <Button
                      variant="outlined"
                      title={t('ui.proxies.density')}
                      onClick={() =>
                        setDensity((d) =>
                          d === 'compact' ? 'comfortable' : 'compact',
                        )
                      }
                    >
                      {density === 'compact'
                        ? t('ui.proxies.densityComfortable')
                        : t('ui.proxies.densityCompact')}
                    </Button>
                    <TextField
                      className="pxNodeSearch"
                      leadingIcon="search"
                      value={nodeSearch}
                      onChange={setNodeSearch}
                      placeholder={t('ui.proxies.searchNode')}
                      ariaLabel={t('ui.proxies.searchNode')}
                    />
                  </div>

                  {readOnly ? (
                    <p className="muted small pxAutoHint">
                      {t(
                        isChain
                          ? 'ui.proxies.chainHint'
                          : 'ui.proxies.autoGroupHint',
                      )}
                      {isChain && g.chainAlive === false
                        ? ` ${g.failedHop || ''}: ${g.chainError || t('ui.proxies.chainFailed')}`
                        : ''}
                    </p>
                  ) : null}

                  <div
                    className={`pxGrid stagger${density === 'compact' ? ' compact' : ''}`}
                  >
                    {nodes.map((p: string, ni: number) => {
                      const active = selected === p
                      const iso = extractNodeFlagIso(p)
                      const rawErr = proxyDelayErr[p]
                      const shortErr = shortProxyDelayError(rawErr)
                      const ms = proxyDelayMap[p] ?? 0
                      const band = delayBand(ms)
                      const titleParts: string[] = []
                      if (readOnly)
                        titleParts.push(
                          t(
                            isChain
                              ? 'ui.proxies.chainHint'
                              : 'ui.proxies.autoGroupHint',
                          ),
                        )
                      else titleParts.push(p)
                      if (rawErr) titleParts.push(String(rawErr))
                      return (
                        <button
                          key={p}
                          type="button"
                          ref={active ? activeCardRef : undefined}
                          className={`pxNode${active ? ' active' : ''}${readOnly ? ' readonly' : ''}`}
                          style={{ '--i': ni } as CSSProperties}
                          title={titleParts.join(' — ')}
                          disabled={readOnly}
                          onClick={() => {
                            if (!p || active || readOnly) return
                            onSelectNode(name, p)
                          }}
                        >
                          <div className="pxNodeTop">
                            <FlagMark iso2={iso} width={16} height={12} />
                            <span className="pxNodeName">
                              {isChain ? `${allProxies.indexOf(p) + 1}. ` : ''}
                              {nodeDisplayName(p)}
                            </span>
                            <div className="pxNodeTags">
                              {quotaByProxy.has(p) ? (
                                <span
                                  className="pxNodeTag"
                                  title={
                                    quotaByProxy.get(p)?.exhausted
                                      ? t('panel.exhausted')
                                      : undefined
                                  }
                                >
                                  {quotaByProxy.get(p)?.name}
                                </span>
                              ) : null}
                              {nodeFeatureTags(p).map((tag) => (
                                <span key={tag} className="pxNodeTag">
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <span
                              className={`pxDelay${shortErr ? ' fail' : band ? ` ${band}` : ''}`}
                            >
                              {proxyDelayBusy[p] ? (
                                <Loading className="pxDelayLoader" />
                              ) : shortErr ? (
                                shortErr
                              ) : ms > 0 ? (
                                `${ms} ms`
                              ) : (
                                '—'
                              )}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                    {nodes.length === 0 ? (
                      <p className="muted small pxNoMatch">
                        {t('ui.proxies.noNodeMatch')}
                      </p>
                    ) : null}
                  </div>
                </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          )
        })}
        {shownGroups.length === 0 ? (
          <p className="muted small pxNoMatch">
            {t('ui.proxies.noGroupMatch')}
          </p>
        ) : null}
      </div>
    </div>
  )
}

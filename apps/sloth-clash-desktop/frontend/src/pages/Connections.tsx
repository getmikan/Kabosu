import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { FlagMark } from '../components/FlagMark'
import { MaterialSymbol } from '../components/MaterialSymbol'
import type { ConnectionsOverview } from '../types/app'
import { formatBytesSmart } from '../utils/format'
import {
  extractNodeFlagIso,
  proxyNodeLabelBesideFlag,
} from '../utils/proxyNames'

type ConnectionRow = NonNullable<ConnectionsOverview['connections']>[number]
export function ConnectionsPage({
  overview,
  filtered,
  busy,
  search,
  onSearchChange,
  onRefresh,
  onCloseAll,
}: {
  overview: ConnectionsOverview | null
  filtered: ConnectionRow[]
  busy: boolean
  search: string
  onSearchChange: (next: string) => void
  onRefresh: () => void
  onCloseAll: () => void
}) {
  const { t } = useTranslation()
  const groups = useMemo(() => {
    const result = new Map<
      string,
      { name: string; rows: ConnectionRow[]; up: number; down: number }
    >()
    for (const row of filtered) {
      const raw = String(row.metadata?.process || '').trim()
      const name = raw
        ? raw.split(/[\\/]/).at(-1) || raw
        : t('ui.connections.direct')
      const group = result.get(name) || { name, rows: [], up: 0, down: 0 }
      group.rows.push(row)
      group.up += Number(row.upload || 0)
      group.down += Number(row.download || 0)
      result.set(name, group)
    }
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered, t])
  return (
    <div className="panel connectionsPanel">
      <div className="connectionToolbar">
        <span className="listCount">
          {t('expressive.processes')} <strong>{groups.length}</strong>
        </span>
        <input
          className="input connectionSearch"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('ui.connections.searchPlaceholder')}
          aria-label={t('ui.connections.searchPlaceholder')}
        />
        <div className="connectionTotals">
          <span>↑ {formatBytesSmart(Number(overview?.uploadTotal || 0))}</span>
          <span>
            ↓ {formatBytesSmart(Number(overview?.downloadTotal || 0))}
          </span>
        </div>
        <button
          type="button"
          className="chromeIconButton"
          disabled={busy}
          onClick={onRefresh}
          title={t('ui.connections.refresh')}
          aria-label={t('ui.connections.refresh')}
        >
          <MaterialSymbol name="refresh" />
        </button>
        <button
          type="button"
          className="btn subtle"
          disabled={!filtered.length}
          onClick={onCloseAll}
        >
          {t('ui.connections.closeAll')}
        </button>
      </div>
      {overview?.lastError ? (
        <p className="error">{overview.lastError}</p>
      ) : null}
      <div className="connectionGroups">
        {groups.map((group) => (
          <details className="processGroup" key={group.name}>
            <summary>
              <span className="processSymbol">
                <MaterialSymbol name="devices" />
              </span>
              <div className="processSummary">
                <div>
                  <strong>{group.name}</strong>
                  <span className="processCount">{group.rows.length}</span>
                </div>
                <p>
                  ↑ {formatBytesSmart(group.up)}{' '}
                  <span>↓ {formatBytesSmart(group.down)}</span>
                </p>
              </div>
              <MaterialSymbol name="chevron" className="processChevron" />
            </summary>
            <div className="processConnections">
              {group.rows.map((row) => {
                const meta = row.metadata || {}
                const node = row.chains?.[0] || ''
                return (
                  <article className="connectionRow" key={row.id}>
                    <div className="connectionRowMain">
                      <strong>
                        {meta.host || meta.destinationIP || '—'}
                        {meta.destinationPort ? `:${meta.destinationPort}` : ''}
                      </strong>
                      <span className="connectionRowBytes">
                        ↑ {formatBytesSmart(Number(row.upload || 0))} ↓{' '}
                        {formatBytesSmart(Number(row.download || 0))}
                      </span>
                    </div>
                    <div className="connectionRowMeta">
                      <span>{meta.network || meta.type || '—'}</span>
                      <span>{row.rulePayload || row.rule || '—'}</span>
                      {node ? (
                        <span
                          className="connNodeChip"
                          title={[...(row.chains || [])].reverse().join(' → ')}
                        >
                          <FlagMark
                            iso2={extractNodeFlagIso(node)}
                            width={16}
                            height={12}
                          />
                          {proxyNodeLabelBesideFlag(node)}
                        </span>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          </details>
        ))}
      </div>
      {!groups.length ? (
        <div className="emptyState">
          <span className="emptyStateIcon">
            <MaterialSymbol name="connections" />
          </span>
          <h2>{t('expressive.emptyConnections')}</h2>
          <p>{t('ui.proxies.connectFirst')}</p>
        </div>
      ) : null}
    </div>
  )
}

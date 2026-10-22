import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { FlagMark } from '../components/FlagMark'
import { MaterialSymbol } from '../components/MaterialSymbol'
import type { ConnectionsOverview } from '../types/app'
import {
  Button,
  Expansion,
  IconButton,
  Progress,
  Shape,
  TextField,
} from '../ui/M3'
import { formatBytesSmart } from '../utils/format'
import {
  extractNodeFlagIso,
  proxyNodeLabelBesideFlag,
} from '../utils/proxyNames'

import '../styles/connections.css'

type ConnectionRow = NonNullable<ConnectionsOverview['connections']>[number]

const SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const

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
  const maxTraffic = useMemo(
    () => Math.max(1, ...groups.map((g) => g.up + g.down)),
    [groups],
  )
  return (
    <div className="page cnPage">
      <div className="cnToolbar">
        <span className="cnCount">
          <span className="cnLiveDot" aria-hidden="true" />
          {t('expressive.processes')} <strong>{groups.length}</strong>
        </span>
        <TextField
          className="cnSearch"
          value={search}
          onChange={onSearchChange}
          placeholder={t('ui.connections.searchPlaceholder')}
          ariaLabel={t('ui.connections.searchPlaceholder')}
          leadingIcon="search"
        />
        <div className="cnTotals">
          <span className="cnTotal" data-dir="up">
            ↑ {formatBytesSmart(Number(overview?.uploadTotal || 0))}
          </span>
          <span className="cnTotal" data-dir="down">
            ↓ {formatBytesSmart(Number(overview?.downloadTotal || 0))}
          </span>
        </div>
        <IconButton
          icon="refresh"
          label={t('ui.connections.refresh')}
          disabled={busy}
          onClick={onRefresh}
        />
        <Button
          variant="tonal"
          disabled={!filtered.length}
          onClick={onCloseAll}
        >
          {t('ui.connections.closeAll')}
        </Button>
      </div>
      {overview?.lastError ? (
        <div className="inlineError" role="alert">
          <p>{overview.lastError}</p>
        </div>
      ) : null}
      <div className="cnGroups">
        <AnimatePresence initial={false}>
          {groups.map((group) => (
            <motion.div
              key={group.name}
              layout="position"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING}
            >
              <Expansion
                className="cnGroup"
                header={
                  <span className="cnGroupHead">
                    <span className="cnGroupIcon">
                      <MaterialSymbol name="devices" />
                    </span>
                    <span className="cnGroupText">
                      <span className="cnGroupName">
                        <strong>{group.name}</strong>
                        <span className="cnGroupCount">
                          {group.rows.length}
                        </span>
                      </span>
                      <span className="cnGroupBytes">
                        ↑ {formatBytesSmart(group.up)} · ↓{' '}
                        {formatBytesSmart(group.down)}
                      </span>
                    </span>
                    <span className="cnGroupBar">
                      <Progress
                        wavy={false}
                        value={group.up + group.down}
                        max={maxTraffic}
                        ariaLabel={group.name}
                      />
                    </span>
                  </span>
                }
              >
                <div className="cnRows">
                  <AnimatePresence initial={false}>
                    {group.rows.map((row) => {
                      const meta = row.metadata || {}
                      const node = row.chains?.[0] || ''
                      return (
                        <motion.article
                          className="cnRow"
                          key={row.id}
                          layout="position"
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 12 }}
                          transition={SPRING}
                        >
                          <div className="cnRowMain">
                            <strong>
                              {meta.host || meta.destinationIP || '—'}
                              {meta.destinationPort
                                ? `:${meta.destinationPort}`
                                : ''}
                            </strong>
                            <span className="cnRowBytes">
                              ↑ {formatBytesSmart(Number(row.upload || 0))} ↓{' '}
                              {formatBytesSmart(Number(row.download || 0))}
                            </span>
                          </div>
                          <div className="cnRowMeta">
                            <span>{meta.network || meta.type || '—'}</span>
                            <span>{row.rulePayload || row.rule || '—'}</span>
                            {node ? (
                              <span
                                className="cnNodeChip"
                                title={[...(row.chains || [])]
                                  .reverse()
                                  .join(' → ')}
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
                        </motion.article>
                      )
                    })}
                  </AnimatePresence>
                </div>
              </Expansion>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {!groups.length ? (
        <div className="emptyState">
          <Shape name="soft-burst" />
          <strong>{t('expressive.emptyConnections')}</strong>
          <p>{t('ui.proxies.connectFirst')}</p>
        </div>
      ) : null}
    </div>
  )
}

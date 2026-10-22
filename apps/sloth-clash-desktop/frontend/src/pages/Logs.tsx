import { AnimatePresence, motion } from 'motion/react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { main } from '../api/models'
import { Button, FilterChip, Shape, SwitchRow, TextField } from '../ui/M3'

import '../styles/logs.css'

type Level = 'info' | 'warn' | 'error' | 'debug' | 'other'

const TAIL_WINDOW = 400

// Mihomo / Clash Meta log lines come in a few shapes:
//   level=info  msg="..."
//   [INFO] ...
//   2024-01-02 12:34:56 [INFO] ...
//   time="..." level=warning msg="..."
// Match the level token regardless of casing or surrounding decoration.
const LEVEL_RE =
  /(?:level\s*=\s*|\[)(debug|info|warn(?:ing)?|error|fatal)(?:\]|\b)/i

function classifyLevel(line: string): Level {
  const m = LEVEL_RE.exec(line)
  if (!m) return 'other'
  const v = m[1].toLowerCase()
  if (v === 'debug') return 'debug'
  if (v === 'info') return 'info'
  if (v === 'warn' || v === 'warning') return 'warn'
  if (v === 'error' || v === 'fatal') return 'error'
  return 'other'
}

type LevelFilter = 'all' | Level

export function LogsPage({
  serviceLog,
  onRefresh,
}: {
  serviceLog: main.ServiceLogPeek | null
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<LevelFilter>('all')
  const [tailOnly, setTailOnly] = useState(true)
  const [copyToast, setCopyToast] = useState('')
  const preRef = useRef<HTMLPreElement>(null)
  const stickRef = useRef(true)

  const text = serviceLog?.text ?? ''

  const allLines = useMemo(() => {
    if (!text) return [] as string[]
    return text.split('\n')
  }, [text])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let lines = allLines
    if (tailOnly && lines.length > TAIL_WINDOW) {
      lines = lines.slice(-TAIL_WINDOW)
    }
    if (level !== 'all') {
      lines = lines.filter((line) => classifyLevel(line) === level)
    }
    if (q) {
      lines = lines.filter((line) => line.toLowerCase().includes(q))
    }
    return lines
  }, [allLines, query, level, tailOnly])

  const copyText = async (lines: string[]) => {
    if (lines.length === 0) return
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopyToast(t('ui.logs.copied'))
      window.setTimeout(() => setCopyToast(''), 2200)
    } catch {
      setCopyToast('Clipboard unavailable')
      window.setTimeout(() => setCopyToast(''), 2200)
    }
  }


  // Auto-scroll: stick to the newest line unless the user scrolled up.
  useLayoutEffect(() => {
    const el = preRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [filtered])

  const levelLabel = (lv: LevelFilter) =>
    t(
      lv === 'all'
        ? 'ui.logs.levelAll'
        : lv === 'info'
          ? 'ui.logs.levelInfo'
          : lv === 'warn'
            ? 'ui.logs.levelWarn'
            : lv === 'error'
              ? 'ui.logs.levelError'
              : 'ui.logs.levelDebug',
    )

  return (
    <div className="page lgPage">
      <div className="lgHead">
        <h2 className="srOnly">{t('ui.logs.title')}</h2>
        <div className="lgHeadActions">
          <Button variant="text" icon="refresh" onClick={onRefresh}>
            {t('ui.logs.refresh')}
          </Button>
          <Button
            variant="outlined"
            onClick={() => void copyText(allLines)}
            disabled={allLines.length === 0}
          >
            {t('ui.logs.copyAll')}
          </Button>
          <Button
            variant="tonal"
            onClick={() => void copyText(filtered)}
            disabled={filtered.length === 0}
          >
            {t('ui.logs.copyFiltered')}
          </Button>
        </div>
      </div>

      <div className="lgToolbar">
        <TextField
          className="lgSearch"
          placeholder={t('ui.logs.search')}
          ariaLabel={t('ui.logs.search')}
          value={query}
          onChange={setQuery}
          leadingIcon="search"
        />
        <div className="lgLevels" role="group" aria-label="Log level">
          {(['all', 'info', 'warn', 'error', 'debug'] as LevelFilter[]).map(
            (lv) => (
              <FilterChip
                key={lv}
                selected={level === lv}
                onToggle={() => setLevel(lv)}
              >
                {levelLabel(lv)}
              </FilterChip>
            ),
          )}
        </div>
        <div className="lgTail" title={t('ui.logs.tailOnlyHint')}>
          <SwitchRow
            label={t('ui.logs.tailOnly')}
            checked={tailOnly}
            onChange={setTailOnly}
          />
        </div>
      </div>

      {serviceLog?.path ? (
        <p className="lgMeta">
          <span className="lgLive" aria-hidden="true" />
          <strong>{serviceLog.path}</strong>
          <span>
            ·{' '}
            {t('ui.logs.lineCount', {
              visible: filtered.length,
              total: allLines.length,
            })}
          </span>
        </p>
      ) : null}
      {serviceLog?.lastError ? (
        <div className="inlineError" role="alert">
          <p>{serviceLog.lastError}</p>
        </div>
      ) : null}

      <AnimatePresence>
        {copyToast ? (
          <motion.p
            className="lgToast"
            role="status"
            initial={{ opacity: 0, y: -8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            {copyToast}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {filtered.length === 0 ? (
        <div className="emptyState">
          <Shape name="6-sided-cookie" />
          <p>
            {allLines.length === 0 ? t('ui.logs.empty') : t('ui.logs.noMatch')}
          </p>
        </div>
      ) : (
        <pre
          ref={preRef}
          className="lgPre"
          onScroll={(e) => {
            const el = e.currentTarget
            stickRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
        >
          {filtered.map((line, i) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- log lines have no id and may repeat
            <span key={i} className="lgLine" data-level={classifyLevel(line)}>
              {line + '\n'}
            </span>
          ))}
        </pre>
      )}
    </div>
  )
}

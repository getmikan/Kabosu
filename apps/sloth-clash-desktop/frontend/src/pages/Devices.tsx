import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CompanionDiscover,
  CompanionListAgents,
  CompanionPairByPin,
  CompanionPairByString,
  CompanionPower,
  CompanionRename,
  CompanionShareSubscription,
  CompanionStartDiscovery,
  CompanionStatus,
  CompanionStopDiscovery,
  CompanionUnpair,
} from '../api/companion'
import type { companion } from '../api/models'
import { EventsOn } from '../api/runtime'
import { MaterialSymbol } from '../components/MaterialSymbol'
import {
  Button,
  Card,
  Chip,
  IconButton,
  Loading,
  Select,
  Shape,
  TextField,
} from '../ui/M3'

import '../styles/devices.css'

type Agent = companion.AgentInfo

function errText(e: unknown): string {
  const m = (e as { message?: string })?.message
  return String(m ?? e ?? '').trim() || 'unknown error'
}

export function DevicesPage() {
  const { t } = useTranslation()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [status, setStatus] = useState<companion.StatusView | null>(null)
  const [pasteStr, setPasteStr] = useState('')
  const [pinTarget, setPinTarget] = useState('')
  const [pin, setPin] = useState('')
  const [renameVal, setRenameVal] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [scanning, setScanning] = useState(false)

  // Live discovery: seed from the store, start the background watcher, and
  // subscribe to the "companion:agents" event so the list refreshes itself.
  useEffect(() => {
    let mounted = true
    CompanionListAgents()
      .then((a) => mounted && setAgents(a ?? []))
      .catch(() => {})
    CompanionStartDiscovery()
    const off = EventsOn('companion:agents', (payload: unknown) => {
      if (Array.isArray(payload)) setAgents(payload as Agent[])
    })
    return () => {
      mounted = false
      off()
      CompanionStopDiscovery()
    }
  }, [])

  const paired = useMemo(() => agents.filter((a) => a.paired), [agents])
  const discovered = useMemo(() => agents.filter((a) => !a.paired), [agents])
  const selected = useMemo(
    () => agents.find((a) => a.deviceId === selectedId) ?? null,
    [agents, selectedId],
  )

  const refreshStatus = useCallback(async (id: string, paired: boolean) => {
    if (!id || !paired) {
      setStatus(null)
      return
    }
    try {
      setStatus(await CompanionStatus(id))
    } catch (e) {
      setStatus(null)
      setError(errText(e))
    }
  }, [])

  // Only paired agents have a status endpoint; selecting a freshly discovered
  // (unpaired) device must not fire a control call (it would error "not paired").
  useEffect(() => {
    void refreshStatus(selectedId, !!selected?.paired)
  }, [selectedId, selected?.paired, refreshStatus])

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await fn()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const onDiscover = () =>
    run(async () => {
      setScanning(true)
      try {
        setAgents((await CompanionDiscover()) ?? [])
      } finally {
        setScanning(false)
      }
    })

  const onPairString = () =>
    run(async () => {
      const info = await CompanionPairByString(pasteStr)
      setPasteStr('')
      setAgents((await CompanionListAgents()) ?? [])
      setSelectedId(info.deviceId)
      setNotice(t('ui.devices.paired'))
    })

  const onPairPin = () =>
    run(async () => {
      const info = await CompanionPairByPin(pinTarget, pin)
      setPin('')
      setPinTarget('')
      setAgents((await CompanionListAgents()) ?? [])
      setSelectedId(info.deviceId)
      setNotice(t('ui.devices.paired'))
    })

  const onPower = (action: 'on' | 'off' | 'toggle') =>
    run(async () => {
      await CompanionPower(selectedId, action)
      await refreshStatus(selectedId, true)
    })

  const onShare = () =>
    run(async () => {
      await CompanionShareSubscription(selectedId)
      setNotice(t('ui.devices.shared'))
    })

  const onRename = () =>
    run(async () => {
      await CompanionRename(selectedId, renameVal)
      setRenameVal('')
      setAgents((await CompanionListAgents()) ?? [])
      setNotice(t('ui.devices.renamed'))
    })

  const onUnpair = () =>
    run(async () => {
      await CompanionUnpair(selectedId)
      setSelectedId('')
      setStatus(null)
      setAgents((await CompanionListAgents()) ?? [])
    })


  return (
    <div className="page dvPage">
      <header className="dvHead">
        <h2 className="srOnly">{t('ui.devices.title')}</h2>
        <Button
          variant="tonal"
          icon="refresh"
          busy={scanning}
          disabled={busy}
          onClick={onDiscover}
        >
          {t('ui.devices.discover')}
        </Button>
      </header>
      <p className="pageLead">{t('ui.devices.subtitle')}</p>

      <AnimatePresence initial={false}>
        {error ? (
          <motion.div
            key="err"
            className="inlineError"
            role="alert"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <p>{error}</p>
          </motion.div>
        ) : null}
        {notice ? (
          <motion.div
            key="notice"
            className="dvNotice"
            role="status"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <MaterialSymbol name="check" />
            {notice}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Pairing */}
      <Card variant="filled">
        <section className="dvSection">
          <h3>{t('ui.devices.pairTitle')}</h3>
          <div className="dvPairRow">
            <TextField
              placeholder="clashctl-pair://…"
              ariaLabel={t('ui.devices.pairPaste')}
              value={pasteStr}
              onChange={setPasteStr}
              spellCheck={false}
            />
            <Button
              disabled={busy || !pasteStr.trim()}
              onClick={onPairString}
            >
              {t('ui.devices.pairPaste')}
            </Button>
          </div>
          <div className="dvPairRow">
            <Select
              value={pinTarget}
              onChange={setPinTarget}
              ariaLabel={t('ui.devices.pickAgent')}
              options={[
                { value: '', label: t('ui.devices.pickAgent') },
                ...discovered.map((a) => ({
                  value: a.deviceId,
                  label: a.name || a.deviceId,
                })),
              ]}
            />
            <TextField
              placeholder={t('ui.devices.pinPlaceholder')}
              ariaLabel={t('ui.devices.pinPlaceholder')}
              value={pin}
              mono
              onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
            />
            <Button
              disabled={busy || !pinTarget || pin.length < 4}
              onClick={onPairPin}
            >
              {t('ui.devices.pairPin')}
            </Button>
          </div>
        </section>
      </Card>

      <div className="dvBody">
        {/* Device list */}
        <section className="dvList">
          <h3 className="sectionTitle">{t('ui.devices.listTitle')}</h3>
          {scanning ? (
            <div className="dvScan" role="status">
              <Loading label={t('ui.devices.discover')} />
              <span>{t('ui.devices.discover')}</span>
            </div>
          ) : null}
          {agents.length === 0 && !scanning ? (
            <div className="emptyState">
              <Shape name="flower" />
              <p>{t('ui.devices.empty')}</p>
            </div>
          ) : null}
          <AnimatePresence initial={false}>
            {paired.map((a) => (
              <DeviceRow
                key={a.deviceId}
                agent={a}
                selected={a.deviceId === selectedId}
                onSelect={() => setSelectedId(a.deviceId)}
                pairedLabel={t('ui.devices.paired')}
                unsupportedLabel={t('ui.devices.unsupported')}
                offlineLabel={t('ui.devices.offline')}
              />
            ))}
          </AnimatePresence>
          {discovered.length ? (
            <p className="dvGroupLabel">{t('ui.devices.discoveredGroup')}</p>
          ) : null}
          <AnimatePresence initial={false}>
            {discovered.map((a) => (
              <DeviceRow
                key={a.deviceId}
                agent={a}
                selected={a.deviceId === selectedId}
                onSelect={() => {
                  setSelectedId(a.deviceId)
                  setPinTarget(a.deviceId)
                }}
                pairedLabel={t('ui.devices.paired')}
                unsupportedLabel={t('ui.devices.unsupported')}
                offlineLabel={t('ui.devices.offline')}
              />
            ))}
          </AnimatePresence>
        </section>

        {/* Control panel */}
        <Card variant="filled">
          <section className="dvControl">
            {selected && selected.paired ? (
              <>
                <div className="dvControlHead">
                  <h3>{selected.name || selected.deviceId}</h3>
                  <IconButton
                    icon="refresh"
                    label={t('ui.devices.refresh')}
                    disabled={busy}
                    onClick={() => void refreshStatus(selectedId, true)}
                  />
                </div>
                <div className="dvStatus">
                  <span
                    className={`statusDot${status?.power === 'on' ? ' statusDotOk' : ''}`}
                    aria-hidden="true"
                  />
                  <span className="muted">{t('ui.devices.power')}</span>
                  <strong>{status?.power ?? '—'}</strong>
                </div>
                {status?.capabilities?.length ? (
                  <div className="dvCaps">
                    {status.capabilities.map((c) => (
                      <Chip key={c}>{c}</Chip>
                    ))}
                  </div>
                ) : null}
                <div className="dvActions">
                  <Button
                    disabled={busy}
                    icon="power"
                    onClick={() => onPower('on')}
                  >
                    {t('ui.devices.powerOn')}
                  </Button>
                  <Button
                    variant="tonal"
                    disabled={busy}
                    onClick={() => onPower('off')}
                  >
                    {t('ui.devices.powerOff')}
                  </Button>
                  <Button
                    variant="tonal"
                    disabled={busy}
                    onClick={() => onPower('toggle')}
                  >
                    {t('ui.devices.powerToggle')}
                  </Button>
                </div>
                <div className="dvActions">
                  <Button
                    variant="outlined"
                    icon="upload"
                    disabled={busy}
                    onClick={onShare}
                  >
                    {t('ui.devices.share')}
                  </Button>
                </div>
                <div className="dvPairRow">
                  <TextField
                    placeholder={t('ui.devices.renamePlaceholder')}
                    ariaLabel={t('ui.devices.renamePlaceholder')}
                    value={renameVal}
                    onChange={setRenameVal}
                  />
                  <Button
                    variant="tonal"
                    disabled={busy || !renameVal.trim()}
                    onClick={onRename}
                  >
                    {t('ui.devices.rename')}
                  </Button>
                </div>
                <div className="dvActions">
                  <Button
                    variant="text"
                    icon="close"
                    disabled={busy}
                    onClick={onUnpair}
                  >
                    {t('ui.devices.unpair')}
                  </Button>
                </div>
              </>
            ) : (
              <div className="emptyState">
                <Shape name="gem" />
                <p className="dvHint">{t('ui.devices.selectHint')}</p>
              </div>
            )}
          </section>
        </Card>
      </div>
    </div>
  )
}

function DeviceRow({
  agent,
  selected,
  onSelect,
  pairedLabel,
  unsupportedLabel,
  offlineLabel,
}: {
  agent: Agent
  selected: boolean
  onSelect: () => void
  pairedLabel: string
  unsupportedLabel: string
  offlineLabel: string
}) {
  const online = agent.paired ? !!agent.reachable : false
  return (
    <motion.button
      type="button"
      className="dvRow"
      data-selected={selected || undefined}
      aria-pressed={selected}
      onClick={onSelect}
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    >
      <span className="dvRowName">
        <span
          className={`statusDot${online ? ' statusDotOk' : ''}`}
          aria-hidden="true"
        />
        <span>{agent.name || agent.deviceId}</span>
      </span>
      <span className="dvRowMeta">
        {agent.app ? <span className="dvPill">{agent.app}</span> : null}
        {agent.paired && !agent.reachable ? <span>{offlineLabel}</span> : null}
        {!agent.supported ? <span>{unsupportedLabel}</span> : null}
        {agent.paired ? <span>{pairedLabel}</span> : null}
      </span>
    </motion.button>
  )
}

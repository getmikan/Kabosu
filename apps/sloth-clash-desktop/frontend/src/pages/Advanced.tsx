import { AnimatePresence, motion } from 'motion/react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { main } from '../api/models'
import { BrandDebugPanel } from '../components/BrandDebugPanel'
import { MaterialSymbol } from '../components/MaterialSymbol'
import '../styles/advanced.css'
import { Button, Card, SwitchRow } from '../ui/M3'
import { friendlyErrorMessage } from '../utils/yaml'

/**
 * Collapsible card. Used for the secondary info cards on Advanced so the
 * page fits a 720px window without scrolling — the diagnostic cards stay
 * visible by default, chatty cards (Device Identity, Runtime Trace) start
 * collapsed and expand on demand.
 */
function CollapsibleCard({
  title,
  defaultOpen,
  actions,
  children,
  className,
  index = 0,
}: {
  title: string
  defaultOpen?: boolean
  actions?: ReactNode
  children: ReactNode
  className?: string
  index?: number
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(Boolean(defaultOpen))
  return (
    <Card
      className={`adCard${className ? ` ${className}` : ''}`}
      style={{ '--i': index } as CSSProperties}
    >
      <div className="adCardHead">
        <button
          type="button"
          className="adCardToggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="adCardChevron" data-open={open || undefined}>
            <MaterialSymbol name="chevron" />
          </span>
          <span className="adCardTitle">{title}</span>
        </button>
        <div className="adCardActions">
          {actions}
          <span className="adNote">
            {open ? t('common.hide') : t('common.show')}
          </span>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            className="adCardBody"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
  )
}

function KV({
  label,
  value,
  mono,
}: {
  label: ReactNode
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="adRow">
      <span>{label}</span>
      <strong className={mono ? 'adMono' : undefined}>{value}</strong>
    </div>
  )
}

export type ConnectivityTarget = 'google' | 'youtube' | 'telegram'

const TRACE_VISIBLE_LIMIT = 50

function formatTraceTimestamp(tsMs: number): string {
  if (!Number.isFinite(tsMs) || tsMs <= 0) return ''
  const d = new Date(tsMs)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function serializeTrace(events: main.RuntimeDiagEvent[]): string {
  return events
    .map((e) => {
      const stamp = new Date(e.ts).toISOString()
      const msg = String(e.message ?? '').trim()
      return msg ? `${stamp} ${e.category} ${msg}` : `${stamp} ${e.category}`
    })
    .join('\n')
}

function formatBytes(b: number): string {
  if (!Number.isFinite(b) || b <= 0) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

function formatModified(unix: number): string {
  if (!Number.isFinite(unix) || unix <= 0) return '—'
  return new Date(unix * 1000).toLocaleString()
}

export function AdvancedPage({
  connectionStatus,
  coreVersion,
  controllerAddr,
  mixedPort,
  panel,
  deviceIdentity,
  connectivityBusy,
  connectivityResults,
  runtimeDiagEvents,
  advancedPaths,
  advancedGeo,
  toolsBusy,
  onCopyRuntimeTrace,
  error,
  onConnectivityCheck,
  onCopyHwid,
  onCopyAllIdentity,
  onOpenPath,
  onRestartCore,
  onResetSubscriptionCache,
  onReextractBundled,
  hwidEnabled,
  hwidSaving,
  onToggleHwid,
}: {
  connectionStatus: string
  coreVersion: string
  controllerAddr: string
  mixedPort: number | string
  profilePaths: main.ProfilePaths | null
  panel?: main.SubscriptionPanel
  deviceIdentity: main.SubscriptionDeviceIdentityPublic | null
  connectivityBusy: string | null
  connectivityResults: Partial<Record<ConnectivityTarget, string>>
  runtimeDiagEvents: main.RuntimeDiagEvent[]
  advancedPaths: main.AdvancedPaths | null
  advancedGeo: main.AdvancedGeoStatus | null
  toolsBusy: string | null
  onCopyRuntimeTrace: (serialized: string) => void
  error: string | null
  onConnectivityCheck: (target: ConnectivityTarget, url: string) => void
  onCopyHwid: () => void
  onCopyAllIdentity: () => void
  onRefreshProxies: () => void
  onRefreshHomeInsight: () => void
  onOpenPath: (path: string) => void
  onRestartCore: () => void
  onResetSubscriptionCache: () => void
  onReextractBundled: () => void
  hwidEnabled: boolean
  hwidSaving: boolean
  onToggleHwid: (next: boolean) => void
}) {
  const { t } = useTranslation()
  const targets: Array<[ConnectivityTarget, string, string]> = [
    ['google', 'Google', 'https://www.google.com/generate_204'],
    ['youtube', 'YouTube', 'https://www.youtube.com/generate_204'],
    ['telegram', 'Telegram', 'https://web.telegram.org'],
  ]
  const pathButtons: Array<[string | undefined, string]> = [
    [advancedPaths?.dataRoot, t('ui.advanced.openDataRoot')],
    [advancedPaths?.runtimeDir, t('ui.advanced.openRuntimeDir')],
    [advancedPaths?.activeConfig, t('ui.advanced.openActiveConfig')],
    [advancedPaths?.geoDir, t('ui.advanced.openGeoDir')],
    [advancedPaths?.profilesJson, t('ui.advanced.openProfilesJson')],
    [advancedPaths?.prefsJson, t('ui.advanced.openPrefsJson')],
    [advancedPaths?.debugLog, t('ui.advanced.openDebugLog')],
    [advancedPaths?.serviceLog, t('ui.advanced.openServiceLog')],
  ]
  const tools: Array<[string, string, string, () => void]> = [
    [
      'restartCore',
      t('ui.advanced.restartCore'),
      t('ui.advanced.restartCoreHint'),
      onRestartCore,
    ],
    [
      'resetSubCache',
      t('ui.advanced.resetSubCache'),
      t('ui.advanced.resetSubCacheHint'),
      onResetSubscriptionCache,
    ],
    [
      'reextract',
      t('ui.advanced.reextractBundled'),
      t('ui.advanced.reextractBundledHint'),
      onReextractBundled,
    ],
  ]
  const connected = /connect|подключ|已连接/i.test(String(connectionStatus))
  return (
    <div className="page adPage">
      <h2 className="srOnly">{t('advanced.title')}</h2>
      <p className="pageLead">{t('ui.advanced.lead')}</p>

      <div className="adGrid">
        <div className="adCol stagger">
          <Card className="adCard" style={{ '--i': 0 } as CSSProperties}>
            <h3 className="adCardTitle">{t('ui.advanced.diagnostics')}</h3>
            <div className="adCardBody">
              <div className="adKv">
                <KV
                  label={t('advanced.connection')}
                  value={
                    <span className="adBtnRow">
                      <span
                        className={`statusDot ${connected ? 'statusDotOk' : ''}`}
                        aria-hidden
                      />
                      {String(connectionStatus || '—')}
                    </span>
                  }
                />
                <KV
                  label={t('ui.advanced.coreVersion')}
                  value={String(coreVersion || '—')}
                />
                <KV
                  label={t('ui.advanced.controller')}
                  mono
                  value={String(controllerAddr || '—')}
                />
                <KV
                  label={t('ui.advanced.mixedPort')}
                  value={mixedPort || '—'}
                />
              </div>
              <p className="adNote">{t('ui.advanced.pathsMovedNote')}</p>
            </div>
          </Card>

          <CollapsibleCard
            index={1}
            title={t('ui.advanced.connectivityTools')}
            defaultOpen
          >
            <p className="adNote">{t('ui.advanced.connectivityLead')}</p>
            <div className="adBtnRow">
              {targets.map(([id, label, url]) => (
                <Button
                  key={id}
                  variant="tonal"
                  busy={connectivityBusy === id}
                  onClick={() => onConnectivityCheck(id, url)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="adChecks">
              {targets.map(([id, label]) => {
                const res = connectivityResults[id]
                const state =
                  connectivityBusy === id
                    ? 'busy'
                    : !res
                      ? 'idle'
                      : /^fail/i.test(res)
                        ? 'fail'
                        : 'ok'
                return (
                  <span key={id} className="adCheck" data-state={state}>
                    <strong>{label}</strong>
                    <span>{res ?? '—'}</span>
                  </span>
                )
              })}
            </div>
          </CollapsibleCard>

          <CollapsibleCard
            index={2}
            title={t('ui.advanced.deviceIdentity')}
            className="advancedDeviceIdentityCard"
          >
            <p className="adNote">{t('ui.advanced.deviceIdentityLead')}</p>
            {panel ? (
              <dl className="adFlags">
                {(
                  [
                    ['x-hwid-active', panel.hwidActive],
                    ['x-hwid-not-supported', panel.hwidNotSupported],
                    ['x-hwid-max-devices-reached', panel.hwidMaxDevicesReached],
                    ['x-hwid-limit', panel.hwidLimit],
                  ] as const
                )
                  .filter(([, value]) => value !== undefined)
                  .map(([name, value]) => (
                    <div className="adFlag" key={name}>
                      <dt>{name}</dt>
                      <dd>{t(value ? 'common.yes' : 'common.no')}</dd>
                    </div>
                  ))}
              </dl>
            ) : null}
            <div
              className="adHwid"
              data-disabled={hwidEnabled ? undefined : 'true'}
            >
              <div className="adHwidValue">{deviceIdentity?.hwid ?? '—'}</div>
              <div className="adBtnRow">
                <Button
                  size="extra-small"
                  disabled={!deviceIdentity?.hwid}
                  onClick={onCopyHwid}
                >
                  {t('ui.advanced.copyHwid')}
                </Button>
                <Button
                  size="extra-small"
                  variant="outlined"
                  disabled={!deviceIdentity}
                  onClick={onCopyAllIdentity}
                >
                  {t('ui.advanced.copyAllIdentity')}
                </Button>
              </div>
            </div>
            <SwitchRow
              label={t('ui.advanced.hwidSendToggle')}
              description={
                hwidEnabled
                  ? t('ui.advanced.hwidSendOn')
                  : t('ui.advanced.hwidSendOff')
              }
              checked={hwidEnabled}
              disabled={hwidSaving}
              onChange={onToggleHwid}
            />
            {!hwidEnabled ? (
              <p className="adNote">{t('ui.advanced.hwidSendOffNote')}</p>
            ) : null}
            <div className="adKv">
              <KV
                label={t('ui.advanced.identityDeviceOs')}
                mono
                value={deviceIdentity?.deviceOs ?? '—'}
              />
              <KV
                label={t('ui.advanced.identityOsVersion')}
                mono
                value={deviceIdentity?.osVersion ?? '—'}
              />
              <KV
                label={t('ui.advanced.identityDeviceModel')}
                mono
                value={deviceIdentity?.deviceModel ?? '—'}
              />
              <KV
                label={t('ui.advanced.identityAppVersion')}
                mono
                value={deviceIdentity?.appVersion ?? '—'}
              />
            </div>
          </CollapsibleCard>
        </div>

        <div className="adCol stagger">
          <CollapsibleCard
            index={0}
            title={t('ui.advanced.runtimeTrace')}
            className="advancedRuntimeTraceCard"
            actions={
              <Button
                size="extra-small"
                variant="outlined"
                disabled={runtimeDiagEvents.length === 0}
                onClick={() =>
                  onCopyRuntimeTrace(serializeTrace(runtimeDiagEvents))
                }
              >
                {t('ui.advanced.runtimeTraceCopy')}
              </Button>
            }
          >
            <p className="adNote">{t('ui.advanced.runtimeTraceLead')}</p>
            {runtimeDiagEvents.length === 0 ? (
              <p className="adNote">{t('ui.advanced.runtimeTraceEmpty')}</p>
            ) : (
              <div className="adTrace allowSelect">
                {runtimeDiagEvents
                  .slice(-TRACE_VISIBLE_LIMIT)
                  .reverse()
                  .map((ev) => (
                    <div
                      key={`${ev.ts}-${ev.category}-${ev.message ?? ''}`}
                      className="adTraceRow"
                    >
                      <span className="adTraceTime">
                        {formatTraceTimestamp(ev.ts)}
                      </span>
                      <span className="adTraceCat">{ev.category}</span>
                      {ev.message ? (
                        <span className="adTraceMsg">{ev.message}</span>
                      ) : null}
                    </div>
                  ))}
              </div>
            )}
          </CollapsibleCard>

          <CollapsibleCard index={1} title={t('ui.advanced.paths')}>
            <p className="adNote">{t('ui.advanced.pathsLead')}</p>
            <div className="adPaths">
              {pathButtons.map(([path, label]) => (
                <Button
                  key={label}
                  size="extra-small"
                  variant="outlined"
                  disabled={!path}
                  onClick={() => onOpenPath(path ?? '')}
                >
                  {label}
                </Button>
              ))}
            </div>
          </CollapsibleCard>

          <CollapsibleCard index={2} title={t('ui.advanced.geoStatus')}>
            <p className="adNote">{t('ui.advanced.geoStatusLead')}</p>
            {!advancedGeo?.geoIpPath && !advancedGeo?.geoSitePath ? (
              <p className="adNote">{t('ui.advanced.geoNotExtracted')}</p>
            ) : (
              <div className="adKv">
                <KV
                  label={t('ui.advanced.geoIpLabel')}
                  mono
                  value={`${formatBytes(advancedGeo?.geoIpSize ?? 0)} · ${formatModified(advancedGeo?.geoIpModified ?? 0)}`}
                />
                <KV
                  label={t('ui.advanced.geoSiteLabel')}
                  mono
                  value={`${formatBytes(advancedGeo?.geoSiteSize ?? 0)} · ${formatModified(advancedGeo?.geoSiteModified ?? 0)}`}
                />
              </div>
            )}
          </CollapsibleCard>

          <CollapsibleCard index={3} title={t('ui.advanced.tools')} defaultOpen>
            <p className="adNote">{t('ui.advanced.toolsLead')}</p>
            <div className="adTools">
              {tools.map(([id, label, hint, run]) => (
                <div className="adTool" key={id}>
                  <Button
                    size="extra-small"
                    variant="tonal"
                    busy={toolsBusy === id}
                    onClick={run}
                  >
                    {label}
                  </Button>
                  <span>{hint}</span>
                </div>
              ))}
            </div>
          </CollapsibleCard>
        </div>
      </div>

      {import.meta.env.DEV ? <BrandDebugPanel /> : null}

      {error ? (
        <p className="inlineError" role="alert">
          {friendlyErrorMessage(error)}
        </p>
      ) : null}
    </div>
  )
}

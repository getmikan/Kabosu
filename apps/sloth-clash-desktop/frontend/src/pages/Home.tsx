import { AnimatePresence, motion } from 'motion/react'
import { type CSSProperties, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyTunDiagnostics } from '../api/diagnostics'
import type { main } from '../api/models'
import { FlagMark } from '../components/FlagMark'
import { MaterialSymbol } from '../components/MaterialSymbol'
import { ServerGroups } from '../components/ServerGroups'
import { SubscriptionStats } from '../components/SubscriptionStats'
import {
  Button,
  Card,
  Expansion,
  IconButton,
  Loading,
  Segmented,
  Select,
  Shape,
  type ShapeName,
} from '../ui/M3'
import { formatSpeedKbps } from '../utils/format'
import {
  decodeSubscriptionAnnouncementDisplay,
  extractNodeFlagIso,
  filterProxyNodesForDisplay,
  isUnsafeGroupName,
  proxyNodeLabelBesideFlag,
} from '../utils/proxyNames'

import '../styles/home.css'

// Provider notice shown inside the subscription card, right under the quota
// numbers it usually talks about. Height-bounded with internal scroll so a
// long announcement never pushes the connect button off screen.
function SubscriptionAnnouncement({
  text,
  url,
  onOpen,
}: {
  text: string
  url?: string
  onOpen: (url: string) => void
}) {
  const { t } = useTranslation()
  const trimmed = text.trim()
  if (!trimmed) return null
  return (
    <div className="homeAnnouncement" role="note">
      <span className="homeAnnouncementIcon" aria-hidden>
        <MaterialSymbol name="help" />
      </span>
      <div className="homeAnnouncementBody">
        <strong>{t('ui.home.subscriptionAnnouncement')}</strong>
        <p className="homeAnnouncementText allowSelect">
          {decodeSubscriptionAnnouncementDisplay(trimmed)}
        </p>
      </div>
      {url ? (
        <Button variant="text" size="extra-small" onClick={() => onOpen(url)}>
          {t('settings.operatorHelp')}
        </Button>
      ) : null}
    </div>
  )
}

// The orb behind the connect button keeps morphing between two outlines of
// the current state, so the hero is alive even while the user just looks.
const ORB_SHAPES: Record<string, [ShapeName, ShapeName]> = {
  idle: ['9-sided-cookie', '12-sided-cookie'],
  connecting: ['soft-burst', 'burst'],
  connected: ['sunny', 'very-sunny'],
  broken: ['puffy-diamond', 'pentagon'],
  error: ['puffy-diamond', 'pentagon'],
}

function ConnectOrb({
  visual,
  busy,
  hasAnyProfile,
  connected,
  label,
  onClick,
}: {
  visual: string
  busy: boolean
  hasAnyProfile: boolean
  connected: boolean
  label: string
  onClick: () => void
}) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setPhase((p) => p + 1), 3200)
    return () => window.clearInterval(id)
  }, [])
  const pair = ORB_SHAPES[visual] ?? ORB_SHAPES.idle
  return (
    <div className="connectOrb" data-visual={visual}>
      {connected ? (
        <>
          <span className="connectRing" />
          <span className="connectRing" style={{ animationDelay: '1.3s' }} />
        </>
      ) : null}
      <Shape className="connectOrbHalo" name={pair[(phase + 1) % 2]} />
      <Shape className="connectOrbShape" name={pair[phase % 2]} />
      <motion.button
        className="connectBtn"
        type="button"
        data-tour="connect"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 520, damping: 22 }}
        disabled={busy}
        aria-busy={busy}
        aria-label={label}
        onClick={onClick}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={busy ? 'busy' : !hasAnyProfile ? 'add' : connected ? 'on' : 'off'}
            className="connectGlyph"
            initial={{ opacity: 0, scale: 0.6, rotate: -45 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6, rotate: 45 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
          >
            {busy ? (
              <Loading className="connectLoader" label={label} />
            ) : (
              <MaterialSymbol
                name={!hasAnyProfile ? 'add' : connected ? 'pause' : 'power'}
              />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  )
}

function StatusRow({
  label,
  children,
  tour,
}: {
  label: string
  children: React.ReactNode
  tour?: string
}) {
  return (
    <div className="statusRow" data-tour={tour}>
      <span className="statusRowLabel">{label}</span>
      <div className="statusRowValue">{children}</div>
    </div>
  )
}

function FlagValue({ iso, text, title }: { iso?: string; text?: string; title?: string }) {
  if (!iso && !text) return <span className="muted">—</span>
  return (
    <span className="flagValue" title={title}>
      {iso ? <FlagMark iso2={iso} width={20} height={14} /> : null}
      {text ? <strong>{text}</strong> : null}
    </span>
  )
}

export type HomeUpdateSnap = { hasUpdate?: boolean }

export type HomeActiveNodeVisual = { iso: string; text: string }

export function HomePage({
  state,
  activeProfile,
  service,
  linkToast,
  error,
  updateSnap,
  homeUpdateTooltip,
  homeAlertTooltip,
  hasAnyProfile,
  displayMode,
  displayTraffic,
  connectBusy,
  connectVisual,
  connectionLabel,
  showProtectedBadge,
  homeTrafficHealthSubtitle,
  nodePickerGroup,
  proxyGroups,
  pickerGroupName,
  activeNode,
  activeNodeVisual,
  showBuiltinProxyGroups,
  hideGlobalMode,
  hideProxyMode,
  brandName,
  brandLogo,
  onOpenOperator,
  onOpenImport,
  onOpenSupport,
  onOpenUpdate,
  onOpenProfiles,
  onOpenProxies,
  onRefreshProfile,
  profileRefreshBusy,
  onSetMode,
  onSwitchTraffic,
  corpConnected,
  onOpenCorp,
  onConnectClick,
  onInstallService,
  onRefreshService,
  onSelectGroup,
  onSelectNode,
}: {
  state: any
  activeProfile: any
  service: main.ServiceState | null | undefined
  linkToast: string
  error: string | null
  updateSnap: HomeUpdateSnap | null | undefined
  homeUpdateTooltip: string
  homeAlertTooltip: string
  hasAnyProfile: boolean
  displayMode: string
  displayTraffic: string
  connectBusy: boolean
  connectVisual: string
  connectionLabel: string
  showProtectedBadge: boolean
  homeTrafficHealthSubtitle: string
  nodePickerGroup: any
  /** Live groups, or the profile's own groups while the core is off. */
  proxyGroups: any[]
  /** Group the Home picker edits (user pick or first selector). */
  pickerGroupName: string
  activeNode: string
  activeNodeVisual: HomeActiveNodeVisual
  showBuiltinProxyGroups: boolean
  // Brand hide flags (presentation-only; see brand-headers-protocol).
  hideGlobalMode?: boolean
  hideProxyMode?: boolean
  // Operator button (brand manifest); empty name = no brand, button hidden.
  brandName?: string
  brandLogo?: string
  onOpenOperator: () => void
  onOpenImport: (reason: 'beacon' | 'manual') => void
  onOpenSupport: (url: string) => void
  onOpenUpdate: () => void
  onOpenProfiles: () => void
  onOpenProxies: () => void
  onRefreshProfile: () => void
  profileRefreshBusy: boolean
  onSetMode: (mode: 'rule' | 'global') => void
  onSwitchTraffic: (mode: 'proxy' | 'tun') => void
  // Corporate VPN (optional feature): show a small live indicator only when it
  // is connected; nothing at all otherwise.
  corpConnected?: boolean
  onOpenCorp?: () => void
  onConnectClick: () => void
  onInstallService: () => void
  onRefreshService: () => void
  onSelectGroup: (name: string) => void
  onSelectNode: (group: string, node: string) => void
}) {
  const { t } = useTranslation()
  const [diagCopied, setDiagCopied] = useState(false)
  const onCopyDiagnostics = async () => {
    try {
      const text = await CopyTunDiagnostics()
      await navigator.clipboard.writeText(text)
      setDiagCopied(true)
      setTimeout(() => setDiagCopied(false), 2000)
    } catch {
      // clipboard or binding unavailable — ignore; the connection error itself stays visible
    }
  }
  const connectionStatus = state?.connection?.status ?? ''
  const connected = connectionStatus === 'connected'
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      connected ? 1000 : 60000,
    )
    return () => window.clearInterval(timer)
  }, [connected])
  const since = Number(state?.connection?.since ?? 0)
  const seconds =
    connected && since > 0 ? Math.max(0, Math.floor(now / 1000) - since) : 0
  const duration = [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')

  const lastConnectionError =
    connectionStatus === 'error'
      ? String(state?.connection?.lastError ?? '')
      : ''
  const errorLines: string[] = (() => {
    if (lastConnectionError && error === lastConnectionError) {
      return [lastConnectionError]
    }
    const lines: string[] = []
    if (error) lines.push(error)
    if (lastConnectionError && lastConnectionError !== error) {
      lines.push(lastConnectionError)
    }
    return lines
  })()

  const supportUrl = String(
    (activeProfile?.panel?.brand?.supportUrl ||
      activeProfile?.subscriptionSupportUrl) ??
      '',
  ).trim()
  const trafficError = Boolean(state?.insight?.trafficError)
  const upload = trafficError
    ? '—'
    : formatSpeedKbps(state?.insight?.uploadKbps ?? 0)
  const download = trafficError
    ? '—'
    : formatSpeedKbps(state?.insight?.downloadKbps ?? 0)
  const latency = Number(state?.insight?.nodeLatencyMs ?? 0)
  const exitTitle =
    [state?.insight?.exitLine, state?.insight?.exitIp]
      .map((s) => String(s ?? '').trim())
      .filter(Boolean)
      .join(' · ') || undefined
  const ruleMode = String(state?.mode?.current ?? '') === 'rule'

  const groupOptions = proxyGroups
    .filter((g: any) => {
      const name = String(g?.name ?? '')
      if (isUnsafeGroupName(name)) return false
      // GLOBAL is mihomo's catch-all selector used only in Global mode; in
      // Rule mode it is dead weight and confuses the active-group pick.
      if (displayMode === 'rule' && name.toUpperCase() === 'GLOBAL')
        return false
      return true
    })
    .map((g: any) => ({ value: String(g.name), label: String(g.name) }))
  const nodeOptions = nodePickerGroup
    ? filterProxyNodesForDisplay(
        (nodePickerGroup.proxies ?? []) as string[],
        showBuiltinProxyGroups,
        String(nodePickerGroup.selected ?? ''),
      ).map((p: string) => ({
        value: p,
        label: (
          <span className="flagValue">
            <FlagMark iso2={extractNodeFlagIso(p)} width={16} height={11} />
            {proxyNodeLabelBesideFlag(p)}
          </span>
        ),
      }))
    : []

  return (
    <div className="home" data-connected={connected}>
      <AnimatePresence>
        {linkToast ? (
          <motion.p
            className="homeLinkToast"
            role="status"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {linkToast}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <div className="homeTopRow stagger">
        <button
          type="button"
          className="profilePicker"
          style={{ '--i': 0 } as CSSProperties}
          onClick={hasAnyProfile ? onOpenProfiles : () => onOpenImport('manual')}
        >
          <span className="profilePickerIcon">
            <MaterialSymbol name="profiles" />
          </span>
          <span className="profilePickerText">
            <span className="profilePickerEyebrow">
              {hasAnyProfile
                ? activeProfile?.type === 'subscription'
                  ? t('ui.common.subscription')
                  : t('ui.common.local')
                : t('expressive.start')}
            </span>
            <strong>
              {activeProfile?.name || t('expressive.chooseProfile')}
            </strong>
          </span>
          <MaterialSymbol name="chevron" className="chevronForward" />
        </button>
        <div className="homeTopActions" style={{ '--i': 1 } as CSSProperties}>
          {brandName ? (
            <Button
              variant="tonal"
              className="providerIdentity"
              icon={brandLogo ? <img src={brandLogo} alt="" /> : 'corp'}
              onClick={onOpenOperator}
            >
              {brandName}
            </Button>
          ) : null}
          {updateSnap?.hasUpdate ? (
            <Button
              variant="filled"
              icon="download"
              title={homeUpdateTooltip}
              onClick={onOpenUpdate}
            >
              {t('ui.home.updateAvailable')}
            </Button>
          ) : null}
          {corpConnected ? (
            <Button variant="tonal" icon="corp" onClick={() => onOpenCorp?.()}>
              {t('corp.homeIndicator')}
            </Button>
          ) : null}
          <IconButton
            variant="tonal"
            className={profileRefreshBusy ? 'isSpinning' : undefined}
            icon="refresh"
            label={t('ui.connections.refresh')}
            disabled={
              !activeProfile?.id ||
              activeProfile?.type !== 'subscription' ||
              profileRefreshBusy
            }
            onClick={onRefreshProfile}
          />
        </div>
      </div>

      {hasAnyProfile ? (
        <Card className="homeStats">
          <SubscriptionStats profile={activeProfile} />
          {activeProfile?.type === 'subscription' ? (
            <SubscriptionAnnouncement
              url={activeProfile?.panel?.announcementUrl}
              onOpen={onOpenSupport}
              key={String(activeProfile?.id ?? '')}
              text={String(activeProfile?.subscriptionAnnouncement ?? '')}
            />
          ) : null}
        </Card>
      ) : null}
      <ServerGroups
        metadata={activeProfile?.panel?.groups}
        pageUrl={
          activeProfile?.panel?.brand?.cabinetUrl ||
          activeProfile?.panel?.webPageUrl
        }
        onOpen={onOpenSupport}
      />
      {activeProfile?.panel?.hwidMaxDevicesReached ||
      activeProfile?.panel?.hwidLimit ? (
        <p className="inlineWarning" role="status">
          {t('panel.deviceLimit')}
        </p>
      ) : null}
      {activeProfile?.panel?.hwidNotSupported ? (
        <p className="inlineWarning">{t('panel.hwidUnsupported')}</p>
      ) : null}

      <section className="homeCanvas" aria-label={t('expressive.overview')}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={connectionLabel}
            className="connectionHeadline"
            data-ready={showProtectedBadge || undefined}
            role="status"
            initial={{ opacity: 0, y: 6, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.94 }}
          >
            <span className="connectionHeadlineDot" />
            {connectionLabel}
            {homeAlertTooltip ? (
              <span
                className="homeAlertBadge"
                title={homeAlertTooltip}
                aria-label={homeAlertTooltip}
              >
                !
              </span>
            ) : null}
          </motion.div>
        </AnimatePresence>
        <ConnectOrb
          visual={connectVisual}
          busy={connectBusy}
          hasAnyProfile={hasAnyProfile}
          connected={connected}
          label={
            !hasAnyProfile
              ? t('expressive.addProfile')
              : connected
                ? t('ui.home.disconnect')
                : t('ui.home.connect')
          }
          onClick={onConnectClick}
        />
        <div
          className="connectionDuration"
          aria-label={t('expressive.session')}
          data-live={connected || undefined}
        >
          {duration}
        </div>
        <div className="connectionTransfer">
          <span className="connectionSpeed" title={t('expressive.upload')}>
            <MaterialSymbol name="upload" />
            {upload}
          </span>
          {homeTrafficHealthSubtitle ? (
            <span className="homeTrafficHealth">
              {homeTrafficHealthSubtitle}
            </span>
          ) : null}
          <span className="connectionSpeed" title={t('expressive.download')}>
            <MaterialSymbol name="download" />
            {download}
          </span>
        </div>
        {!hasAnyProfile ? (
          <p className="connectionEmptyHint">{t('expressive.importBody')}</p>
        ) : null}
        {hasAnyProfile && groupOptions.length > 0 ? (
          <div className="homePicker" data-tour="server">
            <Select
              className="homePickerGroup"
              label={t('ui.home.pickGroup')}
              ariaLabel={t('ui.home.activeProxyGroupAria')}
              value={pickerGroupName}
              options={groupOptions}
              onChange={(v) => {
                if (v && v !== pickerGroupName) onSelectGroup(v)
              }}
            />
            {nodePickerGroup && nodeOptions.length ? (
              <Select
                className="homePickerNode"
                label={t('ui.home.activeNode')}
                ariaLabel={t('ui.home.activeNode')}
                value={String(nodePickerGroup.selected ?? '')}
                options={nodeOptions}
                onChange={(p) => {
                  if (p && p !== nodePickerGroup.selected)
                    onSelectNode(String(nodePickerGroup.name), p)
                }}
              />
            ) : null}
            <IconButton
              variant="tonal"
              size="medium"
              icon="proxies"
              label={t('expressive.chooseServer')}
              onClick={onOpenProxies}
            />
          </div>
        ) : null}
        <div className="homeCanvasActions">
          {!hasAnyProfile ? (
            <Button
              variant="filled"
              size="medium"
              icon="add"
              onClick={() => onOpenImport('beacon')}
            >
              {t('ui.home.addSubscription')}
            </Button>
          ) : null}
          {supportUrl ? (
            <Button
              variant="text"
              icon="help"
              title={supportUrl}
              onClick={() => onOpenSupport(supportUrl)}
            >
              {t('ui.home.supportShort')}
            </Button>
          ) : null}
        </div>
      </section>

      <Expansion
        className="homeDetails"
        icon="advanced"
        header={t('expressive.connectionDetails')}
      >
        <div className="homeDetailsBody">
          <div className="homeModeRow">
            <div className="homeModeCell" data-tour="mode">
              <span className="homeModeLabel">{t('ui.home.mode')}</span>
              <Segmented
                ariaLabel={t('ui.home.routingModeAria')}
                value={displayMode === 'global' && !hideGlobalMode ? 'global' : 'rule'}
                onChange={(m) => onSetMode(m)}
                options={[
                  {
                    value: 'rule' as const,
                    label: t('ui.common.rule'),
                    title: t('ui.home.ruleTitle'),
                  },
                  // Hide-Global-Mode drops the Global option, not the control:
                  // the user still needs to see which mode is active.
                  ...(hideGlobalMode
                    ? []
                    : [
                        {
                          value: 'global' as const,
                          label: t('ui.common.global'),
                          title: t('ui.home.globalTitle'),
                        },
                      ]),
                ]}
              />
            </div>
            <div className="homeModeCell" data-tour="traffic">
              <span className="homeModeLabel">{t('ui.home.traffic')}</span>
              <Segmented
                ariaLabel={t('ui.home.trafficModeAria')}
                value={hideProxyMode || displayTraffic === 'tun' ? 'tun' : 'proxy'}
                onChange={(m) => onSwitchTraffic(m)}
                options={[
                  // Like Hide-Global-Mode: drops the Proxy option (TUN-only
                  // deployment), keeps the control so the state stays visible.
                  ...(hideProxyMode
                    ? []
                    : [
                        {
                          value: 'proxy' as const,
                          label: t('ui.common.proxy'),
                          title: t('ui.home.systemProxyTitle'),
                        },
                      ]),
                  {
                    value: 'tun' as const,
                    label: 'TUN',
                    title: t('ui.home.tunTitle'),
                  },
                ]}
              />
            </div>
          </div>

          <div className="homeStatusGrid">
            <div className="statusCard">
              <StatusRow label={t('ui.home.service')} tour="service">
                {!service?.installed ? (
                  <Button variant="tonal" size="extra-small" onClick={onInstallService}>
                    {t('settings.installService')}
                  </Button>
                ) : null}
                <span
                  className={
                    service?.installed
                      ? 'statusDot statusDotOk'
                      : 'statusDot statusDotBad'
                  }
                  title={
                    service?.installed
                      ? t('ui.home.installed')
                      : t('ui.home.notInstalled')
                  }
                  aria-label={
                    service?.installed
                      ? t('ui.home.installed')
                      : t('ui.home.notInstalled')
                  }
                  role="img"
                />
              </StatusRow>
              {service?.installed &&
              (!service?.running || String(service?.lastError ?? '').trim()) ? (
                <div className="serviceIssue">
                  <p>
                    {String(service?.lastError ?? '').trim()
                      ? String(service.lastError).trim()
                      : t('ui.home.serviceStoppedHint')}
                  </p>
                  <Button variant="text" size="extra-small" onClick={onRefreshService}>
                    {t('ui.home.serviceRetry')}
                  </Button>
                </div>
              ) : null}
              <StatusRow label={t('ui.home.pickGroup')}>
                <strong>{pickerGroupName || '—'}</strong>
              </StatusRow>
              <StatusRow label={t('ui.home.activeNode')}>
                <FlagValue
                  iso={activeNodeVisual.iso}
                  text={activeNodeVisual.text || activeNode}
                />
              </StatusRow>
              <StatusRow label="Core">
                <span
                  className={
                    state?.core?.running
                      ? 'statusDot statusDotOk'
                      : 'statusDot statusDotBad'
                  }
                  title={state?.core?.running ? 'Running' : 'Not running'}
                  aria-label={state?.core?.running ? 'Running' : 'Not running'}
                  role="img"
                />
              </StatusRow>
            </div>

            <div className="statusCard">
              <StatusRow label={t('ui.home.insightLatency')}>
                <strong
                  className="mono"
                  title={
                    latency <= 0 && state?.insight?.latencyError
                      ? state.insight.latencyError
                      : undefined
                  }
                >
                  {latency > 0 ? `${latency} ms` : '—'}
                </strong>
              </StatusRow>
              <StatusRow label={t('ui.home.insightExit')}>
                {state?.insight?.exitFlagIso2 ? (
                  <FlagValue
                    iso={String(state.insight.exitFlagIso2)}
                    text={state?.insight?.exitIp}
                    title={exitTitle}
                  />
                ) : state?.insight?.lastError ? (
                  <span className="muted small statusErr">
                    {state.insight.lastError}
                  </span>
                ) : (
                  <FlagValue text={state?.insight?.exitIp} title={exitTitle} />
                )}
              </StatusRow>
              <StatusRow label={t('ui.home.insightDirect')}>
                {ruleMode && state?.insight?.directError && !state?.insight?.directFlagIso2 ? (
                  <span className="muted small statusErr">
                    {state.insight.directError}
                  </span>
                ) : ruleMode ? (
                  <FlagValue
                    iso={state?.insight?.directFlagIso2}
                    text={state?.insight?.directIp}
                  />
                ) : (
                  <span className="muted">—</span>
                )}
              </StatusRow>
              <StatusRow label={t('ui.home.insightSpeed')}>
                <span className="speedRow" title={state?.insight?.trafficError || undefined}>
                  <span className="speedChip">↑ {upload}</span>
                  <span className="speedChip">↓ {download}</span>
                </span>
              </StatusRow>
            </div>
          </div>
        </div>
      </Expansion>

      {errorLines.length ? (
        <div className="inlineError homeConnError" role="alert">
          <MaterialSymbol name="error" />
          <p>{errorLines.join(' · ')}</p>
          <Button
            variant="text"
            size="extra-small"
            title={t('ui.home.copyDiagnosticsHint')}
            onClick={onCopyDiagnostics}
          >
            {diagCopied
              ? t('ui.home.diagnosticsCopied')
              : t('ui.home.copyDiagnostics')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

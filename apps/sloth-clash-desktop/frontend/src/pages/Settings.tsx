import { type CSSProperties, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { main } from '../api/models'
import {
  MaterialSymbol,
  type MaterialSymbolName,
} from '../components/MaterialSymbol'
import type { SettingsResetMode } from '../components/SettingsResetModal'
import { APP_DOWNLOADS_URL, APP_REPO_URL } from '../constants'
import { useCoreBuild } from '../hooks/queries/useCoreBuild'
import '../styles/settings.css'
import type { CompactSettings } from '../types/app'
import {
  Button,
  Expansion,
  IconButton,
  Progress,
  Segmented,
  Select,
  Shape,
  SwitchRow,
  TextField,
} from '../ui/M3'
import {
  STOCK_ACCENTS,
  ensureReadableAccent,
  normalizeHex,
} from '../utils/accent'
import { UI_SCALE_OPTIONS } from '../utils/settings'
import { friendlyErrorMessage } from '../utils/yaml'

export type ThemeMode = 'dark' | 'light' | 'system'
export type Lang = 'en' | 'ru' | 'zh'

// Quick-pick accents next to the free colour picker. Stored as raw hex like
// any custom accent; the contrast guard still decides what renders per theme.
const ACCENT_PRESETS = [
  '#b8d78b',
  '#4a662b',
  '#6750a4',
  '#0b6bcb',
  '#00796b',
  '#c2185b',
  '#e65100',
  '#8d6e63',
] as const

function SectionHead({
  icon,
  children,
}: {
  icon: MaterialSymbolName
  children: ReactNode
}) {
  return (
    <h3 className="stCardTitle">
      <span className="stIcon" aria-hidden>
        <MaterialSymbol name={icon} />
      </span>
      {children}
    </h3>
  )
}

// "Lock port" row: pins the local mixed-port to a fixed value so external tools
// pointed at 127.0.0.1:<port> keep working across reconnects / subscription
// switches. 0 = auto (random free port each start, the default). The number
// input commits on blur / Enter (not per keystroke) since a change rebinds the
// core. Turning the lock on pins the currently-running port.
function PortLockRow({
  mixedPort,
  runningMixedPort,
  onSetMixedPort,
}: {
  mixedPort: number
  runningMixedPort: number
  onSetMixedPort: (next: number) => void
}) {
  const { t } = useTranslation()
  const locked = mixedPort > 0
  const [draft, setDraft] = useState<string>(locked ? String(mixedPort) : '')

  const commit = () => {
    const v = parseInt(draft, 10)
    if (!Number.isNaN(v) && v >= 1 && v <= 65535) {
      if (v !== mixedPort) onSetMixedPort(v)
    } else {
      setDraft(String(mixedPort)) // revert invalid input to the pinned value
    }
  }

  const toggle = () => {
    if (locked) {
      setDraft('')
      onSetMixedPort(0)
    } else {
      const p =
        runningMixedPort >= 1 && runningMixedPort <= 65535
          ? runningMixedPort
          : 7890
      setDraft(String(p))
      onSetMixedPort(p)
    }
  }

  return (
    <>
      <SwitchRow
        label={t('settings.lockPort')}
        checked={locked}
        onChange={toggle}
      />
      {locked ? (
        <TextField
          className="stPortField"
          type="number"
          min={1}
          max={65535}
          label={t('settings.lockPortValue')}
          value={draft}
          onChange={setDraft}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
      ) : null}
    </>
  )
}

// REALITY preferences use native Citrus node options; Auto preserves node/core
// defaults. Saving reapplies the runtime configuration.
function isValidRealityVersion(raw: string): boolean {
  const v = raw.trim()
  if (v === '') return true
  const m = v.match(/^v?(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  return !!m && m.slice(1).every((p) => Number(p) <= 255)
}

function RealityCard({
  prefs,
  onCommit,
}: {
  prefs: main.RealitySettings
  onCommit: (patch: Partial<main.RealitySettings>) => void
}) {
  const { t } = useTranslation()
  const saved = prefs.clientVersion ?? ''
  const [draft, setDraft] = useState<string>(saved)
  // Adjust-during-render (not an effect): a saved value from the backend
  // (normalized, or reset) resyncs the text draft.
  const [lastSaved, setLastSaved] = useState(saved)
  if (saved !== lastSaved) {
    setLastSaved(saved)
    setDraft(saved)
  }
  const invalid = !isValidRealityVersion(draft)
  const commit = () => {
    if (invalid) {
      setDraft(saved) // revert invalid input to the saved value
      return
    }
    if (draft.trim() !== saved) onCommit({ clientVersion: draft.trim() })
  }
  return (
    <Expansion icon="shield" header={t('settings.reality.title')}>
      <div className="stBody">
        <Select
          label={t('settings.reality.mlkem')}
          value={prefs.mlkem || 'auto'}
          onChange={(v) => onCommit({ mlkem: v })}
          options={[
            { value: 'auto', label: t('settings.reality.mlkemAuto') },
            { value: 'always', label: t('settings.reality.mlkemAlways') },
            { value: 'never', label: t('settings.reality.mlkemNever') },
          ]}
        />
        <TextField
          label={t('settings.reality.clientVersion')}
          value={draft}
          placeholder={t('settings.reality.clientVersionPlaceholder')}
          spellCheck={false}
          error={
            invalid ? t('settings.reality.clientVersionInvalid') : undefined
          }
          onChange={setDraft}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <p className="muted stHint">{t('settings.reality.hint')}</p>
        <p className="muted stHint">{t('settings.reality.applyHint')}</p>
      </div>
    </Expansion>
  )
}

// Accent colour field: preset tiles + picker + hex input + per-theme applied
// previews + reset. The stored value is the raw user hex; previews show what
// actually renders after the contrast guard per theme.
function AccentField({
  accent,
  onSetAccent,
}: {
  accent: string | null
  onSetAccent: (hex: string | null) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string>(accent ?? '')
  // Adjust-during-render (not an effect): external accent changes — e.g. the
  // app-wide settings reset — resync the text draft.
  const [lastAccent, setLastAccent] = useState(accent)
  if (accent !== lastAccent) {
    setLastAccent(accent)
    setDraft(accent ?? '')
  }
  const normalized = normalizeHex(draft)
  const invalid = draft.trim() !== '' && !normalized
  const pickerValue = normalized ?? accent ?? STOCK_ACCENTS.dark
  const darkApplied = ensureReadableAccent(accent ?? STOCK_ACCENTS.dark, 'dark')
  const lightApplied = ensureReadableAccent(
    accent ?? STOCK_ACCENTS.light,
    'light',
  )
  const commit = (raw: string) => {
    setDraft(raw)
    const hex = normalizeHex(raw)
    if (hex) onSetAccent(hex)
  }
  const current = normalizeHex(accent)
  return (
    <div className="stField">
      <span className="stFieldLabel">{t('settings.accent')}</span>
      <div
        className="stSwatches"
        role="radiogroup"
        aria-label={t('settings.accent')}
      >
        {ACCENT_PRESETS.map((hex) => {
          const selected = current === hex
          return (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={hex}
              title={hex}
              className="stSwatch"
              data-selected={selected || undefined}
              onClick={() => commit(hex)}
            >
              <Shape
                name={selected ? 'flower' : 'circle'}
                style={{ '--m3e-shape-container-color': hex } as CSSProperties}
              />
              {selected ? (
                <span className="stSwatchCheck" aria-hidden>
                  <MaterialSymbol name="check" />
                </span>
              ) : null}
            </button>
          )
        })}
        <label className="stSwatch stSwatchCustom" title={t('settings.accent')}>
          <Shape name="square" />
          <input
            type="color"
            className="stColorInput"
            value={pickerValue}
            aria-label={t('settings.accent')}
            onChange={(e) => commit(e.target.value)}
          />
        </label>
      </div>
      <div className="stAccentRow">
        <TextField
          className="stHexField"
          value={draft}
          placeholder={t('settings.accentHexPlaceholder')}
          spellCheck={false}
          ariaLabel={t('settings.accent')}
          error={invalid ? t('settings.accentInvalid') : undefined}
          onChange={commit}
        />
        <span
          className="stPreview"
          style={{ background: darkApplied }}
          title={t('settings.accentPreviewDark')}
          aria-hidden
        />
        <span
          className="stPreview stPreviewLight"
          style={{ background: lightApplied }}
          title={t('settings.accentPreviewLight')}
          aria-hidden
        />
        {accent ? (
          <Button
            variant="text"
            onClick={() => {
              onSetAccent(null)
              setDraft('')
            }}
          >
            {t('settings.accentReset')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

const GITHUB_ICON = (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
    <path
      fill="currentColor"
      d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
    />
  </svg>
)

export function SettingsPage({
  theme,
  accent,
  onSetAccent,
  lang,
  settings,
  settingsBusy,
  trayAvailable,
  trayIconStyle,
  onSetTrayIconStyle,
  tunStackValue,
  tunPrefs,
  trafficPrefs,
  tunBanner,
  onDismissBanner,
  allowLan,
  onSetAllowLan,
  dnsIpv6,
  onSetDnsIpv6,
  smartDns,
  onSetSmartDns,
  mixedPort,
  runningMixedPort,
  onSetMixedPort,
  realityPrefs,
  onSetReality,
  state,
  updateSnap,
  error,
  onBrowserOpen,
  onSetTheme,
  onSetLang,
  onSetSetting,
  onSetUiPref,
  onSetLaunchOnStartup,
  onInstallService,
  serviceInfo,
  onEnsureTun,
  onShowTunModal,
  onApplyDefaultAutoUpdate,
  onRefreshAllSubs,
  onExportDiagnostics,
  onClearCache,
  onOpenResetModal,
  onCheckUpdates,
  onApplyUpdate,
  updateProgress,
  appUpdateEnabled,
  onToggleAppUpdate,
  corpVpnEnabled,
  onToggleCorpVpn,
}: {
  theme: ThemeMode
  lang: Lang
  settings: CompactSettings
  settingsBusy: boolean
  trayAvailable: boolean
  // Backend-owned (prefs.json): '' = platform default, 'colorful' | 'mono'.
  trayIconStyle: string
  onSetTrayIconStyle: (style: string) => void
  tunStackValue: string
  tunPrefs: main.TunSettings
  trafficPrefs: main.TrafficSettings
  tunBanner: string
  onDismissBanner: () => void
  // Backend-owned (prefs.json): opens the local proxy to the LAN.
  allowLan: boolean
  onSetAllowLan: (next: boolean) => void
  dnsIpv6: boolean
  onSetDnsIpv6: (next: boolean) => void
  smartDns: boolean
  onSetSmartDns: (next: boolean) => void
  // Fixed mixed-port ("lock port"): 0 = auto/random, 1–65535 = pinned.
  mixedPort: number
  runningMixedPort: number
  onSetMixedPort: (next: number) => void
  // Backend-owned (prefs.json): REALITY key-share mode + client version.
  realityPrefs: main.RealitySettings
  onSetReality: (patch: Partial<main.RealitySettings>) => void
  state: any
  updateSnap: any
  error: string | null
  onBrowserOpen: (url: string) => void
  onSetTheme: (theme: ThemeMode) => void
  // Custom accent: raw #rrggbb or null = built-in; null resets.
  accent: string | null
  onSetAccent: (hex: string | null) => void
  onSetLang: (lang: Lang) => void
  onSetSetting: <K extends keyof CompactSettings>(
    key: K,
    value: CompactSettings[K],
  ) => void
  // Backend-owned (prefs.json) startup/window toggles — written atomically
  // by Go rather than cached in localStorage.
  onSetUiPref: (
    key: 'startMinimized' | 'autoConnectOnStartup' | 'closeToTray',
    value: boolean,
  ) => void
  onSetLaunchOnStartup: (next: boolean) => void
  onInstallService: () => void
  serviceInfo: main.ServiceRuntimeInfo | null
  onEnsureTun: () => void
  onShowTunModal: () => void
  onApplyDefaultAutoUpdate: () => void
  onRefreshAllSubs: () => void
  onExportDiagnostics: () => void
  onClearCache: () => void
  onOpenResetModal: (mode: SettingsResetMode) => void
  onCheckUpdates: () => void
  onApplyUpdate: () => void
  updateProgress: { downloaded: number; total: number; pct: number } | null
  appUpdateEnabled: boolean
  onToggleAppUpdate: (next: boolean) => void
  corpVpnEnabled: boolean
  onToggleCorpVpn: (next: boolean) => void
}) {
  const { t } = useTranslation()
  const coreBuild = useCoreBuild()
  const tristate = (v: boolean | undefined) =>
    v === undefined ? t('settings.tun.inherit') : v ? t('common.on') : t('common.off')
  const hasAsset = Boolean(String(updateSnap?.assetDownloadUrl ?? '').trim())
  return (
    <div className="page stPage">
      <div className="pageToolbar">
        <h2 className="srOnly">{t('settings.title')}</h2>
        <span className="spacer" />
        <IconButton
          icon={GITHUB_ICON}
          label={t('settings.openGithubRepo')}
          onClick={() => onBrowserOpen(APP_REPO_URL)}
        />
      </div>
      <p className="pageLead">{t('settings.lead')}</p>

      <div className="stGrid stagger">
        <div className="stCol stagger" style={{ '--i': 0 } as CSSProperties}>
          <section className="stCard">
            <SectionHead icon="settings">{t('settings.general')}</SectionHead>
            <SwitchRow
              label={t('settings.startMinimized')}
              checked={settings.startMinimized}
              onChange={(v) => onSetUiPref('startMinimized', v)}
            />
            <SwitchRow
              label={t('settings.launchOnStartup')}
              checked={settings.launchOnStartup}
              onChange={onSetLaunchOnStartup}
            />
            <SwitchRow
              label={t('settings.autoConnectOnStartup')}
              checked={settings.autoConnectOnStartup}
              onChange={(v) => onSetUiPref('autoConnectOnStartup', v)}
            />
            <SwitchRow
              label={t('settings.closeToTray')}
              checked={settings.closeToTray}
              disabled={!trayAvailable}
              onChange={(v) => onSetUiPref('closeToTray', v)}
            />
            <SwitchRow
              label={t('settings.autoUpdate')}
              checked={appUpdateEnabled}
              onChange={onToggleAppUpdate}
            />
            <Select
              label={t('settings.language')}
              value={lang}
              onChange={(v) => onSetLang(v as Lang)}
              options={[
                { value: 'en', label: 'English' },
                { value: 'ru', label: 'Русский' },
                { value: 'zh', label: '简体中文' },
              ]}
            />
            <Expansion
              className="stNested"
              icon="sun"
              header={t('expressive.appearance')}
            >
              <div className="stBody">
                <div className="stField">
                  <span className="stFieldLabel">{t('settings.theme')}</span>
                  <Segmented<ThemeMode>
                    ariaLabel={t('settings.theme')}
                    value={theme}
                    onChange={onSetTheme}
                    options={[
                      { value: 'system', label: t('settings.themeSystem') },
                      {
                        value: 'dark',
                        label: t('settings.themeDark'),
                        icon: 'moon',
                      },
                      {
                        value: 'light',
                        label: t('settings.themeLight'),
                        icon: 'sun',
                      },
                    ]}
                  />
                </div>
                <AccentField accent={accent} onSetAccent={onSetAccent} />
                <Select
                  label={t('settings.uiScale')}
                  value={String(settings.uiScale)}
                  onChange={(v) => onSetSetting('uiScale', Number(v))}
                  options={UI_SCALE_OPTIONS.map((s) => ({
                    value: String(s),
                    label: `${Math.round(s * 100)}%`,
                  }))}
                />
                {trayAvailable ? (
                  <div className="stField">
                    <Select
                      label={t('settings.trayIcon')}
                      value={trayIconStyle || 'auto'}
                      onChange={(v) => onSetTrayIconStyle(v === 'auto' ? '' : v)}
                      options={[
                        { value: 'auto', label: t('settings.trayIconAuto') },
                        {
                          value: 'colorful',
                          label: t('settings.trayIconColorful'),
                        },
                        { value: 'mono', label: t('settings.trayIconMono') },
                      ]}
                    />
                    <p className="muted stHint">{t('settings.trayIconHint')}</p>
                  </div>
                ) : null}
              </div>
            </Expansion>
          </section>

          <Expansion
            icon="proxies"
            header={t('settings.connection')}
            className="stSection"
          >
            <div className="stBody">
              <SwitchRow
                label={t('settings.smartDns')}
                checked={smartDns}
                onChange={onSetSmartDns}
              />
              <SwitchRow
                label={t('settings.ipv6Dns')}
                checked={dnsIpv6}
                onChange={onSetDnsIpv6}
              />
              <SwitchRow
                label={t('settings.allowLanBinding')}
                checked={allowLan}
                onChange={onSetAllowLan}
              />
              <PortLockRow
                mixedPort={mixedPort}
                runningMixedPort={runningMixedPort}
                onSetMixedPort={onSetMixedPort}
              />
              <p className="muted stHint">{t('settings.lockPortHint')}</p>
              <p className="muted stHint">{t('settings.dnsHint')}</p>
              {serviceInfo?.updateRequired ? (
                <div className="stAlert" role="alert">
                  <span className="stAlertIcon" aria-hidden>
                    <MaterialSymbol name="error" />
                  </span>
                  <div className="stAlertBody">
                    <strong>{t('settings.serviceUpdateTitle')}</strong>
                    <span>
                      {t('settings.serviceUpdateBody', {
                        version: serviceInfo.version || '—',
                        expected: serviceInfo.expectedVersion,
                      })}
                    </span>
                    <span className="stHint">
                      {t('settings.serviceUpdateAdminHint')}
                    </span>
                  </div>
                  <Button onClick={onInstallService}>
                    {t('settings.serviceUpdateAction')}
                  </Button>
                </div>
              ) : null}
              <div className="stActions">
                <Button variant="outlined" onClick={onInstallService}>
                  {t('settings.installService')}
                </Button>
                <Button variant="outlined" onClick={onEnsureTun}>
                  {t('settings.guidedTun')}
                </Button>
              </div>
            </div>
          </Expansion>

          <RealityCard prefs={realityPrefs} onCommit={onSetReality} />

          <Expansion
            icon="shield"
            header={t('settings.tun.title')}
            className="stSection"
          >
            <div className="stBody">
              <p className="muted stHint">{t('settings.tun.hint')}</p>
              <dl className="stTunSummary">
                <div className="stTunItem">
                  <dt>{t('settings.tun.stackLabel')}</dt>
                  <dd>{tunStackValue || t('settings.tun.inherit')}</dd>
                </div>
                <div className="stTunItem">
                  <dt>{t('settings.tun.autoRouteLabel')}</dt>
                  <dd>{tristate(tunPrefs.autoRoute)}</dd>
                </div>
                <div className="stTunItem">
                  <dt>{t('settings.tun.snifferLabel')}</dt>
                  <dd>{tristate(trafficPrefs.snifferEnabled)}</dd>
                </div>
              </dl>
              <div className="stActions">
                <Button variant="tonal" onClick={onShowTunModal}>
                  {t('settings.tun.configure')}
                </Button>
              </div>
            </div>
          </Expansion>
        </div>

        <div className="stCol stagger" style={{ '--i': 1 } as CSSProperties}>
          <Expansion
            icon="refresh"
            header={t('settings.profilesUpdates')}
            className="stSection"
          >
            <div className="stBody">
              <TextField
                type="number"
                label="Default auto-update interval (min)"
                placeholder="360"
                value={String(settings.defaultAutoUpdateMinutes)}
                onChange={(v) =>
                  onSetSetting(
                    'defaultAutoUpdateMinutes',
                    Math.max(5, Number(v || 360)),
                  )
                }
              />
              <SwitchRow
                label={t('settings.reconnectOnManualProfileUpdate')}
                checked={settings.reconnectOnManualProfileUpdate}
                onChange={(v) =>
                  onSetSetting('reconnectOnManualProfileUpdate', v)
                }
              />
              <div className="stActions">
                <Button
                  variant="outlined"
                  disabled={settingsBusy}
                  onClick={onApplyDefaultAutoUpdate}
                >
                  {t('settings.applyDefaultsToProfiles')}
                </Button>
                <Button
                  variant="tonal"
                  busy={settingsBusy}
                  onClick={onRefreshAllSubs}
                >
                  {t('settings.refreshAllSubs')}
                </Button>
              </div>
            </div>
          </Expansion>

          <Expansion
            icon="advanced"
            header={t('settings.dataDiag')}
            className="stSection"
          >
            <div className="stBody">
              <Select
                label={t('settings.logLevel')}
                value={settings.logLevel}
                onChange={(v) =>
                  onSetSetting('logLevel', v as CompactSettings['logLevel'])
                }
                options={['error', 'warn', 'info', 'debug'].map((l) => ({
                  value: l,
                  label: l,
                }))}
              />
              <div className="stActions">
                <Button
                  variant="outlined"
                  busy={settingsBusy}
                  onClick={onExportDiagnostics}
                >
                  {t('settings.exportDiagnostics')}
                </Button>
                <Button variant="outlined" onClick={onClearCache}>
                  {t('settings.clearCache')}
                </Button>
              </div>
              <div className="stActions">
                <Button
                  variant="outlined"
                  onClick={() => onOpenResetModal('keep_profiles')}
                >
                  {t('settings.resetAppSettings')}
                </Button>
                <Button
                  variant="outlined"
                  className="stDanger"
                  onClick={() => onOpenResetModal('with_profiles')}
                >
                  {t('settings.resetRemoveProfiles')}
                </Button>
              </div>
            </div>
          </Expansion>

          <Expansion
            icon="devices"
            header={t('settings.info')}
            className="stSection"
          >
            <div className="stBody">
              <div className="stKpiGrid">
                <div className="stKpi">
                  <span>Core</span>
                  <strong title={t('settings.coreTitle')}>
                    {state?.core?.version?.trim() ? state.core.version : '—'}
                  </strong>
                </div>
                <div className="stKpi">
                  <span>{t('settings.appVersionLabel')}</span>
                  <strong>
                    {String(updateSnap?.currentVersion ?? '').trim()
                      ? String(updateSnap.currentVersion)
                      : ((import.meta.env.VITE_APP_VERSION as
                          | string
                          | undefined) ?? 'dev')}
                  </strong>
                </div>
                <div className="stKpi">
                  <span>{t('settings.updateChannelLabel')}</span>
                  <strong>{updateSnap?.channel ?? 'stable'}</strong>
                </div>
                {/* Privileged service version. Previously only visible inside
                    the "update required" banner, so a healthy install had no
                    way to show which service is actually running. */}
                <div className="stKpi">
                  <span>{t('settings.serviceVersionLabel')}</span>
                  <strong title={serviceInfo?.expectedVersion}>
                    {!serviceInfo?.installed
                      ? t('settings.serviceNotInstalled')
                      : serviceInfo?.version?.trim()
                        ? serviceInfo.version
                        : '—'}
                  </strong>
                </div>
                <div className="stKpi">
                  <span>{t('settings.lastCheckedLabel')}</span>
                  <strong>
                    {updateSnap?.lastCheckedAt
                      ? new Date(
                          (updateSnap.lastCheckedAt as number) * 1000,
                        ).toLocaleString()
                      : 'Never'}
                  </strong>
                </div>
              </div>
              {coreBuild?.source ? (
                <p className="small muted stCoreBuild">
                  <span>
                    {coreBuild.source === 'citrus'
                      ? t('settings.coreBuildCitrus', {
                          version: coreBuild.version,
                        })
                      : t('settings.coreBuildLocal', {
                          version: coreBuild.version,
                        })}
                  </span>
                  <Button
                    variant="text"
                    size="extra-small"
                    onClick={() => onBrowserOpen(coreBuild.patchesUrl)}
                  >
                    {t('settings.coreBuildPatches')}
                  </Button>
                  <Button
                    variant="text"
                    size="extra-small"
                    onClick={() => onBrowserOpen(coreBuild.docUrl)}
                  >
                    {t('settings.coreBuildDoc')}
                  </Button>
                </p>
              ) : null}
              <SwitchRow
                label={t('settings.corpVpnToggle')}
                description={t('settings.corpVpnHint')}
                checked={corpVpnEnabled}
                onChange={onToggleCorpVpn}
              />
              {updateSnap?.hasUpdate ? (
                <p className="stNote" role="status">
                  <MaterialSymbol name="download" />
                  {t('settings.updateAvailable', {
                    version: String(updateSnap.latestVersion ?? ''),
                  })}
                </p>
              ) : updateSnap?.lastCheckedAt && !updateSnap?.lastError ? (
                <p className="small stUpToDate" role="status">
                  <MaterialSymbol name="check" />
                  {t('settings.upToDate')}
                </p>
              ) : null}
              {updateSnap?.lastError ? (
                <div className="inlineError">
                  <p>{String(updateSnap.lastError)}</p>
                </div>
              ) : null}
              {updateSnap?.hasUpdate && !hasAsset ? (
                <p className="muted small">{t('settings.updatePlatformNote')}</p>
              ) : null}
              {updateSnap?.hasUpdate &&
              String(updateSnap?.releaseNotes ?? '').trim() ? (
                <Expansion className="stNested" header={t('settings.whatsNew')}>
                  <pre className="stChangelog allowSelect">
                    {String(updateSnap.releaseNotes)}
                  </pre>
                </Expansion>
              ) : null}
              {updateProgress ? (
                <div className="stProgress">
                  <Progress
                    value={Math.min(100, Math.max(0, updateProgress.pct))}
                    indeterminate={updateProgress.pct < 0}
                    ariaLabel={t('settings.updateDownloading', {
                      pct:
                        updateProgress.pct >= 0
                          ? Math.round(updateProgress.pct)
                          : '…',
                    })}
                  />
                  <span className="muted small">
                    {updateProgress.pct >= 100
                      ? t('settings.updateStarting')
                      : t('settings.updateDownloading', {
                          pct:
                            updateProgress.pct >= 0
                              ? Math.round(updateProgress.pct)
                              : '…',
                        })}
                  </span>
                </div>
              ) : null}
              <div className="stActions">
                <Button variant="tonal" onClick={onCheckUpdates}>
                  {t('settings.checkUpdates')}
                </Button>
                {updateSnap?.hasUpdate && hasAsset ? (
                  <Button
                    busy={Boolean(updateProgress)}
                    onClick={onApplyUpdate}
                  >
                    {t('settings.downloadInstaller')}
                  </Button>
                ) : null}
                <Button
                  variant="outlined"
                  onClick={() => onBrowserOpen(APP_DOWNLOADS_URL)}
                >
                  {t('settings.openReleasePage')}
                </Button>
              </div>
            </div>
          </Expansion>
        </div>
      </div>
      {tunBanner ? (
        <div className="stBanner" role="status">
          <span>{tunBanner}</span>
          <IconButton
            icon="close"
            label={t('common.dismiss')}
            onClick={onDismissBanner}
          />
        </div>
      ) : null}
      {error ? (
        <div className="inlineError">
          <p>{friendlyErrorMessage(error)}</p>
        </div>
      ) : null}
    </div>
  )
}

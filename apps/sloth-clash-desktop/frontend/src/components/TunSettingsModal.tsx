import { useTranslation } from 'react-i18next'

import type { main } from '../api/models'
import '../styles/settings.css'
import { Button, Dialog, Segmented, TextField } from '../ui/M3'

type TunDrafts = { dnsHijack?: string; mtu?: string; device?: string }

export function TunSettingsModal({
  panelStack,
  open,
  tunPrefs,
  trafficPrefs,
  tunDnsHijackDraft,
  tunMtuDraft,
  tunDeviceDraft,
  tunPrefsSaving,
  onTunDnsHijackDraftChange,
  onTunMtuDraftChange,
  onTunDeviceDraftChange,
  onCommitTunPrefs,
  onCommitTrafficPrefs,
  onClose,
}: {
  panelStack?: string
  open: boolean
  tunPrefs: main.TunSettings
  trafficPrefs: main.TrafficSettings
  tunDnsHijackDraft: string
  tunMtuDraft: string
  tunDeviceDraft: string
  tunPrefsSaving: boolean
  onTunDnsHijackDraftChange: (next: string) => void
  onTunMtuDraftChange: (next: string) => void
  onTunDeviceDraftChange: (next: string) => void
  onCommitTunPrefs: (
    patch: Partial<main.TunSettings>,
    drafts?: TunDrafts,
  ) => void
  onCommitTrafficPrefs: (patch: Partial<main.TrafficSettings>) => void
  onClose: () => void
}) {
  const { t } = useTranslation()

  const inherit = t('settings.tun.inherit')
  const INHERIT = '__inherit'
  const toSeg = (v: string) => v || INHERIT
  const fromSeg = (v: string) => (v === INHERIT ? '' : v)

  const tunStackValue = panelStack || tunPrefs.stack || ''
  const findProcessModeValue: string = trafficPrefs.findProcessMode ?? ''

  const tunStackOptions = [
    { value: INHERIT, label: inherit },
    ...['mips', 'gvisor', 'system', 'mixed'].map((v) => ({
      value: v,
      label: v,
    })),
  ]
  const findProcessModeOptions = [
    { value: INHERIT, label: inherit },
    ...['off', 'strict', 'always'].map((v) => ({ value: v, label: v })),
  ]

  type Tri = 'inherit' | 'on' | 'off'
  const tristate = (
    label: string,
    value: boolean | undefined,
    onChange: (next: boolean | undefined) => void,
  ) => (
    <div className="stField">
      <span className="stFieldLabel">{label}</span>
      <Segmented<Tri>
        ariaLabel={label}
        value={value === undefined ? 'inherit' : value ? 'on' : 'off'}
        onChange={(next) =>
          onChange(next === 'inherit' ? undefined : next === 'on')
        }
        options={[
          { value: 'inherit', label: inherit, disabled: tunPrefsSaving },
          { value: 'on', label: t('common.on'), disabled: tunPrefsSaving },
          { value: 'off', label: t('common.off'), disabled: tunPrefsSaving },
        ]}
      />
    </div>
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={t('settings.tun.title')}
      actions={
        <Button onClick={onClose}>{t('common.close') || 'Close'}</Button>
      }
    >
      <p className="muted stDialogText">{t('settings.tun.hint')}</p>
      {panelStack ? (
        <p className="stNote" role="status">
          {t('panel.stack', { stack: panelStack })}
        </p>
      ) : null}
      <div className="stTunForm">
        <div className="stField stTunWide">
          <span className="stFieldLabel">{t('settings.tun.stackLabel')}</span>
          <Segmented
            ariaLabel={t('settings.tun.stackLabel')}
            value={toSeg(tunStackValue)}
            onChange={(v) => onCommitTunPrefs({ stack: fromSeg(v) })}
            options={tunStackOptions.map((o) => ({
              ...o,
              disabled: tunPrefsSaving || Boolean(panelStack),
            }))}
          />
        </div>
        {tristate(t('settings.tun.autoRouteLabel'), tunPrefs.autoRoute, (next) =>
          onCommitTunPrefs({ autoRoute: next }),
        )}
        {tristate(
          t('settings.tun.autoDetectInterfaceLabel'),
          tunPrefs.autoDetectInterface,
          (next) => onCommitTunPrefs({ autoDetectInterface: next }),
        )}
        {tristate(
          t('settings.tun.strictRouteLabel'),
          tunPrefs.strictRoute,
          (next) => onCommitTunPrefs({ strictRoute: next }),
        )}
        {tristate(
          t('settings.tun.snifferLabel'),
          trafficPrefs.snifferEnabled,
          (next) => onCommitTrafficPrefs({ snifferEnabled: next }),
        )}
        <TextField
          label={t('settings.tun.dnsHijackLabel')}
          placeholder="any:53"
          value={tunDnsHijackDraft}
          onChange={onTunDnsHijackDraftChange}
          onBlur={() => onCommitTunPrefs({}, { dnsHijack: tunDnsHijackDraft })}
        />
        <TextField
          label={t('settings.tun.mtuLabel')}
          placeholder="1500"
          value={tunMtuDraft}
          onChange={onTunMtuDraftChange}
          onBlur={() => onCommitTunPrefs({}, { mtu: tunMtuDraft })}
        />
        <TextField
          label={t('settings.tun.deviceLabel')}
          placeholder="Mihomo"
          value={tunDeviceDraft}
          onChange={onTunDeviceDraftChange}
          onBlur={() => onCommitTunPrefs({}, { device: tunDeviceDraft })}
        />
        <div className="stField stTunWide">
          <span className="stFieldLabel">{t('settings.tun.findProcessLabel')}</span>
          <Segmented
            ariaLabel={t('settings.tun.findProcessLabel')}
            value={toSeg(findProcessModeValue)}
            onChange={(v) => onCommitTrafficPrefs({ findProcessMode: fromSeg(v) })}
            options={findProcessModeOptions.map((o) => ({
              ...o,
              disabled: tunPrefsSaving,
            }))}
          />
        </div>
      </div>
    </Dialog>
  )
}

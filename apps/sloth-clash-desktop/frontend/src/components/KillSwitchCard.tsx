import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GetDesktopPrefs, SetKillSwitch } from '../api/prefs'
import { SwitchRow } from '../ui/M3'

import { MaterialSymbol } from './MaterialSymbol'

export type KillSwitchView = {
  active?: boolean
  tunBound?: boolean
  error?: string
}

// The service implements the firewall on Windows (WFP) only, so the switch is
// offered there and nowhere else rather than pretending to protect.
const SUPPORTED = /Windows/i.test(navigator.userAgent)

/**
 * Kill switch settings: block all traffic that does not go through the VPN
 * while a session is up, so a crashed core can never leak the real IP.
 */
export function KillSwitchCard({
  state,
  connected,
}: {
  state?: KillSwitchView
  connected: boolean
}) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  const [allowLan, setAllowLan] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void GetDesktopPrefs().then((prefs) => {
      if (cancelled) return
      setEnabled(Boolean(prefs?.privacy?.killSwitch))
      setAllowLan(Boolean(prefs?.privacy?.killSwitchAllowLan))
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!SUPPORTED) return null

  const save = (nextEnabled: boolean, nextLan: boolean) => {
    setSaving(true)
    setEnabled(nextEnabled)
    setAllowLan(nextLan)
    void SetKillSwitch(nextEnabled, nextLan)
      .then((prefs) => {
        setEnabled(Boolean(prefs?.privacy?.killSwitch))
        setAllowLan(Boolean(prefs?.privacy?.killSwitchAllowLan))
      })
      .finally(() => setSaving(false))
  }

  const status = state?.error
    ? { tone: 'error', text: state.error }
    : enabled && connected && state?.active
      ? { tone: 'ok', text: t('settings.killSwitch.statusActive') }
      : enabled
        ? { tone: 'idle', text: t('settings.killSwitch.statusArmed') }
        : null

  return (
    <section className="stCard stKillSwitch" data-active={state?.active || undefined}>
      <div className="stKillHead">
        <span className="stKillIcon" aria-hidden>
          <MaterialSymbol name="shield" />
        </span>
        <div>
          <strong>{t('settings.killSwitch.title')}</strong>
          <p>{t('settings.killSwitch.description')}</p>
        </div>
      </div>
      <SwitchRow
        label={t('settings.killSwitch.enable')}
        checked={enabled}
        disabled={saving}
        onChange={(v) => save(v, allowLan)}
      />
      <SwitchRow
        label={t('settings.killSwitch.allowLan')}
        description={t('settings.killSwitch.allowLanHint')}
        checked={allowLan}
        disabled={saving || !enabled}
        onChange={(v) => save(enabled, v)}
      />
      {status ? (
        <p className="stKillStatus" data-tone={status.tone} role="status">
          {status.text}
        </p>
      ) : null}
    </section>
  )
}

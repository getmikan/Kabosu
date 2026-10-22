import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import type { main } from '../api/models'
import '../styles/operator.css'
import { Button, Dialog, Progress, Shape } from '../ui/M3'
import { formatBytesSmart } from '../utils/format'
import {
  parseSubscriptionUsage,
  profileSubscriptionHost,
  subscriptionDaysLeft,
} from '../utils/subscription'

import { MaterialSymbol } from './MaterialSymbol'
import { ServerGroups } from './ServerGroups'

/**
 * Operator info dialog — everything about the provider in one place: what the
 * panel sent via X-Brand-Desktop-* (logo, name, links) plus the two things a
 * user actually opens this for: how much of the subscription is left, and how
 * to reach support with the details support always asks for.
 */
export function OperatorModal({
  branding,
  activeProfile,
  deviceIdentity,
  appVersion,
  coreVersion,
  serviceVersion,
  lightUI,
  embedded = false,
  open,
  onClose,
  onBrowserOpen,
}: {
  branding: main.ActiveBranding | null
  activeProfile: any
  deviceIdentity: main.SubscriptionDeviceIdentityPublic | null
  appVersion: string
  coreVersion: string
  serviceVersion: string
  lightUI: boolean
  embedded?: boolean
  open: boolean
  onClose: () => void
  onBrowserOpen: (url: string) => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const m = branding?.manifest
  if (!open || !m) return null

  const logo = lightUI
    ? branding?.logoLightDataUri || branding?.logoDataUri
    : branding?.logoDataUri || branding?.logoLightDataUri

  const usage = parseSubscriptionUsage(activeProfile)
  const daysLeft = subscriptionDaysLeft(usage)
  const host = profileSubscriptionHost(String(activeProfile?.url ?? ''))
  // Only a known total makes a ratio meaningful; unlimited plans just show used.
  const pct =
    usage && usage.totalBytes > 0
      ? Math.min(100, Math.round((usage.usedBytes / usage.totalBytes) * 100))
      : null

  const links: Array<[string, string | undefined]> = [
    [
      t('settings.operatorCabinet'),
      m.cabinetUrl || activeProfile?.panel?.webPageUrl,
    ],
    [t('settings.operatorRenew'), m.renewUrl],
    [
      t('settings.operatorSupport'),
      m.supportUrl || activeProfile?.subscriptionSupportUrl,
    ],
    ['Telegram', m.telegramUrl],
    [t('settings.operatorBot'), m.botUrl],
    [t('settings.operatorWebsite'), m.websiteUrl],
    [t('settings.operatorStatus'), m.statusUrl],
    [t('settings.operatorHelp'), m.helpUrl],
    [t('settings.operatorPrivacy'), m.privacyUrl],
    [t('settings.operatorTerms'), m.termsUrl],
  ]
  const shown = links.filter(([, url]) => !!url)

  // One click instead of a ten-message back-and-forth: everything support
  // usually asks for, in a paste-ready block.
  const copySupportInfo = async () => {
    const lines = [
      m.name ? `Operator: ${m.name}` : '',
      host ? `Subscription: ${host}` : '',
      `App: ${appVersion}`,
      coreVersion ? `Core: ${coreVersion}` : '',
      serviceVersion ? `Service: ${serviceVersion}` : '',
      deviceIdentity?.deviceOs ? `OS: ${deviceIdentity.deviceOs}` : '',
      deviceIdentity?.osVersion
        ? `OS version: ${deviceIdentity.osVersion}`
        : '',
      deviceIdentity?.deviceModel
        ? `Device: ${deviceIdentity.deviceModel}`
        : '',
      deviceIdentity?.hwid ? `HWID: ${deviceIdentity.hwid}` : '',
    ].filter(Boolean)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — nothing actionable, the dialog stays usable
    }
  }

  const devicesFull = Boolean(
    m.devicesLimit && (m.devicesUsed ?? 0) >= m.devicesLimit,
  )

  const content = (
    <div className="opBody">
      <header className="opHero">
        <span className="opLogo">
          <Shape name="soft-burst" />
          {logo ? (
            <img src={logo} alt={m.name || 'logo'} />
          ) : (
            <MaterialSymbol name="shield" />
          )}
        </span>
        <div className="opHeroText">
          <h3 id="operatorTitle" className="opTitle">
            {m.name || t('settings.operator')}
          </h3>
          {m.tagline ? <p className="opTagline">{m.tagline}</p> : null}
          {host ? <span className="opHost mono">{host}</span> : null}
        </div>
      </header>
      {m.greeting || m.userDisplayName ? (
        <p className="opGreeting">
          {m.greeting}
          {m.greeting && m.userDisplayName ? ' ' : ''}
          {m.userDisplayName}
        </p>
      ) : null}

      {usage || m.devicesUsed || m.devicesLimit ? (
        <div className="opUsage stagger">
          {usage ? (
            <div className="opTile" style={{ '--i': 0 } as CSSProperties}>
              <span className="opTileLabel">{t('ui.operator.traffic')}</span>
              <span className="opTileValue">
                {formatBytesSmart(usage.usedBytes)}
                {usage.totalBytes > 0
                  ? ` / ${formatBytesSmart(usage.totalBytes)}`
                  : ''}
              </span>
              {pct !== null ? (
                <Progress
                  className="opTileBar"
                  value={pct}
                  ariaLabel={t('ui.operator.traffic')}
                />
              ) : null}
            </div>
          ) : null}
          {m.devicesUsed || m.devicesLimit ? (
            <div
              className="opTile"
              data-warn={devicesFull || undefined}
              style={{ '--i': 1 } as CSSProperties}
            >
              <span className="opTileLabel">{t('ui.operator.devices')}</span>
              <span className="opTileValue">
                {m.devicesUsed ?? 0}
                {m.devicesLimit ? ` / ${m.devicesLimit}` : ''}
              </span>
            </div>
          ) : null}
          {daysLeft !== null ? (
            <div
              className="opTile"
              data-warn={daysLeft <= 3 || undefined}
              style={{ '--i': 2 } as CSSProperties}
            >
              <span className="opTileLabel">{t('ui.operator.expires')}</span>
              <span className="opTileValue">
                {daysLeft >= 0
                  ? t('ui.operator.daysLeft', { count: daysLeft })
                  : t('ui.operator.expired')}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <ServerGroups
        metadata={activeProfile?.panel?.groups}
        pageUrl={m.cabinetUrl || activeProfile?.panel?.webPageUrl}
        onOpen={onBrowserOpen}
      />
      {shown.length > 0 ? (
        <div className="opLinks stagger">
          {shown.map(([label, url], i) => (
            <Button
              key={label}
              variant="outlined"
              trailingIcon="chevron"
              className="opLinkBtn"
              style={{ '--i': i } as CSSProperties}
              onClick={() => onBrowserOpen(String(url))}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : null}

      <p className="opAttribution">Powered by Kabosu · Citrus</p>
    </div>
  )

  const copyButton = (
    <Button
      variant="tonal"
      icon={copied ? 'check' : 'download'}
      onClick={() => void copySupportInfo()}
    >
      {copied ? t('ui.operator.copied') : t('ui.operator.copyForSupport')}
    </Button>
  )

  if (embedded) {
    return (
      <div className="operatorPage opPage">
        <div
          className="operatorPageCard opCard"
          role="region"
          aria-labelledby="operatorTitle"
        >
          {content}
          <div className="opFooter">{copyButton}</div>
        </div>
      </div>
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      className="opDialog"
      actions={
        <>
          {copyButton}
          <Button onClick={onClose}>{t('common.close')}</Button>
        </>
      }
    >
      {content}
    </Dialog>
  )
}

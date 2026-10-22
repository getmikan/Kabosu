import { type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { MaterialSymbol } from '../components/MaterialSymbol'
import '../styles/profiles.css'
import { Button, IconButton, Loading, Progress, Shape } from '../ui/M3'
import { formatBytesSmart, formatProfileAgo } from '../utils/format'
import {
  parseSubscriptionUsage,
  profileSubscriptionHost,
  subscriptionDaysLeft,
} from '../utils/subscription'
import { friendlyErrorMessage } from '../utils/yaml'

export type ProfileMenuTarget = {
  id: string
  name: string
  x: number
  y: number
}

function ProfileUsage({ profile }: { profile: any }) {
  const { t, i18n } = useTranslation()
  const usage = parseSubscriptionUsage(profile)
  const days = subscriptionDaysLeft(usage)
  if (!usage) return null
  const unlimited = usage.totalBytes <= 0
  const left = Math.max(0, usage.totalBytes - usage.usedBytes)
  const leftPercent = unlimited
    ? null
    : Math.round((left / usage.totalBytes) * 100)
  return (
    <div className="pfUsage">
      <div className="pfUsageRow">
        <span className="pfUsageLabel">{t('expressive.trafficLeft')}</span>
        <strong className="pfUsageValue">
          {unlimited ? '∞' : formatBytesSmart(left)}
        </strong>
      </div>
      {leftPercent !== null ? (
        <Progress value={leftPercent} ariaLabel={t('expressive.trafficLeft')} />
      ) : null}
      <div className="pfUsageRow">
        <span className="pfUsageLabel">{t('expressive.expires')}</span>
        <span className="pfUsageMeta">
          {usage.expiresAt
            ? new Date(usage.expiresAt * 1000).toLocaleDateString(i18n.language)
            : '∞'}
          {days !== null ? (
            <span className="pfDays" data-low={days <= 3 || undefined}>
              {t('ui.profiles.daysLeft', { count: Math.max(0, days) })}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  )
}

export function ProfilesPage({
  profiles,
  activeProfileId,
  refreshBusyId,
  error,
  onImport,
  onActivate,
  onRefresh,
  onContextMenu,
}: {
  profiles: any[]
  activeProfileId: string
  refreshBusyId: string | null
  error: string | null
  onImport: () => void
  onActivate: (id: string) => void
  onRefresh: (id: string) => void
  onContextMenu: (target: ProfileMenuTarget) => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <div className="page pfPage">
      <div className="pageToolbar">
        <span className="spacer" />
        <Button variant="filled" icon="add" onClick={onImport}>
          {t('expressive.addProfile')}
        </Button>
      </div>
      <div className="pfList stagger">
        {profiles.map((profile, index) => {
          const active = activeProfileId === profile.id
          const refreshing = refreshBusyId === profile.id
          const isSub = profile.type === 'subscription'
          const host = profileSubscriptionHost(profile.url || '')
          const menu = (x: number, y: number) =>
            onContextMenu({ id: profile.id, name: profile.name, x, y })
          return (
            <article
              className={`pfCard${active ? ' pfCardActive' : ''}`}
              key={profile.id}
              style={{ '--i': index } as CSSProperties}
              onContextMenu={(event) => {
                event.preventDefault()
                menu(event.clientX, event.clientY)
              }}
            >
              <div className="pfHeading">
                <button
                  className="pfChoose"
                  type="button"
                  onClick={() => !active && onActivate(profile.id)}
                  aria-pressed={active}
                  title={active ? undefined : t('ui.profiles.activate')}
                >
                  <span className="pfAvatar">
                    <Shape name={active ? 'sunny' : '7-sided-cookie'} />
                    <MaterialSymbol name={active ? 'check' : 'profiles'} />
                  </span>
                  <span className="pfTitle">
                    <strong>{profile.name}</strong>
                    <span className="pfSubtitle">
                      {isSub ? host || t('ui.common.subscription') : t('ui.common.local')}
                    </span>
                  </span>
                </button>
                <span
                  className="pfMore"
                  onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect()
                    menu(box.right, box.bottom)
                  }}
                >
                  <IconButton
                    icon="more"
                    label={t('expressive.profileActions')}
                  />
                </span>
              </div>

              <ProfileUsage profile={profile} />

              {profile.scriptError ? (
                <p className="pfScriptError" title={profile.scriptError}>
                  <MaterialSymbol name="error" />
                  {t('ui.profiles.scriptModal.badgeTitle')}
                </p>
              ) : null}

              <div className="pfFoot">
                {active ? (
                  <span className="pfActiveChip">
                    <MaterialSymbol name="check" />
                    {t('ui.profiles.active')}
                  </span>
                ) : (
                  <Button
                    variant="tonal"
                    size="extra-small"
                    onClick={() => onActivate(profile.id)}
                  >
                    {t('ui.profiles.activate')}
                  </Button>
                )}
                <span className="spacer" />
                <span className="pfAgo">
                  {formatProfileAgo(
                    Number(profile.lastUpdated ?? 0),
                    i18n.language,
                  )}
                </span>
                {isSub ? (
                  refreshing ? (
                    <Loading
                      className="pfRefreshing"
                      label={t('ui.connections.refresh')}
                    />
                  ) : (
                    <IconButton
                      icon="refresh"
                      label={t('ui.profiles.refreshSubscription')}
                      onClick={() => onRefresh(profile.id)}
                    />
                  )
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
      {!profiles.length ? (
        <div className="emptyState">
          <Shape name="flower" />
          <strong>{t('expressive.start')}</strong>
          <p>{t('expressive.importBody')}</p>
          <Button variant="filled" icon="add" onClick={onImport}>
            {t('expressive.addProfile')}
          </Button>
        </div>
      ) : null}
      {error ? (
        <div className="inlineError" role="alert">
          <p>{friendlyErrorMessage(error)}</p>
        </div>
      ) : null}
    </div>
  )
}

import { type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { MaterialSymbol } from '../components/MaterialSymbol'
import { SubscriptionStats } from '../components/SubscriptionStats'
import '../styles/profiles.css'
import { Button, IconButton, Loading, Shape } from '../ui/M3'
import { formatProfileAgo } from '../utils/format'
import { profileSubscriptionHost } from '../utils/subscription'
import { friendlyErrorMessage } from '../utils/yaml'

export type ProfileMenuTarget = {
  id: string
  name: string
  x: number
  y: number
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
  const { t } = useTranslation()
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
                >
                  <span className="pfAvatar">
                    <MaterialSymbol name={active ? 'check' : 'profiles'} />
                  </span>
                  <strong>{profile.name}</strong>
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
              <button
                type="button"
                className="pfStats"
                onClick={() => !active && onActivate(profile.id)}
                aria-label={profile.name}
                aria-pressed={active}
              >
                <SubscriptionStats profile={profile} compact />
              </button>
              {profile.scriptError ? (
                <p className="pfScriptError" title={profile.scriptError}>
                  {t('ui.profiles.scriptModal.badgeTitle')}
                </p>
              ) : null}
              <div className="pfFoot">
                <span
                  className="pfAgo"
                  title={profileSubscriptionHost(profile.url || '')}
                >
                  {formatProfileAgo(Number(profile.lastUpdated ?? 0)) ||
                    (profile.type === 'subscription'
                      ? t('ui.common.subscription')
                      : t('ui.common.local'))}
                </span>
                {profile.type === 'subscription' ? (
                  refreshing ? (
                    <Loading
                      className="pfRefreshing"
                      label={t('ui.connections.refresh')}
                    />
                  ) : (
                    <IconButton
                      icon="refresh"
                      label={t('ui.connections.refresh')}
                      onClick={() => onRefresh(profile.id)}
                    />
                  )
                ) : (
                  <span className="pfLocalIcon">
                    <MaterialSymbol name="rules" />
                  </span>
                )}
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

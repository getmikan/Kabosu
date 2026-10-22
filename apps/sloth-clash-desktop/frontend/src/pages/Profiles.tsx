import { useTranslation } from 'react-i18next'

import { MaterialSymbol } from '../components/MaterialSymbol'
import { SubscriptionStats } from '../components/SubscriptionStats'
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
    <div className="panel profilesPanel">
      <div className="pageActions">
        <button type="button" className="btn primary" onClick={onImport}>
          <MaterialSymbol name="add" />
          {t('expressive.addProfile')}
        </button>
      </div>
      <div className="profileList">
        {profiles.map((profile) => {
          const active = activeProfileId === profile.id
          const menu = (x: number, y: number) =>
            onContextMenu({ id: profile.id, name: profile.name, x, y })
          return (
            <article
              className={`profileCard${active ? ' profileCardActive' : ''}`}
              key={profile.id}
              onContextMenu={(event) => {
                event.preventDefault()
                menu(event.clientX, event.clientY)
              }}
            >
              <div className="profileCardHeading">
                <button
                  className="profileChoose"
                  type="button"
                  onClick={() => !active && onActivate(profile.id)}
                  aria-pressed={active}
                >
                  <MaterialSymbol name="profiles" />
                  <strong>{profile.name}</strong>
                </button>
                <button
                  className="chromeIconButton"
                  type="button"
                  aria-label={t('expressive.profileActions')}
                  title={t('expressive.profileActions')}
                  onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect()
                    menu(box.right, box.bottom)
                  }}
                >
                  <MaterialSymbol name="more" />
                </button>
              </div>
              <button
                type="button"
                className="profileStatsButton"
                onClick={() => !active && onActivate(profile.id)}
                aria-label={profile.name}
                aria-pressed={active}
              >
                <SubscriptionStats profile={profile} compact />
              </button>
              {profile.scriptError ? (
                <p className="profileScriptError" title={profile.scriptError}>
                  {t('ui.profiles.scriptModal.badgeTitle')}
                </p>
              ) : null}
              <div className="profileCardFoot">
                <span title={profileSubscriptionHost(profile.url || '')}>
                  {formatProfileAgo(Number(profile.lastUpdated ?? 0)) ||
                    (profile.type === 'subscription'
                      ? t('ui.common.subscription')
                      : t('ui.common.local'))}
                </span>
                {profile.type === 'subscription' ? (
                  <button
                    className="chromeIconButton"
                    type="button"
                    disabled={refreshBusyId === profile.id}
                    onClick={() => onRefresh(profile.id)}
                    title={t('ui.connections.refresh')}
                    aria-label={t('ui.connections.refresh')}
                  >
                    <MaterialSymbol
                      name="refresh"
                      className={
                        refreshBusyId === profile.id ? 'iconRefreshing' : ''
                      }
                    />
                  </button>
                ) : (
                  <MaterialSymbol name="rules" />
                )}
              </div>
            </article>
          )
        })}
      </div>
      {!profiles.length ? (
        <div className="emptyState">
          <span className="emptyStateIcon">
            <MaterialSymbol name="profiles" />
          </span>
          <h2>{t('expressive.start')}</h2>
          <p>{t('expressive.importBody')}</p>
          <button className="btn primary" type="button" onClick={onImport}>
            {t('expressive.addProfile')}
          </button>
        </div>
      ) : null}
      {error ? <p className="error">{friendlyErrorMessage(error)}</p> : null}
    </div>
  )
}

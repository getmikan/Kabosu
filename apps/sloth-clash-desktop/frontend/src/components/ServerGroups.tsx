import { useTranslation } from 'react-i18next'

import type { main } from '../api/models'
import { formatBytesSmart } from '../utils/format'

export function ServerGroups({
  metadata,
  pageUrl,
  onOpen,
}: {
  metadata?: main.MikanGroups
  pageUrl?: string
  onOpen: (url: string) => void
}) {
  const { t, i18n } = useTranslation()
  const groups =
    metadata?.groups?.filter((group) => group.mode !== 'main') ?? []
  if (!groups.length) return null
  return (
    <details className="serverQuotaPanel">
      <summary>
        {t('panel.serverGroups')} <span>{groups.length}</span>
      </summary>
      <div className="serverQuotaRows">
        {groups.map((group) => {
          const total =
            group.left === undefined ? null : group.used + group.left
          const percent =
            total === null
              ? null
              : total > 0
                ? Math.min(100, Math.round((group.used / total) * 100))
                : 100
          return (
            <div className="serverQuotaRow" key={group.id}>
              <div className="serverQuotaLabel">
                <strong>{group.name}</strong>
                <span>
                  {group.mode === 'unlimited'
                    ? `${formatBytesSmart(group.used)} / ∞`
                    : group.left === undefined
                      ? '—'
                      : t('panel.remaining', {
                          value: formatBytesSmart(group.left),
                        })}
                </span>
              </div>
              {percent !== null ? (
                <progress max="100" value={percent} aria-label={group.name} />
              ) : null}
              <div className="serverQuotaMeta">
                <span>
                  {t('panel.used', { value: formatBytesSmart(group.used) })}
                </span>
                {group.extra > 0 ? (
                  <span>
                    {t('panel.extra', { value: formatBytesSmart(group.extra) })}
                  </span>
                ) : null}
              </div>
              {group.exhausted ? (
                <p className="serverQuotaExhausted" role="status">
                  {t('panel.exhausted')}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="serverQuotaFooter">
        {metadata?.resetsAt ? (
          <span>
            {t('panel.resets', {
              date: new Date(metadata.resetsAt * 1000).toLocaleDateString(
                i18n.language,
              ),
            })}
          </span>
        ) : null}
        {pageUrl ? (
          <button
            className="btn ghost"
            type="button"
            onClick={() => onOpen(pageUrl)}
          >
            {t('panel.buyTraffic')}
          </button>
        ) : null}
      </div>
    </details>
  )
}

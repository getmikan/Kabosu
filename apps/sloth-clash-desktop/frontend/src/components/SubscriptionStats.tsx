import { useTranslation } from 'react-i18next'

import '../styles/panel.css'
import { Progress } from '../ui/M3'
import { formatBytesSmart } from '../utils/format'
import {
  parseSubscriptionUsage,
  subscriptionDaysLeft,
} from '../utils/subscription'

export function SubscriptionStats({ profile }: { profile: unknown }) {
  const { t, i18n } = useTranslation()
  const usage = parseSubscriptionUsage(profile)
  const days = subscriptionDaysLeft(usage)
  const remaining = usage
    ? usage.totalBytes > 0
      ? formatBytesSmart(Math.max(0, usage.totalBytes - usage.usedBytes))
      : '∞'
    : '—'
  const leftPercent =
    usage && usage.totalBytes > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((usage.totalBytes - usage.usedBytes) / usage.totalBytes) * 100,
            ),
          ),
        )
      : null
  return (
    <dl className="subscriptionStats">
      <div className="subscriptionStat">
        <dt>{t('expressive.trafficLeft')}</dt>
        <dd>{remaining}</dd>
        {leftPercent !== null ? (
          <Progress
            className="subscriptionStatBar"
            value={leftPercent}
            ariaLabel={t('expressive.trafficLeft')}
          />
        ) : null}
      </div>
      <div className="subscriptionStat">
        <dt>{t('expressive.daysLeft')}</dt>
        <dd>{days === null ? '—' : Math.max(0, days)}</dd>
      </div>
      <div className="subscriptionStat">
        <dt>{t('expressive.expires')}</dt>
        <dd>
          {usage?.expiresAt
            ? new Date(usage.expiresAt * 1000).toLocaleDateString(i18n.language)
            : '—'}
        </dd>
      </div>
    </dl>
  )
}

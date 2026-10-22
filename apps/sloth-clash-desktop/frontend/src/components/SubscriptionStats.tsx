import { useTranslation } from 'react-i18next'

import { formatBytesSmart } from '../utils/format'
import {
  parseSubscriptionUsage,
  subscriptionDaysLeft,
} from '../utils/subscription'

export function SubscriptionStats({
  profile,
  compact = false,
}: {
  profile: unknown
  compact?: boolean
}) {
  const { t, i18n } = useTranslation()
  const usage = parseSubscriptionUsage(profile)
  const days = subscriptionDaysLeft(usage)
  const remaining = usage
    ? usage.totalBytes > 0
      ? formatBytesSmart(Math.max(0, usage.totalBytes - usage.usedBytes))
      : '∞'
    : '—'
  return (
    <dl className={`subscriptionStats${compact ? ' compact' : ''}`}>
      <div>
        <dt>{t('expressive.trafficLeft')}</dt>
        <dd>{remaining}</dd>
      </div>
      <div>
        <dt>{t('expressive.daysLeft')}</dt>
        <dd>{days === null ? '—' : Math.max(0, days)}</dd>
      </div>
      {!compact ? (
        <div>
          <dt>{t('expressive.expires')}</dt>
          <dd>
            {usage?.expiresAt
              ? new Date(usage.expiresAt * 1000).toLocaleDateString(
                  i18n.language,
                )
              : '—'}
          </dd>
        </div>
      ) : null}
    </dl>
  )
}

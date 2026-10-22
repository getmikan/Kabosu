import { useTranslation } from 'react-i18next'

import { Skeleton } from '../ui/M3'

export function PageSkeleton() {
  const { t } = useTranslation()
  return (
    <div
      className="pageSkeleton"
      aria-busy="true"
      aria-label={t('expressive.loading')}
    >
      <Skeleton className="skLine" />
      <Skeleton className="skLine short" />
      <div className="skGrid">
        {[0, 1, 2].map((key) => (
          <Skeleton className="skCard" key={key} />
        ))}
      </div>
    </div>
  )
}

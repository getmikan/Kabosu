import { useTranslation } from 'react-i18next'

export function PageSkeleton() {
  const { t } = useTranslation()
  return (
    <div
      className="pageSkeleton"
      aria-busy="true"
      aria-label={t('expressive.loading')}
    >
      <div className="skeletonLine" />
      <div className="skeletonLine short" />
      <div className="skeletonGrid">
        {[0, 1, 2].map((key) => (
          <div className="skeletonCard" key={key} />
        ))}
      </div>
    </div>
  )
}

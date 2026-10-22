import { useTranslation } from 'react-i18next'

import { Button, Dialog, IconButton, Shape } from '../ui/M3'
import { formatProviderUpdatedAt } from '../utils/format'

import '../styles/rules.css'

/**
 * Rule-provider management dialog. Profiles with 10+ providers get their own
 * scroll area; the Rules screen only shows a trigger button with the count.
 */
export function RuleProvidersModal({
  open,
  providers,
  busyMap,
  errMap,
  bulkBusy,
  onRefreshOne,
  onRefreshAll,
  onClose,
}: {
  open: boolean
  providers: any[]
  busyMap: Record<string, boolean>
  errMap: Record<string, string>
  bulkBusy: boolean
  onRefreshOne: (name: string) => void
  onRefreshAll: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={`${t('ui.rules.providersHeading')} (${providers.length})`}
      actions={
        <>
          <Button
            variant="tonal"
            busy={bulkBusy}
            disabled={providers.length === 0}
            onClick={onRefreshAll}
            title={t('ui.rules.providersUpdateAll')}
          >
            {bulkBusy
              ? t('ui.rules.providersUpdating')
              : t('ui.rules.providersUpdateAll')}
          </Button>
          <Button
            variant="text"
            onClick={onClose}
            aria-label={t('ui.rules.providersClose')}
          >
            {t('ui.rules.providersClose')}
          </Button>
        </>
      }
    >
      {providers.length === 0 ? (
        <div className="emptyState">
          <Shape name="pentagon" />
          <p>{t('ui.rules.providersEmpty')}</p>
        </div>
      ) : (
        <div className="ruProvGrid stagger">
          {providers.map((p, i) => {
            const busy = Boolean(busyMap[p.name])
            const err = errMap[p.name]
            return (
              <div
                key={p.name}
                className="ruProv"
                data-error={err ? true : undefined}
                style={{ '--i': i } as React.CSSProperties}
              >
                <div className="ruProvTop">
                  <div className="ruProvTitle" title={p.name}>
                    {p.name}
                  </div>
                  <span className="ruProvSpin" data-busy={busy || undefined}>
                    <IconButton
                      icon="refresh"
                      label={t('ui.rules.providersUpdate')}
                      disabled={busy || bulkBusy}
                      onClick={() => onRefreshOne(p.name)}
                    />
                  </span>
                </div>
                <div className="ruProvMeta">
                  {p.behavior} · {p.vehicleType} · {p.ruleCount}
                </div>
                <span className="ruProvUpdated">
                  {formatProviderUpdatedAt(p.updatedAt)}
                </span>
                {err ? (
                  <p className="ruProvErr" role="alert">
                    {t('ui.rules.providerUpdateFailed')}: {err}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </Dialog>
  )
}

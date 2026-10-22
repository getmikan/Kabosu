import { useTranslation } from 'react-i18next'

import '../styles/profile-dialogs.css'
import { Button, Dialog } from '../ui/M3'

export type InstallConfigRequest = {
  name: string
  url: string
  host: string
}

// A web page can trigger the kabosu:// scheme, so an import that arrives via
// a deep link is always confirmed by the user before anything is fetched.
export function InstallConfigConfirmModal({
  request,
  busy,
  onCancel,
  onConfirm,
}: {
  request: InstallConfigRequest | null
  busy: boolean
  onCancel: () => void
  onConfirm: (request: InstallConfigRequest) => void
}) {
  const { t } = useTranslation()
  if (!request) return null
  return (
    <Dialog
      open
      onClose={onCancel}
      disableClose={busy}
      dismissible={!busy}
      title={t('installConfig.title')}
      actions={
        <>
          <Button variant="text" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="filled"
            busy={busy}
            onClick={() => onConfirm(request)}
          >
            {busy ? t('installConfig.adding') : t('installConfig.confirm')}
          </Button>
        </>
      }
    >
      <p className="pdBody">{t('installConfig.lead')}</p>
      <div className="pdDetails">
        <div className="pdRow">
          <span className="pdLabel">{t('installConfig.source')}</span>
          <strong>{request.host}</strong>
        </div>
        {request.name ? (
          <div className="pdRow">
            <span className="pdLabel">{t('installConfig.name')}</span>
            <span>{request.name}</span>
          </div>
        ) : null}
        <div className="pdRow">
          <span className="pdLabel">{t('installConfig.url')}</span>
          <code className="pdUrl">{request.url}</code>
        </div>
      </div>
      <p className="inlineWarning">{t('installConfig.warning')}</p>
    </Dialog>
  )
}

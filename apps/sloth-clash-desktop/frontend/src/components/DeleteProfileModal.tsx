import { useTranslation } from 'react-i18next'

import '../styles/profile-dialogs.css'
import { Button, Dialog } from '../ui/M3'

export type DeleteProfileTarget = { id: string; name: string }

export function DeleteProfileModal({
  target,
  onClose,
  onConfirm,
}: {
  target: DeleteProfileTarget | null
  onClose: () => void
  onConfirm: (id: string) => void
}) {
  const { t } = useTranslation()
  if (!target) return null
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('ui.profiles.deleteModal.title')}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="filled" onClick={() => onConfirm(target.id)}>
            {t('common.delete')}
          </Button>
        </>
      }
    >
      <p className="pdBody">
        {t('ui.profiles.deleteModal.bodyPrefix')} <strong>{target.name}</strong>{' '}
        {t('ui.profiles.deleteModal.bodySuffix')}
      </p>
    </Dialog>
  )
}

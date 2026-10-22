import { useTranslation } from 'react-i18next'

import '../styles/settings.css'
import { Button, Dialog } from '../ui/M3'

export type SettingsResetMode = 'keep_profiles' | 'with_profiles'

export function SettingsResetModal({
  mode,
  onClose,
  onConfirm,
}: {
  mode: SettingsResetMode | null
  onClose: () => void
  onConfirm: (withProfiles: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={mode !== null}
      onClose={onClose}
      title={t('settings.resetModal.title')}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="filled"
            className="stDangerFilled"
            onClick={() => onConfirm(mode === 'with_profiles')}
          >
            {t('settings.resetModal.reset')}
          </Button>
        </>
      }
    >
      <p className="muted stDialogText">
        {mode === 'with_profiles'
          ? t('settings.resetModal.withProfilesBody')
          : t('settings.resetModal.keepProfilesBody')}
      </p>
    </Dialog>
  )
}

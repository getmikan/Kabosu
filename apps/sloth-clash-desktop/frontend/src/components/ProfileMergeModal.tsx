import { useTranslation } from 'react-i18next'

import { MonacoYamlEditor } from '../MonacoYamlEditor'
import '../styles/editors.css'
import { Button, Dialog } from '../ui/M3'

export type ProfileModalTarget = { id: string; name: string }

export function ProfileMergeModal({
  target,
  value,
  yamlError,
  onChange,
  onResetScaffold,
  onClose,
  onSave,
}: {
  target: ProfileModalTarget | null
  value: string
  yamlError: string | null
  onChange: (next: string) => void
  onResetScaffold: () => void
  onClose: () => void
  onSave: (id: string) => void
}) {
  const { t } = useTranslation()
  if (!target) return null
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      className="edDialogWide"
      title={t('ui.profiles.mergeModal.title')}
      actions={
        <>
          <Button variant="outlined" onClick={onResetScaffold}>
            {t('ui.profiles.mergeModal.resetScaffold')}
          </Button>
          <Button variant="text" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={Boolean(yamlError)} onClick={() => onSave(target.id)}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="edBody">
        <p className="edBlurb">
          {t('ui.profiles.mergeModal.blurbLead')} <code>prepend</code> /{' '}
          <code>append</code> / <code>delete</code>{' '}
          {t('ui.profiles.mergeModal.blurbTail')} <code>config.yaml</code>.
        </p>
        <div className="edField">
          <span className="edFieldLabel">
            {target.name}{' '}
            <span className="optional">
              {t('ui.profiles.mergeModal.mergeYaml')}
            </span>
          </span>
          <MonacoYamlEditor value={value} onChange={onChange} />
          {yamlError ? (
            <p className="edError" role="alert">
              {t('common.yamlError', { error: yamlError })}
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  )
}

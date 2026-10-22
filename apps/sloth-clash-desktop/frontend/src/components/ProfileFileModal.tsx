import { useTranslation } from 'react-i18next'

import { MonacoYamlEditor } from '../MonacoYamlEditor'
import '../styles/editors.css'
import { Button, Dialog } from '../ui/M3'

import type { ProfileModalTarget } from './ProfileMergeModal'

export function ProfileFileModal({
  target,
  path,
  loadError,
  value,
  yamlError,
  onChange,
  onCopyPath,
  onClose,
  onSave,
}: {
  target: ProfileModalTarget | null
  path: string
  loadError: string | null
  value: string
  yamlError: string | null
  onChange: (next: string) => void
  onCopyPath: (path: string) => void
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
      title={t('ui.profiles.fileModal.title')}
      actions={
        <>
          <Button
            variant="outlined"
            disabled={!path}
            onClick={() => onCopyPath(path)}
          >
            {t('ui.profiles.fileModal.copyPath')}
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
        <p className="edPath mono allowSelect">{path}</p>
        {loadError ? (
          <p className="edError" role="alert">
            {t('ui.profiles.fileModal.readErrorLead', { error: loadError })}
          </p>
        ) : null}
        <div className="edField">
          <span className="edFieldLabel">
            {target.name}{' '}
            <span className="optional">
              {t('ui.profiles.fileModal.loadedConfig')}
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

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ClearProfileScriptOverride,
  PreviewProfileScript,
  SetProfileScriptOverride,
} from '../api/profile'
import { MonacoDiffViewer, MonacoScriptEditor } from '../MonacoYamlEditor'
import '../styles/editors.css'
import { Button, Dialog, Segmented } from '../ui/M3'

import type { ProfileModalTarget } from './ProfileMergeModal'

// Seeded into an empty editor so the contract is discoverable without docs: the
// entry point, both arguments, and the one rule that surprises people (you must
// return the config).
const STARTER_SCRIPT = `// Transforms this profile's generated config before the core sees it.
// Return the config — whatever you return is what gets used.
//
//   config  the full config, after Kabosu's own overlays
//   ctx     { traffic: 'tun' | 'proxy', platform, appVersion }
//
// Ports, the controller endpoint and its secret are re-applied after this runs,
// so the app can always reach its own core. Everything else is yours.

function main(config, ctx) {
  // Example: name every node with the country flag it already carries.
  // config.proxies = config.proxies.map(function (p) { return p })

  return config
}
`

type PreviewState = {
  withScript: string
  withoutScript: string
  changed: boolean
  result: {
    ran?: boolean
    applied?: boolean
    error?: string
    line?: number
    column?: number
    console?: string[]
    consoleTruncated?: boolean
    durationMs?: number
  }
}

function scriptFromProfile(profiles: any[] | undefined, id: string): string {
  const p = (profiles ?? []).find((x: any) => String(x?.id) === id)
  return String(p?.scriptOverride ?? '')
}

function recordedErrorFromProfile(
  profiles: any[] | undefined,
  id: string,
): { error: string; line: number; column: number } | null {
  const p = (profiles ?? []).find((x: any) => String(x?.id) === id)
  const error = String(p?.scriptError ?? '').trim()
  if (!error) return null
  return {
    error,
    line: Number(p?.scriptErrorLine ?? 0),
    column: Number(p?.scriptErrorColumn ?? 0),
  }
}

export function ProfileScriptModal({
  target,
  profiles,
  onClose,
  onSaved,
  onError,
}: {
  target: ProfileModalTarget | null
  profiles: any[] | undefined
  onClose: () => void
  onSaved: (banner: string) => void
  onError: (msg: string) => void
}) {
  const { t } = useTranslation()
  const stored = target ? scriptFromProfile(profiles, target.id) : ''
  const recorded = useMemo(
    () => (target ? recordedErrorFromProfile(profiles, target.id) : null),
    [profiles, target],
  )

  const [draft, setDraft] = useState(stored.trim() ? stored : STARTER_SCRIPT)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showDiff, setShowDiff] = useState(false)

  if (!target) return null

  const runPreview = async () => {
    setPreviewing(true)
    try {
      const res: any = await PreviewProfileScript(target.id, draft)
      setPreview({
        withScript: String(res?.withScript ?? ''),
        withoutScript: String(res?.withoutScript ?? ''),
        changed: Boolean(res?.changed),
        result: res?.result ?? {},
      })
      setShowDiff(true)
    } catch (e: any) {
      onError(String(e))
    } finally {
      setPreviewing(false)
    }
  }

  const save = async () => {
    setBusy(true)
    try {
      // A draft that is still the untouched starter template is an empty script:
      // saving the comment block would badge the profile as "scripted" for
      // nothing and cost an engine construction on every generation.
      const body = draft.trim() === STARTER_SCRIPT.trim() ? '' : draft
      await SetProfileScriptOverride(target.id, body)
      onSaved(t('ui.profiles.scriptModal.savedBanner'))
    } catch (e: any) {
      onError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      await ClearProfileScriptOverride(target.id)
      onSaved(t('ui.profiles.scriptModal.clearedBanner'))
    } catch (e: any) {
      onError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const previewErr = preview?.result?.error?.trim()
  const previewConsole = preview?.result?.console ?? []
  const position =
    preview?.result?.line && preview.result.line > 0
      ? `${preview.result.line}:${preview.result.column ?? 0}`
      : ''

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      className="edDialogWide"
      title={
        <span className="edTitleRow">
          <span>{t('ui.profiles.scriptModal.title')}</span>
          <Segmented<'editor' | 'diff'>
            ariaLabel={t('ui.profiles.scriptModal.title')}
            value={showDiff ? 'diff' : 'editor'}
            options={[
              {
                value: 'editor',
                label: t('ui.profiles.scriptModal.editorTab'),
              },
              {
                value: 'diff',
                label: t('ui.profiles.scriptModal.diffTab'),
                disabled: !preview,
              },
            ]}
            onChange={(next) => setShowDiff(next === 'diff')}
          />
        </span>
      }
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="outlined" disabled={busy} onClick={() => void clear()}>
            {t('ui.profiles.scriptModal.clear')}
          </Button>
          <Button
            variant="tonal"
            busy={previewing}
            disabled={busy}
            onClick={() => void runPreview()}
          >
            {previewing
              ? t('ui.profiles.scriptModal.previewing')
              : t('ui.profiles.scriptModal.preview')}
          </Button>
          <Button busy={busy} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="edBody">
        {/* A failure recorded by the last real generation, so the user sees why
            the profile is badged without having to press Preview first. */}
        {recorded && !preview ? (
          <p className="edError" role="alert">
            {recorded.line > 0
              ? t('ui.profiles.scriptModal.recordedErrorAt', {
                  error: recorded.error,
                  line: recorded.line,
                  column: recorded.column,
                })
              : t('ui.profiles.scriptModal.recordedError', {
                  error: recorded.error,
                })}
          </p>
        ) : null}

        {showDiff && preview ? (
          <div className="edField">
            <span className="edEyebrow">
              {preview.changed
                ? t('ui.profiles.scriptModal.diffChanged')
                : t('ui.profiles.scriptModal.diffUnchanged')}
            </span>
            <MonacoDiffViewer
              original={preview.withoutScript}
              modified={preview.withScript}
              language="yaml"
            />
          </div>
        ) : (
          <div className="edField">
            <span className="edFieldLabel">
              {t('ui.profiles.scriptModal.editorLabel')}
            </span>
            <MonacoScriptEditor value={draft} onChange={setDraft} />
          </div>
        )}

        {previewErr ? (
          <p className="edError" role="alert">
            {position
              ? t('ui.profiles.scriptModal.failedAt', {
                  error: previewErr,
                  position,
                })
              : t('ui.profiles.scriptModal.failed', { error: previewErr })}
          </p>
        ) : null}

        {previewConsole.length > 0 ? (
          <div className="edConsole">
            <span className="edEyebrow">
              {t('ui.profiles.scriptModal.consoleLabel')}
            </span>
            <pre className="edConsoleOut allowSelect">
              {previewConsole.join('\n')}
              {preview?.result?.consoleTruncated
                ? `\n${t('ui.profiles.scriptModal.consoleTruncated')}`
                : ''}
            </pre>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}

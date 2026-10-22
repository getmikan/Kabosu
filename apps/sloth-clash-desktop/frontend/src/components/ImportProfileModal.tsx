import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import '../styles/profile-dialogs.css'
import { Button, Dialog, Segmented, TextField } from '../ui/M3'

export type ImportMode = 'url' | 'paste'

const SCHEME_RE = /\b(?:vless|vmess|ss|trojan|hysteria2|hy2|tuic):\/\//gi

function countLinks(s: string): number {
  const m = s.match(SCHEME_RE)
  return m ? m.length : 0
}

function looksLikeYaml(s: string): boolean {
  return /^[ \t]*(proxies|proxy-groups|proxy-providers|rule-providers|rules|dns|tun)\s*:/m.test(
    s,
  )
}

function tryBase64(s: string): string {
  try {
    return atob(s.replace(/\s+/g, ''))
  } catch {
    return ''
  }
}

type Detection = { kind: 'yaml' | 'links' | 'unknown'; label: string }

type TranslateFn = (key: string, options?: Record<string, unknown>) => string

function detect(raw: string, t: TranslateFn): Detection | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (looksLikeYaml(trimmed))
    return { kind: 'yaml', label: t('ui.profiles.importModal.detectYaml') }
  const n = countLinks(trimmed)
  if (n > 0)
    return {
      kind: 'links',
      label: t(
        n > 1
          ? 'ui.profiles.importModal.detectLinksPlural'
          : 'ui.profiles.importModal.detectLinksSingular',
        { count: n },
      ),
    }
  const dec = tryBase64(trimmed)
  if (dec) {
    const m = countLinks(dec)
    if (m > 0)
      return {
        kind: 'links',
        label: t(
          m > 1
            ? 'ui.profiles.importModal.detectLinksBase64Plural'
            : 'ui.profiles.importModal.detectLinksBase64Singular',
          { count: m },
        ),
      }
  }
  return {
    kind: 'unknown',
    label: t('ui.profiles.importModal.detectUnknown'),
  }
}

export function ImportProfileModal({
  open,
  title,
  blurb,
  mode,
  url,
  name,
  content,
  busy,
  onModeChange,
  onUrlChange,
  onNameChange,
  onContentChange,
  onPasteFromClipboard,
  onClose,
  onSubmit,
  hidePaste,
}: {
  open: boolean
  title: string
  blurb: string
  mode: ImportMode
  url: string
  name: string
  content: string
  busy: boolean
  // Brand hide flag: drop the paste/local-config tab, URL-only import.
  hidePaste?: boolean
  onModeChange: (next: ImportMode) => void
  onUrlChange: (next: string) => void
  onNameChange: (next: string) => void
  onContentChange: (next: string) => void
  onPasteFromClipboard: () => void
  onClose: () => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  if (!open) return null

  const effectiveMode: ImportMode = hidePaste ? 'url' : mode
  const detection = effectiveMode === 'paste' ? detect(content, t) : null
  const canSubmit =
    !busy &&
    (effectiveMode === 'url'
      ? url.trim().length > 0
      : content.trim().length > 0 && detection?.kind !== 'unknown')

  const onFilePicked = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    onContentChange(text)
  }

  return (
    <Dialog
      open
      wide={effectiveMode === 'paste'}
      onClose={onClose}
      title={title}
      actions={
        <>
          <div className="pdFooterLeft">
            <Button variant="outlined" onClick={onPasteFromClipboard}>
              {t('ui.profiles.importModal.pasteFromClipboard')}
            </Button>
            {effectiveMode === 'paste' ? (
              <>
                <Button
                  variant="outlined"
                  onClick={() => fileRef.current?.click()}
                >
                  {t('ui.profiles.importModal.loadFromFile')}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  className="pdHiddenFile"
                  accept=".yaml,.yml,.txt,.conf,text/*"
                  onChange={(e) => {
                    void onFilePicked(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </>
            ) : null}
          </div>
          <Button variant="text" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="filled"
            busy={busy}
            disabled={!canSubmit && !busy}
            onClick={onSubmit}
          >
            {t('common.import')}
          </Button>
        </>
      }
    >
      <p className="pdBlurb muted small">{blurb}</p>

      {hidePaste ? null : (
        <Segmented
          className="pdModes"
          value={effectiveMode}
          onChange={onModeChange}
          options={[
            { value: 'url', label: t('ui.profiles.importModal.tabUrl') },
            { value: 'paste', label: t('ui.profiles.importModal.tabPaste') },
          ]}
        />
      )}

      {effectiveMode === 'url' ? (
        <TextField
          value={url}
          onChange={onUrlChange}
          label={t('ui.profiles.importModal.subscriptionUrl')}
          placeholder="https://…"
          autoFocus
        />
      ) : (
        <TextField
          className="pdTextarea"
          multiline
          rows={10}
          mono
          spellCheck={false}
          value={content}
          onChange={onContentChange}
          label={
            <>
              {t('ui.profiles.importModal.configOrLinks')}
              {detection ? (
                <span className={`pdDetect pdDetect-${detection.kind}`}>
                  {' '}
                  · {detection.label}
                </span>
              ) : null}
            </>
          }
          placeholder={t('ui.profiles.importModal.pastePlaceholder')}
        />
      )}

      <TextField
        value={name}
        onChange={onNameChange}
        label={
          <>
            {t('ui.profiles.importModal.displayName')}{' '}
            <span className="optional">{t('common.optional')}</span>
          </>
        }
        placeholder={
          effectiveMode === 'url'
            ? t('ui.profiles.importModal.namePlaceholderUrl')
            : t('ui.profiles.importModal.namePlaceholderPaste')
        }
      />
    </Dialog>
  )
}

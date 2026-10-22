import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApplyBrandDebugHeaders } from '../api/branding'
import '../styles/advanced.css'
import { Button, Card, TextField } from '../ui/M3'

const SAMPLE = `X-Brand-Desktop-Enabled: true
X-Brand-Desktop-Name: ExampleVPN
X-Brand-Desktop-Accent-Color: #3d7eff
X-Brand-Desktop-Support-URL: https://support.example.com
X-Brand-Desktop-Greeting: Привет!
X-Brand-Desktop-Hide-Global-Mode: true
X-Brand-Desktop-Hide-Proxy-Mode: false
X-Brand-Desktop-Hide-Advanced: false`

/**
 * Dev-only brand header injector (Advanced page, `wails dev` builds).
 * Feeds typed header lines through the real capture pipeline for the active
 * profile; the next real subscription refresh overwrites the override.
 */
export function BrandDebugPanel() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [text, setText] = useState(SAMPLE)
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)

  const apply = async (raw: string) => {
    setBusy(true)
    try {
      const out = await ApplyBrandDebugHeaders(raw)
      setResult(JSON.stringify(out, null, 2))
    } catch (e) {
      setResult(String(e))
    } finally {
      setBusy(false)
      void qc.invalidateQueries({ queryKey: ['active-branding'] })
    }
  }

  return (
    <Card className="adCard adDebug">
      <h3 className="adCardTitle">{t('ui.advanced.brandDebugTitle')}</h3>
      <p className="adNote">{t('ui.advanced.brandDebugHint')}</p>
      <TextField
        multiline
        mono
        rows={9}
        spellCheck={false}
        ariaLabel={t('ui.advanced.brandDebugTitle')}
        value={text}
        onChange={setText}
      />
      <div className="adBtnRow">
        <Button busy={busy} onClick={() => void apply(text)}>
          {t('ui.advanced.brandDebugApply')}
        </Button>
        <Button
          variant="outlined"
          disabled={busy}
          onClick={() => void apply('')}
        >
          {t('ui.advanced.brandDebugClear')}
        </Button>
      </div>
      {result ? <pre className="adDebugResult allowSelect">{result}</pre> : null}
    </Card>
  )
}

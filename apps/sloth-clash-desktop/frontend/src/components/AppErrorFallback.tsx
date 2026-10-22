// Last-resort UI shown by the top-level ErrorBoundary when a render throws.
// Deliberately dependency-free (plain strings, no i18n/hooks) — it must render
// even if the thing that broke is a provider/translation. The backend + tunnel
// keep running (only the WebView UI process is affected), so a reload recovers.
import type { FallbackProps } from 'react-error-boundary'

import '../styles/advanced.css'
import { Button, Shape } from '../ui/M3'

export function AppErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error')
  return (
    <div className="adErrorPage" role="alert">
      <div className="adErrorCard">
        <span className="adErrorShape">
          <Shape name="boom" />
        </span>
        <h2 className="adErrorTitle">Something went wrong</h2>
        <p className="adErrorLead">
          The interface hit an unexpected error. Your connection is unaffected —
          reload the window to recover.
        </p>
        <pre className="adErrorDetail allowSelect">{message}</pre>
        <div className="adErrorActions">
          <Button onClick={resetErrorBoundary}>Try again</Button>
          <Button variant="outlined" onClick={() => window.location.reload()}>
            Reload window
          </Button>
        </div>
      </div>
    </div>
  )
}

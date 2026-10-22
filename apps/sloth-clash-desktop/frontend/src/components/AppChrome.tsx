import { useTranslation } from 'react-i18next'

import { Quit, WindowMinimise, WindowToggleMaximise } from '../api/runtime'
import { NAV_DEFS } from '../nav'
import type { Screen } from '../types/app'

import { MaterialSymbol } from './MaterialSymbol'

export function AppChrome({
  screen,
  connected,
  connectionLabel,
  theme,
  onToggleTheme,
}: {
  screen: Screen
  connected: boolean
  connectionLabel: string
  theme: 'dark' | 'light' | 'system'
  onToggleTheme: () => void
}) {
  const { t } = useTranslation()
  const current = NAV_DEFS.find((item) => item.id === screen)
  return (
    <header className="appChrome">
      <div className="appChromeTitle">
        <h1>{current ? t(current.labelKey) : 'Kabosu'}</h1>
      </div>
      <div className="appChromeActions">
        <span
          className={`chromeStatus ${connected ? 'connected' : ''}`}
          hidden={screen === 'home'}
        >
          <MaterialSymbol name="shield" />
          <span>{connectionLabel}</span>
        </span>
        <button
          className="chromeIconButton"
          type="button"
          onClick={onToggleTheme}
          title={t('expressive.toggleTheme')}
          aria-label={t('expressive.toggleTheme')}
        >
          <MaterialSymbol name={theme === 'light' ? 'moon' : 'sun'} />
        </button>
        <div className="windowControls">
          <button
            type="button"
            onClick={WindowMinimise}
            aria-label={t('expressive.minimize')}
            title={t('expressive.minimize')}
          >
            <MaterialSymbol name="minimize" />
          </button>
          <button
            type="button"
            onClick={WindowToggleMaximise}
            aria-label={t('expressive.maximize')}
            title={t('expressive.maximize')}
          >
            <MaterialSymbol name="maximize" />
          </button>
          <button
            className="windowClose"
            type="button"
            onClick={Quit}
            aria-label={t('expressive.closeWindow')}
            title={t('expressive.closeWindow')}
          >
            <MaterialSymbol name="close" />
          </button>
        </div>
      </div>
    </header>
  )
}

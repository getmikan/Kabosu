import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { Quit, WindowMinimise, WindowToggleMaximise } from '../api/runtime'
import { NAV_DEFS } from '../nav'
import type { Screen } from '../types/app'
import { IconButton } from '../ui/M3'

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
  const title = current ? t(current.labelKey) : 'Kabosu'
  return (
    <header className="appChrome">
      <div className="appChromeTitle">
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
          >
            {title}
          </motion.h1>
        </AnimatePresence>
      </div>
      <div className="appChromeActions">
        {screen !== 'home' ? (
          <span className={`chromeStatus ${connected ? 'connected' : ''}`}>
            <MaterialSymbol name="shield" />
            <span>{connectionLabel}</span>
          </span>
        ) : null}
        <IconButton
          label={t('expressive.toggleTheme')}
          icon={theme === 'light' ? 'moon' : 'sun'}
          onClick={onToggleTheme}
        />
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

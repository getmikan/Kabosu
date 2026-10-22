import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import appIcon from '../assets/images/logo-universal.png'
import { NAV_DEFS } from '../nav'
import { IconChevronNav } from '../navIcons'
import type { Screen } from '../types/app'

export function SidebarNav({
  screen,
  onChange,
  collapsed,
  onToggleCollapse,
  hiddenScreens,
  activeScreens,
}: {
  screen: Screen
  onChange: (next: Screen) => void
  collapsed: boolean
  onToggleCollapse: () => void
  hiddenScreens?: Screen[]
  activeScreens?: Screen[]
}) {
  const { t } = useTranslation()
  return (
    <aside className="nav">
      <div className="navBrand" title="Kabosu">
        <img
          src={appIcon}
          width="44"
          height="44"
          alt={collapsed ? 'Kabosu' : ''}
        />
        {!collapsed ? (
          <div>
            <strong>Kabosu</strong>
          </div>
        ) : null}
      </div>
      <nav className="navList" aria-label={t('expressive.navigation')}>
        {NAV_DEFS.filter(({ id }) => !hiddenScreens?.includes(id)).map(
          ({ id, labelKey, Icon }) => (
            <motion.button
              key={id}
              type="button"
              whileTap={{ scale: 0.96 }}
              className={screen === id ? 'navItem active' : 'navItem'}
              title={t(labelKey)}
              aria-label={collapsed ? t(labelKey) : undefined}
              aria-current={screen === id ? 'page' : undefined}
              onClick={() => onChange(id)}
            >
              {screen === id ? (
                <motion.span
                  className="navIndicator"
                  layoutId="navigation-indicator"
                  transition={{ type: 'spring', stiffness: 440, damping: 36 }}
                />
              ) : null}
              <span className="navIcon">
                <Icon />
                {activeScreens?.includes(id) ? (
                  <span className="navActiveDot" aria-hidden />
                ) : null}
              </span>
              <span className="navLabel">{t(labelKey)}</span>
            </motion.button>
          ),
        )}
      </nav>
      <button
        type="button"
        className="navCollapseBtn"
        title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
        aria-label={
          collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')
        }
        onClick={onToggleCollapse}
      >
        <span className={`navChevronWrap ${collapsed ? 'collapsed' : ''}`}>
          <IconChevronNav />
        </span>
        {!collapsed ? <span>{t('nav.collapseSidebar')}</span> : null}
      </button>
    </aside>
  )
}

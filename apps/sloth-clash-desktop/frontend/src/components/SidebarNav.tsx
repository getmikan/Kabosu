import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import appIcon from '../assets/images/logo-universal.png'
import { NAV_DEFS } from '../nav'
import { IconChevronNav } from '../navIcons'
import type { Screen } from '../types/app'
import { IconButton, Shape, type ShapeName } from '../ui/M3'

const LOGO_SHAPES: ShapeName[] = ['9-sided-cookie', 'sunny', 'flower', 'soft-burst']

// Hand-built M3 navigation: compact = rail (icon in a pill, label below),
// expanded = drawer (full-width pill with icon and label in one row). The
// active pill slides between items with a shared-layout spring.
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
  const [logoStep, setLogoStep] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setLogoStep((n) => n + 1), 5200)
    return () => window.clearInterval(id)
  }, [])
  return (
    <aside className="nav" data-mode={collapsed ? 'rail' : 'drawer'}>
      <div className="navBrand" title="Kabosu">
        <span className="navBrandLogo">
          <Shape name={LOGO_SHAPES[logoStep % LOGO_SHAPES.length]} />
          <img src={appIcon} width="36" height="36" alt="" />
        </span>
        {!collapsed ? <strong>Kabosu</strong> : null}
      </div>
      <nav className="navList" aria-label={t('expressive.navigation')}>
        {NAV_DEFS.filter(({ id }) => !hiddenScreens?.includes(id)).map(
          ({ id, labelKey, Icon }) => {
            const active = screen === id
            return (
              <button
                key={id}
                type="button"
                className={active ? 'navItem active' : 'navItem'}
                title={t(labelKey)}
                aria-current={active ? 'page' : undefined}
                onClick={() => onChange(id)}
              >
                <span className="navPill">
                  {active ? (
                    <motion.span
                      className="navIndicator"
                      layoutId="nav-indicator"
                      transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                    />
                  ) : null}
                  <span className="navIcon">
                    <Icon />
                    {activeScreens?.includes(id) ? (
                      <span className="navActiveDot" aria-hidden />
                    ) : null}
                  </span>
                  {!collapsed ? (
                    <span className="navLabel">{t(labelKey)}</span>
                  ) : null}
                </span>
                {collapsed ? (
                  <span className="navLabel">{t(labelKey)}</span>
                ) : null}
              </button>
            )
          },
        )}
      </nav>
      <div className="navFooter">
        <IconButton
          variant="tonal"
          size="small"
          label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          icon={
            <span className="navToggleIcon">
              <IconChevronNav />
            </span>
          }
          onClick={onToggleCollapse}
        />
      </div>
    </aside>
  )
}

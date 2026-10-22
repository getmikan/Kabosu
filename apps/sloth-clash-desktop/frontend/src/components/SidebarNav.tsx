import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import appIcon from '../assets/images/logo-universal.png'
import { NAV_DEFS } from '../nav'
import { IconChevronNav } from '../navIcons'
import type { Screen } from '../types/app'
import { IconButton, Shape, type ShapeName } from '../ui/M3'

const LOGO_SHAPES: ShapeName[] = ['9-sided-cookie', 'sunny', 'flower', 'soft-burst']

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
    <aside className="nav">
      <div className="navBrand" title="Kabosu">
        <span className="navBrandLogo">
          <Shape name={LOGO_SHAPES[logoStep % LOGO_SHAPES.length]} />
          <img src={appIcon} width="36" height="36" alt="" />
        </span>
        {!collapsed ? <strong>Kabosu</strong> : null}
      </div>
      <m3e-nav-rail
        className="navRail"
        mode={collapsed ? 'compact' : 'expanded'}
        aria-label={t('expressive.navigation')}
      >
        {NAV_DEFS.filter(({ id }) => !hiddenScreens?.includes(id)).map(
          ({ id, labelKey, Icon }) => (
            <m3e-nav-item
              key={id}
              selected={screen === id}
              title={collapsed ? t(labelKey) : undefined}
              aria-current={screen === id ? 'page' : undefined}
              onClick={() => onChange(id)}
            >
              <span slot="icon" className="m3Icon">
                <Icon />
                {activeScreens?.includes(id) ? (
                  <span className="navActiveDot" aria-hidden />
                ) : null}
              </span>
              {t(labelKey)}
            </m3e-nav-item>
          ),
        )}
      </m3e-nav-rail>
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

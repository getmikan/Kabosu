import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import appIcon from '../assets/images/logo-universal.png'
import { NAV_DEFS } from '../nav'
import { IconChevronNav } from '../navIcons'
import type { Screen } from '../types/app'
import { IconButton, Shape, type ShapeName } from '../ui/M3'

import { MaterialSymbol } from './MaterialSymbol'

const LOGO_SHAPES: ShapeName[] = [
  '9-sided-cookie',
  'sunny',
  'flower',
  'soft-burst',
]

/** A newer release the nav offers to install (or, off Windows, to open). */
export type NavUpdate = {
  version: string
  /** true: one click downloads + installs; false: opens the release page. */
  installable: boolean
  /** Download progress 0–100, -1 while the size is unknown, null when idle. */
  progress: number | null
  onClick: () => void
}

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
  update,
}: {
  screen: Screen
  onChange: (next: Screen) => void
  collapsed: boolean
  onToggleCollapse: () => void
  hiddenScreens?: Screen[]
  activeScreens?: Screen[]
  update?: NavUpdate | null
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
                      transition={{
                        type: 'spring',
                        stiffness: 520,
                        damping: 38,
                      }}
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
      {update ? (
        <NavUpdateButton update={update} collapsed={collapsed} />
      ) : null}
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

function NavUpdateButton({
  update,
  collapsed,
}: {
  update: NavUpdate
  collapsed: boolean
}) {
  const { t } = useTranslation()
  const { progress } = update
  const downloading = progress !== null
  const pct = progress !== null && progress >= 0 ? Math.round(progress) : null
  const title = update.installable
    ? t('nav.updateTo', { version: update.version })
    : t('nav.updateOpenPage', { version: update.version })
  const label = downloading
    ? pct !== null
      ? `${pct}%`
      : '…'
    : collapsed
      ? t('nav.update')
      : `${t('nav.update')} ${update.version}`
  return (
    <motion.button
      type="button"
      className="navItem navUpdate"
      title={title}
      aria-label={title}
      aria-busy={downloading || undefined}
      disabled={downloading}
      onClick={update.onClick}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
    >
      <span className="navPill">
        {downloading ? (
          <span
            className="navUpdateFill"
            style={{ width: `${pct ?? 100}%` }}
            data-indeterminate={pct === null || undefined}
            aria-hidden
          />
        ) : null}
        <span className="navIcon">
          <MaterialSymbol name="download" />
        </span>
        {!collapsed ? <span className="navLabel">{label}</span> : null}
      </span>
      {collapsed ? <span className="navLabel">{label}</span> : null}
    </motion.button>
  )
}

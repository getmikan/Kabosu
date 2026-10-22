import { createInstance } from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { main } from '../api/models'
import ru from '../locales/ru.json'
import { ProxiesPage } from '../pages/Proxies'

import { OperatorModal } from './OperatorModal'
import { ProfileContextMenu } from './ProfileContextMenu'
import { ServerGroups } from './ServerGroups'

const i18n = createInstance()
beforeAll(async () => {
  await i18n.init({
    lng: 'ru',
    resources: { ru: { translation: ru } },
    interpolation: { escapeValue: false },
  })
})
const render = (element: React.ReactNode) =>
  renderToStaticMarkup(<I18nextProvider i18n={i18n}>{element}</I18nextProvider>)

describe('panel headers in the desktop UI', () => {
  it('shows native quota, packages, reset and exhaustion with a billing action', () => {
    const html = render(
      <ServerGroups
        metadata={{
          resetsAt: 1793491200,
          groups: [
            {
              id: 3,
              name: 'Premium',
              mode: 'own',
              used: 1024,
              left: 0,
              limit: 1024,
              extra: 128,
              exhausted: true,
            },
          ],
        } as main.MikanGroups}
        pageUrl="https://billing.example.test"
        onOpen={vi.fn()}
      />,
    )
    expect(html).toContain('Трафик группы закончился')
    expect(html).toContain('value="100"')
    expect(html).toContain('Добавить трафик')
    expect(html).toContain('Пакеты:')
  })
  it('escapes operator-controlled labels', () => {
    const html = render(
      <ServerGroups
        metadata={{
          groups: [
            {
              id: 1,
              name: '<script>alert(1)</script>',
              mode: 'unlimited',
              used: 0,
              extra: 0,
              exhausted: false,
            },
          ],
        } as main.MikanGroups}
        onOpen={vi.fn()}
      />,
    )
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
  it('does not invent server quotas without a supported header', () => {
    expect(render(<ServerGroups onOpen={vi.fn()} />)).toBe('')
  })
  it('disables URL copying and script editing under per-profile policies', () => {
    const html = render(
      <ProfileContextMenu
        target={{ id: 'one', name: 'A', x: 0, y: 0 }}
        profile={{
          url: 'https://panel.example.test/sub',
          panel: {
            shareLinksLocked: true,
            brand: { lockConfigScript: true } as main.BrandManifest,
          } as main.SubscriptionPanel,
        }}
        onUpdate={vi.fn()}
        onEditInfo={vi.fn()}
        onCopyUrl={vi.fn()}
        onOpenRules={vi.fn()}
        onDelete={vi.fn()}
        onOpenExtendConfig={vi.fn()}
        onOpenProxyGroups={vi.fn()}
        onOpenScript={vi.fn()}
        onOpenEditFile={vi.fn()}
      />,
    )
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Копировать URL подписки<\/button>/,
    )
    expect(html).toContain('Провайдер отключил скрипты')
  })
  it('never offers global routing when the operator pins rule mode', () => {
    const html = render(
      <ProxiesPage
        groups={[]}
        activeGroup=""
        connectionStatus="disconnected"
        displayMode="rule"
        showBuiltin={false}
        proxyDelayBusy={{}}
        proxyDelayMap={{}}
        proxyDelayErr={{}}
        error={null}
        hideGlobalMode
        onRefreshProxies={vi.fn()}
        onToggleShowBuiltin={vi.fn()}
        onSetMode={vi.fn()}
        onSelectNode={vi.fn()}
        onSelectGroup={vi.fn()}
        onPingAll={vi.fn()}
      />,
    )
    expect(html).not.toContain(`>${ru.ui.common.global}<`)
    expect(html).toContain('Вид групп')
  })
  it('renders an operator page with account fallback and fixed app attribution', () => {
    const html = render(
      <OperatorModal
        embedded
        open
        branding={
          {
            manifest: { enabled: true, name: 'Operator' } as main.BrandManifest,
          } as main.ActiveBranding
        }
        activeProfile={{
          panel: {
            webPageUrl: 'https://billing.example.test/me',
          } as main.SubscriptionPanel,
        }}
        deviceIdentity={null}
        appVersion="test"
        coreVersion="dev"
        serviceVersion=""
        lightUI
        onClose={vi.fn()}
        onBrowserOpen={vi.fn()}
      />,
    )
    expect(html).toContain('operatorPageCard')
    expect(html).toContain('Powered by Kabosu · Citrus')
    expect(html).not.toContain('aria-modal="true"')
  })
})

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CheckCustomProxies,
  DeleteAppRoute,
  DeleteCustomProxy,
  GetAppRouting,
} from '../api/apps'
import type { main } from '../api/models'
import { AppRouteDialog } from '../components/AppRouteDialog'
import { CustomProxyDialog } from '../components/CustomProxyDialog'
import { Button, Card, Dialog, IconButton, Shape, Skeleton } from '../ui/M3'
import {
  appName,
  type ProxyGroupLike,
  routableServers,
} from '../utils/appRouting'

import '../styles/apps.css'

function errText(e: unknown): string {
  const m = (e as { message?: string })?.message
  return String(m ?? e ?? '').trim()
}

export function AppsPage({
  appRouting,
  proxyGroups,
  traffic,
}: {
  appRouting?: main.AppRoutingState
  proxyGroups: ProxyGroupLike[]
  traffic: string
}) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<main.AppRoutingSettings | null>(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [proxyDialog, setProxyDialog] = useState<{
    proxy?: main.CustomProxy
  } | null>(null)
  const [routeDialog, setRouteDialog] = useState<{
    route?: main.AppRoute
  } | null>(null)
  const [deleting, setDeleting] = useState<main.CustomProxy | null>(null)
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    let alive = true
    GetAppRouting()
      .then((s) => alive && setSettings(s))
      .catch((e) => alive && setError(errText(e)))
    return () => {
      alive = false
    }
  }, [])

  const proxies = useMemo(() => settings?.proxies ?? [], [settings])
  const routes = useMemo(() => settings?.routes ?? [], [settings])
  const servers = useMemo(() => routableServers(proxyGroups), [proxyGroups])
  const down = useMemo(
    () => new Map((appRouting?.down ?? []).map((d) => [d.id, d])),
    [appRouting?.down],
  )
  const blocked = useMemo(() => {
    const set = new Set<string>()
    for (const issue of appRouting?.issues ?? [])
      if (issue.process) set.add(issue.process)
    for (const d of appRouting?.down ?? [])
      for (const r of routes) {
        if (r.target === `proxy:${d.id}`) set.add(r.process)
      }
    return set
  }, [appRouting, routes])

  const targetLabel = (target: string) => {
    if (target === 'direct') return t('ui.apps.targetDirect')
    if (target === 'reject') return t('ui.apps.targetReject')
    if (target.startsWith('proxy:')) {
      return (
        proxies.find((p) => `proxy:${p.id}` === target)?.name ?? target.slice(6)
      )
    }
    return target.replace(/^server:/, '')
  }

  const issueText = (issue: main.AppRoutingIssue) =>
    t(`ui.apps.issues.${issue.kind}`, {
      proxy: issue.proxy,
      process: issue.process ? appName(issue.process) : '',
      server: issue.server,
    })

  const run = async (
    id: string,
    fn: () => Promise<main.AppRoutingSettings>,
  ) => {
    setBusyId(id)
    setError('')
    try {
      setSettings(await fn())
    } catch (e) {
      setError(errText(e) || t('ui.apps.saveFailed'))
    } finally {
      setBusyId('')
    }
  }

  const check = async () => {
    setChecking(true)
    try {
      await CheckCustomProxies()
    } finally {
      setChecking(false)
    }
  }

  const routesTo = (proxy: main.CustomProxy) =>
    routes.filter((r) => r.target === `proxy:${proxy.id}`)

  return (
    <div className="page apPage">
      <h2 className="srOnly">{t('ui.apps.title')}</h2>
      <p className="pageLead">{t('ui.apps.lead')}</p>
      {traffic !== 'tun' ? (
        <p className="apNote">{t('ui.apps.tunHint')}</p>
      ) : null}

      {error ? (
        <div className="inlineError" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      {appRouting?.issues?.length ? (
        <div className="inlineError" role="alert">
          <ul className="apIssues">
            {appRouting.issues.map((issue) => (
              <li
                key={`${issue.kind}:${issue.proxy}:${issue.process}:${issue.server}`}
              >
                {issueText(issue)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card variant="filled">
        <section className="apSection" aria-labelledby="apProxiesTitle">
          <div className="apSectionHead">
            <h3 id="apProxiesTitle">{t('ui.apps.proxiesTitle')}</h3>
            {proxies.length ? (
              <Button
                variant="text"
                icon="refresh"
                busy={checking}
                onClick={() => void check()}
              >
                {t('ui.apps.check')}
              </Button>
            ) : null}
            <Button
              variant="tonal"
              icon="add"
              disabled={!settings}
              onClick={() => setProxyDialog({})}
            >
              {t('ui.apps.addProxy')}
            </Button>
          </div>
          {!settings ? (
            <div className="apRows" aria-busy="true">
              <Skeleton className="apSkeletonRow" />
              <Skeleton className="apSkeletonRow" />
            </div>
          ) : proxies.length === 0 ? (
            <div className="emptyState apEmpty">
              <Shape name="flower" />
              <p>{t('ui.apps.proxiesEmpty')}</p>
            </div>
          ) : (
            <ul className="apRows">
              {proxies.map((p) => {
                const failed = down.get(p.id)
                return (
                  <li
                    key={p.id}
                    className="apRow"
                    data-error={failed ? true : undefined}
                  >
                    <div className="apRowMain">
                      <span className="apRowTitle">{p.name}</span>
                      <span className="apRowMeta">
                        <span className="apPill">
                          {p.type === 'http' ? 'HTTP' : 'SOCKS5'}
                        </span>
                        <span className="apMono">
                          {p.server}:{p.port}
                        </span>
                        <span className="apPill">
                          {p.viaVpn === false
                            ? t('ui.apps.direct')
                            : t('ui.apps.viaVpn')}
                        </span>
                      </span>
                      {failed ? (
                        <span className="apRowError" role="status">
                          {t('ui.apps.down', { error: failed.error })}
                        </span>
                      ) : null}
                    </div>
                    <div className="apActions">
                      <IconButton
                        icon="edit"
                        label={t('ui.apps.edit')}
                        onClick={() => setProxyDialog({ proxy: p })}
                      />
                      <IconButton
                        icon="delete"
                        label={t('common.delete')}
                        disabled={busyId === p.id}
                        onClick={() => setDeleting(p)}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </Card>

      <Card variant="filled">
        <section className="apSection" aria-labelledby="apRoutesTitle">
          <div className="apSectionHead">
            <h3 id="apRoutesTitle">{t('ui.apps.routesTitle')}</h3>
            <Button
              variant="tonal"
              icon="add"
              disabled={!settings}
              onClick={() => setRouteDialog({})}
            >
              {t('ui.apps.addRoute')}
            </Button>
          </div>
          {!settings ? (
            <div className="apRows" aria-busy="true">
              <Skeleton className="apSkeletonRow" />
            </div>
          ) : routes.length === 0 ? (
            <div className="emptyState apEmpty">
              <Shape name="flower" />
              <p>{t('ui.apps.routesEmpty')}</p>
            </div>
          ) : (
            <ul className="apRows">
              {routes.map((r) => (
                <li
                  key={r.id}
                  className="apRow"
                  data-error={blocked.has(r.process) ? true : undefined}
                >
                  <div className="apRowMain">
                    <span className="apRowTitle">{appName(r.process)}</span>
                    {appName(r.process) !== r.process ? (
                      <span className="apRowMeta apMono" title={r.process}>
                        {r.process}
                      </span>
                    ) : null}
                  </div>
                  <span
                    className="apPill apTarget"
                    data-kind={r.target.split(':')[0]}
                  >
                    {targetLabel(r.target)}
                  </span>
                  <div className="apActions">
                    <IconButton
                      icon="edit"
                      label={t('ui.apps.edit')}
                      onClick={() => setRouteDialog({ route: r })}
                    />
                    <IconButton
                      icon="delete"
                      label={t('common.delete')}
                      disabled={busyId === r.id}
                      onClick={() => void run(r.id, () => DeleteAppRoute(r.id))}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>

      {proxyDialog ? (
        <CustomProxyDialog
          proxy={proxyDialog.proxy}
          onClose={() => setProxyDialog(null)}
          onSaved={(next) => {
            setSettings(next)
            setProxyDialog(null)
          }}
        />
      ) : null}
      {routeDialog ? (
        <AppRouteDialog
          route={routeDialog.route}
          proxies={proxies}
          servers={servers}
          onClose={() => setRouteDialog(null)}
          onSaved={(next) => {
            setSettings(next)
            setRouteDialog(null)
          }}
        />
      ) : null}
      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('ui.apps.deleteProxyTitle', { name: deleting?.name ?? '' })}
        actions={
          <>
            <Button variant="text" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                const p = deleting
                setDeleting(null)
                if (p) void run(p.id, () => DeleteCustomProxy(p.id))
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p>
          {deleting && routesTo(deleting).length
            ? t('ui.apps.deleteProxyRoutes', {
                apps: routesTo(deleting)
                  .map((r) => appName(r.process))
                  .join(', '),
              })
            : t('ui.apps.deleteProxyBody')}
        </p>
      </Dialog>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ListRunningApps, PickAppExecutable, SaveAppRoute } from '../api/apps'
import { main } from '../api/models'
import {
  Button,
  Dialog,
  Select,
  type SelectOption,
  Skeleton,
  TextField,
} from '../ui/M3'

function errText(e: unknown): string {
  const m = (e as { message?: string })?.message
  return String(m ?? e ?? '').trim()
}

/** Gives one application a route: own proxy, server, direct or block. */
export function AppRouteDialog({
  route,
  proxies,
  servers,
  onClose,
  onSaved,
}: {
  /** The route to edit; undefined adds a new one. */
  route?: main.AppRoute
  proxies: main.CustomProxy[]
  servers: string[]
  onClose: () => void
  onSaved: (next: main.AppRoutingSettings) => void
}) {
  const { t } = useTranslation()
  const [process, setProcess] = useState(route?.process ?? '')
  const [target, setTarget] = useState(
    route?.target ?? (proxies[0] ? `proxy:${proxies[0].id}` : 'direct'),
  )
  const [running, setRunning] = useState<main.RunningApp[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ListRunningApps()
      .then((apps) => alive && setRunning(apps ?? []))
      .catch(() => alive && setRunning([]))
    return () => {
      alive = false
    }
  }, [])

  const runningOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('ui.apps.routeDialog.runningPick') },
      ...(running ?? []).map((a) => ({ value: a.path, label: a.name })),
    ],
    [running, t],
  )

  const targetOptions = useMemo<SelectOption[]>(() => {
    const options: SelectOption[] = []
    if (proxies.length) {
      options.push({
        value: '#proxies',
        label: t('ui.apps.routeDialog.groupProxies'),
        disabled: true,
      })
      for (const p of proxies)
        options.push({ value: `proxy:${p.id}`, label: p.name })
    }
    if (servers.length) {
      options.push({
        value: '#servers',
        label: t('ui.apps.routeDialog.groupServers'),
        disabled: true,
      })
      for (const s of servers) options.push({ value: `server:${s}`, label: s })
    }
    options.push({ value: 'direct', label: t('ui.apps.targetDirect') })
    options.push({ value: 'reject', label: t('ui.apps.targetReject') })
    // A server that is gone from the current profile stays selectable, so
    // editing the route does not silently change it.
    if (!options.some((o) => o.value === target)) {
      options.push({
        value: target,
        label: target.replace(/^(server|proxy):/, ''),
      })
    }
    return options
  }, [proxies, servers, target, t])

  const browse = async () => {
    try {
      const path = await PickAppExecutable(t('ui.apps.routeDialog.pickTitle'))
      if (path) setProcess(path)
    } catch (e) {
      setError(errText(e))
    }
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      onSaved(
        await SaveAppRoute(
          new main.AppRoute({
            id: route?.id ?? '',
            process: process.trim(),
            target,
          }),
        ),
      )
    } catch (e) {
      setError(errText(e) || t('ui.apps.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      disableClose={busy}
      title={
        route
          ? t('ui.apps.routeDialog.titleEdit')
          : t('ui.apps.routeDialog.titleAdd')
      }
      actions={
        <>
          <Button variant="text" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            busy={busy}
            disabled={!process.trim() || busy}
            onClick={() => void save()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="apForm">
        {running === null ? (
          <Skeleton className="apSkeletonField" />
        ) : (
          <Select
            label={t('ui.apps.routeDialog.running')}
            value={running.some((a) => a.path === process) ? process : ''}
            options={runningOptions}
            disabled={busy || running.length === 0}
            onChange={(v) => v && setProcess(v)}
          />
        )}
        <div className="apFormRow">
          <TextField
            className="apGrow"
            label={t('ui.apps.routeDialog.app')}
            hint={t('ui.apps.routeDialog.appHint')}
            value={process}
            onChange={setProcess}
            spellCheck={false}
            mono
          />
          <Button
            variant="tonal"
            icon="folder"
            disabled={busy}
            onClick={() => void browse()}
          >
            {t('ui.apps.routeDialog.browse')}
          </Button>
        </div>
        <Select
          label={t('ui.apps.routeDialog.target')}
          value={target}
          options={targetOptions}
          disabled={busy}
          onChange={setTarget}
        />
        {error ? (
          <p className="apFormError" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}

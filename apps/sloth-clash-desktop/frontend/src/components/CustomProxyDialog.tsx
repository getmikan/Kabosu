import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SaveCustomProxy } from '../api/apps'
import { main } from '../api/models'
import { Button, Dialog, Segmented, SwitchRow, TextField } from '../ui/M3'
import { parseProxyUrl } from '../utils/proxyUrl'

type ProxyType = 'socks5' | 'http'

function errText(e: unknown): string {
  const m = (e as { message?: string })?.message
  return String(m ?? e ?? '').trim()
}

/** Adds or edits one of the user's own SOCKS5/HTTP proxies. */
export function CustomProxyDialog({
  proxy,
  onClose,
  onSaved,
}: {
  /** The proxy to edit; undefined adds a new one. */
  proxy?: main.CustomProxy
  onClose: () => void
  onSaved: (next: main.AppRoutingSettings) => void
}) {
  const { t } = useTranslation()
  const [link, setLink] = useState('')
  const [name, setName] = useState(proxy?.name ?? '')
  const [type, setType] = useState<ProxyType>(
    proxy?.type === 'http' ? 'http' : 'socks5',
  )
  const [server, setServer] = useState(proxy?.server ?? '')
  const [port, setPort] = useState(proxy ? String(proxy.port) : '')
  const [username, setUsername] = useState(proxy?.username ?? '')
  const [password, setPassword] = useState('')
  const [viaVpn, setViaVpn] = useState(proxy?.viaVpn !== false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onLink = (next: string) => {
    setLink(next)
    const parsed = parseProxyUrl(next)
    if (!parsed) return
    if (parsed.type) setType(parsed.type)
    setServer(parsed.server)
    setPort(String(parsed.port))
    setUsername(parsed.username)
    setPassword(parsed.password)
    if (!name.trim()) setName(parsed.server)
  }

  const linkError =
    link.trim() && !parseProxyUrl(link)
      ? t('ui.apps.proxyDialog.linkBad')
      : undefined
  const portNumber = Number(port)
  const portError =
    port.trim() &&
    !(Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535)
      ? t('ui.apps.proxyDialog.portBad')
      : undefined
  const canSave = Boolean(
    name.trim() && server.trim() && port.trim() && !portError && !busy,
  )

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const next = await SaveCustomProxy(
        new main.CustomProxy({
          id: proxy?.id ?? '',
          name: name.trim(),
          type,
          server: server.trim(),
          port: portNumber,
          username: username.trim(),
          viaVpn,
        }),
        username.trim() ? password : '',
      )
      onSaved(next)
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
        proxy
          ? t('ui.apps.proxyDialog.titleEdit')
          : t('ui.apps.proxyDialog.titleAdd')
      }
      actions={
        <>
          <Button variant="text" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button busy={busy} disabled={!canSave} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="apForm">
        <TextField
          label={t('ui.apps.proxyDialog.link')}
          placeholder="socks5://user:pass@host:1080"
          hint={t('ui.apps.proxyDialog.linkHint')}
          error={linkError}
          value={link}
          onChange={onLink}
          spellCheck={false}
          mono
          autoFocus={!proxy}
        />
        <TextField
          label={t('ui.apps.proxyDialog.name')}
          value={name}
          onChange={setName}
        />
        <div className="apField">
          <span className="apFieldLabel">{t('ui.apps.proxyDialog.type')}</span>
          <Segmented<ProxyType>
            ariaLabel={t('ui.apps.proxyDialog.type')}
            value={type}
            onChange={setType}
            options={[
              { value: 'socks5', label: 'SOCKS5', disabled: busy },
              { value: 'http', label: 'HTTP', disabled: busy },
            ]}
          />
        </div>
        <div className="apFormRow">
          <TextField
            className="apGrow"
            label={t('ui.apps.proxyDialog.server')}
            value={server}
            onChange={setServer}
            spellCheck={false}
            mono
          />
          <TextField
            className="apPort"
            label={t('ui.apps.proxyDialog.port')}
            value={port}
            onChange={(v) => setPort(v.replace(/\D/g, '').slice(0, 5))}
            error={portError}
            mono
          />
        </div>
        <div className="apFormRow">
          <TextField
            className="apGrow"
            label={t('ui.apps.proxyDialog.username')}
            value={username}
            onChange={setUsername}
            spellCheck={false}
            autoComplete="off"
          />
          <TextField
            className="apGrow"
            type="password"
            label={t('ui.apps.proxyDialog.password')}
            hint={
              proxy?.username
                ? t('ui.apps.proxyDialog.passwordKeep')
                : undefined
            }
            value={password}
            onChange={setPassword}
            disabled={!username.trim()}
            autoComplete="new-password"
          />
        </div>
        <SwitchRow
          label={t('ui.apps.proxyDialog.viaVpn')}
          description={t('ui.apps.proxyDialog.viaVpnHint')}
          checked={viaVpn}
          disabled={busy}
          onChange={setViaVpn}
        />
        {type === 'http' ? (
          <p className="apNote">{t('ui.apps.proxyDialog.httpNoUdp')}</p>
        ) : null}
        {error ? (
          <p className="apFormError" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}

import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ForgetCorpVpnCredentials,
  GetCorpVpnCredentials,
  GetCorpVpnStatus,
  StartCorpVpn,
  StopCorpVpn,
  type main,
} from '../api/corp'
import { EventsOn } from '../api/runtime'
import { Button, Card, Chip, Expansion, Shape, SwitchRow, TextField } from '../ui/M3'

import '../styles/corp.css'

const SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const

type Status = main.CorpVpnStatus

function errText(e: unknown): string {
  const m = (e as { message?: string })?.message
  return String(m ?? e ?? '').trim() || 'unknown error'
}

export function CorpVpnPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status | null>(null)
  const [gateway, setGateway] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  // Live connect step ("preparing" | "driver" | "connecting"), so the button
  // shows progress instead of a frozen "Connecting…" and users don't spam it.
  const [phase, setPhase] = useState('')
  const [error, setError] = useState('')
  // Remember server + username (never the password) between sessions.
  const [remember, setRemember] = useState(true)
  // Pending server-cert to trust (first connect against an untrusted gateway).
  const [pendingCert, setPendingCert] = useState('')

  const refresh = useCallback(() => {
    GetCorpVpnStatus()
      .then((s) => setStatus(s))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    // Pre-fill the saved server + username (password is never stored).
    GetCorpVpnCredentials()
      .then((c) => {
        const gw = c?.gateway ?? ''
        const un = c?.username ?? ''
        if (gw) setGateway((g) => g || gw)
        if (un) setUsername((u) => u || un)
      })
      .catch(() => {})
  }, [refresh])

  // While connected, poll so the log view and status stay live.
  useEffect(() => {
    if (!status?.connected) return
    const id = window.setInterval(refresh, 3000)
    return () => window.clearInterval(id)
  }, [status?.connected, refresh])

  // Live connect-progress step from the backend, so the button reflects what's
  // actually happening (preparing → driver → connecting) during the long first
  // connect instead of looking frozen.
  useEffect(() => {
    const off = EventsOn('corp:phase', (p: unknown) =>
      setPhase(String(p ?? '')),
    )
    return () => {
      if (typeof off === 'function') off()
    }
  }, [])

  const connect = useCallback(
    async (servercert: string) => {
      setBusy(true)
      setError('')
      try {
        const s = await StartCorpVpn(
          gateway.trim(),
          username.trim(),
          password,
          servercert,
        )
        setStatus(s)
        // The backend saves server+username on connect; honour "remember" by
        // forgetting them when the box is unticked.
        if (!remember) void ForgetCorpVpnCredentials()
        if (s.needsCertTrust) {
          // Gateway presented an untrusted cert — surface its fingerprint and
          // let the user accept it (trust-on-first-use), then reconnect pinned.
          setPendingCert(s.servercertSha256)
        } else {
          setPendingCert('')
          if (s.connected) setPassword('') // don't keep the secret around once up
        }
      } catch (e) {
        setError(errText(e))
      } finally {
        setBusy(false)
        setPhase('')
      }
    },
    [gateway, username, password, remember],
  )

  const disconnect = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      await StopCorpVpn()
      setPendingCert('')
      refresh()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }, [refresh])

  // Platform gate: P1 ships macOS-only. Show a friendly note elsewhere.
  if (status && !status.supported) {
    return (
      <div className="page cpPage">
        <div className="cpHeader">
          <h2 className="srOnly">{t('corp.title')}</h2>
        </div>
        <div className="emptyState">
          <Shape name="pentagon" />
          <p>{t('corp.unsupported')}</p>
        </div>
      </div>
    )
  }

  const connected = !!status?.connected
  const fullTunnel = !!status?.fullTunnel

  return (
    <div className="page cpPage">
      <div className="cpHeader">
        <h2 className="srOnly">{t('corp.title')}</h2>
        <span className="cpStatus" data-on={connected || undefined}>
          <span
            className={`statusDot${connected ? ' statusDotOk' : ''}`}
            aria-hidden="true"
          />
          {connected ? t('corp.connected') : t('corp.disconnected')}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {error ? (
          <motion.div
            key="err"
            className="inlineError"
            role="alert"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <p>{error}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="cpGrid">
        <div className="cpMain">
          <AnimatePresence mode="wait" initial={false}>
            {/* Cert-trust step: shown after a first connect against an untrusted cert. */}
            {pendingCert ? (
              <motion.div
                key="cert"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING}
              >
                <Card variant="filled">
                  <div className="cpCard">
                    <h3>{t('corp.certTitle')}</h3>
                    <p className="muted small">{t('corp.certBody')}</p>
                    <code className="cpFingerprint allowSelect">
                      {pendingCert}
                    </code>
                    <div className="cpActions">
                      <Button
                        disabled={busy}
                        busy={busy}
                        onClick={() => void connect(pendingCert)}
                      >
                        {t('corp.trustConnect')}
                      </Button>
                      <Button
                        variant="text"
                        disabled={busy}
                        onClick={() => setPendingCert('')}
                      >
                        {t('corp.cancel')}
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ) : connected ? (
              <motion.div
                key="connected"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING}
              >
                <Card variant="filled">
                  <div className="cpCard">
                    <div className="cpHero">
                      <Shape className="cpOrb" name="sunny" />
                      <div className="cpStatusRow">
                        <span className="muted small">{t('corp.gateway')}</span>
                        <strong className="allowSelect">
                          {gateway || status?.routes?.length ? gateway : '—'}
                        </strong>
                      </div>
                    </div>
                    {fullTunnel ? (
                      <p className="inlineWarning">{t('corp.fullTunnelWarn')}</p>
                    ) : (
                      <>
                        <div className="cpStatusRow">
                          <span className="muted small">{t('corp.routes')}</span>
                          <div className="cpChips">
                            {(status?.routes ?? []).map((r) => (
                              <Chip key={r}>{r}</Chip>
                            ))}
                          </div>
                        </div>
                        {(status?.dnsDomains ?? []).length > 0 ? (
                          <div className="cpStatusRow">
                            <span className="muted small">
                              {t('corp.dnsDomains')}
                            </span>
                            <div className="cpChips">
                              {(status?.dnsDomains ?? []).map((d) => (
                                <Chip key={d}>{d}</Chip>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                    <div className="cpActions">
                      <Button
                        variant="tonal"
                        icon="power"
                        disabled={busy}
                        busy={busy}
                        onClick={() => void disconnect()}
                      >
                        {t('corp.disconnect')}
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING}
                onSubmit={(e) => {
                  e.preventDefault()
                  void connect('')
                }}
              >
                <Card variant="filled">
                  <div className="cpCard cpForm">
                    <TextField
                      label={t('corp.gateway')}
                      placeholder="vpn.company.com"
                      autoComplete="off"
                      spellCheck={false}
                      value={gateway}
                      onChange={setGateway}
                    />
                    <TextField
                      label={t('corp.username')}
                      autoComplete="username"
                      value={username}
                      onChange={setUsername}
                    />
                    <TextField
                      label={t('corp.password')}
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={setPassword}
                    />
                    <SwitchRow
                      label={t('corp.remember')}
                      checked={remember}
                      onChange={setRemember}
                    />
                    <div className="cpActions">
                      <Button
                        type="submit"
                        icon="power"
                        busy={busy}
                        disabled={!gateway.trim() || !username.trim()}
                      >
                        {busy
                          ? t(phase ? `corp.phase.${phase}` : 'corp.connecting')
                          : t('corp.connect')}
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <aside className="cpAside">
          <Shape className="cpAsideShape" name="12-sided-cookie" />
          <h3 className="cpAsideTitle">{t('corp.howTitle')}</h3>
          <ul className="cpHow">
            <li>{t('corp.howCorp')}</li>
            <li>{t('corp.howRest')}</li>
          </ul>
          <p className="muted small cpProtocols">{t('corp.protocols')}</p>
        </aside>
      </div>

      {(status?.logTail ?? []).length > 0 ? (
        <Expansion header={t('corp.logs')} open={connected}>
          <pre className="cpLogBody">{(status?.logTail ?? []).join('\n')}</pre>
        </Expansion>
      ) : null}
    </div>
  )
}

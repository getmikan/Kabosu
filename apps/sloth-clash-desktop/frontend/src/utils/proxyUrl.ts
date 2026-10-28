export type ParsedProxy = {
  /** null when the text names no scheme: keep whatever type is selected. */
  type: 'socks5' | 'http' | null
  server: string
  port: number
  username: string
  password: string
}

const SCHEMES: Record<string, 'socks5' | 'http'> = {
  socks5: 'socks5',
  socks5h: 'socks5',
  socks: 'socks5',
  http: 'http',
}

function validPort(v: string): number | null {
  if (!/^\d{1,5}$/.test(v)) return null
  const n = Number(v)
  return n >= 1 && n <= 65535 ? n : null
}

function decode(v: string): string {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

/**
 * Reads a proxy as people paste it: `socks5://user:pass@host:port`,
 * `http://host:port`, bare `host:port` or the shop format
 * `host:port:user:pass`. Returns null for anything else.
 */
export function parseProxyUrl(raw: string): ParsedProxy | null {
  const text = raw.trim()
  const scheme = /^([a-z0-9]+):\/\//i.exec(text)
  if (scheme) {
    const type = SCHEMES[scheme[1].toLowerCase()]
    if (!type) return null
    // Parsed by hand: URL() drops a port that is the scheme's default.
    const rest = text.slice(scheme[0].length).replace(/\/.*$/, '')
    const at = rest.lastIndexOf('@')
    const hostPort = /^(\[[^\]]+\]|[^:\s/@[\]]+):(\d{1,5})$/.exec(
      rest.slice(at + 1),
    )
    const port = hostPort ? validPort(hostPort[2]) : null
    if (!hostPort || port === null) return null
    const [username = '', ...password] =
      at >= 0 ? rest.slice(0, at).split(':') : []
    return {
      type,
      server: hostPort[1].replace(/^\[|\]$/g, ''),
      port,
      username: decode(username),
      password: decode(password.join(':')),
    }
  }

  const parts = text.split(':')
  if (parts.length !== 2 && parts.length !== 4) return null
  const [server, portText, username = '', password = ''] = parts
  const port = validPort(portText)
  if (!server || /[\s/@]/.test(server) || port === null) return null
  return { type: null, server, port, username, password }
}

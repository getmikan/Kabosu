const BUILTIN_POLICIES = new Set([
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
  'GLOBAL',
])
/** The runtime config names the user's own proxies with this prefix. */
const CUSTOM_PROXY_PREFIX = '👤 '

export type ProxyGroupLike = { name?: string; proxies?: string[] }

/**
 * What an app route may target on the server side: the profile's groups
 * first, then their servers. Built-ins and the user's own proxies are left
 * out (they have their own choices).
 */
export function routableServers(groups: ProxyGroupLike[]): string[] {
  const names: string[] = []
  const add = (name?: string) => {
    const n = String(name ?? '').trim()
    if (
      n &&
      !BUILTIN_POLICIES.has(n) &&
      !n.startsWith(CUSTOM_PROXY_PREFIX) &&
      !names.includes(n)
    ) {
      names.push(n)
    }
  }
  for (const g of groups) add(g.name)
  for (const g of groups) for (const p of g.proxies ?? []) add(p)
  return names
}

/** The executable's file name, for a path or a bare process name. */
export function appName(process: string): string {
  return process.split(/[\\/]/).pop() || process
}

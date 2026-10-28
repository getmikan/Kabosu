import { describe, expect, it } from 'vitest'

import { parseProxyUrl } from './proxyUrl'

describe('parseProxyUrl', () => {
  it('reads socks5 and http links with credentials', () => {
    expect(parseProxyUrl(' socks5://me:p%40ss@10.0.0.2:1080 ')).toEqual({
      type: 'socks5',
      server: '10.0.0.2',
      port: 1080,
      username: 'me',
      password: 'p@ss',
    })
    expect(parseProxyUrl('http://proxy.example:8080')).toEqual({
      type: 'http',
      server: 'proxy.example',
      port: 8080,
      username: '',
      password: '',
    })
    expect(parseProxyUrl('socks5h://[2001:db8::1]:1080')?.server).toBe(
      '2001:db8::1',
    )
    expect(parseProxyUrl('http://host:80')?.port).toBe(80)
  })

  it('reads bare host:port and the host:port:user:pass shop format', () => {
    expect(parseProxyUrl('1.2.3.4:3128')).toEqual({
      type: null,
      server: '1.2.3.4',
      port: 3128,
      username: '',
      password: '',
    })
    expect(parseProxyUrl('1.2.3.4:3128:user:secret')).toMatchObject({
      username: 'user',
      password: 'secret',
    })
  })

  it('rejects what is not a usable proxy', () => {
    for (const bad of [
      '',
      'https://proxy.example:443',
      'vless://uuid@host:443',
      'socks5://host',
      'host:99999',
      'host:port',
      'a b:80',
      '1.2.3.4:80:user',
    ]) {
      expect(parseProxyUrl(bad), bad).toBeNull()
    }
  })
})

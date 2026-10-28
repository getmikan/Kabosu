import { describe, expect, it } from 'vitest'

import { appName, routableServers } from './appRouting'

describe('routableServers', () => {
  it('lists groups before their servers, once each, without built-ins or own proxies', () => {
    expect(
      routableServers([
        { name: '🍊 Mikan', proxies: ['NL', 'US', 'DIRECT'] },
        { name: 'Auto', proxies: ['NL', '👤 Work'] },
        { name: 'GLOBAL', proxies: ['🍊 Mikan', 'REJECT'] },
      ]),
    ).toEqual(['🍊 Mikan', 'Auto', 'NL', 'US'])
  })
})

describe('appName', () => {
  it('takes the file name from Windows and POSIX paths', () => {
    expect(appName('C:\\Apps\\Telegram.exe')).toBe('Telegram.exe')
    expect(appName('/Applications/Telegram.app/Contents/MacOS/Telegram')).toBe(
      'Telegram',
    )
    expect(appName('chrome.exe')).toBe('chrome.exe')
  })
})

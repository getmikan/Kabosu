import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readManifest, verifyBuiltCore } from '../scripts/core-build.mjs'

test('core artifacts require the pinned Citrus revision and exact checksum', async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'kabosu-core-artifact-test-'),
  )
  try {
    const m = readManifest()
    const target = 'windows-amd64'
    const file = m.assets[target].file
    await fs.writeFile(path.join(dir, file), 'test binary')
    const hash = createHash('sha256').update('test binary').digest('hex')
    await fs.writeFile(path.join(dir, 'SHA256SUMS'), `${hash}  ${file}\n`)
    const lines = [
      'core:      Citrus',
      `upstream:  ${m.upstream}`,
      `tag:       ${m.tag}`,
      `commit:    ${m.commit}`,
    ]
    await fs.writeFile(path.join(dir, 'BUILDINFO.txt'), lines.join('\n'))
    assert.equal(verifyBuiltCore(dir, target).sha256, hash)
    await fs.writeFile(
      path.join(dir, 'BUILDINFO.txt'),
      lines.slice(0, -1).join('\n'),
    )
    assert.throws(() => verifyBuiltCore(dir, target), /provenance mismatch/)
    await fs.writeFile(path.join(dir, 'BUILDINFO.txt'), lines.join('\n'))
    await fs.appendFile(path.join(dir, file), 'tampered')
    assert.throws(() => verifyBuiltCore(dir, target), /checksum mismatch/)
  } finally {
    assert.ok(
      path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep),
    )
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('real Citrus controller: authenticated API, native groups, config and cache operations', {
  skip: !process.env.CITRUS_TEST_BIN,
}, async () => {
  const m = readManifest()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kabosu-citrus-interop-'))
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  const secret = randomBytes(24).toString('hex')
  const config = {
    'mixed-port': 0,
    'external-controller': `127.0.0.1:${port}`,
    secret,
    'log-level': 'silent',
    mode: 'rule',
    dns: { enable: false },
    tun: { enable: false },
    'proxy-groups': [
      { name: 'Local test', type: 'select', proxies: ['DIRECT'] },
    ],
    rules: ['MATCH,DIRECT'],
  }
  await fs.writeFile(path.join(dir, 'config.yaml'), JSON.stringify(config))
  const child = spawn(
    path.resolve(process.env.CITRUS_TEST_BIN),
    ['-d', dir, '-f', path.join(dir, 'config.yaml')],
    { stdio: 'ignore', windowsHide: true },
  )
  let childError
  child.on('error', (error) => {
    childError = error
  })
  const request = (route, options = {}) =>
    fetch(`http://127.0.0.1:${port}${route}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(3000),
    })
  try {
    let ready = false
    for (let i = 0; i < 60; i++) {
      if (childError) throw childError
      if (child.exitCode !== null)
        throw new Error(`Citrus exited with ${child.exitCode}`)
      try {
        if ((await request('/version')).ok) {
          ready = true
          break
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.ok(ready, 'Citrus controller must become ready')
    assert.equal((await fetch(`http://127.0.0.1:${port}/version`)).status, 401)
    assert.equal((await (await request('/version')).json()).version, m.tag)
    assert.equal((await request('/group/Local%20test')).status, 200)
    assert.equal(
      (
        await request('/configs', {
          method: 'PATCH',
          body: JSON.stringify({ mode: 'global' }),
        })
      ).status,
      204,
    )
    assert.equal((await (await request('/configs')).json()).mode, 'global')
    assert.equal(
      (await request('/cache/dns/flush', { method: 'POST' })).status,
      204,
    )
  } finally {
    if (child.exitCode === null) {
      child.kill()
      await new Promise((resolve) => child.once('exit', resolve))
    }
    assert.ok(
      path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep),
    )
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 })
  }
})

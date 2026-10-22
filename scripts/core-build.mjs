/** Build the immutable Citrus dev revision from core/citrus/manifest.json. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const SELF = fileURLToPath(import.meta.url)
const MANIFEST = path.join(ROOT, 'core/citrus/manifest.json')
export function readManifest() {
  return verifyCoreManifest(JSON.parse(fs.readFileSync(MANIFEST, 'utf8')))
}
export function verifyCoreManifest(m) {
  if (
    !/^[0-9a-f]{40}$/.test(m?.commit ?? '') ||
    m.name !== 'Citrus' ||
    m.tag !== `dev-${m.commit.slice(0, 12)}` ||
    !m.upstream ||
    !m.assets
  ) {
    throw new Error(
      'Invalid Citrus source manifest: expected a pinned commit and matching dev version',
    )
  }
  for (const [target, asset] of Object.entries(m.assets)) {
    if (
      !/^(windows|darwin|linux)-(amd64|arm64)$/.test(target) ||
      asset.file !==
        `citrus-${target}${target.startsWith('windows-') ? '.exe' : ''}`
    ) {
      throw new Error(`Invalid Citrus target: ${target}`)
    }
  }
  return m
}
export function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}
function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    ...opts,
  })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(
      `${cmd} ${args.join(' ')} exited with ${result.status}${opts.capture ? '\n' + (result.stderr || result.stdout) : ''}`,
    )
  return opts.capture ? result.stdout.trim() : ''
}
export function coreGoToolchain() {
  const text = fs.readFileSync(
    path.join(ROOT, 'core/citrus/.tool-versions'),
    'utf8',
  )
  const version = text.match(/^golang\s+(\d+\.\d+\.\d+)\s*$/m)?.[1]
  if (!version) throw new Error('Invalid core/citrus/.tool-versions')
  return `go${version}`
}
function goEnv() {
  const env = {
    ...process.env,
    CGO_ENABLED: '0',
    GOTOOLCHAIN: coreGoToolchain(),
    GOFLAGS: '-mod=readonly',
  }
  delete env.GOOS
  delete env.GOARCH
  delete env.GOAMD64
  return env
}
export function goVersion() {
  return run('go', ['version'], { capture: true, env: goEnv(), cwd: ROOT })
}
export function coreBuildKey(m, target, go = goVersion()) {
  return createHash('sha256')
    .update(
      JSON.stringify({ manifest: m, target, go, script: sha256File(SELF) }),
    )
    .digest('hex')
    .slice(0, 16)
}
export function buildCore({
  outDir = '',
  targets = [],
  skipTests = false,
  log = console.log,
} = {}) {
  const m = readManifest()
  const upstream = (process.env.CITRUS_UPSTREAM || '').trim() || m.upstream
  if (outDir && !targets.length) targets = Object.keys(m.assets)
  for (const target of targets)
    if (!m.assets[target]) throw new Error(`Unknown target: ${target}`)
  const out = outDir ? path.resolve(outDir) : ''
  if (out) fs.mkdirSync(out, { recursive: true })
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kabosu-citrus-'))
  const src = path.join(work, 'src')
  try {
    log(`==> Citrus ${m.branch} at ${m.commit}`)
    run('git', ['init', '--quiet', src])
    run('git', ['-C', src, 'config', 'core.autocrlf', 'false'])
    run('git', ['-C', src, 'remote', 'add', 'origin', upstream])
    run('git', [
      '-C',
      src,
      'fetch',
      '--quiet',
      '--depth',
      '1',
      'origin',
      m.commit,
    ])
    run('git', [
      '-C',
      src,
      '-c',
      'advice.detachedHead=false',
      'checkout',
      '--quiet',
      '--detach',
      'FETCH_HEAD',
    ])
    const commit = run('git', ['-C', src, 'rev-parse', 'HEAD'], {
      capture: true,
    })
    if (commit !== m.commit)
      throw new Error(`Citrus revision mismatch: ${commit}`)
    const env = goEnv()
    const go = goVersion()
    log(`==> ${go}`)
    if (!skipTests) {
      run(
        'go',
        [
          'test',
          '-count=1',
          './component/tls/',
          './config/',
          './adapter/provider/',
        ],
        { cwd: src, env },
      )
    }
    if (!out) return { goVersion: go }
    const unix = Number(
      run('git', ['-C', src, 'log', '-1', '--format=%ct'], { capture: true }),
    )
    const ldflags = `-X github.com/metacubex/mihomo/constant.Version=${m.tag} -X github.com/metacubex/mihomo/constant.BuildTime=${new Date(unix * 1000).toISOString()} -w -s -buildid=`
    const sums = []
    for (const target of targets) {
      const [GOOS, GOARCH] = target.split('-')
      const file = m.assets[target].file
      const destination = path.join(out, file)
      // Old output must never masquerade as a successful build after a failure.
      fs.rmSync(destination, { force: true })
      log(`==> ${target}: ${file}`)
      run(
        'go',
        [
          'build',
          '-tags',
          'with_gvisor',
          '-trimpath',
          '-ldflags',
          ldflags,
          '-o',
          destination,
          '.',
        ],
        {
          cwd: src,
          env: {
            ...env,
            GOOS,
            GOARCH,
            ...(GOARCH === 'amd64' ? { GOAMD64: 'v2' } : {}),
          },
        },
      )
      sums.push(`${sha256File(destination)}  ${file}`)
    }
    fs.writeFileSync(path.join(out, 'SHA256SUMS'), sums.join('\n') + '\n')
    fs.writeFileSync(
      path.join(out, 'BUILDINFO.txt'),
      [
        'core:      Citrus',
        `upstream:  ${m.upstream}`,
        `tag:       ${m.tag}`,
        `commit:    ${m.commit}`,
        `go:        ${go}`,
        'flags:     CGO_ENABLED=0 GOAMD64=v2(amd64) -tags with_gvisor -trimpath',
        `ldflags:   ${ldflags}`,
        '',
      ].join('\n'),
    )
    log(sums.join('\n'))
    return { goVersion: go, sums }
  } finally {
    const tempRoot = path.resolve(os.tmpdir())
    const target = path.resolve(work)
    if (
      path.dirname(target) !== tempRoot ||
      !path.basename(target).startsWith('kabosu-citrus-')
    ) {
      throw new Error(
        'Refusing to remove a directory outside the Citrus temporary workspace',
      )
    }
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3 })
  }
}
export function verifyBuiltCore(dir, target, m = readManifest()) {
  verifyCoreManifest(m)
  const asset = m.assets[target]
  if (!asset) throw new Error(`Unknown Citrus target: ${target}`)
  const lines = fs
    .readFileSync(path.join(dir, 'BUILDINFO.txt'), 'utf8')
    .split(/\r?\n/)
  for (const expected of [
    'core:      Citrus',
    `upstream:  ${m.upstream}`,
    `tag:       ${m.tag}`,
    `commit:    ${m.commit}`,
  ]) {
    if (!lines.includes(expected))
      throw new Error(`Citrus provenance mismatch: missing ${expected}`)
  }
  const sums = fs
    .readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8')
    .split(/\r?\n/)
  const want = sums
    .map((line) => line.match(/^([0-9a-f]{64})\s+\*?(.+)$/))
    .find((match) => match?.[2] === asset.file)?.[1]
  const file = path.join(dir, asset.file)
  const sha256 = sha256File(file)
  if (!want || want !== sha256)
    throw new Error(`Citrus checksum mismatch: ${asset.file}`)
  return { file, sha256 }
}
if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  const args = process.argv.slice(2)
  const positional = args.filter((arg) => !arg.startsWith('--'))
  try {
    if (args.includes('--test-only')) buildCore({})
    else {
      if (!positional.length)
        throw new Error(
          'Usage: node scripts/core-build.mjs <out-dir> [os-arch] [--skip-tests]',
        )
      buildCore({
        outDir: positional[0],
        targets: positional.slice(1),
        skipTests: args.includes('--skip-tests'),
      })
    }
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

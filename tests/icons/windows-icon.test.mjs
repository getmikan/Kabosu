import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import sharp from 'sharp'

import { generateWindowsIcon } from '../../scripts/generate-windows-icon.mjs'

// Regenerate from the tracked RGB artwork: parse-png reports RGB bpp while
// exposing RGBA pixels, which used to corrupt to-ico's DIB channel layout.
await generateWindowsIcon()

const build = path.resolve('apps/sloth-clash-desktop/build')
const files = [
  path.join(build, 'windows/icon.ico'),
  ...['colorful', 'mono'].flatMap((style) =>
    ['idle', 'proxy', 'tun'].map((state) =>
      path.join(build, `windows/tray/${style}-${state}.ico`),
    ),
  ),
]

for (const file of files) {
  test(`Windows decodes every ICO frame as BGRA: ${path.basename(file)}`, async () => {
    const bytes = await fs.readFile(file)
    assert.equal(bytes.readUInt16LE(2), 1)
    const count = bytes.readUInt16LE(4)
    assert.ok(count > 1)
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16
      const width = bytes[entry] || 256
      const height = bytes[entry + 1] || 256
      const size = bytes.readUInt32LE(entry + 8)
      const offset = bytes.readUInt32LE(entry + 12)
      assert.equal(bytes.readUInt16LE(entry + 6), 32, `${width}px directory`)
      assert.equal(bytes.readUInt16LE(offset + 14), 32, `${width}px bitmap`)
      assert.ok(size >= 40 + width * height * 4)
      assert.ok(offset + size <= bytes.length)

      if (file === files[0]) {
        const rgba = await sharp(path.join(build, 'appicon.png'))
          .resize(width, height)
          .ensureAlpha()
          .raw()
          .toBuffer()
        const x = Math.floor(width / 2)
        const y = Math.floor(height / 2)
        const source = (y * width + x) * 4
        const dib = offset + 40 + ((height - 1 - y) * width + x) * 4
        assert.deepEqual(
          Array.from(bytes.subarray(dib, dib + 4)),
          [rgba[source + 2], rgba[source + 1], rgba[source], rgba[source + 3]],
          `${width}px pixel must retain the artwork colors`,
        )
      }
    }
  })
}

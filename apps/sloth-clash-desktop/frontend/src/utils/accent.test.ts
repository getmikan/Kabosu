import { describe, expect, it } from 'vitest'

import {
  MIN_ACCENT_CONTRAST,
  contrastRatio,
  ensureReadableAccent,
  normalizeHex,
  resolveAccent,
} from './accent'

const DARK_BG = '#101418'
const LIGHT_BG = '#f8f9ff'

describe('normalizeHex', () => {
  it('normalizes #rrggbb case-insensitively', () => {
    expect(normalizeHex('#3D7EFF')).toBe('#3d7eff')
    expect(normalizeHex('  #c9a86c ')).toBe('#c9a86c')
  })

  it('expands #rgb shorthand', () => {
    expect(normalizeHex('#F0a')).toBe('#ff00aa')
  })

  it('rejects invalid input', () => {
    expect(normalizeHex('#3d7ef')).toBeNull()
    expect(normalizeHex('blue')).toBeNull()
    expect(normalizeHex('3d7eff')).toBeNull()
    expect(normalizeHex('#3d7efg')).toBeNull()
    expect(normalizeHex('')).toBeNull()
    expect(normalizeHex(null)).toBeNull()
    expect(normalizeHex(undefined)).toBeNull()
  })
})

describe('ensureReadableAccent', () => {
  it('passes readable colors through unchanged', () => {
    expect(ensureReadableAccent('#c9a86c', 'dark')).toBe('#c9a86c')
    expect(ensureReadableAccent('#936b38', 'light')).toBe('#936b38')
  })

  it('lightens a near-black accent in dark theme to the ratio', () => {
    const adjusted = ensureReadableAccent('#101010', 'dark')
    expect(adjusted).not.toBe('#101010')
    expect(contrastRatio(adjusted, DARK_BG)).toBeGreaterThanOrEqual(
      MIN_ACCENT_CONTRAST,
    )
  })

  it('darkens a near-white accent in light theme to the ratio', () => {
    const adjusted = ensureReadableAccent('#fefef2', 'light')
    expect(adjusted).not.toBe('#fefef2')
    expect(contrastRatio(adjusted, LIGHT_BG)).toBeGreaterThanOrEqual(
      MIN_ACCENT_CONTRAST,
    )
  })

  it('adjusts per theme independently (saturated blue)', () => {
    const dark = ensureReadableAccent('#1717b0', 'dark')
    const light = ensureReadableAccent('#1717b0', 'light')
    expect(contrastRatio(dark, DARK_BG)).toBeGreaterThanOrEqual(
      MIN_ACCENT_CONTRAST,
    )
    // Already readable on the latte background — stays raw.
    expect(light).toBe('#1717b0')
  })
})

describe('resolveAccent (priority contract with brand-headers-desktop)', () => {
  it('user hex beats brand hex', () => {
    expect(resolveAccent({ userHex: '#3d7eff', brandHex: '#ff0000' })).toBe(
      '#3d7eff',
    )
  })

  it('brand hex applies when user has none', () => {
    expect(resolveAccent({ brandHex: '#FF0000' })).toBe('#ff0000')
    expect(resolveAccent({ userHex: null, brandHex: '#f00' })).toBe('#ff0000')
  })

  it('invalid user hex falls through to brand', () => {
    expect(resolveAccent({ userHex: 'nope', brandHex: '#ff0000' })).toBe(
      '#ff0000',
    )
  })

  it('no sources yields null (stylesheet defaults)', () => {
    expect(resolveAccent({})).toBeNull()
    expect(resolveAccent({ userHex: null, brandHex: undefined })).toBeNull()
  })
})

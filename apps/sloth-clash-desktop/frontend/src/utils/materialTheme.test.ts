import { describe, expect, it } from 'vitest'

import { contrastRatio } from './accent'
import { materialColors } from './materialTheme'

describe('Material color roles', () => {
  for (const dark of [false, true]) {
    for (const seed of [
      null,
      '#ff0000',
      '#101010',
      '#ffffff',
      '#3d7eff',
      'invalid',
    ]) {
      it(`retains readable content with seed ${seed}, dark=${dark}`, () => {
        const colors = materialColors(seed, dark)
        for (const [foreground, background] of [
          ['on-primary', 'primary'],
          ['on-primary-container', 'primary-container'],
          ['on-surface', 'surface'],
          ['on-surface-variant', 'surface-container-high'],
          ['on-error-container', 'error-container'],
        ] as const) {
          expect(
            contrastRatio(colors[foreground], colors[background]),
          ).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  }
})

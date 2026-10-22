import {
  argbFromHex,
  Hct,
  hexFromArgb,
  SchemeTonalSpot,
  TonalPalette,
} from '@material/material-color-utilities'

import { deriveAccentVars, normalizeHex } from './accent'

export function materialColors(source: string | null, dark: boolean) {
  const scheme = new SchemeTonalSpot(
    Hct.fromInt(argbFromHex(normalizeHex(source) ?? '#9dc843')),
    dark,
    0,
  )
  // A single citrus seed supplies the primary, neutral and container roles.
  const backdrop = scheme
  const seed = Hct.fromInt(argbFromHex(normalizeHex(source) ?? '#9dc843'))
  const citrus = TonalPalette.fromHueAndChroma(
    seed.hue,
    Math.max(seed.chroma, 80),
  )
  const neutral = TonalPalette.fromHueAndChroma(seed.hue, 14)
  const green = TonalPalette.fromHueAndChroma(seed.hue + 10, 30)
  const roles = {
    primary: citrus.tone(dark ? 80 : 40),
    'on-primary': citrus.tone(dark ? 20 : 100),
    'primary-container': scheme.primaryContainer,
    'on-primary-container': scheme.onPrimaryContainer,
    secondary: green.tone(dark ? 80 : 40),
    'on-secondary': green.tone(dark ? 20 : 100),
    'secondary-container': green.tone(dark ? 30 : 90),
    'on-secondary-container': green.tone(dark ? 90 : 10),
    tertiary: scheme.tertiary,
    'on-tertiary': scheme.onTertiary,
    'tertiary-container': scheme.tertiaryContainer,
    'on-tertiary-container': scheme.onTertiaryContainer,
    surface: neutral.tone(dark ? 8 : 97),
    'surface-dim': backdrop.surfaceDim,
    'surface-bright': backdrop.surfaceBright,
    'surface-container-lowest': neutral.tone(dark ? 5 : 100),
    'surface-container-low': neutral.tone(dark ? 12 : 96),
    'surface-container': neutral.tone(dark ? 16 : 93),
    'surface-container-high': neutral.tone(dark ? 20 : 90),
    'surface-container-highest': neutral.tone(dark ? 24 : 86),
    'on-surface': backdrop.onSurface,
    'on-surface-variant': backdrop.onSurfaceVariant,
    outline: backdrop.outline,
    'outline-variant': backdrop.outlineVariant,
    error: scheme.error,
    'on-error': scheme.onError,
    'error-container': scheme.errorContainer,
    'on-error-container': scheme.onErrorContainer,
    'inverse-surface': backdrop.inverseSurface,
    'inverse-on-surface': backdrop.inverseOnSurface,
  }
  return Object.fromEntries(
    Object.entries(roles).map(([name, color]) => [name, hexFromArgb(color)]),
  ) as { [K in keyof typeof roles]: string }
}

export function applyMaterialTheme(
  el: HTMLElement,
  dark: boolean,
  source: string | null,
) {
  const colors = materialColors(source, dark)
  for (const [name, value] of Object.entries(colors)) {
    el.style.setProperty(`--${name}`, value)
  }
  const accent = deriveAccentVars(colors.primary, dark ? 'dark' : 'light')
  el.style.setProperty('--accent', accent.accent)
  el.style.setProperty('--accent-dim', accent.dim)
  el.style.setProperty('--accent-muted', accent.muted)
  el.style.colorScheme = dark ? 'dark' : 'light'
}

// JSX typings for the @m3e/web custom elements used by the app. React 19
// assigns known props as element properties and the rest as attributes, so
// both camelCase properties and kebab-case attributes are accepted here.
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

type M3eProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  [attr: string]: unknown
}

type M3eTag =
  | 'm3e-theme'
  | 'm3e-button'
  | 'm3e-icon-button'
  | 'm3e-button-group'
  | 'm3e-fab'
  | 'm3e-card'
  | 'm3e-switch'
  | 'm3e-checkbox'
  | 'm3e-slider'
  | 'm3e-slider-thumb'
  | 'm3e-shape'
  | 'm3e-loading-indicator'
  | 'm3e-linear-progress-indicator'
  | 'm3e-circular-progress-indicator'
  | 'm3e-form-field'
  | 'm3e-select'
  | 'm3e-option'
  | 'm3e-dialog'
  | 'm3e-chip'
  | 'm3e-assist-chip'
  | 'm3e-filter-chip'
  | 'm3e-chip-set'
  | 'm3e-filter-chip-set'
  | 'm3e-list'
  | 'm3e-list-item'
  | 'm3e-expansion-panel'
  | 'm3e-tooltip'
  | 'm3e-divider'
  | 'm3e-skeleton'
  | 'm3e-badge'
  | 'm3e-menu'
  | 'm3e-menu-item'
  | 'm3e-menu-trigger'
  | 'm3e-segmented-button'
  | 'm3e-button-segment'
  | 'm3e-toolbar'
  | 'm3e-snackbar'

declare module 'react' {
  namespace JSX {
    type M3eElements = { [K in M3eTag]: M3eProps }
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends M3eElements {}
  }
}

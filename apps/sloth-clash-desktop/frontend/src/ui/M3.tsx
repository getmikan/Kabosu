// Thin React wrappers over the @m3e/web Material 3 Expressive components.
// Pages use these instead of hand-styled buttons/inputs so every control
// shares the library's shapes, state layers, focus rings and motion.
// The elements themselves are registered once in ./register (browser only,
// so SSR tests can render these wrappers).

import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
} from 'react'

import { MaterialSymbol, type MaterialSymbolName } from '../components/MaterialSymbol'

import { useElementEvent } from './useElementEvent'

type Size = 'extra-small' | 'small' | 'medium' | 'large' | 'extra-large'

function Icon({ icon }: { icon?: MaterialSymbolName | ReactNode }) {
  if (!icon) return null
  return typeof icon === 'string' ? (
    <MaterialSymbol name={icon as MaterialSymbolName} />
  ) : (
    <>{icon}</>
  )
}

export type ButtonProps = {
  children?: ReactNode
  variant?: 'elevated' | 'filled' | 'tonal' | 'outlined' | 'text'
  size?: Size
  shape?: 'rounded' | 'square'
  icon?: MaterialSymbolName | ReactNode
  trailingIcon?: MaterialSymbolName | ReactNode
  disabled?: boolean
  /** Shows an inline loading indicator and blocks clicks. */
  busy?: boolean
  toggle?: boolean
  selected?: boolean
  title?: string
  className?: string
  style?: CSSProperties
  type?: 'button' | 'submit' | 'reset'
  'aria-label'?: string
  'data-tour'?: string
  onClick?: () => void
}

export function Button({
  children,
  variant = 'filled',
  size = 'small',
  shape = 'rounded',
  icon,
  trailingIcon,
  disabled,
  busy,
  toggle,
  selected,
  title,
  className,
  style,
  type = 'button',
  onClick,
  ...aria
}: ButtonProps) {
  return (
    <m3e-button
      className={className}
      style={style}
      variant={variant}
      size={size}
      shape={shape}
      type={type}
      title={title}
      toggle={toggle || undefined}
      selected={selected || undefined}
      disabled={disabled || busy || undefined}
      aria-busy={busy || undefined}
      onClick={disabled || busy ? undefined : onClick}
      {...aria}
    >
      {busy ? (
        <m3e-loading-indicator slot="icon" className="m3InlineLoader" />
      ) : icon ? (
        <span slot="icon" className="m3Icon">
          <Icon icon={icon} />
        </span>
      ) : null}
      {children}
      {trailingIcon ? (
        <span slot="trailing-icon" className="m3Icon">
          <Icon icon={trailingIcon} />
        </span>
      ) : null}
    </m3e-button>
  )
}

export function IconButton({
  icon,
  label,
  variant = 'standard',
  size = 'small',
  shape = 'rounded',
  width,
  disabled,
  toggle,
  selected,
  className,
  onClick,
}: {
  icon: MaterialSymbolName | ReactNode
  /** Accessible name; also shown as the native tooltip. */
  label: string
  variant?: 'filled' | 'tonal' | 'outlined' | 'elevated' | 'standard'
  size?: Size
  shape?: 'rounded' | 'square'
  width?: 'default' | 'narrow' | 'wide'
  disabled?: boolean
  toggle?: boolean
  selected?: boolean
  className?: string
  onClick?: () => void
}) {
  return (
    <m3e-icon-button
      className={className}
      variant={variant}
      size={size}
      shape={shape}
      width={width}
      toggle={toggle || undefined}
      selected={selected || undefined}
      disabled={disabled || undefined}
      aria-label={label}
      title={label}
      onClick={disabled ? undefined : onClick}
    >
      <Icon icon={icon} />
    </m3e-icon-button>
  )
}

export type SegmentOption<T extends string> = {
  value: T
  label: ReactNode
  title?: string
  icon?: MaterialSymbolName
  disabled?: boolean
}

/** Connected button group acting as a single-choice segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'small',
  ariaLabel,
  className,
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (next: T) => void
  size?: Size
  ariaLabel?: string
  className?: string
}) {
  return (
    <m3e-button-group
      className={['m3Segmented', className].filter(Boolean).join(' ')}
      variant="connected"
      size={size}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <m3e-button
          key={o.value}
          variant={o.value === value ? 'filled' : 'tonal'}
          size={size}
          toggle
          selected={o.value === value}
          disabled={o.disabled || undefined}
          title={o.title}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => {
            if (o.value !== value && !o.disabled) onChange(o.value)
          }}
        >
          {o.icon ? (
            <span slot="icon" className="m3Icon">
              <MaterialSymbol name={o.icon} />
            </span>
          ) : null}
          {o.label}
        </m3e-button>
      ))}
    </m3e-button-group>
  )
}

export function Card({
  children,
  variant = 'filled',
  actionable,
  className,
  style,
  onClick,
  ...rest
}: {
  children?: ReactNode
  variant?: 'elevated' | 'filled' | 'outlined'
  actionable?: boolean
  className?: string
  style?: CSSProperties
  onClick?: () => void
  'data-tour'?: string
  'aria-label'?: string
}) {
  return (
    <m3e-card
      className={className}
      style={style}
      variant={variant}
      actionable={actionable || undefined}
      onClick={onClick}
      {...rest}
    >
      <div slot="content" className="m3CardBody">
        {children}
      </div>
    </m3e-card>
  )
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  id,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
  id?: string
}) {
  const ref = useRef<HTMLElement>(null)
  useElementEvent(ref, 'change', (e) =>
    onChange(Boolean((e.target as HTMLInputElement).checked)),
  )
  return (
    <m3e-switch
      ref={ref}
      id={id}
      icons="selected"
      checked={checked}
      disabled={disabled || undefined}
      aria-label={label}
    />
  )
}

export function Checkbox({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
}) {
  const ref = useRef<HTMLElement>(null)
  useElementEvent(ref, 'change', (e) =>
    onChange(Boolean((e.target as HTMLInputElement).checked)),
  )
  return (
    <m3e-checkbox
      ref={ref}
      checked={checked}
      disabled={disabled || undefined}
      aria-label={label}
    />
  )
}

/** Labelled settings row: text on the left, a switch on the right. */
export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="m3SwitchRow" data-disabled={disabled || undefined}>
      <label htmlFor={id} className="m3SwitchRowText">
        <span className="m3SwitchRowLabel">{label}</span>
        {description ? (
          <span className="m3SwitchRowDesc">{description}</span>
        ) : null}
      </label>
      <Switch
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}

export type SelectOption = { value: string; label: ReactNode; disabled?: boolean }

export function Select({
  value,
  options,
  onChange,
  label,
  disabled,
  variant = 'outlined',
  className,
  ariaLabel,
}: {
  value: string
  options: SelectOption[]
  onChange: (next: string) => void
  label?: ReactNode
  disabled?: boolean
  variant?: 'filled' | 'outlined'
  className?: string
  ariaLabel?: string
}) {
  const id = useId()
  const ref = useRef<HTMLElement & { value: unknown }>(null)
  useElementEvent(ref, 'change', () => {
    const v = ref.current?.value
    onChange(String(Array.isArray(v) ? v[0] : (v ?? '')))
  })
  useEffect(() => {
    if (ref.current && ref.current.value !== value) ref.current.value = value
  }, [value, options])
  return (
    <m3e-form-field
      className={['m3Field', className].filter(Boolean).join(' ')}
      variant={variant}
      hide-subscript="always"
    >
      {label ? (
        <label slot="label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <m3e-select
        ref={ref}
        id={id}
        disabled={disabled || undefined}
        aria-label={ariaLabel}
      >
        {options.map((o) => (
          <m3e-option
            key={o.value}
            value={o.value}
            selected={o.value === value || undefined}
            disabled={o.disabled || undefined}
          >
            {o.label}
          </m3e-option>
        ))}
      </m3e-select>
    </m3e-form-field>
  )
}

export type TextFieldHandle = { focus: () => void; select: () => void }

export function TextField({
  value,
  onChange,
  label,
  placeholder,
  type = 'text',
  multiline,
  rows = 4,
  disabled,
  readOnly,
  error,
  hint,
  leadingIcon,
  trailing,
  variant = 'outlined',
  className,
  inputRef,
  handleRef,
  mono,
  autoFocus,
  spellCheck,
  onKeyDown,
  onBlur,
  ariaLabel,
  min,
  max,
  name,
  autoComplete,
}: {
  value: string | number
  onChange: (next: string) => void
  label?: ReactNode
  placeholder?: string
  type?: string
  multiline?: boolean
  rows?: number
  disabled?: boolean
  readOnly?: boolean
  error?: ReactNode
  hint?: ReactNode
  leadingIcon?: MaterialSymbolName
  trailing?: ReactNode
  variant?: 'filled' | 'outlined'
  className?: string
  inputRef?: Ref<HTMLInputElement & HTMLTextAreaElement>
  handleRef?: Ref<TextFieldHandle>
  mono?: boolean
  autoFocus?: boolean
  spellCheck?: boolean
  onKeyDown?: (e: React.KeyboardEvent) => void
  onBlur?: () => void
  ariaLabel?: string
  min?: number
  max?: number
  name?: string
  autoComplete?: string
}) {
  const id = useId()
  const localRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useImperativeHandle(handleRef, () => ({
    focus: () => localRef.current?.focus(),
    select: () => localRef.current?.select(),
  }))
  useImperativeHandle(
    inputRef,
    () => localRef.current as HTMLInputElement & HTMLTextAreaElement,
  )
  const common = {
    id,
    ref: localRef,
    value,
    placeholder,
    disabled,
    readOnly,
    autoFocus,
    spellCheck,
    onKeyDown,
    onBlur,
    name,
    autoComplete,
    'aria-label': ariaLabel,
    className: mono ? 'm3Mono' : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
  }
  return (
    <m3e-form-field
      className={['m3Field', className].filter(Boolean).join(' ')}
      variant={variant}
      error={error ? true : undefined}
      hide-subscript={error || hint ? undefined : 'always'}
    >
      {label ? (
        <label slot="label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {leadingIcon ? (
        <span slot="prefix" className="m3Icon">
          <MaterialSymbol name={leadingIcon} />
        </span>
      ) : null}
      {multiline ? (
        <textarea {...common} rows={rows} />
      ) : (
        <input {...common} type={type} min={min} max={max} />
      )}
      {trailing ? <span slot="suffix">{trailing}</span> : null}
      {hint ? <span slot="hint">{hint}</span> : null}
      {error ? <span slot="error">{error}</span> : null}
    </m3e-form-field>
  )
}

/**
 * Modal dialog on m3e-dialog. `open` drives it; Escape/scrim/close button
 * report back through onClose so the parent stays the source of truth.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  dismissible = true,
  disableClose,
  className,
  wide,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  dismissible?: boolean
  disableClose?: boolean
  className?: string
  wide?: boolean
}) {
  const ref = useRef<HTMLElement & { open: boolean }>(null)
  useElementEvent(ref, 'closed', () => {
    if (open) onClose()
  })
  useEffect(() => {
    if (ref.current && ref.current.open !== open) ref.current.open = open
  }, [open])
  return (
    <m3e-dialog
      ref={ref}
      className={[wide ? 'm3DialogWide' : '', className].filter(Boolean).join(' ')}
      dismissible={dismissible || undefined}
      disable-close={disableClose || undefined}
    >
      {title ? <span slot="header">{title}</span> : null}
      {open ? <div className="m3DialogBody">{children}</div> : null}
      {actions ? <div slot="actions">{actions}</div> : null}
    </m3e-dialog>
  )
}

export function Chip({
  children,
  icon,
  className,
  title,
}: {
  children: ReactNode
  icon?: MaterialSymbolName | ReactNode
  className?: string
  title?: string
}) {
  return (
    <m3e-chip className={className} title={title}>
      {icon ? (
        <span slot="icon" className="m3Icon">
          <Icon icon={icon} />
        </span>
      ) : null}
      {children}
    </m3e-chip>
  )
}

export function FilterChip({
  children,
  selected,
  onToggle,
  disabled,
  icon,
}: {
  children: ReactNode
  selected: boolean
  onToggle: () => void
  disabled?: boolean
  icon?: MaterialSymbolName
}) {
  return (
    <m3e-filter-chip
      selected={selected}
      disabled={disabled || undefined}
      onClick={disabled ? undefined : onToggle}
    >
      {icon ? (
        <span slot="icon" className="m3Icon">
          <MaterialSymbol name={icon} />
        </span>
      ) : null}
      {children}
    </m3e-filter-chip>
  )
}

export function Progress({
  value,
  max = 100,
  wavy = true,
  indeterminate,
  className,
  ariaLabel,
}: {
  value?: number
  max?: number
  wavy?: boolean
  indeterminate?: boolean
  className?: string
  ariaLabel?: string
}) {
  return (
    <m3e-linear-progress-indicator
      className={className}
      variant={wavy ? 'wavy' : 'flat'}
      mode={indeterminate ? 'indeterminate' : 'determinate'}
      value={value}
      max={max}
      aria-label={ariaLabel}
    />
  )
}

export function Loading({
  contained,
  className,
  label,
}: {
  contained?: boolean
  className?: string
  label?: string
}) {
  return (
    <m3e-loading-indicator
      className={className}
      variant={contained ? 'contained' : 'uncontained'}
      role="progressbar"
      aria-label={label}
    />
  )
}

export type ShapeName =
  | '4-leaf-clover'
  | '4-sided-cookie'
  | '6-sided-cookie'
  | '7-sided-cookie'
  | '8-leaf-clover'
  | '9-sided-cookie'
  | '12-sided-cookie'
  | 'arch'
  | 'arrow'
  | 'boom'
  | 'bun'
  | 'burst'
  | 'circle'
  | 'diamond'
  | 'fan'
  | 'flower'
  | 'gem'
  | 'ghost-ish'
  | 'heart'
  | 'hexagon'
  | 'oval'
  | 'pentagon'
  | 'pill'
  | 'pixel-circle'
  | 'pixel-triangle'
  | 'puffy'
  | 'puffy-diamond'
  | 'semicircle'
  | 'slanted'
  | 'soft-boom'
  | 'soft-burst'
  | 'square'
  | 'sunny'
  | 'triangle'
  | 'very-sunny'

/** Expressive shape; changing `name` morphs between outlines. */
export function Shape({
  name,
  className,
  style,
  children,
}: {
  name: ShapeName
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  return (
    <m3e-shape className={className} style={style} name={name} aria-hidden="true">
      {children}
    </m3e-shape>
  )
}

export function Divider({ inset, vertical }: { inset?: boolean; vertical?: boolean }) {
  return (
    <m3e-divider inset={inset || undefined} vertical={vertical || undefined} />
  )
}

export function Skeleton({
  className,
  shape = 'rounded',
  style,
}: {
  className?: string
  shape?: 'circular' | 'rounded' | 'square' | 'auto'
  style?: CSSProperties
}) {
  return (
    <m3e-skeleton className={className} shape={shape} animation="wave" style={style}>
      <div style={{ width: '100%', height: '100%' }} />
    </m3e-skeleton>
  )
}

/** Collapsible section on m3e-expansion-panel. */
export function Expansion({
  header,
  children,
  open,
  onToggle,
  className,
  icon,
}: {
  header: ReactNode
  children: ReactNode
  open?: boolean
  onToggle?: (open: boolean) => void
  className?: string
  icon?: MaterialSymbolName
}) {
  const ref = useRef<HTMLElement & { open: boolean }>(null)
  useElementEvent(ref, 'opened', () => onToggle?.(true))
  useElementEvent(ref, 'closed', () => onToggle?.(false))
  useEffect(() => {
    if (open !== undefined && ref.current && ref.current.open !== open)
      ref.current.open = open
  }, [open])
  return (
    <m3e-expansion-panel ref={ref} className={['m3Expansion', className].filter(Boolean).join(' ')}>
      <span slot="header" className="m3ExpansionHeader">
        {icon ? (
          <span className="m3Icon">
            <MaterialSymbol name={icon} />
          </span>
        ) : null}
        {header}
      </span>
      {children}
    </m3e-expansion-panel>
  )
}

export function ListItem({
  headline,
  supporting,
  overline,
  leading,
  trailing,
  onClick,
  selected,
  className,
}: {
  headline: ReactNode
  supporting?: ReactNode
  overline?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  selected?: boolean
  className?: string
}) {
  const body = (
    <>
      {leading ? <span slot="leading">{leading}</span> : null}
      {overline ? <span slot="overline">{overline}</span> : null}
      {headline}
      {supporting ? <span slot="supporting-text">{supporting}</span> : null}
      {trailing ? <span slot="trailing">{trailing}</span> : null}
    </>
  )
  return (
    <m3e-list-item
      className={['m3ListItem', className].filter(Boolean).join(' ')}
      data-selected={selected || undefined}
      data-actionable={onClick ? true : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      {body}
    </m3e-list-item>
  )
}

export function List({
  children,
  segmented,
  className,
}: {
  children: ReactNode
  segmented?: boolean
  className?: string
}) {
  return (
    <m3e-list className={className} variant={segmented ? 'segmented' : 'standard'}>
      {children}
    </m3e-list>
  )
}

import Add from '@material-symbols/svg-400/rounded/add.svg?react'
import Corp from '@material-symbols/svg-400/rounded/business_center.svg?react'
import Check from '@material-symbols/svg-400/rounded/check.svg?react'
import Chevron from '@material-symbols/svg-400/rounded/chevron_left.svg?react'
import Close from '@material-symbols/svg-400/rounded/close.svg?react'
import Maximize from '@material-symbols/svg-400/rounded/crop_square.svg?react'
import Moon from '@material-symbols/svg-400/rounded/dark_mode.svg?react'
import Devices from '@material-symbols/svg-400/rounded/devices.svg?react'
import Download from '@material-symbols/svg-400/rounded/download.svg?react'
import Error from '@material-symbols/svg-400/rounded/error.svg?react'
import Help from '@material-symbols/svg-400/rounded/help.svg?react'
import Home from '@material-symbols/svg-400/rounded/home.svg?react'
import Connections from '@material-symbols/svg-400/rounded/hub.svg?react'
import Proxies from '@material-symbols/svg-400/rounded/language.svg?react'
import Sun from '@material-symbols/svg-400/rounded/light_mode.svg?react'
import More from '@material-symbols/svg-400/rounded/more_vert.svg?react'
import Pause from '@material-symbols/svg-400/rounded/pause.svg?react'
import Power from '@material-symbols/svg-400/rounded/power_settings_new.svg?react'
import Refresh from '@material-symbols/svg-400/rounded/refresh.svg?react'
import Minimize from '@material-symbols/svg-400/rounded/remove.svg?react'
import Rules from '@material-symbols/svg-400/rounded/route.svg?react'
import Settings from '@material-symbols/svg-400/rounded/settings.svg?react'
import Shield from '@material-symbols/svg-400/rounded/shield.svg?react'
import Speed from '@material-symbols/svg-400/rounded/speed.svg?react'
import Profiles from '@material-symbols/svg-400/rounded/subscriptions.svg?react'
import Logs from '@material-symbols/svg-400/rounded/terminal.svg?react'
import Advanced from '@material-symbols/svg-400/rounded/tune.svg?react'
import Upload from '@material-symbols/svg-400/rounded/upload.svg?react'
import type { SVGProps } from 'react'

const icons = {
  home: Home,
  profiles: Profiles,
  proxies: Proxies,
  rules: Rules,
  connections: Connections,
  logs: Logs,
  devices: Devices,
  corp: Corp,
  settings: Settings,
  advanced: Advanced,
  chevron: Chevron,
  add: Add,
  power: Power,
  shield: Shield,
  moon: Moon,
  sun: Sun,
  download: Download,
  upload: Upload,
  speed: Speed,
  check: Check,
  close: Close,
  refresh: Refresh,
  error: Error,
  pause: Pause,
  help: Help,
  minimize: Minimize,
  maximize: Maximize,
  more: More,
}

export type MaterialSymbolName = keyof typeof icons

export function MaterialSymbol({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: MaterialSymbolName }) {
  const Icon = icons[name]
  return (
    <Icon
      width={24}
      height={24}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  )
}

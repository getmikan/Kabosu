<p align="center">
  <img src="docs/readmelogo.png" alt="Kabosu — green citrus fruit on a dark blue background" width="192" height="192" />
</p>
<h1 align="center">Kabosu</h1>
<p align="center">A desktop client for Citrus. Profiles, routing rules and your connections in one place.</p>
<p align="center">Windows · macOS · Linux<br />Go · Wails · React · TypeScript</p>
<p align="center">
  <a href="docs/README_ru.md">Русский</a> ·
  <a href="docs/README_zh.md">简体中文</a> ·
  <a href="https://github.com/getmikan/Kabosu/releases">Downloads</a> ·
  <a href="https://github.com/getmikan/Kabosu/issues">Issues</a> ·
  <a href="Changelog.md">Changelog</a>
</p>

## About

**Kabosu** is the [getmikan](https://github.com/getmikan) fork of [Sloth Clash](https://github.com/Nemu-x/SlothClash), built around the [Citrus](https://github.com/getmikan/Citrus) proxy core. It keeps the Go/Wails desktop application and React interface, with its own name, citrus artwork and release destinations.

Kabosu is a client: bring your own subscription, share links or local configuration. The repository does not provide proxy servers or a VPN subscription.

## Features

- Import and manage subscriptions, share links and local YAML profiles.
- Switch proxy nodes and groups, check latency and refresh subscriptions.
- Route traffic through the system proxy or a TUN adapter.
- Inspect live connections, routing rules, traffic and diagnostic logs.
- Edit routing through the visual/YAML editors, profile merges and JavaScript hooks.
- Use English, Russian or Simplified Chinese, light/dark themes and state-aware tray icons.
- Import subscriptions through `kabosu://install-config` links, with confirmation before import.
- Check releases from `getmikan/Kabosu`; Windows update installation requires signed checksums.

The green Material 3 Expressive interface uses local Roboto Flex and official Material Symbols. Native Citrus handles REALITY, provider overrides and group health checks. See [core compatibility notes](core/citrus/README.md) before migrating older profiles.

Panel response headers follow MikanApp: branding, account links, subscription policies and server-group quotas. See [the header reference](docs/PANEL_HEADERS_ru.md).

## Downloads

Use the [Kabosu releases page](https://github.com/getmikan/Kabosu/releases). Only packages published there are Kabosu builds. If a platform has no asset yet, build it from source.

| Platform | Packaging produced by CI |
| --- | --- |
| Windows x64 / ARM64 | `Kabosu-windows-<arch>-installer.exe` |
| macOS Apple Silicon / Intel | `Kabosu-macOS-<arch>.dmg` |
| Linux x64 / ARM64 | AppImage, deb, rpm, Arch package and tar.gz |

TUN mode requires the privileged helper. Install it from Settings when prompted. Linux tar.gz builds need GTK 3 and WebKitGTK 4.1; AppImage packaging bundles those libraries. Windows installers require WebView2. The helper and its release binaries remain an [upstream dependency](https://github.com/Nemu-x/sloth-clash-service-ipc).

## Build from source

Requirements: **Go 1.26.7** (desktop toolchain), **Node.js 20.19+ or 22.12+**, **pnpm 10.33.0**, and the [Wails platform dependencies](https://wails.io/docs/gettingstarted/installation). The scripts locate or install the Wails v2 CLI. Windows installer builds also need NSIS; Linux builds need the GTK/WebKit development packages.

```bash
git clone https://github.com/getmikan/Kabosu.git
cd Kabosu
pnpm install --frozen-lockfile
pnpm run desktop:resources
pnpm run wails:dev
```

`desktop:resources` runs the required checks and prepares Citrus, helper binaries and generated icons. It downloads build resources, so network access is required. Build the current platform with `pnpm run wails:build`, or use the platform commands:

| Target | Command |
| --- | --- |
| Windows x64 installer | `pnpm run desktop:build:windows` |
| Windows ARM64 installer | `pnpm run desktop:build:windows:arm64` |
| macOS Apple Silicon DMG | `pnpm run desktop:build:darwin:arm64:dmg` |
| macOS Intel DMG | `pnpm run desktop:build:darwin:amd64:dmg` |
| Linux x64 / ARM64 | `pnpm run desktop:build:linux:amd64` / `pnpm run desktop:build:linux:arm64` |

Source lives in `apps/sloth-clash-desktop`; this inherited directory name is intentional. Installed executables and packages use Kabosu. See [branding and compatibility](docs/BRANDING.md) for the remaining internal upstream identifiers.

## Icons

The supplied Kabosu artwork is tracked in [`docs/appicon-main.png`](docs/appicon-main.png). The same image is used for README artwork, the frontend, application icons and colorful tray states. macOS template icons use a monochrome silhouette of the fruit and leaf.

```bash
pnpm run copy:desktop-appicon
pnpm run icons:windows
pnpm run desktop:packaging
```

Windows ICOs contain multiple sizes; Wails generates the macOS and Linux application resources from the same source. Tray badges retain the existing distinction between disconnected, Proxy and TUN states.

## Checks and releases

Run `pnpm run test:required` for the existing required checks and `pnpm run lint` for the frontend. [Desktop artifacts](.github/workflows/desktop-artifacts.yml) builds platform packages; [Core build](.github/workflows/core-build.yml) builds the pinned Citrus core.

Before distributing signed updates, configure a **Kabosu-owned minisign key** and repository signing secrets using [UPDATES.md](docs/UPDATES.md). The inherited upstream public key has not been replaced by this branding change. Verification remains enforced; unsigned or differently signed Windows updates are refused. Optional SignPath, winget, AUR and Pages publishing require the fork's own configuration; this README does not imply those services are registered or live.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) for development and [SECURITY.md](SECURITY.md) for private vulnerability reporting. Report ordinary bugs in [Kabosu issues](https://github.com/getmikan/Kabosu/issues).

## Credits and license

Kabosu builds on work by **Nemu-x and the Sloth Clash contributors**. Its earlier UI lineage includes [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) and [Clash Verge](https://github.com/zzzgydi/clash-verge). Thanks also to [Mihomo](https://github.com/MetaCubeX/mihomo), [Wails](https://github.com/wailsapp/wails) and the Clash ecosystem.

The original license and upstream history are preserved. Kabosu is distributed under [GPL-3.0-only](LICENSE).

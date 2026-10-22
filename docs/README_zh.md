<p align="center"><img src="readmelogo.png" alt="Kabosu — 深蓝色背景上的绿色香橙" width="192" height="192" /></p>
<h1 align="center">Kabosu</h1>
<p align="center">Citrus 桌面客户端，在一个应用中管理配置、路由规则与连接。<br />Windows · macOS · Linux</p>
<p align="center"><a href="../README.md">English</a> · <a href="README_ru.md">Русский</a> · <a href="https://github.com/getmikan/Kabosu/releases">下载</a> · <a href="https://github.com/getmikan/Kabosu/issues">反馈问题</a></p>

## 简介

**Kabosu** 是 [getmikan](https://github.com/getmikan) 维护的 [Sloth Clash](https://github.com/Nemu-x/SlothClash) 分支，采用 [Citrus](https://github.com/getmikan/Citrus) 内核、Go/Wails 桌面框架与 React/TypeScript 界面，使用自己的名称、绿色香橙图标和发行地址。

请自行提供订阅、节点链接或本地 YAML 配置。本项目不提供代理服务器或 VPN 订阅。

## 功能

- 导入和管理订阅、节点链接及本地 YAML 配置。
- 切换代理节点与分组、测试延迟、自动更新订阅。
- 系统代理与 TUN 流量模式。
- 实时连接、流量、路由规则与诊断日志。
- 可视化及 YAML 规则编辑、配置合并和 JavaScript 钩子。
- 简体中文、英语、俄语，浅色与深色主题。
- 区分断开、Proxy 和 TUN 状态的托盘图标。
- 通过 `kabosu://install-config` 导入订阅，导入前需要用户确认。
- 从 `getmikan/Kabosu` 检查更新；Windows 安装更新前验证签名与校验和。

## 下载

请前往 [Kabosu 发行页](https://github.com/getmikan/Kabosu/releases)。若目标平台尚无附件，请从源码构建。

| 平台 | 构建格式 |
| --- | --- |
| Windows x64 / ARM64 | `Kabosu-windows-<arch>-installer.exe` |
| macOS Apple Silicon / Intel | `Kabosu-macOS-<arch>.dmg` |
| Linux x64 / ARM64 | AppImage、deb、rpm、Arch 包、tar.gz |

TUN 需要特权辅助服务，可在设置中安装。Linux tar.gz 需要 GTK 3 和 WebKitGTK 4.1，AppImage 包含这些库。Windows 需要 WebView2。辅助服务二进制文件仍依赖 [上游服务项目](https://github.com/Nemu-x/sloth-clash-service-ipc)。

## 从源码构建

需要 **Go 1.26.7**、**Node.js 20.19+ 或 22.12+**、**pnpm 10.33.0** 及 [Wails 平台依赖](https://wails.io/docs/gettingstarted/installation)。Windows 安装包还需要 NSIS，Linux 需要 GTK/WebKit 开发包。脚本会查找或安装 Wails v2 CLI。

```bash
git clone https://github.com/getmikan/Kabosu.git
cd Kabosu
pnpm install --frozen-lockfile
pnpm run desktop:resources
pnpm run wails:dev
```

`desktop:resources` 执行必要检查并下载内核、辅助服务和构建资源，需要网络连接。使用 `pnpm run wails:build` 构建当前平台；其他平台命令见 [主 README](../README.md#build-from-source)。

源码目录仍为 `apps/sloth-clash-desktop`，安装后的应用和包使用 Kabosu 名称。为兼容现有配置和辅助服务，部分内部存储及 IPC 标识保留上游名称，详见 [BRANDING.md](BRANDING.md)。

## 图标

[`appicon-main.png`](appicon-main.png) 是主图标，同一图像用于文档、界面、应用图标和彩色托盘。macOS 单色模板采用同一果实与叶子的轮廓。

```bash
pnpm run copy:desktop-appicon
pnpm run icons:windows
pnpm run desktop:packaging
```

## 检查与发行

运行 `pnpm run test:required` 执行必要检查，`pnpm run lint` 检查前端代码。平台包由 [Desktop artifacts](../.github/workflows/desktop-artifacts.yml) 构建。

发布自有签名更新前，必须按 [UPDATES.md](UPDATES.md) 配置 Kabosu 的 minisign 密钥和仓库 secrets。本次品牌修改保留了上游公钥；未签名或使用其他密钥签名的 Windows 更新仍会被拒绝。SignPath、winget、AUR 和 Pages 需要分支自己的配置，本文不表示这些服务已经上线。

## 贡献与许可

开发指南见 [CONTRIBUTING.md](../CONTRIBUTING.md)，安全问题请按 [SECURITY.md](../SECURITY.md) 私下报告。

感谢 **Nemu-x 及 Sloth Clash 贡献者**，以及 [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev)、[Clash Verge](https://github.com/zzzgydi/clash-verge)、[Mihomo](https://github.com/MetaCubeX/mihomo) 和 [Wails](https://github.com/wailsapp/wails)。原始许可和历史记录保留，Kabosu 使用 [GPL-3.0-only](../LICENSE)。

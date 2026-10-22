# Citrus core for Kabosu

Kabosu embeds [Citrus](https://github.com/getmikan/Citrus), pinned to the `dev`
commit in [manifest.json](manifest.json). The version includes its commit prefix;
builds never silently follow a moving branch. The source module retains the
`github.com/metacubex/mihomo` path for compatibility.

## Building

```sh
node scripts/core-build.mjs core-dist windows-amd64
SLOTH_CORE_DIR=/absolute/path/to/core-dist pnpm run prebuild
```

The builder checks out the exact commit, runs native TLS/config/provider tests,
uses the Go release from `.tool-versions`, and writes `BUILDINFO.txt` and
`SHA256SUMS`. Resource preparation verifies both provenance and the binary hash.
Unverified `SLOTH_CORE_FILE` and `MIHOMO_CORE_VERSION` overrides are rejected.
CI requires the verified core artifact from the same workflow.

Build flags: CGO disabled, `with_gvisor`, `-trimpath`, amd64 v2, fixed build time
from the source commit and an empty Go build ID. Host Windows amd64 has been
built and exercised; other targets are configured in CI but require their own
build verification. This stock Go toolchain does not establish support for old
Windows/macOS versions supported by Citrus's separate patched-Go builds.

## Native features used by the client

- REALITY preferences become per-node `reality-opts.client-version` and
  `support-x25519mlkem768`. Remote providers use native `override-expr`, preserving
  existing overrides. Auto leaves node/core defaults in charge; it does not use
  the removed client patch's adaptive per-server learning.
- Group latency uses `/group/{name}/delay` with the native group's `testUrl` and
  `expectedStatus`. Citrus owns concurrency, nested groups and health history.
- Chain hops retain their configured order. The UI disables node selection and
  fastest-node actions for chains, and shows native failure diagnostics.
- Include-all provider groups retain their providers, even when they have no
  explicit `use` list. Native group fields pass through the configuration pipeline.
- Config checking, routing, DNS/fake-IP cache and provider management stay in the
  core. The app still handles subscriptions, operating-system integration and UI.

## Compatibility

Citrus dev removes VMess, mKCP, mekya and TLSMirror support. Existing profiles
using them need a supported protocol; native config validation reports errors.
The old three Mihomo patches and their version-specific REALITY lab are removed.
Old top-level REALITY preferences are translated before validation. Helper/IPC,
profile storage and sidecar filenames remain compatible with existing installs;
the sidecar's historical name does not identify its actual engine.

`tests/citrus-core.test.mjs` checks provenance, checksum rejection and an isolated
real controller. Desktop tests cover native REALITY/provider translation, chains,
dynamic provider preservation and native group delay. Set `CITRUS_TEST_BIN` (Node)
and `SLOTH_MIHOMO_BIN` (legacy desktop test variable) to the built Citrus binary.
No remote REALITY interoperability or actual OS proxy/TUN change is implied.

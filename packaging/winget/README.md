# Kabosu on winget

The upstream Sloth Clash manifests are not Kabosu packages. They were removed from this fork because their hashes, product codes and download URLs refer to upstream installers.

Before enabling automatic publication:

1. Publish and verify Kabosu Windows x64/ARM64 installer assets in `getmikan/Kabosu`.
2. Generate manifests from those actual installers with `wingetcreate`; use their real hashes and installer product codes.
3. Submit the first Kabosu package to `microsoft/winget-pkgs` and wait for acceptance.
4. Set repository variable `WINGET_PACKAGE_IDENTIFIER` to that registered identifier and secret `WINGET_TOKEN` to a token allowed to submit subsequent updates.

The `winget` job in `desktop-artifacts.yml` is gated on the variable and token. It matches `Kabosu-windows-(amd64|arm64)-installer.exe`. Do not reuse the upstream package identifier or claim that Kabosu is registered before the initial submission is accepted.

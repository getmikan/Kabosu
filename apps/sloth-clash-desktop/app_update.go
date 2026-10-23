package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	wailsrt "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	githubOwner = "getmikan"
	githubRepo  = "Kabosu"

	githubAPIHTTPTimeout  = 45 * time.Second
	updateDownloadTimeout = 60 * time.Minute
)

var (
	githubAPIHTTPClient      = &http.Client{Timeout: githubAPIHTTPTimeout}
	updateDownloadHTTPClient = &http.Client{Timeout: updateDownloadTimeout}
)

type githubRelease struct {
	TagName string        `json:"tag_name"`
	Draft   bool          `json:"draft"`
	HTMLURL string        `json:"html_url"`
	Body    string        `json:"body"`
	Assets  []githubAsset `json:"assets"`
}

type githubAsset struct {
	Name        string `json:"name"`
	DownloadURL string `json:"browser_download_url"`
}

func stripV(s string) string {
	return strings.TrimPrefix(strings.TrimSpace(s), "v")
}

func parseVersionParts(s string) (a, b, c int) {
	s = stripV(s)
	parts := strings.Split(s, ".")
	if len(parts) >= 1 {
		a, _ = strconv.Atoi(parts[0])
	}
	if len(parts) >= 2 {
		b, _ = strconv.Atoi(parts[1])
	}
	if len(parts) >= 3 {
		p3 := parts[2]
		for i, r := range p3 {
			if r < '0' || r > '9' {
				p3 = p3[:i]
				break
			}
		}
		c, _ = strconv.Atoi(p3)
	}
	return
}

// splitPrerelease splits "v0.1.1-beta.2" into its base ("0.1.1") and
// prerelease ("beta.2", "" for a stable version).
func splitPrerelease(s string) (base, pre string) {
	s = stripV(s)
	if i := strings.IndexAny(s, "-+"); i >= 0 {
		base, pre = s[:i], s[i:]
		if pre[0] == '-' {
			pre, _, _ = strings.Cut(pre[1:], "+")
		} else {
			pre = "" // build metadata only
		}
		return base, pre
	}
	return s, ""
}

// comparePrerelease orders prerelease strings by SemVer rules: a stable
// version ("") outranks any prerelease, numeric identifiers compare
// numerically and below alphanumeric ones, a shorter prefix sorts first.
func comparePrerelease(a, b string) int {
	if a == b {
		return 0
	}
	if a == "" {
		return 1
	}
	if b == "" {
		return -1
	}
	as, bs := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(as) && i < len(bs); i++ {
		an, aErr := strconv.Atoi(as[i])
		bn, bErr := strconv.Atoi(bs[i])
		switch {
		case aErr == nil && bErr == nil:
			if an != bn {
				if an < bn {
					return -1
				}
				return 1
			}
		case aErr == nil:
			return -1
		case bErr == nil:
			return 1
		default:
			if c := strings.Compare(as[i], bs[i]); c != 0 {
				return c
			}
		}
	}
	switch {
	case len(as) < len(bs):
		return -1
	case len(as) > len(bs):
		return 1
	}
	return 0
}

// compareAppVersions returns -1, 0 or 1 as a is older than, equal to or newer
// than b. Prereleases sort before their release: 0.1.1-beta.1 < 0.1.1-beta.2 < 0.1.1.
func compareAppVersions(a, b string) int {
	aBase, aPre := splitPrerelease(a)
	bBase, bPre := splitPrerelease(b)
	a1, a2, a3 := parseVersionParts(aBase)
	b1, b2, b3 := parseVersionParts(bBase)
	for _, d := range [][2]int{{a1, b1}, {a2, b2}, {a3, b3}} {
		if d[0] != d[1] {
			if d[0] < d[1] {
				return -1
			}
			return 1
		}
	}
	return comparePrerelease(aPre, bPre)
}

// remoteIsNewer returns true if remoteTag is a higher version than localVer
// (e.g. 0.2.0 vs 0.1.0, or 0.1.1 vs 0.1.1-beta.1).
func remoteIsNewer(remoteTag, localVer string) bool {
	return compareAppVersions(remoteTag, localVer) > 0
}

func windowsInstallerArchToken() string {
	switch runtime.GOARCH {
	case "arm64":
		return "arm64"
	default:
		// amd64 build runs on Windows x64 and on ARM64 via x64 emulation.
		return "amd64"
	}
}

func pickWindowsInstallerAsset(assets []githubAsset) (name, url string) {
	arch := windowsInstallerArchToken()
	for _, as := range assets {
		n := strings.ToLower(as.Name)
		if !strings.HasSuffix(n, ".exe") {
			continue
		}
		if strings.Contains(n, "installer") && strings.Contains(n, arch) {
			return as.Name, as.DownloadURL
		}
	}
	// Legacy fallback when release assets omit the arch token we expect.
	for _, as := range assets {
		n := strings.ToLower(as.Name)
		if !strings.HasSuffix(n, ".exe") {
			continue
		}
		if strings.Contains(n, "installer") && (strings.Contains(n, "amd64") || strings.Contains(n, "x64")) {
			return as.Name, as.DownloadURL
		}
	}
	for _, as := range assets {
		n := strings.ToLower(as.Name)
		if strings.HasSuffix(n, ".exe") && strings.Contains(n, "installer") {
			return as.Name, as.DownloadURL
		}
	}
	return "", ""
}

// pickChecksumsAsset locates a SHA256SUMS-style file published alongside the
// installer. The canonical convention (used by goreleaser, GitHub release
// tooling, and most Linux distros) is one of:
//   - SHA256SUMS
//   - SHA256SUMS.txt
//   - checksums.txt
//
// We accept any of them so the release workflow has flexibility. Returns
// ("", "") if the release does not ship a checksums file — in that mode the
// updater falls back to download-without-verification with a runtime warning.
func pickChecksumsAsset(assets []githubAsset) (name, url string) {
	for _, as := range assets {
		n := strings.ToLower(strings.TrimSpace(as.Name))
		switch n {
		case "sha256sums", "sha256sums.txt", "checksums.txt", "checksums-sha256.txt":
			return as.Name, as.DownloadURL
		}
	}
	return "", ""
}

// parseChecksumsFile reads SHA256SUMS-style content and returns a map keyed
// by file name → lowercase hex digest. The standard format is:
//
//	<hex-digest>  <filename>
//
// optionally with a leading "*" before the filename (sha256sum -b). Empty
// lines and lines starting with "#" are ignored.
func parseChecksumsFile(body []byte) map[string]string {
	out := map[string]string{}
	for _, line := range strings.Split(string(body), "\n") {
		s := strings.TrimSpace(line)
		if s == "" || strings.HasPrefix(s, "#") {
			continue
		}
		fields := strings.Fields(s)
		if len(fields) < 2 {
			continue
		}
		digest := strings.ToLower(strings.TrimSpace(fields[0]))
		name := strings.TrimPrefix(strings.TrimSpace(fields[len(fields)-1]), "*")
		if len(digest) != 64 || name == "" {
			continue
		}
		out[name] = digest
	}
	return out
}

// githubGetJSON GETs a GitHub API path under the Kabosu repo into out.
func githubGetJSON(path string, out any) error {
	u := fmt.Sprintf("https://api.github.com/repos/%s/%s/%s", githubOwner, githubRepo, path)
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "Kabosu/"+AppVersion)
	resp, err := githubAPIHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet := string(body)
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return fmt.Errorf("GitHub API %s: %s", resp.Status, strings.TrimSpace(snippet))
	}
	return json.Unmarshal(body, out)
}

// fetchReleaseAssets returns the asset list of the release tagged tag — the
// one the last update check offered, so its checksums match the installer.
func fetchReleaseAssets(tag string) ([]githubAsset, error) {
	if strings.TrimSpace(tag) == "" {
		return nil, errors.New("no release tag — run Check for updates first")
	}
	var rel githubRelease
	if err := githubGetJSON("releases/tags/"+url.PathEscape(tag), &rel); err != nil {
		return nil, err
	}
	return rel.Assets, nil
}

// downloadAssetBytes fetches a (small) release asset into memory.
func downloadAssetBytes(url string, limit int64) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Kabosu/"+AppVersion)
	resp, err := githubAPIHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("download failed: %s", resp.Status)
	}
	return io.ReadAll(io.LimitReader(resp.Body, limit))
}

// pickSignatureAsset locates the minisign signature published for the checksums
// file (SHA256SUMS.minisig / SHA256SUMS.sig, or any *.minisig).
func pickSignatureAsset(assets []githubAsset) (name, url string) {
	for _, as := range assets {
		switch strings.ToLower(strings.TrimSpace(as.Name)) {
		case "sha256sums.minisig", "sha256sums.sig", "checksums.txt.minisig":
			return as.Name, as.DownloadURL
		}
	}
	for _, as := range assets {
		if strings.HasSuffix(strings.ToLower(strings.TrimSpace(as.Name)), ".minisig") {
			return as.Name, as.DownloadURL
		}
	}
	return "", ""
}

// resolveInstallerDigest fetches the release's checksums file and, if present,
// its minisign signature; verifies the signature against the embedded trusted
// keys; and returns the expected installer digest.
//
//   - verified=true only when a signature was present AND verified.
//   - A present-but-invalid signature is a hard error (an attack signal).
//   - No checksums file → ("", false, nil): the caller's fail-closed policy
//     decides whether to proceed (see ApplyUpdate).
func (a *App) resolveInstallerDigest(tag, installerName string) (digest string, verified bool, err error) {
	if strings.TrimSpace(installerName) == "" {
		return "", false, nil
	}
	assets, err := fetchReleaseAssets(tag)
	if err != nil {
		return "", false, fmt.Errorf("look up release: %w", err)
	}
	_, csURL := pickChecksumsAsset(assets)
	if csURL == "" {
		return "", false, nil
	}
	csBody, err := downloadAssetBytes(csURL, 1*1024*1024)
	if err != nil {
		return "", false, fmt.Errorf("download checksums: %w", err)
	}

	_, sigURL := pickSignatureAsset(assets)
	if sigURL != "" {
		sigBody, err := downloadAssetBytes(sigURL, 64*1024)
		if err != nil {
			return "", false, fmt.Errorf("download signature: %w", err)
		}
		if err := verifyMinisign(csBody, sigBody, trustedUpdateKeys); err != nil {
			return "", false, fmt.Errorf("checksums signature verification failed: %w", err)
		}
		verified = true
	}

	table := parseChecksumsFile(csBody)
	if h, ok := table[installerName]; ok {
		return h, verified, nil
	}
	for name, d := range table {
		if strings.EqualFold(name, installerName) {
			return d, verified, nil
		}
	}
	return "", verified, fmt.Errorf("checksums file did not list %q", installerName)
}

// hashFileSHA256 returns the lowercase hex SHA-256 digest of the file at path.
func hashFileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// pickNewestRelease returns the highest-versioned published release; drafts
// and untagged entries are skipped. Prereleases count, so the beta channel also
// moves on to a stable release once it outranks the betas.
func pickNewestRelease(releases []githubRelease) (githubRelease, bool) {
	var best githubRelease
	found := false
	for _, rel := range releases {
		if rel.Draft || strings.TrimSpace(rel.TagName) == "" {
			continue
		}
		if !found || compareAppVersions(rel.TagName, best.TagName) > 0 {
			best, found = rel, true
		}
	}
	return best, found
}

// fetchLatestGitHubRelease returns the release the given channel should
// offer: releases/latest (never a prerelease) on stable, the newest release
// including prereleases on beta.
func fetchLatestGitHubRelease(channel string) (tag, htmlURL, notes, assetName, assetURL string, err error) {
	var rel githubRelease
	if channel == updateChannelBeta {
		var all []githubRelease
		if err := githubGetJSON("releases?per_page=30", &all); err != nil {
			return "", "", "", "", "", err
		}
		rel, _ = pickNewestRelease(all)
	} else if err := githubGetJSON("releases/latest", &rel); err != nil {
		return "", "", "", "", "", err
	}
	tag = strings.TrimSpace(rel.TagName)
	htmlURL = strings.TrimSpace(rel.HTMLURL)
	notes = strings.TrimSpace(rel.Body)
	// Direct-download+install is Windows-only. On macOS/Linux we must NOT expose
	// an asset URL, or the UI's download button would pull the Windows installer
	// (it matches "installer"+arch, so on an arm64 Mac it grabs the arm64 Windows
	// .exe). Leaving it empty makes both Home and Settings fall back to "open
	// release page", which is the correct path on those platforms.
	if runtime.GOOS == "windows" {
		assetName, assetURL = pickWindowsInstallerAsset(rel.Assets)
	}
	return tag, htmlURL, notes, assetName, assetURL, nil
}

func (a *App) runGitHubUpdateCheck() {
	channel := currentDesktopPrefs().AppUpdate.UpdateChannel()
	tag, htmlURL, notes, assetName, assetURL, err := fetchLatestGitHubRelease(channel)

	a.mu.Lock()
	a.update.Channel = channel
	a.update.LastCheckedAt = time.Now().Unix()
	a.update.CurrentVersion = AppVersion
	a.update.ReleaseURL = htmlURL
	a.update.ReleaseNotes = notes
	a.update.LatestVersion = stripV(tag)
	a.update.LatestTag = tag
	a.update.AssetName = assetName
	a.update.AssetDownloadURL = assetURL
	a.update.LastError = ""

	if err != nil {
		a.update.LastError = err.Error()
		a.update.HasUpdate = false
		a.mu.Unlock()
		a.emitUpdateEvent()
		return
	}
	if tag == "" {
		a.update.HasUpdate = false
		a.mu.Unlock()
		a.emitUpdateEvent()
		return
	}
	a.update.HasUpdate = remoteIsNewer(tag, AppVersion)
	a.mu.Unlock()
	a.emitUpdateEvent()
}

func (a *App) emitUpdateEvent() {
	if a.ctx == nil {
		return
	}
	go wailsrt.EventsEmit(a.ctx, "app:update", map[string]any{})
}

func (a *App) updateCheckLoop(ctx context.Context) {
	// The loop stays alive even when auto-check is disabled so toggling it back
	// on in Settings takes effect without an app restart — we just skip the
	// actual GitHub call while it's off. Manual CheckForUpdates is unaffected.
	select {
	case <-time.After(50 * time.Second):
		if currentDesktopPrefs().AppUpdate.IsAutoCheckEnabled() {
			a.runGitHubUpdateCheck()
		}
	case <-ctx.Done():
		return
	}
	t := time.NewTicker(6 * time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if currentDesktopPrefs().AppUpdate.IsAutoCheckEnabled() {
				a.runGitHubUpdateCheck()
			}
		}
	}
}

// CheckForUpdates queries GitHub releases/latest and refreshes update state.
func (a *App) CheckForUpdates() UpdateState {
	a.runGitHubUpdateCheck()
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.update
}

// ApplyUpdate downloads the latest Windows installer asset, verifies it, and
// launches it to upgrade in place. It is **fail-closed (secure by default):**
//
//  1. Download the installer to a temp file.
//  2. Fetch the release's checksums file + its minisign signature; verify the
//     signature against the trusted public key(s) embedded in the binary
//     (`verifyMinisign` in resolveInstallerDigest). A present-but-invalid
//     signature is a hard error.
//  3. Verify the downloaded installer's SHA-256 against the (now-authenticated)
//     checksums. Any mismatch deletes the temp file and aborts — no launch.
//  4. Only then tear down the core/TUN and launch the installer.
//
// If the release is NOT signed by a trusted key, the update is REFUSED unless
// `SLOTH_ALLOW_UNVERIFIED_UPDATE=1` is set (local testing only). This closes
// audit findings F1/F8. (Signature verification is implemented here, not a
// future TODO.)
func (a *App) ApplyUpdate() error {
	if runtime.GOOS != "windows" {
		return errors.New("in-app installer launch is only supported on Windows — open the release page from Settings")
	}
	a.mu.RLock()
	url := strings.TrimSpace(a.update.AssetDownloadURL)
	installerName := strings.TrimSpace(a.update.AssetName)
	tag := strings.TrimSpace(a.update.LatestTag)
	a.mu.RUnlock()
	if url == "" {
		return errors.New("no installer URL — run Check for updates first")
	}

	tmp := filepath.Join(os.TempDir(), "Kabosu-desktop-update.exe")
	if err := a.downloadUpdateAsset(url, tmp); err != nil {
		return err
	}

	// Verify the release is authentic before launching anything. Secure by
	// default (fail-closed): require a checksums file signed by a trusted minisign
	// key, then verify the downloaded installer's digest against it. The
	// SLOTH_ALLOW_UNVERIFIED_UPDATE=1 escape hatch (local testing only) downgrades
	// to best-effort. A present-but-invalid signature is always refused.
	allowUnverified := strings.EqualFold(strings.TrimSpace(os.Getenv("SLOTH_ALLOW_UNVERIFIED_UPDATE")), "1")
	digest, verified, vErr := a.resolveInstallerDigest(tag, installerName)
	if vErr != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("refusing to launch update: %w", vErr)
	}
	if !verified && !allowUnverified {
		_ = os.Remove(tmp)
		return errors.New("refusing to launch update: release is not signed by a trusted key — set SLOTH_ALLOW_UNVERIFIED_UPDATE=1 to override (local testing only)")
	}
	if digest != "" {
		gotHash, err := hashFileSHA256(tmp)
		if err != nil {
			_ = os.Remove(tmp)
			return fmt.Errorf("could not hash downloaded installer: %w", err)
		}
		if !strings.EqualFold(gotHash, digest) {
			_ = os.Remove(tmp)
			return fmt.Errorf(
				"installer integrity check failed: expected sha256=%s, got %s — refusing to launch",
				digest, gotHash,
			)
		}
	} else if !allowUnverified {
		_ = os.Remove(tmp)
		return errors.New("refusing to launch update: no checksum found for the installer")
	}
	a.traceEvent("update.verify", "ok", 0, map[string]any{
		"asset":    installerName,
		"signed":   verified,
		"digested": digest != "",
	})

	// Tear down the core + TUN before handing off to the installer. The installer
	// kills this process to replace it, bypassing the normal shutdown() path; without
	// this the core (and its wintun adapter) survive the update and the next launch's
	// first Connect hits an already-up TUN. See fix-tun-teardown-on-update.
	a.traceEvent("update.teardown", "core+tun", 0, nil)
	a.drainTunAndStopCore()

	if err := launchUpdateInstaller(tmp, windowsUpdateInstallerArgs()); err != nil {
		return err
	}
	// Exit promptly so the elevated NSIS installer is not fighting this process
	// (and any WebView2/mihomo children) for file locks. ShellExecute returns as
	// soon as the UAC prompt is shown; the installer starts only after the user
	// accepts, so a graceful Quit() from the frontend is too late and too slow.
	scheduleProcessExitForUpdateHandoff()
	return nil
}

func (a *App) downloadUpdateAsset(url, dest string) error {
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		out.Close()
		return err
	}
	req.Header.Set("User-Agent", "Kabosu/"+AppVersion)
	resp, err := updateDownloadHTTPClient.Do(req)
	if err != nil {
		out.Close()
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		out.Close()
		return fmt.Errorf("download failed: %s", resp.Status)
	}

	// Stream with throttled progress events so the UI can show a download bar.
	total := resp.ContentLength
	a.emitUpdateProgress(0, total)
	var downloaded int64
	buf := make([]byte, 64*1024)
	lastEmit := time.Now()
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := out.Write(buf[:n]); werr != nil {
				out.Close()
				return werr
			}
			downloaded += int64(n)
			if time.Since(lastEmit) >= 150*time.Millisecond {
				a.emitUpdateProgress(downloaded, total)
				lastEmit = time.Now()
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			out.Close()
			return rerr
		}
	}
	a.emitUpdateProgress(downloaded, total)
	return out.Close()
}

// emitUpdateProgress notifies the UI of download progress. pct is -1 when the
// server did not report a content length.
func (a *App) emitUpdateProgress(downloaded, total int64) {
	if a.ctx == nil {
		return
	}
	pct := -1.0
	if total > 0 {
		pct = float64(downloaded) / float64(total) * 100
	}
	wailsrt.EventsEmit(a.ctx, "app:update:progress", map[string]any{
		"downloaded": downloaded,
		"total":      total,
		"pct":        pct,
	})
}

package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// TUN bring-up verification & diagnostics.
//
// Background: the core's HTTP API answers (fetchVersionAt) as soon as the
// process is up — but on Windows/macOS the TUN adapter is created slightly
// later, and when it fails Mihomo logs the error AFTER the API is already
// reachable. So "API up" is NOT proof the adapter came up. We verify the
// adapter out-of-band by scanning the core.log window for the authoritative
// markers (and a best-effort OS adapter cross-check), because Mihomo's
// /configs reload can return success even when the wintun bring-up failed
// asynchronously. See architecture/tun-bringup-reliability.md.

type tunVerifyResult int

const (
	tunVerifyUnknown tunVerifyResult = iota // no marker seen yet within the window
	tunVerifyUp                             // adapter confirmed up
	tunVerifyFailed                         // bring-up error seen
)

// Authoritative Mihomo log markers (verified against MetaCubeX/mihomo
// listener/listener.go::ReCreateTun): success logs "[TUN] Tun adapter listening
// at: <addr>" (line 533); failure logs "Start TUN listening error: <err>" (509),
// whose detail typically includes "configure tun interface: ...". Matched
// case-insensitively. Note: success and failure substrings do NOT overlap.
const (
	tunSuccessMarker    = "tun adapter listening at"
	tunFailErrorMarker  = "start tun listening error"
	tunFailConfigMarker = "configure tun interface"
	// tunBootMarker is logged by Mihomo at the start of every (re)load. core.log
	// is append-only across restarts AND sessions, so a raw tail can carry a
	// stale "start tun listening error" from a PREVIOUS boot — which made verify
	// latch a false failure that survived reboots/reinstalls (the poison line
	// stays in the log). Scoping every scan to the text after the LAST boot
	// marker guarantees we only judge the current core instance.
	tunBootMarker = "start initial configuration in progress"
)

// currentBootLog trims core.log text to the current core instance: everything
// from the LAST boot marker onward. Lines before it belong to a previous
// (re)load or session and MUST NOT influence this connect's verdict — otherwise
// a stale failure line produces a permanent false "TUN blocked" banner that
// reinstalling the service and rebooting can't clear. No marker => return as-is.
func currentBootLog(logText string) string {
	if i := strings.LastIndex(strings.ToLower(logText), tunBootMarker); i >= 0 {
		return logText[i:]
	}
	return logText
}

// scanTunBringUpLog classifies a chunk of core.log text. The LAST relevant
// event wins (a later success after an earlier transient error means up, and
// vice-versa). Case-insensitive; "no marker" => unknown (caller treats a
// persistent unknown as failure, fail-safe).
func scanTunBringUpLog(logText string) tunVerifyResult {
	res := tunVerifyUnknown
	for _, raw := range strings.Split(logText, "\n") {
		line := strings.ToLower(raw)
		switch {
		case strings.Contains(line, tunFailErrorMarker), strings.Contains(line, tunFailConfigMarker):
			res = tunVerifyFailed
		case strings.Contains(line, tunSuccessMarker):
			res = tunVerifyUp
		}
	}
	return res
}

// coreLogPathForProfile returns the log the running core writes for the
// profile: logs/service_latest.log when the Windows service runs it, core.log
// when the app runs the core itself (macOS/Linux). The file written last wins,
// so a leftover of the other mode never hides the live log.
func coreLogPathForProfile(profileID string) (string, error) {
	root, err := slothDataRoot()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(root, "runtime", profileID)
	return newestFile(filepath.Join(dir, "logs", "service_latest.log"), filepath.Join(dir, "core.log")), nil
}

// newestFile returns the most recently modified of paths, or the first when
// none exists.
func newestFile(paths ...string) string {
	best, bestMod := paths[0], time.Time{}
	for _, p := range paths {
		if st, err := os.Stat(p); err == nil && st.ModTime().After(bestMod) {
			best, bestMod = p, st.ModTime()
		}
	}
	return best
}

// coreLogMark is where the core log stood before a start or reload, so a
// verdict reads only what that start or reload wrote: a failure line from an
// earlier attempt of the same core must not fail this one.
type coreLogMark struct {
	path   string
	offset int64
}

func markCoreLog(profileID string) coreLogMark {
	path, err := coreLogPathForProfile(profileID)
	if err != nil {
		return coreLogMark{}
	}
	m := coreLogMark{path: path}
	if st, err := os.Stat(path); err == nil {
		m.offset = st.Size()
	}
	return m
}

// text returns up to the last maxBytes the core logged after the mark: the
// whole current log when it rotated or the core switched log files since.
func (m coreLogMark) text(profileID string, maxBytes int64) string {
	path, err := coreLogPathForProfile(profileID)
	if err != nil {
		return ""
	}
	offset := m.offset
	if path != m.path {
		offset = 0
	}
	return currentBootLog(readFileFrom(path, offset, maxBytes))
}

// readFileFrom returns up to the last maxBytes of path after offset (from the
// start when the file is now shorter than offset: it was rotated).
func readFileFrom(path string, offset, maxBytes int64) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return ""
	}
	size := st.Size()
	if offset > size {
		offset = 0
	}
	if size-offset > maxBytes {
		offset = size - maxBytes
	}
	if _, err := f.Seek(offset, 0); err != nil {
		return ""
	}
	b, err := io_ReadAllLimited(f, size-offset)
	if err != nil {
		return ""
	}
	return string(b)
}

// readFileTail returns up to the last maxBytes of a file (or the whole file if
// smaller). Missing file => empty string, no error, so callers can poll a log
// that has not been created yet.
func readFileTail(path string, maxBytes int64) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return ""
	}
	size := st.Size()
	if size > maxBytes {
		if _, err := f.Seek(size-maxBytes, 0); err != nil {
			return ""
		}
	}
	b, err := io_ReadAllLimited(f, maxBytes)
	if err != nil {
		return ""
	}
	return string(b)
}

// io_ReadAllLimited reads up to limit bytes. Kept tiny to avoid importing io
// just for a bounded read with a known cap.
func io_ReadAllLimited(f *os.File, limit int64) ([]byte, error) {
	buf := make([]byte, limit)
	n, err := f.Read(buf)
	if err != nil && n == 0 {
		return nil, err
	}
	return buf[:n], nil
}

// tunVerifyBudget is how long a TUN bring-up may take before it counts as
// failed. On Windows the core retries a stalled wintun create three times, and
// Wintun waits 15 s for each new adapter (Citrus listener/sing_tun/
// server_windows.go), so the failure line can come ~45 s after the core API
// answers; the adapter itself, up, proves success much sooner. Elsewhere a
// failure is logged at once, so a short grace without one means up.
func tunVerifyBudget() time.Duration {
	if runtime.GOOS == "windows" {
		return 50 * time.Second
	}
	return 1200 * time.Millisecond
}

// verifyTunBringUp decides whether the TUN adapter came up after the start or
// reload that mark was taken before. A failure line logged since the mark
// fails it; the success line (Info, so mostly filtered out by the warning log
// level) or, on Windows, the adapter being up passes it. On Windows silence for
// the whole budget is a failure: a missing adapter must never pass as up.
func verifyTunBringUp(profileID string, mark coreLogMark, budget time.Duration) tunVerifyResult {
	// Test hook: there is no way to reproduce a real wintun failure on a healthy
	// machine, so allow forcing the failure path to validate verify -> retry ->
	// truthful-failure -> diagnostics end-to-end. Off unless explicitly set.
	if os.Getenv("SLOTH_TUN_FORCE_FAIL") == "1" {
		return tunVerifyFailed
	}
	windows := runtime.GOOS == "windows"
	deadline := time.Now().Add(budget)
	for {
		switch scanTunBringUpLog(mark.text(profileID, 64*1024)) {
		case tunVerifyUp:
			return tunVerifyUp
		case tunVerifyFailed:
			return tunVerifyFailed
		}
		if windows && tunAdapterLive() {
			return tunVerifyUp
		}
		if time.Now().After(deadline) {
			if windows {
				return tunVerifyFailed
			}
			return tunVerifyUp
		}
		time.Sleep(200 * time.Millisecond)
	}
}

// tunDeviceName is the Windows TUN adapter the core creates: the user's TUN
// device setting, else the name Kabosu forces.
func tunDeviceName() string {
	return killSwitchTunInterface("tun", currentDesktopPrefs())
}

// tunAdapterLive reports whether the core's TUN adapter is there and up. On
// Windows it checks our adapter by name: one left behind by a killed core has
// no session and is down, so it does not count. Elsewhere it falls back to the
// name fragments of osHasTunAdapter.
func tunAdapterLive() bool {
	if runtime.GOOS != "windows" {
		return osHasTunAdapter()
	}
	ifi, err := net.InterfaceByName(tunDeviceName())
	return err == nil && ifi.Flags&net.FlagUp != 0
}

// osHasTunAdapter is a best-effort cross-check: is a Mihomo TUN adapter present
// in the OS interface list? On Windows we now name the wintun adapter
// "Kabosu" (see tunWindowsDeviceName); older builds and macOS/Linux use the
// defaults ("Meta", utun/tun). All are covered by the name fragments below.
func osHasTunAdapter() bool {
	ifaces, err := net.Interfaces()
	if err != nil {
		return false
	}
	for _, ifi := range ifaces {
		name := strings.ToLower(ifi.Name)
		if strings.Contains(name, "meta") ||
			strings.Contains(name, "mihomo") ||
			strings.Contains(name, "sloth") ||
			strings.HasPrefix(name, "utun") ||
			strings.HasPrefix(name, "tun") {
			return true
		}
	}
	return false
}

// ensureTunUpWithRetry verifies the TUN adapter actually came up after the core
// started/reloaded and, on failure, recovers via a FULL core restart — which
// re-enters the reliable cold-start path (tun.enable baked into the initial
// YAML) instead of re-poking the fragile live reload. This mirrors
// clash-verge-rev's reload-fails -> restart_core fallback (which we lacked) and
// is exactly what users do by hand ("toggle off/on fixes it"). Bounded by a
// small attempt cap with backoff; every step is guarded on connectGen so a
// superseded/stale connect never triggers a restart. mark is the core log
// position before the start or reload being verified. Returns nil when the
// adapter is up, errConnectAborted if superseded, or a classified error when
// the adapter could not be brought up within the budget.
func (a *App) ensureTunUpWithRetry(profile Profile, gen uint64, mark coreLogMark) error {
	const (
		maxRestarts = 2
		backoff     = time.Second
	)
	if a.connectGen.Load() != gen {
		return errConnectAborted
	}
	if verifyTunBringUp(profile.ID, mark, tunVerifyBudget()) == tunVerifyUp {
		return nil
	}
	// Windows core recovery: a wintun adapter left registered by a force-killed
	// core (in-app update, crash, Task-Manager) makes the next create fail with
	// "access is denied", and a plain core restart just re-hits the same corpse —
	// which is exactly why reinstalling the service and rebooting did NOT help a
	// real user. Before restarting, ask the SYSTEM service to remove that stale
	// adapter of ours so the restart below creates a fresh one. Targeted at the
	// access-denied signature only, best-effort, and a no-op off Windows.
	recovery := a.maybeRecoverStuckTunAdapter(profile.ID, gen, mark)
	for attempt := 1; attempt <= maxRestarts; attempt++ {
		if a.connectGen.Load() != gen {
			return errConnectAborted
		}
		a.appendRuntimeDiag("tun.verify", fmt.Sprintf("bring-up not confirmed; core restart attempt %d/%d", attempt, maxRestarts))
		a.traceEvent("pipeline.connect.tun_restart", "start", 0, map[string]any{"gen": gen, "attempt": attempt})
		mark = markCoreLog(profile.ID)
		err := a.forceRestartCoreForProfile(profile, gen, true)
		if errors.Is(err, errConnectAborted) {
			return err
		}
		if a.connectGen.Load() != gen {
			return errConnectAborted
		}
		if err != nil {
			a.traceEvent("pipeline.connect.tun_restart", "fail", 0, map[string]any{"gen": gen, "attempt": attempt, "error": err.Error()})
		} else if verifyTunBringUp(profile.ID, mark, tunVerifyBudget()) == tunVerifyUp {
			a.traceEvent("pipeline.connect.tun_restart", "ok", 0, map[string]any{"gen": gen, "attempt": attempt})
			return nil
		}
		time.Sleep(backoff)
	}
	hint := classifyTunFailure(mark.text(profile.ID, 64*1024), recovery)
	a.traceEvent("pipeline.connect.tun_verify", "fail", 0, map[string]any{"gen": gen, "hint": hint})
	return errors.New(hint)
}

// tunRecoverOutcome records what the stale-adapter recovery attempt actually did,
// so the final failure hint can be honest about it instead of always claiming the
// service was asked to remove the adapter (it may be too old to have the endpoint).
type tunRecoverOutcome int

const (
	tunRecoverNotAttempted    tunRecoverOutcome = iota // not Windows, or no access-denied signature
	tunRecoverRemoved                                  // service accepted the removal (0+ adapters cleared)
	tunRecoverServiceOutdated                          // service too old — no /tun/remove endpoint (404)
	tunRecoverFailed                                   // removal attempted but errored otherwise
)

// tunRemoveScopedServiceVersion is the first service whose /tun/remove only
// takes the adapters it is named, and only when they are down. Older services
// remove every wintun adapter on the machine (WireGuard, Tailscale, O+Connect's
// vgate0), so the app never asks them.
const tunRemoveScopedServiceVersion = "2.7.0"

// maybeRecoverStuckTunAdapter asks the privileged service to remove our own
// stale wintun adapter when the log since mark shows the "access is denied"
// signature — the fingerprint of a registered adapter left behind by a
// force-killed core that a plain restart cannot clear. Only the adapter named
// like ours and not up goes; never another app's adapter, never the driver.
// Windows-only and best-effort: any failure is logged into the connect
// diagnostics and the caller proceeds to its restart attempts regardless.
// Returns the outcome so the caller can tailor a truthful failure message: a
// service too old for the scoped removal needs a one-time update, not another
// reconnect.
func (a *App) maybeRecoverStuckTunAdapter(profileID string, gen uint64, mark coreLogMark) tunRecoverOutcome {
	if runtime.GOOS != "windows" {
		return tunRecoverNotAttempted
	}
	if !strings.Contains(strings.ToLower(mark.text(profileID, 64*1024)), "access is denied") {
		return tunRecoverNotAttempted
	}
	vctx, vcancel := context.WithTimeout(context.Background(), 3*time.Second)
	version, verr := ipcSlothServiceVersion(vctx)
	vcancel()
	if verr != nil || compareServiceVersions(version, tunRemoveScopedServiceVersion) < 0 {
		a.appendRuntimeDiag("tun.recover", "stale wintun adapter suspected (access denied); the service is too old to remove only ours, so it is left alone")
		a.traceEvent("pipeline.connect.tun_recover", "outdated", 0, map[string]any{"gen": gen, "version": version})
		return tunRecoverServiceOutdated
	}
	a.appendRuntimeDiag("tun.recover", "stale wintun adapter suspected (access denied) — asking the service to remove ours")
	a.traceEvent("pipeline.connect.tun_recover", "start", 0, map[string]any{"gen": gen})

	// The service runs a PnP pass that can take several seconds; give it room.
	ctx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
	defer cancel()
	removed, err := ipcSlothRemoveTun(ctx, []string{tunDeviceName()})
	if err != nil {
		// An old service (< 2.4.2) has no /tun/remove route and answers 404. That
		// is a distinct, actionable state ("update the helper service"), not a
		// generic failure — surface it so the hint can say so instead of promising
		// a removal that never happened.
		if strings.Contains(err.Error(), "404") {
			a.appendRuntimeDiag("tun.recover", "helper service is outdated (no /tun/remove) — a one-time service update is needed to clear the stale adapter")
			a.traceEvent("pipeline.connect.tun_recover", "outdated", 0, map[string]any{"gen": gen, "error": err.Error()})
			return tunRecoverServiceOutdated
		}
		a.appendRuntimeDiag("tun.recover", "adapter removal via service failed: "+err.Error())
		a.traceEvent("pipeline.connect.tun_recover", "fail", 0, map[string]any{"gen": gen, "error": err.Error()})
		return tunRecoverFailed
	}
	a.appendRuntimeDiag("tun.recover", fmt.Sprintf("service removed %d stale wintun adapter(s)", removed))
	a.traceEvent("pipeline.connect.tun_recover", "ok", 0, map[string]any{"gen": gen, "removed": removed})
	return tunRecoverRemoved
}

// classifyTunFailure maps a core.log failure tail to a human-readable hint so
// the UI can tell the user the likely cause instead of a false "connected". The
// recovery outcome tailors the access-denied hint so it never promises a removal
// that didn't happen (e.g. when the helper service is too old to have the
// /tun/remove endpoint).
func classifyTunFailure(logTail string, recovery tunRecoverOutcome) string {
	l := strings.ToLower(logTail)
	switch {
	case strings.Contains(l, "operation not permitted"):
		return "The TUN adapter couldn't be created (operation not permitted) — usually a previous tunnel is still releasing. Click Connect again; it typically succeeds on the next try. If it keeps failing, another VPN or network filter (e.g. Cisco AnyConnect) may be blocking it — disable it or reinstall the Kabosu service. You can also use Proxy mode."
	case strings.Contains(l, "access is denied"):
		switch recovery {
		case tunRecoverServiceOutdated:
			return "The TUN adapter couldn't be created (access denied) — a leftover network adapter from a previous session is blocking it, and your helper service is too old to clear it. Use the \"Update service\" banner to update the Kabosu helper (it needs administrator approval), then click Connect again. Use Proxy mode in the meantime."
		case tunRecoverFailed:
			return "The TUN adapter couldn't be created (access denied) — a leftover network adapter from a previous session is blocking it, and automatic removal didn't go through. Reinstall the Kabosu service, or use Proxy mode, then try again."
		default:
			// tunRecoverRemoved / tunRecoverNotAttempted: the service accepted the
			// removal (or none was needed), so the next connect should succeed.
			return "The TUN adapter couldn't be created (access denied) — a leftover network adapter from a previous session was blocking it. Kabosu asked the service to remove it; click Connect again and it should succeed. If it still fails, reinstall the service or use Proxy mode."
		}
	case strings.Contains(l, "already exists"), strings.Contains(l, "in use"):
		return "The TUN adapter is already in use. Another Clash/wintun client may be holding it — close it (e.g. clash-verge, v2rayN) and try again."
	case strings.Contains(l, "wintun"):
		return "The wintun driver could not be loaded. Antivirus may have quarantined it — allow Kabosu in your antivirus and try again."
	default:
		return "The TUN adapter could not be brought up. Try reconnecting; if it keeps failing, switch to Proxy mode and copy diagnostics so we can investigate."
	}
}

// knownThirdPartyNetFilters are name fragments of VPN/filter adapters or drivers
// that commonly conflict with TUN bring-up (best-effort detection).
var knownThirdPartyNetFilters = []string{
	"anyconnect", "cisco", "openvpn", "wireguard", "nordlynx", "nord",
	"expressvpn", "tap-windows", "tap0901", "zerotier", "tailscale",
	"hamachi", "pangp", "globalprotect", "forticlient", "checkpoint",
}

// CopyTunDiagnostics returns a copyable TUN diagnostics bundle for the user to
// share when reporting an adapter bring-up problem. Wails binding consumed by
// the frontend "Copy diagnostics" action.
func (a *App) CopyTunDiagnostics() string {
	return a.collectTunDiagnostics()
}

// collectTunDiagnostics builds a copyable diagnostics bundle for TUN bring-up
// problems: OS, service state, recent core.log tail, OS adapter list, and any
// detected third-party VPN/filter adapters. We are otherwise blind to failures
// on user machines.
func (a *App) collectTunDiagnostics() string {
	var b strings.Builder
	fmt.Fprintf(&b, "Kabosu TUN diagnostics\n")
	fmt.Fprintf(&b, "version: %s\n", AppVersion)
	fmt.Fprintf(&b, "os: %s/%s\n", runtime.GOOS, runtime.GOARCH)

	a.mu.RLock()
	svcInstalled := a.state.Service.Installed
	svcRunning := a.state.Service.Running
	traffic := strings.TrimSpace(a.state.Traffic)
	connStatus := strings.TrimSpace(a.state.Connection.Status)
	connErr := strings.TrimSpace(a.state.Connection.LastError)
	activeID := strings.TrimSpace(a.state.Profile.ActiveProfileID)
	a.mu.RUnlock()

	fmt.Fprintf(&b, "service: installed=%t running=%t\n", svcInstalled, svcRunning)
	fmt.Fprintf(&b, "traffic-mode: %s\n", traffic)
	fmt.Fprintf(&b, "connection: status=%s lastError=%q\n", connStatus, connErr)

	// OS adapters + flagged third-party filters.
	var flagged []string
	if ifaces, err := net.Interfaces(); err == nil {
		fmt.Fprintf(&b, "adapters:\n")
		for _, ifi := range ifaces {
			up := ifi.Flags&net.FlagUp != 0
			fmt.Fprintf(&b, "  - %s (up=%t)\n", ifi.Name, up)
			low := strings.ToLower(ifi.Name)
			for _, f := range knownThirdPartyNetFilters {
				if strings.Contains(low, f) {
					flagged = append(flagged, ifi.Name)
					break
				}
			}
		}
	} else {
		fmt.Fprintf(&b, "adapters: <error: %v>\n", err)
	}
	fmt.Fprintf(&b, "tun-adapter-present: %t\n", osHasTunAdapter())
	fmt.Fprintf(&b, "tun-adapter-live: %t\n", tunAdapterLive())
	if len(flagged) > 0 {
		fmt.Fprintf(&b, "third-party-vpn/filter-adapters: %s\n", strings.Join(flagged, ", "))
	} else {
		fmt.Fprintf(&b, "third-party-vpn/filter-adapters: none detected\n")
	}

	// Recent core.log tail.
	if activeID != "" {
		if logPath, err := coreLogPathForProfile(activeID); err == nil {
			tail := readFileTail(logPath, 8*1024)
			if strings.TrimSpace(tail) != "" {
				fmt.Fprintf(&b, "core.log (tail):\n%s\n", strings.TrimRight(tail, "\n"))
			} else {
				fmt.Fprintf(&b, "core.log (tail): <empty or missing>\n")
			}
		}
	} else {
		fmt.Fprintf(&b, "core.log (tail): <no active profile>\n")
	}
	return b.String()
}

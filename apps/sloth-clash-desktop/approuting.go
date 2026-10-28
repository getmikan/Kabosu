package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"runtime"
	"slices"
	"strings"

	wailsrt "github.com/wailsapp/wails/v2/pkg/runtime"
	"github.com/zalando/go-keyring"
)

// Per-app routing: the user's own SOCKS5/HTTP proxies and one route per
// application (one of those proxies, a subscription server or group, DIRECT
// or REJECT). The proxies join the runtime config's `proxies:`, the routes
// become PROCESS-PATH / PROCESS-NAME rules in front of the subscription's
// rules (applyAppRoutingOverlay). A route to a proxy that is down stays
// blocked on purpose: the rule has no fallback, and the app reports the
// proxy as down instead (approuting_health.go).

// AppRoutingSettings is the per-app routing section of prefs.json.
type AppRoutingSettings struct {
	Proxies []CustomProxy `json:"proxies,omitempty"`
	Routes  []AppRoute    `json:"routes,omitempty"`
}

// CustomProxy is one of the user's own proxies. Its password is not stored
// here but in the OS keychain under the proxy's ID (proxySecrets).
type CustomProxy struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"` // socks5 | http
	Server   string `json:"server"`
	Port     int    `json:"port"`
	Username string `json:"username,omitempty"`
	// ViaVPN dials the proxy through the main VPN group (mihomo
	// dialer-proxy), so the network only ever sees VPN traffic.
	// nil OR true → on (default); false → straight to the proxy.
	ViaVPN *bool `json:"viaVpn,omitempty"`
}

// IsViaVPN reports whether the proxy is reached through the VPN.
func (p CustomProxy) IsViaVPN() bool {
	return p.ViaVPN == nil || *p.ViaVPN
}

// AppRoute sends one application's traffic to Target.
type AppRoute struct {
	ID string `json:"id"`
	// Process is a full executable path or a bare process name.
	Process string `json:"process"`
	// Target is "proxy:<custom proxy id>", "server:<subscription proxy or
	// group name>", "direct" or "reject".
	Target string `json:"target"`
}

const (
	appRouteDirect       = "direct"
	appRouteReject       = "reject"
	appRouteProxyPrefix  = "proxy:"
	appRouteServerPrefix = "server:"

	// customProxyNamePrefix keeps the user's proxies apart from subscription
	// nodes of the same name in the runtime config.
	customProxyNamePrefix = "👤 "
)

var errAppRoutingInvalid = errors.New("invalid per-app routing entry")

func newAppRoutingID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// cleanRuleField drops what would break a mihomo rule line: the rule parser
// splits on commas.
func cleanRuleField(v string) string {
	return strings.TrimSpace(strings.ReplaceAll(v, ",", " "))
}

// normalizeCustomProxy validates a proxy coming from the UI.
func normalizeCustomProxy(p CustomProxy) (CustomProxy, error) {
	p.Name = cleanRuleField(p.Name)
	p.Type = strings.ToLower(strings.TrimSpace(p.Type))
	p.Server = strings.TrimSpace(p.Server)
	p.Username = strings.TrimSpace(p.Username)
	if strings.HasPrefix(p.Server, "[") && strings.HasSuffix(p.Server, "]") {
		p.Server = strings.TrimSuffix(strings.TrimPrefix(p.Server, "["), "]")
	}
	switch {
	case p.Name == "":
		return p, fmt.Errorf("%w: the proxy needs a name", errAppRoutingInvalid)
	case p.Type != "socks5" && p.Type != "http":
		return p, fmt.Errorf("%w: proxy type must be socks5 or http", errAppRoutingInvalid)
	case p.Server == "" || strings.ContainsAny(p.Server, " /@:") && net.ParseIP(p.Server) == nil:
		return p, fmt.Errorf("%w: bad proxy server %q", errAppRoutingInvalid, p.Server)
	case p.Port < 1 || p.Port > 65535:
		return p, fmt.Errorf("%w: proxy port must be 1-65535", errAppRoutingInvalid)
	}
	if p.ID == "" {
		p.ID = newAppRoutingID()
	}
	return p, nil
}

// normalizeAppRoute validates a route coming from the UI against the
// current proxies.
func normalizeAppRoute(r AppRoute, proxies []CustomProxy) (AppRoute, error) {
	r.Process = strings.TrimSpace(r.Process)
	r.Target = strings.TrimSpace(r.Target)
	if r.Process == "" || strings.Contains(r.Process, ",") {
		return r, fmt.Errorf("%w: pick an application", errAppRoutingInvalid)
	}
	switch {
	case r.Target == appRouteDirect, r.Target == appRouteReject:
	case strings.HasPrefix(r.Target, appRouteProxyPrefix):
		if _, ok := findCustomProxy(proxies, strings.TrimPrefix(r.Target, appRouteProxyPrefix)); !ok {
			return r, fmt.Errorf("%w: that proxy no longer exists", errAppRoutingInvalid)
		}
	case strings.HasPrefix(r.Target, appRouteServerPrefix):
		name := strings.TrimPrefix(r.Target, appRouteServerPrefix)
		if strings.TrimSpace(name) == "" || strings.Contains(name, ",") {
			return r, fmt.Errorf("%w: pick a server", errAppRoutingInvalid)
		}
	default:
		return r, fmt.Errorf("%w: unknown route %q", errAppRoutingInvalid, r.Target)
	}
	if r.ID == "" {
		r.ID = newAppRoutingID()
	}
	return r, nil
}

func findCustomProxy(proxies []CustomProxy, id string) (CustomProxy, bool) {
	for _, p := range proxies {
		if p.ID == id {
			return p, true
		}
	}
	return CustomProxy{}, false
}

// customProxyConfigName is the proxy's name in the runtime config.
func customProxyConfigName(p CustomProxy) string {
	return customProxyNamePrefix + p.Name
}

// GetAppRouting is the Wails getter for the Apps screen.
func (a *App) GetAppRouting() AppRoutingSettings {
	_ = a
	return currentDesktopPrefs().AppRouting
}

// SaveCustomProxy adds or updates one of the user's proxies. A non-empty
// password replaces the stored one, an empty one keeps it; a proxy without a
// username has none.
func (a *App) SaveCustomProxy(p CustomProxy, password string) (AppRoutingSettings, error) {
	current := currentDesktopPrefs().AppRouting
	p, err := normalizeCustomProxy(p)
	if err != nil {
		return current, err
	}
	for _, other := range current.Proxies {
		if other.ID != p.ID && other.Name == p.Name {
			return current, fmt.Errorf("%w: a proxy named %q already exists", errAppRoutingInvalid, p.Name)
		}
	}
	switch {
	case p.Username == "":
		err = appRoutingSecrets.Delete(p.ID)
	case password != "":
		err = appRoutingSecrets.Set(p.ID, password)
	}
	if err != nil {
		return current, fmt.Errorf("system keychain: %w", err)
	}
	return a.updateAppRouting(func(s *AppRoutingSettings) {
		for i := range s.Proxies {
			if s.Proxies[i].ID == p.ID {
				s.Proxies[i] = p
				return
			}
		}
		s.Proxies = append(s.Proxies, p)
	})
}

// DeleteCustomProxy removes a proxy and the routes that use it.
func (a *App) DeleteCustomProxy(id string) (AppRoutingSettings, error) {
	if err := appRoutingSecrets.Delete(id); err != nil {
		return currentDesktopPrefs().AppRouting, fmt.Errorf("system keychain: %w", err)
	}
	return a.updateAppRouting(func(s *AppRoutingSettings) {
		s.Proxies = slices.DeleteFunc(s.Proxies, func(p CustomProxy) bool { return p.ID == id })
		s.Routes = slices.DeleteFunc(s.Routes, func(r AppRoute) bool { return r.Target == appRouteProxyPrefix+id })
	})
}

// SaveAppRoute adds or updates a route. An application has one route: a new
// route for an application that already has one replaces it in place.
func (a *App) SaveAppRoute(r AppRoute) (AppRoutingSettings, error) {
	current := currentDesktopPrefs().AppRouting
	r, err := normalizeAppRoute(r, current.Proxies)
	if err != nil {
		return current, err
	}
	return a.updateAppRouting(func(s *AppRoutingSettings) {
		for i := range s.Routes {
			if s.Routes[i].ID == r.ID || strings.EqualFold(s.Routes[i].Process, r.Process) {
				s.Routes[i] = r
				s.Routes = slices.DeleteFunc(s.Routes, func(o AppRoute) bool {
					return o.ID != r.ID && strings.EqualFold(o.Process, r.Process)
				})
				return
			}
		}
		s.Routes = append(s.Routes, r)
	})
}

// DeleteAppRoute removes a route; the application follows the profile's
// rules again.
func (a *App) DeleteAppRoute(id string) (AppRoutingSettings, error) {
	return a.updateAppRouting(func(s *AppRoutingSettings) {
		s.Routes = slices.DeleteFunc(s.Routes, func(r AppRoute) bool { return r.ID == id })
	})
}

// updateAppRouting saves an edit of the routing prefs and re-applies the
// config to a connected core, closing open connections so the routes take
// effect on live traffic, not only on new connections.
func (a *App) updateAppRouting(edit func(*AppRoutingSettings)) (AppRoutingSettings, error) {
	prefsMu.Lock()
	next := AppRoutingSettings{
		Proxies: slices.Clone(prefsCurrent.AppRouting.Proxies),
		Routes:  slices.Clone(prefsCurrent.AppRouting.Routes),
	}
	edit(&next)
	prefsCurrent.AppRouting = next
	err := saveDesktopPrefsLocked(prefsCurrent)
	prefsMu.Unlock()
	if err != nil {
		return next, err
	}

	a.mu.RLock()
	connected := a.state.Connection.Status == ConnConnected && a.state.Profile.ActiveProfileID != ""
	a.mu.RUnlock()
	if connected {
		a.reconnectFlushConns.Store(true)
		go a.reconnectActiveProfile()
	}
	return next, nil
}

// RunningApp is a running executable the user can route.
type RunningApp struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// ListRunningApps lists the executables of the running processes, without
// system ones and without Kabosu itself.
func (a *App) ListRunningApps() ([]RunningApp, error) {
	_ = a
	return runningApps()
}

// PickAppExecutable opens the system file dialog for an application binary;
// "" when the user cancels.
func (a *App) PickAppExecutable(title string) (string, error) {
	opts := wailsrt.OpenDialogOptions{Title: title}
	if runtime.GOOS == "windows" {
		opts.Filters = []wailsrt.FileFilter{{DisplayName: "*.exe", Pattern: "*.exe"}}
	}
	return wailsrt.OpenFileDialog(a.ctx, opts)
}

// appRoutingSecrets is where the proxy passwords live; tests swap it.
var appRoutingSecrets proxySecrets = keyringProxySecrets{}

// proxySecrets keeps the user's proxy passwords out of prefs.json and logs.
type proxySecrets interface {
	Get(proxyID string) (string, error)
	Set(proxyID, password string) error
	Delete(proxyID string) error
}

const proxySecretsService = "SlothClash.proxies"

// keyringProxySecrets stores passwords in the OS keychain (Windows
// Credential Manager / macOS Keychain / Linux Secret Service).
type keyringProxySecrets struct{}

func (keyringProxySecrets) Get(proxyID string) (string, error) {
	pw, err := keyring.Get(proxySecretsService, proxyID)
	if errors.Is(err, keyring.ErrNotFound) {
		return "", nil
	}
	return pw, err
}

func (keyringProxySecrets) Set(proxyID, password string) error {
	return keyring.Set(proxySecretsService, proxyID, password)
}

func (keyringProxySecrets) Delete(proxyID string) error {
	err := keyring.Delete(proxySecretsService, proxyID)
	if errors.Is(err, keyring.ErrNotFound) {
		return nil
	}
	return err
}

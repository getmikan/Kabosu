package main

import (
	"path/filepath"
	"reflect"
	"slices"
	"strings"
)

// AppRoutingState mirrors per-app routing problems for the UI.
type AppRoutingState struct {
	// Issues: what the last generated config could not honour.
	Issues []AppRoutingIssue `json:"issues,omitempty"`
	// Down: the user's proxies that failed their last check. Their
	// applications stay blocked: a route has no fallback.
	Down []AppRoutingProxyDown `json:"down,omitempty"`
}

// AppRoutingProxyDown is a proxy that failed its check, with the
// applications it blocks.
type AppRoutingProxyDown struct {
	ID    string   `json:"id"`
	Name  string   `json:"name"`
	Error string   `json:"error"`
	Apps  []string `json:"apps"`
}

// syncAppRoutingIssues publishes what the last config write reported.
func (a *App) syncAppRoutingIssues() {
	issues := currentAppRoutingIssues()
	a.mu.Lock()
	changed := !slices.Equal(a.state.AppRouting.Issues, issues)
	a.state.AppRouting.Issues = issues
	a.mu.Unlock()
	if changed {
		a.emitAppStateChanged()
	}
}

// CheckCustomProxies tests the user's proxies that routes use; runs on the
// runtime supervisor tick and from the Apps screen.
func (a *App) CheckCustomProxies() AppRoutingState {
	a.mu.RLock()
	connected := a.state.Connection.Status == ConnConnected
	a.mu.RUnlock()

	var down []AppRoutingProxyDown
	if connected {
		settings := currentDesktopPrefs().AppRouting
		for _, p := range settings.Proxies {
			apps := appsRoutedTo(settings.Routes, p.ID)
			if len(apps) == 0 {
				continue
			}
			if _, err := a.TestProxyDelay(customProxyConfigName(p)); err != nil {
				down = append(down, AppRoutingProxyDown{ID: p.ID, Name: p.Name, Error: strings.TrimSpace(err.Error()), Apps: apps})
			}
		}
	}

	a.mu.Lock()
	changed := !reflect.DeepEqual(a.state.AppRouting.Down, down)
	a.state.AppRouting.Down = down
	state := a.state.AppRouting
	a.mu.Unlock()
	if changed {
		a.emitAppStateChanged()
	}
	return state
}

// appsRoutedTo names the applications whose route is the given proxy.
func appsRoutedTo(routes []AppRoute, proxyID string) []string {
	var apps []string
	for _, r := range routes {
		if r.Target == appRouteProxyPrefix+proxyID {
			apps = append(apps, filepath.Base(strings.ReplaceAll(r.Process, `\`, "/")))
		}
	}
	return apps
}

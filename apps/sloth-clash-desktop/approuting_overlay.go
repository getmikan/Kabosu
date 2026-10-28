package main

import (
	"strings"
	"sync"
)

// appRoutingMarkerKey lists the rules the overlay added, so the next run can
// take exactly those out: SkipAutoConfig profiles feed their own output back
// into the pipeline. The core ignores unknown top-level keys.
const appRoutingMarkerKey = "x-sloth-app-routing"

// AppRoutingIssue is something the last generated config could not honour;
// the UI words it from Kind.
type AppRoutingIssue struct {
	// Kind: keychain | noVpnGroup (the proxy is unusable), proxyBlocked |
	// serverMissing (the app is blocked), processLookupOn (find-process-mode
	// was off and got turned on for the routes).
	Kind    string `json:"kind"`
	Proxy   string `json:"proxy,omitempty"`
	Process string `json:"process,omitempty"`
	Server  string `json:"server,omitempty"`
}

var (
	appRoutingIssuesMu sync.RWMutex
	appRoutingIssues   []AppRoutingIssue
)

func setAppRoutingIssues(issues []AppRoutingIssue) {
	appRoutingIssuesMu.Lock()
	appRoutingIssues = issues
	appRoutingIssuesMu.Unlock()
}

// currentAppRoutingIssues is what the last config write reported.
func currentAppRoutingIssues() []AppRoutingIssue {
	appRoutingIssuesMu.RLock()
	defer appRoutingIssuesMu.RUnlock()
	return appRoutingIssues
}

// applyAppRoutingOverlay adds the user's proxies to `proxies:` and one
// PROCESS-PATH / PROCESS-NAME rule per route in front of every other rule, so
// the routes win over the subscription, the templates and the profile script.
//
// A route that cannot be honoured (its proxy's password is unreadable, "via
// VPN" has no VPN group to go through, its server is not in this profile)
// becomes REJECT plus an issue: the app stays blocked instead of slipping out
// some other way.
func applyAppRoutingOverlay(m map[string]any, settings AppRoutingSettings, secrets proxySecrets) []AppRoutingIssue {
	removePreviousAppRouting(m)
	if len(settings.Proxies) == 0 && len(settings.Routes) == 0 {
		return nil
	}

	known := knownRulePolicies(m)
	vpnGroup := ruleMatchTarget(m)
	switch vpnGroup {
	case "DIRECT", "REJECT", "REJECT-DROP", "PASS":
		vpnGroup = ""
	}

	var issues []AppRoutingIssue
	usable := map[string]bool{}
	proxies, _ := m["proxies"].([]any)
	for _, p := range settings.Proxies {
		entry, issue := customProxyEntry(p, secrets, vpnGroup)
		if issue != "" {
			issues = append(issues, AppRoutingIssue{Kind: issue, Proxy: p.Name})
			continue
		}
		proxies = append(proxies, entry)
		usable[p.ID] = true
	}
	m["proxies"] = proxies

	added := make([]any, 0, len(settings.Routes))
	for _, r := range settings.Routes {
		target, issue := appRouteTarget(r, settings.Proxies, usable, known)
		if issue != nil {
			issues = append(issues, *issue)
		}
		added = append(added, appRouteRuleType(r.Process)+","+r.Process+","+target)
	}
	if len(added) > 0 {
		rules, _ := m["rules"].([]any)
		m["rules"] = append(append([]any{}, added...), rules...)
		m[appRoutingMarkerKey] = added
		// PROCESS rules never match with process lookup off.
		if mode, _ := m["find-process-mode"].(string); strings.EqualFold(mode, "off") {
			m["find-process-mode"] = "strict"
			issues = append(issues, AppRoutingIssue{Kind: "processLookupOn"})
		}
	}
	return issues
}

// removePreviousAppRouting takes out what an earlier run of the overlay put
// into this config.
func removePreviousAppRouting(m map[string]any) {
	if prev, ok := m[appRoutingMarkerKey].([]any); ok {
		drop := map[string]bool{}
		for _, r := range prev {
			if s, ok := r.(string); ok {
				drop[s] = true
			}
		}
		if rules, ok := m["rules"].([]any); ok {
			kept := make([]any, 0, len(rules))
			for _, r := range rules {
				if s, ok := r.(string); ok && drop[s] {
					continue
				}
				kept = append(kept, r)
			}
			m["rules"] = kept
		}
	}
	delete(m, appRoutingMarkerKey)
	if proxies, ok := m["proxies"].([]any); ok {
		kept := make([]any, 0, len(proxies))
		for _, p := range proxies {
			if pm, ok := p.(map[string]any); ok {
				if name, _ := pm["name"].(string); strings.HasPrefix(name, customProxyNamePrefix) {
					continue
				}
			}
			kept = append(kept, p)
		}
		m["proxies"] = kept
	}
}

// ruleMatchTarget is the policy of the final MATCH rule: where everything
// without a more specific rule goes, i.e. the VPN.
func ruleMatchTarget(m map[string]any) string {
	rules, _ := m["rules"].([]any)
	for i := len(rules) - 1; i >= 0; i-- {
		line, _ := rules[i].(string)
		head, _, _ := strings.Cut(strings.TrimSpace(line), ",")
		if h := strings.ToUpper(strings.TrimSpace(head)); h == "MATCH" || h == "FINAL" {
			return extractRulePolicyToken(line)
		}
	}
	return ""
}

// customProxyEntry is the proxy's `proxies:` entry, or the issue kind that
// makes it unusable.
func customProxyEntry(p CustomProxy, secrets proxySecrets, vpnGroup string) (map[string]any, string) {
	entry := map[string]any{
		"name":   customProxyConfigName(p),
		"type":   p.Type,
		"server": p.Server,
		"port":   p.Port,
	}
	if p.Type == "socks5" {
		entry["udp"] = true
	}
	if p.Username != "" {
		password, err := secrets.Get(p.ID)
		if err != nil {
			return nil, "keychain"
		}
		entry["username"] = p.Username
		entry["password"] = password
	}
	if p.IsViaVPN() {
		if vpnGroup == "" {
			return nil, "noVpnGroup"
		}
		entry["dialer-proxy"] = vpnGroup
	}
	return entry, ""
}

// appRouteTarget resolves a route to a rule policy, or to REJECT with the
// issue that blocks it.
func appRouteTarget(r AppRoute, proxies []CustomProxy, usable map[string]bool, known map[string]bool) (string, *AppRoutingIssue) {
	switch {
	case r.Target == appRouteDirect:
		return "DIRECT", nil
	case r.Target == appRouteReject:
		return "REJECT", nil
	case strings.HasPrefix(r.Target, appRouteServerPrefix):
		name := strings.TrimPrefix(r.Target, appRouteServerPrefix)
		if known[name] {
			return name, nil
		}
		return "REJECT", &AppRoutingIssue{Kind: "serverMissing", Process: r.Process, Server: name}
	}
	id := strings.TrimPrefix(r.Target, appRouteProxyPrefix)
	p, ok := findCustomProxy(proxies, id)
	if ok && usable[id] {
		return customProxyConfigName(p), nil
	}
	return "REJECT", &AppRoutingIssue{Kind: "proxyBlocked", Process: r.Process, Proxy: p.Name}
}

// appRouteRuleType matches a full executable path by path, a bare name by name.
func appRouteRuleType(process string) string {
	if strings.ContainsAny(process, `\/`) {
		return "PROCESS-PATH"
	}
	return "PROCESS-NAME"
}

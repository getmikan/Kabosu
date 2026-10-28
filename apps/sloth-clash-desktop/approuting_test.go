package main

import (
	"embed"
	"errors"
	"slices"
	"testing"
)

type fakeProxySecrets struct {
	m   map[string]string
	err error
}

func (f *fakeProxySecrets) Get(id string) (string, error) {
	if f.err != nil {
		return "", f.err
	}
	return f.m[id], nil
}

func (f *fakeProxySecrets) Set(id, password string) error {
	f.m[id] = password
	return nil
}

func (f *fakeProxySecrets) Delete(id string) error {
	delete(f.m, id)
	return nil
}

// appRoutingBase is a minimal profile: one node behind the VPN group.
func appRoutingBase() map[string]any {
	return map[string]any{
		"proxies": []any{map[string]any{"name": "NL", "type": "socks5", "server": "nl.example", "port": 443}},
		"proxy-groups": []any{
			map[string]any{"name": "🍊 Mikan", "type": "select", "proxies": []any{"NL"}},
		},
		"rules": []any{"PROCESS-NAME,steam.exe,DIRECT", "MATCH,🍊 Mikan"},
	}
}

func appRoutingSample() AppRoutingSettings {
	return AppRoutingSettings{
		Proxies: []CustomProxy{
			{ID: "p1", Name: "Work", Type: "socks5", Server: "10.0.0.2", Port: 1080, Username: "me"},
			{ID: "p2", Name: "Plain", Type: "http", Server: "proxy.example", Port: 8080, ViaVPN: boolPtr(false)},
		},
		Routes: []AppRoute{
			{ID: "r1", Process: `C:\Apps\Telegram.exe`, Target: "proxy:p1"},
			{ID: "r2", Process: "chrome.exe", Target: "server:NL"},
			{ID: "r3", Process: "steam.exe", Target: "reject"},
			{ID: "r4", Process: "game.exe", Target: "direct"},
			{ID: "r5", Process: "old.exe", Target: "server:Gone"},
		},
	}
}

func proxyByName(m map[string]any, name string) map[string]any {
	for _, p := range m["proxies"].([]any) {
		if pm := p.(map[string]any); pm["name"] == name {
			return pm
		}
	}
	return nil
}

func TestAppRoutingOverlayRoutesComeFirst(t *testing.T) {
	m := appRoutingBase()
	secrets := &fakeProxySecrets{m: map[string]string{"p1": "secret"}}
	issues := applyAppRoutingOverlay(m, appRoutingSample(), secrets)

	want := []any{
		`PROCESS-PATH,C:\Apps\Telegram.exe,👤 Work`,
		"PROCESS-NAME,chrome.exe,NL",
		"PROCESS-NAME,steam.exe,REJECT",
		"PROCESS-NAME,game.exe,DIRECT",
		"PROCESS-NAME,old.exe,REJECT",
		"PROCESS-NAME,steam.exe,DIRECT",
		"MATCH,🍊 Mikan",
	}
	if got := m["rules"].([]any); !slices.Equal(got, want) {
		t.Fatalf("rules:\n got %q\nwant %q", got, want)
	}
	if !slices.Equal(issues, []AppRoutingIssue{{Kind: "serverMissing", Process: "old.exe", Server: "Gone"}}) {
		t.Fatalf("issues: %+v", issues)
	}
	work := proxyByName(m, "👤 Work")
	if work == nil || work["dialer-proxy"] != "🍊 Mikan" || work["password"] != "secret" || work["udp"] != true {
		t.Fatalf("via-VPN socks5 proxy: %+v", work)
	}
	plain := proxyByName(m, "👤 Plain")
	if plain == nil || plain["dialer-proxy"] != nil || plain["username"] != nil || plain["udp"] != nil {
		t.Fatalf("direct http proxy: %+v", plain)
	}
	if err := validateRulePoliciesExist(m); err != nil {
		t.Fatalf("overlay produced an invalid config: %v", err)
	}
}

// SkipAutoConfig profiles run the pipeline over its own output: the overlay
// must replace, not pile up, and a removed route must leave nothing behind.
func TestAppRoutingOverlayIsIdempotent(t *testing.T) {
	m := appRoutingBase()
	secrets := &fakeProxySecrets{m: map[string]string{"p1": "secret"}}
	applyAppRoutingOverlay(m, appRoutingSample(), secrets)
	applyAppRoutingOverlay(m, appRoutingSample(), secrets)
	if n := len(m["rules"].([]any)); n != 7 {
		t.Fatalf("second run piled up rules: %d", n)
	}
	if n := len(m["proxies"].([]any)); n != 3 {
		t.Fatalf("second run piled up proxies: %d", n)
	}

	applyAppRoutingOverlay(m, AppRoutingSettings{}, secrets)
	base := appRoutingBase()
	if !slices.Equal(m["rules"].([]any), base["rules"].([]any)) || len(m["proxies"].([]any)) != 1 {
		t.Fatalf("cleared routing left traces: rules %q, proxies %v", m["rules"], m["proxies"])
	}
	if _, ok := m[appRoutingMarkerKey]; ok {
		t.Fatal("marker left behind")
	}
}

func TestAppRoutingOverlayFailsClosed(t *testing.T) {
	// No password readable: the proxy is left out, its app is blocked.
	m := appRoutingBase()
	m["find-process-mode"] = "off"
	issues := applyAppRoutingOverlay(m, appRoutingSample(), &fakeProxySecrets{err: errors.New("locked")})
	if proxyByName(m, "👤 Work") != nil || m["rules"].([]any)[0] != `PROCESS-PATH,C:\Apps\Telegram.exe,REJECT` {
		t.Fatalf("unreadable password must block the app: %q", m["rules"])
	}
	if !slices.Contains(issues, AppRoutingIssue{Kind: "keychain", Proxy: "Work"}) ||
		!slices.Contains(issues, AppRoutingIssue{Kind: "proxyBlocked", Process: `C:\Apps\Telegram.exe`, Proxy: "Work"}) {
		t.Fatalf("issues: %+v", issues)
	}
	if m["find-process-mode"] != "strict" || !slices.Contains(issues, AppRoutingIssue{Kind: "processLookupOn"}) {
		t.Fatalf("process lookup must be turned on for the routes: %v %+v", m["find-process-mode"], issues)
	}

	// "Via VPN" with no VPN group: blocked too, never dialled straight.
	m = appRoutingBase()
	m["rules"] = []any{"MATCH,DIRECT"}
	issues = applyAppRoutingOverlay(m, appRoutingSample(), &fakeProxySecrets{m: map[string]string{}})
	if proxyByName(m, "👤 Work") != nil || !slices.Contains(issues, AppRoutingIssue{Kind: "noVpnGroup", Proxy: "Work"}) {
		t.Fatalf("via-VPN proxy without a VPN group must be left out: %+v", issues)
	}
	if proxyByName(m, "👤 Plain") == nil {
		t.Fatal("a direct proxy needs no VPN group")
	}
}

func TestRuntimeSmokeAppRoutesWinOverProfileRules(t *testing.T) {
	prefsMu.Lock()
	prev := prefsCurrent
	prefsCurrent = DesktopPrefs{AppRouting: appRoutingSample()}
	prefsMu.Unlock()
	prevSecrets := appRoutingSecrets
	appRoutingSecrets = &fakeProxySecrets{m: map[string]string{"p1": "secret"}}
	t.Cleanup(func() {
		prefsMu.Lock()
		prefsCurrent = prev
		prefsMu.Unlock()
		appRoutingSecrets = prevSecrets
		setAppRoutingIssues(nil)
	})

	m := appRoutingBase()
	if err := finalizeRuntimeConfigPipeline(m, t.TempDir(), 7890, 9090, "secret", "tun", true, true); err != nil {
		t.Fatalf("pipeline rejected the routed config: %v", err)
	}
	if first := m["rules"].([]any)[0]; first != `PROCESS-PATH,C:\Apps\Telegram.exe,👤 Work` {
		t.Fatalf("routes must come first, got %q", first)
	}
	if issues := currentAppRoutingIssues(); len(issues) != 1 || issues[0].Kind != "serverMissing" {
		t.Fatalf("issues not published: %+v", issues)
	}
}

func TestAppRoutingSetters(t *testing.T) {
	prefsMu.Lock()
	prev := prefsCurrent
	prefsCurrent = DesktopPrefs{}
	prefsMu.Unlock()
	prevSecrets := appRoutingSecrets
	secrets := &fakeProxySecrets{m: map[string]string{}}
	appRoutingSecrets = secrets
	t.Cleanup(func() {
		prefsMu.Lock()
		prefsCurrent = prev
		prefsMu.Unlock()
		appRoutingSecrets = prevSecrets
	})

	var b embed.FS
	a := NewApp(b)
	s, err := a.SaveCustomProxy(CustomProxy{Name: "Work", Type: "socks5", Server: "10.0.0.2", Port: 1080, Username: "me"}, "pw")
	if err != nil || len(s.Proxies) != 1 {
		t.Fatalf("save proxy: %+v, %v", s, err)
	}
	id := s.Proxies[0].ID
	if secrets.m[id] != "pw" {
		t.Fatal("password must go to the keychain")
	}
	if _, err := a.SaveCustomProxy(CustomProxy{Name: "Work", Type: "http", Server: "h", Port: 1}, ""); !errors.Is(err, errAppRoutingInvalid) {
		t.Fatalf("duplicate name accepted: %v", err)
	}
	if s, _ = a.SaveCustomProxy(CustomProxy{ID: id, Name: "Work", Type: "socks5", Server: "10.0.0.2", Port: 1080, Username: "me"}, ""); secrets.m[id] != "pw" {
		t.Fatal("an empty password must keep the stored one")
	}

	s, _ = a.SaveAppRoute(AppRoute{Process: "telegram.exe", Target: "proxy:" + id})
	s, _ = a.SaveAppRoute(AppRoute{Process: "chrome.exe", Target: "direct"})
	s, err = a.SaveAppRoute(AppRoute{Process: "Telegram.exe", Target: "reject"})
	if err != nil || len(s.Routes) != 2 || s.Routes[0].Process != "Telegram.exe" || s.Routes[0].Target != "reject" {
		t.Fatalf("an app keeps one route, replaced in place: %+v, %v", s.Routes, err)
	}
	s, _ = a.SaveAppRoute(AppRoute{Process: "telegram.exe", Target: "proxy:" + id})

	s, err = a.DeleteCustomProxy(id)
	if err != nil || len(s.Proxies) != 0 || len(s.Routes) != 1 || s.Routes[0].Process != "chrome.exe" {
		t.Fatalf("deleting a proxy drops its routes: %+v, %v", s, err)
	}
	if _, ok := secrets.m[id]; ok {
		t.Fatal("deleting a proxy must drop its password")
	}
	if got := currentDesktopPrefs().AppRouting; !slices.Equal(got.Routes, s.Routes) {
		t.Fatalf("prefs not updated: %+v", got)
	}
}

func TestNormalizeCustomProxy(t *testing.T) {
	p, err := normalizeCustomProxy(CustomProxy{Name: " Work, SOCKS ", Type: "SOCKS5", Server: " 10.0.0.2 ", Port: 1080})
	if err != nil {
		t.Fatalf("valid proxy rejected: %v", err)
	}
	if p.Name != "Work  SOCKS" || p.Type != "socks5" || p.Server != "10.0.0.2" || p.ID == "" {
		t.Fatalf("not normalized: %+v", p)
	}
	if !p.IsViaVPN() {
		t.Fatal("a new proxy must go through the VPN by default")
	}
	if v6, err := normalizeCustomProxy(CustomProxy{Name: "v6", Type: "http", Server: "[2001:db8::1]", Port: 8080}); err != nil || v6.Server != "2001:db8::1" {
		t.Fatalf("IPv6 server: %+v, %v", v6, err)
	}

	for _, bad := range []CustomProxy{
		{Type: "socks5", Server: "h", Port: 1},
		{Name: "n", Type: "vless", Server: "h", Port: 1},
		{Name: "n", Type: "http", Server: "host:8080", Port: 1},
		{Name: "n", Type: "http", Server: "user@host", Port: 1},
		{Name: "n", Type: "http", Server: "h", Port: 0},
		{Name: "n", Type: "http", Server: "h", Port: 65536},
	} {
		if _, err := normalizeCustomProxy(bad); !errors.Is(err, errAppRoutingInvalid) {
			t.Errorf("accepted %+v", bad)
		}
	}
}

func TestNormalizeAppRoute(t *testing.T) {
	proxies := []CustomProxy{{ID: "p1", Name: "Work", Type: "socks5", Server: "h", Port: 1}}
	for _, target := range []string{"direct", "reject", "proxy:p1", "server:🍊 Mikan"} {
		r, err := normalizeAppRoute(AppRoute{Process: ` C:\Apps\Telegram.exe `, Target: target}, proxies)
		if err != nil {
			t.Fatalf("target %q rejected: %v", target, err)
		}
		if r.Process != `C:\Apps\Telegram.exe` || r.ID == "" {
			t.Fatalf("not normalized: %+v", r)
		}
	}
	for _, bad := range []AppRoute{
		{Process: "", Target: "direct"},
		{Process: "a,b.exe", Target: "direct"},
		{Process: "x.exe", Target: "proxy:gone"},
		{Process: "x.exe", Target: "server: "},
		{Process: "x.exe", Target: "server:a,b"},
		{Process: "x.exe", Target: "vpn"},
	} {
		if _, err := normalizeAppRoute(bad, proxies); !errors.Is(err, errAppRoutingInvalid) {
			t.Errorf("accepted %+v", bad)
		}
	}
}

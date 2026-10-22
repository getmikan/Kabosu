package main

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPanelAndroidHeadersAndPolicies(t *testing.T) {
	h := http.Header{}
	h.Set("X-Branding-Enabled", "true")
	h.Set("X-Brand-Name", "base64:"+base64.StdEncoding.EncodeToString([]byte("Кабосу")))
	h.Set("X-Brand-Show-Operator-Tab", "true")
	h.Set("X-Brand-PrimaryProxyGroup", "Main")
	h.Set("X-Brand-Lock-Config-Script", "true")
	h.Set("Share-Links", "true")
	h.Set("X-Network-Stack", "gvisor")
	h.Set("Profile-Web-Page-URL", "https://billing.example.test/me")
	h.Set("X-Profile-Update-Interval", "12")
	h.Set("X-Hwid-Max-Devices-Reached", "true")
	p := parseSubscriptionPanel("https://panel.example.test/sub", h)
	if p == nil || !p.ShareLinksLocked || p.NetworkStack != "gvisor" || p.UpdateIntervalMinutes != 720 || p.HwidMaxDevicesReached == nil || !*p.HwidMaxDevicesReached {
		t.Fatalf("metadata lost: %+v", p)
	}
	if p.Brand == nil || p.Brand.Name != "Кабосу" || !p.Brand.ShowOperatorTab || !p.Brand.LockConfigScript || p.Brand.PrimaryProxyGroup != "Main" {
		t.Fatalf("brand lost: %+v", p.Brand)
	}
	if parseSubscriptionPanel("http://panel.example.test/sub", h) != nil {
		t.Fatal("HTTP applied operator policies")
	}
}

func TestPanelLogoTrustBoundary(t *testing.T) {
	for _, raw := range []string{"http://cdn.example.test/logo.png", "https://127.0.0.1/logo", "https://[::1]/logo", "https://192.168.1.1/logo", "https://user:pass@cdn.example.test/logo", "file:///logo", "tg://resolve?domain=test"} {
		if got := brandCleanLogoURL(raw); got != "" {
			t.Errorf("unsafe logo %q accepted as %q", raw, got)
		}
	}
	if fetchBrandLogo("https://127.0.0.1/logo") != nil {
		t.Fatal("private logo downloaded")
	}
	for _, size := range []int{16, 2048} {
		var body bytes.Buffer
		if err := png.Encode(&body, image.NewRGBA(image.Rect(0, 0, size, size))); err != nil {
			t.Fatal(err)
		}
		if got := validBrandLogoImage(body.Bytes()); got != (size == 16) {
			t.Fatalf("logo size %d: accepted=%v", size, got)
		}
	}
	if validBrandLogoImage([]byte(`<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>`)) {
		t.Fatal("active SVG accepted")
	}
}

func TestPanelPolicyWithoutBrandAndDesktopPrecedence(t *testing.T) {
	h := http.Header{}
	h.Set("X-Brand-Hide-Global-Mode", "true")
	h.Set("X-Brand-Name", "Ignored")
	m := parseBrandManifest(h.Get)
	if m == nil || m.Enabled || !m.HideGlobalMode || m.Name != "" {
		t.Fatalf("ungated policy wrong: %+v", m)
	}
	h.Set("X-Branding-Enabled", "true")
	h.Set("X-Brand-Desktop-Enabled", "false")
	m = parseBrandManifest(h.Get)
	if m != nil && (m.Enabled || m.Name != "") {
		t.Fatal("desktop kill switch ignored")
	}
}

func TestPanelMikanGroupsValidation(t *testing.T) {
	h := http.Header{}
	h.Set("X-Mikan-Groups", `base64:`+base64.StdEncoding.EncodeToString([]byte(`{"v":1,"resets_at":1793491200,"groups":[{"id":3,"name":"Premium","mode":"own","used":3,"limit":10,"left":0,"state":"exhausted","proxies":["entry"]},{"id":4,"name":"new","mode":"future"}]}`)))
	p := parseSubscriptionPanel("https://panel.example.test/sub", h)
	if p == nil || p.Groups == nil || len(p.Groups.Groups) != 1 || !p.Groups.Groups[0].Exhausted || p.Groups.Groups[0].Proxies[0] != "entry" {
		t.Fatalf("groups wrong: %+v", p)
	}
	for _, v := range []string{`{"v":2,"groups":[]}`, `base64:not-valid`, `{"v":1,"groups":[{"name":"a","mode":"own","used":9223372036854775808}]}`} {
		if parseMikanGroups(v) != nil {
			t.Fatalf("invalid wire accepted: %s", v)
		}
	}
}

func TestPanelPoliciesRemovedOnRefresh(t *testing.T) {
	dir := t.TempDir()
	h := http.Header{}
	h.Set("Share-Links", "true")
	h.Set("X-Brand-Lock-Config-Script", "true")
	persistBrandManifestFromHeaders(dir, "https://panel.example.test/sub", h)
	if p := readSubscriptionPanel(dir); p == nil || !p.ShareLinksLocked {
		t.Fatal("policy not cached")
	}
	persistBrandManifestFromHeaders(dir, "https://panel.example.test/sub", http.Header{})
	p := readSubscriptionPanel(dir)
	if p == nil || p.ShareLinksLocked || p.Brand != nil {
		t.Fatalf("removed policy survived: %+v", p)
	}
}

func TestPanelRuntimeOverridesRunAfterScripts(t *testing.T) {
	dir := t.TempDir()
	h := http.Header{}
	h.Set("X-Brand-Hide-Global-Mode", "true")
	h.Set("X-Brand-Lock-Config-Script", "true")
	h.Set("X-Network-Stack", "gvisor")
	persistBrandManifestFromHeaders(dir, "https://panel.example.test/sub", h)
	m := map[string]any{"mode": "global", "rules": []any{"MATCH,DIRECT"}}
	if err := finalizeRuntimeConfigPipelineWithScript(m, dir, 7890, 9090, "secret", "tun", true, true, `function main(c) { c.injected = true; c.mode='global'; return c }`, nil); err != nil {
		t.Fatal(err)
	}
	if m["mode"] != "rule" || m["injected"] != nil || m["tun"].(map[string]any)["stack"] != "gvisor" {
		t.Fatalf("policy bypass: %+v", m)
	}
}

func TestPanelMutationGuards(t *testing.T) {
	p := Profile{ID: "profile-1792694400", Name: "Test", URL: "https://panel.example.test/sub", Panel: &SubscriptionPanel{ShareLinksLocked: true, Brand: &BrandManifest{LockConfigScript: true, HideGlobalMode: true}}}
	a := &App{profiles: []Profile{p}, state: AppState{Profile: ProfileState{ActiveProfileID: p.ID}}}
	if _, err := a.UpdateProfileInfo(p.ID, "Test", "https://other.example.test/sub"); err == nil {
		t.Fatal("locked URL changed")
	}
	if _, err := a.SetProfileScriptOverride(p.ID, "function main(c){return c}"); err == nil {
		t.Fatal("locked script stored")
	}
	if _, err := a.PreviewProfileScript(p.ID, "function main(c){return c}"); err == nil {
		t.Fatal("locked script preview ran")
	}
	if _, err := a.WriteProfileConfig(p.ID, "rules:\n - MATCH,DIRECT\n"); err == nil || !strings.Contains(err.Error(), "operator policy") {
		t.Fatalf("raw config policy guard = %v", err)
	}
	if _, err := a.SetMode("global"); err == nil {
		t.Fatal("global policy bypassed")
	}
	if _, err := a.SetMode("direct"); err == nil {
		t.Fatal("direct mode bypassed rule policy")
	}
}

func TestPanelChangingURLClearsPreviousProviderCache(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	root, err := slothDataRoot()
	if err != nil {
		t.Fatal(err)
	}
	id := "profile-1792694401"
	dir := filepath.Join(root, "runtime", id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"subscription.panel.json", "subscription.cache.yaml", "brand.manifest.json", "brand.logo"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("old provider"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	p := Profile{ID: id, Name: "Old", URL: "https://old.example.test/sub", Panel: &SubscriptionPanel{NetworkStack: "mips"}}
	a := &App{profiles: []Profile{p}}
	state, err := a.UpdateProfileInfo(id, "New", "https://new.example.test/sub")
	if err != nil {
		t.Fatal(err)
	}
	if state.Profile.Profiles[0].Panel != nil {
		t.Fatal("old provider policy survived URL change")
	}
	for _, name := range []string{"subscription.panel.json", "subscription.cache.yaml", "brand.manifest.json", "brand.logo"} {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Fatalf("stale %s survived", name)
		}
	}
}

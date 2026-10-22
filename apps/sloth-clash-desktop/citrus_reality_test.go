package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCitrusRealityNativePreflight(t *testing.T) {
	bin := testCoreBinaryForPassthrough()
	if bin == "" {
		t.Skip("Citrus binary is not provisioned")
	}
	node := func(name string) map[string]any {
		return map[string]any{
			"name": name, "type": "vless", "server": "127.0.0.1", "port": 443, "uuid": "3f1c9a3e-5c6a-4d1e-9d8b-2a7e4f0b1c55", "tls": true, "servername": "example.test", "client-fingerprint": "chrome",
			"reality-opts": map[string]any{"public-key": "WB52-may9oKJkdKL4cbLSLg_t41INOVet9-1ey1RLnk", "short-id": "0123456789abcdef"},
		}
	}
	config := map[string]any{"mixed-port": 0, "mode": "rule", "log-level": "silent", "dns": map[string]any{"enable": false}, "tun": map[string]any{"enable": false},
		"proxies": []any{node("local-reality")}, "proxy-providers": map[string]any{"native": map[string]any{"type": "inline", "payload": []any{node("provider-reality")}}},
		"proxy-groups": []any{map[string]any{"name": "test", "type": "select", "proxies": []any{"DIRECT", "local-reality"}, "use": []any{"native"}}}, "rules": []any{"MATCH,DIRECT"},
	}
	applyRealityOverlay(config, RealitySettings{MLKEM: "never", ClientVersion: "26.10.10"})
	raw, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "config.yaml"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	if err := runConfigPreflight(bin, dir); err != nil {
		t.Fatalf("Citrus rejected native REALITY/provider options: %v", err)
	}
}

func TestCitrusRealityNativeOptions(t *testing.T) {
	reality := map[string]any{"public-key": "keep", "short-id": "01"}
	plain := map[string]any{"name": "plain", "type": "trojan"}
	config := map[string]any{"reality-mlkem": "off", "reality-client-version": "1.2.3", "proxies": []any{map[string]any{"name": "reality", "type": "vless", "reality-opts": reality}, plain}}
	applyRealityOverlay(config, RealitySettings{MLKEM: "always", ClientVersion: "26.10.10"})
	if reality["support-x25519mlkem768"] != true || reality["client-version"] != "26.10.10" || reality["public-key"] != "keep" {
		t.Fatalf("native REALITY options = %#v", reality)
	}
	for _, key := range []string{"reality-mlkem", "reality-client-version"} {
		if _, ok := config[key]; ok {
			t.Fatalf("obsolete top-level %s still emitted", key)
		}
	}
	if _, ok := plain["reality-opts"]; ok {
		t.Fatal("non-REALITY proxy mutated")
	}
}

func TestCitrusRealityProviderOverrides(t *testing.T) {
	provider := map[string]any{"type": "http", "url": "https://example.test/proxies", "override": map[string]any{"udp": true, "override-expr": []any{`.name += "!"`}}}
	config := map[string]any{"proxy-providers": map[string]any{"remote": provider}}
	prefs := RealitySettings{MLKEM: "never", ClientVersion: "26.10.10"}
	applyRealityOverlay(config, prefs)
	override := provider["override"].(map[string]any)
	exprs, ok := override["override-expr"].([]any)
	if !ok || len(exprs) != 3 || exprs[0] != `.name += "!"` || override["udp"] != true {
		t.Fatalf("provider overrides = %#v", override)
	}
	all := ""
	for _, expr := range exprs {
		all += expr.(string)
	}
	if !strings.Contains(all, "support-x25519mlkem768") || !strings.Contains(all, "false") || !strings.Contains(all, "26.10.10") {
		t.Fatalf("missing native override: %s", all)
	}
	applyRealityOverlay(config, prefs)
	if got := len(provider["override"].(map[string]any)["override-expr"].([]any)); got != 3 {
		t.Fatalf("non-idempotent override count %d", got)
	}
}

func TestCitrusRealityAutoPreservesNodePolicy(t *testing.T) {
	opts := map[string]any{"client-version": "25.1.1", "support-x25519mlkem768": false}
	config := map[string]any{"reality-client-version": "1.2.3", "proxies": []any{map[string]any{"type": "vless", "reality-opts": opts}}}
	applyRealityOverlay(config, RealitySettings{})
	if opts["client-version"] != "25.1.1" || opts["support-x25519mlkem768"] != false {
		t.Fatalf("auto replaced explicit node settings: %#v", opts)
	}
}

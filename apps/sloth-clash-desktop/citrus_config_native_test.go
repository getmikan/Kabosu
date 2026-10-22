package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestCitrusChainPreservesExactHops(t *testing.T) {
	hops := []any{"entry", "missing-middle", "exit"}
	chain := map[string]any{"name": "cascade", "type": "chain", "proxies": hops}
	cfg := map[string]any{"proxy-providers": map[string]any{"native": map[string]any{"type": "inline"}}, "proxies": []any{map[string]any{"name": "entry"}, map[string]any{"name": "exit"}}, "proxy-groups": []any{chain}}
	normalizeProxyGroupRefs(cfg)
	if !reflect.DeepEqual(chain["proxies"], hops) {
		t.Fatalf("client rewrote native chain: %#v", chain)
	}
}

func TestCitrusIncludeAllProvidersPreserved(t *testing.T) {
	for _, key := range []string{"include-all-providers", "include-all"} {
		cfg := map[string]any{"proxy-providers": map[string]any{"native": map[string]any{"type": "inline", "payload": []any{}}}, "proxy-groups": []any{map[string]any{"name": "all", "type": "select", key: true}}}
		cleanupUnusedProxyProviders(cfg)
		if len(cfg["proxy-providers"].(map[string]any)) != 1 {
			t.Fatalf("native %s provider removed", key)
		}
	}
}

func TestCitrusChainRetainsNamedHops(t *testing.T) {
	groups := []any{map[string]any{"name": "Auto", "type": "url-test", "proxies": []any{"entry"}}, map[string]any{"name": "cascade", "type": "chain", "proxies": []any{"Auto", "exit"}}}
	cfg := map[string]any{"proxy-groups": groups}
	pruneFallbackAutoManualIfCustom(cfg)
	if len(cfg["proxy-groups"].([]any)) != 2 {
		t.Fatal("a real native chain hop was mistaken for a synthetic fallback")
	}
}

func TestCitrusNativeChainThroughPipeline(t *testing.T) {
	cfg := map[string]any{"mode": "rule", "log-level": "silent", "dns": map[string]any{"enable": false}, "proxies": []any{
		map[string]any{"name": "entry", "type": "socks5", "server": "127.0.0.1", "port": 1081}, map[string]any{"name": "exit", "type": "socks5", "server": "127.0.0.1", "port": 1082},
	}, "proxy-groups": []any{map[string]any{"name": "cascade", "type": "chain", "proxies": []any{"entry", "exit"}}}, "rules": []any{"MATCH,cascade"}, "tcp-connect-timeout": 15000}
	dir := t.TempDir()
	if err := finalizeRuntimeConfigPipeline(cfg, dir, 0, 0, "test-controller-secret", "proxy", false, false); err != nil {
		t.Fatal(err)
	}
	chain := cfg["proxy-groups"].([]any)[0].(map[string]any)
	if chain["type"] != "chain" || !reflect.DeepEqual(chain["proxies"], []any{"entry", "exit"}) || cfg["tcp-connect-timeout"] != 15000 {
		t.Fatalf("native options changed: %#v", cfg)
	}
	bin := testCoreBinaryForPassthrough()
	if bin == "" {
		t.Skip("Citrus binary is not provisioned")
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "config.yaml"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	if err := runConfigPreflight(bin, dir); err != nil {
		t.Fatalf("native Citrus chain rejected after client pipeline: %v", err)
	}
}

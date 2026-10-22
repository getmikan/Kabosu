package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNativeCitrusGroupDelay(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("Authorization") != "Bearer test-controller-secret" {
			t.Error("controller authentication missing")
		}
		w.Header().Set("Content-Type", "application/json")
		if r.URL.EscapedPath() == "/group/Group%2Fname%3F" {
			_, _ = w.Write([]byte(`{"testUrl":"https://probe.example.test/check","expectedStatus":"200/204"}`))
			return
		}
		if r.URL.EscapedPath() != "/group/Group%2Fname%3F/delay" {
			t.Errorf("path = %s", r.URL.EscapedPath())
		}
		if r.URL.Query().Get("timeout") != "10000" {
			t.Error("native group timeout missing")
		}
		if r.URL.Query().Get("url") != "https://probe.example.test/check" || r.URL.Query().Get("expected") != "200/204" {
			t.Error("configured native health check was replaced")
		}
		_, _ = w.Write([]byte(`{"node one":42,"node two":0}`))
	}))
	defer server.Close()
	t.Setenv("SLOTH_CLASH_CONTROLLER", server.URL)
	t.Setenv("SLOTH_CLASH_SECRET", "test-controller-secret")
	app := &App{}
	got, err := app.TestProxyGroupDelay("Group/name?")
	if err != nil || got["node one"] != 42 || got["node two"] != 0 || calls != 2 {
		t.Fatalf("native group delay = %v, %v; calls %d", got, err, calls)
	}
	for _, name := range []string{"", "bad\nname"} {
		if _, err := app.TestProxyGroupDelay(name); err == nil {
			t.Errorf("invalid group name %q accepted", name)
		}
	}
	if calls != 2 {
		t.Fatal("invalid input reached core")
	}
}

func TestNativeCitrusGroupDelayRejectsCoreErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusUnauthorized) }))
	defer server.Close()
	t.Setenv("SLOTH_CLASH_CONTROLLER", server.URL)
	if _, err := (&App{}).TestProxyGroupDelay("group"); err == nil {
		t.Fatal("unauthorized native result accepted")
	}
}

func TestNativeCitrusChainDiagnosticsSurviveController(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/proxies" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"proxies":{"route":{"type":"Chain","all":["entry","exit"],"now":"entry","chainAlive":false,"failedHop":"exit","chainError":"timeout"},"entry":{"type":"Vless"}}}`))
	}))
	defer server.Close()
	groups, err := pullProxyGroupsFromCore(server.URL, "")
	if err != nil || len(groups) != 1 {
		t.Fatalf("groups = %v, %v", groups, err)
	}
	g := groups[0]
	if g.Type != "Chain" || len(g.Proxies) != 2 || g.Proxies[0] != "entry" || g.Proxies[1] != "exit" || g.ChainAlive == nil || *g.ChainAlive || g.FailedHop != "exit" || g.ChainError != "timeout" {
		t.Fatalf("native chain diagnostics lost: %+v", g)
	}
}

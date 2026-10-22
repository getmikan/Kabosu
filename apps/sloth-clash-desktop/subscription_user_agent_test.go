package main

import (
	"context"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"testing/fstest"
	"time"
)

func TestSubscriptionUserAgentIsKabosuOnly(t *testing.T) {
	if got := subscriptionUserAgentCurrent(); got != "kabosu://" {
		t.Fatalf("User-Agent = %q", got)
	}
	list := subscriptionProbeUserAgents()
	if len(list) != 1 || list[0] != "kabosu://" {
		t.Fatalf("probe impersonated another client: %v", list)
	}
}

func TestCoreVersionFromFS(t *testing.T) {
	mk := func(content string) fs.FS {
		return fstest.MapFS{embeddedCoreVersionFile: &fstest.MapFile{Data: []byte(content)}}
	}
	cases := map[string]string{
		"dev-ca8204d95c32\n": "dev-ca8204d95c32",
		"dev-not-a-hash":     "",
		"v1.19.32\n":         "v1.19.32",
		"1.19.32":            "v1.19.32",
		"  v1.19.32\r\n":     "v1.19.32",
		"v1.19.32\nextra":    "v1.19.32",
		"":                   "",
		"latest":             "",
		"v1.19":              "",
		"v1.19.32-alpha":     "",
	}
	for content, want := range cases {
		if got := coreVersionFromFS(mk(content)); got != want {
			t.Fatalf("coreVersionFromFS(%q) = %q, want %q", content, got, want)
		}
	}
	if got := coreVersionFromFS(fstest.MapFS{}); got != "" {
		t.Fatalf("missing file must yield empty, got %q", got)
	}
	if got := coreVersionFromFS(nil); got != "" {
		t.Fatalf("nil FS must yield empty, got %q", got)
	}
}

// A build that ships a core must also ship its version: otherwise every
// subscription request silently falls back to the versionless UA and panels
// withhold protocols the core actually supports.
func TestEmbeddedCoreVersionPresentWhenCoreIsBundled(t *testing.T) {
	cores, _ := fs.Glob(bundledResources, "build/sidecar/sloth-mihomo*")
	if len(cores) == 0 {
		t.Skip("no sidecar core embedded in this test binary")
	}
	v := embeddedCoreVersion()
	if v == "" {
		t.Fatalf("core is bundled (%v) but %s is missing or invalid — run: pnpm run prebuild --force", cores, embeddedCoreVersionFile)
	}
	if _, err := os.Stat(embeddedCoreVersionFile); err != nil {
		t.Fatalf("%s should exist on disk next to the sidecar: %v", embeddedCoreVersionFile, err)
	}
}

// End-to-end: the header that actually leaves the process on a subscription
// GET is exactly the one we claim, for both fetch paths (full body + peek).
func TestSubscriptionRequestsSendTheExactUserAgent(t *testing.T) {
	want := subscriptionUserAgentCurrent()
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Header.Get("User-Agent"))
		w.Header().Set("Content-Type", "text/yaml")
		_, _ = w.Write([]byte("proxies: []\nproxy-groups: []\nrules: []\n"))
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if _, _, err := fetchSubscriptionBody(ctx, srv.URL+"/sub", ""); err != nil {
		t.Fatalf("fetchSubscriptionBody: %v", err)
	}
	if _, err := fetchSubscriptionPeekHeaders(ctx, srv.URL+"/sub", want); err != nil {
		t.Fatalf("fetchSubscriptionPeekHeaders: %v", err)
	}
	if len(seen) != 2 {
		t.Fatalf("expected 2 requests, got %d", len(seen))
	}
	for i, ua := range seen {
		if ua != want {
			t.Fatalf("request %d sent User-Agent %q, want %q", i, ua, want)
		}
	}
}

package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
	"unicode"
)

// TestProxyDelay performs a one-shot delay test for a proxy node/group.
// It calls mihomo GET /proxies/{name}/delay?timeout=4000&url=...
func (a *App) TestProxyDelay(name string) (int, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, errors.New("proxy name is required")
	}

	ep, secret, err := a.proxyDelayEndpoint()
	if err != nil {
		return 0, err
	}

	q := url.Values{}
	q.Set("timeout", "10000")
	q.Set("url", "http://cp.cloudflare.com/generate_204")
	path := "/proxies/" + url.PathEscape(name) + "/delay?" + q.Encode()
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	resp, err := coreDoWithEndpoint(ctx, ep, secret, http.MethodGet, path, nil)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return 0, errors.New("delay failed: HTTP " + resp.Status)
	}
	var out struct {
		Delay int `json:"delay"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&out); err != nil {
		return 0, err
	}
	if out.Delay <= 0 {
		return 0, errors.New("no delay value")
	}
	return out.Delay, nil
}

func (a *App) proxyDelayEndpoint() (string, string, error) {
	a.mu.RLock()
	conn := strings.TrimSpace(a.state.Connection.Status)
	running := a.state.Core.Running
	ep := a.effectiveCoreEndpointLocked()
	secret := a.coreSecret
	a.mu.RUnlock()

	if ep == "" || (conn != "connected" && !running) {
		base := strings.TrimSpace(os.Getenv("SLOTH_CLASH_CONTROLLER"))
		if base == "" {
			return "", "", errors.New("connect Kabosu or set SLOTH_CLASH_CONTROLLER for external core")
		}
		if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
			base = "http://" + base
		}
		base = strings.TrimRight(base, "/")
		ep = strings.TrimPrefix(base, "http://")
		ep = strings.TrimPrefix(ep, "https://")
		secret = strings.TrimSpace(os.Getenv("SLOTH_CLASH_SECRET"))
	}

	return ep, secret, nil
}

// TestProxyGroupDelay delegates scheduling, nesting and health history to Citrus.
func (a *App) TestProxyGroupDelay(name string) (map[string]int, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 512 || strings.IndexFunc(name, unicode.IsControl) >= 0 {
		return nil, errors.New("invalid proxy group name")
	}
	ep, secret, err := a.proxyDelayEndpoint()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	groupPath := "/group/" + url.PathEscape(name)
	meta, err := coreDoWithEndpoint(ctx, ep, secret, http.MethodGet, groupPath, nil)
	if err != nil {
		return nil, err
	}
	var group struct {
		TestURL        string `json:"testUrl"`
		ExpectedStatus string `json:"expectedStatus"`
	}
	decodeErr := json.NewDecoder(io.LimitReader(meta.Body, 1<<20)).Decode(&group)
	meta.Body.Close()
	if meta.StatusCode < 200 || meta.StatusCode >= 300 {
		return nil, errors.New("group metadata failed: HTTP " + meta.Status)
	}
	if decodeErr != nil {
		return nil, decodeErr
	}
	probeURL := strings.TrimSpace(group.TestURL)
	if probeURL == "" {
		probeURL = "http://cp.cloudflare.com/generate_204"
	}
	parsed, err := url.Parse(probeURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, errors.New("invalid core group test URL")
	}
	// Use the group's own probe so Citrus records native health history, including
	// Chain hop diagnostics. Citrus owns scheduling and expected-status parsing.
	q := url.Values{"timeout": {"10000"}, "url": {probeURL}}
	if group.ExpectedStatus != "" {
		q.Set("expected", group.ExpectedStatus)
	}
	path := groupPath + "/delay?" + q.Encode()
	resp, err := coreDoWithEndpoint(ctx, ep, secret, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, errors.New("group delay failed: HTTP " + resp.Status)
	}
	var out map[string]int
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&out); err != nil {
		return nil, err
	}
	if out == nil {
		return nil, errors.New("empty group delay result")
	}
	return out, nil
}

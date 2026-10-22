package main

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// findInstallConfigURL accepts Kabosu links and the upstream scheme for existing integrations.
func findInstallConfigURL(args []string) string {
	for _, a := range args {
		a = strings.TrimSpace(a)
		a = strings.Trim(a, `"`)
		lower := strings.ToLower(a)
		if strings.HasPrefix(lower, "kabosu:") || strings.HasPrefix(lower, "slothclash:") {
			return a
		}
	}
	return ""
}

// ParseInstallConfigURL parses kabosu://install-config?name=...&url=...
// Also accepts the path form and legacy slothclash links from existing providers.
func ParseInstallConfigURL(raw string) (name string, subscriptionURL string, err error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", "", errors.New("empty link")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", "", err
	}
	if !strings.EqualFold(u.Scheme, "kabosu") && !strings.EqualFold(u.Scheme, "slothclash") {
		return "", "", fmt.Errorf("unsupported scheme %q", u.Scheme)
	}
	host := strings.ToLower(strings.TrimSpace(u.Host))
	path := strings.Trim(strings.TrimSpace(u.Path), "/")
	ok := host == "install-config" || (host == "" && path == "install-config")
	if !ok {
		return "", "", fmt.Errorf("expected install-config (got host=%q path=%q)", u.Host, u.Path)
	}
	q := u.Query()
	name = strings.TrimSpace(q.Get("name"))
	subscriptionURL = strings.TrimSpace(q.Get("url"))
	if subscriptionURL == "" {
		return "", "", errors.New("missing url query parameter")
	}
	if len(subscriptionURL) > 8192 {
		return "", "", errors.New("url parameter too long")
	}
	if len(name) > 256 {
		return "", "", errors.New("name parameter too long")
	}
	return name, subscriptionURL, nil
}

package main

import (
	"strings"
	"testing"
)

// Recovery that gave up must say whether the network was left blocked (Proxy
// mode keeps the system proxy on the dead port) or direct (TUN).
func TestAutoRestartExhaustedMessage(t *testing.T) {
	proxy := autoRestartExhaustedMessage("proxy", 3)
	if !strings.Contains(proxy, "blocked") || !strings.Contains(proxy, "3 auto-restarts") {
		t.Fatalf("proxy message = %q", proxy)
	}
	tun := autoRestartExhaustedMessage("tun", 3)
	if strings.Contains(tun, "blocked") {
		t.Fatalf("tun message must not claim blocking: %q", tun)
	}
}

// While recovery holds the system proxy, stopping the core must not release
// the proxy lease; an explicit stop (hold off) still does.
func TestStopCoreKeepsProxyLeaseWhileHeld(t *testing.T) {
	a := &App{}
	a.systemProxyLeased = true
	a.holdSystemProxy = true
	a.stopCoreLocked()
	if !a.systemProxyLeased {
		t.Fatalf("held stop released the system proxy lease")
	}
}

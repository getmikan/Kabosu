package main

import "testing"

func TestControllerPortFromListen(t *testing.T) {
	cases := map[string]int{
		"127.0.0.1:53373":   53373,
		" 127.0.0.1:9090 ":  9090,
		"":                  0,
		"127.0.0.1":         0,
		"127.0.0.1:0":       0,
		"127.0.0.1:70000":   0,
		`\\.\pipe\sloth-x`:  0,
		"127.0.0.1:notport": 0,
	}
	for in, want := range cases {
		if got := controllerPortFromListen(in); got != want {
			t.Errorf("controllerPortFromListen(%q) = %d, want %d", in, got, want)
		}
	}
}

// A reload of a running core must keep its external-controller, otherwise
// mihomo closes the TCP API and the health watchdog restarts the core.
func TestRuntimeRewriteKeepsLiveController(t *testing.T) {
	m := map[string]any{}
	port := controllerPortFromListen("127.0.0.1:53373")
	applyCoreEndpointInvariants(m, 53372, port, "s3cret", port > 0)
	if got := m["external-controller"]; got != "127.0.0.1:53373" {
		t.Fatalf("external-controller = %v, want 127.0.0.1:53373", got)
	}

	idle := map[string]any{"external-controller": "127.0.0.1:1"}
	none := controllerPortFromListen("")
	applyCoreEndpointInvariants(idle, 7890, none, "s3cret", none > 0)
	if _, ok := idle["external-controller"]; ok {
		t.Fatalf("external-controller must be dropped when no core is running")
	}
}

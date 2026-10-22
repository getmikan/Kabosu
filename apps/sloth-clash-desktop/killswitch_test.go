package main

import "testing"

func TestKillSwitchTunInterface(t *testing.T) {
	if got := killSwitchTunInterface("proxy", DesktopPrefs{}); got != "" {
		t.Fatalf("proxy mode must not bind a TUN adapter, got %q", got)
	}
	if got := killSwitchTunInterface("tun", DesktopPrefs{}); got != tunWindowsDeviceName {
		t.Fatalf("default TUN adapter = %q, want %q", got, tunWindowsDeviceName)
	}
	custom := DesktopPrefs{TUN: TunSettings{Device: " MyTun "}}
	if got := killSwitchTunInterface("tun", custom); got != "MyTun" {
		t.Fatalf("custom TUN adapter = %q", got)
	}
}

// Blocking needs both the user's opt-in and a live session: never block a
// user who has not connected (or who disconnected on purpose).
func TestKillSwitchWanted(t *testing.T) {
	cases := []struct{ enabled, armed, want bool }{
		{false, false, false},
		{false, true, false},
		{true, false, false},
		{true, true, true},
	}
	for _, c := range cases {
		if got := killSwitchWanted(c.enabled, c.armed); got != c.want {
			t.Errorf("killSwitchWanted(%v, %v) = %v", c.enabled, c.armed, got)
		}
	}
}

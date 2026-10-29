package main

import (
	"errors"
	"testing"
)

// The guard only matters for a live TUN session the user did not opt out of:
// Proxy mode has no TUN route to loop into.
func TestEgressGuardWanted(t *testing.T) {
	cases := []struct {
		enabled, armed bool
		traffic        string
		want           bool
	}{
		{true, true, "tun", true},
		{true, true, "proxy", false},
		{true, true, "", false},
		{true, false, "tun", false},
		{false, true, "tun", false},
		{false, false, "proxy", false},
	}
	for _, c := range cases {
		if got := egressGuardWanted(c.enabled, c.armed, c.traffic); got != c.want {
			t.Errorf("egressGuardWanted(%v, %v, %q) = %v", c.enabled, c.armed, c.traffic, got)
		}
	}
}

// nil (a prefs.json from before the setting) keeps the guard on.
func TestForwardingGuardIsOnByDefault(t *testing.T) {
	on, off := true, false
	if !(TunSettings{}).IsForwardingGuardEnabled() {
		t.Fatal("an unset preference must leave the guard on")
	}
	if !(TunSettings{ForwardingGuard: &on}).IsForwardingGuardEnabled() {
		t.Fatal("true must leave the guard on")
	}
	if (TunSettings{ForwardingGuard: &off}).IsForwardingGuardEnabled() {
		t.Fatal("false must turn the guard off")
	}
}

func TestEgressGuardStateFrom(t *testing.T) {
	st := egressGuardStatus{
		Supported: true,
		Active:    true,
		Interface: "Ethernet",
		TurnedOff: []string{"Ethernet: IPv4 forwarding"},
	}
	got := egressGuardStateFrom(st, nil)
	want := EgressGuardState{Active: true, Interface: "Ethernet", TurnedOff: []string{"Ethernet: IPv4 forwarding"}}
	if !got.equal(want) {
		t.Fatalf("state = %+v, want %+v", got, want)
	}

	got = egressGuardStateFrom(st, errEgressGuardServiceTooOld)
	if got.Active || got.Error != errEgressGuardServiceTooOld.Error() {
		t.Fatalf("a failed call must report the error and no active guard, got %+v", got)
	}
}

// setEgressGuardState emits a UI update only on a change, so the supervisor
// poll must tell "same findings" from "a new one".
func TestEgressGuardStateEqual(t *testing.T) {
	base := EgressGuardState{Active: true, Interface: "Ethernet", TurnedOff: []string{"Ethernet: IPv4 forwarding"}}
	same := EgressGuardState{Active: true, Interface: "Ethernet", TurnedOff: []string{"Ethernet: IPv4 forwarding"}}
	if !base.equal(same) {
		t.Fatal("identical states must be equal")
	}
	changes := []EgressGuardState{
		{Active: false, Interface: "Ethernet", TurnedOff: base.TurnedOff},
		{Active: true, Interface: "Wi-Fi", TurnedOff: base.TurnedOff},
		{Active: true, Interface: "Ethernet", TurnedOff: []string{"Ethernet: IPv4 forwarding", "Ethernet: IPv6 forwarding"}},
		{Active: true, Interface: "Ethernet", TurnedOff: base.TurnedOff, GaveUp: []string{"Ethernet: IPv4 forwarding"}},
		{Active: true, Interface: "Ethernet", TurnedOff: base.TurnedOff, Error: errors.New("boom").Error()},
	}
	for _, c := range changes {
		if base.equal(c) {
			t.Errorf("%+v must differ from %+v", c, base)
		}
	}
}

package main

import (
	"context"
	"errors"
	"strings"
	"time"
)

// Kill switch (leak protection, level 2): while a session is up, the
// privileged service blocks at the OS firewall every outbound connection that
// does not go through the VPN — only loopback, the core binary, the TUN
// adapter, DHCP and (optionally) the LAN stay open. A crashed or restarting
// core therefore cannot leak the real IP, in Proxy and in TUN mode.
//
// The app "arms" it when a Connect succeeds and keeps it armed through core
// deaths and auto-restarts; only an explicit Disconnect, app shutdown or
// turning the preference off disarms it.

// errKillSwitchUnsupported is returned where the service has no firewall
// backend for this OS yet.
var errKillSwitchUnsupported = errors.New("kill switch is not available on this OS yet")

// killSwitchRequest is the body of the service's PUT /killswitch.
type killSwitchRequest struct {
	AllowLan     bool   `json:"allow_lan"`
	TunInterface string `json:"tun_interface"`
}

// killSwitchStatus is the service's answer.
type killSwitchStatus struct {
	Supported    bool   `json:"supported"`
	Active       bool   `json:"active"`
	AllowLan     bool   `json:"allow_lan"`
	TunInterface string `json:"tun_interface"`
	TunBound     bool   `json:"tun_bound"`
}

// killSwitchTunInterface is the adapter alias the service must allow: the
// user's custom TUN device name, else the one Kabosu forces on Windows.
func killSwitchTunInterface(traffic string, prefs DesktopPrefs) string {
	if traffic != "tun" {
		return ""
	}
	if dev := strings.TrimSpace(prefs.TUN.Device); dev != "" {
		return dev
	}
	return tunWindowsDeviceName
}

// killSwitchWanted reports whether the firewall should be blocking now.
func killSwitchWanted(enabled, armed bool) bool {
	return enabled && armed
}

// syncKillSwitch brings the service-side kill switch in line with the
// preference and the session. Safe to call from any goroutine; never holds
// a.mu during IPC.
func (a *App) syncKillSwitch() {
	prefs := currentDesktopPrefs()
	a.mu.RLock()
	armed := a.killSwitchArmed
	traffic := strings.TrimSpace(a.state.Traffic)
	a.mu.RUnlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var (
		st  killSwitchStatus
		err error
	)
	if killSwitchWanted(prefs.Privacy.KillSwitch, armed) {
		st, err = ipcSlothKillSwitchEnable(ctx, killSwitchRequest{
			AllowLan:     prefs.Privacy.KillSwitchAllowLan,
			TunInterface: killSwitchTunInterface(traffic, prefs),
		})
	} else {
		st, err = ipcSlothKillSwitchDisable(ctx)
		if errors.Is(err, errKillSwitchUnsupported) && !prefs.Privacy.KillSwitch {
			// Nothing to undo on an OS without a backend.
			err = nil
		}
	}

	a.mu.Lock()
	if err != nil {
		a.state.KillSwitch = KillSwitchState{Error: err.Error()}
	} else {
		a.state.KillSwitch = KillSwitchState{Active: st.Active, TunBound: st.TunBound}
	}
	a.state.UpdatedAt = time.Now().Unix()
	a.mu.Unlock()
	a.traceEvent("killswitch.sync", outcomeOf(err), 0, map[string]any{
		"armed":    armed,
		"enabled":  prefs.Privacy.KillSwitch,
		"traffic":  traffic,
		"active":   st.Active,
		"tunBound": st.TunBound,
	})
	a.emitAppStateChanged()
}

// armKillSwitch is called once a session is up (Connect done, auto-restart
// recovered, traffic mode switched) and re-binds the TUN adapter.
func (a *App) armKillSwitch() {
	a.mu.Lock()
	a.killSwitchArmed = true
	a.mu.Unlock()
	a.safeGo("killswitch", func() { a.syncKillSwitch() })
}

// disarmKillSwitch lifts the block for an intentional Disconnect/shutdown.
// Synchronous so the user is never left offline after the app exits.
func (a *App) disarmKillSwitch() {
	a.mu.Lock()
	a.killSwitchArmed = false
	a.mu.Unlock()
	a.syncKillSwitch()
}

func outcomeOf(err error) string {
	if err != nil {
		return "fail"
	}
	return "ok"
}

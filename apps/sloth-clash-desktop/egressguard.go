package main

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"
)

// Egress guard (TUN on Windows): while a TUN session is up, the privileged
// service keeps IP forwarding and weak host send off on the physical adapter
// the core's own traffic leaves through. With either flag on (Internet
// Connection Sharing, Mobile Hotspot, or an app that left them on), Windows
// ignores the core's interface binding, the core's own connections loop back
// into the TUN ("reject loopback connection", then dead DNS) and nothing
// short of resetting the adapter brought the tunnel back. The service puts
// the original values back on Disconnect.
//
// It rides the kill switch's session hooks (armKillSwitch/disarmKillSwitch)
// and is on by default; TunSettings.ForwardingGuard turns it off.

// errEgressGuardServiceTooOld: services before 2.7.0 have no /egress-guard.
var errEgressGuardServiceTooOld = errors.New("the Kabosu service is too old to protect TUN from connection sharing: reinstall the service in Settings")

// egressGuardRequest is the body of the service's PUT /egress-guard.
type egressGuardRequest struct {
	TunInterface string `json:"tun_interface"`
}

// egressGuardStatus is the service's answer.
type egressGuardStatus struct {
	Supported bool     `json:"supported"`
	Active    bool     `json:"active"`
	Interface string   `json:"interface"`
	TurnedOff []string `json:"turned_off"`
	GaveUp    []string `json:"gave_up"`
}

// egressGuardWanted reports whether the guard should be armed now: only a
// live TUN session can loop into itself.
func egressGuardWanted(enabled, armed bool, traffic string) bool {
	return enabled && armed && traffic == "tun"
}

func egressGuardStateFrom(st egressGuardStatus, err error) EgressGuardState {
	if err != nil {
		return EgressGuardState{Error: err.Error()}
	}
	return EgressGuardState{
		Active:    st.Active,
		Interface: st.Interface,
		TurnedOff: st.TurnedOff,
		GaveUp:    st.GaveUp,
	}
}

func (s EgressGuardState) equal(o EgressGuardState) bool {
	return s.Active == o.Active && s.Interface == o.Interface && s.Error == o.Error &&
		slices.Equal(s.TurnedOff, o.TurnedOff) && slices.Equal(s.GaveUp, o.GaveUp)
}

// syncEgressGuard brings the service-side guard in line with the preference,
// the traffic mode and the session. Safe to call from any goroutine; never
// holds a.mu during IPC.
func (a *App) syncEgressGuard() {
	prefs := currentDesktopPrefs()
	a.mu.RLock()
	armed := a.killSwitchArmed
	traffic := strings.TrimSpace(a.state.Traffic)
	a.mu.RUnlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	enabled := prefs.TUN.IsForwardingGuardEnabled()
	var (
		st  egressGuardStatus
		err error
	)
	if egressGuardWanted(enabled, armed, traffic) {
		st, err = ipcSlothEgressGuardArm(ctx, egressGuardRequest{
			TunInterface: killSwitchTunInterface(traffic, prefs),
		})
	} else {
		st, err = ipcSlothEgressGuardDisarm(ctx)
		if errors.Is(err, errEgressGuardServiceTooOld) {
			// Such a service never armed anything to undo.
			err = nil
		}
	}

	a.setEgressGuardState(egressGuardStateFrom(st, err))
	a.traceEvent("egressguard.sync", outcomeOf(err), 0, map[string]any{
		"armed":     armed,
		"enabled":   enabled,
		"traffic":   traffic,
		"active":    st.Active,
		"interface": st.Interface,
		"turnedOff": st.TurnedOff,
		"gaveUp":    st.GaveUp,
	})
}

// refreshEgressGuardStatus picks up what the service turned off since the
// last sync (an app enabling connection sharing mid-session), so the UI can
// tell the user. Runs on the runtime supervisor tick.
func (a *App) refreshEgressGuardStatus() {
	a.mu.RLock()
	active := a.state.EgressGuard.Active
	a.mu.RUnlock()
	if !active {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	st, err := ipcSlothEgressGuardStatus(ctx)
	if err != nil {
		// A missed poll changes nothing on the service side: keep what the
		// last sync reported and try again on the next tick.
		return
	}
	a.setEgressGuardState(egressGuardStateFrom(st, nil))
}

func (a *App) setEgressGuardState(next EgressGuardState) {
	a.mu.Lock()
	changed := !a.state.EgressGuard.equal(next)
	if changed {
		a.state.EgressGuard = next
		a.state.UpdatedAt = time.Now().Unix()
	}
	a.mu.Unlock()
	if changed {
		a.emitAppStateChanged()
	}
}

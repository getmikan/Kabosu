//go:build !windows

package main

import "context"

// The service has no firewall backend outside Windows yet (pf / nftables are
// next); the app reports it instead of pretending to protect.
func ipcSlothKillSwitchEnable(_ context.Context, _ killSwitchRequest) (killSwitchStatus, error) {
	return killSwitchStatus{}, errKillSwitchUnsupported
}

func ipcSlothKillSwitchDisable(_ context.Context) (killSwitchStatus, error) {
	return killSwitchStatus{}, errKillSwitchUnsupported
}

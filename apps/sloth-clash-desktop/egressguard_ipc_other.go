//go:build !windows

package main

import "context"

// Only Windows ignores the core's interface binding when forwarding is on, so
// there is nothing to guard elsewhere: the guard just stays inactive.
func ipcSlothEgressGuardArm(_ context.Context, _ egressGuardRequest) (egressGuardStatus, error) {
	return egressGuardStatus{}, nil
}

func ipcSlothEgressGuardDisarm(_ context.Context) (egressGuardStatus, error) {
	return egressGuardStatus{}, nil
}

func ipcSlothEgressGuardStatus(_ context.Context) (egressGuardStatus, error) {
	return egressGuardStatus{}, nil
}

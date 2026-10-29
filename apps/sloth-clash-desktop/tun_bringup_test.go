package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCurrentBootLogIgnoresStaleFailure(t *testing.T) {
	t.Parallel()
	// A stale failure from a previous boot, then a fresh boot that succeeds.
	// currentBootLog must drop everything before the last boot marker so the
	// old "start tun listening error" can't produce a false failure verdict.
	log := "Start initial configuration in progress\n" +
		"Start TUN listening error: configure tun interface: operation not permitted\n" +
		"Start initial configuration in progress\n" +
		"[TUN] Tun adapter listening at: utun5([198.18.0.1/30],[]), mtu: 9000\n"
	if got := scanTunBringUpLog(currentBootLog(log)); got != tunVerifyUp {
		t.Fatalf("scoped scan = %v, want tunVerifyUp (stale failure must be ignored)", got)
	}
	// And a genuine failure in the current boot is still caught.
	failLog := "Start initial configuration in progress\n" +
		"Start TUN listening error: configure tun interface: operation not permitted\n"
	if got := scanTunBringUpLog(currentBootLog(failLog)); got != tunVerifyFailed {
		t.Fatalf("current-boot failure = %v, want tunVerifyFailed", got)
	}
}

func TestScanTunBringUpLog(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		log  string
		want tunVerifyResult
	}{
		{
			name: "success",
			log: "time=\"...\" level=info msg=\"[TUN] Tun adapter listening at: Meta([198.18.0.1/30])\"\n" +
				"time=\"...\" level=info msg=\"DNS server listening at: :1053\"",
			want: tunVerifyUp,
		},
		{
			name: "operation-not-permitted",
			log: "time=\"...\" level=error msg=\"Start TUN listening error: configure tun interface: " +
				"Connect: operation not permitted\"",
			want: tunVerifyFailed,
		},
		{
			name: "configure-interface-error-only",
			log:  "level=error msg=\"configure tun interface: The system cannot find the file specified\"",
			want: tunVerifyFailed,
		},
		{
			name: "no-marker",
			log:  "level=info msg=\"Start initial Compatible provider default\"",
			want: tunVerifyUnknown,
		},
		{
			name: "transient-error-then-success",
			log: "level=error msg=\"Start TUN listening error: configure tun interface: in use\"\n" +
				"level=info msg=\"[TUN] Tun adapter listening at: Meta([198.18.0.1/30])\"",
			want: tunVerifyUp,
		},
		{
			name: "success-then-later-failure",
			log: "level=info msg=\"[TUN] Tun adapter listening at: Meta\"\n" +
				"level=error msg=\"Start TUN listening error: operation not permitted\"",
			want: tunVerifyFailed,
		},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := scanTunBringUpLog(tc.log); got != tc.want {
				t.Fatalf("scanTunBringUpLog(%s) = %d, want %d", tc.name, got, tc.want)
			}
		})
	}
}

func TestClassifyTunFailure(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		log      string
		recovery tunRecoverOutcome
		wantSub  string
	}{
		{"anyconnect", "Start TUN listening error: configure tun interface: operation not permitted", tunRecoverNotAttempted, "AnyConnect"},
		{"access-denied-removed", "configure tun interface: Access is denied.", tunRecoverRemoved, "asked the service to remove it"},
		{"access-denied-outdated", "configure tun interface: Access is denied.", tunRecoverServiceOutdated, "too old to clear it"},
		{"access-denied-failed", "configure tun interface: Access is denied.", tunRecoverFailed, "didn't go through"},
		{"in-use", "configure tun interface: the adapter already exists", tunRecoverNotAttempted, "already in use"},
		{"wintun", "failed to load wintun.dll", tunRecoverNotAttempted, "wintun driver"},
		{"generic", "some unexpected tun failure text", tunRecoverNotAttempted, "could not be brought up"},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := classifyTunFailure(tc.log, tc.recovery)
			if !containsFold(got, tc.wantSub) {
				t.Fatalf("classifyTunFailure(%s) = %q, want substring %q", tc.name, got, tc.wantSub)
			}
		})
	}
}

func containsFold(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexFold(s, sub) >= 0)
}

func indexFold(s, sub string) int {
	ls, lsub := toLowerASCII(s), toLowerASCII(sub)
	for i := 0; i+len(lsub) <= len(ls); i++ {
		if ls[i:i+len(lsub)] == lsub {
			return i
		}
	}
	return -1
}

func toLowerASCII(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'A' && b[i] <= 'Z' {
			b[i] += 'a' - 'A'
		}
	}
	return string(b)
}

// On Windows the service writes logs/service_latest.log, the app-run core
// core.log; the verdict must read the one written last, not a missing file
// that always looked like success.
func TestCoreLogPathFollowsTheLiveLog(t *testing.T) {
	root, err := slothDataRoot()
	if err != nil {
		t.Fatal(err)
	}
	id := "profile-log-path"
	dir := filepath.Join(root, "runtime", id)
	service := filepath.Join(dir, "logs", "service_latest.log")
	core := filepath.Join(dir, "core.log")
	if got, _ := coreLogPathForProfile(id); got != service {
		t.Fatalf("no log yet: got %s, want the service log", got)
	}
	writeLog(t, core, "old app-run core\n")
	writeLog(t, service, "service-run core\n")
	past := time.Now().Add(-time.Hour)
	if err := os.Chtimes(core, past, past); err != nil {
		t.Fatal(err)
	}
	if got, _ := coreLogPathForProfile(id); got != service {
		t.Fatalf("service log is newer: got %s", got)
	}
	future := time.Now().Add(time.Minute)
	if err := os.Chtimes(core, future, future); err != nil {
		t.Fatal(err)
	}
	if got, _ := coreLogPathForProfile(id); got != core {
		t.Fatalf("core.log is newer: got %s", got)
	}
}

// A failed attempt of the same core (e.g. the Connect before) must not fail
// the next one, and a rotated log is read from its start.
func TestCoreLogMarkReadsOnlyWhatCameAfter(t *testing.T) {
	root, err := slothDataRoot()
	if err != nil {
		t.Fatal(err)
	}
	id := "profile-log-mark"
	path := filepath.Join(root, "runtime", id, "logs", "service_latest.log")
	failure := "level=error msg=\"Start TUN listening error: configure tun interface: The system cannot find the file specified.\"\n"
	writeLog(t, path, "level=info msg=\"Start initial configuration in progress\"\n"+failure)

	mark := markCoreLog(id)
	if got := scanTunBringUpLog(mark.text(id, 64*1024)); got != tunVerifyUnknown {
		t.Fatalf("before anything new: %v, want unknown (the old failure is not this attempt's)", got)
	}
	appendLog(t, path, "level=warning msg=\"[TUN] default interface changed by monitor, => Ethernet\"\n")
	if got := scanTunBringUpLog(mark.text(id, 64*1024)); got != tunVerifyUnknown {
		t.Fatalf("unrelated line: %v, want unknown", got)
	}
	appendLog(t, path, failure)
	if got := scanTunBringUpLog(mark.text(id, 64*1024)); got != tunVerifyFailed {
		t.Fatalf("new failure: %v, want failed", got)
	}

	writeLog(t, path, "level=info msg=\"[TUN] Tun adapter listening at: SlothClash\"\n")
	if got := scanTunBringUpLog(mark.text(id, 64*1024)); got != tunVerifyUp {
		t.Fatalf("rotated log: %v, want up", got)
	}
}

func writeLog(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func appendLog(t *testing.T, path, text string) {
	t.Helper()
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, err := f.WriteString(text); err != nil {
		t.Fatal(err)
	}
}

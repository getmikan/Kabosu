package main

import "testing"

func TestCompareAppVersions(t *testing.T) {
	t.Parallel()
	cases := []struct {
		a, b string
		want int
	}{
		{"0.1.0", "0.2.0", -1},
		{"v0.1.1", "0.1.1", 0},
		{"0.1.1-beta.1", "0.1.1", -1},
		{"0.1.1", "0.1.1-beta.2", 1},
		{"0.1.1-beta.1", "0.1.1-beta.2", -1},
		{"0.1.1-beta.2", "0.1.1-beta.10", -1},
		{"0.1.1-beta.2", "0.1.1-rc.1", -1},
		{"0.1.1-beta", "0.1.1-beta.1", -1},
		{"0.1.2-beta.1", "0.1.1", 1},
		{"0.1.1+build.5", "0.1.1", 0},
	}
	for _, tc := range cases {
		if got := compareAppVersions(tc.a, tc.b); got != tc.want {
			t.Errorf("compareAppVersions(%q, %q) = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestRemoteIsNewerAcrossPrereleases(t *testing.T) {
	t.Parallel()
	if !remoteIsNewer("v0.1.1-beta.2", "0.1.1-beta.1") {
		t.Fatal("beta.2 must be offered to beta.1")
	}
	if !remoteIsNewer("v0.1.1", "0.1.1-beta.2") {
		t.Fatal("the final release must be offered to its betas")
	}
	if remoteIsNewer("v0.1.1-beta.3", "0.1.1") {
		t.Fatal("a beta must not be offered over its own final release")
	}
}

func TestPickNewestRelease(t *testing.T) {
	t.Parallel()
	got, ok := pickNewestRelease([]githubRelease{
		{TagName: "v0.1.0"},
		{TagName: "v0.1.2-beta.1", Draft: true},
		{TagName: "v0.1.1-beta.2"},
		{TagName: "v0.1.1-beta.1"},
		{TagName: ""},
	})
	if !ok || got.TagName != "v0.1.1-beta.2" {
		t.Fatalf("pickNewestRelease = %q, %v; want v0.1.1-beta.2", got.TagName, ok)
	}
	if _, ok := pickNewestRelease(nil); ok {
		t.Fatal("empty list must report not found")
	}
}

func TestAppUpdateSettingsChannel(t *testing.T) {
	t.Parallel()
	for in, want := range map[string]string{"": "stable", "stable": "stable", "beta": "beta", " BETA ": "beta", "nightly": "stable"} {
		if got := (AppUpdateSettings{Channel: in}).UpdateChannel(); got != want {
			t.Errorf("UpdateChannel(%q) = %q, want %q", in, got, want)
		}
	}
}

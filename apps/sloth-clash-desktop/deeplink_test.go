package main

import "testing"

func TestKabosuInstallConfigLinks(t *testing.T) {
	for _, raw := range []string{
		"kabosu://install-config?name=MySub&url=https%3A%2F%2Fexample.com%2Fa",
		"KABOSU:///install-config?name=MySub&url=https%3A%2F%2Fexample.com%2Fa",
		"slothclash://install-config?name=MySub&url=https%3A%2F%2Fexample.com%2Fa",
	} {
		t.Run(raw, func(t *testing.T) {
			name, u, err := ParseInstallConfigURL(raw)
			if err != nil || name != "MySub" || u != "https://example.com/a" {
				t.Fatalf("ParseInstallConfigURL = %q, %q, %v", name, u, err)
			}
		})
	}
}

func TestInstallConfigRejectsInvalidLinks(t *testing.T) {
	for _, raw := range []string{
		"https://install-config?url=https%3A%2F%2Fexample.com",
		"kabosu-evil://install-config?url=https%3A%2F%2Fexample.com",
		"kabosu://other?url=https%3A%2F%2Fexample.com",
		"kabosu://install-config",
	} {
		if _, _, err := ParseInstallConfigURL(raw); err == nil {
			t.Errorf("accepted invalid link %q", raw)
		}
	}
}

func TestFindInstallConfigLink(t *testing.T) {
	want := "kabosu://install-config?url=https%3A%2F%2Fexample.com"
	if got := findInstallConfigURL([]string{"kabosu-desktop.exe", "https://example.com", `"` + want + `"`}); got != want {
		t.Fatalf("found %q, want %q", got, want)
	}
	if got := findInstallConfigURL([]string{"kabosu-evil://install-config"}); got != "" {
		t.Fatalf("accepted another scheme: %q", got)
	}
}

func TestParseInstallConfigURL(t *testing.T) {
	name, u, err := ParseInstallConfigURL(
		"slothclash://install-config?name=MySub&url=https%3A%2F%2Fexample.com%2Fa%3Ft%3D1",
	)
	if err != nil {
		t.Fatal(err)
	}
	if name != "MySub" {
		t.Fatalf("name: got %q", name)
	}
	if u != "https://example.com/a?t=1" {
		t.Fatalf("url: got %q", u)
	}

	name2, u2, err := ParseInstallConfigURL("slothclash:///install-config?url=https%3A%2F%2Fa.test%2F")
	if err != nil {
		t.Fatal(err)
	}
	if name2 != "" {
		t.Fatalf("name2: got %q want empty", name2)
	}
	if u2 != "https://a.test/" {
		t.Fatalf("url2: got %q", u2)
	}
}

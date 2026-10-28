//go:build !windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
)

// runningApps reads `ps`: full paths on macOS, process names on Linux (the
// routes then match by name).
func runningApps() ([]RunningApp, error) {
	args := []string{"-axo", "comm="}
	if runtime.GOOS == "linux" {
		args = []string{"-eo", "comm="}
	}
	out, err := exec.Command("ps", args...).Output()
	if err != nil {
		return nil, err
	}
	self, _ := os.Executable()
	seen := map[string]bool{self: true}
	var apps []RunningApp
	for _, line := range strings.Split(string(out), "\n") {
		path := strings.TrimSpace(line)
		if path == "" || seen[path] || strings.HasPrefix(path, "/System/") || strings.HasPrefix(path, "/usr/libexec/") {
			continue
		}
		seen[path] = true
		apps = append(apps, RunningApp{Name: filepath.Base(path), Path: path})
	}
	slices.SortFunc(apps, func(x, y RunningApp) int {
		return strings.Compare(strings.ToLower(x.Name), strings.ToLower(y.Name))
	})
	return apps, nil
}

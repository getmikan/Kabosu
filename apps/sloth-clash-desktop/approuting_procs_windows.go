//go:build windows

package main

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

func runningApps() ([]RunningApp, error) {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, err
	}
	defer windows.CloseHandle(snapshot)

	systemDir := strings.ToLower(os.Getenv("SystemRoot")) + `\`
	self, _ := os.Executable()
	seen := map[string]bool{strings.ToLower(self): true}
	var apps []RunningApp
	entry := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	for err = windows.Process32First(snapshot, &entry); err == nil; err = windows.Process32Next(snapshot, &entry) {
		path := processImagePath(entry.ProcessID)
		key := strings.ToLower(path)
		if path == "" || seen[key] || (systemDir != `\` && strings.HasPrefix(key, systemDir)) {
			continue
		}
		seen[key] = true
		apps = append(apps, RunningApp{Name: filepath.Base(path), Path: path})
	}
	slices.SortFunc(apps, func(x, y RunningApp) int {
		return strings.Compare(strings.ToLower(x.Name), strings.ToLower(y.Name))
	})
	return apps, nil
}

// processImagePath is "" for processes this user may not open (system and
// elevated ones).
func processImagePath(pid uint32) string {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return ""
	}
	defer windows.CloseHandle(h)
	buf := make([]uint16, windows.MAX_LONG_PATH)
	size := uint32(len(buf))
	if err := windows.QueryFullProcessImageName(h, 0, &buf[0], &size); err != nil {
		return ""
	}
	return windows.UTF16ToString(buf[:size])
}

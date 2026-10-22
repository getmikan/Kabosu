package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"
)

// SubscriptionPanel is per-profile metadata from the same subscription response.
// It contains no executable script or global preferences.
type SubscriptionPanel struct {
	WebPageURL            string         `json:"webPageUrl,omitempty"`
	AnnouncementURL       string         `json:"announcementUrl,omitempty"`
	UpdateIntervalMinutes int            `json:"updateIntervalMinutes,omitempty"`
	ShareLinksLocked      bool           `json:"shareLinksLocked,omitempty"`
	NetworkStack          string         `json:"networkStack,omitempty"`
	HwidActive            *bool          `json:"hwidActive,omitempty"`
	HwidNotSupported      *bool          `json:"hwidNotSupported,omitempty"`
	HwidMaxDevicesReached *bool          `json:"hwidMaxDevicesReached,omitempty"`
	HwidLimit             *bool          `json:"hwidLimit,omitempty"`
	Groups                *MikanGroups   `json:"groups,omitempty"`
	Brand                 *BrandManifest `json:"brand,omitempty"`
}

type MikanGroups struct {
	ResetsAt int64              `json:"resetsAt,omitempty"`
	Groups   []MikanServerGroup `json:"groups"`
}

type MikanServerGroup struct {
	ID        int64    `json:"id"`
	Name      string   `json:"name"`
	Mode      string   `json:"mode"`
	Used      int64    `json:"used"`
	Limit     *int64   `json:"limit,omitempty"`
	Extra     int64    `json:"extra"`
	Left      *int64   `json:"left,omitempty"`
	Exhausted bool     `json:"exhausted"`
	Proxies   []string `json:"proxies,omitempty"`
}

func panelBool(raw string) *bool {
	switch strings.ToLower(brandRawValue(raw)) {
	case "true", "1", "yes", "on":
		v := true
		return &v
	case "false", "0", "no", "off":
		v := false
		return &v
	}
	return nil
}

func parseMikanGroups(raw string) *MikanGroups {
	raw = brandRawValue(raw)
	if len(raw) == 0 || len(raw) > 64*1024 {
		return nil
	}
	if strings.HasPrefix(strings.ToLower(raw), "base64:") {
		b, err := decodeBase64Flexible(strings.TrimSpace(raw[7:]))
		if err != nil {
			return nil
		}
		raw = string(b)
	}
	var wire struct {
		V        int   `json:"v"`
		ResetsAt int64 `json:"resets_at"`
		Groups   []struct {
			ID      int64    `json:"id"`
			Name    string   `json:"name"`
			Mode    string   `json:"mode"`
			Used    int64    `json:"used"`
			Limit   *int64   `json:"limit"`
			Extra   int64    `json:"extra"`
			Left    *int64   `json:"left"`
			State   string   `json:"state"`
			Proxies []string `json:"proxies"`
		} `json:"groups"`
	}
	if json.Unmarshal([]byte(raw), &wire) != nil || wire.V != 1 {
		return nil
	}
	out := &MikanGroups{ResetsAt: max(0, wire.ResetsAt), Groups: []MikanServerGroup{}}
	for i, g := range wire.Groups {
		if i >= 64 {
			break
		}
		if g.Mode != "own" && g.Mode != "unlimited" && g.Mode != "main" {
			continue
		}
		name := []rune(strings.TrimSpace(strings.Map(func(r rune) rune {
			if unicode.IsControl(r) {
				return -1
			}
			return r
		}, g.Name)))
		if len(name) == 0 {
			continue
		}
		if len(name) > 64 {
			name = name[:64]
		}
		group := MikanServerGroup{ID: g.ID, Name: string(name), Mode: g.Mode, Used: max(0, g.Used)}
		if g.Mode == "main" {
			group.Used = 0
		}
		if g.Mode == "own" {
			if g.Limit != nil && *g.Limit >= 0 {
				group.Limit = g.Limit
			}
			if group.Limit != nil && g.Left != nil && *g.Left >= 0 {
				group.Left = g.Left
			}
			group.Extra = max(0, g.Extra)
			group.Exhausted = g.State == "exhausted"
		}
		for _, p := range g.Proxies {
			if strings.TrimSpace(p) != "" && len(p) <= 1024 {
				group.Proxies = append(group.Proxies, p)
			}
			if len(group.Proxies) >= 4096 {
				break
			}
		}
		out.Groups = append(out.Groups, group)
	}
	return out
}

func parseSubscriptionPanel(subURL string, h http.Header) *SubscriptionPanel {
	u, err := url.Parse(subURL)
	if err != nil || !strings.EqualFold(u.Scheme, "https") || u.Host == "" {
		return nil
	}
	p := &SubscriptionPanel{
		WebPageURL:       brandCleanURL(headerFirstNonEmpty(h, []string{"Profile-Web-Page-URL", "Subscription-Web-Page", "X-Subscription-Web-Page", "Profile-Web-Page"})),
		AnnouncementURL:  brandCleanURL(headerFirstNonEmpty(h, []string{"Announce-URL", "Announcement-URL", "X-Announce-URL", "X-Announcement-URL"})),
		ShareLinksLocked: brandParseBool(headerFirstNonEmpty(h, []string{"Share-Links", "Share_Links", "X-Share-Links", "X-Share-Links-Policy"})),
		HwidActive:       panelBool(h.Get("x-hwid-active")), HwidNotSupported: panelBool(h.Get("x-hwid-not-supported")),
		HwidMaxDevicesReached: panelBool(h.Get("x-hwid-max-devices-reached")), HwidLimit: panelBool(h.Get("x-hwid-limit")),
		Groups: parseMikanGroups(h.Get("X-Mikan-Groups")), Brand: parseBrandManifest(h.Get),
	}
	if n, err := strconv.Atoi(brandRawValue(headerFirstNonEmpty(h, []string{"Profile-Update-Interval", "Update-Interval", "X-Profile-Update-Interval"}))); err == nil && n >= 1 && n <= 720 {
		p.UpdateIntervalMinutes = n * 60
	}
	switch stack := strings.ToLower(brandRawValue(headerFirstNonEmpty(h, []string{"X-Network-Stack", "Network-Stack", "X-NetworkStack", "X-NetworkStack-enabled"}))); stack {
	case "system", "gvisor", "mixed", "mips":
		p.NetworkStack = stack
		// auto leaves the desktop user setting in charge.
	}
	return p
}

func readSubscriptionPanel(dataDir string) *SubscriptionPanel {
	b, err := os.ReadFile(filepath.Join(dataDir, "subscription.panel.json"))
	if err != nil || len(b) > 256*1024 {
		return nil
	}
	var p SubscriptionPanel
	if json.Unmarshal(b, &p) != nil {
		return nil
	}
	return &p
}

func persistSubscriptionPanel(dataDir, subURL string, h http.Header) {
	p := parseSubscriptionPanel(subURL, h)
	if p == nil {
		return
	}
	b, err := json.Marshal(p)
	if err != nil {
		return
	}
	_ = os.MkdirAll(dataDir, 0o755)
	_ = atomicWriteFile(filepath.Join(dataDir, "subscription.panel.json"), b, 0o600)
}

func profilePanel(p Profile) *SubscriptionPanel {
	if root, err := slothDataRoot(); err == nil {
		if cached := readSubscriptionPanel(filepath.Join(root, "runtime", p.ID)); cached != nil {
			return cached
		}
	}
	return p.Panel
}

func profileScriptLocked(p Profile) bool {
	m := profilePanel(p)
	return m != nil && m.Brand != nil && m.Brand.LockConfigScript
}
func profileGlobalLocked(p Profile) bool {
	m := profilePanel(p)
	return m != nil && m.Brand != nil && m.Brand.HideGlobalMode
}

func applyPanelRuntimePolicy(m map[string]any, p *SubscriptionPanel) {
	if p == nil {
		return
	}
	if p.Brand != nil && p.Brand.HideGlobalMode {
		m["mode"] = "rule"
	}
	if p.NetworkStack != "" {
		if tun, ok := m["tun"].(map[string]any); ok {
			tun["stack"] = p.NetworkStack
		}
	}
}

func panelUpdateInterval(p *SubscriptionPanel) int {
	if p != nil && p.UpdateIntervalMinutes > 0 {
		return p.UpdateIntervalMinutes
	}
	return defaultProfileAutoUpdateMinutes
}

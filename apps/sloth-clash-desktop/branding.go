package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// ---------------------------------------------------------------------------
// Panel-driven branding via subscription HTTP response headers.
//
// Android X-Brand-* headers are supported directly. An explicit desktop gate
// selects the legacy X-Brand-Desktop-* namespace for platform-specific overrides.
// Operator policies apply independently from the visual branding gate.
// All metadata is scoped to an HTTPS subscription profile.
//
// Trust boundary: a manifest may hide non-critical UI, recolor, and add
// operator links. It has no reach into connection security, updates, or the
// Settings/Logs pages.
// ---------------------------------------------------------------------------

const (
	brandHdrEnabled = "X-Brand-Desktop-Enabled"

	brandHdrName         = "X-Brand-Desktop-Name"
	brandHdrTagline      = "X-Brand-Desktop-Tagline"
	brandHdrLogoURL      = "X-Brand-Desktop-Logo-URL"
	brandHdrLogoLightURL = "X-Brand-Desktop-Logo-Light-URL"
	brandHdrAccentColor  = "X-Brand-Desktop-Accent-Color"

	brandHdrWebsiteURL  = "X-Brand-Desktop-Website-URL"
	brandHdrSupportURL  = "X-Brand-Desktop-Support-URL"
	brandHdrTelegramURL = "X-Brand-Desktop-Telegram-URL"
	brandHdrBotURL      = "X-Brand-Desktop-Bot-URL"
	brandHdrPrivacyURL  = "X-Brand-Desktop-Privacy-URL"
	brandHdrTermsURL    = "X-Brand-Desktop-Terms-URL"
	brandHdrHelpURL     = "X-Brand-Desktop-Help-URL"
	brandHdrStatusURL   = "X-Brand-Desktop-Status-URL"
	brandHdrRenewURL    = "X-Brand-Desktop-Renew-URL"
	brandHdrCabinetURL  = "X-Brand-Desktop-Cabinet-URL"

	brandHdrUserDisplayName = "X-Brand-Desktop-User-Display-Name"
	brandHdrGreeting        = "X-Brand-Desktop-Greeting"

	// Device-slot usage. No standard subscription header carries this (the
	// common Subscription-Userinfo only has traffic + expiry), so it lives in
	// our namespace: panels that track device limits can surface "3 / 5" in the
	// operator dialog instead of the user guessing.
	brandHdrDevicesUsed  = "X-Brand-Desktop-Devices-Used"
	brandHdrDevicesLimit = "X-Brand-Desktop-Devices-Limit"

	brandHdrHideGlobalMode   = "X-Brand-Desktop-Hide-Global-Mode"
	brandHdrHideProxyMode    = "X-Brand-Desktop-Hide-Proxy-Mode"
	brandHdrHideLocalConfigs = "X-Brand-Desktop-Hide-Local-Configs"
	brandHdrHideAdvanced     = "X-Brand-Desktop-Hide-Advanced"
)

// Value caps — same numbers as the shared protocol doc.
const (
	brandMaxNameLen        = 64
	brandMaxTaglineLen     = 128
	brandMaxDisplayNameLen = 96
	brandMaxGreetingLen    = 160
	brandMaxURLLen         = 2048
	brandMaxDeviceCount    = 10000
)

// BrandManifest is the validated, ready-to-render branding for one profile.
// Field values are already sanitized; the frontend applies them as-is.
type BrandManifest struct {
	ShowOperatorTab   bool   `json:"showOperatorTab,omitempty"`
	HideRouting       bool   `json:"hideRouting,omitempty"`
	LockConfigScript  bool   `json:"lockConfigScript,omitempty"`
	PrimaryProxyGroup string `json:"primaryProxyGroup,omitempty"`
	ProxyGroupLayout  string `json:"proxyGroupLayout,omitempty"`
	Enabled           bool   `json:"enabled"`

	Name         string `json:"name,omitempty"`
	Tagline      string `json:"tagline,omitempty"`
	LogoURL      string `json:"logoUrl,omitempty"`
	LogoLightURL string `json:"logoLightUrl,omitempty"`
	AccentColor  string `json:"accentColor,omitempty"`

	WebsiteURL  string `json:"websiteUrl,omitempty"`
	SupportURL  string `json:"supportUrl,omitempty"`
	TelegramURL string `json:"telegramUrl,omitempty"`
	BotURL      string `json:"botUrl,omitempty"`
	PrivacyURL  string `json:"privacyUrl,omitempty"`
	TermsURL    string `json:"termsUrl,omitempty"`
	HelpURL     string `json:"helpUrl,omitempty"`
	StatusURL   string `json:"statusUrl,omitempty"`
	RenewURL    string `json:"renewUrl,omitempty"`
	CabinetURL  string `json:"cabinetUrl,omitempty"`

	UserDisplayName string `json:"userDisplayName,omitempty"`
	Greeting        string `json:"greeting,omitempty"`

	// 0 = not reported. Used alone still renders ("2 devices"); with a limit it
	// renders as a ratio.
	DevicesUsed  int `json:"devicesUsed,omitempty"`
	DevicesLimit int `json:"devicesLimit,omitempty"`

	HideGlobalMode   bool `json:"hideGlobalMode,omitempty"`
	HideProxyMode    bool `json:"hideProxyMode,omitempty"`
	HideLocalConfigs bool `json:"hideLocalConfigs,omitempty"`
	HideAdvanced     bool `json:"hideAdvanced,omitempty"`
}

var brandHexColorRe = regexp.MustCompile(`^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`)

// brandRawValue trims whitespace and one layer of surrounding quotes, and
// repairs invalid UTF-8 (defensive; Go keeps header bytes verbatim, so a
// well-formed UTF-8 panel value needs no Latin-1 round-trip here).
func brandRawValue(v string) string {
	v = strings.TrimSpace(v)
	v = strings.Trim(v, `"'`)
	v = strings.TrimSpace(v)
	if !utf8.ValidString(v) {
		v = strings.ToValidUTF8(v, "")
	}
	if strings.HasPrefix(strings.ToLower(v), "base64:") {
		if b, err := decodeBase64Flexible(strings.TrimSpace(v[7:])); err == nil && utf8.Valid(b) {
			v = string(b)
		}
	}
	return strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, v))
}

// brandParseBool accepts the shared protocol's truthy spellings; anything
// else — including absence — is false.
func brandParseBool(v string) bool {
	switch strings.ToLower(brandRawValue(v)) {
	case "true", "1", "yes", "on":
		return true
	}
	return false
}

// brandCleanHexColor normalizes to lowercase #rrggbb (mirrors the frontend
// normalizeHex); empty on invalid input.
func brandCleanHexColor(v string) string {
	v = strings.ToLower(brandRawValue(v))
	if !brandHexColorRe.MatchString(v) {
		return ""
	}
	if len(v) == 4 { // #rgb -> #rrggbb
		return "#" + strings.Repeat(string(v[1]), 2) +
			strings.Repeat(string(v[2]), 2) +
			strings.Repeat(string(v[3]), 2)
	}
	return v
}

// brandCleanURL keeps https:// (host required) and tg:// links only; every
// other scheme — including javascript:, http:, file: — drops the field.
func brandCleanURL(v string) string {
	v = brandRawValue(v)
	if v == "" || len(v) > brandMaxURLLen {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(v), "t.me/") {
		v = "https://" + v
	}
	u, err := url.Parse(v)
	if err != nil {
		return ""
	}
	switch strings.ToLower(u.Scheme) {
	case "https":
		if u.Host == "" || u.User != nil {
			return ""
		}
		return v
	case "tg":
		if u.Host != "" {
			return v
		}
	case "mailto":
		if u.Opaque != "" && !strings.ContainsAny(u.Opaque, "\r\n") {
			return v
		}
	}
	return ""
}

// brandCleanCount parses a non-negative device counter. Anything unparseable,
// negative or absurd (a panel bug should not render "4294967295 devices")
// degrades to 0 = not reported.
func brandCleanCount(v string) int {
	n, err := strconv.Atoi(brandRawValue(v))
	if err != nil || n < 0 || n > brandMaxDeviceCount {
		return 0
	}
	return n
}

// brandCleanString caps display strings; over-limit values drop to empty
// (absent) rather than truncating — a cap violation is a protocol violation.
func brandCleanString(v string, maxLen int) string {
	v = brandRawValue(v)
	if v == "" || utf8.RuneCountInString(v) > maxLen {
		return ""
	}
	return v
}

// parseBrandManifest builds a manifest from a header lookup. Returns nil when
// the branding gate is absent/false — callers treat nil as "no branding".
// Invalid individual fields degrade to absent without poisoning the rest.
func parseBrandManifest(get func(string) string) *BrandManifest {
	original := get
	desktop := strings.TrimSpace(original(brandHdrEnabled)) != ""
	get = func(key string) string {
		if desktop {
			return original(key)
		}
		if key == brandHdrEnabled {
			return original("X-Branding-Enabled")
		}
		return original(strings.Replace(key, "X-Brand-Desktop-", "X-Brand-", 1))
	}
	policy := &BrandManifest{
		HideGlobalMode:    brandParseBool(get(brandHdrHideGlobalMode)),
		LockConfigScript:  brandParseBool(get("X-Brand-Desktop-Lock-Config-Script")),
		PrimaryProxyGroup: brandCleanString(get("X-Brand-Desktop-Primary-Proxy-Group"), 512),
	}
	if policy.PrimaryProxyGroup == "" {
		policy.PrimaryProxyGroup = brandCleanString(get("X-Brand-Desktop-PrimaryProxyGroup"), 512)
	}
	layout := get("X-Brand-Desktop-Proxy-Group-Layout")
	if layout == "" {
		layout = get("X-Brand-Desktop-ProxyGroupLayout")
	}
	if layout == "tabs" || layout == "dropdown" {
		policy.ProxyGroupLayout = layout
	}
	if !brandParseBool(get(brandHdrEnabled)) {
		if policy.HideGlobalMode || policy.LockConfigScript || policy.PrimaryProxyGroup != "" || policy.ProxyGroupLayout != "" {
			return policy
		}
		return nil
	}
	return &BrandManifest{
		Enabled:           true,
		ShowOperatorTab:   brandParseBool(get("X-Brand-Desktop-Show-Operator-Tab")),
		HideRouting:       brandParseBool(get("X-Brand-Desktop-Hide-Routing")),
		LockConfigScript:  policy.LockConfigScript,
		PrimaryProxyGroup: policy.PrimaryProxyGroup,
		ProxyGroupLayout:  policy.ProxyGroupLayout,

		Name:         brandCleanString(get(brandHdrName), brandMaxNameLen),
		Tagline:      brandCleanString(get(brandHdrTagline), brandMaxTaglineLen),
		LogoURL:      brandCleanLogoURL(get(brandHdrLogoURL)),
		LogoLightURL: brandCleanLogoURL(get(brandHdrLogoLightURL)),
		AccentColor:  brandCleanHexColor(get(brandHdrAccentColor)),

		WebsiteURL:  brandCleanURL(get(brandHdrWebsiteURL)),
		SupportURL:  brandCleanURL(get(brandHdrSupportURL)),
		TelegramURL: brandCleanURL(get(brandHdrTelegramURL)),
		BotURL:      brandCleanURL(get(brandHdrBotURL)),
		PrivacyURL:  brandCleanURL(get(brandHdrPrivacyURL)),
		TermsURL:    brandCleanURL(get(brandHdrTermsURL)),
		HelpURL:     brandCleanURL(get(brandHdrHelpURL)),
		StatusURL:   brandCleanURL(get(brandHdrStatusURL)),
		RenewURL:    brandCleanURL(get(brandHdrRenewURL)),
		CabinetURL:  brandCleanURL(get(brandHdrCabinetURL)),

		UserDisplayName: brandCleanString(get(brandHdrUserDisplayName), brandMaxDisplayNameLen),
		Greeting:        brandCleanString(get(brandHdrGreeting), brandMaxGreetingLen),

		DevicesUsed:  brandCleanCount(get(brandHdrDevicesUsed)),
		DevicesLimit: brandCleanCount(get(brandHdrDevicesLimit)),

		HideGlobalMode:   brandParseBool(get(brandHdrHideGlobalMode)),
		HideProxyMode:    brandParseBool(get(brandHdrHideProxyMode)),
		HideLocalConfigs: brandParseBool(get(brandHdrHideLocalConfigs)),
		HideAdvanced:     brandParseBool(get(brandHdrHideAdvanced)),
	}
}

// ---------------------------------------------------------------------------
// Per-profile persistence (same lifecycle as subscription.cache.yaml).
// ---------------------------------------------------------------------------

func brandManifestPath(dataDir string) string {
	return filepath.Join(dataDir, "brand.manifest.json")
}

// persistBrandManifestFromHeaders captures branding off a subscription fetch
// response. Trust rules applied here, not at read time: header values are only
// honored when the subscription URL itself is HTTPS. A response without the
// gate clears any previously cached manifest (panel turned branding off).
func persistBrandManifestFromHeaders(dataDir, subURL string, hdr http.Header) {
	if strings.TrimSpace(dataDir) == "" || hdr == nil {
		return
	}
	if u, err := url.Parse(strings.TrimSpace(subURL)); err != nil || !strings.EqualFold(u.Scheme, "https") {
		return
	}
	persistSubscriptionPanel(dataDir, subURL, hdr)
	prev := readBrandManifest(dataDir)
	m := parseBrandManifest(hdr.Get)
	if m == nil {
		_ = os.Remove(brandManifestPath(dataDir))
		_ = os.Remove(brandLogoPath(dataDir, false))
		_ = os.Remove(brandLogoPath(dataDir, true))
		return
	}
	b, err := json.Marshal(m)
	if err != nil {
		return
	}
	_ = os.MkdirAll(dataDir, 0o755)
	_ = atomicWriteFile(brandManifestPath(dataDir), b, 0o600)
	// Logos refresh off the hot path; render always reads the disk cache.
	go refreshBrandLogos(dataDir, prev, m)
}

// readBrandManifest loads the cached manifest for a profile dataDir; nil when
// absent or unreadable (both mean stock UI).
func readBrandManifest(dataDir string) *BrandManifest {
	if strings.TrimSpace(dataDir) == "" {
		return nil
	}
	b, err := os.ReadFile(brandManifestPath(dataDir))
	if err != nil {
		return nil
	}
	var m BrandManifest
	if err := json.Unmarshal(b, &m); err != nil {
		return nil
	}
	return &m
}

// ---------------------------------------------------------------------------
// Operator logo cache: downloaded once per manifest change, rendered from
// disk only (offline restarts must not hit the network).
// ---------------------------------------------------------------------------

const brandLogoMaxBytes = 512 << 10 // 512 KB per variant

func brandLogoPath(dataDir string, light bool) string {
	if light {
		return filepath.Join(dataDir, "brand.logo.light")
	}
	return filepath.Join(dataDir, "brand.logo")
}

// refreshBrandLogos re-downloads a logo variant only when its URL changed (or
// the cache file vanished); unchanged manifests cost zero requests.
func refreshBrandLogos(dataDir string, prev, cur *BrandManifest) {
	prevURL := func(light bool) string {
		if prev == nil {
			return ""
		}
		if light {
			return prev.LogoLightURL
		}
		return prev.LogoURL
	}
	for _, v := range []struct {
		light bool
		url   string
	}{
		{false, cur.LogoURL},
		{true, cur.LogoLightURL},
	} {
		path := brandLogoPath(dataDir, v.light)
		if v.url == "" {
			_ = os.Remove(path)
			continue
		}
		if v.url == prevURL(v.light) {
			if _, err := os.Stat(path); err == nil {
				continue
			}
		}
		// An old operator image must not survive a changed or unavailable URL.
		_ = os.Remove(path)
		if b := fetchBrandLogo(v.url); b != nil {
			latest := readBrandManifest(dataDir)
			if latest == nil || (v.light && latest.LogoLightURL != v.url) || (!v.light && latest.LogoURL != v.url) {
				continue
			}
			_ = atomicWriteFile(path, b, 0o600)
		}
	}
}

func fetchBrandLogo(rawURL string) []byte {
	if brandCleanLogoURL(rawURL) == "" {
		return nil
	}
	// Resolve and dial the checked address directly: a second DNS lookup would
	// reintroduce rebinding between validation and the actual connection.
	transport := &http.Transport{DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, err
		}
		if len(ips) == 0 {
			return nil, errors.New("logo hostname has no public address")
		}
		for _, ip := range ips {
			if !ip.IP.IsGlobalUnicast() || hostIsPrivateTarget(ip.IP.String()) {
				return nil, errors.New("private logo address rejected")
			}
		}
		dialer := net.Dialer{Timeout: 10 * time.Second}
		return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Timeout: 15 * time.Second, Transport: transport, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 3 || brandCleanLogoURL(req.URL.String()) == "" {
			return errors.New("unsafe logo redirect")
		}
		return nil
	}}
	resp, err := client.Get(rawURL)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, brandLogoMaxBytes+1))
	if err != nil || len(b) == 0 || len(b) > brandLogoMaxBytes {
		return nil
	}
	if !validBrandLogoImage(b) {
		return nil
	}
	return b
}

func validBrandLogoImage(b []byte) bool {
	switch http.DetectContentType(b) {
	case "image/png", "image/jpeg":
		cfg, _, err := image.DecodeConfig(bytes.NewReader(b))
		return err == nil && cfg.Width > 0 && cfg.Height > 0 && int64(cfg.Width)*int64(cfg.Height) <= 1<<20
	case "image/webp":
		// WebP frame headers carry dimensions without decompressing image data.
		if len(b) < 30 {
			return false
		}
		var width, height uint32
		u24 := func(p []byte) uint32 { return uint32(p[0]) | uint32(p[1])<<8 | uint32(p[2])<<16 }
		switch string(b[12:16]) {
		case "VP8X":
			width = 1 + u24(b[24:27])
			height = 1 + u24(b[27:30])
		case "VP8 ":
			if string(b[23:26]) != "\x9d\x01\x2a" {
				return false
			}
			width = (uint32(b[26]) | uint32(b[27])<<8) & 0x3fff
			height = (uint32(b[28]) | uint32(b[29])<<8) & 0x3fff
		case "VP8L":
			if b[20] != 0x2f {
				return false
			}
			width = 1 + ((uint32(b[21]) | uint32(b[22])<<8) & 0x3fff)
			height = 1 + ((uint32(b[22])>>6 | uint32(b[23])<<2 | uint32(b[24])<<10) & 0x3fff)
		default:
			return false
		}
		return width > 0 && height > 0 && uint64(width)*uint64(height) <= 1<<20
	}
	return false
}

// readBrandLogoDataURI returns the cached logo as a data: URI (empty when no
// cache) so the webview renders it without any network or filesystem access.
func readBrandLogoDataURI(dataDir string, light bool) string {
	b, err := os.ReadFile(brandLogoPath(dataDir, light))
	if err != nil || len(b) == 0 {
		return ""
	}
	return "data:" + http.DetectContentType(b) + ";base64," + base64.StdEncoding.EncodeToString(b)
}

func brandCleanLogoURL(raw string) string {
	value := brandCleanURL(raw)
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "https" || hostIsPrivateTarget(u.Hostname()) {
		return ""
	}
	return value
}

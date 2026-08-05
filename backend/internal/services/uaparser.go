package services

import (
	"regexp"
	"strings"
)

// ParseUA extracts device/OS/browser info from a raw User-Agent string using
// lightweight substring/regex matching — no external dependency, since UA
// parsing libraries churn (renamed modules, breaking Go-version bumps) and
// analytics buckets only need "close enough", not forensic precision.
// Returns empty strings for fields it can't determine, so callers can pass
// them straight into nullIfEmpty() for NULL-on-unknown storage.
func ParseUA(ua string) (deviceType, osName, osVersion, browserName, browserVersion string) {
	if ua == "" {
		return "", "", "", "", ""
	}
	if isBotUA(ua) {
		return "bot", "", "", "", ""
	}

	osName, osVersion = parseOS(ua)
	browserName, browserVersion = parseBrowser(ua)
	deviceType = parseDeviceType(ua, osName)
	return
}

var botRe = regexp.MustCompile(`(?i)bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|pingdom|monitor`)

func isBotUA(ua string) bool {
	return botRe.MatchString(ua)
}

var (
	iosRe     = regexp.MustCompile(`iPhone OS ([\d_]+)|CPU OS ([\d_]+)`)
	androidRe = regexp.MustCompile(`Android ([\d.]+)`)
	windowsRe = regexp.MustCompile(`Windows NT ([\d.]+)`)
	macRe     = regexp.MustCompile(`Mac OS X ([\d_]+)`)
)

func parseOS(ua string) (name, version string) {
	switch {
	case strings.Contains(ua, "iPhone"), strings.Contains(ua, "iPad"), strings.Contains(ua, "iPod"):
		if m := iosRe.FindStringSubmatch(ua); m != nil {
			v := m[1]
			if v == "" {
				v = m[2]
			}
			return "iOS", majorOnly(v, "_")
		}
		return "iOS", ""
	case strings.Contains(ua, "Android"):
		if m := androidRe.FindStringSubmatch(ua); m != nil {
			return "Android", majorOnly(m[1], ".")
		}
		return "Android", ""
	case strings.Contains(ua, "Windows"):
		if m := windowsRe.FindStringSubmatch(ua); m != nil {
			return "Windows", majorOnly(m[1], ".")
		}
		return "Windows", ""
	case strings.Contains(ua, "Mac OS X"):
		if m := macRe.FindStringSubmatch(ua); m != nil {
			return "macOS", majorOnly(m[1], "_")
		}
		return "macOS", ""
	case strings.Contains(ua, "CrOS"):
		return "ChromeOS", ""
	case strings.Contains(ua, "Linux"):
		return "Linux", ""
	}
	return "", ""
}

// majorOnly collapses "17_4_1" / "10.15.7" down to just the major component,
// so the breakdown doesn't fragment into dozens of near-duplicate versions.
func majorOnly(v, sep string) string {
	if i := strings.Index(v, sep); i > 0 {
		return v[:i]
	}
	return v
}

var browserPatterns = []struct {
	name string
	re   *regexp.Regexp
}{
	// Order matters: many browsers' UAs also contain "Safari" or "Chrome" as a compatibility token.
	{"Edge", regexp.MustCompile(`Edg(?:A|iOS)?/([\d.]+)`)},
	{"SamsungBrowser", regexp.MustCompile(`SamsungBrowser/([\d.]+)`)},
	{"OperaMini", regexp.MustCompile(`OPiOS/([\d.]+)|Opera Mini/([\d.]+)`)},
	{"Opera", regexp.MustCompile(`OPR/([\d.]+)`)},
	{"UCBrowser", regexp.MustCompile(`UCBrowser/([\d.]+)`)},
	{"Firefox", regexp.MustCompile(`Firefox/([\d.]+)|FxiOS/([\d.]+)`)},
	{"Chrome", regexp.MustCompile(`Chrome/([\d.]+)|CriOS/([\d.]+)`)},
	{"Safari", regexp.MustCompile(`Version/([\d.]+).*Safari`)},
}

func parseBrowser(ua string) (name, version string) {
	for _, bp := range browserPatterns {
		if m := bp.re.FindStringSubmatch(ua); m != nil {
			for _, g := range m[1:] {
				if g != "" {
					return bp.name, majorOnly(g, ".")
				}
			}
			return bp.name, ""
		}
	}
	return "", ""
}

func parseDeviceType(ua, osName string) string {
	switch {
	case strings.Contains(ua, "iPad"):
		return "tablet"
	case osName == "Android" && !strings.Contains(ua, "Mobile"):
		return "tablet"
	case strings.Contains(ua, "Tablet") || strings.Contains(ua, "Kindle") || strings.Contains(ua, "SM-T"):
		return "tablet"
	case strings.Contains(ua, "iPhone"), strings.Contains(ua, "iPod"),
		(osName == "Android" && strings.Contains(ua, "Mobile")),
		strings.Contains(ua, "Windows Phone"), strings.Contains(ua, "BlackBerry"):
		return "mobile"
	case osName == "Windows", osName == "macOS", osName == "Linux", osName == "ChromeOS":
		return "desktop"
	}
	return ""
}

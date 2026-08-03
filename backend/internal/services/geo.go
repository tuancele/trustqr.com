package services

import (
	"log"
	"net"
	"os"
	"strings"
	"sync"

	"github.com/oschwald/geoip2-golang"
)

// GeoLookup returns city/region/country for an IP. Falls back to stub if MaxMind DB not present.
type GeoLookup struct {
	mu     sync.RWMutex
	reader *geoip2.Reader
}

// NewGeoLookup opens the MaxMind GeoLite2-City.mmdb if the path exists.
// Download from: https://www.maxmind.com/en/geolite2 (free, requires signup).
// Place file at ./geoip/GeoLite2-City.mmdb or set GEOIP_DB_PATH env var.
func NewGeoLookup(path string) *GeoLookup {
	g := &GeoLookup{}
	if path == "" {
		path = "./geoip/GeoLite2-City.mmdb"
	}
	if _, err := os.Stat(path); err == nil {
		r, err := geoip2.Open(path)
		if err != nil {
			log.Printf("geoip open %s: %v", path, err)
		} else {
			g.reader = r
			log.Printf("geoip: loaded MaxMind DB from %s", path)
		}
	} else {
		log.Printf("geoip: MMDB not found at %s, using stub lookup", path)
	}
	return g
}

// Lookup returns (city, region, country).
func (g *GeoLookup) Lookup(ip string) (string, string, string) {
	// Local/private addresses
	if ip == "" || strings.HasPrefix(ip, "127.") || strings.HasPrefix(ip, "::1") ||
		strings.HasPrefix(ip, "192.168.") || strings.HasPrefix(ip, "10.") ||
		strings.HasPrefix(ip, "172.") {
		return "Local", "Local", "VN"
	}
	g.mu.RLock()
	r := g.reader
	g.mu.RUnlock()
	if r == nil {
		return "Unknown", "Unknown", ""
	}
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return "Unknown", "Unknown", ""
	}
	rec, err := r.City(parsed)
	if err != nil {
		return "Unknown", "Unknown", ""
	}
	city := rec.City.Names["en"]
	region := ""
	if len(rec.Subdivisions) > 0 {
		region = rec.Subdivisions[0].Names["en"]
	}
	country := rec.Country.IsoCode
	return city, region, country
}

// LookupCity is the legacy free-function wrapper. Kept for compatibility.
func LookupCity(ip string) (city, region, country string) {
	return defaultGeo.Lookup(ip)
}

var defaultGeo = NewGeoLookup(os.Getenv("GEOIP_DB_PATH"))

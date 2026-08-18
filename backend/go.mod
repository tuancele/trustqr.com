module trustqr/backend

go 1.22

require (
	github.com/boombuler/barcode v1.0.1
	github.com/go-pdf/fpdf v0.9.0
	github.com/gofiber/fiber/v2 v2.52.5
	github.com/golang-jwt/jwt/v5 v5.2.1
	github.com/google/uuid v1.5.0
	github.com/jackc/pgx/v5 v5.7.1
	github.com/joho/godotenv v1.5.1
	github.com/microcosm-cc/bluemonday v1.0.27
	github.com/oschwald/geoip2-golang v1.11.0
	github.com/pquerna/otp v1.4.0
	github.com/redis/go-redis/v9 v9.7.0
	github.com/skip2/go-qrcode v0.0.0-20200617195104-da1b6568686e
	github.com/srwiley/oksvg v0.0.0-20221011165216-be6e8873101c
	github.com/srwiley/rasterx v0.0.0-20220730225603-2ab79fcdd4ef
	golang.org/x/crypto v0.27.0
)

require (
	github.com/andybalholm/brotli v1.0.5 // indirect
	github.com/aymerick/douceur v0.2.0 // indirect
	github.com/cespare/xxhash/v2 v2.2.0 // indirect
	github.com/dgryski/go-rendezvous v0.0.0-20200823014737-9f7001d12a5f // indirect
	github.com/gorilla/css v1.0.1 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/klauspost/compress v1.17.0 // indirect
	github.com/mattn/go-colorable v0.1.13 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/mattn/go-runewidth v0.0.15 // indirect
	github.com/oschwald/maxminddb-golang v1.13.0 // indirect
	github.com/rivo/uniseg v0.2.0 // indirect
	github.com/valyala/bytebufferpool v1.0.0 // indirect
	github.com/valyala/fasthttp v1.51.0 // indirect
	github.com/valyala/tcplisten v1.0.0 // indirect
	golang.org/x/image v0.12.0 // indirect
	golang.org/x/net v0.26.0 // indirect
	golang.org/x/sync v0.8.0 // indirect
	golang.org/x/sys v0.25.0 // indirect
	golang.org/x/text v0.18.0 // indirect
)

// Local patch: fix oksvg AddArcFromA reusing the wrong points slice for
// chained arc groups within a single SVG path A/a command, which was
// producing garbled/blob rasterization on arc-heavy production SVG
// templates (see backend/third_party/oksvg/path_cursor.go).
replace github.com/srwiley/oksvg => ./third_party/oksvg

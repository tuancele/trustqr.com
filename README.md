# Yanhee QR - Anti-Counterfeit System

Hệ thống chống giả & quản lý phân phối Yanhee Pink Gel.
Spec đầy đủ: [REQUIREMENTS.md](./REQUIREMENTS.md)

## Kiến trúc

- **Backend:** Go 1.22 + Fiber v2 (port 8080)
- **Frontend:** Next.js 14 App Router (port 3000)
- **DB:** PostgreSQL 16 với partition scan_logs theo tháng
- **Cache/RateLimit:** Redis 7
- **Auth:** JWT + TOTP 2FA (Google Authenticator)
- **QR:** HMAC-SHA256 signed 12-char tokens

## Chạy local

### 1. Khởi động Postgres + Redis
```bash
docker compose up -d
```

### 2. Chạy migrations (từ folder `backend/`)
```bash
cd backend
go build -o migrate.exe ./cmd/migrate && ./migrate.exe
```

### 3. Seed 20 mã demo
```bash
go build -o seed.exe ./cmd/seed && ./seed.exe
```

### 4. Tạo admin (một lần duy nhất)
```bash
go build -o create-admin.exe ./cmd/create-admin
./create-admin.exe -email admin@yanhee.vn -password "YanheeAdmin2026!"
```
Copy TOTP secret in kèm ra Google Authenticator / Authy.

### 5. Chạy backend + frontend
```bash
# terminal 1 - backend
cd backend && go build -o api.exe ./cmd/api && ./api.exe

# terminal 2 - frontend
cd frontend && npm install && npm run dev
```

Truy cập:
- **Public verify:** http://localhost:3000/v/AL7A8XN8PrTB (mã seed demo)
- **Admin login:** http://localhost:3000/admin/login
- **Unsubscribe:** http://localhost:3000/customer/unsubscribe
- **Xóa dữ liệu (NĐ13):** http://localhost:3000/customer/deletion
- **Privacy policy:** http://localhost:3000/privacy

## Cấu trúc Admin Portal

| Route | Chức năng |
|---|---|
| `/admin/dashboard` | Tổng quan: tổng tem, activated, lượt quét, nghi giả |
| `/admin/batches` | Danh sách lô, export CSV/ZIP (chứa QR PNG) |
| `/admin/batches/new` | Tạo lô mới, sinh N mã QR (max 100k) |
| `/admin/tokens` | Tra cứu 1 tem: batch, box, scans, activation |
| `/admin/analytics` | Fraud list + phân bổ scan theo tỉnh |
| `/admin/customers` | Export SĐT khách (all / marketing-only) |
| `/admin/audit` | Nhật ký action admin |

## Public API

```bash
# Verify (chạy khi Next.js SSR verify page)
curl -X POST http://localhost:8080/api/v1/qr/verify \
  -H "Content-Type: application/json" \
  -d '{"code":"AL7A8XN8PrTB"}'

# Activate + get voucher
curl -X POST http://localhost:8080/api/v1/qr/activate \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: <uuid>" \
  -d '{"code":"AL7A8XN8PrTB","phone":"0912345678","marketing_consent":true,"privacy_policy_version":"v1.0"}'

# NĐ13 - request xóa data
curl -X POST http://localhost:8080/api/v1/customer/deletion-request \
  -H "Content-Type: application/json" -d '{"phone":"0912345678"}'

# NĐ13 - unsubscribe marketing
curl -X POST http://localhost:8080/api/v1/customer/unsubscribe \
  -H "Content-Type: application/json" -d '{"phone":"0912345678"}'
```

## Admin API (yêu cầu JWT)

```bash
# Login step 1 - password
TEMP=$(curl -s -X POST http://localhost:8080/api/v1/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yanhee.vn","password":"YanheeAdmin2026!"}' | jq -r .temp_token)

# Login step 2 - TOTP (dùng code từ Google Authenticator)
ACCESS=$(curl -s -X POST http://localhost:8080/api/v1/admin/auth/2fa \
  -H "Content-Type: application/json" \
  -d "{\"temp_token\":\"$TEMP\",\"code\":\"123456\"}" | jq -r .access_token)

# Endpoints:
curl -H "Authorization: Bearer $ACCESS" http://localhost:8080/api/v1/admin/analytics/summary
curl -H "Authorization: Bearer $ACCESS" http://localhost:8080/api/v1/admin/batches
curl -H "Authorization: Bearer $ACCESS" http://localhost:8080/api/v1/admin/analytics/frauds
curl -H "Authorization: Bearer $ACCESS" http://localhost:8080/api/v1/admin/analytics/geo?days=30
curl -H "Authorization: Bearer $ACCESS" http://localhost:8080/api/v1/admin/customers/export -o customers.csv
curl -H "Authorization: Bearer $ACCESS" http://localhost:8080/api/v1/admin/batches/1/export.zip -o batch_1_qr.zip
curl -X PATCH -H "Authorization: Bearer $ACCESS" http://localhost:8080/api/v1/admin/tokens/3/disable
```

## Bảo mật đã implement

- ✅ **HMAC** verify offline trước khi query DB (chống brute-force)
- ✅ **Rate limit** per-IP (verify 20/min, activate 10/min, admin login 5/15min)
- ✅ **Rate limit per-phone** (activate 3/day, chống spam SĐT)
- ✅ **Atomic activate** (`UPDATE ... WHERE is_activated=FALSE`) - chống race condition
- ✅ **JWT + TOTP 2FA** cho admin, bcrypt cost 12
- ✅ **Account lockout** sau 5 lần fail (15 phút)
- ✅ **Audit log** mọi action admin (batch tạo, box gán, token disable, export)
- ✅ **NĐ13 compliance**: consent riêng cho marketing, deletion request có OTP, unsubscribe

## Tuân thủ NĐ13/2023

- Consent tách bạch: checkbox "lưu SĐT" (bắt buộc) vs "nhận marketing" (opt-in riêng)
- Privacy Policy version tracking (`v1.0`)
- Endpoint deletion + OTP xác nhận qua SMS (stub log)
- Endpoint unsubscribe marketing
- Soft-delete (anonymize `phone`, giữ aggregate cho analytics)

## Fraud Detection

Cron chạy 15 phút/lần, tự động flag token với:
- ≥3 city khác nhau quét trong 24h, HOẶC
- ≥10 IP khác nhau quét trong 24h

Token bị flag → verify page hiện cảnh báo nghi giả cho khách.

## Cấu trúc thư mục

```
QR/
├── REQUIREMENTS.md              # Spec kỹ thuật
├── README.md
├── docker-compose.yml           # Postgres + Redis (+ backup prod profile)
├── .env
├── scripts/
│   └── backup.sh                # pg_dump daily
├── backup/                      # Backup files (mount)
├── geoip/                       # Optional: MaxMind GeoLite2-City.mmdb
├── backend/
│   ├── cmd/
│   │   ├── api/                 # HTTP server
│   │   ├── migrate/             # DB migrations
│   │   ├── seed/                # Demo data
│   │   ├── create-admin/        # Admin bootstrap
│   │   └── test-totp/           # TOTP code helper (dev only)
│   ├── internal/
│   │   ├── config/              # env loader
│   │   ├── database/            # Postgres + Redis clients
│   │   ├── services/            # token(HMAC), phone, voucher, auth, geo, sms, fraud, audit, qrimage
│   │   ├── middleware/          # ratelimit, auth
│   │   └── handlers/            # qr, admin, admin_extra, admin_zip, customer, auth
│   └── migrations/
│       └── 001_init.sql
└── frontend/
    ├── app/
    │   ├── page.tsx             # Landing
    │   ├── v/[code]/            # Verify page (SSR, no-store)
    │   ├── privacy/             # Privacy policy
    │   ├── customer/
    │   │   ├── unsubscribe/
    │   │   └── deletion/
    │   └── admin/
    │       ├── login/           # Password + TOTP 2FA
    │       ├── dashboard/
    │       ├── batches/[..new]/
    │       ├── tokens/
    │       ├── analytics/
    │       ├── customers/
    │       └── audit/
    ├── components/
    │   └── ActivateForm.tsx
    └── lib/
        ├── api.ts               # Public API helper
        └── adminApi.ts          # Admin API + JWT refresh
```

## Production checklist

- [ ] Đổi `QR_HMAC_SECRET`, `JWT_SECRET` sang chuỗi random 32+ chars
- [ ] Tải MaxMind GeoLite2-City.mmdb vào `./geoip/` (miễn phí, cần signup)
- [ ] Thay `SMS_PROVIDER=stub` bằng provider thật (eSMS.vn, VietGuys, Zalo ZNS)
- [ ] Deploy sau nginx với HTTPS (Let's Encrypt)
- [ ] Bật backup service: `docker compose --profile prod up -d`
- [ ] Setup Prometheus scrape `/metrics`
- [ ] Setup Grafana + Loki cho log
- [ ] Alerting: fraud detection triggers → Telegram
```

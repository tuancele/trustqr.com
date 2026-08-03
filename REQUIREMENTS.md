# 📐 YANHEE PINK GEL - ANTI-COUNTERFEIT SYSTEM
## Tài liệu Yêu cầu Kỹ thuật (Technical Requirements Specification)

**Phiên bản:** 1.0
**Ngày:** 2026-07-31
**Kiến trúc:** Decoupled (Go Backend API + Next.js Frontend + PostgreSQL + Redis)

---

## I. TỔNG QUAN & TECH STACK

| Thành phần | Công nghệ | Lý do |
|---|---|---|
| Backend API | Go 1.22+ với **Fiber v2** | Performance cao, footprint nhỏ, phù hợp VPS |
| Frontend | Next.js 14 (App Router, SSR) | `no-store` cho trang verify, SEO tốt |
| Primary DB | PostgreSQL 16 | Partition, JSONB, mature |
| Cache/RateLimit | Redis 7 | Atomic counters, TTL, Lua scripts |
| Deployment | VPS 4 vCPU/8GB RAM + Docker Compose | ~$50-80/tháng, đủ 500k tem/tháng |
| IP Geolocation | MaxMind GeoLite2 (offline DB) | Miễn phí, không phụ thuộc API ngoài |
| QR Generator | `github.com/skip2/go-qrcode` | Sinh QR image PNG/SVG |
| Monitoring | Prometheus + Grafana + Loki | Self-hosted, đủ dùng |

---

## II. LUỒNG NGƯỜI DÙNG CUỐI

```
[Khách CÀO lớp bạc → Quét QR bằng camera]
        ↓
[QR chứa URL: https://yanhee-check.vn/v/A7K2P9Bf3xQz]
        ↓
Next.js SSR gọi: POST /api/v1/qr/verify {code:"A7K2P9Bf3xQz"}
        ↓
Backend Go:
   1. Verify HMAC offline (6 ký tự cuối = HMAC của 6 ký tự đầu)
      → Sai HMAC: trả 404 ngay, KHÔNG log, KHÔNG query DB
   2. Redis rate limit check (theo IP + global)
   3. Atomic UPDATE qr_tokens SET scan_count = scan_count + 1,
      first_scanned_at = COALESCE(first_scanned_at, NOW()),
      first_scan_city = COALESCE(first_scan_city, $city)
      WHERE secret_code = $1 RETURNING *
   4. INSERT scan_logs (async qua channel)
        ↓
Trả về Next.js:
   - scan_count: 1  → "✅ SẢN PHẨM CHÍNH HÃNG"
   - scan_count > 1 → Vẫn hiển thị thông tin sản phẩm +
                      "⚠️ Mã này đã được quét X lần (lần đầu: HH:mm dd/mm/yyyy tại [City]).
                       Có thể mã QR đã bị sao chép làm giả."
        ↓
[Pop-up]: "Nhập SĐT để nhận voucher YHH độc quyền"
    - Checkbox 1 (bắt buộc): "Tôi đồng ý cho Yanhee lưu trữ SĐT để xác thực sản phẩm"
    - Checkbox 2 (không tick sẵn - OPT-IN NĐ13): "Tôi đồng ý nhận thông báo khuyến mãi qua SMS/Zalo"
    - Link Privacy Policy
        ↓
POST /api/v1/qr/activate {code, phone, marketing_consent}
   + Header: Idempotency-Key: <uuid>
        ↓
Backend:
   - Validate SĐT VN (regex + đầu số hợp lệ)
   - Normalize về E.164: +84xxxxxxxxx
   - Nếu token.is_activated=false: sinh voucher YHH-XXXXXX, lưu, trả về
   - Nếu đã activated: trả voucher cũ (idempotent)
        ↓
[Màn hình cuối]: Hiển thị voucher YHH-A7K2P9 + hướng dẫn dùng
```

---

## III. DATABASE SCHEMA

### 1. `batches` - Lô sản xuất
```sql
CREATE TABLE batches (
  id            BIGSERIAL PRIMARY KEY,
  batch_code    VARCHAR(50) UNIQUE NOT NULL,        -- BATCH-2026-08
  product_name  VARCHAR(200) NOT NULL,
  total_qty     INT NOT NULL,
  created_by    BIGINT REFERENCES admin_users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  notes         TEXT
);
```

### 2. `qr_tokens` - Mã QR độc bản
```sql
CREATE TABLE qr_tokens (
  id                    BIGSERIAL PRIMARY KEY,
  batch_id              BIGINT NOT NULL REFERENCES batches(id),
  distributor_box_id    BIGINT REFERENCES distributor_boxes(id),
  secret_code           VARCHAR(16) UNIQUE NOT NULL,               -- A7K2P9Bf3xQz
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',    -- pending/activated/flagged/disabled
  scan_count            INT NOT NULL DEFAULT 0,
  first_scanned_at      TIMESTAMPTZ,
  first_scan_city       VARCHAR(100),
  first_scan_ip         INET,
  is_activated          BOOLEAN NOT NULL DEFAULT FALSE,
  activated_phone       VARCHAR(20),
  activated_voucher     VARCHAR(20),
  activated_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_qr_tokens_secret ON qr_tokens USING HASH(secret_code);
CREATE INDEX idx_qr_tokens_phone  ON qr_tokens(activated_phone);
CREATE INDEX idx_qr_tokens_box    ON qr_tokens(distributor_box_id);
CREATE INDEX idx_qr_tokens_status ON qr_tokens(status) WHERE status != 'activated';
```

### 3. `distributor_boxes` - Thùng hàng gán đại lý
```sql
CREATE TABLE distributor_boxes (
  id                BIGSERIAL PRIMARY KEY,
  box_code          VARCHAR(50) UNIQUE NOT NULL,
  batch_id          BIGINT NOT NULL REFERENCES batches(id),
  distributor_name  VARCHAR(200) NOT NULL,
  distributor_phone VARCHAR(20),
  distributor_addr  TEXT,
  total_tokens      INT NOT NULL,
  assigned_at       TIMESTAMPTZ DEFAULT NOW(),
  assigned_by       BIGINT REFERENCES admin_users(id),
  notes             TEXT
);
```

### 4. `scan_logs` - Log chi tiết (PARTITIONED theo tháng)
```sql
CREATE TABLE scan_logs (
  id           BIGSERIAL,
  token_id     BIGINT NOT NULL,
  ip_address   INET,
  user_agent   TEXT,
  city         VARCHAR(100),
  region       VARCHAR(100),
  country      VARCHAR(2),
  is_repeat    BOOLEAN NOT NULL DEFAULT FALSE,
  scanned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (scanned_at);

CREATE INDEX idx_scan_logs_token ON scan_logs(token_id, scanned_at DESC);
CREATE INDEX idx_scan_logs_ip    ON scan_logs(ip_address, scanned_at);
```

### 5. `customer_leads` - Kho SĐT
```sql
CREATE TABLE customer_leads (
  id                        BIGSERIAL PRIMARY KEY,
  phone                     VARCHAR(20) UNIQUE NOT NULL,           -- E.164
  marketing_consent         BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent_at      TIMESTAMPTZ,
  total_activated_products  INT NOT NULL DEFAULT 1,
  first_activated_at        TIMESTAMPTZ DEFAULT NOW(),
  last_activated_at         TIMESTAMPTZ DEFAULT NOW(),
  privacy_policy_version    VARCHAR(20),
  deletion_requested_at     TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);
```

### 6. `admin_users`, `audit_logs`, `data_deletion_requests`
(Xem migration SQL trong `/backend/migrations/`)

---

## IV. BẢO MẬT

### 4.1 QR Code Security (HMAC)
```
Format: 6 ký tự random (base62) + 6 ký tự HMAC-SHA256 truncated
Ví dụ:  A7K2P9 + HMAC(A7K2P9, SERVER_SECRET)[:6] = A7K2P9Bf3xQz

Verify flow:
1. Kiểm tra length = 12 → sai: 404
2. Tách random_part + hmac_part
3. Compute HMAC-SHA256(random_part, SERVER_SECRET)[:6]
4. Constant-time compare với hmac_part → sai: 404 (KHÔNG query DB)
5. Query DB by secret_code
```

### 4.2 Rate Limiting (Redis)
| Endpoint | Limit |
|---|---|
| `POST /qr/verify` per IP | 20 req/phút |
| `POST /qr/verify` global | 1000 req/giây |
| `POST /qr/activate` per IP | 10 req/phút |
| `POST /qr/activate` per phone | 3 req/ngày |
| `POST /admin/auth/login` per IP | 5 req/15 phút |

### 4.3 Admin Auth
- Password: bcrypt cost 12, min 12 ký tự
- TOTP: Google Authenticator + backup codes
- JWT: 15 phút access + 7 ngày refresh
- Session idle timeout: 30 phút
- Toàn bộ action → `audit_logs`

---

## V. API ENDPOINTS

### 5.1 Client APIs
| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/v1/qr/verify` | Body `{code}`. Response `no-store` |
| `POST` | `/api/v1/qr/activate` | Body `{code, phone, marketing_consent}`. Header `Idempotency-Key` |
| `POST` | `/api/v1/customer/deletion-request` | NĐ13: request xóa data |
| `POST` | `/api/v1/customer/deletion-confirm` | Xác nhận qua OTP |
| `POST` | `/api/v1/customer/unsubscribe` | Opt-out marketing |

### 5.2 Admin APIs (JWT + 2FA)
| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/v1/admin/auth/login` | email+password → temp_token |
| `POST` | `/api/v1/admin/auth/2fa` | temp_token + TOTP → JWT |
| `POST` | `/api/v1/admin/batches` | Tạo batch + generate tokens |
| `GET` | `/api/v1/admin/batches/:id/export` | `?format=csv\|zip` |
| `POST` | `/api/v1/admin/boxes` | Gán tokens cho box |
| `GET` | `/api/v1/admin/tokens/:code/trace` | Full trace |
| `PATCH` | `/api/v1/admin/tokens/:id/disable` | Vô hiệu hóa |
| `GET` | `/api/v1/admin/analytics/frauds` | Mã nghi giả |
| `GET` | `/api/v1/admin/analytics/geo` | Aggregate scan theo tỉnh |
| `GET` | `/api/v1/admin/customers/export` | Export CSV SĐT |
| `GET` | `/health` `/ready` | Không auth, cho monitoring |

---

## VI. TUÂN THỦ NGHỊ ĐỊNH 13/2023

| Yêu cầu | Cách xử lý |
|---|---|
| Consent rõ ràng | 2 checkbox tách bạch (lưu SĐT / marketing) |
| Privacy Policy | Trang `/privacy` với version tracking |
| Quyền xóa data | Endpoint `/customer/deletion-request` + OTP |
| Rút đồng ý marketing | Link unsubscribe trong SMS/Zalo |
| Bảo mật lưu trữ | Full-disk encryption + backup mã hóa |

---

## VII. FRAUD DETECTION (Background Job)

Cron chạy mỗi 15 phút:
```sql
UPDATE qr_tokens SET status = 'flagged'
WHERE id IN (
  SELECT token_id FROM scan_logs
  WHERE scanned_at > NOW() - INTERVAL '24 hours'
  GROUP BY token_id
  HAVING COUNT(DISTINCT city) >= 3 OR COUNT(DISTINCT ip_address) >= 10
) AND status = 'activated';
```
→ Gửi Telegram alert cho admin.

---

## VIII. DEPLOYMENT

### VPS Spec
- **4 vCPU / 8GB RAM / 160GB SSD** (~$50/tháng)
- Ubuntu 22.04 LTS
- Docker + Docker Compose

### Services
- `nginx` (reverse proxy, SSL Let's Encrypt)
- `backend-go` (Fiber API, 2 replicas)
- `frontend-next` (Next.js SSR, 2 replicas)
- `postgres`, `redis`
- `prometheus`, `grafana`, `loki`, `promtail`
- `backup-cron` (daily backup to S3-compatible)

### Backup
- `pg_dump` daily → S3-compatible
- WAL archiving → PITR 7 ngày
- Retention: daily 7d, weekly 4w, monthly 12m

---

## IX. LOCAL DEVELOPMENT

### Yêu cầu
- Docker Desktop (Windows/Mac/Linux)
- Go 1.22+ (nếu chạy backend không qua Docker)
- Node 20+ (nếu chạy frontend không qua Docker)

### Chạy nhanh
```bash
# 1. Clone repo
cd C:\laragon\www\QR

# 2. Copy env
cp .env.example .env

# 3. Start toàn bộ stack
docker-compose up -d

# 4. Chạy migrations
docker-compose exec backend /app/migrate up

# 5. Seed dữ liệu test
docker-compose exec backend /app/seed

# Truy cập:
# Frontend: http://localhost:3000
# Backend API: http://localhost:8080
# Postgres: localhost:5432 (postgres/postgres)
# Redis: localhost:6379
```

### Chạy backend không qua Docker (dev nhanh)
```bash
cd backend
go run cmd/api/main.go
```

### Chạy frontend không qua Docker
```bash
cd frontend
npm install
npm run dev
```

---

## X. CẤU TRÚC THƯ MỤC

```
QR/
├── REQUIREMENTS.md              # File này
├── README.md                    # Quick start
├── docker-compose.yml           # Full stack
├── .env.example                 # Config template
├── backend/                     # Go Fiber API
│   ├── go.mod
│   ├── Dockerfile
│   ├── cmd/
│   │   ├── api/main.go          # HTTP server
│   │   ├── migrate/main.go      # DB migration runner
│   │   └── seed/main.go         # Seed data
│   ├── internal/
│   │   ├── config/              # Load env config
│   │   ├── database/            # Postgres + Redis clients
│   │   ├── handlers/            # HTTP handlers (verify, activate, admin)
│   │   ├── middleware/          # Rate limit, auth, CORS
│   │   ├── models/              # DB models
│   │   ├── services/            # Business logic (token gen, HMAC, voucher)
│   │   └── utils/               # Phone validate, GeoIP, HMAC
│   └── migrations/              # SQL migration files
└── frontend/                    # Next.js
    ├── package.json
    ├── next.config.js
    ├── Dockerfile
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx             # Landing
    │   ├── v/[code]/page.tsx    # Verify page (SSR)
    │   ├── privacy/page.tsx     # Privacy Policy
    │   └── unsubscribe/page.tsx
    └── components/
        ├── VerifyResult.tsx
        └── ActivateForm.tsx
```

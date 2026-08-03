# 🧩 TrustQR — Kiến trúc Module

Tài liệu này chia toàn bộ hệ thống thành các **module độc lập** để dễ nâng cấp, sửa lỗi, và bàn giao cho từng người/team khác nhau.

**Nguyên tắc:**
- Mỗi module có `owner`, DB table riêng, handler riêng, frontend page riêng.
- Module chỉ giao tiếp qua **API contract** đã định — thay đổi nội bộ không breaking cross-module.
- Migration SQL đánh số tuần tự, không edit migration đã áp dụng — chỉ tạo migration mới.

---

## 📊 Sơ đồ phụ thuộc

```
          ┌──────────┐
          │  auth    │  (nền tảng - mọi admin action đi qua đây)
          └────┬─────┘
               │
    ┌──────────┼────────────────────────────┐
    │          │                            │
    ▼          ▼                            ▼
┌────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐
│companies│─│ products │──│  batches  │──│distributors│
└────────┘  └──────────┘  └─────┬─────┘  └────────────┘
                                 │
                          ┌──────┴──────┐
                          │  qr_tokens  │
                          │ (product_id,│
                          │distrib_id)  │
                          └──────┬──────┘
                                 │
                    ┌────────────┼─────────────┐
                    ▼            ▼             ▼
              ┌──────────┐ ┌──────────┐ ┌────────────┐
              │scan_logs │ │customers │ │ vouchers   │
              └──────────┘ └──────────┘ └────────────┘
                    │
                    ▼
              ┌──────────┐
              │  fraud   │  (background cron)
              └──────────┘
```

---

## 🔐 Module: `auth` — Xác thực Admin

**Mục tiêu:** Bảo vệ mọi endpoint admin.

| Layer | File |
|---|---|
| DB | `admin_users`, `admin_users.totp_enabled` (migration 001, 002) |
| Service | `backend/internal/services/auth.go` (bcrypt, TOTP, JWT) |
| Middleware | `backend/internal/middleware/auth.go` (`RequireAccessToken`) |
| Handler | `backend/internal/handlers/auth.go`, `auth_2fa.go` |
| CLI | `backend/cmd/create-admin/main.go` |
| Frontend | `frontend/app/admin/login/page.tsx`, `frontend/app/admin/settings/page.tsx` |

**API endpoints:**
- `POST /api/v1/admin/auth/login` — email+password → temp_token (nếu 2FA) hoặc access+refresh trực tiếp
- `POST /api/v1/admin/auth/2fa` — temp_token+TOTP → access+refresh
- `POST /api/v1/admin/auth/refresh` — refresh_token → access
- `GET  /api/v1/admin/auth/me`
- `GET  /api/v1/admin/auth/2fa/status`
- `POST /api/v1/admin/auth/2fa/setup` — sinh secret mới
- `POST /api/v1/admin/auth/2fa/enable` — cần TOTP code
- `POST /api/v1/admin/auth/2fa/disable` — cần TOTP code

**Bảo mật:**
- Password bcrypt cost 12
- Account lockout 5 sai → 15 phút
- Rate limit login 5/15 phút/IP
- 2FA TOTP (Google Authenticator, 30s window)
- JWT: access 15 phút, refresh 7 ngày, kind check (temp/access/refresh)

---

## 🏢 Module: `companies` — Công ty sản xuất/nhập khẩu

**Mục tiêu:** Danh mục pháp nhân được hiển thị cho khách khi quét QR.

| Layer | File |
|---|---|
| DB | `companies` (migration 005) |
| Handler | `backend/internal/handlers/companies.go` |
| Frontend | `frontend/app/admin/companies/{page,new,[id]/edit}.tsx` |
| Component | `CompanyForm.tsx`, `CompanyModal.tsx` |

**Endpoints:**
- Admin CRUD: `/api/v1/admin/companies`, `/:id` (GET/PATCH/DELETE)
- Public: `GET /api/v1/companies/:id` (không cần auth — cho verify modal)

**Xóa mềm:** nếu có product tham chiếu → deactivate (không xóa hẳn).

---

## 📦 Module: `products` — Sản phẩm

**Mục tiêu:** Định nghĩa sản phẩm với thông tin đầy đủ (mô tả, thành phần, cảnh báo, barcode/GTIN, công ty).

| Layer | File |
|---|---|
| DB | `products` (migration 003, mở rộng 004 barcode/gtin, 005 company_id) |
| Handler | `backend/internal/handlers/products.go` |
| Frontend | `frontend/app/admin/products/{page,new,[id]/edit}.tsx` |
| Component | `ProductForm.tsx`, `ProductPicker.tsx`, `ProductModal.tsx` |

**Endpoints:**
- Admin CRUD: `/api/v1/admin/products` + `/:id`
- Public: `GET /api/v1/products/:id`
- Search: `GET /api/v1/admin/products?q=xxx`

**Ràng buộc:** Không xóa hẳn nếu có batch/token dùng → deactivate.

---

## 🚚 Module: `distributors` — Đại lý

**Mục tiêu:** Danh mục đại lý mua hàng để gán tem theo dải.

| Layer | File |
|---|---|
| DB | `distributors` (migration 005) |
| Handler | `backend/internal/handlers/distributors.go` |
| Frontend | `frontend/app/admin/distributors/{page,new,[id]/edit}.tsx` |
| Component | `DistributorForm.tsx`, `DistributorPicker.tsx` |

**Endpoints:** giống pattern products (CRUD admin, public GET).

---

## 🏷️ Module: `batches` — Lô sản xuất tem QR

**Mục tiêu:** Sinh N tem QR unique, xuất file cho xưởng in, sau đó gán từng dải cho product/distributor.

| Layer | File |
|---|---|
| DB | `batches` (migration 001), `qr_tokens` (mở rộng 005 product_id, distributor_id, serial_no, is_ready), `token_assignments` (migration 005) |
| Handler | `backend/internal/handlers/admin.go` (CRUD + export), `batches_detail.go` (detail + range assign), `admin_zip.go` (QR image export) |
| Service | `services/token.go` (HMAC gen/verify), `services/qrimage.go` (PNG) |
| Frontend | `frontend/app/admin/batches/{page,new,[id]/page}.tsx` |

**Flow mới (linh động):**
1. Tạo batch **trắng** với N tem (product OPTIONAL) → sinh N mã HMAC-signed
2. Export CSV/ZIP → gửi xưởng in
3. Sau khi có hàng thực tế → mở `/admin/batches/[id]` tab **Gán dải tem**
4. Chọn dải serial (VD: 1-1000) → chọn product A + distributor X → kích hoạt
5. Có thể chia nhiều dải khác nhau trong 1 batch cho nhiều product/distributor
6. Ghi vào `token_assignments` để audit

**Endpoints:**
- `POST /api/v1/admin/batches` (tạo, qty ≤ 1.000.000)
- `GET  /api/v1/admin/batches` (list)
- `GET  /api/v1/admin/batches/:id` (detail + summary + assignments)
- `PATCH /api/v1/admin/batches/:id` (sửa code, notes)
- `GET  /api/v1/admin/batches/:id/tokens?page=1&filter=unassigned` (paginated)
- `POST /api/v1/admin/batches/:id/assign-range` (gán product/distributor cho dải)
- `GET  /api/v1/admin/batches/:id/export.csv`
- `GET  /api/v1/admin/batches/:id/export.zip` (kèm QR PNG)

**Tại sao qr_tokens.product_id nullable?**
- Batch có thể tạo trước khi biết product (in tem sẵn kho)
- Cùng 1 batch có thể chia nhiều product (linh động phân phối)
- Verify page trả `product_id = COALESCE(token.product_id, batch.product_id)`

---

## 🔍 Module: `qr` — Verify/Activate (client-facing)

**Mục tiêu:** Xử lý quét QR, hiển thị thông tin, thu SĐT + voucher.

| Layer | File |
|---|---|
| Handler | `backend/internal/handlers/qr.go` |
| Service | `services/token.go` (HMAC verify), `services/voucher.go`, `services/geo.go` |
| Frontend | `frontend/app/v/[code]/page.tsx` (SSR), `components/ActivateForm.tsx`, `GeoReporter.tsx` |

**Endpoints (public, rate-limited):**
- `POST /api/v1/qr/verify` — HMAC check → DB → return product info + status
- `POST /api/v1/qr/activate` — nhận SĐT, sinh voucher `YHH-XXXXXX`

**Bảo mật:**
- HMAC 6-char verify offline TRƯỚC khi query DB (chống brute-force)
- Rate limit: 20 verify/min/IP, 10 activate/min/IP, 3 activate/day/phone
- Atomic UPDATE cho activate (idempotent + chống race)

**Geolocation:**
- Frontend `GeoReporter` xin quyền GPS sau khi render → gọi lại `/qr/verify` với lat/lng
- Backend lưu vào `scan_logs.device_lat/lng/accuracy` (migration 004)
- Nếu user từ chối → chỉ có IP geolocation

---

## 👥 Module: `customers` — Kho SĐT + NĐ13

**Mục tiêu:** Lưu SĐT khách kích hoạt, tuân thủ NĐ13/2023.

| Layer | File |
|---|---|
| DB | `customer_leads`, `data_deletion_requests` (migration 001) |
| Handler | `backend/internal/handlers/customer.go` (deletion, unsubscribe) |
| Service | `services/sms.go` (SMS OTP stub) |
| Frontend | `frontend/app/customer/{unsubscribe,deletion}/page.tsx`, `/admin/customers/page.tsx` |

**Endpoints:**
- `POST /api/v1/customer/deletion-request` (public, gửi OTP)
- `POST /api/v1/customer/deletion-confirm` (public, xác nhận xóa)
- `POST /api/v1/customer/unsubscribe` (public, opt-out marketing)
- `GET  /api/v1/admin/customers/export?marketing_only=true` (admin CSV export)

**NĐ13 compliance:**
- Consent tách bạch (bắt buộc vs marketing opt-in)
- Version tracking `privacy_policy_version`
- Soft-delete: anonymize `phone` field, giữ aggregate
- Audit log mọi export

---

## 📊 Module: `analytics` — Phân tích & fraud

**Mục tiêu:** Dashboard, fraud detection, geo distribution.

| Layer | File |
|---|---|
| Handler | `backend/internal/handlers/admin_extra.go` |
| Service | `services/fraud.go` (cron 15 phút) |
| Frontend | `frontend/app/admin/dashboard/page.tsx`, `analytics/page.tsx` |

**Endpoints (admin):**
- `GET /api/v1/admin/analytics/summary`
- `GET /api/v1/admin/analytics/frauds`
- `GET /api/v1/admin/analytics/geo?days=30`

**Fraud rule:** trong 24h, token bị quét từ ≥3 city hoặc ≥10 IP khác nhau → status='flagged'.

---

## 📝 Module: `audit` — Nhật ký admin

**Mục tiêu:** Log mọi hành động admin để điều tra sự cố.

| Layer | File |
|---|---|
| DB | `audit_logs` (migration 001) |
| Service | `services/audit.go` |
| Handler | `backend/internal/handlers/admin_extra.go::AuditList` |
| Frontend | `frontend/app/admin/audit/page.tsx` |

**Actions ghi log:**
- `product.create/update/delete/deactivate`
- `company.create/update/delete/deactivate`
- `distributor.create/update/delete/deactivate`
- `batch.create` (via CreateBatch)
- `token_assignment` (auto qua bảng token_assignments)
- `box.assign`, `token.disable`
- `customers.export`
- `2fa.enable/disable`

---

## 🌐 Module: `geo` — IP + GPS lookup

**Mục tiêu:** Xác định vị trí khách quét QR.

| Layer | File |
|---|---|
| Service | `services/geo.go` (MaxMind GeoLite2 wrapper) |
| Frontend | `components/GeoReporter.tsx` |
| DB | `scan_logs.city/region/country/device_lat/lng/accuracy` (migration 001+004) |

**Fallback:** Nếu MMDB file không có tại `./geoip/GeoLite2-City.mmdb` → stub trả `Local`/`Unknown`.

---

## 📱 Module: `sms` — SMS/Zalo gateway

**Mục tiêu:** Gửi OTP, thông báo marketing.

| Layer | File |
|---|---|
| Interface | `services/sms.go::SMSSender` |
| Stubs | `StubSMS` (log), `FileSMS` (append file) |
| TODO Prod | `eSMSSender`, `ZNSSender` |

**Swap provider:** đổi env `SMS_PROVIDER=stub|file|esms|zns` — không đụng handler.

---

## 🔄 Module: `fraud` — Background cron

**Mục tiêu:** Tự động flag tem nghi giả.

| Layer | File |
|---|---|
| Service | `services/fraud.go` |
| Wire | `cmd/api/main.go` (`fraud.Start()`) |

**Cron:** chạy mỗi 15 phút. Query scan_logs 24h qua, aggregate theo token_id.

---

## 💾 Module: `backup` — pg_dump daily

| Layer | File |
|---|---|
| Script | `scripts/backup.sh` |
| Docker service | `docker-compose.yml::backup` (profile=prod) |

**Retention:** giữ 7 daily. Upload S3 chưa implement — thêm vào `backup.sh`.

---

## 📁 Cấu trúc mã theo module

### Backend
```
backend/
├── cmd/
│   ├── api/            # entry point, wire all handlers
│   ├── migrate/        # DB migration runner
│   ├── seed/           # demo data
│   ├── create-admin/   # admin bootstrap
│   └── test-totp/      # dev helper
└── internal/
    ├── config/         # env loader
    ├── database/       # postgres + redis
    ├── middleware/     # rate limit, auth
    ├── services/       # BUSINESS LOGIC (module-agnostic)
    │   ├── auth.go     ├── audit.go
    │   ├── token.go    ├── voucher.go
    │   ├── phone.go    ├── geo.go
    │   ├── sms.go      ├── fraud.go
    │   └── qrimage.go
    └── handlers/       # HTTP layer (module-per-file)
        ├── auth.go              # module: auth
        ├── auth_2fa.go          # module: auth
        ├── qr.go                # module: qr
        ├── customer.go          # module: customers
        ├── products.go          # module: products
        ├── companies.go         # module: companies
        ├── distributors.go      # module: distributors
        ├── admin.go             # module: batches (base)
        ├── batches_detail.go    # module: batches (detail + range)
        ├── admin_zip.go         # module: batches (QR export)
        └── admin_extra.go       # module: analytics + audit
```

### Frontend
```
frontend/
├── app/
│   ├── page.tsx        # landing (public)
│   ├── v/[code]/       # module: qr (verify)
│   ├── privacy/        # NĐ13
│   ├── customer/       # module: customers (unsub, deletion)
│   └── admin/          # module: (all admin sections)
│       ├── layout.tsx  # auth guard + AdminShell
│       ├── login/
│       ├── dashboard/
│       ├── companies/
│       ├── products/
│       ├── distributors/
│       ├── batches/
│       │   ├── page.tsx        # list
│       │   ├── new/            # create
│       │   └── [id]/           # detail + assign UI
│       ├── tokens/     # single-token trace
│       ├── analytics/
│       ├── customers/
│       ├── audit/
│       └── settings/   # 2FA toggle
├── components/
│   ├── AdminSidebar.tsx  AdminShell.tsx
│   ├── ui.tsx            # shared: PageHeader, StatCard, Alert, Spinner, EmptyState, StatusBadge
│   ├── ProductForm.tsx   ProductPicker.tsx   ProductModal.tsx  ProductNameButton.tsx
│   ├── CompanyForm.tsx   CompanyModal.tsx
│   ├── DistributorForm.tsx  DistributorPicker.tsx
│   ├── ActivateForm.tsx  # module: qr
│   └── GeoReporter.tsx   # module: geo
└── lib/
    ├── utils.ts        # cn, fmtNumber, fmtDate
    ├── api.ts          # public API client
    └── adminApi.ts     # admin API + JWT refresh
```

---

## 🚀 Hướng dẫn thêm module mới

Ví dụ: thêm module **notifications** (gửi email/push khi có fraud):

1. **DB migration**: `migrations/00X_notifications.sql` — tạo bảng `notifications`
2. **Service layer**: `internal/services/notification.go` — interface + provider stub
3. **Handler**: `internal/handlers/notifications.go` — CRUD endpoints
4. **Wire routes**: thêm vào `cmd/api/main.go`
5. **Frontend page**: `app/admin/notifications/page.tsx`
6. **Sidebar link**: sửa `components/AdminSidebar.tsx::navItems`
7. **MODULES.md**: thêm section mô tả module

**Nguyên tắc DRY:** dùng lại `ui.tsx` components (`PageHeader`, `StatCard`, `Alert`...) và pattern CRUD giống products/companies/distributors để tránh viết lại.

---

## 📋 Roadmap gợi ý

- [ ] SSO admin qua Google Workspace
- [ ] Multi-tenant (nhiều brand chung 1 hệ thống)
- [ ] Notifications module (Telegram/Slack alert)
- [ ] Voucher redeem tracking (hiện chỉ sinh mã)
- [ ] Distributor portal (đại lý tự xem)
- [ ] Mobile app SDK (thay browser)
- [ ] Import batch từ CSV có sẵn (nếu xưởng in đã có mã)

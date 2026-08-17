const API_URL = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface VerifyResult {
  valid: boolean;
  needs_activation?: boolean;
  product_id?: number;
  product_name?: string;
  company_id?: number;
  company_name?: string;
  distributor_id?: number;
  distributor_name?: string;
  batch_code?: string;
  serial_no?: number;
  scan_count: number;
  is_first_scan: boolean;
  is_ready?: boolean;
  is_activated: boolean;
  first_scanned_at?: string;
  first_scan_city?: string;
  status?: string;
  warning?: string;
  voucher?: string;
  security_code?: string;
  brand_id?: number;
  brand_name?: string;
  brand_website?: string;
  brand_logo_url?: string;
}

export interface CompanyDetail {
  id: number;
  name: string;
  tax_code?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  description?: string | null;
  logo_url?: string | null;
}

export async function fetchCompany(id: number): Promise<CompanyDetail | null> {
  const publicUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  try {
    const res = await fetch(`${publicUrl}/api/v1/companies/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as CompanyDetail;
  } catch { return null; }
}

export interface ProductImage {
  id: number;
  url: string;
}

export interface ProductDetail {
  id: number;
  name: string;
  short_description?: string | null;
  full_description?: string | null;
  ingredients?: string | null;
  usage_instructions?: string | null;
  warnings?: string | null;
  importer_company?: string | null;
  importer_address?: string | null;
  importer_phone?: string | null;
  origin_country?: string | null;
  volume?: string | null;
  license_number?: string | null;
  image_url?: string | null;
  barcode?: string | null;
  gtin?: string | null;
  images?: ProductImage[];
}

export async function fetchProduct(id: number): Promise<ProductDetail | null> {
  const publicUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  try {
    const res = await fetch(`${publicUrl}/api/v1/products/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as ProductDetail;
    if (data.images) {
      data.images = data.images.map((img) => ({ ...img, url: `${publicUrl}${img.url}` }));
    }
    return data;
  } catch { return null; }
}

// Recognizes a logged-in admin browser from the mirrored access-token cookie (set by
// lib/adminApi.ts) so the public /v/[code] desktop gate can be bypassed for developers.
// Validates the token against the backend rather than trusting the cookie's mere presence.
export async function isAdminSession(cookieHeader: string): Promise<boolean> {
  const match = cookieHeader.match(/(?:^|;\s*)trustqr_admin_access=([^;]+)/);
  if (!match) return false;
  try {
    const res = await fetch(`${API_URL}/api/v1/admin/auth/me`, {
      headers: { Authorization: `Bearer ${decodeURIComponent(match[1])}` },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface PromoBanner {
  id: number;
  url: string;
  link_url: string | null;
}

export async function fetchPromoBanners(): Promise<PromoBanner[]> {
  const publicUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  try {
    const res = await fetch(`${publicUrl}/api/v1/banners`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as PromoBanner[];
    return data.map((b) => ({ ...b, url: `${publicUrl}${b.url}` }));
  } catch { return []; }
}

export interface GS1VerifyResult {
  valid: boolean;
  gtin?: string;
  lot?: string;
  serial?: string;
  manufacture_date?: string;
  expiry_date?: string;
  product_name?: string;
  product_code?: string;
  spec?: string;
  unit?: string;
  manufacturer?: string;
  origin_country?: string;
  brand_id?: number;
  brand_name?: string;
  brand_website?: string;
  brand_logo_url?: string;
  scan_count: number;
  is_first_scan: boolean;
  first_scanned_at?: string;
  first_scan_city?: string;
  warning?: string;
}

export async function verifyGS1Code(code: string): Promise<GS1VerifyResult | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/gs1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      cache: 'no-store',
    });
    if (res.status === 404) return { valid: false, scan_count: 0, is_first_scan: false };
    if (!res.ok) return null;
    const data = (await res.json()) as GS1VerifyResult;
    if (data.brand_logo_url) {
      const publicUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      data.brand_logo_url = `${publicUrl}${data.brand_logo_url}`;
    }
    return data;
  } catch (e) {
    console.error('verifyGS1Code error:', e);
    return null;
  }
}

export interface OrderSizeOption {
  id: number;
  spec: string;
  size_spec?: string | null;
  product_line?: string | null;
}

// Client-safe (browser fetch) helpers for the "Buy more" form on /auth/[code].
export async function fetchGS1OrderSizes(code: string): Promise<OrderSizeOption[]> {
  const publicUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  try {
    const res = await fetch(`${publicUrl}/api/v1/gs1/order-sizes?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
    if (!res.ok) return [];
    return (await res.json()) as OrderSizeOption[];
  } catch {
    return [];
  }
}

export async function submitGS1Order(payload: {
  code: string;
  customer_name: string;
  phone: string;
  items: { size_spec_id: number; quantity: number }[];
}): Promise<{ ok: boolean; error?: string }> {
  const publicUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  try {
    const res = await fetch(`${publicUrl}/api/v1/gs1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let msg = 'Có lỗi xảy ra, vui lòng thử lại.';
      try {
        const d = await res.json();
        msg = d?.error || msg;
      } catch {
        // no body
      }
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Không thể kết nối máy chủ.' };
  }
}

export async function verifyCode(
  code: string,
  ip?: string,
  userAgent?: string,
  visitorId?: string,
  acceptLanguage?: string,
  referer?: string
): Promise<VerifyResult | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/qr/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ip ? { 'X-Forwarded-For': ip } : {}),
        ...(userAgent ? { 'User-Agent': userAgent } : {}),
        ...(visitorId ? { 'X-Visitor-Id': visitorId } : {}),
        ...(acceptLanguage ? { 'X-Accept-Language': acceptLanguage } : {}),
        ...(referer ? { 'X-Referer': referer } : {}),
      },
      body: JSON.stringify({ code }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as VerifyResult;
    if (data.brand_logo_url) {
      const publicUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      data.brand_logo_url = `${publicUrl}${data.brand_logo_url}`;
    }
    return data;
  } catch (e) {
    console.error('verifyCode error:', e);
    return null;
  }
}

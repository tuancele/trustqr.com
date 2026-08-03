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

export async function verifyCode(code: string, ip?: string, userAgent?: string): Promise<VerifyResult | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/qr/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ip ? { 'X-Forwarded-For': ip } : {}),
        ...(userAgent ? { 'User-Agent': userAgent } : {}),
      },
      body: JSON.stringify({ code }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as VerifyResult;
  } catch (e) {
    console.error('verifyCode error:', e);
    return null;
  }
}

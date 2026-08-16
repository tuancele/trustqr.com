'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, Loader2, Boxes, X, Upload } from 'lucide-react';
import { api, uploadForm } from '@/lib/adminApi';
import { PageHeader, Alert } from '@/components/ui';
import { CompanyPicker, type Company } from '@/components/CompanyPicker';
import { BrandPicker, type Brand } from '@/components/BrandPicker';
import { RichTextEditor } from '@/components/RichTextEditor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface ProductImageItem {
  id: number;
  url: string;
}

export interface ProductData {
  id?: number;
  name: string;
  short_description?: string | null;
  full_description?: string | null;
  ingredients?: string | null;
  usage_instructions?: string | null;
  warnings?: string | null;
  company_id?: number | null;
  brand_id?: number | null;
  importer_company?: string | null;
  importer_address?: string | null;
  importer_phone?: string | null;
  origin_country?: string | null;
  volume?: string | null;
  license_number?: string | null;
  barcode?: string | null;
  gtin?: string | null;
  product_code?: string | null;
  spec?: string | null;
  unit?: string | null;
  image_url?: string | null;
  images?: ProductImageItem[];
  is_active?: boolean;
}

export function ProductForm({ productId, initial }: { productId?: number; initial?: ProductData }) {
  const router = useRouter();
  const isEdit = !!productId;
  const [data, setData] = useState<ProductData>(initial || {
    name: '', is_active: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);

  useEffect(() => { if (initial) setData(initial); }, [initial]);

  useEffect(() => {
    if (!initial?.company_id) { setCompany(null); return; }
    api<Company>(`/api/v1/admin/companies/${initial.company_id}`).then((r) => {
      if (r.ok && r.data) setCompany(r.data);
    });
  }, [initial?.company_id]);

  useEffect(() => {
    if (!initial?.brand_id) { setBrand(null); return; }
    api<Brand>(`/api/v1/admin/brands/${initial.brand_id}`).then((r) => {
      if (r.ok && r.data) setBrand(r.data);
    });
  }, [initial?.brand_id]);

  function selectCompany(c: Company | null) {
    setCompany(c);
    setData((d) => ({
      ...d,
      company_id: c?.id ?? null,
      importer_company: c?.name ?? d.importer_company,
      importer_address: c?.address ?? d.importer_address,
      importer_phone: c?.phone ?? d.importer_phone,
    }));
  }

  function selectBrand(b: Brand | null) {
    setBrand(b);
    setData((d) => ({ ...d, brand_id: b?.id ?? null }));
  }

  const set = <K extends keyof ProductData>(k: K, v: ProductData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    const r = isEdit
      ? await api(`/api/v1/admin/products/${productId}`, { method: 'PATCH', body: JSON.stringify(data) })
      : await api('/api/v1/admin/products', { method: 'POST', body: JSON.stringify(data) });
    setLoading(false);
    if (!r.ok) { setError(r.error || 'Lỗi'); return; }
    router.push('/admin/products');
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        icon={Boxes}
        title={isEdit ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}
        subtitle="Thông tin sản phẩm sẽ hiển thị khi khách quét QR"
      />

      <form onSubmit={submit} className="space-y-4">
        {/* Basic info */}
        <Section title="Thông tin cơ bản">
          <Field label="Tên sản phẩm" required>
            <input
              value={data.name} onChange={(e) => set('name', e.target.value)}
              required autoFocus className="form-input"
              placeholder="VD: Sản phẩm mẫu 10g"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Đóng gói / Dung tích">
              <input
                value={data.volume || ''} onChange={(e) => set('volume', e.target.value)}
                className="form-input" placeholder="10g, 50ml..."
              />
            </Field>
            <Field label="Xuất xứ">
              <input
                value={data.origin_country || ''} onChange={(e) => set('origin_country', e.target.value)}
                className="form-input" placeholder="Thái Lan, Hàn Quốc..."
              />
            </Field>
          </div>

          <Field label="Mô tả ngắn">
            <textarea
              value={data.short_description || ''} onChange={(e) => set('short_description', e.target.value)}
              className="form-input min-h-[70px]"
              placeholder="1-2 dòng giới thiệu sản phẩm"
            />
          </Field>

          <Field label="Mô tả chi tiết">
            <RichTextEditor
              value={data.full_description || ''}
              onChange={(html) => set('full_description', html)}
              placeholder="Thông tin đầy đủ về công dụng, ưu điểm..."
            />
          </Field>

        </Section>

        {/* Brand */}
        <Section title="Thương hiệu">
          <Field label="Thương hiệu">
            <BrandPicker value={brand} onChange={selectBrand} />
          </Field>
          <p className="text-xs text-gray-500 -mt-2">
            Logo thương hiệu hiển thị dưới banner khuyến mãi ở trang khách quét QR.
          </p>
        </Section>

        {/* Product image slider */}
        {isEdit && (
          <Section title="Ảnh sản phẩm (hiển thị dạng slider khi khách quét QR)">
            <ProductImages productId={productId!} initialImages={initial?.images || []} />
          </Section>
        )}

        {/* Ingredients & usage */}
        <Section title="Thành phần & hướng dẫn">
          <Field label="Thành phần">
            <textarea
              value={data.ingredients || ''} onChange={(e) => set('ingredients', e.target.value)}
              className="form-input min-h-[80px]"
              placeholder="VD: Niacinamide, Vitamin C, Hyaluronic Acid..."
            />
          </Field>
          <Field label="Hướng dẫn sử dụng">
            <textarea
              value={data.usage_instructions || ''} onChange={(e) => set('usage_instructions', e.target.value)}
              className="form-input min-h-[80px]"
              placeholder="VD: Thoa 2 lần/ngày sáng và tối..."
            />
          </Field>
          <Field label="Cảnh báo / lưu ý">
            <textarea
              value={data.warnings || ''} onChange={(e) => set('warnings', e.target.value)}
              className="form-input min-h-[80px]"
              placeholder="VD: Không dùng cho da tổn thương hở..."
            />
          </Field>
        </Section>

        {/* Importer */}
        <Section title="Nhà nhập khẩu / phân phối">
          <Field label="Công ty">
            <CompanyPicker value={company} onChange={selectCompany} />
          </Field>
          <Field label="Địa chỉ">
            <input
              value={data.importer_address || ''} onChange={(e) => set('importer_address', e.target.value)}
              className="form-input" placeholder="Số nhà, Đường, Quận, Thành phố"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Điện thoại">
              <input
                value={data.importer_phone || ''} onChange={(e) => set('importer_phone', e.target.value)}
                className="form-input" placeholder="1900-xxxx"
              />
            </Field>
            <Field label="Số công bố (CBMP / TBYT)">
              <input
                value={data.license_number || ''} onChange={(e) => set('license_number', e.target.value)}
                className="form-input font-mono" placeholder="CBMP-2026/YH-001"
              />
            </Field>
          </div>
        </Section>

        {/* Identifiers */}
        <Section title="Mã định danh sản phẩm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Barcode (mã vạch)">
              <input
                value={data.barcode || ''} onChange={(e) => set('barcode', e.target.value)}
                className="form-input font-mono" placeholder="8934567890123"
              />
            </Field>
            <Field label="GTIN (Global Trade Item Number)">
              <input
                value={data.gtin || ''} onChange={(e) => set('gtin', e.target.value)}
                className="form-input font-mono" placeholder="00614141999996"
              />
            </Field>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Barcode dùng cho POS truyền thống, GTIN dùng cho chuỗi cung ứng quốc tế (GS1). Cả 2 có thể để trống nếu chưa có.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Mã sản phẩm">
              <input
                value={data.product_code || ''} onChange={(e) => set('product_code', e.target.value)}
                className="form-input font-mono" placeholder="C010400955"
              />
            </Field>
            <Field label="Quy cách">
              <input
                value={data.spec || ''} onChange={(e) => set('spec', e.target.value)}
                className="form-input font-mono" placeholder="FXS4508"
              />
            </Field>
            <Field label="Đơn vị">
              <input
                value={data.unit || ''} onChange={(e) => set('unit', e.target.value)}
                className="form-input" placeholder="Cái"
              />
            </Field>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            3 trường này cùng GTIN ở trên dùng để sinh mã GS1 DataMatrix (module chống giả riêng, xem ở trang chi tiết lô).
          </p>
        </Section>

        {/* Status */}
        <Section title="Trạng thái">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox" checked={data.is_active !== false}
              onChange={(e) => set('is_active', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-gov-500 focus:ring-gov-500"
            />
            <span className="text-sm text-gray-700">
              Đang hoạt động (có thể chọn khi tạo lô mới)
            </span>
          </label>
        </Section>

        {error && <Alert kind="danger">{error}</Alert>}

        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {loading ? 'Đang lưu...' : (isEdit ? 'Cập nhật' : 'Thêm sản phẩm')}
          </button>
          <Link href="/admin/products" className="btn-secondary">
            <X className="w-4 h-4" /> Hủy
          </Link>
        </div>
      </form>
    </div>
  );
}

const MAX_PRODUCT_IMAGES = 12;

function ProductImages({ productId, initialImages }: { productId: number; initialImages: ProductImageItem[] }) {
  const [images, setImages] = useState<ProductImageItem[]>(initialImages);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setUploading(true);
    setErr(null);
    let slotsLeft = MAX_PRODUCT_IMAGES - images.length;
    const skipped = Math.max(0, files.length - slotsLeft);
    const uploaded: ProductImageItem[] = [];
    let uploadErr: string | null = null;
    for (const file of files) {
      if (slotsLeft <= 0) break;
      const fd = new FormData();
      fd.append('file', file);
      const r = await uploadForm<ProductImageItem>(`/api/v1/admin/products/${productId}/images`, fd);
      if (r.ok && r.data) {
        uploaded.push(r.data as ProductImageItem);
        slotsLeft--;
      } else {
        uploadErr = r.error || 'Tải ảnh thất bại';
        break;
      }
    }
    if (uploaded.length > 0) setImages((prev) => [...prev, ...uploaded]);
    setUploading(false);
    if (uploadErr) setErr(uploadErr);
    else if (skipped > 0) setErr(`Đã tải ${uploaded.length} ảnh, bỏ qua ${skipped} ảnh do vượt quá tối đa ${MAX_PRODUCT_IMAGES} ảnh.`);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleDelete(imageId: number) {
    if (!confirm('Xóa ảnh này?')) return;
    const r = await api(`/api/v1/admin/products/${productId}/images/${imageId}`, { method: 'DELETE' });
    if (r.ok) setImages((prev) => prev.filter((i) => i.id !== imageId));
    else alert('Lỗi: ' + r.error);
  }

  return (
    <div className="space-y-3">
      {err && <Alert kind="danger">{err}</Alert>}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {images.map((img) => (
          <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
            <img src={`${API_URL}${img.url}`} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => handleDelete(img.id)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {images.length < MAX_PRODUCT_IMAGES && (
          <label className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-gov-400 hover:text-gov-500 cursor-pointer transition-colors">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            <span className="text-[10px]">Thêm ảnh</span>
            <input
              ref={fileRef} type="file" accept=".png,.jpg,.jpeg" multiple
              onChange={handleUpload} className="hidden" disabled={uploading}
            />
          </label>
        )}
      </div>
      <p className="text-xs text-gray-400">PNG/JPG, tối đa 8MB/ảnh, tối đa 12 ảnh. Ảnh hiển thị dạng slider ở trang khách quét QR.</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

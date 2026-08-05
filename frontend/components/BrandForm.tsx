'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Tag, Save, Loader2, X, Upload } from 'lucide-react';
import { api, uploadForm } from '@/lib/adminApi';
import { PageHeader, Alert } from '@/components/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface BrandData {
  id?: number;
  name: string;
  website?: string | null;
  has_logo?: boolean;
  is_active?: boolean;
}

export function BrandForm({ brandId, initial }: { brandId?: number; initial?: BrandData }) {
  const router = useRouter();
  const isEdit = !!brandId;
  const [d, setD] = useState<BrandData>(initial || { name: '', is_active: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (initial) setD(initial); }, [initial]);
  const set = <K extends keyof BrandData>(k: K, v: BrandData[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    const r = isEdit
      ? await api(`/api/v1/admin/brands/${brandId}`, { method: 'PATCH', body: JSON.stringify(d) })
      : await api<{ id: number }>('/api/v1/admin/brands', { method: 'POST', body: JSON.stringify(d) });
    setLoading(false);
    if (!r.ok) { setError(r.error || 'Lỗi'); return; }
    if (isEdit) router.push('/admin/brands');
    else router.push(`/admin/brands/${(r.data as any).id}/edit`);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader icon={Tag} title={isEdit ? 'Sửa thương hiệu' : 'Thêm thương hiệu'}
        subtitle="Logo thương hiệu hiển thị dưới banner khuyến mãi khi khách quét QR" />
      <form onSubmit={submit} className="space-y-4">
        <div className="card p-5 space-y-4">
          <Field label="Tên thương hiệu" required>
            <input value={d.name} onChange={(e) => set('name', e.target.value)}
              required autoFocus className="form-input" placeholder="VD: Yanhee" />
          </Field>
          <Field label="Website">
            <input type="url" value={d.website || ''} onChange={(e) => set('website', e.target.value)}
              className="form-input" placeholder="https://..." />
          </Field>
          <label className="flex items-center gap-2 text-sm pt-2 border-t border-gray-100 cursor-pointer">
            <input type="checkbox" checked={d.is_active !== false}
              onChange={(e) => set('is_active', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-gov-500 focus:ring-gov-500" />
            <span>Đang hoạt động</span>
          </label>
        </div>

        {isEdit && <BrandLogo brandId={brandId!} hasLogo={!!d.has_logo} onUploaded={() => set('has_logo', true)} />}

        {error && <Alert kind="danger">{error}</Alert>}
        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Cập nhật' : 'Thêm thương hiệu'}
          </button>
          <Link href="/admin/brands" className="btn-secondary"><X className="w-4 h-4" /> Hủy</Link>
        </div>
      </form>
    </div>
  );
}

function BrandLogo({ brandId, hasLogo, onUploaded }: { brandId: number; hasLogo: boolean; onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    const fd = new FormData();
    fd.append('file', file);
    const r = await uploadForm(`/api/v1/admin/brands/${brandId}/logo`, fd);
    setUploading(false);
    if (r.ok) { onUploaded(); setNonce((n) => n + 1); }
    else setErr(r.error || 'Tải logo thất bại');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="card p-5 space-y-3">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Logo thương hiệu</h2>
      {err && <Alert kind="danger">{err}</Alert>}
      <div className="flex items-center gap-4">
        {hasLogo && (
          <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
            <img src={`${API_URL}/api/v1/brands/${brandId}/logo/file?v=${nonce}`} alt="" className="max-w-full max-h-full object-contain" />
          </div>
        )}
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-gov-400 hover:text-gov-500 cursor-pointer transition-colors">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {hasLogo ? 'Thay logo' : 'Tải logo lên'}
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>
      <p className="text-xs text-gray-400">PNG/JPG, tối đa 8MB. Logo hiển thị dưới banner khuyến mãi ở trang khách quét QR.</p>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">{label} {required && <span className="text-red-500">*</span>}</label>
      {children}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Save, Loader2, X } from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Alert } from '@/components/ui';

export interface CompanyData {
  id?: number;
  name: string;
  tax_code?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  description?: string | null;
  logo_url?: string | null;
  is_active?: boolean;
}

export function CompanyForm({ companyId, initial }: { companyId?: number; initial?: CompanyData }) {
  const router = useRouter();
  const isEdit = !!companyId;
  const [d, setD] = useState<CompanyData>(initial || { name: '', is_active: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (initial) setD(initial); }, [initial]);
  const set = <K extends keyof CompanyData>(k: K, v: CompanyData[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    const r = isEdit
      ? await api(`/api/v1/admin/companies/${companyId}`, { method: 'PATCH', body: JSON.stringify(d) })
      : await api('/api/v1/admin/companies', { method: 'POST', body: JSON.stringify(d) });
    setLoading(false);
    if (!r.ok) { setError(r.error || 'Lỗi'); return; }
    router.push('/admin/companies');
  }

  return (
    <div className="max-w-3xl">
      <PageHeader icon={Building2} title={isEdit ? 'Sửa công ty' : 'Thêm công ty'}
        subtitle="Thông tin công ty sẽ hiển thị cho khách xem khi quét QR" />
      <form onSubmit={submit} className="space-y-4">
        <div className="card p-5 space-y-4">
          <Field label="Tên công ty" required>
            <input value={d.name} onChange={(e) => set('name', e.target.value)}
              required autoFocus className="form-input" placeholder="VD: Công ty TNHH ABC Việt Nam" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Mã số thuế">
              <input value={d.tax_code || ''} onChange={(e) => set('tax_code', e.target.value)}
                className="form-input font-mono" placeholder="0313456789" />
            </Field>
            <Field label="Điện thoại">
              <input value={d.phone || ''} onChange={(e) => set('phone', e.target.value)}
                className="form-input" placeholder="1900-xxxx" />
            </Field>
          </div>
          <Field label="Địa chỉ trụ sở">
            <input value={d.address || ''} onChange={(e) => set('address', e.target.value)}
              className="form-input" placeholder="Số nhà, Đường, Quận, Thành phố" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Email">
              <input type="email" value={d.email || ''} onChange={(e) => set('email', e.target.value)}
                className="form-input" placeholder="info@..." />
            </Field>
            <Field label="Website">
              <input type="url" value={d.website || ''} onChange={(e) => set('website', e.target.value)}
                className="form-input" placeholder="https://..." />
            </Field>
          </div>
          <Field label="Giới thiệu ngắn">
            <textarea value={d.description || ''} onChange={(e) => set('description', e.target.value)}
              className="form-input min-h-[100px]" placeholder="1-2 đoạn giới thiệu về công ty..." />
          </Field>
          <Field label="URL logo">
            <input type="url" value={d.logo_url || ''} onChange={(e) => set('logo_url', e.target.value)}
              className="form-input" placeholder="https://..." />
          </Field>
          <label className="flex items-center gap-2 text-sm pt-2 border-t border-gray-100 cursor-pointer">
            <input type="checkbox" checked={d.is_active !== false}
              onChange={(e) => set('is_active', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-gov-500 focus:ring-gov-500" />
            <span>Đang hoạt động</span>
          </label>
        </div>
        {error && <Alert kind="danger">{error}</Alert>}
        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Cập nhật' : 'Thêm công ty'}
          </button>
          <Link href="/admin/companies" className="btn-secondary"><X className="w-4 h-4" /> Hủy</Link>
        </div>
      </form>
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

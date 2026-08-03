'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Truck, Save, Loader2, X } from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Alert } from '@/components/ui';

export interface DistributorData {
  id?: number;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export function DistributorForm({ distributorId, initial }: { distributorId?: number; initial?: DistributorData }) {
  const router = useRouter();
  const isEdit = !!distributorId;
  const [d, setD] = useState<DistributorData>(initial || { name: '', is_active: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (initial) setD(initial); }, [initial]);
  const set = <K extends keyof DistributorData>(k: K, v: DistributorData[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    const r = isEdit
      ? await api(`/api/v1/admin/distributors/${distributorId}`, { method: 'PATCH', body: JSON.stringify(d) })
      : await api('/api/v1/admin/distributors', { method: 'POST', body: JSON.stringify(d) });
    setLoading(false);
    if (!r.ok) { setError(r.error || 'Lỗi'); return; }
    router.push('/admin/distributors');
  }

  return (
    <div className="max-w-3xl">
      <PageHeader icon={Truck} title={isEdit ? 'Sửa đại lý' : 'Thêm đại lý'}
        subtitle="Đại lý mua hàng, dùng để gán tem QR theo dải" />
      <form onSubmit={submit} className="space-y-4">
        <div className="card p-5 space-y-4">
          <Field label="Tên đại lý" required>
            <input value={d.name} onChange={(e) => set('name', e.target.value)}
              required autoFocus className="form-input" placeholder="VD: Đại lý Miền Bắc" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Người liên hệ">
              <input value={d.contact_name || ''} onChange={(e) => set('contact_name', e.target.value)}
                className="form-input" placeholder="Anh Nguyễn Văn A" />
            </Field>
            <Field label="Điện thoại">
              <input value={d.phone || ''} onChange={(e) => set('phone', e.target.value)}
                className="form-input" placeholder="0912345678" />
            </Field>
          </div>
          <Field label="Email">
            <input type="email" value={d.email || ''} onChange={(e) => set('email', e.target.value)}
              className="form-input" placeholder="contact@..." />
          </Field>
          <Field label="Địa chỉ">
            <input value={d.address || ''} onChange={(e) => set('address', e.target.value)}
              className="form-input" placeholder="Số nhà, Đường" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tỉnh / Thành phố">
              <input value={d.city || ''} onChange={(e) => set('city', e.target.value)}
                className="form-input" placeholder="Hà Nội" />
            </Field>
            <Field label="Quận / Huyện">
              <input value={d.district || ''} onChange={(e) => set('district', e.target.value)}
                className="form-input" placeholder="Cầu Giấy" />
            </Field>
          </div>
          <Field label="Ghi chú">
            <textarea value={d.notes || ''} onChange={(e) => set('notes', e.target.value)}
              className="form-input min-h-[80px]" />
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
            {isEdit ? 'Cập nhật' : 'Thêm đại lý'}
          </button>
          <Link href="/admin/distributors" className="btn-secondary"><X className="w-4 h-4" /> Hủy</Link>
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

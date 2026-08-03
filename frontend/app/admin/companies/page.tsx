'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Plus, Search, Edit3, Trash2, XCircle, Globe, Phone } from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Spinner, EmptyState } from '@/components/ui';
import { fmtDateShort } from '@/lib/utils';

interface Company {
  id: number;
  name: string;
  tax_code: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  is_active: boolean;
  created_at: string;
  product_count: number;
}

export default function CompaniesPage() {
  const [items, setItems] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (includeInactive) params.set('include_inactive', 'true');
    api<Company[]>(`/api/v1/admin/companies?${params}`).then((r) => {
      if (r.ok && r.data) setItems(r.data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, includeInactive]);

  async function del(c: Company) {
    const msg = c.product_count > 0
      ? `Công ty đang có ${c.product_count} sản phẩm — sẽ chuyển sang NGƯNG (không xóa hẳn). Xác nhận?`
      : `Xóa vĩnh viễn công ty "${c.name}"?`;
    if (!confirm(msg)) return;
    const r = await api(`/api/v1/admin/companies/${c.id}`, { method: 'DELETE' });
    if (r.ok) load(); else alert('Lỗi: ' + r.error);
  }

  return (
    <div>
      <PageHeader
        icon={Building2}
        title="Công ty"
        subtitle="Danh mục công ty sản xuất / nhập khẩu — hiển thị khi khách quét QR"
        actions={<Link href="/admin/companies/new" className="btn-primary"><Plus className="w-4 h-4" /> Thêm công ty</Link>}
      />

      <div className="card p-4 mb-4 flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên hoặc mã số thuế..." className="form-input pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-gov-500 focus:ring-gov-500" />
          Bao gồm đã ngưng
        </label>
      </div>

      {loading ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon={Building2} title={q ? 'Không tìm thấy công ty' : 'Chưa có công ty'}
          description="Thêm công ty để gán vào sản phẩm."
          action={<Link href="/admin/companies/new" className="btn-primary"><Plus className="w-4 h-4" /> Thêm công ty</Link>} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Tên công ty</th>
                  <th className="px-4 py-3">Mã số thuế</th>
                  <th className="px-4 py-3">Liên hệ</th>
                  <th className="px-4 py-3 text-right">Số SP</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{c.id}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{c.tax_code || <em className="text-gray-400">—</em>}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {c.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</div>}
                      {c.website && <div className="flex items-center gap-1"><Globe className="w-3 h-3" /> {c.website}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{c.product_count}</td>
                    <td className="px-4 py-3">
                      {c.is_active ? <span className="badge-success">Đang hoạt động</span> :
                        <span className="badge-muted"><XCircle className="w-3 h-3" /> Đã ngưng</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDateShort(c.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/admin/companies/${c.id}/edit`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gov-50 text-gov-700 hover:bg-gov-100 text-xs font-medium">
                          <Edit3 className="w-3 h-3" /> Sửa
                        </Link>
                        <button onClick={() => del(c)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 text-xs font-medium">
                          <Trash2 className="w-3 h-3" /> Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

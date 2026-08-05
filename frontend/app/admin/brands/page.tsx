'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Tag, Plus, Search, Edit3, Trash2, XCircle, Globe } from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Spinner, EmptyState } from '@/components/ui';
import { fmtDateShort } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface Brand {
  id: number;
  name: string;
  website: string | null;
  has_logo: boolean;
  is_active: boolean;
  created_at: string;
  product_count: number;
}

export default function BrandsPage() {
  const [items, setItems] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (includeInactive) params.set('include_inactive', 'true');
    api<Brand[]>(`/api/v1/admin/brands?${params}`).then((r) => {
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

  async function del(b: Brand) {
    const msg = b.product_count > 0
      ? `Thương hiệu đang có ${b.product_count} sản phẩm — sẽ chuyển sang NGƯNG (không xóa hẳn). Xác nhận?`
      : `Xóa vĩnh viễn thương hiệu "${b.name}"?`;
    if (!confirm(msg)) return;
    const r = await api(`/api/v1/admin/brands/${b.id}`, { method: 'DELETE' });
    if (r.ok) load(); else alert('Lỗi: ' + r.error);
  }

  return (
    <div>
      <PageHeader
        icon={Tag}
        title="Thương hiệu"
        subtitle="Logo thương hiệu hiển thị dưới banner khuyến mãi khi khách quét QR"
        actions={<Link href="/admin/brands/new" className="btn-primary"><Plus className="w-4 h-4" /> Thêm thương hiệu</Link>}
      />

      <div className="card p-4 mb-4 flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên..." className="form-input pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-gov-500 focus:ring-gov-500" />
          Bao gồm đã ngưng
        </label>
      </div>

      {loading ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon={Tag} title={q ? 'Không tìm thấy thương hiệu' : 'Chưa có thương hiệu'}
          description="Thêm thương hiệu để gán vào sản phẩm."
          action={<Link href="/admin/brands/new" className="btn-primary"><Plus className="w-4 h-4" /> Thêm thương hiệu</Link>} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <th className="px-4 py-3">Logo</th>
                  <th className="px-4 py-3">Tên thương hiệu</th>
                  <th className="px-4 py-3">Website</th>
                  <th className="px-4 py-3 text-right">Số SP</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {b.has_logo ? (
                        <div className="w-9 h-9 rounded border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                          <img src={`${API_URL}/api/v1/brands/${b.id}/logo/file`} alt="" className="max-w-full max-h-full object-contain" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded border border-dashed border-gray-200 flex items-center justify-center text-gray-300">
                          <Tag className="w-4 h-4" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{b.name}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {b.website && <div className="flex items-center gap-1"><Globe className="w-3 h-3" /> {b.website}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{b.product_count}</td>
                    <td className="px-4 py-3">
                      {b.is_active ? <span className="badge-success">Đang hoạt động</span> :
                        <span className="badge-muted"><XCircle className="w-3 h-3" /> Đã ngưng</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDateShort(b.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/admin/brands/${b.id}/edit`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gov-50 text-gov-700 hover:bg-gov-100 text-xs font-medium">
                          <Edit3 className="w-3 h-3" /> Sửa
                        </Link>
                        <button onClick={() => del(b)}
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

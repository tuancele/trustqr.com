'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Truck, Plus, Search, Edit3, Trash2, XCircle, Phone, MapPin } from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Spinner, EmptyState } from '@/components/ui';
import { fmtDateShort, fmtNumber } from '@/lib/utils';

interface Distributor {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  city: string | null;
  is_active: boolean;
  created_at: string;
  token_count: number;
}

export default function DistributorsPage() {
  const [items, setItems] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (includeInactive) params.set('include_inactive', 'true');
    api<Distributor[]>(`/api/v1/admin/distributors?${params}`).then((r) => {
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

  async function del(x: Distributor) {
    const msg = x.token_count > 0
      ? `Đại lý này có ${fmtNumber(x.token_count)} tem đã gán — sẽ chuyển sang NGƯNG. Xác nhận?`
      : `Xóa vĩnh viễn đại lý "${x.name}"?`;
    if (!confirm(msg)) return;
    const r = await api(`/api/v1/admin/distributors/${x.id}`, { method: 'DELETE' });
    if (r.ok) load(); else alert('Lỗi: ' + r.error);
  }

  return (
    <div>
      <PageHeader
        icon={Truck}
        title="Đại lý mua hàng"
        subtitle="Danh mục đại lý — dùng để gán tem theo dải khi phân phối"
        actions={<Link href="/admin/distributors/new" className="btn-primary"><Plus className="w-4 h-4" /> Thêm đại lý</Link>}
      />

      <div className="card p-4 mb-4 flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên, người liên hệ, SĐT..." className="form-input pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-gov-500 focus:ring-gov-500" />
          Bao gồm đã ngưng
        </label>
      </div>

      {loading ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon={Truck} title={q ? 'Không tìm thấy đại lý' : 'Chưa có đại lý'}
          description="Thêm đại lý để gán tem theo dải khi bàn giao lô hàng."
          action={<Link href="/admin/distributors/new" className="btn-primary"><Plus className="w-4 h-4" /> Thêm đại lý</Link>} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Tên đại lý</th>
                  <th className="px-4 py-3">Người liên hệ</th>
                  <th className="px-4 py-3">SĐT</th>
                  <th className="px-4 py-3">Khu vực</th>
                  <th className="px-4 py-3 text-right">Số tem</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{d.id}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{d.name}</td>
                    <td className="px-4 py-3">{d.contact_name || <em className="text-gray-400">—</em>}</td>
                    <td className="px-4 py-3 text-xs">
                      {d.phone ? <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" />{d.phone}</span> : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {d.city ? <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 text-gray-400" />{d.city}</span> : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{fmtNumber(d.token_count)}</td>
                    <td className="px-4 py-3">
                      {d.is_active ? <span className="badge-success">Đang hoạt động</span> :
                        <span className="badge-muted"><XCircle className="w-3 h-3" /> Đã ngưng</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDateShort(d.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/admin/distributors/${d.id}/edit`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gov-50 text-gov-700 hover:bg-gov-100 text-xs font-medium">
                          <Edit3 className="w-3 h-3" /> Sửa
                        </Link>
                        <button onClick={() => del(d)}
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

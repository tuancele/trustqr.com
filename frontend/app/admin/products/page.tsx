'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Boxes, Plus, Search, Edit3, Trash2, Package, XCircle } from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Spinner, EmptyState, Alert } from '@/components/ui';
import { fmtDateShort } from '@/lib/utils';

interface Product {
  id: number;
  name: string;
  short_description: string | null;
  importer_company: string | null;
  volume: string | null;
  license_number: string | null;
  is_active: boolean;
  created_at: string;
  batch_count: number;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (includeInactive) params.set('include_inactive', 'true');
    api<Product[]>(`/api/v1/admin/products?${params}`).then((r) => {
      if (r.ok && r.data) setProducts(r.data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, includeInactive]);

  async function del(p: Product) {
    const msg = p.batch_count > 0
      ? `Sản phẩm này đang được ${p.batch_count} lô sử dụng. Sẽ chuyển sang trạng thái NGƯNG (không xóa hẳn). Xác nhận?`
      : `Xóa vĩnh viễn sản phẩm "${p.name}"?`;
    if (!confirm(msg)) return;
    const r = await api(`/api/v1/admin/products/${p.id}`, { method: 'DELETE' });
    if (r.ok) load();
    else alert('Lỗi: ' + r.error);
  }

  return (
    <div>
      <PageHeader
        icon={Boxes}
        title="Sản phẩm"
        subtitle="Danh mục sản phẩm — dùng khi tạo lô tem QR"
        actions={
          <Link href="/admin/products/new" className="btn-primary">
            <Plus className="w-4 h-4" /> Thêm sản phẩm
          </Link>
        }
      />

      {/* Search + filter */}
      <div className="card p-4 mb-4 flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên sản phẩm hoặc công ty nhập khẩu..."
            className="form-input pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox" checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-gov-500 focus:ring-gov-500"
          />
          Bao gồm đã ngưng
        </label>
      </div>

      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={q ? 'Không tìm thấy sản phẩm nào' : 'Chưa có sản phẩm'}
          description="Tạo sản phẩm đầu tiên để có thể gắn với các lô tem QR."
          action={<Link href="/admin/products/new" className="btn-primary"><Plus className="w-4 h-4" /> Thêm sản phẩm</Link>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Tên sản phẩm</th>
                  <th className="px-4 py-3">Công ty nhập khẩu</th>
                  <th className="px-4 py-3">Số công bố</th>
                  <th className="px-4 py-3 text-right">Số lô</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{p.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{p.name}</div>
                      {p.short_description && <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{p.short_description}</div>}
                      {p.volume && <div className="text-[11px] text-gov-600 mt-0.5">Đóng gói: {p.volume}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{p.importer_company || <em className="text-gray-400">—</em>}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.license_number || <em className="text-gray-400">—</em>}</td>
                    <td className="px-4 py-3 text-right font-medium">{p.batch_count}</td>
                    <td className="px-4 py-3">
                      {p.is_active ? (
                        <span className="badge-success">Đang hoạt động</span>
                      ) : (
                        <span className="badge-muted"><XCircle className="w-3 h-3" /> Đã ngưng</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDateShort(p.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Link
                          href={`/admin/products/${p.id}/edit`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gov-50 text-gov-700 hover:bg-gov-100 text-xs font-medium transition-colors"
                        >
                          <Edit3 className="w-3 h-3" /> Sửa
                        </Link>
                        <button
                          onClick={() => del(p)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 text-xs font-medium transition-colors"
                        >
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

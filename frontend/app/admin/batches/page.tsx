'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, PackagePlus, Download, FileArchive, Inbox, Eye } from 'lucide-react';
import { api, download } from '@/lib/adminApi';
import { PageHeader, Spinner, EmptyState } from '@/components/ui';
import { fmtNumber, fmtDateShort } from '@/lib/utils';

interface Batch {
  id: number;
  batch_code: string;
  product_name: string;
  total_qty: number;
  activated: number;
  total_scans: number;
  assigned_tokens: number;
  created_at: string;
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Batch[]>('/api/v1/admin/batches').then((r) => {
      if (r.ok && r.data) setBatches(r.data);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <PageHeader
        icon={Package}
        title="Lô sản xuất"
        subtitle="Danh sách các lô QR đã sinh trong hệ thống"
        actions={
          <Link href="/admin/batches/new" className="btn-primary">
            <PackagePlus className="w-4 h-4" /> Tạo lô mới
          </Link>
        }
      />

      {loading ? (
        <Spinner />
      ) : batches.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Chưa có lô sản xuất nào"
          description="Tạo lô đầu tiên để bắt đầu sinh tem QR cho sản phẩm."
          action={<Link href="/admin/batches/new" className="btn-primary"><PackagePlus className="w-4 h-4" /> Tạo lô đầu tiên</Link>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Mã lô</th>
                  <th className="px-4 py-3">Sản phẩm mặc định</th>
                  <th className="px-4 py-3 text-right">Số lượng</th>
                  <th className="px-4 py-3 text-right">Đã gán SP</th>
                  <th className="px-4 py-3 text-right">Kích hoạt</th>
                  <th className="px-4 py-3 text-right">Lượt quét</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                  <th className="px-4 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {batches.map((b) => {
                  const rate = b.total_qty > 0 ? Math.round((b.activated / b.total_qty) * 100) : 0;
                  const assignedRate = b.total_qty > 0 ? Math.round((b.assigned_tokens / b.total_qty) * 100) : 0;
                  return (
                    <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500">{b.id}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-gov-700">{b.batch_code}</td>
                      <td className="px-4 py-3 text-gray-900">
                        {b.product_name || <em className="text-gold-600 text-xs">Chưa gán (đa sản phẩm)</em>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{fmtNumber(b.total_qty)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-emerald-700 font-medium">{fmtNumber(b.assigned_tokens)}</span>
                        <span className="text-xs text-gray-400 ml-1">({assignedRate}%)</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-purple-700 font-medium">{fmtNumber(b.activated)}</span>
                        <span className="text-xs text-gray-400 ml-1">({rate}%)</span>
                      </td>
                      <td className="px-4 py-3 text-right text-cyan-700 font-medium">{fmtNumber(b.total_scans)}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtDateShort(b.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <Link
                            href={`/admin/batches/${b.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gov-500 text-white hover:bg-gov-600 text-xs font-medium transition-colors"
                            title="Xem chi tiết + gán dải"
                          >
                            <Eye className="w-3 h-3" /> Chi tiết
                          </Link>
                          <button
                            onClick={() => download(`/api/v1/admin/batches/${b.id}/export.csv`, `batch_${b.id}.csv`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gov-50 text-gov-700 hover:bg-gov-100 text-xs font-medium transition-colors"
                            title="Export CSV"
                          >
                            <Download className="w-3 h-3" /> CSV
                          </button>
                          <button
                            onClick={() => download(`/api/v1/admin/batches/${b.id}/export.zip`, `batch_${b.id}_qr.zip`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gold-50 text-gold-700 hover:bg-gold-100 text-xs font-medium transition-colors"
                            title="Export ZIP (kèm ảnh QR)"
                          >
                            <FileArchive className="w-3 h-3" /> ZIP
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ticket, Search, Phone, User, Package, ScanBarcode, QrCode, Copy, Check } from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Spinner, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';

interface VoucherRow {
  source: 'qr' | 'gs1';
  voucher: string;
  phone: string;
  full_name: string;
  product_name: string;
  code: string;
  activated_at: string;
}

function fmtDateTime(d: string): string {
  try {
    return new Date(d).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return d;
  }
}

export default function VouchersPage() {
  const [items, setItems] = useState<VoucherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    const t = setTimeout(() => {
      api<{ vouchers: VoucherRow[] }>(`/api/v1/admin/vouchers${qs}`).then((r) => {
        if (r.ok && r.data) setItems(r.data.vouchers);
        setLoading(false);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const counts = useMemo(() => {
    const c = { qr: 0, gs1: 0 };
    for (const it of items) c[it.source]++;
    return c;
  }, [items]);

  function copyVoucher(voucher: string) {
    navigator.clipboard.writeText(voucher).then(() => {
      setCopied(voucher);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div>
      <PageHeader
        icon={Ticket}
        title="Mã voucher"
        subtitle="Đối chiếu mã giảm giá khách hàng cung cấp với các mã đã phát hành từ tem QR và GS1"
      />

      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nhập mã voucher hoặc số điện thoại..."
          className="form-input pl-9"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={q ? 'Không tìm thấy voucher' : 'Chưa có voucher nào'}
          description={q ? 'Thử tìm với mã voucher hoặc số điện thoại khác.' : 'Voucher được khách hàng lấy từ trang xác thực QR/GS1 sẽ hiển thị ở đây.'}
        />
      ) : (
        <>
          {!q && (
            <p className="text-xs text-gray-500 mb-3">
              {counts.qr} từ QR · {counts.gs1} từ GS1 · {items.length} tổng cộng
            </p>
          )}
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 uppercase tracking-wide text-[11px] border-b border-gray-100">
                  <th className="py-2.5 px-4 font-medium">Mã voucher</th>
                  <th className="py-2.5 px-4 font-medium">Khách hàng</th>
                  <th className="py-2.5 px-4 font-medium">Sản phẩm</th>
                  <th className="py-2.5 px-4 font-medium">Nguồn</th>
                  <th className="py-2.5 px-4 font-medium">Ngày phát hành</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((v) => (
                  <tr key={`${v.source}-${v.code}`} className="hover:bg-gray-50/60">
                    <td className="py-2.5 px-4">
                      <button
                        onClick={() => copyVoucher(v.voucher)}
                        className="inline-flex items-center gap-1.5 font-mono font-bold text-gov-700 hover:text-gov-900"
                        title="Sao chép mã"
                      >
                        {v.voucher}
                        {copied === v.voucher ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-gray-400" />
                        )}
                      </button>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5 text-gray-900">
                        <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        {v.full_name || <span className="text-gray-400">—</span>}
                      </div>
                      {v.phone && (
                        <a href={`tel:${v.phone}`} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gov-600 mt-0.5">
                          <Phone className="w-3 h-3" /> {v.phone}
                        </a>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5 text-gray-700">
                        <Package className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        {v.product_name || <span className="text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
                          v.source === 'qr'
                            ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                            : 'bg-gold-50 text-gold-700 border-gold-200'
                        )}
                      >
                        {v.source === 'qr' ? <QrCode className="w-3 h-3" /> : <ScanBarcode className="w-3 h-3" />}
                        {v.source === 'qr' ? 'QR' : 'GS1'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-gray-500 whitespace-nowrap">
                      {fmtDateTime(v.activated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

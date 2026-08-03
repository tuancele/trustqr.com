'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users, Download, Search, ChevronLeft, ChevronRight, RefreshCw,
  MessageSquareText, BellOff, Trash2, Package, MapPin, ShoppingBag,
  ScanLine, UserRound, ChevronRight as Arrow,
} from 'lucide-react';
import { api, download } from '@/lib/adminApi';
import { PageHeader, Alert, Spinner, StatCard, EmptyState } from '@/components/ui';
import { fmtNumber, fmtDate } from '@/lib/utils';

export interface Customer {
  id: number;
  phone: string;
  full_name: string;
  email: string;
  address: string;
  city: string;
  province: string;
  notes: string;
  marketing_consent: boolean;
  marketing_consent_at: string | null;
  total_activated_products: number;
  first_activated_at: string | null;
  last_activated_at: string | null;
  privacy_policy_version: string;
  deletion_requested_at: string | null;
  activations: number;
  scan_total: number;
  distinct_products: number;
  product_names: string[];
  last_city: string;
}

interface ListResp {
  customers: Customer[];
  total: number;
  page: number;
  page_size: number;
  stats: { total: number; marketing: number; deletion_request: number; products: number; scans: number };
}

const FILTERS: Array<[string, string]> = [
  ['', 'Tất cả'],
  ['marketing', 'Đồng ý marketing'],
  ['no_marketing', 'Không đồng ý'],
  ['deleted', 'Yêu cầu xóa'],
];

export default function CustomersPage() {
  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');

  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: '50' });
    if (filter) params.set('filter', filter);
    if (search) params.set('q', search);
    api<ListResp>(`/api/v1/admin/customers?${params}`).then((r) => {
      if (r.ok && r.data) setData(r.data);
      setLoading(false);
    });
  };
  useEffect(load, [page, filter, search]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const st = data?.stats;

  return (
    <div>
      <PageHeader
        icon={Users}
        title="Kho dữ liệu khách hàng"
        subtitle="Hồ sơ khách đã kích hoạt sản phẩm — sản phẩm đã mua, số lần mua, vị trí quét, consent NĐ13/2023"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => download('/api/v1/admin/customers/export', `customers_all_${dateStr}.csv`)}
              className="btn-secondary text-sm"
            >
              <Download className="w-4 h-4" /> CSV tất cả
            </button>
            <button
              onClick={() => download('/api/v1/admin/customers/export?marketing_only=true', `customers_marketing_${dateStr}.csv`)}
              className="btn-gold text-sm"
            >
              <Download className="w-4 h-4" /> CSV marketing
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <StatCard label="Tổng khách hàng"  value={fmtNumber(st?.total)}            icon={Users}             tone="gov" />
        <StatCard label="Đồng ý marketing" value={fmtNumber(st?.marketing)}        icon={MessageSquareText} tone="emerald"
          sub={st && st.total > 0 ? `${((st.marketing / st.total) * 100).toFixed(1)}%` : undefined} />
        <StatCard label="Lượt mua (tem KH)" value={fmtNumber(st?.products)}        icon={ShoppingBag}       tone="purple" />
        <StatCard label="Tổng lượt quét"   value={fmtNumber(st?.scans)}            icon={ScanLine}          tone="cyan" />
        <StatCard label="Yêu cầu xóa"      value={fmtNumber(st?.deletion_request)} icon={Trash2}            tone="red" />
      </div>

      <div className="card p-3 mb-3 flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm SĐT hoặc tên khách..."
            className="form-input pl-9 w-72 text-sm"
          />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(([v, l]) => (
            <button
              key={v}
              onClick={() => { setFilter(v); setPage(1); }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filter === v ? 'bg-gov-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={load} className="btn-secondary text-xs py-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </button>
          <span className="text-sm text-gray-500">{data && `${fmtNumber(data.total)} bản ghi`}</span>
        </div>
      </div>

      {loading && !data ? (
        <Spinner />
      ) : !data || data.customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Chưa có khách hàng nào"
          description={
            search || filter
              ? 'Không có bản ghi khớp bộ lọc hiện tại.'
              : 'Khách hàng sẽ xuất hiện tại đây sau khi kích hoạt tem QR kèm số điện thoại.'
          }
        />
      ) : (
        <>
          <div className="card overflow-hidden mb-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-600 uppercase whitespace-nowrap">
                    <th className="px-4 py-2.5">Khách hàng</th>
                    <th className="px-4 py-2.5">Vị trí</th>
                    <th className="px-4 py-2.5 text-right">Lượt mua</th>
                    <th className="px-4 py-2.5 text-right">Loại SP</th>
                    <th className="px-4 py-2.5">Sản phẩm đã mua</th>
                    <th className="px-4 py-2.5 text-right">Lượt quét</th>
                    <th className="px-4 py-2.5">Mua đầu / gần nhất</th>
                    <th className="px-4 py-2.5">Marketing</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.customers.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3">
                        <Link href={`/admin/customers/${c.id}`} className="block group">
                          <div className="flex items-center gap-1.5 font-medium text-gray-900 group-hover:text-gov-700">
                            <UserRound className="w-3.5 h-3.5 text-gray-400" />
                            {c.full_name || <em className="text-gray-400 font-normal">Chưa có tên</em>}
                          </div>
                          <div className="font-mono text-xs text-gov-700 mt-0.5">{c.phone}</div>
                          {c.email && <div className="text-xs text-gray-500">{c.email}</div>}
                        </Link>
                      </td>

                      <td className="px-4 py-3 max-w-[220px]">
                        {c.address ? (
                          <div className="text-xs text-gray-700 leading-snug">{c.address}</div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Chưa có địa chỉ</span>
                        )}
                        {(c.city || c.province || c.last_city) && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {c.city || c.province || c.last_city}
                            {c.city && c.last_city && c.last_city !== c.city && (
                              <span className="text-gray-400">(quét: {c.last_city})</span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-gov-50 text-gov-700 font-semibold text-xs">
                          {fmtNumber(c.activations)}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right text-gray-700">{fmtNumber(c.distinct_products)}</td>

                      <td className="px-4 py-3 max-w-[260px]">
                        {c.product_names.length === 0 ? (
                          <span className="text-xs text-gray-400 italic">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {c.product_names.slice(0, 3).map((p) => (
                              <span key={p} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[11px] leading-tight">
                                <Package className="w-2.5 h-2.5 flex-shrink-0" /> {p}
                              </span>
                            ))}
                            {c.product_names.length > 3 && (
                              <span className="text-[11px] text-gray-500 self-center">+{c.product_names.length - 3}</span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right text-gray-700">{fmtNumber(c.scan_total)}</td>

                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        <div>{fmtDate(c.first_activated_at)}</div>
                        <div className="text-gray-400">{fmtDate(c.last_activated_at)}</div>
                      </td>

                      <td className="px-4 py-3">
                        {c.deletion_requested_at ? (
                          <span className="badge-danger"><Trash2 className="w-3 h-3" /> Y/c xóa</span>
                        ) : c.marketing_consent ? (
                          <span className="badge-success"><MessageSquareText className="w-3 h-3" /> Đồng ý</span>
                        ) : (
                          <span className="badge-muted"><BellOff className="w-3 h-3" /> Không</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <Link href={`/admin/customers/${c.id}`}
                          className="inline-flex items-center text-xs text-gov-600 hover:underline whitespace-nowrap">
                          Chi tiết <Arrow className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mb-4">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="btn-secondary text-sm disabled:opacity-50">
                <ChevronLeft className="w-3.5 h-3.5" /> Trước
              </button>
              <span className="text-sm text-gray-600 px-3">Trang {page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="btn-secondary text-sm disabled:opacity-50">
                Sau <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </>
      )}

      <Alert kind="warning" title="Lưu ý NĐ13/2023">
        <ul className="list-disc pl-4 space-y-1 mt-1">
          <li>Chỉ dùng danh sách "marketing" để gửi SMS/Zalo quảng cáo</li>
          <li>Mọi lần xuất CSV được ghi vào <strong>audit log</strong></li>
          <li>Không chia sẻ danh sách cho bên thứ ba</li>
          <li>Tôn trọng yêu cầu xóa dữ liệu của khách</li>
        </ul>
      </Alert>
    </div>
  );
}

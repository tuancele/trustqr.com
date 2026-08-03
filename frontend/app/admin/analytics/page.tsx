'use client';

import { useEffect, useState } from 'react';
import { BarChart3, ShieldAlert, MapPin, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Spinner, StatusBadge, EmptyState } from '@/components/ui';
import { fmtNumber, fmtDateShort } from '@/lib/utils';

export default function AnalyticsPage() {
  const [frauds, setFrauds] = useState<any[]>([]);
  const [geo, setGeo] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<any[]>('/api/v1/admin/analytics/frauds').then((r) => r.ok && setFrauds(r.data || [])),
      api<any>('/api/v1/admin/analytics/geo?days=30').then((r) => r.ok && setGeo(r.data?.data || [])),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="Phân tích & Phát hiện gian lận"
        subtitle="Danh sách tem nghi giả và phân bổ quét theo địa lý"
      />

      {/* Fraud section */}
      <section className="card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-500" />
          <h2 className="font-semibold text-gray-900">Tem nghi giả</h2>
          <span className="text-xs text-gray-500">(scan_count &gt; 3 hoặc bị flag)</span>
        </div>
        {frauds.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-emerald-700">Không phát hiện tem nghi giả</p>
            <p className="text-sm text-gray-500 mt-1">Hệ thống vẫn bình thường</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <th className="px-4 py-3">Secret Code</th>
                  <th className="px-4 py-3">Lô</th>
                  <th className="px-4 py-3">Sản phẩm</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Scans</th>
                  <th className="px-4 py-3 text-right">Unique IPs (30d)</th>
                  <th className="px-4 py-3 text-right">Cities (30d)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {frauds.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gov-700">{f.secret_code}</td>
                    <td className="px-4 py-3 font-mono text-xs">{f.batch_code}</td>
                    <td className="px-4 py-3 text-gray-700">{f.product_name}</td>
                    <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                    <td className="px-4 py-3 text-right font-bold text-red-700">{f.scan_count}</td>
                    <td className="px-4 py-3 text-right">{f.unique_ips}</td>
                    <td className="px-4 py-3 text-right">{f.unique_cities}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Geo section */}
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-gov-500" />
          <h2 className="font-semibold text-gray-900">Phân bổ lượt quét theo Tỉnh/Thành</h2>
          <span className="text-xs text-gray-500">(30 ngày qua)</span>
        </div>
        {geo.length === 0 ? (
          <EmptyState icon={MapPin} title="Chưa có dữ liệu" description="Sẽ xuất hiện khi có lượt quét từ khách." />
        ) : (
          <div className="p-4 space-y-2">
            {geo.map((g, i) => {
              const total = geo.reduce((s, x) => s + x.scans, 0);
              const pct = total > 0 ? (g.scans / total) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3 py-2">
                  <div className="w-28 flex-shrink-0 text-sm font-medium text-gray-900 truncate">{g.city}</div>
                  <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-gov-500 to-gov-400 rounded-md transition-all"
                      style={{ width: `${pct}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-2 text-xs font-medium text-gray-700">
                      {pct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="w-20 text-right text-sm">
                    <div className="font-semibold text-gov-700">{fmtNumber(g.scans)}</div>
                    <div className="text-[11px] text-gray-500">{fmtNumber(g.unique_tokens)} tem</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

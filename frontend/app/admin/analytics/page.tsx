'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  BarChart3, ShieldAlert, MapPin, CheckCircle2, TrendingUp, Activity, Flame,
  Smartphone, Cpu, Globe,
} from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, StatCard, Spinner, StatusBadge, EmptyState } from '@/components/ui';
import { fmtNumber, fmtDateShort } from '@/lib/utils';

type TrendPoint = { day: string; scans: number; unique_tokens: number };
type BreakdownItem = { label: string; count: number };
type GeoRow = { city: string; scans: number; unique_tokens: number };
type FraudRow = {
  id: number; secret_code: string; scan_count: number; status: string;
  unique_ips: number; unique_cities: number; batch_code: string; product_name: string;
};

const DAY_OPTIONS = [7, 30, 90] as const;

export default function AnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [devices, setDevices] = useState<BreakdownItem[]>([]);
  const [oses, setOses] = useState<BreakdownItem[]>([]);
  const [browsers, setBrowsers] = useState<BreakdownItem[]>([]);
  const [geo, setGeo] = useState<GeoRow[]>([]);
  const [frauds, setFrauds] = useState<FraudRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api<{ data: TrendPoint[] }>(`/api/v1/admin/analytics/trend?days=${days}`),
      api<{ devices: BreakdownItem[]; os: BreakdownItem[]; browsers: BreakdownItem[] }>(`/api/v1/admin/analytics/devices?days=${days}`),
      api<{ data: GeoRow[] }>(`/api/v1/admin/analytics/geo?days=${days}`),
      api<FraudRow[]>('/api/v1/admin/analytics/frauds'),
    ]).then(([trendRes, devicesRes, geoRes, fraudsRes]) => {
      if (cancelled) return;
      if (trendRes.ok) setTrend(trendRes.data?.data || []);
      if (devicesRes.ok) {
        setDevices(devicesRes.data?.devices || []);
        setOses(devicesRes.data?.os || []);
        setBrowsers(devicesRes.data?.browsers || []);
      }
      if (geoRes.ok) setGeo(geoRes.data?.data || []);
      if (fraudsRes.ok) setFrauds(fraudsRes.data || []);
    }).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [days]);

  const stats = useMemo(() => {
    const totalScans = trend.reduce((s, p) => s + p.scans, 0);
    const avgPerDay = trend.length > 0 ? Math.round(totalScans / trend.length) : 0;
    const peak = trend.reduce<TrendPoint | null>((best, p) => (!best || p.scans > best.scans ? p : best), null);
    return { totalScans, avgPerDay, peak };
  }, [trend]);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="Phân tích & Phát hiện gian lận"
        subtitle="Toàn cảnh lượt quét: xu hướng, thiết bị, địa lý và tem nghi giả"
        actions={
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  days === d ? 'bg-white text-gov-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {d} ngày
              </button>
            ))}
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={BarChart3} tone="gov" label={`Tổng lượt quét (${days}d)`} value={fmtNumber(stats.totalScans)} />
        <StatCard icon={Activity} tone="cyan" label="Trung bình / ngày" value={fmtNumber(stats.avgPerDay)} />
        <StatCard
          icon={Flame}
          tone="gold"
          label="Ngày cao điểm"
          value={stats.peak ? fmtNumber(stats.peak.scans) : '—'}
          sub={stats.peak ? fmtDateShort(stats.peak.day) : undefined}
        />
        <StatCard icon={ShieldAlert} tone="red" label="Tem nghi giả" value={fmtNumber(frauds.length)} />
      </div>

      {/* Trend chart */}
      <section className="card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-gov-500" />
          <h2 className="font-semibold text-gray-900">Xu hướng lượt quét</h2>
        </div>
        {trend.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Chưa có dữ liệu" description="Sẽ xuất hiện khi có lượt quét từ khách." />
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="scanGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#002088" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#002088" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f5" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(d: string) => fmtDateShort(d)}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  minTickGap={24}
                />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(d) => fmtDateShort(typeof d === 'string' ? d : undefined)}
                  formatter={(value, name) => [fmtNumber(typeof value === 'number' ? value : undefined), name === 'scans' ? 'Lượt quét' : 'Tem khác nhau']}
                />
                <Area type="monotone" dataKey="scans" stroke="#002088" strokeWidth={2} fill="url(#scanGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Device / OS / Browser breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <BreakdownCard icon={Smartphone} title="Thiết bị" items={devices} />
        <BreakdownCard icon={Cpu} title="Hệ điều hành" items={oses} />
        <BreakdownCard icon={Globe} title="Trình duyệt" items={browsers} />
      </div>

      {/* Geo section */}
      <section className="card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-gov-500" />
          <h2 className="font-semibold text-gray-900">Phân bổ lượt quét theo Tỉnh/Thành</h2>
          <span className="text-xs text-gray-500">({days} ngày qua)</span>
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

      {/* Fraud section */}
      <section className="card overflow-hidden">
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
    </div>
  );
}

function BreakdownCard({ icon: Icon, title, items }: { icon: any; title: string; items: BreakdownItem[] }) {
  const total = items.reduce((s, x) => s + x.count, 0);
  return (
    <section className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Icon className="w-4 h-4 text-gov-500" />
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-400">Chưa có dữ liệu</div>
      ) : (
        <div className="p-4 space-y-2">
          {items.slice(0, 6).map((it, i) => {
            const pct = total > 0 ? (it.count / total) * 100 : 0;
            return (
              <div key={i} className="flex items-center gap-2">
                <div className="w-20 flex-shrink-0 text-xs font-medium text-gray-700 truncate">{it.label}</div>
                <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-gov-500 to-gov-400 rounded" style={{ width: `${pct}%` }} />
                </div>
                <div className="w-10 flex-shrink-0 text-right text-xs font-semibold text-gray-600">
                  {fmtNumber(it.count)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

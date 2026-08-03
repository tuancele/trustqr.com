'use client';

import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Package, ShieldCheck, TrendingUp, Users, Activity, ShieldAlert, Scan,
} from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, StatCard, Spinner, Alert } from '@/components/ui';
import { fmtNumber } from '@/lib/utils';

interface Summary {
  total_tokens: number;
  activated_tokens: number;
  total_scans: number;
  scans_last_24h: number;
  unique_customers: number;
  flagged_tokens: number;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Summary>('/api/v1/admin/analytics/summary').then((r) => {
      if (r.ok && r.data) setSummary(r.data);
      else setErr(r.error || 'Không tải được dữ liệu');
      setLoading(false);
    });
  }, []);

  if (loading) return <Spinner />;
  if (!summary) return <Alert kind="danger">{err}</Alert>;

  const activationRate = summary.total_tokens > 0
    ? Math.round((summary.activated_tokens / summary.total_tokens) * 100)
    : 0;

  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title="Tổng quan hệ thống"
        subtitle="Thống kê toàn hệ thống chống hàng giả TrustQR"
      />

      {/* Top metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Tổng số tem"
          value={fmtNumber(summary.total_tokens)}
          sub="Đã sinh trong hệ thống"
          icon={Package} tone="gov"
        />
        <StatCard
          label="Tem đã kích hoạt"
          value={fmtNumber(summary.activated_tokens)}
          sub={`${activationRate}% tỉ lệ kích hoạt`}
          icon={ShieldCheck} tone="emerald"
        />
        <StatCard
          label="Tổng lượt quét"
          value={fmtNumber(summary.total_scans)}
          sub={`${fmtNumber(summary.scans_last_24h)} trong 24h qua`}
          icon={Scan} tone="cyan"
        />
        <StatCard
          label="Khách hàng"
          value={fmtNumber(summary.unique_customers)}
          sub="SĐT unique thu thập"
          icon={Users} tone="purple"
        />
      </div>

      {/* Health section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-gov-500" />
            <h2 className="font-semibold text-gray-900">Tình trạng vận hành</h2>
          </div>
          <div className="space-y-3">
            <ProgressRow label="Tỉ lệ kích hoạt" value={activationRate} max={100} />
            <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
              Tem được người dùng cuối kích hoạt bằng SĐT trên tổng số tem đã sinh
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <h2 className="font-semibold text-gray-900">Cảnh báo</h2>
          </div>
          <div className={`rounded-lg p-4 ${summary.flagged_tokens > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${summary.flagged_tokens > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {fmtNumber(summary.flagged_tokens)}
              </span>
              <span className="text-sm text-gray-600">tem nghi giả</span>
            </div>
            <p className={`text-xs mt-1 ${summary.flagged_tokens > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {summary.flagged_tokens > 0
                ? 'Cần xem xét — vào Phân tích để chi tiết'
                : 'Chưa phát hiện bất thường'}
            </p>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="card p-5 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-gov-500" />
          <h2 className="font-semibold text-gray-900">Thao tác nhanh</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction href="/admin/batches/new"  label="Tạo lô mới" />
          <QuickAction href="/admin/batches"      label="Danh sách lô" />
          <QuickAction href="/admin/tokens"       label="Tra cứu tem" />
          <QuickAction href="/admin/analytics"    label="Phân tích" />
        </div>
      </div>
    </div>
  );
}

function ProgressRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-gray-700">{label}</span>
        <span className="font-semibold text-gov-700">{value}%</span>
      </div>
      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-gov-500 to-gov-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="block px-4 py-3 rounded-lg border border-gray-200 hover:border-gov-500 hover:bg-gov-50 text-center text-sm font-medium text-gray-700 hover:text-gov-700 transition-colors"
    >
      {label}
    </a>
  );
}

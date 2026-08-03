'use client';

import { useState } from 'react';
import { Search, Loader2, ShieldOff, AlertCircle, Package, Hash, MapPin, Clock, Phone, Ticket, Truck } from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Alert, StatusBadge } from '@/components/ui';
import { fmtDate } from '@/lib/utils';

export default function TokenLookupPage() {
  const [code, setCode] = useState('');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    if (!code.trim()) return;
    setError(null); setLoading(true); setData(null);
    const r = await api(`/api/v1/admin/tokens/${encodeURIComponent(code.trim())}/trace`);
    setLoading(false);
    if (!r.ok) { setError(r.error === 'not_found' ? 'Không tìm thấy mã này' : r.error || 'Lỗi'); return; }
    setData(r.data);
  }

  async function disableToken() {
    if (!data) return;
    if (!confirm(`Vô hiệu hóa mã ${data.secret_code}? Hành động này ghi vào audit log.`)) return;
    const r = await api(`/api/v1/admin/tokens/${data.id}/disable`, { method: 'PATCH' });
    if (r.ok) { alert('Đã vô hiệu hóa'); lookup(); }
    else alert('Lỗi: ' + r.error);
  }

  return (
    <div>
      <PageHeader
        icon={Search}
        title="Tra cứu tem QR"
        subtitle="Xem lịch sử đầy đủ của một tem: batch → thùng → đại lý → quét → kích hoạt"
      />

      <form onSubmit={lookup} className="card p-4 mb-6 flex gap-2">
        <input
          value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="Dán secret_code (12 ký tự)"
          className="form-input font-mono flex-1"
          required
        />
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Tra cứu
        </button>
      </form>

      {error && <Alert kind="danger">{error}</Alert>}

      {data && (
        <div className="space-y-4">
          {/* Header card */}
          <div className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Secret code</p>
                <p className="font-mono text-xl font-bold text-gov-700 mt-1">{data.secret_code}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={data.status} />
                {data.status !== 'disabled' && (
                  <button onClick={disableToken} className="btn-danger !py-2 !px-3 text-xs">
                    <ShieldOff className="w-3.5 h-3.5" /> Vô hiệu hóa
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoCard title="Sản phẩm & Lô">
              <InfoLine icon={Package} label="Sản phẩm" value={data.product_name} />
              <InfoLine icon={Hash} label="Lô" value={<span className="font-mono">{data.batch_code}</span>} />
              <InfoLine icon={Truck} label="Đại lý" value={data.distributor || <em className="text-gray-400">(chưa gán)</em>} />
            </InfoCard>

            <InfoCard title="Trạng thái quét">
              <InfoLine icon={Hash} label="Số lần quét" value={<strong className={data.scan_count > 1 ? 'text-amber-600' : 'text-emerald-600'}>{data.scan_count}</strong>} />
              <InfoLine icon={Clock} label="Quét lần đầu" value={fmtDate(data.first_scanned_at)} />
              <InfoLine icon={MapPin} label="Vị trí đầu" value={data.first_scan_city || '—'} />
            </InfoCard>

            <InfoCard title="Kích hoạt khách hàng">
              <InfoLine icon={Phone} label="SĐT" value={data.activated_phone || <em className="text-gray-400">(chưa kích hoạt)</em>} />
              <InfoLine icon={Ticket} label="Voucher" value={data.voucher ? <span className="font-mono font-bold text-gov-700">{data.voucher}</span> : '—'} />
              <InfoLine icon={Clock} label="Thời điểm" value={fmtDate(data.activated_at)} />
            </InfoCard>

            <InfoCard title="Cảnh báo">
              {data.status === 'flagged' ? (
                <Alert kind="warning" title="Nghi giả">
                  Token này bị flag do quét từ nhiều địa điểm/IP khác nhau trong 24h.
                </Alert>
              ) : data.status === 'disabled' ? (
                <Alert kind="danger" title="Đã vô hiệu hóa">
                  Token này đã bị admin vô hiệu hóa thủ công.
                </Alert>
              ) : (
                <p className="text-sm text-emerald-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Không có cảnh báo
                </p>
              )}
            </InfoCard>
          </div>

          {/* Scan history */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Lịch sử quét (20 gần nhất)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wider">
                    <th className="px-4 py-2">Thời gian</th>
                    <th className="px-4 py-2">IP</th>
                    <th className="px-4 py-2">Thành phố</th>
                    <th className="px-4 py-2">User Agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data.recent_scans || []).map((s: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-600">{fmtDate(s.at)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{s.ip}</td>
                      <td className="px-4 py-2">{s.city}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 max-w-xs truncate">{s.user_agent}</td>
                    </tr>
                  ))}
                  {(data.recent_scans || []).length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">Chưa có lượt quét nào</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoLine({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      <span className="text-gray-500 min-w-[100px]">{label}:</span>
      <span className="text-gray-900 min-w-0 flex-1">{value}</span>
    </div>
  );
}

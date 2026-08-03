'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users, ArrowLeft, UserRound, Phone, Mail, MapPin, StickyNote, Save, Loader2,
  Package, ShoppingBag, ScanLine, Ticket, Building2, Truck, Globe, Calendar,
  MessageSquareText, BellOff, Trash2, Layers,
} from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Spinner, Alert, StatCard, StatusBadge } from '@/components/ui';
import { fmtNumber, fmtDate } from '@/lib/utils';
import type { Customer } from '../page';

interface Activation {
  token_id: number;
  secret_code: string;
  serial_no: number;
  batch_code: string;
  product_id: number | null;
  product_name: string;
  company_name: string;
  distributor_name: string;
  voucher: string;
  activated_at: string | null;
  scan_count: number;
  first_scanned_at: string | null;
  first_scan_city: string;
  status: string;
}

interface ProductSummary {
  product_id: number | null;
  product_name: string;
  company_name: string;
  qty: number;
  first_at: string | null;
  last_at: string | null;
}

interface ScanRow {
  scanned_at: string;
  city: string;
  region: string;
  country: string;
  ip: string;
  device_lat: number | null;
  device_lng: number | null;
  is_repeat: boolean;
  secret_code: string;
  product_name: string;
}

interface Detail {
  customer: Customer;
  activations: Activation[];
  products: ProductSummary[];
  scans: ScanRow[];
}

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'profile' | 'purchases' | 'scans'>('profile');

  const load = () => {
    api<Detail>(`/api/v1/admin/customers/${id}`).then((r) => {
      if (r.ok && r.data) setD(r.data);
      setLoading(false);
    });
  };
  useEffect(load, [id]);

  if (loading) return <Spinner />;
  if (!d) return <Alert kind="danger">Không tải được hồ sơ khách hàng này</Alert>;

  const c = d.customer;

  return (
    <div>
      <div className="mb-3">
        <Link href="/admin/customers" className="inline-flex items-center gap-1 text-sm text-gov-600 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Danh sách khách hàng
        </Link>
      </div>

      <PageHeader
        icon={Users}
        title={c.full_name || c.phone}
        subtitle={`${c.phone} · khách từ ${fmtDate(c.first_activated_at)}`}
        actions={
          c.deletion_requested_at ? (
            <span className="badge-danger"><Trash2 className="w-3 h-3" /> Đã yêu cầu xóa dữ liệu</span>
          ) : c.marketing_consent ? (
            <span className="badge-success"><MessageSquareText className="w-3 h-3" /> Đồng ý nhận marketing</span>
          ) : (
            <span className="badge-muted"><BellOff className="w-3 h-3" /> Không nhận marketing</span>
          )
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Lượt mua"       value={fmtNumber(c.activations)}       icon={ShoppingBag} tone="gov" />
        <StatCard label="Loại sản phẩm"  value={fmtNumber(c.distinct_products)} icon={Package}     tone="purple" />
        <StatCard label="Tổng lượt quét" value={fmtNumber(c.scan_total)}        icon={ScanLine}    tone="cyan" />
        <StatCard label="Mua gần nhất"   value={fmtDate(c.last_activated_at)}   icon={Calendar}    tone="gold" />
      </div>

      <div className="border-b border-gray-200 mb-4">
        <div className="flex gap-1">
          <TabBtn active={tab === 'profile'}   onClick={() => setTab('profile')}   icon={UserRound}>Hồ sơ</TabBtn>
          <TabBtn active={tab === 'purchases'} onClick={() => setTab('purchases')} icon={ShoppingBag}>
            Lịch sử mua ({d.activations.length})
          </TabBtn>
          <TabBtn active={tab === 'scans'}     onClick={() => setTab('scans')}     icon={MapPin}>
            Vị trí quét ({d.scans.length})
          </TabBtn>
        </div>
      </div>

      {tab === 'profile'   && <ProfileTab id={id} c={c} products={d.products} onSaved={load} />}
      {tab === 'purchases' && <PurchasesTab rows={d.activations} products={d.products} />}
      {tab === 'scans'     && <ScansTab rows={d.scans} />}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: any; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-gov-500 text-gov-700' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}>
      <Icon className="w-4 h-4" /> {children}
    </button>
  );
}

// ============ Hồ sơ (xem + sửa thông tin cơ bản) ============
function ProfileTab({ id, c, products, onSaved }: {
  id: number; c: Customer; products: ProductSummary[]; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    full_name: c.full_name, email: c.email, address: c.address,
    city: c.city, province: c.province, notes: c.notes,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null); setErr(null);
    const r = await api(`/api/v1/admin/customers/${id}`, { method: 'PUT', body: JSON.stringify(form) });
    setBusy(false);
    if (!r.ok) { setErr(r.error || 'Lưu thất bại'); return; }
    setMsg('Đã lưu thông tin khách hàng');
    onSaved();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Form thông tin cơ bản */}
      <form onSubmit={save} className="lg:col-span-2 card p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900">Thông tin cơ bản</h3>
          <p className="text-sm text-gray-600 mt-0.5">
            Khách tự khai khi kích hoạt tem. Admin có thể bổ sung/hiệu chỉnh tại đây.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label"><UserRound className="w-3.5 h-3.5 inline mr-1" />Họ và tên</label>
            <input value={form.full_name} onChange={set('full_name')} className="form-input" placeholder="Nguyễn Văn A" />
          </div>
          <div>
            <label className="form-label"><Phone className="w-3.5 h-3.5 inline mr-1" />Số điện thoại</label>
            <input value={c.phone} readOnly disabled className="form-input font-mono bg-gray-50 text-gray-600" />
            <p className="text-xs text-gray-500 mt-1">Định danh khách — không sửa được</p>
          </div>
        </div>

        <div>
          <label className="form-label"><Mail className="w-3.5 h-3.5 inline mr-1" />Email</label>
          <input type="email" value={form.email} onChange={set('email')} className="form-input" placeholder="email@example.com" />
        </div>

        <div>
          <label className="form-label"><MapPin className="w-3.5 h-3.5 inline mr-1" />Địa chỉ</label>
          <input value={form.address} onChange={set('address')} className="form-input" placeholder="Số nhà, đường, phường/xã" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Quận / Huyện / Thành phố</label>
            <input value={form.city} onChange={set('city')} className="form-input" placeholder="Quận 1 / TP.HCM" />
          </div>
          <div>
            <label className="form-label">Tỉnh / Thành</label>
            <input value={form.province} onChange={set('province')} className="form-input" placeholder="TP. Hồ Chí Minh" />
          </div>
        </div>

        <div>
          <label className="form-label"><StickyNote className="w-3.5 h-3.5 inline mr-1" />Ghi chú nội bộ</label>
          <textarea value={form.notes} onChange={set('notes')} className="form-input min-h-[80px]"
            placeholder="VD: Khách VIP, hay mua sỉ, đã khiếu nại đơn ngày..." />
        </div>

        {err && <Alert kind="danger">{err}</Alert>}
        {msg && <Alert kind="success">{msg}</Alert>}

        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {busy ? 'Đang lưu...' : 'Lưu thông tin'}
        </button>
      </form>

      {/* Panel bên phải */}
      <div className="space-y-4">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-gov-500" /> Sản phẩm đã mua
          </h3>
          {products.length === 0 ? (
            <p className="text-sm text-gray-500">Chưa mua sản phẩm nào</p>
          ) : (
            <div className="space-y-2.5">
              {products.map((p, i) => (
                <div key={i} className="flex items-start justify-between gap-3 pb-2.5 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    {p.product_id ? (
                      <Link href={`/admin/products/${p.product_id}/edit`} className="text-sm font-medium text-gov-700 hover:underline">
                        {p.product_name}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-gray-700">{p.product_name}</span>
                    )}
                    {p.company_name && (
                      <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" /> {p.company_name}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-0.5">Gần nhất: {fmtDate(p.last_at)}</div>
                  </div>
                  <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-semibold">
                    ×{fmtNumber(p.qty)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-gov-500" /> Hồ sơ pháp lý
          </h3>
          <dl className="space-y-2 text-sm">
            <Row label="Consent marketing" value={c.marketing_consent ? 'Đồng ý' : 'Không'} />
            <Row label="Thời điểm consent" value={fmtDate(c.marketing_consent_at)} />
            <Row label="Phiên bản chính sách" value={c.privacy_policy_version || '—'} />
            <Row label="Vị trí quét gần nhất" value={c.last_city || '—'} />
            <Row label="Yêu cầu xóa dữ liệu" value={c.deletion_requested_at ? fmtDate(c.deletion_requested_at) : 'Không'} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900 font-medium text-right">{value}</dd>
    </div>
  );
}

// ============ Lịch sử mua (mỗi tem kích hoạt = 1 lần mua) ============
function PurchasesTab({ rows, products }: { rows: Activation[]; products: ProductSummary[] }) {
  if (rows.length === 0) {
    return <div className="card p-8 text-center text-gray-500 text-sm">Khách chưa kích hoạt tem nào</div>;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {products.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-800 text-sm">
            <Package className="w-3.5 h-3.5" /> {p.product_name}
            <strong className="ml-1">×{fmtNumber(p.qty)}</strong>
          </span>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-600 uppercase whitespace-nowrap">
                <th className="px-4 py-2.5">Ngày mua</th>
                <th className="px-4 py-2.5">Sản phẩm</th>
                <th className="px-4 py-2.5">Đại lý</th>
                <th className="px-4 py-2.5">Tem</th>
                <th className="px-4 py-2.5">Lô</th>
                <th className="px-4 py-2.5">Voucher</th>
                <th className="px-4 py-2.5">Vị trí</th>
                <th className="px-4 py-2.5 text-right">Quét</th>
                <th className="px-4 py-2.5">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((a) => (
                <tr key={a.token_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">{fmtDate(a.activated_at)}</td>
                  <td className="px-4 py-2.5">
                    {a.product_id ? (
                      <Link href={`/admin/products/${a.product_id}/edit`} className="text-gov-700 hover:underline">
                        {a.product_name}
                      </Link>
                    ) : (
                      <em className="text-gray-400">{a.product_name || 'chưa gán'}</em>
                    )}
                    {a.company_name && <div className="text-xs text-gray-500">{a.company_name}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {a.distributor_name ? (
                      <span className="inline-flex items-center gap-1 text-gray-700">
                        <Truck className="w-3 h-3 text-gray-400" /> {a.distributor_name}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gov-700">
                    {a.secret_code}
                    {a.serial_no > 0 && <span className="text-gray-400 ml-1">#{a.serial_no}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{a.batch_code}</td>
                  <td className="px-4 py-2.5">
                    {a.voucher ? (
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-gold-700">
                        <Ticket className="w-3 h-3" /> {a.voucher}
                      </span>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{a.first_scan_city || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-xs">{fmtNumber(a.scan_count)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============ Lịch sử quét (vị trí) ============
function ScansTab({ rows }: { rows: ScanRow[] }) {
  if (rows.length === 0) {
    return <div className="card p-8 text-center text-gray-500 text-sm">Chưa có lượt quét nào được ghi nhận</div>;
  }
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 text-sm">100 lượt quét gần nhất trên tem của khách</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Vị trí từ GeoIP; cột GPS là tọa độ thiết bị khi khách cho phép truy cập vị trí
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-600 uppercase whitespace-nowrap">
              <th className="px-4 py-2.5">Thời gian</th>
              <th className="px-4 py-2.5">Sản phẩm</th>
              <th className="px-4 py-2.5">Tem</th>
              <th className="px-4 py-2.5">Vị trí (GeoIP)</th>
              <th className="px-4 py-2.5">GPS thiết bị</th>
              <th className="px-4 py-2.5">IP</th>
              <th className="px-4 py-2.5">Lần quét</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((s, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-xs whitespace-nowrap">{fmtDate(s.scanned_at)}</td>
                <td className="px-4 py-2.5 text-xs">{s.product_name || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-gov-700">{s.secret_code}</td>
                <td className="px-4 py-2.5 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Globe className="w-3 h-3 text-gray-400" />
                    {[s.city, s.region, s.country].filter(Boolean).join(', ') || '—'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs font-mono">
                  {s.device_lat != null && s.device_lng != null ? (
                    <a
                      href={`https://www.google.com/maps?q=${s.device_lat},${s.device_lng}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-gov-600 hover:underline inline-flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3" />
                      {s.device_lat.toFixed(5)}, {s.device_lng.toFixed(5)}
                    </a>
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{s.ip || '—'}</td>
                <td className="px-4 py-2.5">
                  {s.is_repeat
                    ? <span className="badge-warning">Quét lại</span>
                    : <span className="badge-success">Lần đầu</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

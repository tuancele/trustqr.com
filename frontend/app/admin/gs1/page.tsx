'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ScanBarcode, Search, Inbox, FileText, Loader2, PlusCircle, AlertTriangle, Trash2,
} from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Spinner, EmptyState, Alert } from '@/components/ui';
import { fmtDateShort } from '@/lib/utils';

interface GS1Label {
  id: number;
  gtin: string;
  manufacture_date: string;
  expiry_date: string | null;
  lot: string;
  serial: string;
  product_name: string | null;
  product_code: string | null;
  spec: string | null;
  unit: string | null;
  manufacturer: string | null;
  origin_country: string | null;
  created_at: string;
}

const GS1_ERROR_LABELS: Record<string, string> = {
  gtin_must_be_8_to_14_digits: 'GTIN phải là số, từ 8 đến 14 chữ số.',
  manufacture_date_invalid: 'Ngày sản xuất không hợp lệ.',
  expiry_date_invalid: 'Hạn sử dụng không hợp lệ.',
  lot_and_serial_required: 'Cần nhập Lot/Batch number và Serial number.',
  not_found: 'Không tìm thấy mã này.',
};

function errMsg(err?: string): string {
  if (!err) return 'Có lỗi xảy ra';
  return GS1_ERROR_LABELS[err] || err;
}

export default function GS1LabelsPage() {
  const [labels, setLabels] = useState<GS1Label[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page_size: '50' });
    if (q) params.set('q', q);
    const t = setTimeout(() => {
      api<{ items: GS1Label[] }>(`/api/v1/admin/gs1/labels?${params}`).then((r) => {
        if (r.ok && r.data) setLabels(r.data.items);
        setLoading(false);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q, refreshKey]);

  async function onDelete(l: GS1Label) {
    if (!confirm(`Xóa mã GS1 của lô "${l.lot}" / serial "${l.serial}"?`)) return;
    const r = await api(`/api/v1/admin/gs1/labels/${l.id}`, { method: 'DELETE' });
    if (r.ok) setRefreshKey((k) => k + 1);
    else alert(errMsg(r.error));
  }

  return (
    <div>
      <PageHeader
        icon={ScanBarcode}
        title="Mã GS1 DataMatrix"
        subtitle="Nhập tay toàn bộ thông tin để tạo mã GS1 DataMatrix — độc lập hoàn toàn với hệ thống QR chống giả hiện có"
      />

      <div className="mb-4">
        <Alert kind="info" title="Đây là module riêng">
          Mỗi mã GS1 DataMatrix ở đây được nhập tay toàn bộ (GTIN, ngày SX/HSD, lô, serial...), không lấy dữ liệu từ Sản phẩm/Lô sản xuất/Tem QR hiện có.
        </Alert>
      </div>

      <CreateForm
        onCreated={() => setRefreshKey((k) => k + 1)}
      />

      <div className="card p-3 my-4 flex items-center gap-2">
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo GTIN, lô, serial hoặc tên sản phẩm..."
          className="form-input border-0 shadow-none focus:ring-0 flex-1"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : labels.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Chưa có mã GS1 nào"
          description="Tạo mã GS1 DataMatrix đầu tiên bằng form phía trên."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <th className="px-4 py-3">Quy cách</th>
                  <th className="px-4 py-3">GTIN</th>
                  <th className="px-4 py-3">Lô / Serial</th>
                  <th className="px-4 py-3">Sản phẩm</th>
                  <th className="px-4 py-3">Ngày SX / HSD</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                  <th className="px-4 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {labels.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {l.spec || <em className="text-gray-400">chưa nhập</em>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gov-700">{l.gtin}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {l.lot} / {l.serial}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {l.product_name || <em className="text-gray-400 text-xs">chưa nhập</em>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {fmtDateShort(l.manufacture_date)}
                      {l.expiry_date && <> → {fmtDateShort(l.expiry_date)}</>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDateShort(l.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/admin/gs1/${l.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gov-500 text-white hover:bg-gov-600 text-xs font-medium transition-colors"
                        >
                          <FileText className="w-3 h-3" /> Chi tiết
                        </Link>
                        <button
                          onClick={() => onDelete(l)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium transition-colors"
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

// ============ Create form ============
const emptyForm = {
  gtin: '', manufacture_date: '', expiry_date: '', lot: '', serial: '',
  product_name: '', product_code: '', spec: '', unit: '', manufacturer: '', origin_country: '',
};

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.gtin || !form.manufacture_date || !form.lot || !form.serial) {
      setError('Cần nhập GTIN, ngày sản xuất, lô và serial.');
      return;
    }
    setBusy(true);
    const r = await api<{ id: number }>('/api/v1/admin/gs1/labels', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!r.ok || !r.data) { setError(errMsg(r.error)); return; }
    setForm(emptyForm);
    onCreated();
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <PlusCircle className="w-4 h-4 text-gov-600" />
        <h3 className="font-semibold text-gray-900 text-sm">Tạo mã GS1 DataMatrix mới</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="GTIN (AI 01)" required>
          <input value={form.gtin} onChange={(e) => set('gtin', e.target.value)}
            placeholder="08809460304701" className="form-input font-mono" />
        </Field>
        <Field label="Ngày sản xuất (AI 11)" required>
          <input type="date" value={form.manufacture_date} onChange={(e) => set('manufacture_date', e.target.value)}
            className="form-input" />
        </Field>
        <Field label="Hạn sử dụng (AI 17)">
          <input type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)}
            className="form-input" />
        </Field>
        <Field label="Lot / Batch number (AI 10)" required>
          <input value={form.lot} onChange={(e) => set('lot', e.target.value)}
            placeholder="R02511110020" className="form-input font-mono" />
        </Field>
        <Field label="Serial number (AI 21)" required>
          <input value={form.serial} onChange={(e) => set('serial', e.target.value)}
            placeholder="A25L350981" className="form-input font-mono" />
        </Field>
        <Field label="Tên sản phẩm">
          <input value={form.product_name} onChange={(e) => set('product_name', e.target.value)}
            placeholder="Trụ chân răng nhân tạo" className="form-input" />
        </Field>
        <Field label="Mã sản phẩm">
          <input value={form.product_code} onChange={(e) => set('product_code', e.target.value)}
            placeholder="C010400955" className="form-input" />
        </Field>
        <Field label="Quy cách">
          <input value={form.spec} onChange={(e) => set('spec', e.target.value)}
            placeholder="FXS4508" className="form-input" />
        </Field>
        <Field label="Đơn vị">
          <input value={form.unit} onChange={(e) => set('unit', e.target.value)}
            placeholder="Cái" className="form-input" />
        </Field>
        <Field label="Hãng sản xuất">
          <input value={form.manufacturer} onChange={(e) => set('manufacturer', e.target.value)}
            placeholder="DENTIUM CO., LTD" className="form-input" />
        </Field>
        <Field label="Xuất xứ">
          <input value={form.origin_country} onChange={(e) => set('origin_country', e.target.value)}
            placeholder="Hàn Quốc" className="form-input" />
        </Field>
      </div>

      {error && <Alert kind="danger" icon={AlertTriangle}>{error}</Alert>}

      <button type="submit" disabled={busy} className="btn-primary text-sm">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanBarcode className="w-4 h-4" />}
        Tạo mã GS1
      </button>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}


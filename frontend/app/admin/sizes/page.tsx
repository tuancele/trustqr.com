'use client';

import { useEffect, useState } from 'react';
import {
  Ruler, Search, Inbox, Loader2, PlusCircle, AlertTriangle, Trash2, Pencil, X, Check, ShieldCheck, ShieldQuestion,
} from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Spinner, EmptyState, Alert } from '@/components/ui';
import { BrandPicker, type Brand } from '@/components/BrandPicker';

interface SizeSpec {
  id: number;
  brand_id: number;
  spec: string;
  size_spec: string | null;
  gtin: string | null;
  product_line: string | null;
  verified: boolean;
  created_at: string;
}

const emptyForm = { spec: '', size_spec: '', gtin: '', product_line: '', verified: false };

export default function SizesPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [items, setItems] = useState<SizeSpec[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!brand) { setItems([]); return; }
    setLoading(true);
    api<SizeSpec[]>(`/api/v1/admin/gs1/size-specs?brand_id=${brand.id}`).then((r) => {
      if (r.ok && r.data) setItems(r.data);
      setLoading(false);
    });
  }, [brand, refreshKey]);

  async function onDelete(item: SizeSpec) {
    if (!confirm(`Xóa Quy cách "${item.spec}"?`)) return;
    const r = await api(`/api/v1/admin/gs1/size-specs/${item.id}`, { method: 'DELETE' });
    if (r.ok) setRefreshKey((k) => k + 1);
    else alert(r.error || 'Có lỗi xảy ra');
  }

  const filtered = q
    ? items.filter((i) =>
        i.spec.toLowerCase().includes(q.toLowerCase()) ||
        (i.gtin || '').includes(q) ||
        (i.product_line || '').toLowerCase().includes(q.toLowerCase()) ||
        (i.size_spec || '').toLowerCase().includes(q.toLowerCase()))
    : items;

  return (
    <div>
      <PageHeader
        icon={Ruler}
        title="Size"
        subtitle="Bảng tham chiếu Quy cách / Brand-Line / Kích thước / GTIN theo từng thương hiệu — dùng để tự động điền khi tạo mã GS1"
      />

      <div className="card p-5 mb-4">
        <label className="form-label">Thương hiệu</label>
        <BrandPicker value={brand} onChange={setBrand} />
      </div>

      {!brand ? (
        <EmptyState
          icon={Ruler}
          title="Chọn thương hiệu"
          description="Chọn một thương hiệu ở trên để xem hoặc quản lý bảng tham chiếu Quy cách/Kích thước/GTIN."
        />
      ) : (
        <>
          <EditForm
            key={refreshKey}
            brandId={brand.id}
            onSaved={() => setRefreshKey((k) => k + 1)}
          />

          <div className="card p-3 my-4 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo Quy cách, Brand/Line, Kích thước hoặc GTIN..."
              className="form-input border-0 shadow-none focus:ring-0 flex-1"
            />
          </div>

          {loading ? (
            <Spinner />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Chưa có dữ liệu"
              description="Thêm Quy cách đầu tiên cho thương hiệu này bằng form phía trên."
            />
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-600 uppercase tracking-wider">
                      <th className="px-4 py-3">Quy cách</th>
                      <th className="px-4 py-3">Brand / Line</th>
                      <th className="px-4 py-3">Kích thước</th>
                      <th className="px-4 py-3">GTIN</th>
                      <th className="px-4 py-3">Xác minh</th>
                      <th className="px-4 py-3">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((item) => (
                      <Row key={item.id} item={item} onDelete={() => onDelete(item)}
                        onSaved={() => setRefreshKey((k) => k + 1)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium">
      <ShieldCheck className="w-3 h-3" /> Đã xác minh
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-medium">
      <ShieldQuestion className="w-3 h-3" /> Chưa xác minh
    </span>
  );
}

function Row({ item, onDelete, onSaved }: { item: SizeSpec; onDelete: () => void; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    spec: item.spec, size_spec: item.size_spec || '', gtin: item.gtin || '',
    product_line: item.product_line || '', verified: item.verified,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!form.spec) { setError('Cần nhập Quy cách.'); return; }
    setBusy(true);
    setError(null);
    const r = await api(`/api/v1/admin/gs1/size-specs/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error || 'Có lỗi xảy ra'); return; }
    setEditing(false);
    onSaved();
  }

  if (editing) {
    return (
      <tr className="bg-gov-50/40">
        <td className="px-4 py-2">
          <input value={form.spec} onChange={(e) => setForm((f) => ({ ...f, spec: e.target.value }))}
            className="form-input font-mono text-xs" />
        </td>
        <td className="px-4 py-2">
          <input value={form.product_line} onChange={(e) => setForm((f) => ({ ...f, product_line: e.target.value }))}
            className="form-input text-xs" placeholder="SuperLine I" />
        </td>
        <td className="px-4 py-2">
          <input value={form.size_spec} onChange={(e) => setForm((f) => ({ ...f, size_spec: e.target.value }))}
            className="form-input text-xs" />
        </td>
        <td className="px-4 py-2">
          <input value={form.gtin} onChange={(e) => setForm((f) => ({ ...f, gtin: e.target.value }))}
            className="form-input font-mono text-xs" />
        </td>
        <td className="px-4 py-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
            <input type="checkbox" checked={form.verified}
              onChange={(e) => setForm((f) => ({ ...f, verified: e.target.checked }))} />
            Đã xác minh
          </label>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <button onClick={save} disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-medium transition-colors">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Lưu
            </button>
            <button onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-50 text-gray-600 hover:bg-gray-100 text-xs font-medium transition-colors">
              <X className="w-3 h-3" /> Hủy
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 font-mono text-xs text-gray-900">{item.spec}</td>
      <td className="px-4 py-3 text-xs text-gray-700">{item.product_line || <em className="text-gray-400">chưa nhập</em>}</td>
      <td className="px-4 py-3 text-xs text-gray-700">{item.size_spec || <em className="text-gray-400">chưa nhập</em>}</td>
      <td className="px-4 py-3 font-mono text-xs text-gov-700">{item.gtin || <em className="text-gray-400 font-sans">chưa có</em>}</td>
      <td className="px-4 py-3"><VerifiedBadge verified={item.verified} /></td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gov-500 text-white hover:bg-gov-600 text-xs font-medium transition-colors">
            <Pencil className="w-3 h-3" /> Sửa
          </button>
          <button onClick={onDelete}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium transition-colors">
            <Trash2 className="w-3 h-3" /> Xóa
          </button>
        </div>
      </td>
    </tr>
  );
}

function EditForm({ brandId, onSaved }: { brandId: number; onSaved: () => void }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.spec) {
      setError('Cần nhập Quy cách.');
      return;
    }
    setBusy(true);
    const r = await api('/api/v1/admin/gs1/size-specs', {
      method: 'POST',
      body: JSON.stringify({ ...form, brand_id: brandId }),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error || 'Có lỗi xảy ra'); return; }
    setForm(emptyForm);
    onSaved();
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <PlusCircle className="w-4 h-4 text-gov-600" />
        <h3 className="font-semibold text-gray-900 text-sm">Thêm Quy cách</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="form-label">Quy cách <span className="text-red-500">*</span></label>
          <input value={form.spec} onChange={(e) => set('spec', e.target.value)}
            placeholder="FXS4508" className="form-input font-mono" />
        </div>
        <div>
          <label className="form-label">Brand / Line</label>
          <input value={form.product_line} onChange={(e) => set('product_line', e.target.value)}
            placeholder="SuperLine I" className="form-input" />
        </div>
        <div>
          <label className="form-label">Kích thước</label>
          <input value={form.size_spec} onChange={(e) => set('size_spec', e.target.value)}
            placeholder="4.0mm(⌀) X 10.0mm(L)" className="form-input" />
        </div>
        <div>
          <label className="form-label">GTIN</label>
          <input value={form.gtin} onChange={(e) => set('gtin', e.target.value)}
            placeholder="08809460304718" className="form-input font-mono" />
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.verified} onChange={(e) => set('verified', e.target.checked)} />
        Đã xác minh (admin xác nhận GTIN chính xác)
      </label>

      {error && <Alert kind="danger" icon={AlertTriangle}>{error}</Alert>}

      <button type="submit" disabled={busy} className="btn-primary text-sm">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
        Thêm Quy cách
      </button>
    </form>
  );
}

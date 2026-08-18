'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ScanBarcode, ArrowLeft, Layers, Printer, Loader2, AlertTriangle,
  FileImage, FileArchive, Settings2, ExternalLink, XCircle,
  ListChecks, ChevronLeft, ChevronRight, CheckCircle2, Pencil, Save, X,
} from 'lucide-react';
import { api, download, downloadPost } from '@/lib/adminApi';
import { PageHeader, Spinner, Alert, EmptyState } from '@/components/ui';
import { fmtDateShort, fmtDate, fmtNumber } from '@/lib/utils';
import { BrandPicker, type Brand } from '@/components/BrandPicker';

interface GS1LabelDetail {
  id: number;
  gtin: string;
  manufacture_date: string;
  expiry_date: string | null;
  lot: string;
  serial: string;
  product_name: string | null;
  product_code: string | null;
  spec: string | null;
  size_spec: string | null;
  unit: string | null;
  manufacturer: string | null;
  origin_country: string | null;
  created_at: string;
  element_string: string;
  brand_id?: number | null;
  brand_name?: string;
  brand_website?: string;
  brand_logo_url?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const GS1_ERROR_LABELS: Record<string, string> = {
  not_found: 'Không tìm thấy mã này.',
  template_not_found: 'Không tìm thấy mẫu tem.',
  template_not_raster: 'Mẫu tem này là SVG — hãy dùng nút Tải ZIP (SVG).',
  template_not_vector: 'Mẫu tem này không phải SVG — hãy dùng nút Tải PDF.',
  quantity_too_large: 'Số lượng bản in vượt quá giới hạn cho phép.',
  qr_px_out_of_range: 'Độ phân giải QR không hợp lệ.',
  gtin_must_be_8_to_14_digits: 'GTIN phải là số, từ 8 đến 14 chữ số.',
  manufacture_date_invalid: 'Ngày sản xuất không hợp lệ.',
  expiry_date_invalid: 'Hạn sử dụng không hợp lệ.',
  lot_and_serial_required: 'Cần nhập Lot/Batch number và Serial number.',
};

function errMsg(err?: string): string {
  if (!err) return 'Có lỗi xảy ra';
  return GS1_ERROR_LABELS[err] || err;
}

export default function GS1LabelDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [data, setData] = useState<GS1LabelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'units' | 'print'>('overview');

  function reload() {
    return api<GS1LabelDetail>(`/api/v1/admin/gs1/labels/${id}`).then((r) => {
      if (r.ok && r.data) setData(r.data);
      else setError(r.error || 'not_found');
      return r;
    });
  }

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (!data) return <Alert kind="danger" icon={AlertTriangle}>{errMsg(error || undefined)}</Alert>;

  const imgSrc = `/api/gs1-datamatrix?data=${encodeURIComponent(data.element_string)}&scale=8`;

  return (
    <div>
      <div className="mb-3">
        <Link href="/admin/gs1" className="inline-flex items-center gap-1 text-sm text-gov-600 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Danh sách mã GS1
        </Link>
      </div>

      <PageHeader
        icon={ScanBarcode}
        title={data.product_name || `GTIN ${data.gtin}`}
        subtitle={`Lô ${data.lot} · Serial ${data.serial}`}
      />

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <div className="flex gap-1">
          <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')} icon={Layers}>Tổng quan</TabBtn>
          <TabBtn active={tab === 'units'} onClick={() => setTab('units')} icon={ListChecks}>Tem đã in</TabBtn>
          <TabBtn active={tab === 'print'} onClick={() => setTab('print')} icon={Printer}>Xuất in</TabBtn>
        </div>
      </div>

      {tab === 'overview' && <OverviewTab data={data} imgSrc={imgSrc} onSaved={reload} />}
      {tab === 'units' && <UnitsTab labelId={id} />}
      {tab === 'print' && <PrintTab labelId={id} />}
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

// ============ Overview Tab ============
function OverviewTab({ data, imgSrc, onSaved }: { data: GS1LabelDetail; imgSrc: string; onSaved: () => Promise<any> }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <EditForm data={data} onCancel={() => setEditing(false)} onSaved={async () => { await onSaved(); setEditing(false); }} />;
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="card p-5 space-y-4">
        <div className="flex flex-col items-center gap-2 bg-gray-50 rounded-lg p-4">
          <img src={imgSrc} alt="GS1 DataMatrix" className="w-40 h-40" />
          <span className="text-[11px] text-gray-500 uppercase tracking-wide">DataMatrix (GS1)</span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            <Row label="Sản phẩm" value={data.product_name} />
            <Row label="GTIN (AI 01)" value={data.gtin} mono />
            <Row label="Lô (AI 10)" value={data.lot} mono />
            <Row label="Serial (AI 21)" value={data.serial} mono />
            <Row label="Ngày SX (AI 11)" value={fmtDateShort(data.manufacture_date)} />
            <Row label="HSD (AI 17)" value={data.expiry_date ? fmtDateShort(data.expiry_date) : null} />
            <Row label="Mã sản phẩm" value={data.product_code} />
            <Row label="Quy cách" value={data.spec} />
            <Row label="Kích thước" value={data.size_spec} />
            <Row label="Đơn vị" value={data.unit} />
            <Row label="Hãng sản xuất" value={data.manufacturer} />
            <Row label="Xuất xứ" value={data.origin_country} />
            <Row
              label="Thương hiệu"
              value={
                data.brand_name ? (
                  <span className="inline-flex items-center gap-2">
                    {data.brand_logo_url && (
                      <img
                        src={`${API_URL}/api/v1/brands/${data.brand_id}/logo/file`}
                        alt=""
                        className="w-5 h-5 object-contain rounded border border-gray-100 bg-gray-50"
                      />
                    )}
                    {data.brand_name}
                  </span>
                ) : null
              }
            />
          </tbody>
        </table>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className="btn-secondary flex-1 justify-center text-sm">
            <Pencil className="w-3.5 h-3.5" /> Sửa thông tin
          </button>
          <a
            href={imgSrc}
            download={`gs1_${data.lot}_${data.serial}.png`}
            className="btn-primary flex-1 justify-center text-sm"
          >
            Tải PNG DataMatrix
          </a>
        </div>
      </div>
    </div>
  );
}

// ============ Edit form (reuses the same fields as create) ============
const editableKeys = [
  'gtin', 'manufacture_date', 'expiry_date', 'lot', 'serial',
  'product_name', 'product_code', 'spec', 'size_spec', 'unit', 'manufacturer', 'origin_country',
] as const;
type EditFormState = Record<(typeof editableKeys)[number], string>;

function EditForm({ data, onCancel, onSaved }: { data: GS1LabelDetail; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<EditFormState>(() => {
    const f = {} as EditFormState;
    for (const k of editableKeys) f[k] = (data[k as keyof GS1LabelDetail] as string) || '';
    f.manufacture_date = f.manufacture_date.slice(0, 10);
    f.expiry_date = f.expiry_date.slice(0, 10);
    return f;
  });
  const [brand, setBrand] = useState<Brand | null>(
    data.brand_id ? { id: data.brand_id, name: data.brand_name || '', website: data.brand_website || null, has_logo: !!data.brand_logo_url, is_active: true } : null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof EditFormState>(key: K, value: string) {
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
    const r = await api(`/api/v1/admin/gs1/labels/${data.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...form, brand_id: brand?.id ?? null }),
    });
    setBusy(false);
    if (!r.ok) { setError(errMsg(r.error)); return; }
    await onSaved();
  }

  return (
    <form onSubmit={submit} className="max-w-2xl card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Pencil className="w-4 h-4 text-gov-600" />
        <h3 className="font-semibold text-gray-900 text-sm">Sửa thông tin mã GS1</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <EField label="GTIN (AI 01)" required>
          <input value={form.gtin} onChange={(e) => set('gtin', e.target.value)} className="form-input font-mono" />
        </EField>
        <EField label="Ngày sản xuất (AI 11)" required>
          <input type="date" value={form.manufacture_date} onChange={(e) => set('manufacture_date', e.target.value)} className="form-input" />
        </EField>
        <EField label="Hạn sử dụng (AI 17)">
          <input type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} className="form-input" />
        </EField>
        <EField label="Lot / Batch number (AI 10)" required>
          <input value={form.lot} onChange={(e) => set('lot', e.target.value)} className="form-input font-mono" />
        </EField>
        <EField label="Serial number (AI 21)" required>
          <input value={form.serial} onChange={(e) => set('serial', e.target.value)} className="form-input font-mono" />
        </EField>
        <EField label="Tên sản phẩm">
          <input value={form.product_name} onChange={(e) => set('product_name', e.target.value)} className="form-input" />
        </EField>
        <EField label="Mã sản phẩm">
          <input value={form.product_code} onChange={(e) => set('product_code', e.target.value)} className="form-input" />
        </EField>
        <EField label="Quy cách">
          <input value={form.spec} onChange={(e) => set('spec', e.target.value)} className="form-input" />
        </EField>
        <EField label="Kích thước">
          <input value={form.size_spec} onChange={(e) => set('size_spec', e.target.value)} className="form-input" />
        </EField>
        <EField label="Đơn vị">
          <input value={form.unit} onChange={(e) => set('unit', e.target.value)} className="form-input" />
        </EField>
        <EField label="Hãng sản xuất">
          <input value={form.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} className="form-input" />
        </EField>
        <EField label="Xuất xứ">
          <input value={form.origin_country} onChange={(e) => set('origin_country', e.target.value)} className="form-input" />
        </EField>
        <EField label="Thương hiệu">
          <BrandPicker value={brand} onChange={setBrand} />
        </EField>
      </div>

      {error && <Alert kind="danger" icon={AlertTriangle}>{error}</Alert>}

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary text-sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Lưu thay đổi
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary text-sm">
          <X className="w-4 h-4" /> Hủy
        </button>
      </div>
    </form>
  );
}

function EField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

// ============ Units Tab (paginated list of printed stickers) ============
interface GS1Unit {
  id: number;
  serial_no: number;
  serial: string | null;
  verify_code: string;
  scan_count: number;
  first_scanned_at: string | null;
  first_scan_city: string | null;
  status: string;
  created_at: string;
}

function UnitsTab({ labelId }: { labelId: number }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: GS1Unit[]; total: number; page: number; page_size: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<any>(`/api/v1/admin/gs1/labels/${labelId}/units?page=${page}&page_size=50`).then((r) => {
      if (r.ok && r.data) setData(r.data);
      setLoading(false);
    });
  }, [labelId, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 0;

  if (loading) return <Spinner />;
  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Chưa có tem nào được in"
        description="Sang tab Xuất in để tạo lô tem mới — mỗi tem sẽ có một mã xác minh riêng biệt."
      />
    );
  }

  return (
    <div>
      <div className="card p-3 mb-3 flex items-center">
        <span className="text-sm text-gray-500">{fmtNumber(data.total)} tem đã tạo (qua các lần xuất in)</span>
      </div>

      <div className="card overflow-hidden mb-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Mã xác minh</th>
                <th className="px-3 py-2">Serial GS1</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2 text-right">Số lần quét</th>
                <th className="px-3 py-2">Quét lần đầu</th>
                <th className="px-3 py-2">Vị trí</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{u.serial_no}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gov-700">{u.verify_code}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{u.serial || '—'}</td>
                  <td className="px-3 py-2">
                    {u.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" /> active
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700">{u.status}</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right text-xs font-medium ${u.scan_count > 1 ? 'text-red-600' : ''}`}>
                    {u.scan_count}
                  </td>
                  <td className="px-3 py-2 text-xs">{u.first_scanned_at ? fmtDate(u.first_scanned_at) : '—'}</td>
                  <td className="px-3 py-2 text-xs">{u.first_scan_city || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => download(`/api/v1/admin/gs1/units/${u.id}/qr.png`, `gs1_unit_${u.verify_code}.png`)}
                      className="text-xs text-gov-600 hover:underline"
                    >
                      Tải QR
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-center items-center gap-2">
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
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: React.ReactNode; mono?: boolean }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="py-1.5 pr-3 text-xs text-gray-500 whitespace-nowrap align-top">{label}</td>
      <td className={`py-1.5 text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</td>
    </tr>
  );
}

// ============ Print Tab (print-ready PDF / SVG export) ============
const MAX_COPIES = 1000;
const SHEET_PRESETS_MM: Record<string, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  '33x48cm': [330, 480],
};

interface TemplateOption {
  id: number;
  name: string;
  width_mm: number;
  height_mm: number;
  file_type: 'png' | 'jpg' | 'svg';
}

function PrintTab({ labelId }: { labelId: number }) {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [loadingTpl, setLoadingTpl] = useState(true);

  const [quantity, setQuantity] = useState(1);
  const [sheetPreset, setSheetPreset] = useState<'A4' | 'A3' | 'A5' | 'Letter' | '33x48cm' | 'custom'>('A4');
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');
  const [marginMM, setMarginMM] = useState(5);
  const [gutterMM, setGutterMM] = useState(2);
  const [qrPx, setQrPx] = useState(320);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<TemplateOption[]>('/api/v1/admin/templates').then((r) => {
      if (r.ok && r.data) {
        setTemplates(r.data);
        if (r.data.length > 0) setTemplateId(r.data[0].id);
      }
      setLoadingTpl(false);
    });
  }, []);

  const tpl = templates.find((t) => t.id === templateId) || null;
  const sheetDims: [number, number] | null =
    sheetPreset === 'custom'
      ? (Number(customW) > 0 && Number(customH) > 0 ? [Number(customW), Number(customH)] : null)
      : SHEET_PRESETS_MM[sheetPreset];

  let grid: { cols: number; rows: number } | null = null;
  let gridError: string | null = null;
  if (tpl && tpl.file_type !== 'svg' && sheetDims) {
    const usableW = sheetDims[0] - 2 * marginMM;
    const usableH = sheetDims[1] - 2 * marginMM;
    if (usableW <= 0 || usableH <= 0) {
      gridError = 'Lề quá lớn so với khổ giấy.';
    } else {
      const cols = Math.floor((usableW + gutterMM) / (tpl.width_mm + gutterMM));
      const rows = Math.floor((usableH + gutterMM) / (tpl.height_mm + gutterMM));
      if (cols < 1 || rows < 1) gridError = 'Tem lớn hơn khổ giấy sau khi trừ lề.';
      else grid = { cols, rows };
    }
  }
  const perSheet = grid ? grid.cols * grid.rows : 0;
  const sheetCount = perSheet > 0 ? Math.ceil(quantity / perSheet) : 0;

  function validate(): string | null {
    if (!tpl) return 'Chọn mẫu tem trước.';
    if (quantity < 1 || quantity > MAX_COPIES) return `Số lượng bản in phải từ 1 đến ${MAX_COPIES}.`;
    return null;
  }

  async function exportPDF() {
    const v = validate();
    if (v) { setError(v); return; }
    if (gridError) { setError(gridError); return; }
    setError(null);
    setBusy(true);
    try {
      await downloadPost(
        `/api/v1/admin/gs1/labels/${labelId}/export-labels.pdf`,
        {
          template_id: tpl!.id,
          quantity,
          sheet_preset: sheetPreset === 'custom' ? '' : sheetPreset,
          sheet_w_mm: sheetPreset === 'custom' ? Number(customW) : 0,
          sheet_h_mm: sheetPreset === 'custom' ? Number(customH) : 0,
          margin_mm: marginMM,
          gutter_mm: gutterMM,
          qr_px: qrPx,
        },
        `gs1_${labelId}_labels.pdf`
      );
    } catch (e: any) {
      setError(e.message || 'Xuất PDF thất bại');
    }
    setBusy(false);
  }

  async function exportSVGZip() {
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setBusy(true);
    try {
      await downloadPost(
        `/api/v1/admin/gs1/labels/${labelId}/export-labels-svg.zip`,
        { template_id: tpl!.id, quantity, qr_px: qrPx },
        `gs1_${labelId}_labels_svg.zip`
      );
    } catch (e: any) {
      setError(e.message || 'Xuất ZIP thất bại');
    }
    setBusy(false);
  }

  if (loadingTpl) return <Spinner />;

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={FileImage}
        title="Chưa có mẫu tem nào"
        description="Tải lên mẫu thiết kế tem (ảnh hoặc SVG) trong thư viện Mẫu tem in trước khi xuất file gửi in."
        action={
          <Link href="/admin/templates" className="btn-primary">
            <FileImage className="w-4 h-4" /> Đến thư viện mẫu tem
          </Link>
        }
      />
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="card p-6 space-y-5">
        <div>
          <h3 className="font-semibold text-gray-900 mb-1">Xuất file in tem hoàn thiện</h3>
          <p className="text-sm text-gray-600">
            Mã GS1 DataMatrix được ghép sẵn lên đúng vị trí trên mẫu tem — dùng cho xưởng in không có tính năng tự tạo mã.
          </p>
        </div>

        {/* Template picker */}
        <div>
          <label className="form-label">Mẫu tem</label>
          <div className="flex items-center gap-2">
            <select
              value={templateId ?? ''}
              onChange={(e) => setTemplateId(Number(e.target.value))}
              className="form-input flex-1"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.width_mm}×{t.height_mm}mm — {t.file_type.toUpperCase()}
                </option>
              ))}
            </select>
            {tpl && (
              <Link
                href={`/admin/templates/${tpl.id}`}
                target="_blank"
                className="btn-secondary text-sm whitespace-nowrap"
              >
                <Settings2 className="w-4 h-4" /> Chỉnh vị trí <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label className="form-label">Số lượng bản in <span className="text-red-500">*</span></label>
          <div className="flex items-center gap-3">
            <input type="number" min={1} max={MAX_COPIES} value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(MAX_COPIES, parseInt(e.target.value) || 1)))}
              className="form-input font-mono w-32" />
            <span className="text-sm text-gray-500">tem — mỗi tem 1 mã xác minh riêng</span>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {[1, 10, 50, 100, 500, 1000].map((n) => (
              <button type="button" key={n} onClick={() => setQuantity(n)}
                className="px-2 py-1 rounded text-xs bg-gov-50 text-gov-700 hover:bg-gov-100">
                {n}
              </button>
            ))}
          </div>
        </div>

        {tpl && tpl.file_type !== 'svg' && (
          <>
            {/* Sheet size */}
            <div>
              <label className="form-label">Khổ giấy</label>
              <div className="flex gap-1.5 flex-wrap">
                {(['A4', 'A3', 'A5', 'Letter', '33x48cm'] as const).map((p) => (
                  <button type="button" key={p} onClick={() => setSheetPreset(p)}
                    className={`px-3 py-1.5 rounded text-xs font-medium border ${
                      sheetPreset === p ? 'bg-gov-500 text-white border-gov-500' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {p}
                  </button>
                ))}
                <button type="button" onClick={() => setSheetPreset('custom')}
                  className={`px-3 py-1.5 rounded text-xs font-medium border ${
                    sheetPreset === 'custom' ? 'bg-gov-500 text-white border-gov-500' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}>
                  Tùy chỉnh
                </button>
              </div>
              {sheetPreset === 'custom' && (
                <div className="flex items-center gap-3 mt-2">
                  <input type="number" min={1} value={customW} onChange={(e) => setCustomW(e.target.value)}
                    placeholder="Rộng (mm)" className="form-input w-32" />
                  <span className="text-gray-400">×</span>
                  <input type="number" min={1} value={customH} onChange={(e) => setCustomH(e.target.value)}
                    placeholder="Cao (mm)" className="form-input w-32" />
                </div>
              )}
            </div>

            {/* Margin / gutter */}
            <div className="flex gap-4">
              <div>
                <label className="form-label">Lề (mm)</label>
                <input type="number" min={0} step="0.5" value={marginMM}
                  onChange={(e) => setMarginMM(Number(e.target.value) || 0)} className="form-input w-28" />
              </div>
              <div>
                <label className="form-label">Khoảng cách tem (mm)</label>
                <input type="number" min={0} step="0.5" value={gutterMM}
                  onChange={(e) => setGutterMM(Number(e.target.value) || 0)} className="form-input w-28" />
              </div>
              <div>
                <label className="form-label">Độ phân giải QR (px)</label>
                <input type="number" min={128} max={1024} step={32} value={qrPx}
                  onChange={(e) => setQrPx(Number(e.target.value) || 320)} className="form-input w-28" />
              </div>
            </div>

            {/* Grid preview */}
            {gridError ? (
              <Alert kind="danger">{gridError}</Alert>
            ) : grid ? (
              <Alert kind="info">
                <strong>{grid.cols} cột × {grid.rows} hàng</strong> = {perSheet} tem/trang →{' '}
                <strong>{sheetCount} trang</strong> cho {quantity} tem.
              </Alert>
            ) : null}
          </>
        )}

        {error && <Alert kind="danger" icon={AlertTriangle}>{errMsg(error)}</Alert>}

        {tpl?.file_type === 'svg' ? (
          <button type="button" onClick={exportSVGZip} disabled={busy} className="btn-primary">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
            {busy ? 'Đang xuất...' : `Tải ZIP (SVG) — ${quantity} tem`}
          </button>
        ) : (
          <button type="button" onClick={exportPDF} disabled={busy || !!gridError} className="btn-primary">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {busy ? 'Đang xuất...' : `Tải PDF — ${quantity} tem`}
          </button>
        )}
      </div>
    </div>
  );
}

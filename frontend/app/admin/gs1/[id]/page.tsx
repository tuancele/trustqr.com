'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ScanBarcode, ArrowLeft, Layers, Printer, Loader2, AlertTriangle,
  FileImage, FileArchive, Settings2, ExternalLink, XCircle,
} from 'lucide-react';
import { api, downloadPost, fetchBlobUrl } from '@/lib/adminApi';
import { PageHeader, Spinner, Alert, EmptyState } from '@/components/ui';
import { fmtDateShort, fmtDate } from '@/lib/utils';

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
  unit: string | null;
  manufacturer: string | null;
  origin_country: string | null;
  created_at: string;
  element_string: string;
  verify_code: string | null;
  scan_count: number;
  first_scanned_at: string | null;
  first_scan_city: string | null;
  status: string;
}

const GS1_ERROR_LABELS: Record<string, string> = {
  not_found: 'Không tìm thấy mã này.',
  template_not_found: 'Không tìm thấy mẫu tem.',
  template_not_raster: 'Mẫu tem này là SVG — hãy dùng nút Tải ZIP (SVG).',
  template_not_vector: 'Mẫu tem này không phải SVG — hãy dùng nút Tải PDF.',
  quantity_too_large: 'Số lượng bản in vượt quá giới hạn cho phép.',
  dm_scale_out_of_range: 'Độ nét mã không hợp lệ.',
  datamatrix_render_failed: 'Không tạo được mã GS1 DataMatrix (có thể GTIN sai checksum).',
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
  const [tab, setTab] = useState<'overview' | 'print'>('overview');

  useEffect(() => {
    setLoading(true);
    api<GS1LabelDetail>(`/api/v1/admin/gs1/labels/${id}`).then((r) => {
      if (r.ok && r.data) setData(r.data);
      else setError(r.error || 'not_found');
      setLoading(false);
    });
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
          <TabBtn active={tab === 'print'} onClick={() => setTab('print')} icon={Printer}>Xuất in</TabBtn>
        </div>
      </div>

      {tab === 'overview' && <OverviewTab data={data} imgSrc={imgSrc} />}
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
function OverviewTab({ data, imgSrc }: { data: GS1LabelDetail; imgSrc: string }) {
  const [qrBlobUrl, setQrBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    fetchBlobUrl(`/api/v1/admin/gs1/labels/${data.id}/qr.png`).then((url) => {
      revoke = url;
      setQrBlobUrl(url);
    }).catch(() => setQrBlobUrl(null));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [data.id]);

  const isSuspicious = data.scan_count > 1 || data.status !== 'active';

  return (
    <div className="max-w-lg space-y-5">
      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center gap-2 bg-gray-50 rounded-lg p-4">
            <img src={imgSrc} alt="GS1 DataMatrix" className="w-40 h-40" />
            <span className="text-[11px] text-gray-500 uppercase tracking-wide">DataMatrix (GS1)</span>
          </div>
          <div className="flex flex-col items-center gap-2 bg-gray-50 rounded-lg p-4">
            {qrBlobUrl ? (
              <img src={qrBlobUrl} alt="Verify QR" className="w-40 h-40" />
            ) : (
              <div className="w-40 h-40 flex items-center justify-center text-gray-400 text-xs">Đang tải...</div>
            )}
            <span className="text-[11px] text-gray-500 uppercase tracking-wide">QR xác minh (/auth)</span>
          </div>
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
            <Row label="Đơn vị" value={data.unit} />
            <Row label="Hãng sản xuất" value={data.manufacturer} />
            <Row label="Xuất xứ" value={data.origin_country} />
            <Row label="Mã xác minh" value={data.verify_code} mono />
          </tbody>
        </table>
        <div className="flex gap-2">
          <a
            href={imgSrc}
            download={`gs1_${data.lot}_${data.serial}.png`}
            className="btn-primary flex-1 justify-center text-sm"
          >
            Tải PNG DataMatrix
          </a>
          {qrBlobUrl && (
            <a
              href={qrBlobUrl}
              download={`gs1_${data.lot}_${data.serial}_verify.png`}
              className="btn-secondary flex-1 justify-center text-sm"
            >
              Tải PNG QR xác minh
            </a>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-1">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Thống kê quét</h3>
        <table className="w-full text-sm">
          <tbody>
            <Row
              label="Số lần quét"
              value={
                <span className={isSuspicious ? 'font-bold text-red-600' : 'font-bold text-emerald-600'}>
                  {data.scan_count}
                </span>
              }
            />
            <Row label="Quét lần đầu" value={data.first_scanned_at ? fmtDate(data.first_scanned_at) : null} />
            <Row label="Vị trí quét đầu" value={data.first_scan_city} />
            <Row label="Trạng thái" value={data.status} />
          </tbody>
        </table>
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
const MAX_COPIES = 500;
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
  const [dmScale, setDmScale] = useState(8);

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
          dm_scale: dmScale,
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
        { template_id: tpl!.id, quantity, dm_scale: dmScale },
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
            <span className="text-sm text-gray-500">tem (cùng một mã GS1 này)</span>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {[1, 10, 50, 100, 500].map((n) => (
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
                <label className="form-label">Độ nét mã</label>
                <input type="number" min={2} max={12} step="1" value={dmScale}
                  onChange={(e) => setDmScale(Number(e.target.value) || 8)} className="form-input w-28" />
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

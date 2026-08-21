'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Package, ArrowLeft, Download, FileArchive, Edit3, Loader2, Layers,
  ShieldCheck, CheckCircle2, XCircle, Truck, Zap, ChevronLeft, ChevronRight,
  Printer, FileImage, Settings2, ExternalLink,
} from 'lucide-react';
import { api, download, downloadPost } from '@/lib/adminApi';
import { PageHeader, Spinner, Alert, StatCard, StatusBadge, EmptyState } from '@/components/ui';
import { fmtNumber, fmtDate } from '@/lib/utils';
import { ProductPicker } from '@/components/ProductPicker';
import { DistributorPicker } from '@/components/DistributorPicker';

interface BatchDetail {
  batch: {
    id: number;
    batch_code: string;
    default_product_id: number | null;
    default_product_name: string | null;
    total_qty: number;
    notes: string | null;
    created_at: string;
  };
  summary: {
    total: number;
    assigned: number;
    unassigned: number;
    ready: number;
    activated: number;
    scanned: number;
  };
  assignments: Array<{
    id: number;
    from_serial: number;
    to_serial: number;
    product_id: number | null;
    product_name: string | null;
    distributor_id: number | null;
    distributor_name: string | null;
    tokens_updated: number;
    notes: string | null;
    assigned_at: string;
    assigned_by_email: string | null;
  }>;
}

interface Token {
  id: number;
  serial_no: number;
  secret_code: string;
  status: string;
  scan_count: number;
  is_ready: boolean;
  is_activated: boolean;
  product_id: number | null;
  product_name: string | null;
  distributor_id: number | null;
  distributor_name: string | null;
  activated_phone: string | null;
}

export default function BatchDetailPage({ params }: { params: { id: string } }) {
  const batchId = Number(params.id);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'tokens' | 'assign' | 'print'>('overview');

  // Không bật spinner khi refresh (giữ nguyên form + thông báo thành công của tab Gán dải)
  const loadDetail = () => {
    api<BatchDetail>(`/api/v1/admin/batches/${batchId}`).then((r) => {
      if (r.ok && r.data) setDetail(r.data);
      setLoading(false);
    });
  };
  useEffect(loadDetail, [batchId]);

  if (loading) return <Spinner />;
  if (!detail) return <Alert kind="danger">Không tải được lô này</Alert>;

  const s = detail.summary;
  const b = detail.batch;

  return (
    <div>
      <div className="mb-3">
        <Link href="/admin/batches" className="inline-flex items-center gap-1 text-sm text-gov-600 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Danh sách lô
        </Link>
      </div>

      <PageHeader
        icon={Package}
        title={`Lô ${b.batch_code}`}
        subtitle={`${fmtNumber(b.total_qty)} tem · tạo ${fmtDate(b.created_at)}`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => download(`/api/v1/admin/batches/${b.id}/export.csv`, `batch_${b.id}.csv`)}
              className="btn-secondary text-sm"><Download className="w-4 h-4" /> CSV</button>
            <button onClick={() => download(`/api/v1/admin/batches/${b.id}/export.zip`, `batch_${b.id}_qr.zip`)}
              className="btn-gold text-sm"><FileArchive className="w-4 h-4" /> ZIP QR</button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Tổng tem"     value={fmtNumber(s.total)}      icon={Package}      tone="gov" />
        <StatCard label="Đã gán SP"    value={fmtNumber(s.assigned)}   icon={CheckCircle2} tone="emerald" />
        <StatCard label="Chưa gán"     value={fmtNumber(s.unassigned)} icon={XCircle}      tone="gold" sub={`${((s.unassigned / s.total) * 100).toFixed(1)}%`} />
        <StatCard label="Đã kích hoạt" value={fmtNumber(s.activated)}  icon={ShieldCheck}  tone="purple" />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <div className="flex gap-1">
          <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')} icon={Layers}>Tổng quan</TabBtn>
          <TabBtn active={tab === 'assign'}   onClick={() => setTab('assign')}   icon={Zap}>Gán dải tem</TabBtn>
          <TabBtn active={tab === 'tokens'}   onClick={() => setTab('tokens')}   icon={Package}>Tem chi tiết</TabBtn>
          <TabBtn active={tab === 'print'}    onClick={() => setTab('print')}    icon={Printer}>Xuất in</TabBtn>
        </div>
      </div>

      {tab === 'overview' && <OverviewTab detail={detail} />}
      {tab === 'assign'   && (
        <AssignTab
          batchId={batchId}
          total={b.total_qty}
          nextSerial={computeNextSerial(detail)}
          onDone={loadDetail}
        />
      )}
      {tab === 'tokens'   && <TokensTab batchId={batchId} />}
      {tab === 'print'    && <PrintTab batchId={batchId} total={b.total_qty} nextSerial={computeNextSerial(detail)} />}
    </div>
  );
}

/**
 * Serial kế tiếp chưa được gán = (serial lớn nhất đã gán) + 1.
 * Lô chưa gán lần nào → 1.
 */
function computeNextSerial(detail: BatchDetail): number {
  const maxTo = detail.assignments.reduce((m, a) => Math.max(m, a.to_serial), 0);
  return maxTo + 1;
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

// ============ Overview Tab (assignment history) ============
function OverviewTab({ detail }: { detail: BatchDetail }) {
  const a = detail.assignments;
  return (
    <div className="space-y-6">
      {detail.batch.notes && (
        <div className="card p-4 text-sm text-gray-700">
          <span className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Ghi chú lô</span>
          {detail.batch.notes}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Lịch sử gán dải</h3>
          <p className="text-xs text-gray-500 mt-0.5">Mỗi lần admin gán product/đại lý cho một dải serial</p>
        </div>
        {a.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            Chưa có lần gán nào. Vào tab <strong>Gán dải tem</strong> để bắt đầu.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase">
                  <th className="px-4 py-2.5">Dải serial</th>
                  <th className="px-4 py-2.5">Sản phẩm</th>
                  <th className="px-4 py-2.5">Đại lý</th>
                  <th className="px-4 py-2.5 text-right">Số tem</th>
                  <th className="px-4 py-2.5">Ghi chú</th>
                  <th className="px-4 py-2.5">Thời gian</th>
                  <th className="px-4 py-2.5">Bởi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {a.map((x) => (
                  <tr key={x.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <span className="text-gov-700 font-semibold">#{fmtNumber(x.from_serial)}</span>
                      <span className="text-gray-400 mx-1">→</span>
                      <span className="text-gov-700 font-semibold">#{fmtNumber(x.to_serial)}</span>
                    </td>
                    <td className="px-4 py-2.5">{x.product_name || <em className="text-gray-400">—</em>}</td>
                    <td className="px-4 py-2.5">{x.distributor_name || <em className="text-gray-400">—</em>}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{fmtNumber(x.tokens_updated)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{x.notes || '—'}</td>
                    <td className="px-4 py-2.5 text-xs">{fmtDate(x.assigned_at)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{x.assigned_by_email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Assign Tab (range selector + product/distributor picker) ============
function AssignTab({ batchId, total, nextSerial, onDone }: {
  batchId: number; total: number; nextSerial: number; onDone: () => void;
}) {
  const exhausted = nextSerial > total;
  const [fromSerial, setFromSerial] = useState(nextSerial);
  const [toSerial, setToSerial] = useState(Math.min(nextSerial + 999, total));
  const [product, setProduct] = useState<any>(null);
  const [distributor, setDistributor] = useState<any>(null);
  const [markReady, setMarkReady] = useState(true);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sau mỗi lần gán thành công, detail reload → nextSerial đổi → tự nhảy sang tem tiếp theo
  useEffect(() => {
    setFromSerial(nextSerial);
    setToSerial(Math.min(nextSerial + 999, total));
  }, [nextSerial, total]);

  const rangeCount = Math.max(0, toSerial - fromSerial + 1);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (fromSerial < 1 || toSerial < fromSerial) { setError('Dải serial không hợp lệ'); return; }
    if (!product && !distributor && !markReady) { setError('Cần chọn ít nhất một hành động'); return; }
    const recap = [
      `Dải serial: #${fmtNumber(fromSerial)} → #${fmtNumber(toSerial)} (${fmtNumber(rangeCount)} tem)`,
      `Sản phẩm:   ${product?.name || '— không đổi —'}`,
      `Đại lý:     ${distributor?.name || '— không đổi —'}`,
      markReady ? 'Kích hoạt:  CÓ (tem dùng được ngay)' : 'Kích hoạt:  KHÔNG',
    ].join('\n');
    if (!confirm(`Xác nhận gán dải tem?\n\n${recap}`)) return;

    setBusy(true);
    const r = await api(`/api/v1/admin/batches/${batchId}/assign-range`, {
      method: 'POST',
      body: JSON.stringify({
        from_serial: fromSerial,
        to_serial: toSerial,
        product_id: product?.id || 0,
        distributor_id: distributor?.id || 0,
        mark_ready: markReady,
        notes,
      }),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error || 'Lỗi'); return; }
    setSuccess(
      `Đã gán ${fmtNumber((r.data as any).tokens_updated)} tem (#${fmtNumber(fromSerial)} → #${fmtNumber(toSerial)}). ` +
      `Form đã tự nhảy sang tem tiếp theo #${fmtNumber(toSerial + 1)}.`
    );
    setNotes('');
    onDone();
  }

  return (
    <form onSubmit={submit} className="max-w-3xl">
      <div className="card p-6 space-y-5">
        <div>
          <h3 className="font-semibold text-gray-900 mb-1">Gán product / đại lý cho dải tem</h3>
          <p className="text-sm text-gray-600">
            Chọn dải serial → chọn sản phẩm & đại lý → kích hoạt để dùng được.
          </p>
        </div>

        {/* Range selector */}
        <div>
          <label className="form-label">Dải serial <span className="text-red-500">*</span></label>
          <div className="flex items-center gap-3">
            <input type="number" min={1} max={total} value={fromSerial}
              onChange={(e) => setFromSerial(Math.max(1, parseInt(e.target.value) || 1))}
              className="form-input font-mono w-32" placeholder="Từ" />
            <span className="text-gray-400">→</span>
            <input type="number" min={fromSerial} max={total} value={toSerial}
              onChange={(e) => setToSerial(Math.min(total, parseInt(e.target.value) || 0))}
              className="form-input font-mono w-32" placeholder="Đến" />
            <span className="text-sm">
              = <strong className="text-gov-700">{fmtNumber(rangeCount)}</strong> tem
            </span>
          </div>

          {/* Con trỏ tem tiếp theo */}
          <div className="mt-2 flex items-start gap-2 text-xs">
            {exhausted ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200">
                <XCircle className="w-3.5 h-3.5" />
                Đã gán hết {fmtNumber(total)} tem của lô này
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Tem tiếp theo chưa gán: <strong className="font-mono">#{fmtNumber(nextSerial)}</strong>
                {nextSerial > 1 && <span className="text-emerald-600">(đã gán tới #{fmtNumber(nextSerial - 1)})</span>}
              </span>
            )}
          </div>

          {fromSerial < nextSerial && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Dải này chồng lấn tem đã gán trước đó (#1 → #{fmtNumber(nextSerial - 1)}) — sẽ ghi đè sản phẩm/đại lý cũ.
            </p>
          )}

          <p className="text-xs text-gray-500 mt-1.5">Lô này có tổng {fmtNumber(total)} tem (serial 1 → {fmtNumber(total)})</p>

          {/* Quick presets */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {[100, 500, 1000, 5000, 10000].filter((n) => n <= total).map((n) => (
              <button type="button" key={n}
                onClick={() => setToSerial(Math.min(total, fromSerial + n - 1))}
                className="px-2 py-1 rounded text-xs bg-gov-50 text-gov-700 hover:bg-gov-100">
                + {fmtNumber(n)}
              </button>
            ))}
            <button type="button" disabled={exhausted}
              onClick={() => { setFromSerial(nextSerial); setToSerial(Math.min(nextSerial + 999, total)); }}
              className="px-2 py-1 rounded text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40">
              ⤳ Từ tem tiếp theo (#{fmtNumber(nextSerial)})
            </button>
            <button type="button" onClick={() => { setFromSerial(1); setToSerial(total); }}
              className="px-2 py-1 rounded text-xs bg-gold-50 text-gold-700 hover:bg-gold-100">
              Chọn tất cả
            </button>
          </div>
        </div>

        {/* Product picker */}
        <div>
          <label className="form-label">Gán cho sản phẩm</label>
          <ProductPicker value={product} onChange={setProduct} />
        </div>

        {/* Distributor picker */}
        <div>
          <label className="form-label">Gán cho đại lý</label>
          <DistributorPicker value={distributor} onChange={setDistributor} />
        </div>

        {/* Options */}
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={markReady}
              onChange={(e) => setMarkReady(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
            <div className="text-sm">
              <div className="font-medium text-emerald-800">Kích hoạt dải tem này</div>
              <div className="text-xs text-emerald-700">Đánh dấu <code>is_ready=TRUE</code> — tem sẵn sàng phân phối ra thị trường</div>
            </div>
          </label>
        </div>

        <div>
          <label className="form-label">Ghi chú <span className="text-gray-400 font-normal">(tùy chọn)</span></label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            className="form-input min-h-[70px]"
            placeholder="VD: Giao cho Đại lý HN ngày 05/08/2026, PO#123..." />
        </div>

        {error && <Alert kind="danger">{error}</Alert>}
        {success && <Alert kind="success">{success}</Alert>}

        <button type="submit" disabled={busy || rangeCount === 0} className="btn-primary">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {busy ? 'Đang gán...' : `Gán ${fmtNumber(rangeCount)} tem`}
        </button>
      </div>
    </form>
  );
}

// ============ Print Tab (print-ready PDF / SVG export) ============
const MAX_EXPORT_TOKENS = 2000;
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
  has_cutline: boolean;
}

function PrintTab({ batchId, total, nextSerial }: { batchId: number; total: number; nextSerial: number }) {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [loadingTpl, setLoadingTpl] = useState(true);

  const rangeStart = Math.min(nextSerial > total ? 1 : nextSerial, total || 1);
  const [fromSerial, setFromSerial] = useState(rangeStart);
  const [toSerial, setToSerial] = useState(Math.min(total, rangeStart + MAX_EXPORT_TOKENS - 1));

  const [sheetPreset, setSheetPreset] = useState<'A4' | 'A3' | 'A5' | 'Letter' | '33x48cm' | 'custom'>('A4');
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');
  const [marginMM, setMarginMM] = useState(5);
  const [gutterMM, setGutterMM] = useState(2);
  const [qrPx, setQrPx] = useState(320);

  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF');
  const [includeCutline, setIncludeCutline] = useState(false);
  const [ekeThicknessMM, setEkeThicknessMM] = useState(3);
  const [ekeArmMM, setEkeArmMM] = useState(40);
  const [ekeTopOffsetMM, setEkeTopOffsetMM] = useState(3.8);
  const [ekeSideOffsetMM, setEkeSideOffsetMM] = useState(5);

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

  useEffect(() => {
    if (tpl && !tpl.has_cutline) setIncludeCutline(false);
  }, [tpl]);
  const rangeCount = Math.max(0, toSerial - fromSerial + 1);
  // Custom width/height are entered in cm (matching the "33x48cm"-style preset
  // buttons above), then converted to mm here to match SHEET_PRESETS_MM and
  // what the backend expects — entering raw mm was a common source of
  // accidentally-tiny sheets (e.g. typing "32" for 32cm produced a 32mm sheet).
  const customWMM = Number(customW) * 10;
  const customHMM = Number(customH) * 10;
  const sheetDims: [number, number] | null =
    sheetPreset === 'custom'
      ? (customWMM > 0 && customHMM > 0 ? [customWMM, customHMM] : null)
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
  const sheetCount = perSheet > 0 ? Math.ceil(rangeCount / perSheet) : 0;

  function validateRange(): string | null {
    if (!tpl) return 'Chọn mẫu tem trước.';
    if (fromSerial < 1 || toSerial < fromSerial) return 'Dải serial không hợp lệ.';
    if (rangeCount > MAX_EXPORT_TOKENS) return `Mỗi lượt xuất tối đa ${fmtNumber(MAX_EXPORT_TOKENS)} tem — hãy chia nhỏ dải.`;
    return null;
  }

  async function exportPDF() {
    const v = validateRange();
    if (v) { setError(v); return; }
    if (gridError) { setError(gridError); return; }
    setError(null);
    setBusy(true);
    try {
      await downloadPost(
        `/api/v1/admin/batches/${batchId}/export-labels.pdf`,
        {
          template_id: tpl!.id,
          from_serial: fromSerial,
          to_serial: toSerial,
          sheet_preset: sheetPreset === 'custom' ? '' : sheetPreset,
          sheet_w_mm: sheetPreset === 'custom' ? customWMM : 0,
          sheet_h_mm: sheetPreset === 'custom' ? customHMM : 0,
          margin_mm: marginMM,
          gutter_mm: gutterMM,
          qr_px: qrPx,
          background_color: backgroundColor,
          include_cutline: includeCutline,
          eke_thickness_mm: ekeThicknessMM,
          eke_arm_mm: ekeArmMM,
          eke_top_offset_mm: ekeTopOffsetMM,
          eke_side_offset_mm: ekeSideOffsetMM,
        },
        `batch_${batchId}_labels.pdf`
      );
    } catch (e: any) {
      setError(e.message || 'Xuất PDF thất bại');
    }
    setBusy(false);
  }

  async function exportSVGZip() {
    const v = validateRange();
    if (v) { setError(v); return; }
    setError(null);
    setBusy(true);
    try {
      await downloadPost(
        `/api/v1/admin/batches/${batchId}/export-labels-svg.zip`,
        { template_id: tpl!.id, from_serial: fromSerial, to_serial: toSerial, qr_px: qrPx },
        `batch_${batchId}_labels_svg.zip`
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
            QR được ghép sẵn lên đúng vị trí trên mẫu tem — dùng cho xưởng in không có tính năng tự tạo QR từ URL.
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

        {/* Range selector */}
        <div>
          <label className="form-label">Dải serial <span className="text-red-500">*</span></label>
          <div className="flex items-center gap-3">
            <input type="number" min={1} max={total} value={fromSerial}
              onChange={(e) => setFromSerial(Math.max(1, parseInt(e.target.value) || 1))}
              className="form-input font-mono w-32" placeholder="Từ" />
            <span className="text-gray-400">→</span>
            <input type="number" min={fromSerial} max={total} value={toSerial}
              onChange={(e) => setToSerial(Math.min(total, parseInt(e.target.value) || 0))}
              className="form-input font-mono w-32" placeholder="Đến" />
            <span className="text-sm">
              = <strong className="text-gov-700">{fmtNumber(rangeCount)}</strong> tem
            </span>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {[100, 500, 1000, 2000].filter((n) => n <= total).map((n) => (
              <button type="button" key={n}
                onClick={() => setToSerial(Math.min(total, fromSerial + n - 1))}
                className="px-2 py-1 rounded text-xs bg-gov-50 text-gov-700 hover:bg-gov-100">
                + {fmtNumber(n)}
              </button>
            ))}
          </div>
          {rangeCount > MAX_EXPORT_TOKENS && (
            <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 inline-flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> Mỗi lượt xuất tối đa {fmtNumber(MAX_EXPORT_TOKENS)} tem.
            </p>
          )}
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
                  <input type="number" min={1} step="0.1" value={customW} onChange={(e) => setCustomW(e.target.value)}
                    placeholder="Rộng (cm)" className="form-input w-32" />
                  <span className="text-gray-400">×</span>
                  <input type="number" min={1} step="0.1" value={customH} onChange={(e) => setCustomH(e.target.value)}
                    placeholder="Cao (cm)" className="form-input w-32" />
                </div>
              )}
            </div>

            {/* Margin / gutter */}
            <div className="flex gap-4">
              <div>
                <label className="form-label">Lề (mm)</label>
                <input type="number" min={0} step="0.1" value={marginMM}
                  onChange={(e) => setMarginMM(Number(e.target.value) || 0)} className="form-input w-28" />
              </div>
              <div>
                <label className="form-label">Khoảng cách tem (mm)</label>
                <input type="number" min={0} step="0.1" value={gutterMM}
                  onChange={(e) => setGutterMM(Number(e.target.value) || 0)} className="form-input w-28" />
              </div>
              <div>
                <label className="form-label">Độ phân giải QR (px)</label>
                <input type="number" min={128} max={1024} step="32" value={qrPx}
                  onChange={(e) => setQrPx(Number(e.target.value) || 320)} className="form-input w-28" />
              </div>
              <div>
                <label className="form-label">Màu nền</label>
                <input type="color" value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)} className="h-9 w-16 rounded border border-gray-300 p-0.5" />
              </div>
            </div>

            {/* Cutline + eke */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-2">
                <input
                  id="include_cutline" type="checkbox"
                  checked={includeCutline}
                  disabled={!tpl.has_cutline}
                  onChange={(e) => setIncludeCutline(e.target.checked)}
                  className="rounded border-gray-300 text-gov-600 focus:ring-gov-500 disabled:opacity-50"
                />
                <label htmlFor="include_cutline" className="text-sm text-gray-700">
                  Thêm trang khuôn cắt (cutline) cuối file PDF
                </label>
              </div>
              {!tpl.has_cutline && (
                <p className="text-xs text-amber-600 mt-1">
                  Mẫu tem này chưa có file khuôn cắt — tải lên trong trang "Chỉnh vị trí" để bật tuỳ chọn này.
                </p>
              )}

              <div className="flex gap-4 flex-wrap mt-3">
                <div>
                  <label className="form-label">Độ dày eke (mm)</label>
                  <input type="number" min={0} step="0.1" value={ekeThicknessMM}
                    onChange={(e) => setEkeThicknessMM(Number(e.target.value) || 0)} className="form-input w-24" />
                </div>
                <div>
                  <label className="form-label">Cạnh eke (mm)</label>
                  <input type="number" min={0} step="0.1" value={ekeArmMM}
                    onChange={(e) => setEkeArmMM(Number(e.target.value) || 0)} className="form-input w-24" />
                </div>
                <div>
                  <label className="form-label">Lề trên eke (mm)</label>
                  <input type="number" min={0} step="0.1" value={ekeTopOffsetMM}
                    onChange={(e) => setEkeTopOffsetMM(Number(e.target.value) || 0)} className="form-input w-24" />
                </div>
                <div>
                  <label className="form-label">Lề cạnh eke (mm)</label>
                  <input type="number" min={0} step="0.1" value={ekeSideOffsetMM}
                    onChange={(e) => setEkeSideOffsetMM(Number(e.target.value) || 0)} className="form-input w-24" />
                </div>
              </div>
            </div>

            {/* Grid preview */}
            {gridError ? (
              <Alert kind="danger">{gridError}</Alert>
            ) : grid ? (
              <Alert kind="info">
                <strong>{grid.cols} cột × {grid.rows} hàng</strong> = {fmtNumber(perSheet)} tem/trang →{' '}
                <strong>{fmtNumber(sheetCount)} trang</strong> cho {fmtNumber(rangeCount)} tem.
              </Alert>
            ) : null}
          </>
        )}

        {error && <Alert kind="danger">{error}</Alert>}

        {tpl?.file_type === 'svg' ? (
          <button type="button" onClick={exportSVGZip} disabled={busy || rangeCount === 0} className="btn-primary">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
            {busy ? 'Đang xuất...' : `Tải ZIP (SVG) — ${fmtNumber(rangeCount)} tem`}
          </button>
        ) : (
          <button type="button" onClick={exportPDF} disabled={busy || rangeCount === 0 || !!gridError} className="btn-primary">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {busy ? 'Đang xuất...' : `Tải PDF — ${fmtNumber(rangeCount)} tem`}
          </button>
        )}
      </div>
    </div>
  );
}

// ============ Tokens Tab (paginated list) ============
function TokensTab({ batchId }: { batchId: number }) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [data, setData] = useState<{ tokens: Token[]; total: number; page: number; page_size: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: '50' });
    if (filter) params.set('filter', filter);
    api<any>(`/api/v1/admin/batches/${batchId}/tokens?${params}`).then((r) => {
      if (r.ok && r.data) setData(r.data);
      setLoading(false);
    });
  }, [batchId, page, filter]);

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0;

  return (
    <div>
      <div className="card p-3 mb-3 flex gap-2 flex-wrap items-center">
        <span className="text-sm text-gray-600 mr-2">Lọc:</span>
        {[
          ['', 'Tất cả'],
          ['unassigned', 'Chưa gán SP'],
          ['assigned', 'Đã gán'],
          ['ready', 'Kích hoạt'],
          ['activated', 'Kh.hàng đã dùng'],
        ].map(([v, l]) => (
          <button key={v}
            onClick={() => { setFilter(v); setPage(1); }}
            className={`px-3 py-1 rounded text-xs font-medium ${
              filter === v ? 'bg-gov-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}>{l}</button>
        ))}
        <span className="ml-auto text-sm text-gray-500">
          {data && `${fmtNumber(data.total)} tem`}
        </span>
      </div>

      {loading ? <Spinner /> : !data || data.tokens.length === 0 ? (
        <div className="card p-8 text-center text-gray-500 text-sm">Không có tem nào khớp bộ lọc</div>
      ) : (
        <>
          <div className="card overflow-hidden mb-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Secret code</th>
                    <th className="px-3 py-2">Sản phẩm</th>
                    <th className="px-3 py-2">Đại lý</th>
                    <th className="px-3 py-2">Kích hoạt</th>
                    <th className="px-3 py-2">Trạng thái</th>
                    <th className="px-3 py-2 text-right">Scans</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.tokens.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{t.serial_no}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gov-700">{t.secret_code}</td>
                      <td className="px-3 py-2">{t.product_name || <em className="text-gray-400 text-xs">chưa gán</em>}</td>
                      <td className="px-3 py-2">{t.distributor_name || <em className="text-gray-400 text-xs">—</em>}</td>
                      <td className="px-3 py-2">
                        {t.is_ready ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
                      <td className="px-3 py-2 text-right text-xs">{t.scan_count}</td>
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
        </>
      )}
    </div>
  );
}

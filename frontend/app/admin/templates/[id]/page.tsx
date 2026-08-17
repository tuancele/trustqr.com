'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, QrCode, Loader2 } from 'lucide-react';
import { api, fetchBlobUrl } from '@/lib/adminApi';
import { PageHeader, Spinner, Alert } from '@/components/ui';

interface Template {
  id: number;
  name: string;
  width_mm: number;
  height_mm: number;
  file_type: 'png' | 'jpg' | 'svg';
  qr_x_ratio: number;
  qr_y_ratio: number;
  qr_size_ratio: number;
  is_gs1: boolean;
  barcode_x_ratio: number;
  barcode_y_ratio: number;
  barcode_w_ratio: number;
  barcode_h_ratio: number;
  text1_x_ratio: number;
  text1_y_ratio: number;
  text1_size_ratio: number;
  text2_x_ratio: number;
  text2_y_ratio: number;
  text2_size_ratio: number;
}

interface QRState { x: number; y: number; size: number; }
interface BoxState { x: number; y: number; w: number; h: number; }
interface TextState { x: number; y: number; size: number; }

type DragTarget = 'qr' | 'barcode' | 'text1' | 'text2';
type DragMode = 'move' | 'resize';

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

export default function TemplatePositionPage({ params }: { params: { id: string } }) {
  const templateId = Number(params.id);
  const [tpl, setTpl] = useState<Template | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [qr, setQr] = useState<QRState>({ x: 0.65, y: 0.65, size: 0.25 });
  const [barcode, setBarcode] = useState<BoxState>({ x: 0.1, y: 0.42, w: 0.55, h: 0.18 });
  const [text1, setText1] = useState<TextState>({ x: 0.1, y: 0.61, size: 0.045 });
  const [text2, setText2] = useState<TextState>({ x: 0.1, y: 0.9, size: 0.045 });

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState(0);

  const dragRef = useRef<{
    target: DragTarget;
    mode: DragMode;
    startClientX: number;
    startClientY: number;
    startQR: QRState;
    startBarcode: BoxState;
    startText: TextState;
  } | null>(null);

  useEffect(() => {
    api<Template>(`/api/v1/admin/templates/${templateId}`).then((r) => {
      if (r.ok && r.data) {
        const t = r.data;
        setTpl(t);
        setQr({ x: t.qr_x_ratio, y: t.qr_y_ratio, size: t.qr_size_ratio });
        setBarcode({ x: t.barcode_x_ratio, y: t.barcode_y_ratio, w: t.barcode_w_ratio, h: t.barcode_h_ratio });
        setText1({ x: t.text1_x_ratio, y: t.text1_y_ratio, size: t.text1_size_ratio });
        setText2({ x: t.text2_x_ratio, y: t.text2_y_ratio, size: t.text2_size_ratio });
      } else {
        setError(r.error || 'Không tải được mẫu tem');
      }
    });
    fetchBlobUrl(`/api/v1/admin/templates/${templateId}/preview`).then(setPreviewUrl).catch(() => {});
  }, [templateId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidthPx(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tpl]);

  const aspectWH = tpl ? tpl.width_mm / tpl.height_mm : 1;
  const qrHeightRatio = clamp(qr.size * aspectWH, 0, 1);

  function onBoxPointerDown(e: React.PointerEvent, target: DragTarget, mode: DragMode) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      target, mode,
      startClientX: e.clientX, startClientY: e.clientY,
      startQR: qr, startBarcode: barcode, startText: target === 'text1' ? text1 : text2,
    };
  }

  function onContainerPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || !containerRef.current || !tpl) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (e.clientX - drag.startClientX) / rect.width;
    const dy = (e.clientY - drag.startClientY) / rect.height;

    if (drag.target === 'qr') {
      const s = drag.startQR;
      if (drag.mode === 'move') {
        const hRatio = clamp(s.size * aspectWH, 0, 1);
        setQr({ size: s.size, x: clamp(s.x + dx, 0, 1 - s.size), y: clamp(s.y + dy, 0, 1 - hRatio) });
      } else {
        const maxBySpaceX = 1 - s.x;
        const maxBySpaceY = (1 - s.y) / aspectWH;
        setQr({ ...s, size: clamp(s.size + dx, 0.03, Math.min(maxBySpaceX, maxBySpaceY, 1)) });
      }
    } else if (drag.target === 'barcode') {
      const s = drag.startBarcode;
      if (drag.mode === 'move') {
        setBarcode({ ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) });
      } else {
        setBarcode({
          ...s,
          w: clamp(s.w + dx, 0.02, 1 - s.x),
          h: clamp(s.h + dy, 0.02, 1 - s.y),
        });
      }
    } else {
      const s = drag.startText;
      const setter = drag.target === 'text1' ? setText1 : setText2;
      if (drag.mode === 'move') {
        setter({ ...s, x: clamp(s.x + dx, 0, 1), y: clamp(s.y + dy, 0, 1) });
      } else {
        setter({ ...s, size: clamp(s.size + dx, 0.01, 0.3) });
      }
    }
  }

  function endDrag() {
    dragRef.current = null;
  }

  async function save() {
    if (!tpl) return;
    setSaving(true);
    setSavedMsg(null);
    const body: Record<string, number> = {
      qr_x_ratio: qr.x, qr_y_ratio: qr.y, qr_size_ratio: qr.size,
    };
    if (tpl.is_gs1) {
      body.barcode_x_ratio = barcode.x;
      body.barcode_y_ratio = barcode.y;
      body.barcode_w_ratio = barcode.w;
      body.barcode_h_ratio = barcode.h;
      body.text1_x_ratio = text1.x;
      body.text1_y_ratio = text1.y;
      body.text1_size_ratio = text1.size;
      body.text2_x_ratio = text2.x;
      body.text2_y_ratio = text2.y;
      body.text2_size_ratio = text2.size;
    }
    const r = await api(`/api/v1/admin/templates/${tpl.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (r.ok) setSavedMsg('Đã lưu vị trí.');
    else setError(r.error || 'Lưu thất bại');
  }

  if (error && !tpl) return <Alert kind="danger">{error}</Alert>;
  if (!tpl) return <Spinner />;

  return (
    <div>
      <div className="mb-3">
        <Link href="/admin/templates" className="inline-flex items-center gap-1 text-sm text-gov-600 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Thư viện mẫu tem
        </Link>
      </div>

      <PageHeader
        icon={QrCode}
        title={`Vị trí ${tpl.is_gs1 ? 'đối tượng' : 'QR'} — ${tpl.name}`}
        subtitle={`Kéo khung để di chuyển, kéo góc dưới-phải để đổi kích thước. Kích thước tem: ${tpl.width_mm} × ${tpl.height_mm} mm`}
        actions={
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Đang lưu...' : 'Lưu vị trí'}
          </button>
        }
      />

      {savedMsg && <div className="mb-4"><Alert kind="success">{savedMsg}</Alert></div>}
      {error && <div className="mb-4"><Alert kind="danger">{error}</Alert></div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div
            ref={containerRef}
            className="relative w-full select-none touch-none bg-gray-100 rounded-lg overflow-hidden border border-gray-200"
            style={{ aspectRatio: `${tpl.width_mm} / ${tpl.height_mm}` }}
            onPointerMove={onContainerPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
          >
            {previewUrl && (
              // object-fill: the export pipeline stretches the template to exactly
              // width_mm x height_mm too, so the editor must match that 1:1 to be WYSIWYG.
              <img
                src={previewUrl}
                alt={tpl.name}
                className="absolute inset-0 w-full h-full object-fill pointer-events-none"
              />
            )}

            <div
              className="absolute border-2 border-gov-500 bg-gov-500/20 cursor-move flex items-start justify-start"
              style={{
                left: `${qr.x * 100}%`, top: `${qr.y * 100}%`,
                width: `${qr.size * 100}%`, height: `${qrHeightRatio * 100}%`,
              }}
              onPointerDown={(e) => onBoxPointerDown(e, 'qr', 'move')}
            >
              <span className="text-[10px] font-semibold text-gov-700 bg-white/80 px-1 rounded pointer-events-none">
                QR
              </span>
              <div
                className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-gov-600 rounded-full border-2 border-white cursor-nwse-resize"
                onPointerDown={(e) => onBoxPointerDown(e, 'qr', 'resize')}
              />
            </div>

            {tpl.is_gs1 && (
              <>
                <div
                  className="absolute border-2 border-violet-500 bg-violet-500/20 cursor-move flex items-center justify-center overflow-hidden"
                  style={{
                    left: `${barcode.x * 100}%`, top: `${barcode.y * 100}%`,
                    width: `${barcode.w * 100}%`, height: `${barcode.h * 100}%`,
                  }}
                  onPointerDown={(e) => onBoxPointerDown(e, 'barcode', 'move')}
                >
                  <span className="text-[10px] font-semibold text-violet-700 bg-white/80 px-1 rounded pointer-events-none absolute top-0.5 left-0.5">
                    Barcode
                  </span>
                  <div className="w-full h-full flex items-center justify-center gap-[2px] px-2 pointer-events-none opacity-60">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div key={i} className="bg-violet-800 h-3/5" style={{ width: i % 3 === 0 ? '3px' : '1.5px' }} />
                    ))}
                  </div>
                  <div
                    className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-violet-600 rounded-full border-2 border-white cursor-nwse-resize"
                    onPointerDown={(e) => onBoxPointerDown(e, 'barcode', 'resize')}
                  />
                </div>

                <TextBox
                  label="Serial 1" state={text1} color="amber" containerWidthPx={containerWidthPx}
                  onMoveDown={(e) => onBoxPointerDown(e, 'text1', 'move')}
                  onResizeDown={(e) => onBoxPointerDown(e, 'text1', 'resize')}
                />
                <TextBox
                  label="Serial 2" state={text2} color="emerald" containerWidthPx={containerWidthPx}
                  onMoveDown={(e) => onBoxPointerDown(e, 'text2', 'move')}
                  onResizeDown={(e) => onBoxPointerDown(e, 'text2', 'resize')}
                />
              </>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <RatioPanel title="QR" color="gov">
            <NumField label="Vị trí X (%)" value={qr.x} max={1 - qr.size}
              onChange={(v) => setQr((s) => ({ ...s, x: clamp(v, 0, 1 - s.size) }))} />
            <NumField label="Vị trí Y (%)" value={qr.y} max={1 - qrHeightRatio}
              onChange={(v) => setQr((s) => ({ ...s, y: clamp(v, 0, 1 - qrHeightRatio) }))} />
            <NumField label="Cạnh (% chiều rộng tem)" value={qr.size} min={0.03}
              onChange={(v) => setQr((s) => ({ ...s, size: clamp(v, 0.03, 1) }))} />
            <p className="text-xs text-gray-400">
              ≈ {(qr.size * tpl.width_mm).toFixed(1)} × {(qr.size * tpl.width_mm).toFixed(1)} mm
            </p>
          </RatioPanel>

          {tpl.is_gs1 && (
            <>
              <RatioPanel title="Barcode" color="violet">
                <NumField label="Vị trí X (%)" value={barcode.x} max={1 - barcode.w}
                  onChange={(v) => setBarcode((s) => ({ ...s, x: clamp(v, 0, 1 - s.w) }))} />
                <NumField label="Vị trí Y (%)" value={barcode.y} max={1 - barcode.h}
                  onChange={(v) => setBarcode((s) => ({ ...s, y: clamp(v, 0, 1 - s.h) }))} />
                <NumField label="Rộng (% chiều rộng tem)" value={barcode.w} min={0.02}
                  onChange={(v) => setBarcode((s) => ({ ...s, w: clamp(v, 0.02, 1) }))} />
                <NumField label="Cao (% chiều rộng tem)" value={barcode.h} min={0.02}
                  onChange={(v) => setBarcode((s) => ({ ...s, h: clamp(v, 0.02, 1) }))} />
              </RatioPanel>

              <RatioPanel title="Text — Serial 1" color="amber">
                <NumField label="Vị trí X (%)" value={text1.x} onChange={(v) => setText1((s) => ({ ...s, x: clamp(v, 0, 1) }))} />
                <NumField label="Vị trí Y (%)" value={text1.y} onChange={(v) => setText1((s) => ({ ...s, y: clamp(v, 0, 1) }))} />
                <NumField label="Cỡ chữ (% chiều rộng tem)" value={text1.size} min={0.01} max={0.3}
                  onChange={(v) => setText1((s) => ({ ...s, size: clamp(v, 0.01, 0.3) }))} />
              </RatioPanel>

              <RatioPanel title="Text — Serial 2" color="emerald">
                <NumField label="Vị trí X (%)" value={text2.x} onChange={(v) => setText2((s) => ({ ...s, x: clamp(v, 0, 1) }))} />
                <NumField label="Vị trí Y (%)" value={text2.y} onChange={(v) => setText2((s) => ({ ...s, y: clamp(v, 0, 1) }))} />
                <NumField label="Cỡ chữ (% chiều rộng tem)" value={text2.size} min={0.01} max={0.3}
                  onChange={(v) => setText2((s) => ({ ...s, size: clamp(v, 0.01, 0.3) }))} />
              </RatioPanel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TextBox({
  label, state, color, containerWidthPx, onMoveDown, onResizeDown,
}: {
  label: string;
  state: TextState;
  color: 'amber' | 'emerald';
  containerWidthPx: number;
  onMoveDown: (e: React.PointerEvent) => void;
  onResizeDown: (e: React.PointerEvent) => void;
}) {
  const border = color === 'amber' ? 'border-amber-500' : 'border-emerald-500';
  const bg = color === 'amber' ? 'bg-amber-500/20' : 'bg-emerald-500/20';
  const text = color === 'amber' ? 'text-amber-700' : 'text-emerald-700';
  const dot = color === 'amber' ? 'bg-amber-600' : 'bg-emerald-600';
  const fontSizePx = Math.max(state.size * containerWidthPx, 8);
  return (
    <div
      className={`absolute border-2 ${border} ${bg} cursor-move flex items-center px-1 whitespace-nowrap`}
      style={{ left: `${state.x * 100}%`, top: `${state.y * 100}%` }}
      onPointerDown={onMoveDown}
    >
      <span
        className={`font-mono font-semibold ${text} pointer-events-none`}
        style={{ fontSize: `${fontSizePx}px`, lineHeight: 1.1 }}
      >
        {label}
      </span>
      <div
        className={`absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 ${dot} rounded-full border-2 border-white cursor-nwse-resize`}
        onPointerDown={onResizeDown}
      />
    </div>
  );
}

const RATIO_PANEL_COLORS = {
  gov: { text: 'text-gov-700', dot: 'bg-gov-500' },
  violet: { text: 'text-violet-700', dot: 'bg-violet-500' },
  amber: { text: 'text-amber-700', dot: 'bg-amber-500' },
  emerald: { text: 'text-emerald-700', dot: 'bg-emerald-500' },
} as const;

function RatioPanel({
  title, color, children,
}: { title: string; color: keyof typeof RATIO_PANEL_COLORS; children: React.ReactNode }) {
  const c = RATIO_PANEL_COLORS[color];
  return (
    <div className="card p-4 space-y-3">
      <h3 className={`font-semibold text-sm flex items-center gap-1.5 ${c.text}`}>
        <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} /> {title}
      </h3>
      {children}
    </div>
  );
}

function NumField({
  label, value, min = 0, max = 1, onChange,
}: {
  label: string; value: number; min?: number; max?: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number" step="0.5" min={Math.round(min * 100)} max={Math.round(max * 100)}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="form-input"
      />
    </div>
  );
}

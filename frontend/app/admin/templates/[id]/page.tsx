'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, QrCode, Loader2, Plus, Trash2 } from 'lucide-react';
import { api, fetchBlobUrl } from '@/lib/adminApi';
import { PageHeader, Spinner, Alert } from '@/components/ui';

interface TextObjectAPI {
  id: string;
  field: string;
  x_ratio: number;
  y_ratio: number;
  size_ratio: number;
  bold: boolean;
  rotate_180: boolean;
}

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
  text_objects: TextObjectAPI[];
}

interface QRState { x: number; y: number; size: number; }
interface BoxState { x: number; y: number; w: number; h: number; }
interface TextObjState {
  id: string;
  field: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
  rotate180: boolean;
}

type DragTarget = 'qr' | 'barcode' | string;
type DragMode = 'move' | 'resize';

const FIELD_LABELS: Record<string, string> = {
  gtin: 'GTIN (AI 01)',
  lot: 'Lô (AI 10)',
  serial: 'Serial (AI 21)',
  manufacture_date: 'Ngày SX (AI 11)',
  expiry_date: 'HSD (AI 17)',
  product_code: 'Mã sản phẩm',
  spec: 'Quy cách',
  size_spec: 'Kích thước',
};

const DEMO_VALUES: Record<string, string> = {
  gtin: '08809460304701',
  lot: 'R02511110020',
  serial: 'A25L350981',
  manufacture_date: '17/8/2026',
  expiry_date: '17/8/2031',
  product_code: 'C010400955',
  spec: 'FXS4508',
  size_spec: '4.0mm(⌀) X 10.0mm(L)',
};

const FIELD_OPTIONS = Object.keys(FIELD_LABELS);

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

function newObjectId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `obj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
  const [textObjects, setTextObjects] = useState<TextObjState[]>([]);
  const [newFieldPick, setNewFieldPick] = useState('serial');

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState(0);

  const dragRef = useRef<{
    target: DragTarget;
    mode: DragMode;
    startClientX: number;
    startClientY: number;
    startQR: QRState;
    startBarcode: BoxState;
    startText: TextObjState | null;
  } | null>(null);

  useEffect(() => {
    api<Template>(`/api/v1/admin/templates/${templateId}`).then((r) => {
      if (r.ok && r.data) {
        const t = r.data;
        setTpl(t);
        setQr({ x: t.qr_x_ratio, y: t.qr_y_ratio, size: t.qr_size_ratio });
        setBarcode({ x: t.barcode_x_ratio, y: t.barcode_y_ratio, w: t.barcode_w_ratio, h: t.barcode_h_ratio });
        setTextObjects(
          (t.text_objects || []).map((o) => ({
            id: o.id, field: o.field, x: o.x_ratio, y: o.y_ratio, size: o.size_ratio,
            bold: o.bold, rotate180: o.rotate_180,
          }))
        );
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

  function updateTextObject(id: string, patch: Partial<TextObjState>) {
    setTextObjects((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function addTextObject() {
    const count = textObjects.length;
    setTextObjects((list) => [
      ...list,
      {
        id: newObjectId(), field: newFieldPick,
        x: 0.1, y: clamp(0.1 + count * 0.06, 0, 0.9), size: 0.045,
        bold: false, rotate180: false,
      },
    ]);
  }

  function removeTextObject(id: string) {
    setTextObjects((list) => list.filter((t) => t.id !== id));
  }

  function onBoxPointerDown(e: React.PointerEvent, target: DragTarget, mode: DragMode) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      target, mode,
      startClientX: e.clientX, startClientY: e.clientY,
      startQR: qr, startBarcode: barcode,
      startText: textObjects.find((t) => t.id === target) || null,
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
    } else if (drag.startText) {
      const s = drag.startText;
      if (drag.mode === 'move') {
        updateTextObject(drag.target, { x: clamp(s.x + dx, 0, 1), y: clamp(s.y + dy, 0, 1) });
      } else {
        updateTextObject(drag.target, { size: clamp(s.size + dx, 0.01, 0.3) });
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
    const body: Record<string, unknown> = {
      qr_x_ratio: qr.x, qr_y_ratio: qr.y, qr_size_ratio: qr.size,
    };
    if (tpl.is_gs1) {
      body.barcode_x_ratio = barcode.x;
      body.barcode_y_ratio = barcode.y;
      body.barcode_w_ratio = barcode.w;
      body.barcode_h_ratio = barcode.h;
      body.text_objects = textObjects.map((t) => ({
        id: t.id, field: t.field, x_ratio: t.x, y_ratio: t.y, size_ratio: t.size,
        bold: t.bold, rotate_180: t.rotate180,
      }));
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

                {textObjects.map((t, i) => (
                  <TextBox
                    key={t.id}
                    label={FIELD_LABELS[t.field] || t.field}
                    value={DEMO_VALUES[t.field] || t.field}
                    state={t}
                    colorKey={TEXT_COLOR_KEYS[i % TEXT_COLOR_KEYS.length]}
                    containerWidthPx={containerWidthPx}
                    onMoveDown={(e) => onBoxPointerDown(e, t.id, 'move')}
                    onResizeDown={(e) => onBoxPointerDown(e, t.id, 'resize')}
                  />
                ))}
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

              <div className="card p-4 space-y-2">
                <label className="block text-xs font-medium text-gray-600">Thêm trường vị trí</label>
                <div className="flex gap-2">
                  <select
                    value={newFieldPick}
                    onChange={(e) => setNewFieldPick(e.target.value)}
                    className="form-input flex-1"
                  >
                    {FIELD_OPTIONS.map((f) => (
                      <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                    ))}
                  </select>
                  <button type="button" onClick={addTextObject} className="btn-secondary whitespace-nowrap">
                    <Plus className="w-3.5 h-3.5" /> Thêm
                  </button>
                </div>
              </div>

              {textObjects.map((t, i) => {
                const colorKey = TEXT_COLOR_KEYS[i % TEXT_COLOR_KEYS.length];
                return (
                  <RatioPanel key={t.id} title={FIELD_LABELS[t.field] || t.field} color={colorKey}
                    actions={
                      <button type="button" onClick={() => removeTextObject(t.id)}
                        className="text-gray-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    }
                  >
                    <NumField label="Vị trí X (%)" value={t.x} onChange={(v) => updateTextObject(t.id, { x: clamp(v, 0, 1) })} />
                    <NumField label="Vị trí Y (%)" value={t.y} onChange={(v) => updateTextObject(t.id, { y: clamp(v, 0, 1) })} />
                    <NumField label="Cỡ chữ (% chiều rộng tem)" value={t.size} min={0.01} max={0.3}
                      onChange={(v) => updateTextObject(t.id, { size: clamp(v, 0.01, 0.3) })} />
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Kiểu chữ (Arial)</label>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => updateTextObject(t.id, { bold: false })}
                          className={`flex-1 px-2 py-1 rounded text-xs font-medium border ${!t.bold ? 'bg-gov-500 text-white border-gov-500' : 'bg-white text-gray-700 border-gray-200'}`}>
                          Regular
                        </button>
                        <button type="button" onClick={() => updateTextObject(t.id, { bold: true })}
                          className={`flex-1 px-2 py-1 rounded text-xs font-bold border ${t.bold ? 'bg-gov-500 text-white border-gov-500' : 'bg-white text-gray-700 border-gray-200'}`}>
                          Bold
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Hướng chữ</label>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => updateTextObject(t.id, { rotate180: false })}
                          className={`flex-1 px-2 py-1 rounded text-xs font-medium border ${!t.rotate180 ? 'bg-gov-500 text-white border-gov-500' : 'bg-white text-gray-700 border-gray-200'}`}>
                          Bình thường
                        </button>
                        <button type="button" onClick={() => updateTextObject(t.id, { rotate180: true })}
                          className={`flex-1 px-2 py-1 rounded text-xs font-medium border ${t.rotate180 ? 'bg-gov-500 text-white border-gov-500' : 'bg-white text-gray-700 border-gray-200'}`}>
                          Ngược 180°
                        </button>
                      </div>
                    </div>
                  </RatioPanel>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const TEXT_COLOR_KEYS = ['amber', 'emerald', 'rose', 'cyan', 'fuchsia', 'lime', 'sky', 'orange'] as const;
type TextColorKey = (typeof TEXT_COLOR_KEYS)[number];

const TEXT_COLOR_STYLES: Record<TextColorKey, { border: string; bg: string; text: string; dot: string }> = {
  amber: { border: 'border-amber-500', bg: 'bg-amber-500/20', text: 'text-amber-700', dot: 'bg-amber-600' },
  emerald: { border: 'border-emerald-500', bg: 'bg-emerald-500/20', text: 'text-emerald-700', dot: 'bg-emerald-600' },
  rose: { border: 'border-rose-500', bg: 'bg-rose-500/20', text: 'text-rose-700', dot: 'bg-rose-600' },
  cyan: { border: 'border-cyan-500', bg: 'bg-cyan-500/20', text: 'text-cyan-700', dot: 'bg-cyan-600' },
  fuchsia: { border: 'border-fuchsia-500', bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-700', dot: 'bg-fuchsia-600' },
  lime: { border: 'border-lime-500', bg: 'bg-lime-500/20', text: 'text-lime-700', dot: 'bg-lime-600' },
  sky: { border: 'border-sky-500', bg: 'bg-sky-500/20', text: 'text-sky-700', dot: 'bg-sky-600' },
  orange: { border: 'border-orange-500', bg: 'bg-orange-500/20', text: 'text-orange-700', dot: 'bg-orange-600' },
};

function TextBox({
  label, value, state, colorKey, containerWidthPx, onMoveDown, onResizeDown,
}: {
  label: string;
  value: string;
  state: TextObjState;
  colorKey: TextColorKey;
  containerWidthPx: number;
  onMoveDown: (e: React.PointerEvent) => void;
  onResizeDown: (e: React.PointerEvent) => void;
}) {
  const c = TEXT_COLOR_STYLES[colorKey];
  const fontSizePx = Math.max(state.size * containerWidthPx, 8);
  return (
    <div
      className={`absolute border-2 ${c.border} ${c.bg} cursor-move flex items-center px-1 whitespace-nowrap`}
      style={{ left: `${state.x * 100}%`, top: `${state.y * 100}%` }}
      onPointerDown={onMoveDown}
    >
      <span className={`text-[9px] font-semibold ${c.text} bg-white/80 px-1 rounded pointer-events-none absolute -top-4 left-0`}>
        {label}
      </span>
      <span
        className={`${c.text} pointer-events-none`}
        style={{
          fontSize: `${fontSizePx}px`,
          lineHeight: 1.1,
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontWeight: state.bold ? 700 : 400,
          transform: state.rotate180 ? 'rotate(180deg)' : undefined,
        }}
      >
        {value}
      </span>
      <div
        className={`absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 ${c.dot} rounded-full border-2 border-white cursor-nwse-resize`}
        onPointerDown={onResizeDown}
      />
    </div>
  );
}

const RATIO_PANEL_COLORS: Record<'gov' | 'violet' | TextColorKey, { text: string; dot: string }> = {
  gov: { text: 'text-gov-700', dot: 'bg-gov-500' },
  violet: { text: 'text-violet-700', dot: 'bg-violet-500' },
  amber: { text: TEXT_COLOR_STYLES.amber.text, dot: TEXT_COLOR_STYLES.amber.dot },
  emerald: { text: TEXT_COLOR_STYLES.emerald.text, dot: TEXT_COLOR_STYLES.emerald.dot },
  rose: { text: TEXT_COLOR_STYLES.rose.text, dot: TEXT_COLOR_STYLES.rose.dot },
  cyan: { text: TEXT_COLOR_STYLES.cyan.text, dot: TEXT_COLOR_STYLES.cyan.dot },
  fuchsia: { text: TEXT_COLOR_STYLES.fuchsia.text, dot: TEXT_COLOR_STYLES.fuchsia.dot },
  lime: { text: TEXT_COLOR_STYLES.lime.text, dot: TEXT_COLOR_STYLES.lime.dot },
  sky: { text: TEXT_COLOR_STYLES.sky.text, dot: TEXT_COLOR_STYLES.sky.dot },
  orange: { text: TEXT_COLOR_STYLES.orange.text, dot: TEXT_COLOR_STYLES.orange.dot },
};

function RatioPanel({
  title, color, actions, children,
}: { title: string; color: keyof typeof RATIO_PANEL_COLORS; actions?: React.ReactNode; children: React.ReactNode }) {
  const c = RATIO_PANEL_COLORS[color];
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className={`font-semibold text-sm flex items-center gap-1.5 ${c.text}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} /> {title}
        </h3>
        {actions}
      </div>
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

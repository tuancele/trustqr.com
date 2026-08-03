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
}

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

  const [xRatio, setXRatio] = useState(0.65);
  const [yRatio, setYRatio] = useState(0.65);
  const [sizeRatio, setSizeRatio] = useState(0.25);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragMode = useRef<'move' | 'resize' | null>(null);
  const dragStart = useRef({ x: 0, y: 0, xRatio: 0, yRatio: 0, sizeRatio: 0 });

  useEffect(() => {
    api<Template>(`/api/v1/admin/templates/${templateId}`).then((r) => {
      if (r.ok && r.data) {
        setTpl(r.data);
        setXRatio(r.data.qr_x_ratio);
        setYRatio(r.data.qr_y_ratio);
        setSizeRatio(r.data.qr_size_ratio);
      } else {
        setError(r.error || 'Không tải được mẫu tem');
      }
    });
    fetchBlobUrl(`/api/v1/admin/templates/${templateId}/preview`).then(setPreviewUrl).catch(() => {});
  }, [templateId]);

  const aspectWH = tpl ? tpl.width_mm / tpl.height_mm : 1;
  const heightRatio = tpl ? clamp(sizeRatio * aspectWH, 0, 1) : sizeRatio;

  function onBoxPointerDown(e: React.PointerEvent, mode: 'move' | 'resize') {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragMode.current = mode;
    dragStart.current = { x: e.clientX, y: e.clientY, xRatio, yRatio, sizeRatio };
  }

  function onContainerPointerMove(e: React.PointerEvent) {
    if (!dragMode.current || !containerRef.current || !tpl) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragStart.current.x) / rect.width;
    const dy = (e.clientY - dragStart.current.y) / rect.height;

    if (dragMode.current === 'move') {
      const hRatio = clamp(dragStart.current.sizeRatio * aspectWH, 0, 1);
      const nx = clamp(dragStart.current.xRatio + dx, 0, 1 - dragStart.current.sizeRatio);
      const ny = clamp(dragStart.current.yRatio + dy, 0, 1 - hRatio);
      setXRatio(nx);
      setYRatio(ny);
    } else {
      const maxBySpaceX = 1 - dragStart.current.xRatio;
      const maxBySpaceY = (1 - dragStart.current.yRatio) / aspectWH;
      const ns = clamp(dragStart.current.sizeRatio + dx, 0.03, Math.min(maxBySpaceX, maxBySpaceY, 1));
      setSizeRatio(ns);
    }
  }

  function endDrag() {
    dragMode.current = null;
  }

  async function save() {
    if (!tpl) return;
    setSaving(true);
    setSavedMsg(null);
    const r = await api(`/api/v1/admin/templates/${tpl.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ qr_x_ratio: xRatio, qr_y_ratio: yRatio, qr_size_ratio: sizeRatio }),
    });
    setSaving(false);
    if (r.ok) setSavedMsg('Đã lưu vị trí QR.');
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
        title={`Vị trí QR — ${tpl.name}`}
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
                left: `${xRatio * 100}%`,
                top: `${yRatio * 100}%`,
                width: `${sizeRatio * 100}%`,
                height: `${heightRatio * 100}%`,
              }}
              onPointerDown={(e) => onBoxPointerDown(e, 'move')}
            >
              <span className="text-[10px] font-semibold text-gov-700 bg-white/80 px-1 rounded pointer-events-none">
                QR
              </span>
              <div
                className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-gov-600 rounded-full border-2 border-white cursor-nwse-resize"
                onPointerDown={(e) => onBoxPointerDown(e, 'resize')}
              />
            </div>
          </div>
        </div>

        <div className="card p-4 h-fit space-y-4">
          <h3 className="font-semibold text-gray-900 text-sm">Tọa độ chính xác</h3>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vị trí X (% chiều rộng)</label>
            <input
              type="number" step="1" min={0} max={Math.round((1 - sizeRatio) * 100)}
              value={Math.round(xRatio * 100)}
              onChange={(e) => setXRatio(clamp(Number(e.target.value) / 100, 0, 1 - sizeRatio))}
              className="form-input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vị trí Y (% chiều cao)</label>
            <input
              type="number" step="1" min={0} max={Math.round((1 - heightRatio) * 100)}
              value={Math.round(yRatio * 100)}
              onChange={(e) => setYRatio(clamp(Number(e.target.value) / 100, 0, 1 - heightRatio))}
              className="form-input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cạnh QR (% chiều rộng tem)</label>
            <input
              type="number" step="1" min={3} max={100}
              value={Math.round(sizeRatio * 100)}
              onChange={(e) => setSizeRatio(clamp(Number(e.target.value) / 100, 0.03, 1))}
              className="form-input"
            />
            <p className="text-xs text-gray-400 mt-1">
              ≈ {(sizeRatio * tpl.width_mm).toFixed(1)} mm × {(sizeRatio * tpl.width_mm).toFixed(1)} mm
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { GalleryHorizontal, Upload, Loader2, Trash2, ArrowUp, ArrowDown, ExternalLink, Save } from 'lucide-react';
import { api, uploadForm } from '@/lib/adminApi';
import { PageHeader, Spinner, EmptyState, Alert } from '@/components/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface Banner {
  id: number;
  url: string;
  link_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export default function BannersPage() {
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    api<Banner[]>('/api/v1/admin/banners').then((r) => {
      if (r.ok && r.data) setItems(r.data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    const fd = new FormData();
    fd.append('file', file);
    const r = await uploadForm('/api/v1/admin/banners', fd);
    setUploading(false);
    if (r.ok) load(); else setErr(r.error || 'Tải banner thất bại');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function update(id: number, body: Partial<Pick<Banner, 'link_url' | 'is_active' | 'sort_order'>>) {
    const r = await api(`/api/v1/admin/banners/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (r.ok) load(); else alert('Lỗi: ' + r.error);
  }

  async function del(b: Banner) {
    if (!confirm('Xóa banner này?')) return;
    const r = await api(`/api/v1/admin/banners/${b.id}`, { method: 'DELETE' });
    if (r.ok) load(); else alert('Lỗi: ' + r.error);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[index];
    const b = items[target];
    Promise.all([
      api(`/api/v1/admin/banners/${a.id}`, { method: 'PATCH', body: JSON.stringify({ sort_order: b.sort_order }) }),
      api(`/api/v1/admin/banners/${b.id}`, { method: 'PATCH', body: JSON.stringify({ sort_order: a.sort_order }) }),
    ]).then(load);
  }

  return (
    <div>
      <PageHeader
        icon={GalleryHorizontal}
        title="Banner quảng cáo"
        subtitle="Slider banner hiển thị đầu trang xác thực khi khách quét QR"
      />

      <div className="card p-5 mb-4 space-y-3">
        {err && <Alert kind="danger">{err}</Alert>}
        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-gov-400 hover:text-gov-500 cursor-pointer transition-colors">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Thêm banner mới
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
        <p className="text-xs text-gray-400">PNG/JPG, tối đa 8MB. Sau khi tải lên có thể gán URL click và sắp xếp thứ tự bên dưới.</p>
      </div>

      {loading ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon={GalleryHorizontal} title="Chưa có banner nào" description="Tải banner đầu tiên để hiển thị ở trang khách quét QR." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((b, i) => (
            <BannerCard key={b.id} banner={b} index={i} total={items.length}
              onUpdate={(body) => update(b.id, body)} onDelete={() => del(b)} onMove={(dir) => move(i, dir)} />
          ))}
        </div>
      )}
    </div>
  );
}

function BannerCard({ banner, index, total, onUpdate, onDelete, onMove }: {
  banner: Banner; index: number; total: number;
  onUpdate: (body: Partial<Pick<Banner, 'link_url' | 'is_active' | 'sort_order'>>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [linkUrl, setLinkUrl] = useState(banner.link_url || '');
  const dirty = linkUrl !== (banner.link_url || '');

  return (
    <div className="card overflow-hidden">
      <div className="aspect-video bg-gray-50 border-b border-gray-100 relative">
        <img src={`${API_URL}${banner.url}`} alt="" className="w-full h-full object-cover" />
        {!banner.is_active && (
          <span className="absolute top-2 left-2 badge-muted">Đã ẩn</span>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="URL khi click..." className="form-input text-sm flex-1" />
          {dirty && (
            <button onClick={() => onUpdate({ link_url: linkUrl })}
              className="p-2 rounded-md bg-gov-50 text-gov-700 hover:bg-gov-100" title="Lưu URL">
              <Save className="w-4 h-4" />
            </button>
          )}
          {banner.link_url && !dirty && (
            <a href={banner.link_url} target="_blank" rel="noopener noreferrer"
              className="p-2 rounded-md text-gray-400 hover:text-gov-600" title="Mở liên kết">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={banner.is_active}
              onChange={(e) => onUpdate({ is_active: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-gov-500 focus:ring-gov-500" />
            Hiển thị
          </label>
          <div className="flex items-center gap-1">
            <button onClick={() => onMove(-1)} disabled={index === 0}
              className="p-1.5 rounded-md text-gray-400 hover:text-gov-600 hover:bg-gov-50 disabled:opacity-30 disabled:pointer-events-none" title="Lên">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onMove(1)} disabled={index === total - 1}
              className="p-1.5 rounded-md text-gray-400 hover:text-gov-600 hover:bg-gov-50 disabled:opacity-30 disabled:pointer-events-none" title="Xuống">
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete}
              className="p-1.5 rounded-md text-red-500 hover:bg-red-50" title="Xóa">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

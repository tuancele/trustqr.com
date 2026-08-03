'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FileImage, UploadCloud, Trash2, Settings2, Loader2 } from 'lucide-react';
import { api, uploadForm, fetchBlobUrl } from '@/lib/adminApi';
import { PageHeader, Spinner, EmptyState, Alert } from '@/components/ui';

interface Template {
  id: number;
  name: string;
  width_mm: number;
  height_mm: number;
  file_type: 'png' | 'jpg' | 'svg';
  qr_x_ratio: number;
  qr_y_ratio: number;
  qr_size_ratio: number;
  created_at: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [widthMM, setWidthMM] = useState('');
  const [heightMM, setHeightMM] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    api<Template[]>('/api/v1/admin/templates').then((r) => {
      if (r.ok && r.data) setTemplates(r.data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let cancelled = false;
    const urls: Record<number, string> = {};
    Promise.all(
      templates.map(async (t) => {
        try {
          urls[t.id] = await fetchBlobUrl(`/api/v1/admin/templates/${t.id}/preview`);
        } catch {
          // preview optional; card falls back to a placeholder icon
        }
      })
    ).then(() => {
      if (!cancelled) setThumbs(urls);
    });
    return () => {
      cancelled = true;
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [templates]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !widthMM || !heightMM || !file) {
      setError('Điền đủ tên, kích thước và chọn file mẫu tem.');
      return;
    }
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append('name', name.trim());
    fd.append('width_mm', widthMM);
    fd.append('height_mm', heightMM);
    fd.append('file', file);
    const r = await uploadForm('/api/v1/admin/templates', fd);
    setUploading(false);
    if (r.ok) {
      setName('');
      setWidthMM('');
      setHeightMM('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
    } else {
      setError(r.error || 'Tải lên thất bại');
    }
  }

  async function del(t: Template) {
    if (!confirm(`Xóa mẫu tem "${t.name}"?`)) return;
    const r = await api(`/api/v1/admin/templates/${t.id}`, { method: 'DELETE' });
    if (r.ok) load();
    else alert('Lỗi: ' + r.error);
  }

  return (
    <div>
      <PageHeader
        icon={FileImage}
        title="Mẫu tem in"
        subtitle="Thư viện mẫu thiết kế tem — tải lên ảnh (PNG/JPG) hoặc SVG, dùng lại cho nhiều lô khi xuất file in"
      />

      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <UploadCloud className="w-4 h-4 text-gov-500" /> Tải lên mẫu mới
        </h2>
        {error && <div className="mb-3"><Alert kind="danger">{error}</Alert></div>}
        <form onSubmit={handleUpload} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Tên mẫu tem</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="VD: Tem chống giả 5x5cm"
              className="form-input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rộng (mm)</label>
            <input
              type="number" step="0.1" min="0.1"
              value={widthMM} onChange={(e) => setWidthMM(e.target.value)}
              className="form-input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cao (mm)</label>
            <input
              type="number" step="0.1" min="0.1"
              value={heightMM} onChange={(e) => setHeightMM(e.target.value)}
              className="form-input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">File thiết kế</label>
            <input
              ref={fileInputRef}
              type="file" accept=".png,.jpg,.jpeg,.svg"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="form-input file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-gov-50 file:text-gov-700 file:text-xs"
            />
          </div>
          <div className="lg:col-span-5">
            <button type="submit" disabled={uploading} className="btn-primary">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              {uploading ? 'Đang tải lên...' : 'Tải lên'}
            </button>
            <p className="text-xs text-gray-400 mt-2">
              Hỗ trợ PNG/JPG (xuất PDF dàn lưới nhiều tem/trang) hoặc SVG (xuất ZIP các file SVG). Tối đa 15MB.
            </p>
          </div>
        </form>
      </div>

      {loading ? (
        <Spinner />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={FileImage}
          title="Chưa có mẫu tem nào"
          description="Tải lên mẫu thiết kế tem đầu tiên để bắt đầu xuất file in."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="card overflow-hidden">
              <div className="aspect-[4/3] bg-gray-50 flex items-center justify-center border-b border-gray-100">
                {thumbs[t.id] ? (
                  <img src={thumbs[t.id]} alt={t.name} className="max-w-full max-h-full object-contain" />
                ) : (
                  <FileImage className="w-8 h-8 text-gray-300" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{t.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t.width_mm} × {t.height_mm} mm</p>
                  </div>
                  <span className={t.file_type === 'svg' ? 'badge-info' : 'badge-success'}>
                    {t.file_type.toUpperCase()}
                  </span>
                </div>
                <div className="flex gap-2 mt-3">
                  <Link href={`/admin/templates/${t.id}`} className="btn-secondary flex-1 justify-center text-xs">
                    <Settings2 className="w-3.5 h-3.5" /> Vị trí QR
                  </Link>
                  <button
                    onClick={() => del(t)}
                    className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-100 text-xs font-medium transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

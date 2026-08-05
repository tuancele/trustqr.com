'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Check, Loader2, X, Tag, Plus } from 'lucide-react';
import { api } from '@/lib/adminApi';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface Brand {
  id: number;
  name: string;
  website: string | null;
  has_logo: boolean;
  is_active: boolean;
  product_count?: number;
}

interface Props {
  value: Brand | null;
  onChange: (b: Brand | null) => void;
}

export function BrandPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await api<Brand[]>(`/api/v1/admin/brands?q=${encodeURIComponent(q)}`);
      if (r.ok && r.data) setItems(r.data);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [open, q]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full text-left form-input flex items-center justify-between gap-2 cursor-pointer hover:border-gov-500 min-h-[44px]">
        {value ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <BrandThumb brand={value} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900 truncate">{value.name}</div>
              {value.website && <div className="text-xs text-gray-500 truncate">{value.website}</div>}
            </div>
            <span role="button" onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="p-1 hover:bg-gray-100 rounded" aria-label="Xóa lựa chọn">
              <X className="w-4 h-4 text-gray-400" />
            </span>
          </div>
        ) : (
          <span className="text-gray-400 flex items-center gap-2">
            <Search className="w-4 h-4" /> Chọn thương hiệu...
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 flex flex-col animate-fade-in">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm thương hiệu..." className="form-input pl-9" />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-6 text-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Đang tìm...</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                Không có thương hiệu
                <div className="mt-2">
                  <Link href="/admin/brands/new" target="_blank" className="inline-flex items-center gap-1 text-sm text-gov-600 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Thêm thương hiệu mới
                  </Link>
                </div>
              </div>
            ) : (
              items.map((b) => {
                const sel = value?.id === b.id;
                return (
                  <button key={b.id} type="button"
                    onClick={() => { onChange(b); setOpen(false); setQ(''); }}
                    className={`w-full text-left px-3 py-2.5 hover:bg-gov-50 flex items-start gap-2 border-b border-gray-50 last:border-0 ${sel ? 'bg-gov-50' : ''}`}>
                    <BrandThumb brand={b} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                        <span className="truncate">{b.name}</span>
                        {!b.is_active && <span className="text-[11px] px-1.5 py-0.5 bg-red-50 text-red-700 rounded">Ngưng</span>}
                      </div>
                      {b.website && <div className="text-xs text-gray-500 truncate">{b.website}</div>}
                      <div className="text-[11px] text-gray-400 mt-0.5">{b.product_count ?? 0} sản phẩm</div>
                    </div>
                    {sel && <Check className="w-4 h-4 text-gov-500 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-gray-100 p-2 text-center">
            <Link href="/admin/brands/new" target="_blank" className="text-xs text-gov-600 hover:underline inline-flex items-center gap-1">
              <Plus className="w-3 h-3" /> Thêm thương hiệu mới
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function BrandThumb({ brand, className = '' }: { brand: Brand; className?: string }) {
  if (brand.has_logo) {
    return (
      <div className={`w-6 h-6 rounded flex-shrink-0 bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden ${className}`}>
        <img src={`${API_URL}/api/v1/brands/${brand.id}/logo/file`} alt="" className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  return <Tag className={`w-4 h-4 text-gov-500 flex-shrink-0 ${className}`} />;
}

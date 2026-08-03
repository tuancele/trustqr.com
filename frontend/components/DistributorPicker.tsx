'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Check, Loader2, X, Truck, Plus } from 'lucide-react';
import { api } from '@/lib/adminApi';

interface Distributor {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  city: string | null;
  is_active: boolean;
  token_count: number;
}

interface Props {
  value: Distributor | null;
  onChange: (d: Distributor | null) => void;
}

export function DistributorPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await api<Distributor[]>(`/api/v1/admin/distributors?q=${encodeURIComponent(q)}`);
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
            <Truck className="w-4 h-4 text-gov-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900 truncate">{value.name}</div>
              {value.city && <div className="text-xs text-gray-500 truncate">{value.city}</div>}
            </div>
            <span role="button" onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="p-1 hover:bg-gray-100 rounded" aria-label="Xóa lựa chọn">
              <X className="w-4 h-4 text-gray-400" />
            </span>
          </div>
        ) : (
          <span className="text-gray-400 flex items-center gap-2">
            <Search className="w-4 h-4" /> Chọn đại lý...
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 flex flex-col animate-fade-in">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm đại lý..." className="form-input pl-9" />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-6 text-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Đang tìm...</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                Không có đại lý
                <div className="mt-2">
                  <Link href="/admin/distributors/new" target="_blank" className="inline-flex items-center gap-1 text-sm text-gov-600 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Thêm đại lý mới
                  </Link>
                </div>
              </div>
            ) : (
              items.map((d) => {
                const sel = value?.id === d.id;
                return (
                  <button key={d.id} type="button"
                    onClick={() => { onChange(d); setOpen(false); setQ(''); }}
                    className={`w-full text-left px-3 py-2.5 hover:bg-gov-50 flex items-start gap-2 border-b border-gray-50 last:border-0 ${sel ? 'bg-gov-50' : ''}`}>
                    <Truck className="w-4 h-4 text-gov-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                        <span className="truncate">{d.name}</span>
                        {!d.is_active && <span className="text-[11px] px-1.5 py-0.5 bg-red-50 text-red-700 rounded">Ngưng</span>}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {d.contact_name}{d.phone ? ` · ${d.phone}` : ''}{d.city ? ` · ${d.city}` : ''}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{d.token_count} tem đã gán</div>
                    </div>
                    {sel && <Check className="w-4 h-4 text-gov-500 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-gray-100 p-2 text-center">
            <Link href="/admin/distributors/new" target="_blank" className="text-xs text-gov-600 hover:underline inline-flex items-center gap-1">
              <Plus className="w-3 h-3" /> Thêm đại lý mới
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

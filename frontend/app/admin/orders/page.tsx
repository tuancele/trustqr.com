'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ShoppingBag, Phone, User, Building2, ChevronDown, ChevronUp, Trash2,
  Inbox, Loader2, Package, Clock,
} from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Spinner, EmptyState, StatCard } from '@/components/ui';
import { cn } from '@/lib/utils';

interface OrderRow {
  id: number;
  brand_id: number;
  brand_name: string;
  customer_name: string;
  phone: string;
  status: string;
  note: string | null;
  item_count: number;
  total_qty: number;
  created_at: string;
}

interface OrderItem {
  id: number;
  spec: string;
  size_spec: string | null;
  product_line: string | null;
  quantity: number;
}

interface OrderDetail extends OrderRow {
  items: OrderItem[];
}

const STATUS_TABS = [
  { value: '', label: 'Tất cả' },
  { value: 'new', label: 'Mới' },
  { value: 'contacted', label: 'Đang liên hệ' },
  { value: 'completed', label: 'Hoàn tất' },
  { value: 'cancelled', label: 'Đã hủy' },
] as const;

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  new:       { label: 'Mới',          cls: 'bg-gov-50 text-gov-700 border-gov-200' },
  contacted: { label: 'Đang liên hệ', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'Hoàn tất',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Đã hủy',       cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

function fmtDateTime(d: string): string {
  try {
    return new Date(d).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return d;
  }
}

export default function OrdersPage() {
  const [items, setItems] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    const qs = status ? `?status=${status}` : '';
    api<OrderRow[]>(`/api/v1/admin/orders${qs}`).then((r) => {
      if (r.ok && r.data) setItems(r.data);
      setLoading(false);
    });
  }, [status, refreshKey]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { new: 0, contacted: 0, completed: 0, cancelled: 0 };
    for (const it of items) c[it.status] = (c[it.status] || 0) + 1;
    return c;
  }, [items]);

  async function updateStatus(id: number, newStatus: string) {
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o)));
    const r = await api(`/api/v1/admin/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    if (!r.ok) setRefreshKey((k) => k + 1);
  }

  async function deleteOrder(order: OrderRow) {
    if (!confirm(`Xóa đơn hàng của "${order.customer_name}"?`)) return;
    const r = await api(`/api/v1/admin/orders/${order.id}`, { method: 'DELETE' });
    if (r.ok) setRefreshKey((k) => k + 1);
    else alert(r.error || 'Có lỗi xảy ra');
  }

  return (
    <div>
      <PageHeader
        icon={ShoppingBag}
        title="Đơn hàng"
        subtitle="Yêu cầu mua thêm sản phẩm từ khách hàng quét mã GS1 (chủ yếu là bác sỹ)"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Mới" value={counts.new} icon={Inbox} tone="gov" />
        <StatCard label="Đang liên hệ" value={counts.contacted} icon={Clock} tone="gold" />
        <StatCard label="Hoàn tất" value={counts.completed} icon={Package} tone="emerald" />
        <StatCard label="Đã hủy" value={counts.cancelled} icon={Trash2} tone="red" />
      </div>

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors',
              status === t.value
                ? 'bg-gov-600 text-white border-gov-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Chưa có đơn hàng"
          description="Đơn hàng do khách hàng đặt qua nút 'Buy more' trên trang xác thực GS1 sẽ hiển thị ở đây."
        />
      ) : (
        <div className="space-y-3">
          {items.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              expanded={expanded === order.id}
              onToggle={() => setExpanded((e) => (e === order.id ? null : order.id))}
              onStatusChange={(s) => updateStatus(order.id, s)}
              onDelete={() => deleteOrder(order)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order, expanded, onToggle, onStatusChange, onDelete,
}: {
  order: OrderRow;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
}) {
  const style = STATUS_STYLE[order.status] || { label: order.status, cls: 'bg-gray-50 text-gray-600 border-gray-200' };

  return (
    <div className="card overflow-hidden">
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-9 h-9 rounded-full bg-gov-50 text-gov-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
              {order.customer_name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 flex items-center gap-1.5 truncate">
                <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                {order.customer_name}
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                <a href={`tel:${order.phone}`} className="inline-flex items-center gap-1 hover:text-gov-600">
                  <Phone className="w-3 h-3" /> {order.phone}
                </a>
                {order.brand_name && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> {order.brand_name}
                  </span>
                )}
                <span>{fmtDateTime(order.created_at)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 text-xs font-medium transition-colors"
          >
            <Package className="w-3.5 h-3.5" />
            {order.item_count} loại · {order.total_qty} sp
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <select
            value={order.status}
            onChange={(e) => onStatusChange(e.target.value)}
            className={cn('text-xs font-medium rounded-lg border px-2.5 py-1.5 outline-none cursor-pointer', style.cls)}
          >
            <option value="new">Mới</option>
            <option value="contacted">Đang liên hệ</option>
            <option value="completed">Hoàn tất</option>
            <option value="cancelled">Đã hủy</option>
          </select>

          <button
            onClick={onDelete}
            aria-label="Xóa đơn hàng"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && <OrderItemsPanel orderId={order.id} />}
    </div>
  );
}

function OrderItemsPanel({ orderId }: { orderId: number }) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<OrderDetail>(`/api/v1/admin/orders/${orderId}`).then((r) => {
      if (!cancelled && r.ok && r.data) setDetail(r.data);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [orderId]);

  return (
    <div className="border-t border-gray-100 bg-gray-50/60 px-4 sm:px-5 py-3">
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải chi tiết...
        </div>
      ) : !detail || detail.items.length === 0 ? (
        <p className="text-xs text-gray-400 py-1">Không có sản phẩm.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 uppercase tracking-wide">
                <th className="py-1.5 pr-4 font-medium">Quy cách</th>
                <th className="py-1.5 pr-4 font-medium">Brand / Line</th>
                <th className="py-1.5 pr-4 font-medium">Kích thước</th>
                <th className="py-1.5 pr-0 font-medium text-right">SL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/70">
              {detail.items.map((it) => (
                <tr key={it.id}>
                  <td className="py-1.5 pr-4 font-mono text-gray-900">{it.spec}</td>
                  <td className="py-1.5 pr-4 text-gray-600">{it.product_line || '—'}</td>
                  <td className="py-1.5 pr-4 text-gray-600">{it.size_spec || '—'}</td>
                  <td className="py-1.5 pr-0 text-right font-semibold text-gov-700">{it.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

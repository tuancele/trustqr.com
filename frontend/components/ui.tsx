'use client';

import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Info, Loader2, type LucideIcon } from 'lucide-react';

// ---------- PageHeader ----------
export function PageHeader({
  title, subtitle, icon: Icon, actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="w-11 h-11 bg-gov-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <Icon className="w-5 h-5 text-gold-400" strokeWidth={2.5} />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

// ---------- StatCard ----------
export function StatCard({
  label, value, sub, icon: Icon, tone = 'gov',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  tone?: 'gov' | 'gold' | 'emerald' | 'purple' | 'red' | 'cyan';
}) {
  const tones = {
    gov:     'bg-gov-50 text-gov-600',
    gold:    'bg-gold-50 text-gold-500',
    emerald: 'bg-emerald-50 text-emerald-700',
    purple:  'bg-purple-50 text-purple-700',
    red:     'bg-red-50 text-red-700',
    cyan:    'bg-cyan-50 text-cyan-700',
  };
  return (
    <div className="card p-5 card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 break-words">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', tones[tone])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

// ---------- Alert ----------
export function Alert({
  kind = 'info', title, children, icon,
}: {
  kind?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: React.ReactNode;
  icon?: LucideIcon;
}) {
  const styles = {
    info:    { bg: 'bg-gov-50',     border: 'border-gov-200',     text: 'text-gov-700',     icon: Info },
    success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: CheckCircle2 },
    warning: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   icon: AlertCircle },
    danger:  { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     icon: AlertCircle },
  }[kind];
  const Icon = icon || styles.icon;
  return (
    <div className={cn('rounded-lg border p-3 flex gap-3', styles.bg, styles.border, styles.text)}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="text-sm min-w-0 flex-1">
        {title && <div className="font-semibold mb-1">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

// ---------- Loading spinner ----------
export function Spinner({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

// ---------- Empty state ----------
export function EmptyState({
  icon: Icon, title, description, action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-10 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-gray-400" />
      </div>
      <p className="font-semibold text-gray-900">{title}</p>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------- Status badge ----------
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending:   { cls: 'badge-info',    label: 'Chưa kích hoạt' },
    activated: { cls: 'badge-success', label: 'Đã kích hoạt' },
    flagged:   { cls: 'badge-warning', label: 'Nghi giả' },
    disabled:  { cls: 'badge-danger',  label: 'Đã vô hiệu' },
  };
  const s = map[status] || { cls: 'badge-muted', label: status };
  return <span className={s.cls}>{s.label}</span>;
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  PackagePlus,
  Boxes,
  Building2,
  Truck,
  Search,
  BarChart3,
  Users,
  ScrollText,
  Settings,
  ShieldCheck,
  LogOut,
  X,
  FileImage,
  UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearTokens } from '@/lib/adminApi';

const navItems = [
  { href: '/admin/dashboard',      label: 'Tổng quan',       icon: LayoutDashboard, exact: true },
  { href: '/admin/companies',      label: 'Công ty',         icon: Building2 },
  { href: '/admin/products',       label: 'Sản phẩm',        icon: Boxes },
  { href: '/admin/distributors',   label: 'Đại lý',          icon: Truck },
  { href: '/admin/batches',        label: 'Lô sản xuất',     icon: Package },
  { href: '/admin/batches/new',    label: 'Tạo lô mới',      icon: PackagePlus },
  { href: '/admin/templates',      label: 'Mẫu tem in',      icon: FileImage },
  { href: '/admin/tokens',         label: 'Tra cứu tem',     icon: Search },
  { href: '/admin/analytics',      label: 'Phân tích',       icon: BarChart3 },
  { href: '/admin/customers',      label: 'Khách hàng',      icon: Users },
  { href: '/admin/audit',          label: 'Nhật ký hệ thống', icon: ScrollText },
  { href: '/admin/users',          label: 'Quản lý người dùng', icon: UserCog },
  { href: '/admin/settings',       label: 'Cài đặt',         icon: Settings },
];

interface Props {
  email?: string | null;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function AdminSidebar({ email, mobileOpen = false, onMobileClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (mobileOpen && onMobileClose) onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen || !onMobileClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onMobileClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, onMobileClose]);

  function signOut() {
    clearTokens();
    router.push('/admin/login');
  }

  return (
    <>
      {onMobileClose && (
        <div
          aria-hidden={!mobileOpen}
          onClick={onMobileClose}
          className={cn(
            'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity lg:hidden',
            mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
        />
      )}

      <aside
        className={cn(
          'bg-slate-900 text-slate-200 flex flex-col',
          'lg:w-64 lg:min-h-full lg:translate-x-0 lg:static lg:z-auto',
          onMobileClose
            ? cn(
                'fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-2xl transition-transform duration-300',
                mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
              )
            : 'w-64 min-h-full'
        )}
        aria-label="Điều hướng quản trị"
      >
        {/* Logo header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-gold-400 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
              <ShieldCheck className="w-5 h-5 text-gov-700" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-white block leading-tight">TrustQR</span>
              <span className="text-[11px] text-gold-300 font-medium tracking-wider uppercase">
                Quản trị
              </span>
            </div>
          </div>
          {onMobileClose && (
            <button
              type="button"
              onClick={onMobileClose}
              className="lg:hidden w-10 h-10 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 active:bg-slate-700 transition-colors"
              aria-label="Đóng menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors touch-manipulation',
                  isActive
                    ? 'bg-gold-400/15 text-gold-300 border-l-2 border-gold-400 -ml-0.5 pl-[10px]'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white active:bg-slate-700'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 space-y-1">
          {email && (
            <div className="px-3 py-2 mb-1 rounded-lg bg-slate-800/50 flex items-center gap-2.5">
              <div className="w-7 h-7 bg-gov-500 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold uppercase">
                {email.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-400 truncate">{email}</p>
              </div>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-slate-300 hover:bg-red-500/15 active:bg-red-500/25 hover:text-red-300 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Đăng xuất
          </button>
        </div>
      </aside>
    </>
  );
}

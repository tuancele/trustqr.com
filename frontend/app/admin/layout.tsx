'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAccessToken, api } from '@/lib/adminApi';
import { AdminShell } from '@/components/AdminShell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage) { setChecking(false); return; }
    const t = getAccessToken();
    if (!t) { router.replace('/admin/login'); return; }
    api('/api/v1/admin/auth/me').then((r) => {
      if (r.ok && r.data) setEmail((r.data as any).email);
      else router.replace('/admin/login');
      setChecking(false);
    });
  }, [pathname, isLoginPage, router]);

  if (isLoginPage) return <>{children}</>;

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full border-4 border-gov-200 border-t-gov-500 animate-spin" />
          <p className="text-gray-500 text-sm">Đang kiểm tra phiên đăng nhập...</p>
        </div>
      </div>
    );
  }

  return <AdminShell email={email}>{children}</AdminShell>;
}

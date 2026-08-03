'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, ShieldCheck } from 'lucide-react';
import { AdminSidebar } from './AdminSidebar';

export function AdminShell({ email, children }: { email?: string | null; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen">
      <AdminSidebar
        email={email}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <main className="flex-1 overflow-auto bg-gray-50 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <div
          className="lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800 active:bg-slate-700 transition-colors"
            aria-label="Mở menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/admin" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gold-400 rounded-md flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-gov-700" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-white text-sm">TrustQR Admin</span>
          </Link>
          <div className="w-10" aria-hidden />
        </div>

        <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

export function ScanCountHelp() {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-500 hover:bg-gov-100 hover:text-gov-700 transition-colors"
        aria-label="What does this number mean?"
      >
        <HelpCircle className="w-3 h-3" strokeWidth={2.5} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 left-0 top-6 w-64 rounded-xl border border-gov-100 bg-white p-3 shadow-lg text-left">
            <p className="text-xs text-slate-600 leading-relaxed">
              Each product&apos;s QR code is unique. This number shows how many times this specific code has been scanned.
            </p>
          </div>
        </>
      )}
    </span>
  );
}

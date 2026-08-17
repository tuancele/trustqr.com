'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

export function GtinHelp() {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-500 hover:bg-gov-100 hover:text-gov-700 transition-colors"
        aria-label="What is GTIN?"
      >
        <HelpCircle className="w-3 h-3" strokeWidth={2.5} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 left-0 top-6 w-64 rounded-xl border border-gov-100 bg-white p-3 shadow-lg text-left">
            <p className="text-xs text-slate-600 leading-relaxed">
              A GTIN (Global Trade Item Number) is a unique code that identifies this specific product worldwide.
            </p>
            <a
              href="https://accessgudid.nlm.nih.gov/devices/GTIN"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-xs font-semibold text-gov-600 hover:underline"
            >
              Click here to look up this GTIN →
            </a>
          </div>
        </>
      )}
    </span>
  );
}

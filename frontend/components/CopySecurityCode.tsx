'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopySecurityCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently ignore, code is still visible to copy by hand
    }
  }

  return (
    <div className="card px-4 py-2.5 flex flex-col items-center text-center gap-0.5">
      <span className="text-[10px] text-gray-500">Mã bảo mật</span>
      <div className="flex items-center gap-1.5">
        <span className="font-mono font-semibold text-sm text-gov-700 tracking-wide whitespace-nowrap">{code}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Sao chép mã bảo mật"
          className="flex items-center justify-center w-6 h-6 rounded-md text-gov-700 bg-gov-50 hover:bg-gov-100 flex-shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

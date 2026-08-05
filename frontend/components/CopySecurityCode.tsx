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
    <div className="card px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="text-xs text-gray-500">Mã bảo mật</span>{' '}
        <span className="font-mono font-semibold text-gov-700 tracking-wide">{code}</span>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label="Sao chép mã bảo mật"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gov-700 bg-gov-50 hover:bg-gov-100 flex-shrink-0"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? 'Đã chép' : 'Sao chép'}
      </button>
    </div>
  );
}

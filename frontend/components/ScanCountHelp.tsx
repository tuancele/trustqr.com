'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { HelpCircle } from 'lucide-react';

const POPUP_WIDTH = 256;
const VIEWPORT_MARGIN = 16;

export function ScanCountHelp() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    let left = rect.left;
    if (left + POPUP_WIDTH + VIEWPORT_MARGIN > viewportWidth) {
      left = viewportWidth - POPUP_WIDTH - VIEWPORT_MARGIN;
    }
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    setStyle({ left: left - rect.left, top: 24 });
  }, [open]);

  return (
    <span className="relative inline-block align-middle">
      <button
        ref={btnRef}
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
          <div
            className="absolute z-20 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-gov-100 bg-white p-3 shadow-lg text-left"
            style={style}
          >
            <p className="text-xs text-slate-600 leading-relaxed">
              Each product&apos;s QR code is unique. This number shows how many times this specific code has been scanned.
            </p>
          </div>
        </>
      )}
    </span>
  );
}

'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { HelpCircle } from 'lucide-react';

const POPUP_WIDTH = 256;
const VIEWPORT_MARGIN = 16;

export function GtinHelp({ gtin }: { gtin?: string | null }) {
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
        aria-label="What is GTIN?"
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
              A GTIN (Global Trade Item Number) is a unique code that identifies this specific product worldwide.
            </p>
            {gtin && (
              <a
                href={`https://accessgudid.nlm.nih.gov/devices/${encodeURIComponent(gtin)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-xs font-semibold text-gov-600 hover:underline"
              >
                Click here to look up this GTIN →
              </a>
            )}
          </div>
        </>
      )}
    </span>
  );
}

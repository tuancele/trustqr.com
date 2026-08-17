'use client';

import { useEffect, useState } from 'react';
import { ShoppingCart, X, Plus, Minus, Loader2, CheckCircle2, PackageSearch } from 'lucide-react';
import { fetchGS1OrderSizes, submitGS1Order, type OrderSizeOption } from '@/lib/api';

export function BuyMoreButton({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gov-600 hover:bg-gov-700 active:bg-gov-700 text-white font-semibold text-sm shadow-sm transition-colors"
      >
        <ShoppingCart className="w-4 h-4" />
        Buy more
      </button>
      {open && <BuyMoreModal code={code} onClose={() => setOpen(false)} />}
    </>
  );
}

function BuyMoreModal({ code, onClose }: { code: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<OrderSizeOption[]>([]);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchGS1OrderSizes(code).then((r) => {
      if (!cancelled) { setOptions(r); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [code]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggle(id: number) {
    setQty((q) => {
      const next = { ...q };
      if (next[id]) delete next[id];
      else next[id] = 1;
      return next;
    });
  }

  function setItemQty(id: number, n: number) {
    setQty((q) => ({ ...q, [id]: Math.max(1, Math.min(999, n)) }));
  }

  const selectedCount = Object.keys(qty).length;

  const grouped = options.reduce<Record<string, OrderSizeOption[]>>((acc, o) => {
    const key = o.product_line || 'Other';
    (acc[key] ||= []).push(o);
    return acc;
  }, {});

  async function submit() {
    setError(null);
    if (!name.trim() || !phone.trim()) {
      setError('Please enter your name and phone number.');
      return;
    }
    if (selectedCount === 0) {
      setError('Please select at least one product size.');
      return;
    }
    setSubmitting(true);
    const items = Object.entries(qty).map(([id, quantity]) => ({ size_spec_id: Number(id), quantity }));
    const r = await submitGS1Order({ code, customer_name: name.trim(), phone: phone.trim(), items });
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error || 'Something went wrong. Please try again.');
      return;
    }
    setDone(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-gov-600" />
            <h2 className="font-bold text-gray-900">Buy more</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
          {done ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <p className="font-semibold text-gray-900">Order received!</p>
              <p className="text-sm text-gray-500 mt-1">We will contact you shortly to confirm your order.</p>
            </div>
          ) : loading ? (
            <div className="py-10 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading available sizes…
            </div>
          ) : options.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">
              <PackageSearch className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              No products available for order yet. Please contact the manufacturer directly.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Full name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. ..."
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gov-400 focus:ring-1 focus:ring-gov-400 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Phone number</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="09xxxxxxxx"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gov-400 focus:ring-1 focus:ring-gov-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Select product size(s)</p>
                <div className="space-y-3">
                  {Object.entries(grouped).map(([line, items]) => (
                    <div key={line}>
                      <p className="text-[11px] font-semibold text-gov-600 uppercase tracking-wide mb-1">{line}</p>
                      <div className="space-y-1.5">
                        {items.map((o) => {
                          const selected = !!qty[o.id];
                          return (
                            <div
                              key={o.id}
                              className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                                selected ? 'border-gov-300 bg-gov-50' : 'border-gray-200'
                              }`}
                            >
                              <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggle(o.id)}
                                  className="w-4 h-4 accent-gov-600 flex-shrink-0"
                                />
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium text-gray-900 truncate">{o.spec}</span>
                                  {o.size_spec && <span className="block text-xs text-gray-500 truncate">{o.size_spec}</span>}
                                </span>
                              </label>
                              {selected && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setItemQty(o.id, (qty[o.id] || 1) - 1)}
                                    className="w-6 h-6 flex items-center justify-center rounded-md bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-6 text-center text-sm font-semibold text-gray-900">{qty[o.id]}</span>
                                  <button
                                    type="button"
                                    onClick={() => setItemQty(o.id, (qty[o.id] || 1) + 1)}
                                    className="w-6 h-6 flex items-center justify-center rounded-md bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          )}
        </div>

        {!done && !loading && options.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gov-600 hover:bg-gov-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
              Buy{selectedCount > 0 ? ` (${selectedCount} item${selectedCount > 1 ? 's' : ''})` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

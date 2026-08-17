'use client';

import { useState } from 'react';
import { Gift, X, Loader2, Ticket, CheckCircle2, Info } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

function mapErr(err: string): string {
  switch (err) {
    case 'invalid_phone': return 'Invalid phone number';
    case 'invalid_name': return 'Please enter your full name';
    case 'phone_rate_limit': return 'This phone number has requested too many vouchers today';
    case 'invalid_code': return 'Invalid code';
    case 'code_not_issued': return 'This code was not found';
    default: return `Error: ${err}`;
  }
}

export function GS1VoucherBadge({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [voucher, setVoucher] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/gs1/voucher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          full_name: fullName,
          phone,
          marketing_consent: true,
          privacy_policy_version: 'v1.0',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(mapErr(data.error));
        return;
      }
      setVoucher(data.voucher);
      setMessage(data.message);
    } catch {
      setError('Could not connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-gold-400 text-gov-900 pl-3 pr-4 py-3 shadow-lg hover:bg-gold-300 transition-colors"
        aria-label="Get a discount voucher"
      >
        <Gift className="w-5 h-5" />
        <span className="text-sm font-semibold">Voucher</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-4" onClick={close}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-5 relative" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={close} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>

            {voucher ? (
              <div className="text-center pt-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm text-emerald-700 mb-1">{message}</p>
                <p className="text-xs text-gov-600 mt-3 mb-2">Your exclusive voucher</p>
                <div className="inline-block bg-gov-50 rounded-lg px-6 py-3 border border-gov-200">
                  <span className="font-mono text-2xl font-bold text-gov-700 tracking-widest">{voucher}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-3">Screenshot or save this code to redeem it</p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 bg-gold-400 rounded-lg flex items-center justify-center">
                    <Gift className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="font-semibold text-slate-900">Get an exclusive voucher</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">Enjoy a 50,000–100,000₫ discount on your next purchase.</p>

                <label className="form-label">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Nguyen Van A"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="form-input mb-3 text-base"
                />

                <label className="form-label">Phone Number <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  inputMode="numeric"
                  required
                  placeholder="0912 345 678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="form-input mb-4 text-base"
                />

                {error && (
                  <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex gap-2">
                    <Info className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                    </>
                  ) : (
                    <>
                      <Ticket className="w-4 h-4" /> Get Voucher
                    </>
                  )}
                </button>

                <p className="text-[11px] text-slate-500 leading-relaxed mt-3 text-center">
                  By clicking <strong className="font-medium text-slate-600">&quot;Get Voucher&quot;</strong>, you agree to let
                  TrustQR store your details to send this offer and future promotions via SMS/Zalo, per our{' '}
                  <a href="/privacy" target="_blank" className="text-gov-600 hover:underline">Privacy Policy</a>.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

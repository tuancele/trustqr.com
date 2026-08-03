'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BellOff, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export default function UnsubscribePage() {
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    const res = await fetch(`${API_URL}/api/v1/customer/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (res.ok) { setStatus('done'); setMessage(data.message); }
    else {
      setStatus('error');
      setMessage(data.error === 'phone_not_found' ? 'SĐT chưa từng đăng ký nhận thông báo.' : data.error);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gov-50 via-white to-gov-100 py-12 px-4">
      <div className="fixed top-0 inset-x-0 h-1.5 bg-gradient-to-r from-gov-500 via-gold-400 to-gov-500 z-10" />

      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gov-500 rounded-2xl mb-3 shadow-lg">
            <BellOff className="w-8 h-8 text-gold-400" />
          </div>
          <h1 className="text-xl font-bold text-gov-700">Ngừng nhận thông báo</h1>
          <p className="text-sm text-gray-500 mt-1">Rút đồng ý nhận SMS/Zalo khuyến mãi</p>
        </div>

        <div className="card p-6">
          {status === 'done' ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-emerald-700 font-medium">{message}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="form-label">Số điện thoại</label>
                <input
                  type="tel" inputMode="numeric" required autoFocus
                  value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912 345 678"
                  className="form-input"
                />
              </div>

              {status === 'error' && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">
                  {message}
                </div>
              )}

              <button type="submit" disabled={status === 'loading'} className="btn-primary w-full py-3">
                {status === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang xử lý...</> : 'Xác nhận ngừng'}
              </button>
            </form>
          )}
        </div>

        <div className="text-center mt-4">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-gov-600 hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" /> Về trang chủ
          </Link>
        </div>
      </div>
    </main>
  );
}

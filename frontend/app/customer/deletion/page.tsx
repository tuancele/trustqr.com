'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserX, Loader2, ArrowLeft, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export default function DeletionPage() {
  const [step, setStep] = useState<'request' | 'confirm' | 'done'>('request');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestOTP(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    const res = await fetch(`${API_URL}/api/v1/customer/deletion-request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error === 'invalid_phone' ? 'SĐT không hợp lệ' : data.error); return; }
    setStep('confirm');
  }

  async function confirmDelete(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    const res = await fetch(`${API_URL}/api/v1/customer/deletion-confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error === 'invalid_or_expired_otp' ? 'Mã OTP không đúng hoặc đã hết hạn' : data.error); return; }
    setStep('done');
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gov-50 via-white to-gov-100 py-12 px-4">
      <div className="fixed top-0 inset-x-0 h-1.5 bg-gradient-to-r from-gov-500 via-gold-400 to-gov-500 z-10" />

      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500 rounded-2xl mb-3 shadow-lg">
            <UserX className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gov-700">Yêu cầu xóa dữ liệu</h1>
          <p className="text-xs text-gray-500 mt-1">Theo Nghị định 13/2023/NĐ-CP về Bảo vệ Dữ liệu Cá nhân</p>
        </div>

        <div className="card p-6">
          {step === 'request' && (
            <>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4 flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Yêu cầu xóa dữ liệu là <strong>không thể hoàn tác</strong>. Toàn bộ SĐT + lịch sử kích hoạt sẽ bị xóa vĩnh viễn.
                </p>
              </div>
              <form onSubmit={requestOTP} className="space-y-4">
                <div>
                  <label className="form-label">Số điện thoại đã đăng ký</label>
                  <input
                    type="tel" inputMode="numeric" required autoFocus
                    value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="0912 345 678" className="form-input"
                  />
                </div>
                {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">{error}</div>}
                <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang gửi...</> : 'Gửi mã OTP qua SMS'}
                </button>
              </form>
            </>
          )}

          {step === 'confirm' && (
            <form onSubmit={confirmDelete} className="space-y-4">
              <p className="text-sm text-gray-700">
                Nhập mã 6 chữ số vừa gửi tới <strong className="font-mono">{phone}</strong>
              </p>
              <div>
                <label className="form-label flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> Mã OTP
                </label>
                <input
                  type="text" maxLength={6} inputMode="numeric" required autoFocus
                  value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="form-input text-center text-2xl font-mono tracking-[0.5em] py-3"
                  placeholder="000000"
                />
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">{error}</div>}
              <button type="submit" disabled={loading || otp.length !== 6} className="btn-danger w-full py-3">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang xóa...</> : 'Xác nhận xóa vĩnh viễn'}
              </button>
            </form>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-emerald-700 font-medium">Dữ liệu của bạn đã được xóa</p>
              <p className="text-sm text-gray-500 mt-2">Cảm ơn bạn đã sử dụng TrustQR.</p>
            </div>
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

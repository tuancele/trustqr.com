'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, ShieldCheck, Lock, ArrowLeft, KeyRound } from 'lucide-react';
import { setTokens } from '@/lib/adminApi';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export default function AdminLogin() {
  const router = useRouter();
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(mapErr(data.error)); return; }
      if (data.requires === 'none' && data.access_token) {
        setTokens(data.access_token, data.refresh_token);
        router.push('/admin/dashboard');
        return;
      }
      setTempToken(data.temp_token);
      setStep('totp');
    } catch { setError('Không thể kết nối máy chủ'); }
    finally { setLoading(false); }
  }

  async function submitTOTP(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/auth/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken, code: totp }),
      });
      const data = await res.json();
      if (!res.ok) { setError(mapErr(data.error)); return; }
      setTokens(data.access_token, data.refresh_token);
      router.push('/admin/dashboard');
    } catch { setError('Không thể kết nối máy chủ'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gov-50 via-white to-gov-100 flex items-center justify-center p-4">
      {/* Decorative top bar - gov style */}
      <div className="fixed top-0 inset-x-0 h-1.5 bg-gradient-to-r from-gov-500 via-gold-400 to-gov-500" />

      <div className="w-full max-w-md">
        {/* Emblem header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gov-500 rounded-2xl mb-4 shadow-lg ring-4 ring-gov-100">
            <ShieldCheck className="w-11 h-11 text-gold-400" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold text-gov-700">HỆ THỐNG QUẢN TRỊ</h1>
          <p className="text-gray-600 text-sm mt-1">TrustQR — Nền tảng xác thực chống giả</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          {step === 'password' ? (
            <>
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100">
                <Lock className="w-4 h-4 text-gov-500" />
                <h2 className="font-semibold text-gray-900">Đăng nhập</h2>
              </div>

              <form onSubmit={submitPassword} className="space-y-4">
                <div>
                  <label className="form-label">Email</label>
                  <input
                    type="email" required autoFocus autoComplete="username"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@trustqr.com"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Mật khẩu</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'} required autoComplete="current-password"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="form-input pr-11"
                    />
                    <button
                      type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                      aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && <ErrorBox>{error}</ErrorBox>}

                <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100">
                <KeyRound className="w-4 h-4 text-gold-500" />
                <h2 className="font-semibold text-gray-900">Xác thực 2 lớp</h2>
              </div>

              <form onSubmit={submitTOTP} className="space-y-4">
                <p className="text-sm text-gray-600">
                  Nhập mã 6 chữ số từ ứng dụng <strong>Google Authenticator</strong> / Authy.
                </p>
                <input
                  type="text" maxLength={6} inputMode="numeric" required autoFocus
                  value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                  className="form-input text-center text-3xl font-mono tracking-[0.5em] py-4"
                  placeholder="••••••"
                />

                {error && <ErrorBox>{error}</ErrorBox>}

                <button type="submit" disabled={loading || totp.length !== 6} className="btn-primary w-full py-3">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Đang xác thực...' : 'Xác thực'}
                </button>
                <button
                  type="button" onClick={() => { setStep('password'); setTotp(''); setError(null); }}
                  className="btn-secondary w-full"
                >
                  <ArrowLeft className="w-4 h-4" /> Quay lại
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          © TrustQR — Hệ thống nội bộ, chỉ dành cho người có thẩm quyền
        </p>
      </div>
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
      {children}
    </div>
  );
}

function mapErr(err: string): string {
  switch (err) {
    case 'invalid_credentials': return 'Email hoặc mật khẩu không đúng';
    case 'account_locked':      return 'Tài khoản đang bị khóa (15 phút)';
    case 'account_disabled':    return 'Tài khoản đã bị vô hiệu hóa';
    case '2fa_not_configured':  return '2FA chưa được cấu hình. Liên hệ SuperAdmin.';
    case 'invalid_totp':        return 'Mã 2FA không đúng';
    case 'invalid_temp_token':  return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
    case 'rate_limit_exceeded': return 'Bạn đã thử quá nhiều lần. Vui lòng chờ 15 phút.';
    default: return err || 'Có lỗi xảy ra';
  }
}

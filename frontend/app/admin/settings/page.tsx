'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Settings, Smartphone, ShieldCheck, ShieldOff, Loader2, KeyRound, AlertTriangle, Lock, Save } from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Alert } from '@/components/ui';

interface Status { enabled: boolean; configured: boolean; }
interface SetupData { secret: string; otpauth: string; qr_helper: string; }
interface ScanLimits { qr_scan_limit: number | null; gs1_scan_limit: number | null; }

export default function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'idle' | 'setup' | 'confirm-disable'>('idle');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [limitsLoading, setLimitsLoading] = useState(true);
  const [qrLimitInput, setQrLimitInput] = useState('');
  const [gs1LimitInput, setGs1LimitInput] = useState('');
  const [limitsBusy, setLimitsBusy] = useState(false);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [limitsSuccess, setLimitsSuccess] = useState<string | null>(null);

  const reload = async () => {
    const r = await api<Status>('/api/v1/admin/auth/2fa/status');
    if (r.ok && r.data) setStatus(r.data);
    setLoading(false);
  };

  const reloadLimits = async () => {
    const r = await api<ScanLimits>('/api/v1/admin/settings/scan-limits');
    if (r.ok && r.data) {
      setQrLimitInput(r.data.qr_scan_limit == null ? '' : String(r.data.qr_scan_limit));
      setGs1LimitInput(r.data.gs1_scan_limit == null ? '' : String(r.data.gs1_scan_limit));
    }
    setLimitsLoading(false);
  };

  useEffect(() => { reload(); reloadLimits(); }, []);

  async function saveLimits() {
    setLimitsError(null); setLimitsSuccess(null);
    const qrVal = qrLimitInput.trim() === '' ? null : parseInt(qrLimitInput, 10);
    const gs1Val = gs1LimitInput.trim() === '' ? null : parseInt(gs1LimitInput, 10);
    if ((qrVal !== null && (Number.isNaN(qrVal) || qrVal < 1)) || (gs1Val !== null && (Number.isNaN(gs1Val) || gs1Val < 1))) {
      setLimitsError('Số lần quét phải là số nguyên >= 1, hoặc để trống nếu không giới hạn.');
      return;
    }
    setLimitsBusy(true);
    const r = await api('/api/v1/admin/settings/scan-limits', {
      method: 'PUT',
      body: JSON.stringify({ qr_scan_limit: qrVal, gs1_scan_limit: gs1Val }),
    });
    setLimitsBusy(false);
    if (!r.ok) { setLimitsError(r.error || 'Không thể lưu cấu hình'); return; }
    setLimitsSuccess('Đã lưu cấu hình khoá tem.');
    reloadLimits();
  }

  async function startSetup() {
    setError(null); setSuccess(null); setCode(''); setBusy(true);
    const r = await api<SetupData>('/api/v1/admin/auth/2fa/setup', { method: 'POST' });
    setBusy(false);
    if (!r.ok || !r.data) { setError(r.error || 'Không thể tạo secret'); return; }
    setSetupData(r.data);
    setMode('setup');
  }

  async function confirmEnable() {
    setError(null); setBusy(true);
    const r = await api('/api/v1/admin/auth/2fa/enable', {
      method: 'POST', body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error === 'invalid_code' ? 'Mã 2FA không đúng' : r.error || 'Lỗi'); return; }
    setSuccess('Đã bật 2FA. Lần đăng nhập tiếp theo sẽ yêu cầu mã.');
    setMode('idle'); setSetupData(null); setCode('');
    reload();
  }

  async function confirmDisable() {
    setError(null); setBusy(true);
    const r = await api('/api/v1/admin/auth/2fa/disable', {
      method: 'POST', body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error === 'invalid_code' ? 'Cần đúng mã 2FA hiện tại để tắt' : r.error || 'Lỗi'); return; }
    setSuccess('Đã tắt 2FA. Đăng nhập chỉ cần mật khẩu.');
    setMode('idle'); setCode('');
    reload();
  }

  function cancel() { setMode('idle'); setError(null); setCode(''); setSetupData(null); }

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
        Đang tải cài đặt...
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader icon={Settings} title="Cài đặt" subtitle="Quản lý bảo mật tài khoản admin" />

      <section className="card p-6">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 bg-gov-50 rounded-xl flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-gov-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Xác thực 2 lớp (Google Authenticator)</h2>
              <p className="text-sm text-gray-500 mt-1">
                Yêu cầu nhập mã 6 chữ số từ ứng dụng Google Authenticator / Authy mỗi khi đăng nhập.
              </p>
            </div>
          </div>
          <StatusPill enabled={!!status?.enabled} />
        </div>

        {success && <Alert kind="success">{success}</Alert>}
        {error && <div className="mb-4"><Alert kind="danger">{error}</Alert></div>}

        {/* Idle state */}
        {mode === 'idle' && (
          <div className="flex flex-wrap gap-2 pt-2">
            {status?.enabled ? (
              <button
                onClick={() => { setMode('confirm-disable'); setError(null); setSuccess(null); setCode(''); }}
                className="btn-danger"
              >
                <ShieldOff className="w-4 h-4" /> Tắt 2FA
              </button>
            ) : (
              <button onClick={startSetup} className="btn-primary" disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {status?.configured ? 'Bật lại 2FA (tạo secret mới)' : 'Bật 2FA'}
              </button>
            )}
          </div>
        )}

        {/* Setup wizard */}
        {mode === 'setup' && setupData && (
          <div className="mt-4 space-y-6">
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 bg-gov-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</div>
                <h3 className="font-semibold text-gray-900">Quét QR code</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4">
                {/* Use next/image since external URL - fallback to img */}
                <img
                  src={setupData.qr_helper}
                  alt="TOTP QR"
                  width={180} height={180}
                  className="rounded-lg border border-gray-200 bg-white"
                />
                <div>
                  <p className="text-sm text-gray-600 mb-2">
                    Mở <strong>Google Authenticator</strong> / <strong>Authy</strong> → Bấm dấu +  → Chọn <em>Scan QR code</em>.
                  </p>
                  <p className="text-xs text-gray-500 mb-1">Hoặc nhập tay secret:</p>
                  <code className="block p-2.5 bg-gray-50 border border-gray-200 rounded font-mono text-xs break-all">
                    {setupData.secret}
                  </code>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Loại: Time-based (TOTP), 6 chữ số, cập nhật 30 giây
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 bg-gov-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</div>
                <h3 className="font-semibold text-gray-900">Nhập mã hiện tại để xác nhận</h3>
              </div>
              <input
                type="text" maxLength={6} inputMode="numeric" autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="form-input text-center text-2xl font-mono tracking-[0.5em] max-w-[220px] py-3"
              />

              <div className="flex gap-2 mt-4">
                <button onClick={confirmEnable} disabled={busy || code.length !== 6} className="btn-primary">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {busy ? 'Đang xác nhận...' : 'Xác nhận bật 2FA'}
                </button>
                <button onClick={cancel} className="btn-secondary">Hủy</button>
              </div>
            </div>
          </div>
        )}

        {/* Disable confirmation */}
        {mode === 'confirm-disable' && (
          <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
            <Alert kind="warning" icon={AlertTriangle} title="Cảnh báo bảo mật">
              Tắt 2FA sẽ giảm bảo mật đáng kể. Nếu mật khẩu bị lộ, kẻ tấn công có thể truy cập ngay.
            </Alert>

            <div>
              <label className="form-label flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                Nhập mã 2FA hiện tại để xác nhận
              </label>
              <input
                type="text" maxLength={6} inputMode="numeric" autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="form-input text-center text-2xl font-mono tracking-[0.5em] max-w-[220px] py-3"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={confirmDisable} disabled={busy || code.length !== 6} className="btn-danger">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                {busy ? 'Đang tắt...' : 'Xác nhận tắt 2FA'}
              </button>
              <button onClick={cancel} className="btn-secondary">Hủy</button>
            </div>
          </div>
        )}
      </section>

      <section className="card p-6 mt-6">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-11 h-11 bg-gov-50 rounded-xl flex items-center justify-center">
            <Lock className="w-5 h-5 text-gov-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Khoá tem theo số lần quét</h2>
            <p className="text-sm text-gray-500 mt-1">
              Khi một mã bị quét vượt quá số lần cho phép, hệ thống sẽ tự động khoá và báo cho người quét. Để trống nghĩa là không giới hạn.
            </p>
          </div>
        </div>

        {limitsSuccess && <Alert kind="success">{limitsSuccess}</Alert>}
        {limitsError && <div className="mb-4"><Alert kind="danger">{limitsError}</Alert></div>}

        {limitsLoading ? (
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải cấu hình...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Số lần quét tối đa cho mã QR</label>
              <input
                type="number" min={1} inputMode="numeric"
                value={qrLimitInput}
                onChange={(e) => setQrLimitInput(e.target.value)}
                placeholder="Không giới hạn"
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Số lần quét tối đa cho mã GS1</label>
              <input
                type="number" min={1} inputMode="numeric"
                value={gs1LimitInput}
                onChange={(e) => setGs1LimitInput(e.target.value)}
                placeholder="Không giới hạn"
                className="form-input"
              />
            </div>
          </div>
        )}

        <div className="mt-4">
          <button onClick={saveLimits} disabled={limitsBusy || limitsLoading} className="btn-primary">
            {limitsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {limitsBusy ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>
      </section>
    </div>
  );
}

function StatusPill({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <div className="badge-success text-sm py-1.5 px-3">
      <ShieldCheck className="w-3.5 h-3.5" /> ĐANG BẬT
    </div>
  ) : (
    <div className="badge-muted text-sm py-1.5 px-3">
      <ShieldOff className="w-3.5 h-3.5" /> Đang tắt
    </div>
  );
}

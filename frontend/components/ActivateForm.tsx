'use client';

import { useState } from 'react';
import { Gift, Loader2, Ticket, CheckCircle2, Info } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export default function ActivateForm({ code }: { code: string }) {
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
      const res = await fetch(`${API_URL}/api/v1/qr/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `${code}-${phone}`,
        },
        body: JSON.stringify({
          code, phone,
          // Consent thu theo hình thức "bấm nút = đồng ý" (ghi rõ ngay dưới nút)
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
    } catch { setError('Không thể kết nối máy chủ. Vui lòng thử lại.'); }
    finally { setLoading(false); }
  }

  if (voucher) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gov-500 bg-gov-50 p-5 text-center animate-fade-in">
        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
        <p className="text-sm text-emerald-700 mb-1">{message}</p>
        <p className="text-xs text-gov-600 mt-3 mb-2">Voucher độc quyền của bạn</p>
        <div className="inline-block bg-white rounded-lg px-6 py-3 shadow-sm border border-gov-200">
          <span className="font-mono text-2xl font-bold text-gov-700 tracking-widest">
            {voucher}
          </span>
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          Chụp màn hình hoặc lưu mã này để sử dụng
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-gold-400 rounded-lg flex items-center justify-center">
          <Gift className="w-4 h-4 text-white" />
        </div>
        <h3 className="font-semibold text-gray-900">Nhận voucher độc quyền</h3>
      </div>

      <label className="form-label">Số điện thoại <span className="text-red-500">*</span></label>
      <input
        type="tel" inputMode="numeric" required
        placeholder="0912 345 678"
        value={phone} onChange={(e) => setPhone(e.target.value)}
        className="form-input mb-4"
      />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex gap-2">
          <Info className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full py-3">
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang xử lý...</> : <><Ticket className="w-4 h-4" /> Nhận voucher ngay</>}
      </button>

      <p className="text-[11px] text-gray-500 leading-relaxed mt-3 text-center">
        Bằng việc bấm <strong className="font-medium text-gray-600">"Nhận voucher ngay"</strong>, bạn đồng ý cho
        TrustQR lưu số điện thoại để xác thực sản phẩm và gửi thông báo khuyến mãi qua SMS/Zalo, theo{' '}
        <a href="/privacy" target="_blank" className="text-gov-600 hover:underline">Chính sách bảo mật</a>.
        Bạn có thể{' '}
        <a href="/customer/unsubscribe" target="_blank" className="text-gov-600 hover:underline">hủy nhận tin</a> bất cứ lúc nào.
      </p>
    </form>
  );
}

function mapErr(err: string): string {
  switch (err) {
    case 'invalid_phone': return 'Số điện thoại không hợp lệ';
    case 'phone_rate_limit': return 'SĐT này đã kích hoạt quá nhiều lần trong 24h';
    case 'invalid_code': return 'Mã QR không hợp lệ';
    case 'code_not_issued': return 'Mã không tồn tại trong hệ thống';
    default: return `Lỗi: ${err}`;
  }
}

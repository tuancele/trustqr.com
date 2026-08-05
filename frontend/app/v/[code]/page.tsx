import { headers } from 'next/headers';
import Link from 'next/link';
import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, Package as PackageIcon, Hash, Clock, Ticket, Info, Smartphone } from 'lucide-react';
import { verifyCode, fetchProduct } from '@/lib/api';
import ActivateForm from '@/components/ActivateForm';
import { ProductNameButton } from '@/components/ProductNameButton';
import { GeoReporter } from '@/components/GeoReporter';
import { ImageSlider } from '@/components/ImageSlider';
import { CopySecurityCode } from '@/components/CopySecurityCode';
import { fmtDate, isMobileUA } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function VerifyPage({ params }: { params: { code: string } }) {
  const h = headers();
  const ip = h.get('x-forwarded-for') || h.get('x-real-ip') || '';
  const ua = h.get('user-agent') || '';

  if (!isMobileUA(ua)) return <DesktopOnlyView />;

  const result = await verifyCode(params.code, ip, ua);

  if (!result || !result.valid) return <InvalidView />;

  // Token chưa được gán product / kích hoạt → UI riêng
  if (result.needs_activation) return <PendingActivationView code={params.code} batchCode={result.batch_code} serialNo={result.serial_no} />;

  const isSuspicious = result.scan_count > 1 || result.status === 'flagged' || result.status === 'disabled';
  const product = result.product_id ? await fetchProduct(result.product_id) : null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-gov-50 via-white to-gov-100 py-8 px-4">
      {/* Silent geolocation enrichment - runs after main render */}
      <GeoReporter code={params.code} />
      {/* Gov bar */}
      <div className="fixed top-0 inset-x-0 h-1.5 bg-gradient-to-r from-gov-500 via-gold-400 to-gov-500 z-10" />

      <div className="max-w-md mx-auto">
        {/* Emblem */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gov-500 rounded-2xl shadow-lg ring-4 ring-gov-100 mb-3">
            <ShieldCheck className="w-9 h-9 text-gold-400" strokeWidth={2} />
          </div>
          <h1 className="font-bold text-gov-700 text-lg">HỆ THỐNG XÁC THỰC CHÍNH HÃNG</h1>
          <p className="text-xs text-gray-500 mt-1">TrustQR</p>
        </div>

        {/* Security code (manual-entry backup, independent from the QR itself) */}
        {result.security_code && (
          <div className="mb-4">
            <CopySecurityCode code={result.security_code} />
          </div>
        )}

        {/* Verification result */}
        <ResultCard suspicious={isSuspicious} count={result.scan_count} />

        {/* Product image slider */}
        {product?.images && product.images.length > 0 && <ImageSlider images={product.images} />}

        {/* Product card */}
        <div className="card mt-4 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Thông tin sản phẩm</h2>
          <InfoRow
            icon={PackageIcon}
            label="Sản phẩm"
            value={<ProductNameButton productId={result.product_id} productName={result.product_name || '—'} />}
          />
          {result.company_name && (
            <InfoRow
              icon={PackageIcon}
              label="Công ty"
              value={<ProductNameButton productId={result.company_id ?? null} productName={result.company_name} kind="company" />}
            />
          )}
          <InfoRow icon={Clock} label="Số lần quét" value={
            <span className={isSuspicious ? 'font-bold text-amber-600' : 'font-bold text-emerald-600'}>
              {result.scan_count}
            </span>
          } />
          {result.first_scanned_at && (
            <InfoRow icon={Clock} label="Quét lần đầu" value={fmtDate(result.first_scanned_at)} />
          )}
        </div>

        {result.warning && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 flex gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">{result.warning}</p>
          </div>
        )}

        {/* Voucher or ActivateForm */}
        <div className="mt-4">
          {result.is_activated && result.voucher ? (
            <VoucherCard voucher={result.voucher} />
          ) : (
            <ActivateForm code={params.code} />
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-500 space-y-1">
          <p>© TrustQR — Hệ thống chống hàng giả</p>
          <p>
            <Link href="/privacy" className="text-gov-600 hover:underline">Chính sách bảo mật</Link>
            {' · '}
            <Link href="/customer/unsubscribe" className="text-gov-600 hover:underline">Ngừng nhận thông báo</Link>
            {' · '}
            <Link href="/customer/deletion" className="text-gov-600 hover:underline">Xóa dữ liệu</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function DesktopOnlyView() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gov-50 via-white to-gov-100 flex items-center justify-center px-4">
      <div className="max-w-sm text-center card p-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gov-500 rounded-2xl shadow-lg ring-4 ring-gov-100 mb-4 mx-auto">
          <Smartphone className="w-9 h-9 text-gold-400" strokeWidth={2} />
        </div>
        <h1 className="font-bold text-gov-700 text-lg mb-2">Vui lòng quét bằng điện thoại</h1>
        <p className="text-sm text-gray-600">
          Mã QR này chỉ có thể xác thực trên thiết bị di động. Vui lòng dùng camera điện thoại để quét lại mã QR.
        </p>
      </div>
    </main>
  );
}

function ResultCard({ suspicious, count }: { suspicious: boolean; count: number }) {
  return (
    <div className={`rounded-2xl border-2 p-5 shadow-sm ${suspicious ? 'border-amber-400 bg-amber-50' : 'border-emerald-400 bg-emerald-50'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3 min-w-0">
          <div>
            <div className="text-xs text-gray-500">Kết quả</div>
            <div className={`text-sm font-semibold mt-0.5 ${suspicious ? 'text-amber-800' : 'text-emerald-800'}`}>
              {suspicious ? 'Mã này đã được quét nhiều lần — có thể là hàng giả.' : 'Sản phẩm này là sản phẩm chính hãng.'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Xác nhận</div>
            <div className="text-sm font-medium text-gray-900 mt-0.5">
              Đã xác thực <strong>{count}</strong> lần
            </div>
          </div>
        </div>
        {suspicious ? <WarningBadge /> : <GenuineBadge />}
      </div>
    </div>
  );
}

function GenuineBadge() {
  return (
    <div className="flex-shrink-0 flex flex-col items-center justify-center w-20 h-20 rounded-full border-2 border-emerald-500 bg-white">
      <ShieldCheck className="w-7 h-7 text-emerald-600" strokeWidth={2.5} />
      <span className="text-[9px] font-bold text-emerald-700 mt-0.5 tracking-wide">CHÍNH HÃNG</span>
    </div>
  );
}

function WarningBadge() {
  return (
    <div className="flex-shrink-0 flex flex-col items-center justify-center w-20 h-20 rounded-full border-2 border-amber-500 bg-white">
      <ShieldAlert className="w-7 h-7 text-amber-600" strokeWidth={2.5} />
      <span className="text-[9px] font-bold text-amber-700 mt-0.5 tracking-wide">NGHI VẤN</span>
    </div>
  );
}

function PendingActivationView({ code, batchCode, serialNo }: { code: string; batchCode?: string; serialNo?: number }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 py-8 px-4">
      <div className="fixed top-0 inset-x-0 h-1.5 bg-gradient-to-r from-slate-400 via-blue-400 to-slate-400 z-10" />
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-500 rounded-2xl shadow-lg ring-4 ring-slate-100 mb-3">
            <ShieldQuestion className="w-9 h-9 text-white" strokeWidth={2} />
          </div>
          <h1 className="font-bold text-slate-700 text-lg">HỆ THỐNG XÁC THỰC</h1>
          <p className="text-xs text-gray-500 mt-1">TrustQR</p>
        </div>

        {/* Pending banner - blue/neutral (not green, not red, not amber) */}
        <div className="rounded-2xl border-2 border-blue-400 bg-blue-50 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Info className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-lg font-bold text-blue-800">CHƯA KÍCH HOẠT</div>
              <div className="text-xs text-blue-700 mt-0.5">Mã QR này chưa được gán sản phẩm</div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-blue-200 text-sm text-blue-900 space-y-2">
            <p>Nguyên nhân có thể là:</p>
            <ul className="list-disc pl-5 space-y-1 text-blue-800">
              <li>Sản phẩm chưa được xuất kho / phát hành</li>
              <li>Đại lý phân phối chưa gán mã vào lô hàng</li>
              <li>Mã đang được in mẫu để kiểm tra</li>
            </ul>
          </div>
        </div>

        {/* Info card */}
        <div className="card mt-4 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Thông tin mã</h2>
          <div className="flex items-center gap-3 text-sm">
            <Hash className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-gray-500 flex-1">Mã tem</span>
            <span className="font-mono text-gray-900">{code}</span>
          </div>
          {batchCode && (
            <div className="flex items-center gap-3 text-sm">
              <PackageIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-gray-500 flex-1">Lô</span>
              <span className="font-mono text-gray-900">{batchCode}</span>
            </div>
          )}
          {serialNo != null && serialNo > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <Hash className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-gray-500 flex-1">Serial</span>
              <span className="font-mono text-gray-900">#{serialNo}</span>
            </div>
          )}
        </div>

        {/* Recommendation */}
        <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 text-sm text-gray-700">
          <p className="font-semibold text-slate-800 mb-1">👉 Bạn nên làm gì?</p>
          <ul className="list-disc pl-5 space-y-1 text-gray-600 text-xs">
            <li>Nếu bạn <strong>vừa mua</strong> sản phẩm và cào tem ra thấy màn hình này → liên hệ nhà bán hàng để xác minh</li>
            <li>Nếu bạn là <strong>đại lý</strong>, vui lòng gán mã vào sản phẩm qua hệ thống quản trị</li>
          </ul>
        </div>

        <div className="mt-6 text-center text-xs text-gray-500">
          <p>© TrustQR — Hệ thống chống hàng giả</p>
        </div>
      </div>
    </main>
  );
}

function InvalidView() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-100 py-8 px-4 flex items-center">
      <div className="fixed top-0 inset-x-0 h-1.5 bg-red-500 z-10" />
      <div className="max-w-md mx-auto text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-red-500 rounded-2xl shadow-lg mb-4">
          <ShieldX className="w-11 h-11 text-white" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-bold text-red-800">MÃ KHÔNG HỢP LỆ</h1>
        <p className="text-red-700 mt-2">
          Mã QR này không tồn tại trong hệ thống TrustQR. Đây có thể là <strong>hàng giả</strong>.
        </p>
        <div className="card mt-6 p-5 text-left text-sm text-gray-600">
          <p><strong>Khuyến nghị:</strong></p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Chỉ mua sản phẩm tại các đại lý được ủy quyền</li>
            <li>Kiểm tra tem chống giả trước khi mua</li>
            <li>Báo ngay cho hotline nếu nghi ngờ hàng giả</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 flex justify-between items-baseline gap-3">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-sm text-gray-900 text-right">{value}</span>
      </div>
    </div>
  );
}

function VoucherCard({ voucher }: { voucher: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gov-500 bg-gov-50 p-5 text-center">
      <Ticket className="w-8 h-8 text-gov-500 mx-auto mb-2" />
      <p className="text-sm text-gov-700 font-medium mb-3">Voucher độc quyền của bạn</p>
      <div className="inline-block bg-white rounded-lg px-6 py-3 shadow-sm border border-gov-200">
        <span className="font-mono text-2xl font-bold text-gov-700 tracking-widest">
          {voucher}
        </span>
      </div>
    </div>
  );
}

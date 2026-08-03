import Link from 'next/link';
import { ShieldCheck, ScanLine, Ticket, Shield } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gov-50 via-white to-gov-100">
      <div className="fixed top-0 inset-x-0 h-1.5 bg-gradient-to-r from-gov-500 via-gold-400 to-gov-500 z-10" />

      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gov-500 rounded-2xl mb-5 shadow-lg ring-4 ring-gov-100">
            <ShieldCheck className="w-14 h-14 text-gold-400" strokeWidth={2} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gov-700 mb-2">
            TrustQR
          </h1>
          <p className="text-lg text-gray-700">Nền tảng xác thực chống hàng giả chuyên nghiệp</p>
          <p className="text-sm text-gray-500 mt-1">Chống hàng giả · Truy vết phân phối · Bảo vệ thương hiệu</p>
        </div>

        <div className="card p-6 sm:p-8 mb-6">
          <h2 className="font-bold text-gray-900 text-lg mb-6 text-center">Hướng dẫn xác thực sản phẩm</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Step number={1} icon={Shield} title="Cào lớp bạc">
              Cạo lớp bạc phủ trên tem sản phẩm để lộ mã QR bên trong
            </Step>
            <Step number={2} icon={ScanLine} title="Quét mã QR">
              Dùng camera điện thoại quét mã QR vừa hiện ra
            </Step>
            <Step number={3} icon={Ticket} title="Nhận voucher">
              Nhập SĐT để nhận voucher độc quyền chỉ dành cho khách chính hãng
            </Step>
          </div>
        </div>

        <div className="card p-5 border-2 border-amber-300 bg-amber-50">
          <div className="flex gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-700 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">Lưu ý bảo vệ bản thân</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Chỉ mua sản phẩm tại các đại lý được ủy quyền</li>
                <li>Không tin mã QR bị dán chồng, chỉnh sửa, hoặc không có lớp bạc</li>
                <li>Nếu quét ra "CẢNH BÁO đã quét X lần" → có thể là hàng nhái sao chép tem</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="text-center mt-8 text-xs text-gray-500 space-y-1">
          <p>© TrustQR — Nền tảng chống hàng giả chuyên nghiệp</p>
          <p>
            <Link href="/privacy" className="text-gov-600 hover:underline">Chính sách bảo mật</Link>
            {' · '}
            <Link href="/customer/unsubscribe" className="text-gov-600 hover:underline">Ngừng nhận thông báo</Link>
            {' · '}
            <Link href="/customer/deletion" className="text-gov-600 hover:underline">Xóa dữ liệu (NĐ13)</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function Step({ number, icon: Icon, title, children }: { number: number; icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="text-center">
      <div className="relative inline-block mb-3">
        <div className="w-14 h-14 bg-gov-50 rounded-xl flex items-center justify-center">
          <Icon className="w-6 h-6 text-gov-600" />
        </div>
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-gold-400 text-white rounded-full flex items-center justify-center text-xs font-bold">
          {number}
        </div>
      </div>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-600">{children}</p>
    </div>
  );
}

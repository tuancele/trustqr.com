import Link from 'next/link';
import { Shield, ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="fixed top-0 inset-x-0 h-1.5 bg-gradient-to-r from-gov-500 via-gold-400 to-gov-500 z-10" />

      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 bg-gov-500 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-gold-400" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gov-700">Chính sách bảo mật</h1>
            <p className="text-sm text-gray-500">Phiên bản v1.1 · Cập nhật 2026-08-05</p>
          </div>
        </div>

        <div className="card p-8 space-y-6 text-gray-700 leading-relaxed">
          <Section number={1} title="Thông tin thu thập">
            <p>Khi bạn quét mã QR, chúng tôi thu thập các nhóm thông tin sau, trong giới hạn cho phép của chính sách trình duyệt di động iOS/Android:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Số điện thoại, nếu bạn nhập để kích hoạt/xác thực sản phẩm và nhận voucher</li>
              <li>Địa chỉ IP, User-Agent, thời gian quét (để phát hiện gian lận)</li>
              <li>Vị trí thành phố suy ra từ IP</li>
              <li>
                Vị trí GPS chính xác hơn — <strong>chỉ khi trình duyệt của bạn cấp quyền</strong>; nếu bạn từ chối
                hoặc thiết bị không hỗ trợ, chúng tôi chỉ dùng vị trí suy ra từ IP ở trên
              </li>
              <li>Loại thiết bị, hệ điều hành, trình duyệt — nhận diện tự động từ User-Agent, không cần xin quyền riêng</li>
              <li>Ngôn ngữ trình duyệt, múi giờ, kích thước màn hình</li>
              <li>Trang giới thiệu (referrer), nếu bạn mở mã QR từ một liên kết chia sẻ thay vì quét trực tiếp bằng camera</li>
              <li>
                Một mã định danh ẩn danh lưu trong cookie trình duyệt (<code className="text-xs bg-gray-100 px-1 py-0.5 rounded">trustqr_vid</code>)
                để nhận biết các lượt quét lặp lại trên cùng thiết bị — <strong>không phải</strong> mã định danh thiết bị thật
                (IMEI/IDFA/GAID), do nền tảng iOS/Android không cho phép trình duyệt web truy cập các mã này; cookie sẽ mất
                nếu bạn xóa dữ liệu trình duyệt hoặc dùng thiết bị/trình duyệt khác
              </li>
            </ul>
          </Section>

          <Section number={2} title="Mục đích sử dụng">
            <ul className="list-disc pl-6 space-y-1">
              <li>Xác thực sản phẩm chính hãng và cấp voucher ưu đãi</li>
              <li>Phát hiện và ngăn chặn hàng giả, hàng nhái</li>
              <li>Gửi thông báo khuyến mãi qua SMS/Zalo <strong>chỉ khi bạn đồng ý riêng</strong></li>
            </ul>
          </Section>

          <Section number={3} title="Quyền của bạn theo Nghị định 13/2023/NĐ-CP">
            <ul className="list-disc pl-6 space-y-1">
              <li>Yêu cầu xem, chỉnh sửa, hoặc xóa dữ liệu cá nhân</li>
              <li>Rút lại sự đồng ý marketing bất cứ lúc nào</li>
              <li>Liên hệ: <a href="mailto:privacy@trustqr.com" className="text-gov-600 hover:underline">privacy@trustqr.com</a></li>
            </ul>
            <div className="flex flex-wrap gap-2 mt-3">
              <Link href="/customer/unsubscribe" className="btn-secondary text-sm">Ngừng marketing</Link>
              <Link href="/customer/deletion" className="btn-danger text-sm">Xóa dữ liệu</Link>
            </div>
          </Section>

          <Section number={4} title="Bảo mật">
            <p>
              Dữ liệu được lưu trữ mã hóa trên máy chủ tại Việt Nam. Chúng tôi <strong>không chia sẻ</strong>{' '}
              SĐT của bạn cho bên thứ ba (không đại lý, không đối tác quảng cáo).
            </p>
          </Section>

          <Section number={5} title="Thời gian lưu trữ">
            <p>
              Dữ liệu SĐT và lịch sử kích hoạt được lưu vĩnh viễn cho mục đích truy vết chống giả,
              trừ khi bạn yêu cầu xóa.
            </p>
          </Section>
        </div>

        <div className="text-center mt-6">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-gov-600 hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" /> Về trang chủ
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 font-bold text-gov-700 text-lg mb-3">
        <span className="w-7 h-7 bg-gov-100 text-gov-700 rounded-full flex items-center justify-center text-sm">{number}</span>
        {title}
      </h2>
      <div className="pl-9 space-y-2">{children}</div>
    </section>
  );
}

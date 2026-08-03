import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-nunito',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://trustqr.com'),
  title: {
    default: 'TrustQR - Hệ thống xác thực chống giả chuyên nghiệp',
    template: '%s - TrustQR',
  },
  description: 'Dịch vụ QR chuyên nghiệp: chống hàng giả, truy vết phân phối, quản lý voucher và bảo vệ thương hiệu.',
};

export const viewport: Viewport = {
  themeColor: '#002088',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi-VN" className={`${nunito.variable} h-full`}>
      <body className="font-sans h-full bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}

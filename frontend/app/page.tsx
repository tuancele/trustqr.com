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
          <p className="text-lg text-gray-700">Professional Anti-Counterfeit Verification Platform</p>
          <p className="text-sm text-gray-500 mt-1">Anti-Counterfeiting · Distribution Traceability · Brand Protection</p>
        </div>

        <div className="card p-6 sm:p-8 mb-6">
          <h2 className="font-bold text-gray-900 text-lg mb-6 text-center">How to Verify Your Product</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Step number={1} icon={Shield} title="Scratch the coating">
              Scratch off the silver coating on the label to reveal the QR code underneath
            </Step>
            <Step number={2} icon={ScanLine} title="Scan the QR code">
              Use your phone's camera to scan the revealed QR code
            </Step>
            <Step number={3} icon={Ticket} title="Get your voucher">
              Enter your phone number to receive an exclusive voucher for genuine customers
            </Step>
          </div>
        </div>

        <div className="card p-5 border-2 border-amber-300 bg-amber-50">
          <div className="flex gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-700 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">How to protect yourself</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Only buy from authorized distributors</li>
                <li>Don't trust a QR code that looks re-stuck, altered, or has no scratch coating</li>
                <li>A "WARNING: scanned X times" result may indicate a copied/counterfeit label</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="text-center mt-8 text-xs text-gray-500 space-y-1">
          <p>© TrustQR — Professional Anti-Counterfeit Platform</p>
          <p>
            <Link href="/privacy" className="text-gov-600 hover:underline">Privacy Policy</Link>
            {' · '}
            <Link href="/customer/unsubscribe" className="text-gov-600 hover:underline">Unsubscribe</Link>
            {' · '}
            <Link href="/customer/deletion" className="text-gov-600 hover:underline">Delete My Data</Link>
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

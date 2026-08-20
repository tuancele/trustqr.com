import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="bg-gov-700 text-gov-100">
      <div className="max-w-6xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-gold-400" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-white text-lg">TrustQR</span>
          </div>
          <p className="text-sm text-gov-200 max-w-xs">
            QR and GS1 product verification for brands that want to stop counterfeits and see exactly how their products move.
          </p>
        </div>

        <div>
          <h3 className="text-white font-semibold text-sm mb-3">Product</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/how-it-works" className="text-gov-200 hover:text-white transition-colors">How It Works</Link></li>
            <li><Link href="/features" className="text-gov-200 hover:text-white transition-colors">Features</Link></li>
            <li><Link href="/pricing" className="text-gov-200 hover:text-white transition-colors">Pricing</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-semibold text-sm mb-3">Company</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/about" className="text-gov-200 hover:text-white transition-colors">About</Link></li>
            <li><Link href="/blog" className="text-gov-200 hover:text-white transition-colors">Blog</Link></li>
            <li><Link href="/contact" className="text-gov-200 hover:text-white transition-colors">Contact</Link></li>
            <li><Link href="/privacy" className="text-gov-200 hover:text-white transition-colors">Privacy Policy</Link></li>
            <li><Link href="/customer/unsubscribe" className="text-gov-200 hover:text-white transition-colors">Unsubscribe</Link></li>
            <li><Link href="/customer/deletion" className="text-gov-200 hover:text-white transition-colors">Data Deletion</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 text-xs text-gov-300">
          &copy; {new Date().getFullYear()} TrustQR. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

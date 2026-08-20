import { ShieldCheck } from 'lucide-react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

export const metadata = {
  title: 'About',
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <SiteHeader />
      <div className="fixed top-16 inset-x-0 h-1.5 bg-gradient-to-r from-gov-500 via-gold-400 to-gov-500 z-10" />

      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 bg-gov-500 rounded-xl flex items-center justify-center mx-auto mb-5">
          <ShieldCheck className="w-6 h-6 text-gold-400" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-bold text-gov-700 mb-3">About TrustQR</h1>
        <div className="card p-8 text-left">
          <p className="text-gray-700 leading-relaxed">
            TrustQR exists to close the gap between a genuine product and a counterfeit one. We build
            verification tools — unique QR and GS1 codes, scan monitoring, and batch traceability —
            that let brands prove authenticity and let customers check it in seconds, with just their phone.
            Our focus is simple: make it easy for the right people to trust what they're buying, and hard
            for counterfeiters to fake it.
          </p>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}

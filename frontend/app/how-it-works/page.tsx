import Link from 'next/link';
import { ScanLine } from 'lucide-react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

export const metadata = {
  title: 'How It Works',
};

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <SiteHeader />
      <div className="fixed top-16 inset-x-0 h-1.5 bg-gradient-to-r from-gov-500 via-gold-400 to-gov-500 z-10" />

      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 bg-gov-500 rounded-xl flex items-center justify-center">
            <ScanLine className="w-5 h-5 text-gold-400" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-gov-700">How It Works</h1>
        </div>

        <div className="card p-8 space-y-8 text-gray-700 leading-relaxed">
          <Section number={1} title="For Customers">
            <p>Verifying a product takes three steps, no app install required:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Scratch off the protective coating on the label to reveal the code</li>
              <li>Scan it with your phone's camera</li>
              <li>Instantly see whether the product is genuine, along with its scan history</li>
            </ul>
            <p>
              If a code shows as already scanned or flagged, treat it as a warning sign — it may indicate
              a copied or re-used label.
            </p>
          </Section>

          <Section number={2} title="For Brands">
            <p>Behind every scan is a full traceability system:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Each product unit gets a unique QR or GS1 code generated at production time</li>
              <li>Codes are linked to batches, distributors, and delivery routes for full traceability</li>
              <li>Every scan is logged with timestamp, IP-based location, and device information</li>
              <li>Duplicate or suspicious scans can automatically lock a code and flag it for review</li>
            </ul>
          </Section>
        </div>

        <div className="text-center mt-6">
          <Link href="/contact" className="btn-primary">Talk to Us About Your Products</Link>
        </div>
      </div>

      <SiteFooter />
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

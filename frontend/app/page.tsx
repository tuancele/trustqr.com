import Link from 'next/link';
import {
  ShieldCheck,
  ScanLine,
  Ticket,
  Shield,
  BarChart3,
  Package,
  Users,
  QrCode,
  Smartphone,
  ArrowRight,
} from 'lucide-react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { fetchPublicStats } from '@/lib/api';

export default async function Home() {
  const stats = await fetchPublicStats();

  return (
    <main className="min-h-screen bg-white">
      <SiteHeader />

      {/* Hero */}
      <section className="bg-gradient-to-br from-gov-50 via-white to-gov-100">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-24 text-center">
          <span className="badge-info mb-5">QR &amp; GS1 PRODUCT VERIFICATION</span>
          <h1 className="text-3xl sm:text-5xl font-bold text-gov-700 mb-5 leading-tight">
            Stop counterfeits before they reach your customers
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            TrustQR gives every product a unique, scannable identity — so you can verify authenticity,
            catch duplicate or re-used codes, and trace each unit from factory to distributor to shelf.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/contact" className="btn-primary w-full sm:w-auto">
              Contact Us <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/how-it-works" className="btn-secondary w-full sm:w-auto">
              See How It Works
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      {stats && (stats.qr_codes > 0 || stats.gs1_units > 0) && (
        <section className="border-y border-gray-200 bg-gov-700">
          <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-2 gap-8 text-center">
            <div>
              <div className="text-3xl sm:text-4xl font-bold text-white">{stats.qr_codes.toLocaleString()}</div>
              <div className="text-sm text-gov-200 mt-1">QR Codes Verified</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-bold text-white">{stats.gs1_units.toLocaleString()}</div>
              <div className="text-sm text-gov-200 mt-1">GS1 Units Verified</div>
            </div>
          </div>
        </section>
      )}

      {/* What is TrustQR */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">What is TrustQR?</h2>
        <p className="text-gray-600 leading-relaxed">
          TrustQR is a verification platform for brands that want proof their products are genuine.
          Every label carries a unique code — either a standalone QR code or a full GS1 digital link —
          that customers scan to confirm authenticity, and that brands use to monitor scan activity across
          every batch, distributor, and region.
        </p>
      </section>

      {/* Solutions */}
      <section className="bg-gov-50/50 py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-10 text-center">Our Solutions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <SolutionCard
              icon={QrCode}
              title="GS1 Product Verification"
              description="Full GS1 digital link support — GTIN, lot, and serial verification on a single scan."
            />
            <SolutionCard
              icon={Shield}
              title="Anti-Counterfeit Monitoring"
              description="Duplicate-scan detection locks a code after it's flagged, with IP and location logging on every scan."
            />
            <SolutionCard
              icon={Package}
              title="Batch & Distributor Traceability"
              description="Track every unit from production batch through distributor to the point it's scanned."
            />
            <SolutionCard
              icon={Ticket}
              title="Customer Loyalty & Vouchers"
              description="Reward genuine first scans with vouchers, building trust and repeat engagement."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-10 text-center">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Step number={1} icon={Shield} title="Scratch the coating">
            Scratch off the protective coating on the label to reveal the code underneath.
          </Step>
          <Step number={2} icon={ScanLine} title="Scan the code">
            Use your phone's camera to scan the QR or GS1 code — no app required.
          </Step>
          <Step number={3} icon={Ticket} title="See the result instantly">
            Instantly see whether the product is genuine, plus scan history and any active offers.
          </Step>
        </div>
        <div className="text-center mt-8">
          <Link href="/how-it-works" className="text-gov-600 font-medium hover:underline inline-flex items-center gap-1">
            Learn more <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gov-50/50 py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-10 text-center">Features</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <SolutionCard icon={ShieldCheck} title="Unique Secure Codes" description="Every code is generated once and tied to a single product unit — impossible to reuse without detection." />
            <SolutionCard icon={BarChart3} title="Real-Time Scan Analytics" description="See scan volume, location, and first-scan status for every product as it happens." />
            <SolutionCard icon={Smartphone} title="Fast Mobile Verification" description="Optimized for a phone camera scan — customers get a result in seconds, on any device." />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <Users className="w-10 h-10 text-gov-500 mx-auto mb-4" />
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
          Ready to protect your brand from counterfeits?
        </h2>
        <p className="text-gray-600 mb-8">Tell us about your product line and we'll help you get started.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/contact" className="btn-primary w-full sm:w-auto">Contact Us</Link>
          <Link href="/pricing" className="btn-secondary w-full sm:w-auto">View Pricing</Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function SolutionCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="card card-hover p-5">
      <div className="w-11 h-11 bg-gov-50 rounded-xl flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-gov-600" />
      </div>
      <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
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

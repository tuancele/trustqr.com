import { Sparkles, QrCode, Shield, Package, Ticket, ShieldCheck, BarChart3, Smartphone } from 'lucide-react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

export const metadata = {
  title: 'Features',
};

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <SiteHeader />
      <div className="fixed top-16 inset-x-0 h-1.5 bg-gradient-to-r from-gov-500 via-gold-400 to-gov-500 z-10" />

      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 bg-gov-500 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-gold-400" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-gov-700">Features</h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
          <FeatureCard icon={QrCode} title="GS1 Product Verification" description="Full GS1 digital link support — GTIN, lot, and serial verification on a single scan, matching global retail standards." />
          <FeatureCard icon={Shield} title="Anti-Counterfeit Monitoring" description="Duplicate-scan detection locks a code the moment it's scanned more than expected, with IP and location logging on every scan." />
          <FeatureCard icon={Package} title="Batch & Distributor Traceability" description="Every unit is linked to its production batch and distributor, so you can trace it from factory to shelf." />
          <FeatureCard icon={Ticket} title="Customer Loyalty & Vouchers" description="Reward genuine first scans with a voucher, turning verification into a moment of trust and engagement." />
          <FeatureCard icon={ShieldCheck} title="Unique Secure Codes" description="Every code is generated once and tied to a single physical unit — it can't be reused without being detected." />
          <FeatureCard icon={BarChart3} title="Real-Time Scan Analytics" description="See scan volume, location, and first-scan status for every product as it happens, from an admin dashboard." />
          <FeatureCard icon={Smartphone} title="Fast Mobile Verification" description="Optimized for a phone camera scan — customers get a clear result in seconds, on any device, no app required." />
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="card p-6">
      <div className="w-11 h-11 bg-gov-50 rounded-xl flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-gov-600" />
      </div>
      <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

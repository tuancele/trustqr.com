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
            <h1 className="text-2xl font-bold text-gov-700">Privacy Policy</h1>
            <p className="text-sm text-gray-500">Version v1.1 · Updated 2026-08-05</p>
          </div>
        </div>

        <div className="card p-8 space-y-6 text-gray-700 leading-relaxed">
          <Section number={1} title="Information We Collect">
            <p>When you scan a QR code, we collect the following categories of information, within what iOS/Android mobile browser policies allow:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Phone number, if you enter it to activate/verify a product and receive a voucher</li>
              <li>IP address, User-Agent, and scan timestamp (for fraud detection)</li>
              <li>City-level location inferred from your IP address</li>
              <li>
                More precise GPS location — <strong>only if your browser grants permission</strong>; if you decline
                or your device doesn't support it, we fall back to the IP-based location above
              </li>
              <li>Device type, operating system, and browser — detected automatically from the User-Agent, no separate permission required</li>
              <li>Browser language, timezone, and screen size</li>
              <li>Referring page, if you open the QR code from a shared link instead of scanning it directly with your camera</li>
              <li>
                An anonymous identifier stored in a browser cookie (<code className="text-xs bg-gray-100 px-1 py-0.5 rounded">trustqr_vid</code>)
                used to recognize repeat scans on the same device — <strong>not</strong> a true device identifier
                (IMEI/IDFA/GAID), since iOS/Android platforms don't allow web browsers to access those; the cookie is lost
                if you clear your browser data or use a different device/browser
              </li>
            </ul>
          </Section>

          <Section number={2} title="How We Use It">
            <ul className="list-disc pl-6 space-y-1">
              <li>Verifying genuine products and issuing promotional vouchers</li>
              <li>Detecting and preventing counterfeit/fake goods</li>
              <li>Sending promotional notifications via SMS/Zalo <strong>only with your separate consent</strong></li>
            </ul>
          </Section>

          <Section number={3} title="Your Rights under Vietnam's Decree 13/2023/ND-CP">
            <ul className="list-disc pl-6 space-y-1">
              <li>Request to view, edit, or delete your personal data</li>
              <li>Withdraw marketing consent at any time</li>
              <li>Contact us: <a href="mailto:privacy@trustqr.com" className="text-gov-600 hover:underline">privacy@trustqr.com</a></li>
            </ul>
            <div className="flex flex-wrap gap-2 mt-3">
              <Link href="/customer/unsubscribe" className="btn-secondary text-sm">Unsubscribe from marketing</Link>
              <Link href="/customer/deletion" className="btn-danger text-sm">Delete my data</Link>
            </div>
          </Section>

          <Section number={4} title="Security">
            <p>
              Data is stored encrypted on servers located in Vietnam. We <strong>do not share</strong>{' '}
              your phone number with any third party (no distributors, no advertising partners).
            </p>
          </Section>

          <Section number={5} title="Data Retention">
            <p>
              Phone number and activation history are retained indefinitely for anti-counterfeit
              traceability purposes, unless you request deletion.
            </p>
          </Section>
        </div>

        <div className="text-center mt-6">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-gov-600 hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
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

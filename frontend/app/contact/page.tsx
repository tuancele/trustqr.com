import { Mail } from 'lucide-react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

export const metadata = {
  title: 'Contact',
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <SiteHeader />
      <div className="fixed top-16 inset-x-0 h-1.5 bg-gradient-to-r from-gov-500 via-gold-400 to-gov-500 z-10" />

      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 bg-gov-500 rounded-xl flex items-center justify-center mx-auto mb-5">
          <Mail className="w-6 h-6 text-gold-400" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-bold text-gov-700 mb-3">Contact Us</h1>
        <div className="card p-8">
          <p className="text-gray-700 leading-relaxed mb-6">
            Email us at{' '}
            <a href="mailto:sales@trustqr.com" className="text-gov-600 font-semibold hover:underline">
              sales@trustqr.com
            </a>{' '}
            and let us know your company name, product line, and expected volume of units. We'll get back
            to you with next steps and pricing.
          </p>
          <a href="mailto:sales@trustqr.com" className="btn-primary">
            <Mail className="w-4 h-4" /> Email sales@trustqr.com
          </a>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}

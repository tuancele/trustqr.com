import { Newspaper } from 'lucide-react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

export const metadata = {
  title: 'Blog',
};

export default function BlogPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <SiteHeader />
      <div className="fixed top-16 inset-x-0 h-1.5 bg-gradient-to-r from-gov-500 via-gold-400 to-gov-500 z-10" />

      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 bg-gov-500 rounded-xl flex items-center justify-center mx-auto mb-5">
          <Newspaper className="w-6 h-6 text-gold-400" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-bold text-gov-700 mb-3">Blog</h1>
        <div className="card p-10">
          <p className="text-gray-600">Coming soon — check back for updates on product verification and anti-counterfeit tools.</p>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}

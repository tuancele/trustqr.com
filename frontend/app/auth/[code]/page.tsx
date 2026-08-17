import { ShieldCheck, ShieldX, ShieldAlert, Hash, Calendar, Factory, MapPin, Tag, Layers, Package as PackageIcon, Repeat, Clock } from 'lucide-react';
import { verifyGS1Code } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmtDateEN(d: string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTimeEN(d: string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default async function GS1AuthPage({ params }: { params: { code: string } }) {
  const result = await verifyGS1Code(params.code);

  if (!result || !result.valid) return <InvalidView />;

  const isSuspicious = result.scan_count > 1 || !!result.warning;

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="fixed top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 z-10" />

      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          {result.brand_logo_url ? (
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg ring-4 ring-emerald-100 mb-3 overflow-hidden">
              <img src={result.brand_logo_url} alt={result.brand_name || ''} className="w-full h-full object-contain p-1.5" />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 rounded-2xl shadow-lg ring-4 ring-emerald-100 mb-3">
              <ShieldCheck className="w-9 h-9 text-white" strokeWidth={2} />
            </div>
          )}
          <h1 className="font-bold text-slate-800 text-lg tracking-tight">Product Authenticity Check</h1>
          <p className="text-xs text-slate-500 mt-1">TrustQR GS1 Verification</p>
        </div>

        <div className="rounded-2xl border-2 border-emerald-200 bg-white p-4 shadow-sm flex items-center gap-4">
          <img src="/trusted-brand-badge.svg" alt="Trusted Brand" className="flex-shrink-0 w-12 h-12" />
          <p className="flex-1 text-sm text-slate-700 leading-relaxed">
            This product is <span className="font-semibold text-emerald-700">genuine</span>. This code has been verified{' '}
            <span className={`font-bold ${isSuspicious ? 'text-red-600' : 'text-emerald-600'}`}>{result.scan_count}</span> time
            {result.scan_count === 1 ? '' : 's'}.
          </p>
        </div>

        {result.warning && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 flex gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">{result.warning}</p>
          </div>
        )}

        {!result.warning && isSuspicious && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 flex gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              This code has been scanned more than once. If you did not expect this, please verify with the manufacturer.
            </p>
          </div>
        )}

        <div className="card mt-4 p-5 space-y-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Product Information</h2>
          <InfoRow icon={PackageIcon} label="Product Name" value={result.product_name || '—'} />
          {result.product_code && <InfoRow icon={Hash} label="Product Code" value={result.product_code} />}
          {result.spec && <InfoRow icon={Layers} label="Specification" value={result.spec} />}
          {result.unit && <InfoRow icon={Layers} label="Unit" value={result.unit} />}
          {result.manufacturer && <InfoRow icon={Factory} label="Manufacturer" value={result.manufacturer} />}
          {result.origin_country && <InfoRow icon={MapPin} label="Origin" value={result.origin_country} />}
        </div>

        <div className="card mt-4 p-5 space-y-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Traceability (GS1)</h2>
          <InfoRow icon={Tag} label="GTIN" value={<span className="font-mono">{result.gtin || '—'}</span>} />
          <InfoRow icon={Hash} label="Lot / Batch" value={<span className="font-mono">{result.lot || '—'}</span>} />
          <InfoRow icon={Hash} label="Serial Number" value={<span className="font-mono">{result.serial || '—'}</span>} />
          <InfoRow icon={Calendar} label="Manufacture Date" value={fmtDateEN(result.manufacture_date)} />
          {result.expiry_date && <InfoRow icon={Calendar} label="Expiry Date" value={fmtDateEN(result.expiry_date)} />}
        </div>

        <div className="card mt-4 p-5 space-y-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Scan History</h2>
          <InfoRow
            icon={Repeat}
            label="Total Scans"
            value={<span className={`font-bold ${isSuspicious ? 'text-red-600' : 'text-emerald-600'}`}>{result.scan_count}</span>}
          />
          {result.first_scanned_at && (
            <InfoRow icon={Clock} label="First Scanned" value={fmtDateTimeEN(result.first_scanned_at)} />
          )}
          {result.first_scan_city && result.first_scan_city !== 'Local' && (
            <InfoRow icon={MapPin} label="First Scan Location" value={result.first_scan_city} />
          )}
        </div>

        <div className="mt-6 text-center text-xs text-slate-400 space-y-1">
          <p>© TrustQR — Anti-Counterfeit Verification System</p>
        </div>
      </div>
    </main>
  );
}

function InvalidView() {
  return (
    <main className="min-h-screen bg-red-50 py-8 px-4 flex items-center">
      <div className="fixed top-0 inset-x-0 h-1.5 bg-red-500 z-10" />
      <div className="max-w-md mx-auto text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-red-500 rounded-2xl shadow-lg mb-4">
          <ShieldX className="w-11 h-11 text-white" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-bold text-red-800">Invalid Code</h1>
        <p className="text-red-700 mt-2">
          This code was not found in the TrustQR system. This product may be <strong>counterfeit</strong>.
        </p>
        <div className="mt-6 p-5 text-left text-sm text-slate-600 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <p><strong>Recommendation:</strong></p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Only purchase from authorized distributors</li>
            <li>Check the anti-counterfeit label before buying</li>
            <li>Report to the hotline if you suspect a counterfeit product</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="py-2.5 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-1.5 text-slate-400">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-sm font-semibold text-slate-900 mt-1 break-words">{value}</div>
    </div>
  );
}

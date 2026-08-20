import { headers } from 'next/headers';
import { ShieldCheck, ShieldX, ShieldAlert, Hash, Calendar, Factory, MapPin, Tag, Layers, Package as PackageIcon, Repeat, Clock, Smartphone } from 'lucide-react';
import { verifyGS1Code, isAdminSession } from '@/lib/api';
import { isMobileUA } from '@/lib/utils';
import { CopySecurityCode } from '@/components/CopySecurityCode';
import { GtinHelp } from '@/components/GtinHelp';
import { ScanCountHelp } from '@/components/ScanCountHelp';
import { BuyMoreButton } from '@/components/BuyMoreModal';
import { GS1VoucherBadge } from '@/components/GS1VoucherBadge';

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
  const h = headers();
  const ua = h.get('user-agent') || '';
  const ip = h.get('x-forwarded-for') || h.get('x-real-ip') || '';
  if (!isMobileUA(ua) && !(await isAdminSession(h.get('cookie') || ''))) return <DesktopOnlyView />;

  const result = await verifyGS1Code(params.code, ip);

  if (!result || !result.valid) return <InvalidView />;

  const isLocked = !!result.locked;
  const isSuspicious = !isLocked && (result.scan_count > 1 || !!result.warning);

  return (
    <main className="min-h-screen bg-gradient-to-br from-gov-50 via-white to-gov-100 py-8 px-4">
      <div className="fixed top-0 inset-x-0 h-1.5 bg-gradient-to-r from-gov-500 via-gold-400 to-gov-500 z-10" />

      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          {result.brand_logo_url ? (
            result.brand_website ? (
              <a
                href={result.brand_website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg ring-4 ring-gov-100 mb-3 overflow-hidden"
              >
                <img src={result.brand_logo_url} alt={result.brand_name || ''} className="w-full h-full object-contain p-1.5" />
              </a>
            ) : (
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg ring-4 ring-gov-100 mb-3 overflow-hidden">
                <img src={result.brand_logo_url} alt={result.brand_name || ''} className="w-full h-full object-contain p-1.5" />
              </div>
            )
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gov-600 rounded-2xl shadow-lg ring-4 ring-gov-100 mb-3">
              <ShieldCheck className="w-9 h-9 text-white" strokeWidth={2} />
            </div>
          )}
          <h1 className="font-bold text-slate-800 text-lg tracking-tight">Product Authenticity Check</h1>
          <p className="text-xs text-slate-500 mt-1">TrustQR GS1 Verification</p>
        </div>

        <div className={`rounded-2xl border-2 p-4 shadow-sm flex items-center gap-4 ${isLocked ? 'border-red-300 bg-red-50' : 'border-gov-200 bg-white'}`}>
          {isLocked ? <LockedBadge /> : <CertifiedBadge />}
          <p className="flex-1 text-sm text-slate-700 leading-relaxed">
            {isLocked ? (
              <>
                This code has been <span className="font-semibold text-red-700">locked</span> after being verified{' '}
                <span className="font-bold text-red-600">{result.scan_count}</span> time
                {result.scan_count === 1 ? '' : 's'}.
              </>
            ) : (
              <>
                This product is <span className="font-semibold text-gov-700">genuine</span>. This code has been verified{' '}
                <span className={`font-bold ${isSuspicious ? 'text-red-600' : 'text-gov-600'}`}>{result.scan_count}</span> time
                {result.scan_count === 1 ? '' : 's'}.<ScanCountHelp />
              </>
            )}
          </p>
        </div>

        <div className="mt-4">
          <CopySecurityCode code={params.code} label="Security Code" copyAriaLabel="Copy security code" />
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

        <div className="card mt-4 p-5 space-y-3 bg-white rounded-2xl border border-gov-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gov-600 uppercase tracking-wide">Product Information</h2>
          <InfoRow icon={PackageIcon} label="Product Name" value={result.product_name || '—'} />
          {result.product_code && <InfoRow icon={Hash} label="Product Code" value={result.product_code} />}
          {result.spec && <InfoRow icon={Layers} label="Specification" value={result.spec} />}
          {result.unit && <InfoRow icon={Layers} label="Unit" value={result.unit} />}
          {result.manufacturer && <InfoRow icon={Factory} label="Manufacturer" value={result.manufacturer} />}
          {result.brand_name && (
            <InfoRow
              icon={Tag}
              label="Brand"
              value={
                result.brand_website ? (
                  <a href={result.brand_website} target="_blank" rel="noopener noreferrer" className="text-slate-900 hover:text-gov-600 hover:underline font-semibold underline-offset-2">
                    {result.brand_name}
                  </a>
                ) : result.brand_name
              }
            />
          )}
          {result.origin_country && <InfoRow icon={MapPin} label="Origin" value={result.origin_country} />}
        </div>

        <div className="card mt-4 p-5 space-y-3 bg-white rounded-2xl border border-gov-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gov-600 uppercase tracking-wide">Traceability (GS1)</h2>
          {result.spec && <MedicalLabelStrip result={result} />}
          <InfoRow icon={Tag} label="GTIN" value={<span className="font-mono inline-flex items-center gap-1.5">{result.gtin || '—'}<GtinHelp gtin={result.gtin} /></span>} />
          <InfoRow icon={Hash} label="Lot / Batch" value={<span className="font-mono">{result.lot || '—'}</span>} />
          <InfoRow icon={Hash} label="Serial Number" value={<span className="font-mono">{result.serial || '—'}</span>} />
          <InfoRow icon={Calendar} label="Manufacture Date" value={fmtDateEN(result.manufacture_date)} />
          {result.expiry_date && <InfoRow icon={Calendar} label="Expiry Date" value={fmtDateEN(result.expiry_date)} />}
        </div>

        <div className="card mt-4 p-5 space-y-3 bg-white rounded-2xl border border-gov-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gov-600 uppercase tracking-wide">Scan History</h2>
          <InfoRow
            icon={Repeat}
            label="Total Scans"
            value={<span className={`font-bold ${isSuspicious ? 'text-red-600' : 'text-gov-600'}`}>{result.scan_count}</span>}
          />
          {result.first_scanned_at && (
            <InfoRow icon={Clock} label="First Scanned" value={fmtDateTimeEN(result.first_scanned_at)} />
          )}
          {result.first_scan_city && result.first_scan_city !== 'Local' && (
            <InfoRow icon={MapPin} label="First Scan Location" value={result.first_scan_city} />
          )}
        </div>

        {result.brand_id && !isLocked && <BuyMoreButton code={params.code} />}

        <div className="mt-6 text-center text-xs text-slate-400 space-y-1">
          <p>© TrustQR — Anti-Counterfeit Verification System</p>
        </div>
      </div>

      {!isLocked && <GS1VoucherBadge code={params.code} />}
    </main>
  );
}

function DesktopOnlyView() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gov-50 via-white to-gov-100 flex items-center justify-center px-4">
      <div className="max-w-sm text-center card p-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gov-500 rounded-2xl shadow-lg ring-4 ring-gov-100 mb-4 mx-auto">
          <Smartphone className="w-9 h-9 text-gold-400" strokeWidth={2} />
        </div>
        <h1 className="font-bold text-gov-700 text-lg mb-2">Please scan with your mobile device</h1>
        <p className="text-sm text-gray-600">
          This code can only be verified on a mobile device. Please use your phone&apos;s camera to scan the QR code again.
        </p>
      </div>
    </main>
  );
}

function CertifiedBadge() {
  return (
    <div className="flex-shrink-0 w-[72px] h-[72px]">
      <img src="/verified-shield-badge.png" alt="Verified genuine" className="w-full h-full object-contain" />
    </div>
  );
}

function LockedBadge() {
  return (
    <div className="flex-shrink-0 w-[72px] h-[72px] rounded-full bg-red-500 shadow-md flex items-center justify-center">
      <ShieldX className="w-9 h-9 text-white" strokeWidth={2} />
    </div>
  );
}

function InvalidView() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-100 py-8 px-4 flex items-center">
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

function MedicalLabelStrip({ result }: { result: import('@/lib/api').GS1VerifyResult }) {
  const barColor = result.label_color || '#475569';
  return (
    <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
      <div className="w-6 flex-shrink-0 flex items-center justify-center py-2" style={{ backgroundColor: barColor }}>
        <span
          className="text-white text-[9px] font-bold tracking-widest whitespace-nowrap"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          SUPER LINE
        </span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-stretch border-b border-slate-100">
          <div className="flex flex-col items-center justify-center gap-1 px-2 py-2 border-r border-slate-100 flex-shrink-0">
            <span className="text-[9px] font-bold border border-slate-700 text-slate-700 rounded px-1 leading-tight">REF</span>
            <span className="text-[8px] text-slate-500 text-center leading-tight">S.L.A.<br />Surface</span>
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center px-3 py-2">
            <span className="font-bold text-slate-900 text-sm leading-tight">{result.spec}</span>
            {result.size_spec && <span className="text-[11px] text-slate-500 leading-tight break-words">{result.size_spec}</span>}
          </div>
        </div>
        {result.barcode_image && (
          <div className="flex flex-col items-center justify-center px-3 py-2">
            <img src={result.barcode_image} alt="Barcode" className="h-8 max-w-[65%] w-auto object-contain" />
            {result.serial && <span className="text-[9px] font-mono text-slate-600 mt-0.5 whitespace-nowrap">{result.serial}</span>}
          </div>
        )}
      </div>
    </div>
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

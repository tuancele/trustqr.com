'use client';

import { useEffect, useState } from 'react';
import { X, Building2, MapPin, Phone, Globe, Mail, Hash, Loader2 } from 'lucide-react';
import { fetchCompany, type CompanyDetail } from '@/lib/api';

export function CompanyModal({ companyId, onClose }: { companyId: number | null; onClose: () => void }) {
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) { setCompany(null); return; }
    setLoading(true);
    fetchCompany(companyId).then((c) => { setCompany(c); setLoading(false); });
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [companyId, onClose]);

  if (!companyId) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in text-left"
      onClick={onClose} role="dialog" aria-modal="true"
    >
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-gov-500 to-gov-600 text-white px-5 py-4 flex items-start justify-between gap-3 relative">
          <div className="absolute inset-x-0 top-0 h-1 bg-gold-400" />
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-gold-400" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-lg leading-tight truncate">{company?.name || 'Công ty'}</h2>
              {company?.tax_code && <span className="text-xs text-gold-300 font-mono">MST: {company.tax_code}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 text-left">
          {loading ? (
            <div className="p-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Đang tải...</div>
          ) : !company ? (
            <div className="p-10 text-center text-gray-500">Không tải được thông tin công ty</div>
          ) : (
            <div className="p-5 space-y-4 text-left">
              {company.logo_url && (
                <div className="w-full flex items-center justify-center bg-gray-50 rounded-lg p-4">
                  <img src={company.logo_url} alt={company.name} className="max-h-32 object-contain" />
                </div>
              )}
              {company.description && (
                <p className="text-sm text-gray-700 leading-relaxed text-left whitespace-pre-line">{company.description}</p>
              )}

              <div className="space-y-2 text-sm border-t border-gray-100 pt-4">
                {company.address && <Line icon={MapPin} value={company.address} />}
                {company.phone && <Line icon={Phone} value={<a href={`tel:${company.phone}`} className="text-gov-600 hover:underline">{company.phone}</a>} />}
                {company.email && <Line icon={Mail} value={<a href={`mailto:${company.email}`} className="text-gov-600 hover:underline">{company.email}</a>} />}
                {company.website && <Line icon={Globe} value={<a href={company.website} target="_blank" rel="noopener noreferrer" className="text-gov-600 hover:underline">{company.website}</a>} />}
                {company.tax_code && <Line icon={Hash} value={<><span className="text-gray-500">Mã số thuế:</span> <strong className="font-mono">{company.tax_code}</strong></>} />}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-3 bg-gray-50 text-center">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Đóng</button>
        </div>
      </div>
    </div>
  );
}

function Line({ icon: Icon, value }: { icon: any; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-gray-700">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <span className="flex-1 text-left">{value}</span>
    </div>
  );
}

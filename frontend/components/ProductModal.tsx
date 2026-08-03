'use client';

import { useEffect, useState } from 'react';
import {
  X, Package, Building2, MapPin, Phone, Globe, FileText, Beaker, BookOpen, AlertTriangle, Loader2, Barcode, Hash,
} from 'lucide-react';
import { fetchProduct, type ProductDetail } from '@/lib/api';

interface Props {
  productId: number | null;
  onClose: () => void;
}

export function ProductModal({ productId, onClose }: Props) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) { setProduct(null); return; }
    setLoading(true);
    fetchProduct(productId).then((p) => {
      setProduct(p);
      setLoading(false);
    });
  }, [productId]);

  useEffect(() => {
    if (!productId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [productId, onClose]);

  if (!productId) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in text-left"
      onClick={onClose}
      role="dialog" aria-modal="true"
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-gov-500 to-gov-600 text-white px-5 py-4 flex items-start justify-between gap-3 relative">
          <div className="absolute inset-x-0 top-0 h-1 bg-gold-400" />
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-gold-400" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-lg leading-tight truncate text-left">
                {product?.name || 'Thông tin sản phẩm'}
              </h2>
              {product?.volume && (
                <span className="text-xs text-gold-300">Đóng gói: {product.volume}</span>
              )}
            </div>
          </div>
          <button
            type="button" onClick={onClose}
            aria-label="Đóng"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 text-left">
          {loading ? (
            <div className="p-10 text-center text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Đang tải...
            </div>
          ) : !product ? (
            <div className="p-10 text-center text-gray-500">
              Không tải được thông tin sản phẩm
            </div>
          ) : (
            <div className="p-5 space-y-5 text-left">
              {product.image_url && (
                <div className="w-full aspect-video bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                  <img src={product.image_url} alt={product.name} className="max-w-full max-h-full object-contain" />
                </div>
              )}

              {product.short_description && (
                <p className="text-sm text-gray-700 leading-relaxed text-left">{product.short_description}</p>
              )}

              {/* Barcode + GTIN + License chips */}
              {(product.barcode || product.gtin || product.license_number) && (
                <div className="flex flex-wrap gap-2">
                  {product.barcode && <Chip icon={Barcode} label="Barcode" value={product.barcode} />}
                  {product.gtin && <Chip icon={Hash} label="GTIN" value={product.gtin} />}
                  {product.license_number && <Chip icon={FileText} label="Công bố" value={product.license_number} />}
                </div>
              )}

              {product.full_description && (
                <Section title="Mô tả chi tiết" icon={FileText}>
                  <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed text-left">{product.full_description}</p>
                </Section>
              )}

              {product.ingredients && (
                <Section title="Thành phần" icon={Beaker}>
                  <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed text-left">{product.ingredients}</p>
                </Section>
              )}

              {product.usage_instructions && (
                <Section title="Hướng dẫn sử dụng" icon={BookOpen}>
                  <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed text-left">{product.usage_instructions}</p>
                </Section>
              )}

              {product.warnings && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800 whitespace-pre-line leading-relaxed text-left flex-1">
                    <strong className="block mb-1">Cảnh báo / lưu ý</strong>
                    {product.warnings}
                  </div>
                </div>
              )}

              {(product.importer_company || product.importer_address || product.importer_phone || product.origin_country) && (
                <Section title="Nhà nhập khẩu / phân phối" icon={Building2}>
                  <div className="text-sm space-y-2 text-left">
                    {product.importer_company && (
                      <InfoLine icon={Building2} value={product.importer_company} />
                    )}
                    {product.importer_address && (
                      <InfoLine icon={MapPin} value={product.importer_address} />
                    )}
                    {product.importer_phone && (
                      <InfoLine icon={Phone} value={<a href={`tel:${product.importer_phone}`} className="text-gov-600 hover:underline">{product.importer_phone}</a>} />
                    )}
                    {product.origin_country && (
                      <InfoLine icon={Globe} value={<>Xuất xứ: <strong>{product.origin_country}</strong></>} />
                    )}
                  </div>
                </Section>
              )}
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

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="text-left">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gov-700 uppercase tracking-wider mb-2">
        <Icon className="w-3.5 h-3.5" /> {title}
      </h3>
      {children}
    </div>
  );
}

function InfoLine({ icon: Icon, value }: { icon: any; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-gray-700">
      <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
      <span className="flex-1 text-left">{value}</span>
    </div>
  );
}

function Chip({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gov-50 border border-gov-100 text-xs">
      <Icon className="w-3 h-3 text-gov-500" />
      <span className="text-gov-600">{label}:</span>
      <span className="font-mono font-medium text-gov-700">{value}</span>
    </div>
  );
}

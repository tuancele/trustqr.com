'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { ProductModal } from './ProductModal';
import { CompanyModal } from './CompanyModal';

export function ProductNameButton({
  productId, productName, kind = 'product',
}: {
  productId: number | null | undefined;
  productName: string;
  kind?: 'product' | 'company';
}) {
  const [open, setOpen] = useState(false);
  if (!productId) return <span>{productName}</span>;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-gov-700 hover:text-gov-600 hover:underline font-semibold underline-offset-2 group"
      >
        {productName}
        <Info className="w-3.5 h-3.5 text-gov-500 opacity-60 group-hover:opacity-100 transition-opacity" />
      </button>
      {kind === 'product' ? (
        <ProductModal productId={open ? productId : null} onClose={() => setOpen(false)} />
      ) : (
        <CompanyModal companyId={open ? productId : null} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

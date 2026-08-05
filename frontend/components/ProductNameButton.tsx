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
        className="text-left text-gray-900 hover:text-gov-600 font-semibold underline-offset-2 hover:underline group"
      >
        {productName}
        <Info className="inline-block w-3.5 h-3.5 ml-1 text-gray-400 group-hover:text-gov-500 transition-colors align-text-bottom" />
      </button>
      {kind === 'product' ? (
        <ProductModal productId={open ? productId : null} onClose={() => setOpen(false)} />
      ) : (
        <CompanyModal companyId={open ? productId : null} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

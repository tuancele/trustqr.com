'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/adminApi';
import { ProductForm, type ProductData } from '@/components/ProductForm';
import { Spinner, Alert } from '@/components/ui';

export default function EditProductPage({ params }: { params: { id: string } }) {
  const productId = Number(params.id);
  const [data, setData] = useState<ProductData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ProductData>(`/api/v1/admin/products/${productId}`).then((r) => {
      if (r.ok && r.data) setData(r.data);
      else setError(r.error || 'Không tải được sản phẩm');
    });
  }, [productId]);

  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!data) return <Spinner />;

  return <ProductForm productId={productId} initial={data} />;
}

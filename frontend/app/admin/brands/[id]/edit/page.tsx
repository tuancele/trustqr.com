'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/adminApi';
import { BrandForm, type BrandData } from '@/components/BrandForm';
import { Spinner, Alert } from '@/components/ui';

export default function EditBrandPage({ params }: { params: { id: string } }) {
  const brandId = Number(params.id);
  const [data, setData] = useState<BrandData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<BrandData>(`/api/v1/admin/brands/${brandId}`).then((r) => {
      if (r.ok && r.data) setData(r.data);
      else setError(r.error || 'Không tải được thương hiệu');
    });
  }, [brandId]);

  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!data) return <Spinner />;
  return <BrandForm brandId={brandId} initial={data} />;
}

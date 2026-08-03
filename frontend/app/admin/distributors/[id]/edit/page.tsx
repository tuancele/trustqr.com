'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/adminApi';
import { DistributorForm, type DistributorData } from '@/components/DistributorForm';
import { Spinner, Alert } from '@/components/ui';

export default function EditDistributorPage({ params }: { params: { id: string } }) {
  const distributorId = Number(params.id);
  const [data, setData] = useState<DistributorData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DistributorData>(`/api/v1/admin/distributors/${distributorId}`).then((r) => {
      if (r.ok && r.data) setData(r.data);
      else setError(r.error || 'Không tải được đại lý');
    });
  }, [distributorId]);

  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!data) return <Spinner />;
  return <DistributorForm distributorId={distributorId} initial={data} />;
}

'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/adminApi';
import { CompanyForm, type CompanyData } from '@/components/CompanyForm';
import { Spinner, Alert } from '@/components/ui';

export default function EditCompanyPage({ params }: { params: { id: string } }) {
  const companyId = Number(params.id);
  const [data, setData] = useState<CompanyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CompanyData>(`/api/v1/admin/companies/${companyId}`).then((r) => {
      if (r.ok && r.data) setData(r.data);
      else setError(r.error || 'Không tải được công ty');
    });
  }, [companyId]);

  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!data) return <Spinner />;
  return <CompanyForm companyId={companyId} initial={data} />;
}

'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/adminApi';
import { AdminUserForm, type AdminUserData } from '@/components/AdminUserForm';
import { Spinner, Alert } from '@/components/ui';

export default function EditAdminUserPage({ params }: { params: { id: string } }) {
  const userId = Number(params.id);
  const [data, setData] = useState<AdminUserData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AdminUserData>(`/api/v1/admin/users/${userId}`).then((r) => {
      if (r.ok && r.data) setData(r.data);
      else setError(r.error || 'Không tải được người dùng');
    });
  }, [userId]);

  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!data) return <Spinner />;
  return <AdminUserForm userId={userId} initial={data} />;
}

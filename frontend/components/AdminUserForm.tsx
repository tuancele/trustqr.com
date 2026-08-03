'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserCog, Save, Loader2, X } from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Alert } from '@/components/ui';

export interface AdminUserData {
  id?: number;
  email: string;
  is_active?: boolean;
}

export function AdminUserForm({ userId, initial }: { userId?: number; initial?: AdminUserData }) {
  const router = useRouter();
  const isEdit = !!userId;
  const [email, setEmail] = useState(initial?.email || '');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(initial?.is_active !== false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEdit && password.length < 8) {
      setError('Mật khẩu tối thiểu 8 ký tự');
      return;
    }
    if (password && password.length < 8) {
      setError('Mật khẩu tối thiểu 8 ký tự');
      return;
    }

    setLoading(true);
    const body: Record<string, unknown> = { email, is_active: isActive };
    if (password) body.password = password;

    const r = isEdit
      ? await api(`/api/v1/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) })
      : await api('/api/v1/admin/users', { method: 'POST', body: JSON.stringify(body) });
    setLoading(false);
    if (!r.ok) {
      setError(r.error === 'email_exists' ? 'Email đã được sử dụng' : r.error || 'Lỗi');
      return;
    }
    router.push('/admin/users');
  }

  return (
    <div className="max-w-2xl">
      <PageHeader icon={UserCog} title={isEdit ? 'Sửa người dùng' : 'Thêm người dùng'}
        subtitle="Tài khoản có quyền truy cập toàn bộ hệ thống quản trị" />
      <form onSubmit={submit} className="space-y-4">
        <div className="card p-5 space-y-4">
          <Field label="Email" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required autoFocus className="form-input" placeholder="admin@trustqr.com" />
          </Field>
          <Field label={isEdit ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu'} required={!isEdit}>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required={!isEdit} minLength={8} className="form-input" placeholder="Tối thiểu 8 ký tự" autoComplete="new-password" />
          </Field>
          <label className="flex items-center gap-2 text-sm pt-2 border-t border-gray-100 cursor-pointer">
            <input type="checkbox" checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-gov-500 focus:ring-gov-500" />
            <span>Đang hoạt động</span>
          </label>
        </div>
        {error && <Alert kind="danger">{error}</Alert>}
        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Cập nhật' : 'Thêm người dùng'}
          </button>
          <Link href="/admin/users" className="btn-secondary"><X className="w-4 h-4" /> Hủy</Link>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">{label} {required && <span className="text-red-500">*</span>}</label>
      {children}
    </div>
  );
}

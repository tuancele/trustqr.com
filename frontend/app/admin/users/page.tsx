'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  UserCog, Plus, Edit3, Trash2, ShieldCheck, ShieldOff,
  Lock, Unlock, XCircle, CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Spinner, EmptyState } from '@/components/ui';
import { fmtDate } from '@/lib/utils';

interface AdminUser {
  id: number;
  email: string;
  is_active: boolean;
  totp_enabled: boolean;
  totp_configured: boolean;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
}

export default function AdminUsersPage() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selfId, setSelfId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    api<AdminUser[]>('/api/v1/admin/users').then((r) => {
      if (r.ok && r.data) setItems(r.data);
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    api<{ id: number }>('/api/v1/admin/auth/me').then((r) => {
      if (r.ok && r.data) setSelfId(r.data.id);
    });
  }, []);

  async function del(u: AdminUser) {
    if (!confirm(`Xóa vĩnh viễn tài khoản "${u.email}"?`)) return;
    const r = await api(`/api/v1/admin/users/${u.id}`, { method: 'DELETE' });
    if (r.ok) load();
    else alert('Lỗi: ' + (r.error === 'cannot_delete_last_admin' ? 'Không thể xóa admin cuối cùng' : r.error));
  }

  async function toggleActive(u: AdminUser) {
    const r = await api(`/api/v1/admin/users/${u.id}`, {
      method: 'PATCH', body: JSON.stringify({ is_active: !u.is_active }),
    });
    if (r.ok) load();
    else alert('Lỗi: ' + (r.error === 'cannot_disable_self' ? 'Không thể tự khóa tài khoản của chính mình' : r.error));
  }

  async function unlock(u: AdminUser) {
    const r = await api(`/api/v1/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ unlock: true }) });
    if (r.ok) load(); else alert('Lỗi: ' + r.error);
  }

  async function reset2FA(u: AdminUser) {
    if (!confirm(`Đặt lại 2FA cho "${u.email}"? Tài khoản sẽ đăng nhập được chỉ bằng mật khẩu cho tới khi thiết lập lại.`)) return;
    const r = await api(`/api/v1/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ reset_2fa: true }) });
    if (r.ok) load(); else alert('Lỗi: ' + r.error);
  }

  return (
    <div>
      <PageHeader
        icon={UserCog}
        title="Quản lý người dùng"
        subtitle="Tài khoản admin có quyền truy cập hệ thống quản trị"
        actions={<Link href="/admin/users/new" className="btn-primary"><Plus className="w-4 h-4" /> Thêm người dùng</Link>}
      />

      {loading ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon={UserCog} title="Chưa có người dùng"
          description="Thêm tài khoản admin để cấp quyền truy cập."
          action={<Link href="/admin/users/new" className="btn-primary"><Plus className="w-4 h-4" /> Thêm người dùng</Link>} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">2FA</th>
                  <th className="px-4 py-3">Đăng nhập gần nhất</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((u) => {
                  const isSelf = u.id === selfId;
                  const isLocked = !!u.locked_until && new Date(u.locked_until) > new Date();
                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {u.email} {isSelf && <span className="ml-1.5 badge-muted text-[10px] align-middle">Bạn</span>}
                      </td>
                      <td className="px-4 py-3 space-y-1">
                        {u.is_active ? <span className="badge-success">Đang hoạt động</span> :
                          <span className="badge-muted"><XCircle className="w-3 h-3" /> Đã khóa</span>}
                        {isLocked && (
                          <div className="text-[11px] text-red-600 flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Tạm khóa do đăng nhập sai ({u.failed_attempts} lần)
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.totp_enabled && u.totp_configured ? (
                          <span className="badge-success"><ShieldCheck className="w-3 h-3" /> Đã bật</span>
                        ) : (
                          <span className="badge-muted"><ShieldOff className="w-3 h-3" /> Chưa bật</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {u.last_login_at ? (
                          <>
                            {fmtDate(u.last_login_at)}
                            {u.last_login_ip && <div className="text-gray-400">{u.last_login_ip}</div>}
                          </>
                        ) : <em className="text-gray-400">Chưa đăng nhập</em>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5 flex-wrap">
                          {isLocked && (
                            <button onClick={() => unlock(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-medium">
                              <Unlock className="w-3 h-3" /> Mở khóa
                            </button>
                          )}
                          {u.totp_configured && (
                            <button onClick={() => reset2FA(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-medium">
                              <ShieldOff className="w-3 h-3" /> Reset 2FA
                            </button>
                          )}
                          {!isSelf && (
                            <button onClick={() => toggleActive(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-50 text-gray-700 hover:bg-gray-100 text-xs font-medium">
                              {u.is_active ? <><XCircle className="w-3 h-3" /> Khóa</> : <><CheckCircle2 className="w-3 h-3" /> Mở</>}
                            </button>
                          )}
                          <Link href={`/admin/users/${u.id}/edit`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gov-50 text-gov-700 hover:bg-gov-100 text-xs font-medium">
                            <Edit3 className="w-3 h-3" /> Sửa
                          </Link>
                          {!isSelf && (
                            <button onClick={() => del(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 text-xs font-medium">
                              <Trash2 className="w-3 h-3" /> Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

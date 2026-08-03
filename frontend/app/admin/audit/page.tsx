'use client';

import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Spinner, EmptyState } from '@/components/ui';
import { fmtDate } from '@/lib/utils';

interface AuditRow {
  id: number;
  admin_id: number | null;
  email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip: string;
  user_agent: string;
  at: string;
}

const actionColors: Record<string, string> = {
  'batch.create':      'bg-gov-50 text-gov-700',
  'box.assign':        'bg-cyan-50 text-cyan-700',
  'token.disable':     'bg-red-50 text-red-700',
  'customers.export':  'bg-purple-50 text-purple-700',
  '2fa.enable':        'bg-emerald-50 text-emerald-700',
  '2fa.disable':       'bg-amber-50 text-amber-700',
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<AuditRow[]>('/api/v1/admin/audit?limit=200').then((r) => {
      if (r.ok && r.data) setLogs(r.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        icon={ScrollText}
        title="Nhật ký hệ thống"
        subtitle="200 hành động admin gần nhất — dùng để audit và điều tra sự cố"
      />

      {logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="Chưa có nhật ký" description="Nhật ký sẽ xuất hiện khi admin thực hiện hành động." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Hành động</th>
                  <th className="px-4 py-3">Đối tượng</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500 text-xs">#{l.id}</td>
                    <td className="px-4 py-2.5 text-gray-900">{l.email || <em className="text-gray-400">system</em>}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block font-mono text-xs px-2 py-0.5 rounded ${actionColors[l.action] || 'bg-gray-100 text-gray-700'}`}>
                        {l.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">
                      {l.target_type ? `${l.target_type}${l.target_id ? ':' + l.target_id : ''}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{l.ip}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{fmtDate(l.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

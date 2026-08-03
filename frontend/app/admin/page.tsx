'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AdminIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/dashboard');
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Đang chuyển hướng...
    </div>
  );
}

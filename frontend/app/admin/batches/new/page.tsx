'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PackagePlus, ExternalLink, CheckCircle2, Loader2, X } from 'lucide-react';
import { api } from '@/lib/adminApi';
import { PageHeader, Alert } from '@/components/ui';
import { fmtNumber } from '@/lib/utils';
import { ProductPicker } from '@/components/ProductPicker';

export default function NewBatchPage() {
  const router = useRouter();
  const [batchCode, setBatchCode] = useState(`BATCH-${new Date().getFullYear()}-`);
  const [product, setProduct] = useState<any>(null);
  const [quantity, setQuantity] = useState(100);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const r = await api('/api/v1/admin/batches', {
      method: 'POST',
      body: JSON.stringify({
        batch_code: batchCode,
        product_id: product?.id || 0,
        quantity,
        notes,
      }),
    });
    setLoading(false);
    if (!r.ok) { setError(r.error || 'Có lỗi'); return; }
    setResult(r.data);
  }

  if (result) {
    return (
      <div className="max-w-2xl">
        <PageHeader
          icon={CheckCircle2}
          title="Đã tạo lô thành công"
          subtitle={`Lô ${result.batch_code} với ${fmtNumber(result.generated)} tem QR`}
        />
        <div className="card p-6 space-y-4">
          <Alert kind="success" title="Sinh thành công">
            {fmtNumber(result.generated)} mã QR đã được sinh và lưu vào cơ sở dữ liệu.
          </Alert>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <p className="text-xs text-gray-500 uppercase">Batch ID</p>
              <p className="font-mono font-bold text-gov-700 mt-1">{result.batch_id}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Mã lô</p>
              <p className="font-mono font-bold text-gov-700 mt-1">{result.batch_code}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">URL mẫu (kiểm tra)</p>
            <a href={result.sample_url} target="_blank" className="inline-flex items-center gap-1.5 text-gov-600 hover:text-gov-700 hover:underline text-sm break-all">
              {result.sample_url} <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
            </a>
          </div>

          <div className="flex gap-2 pt-4 border-t border-gray-100">
            <button onClick={() => router.push('/admin/batches')} className="btn-primary">Xem tất cả lô</button>
            <button
              onClick={() => { setResult(null); setBatchCode(`BATCH-${new Date().getFullYear()}-`); setProduct(null); }}
              className="btn-secondary"
            >
              Tạo lô khác
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        icon={PackagePlus}
        title="Tạo lô sản xuất mới"
        subtitle="Sinh N mã QR unique cho một lô hàng"
      />

      <form onSubmit={submit} className="card p-6 space-y-4">
        <div>
          <label className="form-label">Mã lô <span className="text-red-500">*</span></label>
          <input
            value={batchCode} onChange={(e) => setBatchCode(e.target.value)}
            required placeholder="BATCH-2026-08" className="form-input font-mono"
          />
          <p className="text-xs text-gray-500 mt-1">Duy nhất trong hệ thống. Gợi ý: BATCH-YYYY-MM</p>
        </div>

        <div>
          <label className="form-label">Sản phẩm mặc định <span className="text-gray-400 font-normal">(tùy chọn)</span></label>
          <ProductPicker value={product} onChange={setProduct} />
          <p className="text-xs text-gray-500 mt-1">
            💡 <strong>Không cần chọn ngay.</strong> Bạn có thể tạo lô "trắng" 1 triệu tem, in ra, rồi <strong>gán từng dải cho sản phẩm khác nhau</strong> ở trang chi tiết lô.
          </p>
        </div>

        <div>
          <label className="form-label">Số lượng tem <span className="text-red-500">*</span></label>
          <input
            type="number" min={1} max={1000000} value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
            required className="form-input"
          />
          <p className="text-xs text-gray-500 mt-1">
            Tối đa <strong>1.000.000</strong> tem/lô. Sinh 100.000 tem mất ~30 giây.
          </p>
        </div>

        <div>
          <label className="form-label">Ghi chú <span className="text-gray-400 font-normal">(tùy chọn)</span></label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)}
            className="form-input min-h-[80px]" placeholder="VD: Lô sản xuất tháng 8, phân phối Hà Nội..."
          />
        </div>

        {error && <Alert kind="danger">{error}</Alert>}

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Đang sinh {fmtNumber(quantity)} mã...</>
            ) : (
              <><PackagePlus className="w-4 h-4" /> Sinh {fmtNumber(quantity)} mã QR</>
            )}
          </button>
          <Link href="/admin/batches" className="btn-secondary"><X className="w-4 h-4" /> Hủy</Link>
        </div>
      </form>
    </div>
  );
}

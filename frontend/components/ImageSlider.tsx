'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProductImage } from '@/lib/api';

const AUTOPLAY_MS = 2500;

export function ImageSlider({ images }: { images: ProductImage[] }) {
  const [index, setIndex] = useState(0);

  // Restarting on every index change (manual or auto) keeps the interval
  // from firing right after a user just clicked/tapped to a slide.
  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [index, images.length]);

  if (images.length === 0) return null;

  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);

  return (
    <div className="card mt-4 overflow-hidden">
      <div className="relative aspect-square bg-gray-100">
        <img src={images[index].url} alt="" className="w-full h-full object-contain" />
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Ảnh trước"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 shadow flex items-center justify-center hover:bg-white"
            >
              <ChevronLeft className="w-4 h-4 text-gray-700" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Ảnh sau"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 shadow flex items-center justify-center hover:bg-white"
            >
              <ChevronRight className="w-4 h-4 text-gray-700" />
            </button>
            <div className="absolute bottom-2 inset-x-0 flex items-center justify-center">
              <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur-sm rounded-full px-2.5 py-1.5">
                {images.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Ảnh ${i + 1}`}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/50'}`}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

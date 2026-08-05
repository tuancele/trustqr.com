'use client';

import { useEffect, useState } from 'react';
import type { PromoBanner } from '@/lib/api';

const AUTOPLAY_MS = 3500;

export function PromoBannerSlider({ banners }: { banners: PromoBanner[] }) {
  const [index, setIndex] = useState(0);

  // Restarting on every index change (manual or auto) keeps the interval
  // from firing right after a user just clicked/tapped to a slide.
  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % banners.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [index, banners.length]);

  if (banners.length === 0) return null;

  const slide = (
    <img src={banners[index].url} alt="" className="w-full h-full object-cover" />
  );

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm">
      <div className="relative aspect-[16/7] bg-gray-100">
        {banners[index].link_url ? (
          <a href={banners[index].link_url!} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
            {slide}
          </a>
        ) : slide}
        {banners.length > 1 && (
          <div className="absolute bottom-2 inset-x-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur-sm rounded-full px-2.5 py-1.5">
              {banners.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Banner ${i + 1}`}
                  className={`w-1.5 h-1.5 rounded-full transition-colors pointer-events-auto ${i === index ? 'bg-white' : 'bg-white/50'}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

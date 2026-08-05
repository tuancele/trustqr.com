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

  // No fixed aspect ratio: the frame sizes itself to each banner's natural
  // dimensions instead of cropping it via object-cover.
  const slide = (
    <img src={banners[index].url} alt="" className="w-full h-auto block" />
  );

  return (
    <div className="overflow-hidden shadow-sm">
      <div className="bg-gray-100">
        {banners[index].link_url ? (
          <a href={banners[index].link_url!} target="_blank" rel="noopener noreferrer" className="block">
            {slide}
          </a>
        ) : slide}
      </div>
      {banners.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2">
          {banners.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Banner ${i + 1}`}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-gov-500' : 'bg-gray-300'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

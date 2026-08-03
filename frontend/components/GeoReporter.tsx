'use client';

import { useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

/**
 * Silently requests browser geolocation and reports it back to /api/v1/qr/verify
 * as a second call so the scan log gets device_lat/device_lng.
 *
 * Only used for READY tokens — pending tokens skip this component entirely.
 */
export function GeoReporter({ code }: { code: string }) {
  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    // Delay 1s so main verify completes first (avoids double insert on same request)
    const t = setTimeout(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          // Fire-and-forget - errors ignored intentionally
          fetch(`${API_URL}/api/v1/qr/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code,
              lat: latitude,
              lng: longitude,
              accuracy,
            }),
          }).catch(() => {});
        },
        () => {
          // User denied or error - silent
        },
        {
          enableHighAccuracy: false,
          timeout: 10_000,
          maximumAge: 60_000,
        }
      );
    }, 1000);

    return () => clearTimeout(t);
  }, [code]);

  return null; // invisible component
}

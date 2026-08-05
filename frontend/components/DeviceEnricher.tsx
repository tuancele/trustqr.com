'use client';

import { useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// Runs after the main verify render, once. Reports GPS (if granted) plus
// screen size and timezone (no permission needed) in a single call to
// /qr/enrich, which UPDATEs the scan_logs row the initial verify already
// created — it never touches scan_count or inserts a new row.
export function DeviceEnricher({ code }: { code: string }) {
  useEffect(() => {
    const send = (coords?: { lat: number; lng: number; accuracy: number }) => {
      fetch(`${API_URL}/api/v1/qr/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          lat: coords?.lat,
          lng: coords?.lng,
          accuracy: coords?.accuracy,
          screen_width: window.screen?.width,
          screen_height: window.screen?.height,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      }).catch(() => {});
    };

    const t = setTimeout(() => {
      if (!('geolocation' in navigator)) {
        send();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          send({ lat: latitude, lng: longitude, accuracy });
        },
        () => send(),
        { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 }
      );
    }, 1000);

    return () => clearTimeout(t);
  }, [code]);

  return null;
}

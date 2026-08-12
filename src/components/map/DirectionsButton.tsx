'use client';

import { useState } from 'react';

/**
 * Directions that start from where you actually are.
 *
 * THE BUG THIS FIXES: the previous link was
 * `google.com/maps/dir/?api=1&destination=lat,lng` with no `origin`. With no origin,
 * Google Maps guesses one — and on desktop that guess comes from the IP address, which can
 * be a different city entirely. Rod saw it place him nowhere near where he was. On a phone
 * the app usually falls back to GPS and gets it right, which is exactly what makes the
 * desktop failure easy to miss in testing.
 *
 * So we ask the browser for a real position and pass it as `origin`. If the user declines
 * or it times out, we fall back to the origin-less link — no worse than before, and the
 * mapping app will still use device location where it can.
 *
 * Apple Maps is used on Apple platforms because that is the app that will actually open;
 * sending an iPhone to a Google Maps URL bounces through Safari first.
 */

function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) &&
    !/Chrome|Android/.test(navigator.userAgent)
  );
}

function directionsUrl(
  destLat: number,
  destLng: number,
  origin: GeolocationCoordinates | null,
): string {
  const dest = `${destLat},${destLng}`;

  if (isApplePlatform()) {
    const params = new URLSearchParams({ daddr: dest, dirflg: 'd' });
    if (origin) params.set('saddr', `${origin.latitude},${origin.longitude}`);
    return `https://maps.apple.com/?${params.toString()}`;
  }

  const params = new URLSearchParams({
    api: '1',
    destination: dest,
    travelmode: 'driving',
  });
  if (origin) params.set('origin', `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function DirectionsButton({
  lat,
  lng,
  className,
}: {
  lat: number;
  lng: number;
  className?: string;
}) {
  const [locating, setLocating] = useState(false);

  async function open() {
    setLocating(true);

    const origin = await new Promise<GeolocationCoordinates | null>((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null);
        return;
      }
      // Short timeout: someone standing in a car park should not wait on a GPS fix before
      // their maps app opens. A slightly worse route beats a stalled button.
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position.coords),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 },
      );
    });

    setLocating(false);
    window.open(directionsUrl(lat, lng, origin), '_blank', 'noopener,noreferrer');
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={locating}
      className={className}
    >
      {locating ? 'Finding you…' : 'Get directions'}
    </button>
  );
}

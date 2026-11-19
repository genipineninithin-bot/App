export interface GeoFixResult {
  ok: true;
  lat: number;
  lng: number;
  accuracyMeters?: number;
  updatedAt: string;
}

export interface GeoFixError {
  ok: false;
  status: 'denied' | 'prompt' | 'unsupported';
  message: string;
}

export type GeolocationOutcome = GeoFixResult | GeoFixError;

function runSingleGeoRequest(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * Reliable two-stage browser geolocation helper.
 * Uses fast network/OS positioning first (avoids desktop/iframe GPS timeouts),
 * then falls back to high-accuracy GPS if needed.
 */
export async function requestBestGeolocation(): Promise<GeolocationOutcome> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return {
      ok: false,
      status: 'unsupported',
      message: 'Geolocation is not supported in this browser.',
    };
  }

  try {
    const pos = await runSingleGeoRequest({
      enableHighAccuracy: false,
      timeout: 6500,
      maximumAge: 60_000,
    });
    return {
      ok: true,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyMeters: Number.isFinite(pos.coords.accuracy)
        ? Math.round(pos.coords.accuracy)
        : undefined,
      updatedAt: new Date().toISOString(),
    };
  } catch (firstErr) {
    const code = (firstErr as GeolocationPositionError | undefined)?.code;
    if (code === 1) {
      return {
        ok: false,
        status: 'denied',
        message:
          'Location access is blocked by your browser. Click the site settings/lock icon in your address bar, allow Location, then tap Retry.',
      };
    }

    // Retry with high-accuracy GPS / longer timeout for mobile or cold-start devices
    try {
      const pos = await runSingleGeoRequest({
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 120_000,
      });
      return {
        ok: true,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyMeters: Number.isFinite(pos.coords.accuracy)
          ? Math.round(pos.coords.accuracy)
          : undefined,
        updatedAt: new Date().toISOString(),
      };
    } catch (secondErr) {
      const secondCode = (secondErr as GeolocationPositionError | undefined)?.code;
      if (secondCode === 1) {
        return {
          ok: false,
          status: 'denied',
          message:
            'Location access is blocked by your browser. Allow Location in your browser site settings and tap Retry.',
        };
      }
      return {
        ok: false,
        status: 'prompt',
        message:
          'Unable to get a GPS lock right now (OS Location Services may be turned off). Enable device location and tap Retry.',
      };
    }
  }
}

export function isRunningInsideIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

import { AQI_CITIES } from './datasets';

export interface SpaceWeatherReading {
  kpIndex: number;
  stormLevel: 'G0 Quiet' | 'G1 Minor' | 'G2 Moderate' | 'G3 Strong' | 'G4 Severe' | 'G5 Extreme';
  gpsImpact: string;
  observedAt: string;
}

export interface AirQualityCityReading {
  city: string;
  usAqi: number;
  pm25: number;
  pm10: number;
  category: 'Good' | 'Moderate' | 'Unhealthy for Sensitive' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous';
}

export interface SupplementalFeedsPayload {
  spaceWeather: SpaceWeatherReading | null;
  airQuality: AirQualityCityReading[];
  sources: {
    noaaSpaceWeather: 'live' | 'unavailable';
    openMeteoAqi: 'live' | 'unavailable';
  };
}

function classifyStorm(kp: number): {
  stormLevel: SpaceWeatherReading['stormLevel'];
  gpsImpact: string;
} {
  if (kp >= 9) return { stormLevel: 'G5 Extreme', gpsImpact: 'Severe satellite, HF radio & power grid risk' };
  if (kp >= 8) return { stormLevel: 'G4 Severe', gpsImpact: 'Widespread GPS drift & grid voltage alerts' };
  if (kp >= 7) return { stormLevel: 'G3 Strong', gpsImpact: 'Intermittent satellite & low-freq radio issues' };
  if (kp >= 6) return { stormLevel: 'G2 Moderate', gpsImpact: 'High-latitude radio & minor GPS fluctuation' };
  if (kp >= 5) return { stormLevel: 'G1 Minor', gpsImpact: 'Minor solar storm; normal civilian operations' };
  return { stormLevel: 'G0 Quiet', gpsImpact: 'Nominal GPS, satellite & power grid stability' };
}

function classifyUsAqi(aqi: number): AirQualityCityReading['category'] {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

async function fetchJsonTimeout<T>(url: string, timeoutMs = 4200): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

let supplementalCache: { expiresAt: number; data: SupplementalFeedsPayload } | null = null;

export async function fetchSupplementalLiveFeeds(forceRefresh = false): Promise<SupplementalFeedsPayload> {
  const now = Date.now();
  if (!forceRefresh && supplementalCache && supplementalCache.expiresAt > now) {
    return supplementalCache.data;
  }

  const lats = AQI_CITIES.map((c) => c.lat).join(',');
  const lngs = AQI_CITIES.map((c) => c.lng).join(',');

  const [swpcRes, aqiRes] = await Promise.allSettled([
    fetchJsonTimeout<Array<{ time_tag?: string; Kp?: number }>>(
      'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
      4200
    ),
    fetchJsonTimeout<
      Array<{
        current?: {
          us_aqi?: number;
          pm2_5?: number;
          pm10?: number;
        };
      }>
    >(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lngs}&current=us_aqi,pm2_5,pm10`,
      4200
    ),
  ]);

  let spaceWeather: SpaceWeatherReading | null = null;
  if (swpcRes.status === 'fulfilled' && Array.isArray(swpcRes.value) && swpcRes.value.length > 0) {
    const latest = swpcRes.value[swpcRes.value.length - 1];
    const kp = Number(latest?.Kp);
    if (Number.isFinite(kp)) {
      const { stormLevel, gpsImpact } = classifyStorm(kp);
      spaceWeather = {
        kpIndex: Math.round(kp * 100) / 100,
        stormLevel,
        gpsImpact,
        observedAt: String(latest?.time_tag || new Date().toISOString()),
      };
    }
  }

  let airQuality: AirQualityCityReading[] = [];
  if (aqiRes.status === 'fulfilled') {
    const rows = Array.isArray(aqiRes.value) ? aqiRes.value : [aqiRes.value];
    airQuality = AQI_CITIES.map((city, idx) => {
      const cur = rows[idx]?.current;
      const usAqi = Math.round(Number(cur?.us_aqi ?? 45));
      return {
        city: city.name,
        usAqi,
        pm25: Math.round(Number(cur?.pm2_5 ?? 10) * 10) / 10,
        pm10: Math.round(Number(cur?.pm10 ?? 18) * 10) / 10,
        category: classifyUsAqi(usAqi),
      };
    });
  }

  const payload: SupplementalFeedsPayload = {
    spaceWeather,
    airQuality,
    sources: {
      noaaSpaceWeather: spaceWeather ? 'live' : 'unavailable',
      openMeteoAqi: airQuality.length > 0 ? 'live' : 'unavailable',
    },
  };

  supplementalCache = {
    expiresAt: now + 2 * 60_000,
    data: payload,
  };

  return payload;
}

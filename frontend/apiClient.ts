import type { LiveDisasterIncident } from '../src/types/modules';
import type { DataSourceSpec } from '../backend/datasets';
import type { AirQualityCityReading, SpaceWeatherReading } from '../backend/liveFeeds';

export interface RealtimeFeedResponse {
  fetchedAt: string;
  earthquakes: Array<{
    id: string;
    magnitude: number;
    place: string;
    depthKm: number;
    timeMs: number;
    url?: string;
  }>;
  liveDisasters?: LiveDisasterIncident[];
  cyberAdvisories: Array<{
    cveId: string;
    vendor: string;
    product: string;
    title: string;
    dateAdded: string;
    knownRansomware: string;
  }>;
  weather: Array<{
    city: string;
    temperatureC: number;
    windKmh: number;
    precipitationMm: number;
    condition: string;
  }>;
  spaceWeather?: SpaceWeatherReading | null;
  airQuality?: AirQualityCityReading[];
  sources: {
    usgs: 'live' | 'unavailable';
    cisa: 'live' | 'unavailable';
    weather: 'live' | 'unavailable';
    currentDisaster?: 'live' | 'unavailable';
    gdacs?: 'live' | 'unavailable';
    nasaEonet?: 'live' | 'unavailable';
    noaaSpaceWeather?: 'live' | 'unavailable';
    openMeteoAqi?: 'live' | 'unavailable';
  };
}

export interface ArchitectureOverviewResponse {
  frontendFolder: string;
  backendFolder: string;
  database: {
    engine: string;
    databaseId: string;
    collections: string[];
  };
  dataSources: DataSourceSpec[];
}

export async function fetchRealtimeFeed(forceRefresh = false): Promise<RealtimeFeedResponse> {
  const resp = await fetch(`/api/realtime/feed${forceRefresh ? '?refresh=1' : ''}`);
  if (!resp.ok) {
    throw new Error(`Live feed returned HTTP ${resp.status}`);
  }
  return (await resp.json()) as RealtimeFeedResponse;
}

export async function fetchPlatformArchitecture(): Promise<ArchitectureOverviewResponse> {
  const resp = await fetch('/api/system/architecture');
  if (!resp.ok) {
    throw new Error(`Architecture catalog returned HTTP ${resp.status}`);
  }
  return (await resp.json()) as ArchitectureOverviewResponse;
}

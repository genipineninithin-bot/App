export interface DataSourceSpec {
  id: string;
  name: string;
  category: 'Disaster & Seismic' | 'Satellite & Radar' | 'Weather & Air Quality' | 'Space Weather' | 'Cybersecurity' | 'Maps & Places' | 'Database & Auth' | 'Generative AI';
  providerUrl: string;
  backendRoute: string;
  datasetOrFeed: string;
  refreshStrategy: string;
}

export interface WeatherGridStationMeta {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export const WEATHER_GRID_STATIONS: WeatherGridStationMeta[] = [
  { id: 'vizag', name: 'Visakhapatnam', lat: 17.69, lng: 83.22 },
  { id: 'chennai', name: 'Chennai', lat: 13.08, lng: 80.27 },
  { id: 'kolkata', name: 'Kolkata', lat: 22.57, lng: 88.36 },
  { id: 'mumbai', name: 'Mumbai', lat: 19.08, lng: 72.88 },
  { id: 'delhi', name: 'New Delhi', lat: 28.61, lng: 77.21 },
  { id: 'dhaka', name: 'Dhaka', lat: 23.81, lng: 90.41 },
  { id: 'yangon', name: 'Yangon', lat: 16.84, lng: 96.16 },
  { id: 'bangkok', name: 'Bangkok', lat: 13.75, lng: 100.5 },
  { id: 'singapore', name: 'Singapore', lat: 1.35, lng: 103.82 },
  { id: 'manila', name: 'Manila', lat: 14.6, lng: 120.98 },
  { id: 'tokyo', name: 'Tokyo', lat: 35.68, lng: 139.65 },
  { id: 'sydney', name: 'Sydney', lat: -33.87, lng: 151.21 },
  { id: 'dubai', name: 'Dubai', lat: 25.2, lng: 55.27 },
  { id: 'colombo', name: 'Colombo', lat: 6.93, lng: 79.86 },
];

export const AQI_CITIES: WeatherGridStationMeta[] = [
  { id: 'vizag-aqi', name: 'Visakhapatnam', lat: 17.69, lng: 83.22 },
  { id: 'delhi-aqi', name: 'New Delhi', lat: 28.61, lng: 77.21 },
  { id: 'mumbai-aqi', name: 'Mumbai', lat: 19.08, lng: 72.88 },
  { id: 'tokyo-aqi', name: 'Tokyo', lat: 35.68, lng: 139.65 },
];

export const PLATFORM_DATA_SOURCES: DataSourceSpec[] = [
  {
    id: 'currentdisaster',
    name: 'CurrentDisaster.com',
    category: 'Disaster & Seismic',
    providerUrl: 'https://currentdisaster.com/',
    backendRoute: 'GET /api/disasters/live',
    datasetOrFeed: 'Live global emergency & disaster alert stream',
    refreshStrategy: '60s fresh cache + stale-while-revalidate',
  },
  {
    id: 'gdacs',
    name: 'GDACS (UN / European Commission)',
    category: 'Disaster & Seismic',
    providerUrl: 'https://www.gdacs.org/',
    backendRoute: 'GET /api/disasters/live',
    datasetOrFeed: 'Global Disaster Alert and Coordination System RSS/GeoRSS',
    refreshStrategy: '60s fresh cache + stale-while-revalidate',
  },
  {
    id: 'nasa-eonet',
    name: 'NASA EONET v3',
    category: 'Disaster & Seismic',
    providerUrl: 'https://eonet.gsfc.nasa.gov/',
    backendRoute: 'GET /api/disasters/live',
    datasetOrFeed: 'Earth Observatory Natural Event Tracker open events API',
    refreshStrategy: '60s fresh cache + stale-while-revalidate',
  },
  {
    id: 'usgs',
    name: 'USGS Earthquake Hazards',
    category: 'Disaster & Seismic',
    providerUrl: 'https://earthquake.usgs.gov/',
    backendRoute: 'GET /api/disasters/live & /api/realtime/feed',
    datasetOrFeed: 'USGS M4.5+ Real-Time GeoJSON Seismic Feed',
    refreshStrategy: '60s shared deduplicated cache',
  },
  {
    id: 'cisa-kev',
    name: 'CISA Known Exploited Vulnerabilities (KEV)',
    category: 'Cybersecurity',
    providerUrl: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    backendRoute: 'GET /api/realtime/feed',
    datasetOrFeed: 'CISA KEV Live JSON Catalog (CVEs & ransomware flags)',
    refreshStrategy: '60s fresh cache + stale-while-revalidate',
  },
  {
    id: 'open-meteo-wx',
    name: 'Open-Meteo Weather & Air Quality',
    category: 'Weather & Air Quality',
    providerUrl: 'https://open-meteo.com/',
    backendRoute: 'GET /api/weather/grid & /api/realtime/feed',
    datasetOrFeed: '14-city live temp, wind, humidity, pressure, precip & US AQI / PM2.5',
    refreshStrategy: '2–5m server-side cache',
  },
  {
    id: 'noaa-swpc',
    name: 'NOAA Space Weather (SWPC)',
    category: 'Space Weather',
    providerUrl: 'https://www.swpc.noaa.gov/',
    backendRoute: 'GET /api/realtime/feed',
    datasetOrFeed: 'Planetary K-Index (Kp) geomagnetic storm & GPS disruption telemetry',
    refreshStrategy: '2m server-side cache',
  },
  {
    id: 'rainviewer',
    name: 'RainViewer Live Radar & NASA GIBS',
    category: 'Satellite & Radar',
    providerUrl: 'https://www.rainviewer.com/',
    backendRoute: 'Client tile stream on Google Maps overlay',
    datasetOrFeed: 'Animated multi-frame precipitation/Doppler radar + VIIRS True-Color Orbit',
    refreshStrategy: '10-minute rolling live frames',
  },
  {
    id: 'google-maps',
    name: 'Google Maps Platform',
    category: 'Maps & Places',
    providerUrl: 'https://mapsplatform.google.com/',
    backendRoute: 'GET /api/maps/config',
    datasetOrFeed: 'Maps JS API, Satellite/Terrain tiles, Advanced Markers & Places API (New)',
    refreshStrategy: 'Interactive real-time viewport',
  },
  {
    id: 'firestore',
    name: 'Firebase Cloud Firestore & Auth',
    category: 'Database & Auth',
    providerUrl: 'https://firebase.google.com/',
    backendRoute: 'Real-time client SDK (onSnapshot) + firestore.rules',
    datasetOrFeed: '10 collections: users, admins, disasters, incidents, relief_resources, alerts, threats, ai_knowledge, system_config, audit_logs',
    refreshStrategy: 'Instant real-time WebSocket sync',
  },
  {
    id: 'gemini',
    name: 'Gemini API (Server-Side Proxy)',
    category: 'Generative AI',
    providerUrl: 'https://ai.google.dev/',
    backendRoute: 'POST /api/assistant/stream, /api/cyber/analyze, /api/response/analyze',
    datasetOrFeed: 'Streaming emergency helper, scam/log analyzer, triage & damage analysis',
    refreshStrategy: 'On-demand SSE streaming & JSON analysis',
  },
];

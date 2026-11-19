import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CloudRain,
  Crosshair,
  Droplets,
  ExternalLink,
  Gauge,
  Globe,
  Layers,
  Loader2,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  Navigation,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Satellite,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Thermometer,
  Wind,
  X,
} from 'lucide-react';
import {
  AlertNotification,
  CyberThreat,
  DisasterForecast,
  IncidentTicket,
  ModuleId,
  ReliefResource,
  Severity,
} from '../types/modules';
import {
  plainDisasterCategory,
  plainIncidentStatus,
  plainMarkerKind,
  plainReliefStatus,
  plainSeverity,
} from '../utils/plainLabels';
import { requestBestGeolocation } from '../../frontend/permissions';

export interface MapMarkerItem {
  id: string;
  kind: 'disaster' | 'incident' | 'alert' | 'cyber' | 'relief';
  title: string;
  region: string;
  severity: Severity;
  impactLabel: string;
  detail: string;
  lat: number;
  lng: number;
  targetModule: ModuleId;
  sourceName?: string;
  sourceUrl?: string;
  emoji: string;
  categoryLabel: string;
  ringHex: string;
  affectedRadiusKm: number;
  safeZoneRadiusKm: number;
  isApprovedCitizenReport?: boolean;
}

export interface GoogleMapsPanelProps {
  forecasts: DisasterForecast[];
  incidents: IncidentTicket[];
  alerts?: AlertNotification[];
  threats?: CyberThreat[];
  resources?: ReliefResource[];
  showCyber?: boolean;
  heightClass?: string;
  variant?: 'standard' | 'stream';
  initialUserLocation?: { lat: number; lng: number } | null;
  onSelectModule?: (id: ModuleId) => void;
}

type StreamLayerMode =
  | 'radar-cloud'
  | 'hd-orbit'
  | 'doppler'
  | 'precipitation'
  | 'wind'
  | 'temperature'
  | 'humidity'
  | 'pressure';

interface RadarFrame {
  time: number;
  path: string;
}

interface WeatherGridStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tempC: number;
  humidityPct: number;
  pressureHpa: number;
  windKmh: number;
  windDeg: number;
  precipMm: number;
}

interface StormTrackNode {
  id: string;
  lat: number;
  lng: number;
  label: string;
  stage: string;
  windKmh: number;
  pressureHpa: number;
  isCurrent?: boolean;
}

const GMP_ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];
const ZOOM_EARTH_PRESET_URL =
  'https://zoom.earth/maps/satellite/#view=17.61,85.82,5.7z/date=2026-11-18,14:30,+5.5';
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 17.61, lng: 85.82 };
const DEFAULT_ZOOM = 5;

function buildZoomEarthUrl(lat: number, lng: number, zoom: number): string {
  return `https://zoom.earth/maps/satellite/#view=${lat.toFixed(2)},${lng.toFixed(2)},${Math.max(
    3,
    Math.min(16, zoom)
  ).toFixed(1)}z`;
}

function getYesterdayUtcDateString(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function formatRadarTimestamp(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const day = d.getDate().toString().padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' });
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${month}, ${hh}:${mm}`;
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /429|RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|OverQuota|QuotaExceeded/i.test(msg);
}

function resolveLatLng(region: string, locationCoords?: string): { lat: number; lng: number } {
  if (locationCoords) {
    const nums = locationCoords.match(/-?\d+(\.\d+)?/g);
    if (nums && nums.length >= 2) {
      let lat = parseFloat(nums[0]);
      let lng = parseFloat(nums[1]);
      if (locationCoords.toUpperCase().includes('S')) lat = -Math.abs(lat);
      if (locationCoords.toUpperCase().includes('W')) lng = -Math.abs(lng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }
  }
  const r = region.toLowerCase();
  if (r.includes('tokyo')) return { lat: 35.6762, lng: 139.6503 };
  if (r.includes('sendai') || r.includes('japan')) return { lat: 38.2682, lng: 140.8694 };
  if (r.includes('luzon') || r.includes('philippines') || r.includes('manila'))
    return { lat: 16.4023, lng: 120.596 };
  if (r.includes('california') || r.includes('sacramento') || r.includes('sierra'))
    return { lat: 38.5816, lng: -121.4944 };
  if (r.includes('rhine') || r.includes('cologne') || r.includes('germany'))
    return { lat: 50.9375, lng: 6.9603 };
  if (r.includes('munich') || r.includes('bavaria')) return { lat: 48.1351, lng: 11.582 };
  if (r.includes('mumbai') || r.includes('india')) return { lat: 19.076, lng: 72.8777 };
  if (r.includes('delhi')) return { lat: 28.6139, lng: 77.209 };
  if (r.includes('london') || r.includes('uk')) return { lat: 51.5072, lng: -0.1276 };
  if (r.includes('new york') || r.includes('us')) return { lat: 40.7128, lng: -74.006 };
  if (r.includes('singapore')) return { lat: 1.3521, lng: 103.8198 };
  if (r.includes('sydney') || r.includes('australia')) return { lat: -33.8688, lng: 151.2093 };
  if (r.includes('windows server')) return { lat: 39.0438, lng: -77.4874 };
  if (r.includes('windows 11')) return { lat: 47.6062, lng: -122.3321 };
  if (r.includes('android') || r.includes('mobile')) return { lat: 35.6762, lng: 139.6503 };
  if (r.includes('ot') || r.includes('scada')) return { lat: 48.7758, lng: 9.1829 };
  return { lat: 35.6762, lng: 139.6503 };
}

function formatCoordsLabel(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}° ${ns}, ${Math.abs(lng).toFixed(3)}° ${ew}`;
}

function pinPalette(severity: Severity, kind: MapMarkerItem['kind']) {
  if (kind === 'relief') {
    return {
      background: '#14b8a6',
      borderColor: '#0f766e',
      glyphColor: '#f0fdfa',
      dotClass: 'bg-teal-400',
      badgeClass: 'text-teal-300 border-teal-500/40 bg-teal-950/60',
    };
  }
  if (kind === 'cyber' || severity === 'Critical') {
    return {
      background: '#ef4444',
      borderColor: '#991b1b',
      glyphColor: '#fef2f2',
      dotClass: 'bg-red-400',
      badgeClass: 'text-red-300 border-red-500/40 bg-red-950/60',
    };
  }
  if (kind === 'alert' || severity === 'High') {
    return {
      background: '#f59e0b',
      borderColor: '#92400e',
      glyphColor: '#fffbeb',
      dotClass: 'bg-amber-400',
      badgeClass: 'text-amber-300 border-amber-500/40 bg-amber-950/60',
    };
  }
  if (severity === 'Moderate') {
    return {
      background: '#38bdf8',
      borderColor: '#0369a1',
      glyphColor: '#f0f9ff',
      dotClass: 'bg-sky-400',
      badgeClass: 'text-sky-300 border-sky-500/40 bg-sky-950/60',
    };
  }
  return {
    background: '#10b981',
    borderColor: '#065f46',
    glyphColor: '#ecfdf5',
    dotClass: 'bg-emerald-400',
    badgeClass: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/60',
  };
}

function resolveIssueSymbol(
  text: string,
  kind: MapMarkerItem['kind'],
  severity: Severity,
  categoryHint?: string
): { emoji: string; categoryLabel: string; ringHex: string; defaultRadiusKm: number } {
  if (kind === 'relief') {
    const t = text.toLowerCase();
    return {
      emoji: t.includes('hospital') || t.includes('trauma') || t.includes('medical') ? '🏥' : '🛟',
      categoryLabel: t.includes('hospital') || t.includes('trauma') ? 'Safe Hospital Hub' : 'Safe Relief Shelter',
      ringHex: '#10b981',
      defaultRadiusKm: 0,
    };
  }

  if (kind === 'cyber') {
    return {
      emoji: '🛡️',
      categoryLabel: 'Cyber Threat',
      ringHex: '#f43f5e',
      defaultRadiusKm: severity === 'Critical' ? 18 : 10,
    };
  }

  const combined = `${categoryHint || ''} ${text}`.toLowerCase();
  const sevMult = severity === 'Critical' ? 1.45 : severity === 'High' ? 1.15 : severity === 'Moderate' ? 0.85 : 0.6;

  if (/wildfire|forest fire|bushfire|spot fire|fire|blaze|burn|smoke/.test(combined)) {
    return {
      emoji: '🔥',
      categoryLabel: 'Fire / Wildfire',
      ringHex: '#f97316',
      defaultRadiusKm: Math.round(16 * sevMult),
    };
  }
  if (/volcano|eruption|lava|ash/.test(combined)) {
    return {
      emoji: '🌋',
      categoryLabel: 'Volcano',
      ringHex: '#f43f5e',
      defaultRadiusKm: Math.round(32 * sevMult),
    };
  }
  if (/earthquake|seismic|quake|tremor|magnitude|m\s*\d\.\d/.test(combined)) {
    return {
      emoji: '💥',
      categoryLabel: 'Earthquake',
      ringHex: '#ef4444',
      defaultRadiusKm: Math.round(45 * sevMult),
    };
  }
  if (/flood|tsunami|surge|inundation|river|coastal|water rescue|heavy rain/.test(combined)) {
    return {
      emoji: '🌊',
      categoryLabel: 'Flood / Surge',
      ringHex: '#06b6d4',
      defaultRadiusKm: Math.round(20 * sevMult),
    };
  }
  if (/cyclone|typhoon|hurricane|storm|wind|gale|akvan|depression/.test(combined)) {
    return {
      emoji: '🌀',
      categoryLabel: 'Cyclone / Storm',
      ringHex: '#a855f7',
      defaultRadiusKm: Math.round(75 * sevMult),
    };
  }
  if (/power|grid|electric|transformer|outage|blackout|substation/.test(combined)) {
    return {
      emoji: '⚡',
      categoryLabel: 'Power / Grid',
      ringHex: '#eab308',
      defaultRadiusKm: Math.round(12 * sevMult),
    };
  }
  if (/medical|ambulance|casualt|injur|heart|bleed|trapped|rescue/.test(combined)) {
    return {
      emoji: '🚑',
      categoryLabel: 'Medical SOS',
      ringHex: '#ef4444',
      defaultRadiusKm: Math.round(8 * sevMult),
    };
  }
  return {
    emoji: '🚨',
    categoryLabel: kind === 'alert' ? 'Official Alert' : 'Emergency SOS',
    ringHex: severity === 'Critical' ? '#ef4444' : '#f59e0b',
    defaultRadiusKm: Math.round(12 * sevMult),
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function plainTargetModuleLabel(id: ModuleId): string {
  switch (id) {
    case 'disaster':
      return 'Disasters';
    case 'satellite':
      return 'Live Satellite & Radar';
    case 'response':
      return 'Help & SOS';
    case 'relief':
      return 'Hospitals & Shelters';
    case 'alerts':
      return 'Alerts';
    case 'cyber':
      return 'Cyber Safety';
    case 'assistant':
      return 'AI Helper';
    case 'analytics':
      return 'Reports & Charts';
    case 'admin':
      return 'Admin';
    default:
      return 'Command Center';
  }
}

// Build a clean storm/cyclone trajectory anchored either to a live cyclone incident or the Bay of Bengal monitoring corridor
function buildStormTrack(forecasts: DisasterForecast[]): StormTrackNode[] {
  const cyclone = forecasts.find(
    (f) => f.category === 'Cyclone' && typeof f.lat === 'number' && typeof f.lng === 'number'
  );
  const eyeLat = cyclone?.lat ?? 17.61;
  const eyeLng = cyclone?.lng ?? 85.82;
  const baseName = cyclone?.title || 'Bay of Bengal Tropical System';

  return [
    {
      id: 'trk-1',
      lat: eyeLat - 2.7,
      lng: eyeLng - 0.55,
      label: `${baseName} (-36h)`,
      stage: 'Tropical Disturbance',
      windKmh: 45,
      pressureHpa: 1004,
    },
    {
      id: 'trk-2',
      lat: eyeLat - 1.5,
      lng: eyeLng - 0.3,
      label: `${baseName} (-18h)`,
      stage: 'Deep Depression',
      windKmh: 62,
      pressureHpa: 998,
    },
    {
      id: 'trk-3',
      lat: eyeLat,
      lng: eyeLng,
      label: `${baseName} (Active Eye)`,
      stage: 'Cyclonic Circulation',
      windKmh: 88,
      pressureHpa: 991,
      isCurrent: true,
    },
    {
      id: 'trk-4',
      lat: eyeLat + 1.45,
      lng: eyeLng + 0.25,
      label: `${baseName} (+12h Forecast)`,
      stage: 'Coastal Approach Watch',
      windKmh: 76,
      pressureHpa: 995,
    },
    {
      id: 'trk-5',
      lat: eyeLat + 2.85,
      lng: eyeLng + 0.45,
      label: `${baseName} (+24h Forecast)`,
      stage: 'Inland Rainband',
      windKmh: 52,
      pressureHpa: 1001,
    },
    {
      id: 'trk-6',
      lat: eyeLat + 4.1,
      lng: eyeLng + 0.55,
      label: `${baseName} (+36h Forecast)`,
      stage: 'Remnant Low',
      windKmh: 34,
      pressureHpa: 1006,
    },
  ];
}

// Module-level cached resolver for the Maps API key
let cachedServerKeyPromise: Promise<string> | null = null;

function getBuildTimeMapsKey(): string {
  const raw = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  if (!raw || /^MY_GOOGLE_MAPS/i.test(raw)) return '';
  return raw;
}

function fetchServerMapsKey(): Promise<string> {
  if (!cachedServerKeyPromise) {
    cachedServerKeyPromise = fetch('/api/maps/config', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { apiKey: '' }))
      .then((data: { apiKey?: string }) => String(data?.apiKey || '').trim())
      .catch(() => '');
  }
  return cachedServerKeyPromise;
}

interface MarkerWithInfoProps {
  item: MapMarkerItem;
  isSelected: boolean;
  nearestSafeHub?: { title: string; distanceKm: number } | null;
  onSelect: (item: MapMarkerItem) => void;
  onClose: () => void;
  onOpenDetails: (item: MapMarkerItem) => void;
  onNavigateModule?: (id: ModuleId) => void;
}

const MarkerWithInfo: React.FC<MarkerWithInfoProps> = ({
  item,
  isSelected,
  nearestSafeHub,
  onSelect,
  onClose,
  onOpenDetails,
  onNavigateModule,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const isPulsing = item.kind !== 'relief' && (item.severity === 'Critical' || item.severity === 'High');

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: item.lat, lng: item.lng }}
        title={`${item.emoji} ${item.title} (${item.region})`}
        zIndex={isSelected ? 85 : item.severity === 'Critical' ? 70 : 50}
        onClick={() => onSelect(item)}
      >
        <div
          className="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
          style={{ transform: isSelected ? 'scale(1.18)' : undefined }}
        >
          {/* Glowing Hazard / Safe Aura */}
          <span
            className={`absolute rounded-full ${isPulsing ? 'animate-ping' : ''}`}
            style={{
              width: isSelected ? 46 : 38,
              height: isSelected ? 46 : 38,
              backgroundColor: item.ringHex,
              opacity: isSelected ? 0.34 : 0.22,
            }}
          />
          {/* Crisp Circular Emoji Issue Pin */}
          <div
            className="relative w-9 h-9 rounded-full bg-slate-950/95 flex items-center justify-center shadow-xl"
            style={{
              border: `2.5px solid ${item.ringHex}`,
              boxShadow: `0 0 14px ${item.ringHex}88`,
            }}
          >
            <span className="text-[17px] leading-none select-none" role="img" aria-label={item.categoryLabel}>
              {item.emoji}
            </span>
          </div>
        </div>
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={300}>
          <div className="text-slate-100 space-y-1.5 font-sans min-w-[220px]">
            <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <span>
                {item.emoji} {item.categoryLabel}
              </span>
              <span className="text-amber-300">{plainSeverity(item.severity)}</span>
            </div>
            <div className="text-xs font-bold text-white leading-snug">{item.title}</div>
            <div className="text-[11px] text-slate-300">{item.region}</div>
            <div className="text-[11px] font-medium text-slate-200">{item.impactLabel}</div>

            {item.kind !== 'relief' && item.affectedRadiusKm > 0 ? (
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 space-y-1 text-[11px]">
                <div className="font-semibold text-red-400">
                  ⚠️ Affected Radius: {item.affectedRadiusKm} km danger zone
                </div>
                <div className="font-semibold text-emerald-400">
                  ✅ Safe Area: Outside {item.affectedRadiusKm} km (Safe ring: {item.affectedRadiusKm}–
                  {item.safeZoneRadiusKm} km+)
                </div>
                {nearestSafeHub && (
                  <div className="text-[10px] text-slate-300">
                    🏥 Nearest Safe Hub: <strong className="text-white">{nearestSafeHub.title}</strong> ({nearestSafeHub.distanceKm} km away)
                  </div>
                )}
              </div>
            ) : (
              <div className="p-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-[11px] font-semibold text-emerald-300">
                ✅ Verified Safe Zone · Active Relief &amp; Shelter Hub
              </div>
            )}

            <div className="text-[10px] font-mono text-slate-400">
              {formatCoordsLabel(item.lat, item.lng)}
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-[10px]">
              {item.sourceName && item.sourceUrl && (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-blue-400 hover:underline"
                >
                  <span>Source: {item.sourceName}</span>
                  <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                </a>
              )}
              <a
                href={buildZoomEarthUrl(item.lat, item.lng, 8)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-sky-400 hover:underline"
              >
                <span>Zoom Earth</span>
                <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
              </a>
            </div>
            <div className="pt-1 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenDetails(item)}
                className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-[11px] font-medium hover:bg-slate-700"
              >
                Open Details
              </button>
              {onNavigateModule && (
                <button
                  type="button"
                  onClick={() => onNavigateModule(item.targetModule)}
                  className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 inline-flex items-center gap-1"
                >
                  <span>{plainTargetModuleLabel(item.targetModule)}</span>
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

// Draws Affected Danger Radius & Outer Safe Area Rings (google.maps.Circle) for live hazards and safe shelters
const HazardZonesOverlay: React.FC<{
  markers: MapMarkerItem[];
  selectedId: string | null;
}> = ({ markers, selectedId }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const circles: google.maps.Circle[] = [];

    markers.forEach((item) => {
      const isSelected = selectedId === item.id;
      if (item.kind === 'relief') {
        // Soft emerald safe-haven zone around hospitals & shelters
        circles.push(
          new google.maps.Circle({
            map,
            center: { lat: item.lat, lng: item.lng },
            radius: 6000,
            strokeColor: '#10b981',
            strokeOpacity: isSelected ? 0.9 : 0.5,
            strokeWeight: isSelected ? 2 : 1.2,
            fillColor: '#10b981',
            fillOpacity: isSelected ? 0.22 : 0.1,
            clickable: false,
            zIndex: 8,
          })
        );
        return;
      }

      if (item.affectedRadiusKm > 0) {
        // Outer Green Safe Area Corridor Ring (shows where the SAFE area begins outside the affected radius)
        if (item.safeZoneRadiusKm > item.affectedRadiusKm) {
          circles.push(
            new google.maps.Circle({
              map,
              center: { lat: item.lat, lng: item.lng },
              radius: item.safeZoneRadiusKm * 1000,
              strokeColor: '#10b981',
              strokeOpacity: isSelected ? 0.9 : 0.5,
              strokeWeight: isSelected ? 2 : 1.1,
              fillColor: '#10b981',
              fillOpacity: isSelected ? 0.08 : 0.03,
              clickable: false,
              zIndex: 5,
            })
          );
        }

        // Inner Affected Danger Zone Circle
        circles.push(
          new google.maps.Circle({
            map,
            center: { lat: item.lat, lng: item.lng },
            radius: item.affectedRadiusKm * 1000,
            strokeColor: item.ringHex,
            strokeOpacity: isSelected ? 0.95 : 0.72,
            strokeWeight: isSelected ? 2.5 : 1.5,
            fillColor: item.ringHex,
            fillOpacity: isSelected ? 0.28 : 0.16,
            clickable: false,
            zIndex: 10,
          })
        );
      }
    });

    return () => {
      circles.forEach((c) => c.setMap(null));
    };
  }, [map, markers, selectedId]);

  return null;
};

interface StormTrackOverlayProps {
  nodes: StormTrackNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

const StormTrackOverlay: React.FC<StormTrackOverlayProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
}) => {
  const map = useMap();

  useEffect(() => {
    if (!map || nodes.length < 2) return;
    const line = new google.maps.Polyline({
      path: nodes.map((n) => ({ lat: n.lat, lng: n.lng })),
      geodesic: true,
      strokeColor: '#c4b5fd',
      strokeOpacity: 0.9,
      strokeWeight: 2.5,
      map,
    });
    return () => {
      line.setMap(null);
    };
  }, [map, nodes]);

  return (
    <>
      {nodes.map((node) => (
        <StormTrackNodePin
          key={node.id}
          node={node}
          isSelected={selectedNodeId === node.id}
          onSelect={() => onSelectNode(node.id)}
          onClose={() => onSelectNode(null)}
        />
      ))}
    </>
  );
};

const StormTrackNodePin: React.FC<{
  node: StormTrackNode;
  isSelected: boolean;
  onSelect: () => void;
  onClose: () => void;
}> = ({ node, isSelected, onSelect, onClose }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: node.lat, lng: node.lng }}
        title={`${node.label} · ${node.stage}`}
        onClick={onSelect}
        zIndex={node.isCurrent ? 60 : 40}
      >
        {node.isCurrent ? (
          <div className="relative flex items-center justify-center">
            <span className="w-7 h-7 rounded-full bg-emerald-400/25 animate-ping absolute" />
            <span className="w-5 h-5 rounded-full bg-emerald-400 border-2 border-white shadow-lg block" />
          </div>
        ) : (
          <span className="w-3.5 h-3.5 rounded-full bg-violet-500 border-2 border-white shadow-md block hover:scale-125 transition-transform" />
        )}
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={250}>
          <div className="text-slate-100 space-y-1 font-sans min-w-[190px]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">
              🌀 {node.isCurrent ? 'Active Storm Center' : 'Storm Track Point'}
            </div>
            <div className="text-xs font-bold text-white">{node.label}</div>
            <div className="text-[11px] text-slate-300">{node.stage}</div>
            <div className="text-[11px] text-slate-200">
              Wind: <strong className="text-white">{node.windKmh} km/h</strong> · Pressure:{' '}
              <strong className="text-white">{node.pressureHpa} hPa</strong>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {formatCoordsLabel(node.lat, node.lng)}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface PlaceSearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface MapInnerControlsProps {
  markers: MapMarkerItem[];
  stormTrackNodes: StormTrackNode[];
  selectedMarker: MapMarkerItem | null;
  onSelectMarker: (item: MapMarkerItem | null) => void;
  onOpenDetails: (item: MapMarkerItem) => void;
  onNavigateModule?: (id: ModuleId) => void;
  searchedPlace: PlaceSearchResult | null;
  onSearchedPlace: (place: PlaceSearchResult | null) => void;
  userLocation: google.maps.LatLngLiteral | null;
  onUserLocation: (loc: google.maps.LatLngLiteral) => void;
  onStatusNotice: (msg: string | null) => void;
  mapType: 'roadmap' | 'hybrid' | 'terrain';
  onMapTypeChange: (t: 'roadmap' | 'hybrid' | 'terrain') => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  layerFilter: 'all' | MapMarkerItem['kind'];
  onLayerFilterChange: (f: 'all' | MapMarkerItem['kind']) => void;
  showCyber: boolean;
  heightClass: string;
  variant: 'standard' | 'stream';
}

const MapWorkspaceInner: React.FC<MapInnerControlsProps> = ({
  markers,
  stormTrackNodes,
  selectedMarker,
  onSelectMarker,
  onOpenDetails,
  onNavigateModule,
  searchedPlace,
  onSearchedPlace,
  userLocation,
  onUserLocation,
  onStatusNotice,
  mapType,
  onMapTypeChange,
  expanded,
  onToggleExpanded,
  layerFilter,
  onLayerFilterChange,
  showCyber,
  heightClass,
  variant,
}) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const loadingStatus = useApiLoadingStatus();

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [zoomEarthUrl, setZoomEarthUrl] = useState(ZOOM_EARTH_PRESET_URL);

  // Zoom Earth-style Live Satellite & Radar Stream state
  const [drawerOpen, setDrawerOpen] = useState<boolean>(variant === 'stream');
  const [liveSectionOpen, setLiveSectionOpen] = useState(true);
  const [forecastSectionOpen, setForecastSectionOpen] = useState(true);
  const [streamLayer, setStreamLayer] = useState<StreamLayerMode>('radar-cloud');
  const [overlayOpacity, setOverlayOpacity] = useState<number>(75);
  const [showStormTrack, setShowStormTrack] = useState<boolean>(true);
  const [showIncidentPins, setShowIncidentPins] = useState<boolean>(true);
  const [showHazardZones, setShowHazardZones] = useState<boolean>(true);
  const [selectedStormNodeId, setSelectedStormNodeId] = useState<string | null>(null);

  // Live RainViewer timeline playback state
  const [radarHost, setRadarHost] = useState<string>('');
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [activeFrameIdx, setActiveFrameIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2>(1);

  // Live Open-Meteo regional stations for Forecast Map overlays
  const [weatherStations, setWeatherStations] = useState<WeatherGridStation[]>([]);

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const tileLayerRef = useRef<google.maps.ImageMapType | null>(null);
  const [searchedPinRef, searchedPinMarker] = useAdvancedMarkerRef();
  const [showSearchedInfo, setShowSearchedInfo] = useState(false);
  const [userPinRef, userPinMarker] = useAdvancedMarkerRef();
  const [showUserInfo, setShowUserInfo] = useState(false);

  // Fetch RainViewer multi-frame radar timestamps on mount
  useEffect(() => {
    let cancelled = false;
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            host?: string;
            radar?: { past?: RadarFrame[]; nowcast?: RadarFrame[] };
          } | null
        ) => {
          if (cancelled || !data?.host) return;
          const past = Array.isArray(data.radar?.past) ? data.radar!.past : [];
          const nowcast = Array.isArray(data.radar?.nowcast) ? data.radar!.nowcast : [];
          const allFrames = [...past, ...nowcast].filter((f) => f && f.path && f.time);
          if (allFrames.length > 0) {
            setRadarHost(data.host);
            setRadarFrames(allFrames);
            setActiveFrameIdx(allFrames.length - 1);
          }
        }
      )
      .catch(() => {
        // Optional live tile feed; map stays fully operational
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch regional live Open-Meteo weather grid when any meteorological forecast layer is selected
  useEffect(() => {
    const needsStations =
      streamLayer === 'wind' ||
      streamLayer === 'temperature' ||
      streamLayer === 'humidity' ||
      streamLayer === 'pressure' ||
      streamLayer === 'precipitation';

    if (!needsStations || weatherStations.length > 0) return;

    let cancelled = false;
    fetch('/api/weather/grid')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { stations?: WeatherGridStation[] } | null) => {
        if (!cancelled && Array.isArray(data?.stations)) {
          setWeatherStations(data.stations);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [streamLayer, weatherStations.length]);

  // Animate timeline frames while playing
  useEffect(() => {
    if (!isPlaying || radarFrames.length < 2) return;
    const intervalMs = playbackSpeed === 2 ? 450 : playbackSpeed === 0.5 ? 1300 : 800;
    const id = window.setInterval(() => {
      setActiveFrameIdx((prev) => (prev + 1) % radarFrames.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [isPlaying, playbackSpeed, radarFrames.length]);

  const activeFrame = radarFrames[activeFrameIdx] ?? null;

  // Mount & update live Google Maps ImageMapType tile overlay (RainViewer Radar / Doppler / Precipitation / NASA GIBS True-Color)
  useEffect(() => {
    if (!map) return;

    const removeTileLayer = () => {
      if (!tileLayerRef.current) return;
      const overlays = map.overlayMapTypes;
      for (let i = overlays.getLength() - 1; i >= 0; i--) {
        if (overlays.getAt(i) === tileLayerRef.current) {
          overlays.removeAt(i);
        }
      }
      tileLayerRef.current = null;
    };

    const usesRadarTiles =
      streamLayer === 'radar-cloud' ||
      streamLayer === 'doppler' ||
      streamLayer === 'precipitation';

    if (usesRadarTiles) {
      if (!radarHost || !activeFrame?.path) {
        removeTileLayer();
        return;
      }
      const colorScheme = streamLayer === 'doppler' ? 6 : streamLayer === 'precipitation' ? 4 : 2;
      const layer = new google.maps.ImageMapType({
        name:
          streamLayer === 'doppler'
            ? 'Doppler Radar'
            : streamLayer === 'precipitation'
            ? 'Precipitation Radar'
            : 'Live Radar Cloud Stream',
        tileSize: new google.maps.Size(256, 256),
        opacity: overlayOpacity / 100,
        getTileUrl: (coord, zoom) => {
          if (zoom < 1 || zoom > 12) return '';
          const maxTile = 1 << zoom;
          const x = ((coord.x % maxTile) + maxTile) % maxTile;
          if (coord.y < 0 || coord.y >= maxTile) return '';
          return `${radarHost}${activeFrame.path}/256/${zoom}/${x}/${coord.y}/${colorScheme}/1_1.png`;
        },
      });
      removeTileLayer();
      tileLayerRef.current = layer;
      map.overlayMapTypes.push(layer);
    } else if (streamLayer === 'hd-orbit') {
      const orbitDate = getYesterdayUtcDateString();
      const layer = new google.maps.ImageMapType({
        name: 'HD True-Color Orbit (NASA GIBS)',
        tileSize: new google.maps.Size(256, 256),
        opacity: overlayOpacity / 100,
        getTileUrl: (coord, zoom) => {
          if (zoom < 1 || zoom > 9) return '';
          const maxTile = 1 << zoom;
          const x = ((coord.x % maxTile) + maxTile) % maxTile;
          if (coord.y < 0 || coord.y >= maxTile) return '';
          return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${orbitDate}/GoogleMapsCompatible_Level9/${zoom}/${coord.y}/${x}.jpg`;
        },
      });
      removeTileLayer();
      tileLayerRef.current = layer;
      map.overlayMapTypes.push(layer);
    } else {
      // Wind / Temperature / Humidity / Pressure render live telemetry station badges cleanly over satellite
      removeTileLayer();
    }

    return () => {
      removeTileLayer();
    };
  }, [map, streamLayer, radarHost, activeFrame?.path]);

  // Adjust tile overlay opacity smoothly without reloading tiles
  useEffect(() => {
    if (tileLayerRef.current) {
      tileLayerRef.current.setOpacity(overlayOpacity / 100);
    }
  }, [overlayOpacity]);

  // Pan smoothly when a pin is chosen
  useEffect(() => {
    if (!map || !selectedMarker) return;
    map.panTo({ lat: selectedMarker.lat, lng: selectedMarker.lng });
    const currentZoom = map.getZoom() ?? DEFAULT_ZOOM;
    if (currentZoom < 7) {
      map.setZoom(8);
    }
    setZoomEarthUrl(buildZoomEarthUrl(selectedMarker.lat, selectedMarker.lng, 8));
  }, [map, selectedMarker]);

  // Resize map cleanly on fullscreen toggle
  useEffect(() => {
    if (!map) return;
    const t = window.setTimeout(() => {
      google.maps.event.trigger(map, 'resize');
    }, 120);
    return () => window.clearTimeout(t);
  }, [map, expanded]);

  // Modern Zero-Legacy Places Autocomplete via AutocompleteSuggestion.fetchAutocompleteSuggestions
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2 || !placesLib) {
      setSuggestions([]);
      setSearchingPlaces(false);
      return;
    }

    let cancelled = false;
    const debounce = window.setTimeout(async () => {
      try {
        setSearchingPlaces(true);
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: sessionTokenRef.current,
        });
        if (!cancelled) {
          setSuggestions(res.suggestions.slice(0, 5));
        }
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        if (!cancelled) {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) setSearchingPlaces(false);
      }
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(debounce);
    };
  }, [query, placesLib]);

  const matchingMarkers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return markers
      .filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.region.toLowerCase().includes(q) ||
          m.detail.toLowerCase().includes(q)
      )
      .slice(0, 4);
  }, [markers, query]);

  const focusCoords = useCallback(
    (lat: number, lng: number, zoom = 10) => {
      if (!map) return;
      map.panTo({ lat, lng });
      map.setZoom(zoom);
    },
    [map]
  );

  const handleZoomDelta = (delta: number) => {
    if (!map) return;
    const cur = map.getZoom() ?? DEFAULT_ZOOM;
    map.setZoom(Math.max(2, Math.min(18, cur + delta)));
  };

  const handleSelectMarker = useCallback(
    (item: MapMarkerItem) => {
      onSelectMarker(item);
      setSelectedStormNodeId(null);
      setShowSearchedInfo(false);
      setDropdownOpen(false);
      focusCoords(item.lat, item.lng, 9);
    },
    [focusCoords, onSelectMarker]
  );

  const handleSelectPlaceSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'viewport'],
        });
        sessionTokenRef.current = null;
        setSuggestions([]);
        setDropdownOpen(false);

        const loc = place.location;
        if (loc) {
          const lat = loc.lat();
          const lng = loc.lng();
          const label = place.displayName || suggestion.placePrediction.text.text;
          setQuery(label);
          onSelectMarker(null);
          onSearchedPlace({
            name: label,
            address: place.formattedAddress || formatCoordsLabel(lat, lng),
            lat,
            lng,
          });
          setShowSearchedInfo(true);
          if (map && place.viewport) {
            map.fitBounds(place.viewport);
          } else {
            focusCoords(lat, lng, 12);
          }
          onStatusNotice(`Centered on ${label}`);
        }
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        onStatusNotice('Could not load place details. Try selecting a pin from the list.');
      }
    },
    [focusCoords, map, onSearchedPlace, onSelectMarker, onStatusNotice]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (matchingMarkers.length > 0) {
      handleSelectMarker(matchingMarkers[0]);
      onStatusNotice(`Focused on pin: ${matchingMarkers[0].title}`);
      return;
    }
    if (suggestions.length > 0) {
      void handleSelectPlaceSuggestion(suggestions[0]);
      return;
    }
    onStatusNotice('No matching pin or place found. Try typing a city, street, or hospital.');
  };

  const handleFitAllPins = useCallback(() => {
    if (!map) return;
    if (markers.length === 0) {
      map.panTo(DEFAULT_CENTER);
      map.setZoom(DEFAULT_ZOOM);
      return;
    }
    if (markers.length === 1) {
      focusCoords(markers[0].lat, markers[0].lng, 9);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
    if (userLocation) bounds.extend(userLocation);
    map.fitBounds(bounds, 48);
    onStatusNotice(`Showing all ${markers.length} active pins`);
  }, [focusCoords, map, markers, onStatusNotice, userLocation]);

  const handleLocateMe = async () => {
    // If we already have a live GPS lock, pan immediately while refreshing coordinates in the background
    if (userLocation) {
      onSelectMarker(null);
      setSelectedStormNodeId(null);
      setShowSearchedInfo(false);
      focusCoords(userLocation.lat, userLocation.lng, 13);
      setShowUserInfo(true);
      setZoomEarthUrl(buildZoomEarthUrl(userLocation.lat, userLocation.lng, 12));
      onStatusNotice(`Centered on your live location (${formatCoordsLabel(userLocation.lat, userLocation.lng)})`);
    }

    setLocating(true);
    const outcome = await requestBestGeolocation();
    if (outcome.ok) {
      const loc = { lat: outcome.lat, lng: outcome.lng };
      onUserLocation(loc);
      onSelectMarker(null);
      setSelectedStormNodeId(null);
      setShowSearchedInfo(false);
      focusCoords(loc.lat, loc.lng, 13);
      setShowUserInfo(true);
      setZoomEarthUrl(buildZoomEarthUrl(loc.lat, loc.lng, 12));
      onStatusNotice(`Centered on your live location (${formatCoordsLabel(loc.lat, loc.lng)})`);
    } else if (!userLocation) {
      onStatusNotice(outcome.message);
    }
    setLocating(false);
  };

  const cycleSpeed = () => {
    setPlaybackSpeed((prev) => (prev === 1 ? 2 : prev === 2 ? 0.5 : 1));
  };

  const stepFrame = (delta: number) => {
    if (radarFrames.length === 0) return;
    setIsPlaying(false);
    setActiveFrameIdx((prev) => (prev + delta + radarFrames.length) % radarFrames.length);
  };

  const authFailed =
    loadingStatus === APILoadingStatus.AUTH_FAILURE ||
    loadingStatus === APILoadingStatus.FAILED;

  const filterButtons: Array<{ id: 'all' | MapMarkerItem['kind']; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'alert', label: 'Alerts' },
    { id: 'disaster', label: 'Disasters' },
    { id: 'incident', label: 'Emergencies' },
    { id: 'relief', label: 'Hospitals & Shelters' },
    ...(showCyber ? [{ id: 'cyber' as const, label: 'Cyber' }] : []),
  ];

  const showStationBadges =
    streamLayer === 'wind' ||
    streamLayer === 'temperature' ||
    streamLayer === 'humidity' ||
    streamLayer === 'pressure' ||
    streamLayer === 'precipitation';

  const formatStationBadge = (s: WeatherGridStation) => {
    if (streamLayer === 'wind') {
      return {
        primary: `${s.windKmh} km/h`,
        bg: 'bg-sky-950/90 border-sky-400/60 text-sky-200',
      };
    }
    if (streamLayer === 'temperature') {
      const tone =
        s.tempC >= 32
          ? 'bg-red-950/90 border-red-400/70 text-red-200'
          : s.tempC >= 24
          ? 'bg-amber-950/90 border-amber-400/70 text-amber-200'
          : 'bg-blue-950/90 border-blue-400/70 text-blue-200';
      return { primary: `${s.tempC}°C`, bg: tone };
    }
    if (streamLayer === 'humidity') {
      return {
        primary: `${s.humidityPct}% RH`,
        bg: 'bg-teal-950/90 border-teal-400/60 text-teal-200',
      };
    }
    if (streamLayer === 'pressure') {
      return {
        primary: `${s.pressureHpa} hPa`,
        bg: 'bg-violet-950/90 border-violet-400/60 text-violet-200',
      };
    }
    return {
      primary: `${s.precipMm} mm`,
      bg: 'bg-cyan-950/90 border-cyan-400/60 text-cyan-200',
    };
  };

  return (
    <>
      {/* Compact Top Bar: Search + Map Base Mode + Quick Actions */}
      <div className="px-3 py-2 border-b border-slate-800 bg-slate-900 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
              drawerOpen
                ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800'
            }`}
            title="Toggle Live Maps & Forecast Overlay Drawer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Layers</span>
          </button>
          <span className="text-xs font-semibold text-slate-100 truncate hidden sm:inline">
            {variant === 'stream' ? 'Live Satellite & Radar Stream' : 'Google Maps Live View'}
          </span>
          <span className="hidden md:inline text-[11px] font-mono text-slate-400">
            · {markers.length} pins
          </span>
        </div>

        {/* Places + Pin Search Input */}
        <div className="relative flex-1 min-w-[190px] max-w-sm">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onFocus={() => setDropdownOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setDropdownOpen(true);
              }}
              placeholder="Search city, region, hospital, or alert..."
              aria-label="Search places or map pins"
              className="w-full min-h-[32px] pl-8 pr-7 py-1 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSuggestions([]);
                  setDropdownOpen(false);
                }}
                aria-label="Clear search"
                className="absolute right-2 text-slate-400 hover:text-slate-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {dropdownOpen && (matchingMarkers.length > 0 || suggestions.length > 0 || searchingPlaces) && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden max-h-64 overflow-y-auto">
              {matchingMarkers.length > 0 && (
                <div className="border-b border-slate-800">
                  <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-blue-400 bg-slate-950">
                    Active NEXORA Pins
                  </div>
                  {matchingMarkers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectMarker(m)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-slate-100">{m.title}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{m.region}</span>
                    </button>
                  ))}
                </div>
              )}

              {searchingPlaces && (
                <div className="px-3 py-2 text-[11px] text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                  <span>Searching Google Places...</span>
                </div>
              )}

              {suggestions.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 bg-slate-950">
                    Google Places
                  </div>
                  {suggestions.map((s, idx) => (
                    <button
                      key={s.placePrediction?.placeId || idx}
                      type="button"
                      onClick={() => void handleSelectPlaceSuggestion(s)}
                      className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                    >
                      <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">{s.placePrediction?.text.text}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Map Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center p-0.5 rounded-lg border border-slate-700 bg-slate-950 text-[11px]">
            <button
              type="button"
              onClick={() => onMapTypeChange('hybrid')}
              className={`px-2 py-1 rounded-md font-medium inline-flex items-center gap-1 transition-colors ${
                mapType === 'hybrid'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <Satellite className="w-3 h-3" aria-hidden="true" />
              <span>Satellite</span>
            </button>
            <button
              type="button"
              onClick={() => onMapTypeChange('roadmap')}
              className={`px-2 py-1 rounded-md font-medium inline-flex items-center gap-1 transition-colors ${
                mapType === 'roadmap'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <MapIcon className="w-3 h-3" aria-hidden="true" />
              <span>Map</span>
            </button>
            <button
              type="button"
              onClick={() => onMapTypeChange('terrain')}
              className={`px-2 py-1 rounded-md font-medium inline-flex items-center gap-1 transition-colors ${
                mapType === 'terrain'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <Layers className="w-3 h-3" aria-hidden="true" />
              <span>Terrain</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowStormTrack((v) => !v)}
            title="Toggle cyclone / storm track overlay"
            className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
              showStormTrack
                ? 'border-violet-500/60 bg-violet-950/50 text-violet-200'
                : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Radio className="w-3 h-3" aria-hidden="true" />
            <span className="hidden lg:inline">Storm Track</span>
          </button>

          <button
            type="button"
            onClick={() => setShowIncidentPins((v) => !v)}
            title="Toggle incident & shelter pins"
            className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
              showIncidentPins
                ? 'border-blue-500/60 bg-blue-950/50 text-blue-200'
                : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <MapPin className="w-3 h-3" aria-hidden="true" />
            <span className="hidden xl:inline">Pins</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHazardZones((v) => !v)}
            title="Toggle affected danger radius & green safe area zones"
            className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
              showHazardZones
                ? 'border-emerald-500/60 bg-emerald-950/50 text-emerald-200'
                : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-3 h-3" aria-hidden="true" />
            <span className="hidden lg:inline">Safe Zones</span>
          </button>

          <button
            type="button"
            onClick={() => void handleLocateMe()}
            disabled={locating}
            title="Go to my live GPS location"
            className="min-h-[30px] px-2.5 py-1 rounded-lg border border-emerald-500/50 bg-emerald-950/60 hover:bg-emerald-900/70 text-[11px] font-medium text-emerald-200 inline-flex items-center gap-1.5 disabled:opacity-60 transition-colors"
          >
            <Crosshair className={`w-3.5 h-3.5 text-emerald-400 ${locating ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{locating ? 'Locating...' : 'Live Location'}</span>
          </button>

          <button
            type="button"
            onClick={handleFitAllPins}
            title="Fit all active pins in view"
            className="min-h-[30px] px-2 py-1 rounded-lg border border-slate-700 bg-slate-950 hover:bg-slate-800 text-[11px] font-medium text-slate-200 inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3 text-blue-400" />
          </button>

          <button
            type="button"
            onClick={onToggleExpanded}
            title={expanded ? 'Exit full screen' : 'Full screen map'}
            className="min-h-[30px] px-2 py-1 rounded-lg border border-slate-700 bg-slate-950 hover:bg-slate-800 text-[11px] font-medium text-slate-200 inline-flex items-center gap-1"
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Category Filter Strip */}
      {showIncidentPins && (
        <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1">
            {filterButtons.map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => onLayerFilterChange(btn.id)}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                  layerFilter === btn.id
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-300">
            <span>🔥 Fire</span>
            <span>💥 Quake</span>
            <span>🌊 Flood</span>
            <span>🌀 Cyclone</span>
            <span>🏥 Safe Hub</span>
            <span className="inline-flex items-center gap-1 text-red-300">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/40 border border-red-400" /> Affected Radius
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/30 border border-emerald-400" /> Safe Zone
            </span>
          </div>
        </div>
      )}

      {/* Map Viewport with Zoom Earth-Style Floating Controls */}
      <div
        className={`relative w-full bg-slate-950 overflow-hidden ${
          expanded ? 'flex-1 min-h-[460px]' : heightClass
        }`}
        onClick={() => setDropdownOpen(false)}
      >
        {authFailed ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
            <div className="text-sm font-semibold text-slate-100">
              Google Maps could not authenticate
            </div>
            <p className="text-xs text-slate-400 max-w-md">
              Check your Google Maps API key quota or HTTP referrer restrictions, then refresh the page.
            </p>
          </div>
        ) : (
          <GoogleMap
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={GMP_ATTRIBUTION_IDS}
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={DEFAULT_ZOOM}
            mapTypeId={mapType}
            colorScheme="DARK"
            gestureHandling="greedy"
            streetViewControl={false}
            mapTypeControl={false}
            fullscreenControl={false}
            zoomControl={false}
            style={{ width: '100%', height: '100%' }}
            onCameraChanged={(ev) => {
              const c = ev.detail.center;
              if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
                setZoomEarthUrl(buildZoomEarthUrl(c.lat, c.lng, ev.detail.zoom || DEFAULT_ZOOM));
              }
            }}
            onClick={() => {
              onSelectMarker(null);
              setSelectedStormNodeId(null);
              setShowSearchedInfo(false);
              setShowUserInfo(false);
              setDropdownOpen(false);
            }}
          >
            {/* Storm / Cyclone Track Polyline & Nodes */}
            {showStormTrack && (
              <StormTrackOverlay
                nodes={stormTrackNodes}
                selectedNodeId={selectedStormNodeId}
                onSelectNode={(id) => {
                  setSelectedStormNodeId(id);
                  if (id) onSelectMarker(null);
                }}
              />
            )}

            {/* Affected Danger Radius & Green Safe Area Rings */}
            {showIncidentPins && showHazardZones && (
              <HazardZonesOverlay markers={markers} selectedId={selectedMarker?.id ?? null} />
            )}

            {/* Live Incident, Disaster & Relief Emoji Symbol Markers */}
            {showIncidentPins && (() => {
              const reliefHubs = markers.filter((m) => m.kind === 'relief');
              return markers.map((item) => {
                let nearestSafeHub: { title: string; distanceKm: number } | null = null;
                if (item.kind !== 'relief' && reliefHubs.length > 0) {
                  let best = reliefHubs[0];
                  let bestDist = haversineKm(item.lat, item.lng, best.lat, best.lng);
                  for (const hub of reliefHubs.slice(1)) {
                    const d = haversineKm(item.lat, item.lng, hub.lat, hub.lng);
                    if (d < bestDist) {
                      best = hub;
                      bestDist = d;
                    }
                  }
                  nearestSafeHub = { title: best.title, distanceKm: Math.round(bestDist) };
                }
                return (
                  <MarkerWithInfo
                    key={item.id}
                    item={item}
                    isSelected={selectedMarker?.id === item.id}
                    nearestSafeHub={nearestSafeHub}
                    onSelect={handleSelectMarker}
                    onClose={() => onSelectMarker(null)}
                    onOpenDetails={onOpenDetails}
                    onNavigateModule={onNavigateModule}
                  />
                );
              });
            })()}

            {/* Live Meteorological Forecast Station Badges (Wind, Temp, Humidity, Pressure, Precip) */}
            {showStationBadges &&
              weatherStations.map((st) => {
                const badge = formatStationBadge(st);
                return (
                  <AdvancedMarker
                    key={`wx-${st.id}`}
                    position={{ lat: st.lat, lng: st.lng }}
                    title={`${st.name}: ${st.tempC}°C · Wind ${st.windKmh} km/h · RH ${st.humidityPct}% · ${st.pressureHpa} hPa`}
                    zIndex={35}
                  >
                    <div
                      className={`px-2 py-0.5 rounded-md border text-[10px] font-mono font-semibold shadow-md flex items-center gap-1 whitespace-nowrap ${badge.bg}`}
                    >
                      {streamLayer === 'wind' && (
                        <span
                          className="inline-block text-sky-300"
                          style={{ transform: `rotate(${st.windDeg}deg)` }}
                          aria-hidden="true"
                        >
                          ↑
                        </span>
                      )}
                      <span>{st.name}</span>
                      <span className="opacity-95">{badge.primary}</span>
                    </div>
                  </AdvancedMarker>
                );
              })}

            {searchedPlace && (
              <>
                <AdvancedMarker
                  ref={searchedPinRef}
                  position={{ lat: searchedPlace.lat, lng: searchedPlace.lng }}
                  title={searchedPlace.name}
                  onClick={() => setShowSearchedInfo(true)}
                >
                  <Pin background="#06b6d4" borderColor="#155e75" glyphColor="#ecfeff" scale={1.15} />
                </AdvancedMarker>
                {showSearchedInfo && searchedPinMarker && (
                  <InfoWindow
                    anchor={searchedPinMarker}
                    onCloseClick={() => setShowSearchedInfo(false)}
                    maxWidth={250}
                  >
                    <div className="text-slate-100 space-y-1 font-sans min-w-[180px]">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-400">
                        Searched Location
                      </div>
                      <div className="text-xs font-bold text-white">{searchedPlace.name}</div>
                      <div className="text-[11px] text-slate-300">{searchedPlace.address}</div>
                    </div>
                  </InfoWindow>
                )}
              </>
            )}

            {userLocation && (
              <>
                <AdvancedMarker
                  ref={userPinRef}
                  position={userLocation}
                  title={`Your Live Location (${formatCoordsLabel(userLocation.lat, userLocation.lng)})`}
                  zIndex={95}
                  onClick={() => {
                    onSelectMarker(null);
                    setSelectedStormNodeId(null);
                    setShowSearchedInfo(false);
                    setShowUserInfo(true);
                  }}
                >
                  <div className="relative flex flex-col items-center cursor-pointer">
                    <span className="mb-1 px-2 py-0.5 rounded-full bg-slate-950/90 border border-blue-400/70 text-[10px] font-semibold text-blue-200 shadow-lg whitespace-nowrap">
                      You (Live)
                    </span>
                    <div className="relative flex items-center justify-center">
                      <span className="w-8 h-8 rounded-full bg-blue-500/35 animate-ping absolute" />
                      <span className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg block" />
                    </div>
                  </div>
                </AdvancedMarker>

                {showUserInfo && userPinMarker && (
                  <InfoWindow
                    anchor={userPinMarker}
                    onCloseClick={() => setShowUserInfo(false)}
                    maxWidth={240}
                  >
                    <div className="text-slate-100 space-y-1 font-sans min-w-[185px]">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                        <span>Live GPS Position</span>
                      </div>
                      <div className="text-xs font-bold text-white">Your Current Location</div>
                      <div className="text-[11px] font-mono text-slate-300 whitespace-nowrap">
                        {formatCoordsLabel(userLocation.lat, userLocation.lng)}
                      </div>
                      <a
                        href={buildZoomEarthUrl(userLocation.lat, userLocation.lng, 11)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400 hover:underline pt-0.5"
                      >
                        <span>View on Zoom Earth</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    </div>
                  </InfoWindow>
                )}
              </>
            )}
          </GoogleMap>
        )}

        {/* TOP-RIGHT FLOATING LIVE LOCATION BUTTON (Always visible inside Map Viewport) */}
        <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2 pointer-events-none">
          <button
            type="button"
            onClick={() => void handleLocateMe()}
            disabled={locating}
            aria-label="Go to my live location on map"
            className="pointer-events-auto px-3.5 py-2 rounded-xl border border-blue-400/60 bg-slate-900/95 hover:bg-blue-600 text-white shadow-xl flex items-center gap-2 text-xs font-semibold transition-colors disabled:opacity-60"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  userLocation ? 'bg-emerald-400 animate-ping' : 'bg-blue-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  userLocation ? 'bg-emerald-400' : 'bg-blue-400'
                }`}
              />
            </span>
            <Navigation className={`w-3.5 h-3.5 shrink-0 ${locating ? 'animate-pulse' : ''}`} aria-hidden="true" />
            <span>{locating ? 'Locating GPS...' : 'Go to Live Location'}</span>
          </button>

          {userLocation && (
            <div className="pointer-events-auto px-2.5 py-1 rounded-lg border border-slate-700/90 bg-slate-900/90 text-[10px] font-mono text-slate-200 shadow-lg">
              GPS: {formatCoordsLabel(userLocation.lat, userLocation.lng)}
            </div>
          )}
        </div>

        {/* TOP-LEFT FLOATING CONTROLS: Custom +/- Zoom Stack + ZOOM EARTH Live Satellite Header */}
        <div className="absolute top-3 left-3 z-20 flex items-start gap-2 pointer-events-none">
          <div className="pointer-events-auto flex flex-col rounded-lg overflow-hidden border border-slate-700 bg-white text-slate-900 shadow-lg">
            <button
              type="button"
              onClick={() => handleZoomDelta(1)}
              aria-label="Zoom in"
              className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 border-b border-slate-200 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleZoomDelta(-1)}
              aria-label="Zoom out"
              className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>

          <a
            href={zoomEarthUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open synced view directly on Zoom Earth"
            className="pointer-events-auto px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900/95 hover:bg-slate-800 shadow-xl flex items-center gap-2.5 transition-colors"
          >
            <span className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 shrink-0">
              <Globe className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <div className="text-xs font-bold tracking-wide text-white flex items-center gap-1">
                <span>ZOOM</span>
                <span className="text-sky-400">EARTH</span>
                <ExternalLink className="w-2.5 h-2.5 text-slate-400 ml-0.5" aria-hidden="true" />
              </div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
                LIVE SATELLITE STREAM · NEXORA EOC
              </div>
            </div>
          </a>
        </div>

        {/* LEFT FLOATING LAYER CONTROL DRAWER (LIVE MAPS + FORECAST MAPS + OPACITY SLIDER) */}
        {drawerOpen ? (
          <div className="absolute top-[74px] left-3 z-20 w-[244px] max-h-[calc(100%-148px)] overflow-y-auto rounded-xl border border-slate-700/90 bg-slate-900/95 backdrop-blur-md shadow-2xl p-3 space-y-3 text-xs">
            {/* POPUP HEADER WITH CLOSE BUTTON */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-sky-300">
                <Layers className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                <span>Map Controls</span>
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close Live Maps popup"
                title="Close popup"
                className="w-6 h-6 rounded-md border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            {/* LIVE MAPS SECTION */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setLiveSectionOpen((v) => !v)}
                className="w-full flex items-center justify-between text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-300 hover:text-white"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Satellite className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                  <span>LIVE MAPS</span>
                </span>
                {liveSectionOpen ? (
                  <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>

              {liveSectionOpen && (
                <div className="space-y-1">
                  {/* Satellite Parent Pill */}
                  <button
                    type="button"
                    onClick={() => {
                      onMapTypeChange('hybrid');
                      if (streamLayer !== 'radar-cloud' && streamLayer !== 'hd-orbit') {
                        setStreamLayer('radar-cloud');
                      }
                    }}
                    className={`w-full px-2.5 py-2 rounded-lg border flex items-center justify-between transition-colors ${
                      streamLayer === 'radar-cloud' || streamLayer === 'hd-orbit'
                        ? 'border-sky-500/60 bg-sky-500/15 text-white'
                        : 'border-transparent text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 font-medium">
                      <Satellite className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                      <span>Satellite</span>
                    </span>
                    {(streamLayer === 'radar-cloud' || streamLayer === 'hd-orbit') && (
                      <Check className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                    )}
                  </button>

                  {/* Satellite Sub-streams */}
                  <div className="pl-3 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        onMapTypeChange('hybrid');
                        setStreamLayer('radar-cloud');
                      }}
                      className={`w-full px-2 py-1.5 rounded-md text-left flex items-center justify-between gap-1 transition-colors ${
                        streamLayer === 'radar-cloud'
                          ? 'text-sky-300 bg-slate-800/80 font-medium'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      <span className="truncate">• Live Radar Cloud</span>
                      {streamLayer === 'radar-cloud' && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-[9px] font-mono text-sky-300 shrink-0">
                          ACTIVE
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onMapTypeChange('hybrid');
                        setStreamLayer('hd-orbit');
                      }}
                      className={`w-full px-2 py-1.5 rounded-md text-left flex items-center justify-between gap-1 transition-colors ${
                        streamLayer === 'hd-orbit'
                          ? 'text-sky-300 bg-slate-800/80 font-medium'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      <span className="truncate">• HD True-Color Orbit</span>
                      {streamLayer === 'hd-orbit' && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-[9px] font-mono text-sky-300 shrink-0">
                          NASA
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Doppler Radar */}
                  <button
                    type="button"
                    onClick={() => setStreamLayer('doppler')}
                    className={`w-full px-2.5 py-1.5 rounded-lg border flex items-center justify-between transition-colors ${
                      streamLayer === 'doppler'
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200 font-medium'
                        : 'border-transparent text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Radio className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                      <span>Doppler Radar</span>
                    </span>
                    {streamLayer === 'doppler' && (
                      <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-slate-800" />

            {/* FORECAST MAPS SECTION */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setForecastSectionOpen((v) => !v)}
                className="w-full flex items-center justify-between text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-300 hover:text-white"
              >
                <span className="inline-flex items-center gap-1.5">
                  <CloudRain className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                  <span>FORECAST MAPS</span>
                </span>
                {forecastSectionOpen ? (
                  <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>

              {forecastSectionOpen && (
                <div className="space-y-0.5">
                  {[
                    {
                      id: 'precipitation' as const,
                      label: 'Precipitation',
                      icon: CloudRain,
                      color: 'text-sky-400',
                    },
                    {
                      id: 'wind' as const,
                      label: 'Wind Velocity',
                      icon: Wind,
                      color: 'text-cyan-400',
                    },
                    {
                      id: 'temperature' as const,
                      label: 'Temperature',
                      icon: Thermometer,
                      color: 'text-amber-400',
                    },
                    {
                      id: 'humidity' as const,
                      label: 'Humidity',
                      icon: Droplets,
                      color: 'text-teal-400',
                    },
                    {
                      id: 'pressure' as const,
                      label: 'Atmospheric Pressure',
                      icon: Gauge,
                      color: 'text-violet-400',
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    const active = streamLayer === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setStreamLayer(item.id)}
                        className={`w-full px-2.5 py-1.5 rounded-lg border flex items-center justify-between transition-colors ${
                          active
                            ? 'border-blue-500/60 bg-blue-600/15 text-white font-medium'
                            : 'border-transparent text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2 truncate">
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${item.color}`} aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {active && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 pt-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Stream Overlay Opacity</span>
                <span className="font-mono font-semibold text-sky-400">{overlayOpacity}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                aria-label="Stream overlay opacity"
                className="w-full h-1.5 rounded-lg bg-slate-700 accent-sky-400 cursor-pointer"
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open Live Maps popup"
            title="Open Map Controls"
            className="absolute top-[74px] left-3 z-20 px-3 py-2 rounded-xl border border-slate-700/90 bg-slate-900/95 hover:bg-slate-800 backdrop-blur-md shadow-xl text-xs font-medium text-slate-100 inline-flex items-center gap-2 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
            <span>Map Layers</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          </button>
        )}

        {/* BOTTOM FLOATING TIMELINE PLAYBACK SCRUBBER (Matches Screenshot) */}
        <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-4 z-20 flex justify-center sm:justify-end pointer-events-none">
          <div className="pointer-events-auto w-full sm:w-auto sm:min-w-[420px] max-w-[520px] px-3 py-2 rounded-xl border border-slate-700/90 bg-slate-900/95 shadow-2xl flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsPlaying((v) => !v)}
              disabled={radarFrames.length < 2}
              aria-label={isPlaying ? 'Pause radar animation' : 'Play radar animation'}
              className="w-9 h-9 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 flex items-center justify-center shrink-0 transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => stepFrame(-1)}
              disabled={radarFrames.length < 2}
              aria-label="Previous radar frame"
              className="p-1 text-slate-400 hover:text-white disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-950 text-[11px] font-mono text-slate-100 inline-flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span>
                {activeFrame ? formatRadarTimestamp(activeFrame.time) : 'Live Stream'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => stepFrame(1)}
              disabled={radarFrames.length < 2}
              aria-label="Next radar frame"
              className="p-1 text-slate-400 hover:text-white disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <input
              type="range"
              min={0}
              max={Math.max(0, radarFrames.length - 1)}
              value={activeFrameIdx}
              onChange={(e) => {
                setIsPlaying(false);
                setActiveFrameIdx(Number(e.target.value));
              }}
              aria-label="Radar timeline scrubber"
              className="flex-1 min-w-[80px] h-1.5 rounded-lg bg-slate-700 accent-sky-400 cursor-pointer"
            />

            <button
              type="button"
              onClick={cycleSpeed}
              title="Change playback speed"
              className="px-2 py-1 rounded-md border border-slate-700 bg-slate-950 hover:bg-slate-800 text-[11px] font-mono text-slate-200 shrink-0"
            >
              {playbackSpeed}x
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export const GoogleMapsPanel: React.FC<GoogleMapsPanelProps> = ({
  forecasts,
  incidents,
  alerts = [],
  threats = [],
  resources = [],
  showCyber = false,
  heightClass = 'h-80 sm:h-96 lg:h-[440px]',
  variant = 'standard',
  initialUserLocation = null,
  onSelectModule,
}) => {
  const [apiKey, setApiKey] = useState<string>(() => getBuildTimeMapsKey());
  const [keyChecked, setKeyChecked] = useState<boolean>(() => Boolean(getBuildTimeMapsKey()));

  const [layerFilter, setLayerFilter] = useState<'all' | MapMarkerItem['kind']>('all');
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid' | 'terrain'>('hybrid');
  const [expanded, setExpanded] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(variant === 'stream');
  const [selectedMarker, setSelectedMarker] = useState<MapMarkerItem | null>(null);
  const [detailMarker, setDetailMarker] = useState<MapMarkerItem | null>(null);
  const [searchedPlace, setSearchedPlace] = useState<PlaceSearchResult | null>(null);
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(
    initialUserLocation
  );
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initialUserLocation) {
      setUserLocation({ lat: initialUserLocation.lat, lng: initialUserLocation.lng });
    } else if (initialUserLocation === null) {
      setUserLocation(null);
    }
  }, [initialUserLocation]);

  useEffect(() => {
    if (apiKey) return;
    let active = true;
    void fetchServerMapsKey().then((serverKey) => {
      if (!active) return;
      if (serverKey) setApiKey(serverKey);
      setKeyChecked(true);
    });
    return () => {
      active = false;
    };
  }, [apiKey]);

  const stormTrackNodes = useMemo(() => buildStormTrack(forecasts), [forecasts]);

  const pendingCitizenCount = useMemo(
    () =>
      incidents.filter(
        (inc) => inc.verifiedByAdmin !== true && !inc.assignedUnit.startsWith('Rejected')
      ).length,
    [incidents]
  );

  const markers = useMemo<MapMarkerItem[]>(() => {
    const items: MapMarkerItem[] = [];

    forecasts.slice(0, 26).forEach((f, idx) => {
      const hasExact = typeof f.lat === 'number' && typeof f.lng === 'number';
      const coords = hasExact ? { lat: f.lat!, lng: f.lng! } : resolveLatLng(f.region);
      const sym = resolveIssueSymbol(`${f.title} ${f.metric}`, 'disaster', f.severity, f.category);
      const affectedRadiusKm = f.affectedRadiusKm ?? sym.defaultRadiusKm;
      const safeZoneRadiusKm = f.safeZoneRadiusKm ?? Math.round(affectedRadiusKm * 1.85);

      items.push({
        id: f.id,
        kind: 'disaster',
        title: f.title,
        region: f.region,
        severity: f.severity,
        impactLabel: `${f.populationAtRisk} · ${plainSeverity(f.severity)}`,
        detail: `${plainDisasterCategory(f.category)} · ${f.metric}${f.sourceName ? ` · ${f.sourceName}` : ''}`,
        lat: hasExact ? coords.lat : coords.lat + (idx % 2 === 0 ? 0.08 : -0.08),
        lng: hasExact ? coords.lng : coords.lng + (idx % 2 === 0 ? -0.08 : 0.08),
        targetModule: 'disaster',
        sourceName: f.sourceName,
        sourceUrl: f.sourceUrl,
        emoji: sym.emoji,
        categoryLabel: sym.categoryLabel,
        ringHex: sym.ringHex,
        affectedRadiusKm,
        safeZoneRadiusKm,
      });
    });

    // STRICT WORKFLOW: Only show Admin-Approved Citizen/Field Incidents on the live map!
    incidents
      .filter((inc) => inc.verifiedByAdmin === true && !inc.assignedUnit.startsWith('Rejected'))
      .slice(0, 18)
      .forEach((inc, idx) => {
        const hasCoords = Boolean(inc.locationCoords);
        const coords = resolveLatLng(inc.region, inc.locationCoords);
        const pop = inc.exposedPopulation
          ? `${inc.exposedPopulation.toLocaleString()} people affected`
          : `Assigned: ${inc.assignedUnit}`;
        const sym = resolveIssueSymbol(
          `${inc.title} ${inc.notes} ${inc.assignedUnit}`,
          'incident',
          inc.severity,
          inc.domain
        );
        const affectedRadiusKm = sym.defaultRadiusKm;
        const safeZoneRadiusKm = Math.round(affectedRadiusKm * 1.9);

        items.push({
          id: inc.id,
          kind: 'incident',
          title: inc.title,
          region: inc.region,
          severity: inc.severity,
          impactLabel: `${pop} · ${plainIncidentStatus(inc.status)}`,
          detail: `Admin Verified · ${inc.assignedUnit} · ${inc.damageAssessment || inc.notes}`,
          lat: hasCoords ? coords.lat : coords.lat - 0.14 + idx * 0.04,
          lng: hasCoords ? coords.lng : coords.lng + 0.14 - idx * 0.03,
          targetModule: 'response',
          emoji: sym.emoji,
          categoryLabel: sym.categoryLabel,
          ringHex: sym.ringHex,
          affectedRadiusKm,
          safeZoneRadiusKm,
          isApprovedCitizenReport: true,
        });
      });

    alerts
      .filter((a) => a.status === 'Published')
      .slice(0, 6)
      .forEach((al, idx) => {
        const coords = resolveLatLng(al.region);
        const sym = resolveIssueSymbol(`${al.title} ${al.message}`, 'alert', al.severity, al.category);
        const affectedRadiusKm = sym.defaultRadiusKm;
        items.push({
          id: al.id,
          kind: 'alert',
          title: al.title,
          region: al.region,
          severity: al.severity,
          impactLabel: `${plainSeverity(al.severity)} · ${al.region}`,
          detail: al.message,
          lat: coords.lat + 0.18 - idx * 0.05,
          lng: coords.lng - 0.16 + idx * 0.04,
          targetModule: 'alerts',
          emoji: sym.emoji,
          categoryLabel: sym.categoryLabel,
          ringHex: sym.ringHex,
          affectedRadiusKm,
          safeZoneRadiusKm: Math.round(affectedRadiusKm * 1.85),
        });
      });

    if (showCyber) {
      threats
        .filter((t) => t.status !== 'Contained')
        .slice(0, 5)
        .forEach((t, idx) => {
          const coords = resolveLatLng(t.platform);
          const sym = resolveIssueSymbol(`${t.title} ${t.vector}`, 'cyber', t.severity, t.vector);
          items.push({
            id: t.id,
            kind: 'cyber',
            title: t.title,
            region: t.platform,
            severity: t.severity,
            impactLabel: `${t.affectedHosts} devices affected · ${plainSeverity(t.severity)}`,
            detail: t.summary,
            lat: coords.lat + idx * 0.06,
            lng: coords.lng - idx * 0.05,
            targetModule: 'cyber',
            emoji: sym.emoji,
            categoryLabel: sym.categoryLabel,
            ringHex: sym.ringHex,
            affectedRadiusKm: sym.defaultRadiusKm,
            safeZoneRadiusKm: Math.round(sym.defaultRadiusKm * 1.8),
          });
        });
    }

    resources.slice(0, 8).forEach((r, idx) => {
      const coords = resolveLatLng(r.region);
      const sym = resolveIssueSymbol(`${r.name} ${r.kind}`, 'relief', 'Low', r.kind);
      items.push({
        id: r.id,
        kind: 'relief',
        title: r.name,
        region: r.region,
        severity: r.status === 'Full' ? 'High' : r.status === 'Limited' ? 'Moderate' : 'Low',
        impactLabel: `${r.quantity.toLocaleString()} ${r.unit} · ${plainReliefStatus(r.status)}`,
        detail: `Safe Relief Hub · Contact: ${r.contact} · Allocation: ${r.allocatedTo}`,
        lat: coords.lat - 0.1 + idx * 0.05,
        lng: coords.lng + 0.12 - idx * 0.04,
        targetModule: 'relief',
        emoji: sym.emoji,
        categoryLabel: sym.categoryLabel,
        ringHex: sym.ringHex,
        affectedRadiusKm: 0,
        safeZoneRadiusKm: 0,
      });
    });

    return items;
  }, [forecasts, incidents, alerts, threats, resources, showCyber]);

  const filteredMarkers = useMemo(
    () => (layerFilter === 'all' ? markers : markers.filter((m) => m.kind === layerFilter)),
    [markers, layerFilter]
  );

  const handleNavigateModule = useCallback(
    (id: ModuleId) => {
      setExpanded(false);
      onSelectModule?.(id);
    },
    [onSelectModule]
  );

  const nearbyMarkers = useMemo(() => {
    if (!detailMarker) return [];
    return markers
      .filter((m) => m.id !== detailMarker.id)
      .sort(
        (a, b) =>
          Math.hypot(a.lat - detailMarker.lat, a.lng - detailMarker.lng) -
          Math.hypot(b.lat - detailMarker.lat, b.lng - detailMarker.lng)
      )
      .slice(0, 3);
  }, [detailMarker, markers]);

  return (
    <div
      className={
        expanded
          ? 'fixed inset-2 sm:inset-4 z-50 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden'
          : 'rounded-xl border border-slate-800 bg-slate-900 overflow-hidden flex flex-col'
      }
    >
      {!keyChecked ? (
        <div className={`w-full flex items-center justify-center gap-2 text-xs text-slate-400 ${heightClass}`}>
          <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
          <span>Initializing Google Maps Satellite Stream...</span>
        </div>
      ) : !apiKey ? (
        <div className={`w-full flex flex-col items-center justify-center p-6 text-center space-y-2 ${heightClass}`}>
          <AlertTriangle className="w-6 h-6 text-amber-400" />
          <div className="text-sm font-semibold text-slate-100">Google Maps API Key Required</div>
          <p className="text-xs text-slate-400 max-w-md">
            Configure <code className="font-mono text-sky-300">VITE_GOOGLE_MAPS_API_KEY</code> in your environment to render interactive Google Maps.
          </p>
        </div>
      ) : (
        <APIProvider
          apiKey={apiKey}
          language="en"
          region="US"
          libraries={['places', 'marker']}
        >
          <MapWorkspaceInner
            markers={filteredMarkers}
            stormTrackNodes={stormTrackNodes}
            selectedMarker={selectedMarker}
            onSelectMarker={setSelectedMarker}
            onOpenDetails={(item) => setDetailMarker(item)}
            onNavigateModule={onSelectModule ? handleNavigateModule : undefined}
            searchedPlace={searchedPlace}
            onSearchedPlace={setSearchedPlace}
            userLocation={userLocation}
            onUserLocation={setUserLocation}
            onStatusNotice={setStatusNotice}
            mapType={mapType}
            onMapTypeChange={setMapType}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((v) => !v)}
            layerFilter={layerFilter}
            onLayerFilterChange={setLayerFilter}
            showCyber={showCyber}
            heightClass={heightClass}
            variant={variant}
          />
        </APIProvider>
      )}

      {/* Full Details Inline Inspector */}
      {detailMarker && (
        <div className="p-3.5 border-t border-slate-800 bg-slate-900 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`px-2 py-0.5 rounded border font-medium ${
                    pinPalette(detailMarker.severity, detailMarker.kind).badgeClass
                  }`}
                >
                  {plainMarkerKind(detailMarker.kind)} · {plainSeverity(detailMarker.severity)}
                </span>
                <span className="font-mono text-slate-400">
                  {formatCoordsLabel(detailMarker.lat, detailMarker.lng)}
                </span>
              </div>
              <h4 className="mt-1 text-sm font-semibold text-slate-100">{detailMarker.title}</h4>
              <div className="text-xs text-blue-400">{detailMarker.region}</div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onSelectModule && (
                <button
                  type="button"
                  onClick={() => handleNavigateModule(detailMarker.targetModule)}
                  className="min-h-[32px] px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1"
                >
                  <span>Go to {plainTargetModuleLabel(detailMarker.targetModule)}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setDetailMarker(null)}
                aria-label="Close details"
                className="min-h-[32px] px-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-950 space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Status, Affected Radius &amp; Safe Area
              </div>
              <div className="text-slate-100 font-medium">
                {detailMarker.emoji} {detailMarker.categoryLabel} · {detailMarker.impactLabel}
              </div>
              {detailMarker.kind !== 'relief' && detailMarker.affectedRadiusKm > 0 ? (
                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-red-500/15 border border-red-500/40 text-red-300 font-medium">
                    ⚠️ Affected: {detailMarker.affectedRadiusKm} km radius
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-medium">
                    ✅ Safe Area: Beyond {detailMarker.affectedRadiusKm} km
                  </span>
                </div>
              ) : (
                <div className="text-[11px] text-emerald-400 font-medium">
                  ✅ Verified Safe Shelter / Hospital Zone
                </div>
              )}
              <p className="text-slate-400 leading-relaxed">{detailMarker.detail}</p>
              {detailMarker.sourceName && detailMarker.sourceUrl && (
                <a
                  href={detailMarker.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 underline pt-1"
                >
                  <span>Verify at {detailMarker.sourceName}</span>
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              )}
            </div>

            <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-950 space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Nearby Monitored Pins
              </div>
              {nearbyMarkers.length === 0 ? (
                <div className="text-slate-400">No nearby monitored pins.</div>
              ) : (
                <div className="space-y-1">
                  {nearbyMarkers.map((nm) => (
                    <button
                      key={nm.id}
                      type="button"
                      onClick={() => {
                        setSelectedMarker(nm);
                        setDetailMarker(nm);
                      }}
                      className="w-full text-left flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-slate-800 text-[11px]"
                    >
                      <span className="truncate text-slate-200">
                        {nm.emoji} {nm.title}
                      </span>
                      <span className="text-slate-400 shrink-0">{nm.categoryLabel}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Compact Bottom Pin Selector Strip */}
      <div className="border-t border-slate-800 bg-slate-950">
        <div className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white font-medium"
          >
            {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>Quick Pin Selector ({filteredMarkers.length})</span>
          </button>

          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
            {pendingCitizenCount > 0 && (
              <span className="text-amber-400 font-medium">
                {pendingCitizenCount} Citizen SOS pending Admin approval
              </span>
            )}
            {statusNotice && <span className="text-blue-400">{statusNotice}</span>}
            <span>GDACS + Live Satellite &amp; Safe Zones · Google Maps</span>
          </div>
        </div>

        {!dockCollapsed && filteredMarkers.length > 0 && (
          <div className="px-3 pb-2.5 flex items-center gap-1.5 overflow-x-auto">
            {filteredMarkers.slice(0, 12).map((m) => {
              const active = selectedMarker?.id === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedMarker(m);
                    setDetailMarker(m);
                  }}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg border text-left transition-colors max-w-[220px] ${
                    active
                      ? 'border-blue-500 bg-blue-600/15 text-slate-100'
                      : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-medium truncate">
                    <span className="text-xs leading-none shrink-0" aria-hidden="true">
                      {m.emoji}
                    </span>
                    <span className="truncate">{m.title}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {m.region}
                    {m.affectedRadiusKm > 0 ? ` · ${m.affectedRadiusKm} km zone` : ' · Safe Hub'}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

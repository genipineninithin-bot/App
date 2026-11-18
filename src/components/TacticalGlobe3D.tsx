import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Compass,
  Globe,
  Info,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  RotateCcw,
  Satellite,
  Search,
  ZoomIn,
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

export interface GlobeMarkerItem {
  id: string;
  kind: 'disaster' | 'incident' | 'alert' | 'cyber' | 'relief';
  title: string;
  region: string;
  severity: Severity;
  impactLabel: string;
  detail: string;
  lat: number;
  lon: number;
  targetModule: ModuleId;
}

interface CityHubMeta {
  key: string;
  name: string;
  lat: number;
  lon: number;
  elevationLabel: string;
  terrainNote: string;
  buildingCount: number;
  skylineTint: number;
}

interface TacticalGlobe3DProps {
  forecasts: DisasterForecast[];
  incidents: IncidentTicket[];
  alerts?: AlertNotification[];
  threats?: CyberThreat[];
  resources?: ReliefResource[];
  showCyber?: boolean;
  heightClass?: string;
  onSelectModule?: (id: ModuleId) => void;
}

// High-detail continental polygons [lon, lat] for crisp zero-404 procedural satellite & dark textures
const CONTINENT_POLYGONS: [number, number][][] = [
  // North America
  [
    [-168, 65], [-160, 71], [-135, 70], [-110, 72], [-82, 68], [-64, 60],
    [-55, 50], [-66, 44], [-75, 36], [-81, 25], [-90, 29], [-97, 26],
    [-96, 19], [-87, 21], [-83, 10], [-78, 8], [-85, 11], [-93, 15],
    [-105, 20], [-112, 28], [-117, 32], [-124, 40], [-125, 49], [-138, 59],
    [-154, 58], [-164, 55],
  ],
  // Greenland
  [[-56, 60], [-42, 60], [-20, 70], [-24, 81], [-48, 82], [-66, 76], [-58, 68]],
  // South America
  [
    [-78, 9], [-72, 11], [-62, 10], [-50, 1], [-35, -6], [-39, -15],
    [-46, -24], [-53, -34], [-63, -41], [-67, -54], [-74, -52], [-73, -40],
    [-71, -28], [-71, -18], [-77, -12], [-81, -5], [-79, 2],
  ],
  // Europe
  [
    [-9, 37], [-9, 43], [-2, 43], [-5, 48], [2, 51], [8, 54], [6, 60],
    [14, 68], [28, 71], [42, 68], [60, 68], [60, 52], [44, 44], [30, 46],
    [26, 40], [22, 37], [16, 38], [12, 44], [6, 43], [0, 39], [-5, 36],
  ],
  // UK & Ireland
  [[-10, 52], [-6, 55], [-2, 58], [1, 52], [-5, 50]],
  // Africa
  [
    [-17, 15], [-13, 28], [-5, 36], [10, 37], [12, 33], [25, 32], [33, 31],
    [39, 20], [43, 12], [51, 12], [46, 2], [40, -10], [35, -24], [28, -33],
    [18, -34], [14, -22], [12, -12], [9, -1], [9, 4], [2, 6], [-8, 5], [-16, 11],
  ],
  // Asia
  [
    [28, 41], [42, 43], [52, 40], [58, 50], [62, 68], [95, 75], [135, 71],
    [172, 66], [162, 55], [142, 52], [132, 42], [126, 38], [129, 35],
    [122, 39], [121, 31], [114, 22], [108, 16], [104, 2], [100, 14],
    [96, 16], [90, 22], [80, 10], [77, 8], [72, 20], [66, 25], [56, 26],
    [48, 30], [44, 13], [35, 28], [35, 36],
  ],
  // Japan
  [[130, 31], [135, 34], [141, 38], [145, 44], [140, 42], [136, 36], [131, 33]],
  // Philippines (Luzon / Mindanao)
  [[120, 18], [123, 18], [124, 12], [126, 8], [123, 7], [120, 13]],
  // Indonesia / Sumatra / Borneo
  [[96, 5], [104, -1], [116, -2], [118, 5], [108, 2], [104, -6], [114, -8], [105, -7]],
  // Australia
  [
    [114, -22], [124, -16], [132, -12], [142, -11], [149, -20], [153, -28],
    [150, -37], [140, -38], [132, -32], [122, -34], [115, -34], [113, -26],
  ],
  // New Zealand
  [[172, -35], [178, -38], [174, -44], [167, -46], [170, -41]],
];

const CITY_HUBS: CityHubMeta[] = [
  {
    key: 'sendai',
    name: 'Sendai Coastal Metro',
    lat: 38.27,
    lon: 140.87,
    elevationLabel: '42 m avg · Coastal Plain & Foothills',
    terrainNote: 'Pacific coastal shelf with raised seawall & hillside districts',
    buildingCount: 22,
    skylineTint: 0x93c5fd,
  },
  {
    key: 'tokyo',
    name: 'Tokyo Bay Urban Core',
    lat: 35.68,
    lon: 139.77,
    elevationLabel: '18 m avg · Dense Metro Basin',
    terrainNote: 'High-rise bayfront skyline, rail corridors & disaster shelters',
    buildingCount: 30,
    skylineTint: 0xbae6fd,
  },
  {
    key: 'luzon',
    name: 'Northern Luzon & Manila Hub',
    lat: 18.2,
    lon: 121.6,
    elevationLabel: '64 m avg · River Valley & Coast',
    terrainNote: 'Tropical basin surrounded by mountain ridges',
    buildingCount: 18,
    skylineTint: 0x7dd3fc,
  },
  {
    key: 'california',
    name: 'Sacramento & Sierra Foothills',
    lat: 38.58,
    lon: -121.49,
    elevationLabel: '85 m avg · Valley & Mountain Slope',
    terrainNote: 'River valley rising sharply toward Sierra Nevada peaks',
    buildingCount: 20,
    skylineTint: 0xfde68a,
  },
  {
    key: 'cologne',
    name: 'Cologne / Rhine Valley',
    lat: 50.94,
    lon: 6.96,
    elevationLabel: '52 m avg · Floodplain & City Grid',
    terrainNote: 'Wide Rhine river basin with industrial & hospital blocks',
    buildingCount: 18,
    skylineTint: 0x93c5fd,
  },
  {
    key: 'munich',
    name: 'Munich / Bavaria Corridor',
    lat: 48.14,
    lon: 11.58,
    elevationLabel: '519 m avg · Alpine Plateau',
    terrainNote: 'Highland plateau near northern Alps with emergency depots',
    buildingCount: 16,
    skylineTint: 0xa5f3fc,
  },
  {
    key: 'mumbai',
    name: 'Mumbai Coastal Peninsula',
    lat: 19.08,
    lon: 72.88,
    elevationLabel: '14 m avg · Arabian Sea Peninsula',
    terrainNote: 'Dense coastal towers & monsoon flood-watch harbor',
    buildingCount: 26,
    skylineTint: 0xfef08a,
  },
  {
    key: 'london',
    name: 'London Thames Basin',
    lat: 51.51,
    lon: -0.13,
    elevationLabel: '24 m avg · River Basin',
    terrainNote: 'Thames corridor with commercial high-rises & medical hubs',
    buildingCount: 24,
    skylineTint: 0xbae6fd,
  },
  {
    key: 'newyork',
    name: 'New York Metro Harbor',
    lat: 40.71,
    lon: -74.01,
    elevationLabel: '16 m avg · Coastal Harbor Islands',
    terrainNote: 'Dense skyscraper cluster along Hudson & East River',
    buildingCount: 30,
    skylineTint: 0xe0f2fe,
  },
  {
    key: 'singapore',
    name: 'Singapore Strait Hub',
    lat: 1.35,
    lon: 103.82,
    elevationLabel: '15 m avg · Island City',
    terrainNote: 'Maritime relief staging & high-density coastal buildings',
    buildingCount: 20,
    skylineTint: 0x67e8f9,
  },
  {
    key: 'sydney',
    name: 'Sydney Harbour District',
    lat: -33.87,
    lon: 151.21,
    elevationLabel: '38 m avg · Coastal Basin',
    terrainNote: 'Harbour inlet with sandstone headlands & city towers',
    buildingCount: 18,
    skylineTint: 0x93c5fd,
  },
];

function resolveLatLon(region: string, locationCoords?: string): { lat: number; lon: number } {
  if (locationCoords) {
    const nums = locationCoords.match(/-?\d+(\.\d+)?/g);
    if (nums && nums.length >= 2) {
      let lat = parseFloat(nums[0]);
      let lon = parseFloat(nums[1]);
      if (locationCoords.toUpperCase().includes('S')) lat = -Math.abs(lat);
      if (locationCoords.toUpperCase().includes('W')) lon = -Math.abs(lon);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        return { lat, lon };
      }
    }
  }
  const r = region.toLowerCase();
  if (r.includes('tokyo')) return { lat: 35.68, lon: 139.77 };
  if (r.includes('sendai') || r.includes('japan')) return { lat: 38.27, lon: 140.87 };
  if (r.includes('luzon') || r.includes('philippines') || r.includes('manila'))
    return { lat: 18.2, lon: 121.6 };
  if (r.includes('california') || r.includes('sacramento') || r.includes('sierra'))
    return { lat: 38.58, lon: -121.49 };
  if (r.includes('rhine') || r.includes('cologne') || r.includes('germany'))
    return { lat: 50.94, lon: 6.96 };
  if (r.includes('munich') || r.includes('bavaria')) return { lat: 48.14, lon: 11.58 };
  if (r.includes('mumbai') || r.includes('india') || r.includes('delhi'))
    return { lat: 19.08, lon: 72.88 };
  if (r.includes('london') || r.includes('uk')) return { lat: 51.51, lon: -0.13 };
  if (r.includes('new york') || r.includes('us')) return { lat: 40.71, lon: -74.01 };
  if (r.includes('singapore')) return { lat: 1.35, lon: 103.82 };
  if (r.includes('sydney') || r.includes('australia')) return { lat: -33.87, lon: 151.21 };
  if (r.includes('windows server')) return { lat: 39.04, lon: -77.49 };
  if (r.includes('windows 11')) return { lat: 47.61, lon: -122.33 };
  if (r.includes('android') || r.includes('mobile')) return { lat: 35.68, lon: 139.77 };
  if (r.includes('ot') || r.includes('scada')) return { lat: 48.85, lon: 9.18 };
  if (r.includes('global')) return { lat: 24.0, lon: 18.0 };
  return { lat: 22.0, lon: 48.0 };
}

function findNearestCityHub(lat: number, lon: number): CityHubMeta {
  let best = CITY_HUBS[0];
  let bestDist = Infinity;
  for (const hub of CITY_HUBS) {
    const d = Math.hypot(hub.lat - lat, hub.lon - lon);
    if (d < bestDist) {
      bestDist = d;
      best = hub;
    }
  }
  return best;
}

function formatCoordsLabel(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

function latLonToVec3(lat: number, lon: number, radius: number, out: THREE.Vector3): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
  return out;
}

function drawPolygonPath(ctx: CanvasRenderingContext2D, poly: [number, number][], w: number, h: number) {
  ctx.beginPath();
  poly.forEach(([lon, lat], idx) => {
    const x = ((lon + 180) / 360) * w;
    const y = ((90 - lat) / 180) * h;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

// High-resolution procedural Satellite Earth texture (zero external HTTP / zero 404s)
function createSatelliteEarthTexture(): THREE.CanvasTexture {
  const w = 2048;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // 1. Satellite deep ocean bathymetry gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
  oceanGrad.addColorStop(0.0, '#13314d');
  oceanGrad.addColorStop(0.18, '#0b2948');
  oceanGrad.addColorStop(0.5, '#071d38');
  oceanGrad.addColorStop(0.82, '#0a2644');
  oceanGrad.addColorStop(1.0, '#163554');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, w, h);

  // Subtle oceanic ridge / current variations
  for (let i = 0; i < 60; i++) {
    const x = ((i * 193) % w);
    const y = ((i * 97 + 120) % h);
    const r = 80 + (i % 5) * 45;
    const g = ctx.createRadialGradient(x, y, 5, x, y, r);
    g.addColorStop(0, 'rgba(20, 82, 130, 0.16)');
    g.addColorStop(1, 'rgba(7, 29, 56, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Shallow turquoise continental coastal shelves
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const poly of CONTINENT_POLYGONS) {
    drawPolygonPath(ctx, poly, w, h);
    ctx.strokeStyle = 'rgba(34, 150, 178, 0.34)';
    ctx.lineWidth = 22;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
    ctx.lineWidth = 10;
    ctx.stroke();
  }

  // 3. Continental terrain base (natural satellite biome gradient)
  const landGrad = ctx.createLinearGradient(0, 0, 0, h);
  landGrad.addColorStop(0.0, '#c8d7df'); // Arctic tundra
  landGrad.addColorStop(0.16, '#395a40'); // Boreal forest
  landGrad.addColorStop(0.32, '#4c7143'); // Temperate greenery
  landGrad.addColorStop(0.46, '#6e7c4c'); // Subtropical / grassland
  landGrad.addColorStop(0.56, '#3b6d41'); // Equatorial forest
  landGrad.addColorStop(0.74, '#6a7548'); // Southern temperate
  landGrad.addColorStop(1.0, '#cbd5e1');

  for (let pIdx = 0; pIdx < CONTINENT_POLYGONS.length; pIdx++) {
    const poly = CONTINENT_POLYGONS[pIdx];
    ctx.save();
    drawPolygonPath(ctx, poly, w, h);
    ctx.fillStyle = pIdx === 1 ? '#d7e3ea' : landGrad; // Greenland ice sheet
    ctx.fill();
    ctx.clip();

    // Biome texture patches inside continent bounds
    // Arid / desert belts (Sahara, Arabian, Central Asia, US Southwest, Outback)
    const desertPatches: [number, number, number, number, string][] = [
      [18, 22, 140, 62, 'rgba(181, 146, 94, 0.72)'], // Sahara / North Africa
      [50, 22, 95, 52, 'rgba(176, 138, 88, 0.65)'],  // Arabian / Middle East
      [-110, 32, 75, 45, 'rgba(155, 128, 86, 0.55)'], // US Southwest
      [130, -25, 110, 55, 'rgba(179, 121, 74, 0.66)'], // Australian Outback
      [85, 40, 120, 48, 'rgba(148, 126, 89, 0.58)'], // Gobi / Central Asia
    ];
    for (const [lon, lat, rx, ry, col] of desertPatches) {
      const cx = ((lon + 180) / 360) * w;
      const cy = ((90 - lat) / 180) * h;
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lush rainforest & temperate river basins
    const forestPatches: [number, number, number, number, string][] = [
      [-60, -6, 130, 75, 'rgba(34, 92, 46, 0.75)'],  // Amazon
      [20, 0, 95, 65, 'rgba(38, 96, 48, 0.7)'],      // Congo
      [105, 8, 90, 55, 'rgba(42, 102, 54, 0.65)'],   // SE Asia
      [10, 50, 125, 60, 'rgba(54, 100, 60, 0.52)'],  // Central Europe
      [-88, 40, 115, 60, 'rgba(52, 98, 58, 0.52)'],  // Eastern NA
    ];
    for (const [lon, lat, rx, ry, col] of forestPatches) {
      const cx = ((lon + 180) / 360) * w;
      const cy = ((90 - lat) / 180) * h;
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Raised mountain chain highlights (Himalayas, Rockies, Andes, Alps, Japan Alps)
    const mountainRanges: [number, number, number, number][] = [
      [85, 32, 120, 26],   // Himalayas
      [-112, 44, 34, 90],  // Rockies
      [-69, -22, 24, 130], // Andes
      [11, 46, 42, 18],    // Alps
      [138, 36, 22, 34],   // Japan Ridge
    ];
    for (const [lon, lat, rx, ry] of mountainRanges) {
      const cx = ((lon + 180) / 360) * w;
      const cy = ((90 - lat) / 180) * h;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(rx, ry));
      g.addColorStop(0, 'rgba(218, 222, 228, 0.62)');
      g.addColorStop(0.5, 'rgba(130, 114, 96, 0.45)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine terrain speckle for satellite imagery crispness when zoomed in
    for (let s = 0; s < 550; s++) {
      const sx = ((s * 317 + pIdx * 131) % w);
      const sy = ((s * 173 + pIdx * 79) % h);
      ctx.fillStyle = s % 2 === 0 ? 'rgba(255,255,255,0.055)' : 'rgba(15,23,42,0.08)';
      ctx.fillRect(sx, sy, 3, 2);
    }

    ctx.restore();

    // Crisp coastline contour
    drawPolygonPath(ctx, poly, w, h);
    ctx.strokeStyle = 'rgba(167, 218, 232, 0.42)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // 4. Urban footprint glows at major cities (helps city hubs stand out on satellite imagery)
  for (const hub of CITY_HUBS) {
    const cx = ((hub.lon + 180) / 360) * w;
    const cy = ((90 - hub.lat) / 180) * h;
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 14);
    g.addColorStop(0, 'rgba(248, 250, 252, 0.68)');
    g.addColorStop(0.45, 'rgba(251, 191, 36, 0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Subtle atmospheric satellite cloud wisps
  ctx.fillStyle = 'rgba(241, 245, 249, 0.11)';
  for (let c = 0; c < 36; c++) {
    const cx = ((c * 241 + 60) % w);
    const cy = 90 + ((c * 139) % (h - 180));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((c % 7) * 0.25);
    ctx.beginPath();
    ctx.ellipse(0, 0, 55 + (c % 4) * 28, 10 + (c % 3) * 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

// Companion linear relief bump map (NoColorSpace) for raised terrain ridges & coastlines
function createEarthBumpTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, w, h);

  for (const poly of CONTINENT_POLYGONS) {
    drawPolygonPath(ctx, poly, w, h);
    ctx.fillStyle = '#686868';
    ctx.fill();
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Mountain elevation peaks
  const peaks: [number, number, number][] = [
    [85, 32, 60],
    [-112, 44, 48],
    [-69, -22, 54],
    [11, 46, 26],
    [138, 36, 22],
    [35, 0, 32],
  ];
  for (const [lon, lat, radius] of peaks) {
    const cx = ((lon + 180) / 360) * w;
    const cy = ((90 - lat) / 180) * h;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#a8a8a8');
    g.addColorStop(1, 'rgba(104, 104, 104, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  // Data texture stays in linear NoColorSpace
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createTacticalDarkTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
  oceanGrad.addColorStop(0, '#091529');
  oceanGrad.addColorStop(0.5, '#060d1c');
  oceanGrad.addColorStop(1, '#081326');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.10)';
  ctx.lineWidth = 1;
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = ((lon + 180) / 360) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(59, 130, 246, 0.22)';
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  ctx.fillStyle = '#152845';
  ctx.strokeStyle = '#3b6ea5';
  ctx.lineWidth = 1.6;
  for (const poly of CONTINENT_POLYGONS) {
    drawPolygonPath(ctx, poly, w, h);
    ctx.fill();
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function severityHex(sev: Severity, kind: GlobeMarkerItem['kind']): number {
  if (kind === 'relief') return 0x06b6d4;
  if (kind === 'cyber') return 0xef4444;
  if (kind === 'alert') return sev === 'Critical' ? 0xf97316 : 0xfbbf24;
  if (sev === 'Critical') return 0xef4444;
  if (sev === 'High') return 0xf59e0b;
  if (sev === 'Moderate') return 0x38bdf8;
  return 0x10b981;
}

function plainTargetModuleLabel(id: ModuleId): string {
  switch (id) {
    case 'disaster':
      return 'Disasters';
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
      return 'Dashboard';
  }
}

// Module-scope reusable scratch math objects (zero GC in render loop)
const _up = new THREE.Vector3(0, 1, 0);
const _pos = new THREE.Vector3();
const _norm = new THREE.Vector3();
const _pA = new THREE.Vector3();
const _pB = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _camGoal = new THREE.Vector3();

export const TacticalGlobe3D: React.FC<TacticalGlobe3DProps> = ({
  forecasts,
  incidents,
  alerts = [],
  threats = [],
  resources = [],
  showCyber = false,
  heightClass = 'h-72 sm:h-80 lg:h-[360px]',
  onSelectModule,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [layerFilter, setLayerFilter] = useState<'all' | GlobeMarkerItem['kind']>('all');
  const [mapStyle, setMapStyle] = useState<'satellite' | 'dark'>('satellite');
  const [showBuildings, setShowBuildings] = useState(true);
  const [showMapOverview, setShowMapOverview] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<GlobeMarkerItem | null>(null);
  const [selectedCityFocus, setSelectedCityFocus] = useState<CityHubMeta | null>(null);
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  const mapStyleRef = useRef(mapStyle);
  mapStyleRef.current = mapStyle;

  const showBuildingsRef = useRef(showBuildings);
  showBuildingsRef.current = showBuildings;

  const onSelectRef = useRef(onSelectModule);
  onSelectRef.current = onSelectModule;

  // Build unified marker dataset for Alerts, Disaster Risk Zones, and Incident Impacts
  const markers = useMemo<GlobeMarkerItem[]>(() => {
    const items: GlobeMarkerItem[] = [];

    forecasts.slice(0, 6).forEach((f, idx) => {
      const coords = resolveLatLon(f.region);
      items.push({
        id: f.id,
        kind: 'disaster',
        title: f.title,
        region: f.region,
        severity: f.severity,
        impactLabel: `${f.populationAtRisk} people in area · ${plainSeverity(f.severity)}`,
        detail: `${plainDisasterCategory(f.category)} · ${f.metric} (${f.confidencePct}% certainty)`,
        lat: coords.lat + (idx % 2 === 0 ? 0.6 : -0.6),
        lon: coords.lon + (idx % 2 === 0 ? -0.6 : 0.6),
        targetModule: 'disaster',
      });
    });

    incidents.slice(0, 6).forEach((inc, idx) => {
      const coords = resolveLatLon(inc.region, inc.locationCoords);
      const pop = inc.exposedPopulation ? `${inc.exposedPopulation.toLocaleString()} people affected` : 'Active emergency';
      items.push({
        id: inc.id,
        kind: 'incident',
        title: inc.title,
        region: inc.region,
        severity: inc.severity,
        impactLabel: `${pop} · ${plainIncidentStatus(inc.status)}`,
        detail: `${inc.assignedUnit} · ${inc.damageAssessment || inc.notes}`,
        lat: coords.lat - 1.4 + idx * 0.4,
        lon: coords.lon + 1.5 - idx * 0.3,
        targetModule: 'response',
      });
    });

    alerts
      .filter((a) => a.status === 'Published')
      .slice(0, 5)
      .forEach((al, idx) => {
        const coords = resolveLatLon(al.region);
        items.push({
          id: al.id,
          kind: 'alert',
          title: al.title,
          region: al.region,
          severity: al.severity,
          impactLabel: `${plainSeverity(al.severity)} · ${al.region}`,
          detail: al.message,
          lat: coords.lat + 1.8 - idx * 0.5,
          lon: coords.lon - 1.7 + idx * 0.4,
          targetModule: 'alerts',
        });
      });

    if (showCyber) {
      threats
        .filter((t) => t.status !== 'Contained')
        .slice(0, 4)
        .forEach((t) => {
          const coords = resolveLatLon(t.platform);
          items.push({
            id: t.id,
            kind: 'cyber',
            title: t.title,
            region: t.platform,
            severity: t.severity,
            impactLabel: `${t.affectedHosts} devices affected · ${plainSeverity(t.severity)}`,
            detail: t.summary,
            lat: coords.lat,
            lon: coords.lon,
            targetModule: 'cyber',
          });
        });
    }

    resources.slice(0, 8).forEach((r, idx) => {
      const coords = resolveLatLon(r.region);
      items.push({
        id: r.id,
        kind: 'relief',
        title: r.name,
        region: r.region,
        severity: r.status === 'Full' ? 'High' : r.status === 'Limited' ? 'Moderate' : 'Low',
        impactLabel: `${r.quantity.toLocaleString()} ${r.unit} · ${plainReliefStatus(r.status)}`,
        detail: `Phone/Contact: ${r.contact} · For: ${r.allocatedTo}`,
        lat: coords.lat - 1.1 + idx * 0.45,
        lon: coords.lon + 1.2 - idx * 0.35,
        targetModule: 'relief',
      });
    });

    return items;
  }, [forecasts, incidents, alerts, threats, resources, showCyber]);

  const filteredMarkers = useMemo(
    () => (layerFilter === 'all' ? markers : markers.filter((m) => m.kind === layerFilter)),
    [markers, layerFilter]
  );

  const filteredRef = useRef<GlobeMarkerItem[]>(filteredMarkers);
  filteredRef.current = filteredMarkers;

  // Imperative hooks into live Three.js scene
  const syncMarkersFnRef = useRef<(() => void) | null>(null);
  const syncMapVisualsFnRef = useRef<(() => void) | null>(null);
  const focusGoalFnRef = useRef<((lat: number, lon: number, distance?: number) => void) | null>(null);
  const resetCamFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = Math.max(300, container.clientWidth);
    const height = Math.max(260, container.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050912);
    scene.fog = new THREE.FogExp2(0x050912, 0.038);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(-2.3, 2.2, 4.4);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    let envTarget: THREE.WebGLRenderTarget | null = null;
    try {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envTarget.texture;
      pmremGenerator.dispose();
    } catch {
      // Fallback safely to direct lighting rig if PMREM fails
    }

    // 3-point lighting rig tuned so raised buildings & satellite terrain catch clear relief shadows
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x091124, 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e4, 2.0);
    keyLight.position.set(6, 5, 6);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x3b82f6, 1.05);
    rimLight.position.set(-6, -2, -5);
    scene.add(rimLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 2.1; // Allows close-up inspection of raised 3D buildings & satellite terrain
    controls.maxDistance = 8.0;
    controls.autoRotateSpeed = 0.42;

    let hasActiveGoal = false;
    controls.addEventListener('start', () => {
      hasActiveGoal = false;
    });

    const GLOBE_RADIUS = 1.8;

    // 1. Procedural Satellite + Dark Map Textures & Linear Elevation Bump Map
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const satelliteTexture = createSatelliteEarthTexture();
    satelliteTexture.anisotropy = maxAniso;

    const darkTexture = createTacticalDarkTexture();
    darkTexture.anisotropy = maxAniso;

    const bumpTexture = createEarthBumpTexture();
    bumpTexture.anisotropy = maxAniso;

    const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 72, 54);
    const earthMat = new THREE.MeshStandardMaterial({
      map: mapStyleRef.current === 'satellite' ? satelliteTexture : darkTexture,
      bumpMap: bumpTexture,
      bumpScale: mapStyleRef.current === 'satellite' ? 0.032 : 0.012,
      roughness: mapStyleRef.current === 'satellite' ? 0.68 : 0.72,
      metalness: mapStyleRef.current === 'satellite' ? 0.08 : 0.14,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earthMesh);

    // 2. Raised 3D City Buildings & Rooftops via InstancedMesh (> 200 blocks oriented along surface normals)
    const buildingsGroup = new THREE.Group();
    scene.add(buildingsGroup);

    const buildingPositions: {
      lat: number;
      lon: number;
      width: number;
      depth: number;
      height: number;
      color: number;
      roofColor: number;
      yaw: number;
    }[] = [];

    CITY_HUBS.forEach((hub, hubIdx) => {
      for (let b = 0; b < hub.buildingCount; b++) {
        // Deterministic radial city grid spiral around each city center
        const ring = b === 0 ? 0 : Math.floor((b - 1) / 6) + 1;
        const angle = b * 2.15 + hubIdx * 0.7;
        const spread = ring === 0 ? 0 : 0.36 + ring * 0.28;
        const dLat = Math.sin(angle) * spread;
        const dLon = Math.cos(angle) * spread * 1.15;
        const isTallTower = b % 5 === 0;
        const height = isTallTower
          ? 0.075 + ((b * 13 + hubIdx * 7) % 10) * 0.0055
          : 0.028 + ((b * 17 + hubIdx * 5) % 9) * 0.0042;
        const w = isTallTower ? 0.021 : 0.016 + (b % 3) * 0.004;
        const d = isTallTower ? 0.021 : 0.016 + ((b + 1) % 3) * 0.004;
        const colorPalette = [0x94a3b8, 0x64748b, hub.skylineTint, 0xcbd5e1, 0x475569];
        const roofColor = isTallTower ? 0x38bdf8 : b % 4 === 0 ? 0xfbbf24 : 0xe2e8f0;
        buildingPositions.push({
          lat: hub.lat + dLat,
          lon: hub.lon + dLon,
          width: w,
          depth: d,
          height,
          color: colorPalette[(b + hubIdx) % colorPalette.length],
          roofColor,
          yaw: ((b * 37) % 90) * (Math.PI / 180),
        });
      }
    });

    const totalBuildings = buildingPositions.length;
    const bldgGeo = new THREE.BoxGeometry(1, 1, 1);
    const bldgMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.48,
    });
    const bldgInstanced = new THREE.InstancedMesh(bldgGeo, bldgMat, totalBuildings);

    const roofGeo = new THREE.BoxGeometry(1, 1, 1);
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.6,
    });
    const roofInstanced = new THREE.InstancedMesh(roofGeo, roofMat, totalBuildings);

    const bDummy = new THREE.Object3D();
    const qSurface = new THREE.Quaternion();
    const qYaw = new THREE.Quaternion();
    const bColor = new THREE.Color();

    buildingPositions.forEach((bp, i) => {
      latLonToVec3(bp.lat, bp.lon, GLOBE_RADIUS, _pos);
      _norm.copy(_pos).normalize();

      qSurface.setFromUnitVectors(_up, _norm);
      qYaw.setFromAxisAngle(_up, bp.yaw);

      // Main extruded skyscraper / block seated flush into globe surface
      bDummy.position.copy(_pos).addScaledVector(_norm, bp.height * 0.5 - 0.003);
      bDummy.quaternion.copy(qSurface).multiply(qYaw);
      bDummy.scale.set(bp.width, bp.height, bp.depth);
      bDummy.updateMatrix();
      bldgInstanced.setMatrixAt(i, bDummy.matrix);
      bldgInstanced.setColorAt(i, bColor.setHex(bp.color));

      // Lit rooftop crown / penthouse cap
      const roofH = 0.005;
      bDummy.position.copy(_pos).addScaledVector(_norm, bp.height - 0.001 + roofH * 0.5);
      bDummy.scale.set(bp.width * 0.72, roofH, bp.depth * 0.72);
      bDummy.updateMatrix();
      roofInstanced.setMatrixAt(i, bDummy.matrix);
      roofInstanced.setColorAt(i, bColor.setHex(bp.roofColor));
    });

    bldgInstanced.instanceMatrix.needsUpdate = true;
    if (bldgInstanced.instanceColor) bldgInstanced.instanceColor.needsUpdate = true;
    bldgInstanced.computeBoundingSphere();

    roofInstanced.instanceMatrix.needsUpdate = true;
    if (roofInstanced.instanceColor) roofInstanced.instanceColor.needsUpdate = true;
    roofInstanced.computeBoundingSphere();

    buildingsGroup.add(bldgInstanced);
    buildingsGroup.add(roofInstanced);
    buildingsGroup.visible = showBuildingsRef.current;

    // 3. Subtle Orbital Wireframe Meridian Cage & Atmospheric Halo
    const cageGeo = new THREE.SphereGeometry(GLOBE_RADIUS + 0.008, 24, 16);
    const cageMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: mapStyleRef.current === 'satellite' ? 0.035 : 0.07,
      depthWrite: false,
    });
    const cageMesh = new THREE.Mesh(cageGeo, cageMat);
    scene.add(cageMesh);

    const haloGeo = new THREE.SphereGeometry(GLOBE_RADIUS + 0.14, 48, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.11,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    scene.add(haloMesh);

    // 4. Instanced Ambient Telemetry Starfield
    const STAR_COUNT = 160;
    const starGeo = new THREE.OctahedronGeometry(0.018, 0);
    const starMat = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.55,
    });
    const starInstanced = new THREE.InstancedMesh(starGeo, starMat, STAR_COUNT);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = 6.5 + (i % 7) * 0.85;
      const theta = i * 2.39996;
      const y = 1 - ((i + 0.5) / STAR_COUNT) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      dummy.position.set(
        Math.cos(theta) * radiusAtY * r,
        y * r,
        Math.sin(theta) * radiusAtY * r
      );
      const s = 0.65 + (i % 5) * 0.2;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      starInstanced.setMatrixAt(i, dummy.matrix);
    }
    starInstanced.computeBoundingSphere();
    scene.add(starInstanced);

    // Sync Satellite/Dark layer & Raised 3D Buildings toggles cleanly
    syncMapVisualsFnRef.current = () => {
      const isSat = mapStyleRef.current === 'satellite';
      earthMat.map = isSat ? satelliteTexture : darkTexture;
      earthMat.bumpScale = isSat ? 0.032 : 0.012;
      earthMat.roughness = isSat ? 0.68 : 0.72;
      earthMat.metalness = isSat ? 0.08 : 0.14;
      earthMat.needsUpdate = true;
      cageMat.opacity = isSat ? 0.035 : 0.07;
      buildingsGroup.visible = showBuildingsRef.current;
    };

    // Dynamic marker & correlation arc groups
    const markersGroup = new THREE.Group();
    const arcsGroup = new THREE.Group();
    scene.add(markersGroup);
    scene.add(arcsGroup);

    const hitProxies: THREE.Object3D[] = [];
    const shockwaves: { mesh: THREE.Mesh; phase: number }[] = [];
    const beacons: { mesh: THREE.Mesh; baseY: number; phase: number }[] = [];
    const disposableGeos: THREE.BufferGeometry[] = [];
    const disposableMats: THREE.Material[] = [];

    const ringBaseGeo = new THREE.RingGeometry(0.045, 0.068, 28);
    const ringWaveGeo = new THREE.RingGeometry(0.055, 0.072, 28);
    const beaconGeo = new THREE.OctahedronGeometry(0.036, 0);
    const hitGeo = new THREE.SphereGeometry(0.14, 12, 10);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    const clearDynamicScene = () => {
      hitProxies.length = 0;
      shockwaves.length = 0;
      beacons.length = 0;
      while (markersGroup.children.length > 0) {
        markersGroup.remove(markersGroup.children[0]);
      }
      while (arcsGroup.children.length > 0) {
        arcsGroup.remove(arcsGroup.children[0]);
      }
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      disposableGeos.length = 0;
      disposableMats.length = 0;
    };

    const rebuildMarkers = () => {
      clearDynamicScene();
      const items = filteredRef.current;

      items.forEach((item, idx) => {
        const hex = severityHex(item.severity, item.kind);
        latLonToVec3(item.lat, item.lon, GLOBE_RADIUS, _pos);
        _norm.copy(_pos).normalize();

        const markerGroup = new THREE.Group();
        markerGroup.position.copy(_pos).addScaledVector(_norm, 0.012);
        markerGroup.quaternion.setFromUnitVectors(_up, _norm);

        const ringMat = new THREE.MeshBasicMaterial({
          color: hex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        disposableMats.push(ringMat);
        const ringMesh = new THREE.Mesh(ringBaseGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        const ringScale =
          item.severity === 'Critical' ? 1.55 : item.severity === 'High' ? 1.25 : 1.0;
        ringMesh.scale.setScalar(ringScale);
        markerGroup.add(ringMesh);

        const waveMat = new THREE.MeshBasicMaterial({
          color: hex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
        });
        disposableMats.push(waveMat);
        const waveMesh = new THREE.Mesh(ringWaveGeo, waveMat);
        waveMesh.rotation.x = -Math.PI / 2;
        waveMesh.position.y = 0.004;
        markerGroup.add(waveMesh);
        shockwaves.push({ mesh: waveMesh, phase: idx * 0.7 });

        const colHeight =
          item.severity === 'Critical'
            ? 0.34
            : item.severity === 'High'
            ? 0.25
            : item.severity === 'Moderate'
            ? 0.18
            : 0.13;
        const colGeo = new THREE.CylinderGeometry(0.009, 0.022, colHeight, 12);
        const colMat = new THREE.MeshStandardMaterial({
          color: hex,
          emissive: hex,
          emissiveIntensity: 0.55,
          roughness: 0.3,
          metalness: 0.45,
        });
        disposableGeos.push(colGeo);
        disposableMats.push(colMat);
        const colMesh = new THREE.Mesh(colGeo, colMat);
        colMesh.position.y = colHeight * 0.5;
        markerGroup.add(colMesh);

        const beaconMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: hex,
          emissiveIntensity: 0.9,
          roughness: 0.15,
          metalness: 0.75,
        });
        disposableMats.push(beaconMat);
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        const baseY = colHeight + 0.06;
        beaconMesh.position.y = baseY;
        markerGroup.add(beaconMesh);
        beacons.push({ mesh: beaconMesh, baseY, phase: idx * 0.9 });

        const proxy = new THREE.Mesh(hitGeo, hitMat);
        proxy.position.y = colHeight * 0.55;
        proxy.layers.set(1);
        proxy.userData.markerItem = item;
        markerGroup.add(proxy);
        hitProxies.push(proxy);

        markersGroup.add(markerGroup);
      });

      for (let i = 0; i < Math.min(items.length - 1, 5); i++) {
        const a = items[i];
        const b = items[(i + 1) % items.length];
        if (Math.abs(a.lat - b.lat) < 3 && Math.abs(a.lon - b.lon) < 3) continue;

        latLonToVec3(a.lat, a.lon, GLOBE_RADIUS + 0.02, _pA);
        latLonToVec3(b.lat, b.lon, GLOBE_RADIUS + 0.02, _pB);
        _mid.addVectors(_pA, _pB).multiplyScalar(0.5);
        const arcLift = GLOBE_RADIUS + 0.35 + Math.min(0.45, _pA.distanceTo(_pB) * 0.18);
        _mid.normalize().multiplyScalar(arcLift);

        const curve = new THREE.QuadraticBezierCurve3(
          _pA.clone(),
          _mid.clone(),
          _pB.clone()
        );
        const arcGeo = new THREE.TubeGeometry(curve, 32, 0.006, 6, false);
        const arcMat = new THREE.MeshBasicMaterial({
          color: severityHex(a.severity, a.kind),
          transparent: true,
          opacity: 0.45,
        });
        disposableGeos.push(arcGeo);
        disposableMats.push(arcMat);
        arcsGroup.add(new THREE.Mesh(arcGeo, arcMat));
      }
    };

    syncMarkersFnRef.current = rebuildMarkers;
    rebuildMarkers();

    focusGoalFnRef.current = (lat: number, lon: number, distance = 3.55) => {
      latLonToVec3(lat, lon, distance, _camGoal);
      hasActiveGoal = true;
    };

    resetCamFnRef.current = () => {
      _camGoal.set(-2.3, 2.2, 4.4);
      hasActiveGoal = true;
    };

    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointerNdc = new THREE.Vector2();
    let downPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (dist > 7) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;

      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(hitProxies, false);
      if (hits.length > 0) {
        const marker = hits[0].object.userData.markerItem as GlobeMarkerItem | undefined;
        if (marker) {
          setSelectedMarker(marker);
          setSelectedCityFocus(null);
          setShowFullDetails(false);
          setShowMapOverview(false);
          setAutoRotate(false);
          latLonToVec3(marker.lat, marker.lon, 3.45, _camGoal);
          hasActiveGoal = true;
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = Math.max(300, container.clientWidth);
      const h = Math.max(220, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext | null;
      if (!gl || typeof gl.fenceSync !== 'function' || typeof gl.SYNC_GPU_COMMANDS_COMPLETE !== 'number') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      gl.flush();
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(0.1, clock.getDelta());
      const elapsed = clock.getElapsedTime();

      controls.autoRotate = !isSoftwareGl && autoRotateRef.current && !hasActiveGoal;

      if (hasActiveGoal) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _camGoal.x, 5.5, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _camGoal.y, 5.5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _camGoal.z, 5.5, delta);
        camera.lookAt(0, 0, 0);
        if (camera.position.distanceTo(_camGoal) < 0.04) {
          hasActiveGoal = false;
        }
      }

      for (let i = 0; i < shockwaves.length; i++) {
        const sw = shockwaves[i];
        const t = ((elapsed * 0.65 + sw.phase) % 1);
        const s = 0.8 + t * 1.9;
        sw.mesh.scale.setScalar(s);
        (sw.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.65;
      }

      for (let i = 0; i < beacons.length; i++) {
        const b = beacons[i];
        b.mesh.rotation.y = elapsed * 1.1 + b.phase;
        b.mesh.position.y = b.baseY + Math.sin(elapsed * 2.2 + b.phase) * 0.018;
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      renderer.render(scene, camera);
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      clearDynamicScene();
      ringBaseGeo.dispose();
      ringWaveGeo.dispose();
      beaconGeo.dispose();
      hitGeo.dispose();
      hitMat.dispose();
      bldgGeo.dispose();
      bldgMat.dispose();
      roofGeo.dispose();
      roofMat.dispose();
      earthGeo.dispose();
      earthMat.dispose();
      satelliteTexture.dispose();
      darkTexture.dispose();
      bumpTexture.dispose();
      cageGeo.dispose();
      cageMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      envTarget?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    syncMarkersFnRef.current?.();
  }, [filteredMarkers]);

  useEffect(() => {
    syncMapVisualsFnRef.current?.();
  }, [mapStyle, showBuildings]);

  const handleFocusMarker = (m: GlobeMarkerItem, closeZoom = false) => {
    setSelectedMarker(m);
    setSelectedCityFocus(null);
    setShowFullDetails(false);
    setShowMapOverview(false);
    setAutoRotate(false);
    focusGoalFnRef.current?.(m.lat, m.lon, closeZoom ? 2.48 : 3.45);
  };

  const handleFocusCity = (hub: CityHubMeta, closeZoom = true) => {
    setSelectedMarker(null);
    setSelectedCityFocus(hub);
    setShowFullDetails(false);
    setShowMapOverview(false);
    setAutoRotate(false);
    focusGoalFnRef.current?.(hub.lat, hub.lon, closeZoom ? 2.48 : 3.45);
  };

  const handleLocationSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchNotice(null);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;

    const matchedMarker = markers.find(
      (m) =>
        m.region.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
    );
    if (matchedMarker) {
      handleFocusMarker(matchedMarker, true);
      return;
    }

    const matchedCity = CITY_HUBS.find(
      (c) => c.name.toLowerCase().includes(q) || c.key.includes(q)
    );
    if (matchedCity) {
      handleFocusCity(matchedCity, true);
      return;
    }

    const knownPlaceKeywords = [
      'sendai', 'japan', 'tokyo', 'luzon', 'philippines', 'manila',
      'california', 'sacramento', 'sierra', 'rhine', 'cologne', 'germany',
      'munich', 'bavaria', 'mumbai', 'india', 'delhi', 'london', 'uk',
      'new york', 'us', 'singapore', 'sydney', 'australia', 'global',
    ];
    const hasCoords = /-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?/.test(q);
    if (hasCoords || knownPlaceKeywords.some((kw) => q.includes(kw))) {
      const coords = resolveLatLon(q, q);
      const nearest = findNearestCityHub(coords.lat, coords.lon);
      setSelectedMarker(null);
      setSelectedCityFocus({
        ...nearest,
        name: searchQuery.trim(),
        lat: coords.lat,
        lon: coords.lon,
      });
      setShowFullDetails(false);
      setShowMapOverview(false);
      setAutoRotate(false);
      focusGoalFnRef.current?.(coords.lat, coords.lon, 2.55);
      return;
    }
    setSearchNotice('Try a city like Tokyo, Sendai, Luzon, California, Mumbai, London, or New York.');
  };

  const layerModes = [
    'all',
    'alert',
    'disaster',
    'incident',
    ...(resources.length > 0 ? (['relief'] as const) : []),
    ...(showCyber ? (['cyber'] as const) : []),
  ] as const;

  const activeDetailsHub = useMemo(() => {
    if (selectedMarker) return findNearestCityHub(selectedMarker.lat, selectedMarker.lon);
    if (selectedCityFocus) return selectedCityFocus;
    return null;
  }, [selectedMarker, selectedCityFocus]);

  const activeFocusCoords = useMemo(() => {
    if (selectedMarker) return { lat: selectedMarker.lat, lon: selectedMarker.lon, region: selectedMarker.region };
    if (selectedCityFocus) return { lat: selectedCityFocus.lat, lon: selectedCityFocus.lon, region: selectedCityFocus.name };
    return null;
  }, [selectedMarker, selectedCityFocus]);

  const nearbyAlerts = useMemo(() => {
    if (!activeFocusCoords) return [];
    const focusName = activeFocusCoords.region.toLowerCase();
    return alerts
      .filter((a) => a.status === 'Published')
      .filter((a) => {
        const reg = a.region.toLowerCase();
        if (reg.includes('all') || reg.includes('global') || focusName.includes('global')) return true;
        const c = resolveLatLon(a.region);
        return Math.hypot(c.lat - activeFocusCoords.lat, c.lon - activeFocusCoords.lon) <= 12;
      })
      .slice(0, 3);
  }, [alerts, activeFocusCoords]);

  const nearbyResources = useMemo(() => {
    if (!activeFocusCoords) return [];
    return resources
      .filter((r) => {
        const c = resolveLatLon(r.region);
        return Math.hypot(c.lat - activeFocusCoords.lat, c.lon - activeFocusCoords.lon) <= 12;
      })
      .slice(0, 3);
  }, [resources, activeFocusCoords]);

  const cityTargetModule: ModuleId = useMemo(() => {
    if (nearbyAlerts.length > 0) return 'alerts';
    if (nearbyResources.length > 0) return 'relief';
    return 'disaster';
  }, [nearbyAlerts.length, nearbyResources.length]);

  return (
    <div
      className={
        expanded
          ? 'fixed inset-3 sm:inset-6 z-50 border border-blue-500/40 rounded-2xl bg-[#070B13] overflow-hidden flex flex-col shadow-2xl'
          : 'border border-slate-800 rounded-xl bg-[#070B13] overflow-hidden'
      }
    >
      {/* Header Bar */}
      <div className="px-4 py-2.5 border-b border-slate-800 bg-[#0A0F1A] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Compass className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />
          <span className="font-semibold text-slate-100 truncate">
            Live 3D Satellite Map &amp; Raised Buildings
          </span>
          <span className="hidden md:inline text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-sky-300">
            {mapStyle === 'satellite' ? 'Satellite + Relief' : 'Dark Map'} ·{' '}
            {showBuildings ? '3D Buildings On' : '3D Buildings Off'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] font-medium text-slate-400">
          <span className="text-red-400">Red: Danger</span>
          <span className="text-amber-400">Orange: Warning</span>
          <span className="text-emerald-400">Green: Safe</span>
          {resources.length > 0 && <span className="text-cyan-400">Blue: Hospitals &amp; Shelters</span>}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Exit fullscreen 3D map' : 'Fullscreen 3D map'}
            className="min-h-[28px] px-2 py-1 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1"
          >
            {expanded ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Smaller</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Full Screen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3D Viewport + Clean Bottom Dock Overlay (No backdrop-blur over WebGL) */}
      <div
        className={`relative w-full min-h-[280px] ${
          expanded ? 'flex-1 min-h-[340px]' : heightClass
        } bg-[#050912]`}
      >
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {webglUnavailable && (
          <div className="absolute inset-0 p-4 flex flex-col justify-between bg-[#070B13]">
            <div className="text-xs text-slate-300 space-y-1">
              <div className="font-semibold text-blue-300">
                Active Alerts &amp; Help Locations (List View)
              </div>
              <p className="text-[11px] text-slate-400">
                3D globe graphics are turned off in this browser. Pick any location below to inspect map details.
              </p>
            </div>
            {filteredMarkers.length === 0 ? (
              <div className="my-auto text-center text-xs text-slate-400">
                No items in this map layer right now. Select &ldquo;All&rdquo; below to see everything.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto my-2">
                {filteredMarkers.slice(0, 6).map((m) => (
                  <button
                    key={`${m.kind}-${m.id}`}
                    type="button"
                    onClick={() => handleFocusMarker(m)}
                    className="p-2.5 rounded-lg border border-slate-800 bg-[#0A0F1A] hover:border-blue-500/60 text-left text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-blue-400 font-medium">{plainMarkerKind(m.kind)}</span>
                      <span className="text-amber-400 font-medium">{plainSeverity(m.severity)}</span>
                    </div>
                    <div className="font-medium text-slate-100 truncate">{m.title}</div>
                    <div className="text-[11px] text-slate-400 truncate">{m.region}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Top-Left Map Details Button (when no marker/city selected) */}
        {!selectedMarker && !selectedCityFocus && (
          <div className="z-20 pointer-events-auto absolute top-3 left-3 flex flex-col items-start gap-1.5">
            <button
              type="button"
              onClick={() => setShowMapOverview((v) => !v)}
              className="min-h-[30px] px-2.5 py-1 rounded-lg border border-slate-700/90 bg-[#090E18]/95 text-[11px] font-medium text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1.5 shadow-lg"
            >
              <Info className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
              <span>Map Details</span>
            </button>

            {showMapOverview && (
              <div className="w-[min(320px,85vw)] rounded-xl border border-slate-700 bg-[#090E18]/95 p-3 text-xs shadow-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-100 inline-flex items-center gap-1.5">
                    <Satellite className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                    Satellite &amp; 3D Buildings Details
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMapOverview(false)}
                    className="text-slate-400 hover:text-white text-[11px]"
                  >
                    Close
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                  <div className="p-2 rounded-lg border border-slate-800 bg-[#0D1422]">
                    <div className="text-slate-400 text-[10px]">Map View</div>
                    <div className="font-medium text-sky-300">
                      {mapStyle === 'satellite' ? 'Satellite Relief' : 'Tactical Dark'}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg border border-slate-800 bg-[#0D1422]">
                    <div className="text-slate-400 text-[10px]">Raised 3D Buildings</div>
                    <div className="font-medium text-emerald-300">
                      {showBuildings ? '240 City Towers Active' : 'Hidden'}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  Zoom in or tap any city below to inspect raised 3D buildings, terrain elevation, and coordinates:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CITY_HUBS.slice(0, 6).map((hub) => (
                    <button
                      key={hub.key}
                      type="button"
                      onClick={() => handleFocusCity(hub, true)}
                      className="px-2 py-1 rounded border border-slate-700 bg-[#0D1422] text-[10px] text-slate-200 hover:border-blue-500/60"
                    >
                      {hub.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Compact Top-Right Location Search */}
        <div className="z-20 pointer-events-auto hidden sm:flex flex-col items-end gap-1 absolute top-3 right-3">
          <form
            onSubmit={handleLocationSearch}
            className="flex items-center gap-1 rounded-lg border border-slate-700/90 bg-[#090E18]/95 p-1 shadow-lg"
          >
            <Search className="w-3.5 h-3.5 text-slate-400 ml-1.5" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (searchNotice) setSearchNotice(null);
              }}
              placeholder="Search city or coords..."
              aria-label="Search 3D globe location"
              className="w-36 bg-transparent px-1.5 py-0.5 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              className="px-2 py-0.5 rounded bg-blue-600 text-[10px] font-medium text-white hover:bg-blue-700"
            >
              Find
            </button>
          </form>
          {searchNotice && (
            <div className="max-w-[240px] px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-[#090E18]/95 text-[10px] text-amber-300 shadow-lg">
              {searchNotice}
            </div>
          )}
        </div>

        {/* Selected Marker OR City Focus — Full Map Details Card */}
        {(selectedMarker || selectedCityFocus) && (
          <div className="z-20 pointer-events-auto absolute top-3 left-3 right-3 sm:right-auto sm:w-[min(410px,calc(100%-1.5rem))] max-h-[calc(100%-5.5rem)] overflow-y-auto rounded-xl border border-slate-700 bg-[#090E18]/95 p-3 text-xs shadow-2xl space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sky-400 inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {selectedMarker
                  ? `${plainMarkerKind(selectedMarker.kind)} · ${selectedMarker.region}`
                  : `City Map Details · ${selectedCityFocus?.name}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedMarker(null);
                  setSelectedCityFocus(null);
                  setShowFullDetails(false);
                }}
                className="text-slate-400 hover:text-white text-[11px] shrink-0"
              >
                Close
              </button>
            </div>

            <div className="font-semibold text-slate-100 leading-snug">
              {selectedMarker ? selectedMarker.title : selectedCityFocus?.name}
            </div>

            {selectedMarker && (
              <>
                <div className="text-[11px] font-medium text-amber-400">
                  {selectedMarker.impactLabel}
                </div>
                <div className={`text-[11px] text-slate-300 ${showFullDetails ? 'leading-relaxed' : 'line-clamp-2'}`}>
                  {selectedMarker.detail}
                </div>
              </>
            )}

            {/* Detailed Geographic & Raised 3D Building Telemetry */}
            {activeDetailsHub && (
              <div className="p-2 rounded-lg border border-slate-800 bg-[#0D1422] space-y-1 text-[11px] text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Coordinates:</span>
                  <span className="font-mono text-slate-100">
                    {formatCoordsLabel(
                      selectedMarker ? selectedMarker.lat : activeDetailsHub.lat,
                      selectedMarker ? selectedMarker.lon : activeDetailsHub.lon
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Elevation &amp; Land:</span>
                  <span className="text-sky-300 truncate ml-2">{activeDetailsHub.elevationLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">3D Buildings Here:</span>
                  <span className="text-emerald-300 font-medium">
                    {showBuildings ? `${activeDetailsHub.buildingCount} raised blocks` : 'Turned Off'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 pt-0.5">
                  {activeDetailsHub.terrainNote}
                </div>
              </div>
            )}

            {/* Expanded Full Details Drawer (Works on every page & in Full Screen) */}
            {showFullDetails && (
              <div className="p-2.5 rounded-lg border border-blue-500/40 bg-[#0B1220] space-y-2 text-[11px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="font-semibold text-blue-300">Complete Location &amp; Safety Details</span>
                  {selectedMarker && (
                    <span className="font-mono text-[10px] text-slate-400">ID: {selectedMarker.id}</span>
                  )}
                </div>

                {selectedMarker ? (
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    <div className="p-1.5 rounded bg-[#0D1422] border border-slate-800">
                      <div className="text-slate-400">Type</div>
                      <div className="font-medium text-slate-100">{plainMarkerKind(selectedMarker.kind)}</div>
                    </div>
                    <div className="p-1.5 rounded bg-[#0D1422] border border-slate-800">
                      <div className="text-slate-400">Risk Level</div>
                      <div className="font-medium text-amber-300">{plainSeverity(selectedMarker.severity)}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-300 leading-relaxed">
                    Focused on <span className="font-medium text-slate-100">{selectedCityFocus?.name}</span>.
                    Satellite terrain, elevation contours, and {showBuildings ? `${selectedCityFocus?.buildingCount ?? 0} raised 3D city blocks` : 'city markers'} are mapped here.
                  </p>
                )}

                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-slate-300">
                    Nearby Live Alerts ({nearbyAlerts.length})
                  </div>
                  {nearbyAlerts.length === 0 ? (
                    <div className="text-[10px] text-slate-400">No active public alerts right next to this pin.</div>
                  ) : (
                    <div className="space-y-1">
                      {nearbyAlerts.map((al) => (
                        <div key={al.id} className="p-1.5 rounded bg-[#0D1422] border border-slate-800">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium text-slate-100 truncate">{al.title}</span>
                            <span className="text-[10px] text-amber-300 shrink-0">{plainSeverity(al.severity)}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{al.message}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-slate-300">
                    Nearby Hospitals &amp; Shelters ({nearbyResources.length})
                  </div>
                  {nearbyResources.length === 0 ? (
                    <div className="text-[10px] text-slate-400">Open Hospitals &amp; Shelters to view full national aid centers.</div>
                  ) : (
                    <div className="space-y-1">
                      {nearbyResources.map((res) => (
                        <div key={res.id} className="p-1.5 rounded bg-[#0D1422] border border-slate-800">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium text-slate-100 truncate">{res.name}</span>
                            <span className="text-[10px] text-emerald-300 shrink-0">{plainReliefStatus(res.status)}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {res.quantity.toLocaleString()} {res.unit} · Contact: {res.contact}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  const lat = selectedMarker ? selectedMarker.lat : selectedCityFocus!.lat;
                  const lon = selectedMarker ? selectedMarker.lon : selectedCityFocus!.lon;
                  if (!showBuildings) setShowBuildings(true);
                  setAutoRotate(false);
                  focusGoalFnRef.current?.(lat, lon, 2.38);
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-sky-500/50 bg-sky-600/20 text-sky-200 text-[11px] font-medium hover:bg-sky-600/30 inline-flex items-center gap-1"
              >
                <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Zoom to 3D Buildings</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFullDetails((v) => !v)}
                className="min-h-[32px] px-3 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 inline-flex items-center gap-1"
              >
                <Info className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showFullDetails ? 'Hide Details' : 'Open Details'}</span>
              </button>

              {onSelectModule && (
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedMarker ? selectedMarker.targetModule : cityTargetModule;
                    setExpanded(false);
                    setShowFullDetails(false);
                    onSelectModule(target);
                  }}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-700 bg-[#0D1422] text-slate-200 text-[11px] font-medium hover:bg-slate-800 inline-flex items-center gap-1"
                >
                  <span>
                    Go to {plainTargetModuleLabel(selectedMarker ? selectedMarker.targetModule : cityTargetModule)}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
        <div className="z-20 absolute bottom-2.5 left-1/2 -translate-x-1/2 w-[min(860px,96%)] flex flex-col items-center pointer-events-none">
          <button
            type="button"
            onClick={() => setDockCollapsed((c) => !c)}
            className="pointer-events-auto mb-1 px-2.5 py-1 rounded-t-lg border border-b-0 border-slate-700 bg-[#090E18]/95 text-[10px] font-medium text-slate-300 hover:text-white inline-flex items-center gap-1"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3 h-3" aria-hidden="true" />
                <span>Show Map Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" aria-hidden="true" />
                <span>Hide Map Controls</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="pointer-events-auto w-full rounded-xl border border-slate-700/90 bg-[#090E18]/95 px-2.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shadow-xl">
              <div className="flex flex-wrap items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-slate-400 mr-1 hidden sm:inline" aria-hidden="true" />
                {layerModes.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLayerFilter(mode)}
                    className={`min-h-[30px] px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      layerFilter === mode
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {mode === 'all'
                      ? `All (${markers.length})`
                      : mode === 'alert'
                      ? 'Alerts'
                      : mode === 'disaster'
                      ? 'Disasters'
                      : mode === 'incident'
                      ? 'Emergencies'
                      : mode === 'relief'
                      ? 'Hospitals & Shelters'
                      : 'Cyber'}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMapStyle((s) => (s === 'satellite' ? 'dark' : 'satellite'))}
                  className={`min-h-[30px] px-2.5 py-1 rounded-md border text-[11px] font-medium inline-flex items-center gap-1 ${
                    mapStyle === 'satellite'
                      ? 'border-sky-500/60 bg-sky-600/20 text-sky-200'
                      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {mapStyle === 'satellite' ? (
                    <Satellite className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <Globe className="w-3 h-3" aria-hidden="true" />
                  )}
                  <span>{mapStyle === 'satellite' ? 'Satellite Map' : 'Dark Map'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowBuildings((b) => !b)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-md border text-[11px] font-medium inline-flex items-center gap-1 ${
                    showBuildings
                      ? 'border-emerald-500/60 bg-emerald-600/20 text-emerald-200'
                      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Building2 className="w-3 h-3" aria-hidden="true" />
                  <span>3D Buildings: {showBuildings ? 'On' : 'Off'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAutoRotate((v) => !v)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-md border text-[11px] font-medium ${
                    autoRotate
                      ? 'border-blue-500/60 bg-blue-600/20 text-blue-300'
                      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Spin: {autoRotate ? 'Auto' : 'Paused'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedMarker(null);
                    setSelectedCityFocus(null);
                    setShowFullDetails(false);
                    setShowMapOverview(false);
                    setSearchNotice(null);
                    resetCamFnRef.current?.();
                  }}
                  aria-label="Reset 3D camera"
                  className="min-h-[30px] px-2.5 py-1 rounded-md border border-slate-700 text-[11px] text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Focus Strip for Touch / Keyboard Jump to Cities & Hotspots */}
      <div className="px-3 py-2 border-t border-slate-800 bg-[#0A0F1A] flex items-center gap-1.5 overflow-x-auto shrink-0">
        <span className="text-[11px] text-slate-400 shrink-0 mr-1">
          Quick jump:
        </span>
        {filteredMarkers.length === 0 ? (
          <span className="text-[11px] text-slate-500">No items in this category.</span>
        ) : (
          filteredMarkers.slice(0, 8).map((m) => (
            <button
              key={`${m.kind}-${m.id}`}
              type="button"
              onClick={() => handleFocusMarker(m, false)}
              className={`min-h-[30px] px-2.5 py-1 rounded-md border text-[11px] whitespace-nowrap shrink-0 transition-colors ${
                selectedMarker?.id === m.id && selectedMarker?.kind === m.kind
                  ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                  : 'border-slate-800 bg-[#0D1422] text-slate-300 hover:border-slate-700'
              }`}
            >
              {m.region.split(',')[0]} · {plainMarkerKind(m.kind)}
            </button>
          ))
        )}
        <span className="text-slate-700 mx-1" aria-hidden="true">|</span>
        {CITY_HUBS.slice(0, 4).map((hub) => (
          <button
            key={hub.key}
            type="button"
            onClick={() => handleFocusCity(hub, true)}
            className={`min-h-[30px] px-2.5 py-1 rounded-md border text-[11px] whitespace-nowrap shrink-0 transition-colors inline-flex items-center gap-1 ${
              selectedCityFocus?.key === hub.key
                ? 'border-sky-500 bg-sky-600/20 text-sky-200'
                : 'border-slate-800 bg-[#0D1422] text-slate-300 hover:border-slate-700'
            }`}
          >
            <Building2 className="w-3 h-3 text-sky-400" aria-hidden="true" />
            <span>{hub.name.split(' ')[0]} 3D</span>
          </button>
        ))}
      </div>
    </div>
  );
};

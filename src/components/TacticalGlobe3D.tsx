import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
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

// Simplified continental polygons [lon, lat] for crisp zero-404 procedural Earth texture
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
  if (r.includes('sendai') || r.includes('japan') || r.includes('tokyo'))
    return { lat: 38.27, lon: 140.87 };
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
  if (r.includes('windows server')) return { lat: 39.04, lon: -77.49 };
  if (r.includes('windows 11')) return { lat: 47.61, lon: -122.33 };
  if (r.includes('android') || r.includes('mobile')) return { lat: 35.68, lon: 139.77 };
  if (r.includes('ot') || r.includes('scada')) return { lat: 48.85, lon: 9.18 };
  if (r.includes('global')) return { lat: 24.0, lon: 18.0 };
  return { lat: 22.0, lon: 48.0 };
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

function createProceduralEarthTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Deep bathymetric ocean gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
  oceanGrad.addColorStop(0, '#091529');
  oceanGrad.addColorStop(0.5, '#060d1c');
  oceanGrad.addColorStop(1, '#081326');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, w, h);

  // Subtle lat/lon graticule lines
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

  // Equator highlight
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.22)';
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  // Continental silhouettes
  ctx.fillStyle = '#152845';
  ctx.strokeStyle = '#3b6ea5';
  ctx.lineWidth = 1.6;
  for (const poly of CONTINENT_POLYGONS) {
    ctx.beginPath();
    poly.forEach(([lon, lat], idx) => {
      const x = ((lon + 180) / 360) * w;
      const y = ((90 - lat) / 180) * h;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
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
  const [autoRotate, setAutoRotate] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMarker, setSelectedMarker] = useState<GlobeMarkerItem | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

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
        impactLabel: `${f.gridExposureMw} MW · ${f.populationAtRisk} at risk`,
        detail: `${f.category} · ${f.metric} (${f.confidencePct}% conf)`,
        lat: coords.lat + (idx % 2 === 0 ? 0.6 : -0.6),
        lon: coords.lon + (idx % 2 === 0 ? -0.6 : 0.6),
        targetModule: 'disaster',
      });
    });

    incidents.slice(0, 6).forEach((inc, idx) => {
      const coords = resolveLatLon(inc.region, inc.locationCoords);
      const pop = inc.exposedPopulation ? `${inc.exposedPopulation.toLocaleString()} exposed` : 'Active impact zone';
      items.push({
        id: inc.id,
        kind: 'incident',
        title: inc.title,
        region: inc.region,
        severity: inc.severity,
        impactLabel: `${pop} · ${inc.status}`,
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
          impactLabel: `${al.category} Alert · ${al.channel}`,
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
            impactLabel: `${t.affectedHosts} endpoints · ${t.vector}`,
            detail: `MITRE ${t.mitreId} · IOC ${t.ioc}`,
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
        title: `${r.kind}: ${r.name}`,
        region: r.region,
        severity: r.status === 'Full' ? 'High' : r.status === 'Limited' ? 'Moderate' : 'Low',
        impactLabel: `${r.quantity.toLocaleString()} ${r.unit} · ${r.status}`,
        detail: `Contact: ${r.contact} · Assigned: ${r.allocatedTo}`,
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
  const focusGoalFnRef = useRef<((lat: number, lon: number) => void) | null>(null);
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
    scene.fog = new THREE.FogExp2(0x050912, 0.045);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    // Focus APAC & Eurasia/Americas arc nicely on boot
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

    // Warm/cool 3-point lighting rig
    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x091124, 0.9);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.85);
    keyLight.position.set(6, 5, 6);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x3b82f6, 1.0);
    rimLight.position.set(-6, -2, -5);
    scene.add(rimLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 2.8;
    controls.maxDistance = 8.0;
    controls.autoRotateSpeed = 0.45;

    let hasActiveGoal = false;
    controls.addEventListener('start', () => {
      hasActiveGoal = false;
    });

    const GLOBE_RADIUS = 1.8;

    // 1. Procedural PBR Earth Sphere
    const earthTexture = createProceduralEarthTexture();
    earthTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 48);
    const earthMat = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.72,
      metalness: 0.14,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earthMesh);

    // 2. Subtle Orbital Wireframe Meridian Cage & Atmospheric Halo
    const cageGeo = new THREE.SphereGeometry(GLOBE_RADIUS + 0.008, 24, 16);
    const cageMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
    });
    const cageMesh = new THREE.Mesh(cageGeo, cageMat);
    scene.add(cageMesh);

    const haloGeo = new THREE.SphereGeometry(GLOBE_RADIUS + 0.14, 48, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    scene.add(haloMesh);

    // 3. Instanced Ambient Telemetry Starfield (> 20 items via InstancedMesh)
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

    // Shared marker sub-geometries (reused cleanly across markers)
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

        // 4-part Composite Marker Group (Base Ring + Shockwave Ring + Column + Beacon Crystal + Hit Proxy)
        const markerGroup = new THREE.Group();
        markerGroup.position.copy(_pos).addScaledVector(_norm, 0.012);
        markerGroup.quaternion.setFromUnitVectors(_up, _norm);

        // Part 1: Impact Footprint Ring
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

        // Part 2: Animated Impact Shockwave Ring
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

        // Part 3: Vertical Telemetry / Severity Column
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

        // Part 4: Beacon Crown Crystal
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

        // Part 5: Raycast Hit Proxy (Layer 1)
        const proxy = new THREE.Mesh(hitGeo, hitMat);
        proxy.position.y = colHeight * 0.55;
        proxy.layers.set(1);
        proxy.userData.markerItem = item;
        markerGroup.add(proxy);
        hitProxies.push(proxy);

        markersGroup.add(markerGroup);
      });

      // Elevated correlation arcs between active disaster/incident/alert hotspots
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

    focusGoalFnRef.current = (lat: number, lon: number) => {
      latLonToVec3(lat, lon, 4.35, _camGoal);
      hasActiveGoal = true;
    };

    resetCamFnRef.current = () => {
      _camGoal.set(-2.3, 2.2, 4.4);
      hasActiveGoal = true;
    };

    // Dedicated Layer-1 Raycaster for fast pointer click/tap selection
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointerNdc = new THREE.Vector2();
    let downPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (dist > 7) return; // Was a drag/orbit gesture, not a click

      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;

      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(hitProxies, false);
      if (hits.length > 0) {
        const marker = hits[0].object.userData.markerItem as GlobeMarkerItem | undefined;
        if (marker) {
          setSelectedMarker(marker);
          setAutoRotate(false);
          latLonToVec3(marker.lat, marker.lon, 4.2, _camGoal);
          hasActiveGoal = true;
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // ResizeObserver keeps canvas razor-sharp when switching Mobile/Windows layout
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

      // Animate shockwaves & beacon crystals smoothly without allocations
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
      earthGeo.dispose();
      earthMat.dispose();
      earthTexture.dispose();
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

  // Refresh 3D markers whenever role data or layer filter updates
  useEffect(() => {
    syncMarkersFnRef.current?.();
  }, [filteredMarkers]);

  const handleFocusMarker = (m: GlobeMarkerItem) => {
    setSelectedMarker(m);
    setAutoRotate(false);
    focusGoalFnRef.current?.(m.lat, m.lon);
  };

  const handleLocationSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    const matchedMarker = markers.find(
      (m) =>
        m.region.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
    );
    if (matchedMarker) {
      handleFocusMarker(matchedMarker);
      return;
    }
    const coords = resolveLatLon(q, q);
    setAutoRotate(false);
    focusGoalFnRef.current?.(coords.lat, coords.lon);
  };

  const layerModes = [
    'all',
    'alert',
    'disaster',
    'incident',
    ...(resources.length > 0 ? (['relief'] as const) : []),
    ...(showCyber ? (['cyber'] as const) : []),
  ] as const;

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
            3D Global Disaster, Alerts &amp; Relief Theater
          </span>
          <span className="hidden md:inline text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            Sample &amp; Live Markers
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] font-mono text-slate-400">
          <span className="text-red-400">Red: High Risk</span>
          <span className="text-amber-400">Orange: Medium/Alert</span>
          <span className="text-emerald-400">Green: Low</span>
          {resources.length > 0 && <span className="text-cyan-400">Cyan: Relief/Hospitals</span>}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Exit fullscreen 3D map' : 'Fullscreen 3D map'}
            className="min-h-[28px] px-2 py-1 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1"
          >
            {expanded ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Minimize</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Expand</span>
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
                Tactical Alert &amp; Impact Feed (WebGL Fallback Mode)
              </div>
              <p className="text-[11px] text-slate-400">
                3D WebGL acceleration is disabled in this browser context. Select any active hotspot below or switch to 2D Map view.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto my-2">
              {filteredMarkers.slice(0, 6).map((m) => (
                <button
                  key={`${m.kind}-${m.id}`}
                  type="button"
                  onClick={() => handleFocusMarker(m)}
                  className="p-2.5 rounded-lg border border-slate-800 bg-[#0A0F1A] hover:border-blue-500/60 text-left text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-blue-400">{m.id} · {m.kind.toUpperCase()}</span>
                    <span className="text-amber-400">{m.severity}</span>
                  </div>
                  <div className="font-medium text-slate-100 truncate">{m.title}</div>
                  <div className="text-[11px] text-slate-400 truncate">{m.region}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Compact Top-Right Location Search */}
        <form
          onSubmit={handleLocationSearch}
          className="hidden sm:flex absolute top-3 right-3 items-center gap-1 rounded-lg border border-slate-700/90 bg-[#090E18]/95 p-1 shadow-lg"
        >
          <Search className="w-3.5 h-3.5 text-slate-400 ml-1.5" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Fly to city or ID..."
            aria-label="Search 3D globe location"
            className="w-32 bg-transparent px-1.5 py-0.5 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            className="px-2 py-0.5 rounded bg-blue-600 text-[10px] font-medium text-white hover:bg-blue-700"
          >
            Go
          </button>
        </form>

        {/* Selected Marker Inspector Card */}
        {selectedMarker && (
          <div className="absolute top-3 left-3 right-3 sm:right-auto sm:max-w-sm rounded-xl border border-slate-700 bg-[#090E18]/95 p-3 text-xs shadow-2xl space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-blue-400">
                {selectedMarker.id} · {selectedMarker.kind.toUpperCase()}
              </span>
              <button
                type="button"
                onClick={() => setSelectedMarker(null)}
                className="text-slate-400 hover:text-white text-[11px]"
              >
                Dismiss
              </button>
            </div>
            <div className="font-semibold text-slate-100 leading-snug">
              {selectedMarker.title}
            </div>
            <div className="text-[11px] font-mono text-amber-400">
              {selectedMarker.impactLabel}
            </div>
            <div className="text-[11px] text-slate-400 line-clamp-2">
              {selectedMarker.detail}
            </div>
            {onSelectModule && (
              <button
                type="button"
                onClick={() => onSelectModule(selectedMarker.targetModule)}
                className="mt-1 min-h-[34px] px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
              >
                Open Module
              </button>
            )}
          </div>
        )}

        {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 w-[min(740px,95%)] flex flex-col items-center pointer-events-none">
          <button
            type="button"
            onClick={() => setDockCollapsed((c) => !c)}
            className="pointer-events-auto mb-1 px-2.5 py-1 rounded-t-lg border border-b-0 border-slate-700 bg-[#090E18]/95 text-[10px] font-mono text-slate-300 hover:text-white inline-flex items-center gap-1"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3 h-3" aria-hidden="true" />
                <span>Show 3D Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" aria-hidden="true" />
                <span>Hide Controls</span>
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
                      ? 'Impacts'
                      : mode === 'relief'
                      ? 'Hospitals & Relief'
                      : 'Cyber'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAutoRotate((v) => !v)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-md border text-[11px] font-medium ${
                    autoRotate
                      ? 'border-blue-500/60 bg-blue-600/20 text-blue-300'
                      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Orbit: {autoRotate ? 'Auto' : 'Manual'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMarker(null);
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

      {/* Quick Focus Strip for Touch / Keyboard Jump to Hotspots */}
      <div className="px-3 py-2 border-t border-slate-800 bg-[#0A0F1A] flex items-center gap-1.5 overflow-x-auto shrink-0">
        <span className="text-[11px] font-mono text-slate-500 shrink-0 mr-1">
          Fly to hotspot:
        </span>
        {filteredMarkers.slice(0, 10).map((m) => (
          <button
            key={`${m.kind}-${m.id}`}
            type="button"
            onClick={() => handleFocusMarker(m)}
            className={`min-h-[30px] px-2.5 py-1 rounded-md border text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors ${
              selectedMarker?.id === m.id && selectedMarker?.kind === m.kind
                ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                : 'border-slate-800 bg-[#0D1422] text-slate-300 hover:border-slate-700'
            }`}
          >
            {m.id} · {m.region.split(',')[0]}
          </button>
        ))}
      </div>
    </div>
  );
};

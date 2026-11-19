import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { PLATFORM_DATA_SOURCES, WEATHER_GRID_STATIONS } from './backend/datasets';
import {
  AirQualityCityReading,
  fetchSupplementalLiveFeeds,
  SpaceWeatherReading,
} from './backend/liveFeeds';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  text?: string;
}

interface AssistantRequestBody {
  messages?: AssistantMessage[];
  contextSummary?: string;
  language?: string;
  knowledgeBase?: string;
  userRole?: 'citizen' | 'rescue' | 'administrator';
  emergencyMode?: boolean;
  model?: string;
}

interface LiveDisasterItem {
  id: string;
  title: string;
  category: 'Seismic' | 'Cyclone' | 'Wildfire' | 'Flood' | 'Grid Stress';
  severity: 'Critical' | 'High' | 'Moderate' | 'Low';
  region: string;
  lat: number;
  lng: number;
  metric: string;
  populationAtRisk: string;
  summary: string;
  timeLabel: string;
  sourceName: 'CurrentDisaster.com' | 'GDACS (UN/EU)' | 'NASA EONET' | 'USGS Seismic';
  sourceUrl: string;
  affectedRadiusKm: number;
  safeZoneRadiusKm: number;
}

interface EarthquakeSummary {
  id: string;
  magnitude: number;
  place: string;
  depthKm: number;
  timeMs: number;
  url?: string;
}

interface LiveDisastersPayload {
  fetchedAt: string;
  incidents: LiveDisasterItem[];
  sources: {
    currentDisaster: 'live' | 'unavailable';
    gdacs: 'live' | 'unavailable';
    nasaEonet: 'live' | 'unavailable';
    usgs: 'live' | 'unavailable';
  };
}

interface LiveDisastersInternal extends LiveDisastersPayload {
  earthquakes: EarthquakeSummary[];
}

interface RealtimeFeedPayload {
  fetchedAt: string;
  earthquakes: EarthquakeSummary[];
  liveDisasters: LiveDisasterItem[];
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
  spaceWeather: SpaceWeatherReading | null;
  airQuality: AirQualityCityReading[];
  sources: {
    usgs: 'live' | 'unavailable';
    cisa: 'live' | 'unavailable';
    weather: 'live' | 'unavailable';
    currentDisaster: 'live' | 'unavailable';
    gdacs: 'live' | 'unavailable';
    nasaEonet: 'live' | 'unavailable';
    noaaSpaceWeather: 'live' | 'unavailable';
    openMeteoAqi: 'live' | 'unavailable';
  };
}

const NEXORA_TRAINING_PLAYBOOK = `
NEXORA AI PLATFORM TRAINING & OPERATIONAL KNOWLEDGE:
- Platform Identity: NEXORA AI ("Predict. Protect. Respond. Empower.") — an integrated AI disaster prediction, emergency response, Google Maps situational awareness, and cybersecurity intelligence platform.
- Module Directory (guide users to exact module when helpful):
  * Module 01 (Command Center & Google Maps): Live disaster/cyber overview, interactive Google Maps showing disaster risk zones, alerts, hospitals, shelters, and incident pins.
  * Module 02 (Disaster Prediction & Monitoring): Environmental risk scoring (Flood, Cyclone, Wildfire, Seismic, Grid Stress) + live multi-source disaster sync.
  * Module 03 (Cybersecurity & Threat Detection): Passive phishing URL/SMS/log analyzer, MITRE ATT&CK telemetry, containment queue.
  * Module 04 (NEXORA AI Assistant): Multilingual preparedness, first-aid, triage, cyber defense, safety checklists, and custom SOP training knowledge base.
  * Module 05 (Emergency Response & Incident Ops): Citizen SOS reporting, pre/post imagery damage assessment, START patient triage, and rescue unit dispatch.
  * Module 06 (Rescue & Relief Management): Hospitals, open ICU/trauma beds, evacuation shelters, potable water/supply packs, and ambulance fleets.
  * Module 07 (Data Analytics & Intelligence): 24h incident & cyber mitigation trends and exportable intelligence briefs.
  * Module 08 (Secure Alert & Notification System): Official verified hazard/cyber alerts and SMS/Email notification preferences.
  * Module 09 (Admin & System Management): RBAC user governance, AI model config, and immutable audit logs.
- Core Domain Protocols:
  * Flood: Never walk/drive in floodwaters; 15cm sweeps adults, 30cm floats cars. Move to higher floors/elevation, shut off main power breakers if water enters premises, avoid downed lines.
  * Seismic & Tsunami: Drop, Cover, Hold On. After shaking stops, evacuate coastal zones >=30m elevation or >=2km inland without waiting for sirens; check gas odors before shutting valves.
  * Cyclone: Evacuate storm-surge zones early, shelter in interior windowless rooms, avoid venturing out during the calm eye.
  * Wildfire: Follow evacuation orders immediately, seal vents, use N95/P100 masks for smoke, keep access roads clear for fire units.
  * First Aid & START Triage: Severe bleeding -> firm direct pressure + tourniquet 5cm above limb hemorrhage (record time). Burns -> 20min cool running water (no ice). START triage -> Green (ambulatory), Red-Immediate (RR>30, cap refill>2s, no radial pulse, unable to follow commands), Yellow-Delayed, Black-Expectant. Always advise dialing 112/911 for life-threatening emergencies; clarify this is guidance, not a medical diagnosis.
  * Cybersecurity: Never tap unknown APK/relief links in SMS/WhatsApp; verify exact domain spelling and HTTPS; isolate compromised OT/SCADA or CAD endpoints onto clean VLANs; scan suspect links in Module 03.
`.trim();

const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';
const ALLOWED_GEMINI_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
const FRESH_CACHE_MS = 60_000;
const STALE_CACHE_MS = 10 * 60_000;
const EXTERNAL_FETCH_TIMEOUT_MS = 4500;

function resolveGeminiModel(requested?: string): string {
  if (typeof requested === 'string' && ALLOWED_GEMINI_MODELS.has(requested.trim())) {
    return requested.trim();
  }
  return DEFAULT_GEMINI_MODEL;
}

function parseFiniteNum(val: unknown, fallback: number): number {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function getGeminiClient(): GoogleGenAI {
  const rawKey = process.env.GEMINI_API_KEY || '';
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, '');
  if (!apiKey || /^MY_GEMINI/i.test(apiKey)) {
    throw new Error(
      'GEMINI_API_KEY is not configured in the server environment. Please add a valid key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isTransientCapacityError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /503|UNAVAILABLE|high demand|RESOURCE_EXHAUSTED|429|overloaded|ETIMEDOUT|ECONNRESET|fetch failed/i.test(
    msg
  );
}

function isAuthOrKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /GEMINI_API_KEY|API key not valid|API_KEY_INVALID|API_KEY_EXPIRED|PERMISSION_DENIED|UNAUTHENTICATED|API key expired/i.test(
    msg
  );
}

function formatGeminiError(
  err: unknown,
  fallbackMsg: string
): { statusCode: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err || fallbackMsg);
  if (raw.includes('GEMINI_API_KEY')) {
    return { statusCode: 503, message: raw };
  }
  let cleanMessage = raw;
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; code?: number; status?: string };
    };
    if (parsed?.error?.message) {
      cleanMessage = parsed.error.message;
    }
  } catch {
    // keep raw message
  }
  if (
    /API key not valid|API_KEY_INVALID|API_KEY_EXPIRED|PERMISSION_DENIED|UNAUTHENTICATED|API key expired/i.test(
      cleanMessage
    )
  ) {
    return {
      statusCode: 400,
      message:
        'Gemini API key is invalid or expired. Please generate a new key in Google AI Studio and update GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  const statusCode = isTransientCapacityError(raw) ? 503 : 500;
  return { statusCode, message: cleanMessage || fallbackMsg };
}

function applyFastModelConfig<
  T extends Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
>(model: string, params: T): T {
  const baseConfig = { ...(params.config || {}) };
  if (model === 'gemini-4-hydrogen' && !baseConfig.thinkingConfig) {
    baseConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }
  return { ...params, config: baseConfig };
}

async function generateWithFallback(
  ai: GoogleGenAI,
  requestedModel: string | undefined,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
) {
  const primaryModel = resolveGeminiModel(requestedModel);
  try {
    return await ai.models.generateContent({
      model: primaryModel,
      ...applyFastModelConfig(primaryModel, params),
    });
  } catch (err) {
    if (primaryModel !== 'gemini-3.1-flash-lite' && !isAuthOrKeyError(err)) {
      await new Promise((r) => setTimeout(r, 150));
      return await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        ...applyFastModelConfig('gemini-3.1-flash-lite', params),
      });
    }
    throw err;
  }
}

async function generateStreamWithFallback(
  ai: GoogleGenAI,
  requestedModel: string | undefined,
  params: Omit<Parameters<GoogleGenAI['models']['generateContentStream']>[0], 'model'>
) {
  const primaryModel = resolveGeminiModel(requestedModel);
  try {
    return await ai.models.generateContentStream({
      model: primaryModel,
      ...applyFastModelConfig(primaryModel, params),
    });
  } catch (err) {
    if (primaryModel !== 'gemini-3.1-flash-lite' && !isAuthOrKeyError(err)) {
      await new Promise((r) => setTimeout(r, 150));
      return await ai.models.generateContentStream({
        model: 'gemini-3.1-flash-lite',
        ...applyFastModelConfig('gemini-3.1-flash-lite', params),
      });
    }
    throw err;
  }
}

function buildAssistantRequestPayload(body: AssistantRequestBody) {
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const contextSummary =
    typeof body.contextSummary === 'string' ? body.contextSummary.trim().slice(0, 3500) : '';
  const language =
    typeof body.language === 'string' && body.language.trim()
      ? body.language.trim().slice(0, 40)
      : 'English';
  const knowledgeBase =
    typeof body.knowledgeBase === 'string' ? body.knowledgeBase.trim().slice(0, 3500) : '';
  const userRole =
    body.userRole === 'administrator' || body.userRole === 'rescue'
      ? body.userRole
      : 'citizen';
  const emergencyMode = Boolean(body.emergencyMode);

  const normalizedTurns: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (const m of rawMessages.slice(-10)) {
    const rawText = typeof m.content === 'string' ? m.content : String(m.text || '');
    const text = rawText.trim();
    if (!text) continue;
    const geminiRole: 'user' | 'model' = m.role === 'user' ? 'user' : 'model';
    if (normalizedTurns.length === 0 && geminiRole === 'model') continue;
    const prev = normalizedTurns[normalizedTurns.length - 1];
    if (prev && prev.role === geminiRole) {
      prev.text = `${prev.text}\n\n${text}`;
    } else {
      normalizedTurns.push({ role: geminiRole, text });
    }
  }

  const roleDirective =
    userRole === 'administrator'
      ? 'Operator Role: ADMINISTRATOR — reply clearly, directly, and helpfully.'
      : userRole === 'rescue'
      ? 'Operator Role: RESCUE TEAM — reply clearly, practically, and fast.'
      : 'Operator Role: USER — reply in simple, friendly everyday words anyone can understand.';

  const emergencyDirective = emergencyMode
    ? 'EMERGENCY MODE ACTIVE: Keep emergency answers short and numbered (under 120 words). Tell the user to call local emergency services (112/911) right away if anyone is in danger.'
    : 'Keep answers clear, direct, and easy to read. Use short paragraphs or bullet steps.';

  const systemParts = [
    'You are NEXORA AI Helper — a fast, friendly, all-purpose AI assistant inside NEXORA AI.',
    'IMPORTANT: Answer ALL kinds of questions the user asks — including general knowledge, math, science, coding, writing, translations, daily help, study questions, weather, health/first-aid, cybersecurity/scam checks, and disaster/emergency guidance. Never refuse a normal question just because it is not about disasters.',
    `Write in ${language} unless the user asks you to translate or reply in a different language.`,
    roleDirective,
    emergencyDirective,
    'For live medical emergencies advise dialing 112/911 (note guidance is not a medical diagnosis). Never invent fake official government alerts.',
    'Only bring up NEXORA live alerts/incidents/cyber stats when the user asks about them or when relevant to safety.',
    NEXORA_TRAINING_PLAYBOOK,
    knowledgeBase ? `Custom Safety Rules / Training:\n${knowledgeBase}` : '',
    contextSummary ? `Live Platform Context:\n${contextSummary}` : '',
  ].filter(Boolean);

  const contents = normalizedTurns.map((t) => ({
    role: t.role,
    parts: [{ text: t.text }],
  }));

  return {
    normalizedTurns,
    contents,
    systemInstruction: systemParts.join('\n\n'),
  };
}

function decodeWeatherCode(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 48) return 'Fog / Haze';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Cloudy';
}

async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs = EXTERNAL_FETCH_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NEXORA-AI-LiveFeed/1.0', Accept: 'application/json' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(
  url: string,
  timeoutMs = EXTERNAL_FETCH_TIMEOUT_MS
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NEXORA-AI/1.0)' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

function mapExternalCategory(raw: string): LiveDisasterItem['category'] {
  const t = raw.toLowerCase();
  if (t.includes('fire') || t.includes('wf') || t.includes('wildfire')) return 'Wildfire';
  if (
    t.includes('cyclone') ||
    t.includes('storm') ||
    t.includes('tc') ||
    t.includes('typhoon') ||
    t.includes('hurricane')
  ) {
    return 'Cyclone';
  }
  if (t.includes('flood') || t.includes('fl') || t.includes('tsunami')) return 'Flood';
  if (
    t.includes('eq') ||
    t.includes('quake') ||
    t.includes('seismic') ||
    t.includes('volcano') ||
    t.includes('vo')
  ) {
    return 'Seismic';
  }
  return 'Grid Stress';
}

function mapExternalSeverity(raw: string): LiveDisasterItem['severity'] {
  const s = raw.toLowerCase();
  if (s === 'critical' || s === 'red') return 'Critical';
  if (s === 'high' || s === 'orange') return 'High';
  if (s === 'moderate' || s === 'medium') return 'Moderate';
  return 'Low';
}

function parseCurrentDisasterHtml(html: string): LiveDisasterItem[] {
  const startIdx = html.indexOf('STATIC_EVENTS');
  if (startIdx < 0) return [];
  const bracketStart = html.indexOf('[', startIdx);
  const bracketEnd = html.indexOf('];', bracketStart);
  if (bracketStart < 0 || bracketEnd < 0) return [];
  const block = html.slice(bracketStart, bracketEnd + 1);
  const items: LiveDisasterItem[] = [];
  const objRegex = /\{[^{}]+\}/g;
  let match: RegExpExecArray | null;
  while ((match = objRegex.exec(block)) !== null) {
    const rawObj = match[0];
    const getStr = (key: string) => {
      const m = rawObj.match(new RegExp(`${key}\\s*:\\s*['"]([^'"]*)['"]`));
      return m ? m[1] : '';
    };
    const getNum = (key: string) => {
      const m = rawObj.match(new RegExp(`${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
      return m ? Number(m[1]) : NaN;
    };
    const id = getStr('id');
    const name = getStr('name');
    const type = getStr('type');
    const lat = getNum('lat');
    const lng = getNum('lng');
    const severity = getStr('severity');
    const time = getStr('time') || 'Ongoing';
    const region = getStr('region') || 'Monitored Region';
    const affected = getStr('affected') || 'Assessing';
    const criticality = getNum('criticality');
    if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const sev = mapExternalSeverity(severity);
    const cat = mapExternalCategory(type || name);
    const baseRadius =
      cat === 'Cyclone' ? 85 : cat === 'Seismic' ? 45 : cat === 'Wildfire' ? 22 : cat === 'Flood' ? 25 : 15;
    const mult = sev === 'Critical' ? 1.5 : sev === 'High' ? 1.2 : sev === 'Moderate' ? 0.9 : 0.65;
    const affectedRadiusKm = Math.round(baseRadius * mult);
    items.push({
      id: `CD-${id.toUpperCase()}`,
      title: name,
      category: cat,
      severity: sev,
      region,
      lat,
      lng,
      metric: `${type ? type.toUpperCase() : 'EVENT'} · Index ${Number.isFinite(criticality) ? criticality : 70}/100`,
      populationAtRisk: affected,
      summary: `Tracked via CurrentDisaster.com (${time}) in ${region}.`,
      timeLabel: time,
      sourceName: 'CurrentDisaster.com',
      sourceUrl: 'https://currentdisaster.com/',
      affectedRadiusKm,
      safeZoneRadiusKm: Math.round(affectedRadiusKm * 1.9),
    });
  }
  return items;
}

function estimateGdacsRadiusKm(
  eventType: string,
  alertLevel: string,
  severityVal?: number
): { affectedRadiusKm: number; safeZoneRadiusKm: number } {
  const et = eventType.toUpperCase();
  const levelMult = alertLevel === 'Red' ? 1.5 : alertLevel === 'Orange' ? 1.2 : 0.85;
  const val = typeof severityVal === 'number' && Number.isFinite(severityVal) ? severityVal : 0;

  let affected = 20;
  if (et === 'WF') {
    // Burned area in hectares -> equivalent radius + smoke/ember exclusion buffer
    const burnedKm = val > 0 ? Math.sqrt((val / 100) / Math.PI) : 4;
    affected = Math.max(8, Math.min(65, Math.round((burnedKm * 2.5 + 8) * levelMult)));
  } else if (et === 'EQ') {
    // Seismic felt / structural shaking radius by magnitude
    const mag = val >= 3 ? val : 4.8;
    affected = Math.max(18, Math.min(180, Math.round(Math.pow(10, 0.42 * mag - 0.65))));
  } else if (et === 'TC') {
    // Tropical cyclone gale wind field radius
    const wind = val > 30 ? val : 85;
    affected = Math.max(45, Math.min(190, Math.round((wind * 0.95) * levelMult)));
  } else if (et === 'FL') {
    affected = Math.round(24 * levelMult);
  } else if (et === 'VO') {
    affected = Math.round(35 * levelMult);
  } else {
    affected = Math.round(25 * levelMult);
  }

  return {
    affectedRadiusKm: affected,
    safeZoneRadiusKm: Math.round(affected * 1.85),
  };
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));

  // Basic security headers for all API endpoints
  app.use('/api', (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'nexora-ai-server',
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/maps/config', (_req, res) => {
    const raw =
      process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    const cleaned = raw.trim().replace(/^["']|["']$/g, '');
    const apiKey = /^MY_GOOGLE_MAPS/i.test(cleaned) ? '' : cleaned;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ apiKey });
  });

  // Stale-while-revalidate caches + in-flight request deduplication
  let disastersCache: { freshUntil: number; staleUntil: number; data: LiveDisastersInternal } | null =
    null;
  let inFlightDisasters: Promise<LiveDisastersInternal> | null = null;

  let realtimeCache: { freshUntil: number; staleUntil: number; data: RealtimeFeedPayload } | null =
    null;
  let inFlightRealtime: Promise<RealtimeFeedPayload> | null = null;

  async function refreshLiveDisasters(): Promise<LiveDisastersInternal> {
    if (inFlightDisasters) return inFlightDisasters;

    inFlightDisasters = (async () => {
      const now = Date.now();
      const [cdRes, gdacsRes, eonetRes, usgsRes] = await Promise.allSettled([
        fetchTextWithTimeout('https://currentdisaster.com/'),
        fetchJsonWithTimeout<{
          features?: Array<{
            geometry?: { coordinates?: number[] };
            properties?: {
              eventtype?: string;
              eventid?: number;
              name?: string;
              description?: string;
              htmldescription?: string;
              alertlevel?: string;
              country?: string;
              fromdate?: string;
              severitydata?: {
                severity?: number;
                severitytext?: string;
                severityunit?: string;
              };
              url?: { report?: string };
            };
          }>;
        }>(
          'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;WF;DR&alertlevel=Green;Orange;Red'
        ),
        fetchJsonWithTimeout<{
          events?: Array<{
            id?: string;
            title?: string;
            categories?: Array<{ id?: string; title?: string }>;
            sources?: Array<{ id?: string; url?: string }>;
            geometry?: Array<{
              magnitudeValue?: number;
              magnitudeUnit?: string;
              date?: string;
              coordinates?: number[];
            }>;
          }>;
        }>('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=10'),
        fetchJsonWithTimeout<{
          features?: Array<{
            id?: string;
            properties?: { mag?: number; place?: string; time?: number; url?: string };
            geometry?: { coordinates?: number[] };
          }>;
        }>('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'),
      ]);

      const combined: LiveDisasterItem[] = [];
      const earthquakes: EarthquakeSummary[] = [];

      // 1. GDACS (https://www.gdacs.org — Live Fires, Earthquakes, Cyclones, Floods, Volcanoes)
      if (gdacsRes.status === 'fulfilled' && Array.isArray(gdacsRes.value?.features)) {
        const alertRank = (lvl?: string) =>
          lvl === 'Red' ? 3 : lvl === 'Orange' ? 2 : 1;
        const sortedGdacs = [...gdacsRes.value.features].sort(
          (a, b) => alertRank(b.properties?.alertlevel) - alertRank(a.properties?.alertlevel)
        );

        // Select a balanced multi-hazard mix from GDACS so fires, quakes, floods, cyclones & volcanoes are all live
        const typeQuotas: Record<string, number> = { TC: 3, FL: 3, VO: 2, EQ: 4, WF: 4, DR: 1 };
        const typeCounts: Record<string, number> = {};
        const selectedGdacs: typeof sortedGdacs = [];

        for (const f of sortedGdacs) {
          const et = String(f.properties?.eventtype || 'EQ').toUpperCase();
          const quota = typeQuotas[et] ?? 2;
          const used = typeCounts[et] ?? 0;
          if (used >= quota) continue;
          typeCounts[et] = used + 1;
          selectedGdacs.push(f);
          if (selectedGdacs.length >= 15) break;
        }

        selectedGdacs.forEach((f, idx) => {
          const coords = f.geometry?.coordinates;
          const p = f.properties;
          if (!p || !Array.isArray(coords) || coords.length < 2) return;
          const lng = Number(coords[0]);
          const lat = Number(coords[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          const alertLevel = String(p.alertlevel || 'Green');
          const eventType = String(p.eventtype || 'EQ').toUpperCase();
          const country = String(p.country || 'International Zone').trim() || 'International Zone';
          const sevVal = p.severitydata?.severity;
          const sevText = p.severitydata?.severitytext?.trim();
          const radii = estimateGdacsRadiusKm(eventType, alertLevel, sevVal);

          combined.push({
            id: `GDACS-${eventType}-${p.eventid ?? idx}`,
            title: String(p.name || p.description || `${eventType} Disaster Alert`),
            category: mapExternalCategory(eventType),
            severity: mapExternalSeverity(alertLevel),
            region: country,
            lat,
            lng,
            metric: sevText
              ? `GDACS ${alertLevel} · ${sevText}`
              : `GDACS ${alertLevel} Alert · ${eventType}`,
            populationAtRisk:
              alertLevel === 'Red'
                ? 'High Exposure'
                : alertLevel === 'Orange'
                ? 'Elevated Risk'
                : 'Monitoring',
            summary: String(
              p.htmldescription ||
                sevText ||
                p.description ||
                `Live GDACS ${alertLevel} alert in ${country}.`
            )
              .replace(/<[^>]+>/g, '')
              .trim(),
            timeLabel: p.fromdate ? String(p.fromdate).slice(0, 10) : 'Live',
            sourceName: 'GDACS (UN/EU)',
            sourceUrl: p.url?.report || 'https://www.gdacs.org/',
            affectedRadiusKm: radii.affectedRadiusKm,
            safeZoneRadiusKm: radii.safeZoneRadiusKm,
          });
        });
      }

      // 2. NASA EONET (Real-Time Cyclones, Wildfires, Floods, Volcanoes)
      if (eonetRes.status === 'fulfilled' && Array.isArray(eonetRes.value?.events)) {
        eonetRes.value.events.slice(0, 5).forEach((ev, idx) => {
          const geom =
            Array.isArray(ev.geometry) && ev.geometry.length > 0
              ? ev.geometry[ev.geometry.length - 1]
              : null;
          const coords = geom?.coordinates;
          if (!Array.isArray(coords) || coords.length < 2) return;
          const lng = Number(coords[0]);
          const lat = Number(coords[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          const catTitle = ev.categories?.[0]?.title || 'Natural Event';
          const category = mapExternalCategory(catTitle);
          const magStr =
            typeof geom?.magnitudeValue === 'number'
              ? `${geom.magnitudeValue} ${geom.magnitudeUnit || ''}`.trim()
              : catTitle;
          const affectedRadiusKm =
            category === 'Cyclone' ? 95 : category === 'Wildfire' ? 24 : category === 'Flood' ? 25 : 30;
          combined.push({
            id: `EONET-${String(ev.id || idx).replace(/[^A-Za-z0-9_-]/g, '')}`,
            title: String(ev.title || 'Active Natural Event').replace(/&amp;/g, '&'),
            category,
            severity: category === 'Cyclone' ? 'High' : 'Moderate',
            region:
              String(ev.title || 'NASA Monitored Area')
                .split(',')
                .slice(-2)
                .join(',')
                .trim() || 'Monitored Area',
            lat,
            lng,
            metric: `NASA EONET · ${magStr}`,
            populationAtRisk: 'Active Tracking',
            summary: `Live open natural event tracked by NASA EONET (${catTitle}).`,
            timeLabel: geom?.date ? String(geom.date).slice(0, 10) : 'Open',
            sourceName: 'NASA EONET',
            sourceUrl: ev.sources?.[0]?.url || 'https://eonet.gsfc.nasa.gov/',
            affectedRadiusKm,
            safeZoneRadiusKm: Math.round(affectedRadiusKm * 1.85),
          });
        });
      }

      // 3. USGS M4.5+ Real-Time Earthquakes (Fetched once and shared with /api/realtime/feed)
      if (usgsRes.status === 'fulfilled' && Array.isArray(usgsRes.value?.features)) {
        usgsRes.value.features.slice(0, 5).forEach((f, idx) => {
          const coords = f.geometry?.coordinates;
          if (!Array.isArray(coords) || coords.length < 2) return;
          const lng = Number(coords[0]);
          const lat = Number(coords[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          const mag = Number(f.properties?.mag ?? 4.5);
          const depth = Math.round(Number(coords[2] ?? 10));
          const place = String(f.properties?.place || 'Offshore Seismic Zone');
          const url = typeof f.properties?.url === 'string' ? f.properties.url : undefined;
          const affectedRadiusKm = Math.max(20, Math.min(180, Math.round(Math.pow(10, 0.42 * mag - 0.65))));

          earthquakes.push({
            id: String(f.id || `eq-${idx}`),
            magnitude: Number(mag.toFixed(1)),
            place,
            depthKm: depth,
            timeMs: Number(f.properties?.time ?? now),
            url,
          });

          combined.push({
            id: `USGS-${String(f.id || idx).slice(0, 8).toUpperCase()}`,
            title: `M ${mag.toFixed(1)} Earthquake — ${place}`,
            category: 'Seismic',
            severity:
              mag >= 6.2 ? 'Critical' : mag >= 5.5 ? 'High' : mag >= 5.0 ? 'Moderate' : 'Low',
            region: place,
            lat,
            lng,
            metric: `M ${mag.toFixed(1)} · ${depth} km depth`,
            populationAtRisk: mag >= 6.0 ? '250,000+' : 'Regional Monitoring',
            summary: 'Live seismic event reported by USGS Earthquake Hazards Program.',
            timeLabel: 'Past 24h',
            sourceName: 'USGS Seismic',
            sourceUrl: url || 'https://earthquake.usgs.gov/',
            affectedRadiusKm,
            safeZoneRadiusKm: Math.round(affectedRadiusKm * 1.85),
          });
        });
      }

      // 4. CurrentDisaster.com Events
      let cdStatus: 'live' | 'unavailable' = 'unavailable';
      if (cdRes.status === 'fulfilled') {
        const cdItems = parseCurrentDisasterHtml(cdRes.value);
        if (cdItems.length > 0) {
          cdStatus = 'live';
          combined.push(...cdItems.slice(0, 5));
        }
      }

      const data: LiveDisastersInternal = {
        fetchedAt: new Date(now).toISOString(),
        incidents: combined,
        earthquakes,
        sources: {
          currentDisaster: cdStatus,
          gdacs: gdacsRes.status === 'fulfilled' ? 'live' : 'unavailable',
          nasaEonet: eonetRes.status === 'fulfilled' ? 'live' : 'unavailable',
          usgs: usgsRes.status === 'fulfilled' ? 'live' : 'unavailable',
        },
      };

      disastersCache = {
        freshUntil: now + FRESH_CACHE_MS,
        staleUntil: now + STALE_CACHE_MS,
        data,
      };
      return data;
    })().finally(() => {
      inFlightDisasters = null;
    });

    return inFlightDisasters;
  }

  async function getLiveDisasters(forceRefresh = false): Promise<LiveDisastersInternal> {
    const now = Date.now();
    if (!forceRefresh && disastersCache) {
      if (disastersCache.freshUntil > now) return disastersCache.data;
      if (disastersCache.staleUntil > now) {
        void refreshLiveDisasters().catch(() => {});
        return disastersCache.data;
      }
    }
    return refreshLiveDisasters();
  }

  app.get('/api/disasters/live', async (req, res) => {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    try {
      const data = await getLiveDisasters(forceRefresh);
      const payload: LiveDisastersPayload = {
        fetchedAt: data.fetchedAt,
        incidents: data.incidents,
        sources: data.sources,
      };
      res.json(payload);
    } catch {
      res.status(502).json({ error: 'Unable to fetch live disaster feeds right now.' });
    }
  });

  async function refreshRealtimeFeed(forceDisasters = false): Promise<RealtimeFeedPayload> {
    if (inFlightRealtime && !forceDisasters) return inFlightRealtime;

    inFlightRealtime = (async () => {
      const now = Date.now();
      const cities = [
        { city: 'Tokyo', lat: 35.68, lon: 139.77 },
        { city: 'Mumbai', lat: 19.08, lon: 72.88 },
        { city: 'London', lat: 51.51, lon: -0.13 },
        { city: 'New York', lat: 40.71, lon: -74.01 },
      ];
      const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${cities
        .map((c) => c.lat)
        .join(',')}&longitude=${cities
        .map((c) => c.lon)
        .join(',')}&current=temperature_2m,wind_speed_10m,precipitation,weather_code`;

      const [disastersResult, cisaResult, meteoResult, supplementalResult] = await Promise.allSettled([
        getLiveDisasters(forceDisasters),
        fetchJsonWithTimeout<{
          vulnerabilities?: Array<{
            cveID?: string;
            vendorProject?: string;
            product?: string;
            vulnerabilityName?: string;
            dateAdded?: string;
            knownRansomwareCampaignUse?: string;
          }>;
        }>('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'),
        fetchJsonWithTimeout<
          Array<{
            current?: {
              temperature_2m?: number;
              wind_speed_10m?: number;
              precipitation?: number;
              weather_code?: number;
            };
          }>
        >(meteoUrl),
        fetchSupplementalLiveFeeds(forceDisasters),
      ]);

      const disastersData = disastersResult.status === 'fulfilled' ? disastersResult.value : null;
      const supplemental = supplementalResult.status === 'fulfilled' ? supplementalResult.value : null;

      const cyberAdvisories: RealtimeFeedPayload['cyberAdvisories'] =
        cisaResult.status === 'fulfilled' && Array.isArray(cisaResult.value?.vulnerabilities)
          ? [...cisaResult.value.vulnerabilities]
              .sort((a, b) => String(b.dateAdded || '').localeCompare(String(a.dateAdded || '')))
              .slice(0, 5)
              .map((v, idx) => ({
                cveId: String(v.cveID || `CVE-KEV-${idx}`),
                vendor: String(v.vendorProject || 'Vendor'),
                product: String(v.product || 'System'),
                title: String(v.vulnerabilityName || 'Known Exploited Vulnerability'),
                dateAdded: String(v.dateAdded || ''),
                knownRansomware: String(v.knownRansomwareCampaignUse || 'Unknown'),
              }))
          : [];

      const weather: RealtimeFeedPayload['weather'] =
        meteoResult.status === 'fulfilled' && Array.isArray(meteoResult.value)
          ? cities.map((c, idx) => {
              const cur = meteoResult.value[idx]?.current;
              return {
                city: c.city,
                temperatureC: Math.round(Number(cur?.temperature_2m ?? 0)),
                windKmh: Math.round(Number(cur?.wind_speed_10m ?? 0)),
                precipitationMm: Number(Number(cur?.precipitation ?? 0).toFixed(1)),
                condition: decodeWeatherCode(Number(cur?.weather_code ?? 0)),
              };
            })
          : [];

      const data: RealtimeFeedPayload = {
        fetchedAt: new Date(now).toISOString(),
        earthquakes: disastersData?.earthquakes ?? [],
        liveDisasters: disastersData?.incidents.slice(0, 10) ?? [],
        cyberAdvisories,
        weather,
        spaceWeather: supplemental?.spaceWeather ?? null,
        airQuality: supplemental?.airQuality ?? [],
        sources: {
          usgs: disastersData?.sources.usgs ?? 'unavailable',
          cisa: cisaResult.status === 'fulfilled' ? 'live' : 'unavailable',
          weather: meteoResult.status === 'fulfilled' ? 'live' : 'unavailable',
          currentDisaster: disastersData?.sources.currentDisaster ?? 'unavailable',
          gdacs: disastersData?.sources.gdacs ?? 'unavailable',
          nasaEonet: disastersData?.sources.nasaEonet ?? 'unavailable',
          noaaSpaceWeather: supplemental?.sources.noaaSpaceWeather ?? 'unavailable',
          openMeteoAqi: supplemental?.sources.openMeteoAqi ?? 'unavailable',
        },
      };

      realtimeCache = {
        freshUntil: now + FRESH_CACHE_MS,
        staleUntil: now + STALE_CACHE_MS,
        data,
      };
      return data;
    })().finally(() => {
      inFlightRealtime = null;
    });

    return inFlightRealtime;
  }

  app.get('/api/realtime/feed', async (req, res) => {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const now = Date.now();
    try {
      if (!forceRefresh && realtimeCache) {
        if (realtimeCache.freshUntil > now) {
          res.json(realtimeCache.data);
          return;
        }
        if (realtimeCache.staleUntil > now) {
          void refreshRealtimeFeed(false).catch(() => {});
          res.json(realtimeCache.data);
          return;
        }
      }
      const payload = await refreshRealtimeFeed(forceRefresh);
      res.json(payload);
    } catch {
      res.status(502).json({ error: 'Unable to fetch real-time intelligence feeds right now.' });
    }
  });

  app.get('/api/system/architecture', (_req, res) => {
    res.json({
      frontendFolder: 'frontend/ & src/',
      backendFolder: 'backend/ & server.ts',
      database: {
        engine: 'Firebase Cloud Firestore + Firebase Authentication',
        databaseId: 'ai-studio-aegisgrid-1b1c18df-9811-4ea4-9c98-dde59b75bbeb',
        collections: [
          'users',
          'admins',
          'disasters',
          'incidents',
          'relief_resources',
          'alerts',
          'threats',
          'ai_knowledge',
          'system_config',
          'audit_logs',
        ],
      },
      dataSources: PLATFORM_DATA_SOURCES,
    });
  });

  // Live regional meteorological grid for Satellite & Radar Forecast Map overlays
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

  let weatherGridCache: { expiresAt: number; fetchedAt: string; stations: WeatherGridStation[] } | null = null;

  app.get('/api/weather/grid', async (_req, res) => {
    const now = Date.now();
    if (weatherGridCache && weatherGridCache.expiresAt > now) {
      res.json({
        fetchedAt: weatherGridCache.fetchedAt,
        stations: weatherGridCache.stations,
      });
      return;
    }

    try {
      const lats = WEATHER_GRID_STATIONS.map((s) => s.lat).join(',');
      const lngs = WEATHER_GRID_STATIONS.map((s) => s.lng).join(',');
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,precipitation`;
      const raw = await fetchJsonWithTimeout<
        Array<{
          current?: {
            temperature_2m?: number;
            relative_humidity_2m?: number;
            pressure_msl?: number;
            wind_speed_10m?: number;
            wind_direction_10m?: number;
            precipitation?: number;
          };
        }>
      >(url, 4500);

      const list = Array.isArray(raw) ? raw : [raw];
      const stations: WeatherGridStation[] = WEATHER_GRID_STATIONS.map((meta, idx) => {
        const cur = list[idx]?.current;
        return {
          ...meta,
          tempC: Math.round((cur?.temperature_2m ?? 28) * 10) / 10,
          humidityPct: Math.round(cur?.relative_humidity_2m ?? 65),
          pressureHpa: Math.round((cur?.pressure_msl ?? 1012) * 10) / 10,
          windKmh: Math.round((cur?.wind_speed_10m ?? 14) * 10) / 10,
          windDeg: Math.round(cur?.wind_direction_10m ?? 90),
          precipMm: Math.round((cur?.precipitation ?? 0) * 10) / 10,
        };
      });

      const fetchedAt = new Date(now).toISOString();
      weatherGridCache = { expiresAt: now + 5 * 60_000, fetchedAt, stations };
      res.json({ fetchedAt, stations });
    } catch {
      if (weatherGridCache) {
        res.json({ fetchedAt: weatherGridCache.fetchedAt, stations: weatherGridCache.stations });
        return;
      }
      res.status(502).json({ error: 'Live meteorological grid temporarily unavailable.' });
    }
  });

  app.post('/api/disaster/predict', (req, res) => {
    const body = (req.body || {}) as {
      disasterType?: string;
      location?: string;
      rainfallMm?: number;
      temperatureC?: number;
      humidityPct?: number;
      windKmh?: number;
    };

    const disasterType = String(body.disasterType || 'Flood').trim().slice(0, 40);
    const location = String(body.location || 'Regional Sector').trim().slice(0, 120);
    const rainfall = Math.max(0, parseFiniteNum(body.rainfallMm, 0));
    const temperature = parseFiniteNum(body.temperatureC, 26);
    const humidity = Math.min(100, Math.max(0, parseFiniteNum(body.humidityPct, 55)));
    const wind = Math.max(0, parseFiniteNum(body.windKmh, 15));

    let score = 15;
    const factors: string[] = [];

    if (disasterType === 'Flood') {
      const rainContrib = Math.min(50, Math.round(rainfall * 0.72));
      const humContrib = humidity > 75 ? Math.round((humidity - 70) * 0.6) : 5;
      score += rainContrib + humContrib;
      factors.push(`Heavy rain: ${rainfall} mm/h (+${rainContrib} risk points)`);
      factors.push(`Moisture in air: ${humidity}% (+${humContrib} risk points)`);
    } else if (disasterType === 'Cyclone') {
      const windContrib = Math.min(55, Math.round(wind * 0.35));
      const rainContrib = Math.min(25, Math.round(rainfall * 0.3));
      score += windContrib + rainContrib;
      factors.push(`Strong winds: ${wind} km/h (+${windContrib} risk points)`);
      factors.push(`Storm rain: ${rainfall} mm/h (+${rainContrib} risk points)`);
    } else if (disasterType === 'Wildfire') {
      const heatContrib = Math.max(0, Math.min(35, Math.round((temperature - 22) * 1.7)));
      const dryContrib = Math.max(0, Math.min(30, Math.round((65 - humidity) * 0.6)));
      const windContrib = Math.min(25, Math.round(wind * 0.28));
      score += heatContrib + dryContrib + windContrib;
      factors.push(`Hot weather: ${temperature}°C (+${heatContrib} risk points)`);
      factors.push(`Dry air: ${humidity}% humidity (+${dryContrib} risk points)`);
      factors.push(`Wind pushing fire: ${wind} km/h (+${windContrib} risk points)`);
    } else if (disasterType === 'Grid Stress') {
      const thermalContrib = Math.abs(temperature - 22) > 12 ? 28 : 10;
      const windContrib = Math.min(35, Math.round(wind * 0.32));
      score += thermalContrib + windContrib;
      factors.push(`Temperature strain at ${temperature}°C (+${thermalContrib} risk points)`);
      factors.push(`Wind on power lines: ${wind} km/h (+${windContrib} risk points)`);
    } else {
      const precipSecondary = Math.min(20, Math.round(rainfall * 0.25));
      score += 32 + precipSecondary;
      factors.push('Earthquake shaking and rain-soaked ground landslide check');
    }

    const riskScore = Math.min(98, Math.max(8, Math.round(score)));
    const riskLevel: 'Low' | 'Medium' | 'High' =
      riskScore >= 70 ? 'High' : riskScore >= 42 ? 'Medium' : 'Low';
    const confidencePct = Math.min(94, Math.max(72, Math.round(78 + factors.length * 4)));

    const precautions =
      riskLevel === 'High'
        ? [
            `Alert local emergency teams in ${location} to get ready right away.`,
            disasterType === 'Flood'
              ? 'Stay out of flooded roads and underpasses, and turn off main power if water enters your home.'
              : disasterType === 'Cyclone'
              ? 'Tie down loose outdoor items, charge your phones, and be ready to move to a shelter.'
              : 'Keep roads clear for fire and power crews and prepare to leave if told to evacuate.',
          ]
        : riskLevel === 'Medium'
        ? [
            `Keep checking weather updates in ${location} over the next 6 hours.`,
            'Make sure your flashlight, clean drinking water, and nearest shelter address are ready.',
          ]
        : [`Conditions look calm in ${location} right now. No emergency move is needed.`];

    res.json({
      disasterType,
      location,
      riskLevel,
      riskScore,
      confidencePct,
      modelLabel: 'Weather Risk Scoring Guide',
      factors,
      explanation: `${disasterType} check for ${location}: ${riskLevel} Risk (${riskScore} out of 100) based on the weather numbers entered.`,
      precautions,
    });
  });

  app.post('/api/assistant/stream', async (req, res) => {
    let streamStarted = false;
    let clientClosed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
      }
    });

    try {
      const body = (req.body || {}) as AssistantRequestBody;
      const { normalizedTurns, contents, systemInstruction } = buildAssistantRequestPayload(body);

      if (normalizedTurns.length === 0) {
        res
          .status(400)
          .json({ error: 'Please provide a question or message for NEXORA AI Helper.' });
        return;
      }

      const ai = getGeminiClient();
      const stream = await generateStreamWithFallback(ai, body.model, {
        contents,
        config: { systemInstruction },
      });

      if (clientClosed) return;

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
      streamStarted = true;

      let totalChars = 0;
      for await (const chunk of stream) {
        if (clientClosed) break;
        const delta = chunk.text ?? '';
        if (delta) {
          totalChars += delta.length;
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
      }

      if (!clientClosed) {
        if (totalChars === 0) {
          res.write(
            `data: ${JSON.stringify({
              error: 'NEXORA AI Assistant returned an empty response.',
            })}\n\n`
          );
        } else {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        }
        res.end();
      }
    } catch (err: unknown) {
      if (clientClosed) return;
      const { statusCode, message } = formatGeminiError(
        err,
        'Failed to reach NEXORA AI Assistant service.'
      );
      if (!streamStarted) {
        res.status(statusCode).json({ error: message });
      } else {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      }
    }
  });

  app.post('/api/cyber/analyze', async (req, res) => {
    try {
      const { kind, payload } = (req.body || {}) as {
        kind?: 'url' | 'message' | 'log';
        payload?: string;
      };
      if (!payload || typeof payload !== 'string' || !payload.trim()) {
        res
          .status(400)
          .json({ error: 'Provide a URL, message, or network log snippet to analyze.' });
        return;
      }

      const safeKind = kind === 'message' || kind === 'log' ? kind : 'url';
      let urlBreakdown: Record<string, string | boolean | number> | undefined;
      if (safeKind === 'url') {
        const cleanRaw = payload
          .trim()
          .replace(/\[\.\]/g, '.')
          .replace(/^hxxps?:\/\//i, (m) => m.toLowerCase().replace('hxxp', 'http'));
        try {
          const parsed = new URL(/^https?:\/\//i.test(cleanRaw) ? cleanRaw : `https://${cleanRaw}`);
          urlBreakdown = {
            protocol: parsed.protocol.replace(':', ''),
            host: parsed.hostname,
            isHttps: parsed.protocol === 'https:',
            hasIpHost: /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname),
            subdomainCount: Math.max(0, parsed.hostname.split('.').length - 2),
            queryParams: Array.from(parsed.searchParams.keys()).length,
          };
        } catch {
          urlBreakdown = { malformedUrl: true, rawLength: payload.trim().length };
        }
      }

      const ai = getGeminiClient();
      const response = await generateWithFallback(ai, DEFAULT_GEMINI_MODEL, {
        contents: `Passively analyze this ${safeKind} artifact for cybersecurity risk (do NOT fetch external links):\n\n${payload.slice(0, 4000)}`,
        config: {
          systemInstruction:
            'You are an online safety helper. Check the submitted website link, SMS/email text, or log for scams, fake login pages, or harmful activity. Write indicators and recommendations in simple, clear everyday English that anyone can understand.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING, description: 'Safe, Suspicious, or Malicious' },
              riskScore: { type: Type.INTEGER, description: 'Score from 0 to 100' },
              phishingProbability: { type: Type.INTEGER, description: 'Scam likelihood 0 to 100' },
              severity: { type: Type.STRING, description: 'Low, Moderate, High, or Critical' },
              indicators: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 to 4 short, plain-English clues explaining why it looks safe or risky',
              },
              suspiciousKeywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Suspicious words or warning signs found',
              },
              recommendation: {
                type: Type.STRING,
                description: 'Simple, clear advice on what the person should do next',
              },
            },
          },
        },
      });

      const raw = (response.text ?? '{}')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');
      let parsedJson: Record<string, unknown>;
      try {
        parsedJson = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        res.status(502).json({ error: 'Cyber threat model returned malformed JSON output.' });
        return;
      }
      res.json({ ...parsedJson, urlBreakdown });
    } catch (err: unknown) {
      const { statusCode, message } = formatGeminiError(err, 'Cyber analysis failed.');
      res.status(statusCode).json({ error: message });
    }
  });

  app.post('/api/response/analyze', async (req, res) => {
    try {
      const {
        mode,
        title,
        region,
        notes,
        imageBase64,
        mimeType,
        preImageBase64,
        preMimeType,
        damageCategory,
        estimatedAreaKm2,
        patientFlags,
      } = (req.body || {}) as {
        mode?: 'damage' | 'triage' | 'rescue_recommend';
        title?: string;
        region?: string;
        notes?: string;
        imageBase64?: string;
        mimeType?: string;
        preImageBase64?: string;
        preMimeType?: string;
        damageCategory?: string;
        estimatedAreaKm2?: string;
        patientFlags?: {
          conscious?: string;
          breathing?: string;
          bleeding?: string;
          symptoms?: string;
        };
      };

      const safeMode =
        mode === 'triage' || mode === 'rescue_recommend' ? mode : 'damage';
      const safeTitle = String(title || '').trim().slice(0, 200);
      const safeRegion = String(region || '').trim().slice(0, 120);
      const safeNotes = String(notes || '').trim().slice(0, 1500);

      const ai = getGeminiClient();
      const textPrompt =
        safeMode === 'triage'
          ? `Provide AI-assisted patient triage decision support (not a medical diagnosis) for: Title="${safeTitle}", Region="${safeRegion}", Conscious="${patientFlags?.conscious || 'Unknown'}", Breathing="${patientFlags?.breathing || 'Unknown'}", Visible Bleeding="${patientFlags?.bleeding || 'Unknown'}", Symptoms="${String(patientFlags?.symptoms || safeNotes).slice(0, 1000)}".`
          : safeMode === 'rescue_recommend'
          ? `Recommend optimal rescue team specialization, vehicle/equipment type, and dispatch priority for: Title="${safeTitle}", Region="${safeRegion}", Notes="${safeNotes}".`
          : `Perform pre-vs-post disaster imagery & damage assessment for: Title="${safeTitle}", Region="${safeRegion}", Operator Damage Category="${String(damageCategory || 'Unspecified').slice(0, 80)}", Estimated Area="${String(estimatedAreaKm2 || 'Assessing').slice(0, 40)} km²", Notes="${safeNotes}". Highlight possible structural/flood changes. Explicitly note that imagery alone cannot determine confirmed casualties or trapped persons.`;

      const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];
      if (
        typeof preImageBase64 === 'string' &&
        typeof preMimeType === 'string' &&
        preMimeType.startsWith('image/')
      ) {
        parts.push({ inlineData: { mimeType: preMimeType, data: preImageBase64 } });
      }
      if (
        typeof imageBase64 === 'string' &&
        typeof mimeType === 'string' &&
        mimeType.startsWith('image/')
      ) {
        parts.push({ inlineData: { mimeType, data: imageBase64 } });
      }
      parts.push({ text: textPrompt });

      const contents = parts.length > 1 ? { parts } : textPrompt;

      const response = await generateWithFallback(ai, DEFAULT_GEMINI_MODEL, {
        contents,
        config: {
          systemInstruction:
            'You are an emergency operations AI advisor. Provide structured, concise operational assessments (under 150 words) with clear risk/damage classification and next step. Never claim satellite imagery confirms casualties, and clarify that patient triage is decision support for qualified medical responders.',
        },
      });

      res.json({ analysis: response.text?.trim() || 'Assessment completed.' });
    } catch (err: unknown) {
      const { statusCode, message } = formatGeminiError(err, 'Response AI analysis failed.');
      res.status(statusCode).json({ error: message });
    }
  });

  // Return clean JSON 404 for any unmatched /api/* route instead of falling through to SPA HTML
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Clean JSON error handler for malformed JSON bodies or unexpected server errors
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
      res.status(400).json({ error: 'Invalid JSON request body.' });
      return;
    }
    next(err);
  });

  let viteServer: { close: () => Promise<void> } | null = null;

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    viteServer = vite;
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`NEXORA AI server running on http://0.0.0.0:${PORT}`);
  });

  // Warm live feeds in the background right after startup so the first user request is instant
  void refreshRealtimeFeed(false).catch(() => {});

  const shutdown = async () => {
    server.close();
    if (viteServer) {
      await viteServer.close().catch(() => {});
    }
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

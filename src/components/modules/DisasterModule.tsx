import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CloudRain,
  Compass,
  History,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { HISTORICAL_DISASTERS, WEATHER_STATIONS } from '../../data/platformData';
import {
  AlertNotification,
  DisasterForecast,
  IncidentTicket,
  ModuleId,
  ReliefResource,
  UserRole,
} from '../../types/modules';
import { TacticalGlobe3D } from '../TacticalGlobe3D';
import { plainDisasterCategory, plainSeverity } from '../../utils/plainLabels';

interface DisasterModuleProps {
  forecasts: DisasterForecast[];
  incidents: IncidentTicket[];
  alerts?: AlertNotification[];
  resources?: ReliefResource[];
  userRole?: UserRole;
  onEscalate: (forecast: DisasterForecast) => void;
  onCreateWarning?: (forecast: DisasterForecast) => Promise<void>;
  onSyncUsgs: () => Promise<void>;
  isSyncing: boolean;
  syncNotice: string | null;
  onOpenModule?: (id: ModuleId) => void;
}

interface PredictionResult {
  disasterType: string;
  location: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  riskScore: number;
  confidencePct: number;
  modelLabel: string;
  factors: string[];
  explanation: string;
  precautions: string[];
}

const MONTHLY_TREND_SAMPLE = [
  { month: 'Jun', events: 4, rainMm: 82 },
  { month: 'Jul', events: 7, rainMm: 145 },
  { month: 'Aug', events: 9, rainMm: 192 },
  { month: 'Sep', events: 8, rainMm: 168 },
  { month: 'Oct', events: 6, rainMm: 120 },
  { month: 'Nov', events: 5, rainMm: 94 },
];

const REGION_MAP_COORDS: Record<string, { x: number; y: number }> = {
  sendai: { x: 760, y: 120 },
  japan: { x: 760, y: 120 },
  luzon: { x: 715, y: 175 },
  philippines: { x: 715, y: 175 },
  california: { x: 145, y: 130 },
  sacramento: { x: 145, y: 130 },
  rhine: { x: 455, y: 100 },
  germany: { x: 455, y: 100 },
  munich: { x: 470, y: 112 },
};

function mapCoords(region: string): { x: number; y: number } {
  const lower = region.toLowerCase();
  for (const [k, pt] of Object.entries(REGION_MAP_COORDS)) {
    if (lower.includes(k)) return pt;
  }
  return { x: 430, y: 150 };
}

function toRiskLevel(sev: DisasterForecast['severity']): 'Low' | 'Medium' | 'High' {
  if (sev === 'Critical' || sev === 'High') return 'High';
  if (sev === 'Moderate') return 'Medium';
  return 'Low';
}

export const DisasterModule: React.FC<DisasterModuleProps> = ({
  forecasts,
  incidents,
  alerts = [],
  resources = [],
  userRole = 'citizen',
  onEscalate,
  onCreateWarning,
  onSyncUsgs,
  isSyncing,
  syncNotice,
  onOpenModule,
}) => {
  const isAdmin = userRole === 'administrator';
  const showHistorical = userRole === 'citizen' || isAdmin;

  const [mapMode, setMapMode] = useState<'3d' | '2d'>('3d');
  const [horizon, setHorizon] = useState<'All' | '6h' | '24h' | '72h'>('All');
  const [category, setCategory] = useState<string>('All');
  const [riskFilter, setRiskFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');
  const [selectedMapNote, setSelectedMapNote] = useState<string | null>(null);
  const [showWarningForm, setShowWarningForm] = useState(false);

  // Interactive Disaster Risk Predictor State
  const [showPredictor, setShowPredictor] = useState(false);
  const [predType, setPredType] = useState('Flood');
  const [predLocation, setPredLocation] = useState('Rhine Basin, Germany');
  const [predRain, setPredRain] = useState('52');
  const [predTemp, setPredTemp] = useState('24');
  const [predHumidity, setPredHumidity] = useState('84');
  const [predWind, setPredWind] = useState('64');
  const [predLoading, setPredLoading] = useState(false);
  const [predError, setPredError] = useState<string | null>(null);
  const [predResult, setPredResult] = useState<PredictionResult | null>(null);

  // Admin Early Warning Generator State
  const [warnTitle, setWarnTitle] = useState('');
  const [warnCategory, setWarnCategory] = useState<DisasterForecast['category']>('Flood');
  const [warnSeverity, setWarnSeverity] = useState<DisasterForecast['severity']>('High');
  const [warnRegion, setWarnRegion] = useState('');
  const [warnHorizon, setWarnHorizon] = useState<DisasterForecast['horizon']>('24h');
  const [warnMetric, setWarnMetric] = useState('');
  const [warnSummary, setWarnSummary] = useState('');
  const [savingWarning, setSavingWarning] = useState(false);

  const filtered = useMemo(() => {
    return forecasts.filter((f) => {
      if (horizon !== 'All' && f.horizon !== horizon) return false;
      if (category !== 'All' && f.category !== category) return false;
      if (riskFilter !== 'All' && toRiskLevel(f.severity) !== riskFilter) return false;
      return true;
    });
  }, [forecasts, horizon, category, riskFilter]);

  const severityColor = (sev: DisasterForecast['severity']) => {
    if (sev === 'Critical') return 'text-red-400';
    if (sev === 'High') return 'text-amber-400';
    if (sev === 'Moderate') return 'text-sky-400';
    return 'text-emerald-400';
  };

  const handleWarningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateWarning || !warnTitle.trim() || !warnRegion.trim()) return;
    setSavingWarning(true);
    try {
      await onCreateWarning({
        id: `DIS-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`,
        title: warnTitle.trim(),
        category: warnCategory,
        severity: warnSeverity,
        region: warnRegion.trim(),
        horizon: warnHorizon,
        confidencePct: 92,
        metric: warnMetric.trim() || 'Early Warning Active',
        gridExposureMw: warnSeverity === 'Critical' ? 1200 : 450,
        populationAtRisk: '125,000',
        status: 'Warning',
        summary:
          warnSummary.trim() ||
          'Administrator-issued early warning advisory broadcast across regional telemetry feeds.',
      });
      setWarnTitle('');
      setWarnRegion('');
      setWarnMetric('');
      setWarnSummary('');
      setShowWarningForm(false);
    } finally {
      setSavingWarning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-800 rounded-xl bg-[#0A0F1A] divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
        <div className="p-3.5">
          <div className="text-[11px] text-slate-400">Active Warnings</div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-slate-100">
            {forecasts.length}
          </div>
        </div>
        <div className="p-3.5">
          <div className="text-[11px] text-slate-400">High Risk Areas</div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-red-400">
            {forecasts.filter((f) => toRiskLevel(f.severity) === 'High').length}
          </div>
        </div>
        <div className="p-3.5">
          <div className="text-[11px] text-slate-400">Flood &amp; Storm Watches</div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-sky-400">
            {forecasts.filter((f) => f.category === 'Flood' || f.category === 'Cyclone').length}
          </div>
        </div>
        <div className="p-3.5">
          <div className="text-[11px] text-slate-400">Power Systems at Risk</div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-amber-400">
            {forecasts.reduce((acc, f) => acc + f.gridExposureMw, 0).toLocaleString()} MW
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-[#0A0F1A] border border-slate-800 rounded-lg">
            {(['All', '6h', '24h', '72h'] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizon(h)}
                className={`min-h-[36px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  horizon === h
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {h === 'All'
                  ? 'All Timeframes'
                  : h === '6h'
                  ? 'Next 6 Hours'
                  : h === '24h'
                  ? 'Next 24 Hours'
                  : 'Next 3 Days'}
              </button>
            ))}
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter disaster type"
            className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-800 bg-[#0A0F1A] text-slate-200"
          >
            <option value="All">All Disasters</option>
            <option value="Flood">Floods</option>
            <option value="Cyclone">Storms &amp; Cyclones</option>
            <option value="Seismic">Earthquakes</option>
            <option value="Wildfire">Wildfires</option>
            <option value="Grid Stress">Power Grid Issues</option>
          </select>

          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)}
            aria-label="Filter risk level"
            className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-800 bg-[#0A0F1A] text-slate-200"
          >
            <option value="All">All Risk Levels</option>
            <option value="High">High Risk</option>
            <option value="Medium">Medium Risk</option>
            <option value="Low">Low Risk</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPredictor((v) => !v)}
            className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg border border-blue-500/50 bg-blue-600/15 text-blue-300 hover:bg-blue-600/25 transition-colors whitespace-nowrap"
          >
            {showPredictor ? 'Hide Risk Calculator' : 'Check Weather Risk'}
          </button>
          {isAdmin && onCreateWarning && (
            <button
              type="button"
              onClick={() => setShowWarningForm((v) => !v)}
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{showWarningForm ? 'Close Form' : 'Send Early Warning'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onSyncUsgs}
            disabled={isSyncing}
            className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-[#0A0F1A] text-slate-100 hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{isSyncing ? 'Checking Earthquakes...' : 'Check Live Earthquakes'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Environmental Disaster Risk Predictor */}
      {showPredictor && (
        <div className="p-4 rounded-xl border border-blue-500/35 bg-[#0A0F1A] space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-blue-300">
              Simple Weather &amp; Disaster Risk Calculator
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Sample risk guide based on weather numbers
            </span>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPredLoading(true);
              setPredError(null);
              try {
                const res = await fetch('/api/disaster/predict', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    disasterType: predType,
                    location: predLocation,
                    rainfallMm: Number(predRain),
                    temperatureC: Number(predTemp),
                    humidityPct: Number(predHumidity),
                    windKmh: Number(predWind),
                  }),
                });
                const data = (await res.json()) as PredictionResult & { error?: string };
                if (!res.ok) {
                  setPredError(data.error || `Risk check failed (${res.status}).`);
                } else {
                  setPredResult(data);
                }
              } catch (err: unknown) {
                setPredError(
                  err instanceof Error ? err.message : 'Unable to reach risk calculator right now.'
                );
              } finally {
                setPredLoading(false);
              }
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
              <label className="space-y-1">
                <span className="text-[11px] text-slate-400 block">Disaster Type</span>
                <select
                  value={predType}
                  onChange={(e) => setPredType(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
                >
                  <option value="Flood">Flood</option>
                  <option value="Cyclone">Storm / Cyclone</option>
                  <option value="Wildfire">Wildfire</option>
                  <option value="Seismic">Earthquake</option>
                  <option value="Grid Stress">Power Grid Issue</option>
                </select>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] text-slate-400 block">City or Area</span>
                <input
                  type="text"
                  value={predLocation}
                  onChange={(e) => setPredLocation(e.target.value)}
                  required
                  className="w-full min-h-[38px] px-2.5 rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-slate-400 block">Rain (mm/h)</span>
                <input
                  type="number"
                  min={0}
                  value={predRain}
                  onChange={(e) => setPredRain(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-slate-400 block">Temp (°C) / Humidity (%)</span>
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={predTemp}
                    onChange={(e) => setPredTemp(e.target.value)}
                    aria-label="Temperature Celsius"
                    className="w-1/2 min-h-[38px] px-2 rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={predHumidity}
                    onChange={(e) => setPredHumidity(e.target.value)}
                    aria-label="Humidity percent"
                    className="w-1/2 min-h-[38px] px-2 rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
                  />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-slate-400 block">Wind (km/h)</span>
                <input
                  type="number"
                  min={0}
                  value={predWind}
                  onChange={(e) => setPredWind(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={predLoading}
                className="min-h-[38px] px-4 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {predLoading ? 'Checking Risk...' : 'Check Risk Level'}
              </button>
            </div>
          </form>

          {predError && (
            <div className="p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-300">
              {predError}
            </div>
          )}

          {predResult && (
            <div className="p-3.5 rounded-lg border border-slate-800 bg-[#0D1422] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-semibold px-2 py-0.5 rounded ${
                      predResult.riskLevel === 'High'
                        ? 'bg-red-500/20 text-red-300'
                        : predResult.riskLevel === 'Medium'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {predResult.riskLevel} Risk ({predResult.riskScore}/100)
                  </span>
                  <span className="font-mono text-slate-400">
                    Model Certainty: {predResult.confidencePct}%
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">{predResult.modelLabel}</span>
              </div>
              <p className="text-slate-200">{predResult.explanation}</p>
              <div className="text-[11px] font-mono text-slate-400">
                Why: {predResult.factors.join(' · ')}
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-300">
                {predResult.precautions.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {syncNotice && (
        <div className="px-3.5 py-2.5 text-xs rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300">
          {syncNotice}
        </div>
      )}

      {/* Admin Early Warning Generator */}
      {isAdmin && showWarningForm && (
        <form
          onSubmit={handleWarningSubmit}
          className="p-4 rounded-xl border border-amber-500/30 bg-[#0A0F1A] space-y-3"
        >
          <div className="text-xs font-semibold text-amber-300">
            Early Warning Generation (Administrator Broadcast)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              minLength={3}
              value={warnTitle}
              onChange={(e) => setWarnTitle(e.target.value)}
              placeholder="Warning headline (e.g., Coastal Flash Flood Advisory)"
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
            />
            <input
              type="text"
              required
              minLength={2}
              value={warnRegion}
              onChange={(e) => setWarnRegion(e.target.value)}
              placeholder="Target region (e.g., Sendai Coastal Sector)"
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select
              value={warnCategory}
              onChange={(e) => setWarnCategory(e.target.value as DisasterForecast['category'])}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-200"
            >
              <option value="Flood">Flood</option>
              <option value="Cyclone">Cyclone</option>
              <option value="Seismic">Seismic</option>
              <option value="Wildfire">Wildfire</option>
              <option value="Grid Stress">Grid Stress</option>
            </select>
            <select
              value={warnSeverity}
              onChange={(e) => setWarnSeverity(e.target.value as DisasterForecast['severity'])}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-200"
            >
              <option value="Critical">Critical (High Risk)</option>
              <option value="High">High Risk</option>
              <option value="Moderate">Moderate (Medium)</option>
              <option value="Low">Low Risk</option>
            </select>
            <select
              value={warnHorizon}
              onChange={(e) => setWarnHorizon(e.target.value as DisasterForecast['horizon'])}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-200"
            >
              <option value="6h">6h horizon</option>
              <option value="24h">24h horizon</option>
              <option value="72h">72h horizon</option>
            </select>
            <input
              type="text"
              value={warnMetric}
              onChange={(e) => setWarnMetric(e.target.value)}
              placeholder="Metric (e.g., 58 mm/h rain)"
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
            />
          </div>
          <input
            type="text"
            value={warnSummary}
            onChange={(e) => setWarnSummary(e.target.value)}
            placeholder="Operational early warning summary..."
            className="w-full min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingWarning}
              className="min-h-[40px] px-4 py-2 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {savingWarning ? 'Publishing...' : 'Publish Early Warning'}
            </button>
          </div>
        </form>
      )}

      {/* Map-Based Incident Monitoring & Disaster-Prone Areas + Weather Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-200 inline-flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              Disaster-Prone Zones, Alerts &amp; Impact Map
            </span>
            <div className="inline-flex items-center p-0.5 rounded-lg border border-slate-800 bg-[#0A0F1A] text-[11px]">
              <button
                type="button"
                onClick={() => setMapMode('3d')}
                className={`min-h-[28px] px-2.5 py-0.5 rounded-md font-medium transition-colors ${
                  mapMode === '3d'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                3D Map
              </button>
              <button
                type="button"
                onClick={() => setMapMode('2d')}
                className={`min-h-[28px] px-2.5 py-0.5 rounded-md font-medium transition-colors ${
                  mapMode === '2d'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                2D Overlay
              </button>
            </div>
          </div>

          {mapMode === '3d' ? (
            <TacticalGlobe3D
              forecasts={forecasts}
              incidents={incidents}
              alerts={alerts}
              resources={resources}
              heightClass="h-64 sm:h-72"
              onSelectModule={onOpenModule}
            />
          ) : (
            <div className="border border-slate-800 rounded-xl bg-[#0A0F1A] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-100">
                  2D Disaster-Prone Zones &amp; Incident Overlay
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {forecasts.length} zones · {incidents.length} incidents
                </span>
              </div>
              <div className="bg-[#070B13] h-52 relative">
                <svg viewBox="0 0 880 260" className="w-full h-full">
                  <rect x="0" y="0" width="880" height="260" fill="#070B13" />
                  {[65, 130, 195].map((y) => (
                    <line key={y} x1="0" y1={y} x2="880" y2={y} stroke="#162136" strokeDasharray="3 4" />
                  ))}
                  {[220, 440, 660].map((x) => (
                    <line key={x} x1={x} y1="0" x2={x} y2="260" stroke="#162136" strokeDasharray="3 4" />
                  ))}
                  {forecasts.slice(0, 6).map((f) => {
                    const pt = mapCoords(f.region);
                    const risk = toRiskLevel(f.severity);
                    const color = risk === 'High' ? '#ef4444' : risk === 'Medium' ? '#f59e0b' : '#38bdf8';
                    return (
                      <g
                        key={f.id}
                        transform={`translate(${pt.x}, ${pt.y})`}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelectedMapNote(`${f.id} (${risk} Risk) — ${f.title} · ${f.metric}`)
                        }
                      >
                        <circle r="18" fill={color} fillOpacity="0.14" stroke={color} strokeOpacity="0.4" />
                        <circle r="5" fill={color} />
                      </g>
                    );
                  })}
                  {incidents.slice(0, 5).map((inc, idx) => {
                    const pt = mapCoords(inc.region);
                    return (
                      <g
                        key={inc.id}
                        transform={`translate(${pt.x + 12 + idx * 3}, ${pt.y - 10})`}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelectedMapNote(`Incident ${inc.id} (${inc.status}) — ${inc.title}`)
                        }
                      >
                        <rect x="-4" y="-4" width="8" height="8" fill="#3b82f6" stroke="#ffffff" strokeWidth="1" />
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="px-4 py-2 border-t border-slate-800 text-[11px] font-mono text-slate-300 flex items-center justify-between gap-2">
                <span className="truncate">
                  {selectedMapNote || 'Circles: Disaster-prone risk zones · Squares: Active incident tickets'}
                </span>
                <span className="text-slate-500 shrink-0">Tap pin to inspect</span>
              </div>
            </div>
          )}
        </div>

        {/* Rainfall, Flood-Risk & Cyclone Station Telemetry */}
        <div className="lg:col-span-5 border border-slate-800 rounded-xl bg-[#0A0F1A] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-100 inline-flex items-center gap-1.5">
              <CloudRain className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
              Rain, Flood &amp; Storm Stations
            </span>
            <span className="text-[11px] font-mono text-slate-400">Live Weather Readings</span>
          </div>
          <div className="divide-y divide-slate-800">
            {WEATHER_STATIONS.map((ws) => (
              <div key={ws.region} className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-slate-100 truncate">{ws.region}</div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-400">
                    Rain: {ws.rainfallMmH} mm/h · Wind: {ws.windKmh} km/h · Pressure: {ws.pressureHpa} hPa
                  </div>
                </div>
                <span
                  className={`text-xs font-mono font-semibold shrink-0 ${
                    ws.floodRisk === 'High'
                      ? 'text-red-400'
                      : ws.floodRisk === 'Medium'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {ws.floodRisk} Risk
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Forecast List */}
      <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-[#0A0F1A] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-6 text-center space-y-2.5">
            <p className="text-xs text-slate-400">
              No disaster warnings match your selected filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setHorizon('All');
                setCategory('All');
                setRiskFilter('All');
              }}
              className="min-h-[34px] px-3 py-1 text-xs font-medium rounded-lg border border-slate-700 bg-[#0D1422] text-slate-200 hover:bg-slate-800"
            >
              Show All Warnings
            </button>
          </div>
        ) : (
          filtered.map((f) => {
            const risk = toRiskLevel(f.severity);
            return (
              <div
                key={f.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-900/60 transition-colors"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono text-slate-300">{f.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>{plainDisasterCategory(f.category)}</span>
                    <span aria-hidden="true">·</span>
                    <span className={`font-semibold inline-flex items-center gap-1 ${severityColor(f.severity)}`}>
                      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                      {plainSeverity(f.severity)} ({risk} Risk)
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{f.confidencePct}% match</span>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-100">{f.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{f.summary}</p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums text-slate-400 pt-0.5">
                    <span>{f.region}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-200">{f.metric}</span>
                    <span aria-hidden="true">·</span>
                    <span>{f.gridExposureMw} MW power load</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEscalate(f)}
                    disabled={f.status === 'Escalated'}
                    className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-400 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <span>{f.status === 'Escalated' ? 'Sent to Rescue' : 'Send to Rescue Team'}</span>
                    {f.status !== 'Escalated' && <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Historical Disaster Analysis (Citizen & Admin only) */}
      {showHistorical && (
        <div className="border border-slate-800 rounded-xl bg-[#0A0F1A] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-100 inline-flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
              Historical Disaster Baseline &amp; Monthly Rainfall Trend
            </span>
            <span className="text-[11px] font-mono text-slate-400">Sample multi-year archive</span>
          </div>
          <div className="p-4 border-b border-slate-800 grid grid-cols-6 gap-2 items-end h-28 bg-[#080C15]">
            {MONTHLY_TREND_SAMPLE.map((m) => (
              <div key={m.month} className="flex flex-col items-center gap-1 text-[10px] font-mono">
                <span className="text-sky-400">{m.rainMm}mm</span>
                <div
                  className="w-full max-w-[32px] rounded-t bg-blue-600/75"
                  style={{ height: `${Math.max(12, Math.round((m.rainMm / 200) * 52))}px` }}
                  title={`${m.month}: ${m.events} events, ${m.rainMm} mm rainfall`}
                />
                <span className="text-slate-400">{m.month} ({m.events})</span>
              </div>
            ))}
          </div>
          <div className="divide-y divide-slate-800">
            {HISTORICAL_DISASTERS.map((h) => (
              <div
                key={h.event}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-mono text-blue-400 mr-2">{h.year}</span>
                  <span className="font-medium text-slate-100">{h.event}</span>
                  <span className="text-slate-500 mx-2" aria-hidden="true">·</span>
                  <span className="text-slate-400">{h.region}</span>
                </div>
                <div className="font-mono text-[11px] text-slate-300 shrink-0">
                  {h.peakMetric} · {h.impact}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

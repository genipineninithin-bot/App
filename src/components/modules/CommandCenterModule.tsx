import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  Bot,
  Flame,
  HeartPulse,
  Settings,
  ShieldAlert,
  Siren,
} from 'lucide-react';
import {
  AlertNotification,
  AnalyticsPoint,
  CyberThreat,
  DisasterForecast,
  IncidentTicket,
  ModuleId,
  ReliefResource,
  Severity,
  UserRole,
} from '../../types/modules';
import { WEATHER_STATIONS } from '../../data/platformData';
import { GoogleMapsPanel } from '../GoogleMapsPanel';
import {
  plainDisasterCategory,
  plainIncidentDomain,
  plainIncidentStatus,
  plainSeverity,
  plainThreatVector,
} from '../../utils/plainLabels';

interface CommandCenterModuleProps {
  forecasts: DisasterForecast[];
  threats: CyberThreat[];
  incidents: IncidentTicket[];
  alerts?: AlertNotification[];
  resources?: ReliefResource[];
  analytics: AnalyticsPoint[];
  userRole?: UserRole;
  activeAlertsCount?: number;
  reliefCount?: number;
  urlsScannedCount?: number;
  phishingDetectedCount?: number;
  liveLocation?: { lat: number; lng: number } | null;
  onOpenModule: (id: ModuleId) => void;
}

function severityColor(sev: Severity): string {
  switch (sev) {
    case 'Critical':
      return 'text-red-400';
    case 'High':
      return 'text-amber-400';
    case 'Moderate':
      return 'text-sky-400';
    case 'Low':
      return 'text-slate-400';
  }
}

export const CommandCenterModule: React.FC<CommandCenterModuleProps> = ({
  forecasts,
  threats,
  incidents,
  alerts = [],
  resources = [],
  analytics,
  userRole = 'administrator',
  activeAlertsCount = 0,
  reliefCount = 0,
  urlsScannedCount = 0,
  phishingDetectedCount = 0,
  liveLocation = null,
  onOpenModule,
}) => {
  const isAdmin = userRole === 'administrator';
  const isRescue = userRole === 'rescue';
  const showCyberSummary = isAdmin || userRole === 'citizen';

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const criticalForecasts = forecasts.filter((f) => f.severity === 'Critical').length;
  const totalGridMw = forecasts.reduce((sum, f) => sum + (f.gridExposureMw || 0), 0);
  const activeThreats = threats.filter((t) => t.status !== 'Contained');
  const openIncidents = incidents.filter((i) => i.status !== 'Resolved');
  const activeAlerts = useMemo(() => {
    const rank: Record<Severity, number> = { Critical: 0, High: 1, Moderate: 2, Low: 3 };
    return [...openIncidents].sort((a, b) => rank[a.severity] - rank[b.severity]);
  }, [openIncidents]);

  const affectedHostsTotal = activeThreats.reduce((sum, t) => sum + t.affectedHosts, 0);

  const categoryBreakdown = useMemo(() => {
    const counts = forecasts.reduce<Record<string, number>>((acc, f) => {
      acc[f.category] = (acc[f.category] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [forecasts]);

  const severityBreakdown = useMemo(() => {
    const levels: Severity[] = ['Critical', 'High', 'Moderate', 'Low'];
    const pool = [
      ...forecasts.map((f) => f.severity),
      ...openIncidents.map((i) => i.severity),
      ...(isAdmin ? activeThreats.map((t) => t.severity) : []),
    ];
    const counts = levels.map((level) => ({
      level,
      count: pool.filter((s) => s === level).length,
    }));
    const maxCount = Math.max(1, ...counts.map((c) => c.count));
    return { counts, maxCount };
  }, [forecasts, openIncidents, activeThreats, isAdmin]);

  const vectorSummary = useMemo(() => {
    const map = activeThreats.reduce<Record<string, number>>((acc, t) => {
      acc[t.vector] = (acc[t.vector] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [activeThreats]);

  // SVG Chart Geometry
  const chartW = 540;
  const chartH = 165;
  const padL = 28;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const safeSeries = analytics.length > 0 ? analytics : [];
  const maxY = Math.max(
    10,
    ...safeSeries.map((s) =>
      showCyberSummary
        ? Math.max(s.cyberAlerts, s.mitigated, s.disasterSignals)
        : Math.max(s.mitigated, s.disasterSignals)
    )
  );
  const yMax = Math.ceil(maxY / 5) * 5;
  const getX = (i: number) => padL + (i / Math.max(1, safeSeries.length - 1)) * innerW;
  const getY = (v: number) => padT + innerH - (v / yMax) * innerH;
  const buildPath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(v).toFixed(1)}`).join(' ');
  const activePoint =
    hoverIdx !== null && safeSeries[hoverIdx]
      ? safeSeries[hoverIdx]
      : safeSeries[safeSeries.length - 1];

  const quickModules: {
    id: ModuleId;
    num: string;
    label: string;
    stat: string;
    icon: typeof Flame;
    visible: boolean;
  }[] = [
    {
      id: 'disaster',
      num: '02',
      label: 'Disaster Alerts',
      stat: `${forecasts.length} active warnings`,
      icon: Flame,
      visible: true,
    },
    {
      id: 'cyber',
      num: '03',
      label: 'Link & Scam Check',
      stat: isAdmin ? `${activeThreats.length} threats` : 'Check links & texts',
      icon: ShieldAlert,
      visible: true,
    },
    {
      id: 'assistant',
      num: '04',
      label: 'Ask NEXORA AI',
      stat: 'Help in 7 languages',
      icon: Bot,
      visible: true,
    },
    {
      id: 'response',
      num: '05',
      label: 'Report & Rescue',
      stat: `${openIncidents.length} active cases`,
      icon: Siren,
      visible: true,
    },
    {
      id: 'relief',
      num: '06',
      label: 'Hospitals & Shelters',
      stat: `${reliefCount} locations`,
      icon: HeartPulse,
      visible: true,
    },
    {
      id: 'analytics',
      num: '07',
      label: 'Trends & Reports',
      stat: isAdmin ? 'People & impact stats' : 'Safety trends',
      icon: Activity,
      visible: true,
    },
    {
      id: 'alerts',
      num: '08',
      label: 'Safety Alerts',
      stat: `${activeAlertsCount} live alerts`,
      icon: BellRing,
      visible: true,
    },
    {
      id: 'admin',
      num: '09',
      label: 'Admin Settings',
      stat: 'Users & activity log',
      icon: Settings,
      visible: isAdmin,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Top Situational KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-800 rounded-xl bg-slate-900 divide-y lg:divide-y-0 lg:divide-x divide-slate-800 overflow-hidden">
        <button
          type="button"
          onClick={() => onOpenModule('disaster')}
          className="text-left p-3.5 sm:p-4 hover:bg-slate-900/70 transition-colors"
        >
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Active Disasters &amp; Warnings</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-display text-xl font-bold tabular-nums text-slate-100">
              {forecasts.length}
            </span>
            <span className="text-xs font-medium tabular-nums text-amber-400">
              {criticalForecasts} danger now · {forecasts.filter((f) => f.severity === 'Critical' || f.severity === 'High').length} high risk
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onOpenModule('response')}
          className="text-left p-3.5 sm:p-4 hover:bg-slate-900/70 transition-colors"
        >
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Emergencies &amp; Rescue Help</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-display text-xl font-bold tabular-nums text-slate-100">
              {openIncidents.length}
            </span>
            <span className="text-xs font-medium tabular-nums text-blue-400">
              {incidents.filter((i) => i.status === 'Resolved').length} completed · {openIncidents.filter((i) => i.status === 'Dispatched' || i.status === 'In Progress').length} active
            </span>
          </div>
        </button>

        {showCyberSummary ? (
          <button
            type="button"
            onClick={() => onOpenModule('cyber')}
            className="text-left p-3.5 sm:p-4 hover:bg-slate-900/70 transition-colors"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Scam &amp; Link Safety Checks</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-display text-xl font-bold tabular-nums text-slate-100">
                {isAdmin ? activeThreats.length : urlsScannedCount}
              </span>
              <span className="text-xs font-medium tabular-nums text-red-400">
                {urlsScannedCount} checked · {phishingDetectedCount} unsafe
              </span>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenModule('relief')}
            className="text-left p-3.5 sm:p-4 hover:bg-slate-900/70 transition-colors"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Hospitals &amp; Shelters</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-display text-xl font-bold tabular-nums text-slate-100">
                {reliefCount}
              </span>
              <span className="text-xs font-medium text-emerald-400">open &amp; ready</span>
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={() => onOpenModule('alerts')}
          className="text-left p-3.5 sm:p-4 hover:bg-slate-900/70 transition-colors"
        >
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Live Alerts &amp; Rain Watch</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-200 truncate">
            <span className="font-display text-lg font-bold tabular-nums text-amber-400">
              {activeAlertsCount}
            </span>
            <span className="text-[11px] text-slate-400 truncate">
              {WEATHER_STATIONS[0]?.region}: {WEATHER_STATIONS[0]?.rainfallMmH} mm/h rain
            </span>
          </div>
        </button>
      </div>

      {/* Quick Access to All Role-Authorized Modules */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <h3 className="font-semibold text-slate-200">Quick Tools &amp; Sections</h3>
          <span className="text-[11px] text-slate-400">
            {isAdmin ? 'Admin Controls' : isRescue ? 'Rescue Team View' : 'Public Safety View'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {quickModules
            .filter((m) => m.visible)
            .map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onOpenModule(m.id)}
                  className="min-h-[56px] p-3 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 hover:border-blue-500/60 text-left transition-all flex flex-col justify-between gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                      <Icon className="w-3.5 h-3.5 text-blue-400 shrink-0" aria-hidden="true" />
                      <span>{m.num}</span>
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-100 truncate">{m.label}</div>
                    <div className="text-[11px] text-slate-400 truncate">{m.stat}</div>
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* Live Statistics & Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 border border-slate-800 rounded-xl bg-slate-900 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h3 className="text-xs font-semibold text-slate-100">
              Last 24 Hours Activity &amp; Fixed Issues
            </h3>
            {activePoint && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] tabular-nums text-slate-400">
                <span>{activePoint.hour}</span>
                <span className="text-amber-400">Disasters: {activePoint.disasterSignals}</span>
                {showCyberSummary && (
                  <span className="text-red-400">Cyber Alerts: {activePoint.cyberAlerts}</span>
                )}
                <span className="text-blue-400">Fixed: {activePoint.mitigated}</span>
              </div>
            )}
          </div>

          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-40">
            {[0, 0.5, 1].map((t) => {
              const val = Math.round(yMax * t);
              const y = getY(val);
              return (
                <g key={t}>
                  <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="#1e293b" strokeWidth="1" />
                  <text
                    x={padL - 6}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-500 text-[10px] font-mono tabular-nums"
                  >
                    {val}
                  </text>
                </g>
              );
            })}
            {showCyberSummary && (
              <path
                d={buildPath(safeSeries.map((s) => s.cyberAlerts))}
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
              />
            )}
            <path
              d={buildPath(safeSeries.map((s) => s.mitigated))}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
            />
            <path
              d={buildPath(safeSeries.map((s) => s.disasterSignals))}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
            {safeSeries.map((pt, i) => {
              const x = getX(i);
              return (
                <g key={pt.hour}>
                  <text
                    x={x}
                    y={chartH - 6}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px] font-mono tabular-nums"
                  >
                    {pt.hour}
                  </text>
                  <rect
                    x={x - innerW / Math.max(1, safeSeries.length) / 2}
                    y={padT}
                    width={innerW / Math.max(1, safeSeries.length)}
                    height={innerH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                    onClick={() => setHoverIdx(i)}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Severity Distribution & Disaster Risk Breakdown */}
        <div className="lg:col-span-5 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-100">
              Current Risk Levels
            </h3>
            <div className="space-y-2.5">
              {severityBreakdown.counts.map(({ level, count }) => (
                <div key={level} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={severityColor(level)}>{plainSeverity(level)}</span>
                    <span className="font-mono tabular-nums text-slate-300">{count}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-900 rounded-sm overflow-hidden">
                    <div
                      className={`h-full rounded-sm ${
                        level === 'Critical'
                          ? 'bg-red-500'
                          : level === 'High'
                          ? 'bg-amber-500'
                          : level === 'Moderate'
                          ? 'bg-sky-500'
                          : 'bg-slate-500'
                      }`}
                      style={{
                        width: `${Math.round((count / severityBreakdown.maxCount) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>Power Grid at Risk</span>
            <span className="font-mono tabular-nums text-amber-400">
              {totalGridMw.toLocaleString()} MW across {categoryBreakdown.length} disaster types
            </span>
          </div>
        </div>
      </div>

      {/* Disaster Risk Overview + Google Maps */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-200">
              Google Maps — Alerts, Disasters &amp; Help Locations
            </span>
            <span className="text-[11px] font-mono text-teal-400">
              Interactive Street, Satellite &amp; Terrain View
            </span>
          </div>

          <GoogleMapsPanel
            forecasts={forecasts}
            incidents={incidents}
            alerts={alerts}
            threats={threats}
            resources={resources}
            showCyber={isAdmin}
            heightClass="h-80 sm:h-96 lg:h-[400px]"
            initialUserLocation={liveLocation}
            onSelectModule={onOpenModule}
          />
        </div>

        {/* Right Side Summary */}
        <div className="lg:col-span-4 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between gap-4">
          {showCyberSummary ? (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-100">
                    Scam &amp; Cyber Safety Summary
                  </h3>
                  <span className="text-[11px] font-medium text-red-400">
                    {activeThreats.length} active
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {isAdmin
                    ? `${affectedHostsTotal} computers and phones watched for viruses, fake links, and power system tampering.`
                    : 'Watch out for fake relief websites and scam texts. Paste any suspicious link or message in our Link Safety Checker before clicking.'}
                </p>
                <div className="divide-y divide-slate-800 border-t border-slate-800">
                  {vectorSummary.slice(0, 4).map(([vector, count]) => (
                    <div
                      key={vector}
                      className="py-2 flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-300">{plainThreatVector(vector)}</span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {count} {count === 1 ? 'alert' : 'alerts'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenModule('cyber')}
                className="min-h-[40px] w-full px-3 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-100 hover:bg-slate-800 transition-colors"
              >
                {isAdmin ? 'Open Cyber Safety Controls' : 'Check a Suspicious Link or Text'}
              </button>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-100">
                    Active Disaster Types
                  </h3>
                  <span className="text-[11px] font-medium text-amber-400">
                    {forecasts.length} areas
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Summary of active disasters and storms to help rescue teams prepare where help is needed most.
                </p>
                <div className="divide-y divide-slate-800 border-t border-slate-800">
                  {categoryBreakdown.map(([cat, count]) => (
                    <div
                      key={cat}
                      className="py-2 flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-300">{plainDisasterCategory(cat)}</span>
                      <span className="font-mono tabular-nums text-amber-400">
                        {count} {count === 1 ? 'area' : 'areas'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenModule('disaster')}
                className="min-h-[40px] w-full px-3 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-100 hover:bg-slate-800 transition-colors"
              >
                See Disaster Warnings
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom Split: Urgent Emergencies Right Now + Latest Emergency Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 border border-slate-800 rounded-xl bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              <h3 className="text-xs font-semibold text-slate-100">Urgent Emergencies Right Now</h3>
            </div>
            <button
              type="button"
              onClick={() => onOpenModule('response')}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap"
            >
              See All
            </button>
          </div>
          <div className="divide-y divide-slate-800">
            {activeAlerts.length === 0 ? (
              <div className="p-4 text-xs text-slate-400">
                No urgent emergencies need immediate action right now.
              </div>
            ) : (
              activeAlerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className="px-4 py-3 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-slate-400">
                      <span className={`font-semibold ${severityColor(alert.severity)}`}>
                        {plainSeverity(alert.severity)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{alert.region}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-500">{alert.id}</span>
                    </div>
                    <div className="font-medium text-slate-100 truncate">{alert.title}</div>
                    <div className="text-[11px] text-slate-400">
                      Team: {alert.assignedUnit} · {plainIncidentStatus(alert.status)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenModule('response')}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    View Details
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-6 border border-slate-800 rounded-xl bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-100">Latest Emergency Reports</h3>
            <span className="text-[11px] tabular-nums text-slate-400">
              {incidents.length} total
            </span>
          </div>
          <div className="divide-y divide-slate-800">
            {incidents.length === 0 ? (
              <div className="p-4 text-xs text-slate-400">
                No emergency reports submitted yet.
              </div>
            ) : (
              incidents.slice(0, 4).map((inc) => (
                <div
                  key={inc.id}
                  className="px-4 py-3 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-slate-400">
                      <span>{plainIncidentDomain(inc.domain)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-blue-400 font-medium">{plainIncidentStatus(inc.status)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{inc.updatedAt}</span>
                    </div>
                    <div className="font-medium text-slate-100 truncate">{inc.title}</div>
                    <div className="text-[11px] text-slate-400 truncate">{inc.notes}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenModule('response')}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    Open
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { Activity, Download, FileText, Link2 } from 'lucide-react';
import {
  AnalyticsPoint,
  CyberThreat,
  DisasterForecast,
  IncidentTicket,
  UserRole,
} from '../../types/modules';
import { plainDisasterCategory, plainThreatVector } from '../../utils/plainLabels';

interface AnalyticsModuleProps {
  series: AnalyticsPoint[];
  forecasts: DisasterForecast[];
  threats: CyberThreat[];
  incidents: IncidentTicket[];
  userRole?: UserRole;
}

export const AnalyticsModule: React.FC<AnalyticsModuleProps> = ({
  series,
  forecasts,
  threats,
  incidents,
  userRole = 'citizen',
}) => {
  const isAdmin = userRole === 'administrator';
  const showTrendAndCyberStats = isAdmin || userRole === 'citizen';
  const showRescuePerformance = isAdmin || userRole === 'rescue';

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [regionFilter, setRegionFilter] = useState('All');
  const [domainFilter, setDomainFilter] = useState('All');
  const [timeframeFilter, setTimeframeFilter] = useState('All');

  const regions = useMemo(
    () => ['All', ...Array.from(new Set(incidents.map((i) => i.region)))],
    [incidents]
  );

  const filteredIncidents = useMemo(
    () =>
      incidents.filter((i) => {
        if (regionFilter !== 'All' && i.region !== regionFilter) return false;
        if (domainFilter !== 'All' && i.domain !== domainFilter) return false;
        if (timeframeFilter === 'Today' && !/now|min|h ago|today/i.test(i.updatedAt)) return false;
        return true;
      }),
    [incidents, regionFilter, domainFilter, timeframeFilter]
  );

  const disasterCategoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    forecasts.forEach((f) => {
      map[f.category] = (map[f.category] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [forecasts]);

  const width = 600;
  const height = 190;
  const padL = 32;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const maxY = Math.max(
    10,
    ...series.map((s) => Math.max(s.cyberAlerts, s.mitigated, s.disasterSignals))
  );
  const yMax = Math.ceil(maxY / 5) * 5;

  const getX = (i: number) => padL + (i / Math.max(1, series.length - 1)) * chartW;
  const getY = (v: number) => padT + chartH - (v / yMax) * chartH;
  const buildPath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(v).toFixed(1)}`).join(' ');

  const activePoint =
    hoverIdx !== null && series[hoverIdx]
      ? series[hoverIdx]
      : series.length > 0
      ? series[series.length - 1]
      : undefined;

  const vectorCounts = threats.reduce<Record<string, number>>((acc, t) => {
    acc[t.vector] = (acc[t.vector] || 0) + 1;
    return acc;
  }, {});
  const vectorRows = Object.entries(vectorCounts).sort((a, b) => b[1] - a[1]);
  const maxVector = Math.max(1, ...vectorRows.map((r) => r[1]));

  const totalExposedPop = incidents.reduce((sum, i) => sum + (i.exposedPopulation || 0), 0);
  const totalCasualties = incidents.reduce((sum, i) => sum + (i.casualtiesCount || 0), 0);
  const resolvedCount = incidents.filter((i) => i.status === 'Resolved' || i.status === 'Contained').length;
  const rescuePerfPct = Math.round((resolvedCount / Math.max(1, incidents.length)) * 100);

  const correlated = threats
    .filter((t) => t.linkedDisasterId)
    .map((t) => ({
      threat: t,
      disaster: forecasts.find((f) => f.id === t.linkedDisasterId),
    }))
    .filter((x): x is { threat: CyberThreat; disaster: DisasterForecast } => Boolean(x.disaster));

  const handleExport = () => {
    const lines = [
      'Type,ID,Title,Severity,Metric_or_Status',
      ...forecasts.map((f) => `Disaster,${f.id},"${f.title}",${f.severity},"${f.metric}"`),
      ...threats.map((t) => `Cyber,${t.id},"${t.title}",${t.severity},"${t.ioc}"`),
      ...incidents.map(
        (i) =>
          `Incident,${i.id},"${i.title}",${i.severity},"${i.status} · Exposed ${i.exposedPopulation ?? 0}"`
      ),
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nexora-ai-analytical-report.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportHtmlReport = () => {
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>NEXORA AI Intelligence Report</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#0f172a}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:8px;font-size:12px;text-align:left}th{background:#f1f5f9}</style>
</head><body>
<h1>NEXORA AI — Analytical Intelligence Brief</h1>
<p>Generated: ${new Date().toISOString()} · Hazards: ${forecasts.length} · Cyber: ${threats.length} · Incidents: ${incidents.length} · Exposed Pop: ${totalExposedPop.toLocaleString()}</p>
<h2>Disaster Forecasts</h2>
<table><tr><th>ID</th><th>Title</th><th>Category</th><th>Severity</th><th>Region</th><th>Metric</th></tr>
${forecasts.map((f) => `<tr><td>${f.id}</td><td>${f.title}</td><td>${f.category}</td><td>${f.severity}</td><td>${f.region}</td><td>${f.metric}</td></tr>`).join('')}
</table>
<h2>Incident &amp; Damage Reports</h2>
<table><tr><th>ID</th><th>Title</th><th>Severity</th><th>Status</th><th>Region</th><th>Exposed / Casualties</th></tr>
${incidents.map((i) => `<tr><td>${i.id}</td><td>${i.title}</td><td>${i.severity}</td><td>${i.status}</td><td>${i.region}</td><td>${i.exposedPopulation ?? 0} / ${i.casualtiesCount ?? 0}</td></tr>`).join('')}
</table>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nexora-ai-intelligence-brief.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-400">
          {isAdmin
            ? `Full summary across ${forecasts.length} warnings, ${threats.length} cyber alerts, and ${incidents.length} reports`
            : userRole === 'rescue'
            ? 'Rescue response speed & completion summary'
            : 'Easy-to-read disaster trends & online safety summary'}
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportHtmlReport}
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download Printable Brief (HTML)</span>
            </button>
          </div>
        )}
      </div>

      {/* Admin KPI Strip: Population Exposure, Casualties, AI Damage Reports */}
      {isAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-800 rounded-xl bg-slate-900 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
          <div className="p-3.5">
            <div className="text-[11px] text-slate-400">Population Exposure</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-amber-400">
              {totalExposedPop.toLocaleString()}
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-[11px] text-slate-400">Casualty &amp; Medical Cases</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-red-400">
              {totalCasualties}
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-[11px] text-slate-400">AI Damage Reports</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-blue-400">
              {incidents.filter((i) => Boolean(i.damageAssessment)).length}
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-[11px] text-slate-400">Rescue Completion Rate</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-emerald-400">
              {rescuePerfPct}%
            </div>
          </div>
        </div>
      )}

      {/* Rescue Performance Analytics (Admin & Rescue) */}
      {showRescuePerformance && (
        <div className="border border-slate-800 rounded-xl bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-100 inline-flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              Rescue Operation Performance Analytics
            </span>
            <span className="font-mono text-emerald-400 tabular-nums">
              {resolvedCount}/{incidents.length} contained or resolved
            </span>
          </div>
          <div className="h-2.5 w-full bg-slate-900 rounded-sm overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-sm"
              style={{ width: `${rescuePerfPct}%` }}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-400 pt-1">
            <div>
              Red-Immediate Triage:{' '}
              <span className="font-mono text-red-400">
                {incidents.filter((i) => i.triagePriority === 'Red - Immediate').length}
              </span>
            </div>
            <div>
              Dispatched / Active:{' '}
              <span className="font-mono text-amber-400">
                {incidents.filter((i) => i.status === 'Dispatched' || i.status === 'In Progress').length}
              </span>
            </div>
            <div>
              Avg Field SLA Target: <span className="font-mono text-blue-400">14 mins</span>
            </div>
          </div>
        </div>
      )}

      {/* Disaster Trends + Cyber Threat Statistics (User & Admin) */}
      {showTrendAndCyberStats && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 border border-slate-800 rounded-xl bg-slate-900 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h3 className="text-xs font-semibold text-slate-100">
                24-Hour Disasters &amp; Fixed Issues
              </h3>
              {activePoint && (
                <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-400">
                  <span>{activePoint.hour}</span>
                  <span className="text-red-400">Cyber {activePoint.cyberAlerts}</span>
                  <span className="text-blue-400">Fixed {activePoint.mitigated}</span>
                  <span className="text-amber-400">Disasters {activePoint.disasterSignals}</span>
                </div>
              )}
            </div>

            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44">
              {[0, 0.5, 1].map((t) => {
                const val = Math.round(yMax * t);
                const y = getY(val);
                return (
                  <g key={t}>
                    <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#1e293b" strokeWidth="1" />
                    <text
                      x={padL - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-500 text-[10px] font-mono tabular-nums"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}
              <path d={buildPath(series.map((s) => s.cyberAlerts))} fill="none" stroke="#ef4444" strokeWidth="2" />
              <path d={buildPath(series.map((s) => s.mitigated))} fill="none" stroke="#3b82f6" strokeWidth="2" />
              <path
                d={buildPath(series.map((s) => s.disasterSignals))}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
              {series.map((pt, i) => {
                const x = getX(i);
                const slotW = chartW / Math.max(1, series.length);
                return (
                  <g key={pt.hour}>
                    <text
                      x={x}
                      y={height - 6}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-mono tabular-nums"
                    >
                      {pt.hour}
                    </text>
                    <rect
                      x={x - slotW / 2}
                      y={padT}
                      width={slotW}
                      height={chartH}
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

          <div className="lg:col-span-5 border border-slate-800 rounded-xl bg-slate-900 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-100">
              Top Online &amp; Scam Threats
            </h3>
            <div className="space-y-3">
              {vectorRows.map(([vec, count]) => (
                <div key={vec} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{plainThreatVector(vec)}</span>
                    <span className="font-mono tabular-nums text-slate-400">{count}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-900 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-sm"
                      style={{ width: `${Math.round((count / maxVector) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Disaster Risk Category Comparison */}
      {showTrendAndCyberStats && (
        <div className="border border-slate-800 rounded-xl bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-100">Warnings by Disaster Type</span>
            <span className="font-mono text-slate-400">{forecasts.length} active areas</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {disasterCategoryCounts.map(([cat, count]) => (
              <div key={cat} className="p-3 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-between text-xs">
                <span className="text-slate-300">{plainDisasterCategory(cat)}</span>
                <span className="font-mono font-semibold text-amber-400 tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin Incident Analysis by Location, Type, Date & AI Damage Assessment Reports */}
      {isAdmin && (
        <div className="border border-slate-800 rounded-xl bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-100">
              Incident Analysis by Location, Type &amp; AI Damage Reports
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                aria-label="Filter incidents by disaster type"
                className="min-h-[34px] px-2.5 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
              >
                <option value="All">All Types</option>
                <option value="Disaster">Disaster</option>
                <option value="Hybrid Nexus">Hybrid Nexus</option>
                <option value="Cyber">Cyber</option>
              </select>
              <select
                value={timeframeFilter}
                onChange={(e) => setTimeframeFilter(e.target.value)}
                aria-label="Filter incidents by timeframe"
                className="min-h-[34px] px-2.5 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
              >
                <option value="All">All Dates</option>
                <option value="Today">Recent / Active</option>
              </select>
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                aria-label="Filter incidents by location"
                className="min-h-[34px] px-2.5 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
              >
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="divide-y divide-slate-800">
            {filteredIncidents.length === 0 ? (
              <div className="p-5 text-center text-xs text-slate-400">
                No reports match these filters. Try selecting &ldquo;All Types&rdquo; or &ldquo;All Dates&rdquo;.
              </div>
            ) : (
              filteredIncidents.map((inc) => (
                <div key={inc.id} className="px-4 py-3 space-y-1 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-100">
                      <span className="font-mono text-blue-400 mr-2">{inc.id}</span>
                      {inc.title}
                    </span>
                    <span className="font-mono text-slate-400">
                      {inc.region} · {inc.updatedAt}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {inc.damageAssessment || inc.notes}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Correlated Nexus Matrix */}
      {showTrendAndCyberStats && (
        <div className="border border-slate-800 rounded-xl bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-100">Connected Disaster &amp; Scam Warnings</h3>
            <span className="text-xs font-mono tabular-nums text-slate-400">{correlated.length} linked</span>
          </div>
          <div className="divide-y divide-slate-800">
            {correlated.length === 0 ? (
              <div className="p-4 text-xs text-slate-400">
                No connected disaster and cyber warnings right now.
              </div>
            ) : (
              correlated.map(({ threat, disaster }) => (
                <div
                  key={threat.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-slate-200 min-w-0">
                    <span className="font-mono text-amber-400">{disaster.id}</span>
                    <span className="truncate max-w-full">{disaster.title}</span>
                    <Link2 className="w-3.5 h-3.5 text-blue-400 shrink-0" aria-hidden="true" />
                    <span className="font-mono text-red-400">{threat.id}</span>
                    <span className="text-slate-300 truncate max-w-full">{threat.title}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0">{threat.platform}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

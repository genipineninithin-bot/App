import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  CloudRain,
  Database,
  ExternalLink,
  FolderTree,
  Radio,
  RefreshCw,
  Satellite,
  Server,
  ShieldAlert,
  Siren,
  Sparkles,
  Wind,
} from 'lucide-react';
import {
  AlertNotification,
  AuthUser,
  CyberThreat,
  DisasterForecast,
  IncidentTicket,
  ModuleId,
  ReliefResource,
} from '../types/modules';
import { plainSeverity } from '../utils/plainLabels';
import {
  ArchitectureOverviewResponse,
  RealtimeFeedResponse,
  fetchPlatformArchitecture,
  fetchRealtimeFeed,
} from '../../frontend/apiClient';

interface HomePageViewProps {
  user: AuthUser;
  clockLabel: string;
  dateLabel: string;
  forecasts: DisasterForecast[];
  incidents: IncidentTicket[];
  alerts: AlertNotification[];
  threats: CyberThreat[];
  resources: ReliefResource[];
  onNavigate: (target: ModuleId) => void;
  onSyncLiveDisasters?: () => void;
  moduleDeckSlot: React.ReactNode;
}

function formatRelativeTime(timeMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timeMs) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const HomePageView: React.FC<HomePageViewProps> = ({
  user,
  clockLabel,
  dateLabel,
  forecasts,
  incidents,
  alerts,
  threats,
  resources,
  onNavigate,
  onSyncLiveDisasters,
  moduleDeckSlot,
}) => {
  const [liveFeed, setLiveFeed] = useState<RealtimeFeedResponse | null>(null);
  const [archOverview, setArchOverview] = useState<ArchitectureOverviewResponse | null>(null);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const loadRealtimeFeed = useCallback(async (force = false) => {
    if (force) setIsRefreshing(true);
    setFeedError(null);
    try {
      const data = await fetchRealtimeFeed(force);
      setLiveFeed(data);
    } catch {
      setFeedError('Unable to reach live external feeds right now. Showing live Firestore records.');
    } finally {
      setIsLoadingFeed(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadRealtimeFeed(false);
    void fetchPlatformArchitecture()
      .then((info) => setArchOverview(info))
      .catch(() => {});
    const interval = window.setInterval(() => {
      void loadRealtimeFeed(false);
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [loadRealtimeFeed]);

  const publishedAlerts = alerts.filter((a) => a.status === 'Published');
  const openIncidents = incidents.filter((i) => i.status !== 'Resolved');
  const activeCyber = threats.filter((t) => t.status !== 'Contained');
  const lastSyncTime = liveFeed?.fetchedAt
    ? new Date(liveFeed.fetchedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  return (
    <div className="space-y-6">
      {/* Compact Header + Live Operations Status Strip */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="text-[11px] font-mono text-slate-400">
              Real-Time Security &amp; Safety Hub · {dateLabel} · {clockLabel}
            </div>
            <h2 className="font-display text-lg sm:text-xl font-semibold text-slate-100 leading-snug">
              Welcome back, {user.name}
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Choose any module below or monitor live global earthquakes (USGS), active cyber vulnerabilities (CISA KEV), real-time weather, and Firestore emergency alerts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('response')}
              className="min-h-[38px] px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-semibold text-white inline-flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Siren className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Emergency SOS</span>
            </button>

            <button
              type="button"
              onClick={() => {
                void loadRealtimeFeed(true);
                onSyncLiveDisasters?.();
              }}
              disabled={isRefreshing}
              className="min-h-[38px] px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 inline-flex items-center gap-2 disabled:opacity-60 transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh Live Data'}</span>
            </button>

            <a
              href="https://zoom.earth/maps/satellite/#view=17.61,85.82,5.7z/date=2026-11-18,14:30,+5.5"
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[38px] px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-sky-300 inline-flex items-center gap-1.5 transition-colors"
            >
              <Satellite className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
              <span>Zoom Earth Satellite</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>

            <button
              type="button"
              onClick={() => onNavigate('command')}
              className="min-h-[38px] px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <span>Open Google Maps</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Live Real-Time Platform Metrics (Clickable) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={() => onNavigate('alerts')}
            className="p-3 rounded-lg border border-slate-800 bg-slate-950 hover:border-slate-700 text-left transition-colors"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Live Safety Alerts</span>
              <BellRing className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            </div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-100">
              {publishedAlerts.length}
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">
              {publishedAlerts[0]?.title || 'All clear right now'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('response')}
            className="p-3 rounded-lg border border-slate-800 bg-slate-950 hover:border-slate-700 text-left transition-colors"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Active Emergencies</span>
              <Siren className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />
            </div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-100">
              {openIncidents.length}
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">
              {openIncidents[0]?.region || 'No open tickets'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('disaster')}
            className="p-3 rounded-lg border border-slate-800 bg-slate-950 hover:border-slate-700 text-left transition-colors"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Disaster Feeds</span>
              <Activity className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
            </div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-100">
              {forecasts.length + (liveFeed?.earthquakes.length ?? 0)}
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">
              {liveFeed?.sources.usgs === 'live'
                ? `${liveFeed.earthquakes.length} live USGS M4.5+ quakes`
                : `${forecasts.length} active hazard zones`}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('cyber')}
            className="p-3 rounded-lg border border-slate-800 bg-slate-950 hover:border-slate-700 text-left transition-colors"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Cyber Advisories</span>
              <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            </div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-100">
              {user.role === 'administrator'
                ? activeCyber.length + (liveFeed?.cyberAdvisories.length ?? 0)
                : liveFeed?.cyberAdvisories.length ?? activeCyber.length}
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">
              {liveFeed?.sources.cisa === 'live'
                ? 'Live CISA KEV threat feed'
                : `${resources.length} verified aid hubs`}
            </div>
          </button>
        </div>
      </div>

      {/* Primary Modules Launcher Grid */}
      <section aria-labelledby="home-modules-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 id="home-modules-heading" className="font-display text-sm font-semibold text-slate-100">
              All Platform Modules
            </h3>
            <p className="text-xs text-slate-400">
              Select a workspace to launch disaster prediction, cyber threat scanning, Google Maps satellite radar, or AI help.
            </p>
          </div>
          {lastSyncTime && (
            <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
              Live sync: {lastSyncTime}
            </span>
          )}
        </div>
        {moduleDeckSlot}
      </section>

      {/* Live Disaster Incidents Feed (CurrentDisaster.com · GDACS · NASA EONET · USGS) */}
      <section aria-labelledby="home-disasters-live-heading" className="space-y-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="home-disasters-live-heading" className="font-display text-sm font-semibold text-slate-100">
                Live Disaster Incidents Synced to NEXORA AI
              </h3>
              <p className="text-[11px] text-slate-400">
                Continuously checked from CurrentDisaster.com, GDACS (UN/EU), NASA EONET, and USGS — plotted live on Google Maps.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <a
                href="https://currentdisaster.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-md border border-slate-700 bg-slate-950 text-blue-300 hover:border-slate-600 inline-flex items-center gap-1 transition-colors"
              >
                <span>CurrentDisaster.com</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
              <a
                href="https://www.gdacs.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-md border border-slate-700 bg-slate-950 text-emerald-300 hover:border-slate-600 inline-flex items-center gap-1 transition-colors"
              >
                <span>GDACS</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
              <a
                href="https://eonet.gsfc.nasa.gov/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-md border border-slate-700 bg-slate-950 text-sky-300 hover:border-slate-600 inline-flex items-center gap-1 transition-colors"
              >
                <span>NASA EONET</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
              <a
                href="https://zoom.earth/maps/satellite/#view=17.61,85.82,5.7z/date=2026-11-18,14:30,+5.5"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-md border border-slate-700 bg-slate-950 text-sky-300 hover:border-slate-600 inline-flex items-center gap-1 transition-colors"
              >
                <span>Zoom Earth</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {isLoadingFeed ? (
              <div className="col-span-full p-3 text-xs text-slate-400">
                Checking CurrentDisaster.com, GDACS, NASA EONET &amp; USGS live disaster feeds...
              </div>
            ) : !liveFeed?.liveDisasters || liveFeed.liveDisasters.length === 0 ? (
              <div className="col-span-full p-3 text-xs text-slate-400">
                No external disaster incidents returned in this poll window. Click Refresh Live Data to retry.
              </div>
            ) : (
              liveFeed.liveDisasters.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-lg border border-slate-800 bg-slate-950 flex flex-col justify-between gap-2 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                      <span
                        className={
                          item.severity === 'Critical'
                            ? 'text-red-400 font-semibold'
                            : item.severity === 'High'
                            ? 'text-amber-400 font-semibold'
                            : 'text-blue-400 font-semibold'
                        }
                      >
                        {item.category.toUpperCase()} · {plainSeverity(item.severity)}
                      </span>
                      <span className="text-slate-400">{item.sourceName}</span>
                    </div>
                    <div className="font-semibold text-slate-100 leading-snug line-clamp-1">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-400 line-clamp-1">
                      {item.region} · {item.metric}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800 text-[11px]">
                    <a
                      href={`https://zoom.earth/maps/satellite/#view=${item.lat.toFixed(2)},${item.lng.toFixed(2)},7z`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
                    >
                      <span>Zoom Earth</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
                    >
                      <span>Source</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Real-Time Global Intelligence Feeds */}
      <section aria-labelledby="home-realtime-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="home-realtime-heading" className="font-display text-sm font-semibold text-slate-100">
              Real-Time Global Intelligence
            </h3>
            <p className="text-xs text-slate-400">
              Live external telemetry auto-refreshes every 60 seconds alongside real-time Firestore alerts.
            </p>
          </div>
          {feedError && (
            <span className="text-xs text-amber-400">{feedError}</span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Column 1: Live USGS Earthquakes */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100">
                  Live Earthquakes (USGS M4.5+)
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {liveFeed?.sources.usgs === 'live' ? 'Source: USGS GeoJSON Live' : 'Polling USGS feed'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('disaster')}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap"
              >
                Disasters
              </button>
            </div>

            <div className="divide-y divide-slate-800 flex-1">
              {isLoadingFeed ? (
                <div className="p-4 text-xs text-slate-400">Loading real-time USGS seismic feed...</div>
              ) : !liveFeed || liveFeed.earthquakes.length === 0 ? (
                <div className="p-4 text-xs text-slate-400">
                  No M4.5+ earthquakes reported in the current live window.
                </div>
              ) : (
                liveFeed.earthquakes.map((eq) => (
                  <div key={eq.id} className="px-4 py-3 space-y-1 text-xs hover:bg-slate-800/40 transition-colors">
                    <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                      <span
                        className={
                          eq.magnitude >= 6
                            ? 'text-red-400 font-semibold'
                            : eq.magnitude >= 5.2
                            ? 'text-amber-400 font-semibold'
                            : 'text-blue-400 font-semibold'
                        }
                      >
                        M {eq.magnitude.toFixed(1)} · {eq.depthKm} km depth
                      </span>
                      <span className="text-slate-400 tabular-nums">
                        {formatRelativeTime(eq.timeMs)}
                      </span>
                    </div>
                    <div className="text-slate-100 font-medium leading-snug">{eq.place}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2: Live CISA KEV Cybersecurity Vulnerabilities */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100">
                  Live Cyber Exploits (CISA KEV)
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {liveFeed?.sources.cisa === 'live'
                    ? 'Source: CISA Known Exploited CVEs'
                    : 'Polling CISA feed'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('cyber')}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap"
              >
                Cyber Safety
              </button>
            </div>

            <div className="divide-y divide-slate-800 flex-1">
              {isLoadingFeed ? (
                <div className="p-4 text-xs text-slate-400">Loading real-time CISA KEV advisories...</div>
              ) : !liveFeed || liveFeed.cyberAdvisories.length === 0 ? (
                <div className="p-4 text-xs text-slate-400">
                  CISA advisory feed temporarily unavailable. Open Cyber Safety to scan URLs or messages.
                </div>
              ) : (
                liveFeed.cyberAdvisories.map((adv) => (
                  <div key={adv.cveId} className="px-4 py-3 space-y-1 text-xs hover:bg-slate-800/40 transition-colors">
                    <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                      <span className="text-emerald-400 font-semibold">{adv.cveId}</span>
                      <span className="text-slate-400 tabular-nums">{adv.dateAdded}</span>
                    </div>
                    <div className="text-slate-100 font-medium leading-snug line-clamp-1">
                      {adv.vendor} {adv.product}
                    </div>
                    <div className="text-[11px] text-slate-400 line-clamp-1">{adv.title}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 3: Live Global Weather + Latest Published Alerts */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100">
                  Live Weather &amp; Active Alerts
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Open-Meteo Live + Firestore Alerts
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('alerts')}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap"
              >
                All Alerts
              </button>
            </div>

            <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
              <div className="grid grid-cols-2 gap-2">
                {isLoadingFeed ? (
                  <div className="col-span-2 text-xs text-slate-400 py-2">
                    Loading live city weather...
                  </div>
                ) : !liveFeed || liveFeed.weather.length === 0 ? (
                  <div className="col-span-2 text-xs text-slate-400 py-2">
                    Live weather feed unavailable right now.
                  </div>
                ) : (
                  liveFeed.weather.map((w) => (
                    <div
                      key={w.city}
                      className="p-2.5 rounded-lg border border-slate-800 bg-slate-950 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-slate-100">{w.city}</span>
                        <span className="font-mono text-blue-400 tabular-nums">
                          {w.temperatureC}°C
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{w.condition}</div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Wind className="w-3 h-3 text-slate-500" aria-hidden="true" />
                          {w.windKmh} km/h
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CloudRain className="w-3 h-3 text-slate-500" aria-hidden="true" />
                          {w.precipitationMm} mm
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-2.5 border-t border-slate-800 space-y-2">
                <div className="text-[11px] font-medium text-slate-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span>Latest Verified Alerts ({publishedAlerts.length})</span>
                </div>
                {publishedAlerts.length === 0 ? (
                  <div className="text-[11px] text-slate-400">
                    No active alerts right now.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {publishedAlerts.slice(0, 2).map((al) => (
                      <button
                        key={al.id}
                        type="button"
                        onClick={() => onNavigate('alerts')}
                        className="w-full p-2.5 rounded-lg border border-slate-800 bg-slate-950 hover:border-slate-700 text-left text-xs transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                          <span className="text-amber-400">{plainSeverity(al.severity)}</span>
                          <span className="text-slate-400 truncate">{al.region}</span>
                        </div>
                        <div className="text-slate-100 font-medium truncate mt-0.5">
                          {al.title}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Additional Live External Feeds: NOAA Space Weather + Open-Meteo Air Quality */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* NOAA SWPC Space Weather */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" aria-hidden="true" />
                  <span>Live Geomagnetic &amp; GPS Weather (NOAA SWPC)</span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {liveFeed?.sources.noaaSpaceWeather === 'live'
                    ? 'Source: NOAA Space Weather Prediction Center (Planetary K-Index)'
                    : 'Polling NOAA SWPC API'}
                </div>
              </div>
              <a
                href="https://www.swpc.noaa.gov/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 shrink-0"
              >
                <span>NOAA SWPC</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
            <div className="p-4">
              {isLoadingFeed ? (
                <div className="text-xs text-slate-400">Loading NOAA planetary K-index...</div>
              ) : !liveFeed?.spaceWeather ? (
                <div className="text-xs text-slate-400">NOAA SWPC telemetry temporarily unavailable.</div>
              ) : (
                <div className="grid grid-cols-3 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-950">
                    <div className="text-[10px] font-mono uppercase text-slate-400">Kp Index</div>
                    <div className="mt-1 font-mono text-lg font-semibold text-violet-300 tabular-nums">
                      {liveFeed.spaceWeather.kpIndex.toFixed(2)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-950">
                    <div className="text-[10px] font-mono uppercase text-slate-400">Storm Scale</div>
                    <div className="mt-1 font-semibold text-slate-100">
                      {liveFeed.spaceWeather.stormLevel}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-950">
                    <div className="text-[10px] font-mono uppercase text-slate-400">GPS &amp; Comms</div>
                    <div
                      className={`mt-1 font-semibold truncate ${
                        liveFeed.spaceWeather.kpIndex >= 5 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {liveFeed.spaceWeather.kpIndex >= 5 ? 'Elevated Alert' : 'Nominal'}
                    </div>
                  </div>
                  <div className="col-span-3 text-[11px] text-slate-300 leading-relaxed pt-1">
                    {liveFeed.spaceWeather.gpsImpact}
                    <span className="text-slate-500 font-mono ml-2">
                      ({liveFeed.spaceWeather.observedAt} UTC)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Open-Meteo Live Air Quality (US AQI / PM2.5) */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                  <span>Live Air Quality &amp; Smoke Telemetry (Open-Meteo AQI)</span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {liveFeed?.sources.openMeteoAqi === 'live'
                    ? 'Source: Open-Meteo Air Quality API (US AQI · PM2.5 · PM10)'
                    : 'Polling Open-Meteo AQI'}
                </div>
              </div>
              <a
                href="https://open-meteo.com/en/docs/air-quality-api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 shrink-0"
              >
                <span>Open-Meteo</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
            <div className="p-3.5 grid grid-cols-2 gap-2 text-xs">
              {isLoadingFeed ? (
                <div className="col-span-2 text-slate-400 py-2">Loading live air quality readings...</div>
              ) : !liveFeed?.airQuality || liveFeed.airQuality.length === 0 ? (
                <div className="col-span-2 text-slate-400 py-2">Air quality telemetry temporarily unavailable.</div>
              ) : (
                liveFeed.airQuality.map((aq) => (
                  <div
                    key={aq.city}
                    className="p-2.5 rounded-lg border border-slate-800 bg-slate-950 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-slate-100">{aq.city}</span>
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          aq.usAqi >= 151
                            ? 'text-red-400'
                            : aq.usAqi >= 101
                            ? 'text-amber-400'
                            : aq.usAqi >= 51
                            ? 'text-sky-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        AQI {aq.usAqi}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 truncate">{aq.category}</div>
                    <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                      PM2.5: {aq.pm25} µg/m³ · PM10: {aq.pm10}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Platform Architecture: Frontend, Backend, Database & Live Datasets */}
      <section aria-labelledby="home-architecture-heading" className="space-y-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="home-architecture-heading" className="font-display text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" aria-hidden="true" />
                <span>System Architecture, Backend &amp; Live Datasets</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Complete transparency into the frontend, Express backend, Firebase Firestore database, and live external APIs powering NEXORA AI.
              </p>
            </div>
            <span className="text-[11px] font-mono text-emerald-400">
              {archOverview ? `${archOverview.dataSources.length} live integrations active` : 'Loading stack...'}
            </span>
          </div>

          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-950 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase text-blue-400">
                  <FolderTree className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Frontend Layer</span>
                </div>
                <div className="font-semibold text-slate-100">
                  React 19 + TypeScript + Tailwind CSS
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Organized in <code className="font-mono text-slate-200">frontend/</code> (typed API client &amp; official response department registry) and <code className="font-mono text-slate-200">src/</code> (dashboard modules &amp; Google Maps satellite UI).
                </p>
              </div>

              <div className="p-3 rounded-lg border border-slate-800 bg-slate-950 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase text-emerald-400">
                  <Server className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Backend Layer</span>
                </div>
                <div className="font-semibold text-slate-100">
                  Node.js + Express (<code className="font-mono">backend/</code> + <code className="font-mono">server.ts</code>)
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Live feed aggregation &amp; caching (<code className="font-mono text-slate-200">/api/realtime/feed</code>, <code className="font-mono text-slate-200">/api/disasters/live</code>, <code className="font-mono text-slate-200">/api/weather/grid</code>, <code className="font-mono text-slate-200">/api/ai/*</code>, <code className="font-mono text-slate-200">/api/system/architecture</code>).
                </p>
              </div>

              <div className="p-3 rounded-lg border border-slate-800 bg-slate-950 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase text-amber-400">
                  <Database className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Persistent Database</span>
                </div>
                <div className="font-semibold text-slate-100">
                  {archOverview?.database.engine || 'Firebase Cloud Firestore + Auth'}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Stores Citizen SOS incidents, Admin approvals &amp; department assignments, alerts, relief hubs, users, AI knowledge base, and audit logs across{' '}
                  <span className="font-mono text-slate-200">
                    {archOverview?.database.collections.length ?? 10} collections
                  </span>.
                </p>
              </div>
            </div>

            {archOverview && archOverview.dataSources.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                {archOverview.dataSources.map((src) => (
                  <div
                    key={src.id}
                    className="p-3 rounded-lg border border-slate-800 bg-slate-950 flex flex-col justify-between gap-1.5"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-100 truncate">{src.name}</span>
                        <span className="text-[10px] font-mono text-blue-400 shrink-0">{src.category}</span>
                      </div>
                      <div className="text-[11px] text-slate-300 leading-snug">{src.datasetOrFeed}</div>
                    </div>
                    <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
                      <span className="truncate">{src.backendRoute}</span>
                      <a
                        href={src.providerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-0.5 shrink-0"
                      >
                        <span>Source</span>
                        <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

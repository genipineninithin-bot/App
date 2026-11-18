/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  ArrowUpRight,
  Bell,
  BellRing,
  Bot,
  Flame,
  HeartPulse,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldAlert,
  Siren,
  X,
} from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import {
  adminUpdateUserAccount,
  appendAuditLogDoc,
  createAlertDoc,
  createIncidentTicket,
  createReliefResourceDoc,
  isBootstrappedAdminEmail,
  removeAiKnowledgeDoc,
  saveAiKnowledgeDoc,
  saveDisasterForecast,
  saveSystemConfigDoc,
  seedBaselineTelemetryIfEmpty,
  subscribeAdminThreats,
  subscribeAdminUsers,
  subscribeAiKnowledge,
  subscribeAlerts,
  subscribeAuditLogs,
  subscribeIncidents,
  subscribePublicDisasters,
  subscribeReliefResources,
  subscribeSystemConfig,
  updateAlertStatus,
  updateDisasterStatus,
  updateIncidentAdminFields,
  updateIncidentRescueFields,
  updateIncidentStatus,
  updateOwnNotificationPrefs,
  updateReliefResourceFields,
  updateThreatStatus,
  verifyAndSyncUserProfile,
} from './services/firestoreService';
import { LoginPortal } from './components/LoginPortal';
import { NexoraBackground, NexoraLogoCenterpiece } from './components/NexoraBackground';
import { AdminSystemModule } from './components/modules/AdminSystemModule';
import { AlertsModule } from './components/modules/AlertsModule';
import { AnalyticsModule } from './components/modules/AnalyticsModule';
import { AssistantModule } from './components/modules/AssistantModule';
import { CommandCenterModule } from './components/modules/CommandCenterModule';
import { CyberModule } from './components/modules/CyberModule';
import { DisasterModule } from './components/modules/DisasterModule';
import { ReliefModule } from './components/modules/ReliefModule';
import { ResponseModule } from './components/modules/ResponseModule';
import {
  ANALYTICS_24H,
  INITIAL_AI_KNOWLEDGE,
  INITIAL_ALERTS,
  INITIAL_DISASTERS,
  INITIAL_INCIDENTS,
  INITIAL_RELIEF_RESOURCES,
  INITIAL_SYSTEM_CONFIG,
  INITIAL_THREATS,
} from './data/platformData';
import {
  AiKnowledgeEntry,
  AlertNotification,
  AuditLogEntry,
  AuthUser,
  CyberThreat,
  DisasterForecast,
  IncidentTicket,
  ModuleId,
  ReliefResource,
  SystemConfigState,
  UserRole,
} from './types/modules';

const PORTAL_MODE_KEY = 'nexora_portal_mode';

interface ModuleMeta {
  id: ModuleId;
  num: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  imageUrl: string;
  imageAlt: string;
  roles: UserRole[];
  icon: typeof Activity;
}

const POP_MODULES: ModuleMeta[] = [
  {
    id: 'command',
    num: '01',
    title: 'Command Center',
    shortTitle: 'Command',
    subtitle: 'Unified situational theater & risk overview',
    imageUrl: '/src/assets/images/module_command_center_1794980254319.jpg',
    imageAlt: 'Disaster and cybersecurity command center bridge with panoramic situational wall',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: LayoutDashboard,
  },
  {
    id: 'disaster',
    num: '02',
    title: 'Disaster Prediction & Monitoring',
    shortTitle: 'Disaster',
    subtitle: 'Flood, storm, seismic & early warning maps',
    imageUrl: '/src/assets/images/module_disaster_monitoring_1794979857261.jpg',
    imageAlt: 'Orbital satellite view of coastal cyclone spiral and terrain',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: Flame,
  },
  {
    id: 'cyber',
    num: '03',
    title: 'Cybersecurity & Threat Detection',
    shortTitle: 'Cyber',
    subtitle: 'Phishing URL scanner, log audit & containment',
    imageUrl: '/src/assets/images/module_cyber_detection_1794979857655.jpg',
    imageAlt: 'High-security enterprise server corridor with optical fiber links',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: ShieldAlert,
  },
  {
    id: 'assistant',
    num: '04',
    title: 'NEXORA AI Assistant',
    shortTitle: 'Nexora AI',
    subtitle: 'Multilingual guidance, first aid & checklists',
    imageUrl: '/src/assets/images/module_nexora_assistant_1794979857299.jpg',
    imageAlt: 'Precision smoked glass prisms and titanium compute module',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: Bot,
  },
  {
    id: 'response',
    num: '05',
    title: 'Emergency Response & Incident Ops',
    shortTitle: 'Response',
    subtitle: 'Incident reporting, damage AI & triage dispatch',
    imageUrl: '/src/assets/images/module_emergency_response_1794979859286.jpg',
    imageAlt: 'Emergency operations dispatch desk with field tablet and tactical radio',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: Siren,
  },
  {
    id: 'relief',
    num: '06',
    title: 'Rescue & Relief Management',
    shortTitle: 'Relief Ops',
    subtitle: 'Hospitals, shelters, supplies & ambulance fleet',
    imageUrl: '/src/assets/images/module_rescue_relief_1794984084615.jpg',
    imageAlt: 'Tactical medical relief staging hub and emergency ambulance bay',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: HeartPulse,
  },
  {
    id: 'analytics',
    num: '07',
    title: 'Data Analytics & Intelligence',
    shortTitle: 'Analytics',
    subtitle: 'Trends, exposure metrics & analytical reports',
    imageUrl: '/src/assets/images/module_data_analytics_1794979859044.jpg',
    imageAlt: 'Layered dark translucent glass planes etched with topographic telemetry waves',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: Activity,
  },
  {
    id: 'alerts',
    num: '08',
    title: 'Secure Alert & Notification System',
    shortTitle: 'Alerts',
    subtitle: 'Official warnings, SMS/Email channels & history',
    imageUrl: '/src/assets/images/module_secure_alerts_1794984085342.jpg',
    imageAlt: 'Encrypted satellite emergency broadcast console in dark command room',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: BellRing,
  },
  {
    id: 'admin',
    num: '09',
    title: 'Admin & System Management',
    shortTitle: 'Admin',
    subtitle: 'Accounts, roles, AI/API config & audit logs',
    imageUrl: '/src/assets/images/module_admin_system_1794984086150.jpg',
    imageAlt: 'Precision enterprise security governance and server rack terminal',
    roles: ['administrator'],
    icon: Settings,
  },
];

interface ModuleLauncherCardProps {
  mod: ModuleMeta;
  isOpen: boolean;
  isImageBroken: boolean;
  metricLabel: string;
  onOpen: () => void;
  onImageError: () => void;
}

const ModuleLauncherCard: React.FC<ModuleLauncherCardProps> = ({
  mod,
  isOpen,
  isImageBroken,
  metricLabel,
  onOpen,
  onImageError,
}) => {
  const Icon = mod.icon;
  const [spotlight, setSpotlight] = useState({ x: 50, y: 50, active: false });

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'touch') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    setSpotlight({ x, y, active: true });
  };

  const handlePointerLeave = () => {
    setSpotlight((prev) => ({ ...prev, active: false }));
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`group relative text-left rounded-xl border backdrop-blur-md overflow-hidden flex flex-col transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-2 hover:scale-[1.015] active:scale-[0.98] xl:group-hover/dock:opacity-75 hover:!opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isOpen
          ? 'bg-blue-950/55 border-blue-400/85 shadow-[0_18px_38px_-12px_rgba(37,99,235,0.55)]'
          : 'bg-[#0C1322]/82 border-slate-700/65 hover:bg-[#111D35]/95 hover:border-blue-400/75 hover:shadow-[0_22px_44px_-14px_rgba(37,99,235,0.5)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-0 left-0 right-0 z-20 h-[2px] bg-gradient-to-r from-transparent via-blue-400 to-transparent transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] origin-center ${
          isOpen ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
        }`}
      />

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-200"
        style={{
          opacity: spotlight.active ? 1 : 0,
          background: `radial-gradient(240px circle at ${spotlight.x}% ${spotlight.y}%, rgba(96, 165, 250, 0.2), transparent 70%)`,
        }}
      />

      <div className="relative w-full h-20 sm:h-24 lg:h-[88px] xl:h-24 overflow-hidden bg-slate-900 border-b border-slate-800/80 shrink-0">
        {!isImageBroken ? (
          <img
            src={mod.imageUrl}
            alt={mod.imageAlt}
            referrerPolicy="no-referrer"
            onError={onImageError}
            className="h-full w-full object-cover transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110 group-hover:brightness-115 group-hover:saturate-110"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950 flex items-center justify-center">
            <Icon className="w-7 h-7 text-blue-400/70" aria-hidden="true" />
          </div>
        )}

        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -translate-x-[130%] group-hover:translate-x-[130%] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] bg-gradient-to-r from-transparent via-white/18 to-transparent skew-x-[-22deg]"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0C1322] via-[#0C1322]/25 to-transparent opacity-90 group-hover:opacity-70 transition-opacity duration-200"
        />

        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-2 right-2 w-6 h-6 rounded-md bg-slate-950/70 border border-blue-400/40 backdrop-blur-sm flex items-center justify-center opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-blue-300" />
        </span>
      </div>

      <div className="relative z-10 p-2.5 sm:p-3 flex-1 flex flex-col justify-between gap-1.5 w-full">
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Icon
              className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 group-hover:text-blue-300 group-hover:scale-110 transition-all duration-200 shrink-0"
              aria-hidden="true"
            />
            <span className="text-[11px] font-mono text-slate-400 group-hover:text-blue-300 transition-colors">
              {mod.num}
            </span>
          </div>
          <span className="text-[10px] sm:text-[11px] font-mono tabular-nums text-slate-400 group-hover:text-slate-100 transition-colors truncate">
            {metricLabel}
          </span>
        </div>

        <div>
          <div className="text-xs sm:text-[13px] font-semibold text-slate-100 group-hover:text-white leading-snug transition-colors">
            {mod.title}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400 group-hover:text-slate-300 line-clamp-1 hidden sm:block transition-colors">
            {mod.subtitle}
          </div>
        </div>
      </div>
    </button>
  );
};

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const [activeModule, setActiveModule] = useState<ModuleId | 'overview'>('command');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [forecasts, setForecasts] = useState<DisasterForecast[]>(INITIAL_DISASTERS);
  const [threats, setThreats] = useState<CyberThreat[]>(INITIAL_THREATS);
  const [incidents, setIncidents] = useState<IncidentTicket[]>(INITIAL_INCIDENTS);
  const [reliefResources, setReliefResources] = useState<ReliefResource[]>(
    INITIAL_RELIEF_RESOURCES
  );
  const [alerts, setAlerts] = useState<AlertNotification[]>(INITIAL_ALERTS);
  const [aiKnowledge, setAiKnowledge] = useState<AiKnowledgeEntry[]>(INITIAL_AI_KNOWLEDGE);
  const [systemConfig, setSystemConfig] = useState<SystemConfigState>(INITIAL_SYSTEM_CONFIG);
  const [adminUsers, setAdminUsers] = useState<AuthUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [isSyncingUsgs, setIsSyncingUsgs] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [topSearch, setTopSearch] = useState('');
  const [showNotifPopover, setShowNotifPopover] = useState(false);
  const [clockLabel, setClockLabel] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [dateLabel, setDateLabel] = useState(() =>
    new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  );
  const [cyberCounts, setCyberCounts] = useState<{ scanned: number; phishing: number }>(() => {
    try {
      const raw = localStorage.getItem('nexora_cyber_stats_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          scanned: Number(parsed?.scanned) || 142,
          phishing: Number(parsed?.phishing) || 19,
        };
      }
    } catch {
      // ignore storage errors
    }
    return { scanned: 142, phishing: 19 };
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setClockLabel(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      setDateLabel(
        now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const recordCyberScan = (_kind: 'url' | 'message' | 'log', verdict: string) => {
    const isThreat = /Malicious|Suspicious/i.test(verdict);
    setCyberCounts((prev) => {
      const next = {
        scanned: prev.scanned + 1,
        phishing: prev.phishing + (isThreat ? 1 : 0),
      };
      try {
        localStorage.setItem('nexora_cyber_stats_v1', JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  useEffect(() => {
    let settled = false;
    const safetyTimer = window.setTimeout(() => {
      if (!settled) {
        setIsCheckingSession(false);
      }
    }, 3000);

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      settled = true;
      window.clearTimeout(safetyTimer);

      if (!fbUser) {
        localStorage.removeItem(PORTAL_MODE_KEY);
        setUser(null);
        setIsCheckingSession(false);
        return;
      }

      const savedMode = localStorage.getItem(PORTAL_MODE_KEY);
      if (
        savedMode !== 'citizen' &&
        savedMode !== 'rescue' &&
        savedMode !== 'administrator'
      ) {
        setIsCheckingSession(false);
        return;
      }

      try {
        const { authUser } = await verifyAndSyncUserProfile(fbUser, savedMode);
        setUser(authUser);
      } catch {
        localStorage.removeItem(PORTAL_MODE_KEY);
        setUser(null);
      } finally {
        setIsCheckingSession(false);
      }
    });

    return () => {
      window.clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const fbUser = auth.currentUser;
    if (!user || !fbUser) return;

    const isBootstrappedAdmin = isBootstrappedAdminEmail(
      fbUser.email,
      fbUser.emailVerified
    );
    const isAdminSession = user.role === 'administrator' && isBootstrappedAdmin;

    let seedAttempted = false;
    let disastersChecked = false;
    let threatsChecked = !isAdminSession;
    let incidentsChecked = false;
    let reliefChecked = false;
    let alertsChecked = false;
    let kbChecked = false;
    let cfgChecked = !isAdminSession;

    let disastersEmpty = false;
    let threatsEmpty = false;
    let incidentsEmpty = false;
    let reliefEmpty = false;
    let alertsEmpty = false;
    let kbEmpty = false;
    let cfgEmpty = false;

    const maybeSeedForAdmin = () => {
      if (!isBootstrappedAdmin || seedAttempted) return;
      if (
        !disastersChecked ||
        !threatsChecked ||
        !incidentsChecked ||
        !reliefChecked ||
        !alertsChecked ||
        !kbChecked ||
        !cfgChecked
      ) {
        return;
      }
      if (
        disastersEmpty ||
        threatsEmpty ||
        incidentsEmpty ||
        reliefEmpty ||
        alertsEmpty ||
        kbEmpty ||
        cfgEmpty
      ) {
        seedAttempted = true;
        void seedBaselineTelemetryIfEmpty(fbUser.uid, {
          disasters: disastersEmpty,
          threats: threatsEmpty,
          incidents: incidentsEmpty,
          relief: reliefEmpty,
          alerts: alertsEmpty,
          knowledge: kbEmpty,
          systemConfig: cfgEmpty,
        }).catch(() => {
          setToast('Baseline telemetry sync skipped or restricted by Firestore rules.');
        });
      }
    };

    const unsubDisasters = subscribePublicDisasters((docs, isEmpty) => {
      disastersChecked = true;
      disastersEmpty = isEmpty;
      if (!isEmpty) setForecasts(docs);
      maybeSeedForAdmin();
    });

    const unsubIncidents = subscribeIncidents(isBootstrappedAdmin, (docs, isEmpty) => {
      incidentsChecked = true;
      incidentsEmpty = isEmpty;
      if (!isEmpty) setIncidents(docs);
      maybeSeedForAdmin();
    });

    const unsubRelief = subscribeReliefResources((docs, isEmpty) => {
      reliefChecked = true;
      reliefEmpty = isEmpty;
      if (!isEmpty) setReliefResources(docs);
      maybeSeedForAdmin();
    });

    const unsubAlerts = subscribeAlerts(user.role, isBootstrappedAdmin, (docs, isEmpty) => {
      alertsChecked = true;
      alertsEmpty = isEmpty;
      if (!isEmpty) setAlerts(docs);
      maybeSeedForAdmin();
    });

    const unsubKnowledge = subscribeAiKnowledge((docs, isEmpty) => {
      kbChecked = true;
      kbEmpty = isEmpty;
      if (!isEmpty) setAiKnowledge(docs);
      maybeSeedForAdmin();
    });

    let unsubThreats: (() => void) | undefined;
    let unsubConfig: (() => void) | undefined;
    let unsubUsers: (() => void) | undefined;
    let unsubAudit: (() => void) | undefined;

    if (isAdminSession) {
      unsubThreats = subscribeAdminThreats((docs, isEmpty) => {
        threatsChecked = true;
        threatsEmpty = isEmpty;
        if (!isEmpty) setThreats(docs);
        maybeSeedForAdmin();
      });

      unsubConfig = subscribeSystemConfig((cfg) => {
        cfgChecked = true;
        cfgEmpty = cfg === null;
        if (cfg) setSystemConfig(cfg);
        maybeSeedForAdmin();
      });

      unsubUsers = subscribeAdminUsers((users) => {
        setAdminUsers(users);
      });

      unsubAudit = subscribeAuditLogs((logs) => {
        setAuditLogs(logs);
      });
    }

    return () => {
      unsubDisasters();
      unsubIncidents();
      unsubRelief();
      unsubAlerts();
      unsubKnowledge();
      if (unsubThreats) unsubThreats();
      if (unsubConfig) unsubConfig();
      if (unsubUsers) unsubUsers();
      if (unsubAudit) unsubAudit();
    };
  }, [user]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileNavOpen(false);
        setShowNotifPopover(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const visibleModules = useMemo(() => {
    if (!user) return [];
    return POP_MODULES.filter((m) => m.roles.includes(user.role));
  }, [user]);

  const recordAudit = (action: string, target: string, detail: string) => {
    if (!user) return;
    void appendAuditLogDoc(user, action, target, detail).catch(() => {
      // Structured Firestore error already logged in handleFirestoreError
    });
  };

  const handleAuthenticated = (authUser: AuthUser) => {
    setUser(authUser);
    setActiveModule('command');
    setMobileNavOpen(false);
    const portalLabel =
      authUser.role === 'administrator'
        ? 'Administrator Command'
        : authUser.role === 'rescue'
        ? 'Rescue Team Portal'
        : 'User / Citizen Portal';
    setToast(`Signed in to ${portalLabel} as ${authUser.name}.`);
    void appendAuditLogDoc(
      authUser,
      'SESSION_SIGN_IN',
      portalLabel,
      `Authenticated into ${authUser.role} portal`
    ).catch(() => {
      // Structured Firestore error already logged in handleFirestoreError
    });
  };

  const formatActionError = (err: unknown, fallback: string): string => {
    const raw = err instanceof Error ? err.message : fallback;
    try {
      const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
      if (parsed?.error) {
        return `Action could not be completed (${parsed.path || parsed.operationType || 'Firestore'}): ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return raw || fallback;
  };

  const handleSignOut = async () => {
    localStorage.removeItem(PORTAL_MODE_KEY);
    setActiveModule('command');
    setMobileNavOpen(false);
    setUser(null);
    try {
      await signOut(auth);
    } catch (err) {
      setToast(formatActionError(err, 'Unable to sign out cleanly.'));
    }
  };

  const handleSyncUsgs = async () => {
    setIsSyncingUsgs(true);
    setSyncNotice(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(
        'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const features = Array.isArray(json?.features) ? json.features.slice(0, 4) : [];

      if (features.length === 0) {
        setSyncNotice('USGS feed polled: no new M4.5+ events reported.');
      } else {
        const mapped: DisasterForecast[] = features.map(
          (f: {
            id: string;
            properties: { mag: number; place: string };
            geometry: { coordinates: number[] };
          }) => {
            const mag = typeof f.properties.mag === 'number' ? f.properties.mag : 4.5;
            const depth = Math.round(f.geometry?.coordinates?.[2] || 10);
            const severity =
              mag >= 6.2 ? 'Critical' : mag >= 5.5 ? 'High' : mag >= 5.0 ? 'Moderate' : 'Low';
            return {
              id: `USGS-${String(f.id).slice(0, 6).toUpperCase()}`,
              title: `M ${mag.toFixed(1)} Seismic Event — ${f.properties.place || 'Offshore Zone'}`,
              category: 'Seismic',
              severity,
              region: f.properties.place || 'Global Seismic Mesh',
              horizon: '6h',
              confidencePct: 96,
              metric: `M ${mag.toFixed(1)} · ${depth} km depth`,
              gridExposureMw: Math.round(mag * 95),
              populationAtRisk: mag >= 6.0 ? '250,000+' : 'Assessing',
              status: mag >= 5.8 ? 'Warning' : 'Monitoring',
              summary: 'Live seismic forecast ingested from USGS real-time GeoJSON network.',
            };
          }
        );

        setForecasts((prev) => {
          const existing = new Set(prev.map((p) => p.id));
          const novel = mapped.filter((m) => !existing.has(m.id));
          return [...novel, ...prev];
        });

        if (user?.role === 'administrator' && auth.currentUser) {
          await Promise.all(
            mapped.map((item) => saveDisasterForecast(item, auth.currentUser!.uid))
          );
          setSyncNotice(`Synced & persisted ${mapped.length} live USGS seismic feeds to Firestore.`);
          recordAudit('USGS_SYNC', 'disasters', `Persisted ${mapped.length} USGS feeds`);
        } else {
          setSyncNotice(`Synced ${mapped.length} live USGS seismic feeds.`);
        }
      }
    } catch {
      setSyncNotice('Live USGS endpoint unreachable from sandbox; showing verified baseline forecasts.');
    } finally {
      setIsSyncingUsgs(false);
    }
  };

  const handleCreateWarning = async (forecast: DisasterForecast) => {
    if (user?.role !== 'administrator' || !auth.currentUser) return;
    try {
      await saveDisasterForecast(forecast, auth.currentUser.uid);
      setForecasts((prev) => [forecast, ...prev]);
      recordAudit('EARLY_WARNING_ISSUED', forecast.id, forecast.title);
      setToast(`Early warning ${forecast.id} published to disaster feeds.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to publish early warning.'));
    }
  };

  const handleEscalateForecast = async (forecast: DisasterForecast) => {
    if (!user || !auth.currentUser) return;

    const ticket: IncidentTicket = {
      id: `INC-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`,
      title: `Escalated: ${forecast.title}`,
      domain: 'Disaster',
      severity: forecast.severity,
      region: forecast.region,
      assignedUnit:
        user.role === 'administrator'
          ? 'Civil Defense & Grid Ops'
          : user.role === 'rescue'
          ? 'Field Rescue Alpha'
          : 'Citizen Alert Relay',
      platformSupport: 'Windows & Mobile',
      status: 'Dispatched',
      updatedAt: 'Just now',
      notes: `${forecast.metric} · ${forecast.gridExposureMw} MW exposure escalated from prediction feed.`,
    };

    try {
      if (user.role === 'administrator') {
        await updateDisasterStatus(forecast.id, 'Escalated');
        setForecasts((prev) =>
          prev.map((f) => (f.id === forecast.id ? { ...f, status: 'Escalated' } : f))
        );
      }
      await createIncidentTicket(ticket, auth.currentUser.uid, user.role === 'administrator');
      setIncidents((prev) => [ticket, ...prev]);
      recordAudit('ESCALATE_DISASTER', ticket.id, `Escalated from ${forecast.id}`);
      setToast(`Escalated ${forecast.id} to Emergency Response (${ticket.id}).`);
    } catch (err) {
      setToast(formatActionError(err, 'Unable to escalate forecast to Response Ops.'));
    }
  };

  const handleContainThreat = async (id: string) => {
    if (user?.role !== 'administrator') return;
    try {
      await updateThreatStatus(id, 'Contained');
      setThreats((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'Contained' } : t)));
      recordAudit('THREAT_CONTAINED', id, 'Isolated and contained endpoint threat');
      setToast(`Threat ${id} isolated and contained in Firestore.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to contain threat.'));
    }
  };

  const handleEscalateThreat = async (threat: CyberThreat) => {
    if (!user || !auth.currentUser || user.role !== 'administrator') return;
    const ticket: IncidentTicket = {
      id: `INC-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`,
      title: `Cyber Triage: ${threat.title}`,
      domain: 'Cyber',
      severity: threat.severity,
      region: threat.platform,
      assignedUnit: 'SOC Incident Containment',
      platformSupport: threat.platform.includes('Windows') ? 'Windows Desktop' : 'Mobile Field',
      status: 'Dispatched',
      updatedAt: 'Just now',
      notes: `MITRE ${threat.mitreId} · IOC ${threat.ioc}`,
    };
    try {
      await createIncidentTicket(ticket, auth.currentUser.uid, true);
      setIncidents((prev) => [ticket, ...prev]);
      recordAudit('THREAT_ESCALATED', ticket.id, `Opened from cyber threat ${threat.id}`);
      setToast(`Opened response ticket ${ticket.id} for ${threat.id}.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to escalate threat to incident queue.'));
    }
  };

  const handleAdvanceIncident = async (id: string, nextStatus: IncidentTicket['status']) => {
    if (user?.role !== 'administrator' && user?.role !== 'rescue') return;
    try {
      await updateIncidentStatus(id, nextStatus);
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === id ? { ...inc, status: nextStatus, updatedAt: 'Just now' } : inc
        )
      );
      recordAudit('INCIDENT_STATUS', id, `Advanced status to ${nextStatus}`);
      setToast(`Incident ${id} updated to ${nextStatus}.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to update incident status.'));
    }
  };

  const handleCreateIncident = async (ticket: IncidentTicket) => {
    if (!user || !auth.currentUser) return;
    try {
      await createIncidentTicket(ticket, auth.currentUser.uid, user.role === 'administrator');
      setIncidents((prev) => [ticket, ...prev]);
      recordAudit('INCIDENT_CREATED', ticket.id, ticket.title);
      setToast(`Dispatched ${ticket.id} to ${ticket.platformSupport}.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to submit emergency report.'));
    }
  };

  const handleUpdateAdminIncident = async (
    id: string,
    updates: Parameters<typeof updateIncidentAdminFields>[1]
  ) => {
    if (user?.role !== 'administrator') return;
    try {
      await updateIncidentAdminFields(id, updates);
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === id ? { ...inc, ...updates, updatedAt: 'Just now' } : inc
        )
      );
      recordAudit('INCIDENT_ADMIN_UPDATE', id, 'Updated verification, damage, impact, or rescue assignment');
      setToast(`Updated incident ${id} operational telemetry.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to update incident details.'));
    }
  };

  const handleUpdateRescueIncident = async (
    id: string,
    updates: Parameters<typeof updateIncidentRescueFields>[1]
  ) => {
    if (user?.role !== 'rescue' && user?.role !== 'administrator') return;
    try {
      await updateIncidentRescueFields(id, updates);
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === id ? { ...inc, ...updates, updatedAt: 'Just now' } : inc
        )
      );
      recordAudit('INCIDENT_RESCUE_UPDATE', id, `Triage/transfer update (${updates.status || 'triage'})`);
      setToast(`Saved rescue update for ${id}.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to save rescue update.'));
    }
  };

  const handleUpdateReliefResource = async (
    id: string,
    updates: {
      status: ReliefResource['status'];
      quantity: number;
      allocatedTo: string;
    }
  ) => {
    if (!user || !auth.currentUser || (user.role !== 'rescue' && user.role !== 'administrator'))
      return;
    try {
      await updateReliefResourceFields(id, auth.currentUser.uid, updates);
      setReliefResources((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
      );
      recordAudit('RELIEF_UPDATED', id, `Status ${updates.status}, qty ${updates.quantity}`);
      setToast(`Relief resource ${id} updated.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to update relief resource.'));
    }
  };

  const handleCreateReliefResource = async (res: ReliefResource) => {
    if (user?.role !== 'administrator' || !auth.currentUser) return;
    try {
      await createReliefResourceDoc(res, auth.currentUser.uid);
      setReliefResources((prev) => [res, ...prev]);
      recordAudit('RELIEF_ALLOCATED', res.id, res.name);
      setToast(`Allocated ${res.name}.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to allocate relief resource.'));
    }
  };

  const handleCreateAlert = async (alert: AlertNotification) => {
    if (user?.role !== 'administrator' || !auth.currentUser) return;
    try {
      await createAlertDoc(alert, auth.currentUser.uid);
      setAlerts((prev) => [alert, ...prev]);
      recordAudit('ALERT_CREATED', alert.id, alert.title);
      setToast(`Created alert draft ${alert.id}.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to create alert draft.'));
    }
  };

  const handleUpdateAlertStatus = async (
    id: string,
    status: AlertNotification['status'],
    visibility?: AlertNotification['visibility']
  ) => {
    if (user?.role !== 'administrator') return;
    try {
      await updateAlertStatus(id, status, visibility);
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status, visibility: visibility ?? a.visibility } : a
        )
      );
      recordAudit('ALERT_STATUS', id, `Set status to ${status}`);
      setToast(`Alert ${id} marked ${status}.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to update alert status.'));
    }
  };

  const handleUpdateNotificationPrefs = async (notifyEmail: boolean, notifySms: boolean) => {
    if (!user || !auth.currentUser) return;
    try {
      await updateOwnNotificationPrefs(auth.currentUser.uid, notifyEmail, notifySms);
      setUser((prev) => (prev ? { ...prev, notifyEmail, notifySms } : prev));
      setToast('Notification delivery preferences saved.');
    } catch (err) {
      setToast(formatActionError(err, 'Failed to save notification preferences.'));
    }
  };

  const handleSaveKnowledge = async (entry: AiKnowledgeEntry) => {
    if (user?.role !== 'administrator' || !auth.currentUser) return;
    try {
      await saveAiKnowledgeDoc(entry, auth.currentUser.uid);
      setAiKnowledge((prev) => [entry, ...prev]);
      recordAudit('AI_KB_ADDED', entry.id, entry.topic);
      setToast(`Added "${entry.topic}" to AI knowledge base.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to save AI knowledge entry.'));
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    if (user?.role !== 'administrator') return;
    try {
      await removeAiKnowledgeDoc(id);
      setAiKnowledge((prev) => prev.filter((k) => k.id !== id));
      recordAudit('AI_KB_REMOVED', id, 'Removed knowledge entry');
      setToast(`Removed knowledge entry ${id}.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to delete AI knowledge entry.'));
    }
  };

  const handleUpdateUserAccount = async (
    targetUid: string,
    targetEmail: string,
    role: UserRole,
    accountStatus: NonNullable<AuthUser['accountStatus']>
  ) => {
    if (user?.role !== 'administrator' || !auth.currentUser) return;
    try {
      await adminUpdateUserAccount(targetUid, targetEmail, auth.currentUser.uid, {
        role,
        accountStatus,
      });
      setAdminUsers((prev) =>
        prev.map((u) => (u.id === targetUid ? { ...u, role, accountStatus } : u))
      );
      recordAudit('USER_ROLE_UPDATE', targetEmail, `Role=${role}, Status=${accountStatus}`);
      setToast(`Updated ${targetEmail} (${role} · ${accountStatus}).`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to update user account.'));
    }
  };

  const handleSaveSystemConfig = async (cfg: SystemConfigState) => {
    if (user?.role !== 'administrator' || !auth.currentUser) return;
    try {
      await saveSystemConfigDoc(cfg, auth.currentUser.uid);
      setSystemConfig(cfg);
      recordAudit('SYSTEM_CONFIG_SAVED', 'global', `Model=${cfg.aiModel}, Retention=${cfg.auditRetentionDays}d`);
      setToast('System & AI configuration saved to Firestore.');
    } catch (err) {
      setToast(formatActionError(err, 'Failed to save system configuration.'));
    }
  };

  const getModuleMetric = (id: ModuleId) => {
    switch (id) {
      case 'command':
        return `${forecasts.length + incidents.filter((i) => i.status !== 'Resolved').length} live`;
      case 'disaster':
        return `${forecasts.length} feeds`;
      case 'cyber':
        return user?.role === 'administrator'
          ? `${threats.filter((t) => t.status !== 'Contained').length} active`
          : 'URL scan';
      case 'assistant':
        return 'Multilingual';
      case 'response':
        return `${incidents.filter((i) => i.status !== 'Resolved').length} open`;
      case 'relief':
        return `${reliefResources.length} hubs`;
      case 'analytics':
        return `${ANALYTICS_24H[ANALYTICS_24H.length - 1]?.mitigated ?? 0} mitigated`;
      case 'alerts':
        return `${alerts.filter((a) => a.status === 'Published').length} live`;
      case 'admin':
        return `${adminUsers.length || 1} accts`;
    }
  };

  const activeMeta = visibleModules.find((m) => m.id === activeModule) ?? null;

  const navigateTo = (target: ModuleId | 'overview') => {
    setActiveModule(target);
    setMobileNavOpen(false);
    setShowNotifPopover(false);
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#070B13] text-slate-100 flex flex-col">
      <NexoraBackground />

      {isCheckingSession ? (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-3 px-4">
          <NexoraLogoCenterpiece />
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-slate-800 bg-[#0C1322]/90 text-xs font-mono text-slate-300">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" aria-hidden="true" />
            <span>Initializing Nexora ai Operations Session...</span>
          </div>
        </div>
      ) : !user ? (
        <LoginPortal onAuthenticated={handleAuthenticated} />
      ) : (
        <div className="relative z-20 flex-1 flex flex-col h-screen overflow-hidden">
          {/* Top Command Navigation Bar */}
          <header className="relative z-30 w-full px-3.5 sm:px-5 py-2.5 border-b border-slate-800/90 bg-[#090E1A]/92 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen((v) => !v)}
                aria-label="Toggle navigation sidebar"
                className="lg:hidden min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-700/80 bg-[#0C1322] text-slate-200 hover:bg-slate-800"
              >
                {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('command')}
                className="text-left flex items-center gap-2.5 min-w-0"
              >
                <span className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
                  Nexora <span className="font-medium text-blue-400">ai</span>
                </span>
                <span className="hidden xl:inline text-[10px] font-mono uppercase tracking-[0.16em] text-blue-300/75 border-l border-slate-800 pl-2.5">
                  Predict · Protect · Respond · Empower
                </span>
              </button>

              {/* Quick Command Search Bar */}
              <div className="relative hidden md:block w-56 lg:w-72 ml-1">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={topSearch}
                  onChange={(e) => setTopSearch(e.target.value)}
                  placeholder="Jump to module, region, ID..."
                  aria-label="Global quick search"
                  className="w-full min-h-[36px] pl-8 pr-3 text-xs rounded-lg border border-slate-700/80 bg-[#0C1322]/90 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
                {topSearch.trim().length > 0 && (() => {
                  const q = topSearch.trim().toLowerCase();
                  const matchedMods = visibleModules
                    .filter((m) => `${m.title} ${m.subtitle}`.toLowerCase().includes(q))
                    .slice(0, 4);
                  const matchedIncidents = incidents
                    .filter((i) => `${i.id} ${i.title} ${i.region}`.toLowerCase().includes(q))
                    .slice(0, 3);
                  return (
                    <div className="absolute left-0 right-0 mt-1.5 rounded-xl border border-slate-700 bg-[#0C1322]/98 shadow-2xl overflow-hidden z-50">
                      {matchedMods.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            navigateTo(m.id);
                            setTopSearch('');
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-blue-600/20 flex items-center justify-between"
                        >
                          <span>{m.num}. {m.title}</span>
                          <span className="font-mono text-[10px] text-blue-400">Module</span>
                        </button>
                      ))}
                      {matchedIncidents.map((i) => (
                        <button
                          key={i.id}
                          type="button"
                          onClick={() => {
                            navigateTo('response');
                            setTopSearch('');
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-blue-600/20 flex items-center justify-between border-t border-slate-800/80"
                        >
                          <span className="truncate mr-2">{i.title}</span>
                          <span className="font-mono text-[10px] text-amber-400 shrink-0">{i.id}</span>
                        </button>
                      ))}
                      {matchedMods.length === 0 && matchedIncidents.length === 0 && (
                        <div className="px-3 py-2.5 text-xs text-slate-400">
                          No matching modules or incidents
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-300 min-w-0">
              <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-slate-400 tabular-nums whitespace-nowrap">
                <span>{dateLabel}</span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="text-slate-200">{clockLabel}</span>
              </div>

              {/* Notification Center Bell */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotifPopover((v) => !v)}
                  aria-label="Open alert notifications"
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-700/80 bg-[#0C1322]/90 text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1.5"
                >
                  <Bell className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span className="font-mono text-[11px] tabular-nums">
                    {alerts.filter((a) => a.status === 'Published').length}
                  </span>
                </button>

                {showNotifPopover && (
                  <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-xl border border-slate-700 bg-[#0C1322]/98 shadow-2xl overflow-hidden z-50">
                    <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-100">Active Alert Feed</span>
                      <button
                        type="button"
                        onClick={() => navigateTo('alerts')}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        View All
                      </button>
                    </div>
                    <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto">
                      {alerts
                        .filter((a) => user.role === 'administrator' || a.status === 'Published')
                        .slice(0, 4)
                        .map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => navigateTo('alerts')}
                            className="w-full px-3.5 py-2.5 text-left hover:bg-slate-900/70 space-y-0.5"
                          >
                            <div className="flex items-center justify-between text-[10px] font-mono">
                              <span className="text-amber-400">{a.severity}</span>
                              <span className="text-slate-500">{a.createdAtLabel}</span>
                            </div>
                            <div className="text-xs font-medium text-slate-100 truncate">
                              {a.title}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">{a.region}</div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              <span className="hidden sm:inline truncate max-w-[190px]">
                {user.name}{' '}
                <span className="text-slate-500" aria-hidden="true">·</span>{' '}
                <span
                  className={
                    user.role === 'administrator'
                      ? 'text-amber-400 font-medium'
                      : user.role === 'rescue'
                      ? 'text-emerald-400 font-medium'
                      : 'text-blue-400 font-medium'
                  }
                >
                  {user.role === 'administrator'
                    ? 'Administrator'
                    : user.role === 'rescue'
                    ? 'Rescue Team'
                    : 'Citizen'}
                </span>
              </span>

              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-700/80 bg-[#0C1322]/90 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            </div>
          </header>

          {/* Left Sidebar + Main Dashboard Workspace */}
          <div className="flex-1 flex min-h-0 overflow-hidden relative">
            {/* Mobile Backdrop */}
            {mobileNavOpen && (
              <div
                onClick={() => setMobileNavOpen(false)}
                className="fixed inset-0 z-30 bg-black/60 lg:hidden"
                aria-hidden="true"
              />
            )}

            {/* Left Sidebar Navigation */}
            <aside
              aria-label="Nexora ai Module Navigation"
              className={`${
                mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
              } fixed lg:static inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-slate-800/90 bg-[#090E1A]/96 lg:bg-[#090E1A]/85 backdrop-blur-xl flex flex-col justify-between transition-transform duration-200 ease-out pt-14 lg:pt-0`}
            >
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                <div className="px-2.5 py-2 mb-1 rounded-lg border border-slate-800/90 bg-[#0C1322]/85">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Active Clearance
                  </div>
                  <div className="text-xs font-semibold text-slate-100 mt-0.5 truncate">
                    {user.role === 'administrator'
                      ? 'Administrator Command'
                      : user.role === 'rescue'
                      ? 'Rescue Team Ops'
                      : 'Citizen Safety Portal'}
                  </div>
                </div>

                {visibleModules.map((mod) => {
                  const Icon = mod.icon;
                  const active = activeModule === mod.id;
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => navigateTo(mod.id)}
                      className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-left transition-colors flex items-center justify-between gap-2 ${
                        active
                          ? 'bg-blue-600/20 border border-blue-500/60 text-white'
                          : 'border border-transparent text-slate-300 hover:bg-slate-800/70 hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            active ? 'text-blue-400' : 'text-slate-400'
                          }`}
                          aria-hidden="true"
                        />
                        <span className="text-xs font-medium truncate">
                          {mod.num}. {mod.shortTitle}
                        </span>
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
                        {getModuleMetric(mod.id)}
                      </span>
                    </button>
                  );
                })}

                <div className="pt-2 mt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => navigateTo('overview')}
                    className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-left transition-colors flex items-center gap-2.5 ${
                      activeModule === 'overview'
                        ? 'bg-blue-600/20 border border-blue-500/60 text-white'
                        : 'border border-transparent text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4 shrink-0 text-blue-400" aria-hidden="true" />
                    <span className="text-xs font-medium">All Modules Deck</span>
                  </button>
                </div>
              </div>

              <div className="p-3 border-t border-slate-800/90 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                <span>{forecasts.length} hazard feeds</span>
                <span className="text-emerald-400">Sync Ready</span>
              </div>
            </aside>

            {/* Main Dashboard Workspace */}
            <main className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <div className="max-w-[1320px] mx-auto space-y-4">
                {/* Workspace Title Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-3 min-w-0">
                    {activeMeta ? (
                      <activeMeta.icon className="w-5 h-5 text-blue-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <LayoutGrid className="w-5 h-5 text-blue-400 shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-slate-400">
                        {activeMeta
                          ? `Nexora ai · Module ${activeMeta.num}`
                          : 'Nexora ai · Operations Hub'}
                      </div>
                      <h1 className="text-base sm:text-lg font-display font-semibold text-slate-100 truncate">
                        {activeMeta ? activeMeta.title : 'All Operational Modules'}
                      </h1>
                    </div>
                  </div>

                  {activeModule !== 'command' && (
                    <button
                      type="button"
                      onClick={() => navigateTo('command')}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-700 bg-[#0C1322] text-xs font-medium text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1.5"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                      <span>Command Center &amp; 3D Globe</span>
                    </button>
                  )}
                </div>

                {/* Active Module Content */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeModule}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.14 }}
                  >
                    {activeModule === 'overview' && (
                      <div className="space-y-5">
                        <div className="py-2">
                          <NexoraLogoCenterpiece />
                        </div>
                        <div className="group/dock grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {visibleModules.map((mod) => (
                            <ModuleLauncherCard
                              key={mod.id}
                              mod={mod}
                              isOpen={false}
                              isImageBroken={Boolean(brokenImages[mod.id])}
                              metricLabel={getModuleMetric(mod.id)}
                              onOpen={() => navigateTo(mod.id)}
                              onImageError={() =>
                                setBrokenImages((prev) => ({ ...prev, [mod.id]: true }))
                              }
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {activeModule === 'command' && (
                      <CommandCenterModule
                        forecasts={forecasts}
                        threats={threats}
                        incidents={incidents}
                        alerts={alerts}
                        resources={reliefResources}
                        analytics={ANALYTICS_24H}
                        userRole={user.role}
                        activeAlertsCount={alerts.filter((a) => a.status === 'Published').length}
                        reliefCount={reliefResources.length}
                        urlsScannedCount={cyberCounts.scanned}
                        phishingDetectedCount={cyberCounts.phishing}
                        onOpenModule={(id) => navigateTo(id)}
                      />
                    )}

                    {activeModule === 'disaster' && (
                      <DisasterModule
                        forecasts={forecasts}
                        incidents={incidents}
                        alerts={alerts}
                        resources={reliefResources}
                        userRole={user.role}
                        onEscalate={handleEscalateForecast}
                        onCreateWarning={
                          user.role === 'administrator' ? handleCreateWarning : undefined
                        }
                        onSyncUsgs={handleSyncUsgs}
                        isSyncing={isSyncingUsgs}
                        syncNotice={syncNotice}
                        onOpenModule={(id) => navigateTo(id)}
                      />
                    )}

                    {activeModule === 'cyber' && (
                      <CyberModule
                        threats={threats}
                        userRole={user.role}
                        onContainThreat={handleContainThreat}
                        onEscalateThreat={handleEscalateThreat}
                        onScanRecorded={recordCyberScan}
                      />
                    )}

                    {activeModule === 'assistant' && (
                      <AssistantModule
                        forecasts={forecasts}
                        threats={threats}
                        incidents={incidents}
                        aiKnowledge={aiKnowledge}
                        aiModel={systemConfig.aiModel}
                        userRole={user.role}
                        onSaveKnowledge={
                          user.role === 'administrator' ? handleSaveKnowledge : undefined
                        }
                        onDeleteKnowledge={
                          user.role === 'administrator' ? handleDeleteKnowledge : undefined
                        }
                      />
                    )}

                    {activeModule === 'response' && (
                      <ResponseModule
                        incidents={incidents}
                        forecasts={forecasts}
                        alerts={alerts}
                        resources={reliefResources}
                        userRole={user.role}
                        onAdvanceStatus={handleAdvanceIncident}
                        onCreateIncident={handleCreateIncident}
                        onOpenModule={(id) => navigateTo(id)}
                        onUpdateAdminIncident={
                          user.role === 'administrator' ? handleUpdateAdminIncident : undefined
                        }
                        onUpdateRescueIncident={
                          user.role === 'rescue' || user.role === 'administrator'
                            ? handleUpdateRescueIncident
                            : undefined
                        }
                      />
                    )}

                    {activeModule === 'relief' && (
                      <ReliefModule
                        resources={reliefResources}
                        forecasts={forecasts}
                        incidents={incidents}
                        alerts={alerts}
                        userRole={user.role}
                        onOpenModule={(id) => navigateTo(id)}
                        onUpdateResource={handleUpdateReliefResource}
                        onCreateResource={
                          user.role === 'administrator' ? handleCreateReliefResource : undefined
                        }
                      />
                    )}

                    {activeModule === 'analytics' && (
                      <AnalyticsModule
                        series={ANALYTICS_24H}
                        forecasts={forecasts}
                        threats={threats}
                        incidents={incidents}
                        userRole={user.role}
                      />
                    )}

                    {activeModule === 'alerts' && (
                      <AlertsModule
                        alerts={alerts}
                        user={user}
                        onCreateAlert={
                          user.role === 'administrator' ? handleCreateAlert : undefined
                        }
                        onUpdateAlertStatus={
                          user.role === 'administrator' ? handleUpdateAlertStatus : undefined
                        }
                        onUpdateNotificationPrefs={handleUpdateNotificationPrefs}
                        onOpen3DMap={() => navigateTo('command')}
                      />
                    )}

                    {activeModule === 'admin' && user.role === 'administrator' && (
                      <AdminSystemModule
                        usersList={adminUsers}
                        systemConfig={systemConfig}
                        auditLogs={auditLogs}
                        onUpdateUserAccount={handleUpdateUserAccount}
                        onSaveSystemConfig={handleSaveSystemConfig}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </main>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 left-4 sm:left-auto sm:max-w-sm z-50 px-4 py-3 rounded-lg bg-slate-900/95 text-slate-100 text-xs font-medium border border-slate-700 shadow-xl backdrop-blur-md"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

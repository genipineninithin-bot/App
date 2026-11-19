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
  Globe,
  HeartPulse,
  Home,
  LayoutDashboard,
  LogOut,
  MapPin,
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
  deleteAlertDoc,
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
import { GoogleMapsPanel } from './components/GoogleMapsPanel';
import { HomePageView } from './components/HomePageView';
import { LoginPortal } from './components/LoginPortal';
import {
  DevicePermissionsState,
  LiveGeoPosition,
  PermissionStatus,
  StartupPermissionsModal,
} from './components/StartupPermissionsModal';
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
  LiveDisasterIncident,
  ModuleId,
  ReliefResource,
  SystemConfigState,
  UserRole,
} from './types/modules';
import { plainSeverity } from './utils/plainLabels';
import { requestBestGeolocation } from '../frontend/permissions';
import { getIncidentApprovalState } from '../frontend/departments';

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
    subtitle: 'Live overview, Google Maps & quick safety counts',
    imageUrl: '/src/assets/images/module_command_center_1794980254319.jpg',
    imageAlt: 'Disaster and cybersecurity command center bridge with panoramic situational wall',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: LayoutDashboard,
  },
  {
    id: 'disaster',
    num: '02',
    title: 'Disaster Warnings & Weather',
    shortTitle: 'Disasters',
    subtitle: 'Flood, storm & earthquake alerts in your area',
    imageUrl: '/src/assets/images/module_disaster_monitoring_1794979857261.jpg',
    imageAlt: 'Orbital satellite view of coastal cyclone spiral and terrain',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: Flame,
  },
  {
    id: 'satellite',
    num: '03',
    title: 'Live Satellite & Radar Stream',
    shortTitle: 'Satellite Stream',
    subtitle: 'Zoom Earth-style radar, storm tracks & forecast overlays',
    imageUrl: '/src/assets/images/module_disaster_monitoring_1794979857261.jpg',
    imageAlt: 'Live orbital satellite and radar storm tracking viewport',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: Globe,
  },
  {
    id: 'cyber',
    num: '04',
    title: 'Scam & Link Checker',
    shortTitle: 'Cyber Safety',
    subtitle: 'Check if a website link or text message is a scam',
    imageUrl: '/src/assets/images/module_cyber_detection_1794979857655.jpg',
    imageAlt: 'High-security enterprise server corridor with optical fiber links',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: ShieldAlert,
  },
  {
    id: 'assistant',
    num: '05',
    title: 'NEXORA AI Helper',
    shortTitle: 'AI Helper',
    subtitle: 'Simple safety answers, first aid & checklists',
    imageUrl: '/src/assets/images/module_nexora_assistant_1794979857299.jpg',
    imageAlt: 'Precision smoked glass prisms and titanium compute module',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: Bot,
  },
  {
    id: 'response',
    num: '06',
    title: 'Emergency Help & Reports',
    shortTitle: 'Help & SOS',
    subtitle: 'Report an emergency & track rescue teams',
    imageUrl: '/src/assets/images/module_emergency_response_1794979859286.jpg',
    imageAlt: 'Emergency operations dispatch desk with field tablet and tactical radio',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: Siren,
  },
  {
    id: 'relief',
    num: '07',
    title: 'Hospitals, Shelters & Supplies',
    shortTitle: 'Help Centers',
    subtitle: 'Find nearby hospitals, safe shelters & aid',
    imageUrl: '/src/assets/images/module_rescue_relief_1794984084615.jpg',
    imageAlt: 'Tactical medical relief staging hub and emergency ambulance bay',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: HeartPulse,
  },
  {
    id: 'analytics',
    num: '08',
    title: 'Charts & Safety Trends',
    shortTitle: 'Trends',
    subtitle: 'Easy-to-read charts of disasters & cyber risks',
    imageUrl: '/src/assets/images/module_data_analytics_1794979859044.jpg',
    imageAlt: 'Layered dark translucent glass planes etched with topographic telemetry waves',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: Activity,
  },
  {
    id: 'alerts',
    num: '09',
    title: 'Alerts & Warnings',
    shortTitle: 'Alerts',
    subtitle: 'Official safety alerts & SMS/email settings',
    imageUrl: '/src/assets/images/module_secure_alerts_1794984085342.jpg',
    imageAlt: 'Encrypted satellite emergency broadcast console in dark command room',
    roles: ['citizen', 'rescue', 'administrator'],
    icon: BellRing,
  },
  {
    id: 'admin',
    num: '10',
    title: 'Admin Settings',
    shortTitle: 'Admin',
    subtitle: 'Manage user accounts, AI & activity logs',
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

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative text-left rounded-xl border overflow-hidden flex flex-col transition-all duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isOpen
          ? 'bg-slate-900 border-blue-500'
          : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
      }`}
    >
      <div className="relative w-full h-24 overflow-hidden bg-slate-950 border-b border-slate-800 shrink-0">
        {mod.id === 'satellite' ? (
          <div className="h-full w-full relative bg-gradient-to-br from-slate-950 via-sky-950/80 to-indigo-950 flex items-center justify-center overflow-hidden">
            <svg
              viewBox="0 0 280 96"
              className="w-full h-full opacity-90 transition-transform duration-300 group-hover:scale-105"
              aria-hidden="true"
            >
              <defs>
                <radialGradient id="satGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                  <stop offset="60%" stopColor="#0ea5e9" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#020617" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect width="280" height="96" fill="url(#satGlow)" />
              {/* Coordinate grid lines */}
              <path
                d="M0 24 H280 M0 48 H280 M0 72 H280 M56 0 V96 M112 0 V96 M168 0 V96 M224 0 V96"
                stroke="#1e3a5f"
                strokeWidth="0.7"
                strokeDasharray="3 3"
              />
              {/* Radar concentric sweep rings */}
              <circle cx="140" cy="48" r="16" fill="none" stroke="#38bdf8" strokeOpacity="0.55" strokeWidth="1" />
              <circle cx="140" cy="48" r="32" fill="none" stroke="#38bdf8" strokeOpacity="0.38" strokeWidth="1" />
              <circle cx="140" cy="48" r="48" fill="none" stroke="#0ea5e9" strokeOpacity="0.25" strokeWidth="1" />
              <circle cx="140" cy="48" r="68" fill="none" stroke="#0ea5e9" strokeOpacity="0.15" strokeWidth="1" />
              {/* Radar sweep wedge */}
              <path d="M140 48 L184 16 A54 54 0 0 1 194 48 Z" fill="#38bdf8" fillOpacity="0.22" />
              {/* Storm trajectory arc & nodes */}
              <path
                d="M95 76 Q128 58 140 48 T188 18"
                fill="none"
                stroke="#a855f7"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="118" cy="62" r="3" fill="#a855f7" stroke="#ffffff" strokeWidth="1" />
              <circle cx="140" cy="48" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
              <circle cx="164" cy="34" r="3" fill="#a855f7" stroke="#ffffff" strokeWidth="1" />
              <circle cx="186" cy="20" r="2.5" fill="#38bdf8" />
            </svg>
            <span className="absolute bottom-1.5 left-2.5 px-1.5 py-0.5 rounded bg-slate-950/80 border border-sky-500/40 text-[9px] font-mono text-sky-300">
              DOPPLER · IR · ORBIT
            </span>
          </div>
        ) : !isImageBroken ? (
          <img
            src={mod.imageUrl}
            alt={mod.imageAlt}
            referrerPolicy="no-referrer"
            onError={onImageError}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-slate-800 flex items-center justify-center">
            <Icon className="w-7 h-7 text-blue-400" aria-hidden="true" />
          </div>
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent"
        />

        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-2 right-2 w-6 h-6 rounded-md bg-slate-900/80 border border-slate-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-slate-200" />
        </span>
      </div>

      <div className="p-3 flex-1 flex flex-col justify-between gap-1.5 w-full">
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="flex items-center gap-1.5">
            <Icon className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />
            <span className="text-[11px] font-mono text-slate-400">{mod.num}</span>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-slate-400 truncate">
            {metricLabel}
          </span>
        </div>

        <div>
          <div className="text-sm font-semibold text-slate-100 leading-snug">
            {mod.title}
          </div>
          <div className="mt-0.5 text-xs text-slate-400 line-clamp-1 hidden sm:block">
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

  const [activeModule, setActiveModule] = useState<ModuleId | 'overview'>('overview');
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
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [topSearch, setTopSearch] = useState('');
  const [showNotifPopover, setShowNotifPopover] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('nexora_permissions_prompt_seen_v1') !== '1';
    } catch {
      return true;
    }
  });
  const [devicePermissions, setDevicePermissions] = useState<DevicePermissionsState>({
    location: 'prompt',
    notifications: 'prompt',
    camera: 'prompt',
    microphone: 'prompt',
  });
  const [liveLocation, setLiveLocation] = useState<LiveGeoPosition | null>(null);
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState(false);
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

  // Auto-start live GPS immediately on mount if location permission was already granted by the browser
  useEffect(() => {
    if (!('geolocation' in navigator) || !navigator.permissions?.query) return;
    let active = true;
    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((res) => {
        if (!active) return;
        if (res.state === 'granted') {
          setDevicePermissions((prev) => ({ ...prev, location: 'granted' }));
          setLocationTrackingEnabled(true);
          void requestBestGeolocation().then((fix) => {
            if (active && fix.ok) {
              setLiveLocation({
                lat: fix.lat,
                lng: fix.lng,
                accuracyMeters: fix.accuracyMeters,
                updatedAt: fix.updatedAt,
              });
            }
          });
        } else if (res.state === 'denied') {
          setDevicePermissions((prev) => ({ ...prev, location: 'denied' }));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!locationTrackingEnabled || !('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: Math.round(pos.coords.accuracy),
          updatedAt: new Date().toISOString(),
        });
      },
      () => {
        // Keep last known fix if transient GPS drop occurs
      },
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 15_000 }
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [locationTrackingEnabled]);

  const handleUpdatePermission = React.useCallback(
    (key: keyof DevicePermissionsState, status: PermissionStatus) => {
      setDevicePermissions((prev) => (prev[key] === status ? prev : { ...prev, [key]: status }));
    },
    []
  );

  const handleLocationGranted = React.useCallback((pos: LiveGeoPosition) => {
    setLiveLocation(pos);
    setLocationTrackingEnabled(true);
    setToast('Live GPS location enabled and synced to maps.');
  }, []);

  const handleRevokeLocation = React.useCallback(() => {
    setLocationTrackingEnabled(false);
    setLiveLocation(null);
    setDevicePermissions((prev) => ({ ...prev, location: 'prompt' }));
    setToast('Live GPS location paused.');
  }, []);

  const handleClosePermissionsModal = React.useCallback(() => {
    setShowPermissionsModal(false);
    try {
      sessionStorage.setItem('nexora_permissions_prompt_seen_v1', '1');
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
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
    // Never auto-authenticate from cached browser state on initial load;
    // always present the Login Portal for explicit role selection & sign-in.
    localStorage.removeItem(PORTAL_MODE_KEY);
    let settled = false;
    const safetyTimer = window.setTimeout(() => {
      if (!settled) {
        setIsCheckingSession(false);
      }
    }, 1200);

    const unsubscribe = onAuthStateChanged(auth, () => {
      settled = true;
      window.clearTimeout(safetyTimer);
      setIsCheckingSession(false);
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
    setActiveModule('overview');
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
    setActiveModule('overview');
    setMobileNavOpen(false);
    setUser(null);
    try {
      await signOut(auth);
    } catch (err) {
      setToast(formatActionError(err, 'Unable to sign out cleanly.'));
    }
  };

  const handleSyncUsgs = async (forceRefresh = true) => {
    setIsSyncingUsgs(true);
    setSyncNotice(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(
        `/api/disasters/live${forceRefresh ? '?refresh=1' : ''}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        incidents?: LiveDisasterIncident[];
        sources?: {
          currentDisaster?: string;
          gdacs?: string;
          nasaEonet?: string;
          usgs?: string;
        };
      };
      const liveItems = Array.isArray(json?.incidents) ? json.incidents : [];

      if (liveItems.length === 0) {
        setSyncNotice('Live disaster feeds polled: no new active incidents returned right now.');
      } else {
        const mappedForecasts: DisasterForecast[] = liveItems.map((item) => ({
          id: item.id,
          title: item.title,
          category: item.category,
          severity: item.severity,
          region: item.region,
          horizon: '6h',
          confidencePct: item.sourceName === 'CurrentDisaster.com' ? 88 : 96,
          metric: item.metric,
          gridExposureMw:
            item.severity === 'Critical'
              ? 1250
              : item.severity === 'High'
              ? 680
              : 240,
          populationAtRisk: item.populationAtRisk,
          status: item.severity === 'Critical' || item.severity === 'High' ? 'Warning' : 'Monitoring',
          summary: `${item.summary} (${item.sourceName})`,
          lat: item.lat,
          lng: item.lng,
          sourceName: item.sourceName,
          sourceUrl: item.sourceUrl,
          affectedRadiusKm: item.affectedRadiusKm,
          safeZoneRadiusKm: item.safeZoneRadiusKm,
        }));

        const mappedIncidents: IncidentTicket[] = liveItems
          .filter((i) => i.severity === 'Critical' || i.severity === 'High')
          .slice(0, 6)
          .map((item) => ({
            id: `LIVE-${item.id}`,
            title: item.title,
            domain: 'Disaster',
            severity: item.severity,
            region: item.region,
            assignedUnit: `${item.sourceName} Monitor`,
            platformSupport: 'Windows & Mobile',
            status: 'In Progress',
            updatedAt: item.timeLabel || 'Live',
            notes: `${item.summary} Source: ${item.sourceUrl}`,
            locationCoords: `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`,
            verifiedByAdmin: true,
            damageAssessment: item.metric,
          }));

        setForecasts((prev) => {
          const liveIds = new Set(mappedForecasts.map((m) => m.id));
          const retained = prev.filter((p) => !liveIds.has(p.id));
          return [...mappedForecasts, ...retained];
        });

        setIncidents((prev) => {
          const liveIds = new Set(mappedIncidents.map((m) => m.id));
          const retained = prev.filter((p) => !liveIds.has(p.id));
          return [...mappedIncidents, ...retained];
        });

        const activeSources = [
          json.sources?.currentDisaster === 'live' ? 'CurrentDisaster.com' : null,
          json.sources?.gdacs === 'live' ? 'GDACS' : null,
          json.sources?.nasaEonet === 'live' ? 'NASA EONET' : null,
          json.sources?.usgs === 'live' ? 'USGS' : null,
        ].filter(Boolean);

        if (user?.role === 'administrator' && auth.currentUser && forceRefresh) {
          await Promise.all(
            mappedForecasts.slice(0, 4).map((item) => saveDisasterForecast(item, auth.currentUser!.uid))
          );
          setSyncNotice(
            `Synced ${mappedForecasts.length} live disaster incidents (${activeSources.join(', ')}) and updated Google Maps.`
          );
          recordAudit(
            'LIVE_DISASTER_SYNC',
            'disasters',
            `Synced ${mappedForecasts.length} events from ${activeSources.join(', ')}`
          );
        } else {
          setSyncNotice(
            `Synced ${mappedForecasts.length} live incidents from ${activeSources.join(', ') || 'live feeds'}.`
          );
        }
      }
    } catch {
      setSyncNotice('Live disaster feeds temporarily unreachable; showing verified baseline records.');
    } finally {
      setIsSyncingUsgs(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void handleSyncUsgs(false);
    const timer = window.setInterval(() => {
      void handleSyncUsgs(false);
    }, 180_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
      const savedTicket: IncidentTicket = {
        ...ticket,
        verifiedByAdmin: user.role === 'administrator' ? Boolean(ticket.verifiedByAdmin ?? true) : false,
      };
      setIncidents((prev) => [savedTicket, ...prev]);
      recordAudit('INCIDENT_CREATED', ticket.id, ticket.title);
      setToast(
        user.role === 'administrator'
          ? `Dispatched ${ticket.id} to ${ticket.assignedUnit}.`
          : `Emergency SOS ${ticket.id} submitted — pending Administrator approval & department assignment.`
      );
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
      if (updates.verifiedByAdmin === true && updates.assignedUnit) {
        setToast(`Approved ${id} & assigned to ${updates.assignedUnit} — now live on the map with hazard symbol & safe zone.`);
      } else if (updates.verifiedByAdmin === false) {
        setToast(`Rejected ${id} — removed from public map.`);
      } else {
        setToast(`Updated incident ${id} operational telemetry.`);
      }
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
      recordAudit(
        alert.status === 'Published' ? 'ALERT_PUBLISHED' : 'ALERT_CREATED',
        alert.id,
        alert.title
      );
      setToast(
        alert.status === 'Published'
          ? `Sent live alert ${alert.id} (${alert.visibility === 'rescue_only' ? 'Rescue Teams' : 'Everyone'}).`
          : `Saved alert draft ${alert.id}.`
      );
    } catch (err) {
      setToast(formatActionError(err, 'Failed to create alert.'));
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

  const handleDeleteAlert = async (id: string) => {
    if (user?.role !== 'administrator') return;
    try {
      await deleteAlertDoc(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      recordAudit('ALERT_DELETED', id, 'Deleted alert from Firestore');
      setToast(`Removed alert ${id}.`);
    } catch (err) {
      setToast(formatActionError(err, 'Failed to delete alert.'));
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
      case 'satellite':
        return 'STREAM';
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
    <div className="relative min-h-screen w-full overflow-x-hidden bg-slate-950 text-slate-100 flex flex-col">
      {mapsQuotaExceeded && (
        <div
          role="alert"
          className="sticky top-0 z-50 w-full bg-amber-50 border-b border-amber-300 text-amber-950 px-4 py-2.5 text-sm flex items-center justify-between gap-4"
        >
          <span>
            This app uses a Google Maps Platform demo key that has reached its daily quota. To continue using map features without interruption, switch to your own Google Cloud API key.{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium hover:text-amber-800"
            >
              Learn how →
            </a>
          </span>
          <button
            type="button"
            onClick={() => setMapsQuotaExceeded(false)}
            aria-label="Dismiss"
            className="text-amber-900 hover:text-amber-700 font-semibold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {isCheckingSession ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
          <div className="font-display text-2xl font-bold tracking-tight text-slate-100">
            NEXORA <span className="text-blue-400">AI</span>
          </div>
          <div className="px-4 py-2 rounded-lg border border-slate-800 bg-slate-900 text-xs font-mono text-slate-300">
            Loading your session...
          </div>
        </div>
      ) : !user ? (
        <LoginPortal onAuthenticated={handleAuthenticated} />
      ) : (
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          {/* Top Command Navigation Bar */}
          <header className="relative z-30 w-full px-4 sm:px-5 py-2.5 border-b border-slate-800 bg-slate-900 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen((v) => !v)}
                aria-label="Toggle navigation sidebar"
                className="lg:hidden min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('overview')}
                className="text-left flex items-center gap-2.5 min-w-0"
              >
                <span className="font-display text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
                  NEXORA <span className="text-blue-400">AI</span>
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
                  className="w-full min-h-[36px] pl-8 pr-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
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
                    <div className="absolute left-0 right-0 mt-1.5 rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-50">
                      {matchedMods.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            navigateTo(m.id);
                            setTopSearch('');
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center justify-between"
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
                          className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 flex items-center justify-between border-t border-slate-800"
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

              {/* Device Permissions & Live GPS Button */}
              <button
                type="button"
                onClick={() => setShowPermissionsModal(true)}
                title="Manage live GPS location, notifications, camera & microphone permissions"
                className={`min-h-[36px] px-2.5 py-1.5 rounded-lg border text-xs inline-flex items-center gap-1.5 transition-colors ${
                  liveLocation
                    ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/70'
                    : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <MapPin
                  className={`w-3.5 h-3.5 ${liveLocation ? 'text-emerald-400' : 'text-blue-400'}`}
                  aria-hidden="true"
                />
                <span className="hidden lg:inline text-[11px] font-medium">
                  {liveLocation ? 'Live GPS' : 'Access'}
                </span>
              </button>

              {/* Notification Center Bell */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotifPopover((v) => !v)}
                  aria-label="Open alert notifications"
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 inline-flex items-center gap-1.5 transition-colors"
                >
                  <Bell className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span className="font-mono text-[11px] tabular-nums">
                    {alerts.filter((a) => a.status === 'Published').length}
                  </span>
                </button>

                {showNotifPopover && (() => {
                  const popoverAlerts = alerts
                    .filter((a) => user.role === 'administrator' || a.status === 'Published')
                    .slice(0, 4);
                  return (
                    <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-50">
                      <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-100">Latest Safety Alerts</span>
                        <button
                          type="button"
                          onClick={() => navigateTo('alerts')}
                          className="text-blue-400 hover:text-blue-300 font-medium"
                        >
                          See All
                        </button>
                      </div>
                      <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto">
                        {popoverAlerts.length === 0 ? (
                          <div className="px-3.5 py-4 text-center text-xs text-slate-400">
                            No active alerts right now. You are all caught up.
                          </div>
                        ) : (
                          popoverAlerts.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => navigateTo('alerts')}
                              className="w-full px-3.5 py-2.5 text-left hover:bg-slate-800/70 space-y-0.5"
                            >
                              <div className="flex items-center justify-between text-[10px] font-mono">
                                <span className="text-amber-400">{plainSeverity(a.severity)}</span>
                                <span className="text-slate-500">{a.createdAtLabel}</span>
                              </div>
                              <div className="text-xs font-medium text-slate-100 truncate">
                                {a.title}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">{a.region}</div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}
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
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
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
              aria-label="NEXORA AI Module Navigation"
              className={`${
                mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
              } fixed lg:static inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col justify-between transition-transform duration-200 ease-out pt-14 lg:pt-0`}
            >
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                <div className="px-2.5 py-2 mb-1.5 rounded-lg border border-slate-800 bg-slate-950">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Active Role
                  </div>
                  <div className="text-xs font-semibold text-slate-100 mt-0.5 truncate">
                    {user.role === 'administrator'
                      ? 'Administrator Command'
                      : user.role === 'rescue'
                      ? 'Rescue Team Ops'
                      : 'Citizen Safety Portal'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigateTo('overview')}
                  className={`w-full min-h-[40px] px-2.5 py-2 mb-1 rounded-lg text-left transition-colors flex items-center justify-between gap-2 ${
                    activeModule === 'overview'
                      ? 'bg-blue-600/15 border border-blue-500/50 text-white'
                      : 'border border-transparent text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Home
                      className={`w-4 h-4 shrink-0 ${
                        activeModule === 'overview' ? 'text-blue-400' : 'text-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-semibold truncate">Home Page</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 shrink-0">Live</span>
                </button>

                <div className="pt-1 pb-0.5 border-t border-slate-800" />

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
                          ? 'bg-blue-600/15 border border-blue-500/50 text-white'
                          : 'border border-transparent text-slate-300 hover:bg-slate-800 hover:text-white'
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
              </div>

              <div className="p-3 border-t border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                <span>{forecasts.length} hazard feeds</span>
                <span className="text-emerald-400">Live Sync</span>
              </div>
            </aside>

            {/* Main Dashboard Workspace */}
            <main className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <div className="max-w-[1320px] mx-auto space-y-4">
                {/* Workspace Title Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3 min-w-0">
                    {activeMeta ? (
                      <activeMeta.icon className="w-5 h-5 text-blue-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <Home className="w-5 h-5 text-blue-400 shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-slate-400">
                        {activeMeta
                          ? `NEXORA AI · Module ${activeMeta.num}`
                          : 'NEXORA AI · Real-Time Operations Hub'}
                      </div>
                      <h1 className="text-base sm:text-lg font-display font-semibold text-slate-100 truncate">
                        {activeMeta ? activeMeta.title : 'Home Page'}
                      </h1>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeModule !== 'overview' && (
                      <button
                        type="button"
                        onClick={() => navigateTo('overview')}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Home className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                        <span>Home Page</span>
                      </button>
                    )}
                    {activeModule !== 'satellite' && activeModule !== 'overview' && (
                      <button
                        type="button"
                        onClick={() => navigateTo('satellite')}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-xs font-medium text-sky-300 inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Globe className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                        <span>Live Satellite Stream</span>
                      </button>
                    )}
                    {activeModule !== 'command' && activeModule !== 'overview' && (
                      <button
                        type="button"
                        onClick={() => navigateTo('command')}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors"
                      >
                        <LayoutDashboard className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                        <span>Command Center</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Admin Live Notification Strip for Pending Citizen SOS Reports */}
                {user.role === 'administrator' && (() => {
                  const pendingCitizenSos = incidents.filter(
                    (inc) => getIncidentApprovalState(inc) === 'pending'
                  );
                  if (pendingCitizenSos.length === 0) return null;
                  return (
                    <div className="px-4 py-2.5 rounded-xl border border-red-500/40 bg-red-950/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 text-red-200 min-w-0">
                        <Siren className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          <strong className="text-white">{pendingCitizenSos.length} Citizen Emergency SOS</strong>{' '}
                          {pendingCitizenSos.length === 1 ? 'report is' : 'reports are'} awaiting Admin approval before appearing on the live map.
                        </span>
                      </div>
                      {activeModule !== 'response' && (
                        <button
                          type="button"
                          onClick={() => navigateTo('response')}
                          className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shrink-0 transition-colors"
                        >
                          Review &amp; Approve SOS
                        </button>
                      )}
                    </div>
                  );
                })()}

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
                      <HomePageView
                        user={user}
                        clockLabel={clockLabel}
                        dateLabel={dateLabel}
                        forecasts={forecasts}
                        incidents={incidents}
                        alerts={alerts}
                        threats={threats}
                        resources={reliefResources}
                        onNavigate={(id) => navigateTo(id)}
                        onSyncLiveDisasters={() => void handleSyncUsgs(true)}
                        moduleDeckSlot={
                          <div
                            className={`group/dock grid gap-3 grid-cols-1 sm:grid-cols-2 ${
                              visibleModules.length === 9
                                ? 'lg:grid-cols-3'
                                : 'lg:grid-cols-3 xl:grid-cols-5'
                            }`}
                          >
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
                        }
                      />
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
                        liveLocation={liveLocation}
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

                    {activeModule === 'satellite' && (
                      <GoogleMapsPanel
                        forecasts={forecasts}
                        incidents={incidents}
                        alerts={alerts}
                        threats={threats}
                        resources={reliefResources}
                        showCyber={user.role === 'administrator'}
                        variant="stream"
                        initialUserLocation={liveLocation}
                        heightClass="h-[calc(100vh-14.5rem)] min-h-[540px]"
                        onSelectModule={(id) => navigateTo(id)}
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
                        userId={user.id}
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
                        liveLocation={liveLocation}
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
                        onDeleteAlert={
                          user.role === 'administrator' ? handleDeleteAlert : undefined
                        }
                        onUpdateNotificationPrefs={handleUpdateNotificationPrefs}
                        onOpen3DMap={() => navigateTo('command')}
                      />
                    )}

                    {activeModule === 'admin' && user.role === 'administrator' && (
                      <AdminSystemModule
                        currentUser={user}
                        usersList={adminUsers}
                        systemConfig={systemConfig}
                        auditLogs={auditLogs}
                        onUpdateUserAccount={handleUpdateUserAccount}
                        onSaveSystemConfig={handleSaveSystemConfig}
                        onOpenModule={(id) => navigateTo(id)}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </main>
          </div>
        </div>
      )}

      <StartupPermissionsModal
        open={!isCheckingSession && showPermissionsModal}
        permissions={devicePermissions}
        liveLocation={liveLocation}
        onUpdatePermission={handleUpdatePermission}
        onLocationGranted={handleLocationGranted}
        onRevokeLocation={handleRevokeLocation}
        onClose={handleClosePermissionsModal}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 left-4 sm:left-auto sm:max-w-sm z-50 px-4 py-3 rounded-lg bg-slate-900 text-slate-100 text-xs font-medium border border-slate-700 shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  Mic,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { isRunningInsideIframe, requestBestGeolocation } from '../../frontend/permissions';

export type PermissionStatus = 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface LiveGeoPosition {
  lat: number;
  lng: number;
  accuracyMeters?: number;
  updatedAt: string;
}

export interface DevicePermissionsState {
  location: PermissionStatus;
  notifications: PermissionStatus;
  camera: PermissionStatus;
  microphone: PermissionStatus;
}

interface StartupPermissionsModalProps {
  open: boolean;
  permissions: DevicePermissionsState;
  liveLocation: LiveGeoPosition | null;
  onUpdatePermission: (key: keyof DevicePermissionsState, status: PermissionStatus) => void;
  onLocationGranted: (pos: LiveGeoPosition) => void;
  onRevokeLocation: () => void;
  onClose: () => void;
}

function statusBadge(status: PermissionStatus, inAppFallback = false) {
  if (status === 'granted') {
    return {
      label: inAppFallback ? 'In-App Active' : 'Allowed',
      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
      icon: CheckCircle2,
    };
  }
  switch (status) {
    case 'denied':
      return {
        label: 'Blocked',
        cls: 'bg-red-500/15 text-red-300 border-red-500/40',
        icon: XCircle,
      };
    case 'unsupported':
      return {
        label: 'No Device',
        cls: 'bg-slate-800 text-slate-400 border-slate-700',
        icon: XCircle,
      };
    default:
      return {
        label: 'Not enabled',
        cls: 'bg-slate-800 text-slate-300 border-slate-700',
        icon: null,
      };
  }
}

export const StartupPermissionsModal: React.FC<StartupPermissionsModalProps> = ({
  open,
  permissions,
  liveLocation,
  onUpdatePermission,
  onLocationGranted,
  onRevokeLocation,
  onClose,
}) => {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [helperMsg, setHelperMsg] = useState<string | null>(null);
  const [inAppAlertsFallback, setInAppAlertsFallback] = useState(false);

  // Sync current browser permission states when modal opens without clobbering active granted states
  useEffect(() => {
    if (!open) return;
    let active = true;

    const queryPerm = async (
      name: PermissionName,
      target: keyof DevicePermissionsState
    ) => {
      try {
        if (!navigator.permissions?.query) return;
        const result = await navigator.permissions.query({ name });
        if (!active) return;
        if (result.state === 'granted') {
          onUpdatePermission(target, 'granted');
        } else if (result.state === 'denied') {
          onUpdatePermission(target, 'denied');
        }
      } catch {
        // Some browsers do not support querying camera/microphone via Permissions API
      }
    };

    if (!('geolocation' in navigator)) {
      onUpdatePermission('location', 'unsupported');
    } else {
      void queryPerm('geolocation', 'location');
    }

    if (typeof Notification === 'undefined') {
      if (!inAppAlertsFallback) {
        onUpdatePermission('notifications', 'prompt');
      }
    } else if (Notification.permission === 'granted') {
      onUpdatePermission('notifications', 'granted');
    } else if (Notification.permission === 'denied' && !inAppAlertsFallback) {
      onUpdatePermission('notifications', 'denied');
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      onUpdatePermission('camera', 'unsupported');
      onUpdatePermission('microphone', 'unsupported');
    } else {
      void queryPerm('camera' as PermissionName, 'camera');
      void queryPerm('microphone' as PermissionName, 'microphone');
    }

    return () => {
      active = false;
    };
  }, [open, onUpdatePermission, inAppAlertsFallback]);

  const requestLocation = useCallback(async () => {
    setBusyKey('location');
    setHelperMsg('Acquiring live GPS fix...');
    const outcome = await requestBestGeolocation();
    if (outcome.ok) {
      onUpdatePermission('location', 'granted');
      onLocationGranted({
        lat: outcome.lat,
        lng: outcome.lng,
        accuracyMeters: outcome.accuracyMeters,
        updatedAt: outcome.updatedAt,
      });
      setHelperMsg(
        `Live location active (${outcome.lat.toFixed(4)}°, ${outcome.lng.toFixed(4)}°) and synced to maps & Emergency SOS.`
      );
    } else {
      onUpdatePermission('location', outcome.status);
      setHelperMsg(outcome.message);
    }
    setBusyKey(null);
  }, [onLocationGranted, onUpdatePermission]);

  const requestNotifications = useCallback(async () => {
    setBusyKey('notifications');
    setHelperMsg(null);

    if (typeof Notification === 'undefined') {
      setInAppAlertsFallback(true);
      onUpdatePermission('notifications', 'granted');
      setHelperMsg('In-app real-time alert banners enabled (desktop OS notifications are unavailable in this browser).');
      setBusyKey(null);
      return;
    }

    // If browser already granted notifications, confirm immediately
    if (Notification.permission === 'granted') {
      setInAppAlertsFallback(false);
      onUpdatePermission('notifications', 'granted');
      setHelperMsg('Browser emergency alert notifications are active.');
      setBusyKey(null);
      return;
    }

    try {
      const res = await Notification.requestPermission();
      if (res === 'granted') {
        setInAppAlertsFallback(false);
        onUpdatePermission('notifications', 'granted');
        setHelperMsg('Emergency alert notifications enabled.');
        try {
          new Notification('NEXORA AI Alerts Active', {
            body: 'You will receive real-time disaster and safety alerts.',
          });
        } catch {
          // Ignore constructor block in strict preview contexts
        }
      } else if (isRunningInsideIframe()) {
        // Embedded preview frames often block OS Notification prompts; activate reliable in-app live alerts instead
        setInAppAlertsFallback(true);
        onUpdatePermission('notifications', 'granted');
        setHelperMsg(
          'In-app live emergency notifications enabled (browser blocked popup notifications inside embedded preview frame).'
        );
      } else {
        onUpdatePermission('notifications', res === 'denied' ? 'denied' : 'prompt');
        setHelperMsg(
          res === 'denied'
            ? 'Notifications are blocked in browser site settings. Click the lock/tune icon next to the URL to allow them, or continue with in-app live alerts.'
            : 'Notification prompt was dismissed. Click Allow anytime to enable.'
        );
      }
    } catch {
      setInAppAlertsFallback(true);
      onUpdatePermission('notifications', 'granted');
      setHelperMsg('In-app live emergency alert banners enabled.');
    }
    setBusyKey(null);
  }, [onUpdatePermission]);

  const requestMedia = useCallback(
    async (kind: 'camera' | 'microphone') => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onUpdatePermission(kind, 'unsupported');
        setHelperMsg(
          `${kind === 'camera' ? 'Camera' : 'Microphone'} API requires HTTPS or localhost and a connected device.`
        );
        return;
      }
      setBusyKey(kind);
      setHelperMsg(`Requesting ${kind} permission...`);
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          kind === 'camera' ? { video: true } : { audio: true }
        );
        // Immediately stop hardware tracks so LED/mic stay off until actively used
        stream.getTracks().forEach((t) => t.stop());
        onUpdatePermission(kind, 'granted');
        setHelperMsg(
          kind === 'camera'
            ? 'Camera access allowed and ready for emergency damage photo uploads.'
            : 'Microphone access allowed and ready for AI Helper voice prompts.'
        );
      } catch (err) {
        const name = (err as DOMException | undefined)?.name || '';
        const label = kind === 'camera' ? 'Camera' : 'Microphone';
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          onUpdatePermission(kind, 'unsupported');
          setHelperMsg(`No ${label.toLowerCase()} hardware was detected on this device.`);
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          onUpdatePermission(kind, 'prompt');
          setHelperMsg(`${label} is currently in use by another app. Close that app and tap Retry.`);
        } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
          onUpdatePermission(kind, 'denied');
          setHelperMsg(
            `${label} access was blocked by the browser. Click the site settings/lock icon in your browser address bar, allow ${label}, then tap Retry.`
          );
        } else {
          onUpdatePermission(kind, 'prompt');
          setHelperMsg(`Could not initialize ${label.toLowerCase()} right now. Tap Retry to try again.`);
        }
      }
      setBusyKey(null);
    },
    [onUpdatePermission]
  );

  const handleEnableRecommended = async () => {
    setBusyKey('all');
    if (permissions.location !== 'granted' && permissions.location !== 'unsupported') {
      await requestLocation();
    }
    if (permissions.notifications !== 'granted' && permissions.notifications !== 'unsupported') {
      await requestNotifications();
    }
    setBusyKey(null);
  };

  if (!open) return null;

  const items: Array<{
    key: keyof DevicePermissionsState;
    title: string;
    desc: string;
    icon: typeof MapPin;
    iconColor: string;
    onAllow: () => void;
    onDisable?: () => void;
    extra?: string;
    inAppFallback?: boolean;
  }> = [
    {
      key: 'location',
      title: 'Live GPS Location',
      desc: 'Shows your live location on Google Maps & Satellite Radar and attaches GPS coordinates to SOS reports.',
      icon: MapPin,
      iconColor: 'text-emerald-400',
      onAllow: () => void requestLocation(),
      onDisable: permissions.location === 'granted' ? onRevokeLocation : undefined,
      extra: liveLocation
        ? `${Math.abs(liveLocation.lat).toFixed(4)}° ${liveLocation.lat >= 0 ? 'N' : 'S'}, ${Math.abs(
            liveLocation.lng
          ).toFixed(4)}° ${liveLocation.lng >= 0 ? 'E' : 'W'}${
            liveLocation.accuracyMeters ? ` · ±${liveLocation.accuracyMeters}m` : ''
          }`
        : undefined,
    },
    {
      key: 'notifications',
      title: 'Emergency Alert Notifications',
      desc: 'Receive real-time alerts when severe weather, GDACS hazards, or SOS dispatches are issued.',
      icon: Bell,
      iconColor: 'text-amber-400',
      onAllow: () => void requestNotifications(),
      inAppFallback: inAppAlertsFallback,
    },
    {
      key: 'camera',
      title: 'Camera Access',
      desc: 'Capture and attach damage or hazard photos directly inside Emergency Help & SOS Reports.',
      icon: Camera,
      iconColor: 'text-sky-400',
      onAllow: () => void requestMedia('camera'),
    },
    {
      key: 'microphone',
      title: 'Microphone Access',
      desc: 'Ask hands-free emergency & first-aid questions inside NEXORA AI Helper.',
      icon: Mic,
      iconColor: 'text-blue-400',
      onAllow: () => void requestMedia('microphone'),
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nexora-permissions-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/15 border border-blue-500/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-blue-400" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="nexora-permissions-title"
                className="text-base font-display font-semibold text-slate-100"
              >
                Enable Live Location &amp; Device Access
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Grant permissions for live map GPS tracking, severe alerts, incident photos, and voice
                help. You can update or retry any permission anytime.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close permissions dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Permission List */}
        <div className="p-5 space-y-2.5 max-h-[62vh] overflow-y-auto">
          {items.map((item) => {
            const Icon = item.icon;
            const status = permissions[item.key];
            const badge = statusBadge(status, item.inAppFallback);
            const BadgeIcon = badge.icon;
            const isBusy = busyKey === item.key || busyKey === 'all';

            return (
              <div
                key={item.key}
                className="p-3.5 rounded-xl border border-slate-800 bg-slate-950 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg border border-slate-800 bg-slate-900 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className={`w-4 h-4 ${item.iconColor}`} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-100">{item.title}</span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${badge.cls}`}
                      >
                        {BadgeIcon && <BadgeIcon className="w-2.5 h-2.5" aria-hidden="true" />}
                        <span>{badge.label}</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{item.desc}</p>
                    {item.extra && (
                      <div className="mt-1 text-[10px] font-mono text-emerald-400">
                        Live GPS: {item.extra}
                      </div>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {status === 'granted' && item.onDisable ? (
                    <button
                      type="button"
                      onClick={item.onDisable}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[11px] font-medium text-slate-300 transition-colors"
                    >
                      Pause
                    </button>
                  ) : status === 'denied' ? (
                    <button
                      type="button"
                      onClick={item.onAllow}
                      disabled={isBusy}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg border border-amber-500/50 bg-amber-950/50 hover:bg-amber-900/60 disabled:opacity-50 text-[11px] font-medium text-amber-200 inline-flex items-center gap-1 transition-colors"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      <span>Retry</span>
                    </button>
                  ) : status !== 'granted' && status !== 'unsupported' ? (
                    <button
                      type="button"
                      onClick={item.onAllow}
                      disabled={isBusy}
                      className="min-h-[32px] px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-[11px] font-medium text-white inline-flex items-center gap-1.5 transition-colors"
                    >
                      {isBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                      <span>Allow</span>
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {helperMsg && (
            <div className="px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-950 text-[11px] text-slate-200 leading-relaxed">
              {helperMsg}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-300 transition-colors"
          >
            {permissions.location === 'granted' || permissions.notifications === 'granted'
              ? 'Continue to App'
              : 'Skip for Now'}
          </button>

          <button
            type="button"
            onClick={() => void handleEnableRecommended()}
            disabled={
              busyKey !== null ||
              (permissions.location === 'granted' && permissions.notifications === 'granted')
            }
            className="min-h-[36px] px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
          >
            {busyKey === 'all' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Allow Live Location &amp; Alerts</span>
          </button>
        </div>
      </div>
    </div>
  );
};

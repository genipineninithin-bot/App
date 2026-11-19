import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  Mail,
  MapPin,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../../firebase';
import { AlertNotification, AuthUser } from '../../types/modules';
import {
  plainAlertCategory,
  plainAlertStatus,
  plainAlertVisibility,
  plainSeverity,
} from '../../utils/plainLabels';

interface AlertsModuleProps {
  alerts: AlertNotification[];
  user: AuthUser;
  onCreateAlert?: (alert: AlertNotification) => Promise<void>;
  onUpdateAlertStatus?: (
    id: string,
    status: AlertNotification['status'],
    visibility?: AlertNotification['visibility']
  ) => Promise<void>;
  onDeleteAlert?: (id: string) => Promise<void>;
  onUpdateNotificationPrefs?: (notifyEmail: boolean, notifySms: boolean) => Promise<void>;
  onOpen3DMap?: () => void;
}

interface TestAlertTemplate {
  label: string;
  title: string;
  region: string;
  category: AlertNotification['category'];
  severity: AlertNotification['severity'];
  channel: AlertNotification['channel'];
  visibility: AlertNotification['visibility'];
  message: string;
}

const TEST_ALERT_TEMPLATES: TestAlertTemplate[] = [
  {
    label: 'Flood Drill (High Risk)',
    title: '[TEST DRILL] Flash Flood Warning — River District',
    region: 'Sendai Coast, Japan',
    category: 'Disaster',
    severity: 'High',
    channel: 'All',
    visibility: 'public',
    message:
      'Practice drill: Heavy rain is raising river water levels. Move to upper floors or nearby shelters and avoid flooded roads.',
  },
  {
    label: 'Earthquake Drill (Danger Now)',
    title: '[TEST DRILL] Strong Earthquake Shaking Alert',
    region: 'Tokyo Bay, Japan',
    category: 'Emergency',
    severity: 'Critical',
    channel: 'All',
    visibility: 'public',
    message:
      'Practice drill: Drop under a sturdy table, cover your head, and stay away from glass windows until shaking stops.',
  },
  {
    label: 'Scam Link Warning (Test)',
    title: '[TEST DRILL] Fake Relief Website Scam Warning',
    region: 'All Regions',
    category: 'Cybersecurity',
    severity: 'High',
    channel: 'Email & SMS',
    visibility: 'public',
    message:
      'Practice alert: Do not click unknown text links offering emergency payouts. Check suspicious links in Scam & Link Checker first.',
  },
  {
    label: 'Rescue Team Dispatch (Test)',
    title: '[TEST DRILL] Medical & Shelter Staging Drill',
    region: 'Sacramento, California',
    category: 'Rescue Op',
    severity: 'Moderate',
    channel: 'Rescue Dispatch',
    visibility: 'rescue_only',
    message:
      'Practice drill: Rescue units report staging readiness and update hospital bed capacity in Help Centers.',
  },
];

export const AlertsModule: React.FC<AlertsModuleProps> = ({
  alerts,
  user,
  onCreateAlert,
  onUpdateAlertStatus,
  onDeleteAlert,
  onUpdateNotificationPrefs,
  onOpen3DMap,
}) => {
  const isAdmin = user.role === 'administrator';
  const showSmsEmailPrefs = user.role === 'citizen' || user.role === 'rescue';

  const [catFilter, setCatFilter] = useState<'All' | AlertNotification['category']>('All');
  const [showCreate, setShowCreate] = useState(isAdmin);
  const [submittingMode, setSubmittingMode] = useState<'Draft' | 'Published' | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<AlertNotification['category']>('Emergency');
  const [severity, setSeverity] = useState<AlertNotification['severity']>('High');
  const [channel, setChannel] = useState<AlertNotification['channel']>('All');
  const [region, setRegion] = useState('');
  const [message, setMessage] = useState('');
  const [visibility, setVisibility] = useState<AlertNotification['visibility']>('public');

  const [notifyEmail, setNotifyEmail] = useState(user.notifyEmail ?? true);
  const [notifySms, setNotifySms] = useState(user.notifySms ?? false);
  const [readIds, setReadIds] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('nexora_alert_read_v1');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  });
  const [ackIds, setAckIds] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('nexora_alert_ack_v1');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    setNotifyEmail(user.notifyEmail ?? true);
    setNotifySms(user.notifySms ?? false);
  }, [user.notifyEmail, user.notifySms]);

  useEffect(() => {
    try {
      localStorage.setItem('nexora_alert_read_v1', JSON.stringify(readIds));
    } catch {
      // ignore storage errors
    }
  }, [readIds]);

  useEffect(() => {
    try {
      localStorage.setItem('nexora_alert_ack_v1', JSON.stringify(ackIds));
    } catch {
      // ignore storage errors
    }
  }, [ackIds]);

  const visibleAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (!isAdmin && a.status !== 'Published') return false;
      if (catFilter !== 'All' && a.category !== catFilter) return false;
      return true;
    });
  }, [alerts, isAdmin, catFilter]);

  const unreadCount = useMemo(
    () => visibleAlerts.filter((a) => !readIds[a.id]).length,
    [visibleAlerts, readIds]
  );

  const markAllRead = () => {
    const next: Record<string, boolean> = { ...readIds };
    visibleAlerts.forEach((a) => {
      next[a.id] = true;
    });
    setReadIds(next);
  };

  const applyTemplate = (tpl: TestAlertTemplate) => {
    setTitle(tpl.title);
    setRegion(tpl.region);
    setCategory(tpl.category);
    setSeverity(tpl.severity);
    setChannel(tpl.channel);
    setVisibility(tpl.visibility);
    setMessage(tpl.message);
    setShowCreate(true);
  };

  const fillRandomTemplate = () => {
    const randomTpl = TEST_ALERT_TEMPLATES[Math.floor(Math.random() * TEST_ALERT_TEMPLATES.length)];
    applyTemplate(randomTpl);
  };

  const submitAlert = async (targetStatus: 'Draft' | 'Published') => {
    if (!onCreateAlert || !title.trim() || !message.trim()) return;
    setSubmittingMode(targetStatus);
    try {
      const effectiveVisibility =
        targetStatus === 'Published' && visibility === 'admin_only' ? 'public' : visibility;
      await onCreateAlert({
        id: `ALT-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`,
        title: title.trim(),
        category,
        severity,
        channel,
        message: message.trim(),
        region: region.trim() || 'All Regions',
        status: targetStatus,
        visibility: effectiveVisibility,
        createdAtLabel: 'Just now',
      });
      setTitle('');
      setRegion('');
      setMessage('');
    } finally {
      setSubmittingMode(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitAlert('Draft');
  };

  const handleTogglePref = async (nextEmail: boolean, nextSms: boolean) => {
    setNotifyEmail(nextEmail);
    setNotifySms(nextSms);
    if (onUpdateNotificationPrefs) {
      await onUpdateNotificationPrefs(nextEmail, nextSms);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Filter & Admin Create */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          {(['All', 'Emergency', 'Disaster', 'Cybersecurity', 'Rescue Op'] as const)
            .filter((c) => c !== 'Rescue Op' || user.role !== 'citizen')
            .map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCatFilter(c)}
                className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  catFilter === c
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {c === 'All' ? 'All Alerts' : plainAlertCategory(c)}
              </button>
            ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="min-h-[40px] px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
              <span>Mark All Seen ({unreadCount})</span>
            </button>
          )}
          {onOpen3DMap && (
            <button
              type="button"
              onClick={onOpen3DMap}
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-100 inline-flex items-center gap-1.5 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
              <span>See on Google Maps</span>
            </button>
          )}
          {isAdmin && onCreateAlert && (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{showCreate ? 'Hide Alert Form' : 'Write / Send Test Alert'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Admin Access & Test Alert Details Banner */}
      {isAdmin && (
        <div className="p-4 rounded-xl border border-amber-500/35 bg-amber-950/15 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-amber-300 inline-flex items-center gap-1.5">
              <Shield className="w-4 h-4 shrink-0" aria-hidden="true" />
              Admin Alert Access Details
            </span>
            <span className="font-mono text-[11px] text-slate-300">
              Signed in as: <strong className="text-white">{user.email}</strong> (Primary Admin: {BOOTSTRAPPED_ADMIN_EMAIL})
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Pick any sample test preset below to auto-fill realistic drill details, edit anything you want, and click <strong className="text-white">Send Test / Live Alert Now</strong> so Citizen and Rescue screens receive it immediately (all sample drills keep a clear <code className="text-amber-300">[TEST DRILL]</code> label). You can pause or delete any test alert anytime.
          </p>
        </div>
      )}

      {/* Plain-English Color Guide */}
      <div className="px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-900 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
        <span className="font-medium text-slate-200">Quick Alert Guide:</span>
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <span className="text-red-400 font-medium">Red = Danger Now (Act right away)</span>
          <span className="text-amber-400 font-medium">Orange = High Risk (Get ready)</span>
          <span className="text-sky-400 font-medium">Blue = Watch (Stay updated)</span>
          <span className="text-emerald-400 font-medium">Green = Live &amp; Verified</span>
        </div>
      </div>

      {/* Email & SMS Notification Subscriptions (Citizen & Rescue Team) */}
      {showSmsEmailPrefs && (
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <div className="font-semibold text-slate-100">
              How Should We Send You Safety Alerts?
            </div>
            <div className="text-slate-400 mt-0.5">
              Choose whether to get emergency, weather, and scam alerts by email or text message ({user.email}).
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => void handleTogglePref(!notifyEmail, notifySms)}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 ${
                notifyEmail
                  ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                  : 'border-slate-700 text-slate-400'
              }`}
            >
              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Email Alerts: {notifyEmail ? 'On' : 'Off'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleTogglePref(notifyEmail, !notifySms)}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 ${
                notifySms
                  ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
                  : 'border-slate-700 text-slate-400'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Text (SMS): {notifySms ? 'On' : 'Off'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Admin Alert Composer with 1-Click Test / Drill Details */}
      {isAdmin && showCreate && (
        <form
          onSubmit={handleSubmit}
          className="p-4 rounded-xl border border-slate-800 bg-slate-900 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-100">
              Write or Auto-Fill a Test / Live Alert
            </div>
            <button
              type="button"
              onClick={fillRandomTemplate}
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-blue-500/40 bg-blue-600/15 text-blue-300 hover:bg-blue-600/25 text-[11px] font-medium inline-flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              <span>Fill Random Test Details</span>
            </button>
          </div>

          {/* 1-Click Test Drill Presets */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] text-slate-400 mr-1">Quick Test Templates:</span>
            {TEST_ALERT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="px-2.5 py-1 rounded-md border border-slate-700 bg-slate-950 hover:border-amber-500/60 text-[11px] text-slate-200 transition-colors"
              >
                {tpl.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              minLength={3}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short alert headline (e.g., [TEST DRILL] Flood Warning — Move to High Ground)"
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
            />
            <input
              type="text"
              required
              minLength={2}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="City or area (e.g., Sendai Coast, Tokyo Bay, or Sacramento)"
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AlertNotification['category'])}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
            >
              <option value="Emergency">Emergency</option>
              <option value="Disaster">Disaster Warning</option>
              <option value="Cybersecurity">Scam &amp; Online Safety</option>
              <option value="Rescue Op">Rescue Team Order</option>
            </select>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as AlertNotification['severity'])}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
            >
              <option value="Critical">Danger Now (Critical)</option>
              <option value="High">High Risk</option>
              <option value="Moderate">Watch (Medium)</option>
              <option value="Low">Low Risk</option>
            </select>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as AlertNotification['channel'])}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
            >
              <option value="All">App, Email &amp; Text (All)</option>
              <option value="Email & SMS">Email &amp; Text Only</option>
              <option value="Rescue Dispatch">Rescue Teams Only</option>
            </select>
            <select
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as AlertNotification['visibility'])
              }
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
            >
              <option value="public">Everyone Can See</option>
              <option value="rescue_only">Rescue Teams Only</option>
              <option value="admin_only">Save as Admin Draft</option>
            </select>
          </div>
          <textarea
            rows={2}
            required
            minLength={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write what happened and what people should do in plain simple words..."
            className="w-full p-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="submit"
              disabled={submittingMode !== null || !title.trim() || !message.trim()}
              className="min-h-[40px] px-4 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              {submittingMode === 'Draft' ? 'Saving Draft...' : 'Save as Draft'}
            </button>
            <button
              type="button"
              onClick={() => void submitAlert('Published')}
              disabled={submittingMode !== null || !title.trim() || !message.trim()}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {submittingMode === 'Published' ? 'Sending Live...' : 'Send Test / Live Alert Now'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Alert Feed & History */}
      <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-900 overflow-hidden">
        {visibleAlerts.length === 0 ? (
          <div className="p-6 text-center space-y-2 text-xs text-slate-400">
            <div className="font-semibold text-slate-200">No alerts in this category right now</div>
            <p>Choose &ldquo;All Alerts&rdquo; above to see all active safety notices.</p>
          </div>
        ) : (
          visibleAlerts.map((al) => {
            const isRead = Boolean(readIds[al.id]);
            const isAck = Boolean(ackIds[al.id]);
            return (
              <div
                key={al.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-900/40 transition-colors ${
                  isRead ? 'opacity-80' : ''
                }`}
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <Bell
                      className={`w-3.5 h-3.5 shrink-0 ${isRead ? 'text-slate-500' : 'text-amber-400'}`}
                      aria-hidden="true"
                    />
                    <span className="font-medium text-slate-300">
                      {plainAlertCategory(al.category)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-semibold ${
                        al.severity === 'Critical'
                          ? 'text-red-400'
                          : al.severity === 'High'
                          ? 'text-amber-400'
                          : 'text-sky-400'
                      }`}
                    >
                      {plainSeverity(al.severity)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        al.status === 'Published'
                          ? 'text-emerald-400'
                          : al.status === 'Verified'
                          ? 'text-blue-400'
                          : 'text-slate-400'
                      }
                    >
                      {plainAlertStatus(al.status)}
                    </span>
                    {!isRead && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono">
                        NEW
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm sm:text-[15px] font-semibold text-slate-100 leading-snug">
                    {al.title}
                  </h3>
                  <p className="text-xs sm:text-[13px] text-slate-300 leading-relaxed">
                    {al.message}
                  </p>

                  <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-400">
                    <span>Area: <strong className="text-slate-300 font-medium">{al.region}</strong></span>
                    <span aria-hidden="true">·</span>
                    <span>Sent via: {al.channel === 'All' ? 'App, Email & SMS' : al.channel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{plainAlertVisibility(al.visibility)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{al.createdAtLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-500">{al.id}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setReadIds((p) => ({ ...p, [al.id]: !p[al.id] }))}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{isRead ? 'Seen' : 'Mark Seen'}</span>
                  </button>

                  {user.role === 'rescue' && (
                    <button
                      type="button"
                      onClick={() => setAckIds((p) => ({ ...p, [al.id]: !p[al.id] }))}
                      className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 ${
                        isAck
                          ? 'border-emerald-500/50 bg-emerald-600/20 text-emerald-300'
                          : 'border-slate-700 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{isAck ? 'Confirmed' : 'Confirm Received'}</span>
                    </button>
                  )}

                  {isAdmin && onUpdateAlertStatus && (
                    <>
                      {al.status === 'Draft' && (
                        <button
                          type="button"
                          onClick={() => void onUpdateAlertStatus(al.id, 'Verified')}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          Approve Alert
                        </button>
                      )}
                      {al.status !== 'Published' ? (
                        <button
                          type="button"
                          onClick={() =>
                            void onUpdateAlertStatus(
                              al.id,
                              'Published',
                              al.visibility === 'admin_only' ? 'public' : al.visibility
                            )
                          }
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 inline-flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Send Live Alert</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void onUpdateAlertStatus(al.id, 'Draft', 'admin_only')}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-600/15 text-amber-300 text-xs font-medium hover:bg-amber-600/25 inline-flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Stop Showing Alert</span>
                        </button>
                      )}
                    </>
                  )}

                  {isAdmin && onDeleteAlert && (
                    <button
                      type="button"
                      onClick={() => void onDeleteAlert(al.id)}
                      aria-label={`Delete alert ${al.title}`}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-600/10 text-red-300 text-xs font-medium hover:bg-red-600/20 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

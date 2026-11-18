import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, CheckCheck, CheckCircle2, Globe, Mail, MessageSquare, Plus, RotateCcw } from 'lucide-react';
import { AlertNotification, AuthUser } from '../../types/modules';

interface AlertsModuleProps {
  alerts: AlertNotification[];
  user: AuthUser;
  onCreateAlert?: (alert: AlertNotification) => Promise<void>;
  onUpdateAlertStatus?: (
    id: string,
    status: AlertNotification['status'],
    visibility?: AlertNotification['visibility']
  ) => Promise<void>;
  onUpdateNotificationPrefs?: (notifyEmail: boolean, notifySms: boolean) => Promise<void>;
  onOpen3DMap?: () => void;
}

export const AlertsModule: React.FC<AlertsModuleProps> = ({
  alerts,
  user,
  onCreateAlert,
  onUpdateAlertStatus,
  onUpdateNotificationPrefs,
  onOpen3DMap,
}) => {
  const isAdmin = user.role === 'administrator';
  const showSmsEmailPrefs = user.role === 'citizen' || user.role === 'rescue';

  const [catFilter, setCatFilter] = useState<'All' | AlertNotification['category']>('All');
  const [showCreate, setShowCreate] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateAlert || !title.trim() || !message.trim()) return;
    await onCreateAlert({
      id: `ALT-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`,
      title: title.trim(),
      category,
      severity,
      channel,
      message: message.trim(),
      region: region.trim() || 'Global Operations',
      status: 'Draft',
      visibility,
      createdAtLabel: 'Just now',
    });
    setTitle('');
    setRegion('');
    setMessage('');
    setShowCreate(false);
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
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0A0F1A] border border-slate-800 rounded-lg">
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
                {c}
              </button>
            ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="min-h-[40px] px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-[#0A0F1A] text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
              <span>Mark All Read ({unreadCount})</span>
            </button>
          )}
          {onOpen3DMap && (
            <button
              type="button"
              onClick={onOpen3DMap}
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-[#0A0F1A] text-slate-100 hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
              <span>3D Impact Map</span>
            </button>
          )}
          {isAdmin && onCreateAlert && (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{showCreate ? 'Close Alert Composer' : 'Create Official Alert'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Email & SMS Notification Subscriptions (Citizen & Rescue Team) */}
      {showSmsEmailPrefs && (
        <div className="p-4 rounded-xl border border-slate-800 bg-[#0A0F1A] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <div className="font-semibold text-slate-100">
              Email &amp; SMS Dispatch Notification Channels
            </div>
            <div className="text-slate-400">
              Control real-time emergency, disaster, and security alert delivery for {user.email}.
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
              <span>Email: {notifyEmail ? 'On' : 'Off'}</span>
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
              <span>SMS: {notifySms ? 'On' : 'Off'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Admin Alert Composer */}
      {isAdmin && showCreate && (
        <form
          onSubmit={handleSubmit}
          className="p-4 rounded-xl border border-slate-800 bg-[#0A0F1A] space-y-3"
        >
          <div className="text-xs font-semibold text-slate-100">
            Create &amp; Classify Emergency Notification
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              minLength={3}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Alert title"
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
            />
            <input
              type="text"
              required
              minLength={2}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Target region"
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AlertNotification['category'])}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-200"
            >
              <option value="Emergency">Emergency</option>
              <option value="Disaster">Disaster Warning</option>
              <option value="Cybersecurity">Cybersecurity Warning</option>
              <option value="Rescue Op">Rescue-Team Operation</option>
            </select>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as AlertNotification['severity'])}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-200"
            >
              <option value="Critical">Critical Severity</option>
              <option value="High">High Severity</option>
              <option value="Moderate">Moderate Severity</option>
              <option value="Low">Low Severity</option>
            </select>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as AlertNotification['channel'])}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-200"
            >
              <option value="All">All Channels</option>
              <option value="Email & SMS">Email &amp; SMS</option>
              <option value="Rescue Dispatch">Rescue Dispatch</option>
            </select>
            <select
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as AlertNotification['visibility'])
              }
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-200"
            >
              <option value="public">Public (All Roles)</option>
              <option value="rescue_only">Rescue Team Dispatch Only</option>
              <option value="admin_only">Admin Draft Review</option>
            </select>
          </div>
          <textarea
            rows={2}
            required
            minLength={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Official emergency bulletin text..."
            className="w-full p-3 text-xs rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="min-h-[40px] px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Create Alert Draft
            </button>
          </div>
        </form>
      )}

      {/* Alert Feed & History */}
      <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-[#0A0F1A] overflow-hidden">
        {visibleAlerts.map((al) => {
          const isRead = Boolean(readIds[al.id]);
          const isAck = Boolean(ackIds[al.id]);
          return (
            <div
              key={al.id}
              className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-900/40 transition-colors ${
                isRead ? 'opacity-80' : ''
              }`}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <Bell
                    className={`w-3.5 h-3.5 shrink-0 ${isRead ? 'text-slate-500' : 'text-amber-400'}`}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-slate-300">{al.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>{al.category}</span>
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
                    {al.severity}
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
                    {al.status}
                  </span>
                  {!isRead && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono">
                      UNREAD
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-semibold text-slate-100">{al.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{al.message}</p>

                <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400">
                  <span>{al.region}</span>
                  <span aria-hidden="true">·</span>
                  <span>Channel: {al.channel}</span>
                  <span aria-hidden="true">·</span>
                  <span>Scope: {al.visibility}</span>
                  <span aria-hidden="true">·</span>
                  <span>{al.createdAtLabel}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setReadIds((p) => ({ ...p, [al.id]: !p[al.id] }))}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{isRead ? 'Read' : 'Mark Read'}</span>
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
                    <span>{isAck ? 'Acknowledged' : 'Acknowledge'}</span>
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
                        Verify Alert
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
                        <span>Publish Official Alert</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void onUpdateAlertStatus(al.id, 'Draft', 'admin_only')}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-600/15 text-amber-300 text-xs font-medium hover:bg-amber-600/25 inline-flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Withdraw Alert</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

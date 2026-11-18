import React, { useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  Lock,
  Save,
  Shield,
  Users,
} from 'lucide-react';
import {
  AuditLogEntry,
  AuthUser,
  SystemConfigState,
  UserRole,
} from '../../types/modules';

interface AdminSystemModuleProps {
  usersList: AuthUser[];
  systemConfig: SystemConfigState;
  auditLogs: AuditLogEntry[];
  onUpdateUserAccount: (
    targetUid: string,
    targetEmail: string,
    role: UserRole,
    accountStatus: NonNullable<AuthUser['accountStatus']>
  ) => Promise<void>;
  onSaveSystemConfig: (cfg: SystemConfigState) => Promise<void>;
}

export const AdminSystemModule: React.FC<AdminSystemModuleProps> = ({
  usersList,
  systemConfig,
  auditLogs,
  onUpdateUserAccount,
  onSaveSystemConfig,
}) => {
  const [tab, setTab] = useState<'users' | 'config' | 'audit'>('users');
  const [cfg, setCfg] = useState<SystemConfigState>(systemConfig);
  const [savingCfg, setSavingCfg] = useState(false);
  const [auditFilter, setAuditFilter] = useState<'All' | 'Auth & Session' | 'Incidents' | 'Alerts & Relief'>('All');

  useEffect(() => {
    setCfg(systemConfig);
  }, [systemConfig]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCfg(true);
    try {
      await onSaveSystemConfig(cfg);
    } finally {
      setSavingCfg(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0A0F1A] border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1.5 ${
              tab === 'users' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Users &amp; Rescue Roles ({usersList.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('config')}
            className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1.5 ${
              tab === 'config' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
            <span>System, AI &amp; API Config</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('audit')}
            className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1.5 ${
              tab === 'audit' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Security Audit &amp; Activity ({auditLogs.length})</span>
          </button>
        </div>

        <span className="text-xs font-mono text-amber-400 inline-flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" aria-hidden="true" />
          Administrator Exclusive Control
        </span>
      </div>

      {/* 1. User, Rescue Team & Role Management */}
      {tab === 'users' && (
        <div className="border border-slate-800 rounded-xl bg-[#0A0F1A] divide-y divide-slate-800 overflow-hidden">
          <div className="px-4 py-3 text-xs font-semibold text-slate-100 flex items-center justify-between">
            <span>User Registration Approval, Rescue Team Roster &amp; Permissions</span>
            <span className="font-mono text-slate-400">{usersList.length} accounts</span>
          </div>
          {usersList.map((u) => (
            <div
              key={u.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="font-semibold text-slate-100 truncate">{u.name}</div>
                <div className="font-mono text-[11px] text-slate-400 truncate">
                  {u.email} · UID {u.id.slice(0, 12)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <select
                  value={u.role}
                  onChange={(e) =>
                    void onUpdateUserAccount(
                      u.id,
                      u.email,
                      e.target.value as UserRole,
                      u.accountStatus || 'Active'
                    )
                  }
                  aria-label={`Role for ${u.email}`}
                  className="min-h-[38px] px-2.5 rounded-lg border border-slate-700 bg-[#0D1422] text-slate-200"
                >
                  <option value="citizen">User / Citizen</option>
                  <option value="rescue">Rescue Team</option>
                  <option value="administrator">Administrator</option>
                </select>

                <select
                  value={u.accountStatus || 'Active'}
                  onChange={(e) =>
                    void onUpdateUserAccount(
                      u.id,
                      u.email,
                      u.role,
                      e.target.value as NonNullable<AuthUser['accountStatus']>
                    )
                  }
                  aria-label={`Account status for ${u.email}`}
                  className="min-h-[38px] px-2.5 rounded-lg border border-slate-700 bg-[#0D1422] text-slate-200"
                >
                  <option value="Active">Approved / Active</option>
                  <option value="Pending">Pending Review</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. System, AI Model & API Data-Source Configuration */}
      {tab === 'config' && (
        <form
          onSubmit={handleSaveConfig}
          className="border border-slate-800 rounded-xl bg-[#0A0F1A] p-4 space-y-4 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="space-y-1.5">
              <span className="text-slate-400 block">AI Inference Model</span>
              <select
                value={cfg.aiModel}
                onChange={(e) => setCfg({ ...cfg, aiModel: e.target.value })}
                className="w-full min-h-[40px] px-3 rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
              >
                <option value="gemini-4-hydrogen">gemini-4-hydrogen</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-slate-400 block">Auto-Escalation Threshold</span>
              <select
                value={cfg.autoEscalationThreshold}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    autoEscalationThreshold: e.target.value as 'Critical' | 'High',
                  })
                }
                className="w-full min-h-[40px] px-3 rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
              >
                <option value="Critical">Critical Only</option>
                <option value="High">High &amp; Critical</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-slate-400 block">Audit Log Retention (Days)</span>
              <input
                type="number"
                min={7}
                max={3650}
                value={cfg.auditRetentionDays}
                onChange={(e) =>
                  setCfg({ ...cfg, auditRetentionDays: Number(e.target.value) || 90 })
                }
                className="w-full min-h-[40px] px-3 rounded-lg border border-slate-700 bg-[#0D1422] text-slate-100"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-[#0D1422] cursor-pointer">
              <span className="text-slate-200">USGS Seismic GeoJSON Feed</span>
              <input
                type="checkbox"
                checked={cfg.usgsFeedEnabled}
                onChange={(e) => setCfg({ ...cfg, usgsFeedEnabled: e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
            </label>
            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-[#0D1422] cursor-pointer">
              <span className="text-slate-200">SMS Alert Gateway</span>
              <input
                type="checkbox"
                checked={cfg.smsGatewayEnabled}
                onChange={(e) => setCfg({ ...cfg, smsGatewayEnabled: e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
            </label>
            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-[#0D1422] cursor-pointer">
              <span className="text-slate-200">Email Alert Gateway</span>
              <input
                type="checkbox"
                checked={cfg.emailGatewayEnabled}
                onChange={(e) => setCfg({ ...cfg, emailGatewayEnabled: e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
            </label>
          </div>

          {/* AI & ML Model Registry + External Data Source Readiness (no API key fields) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <div className="p-3 rounded-lg border border-slate-800 bg-[#0D1422] space-y-1.5">
              <div className="font-semibold text-slate-200">Active AI &amp; ML Models</div>
              <div className="text-[11px] text-slate-400">
                Generative Engine: <span className="font-mono text-blue-400">{cfg.aiModel}</span> (server-managed key)
              </div>
              <div className="text-[11px] text-slate-400">
                Hazard Scoring: <span className="font-mono text-emerald-400">Multi-Factor Heuristic v1</span> (Demonstration)
              </div>
              <div className="text-[11px] text-slate-400">
                Vision / Triage: <span className="font-mono text-sky-400">Gemini Multimodal + Decision Support</span>
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-800 bg-[#0D1422] space-y-1.5">
              <div className="font-semibold text-slate-200">External Data Source Readiness</div>
              <div className="text-[11px] text-slate-400">
                USGS Seismic GeoJSON: <span className="font-mono text-emerald-400">{cfg.usgsFeedEnabled ? 'Live Polling Enabled' : 'Disabled'}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Weather &amp; Storm Telemetry: <span className="font-mono text-amber-400">Simulated Baseline Fallback</span>
              </div>
              <div className="text-[11px] text-slate-400">
                3D Globe Terrain Mesh: <span className="font-mono text-sky-400">Three.js WebGL Interactive Theater</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingCfg}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{savingCfg ? 'Saving Configuration...' : 'Save System Configuration'}</span>
            </button>
          </div>
        </form>
      )}

      {/* 3. Security Audit Logs & Platform Activity */}
      {tab === 'audit' && (() => {
        const filteredLogs = auditLogs.filter((log) => {
          if (auditFilter === 'All') return true;
          if (auditFilter === 'Auth & Session') return /SESSION|USER_ROLE/i.test(log.action);
          if (auditFilter === 'Incidents') return /INCIDENT|ESCALATE|THREAT/i.test(log.action);
          return /ALERT|RELIEF|SYSTEM|AI_KB|USGS/i.test(log.action);
        });
        return (
          <div className="border border-slate-800 rounded-xl bg-[#0A0F1A] divide-y divide-slate-800 overflow-hidden">
            <div className="px-4 py-3 text-xs font-semibold text-slate-100 flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                Immutable Security Audit Logs &amp; Platform Activity ({filteredLogs.length})
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {(['All', 'Auth & Session', 'Incidents', 'Alerts & Relief'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setAuditFilter(cat)}
                    className={`min-h-[28px] px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                      auditFilter === cat
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-100 bg-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            {filteredLogs.length === 0 ? (
              <div className="p-4 text-xs text-slate-400">
                No audit entries match this category yet. Administrative and operational actions appear here automatically.
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-slate-400 font-mono text-[11px]">
                      <span className="text-blue-400">{log.action}</span>
                      <span>·</span>
                      <span>{log.actorEmail}</span>
                      <span>·</span>
                      <span>{log.actorRole}</span>
                    </div>
                    <div className="text-slate-200 truncate">
                      <span className="font-mono text-slate-400 mr-2">[{log.target}]</span>
                      {log.detail}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 shrink-0">
                    {log.timestampLabel}
                  </span>
                </div>
              ))
            )}
          </div>
        );
      })()}
    </div>
  );
};

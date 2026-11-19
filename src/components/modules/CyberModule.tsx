import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Link2,
  MailWarning,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Upload,
} from 'lucide-react';
import { CyberThreat, UserRole } from '../../types/modules';
import {
  formatUrlBreakdownItem,
  plainSeverity,
  plainThreatStatus,
  plainThreatVector,
} from '../../utils/plainLabels';

interface CyberModuleProps {
  threats: CyberThreat[];
  userRole?: UserRole;
  onContainThreat: (id: string) => void;
  onEscalateThreat: (threat: CyberThreat) => void;
  onScanRecorded?: (kind: 'url' | 'message' | 'log', verdict: string) => void;
}

interface ScanResult {
  verdict: string;
  riskScore: number;
  phishingProbability?: number;
  severity: string;
  indicators: string[];
  suspiciousKeywords?: string[];
  urlBreakdown?: Record<string, string | boolean | number>;
  recommendation: string;
}

interface ScanHistoryItem {
  id: string;
  kind: 'url' | 'message' | 'log';
  snippet: string;
  verdict: string;
  riskScore: number;
  time: string;
}

export const CyberModule: React.FC<CyberModuleProps> = ({
  threats,
  userRole = 'citizen',
  onContainThreat,
  onEscalateThreat,
  onScanRecorded,
}) => {
  const isAdmin = userRole === 'administrator';
  const showPhishingAndScoring = isAdmin || userRole === 'citizen';

  const [activeTab, setActiveTab] = useState<'scanner' | 'threats' | 'logs' | 'history'>(
    isAdmin ? 'threats' : 'scanner'
  );
  const [vectorFilter, setVectorFilter] = useState<string>('All');

  // Scanner State (URL, Message, Log)
  const [scanKind, setScanKind] = useState<'url' | 'message' | 'log'>('url');
  const [payload, setPayload] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem('nexora_cyber_scan_history_v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('nexora_cyber_scan_history_v1', JSON.stringify(scanHistory));
    } catch {
      // ignore storage errors
    }
  }, [scanHistory]);

  const filteredThreats = useMemo(() => {
    if (vectorFilter === 'All') return threats;
    return threats.filter((t) => t.vector === vectorFilter);
  }, [threats, vectorFilter]);

  const containedHistory = useMemo(
    () => threats.filter((t) => t.status === 'Contained' || t.status === 'Mitigating'),
    [threats]
  );

  const runScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payload.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setScanError(null);
    setScanResult(null);

    try {
      const res = await fetch('/api/cyber/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: scanKind, payload: payload.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const result = data as ScanResult;
      setScanResult(result);
      setScanHistory((prev) => [
        {
          id: `SCN-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`,
          kind: scanKind,
          snippet: payload.trim().slice(0, 64),
          verdict: result.verdict,
          riskScore: result.riskScore,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...prev.slice(0, 9),
      ]);
      onScanRecorded?.(scanKind, result.verdict);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : 'Unable to complete cyber scan.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setPayload(text.slice(0, 3800));
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      {/* Role-Scoped Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setActiveTab('scanner');
              if (scanKind === 'log') setScanKind('url');
            }}
            className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'scanner'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Check Link or Message
          </button>

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('threats')}
                className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeTab === 'threats'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                Active Cyber Warnings ({threats.filter((t) => t.status !== 'Contained').length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('logs');
                  setScanKind('log');
                }}
                className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeTab === 'logs'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                Check System Logs
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeTab === 'history'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                Past Warnings &amp; Stats
              </button>
            </>
          )}
        </div>

        <span className="text-xs font-mono text-slate-400">
          {isAdmin
            ? 'Full Cyber & Network Protection'
            : userRole === 'rescue'
            ? 'Check Field Links Before Opening'
            : 'Check if a Website Link or Text is a Scam'}
        </span>
      </div>

      {/* Scanner Tab: Malicious Link, Phishing URL & Suspicious Message */}
      {(activeTab === 'scanner' || activeTab === 'logs') && (
        <div className="space-y-4 border border-slate-800 rounded-xl bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('scanner');
                  setScanKind('url');
                }}
                className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium border inline-flex items-center gap-1.5 ${
                  scanKind === 'url'
                    ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                    : 'border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Check Website Link</span>
              </button>

              {showPhishingAndScoring && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('scanner');
                    setScanKind('message');
                  }}
                  className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium border inline-flex items-center gap-1.5 ${
                    scanKind === 'message'
                      ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                      : 'border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MailWarning className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Check Email or SMS</span>
                </button>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('logs');
                    setScanKind('log');
                  }}
                  className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium border inline-flex items-center gap-1.5 ${
                    scanKind === 'log'
                      ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                      : 'border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Firewall / Server Log</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                setPayload(
                  scanKind === 'url'
                    ? 'https://rhine-relief-manifest-verify[.]org/claim?token=9f84b2c1'
                    : scanKind === 'message'
                    ? 'URGENT CIVIL DEFENSE: Your shelter voucher expires in 10 minutes. Install relief-sync.apk and verify bank PIN immediately.'
                    : 'SRC=185.220.101.44 DST=10.4.12.8 PROTO=TCP DPT=2404 FLAGS=SYN IEC104_UNAUTH_FRAME=1'
                )
              }
              className="min-h-[34px] px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-semibold text-white transition-colors"
            >
              Try an Example
            </button>
          </div>

          <form onSubmit={runScan} className="space-y-3">
            <textarea
              rows={3}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              placeholder={
                scanKind === 'url'
                  ? 'Paste a website link here to check if it is safe...'
                  : scanKind === 'message'
                  ? 'Paste a suspicious text message, WhatsApp, or email here...'
                  : 'Paste firewall or server log text here to check for unusual traffic...'
              }
              className="w-full p-3 text-xs sm:text-sm rounded-lg border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <span>Safe check only — links are never opened on your device</span>
                {scanKind === 'log' && (
                  <label className="min-h-[32px] px-2.5 py-1 rounded-md border border-slate-700 bg-slate-950 text-slate-200 hover:border-blue-500 cursor-pointer inline-flex items-center gap-1.5">
                    <Upload className="w-3 h-3 text-blue-400" aria-hidden="true" />
                    <span>{csvFileName ? csvFileName : 'Upload Log File'}</span>
                    <input
                      type="file"
                      accept=".csv,.log,.txt"
                      onChange={handleCsvUpload}
                      className="sr-only"
                    />
                  </label>
                )}
              </div>
              <button
                type="submit"
                disabled={isAnalyzing || !payload.trim()}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isAnalyzing ? 'Checking Safety...' : 'Check Safety Now'}</span>
              </button>
            </div>
          </form>

          {scanError && (
            <div className="p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-300">
              {scanError}
            </div>
          )}

          {scanResult && (
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Result:</span>
                  <span
                    className={`font-semibold ${
                      scanResult.verdict === 'Malicious'
                        ? 'text-red-400'
                        : scanResult.verdict === 'Suspicious'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {scanResult.verdict === 'Malicious'
                      ? 'Danger — Likely Scam or Virus'
                      : scanResult.verdict === 'Suspicious'
                      ? 'Be Careful — Looks Suspicious'
                      : 'Safe — Looks Okay'}
                  </span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className="text-slate-300">{plainSeverity(scanResult.severity)}</span>
                </div>

                {showPhishingAndScoring && (
                  <div className="text-xs font-mono tabular-nums text-slate-200">
                    Danger Score:{' '}
                    <span
                      className={
                        scanResult.riskScore >= 70
                          ? 'text-red-400 font-bold'
                          : scanResult.riskScore >= 40
                          ? 'text-amber-400 font-bold'
                          : 'text-emerald-400 font-bold'
                      }
                    >
                      {scanResult.riskScore}/100
                    </span>
                  </div>
                )}
              </div>

              {showPhishingAndScoring && (
                <div className="h-2 w-full bg-slate-900 rounded-sm overflow-hidden">
                  <div
                    className={`h-full ${
                      scanResult.riskScore >= 70
                        ? 'bg-red-500'
                        : scanResult.riskScore >= 40
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, scanResult.riskScore))}%` }}
                  />
                </div>
              )}

              <ul className="space-y-1 text-xs text-slate-300 list-disc pl-4">
                {scanResult.indicators?.map((ind, idx) => (
                  <li key={idx}>{ind}</li>
                ))}
              </ul>

              {typeof scanResult.phishingProbability === 'number' && (
                <div className="text-xs font-mono text-amber-300">
                  Scam Chance: {scanResult.phishingProbability}%
                  {scanResult.suspiciousKeywords && scanResult.suspiciousKeywords.length > 0 && (
                    <span className="text-slate-400 ml-2">
                      · Warning Words: {scanResult.suspiciousKeywords.join(', ')}
                    </span>
                  )}
                </div>
              )}

              {scanResult.urlBreakdown && (
                <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900 text-[11px] font-mono text-slate-400 flex flex-wrap gap-3">
                  {Object.entries(scanResult.urlBreakdown).map(([k, v]) => {
                    const item = formatUrlBreakdownItem(k, v);
                    return (
                      <span key={k}>
                        {item.label}:{' '}
                        <strong className={item.warn ? 'text-amber-300' : 'text-slate-200'}>
                          {item.display}
                        </strong>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="pt-2 border-t border-slate-800 text-xs text-blue-300">
                What You Should Do: {scanResult.recommendation}
              </div>
            </div>
          )}

          {scanHistory.length > 0 && (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="text-[11px] font-mono text-slate-400">Recent Session Scans</div>
              <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950">
                {scanHistory.map((h) => (
                  <div key={h.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-300">
                      <span className="font-mono text-blue-400 mr-1.5">[{h.kind.toUpperCase()}]</span>
                      {h.snippet}
                    </span>
                    <span className="font-mono shrink-0 text-amber-300">
                      {h.verdict} ({h.riskScore}) · {h.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Admin Active Threat Detections */}
      {isAdmin && activeTab === 'threats' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit">
            {['All', 'OT / SCADA', 'Ransomware', 'Volumetric DDoS', 'Zero-Day', 'Phishing'].map(
              (vec) => (
                <button
                  key={vec}
                  type="button"
                  onClick={() => setVectorFilter(vec)}
                  className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    vectorFilter === vec
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {vec === 'All' ? 'All Threats' : plainThreatVector(vec)}
                </button>
              )
            )}
          </div>

          <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-900 overflow-hidden">
            {filteredThreats.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <p className="text-xs text-slate-400">No active cyber threats match this filter.</p>
                {vectorFilter !== 'All' && (
                  <button
                    type="button"
                    onClick={() => setVectorFilter('All')}
                    className="min-h-[34px] px-3 py-1 text-xs font-medium rounded-lg border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                  >
                    Show All Threats
                  </button>
                )}
              </div>
            ) : (
              filteredThreats.map((t) => {
                const isContained = t.status === 'Contained';
                return (
                  <div
                    key={t.id}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-900/60 transition-colors"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="font-mono text-slate-300">{t.id}</span>
                        <span aria-hidden="true">·</span>
                        <span>{plainThreatVector(t.vector)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{t.platform}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-semibold inline-flex items-center gap-1 ${
                            isContained
                              ? 'text-emerald-400'
                              : t.severity === 'Critical'
                              ? 'text-red-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {isContained ? (
                            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          {isContained
                            ? 'Blocked & Safe'
                            : `${plainSeverity(t.severity)} · ${plainThreatStatus(t.status)}`}
                        </span>
                      </div>

                      <h3 className="text-sm font-semibold text-slate-100">{t.title}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">{t.summary}</p>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400 pt-0.5">
                        <span className="text-red-300">Clue: {t.ioc}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{t.affectedHosts} devices</span>
                        {t.linkedDisasterId && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-300">Linked Warning: {t.linkedDisasterId}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEscalateThreat(t)}
                        className="min-h-[40px] px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
                      >
                        Create Report
                      </button>
                      <button
                        type="button"
                        onClick={() => onContainThreat(t.id)}
                        disabled={isContained}
                        className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-800 disabled:text-emerald-400 transition-colors whitespace-nowrap"
                      >
                        {isContained ? 'Blocked & Safe' : 'Block & Make Safe'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Admin Security Incident History & Cyber Analytics */}
      {isAdmin && activeTab === 'history' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 border border-slate-800 rounded-xl bg-slate-900 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
              <Activity className="w-4 h-4 text-blue-400" aria-hidden="true" />
              <span>Safety Summary</span>
            </div>
            <div className="divide-y divide-slate-800 text-xs">
              <div className="py-2 flex justify-between">
                <span className="text-slate-400">Devices Protected</span>
                <span className="font-mono tabular-nums text-slate-100">
                  {threats.reduce((sum, t) => sum + t.affectedHosts, 0)}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-400">Threats Blocked</span>
                <span className="font-mono tabular-nums text-emerald-400">
                  {Math.round(
                    (threats.filter((t) => t.status === 'Contained').length /
                      Math.max(1, threats.length)) *
                      100
                  )}
                  %
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-400">Danger Now Threats</span>
                <span className="font-mono tabular-nums text-red-400">
                  {threats.filter((t) => t.severity === 'Critical').length}
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 border border-slate-800 rounded-xl bg-slate-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 text-xs font-semibold text-slate-100">
              Resolved &amp; Blocked Cyber Warnings
            </div>
            <div className="divide-y divide-slate-800">
              {containedHistory.length === 0 ? (
                <div className="p-4 text-xs text-slate-400">
                  No cyber warnings have been blocked yet.
                </div>
              ) : (
                containedHistory.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-100 truncate">
                        <span className="font-mono text-slate-400 mr-2">{item.id}</span>
                        {item.title}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        {plainThreatVector(item.vector)} · {item.platform} · {item.ioc}
                      </div>
                    </div>
                    <span
                      className={`font-mono shrink-0 ${
                        item.status === 'Contained' ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {plainThreatStatus(item.status)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  Camera,
  CheckCircle2,
  MapPin,
  Monitor,
  Plus,
  ShieldCheck,
  Smartphone,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  AlertNotification,
  DisasterForecast,
  IncidentTicket,
  ModuleId,
  ReliefResource,
  Severity,
  UserRole,
} from '../../types/modules';
import { GoogleMapsPanel } from '../GoogleMapsPanel';
import {
  plainIncidentDomain,
  plainIncidentStatus,
  plainSeverity,
} from '../../utils/plainLabels';
import {
  EMERGENCY_DEPARTMENTS,
  getIncidentApprovalState,
  PENDING_ADMIN_UNIT_LABEL,
  suggestDepartmentForIncident,
} from '../../../frontend/departments';
import { requestBestGeolocation } from '../../../frontend/permissions';

interface ResponseModuleProps {
  incidents: IncidentTicket[];
  forecasts?: DisasterForecast[];
  alerts?: AlertNotification[];
  resources?: ReliefResource[];
  userRole?: UserRole;
  liveLocation?: { lat: number; lng: number } | null;
  onAdvanceStatus: (id: string, nextStatus: IncidentTicket['status']) => void;
  onCreateIncident: (ticket: IncidentTicket) => void;
  onOpenModule?: (id: ModuleId) => void;
  onUpdateAdminIncident?: (
    id: string,
    updates: {
      verifiedByAdmin?: boolean;
      assignedUnit?: string;
      casualtiesCount?: number;
      exposedPopulation?: number;
      triagePriority?: IncidentTicket['triagePriority'];
      damageAssessment?: string;
      status?: IncidentTicket['status'];
      notes?: string;
    }
  ) => Promise<void>;
  onUpdateRescueIncident?: (
    id: string,
    updates: {
      status?: IncidentTicket['status'];
      triagePriority?: IncidentTicket['triagePriority'];
      patientTransferNote?: string;
      notes?: string;
    }
  ) => Promise<void>;
}

const RESCUE_MILESTONES = [
  'Pending',
  'Accepted',
  'Dispatched',
  'Reached Location',
  'In Progress',
  'Completed',
] as const;

type RescueMilestone = (typeof RESCUE_MILESTONES)[number];

export const ResponseModule: React.FC<ResponseModuleProps> = ({
  incidents,
  forecasts = [],
  alerts = [],
  resources = [],
  userRole = 'citizen',
  liveLocation = null,
  onAdvanceStatus,
  onCreateIncident,
  onOpenModule,
  onUpdateAdminIncident,
  onUpdateRescueIncident,
}) => {
  const isAdmin = userRole === 'administrator';
  const isRescue = userRole === 'rescue';
  const canAdvanceStatus = isAdmin || isRescue;

  const [showForm, setShowForm] = useState(false);
  const [show3DMap, setShow3DMap] = useState(false);
  const [title, setTitle] = useState('');
  const [region, setRegion] = useState('');
  const [locationCoords, setLocationCoords] = useState(() =>
    liveLocation ? `${liveLocation.lat.toFixed(4)}°, ${liveLocation.lng.toFixed(4)}°` : ''
  );
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [domain, setDomain] = useState<IncidentTicket['domain']>('Disaster');
  const [severity, setSeverity] = useState<Severity>('High');
  const [platformSupport, setPlatformSupport] =
    useState<IncidentTicket['platformSupport']>('Windows & Mobile');
  const [imageFileName, setImageFileName] = useState('');
  const [uploadedImages, setUploadedImages] = useState<
    Record<string, { base64: string; mimeType: string; dataUrl: string }>
  >({});
  const [preImages, setPreImages] = useState<
    Record<string, { base64: string; mimeType: string; dataUrl: string }>
  >({});

  // Per-incident interactive inspector / AI evaluation state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  // Admin & Rescue edit buffers
  const [assignInput, setAssignInput] = useState<Record<string, string>>({});
  const [exposedInput, setExposedInput] = useState<Record<string, string>>({});
  const [casualtyInput, setCasualtyInput] = useState<Record<string, string>>({});
  const [missingInput, setMissingInput] = useState<Record<string, string>>({});
  const [injuredInput, setInjuredInput] = useState<Record<string, string>>({});
  const [trappedInput, setTrappedInput] = useState<Record<string, string>>({});
  const [transferInput, setTransferInput] = useState<Record<string, string>>({});
  const [damageCategoryInput, setDamageCategoryInput] = useState<Record<string, string>>({});
  const [areaKm2Input, setAreaKm2Input] = useState<Record<string, string>>({});
  const [milestones, setMilestones] = useState<Record<string, RescueMilestone>>({});
  const [patientFlags, setPatientFlags] = useState<
    Record<string, { conscious: string; breathing: string; bleeding: string; symptoms: string }>
  >({});

  const summary = useMemo(() => {
    const rejected = incidents.filter((i) => getIncidentApprovalState(i) === 'rejected').length;
    const verified = incidents.filter((i) => getIncidentApprovalState(i) === 'approved').length;
    const awaitingApproval = incidents.filter((i) => getIncidentApprovalState(i) === 'pending').length;
    const resolved = incidents.filter((i) => i.status === 'Resolved' && !i.notes.startsWith('[REJECTED]')).length;
    return { total: incidents.length, awaitingApproval, verified, rejected, resolved };
  }, [incidents]);

  const handleLocateMe = async () => {
    setGpsNotice('Acquiring live GPS fix...');
    const outcome = await requestBestGeolocation();
    if (outcome.ok) {
      setGpsNotice(null);
      setLocationCoords(`${outcome.lat.toFixed(4)}°, ${outcome.lng.toFixed(4)}°`);
    } else {
      setGpsNotice(outcome.message);
    }
  };

  const handleImagePick = (
    e: React.ChangeEvent<HTMLInputElement>,
    targetTicketId?: string,
    slot: 'post' | 'pre' = 'post'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      if (comma > -1) {
        const meta = result.slice(0, comma);
        const mimeMatch = /data:([^;]+);base64/.exec(meta);
        const mimeType = mimeMatch?.[1] || 'image/jpeg';
        const base64 = result.slice(comma + 1);
        if (targetTicketId) {
          if (slot === 'pre') {
            setPreImages((prev) => ({
              ...prev,
              [targetTicketId]: { base64, mimeType, dataUrl: result },
            }));
          } else {
            setUploadedImages((prev) => ({
              ...prev,
              [targetTicketId]: { base64, mimeType, dataUrl: result },
            }));
          }
        } else {
          setImageFileName(file.name);
          setUploadedImages((prev) => ({
            ...prev,
            draft: { base64, mimeType, dataUrl: result },
          }));
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !region.trim()) return;
    const newId = `INC-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`;
    if (uploadedImages.draft) {
      const draftImg = uploadedImages.draft;
      setUploadedImages((prev) => {
        const next = { ...prev, [newId]: draftImg };
        delete next.draft;
        return next;
      });
    }

    onCreateIncident({
      id: newId,
      title: title.trim(),
      domain,
      severity,
      region: region.trim(),
      assignedUnit: isAdmin
        ? 'Disaster Management Force (NDRF/FEMA)'
        : isRescue
        ? 'Fire & Rescue Department'
        : PENDING_ADMIN_UNIT_LABEL,
      verifiedByAdmin: isAdmin ? true : false,
      platformSupport,
      status: 'Dispatched',
      updatedAt: 'Just now',
      locationCoords:
        locationCoords.trim() ||
        (liveLocation ? `${liveLocation.lat.toFixed(4)}°, ${liveLocation.lng.toFixed(4)}°` : undefined),
      imageSummary: imageFileName ? `Uploaded imagery: ${imageFileName}` : undefined,
      notes:
        notes.trim() ||
        (isAdmin
          ? 'Admin-approved emergency dispatch synced across command units.'
          : isRescue
          ? 'Field rescue team dispatch report awaiting command coordination.'
          : 'Citizen Emergency SOS submitted — awaiting administrator approval and department assignment.'),
    });
    setTitle('');
    setRegion('');
    setLocationCoords('');
    setNotes('');
    setImageFileName('');
    setShowForm(false);
  };

  const runResponseAi = async (
    inc: IncidentTicket,
    mode: 'damage' | 'triage' | 'rescue_recommend'
  ) => {
    const key = `${inc.id}:${mode}`;
    setAiLoading(key);
    try {
      const img = uploadedImages[inc.id];
      const preImg = preImages[inc.id];
      const flags = patientFlags[inc.id];
      const res = await fetch('/api/response/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          title: inc.title,
          region: inc.region,
          notes: `${inc.notes} ${inc.damageAssessment || ''}`,
          imageBase64: img?.base64,
          mimeType: img?.mimeType,
          preImageBase64: preImg?.base64,
          preMimeType: preImg?.mimeType,
          damageCategory: damageCategoryInput[inc.id] || 'Unknown / Needs inspection',
          estimatedAreaKm2: areaKm2Input[inc.id] || '',
          patientFlags: flags,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setAiOutput((prev) => ({ ...prev, [inc.id]: data.analysis }));

      if (isAdmin && mode === 'damage' && onUpdateAdminIncident) {
        await onUpdateAdminIncident(inc.id, {
          damageAssessment: String(data.analysis).slice(0, 380),
        });
      }
    } catch (err: unknown) {
      setAiOutput((prev) => ({
        ...prev,
        [inc.id]: err instanceof Error ? err.message : 'AI analysis unavailable.',
      }));
    } finally {
      setAiLoading(null);
    }
  };

  const handleMilestoneChange = async (inc: IncidentTicket, nextMilestone: RescueMilestone) => {
    setMilestones((prev) => ({ ...prev, [inc.id]: nextMilestone }));
    const mappedStatus: IncidentTicket['status'] =
      nextMilestone === 'Completed'
        ? 'Resolved'
        : nextMilestone === 'Reached Location' || nextMilestone === 'In Progress'
        ? 'In Progress'
        : 'Dispatched';
    if (onUpdateRescueIncident) {
      await onUpdateRescueIncident(inc.id, {
        status: mappedStatus,
        notes: `${inc.notes.replace(/\s*\[Milestone:[^\]]+\]/g, '')} [Milestone: ${nextMilestone}]`.slice(0, 480),
      });
    }
  };

  const nextActionLabel = (status: IncidentTicket['status']) => {
    if (!canAdvanceStatus) return null;
    if (status === 'Dispatched') return { label: 'Start Rescue Work', next: 'In Progress' as const };
    if (status === 'In Progress') return { label: 'Mark Under Control', next: 'Contained' as const };
    if (status === 'Contained') return { label: 'Mark Completed', next: 'Resolved' as const };
    return null;
  };

  return (
    <div className="space-y-5">
      {/* Header & Fleet Status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <Monitor className="w-4 h-4 text-sky-400" aria-hidden="true" />
            <span>Desktop Dispatch Ready</span>
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-blue-400" aria-hidden="true" />
            <span>Mobile Field Teams Connected</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShow3DMap((v) => !v)}
            className={`min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
              show3DMap
                ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                : 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
            }`}
          >
            <MapPin className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>{show3DMap ? 'Hide Google Maps' : 'Open Google Maps'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-sm"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>{showForm ? 'Close SOS Form' : 'Emergency SOS — Add Report'}</span>
          </button>
        </div>
      </div>

      {/* Incident Status KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 border border-slate-800 rounded-xl bg-slate-900 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
        <div className="p-3">
          <div className="text-[11px] text-slate-400">All Reports</div>
          <div className="font-display text-lg font-bold tabular-nums text-slate-100">{summary.total}</div>
        </div>
        <div className="p-3">
          <div className="text-[11px] text-slate-400">Pending Admin Approval</div>
          <div className="font-display text-lg font-bold tabular-nums text-amber-400">{summary.awaitingApproval}</div>
        </div>
        <div className="p-3">
          <div className="text-[11px] text-slate-400">Approved &amp; Assigned</div>
          <div className="font-display text-lg font-bold tabular-nums text-emerald-400">{summary.verified}</div>
        </div>
        <div className="p-3">
          <div className="text-[11px] text-slate-400">Rejected</div>
          <div className="font-display text-lg font-bold tabular-nums text-red-400">{summary.rejected}</div>
        </div>
        <div className="p-3">
          <div className="text-[11px] text-slate-400">Completed</div>
          <div className="font-display text-lg font-bold tabular-nums text-blue-400">{summary.resolved}</div>
        </div>
      </div>

      {/* Optional Interactive Google Maps Incident View */}
      {show3DMap && (
        <GoogleMapsPanel
          forecasts={forecasts}
          incidents={incidents}
          alerts={alerts}
          resources={resources}
          initialUserLocation={liveLocation}
          onSelectModule={onOpenModule}
        />
      )}

      {/* Inline Incident Reporting / Dispatch Form (Location & Image Upload Included) */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-4 rounded-xl border border-slate-800 bg-slate-900 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What happened? (e.g., Flooded street, fallen tree)"
              required
              minLength={3}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
            />
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="City, town, or neighborhood"
              required
              minLength={2}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={locationCoords}
                onChange={(e) => setLocationCoords(e.target.value)}
                placeholder="GPS location (optional)"
                className="flex-1 min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
              />
              <button
                type="button"
                onClick={handleLocateMe}
                title="Use my current location"
                className="min-h-[40px] px-3 rounded-lg border border-slate-700 text-xs text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1 shrink-0"
              >
                <MapPin className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                <span>My Location</span>
              </button>
            </div>

            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value as IncidentTicket['domain'])}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
            >
              <option value="Disaster">Disaster / Weather</option>
              <option value="Hybrid Nexus">Disaster &amp; Power Outage</option>
              {isAdmin && <option value="Cyber">Online / Cyber Attack</option>}
            </select>

            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
            >
              <option value="Critical">Danger Now (Urgent)</option>
              <option value="High">High Risk</option>
              <option value="Moderate">Medium Risk</option>
              <option value="Low">Low Risk</option>
            </select>
          </div>

          {gpsNotice && (
            <div className="text-[11px] text-amber-300">{gpsNotice}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={platformSupport}
              onChange={(e) =>
                setPlatformSupport(e.target.value as IncidentTicket['platformSupport'])
              }
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
            >
              <option value="Windows & Mobile">All Teams (Office &amp; Field)</option>
              <option value="Windows Desktop">Command Desk</option>
              <option value="Mobile Field">Mobile Rescue Team</option>
            </select>

            <label className="min-h-[40px] px-3 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-300 flex items-center justify-between cursor-pointer hover:border-blue-500">
              <span className="inline-flex items-center gap-1.5 truncate">
                <Camera className="w-3.5 h-3.5 text-blue-400 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {imageFileName ? imageFileName : 'Add a photo (optional)'}
                </span>
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleImagePick(e)}
                className="sr-only"
              />
            </label>
          </div>

          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tell us who needs help, blocked roads, or damage nearby..."
            className="w-full p-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              {isAdmin
                ? 'Admin submissions are automatically approved and ready for department assignment.'
                : 'Your Emergency SOS will be sent to the Administrator for approval and department assignment.'}
            </span>
            <button
              type="submit"
              className="min-h-[40px] px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Send Emergency SOS
            </button>
          </div>
        </form>
      )}

      {/* Incident Queue & Role-Scoped Operational Drawer */}
      <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-900 overflow-hidden">
        {incidents.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            No emergency reports right now. Use &ldquo;Report an Emergency&rdquo; above if someone needs help.
          </div>
        ) : (
          incidents.map((inc) => {
          const action = nextActionLabel(inc.status);
          const expanded = selectedId === inc.id;
          return (
            <div key={inc.id} className="p-4 space-y-3 hover:bg-slate-900/40 transition-colors">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono text-slate-300">{inc.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>{plainIncidentDomain(inc.domain)}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-semibold ${
                        inc.severity === 'Critical'
                          ? 'text-red-400'
                          : inc.severity === 'High'
                          ? 'text-amber-400'
                          : 'text-sky-400'
                      }`}
                    >
                      {plainSeverity(inc.severity)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-blue-400">{plainIncidentStatus(inc.status)}</span>
                    {(() => {
                      const approval = getIncidentApprovalState(inc);
                      if (approval === 'approved') {
                        return (
                          <span className="px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                            <span>Admin Approved</span>
                          </span>
                        );
                      }
                      if (approval === 'rejected') {
                        return (
                          <span className="px-2 py-0.5 rounded border border-red-500/40 bg-red-500/15 text-red-300 text-[10px] font-semibold inline-flex items-center gap-1">
                            <XCircle className="w-3 h-3" aria-hidden="true" />
                            <span>Rejected</span>
                          </span>
                        );
                      }
                      return (
                        <span className="px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/15 text-amber-300 text-[10px] font-semibold">
                          Pending Admin Approval
                        </span>
                      );
                    })()}
                    {inc.triagePriority && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-300">{inc.triagePriority}</span>
                      </>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold text-slate-100">{inc.title}</h3>
                  <p className="text-xs text-slate-400">{inc.notes}</p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400 pt-0.5">
                    <span>{inc.region}</span>
                    {inc.locationCoords && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>GPS {inc.locationCoords}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className={inc.verifiedByAdmin ? 'text-emerald-300' : 'text-amber-300'}>
                      Department: {inc.assignedUnit}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Updated {inc.updatedAt}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {(isAdmin || isRescue) && (
                    <button
                      type="button"
                      onClick={() => setSelectedId(expanded ? null : inc.id)}
                      className="min-h-[40px] px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
                    >
                      {expanded ? 'Hide Tools' : 'Rescue & Damage Tools'}
                    </button>
                  )}
                  {action && (
                    <button
                      type="button"
                      onClick={() => onAdvanceStatus(inc.id, action.next)}
                      className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
                    >
                      {action.label}
                    </button>
                  )}
                </div>
              </div>

              {/* Inline Admin Approval & Department Assignment Bar (Always visible to Admin on pending/open tickets) */}
              {isAdmin && onUpdateAdminIncident && getIncidentApprovalState(inc) !== 'rejected' && (
                <div
                  className={`p-3 rounded-lg border flex flex-wrap items-center justify-between gap-2.5 text-xs ${
                    inc.verifiedByAdmin
                      ? 'border-slate-800 bg-slate-950'
                      : 'border-amber-500/40 bg-amber-950/20'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck
                      className={`w-4 h-4 shrink-0 ${
                        inc.verifiedByAdmin ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="font-medium text-slate-200">
                      {inc.verifiedByAdmin
                        ? 'Reassign Response Department:'
                        : 'Admin Approval Required — Assign Department:'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Select response department"
                      value={
                        assignInput[inc.id] ??
                        (EMERGENCY_DEPARTMENTS.includes(inc.assignedUnit as (typeof EMERGENCY_DEPARTMENTS)[number])
                          ? inc.assignedUnit
                          : suggestDepartmentForIncident(inc))
                      }
                      onChange={(e) =>
                        setAssignInput((p) => ({ ...p, [inc.id]: e.target.value }))
                      }
                      className="min-h-[34px] px-2.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100"
                    >
                      {EMERGENCY_DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => {
                        const chosenDept =
                          assignInput[inc.id] ||
                          (EMERGENCY_DEPARTMENTS.includes(inc.assignedUnit as (typeof EMERGENCY_DEPARTMENTS)[number])
                            ? inc.assignedUnit
                            : suggestDepartmentForIncident(inc));
                        void onUpdateAdminIncident(inc.id, {
                          verifiedByAdmin: true,
                          assignedUnit: chosenDept,
                          status: inc.status === 'Resolved' ? 'Dispatched' : inc.status,
                        });
                      }}
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{inc.verifiedByAdmin ? 'Update Department' : 'Approve & Assign'}</span>
                    </button>

                    {!inc.verifiedByAdmin && (
                      <button
                        type="button"
                        onClick={() =>
                          void onUpdateAdminIncident(inc.id, {
                            verifiedByAdmin: false,
                            status: 'Resolved',
                            notes: `[REJECTED] Flagged by admin review: ${inc.notes}`.slice(0, 480),
                          })
                        }
                        className="min-h-[34px] px-3 py-1 rounded-lg border border-red-500/40 bg-red-600/20 hover:bg-red-600/30 text-red-300 text-xs font-medium inline-flex items-center gap-1 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Reject</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Admin & Rescue Command Panel */}
              {expanded && (isAdmin || isRescue) && (
                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950 space-y-3 text-xs">
                  {/* Verification & Rejection + AI Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {isAdmin && onUpdateAdminIncident && !inc.verifiedByAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void onUpdateAdminIncident(inc.id, { verifiedByAdmin: true })
                          }
                          className="min-h-[36px] px-3 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Verify &amp; Approve</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void onUpdateAdminIncident(inc.id, {
                              verifiedByAdmin: false,
                              status: 'Resolved',
                              notes: `[REJECTED] Flagged by admin review: ${inc.notes}`.slice(0, 480),
                            })
                          }
                          className="min-h-[36px] px-3 py-1 rounded-lg border border-red-500/40 bg-red-600/15 text-red-300 hover:bg-red-600/25 inline-flex items-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Reject Report</span>
                        </button>
                      </>
                    )}

                    {isAdmin && (
                      <>
                        <label className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer">
                          <Camera className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                          <span>{preImages[inc.id] ? 'Before Photo Ready' : 'Before Photo'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleImagePick(e, inc.id, 'pre')}
                            className="sr-only"
                          />
                        </label>
                        <label className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer">
                          <Camera className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                          <span>{uploadedImages[inc.id] ? 'After Photo Ready' : 'After Photo'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleImagePick(e, inc.id, 'post')}
                            className="sr-only"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void runResponseAi(inc, 'damage')}
                          disabled={aiLoading === `${inc.id}:damage`}
                          className="min-h-[36px] px-3 py-1 rounded-lg border border-blue-500/40 bg-blue-600/15 text-blue-300 hover:bg-blue-600/25 inline-flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {aiLoading === `${inc.id}:damage`
                              ? 'Assessing...'
                              : 'AI Damage & Satellite Analysis'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void runResponseAi(inc, 'rescue_recommend')}
                          disabled={aiLoading === `${inc.id}:rescue_recommend`}
                          className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1.5"
                        >
                          <span>Recommend Rescue Team</span>
                        </button>
                      </>
                    )}
                  </div>

                  {/* Pre vs Post Satellite Side-by-Side Comparator (Admin) */}
                  {isAdmin && (preImages[inc.id] || uploadedImages[inc.id]) && (
                    <div className="p-3 rounded-lg border border-slate-800 bg-slate-900 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                        <span className="font-semibold text-slate-200">
                          Satellite / Field Imagery Comparison (Visual Inspection Assist — Does NOT confirm casualties)
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={damageCategoryInput[inc.id] || 'Unknown / Needs inspection'}
                            onChange={(e) =>
                              setDamageCategoryInput((p) => ({ ...p, [inc.id]: e.target.value }))
                            }
                            aria-label="Estimated structural damage category"
                            className="min-h-[30px] px-2 rounded border border-slate-700 bg-slate-950 text-slate-200"
                          >
                            <option value="Unknown / Needs inspection">Unknown / Needs inspection</option>
                            <option value="Minor">Minor Damage</option>
                            <option value="Moderate">Moderate Damage</option>
                            <option value="Severe">Severe Structural Damage</option>
                          </select>
                          <input
                            type="text"
                            value={areaKm2Input[inc.id] ?? ''}
                            onChange={(e) =>
                              setAreaKm2Input((p) => ({ ...p, [inc.id]: e.target.value }))
                            }
                            placeholder="Area km²"
                            className="w-24 min-h-[30px] px-2 rounded border border-slate-700 bg-slate-950 text-slate-100"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                          <div className="text-[10px] font-mono text-slate-400 mb-1">PRE-DISASTER BASELINE</div>
                          {preImages[inc.id] ? (
                            <img
                              src={preImages[inc.id].dataUrl}
                              alt="Pre-disaster baseline"
                              className="w-full h-36 object-cover rounded"
                            />
                          ) : (
                            <div className="h-36 flex items-center justify-center text-slate-500 text-[11px]">
                              Upload Pre-Disaster image for side-by-side comparison
                            </div>
                          )}
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                          <div className="text-[10px] font-mono text-sky-400 mb-1">POST-DISASTER CAPTURE</div>
                          {uploadedImages[inc.id] ? (
                            <img
                              src={uploadedImages[inc.id].dataUrl}
                              alt="Post-disaster capture"
                              className="w-full h-36 object-cover rounded"
                            />
                          ) : (
                            <div className="h-36 flex items-center justify-center text-slate-500 text-[11px]">
                              Upload Post-Disaster image to compare
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {inc.damageAssessment && (
                    <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300">
                      <span className="text-slate-400 font-mono mr-2">Damage Assessment:</span>
                      {inc.damageAssessment}
                    </div>
                  )}

                  {aiOutput[inc.id] && (
                    <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-950/25 text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {aiOutput[inc.id]}
                    </div>
                  )}

                  {/* Admin Human Impact (Exposed, Casualties, Missing, Injured, Trapped) & Unit Assignment */}
                  {isAdmin && onUpdateAdminIncident && (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <input
                          type="text"
                          value={assignInput[inc.id] ?? inc.assignedUnit}
                          onChange={(e) =>
                            setAssignInput((p) => ({ ...p, [inc.id]: e.target.value }))
                          }
                          placeholder="Assign rescue unit"
                          className="min-h-[38px] px-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
                        />
                        <input
                          type="number"
                          min={0}
                          value={exposedInput[inc.id] ?? String(inc.exposedPopulation ?? 0)}
                          onChange={(e) =>
                            setExposedInput((p) => ({ ...p, [inc.id]: e.target.value }))
                          }
                          placeholder="Exposed population"
                          className="min-h-[38px] px-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
                        />
                        <input
                          type="number"
                          min={0}
                          value={casualtyInput[inc.id] ?? String(inc.casualtiesCount ?? 0)}
                          onChange={(e) =>
                            setCasualtyInput((p) => ({ ...p, [inc.id]: e.target.value }))
                          }
                          placeholder="Casualties logged"
                          className="min-h-[38px] px-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const m = Number(missingInput[inc.id] || 0);
                            const inj = Number(injuredInput[inc.id] || 0);
                            const tr = Number(trappedInput[inc.id] || 0);
                            const extraTag =
                              m || inj || tr
                                ? ` [Human Impact: Missing=${m}, Injured=${inj}, Trapped=${tr}]`
                                : '';
                            void onUpdateAdminIncident(inc.id, {
                              assignedUnit: assignInput[inc.id] ?? inc.assignedUnit,
                              exposedPopulation: Number(
                                exposedInput[inc.id] ?? inc.exposedPopulation ?? 0
                              ),
                              casualtiesCount: Number(
                                casualtyInput[inc.id] ?? inc.casualtiesCount ?? 0
                              ),
                              notes: extraTag
                                ? `${inc.notes.replace(/\s*\[Human Impact:[^\]]+\]/g, '')}${extraTag}`.slice(0, 480)
                                : undefined,
                            });
                          }}
                          className="min-h-[38px] px-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium"
                        >
                          Save Impact &amp; Unit
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <input
                          type="number"
                          min={0}
                          value={missingInput[inc.id] ?? ''}
                          onChange={(e) =>
                            setMissingInput((p) => ({ ...p, [inc.id]: e.target.value }))
                          }
                          placeholder="Missing persons"
                          className="min-h-[34px] px-2.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-200"
                        />
                        <input
                          type="number"
                          min={0}
                          value={injuredInput[inc.id] ?? ''}
                          onChange={(e) =>
                            setInjuredInput((p) => ({ ...p, [inc.id]: e.target.value }))
                          }
                          placeholder="Injured count"
                          className="min-h-[34px] px-2.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-200"
                        />
                        <input
                          type="number"
                          min={0}
                          value={trappedInput[inc.id] ?? ''}
                          onChange={(e) =>
                            setTrappedInput((p) => ({ ...p, [inc.id]: e.target.value }))
                          }
                          placeholder="Trapped count"
                          className="min-h-[34px] px-2.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-200"
                        />
                      </div>
                    </div>
                  )}

                  {/* Structured Patient Assessment & AI Triage Support (Decision Support Only) */}
                  <div className="p-3 rounded-lg border border-amber-500/25 bg-slate-900 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-amber-300 inline-flex items-center gap-1.5">
                        <AlertOctagon className="w-3.5 h-3.5" aria-hidden="true" />
                        Patient Assessment &amp; Triage Support (Decision Support — Not a Medical Diagnosis)
                      </span>
                      <button
                        type="button"
                        onClick={() => void runResponseAi(inc, 'triage')}
                        disabled={aiLoading === `${inc.id}:triage`}
                        className="min-h-[32px] px-3 py-1 rounded-lg border border-amber-500/40 bg-amber-600/15 text-amber-300 hover:bg-amber-600/25 inline-flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {aiLoading === `${inc.id}:triage`
                            ? 'Evaluating Triage...'
                            : 'Run AI Patient Triage'}
                        </span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <select
                        value={patientFlags[inc.id]?.conscious || 'Conscious'}
                        onChange={(e) =>
                          setPatientFlags((p) => ({
                            ...p,
                            [inc.id]: {
                              conscious: e.target.value,
                              breathing: p[inc.id]?.breathing || 'Normal',
                              bleeding: p[inc.id]?.bleeding || 'None',
                              symptoms: p[inc.id]?.symptoms || '',
                            },
                          }))
                        }
                        aria-label="Patient consciousness"
                        className="min-h-[34px] px-2 rounded border border-slate-700 bg-slate-950 text-slate-200"
                      >
                        <option value="Conscious">Conscious / Alert</option>
                        <option value="Unconscious">Unconscious / Unresponsive</option>
                      </select>
                      <select
                        value={patientFlags[inc.id]?.breathing || 'Normal'}
                        onChange={(e) =>
                          setPatientFlags((p) => ({
                            ...p,
                            [inc.id]: {
                              conscious: p[inc.id]?.conscious || 'Conscious',
                              breathing: e.target.value,
                              bleeding: p[inc.id]?.bleeding || 'None',
                              symptoms: p[inc.id]?.symptoms || '',
                            },
                          }))
                        }
                        aria-label="Patient breathing status"
                        className="min-h-[34px] px-2 rounded border border-slate-700 bg-slate-950 text-slate-200"
                      >
                        <option value="Normal">Breathing: Normal</option>
                        <option value="Labored">Breathing: Labored</option>
                        <option value="Absent">Breathing: Absent / Obstructed</option>
                      </select>
                      <select
                        value={patientFlags[inc.id]?.bleeding || 'None'}
                        onChange={(e) =>
                          setPatientFlags((p) => ({
                            ...p,
                            [inc.id]: {
                              conscious: p[inc.id]?.conscious || 'Conscious',
                              breathing: p[inc.id]?.breathing || 'Normal',
                              bleeding: e.target.value,
                              symptoms: p[inc.id]?.symptoms || '',
                            },
                          }))
                        }
                        aria-label="Patient bleeding status"
                        className="min-h-[34px] px-2 rounded border border-slate-700 bg-slate-950 text-slate-200"
                      >
                        <option value="None">Bleeding: None</option>
                        <option value="Moderate">Bleeding: Moderate</option>
                        <option value="Severe">Bleeding: Severe</option>
                      </select>
                      <input
                        type="text"
                        value={patientFlags[inc.id]?.symptoms || ''}
                        onChange={(e) =>
                          setPatientFlags((p) => ({
                            ...p,
                            [inc.id]: {
                              conscious: p[inc.id]?.conscious || 'Conscious',
                              breathing: p[inc.id]?.breathing || 'Normal',
                              bleeding: p[inc.id]?.bleeding || 'None',
                              symptoms: e.target.value,
                            },
                          }))
                        }
                        placeholder="Observed trauma / symptoms..."
                        className="min-h-[34px] px-2.5 rounded border border-slate-700 bg-slate-950 text-slate-100"
                      />
                    </div>
                  </div>

                  {/* Rescue Milestone Stepper & Patient Transfer Update */}
                  {(isRescue || isAdmin) && onUpdateRescueIncident && (
                    <div className="space-y-2.5 pt-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-mono text-slate-400 mr-1">
                          Rescue Step:
                        </span>
                        {RESCUE_MILESTONES.map((step) => {
                          const current =
                            milestones[inc.id] ||
                            (inc.status === 'Resolved'
                              ? 'Completed'
                              : inc.status === 'In Progress'
                              ? 'In Progress'
                              : 'Dispatched');
                          const active = current === step;
                          const lockedForRescue = inc.status === 'Resolved' && !isAdmin;
                          return (
                            <button
                              key={step}
                              type="button"
                              disabled={lockedForRescue}
                              onClick={() => void handleMilestoneChange(inc, step)}
                              className={`min-h-[28px] px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors disabled:opacity-50 ${
                                active
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-100'
                              }`}
                            >
                              {step}
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select
                          value={inc.triagePriority || 'Yellow - Delayed'}
                          disabled={inc.status === 'Resolved' && !isAdmin}
                          onChange={(e) =>
                            void onUpdateRescueIncident(inc.id, {
                              triagePriority: e.target.value as IncidentTicket['triagePriority'],
                            })
                          }
                          aria-label="Patient triage priority"
                          className="min-h-[38px] px-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 disabled:opacity-50"
                        >
                          <option value="Red - Immediate">Red - Immediate</option>
                          <option value="Yellow - Delayed">Yellow - Delayed</option>
                          <option value="Green - Minor">Green - Minor</option>
                        </select>
                        <input
                          type="text"
                          disabled={inc.status === 'Resolved' && !isAdmin}
                          value={transferInput[inc.id] ?? inc.patientTransferNote ?? ''}
                          onChange={(e) =>
                            setTransferInput((p) => ({ ...p, [inc.id]: e.target.value }))
                          }
                          placeholder="Patient transfer / hospital destination note"
                          className="min-h-[38px] px-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={inc.status === 'Resolved' && !isAdmin}
                          onClick={() =>
                            void onUpdateRescueIncident(inc.id, {
                              patientTransferNote:
                                transferInput[inc.id] ||
                                'Patient stabilized and transferred to regional trauma center.',
                              status: 'Resolved',
                            })
                          }
                          className="min-h-[38px] px-3 rounded-lg border border-emerald-500/40 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 font-medium disabled:opacity-50"
                        >
                          {inc.status === 'Resolved' && !isAdmin ? 'Operation Completed' : 'Log Transfer & Complete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
          })
        )}
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  Ambulance,
  Building2,
  MapPin,
  Package,
  Phone,
  Plus,
  Tent,
} from 'lucide-react';
import {
  AlertNotification,
  DisasterForecast,
  IncidentTicket,
  ModuleId,
  ReliefResource,
  UserRole,
} from '../../types/modules';
import { GoogleMapsPanel } from '../GoogleMapsPanel';
import { plainReliefKind, plainReliefStatus } from '../../utils/plainLabels';

interface ReliefModuleProps {
  resources: ReliefResource[];
  forecasts?: DisasterForecast[];
  incidents?: IncidentTicket[];
  alerts?: AlertNotification[];
  userRole?: UserRole;
  onOpenModule?: (id: ModuleId) => void;
  onUpdateResource: (
    id: string,
    updates: {
      status: ReliefResource['status'];
      quantity: number;
      allocatedTo: string;
    }
  ) => Promise<void>;
  onCreateResource?: (resource: ReliefResource) => Promise<void>;
}

const EMERGENCY_CONTACTS = [
  { label: 'National Emergency Number', number: '112 / 911', scope: 'All Areas · Open 24 Hours' },
  { label: 'Sendai Coast & Flood Help', number: '+81-22-555-0199', scope: 'Sendai Coast Area' },
  { label: 'Luzon Emergency Relief Desk', number: '+63-2-555-0144', scope: 'Luzon Area' },
  { label: 'Scam & Cyber Safety Helpline', number: '+1-800-555-0177', scope: 'Report Fake Links & Online Scams' },
];

export const ReliefModule: React.FC<ReliefModuleProps> = ({
  resources,
  forecasts = [],
  incidents = [],
  alerts = [],
  userRole = 'citizen',
  onOpenModule,
  onUpdateResource,
  onCreateResource,
}) => {
  const isAdmin = userRole === 'administrator';
  const isRescue = userRole === 'rescue';
  const canManageOps = isAdmin || isRescue;

  const [kindFilter, setKindFilter] = useState<'All' | ReliefResource['kind']>('All');
  const [regionQuery, setRegionQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showGoogleMaps, setShowGoogleMaps] = useState(false);

  const [newKind, setNewKind] = useState<ReliefResource['kind']>('Supply');
  const [newName, setNewName] = useState('');
  const [newRegion, setNewRegion] = useState('');
  const [newQty, setNewQty] = useState('100');
  const [newUnit, setNewUnit] = useState('packs');
  const [newContact, setNewContact] = useState('');
  const [newAlloc, setNewAlloc] = useState('');

  const [qtyEdits, setQtyEdits] = useState<Record<string, string>>({});
  const [allocEdits, setAllocEdits] = useState<Record<string, string>>({});
  const [distEdits, setDistEdits] = useState<Record<string, string>>({});
  const [distributedTotals, setDistributedTotals] = useState<Record<string, number>>({});

  const visibleResources = useMemo(() => {
    return resources.filter((r) => {
      if (!canManageOps && (r.kind === 'Supply' || r.kind === 'Vehicle')) return false;
      if (kindFilter !== 'All' && r.kind !== kindFilter) return false;
      if (
        regionQuery.trim() &&
        !`${r.name} ${r.region}`.toLowerCase().includes(regionQuery.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [resources, canManageOps, kindFilter, regionQuery]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateResource || !newName.trim() || !newRegion.trim()) return;
    await onCreateResource({
      id: `RES-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`,
      kind: newKind,
      name: newName.trim(),
      region: newRegion.trim(),
      status: 'Available',
      quantity: Math.max(0, Number(newQty) || 0),
      unit: newUnit.trim() || 'units',
      contact: newContact.trim() || 'Dispatch Desk',
      allocatedTo: newAlloc.trim() || 'Regional Standby',
    });
    setNewName('');
    setNewRegion('');
    setShowAdd(false);
  };

  const kindIcon = (kind: ReliefResource['kind']) => {
    if (kind === 'Hospital') return Building2;
    if (kind === 'Shelter') return Tent;
    if (kind === 'Vehicle') return Ambulance;
    return Package;
  };

  return (
    <div className="space-y-5">
      {/* Top Locator & Operations Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          {(['All', 'Hospital', 'Shelter', 'Supply', 'Vehicle'] as const)
            .filter((k) => canManageOps || k === 'All' || k === 'Hospital' || k === 'Shelter')
            .map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  kindFilter === k
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {k === 'All'
                  ? 'All'
                  : k === 'Hospital'
                  ? 'Hospitals'
                  : k === 'Shelter'
                  ? 'Shelters'
                  : k === 'Supply'
                  ? 'Food & Meds'
                  : 'Ambulances'}
              </button>
            ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={regionQuery}
            onChange={(e) => setRegionQuery(e.target.value)}
            placeholder="Filter by city or facility..."
            className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-800 bg-slate-900 text-slate-100 placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={() => setShowGoogleMaps((v) => !v)}
            className={`min-h-[40px] px-3 py-2 text-xs font-medium rounded-lg border inline-flex items-center gap-1.5 transition-colors ${
              showGoogleMaps
                ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                : 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
            <span>{showGoogleMaps ? 'Hide Google Maps' : 'Google Maps'}</span>
          </button>
          {isAdmin && onCreateResource && (
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Allocate Resource</span>
            </button>
          )}
        </div>
      </div>

      {showGoogleMaps && (
        <GoogleMapsPanel
          forecasts={forecasts}
          incidents={incidents}
          alerts={alerts}
          resources={resources}
          onSelectModule={onOpenModule}
        />
      )}

      {/* Admin Resource Allocation Form */}
      {isAdmin && showAdd && (
        <form
          onSubmit={handleAdd}
          className="p-4 rounded-xl border border-slate-800 bg-slate-900 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-100">
              Allocate Rescue Vehicle, Shelter, or Relief Supply Stock
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {[
                { label: '+ Clothing', kind: 'Supply' as const, name: 'Thermal Clothing Packs', unit: 'sets' },
                { label: '+ Emergency Kits', kind: 'Supply' as const, name: 'Trauma & Hygiene Kits', unit: 'kits' },
                { label: '+ Rescue Boat', kind: 'Vehicle' as const, name: 'Flood Rescue Boat Unit', unit: 'boats' },
                { label: '+ Fire Engine', kind: 'Vehicle' as const, name: 'Heavy Fire Engine', unit: 'engines' },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setNewKind(preset.kind);
                    setNewName(preset.name);
                    setNewUnit(preset.unit);
                  }}
                  className="px-2 py-0.5 rounded border border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:border-blue-500/60"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as ReliefResource['kind'])}
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
            >
              <option value="Supply">Food, Water &amp; Medicine</option>
              <option value="Vehicle">Ambulance / Rescue Vehicle</option>
              <option value="Hospital">Hospital / Medical Facility</option>
              <option value="Shelter">Emergency Shelter</option>
            </select>
            <input
              type="text"
              required
              minLength={2}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Facility, stock, or vehicle unit name"
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
            />
            <input
              type="text"
              required
              minLength={2}
              value={newRegion}
              onChange={(e) => setNewRegion(e.target.value)}
              placeholder="Region"
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="number"
              min={0}
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              placeholder="Quantity"
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
            />
            <input
              type="text"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              placeholder="Unit (beds, packs, vehicles)"
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
            />
            <input
              type="text"
              value={newContact}
              onChange={(e) => setNewContact(e.target.value)}
              placeholder="Contact / radio ch"
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
            />
            <input
              type="text"
              value={newAlloc}
              onChange={(e) => setNewAlloc(e.target.value)}
              placeholder="Allocated zone / incident"
              className="min-h-[40px] px-3 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="min-h-[40px] px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Confirm Allocation
            </button>
          </div>
        </form>
      )}

      {/* Main Grid: Locator & Inventory + Emergency Contact Directory */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 border border-slate-800 rounded-xl bg-slate-900 divide-y divide-slate-800 overflow-hidden">
          {visibleResources.length === 0 ? (
            <div className="p-6 text-center space-y-2.5">
              <p className="text-xs text-slate-400">
                No hospitals, shelters, or supplies match your search.
              </p>
              <button
                type="button"
                onClick={() => {
                  setKindFilter('All');
                  setRegionQuery('');
                }}
                className="min-h-[34px] px-3 py-1 text-xs font-medium rounded-lg border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
              >
                Show All Places
              </button>
            </div>
          ) : (
            visibleResources.map((res) => {
            const Icon = kindIcon(res.kind);
            return (
              <div key={res.id} className="p-4 space-y-3 hover:bg-slate-900/40 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <Icon className="w-3.5 h-3.5 text-blue-400 shrink-0" aria-hidden="true" />
                      <span className="font-mono text-slate-300">{res.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{plainReliefKind(res.kind)}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-semibold ${
                          res.status === 'Available'
                            ? 'text-emerald-400'
                            : res.status === 'Limited'
                            ? 'text-amber-400'
                            : res.status === 'Deployed'
                            ? 'text-sky-400'
                            : 'text-red-400'
                        }`}
                      >
                        {plainReliefStatus(res.status)}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-100">{res.name}</h3>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400">
                      <span>{res.region}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-200 tabular-nums">
                        Ready: {res.quantity.toLocaleString()} {res.unit}
                      </span>
                      {(distributedTotals[res.id] || 0) > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-cyan-400 tabular-nums">
                            Distributed: {distributedTotals[res.id].toLocaleString()} {res.unit}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>Contact: {res.contact}</span>
                      <span aria-hidden="true">·</span>
                      <span>Assigned: {res.allocatedTo}</span>
                    </div>
                  </div>
                </div>

                {/* Rescue & Admin Live Availability / Distribution Controls */}
                {canManageOps && (
                  <div className="space-y-2 pt-1 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <select
                        value={res.status}
                        onChange={(e) => {
                          const rawQty = qtyEdits[res.id];
                          const parsedQty =
                            rawQty !== undefined && rawQty !== '' && Number.isFinite(Number(rawQty))
                              ? Math.max(0, Number(rawQty))
                              : res.quantity;
                          void onUpdateResource(res.id, {
                            status: e.target.value as ReliefResource['status'],
                            quantity: parsedQty,
                            allocatedTo: allocEdits[res.id] ?? res.allocatedTo,
                          });
                        }}
                        aria-label={`Status for ${res.name}`}
                        className="min-h-[36px] px-2.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-200"
                      >
                        <option value="Available">Available</option>
                        <option value="Limited">Limited</option>
                        <option value="Deployed">Deployed</option>
                        <option value="Full">Full</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        value={qtyEdits[res.id] ?? String(res.quantity)}
                        onChange={(e) =>
                          setQtyEdits((p) => ({ ...p, [res.id]: e.target.value }))
                        }
                        aria-label={`Quantity for ${res.name}`}
                        className="min-h-[36px] px-2.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
                      />
                      <input
                        type="text"
                        value={allocEdits[res.id] ?? res.allocatedTo}
                        onChange={(e) =>
                          setAllocEdits((p) => ({ ...p, [res.id]: e.target.value }))
                        }
                        aria-label={`Allocation for ${res.name}`}
                        className="min-h-[36px] px-2.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const rawQty = qtyEdits[res.id];
                          const parsedQty =
                            rawQty !== undefined && rawQty !== '' && Number.isFinite(Number(rawQty))
                              ? Math.max(0, Number(rawQty))
                              : res.quantity;
                          void onUpdateResource(res.id, {
                            status: res.status,
                            quantity: parsedQty,
                            allocatedTo: allocEdits[res.id] ?? res.allocatedTo,
                          });
                        }}
                        className="min-h-[36px] px-3 rounded-lg border border-slate-700 text-slate-100 hover:bg-slate-800 font-medium"
                      >
                        Update Availability
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={res.quantity}
                        value={distEdits[res.id] ?? ''}
                        onChange={(e) =>
                          setDistEdits((p) => ({ ...p, [res.id]: e.target.value }))
                        }
                        placeholder={`Log distributed ${res.unit}...`}
                        className="w-44 min-h-[32px] px-2.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-100 text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const delta = Math.min(
                            res.quantity,
                            Math.max(1, Number(distEdits[res.id] || 10))
                          );
                          const nextQty = Math.max(0, res.quantity - delta);
                          setDistributedTotals((p) => ({ ...p, [res.id]: (p[res.id] || 0) + delta }));
                          setQtyEdits((p) => ({ ...p, [res.id]: String(nextQty) }));
                          setDistEdits((p) => ({ ...p, [res.id]: '' }));
                          void onUpdateResource(res.id, {
                            status: nextQty === 0 ? 'Deployed' : res.status,
                            quantity: nextQty,
                            allocatedTo: allocEdits[res.id] ?? res.allocatedTo,
                          });
                        }}
                        className="min-h-[32px] px-3 rounded-lg border border-cyan-500/40 bg-cyan-600/15 text-cyan-300 hover:bg-cyan-600/25 text-[11px] font-medium"
                      >
                        Log Relief Distribution
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
            })
          )}
        </div>

        {/* Emergency Contact Directory (User, Rescue, Admin) */}
        <div className="lg:col-span-4 border border-slate-800 rounded-xl bg-slate-900 overflow-hidden h-fit">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2 text-xs font-semibold text-slate-100">
            <Phone className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            <span>Emergency Contact Directory</span>
          </div>
          <div className="divide-y divide-slate-800">
            {EMERGENCY_CONTACTS.map((c) => (
              <div key={c.label} className="px-4 py-3 space-y-1 text-xs">
                <div className="font-medium text-slate-100">{c.label}</div>
                <div className="font-mono text-blue-400 tabular-nums">{c.number}</div>
                <div className="text-[11px] text-slate-400">{c.scope}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

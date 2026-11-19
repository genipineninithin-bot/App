export type ModuleId =
  | 'command'
  | 'disaster'
  | 'satellite'
  | 'cyber'
  | 'assistant'
  | 'response'
  | 'relief'
  | 'analytics'
  | 'alerts'
  | 'admin';

export type UserRole = 'citizen' | 'rescue' | 'administrator';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  accountStatus?: 'Active' | 'Pending' | 'Suspended';
  notifyEmail?: boolean;
  notifySms?: boolean;
}

export type Severity = 'Critical' | 'High' | 'Moderate' | 'Low';

export interface DisasterForecast {
  id: string;
  title: string;
  category: 'Seismic' | 'Cyclone' | 'Wildfire' | 'Flood' | 'Grid Stress';
  severity: Severity;
  region: string;
  horizon: '6h' | '24h' | '72h';
  confidencePct: number;
  metric: string;
  gridExposureMw: number;
  populationAtRisk: string;
  status: 'Monitoring' | 'Warning' | 'Escalated';
  summary: string;
  lat?: number;
  lng?: number;
  sourceName?: string;
  sourceUrl?: string;
  affectedRadiusKm?: number;
  safeZoneRadiusKm?: number;
}

export interface LiveDisasterIncident {
  id: string;
  title: string;
  category: 'Seismic' | 'Cyclone' | 'Wildfire' | 'Flood' | 'Grid Stress';
  severity: Severity;
  region: string;
  lat: number;
  lng: number;
  metric: string;
  populationAtRisk: string;
  summary: string;
  timeLabel: string;
  sourceName: 'CurrentDisaster.com' | 'GDACS (UN/EU)' | 'NASA EONET' | 'USGS Seismic';
  sourceUrl: string;
  affectedRadiusKm?: number;
  safeZoneRadiusKm?: number;
}

export interface CyberThreat {
  id: string;
  title: string;
  vector: 'OT / SCADA' | 'Ransomware' | 'Volumetric DDoS' | 'Zero-Day' | 'Phishing';
  severity: Severity;
  platform: 'Windows Server' | 'Windows 11' | 'Android Field' | 'iOS Responder' | 'OT / SCADA';
  mitreId: string;
  ioc: string;
  affectedHosts: number;
  status: 'Active' | 'Mitigating' | 'Contained';
  linkedDisasterId?: string;
  summary: string;
}

export interface IncidentTicket {
  id: string;
  title: string;
  domain: 'Disaster' | 'Cyber' | 'Hybrid Nexus';
  severity: Severity;
  region: string;
  assignedUnit: string;
  platformSupport: 'Windows & Mobile' | 'Windows Desktop' | 'Mobile Field';
  status: 'Dispatched' | 'In Progress' | 'Contained' | 'Resolved';
  updatedAt: string;
  notes: string;
  locationCoords?: string;
  imageSummary?: string;
  verifiedByAdmin?: boolean;
  casualtiesCount?: number;
  exposedPopulation?: number;
  triagePriority?: 'Red - Immediate' | 'Yellow - Delayed' | 'Green - Minor';
  patientTransferNote?: string;
  damageAssessment?: string;
}

export interface AnalyticsPoint {
  hour: string;
  disasterSignals: number;
  cyberAlerts: number;
  mitigated: number;
}

export interface ReliefResource {
  id: string;
  kind: 'Hospital' | 'Shelter' | 'Supply' | 'Vehicle';
  name: string;
  region: string;
  status: 'Available' | 'Limited' | 'Deployed' | 'Full';
  quantity: number;
  unit: string;
  contact: string;
  allocatedTo: string;
}

export interface AlertNotification {
  id: string;
  title: string;
  category: 'Emergency' | 'Disaster' | 'Cybersecurity' | 'Rescue Op';
  severity: Severity;
  channel: 'All' | 'Email & SMS' | 'Rescue Dispatch';
  message: string;
  region: string;
  status: 'Draft' | 'Verified' | 'Published';
  visibility: 'public' | 'rescue_only' | 'admin_only';
  createdAtLabel: string;
}

export interface AiKnowledgeEntry {
  id: string;
  topic: string;
  category: 'Disaster' | 'First Aid' | 'Cybersecurity' | 'Checklist';
  guidance: string;
  language: string;
}

export interface SystemConfigState {
  id: string;
  aiModel: string;
  usgsFeedEnabled: boolean;
  autoEscalationThreshold: 'Critical' | 'High';
  smsGatewayEnabled: boolean;
  emailGatewayEnabled: boolean;
  auditRetentionDays: number;
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorEmail: string;
  actorRole: UserRole;
  action: string;
  target: string;
  detail: string;
  timestampLabel: string;
}

import {
  AlertNotification,
  IncidentTicket,
  ReliefResource,
  Severity,
} from '../types/modules';

export function plainSeverity(sev: Severity | string): string {
  switch (sev) {
    case 'Critical':
      return 'Danger Now';
    case 'High':
      return 'High Risk';
    case 'Moderate':
      return 'Watch (Medium)';
    case 'Low':
      return 'Low Risk';
    default:
      return sev;
  }
}

export function plainAlertStatus(status: AlertNotification['status']): string {
  switch (status) {
    case 'Published':
      return 'Live Alert';
    case 'Verified':
      return 'Ready to Send';
    case 'Draft':
      return 'Draft (Not Sent)';
    default:
      return status;
  }
}

export function plainAlertVisibility(visibility: AlertNotification['visibility']): string {
  switch (visibility) {
    case 'public':
      return 'Everyone Can See';
    case 'rescue_only':
      return 'Rescue Teams Only';
    case 'admin_only':
      return 'Admin Review Only';
    default:
      return visibility;
  }
}

export function plainAlertCategory(category: AlertNotification['category']): string {
  switch (category) {
    case 'Emergency':
      return 'Emergency';
    case 'Disaster':
      return 'Disaster Warning';
    case 'Cybersecurity':
      return 'Scam & Online Safety';
    case 'Rescue Op':
      return 'Rescue Team Order';
    default:
      return category;
  }
}

export function plainDisasterCategory(category: string): string {
  switch (category) {
    case 'Seismic':
      return 'Earthquake';
    case 'Cyclone':
      return 'Storm / Cyclone';
    case 'Wildfire':
      return 'Wildfire';
    case 'Flood':
      return 'Flood';
    case 'Grid Stress':
      return 'Power Grid Issue';
    default:
      return category;
  }
}

export function plainIncidentDomain(domain: IncidentTicket['domain']): string {
  switch (domain) {
    case 'Disaster':
      return 'Disaster';
    case 'Hybrid Nexus':
      return 'Disaster & Power/Tech';
    case 'Cyber':
      return 'Online / Cyber Issue';
    default:
      return domain;
  }
}

export function plainIncidentStatus(status: IncidentTicket['status']): string {
  switch (status) {
    case 'Dispatched':
      return 'Team Sent';
    case 'In Progress':
      return 'Rescue Ongoing';
    case 'Contained':
      return 'Under Control';
    case 'Resolved':
      return 'Completed';
    default:
      return status;
  }
}

export function plainThreatVector(vector: string): string {
  switch (vector) {
    case 'OT / SCADA':
      return 'Power & Water Controls';
    case 'Ransomware':
      return 'File-Locking Virus';
    case 'Volumetric DDoS':
      return 'Website Overload Attack';
    case 'Zero-Day':
      return 'New Phone / App Flaw';
    case 'Phishing':
      return 'Fake Scam Links & Emails';
    default:
      return vector;
  }
}

export function plainThreatStatus(status: string): string {
  switch (status) {
    case 'Active':
      return 'Needs Action';
    case 'Mitigating':
      return 'Being Fixed';
    case 'Contained':
      return 'Blocked & Safe';
    default:
      return status;
  }
}

export function plainReliefKind(kind: ReliefResource['kind']): string {
  switch (kind) {
    case 'Hospital':
      return 'Hospital';
    case 'Shelter':
      return 'Safe Shelter';
    case 'Supply':
      return 'Food, Water & First Aid';
    case 'Vehicle':
      return 'Ambulance / Rescue Vehicle';
    default:
      return kind;
  }
}

export function plainReliefStatus(status: ReliefResource['status']): string {
  switch (status) {
    case 'Available':
      return 'Open & Ready';
    case 'Limited':
      return 'Running Low';
    case 'Deployed':
      return 'Out on Duty';
    case 'Full':
      return 'Full';
    default:
      return status;
  }
}

export function plainMarkerKind(kind: 'disaster' | 'incident' | 'alert' | 'cyber' | 'relief'): string {
  switch (kind) {
    case 'alert':
      return 'Safety Alert';
    case 'disaster':
      return 'Disaster Warning';
    case 'incident':
      return 'Emergency Report';
    case 'relief':
      return 'Hospital / Shelter';
    case 'cyber':
      return 'Cyber Warning';
  }
}

export function formatUrlBreakdownItem(key: string, value: string | boolean | number): {
  label: string;
  display: string;
  warn?: boolean;
} {
  switch (key) {
    case 'protocol':
      return {
        label: 'Connection Type',
        display: String(value).toUpperCase(),
        warn: String(value).toLowerCase() !== 'https',
      };
    case 'host':
      return { label: 'Website Address', display: String(value) };
    case 'isHttps':
      return {
        label: 'Secure Lock (HTTPS)',
        display: value ? 'Yes (Encrypted)' : 'No (Not Encrypted)',
        warn: !value,
      };
    case 'hasIpHost':
      return {
        label: 'Uses Raw IP Number',
        display: value ? 'Yes (Suspicious)' : 'No',
        warn: Boolean(value),
      };
    case 'subdomainCount':
      return {
        label: 'Extra Name Parts',
        display: String(value),
        warn: Number(value) >= 2,
      };
    case 'queryParams':
      return { label: 'Extra Link Codes', display: String(value) };
    case 'malformedUrl':
      return {
        label: 'Link Format',
        display: value ? 'Broken or Unclear Link' : 'Valid Format',
        warn: Boolean(value),
      };
    case 'rawLength':
      return { label: 'Text Length', display: `${value} chars` };
    default:
      return { label: key, display: String(value) };
  }
}

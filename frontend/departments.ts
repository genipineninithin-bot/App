import type { IncidentTicket } from '../src/types/modules';

export const EMERGENCY_DEPARTMENTS = [
  'Fire & Rescue Department',
  'Medical & Ambulance (EMS)',
  'Police & Traffic Control',
  'Disaster Management Force (NDRF/FEMA)',
  'Flood & Water Rescue Dept',
  'Electricity & Power Grid Dept',
  'Cybercrime Response Unit',
  'Municipal Public Works',
] as const;

export type EmergencyDepartment = (typeof EMERGENCY_DEPARTMENTS)[number];

export const PENDING_ADMIN_UNIT_LABEL = 'Pending Admin Approval';

export type ApprovalState = 'pending' | 'approved' | 'rejected';

export function getIncidentApprovalState(inc: IncidentTicket): ApprovalState {
  if (inc.notes.startsWith('[REJECTED]')) return 'rejected';
  if (inc.verifiedByAdmin) return 'approved';
  return 'pending';
}

export function suggestDepartmentForIncident(inc: IncidentTicket): EmergencyDepartment {
  const text = `${inc.title} ${inc.notes} ${inc.domain}`.toLowerCase();
  if (inc.domain === 'Cyber' || /cyber|hack|ransom|scam|phish|ddos/.test(text)) {
    return 'Cybercrime Response Unit';
  }
  if (/fire|smoke|burn|explos|gas leak|wildfire/.test(text)) {
    return 'Fire & Rescue Department';
  }
  if (/flood|water|drown|river|tsunami|cyclone|storm|surge/.test(text)) {
    return 'Flood & Water Rescue Dept';
  }
  if (/injur|bleed|heart|hospital|ambulance|medical|unconscious|trapped/.test(text)) {
    return 'Medical & Ambulance (EMS)';
  }
  if (/power|electric|grid|wire|transformer|substation|outage/.test(text)) {
    return 'Electricity & Power Grid Dept';
  }
  if (/road|bridge|tree|collapse|debris/.test(text)) {
    return 'Municipal Public Works';
  }
  if (/traffic|crime|riot|missing|police/.test(text)) {
    return 'Police & Traffic Control';
  }
  return 'Disaster Management Force (NDRF/FEMA)';
}

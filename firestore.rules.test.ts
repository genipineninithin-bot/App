/**
 * Nexora ai — Firestore Security Rules Verification Suite (Phase 0: Dirty Dozen)
 *
 * Designed for execution against the Firebase Local Emulator Suite (@firebase/rules-unit-testing)
 * to assert that all 12 adversarial payloads return PERMISSION_DENIED.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: {
    uid: string;
    email: string;
    email_verified: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Privilege Escalation: Citizen self-assigns administrator role on create',
    collectionPath: 'users/citizen-1',
    operation: 'create',
    auth: { uid: 'citizen-1', email: 'citizen1@example.com', email_verified: true },
    payload: {
      uid: 'citizen-1',
      displayName: 'Mallory',
      email: 'citizen1@example.com',
      role: 'administrator',
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Role Tampering: Citizen updates own role to administrator',
    collectionPath: 'users/citizen-1',
    operation: 'update',
    auth: { uid: 'citizen-1', email: 'citizen1@example.com', email_verified: true },
    payload: {
      role: 'administrator',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'PII Leak: Citizen reads another user profile',
    collectionPath: 'users/citizen-2',
    operation: 'get',
    auth: { uid: 'citizen-1', email: 'citizen1@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Admin Registry Tamper: Citizen creates /admins/citizen-1',
    collectionPath: 'admins/citizen-1',
    operation: 'create',
    auth: { uid: 'citizen-1', email: 'citizen1@example.com', email_verified: true },
    payload: {
      uid: 'citizen-1',
      email: 'citizen1@example.com',
      grantedBy: 'citizen-1',
      createdAt: 'SERVER_TIMESTAMP',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Confidential Cyber Intel Read: Citizen queries /threats',
    collectionPath: 'threats',
    operation: 'list',
    auth: { uid: 'citizen-1', email: 'citizen1@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Shadow Field Injection: Extra ghost field isVerified on incident create',
    collectionPath: 'incidents/INC-991',
    operation: 'create',
    auth: { uid: 'citizen-1', email: 'citizen1@example.com', email_verified: true },
    payload: {
      id: 'INC-991',
      title: 'Coastal Substation Spark',
      domain: 'Disaster',
      severity: 'High',
      region: 'Bay Sector',
      assignedUnit: 'Citizen SOS Triage Desk',
      platformSupport: 'Mobile Field',
      status: 'Dispatched',
      notes: 'Observed transformer arcing near floodwall.',
      visibility: 'public',
      reporterId: 'citizen-1',
      isVerified: true,
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Identity Spoofing: Incident reporterId does not match request.auth.uid',
    collectionPath: 'incidents/INC-992',
    operation: 'create',
    auth: { uid: 'citizen-1', email: 'citizen1@example.com', email_verified: true },
    payload: {
      id: 'INC-992',
      title: 'Spoofed SOS Report',
      domain: 'Disaster',
      severity: 'High',
      region: 'Harbor',
      assignedUnit: 'Citizen SOS Triage Desk',
      platformSupport: 'Mobile Field',
      status: 'Dispatched',
      notes: 'Spoofed reporter identifier.',
      visibility: 'public',
      reporterId: 'victim-uid',
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'State Shortcutting: Citizen creates incident directly in Resolved status',
    collectionPath: 'incidents/INC-993',
    operation: 'create',
    auth: { uid: 'citizen-1', email: 'citizen1@example.com', email_verified: true },
    payload: {
      id: 'INC-993',
      title: 'Bypassed Dispatch Workflow',
      domain: 'Disaster',
      severity: 'Low',
      region: 'North Zone',
      assignedUnit: 'Citizen SOS Triage Desk',
      platformSupport: 'Mobile Field',
      status: 'Resolved',
      notes: 'Skipping workflow steps.',
      visibility: 'public',
      reporterId: 'citizen-1',
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Terminal State Lock: Citizen mutates Resolved incident',
    collectionPath: 'incidents/INC-899',
    operation: 'update',
    auth: { uid: 'citizen-1', email: 'citizen1@example.com', email_verified: true },
    payload: {
      notes: 'Reopening closed incident without admin role.',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Timestamp Forgery: Client-forged createdAt instead of server request.time',
    collectionPath: 'incidents/INC-994',
    operation: 'create',
    auth: { uid: 'citizen-1', email: 'citizen1@example.com', email_verified: true },
    payload: {
      id: 'INC-994',
      title: 'Backdated Dispatch',
      domain: 'Disaster',
      severity: 'Moderate',
      region: 'Delta Sector',
      assignedUnit: 'Citizen SOS Triage Desk',
      platformSupport: 'Mobile Field',
      status: 'Dispatched',
      notes: 'Forged timestamp test.',
      visibility: 'public',
      reporterId: 'citizen-1',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Path Poisoning & Value Exhaustion: Oversized ID (>128 chars)',
    collectionPath: `disasters/${'X'.repeat(160)}`,
    operation: 'create',
    auth: { uid: 'admin-1', email: 'genipineninithin@gmail.com', email_verified: true },
    payload: {
      id: 'X'.repeat(160),
      title: 'Poisoned Forecast ID',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unverified Email Spoof: Admin email claim with email_verified: false',
    collectionPath: 'threats/CYB-999',
    operation: 'create',
    auth: { uid: 'spoof-1', email: 'genipineninithin@gmail.com', email_verified: false },
    payload: {
      id: 'CYB-999',
      title: 'Unverified Admin Spoof',
      vector: 'Zero-Day',
      severity: 'Critical',
      platform: 'Windows Server',
      mitreId: 'T1000',
      ioc: '127.0.0.1',
      affectedHosts: 1,
      status: 'Active',
      summary: 'Attempted admin write with unverified email.',
      ownerId: 'spoof-1',
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expected: 'PERMISSION_DENIED',
  },
];

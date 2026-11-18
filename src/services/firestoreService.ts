import { User as FirebaseUser } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  BLUEPRINT_LIMITS,
  BOOTSTRAPPED_ADMIN_EMAIL,
  OperationType,
  clampStr,
  db,
  handleFirestoreError,
  sanitizeDocId,
} from '../firebase';
import {
  INITIAL_AI_KNOWLEDGE,
  INITIAL_ALERTS,
  INITIAL_DISASTERS,
  INITIAL_INCIDENTS,
  INITIAL_RELIEF_RESOURCES,
  INITIAL_SYSTEM_CONFIG,
  INITIAL_THREATS,
} from '../data/platformData';
import {
  AiKnowledgeEntry,
  AlertNotification,
  AuditLogEntry,
  AuthUser,
  CyberThreat,
  DisasterForecast,
  IncidentTicket,
  ReliefResource,
  SystemConfigState,
  UserRole,
} from '../types/modules';

function formatTimestamp(ts: unknown): string {
  if (ts instanceof Timestamp) {
    const diffMs = Date.now() - ts.toDate().getTime();
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return ts.toDate().toLocaleDateString();
  }
  return 'Just now';
}

export function isBootstrappedAdminEmail(
  email: string | null | undefined,
  verified: boolean
): boolean {
  return Boolean(verified && email && email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL);
}

export async function verifyAndSyncUserProfile(
  fbUser: FirebaseUser,
  requestedRole: UserRole | null
): Promise<{ authUser: AuthUser; isAuthorizedAdmin: boolean }> {
  const uid = sanitizeDocId(fbUser.uid, BLUEPRINT_LIMITS.uidMax);
  const email = clampStr(
    fbUser.email || 'user@nexora.ai',
    3,
    BLUEPRINT_LIMITS.emailMax,
    'user@nexora.ai'
  );
  const displayName = clampStr(
    fbUser.displayName || email.split('@')[0] || 'Nexora Operator',
    1,
    BLUEPRINT_LIMITS.displayNameMax,
    'Nexora Operator'
  );

  const isBootstrapped = isBootstrappedAdminEmail(fbUser.email, fbUser.emailVerified);

  let hasAdminGrant = false;
  const adminDocPath = `admins/${uid}`;
  try {
    const adminSnap = await getDoc(doc(db, 'admins', uid));
    hasAdminGrant = adminSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, adminDocPath);
  }

  if (isBootstrapped && !hasAdminGrant) {
    try {
      await setDoc(doc(db, 'admins', uid), {
        uid,
        email,
        grantedBy: uid,
        createdAt: serverTimestamp(),
      });
      hasAdminGrant = true;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, adminDocPath);
    }
  }

  const userDocPath = `users/${uid}`;
  let existingRole: UserRole | null = null;
  let profileExists = false;
  let accountStatus: AuthUser['accountStatus'] = 'Active';
  let notifyEmail = true;
  let notifySms = false;

  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      profileExists = true;
      const data = userSnap.data();
      if (
        data.role === 'administrator' ||
        data.role === 'rescue' ||
        data.role === 'citizen'
      ) {
        existingRole = data.role;
      }
      if (
        data.accountStatus === 'Active' ||
        data.accountStatus === 'Pending' ||
        data.accountStatus === 'Suspended'
      ) {
        accountStatus = data.accountStatus;
      }
      if (typeof data.notifyEmail === 'boolean') notifyEmail = data.notifyEmail;
      if (typeof data.notifySms === 'boolean') notifySms = data.notifySms;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userDocPath);
  }

  const isAuthorizedAdmin = isBootstrapped || hasAdminGrant || existingRole === 'administrator';

  if (requestedRole === 'administrator' && !isAuthorizedAdmin) {
    throw new Error(
      `Administrator clearance required. Signed in as ${email}, which does not hold Administrator privileges.`
    );
  }

  const effectiveRole: UserRole =
    requestedRole ?? (isAuthorizedAdmin ? 'administrator' : existingRole || 'citizen');

  if (!profileExists) {
    const createRole: UserRole = isAuthorizedAdmin
      ? 'administrator'
      : effectiveRole === 'rescue'
      ? 'rescue'
      : 'citizen';
    try {
      await setDoc(doc(db, 'users', uid), {
        uid,
        displayName,
        email,
        role: createRole,
        accountStatus: 'Active',
        notifyEmail: true,
        notifySms: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userDocPath);
    }
  } else {
    const canUpdateNonAdminRole =
      !isAuthorizedAdmin &&
      (existingRole === 'citizen' || existingRole === 'rescue') &&
      (effectiveRole === 'citizen' || effectiveRole === 'rescue') &&
      effectiveRole !== existingRole;

    try {
      await updateDoc(
        doc(db, 'users', uid),
        canUpdateNonAdminRole
          ? {
              displayName,
              role: effectiveRole,
              updatedAt: serverTimestamp(),
            }
          : {
              displayName,
              updatedAt: serverTimestamp(),
            }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userDocPath);
    }
  }

  return {
    authUser: {
      id: uid,
      name: displayName,
      email,
      role: effectiveRole,
      accountStatus,
      notifyEmail,
      notifySms,
    },
    isAuthorizedAdmin,
  };
}

export async function seedBaselineTelemetryIfEmpty(
  ownerUid: string,
  needs: {
    disasters: boolean;
    threats: boolean;
    incidents: boolean;
    relief: boolean;
    alerts: boolean;
    knowledge: boolean;
    systemConfig: boolean;
  }
): Promise<void> {
  const safeUid = sanitizeDocId(ownerUid, BLUEPRINT_LIMITS.uidMax);
  const batch = writeBatch(db);
  const pendingWrites: Array<{
    ref: ReturnType<typeof doc>;
    data: Record<string, unknown>;
  }> = [];

  if (needs.disasters) {
    for (const d of INITIAL_DISASTERS) {
      const id = sanitizeDocId(d.id, BLUEPRINT_LIMITS.idMax);
      pendingWrites.push({
        ref: doc(db, 'disasters', id),
        data: {
          id,
          title: clampStr(d.title, 3, BLUEPRINT_LIMITS.titleMax),
          category: d.category,
          severity: d.severity,
          region: clampStr(d.region, 2, BLUEPRINT_LIMITS.regionMax),
          horizon: d.horizon,
          confidencePct: Math.min(100, Math.max(0, Number(d.confidencePct) || 85)),
          metric: clampStr(d.metric, 1, BLUEPRINT_LIMITS.metricMax),
          gridExposureMw: Math.max(0, Number(d.gridExposureMw) || 0),
          populationAtRisk: clampStr(d.populationAtRisk, 1, BLUEPRINT_LIMITS.populationMax),
          status: d.status,
          summary: clampStr(d.summary, 5, BLUEPRINT_LIMITS.summaryMax),
          visibility: 'public',
          ownerId: safeUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    }
  }

  if (needs.threats) {
    for (const t of INITIAL_THREATS) {
      const id = sanitizeDocId(t.id, BLUEPRINT_LIMITS.idMax);
      const payload: Record<string, unknown> = {
        id,
        title: clampStr(t.title, 3, BLUEPRINT_LIMITS.titleMax),
        vector: t.vector,
        severity: t.severity,
        platform: t.platform,
        mitreId: clampStr(t.mitreId, 2, BLUEPRINT_LIMITS.mitreMax),
        ioc: clampStr(t.ioc, 2, BLUEPRINT_LIMITS.iocMax),
        affectedHosts: Math.max(0, Number(t.affectedHosts) || 0),
        status: t.status,
        summary: clampStr(t.summary, 5, BLUEPRINT_LIMITS.summaryMax),
        ownerId: safeUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (t.linkedDisasterId) {
        payload.linkedDisasterId = sanitizeDocId(t.linkedDisasterId, BLUEPRINT_LIMITS.idMax);
      }
      pendingWrites.push({
        ref: doc(db, 'threats', id),
        data: payload,
      });
    }
  }

  if (needs.incidents) {
    for (const inc of INITIAL_INCIDENTS) {
      const id = sanitizeDocId(inc.id, BLUEPRINT_LIMITS.idMax);
      const payload: Record<string, unknown> = {
        id,
        title: clampStr(inc.title, 3, BLUEPRINT_LIMITS.titleMax),
        domain: inc.domain,
        severity: inc.severity,
        region: clampStr(inc.region, 2, BLUEPRINT_LIMITS.regionMax),
        assignedUnit: clampStr(inc.assignedUnit, 2, BLUEPRINT_LIMITS.assignedUnitMax),
        platformSupport: inc.platformSupport,
        status: inc.status,
        notes: clampStr(inc.notes, 3, BLUEPRINT_LIMITS.notesMax),
        visibility: inc.domain === 'Cyber' ? 'admin_only' : 'public',
        reporterId: safeUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (typeof inc.verifiedByAdmin === 'boolean') payload.verifiedByAdmin = inc.verifiedByAdmin;
      if (typeof inc.casualtiesCount === 'number') payload.casualtiesCount = inc.casualtiesCount;
      if (typeof inc.exposedPopulation === 'number')
        payload.exposedPopulation = inc.exposedPopulation;
      if (inc.triagePriority) payload.triagePriority = inc.triagePriority;
      if (inc.damageAssessment)
        payload.damageAssessment = clampStr(inc.damageAssessment, 1, 400);
      pendingWrites.push({
        ref: doc(db, 'incidents', id),
        data: payload,
      });
    }
  }

  if (needs.relief) {
    for (const res of INITIAL_RELIEF_RESOURCES) {
      const id = sanitizeDocId(res.id, BLUEPRINT_LIMITS.idMax);
      pendingWrites.push({
        ref: doc(db, 'relief_resources', id),
        data: {
          id,
          kind: res.kind,
          name: clampStr(res.name, 2, 160),
          region: clampStr(res.region, 2, BLUEPRINT_LIMITS.regionMax),
          status: res.status,
          quantity: Math.max(0, Number(res.quantity) || 0),
          unit: clampStr(res.unit, 1, 60),
          contact: clampStr(res.contact, 2, 100),
          allocatedTo: clampStr(res.allocatedTo, 1, 140),
          visibility: 'public',
          updatedBy: safeUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    }
  }

  if (needs.alerts) {
    for (const al of INITIAL_ALERTS) {
      const id = sanitizeDocId(al.id, BLUEPRINT_LIMITS.idMax);
      pendingWrites.push({
        ref: doc(db, 'alerts', id),
        data: {
          id,
          title: clampStr(al.title, 3, 160),
          category: al.category,
          severity: al.severity,
          channel: al.channel,
          message: clampStr(al.message, 5, 400),
          region: clampStr(al.region, 2, BLUEPRINT_LIMITS.regionMax),
          status: al.status,
          visibility: al.visibility,
          authorId: safeUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    }
  }

  if (needs.knowledge) {
    for (const kb of INITIAL_AI_KNOWLEDGE) {
      const id = sanitizeDocId(kb.id, BLUEPRINT_LIMITS.idMax);
      pendingWrites.push({
        ref: doc(db, 'ai_knowledge', id),
        data: {
          id,
          topic: clampStr(kb.topic, 3, 160),
          category: kb.category,
          guidance: clampStr(kb.guidance, 5, 600),
          language: clampStr(kb.language, 2, 40),
          authorId: safeUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    }
  }

  if (needs.systemConfig) {
    pendingWrites.push({
      ref: doc(db, 'system_config', 'global'),
      data: {
        id: 'global',
        aiModel: clampStr(INITIAL_SYSTEM_CONFIG.aiModel, 3, 80),
        usgsFeedEnabled: INITIAL_SYSTEM_CONFIG.usgsFeedEnabled,
        autoEscalationThreshold: INITIAL_SYSTEM_CONFIG.autoEscalationThreshold,
        smsGatewayEnabled: INITIAL_SYSTEM_CONFIG.smsGatewayEnabled,
        emailGatewayEnabled: INITIAL_SYSTEM_CONFIG.emailGatewayEnabled,
        auditRetentionDays: INITIAL_SYSTEM_CONFIG.auditRetentionDays,
        updatedBy: safeUid,
        updatedAt: serverTimestamp(),
      },
    });
  }

  if (pendingWrites.length === 0) return;

  try {
    const existingSnaps = await Promise.all(pendingWrites.map((w) => getDoc(w.ref)));
    let opCount = 0;
    pendingWrites.forEach((w, idx) => {
      if (!existingSnaps[idx].exists()) {
        batch.set(w.ref, w.data);
        opCount++;
      }
    });
    if (opCount === 0) return;
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'telemetry-seed-batch');
  }
}

export function subscribePublicDisasters(
  onData: (forecasts: DisasterForecast[], isEmpty: boolean) => void
): () => void {
  const path = 'disasters';
  const q = query(collection(db, path), where('visibility', '==', 'public'));

  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        onData([], true);
        return;
      }
      const list: DisasterForecast[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          title: String(data.title || ''),
          category: data.category as DisasterForecast['category'],
          severity: data.severity as DisasterForecast['severity'],
          region: String(data.region || ''),
          horizon: data.horizon as DisasterForecast['horizon'],
          confidencePct: Number(data.confidencePct || 0),
          metric: String(data.metric || ''),
          gridExposureMw: Number(data.gridExposureMw || 0),
          populationAtRisk: String(data.populationAtRisk || ''),
          status: data.status as DisasterForecast['status'],
          summary: String(data.summary || ''),
        };
      });
      onData(list, false);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAdminThreats(
  onData: (threats: CyberThreat[], isEmpty: boolean) => void
): () => void {
  const path = 'threats';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      if (snapshot.empty) {
        onData([], true);
        return;
      }
      const list: CyberThreat[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          title: String(data.title || ''),
          vector: data.vector as CyberThreat['vector'],
          severity: data.severity as CyberThreat['severity'],
          platform: data.platform as CyberThreat['platform'],
          mitreId: String(data.mitreId || ''),
          ioc: String(data.ioc || ''),
          affectedHosts: Number(data.affectedHosts || 0),
          status: data.status as CyberThreat['status'],
          linkedDisasterId: data.linkedDisasterId ? String(data.linkedDisasterId) : undefined,
          summary: String(data.summary || ''),
        };
      });
      onData(list, false);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeIncidents(
  canListAll: boolean,
  onData: (incidents: IncidentTicket[], isEmpty: boolean) => void
): () => void {
  const path = 'incidents';
  const ref = canListAll
    ? collection(db, path)
    : query(collection(db, path), where('visibility', '==', 'public'));

  return onSnapshot(
    ref,
    (snapshot) => {
      if (snapshot.empty) {
        onData([], true);
        return;
      }
      const list: IncidentTicket[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const tsMs = data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : 0;
          return {
            tsMs,
            ticket: {
              id: String(data.id || d.id),
              title: String(data.title || ''),
              domain: data.domain as IncidentTicket['domain'],
              severity: data.severity as IncidentTicket['severity'],
              region: String(data.region || ''),
              assignedUnit: String(data.assignedUnit || ''),
              platformSupport: data.platformSupport as IncidentTicket['platformSupport'],
              status: data.status as IncidentTicket['status'],
              updatedAt: formatTimestamp(data.updatedAt),
              notes: String(data.notes || ''),
              locationCoords: data.locationCoords ? String(data.locationCoords) : undefined,
              imageSummary: data.imageSummary ? String(data.imageSummary) : undefined,
              verifiedByAdmin:
                typeof data.verifiedByAdmin === 'boolean' ? data.verifiedByAdmin : undefined,
              casualtiesCount:
                typeof data.casualtiesCount === 'number' ? data.casualtiesCount : undefined,
              exposedPopulation:
                typeof data.exposedPopulation === 'number' ? data.exposedPopulation : undefined,
              triagePriority: data.triagePriority
                ? (data.triagePriority as IncidentTicket['triagePriority'])
                : undefined,
              patientTransferNote: data.patientTransferNote
                ? String(data.patientTransferNote)
                : undefined,
              damageAssessment: data.damageAssessment ? String(data.damageAssessment) : undefined,
            },
          };
        })
        .sort((a, b) => b.tsMs - a.tsMs)
        .map((entry) => entry.ticket);
      onData(list, false);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeReliefResources(
  onData: (resources: ReliefResource[], isEmpty: boolean) => void
): () => void {
  const path = 'relief_resources';
  const q = query(collection(db, path), where('visibility', '==', 'public'));

  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        onData([], true);
        return;
      }
      const list: ReliefResource[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          kind: data.kind as ReliefResource['kind'],
          name: String(data.name || ''),
          region: String(data.region || ''),
          status: data.status as ReliefResource['status'],
          quantity: Number(data.quantity || 0),
          unit: String(data.unit || ''),
          contact: String(data.contact || ''),
          allocatedTo: String(data.allocatedTo || ''),
        };
      });
      onData(list, false);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAlerts(
  role: UserRole,
  isBootstrappedAdmin: boolean,
  onData: (alerts: AlertNotification[], isEmpty: boolean) => void
): () => void {
  const path = 'alerts';
  const ref =
    role === 'administrator' && isBootstrappedAdmin
      ? collection(db, path)
      : role === 'rescue'
      ? query(collection(db, path), where('visibility', 'in', ['public', 'rescue_only']))
      : query(collection(db, path), where('visibility', '==', 'public'));

  return onSnapshot(
    ref,
    (snapshot) => {
      if (snapshot.empty) {
        onData([], true);
        return;
      }
      const list: AlertNotification[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const tsMs = data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : 0;
          return {
            tsMs,
            alert: {
              id: String(data.id || d.id),
              title: String(data.title || ''),
              category: data.category as AlertNotification['category'],
              severity: data.severity as AlertNotification['severity'],
              channel: data.channel as AlertNotification['channel'],
              message: String(data.message || ''),
              region: String(data.region || ''),
              status: data.status as AlertNotification['status'],
              visibility: data.visibility as AlertNotification['visibility'],
              createdAtLabel: formatTimestamp(data.updatedAt),
            },
          };
        })
        .sort((a, b) => b.tsMs - a.tsMs)
        .map((x) => x.alert);
      onData(list, false);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAiKnowledge(
  onData: (entries: AiKnowledgeEntry[], isEmpty: boolean) => void
): () => void {
  const path = 'ai_knowledge';
  const q = query(
    collection(db, path),
    where('category', 'in', ['Disaster', 'First Aid', 'Cybersecurity', 'Checklist'])
  );
  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        onData([], true);
        return;
      }
      const list: AiKnowledgeEntry[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          topic: String(data.topic || ''),
          category: data.category as AiKnowledgeEntry['category'],
          guidance: String(data.guidance || ''),
          language: String(data.language || 'English'),
        };
      });
      onData(list, false);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeSystemConfig(
  onData: (cfg: SystemConfigState | null) => void
): () => void {
  const path = 'system_config/global';
  return onSnapshot(
    doc(db, 'system_config', 'global'),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data();
      onData({
        id: 'global',
        aiModel: String(data.aiModel || 'gemini-4-hydrogen'),
        usgsFeedEnabled: Boolean(data.usgsFeedEnabled ?? true),
        autoEscalationThreshold:
          data.autoEscalationThreshold === 'High' ? 'High' : 'Critical',
        smsGatewayEnabled: Boolean(data.smsGatewayEnabled ?? true),
        emailGatewayEnabled: Boolean(data.emailGatewayEnabled ?? true),
        auditRetentionDays: Number(data.auditRetentionDays || 90),
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeAdminUsers(
  onData: (users: AuthUser[]) => void
): () => void {
  const path = 'users';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: AuthUser[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.uid || d.id),
          name: String(data.displayName || 'Nexora User'),
          email: String(data.email || ''),
          role: (data.role as UserRole) || 'citizen',
          accountStatus:
            (data.accountStatus as AuthUser['accountStatus']) || 'Active',
          notifyEmail: Boolean(data.notifyEmail ?? true),
          notifySms: Boolean(data.notifySms ?? false),
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAuditLogs(
  onData: (logs: AuditLogEntry[]) => void
): () => void {
  const path = 'audit_logs';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: AuditLogEntry[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const tsMs = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0;
          return {
            tsMs,
            entry: {
              id: String(data.id || d.id),
              actorUid: String(data.actorUid || ''),
              actorEmail: String(data.actorEmail || ''),
              actorRole: (data.actorRole as UserRole) || 'citizen',
              action: String(data.action || ''),
              target: String(data.target || ''),
              detail: String(data.detail || ''),
              timestampLabel: formatTimestamp(data.createdAt),
            },
          };
        })
        .sort((a, b) => b.tsMs - a.tsMs)
        .map((x) => x.entry);
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveDisasterForecast(
  forecast: DisasterForecast,
  ownerUid: string
): Promise<void> {
  const id = sanitizeDocId(forecast.id, BLUEPRINT_LIMITS.idMax);
  const path = `disasters/${id}`;
  const ref = doc(db, 'disasters', id);
  const mutableFields = {
    title: clampStr(forecast.title, 3, BLUEPRINT_LIMITS.titleMax),
    category: forecast.category,
    severity: forecast.severity,
    region: clampStr(forecast.region, 2, BLUEPRINT_LIMITS.regionMax),
    horizon: forecast.horizon,
    confidencePct: Math.min(100, Math.max(0, Number(forecast.confidencePct) || 90)),
    metric: clampStr(forecast.metric, 1, BLUEPRINT_LIMITS.metricMax),
    gridExposureMw: Math.max(0, Number(forecast.gridExposureMw) || 0),
    populationAtRisk: clampStr(forecast.populationAtRisk, 1, BLUEPRINT_LIMITS.populationMax),
    status: forecast.status,
    summary: clampStr(forecast.summary, 5, BLUEPRINT_LIMITS.summaryMax),
    visibility: 'public',
    updatedAt: serverTimestamp(),
  };
  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, mutableFields);
    } else {
      await setDoc(ref, {
        id,
        ...mutableFields,
        ownerId: sanitizeDocId(ownerUid, BLUEPRINT_LIMITS.uidMax),
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateDisasterStatus(
  id: string,
  status: DisasterForecast['status']
): Promise<void> {
  const safeId = sanitizeDocId(id, BLUEPRINT_LIMITS.idMax);
  const path = `disasters/${safeId}`;
  try {
    await updateDoc(doc(db, 'disasters', safeId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateThreatStatus(
  id: string,
  status: CyberThreat['status']
): Promise<void> {
  const safeId = sanitizeDocId(id, BLUEPRINT_LIMITS.idMax);
  const path = `threats/${safeId}`;
  try {
    await updateDoc(doc(db, 'threats', safeId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createIncidentTicket(
  ticket: IncidentTicket,
  reporterUid: string,
  isAdminUser: boolean
): Promise<void> {
  const safeId = sanitizeDocId(ticket.id, BLUEPRINT_LIMITS.idMax);
  const path = `incidents/${safeId}`;
  const visibility = isAdminUser && ticket.domain === 'Cyber' ? 'admin_only' : 'public';
  const domain =
    !isAdminUser && ticket.domain === 'Cyber' ? 'Hybrid Nexus' : ticket.domain;

  const payload: Record<string, unknown> = {
    id: safeId,
    title: clampStr(ticket.title, 3, BLUEPRINT_LIMITS.titleMax),
    domain,
    severity: ticket.severity,
    region: clampStr(ticket.region, 2, BLUEPRINT_LIMITS.regionMax),
    assignedUnit: clampStr(ticket.assignedUnit, 2, BLUEPRINT_LIMITS.assignedUnitMax),
    platformSupport: ticket.platformSupport,
    status: 'Dispatched',
    notes: clampStr(ticket.notes, 3, BLUEPRINT_LIMITS.notesMax),
    visibility,
    reporterId: sanitizeDocId(reporterUid, BLUEPRINT_LIMITS.uidMax),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (ticket.locationCoords && ticket.locationCoords.trim()) {
    payload.locationCoords = clampStr(ticket.locationCoords, 1, 80);
  }
  if (ticket.imageSummary && ticket.imageSummary.trim()) {
    payload.imageSummary = clampStr(ticket.imageSummary, 1, 240);
  }

  try {
    await setDoc(doc(db, 'incidents', safeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateIncidentStatus(
  id: string,
  status: IncidentTicket['status']
): Promise<void> {
  const safeId = sanitizeDocId(id, BLUEPRINT_LIMITS.idMax);
  const path = `incidents/${safeId}`;
  try {
    await updateDoc(doc(db, 'incidents', safeId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateIncidentRescueFields(
  id: string,
  updates: {
    status?: IncidentTicket['status'];
    triagePriority?: IncidentTicket['triagePriority'];
    patientTransferNote?: string;
    notes?: string;
  }
): Promise<void> {
  const safeId = sanitizeDocId(id, BLUEPRINT_LIMITS.idMax);
  const path = `incidents/${safeId}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.status) payload.status = updates.status;
  if (updates.triagePriority) payload.triagePriority = updates.triagePriority;
  if (updates.patientTransferNote && updates.patientTransferNote.trim()) {
    payload.patientTransferNote = clampStr(updates.patientTransferNote, 1, 240);
  }
  if (updates.notes && updates.notes.trim()) {
    payload.notes = clampStr(updates.notes, 3, BLUEPRINT_LIMITS.notesMax);
  }

  try {
    await updateDoc(doc(db, 'incidents', safeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateIncidentAdminFields(
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
): Promise<void> {
  const safeId = sanitizeDocId(id, BLUEPRINT_LIMITS.idMax);
  const path = `incidents/${safeId}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (typeof updates.verifiedByAdmin === 'boolean') {
    payload.verifiedByAdmin = updates.verifiedByAdmin;
  }
  if (updates.assignedUnit && updates.assignedUnit.trim()) {
    payload.assignedUnit = clampStr(updates.assignedUnit, 2, BLUEPRINT_LIMITS.assignedUnitMax);
  }
  if (typeof updates.casualtiesCount === 'number' && updates.casualtiesCount >= 0) {
    payload.casualtiesCount = updates.casualtiesCount;
  }
  if (typeof updates.exposedPopulation === 'number' && updates.exposedPopulation >= 0) {
    payload.exposedPopulation = updates.exposedPopulation;
  }
  if (updates.triagePriority) {
    payload.triagePriority = updates.triagePriority;
  }
  if (updates.damageAssessment && updates.damageAssessment.trim()) {
    payload.damageAssessment = clampStr(updates.damageAssessment, 1, 400);
  }
  if (updates.status) {
    payload.status = updates.status;
  }
  if (updates.notes && updates.notes.trim()) {
    payload.notes = clampStr(updates.notes, 3, BLUEPRINT_LIMITS.notesMax);
  }

  try {
    await updateDoc(doc(db, 'incidents', safeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateReliefResourceFields(
  id: string,
  updatedByUid: string,
  updates: {
    status: ReliefResource['status'];
    quantity: number;
    allocatedTo: string;
  }
): Promise<void> {
  const safeId = sanitizeDocId(id, BLUEPRINT_LIMITS.idMax);
  const path = `relief_resources/${safeId}`;
  try {
    await updateDoc(doc(db, 'relief_resources', safeId), {
      status: updates.status,
      quantity: Math.max(0, Number(updates.quantity) || 0),
      allocatedTo: clampStr(updates.allocatedTo, 1, 140),
      updatedBy: sanitizeDocId(updatedByUid, BLUEPRINT_LIMITS.uidMax),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createReliefResourceDoc(
  res: ReliefResource,
  uid: string
): Promise<void> {
  const safeId = sanitizeDocId(res.id, BLUEPRINT_LIMITS.idMax);
  const path = `relief_resources/${safeId}`;
  try {
    await setDoc(doc(db, 'relief_resources', safeId), {
      id: safeId,
      kind: res.kind,
      name: clampStr(res.name, 2, 160),
      region: clampStr(res.region, 2, BLUEPRINT_LIMITS.regionMax),
      status: res.status,
      quantity: Math.max(0, Number(res.quantity) || 0),
      unit: clampStr(res.unit, 1, 60),
      contact: clampStr(res.contact, 2, 100),
      allocatedTo: clampStr(res.allocatedTo, 1, 140),
      visibility: 'public',
      updatedBy: sanitizeDocId(uid, BLUEPRINT_LIMITS.uidMax),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createAlertDoc(
  alert: AlertNotification,
  authorUid: string
): Promise<void> {
  const safeId = sanitizeDocId(alert.id, BLUEPRINT_LIMITS.idMax);
  const path = `alerts/${safeId}`;
  try {
    await setDoc(doc(db, 'alerts', safeId), {
      id: safeId,
      title: clampStr(alert.title, 3, 160),
      category: alert.category,
      severity: alert.severity,
      channel: alert.channel,
      message: clampStr(alert.message, 5, 400),
      region: clampStr(alert.region, 2, BLUEPRINT_LIMITS.regionMax),
      status: alert.status,
      visibility: alert.visibility,
      authorId: sanitizeDocId(authorUid, BLUEPRINT_LIMITS.uidMax),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAlertStatus(
  id: string,
  status: AlertNotification['status'],
  visibility?: AlertNotification['visibility']
): Promise<void> {
  const safeId = sanitizeDocId(id, BLUEPRINT_LIMITS.idMax);
  const path = `alerts/${safeId}`;
  const payload: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };
  if (visibility) payload.visibility = visibility;

  try {
    await updateDoc(doc(db, 'alerts', safeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAlertDoc(id: string): Promise<void> {
  const safeId = sanitizeDocId(id, BLUEPRINT_LIMITS.idMax);
  const path = `alerts/${safeId}`;
  try {
    await deleteDoc(doc(db, 'alerts', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function updateOwnNotificationPrefs(
  uid: string,
  notifyEmail: boolean,
  notifySms: boolean
): Promise<void> {
  const safeUid = sanitizeDocId(uid, BLUEPRINT_LIMITS.uidMax);
  const path = `users/${safeUid}`;
  try {
    await updateDoc(doc(db, 'users', safeUid), {
      notifyEmail,
      notifySms,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveAiKnowledgeDoc(
  entry: AiKnowledgeEntry,
  authorUid: string
): Promise<void> {
  const safeId = sanitizeDocId(entry.id, BLUEPRINT_LIMITS.idMax);
  const path = `ai_knowledge/${safeId}`;
  const ref = doc(db, 'ai_knowledge', safeId);
  const mutableFields = {
    topic: clampStr(entry.topic, 3, 160),
    category: entry.category,
    guidance: clampStr(entry.guidance, 5, 600),
    language: clampStr(entry.language, 2, 40),
    updatedAt: serverTimestamp(),
  };
  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, mutableFields);
    } else {
      await setDoc(ref, {
        id: safeId,
        ...mutableFields,
        authorId: sanitizeDocId(authorUid, BLUEPRINT_LIMITS.uidMax),
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeAiKnowledgeDoc(id: string): Promise<void> {
  const safeId = sanitizeDocId(id, BLUEPRINT_LIMITS.idMax);
  const path = `ai_knowledge/${safeId}`;
  try {
    await deleteDoc(doc(db, 'ai_knowledge', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function adminUpdateUserAccount(
  targetUid: string,
  targetEmail: string,
  adminUid: string,
  updates: {
    role: UserRole;
    accountStatus: NonNullable<AuthUser['accountStatus']>;
  }
): Promise<void> {
  const safeTarget = sanitizeDocId(targetUid, BLUEPRINT_LIMITS.uidMax);
  const path = `users/${safeTarget}`;
  try {
    await updateDoc(doc(db, 'users', safeTarget), {
      role: updates.role,
      accountStatus: updates.accountStatus,
      updatedAt: serverTimestamp(),
    });
    if (updates.role === 'administrator') {
      const adminRef = doc(db, 'admins', safeTarget);
      const existingAdmin = await getDoc(adminRef);
      if (existingAdmin.exists()) {
        await updateDoc(adminRef, {
          email: clampStr(targetEmail, 3, BLUEPRINT_LIMITS.emailMax),
          grantedBy: sanitizeDocId(adminUid, BLUEPRINT_LIMITS.uidMax),
        });
      } else {
        await setDoc(adminRef, {
          uid: safeTarget,
          email: clampStr(targetEmail, 3, BLUEPRINT_LIMITS.emailMax),
          grantedBy: sanitizeDocId(adminUid, BLUEPRINT_LIMITS.uidMax),
          createdAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveSystemConfigDoc(
  cfg: SystemConfigState,
  adminUid: string
): Promise<void> {
  const path = 'system_config/global';
  try {
    await setDoc(doc(db, 'system_config', 'global'), {
      id: 'global',
      aiModel: clampStr(cfg.aiModel, 3, 80),
      usgsFeedEnabled: Boolean(cfg.usgsFeedEnabled),
      autoEscalationThreshold: cfg.autoEscalationThreshold,
      smsGatewayEnabled: Boolean(cfg.smsGatewayEnabled),
      emailGatewayEnabled: Boolean(cfg.emailGatewayEnabled),
      auditRetentionDays: Math.min(3650, Math.max(1, Number(cfg.auditRetentionDays) || 90)),
      updatedBy: sanitizeDocId(adminUid, BLUEPRINT_LIMITS.uidMax),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function appendAuditLogDoc(
  actor: AuthUser,
  action: string,
  target: string,
  detail: string
): Promise<void> {
  const id = `LOG-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`;
  const path = `audit_logs/${id}`;
  try {
    await setDoc(doc(db, 'audit_logs', id), {
      id,
      actorUid: sanitizeDocId(actor.id, BLUEPRINT_LIMITS.uidMax),
      actorEmail: clampStr(actor.email, 3, BLUEPRINT_LIMITS.emailMax),
      actorRole: actor.role,
      action: clampStr(action, 2, 100),
      target: clampStr(target, 1, 120),
      detail: clampStr(detail, 2, 300),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

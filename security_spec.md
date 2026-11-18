# Nexora ai Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants
1. **Identity & Role Integrity (`users/{userId}`, `admins/{userId}`)**:
   - A user cannot create or escalate their own `role` to `'administrator'` on `/users/{userId}`. Only an existing verified administrator may assign `'administrator'` or write to `/admins/{userId}`.
   - User profile PII (`email`, `displayName`) may only be read by the document owner (`request.auth.uid == userId`) or a verified administrator.
   - `uid` and `createdAt` are immutable after document creation.
2. **Verified Email & Token Integrity**:
   - Every write operation and every email-based admin check requires `request.auth.token.email_verified == true`.
3. **Disaster Telemetry Integrity (`disasters/{forecastId}`)**:
   - Only verified administrators may create, modify, or delete disaster feeds; authenticated users may read public (`visibility == 'public'`) disaster feeds.
   - `confidencePct` must remain within `[0, 100]` and `gridExposureMw >= 0`.
4. **Cyber Threat Isolation (`threats/{threatId}`)**:
   - Cybersecurity IOCs and endpoint threat vectors are strictly restricted to verified administrators (`isAdmin()`). Citizens have zero read or write access.
   - Once a threat reaches `'Contained'`, non-admin writes cannot mutate it, and status transitions must remain valid.
5. **Incident Ticket Integrity (`incidents/{incidentId}`)**:
   - Citizens may create incident tickets only with `reporterId == request.auth.uid`, `status == 'Dispatched'`, `domain in ['Disaster', 'Hybrid Nexus']`, and `visibility == 'public'`.
   - Citizens cannot list `'admin_only'` cyber incident tickets, cannot modify tickets once `'Resolved'`, and cannot reassign `reporterId` or `createdAt`.
   - Administrators may advance incident status (`Dispatched` -> `In Progress` -> `Contained` -> `Resolved`) and manage `'admin_only'` cyber triage tickets.
6. **Temporal & Path Integrity**:
   - All `createdAt` fields on create and `updatedAt` fields on create/update must equal `request.time`.
   - All document IDs (`userId`, `forecastId`, `threatId`, `incidentId`) must match `^[a-zA-Z0-9_\\-]+$` and have length `<= 128`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Target Collection | Attack Category | Malicious Payload / Operation | Expected Result |
|---|---|---|---|---|
| 1 | `/users/{uid}` | Privilege Escalation | Citizen `create` with `{ uid, displayName: "Eve", email: "eve@example.com", role: "administrator", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }` | `PERMISSION_DENIED` |
| 2 | `/users/{uid}` | Role Tampering (Update) | Citizen `update` on own profile changing `role: "administrator"` | `PERMISSION_DENIED` |
| 3 | `/users/{otherUid}` | PII Blanket Read | Citizen A `get` or `list` on Citizen B's `/users/{otherUid}` profile | `PERMISSION_DENIED` |
| 4 | `/admins/{uid}` | Self-Promotion | Non-admin user `set` on `/admins/{uid}` to register themselves as admin | `PERMISSION_DENIED` |
| 5 | `/threats/{id}` | Unauthorized Cyber Read | Authenticated Citizen `get` or `list` on `/threats` | `PERMISSION_DENIED` |
| 6 | `/incidents/{id}` | Shadow / Ghost Field | Citizen `create` on `/incidents` including extra ghost field `isVerified: true` | `PERMISSION_DENIED` |
| 7 | `/incidents/{id}` | Identity Spoofing | Citizen A `create` on `/incidents` with `reporterId: "other-user-uid"` | `PERMISSION_DENIED` |
| 8 | `/incidents/{id}` | State Shortcutting | Citizen `create` on `/incidents` with `status: "Resolved"` instead of `"Dispatched"` | `PERMISSION_DENIED` |
| 9 | `/incidents/{id}` | Terminal State Mutation | Non-admin `update` on an incident whose existing `status == "Resolved"` | `PERMISSION_DENIED` |
| 10 | `/incidents/{id}` | Timestamp Forgery | `create` with client-forged `createdAt: new Date(2020, 1, 1)` instead of `request.time` | `PERMISSION_DENIED` |
| 11 | `/disasters/{id}` | Path / Resource Poisoning | Write to `/disasters/${"A".repeat(200)}` or string `summary` exceeding `400` chars | `PERMISSION_DENIED` |
| 12 | `/incidents/{id}` | Unverified Email Spoof | Request with `email: "genipineninithin@gmail.com"` and `email_verified: false` | `PERMISSION_DENIED` |

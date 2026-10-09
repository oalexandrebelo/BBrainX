export type ReservationState = 'running' | 'unknown' | 'released';
export type UncertaintyReason = 'timeout' | 'transport-lost' | 'owner-interrupted' | 'close-unconfirmed';
export type ProofKind = 'owned-process-closed' | 'operator-confirmed-quiescence';
export interface AdmissionHandle { readonly ledgerId: string; readonly resource: string; readonly generation: number; readonly token: string; }
export interface ResourcePolicy { id: string; physicalKey: string; slots: number; byteLimit: number; }
export interface Reservation {
  generation: number; resource: string; scopeDigest: string; requestDigest: string; bytes: number;
  state: ReservationState; revision: number; transition: 'acquire' | 'uncertain' | 'complete' | 'reconcile';
  reason: UncertaintyReason | ProofKind | null; evidenceDigest: string | null; created: string; updated: string;
}
export interface SharedAdmissionOptions {
  readOnly?: boolean; historyLimit?: number; busyTimeoutMs?: number;
  reconcileVerifier?: (reservation: Readonly<Reservation & { ledgerId: string }>, evidence: Readonly<{ kind: ProofKind; evidenceDigest: string }>) => boolean;
}
export type Acquisition = { ok: true; handle: AdmissionHandle; reservation: Reservation } |
  { ok: false; reason: 'SHARED_SLOT_LIMIT' | 'SHARED_BYTE_LIMIT' | 'ADMISSION_HISTORY_LIMIT' };
export interface AdmissionInspection {
  ledgerId: string; issued: number; historyLimit: number;
  resources: Array<ResourcePolicy & { heldSlots: number; heldBytes: number }>;
  reservations: Reservation[]; nextAfter: number | null;
  scope: 'cooperating-processes-on-one-local-host'; hardRssLimit: false;
}
export class AdmissionError extends Error { readonly code: string; constructor(code: string); }
export const ADMISSION_FILE: 'admission-v1.sqlite';
export class SharedAdmission {
  readonly ledgerId: string; readonly location: string; readonly historyLimit: number;
  constructor(home: string, options?: SharedAdmissionOptions);
  registerResource(policy: ResourcePolicy): { id: string; duplicate: boolean };
  acquire(input: { resource: string; scopeDigest: string; requestDigest: string; bytes: number }): Acquisition;
  markUnknown(handle: AdmissionHandle, input: { expectedRevision: number; reason: UncertaintyReason }): Reservation & { duplicate: boolean };
  release(handle: AdmissionHandle, input: { expectedRevision: number; evidenceDigest: string }): Reservation & { duplicate: boolean };
  reconcile(input: { ledgerId: string; generation: number; expectedRevision: number; kind: ProofKind; evidenceDigest: string }): Reservation & { duplicate: boolean };
  inspect(query?: { after?: number; limit?: number }): AdmissionInspection;
  close(): void;
}

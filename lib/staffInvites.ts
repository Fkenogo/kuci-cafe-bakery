import { Timestamp, collection, doc, getDoc, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { db } from './firebase';
import { AppUserRecord, UserRole } from '../types';

export type StaffInviteStatus = 'pending' | 'claimed' | 'revoked' | 'expired';

export interface StaffInviteRecord {
  id: string;
  role: Exclude<UserRole, 'user'>;
  status: StaffInviteStatus;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  expiresAt?: Timestamp | null;
  claimedByUid?: string | null;
  claimedAt?: Timestamp | null;
  email?: string | null;
  phone?: string | null;
  tokenHash: string;
}

function randomToken(length = 32): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createStaffInvite(input: {
  role: Exclude<UserRole, 'user'>;
  createdBy: string;
  expiresAt?: Date | null;
  email?: string;
  phone?: string;
}): Promise<{ invite: StaffInviteRecord; token: string; claimPath: string }> {
  const token = randomToken(36);
  const tokenHash = await sha256Hex(token);
  const inviteRef = doc(db, 'staffInvites', tokenHash);

  const payload = {
    role: input.role,
    status: 'pending' as const,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: input.expiresAt ? Timestamp.fromDate(input.expiresAt) : null,
    claimedByUid: null,
    claimedAt: null,
    email: input.email?.trim() ? input.email.trim().toLowerCase() : null,
    phone: input.phone?.trim() ? input.phone.trim() : null,
    tokenHash,
  };

  await setDoc(inviteRef, payload);

  const inviteSnap = await getDoc(inviteRef);
  const inviteData = inviteSnap.data() as Omit<StaffInviteRecord, 'id'>;
  const invite: StaffInviteRecord = { id: inviteSnap.id, ...inviteData };

  return {
    invite,
    token,
    claimPath: `/staff-invite?token=${encodeURIComponent(token)}`,
  };
}

export async function fetchInviteByToken(token: string): Promise<StaffInviteRecord | null> {
  const normalized = token.trim();
  if (!normalized) return null;
  const tokenHash = await sha256Hex(normalized);
  const inviteSnap = await getDoc(doc(db, 'staffInvites', tokenHash));
  if (!inviteSnap.exists()) return null;
  return { id: inviteSnap.id, ...(inviteSnap.data() as Omit<StaffInviteRecord, 'id'>) };
}

export async function revokeStaffInvite(inviteId: string): Promise<void> {
  await updateDoc(doc(db, 'staffInvites', inviteId), {
    status: 'revoked',
    updatedAt: serverTimestamp(),
  });
}

function isInviteExpired(invite: StaffInviteRecord): boolean {
  if (!invite.expiresAt) return false;
  return invite.expiresAt.toDate().getTime() < Date.now();
}

function doesInviteMatchPrincipal(invite: StaffInviteRecord, user: FirebaseUser): boolean {
  const inviteEmail = invite.email?.trim().toLowerCase();
  const invitePhone = invite.phone?.trim();
  const authEmail = user.email?.trim().toLowerCase();
  const authPhone = user.phoneNumber?.trim();

  if (inviteEmail && authEmail && inviteEmail !== authEmail) return false;
  if (invitePhone && authPhone && invitePhone !== authPhone) return false;
  if (inviteEmail && !authEmail) return false;
  if (invitePhone && !authPhone) return false;
  return true;
}

export async function claimStaffInvite(input: {
  token: string;
  user: FirebaseUser;
  appUser?: AppUserRecord | null;
}): Promise<StaffInviteRecord> {
  const tokenHash = await sha256Hex(input.token.trim());
  const inviteRef = doc(db, 'staffInvites', tokenHash);
  const userRef = doc(db, 'users', input.user.uid);

  const claimedInvite = await runTransaction(db, async (transaction) => {
    const inviteSnap = await transaction.get(inviteRef);
    if (!inviteSnap.exists()) {
      throw new Error('Invite not found.');
    }

    const invite = { id: inviteSnap.id, ...(inviteSnap.data() as Omit<StaffInviteRecord, 'id'>) } as StaffInviteRecord;
    if (invite.status === 'revoked') throw new Error('This invite has been revoked.');
    if (invite.status === 'expired' || isInviteExpired(invite)) throw new Error('This invite has expired.');
    if (invite.status === 'claimed' && invite.claimedByUid && invite.claimedByUid !== input.user.uid) {
      throw new Error('This invite has already been claimed.');
    }
    if (!doesInviteMatchPrincipal(invite, input.user)) {
      throw new Error('This invite is tied to a different sign-in identity.');
    }

    transaction.set(
      userRef,
      {
        uid: input.user.uid,
        displayName: input.appUser?.displayName || input.user.displayName || 'KUCI Staff',
        email: input.user.email || null,
        phoneNumber: input.user.phoneNumber || null,
        photoURL: input.user.photoURL || null,
        role: invite.role,
        isActive: true,
        profileType: 'linked_account',
        linkedInviteId: invite.id,
        linkedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    transaction.set(
      inviteRef,
      {
        status: 'claimed',
        claimedByUid: input.user.uid,
        claimedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return invite;
  });

  const finalInvite = await getDoc(inviteRef);
  if (!finalInvite.exists()) {
    return claimedInvite;
  }
  return { id: finalInvite.id, ...(finalInvite.data() as Omit<StaffInviteRecord, 'id'>) };
}

export function subscribeStaffInvites(onChange: (invites: StaffInviteRecord[]) => void, onError: (error: unknown) => void): () => void {
  return onSnapshot(
    query(collection(db, 'staffInvites'), orderBy('createdAt', 'desc')),
    (snapshot) => {
      const invites = snapshot.docs.map((inviteDoc) => ({
        id: inviteDoc.id,
        ...(inviteDoc.data() as Omit<StaffInviteRecord, 'id'>),
      }));
      onChange(invites);
    },
    onError
  );
}

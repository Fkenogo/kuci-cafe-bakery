import { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { AppUserRecord, UserRole } from '../types';

export const INITIAL_SUPER_ADMIN_EMAIL = 'fredkenogo@gmail.com';

export function isBootstrapAdminEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === INITIAL_SUPER_ADMIN_EMAIL;
}

export function normalizeUserEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

export function normalizeUserPhoneNumber(phoneNumber?: string | null): string {
  return (phoneNumber || '').trim();
}

function buildDefaultUserRole(user: FirebaseUser): UserRole {
  return isBootstrapAdminEmail(user.email) ? 'admin' : 'user';
}

function isSupportedUserRole(value: unknown): value is UserRole {
  return value === 'admin' ||
    value === 'user' ||
    value === 'front_service' ||
    value === 'bakery_front_service' ||
    value === 'kitchen' ||
    value === 'barista' ||
    value === 'bakery_account_reconciliation' ||
    value === 'cafe_account_reconciliation';
}

function sanitizeUserRecord(user: FirebaseUser, data: Record<string, unknown> | undefined): AppUserRecord {
  const role = isSupportedUserRole(data?.role) ? data.role : buildDefaultUserRole(user);

  return {
    uid: typeof data?.uid === 'string' && data.uid.trim().length > 0 ? data.uid : user.uid,
    ...(typeof data?.email === 'string' && data.email.trim().length > 0
      ? { email: data.email }
      : normalizeUserEmail(user.email)
        ? { email: normalizeUserEmail(user.email) }
        : {}),
    ...(typeof data?.phoneNumber === 'string' && data.phoneNumber.trim().length > 0
      ? { phoneNumber: data.phoneNumber }
      : normalizeUserPhoneNumber(user.phoneNumber)
        ? { phoneNumber: normalizeUserPhoneNumber(user.phoneNumber) }
        : {}),
    displayName:
      typeof data?.displayName === 'string' && data.displayName.trim().length > 0
        ? data.displayName
        : user.displayName || 'KUCI Guest',
    photoURL:
      typeof data?.photoURL === 'string'
        ? data.photoURL
        : user.photoURL || undefined,
    role,
    isActive: typeof data?.isActive === 'boolean' ? data.isActive : true,
    ...(data?.profileType === 'staff_profile' || data?.profileType === 'linked_account'
      ? { profileType: data.profileType }
      : {}),
    ...(typeof data?.linkedUid === 'string' && data.linkedUid.trim().length > 0 ? { linkedUid: data.linkedUid } : {}),
    ...(typeof data?.phone === 'string' && data.phone.trim().length > 0 ? { phone: data.phone } : {}),
    ...(typeof data?.staffCode === 'string' && data.staffCode.trim().length > 0 ? { staffCode: data.staffCode } : {}),
    ...(typeof data?.shiftLabel === 'string' && data.shiftLabel.trim().length > 0 ? { shiftLabel: data.shiftLabel } : {}),
    linkedAt: data?.linkedAt,
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
  };
}

export async function ensureAppUserRecord(user: FirebaseUser): Promise<AppUserRecord> {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const role = buildDefaultUserRole(user);

    await setDoc(userRef, {
      uid: user.uid,
      ...(normalizeUserEmail(user.email) ? { email: normalizeUserEmail(user.email) } : {}),
      ...(normalizeUserPhoneNumber(user.phoneNumber) ? { phoneNumber: normalizeUserPhoneNumber(user.phoneNumber) } : {}),
      displayName: user.displayName || 'KUCI Guest',
      photoURL: user.photoURL || null,
      role,
      isActive: true,
      profileType: 'linked_account',
      linkedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      uid: user.uid,
      ...(normalizeUserEmail(user.email) ? { email: normalizeUserEmail(user.email) } : {}),
      ...(normalizeUserPhoneNumber(user.phoneNumber) ? { phoneNumber: normalizeUserPhoneNumber(user.phoneNumber) } : {}),
      displayName: user.displayName || 'KUCI Guest',
      photoURL: user.photoURL || undefined,
      role,
      isActive: true,
      profileType: 'linked_account',
      linkedAt: new Date().toISOString(),
    };
  }

  const existingData = userSnap.data() as Record<string, unknown>;
  const existingRecord = sanitizeUserRecord(user, existingData);

  await setDoc(
    userRef,
    {
      uid: user.uid,
      ...((normalizeUserEmail(user.email) || existingRecord.email) ? { email: normalizeUserEmail(user.email) || existingRecord.email } : {}),
      ...((normalizeUserPhoneNumber(user.phoneNumber) || existingRecord.phoneNumber) ? { phoneNumber: normalizeUserPhoneNumber(user.phoneNumber) || existingRecord.phoneNumber } : {}),
      displayName: existingRecord.displayName,
      photoURL: existingRecord.photoURL || user.photoURL || null,
      role: existingRecord.role,
      isActive: existingRecord.isActive,
      profileType: 'linked_account',
      linkedAt: existingRecord.linkedAt || serverTimestamp(),
      ...(existingRecord.phone ? { phone: existingRecord.phone } : {}),
      ...(existingRecord.staffCode ? { staffCode: existingRecord.staffCode } : {}),
      ...(existingRecord.shiftLabel ? { shiftLabel: existingRecord.shiftLabel } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ...existingRecord,
    uid: user.uid,
    ...((normalizeUserEmail(user.email) || existingRecord.email) ? { email: normalizeUserEmail(user.email) || existingRecord.email } : {}),
    ...((normalizeUserPhoneNumber(user.phoneNumber) || existingRecord.phoneNumber) ? { phoneNumber: normalizeUserPhoneNumber(user.phoneNumber) || existingRecord.phoneNumber } : {}),
    displayName: existingRecord.displayName,
    photoURL: existingRecord.photoURL || user.photoURL,
    profileType: 'linked_account',
    linkedAt: existingRecord.linkedAt || new Date().toISOString(),
    isActive: existingRecord.isActive,
  };
}

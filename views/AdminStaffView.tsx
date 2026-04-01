import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { AlertCircle, Loader2, Shield, UserCog } from 'lucide-react';
import { db } from '../lib/firebase';
import { AppUserRecord, UserRole } from '../types';

interface AdminStaffViewProps {
  isAdmin: boolean;
}

interface UserAccessFormState {
  uid?: string;
  displayName: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  isActive: boolean;
  phone: string;
  staffCode: string;
  shiftLabel: string;
}

const EMPTY_FORM: UserAccessFormState = {
  displayName: '',
  email: '',
  phoneNumber: '',
  role: 'user',
  isActive: true,
  phone: '',
  staffCode: '',
  shiftLabel: '',
};

function formatRoleLabel(role: UserRole) {
  return role === 'user' ? 'signed-in user' : role.replace(/_/g, ' ');
}

function isLegacyPlaceholderRecord(user: AppUserRecord) {
  return user.profileType === 'staff_profile' || user.uid.startsWith('staff:');
}

export const AdminStaffView: React.FC<AdminStaffViewProps> = ({ isAdmin }) => {
  const [realUsers, setRealUsers] = useState<AppUserRecord[]>([]);
  const [legacyProfiles, setLegacyProfiles] = useState<AppUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<UserAccessFormState>(EMPTY_FORM);

  useEffect(() => {
    if (!isAdmin) {
      setRealUsers([]);
      setLegacyProfiles([]);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      query(collection(db, 'users'), orderBy('displayName', 'asc')),
      (snapshot) => {
        const users = snapshot.docs.map((userDoc) => ({ ...(userDoc.data() as AppUserRecord), uid: userDoc.id }));
        setRealUsers(users.filter((user) => !isLegacyPlaceholderRecord(user)));
        setLegacyProfiles(users.filter(isLegacyPlaceholderRecord));
        setLoading(false);
        setError(null);
      },
      (snapshotError) => {
        console.error('Failed to subscribe to users:', snapshotError);
        setError('Could not load signed-in users right now.');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [isAdmin]);

  const groupedUsers = useMemo(() => {
    const roles: UserRole[] = [
      'user',
      'front_service',
      'bakery_front_service',
      'kitchen',
      'barista',
      'bakery_account_reconciliation',
      'cafe_account_reconciliation',
      'admin',
    ];
    return roles.map((role) => ({
      role,
      users: realUsers.filter((user) => user.role === role),
    }));
  }, [realUsers]);

  const startEditing = (user: AppUserRecord) => {
    setForm({
      uid: user.uid,
      displayName: user.displayName,
      email: user.email || '',
      phoneNumber: user.phoneNumber || '',
      role: user.role,
      isActive: user.isActive,
      phone: user.phone || '',
      staffCode: user.staffCode || '',
      shiftLabel: user.shiftLabel || '',
    });
  };

  const saveUserAccess = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.uid) {
      setError('Select a signed-in user first before updating role access.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await setDoc(
        doc(db, 'users', form.uid),
        {
          displayName: form.displayName.trim() || 'KUCI Guest',
          role: form.role,
          isActive: form.isActive,
          profileType: 'linked_account',
          ...(form.phone.trim() ? { phone: form.phone.trim() } : { phone: null }),
          ...(form.staffCode.trim() ? { staffCode: form.staffCode.trim() } : { staffCode: null }),
          ...(form.shiftLabel.trim() ? { shiftLabel: form.shiftLabel.trim() } : { shiftLabel: null }),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setForm(EMPTY_FORM);
    } catch (saveError) {
      console.error('Failed to save user access:', saveError);
      setError('Could not update this signed-in user.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: AppUserRecord) => {
    try {
      setError(null);
      await setDoc(
        doc(db, 'users', user.uid),
        {
          isActive: !user.isActive,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (toggleError) {
      console.error('Failed to update user status:', toggleError);
      setError('Could not update this user status.');
    }
  };

  if (!isAdmin) {
    return (
      <div className="px-4 py-12 space-y-4 text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center mx-auto">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-serif">Admin Only</h2>
        <p className="text-sm text-[var(--color-text-muted)]">You do not have permission to manage staff access.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 space-y-6 pb-28">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-3xl font-serif">User Access</h2>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-primary)]">
            {realUsers.length} {realUsers.length === 1 ? 'real user' : 'real users'}
          </span>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          Users sign in first, then admin upgrades their role. This screen manages real authenticated user accounts, not login credential creation.
        </p>
      </header>

      {error && (
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-[11px] text-red-700 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-[32px] border border-[var(--color-border)] bg-white px-5 py-5 space-y-4">
        <div className="rounded-[24px] border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-4 py-4 space-y-2 text-sm">
          <p className="font-semibold text-[var(--color-text)]">Operational flow now</p>
          <ol className="list-decimal pl-5 space-y-1 text-[var(--color-text-muted)]">
            <li>Any person signs in first through Firebase Auth.</li>
            <li>The app creates or updates their real `users/{'{uid}'}` profile.</li>
            <li>Admin later upgrades that real user into cafe front, bakery front, prep, reconciliation, or admin roles.</li>
          </ol>
          <p className="text-xs text-[var(--color-text-muted)]">
            Google and phone-auth users now land in the same `users/{'{uid}'}` collection, so admin role assignment works the same way for both.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <UserCog className="w-5 h-5 text-[var(--color-primary)]" />
          <h3 className="text-lg font-serif">{form.uid ? 'Edit User Access' : 'Select A Signed-In User'}</h3>
        </div>

        {form.uid ? (
          <form onSubmit={saveUserAccess} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Display Name</span>
                <input
                  value={form.displayName}
                  onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                  className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Auth Email</span>
                <input
                  value={form.email}
                  readOnly
                  className="w-full rounded-[18px] border border-[var(--color-border)] bg-gray-50 px-3 py-3 text-sm text-[var(--color-text-muted)]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Auth Phone</span>
                <input
                  value={form.phoneNumber}
                  readOnly
                  className="w-full rounded-[18px] border border-[var(--color-border)] bg-gray-50 px-3 py-3 text-sm text-[var(--color-text-muted)]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Role</span>
                <select
                  value={form.role}
                  onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as UserRole }))}
                  className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
                >
                  <option value="user">Basic User</option>
                  <option value="front_service">Front Service</option>
                  <option value="bakery_front_service">Bakery Front Service</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="barista">Barista</option>
                  <option value="bakery_account_reconciliation">Bakery Account Reconciliation</option>
                  <option value="cafe_account_reconciliation">Cafe Account Reconciliation</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Shift Label</span>
                <input
                  value={form.shiftLabel}
                  onChange={(event) => setForm((prev) => ({ ...prev, shiftLabel: event.target.value }))}
                  className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Phone</span>
                <input
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Staff Code</span>
                <input
                  value={form.staffCode}
                  onChange={(event) => setForm((prev) => ({ ...prev, staffCode: event.target.value }))}
                  className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
                />
              </label>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Active
            </label>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-[var(--color-primary)] text-white border-[var(--color-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Access'}
              </button>
              <button
                type="button"
                onClick={() => setForm(EMPTY_FORM)}
                className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-white text-[var(--color-text)] border-[var(--color-border)]"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-[24px] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
            Ask the user to sign in first. Once their real account appears below, you can assign a staff role and metadata here.
          </div>
        )}
      </section>

      {legacyProfiles.length > 0 && (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-5 space-y-3">
          <h3 className="text-lg font-serif">Legacy Placeholder Profiles</h3>
          <p className="text-sm text-amber-800">
            These older admin-created placeholder records are now deprecated. Keep them only as metadata references if needed, then migrate the needed fields onto the real signed-in user account and remove them later.
          </p>
          <div className="space-y-2">
            {legacyProfiles.map((user) => (
              <div key={user.uid} className="rounded-[20px] border border-amber-200 bg-white px-4 py-3 text-sm">
                <p className="font-semibold">{user.displayName}</p>
                <p className="text-[var(--color-text-muted)]">{user.email || user.uid}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="py-16 flex flex-col items-center gap-4 text-[var(--color-text-muted)]">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
          <p className="text-sm">Loading signed-in users...</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedUsers.map((group) => (
            <section key={group.role} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-serif">{formatRoleLabel(group.role)}</h3>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-primary)]">
                  {group.users.length} {group.users.length === 1 ? 'user' : 'users'}
                </span>
              </div>

              {group.users.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
                  No real signed-in users in this section yet.
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {group.users.map((user) => (
                    <article key={user.uid} className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{user.displayName}</p>
                          <p className="text-sm text-[var(--color-text-muted)]">
                            {user.email || user.phoneNumber || 'No auth identifier on file yet'}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">UID: {user.uid}</p>
                          {user.phoneNumber && <p className="text-xs text-[var(--color-text-muted)]">Auth phone: {user.phoneNumber}</p>}
                          {user.staffCode && <p className="text-xs text-[var(--color-text-muted)]">Code: {user.staffCode}</p>}
                          {user.shiftLabel && <p className="text-xs text-[var(--color-text-muted)]">Shift: {user.shiftLabel}</p>}
                          {user.phone && <p className="text-xs text-[var(--color-text-muted)]">Phone: {user.phone}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="px-3 py-1 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-black uppercase tracking-widest">
                            {formatRoleLabel(user.role)}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            user.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => startEditing(user)}
                          className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-white text-[var(--color-text)] border-[var(--color-border)]"
                        >
                          Edit Access
                        </button>
                        <button
                          onClick={() => toggleActive(user)}
                          className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

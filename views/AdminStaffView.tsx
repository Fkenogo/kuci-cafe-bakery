import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { AlertCircle, Copy, Loader2, Shield, UserCog, UserPlus, XCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { AppUserRecord, UserRole } from '../types';
import { createStaffInvite, revokeStaffInvite, StaffInviteRecord, subscribeStaffInvites } from '../lib/staffInvites';

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

interface InviteFormState {
  role: Exclude<UserRole, 'user'>;
  email: string;
  phone: string;
  expiresInDays: number;
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

const EMPTY_INVITE_FORM: InviteFormState = {
  role: 'front_service',
  email: '',
  phone: '',
  expiresInDays: 7,
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
  const [invites, setInvites] = useState<StaffInviteRecord[]>([]);
  const [inviteForm, setInviteForm] = useState<InviteFormState>(EMPTY_INVITE_FORM);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [staffViewTab, setStaffViewTab] = useState<'staff' | 'invites' | 'access'>('staff');

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

  useEffect(() => {
    if (!isAdmin) return;
    return subscribeStaffInvites(
      (nextInvites) => {
        setInvites(nextInvites);
      },
      (subscriptionError) => {
        console.error('Failed to subscribe to staff invites:', subscriptionError);
        setInviteError('Could not load staff invites right now.');
      }
    );
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
    setStaffViewTab('access');
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

  const handleCreateInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin) return;
    try {
      setInviteLoading(true);
      setInviteError(null);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Math.max(1, Math.min(30, inviteForm.expiresInDays)));

      const { claimPath } = await createStaffInvite({
        role: inviteForm.role,
        createdBy: 'admin',
        expiresAt,
        email: inviteForm.email,
        phone: inviteForm.phone,
      });

      const fullLink = `${window.location.origin}${claimPath}`;
      setInviteLink(fullLink);
      setInviteForm(EMPTY_INVITE_FORM);
    } catch (createError) {
      console.error('Failed to create staff invite:', createError);
      setInviteError('Could not create invite right now.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch (copyError) {
      console.warn('Could not copy invite link:', copyError);
    }
  };

  const handleRevokeInvite = async (invite: StaffInviteRecord) => {
    try {
      setInviteError(null);
      await revokeStaffInvite(invite.id);
    } catch (revokeError) {
      console.error('Failed to revoke invite:', revokeError);
      setInviteError('Could not revoke this invite right now.');
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

  const activeStaffCount = realUsers.filter(u => u.isActive && u.role !== 'user').length;
  const pendingInviteCount = invites.filter(i => i.status === 'pending').length;

  return (
    <div className="px-4 py-5 space-y-4 pb-28">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-serif">Staff Management</h2>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-primary)]">
          {realUsers.length} {realUsers.length === 1 ? 'user' : 'users'}
        </span>
      </header>

      {(error || inviteError) && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-[11px] text-red-700 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error || inviteError}</span>
        </div>
      )}

      <nav className="flex gap-1 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40 p-1">
        {([
          { key: 'staff' as const, label: 'Active Staff', count: activeStaffCount },
          { key: 'invites' as const, label: 'Invites', count: pendingInviteCount },
          { key: 'access' as const, label: 'Manage Access', count: form.uid ? 1 : 0 },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStaffViewTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-[16px] text-[10px] font-black uppercase tracking-widest transition-all ${
              staffViewTab === tab.key
                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black flex items-center justify-center ${
                staffViewTab === tab.key ? 'bg-white/30 text-white' : 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </nav>

      {staffViewTab === 'invites' && (
      <section className="rounded-[32px] border border-[var(--color-border)] bg-white px-5 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-[var(--color-primary)]" />
          <h3 className="text-lg font-serif">Staff Invites</h3>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          Invite links onboard staff into a predefined role. Keep links private.
        </p>

        <form onSubmit={handleCreateInvite} className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Role</span>
            <select
              value={inviteForm.role}
              onChange={(event) => setInviteForm((prev) => ({ ...prev, role: event.target.value as Exclude<UserRole, 'user'> }))}
              className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
            >
              <option value="front_service">Front Service</option>
              <option value="bakery_front_service">Bakery Front Service</option>
              <option value="kitchen">Kitchen</option>
              <option value="barista">Barista</option>
              <option value="bakery_account_reconciliation">Bakery Reconciliation</option>
              <option value="cafe_account_reconciliation">Cafe Reconciliation</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Expires In (Days)</span>
            <input
              type="number"
              min={1}
              max={30}
              value={inviteForm.expiresInDays}
              onChange={(event) => setInviteForm((prev) => ({ ...prev, expiresInDays: Number(event.target.value) || 7 }))}
              className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Email (Optional)</span>
            <input
              value={inviteForm.email}
              onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
              className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
              placeholder="staff@kuci.rw"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Phone (Optional)</span>
            <input
              value={inviteForm.phone}
              onChange={(event) => setInviteForm((prev) => ({ ...prev, phone: event.target.value }))}
              className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
              placeholder="+2507..."
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={inviteLoading}
              className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-[var(--color-primary)] text-white border-[var(--color-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {inviteLoading ? 'Creating...' : 'Create Invite'}
            </button>
          </div>
        </form>

        {inviteLink && (
          <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Latest Invite Link</p>
            <p className="break-all text-xs text-[var(--color-text)]">{inviteLink}</p>
            <button
              onClick={handleCopyInviteLink}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider"
            >
              <Copy className="w-3 h-3" />
              Copy Link
            </button>
          </div>
        )}

        <div className="space-y-2">
          {invites.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
              No invites created yet.
            </div>
          ) : (
            invites.slice(0, 12).map((invite) => (
              <article key={invite.id} className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{formatRoleLabel(invite.role)}</p>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">
                    {invite.email || invite.phone || 'Open invite'} · {invite.status}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {invite.status === 'pending' && (
                    <button
                      onClick={() => handleRevokeInvite(invite)}
                      className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-700"
                    >
                      <XCircle className="w-3 h-3" />
                      Revoke
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
      )}

      {staffViewTab === 'access' && (
      <section className="rounded-[32px] border border-[var(--color-border)] bg-white px-5 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <UserCog className="w-5 h-5 text-[var(--color-primary)]" />
          <h3 className="text-lg font-serif">{form.uid ? 'Edit Staff Access' : 'Manage Staff Access'}</h3>
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
            Select a staff member from the <button className="underline text-[var(--color-primary)]" onClick={() => setStaffViewTab('staff')}>Active Staff</button> tab to update their role or metadata. New staff should join through the <button className="underline text-[var(--color-primary)]" onClick={() => setStaffViewTab('invites')}>Invites</button> tab.
          </div>
        )}
      </section>
      )}

      {staffViewTab === 'staff' && (<>
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
      </>)}
    </div>
  );
};

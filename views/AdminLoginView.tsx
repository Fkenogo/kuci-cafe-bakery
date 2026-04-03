import React from 'react';
import { signOut, User as FirebaseUser } from 'firebase/auth';
import { ShieldAlert } from 'lucide-react';
import { auth } from '../lib/firebase';
import { AppUserRecord } from '../types';
import { CustomerAuthView } from './CustomerAuthView';

interface AdminLoginViewProps {
  user: FirebaseUser | null;
  appUser: AppUserRecord | null;
  onBack: () => void;
  onAuthSuccess: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  user,
  appUser,
  onBack,
  onAuthSuccess,
}) => {
  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug('[admin-login] Entered /admin/login', {
      hasUser: !!user,
      role: appUser?.role || null,
      isActive: appUser?.isActive ?? null,
    });
  }, [appUser?.isActive, appUser?.role, user]);

  const isPlainUser = !!user && !!appUser && appUser.role === 'user';

  if (isPlainUser) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)]">
        <div className="mx-auto max-w-md min-h-screen px-4 py-8 flex items-center">
          <div className="w-full rounded-[28px] border border-[var(--color-border)] bg-white px-5 py-6 shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-700 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-primary)]">KUCI Admin Access</p>
              <h1 className="text-2xl font-serif text-[var(--color-text)] mt-2">Access denied</h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                This account does not have admin or staff permissions.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onBack}
                className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-black uppercase tracking-wider"
              >
                Back to Ordering
              </button>
              <button
                onClick={async () => {
                  try {
                    await signOut(auth);
                  } catch (error) {
                    console.error('Error signing out after access-denied:', error);
                  }
                }}
                className="inline-flex items-center justify-center rounded-full border border-red-300 bg-red-50 text-red-700 px-4 py-2 text-xs font-black uppercase tracking-wider"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CustomerAuthView
      user={user}
      onBack={onBack}
      onAuthSuccess={onAuthSuccess}
      accessLabel="KUCI Admin Access"
      entryTitle="Admin sign in"
      entryDescription="Admins and internal staff sign in here for operational dashboards."
      backLabel="Back to Ordering"
    />
  );
};

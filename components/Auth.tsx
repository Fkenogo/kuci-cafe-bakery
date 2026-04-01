import React from 'react';
import { signOut } from 'firebase/auth';
import { LogIn, LogOut } from 'lucide-react';
import { auth } from '../lib/firebase';
import { AppUserRecord } from '../types';

interface AuthProps {
  user: { photoURL?: string | null; displayName?: string | null } | null;
  appUser?: AppUserRecord | null;
  onOpenSignIn?: () => void;
}

export const Auth: React.FC<AuthProps> = ({ user, appUser, onOpenSignIn }) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSignOut = async () => {
    try {
      setLoading(true);
      setError(null);
      await signOut(auth);
    } catch (signOutError) {
      console.error('Error signing out:', signOutError);
      setError('Sign out failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {appUser?.role && appUser.role !== 'user' && (
          <span className="hidden sm:inline-flex items-center px-2 py-1 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-black uppercase tracking-widest">
            {appUser.role.replace(/_/g, ' ')}
          </span>
        )}
        {appUser && !appUser.isActive && (
          <span className="hidden sm:inline-flex items-center px-2 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-widest">
            Inactive
          </span>
        )}
        <button
          onClick={handleSignOut}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium"
        >
          <LogOut className="w-4 h-4" />
          {loading ? 'Signing Out...' : 'Sign Out'}
        </button>
        {error && <span className="hidden sm:inline text-xs text-red-700">{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => onOpenSignIn?.()}
      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[var(--color-primary)] shadow-sm transition-colors hover:bg-[var(--color-primary)]/5"
    >
      <LogIn className="w-4 h-4" />
      Sign In
    </button>
  );
};

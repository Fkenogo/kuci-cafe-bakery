import React from 'react';
import { auth } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { LogIn, LogOut, User } from 'lucide-react';

export const Auth: React.FC<{ user: any }> = ({ user }) => {
  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Error signing in with Google:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <button 
          onClick={handleSignOut}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
        {user.photoURL && (
          <img 
            src={user.photoURL} 
            alt={user.displayName || 'User'} 
            className="w-8 h-8 rounded-full border border-white/20"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
    );
  }

  return (
    <button 
      onClick={handleGoogleSignIn}
      className="flex items-center gap-2 px-4 py-2 rounded-full bg-white text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors text-sm font-bold shadow-sm"
    >
      <LogIn className="w-4 h-4" />
      Sign In
    </button>
  );
};

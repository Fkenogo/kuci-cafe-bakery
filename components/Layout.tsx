
import React, { useState, useEffect } from 'react';
import { LucideIcon, User } from 'lucide-react';
import { Auth } from './Auth';
import { User as FirebaseUser } from 'firebase/auth';
import { AppUserRecord } from '../types';

export interface LayoutTab {
  path: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
}

interface LayoutProps {
  children: React.ReactNode;
  activePath: string;
  navigate: (path: string) => void;
  tabs: LayoutTab[];
  mobileTabs?: LayoutTab[];
  cartCount: number;
  userPhoto?: string;
  user: FirebaseUser | null;
  appUser?: AppUserRecord | null;
  managementViewMode?: 'auto' | 'mobile' | 'desktop';
  onManagementViewModeChange?: (mode: 'auto' | 'mobile' | 'desktop') => void;
  showManagementViewControls?: boolean;
  onOpenSignIn?: () => void;
  showAdminModeSwitch?: boolean;
  adminMode?: 'management' | 'customer';
  onAdminModeChange?: (mode: 'management' | 'customer') => void;
  showStaffOrderEntryAction?: boolean;
  onStaffOrderEntry?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  activePath,
  navigate,
  tabs,
  mobileTabs,
  cartCount,
  userPhoto,
  user,
  appUser,
  managementViewMode = 'auto',
  onManagementViewModeChange,
  showManagementViewControls = false,
  onOpenSignIn,
  showAdminModeSwitch = false,
  adminMode = 'management',
  onAdminModeChange,
  showStaffOrderEntryAction = false,
  onStaffOrderEntry,
}) => {
  const [isBouncing, setIsBouncing] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);

  useEffect(() => {
    const syncViewport = () => setIsDesktopViewport(window.innerWidth >= 1024);
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const resolvedManagementMode = managementViewMode === 'auto'
    ? (isDesktopViewport ? 'desktop' : 'mobile')
    : managementViewMode;
  const isDesktopManagementShell = showManagementViewControls && resolvedManagementMode === 'desktop';
  const displayedTabs = isDesktopManagementShell ? tabs : (mobileTabs || tabs);

  // Trigger animation when cart count increases
  useEffect(() => {
    if (cartCount > 0) {
      setIsBouncing(true);
      const timer = setTimeout(() => setIsBouncing(false), 400);
      return () => clearTimeout(timer);
    }
  }, [cartCount]);

  return (
    <div className={`flex flex-col min-h-screen mx-auto relative bg-[var(--color-bg)] overflow-x-hidden ${
      isDesktopManagementShell ? 'max-w-[1440px] shadow-none' : 'max-w-md shadow-xl'
    }`}>
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[var(--color-bg)]/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-[var(--color-bg-secondary)]">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-[var(--color-primary)] rounded-full flex items-center justify-center text-white font-serif text-xl">K</div>
          <div>
            <h1 className="text-lg font-serif leading-none">KUCI</h1>
            <p className="text-[10px] uppercase tracking-widest text-[var(--color-primary)] font-bold">Café & Bakery</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {showStaffOrderEntryAction && onStaffOrderEntry && (
            <button
              onClick={onStaffOrderEntry}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest"
            >
              Create Order
            </button>
          )}
          <Auth user={user} appUser={appUser} onOpenSignIn={onOpenSignIn} />
          {user && (
            <button 
              onClick={() => navigate('/profile')}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all overflow-hidden border-2 shadow-sm ${
                activePath === '/profile' 
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 ring-4 ring-[var(--color-primary)]/5' 
                  : 'border-transparent hover:bg-[var(--color-primary)]/5 bg-[var(--color-bg-secondary)]/50'
              }`}
            >
              {userPhoto ? (
                <img src={userPhoto} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User className={`w-5 h-5 ${activePath === '/profile' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]'}`} />
              )}
            </button>
          )}
        </div>
      </header>

      {showAdminModeSwitch && onAdminModeChange && (
        <div className={`sticky top-[72px] z-30 border-b border-[var(--color-bg-secondary)] bg-white/95 backdrop-blur px-4 py-2 flex items-center justify-between ${
          isDesktopManagementShell ? 'max-w-[1440px] mx-auto w-full' : ''
        }`}>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Admin Mode</p>
          <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-1">
            {(['management', 'customer'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onAdminModeChange(mode)}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                  adminMode === mode ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'
                }`}
              >
                {mode === 'management' ? 'Management View' : 'Customer View'}
              </button>
            ))}
          </div>
        </div>
      )}

      {showManagementViewControls && onManagementViewModeChange && (
        <div className={`sticky ${showAdminModeSwitch ? 'top-[117px]' : 'top-[72px]'} z-30 border-b border-[var(--color-bg-secondary)] bg-white/95 backdrop-blur px-4 py-2 flex items-center justify-between ${
          isDesktopManagementShell ? 'max-w-[1440px] mx-auto w-full' : ''
        }`}>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Management View</p>
          <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-1">
            {(['auto', 'mobile', 'desktop'] as const).map((mode) => {
              const isActive = managementViewMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => onManagementViewModeChange(mode)}
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                    isActive
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={`flex-1 pb-24 overflow-y-auto no-scrollbar ${isDesktopManagementShell ? 'px-2 md:px-6' : ''}`}>
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className={`fixed bottom-0 left-0 right-0 mx-auto bg-white border-t border-[var(--color-bg-secondary)] z-50 safe-bottom ${
        isDesktopManagementShell ? 'max-w-[1440px]' : 'max-w-md'
      }`}>
        <div className="flex items-center justify-around py-2 px-1">
          {displayedTabs.map((tab) => {
            const isActive = activePath === tab.path;
            const isCart = tab.path === '/orders';
            const Icon = tab.icon;
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`flex flex-col items-center justify-center w-16 h-14 relative transition-all ${
                  isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'
                } ${isCart && isBouncing ? 'animate-cart-pop' : ''}`}
              >
                {isActive && (
                  <div className="absolute top-0 w-full h-1 bg-[var(--color-primary)] rounded-full" />
                )}
                <Icon className={`w-6 h-6 ${isActive ? 'scale-110' : ''} transition-transform`} />
                <span className="text-[10px] font-medium mt-1 uppercase tracking-tighter">{tab.label}</span>
                {tab.badge && tab.badge > 0 && (
                  <span className={`absolute top-2 right-3 bg-[var(--color-primary)] text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white transition-all ${isBouncing ? 'scale-125' : 'scale-100'}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

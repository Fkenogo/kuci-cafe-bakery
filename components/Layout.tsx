
import React, { useState, useEffect } from 'react';
import { Home, Menu as MenuIcon, Cookie, ShoppingBag, Info, User } from 'lucide-react';
import { Auth } from './Auth';
import { User as FirebaseUser } from 'firebase/auth';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  cartCount: number;
  userPhoto?: string;
  user: FirebaseUser | null;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, cartCount, userPhoto, user }) => {
  const [isBouncing, setIsBouncing] = useState(false);

  // Trigger animation when cart count increases
  useEffect(() => {
    if (cartCount > 0) {
      setIsBouncing(true);
      const timer = setTimeout(() => setIsBouncing(false), 400);
      return () => clearTimeout(timer);
    }
  }, [cartCount]);

  const tabs = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'menu', icon: MenuIcon, label: 'Menu' },
    { id: 'bakery', icon: Cookie, label: 'Bakery' },
    { id: 'orders', icon: ShoppingBag, label: 'Orders', badge: cartCount },
    { id: 'info', icon: Info, label: 'Info' },
  ];

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto relative bg-[var(--color-bg)] shadow-xl overflow-x-hidden">
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
          <Auth user={user} />
          <button 
            onClick={() => setActiveTab('profile')}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all overflow-hidden border-2 shadow-sm ${
              activeTab === 'profile' 
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 ring-4 ring-[var(--color-primary)]/5' 
                : 'border-transparent hover:bg-[var(--color-primary)]/5 bg-[var(--color-bg-secondary)]/50'
            }`}
          >
            {userPhoto ? (
              <img src={userPhoto} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User className={`w-5 h-5 ${activeTab === 'profile' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]'}`} />
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-24 overflow-y-auto no-scrollbar">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-[var(--color-bg-secondary)] z-50 safe-bottom">
        <div className="flex items-center justify-around py-2 px-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const isCart = tab.id === 'orders';
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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

import React, { useState, useRef } from 'react';
import { User as FirebaseUser, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { User, Phone, Sparkles, History, ShoppingBag, ChevronRight, Save, LogOut, Coffee, Camera, Upload, Heart, Utensils, Trash2 } from 'lucide-react';
import { UserProfile, HistoricalOrder, CartItem, MenuItem } from '../types';
import { CATEGORY_ICONS } from '../constants';
import { getCategoryIconKey, getMenuItemPriceLabel } from '../lib/catalog';

interface ProfileViewProps {
  userProfile: UserProfile;
  setUserProfile: (profile: UserProfile) => void;
  loyaltyPoints: number;
  orderHistory: HistoricalOrder[];
  onReorder: (items: CartItem[]) => void;
  wishlist: MenuItem[];
  toggleWishlist: (item: MenuItem) => void;
  addToCart: (item: MenuItem) => void;
  user: FirebaseUser | null;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ 
  userProfile, setUserProfile, loyaltyPoints, orderHistory, onReorder, wishlist, toggleWishlist, addToCart, user 
}) => {
  const [isEditing, setIsEditing] = useState(!userProfile.name);
  const [tempName, setTempName] = useState(userProfile.name);
  const [tempPhone, setTempPhone] = useState(userProfile.phone);
  const [tempPhoto, setTempPhoto] = useState(userProfile.photo);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    setUserProfile({ name: tempName, phone: tempPhone, photo: tempPhoto });
    setIsEditing(false);
  };

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setTempPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="px-4 py-8 space-y-8 animate-in fade-in duration-500 pb-24">
      <header className="flex items-center justify-between">
        <h2 className="text-3xl font-serif">My Profile</h2>
        <div className="flex items-center gap-4">
          {userProfile.name && !isEditing && (
            <button onClick={() => setIsEditing(true)} className="text-[var(--color-primary)] text-xs font-bold uppercase tracking-widest">Edit Profile</button>
          )}
          {user && (
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1 text-[var(--color-wishlist)] text-xs font-bold uppercase tracking-widest"
            >
              <LogOut className="w-3 h-3" /> Logout
            </button>
          )}
        </div>
      </header>

      {/* Loyalty Card */}
      <section className="bg-[var(--color-text)] rounded-[40px] p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-[var(--color-primary)]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-[var(--color-primary)]">Kuci Rewards</h3>
            <p className="text-4xl font-serif">{loyaltyPoints.toLocaleString()} PTS</p>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
             <div className="h-full bg-[var(--color-primary)]" style={{ width: `${Math.min(100, (loyaltyPoints / 500) * 100)}%` }} />
          </div>
          <p className="text-[10px] opacity-50 uppercase tracking-widest font-black">
            Saved rewards for future redemption
          </p>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <Coffee className="w-40 h-40" />
        </div>
      </section>

      {/* Personal Info Card */}
      <section className="bg-white rounded-[32px] p-6 shadow-sm border border-[var(--color-border)] space-y-6">
        {isEditing ? (
          <div className="space-y-6">
             <div className="flex items-center gap-5 border-b border-[var(--color-border)] pb-6">
               <div 
                 onClick={triggerFileInput}
                 className="relative w-20 h-20 rounded-full bg-[var(--color-border)] flex items-center justify-center overflow-hidden border-2 border-[var(--color-primary)] cursor-pointer active:scale-95 transition-all group shrink-0 shadow-inner"
               >
                 {tempPhoto ? (
                   <img src={tempPhoto} alt="Profile" className="w-full h-full object-cover" />
                 ) : (
                   <User className="w-10 h-10 text-[var(--color-text)]/20" />
                 )}
                 <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-100 group-hover:bg-black/40 transition-colors">
                    <Camera className="w-6 h-6 text-white drop-shadow-md" />
                 </div>
               </div>
               <div className="space-y-1">
                 <h4 className="font-serif text-lg leading-tight">Profile Picture</h4>
                 <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest font-bold">Tap circle to change</p>
                 <input 
                   type="file" 
                   ref={fileInputRef} 
                   onChange={handlePhotoUpload} 
                   accept="image/*" 
                   className="hidden" 
                 />
               </div>
             </div>

             <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]/40 px-1">Full Name</label>
                    <input 
                      type="text" 
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      className="w-full px-5 py-4 rounded-2xl bg-[var(--color-bg-secondary)] border-2 border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-bg)] outline-none text-sm transition-all"
                      placeholder="e.g. John Doe"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]/40 px-1">Telephone Number</label>
                    <input 
                      type="tel" 
                      value={tempPhone}
                      onChange={(e) => setTempPhone(e.target.value)}
                      className="w-full px-5 py-4 rounded-2xl bg-[var(--color-bg-secondary)] border-2 border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-bg)] outline-none text-sm transition-all"
                      placeholder="07..."
                    />
                </div>
                <button 
                    onClick={handleSave}
                    className="w-full bg-[var(--color-text)] text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 text-[10px] active:bg-[var(--color-primary)]"
                >
                    <Save className="w-4 h-4" /> Update Profile
                </button>
             </div>
          </div>
        ) : (
          <div className="space-y-6">
             <div className="flex items-center gap-5">
                <div className="w-20 h-20 bg-[var(--color-bg-secondary)] rounded-full flex items-center justify-center text-[var(--color-text)] overflow-hidden border-2 border-[var(--color-border)] shrink-0 shadow-sm">
                   {userProfile.photo ? (
                     <img src={userProfile.photo} alt="Profile" className="w-full h-full object-cover" />
                   ) : (
                     <User className="w-10 h-10 text-[var(--color-text-muted)]/20" />
                   )}
                </div>
                <div>
                   <h4 className="font-bold text-[var(--color-text)] text-2xl font-serif leading-tight">{userProfile.name || 'Guest User'}</h4>
                   <div className="flex items-center gap-1 mt-1">
                      <Coffee className="w-3 h-3 text-[var(--color-primary)]" />
                      <p className="text-[10px] text-[var(--color-primary)] font-black uppercase tracking-widest">Coffee Enthusiast</p>
                   </div>
                </div>
             </div>
             
             <div className="h-px bg-[var(--color-border)] w-full" />
             
             <div className="flex items-center gap-4 group">
                <div className="w-12 h-12 bg-[var(--color-bg-secondary)] rounded-2xl flex items-center justify-center text-[var(--color-text)] group-active:scale-95 transition-transform">
                   <Phone className="w-5 h-5 text-[var(--color-primary)]" />
                </div>
                <div>
                   <p className="text-[9px] uppercase font-black text-[var(--color-text-muted)]/30 tracking-[0.2em] mb-0.5">Contact Number</p>
                   <h4 className="font-bold text-[var(--color-text)] text-sm">{userProfile.phone || 'Not provided'}</h4>
                </div>
             </div>
          </div>
        )}
      </section>

      {/* Wishlist Section */}
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-serif">My Wishlist</h3>
          <div className="flex items-center gap-1 text-[var(--color-wishlist)]">
             <Heart className="w-4 h-4 fill-current" />
             <span className="text-[9px] font-black uppercase tracking-widest">Saved Items</span>
          </div>
        </div>

        {wishlist.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {wishlist.map((item) => (
              <div key={item.id} className="bg-white rounded-3xl p-5 border border-[var(--color-border)] shadow-sm flex items-center gap-4 animate-in zoom-in-95 duration-300">
                <div className="w-14 h-14 bg-[var(--color-border)] rounded-2xl flex items-center justify-center text-[var(--color-text)] shrink-0">
                  {CATEGORY_ICONS[getCategoryIconKey(item)] || <Utensils className="w-6 h-6" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-[var(--color-text)] text-sm uppercase font-serif truncate">{item.name}</h4>
                  <p className="text-[10px] text-[var(--color-primary)] font-bold uppercase tracking-widest">{getMenuItemPriceLabel(item)}</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => addToCart(item)}
                    className="p-3 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded-xl active:scale-90 transition-transform"
                    title="Add to Cart"
                  >
                    <ShoppingBag className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => toggleWishlist(item)}
                    className="p-3 bg-[var(--color-wishlist)]/10 text-[var(--color-wishlist)] rounded-xl active:scale-90 transition-transform"
                    title="Remove from Wishlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-[var(--color-bg)] rounded-[40px] border-2 border-dashed border-[var(--color-border)]">
             <Heart className="w-8 h-8 text-[var(--color-text-muted)]/20 mx-auto mb-3" />
             <p className="text-[11px] text-[var(--color-text)]/30 italic px-10">"Found something you like? Heart it to see it here later."</p>
          </div>
        )}
      </section>

      {/* Order History */}
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-serif">Recent Cravings</h3>
          <div className="flex items-center gap-1 text-[var(--color-text-muted)]/30">
             <History className="w-4 h-4" />
             <span className="text-[9px] font-black uppercase tracking-widest">History</span>
          </div>
        </div>

        {orderHistory.length > 0 ? (
          <div className="space-y-4">
            {orderHistory.map((order) => (
              <div key={order.id} className="bg-white rounded-[32px] p-6 border border-[var(--color-border)] shadow-sm space-y-4 group active:scale-[0.98] transition-all">
                <div className="flex justify-between items-start">
                   <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]/40">{order.date}</p>
                      <h4 className="text-lg font-serif mt-1">{order.items.length} {order.items.length === 1 ? 'Item' : 'Items'}</h4>
                   </div>
                   <div className="text-right">
                      <p className="text-sm font-black text-[var(--color-primary)]">{order.total.toLocaleString()} RWF</p>
                      <p className="text-[9px] uppercase font-bold text-[var(--color-text-muted)]/30 tracking-tighter">{order.type}</p>
                   </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                   {order.items.slice(0, 3).map((item, idx) => (
                     <span key={`${item.id}-${idx}`} className="text-[9px] bg-[var(--color-border)] px-3 py-1 rounded-full font-bold text-[var(--color-text)]/60">
                        {item.name}
                     </span>
                   ))}
                   {order.items.length > 3 && (
                     <span className="text-[9px] bg-[var(--color-bg-secondary)] px-3 py-1 rounded-full font-bold text-[var(--color-text-muted)]/40">
                        +{order.items.length - 3} more
                     </span>
                   )}
                </div>

                <button 
                  onClick={() => onReorder(order.items)}
                  className="w-full border-2 border-[var(--color-text)] text-[var(--color-text)] py-4 rounded-2xl font-black uppercase tracking-widest text-[9px] flex items-center justify-center gap-2 group-hover:bg-[var(--color-text)] group-hover:text-white transition-all shadow-sm"
                >
                  <ShoppingBag className="w-4 h-4" /> Order Again
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-[var(--color-border)]/20 rounded-[40px] border-2 border-dashed border-[var(--color-border)]/60">
             <ShoppingBag className="w-10 h-10 text-[var(--color-border)] mx-auto mb-4" />
             <p className="text-xs text-[var(--color-text)]/30 italic px-10">"Looks like your history is empty. Time to order something delicious!"</p>
          </div>
        )}
      </section>

      {/* Footer Info */}
      <footer className="text-center pt-8 border-t border-[var(--color-border)]/30">
         <p className="text-[9px] text-[var(--color-text-muted)]/30 uppercase tracking-widest font-black">KUCI Member ID: {Math.floor(100000 + Math.random() * 900000)}</p>
         <p className="text-[8px] text-[var(--color-text-muted)]/30 uppercase tracking-[0.3em] font-medium mt-1">Thank you for being part of our story</p>
      </footer>
    </div>
  );
};

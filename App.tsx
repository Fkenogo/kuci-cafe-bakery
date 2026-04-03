import React, { useState, useEffect } from 'react';
import { ArrowRight, ClipboardCheck, Coffee, Cookie, Home, Info, Layers, Menu as MenuIcon, Shield, ShoppingBag, UserCog, Utensils } from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { Layout, LayoutTab } from './components/Layout';
import { HomeView } from './views/HomeView';
import { MenuView } from './views/MenuView';
import { BakeryView } from './views/BakeryView';
import { OrdersView } from './views/OrdersView';
import { InfoView } from './views/InfoView';
import { ProfileView } from './views/ProfileView';
import { CustomerAuthView } from './views/CustomerAuthView';
import { StaffInviteView } from './views/StaffInviteView';
import { AdminLoginView } from './views/AdminLoginView';
import { StaffOrderEntryView } from './views/StaffOrderEntryView';
import { FrontServiceOrdersView } from './views/FrontServiceOrdersView';
import { KitchenOrdersView } from './views/KitchenOrdersView';
import { BaristaOrdersView } from './views/BaristaOrdersView';
import { BakeryFrontOrdersView } from './views/BakeryFrontOrdersView';
import { AdminOrdersView } from './views/AdminOrdersView';
import { AdminStaffView } from './views/AdminStaffView';
import { ReconciliationView } from './views/ReconciliationView';
import { AdminCatalogView } from './views/AdminCatalogView';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { AppUserRecord, CartItem, Category, MenuItem, UserProfile, HistoricalOrder, ItemCustomization, UserRole } from './types';
import { useRestaurantData } from './hooks/useFirestore';
import { Loading } from './components/Loading';
import { ErrorView } from './components/Error';
import { normalizeMenuItem } from './lib/catalog';
import { ensureAppUserRecord } from './lib/authBootstrap';
import { canAccessOperationalPath, getRoleHomePath } from './lib/orderRouting';
import { loadCustomerRewardBalanceByPhone } from './lib/customerRewards';

const APP_PATHS = new Set([
  '/',
  '/menu',
  '/bakery',
  '/orders',
  '/info',
  '/profile',
  '/auth',
  '/admin/login',
  '/staff-invite',
  '/staff/orders/create',
  '/admin/orders',
  '/admin/staff',
  '/admin/catalog',
  '/front/orders',
  '/bakery-front/orders',
  '/kitchen/orders',
  '/barista/orders',
  '/reconciliation',
]);

function normalizeAppPath(pathname: string): string {
  return APP_PATHS.has(pathname) ? pathname : '/';
}

function getQueryParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

function buildAccessibleStaffTabs(role: UserRole | undefined, isActive = true): LayoutTab[] {
  if (!isActive) return [];
  const tabs: LayoutTab[] = [];

  if (role === 'admin') {
    tabs.push({ path: '/admin/orders', icon: Shield, label: 'Orders' });
    tabs.push({ path: '/staff/orders/create', icon: ShoppingBag, label: 'Create' });
    tabs.push({ path: '/admin/staff', icon: UserCog, label: 'Staff' });
    tabs.push({ path: '/admin/catalog', icon: Layers, label: 'Catalog' });
    tabs.push({ path: '/front/orders', icon: ShoppingBag, label: 'Front' });
    tabs.push({ path: '/bakery-front/orders', icon: Cookie, label: 'Bakery Front' });
    tabs.push({ path: '/kitchen/orders', icon: Utensils, label: 'Kitchen' });
    tabs.push({ path: '/barista/orders', icon: Coffee, label: 'Barista' });
    tabs.push({ path: '/reconciliation', icon: ClipboardCheck, label: 'Reconciliation' });
    return tabs;
  }

  if (role === 'front_service') {
    return [
      { path: '/front/orders', icon: ShoppingBag, label: 'Front' },
      { path: '/staff/orders/create', icon: ShoppingBag, label: 'Create' },
    ];
  }
  if (role === 'bakery_front_service') {
    return [
      { path: '/bakery-front/orders', icon: Cookie, label: 'Bakery Front' },
      { path: '/staff/orders/create', icon: ShoppingBag, label: 'Create' },
    ];
  }
  if (role === 'kitchen') return [{ path: '/kitchen/orders', icon: Utensils, label: 'Kitchen' }];
  if (role === 'barista') return [{ path: '/barista/orders', icon: Coffee, label: 'Barista' }];
  if (role === 'bakery_account_reconciliation' || role === 'cafe_account_reconciliation') {
    return [{ path: '/reconciliation', icon: ClipboardCheck, label: 'Reconciliation' }];
  }
  return tabs;
}

function isOperationalRole(role: UserRole | undefined): boolean {
  return role === 'admin' ||
    role === 'front_service' ||
    role === 'bakery_front_service' ||
    role === 'kitchen' ||
    role === 'barista' ||
    role === 'bakery_account_reconciliation' ||
    role === 'cafe_account_reconciliation';
}

function canCreateStaffAssistedOrder(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'front_service' || role === 'bakery_front_service';
}

function sanitizeStoredCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, index) => {
    const normalizedItem = normalizeMenuItem(entry as Record<string, unknown>, `localStorage cart[${index}]`);
    if (!normalizedItem) return [];

    const quantity = typeof (entry as CartItem).quantity === 'number' && (entry as CartItem).quantity > 0
      ? (entry as CartItem).quantity
      : 1;
    const instanceId = typeof (entry as CartItem).instanceId === 'string' && (entry as CartItem).instanceId.length > 0
      ? (entry as CartItem).instanceId
      : `${normalizedItem.id}-${index}`;

    return [{
      ...normalizedItem,
      quantity,
      customization: (entry as CartItem).customization,
      instanceId,
    }];
  });
}

function sanitizeStoredMenuItems(value: unknown, context: string): MenuItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, index) => {
    const normalizedItem = normalizeMenuItem(entry as Record<string, unknown>, `${context}[${index}]`);
    return normalizedItem ? [normalizedItem] : [];
  });
}

function sanitizeStoredOrderHistory(value: unknown): HistoricalOrder[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      console.warn(`[catalog] Skipping invalid order history record at index ${index}`, entry);
      return [];
    }

    const items = sanitizeStoredCart((entry as HistoricalOrder).items);
    return [{
      id: typeof (entry as HistoricalOrder).id === 'string' ? (entry as HistoricalOrder).id : `history-${index}`,
      date: typeof (entry as HistoricalOrder).date === 'string' ? (entry as HistoricalOrder).date : new Date().toLocaleDateString(),
      items,
      total: typeof (entry as HistoricalOrder).total === 'number' ? (entry as HistoricalOrder).total : 0,
      type: (entry as HistoricalOrder).type,
    }];
  });
}

const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState(() => normalizeAppPath(window.location.pathname));
  const [cart, setCart] = useState<CartItem[]>([]);
  const [staffCart, setStaffCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<MenuItem[]>([]);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: '', phone: '' });
  const [orderHistory, setOrderHistory] = useState<HistoricalOrder[]>([]);
  const [guestOrderRefs, setGuestOrderRefs] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUserRecord | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [managementViewMode, setManagementViewMode] = useState<'auto' | 'mobile' | 'desktop'>(() => {
    const stored = localStorage.getItem('kuci_management_view_mode');
    if (stored === 'auto' || stored === 'mobile' || stored === 'desktop') return stored;
    return 'auto';
  });
  const [adminMode, setAdminMode] = useState<'management' | 'customer'>(() => {
    const stored = localStorage.getItem('kuci_admin_mode');
    return stored === 'customer' ? 'customer' : 'management';
  });
  const [staffOrderBuildSession, setStaffOrderBuildSession] = useState(false);
  const [assistedCustomerProfile, setAssistedCustomerProfile] = useState<UserProfile>({ name: '', phone: '' });

  const { categories, menuItems, bakeryCategories, bakeryItems, settings, loading: dataLoading, error } = useRestaurantData();
  const hasStructuredCategoryGroups = categories.some((category) => !!category.categoryGroup);
  const visibleMenuCategories = hasStructuredCategoryGroups
    ? categories.filter((category) => category.categoryGroup === 'main')
    : categories.filter((category) => category.categoryGroup !== 'bakery');

  const navigate = (path: string) => {
    const nextPath = normalizeAppPath(path);
    if (nextPath === currentPath) return;
    window.history.pushState({}, '', nextPath);
    setCurrentPath(nextPath);
  };

  useEffect(() => {
    const handlePopState = () => setCurrentPath(normalizeAppPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  
  // Apply dynamic colors from settings
  useEffect(() => {
    if (settings?.colors) {
      const root = document.documentElement;
      root.style.setProperty('--color-primary', settings.colors.primary);
      root.style.setProperty('--color-text', settings.colors.text);
      root.style.setProperty('--color-bg', settings.colors.bg);
      root.style.setProperty('--color-bg-secondary', settings.colors.bgSecondary);
    }
  }, [settings]);

  // Load state from localStorage
  useEffect(() => {
    const savedCart = localStorage.getItem('kuci_cart');
    const savedWishlist = localStorage.getItem('kuci_wishlist');
    const savedPoints = localStorage.getItem('kuci_loyalty_points');
    const savedUser = localStorage.getItem('kuci_user');
    const savedHistory = localStorage.getItem('kuci_history');
    const savedGuestOrderRefs = localStorage.getItem('kuci_guest_order_refs');
    const savedStaffCart = localStorage.getItem('kuci_staff_cart');

    if (savedCart) setCart(sanitizeStoredCart(JSON.parse(savedCart)));
    if (savedWishlist) setWishlist(sanitizeStoredMenuItems(JSON.parse(savedWishlist), 'localStorage wishlist'));
    if (savedPoints) setLoyaltyPoints(parseInt(savedPoints, 10));
    if (savedUser) setUserProfile(JSON.parse(savedUser));
    if (savedHistory) setOrderHistory(sanitizeStoredOrderHistory(JSON.parse(savedHistory)));
    if (savedStaffCart) setStaffCart(sanitizeStoredCart(JSON.parse(savedStaffCart)));
    if (savedGuestOrderRefs) {
      try {
        const parsed = JSON.parse(savedGuestOrderRefs);
        if (Array.isArray(parsed)) {
          const normalizedRefs = parsed
            .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            .slice(0, 20);
          setGuestOrderRefs(Array.from(new Set(normalizedRefs)));
        }
      } catch (error) {
        console.warn('[orders] Failed to parse local guest order refs', error);
      }
    }
  }, []);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('kuci_cart', JSON.stringify(cart));
    localStorage.setItem('kuci_staff_cart', JSON.stringify(staffCart));
    localStorage.setItem('kuci_wishlist', JSON.stringify(wishlist));
    localStorage.setItem('kuci_user', JSON.stringify(userProfile));
    localStorage.setItem('kuci_history', JSON.stringify(orderHistory));
    localStorage.setItem('kuci_guest_order_refs', JSON.stringify(guestOrderRefs));
    localStorage.setItem('kuci_loyalty_points', loyaltyPoints.toString());
  }, [cart, staffCart, wishlist, userProfile, orderHistory, guestOrderRefs, loyaltyPoints]);

  useEffect(() => {
    localStorage.setItem('kuci_management_view_mode', managementViewMode);
  }, [managementViewMode]);

  useEffect(() => {
    localStorage.setItem('kuci_admin_mode', adminMode);
  }, [adminMode]);

  useEffect(() => {
    if (currentPath === '/orders') {
      setStaffOrderBuildSession(false);
      return;
    }
    if (!currentPath.startsWith('/staff/orders/') && currentPath !== '/menu' && currentPath !== '/bakery') {
      setStaffOrderBuildSession(false);
    }
  }, [currentPath]);

  useEffect(() => {
    const syncRewardBalance = async () => {
      if (!userProfile.phone || userProfile.phone.trim().length < 8) return;
      try {
        const balance = await loadCustomerRewardBalanceByPhone(userProfile.phone);
        setLoyaltyPoints(balance);
      } catch (error) {
        console.warn('[loyalty] Failed to sync customer reward balance', error);
      }
    };

    void syncRewardBalance();
  }, [orderHistory, userProfile.phone]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (import.meta.env.DEV) {
        console.debug('[auth] onAuthStateChanged fired', {
          hasUser: !!u,
          uid: u?.uid || null,
          currentPath,
        });
      }
      setAuthLoading(true);
      setUser(u);

      if (!u) {
        setAppUser(null);
        setAuthLoading(false);
        return;
      }

      try {
        const userRecord = await ensureAppUserRecord(u);
        if (import.meta.env.DEV) {
          console.debug('[auth] ensureAppUserRecord resolved', {
            uid: userRecord.uid,
            role: userRecord.role,
            isActive: userRecord.isActive,
          });
        }
        setAppUser(userRecord);
        setUserProfile(prev => ({
          ...prev,
          name: userRecord.displayName || u.displayName || prev.name,
          photo: userRecord.photoURL || u.photoURL || prev.photo
        }));
      } catch (bootstrapError) {
        console.error('Error bootstrapping user record:', bootstrapError);
        setAppUser(null);
        setUserProfile(prev => ({
          ...prev,
          name: u.displayName || prev.name,
          photo: u.photoURL || prev.photo
        }));
      } finally {
        setAuthLoading(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedCategory && visibleMenuCategories.length > 0) {
      setSelectedCategory(visibleMenuCategories[0]);
    }
  }, [visibleMenuCategories, selectedCategory]);

  useEffect(() => {
    if (!selectedCategory) return;
    if (visibleMenuCategories.some((category) => category.id === selectedCategory.id)) return;
    if (visibleMenuCategories.length > 0) {
      setSelectedCategory(visibleMenuCategories[0]);
    }
  }, [selectedCategory, visibleMenuCategories]);

  useEffect(() => {
    if (authLoading) return;
    if (!appUser?.isActive) return;
    if (!isOperationalRole(appUser.role)) return;
    if (appUser.role === 'admin' && adminMode === 'customer') return;
    if (currentPath !== '/' && currentPath !== '/auth' && currentPath !== '/admin/login') return;
    if (import.meta.env.DEV) {
      console.debug('[auth] Operational role auto-routing to role home', {
        role: appUser.role,
        from: currentPath,
        to: getRoleHomePath(appUser.role),
      });
    }
    navigate(getRoleHomePath(appUser.role));
  }, [adminMode, appUser?.isActive, appUser?.role, authLoading, currentPath]);

  useEffect(() => {
    if (authLoading) return;
    const isOperationalPath =
      (currentPath.startsWith('/admin/') && currentPath !== '/admin/login') ||
      currentPath.startsWith('/front/') ||
      currentPath.startsWith('/bakery-front/') ||
      currentPath.startsWith('/kitchen/') ||
      currentPath.startsWith('/barista/') ||
      currentPath.startsWith('/reconciliation');
    if (!isOperationalPath) return;

    if (!canAccessOperationalPath(appUser?.role, currentPath, appUser?.isActive ?? false) || (appUser?.role === 'admin' && adminMode === 'customer')) {
      if (import.meta.env.DEV) {
        console.debug('[auth] Route access denied, redirecting to role home', {
          role: appUser?.role || null,
          from: currentPath,
          to: getRoleHomePath(appUser?.role),
        });
      }
      navigate(appUser?.role === 'admin' && adminMode === 'customer' ? '/' : getRoleHomePath(appUser?.role));
    }
  }, [adminMode, appUser?.isActive, appUser?.role, authLoading, currentPath]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug('[auth-routing] Path/auth snapshot', {
      path: currentPath,
      authLoading,
      hasFirebaseUser: !!user,
      appUserRole: appUser?.role || null,
      appUserActive: appUser?.isActive ?? null,
    });
  }, [appUser?.isActive, appUser?.role, authLoading, currentPath, user]);

  useEffect(() => {
    if (!appUser?.isActive || appUser.role !== 'admin') return;
    if (adminMode !== 'customer') return;
    const isOperationalPath =
      (currentPath.startsWith('/admin/') && currentPath !== '/admin/login') ||
      currentPath.startsWith('/front/') ||
      currentPath.startsWith('/bakery-front/') ||
      currentPath.startsWith('/kitchen/') ||
      currentPath.startsWith('/barista/') ||
      currentPath.startsWith('/reconciliation');
    if (isOperationalPath) {
      navigate('/');
    }
  }, [adminMode, appUser?.isActive, appUser?.role, currentPath]);

  const addToCart = (item: MenuItem, customization?: ItemCustomization) => {
    const setTargetCart = staffOrderBuildSession ? setStaffCart : setCart;
    setTargetCart(prev => {
      const existingIndex = prev.findIndex(i => {
        if (i.id !== item.id) return false;
        return JSON.stringify(i.customization) === JSON.stringify(customization);
      });

      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], quantity: updated[existingIndex].quantity + 1 };
        return updated;
      }

      const newCartItem: CartItem = {
        ...item,
        quantity: 1,
        customization,
        instanceId: Math.random().toString(36).substr(2, 9)
      };
      return [...prev, newCartItem];
    });
  };

  const updateCartItemCustomization = (instanceId: string, customization: ItemCustomization) => {
    const setTargetCart = staffOrderBuildSession ? setStaffCart : setCart;
    setTargetCart(prev => prev.map(item => {
      if (item.instanceId === instanceId) {
        return { ...item, customization };
      }
      return item;
    }));
  };

  const toggleWishlist = (item: MenuItem) => {
    setWishlist(prev => {
      const exists = prev.find(i => i.id === item.id);
      if (exists) {
        return prev.filter(i => i.id !== item.id);
      }
      return [...prev, item];
    });
  };

  const updateQuantity = (instanceId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.instanceId === instanceId) {
        const newQty = Math.max(0, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const updateStaffQuantity = (instanceId: string, delta: number) => {
    setStaffCart(prev => prev.map(i => {
      if (i.instanceId === instanceId) {
        const newQty = Math.max(0, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const clearCart = () => setCart([]);
  const clearStaffCart = () => setStaffCart([]);

  const completeOrder = (order: HistoricalOrder, options?: { trackInLocalHistory?: boolean }) => {
    const trackInLocalHistory = options?.trackInLocalHistory !== false;
    if (trackInLocalHistory) {
      setOrderHistory(prev => [order, ...prev]);
      setGuestOrderRefs((prev) => [order.id, ...prev.filter((orderId) => orderId !== order.id)].slice(0, 20));
    }
    clearCart();
  };

  const completeStaffOrder = (order: HistoricalOrder, options?: { trackInLocalHistory?: boolean }) => {
    const trackInLocalHistory = options?.trackInLocalHistory === true;
    if (trackInLocalHistory) {
      setOrderHistory(prev => [order, ...prev]);
      setGuestOrderRefs((prev) => [order.id, ...prev.filter((orderId) => orderId !== order.id)].slice(0, 20));
    }
    clearStaffCart();
    setStaffOrderBuildSession(false);
  };

  const reorder = (items: CartItem[]) => {
    setCart(items.map(item => ({...item, instanceId: Math.random().toString(36).substr(2, 9)})));
    setStaffOrderBuildSession(false);
    navigate('/orders');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (authLoading || dataLoading) return <Loading />;
  if (error) return <ErrorView message={error} onRetry={() => window.location.reload()} />;

  const isStaffPath =
    currentPath.startsWith('/admin/') ||
    currentPath.startsWith('/front/') ||
    currentPath.startsWith('/bakery-front/') ||
    currentPath.startsWith('/staff/orders/') ||
    currentPath.startsWith('/kitchen/') ||
    currentPath.startsWith('/barista/') ||
    currentPath.startsWith('/reconciliation');
  const isAdminCustomerMode = appUser?.role === 'admin' && adminMode === 'customer';
  const accessibleStaffTabs = isAdminCustomerMode
    ? []
    : buildAccessibleStaffTabs(appUser?.role, appUser?.isActive ?? false);
  const customerTabs: LayoutTab[] = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/menu', icon: MenuIcon, label: 'Menu' },
    { path: '/bakery', icon: Cookie, label: 'Bakery' },
    { path: '/orders', icon: ShoppingBag, label: 'Orders', badge: cart.reduce((acc, i) => acc + i.quantity, 0) },
    { path: '/info', icon: Info, label: 'Info' },
    ...(accessibleStaffTabs.length > 0 ? [accessibleStaffTabs[0]] : []),
  ];
  const activeTabs = isStaffPath ? [{ path: '/', icon: Home, label: 'Home' }, ...accessibleStaffTabs] : customerTabs;
  const showManagementViewControls = isStaffPath && !isAdminCustomerMode && !!appUser && appUser.role !== 'user';
  const showStaffShortcutOnCustomerView =
    !isStaffPath &&
    !!appUser?.isActive &&
    isOperationalRole(appUser?.role) &&
    !(appUser?.role === 'admin' && adminMode === 'customer');
  const showPwaPrompt = !isStaffPath && currentPath !== '/auth';
  const showAdminModeSwitch = appUser?.role === 'admin' && appUser?.isActive === true;
  const showStaffOrderEntryAction = canCreateStaffAssistedOrder(appUser?.role) && !!appUser?.isActive;
  const operationalHomePath = getRoleHomePath(appUser?.role);
  const renderView = () => {
    switch (currentPath) {
      case '/': return (
        <HomeView 
          onCategorySelect={(cat) => {
            setSelectedCategory(cat);
            navigate('/menu');
          }}
          addToCart={addToCart} 
          wishlist={wishlist}
          toggleWishlist={toggleWishlist}
          orderHistory={orderHistory}
          menuItems={menuItems}
          categories={visibleMenuCategories}
        />
      );
      case '/menu': return (
        <MenuView
          addToCart={addToCart}
          wishlist={wishlist}
          toggleWishlist={toggleWishlist}
          menuItems={menuItems}
          categories={visibleMenuCategories}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          staffSession={staffOrderBuildSession ? {
            customerName: assistedCustomerProfile.name || assistedCustomerProfile.phone || 'Customer',
            staffCartCount: staffCart.reduce((acc, i) => acc + i.quantity, 0),
            onReturn: () => navigate('/staff/orders/create'),
          } : undefined}
        />
      );
      case '/bakery': return (
        <BakeryView
          bakeryCategories={bakeryCategories}
          bakeryItems={bakeryItems}
          addToCart={addToCart}
          menuCategories={categories}
          staffSession={staffOrderBuildSession ? {
            customerName: assistedCustomerProfile.name || assistedCustomerProfile.phone || 'Customer',
            staffCartCount: staffCart.reduce((acc, i) => acc + i.quantity, 0),
            onReturn: () => navigate('/staff/orders/create'),
          } : undefined}
        />
      );
      case '/orders': return (
        <OrdersView 
          cart={cart} 
          updateQuantity={updateQuantity} 
          removeFromCart={(id) => updateQuantity(id, -1)} 
          clearCart={clearCart}
          loyaltyPoints={loyaltyPoints}
          userProfile={userProfile}
          setUserProfile={setUserProfile}
          onOrderComplete={completeOrder}
          orderHistory={orderHistory}
          guestOrderRefs={guestOrderRefs}
          onReorder={reorder}
          onUpdateCustomization={updateCartItemCustomization}
          settings={settings}
          userId={user?.uid ?? null}
        />
      );
      case '/staff/orders/create': return (
        canCreateStaffAssistedOrder(appUser?.role) && appUser?.isActive ? (
          <StaffOrderEntryView
            cart={staffCart}
            updateQuantity={updateStaffQuantity}
            clearCart={clearStaffCart}
            loyaltyPoints={loyaltyPoints}
            orderHistory={orderHistory}
            guestOrderRefs={guestOrderRefs}
            onReorder={reorder}
            onUpdateCustomization={updateCartItemCustomization}
            settings={settings}
            userId={user?.uid ?? null}
            currentStaff={appUser}
            assistedCustomerProfile={assistedCustomerProfile}
            setAssistedCustomerProfile={setAssistedCustomerProfile}
            onOrderComplete={completeStaffOrder}
            onExitToOperational={() => {
              setStaffOrderBuildSession(false);
              navigate(operationalHomePath);
            }}
            onOpenCafeMenu={() => {
              setStaffOrderBuildSession(true);
              navigate('/menu');
            }}
            onOpenBakeryMenu={() => {
              setStaffOrderBuildSession(true);
              navigate('/bakery');
            }}
          />
        ) : (
          <ErrorView
            message="Staff order entry is available only for admin, front service, and bakery front service users."
            onRetry={() => navigate(getRoleHomePath(appUser?.role))}
          />
        )
      );
      case '/info': return <InfoView settings={settings} />;
      case '/auth': return (
        <CustomerAuthView
          user={user}
          onBack={() => navigate('/')}
          onAuthSuccess={() => {
            const inviteToken = getQueryParam('staffInviteToken');
            if (inviteToken) {
              navigate(`/staff-invite?token=${encodeURIComponent(inviteToken)}`.split('?')[0]);
              window.history.replaceState({}, '', `/staff-invite?token=${encodeURIComponent(inviteToken)}`);
              return;
            }
            navigate('/');
          }}
        />
      );
      case '/staff-invite': return (
        <StaffInviteView
          user={user}
          appUser={appUser}
          onBackToHome={() => navigate('/')}
          onGoToAuth={(token) => {
            navigate('/auth');
            window.history.replaceState({}, '', token ? `/auth?staffInviteToken=${encodeURIComponent(token)}` : '/auth');
          }}
          onInviteClaimed={(role) => {
              setAppUser(prev => prev ? { ...prev, role, isActive: true } : null);
              navigate(getRoleHomePath(role));
            }}
        />
      );
      case '/admin/login': return (
        <AdminLoginView
          user={user}
          appUser={appUser}
          onBack={() => navigate('/')}
          onAuthSuccess={() => {
            if (import.meta.env.DEV) {
              console.debug('[auth-routing] /admin/login auth completed, waiting for role bootstrap redirect.');
            }
          }}
        />
      );
      case '/admin/orders': return <AdminOrdersView isAdmin={canAccessOperationalPath(appUser?.role, '/admin/orders', appUser?.isActive ?? false)} currentStaff={appUser} />;
      case '/admin/staff': return <AdminStaffView isAdmin={canAccessOperationalPath(appUser?.role, '/admin/staff', appUser?.isActive ?? false)} />;
      case '/admin/catalog': return <AdminCatalogView isAdmin={canAccessOperationalPath(appUser?.role, '/admin/catalog', appUser?.isActive ?? false)} />;
      case '/front/orders': return <FrontServiceOrdersView isAllowed={canAccessOperationalPath(appUser?.role, '/front/orders', appUser?.isActive ?? false)} currentStaff={appUser} menuItems={menuItems} />;
      case '/bakery-front/orders': return <BakeryFrontOrdersView isAllowed={canAccessOperationalPath(appUser?.role, '/bakery-front/orders', appUser?.isActive ?? false)} currentStaff={appUser} menuItems={menuItems} />;
      case '/kitchen/orders': return <KitchenOrdersView isAllowed={canAccessOperationalPath(appUser?.role, '/kitchen/orders', appUser?.isActive ?? false)} currentStaff={appUser} menuItems={menuItems} />;
      case '/barista/orders': return <BaristaOrdersView isAllowed={canAccessOperationalPath(appUser?.role, '/barista/orders', appUser?.isActive ?? false)} currentStaff={appUser} menuItems={menuItems} />;
      case '/reconciliation': return <ReconciliationView isAllowed={canAccessOperationalPath(appUser?.role, '/reconciliation', appUser?.isActive ?? false)} currentUser={appUser} />;
      case '/profile': return (
        <ProfileView 
          userProfile={userProfile} 
          setUserProfile={setUserProfile} 
          loyaltyPoints={loyaltyPoints}
          orderHistory={orderHistory}
          onReorder={reorder}
          wishlist={wishlist}
          toggleWishlist={toggleWishlist}
          addToCart={addToCart}
          user={user}
        />
      );
      default: return (
        <HomeView 
          onCategorySelect={(cat) => {
            setSelectedCategory(cat);
            navigate('/menu');
          }}
          addToCart={addToCart} 
          wishlist={wishlist}
          toggleWishlist={toggleWishlist}
          orderHistory={orderHistory}
          menuItems={menuItems}
          categories={visibleMenuCategories}
        />
      );
    }
  };

  if (currentPath === '/auth' || currentPath === '/staff-invite' || currentPath === '/admin/login') {
    return renderView();
  }

  return (
    <Layout 
      activePath={currentPath}
      navigate={navigate}
      tabs={activeTabs}
      cartCount={((staffOrderBuildSession || isStaffPath) ? staffCart : cart).reduce((acc, i) => acc + i.quantity, 0)}
      userPhoto={userProfile.photo}
      user={user}
      appUser={appUser}
      managementViewMode={managementViewMode}
      onManagementViewModeChange={setManagementViewMode}
      showManagementViewControls={showManagementViewControls}
      onOpenSignIn={isStaffPath ? () => navigate('/auth') : undefined}
      showAdminModeSwitch={showAdminModeSwitch}
      adminMode={adminMode}
      onAdminModeChange={(mode) => {
        setAdminMode(mode);
        if (mode === 'management') {
          navigate('/admin/orders');
          return;
        }
        navigate('/');
      }}
      showStaffOrderEntryAction={showStaffOrderEntryAction}
      onStaffOrderEntry={() => {
        setStaffOrderBuildSession(false);
        setStaffCart([]);
        navigate('/staff/orders/create');
      }}
    >
      {showStaffShortcutOnCustomerView && (
        <section className="mx-4 mt-4 rounded-[20px] border border-[var(--color-primary)]/25 bg-[var(--color-primary)]/5 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--color-text-muted)]">Signed in as staff. Use your operational board.</p>
          <button
            onClick={() => navigate(getRoleHomePath(appUser?.role))}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)] text-[var(--color-primary)] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider"
          >
            Go to Staff View
            <ArrowRight className="w-3 h-3" />
          </button>
        </section>
      )}
      {renderView()}
      <PwaInstallPrompt visible={showPwaPrompt} />
    </Layout>
  );
};

export default App;

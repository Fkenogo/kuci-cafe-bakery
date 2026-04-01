import React, { useState, useEffect } from 'react';
import { ClipboardCheck, Coffee, Cookie, Home, Info, Layers, Menu as MenuIcon, Shield, ShoppingBag, UserCog, Utensils } from 'lucide-react';
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
import { FrontServiceOrdersView } from './views/FrontServiceOrdersView';
import { KitchenOrdersView } from './views/KitchenOrdersView';
import { BaristaOrdersView } from './views/BaristaOrdersView';
import { BakeryFrontOrdersView } from './views/BakeryFrontOrdersView';
import { AdminOrdersView } from './views/AdminOrdersView';
import { AdminStaffView } from './views/AdminStaffView';
import { ReconciliationView } from './views/ReconciliationView';
import { AdminCatalogView } from './views/AdminCatalogView';
import { AppUserRecord, CartItem, Category, MenuItem, UserProfile, HistoricalOrder, ItemCustomization, UserRole } from './types';
import { useRestaurantData } from './hooks/useFirestore';
import { Loading } from './components/Loading';
import { ErrorView } from './components/Error';
import { normalizeMenuItem } from './lib/catalog';
import { ensureAppUserRecord } from './lib/authBootstrap';
import { canAccessOperationalPath, getRoleHomePath } from './lib/orderRouting';

const APP_PATHS = new Set([
  '/',
  '/menu',
  '/bakery',
  '/orders',
  '/info',
  '/profile',
  '/auth',
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

function buildAccessibleStaffTabs(role: UserRole | undefined, isActive = true): LayoutTab[] {
  if (!isActive) return [];
  const tabs: LayoutTab[] = [];

  if (role === 'admin') {
    tabs.push({ path: '/admin/orders', icon: Shield, label: 'Orders' });
    tabs.push({ path: '/admin/staff', icon: UserCog, label: 'Staff' });
    tabs.push({ path: '/admin/catalog', icon: Layers, label: 'Catalog' });
    tabs.push({ path: '/front/orders', icon: ShoppingBag, label: 'Front' });
    tabs.push({ path: '/bakery-front/orders', icon: Cookie, label: 'Bakery Front' });
    tabs.push({ path: '/kitchen/orders', icon: Utensils, label: 'Kitchen' });
    tabs.push({ path: '/barista/orders', icon: Coffee, label: 'Barista' });
    tabs.push({ path: '/reconciliation', icon: ClipboardCheck, label: 'Reconciliation' });
    return tabs;
  }

  if (role === 'front_service') return [{ path: '/front/orders', icon: ShoppingBag, label: 'Front' }];
  if (role === 'bakery_front_service') return [{ path: '/bakery-front/orders', icon: Cookie, label: 'Bakery Front' }];
  if (role === 'kitchen') return [{ path: '/kitchen/orders', icon: Utensils, label: 'Kitchen' }];
  if (role === 'barista') return [{ path: '/barista/orders', icon: Coffee, label: 'Barista' }];
  if (role === 'bakery_account_reconciliation' || role === 'cafe_account_reconciliation') {
    return [{ path: '/reconciliation', icon: ClipboardCheck, label: 'Reconciliation' }];
  }
  return tabs;
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
  const [wishlist, setWishlist] = useState<MenuItem[]>([]);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: '', phone: '' });
  const [orderHistory, setOrderHistory] = useState<HistoricalOrder[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUserRecord | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [managementViewMode, setManagementViewMode] = useState<'auto' | 'mobile' | 'desktop'>(() => {
    const stored = localStorage.getItem('kuci_management_view_mode');
    if (stored === 'auto' || stored === 'mobile' || stored === 'desktop') return stored;
    return 'auto';
  });

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

    if (savedCart) setCart(sanitizeStoredCart(JSON.parse(savedCart)));
    if (savedWishlist) setWishlist(sanitizeStoredMenuItems(JSON.parse(savedWishlist), 'localStorage wishlist'));
    if (savedPoints) setLoyaltyPoints(parseInt(savedPoints, 10));
    if (savedUser) setUserProfile(JSON.parse(savedUser));
    if (savedHistory) setOrderHistory(sanitizeStoredOrderHistory(JSON.parse(savedHistory)));
  }, []);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('kuci_cart', JSON.stringify(cart));
    localStorage.setItem('kuci_wishlist', JSON.stringify(wishlist));
    localStorage.setItem('kuci_user', JSON.stringify(userProfile));
    localStorage.setItem('kuci_history', JSON.stringify(orderHistory));
    localStorage.setItem('kuci_loyalty_points', loyaltyPoints.toString());
  }, [cart, wishlist, userProfile, orderHistory, loyaltyPoints]);

  useEffect(() => {
    localStorage.setItem('kuci_management_view_mode', managementViewMode);
  }, [managementViewMode]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setAuthLoading(true);
      setUser(u);

      if (!u) {
        setAppUser(null);
        setAuthLoading(false);
        return;
      }

      try {
        const userRecord = await ensureAppUserRecord(u);
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
    const isOperationalPath =
      currentPath.startsWith('/admin/') ||
      currentPath.startsWith('/front/') ||
      currentPath.startsWith('/bakery-front/') ||
      currentPath.startsWith('/kitchen/') ||
      currentPath.startsWith('/barista/') ||
      currentPath.startsWith('/reconciliation');
    if (!isOperationalPath) return;

    if (!canAccessOperationalPath(appUser?.role, currentPath, appUser?.isActive ?? false)) {
      navigate(getRoleHomePath(appUser?.role));
    }
  }, [appUser?.isActive, appUser?.role, authLoading, currentPath]);

  const addToCart = (item: MenuItem, customization?: ItemCustomization) => {
    setCart(prev => {
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
    setCart(prev => prev.map(item => {
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

  const clearCart = () => setCart([]);

  const completeOrder = (order: HistoricalOrder) => {
    const earned = Math.floor(order.total / 100);
    setLoyaltyPoints(prev => prev + earned);
    setOrderHistory(prev => [order, ...prev]);
    clearCart();
  };

  const reorder = (items: CartItem[]) => {
    setCart(items.map(item => ({...item, instanceId: Math.random().toString(36).substr(2, 9)})));
    navigate('/orders');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (authLoading || dataLoading) return <Loading />;
  if (error) return <ErrorView message={error} onRetry={() => window.location.reload()} />;

  const isStaffPath =
    currentPath.startsWith('/admin/') ||
    currentPath.startsWith('/front/') ||
    currentPath.startsWith('/bakery-front/') ||
    currentPath.startsWith('/kitchen/') ||
    currentPath.startsWith('/barista/') ||
    currentPath.startsWith('/reconciliation');
  const accessibleStaffTabs = buildAccessibleStaffTabs(appUser?.role, appUser?.isActive ?? false);
  const customerTabs: LayoutTab[] = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/menu', icon: MenuIcon, label: 'Menu' },
    { path: '/bakery', icon: Cookie, label: 'Bakery' },
    { path: '/orders', icon: ShoppingBag, label: 'Orders', badge: cart.reduce((acc, i) => acc + i.quantity, 0) },
    { path: '/info', icon: Info, label: 'Info' },
    ...(accessibleStaffTabs.length > 0 ? [accessibleStaffTabs[0]] : []),
  ];
  const activeTabs = isStaffPath ? [{ path: '/', icon: Home, label: 'Home' }, ...accessibleStaffTabs] : customerTabs;
  const showManagementViewControls = isStaffPath && !!appUser && appUser.role !== 'user';

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
        />
      );
      case '/bakery': return (
        <BakeryView 
          bakeryCategories={bakeryCategories}
          bakeryItems={bakeryItems}
          addToCart={addToCart}
          menuCategories={categories}
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
          onReorder={reorder}
          onUpdateCustomization={updateCartItemCustomization}
          settings={settings}
          userId={user?.uid ?? null}
        />
      );
      case '/info': return <InfoView settings={settings} />;
      case '/auth': return (
        <CustomerAuthView
          user={user}
          onBack={() => navigate('/')}
          onAuthSuccess={() => navigate('/')}
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

  if (currentPath === '/auth') {
    return renderView();
  }

  return (
    <Layout 
      activePath={currentPath}
      navigate={navigate}
      tabs={activeTabs}
      cartCount={cart.reduce((acc, i) => acc + i.quantity, 0)}
      userPhoto={userProfile.photo}
      user={user}
      appUser={appUser}
      managementViewMode={managementViewMode}
      onManagementViewModeChange={setManagementViewMode}
      showManagementViewControls={showManagementViewControls}
      onOpenSignIn={() => navigate('/auth')}
    >
      {renderView()}
    </Layout>
  );
};

export default App;

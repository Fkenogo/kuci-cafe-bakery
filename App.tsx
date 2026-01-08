
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { HomeView } from './views/HomeView';
import { MenuView } from './views/MenuView';
import { BakeryView } from './views/BakeryView';
import { OrdersView } from './views/OrdersView';
import { InfoView } from './views/InfoView';
import { ProfileView } from './views/ProfileView';
import { CartItem, MenuItem, UserProfile, HistoricalOrder, ItemCustomization } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: '', phone: '' });
  const [orderHistory, setOrderHistory] = useState<HistoricalOrder[]>([]);

  // Load state from localStorage
  useEffect(() => {
    const savedCart = localStorage.getItem('kuci_cart');
    const savedPoints = localStorage.getItem('kuci_loyalty_points');
    const savedUser = localStorage.getItem('kuci_user');
    const savedHistory = localStorage.getItem('kuci_history');

    if (savedCart) setCart(JSON.parse(savedCart));
    if (savedPoints) setLoyaltyPoints(parseInt(savedPoints, 10));
    if (savedUser) setUserProfile(JSON.parse(savedUser));
    if (savedHistory) setOrderHistory(JSON.parse(savedHistory));
  }, []);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('kuci_cart', JSON.stringify(cart));
    localStorage.setItem('kuci_user', JSON.stringify(userProfile));
    localStorage.setItem('kuci_history', JSON.stringify(orderHistory));
    localStorage.setItem('kuci_loyalty_points', loyaltyPoints.toString());
  }, [cart, userProfile, orderHistory, loyaltyPoints]);

  const addToCart = (item: MenuItem, customization?: ItemCustomization) => {
    setCart(prev => {
      // Find if an identical item (same ID and same customization) exists
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
    setActiveTab('orders');
  };

  const renderView = () => {
    switch (activeTab) {
      case 'home': return <HomeView onCategorySelect={(cat) => setActiveTab('menu')} addToCart={addToCart} />;
      case 'menu': return <MenuView addToCart={addToCart} />;
      case 'bakery': return <BakeryView />;
      case 'orders': return (
        <OrdersView 
          cart={cart} 
          updateQuantity={updateQuantity} 
          removeFromCart={(id) => updateQuantity(id, -1)} 
          clearCart={clearCart}
          loyaltyPoints={loyaltyPoints}
          userProfile={userProfile}
          setUserProfile={setUserProfile}
          onOrderComplete={completeOrder}
        />
      );
      case 'info': return <InfoView />;
      case 'profile': return (
        <ProfileView 
          userProfile={userProfile} 
          setUserProfile={setUserProfile} 
          loyaltyPoints={loyaltyPoints}
          orderHistory={orderHistory}
          onReorder={reorder}
        />
      );
      default: return <HomeView onCategorySelect={() => setActiveTab('menu')} addToCart={addToCart} />;
    }
  };

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      cartCount={cart.reduce((acc, i) => acc + i.quantity, 0)}
      userPhoto={userProfile.photo}
    >
      {renderView()}
    </Layout>
  );
};

export default App;

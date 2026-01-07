
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { HomeView } from './views/HomeView';
import { MenuView } from './views/MenuView';
import { BakeryView } from './views/BakeryView';
import { OrdersView } from './views/OrdersView';
import { InfoView } from './views/InfoView';
import { CartItem, MenuItem } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);

  // Load cart and points from localStorage
  useEffect(() => {
    const savedCart = localStorage.getItem('kuci_cart');
    const savedPoints = localStorage.getItem('kuci_loyalty_points');
    if (savedCart) setCart(JSON.parse(savedCart));
    if (savedPoints) setLoyaltyPoints(parseInt(savedPoints, 10));
  }, []);

  // Save cart to localStorage
  useEffect(() => {
    localStorage.setItem('kuci_cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(i => i.id !== itemId));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === itemId) {
        const newQty = Math.max(0, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const clearCart = () => setCart([]);

  const renderView = () => {
    switch (activeTab) {
      case 'home': return <HomeView onCategorySelect={(cat) => { setActiveTab('menu'); /* and scroll to category? */ }} addToCart={addToCart} />;
      case 'menu': return <MenuView addToCart={addToCart} />;
      case 'bakery': return <BakeryView />;
      case 'orders': return (
        <OrdersView 
          cart={cart} 
          updateQuantity={updateQuantity} 
          removeFromCart={removeFromCart} 
          clearCart={clearCart}
          loyaltyPoints={loyaltyPoints}
        />
      );
      case 'info': return <InfoView />;
      default: return <HomeView onCategorySelect={() => setActiveTab('menu')} addToCart={addToCart} />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} cartCount={cart.reduce((acc, i) => acc + i.quantity, 0)}>
      {renderView()}
    </Layout>
  );
};

export default App;

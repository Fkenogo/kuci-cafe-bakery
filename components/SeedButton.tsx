import React, { useState } from 'react';
import { Database, CheckCircle, Loader2 } from 'lucide-react';
import { seedFirestore } from '../lib/seed';

export const SeedButton: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSeed = async () => {
    setLoading(true);
    await seedFirestore();
    setLoading(false);
    setDone(true);
    setTimeout(() => setDone(false), 3000);
  };

  return (
    <button 
      onClick={handleSeed}
      disabled={loading || done}
      className={`fixed bottom-24 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full font-bold shadow-xl transition-all active:scale-95 ${
        done 
          ? 'bg-[var(--color-primary)] text-white' 
          : 'bg-[var(--color-text)] text-white hover:opacity-90'
      } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
    >
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : done ? (
        <CheckCircle className="w-5 h-5" />
      ) : (
        <Database className="w-5 h-5" />
      )}
      {loading ? 'Seeding...' : done ? 'Seeded!' : 'Seed Data'}
    </button>
  );
};

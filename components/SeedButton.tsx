import React, { useState } from 'react';
import { Database, CheckCircle, Loader2, Upload } from 'lucide-react';
import { seedFirestore } from '../lib/seed';
import { importCanonicalMenuFromSource } from '../lib/menuImport';

// ---------------------------------------------------------------------------
// Demo seed button (dev reference data — 10 items)
// ---------------------------------------------------------------------------

export const SeedButton: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultLabel, setResultLabel] = useState<string | null>(null);

  const handleSeed = async () => {
    setLoading(true);
    setError(null);
    setResultLabel(null);
    const result = await seedFirestore();
    setLoading(false);
    if (result.success) {
      setResultLabel(`${result.menuCount} menu docs`);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
      return;
    }
    setError(result.mainError || 'Seed failed');
    setResultLabel(`${result.menuCount} menu docs`);
  };

  return (
    <>
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
        {loading ? 'Seeding...' : done ? `Seeded ${resultLabel || ''}`.trim() : 'Seed Data'}
      </button>
      {error && (
        <div className="fixed bottom-14 right-6 z-50 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700 shadow-lg max-w-[240px]">
          {error}
          {resultLabel ? ` (${resultLabel})` : ''}
        </div>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Canonical menu import button (Kuci Menu.md → Firestore)
// ---------------------------------------------------------------------------

export const ImportMenuButton: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultLabel, setResultLabel] = useState<string | null>(null);

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    setResultLabel(null);

    const result = await importCanonicalMenuFromSource();
    setLoading(false);

    if (result.success) {
      setResultLabel(`${result.items.written} items, ${result.categories.written} cats`);
      setDone(true);
      setTimeout(() => setDone(false), 5000);
      return;
    }

    setError(result.mainError || 'Import failed');
    setResultLabel(`${result.items.written} items written`);
  };

  return (
    <>
      <button
        onClick={handleImport}
        disabled={loading || done}
        className={`fixed bottom-36 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full font-bold shadow-xl transition-all active:scale-95 ${
          done
            ? 'bg-green-600 text-white'
            : 'bg-indigo-700 text-white hover:opacity-90'
        } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : done ? (
          <CheckCircle className="w-5 h-5" />
        ) : (
          <Upload className="w-5 h-5" />
        )}
        {loading
          ? 'Importing...'
          : done
          ? `Imported ${resultLabel || ''}`.trim()
          : 'Import Menu'}
      </button>
      {error && (
        <div className="fixed bottom-28 right-6 z-50 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700 shadow-lg max-w-[240px]">
          {error}
          {resultLabel ? ` (${resultLabel})` : ''}
        </div>
      )}
    </>
  );
};

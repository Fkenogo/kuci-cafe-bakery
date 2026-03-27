import React from 'react';
import { Coffee } from 'lucide-react';

export const Loading: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-[var(--color-bg)] flex flex-col items-center justify-center z-[100]">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)] rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Coffee className="w-6 h-6 text-[var(--color-primary)] animate-pulse" />
        </div>
      </div>
      <p className="mt-4 text-[var(--color-text)] font-medium animate-pulse">Brewing your menu...</p>
    </div>
  );
};

import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export const ErrorView: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => {
  return (
    <div className="fixed inset-0 bg-[var(--color-bg)] flex flex-col items-center justify-center z-[100] p-6 text-center">
      <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-[var(--color-primary)]" />
      </div>
      <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">Oops! Something went wrong.</h2>
      <p className="text-[var(--color-text-muted)] mb-6 max-w-xs mx-auto">{message}</p>
      <button 
        onClick={onRetry}
        className="flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-primary)] text-white font-bold shadow-lg hover:opacity-90 transition-all active:scale-95"
      >
        <RefreshCcw className="w-5 h-5" />
        Try Again
      </button>
    </div>
  );
};

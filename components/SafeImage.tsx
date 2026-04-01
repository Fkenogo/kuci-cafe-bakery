import React, { useMemo, useState } from 'react';
import { ImageOff } from 'lucide-react';

interface SafeImageProps {
  src?: string | null;
  alt: string;
  className: string;
  fallbackLabel?: string;
}

export const SafeImage: React.FC<SafeImageProps> = ({ src, alt, className, fallbackLabel }) => {
  const [failed, setFailed] = useState(false);
  const normalizedSrc = useMemo(() => (typeof src === 'string' ? src.trim() : ''), [src]);
  const showFallback = failed || normalizedSrc.length === 0;

  if (showFallback) {
    return (
      <div className={`${className} bg-[var(--color-bg-secondary)] border border-[var(--color-border)] flex flex-col items-center justify-center text-[var(--color-text-muted)]`}>
        <ImageOff className="w-5 h-5 mb-1 opacity-70" />
        <span className="text-[9px] font-bold uppercase tracking-widest">
          {fallbackLabel || 'No image'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={normalizedSrc}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
};


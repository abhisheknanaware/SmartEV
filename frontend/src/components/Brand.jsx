import React, { useId } from 'react';

// ChargeMate mark: a "C" drawn as a charging ring, with a bolt plugging into its opening,
// on a squircle tile with an aqua → sky → indigo gradient.
export function BrandMark({ className = 'w-8 h-8', glow = true }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 32 32" className={`${className} shrink-0 ${glow ? 'drop-shadow-[0_6px_14px_rgba(31,220,197,0.45)]' : ''}`} aria-hidden="true">
      <defs>
        <linearGradient id={`bg-${id}`} x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5ff5dc" />
          <stop offset="0.55" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#6d7cf7" />
        </linearGradient>
        <linearGradient id={`hl-${id}`} x1="16" y1="1" x2="16" y2="17" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* squircle tile */}
      <path d="M10.5 1h11A9.5 9.5 0 0 1 31 10.5v11a9.5 9.5 0 0 1-9.5 9.5h-11A9.5 9.5 0 0 1 1 21.5v-11A9.5 9.5 0 0 1 10.5 1Z" fill={`url(#bg-${id})`} />
      {/* glass highlight */}
      <path d="M10.5 2h11c4.4 0 7.7 2.6 8.6 6.4C26.4 7.1 21.4 6.5 16 6.5S5.6 7.1 1.9 8.4C2.8 4.6 6.1 2 10.5 2Z" fill={`url(#hl-${id})`} />
      {/* C ring with an opening on the right */}
      <path d="M20.1 22.3A8 8 0 1 1 20.1 9.7" fill="none" stroke="#04121a" strokeWidth="3.6" strokeLinecap="round" />
      {/* bolt plugging into the opening */}
      <path d="M25.7 10.6 21.3 16.9h2.8l-1.2 4.4 4.3-6.3h-2.8l1.3-4.4Z" fill="#04121a" />
    </svg>
  );
}

export function BrandWordmark({ dark = false, className = '' }) {
  return (
    <span className={`font-display text-[17px] tracking-[-0.02em] leading-none ${className}`}>
      <span className={`font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>Charge</span>
      <span className="font-extrabold bg-gradient-to-r from-brand-400 via-sky-400 to-indigo-400 bg-clip-text text-transparent">Mate</span>
    </span>
  );
}

export default function Brand({ dark = false, size = 'w-8 h-8', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark className={size} />
      <BrandWordmark dark={dark} />
    </span>
  );
}

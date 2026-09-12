import React from 'react';

export interface GeminiIconProps {
  className?: string;
  size?: number | string;
  style?: React.CSSProperties;
}

export const GeminiIcon: React.FC<GeminiIconProps> = ({ className = "w-6 h-6", size = 24, style }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      style={{ width: size, height: size, ...style }}
    >
      <defs>
        <radialGradient id="geminiBgGrad" cx="50%" cy="50%" r="65%" fx="30%" fy="30%">
          <stop offset="0%" stopColor="#141E33" />
          <stop offset="100%" stopColor="#070A10" />
        </radialGradient>

        <linearGradient id="geminiScytalePrimary" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00F2FE" />
          <stop offset="60%" stopColor="#00B4D8" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>

        <linearGradient id="geminiCoreRod" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>

        <filter id="geminiNeonGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <rect x="24" y="24" width="464" height="464" rx="104" fill="url(#geminiBgGrad)" stroke="#1E293B" strokeWidth="4" />
      <path d="M120 72 L392 72 M120 440 L392 440" stroke="#1E293B" strokeWidth="2" strokeDasharray="6,6" opacity="0.6" />
      <circle cx="256" cy="256" r="160" fill="none" stroke="#0F172A" strokeWidth="32" opacity="0.7" />

      <g transform="rotate(-25 256 256)">
        <rect x="228" y="96" width="56" height="320" rx="28" fill="url(#geminiCoreRod)" stroke="#334155" strokeWidth="3" />
        <line x1="228" y1="160" x2="284" y2="160" stroke="#00F2FE" strokeWidth="2" opacity="0.4" />
        <line x1="228" y1="256" x2="284" y2="256" stroke="#00F2FE" strokeWidth="2" opacity="0.4" />
        <line x1="228" y1="352" x2="284" y2="352" stroke="#00F2FE" strokeWidth="2" opacity="0.4" />

        <path
          d="M168 152 C168 116, 280 100, 332 144 C364 172, 356 208, 308 224 L196 260"
          fill="none"
          stroke="url(#geminiScytalePrimary)"
          strokeWidth="36"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#geminiNeonGlow)"
        />

        <path
          d="M316 252 L204 288 C156 304, 148 340, 180 368 C232 412, 344 396, 344 360"
          fill="none"
          stroke="url(#geminiScytalePrimary)"
          strokeWidth="36"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#geminiNeonGlow)"
        />

        <path d="M212 256 L300 256" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" opacity="0.9" />
        <circle cx="168" cy="152" r="10" fill="#FFFFFF" />
        <circle cx="344" cy="360" r="10" fill="#10B981" />
      </g>
    </svg>
  );
};

export default GeminiIcon;

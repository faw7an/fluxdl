import React from "react";

interface FluxLogoProps {
  className?: string;
  showGlow?: boolean;
}

/**
 * FluxLogo — High-fidelity brand mark for FluxDL.
 * Features built-in gradients and neon glow filters for visual parity with app icons.
 */
export const FluxLogo: React.FC<FluxLogoProps> = ({ className, showGlow = true }) => {
  const filterId = React.useId();
  const gradientId = React.useId();

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      className={className}
    >
      <defs>
        {/* Core Brand Gradient: Indigo to Royal Blue */}
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>

        {/* Neon Glow Filter */}
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <g fill="none" stroke={`url(#${gradientId})`} strokeWidth="24" strokeLinecap="round" strokeLinejoin="round">
        {/* Shadow/Glow layer */}
        {showGlow && (
          <g filter={`url(#${filterId})`} opacity="0.5">
            <path d="M 76 128 L 76 96 A 52 52 0 0 1 180 96 L 180 128" />
            <path d="M 76 160 L 128 212 L 180 160" />
          </g>
        )}

        {/* Solid layer */}
        <path d="M 76 128 L 76 96 A 52 52 0 0 1 180 96 L 180 128" />
        <path d="M 76 160 L 128 212 L 180 160" />
      </g>
    </svg>
  );
};

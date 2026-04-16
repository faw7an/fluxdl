import React from "react";

interface FluxLogoProps {
  className?: string;
}

/**
 * FluxLogo — The official stencilled mark for FluxDL.
 * Represents multi-threaded, segmented data streams.
 */
export const FluxLogo: React.FC<FluxLogoProps> = ({ className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="24"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Flux Loop (Top) */}
      <path d="M 76 128 L 76 96 A 52 52 0 0 1 180 96 L 180 128" />
      {/* Down Arrow (Bottom) */}
      <path d="M 76 160 L 128 212 L 180 160" />
    </svg>
  );
};

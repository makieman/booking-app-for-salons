import React from 'react';

/**
 * BrandAppLoader: A luxury, ultra-smooth loading animation matching the PWA initial splash
 * and brand design system. Displays a hypnotic concentric orbital dual-ring spinner with
 * radiant rose glow and breathing pulse.
 */
export const BrandAppLoader: React.FC = () => {
  return (
    <div
      className="fixed inset-0 min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-[#FAF8F5] select-none z-[99999]"
      role="status"
      aria-label="Loading Flo Sisterlocks"
    >
      <div className="relative flex flex-col items-center justify-center">
        {/* Soft Ambient Radial Glow */}
        <div className="loader-ambient-glow" />

        {/* Concentric Dual-Ring Orbital Spinner */}
        <div className="loader-ring-wrapper">
          <div className="loader-orbital-ring" />
          <div className="loader-inner-ring" />
          <div className="loader-center-spark" />
        </div>

        {/* Elegant pulsing micro-line */}
        <div className="loader-brand-line" />
      </div>
    </div>
  );
};

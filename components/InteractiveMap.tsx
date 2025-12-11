import React from 'react';
import { motion } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import MapMarker from './MapMarker';
import type { Location } from '../types';

interface InteractiveMapProps {
  locations: Location[];
  selectedLocationId: string | null;
  currentLocationId: string;
  onSelectLocation: (location: Location) => void;
  onClearSelection: () => void;
  onViewDetails: (location: Location) => void;
}

const InteractiveMap: React.FC<InteractiveMapProps> = ({
  locations,
  selectedLocationId,
  currentLocationId,
  onSelectLocation,
  onClearSelection,
  onViewDetails,
}) => {
  return (
    <div className="relative h-full w-full bg-slate-950 overflow-hidden rounded-3xl border border-white/5 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
      <TransformWrapper
        minScale={0.5}
        maxScale={4}
        initialScale={1}
        doubleClick={{ disabled: true }}
        limitToBounds
        wheel={{ step: 0.2, activationKeys: ['Control'] }}
        panning={{ velocityDisabled: true }}
      >
        {() => (
          <TransformComponent wrapperClass="h-full w-full" contentClass="h-full w-full">
            <div
              className="relative h-full min-h-[720px] w-full bg-slate-900 overflow-hidden"
              onClick={onClearSelection}
            >
              {/* Base Texture */}
              <img
                src="https://images.unsplash.com/photo-1624321614741-6535561a38a3?q=80&w=2070&auto=format&fit=crop"
                alt="Map Texture"
                className="absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-overlay grayscale"
              />

              {/* Grid Overlay */}
              <svg className="absolute inset-0 h-full w-full opacity-15" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                    <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-cyan-600" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>

              {/* Topographic Motion */}
              <svg className="absolute inset-0 h-full w-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                <motion.path
                  d="M0,100 Q400,300 800,100 T1600,100"
                  fill="none"
                  stroke="white"
                  strokeWidth="1.5"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.5 }}
                  transition={{ duration: 4, ease: 'easeInOut' }}
                />
                <motion.circle
                  cx="80%"
                  cy="30%"
                  r="200"
                  stroke="white"
                  strokeWidth="0.5"
                  fill="none"
                  initial={{ scale: 0.9, opacity: 0.1 }}
                  animate={{ scale: 1.1, opacity: 0.3 }}
                  transition={{ duration: 8, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
                />
              </svg>

              {/* Fog Layer */}
              <motion.div
                className="absolute inset-0 opacity-40"
                style={{
                  background: 'radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0), rgba(2, 6, 23, 0.9))',
                }}
                animate={{ opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Texture */}
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay"></div>

              {/* Markers */}
              <div className="absolute inset-0" onClick={(e) => e.stopPropagation()}>
                {locations.map((loc) => (
                  <MapMarker
                    key={loc.id}
                    location={loc}
                    isSelected={selectedLocationId === loc.id}
                    isCurrent={currentLocationId === loc.id}
                    onClick={onSelectLocation}
                    onViewDetails={(location) => onViewDetails(location)}
                  />
                ))}
              </div>
            </div>
          </TransformComponent>
        )}
      </TransformWrapper>

      {/* Overlay and hint */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900/50 via-transparent to-slate-950/90" />
      <div className="pointer-events-none absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-denim-3.png')] opacity-30 mix-blend-overlay" />
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-white/5 bg-black/50 px-3 py-2 text-xs text-slate-200 backdrop-blur">
        拖拽平移，按住 Ctrl + 滚轮缩放
      </div>
    </div>
  );
};

export default InteractiveMap;

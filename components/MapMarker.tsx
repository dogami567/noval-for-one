import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Castle, Mountain, Trees, Lock, Navigation } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Location } from '../types';

interface MapMarkerProps {
  location: Location;
  isSelected: boolean;
  isCurrent: boolean;
  onClick: (location: Location) => void;
  onViewDetails?: (location: Location) => void;
}

const MapMarker: React.FC<MapMarkerProps> = ({ location, isSelected, isCurrent, onClick, onViewDetails }) => {
  const isLocked = location.status === 'locked';

  // Determine icon based on type and status
  const getIcon = () => {
    if (isLocked) return <Lock size={16} />;
    switch (location.type) {
      case 'city': return <Castle size={20} />;
      case 'nature': return <Trees size={20} />;
      case 'ruin': return <Mountain size={20} />;
      case 'mystic': return <MapPin size={20} />;
      default: return <MapPin size={20} />;
    }
  };

  // Color Schemes
  // Current: Amber/Gold
  // Unlocked: Cyan
  // Locked: Slate/Gray
  let mainColor = 'text-cyan-300';
  let bgColor = 'bg-cyan-900/80 border-cyan-500';
  let pulseColor = 'border-cyan-400';
  let glowColor = 'bg-cyan-500/30';

  if (isLocked) {
    mainColor = 'text-slate-400';
    bgColor = 'bg-slate-800/90 border-slate-600';
    pulseColor = 'border-slate-600'; // Minimal pulsing
    glowColor = 'bg-slate-500/10';
  } else if (isCurrent) {
    mainColor = 'text-amber-300';
    bgColor = 'bg-amber-900/90 border-amber-500';
    pulseColor = 'border-amber-400';
    glowColor = 'bg-amber-500/40';
  } else if (isSelected) {
     // Selected but not current (target?)
     mainColor = 'text-white';
     bgColor = 'bg-cyan-700/90 border-white';
     pulseColor = 'border-white';
     glowColor = 'bg-cyan-400/50';
  }

  return (
    <div 
      className="absolute z-10 cursor-pointer group"
      style={{ left: `${location.x}%`, top: `${location.y}%` }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(location);
      }}
    >
      <div className="relative -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-20 h-20">
        
        {/* CURRENT LOCATION INDICATOR (Rotating Ring) */}
        {isCurrent && (
            <motion.div
                className="absolute inset-0 rounded-full border border-dashed border-amber-500/60"
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                style={{ width: '140%', height: '140%', left: '-20%', top: '-20%' }}
            />
        )}

        {/* PULSING RING (Smooth Animation) */}
        {!isLocked && (
          <motion.div
            className={`absolute inset-0 rounded-full border ${pulseColor}`}
            initial={{ scale: 0.8, opacity: 0.8 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ 
              duration: 3, 
              repeat: Infinity, 
              repeatType: "loop", 
              ease: "easeOut" 
            }}
          />
        )}

        {/* STATIC GLOW */}
        <div className={`absolute w-12 h-12 rounded-full blur-md transition-colors duration-500 ${glowColor}`}></div>

        {/* CORE MARKER */}
        <motion.div
          className={twMerge(
            'relative z-20 w-12 h-12 rounded-full border-2 flex items-center justify-center backdrop-blur-md transition-colors duration-300 shadow-lg',
            bgColor,
            mainColor
          )}
          whileHover={!isLocked ? { scale: 1.15 } : { scale: 1.05 }}
          whileTap={!isLocked ? { scale: 0.95 } : {}}
          layoutId={`marker-${location.id}`}
        >
          {getIcon()}
          
          {/* Current Location Badge Icon overlay */}
          {isCurrent && (
             <div className="absolute -bottom-1 -right-1 bg-amber-500 text-black rounded-full p-0.5 border border-black">
                <Navigation size={8} className="rotate-45" />
             </div>
          )}
        </motion.div>

        {/* HOVER LABEL / YOU ARE HERE LABEL */}
        {isSelected ? (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-56 pointer-events-auto z-30">
            <div className="rounded-xl border border-amber-500/30 bg-slate-950/95 px-4 py-3 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="fantasy-font text-sm text-white">{location.name}</span>
                <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">{location.type}</span>
              </div>
              <p className="text-xs text-slate-300 leading-5 mb-3">{location.description}</p>
              <div className="flex items-center justify-between">
                {isCurrent ? (
                  <span className="text-[10px] uppercase tracking-[0.25em] text-amber-400">You are here</span>
                ) : (
                  <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Selected</span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDetails?.(location);
                  }}
                  className={twMerge(
                    'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                    clsx({
                      'bg-amber-500 text-black hover:bg-amber-400': !isLocked,
                      'bg-slate-700 text-slate-300 cursor-not-allowed': isLocked,
                    })
                  )}
                  disabled={isLocked}
                >
                  View Details
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={twMerge(
              'absolute top-16 left-1/2 -translate-x-1/2 whitespace-nowrap z-30 flex flex-col items-center gap-1 transition-opacity duration-300 pointer-events-none',
              isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
          >
            {isCurrent && (
              <span className="text-[10px] font-bold text-amber-400 tracking-widest uppercase animate-pulse">
                Current Location
              </span>
            )}
            <div
              className={twMerge(
                'px-3 py-1.5 rounded border backdrop-blur-md shadow-xl text-xs fantasy-font tracking-wide',
                isLocked ? 'bg-slate-900/90 text-slate-400 border-slate-700' : 'bg-black/90 text-white border-amber-500/30'
              )}
            >
              {location.name} {isLocked && '(Locked)'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapMarker;
